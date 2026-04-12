import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { Innertube } from "youtubei.js";
import { api } from "@shared/routes";
import { z } from "zod";
import { ProxyAgent, fetch as undiciFetch } from "undici";

// ─── Proxy Pool ───────────────────────────────────────────────────────────────

const PROXYSCRAPE_URL =
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text";

// Raw list fetched from ProxyScrape (for Settings display)
let rawProxyPool: string[] = [];
let rawFetchedAt = 0;

// Validated working proxies (tested against YouTube)
let validatedProxies: string[] = [];
let validationRunning = false;

const PROXY_TEST_URL = "https://www.youtube.com/favicon.ico";
const PROXY_TEST_TIMEOUT = 6_000;
const MAX_CONCURRENT_TESTS = 15;
const TARGET_VALIDATED = 8;

/** Test one proxy — resolves true if it can reach YouTube within timeout */
async function testProxy(proxyUrl: string): Promise<boolean> {
  try {
    const dispatcher = new ProxyAgent({
      uri: proxyUrl,
      connectTimeout: PROXY_TEST_TIMEOUT,
      headersTimeout: PROXY_TEST_TIMEOUT,
    });
    const res = await undiciFetch(PROXY_TEST_URL, {
      method: "HEAD",
      dispatcher,
      signal: AbortSignal.timeout(PROXY_TEST_TIMEOUT),
    } as any);
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Shuffle array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Validate proxies in the background, filling validatedProxies pool */
async function buildValidatedPool(candidates: string[]): Promise<void> {
  if (validationRunning) return;
  validationRunning = true;
  console.log(`[proxy] validating up to ${candidates.length} candidates…`);

  const shuffled = shuffle([...candidates]);
  const newValid: string[] = [];

  for (let i = 0; i < shuffled.length && newValid.length < TARGET_VALIDATED; i += MAX_CONCURRENT_TESTS) {
    const batch = shuffled.slice(i, i + MAX_CONCURRENT_TESTS);
    const results = await Promise.all(
      batch.map(async (p) => ({ p, ok: await testProxy(p) }))
    );
    for (const { p, ok } of results) {
      if (ok) {
        newValid.push(p);
        console.log(`[proxy] ✓ ${p}`);
        if (newValid.length >= TARGET_VALIDATED) break;
      }
    }
  }

  validatedProxies = newValid;
  validationRunning = false;
  console.log(`[proxy] validated pool ready: ${validatedProxies.length} working proxies`);
}

async function fetchRawProxies(): Promise<void> {
  try {
    const res = await fetch(PROXYSCRAPE_URL, { signal: AbortSignal.timeout(12_000) });
    const text = await res.text();
    const list = text
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.startsWith("http://") || p.startsWith("https://"));
    if (list.length > 0) {
      rawProxyPool = list;
      rawFetchedAt = Date.now();
      console.log(`[proxy] fetched ${list.length} raw proxies from ProxyScrape`);
      // Kick off validation in background (don't await)
      buildValidatedPool(list).catch(console.error);
    }
  } catch (err) {
    console.error("[proxy] failed to fetch proxy list:", err);
  }
}

/** Get a random validated proxy. Falls back to null (direct) if pool is empty. */
function getWorkingProxy(): string | null {
  if (validatedProxies.length === 0) return null;
  return validatedProxies[Math.floor(Math.random() * validatedProxies.length)];
}

/** Remove a bad proxy from the validated pool */
function evictProxy(proxyUrl: string) {
  validatedProxies = validatedProxies.filter((p) => p !== proxyUrl);
  console.log(`[proxy] evicted ${proxyUrl} (${validatedProxies.length} remaining)`);
  // Refill if pool runs low
  if (validatedProxies.length < 3 && rawProxyPool.length > 0 && !validationRunning) {
    buildValidatedPool(rawProxyPool).catch(console.error);
  }
}

// Kick off on startup
fetchRawProxies().catch(console.error);
// Re-fetch raw list every 10 min
setInterval(() => fetchRawProxies().catch(console.error), 10 * 60 * 1000);

// ─── Build a proxyFetch function for youtubei.js ──────────────────────────────

/** Wraps undici fetch with a ProxyAgent and handles Request objects */
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
      // Request object — extract primitives so undici can handle it
      url = input.url;
      mergedInit = {
        method: input.method,
        headers: Object.fromEntries((input.headers as any).entries?.() ?? []),
        body: ["GET", "HEAD"].includes(input.method) ? undefined : input.body,
        ...init,
      };
    }

    return undiciFetch(url, { ...mergedInit, dispatcher } as any) as unknown as Promise<Response>;
  };
}

// ─── Innertube singleton ──────────────────────────────────────────────────────

let youtube: Innertube | null = null;
let youtubeProxy: string | null = null;
let youtubeCreatedAt = 0;
const SESSION_TTL_MS = 30 * 60 * 1000;

