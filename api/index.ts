/**
 * api/index.ts — Vercel Serverless Entry Point (self-contained)
 * All logic inlined so @vercel/node compiles this single file.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { Innertube, Log, Platform, type Types } from "youtubei.js";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";


// ─── Silence ALL youtubei.js logs ──────────────────────────────────────────────
// Per docs: https://ytjs.dev/guide/troubleshooting.html
Log.setLevel(Log.Level.NONE);

// ─── Enable stream URL decipher in Node.js / Vercel serverless ─────────────────
// youtubei.js needs a JS interpreter to decipher stream URLs.
// Per docs: https://ytjs.dev/guide/getting-started.html#providing-a-custom-javascript-interpreter
Platform.shim.eval = async (
  data: Types.BuildScriptResult,
  env: Record<string, Types.VMPrimative>
) => {
  const props: string[] = [];
  if (env.n)   props.push(`n: exportedVars.nFunction("${env.n}")`);
  if (env.sig) props.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code = `${data.output}\nreturn { ${props.join(", ")} }`;
  // eslint-disable-next-line no-new-func
  return new Function(code)();
};

// ─── ENV ──────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "ttube-secret-change-in-prod";
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "ttube",
  waitForConnections: true,
  connectionLimit: 5,
  timezone: "+00:00",
};


// ─── Cookie encryption (AES-256-GCM) ─────────────────────────────────────────
// Cookies contain session tokens — encrypt at rest in the DB.
const COOKIE_KEY = Buffer.from(
  (process.env.COOKIE_ENC_KEY || JWT_SECRET).slice(0, 32).padEnd(32, "0")
);
function encryptCookie(plain: string): string {
  const iv  = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", COOKIE_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), enc.toString("hex"), tag.toString("hex")].join(".");
}
function decryptCookie(stored: string): string | null {
  try {
    const [ivHex, encHex, tagHex] = stored.split(".");
    if (!ivHex || !encHex || !tagHex) return null;
    const decipher = createDecipheriv("aes-256-gcm", COOKIE_KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch { return null; }
}

// ─── MySQL pool (lazy-init) ───────────────────────────────────────────────────
let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) pool = mysql.createPool(DB_CONFIG);
  return pool;
}

async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

async function initDB() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await query(`CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      video_id VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      channel_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_video (user_id, video_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await query(`CREATE TABLE IF NOT EXISTS history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      video_id VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      channel_name VARCHAR(255),
      watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_video (user_id, video_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await query(`CREATE TABLE IF NOT EXISTS settings (
      user_id INT PRIMARY KEY,
      custom_proxy TEXT,
      proxy_enabled TINYINT(1) DEFAULT 1,
      user_keywords JSON,
      language VARCHAR(10) DEFAULT 'en',
      yt_cookie TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT,
      auth TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    console.log("[db] tables ready");
  } catch (err) {
    console.error("[db] init failed:", err);
  }
}

initDB();

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function signToken(userId: number, username: string) {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token: string): { userId: number; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ message: "Invalid token" });
  (req as any).user = payload;
  next();
}

function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = verifyToken(auth.slice(7));
    if (payload) (req as any).user = payload;
  }
  next();
}

// ─── Proxy Pool ───────────────────────────────────────────────────────────────
const PROXYSCRAPE_URL =
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text";

let rawProxyPool: string[] = [];
let rawFetchedAt = 0;
let validatedProxies: string[] = [];
let validationRunning = false;

async function testProxy(proxyUrl: string): Promise<boolean> {
  try {
    const dispatcher = new ProxyAgent({ uri: proxyUrl, connectTimeout: 6000, headersTimeout: 6000 });
    const res = await (undiciFetch as any)("https://www.youtube.com/favicon.ico", {
      method: "HEAD", dispatcher, signal: AbortSignal.timeout(6000),
    });
    return (res as any).status < 500;
  } catch { return false; }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function buildValidatedPool(candidates: string[]) {
  if (validationRunning) return;
  validationRunning = true;
  const shuffled = shuffle([...candidates]);
  const newValid: string[] = [];
  for (let i = 0; i < shuffled.length && newValid.length < 8; i += 15) {
    const batch = shuffled.slice(i, i + 15);
    const results = await Promise.all(batch.map(async (p) => ({ p, ok: await testProxy(p) })));
    for (const { p, ok } of results) { if (ok) { newValid.push(p); if (newValid.length >= 8) break; } }
  }
  validatedProxies = newValid;
  validationRunning = false;
  console.log(`[proxy] ${validatedProxies.length} validated`);
}

async function fetchRawProxies() {
  try {
    const res = await fetch(PROXYSCRAPE_URL, { signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    const list = text.split("\n").map(p => p.trim()).filter(p => p.startsWith("http://") || p.startsWith("https://"));
    if (list.length > 0) { rawProxyPool = list; rawFetchedAt = Date.now(); buildValidatedPool(list).catch(console.error); }
  } catch (e) { console.error("[proxy] fetch failed:", e); }
}

function getWorkingProxy(): string | null {
  return validatedProxies.length ? validatedProxies[Math.floor(Math.random() * validatedProxies.length)] : null;
}

function evictProxy(p: string) {
  validatedProxies = validatedProxies.filter(x => x !== p);
  if (validatedProxies.length < 3 && !validationRunning && rawProxyPool.length) buildValidatedPool(rawProxyPool).catch(console.error);
}

fetchRawProxies().catch(console.error);
setInterval(() => fetchRawProxies().catch(console.error), 10 * 60 * 1000);

// ─── Proxy fetch for youtubei.js ──────────────────────────────────────────────
function makeProxyFetch(proxyUrl: string) {
  const dispatcher = new ProxyAgent({ uri: proxyUrl, connectTimeout: 10000, headersTimeout: 15000 });
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string;
    let mergedInit: any = { ...(init ?? {}) };
    if (typeof input === "string") { url = input; }
    else if (input instanceof URL) { url = input.toString(); }
    else {
      url = input.url;
      mergedInit = { method: input.method, headers: Object.fromEntries((input.headers as any).entries?.() ?? []), body: ["GET","HEAD"].includes(input.method) ? undefined : input.body, ...init };
    }
    return (undiciFetch as any)(url, { ...mergedInit, dispatcher }) as Promise<Response>;
  };
}

// ─── Innertube ────────────────────────────────────────────────────────────────
let youtube: Innertube | null = null;
let youtubeProxy: string | null = null;
let youtubeCreatedAt = 0;

async function getYoutube(): Promise<Innertube> {
  if (youtube && Date.now() - youtubeCreatedAt < 30 * 60 * 1000) return youtube;
  const proxyUrl = getWorkingProxy();
  const options: any = { generate_session_locally: true };
  if (proxyUrl) { options.fetch = makeProxyFetch(proxyUrl); console.log("[innertube] proxy:", proxyUrl); }
  youtube = await Promise.race([
    Innertube.create(options),
    new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 20000)),
  ]);
  youtubeProxy = proxyUrl;
  youtubeCreatedAt = Date.now();
  return youtube;
}


// ─── Innertube with optional YouTube cookie ──────────────────────────────────
// Returns an Innertube instance authenticated with the user's YT cookie if set.
async function getYoutubeForUser(userId?: number): Promise<Innertube> {
  if (!userId) return getYoutube();
  try {
    const rows = await query<any>("SELECT yt_cookie FROM settings WHERE user_id=?", [userId]);
    const enc = rows[0]?.yt_cookie;
    if (!enc) return getYoutube();
    const cookie = decryptCookie(enc);
    if (!cookie) return getYoutube();
    const proxyUrl = getWorkingProxy();
    const options: any = { cookie, generate_session_locally: true };
    if (proxyUrl) options.fetch = makeProxyFetch(proxyUrl);
    return await Promise.race([
      Innertube.create(options),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 20000)),
    ]);
  } catch { return getYoutube(); }
}

function invalidateSession(reason?: string) {
  if (reason) console.log("[innertube] invalidate:", reason);
  if (youtubeProxy) evictProxy(youtubeProxy);
  youtube = null; youtubeProxy = null; youtubeCreatedAt = 0;
}

// ─── Stream cache ─────────────────────────────────────────────────────────────
const streamCache = new Map<string, { url: string; expires: number }>();

async function getStreamUrl(videoId: string): Promise<string> {
  const cached = streamCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.url;

  let rawUrl: string | null = null;

  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(videoId);

    // Build candidate list: combined (video+audio) formats first, then adaptive
    const sdFormats: any[] = info.streaming_data?.formats ?? [];
    const adFormats: any[] = info.streaming_data?.adaptive_formats ?? [];
    let allFormats: any[] = [...sdFormats, ...adFormats];

    // Prefer best combined format; fall back to any format
    let preferred: any = null;
    try { preferred = info.chooseFormat({ type: "video+audio", quality: "best" }); } catch {}
    const candidates: any[] = preferred
      ? [preferred, ...allFormats.filter(f => f !== preferred)]
      : allFormats;

    for (const fmt of candidates) {
      if (!fmt) continue;
      // 1. Direct URL — always works, no player JS required
      if (fmt.url && typeof fmt.url === "string" && fmt.url.startsWith("http")) {
        rawUrl = fmt.url;
        console.log("[stream] direct URL");
        break;
      }
      // 2. Decipher — needs player JS (may fail on Vercel if YT changed obfuscation)
      if (yt.session.player) {
        try {
          const dec = await fmt.decipher(yt.session.player);
          if (dec) { rawUrl = String(dec); console.log("[stream] deciphered"); break; }
        } catch { /* format failed, try next */ }
      }
    }
  } catch (inner: any) {
    // Any unexpected error (chooseFormat throws, getInfo fails, etc.)
    // Don't invalidate session — video info/search still works fine.
    console.log("[stream] error getting URL:", inner.message);
    throw new Error("NO_STREAM_URL");
  }

  if (!rawUrl) {
    console.log("[stream] no URL found — using embed fallback");
    throw new Error("NO_STREAM_URL");
  }

  const proxied = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
  streamCache.set(videoId, { url: proxied, expires: Date.now() + 30 * 60 * 1000 });
  if (streamCache.size > 50) { const k = streamCache.keys().next().value; if (k) streamCache.delete(k); }
  return proxied;
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Auth ──────────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(6),
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = registerSchema.parse(req.body);
    const exists = await query("SELECT id FROM users WHERE username=? OR email=?", [username, email]);
    if (exists.length) return res.status(400).json({ message: "Username or email already taken" });
    const hash = await bcrypt.hash(password, 10);
    const [result]: any = await getPool().execute(
      "INSERT INTO users (username, email, password_hash) VALUES (?,?,?)", [username, email, hash]
    );
    const userId = result.insertId;
    await query("INSERT INTO settings (user_id) VALUES (?)", [userId]);
    const token = signToken(userId, username);
    res.status(201).json({ token, user: { id: userId, username, email } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { login, password } = z.object({ login: z.string(), password: z.string() }).parse(req.body);
    const users = await query<any>("SELECT * FROM users WHERE username=? OR email=?", [login, login]);
    if (!users.length) return res.status(401).json({ message: "Invalid credentials" });
    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });
    const token = signToken(user.id, user.username);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const { userId } = (req as any).user;
  const users = await query<any>("SELECT id, username, email, created_at FROM users WHERE id=?", [userId]);
  if (!users.length) return res.status(404).json({ message: "User not found" });
  res.json(users[0]);
});

