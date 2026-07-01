import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { alertDialog as toast } from "@/lib/alert";
import { translateAuthError } from "@/lib/errors";

type Msg = {
  id: string;
  complaint_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
};

interface Props {
  complaintId: string;
  asAdmin: boolean;
  closed: boolean;
  onClosed?: () => void;
}

export function ComplaintChat({ complaintId, asAdmin, closed, onClosed }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [localClosed, setLocalClosed] = useState(closed);
  const endRef = useRef<HTMLDivElement>(null);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => setLocalClosed(closed), [closed]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (alive) setMe(u.user?.id ?? null);
      const { data } = await supabase
        .from("complaint_messages")
        .select("*")
        .eq("complaint_id", complaintId)
        .order("created_at", { ascending: true });
      if (alive) setMsgs((data ?? []) as Msg[]);
    })();
    const ch = supabase
      .channel(`complaint:${complaintId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "complaint_messages", filter: `complaint_id=eq.${complaintId}` },
        (payload) => {
          setMsgs((prev) =>
            prev.some((m) => m.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "complaints", filter: `id=eq.${complaintId}` },
        (payload) => {
          const st = (payload.new as { status?: string }).status;
          if (st === "resolved" || st === "rejected") {
            setLocalClosed(true);
            onClosed?.();
          }
        },
      )
      .on("broadcast", { event: "typing" }, (msg) => {
        const from = (msg.payload as { from?: string })?.from;
        if (from && from !== (asAdmin ? "admin" : "user")) {
          setPeerTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setPeerTyping(false), 2500);
        }
      })
      .subscribe();
    chanRef.current = ch;
    return () => {
      alive = false;
      supabase.removeChannel(ch);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [complaintId, asAdmin, onClosed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs.length, peerTyping]);

  function emitTyping() {
    const now = Date.now();
    if (now - lastSentRef.current < 1200) return;
    lastSentRef.current = now;
    chanRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: asAdmin ? "admin" : "user" },
    });
  }

  async function send() {
    const body = text.trim();
    if (!body || !me) return;
    setSending(true);
    const { error } = await supabase.from("complaint_messages").insert({
      complaint_id: complaintId,
      sender_id: me,
      is_admin: asAdmin,
      body,
    });
    setSending(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    setText("");
  }

  async function closeComplaint() {
    setClosing(true);
    const { error } = asAdmin
      ? await supabase.rpc("admin_update_complaint", { _id: complaintId, _status: "resolved", _reply: "" })
      : await supabase.rpc("close_own_complaint", { _id: complaintId });
    setClosing(false);
    if (error) toast.error(translateAuthError(error.message));
    else {
      setLocalClosed(true);
      toast.success("Обращение завершено");
      onClosed?.();
    }
  }

  function fmt(iso: string) {
    const d = new Date(iso);
    const date = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return `${date} · ${time}`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="ns-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-xl bg-[#0F171F] p-2">
        {msgs.length === 0 && (
          <p className="py-4 text-center text-[12px] text-muted-foreground">Сообщений пока нет</p>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m) => {
            const mine = m.sender_id === me;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18 }}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-[14px] ${
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-[#1C2C3C] text-foreground"
                  }`}
                >
                  <p
                    className={`mb-0.5 text-[10px] font-semibold ${
                      mine ? "text-primary-foreground/80" : "text-primary"
                    }`}
                  >
                    {mine ? "Я" : m.is_admin ? "Оператор" : "Пользователь"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {fmt(m.created_at)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {peerTyping && !localClosed && (
        <div className="px-1 text-[11px] italic text-muted-foreground">
          {asAdmin ? "Пользователь печатает…" : "Оператор печатает…"}
        </div>
      )}

      {localClosed ? (
        <div className="rounded-xl bg-emerald-500/10 py-2 text-center text-[12px] text-emerald-400">
          Обращение завершено
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) emitTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Сообщение…"
              className="max-h-24 min-h-[38px] flex-1 resize-none rounded-full border border-border bg-[#1C2C3C] px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="tg-press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={closeComplaint}
            disabled={closing}
            className="tg-press flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600/90 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Завершить обращение
          </button>
        </>
      )}
    </div>
  );
}

// Fullscreen modal wrapper for the chat.
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function ComplaintChatModal({
  open,
  onClose,
  title,
  subtitle,
  beforeChat,
  ...props
}: Props & {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  beforeChat?: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 top-0 z-[60] bg-background"
          style={{ height: "100dvh" }}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full w-full flex-col"
          >
            <header
              className="safe-top tg-blur flex shrink-0 items-center gap-3 border-b border-border px-3 pb-2"
            >
              <button
                onClick={onClose}
                className="tg-press grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
                {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
              </div>
            </header>
            <div
              className="flex min-h-0 flex-1 flex-col p-3"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {beforeChat && <div className="mb-2 shrink-0">{beforeChat}</div>}
              <ComplaintChat {...props} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}