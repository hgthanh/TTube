import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Youtube, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function RegisterPage() {
  const { t } = useLang();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast({ title: "Error", description: t.passwordMismatch, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed");
      login(data.token, data.user);
      toast({ title: t.register, description: `${t.welcome || "Welcome"}, ${data.user.username}!` });
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
          <h1 className="text-2xl font-bold font-display">{t.registerTitle}</h1>
          <p className="text-muted-foreground text-sm">{t.registerDesc}</p>
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.username}</Label>
                <Input value={form.username} onChange={e => setForm(f=>({...f,username:e.target.value}))} placeholder="cooluser123" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9_]+" />
              </div>
              <div className="space-y-2">
                <Label>{t.email}</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>{t.password}</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>{t.confirmPassword}</Label>
                <Input type="password" value={form.confirm} onChange={e => setForm(f=>({...f,confirm:e.target.value}))} placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.registering}</> : t.registerBtn}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-2 text-sm text-muted-foreground">
          <p>{t.hasAccount} <Link href="/login" className="text-primary hover:underline">{t.signIn}</Link></p>
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