// Legacy endpoint expected by some frontend hooks
app.get("/api/auth/user", optionalAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  const users = await query<any>("SELECT id, username, email FROM users WHERE id=?", [user.userId]);
  if (!users.length) return res.status(401).json({ message: "Unauthorized" });
  res.json(users[0]);
});

// ── Proxy pass-through ────────────────────────────────────────────────────────
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).send("Missing url");
  try {
    const hdrs: Record<string,string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" };
    if (req.headers.range) hdrs.range = req.headers.range as string;
    let fetchResponse: any = null;
    const px = getWorkingProxy();
    if (px) {
      try { fetchResponse = await (undiciFetch as any)(targetUrl, { headers: hdrs, dispatcher: new ProxyAgent({ uri: px }), signal: AbortSignal.timeout(15000) }); }
      catch { evictProxy(px); fetchResponse = null; }
    }
    if (!fetchResponse) fetchResponse = await fetch(targetUrl, { headers: hdrs, signal: AbortSignal.timeout(15000) });
    res.status(fetchResponse.status);
    for (const h of ["content-type","content-length","content-range","accept-ranges","last-modified","etag"]) {
      const v = fetchResponse.headers.get(h); if (v) res.setHeader(h, v);
    }
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("cache-control", "public, max-age=3600");
    if (fetchResponse.body) {
      const reader = fetchResponse.body.getReader();
      const pump = async () => { try { while (true) { const {done,value} = await reader.read(); if(done){res.end();break;} if(!res.write(Buffer.from(value))) await new Promise(r=>res.once("drain",r)); } } catch { res.destroy(); } };
      pump();
    } else res.end();
  } catch (err: any) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

