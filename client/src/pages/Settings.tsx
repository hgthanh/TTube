import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import {
  Globe,
  Shield,
  Zap,
  Info,
  Plus,
  X,
  Download,
  Upload,
  Check,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_PROXY = "/api/proxy";

interface ProxyItem {
  url: string;
  label: string;
  region: string;
  recommended: boolean;
}

function regionFromUrl(url: string): string {
  // Very rough heuristic based on IP ranges / TLDs
  try {
    const host = new URL(url).hostname;
    if (host.endsWith(".cn") || host.match(/^(58|60|61|111|112|113|14[0-9])\./)) return "Asia";
    if (host.match(/^(178|51|80|195|31)\./)) return "Europe";
    if (host.match(/^(3[4-5]|52|54|1[34][0-9])\./)) return "Americas";
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

  // Dynamic proxy pool from /api/proxies
  const [proxyList, setProxyList] = useState<ProxyItem[]>([]);
  const [loadingProxies, setLoadingProxies] = useState(false);
  const [proxyFetchedAt, setProxyFetchedAt] = useState<number>(0);
  const [proxyPage, setProxyPage] = useState(0);
  const PROXIES_PER_PAGE = 10;

  const fetchProxies = async (forceRefresh = false) => {
    setLoadingProxies(true);
    try {
      const url = forceRefresh ? "/api/proxies/refresh" : "/api/proxies";
      const method = forceRefresh ? "POST" : "GET";
      const res = await fetch(url, { method });
      const data = await res.json();

      const items: ProxyItem[] = (data.proxies as string[]).map(
        (url, i) => ({
          url,
          label: url,
          region: regionFromUrl(url),
          recommended: i === 0,
        })
      );

      setProxyList(items);
      setProxyFetchedAt(data.fetchedAt);
      setProxyPage(0);

      if (forceRefresh) {
        toast({
          title: "Proxy list refreshed",
          description: `Loaded ${items.length} proxies from ProxyScrape`,
        });
      }
    } catch (err) {
      toast({
        title: "Could not load proxies",
        description: "Server may still be loading. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoadingProxies(false);
    }
  };

  useEffect(() => {
    const savedProxy = localStorage.getItem("custom_proxy") || "";
    setCustomProxy(savedProxy);
    setActiveProxy(savedProxy || DEFAULT_PROXY);

    const savedKeywords = localStorage.getItem("user_keywords");
    if (savedKeywords) setKeywords(JSON.parse(savedKeywords));

    const savedProxyEnabled = localStorage.getItem("proxy_enabled");
    if (savedProxyEnabled !== null) setProxyEnabled(savedProxyEnabled === "true");

    fetchProxies();
  }, []);

  const selectProxy = (url: string) => {
    const isDefault = url === DEFAULT_PROXY;
    const toSave = isDefault ? "" : url;
    setCustomProxy(toSave);
    setActiveProxy(url);
    localStorage.setItem("custom_proxy", toSave);
    localStorage.setItem("proxy_enabled", "true");
    setProxyEnabled(true);
    toast({ title: "Proxy selected", description: `Now using: ${url}` });
  };

  const saveProxy = () => {
    localStorage.setItem("custom_proxy", customProxy);
    localStorage.setItem("proxy_enabled", String(proxyEnabled));
    setActiveProxy(customProxy || DEFAULT_PROXY);
    toast({
      title: "Settings saved",
      description: "Your proxy configuration has been updated.",
    });
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
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
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
        if (cfg.custom_proxy !== undefined)
          localStorage.setItem("custom_proxy", cfg.custom_proxy || "");
        if (cfg.proxy_enabled !== undefined)
          localStorage.setItem("proxy_enabled", cfg.proxy_enabled);
        if (cfg.user_keywords)
          localStorage.setItem("user_keywords", cfg.user_keywords);
        if (cfg.favorites) localStorage.setItem("favorites", cfg.favorites);
        if (cfg.history) localStorage.setItem("history", cfg.history);
        window.location.reload();
      } catch {
        toast({ title: "Import failed", description: "Invalid config file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const pagedProxies = proxyList.slice(
    proxyPage * PROXIES_PER_PAGE,
    (proxyPage + 1) * PROXIES_PER_PAGE
  );
  const totalPages = Math.ceil(proxyList.length / PROXIES_PER_PAGE);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-muted-foreground">
            Manage your player preferences and proxy configuration.
          </p>
        </div>

        {/* ── Proxy Configuration ─────────────────────────────────────── */}
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Route requests through a proxy server to bypass restrictions.
                </p>
              </div>
              <Switch
                checked={proxyEnabled}
                onCheckedChange={setProxyEnabled}
              />
            </div>

            {/* Custom proxy URL */}
            <div className="space-y-2">
              <Label className="font-medium">Custom Proxy URL</Label>
              <div className="flex gap-2">
                <Input
                  value={customProxy}
                  onChange={(e) => setCustomProxy(e.target.value)}
                  placeholder="http://user:pass@host:port  or leave empty for built-in"
                  className="font-mono text-sm"
                />
                <Button onClick={saveProxy} size="sm">
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to use the built-in server-side proxy (
                <code className="text-primary font-mono">/api/proxy</code>).
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Active:{" "}
                <code className="text-primary font-mono">
                  {activeProxy || DEFAULT_PROXY}
                </code>
              </div>
            </div>

            {/* Dynamic proxy list ───────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    ProxyScrape Pool
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Free proxies fetched live from ProxyScrape.
                    {proxyFetchedAt > 0 && (
                      <span className="ml-1">
                        Last updated:{" "}
                        {new Date(proxyFetchedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchProxies(true)}
                  disabled={loadingProxies}
                  className="flex items-center gap-1.5"
                >
                  {loadingProxies ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {loadingProxies ? "Loading…" : "Refresh"}
                </Button>
              </div>

              {/* Default (built-in) option */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeProxy === DEFAULT_PROXY || !activeProxy
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
                onClick={() => selectProxy(DEFAULT_PROXY)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Built-in Server Proxy (Recommended)
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    /api/proxy
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <Badge className="text-xs bg-primary/20 text-primary border-0">
                    Default
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Global
                  </Badge>
                  {(activeProxy === DEFAULT_PROXY || !activeProxy) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
              </div>

              {/* Paged proxy list */}
              {loadingProxies && proxyList.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading proxies…</span>
                </div>
              ) : proxyList.length > 0 ? (
                <>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {pagedProxies.map((proxy) => {
                      const isActive = activeProxy === proxy.url;
                      return (
                        <div
                          key={proxy.url}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isActive
                              ? "border-primary/60 bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                          onClick={() => selectProxy(proxy.url)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-foreground truncate">
                              {proxy.url}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2 shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {proxy.region}
                            </Badge>
                            {isActive && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        {proxyList.length} proxies · page {proxyPage + 1}/{totalPages}
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={proxyPage === 0}
                          onClick={() => setProxyPage((p) => p - 1)}
                          className="h-7 px-2 text-xs"
                        >
                          ← Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={proxyPage >= totalPages - 1}
                          onClick={() => setProxyPage((p) => p + 1)}
                          className="h-7 px-2 text-xs"
                        >
                          Next →
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No proxies loaded. Click Refresh to fetch from ProxyScrape.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Content Filtering ────────────────────────────────────────── */}
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
              <p className="text-xs text-muted-foreground">
                Videos containing these keywords in the title will be hidden from results.
              </p>
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Add keyword…"
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                />
                <Button onClick={addKeyword} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {keywords.map((word) => (
                    <Badge
                      key={word}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {word}
                      <button
                        onClick={() => removeKeyword(word)}
                        className="ml-0.5 hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Import / Export ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Backup & Restore
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={exportConfig}
            >
              <Download className="h-4 w-4" />
              Export Config
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Import Config
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={importConfig}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
