import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { issueVpnConfig } from "@/lib/vpn.functions";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { Clock, Loader2, ShieldCheck, Zap, Globe, ArrowRight, Check } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

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
    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(ch2);
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
      <div className="space-y-5">
        {onCooldown && (
          <div
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm"
            style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}
          >
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">До следующей выдачи</span>
            <span className="ml-auto font-semibold tabular-nums">{fmtCooldown(cooldownMs)}</span>
          </div>
        )}

        {/* Hero: selected direction */}
        <HeroCard
          selected={directions.find((d) => d.id === selected)}
          totalCount={directions.length}
          loading={loading}
          onIssue={handleIssue}
          disabled={loading || onCooldown || hasActiveSubscription || profile?.is_blocked || !selected}
          buttonLabel={
            hasActiveSubscription ? "VPN уже активен"
              : onCooldown ? "Кулдаун активен"
              : "Получить конфигурацию"
          }
        />

        {/* Directions grid */}
        {directions.length > 0 ? (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Направления
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Globe className="h-3 w-3" /> {directions.length} доступно
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {directions.map((d) => {
                const active = selected === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className="tg-press group relative flex flex-col gap-2 overflow-hidden rounded-2xl p-3 text-left transition-colors"
                    style={{
                      background: active ? "var(--gradient-surface)" : "var(--card-solid)",
                      border: "1.5px solid " + (active ? "color-mix(in srgb, var(--primary) 70%, transparent)" : "var(--border)"),
                      boxShadow: active ? "0 8px 22px -14px var(--primary)" : "0 4px 14px -10px rgba(0,0,0,0.35)",
                    }}
                  >
                    {active && (
                      <div
                        className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full"
                        style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                    <div className="text-[28px] leading-none">{d.flag ?? "🌐"}</div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-foreground">{d.name}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Доступно
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <div
            className="rounded-2xl border border-dashed p-6 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <Globe className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">Нет активных направлений</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">Загляните позже — новые серверы добавляются регулярно</p>
          </div>
        )}

        {hasActiveSubscription && (
          <Link
            to="/my-vpn"
            className="ns-fade flex items-center gap-3 rounded-2xl p-4"
            style={{
              background: "var(--gradient-surface)",
              border: "1px solid color-mix(in srgb, var(--primary) 40%, var(--border))",
            }}
          >
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              <ShieldCheck className="h-5 w-5" style={{ color: "var(--primary-foreground)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">VPN активен</div>
              <div className="text-[12px] text-muted-foreground">
                Конфигурация и срок — во вкладке «Мой VPN»
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </div>
    </>
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
      className="relative overflow-hidden rounded-3xl p-5"
      style={{
        background: "var(--gradient-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-60"
        style={{ background: "var(--gradient-primary)", filter: "blur(60px)" }}
      />

      <div className="relative flex items-center gap-3">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[28px]"
          style={{
            background: "color-mix(in srgb, var(--card-solid) 70%, transparent)",
            border: "1px solid var(--border)",
          }}
        >
          {selected?.flag ?? "🌐"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Выбранное направление
          </div>
          <div className="mt-0.5 truncate text-[17px] font-semibold text-foreground">
            {selected?.name ?? "Выберите ниже"}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Zap className="h-3 w-3 text-primary" />
            {totalCount > 0 ? `${totalCount} серверов онлайн` : "Ожидание серверов"}
          </div>
        </div>
      </div>

      <button
        onClick={onIssue}
        disabled={disabled}
        className="tg-btn mt-4 h-13 w-full text-[15px]"
        style={{ height: 52 }}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : buttonLabel}
      </button>
    </div>
  );
}
