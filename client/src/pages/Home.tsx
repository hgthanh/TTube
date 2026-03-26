import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/contexts/LangContext";
import { useInfiniteSearch } from "@/hooks/use-yt";
import type { YouTubeVideo } from "@shared/schema";
import { Link } from "wouter";
import { useState, useEffect } from "react";

function useHomeFeed() {
  return useQuery<YouTubeVideo[]>({
    queryKey: ["home_feed"],
    queryFn: async () => {
      const res = await fetch("/api/yt/home");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export default function Home() {
  const { t } = useLang();
  const { data: feed, isLoading, error, refetch, isFetching } = useHomeFeed();

  // Fallback search when home feed fails
  const [fallbackQuery] = useState(() => {
    try {
      const kw = JSON.parse(localStorage.getItem("user_keywords") || "[]");
      return kw.length > 0 ? kw[Math.floor(Math.random() * kw.length)] : "trending 2025";
    } catch { return "trending 2025"; }
  });
  const { data: fallback, isLoading: loadingFallback } = useInfiniteSearch(
    error ? fallbackQuery : "",
    "video"
  );

  const videos = error
    ? (fallback?.pages.flat() ?? [])
    : (feed ?? []);

  const loading = error ? loadingFallback : isLoading;

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

          {!loading && videos.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground space-y-3">
              <p>Không tải được nội dung.</p>
              <Button variant="outline" onClick={() => refetch()}>Thử lại</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
              {videos.map(v => <VideoCard key={v.id} video={v} />)}
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-video rounded-xl" />
                  <div className="flex gap-3">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
