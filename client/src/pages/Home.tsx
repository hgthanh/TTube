import { useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteSearch } from "@/hooks/use-yt";
import { Button } from "@/components/ui/button";
import { Flame, Sparkles } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { useEffect, Fragment, useState } from "react";

export default function Home() {
  const [suggestionQuery, setSuggestionQuery] = useState("music");

  useEffect(() => {
    const keywords = localStorage.getItem("user_keywords");
    if (keywords) {
      const parsed = JSON.parse(keywords);
      if (parsed.length > 0) {
        // Randomly pick a keyword for fresh recommendations
        setSuggestionQuery(parsed[Math.floor(Math.random() * parsed.length)]);
      }
    }
  }, []);

  const { 
    data, 
    isLoading, 
    error, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useInfiniteSearch(suggestionQuery, "video");

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  if (error) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <h2 className="text-2xl font-bold">Something went wrong</h2>
          <p className="text-muted-foreground max-w-md">
            We couldn't load the videos. This might be due to API rate limits or connectivity issues.
          </p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </Layout>
    );
  }

  const allVideos = data?.pages.flat() || [];

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
        {/* Welcome Section */}
        <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary/20 via-secondary to-background border border-white/5 p-8 md:p-12">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              Ad-Free Experience
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold leading-tight">
              Watch what you love, <br/> without interruptions.
            </h1>
            <p className="text-lg text-muted-foreground">
              Enjoy your favorite content in a beautiful, distraction-free environment.
              Background play supported.
            </p>
          </div>
          {/* Decorative background blur */}
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50" />
        </section>

        {/* Featured Section */}
        {!isLoading && allVideos.length > 0 && (
          <section>
             <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
               <Flame className="w-6 h-6 text-orange-500" /> Trending Now
             </h2>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <VideoCard video={allVideos[0]} featured />
                 <div className="space-y-6 hidden lg:block">
                    {allVideos.slice(1, 3).map((video) => (
                      <VideoCard key={video.id} video={video} />
                    ))}
                 </div>
             </div>
          </section>
        )}

        {/* Main Grid */}
        <section>
          <h2 className="text-xl font-display font-bold mb-6">Recommended</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {allVideos.slice(3).map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
            {(isLoading || isFetchingNextPage) && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video rounded-xl" />
                <div className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div ref={ref} className="h-10" />
        </section>
      </div>
    </Layout>
  );
}
