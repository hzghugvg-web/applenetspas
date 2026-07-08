import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSupportGatewayMessages,
  SUPPORT_SYSTEM_PROMPT,
  SupportAiInputSchema,
} from "@/lib/support-ai.server";

export const askSupportAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SupportAiInputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        text: "ИИ-помощник временно недоступен. Напишите оператору — он ответит.",
        escalate: true,
      };
    }

    const gatewayMessages = buildSupportGatewayMessages(data);

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
            { role: "system", content: SUPPORT_SYSTEM_PROMPT },
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