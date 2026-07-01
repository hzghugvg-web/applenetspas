import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, HelpCircle, ChevronDown } from "lucide-react";
import { FAQ } from "@/lib/faq";

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
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам…"
          className="h-10 w-full rounded-xl border border-border bg-[#1C2C3C] pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
        />
      </div>

      {filtered.length === 0 && (
        <p className="pt-4 text-center text-[14px] text-muted-foreground">Ничего не найдено</p>
      )}

      {filtered.map(({ q, a, i }) => {
        const open = openIdx === i;
        return (
          <div key={i} className="overflow-hidden rounded-xl bg-card">
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : i)}
              className="tg-press flex w-full items-center gap-3 p-3 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <HelpCircle className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="flex-1 text-[16px] font-medium text-foreground">{q}</span>
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="text-muted-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-3 pb-3 pt-2 pl-14 text-[14px] leading-relaxed text-muted-foreground">
                    {a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}