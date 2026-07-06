import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/errors";
import { bootstrapUser } from "@/lib/bootstrap";
import { alertDialog as toast } from "@/lib/alert";
import { hasStoredSupabaseSession } from "@/lib/fast-auth";
import { Shield, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasStoredSupabaseSession()) void navigate({ to: "/vpn", replace: true });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        sessionStorage.removeItem("ns_is_admin");
        navigate({ to: "/vpn" });
        void bootstrapUser();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error("Пароль должен содержать минимум 6 символов"); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/vpn` },
        });
        if (error) throw error;
        if (data.session) {
          await bootstrapUser();
          toast.success("Аккаунт создан");
          navigate({ to: "/vpn" });
        } else {
          // На всякий случай — сразу логиним
          const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
          if (e2) throw e2;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(translateAuthError(getAuthErrorMessage(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6"
    >
      <div className="ns-fade w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}>
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-center">Добро пожаловать в NetSpas</h1>
          <p className="text-sm text-muted-foreground text-center">{mode === "signup" ? "Создайте аккаунт если у вас его нет." : "Войдите в аккаунт"}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email" required autoComplete="email" placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-input px-4 text-foreground outline-none focus:border-primary"
          />
          <input
            type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Пароль (мин. 6 символов)"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-input px-4 text-foreground outline-none focus:border-primary"
          />
          <button
            type="submit" disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (mode === "signup" ? "Зарегистрироваться" : "Войти")}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}
        </button>
      </div>
    </div>
  );
}

function getAuthErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const maybe = err as { message?: unknown; error_description?: unknown; error?: unknown };
    if (typeof maybe.message === "string" && maybe.message) return maybe.message;
    if (typeof maybe.error_description === "string" && maybe.error_description) return maybe.error_description;
    if (typeof maybe.error === "string" && maybe.error) return maybe.error;
  }
  return "Не удалось подключиться к серверу. Попробуйте ещё раз.";
}
