import { createFileRoute, Outlet, redirect, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MobileShell } from "@/components/MobileShell";
import { hasStoredSupabaseSession } from "@/lib/fast-auth";
import { supabase } from "@/integrations/supabase/client";
import { alertDialog as toast } from "@/lib/alert";

function titleFor(pathname: string): string {
  if (pathname.startsWith("/my-vpn")) return "Мой VPN";
  if (pathname.startsWith("/vpn")) return "VPN";
  if (pathname.startsWith("/support")) return "Поддержка";
  if (pathname.startsWith("/profile")) return "Настройки";
  if (pathname.startsWith("/admin")) return "Админ-панель";
  if (pathname.startsWith("/faq")) return "FAQ";
  return "";
}

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user || cancelled) return;
        const { data } = await supabase
          .from("profiles")
          .select("is_blocked, blocked_until, blocked_reason")
          .eq("id", u.user.id)
          .maybeSingle();
        if (cancelled || !data?.is_blocked) return;
        const until = data.blocked_until ? new Date(data.blocked_until) : null;
        if (until && until.getTime() <= Date.now()) return;
        await supabase.auth.signOut();
        try { sessionStorage.clear(); localStorage.removeItem("ns_offline_my_vpn_v1"); } catch {}
        const untilText = until
          ? `до ${until.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`
          : "бессрочно";
        toast.error(
          "Ваш аккаунт заблокирован",
          `Блокировка ${untilText}${data.blocked_reason ? `\nПричина: ${data.blocked_reason}` : ""}`,
        );
        navigate({ to: "/auth", replace: true });
      } catch {
        /* offline — skip */
      }
    }
    check();
    const t = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [navigate]);
  return (
    <MobileShell title={titleFor(pathname)}>
      <Outlet />
    </MobileShell>
  );
}

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: () => {
    if (!hasStoredSupabaseSession()) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});
