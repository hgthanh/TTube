/**
 * api/index.ts — Vercel Serverless Entry Point (self-contained)
 *
 * All server logic is inlined here so @vercel/node can compile this
 * single file without needing to resolve sibling TypeScript modules.
 */
import express from "express";
import { createServer } from "http";
import { z } from "zod";
import { Innertube } from "youtubei.js";
import { ProxyAgent, fetch as undiciFetch } from "undici";

// ─── In-memory Favorites Storage ─────────────────────────────────────────────

interface Favorite {
  id: number;
  userId: number;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelName: string | null;
  createdAt: Date | null;
}

const insertFavoriteSchema = z.object({
  userId: z.number(),
  videoId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  channelName: z.string().nullable().optional(),
});

const favoritesStore = new Map<number, Favorite>();
let nextFavId = 1;

const storage = {
  getFavorites: (userId: number) =>
    Promise.resolve([...favoritesStore.values()].filter((f) => f.userId === userId)),
  getFavorite: (userId: number, videoId: string) =>
    Promise.resolve([...favoritesStore.values()].find((f) => f.userId === userId && f.videoId === videoId)),
  createFavorite: (ins: z.infer<typeof insertFavoriteSchema>): Promise<Favorite> => {
    const fav: Favorite = {
      id: nextFavId++,
      userId: ins.userId,
      videoId: ins.videoId,
      title: ins.title,
      thumbnailUrl: ins.thumbnailUrl ?? null,
      channelName: ins.channelName ?? null,
      createdAt: new Date(),
    };
    favoritesStore.set(fav.id, fav);
    return Promise.resolve(fav);
  },
  deleteFavorite: (id: number, userId: number): Promise<void> => {
    const fav = favoritesStore.get(id);
    if (fav && fav.userId === userId) favoritesStore.delete(id);
    return Promise.resolve();
  },
};

// ─── Proxy Pool ───────────────────────────────────────────────────────────────

const PROXYSCRAPE_URL =
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text";

let rawProxyPool: string[] = [];
let rawFetchedAt = 0;
let validatedProxies: string[] = [];
let validationRunning = false;

const PROXY_TEST_URL = "https://www.youtube.com/favicon.ico";
const PROXY_TEST_TIMEOUT = 6_000;
const MAX_CONCURRENT_TESTS = 15;
const TARGET_VALIDATED = 8;

