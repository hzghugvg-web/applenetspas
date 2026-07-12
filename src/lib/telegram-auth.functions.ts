import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Housekeeping: purge stale codes
    await supabaseAdmin
      .from("telegram_auth_codes")
      .delete()
      .lt("expires_at", new Date().toISOString());

    const code = genCode();
    const expiresAt = new Date(Date.now() + codeTtlMs).toISOString();

    const { error } = await supabaseAdmin.from("telegram_auth_codes").insert({
      code,
      purpose: "link",
      user_id: context.userId,
      status: "pending",
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    const botUsername = await getBotUsername();
    return {
      code,
      botUsername,
      deepLink: `https://t.me/${botUsername}?start=link_${code}`,
      expiresAt,
    };
  });

/** Poll status of a link attempt — signed in. */
export const pollLinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { code: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("telegram_auth_codes")
      .select("status, telegram_username, expires_at, user_id, purpose")
      .eq("code", data.code)
      .maybeSingle();
    if (!row || row.user_id !== context.userId || row.purpose !== "link") {
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        telegram_user_id: null,
        telegram_username: null,
        telegram_linked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Read current TG binding for the profile card. */
export const getTelegramBinding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("telegram_user_id, telegram_username, telegram_linked_at")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      linked: Boolean(data?.telegram_user_id),
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabaseAdmin
    .from("telegram_auth_codes")
    .delete()
    .lt("expires_at", new Date().toISOString());

  const code = genCode();
  const expiresAt = new Date(Date.now() + codeTtlMs).toISOString();

  const { error } = await supabaseAdmin.from("telegram_auth_codes").insert({
    code,
    purpose: "login",
    status: "pending",
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);

  const botUsername = await getBotUsername();
  return {
    code,
    botUsername,
    deepLink: `https://t.me/${botUsername}?start=login_${code}`,
    expiresAt,
  };
});

/** Public: poll Telegram login. When confirmed by bot, returns a magic-link URL. */
export const pollTelegramLogin = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("telegram_auth_codes")
      .select("status, user_id, action_link, expires_at, purpose, error")
      .eq("code", data.code)
      .maybeSingle();

    if (!row || row.purpose !== "login") return { status: "expired" as const };
    if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
      return { status: "expired" as const };
    }
    if (row.status === "rejected") {
      return { status: "rejected" as const, error: row.error ?? null };
    }

    if (row.status === "confirmed" && row.user_id) {
      // Generate a one-time magic link (action_link) that logs the user in.
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