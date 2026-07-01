import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, User, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence, motion } from "framer-motion";

interface Props { title: string; children: ReactNode; }

export function MobileShell({ title, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (mounted) setIsAdmin(!!data);
    })();
    return () => { mounted = false; };
  }, []);

  const tabs = [
    { to: "/vpn", label: "VPN", icon: Globe },
    { to: "/profile", label: "Профиль", icon: User },
    ...(isAdmin ? [{ to: "/admin", label: "Админ", icon: Settings }] : []),
  ];

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
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="ns-scroll h-full px-4 py-4"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <nav
        className="safe-bottom tg-blur grid shrink-0 border-t border-border"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`tg-press relative flex h-[50px] flex-col items-center justify-center gap-0.5 text-[10px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={1.8} />
              <span className="tracking-tight">{label}</span>
              {active && (
                <motion.span
                  layoutId="tab-dot"
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-primary"
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
