import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Clock, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Skeleton } from "@/components/ui/skeleton";

export default function History() {
  const { t } = useLang();
  const { isAuthenticated, authHeaders } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/history", { headers: authHeaders() })
        .then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : []))
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    } else {
      const saved = localStorage.getItem("history");
      setHistory(saved ? JSON.parse(saved) : []);
      setLoading(false);
    }
  }, [isAuthenticated]);

  const clearHistory = async () => {
    if (isAuthenticated) {
      await fetch("/api/history", { method: "DELETE", headers: authHeaders() });
    } else {
      localStorage.removeItem("history");
    }
    setHistory([]);
  };

  const removeEntry = async (item: any) => {
    const videoId = item.video_id || item.videoId;
    if (isAuthenticated) {
      await fetch(`/api/history/${videoId}`, { method: "DELETE", headers: authHeaders() });
    } else {
      const updated = history.filter(h => (h.video_id||h.videoId) !== videoId);
      localStorage.setItem("history", JSON.stringify(updated));
    }
    setHistory(h => h.filter(x => (x.video_id||x.videoId) !== videoId));
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" /> {t.watchHistory}
            </h1>
            <p className="text-muted-foreground mt-2">{t.recentlyWatched}</p>
          </div>
          {history.length > 0 && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20" onClick={clearHistory}>
              <Trash2 className="w-4 h-4 mr-2" /> {t.clearAll}
            </Button>
          )}
        </div>

        {!isAuthenticated && (
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm">
            <LogIn className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground">{t.loginToSync}</span>
            <Button asChild size="sm" variant="outline" className="ml-auto shrink-0">
              <Link href="/login">{t.login}</Link>
            </Button>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({length:8}).map((_,i)=><div key={i} className="space-y-3"><Skeleton className="aspect-video rounded-xl" /><Skeleton className="h-4 w-full" /></div>)}
          </div>
        )}

        {!loading && history.length === 0 && (
          <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-4">
            <Clock className="w-16 h-16 opacity-20" />
            <p>{t.noHistory}</p>
            <Button asChild variant="ghost" className="text-primary"><Link href="/">{t.exploreVideos}</Link></Button>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {history.map((item) => {
              const videoId = item.video_id || item.videoId;
              const thumbUrl = item.thumbnail_url || item.thumbnailUrl;
              const channel = item.channel_name || item.channelName;
              const date = item.watched_at || item.watchedAt;
              return (
                <div key={`${videoId}-${date}`} className="group relative bg-card rounded-xl overflow-hidden border border-white/5 hover:border-primary/50 transition-colors">
                  <Link href={`/watch/${videoId}`}>
                    <div className="aspect-video relative">
                      <img src={thumbUrl||""} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                  </Link>
                  <div className="p-4">
                    <Link href={`/watch/${videoId}`}>
                      <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors cursor-pointer">{item.title}</h3>
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">{channel}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{new Date(date).toLocaleDateString()}</span>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeEntry(item)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