// ── Proxy list ────────────────────────────────────────────────────────────────
app.get("/api/proxies", (_req, res) => {
  res.json({ proxies: rawProxyPool, validated: validatedProxies, fetchedAt: rawFetchedAt, total: rawProxyPool.length, validatedCount: validatedProxies.length });
});
app.post("/api/proxies/refresh", async (_req, res) => {
  rawProxyPool=[]; rawFetchedAt=0; validatedProxies=[];
  await fetchRawProxies();
  res.json({ proxies: rawProxyPool, validated: validatedProxies, fetchedAt: rawFetchedAt, total: rawProxyPool.length, validatedCount: validatedProxies.length });
});

// ── YouTube: search ───────────────────────────────────────────────────────────
app.get("/api/yt/search", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ message: "Missing query" });
    const yt = await getYoutube();
    const results = await yt.search(q);
    res.json(results.videos.map((v:any)=>({
      id: v.id,
      title: v.title?.text || v.title?.content || v.title || "",
      thumbnail: v.best_thumbnail?.url || v.thumbnails?.[0]?.url || "",
      channelTitle: v.author?.name || v.short_byline_text?.runs?.[0]?.text || "",
      channelId: v.author?.id || v.short_byline_text?.runs?.[0]?.endpoint?.browse_endpoint?.browse_id || "",
      viewCount: v.view_count?.text || v.short_view_count_text?.text || "",
      publishedTime: v.published?.text || v.publish_date_text?.text || "",
      lengthSeconds: String(v.duration?.seconds || 0),
      isShort: !!v.is_short,
    })).filter((i:any)=>i.id&&i.title));
  } catch (err:any) { console.error("Search:",err.message); invalidateSession(err.message); res.status(500).json({ message:"Search failed" }); }
});


