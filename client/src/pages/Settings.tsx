import { Layout } from "@/components/layout/Layout";
import { updateLANDeviceName } from "@/components/video/LANShare";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import {
  Globe, Shield, Zap, Plus, X, Download, Upload,
  Check, RefreshCw, Loader2, CheckCircle2, Clock, LogIn, User, Wifi,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Link } from "wouter";

const DEFAULT_PROXY = "/api/proxy";

function regionFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    const ip = host.split(".").map(Number);
    if ([58,59,60,61,101,103,106,110,111,112,113,114,116,117,118,119,120,121,122,123,124,125,126,150,152,157,160,163,171,175,183,202,210,219,221,222,223].includes(ip[0])) return "Asia";
    if ([46,51,62,77,78,80,82,83,85,88,91,93,94,95,178,212].includes(ip[0])) return "Europe";
    if ([52,54,34,35,18,3,44,23].includes(ip[0])) return "Americas";
    return "Global";
  } catch { return "Global"; }
}

export default function Settings() {
  const { toast } = useToast();
  const { t, lang, setLang } = useLang();
  const { isAuthenticated, authHeaders, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Prevent saveSettings from firing during initial data load
  const initialized = useRef(false);

  const [lanDeviceName, setLanDeviceName] = useState(
    () => localStorage.getItem("lan_device_name") || ""
  );
  const [proxyEnabled, setProxyEnabled] = useState(true);
  const [customProxy, setCustomProxy] = useState("");
  const [activeProxy, setActiveProxy] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  // Proxy pool state
  const [rawProxies, setRawProxies] = useState<string[]>([]);
  const [validatedProxies, setValidatedProxies] = useState<string[]>([]);
  const [loadingProxies, setLoadingProxies] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [activeTab, setActiveTab] = useState<"validated" | "all">("validated");
  const [proxyPage, setProxyPage] = useState(0);
  const PER_PAGE = 10;

  const fetchProxies = async (forceRefresh = false) => {
    setLoadingProxies(true);
    try {
      const res = await fetch(forceRefresh ? "/api/proxies/refresh" : "/api/proxies", {
        method: forceRefresh ? "POST" : "GET",
      });
      const data = await res.json();
      setRawProxies(data.proxies ?? []);
      setValidatedProxies(data.validated ?? []);
      setFetchedAt(data.fetchedAt ?? 0);
      setProxyPage(0);
      if (forceRefresh) toast({ title: t.refresh, description: `${data.total ?? 0} total · ${data.validatedCount ?? 0} ${t.working}` });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setLoadingProxies(false);
    }
  };

  // Load settings from API if authenticated, else localStorage
  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/settings", { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          if (data.custom_proxy !== undefined) {
            setCustomProxy(data.custom_proxy || "");
            setActiveProxy(data.custom_proxy || DEFAULT_PROXY);
          }
          if (data.proxy_enabled !== undefined) setProxyEnabled(!!data.proxy_enabled);
          if (data.user_keywords) {
            try { setKeywords(typeof data.user_keywords === "string" ? JSON.parse(data.user_keywords) : data.user_keywords); } catch {}
          }
          initialized.current = true;
        })
        .catch(() => { loadFromLocalStorage(); initialized.current = true; });
    } else {
      loadFromLocalStorage();
    }
    fetchProxies();
  }, [isAuthenticated]);

  // Poll until validated proxies arrive
  useEffect(() => {
    if (validatedProxies.length > 0) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch("/api/proxies");
        const d = await r.json();
        if ((d.validated ?? []).length > 0) {
          setValidatedProxies(d.validated);
          setRawProxies(d.proxies ?? []);
          setFetchedAt(d.fetchedAt ?? 0);
          clearInterval(iv);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [validatedProxies.length]);

  const loadFromLocalStorage = () => {
    const savedProxy = localStorage.getItem("custom_proxy") || "";
    setCustomProxy(savedProxy);
    setActiveProxy(savedProxy || DEFAULT_PROXY);
    const savedKeywords = localStorage.getItem("user_keywords");
    if (savedKeywords) { try { setKeywords(JSON.parse(savedKeywords)); } catch {} }
    const savedEnabled = localStorage.getItem("proxy_enabled");
    if (savedEnabled !== null) setProxyEnabled(savedEnabled === "true");
    initialized.current = true;
  };

  const saveSettings = async (overrides?: Record<string, any>) => {
    // Don't sync during initial data load to avoid spurious PUT requests
    if (!initialized.current) return;
    const payload = {
      custom_proxy: customProxy,
      proxy_enabled: proxyEnabled,
      user_keywords: keywords,
      language: lang,
      ...overrides,
    };
    // Always save to localStorage as fallback
    localStorage.setItem("custom_proxy", payload.custom_proxy || "");
    localStorage.setItem("proxy_enabled", String(payload.proxy_enabled));
    localStorage.setItem("user_keywords", JSON.stringify(payload.user_keywords));
    // Sync to server if logged in
    if (isAuthenticated) {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  };

  const selectProxy = (url: string) => {
    const isDefault = url === DEFAULT_PROXY;
    const toSave = isDefault ? "" : url;
    setCustomProxy(toSave);
    setActiveProxy(url);
    localStorage.setItem("custom_proxy", toSave);
    localStorage.setItem("proxy_enabled", "true");
    setProxyEnabled(true);
    saveSettings({ custom_proxy: toSave, proxy_enabled: true });
    toast({ title: t.proxyConfig, description: url });
  };

  const saveProxy = async () => {
    setActiveProxy(customProxy || DEFAULT_PROXY);
    await saveSettings();
    toast({ title: t.settingsTitle });
  };

  const addKeyword = () => {
    if (newKeyword && !keywords.includes(newKeyword)) {
      const updated = [...keywords, newKeyword];
      setKeywords(updated);
      setNewKeyword("");
      saveSettings({ user_keywords: updated });
    }
  };

  const removeKeyword = (word: string) => {
    const updated = keywords.filter(k => k !== word);
    setKeywords(updated);
    saveSettings({ user_keywords: updated });
  };

  const handleLangChange = (l: "en" | "vi") => {
    setLang(l);
    saveSettings({ language: l });
  };

  const exportConfig = () => {
    const config = { custom_proxy: customProxy, proxy_enabled: proxyEnabled, user_keywords: keywords, language: lang };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ttube-config-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const cfg = JSON.parse(ev.target?.result as string);
        if (cfg.custom_proxy !== undefined) setCustomProxy(cfg.custom_proxy || "");
        if (cfg.proxy_enabled !== undefined) setProxyEnabled(cfg.proxy_enabled !== false);
        if (cfg.user_keywords) setKeywords(cfg.user_keywords);
        if (cfg.language) setLang(cfg.language);
        await saveSettings(cfg);
        toast({ title: t.importConfig });
      } catch {
        toast({ title: "Error", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const displayList = activeTab === "validated" ? validatedProxies : rawProxies;
  const paged = displayList.slice(proxyPage * PER_PAGE, (proxyPage + 1) * PER_PAGE);
  const totalPages = Math.ceil(displayList.length / PER_PAGE);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">{t.settingsTitle}</h1>
          <p className="text-muted-foreground">{t.settingsDesc}</p>
        </div>

        {/* ── Account & Sync ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> {t.accountSync}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isAuthenticated ? (
              <div className="flex items-center gap-4 p-3 bg-primary/5 rounded-xl border border-primary/10">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                  {user?.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">@{user?.username}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <Badge className="ml-auto text-xs bg-green-500/20 text-green-400 border-0">Synced ✓</Badge>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t.syncDesc}</p>
                <div className="flex gap-2">
                  <Button asChild variant="default" className="flex-1 gap-2">
                    <Link href="/login"><LogIn className="h-4 w-4" /> {t.login}</Link>
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <Link href="/register">{t.register}</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── LAN Device Name ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" /> Chia sẻ qua mạng LAN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-medium">Tên thiết bị của bạn</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tên này hiển thị với thiết bị khác khi bạn chia sẻ video qua LAN P2P.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={lanDeviceName}
                onChange={e => setLanDeviceName(e.target.value)}
                placeholder="Ví dụ: 💻 MacBook của tôi"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => {
                  const name = lanDeviceName.trim() || "Thiết bị";
                  setLanDeviceName(name);
                  updateLANDeviceName(name);
                  toast({ title: "Đã lưu tên thiết bị", description: name });
                }}
              >
                <Check className="h-4 w-4 mr-1" /> Lưu
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
              Thiết bị đang hoạt động và có thể nhận video được chia sẻ.
            </p>
          </CardContent>
        </Card>

        {/* ── Language ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> {t.language}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.languageDesc}</p>
            <div className="flex gap-3">
              {(["vi", "en"] as const).map(l => (
                <button
                  key={l}
                  onClick={() => handleLangChange(l)}
                  className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-all text-sm ${lang === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                >
                  {l === "vi" ? "🇻🇳 Tiếng Việt" : "🇬🇧 English"}
                  {lang === l && <Check className="h-3.5 w-3.5 inline ml-2" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Proxy Configuration ────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> {t.proxyConfig}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">{t.enableProxy}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t.proxyDesc}</p>
              </div>
              <Switch checked={proxyEnabled} onCheckedChange={v => { setProxyEnabled(v); saveSettings({ proxy_enabled: v }); }} />
            </div>

            <div className="space-y-2">
              <Label className="font-medium">{t.customProxyUrl}</Label>
              <div className="flex gap-2">
                <Input value={customProxy} onChange={e => setCustomProxy(e.target.value)}
                  placeholder="http://host:port  (leave empty for built-in)" className="font-mono text-sm" />
                <Button onClick={saveProxy} size="sm">{t.save}</Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {t.activeProxy} <code className="text-primary font-mono">{activeProxy || DEFAULT_PROXY}</code>
              </p>
            </div>

            {/* Proxy pool */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium flex items-center gap-1.5">
                    <Globe className="h-4 w-4" /> {t.proxyScrapePool}
                  </Label>
                  {fetchedAt > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.updated} {new Date(fetchedAt).toLocaleTimeString()} ·{" "}
                      <span className="text-green-500 font-medium">{validatedProxies.length} {t.working}</span>
                      {" "}/ {rawProxies.length} {t.total}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchProxies(true)} disabled={loadingProxies} className="flex items-center gap-1.5">
                  {loadingProxies ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {loadingProxies ? t.loading : t.refresh}
                </Button>
              </div>

              {/* Built-in default */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${!activeProxy || activeProxy === DEFAULT_PROXY ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                onClick={() => selectProxy(DEFAULT_PROXY)}
              >
                <div>
                  <p className="text-sm font-medium">{t.builtInProxy}</p>
                  <p className="text-xs text-muted-foreground font-mono">/api/proxy</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-primary/20 text-primary border-0">{t.recommended}</Badge>
                  <Badge variant="outline" className="text-xs">{t.global}</Badge>
                  {(!activeProxy || activeProxy === DEFAULT_PROXY) && <Check className="h-4 w-4 text-primary" />}
                </div>
              </div>

              {/* Tab switcher */}
              {rawProxies.length > 0 && (
                <div className="flex rounded-lg border overflow-hidden text-sm">
                  {(["validated", "all"] as const).map(tab => (
                    <button key={tab}
                      className={`flex-1 py-1.5 px-3 flex items-center justify-center gap-1.5 transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
                      onClick={() => { setActiveTab(tab); setProxyPage(0); }}>
                      {tab === "validated" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                      {tab === "validated" ? `${t.validated} (${validatedProxies.length})` : `${t.all} (${rawProxies.length})`}
                    </button>
                  ))}
                </div>
              )}

              {/* Proxy list */}
              {loadingProxies && displayList.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-sm">{activeTab === "validated" ? "Validating proxies… (~30s)" : t.loading}</p>
                </div>
              ) : activeTab === "validated" && validatedProxies.length === 0 && !loadingProxies ? (
                <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                  <Clock className="h-5 w-5 animate-pulse" />
                  <p className="text-sm text-center">Validation in progress…<br /><span className="text-xs">Checking proxies against YouTube</span></p>
                </div>
              ) : paged.length > 0 ? (
                <>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {paged.map(url => {
                      const isActive = activeProxy === url;
                      const isValidated = validatedProxies.includes(url);
                      return (
                        <div key={url}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${isActive ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                          onClick={() => selectProxy(url)}>
                          <p className="text-xs font-mono truncate flex-1 mr-2">{url}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isValidated && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                            <Badge variant="outline" className="text-xs">{regionFromUrl(url)}</Badge>
                            {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">Page {proxyPage + 1}/{totalPages} · {displayList.length} proxies</span>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" disabled={proxyPage === 0} onClick={() => setProxyPage(p => p - 1)} className="h-7 px-2 text-xs">← Prev</Button>
                        <Button variant="outline" size="sm" disabled={proxyPage >= totalPages - 1} onClick={() => setProxyPage(p => p + 1)} className="h-7 px-2 text-xs">Next →</Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No proxies. Click {t.refresh}.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Content Filtering ────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> {t.contentFilter}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-medium">{t.blockedKeywords}</Label>
              <p className="text-xs text-muted-foreground">{t.keywordsDesc}</p>
              <div className="flex gap-2">
                <Input value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
                  placeholder={t.addKeyword} onKeyDown={e => e.key === "Enter" && addKeyword()} />
                <Button onClick={addKeyword} size="sm"><Plus className="h-4 w-4" /></Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {keywords.map(word => (
                    <Badge key={word} variant="secondary" className="flex items-center gap-1 pr-1">
                      {word}
                      <button onClick={() => removeKeyword(word)} className="ml-0.5 hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Backup & Restore ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> {t.backup}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="outline" className="flex-1 gap-2" onClick={exportConfig}>
              <Download className="h-4 w-4" /> {t.exportConfig}
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {t.importConfig}
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importConfig} />
          </CardContent>
        </Card>

        {/* Footer links */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          <Link href="/terms" className="hover:underline">{t.termsLink}</Link>
          {" · "}
          <Link href="/privacy" className="hover:underline">{t.privacyLink}</Link>
        </p>
      </div>
    </Layout>
  );
}
