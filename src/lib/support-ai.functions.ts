import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...data.messages,
        ],
      }),
    });

    if (res.status === 429) {
      return { text: "Слишком много запросов. Попробуйте чуть позже или напишите оператору.", escalate: false };
    }
    if (res.status === 402) {
      return { text: "ИИ-помощник временно недоступен. Соединяю с оператором.", escalate: true };
    }
    if (!res.ok) {
      return { text: "Не удалось получить ответ ИИ. Могу позвать оператора.", escalate: true };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
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