// ── DEBUG: inspect raw youtubei.js data (remove in production) ───────────────
app.get("/api/yt/debug/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(req.params.id);
    const safe = (obj: any) => {
      try { return JSON.parse(JSON.stringify(obj)); } catch { return String(obj); }
    };
    res.json({
      basic_info: safe(info.basic_info),
      primary_info: safe((info as any).primary_info),
      secondary_info: safe((info as any).secondary_info),
      streaming_data_keys: Object.keys((info as any).streaming_data ?? {}),
      formats_count: (info.streaming_data?.formats?.length ?? 0) + (info.streaming_data?.adaptive_formats?.length ?? 0),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── YouTube: video info ───────────────────────────────────────────────────────
// Field paths verified from /api/yt/debug/:id output (youtubei.js v17):
//   Channel name    → secondary_info.owner.author.name
//   Channel ID      → secondary_info.owner.author.id
//   Channel thumb   → secondary_info.owner.author.thumbnails[0].url
//   Subscriber cnt  → secondary_info.owner.subscriber_count.text
//   View count      → primary_info.view_count.view_count.text
//   Title           → primary_info.title.text
//   Published       → primary_info.published.text
//   Description     → secondary_info.description.text
//   Thumbnail       → basic_info.thumbnail[0].url
//   Like count      → basic_info.like_count
app.get("/api/yt/video/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(req.params.id);
    const bi  = info.basic_info as any;
    const pi  = (info as any).primary_info  ?? {};
    const si  = (info as any).secondary_info ?? {};

    // ── Channel (from secondary_info.owner.author) ──────────────────────────
    const author = si.owner?.author ?? {};
    const channelTitle    = author.name || bi.channel?.name || bi.author || "";
    const channelId       = author.id   || bi.channel_id   || bi.channel?.id || "";
    // Use largest thumbnail available (first item = largest in v17)
    const channelThumbnail = author.thumbnails?.[0]?.url || "";

    // ── Subscriber count (secondary_info.owner.subscriber_count.text) ───────
    const subscriberCount = si.owner?.subscriber_count?.text || "";

    // ── Title (primary_info.title.text, fallback basic_info.title) ──────────
    const title = pi.title?.text || bi.title || "";

    // ── Description (secondary_info.description.text) ────────────────────────
    const description = si.description?.text || bi.short_description || bi.description || "";

    // ── Thumbnail (basic_info.thumbnail) ─────────────────────────────────────
    const thumbnail = bi.thumbnail?.[0]?.url || bi.thumbnails?.[0]?.url || "";

    // ── View count (primary_info.view_count.view_count.text) ─────────────────
    const viewCount =
      pi.view_count?.view_count?.text ||          // "13,630 views"
      pi.view_count?.short_view_count?.text ||    // "13K views"
      (() => {
        const n = Number(bi.view_count);
        return bi.view_count != null && !isNaN(n)
          ? `${n.toLocaleString()} views`
          : "";
      })();

    // ── Published date (primary_info.published.text) ──────────────────────────
    const publishedTime =
      pi.published?.text ||        // "Mar 21, 2026"
      pi.relative_date?.text ||    // "1 day ago"
      bi.publish_date || "";

    // ── Like count (basic_info.like_count) ────────────────────────────────────
    const likeCount = bi.like_count != null ? String(bi.like_count) : "0";

    res.json({
      id: bi.id || req.params.id,
      title,
      description,
      thumbnail,
      channelId,
      channelTitle,
      channelThumbnail,
      subscriberCount,
      viewCount,
      likeCount,
      publishedTime,
    });
  } catch (err: any) {
    console.error("Video:", err.message);
    invalidateSession(err.message);
    res.status(404).json({ message: "Video not found" });
  }
});

// ── YouTube: subtitles ────────────────────────────────────────────────────────
app.get("/api/yt/video/:id/subtitles", async (req, res) => {
  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(req.params.id);
    if (!info.captions) return res.json([]);
    res.json((info.captions as any).caption_tracks.map((t:any)=>({ label:t.name.text, languageCode:t.language_code, url:`/api/proxy?url=${encodeURIComponent(t.base_url)}`, kind:t.kind })));
  } catch { res.json([]); }
});

// ── YouTube: stream ───────────────────────────────────────────────────────────
app.get("/api/yt/stream/:id", async (req, res) => {
  try {
    res.redirect(302, await getStreamUrl(req.params.id));
  } catch (err: any) {
    if (err.message === "NO_STREAM_URL") return res.status(204).end();
    invalidateSession(err.message);
    if (!res.headersSent) res.status(500).json({ message: "Stream failed" });
  }
});

// ── YouTube: comments ─────────────────────────────────────────────────────────
app.get("/api/yt/comments/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const comments = await yt.getComments(req.params.id);
    res.json(comments.contents.map((c:any)=>{ try { return { id:c.comment_id||String(Math.random()), author:c.author?.name||"Unknown", authorThumbnail:c.author?.thumbnails?.[0]?.url||"", text:c.content?.text||"", publishedTime:c.published?.text||"", likeCount:c.vote_count?.text||"0", replyCount:c.reply_count||0 }; } catch { return null; } }).filter(Boolean));
  } catch { res.json([]); }
});

// ── YouTube: channel ──────────────────────────────────────────────────────────
app.get("/api/yt/channel/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const ch = await yt.getChannel(req.params.id);
    const c = ch as any;
    const m = c.metadata ?? {};
    const h = c.header   ?? {};

    // Thumbnail: try avatar (v17) → thumbnail (v16) → header
    const thumbnail =
      m.avatar?.[0]?.url ||
      m.thumbnail?.[0]?.url ||
      h.avatar?.thumbnails?.[0]?.url ||
      h.thumbnail?.thumbnails?.[0]?.url ||
      c.thumbnail?.[0]?.url || "";

    // Banner
    const banner =
      h.banner?.thumbnails?.slice(-1)?.[0]?.url ||
      h.banner?.[0]?.url ||
      m.banner?.[0]?.url || "";

    // Subscriber count: metadata.subscribers.text (v16) or header variations
    const subscriberCount =
      m.subscribers?.text ||
      h.subscribers_count_text?.text ||
      h.subscriber_count_text?.text ||
      c.subscriber_count?.text || "";

    res.json({
      id: m.external_id || m.channel_id || c.id || req.params.id,
      title: m.title || m.display_name || c.title || "",
      description: m.description || "",
      thumbnail,
      banner,
      subscriberCount,
    });
  } catch (err: any) {
    console.error("Channel:", err.message);
    res.status(404).json({ message: "Channel not found" });
  }
});

app.get("/api/yt/channel/:id/videos", async (req, res) => {
  try {
    const yt = await getYoutube();
    const ch = await yt.getChannel(req.params.id);
    const videos = await ch.getVideos();
    res.json(videos.videos.map((v:any)=>({ id:v.id, title:v.title?.text||"", thumbnail:v.thumbnails?.[0]?.url||"", channelTitle:ch.metadata.title, channelId:req.params.id, viewCount:v.view_count?.text||"", publishedTime:v.published?.text||"", lengthSeconds:String(v.duration?.seconds||0) })));
  } catch (err:any) { console.error("Channel videos:",err.message); res.json([]); }
});