async function testProxy(proxyUrl: string): Promise<boolean> {
  try {
    const dispatcher = new ProxyAgent({
      uri: proxyUrl,
      connectTimeout: PROXY_TEST_TIMEOUT,
      headersTimeout: PROXY_TEST_TIMEOUT,
    });
    const res = await (undiciFetch as any)(PROXY_TEST_URL, {
      method: "HEAD",
      dispatcher,
      signal: AbortSignal.timeout(PROXY_TEST_TIMEOUT),
    });
    return (res as any).status < 500;
  } catch {
    return false;
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function buildValidatedPool(candidates: string[]): Promise<void> {
  if (validationRunning) return;
  validationRunning = true;
  const shuffled = shuffle([...candidates]);
  const newValid: string[] = [];
  for (let i = 0; i < shuffled.length && newValid.length < TARGET_VALIDATED; i += MAX_CONCURRENT_TESTS) {
    const batch = shuffled.slice(i, i + MAX_CONCURRENT_TESTS);
    const results = await Promise.all(batch.map(async (p) => ({ p, ok: await testProxy(p) })));
    for (const { p, ok } of results) {
      if (ok) { newValid.push(p); if (newValid.length >= TARGET_VALIDATED) break; }
    }
  }
  validatedProxies = newValid;
  validationRunning = false;
  console.log(`[proxy] validated: ${validatedProxies.length} working proxies`);
}

async function fetchRawProxies(): Promise<void> {
  try {
    const res = await fetch(PROXYSCRAPE_URL, { signal: AbortSignal.timeout(12_000) });
    const text = await res.text();
    const list = text.split("\n").map((p) => p.trim())
      .filter((p) => p.startsWith("http://") || p.startsWith("https://"));
    if (list.length > 0) {
      rawProxyPool = list;
      rawFetchedAt = Date.now();
      console.log(`[proxy] fetched ${list.length} proxies`);
      buildValidatedPool(list).catch(console.error);
    }
  } catch (err) {
    console.error("[proxy] fetch failed:", err);
  }
}

function getWorkingProxy(): string | null {
  if (validatedProxies.length === 0) return null;
  return validatedProxies[Math.floor(Math.random() * validatedProxies.length)];
}

function evictProxy(proxyUrl: string) {
  validatedProxies = validatedProxies.filter((p) => p !== proxyUrl);
  if (validatedProxies.length < 3 && rawProxyPool.length > 0 && !validationRunning) {
    buildValidatedPool(rawProxyPool).catch(console.error);
  }
}

fetchRawProxies().catch(console.error);
setInterval(() => fetchRawProxies().catch(console.error), 10 * 60 * 1000);

// ─── Proxy fetch helper for youtubei.js ──────────────────────────────────────

function makeProxyFetch(proxyUrl: string) {
  const dispatcher = new ProxyAgent({
    uri: proxyUrl,
    connectTimeout: 10_000,
    headersTimeout: 15_000,
  });
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string;
    let mergedInit: Record<string, any> = { ...(init ?? {}) };
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      // Request object — extract primitives
      url = input.url;
      mergedInit = {
        method: input.method,
        headers: Object.fromEntries((input.headers as any).entries?.() ?? []),
        body: ["GET", "HEAD"].includes(input.method) ? undefined : input.body,
        ...init,
      };
    }
    return (undiciFetch as any)(url, { ...mergedInit, dispatcher }) as Promise<Response>;
  };
}

// ─── Innertube singleton ──────────────────────────────────────────────────────

let youtube: Innertube | null = null;
let youtubeProxy: string | null = null;
let youtubeCreatedAt = 0;
const SESSION_TTL_MS = 30 * 60 * 1000;

async function getYoutube(): Promise<Innertube> {
  if (youtube && Date.now() - youtubeCreatedAt < SESSION_TTL_MS) return youtube;
  const proxyUrl = getWorkingProxy();
  const options: any = { generate_session_locally: true };
  if (proxyUrl) {
    options.fetch = makeProxyFetch(proxyUrl);
    console.log("[innertube] using proxy:", proxyUrl);
  } else {
    console.log("[innertube] direct connection (no validated proxy yet)");
  }
  youtube = await Promise.race([
    Innertube.create(options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Innertube session timeout")), 20_000)
    ),
  ]);
  youtubeProxy = proxyUrl;
  youtubeCreatedAt = Date.now();
  return youtube;
}

function invalidateSession(reason?: string) {
  if (reason) console.log("[innertube] invalidating:", reason);
  if (youtubeProxy) evictProxy(youtubeProxy);
  youtube = null;
  youtubeProxy = null;
  youtubeCreatedAt = 0;
}

// ─── Stream cache ─────────────────────────────────────────────────────────────

const streamCache = new Map<string, { url: string; expires: number }>();

