import { useRef, useState, useEffect, useCallback, useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Maximize, Minimize, Volume2, VolumeX, Subtitles, Play, Pause,
  PictureInPicture2, Timer
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { useLang } from "@/contexts/LangContext";

interface SubtitleTrack { label: string; languageCode: string; url: string; }
interface VideoPlayerProps {
  url?: string; thumbnail?: string; isLoading: boolean;
  audioOnly?: boolean; videoId?: string;
}

// ── YouTube IFrame Player API types ──────────────────────────────────────────
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

function loadYTAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

export function VideoPlayer({ url, thumbnail, isLoading, audioOnly = false, videoId }: VideoPlayerProps) {
  const { t } = useLang();
  const uid = useId().replace(/:/g, "");

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef    = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);          // YT.Player instance
  const hideTimer   = useRef<ReturnType<typeof setTimeout>>();
  const holdTimer   = useRef<ReturnType<typeof setTimeout>>();
  const embedDivId  = `yt-embed-${uid}`;

  // ── State ─────────────────────────────────────────────────────────────────
  const [hasError, setHasError]         = useState(false);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [isMuted, setIsMuted]           = useState(false);
  const [volume, setVolume]             = useState(100);   // 0–100 for YT API
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP]               = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [subtitles, setSubtitles]       = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed]   = useState("1");
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [ytReady, setYtReady]           = useState(false);
  const [holdSpeed, setHoldSpeed]       = useState(false); // hold-to-2x
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();

  // Use embed when no native stream URL
  const useEmbed = !url || hasError;

  // ── Reset on video change ─────────────────────────────────────────────────
  useEffect(() => {
    setHasError(false); setCurrentTime(0); setDuration(0);
    setIsPlaying(false); setYtReady(false);
  }, [url, videoId]);

  // ── Subtitles ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoId) return;
    fetch(`/api/yt/video/${videoId}/subtitles`).then(r => r.json()).then(setSubtitles).catch(() => {});
  }, [videoId]);

  // ── PiP events (native video) ─────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => { v.removeEventListener("enterpictureinpicture", onEnter); v.removeEventListener("leavepictureinpicture", onLeave); };
  }, []);

  // ── Fullscreen listener ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── YouTube IFrame Player API ─────────────────────────────────────────────
  useEffect(() => {
    if (!useEmbed || !videoId) return;
    let destroyed = false;

    loadYTAPI().then(() => {
      if (destroyed) return;
      const container = document.getElementById(embedDivId);
      if (!container) return;

      ytPlayerRef.current = new window.YT.Player(embedDivId, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,           // hide native YouTube controls
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,     // no annotations
          playsinline: 1,
          cc_load_policy: 0,
          disablekb: 1,          // disable YouTube keyboard shortcuts
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            if (destroyed) return;
            setYtReady(true);
            setDuration(e.target.getDuration());
            setVolume(e.target.getVolume());
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0, BUFFERING=3
            setIsPlaying(e.data === 1);
            if (e.data === 1) setDuration(e.target.getDuration());
          },
          onError: () => setHasError(true),
        },
      });
    });

    return () => {
      destroyed = true;
      try { ytPlayerRef.current?.destroy(); } catch {}
      ytPlayerRef.current = null;
      setYtReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useEmbed, videoId]);

  // ── Poll currentTime in embed mode ────────────────────────────────────────
  useEffect(() => {
    if (!useEmbed || !ytReady) return;
    const iv = setInterval(() => {
      try { setCurrentTime(ytPlayerRef.current?.getCurrentTime() ?? 0); } catch {}
    }, 500);
    return () => clearInterval(iv);
  }, [useEmbed, ytReady]);

  // ── Native video helpers ──────────────────────────────────────────────────
  const onTimeUpdate = useCallback(() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); }, []);
  const onLoadedMetadata = useCallback(() => { if (videoRef.current) setDuration(videoRef.current.duration); }, []);
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Hold-to-2x speed (pointer events for both mouse and touch)
  const startHold = useCallback(() => {
    holdTimer.current = setTimeout(() => {
      setHoldSpeed(true);
      if (useEmbed) ytPlayerRef.current?.setPlaybackRate(2);
      else if (videoRef.current) videoRef.current.playbackRate = 2;
    }, 400); // 400ms hold threshold
  }, [useEmbed]);

  const endHold = useCallback(() => {
    clearTimeout(holdTimer.current);
    if (holdSpeed) {
      setHoldSpeed(false);
      const s = parseFloat(playbackSpeed);
      if (useEmbed) ytPlayerRef.current?.setPlaybackRate(s);
      else if (videoRef.current) videoRef.current.playbackRate = s;
    }
  }, [holdSpeed, playbackSpeed, useEmbed]);

  // ── Unified controls (work for both native + embed) ───────────────────────
  const togglePlay = useCallback(() => {
    if (useEmbed) {
      if (isPlaying) ytPlayerRef.current?.pauseVideo();
      else ytPlayerRef.current?.playVideo();
    } else {
      if (!videoRef.current) return;
      if (isPlaying) videoRef.current.pause(); else videoRef.current.play();
    }
    setIsPlaying(p => !p);
  }, [useEmbed, isPlaying]);

  const toggleMute = useCallback(() => {
    if (useEmbed) {
      if (isMuted) { ytPlayerRef.current?.unMute(); setIsMuted(false); }
      else { ytPlayerRef.current?.mute(); setIsMuted(true); }
    } else {
      if (!videoRef.current) return;
      const next = !isMuted;
      videoRef.current.muted = next;
      setIsMuted(next);
    }
  }, [useEmbed, isMuted]);

  const handleVolume = useCallback((v: number[]) => {
    const val = v[0];
    if (useEmbed) { ytPlayerRef.current?.setVolume(val); setVolume(val); setIsMuted(val === 0); }
    else if (videoRef.current) { videoRef.current.volume = val / 100; videoRef.current.muted = val === 0; setVolume(val); setIsMuted(val === 0); }
  }, [useEmbed]);

  const handleSeek = useCallback((v: number[]) => {
    const val = v[0];
    if (useEmbed) ytPlayerRef.current?.seekTo(val, true);
    else if (videoRef.current) videoRef.current.currentTime = val;
    setCurrentTime(val);
  }, [useEmbed]);

  const handleSpeedChange = useCallback((speed: string) => {
    const s = parseFloat(speed);
    if (useEmbed) ytPlayerRef.current?.setPlaybackRate(s);
    else if (videoRef.current) videoRef.current.playbackRate = s;
    setPlaybackSpeed(speed);
  }, [useEmbed]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, []);

  const togglePiP = useCallback(async () => {
    if (useEmbed) {
      // For embed, request PiP on the iframe element itself
      try {
        const iframe = containerRef.current?.querySelector("iframe");
        if (iframe) await (iframe as any).requestPictureInPicture?.();
      } catch {}
      return;
    }
    try {
      if (videoRef.current !== document.pictureInPictureElement) await videoRef.current?.requestPictureInPicture();
      else await document.exitPictureInPicture();
    } catch {}
  }, [useEmbed]);

  // ── Full controls bar (shared between embed and native) ───────────────────
  // ── Hold speed indicator ─────────────────────────────────────────────────────
  const HoldIndicator = holdSpeed ? (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none">
      <div className="bg-black/70 text-white rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-bold">
        <span>⚡</span> 2× tốc độ
      </div>
    </div>
  ) : null;

  const ControlsBar = (
    <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-4 transition-opacity duration-300 ${showControls || !isPlaying ? "opacity-100" : "opacity-0"}`}
      style={{ pointerEvents: showControls || !isPlaying ? "auto" : "none" }}>
      <div className="space-y-2">
        {/* Seek bar */}
        <Slider
          value={[currentTime]} max={duration || 1} step={0.5}
          onValueChange={handleSeek} className="cursor-pointer w-full"
        />
        <div className="flex items-center justify-between gap-3">
          {/* Left controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20" onClick={toggleMute}>
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <div className="w-20 hidden sm:block">
              <Slider value={[isMuted ? 0 : volume]} max={100} step={1} onValueChange={handleVolume} className="cursor-pointer" />
            </div>
            <span className="text-white text-xs font-medium tabular-nums hidden sm:block ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Subtitles */}
            {subtitles.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20">
                    <Subtitles className={`h-4 w-4 ${activeSubtitle ? "text-primary" : ""}`} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/10 text-white backdrop-blur-md">
                  <DropdownMenuLabel>{t.subtitles}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuRadioGroup value={activeSubtitle || "off"} onValueChange={v => setActiveSubtitle(v === "off" ? null : v)}>
                    <DropdownMenuRadioItem value="off">{t.off}</DropdownMenuRadioItem>
                    {subtitles.map(tr => <DropdownMenuRadioItem key={tr.url} value={tr.url}>{tr.label}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Playback speed */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20">
                  <Timer className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-black/90 border-white/10 text-white backdrop-blur-md">
                <DropdownMenuLabel>{t.playbackSpeed}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuRadioGroup value={playbackSpeed} onValueChange={handleSpeedChange}>
                  {["0.25","0.5","0.75","1","1.25","1.5","2"].map(s => (
                    <DropdownMenuRadioItem key={s} value={s}>{s === "1" ? t.normal : `${s}x`}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* PiP */}
            <Button variant="ghost" size="icon"
              className={`h-9 w-9 text-white hover:bg-white/20 ${isPiP ? "text-primary" : ""}`}
              onClick={togglePiP} title={t.pipMode}>
              <PictureInPicture2 className="h-4 w-4" />
            </Button>

            {/* Fullscreen */}
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-card border relative shadow-2xl">
        <Skeleton className="absolute inset-0 bg-muted/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Embed mode (YouTube IFrame API) ───────────────────────────────────────
  if (useEmbed && videoId) {
    return (
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10"
        onMouseMove={showControlsTemporarily}
        onMouseLeave={() => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setShowControls(false), 1500); }}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
      >
        {/* YT API mounts the iframe into this div */}
        <div id={embedDivId} className="absolute inset-0 w-full h-full" />

        {/* Loading spinner until player ready */}
        {!ytReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Click overlay: toggles play without blocking player init */}
        <div
          className="absolute inset-0 z-20"
          style={{ pointerEvents: ytReady ? "auto" : "none" }}
          onClick={togglePlay}
        />

        {/* Hold speed indicator */}
        {HoldIndicator}

        {/* Controls bar — rendered above click overlay */}
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div style={{ pointerEvents: "none" }} className="relative h-full">
            {ControlsBar}
          </div>
        </div>
      </div>
    );
  }

  // ── Native <video> ────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="group relative w-full rounded-xl overflow-hidden bg-black aspect-video ring-1 ring-white/10 shadow-2xl"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setShowControls(false), 1000); endHold(); }}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
    >
      <video
        ref={videoRef} src={url} poster={thumbnail} autoPlay
        className={`w-full h-full object-contain ${audioOnly ? "opacity-0" : "opacity-100"} transition-opacity`}
        onError={() => setHasError(true)} onClick={togglePlay}
        onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
      >
        {activeSubtitle && <track kind="subtitles" src={activeSubtitle} srcLang="vi" label="Phụ đề" default />}
      </video>

      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
            <Play className="h-8 w-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {HoldIndicator}
      {ControlsBar}

      {audioOnly && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/95 backdrop-blur-2xl pointer-events-none">
          <div className="text-center space-y-4">
            <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center mx-auto ring-8 ring-primary/5">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                <div className="w-4 h-4 bg-primary rounded-full" />
              </div>
            </div>
            <div>
              <p className="font-display font-bold">{t.audioModeOn}</p>
              <p className="text-sm text-muted-foreground">{t.backgroundPlay}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
