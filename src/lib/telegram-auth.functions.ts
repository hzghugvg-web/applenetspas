import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function botSendMessage(chatId: number, text: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !tgKey) throw new Error("telegram_not_configured");
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[tg] sendMessage failed", res.status, body.slice(0, 400));
    // Chat not found = user never started the bot
    if (res.status === 400 && /chat not found|bot was blocked/i.test(body)) {
      throw new Error("chat_not_found");
    }
    throw new Error("telegram_send_failed");
  }
}

async function getBotUsername(): Promise<string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !tgKey) return "netspas_bot";
  try {
    const res = await fetch(`${GATEWAY_URL}/getMe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": tgKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (res.ok) {
      const j = (await res.json()) as { result?: { username?: string } };
      if (j?.result?.username) return j.result.username;
    }
  } catch (err) {
    console.error("[tg] getMe failed", err);
  }
  return "netspas_bot";
}

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

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const name = email.slice(0, at);
  const dom = email.slice(at + 1);
  const shown = name.length <= 2 ? name[0] + "•" : name[0] + "•••" + name[name.length - 1];
  return `${shown}@${dom}`;
}

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
    } catch (e: any) {
      if (e?.message === "chat_not_found") throw new Error("chat_not_found");
      throw new Error("telegram_send_failed");
    }

    return { ok: true, expiresAt: row.expires_at };
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