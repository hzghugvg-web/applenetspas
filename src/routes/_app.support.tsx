import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Headphones } from "lucide-react";

export const Route = createFileRoute("/_app/support")({ component: SupportPage });

const EMAIL = "netspas@internet.ru";

const ISSUES: { n: number; label: string; href: string }[] = [
  { n: 1, label: "VPN не подключается", href: "/faq" },
  { n: 2, label: "Как установить VPN?", href: "/faq" },
  { n: 3, label: "Интернет стал медленнее", href: "/faq" },
  { n: 4, label: "Нашли баг или ошибку?", href: `mailto:${EMAIL}?subject=Баг/ошибка` },
];

function IssueButton({ n, label, href }: { n: number; label: string; href: string }) {
  const isExternal = href.startsWith("mailto:") || href.startsWith("http");
  const inner = (
    <>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold"
        style={{
          background: "color-mix(in srgb, var(--accent) 18%, transparent)",
          color: "var(--accent)",
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)",
        }}
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
        {label}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );
  const className =
    "tg-press flex w-full items-center gap-3 rounded-2xl border px-3 py-3 transition-colors hover:bg-muted/40";
  const style = {
    background: "var(--card-solid)",
    borderColor: "var(--border)",
    boxShadow: "var(--shadow-card)",
  } as const;
  return isExternal ? (
    <a href={href} className={className} style={style}>{inner}</a>
  ) : (
    <Link to={href} className={className} style={style}>{inner}</Link>
  );
}

function SupportPage() {
  return (
    <div className="space-y-3 pb-4">
      {ISSUES.map((it) => (
        <IssueButton key={it.n} {...it} />
      ))}

      <section
        className="relative mt-2 overflow-hidden rounded-3xl border p-5"
        style={{
          background: "var(--card-solid)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full"
          style={{ background: "color-mix(in srgb, var(--accent) 30%, transparent)", filter: "blur(40px)" }}
        />
        <div className="relative flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold text-foreground">Нужна помощь?</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Напишите нам на почту, если возникли проблемы или вопросы
            </p>
            <a
              href={`mailto:${EMAIL}`}
              className="tg-press mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent"
            >
              Написать <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--primary) 18%, transparent))",
              boxShadow: "0 8px 24px -12px color-mix(in srgb, var(--accent) 60%, transparent)",
            }}
          >
            <Headphones className="h-8 w-8" style={{ color: "var(--accent)" }} strokeWidth={1.8} />
          </div>
        </div>
      </section>
    </div>
  );
}