import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import VideoPage from "@/pages/Video";
import Favorites from "@/pages/Favorites";
import Channel from "@/pages/Channel";
import Settings from "@/pages/Settings";
import History from "./pages/History";
import Shorts from "@/pages/Shorts";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/shorts" component={Shorts} />
      <Route path="/search" component={Search} />
      <Route path="/watch/:id" component={VideoPage} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/channel/:id" component={Channel} />
      <Route path="/settings" component={Settings} />
      <Route path="/history" component={History} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