// ── Helper: map raw InnerTube video node → API response ──────────────────────
function mapVideoNode(v: any, rank = 0): Record<string, any> {
  return {
    id: v.id || v.video_id,
    rank,
    title: v.title?.text || v.title?.content || v.title?.simpleText || v.title || "",
    thumbnail:
      v.best_thumbnail?.url ||
      v.thumbnails?.slice(-1)?.[0]?.url ||
      v.thumbnails?.[0]?.url || "",
    channelTitle:
      v.author?.name ||
      v.short_byline_text?.runs?.[0]?.text ||
      v.owner_text?.runs?.[0]?.text || "",
    channelId: v.author?.id || v.channel_id || "",
    viewCount:
      v.view_count?.text ||
      v.short_view_count_text?.text ||
      v.short_view_count?.text || "",
    publishedTime:
      v.published?.text ||
      v.publish_date_text?.text ||
      v.published_time_text?.text || "",
    lengthSeconds: String(v.duration?.seconds || 0),
    isShort: !!v.is_short,
  };
}

// ── Helper: extract video items from any InnerTube browse response ────────────
function extractVideosFromPage(page: any): any[] {
  const items: any[] = [];
  // Walk through all possible containers
  const tryPaths = [
    page?.contents?.two_column_browse_results_renderer?.tabs,
    page?.contents,
    page?.on_response_received_actions,
    page?.on_response_received_endpoints,
  ];
  // Recursive extractor
  const walk = (node: any, depth = 0): void => {
    if (!node || depth > 10) return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
    if (typeof node !== "object") return;
    // Is this a video item?
    const type = node.type || node.richItemRenderer?.content?.videoRenderer && "Video";
    if (node.id && (node.title || node.video_id)) {
      items.push(node); return;
    }
    // Drill into richItemRenderer / videoRenderer etc.
    if (node.richItemRenderer?.content?.videoRenderer) {
      items.push({ ...node.richItemRenderer.content.videoRenderer }); return;
    }
    if (node.videoRenderer) { items.push(node.videoRenderer); return; }
    // Recurse into children
    for (const key of ["content","contents","items","videos","tab_renderer","tabs","sections","shelf_renderer"]) {
      if (node[key]) walk(node[key], depth + 1);
    }
  };
  walk(page);
  return items.filter(v => v.id || v.video_id);
}

// ── YouTube: home feed ────────────────────────────────────────────────────────
app.get("/api/yt/home", async (_req, res) => {
  try {
    const yt = await getYoutube();
    let videos: any[] = [];

    // Try getHomeFeed() first (v16 API)
    try {
      const feed = await (yt as any).getHomeFeed();
      videos = (feed as any).videos ?? [];
    } catch {
      // v17 fallback: browse FE home
      try {
        const page = await (yt as any).actions.execute("/browse", {
          browseId: "FEwhat_to_watch",
          parse: true,
        });
        videos = extractVideosFromPage(page);
      } catch {}
    }

    res.json(
      videos
        .map((v: any) => mapVideoNode(v))
        .filter((v: any) => v.id && v.title)
        .slice(0, 40)
    );
  } catch (err: any) {
    console.error("Home feed:", err.message);
    res.status(500).json({ message: "Could not load home feed" });
  }
});

// ── YouTube: trending ─────────────────────────────────────────────────────────
// getTrending() was removed in youtubei.js v17.
// We use actions.execute('/browse') with InnerTube browseIds directly.
// browseIds: FEtrending (Now), FEtrending_music, FEtrending_gaming, FEtrending_film
app.get("/api/yt/trending", async (req, res) => {
  try {
    const yt = await getYoutube();
    const category = (req.query.category as string) || "Now";

    const browseIdMap: Record<string, string> = {
      Now:    "FEtrending",
      Music:  "FEtrending_music",
      Gaming: "FEtrending_gaming",
      Movies: "FEtrending_film",
    };
    const browseId = browseIdMap[category] || "FEtrending";

    let raw: any[] = [];

    // Method 1: actions.execute (v17 recommended)
    try {
      const page = await (yt as any).actions.execute("/browse", {
        browseId,
        parse: true,
      });
      raw = extractVideosFromPage(page);
    } catch (e1: any) {
      console.log("[trending] actions.execute failed:", e1.message, "— trying search fallback");
    }

    // Method 2: Search fallback (always works)
    if (raw.length === 0) {
      const searchMap: Record<string, string> = {
        Now:    "trending viral today",
        Music:  "music trending 2025",
        Gaming: "gaming trending 2025",
        Movies: "movies new releases 2025",
      };
      const searchQuery = searchMap[category] || "trending viral today";
      try {
        const results = await yt.search(searchQuery);
        raw = results.videos ?? [];
      } catch (e2: any) {
        console.log("[trending] search fallback failed:", e2.message);
      }
    }

    res.json(
      raw
        .map((v: any, i: number) => mapVideoNode(v, i + 1))
        .filter((v: any) => v.id && v.title)
        .slice(0, 50)
    );
  } catch (err: any) {
    console.error("Trending:", err.message);
    res.status(500).json({ message: "Could not load trending" });
  }
});

// ── YouTube: search suggestions (autocomplete) ────────────────────────────────
app.get("/api/yt/suggestions", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.json([]);
    const yt = await getYoutube();
    const suggestions = await yt.getSearchSuggestions(q);
    res.json(suggestions);
  } catch (err: any) {
    console.error("Suggestions:", err.message);
    res.json([]);
  }
});

