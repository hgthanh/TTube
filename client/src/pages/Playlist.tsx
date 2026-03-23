import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "@/components/video/VideoCard";
import { ListVideo, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/contexts/LangContext";

interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  videoCount: number;
  thumbnail: string;
  channelTitle: string;
  videos: any[];
}

function usePlaylist(id: string) {
  return useQuery<PlaylistInfo>({
    queryKey: ["playlist", id],
    queryFn: async () => {
      const res = await fetch(`/api/yt/playlist/${id}`);
      if (!res.ok) throw new Error("Playlist not found");
      return res.json();
    },
    enabled: !!id,
  });
}

export default function PlaylistPage() {
  const [match, params] = useRoute("/playlist/:id");
  const { t } = useLang();
  const id = params?.id || "";
  const { data: playlist, isLoading, error } = usePlaylist(id);

  if (!match) return null;

  if (error) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">
          <ListVideo className="h-16 w-16 mx-auto opacity-20 mb-4" />
          <p>Không tìm thấy playlist.</p>
          <Button asChild variant="ghost" className="mt-4"><Link href="/">Về trang chủ</Link></Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-64 shrink-0">
            {isLoading ? (
              <Skeleton className="aspect-video rounded-2xl w-full" />
            ) : (
              <div className="relative rounded-2xl overflow-hidden aspect-video bg-muted">
                {playlist?.thumbnail && (
                  <img src={playlist.thumbnail} alt={playlist.title} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Play className="h-12 w-12 mx-auto mb-1 fill-white" />
                    <p className="text-sm font-semibold">{playlist?.videoCount} video</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
              </>
            ) : (
              <>
                <h1 className="text-2xl font-display font-bold">{playlist?.title}</h1>
                <p className="text-muted-foreground text-sm">{playlist?.channelTitle} · {playlist?.videoCount} video</p>
                {playlist?.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{playlist.description}</p>
                )}
                {playlist?.videos[0] && (
                  <Button asChild className="gap-2 mt-2">
                    <Link href={`/watch/${playlist.videos[0].id}`}>
                      <Play className="h-4 w-4 fill-current" /> Phát tất cả
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Video list */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ListVideo className="h-5 w-5 text-primary" /> Danh sách video
          </h2>
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl">
                  <div className="text-muted-foreground text-sm w-6 text-center shrink-0 pt-2">{i + 1}</div>
                  <Skeleton className="w-40 h-24 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            : playlist?.videos.map((v, i) => (
                <Link key={v.id} href={`/watch/${v.id}`}>
                  <div className="flex gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer group">
                    <div className="text-muted-foreground text-sm w-6 text-center shrink-0 pt-2">{i + 1}</div>
                    <div className="w-40 h-24 rounded-lg overflow-hidden shrink-0 relative">
                      <img src={v.thumbnails?.[0]?.url || v.thumbnail || ""} alt={v.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="font-medium line-clamp-2 group-hover:text-primary transition-colors">{v.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{v.channelTitle}</p>
                    </div>
                  </div>
                </Link>
              ))
          }
        </div>
      </div>
    </Layout>
  );
}
