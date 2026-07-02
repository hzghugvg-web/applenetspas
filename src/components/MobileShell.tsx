import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle } from "lucide-react";
import { type ReactNode } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

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
        <div
          key={pathname}
          className="ns-scroll ns-page h-full px-4 pt-3"
          style={{ paddingBottom: "4px" }}
        >
          <div className="space-y-3">{children}</div>
        </div>
      </main>
      <nav
        className="mx-2 grid shrink-0 rounded-2xl glass"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          marginBottom: "4px",
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
                <span
                  className="absolute inset-1 rounded-xl"
                  style={{ background: "var(--gradient-primary)", opacity: 0.2 }}
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
