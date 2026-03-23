import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Flame, Music, Gamepad2, Film, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/contexts/LangContext";
import type { YouTubeVideo } from "@shared/schema";

const CATEGORIES = [
  { key: "Now",    label: "Thịnh hành",  icon: TrendingUp },
  { key: "Music",  label: "Âm nhạc",     icon: Music      },
  { key: "Gaming", label: "Gaming",      icon: Gamepad2   },
  { key: "Movies", label: "Phim",        icon: Film       },
];

function useTrending(category: string) {
  return useQuery<YouTubeVideo[]>({
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

export default function TrendingPage() {
  const { t } = useLang();
  const [category, setCategory] = useState("Now");
  const { data: videos, isLoading, error } = useTrending(category);

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Flame className="h-8 w-8 text-orange-500" /> {t.trending}
            </h1>
            <p className="text-muted-foreground mt-1">Nội dung đang thịnh hành trên YouTube</p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <Button
              key={cat.key}
              variant={category === cat.key ? "default" : "outline"}
              size="sm"
              className={cn("rounded-full gap-2", category === cat.key && "shadow-lg shadow-primary/20")}
              onClick={() => setCategory(cat.key)}
            >
              <cat.icon className="h-4 w-4" />
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Grid */}
        {error ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>Không thể tải nội dung trending. Thử lại sau.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
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
                ))
              : videos?.map(v => <VideoCard key={v.id} video={v} />)
            }
          </div>
        )}
        {!isLoading && videos?.length === 0 && (
          <p className="text-center py-16 text-muted-foreground">Không có video nào.</p>
        )}
      </div>
    </Layout>
  );
}
