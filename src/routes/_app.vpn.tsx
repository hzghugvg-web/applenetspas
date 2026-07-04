import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { issueVpnConfig, getMyIssuedLinks } from "@/lib/vpn.functions";
import { MobileShell } from "@/components/MobileShell";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { Clock, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/vpn")({ component: VpnPage });

type Direction = { id: string; name: string; flag: string | null };
type Profile = { cooldown_until: string | null; subscription_from: string | null; subscription_until: string | null; is_blocked: boolean };

function VpnPage() {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const issue = useServerFn(issueVpnConfig);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function loadAll() {
    await supabase.rpc("cleanup_expired_vless_links");
    const [{ data: availableLinks }, { data: u }] = await Promise.all([
      supabase
        .from("vless_links")
        .select("direction_id")
        .eq("is_active", true)
        .or(`available_from.is.null,available_from.lte.${new Date().toISOString()}`)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      supabase.auth.getUser(),
    ]);
    const dirIds = Array.from(new Set((availableLinks ?? []).map((l: any) => l.direction_id).filter(Boolean)));
    const { data: dirs } = dirIds.length
      ? await supabase.from("directions").select("id,name,flag").eq("is_active", true).in("id", dirIds).order("name")
      : { data: [] as Direction[] };
    const unique = Array.from(
      new Map((dirs ?? []).map((d: any) => [d.id, { id: d.id, name: d.name, flag: d.flag }])).values()
    );
    setDirections(unique);
    if (unique.length && !unique.find((d) => d.id === selected)) setSelected(unique[0].id);
    if (!unique.length) setSelected(null);
    if (u.user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("cooldown_until,subscription_from,subscription_until,is_blocked")
        .eq("id", u.user.id)
        .maybeSingle();
      setProfile(p as any);
    }
  }
  useEffect(() => { loadAll(); }, []); // eslint-disable-line
  useEffect(() => {
    const t = setInterval(() => { loadAll(); }, 8000);
    const onVis = () => { if (document.visibilityState === "visible") loadAll(); };
    document.addEventListener("visibilitychange", onVis);
    const ch = supabase
      .channel("vless_links_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "vless_links" }, () => loadAll())
      .subscribe();
    const ch2 = supabase
      .channel("issued_configs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "issued_configs" }, () => { loadAll(); })
      .subscribe();
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
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
        );
      } else {
        toast.success("Конфигурация выдана");
      }
      await loadAll();
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
    <MobileShell title="VPN">
      <div className="space-y-4">
        {onCooldown && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">До следующей выдачи:</span>
              <span className="ml-auto font-medium">{fmtCooldown(cooldownMs)}</span>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Направление</div>
          <div className="grid grid-cols-2 gap-2">
            {directions.map((d) => (
              <button key={d.id} onClick={() => setSelected(d.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected === d.id ? "border-primary bg-primary/10" : "border-border bg-card"
                }`}>
                <span className="text-xl">{d.flag ?? "🌐"}</span>
                <span className="text-sm font-medium">{d.name}</span>
              </button>
            ))}
            {!directions.length && <div className="col-span-2 text-sm text-muted-foreground">Нет активных направлений</div>}
          </div>
        </section>

        <button
          onClick={handleIssue}
          disabled={loading || onCooldown || hasActiveSubscription || profile?.is_blocked || !selected}
          className="tg-btn w-full h-14 text-[15px]"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (hasActiveSubscription ? "VPN уже активен" : onCooldown ? "Кулдаун активен" : "Получить конфигурацию")}
        </button>

        {hasActiveSubscription && (
          <Link
            to="/my-vpn"
            className="ns-fade flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
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
                Ссылка и срок — во вкладке «Мой VPN»
              </div>
            </div>
          </Link>
        )}
      </div>
    </MobileShell>
  );
}
