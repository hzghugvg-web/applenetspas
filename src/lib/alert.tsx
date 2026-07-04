import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type AlertKind = "success" | "error" | "info";
type AlertPayload = {
  id: number;
  kind: AlertKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

let listeners: Array<(p: AlertPayload) => void> = [];
let counter = 0;

function emit(
  kind: AlertKind,
  title: string,
  message?: string,
  opts?: { actionLabel?: string; onAction?: () => void },
) {
  const p: AlertPayload = { id: ++counter, kind, title, message, ...opts };
  listeners.forEach((l) => l(p));
}

export const alertDialog = {
  success: (title: string, message?: string, opts?: { actionLabel?: string; onAction?: () => void }) =>
    emit("success", title, message, opts),
  error: (title: string, message?: string, opts?: { actionLabel?: string; onAction?: () => void }) =>
    emit("error", title, message, opts),
  info: (title: string, message?: string, opts?: { actionLabel?: string; onAction?: () => void }) =>
    emit("info", title, message, opts),
};

export function AlertHost() {
  const [queue, setQueue] = useState<AlertPayload[]>([]);

  useEffect(() => {
    const l = (p: AlertPayload) => setQueue((q) => [...q, p]);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  const current = queue[0];
  const close = () => setQueue((q) => q.slice(1));

  const accent =
    current?.kind === "error"
      ? "text-red-400"
      : current?.kind === "success"
      ? "text-emerald-400"
      : "text-primary";

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-8"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-[280px] overflow-hidden rounded-2xl border border-border bg-card-solid shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-3 text-center">
              <div className={`text-[17px] font-semibold ${accent}`}>{current.title}</div>
              {current.message && (
                <div className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  {current.message}
                </div>
              )}
            </div>
            <div className="h-px w-full bg-border" />
            {current.actionLabel && current.onAction ? (
              <div className="flex">
                <button
                  onClick={close}
                  className="h-11 flex-1 border-r border-border text-[15px] font-medium text-muted-foreground tg-press"
                >
                  Позже
                </button>
                <button
                  onClick={() => { current.onAction?.(); close(); }}
                  className="h-11 flex-1 text-[15px] font-semibold text-primary tg-press"
                >
                  {current.actionLabel}
                </button>
              </div>
            ) : (
              <button
                onClick={close}
                className="h-11 w-full text-[17px] font-medium text-primary tg-press"
              >
                ОК
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}