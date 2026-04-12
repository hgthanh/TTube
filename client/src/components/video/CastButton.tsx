/**
 * CastButton — shows a cast icon button when Chromecast devices are available.
 * Clicking opens the device picker. When connected, shows device name + stop button.
 */
import { useState } from "react";
import { Tv2, Cast, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CastState } from "@/hooks/useChromecast";

interface CastButtonProps {
  castState: CastState;
  deviceName: string;
  available: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

export function CastButton({ castState, deviceName, available, onStart, onStop, className }: CastButtonProps) {
  if (!available && castState === "no_devices") return null;

  if (castState === "connected") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <div className="flex items-center gap-1.5 bg-primary/15 border border-primary/30 rounded-full px-3 py-1.5 text-xs text-primary font-medium">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          {deviceName || "Chromecast"}
        </div>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full"
          onClick={onStop}
          title="Ngắt kết nối Cast"
        >
          <Tv2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (castState === "connecting") {
    return (
      <Button
        variant="ghost" size="icon"
        className={cn("h-9 w-9 text-white/70 rounded-full", className)}
        disabled
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // not_connected (devices available)
  return (
    <Button
      variant="ghost" size="icon"
      className={cn("h-9 w-9 text-white hover:bg-white/20 rounded-full", className)}
      onClick={onStart}
      title="Cast lên TV"
    >
      <Cast className="h-4 w-4" />
    </Button>
  );
}
