import { createFileRoute } from "@tanstack/react-router";
import { Mail, Copy, Globe, HelpCircle, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alertDialog as toast } from "@/lib/alert";

export const Route = createFileRoute("/_app/support")({ component: SupportPage });

const EMAIL = "netspas@internet.ru";
const SITE = "netspas.1c-umi.ru";

function SupportPage() {
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} скопирован`, "Вставьте в нужное поле.");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl p-6"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-white backdrop-blur">
            <Mail className="h-3 w-3" /> Новый способ связи
          </div>
          <h2 className="mt-3 text-[22px] font-semibold leading-tight text-white">
            Теперь пишите нам на почту
          </h2>
          <p className="mt-1.5 text-[13px] leading-snug text-white/85">
            Мы убрали чат обращений внутри приложения. Все вопросы, баги и предложения — по e-mail.
          </p>

          <a
            href={`mailto:${EMAIL}`}
            className="tg-press mt-4 flex items-center justify-between gap-2 rounded-2xl bg-white/95 px-4 py-3 text-left text-foreground"
          >
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">E-mail</p>
              <p className="truncate text-[15px] font-semibold">{EMAIL}</p>
            </div>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              <ArrowRight className="h-4 w-4 text-white" />
            </span>
          </a>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => copy(EMAIL, "E-mail")}
              className="tg-press flex items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-[12.5px] font-medium text-white backdrop-blur"
            >
              <Copy className="h-3.5 w-3.5" /> Копировать
            </button>
            <button
              onClick={() => copy(SITE, "Сайт")}
              className="tg-press flex items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-[12.5px] font-medium text-white backdrop-blur"
            >
              <Globe className="h-3.5 w-3.5" /> Копировать сайт
            </button>
          </div>
        </div>
      </section>

      {/* How to write */}
      <section className="space-y-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Что указать в письме
        </h3>
        <ul className="space-y-1.5 rounded-2xl border border-border bg-card p-4 text-[13.5px] leading-relaxed text-foreground/90">
          <li className="flex gap-2"><span className="text-primary">•</span> ваш ник или e-mail из приложения;</li>
          <li className="flex gap-2"><span className="text-primary">•</span> суть вопроса или описание проблемы;</li>
          <li className="flex gap-2"><span className="text-primary">•</span> если это баг — что делали, что ожидали, что случилось;</li>
          <li className="flex gap-2"><span className="text-primary">•</span> при необходимости — скриншот или короткое видео.</li>
        </ul>
      </section>

      {/* FAQ link */}
      <Link
        to="/faq"
        className="tg-press flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--gradient-primary)" }}
        >
          <HelpCircle className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground">Частые вопросы</p>
          <p className="text-[12px] text-muted-foreground">
            Возможно, ответ уже есть — загляните в FAQ.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
        Отвечаем обычно в течение 24 часов. По будням — быстрее.
      </p>
    </div>
  );
}