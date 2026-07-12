import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError, isOffline, OFFLINE_MESSAGE } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import {
  LogOut, Trash2, KeyRound, Loader2, Mail, HelpCircle,
  X, ChevronRight, Check, Send, BadgeCheck, FileText, ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

function SettingsCard({
  title, children,
}: { title: string; children: ReactNode }) {
  return (
    <section
      className="overflow-hidden rounded-3xl border p-4"
      style={{
        background: "var(--card-solid)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h2 className="mb-3 px-1 text-[15px] font-semibold text-foreground">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  sub,
  right,
  onClick,
  labelClassName,
}: {
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
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
      className={`tg-press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors ${onClick ? "hover:bg-muted/40" : ""}`}
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: iconBg ?? "color-mix(in srgb, var(--primary) 18%, transparent)" }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: iconColor ?? "var(--accent)" }} />
      </div>
      <div className="min-w-0 flex-1">
        {sub && <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{sub}</div>}
        <div className={`truncate text-[15px] font-medium ${labelClassName ?? "text-foreground"}`}>{label}</div>
      </div>
      {right}
    </Tag>
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
      <div className="space-y-4 pb-4">
        <SettingsCard title="Аккаунт">
          <Row
            icon={Mail}
            label={emailLoading ? "…" : (email || "—")}
            sub="Email"
          />
          <Row
            icon={KeyRound}
            label="Сменить пароль"
            onClick={() => setPasswordOpen(true)}
            right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
          />
        </SettingsCard>

        <SettingsCard title="Способы входа">
          <Row
            icon={Mail}
            label={email || "—"}
            sub="Email"
            right={
              <span
                className="grid h-6 w-6 place-items-center rounded-full"
                style={{ background: "#22C55E" }}
                aria-label="Подтверждён"
              >
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
              </span>
            }
          />
          <Row
            icon={Send}
            iconBg="color-mix(in srgb, #38BDF8 22%, transparent)"
            iconColor="#38BDF8"
            label="Не привязан"
            sub="Telegram"
            right={
              <span className="text-[13px] font-semibold text-accent opacity-60">
                Скоро
              </span>
            }
          />
        </SettingsCard>

        <SettingsCard title="Информация">
          <Row
            icon={FileText}
            label="Частые вопросы"
            onClick={() => navigate({ to: "/faq" })}
            right={<ExternalLink className="h-4 w-4 text-muted-foreground" />}
          />
          <Row
            icon={HelpCircle}
            label="Поддержка"
            onClick={() => navigate({ to: "/support" })}
            right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
          />
          <Row
            icon={BadgeCheck}
            label="VPNSUS"
            sub="О приложении"
            right={<span className="text-[12px] text-muted-foreground">v1.0</span>}
          />
        </SettingsCard>

        <button
          onClick={() => setLogoutOpen(true)}
          className="tg-press flex w-full items-center justify-center gap-2 rounded-2xl border py-4 text-[15px] font-semibold text-destructive"
          style={{
            background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
            borderColor: "color-mix(in srgb, var(--destructive) 40%, transparent)",
          }}
        >
          <LogOut className="h-5 w-5" /> Выйти
        </button>

        <button
          onClick={() => { setConfirmPassword(""); setConfirmOpen(true); }}
          className="tg-press flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-medium text-destructive/80"
        >
          <Trash2 className="h-4 w-4" /> Удалить аккаунт
        </button>
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
