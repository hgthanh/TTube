import { useRef, useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  Maximize, Minimize, Volume2, VolumeX, Settings, 
  Subtitles, Play, Pause, MonitorPlay, Timer 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";

interface SubtitleTrack {
  label: string;
  languageCode: string;
  url: string;
}

interface VideoPlayerProps {
  url?: string;
  thumbnail?: string;
  isLoading: boolean;
  audioOnly?: boolean;
  videoId?: string;
}

export function VideoPlayer({ url, thumbnail, isLoading, audioOnly = false, videoId }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState("1");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setHasError(false);
    setRetryCount(0);
  }, [url]);

  useEffect(() => {
    if (videoId) {
      fetch(`/api/yt/video/${videoId}/subtitles`)
        .then(res => res.json())
        .then(data => setSubtitles(data))
        .catch(console.error);
    }
  }, [videoId]);

  const onTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      const time = value[0];
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    try {
      if (videoRef.current !== document.pictureInPictureElement) {
        await videoRef.current?.requestPictureInPicture();
      } else {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      console.error("PiP error:", error);
    }
  };

  const handleSpeedChange = (speed: string) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = parseFloat(speed);
      setPlaybackSpeed(speed);
    }
  };

  if (isLoading || !url) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-card border relative shadow-2xl">
        <Skeleton className="w-full h-full absolute inset-0 bg-muted/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (hasError && videoId) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black relative shadow-2xl">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video player"
        />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-card border relative flex items-center justify-center shadow-2xl">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground font-medium">Video could not be loaded. Try refreshing.</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="group relative w-full rounded-xl overflow-hidden bg-black aspect-video ring-1 ring-white/10 shadow-2xl transition-all duration-500"
      onMouseMove={() => {
        setShowControls(true);
        const timer = setTimeout(() => setShowControls(false), 3000);
        return () => clearTimeout(timer);
      }}
    >
      <video
        ref={videoRef}
        src={url}
        poster={thumbnail}
        autoPlay
        className={`w-full h-full object-contain ${audioOnly ? 'opacity-0' : 'opacity-100'} transition-opacity duration-700`}
        onError={() => setHasError(true)}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
      >
        {activeSubtitle && (
          <track 
            kind="subtitles" 
            src={activeSubtitle} 
            srcLang="vi" 
            label="Phụ đề" 
            default 
          />
        )}
      </video>

      {/* Modern Controls Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/20 flex flex-col justify-end p-4 transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1 group/slider">
            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={togglePlay}>
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleMute}>
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>
              <div className="text-white text-xs font-medium tabular-nums px-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {subtitles.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                    >
                      <Subtitles className={`h-5 w-5 ${activeSubtitle ? 'text-primary' : ''}`} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/10 text-white backdrop-blur-md">
                    <DropdownMenuLabel>Phụ đề</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuRadioGroup value={activeSubtitle || "off"} onValueChange={(val) => setActiveSubtitle(val === "off" ? null : val)}>
                      <DropdownMenuRadioItem value="off">Tắt</DropdownMenuRadioItem>
                      {subtitles.map((track) => (
                        <DropdownMenuRadioItem key={track.url} value={track.url}>
                          {track.label}
                        </DropdownMenuRadioItem>
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
                <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/10 text-white backdrop-blur-md">
                  <DropdownMenuLabel>Tốc độ phát</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuRadioGroup value={playbackSpeed} onValueChange={handleSpeedChange}>
                    <DropdownMenuRadioItem value="0.25">0.25x</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="0.5">0.5x</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="0.75">0.75x</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="1">Bình thường</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="1.25">1.25x</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="1.5">1.5x</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="2">2x</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={togglePiP}>
                <MonitorPlay className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {audioOnly && (
         <div className="absolute inset-0 flex items-center justify-center bg-card/95 backdrop-blur-2xl">
             <div className="text-center space-y-6">
                 <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mx-auto ring-8 ring-primary/5">
                     <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                         <div className="w-4 h-4 bg-primary rounded-full shadow-[0_0_20px_rgba(var(--primary),0.8)]" />
                     </div>
                 </div>
                 <div className="space-y-2">
                   <p className="text-xl font-display font-bold text-foreground">Audio Mode Active</p>
                   <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">Streaming high-quality audio while saving bandwidth</p>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
}
