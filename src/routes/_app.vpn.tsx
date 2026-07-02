import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { issueVpnConfig, getMyIssuedLinks } from "@/lib/vpn.functions";
import { MobileShell } from "@/components/MobileShell";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { Copy, RefreshCw, Clock, CalendarClock, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/vpn")({ component: VpnPage });

type Direction = { id: string; name: string; flag: string | null };
type Profile = { cooldown_until: string | null; subscription_from: string | null; subscription_until: string | null; is_blocked: boolean };

function VpnPage() {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [linkIdx, setLinkIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const issue = useServerFn(issueVpnConfig);
  const loadIssued = useServerFn(getMyIssuedLinks);

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
  async function reloadIssued() {
    try {
      const res = await loadIssued({});
      setLinks(res.links);
      setLinkIdx((i) => (res.links.length ? Math.min(i, res.links.length - 1) : 0));
    } catch { /* ignore */ }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "issued_configs" }, () => { reloadIssued(); loadAll(); })
      .subscribe();
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
      supabase.removeChannel(ch2);
    };
  }, []); // eslint-disable-line
  useEffect(() => {
    reloadIssued();
  }, []); // eslint-disable-line

  const cooldownMs = profile?.cooldown_until ? new Date(profile.cooldown_until).getTime() - now : 0;
  const subscriptionMs = profile?.subscription_until ? new Date(profile.subscription_until).getTime() - now : 0;
  const onCooldown = cooldownMs > 0;
  const hasActiveSubscription = subscriptionMs > 0;

  async function handleIssue() {
    if (!selected) return;
    setLoading(true); setLinks([]); setLinkIdx(0);
    try {
      const res = await issue({ data: { directionId: selected } });
      if (!res.links.length) throw new Error("Не удалось получить конфигурацию");
      setLinks(res.links);
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

  const currentLink = links[linkIdx] ?? null;

  async function copyLink() {
    if (!currentLink) return;
    try { await navigator.clipboard.writeText(currentLink); toast.success("Скопировано"); }
    catch { toast.error("Не удалось скопировать"); }
  }

  function fmtCooldown(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}ч ${m}м ${sec}с`;
  }

  return (
    <MobileShell title="VPN">
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex min-h-5 items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="h-4 w-4" /> Подписка до</div>
            <div className="font-medium">
              {profile === null
                ? <span className="inline-block h-4 w-20 animate-pulse rounded bg-muted" />
                : profile.subscription_until
                  ? new Date(profile.subscription_until).toLocaleDateString("ru-RU")
                  : "—"}
            </div>
          </div>
          {onCooldown && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">До следующей выдачи:</span>
              <span className="ml-auto font-medium">{fmtCooldown(cooldownMs)}</span>
            </div>
          )}
        </section>

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
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (hasActiveSubscription ? "VPN уже активен" : onCooldown ? "Кулдаун активен" : "Получить конфигурацию")}
        </button>

        {currentLink && (
          <section className="ns-fade space-y-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Ваш конфиг {links.length > 1 ? `${linkIdx + 1}/${links.length}` : ""}
              </div>
              {links.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLinkIdx((i) => (i - 1 + links.length) % links.length)}
                    className="grid h-7 w-7 place-items-center rounded-full bg-secondary"
                    aria-label="Предыдущий"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLinkIdx((i) => (i + 1) % links.length)}
                    className="grid h-7 w-7 place-items-center rounded-full bg-secondary"
                    aria-label="Следующий"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="break-all rounded-xl bg-muted p-3 text-xs">{currentLink}</div>
            <p className="text-[11px] text-muted-foreground">
              Скопируйте ссылку или отсканируйте QR в Happ, v2rayTun, Streisand — работает в России, наш сервер не нужен.
            </p>
            <div className="flex gap-2">
              <button onClick={copyLink} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium">
                <Copy className="h-4 w-4" /> Копировать
              </button>
              <button onClick={handleIssue} disabled={loading || onCooldown || hasActiveSubscription} className="flex items-center justify-center rounded-xl bg-secondary px-4 py-3 text-sm font-medium disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>
          </section>
        )}

        {hasActiveSubscription && profile && (
          <section className="ns-fade space-y-2 rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Активный VPN</div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Запущен</span>
              <span className="font-medium">
                {profile.subscription_from
                  ? new Date(profile.subscription_from).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Закончится</span>
              <span className="font-medium">
                {profile.subscription_until
                  ? new Date(profile.subscription_until).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
                  : "—"}
              </span>
            </div>
          </section>
        )}
      </div>
    </MobileShell>
  );
}
