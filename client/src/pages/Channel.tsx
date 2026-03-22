import { useRoute } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannel, useChannelVideos } from "@/hooks/use-yt";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function ChannelPage() {
  const [match, params] = useRoute("/channel/:id");
  const id = params?.id || "";
  const { data: channel, isLoading: loadingChannel } = useChannel(id);
  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: loadingVideos 
  } = useChannelVideos(id);

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  if (!match) return null;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Channel Header */}
        <div className="relative rounded-3xl overflow-hidden bg-card border border-white/5">
          {channel?.banner && (
            <div className="h-32 md:h-48 w-full">
              <img src={channel.banner} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center md:items-end">
             <Avatar className="w-24 h-24 md:w-32 md:h-32 border-4 border-background -mt-12 md:-mt-16">
               <AvatarImage src={channel?.thumbnail} />
               <AvatarFallback>{channel?.title?.[0]}</AvatarFallback>
             </Avatar>
             <div className="text-center md:text-left space-y-2 flex-1">
               <h1 className="text-2xl md:text-4xl font-display font-bold">{channel?.title || <Skeleton className="h-10 w-48" />}</h1>
               <p className="text-muted-foreground">{channel?.subscriberCount}</p>
             </div>
          </div>
        </div>

        {/* Videos Grid */}
        <div className="space-y-6">
          <h2 className="text-xl font-display font-bold">Videos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {data?.pages.map((page, i) => (
              <Fragment key={i}>
                {page.map((video: any) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </Fragment>
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
          <div ref={ref} className="h-10" />
        </div>
      </div>
    </Layout>
  );
}

import { Fragment } from "react";
