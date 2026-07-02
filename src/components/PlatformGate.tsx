import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Shield, Share, Plus, Ban } from "lucide-react";

type Platform = "loading" | "pass" | "ios-install" | "android-install";

function detect(): Exclude<Platform, "loading"> {
  if (typeof window === "undefined") return "pass";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as any).standalone === true;
  if (isIOS) return standalone ? "pass" : "ios-install";
  if (isAndroid) return standalone ? "pass" : "android-install";
  return "pass";
}

export function PlatformGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Platform>("loading");

  useEffect(() => {
    setState(detect());
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setState(detect());
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  if (state === "loading") return null;
  if (state === "pass") return <>{children}</>;

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 text-center text-foreground"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm space-y-5"
      >
        {state === "ios-install" ? (
          <>
            <div
              className="mx-auto grid h-16 w-16 place-items-center rounded-2xl"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
            >
              <Shield className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold">Установите NetSpas</h1>
            <p className="text-sm text-muted-foreground">
              Для продолжения установите приложение на iPhone.
            </p>
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-left text-sm">
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold">1</div>
                <div className="flex-1">
                  Откройте сайт в <span className="font-medium">Safari</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold">2</div>
                <div className="flex-1 flex items-center gap-2">
                  Нажмите <Share className="h-4 w-4 text-primary" /> «Поделиться»
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold">3</div>
                <div className="flex-1 flex items-center gap-2">
                  Выберите <Plus className="h-4 w-4 text-primary" /> «На экран Домой»
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold">4</div>
                <div className="flex-1">
                  Откройте <span className="font-medium">NetSpas</span> с экрана «Домой»
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Доступ через браузер закрыт.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-destructive/15">
              <Ban className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold">Устройство не поддерживается</h1>
            <p className="text-sm text-muted-foreground">
              NetSpas недоступен на Android-устройствах. Используйте iPhone или компьютер.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}