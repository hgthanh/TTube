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
import { Share2, Heart, Headphones, Wifi, ThumbsUp, ThumbsDown, Bell, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANShareDialog } from "@/components/video/LANShare";
import { useToast } from "@/hooks/use-toast";

export default function VideoPage() {
  const [match, params] = useRoute("/watch/:id");
  const id = params?.id || "";
  const { toast } = useToast();

  const [audioOnly, setAudioOnly] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favId, setFavId] = useState<number | null>(null);
  const [lanShareOpen, setLanShareOpen] = useState(false);
  const lanUrl = typeof window !== "undefined" ? window.location.href : "";

  // YT interaction states
  const [ytLike, setYtLike] = useState<"like" | "dislike" | null>(null);
  const [ytSubscribed, setYtSubscribed] = useState(false);
  const [hasCookie, setHasCookie] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const { isAuthenticated, authHeaders } = useAuth();
  const { t } = useLang();

  const { data: video, isLoading: loadingVideo } = useVideo(id);
  const { data: streamUrl, isLoading: loadingStream } = useStreamUrl(id);
  const { data: related } = useSearch(video?.title || "trending", "video");
  const { data: channel } = useChannel(video?.channelId || "");

  // Check if user has YT cookie (for authenticated actions)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/settings/yt-cookie/status", { headers: authHeaders() })
      .then(r => r.json()).then(d => setHasCookie(!!d.hasCookie)).catch(() => {});
  }, [isAuthenticated]);

  // Check favorite
  useEffect(() => {
    if (!id) return;
    if (isAuthenticated) {
      fetch(`/api/favorites/${id}/check`, { headers: authHeaders() })
        .then(r => r.json()).then(d => { setIsFavorite(d.isFavorite); setFavId(d.id ?? null); }).catch(() => {});
    } else {
      const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
      setIsFavorite(favs.some((f: any) => f.videoId === id));
    }
  }, [id, isAuthenticated]);

  // History
  useEffect(() => {
    if (!video?.id) return;
    const entry = { videoId: video.id, title: video.title || "Untitled", thumbnailUrl: video.thumbnail || "", channelName: video.channelTitle || "" };
    if (isAuthenticated) {
      fetch("/api/history", { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(entry) }).catch(() => {});
    } else {
      let hist = JSON.parse(localStorage.getItem("history") || "[]");
      hist = hist.filter((h: any) => h.videoId !== id);
      hist.unshift({ ...entry, watchedAt: new Date().toISOString() });
      localStorage.setItem("history", JSON.stringify(hist.slice(0, 50)));
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
      let favs = JSON.parse(localStorage.getItem("favorites") || "[]");
      if (isFavorite) { favs = favs.filter((f: any) => f.videoId !== id); setIsFavorite(false); }
      else { favs.push({ videoId: video.id, title: video.title, thumbnailUrl: video.thumbnail, channelName: video.channelTitle }); setIsFavorite(true); }
      localStorage.setItem("favorites", JSON.stringify(favs));
    }
  };

  // YT Like / Dislike
  const handleYtLike = async (action: "like" | "dislike") => {
    if (!hasCookie || !isAuthenticated) {
      toast({ title: "Cần đăng nhập YouTube", description: "Thêm cookie YouTube trong Cài đặt.", variant: "destructive" });
      return;
    }
    try {
      if (ytLike === action) {
        await fetch(`/api/yt/like/${id}`, { method: "DELETE", headers: authHeaders() });
        setYtLike(null);
        toast({ title: "Đã bỏ đánh giá" });
      } else {
        const endpoint = action === "like" ? `/api/yt/like/${id}` : `/api/yt/dislike/${id}`;
        await fetch(endpoint, { method: "POST", headers: authHeaders() });
        setYtLike(action);
        toast({ title: action === "like" ? "👍 Đã like" : "👎 Đã dislike" });
      }
    } catch { toast({ title: "Lỗi", variant: "destructive" }); }
  };

  // YT Subscribe
  const handleSubscribe = async () => {
    if (!hasCookie || !isAuthenticated || !video?.channelId) {
      toast({ title: "Cần đăng nhập YouTube", description: "Thêm cookie YouTube trong Cài đặt.", variant: "destructive" });
      return;
    }
    try {
      const method = ytSubscribed ? "DELETE" : "POST";
      await fetch(`/api/yt/subscribe/${video.channelId}`, { method, headers: authHeaders() });
      setYtSubscribed(s => !s);
      toast({ title: ytSubscribed ? "Đã hủy đăng ký" : "✅ Đã đăng ký kênh" });
    } catch { toast({ title: "Lỗi", variant: "destructive" }); }
  };

  // YT Comment
  const submitComment = async () => {
    if (!commentText.trim()) return;
    if (!hasCookie || !isAuthenticated) {
      toast({ title: "Cần đăng nhập YouTube", description: "Thêm cookie YouTube trong Cài đặt.", variant: "destructive" });
      return;
    }
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/yt/comment/${id}`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText }),
      });
      if (res.ok) {
        toast({ title: "✅ Đã đăng bình luận" });
        setCommentText(""); setShowComment(false);
      } else {
        const d = await res.json();
        toast({ title: "Lỗi: " + (d.message || "Không thể đăng"), variant: "destructive" });
      }
    } catch { toast({ title: "Lỗi kết nối", variant: "destructive" }); }
    setSubmittingComment(false);
  };

  if (!match) return null;

  return (
    <Layout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <VideoPlayer
            url={streamUrl ?? undefined}
            thumbnail={video?.thumbnail}
            isLoading={loadingVideo || loadingStream}
            audioOnly={audioOnly}
            videoId={id}
            videoTitle={video?.title}
          />

          {/* Title */}
          <h1 className="text-xl md:text-2xl font-display font-bold line-clamp-2">
            {loadingVideo ? <Skeleton className="h-8 w-3/4" /> : video?.title}
          </h1>

          {/* Channel info + actions */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-white/5">
            {/* Channel */}
            <div className="flex items-center gap-3">
              {loadingVideo ? <Skeleton className="h-10 w-48" /> : (
                <>
                  <Link href={`/channel/${video?.channelId}`}>
                    {(video?.channelThumbnail || channel?.thumbnail) ? (
                      <img src={video?.channelThumbnail || channel?.thumbnail} alt={video?.channelTitle}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20 cursor-pointer" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm cursor-pointer">
                        {video?.channelTitle?.[0] || "?"}
                      </div>
                    )}
                  </Link>
                  <div>
                    <Link href={`/channel/${video?.channelId}`}>
                      <h3 className="font-semibold hover:text-primary transition-colors cursor-pointer text-sm">
                        {video?.channelTitle || channel?.title || ""}
                      </h3>
                    </Link>
                    <p className="text-xs text-muted-foreground">{video?.subscriberCount || channel?.subscriberCount || ""}</p>
                  </div>
                  <Button
                    variant={ytSubscribed ? "default" : "secondary"}
                    size="sm"
                    className={cn("ml-2 rounded-full font-semibold gap-1", ytSubscribed && "bg-primary text-primary-foreground")}
                    onClick={handleSubscribe}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    {ytSubscribed ? "Đã đăng ký" : t.subscribe}
                  </Button>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Like / Dislike */}
              <div className="flex rounded-full border border-border overflow-hidden">
                <Button
                  variant="ghost" size="sm"
                  className={cn("rounded-none gap-1.5 px-3 border-r border-border", ytLike === "like" && "text-primary bg-primary/10")}
                  onClick={() => handleYtLike("like")}
                >
                  <ThumbsUp className={cn("w-4 h-4", ytLike === "like" && "fill-current")} />
                  {video?.likeCount || ""}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className={cn("rounded-none px-3", ytLike === "dislike" && "text-destructive bg-destructive/10")}
                  onClick={() => handleYtLike("dislike")}
                >
                  <ThumbsDown className={cn("w-4 h-4", ytLike === "dislike" && "fill-current")} />
                </Button>
              </div>

              <Button variant="outline" size="sm"
                className={cn("rounded-full gap-2", audioOnly && "bg-primary/10 border-primary text-primary")}
                onClick={() => setAudioOnly(!audioOnly)}>
                <Headphones className="w-4 h-4" /> {audioOnly ? t.audioModeOn : t.audioMode}
              </Button>

              <Button variant={isFavorite ? "default" : "secondary"} size="sm"
                className="rounded-full gap-2" onClick={toggleFavorite}>
                <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
                {isFavorite ? t.saved : t.save}
              </Button>

              <Button variant="secondary" size="sm" className="rounded-full gap-2"
                onClick={() => setShowComment(c => !c)}>
                <MessageCircle className="w-4 h-4" /> Bình luận
              </Button>

              <Button variant="secondary" size="sm" className="rounded-full gap-2"
                onClick={() => { if (navigator.share) navigator.share({ url: lanUrl, title: video?.title }); else navigator.clipboard?.writeText(lanUrl); }}>
                <Share2 className="w-4 h-4" /> {t.share}
              </Button>

              <Button variant="outline" size="sm" className="rounded-full gap-2"
                onClick={() => setLanShareOpen(true)}>
                <Wifi className="w-4 h-4" /> LAN P2P
              </Button>

              {lanShareOpen && (
                <LANShareDialog videoUrl={lanUrl} videoTitle={video?.title} onClose={() => setLanShareOpen(false)} />
              )}
            </div>
          </div>

          {/* Comment box */}
          {showComment && (
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold">
                {hasCookie ? "Viết bình luận YouTube" : "⚠️ Cần cookie YouTube (Cài đặt → YouTube)"}
              </p>
              <textarea
                className="w-full bg-background border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                rows={3}
                placeholder="Nhập bình luận..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                disabled={!hasCookie}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setShowComment(false); setCommentText(""); }}>Hủy</Button>
                <Button size="sm" className="gap-1.5" onClick={submitComment} disabled={submittingComment || !hasCookie || !commentText.trim()}>
                  <Send className="w-3.5 h-3.5" /> {submittingComment ? "Đang gửi..." : "Đăng"}
                </Button>
              </div>
            </div>
          )}

          {/* Views + description */}
          <div className="bg-secondary/30 rounded-xl p-4 text-sm whitespace-pre-wrap">
            <div className="flex gap-4 font-bold mb-2 text-foreground">
              <span>{video?.viewCount || ""}</span>
              {video?.publishedTime && <span>{video.publishedTime}</span>}
            </div>
            <p className="text-muted-foreground leading-relaxed">{video?.description || t.noDescription}</p>
          </div>
        </div>

        {/* Related videos */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-display font-bold text-lg px-1">{t.upNext}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {related?.filter(v => v.id !== id).map(v => <VideoCard key={v.id} video={v} />)}
            {!related && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="w-40 h-24 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
