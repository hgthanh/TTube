import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Search, Menu, X, Youtube, LogIn, User, LogOut, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps { toggleSidebar: () => void; isSidebarOpen: boolean; }

export function Header({ toggleSidebar, isSidebarOpen }: HeaderProps) {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const composingRef = useRef(false); // track IME composition (Vietnamese, CJK)
  const { user, isAuthenticated, logout } = useAuth();
  const { t, lang, setLang } = useLang();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (searchQuery.trim()) setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  const handleSuggestionClick = (s: string) => {
    setSearchQuery(s);
    setShowSuggestions(false);
    setLocation(`/search?q=${encodeURIComponent(s)}`);
  };

  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (searchQuery.length < 2) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/yt/suggestions?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data.slice(0, 8) : []);
        setShowSuggestions(true);
      } catch {}
    }, 300);
    return () => clearTimeout(suggestTimer.current);
  }, [searchQuery]);

  return (
    <header className="sticky top-0 z-50 w-full glass h-16 flex items-center px-4 md:px-6 justify-between gap-4">
      <div className="flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden text-muted-foreground hover:text-foreground">
          {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
        <Link href="/home" className="flex items-center gap-2 group cursor-pointer">
          <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
            <Youtube className="h-6 w-6 text-primary" fill="currentColor" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight hidden sm:block">TTube</span>
        </Link>
      </div>

      <form onSubmit={handleSearch} className="flex-1 max-w-xl relative">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary border-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50 text-sm"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              // Only trigger suggestions after IME composition is complete
              if (!composingRef.current) setShowSuggestions(true);
            }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => {
              composingRef.current = false;
              // After IME commits (e.g. Vietnamese tone marks), update the value
              setSearchQuery((e.target as HTMLInputElement).value);
              setShowSuggestions(true);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-secondary transition-colors text-sm flex items-center gap-3"
                onMouseDown={() => handleSuggestionClick(s)}>
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="flex items-center gap-2 shrink-0">
        {/* Language switcher */}
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === "vi" ? "en" : "vi")}
          className="hidden sm:flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
          <Globe className="h-3.5 w-3.5" />
          {lang === "vi" ? "EN" : "VI"}
        </Button>

        {/* Auth */}
        {isAuthenticated ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                  {user?.username[0].toUpperCase()}
                </div>
                <span className="hidden sm:block text-sm font-medium">{user?.username}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild><Link href="/settings"><User className="h-4 w-4 mr-2" /> {t.settings}</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> {t.logout}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/login"><LogIn className="h-4 w-4" /><span className="hidden sm:block">{t.login}</span></Link>
          </Button>
        )}
      </div>
    </header>
  );
}
