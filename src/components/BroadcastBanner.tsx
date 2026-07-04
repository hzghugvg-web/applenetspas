import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Copy, BookOpen, Globe, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { alertDialog } from "@/lib/alert";

type Broadcast = {
  id: string;
  message: string;
  title: string | null;
  link: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
};

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
  const [opened, setOpened] = useState<Broadcast | null>(null);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) { setCache([]); return; }
    const { data: bs } = await (supabase as any)
      .from("broadcasts")
      .select("id,message,title,link,email,website,created_at")
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

  async function copyLinkValue(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      alertDialog.success(
        "Ссылка успешно скопирована",
        "Вставьте её в браузер. Если это конфиг — вставьте в клиент (Happ, V2rayTun и т.д.)",
      );
    } catch {
      alertDialog.error("Не удалось скопировать");
    }
  }

  async function copyWebsite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      alertDialog.success(
        "Сайт успешно скопирован!",
        "Откройте браузер, вставьте адрес и переходите на сайт.",
      );
    } catch {
      alertDialog.error("Не удалось скопировать");
    }
  }

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
          className="text-primary underline break-all"
        >
          {p}
        </a>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }

  return (
    <>
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
            <button
              onClick={() => setOpened(current)}
              className="tg-press flex w-full items-center gap-3 rounded-2xl p-3 glass text-left"
              style={{ boxShadow: "var(--shadow-elegant)" }}
            >
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Megaphone className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Рекомендуем прочитать
                </div>
                <div className="truncate text-[13px] font-medium text-foreground">
                  {current.title?.trim() || "Сообщение от администратора"}
                </div>
              </div>
              <span
                className="shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                Прочитать
              </span>
            </button>
            {unread.length > 1 && (
              <div className="mt-1 text-center text-[10px] text-muted-foreground">
                Ещё {unread.length - 1} {unread.length - 1 === 1 ? "сообщение" : "сообщений"}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {opened && (
          <motion.div
            key="bcast-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpened(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="flex max-h-[80vh] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-card-solid shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <div className="text-[13px] font-semibold text-primary">
                  {opened.title?.trim() || "Сообщение от администратора"}
                </div>
              </div>
              <div className="ns-scroll flex-1 overflow-y-auto px-5 pb-3">
                <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground">
                  {renderMessage(opened.message)}
                </div>
                {opened.link && (
                  <button
                    onClick={() => copyLinkValue(opened.link!)}
                    className="tg-press mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium"
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    <Copy className="h-4 w-4" /> Копировать ссылку
                  </button>
                )}
                {opened.website && (
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <a
                      href={/^https?:\/\//.test(opened.website) ? opened.website : `https://${opened.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tg-press flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium"
                      style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                    >
                      <Globe className="h-4 w-4" /> Открыть сайт
                    </a>
                    <button
                      onClick={() => copyWebsite(opened.website!)}
                      className="tg-press flex items-center justify-center rounded-xl border border-border bg-muted px-3 text-[13px] font-medium text-foreground"
                      aria-label="Копировать сайт"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {opened.email && (
                  <a
                    href={`mailto:${opened.email}`}
                    className="tg-press mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5 text-[13px] font-medium text-foreground"
                  >
                    <Mail className="h-4 w-4" /> Написать · {opened.email}
                  </a>
                )}
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex">
                <button
                  onClick={() => setOpened(null)}
                  className="h-11 flex-1 border-r border-border text-[15px] font-medium text-muted-foreground tg-press"
                >
                  Закрыть
                </button>
                <button
                  onClick={() => {
                    const b = opened;
                    setOpened(null);
                    ack(b);
                  }}
                  className="h-11 flex-1 text-[15px] font-semibold text-primary tg-press"
                >
                  Прочитано
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}