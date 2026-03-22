/**
 * api/index.ts — Vercel Serverless Entry Point (self-contained)
 * All logic inlined so @vercel/node compiles this single file.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { Innertube } from "youtubei.js";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

  const yt = await getYoutube();
  const info = await yt.getInfo(videoId);

  // Gather all candidate formats (combined first, then adaptive)
  const combined: any[] = info.streaming_data?.formats ?? [];
  const adaptive: any[] = info.streaming_data?.adaptive_formats ?? [];
  const allFormats: any[] = [...combined, ...adaptive];

  // Prefer a video+audio combined format; fall back to any format
  const preferred = info.chooseFormat({ type: "video+audio", quality: "best" });
  const candidates = preferred
    ? [preferred, ...allFormats.filter(f => f !== preferred)]
    : allFormats;

  let rawUrl: string | null = null;

  for (const fmt of candidates) {
    if (!fmt) continue;

    // 1. Direct URL — no player JS needed (works even when decipher fails)
    if (fmt.url) {
      rawUrl = fmt.url;
      console.log("[stream] direct URL found");
      break;
    }

    // 2. Decipher URL — requires player JS
    try {
      const deciphered = await fmt.decipher(yt.session.player);
      if (deciphered) {
        rawUrl = String(deciphered);
        console.log("[stream] deciphered URL");
        break;
      }
    } catch {
      // decipher failed for this format, try next
    }
  }

  if (!rawUrl) {
    // Don't invalidate the whole session — search/info still work fine.
    // Only the player JS extraction failed. Let the client use the embed iframe.
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
    res.json(results.videos.map((v:any)=>({ id:v.id, title:v.title?.text||v.title||"", thumbnail:v.thumbnails?.[0]?.url||"", channelTitle:v.author?.name||"", channelId:v.author?.id||"", viewCount:v.view_count?.text||"", publishedTime:v.published?.text||"", lengthSeconds:String(v.duration?.seconds||0), isShort:!!v.is_short })).filter((i:any)=>i.id&&i.title));
  } catch (err:any) { console.error("Search:",err.message); invalidateSession(err.message); res.status(500).json({ message:"Search failed" }); }
});

// ── YouTube: video info ───────────────────────────────────────────────────────
app.get("/api/yt/video/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(req.params.id);
    res.json({ id:info.basic_info.id, title:info.basic_info.title||"", description:info.basic_info.short_description||"", thumbnail:info.basic_info.thumbnail?.[0]?.url||"", channelId:info.basic_info.channel_id||"", channelTitle:(info.basic_info as any).channel?.name||(info.basic_info as any).author||"", viewCount:info.basic_info.view_count?`${Number(info.basic_info.view_count).toLocaleString()} views`:"0 views", likeCount:info.basic_info.like_count?String(info.basic_info.like_count):"0", publishedTime:"" });
  } catch (err:any) { console.error("Video:",err.message); invalidateSession(err.message); res.status(404).json({ message:"Video not found" }); }
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
    res.json({ id:(ch as any).metadata?.external_id||req.params.id, title:(ch as any).metadata?.title||"", description:(ch as any).metadata?.description||"", thumbnail:(ch as any).metadata?.avatar?.[0]?.url||(ch as any).metadata?.thumbnail?.[0]?.url||"", banner:(ch as any).header?.banner?.[0]?.url||"", subscriberCount:(ch as any).metadata?.subscribers?.text||"" });
  } catch (err:any) { console.error("Channel:",err.message); res.status(404).json({ message:"Channel not found" }); }
});

app.get("/api/yt/channel/:id/videos", async (req, res) => {
  try {
    const yt = await getYoutube();
    const ch = await yt.getChannel(req.params.id);
    const videos = await ch.getVideos();
    res.json(videos.videos.map((v:any)=>({ id:v.id, title:v.title?.text||"", thumbnail:v.thumbnails?.[0]?.url||"", channelTitle:ch.metadata.title, channelId:req.params.id, viewCount:v.view_count?.text||"", publishedTime:v.published?.text||"", lengthSeconds:String(v.duration?.seconds||0) })));
  } catch (err:any) { console.error("Channel videos:",err.message); res.json([]); }
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
app.get("/api/settings", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  const rows = await query<any>("SELECT * FROM settings WHERE user_id=?", [userId]);
  res.json(rows[0] || {});
});

app.put("/api/settings", authMiddleware, async (req, res) => {
  const {userId} = (req as any).user;
  const { custom_proxy, proxy_enabled, user_keywords, language } = req.body;
  await getPool().execute("INSERT INTO settings (user_id,custom_proxy,proxy_enabled,user_keywords,language) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE custom_proxy=VALUES(custom_proxy),proxy_enabled=VALUES(proxy_enabled),user_keywords=VALUES(user_keywords),language=VALUES(language)", [userId, custom_proxy||null, proxy_enabled!==false?1:0, user_keywords?JSON.stringify(user_keywords):null, language||"en"]);
  res.json({ ok: true });
});

export default app;
