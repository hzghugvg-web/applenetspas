import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Loader2, Send, X } from "lucide-react";
import { startTelegramLogin, pollTelegramLogin } from "@/lib/telegram-auth.functions";
import { alertDialog as toast } from "@/lib/alert";

export function TelegramLoginPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const start = useServerFn(startTelegramLogin);
  const poll = useServerFn(pollTelegramLogin);
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    "pending" | "confirmed" | "consumed" | "ready" | "expired" | "rejected"
  >("pending");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    redirectedRef.current = false;
    setLoading(true);
    setStatus("pending");
    setErrMsg(null);
    start({})
      .then((r) => {
        setCode(r.code);
        setDeepLink(r.deepLink);
      })
      .catch((e) => toast.error(e?.message ?? "Ошибка"))
      .finally(() => setLoading(false));
  }, [open, start]);

  useEffect(() => {
    if (!open || !code) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const r = await poll({ data: { code } });
        if (cancelled) return;
        setStatus(r.status);
        if (r.status === "ready" && "actionLink" in r && r.actionLink && !redirectedRef.current) {
          redirectedRef.current = true;
          window.clearInterval(interval);
          // Magic-link URL — Supabase handles session and redirects to /vpn
          window.location.href = r.actionLink;
        } else if (r.status === "expired") {
          window.clearInterval(interval);
        } else if (r.status === "rejected") {
          window.clearInterval(interval);
          setErrMsg("error" in r ? (r.error ?? null) : null);
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, code, poll]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-2xl border border-border p-5"
        style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[16px] font-semibold">
            <Send className="h-4 w-4" style={{ color: "#38BDF8" }} /> Вход через Telegram
          </div>
          <button
            onClick={onClose}
            className="tg-press -m-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading || !code ? (
          <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-[13px]">Создаём код…</p>
          </div>
        ) : status === "ready" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-[14px] text-foreground">Входим в аккаунт…</p>
          </div>
        ) : status === "expired" ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-[14px] text-destructive">Код истёк.</p>
            <button onClick={onClose} className="tg-btn-ghost w-full">
              Закрыть
            </button>
          </div>
        ) : status === "rejected" ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-[14px] text-destructive">
              {errMsg === "not_linked"
                ? "Этот Telegram не привязан к аккаунту VPNSUS. Сначала войдите по email и привяжите Telegram в настройках."
                : "Не удалось войти через Telegram."}
            </p>
            <button onClick={onClose} className="tg-btn-ghost w-full">
              Закрыть
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-snug text-muted-foreground">
              Откройте бота и нажмите «Start» — вход произойдёт автоматически. Либо отправьте боту код вручную:
            </p>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-input px-3 py-2">
              <div className="font-mono text-[22px] tracking-[0.35em] text-foreground">{code}</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(code).catch(() => {});
                  toast.success("Код скопирован");
                }}
                className="tg-press grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Скопировать"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <a
              href={deepLink ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-primary-foreground"
              style={{ background: "linear-gradient(135deg,#38BDF8,#0EA5E9)" }}
            >
              <Send className="h-4 w-4" /> Открыть бота
              <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </a>
            <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Ждём подтверждения…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}