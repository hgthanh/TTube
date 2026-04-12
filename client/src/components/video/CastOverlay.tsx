/**
 * CastOverlay — shown instead of the local video player when casting.
 * Displays the video thumbnail, cast device name, and playback controls
 * that control the remote session.
 */
import { Play, Pause, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CastButton } from "./CastButton";
import type { CastState } from "@/hooks/useChromecast";
import { cn } from "@/lib/utils";

interface CastOverlayProps {
  thumbnail?: string;
  title?: string;
  castState: CastState;
  deviceName: string;
  available: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (s: number) => void;
  onVolume: (v: number) => void;
  onStop: () => void;
  onStart: () => void;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function CastOverlay({
  thumbnail, title, castState, deviceName, available,
  playing, currentTime, duration, onPlayPause, onSeek, onVolume,
  onStop, onStart,
}: CastOverlayProps) {
  return (
    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 flex flex-col items-center justify-center group">
      {/* Dim background thumbnail */}
      {thumbnail && (
        <img src={thumbnail} alt={title} className="absolute inset-0 w-full h-full object-cover opacity-20" />
      )}

      {/* Center cast icon + info */}
      <div className="relative z-10 flex flex-col items-center gap-4 text-white text-center px-6">
        <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
          <span className="text-4xl">📺</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-white/60 uppercase tracking-wider">Đang phát trên</p>
          <p className="font-display font-bold text-lg">{deviceName || "Chromecast"}</p>
          {title && <p className="text-sm text-white/70 line-clamp-1">{title}</p>}
        </div>
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-4 space-y-2">
        {/* Seek bar */}
        <Slider
          value={[currentTime]}
          max={duration || 1}
          step={0.5}
          onValueChange={v => onSeek(v[0])}
          className="cursor-pointer w-full"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20" onClick={onPlayPause}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Volume2 className="h-4 w-4 text-white/60" />
            <div className="w-20">
              <Slider defaultValue={[80]} max={100} step={1} onValueChange={v => onVolume(v[0] / 100)} className="cursor-pointer" />
            </div>
            <span className="text-white text-xs font-mono tabular-nums">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>
          <CastButton
            castState={castState} deviceName={deviceName} available={available}
            onStart={onStart} onStop={onStop}
          />
        </div>
      </div>
    </div>
  );
}
