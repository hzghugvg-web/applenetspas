import { supabase } from "@/integrations/supabase/client";

type FastSessionResult = {
  hasSession: boolean;
  source: "client" | "storage";
};

export async function getFastSession(timeoutMs = 650): Promise<FastSessionResult> {
  if (typeof window === "undefined") return { hasSession: false, source: "storage" };

  const clientSession = supabase.auth.getSession().then(({ data }) => ({
    hasSession: Boolean(data.session),
    source: "client" as const,
  }));

  const storageFallback = new Promise<FastSessionResult>((resolve) => {
    window.setTimeout(() => {
      resolve({ hasSession: hasStoredSupabaseSession(), source: "storage" });
    }, timeoutMs);
  });

  return Promise.race([clientSession, storageFallback]);
}

function hasStoredSupabaseSession(): boolean {
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