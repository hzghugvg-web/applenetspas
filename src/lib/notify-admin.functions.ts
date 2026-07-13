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
    z.object({ complaintId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) {
      console.warn("[notify-admin] TELEGRAM_ADMIN_CHAT_ID not set");
      return { ok: false, reason: "no_admin_chat" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: c, error } = await supabaseAdmin
      .from("complaints")
      .select("id, user_id, description, category, phone, video_url, created_at")
      .eq("id", data.complaintId)
      .maybeSingle();
    if (error || !c) {
      console.error("[notify-admin] complaint not found", error);
      return { ok: false, reason: "not_found" };
    }
    if (c.user_id !== context.userId) {
      return { ok: false, reason: "forbidden" };
    }

    let email: string | null = null;
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(c.user_id);
      email = u.user?.email ?? null;
    } catch { /* ignore */ }

    const desc = (c.description ?? "").slice(0, 3500);
    const text =
      `📩 <b>Новое обращение</b>\n` +
      `👤 ${escapeHtml(email ?? c.user_id)}\n` +
      (c.category ? `🏷 Категория: <code>${escapeHtml(c.category)}</code>\n` : "") +
      (c.phone ? `📞 ${escapeHtml(c.phone)}\n` : "") +
      `🆔 <code>${escapeHtml(c.id)}</code>\n\n` +
      `${escapeHtml(desc)}`;

    try {
      await sendTg(adminChatId, text);
      return { ok: true };
    } catch (e) {
      console.error("[notify-admin] failed", e);
      return { ok: false, reason: "send_failed" };
    }
  });