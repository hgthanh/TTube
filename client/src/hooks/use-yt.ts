import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { YouTubeVideo } from "@shared/schema";

interface VideoDetails {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail?: string;   // avatar URL from secondary_info
  subscriberCount?: string;    // subscriber count from secondary_info
  viewCount: string;
  likeCount: string;
  publishedTime: string;
}

export type { VideoDetails };

export function useSearch(query: string, type: 'video' | 'channel' | 'playlist' = 'video') {
  return useQuery<YouTubeVideo[]>({
    queryKey: [api.yt.search.path, query, type],
    queryFn: async () => {
      if (!query) return [];
      const res = await fetch(`${api.yt.search.path}?q=${encodeURIComponent(query)}&type=${type}`);
      if (!res.ok) throw new Error("Failed to search");
      const data = await res.json();
      return (data as YouTubeVideo[]).filter((item: any) => item?.id);
    },
    enabled: !!query,
  });
}

export function useInfiniteSearch(query: string, type: 'video' | 'channel' | 'playlist' = 'video') {
  return useInfiniteQuery<YouTubeVideo[]>({
    queryKey: [api.yt.search.path, "infinite", query, type],
    queryFn: async ({ pageParam = "" }) => {
      if (!query) return [];
      const res = await fetch(`${api.yt.search.path}?q=${encodeURIComponent(query)}&type=${type}&continuation=${pageParam}`);
      if (!res.ok) throw new Error("Failed to search");
      const data = await res.json();
      return (data as YouTubeVideo[]).filter((item: any) => item?.id);
    },
    initialPageParam: "",
    getNextPageParam: (lastPage: any) => lastPage.nextContinuation || undefined,
    enabled: !!query,
  });
}

export function useVideo(id: string) {
  return useQuery<VideoDetails>({
    queryKey: [api.yt.video.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.yt.video.path, { id }));
      if (!res.ok) throw new Error("Failed to fetch video details");
      return await res.json() as VideoDetails;
    },
    enabled: !!id,
  });
}

/**
 * Checks whether the server can provide a direct stream URL.
 * Returns the stream endpoint URL if available, or null if the server
 * responded 204 (no stream — player JS extraction failed) or errored.
 * When null, VideoPlayer will fall back to the YouTube embed iframe.
 */
export function useStreamUrl(id: string) {
  return useQuery<string | null>({
    queryKey: ["stream_check", id],
    queryFn: async () => {
      if (!id) return null;
      try {
        // Use a plain fetch with no-redirect so we can inspect the status.
        // The stream endpoint redirects (302) on success, or returns 204 when
        // it cannot extract the URL (e.g. signature decipher fails on Vercel).
        const res = await fetch(`/api/yt/stream/${id}`, {
          method: "HEAD",
          redirect: "manual", // don't follow — we just need the status
        });
        // 0 = opaque redirect (CORS), 302 = redirect — stream is available
        if (res.status === 0 || res.status === 302 || (res.status >= 200 && res.status < 300)) {
          return `/api/yt/stream/${id}`;
        }
        // 204 = server explicitly says no stream URL available
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
    staleTime: 25 * 60 * 1000, // 25 min (stream URLs expire at 30 min server-side)
    retry: 1,
    retryDelay: 2000,
  });
}

export function useChannel(id: string) {
  return useQuery<any>({
    queryKey: [api.yt.channel.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.yt.channel.path, { id }));
      if (!res.ok) throw new Error("Failed to fetch channel details");
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useChannelVideos(id: string) {
  return useInfiniteQuery<YouTubeVideo[]>({
    queryKey: [api.yt.channel.path, id, "videos"],
    queryFn: async ({ pageParam = "" }) => {
      const url = `${api.yt.channel.path.replace(":id", id)}/videos?continuation=${pageParam}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    },
    initialPageParam: "",
    getNextPageParam: (lastPage: any) => lastPage.nextContinuation || undefined,
    enabled: !!id,
  });
}
