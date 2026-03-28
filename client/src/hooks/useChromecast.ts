/**
 * useChromecast — Google Cast SDK (Sender)
 *
 * Loads the Cast SDK script, discovers Chromecast receivers on the LAN,
 * and manages the cast session lifecycle.
 *
 * Usage:
 *   const { available, connected, castState, startCast, stopCast, loadMedia } = useChromecast();
 */
import { useState, useEffect, useCallback, useRef } from "react";

// ── Cast SDK global types ──────────────────────────────────────────────────────
declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: any;
    chrome?: any;
  }
}

// Default Chromecast receiver app ID (built-in Default Media Receiver)
// Works with any Chromecast without registration.
const DEFAULT_RECEIVER_APP_ID = "CC1AD845";

export type CastState = "no_devices" | "not_connected" | "connecting" | "connected";

export interface CastMedia {
  url: string;          // direct stream URL or proxy URL
  title: string;
  thumbnail?: string;
  contentType?: string; // e.g. "video/mp4"
}

interface UseChromecastReturn {
  available: boolean;    // Cast SDK loaded + at least one device found
  castState: CastState;
  connected: boolean;
  deviceName: string;
  startCast: () => void;         // open device picker
  stopCast: () => void;          // end session
  loadMedia: (media: CastMedia) => Promise<void>;
  seekTo: (seconds: number) => void;
  setRemoteVolume: (level: number) => void; // 0–1
  remoteCurrentTime: number;
  remoteDuration: number;
  remotePlaying: boolean;
}

let sdkLoadPromise: Promise<void> | null = null;

function loadCastSDK(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve) => {
    if (window.cast?.framework) { resolve(); return; }
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) resolve();
      else { sdkLoadPromise = null; }
    };
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

export function useChromecast(): UseChromecastReturn {
  const [available, setAvailable]         = useState(false);
  const [castState, setCastState]         = useState<CastState>("no_devices");
  const [deviceName, setDeviceName]       = useState("");
  const [remoteCurrentTime, setRemoteCurrentTime] = useState(0);
  const [remoteDuration, setRemoteDuration]       = useState(0);
  const [remotePlaying, setRemotePlaying]         = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const sessionRef = useRef<any>(null);

  const getSession = useCallback(() =>
    window.cast?.framework?.CastContext?.getInstance()?.getCurrentSession() ?? null,
  []);

  // Poll remote media status every second when connected
  const startPolling = useCallback(() => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      const session = getSession();
      if (!session) return;
      const player = new window.cast.framework.RemotePlayer();
      const controller = new window.cast.framework.RemotePlayerController(player);
      setRemoteCurrentTime(player.currentTime ?? 0);
      setRemoteDuration(player.duration ?? 0);
      setRemotePlaying(!player.isPaused);
    }, 1000);
  }, [getSession]);

  useEffect(() => {
    let mounted = true;
    loadCastSDK().then(() => {
      if (!mounted) return;
      const ctx = window.cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: DEFAULT_RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });

      // Listen for cast state changes
      ctx.addEventListener(
        window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        (event: any) => {
          if (!mounted) return;
          const state: string = event.castState;
          // CAST_STATE: NO_DEVICES_AVAILABLE, NOT_CONNECTED, CONNECTING, CONNECTED
          if (state === "NO_DEVICES_AVAILABLE") {
            setCastState("no_devices"); setAvailable(false);
          } else if (state === "NOT_CONNECTED") {
            setCastState("not_connected"); setAvailable(true);
            clearInterval(pollRef.current);
            sessionRef.current = null;
          } else if (state === "CONNECTING") {
            setCastState("connecting"); setAvailable(true);
          } else if (state === "CONNECTED") {
            setCastState("connected"); setAvailable(true);
            const session = ctx.getCurrentSession();
            sessionRef.current = session;
            setDeviceName(session?.getCastDevice()?.friendlyName ?? "Chromecast");
            startPolling();
          }
        }
      );

      // Check initial state
      const initial = ctx.getCastState?.();
      if (initial && initial !== "NO_DEVICES_AVAILABLE") setAvailable(true);
    }).catch(() => {/* Cast SDK not available (HTTP, no extension, etc.) */});

    return () => {
      mounted = false;
      clearInterval(pollRef.current);
    };
  }, [startPolling]);

  const startCast = useCallback(() => {
    if (!window.cast?.framework) return;
    window.cast.framework.CastContext.getInstance().requestSession().catch(() => {});
  }, []);

  const stopCast = useCallback(() => {
    getSession()?.endSession(true);
  }, [getSession]);

  const loadMedia = useCallback(async (media: CastMedia) => {
    const session = getSession();
    if (!session) return;

    const mediaInfo = new window.chrome.cast.media.MediaInfo(
      media.url,
      media.contentType || "video/mp4"
    );
    mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = media.title;
    if (media.thumbnail) {
      mediaInfo.metadata.images = [
        new window.chrome.cast.Image(media.thumbnail),
      ];
    }

    const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;

    await session.loadMedia(request);
    startPolling();
  }, [getSession, startPolling]);

  const seekTo = useCallback((seconds: number) => {
    const session = getSession();
    if (!session) return;
    const media = session.getMediaSession();
    if (!media) return;
    const req = new window.chrome.cast.media.SeekRequest();
    req.currentTime = seconds;
    media.seek(req, null, null);
  }, [getSession]);

  const setRemoteVolume = useCallback((level: number) => {
    const session = getSession();
    if (!session) return;
    session.setVolume(Math.max(0, Math.min(1, level)));
  }, [getSession]);

  return {
    available,
    castState,
    connected: castState === "connected",
    deviceName,
    startCast,
    stopCast,
    loadMedia,
    seekTo,
    setRemoteVolume,
    remoteCurrentTime,
    remoteDuration,
    remotePlaying,
  };
}
