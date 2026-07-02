import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle } from "lucide-react";
import { type ReactNode } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { motion } from "framer-motion";

interface Props { title: string; children: ReactNode; }

export function MobileShell({ title, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const showAdminTab = isAdmin === true || (pathname.startsWith("/admin") && adminLoading);

  const tabs = [
    { to: "/vpn", label: "VPN", icon: Globe },
    { to: "/support", label: "Поддержка", icon: MessageCircle },
    { to: "/profile", label: "Настройки", icon: User },
    ...(showAdminTab ? [{ to: "/admin", label: "Админ", icon: Settings }] : []),
  ];

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col text-foreground"
      style={{ background: "var(--app-bg)" }}
    >
      <header className="safe-top tg-blur shrink-0">
        <div className="flex h-12 items-center justify-center px-4">
          <h1 key={title} className="ns-title text-[17px] font-semibold tracking-tight">
            {title}
          </h1>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="ns-scroll h-full px-4 pt-4"
          style={{ paddingBottom: "12px", willChange: "transform, opacity" }}
        >
          <div className="space-y-3 pb-2">{children}</div>
        </motion.div>
      </main>
      <nav
        className="mx-2 grid shrink-0 rounded-2xl glass"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          marginBottom: "72px",
        }}
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`tg-press relative flex h-[62px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="ns-nav-indicator"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="absolute inset-1 rounded-xl"
                  style={{ background: "var(--gradient-primary)", opacity: 0.22 }}
                />
              )}
              <Icon className="relative z-10 h-[22px] w-[22px]" strokeWidth={2} />
              <span className="relative z-10 tracking-tight">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
