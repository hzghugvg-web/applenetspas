import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Loader2, Send, X, Check } from "lucide-react";
import { startLinkTelegram, pollLinkTelegram } from "@/lib/telegram-auth.functions";
import { alertDialog as toast } from "@/lib/alert";

export function TelegramLinkModal({
  open,
  onClose,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  onLinked: (username: string | null) => void;
}) {
  const start = useServerFn(startLinkTelegram);
  const poll = useServerFn(pollLinkTelegram);
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"pending" | "confirmed" | "expired" | "rejected">("pending");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStatus("pending");
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
        if (r.status === "confirmed") {
          window.clearInterval(interval);
          onLinked(r.telegramUsername);
        } else if (r.status === "expired" || r.status === "rejected") {
          window.clearInterval(interval);
        }
      } catch {
        // swallow — will retry
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, code, poll, onLinked]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-2xl border border-border p-5"
        style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[16px] font-semibold">
            <Send className="h-4 w-4" style={{ color: "#38BDF8" }} /> Привязать Telegram
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
        ) : status === "confirmed" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500">
              <Check className="h-6 w-6 text-white" strokeWidth={3} />
            </span>
            <p className="text-[15px] font-semibold text-foreground">Telegram привязан</p>
            <button onClick={onClose} className="tg-btn mt-1">
              Готово
            </button>
          </div>
        ) : status === "expired" || status === "rejected" ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-[14px] text-destructive">
              {status === "expired" ? "Код истёк. Запросите новый." : "Не удалось привязать. Попробуйте ещё раз."}
            </p>
            <button onClick={onClose} className="tg-btn-ghost w-full">
              Закрыть
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-snug text-muted-foreground">
              Откройте бота и нажмите «Start» — привязка произойдёт автоматически. Либо отправьте боту код:
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
              <Loader2 className="h-3 w-3 animate-spin" /> Ждём подтверждения от Telegram…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}