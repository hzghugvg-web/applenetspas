import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle } from "lucide-react";
import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface Props { title: string; children: ReactNode; }

export function MobileShell({ title, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin } = useIsAdmin();

  const tabs = [
    { to: "/vpn", label: "VPN", icon: Globe },
    { to: "/support", label: "Поддержка", icon: MessageCircle },
    { to: "/profile", label: "Профиль", icon: User },
    ...(isAdmin === true ? [{ to: "/admin", label: "Админ", icon: Settings }] : []),
  ];

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col text-foreground"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(124,107,255,0.18), transparent 60%), radial-gradient(900px 500px at 100% 100%, rgba(94,231,223,0.10), transparent 60%), #0B0D14",
      }}
    >
      <header className="safe-top tg-blur shrink-0">
        <div className="flex h-12 items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.h1
              key={title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="text-[17px] font-semibold tracking-tight"
            >
              {title}
            </motion.h1>
          </AnimatePresence>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="ns-scroll h-full px-4 pt-3 pb-24"
            style={{ willChange: "transform, opacity" }}
          >
            <div className="space-y-3">{children}</div>
          </motion.div>
        </AnimatePresence>
      </main>
      <nav
        className="safe-bottom mx-3 mb-2 grid shrink-0 rounded-2xl glass"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`tg-press relative flex h-[54px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-1 rounded-xl"
                  style={{ background: "var(--gradient-primary)", opacity: 0.18 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icon className="relative z-10 h-[20px] w-[20px]" strokeWidth={2} />
              <span className="relative z-10 tracking-tight">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
