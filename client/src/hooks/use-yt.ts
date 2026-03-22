import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { YouTubeVideo, YouTubeComment } from "@shared/schema";

interface VideoDetails {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  viewCount: string;
  likeCount: string;
  publishedTime: string;
}

export function useSearch(query: string, type: 'video' | 'channel' | 'playlist' = 'video') {
  return useQuery<YouTubeVideo[]>({
    queryKey: [api.yt.search.path, query, type],
    queryFn: async () => {
      if (!query) return [];
      const url = `${api.yt.search.path}?q=${encodeURIComponent(query)}&type=${type}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to search");
      const data = await res.json();
      return (data as YouTubeVideo[]).filter((item: any) => item && item.id);
    },
    enabled: !!query,
  });
}

export function useInfiniteSearch(query: string, type: 'video' | 'channel' | 'playlist' = 'video') {
  return useInfiniteQuery<YouTubeVideo[]>({
    queryKey: [api.yt.search.path, "infinite", query, type],
    queryFn: async ({ pageParam = "" }) => {
      if (!query) return [];
      const url = `${api.yt.search.path}?q=${encodeURIComponent(query)}&type=${type}&continuation=${pageParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to search");
      const data = await res.json();
      return (data as YouTubeVideo[]).filter((item: any) => item && item.id);
    },
    initialPageParam: "",
    getNextPageParam: (lastPage: any) => {
        // This would need backend support for continuation tokens
        // For now, we'll return undefined to stop or mock it if needed
        return lastPage.nextContinuation || undefined;
    },
    enabled: !!query,
  });
}

export function useVideo(id: string) {
  return useQuery<VideoDetails>({
    queryKey: [api.yt.video.path, id],
    queryFn: async () => {
      const url = buildUrl(api.yt.video.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch video details");
      return await res.json() as VideoDetails;
    },
    enabled: !!id,
  });
}

export function useStreamUrl(id: string) {
  if (!id) return null;
  const baseUrl = buildUrl(api.yt.stream.path, { id });
  
  // Apply custom proxy if configured
  const customProxy = localStorage.getItem("custom_proxy");
  const proxyEnabled = localStorage.getItem("proxy_enabled") !== "false";
  
  if (proxyEnabled && customProxy) {
    try {
      const url = new URL(baseUrl, window.location.origin);
      // We need to keep the existing server-side proxying logic but 
      // allow overriding the final worker URL if needed.
      // For simplicity, we stick to server-side proxying but allow 
      // the user to know we are using their preference if we added more logic.
    } catch (e) {}
  }
  
  return baseUrl;
}

export function useChannel(id: string) {
  return useQuery<any>({
    queryKey: [api.yt.channel.path, id],
    queryFn: async () => {
      const url = buildUrl(api.yt.channel.path, { id });
      const res = await fetch(url);
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