async function getYoutube(): Promise<Innertube> {
  const now = Date.now();
  if (youtube && now - youtubeCreatedAt < SESSION_TTL_MS) return youtube;

  const proxyUrl = getWorkingProxy();
  const options: any = { generate_session_locally: true };

  if (proxyUrl) {
    options.fetch = makeProxyFetch(proxyUrl);
    console.log("[innertube] creating session via proxy:", proxyUrl);
  } else {
    console.log("[innertube] creating session direct (no validated proxy yet)");
  }

  // Timeout guard so we don't hang forever
  youtube = await Promise.race([
    Innertube.create(options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Innertube session timeout")), 20_000)
    ),
  ]);
  youtubeProxy = proxyUrl;
  youtubeCreatedAt = now;
  return youtube;
}

function invalidateSession(reason?: string) {
  if (reason) console.log("[innertube] invalidating session:", reason);
  if (youtubeProxy) evictProxy(youtubeProxy);
  youtube = null;
  youtubeProxy = null;
  youtubeCreatedAt = 0;
}

// ─── Stream cache ─────────────────────────────────────────────────────────────

const streamUrlCache = new Map<string, { url: string; expires: number }>();

async function getStreamUrl(videoId: string): Promise<string> {
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.url;

  const yt = await getYoutube();
  const info = await yt.getInfo(videoId);
  const format = info.chooseFormat({ type: "video+audio", quality: "best" });
  if (!format) throw new Error("No suitable format found");

  const rawUrl = String(await format.decipher(yt.session.player));
  const proxiedUrl = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;

  streamUrlCache.set(videoId, { url: proxiedUrl, expires: Date.now() + 30 * 60 * 1000 });
  if (streamUrlCache.size > 50) {
    const first = streamUrlCache.keys().next().value;
    if (first) streamUrlCache.delete(first);
  }
  return proxiedUrl;
}

