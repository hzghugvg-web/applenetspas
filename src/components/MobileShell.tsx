import { Link, useRouterState } from "@tanstack/react-router";
import { Shield, User, Wrench } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      <header className="flex h-14 shrink-0 items-center justify-center border-b border-border bg-card/80 backdrop-blur px-4">
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      </header>
      <main key={pathname} className="ns-scroll ns-fade flex-1 px-4 py-4">
        {children}
      </main>
      <nav className="grid h-16 shrink-0 grid-cols-3 border-t border-border bg-card/90 backdrop-blur">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
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
