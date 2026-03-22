import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { Innertube } from "youtubei.js";
import { api } from "@shared/routes";
import { z } from "zod";
import { ProxyAgent, fetch as undiciFetch } from "undici";

// ─── Proxy Pool (ProxyScrape) ─────────────────────────────────────────────────

const PROXYSCRAPE_URL =
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text";

let proxyPool: string[] = [];
let proxyFetchedAt = 0;
const PROXY_TTL_MS = 5 * 60 * 1000; // refresh every 5 min

async function refreshProxyPool(): Promise<void> {
  try {
    const res = await fetch(PROXYSCRAPE_URL, {
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    const proxies = text
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.startsWith("http://") || p.startsWith("https://"));
    if (proxies.length > 0) {
      proxyPool = proxies;
      proxyFetchedAt = Date.now();
      console.log(`[proxy] loaded ${proxies.length} proxies from ProxyScrape`);
    }
  } catch (err) {
    console.error("[proxy] failed to fetch proxy list:", err);
  }
}

async function getRandomProxy(): Promise<string | null> {
  if (!proxyPool.length || Date.now() - proxyFetchedAt > PROXY_TTL_MS) {
    await refreshProxyPool();
  }
  if (!proxyPool.length) return null;
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

// Pre-load proxy list on startup (non-blocking)
refreshProxyPool().catch(() => {});

// ─── Innertube singleton ──────────────────────────────────────────────────────

let youtube: Innertube | null = null;
let youtubeCreatedAt = 0;
const YOUTUBE_SESSION_TTL_MS = 30 * 60 * 1000;

async function getYoutube(): Promise<Innertube> {
  if (!youtube || Date.now() - youtubeCreatedAt > YOUTUBE_SESSION_TTL_MS) {
    const proxyUrl = await getRandomProxy();
    const options: any = { generate_session_locally: true };
    if (proxyUrl) {
      const dispatcher = new ProxyAgent(proxyUrl);
      options.fetch = (input: any, init: any) =>
        undiciFetch(input, { ...init, dispatcher }) as unknown as Promise<Response>;
      console.log("[innertube] using proxy:", proxyUrl);
    }
    youtube = await Innertube.create(options);
    youtubeCreatedAt = Date.now();
  }
  return youtube;
}

// ─── Stream URL cache ─────────────────────────────────────────────────────────

const streamUrlCache = new Map<string, { url: string; expires: number }>();

async function getStreamUrl(videoId: string): Promise<string> {
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.url;

  const yt = await getYoutube();
  const info = await yt.getInfo(videoId);
  const format = info.chooseFormat({ type: "video+audio", quality: "best" });
  if (!format) throw new Error("No suitable format found");

  const rawUrl = String(await format.decipher(yt.session.player));

  // Wrap with our own /api/proxy endpoint (replaces the Cloudflare Worker)
  const proxiedUrl = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;

  streamUrlCache.set(videoId, {
    url: proxiedUrl,
    expires: Date.now() + 30 * 60 * 1000,
  });

  if (streamUrlCache.size > 50) {
    const firstKey = streamUrlCache.keys().next().value;
    if (firstKey) streamUrlCache.delete(firstKey);
  }

  return proxiedUrl;
}

const GUEST_USER_ID = 1;

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── URL proxy pass-through ─────────────────────────────────────────────────
  // Replaces the Cloudflare Worker at prx.thazh-app.workers.dev
  // Handles video streams (range requests) and subtitle files
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Missing url param");

    try {
      const reqHeaders: Record<string, string> = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };
      if (req.headers.range) reqHeaders["range"] = req.headers.range as string;

      const proxyUrl = await getRandomProxy();
      let fetchResponse: Response;

      if (proxyUrl) {
        const dispatcher = new ProxyAgent(proxyUrl);
        fetchResponse = (await undiciFetch(targetUrl, {
          headers: reqHeaders,
          dispatcher,
        } as any)) as unknown as Response;
      } else {
        fetchResponse = await fetch(targetUrl, { headers: reqHeaders });
      }

      res.status(fetchResponse.status);

      const forward = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "last-modified",
        "etag",
      ];
      for (const h of forward) {
        const val = fetchResponse.headers.get(h);
        if (val) res.setHeader(h, val);
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
              const ok = res.write(Buffer.from(value));
              if (!ok) await new Promise((r) => res.once("drain", r));
            }
          } catch {
            res.destroy();
          }
        };
        pump();
      } else {
        res.end();
      }
    } catch (error: any) {
      if (!res.headersSent)
        res.status(500).json({ message: "Proxy error: " + error.message });
    }
  });

  // ── Proxy list (for Settings page) ────────────────────────────────────────
  app.get("/api/proxies", async (_req, res) => {
    if (!proxyPool.length || Date.now() - proxyFetchedAt > PROXY_TTL_MS) {
      await refreshProxyPool();
    }
    res.json({ proxies: proxyPool, fetchedAt: proxyFetchedAt, total: proxyPool.length });
  });

  app.post("/api/proxies/refresh", async (_req, res) => {
    proxyPool = [];
    proxyFetchedAt = 0;
    await refreshProxyPool();
    res.json({ proxies: proxyPool, fetchedAt: proxyFetchedAt, total: proxyPool.length });
  });

  // ── YouTube: search ────────────────────────────────────────────────────────
  app.get(api.yt.search.path, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.status(400).json({ message: "Missing query" });

      const yt = await getYoutube();
      const results = await yt.search(query);

      const items = results.videos
        .map((video: any) => ({
          id: video.id,
          title: video.title?.text || video.title || "",
          thumbnail: video.thumbnails?.[0]?.url || "",
          channelTitle: video.author?.name || "",
          channelId: video.author?.id || "",
          viewCount: video.view_count?.text || "",
          publishedTime: video.published?.text || "",
          lengthSeconds: String(video.duration?.seconds || 0),
          isShort: !!video.is_short,
        }))
        .filter((item: any) => item.id && item.title);

      res.json(items);
    } catch (error: any) {
      console.error("Search error:", error.message);
      youtube = null; // force session refresh on next request
      res.status(500).json({ message: "Search failed. Please try again." });
    }
  });

  // ── YouTube: video info ────────────────────────────────────────────────────
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
        channelTitle:
          (info.basic_info as any).channel?.name ||
          (info.basic_info as any).author || "",
        viewCount: info.basic_info.view_count
          ? `${Number(info.basic_info.view_count).toLocaleString()} views`
          : "0 views",
        likeCount: info.basic_info.like_count
          ? String(info.basic_info.like_count)
          : "0",
        publishedTime: "",
      });
    } catch (error: any) {
      console.error("Video info error:", error.message);
      youtube = null;
      res.status(404).json({ message: "Video not found or restricted" });
    }
  });

  // ── YouTube: subtitles ─────────────────────────────────────────────────────
  app.get(`${api.yt.video.path}/subtitles`, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const info = await yt.getInfo(id);
      const captions = info.captions;
      if (!captions) return res.json([]);

      const tracks = (captions as any).caption_tracks.map((track: any) => ({
        label: track.name.text,
        languageCode: track.language_code,
        // Route subtitle URLs through /api/proxy (CORS fix)
        url: `/api/proxy?url=${encodeURIComponent(track.base_url)}`,
        kind: track.kind,
      }));

      res.json(tracks);
    } catch (error: any) {
      console.error("Subtitles error:", error.message);
      res.json([]);
    }
  });

  // ── YouTube: stream ────────────────────────────────────────────────────────
  app.get(api.yt.stream.path, async (req, res) => {
    try {
      const { id } = req.params;
      const streamUrl = await getStreamUrl(id);
      res.redirect(302, streamUrl);
    } catch (error: any) {
      console.error("Stream error:", error.message);
      youtube = null;
      if (!res.headersSent)
        res.status(500).json({ message: "Could not get stream URL" });
    }
  });

  // ── YouTube: comments ──────────────────────────────────────────────────────
  app.get(api.yt.comments.path, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const comments = await yt.getComments(id);

      const mapped = comments.contents
        .map((c: any) => {
          try {
            return {
              id: c.comment_id || c.commentId || String(Math.random()),
              author: c.author?.name || "Unknown",
              authorThumbnail: c.author?.thumbnails?.[0]?.url || "",
              text: c.content?.text || "",
              publishedTime: c.published?.text || "",
              likeCount: c.vote_count?.text || c.voteCount?.text || "0",
              replyCount: c.reply_count || c.replyCount || 0,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      res.json(mapped);
    } catch (error: any) {
      console.error("Comments error:", error.message);
      res.json([]);
    }
  });

  // ── YouTube: channel ───────────────────────────────────────────────────────
  app.get(api.yt.channel.path, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const channel = await yt.getChannel(id);

      res.json({
        id: (channel as any).metadata?.external_id || id,
        title: (channel as any).metadata?.title || "",
        description: (channel as any).metadata?.description || "",
        thumbnail:
          (channel as any).metadata?.avatar?.[0]?.url ||
          (channel as any).metadata?.thumbnail?.[0]?.url || "",
        banner: (channel as any).header?.banner?.[0]?.url || "",
        subscriberCount: (channel as any).metadata?.subscribers?.text || "",
      });
    } catch (error: any) {
      console.error("Channel error:", error.message);
      res.status(404).json({ message: "Channel not found" });
    }
  });

  app.get(`${api.yt.channel.path}/videos`, async (req, res) => {
    try {
      const { id } = req.params;
      const yt = await getYoutube();
      const channel = await yt.getChannel(id);
      const videos = await channel.getVideos();

      const items = videos.videos.map((video: any) => ({
        id: video.id,
        title: video.title?.text || "",
        thumbnail: video.thumbnails?.[0]?.url || "",
        channelTitle: channel.metadata.title,
        channelId: id,
        viewCount: video.view_count?.text || "",
        publishedTime: video.published?.text || "",
        lengthSeconds: String(video.duration?.seconds || 0),
      }));

      res.json(items);
    } catch (error: any) {
      console.error("Channel videos error:", error.message);
      res.json([]);
    }
  });

  // ── Favorites ──────────────────────────────────────────────────────────────
  app.get(api.favorites.list.path, async (_req, res) => {
    const favs = await storage.getFavorites(GUEST_USER_ID);
    res.json(favs);
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
