import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";

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
  return (
    <MobileShell title={titleFor(pathname)}>
      <Outlet />
    </MobileShell>
  );
}

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});
