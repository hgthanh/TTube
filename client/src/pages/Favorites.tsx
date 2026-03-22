import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

export default function Favorites() {
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("favorites");
    if (saved) {
      setFavorites(JSON.parse(saved));
    }
  }, []);

  const removeFavorite = (id: string) => {
    const updated = favorites.filter(f => f.videoId !== id);
    setFavorites(updated);
    localStorage.setItem("favorites", JSON.stringify(updated));
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-display font-bold">Your Favorites</h1>
            <p className="text-muted-foreground mt-2">
              {favorites.length} videos saved to your library
            </p>
          </div>
        </div>

        {favorites.length === 0 && (
           <div className="text-center py-20 text-muted-foreground">
             <p>No favorites yet. Go watch some videos!</p>
             <Button asChild variant="ghost" className="mt-4 text-primary">
               <Link href="/">Browse Videos</Link>
             </Button>
           </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {favorites.map((fav) => (
            <div key={fav.videoId} className="group relative bg-card rounded-xl overflow-hidden border border-white/5 hover:border-primary/50 transition-colors">
              <Link href={`/watch/${fav.videoId}`}>
                <div className="aspect-video relative">
                  <img src={fav.thumbnailUrl || ""} alt={fav.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                </div>
              </Link>
              <div className="p-4">
                <Link href={`/watch/${fav.videoId}`}>
                  <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors cursor-pointer">
                    {fav.title}
                  </h3>
                </Link>
                <p className="text-xs text-muted-foreground mt-1 mb-4">{fav.channelName}</p>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2 justify-start"
                  onClick={() => removeFavorite(fav.videoId)}
                >
                  <Trash2 className="w-4 h-4" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