async function getStreamUrl(videoId: string): Promise<string> {
  const cached = streamCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.url;
  const yt = await getYoutube();
  const info = await yt.getInfo(videoId);
  const format = info.chooseFormat({ type: "video+audio", quality: "best" });
  if (!format) throw new Error("No suitable format found");
  const rawUrl = String(await format.decipher(yt.session.player));
  const proxied = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
  streamCache.set(videoId, { url: proxied, expires: Date.now() + 30 * 60 * 1000 });
  if (streamCache.size > 50) {
    const first = streamCache.keys().next().value;
    if (first) streamCache.delete(first);
  }
  return proxied;
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const GUEST = 1;

// ── /api/proxy — stream / subtitle pass-through ──────────────────────────────
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).send("Missing url param");
  try {
    const reqHeaders: Record<string, string> = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    };
    if (req.headers.range) reqHeaders.range = req.headers.range as string;

    let fetchResponse: Response | null = null;
    const proxyUrl = getWorkingProxy();
    if (proxyUrl) {
      try {
        const dispatcher = new ProxyAgent({ uri: proxyUrl });
        fetchResponse = await (undiciFetch as any)(targetUrl, {
          headers: reqHeaders, dispatcher, signal: AbortSignal.timeout(15_000),
        }) as Response;
      } catch { evictProxy(proxyUrl); fetchResponse = null; }
    }
    if (!fetchResponse) {
      fetchResponse = await fetch(targetUrl, { headers: reqHeaders, signal: AbortSignal.timeout(15_000) });
    }

    res.status((fetchResponse as any).status);
    for (const h of ["content-type","content-length","content-range","accept-ranges","last-modified","etag"]) {
      const v = (fetchResponse as any).headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("cache-control", "public, max-age=3600");

    if ((fetchResponse as any).body) {
      const reader = (fetchResponse as any).body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); break; }
            if (!res.write(Buffer.from(value))) await new Promise((r) => res.once("drain", r));
          }
        } catch { res.destroy(); }
      };
      pump();
    } else { res.end(); }
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ message: "Proxy error: " + err.message });
  }
});

// ── /api/proxies ──────────────────────────────────────────────────────────────
app.get("/api/proxies", (_req, res) => {
  res.json({ proxies: rawProxyPool, validated: validatedProxies, fetchedAt: rawFetchedAt, total: rawProxyPool.length, validatedCount: validatedProxies.length });
});
app.post("/api/proxies/refresh", async (_req, res) => {
  rawProxyPool = []; rawFetchedAt = 0; validatedProxies = [];
  await fetchRawProxies();
  res.json({ proxies: rawProxyPool, validated: validatedProxies, fetchedAt: rawFetchedAt, total: rawProxyPool.length, validatedCount: validatedProxies.length });
});

// ── /api/auth/user — stub (auth removed) ─────────────────────────────────────
app.get("/api/auth/user", (_req, res) => res.json({ id: 1, username: "guest" }));

// ── YouTube: search ───────────────────────────────────────────────────────────
app.get("/api/yt/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ message: "Missing query" });
    const yt = await getYoutube();
    const results = await yt.search(query);
    const items = results.videos.map((v: any) => ({
      id: v.id, title: v.title?.text || v.title || "",
      thumbnail: v.thumbnails?.[0]?.url || "",
      channelTitle: v.author?.name || "", channelId: v.author?.id || "",
      viewCount: v.view_count?.text || "", publishedTime: v.published?.text || "",
      lengthSeconds: String(v.duration?.seconds || 0), isShort: !!v.is_short,
    })).filter((i: any) => i.id && i.title);
    res.json(items);
  } catch (err: any) {
    console.error("Search error:", err.message);
    invalidateSession(err.message);
    res.status(500).json({ message: "Search failed. Please try again." });
  }
});

// ── YouTube: video info ───────────────────────────────────────────────────────
app.get("/api/yt/video/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(req.params.id);
    res.json({
      id: info.basic_info.id, title: info.basic_info.title || "",
      description: info.basic_info.short_description || "",
      thumbnail: info.basic_info.thumbnail?.[0]?.url || "",
      channelId: info.basic_info.channel_id || "",
      channelTitle: (info.basic_info as any).channel?.name || (info.basic_info as any).author || "",
      viewCount: info.basic_info.view_count ? `${Number(info.basic_info.view_count).toLocaleString()} views` : "0 views",
      likeCount: info.basic_info.like_count ? String(info.basic_info.like_count) : "0",
      publishedTime: "",
    });
  } catch (err: any) {
    console.error("Video error:", err.message);
    invalidateSession(err.message);
    res.status(404).json({ message: "Video not found or restricted" });
  }
});

// ── YouTube: subtitles ────────────────────────────────────────────────────────
app.get("/api/yt/video/:id/subtitles", async (req, res) => {
  try {
    const yt = await getYoutube();
    const info = await yt.getInfo(req.params.id);
    const captions = info.captions;
    if (!captions) return res.json([]);
    const tracks = (captions as any).caption_tracks.map((t: any) => ({
      label: t.name.text, languageCode: t.language_code,
      url: `/api/proxy?url=${encodeURIComponent(t.base_url)}`, kind: t.kind,
    }));
    res.json(tracks);
  } catch (err: any) {
    console.error("Subtitles error:", err.message);
    res.json([]);
  }
});

