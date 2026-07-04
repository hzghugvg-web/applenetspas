import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alertDialog as toast } from "@/lib/alert";
import { CalendarClock, Clock, Copy, ShieldCheck, Hourglass } from "lucide-react";

export const Route = createFileRoute("/_app/my-vpn")({ component: MyVpnPage });

type Profile = { subscription_from: string | null; subscription_until: string | null };
type Config = { id: string; vless_url: string; issued_at: string; direction_id: string | null };
type Direction = { id: string; name: string; flag: string | null };

function MyVpnPage() {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const { data } = useQuery({
    queryKey: ["my-vpn"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { profile: null as Profile | null, configs: [] as Config[], dirs: {} as Record<string, Direction> };
      const [{ data: p }, { data: cs }] = await Promise.all([
        supabase.from("profiles").select("subscription_from,subscription_until").eq("id", u.user.id).maybeSingle(),
        supabase.from("issued_configs").select("id,vless_url,issued_at,direction_id").eq("user_id", u.user.id).order("issued_at", { ascending: false }),
      ]);
      const list = (cs ?? []) as Config[];
      const dirIds = Array.from(new Set(list.map((c) => c.direction_id).filter(Boolean))) as string[];
      let dirs: Record<string, Direction> = {};
      if (dirIds.length) {
        const { data: ds } = await supabase.from("directions").select("id,name,flag").in("id", dirIds);
        for (const d of (ds ?? []) as Direction[]) dirs[d.id] = d;
      }
      return { profile: (p ?? null) as Profile | null, configs: list, dirs };
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

  function fmtRemain(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}д ${h}ч ${m}м`;
    return `${h}ч ${m}м ${Math.floor(s % 60)}с`;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        "Ссылка успешно скопирована",
        "Вставьте её в браузер. Если это конфиг — вставьте в клиент (Happ, V2rayTun и т.д.)",
      );
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <>
      <div className="space-y-4">
        <section
          className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background: "var(--gradient-primary)",
            boxShadow: "var(--shadow-elegant)",
          }}
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--primary-foreground)", opacity: 0.8 }}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {active ? "Подписка активна" : "Подписка не активна"}
          </div>
          <div className="mt-2 text-2xl font-semibold" style={{ color: "var(--primary-foreground)" }}>
            {active ? fmtRemain(untilMs) : "—"}
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--primary-foreground)", opacity: 0.85 }}>
            осталось
          </div>
          {totalMs > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.25)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${percent}%`, background: "rgba(255,255,255,0.9)" }}
              />
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Начало</div>
            <div className="mt-1 text-[13px] font-medium">
              {profile?.subscription_from ? new Date(profile.subscription_from).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Hourglass className="h-3.5 w-3.5" /> Окончание</div>
            <div className="mt-1 text-[13px] font-medium">
              {profile?.subscription_until ? new Date(profile.subscription_until).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Мои конфигурации
          </div>
          {configs.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              У вас пока нет выданных конфигураций
            </div>
          )}
          {configs.map((c) => {
            const dir = c.direction_id ? dirs[c.direction_id] : null;
            return (
              <div key={c.id} className="space-y-2 rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{dir?.flag ?? "🌐"}</span>
                  <span className="text-sm font-medium">{dir?.name ?? "Направление"}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(c.issued_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className="break-all rounded-xl bg-muted p-2 text-[11px]">{c.vless_url}</div>
                <button onClick={() => copy(c.vless_url)} className="tg-btn-ghost w-full">
                  <Copy className="h-4 w-4" /> Копировать
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}