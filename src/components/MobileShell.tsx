import { Link, useRouterState } from "@tanstack/react-router";
import { Shield, User, Wrench } from "lucide-react";
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
    { to: "/vpn", label: "VPN", icon: Shield },
    { to: "/profile", label: "Профиль", icon: User },
    ...(isAdmin ? [{ to: "/admin", label: "Админ", icon: Wrench }] : []),
  ];

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 flex flex-col bg-background text-foreground"
    >
      <header className="safe-top shrink-0 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex h-14 items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.h1
              key={title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="text-base font-semibold tracking-tight"
            >
              {title}
            </motion.h1>
          </AnimatePresence>
        </div>
      </header>
      <main className="ns-scroll flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="ns-scroll h-full px-4 py-4"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="safe-bottom grid shrink-0 grid-cols-3 border-t border-border bg-card/90 backdrop-blur" style={{ minHeight: "4rem" }}>
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-xs transition-all active:scale-95 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
