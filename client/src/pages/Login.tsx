import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Youtube, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { t } = useLang();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ login: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      login(data.token, data.user);
      toast({ title: t.login, description: `${t.welcome || "Welcome"}, ${data.user.username}!` });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary/10 p-3 rounded-2xl">
              <Youtube className="h-10 w-10 text-primary" fill="currentColor" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-display">{t.loginTitle}</h1>
          <p className="text-muted-foreground text-sm">{t.loginDesc}</p>
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.username} / {t.email}</Label>
                <Input
                  value={form.login}
                  onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                  placeholder="username or email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t.password}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.loggingIn}</> : t.loginBtn}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-2 text-sm text-muted-foreground">
          <p>{t.noAccount} <Link href="/register" className="text-primary hover:underline">{t.signUp}</Link></p>
          <Link href="/" className="block hover:text-foreground transition-colors">{t.continueAsGuest}</Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/terms" className="hover:underline">{t.termsLink}</Link>
          {" · "}
          <Link href="/privacy" className="hover:underline">{t.privacyLink}</Link>
        </p>
      </div>
    </div>
  );
}
