import { useEffect, useSyncExternalStore } from "react";

export type ColorMode = "light" | "dark";
export type DesignTheme = "midnight" | "sunset" | "forest" | "candy";
export type Motion = "none" | "medium" | "fast" | "ultra";

export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: "none",   label: "Выключены", hint: "Мгновенно, без переходов" },
  { id: "medium", label: "Плавно",    hint: "Спокойные iOS-подобные переходы" },
  { id: "fast",   label: "Живо",      hint: "Резкие поп-анимации с отскоком" },
  { id: "ultra",  label: "Кино",      hint: "Долгие переходы с мягким размытием" },
];

export const THEMES: { id: DesignTheme; label: string; accent: string; hint: string }[] = [
  { id: "midnight", label: "Aurora",   accent: "#6366F1", hint: "Северное сияние. Индиго × циан" },
  { id: "sunset",   label: "Ember",    accent: "#F97316", hint: "Тёплое золото на угольном" },
  { id: "forest",   label: "Sapphire", accent: "#3B82F6", hint: "Глубокий океан. Синий × азур" },
  { id: "candy",    label: "Rose Gold", accent: "#EC4899", hint: "Розовое золото и слива" },
];

export const MOBILE_CHROME_COLORS: Record<ColorMode, Record<DesignTheme, string>> = {
  dark: {
    midnight: "#10131F",
    sunset: "#1A120C",
    forest: "#0D1626",
    candy: "#1D101A",
  },
  light: {
    midnight: "#FFFFFF",
    sunset: "#FFFFFF",
    forest: "#FFFFFF",
    candy: "#FFFFFF",
  },
};

export const PWA_BACKGROUND_COLOR = "#10131F";

const MODE_KEY = "ns_mode";
const THEME_KEY = "ns_theme";
const MOTION_KEY = "ns_motion";

function readMode(): ColorMode {
  if (typeof localStorage === "undefined") return "dark";
  const v = localStorage.getItem(MODE_KEY);
  if (v === "light" || v === "dark") return v;
  // legacy fallback
  const legacy = localStorage.getItem("ns_theme");
  return legacy === "light" ? "light" : "dark";
}

function readTheme(): DesignTheme {
  if (typeof localStorage === "undefined") return "midnight";
  const v = localStorage.getItem(THEME_KEY);
  if (v === "midnight" || v === "sunset" || v === "forest" || v === "candy") return v;
  // legacy
  const legacy = localStorage.getItem("ns_theme");
  if (legacy === "neon") return "candy";
  return "midnight";
}

function readMotion(): Motion {
  if (typeof localStorage === "undefined") return "medium";
  const v = localStorage.getItem(MOTION_KEY);
  if (v === "none" || v === "medium" || v === "fast" || v === "ultra") return v;
  return "medium";
}

export function applyTheme(mode: ColorMode, theme: DesignTheme, motion: Motion = "medium") {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = motion;
  document.documentElement.classList.toggle("dark", mode === "dark");

  const isAuthRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/auth");
  const mobileChromeColor = isAuthRoute ? PWA_BACKGROUND_COLOR : MOBILE_CHROME_COLORS[mode][theme];
  document.documentElement.style.setProperty("--pwa-background", mobileChromeColor);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", mobileChromeColor));

  const webApp = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : undefined;
  if (webApp) {
    try { webApp.ready?.(); } catch {}
    try { webApp.expand?.(); } catch {}
    try { webApp.disableVerticalSwipes?.(); } catch {}
    try { webApp.setBackgroundColor?.(mobileChromeColor); } catch {}
    try { webApp.setHeaderColor?.(mobileChromeColor); } catch {}
    try { webApp.setBottomBarColor?.(mobileChromeColor); } catch {}
  }
}

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() {
  return `${readMode()}|${readTheme()}|${readMotion()}`;
}
function getServerSnapshot() { return "dark|midnight|medium"; }

export function useTheme() {
  const key = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mode, theme, motion] = key.split("|") as [ColorMode, DesignTheme, Motion];

  useEffect(() => { applyTheme(mode, theme, motion); }, [mode, theme, motion]);

  return {
    mode,
    theme,
    motion,
    setMode(next: ColorMode) {
      localStorage.setItem(MODE_KEY, next);
      applyTheme(next, theme, motion);
      emit();
    },
    setTheme(next: DesignTheme) {
      localStorage.setItem(THEME_KEY, next);
      applyTheme(mode, next, motion);
      emit();
    },
    setMotion(next: Motion) {
      localStorage.setItem(MOTION_KEY, next);
      applyTheme(mode, theme, next);
      emit();
    },
  };
}

// Standalone reader for initial paint helpers.
export function initThemeFromStorage() {
  applyTheme(readMode(), readTheme(), readMotion());
}
