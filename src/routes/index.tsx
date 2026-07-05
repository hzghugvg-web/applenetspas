import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Shield } from "lucide-react";
import { hasStoredSupabaseSession } from "@/lib/fast-auth";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    window.setTimeout(() => {
      if (!cancelled) {
        void navigate({ to: hasStoredSupabaseSession() ? "/vpn" : "/auth", replace: true });
      }
    }, 80);

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="fixed inset-0 grid place-items-center bg-background px-6 text-foreground">
      <div className="ns-fade flex flex-col items-center gap-4 text-center">
        <div
          className="grid h-16 w-16 place-items-center rounded-2xl"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
        >
          <Shield className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">NetSpas</h1>
          <p className="text-sm text-muted-foreground">Открываем приложение</p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    </main>
  );
}
