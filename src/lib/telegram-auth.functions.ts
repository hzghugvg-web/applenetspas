import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { botSendMessage, getBotUsername, maskEmail } from "@/lib/telegram-auth.server";

/** Start "link Telegram" — must be signed in. Returns a code + deep link. */
export const startLinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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

/**
 * Send a 6-digit login code as a Telegram DM to the given @username.
 * Requires that the Telegram account has previously been linked to a VPNSUS
 * profile in the app (via "link Telegram" flow). No auth required to call.
 */
export const sendTelegramLoginCode = createServerFn({ method: "POST" })
  .validator((data: { username: string }) => data)
  .handler(async ({ data }) => {
    const clean = (data.username ?? "").trim().replace(/^@/, "");
    if (clean.length < 3) throw new Error("invalid_username");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("auth_not_configured");
    const supabasePublic = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await (supabasePublic as any).rpc(
      "create_telegram_login_by_username",
      { _username: clean },
    );
    if (error) {
      const msg = String(error.message ?? "");
      if (/not_linked/.test(msg)) throw new Error("not_linked");
      if (/invalid_username/.test(msg)) throw new Error("invalid_username");
      throw new Error(msg || "code_failed");
    }
    const row = (rows as Array<{ code: string; telegram_user_id: number; expires_at: string }> | null)?.[0];
    if (!row) throw new Error("not_linked");

    const text =
      `🔐 <b>Код для входа в VPNSUS</b>\n\n` +
      `Твой код: <code>${row.code}</code>\n\n` +
      `Введи его в приложении, чтобы войти. Код действует 10 минут.\n` +
      `Если это не ты — просто проигнорируй это сообщение.`;

    try {
      await botSendMessage(row.telegram_user_id, text);
      return { ok: true, expiresAt: row.expires_at, code: null, delivery: "telegram" as const };
    } catch (e: any) {
      console.error("[tg-login] direct code delivery failed; using bot-confirm fallback", e?.message ?? e);
      return { ok: true, expiresAt: row.expires_at, code: row.code, delivery: "manual" as const };
    }
  });

/**
 * Fallback for Telegram delivery failures: user sees the code in the app,
 * sends it to the bot from the linked Telegram account, then the app reads
 * only codes already confirmed by the bot webhook.
 */
