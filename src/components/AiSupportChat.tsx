import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Loader2, X, Sparkles, Headphones, CheckCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { askSupportAI } from "@/lib/support-ai.functions";
import { alertDialog as toast } from "@/lib/alert";
import { translateAuthError } from "@/lib/errors";

type Msg = { id: string; role: "user" | "assistant" | "system-note"; content: string };

const GREETING =
  "Привет! Я ИИ-помощник NetSpas. Спросите про подключение, кулдаун, подписку — постараюсь ответить сразу. Если не смогу, передам оператору.";

export function AiSupportChat({
  open,
  onClose,
  onEscalated,
}: {
  open: boolean;
  onClose: () => void;
  onEscalated: () => void;
}) {
  const ask = useServerFn(askSupportAI);
  const [messages, setMessages] = useState<Msg[]>([
    { id: "g", role: "assistant", content: GREETING },
  ]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [confirmingEscalate, setConfirmingEscalate] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [creating, setCreating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([{ id: "g", role: "assistant", content: GREETING }]);
      setText("");
      setConfirmingEscalate(false);
      setEscalated(false);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, thinking, confirmingEscalate, escalated]);

  async function send() {
    const body = text.trim();
    if (!body || thinking || escalated) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: body };
    const next = [...messages, userMsg];
    setMessages(next);
    setText("");
    setThinking(true);
    try {
      const history = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-16)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const res = await ask({ data: { messages: history } });
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: res.text },
      ]);
      if (res.escalate) setConfirmingEscalate(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Не удалось получить ответ. Хотите, чтобы я передал вопрос оператору?",
        },
      ]);
      setConfirmingEscalate(true);
    } finally {
      setThinking(false);
    }
  }

  async function escalate() {
    if (creating) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      toast.error("Опишите вопрос — потом передам оператору");
      setConfirmingEscalate(false);
      return;
    }
    setCreating(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("unauthorized");
      const transcript = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => `${m.role === "user" ? "Пользователь" : "ИИ"}: ${m.content}`)
        .join("\n\n");
      const description =
        `Обращение из чата с ИИ.\n\nВопрос: ${lastUser.content}\n\n— История —\n${transcript}`.slice(
          0,
          2000,
        );
      const { error } = await supabase.from("complaints").insert({
        user_id: u.user.id,
        description,
        video_url: null,
        status: "new",
        category: "question",
        phone: null,
      });
      if (error) throw error;
      setEscalated(true);
      setConfirmingEscalate(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system-note",
          content:
            "Ваше обращение передано оператору. Пожалуйста, подождите — обычно ответ приходит в течение 5–15 минут. Диалог с оператором появится в разделе «Мои обращения».",
        },
      ]);
      onEscalated();
    } catch (e: any) {
      toast.error(translateAuthError(e?.message ?? "Не удалось создать обращение"));
    } finally {
      setCreating(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 top-0 z-[70] bg-background"
          style={{ height: "100dvh" }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
            className="flex h-full w-full flex-col"
          >
            <header className="safe-top tg-blur flex shrink-0 items-center gap-3 border-b border-border px-3 pb-2 pt-3">
              <button
                onClick={onClose}
                className="tg-press grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  ИИ-помощник
                </p>
                <p className="truncate text-[11px] text-muted-foreground">Быстрые ответы 24/7</p>
              </div>
            </header>

            <div
              className="ns-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.7 }}
                    className={
                      m.role === "user"
                        ? "flex justify-end"
                        : m.role === "system-note"
                          ? "flex justify-center"
                          : "flex justify-start"
                    }
                  >
                    {m.role === "system-note" ? (
                      <div className="max-w-[92%] rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-[12px] text-emerald-300">
                        <CheckCircle2 className="mr-1 -mt-0.5 inline h-3.5 w-3.5" />
                        {m.content}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
                          m.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border bg-card text-foreground"
                        }`}
                      >
                        {m.role === "assistant" && (
                          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-primary">
                            <Sparkles className="h-2.5 w-2.5" /> ИИ
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                  </div>
                </div>
              )}

              {confirmingEscalate && !escalated && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-[13px]"
                >
                  <p className="mb-2 font-medium text-foreground">Передать вопрос оператору?</p>
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Оператор ответит вам обычно в течение нескольких минут — в разделе «Мои обращения».
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingEscalate(false)}
                      disabled={creating}
                      className="tg-press flex-1 rounded-xl border border-border bg-transparent py-2 text-[13px] font-medium text-muted-foreground"
                    >
                      Не надо
                    </button>
                    <button
                      onClick={escalate}
                      disabled={creating}
                      className="tg-press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Headphones className="h-3.5 w-3.5" />}
                      Передать
                    </button>
                  </div>
                </motion.div>
              )}

              <div ref={endRef} />
            </div>

            <div
              className="shrink-0 border-t border-border bg-background p-3"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {escalated ? (
                <button
                  onClick={onClose}
                  className="tg-press flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-medium text-primary-foreground"
                >
                  Перейти к моим обращениям
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder="Спросите ИИ…"
                      className="max-h-28 min-h-[40px] flex-1 resize-none rounded-full border border-border bg-input px-4 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
                    />
                    <button
                      onClick={send}
                      disabled={thinking || !text.trim()}
                      className="tg-press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    onClick={() => setConfirmingEscalate(true)}
                    className="tg-press mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent py-2 text-[12.5px] font-medium text-muted-foreground"
                  >
                    <Headphones className="h-3.5 w-3.5" /> Позвать оператора
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}