import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Loader2, LogOut, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { alertDialog as toast } from "@/lib/alert";

export const Route = createFileRoute("/blocked")({
  ssr: false,
  component: BlockedPage,
});

type Profile = { is_blocked: boolean; blocked_until: string | null; blocked_reason: string | null };
type AmnestyRow = {
  id: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function translateSubmitError(msg: string): string {
  if (msg.includes("message_too_short")) return "Сообщение слишком короткое (мин. 5 символов)";
  if (msg.includes("already_pending")) return "Заявка уже отправлена — дождитесь ответа";
  if (msg.includes("not_blocked")) return "Ваш аккаунт не заблокирован";
  if (msg.includes("unauthorized")) return "Требуется вход";
  return "Не удалось отправить заявку";
}

function BlockedPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [amnesty, setAmnesty] = useState<AmnestyRow | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { navigate({ to: "/auth", replace: true }); return; }
        if (cancelled) return;
        setEmail(u.user.email ?? null);
        const [{ data: p }, { data: a }] = await Promise.all([
          supabase.from("profiles").select("is_blocked, blocked_until, blocked_reason").eq("id", u.user.id).maybeSingle(),
          supabase.from("amnesty_requests").select("id, message, status, admin_reply, created_at, reviewed_at").eq("user_id", u.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (cancelled) return;
        if (!p) { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); return; }
        const until = p.blocked_until ? new Date(p.blocked_until) : null;
        if (!p.is_blocked || (until && until.getTime() <= Date.now())) {
          navigate({ to: "/vpn", replace: true }); return;
        }
        setProfile(p as Profile);
        setAmnesty((a as AmnestyRow) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const uid = u.user.id;
      ch = supabase
        .channel(`blocked_${uid}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, (payload) => {
          const p = payload.new as Profile;
          setProfile(p);
          const until = p.blocked_until ? new Date(p.blocked_until) : null;
          if (!p.is_blocked || (until && until.getTime() <= Date.now())) {
            toast.success("Блокировка снята", "Добро пожаловать обратно");
            navigate({ to: "/vpn", replace: true });
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "amnesty_requests", filter: `user_id=eq.${uid}` }, () => {
          supabase.from("amnesty_requests").select("id, message, status, admin_reply, created_at, reviewed_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setAmnesty((data as AmnestyRow) ?? null));
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (ch) supabase.removeChannel(ch); };
  }, [navigate]);

  async function submitAmnesty() {
    if (message.trim().length < 5) {
      toast.error("Сообщение слишком короткое");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_amnesty", { _message: message.trim() });
      if (error) throw error;
      setMessage("");
      toast.success("Заявка отправлена", "Администрация рассмотрит её как можно скорее.");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      toast.error(translateSubmitError(m));
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    try { sessionStorage.clear(); localStorage.removeItem("ns_offline_my_vpn_v1"); } catch {}
    navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="fixed inset-0 grid place-items-center" style={{ background: "var(--pwa-background)" }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!profile) return null;

  const until = profile.blocked_until ? new Date(profile.blocked_until) : null;
  const untilText = until
    ? `до ${until.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`
    : "бессрочно";

  const canSubmit = !amnesty || amnesty.status !== "pending";

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col items-center overflow-y-auto px-5 py-8"
      style={{ background: "var(--pwa-background)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "hsl(0 80% 55% / 0.35)" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div
          className="rounded-3xl border p-6"
          style={{
            background: "var(--card-solid)",
            borderColor: "color-mix(in srgb, var(--border) 70%, transparent)",
            boxShadow: "var(--shadow-elegant)",
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "hsl(0 75% 55%)", boxShadow: "var(--shadow-elegant)" }}>
              <ShieldAlert className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Ваш аккаунт заблокирован
            </h1>
            <p className="text-[13px] text-muted-foreground">{email}</p>
          </div>

          <div className="mt-5 space-y-2 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--muted) 40%, transparent)" }}>
            <Row label="Срок" value={untilText} />
            {profile.blocked_reason && <Row label="Причина" value={profile.blocked_reason} />}
          </div>

          <div className="mt-5">
            <h2 className="text-[15px] font-semibold text-foreground">Подать амнистию</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Опишите ситуацию — администратор рассмотрит заявку и может снять блокировку.
            </p>

            {amnesty && (
              <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--muted) 30%, transparent)" }}>
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  {amnesty.status === "pending" && <><Clock className="h-4 w-4 text-amber-500" /> На рассмотрении</>}
                  {amnesty.status === "approved" && <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Одобрено</>}
                  {amnesty.status === "rejected" && <><XCircle className="h-4 w-4 text-red-500" /> Отклонено</>}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground line-clamp-3">{amnesty.message}</p>
                {amnesty.admin_reply && (
                  <p className="mt-2 text-[12px] text-foreground">
                    <span className="text-muted-foreground">Ответ администратора:</span> {amnesty.admin_reply}
                  </p>
                )}
              </div>
            )}

            {canSubmit && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="Ваше сообщение администратору…"
                  className="w-full resize-none rounded-xl border bg-transparent p-3 text-[14px] text-foreground outline-none focus:border-primary/60"
                  style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--input) 92%, transparent)" }}
                />
                <button
                  onClick={submitAmnesty}
                  disabled={submitting || message.trim().length < 5}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
                  style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Подать амнистию
                </button>
              </div>
            )}
          </div>

          <button
            onClick={signOut}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-medium text-muted-foreground hover:text-foreground"
            style={{ borderColor: "var(--border)" }}
          >
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right text-foreground">{value}</span>
    </div>
  );
}