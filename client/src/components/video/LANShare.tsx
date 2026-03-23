/**
 * LANShare — discovers devices on the same LAN and pushes a video URL to them.
 *
 * How it works:
 *  1. Each TTube client registers itself at /api/lan/register every 30s with a
 *     friendly name and gets back a device ID.
 *  2. /api/lan/devices returns other devices on the same /24 subnet.
 *  3. The sender calls /api/lan/push { targetId, videoUrl, fromName }.
 *  4. The target polls /api/lan/poll/:deviceId every 5s and auto-navigates when
 *     it receives a pushed URL.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Wifi, Smartphone, Monitor, Tablet, Send, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface LANDevice { id: string; name: string; ip: string; }

// ─── Global device registration ──────────────────────────────────────────────
let myDeviceId: string | null = null;
let myDeviceName: string = (() => {
  const saved = localStorage.getItem("lan_device_name");
  if (saved) return saved;
  const ua = navigator.userAgent.toLowerCase();
  const type = ua.includes("mobile") ? "📱 Mobile" : ua.includes("tablet") ? "📟 Tablet" : "💻 Desktop";
  return `${type} ${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
})();

async function registerDevice(): Promise<string> {
  const res = await fetch("/api/lan/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: myDeviceName }),
  });
  const data = await res.json();
  myDeviceId = data.id;
  return data.id;
}

// Register on load and keep heartbeat
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  if (heartbeatInterval) return;
  registerDevice().catch(() => {});
  heartbeatInterval = setInterval(() => registerDevice().catch(() => {}), 25000);
}
startHeartbeat();

// ─── Receive pushed URLs ──────────────────────────────────────────────────────
function useLANReceiver() {
  const [, setLocation] = useLocation();
  const [notification, setNotification] = useState<{ videoUrl: string; from: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const poll = async () => {
      if (!myDeviceId) return;
      try {
        const res = await fetch(`/api/lan/poll/${myDeviceId}`);
        const data = await res.json();
        if (data.videoUrl) {
          setNotification({ videoUrl: data.videoUrl, from: data.from });
        }
      } catch {}
    };
    timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, []);

  return { notification, clearNotification: () => setNotification(null), setLocation };
}

// ─── LAN Notification banner (shown when another device pushes a video) ───────
export function LANNotification() {
  const { notification, clearNotification, setLocation } = useLANReceiver();
  if (!notification) return null;

  const handleAccept = () => {
    // Extract video id from the pushed URL
    const match = notification.videoUrl.match(/\/watch\/([^?&]+)/);
    if (match) setLocation(`/watch/${match[1]}`);
    else window.location.href = notification.videoUrl;
    clearNotification();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[200] max-w-sm w-full animate-in slide-in-from-bottom-4">
      <div className="bg-card border border-primary/30 rounded-2xl p-4 shadow-2xl shadow-primary/10">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Wifi className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Chia sẻ từ {notification.from}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Muốn gửi video đến thiết bị này</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleAccept} className="gap-1.5 text-xs h-8">
                <CheckCircle2 className="h-3.5 w-3.5" /> Xem ngay
              </Button>
              <Button size="sm" variant="ghost" onClick={clearNotification} className="text-xs h-8">
                Bỏ qua
              </Button>
            </div>
          </div>
          <button onClick={clearNotification} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send dialog ──────────────────────────────────────────────────────────────
interface LANShareDialogProps {
  videoUrl: string;
  videoTitle?: string;
  onClose: () => void;
}

export function LANShareDialog({ videoUrl, videoTitle, onClose }: LANShareDialogProps) {
  const [devices, setDevices] = useState<LANDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState(myDeviceName);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lan/devices");
      const data: LANDevice[] = await res.json();
      // Exclude self
      setDevices(data.filter(d => d.id !== myDeviceId));
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleSend = async (target: LANDevice) => {
    setSending(target.id);
    try {
      await fetch("/api/lan/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: target.id,
          videoUrl,
          fromName: myDeviceName,
        }),
      });
      setSent(target.id);
      setTimeout(() => setSent(null), 3000);
    } catch {}
    setSending(null);
  };

  const handleNameSave = () => {
    myDeviceName = deviceName;
    localStorage.setItem("lan_device_name", deviceName);
    registerDevice();
    fetchDevices();
  };

  const getDeviceIcon = (name: string) => {
    if (name.includes("📱") || name.toLowerCase().includes("mobile")) return Smartphone;
    if (name.includes("📟") || name.toLowerCase().includes("tablet")) return Tablet;
    return Monitor;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Wifi className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Chia sẻ qua mạng LAN</h2>
              <p className="text-xs text-muted-foreground">Gửi video đến thiết bị trong mạng</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video info */}
        <div className="px-5 py-3 bg-secondary/30 border-b border-border">
          <p className="text-xs text-muted-foreground">Video sẽ chia sẻ:</p>
          <p className="text-sm font-medium line-clamp-1 mt-0.5">{videoTitle || videoUrl}</p>
        </div>

        {/* Device name */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-muted-foreground mb-2">Thiết bị của bạn:</p>
          <div className="flex gap-2">
            <input
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              className="flex-1 h-8 px-3 text-sm bg-secondary rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="Tên thiết bị..."
              onBlur={handleNameSave}
              onKeyDown={e => e.key === "Enter" && handleNameSave()}
            />
          </div>
        </div>

        {/* Device list */}
        <div className="px-5 pt-2 pb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Thiết bị trong mạng ({devices.length})
            </p>
            <button
              onClick={fetchDevices}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Đang tìm kiếm thiết bị...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Wifi className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Không tìm thấy thiết bị</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mở TTube trên thiết bị khác trong cùng mạng WiFi để thiết bị xuất hiện ở đây.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchDevices} className="gap-2 mt-1">
                <RefreshCw className="h-3.5 w-3.5" /> Thử lại
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map(device => {
                const Icon = getDeviceIcon(device.name);
                const isSending = sending === device.id;
                const isSent = sent === device.id;
                return (
                  <div
                    key={device.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/40 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{device.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{device.ip}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={isSent ? "default" : "outline"}
                      className={cn("gap-1.5 h-8 text-xs shrink-0 transition-all", isSent && "bg-green-600 border-green-600")}
                      disabled={isSending || isSent}
                      onClick={() => handleSend(device)}
                    >
                      {isSending ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Gửi...</>
                      ) : isSent ? (
                        <><CheckCircle2 className="h-3 w-3" /> Đã gửi!</>
                      ) : (
                        <><Send className="h-3 w-3" /> Gửi</>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