// ── YouTube: playlist ─────────────────────────────────────────────────────────
app.get("/api/yt/playlist/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const playlist = await yt.getPlaylist(req.params.id);
    const info = playlist as any;
    const videos = info.videos ?? info.items ?? [];
    res.json({
      id: req.params.id,
      title: info.info?.title || info.header?.title?.text || "",
      description: info.info?.description || "",
      videoCount: info.info?.total_items || videos.length,
      thumbnail: info.info?.thumbnail?.[0]?.url || videos[0]?.thumbnails?.[0]?.url || "",
      channelTitle: info.info?.author?.name || "",
      videos: videos.map((v: any) => ({
        id: v.id,
        title: v.title?.text || v.title || "",
        thumbnail: v.thumbnails?.[0]?.url || "",
        channelTitle: v.author?.name || "",
        channelId: v.author?.id || "",
        lengthSeconds: String(v.duration?.seconds || 0),
      })).filter((v: any) => v.id),
    });
  } catch (err: any) {
    console.error("Playlist:", err.message);
    res.status(404).json({ message: "Playlist not found" });
  }
});


// ── LAN device registry + WebRTC signaling ────────────────────────────────────
// Devices are grouped by their PUBLIC IP (all devices on same LAN share it).
// WebRTC offers/answers/candidates are stored here for P2P signaling.
// Server-relay push is the fallback.

interface LanDevice { name: string; publicIp: string; ts: number; }
interface LanSignal { payload: any; from: string; ts: number; }
interface LanPush   { videoUrl: string; from: string; }

const lanDevices  = new Map<string, LanDevice>();
const lanSignals  = new Map<string, LanSignal>();   // key: `${toId}:${type}`
const lanPending  = new Map<string, LanPush>();

function getPublicIp(req: any): string {
  // x-forwarded-for on Vercel gives real client IP
  const xff = req.headers["x-forwarded-for"] as string || "";
  return (xff.split(",")[0] || req.socket?.remoteAddress || "unknown").trim();
}

function pruneLan() {
  const cutoff = Date.now() - 90_000;
  for (const [k, v] of lanDevices)  { if (v.ts < cutoff) lanDevices.delete(k); }
  for (const [k, v] of lanSignals)  { if (v.ts < cutoff - 30_000) lanSignals.delete(k); }
  for (const [k] of lanPending)     { /* pushed urls self-clear */ }
}
setInterval(pruneLan, 30_000);

