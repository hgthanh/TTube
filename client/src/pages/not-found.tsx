import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLang } from "@/contexts/LangContext";
import { Home } from "lucide-react";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 text-center px-4">
      <div className="space-y-2">
        <h1 className="text-8xl font-display font-bold text-primary/30">404</h1>
        <p className="text-xl font-semibold">{t.notFound}</p>
      </div>
      <Button asChild variant="default" className="gap-2">
        <Link href="/"><Home className="h-4 w-4" /> {t.goHome}</Link>
      </Button>
    </div>
  );
}
