import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/errors";
import { bootstrapUser } from "@/lib/bootstrap";
import { alertDialog as toast } from "@/lib/alert";
import { hasStoredSupabaseSession } from "@/lib/fast-auth";
import { Shield, Loader2, Mail, Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { TelegramLoginPanel } from "@/components/TelegramLoginPanel";
import { Send } from "lucide-react";
import { signInWithPasswordServer, signUpWithPasswordServer } from "@/lib/auth-proxy.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const signInPassword = useServerFn(signInWithPasswordServer);
  const signUpPassword = useServerFn(signUpWithPasswordServer);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasStoredSupabaseSession()) void navigate({ to: "/vpn", replace: true });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const blocked = await checkBlockedAndRedirect(session.user.id, navigate);
        if (blocked) return;
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
        const data = await signUpPassword({
          data: { email, password, emailRedirectTo: `${window.location.origin}/vpn` },
        });
        if ("accessToken" in data && data.accessToken && data.refreshToken) {
          await supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          });
          await bootstrapUser();
          toast.success("Аккаунт создан");
          navigate({ to: "/vpn" });
        } else {
          toast.success("Аккаунт создан. Проверьте почту для подтверждения входа.");
        }
      } else {
        const data = await signInPassword({ data: { email, password } });
        await supabase.auth.setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
        });
        await bootstrapUser();
        navigate({ to: "/vpn" });
      }
    } catch (err: any) {
      toast.error(translateAuthError(getAuthErrorMessage(err)));
    } finally {
      setLoading(false);
    }
  }

  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [tgLoginOpen, setTgLoginOpen] = useState(false);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="ns-auth-shell fixed left-0 right-0 top-0 flex flex-col items-center justify-center overflow-hidden px-5"
      style={{ background: "var(--pwa-background)", height: "100dvh" }}
    >
      {/* Ambient background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "var(--gradient-primary)", opacity: 0.35 }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <div
          className="rounded-3xl border p-6"
          style={{
            background: "var(--card-solid)",
            borderColor: "color-mix(in srgb, var(--border) 70%, transparent)",
            boxShadow: "var(--shadow-elegant)",
          }}
        >
          <div className="mb-5 flex flex-col items-center gap-3 text-center">
            <motion.div
              initial={{ rotate: -10, scale: 0.85 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="relative grid h-16 w-16 place-items-center rounded-2xl"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
            >
              <Shield className="h-8 w-8 text-primary-foreground" />
              <span className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-background text-primary shadow-md">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            </motion.div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                {mode === "signup" ? "Добро пожаловать" : "С возвращением"}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {mode === "signup"
                  ? "Создайте аккаунт VPNSUS за 10 секунд."
                  : "Войдите, чтобы продолжить."}
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {(["signup", "login"] as const).map((k) => {
              const active = mode === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  className={`tg-press relative rounded-full py-1.5 text-[13px] font-medium transition-colors ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="auth-tab"
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--gradient-primary)" }}
                      transition={{ type: "spring", stiffness: 320, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{k === "signup" ? "Регистрация" : "Вход"}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="space-y-2.5">
            <FieldWrap icon={Mail}>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full bg-transparent pl-11 pr-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </FieldWrap>
            <FieldWrap icon={Lock}>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Пароль (мин. 6 символов)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full bg-transparent pl-11 pr-12 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Скрыть" : "Показать"}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </FieldWrap>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {loading ? (
                  <motion.span
                    key="l"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key={mode}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    {mode === "signup" ? "Создать аккаунт" : "Войти"}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </form>

          {mode === "login" && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                или
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                onClick={() => setTgLoginOpen(true)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#38BDF8,#0EA5E9)" }}
              >
                <Send className="h-4 w-4" /> Войти через Telegram
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Скоро"
                className="mt-2 relative flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white opacity-70 cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#4C75A3,#2E5A88)" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.606-3.478-1.66-1.529-1.735-1.569-.303-3.246 1.748-2.043 4.038-4.68 2.029-4.68h-3.2c-.771 0-.813.442-1.115 1.078-1.487 3.13-2.827 4.815-3.451 4.815-.415 0-.517-.398-.517-1.276V6.83c0-.912-.286-1.286-1.036-1.286H8.31c-.559 0-.895.284-.895.635 0 .887 1.325.657 1.325 3.129v3.325c0 1.16-.209 1.375-.657 1.375-.9 0-2.62-2.813-3.688-6.309-.24-.79-.457-1.155-1.222-1.155H.677C.076 6.544 0 6.831 0 7.187c0 .996 1.643 6.983 6.583 12.061 3.156 3.246 6.532 4.746 8.579 4.746z"/>
                </svg>
                Войти с VK
                <span
                  className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: "rgba(255,255,255,0.18)" }}
                >
                  Скоро
                </span>
              </button>
            </>
          )}

          {mode === "signup" ? (
            <p className="mt-4 text-center text-[11px] leading-snug text-muted-foreground/80">
              Регистрируясь, вы соглашаетесь с правилами сервиса.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="mt-3 block w-full text-center text-[13px] font-medium text-primary hover:opacity-80"
            >
              Забыли пароль? Обратиться в поддержку
            </button>
          )}
        </div>
      </motion.div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
      />

      <TelegramLoginPanel open={tgLoginOpen} onClose={() => setTgLoginOpen(false)} />
    </div>
  );
}

function FieldWrap({
  icon: Icon, children,
}: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-xl border transition-colors focus-within:border-primary/60"
      style={{
        background: "color-mix(in srgb, var(--input) 92%, transparent)",
        borderColor: "var(--border)",
      }}
    >
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {children}
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

async function checkBlockedAndRedirect(
  userId: string,
  navigate: ReturnType<typeof useNavigate>,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("is_blocked, blocked_until, blocked_reason")
      .eq("id", userId)
      .maybeSingle();
    if (!data?.is_blocked) return false;
    const until = data.blocked_until ? new Date(data.blocked_until) : null;
    if (until && until.getTime() <= Date.now()) return false;
    navigate({ to: "/blocked", replace: true });
    return true;
  } catch {
    return false;
  }
}
