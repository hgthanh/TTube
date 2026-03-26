import { useRef, useState, useEffect, useCallback } from "react";
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

export function VideoPlayer({ url, thumbnail, isLoading, audioOnly = false, videoId }: VideoPlayerProps) {
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState("1");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Use embed mode when: no stream URL (204 response) OR video error
  const useEmbed = !url || hasError;

  useEffect(() => { setHasError(false); setCurrentTime(0); setDuration(0); }, [url]);

  useEffect(() => {
    if (videoId) {
      fetch(`/api/yt/video/${videoId}/subtitles`).then(r => r.json()).then(setSubtitles).catch(() => {});
    }
  }, [videoId]);

  // PiP events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  const onTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);
  const onLoadedMetadata = useCallback(() => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  }, []);

  const handleSeek = (v: number[]) => {
    if (videoRef.current) { videoRef.current.currentTime = v[0]; setCurrentTime(v[0]); }
  };
  const handleVolume = (v: number[]) => {
    const val = v[0];
    if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0; }
    setVolume(val); setIsMuted(val === 0);
  };
  const formatTime = (t: number) =>
    `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause(); else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };
  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    if (!next && volume === 0) { videoRef.current.volume = 0.5; setVolume(0.5); }
    setIsMuted(next);
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };
  const togglePiP = async () => {
    try {
      if (videoRef.current !== document.pictureInPictureElement) await videoRef.current?.requestPictureInPicture();
      else await document.exitPictureInPicture();
    } catch {}
  };
  const handleSpeedChange = (speed: string) => {
    if (videoRef.current) videoRef.current.playbackRate = parseFloat(speed);
    setPlaybackSpeed(speed);
  };
  const showControlsTemporarily = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-card border relative shadow-2xl">
        <Skeleton className="w-full h-full absolute inset-0 bg-muted/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Embed mode (no stream URL or video error) ──────────────────────────────
  // YouTube params: controls=0 hides native UI, disablekb=1 blocks keyboard,
  // We overlay our own fullscreen button so it's not completely bare.
  if (useEmbed && videoId) {
    const embedSrc = [
      `https://www.youtube-nocookie.com/embed/${videoId}`,
      `?autoplay=1`,
      `&controls=0`,          // hide YouTube controls
      `&rel=0`,               // no related videos
      `&modestbranding=1`,    // hide YouTube logo
      `&iv_load_policy=3`,    // hide annotations
      `&disablekb=1`,         // disable keyboard shortcuts (we handle them)
      `&playsinline=1`,
      `&cc_load_policy=0`,    // no auto captions
      `&mute=0`,
    ].join("");

    return (
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 group"
        onMouseMove={showControlsTemporarily}
      >
        {/* Actual embed — pointer-events disabled so our overlay catches clicks */}
        <iframe
          ref={iframeRef}
          src={embedSrc}
          className="absolute inset-0 w-full h-full pointer-events-none"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title="Video player"
        />

        {/* Transparent click layer — forwards clicks to iframe, but we can intercept */}
        <div
          className="absolute inset-0"
          style={{ pointerEvents: "auto" }}
          onClick={() => {
            // Send play/pause via postMessage to YouTube iframe
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: isPlaying ? "pauseVideo" : "playVideo", args: [] }),
              "https://www.youtube-nocookie.com"
            );
            setIsPlaying(p => !p);
          }}
        />

        {/* Custom controls overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 transition-opacity duration-300 pointer-events-none ${showControls ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center justify-between gap-2 pointer-events-auto">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => {
                e.stopPropagation();
                iframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: "command", func: isPlaying ? "pauseVideo" : "playVideo", args: [] }),
                  "https://www.youtube-nocookie.com"
                );
                setIsPlaying(p => !p);
              }}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <span className="text-white/70 text-xs">YouTube Embed</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Native <video> player ──────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="group relative w-full rounded-xl overflow-hidden bg-black aspect-video ring-1 ring-white/10 shadow-2xl"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setShowControls(false), 1000); }}
    >
      <video
        ref={videoRef} src={url} poster={thumbnail} autoPlay
        className={`w-full h-full object-contain ${audioOnly ? "opacity-0" : "opacity-100"} transition-opacity duration-700`}
        onError={() => setHasError(true)}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
      >
        {activeSubtitle && (
          <track kind="subtitles" src={activeSubtitle} srcLang="vi" label="Phụ đề" default />
        )}
      </video>

      {/* Pause overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
            <Play className="h-8 w-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/10 flex flex-col justify-end p-4 transition-opacity duration-300 ${showControls || !isPlaying ? "opacity-100" : "opacity-0"}`}>
        <div className="space-y-3">
          <Slider value={[currentTime]} max={duration || 1} step={0.1} onValueChange={handleSeek} className="cursor-pointer" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={togglePlay}>
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>
              <div className="w-20 hidden sm:block">
                <Slider value={[isMuted ? 0 : volume]} max={1} step={0.01} onValueChange={handleVolume} className="cursor-pointer" />
              </div>
              <span className="text-white text-xs font-medium tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {subtitles.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                      <Subtitles className={`h-5 w-5 ${activeSubtitle ? "text-primary" : ""}`} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/10 text-white backdrop-blur-md">
                    <DropdownMenuLabel>{t.subtitles}</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuRadioGroup value={activeSubtitle || "off"} onValueChange={v => setActiveSubtitle(v === "off" ? null : v)}>
                      <DropdownMenuRadioItem value="off">{t.off}</DropdownMenuRadioItem>
                      {subtitles.map(track => (
                        <DropdownMenuRadioItem key={track.url} value={track.url}>{track.label}</DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                    <Timer className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-black/90 border-white/10 text-white backdrop-blur-md">
                  <DropdownMenuLabel>{t.playbackSpeed}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuRadioGroup value={playbackSpeed} onValueChange={handleSpeedChange}>
                    {["0.25", "0.5", "0.75", "1", "1.25", "1.5", "2"].map(s => (
                      <DropdownMenuRadioItem key={s} value={s}>{s === "1" ? t.normal : `${s}x`}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon"
                className={`text-white hover:bg-white/20 ${isPiP ? "text-primary" : ""}`}
                onClick={togglePiP} title={t.pipMode}>
                <PictureInPicture2 className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Audio mode overlay */}
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
