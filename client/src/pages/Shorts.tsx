import { Layout } from "@/components/layout/Layout";
import { useInfiniteSearch } from "@/hooks/use-yt";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { Zap } from "lucide-react";

export default function Shorts() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteSearch("youtube shorts", "video");
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) fetchNextPage();
  }, [inView, hasNextPage, fetchNextPage]);

  const allShorts = data?.pages.flat() || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-white/5 pb-4">
          <Zap className="w-6 h-6 text-red-500 fill-current" />
          <h1 className="text-2xl font-display font-bold">Shorts</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {allShorts.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
          {isLoading && Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
          ))}
        </div>
        <div ref={ref} className="h-10" />
      </div>
    </Layout>
  );
}
