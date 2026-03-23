import { Link } from "wouter";
import { Play } from "lucide-react";
import type { YouTubeVideo } from "@shared/schema";
import { cn } from "@/lib/utils";

interface VideoCardProps {
  video: YouTubeVideo;
  featured?: boolean;
  compact?: boolean;
}

export function VideoCard({ video, featured = false, compact = false }: VideoCardProps) {
  return (
    <Link href={`/watch/${video.id}`} className="group block cursor-pointer">
      <div className={cn(
        "relative rounded-xl overflow-hidden bg-card border border-border/50 hover:border-primary/50 transition-all duration-300",
        featured ? "aspect-[2/1]" : "aspect-video"
      )}>
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {/* Duration badge */}
        {video.lengthSeconds && (
           <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 backdrop-blur-md rounded text-xs font-mono font-medium text-white ring-1 ring-white/10">
             {new Date(parseInt(video.lengthSeconds) * 1000).toISOString().substr(11, 8).replace(/^00:/, '')}
           </div>
        )}

        {/* Hover play button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="bg-primary/90 rounded-full p-4 shadow-xl transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-6 h-6 text-white fill-current" />
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-3">
         {/* Simple avatar placeholder if not available in this minimal object */}
         <div className="h-9 w-9 rounded-full bg-secondary flex-shrink-0 overflow-hidden border border-white/10">
            {video.channelTitle ? (
               <Link href={`/channel/${video.channelId}`}>
                  <div className="w-full h-full flex items-center justify-center bg-primary/20 text-primary font-bold text-xs cursor-pointer hover:bg-primary/30 transition-colors">
                    {video.channelTitle[0]}
                  </div>
               </Link>
            ) : null}
         </div>

         <div className="flex-1 min-w-0">
           <h3 className={cn(
             "font-semibold leading-tight text-foreground group-hover:text-primary transition-colors",
             featured ? "text-lg md:text-xl" : "text-sm md:text-base line-clamp-2"
           )}>
             {video.title}
           </h3>
           <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-1 items-center">
             <Link href={`/channel/${video.channelId}`}>
                <span className="font-medium hover:text-primary transition-colors cursor-pointer">{video.channelTitle}</span>
             </Link>
             {video.viewCount && (
               <>
                 <span>•</span>
                 <span>{video.viewCount} views</span>
               </>
             )}
             {video.publishedTime && (
               <>
                 <span>•</span>
                 <span>{video.publishedTime}</span>
               </>
             )}
           </div>
         </div>
      </div>
    </Link>
  );
}
