import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import {
  Globe, Shield, Zap, Plus, X, Download, Upload, Check, RefreshCw, Loader2, CheckCircle2, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_PROXY = "/api/proxy";

function regionFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (/\.(cn|jp|kr|vn|th|sg|my|id|ph|in)$/.test(host)) return "Asia";
    if (/\.(de|fr|gb|nl|pl|ru|it|es|se|no)$/.test(host)) return "Europe";
    if (/\.(br|mx|ar|co|pe|cl)$/.test(host)) return "LATAM";
    const ip = host.split(".").map(Number);
    if (ip[0] === 10 || ip[0] === 192 || ip[0] === 172) return "Private";
    // Rough geo by first octet
    if ([52,54,34,35,18,3,44,16,13,23].includes(ip[0])) return "Americas";
    if ([46,51,62,77,78,80,82,83,85,88,91,93,94,95].includes(ip[0])) return "Europe";
    if ([58,59,60,61,101,103,106,110,111,112,113,114,116,117,118,119,120,121,122,123,124,125,126,150,152,157,160,163,171,175,183,202,210,219,221,222,223].includes(ip[0])) return "Asia";
    return "Global";
  } catch {
    return "Global";
  }
}

export default function Settings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [proxyEnabled, setProxyEnabled] = useState(true);
  const [customProxy, setCustomProxy] = useState("");
  const [activeProxy, setActiveProxy] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

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
      if (forceRefresh) {
        toast({
          title: "Proxy list refreshed",
          description: `${data.total ?? 0} raw · ${data.validatedCount ?? 0} validated`,
        });
      }
    } catch {
      toast({ title: "Failed to load proxies", variant: "destructive" });
    } finally {
      setLoadingProxies(false);
    }
  };

  // Poll for validated proxies (they arrive asynchronously after raw fetch)
  useEffect(() => {
    const savedProxy = localStorage.getItem("custom_proxy") || "";
    setCustomProxy(savedProxy);
    setActiveProxy(savedProxy || DEFAULT_PROXY);
    const savedKeywords = localStorage.getItem("user_keywords");
    if (savedKeywords) setKeywords(JSON.parse(savedKeywords));
    const savedEnabled = localStorage.getItem("proxy_enabled");
    if (savedEnabled !== null) setProxyEnabled(savedEnabled === "true");
    fetchProxies();
  }, []);

  // Poll every 5s until validated proxies arrive
  useEffect(() => {
    if (validatedProxies.length > 0) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/proxies");
        const data = await res.json();
        if ((data.validated ?? []).length > 0) {
          setValidatedProxies(data.validated);
          setRawProxies(data.proxies ?? []);
          setFetchedAt(data.fetchedAt ?? 0);
          clearInterval(interval);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [validatedProxies.length]);

  const selectProxy = (url: string) => {
    const isDefault = url === DEFAULT_PROXY;
    setCustomProxy(isDefault ? "" : url);
    setActiveProxy(url);
    localStorage.setItem("custom_proxy", isDefault ? "" : url);
    localStorage.setItem("proxy_enabled", "true");
    setProxyEnabled(true);
    toast({ title: "Proxy selected", description: url });
  };

  const saveProxy = () => {
    localStorage.setItem("custom_proxy", customProxy);
    localStorage.setItem("proxy_enabled", String(proxyEnabled));
    setActiveProxy(customProxy || DEFAULT_PROXY);
    toast({ title: "Settings saved" });
  };

  const addKeyword = () => {
    if (newKeyword && !keywords.includes(newKeyword)) {
      const updated = [...keywords, newKeyword];
      setKeywords(updated);
      localStorage.setItem("user_keywords", JSON.stringify(updated));
      setNewKeyword("");
    }
  };

  const removeKeyword = (word: string) => {
    const updated = keywords.filter((k) => k !== word);
    setKeywords(updated);
    localStorage.setItem("user_keywords", JSON.stringify(updated));
  };

  const exportConfig = () => {
    const config = {
      custom_proxy: localStorage.getItem("custom_proxy"),
      proxy_enabled: localStorage.getItem("proxy_enabled"),
      user_keywords: localStorage.getItem("user_keywords"),
      favorites: localStorage.getItem("favorites"),
      history: localStorage.getItem("history"),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tubeviewer-config-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const cfg = JSON.parse(ev.target?.result as string);
        if (cfg.custom_proxy !== undefined) localStorage.setItem("custom_proxy", cfg.custom_proxy || "");
        if (cfg.proxy_enabled !== undefined) localStorage.setItem("proxy_enabled", cfg.proxy_enabled);
        if (cfg.user_keywords) localStorage.setItem("user_keywords", cfg.user_keywords);
        if (cfg.favorites) localStorage.setItem("favorites", cfg.favorites);
        if (cfg.history) localStorage.setItem("history", cfg.history);
        window.location.reload();
      } catch {
        toast({ title: "Import failed", variant: "destructive" });
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
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-muted-foreground">Manage player preferences and proxy configuration.</p>
        </div>

        {/* ── Proxy Configuration ────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Proxy Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Enable Proxy</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Route requests through a proxy to bypass restrictions.</p>
              </div>
              <Switch checked={proxyEnabled} onCheckedChange={setProxyEnabled} />
            </div>

            {/* Custom URL */}
            <div className="space-y-2">
              <Label className="font-medium">Custom Proxy URL</Label>
              <div className="flex gap-2">
                <Input
                  value={customProxy}
                  onChange={(e) => setCustomProxy(e.target.value)}
                  placeholder="http://host:port  (leave empty for built-in)"
                  className="font-mono text-sm"
                />
                <Button onClick={saveProxy} size="sm">Save</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Active: <code className="text-primary font-mono">{activeProxy || DEFAULT_PROXY}</code>
              </p>
            </div>

            {/* Proxy pool ──────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    ProxyScrape Pool
                  </Label>
                  {fetchedAt > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Updated {new Date(fetchedAt).toLocaleTimeString()} ·{" "}
                      <span className="text-green-500 font-medium">{validatedProxies.length} working</span>
                      {" "}/ {rawProxies.length} total
                    </p>
                  )}
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => fetchProxies(true)}
                  disabled={loadingProxies}
                  className="flex items-center gap-1.5"
                >
                  {loadingProxies
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  {loadingProxies ? "Loading…" : "Refresh"}
                </Button>
              </div>

              {/* Default built-in option */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  !activeProxy || activeProxy === DEFAULT_PROXY
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
                onClick={() => selectProxy(DEFAULT_PROXY)}
              >
                <div>
                  <p className="text-sm font-medium">Built-in Server Proxy</p>
                  <p className="text-xs text-muted-foreground font-mono">/api/proxy</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-primary/20 text-primary border-0">Recommended</Badge>
                  <Badge variant="outline" className="text-xs">Global</Badge>
                  {(!activeProxy || activeProxy === DEFAULT_PROXY) && <Check className="h-4 w-4 text-primary" />}
                </div>
              </div>

              {/* Tab switcher */}
              {rawProxies.length > 0 && (
                <div className="flex rounded-lg border overflow-hidden text-sm">
                  <button
                    className={`flex-1 py-1.5 px-3 flex items-center justify-center gap-1.5 transition-colors ${
                      activeTab === "validated" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                    }`}
                    onClick={() => { setActiveTab("validated"); setProxyPage(0); }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Validated ({validatedProxies.length})
                  </button>
                  <button
                    className={`flex-1 py-1.5 px-3 flex items-center justify-center gap-1.5 transition-colors ${
                      activeTab === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                    }`}
                    onClick={() => { setActiveTab("all"); setProxyPage(0); }}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    All ({rawProxies.length})
                  </button>
                </div>
              )}

              {/* Proxy list */}
              {loadingProxies && displayList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-sm">
                    {activeTab === "validated" ? "Validating proxies… (may take ~30s)" : "Loading…"}
                  </p>
                </div>
              ) : activeTab === "validated" && validatedProxies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
                  <Clock className="h-5 w-5 animate-pulse" />
                  <p className="text-sm text-center">
                    Validation in progress…<br />
                    <span className="text-xs">Checking proxies against YouTube in background</span>
                  </p>
                </div>
              ) : paged.length > 0 ? (
                <>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {paged.map((url) => {
                      const isActive = activeProxy === url;
                      const isValidated = validatedProxies.includes(url);
                      return (
                        <div
                          key={url}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isActive
                              ? "border-primary/60 bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                          onClick={() => selectProxy(url)}
                        >
                          <p className="text-xs font-mono text-foreground truncate flex-1 mr-2">{url}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isValidated && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" title="Validated" />
                            )}
                            <Badge variant="outline" className="text-xs">{regionFromUrl(url)}</Badge>
                            {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        Page {proxyPage + 1}/{totalPages} · {displayList.length} proxies
                      </span>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" disabled={proxyPage === 0}
                          onClick={() => setProxyPage((p) => p - 1)} className="h-7 px-2 text-xs">
                          ← Prev
                        </Button>
                        <Button variant="outline" size="sm" disabled={proxyPage >= totalPages - 1}
                          onClick={() => setProxyPage((p) => p + 1)} className="h-7 px-2 text-xs">
                          Next →
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No proxies. Click Refresh to fetch from ProxyScrape.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Content Filtering ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Content Filtering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-medium">Blocked Keywords</Label>
              <p className="text-xs text-muted-foreground">Videos with these keywords in the title will be hidden.</p>
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Add keyword…"
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                />
                <Button onClick={addKeyword} size="sm"><Plus className="h-4 w-4" /></Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {keywords.map((word) => (
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

        {/* ── Backup & Restore ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Backup & Restore
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="outline" className="flex-1 gap-2" onClick={exportConfig}>
              <Download className="h-4 w-4" /> Export Config
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import Config
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importConfig} />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
