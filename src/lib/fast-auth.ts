type FastSessionResult = {
  hasSession: boolean;
  source: "storage";
};

export async function getFastSession(timeoutMs = 650): Promise<FastSessionResult> {
  if (timeoutMs > 0 && typeof window !== "undefined") {
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(timeoutMs, 50)));
  }
  return { hasSession: hasStoredSupabaseSession(), source: "storage" };
}

export function hasStoredSupabaseSession(): boolean {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as {
        access_token?: string;
        expires_at?: number;
        currentSession?: { access_token?: string; expires_at?: number };
      };

      const session = parsed.currentSession ?? parsed;
      if (!session.access_token) continue;
      if (typeof session.expires_at === "number" && session.expires_at <= nowSeconds + 30) continue;

      return true;
    }
  } catch {
    return false;
  }

  return false;
}