import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Flame, Sparkles, RefreshCw } from "lucide-react";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/contexts/LangContext";
import type { YouTubeVideo } from "@shared/schema";
import { Link } from "wouter";

function useHomeFeed() {
  return useQuery<YouTubeVideo[]>({
    queryKey: ["home_feed"],
    queryFn: async () => {
      const res = await fetch("/api/yt/home");
      if (!res.ok) throw new Error("Failed to load home feed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

function useTrendingPreview() {
  return useQuery<YouTubeVideo[]>({
    queryKey: ["trending_preview"],
    queryFn: async () => {
      const res = await fetch("/api/yt/trending?category=Now");
      if (!res.ok) throw new Error("Failed to load trending");
      const data = await res.json();
      return data.slice(0, 6);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export default function Home() {
  const { t } = useLang();
  const { data: homeFeed, isLoading: loadingHome, error: homeError, refetch } = useHomeFeed();
  const { data: trendingPreview, isLoading: loadingTrending } = useTrendingPreview();

  // Fallback: user keyword search if home feed fails
  const [fallbackQuery] = useState(() => {
    try {
      const kw = JSON.parse(localStorage.getItem("user_keywords") || "[]");
      return kw.length > 0 ? kw[Math.floor(Math.random() * kw.length)] : "music";
    } catch { return "music"; }
  });

  const showFallback = !!homeError;

  const allVideos = homeFeed ?? [];
  const loading = loadingHome;

  return (
    <Layout>
      <div className="space-y-10 animate-in fade-in duration-500">

        {/* Hero banner */}
        <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary/20 via-secondary to-background border border-white/5 p-8 md:p-12">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" /> Ad-Free · TTube
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold leading-tight">
              Xem những gì bạn yêu thích,<br/> không quảng cáo.
            </h1>
            <p className="text-lg text-muted-foreground">
              Trải nghiệm nội dung đẹp, sạch, hỗ trợ phát nền và PiP.
            </p>
            <div className="flex gap-3 pt-2">
              <Button asChild variant="default" className="rounded-full">
                <Link href="/trending">{t.trending}</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/shorts">{t.shorts}</Link>
              </Button>
            </div>
          </div>
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50" />
        </section>

        {/* Trending preview row */}
        {(loadingTrending || (trendingPreview && trendingPreview.length > 0)) && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-display font-bold flex items-center gap-2">
                <Flame className="w-6 h-6 text-orange-500" /> {t.trending}
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link href="/trending">Xem thêm →</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {loadingTrending
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-video rounded-xl" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))
                : trendingPreview?.map(v => <VideoCard key={v.id} video={v} compact />)
              }
            </div>
          </section>
        )}

        {/* Home feed */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-display font-bold">
              {showFallback ? "Đề xuất cho bạn" : "Trang chủ"}
            </h2>
            {showFallback && (
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Thử lại
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {allVideos.map(v => <VideoCard key={v.id} video={v} />)}
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

          {!loading && allVideos.length === 0 && (
            <div className="text-center py-20 text-muted-foreground space-y-3">
              <p>Không có nội dung. Thử tìm kiếm hoặc xem Trending.</p>
              <Button asChild variant="outline">
                <Link href="/trending"><Flame className="w-4 h-4 mr-2" /> Trending</Link>
              </Button>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
