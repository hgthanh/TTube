import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideo, useStreamUrl, useSearch } from "@/hooks/use-yt";
import { Share2, Heart, Headphones, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";

export default function VideoPage() {
  const [match, params] = useRoute("/watch/:id");
  const id = params?.id || "";
  const [audioOnly, setAudioOnly] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [lanUrl, setLanUrl] = useState("");

  useEffect(() => {
    setLanUrl(window.location.href);
  }, [id]);

  const { data: video, isLoading: loadingVideo } = useVideo(id);
  const streamUrl = useStreamUrl(id);
  const { data: related } = useSearch(video?.title || "related", "video");

  useEffect(() => {
    const saved = localStorage.getItem("favorites");
    if (saved) {
      const favorites = JSON.parse(saved);
      setIsFavorite(favorites.some((f: any) => f.videoId === id));
    }
    
    if (video) {
      const historyJson = localStorage.getItem("history");
      let history = historyJson ? JSON.parse(historyJson) : [];
      history = history.filter((h: any) => h.videoId !== id);
      history.unshift({
        videoId: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnail,
        channelName: video.channelTitle,
        watchedAt: new Date().toISOString()
      });
      localStorage.setItem("history", JSON.stringify(history.slice(0, 50)));
    }
  }, [id, video]);

  const toggleFavorite = () => {
    if (!video) return;
    const saved = localStorage.getItem("favorites");
    let favorites = saved ? JSON.parse(saved) : [];
    
    if (isFavorite) {
      favorites = favorites.filter((f: any) => f.videoId !== id);
      setIsFavorite(false);
    } else {
      favorites.push({
        videoId: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnail,
        channelName: video.channelTitle,
      });
      setIsFavorite(true);
    }
    localStorage.setItem("favorites", JSON.stringify(favorites));
  };

  if (!match) return null;

  return (
    <Layout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Player & Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
             <VideoPlayer
                url={streamUrl || undefined}
                thumbnail={video?.thumbnail}
                isLoading={loadingVideo}
                audioOnly={audioOnly}
                videoId={id}
             />
             <div className="flex items-center justify-between">
                <h1 className="text-xl md:text-2xl font-display font-bold line-clamp-2">
                  {loadingVideo ? <Skeleton className="h-8 w-3/4" /> : video?.title}
                </h1>
             </div>
          </div>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/5">
             <div className="flex items-center gap-4">
               {loadingVideo ? (
                 <Skeleton className="h-10 w-40" />
               ) : (
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                     <Link href={`/channel/${video?.channelId}`}>
                        {video?.channelTitle?.[0]}
                     </Link>
                   </div>
                   <div>
                     <Link href={`/channel/${video?.channelId}`}>
                        <h3 className="font-semibold hover:text-primary transition-colors cursor-pointer">{video?.channelTitle}</h3>
                     </Link>
                     <p className="text-xs text-muted-foreground">Subscribers hidden</p>
                   </div>
                   <Button variant="secondary" size="sm" className="ml-4 rounded-full font-semibold">
                     Subscribe
                   </Button>
                 </div>
               )}
             </div>

             <div className="flex items-center gap-2">
               <Button
                  variant="outline"
                  size="sm"
                  className={cn("rounded-full gap-2", audioOnly && "bg-primary/10 border-primary text-primary")}
                  onClick={() => setAudioOnly(!audioOnly)}
               >
                 <Headphones className="w-4 h-4" />
                 {audioOnly ? "Audio Mode On" : "Audio Mode"}
               </Button>

               <Button
                  variant={isFavorite ? "default" : "secondary"}
                  size="sm"
                  className="rounded-full gap-2"
                  onClick={toggleFavorite}
               >
                 <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
                 {isFavorite ? "Saved" : "Save"}
               </Button>

               <Button variant="secondary" size="sm" className="rounded-full gap-2">
                 <Share2 className="w-4 h-4" /> Share
               </Button>

               <Dialog>
                 <DialogTrigger asChild>
                   <Button variant="outline" size="sm" className="rounded-full gap-2">
                     <QrCode className="w-4 h-4" /> LAN Share
                   </Button>
                 </DialogTrigger>
                 <DialogContent className="sm:max-w-md bg-card border-border">
                   <DialogHeader>
                     <DialogTitle>Share via LAN</DialogTitle>
                   </DialogHeader>
                   <div className="flex flex-col items-center justify-center p-6 space-y-4">
                     <div className="p-4 bg-white rounded-xl">
                       <QRCodeSVG value={lanUrl} size={200} />
                     </div>
                     <p className="text-sm text-muted-foreground text-center">
                       Scan this QR code with another device on the same network to watch this video.
                     </p>
                     <code className="bg-muted px-2 py-1 rounded text-xs break-all max-w-full">
                       {lanUrl}
                     </code>
                   </div>
                 </DialogContent>
               </Dialog>
             </div>
          </div>

          {/* Description */}
          <div className="bg-secondary/30 rounded-xl p-4 text-sm whitespace-pre-wrap">
             <div className="flex gap-4 font-bold mb-2">
                <span>{video?.viewCount || "0 views"}</span>
                <span>{video?.publishedTime || "Just now"}</span>
             </div>
             <p className="text-muted-foreground leading-relaxed">
               {video?.description || "No description available."}
             </p>
          </div>
        </div>

        {/* Right Column: Recommended */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-display font-bold text-lg px-1">Up Next</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {related?.filter(v => v.id !== id).map((video) => (
               <VideoCard key={video.id} video={video} />
            ))}
            {!related && Array.from({length: 4}).map((_, i) => (
               <div key={i} className="flex gap-2">
                  <Skeleton className="w-40 h-24 rounded-lg" />
                  <div className="flex-1 space-y-2">
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-3 w-1/2" />
                  </div>
               </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
