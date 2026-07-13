import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .inputValidator((data: { username: string }) => data)
  .handler(async ({ data }) => {
    const clean = (data.username ?? "").trim().replace(/^@/, "");
    if (clean.length < 3) throw new Error("invalid_username");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc(
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
      // Invalidate the code — user can retry.
      await supabaseAdmin.from("telegram_auth_codes").update({ status: "rejected", error: e?.message ?? "send_failed" }).eq("code", row.code);
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
  .inputValidator((data: { username: string; code: string; accountId?: string }) => data)
  .handler(async ({ data }) => {
    const clean = (data.username ?? "").trim().replace(/^@/, "");
    const code = (data.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("invalid_code");
    if (!clean) throw new Error("invalid_username");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If we already have a chosen accountId, don't reconsume the code —
    // just look up profiles and generate a link (the code was consumed on the first call).
    let accounts: Array<{ profile_id: string; email: string; linked_at: string | null }>;

    if (data.accountId) {
      // Second step: user picked an account after the first verify. We look
      // up by the code (which is now `confirmed`) to be sure it's the same
      // Telegram user.
      const { data: row, error: rowErr } = await supabaseAdmin
        .from("telegram_auth_codes")
        .select("telegram_user_id, status, expires_at")
        .eq("code", code)
        .maybeSingle();
      if (rowErr || !row) throw new Error("invalid_code");
      if (row.status !== "confirmed" && row.status !== "consumed") throw new Error("invalid_code");
      if (new Date(row.expires_at as any).getTime() < Date.now() - 15 * 60 * 1000) throw new Error("expired");

      const { data: list, error: listErr } = await supabaseAdmin
        .from("profiles")
        .select("id, telegram_linked_at")
        .eq("telegram_user_id", row.telegram_user_id as number);
      if (listErr || !list?.length) throw new Error("not_linked");
      const match = list.find((p: any) => p.id === data.accountId);
      if (!match) throw new Error("account_not_allowed");

      const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(match.id);
      if (uErr || !userRes?.user?.email) throw new Error("user_missing");
      accounts = [{ profile_id: match.id, email: userRes.user.email, linked_at: match.telegram_linked_at as any }];
    } else {
      const { data: rows, error } = await (supabaseAdmin as any).rpc("verify_telegram_login_code", {
        _username: clean,
        _code: code,
      });
      if (error) {
        const msg = String(error.message ?? "");
        if (/invalid_code/.test(msg)) throw new Error("invalid_code");
        if (/expired/.test(msg)) throw new Error("expired");
        throw new Error(msg || "invalid_code");
      }
      accounts = ((rows as any[]) ?? []).map((r) => ({
        profile_id: r.profile_id,
        email: r.email,
        linked_at: r.linked_at,
      }));
      if (!accounts.length) throw new Error("not_linked");
    }

    // Multiple accounts and no choice yet — ask the user to pick.
    if (accounts.length > 1 && !data.accountId) {
      return {
        status: "choose" as const,
        accounts: accounts.map((a) => ({
          id: a.profile_id,
          emailMasked: maskEmail(a.email),
          linkedAt: a.linked_at,
        })),
      };
    }

    const pick = data.accountId
      ? accounts[0]
      : accounts[0];

    const origin = process.env.PUBLIC_SITE_URL ?? "https://netspas.lovable.app";
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: pick.email,
      options: { redirectTo: `${origin}/vpn` },
    });
    const actionLink = link?.properties?.action_link;
    if (linkErr || !actionLink) throw new Error("link_failed");

    return { status: "ready" as const, actionLink };
  });