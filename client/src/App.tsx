import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/contexts/LangContext";
import { AuthProvider } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import VideoPage from "@/pages/Video";
import Favorites from "@/pages/Favorites";
import Channel from "@/pages/Channel";
import Settings from "@/pages/Settings";
import History from "@/pages/History";
import Shorts from "@/pages/Shorts";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import TermsPage from "@/pages/Terms";
import PrivacyPage from "@/pages/Privacy";
import TrendingPage from "@/pages/Trending";
import PlaylistPage from "@/pages/Playlist";
import { LANNotification } from "@/components/video/LANShare";

function Router() {
  return (
    <Switch>
      <Route path="/"><Redirect to="/home" /></Route>
      <Route path="/home" component={Home} />
      <Route path="/shorts" component={Shorts} />
      <Route path="/trending" component={TrendingPage} />
      <Route path="/playlist/:id" component={PlaylistPage} />
      <Route path="/search" component={Search} />
      <Route path="/watch/:id" component={VideoPage} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/channel/:id" component={Channel} />
      <Route path="/settings" component={Settings} />
      <Route path="/history" component={History} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}
