import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FaqList } from "@/components/FaqList";
import { translateAuthError, isOffline, OFFLINE_MESSAGE } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { useTheme, THEMES, MOTIONS, type ColorMode, type DesignTheme, type Motion } from "@/lib/theme";
import {
  LogOut, Trash2, KeyRound, Loader2, Moon, Sun, Mail, HelpCircle,
  Settings as SettingsIcon, X, Palette, ChevronRight, Check, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

function SettingsGroup({
  title, tone = "default", children,
}: { title: string; tone?: "default" | "danger"; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div
        className={`px-2 text-[11px] uppercase tracking-wider ${tone === "danger" ? "text-destructive/80" : "text-muted-foreground"}`}
      >
        {title}
      </div>
      <div
        className="overflow-hidden rounded-2xl border"
        style={{
          background: "var(--card-solid)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  icon: Icon, iconBg, label, sub, right, onClick, labelClassName,
}: {
  icon: LucideIcon;
  iconBg: string;
  label: string;
  sub?: string;
  right?: ReactNode;
  onClick?: () => void;
  labelClassName?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`tg-press flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${onClick ? "hover:bg-muted/40" : ""}`}
      style={{ borderTop: "1px solid color-mix(in srgb, var(--border) 45%, transparent)" }}
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{ background: iconBg }}
      >
        <Icon className="h-4 w-4 text-white" strokeWidth={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[14px] font-medium ${labelClassName ?? "text-foreground"}`}>{label}</div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      {right}
    </Tag>
  );
}

function ModePill({ mode, onChange }: { mode: ColorMode; onChange: (m: ColorMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
      {(["light", "dark"] as const).map((k) => {
        const active = mode === k;
        const Icon = k === "light" ? Sun : Moon;
        return (
          <button
            key={k}
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(k); }}
            className={`grid h-7 w-9 place-items-center rounded-full transition-colors ${
              active ? "text-primary-foreground" : "text-muted-foreground"
            }`}
            style={active ? { background: "var(--gradient-primary)" } : undefined}
            aria-label={k === "light" ? "Светлая" : "Тёмная"}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

const THEME_STYLE: Record<DesignTheme, { bg: string; c1: string; c2: string; glow: string }> = {
  midnight: { bg: "#0B0F1E", c1: "#6366F1", c2: "#22D3EE", glow: "rgba(99,102,241,0.55)" },
  sunset:   { bg: "#140B07", c1: "#FBBF24", c2: "#EA580C", glow: "rgba(234,88,12,0.55)" },
  forest:   { bg: "#07101F", c1: "#3B82F6", c2: "#06B6D4", glow: "rgba(59,130,246,0.55)" },
  candy:    { bg: "#160C15", c1: "#F472B6", c2: "#A855F7", glow: "rgba(244,114,182,0.55)" },
};

function ThemePreview({ id }: { id: DesignTheme }) {
  const s = THEME_STYLE[id];
  const grad = `linear-gradient(135deg, ${s.c1} 0%, ${s.c2} 100%)`;
  return (
    <div
      className="relative h-[76px] w-full overflow-hidden rounded-xl"
      style={{
        background: s.bg,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.c1} 22%, transparent)`,
      }}
    >
      {/* ambient glow */}
      <div
        className="absolute -right-6 -top-6 h-16 w-16 rounded-full"
        style={{ background: s.glow, filter: "blur(18px)", opacity: 0.85 }}
      />
      <div
        className="absolute -left-4 bottom-0 h-10 w-16 rounded-full"
        style={{ background: s.c2, filter: "blur(16px)", opacity: 0.35 }}
      />
      {/* fake status bar */}
      <div className="absolute inset-x-2 top-1.5 flex items-center justify-between">
        <span className="h-1 w-6 rounded-full bg-white/45" />
        <span className="h-1 w-4 rounded-full bg-white/25" />
      </div>
      {/* hero pill */}
      <div
        className="absolute left-2 right-2 top-4 h-7 rounded-lg"
        style={{ background: grad, boxShadow: `0 6px 14px -6px ${s.glow}` }}
      >
        <div className="absolute inset-y-1 left-1.5 w-4 rounded-md bg-white/25" />
        <div className="absolute right-2 top-2 h-1 w-8 rounded-full bg-white/50" />
        <div className="absolute right-2 top-4 h-1 w-5 rounded-full bg-white/30" />
      </div>
      {/* content cards */}
      <div className="absolute inset-x-2 bottom-1.5 flex gap-1">
        <div className="h-4 flex-1 rounded-md bg-white/10 backdrop-blur-sm" />
        <div
          className="h-4 w-8 rounded-md"
          style={{ background: `color-mix(in srgb, ${s.c1} 60%, transparent)` }}
        />
      </div>
    </div>
  );
}

