import { useMemo, useState } from "react";
import { Search, HelpCircle, ChevronDown } from "lucide-react";
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
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам…"
          className="h-10 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
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
              <span
                className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
              >
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="px-3 pb-3 pt-2 pl-14 text-[14px] leading-relaxed text-muted-foreground">
                  {renderAnswer(a)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}