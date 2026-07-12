import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/** Start "link Telegram" — must be signed in. Returns a code + deep link. */
export const startLinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const getBotUsername = async () => {
      const lovableKey = process.env.LOVABLE_API_KEY;
      const tgKey = process.env.TELEGRAM_API_KEY;
      if (!lovableKey || !tgKey) return "netspas_bot";
      try {
        const res = await fetch("https://connector-gateway.lovable.dev/telegram/getMe", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": tgKey,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        if (res.ok) {
          const j = (await res.json()) as { ok?: boolean; result?: { username?: string } };
          if (j?.result?.username) return j.result.username;
        }
      } catch (err) {
        console.error("[tg] getMe failed", err);
      }
      return "netspas_bot";
    };
    const { data: rows, error } = await (context.supabase as any).rpc("create_telegram_auth_code", {
      _purpose: "link",
    });
    if (error) throw new Error(error.message);
    const row = (rows as Array<{ code: string; expires_at: string }> | null)?.[0];
    if (!row) throw new Error("code_failed");

    const botUsername = await getBotUsername();
    return {
      code: row.code,
      botUsername,
      deepLink: `https://t.me/${botUsername}?start=link_${row.code}`,
      expiresAt: row.expires_at,
    };
  });

/** Poll status of a link attempt — signed in. */
export const pollLinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { code: string }) => data)
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("get_telegram_link_status", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = (rows as Array<{ status: string; telegram_username: string | null; expires_at: string }> | null)?.[0];
    if (!row) {
      return { status: "expired" as const };
    }
    if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
      return { status: "expired" as const };
    }
    return {
      status: row.status as "pending" | "confirmed" | "consumed" | "expired" | "rejected",
      telegramUsername: row.telegram_username ?? null,
    };
  });

/** Unlink Telegram from current account. */
export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as any).rpc("unlink_my_telegram");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Read current TG binding for the profile card. */
export const getTelegramBinding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("get_my_telegram_binding");
    if (error) throw new Error(error.message);
    const data = (rows as Array<{ linked: boolean; telegram_username: string | null; telegram_linked_at: string | null }> | null)?.[0];
    return {
      linked: Boolean(data?.linked),
      username: data?.telegram_username ?? null,
      linkedAt: data?.telegram_linked_at ?? null,
    };
  });

/** Public: start Telegram login flow (no auth). Returns code + deep link. */
export const startTelegramLogin = createServerFn({ method: "POST" }).handler(async () => {
  const getBotUsername = async () => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const tgKey = process.env.TELEGRAM_API_KEY;
    if (!lovableKey || !tgKey) return "netspas_bot";
    try {
      const res = await fetch("https://connector-gateway.lovable.dev/telegram/getMe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": tgKey,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (res.ok) {
        const j = (await res.json()) as { ok?: boolean; result?: { username?: string } };
        if (j?.result?.username) return j.result.username;
      }
    } catch (err) {
      console.error("[tg] getMe failed", err);
    }
    return "netspas_bot";
  };
  const supabasePublic = createClient<Database>(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );

  const { data: rows, error } = await (supabasePublic as any).rpc("create_telegram_auth_code", {
    _purpose: "login",
  });
  if (error) throw new Error(error.message);
  const row = (rows as Array<{ code: string; expires_at: string }> | null)?.[0];
  if (!row) throw new Error("code_failed");

  const botUsername = await getBotUsername();
  return {
    code: row.code,
    botUsername,
    deepLink: `https://t.me/${botUsername}?start=login_${row.code}`,
    expiresAt: row.expires_at,
  };
});

/** Public: poll Telegram login. When confirmed by bot, returns a magic-link URL. */
export const pollTelegramLogin = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const supabasePublic = createClient<Database>(
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await (supabasePublic as any).rpc("get_telegram_login_status", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = (rows as Array<{
      status: string;
      user_id: string | null;
      action_link: string | null;
      expires_at: string;
      error: string | null;
    }> | null)?.[0];

    if (!row) return { status: "expired" as const };
    if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
      return { status: "expired" as const };
    }
    if (row.status === "rejected") {
      return { status: "rejected" as const, error: row.error ?? null };
    }

    if ((row.status === "confirmed" || row.status === "consumed") && row.action_link) {
      return { status: "ready" as const, actionLink: row.action_link };
    }

    if (row.status === "confirmed" && !row.action_link) {
      return { status: "rejected" as const, error: "link_failed" };
    }

    return { status: row.status as "pending" | "consumed" };
  });