function ThemeGrid({ current, onChange }: { current: DesignTheme; onChange: (t: DesignTheme) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {THEMES.map((t) => {
        const active = current === t.id;
        const s = THEME_STYLE[t.id];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="tg-press group relative flex flex-col gap-2 rounded-2xl border p-2 text-left transition-all"
            style={{
              borderColor: active
                ? `color-mix(in srgb, ${s.c1} 75%, transparent)`
                : "var(--border)",
              background: active
                ? `color-mix(in srgb, ${s.c1} 10%, transparent)`
                : "transparent",
              boxShadow: active ? `0 10px 28px -14px ${s.glow}` : "none",
            }}
          >
            <ThemePreview id={t.id} />
            {active && (
              <div
                className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${s.c1}, ${s.c2})` }}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </div>
            )}
            <div className="min-w-0 px-0.5">
              <div className="truncate text-[13px] font-semibold text-foreground">{t.label}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">{t.hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MotionGrid({ current, onChange }: { current: Motion; onChange: (m: Motion) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MOTIONS.map((m) => {
        const active = current === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className="tg-press flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition-colors"
            style={{
              borderColor: active
                ? "color-mix(in srgb, var(--primary) 65%, transparent)"
                : "var(--border)",
              background: active ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent",
              boxShadow: active ? "0 6px 20px -12px var(--primary)" : "none",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-semibold text-foreground">{m.label}</span>
              {active && (
                <span
                  className="ml-auto grid h-4 w-4 place-items-center rounded-full"
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="truncate text-[10px] leading-tight text-muted-foreground">{m.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

export const Route = createFileRoute("/_app/profile")({ component: ProfilePage });

function ProfilePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(true);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"settings" | "faq">("settings");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const { mode, theme, motion, setMode, setTheme, setMotion } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
      setEmailLoading(false);
    });
  }, []);

  async function updatePassword() {
    if (isOffline()) { toast.error(OFFLINE_MESSAGE); return; }
    if (!oldPassword) { toast.error("Введите текущий пароль"); return; }
    if (newPassword.length < 6) { toast.error("Новый пароль минимум 6 символов"); return; }
    if (oldPassword === newPassword) { toast.error("Новый пароль совпадает с текущим"); return; }
    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
      if (signErr) { toast.error("Неверный текущий пароль"); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setOldPassword("");
      setNewPassword("");
      setPasswordOpen(false);
      toast.success("Пароль обновлён");
    } catch (e: any) { toast.error(translateAuthError(e?.message)); }
    finally { setLoading(false); }
  }

  async function logout() {
    if (loggingOut) return;
    if (isOffline()) { toast.error(OFFLINE_MESSAGE); return; }
    setLoggingOut(true);
    try {
      sessionStorage.removeItem("ns_is_admin");
      await supabase.auth.signOut();
      setLogoutOpen(false);
      navigate({ to: "/auth" });
    } catch (e: any) {
      toast.error(translateAuthError(e?.message));
    } finally {
      setLoggingOut(false);
    }
  }

  async function confirmDeleteAccount() {
    if (isOffline()) { toast.error(OFFLINE_MESSAGE); return; }
    if (!confirmPassword) { toast.error("Введите пароль"); return; }
    setDeleting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !email) throw new Error("unauthorized");
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: confirmPassword });
      if (signErr) { toast.error("Неверный пароль"); return; }
      const { error } = await supabase.from("profiles").delete().eq("id", u.user.id);
      if (error) { toast.error(translateAuthError(error.message)); return; }
      sessionStorage.removeItem("ns_is_admin");
      await supabase.auth.signOut();
      setConfirmOpen(false);
      toast.success("Аккаунт удалён");
      navigate({ to: "/auth" });
    } catch (e: any) {
      toast.error(translateAuthError(e?.message));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
          {([
            { k: "settings", label: "Настройки", icon: SettingsIcon },
            { k: "faq", label: "FAQ", icon: HelpCircle },
          ] as const).map(({ k, label, icon: Icon }) => {
            const active = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`tg-press flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
                style={active ? { background: "var(--card-solid)", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" } : undefined}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            );
          })}
        </div>

        {tab === "faq" && (
          <div key="faq" className="ns-fade">
            <FaqList />
          </div>
        )}

        {tab === "settings" && (
          <div key="settings" className="ns-fade space-y-6">
            {/* Profile identity card */}
            <section
              className="relative overflow-hidden rounded-3xl p-5"
              style={{ background: "var(--gradient-surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-semibold"
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                >
                  {(email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Аккаунт</div>
                  <div className="mt-0.5 truncate text-[15px] font-semibold">
                    {emailLoading ? <span className="inline-block h-4 w-40 animate-pulse rounded-md bg-muted" /> : (email || "—")}
                  </div>
                </div>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
            </section>

            {/* Appearance group */}
            <SettingsGroup title="Внешний вид">
              <SettingsRow
                iconBg="linear-gradient(135deg,#0EA5E9,#6366F1)"
                icon={mode === "dark" ? Moon : Sun}
                label="Режим цвета"
                right={
                  <ModePill mode={mode} onChange={setMode} />
                }
              />
              <SettingsRow
                iconBg="var(--gradient-primary)"
                icon={Palette}
                label="Тема оформления"
                sub={THEMES.find((t) => t.id === theme)?.hint ?? ""}
              />
              <div className="px-3 pb-3 pt-1">
                <ThemeGrid current={theme} onChange={setTheme} />
              </div>
              <SettingsRow
                iconBg="linear-gradient(135deg,#22D3EE,#7C6BFF)"
                icon={Zap}
                label="Анимации"
                sub={MOTIONS.find((m) => m.id === motion)?.hint ?? ""}
              />
              <div className="px-3 pb-3 pt-1">
                <MotionGrid current={motion} onChange={setMotion} />
              </div>
            </SettingsGroup>

            {/* Security group */}
            <SettingsGroup title="Безопасность">
              <SettingsRow
                iconBg="linear-gradient(135deg,#F59E0B,#EF4444)"
                icon={KeyRound}
                label="Сменить пароль"
                onClick={() => setPasswordOpen(true)}
                right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
              />
              <SettingsRow
                iconBg="linear-gradient(135deg,#64748B,#334155)"
                icon={LogOut}
                label="Выйти из аккаунта"
                onClick={() => setLogoutOpen(true)}
                right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
              />
            </SettingsGroup>

            {/* Danger zone */}
            <SettingsGroup title="Опасная зона" tone="danger">
              <SettingsRow
                iconBg="linear-gradient(135deg,#F43F5E,#B91C1C)"
                icon={Trash2}
                label="Удалить аккаунт"
                sub="Все данные и конфигурации будут удалены навсегда"
                onClick={() => { setConfirmPassword(""); setConfirmOpen(true); }}
                labelClassName="text-destructive"
                right={<ChevronRight className="h-4 w-4 text-destructive/70" />}
              />
            </SettingsGroup>
          </div>
        )}
      </div>

      {passwordOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={() => !loading && setPasswordOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[340px] rounded-2xl border border-border p-5"
            style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-[16px] font-semibold">
                <KeyRound className="h-4 w-4 text-primary" /> Сменить пароль
              </div>
              <button onClick={() => setPasswordOpen(false)} disabled={loading}
                className="tg-press -m-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground" aria-label="Закрыть">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Текущий пароль" autoComplete="current-password"
              className="mt-1 h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Новый пароль (минимум 6 символов)" minLength={6} autoComplete="new-password"
              className="mt-2 h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
            <button onClick={updatePassword} disabled={loading} className="tg-btn mt-3 w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить пароль"}
            </button>
          </div>
        </div>
      )}

      {logoutOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={() => !loggingOut && setLogoutOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] rounded-2xl border border-border p-5"
            style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
          >
            <div className="mb-3 flex items-start gap-3">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: "linear-gradient(135deg,#64748B,#334155)" }}
              >
                <LogOut className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-[16px] font-semibold text-foreground">Выйти из аккаунта?</div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Вы уверены, что хотите выйти? Придётся снова войти по email и паролю.
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setLogoutOpen(false)}
                disabled={loggingOut}
                className="tg-btn-ghost flex-1"
              >
                Остаться
              </button>
              <button
                onClick={logout}
                disabled={loggingOut}
                className="tg-press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Выйти"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={() => !deleting && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] rounded-2xl border border-border p-5"
            style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="text-[16px] font-semibold text-destructive">Удалить аккаунт?</div>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="tg-press -m-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[13px] leading-snug text-muted-foreground">
              Действие необратимо. Все ваши данные и конфигурации будут удалены. Для подтверждения введите текущий пароль.
            </p>
            <input
              type="password"
              autoComplete="current-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Текущий пароль"
              className="mt-3 h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="tg-btn-ghost flex-1"
              >
                Отмена
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={deleting || !confirmPassword}
                className="tg-btn-danger flex-1"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
