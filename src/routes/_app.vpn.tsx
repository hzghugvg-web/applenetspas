import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { translateAuthError } from "@/lib/errors";
import { toast } from "sonner";
import { Copy, QrCode, RefreshCw, Clock, Smartphone, CalendarClock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/_app/vpn")({ component: VpnPage });

type Direction = { id: string; name: string; flag: string | null };
type Profile = { cooldown_until: string | null; subscription_until: string | null; device_count: number; is_blocked: boolean };

function VpnPage() {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function loadAll() {
    const [{ data: dirs }, { data: u }] = await Promise.all([
      supabase.from("directions").select("id,name,flag").eq("is_active", true).order("name"),
      supabase.auth.getUser(),
    ]);
    setDirections(dirs ?? []);
    if (!selected && dirs?.length) setSelected(dirs[0].id);
    if (u.user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("cooldown_until,subscription_until,device_count,is_blocked")
        .eq("id", u.user.id)
        .maybeSingle();
      setProfile(p as any);
    }
  }
  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const cooldownMs = profile?.cooldown_until ? new Date(profile.cooldown_until).getTime() - now : 0;
  const onCooldown = cooldownMs > 0;

  async function issue() {
    if (!selected) return;
    setLoading(true); setLink(null);
    try {
      const { data, error } = await supabase.rpc("issue_vpn_config", { _direction_id: selected });
      if (error) throw error;
      const url = (data as any)?.[0]?.vless_url ?? null;
      setLink(url);
      toast.success("Конфигурация выдана");
      await loadAll();
    } catch (e: any) {
      toast.error(translateAuthError(e?.message));
    } finally { setLoading(false); }
  }

  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast.success("Скопировано"); }
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
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="h-4 w-4" /> Подписка до</div>
            <div className="font-medium">{profile?.subscription_until ? new Date(profile.subscription_until).toLocaleDateString("ru-RU") : "—"}</div>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Smartphone className="h-4 w-4" /> Устройства</div>
            <div className="font-medium">{profile?.device_count ?? 0} / 3</div>
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
          onClick={issue}
          disabled={loading || onCooldown || profile?.is_blocked || !selected}
          className="h-14 w-full rounded-2xl font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
        >
          {loading ? "..." : onCooldown ? "Кулдаун активен" : "Получить конфигурацию"}
        </button>

        {link && (
          <section className="ns-fade space-y-2 rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Ваша ссылка</div>
            <div className="break-all rounded-xl bg-muted p-3 text-xs">{link}</div>
            <div className="flex gap-2">
              <button onClick={copyLink} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium">
                <Copy className="h-4 w-4" /> Копировать
              </button>
              <button onClick={() => setQrOpen(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium">
                <QrCode className="h-4 w-4" /> QR-код
              </button>
              <button onClick={issue} disabled={loading || onCooldown} className="flex items-center justify-center rounded-xl bg-secondary px-4 py-3 text-sm font-medium disabled:opacity-50">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}
      </div>

      {qrOpen && link && (
        <div onClick={() => setQrOpen(false)} className="ns-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={link} size={256} className="mx-auto h-auto w-full" />
            </div>
            <button onClick={() => setQrOpen(false)} className="mt-4 h-12 w-full rounded-xl bg-secondary font-medium">Закрыть</button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
