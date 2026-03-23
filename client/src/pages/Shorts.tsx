import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Heart, MessageCircle, Share2, Volume2, VolumeX, ChevronUp, ChevronDown, X, Pause, Play } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import type { YouTubeVideo } from "@shared/schema";
import { cn } from "@/lib/utils";

// Fetch shorts via search
function useShorts() {
  return useQuery<YouTubeVideo[]>({
    queryKey: ["shorts_feed"],
    queryFn: async () => {
      const res = await fetch("/api/yt/search?q=shorts+viral+2025&type=video");
      if (!res.ok) throw new Error("Failed");
      const data: YouTubeVideo[] = await res.json();
      return data.filter(v => v.isShort || parseInt(v.lengthSeconds) < 60);
    },
    staleTime: 5 * 60 * 1000,
  });
}

interface ShortItemProps {
  video: YouTubeVideo;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}

function ShortItem({ video, isActive, isMuted, onToggleMute }: ShortItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const { t } = useLang();

  // Fetch stream URL when active
  useEffect(() => {
    if (!isActive) {
      setStreamUrl(null);
      videoRef.current?.pause();
      return;
    }
    fetch(`/api/yt/stream/${video.id}`, { method: "HEAD", redirect: "manual" })
      .then(r => {
        if (r.status === 0 || r.status === 302 || (r.status >= 200 && r.status < 300)) {
          setStreamUrl(`/api/yt/stream/${video.id}`);
        }
      })
      .catch(() => {});
  }, [isActive, video.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = isMuted;
    if (isActive && streamUrl) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [isActive, streamUrl, isMuted]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* Video / thumbnail */}
      {streamUrl ? (
        <video
          ref={videoRef}
          src={streamUrl}
          loop
          playsInline
          muted={isMuted}
          className="h-full w-full object-contain"
          onClick={togglePlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      ) : (
        <div className="relative w-full h-full cursor-pointer" onClick={togglePlay}>
          <img src={video.thumbnail} alt={video.title}
            className="h-full w-full object-cover opacity-60" />
          {/* Fallback: embed if no stream */}
          {isActive && !streamUrl && (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${video.id}&rel=0&controls=0&modestbranding=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media"
              title={video.title}
            />
          )}
        </div>
      )}

      {/* Play/pause overlay */}
      {streamUrl && !isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
            <Play className="h-8 w-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Right action buttons */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        {/* Channel avatar */}
        <Link href={`/channel/${video.channelId}`}>
          <div className="w-10 h-10 rounded-full bg-primary/30 border-2 border-white overflow-hidden flex items-center justify-center font-bold text-white text-sm">
            {video.channelTitle?.[0] ?? "?"}
          </div>
        </Link>

        {/* Like */}
        <button className="flex flex-col items-center gap-1" onClick={() => setLiked(l => !l)}>
          <Heart className={cn("h-7 w-7 text-white drop-shadow", liked && "fill-red-500 text-red-500")} />
          <span className="text-white text-xs drop-shadow font-medium">Like</span>
        </button>

        {/* Comment */}
        <Link href={`/watch/${video.id}`}>
          <button className="flex flex-col items-center gap-1">
            <MessageCircle className="h-7 w-7 text-white drop-shadow" />
            <span className="text-white text-xs drop-shadow font-medium">Comments</span>
          </button>
        </Link>

        {/* Share */}
        <button className="flex flex-col items-center gap-1" onClick={() => {
          if (navigator.share) navigator.share({ url: `${window.location.origin}/watch/${video.id}`, title: video.title });
          else navigator.clipboard?.writeText(`${window.location.origin}/watch/${video.id}`);
        }}>
          <Share2 className="h-7 w-7 text-white drop-shadow" />
          <span className="text-white text-xs drop-shadow font-medium">Share</span>
        </button>

        {/* Mute */}
        <button onClick={onToggleMute} className="flex flex-col items-center gap-1">
          {isMuted
            ? <VolumeX className="h-7 w-7 text-white drop-shadow" />
            : <Volume2 className="h-7 w-7 text-white drop-shadow" />
          }
          <span className="text-white text-xs drop-shadow font-medium">{isMuted ? "Unmute" : "Mute"}</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-3 right-16 z-10 space-y-1">
        <Link href={`/channel/${video.channelId}`}>
          <p className="text-white font-bold text-sm drop-shadow hover:underline">@{video.channelTitle}</p>
        </Link>
        <p className="text-white/90 text-sm line-clamp-2 drop-shadow leading-snug">{video.title}</p>
        {video.viewCount && (
          <p className="text-white/70 text-xs">{video.viewCount}</p>
        )}
      </div>
    </div>
  );
}

export default function ShortsPage() {
  const [, setLocation] = useLocation();
  const { data: shorts = [], isLoading } = useShorts();
  const [current, setCurrent] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, shorts.length - 1)));
  }, [shorts.length]);

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dy = startY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 50) goTo(dy > 0 ? current + 1 : current - 1);
    isDragging.current = false;
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") goTo(current + 1);
      if (e.key === "ArrowUp") goTo(current - 1);
      if (e.key === "Escape") setLocation("/home");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, goTo, setLocation]);

  // Scroll wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastScroll = 0;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastScroll < 400) return;
      lastScroll = now;
      goTo(e.deltaY > 0 ? current + 1 : current - 1);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [current, goTo]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe pt-4 pb-2">
        <h1 className="text-white font-display font-bold text-lg drop-shadow">Shorts</h1>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-sm">{current + 1} / {shorts.length}</span>
          <Link href="/home">
            <button className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <X className="h-5 w-5 text-white" />
            </button>
          </Link>
        </div>
      </div>

      {/* Video feed */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="w-full h-full">
            {shorts.map((v, i) => (
              <div
                key={v.id}
                className={cn(
                  "absolute inset-0 transition-transform duration-300 ease-out",
                  i === current ? "translate-y-0 z-10"
                  : i < current ? "-translate-y-full z-0"
                  : "translate-y-full z-0"
                )}
              >
                <ShortItem
                  video={v}
                  isActive={i === current}
                  isMuted={isMuted}
                  onToggleMute={() => setIsMuted(m => !m)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nav arrows (desktop) */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20 hidden md:flex">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-30"
        >
          <ChevronUp className="h-5 w-5 text-white" />
        </button>
        <button
          onClick={() => goTo(current + 1)}
          disabled={current >= shorts.length - 1}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-30"
        >
          <ChevronDown className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Progress dots */}
      {shorts.length > 0 && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-20">
          {shorts.slice(0, 10).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={cn(
                "rounded-full transition-all",
                i === current ? "w-1.5 h-4 bg-white" : "w-1 h-1 bg-white/30"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
