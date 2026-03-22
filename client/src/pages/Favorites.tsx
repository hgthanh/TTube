import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Heart, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Skeleton } from "@/components/ui/skeleton";

export default function Favorites() {
  const { t } = useLang();
  const { isAuthenticated, authHeaders } = useAuth();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/favorites", { headers: authHeaders() })
        .then(r => r.json()).then(data => { setFavorites(Array.isArray(data) ? data : []); })
        .catch(() => setFavorites([]))
        .finally(() => setLoading(false));
    } else {
      // Guest: read from localStorage
      const saved = localStorage.getItem("favorites");
      setFavorites(saved ? JSON.parse(saved) : []);
      setLoading(false);
    }
  }, [isAuthenticated]);

  const removeFavorite = async (fav: any) => {
    if (isAuthenticated) {
      await fetch(`/api/favorites/${fav.id}`, { method: "DELETE", headers: authHeaders() });
      setFavorites(f => f.filter(x => x.id !== fav.id));
    } else {
      const updated = favorites.filter(f => f.videoId !== fav.videoId);
      setFavorites(updated);
      localStorage.setItem("favorites", JSON.stringify(updated));
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Heart className="h-8 w-8 text-primary" /> {t.yourFavorites}
            </h1>
            <p className="text-muted-foreground mt-2">{favorites.length} {t.savedVideos}</p>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm">
            <LogIn className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground">{t.loginToSaveFavorites}</span>
            <Button asChild size="sm" variant="outline" className="ml-auto shrink-0">
              <Link href="/login">{t.login}</Link>
            </Button>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({length:8}).map((_,i)=>(
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video rounded-xl" />
                <Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && favorites.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Heart className="h-16 w-16 mx-auto opacity-20 mb-4" />
            <p>{t.noFavorites}</p>
            <Button asChild variant="ghost" className="mt-4 text-primary"><Link href="/">{t.browseVideos}</Link></Button>
          </div>
        )}

        {!loading && favorites.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {favorites.map((fav) => {
              const videoId = fav.video_id || fav.videoId;
              const thumbUrl = fav.thumbnail_url || fav.thumbnailUrl;
              const channel = fav.channel_name || fav.channelName;
              return (
                <div key={fav.id || videoId} className="group relative bg-card rounded-xl overflow-hidden border border-white/5 hover:border-primary/50 transition-colors">
                  <Link href={`/watch/${videoId}`}>
                    <div className="aspect-video relative">
                      <img src={thumbUrl||""} alt={fav.title} className="w-full h-full object-cover" />
                    </div>
                  </Link>
                  <div className="p-4">
                    <Link href={`/watch/${videoId}`}>
                      <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors cursor-pointer">{fav.title}</h3>
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">{channel}</p>
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2 justify-start" onClick={() => removeFavorite(fav)}>
                      <Trash2 className="w-4 h-4" /> {t.remove}
                    </Button>
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
