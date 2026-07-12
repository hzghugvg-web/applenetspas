import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alertDialog as toast } from "@/lib/alert";
import { getMyIssuedLinks } from "@/lib/vpn.functions";
import { CalendarClock, Copy, ShieldCheck, Hourglass, Server, Radio, WifiOff, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { readOfflineMyVpn, saveOfflineMyVpn } from "@/lib/offline-vpn-cache";

export const Route = createFileRoute("/_app/my-vpn")({ component: MyVpnPage });

type Profile = { subscription_from: string | null; subscription_until: string | null };
type Config = { id: string; link: string; title?: string | null; issuedAt: string; directionId: string | null };
type Direction = { id: string; name: string; flag: string | null };

function MyVpnPage() {
  const qc = useQueryClient();
  const getLinks = useServerFn(getMyIssuedLinks);
  const [now, setNow] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const initialCached = (() => {
    const c = readOfflineMyVpn();
    if (!c) return undefined;
    return {
      profile: c.profile as Profile | null,
      configs: c.configs as Config[],
      dirs: c.dirs as Record<string, Direction>,
    };
  })();

  const { data } = useQuery({
    queryKey: ["my-vpn"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
    initialData: initialCached,
    queryFn: async () => {
      // Offline short-circuit: don't hang on failing network calls.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = readOfflineMyVpn();
        if (cached) {
          return {
            profile: cached.profile as Profile | null,
            configs: cached.configs as Config[],
            dirs: cached.dirs as Record<string, Direction>,
          };
        }
        return { profile: null as Profile | null, configs: [] as Config[], dirs: {} as Record<string, Direction> };
      }
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return { profile: null as Profile | null, configs: [] as Config[], dirs: {} as Record<string, Direction> };
        const [{ data: p }, issued] = await Promise.all([
          supabase.from("profiles").select("subscription_from,subscription_until").eq("id", u.user.id).maybeSingle(),
          getLinks(),
        ]);
        const list = (issued.configs ?? []) as Config[];
        const dirIds = Array.from(new Set(list.map((c) => c.directionId).filter(Boolean))) as string[];
        let dirs: Record<string, Direction> = {};
        if (dirIds.length) {
          const { data: ds } = await supabase.from("directions").select("id,name,flag").in("id", dirIds);
          for (const d of (ds ?? []) as Direction[]) dirs[d.id] = d;
        }
        const result = { profile: (p ?? null) as Profile | null, configs: list, dirs };
        saveOfflineMyVpn(result);
        return result;
      } catch (error) {
        const cached = readOfflineMyVpn();
        if (cached) {
          return {
            profile: cached.profile as Profile | null,
            configs: cached.configs as Config[],
            dirs: cached.dirs as Record<string, Direction>,
          };
        }
        throw error;
      }
    },
  });
  const profile = data?.profile ?? null;
  const configs = data?.configs ?? [];
  const dirs = data?.dirs ?? {};

  useEffect(() => {
    const ch = supabase
      .channel("my_vpn_issued_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "issued_configs" }, () => {
        qc.invalidateQueries({ queryKey: ["my-vpn"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const untilMs = profile?.subscription_until ? new Date(profile.subscription_until).getTime() - now : 0;
  const active = untilMs > 0;
  const totalMs = profile?.subscription_from && profile?.subscription_until
    ? new Date(profile.subscription_until).getTime() - new Date(profile.subscription_from).getTime()
    : 0;
  const elapsedMs = profile?.subscription_from ? now - new Date(profile.subscription_from).getTime() : 0;
  const percent = totalMs > 0 ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100)) : 0;
  const remainPercent = Math.max(0, Math.min(100, 100 - percent));

  const totalSec = Math.max(0, Math.floor(untilMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  async function copy(text: string) {
    try {
      const copied = await copyText(text);
      if (!copied) throw new Error("copy_failed");
      toast.success(
        "Конфигурация скопирована",
        "Вставьте ссылку подписки в VPN-клиент: Happ, V2rayTun, Streisand и т.д.",
      );
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  async function copyText(value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Telegram/webview can block the Clipboard API — use the legacy fallback below.
    }
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      el.style.top = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }

  const RING = 92;
  const CIRC = 2 * Math.PI * RING;
  const dash = CIRC * (remainPercent / 100);

  return (
    <>
      <div className="space-y-5">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl p-5"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
            style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.35), transparent 70%)" }}
          />
          <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--primary-foreground)", opacity: 0.9 }}>
            <span className={`inline-flex h-2 w-2 rounded-full ${active ? "ns-live" : ""}`} style={{ background: active ? "#22c55e" : "rgba(255,255,255,0.5)" }} />
            <ShieldCheck className="h-3.5 w-3.5" />
            {active ? "VPN активен" : "VPN не активен"}
          </div>

          <div className="relative mt-4 flex items-center gap-5">
            {/* Circular progress */}
            <div className="relative shrink-0" style={{ width: 112, height: 112 }}>
              <svg width={112} height={112} viewBox="0 0 220 220" className="-rotate-90">
                <circle cx={110} cy={110} r={RING} strokeWidth={16} fill="none" stroke="rgba(255,255,255,0.22)" />
                <circle
                  cx={110} cy={110} r={RING} strokeWidth={16} fill="none" strokeLinecap="round"
                  stroke="rgba(255,255,255,0.98)"
                  strokeDasharray={`${dash} ${CIRC}`}
                  style={{ transition: "stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: "var(--primary-foreground)" }}>
                <div className="text-[10px] uppercase tracking-wider opacity-80">осталось</div>
                <div className="text-xl font-bold tabular-nums leading-none">{Math.round(remainPercent)}%</div>
              </div>
            </div>

            {/* Countdown D H M S */}
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-4 gap-1.5" style={{ color: "var(--primary-foreground)" }}>
                {[
                  { v: days,    l: "дн" },
                  { v: hours,   l: "ч" },
                  { v: minutes, l: "мин" },
                  { v: seconds, l: "сек" },
                ].map((u, i) => (
                  <div key={i} className="rounded-xl px-1.5 py-2 text-center" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}>
                    <div key={u.v} className="ns-tick text-lg font-bold tabular-nums leading-none">{pad(u.v)}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-wider opacity-80">{u.l}</div>
                  </div>
                ))}
              </div>
              {!active && (
                <div className="mt-2 text-[12px]" style={{ color: "var(--primary-foreground)", opacity: 0.85 }}>
                  Оформите подписку, чтобы получить конфигурации
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Dates */}
        <section className="grid grid-cols-2 gap-3">
          <div className="tg-card !p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Начало</div>
            <div className="mt-1.5 text-[13px] font-semibold">
              {profile?.subscription_from ? new Date(profile.subscription_from).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </div>
          </div>
          <div className="tg-card !p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Hourglass className="h-3.5 w-3.5" /> Окончание</div>
            <div className="mt-1.5 text-[13px] font-semibold">
              {profile?.subscription_until ? new Date(profile.subscription_until).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </div>
          </div>
        </section>

        {/* Configs */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <Server className="h-3.5 w-3.5" /> Мои конфигурации
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {configs.length}
            </span>
          </div>

          {configs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              <Radio className="mx-auto mb-2 h-5 w-5 opacity-60" />
              У вас пока нет выданных конфигураций
            </div>
          )}

          {configs.map((c) => {
            const dir = c.directionId ? dirs[c.directionId] : null;
            return (
              <div key={c.id} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3 transition-transform">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                  style={{ background: "var(--gradient-primary)", opacity: 0.9 }}
                />
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                    style={{ background: "var(--gradient-surface)", border: "1px solid var(--border)" }}
                  >
                    {dir?.flag ?? "🌐"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.title ?? dir?.name ?? "Направление"}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      выдана {new Date(c.issuedAt).toLocaleString("ru-RU")}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 break-all rounded-xl bg-muted/70 p-2.5 font-mono text-[11px] leading-snug">
                  {c.link}
                </div>
                <button onClick={() => copy(c.link)} className="tg-btn-ghost mt-2 w-full">
                  <Copy className="h-4 w-4" /> Копировать подписку
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}