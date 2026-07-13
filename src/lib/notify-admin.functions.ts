import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

async function sendTg(chatId: string, text: string) {
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
    console.error("[notify-admin] tg sendMessage failed", res.status, body.slice(0, 500));
  }
}

export const notifyAdminAboutComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      complaintId: z.string().uuid(),
      description: z.string().min(1).max(4000),
      category: z.string().max(80).nullable().optional(),
      phone: z.string().max(80).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) {
      console.warn("[notify-admin] TELEGRAM_ADMIN_CHAT_ID not set");
      return { ok: false, reason: "no_admin_chat" };
    }

    const claims = context.claims as { email?: unknown } | undefined;
    const email = typeof claims?.email === "string" ? claims.email : null;
    const desc = data.description.slice(0, 3500);
    const text =
      `📩 <b>Новое обращение</b>\n` +
      `👤 ${escapeHtml(email ?? context.userId)}\n` +
      (data.category ? `🏷 Категория: <code>${escapeHtml(data.category)}</code>\n` : "") +
      (data.phone ? `📞 ${escapeHtml(data.phone)}\n` : "") +
      `🆔 <code>${escapeHtml(data.complaintId)}</code>\n\n` +
      `${escapeHtml(desc)}`;

    try {
      await sendTg(adminChatId, text);
      return { ok: true };
    } catch (e) {
      console.error("[notify-admin] failed", e);
      return { ok: false, reason: "send_failed" };
    }
  });