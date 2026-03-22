import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Clock } from "lucide-react";
import { useState, useEffect } from "react";

export default function History() {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("history");
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  const clearHistory = () => {
    localStorage.removeItem("history");
    setHistory([]);
  };

  const removeEntry = (id: string) => {
    const updated = history.filter(h => h.videoId !== id);
    setHistory(updated);
    localStorage.setItem("history", JSON.stringify(updated));
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-display font-bold">Watch History</h1>
            <p className="text-muted-foreground mt-2">
              Videos you have recently watched
            </p>
          </div>
          {history.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
              onClick={clearHistory}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear all history
            </Button>
          )}
        </div>

        {history.length === 0 && (
           <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-4">
             <Clock className="w-16 h-16 opacity-20" />
             <p>No watch history yet.</p>
             <Button asChild variant="ghost" className="text-primary">
               <Link href="/">Explore Videos</Link>
             </Button>
           </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {history.map((item) => (
            <div key={`${item.videoId}-${item.watchedAt}`} className="group relative bg-card rounded-xl overflow-hidden border border-white/5 hover:border-primary/50 transition-colors">
              <Link href={`/watch/${item.videoId}`}>
                <div className="aspect-video relative">
                  <img src={item.thumbnailUrl || ""} alt={item.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                </div>
              </Link>
              <div className="p-4">
                <Link href={`/watch/${item.videoId}`}>
                  <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors cursor-pointer">
                    {item.title}
                  </h3>
                </Link>
                <p className="text-xs text-muted-foreground mt-1 mb-4">{item.channelName}</p>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {new Date(item.watchedAt).toLocaleDateString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeEntry(item.videoId)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
