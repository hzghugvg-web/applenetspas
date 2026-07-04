import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Broadcast = { id: string; message: string; title: string | null; created_at: string };

// Module-level cache keeps the banner state alive across route unmounts,
// so switching tabs doesn't flash the banner away.
let cachedUnread: Broadcast[] = [];
const listeners = new Set<(v: Broadcast[]) => void>();
function setCache(next: Broadcast[]) {
  cachedUnread = next;
  listeners.forEach((l) => l(next));
}

let reloadImpl: (() => void) | null = null;
export function reloadBroadcasts() {
  reloadImpl?.();
}

export function BroadcastBanner() {
  const [unread, setUnread] = useState<Broadcast[]>(cachedUnread);
  const [dismissing, setDismissing] = useState<string | null>(null);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) { setCache([]); return; }
    const { data: bs } = await (supabase as any)
      .from("broadcasts")
      .select("id,message,title,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!bs?.length) { setCache([]); return; }
    const { data: reads } = await (supabase as any)
      .from("broadcast_reads")
      .select("broadcast_id")
      .eq("user_id", user.id);
    const readIds = new Set((reads ?? []).map((r: any) => r.broadcast_id));
    setCache((bs as Broadcast[]).filter((b) => !readIds.has(b.id)));
  }

  useEffect(() => {
    listeners.add(setUnread);
    reloadImpl = load;
    load();
    const ch = supabase
      .channel("broadcasts_channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts" }, () => load())
      .subscribe();
    const t = setInterval(load, 30_000);
    return () => {
      listeners.delete(setUnread);
      if (reloadImpl === load) reloadImpl = null;
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, []);

  async function ack(b: Broadcast) {
    setDismissing(b.id);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;
    await (supabase as any).from("broadcast_reads").insert({ broadcast_id: b.id, user_id: user.id });
    setTimeout(() => {
      setCache(cachedUnread.filter((x) => x.id !== b.id));
      setDismissing(null);
    }, 220);
  }

  const current = unread[0];

  // Render message with clickable URLs
  function renderMessage(text: string) {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((p, i) =>
      /^https?:\/\//.test(p) ? (
        <a
          key={i}
          href={p}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
          style={{ color: "hsl(var(--primary))" }}
        >
          {p}
        </a>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }

  return (
    <AnimatePresence mode="wait">
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: dismissing === current.id ? 0 : 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="mx-2 mt-2 overflow-hidden"
        >
          <div
            className="flex items-start gap-3 rounded-2xl p-3 glass"
            style={{ boxShadow: "var(--shadow-elegant)" }}
          >
            <div
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Megaphone className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {current.title?.trim() || "Сообщение от администратора"}
              </div>
              <div className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-snug text-foreground">
                {renderMessage(current.message)}
              </div>
            </div>
            <button
              onClick={() => ack(current)}
              className="tg-press grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
              aria-label="Прочитал"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
          {unread.length > 1 && (
            <div className="mt-1 text-center text-[10px] text-muted-foreground">
              Ещё {unread.length - 1} {unread.length - 1 === 1 ? "сообщение" : "сообщений"}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}