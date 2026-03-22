import { Fragment } from "react";
import { useRoute } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannel, useChannelVideos } from "@/hooks/use-yt";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLang } from "@/contexts/LangContext";
import { Users } from "lucide-react";

export default function ChannelPage() {
  const [match, params] = useRoute("/channel/:id");
  const { t } = useLang();
  const id = params?.id || "";
  const { data: channel, isLoading: loadingChannel } = useChannel(id);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: loadingVideos } = useChannelVideos(id);
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) fetchNextPage();
  }, [inView, hasNextPage, fetchNextPage]);

  if (!match) return null;

  const allVideos = data?.pages.flatMap(p => p) ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Channel Header */}
        <div className="relative rounded-3xl overflow-hidden bg-card border border-white/5">
          {loadingChannel && !channel ? (
            <div className="h-32 md:h-48 w-full bg-muted animate-pulse" />
          ) : channel?.banner ? (
            <div className="h-32 md:h-48 w-full">
              <img src={channel.banner} className="w-full h-full object-cover" alt="Channel banner" />
            </div>
          ) : (
            <div className="h-24 md:h-36 w-full bg-gradient-to-br from-primary/20 to-primary/5" />
          )}

          <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center md:items-end">
            <Avatar className="w-24 h-24 md:w-32 md:h-32 border-4 border-background -mt-12 md:-mt-16 shadow-xl">
              <AvatarImage src={channel?.thumbnail} />
              <AvatarFallback className="text-3xl font-bold bg-primary/20 text-primary">
                {channel?.title?.[0] ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left space-y-2 flex-1">
              {loadingChannel && !channel ? (
                <>
                  <Skeleton className="h-10 w-64 mx-auto md:mx-0" />
                  <Skeleton className="h-4 w-32 mx-auto md:mx-0" />
                </>
              ) : (
                <>
                  <h1 className="text-2xl md:text-4xl font-display font-bold">{channel?.title}</h1>
                  {channel?.subscriberCount && (
                    <p className="text-muted-foreground flex items-center gap-1.5 justify-center md:justify-start">
                      <Users className="h-4 w-4" /> {channel.subscriberCount}
                    </p>
                  )}
                  {channel?.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 max-w-xl">{channel.description}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Videos Grid */}
        <div className="space-y-6">
          <h2 className="text-xl font-display font-bold">
            {loadingVideos ? <Skeleton className="h-7 w-24" /> : `${allVideos.length} ${t.videosCount}`}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {allVideos.map((video: any) => (
              <VideoCard key={video.id} video={video} />
            ))}
            {(loadingVideos || isFetchingNextPage) && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>

          {!loadingVideos && allVideos.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <p>No videos found for this channel.</p>
            </div>
          )}

          <div ref={ref} className="h-10" />
        </div>
      </div>
    </Layout>
  );
}
