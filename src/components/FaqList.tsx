import { useMemo, useState } from "react";
import { Search, Plus, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FAQ } from "@/lib/faq";

function renderAnswer(text: string) {
  // Split on emails and URLs (with or without protocol), keep them as tokens
  const regex = /([\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(part)) {
      return (
        <a key={i} href={`mailto:${part}`} className="text-primary underline break-all">
          {part}
        </a>
      );
    }
    if (/^https?:\/\//i.test(part) || /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i.test(part)) {
      const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function FaqList() {
  const [query, setQuery] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = FAQ.map((item, i) => ({ ...item, i }));
    if (!q) return list;
    return list.filter(
      (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1 text-white">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">База знаний</p>
            <h2 className="text-[18px] font-semibold leading-tight">Ответы на частые вопросы</h2>
            <p className="mt-1 text-[12.5px] leading-snug text-white/85">
              {FAQ.length} тем · подключение, оплата, поддержка
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам…"
          className="h-11 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-[14.5px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
        />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-[13.5px] text-muted-foreground">Ничего не найдено по запросу</p>
          <p className="mt-1 text-[12px] text-muted-foreground/70">Попробуйте другие слова</p>
        </div>
      )}

      {/* Grouped list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.map(({ q, a, i }, idx) => {
          const open = openIdx === i;
          const isLast = idx === filtered.length - 1;
          return (
            <div key={i} className={isLast ? "" : "border-b border-border/60"}>
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : i)}
                className="tg-press flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[14.5px] font-medium leading-snug text-foreground">
                  {q}
                </span>
                <motion.span
                  animate={{ rotate: open ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                >
                  <Plus className="h-4 w-4" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pl-[3.75rem] pr-4">
                      <div className="rounded-xl bg-muted/60 p-3 text-[13.5px] leading-relaxed text-foreground/85">
                        {renderAnswer(a)}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}