import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Copy, Mail, Sparkles, X, Globe, ChevronRight } from "lucide-react";
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
  delivery_style: "top" | "imessage";
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
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) { setCache([]); return; }
    const { data: bs } = await (supabase as any)
      .from("broadcasts")
      .select("id,message,title,link,email,website,created_at,delivery_style")
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

  const topOnes = unread.filter((b) => (b.delivery_style ?? "imessage") === "top");
  const imessageOnes = unread.filter((b) => (b.delivery_style ?? "imessage") === "imessage");
  const current = topOnes[0];

  // Auto-open first iMessage-style broadcast as a centered modal.
  useEffect(() => {
    if (opened) return;
    const next = imessageOnes.find((b) => !seenIds.has(b.id));
    if (next) {
      setOpened(next);
      setSeenIds((prev) => {
        const s = new Set(prev);
        s.add(next.id);
        return s;
      });
    }
  }, [imessageOnes, opened, seenIds]);

  async function copyLinkValue(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      alertDialog.success(
        "Ссылка успешно скопирована",
        "Вставьте её в браузер.",
      );
    } catch {
      alertDialog.error("Не удалось скопировать");
    }
  }

  async function copyWebsite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      alertDialog.success(
        "Сайт успешно скопирован",
        "Вставьте её в браузер.",
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
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="mx-2 mt-2 overflow-hidden"
          >
            <button
              onClick={() => setOpened(current)}
              className="tg-press relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-3 text-left"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/20 blur-2xl" />
              <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20 backdrop-blur">
                <Megaphone className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="relative min-w-0 flex-1 text-white">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                  Новое сообщение
                </div>
                <div className="truncate text-[13.5px] font-semibold">
                  {current.title?.trim() || "Сообщение от администратора"}
                </div>
              </div>
              <ChevronRight className="relative h-4 w-4 shrink-0 text-white/90" />
            </button>
            {unread.length > 1 && (
              <div className="mt-1.5 text-center text-[10.5px] font-medium text-muted-foreground">
                +{unread.length - 1} ещё в очереди
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
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-5"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
            onClick={() => setOpened(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.9 }}
              className="relative flex max-h-[82vh] w-full max-w-[360px] flex-col overflow-hidden rounded-3xl border border-border bg-card-solid shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with gradient */}
              <div
                className="relative overflow-hidden px-5 pb-5 pt-6"
                style={{ background: "var(--gradient-primary)" }}
              >
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-14 -left-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                <button
                  onClick={() => setOpened(null)}
                  aria-label="Закрыть"
                  className="tg-press absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white backdrop-blur"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="relative flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/25 backdrop-blur">
                    <Sparkles className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                      Уведомление
                    </p>
                    <h3 className="truncate text-[16px] font-semibold text-white">
                      {opened.title?.trim() || "Сообщение от администратора"}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="ns-scroll flex-1 overflow-y-auto px-5 py-4">
                <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground">
                  {renderMessage(opened.message)}
                </div>
                <div className="mt-4 space-y-2">
                  {opened.link && (
                    <button
                      onClick={() => copyLinkValue(opened.link!)}
                      className="tg-press flex w-full items-center gap-3 rounded-xl border border-border bg-muted/60 px-3.5 py-3 text-left"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: "var(--gradient-primary)" }}
                      >
                        <Copy className="h-4 w-4 text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">Ссылка</span>
                        <span className="block truncate text-[13px] font-medium text-foreground">{opened.link}</span>
                      </span>
                    </button>
                  )}
                  {opened.website && (
                    <button
                      onClick={() => copyWebsite(opened.website!)}
                      className="tg-press flex w-full items-center gap-3 rounded-xl border border-border bg-muted/60 px-3.5 py-3 text-left"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: "var(--gradient-primary)" }}
                      >
                        <Globe className="h-4 w-4 text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">Сайт</span>
                        <span className="block truncate text-[13px] font-medium text-foreground">{opened.website}</span>
                      </span>
                    </button>
                  )}
                  {opened.email && (
                    <a
                      href={`mailto:${opened.email}`}
                      className="tg-press flex w-full items-center gap-3 rounded-xl border border-border bg-muted/60 px-3.5 py-3 text-left"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: "var(--gradient-primary)" }}
                      >
                        <Mail className="h-4 w-4 text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">E-mail</span>
                        <span className="block truncate text-[13px] font-medium text-foreground">{opened.email}</span>
                      </span>
                    </a>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-border p-3">
                <button
                  onClick={() => {
                    const b = opened;
                    setOpened(null);
                    ack(b);
                  }}
                  className="tg-press h-11 w-full rounded-xl text-[15px] font-semibold text-white"
                  style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}