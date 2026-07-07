import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AttachmentSchema = z.object({
  kind: z.enum(["image", "video"]),
  url: z.string().url().max(2000),
  name: z.string().max(200).optional(),
});

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
  attachments: z.array(AttachmentSchema).max(6).optional(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(30),
});

const SYSTEM_PROMPT = `Ты — ИИ-помощник поддержки сервиса NetSpas (VPN-сервис на протоколе VLESS).
Отвечай кратко и по делу на русском языке, дружелюбным тоном.

Что ты умеешь:
- Помогать с подключением VPN на iOS (FoXray, Shadowrocket, Streisand) и Android (v2rayNG, Hiddify).
- Объяснять, как получить конфигурацию в разделе VPN, что такое кулдаун 144 часа.
- Отвечать на общие вопросы о сервисе, подписке (30 дней), удалении аккаунта.
- Подсказывать, где найти нужный раздел приложения (VPN, Мой VPN, Настройки, Поддержка).

Что ты умеешь с вложениями:
- Пользователь может прикрепить фото — ты его ВИДИШЬ и можешь описать/помочь.
- Видео ты не видишь: если пользователь прикрепил видео, честно скажи, что видео сможет посмотреть только оператор, и предложи передать обращение.

Что ты НЕ можешь и должен передать оператору:
- Конкретные технические проблемы с конкретным ключом пользователя.
- Запросы на досрочную выдачу ключа, возврат, изменение подписки.
- Жалобы на неработающий VPN у конкретного пользователя (нужно видео).
- Любые вопросы про оплату, аккаунт, персональные данные пользователя.
- Ситуации, когда пользователь явно просит человека / оператора / администратора.

ВАЖНО: если вопрос требует человека — заверши свой ответ в САМОЙ ПОСЛЕДНЕЙ строке ровно одним токеном:
[ESCALATE]

Без него — не пиши. Не добавляй объяснений про этот токен.
Если можешь помочь сам — просто ответь, без токена.`;

export const askSupportAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        text: "ИИ-помощник временно недоступен. Напишите оператору — он ответит.",
        escalate: true,
      };
    }

    const gatewayMessages = data.messages.map((m) => {
      const imgs = (m.attachments ?? []).filter((a) => a.kind === "image");
      const vids = (m.attachments ?? []).filter((a) => a.kind === "video");
      if (m.role === "assistant" || (imgs.length === 0 && vids.length === 0)) {
        return { role: m.role, content: m.content || " " };
      }
      const parts: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [];
      const textPieces: string[] = [];
      if (m.content?.trim()) textPieces.push(m.content.trim());
      if (vids.length > 0) {
        textPieces.push(
          `[Пользователь прикрепил ${vids.length === 1 ? "видео" : "видео-файлы"}: ${vids
            .map((v) => v.name || "video")
            .join(", ")}. Ты видео не видишь — предложи передать оператору, чтобы он посмотрел.]`,
        );
      }
      parts.push({ type: "text", text: textPieces.join("\n\n") || " " });
      for (const img of imgs) parts.push({ type: "image_url", image_url: { url: img.url } });
      return { role: m.role, content: parts };
    });

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...gatewayMessages,
          ],
        }),
      });
    } catch (err) {
      console.error("[support-ai] fetch failed", err);
      return { text: "Не удалось связаться с ИИ. Могу позвать оператора?", escalate: true };
    }

    if (res.status === 429) {
      return { text: "Слишком много запросов. Попробуйте чуть позже или напишите оператору.", escalate: false };
    }
    if (res.status === 402) {
      return { text: "ИИ-помощник временно недоступен. Соединяю с оператором.", escalate: true };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[support-ai] gateway error", res.status, body.slice(0, 500));
      return { text: "Не удалось получить ответ ИИ. Могу позвать оператора.", escalate: true };
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = await res.json();
    } catch (err) {
      console.error("[support-ai] json parse failed", err);
      return { text: "Не удалось обработать ответ ИИ. Позвать оператора?", escalate: true };
    }
    let text = json.choices?.[0]?.message?.content?.trim() ?? "";
    let escalate = false;
    if (/\[ESCALATE\]\s*$/i.test(text)) {
      escalate = true;
      text = text.replace(/\[ESCALATE\]\s*$/i, "").trim();
    }
    if (!text) {
      text = "Я не совсем понял вопрос. Хотите, я передам его оператору?";
      escalate = true;
    }
    return { text, escalate };
  });