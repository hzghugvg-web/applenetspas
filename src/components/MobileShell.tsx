import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useHasActiveVpn } from "@/hooks/useHasActiveVpn";
import { BroadcastBanner } from "@/components/BroadcastBanner";
import { SlowNetworkBanner } from "@/components/SlowNetworkBanner";

interface Props { title: string; children: ReactNode; }
type TabTo = "/vpn" | "/my-vpn" | "/support" | "/profile" | "/admin";
type Tab = { to: TabTo; label: string; icon: LucideIcon };

export function MobileShell({ title, children }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const showAdminTab = isAdmin === true || (pathname.startsWith("/admin") && adminLoading);
  const { data: activeVpn } = useHasActiveVpn();
  const showMyVpnTab = !!activeVpn || pathname.startsWith("/my-vpn");

  const tabs = useMemo<Tab[]>(() => {
    const items: Tab[] = [{ to: "/vpn", label: "VPN", icon: Globe }];
    if (showMyVpnTab) items.push({ to: "/my-vpn", label: "Мой VPN", icon: ShieldCheck });
    items.push(
      { to: "/support", label: "Поддержка", icon: MessageCircle },
      { to: "/profile", label: "Настройки", icon: User },
    );
    if (showAdminTab) items.push({ to: "/admin", label: "Админ", icon: Settings });
    return items;
  }, [showAdminTab, showMyVpnTab]);

  function openTab(to: TabTo) {
    if (pathname.startsWith(to)) return;
    void navigate({ to });
  }

  return (
    <div
      data-mobile-shell
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-x-0 top-0 flex flex-col overflow-hidden text-foreground"
      style={{ background: "var(--app-bg)", height: "100dvh" }}
    >
      <header className="safe-top tg-blur shrink-0">
        <div className="flex h-12 items-center justify-center px-4">
          <h1 className="text-[17px] font-semibold tracking-tight">
            {title}
          </h1>
        </div>
      </header>
      <BroadcastBanner />
      <SlowNetworkBanner />
      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          className="ns-scroll h-full px-4 pt-4"
          style={{ paddingBottom: "12px" }}
        >
          <div className="space-y-3 pb-2">{children}</div>
        </div>
      </main>
      <nav
        className="grid shrink-0 tg-mobile-nav"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          paddingBottom: "env(safe-area-inset-bottom)",
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
                  transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
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
