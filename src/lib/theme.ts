import { useEffect, useSyncExternalStore } from "react";

export type ColorMode = "light" | "dark";
export type DesignTheme = "midnight" | "sunset" | "forest" | "candy";

export const THEMES: { id: DesignTheme; label: string; accent: string; hint: string }[] = [
  { id: "midnight", label: "Midnight", accent: "#7C6BFF", hint: "Фиолетово-мятный, по умолчанию" },
  { id: "sunset",   label: "Sunset",   accent: "#FB7185", hint: "Розово-оранжевый закат" },
  { id: "forest",   label: "Forest",   accent: "#10B981", hint: "Зелёный, спокойный минимализм" },
  { id: "candy",    label: "Candy",    accent: "#EC4899", hint: "Яркая неоновая карамель" },
];

const MODE_KEY = "ns_mode";
const THEME_KEY = "ns_theme";

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

export function applyTheme(mode: ColorMode, theme: DesignTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() {
  return `${readMode()}|${readTheme()}`;
}
function getServerSnapshot() { return "dark|midnight"; }

export function useTheme() {
  const key = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mode, theme] = key.split("|") as [ColorMode, DesignTheme];

  useEffect(() => { applyTheme(mode, theme); }, [mode, theme]);

  return {
    mode,
    theme,
    setMode(next: ColorMode) {
      localStorage.setItem(MODE_KEY, next);
      applyTheme(next, theme);
      emit();
    },
    setTheme(next: DesignTheme) {
      localStorage.setItem(THEME_KEY, next);
      applyTheme(mode, next);
      emit();
    },
  };
}

// Standalone reader for initial paint helpers.
export function initThemeFromStorage() {
  applyTheme(readMode(), readTheme());
}
