/**
 * LANShare — True P2P video sharing using WebRTC DataChannel.
 *
 * Architecture:
 *  1. Both devices register with the server to get a device ID.
 *  2. Devices on the same public IP (= same LAN) are grouped together.
 *  3. Sender initiates a WebRTC offer → server stores it (signaling).
 *  4. Target fetches the offer, answers → server stores the answer.
 *  5. ICE candidates exchanged via server.
 *  6. WebRTC DataChannel established → video URL sent P2P, no server involved.
 *  7. If WebRTC fails → falls back to server-relay push.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wifi, Smartphone, Monitor, Tablet, Send, CheckCircle2,
  Loader2, RefreshCw, X, Radio
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface LANDevice { id: string; name: string; }

// ─── Persistent device identity ──────────────────────────────────────────────
let myDeviceId: string | null = localStorage.getItem("lan_device_id");
let myDeviceName: string = localStorage.getItem("lan_device_name") || (() => {
  const ua = navigator.userAgent.toLowerCase();
  const icon = ua.includes("mobile") ? "📱" : ua.includes("tablet") ? "📟" : "💻";
  const name = `${icon} ${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  localStorage.setItem("lan_device_name", name);
  return name;
})();

/** Called from Settings to update the device name globally */
export function updateLANDeviceName(name: string): void {
  myDeviceName = name;
  localStorage.setItem("lan_device_name", name);
  registerDevice().catch(() => {});
}

async function registerDevice(): Promise<void> {
  try {
    const res = await fetch("/api/lan/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: myDeviceName, id: myDeviceId }),
    });
    const data = await res.json();
    if (data.id && data.id !== myDeviceId) {
      myDeviceId = data.id;
      localStorage.setItem("lan_device_id", data.id);
    }
  } catch {}
}

// Heartbeat
registerDevice();
setInterval(registerDevice, 25000);

// ─── WebRTC P2P signaling ─────────────────────────────────────────────────────
async function sendSignal(targetId: string, type: string, payload: any): Promise<void> {
  await fetch("/api/lan/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: myDeviceId, to: targetId, type, payload }),
  });
}

async function pollSignal(type: string): Promise<any | null> {
  try {
    const res = await fetch(`/api/lan/signal?id=${myDeviceId}&type=${type}`);
    const data = await res.json();
    return data.payload ?? null;
  } catch { return null; }
}

// ─── Send a video URL via P2P (with server fallback) ─────────────────────────
async function sendVideoP2P(
  targetId: string,
  videoUrl: string,
  fromName: string,
  onStatus: (s: string) => void
): Promise<boolean> {
  onStatus("Kết nối P2P...");
  try {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // DataChannel
    const dc = pc.createDataChannel("ttube-share");

    const candidates: RTCIceCandidate[] = [];
    pc.onicecandidate = e => {
      if (e.candidate) candidates.push(e.candidate);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering
    await new Promise<void>(resolve => {
      if (pc.iceGatheringState === "complete") { resolve(); return; }
      const timer = setTimeout(resolve, 3000);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") { clearTimeout(timer); resolve(); }
      };
    });

    // Send offer + candidates to target via server signaling
    await sendSignal(targetId, "offer", {
      sdp: pc.localDescription,
      candidates: candidates.map(c => c.toJSON()),
      fromName,
    });
    onStatus("Đang chờ thiết bị kia...");

    // Poll for answer
    let answer = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      answer = await pollSignal("answer");
      if (answer) break;
    }

    if (!answer) throw new Error("No answer received");

    await pc.setRemoteDescription(new RTCSessionDescription(answer.sdp));
    for (const c of answer.candidates || []) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }

    // Wait for data channel to open
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("DC timeout")), 8000);
      dc.onopen = () => { clearTimeout(timer); resolve(); };
      dc.onerror = () => { clearTimeout(timer); reject(new Error("DC error")); };
    });

    onStatus("Gửi video...");
    dc.send(JSON.stringify({ type: "video", url: videoUrl, from: fromName }));
    await new Promise(r => setTimeout(r, 500));
    dc.close();
    pc.close();
    onStatus("Đã gửi P2P! ✓");
    return true;
  } catch (err) {
    // Fallback to server relay
    onStatus("Gửi qua server...");
    await fetch("/api/lan/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, videoUrl, fromName }),
    });
    onStatus("Đã gửi! ✓");
    return false;
  }
}

