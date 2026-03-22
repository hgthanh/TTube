import { useLocation, Link } from "wouter";
import { useInfiniteSearch } from "@/hooks/use-yt";
import { Layout } from "@/components/layout/Layout";
import { VideoCard } from "@/components/video/VideoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { useEffect, Fragment } from "react";

export default function Search() {
  const [location] = useLocation();
  const query = new URLSearchParams(window.location.search).get("q") || "";

  const { 
    data, 
    isLoading, 
    error, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useInfiniteSearch(query);

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  const results = data?.pages.flat() || [];

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold">
          Search results for <span className="text-primary">"{query}"</span>
        </h1>

        {error && (
          <div className="p-6 rounded-xl bg-destructive/10 text-destructive flex items-center gap-4">
            <AlertCircle className="w-6 h-6" />
            <p>Could not fetch search results. Please try again later.</p>
          </div>
        )}

        <div className="space-y-6">
          {results.map((item) => (
            <div key={item.id} className="group flex flex-col sm:flex-row gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors">
               <div className="w-full sm:w-64 aspect-video flex-shrink-0 relative rounded-lg overflow-hidden">
                  <Link href={`/watch/${item.id}`}>
                    <img src={item.thumbnail} className="w-full h-full object-cover cursor-pointer" />
                  </Link>
               </div>
               <div className="flex-1 min-w-0 py-1">
                  <h3 className="text-lg font-semibold line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                    <Link href={`/watch/${item.id}`}>{item.title}</Link>
                  </h3>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                     <span>{item.viewCount || 'Channel'}</span>
                     {item.publishedTime && (
                        <><span>•</span><span>{item.publishedTime}</span></>
                     )}
                  </div>
                  {item.channelId && (
                      <Link href={`/channel/${item.channelId}`}>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-primary transition-colors">
                            <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                                {item.channelTitle?.[0]}
                            </div>
                            <span>{item.channelTitle}</span>
                        </div>
                      </Link>
                  )}
               </div>
            </div>
          ))}

          {(isLoading || isFetchingNextPage) && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="w-40 h-24 sm:w-64 sm:h-36 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-8 rounded-full mt-2" />
              </div>
            </div>
          ))}

          {!isLoading && results.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              No results found.
            </div>
          )}
        </div>
        <div ref={ref} className="h-10" />
      </div>
    </Layout>
  );
}