app.post("/api/lan/register", (req, res) => {
  const publicIp  = getPublicIp(req);
  const { name, id: existingId } = req.body;
  const deviceName = name || `Device`;

  // Reuse existing ID if provided and still valid
  let id = existingId && lanDevices.has(existingId) ? existingId
    : `${publicIp}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

  lanDevices.set(id, { name: deviceName, publicIp, ts: Date.now() });
  res.json({ id, name: deviceName });
});

app.get("/api/lan/devices", (req, res) => {
  const publicIp = getPublicIp(req);
  const now = Date.now();
  pruneLan();

  // Only return devices sharing the SAME public IP (same network/NAT)
  const list = [...lanDevices.entries()]
    .filter(([, v]) => v.ts > now - 90_000 && v.publicIp === publicIp)
    .map(([id, v]) => ({ id, name: v.name }));

  res.json(list);
});

// ── WebRTC signaling: store offer/answer/candidate ────────────────────────────
app.post("/api/lan/signal", (req, res) => {
  const { from, to, type, payload } = req.body;
  if (!to || !type) return res.status(400).json({ message: "Missing to/type" });
  const key = `${to}:${type}`;
  lanSignals.set(key, { payload: { ...payload, fromId: from }, from: from || "", ts: Date.now() });
  setTimeout(() => lanSignals.delete(key), 60_000);
  res.json({ ok: true });
});

app.get("/api/lan/signal", (req, res) => {
  const { id, type } = req.query as { id: string; type: string };
  if (!id || !type) return res.status(400).json({ message: "Missing id/type" });
  const key = `${id}:${type}`;
  const signal = lanSignals.get(key);
  if (signal) {
    lanSignals.delete(key);          // consume once
    // Update heartbeat for device
    const dev = lanDevices.get(id);
    if (dev) { dev.ts = Date.now(); lanDevices.set(id, dev); }
    return res.json({ payload: signal.payload });
  }
  res.json({ payload: null });
});

// ── Server-relay push (fallback when WebRTC P2P fails) ───────────────────────
app.post("/api/lan/push", (req, res) => {
  const { targetId, videoUrl, fromName } = req.body;
  if (!targetId || !videoUrl) return res.status(400).json({ message: "Missing targetId or videoUrl" });
  lanPending.set(targetId, { videoUrl, from: fromName || "Someone" });
  setTimeout(() => lanPending.delete(targetId), 60_000);
  res.json({ ok: true });
});

app.get("/api/lan/poll/:deviceId", (req, res) => {
  const { deviceId } = req.params;
  const dev = lanDevices.get(deviceId);
  if (dev) { dev.ts = Date.now(); lanDevices.set(deviceId, dev); }
  const pending = lanPending.get(deviceId);
  if (pending) { lanPending.delete(deviceId); return res.json(pending); }
  res.json({ videoUrl: null });
});

// ── Favorites (auth required) ─────────────────────────────────────────────────
app.get("/api/favorites", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  res.json(await query("SELECT * FROM favorites WHERE user_id=? ORDER BY created_at DESC", [userId]));
});

app.get("/api/favorites/:videoId/check", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  const rows = await query<any>("SELECT id FROM favorites WHERE user_id=? AND video_id=?", [userId, req.params.videoId]);
  res.json({ isFavorite: rows.length > 0, id: rows[0]?.id });
});

app.post("/api/favorites", authMiddleware, async (req, res) => {
  try {
    const {userId} = (req as any).user;
    const { videoId, title, thumbnailUrl, channelName } = z.object({ videoId:z.string().min(1), title:z.string().default(""), thumbnailUrl:z.string().nullable().optional(), channelName:z.string().nullable().optional() }).parse(req.body);
    const existing = await query<any>("SELECT id FROM favorites WHERE user_id=? AND video_id=?", [userId, videoId]);
    if (existing.length) return res.json(existing[0]);
    const [r]: any = await getPool().execute("INSERT INTO favorites (user_id,video_id,title,thumbnail_url,channel_name) VALUES (?,?,?,?,?)", [userId, videoId, title, thumbnailUrl||null, channelName||null]);
    res.status(201).json({ id: r.insertId, userId, videoId, title, thumbnailUrl, channelName });
  } catch (err) { if (err instanceof z.ZodError) return res.status(400).json(err.issues); res.status(500).json({ message:"Error" }); }
});

app.delete("/api/favorites/:id", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  await query("DELETE FROM favorites WHERE id=? AND user_id=?", [Number(req.params.id), userId]);
  res.sendStatus(204);
});

// ── History (auth required) ───────────────────────────────────────────────────
app.get("/api/history", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  res.json(await query("SELECT * FROM history WHERE user_id=? ORDER BY watched_at DESC LIMIT 100", [userId]));
});

app.post("/api/history", authMiddleware, async (req, res) => {
  try {
    const {userId} = (req as any).user;
    const { videoId, title, thumbnailUrl, channelName } = z.object({ videoId:z.string().min(1), title:z.string().default(""), thumbnailUrl:z.string().nullable().optional(), channelName:z.string().nullable().optional() }).parse(req.body);
    await getPool().execute("INSERT INTO history (user_id,video_id,title,thumbnail_url,channel_name) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),thumbnail_url=VALUES(thumbnail_url),channel_name=VALUES(channel_name),watched_at=NOW()", [userId, videoId, title, thumbnailUrl||null, channelName||null]);
    res.status(201).json({ ok: true });
  } catch (err) { if (err instanceof z.ZodError) return res.status(400).json(err.issues); res.status(500).json({ message:"Error" }); }
});

app.delete("/api/history/:videoId", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  await query("DELETE FROM history WHERE user_id=? AND video_id=?", [userId, req.params.videoId]);
  res.sendStatus(204);
});

app.delete("/api/history", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  await query("DELETE FROM history WHERE user_id=?", [userId]);
  res.sendStatus(204);
});

// ── Settings (auth required) ──────────────────────────────────────────────────

// ── YouTube cookie (save encrypted / delete) ──────────────────────────────────
app.post("/api/settings/yt-cookie", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { cookie } = z.object({ cookie: z.string().min(10) }).parse(req.body);
    const encrypted = encryptCookie(cookie.trim());
    await getPool().execute(
      "INSERT INTO settings (user_id, yt_cookie) VALUES (?,?) ON DUPLICATE KEY UPDATE yt_cookie=VALUES(yt_cookie)",
      [userId, encrypted]
    );
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid cookie" });
    console.error("Save cookie:", err.message);
    res.status(500).json({ message: "Failed to save cookie" });
  }
});

app.delete("/api/settings/yt-cookie", authMiddleware, async (req, res) => {
  const { userId } = (req as any).user;
  await getPool().execute("UPDATE settings SET yt_cookie=NULL WHERE user_id=?", [userId]);
  res.json({ ok: true });
});

app.get("/api/settings/yt-cookie/status", authMiddleware, async (req, res) => {
  const { userId } = (req as any).user;
  const rows = await query<any>("SELECT yt_cookie IS NOT NULL AS has_cookie FROM settings WHERE user_id=?", [userId]);
  res.json({ hasCookie: !!rows[0]?.has_cookie });
});

// ── YouTube authenticated actions (like, dislike, subscribe, comment) ─────────
// ── YouTube Data API v3 — authenticated interactions ─────────────────────────
// These use the user's OAuth access token (stored as yt_cookie in DB but
// interpreted as an OAuth token for the Data API v3 endpoints).
// Users obtain a token via Google OAuth consent screen and paste it in Settings.

async function ytDataApi(userId: number, path: string, method = "POST", body?: any): Promise<any> {
  const rows = await query<any>("SELECT yt_cookie FROM settings WHERE user_id=?", [userId]);
  const enc = rows[0]?.yt_cookie;
  if (!enc) throw new Error("No YouTube token. Add your OAuth token in Settings.");
  const token = decryptCookie(enc);
  if (!token) throw new Error("Could not decrypt YouTube token.");

  const url = `https://www.googleapis.com/youtube/v3${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return { ok: true };
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.errors?.[0]?.message || err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

// Like a video  (POST /videos/rate?id=<videoId>&rating=like)
app.post("/api/yt/like/:videoId", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    await ytDataApi(userId, `/videos/rate?id=${req.params.videoId}&rating=like`, "POST");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Dislike a video
app.post("/api/yt/dislike/:videoId", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    await ytDataApi(userId, `/videos/rate?id=${req.params.videoId}&rating=dislike`, "POST");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Remove rating (unlike/undislike)
app.delete("/api/yt/like/:videoId", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    await ytDataApi(userId, `/videos/rate?id=${req.params.videoId}&rating=none`, "POST");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Get user's current rating for a video
app.get("/api/yt/like/:videoId/status", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const data = await ytDataApi(userId, `/videos/getRating?id=${req.params.videoId}`, "GET");
    const rating = data?.items?.[0]?.rating || "none"; // "like" | "dislike" | "none"
    res.json({ rating });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Subscribe to a channel
app.post("/api/yt/subscribe/:channelId", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    await ytDataApi(userId, "/subscriptions?part=snippet", "POST", {
      snippet: { resourceId: { kind: "youtube#channel", channelId: req.params.channelId } },
    });
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Unsubscribe — first fetch subscriptionId, then delete
app.delete("/api/yt/subscribe/:channelId", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    // Find the subscriptionId for this channel
    const listData = await ytDataApi(
      userId,
      `/subscriptions?part=id&mine=true&forChannelId=${req.params.channelId}&maxResults=1`,
      "GET"
    );
    const subId = listData?.items?.[0]?.id;
    if (!subId) return res.status(404).json({ message: "Subscription not found" });
    await ytDataApi(userId, `/subscriptions?id=${subId}`, "DELETE");
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Check subscription status
app.get("/api/yt/subscribe/:channelId/status", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const data = await ytDataApi(
      userId,
      `/subscriptions?part=id&mine=true&forChannelId=${req.params.channelId}&maxResults=1`,
      "GET"
    );
    res.json({ subscribed: (data?.items?.length ?? 0) > 0 });
  } catch (err: any) { res.status(500).json({ subscribed: false, message: err.message }); }
});

// Post a comment
app.post("/api/yt/comment/:videoId", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { text } = z.object({ text: z.string().min(1).max(10000) }).parse(req.body);
    const data = await ytDataApi(userId, "/commentThreads?part=snippet", "POST", {
      snippet: {
        videoId: req.params.videoId,
        topLevelComment: { snippet: { textOriginal: text } },
      },
    });
    res.json({ ok: true, commentId: data?.id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Get comments for a video (public, no auth needed)
app.get("/api/yt/comments/v3/:videoId", async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "YOUTUBE_API_KEY not set" });
    const { pageToken, maxResults = "20" } = req.query as any;
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("videoId", req.params.videoId);
    url.searchParams.set("maxResults", maxResults);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("order", "relevance");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url.toString());
    const data = await r.json();
    res.json({
      items: (data.items || []).map((item: any) => ({
        id: item.id,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        authorThumbnail: item.snippet.topLevelComment.snippet.authorProfileImageUrl,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        publishedTime: item.snippet.topLevelComment.snippet.publishedAt,
        likeCount: String(item.snippet.topLevelComment.snippet.likeCount),
        replyCount: item.snippet.totalReplyCount,
      })),
      nextPageToken: data.nextPageToken || null,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Infinite scroll: search with continuation ─────────────────────────────────
app.get("/api/yt/search/more", async (req, res) => {
  try {
    const { token } = req.query as { token: string };
    if (!token) return res.status(400).json({ message: "Missing token" });
    const yt = await getYoutube();
    const results = await (yt as any).actions.execute("/search", {
      continuation: token,
      parse: true,
    });
    const items = (results?.on_response_received_commands?.[0]?.append_continuation_items_action?.continuation_items ?? [])
      .map((v: any) => {
        const vr = v.video_renderer || v;
        return {
          id: vr.video_id || vr.id,
          title: vr.title?.text || vr.title?.runs?.[0]?.text || "",
          thumbnail: vr.thumbnails?.slice(-1)?.[0]?.url || vr.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || "",
          channelTitle: vr.short_byline_text?.runs?.[0]?.text || vr.author?.name || "",
          channelId: vr.author?.id || "",
          viewCount: vr.short_view_count_text?.text || vr.view_count?.text || "",
          publishedTime: vr.published_time_text?.text || vr.published?.text || "",
          lengthSeconds: String(vr.length_text?.text ? vr.length_text.text.split(":").reduce((a: number, v: string, i: number, arr: string[]) => a + parseInt(v) * Math.pow(60, arr.length - 1 - i), 0) : 0),
          isShort: !!vr.is_short,
        };
      }).filter((v: any) => v.id && v.title);

    const nextToken = results?.on_response_received_commands?.[0]?.append_continuation_items_action?.continuation_items?.slice(-1)?.[0]?.continuation_item_renderer?.continuation_endpoint?.continuation_command?.token || null;
    res.json({ items, nextToken });
  } catch (err: any) {
    console.error("Search more:", err.message);
    res.status(500).json({ message: "Failed" });
  }
});

app.get("/api/settings", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  const rows = await query<any>("SELECT custom_proxy,proxy_enabled,user_keywords,language FROM settings WHERE user_id=?", [userId]);
  res.json(rows[0] || {});
});

app.put("/api/settings", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  const { custom_proxy, proxy_enabled, user_keywords, language } = req.body;
  await getPool().execute("INSERT INTO settings (user_id,custom_proxy,proxy_enabled,user_keywords,language) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE custom_proxy=VALUES(custom_proxy),proxy_enabled=VALUES(proxy_enabled),user_keywords=VALUES(user_keywords),language=VALUES(language)", [userId, custom_proxy||null, proxy_enabled!==false?1:0, user_keywords?JSON.stringify(user_keywords):null, language||"en"]);
  res.json({ ok: true });
});

export default app;

// ── Push notification subscriptions ──────────────────────────────────────────
app.post("/api/push/subscribe", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { endpoint, keys } = req.body;
    if (!endpoint) return res.status(400).json({ message: "Missing endpoint" });
    await getPool().execute(
      "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth)",
      [userId, endpoint, keys?.p256dh || null, keys?.auth || null]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/push/unsubscribe", authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { endpoint } = req.body;
    await query("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [userId, endpoint]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

