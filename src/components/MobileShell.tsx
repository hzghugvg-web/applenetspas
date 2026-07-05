import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useHasActiveVpn } from "@/hooks/useHasActiveVpn";
import { BroadcastBanner } from "@/components/BroadcastBanner";

interface Props { title: string; children: ReactNode; }
type TabTo = "/vpn" | "/my-vpn" | "/support" | "/profile" | "/admin";
type Tab = { to: TabTo; label: string; icon: typeof Globe };

export function MobileShell({ title, children }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const showAdminTab = isAdmin === true || (pathname.startsWith("/admin") && adminLoading);
  const { data: activeVpn } = useHasActiveVpn();
  const showMyVpnTab = !!activeVpn || pathname.startsWith("/my-vpn");

  const tabs: Tab[] = [
    { to: "/vpn", label: "VPN", icon: Globe },
    ...(showMyVpnTab ? [{ to: "/my-vpn", label: "Мой VPN", icon: ShieldCheck }] : []),
    { to: "/support", label: "Поддержка", icon: MessageCircle },
    { to: "/profile", label: "Настройки", icon: User },
    ...(showAdminTab ? [{ to: "/admin", label: "Админ", icon: Settings }] : []),
  ];

  useEffect(() => {
    for (const tab of tabs) {
      void navigate({ to: tab.to, preload: true });
    }
  }, [navigate, tabs]);

  function openTab(to: TabTo) {
    if (pathname.startsWith(to)) return;
    void navigate({ to });
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col text-foreground"
      style={{ background: "var(--app-bg)" }}
    >
      <header className="safe-top tg-blur shrink-0">
        <div className="flex h-12 items-center justify-center px-4">
          <h1 className="text-[17px] font-semibold tracking-tight">
            {title}
          </h1>
        </div>
      </header>
      <BroadcastBanner />
      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          className="ns-scroll h-full px-4 pt-4"
          style={{ paddingBottom: "12px" }}
        >
          <div className="space-y-3 pb-2">{children}</div>
        </div>
      </main>
      <nav
        className="mx-2 grid shrink-0 rounded-2xl glass"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          marginBottom: "22px",
        }}
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <button
              key={to}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                openTab(to);
              }}
              onClick={(e) => {
                e.preventDefault();
                openTab(to);
              }}
              className={`tg-press relative flex h-[62px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
              style={{ touchAction: "manipulation" }}
            >
              {active && (
                <motion.span
                  layoutId="ns-nav-indicator"
                  transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.6 }}
                  className="absolute inset-1 rounded-xl"
                  style={{ background: "var(--gradient-primary)", opacity: 0.22 }}
                />
              )}
              <Icon className="relative z-10 h-[22px] w-[22px]" strokeWidth={2} />
              <span className="relative z-10 tracking-tight">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
