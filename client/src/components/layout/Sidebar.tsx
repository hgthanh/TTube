import { Link, useLocation } from "wouter";
import { Home, Heart, Compass, History, Settings, Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  isOpen: boolean;
}

const NAV_ITEMS = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Zap, label: "Shorts", href: "/shorts" },
  { icon: Flame, label: "Trending", href: "/search?q=trending" },
  { icon: Heart, label: "Favorites", href: "/favorites" },
  { icon: History, label: "History", href: "/history" },
];

const SECONDARY_ITEMS = [
  { icon: Compass, label: "Explore", href: "/search?q=explore" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function Sidebar({ isOpen }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 bottom-0 z-40 w-64 bg-background/95 backdrop-blur-sm border-r border-border transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:h-[calc(100vh-4rem)]",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex flex-col h-full py-4">
        <div className="px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-11 rounded-xl font-medium",
                    isActive && "bg-primary/10 text-primary hover:bg-primary/15"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>

        <div className="my-4 px-4">
          <div className="h-px bg-border/50" />
        </div>

        <div className="px-3 space-y-1">
          <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Library
          </h3>
          {SECONDARY_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-10 rounded-xl font-medium text-muted-foreground hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>

        <div className="mt-auto px-6 pb-6">
          <div className="bg-secondary/50 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-muted-foreground">
              LibreTube uses standard YouTube APIs via a proxy to ensure privacy and remove ads.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
