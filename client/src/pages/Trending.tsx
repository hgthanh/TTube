import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Music, Gamepad2, Film, TrendingUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useLang } from "@/contexts/LangContext";

interface TrendingVideo {
  id: string; rank: number; title: string; thumbnail: string;
  channelTitle: string; channelId: string;
  viewCount: string; publishedTime: string; lengthSeconds: string; isShort: boolean;
}

const CATEGORIES = [
  { key: "Now",    label: "Thịnh hành",  icon: TrendingUp, color: "text-orange-400" },
  { key: "Music",  label: "Âm nhạc",     icon: Music,      color: "text-pink-400"   },
  { key: "Gaming", label: "Gaming",      icon: Gamepad2,   color: "text-green-400"  },
  { key: "Movies", label: "Phim",        icon: Film,       color: "text-blue-400"   },
];

function useTrending(category: string) {
  return useQuery<TrendingVideo[]>({
    queryKey: ["trending", category],
    queryFn: async () => {
      const res = await fetch(`/api/yt/trending?category=${category}`);
      if (!res.ok) throw new Error("Failed to load trending");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function formatSeconds(s: string) {
  const n = parseInt(s, 10);
  if (!n) return "";
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function TrendingPage() {
  const { t } = useLang();
  const [category, setCategory] = useState("Now");
  const { data: videos, isLoading, error, refetch, isFetching } = useTrending(category);
  const catInfo = CATEGORIES.find(c => c.key === category)!;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-5">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Flame className="h-8 w-8 text-orange-500" />
              {t.trending}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Nội dung đang thịnh hành trên YouTube</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Làm mới
          </Button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border",
                category === cat.key
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                  : "border-border hover:border-primary/40 hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
              )}
            >
              <cat.icon className={cn("h-4 w-4", category === cat.key ? "text-primary-foreground" : cat.color)} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error && !isLoading && (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground">Không thể tải nội dung. Vui lòng thử lại.</p>
            <Button variant="outline" onClick={() => refetch()}>Thử lại</Button>
          </div>
        )}

        {/* Ranked list — top 3 big, rest as list */}
        {!error && (
          <>
            {/* Top 3 featured */}
            {(isLoading || (videos && videos.length > 0)) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-3">
                        <Skeleton className="aspect-video rounded-2xl" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    ))
                  : videos?.slice(0, 3).map((v) => (
                      <Link key={v.id} href={`/watch/${v.id}`}>
                        <div className="group cursor-pointer space-y-3">
                          <div className="relative aspect-video rounded-2xl overflow-hidden bg-muted">
                            <img src={v.thumbnail} alt={v.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            {/* Rank badge */}
                            <div className="absolute top-2 left-2">
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-xl font-display font-black shadow-lg",
                                v.rank === 1 ? "bg-yellow-400 text-yellow-900"
                                : v.rank === 2 ? "bg-slate-300 text-slate-800"
                                : "bg-amber-600 text-amber-100"
                              )}>
                                #{v.rank}
                              </div>
                            </div>
                            {/* Duration */}
                            {v.lengthSeconds && v.lengthSeconds !== "0" && (
                              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                                {formatSeconds(v.lengthSeconds)}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div>
                            <h3 className="font-semibold line-clamp-2 text-sm group-hover:text-primary transition-colors">{v.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{v.channelTitle}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {v.viewCount && <span className="text-xs text-muted-foreground">{v.viewCount}</span>}
                              {v.publishedTime && <span className="text-xs text-muted-foreground">· {v.publishedTime}</span>}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))
                }
              </div>
            )}

            {/* Rank 4+ as numbered list */}
            {!isLoading && videos && videos.length > 3 && (
              <div className="space-y-1 border-t border-white/5 pt-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">
                  Tiếp theo
                </h2>
                {videos.slice(3).map((v) => (
                  <Link key={v.id} href={`/watch/${v.id}`}>
                    <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer group">
                      {/* Rank number */}
                      <span className="text-2xl font-black text-muted-foreground/40 w-8 text-center shrink-0 font-display">
                        {v.rank}
                      </span>
                      {/* Thumbnail */}
                      <div className="relative w-36 h-20 rounded-lg overflow-hidden shrink-0 bg-muted">
                        <img src={v.thumbnail} alt={v.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        {v.lengthSeconds && v.lengthSeconds !== "0" && (
                          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 py-0.5 rounded font-mono">
                            {formatSeconds(v.lengthSeconds)}
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium line-clamp-2 text-sm group-hover:text-primary transition-colors">{v.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{v.channelTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {v.viewCount && <span className="text-xs text-muted-foreground">{v.viewCount}</span>}
                          {v.publishedTime && <span className="text-xs text-muted-foreground">· {v.publishedTime}</span>}
                        </div>
                      </div>
                      {/* Category badge */}
                      <Badge variant="outline" className={cn("shrink-0 hidden sm:flex gap-1", catInfo.color)}>
                        <catInfo.icon className="h-3 w-3" /> {catInfo.label}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Loading skeleton for list */}
            {isLoading && (
              <div className="space-y-2 border-t border-white/5 pt-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3">
                    <Skeleton className="w-8 h-6 rounded" />
                    <Skeleton className="w-36 h-20 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
