const CACHE_KEY = "ns_offline_my_vpn_v1";

export type OfflineProfile = {
  subscription_from: string | null;
  subscription_until: string | null;
};

export type OfflineConfig = {
  id: string;
  link: string;
  title?: string | null;
  issuedAt: string;
  directionId: string | null;
};

export type OfflineDirection = {
  id: string;
  name: string;
  flag: string | null;
};

export type OfflineMyVpnSnapshot = {
  savedAt: string;
  profile: OfflineProfile | null;
  configs: OfflineConfig[];
  dirs: Record<string, OfflineDirection>;
};

export function readOfflineMyVpn(): OfflineMyVpnSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineMyVpnSnapshot;
    if (!parsed || !Array.isArray(parsed.configs) || typeof parsed.dirs !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOfflineMyVpn(snapshot: Omit<OfflineMyVpnSnapshot, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage can be full or blocked; the app still works online.
  }
}

export function hasOfflineActiveVpn(): { from: string | null; until: string } | null {
  const cached = readOfflineMyVpn();
  const until = cached?.profile?.subscription_until;
  if (!until) return null;
  if (new Date(until).getTime() <= Date.now()) return null;
  return { from: cached.profile?.subscription_from ?? null, until };
}