export const getConfirmedTelegramLoginAccounts = createServerFn({ method: "POST" })
  .validator((data: { username: string; code: string }) => data)
  .handler(async ({ data }) => {
    const clean = (data.username ?? "").trim().replace(/^@/, "");
    const code = (data.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("invalid_code");
    if (!clean) throw new Error("invalid_username");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("auth_not_configured");
    const supabasePublic = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: rows, error } = await (supabasePublic as any).rpc("get_confirmed_telegram_login_accounts", {
      _username: clean,
      _code: code,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (/invalid_code/.test(msg)) throw new Error("invalid_code");
      if (/invalid_username/.test(msg)) throw new Error("invalid_username");
      throw new Error(msg || "invalid_code");
    }

    const accounts = ((rows as any[]) ?? []).map((r) => ({
      profile_id: r.profile_id,
      email: r.email,
      linked_at: r.linked_at,
    }));
    if (!accounts.length) return { status: "pending" as const };

    if (accounts.length > 1) {
      return {
        status: "choose" as const,
        accounts: accounts.map((a) => ({
          id: a.profile_id,
          email: a.email,
          emailMasked: maskEmail(a.email),
          linkedAt: a.linked_at,
        })),
      };
    }

    const pick = accounts[0];
    return {
      status: "password" as const,
      account: {
        id: pick.profile_id,
        email: pick.email,
        emailMasked: maskEmail(pick.email),
        linkedAt: pick.linked_at,
      },
    };
  });

/**
 * Verify a code the user typed in the web app for Telegram username login.
 * If exactly one profile is linked to that Telegram, immediately returns
 * a magic-link URL for that account. If two profiles are linked, returns
 * a chooser so the user can pick which account to sign into.
 */
export const verifyTelegramLoginCode = createServerFn({ method: "POST" })
  .validator((data: { username: string; code: string }) => data)
  .handler(async ({ data }) => {
    const clean = (data.username ?? "").trim().replace(/^@/, "");
    const code = (data.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("invalid_code");
    if (!clean) throw new Error("invalid_username");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("auth_not_configured");
    const supabasePublic = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: rows, error } = await (supabasePublic as any).rpc("verify_telegram_login_code", {
      _username: clean,
      _code: code,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (/invalid_code/.test(msg)) throw new Error("invalid_code");
      if (/expired/.test(msg)) throw new Error("expired");
      throw new Error(msg || "invalid_code");
    }
    const accounts = ((rows as any[]) ?? []).map((r) => ({
      profile_id: r.profile_id,
      email: r.email,
      linked_at: r.linked_at,
    }));
    if (!accounts.length) throw new Error("not_linked");

    if (accounts.length > 1) {
      return {
        status: "choose" as const,
        accounts: accounts.map((a) => ({
          id: a.profile_id,
          email: a.email,
          emailMasked: maskEmail(a.email),
          linkedAt: a.linked_at,
        })),
      };
    }

    const pick = accounts[0];
    return {
      status: "password" as const,
      account: {
        id: pick.profile_id,
        email: pick.email,
        emailMasked: maskEmail(pick.email),
        linkedAt: pick.linked_at,
      },
    };
  });

/**
 * Finalize a Telegram-based sign-in and return a Supabase session.
 * The Telegram code + linked @username IS the confirmation — no password needed.
 * Called after verifyTelegramLoginCode / getConfirmedTelegramLoginAccounts have
 * proven the code is valid; here we re-check the binding, then mint a session
 * for the chosen profile via a magiclink hashed_token exchanged into a session.
 */
export const finalizeTelegramSignIn = createServerFn({ method: "POST" })
  .validator((data: { username: string; code: string; profileId: string }) => data)
  .handler(async ({ data }) => {
    const clean = (data.username ?? "").trim().replace(/^@/, "").toLowerCase();
    const code = (data.code ?? "").trim();
    const profileId = (data.profileId ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("invalid_code");
    if (clean.length < 3) throw new Error("invalid_username");
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("invalid_profile");

    const url = process.env.SUPABASE_URL;
    const pubKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !pubKey) throw new Error("auth_not_configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Re-check the code binding server-side (defense in depth).
    const { data: codeRow, error: codeErr } = await (supabaseAdmin as any)
      .from("telegram_auth_codes")
      .select("telegram_user_id, telegram_username, status, expires_at, purpose")
      .eq("code", code)
      .maybeSingle();
    if (codeErr) throw new Error(codeErr.message);
    if (!codeRow) throw new Error("invalid_code");
    if (codeRow.purpose !== "login") throw new Error("invalid_code");
    if (new Date(codeRow.expires_at).getTime() <= Date.now()) throw new Error("expired");
    if (!["pending", "confirmed"].includes(String(codeRow.status))) throw new Error("invalid_code");
    if ((codeRow.telegram_username ?? "").toLowerCase() !== clean) throw new Error("invalid_code");

    // Ensure the chosen profile is actually linked to this Telegram account.
    const { data: profile, error: profErr } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, telegram_user_id")
      .eq("id", profileId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    if (!profile || String(profile.telegram_user_id ?? "") !== String(codeRow.telegram_user_id)) {
      throw new Error("not_linked");
    }

    // Consume the code so it can't be replayed.
    await (supabaseAdmin as any)
      .from("telegram_auth_codes")
      .delete()
      .eq("code", code);

    // Get the auth email for this profile.
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profileId);
    if (userErr) throw new Error(userErr.message);
    const email = userRes.user?.email;
    if (!email) throw new Error("auth_not_configured");

    // Mint a magiclink and exchange the hashed_token for a real session server-side.
    const { data: linkRes, error: linkErr } = await (supabaseAdmin as any).auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw new Error(linkErr.message);
    const hashedToken: string | undefined = linkRes?.properties?.hashed_token;
    if (!hashedToken) throw new Error("link_failed");

    const authClient = createClient<Database>(url, pubKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: sess, error: otpErr } = await authClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedToken,
    });
    if (otpErr) throw new Error(otpErr.message);
    const accessToken = sess.session?.access_token;
    const refreshToken = sess.session?.refresh_token;
    if (!accessToken || !refreshToken) throw new Error("session_missing");

    return { accessToken, refreshToken, userId: sess.user?.id ?? profileId };
  });