const GUEST_USER_ID = 1;

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── /api/proxy — stream / subtitle pass-through ──────────────────────────
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Missing url param");

    try {
      const reqHeaders: Record<string, string> = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      };
      if (req.headers.range) reqHeaders.range = req.headers.range as string;

      // Try with a working proxy first; fall back to direct
      let fetchResponse: Response | null = null;
      const proxyUrl = getWorkingProxy();

      if (proxyUrl) {
        try {
          const dispatcher = new ProxyAgent({ uri: proxyUrl });
          fetchResponse = (await undiciFetch(targetUrl, {
            headers: reqHeaders,
            dispatcher,
            signal: AbortSignal.timeout(15_000),
          } as any)) as unknown as Response;
        } catch {
          evictProxy(proxyUrl);
          fetchResponse = null;
        }
      }

      if (!fetchResponse) {
        fetchResponse = await fetch(targetUrl, {
          headers: reqHeaders,
          signal: AbortSignal.timeout(15_000),
        });
      }

      res.status(fetchResponse.status);
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
        const v = fetchResponse.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("cache-control", "public, max-age=3600");

      if (fetchResponse.body) {
        const reader = fetchResponse.body.getReader();
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
      } else {
        res.end();
      }
    } catch (err: any) {
      if (!res.headersSent) res.status(500).json({ message: "Proxy error: " + err.message });
    }
  });

  // ── /api/proxies — list for Settings page ────────────────────────────────
  app.get("/api/proxies", (_req, res) => {
    res.json({
      proxies: rawProxyPool,
      validated: validatedProxies,
      fetchedAt: rawFetchedAt,
      total: rawProxyPool.length,
      validatedCount: validatedProxies.length,
    });
  });

  app.post("/api/proxies/refresh", async (_req, res) => {
    rawProxyPool = [];
    rawFetchedAt = 0;
    validatedProxies = [];
    await fetchRawProxies();
    res.json({
      proxies: rawProxyPool,
      validated: validatedProxies,
      fetchedAt: rawFetchedAt,
      total: rawProxyPool.length,
      validatedCount: validatedProxies.length,
    });
  });

  // ── YouTube: search ───────────────────────────────────────────────────────
  app.get(api.yt.search.path, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.status(400).json({ message: "Missing query" });

      const yt = await getYoutube();
      const results = await yt.search(query);

      const items = results.videos
        .map((v: any) => ({
          id: v.id,
          title: v.title?.text || v.title || "",
          thumbnail: v.thumbnails?.[0]?.url || "",
          channelTitle: v.author?.name || "",
          channelId: v.author?.id || "",
          viewCount: v.view_count?.text || "",
          publishedTime: v.published?.text || "",
          lengthSeconds: String(v.duration?.seconds || 0),
          isShort: !!v.is_short,
        }))
        .filter((i: any) => i.id && i.title);

      res.json(items);
    } catch (err: any) {
      console.error("Search error:", err.message);
      invalidateSession(err.message);
      res.status(500).json({ message: "Search failed. Please try again." });
    }
  });

  // ── YouTube: video info ───────────────────────────────────────────────────
  app.get(api.yt.video.path, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const info = await yt.getInfo(id);

      res.json({
        id: info.basic_info.id,
        title: info.basic_info.title || "",
        description: info.basic_info.short_description || "",
        thumbnail: info.basic_info.thumbnail?.[0]?.url || "",
        channelId: info.basic_info.channel_id || "",
        channelTitle: (info.basic_info as any).channel?.name || (info.basic_info as any).author || "",
        viewCount: info.basic_info.view_count ? `${Number(info.basic_info.view_count).toLocaleString()} views` : "0 views",
        likeCount: info.basic_info.like_count ? String(info.basic_info.like_count) : "0",
        publishedTime: "",
      });
    } catch (err: any) {
      console.error("Video info error:", err.message);
      invalidateSession(err.message);
      res.status(404).json({ message: "Video not found or restricted" });
    }
  });

  // ── YouTube: subtitles ────────────────────────────────────────────────────
  app.get(`${api.yt.video.path}/subtitles`, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const info = await yt.getInfo(id);
      const captions = info.captions;
      if (!captions) return res.json([]);

      const tracks = (captions as any).caption_tracks.map((t: any) => ({
        label: t.name.text,
        languageCode: t.language_code,
        url: `/api/proxy?url=${encodeURIComponent(t.base_url)}`,
        kind: t.kind,
      }));
      res.json(tracks);
    } catch (err: any) {
      console.error("Subtitles error:", err.message);
      res.json([]);
    }
  });

  // ── YouTube: stream ───────────────────────────────────────────────────────
  app.get(api.yt.stream.path, async (req, res) => {
    try {
      const { id } = req.params;
      const url = await getStreamUrl(id);
      res.redirect(302, url);
    } catch (err: any) {
      console.error("Stream error:", err.message);
      invalidateSession(err.message);
      if (!res.headersSent) res.status(500).json({ message: "Could not get stream URL" });
    }
  });

  // ── YouTube: comments (YouTube Data API v3 — public) ──────────────────────
  app.get(api.yt.comments.path, async (req, res) => {
    try {
      const { id } = req.params;
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) return res.json({ items: [], nextPageToken: null });

      const { pageToken, maxResults = "30" } = req.query as any;
      const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("videoId", id);
      url.searchParams.set("maxResults", maxResults);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("order", "relevance");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const r = await fetch(url.toString());
      if (!r.ok) return res.json({ items: [], nextPageToken: null });
      const data = await r.json() as any;

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
    } catch (err: any) {
      console.error("Comments error:", err.message);
      res.json({ items: [], nextPageToken: null });
    }
  });

  // ── YouTube: channel ──────────────────────────────────────────────────────
  app.get(api.yt.channel.path, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const ch = await yt.getChannel(id);

      res.json({
        id: (ch as any).metadata?.external_id || id,
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

  app.get(`${api.yt.channel.path}/videos`, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const ch = await yt.getChannel(id);
      const videos = await ch.getVideos();

      res.json(videos.videos.map((v: any) => ({
        id: v.id,
        title: v.title?.text || "",
        thumbnail: v.thumbnails?.[0]?.url || "",
        channelTitle: ch.metadata.title,
        channelId: id,
        viewCount: v.view_count?.text || "",
        publishedTime: v.published?.text || "",
        lengthSeconds: String(v.duration?.seconds || 0),
      })));
    } catch (err: any) {
      console.error("Channel videos error:", err.message);
      res.json([]);
    }
  });

  // ── Favorites ─────────────────────────────────────────────────────────────
  app.get(api.favorites.list.path, async (_req, res) => {
    res.json(await storage.getFavorites(GUEST_USER_ID));
  });

  app.get(api.favorites.check.path, async (req, res) => {
    const fav = await storage.getFavorite(GUEST_USER_ID, req.params.videoId);
    res.json({ isFavorite: !!fav, id: fav?.id });
  });

  app.post(api.favorites.create.path, async (req, res) => {
    try {
      const input = api.favorites.create.input.parse(req.body);
      const existing = await storage.getFavorite(GUEST_USER_ID, input.videoId);
      if (existing) return res.json(existing);
      const fav = await storage.createFavorite({ ...input, userId: GUEST_USER_ID });
      res.status(201).json(fav);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.issues);
      res.status(500).json({ message: "Internal Error" });
    }
  });

  app.delete(api.favorites.delete.path, async (req, res) => {
    await storage.deleteFavorite(Number(req.params.id), GUEST_USER_ID);
    res.sendStatus(204);
  });

  return httpServer;
}
