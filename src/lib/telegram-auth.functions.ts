import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/** Start "link Telegram" — must be signed in. Returns a code + deep link. */
export const startLinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const genCode = () => Math.floor(100000 + Math.random() * 900000).toString();
    const codeTtlMs = 10 * 60 * 1000;
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
    const { data: rows, error } = await context.supabase.rpc("create_telegram_auth_code", {
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
    const { data: rows, error } = await context.supabase.rpc("get_telegram_link_status", {
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
    const { error } = await context.supabase.rpc("unlink_my_telegram");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Read current TG binding for the profile card. */
export const getTelegramBinding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_my_telegram_binding");
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
  const genCode = () => Math.floor(100000 + Math.random() * 900000).toString();
  const codeTtlMs = 10 * 60 * 1000;
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
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );

  const { data: rows, error } = await supabasePublic.rpc("create_telegram_auth_code", {
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
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabasePublic.rpc("get_telegram_login_status", {
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

    if (row.status === "confirmed" && row.user_id) {
      // Generate a one-time magic link (action_link) that logs the user in.
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { status: "rejected" as const, error: "server_key_missing" };
      }
      const { data: userRes, error: getUserErr } = await supabaseAdmin.auth.admin.getUserById(
        row.user_id,
      );
      if (getUserErr || !userRes?.user?.email) {
        return { status: "rejected" as const, error: "user_missing" };
      }
      const origin = process.env.PUBLIC_SITE_URL ?? "https://netspas.lovable.app";
      const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userRes.user.email,
        options: { redirectTo: `${origin}/vpn` },
      });
      if (linkErr || !link?.properties?.action_link) {
        return { status: "rejected" as const, error: linkErr?.message ?? "link_failed" };
      }
      const actionLink = link.properties.action_link;
      await supabaseAdmin
        .from("telegram_auth_codes")
        .update({
          status: "consumed",
          action_link: actionLink,
          consumed_at: new Date().toISOString(),
        })
        .eq("code", data.code);
      return { status: "ready" as const, actionLink };
    }

    return { status: row.status as "pending" | "consumed" };
  });