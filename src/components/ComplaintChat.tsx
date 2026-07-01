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
  const endRef = useRef<HTMLDivElement>(null);

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
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [complaintId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs.length]);

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
      ? await supabase.rpc("admin_update_complaint", { _id: complaintId, _status: "resolved", _reply: null })
      : await supabase.rpc("close_own_complaint", { _id: complaintId });
    setClosing(false);
    if (error) toast.error(translateAuthError(error.message));
    else {
      toast.success("Обращение завершено");
      onClosed?.();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[52vh] min-h-[120px] space-y-1.5 overflow-y-auto rounded-xl bg-[#0F171F] p-2">
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
                  {!mine && (
                    <p className="mb-0.5 text-[10px] font-medium opacity-70">
                      {m.is_admin ? "Поддержка" : "Пользователь"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {closed ? (
        <div className="rounded-xl bg-emerald-500/10 py-2 text-center text-[12px] text-emerald-400">
          Обращение завершено
        </div>
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