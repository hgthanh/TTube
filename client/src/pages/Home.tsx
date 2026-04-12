import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Flame, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/contexts/LangContext";
import type { YouTubeVideo } from "@shared/schema";
import { Link } from "wouter";
import { useInView } from "react-intersection-observer";
import { useEffect, useState, useRef } from "react";

// Infinite scroll home: fetch page 1 from /api/yt/home,
// then keep fetching more via /api/yt/search until user stops scrolling.
function useHomeVideos() {
  return useQuery<YouTubeVideo[]>({
    queryKey: ["home_feed"],
    queryFn: async () => {
      const res = await fetch("/api/yt/home");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
      return data as YouTubeVideo[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
  });
}

function useFallbackVideos(enabled: boolean) {
  const fallbackQuery = useRef(() => {
    try {
      const kw = JSON.parse(localStorage.getItem("user_keywords") || "[]");
      const picks = ["trending 2025", "music 2025", "viral videos", "âm nhạc hay"];
      return kw.length > 0
        ? kw[Math.floor(Math.random() * kw.length)]
        : picks[Math.floor(Math.random() * picks.length)];
    } catch { return "trending 2025"; }
  }).current();

  return useQuery<YouTubeVideo[]>({
    queryKey: ["home_fallback", fallbackQuery],
    queryFn: async () => {
      const res = await fetch(`/api/yt/search?q=${encodeURIComponent(fallbackQuery)}&type=video`);
      if (!res.ok) throw new Error("search failed");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Infinite extra videos (scroll-based)
function useMoreVideos(enabled: boolean) {
  const [pages, setPages] = useState<YouTubeVideo[][]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const queries = useRef(["música 2025", "trending Vietnam", "phim hay 2025", "gaming highlights"]);
  const idx = useRef(0);

  const loadMore = async () => {
    if (loading || done || !enabled) return;
    setLoading(true);
    try {
      const q = queries.current[idx.current % queries.current.length];
      idx.current++;
      const res = await fetch(`/api/yt/search?q=${encodeURIComponent(q)}&type=video`);
      if (!res.ok) { setDone(true); return; }
      const data: YouTubeVideo[] = await res.json();
      if (data.length === 0) setDone(true);
      else setPages(p => [...p, data]);
    } catch { setDone(true); }
    setLoading(false);
  };

  return { extraVideos: pages.flat(), loadMore, loading: loading, done };
}

function VideoSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-video rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useLang();
  const { data: homeFeed, isLoading, error, refetch, isFetching } = useHomeVideos();
  const useFallback = !!error && !isLoading;
  const { data: fallback, isLoading: loadingFallback } = useFallbackVideos(useFallback);

  const primaryVideos: YouTubeVideo[] = homeFeed ?? fallback ?? [];
  const primaryLoading = isLoading || (useFallback && loadingFallback);

  const { extraVideos, loadMore, loading: loadingMore, done } = useMoreVideos(!primaryLoading);

  // Infinite scroll trigger
  const { ref: sentinelRef, inView } = useInView({ threshold: 0.1 });
  useEffect(() => {
    if (inView && !primaryLoading) loadMore();
  }, [inView, primaryLoading]);

  const allVideos = [...primaryVideos, ...extraVideos];
  // Deduplicate by id
  const seen = new Set<string>();
  const videos = allVideos.filter(v => {
    if (!v.id || seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Hero */}
        <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary/20 via-secondary to-background border border-white/5 p-8 md:p-10">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" /> Ad-Free · TTube
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight">
              Xem những gì bạn yêu thích,<br className="hidden sm:block" /> không quảng cáo.
            </h1>
            <div className="flex gap-3 pt-1">
              <Button asChild variant="default" size="sm" className="rounded-full gap-2">
                <Link href="/trending"><Flame className="w-4 h-4" />{t.trending}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href="/shorts">{t.shorts}</Link>
              </Button>
            </div>
          </div>
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-40 pointer-events-none" />
        </section>

        {/* Feed */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-display font-bold">
              {error ? "Đề xuất cho bạn" : "Trang chủ"}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => refetch()}
              disabled={isFetching} className="gap-2 text-muted-foreground">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Làm mới
            </Button>
          </div>

          {error && !useFallback && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-3 bg-secondary/50 rounded-xl">
              <AlertCircle className="h-4 w-4 text-orange-400 shrink-0" />
              <span>Không tải được feed chính, đang dùng đề xuất thay thế.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {videos.map(v => <VideoCard key={v.id} video={v} />)}
            {(primaryLoading || loadingMore) && Array.from({ length: 8 }).map((_, i) => (
              <VideoSkeleton key={`sk-${i}`} />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {!primaryLoading && !done && (
            <div ref={sentinelRef} className="h-16 flex items-center justify-center">
              {loadingMore && <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
            </div>
          )}

          {!primaryLoading && !loadingMore && videos.length === 0 && (
            <div className="text-center py-20 text-muted-foreground space-y-3">
              <p>Không tải được nội dung.</p>
              <Button variant="outline" onClick={() => refetch()}>Thử lại</Button>
            </div>
          )}
        </section>

        {/* Footer — required for Google OAuth branding verification */}
        <footer className="mt-16 pb-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/60">
          <Link href="/privacy" className="hover:text-muted-foreground transition-colors underline-offset-2 hover:underline">
            Chính sách quyền riêng tư
          </Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-muted-foreground transition-colors underline-offset-2 hover:underline">
            Điều khoản sử dụng
          </Link>
          <span>·</span>
          <span>© {new Date().getFullYear()} TTube</span>
        </footer>
      </div>
    </Layout>
  );
}