// ── YouTube: stream ───────────────────────────────────────────────────────────
app.get("/api/yt/stream/:id", async (req, res) => {
  try {
    const url = await getStreamUrl(req.params.id);
    res.redirect(302, url);
  } catch (err: any) {
    console.error("Stream error:", err.message);
    invalidateSession(err.message);
    if (!res.headersSent) res.status(500).json({ message: "Could not get stream URL" });
  }
});

// ── YouTube: comments ─────────────────────────────────────────────────────────
app.get("/api/yt/comments/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const comments = await yt.getComments(req.params.id);
    const mapped = comments.contents.map((c: any) => {
      try {
        return {
          id: c.comment_id || c.commentId || String(Math.random()),
          author: c.author?.name || "Unknown",
          authorThumbnail: c.author?.thumbnails?.[0]?.url || "",
          text: c.content?.text || "", publishedTime: c.published?.text || "",
          likeCount: c.vote_count?.text || "0", replyCount: c.reply_count || 0,
        };
      } catch { return null; }
    }).filter(Boolean);
    res.json(mapped);
  } catch (err: any) {
    console.error("Comments error:", err.message);
    res.json([]);
  }
});

// ── YouTube: channel ──────────────────────────────────────────────────────────
app.get("/api/yt/channel/:id", async (req, res) => {
  try {
    const yt = await getYoutube();
    const ch = await yt.getChannel(req.params.id);
    res.json({
      id: (ch as any).metadata?.external_id || req.params.id,
      title: (ch as any).metadata?.title || "",
      description: (ch as any).metadata?.description || "",
      thumbnail: (ch as any).metadata?.avatar?.[0]?.url || (ch as any).metadata?.thumbnail?.[0]?.url || "",
      banner: (ch as any).header?.banner?.[0]?.url || "",
      subscriberCount: (ch as any).metadata?.subscribers?.text || "",
    });
  } catch (err: any) {
    console.error("Channel error:", err.message);
    res.status(404).json({ message: "Channel not found" });
  }
});

app.get("/api/yt/channel/:id/videos", async (req, res) => {
  try {
    const yt = await getYoutube();
    const ch = await yt.getChannel(req.params.id);
    const videos = await ch.getVideos();
    res.json(videos.videos.map((v: any) => ({
      id: v.id, title: v.title?.text || "",
      thumbnail: v.thumbnails?.[0]?.url || "",
      channelTitle: ch.metadata.title, channelId: req.params.id,
      viewCount: v.view_count?.text || "", publishedTime: v.published?.text || "",
      lengthSeconds: String(v.duration?.seconds || 0),
    })));
  } catch (err: any) {
    console.error("Channel videos error:", err.message);
    res.json([]);
  }
});

// ── Favorites ─────────────────────────────────────────────────────────────────
app.get("/api/favorites", async (_req, res) => res.json(await storage.getFavorites(GUEST)));

app.get("/api/favorites/:videoId/check", async (req, res) => {
  const fav = await storage.getFavorite(GUEST, req.params.videoId);
  res.json({ isFavorite: !!fav, id: fav?.id });
});

app.post("/api/favorites", async (req, res) => {
  try {
    const input = insertFavoriteSchema.omit({ userId: true } as any).parse(req.body);
    const existing = await storage.getFavorite(GUEST, (input as any).videoId);
    if (existing) return res.json(existing);
    const fav = await storage.createFavorite({ ...(input as any), userId: GUEST });
    res.status(201).json(fav);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json(err.issues);
    res.status(500).json({ message: "Internal Error" });
  }
});

app.delete("/api/favorites/:id", async (req, res) => {
  await storage.deleteFavorite(Number(req.params.id), GUEST);
  res.sendStatus(204);
});

export default app;
