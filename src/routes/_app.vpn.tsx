import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { issueVpnConfig } from "@/lib/vpn.functions";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { Clock, Loader2, ShieldCheck, Zap, Globe, ArrowRight, Check, Sparkles, Radio, Rocket } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/vpn")({ component: VpnPage });

type Direction = { id: string; name: string; flag: string | null };
type Profile = { cooldown_until: string | null; subscription_from: string | null; subscription_until: string | null; is_blocked: boolean };

function VpnPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const issue = useServerFn(issueVpnConfig);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const { data: directions = [] } = useQuery<Direction[]>({
    queryKey: ["vpn-directions"],
    staleTime: 3_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      await supabase.rpc("cleanup_expired_vless_links");
      const { data: availableLinks } = await supabase
        .from("vless_links")
        .select("direction_id")
        .eq("is_active", true)
        .or(`available_from.is.null,available_from.lte.${new Date().toISOString()}`)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
      const dirIds = Array.from(new Set((availableLinks ?? []).map((l: any) => l.direction_id).filter(Boolean)));
      if (!dirIds.length) return [];
      const { data: dirs } = await supabase
        .from("directions").select("id,name,flag").eq("is_active", true).in("id", dirIds).order("name");
      return Array.from(new Map((dirs ?? []).map((d: any) => [d.id, { id: d.id, name: d.name, flag: d.flag }])).values());
    },
  });
  const { data: profile = null } = useQuery<Profile | null>({
    queryKey: ["profile"],
    staleTime: 20_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("cooldown_until,subscription_from,subscription_until,is_blocked")
        .eq("id", u.user.id).maybeSingle();
      return (data ?? null) as Profile | null;
    },
  });

  useEffect(() => {
    if (directions.length && !directions.find((d) => d.id === selected)) setSelected(directions[0].id);
    if (!directions.length && selected) setSelected(null);
  }, [directions, selected]);

  function reloadAll() {
    qc.invalidateQueries({ queryKey: ["vpn-directions"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["has-active-vpn"] });
    qc.invalidateQueries({ queryKey: ["my-vpn"] });
  }

  useEffect(() => {
    const ch = supabase
      .channel("vless_links_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "vless_links" }, () => reloadAll())
      .subscribe();
    const ch2 = supabase
      .channel("issued_configs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "issued_configs" }, () => { reloadAll(); })
      .subscribe();
    const ch3 = supabase
      .channel("directions_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "directions" }, () => reloadAll())
      .subscribe();
    const onVis = () => { if (document.visibilityState === "visible") reloadAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []); // eslint-disable-line

  const cooldownMs = profile?.cooldown_until ? new Date(profile.cooldown_until).getTime() - now : 0;
  const subscriptionMs = profile?.subscription_until ? new Date(profile.subscription_until).getTime() - now : 0;
  const onCooldown = cooldownMs > 0;
  const hasActiveSubscription = subscriptionMs > 0;

  async function handleIssue() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await issue({ data: { directionId: selected } });
      if (!res.links.length) throw new Error("Не удалось получить конфигурацию");
      const { data: u } = await supabase.auth.getUser();
      const key = u.user ? `ns_first_key_shown_${u.user.id}` : null;
      const alreadyShown = key ? localStorage.getItem(key) : "1";
      if (!alreadyShown) {
        localStorage.setItem(key!, "1");
        toast.success(
          "Ваш ключ готов 🎉",
          "Уважаемый пользователь, пожалуйста, не передавайте ключ никому — он привязан к вашему аккаунту.\n\nЕсли VPN не работает сразу — это нормально: он ищет подходящий сервер. Подождите 3–5 минут, и соединение установится.\n\nОбратите внимание: VPN-серверы не наши, мы бесплатно раздаём готовые конфигурации. Подробнее — в разделе «Настройки» → FAQ, там собраны ответы на частые вопросы.\n\nПриятного пользования и стабильного интернета! 💙"
          ,
          {
            actionLabel: "Перейти в Мой VPN",
            onAction: () => navigate({ to: "/my-vpn" }),
          }
        );
      } else {
        toast.success("Конфигурация выдана", undefined, {
          actionLabel: "Перейти в Мой VPN",
          onAction: () => navigate({ to: "/my-vpn" }),
        });
      }
      reloadAll();
    } catch (e: any) {
      toast.error(translateAuthError(e?.message));
    } finally { setLoading(false); }
  }

  function fmtCooldown(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}ч ${m}м ${sec}с`;
  }

  return (
    <>
      <div className="space-y-4">
        {onCooldown && (
          <div
            className="relative flex items-center gap-2.5 overflow-hidden rounded-2xl px-3.5 py-3 text-sm"
            style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}
          >
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Clock className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">До следующей выдачи</div>
              <div className="mt-0.5 text-[15px] font-bold tabular-nums text-foreground">{fmtCooldown(cooldownMs)}</div>
            </div>
          </div>
        )}

        {/* Hero — active subscription state: whole card becomes a big CTA to Мой VPN */}
        {hasActiveSubscription ? (
          <ActiveHero onOpen={() => navigate({ to: "/my-vpn" })} />
        ) : (
          <HeroCard
            selected={directions.find((d) => d.id === selected)}
            totalCount={directions.length}
            loading={loading}
            onIssue={handleIssue}
            disabled={loading || onCooldown || profile?.is_blocked || !selected}
            buttonLabel={onCooldown ? "Кулдаун активен" : "Получить конфигурацию"}
          />
        )}

        {/* Directions list — vertical cards, richer info */}
        {directions.length > 0 && !hasActiveSubscription ? (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Globe className="h-3 w-3" /> Направления
              </div>
              <div className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {directions.length}
              </div>
            </div>
            <div className="space-y-2">
              {directions.map((d, i) => {
                const active = selected === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className="tg-press ns-fade group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-3 text-left transition-all"
                    style={{
                      background: active ? "var(--gradient-surface)" : "var(--card-solid)",
                      border: "1.5px solid " + (active ? "color-mix(in srgb, var(--primary) 70%, transparent)" : "var(--border)"),
                      boxShadow: active
                        ? "0 10px 26px -14px var(--primary)"
                        : "0 4px 14px -10px rgba(0,0,0,0.25)",
                      animationDelay: `${i * 30}ms`,
                    }}
                  >
                    {active && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
                        style={{ background: "var(--gradient-primary)" }}
                      />
                    )}
                    <div
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[24px]"
                      style={{
                        background: active ? "rgba(255,255,255,0.12)" : "var(--muted)",
                        border: "1px solid " + (active ? "color-mix(in srgb, var(--primary) 40%, transparent)" : "var(--border)"),
                      }}
                    >
                      {d.flag ?? "🌐"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-foreground">{d.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Онлайн · низкая задержка
                      </div>
                    </div>
                    <div
                      className="grid h-6 w-6 place-items-center rounded-full text-primary-foreground transition-all"
                      style={{
                        background: active ? "var(--gradient-primary)" : "transparent",
                        border: active ? "none" : "1.5px solid var(--border)",
                        color: active ? "var(--primary-foreground)" : "transparent",
                      }}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : !hasActiveSubscription ? (
          <div
            className="rounded-2xl border border-dashed p-6 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <Globe className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">Нет активных направлений</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">Загляните позже — новые серверы добавляются регулярно</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ActiveHero({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="ns-fade tg-press relative flex w-full flex-col overflow-hidden rounded-[28px] p-5 text-left"
      style={{
        background: "var(--gradient-primary)",
        boxShadow: "var(--shadow-elegant)",
        color: "var(--primary-foreground)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.4), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 bottom-[-40px] h-40 w-40 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.2), transparent 70%)" }}
      />

      <div className="relative flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur">
          <span className="ns-live inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
          VPN активен
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] opacity-85">
          <Sparkles className="h-3 w-3" /> VPNSUS
        </div>
      </div>

      <div className="relative mt-5 flex items-center gap-3.5">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl ring-1 ring-white/25"
          style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}
        >
          <ShieldCheck className="h-8 w-8" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-85">
            Ваша подписка
          </div>
          <div className="mt-0.5 truncate text-[20px] font-bold leading-tight">
            Всё готово к работе
          </div>
          <div className="mt-1 text-[11.5px] opacity-85">
            Конфигурация и срок — во вкладке «Мой VPN»
          </div>
        </div>
      </div>

      <div
        className="relative mt-5 flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold"
        style={{
          background: "rgba(255,255,255,0.98)",
          color: "var(--primary)",
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.35)",
        }}
      >
        <ShieldCheck className="h-4 w-4" />
        Перейти в «Мой VPN»
        <ArrowRight className="h-4 w-4" />
      </div>
    </button>
  );
}

function HeroCard({
  selected, totalCount, loading, onIssue, disabled, buttonLabel,
}: {
  selected: Direction | undefined;
  totalCount: number;
  loading: boolean;
  onIssue: () => void;
  disabled: boolean;
  buttonLabel: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-5"
      style={{
        background: "var(--gradient-primary)",
        boxShadow: "var(--shadow-elegant)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.35), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 bottom-[-30px] h-36 w-36 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.18), transparent 70%)" }}
      />

      <div
        className="relative flex items-center justify-between"
        style={{ color: "var(--primary-foreground)" }}
      >
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] backdrop-blur">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300 ns-live" />
          <Radio className="h-3 w-3" /> Готово к подключению
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] opacity-80">
          <Sparkles className="h-3 w-3" /> VPNSUS
        </div>
      </div>

      <div className="relative mt-4 flex items-center gap-3.5" style={{ color: "var(--primary-foreground)" }}>
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[32px] ring-1 ring-white/20"
          style={{ background: "rgba(255,255,255,0.16)", backdropFilter: "blur(8px)" }}
        >
          {selected?.flag ?? "🌐"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.14em] opacity-80">
            Направление
          </div>
          <div className="mt-0.5 truncate text-[19px] font-bold leading-tight">
            {selected?.name ?? "Выберите ниже"}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] opacity-85">
            <Zap className="h-3 w-3" />
            {totalCount > 0 ? `${totalCount} серверов онлайн` : "Ожидание серверов"}
          </div>
        </div>
      </div>

      <button
        onClick={onIssue}
        disabled={disabled}
        className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
        style={{
          height: 54,
          background: "rgba(255,255,255,0.98)",
          color: "var(--primary)",
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.35)",
        }}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <>
            <Rocket className="h-4 w-4" />
            {buttonLabel}
          </>
        )}
      </button>
    </div>
  );
}
