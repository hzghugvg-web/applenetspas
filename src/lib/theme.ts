import { useEffect, useSyncExternalStore } from "react";

export type ColorMode = "light" | "dark";
export type DesignTheme = "midnight" | "sunset" | "forest" | "candy";
export type Motion = "none" | "medium" | "fast" | "ultra";

export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: "none",   label: "Без анимаций", hint: "Без плавных переходов и анимаций" },
  { id: "medium", label: "Средний",      hint: "Обычные анимации" },
  { id: "fast",   label: "Быстро",       hint: "Быстрые и плавные анимации" },
  { id: "ultra",  label: "Ультра",       hint: "Очень плавные и качественные анимации" },
];

export const THEMES: { id: DesignTheme; label: string; accent: string; hint: string }[] = [
  { id: "midnight", label: "Midnight", accent: "#7C6BFF", hint: "Фиолетово-мятный, по умолчанию" },
  { id: "sunset",   label: "Sunset",   accent: "#FB7185", hint: "Розово-оранжевый закат" },
  { id: "forest",   label: "Forest",   accent: "#10B981", hint: "Зелёный, спокойный минимализм" },
  { id: "candy",    label: "Candy",    accent: "#EC4899", hint: "Яркая неоновая карамель" },
];

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
