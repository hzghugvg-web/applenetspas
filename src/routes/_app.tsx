import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { getFastSession } from "@/lib/fast-auth";

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
    const { hasSession } = await getFastSession(650);
    if (!hasSession) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});
