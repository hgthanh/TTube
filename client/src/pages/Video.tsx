import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideo, useStreamUrl, useSearch, useChannel } from "@/hooks/use-yt";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Share2, Heart, Headphones, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";

export default function VideoPage() {
  const [match, params] = useRoute("/watch/:id");
  const id = params?.id || "";
  const [audioOnly, setAudioOnly] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favId, setFavId] = useState<number | null>(null);
  const [lanUrl, setLanUrl] = useState("");
  const { isAuthenticated, authHeaders } = useAuth();
  const { t } = useLang();

  useEffect(() => { setLanUrl(window.location.href); }, [id]);

  const { data: video, isLoading: loadingVideo } = useVideo(id);
  const { data: streamUrl, isLoading: loadingStream } = useStreamUrl(id);
  const { data: related } = useSearch(video?.title || "trending", "video");
  const { data: channel } = useChannel(video?.channelId || "");

  // Check favorite status
  useEffect(() => {
    if (!id) return;
    if (isAuthenticated) {
      fetch(`/api/favorites/${id}/check`, { headers: authHeaders() })
        .then(r => r.json()).then(d => { setIsFavorite(d.isFavorite); setFavId(d.id ?? null); }).catch(() => {});
    } else {
      const saved = localStorage.getItem("favorites");
      const favs = saved ? JSON.parse(saved) : [];
      setIsFavorite(favs.some((f: any) => f.videoId === id));
    }
  }, [id, isAuthenticated]);

  // Add to history — only when video is fully loaded with a valid id
  useEffect(() => {
    if (!video?.id || !id) return;
    const entry = {
      videoId: video.id,
      title: video.title || "Untitled",
      thumbnailUrl: video.thumbnail || "",
      channelName: video.channelTitle || "",
    };
    if (isAuthenticated) {
      fetch("/api/history", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {});
    } else {
      const historyJson = localStorage.getItem("history");
      let history = historyJson ? JSON.parse(historyJson) : [];
      history = history.filter((h: any) => h.videoId !== id);
      history.unshift({ ...entry, watchedAt: new Date().toISOString() });
      localStorage.setItem("history", JSON.stringify(history.slice(0, 50)));
    }
  }, [video?.id, isAuthenticated]);

  const toggleFavorite = async () => {
    if (!video) return;
    if (isAuthenticated) {
      if (isFavorite && favId) {
        await fetch(`/api/favorites/${favId}`, { method: "DELETE", headers: authHeaders() });
        setIsFavorite(false); setFavId(null);
      } else {
        const res = await fetch("/api/favorites", {
          method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: video.id, title: video.title, thumbnailUrl: video.thumbnail, channelName: video.channelTitle }),
        });
        const data = await res.json();
        setIsFavorite(true); setFavId(data.id ?? null);
      }
    } else {
      const saved = localStorage.getItem("favorites");
      let favs = saved ? JSON.parse(saved) : [];
      if (isFavorite) {
        favs = favs.filter((f: any) => f.videoId !== id);
        setIsFavorite(false);
      } else {
        favs.push({ videoId: video.id, title: video.title, thumbnailUrl: video.thumbnail, channelName: video.channelTitle });
        setIsFavorite(true);
      }
      localStorage.setItem("favorites", JSON.stringify(favs));
    }
  };

  if (!match) return null;

  return (
    <Layout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <VideoPlayer url={streamUrl ?? undefined} thumbnail={video?.thumbnail} isLoading={loadingVideo || loadingStream} audioOnly={audioOnly} videoId={id} />
            <div className="flex items-center justify-between">
              <h1 className="text-xl md:text-2xl font-display font-bold line-clamp-2">
                {loadingVideo ? <Skeleton className="h-8 w-3/4" /> : video?.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/5">
            <div className="flex items-center gap-4">
              {loadingVideo ? <Skeleton className="h-10 w-40" /> : (
                <div className="flex items-center gap-3">
                  <Link href={`/channel/${video?.channelId}`}>
                    {(video?.channelThumbnail || channel?.thumbnail) ? (
                      <img
                        src={video?.channelThumbnail || channel?.thumbnail}
                        alt={video?.channelTitle}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {video?.channelTitle?.[0] || "?"}
                      </div>
                    )}
                  </Link>
                  <div>
                    <Link href={`/channel/${video?.channelId}`}>
                      <h3 className="font-semibold hover:text-primary transition-colors cursor-pointer">
                        {video?.channelTitle || channel?.title || <Skeleton className="h-4 w-32" />}
                      </h3>
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {video?.subscriberCount || channel?.subscriberCount || ""}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" className="ml-4 rounded-full font-semibold">{t.subscribe}</Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className={cn("rounded-full gap-2", audioOnly && "bg-primary/10 border-primary text-primary")} onClick={() => setAudioOnly(!audioOnly)}>
                <Headphones className="w-4 h-4" /> {audioOnly ? t.audioModeOn : t.audioMode}
              </Button>
              <Button variant={isFavorite ? "default" : "secondary"} size="sm" className="rounded-full gap-2" onClick={toggleFavorite}>
                <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} /> {isFavorite ? t.saved : t.save}
              </Button>
              <Button variant="secondary" size="sm" className="rounded-full gap-2">
                <Share2 className="w-4 h-4" /> {t.share}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full gap-2"><QrCode className="w-4 h-4" /> {t.lanShare}</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-card border-border">
                  <DialogHeader><DialogTitle>{t.lanShare}</DialogTitle></DialogHeader>
                  <div className="flex flex-col items-center p-6 space-y-4">
                    <div className="p-4 bg-white rounded-xl"><QRCodeSVG value={lanUrl} size={200} /></div>
                    <code className="bg-muted px-2 py-1 rounded text-xs break-all max-w-full">{lanUrl}</code>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="bg-secondary/30 rounded-xl p-4 text-sm whitespace-pre-wrap">
            <div className="flex gap-4 font-bold mb-2 text-foreground">
              <span>{video?.viewCount || ""}</span>
              {video?.publishedTime && <span>{video.publishedTime}</span>}
            </div>
            <p className="text-muted-foreground leading-relaxed">{video?.description||t.noDescription}</p>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-display font-bold text-lg px-1">{t.upNext}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {related?.filter(v=>v.id!==id).map(v=><VideoCard key={v.id} video={v} />)}
            {!related && Array.from({length:4}).map((_,i)=>(
              <div key={i} className="flex gap-2">
                <Skeleton className="w-40 h-24 rounded-lg" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
