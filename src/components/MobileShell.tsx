import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings, MessageCircle } from "lucide-react";
import { Children, type ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
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

  const iosSpring = { type: "spring" as const, stiffness: 320, damping: 32, mass: 0.9 };
  const pageContainer: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04, when: "beforeChildren" } },
    exit: { opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
  };
  const cardVariants: Variants = {
    initial: { opacity: 0, y: 18, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1, transition: iosSpring },
    exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col bg-background text-foreground"
    >
      <header className="safe-top tg-blur shrink-0 border-b border-border">
        <div className="flex h-11 items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.h1
              key={title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-[17px] font-semibold tracking-tight text-foreground"
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
            variants={pageContainer}
            initial="initial"
            animate="animate"
            exit="exit"
            className="ns-scroll h-full px-4 pt-4 pb-20"
            style={{ willChange: "transform, opacity" }}
          >
            <div className="space-y-3">
              {Children.map(children, (child, i) => (
                <motion.div
                  key={i}
                  variants={cardVariants}
                  style={{ willChange: "transform, opacity" }}
                >
                  {child}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
      <nav
        className="safe-bottom grid shrink-0 border-t border-border"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          backgroundColor: "#17212B",
          borderTopColor: "#1C2C3C",
        }}
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`tg-press relative flex h-[42px] flex-col items-center justify-center gap-0.5 text-[9px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="tracking-tight">{label}</span>
              {active && (
                <motion.span
                  layoutId="tab-dot"
                  className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
