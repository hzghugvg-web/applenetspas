// Client-side network resilience: retries flaky fetches to Supabase (blocked/slow
// ISPs will fail SNI / drop connections) and surfaces a "slow network" hint.

const SUPABASE_HOST = (import.meta.env.VITE_SUPABASE_URL || "").replace(/^https?:\/\//, "").split("/")[0];
const RETRIES = 3;
const BASE_DELAY = 350; // ms
const SLOW_MS = 5500;
const DISMISS_KEY = "ns_slow_network_dismissed_until";
const DISMISS_MS = 30 * 60 * 1000;

type Listener = (slow: boolean) => void;
const listeners = new Set<Listener>();
let slow = false;
function setSlow(v: boolean) {
  const next = v && !isSlowHintDismissed();
  if (slow === next) return;
  slow = next;
  listeners.forEach((l) => l(v));
}
export function subscribeSlow(l: Listener): () => void {
  listeners.add(l);
  l(slow && !isSlowHintDismissed());
  return () => listeners.delete(l);
}

export function dismissSlowHint() {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    // sessionStorage can be unavailable in private modes; local state still hides it.
  }
  setSlow(false);
}

let installed = false;
export function installNetworkResilience() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")).toUpperCase();
    const isSupabase = SUPABASE_HOST && url.includes(SUPABASE_HOST);
    const shouldRetry = isSupabase && (method === "GET" || method === "HEAD");

    // Slow-network timer
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_MS);

    let lastErr: unknown;
    const tries = shouldRetry ? RETRIES : 1;
    for (let i = 0; i < tries; i++) {
      try {
        // Add per-try timeout via AbortController
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 12_000);
        const signal = init?.signal
          ? anySignal([init.signal, ctrl.signal])
          : ctrl.signal;
        const res = await orig(input, { ...init, signal });
        window.clearTimeout(to);
        if (res.status >= 500 && shouldRetry && i < tries - 1) {
          await wait(BASE_DELAY * Math.pow(2, i));
          continue;
        }
        window.clearTimeout(slowTimer);
        // successful response — clear slow hint after a bit
        if (res.ok) window.setTimeout(() => setSlow(false), 800);
        return res;
      } catch (e) {
        lastErr = e;
        if (i < tries - 1) {
          await wait(BASE_DELAY * Math.pow(2, i));
          continue;
        }
      }
    }
    window.clearTimeout(slowTimer);
    setSlow(true);
    throw lastErr instanceof Error ? lastErr : new Error("Network error");
  };
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function isSlowHintDismissed() {
  if (typeof window === "undefined") return false;
  const until = Number(window.sessionStorage.getItem(DISMISS_KEY) || 0);
  return Number.isFinite(until) && until > Date.now();
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  const onAbort = (s: AbortSignal) => ctrl.abort(s.reason);
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(s.reason); break; }
    s.addEventListener("abort", () => onAbort(s), { once: true });
  }
  return ctrl.signal;
}
