import { Sparkles, ShieldCheck, Wallet, Info } from "lucide-react";

export function AboutProject() {
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
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">О проекте</p>
            <h2 className="text-[18px] font-semibold leading-tight">Кто создатель? И зачем нам это</h2>
            <p className="mt-1 text-[12.5px] leading-snug text-white/85">
              Коротко о том, что это за сервис и как он будет работать дальше
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14.5px] font-semibold text-foreground">Это проверка VPN-сервисов</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/85">
                Мы тестируем VPN-конфигурации, следим за их стабильностью и подбираем те,
                которыми действительно удобно пользоваться.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14.5px] font-semibold text-foreground">Скоро сервис станет платным</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/85">
                Этот VPN-сервис будет продаваться за <b>33 ₽</b> — нам, увы, неудобно работать
                в убыток. Стоимость минимальная, чтобы покрыть содержание и развитие.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Info className="h-4.5 w-4.5" />
            </div>
            <p className="text-[13px] leading-relaxed text-foreground/80">
              Есть вопросы или предложения? Напишите нам на{" "}
              <a href="mailto:netspas@internet.ru" className="text-primary underline">
                netspas@internet.ru
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}