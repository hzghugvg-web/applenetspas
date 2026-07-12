import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
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

  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--ns-viewport-height", `${height}px`);
    };

    updateViewportHeight();
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
    };
  }, []);

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
      className="ns-mobile-shell fixed left-0 right-0 top-0 flex flex-col overflow-hidden text-foreground"
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
          style={{ paddingBottom: "16px" }}
        >
          <div className="space-y-3 pb-2">{children}</div>
        </div>
      </main>
      <nav
        className="ns-nav-dock relative mx-3 mb-3 grid shrink-0 gap-1 rounded-[24px] p-1.5"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          background: "color-mix(in srgb, var(--card-solid) 88%, transparent)",
          border: "1px solid color-mix(in srgb, var(--border) 90%, transparent)",
          boxShadow: "0 18px 40px -18px rgba(0,0,0,0.5), 0 4px 12px -6px rgba(0,0,0,0.25)",
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          marginBottom: "max(12px, env(safe-area-inset-bottom))",
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
              className={`tg-press relative flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-[10.5px] font-semibold transition-colors ${
                active ? "" : "text-muted-foreground"
              }`}
              style={{
                touchAction: "manipulation",
                color: active ? "var(--primary-foreground)" : undefined,
              }}
            >
              {active && (
                <motion.span
                  layoutId="ns-nav-indicator"
                  transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
                  className="absolute inset-0 rounded-[18px]"
                  style={{
                    background: "var(--gradient-primary)",
                    boxShadow: "0 8px 20px -10px color-mix(in srgb, var(--primary) 70%, transparent)",
                  }}
                />
              )}
              <Icon
                className="relative z-10 transition-all"
                style={{
                  width: active ? 22 : 20,
                  height: active ? 22 : 20,
                }}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="relative z-10 tracking-tight leading-none">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