// ─── Receive: listen for P2P offers + server-relay pushes ────────────────────
export function LANNotification() {
  const [, setLocation] = useLocation();
  const [notification, setNotification] = useState<{ videoUrl: string; from: string; p2p?: boolean } | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [ready, setReady] = useState(false);

  // Wait for device registration before polling
  useEffect(() => {
    const waitForId = setInterval(() => {
      if (myDeviceId) { setReady(true); clearInterval(waitForId); }
    }, 500);
    return () => clearInterval(waitForId);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;

    const handleOffer = async (offerData: any) => {
      const { sdp, candidates, fromName } = offerData;
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const c of candidates || []) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await new Promise<void>(resolve => {
          const t = setTimeout(resolve, 3000);
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
          };
        });
        const offerId = offerData.fromId || offerData.from;
        await sendSignal(offerId || "", "answer", { sdp: pc.localDescription, candidates: [] });
        pc.ondatachannel = e => {
          e.channel.onmessage = msg => {
            try {
              const data = JSON.parse(msg.data);
              if (data.type === "video" && active) {
                setNotification({ videoUrl: data.url, from: data.from || fromName || "Someone", p2p: true });
              }
            } catch {}
          };
        };
      } catch (err) {
        console.warn("[LAN] WebRTC answer failed:", err);
      }
    };

    const poll = async () => {
      if (!myDeviceId || !active) return;
      // Check WebRTC offer
      const offerData = await pollSignal("offer");
      if (offerData && active) {
        handleOffer(offerData);
      }
      // Check server-relay push
      try {
        const res = await fetch(`/api/lan/poll/${myDeviceId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.videoUrl && active) {
          setNotification({ videoUrl: data.videoUrl, from: data.from || "Someone", p2p: false });
        }
      } catch {}
    };

    // Poll immediately then every 5s
    poll();
    const interval = setInterval(poll, 5000);
    return () => { active = false; clearInterval(interval); pcRef.current?.close(); };
  }, [ready]);

  if (!notification) return null;

  const handleAccept = () => {
    const match = notification.videoUrl.match(/\/watch\/([^?&]+)/);
    if (match) setLocation(`/watch/${match[1]}`);
    else window.location.href = notification.videoUrl;
    setNotification(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[200] max-w-sm w-full animate-in slide-in-from-bottom-4">
      <div className="bg-card border border-primary/30 rounded-2xl p-4 shadow-2xl shadow-primary/10">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            {notification.p2p ? <Radio className="h-4 w-4 text-primary" /> : <Wifi className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {notification.from} muốn chia sẻ video
              {notification.p2p && <span className="ml-1 text-xs text-primary font-normal">(P2P)</span>}
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={handleAccept} className="gap-1.5 text-xs h-8">
                <CheckCircle2 className="h-3.5 w-3.5" /> Xem ngay
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNotification(null)} className="text-xs h-8">
                Bỏ qua
              </Button>
            </div>
          </div>
          <button onClick={() => setNotification(null)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send dialog ──────────────────────────────────────────────────────────────
interface LANShareDialogProps {
  videoUrl: string; videoTitle?: string; onClose: () => void;
}

export function LANShareDialog({ videoUrl, videoTitle, onClose }: LANShareDialogProps) {
  const [devices, setDevices] = useState<LANDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Record<string, string>>({});

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lan/devices");
      const data: LANDevice[] = await res.json();
      setDevices(data.filter(d => d.id !== myDeviceId));
    } catch { setDevices([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleSend = async (device: LANDevice) => {
    setStatus(s => ({ ...s, [device.id]: "..." }));
    await sendVideoP2P(
      device.id, videoUrl, myDeviceName,
      (msg) => setStatus(s => ({ ...s, [device.id]: msg }))
    );
    setTimeout(() => setStatus(s => { const n = { ...s }; delete n[device.id]; return n; }), 3000);
  };

  const getIcon = (name: string) =>
    name.includes("📱") ? Smartphone : name.includes("📟") ? Tablet : Monitor;

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
              <Radio className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Chia sẻ qua LAN (P2P)</h2>
              <p className="text-xs text-muted-foreground">Bạn: <span className="text-foreground font-medium">{myDeviceName}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video */}
        <div className="px-5 py-3 bg-secondary/30 border-b border-border">
          <p className="text-xs text-muted-foreground">Video:</p>
          <p className="text-sm font-medium line-clamp-1 mt-0.5">{videoTitle || videoUrl}</p>
        </div>

        {/* Devices */}
        <div className="px-5 pt-2 pb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Thiết bị trong mạng ({devices.length})
            </p>
            <button onClick={fetchDevices} disabled={loading}
              className="text-muted-foreground hover:text-foreground">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Đang tìm thiết bị...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <Wifi className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">Chưa có thiết bị nào</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mở TTube trên thiết bị khác cùng mạng WiFi.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchDevices} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Làm mới
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map(device => {
                const Icon = getIcon(device.name);
                const st = status[device.id];
                const done = st?.includes("✓");
                return (
                  <div key={device.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/40 transition-all">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{device.name}</p>
                      {st && <p className="text-xs text-primary mt-0.5">{st}</p>}
                    </div>
                    <Button size="sm" variant={done ? "default" : "outline"}
                      className={cn("gap-1.5 h-8 text-xs shrink-0", done && "bg-green-600 border-green-600")}
                      disabled={!!st && !done}
                      onClick={() => handleSend(device)}>
                      {st && !done ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> {st}</>
                      ) : done ? (
                        <><CheckCircle2 className="h-3 w-3" /> Xong!</>
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
