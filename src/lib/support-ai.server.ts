import { z } from "zod";

const AttachmentSchema = z.object({
  kind: z.enum(["image", "video"]),
  // Accepts either a signed https URL or an inline data: URL for images
  // (downscaled JPEG, typically <500 KB). Cap at ~4 MB base64.
  url: z
    .string()
    .max(6_000_000)
    .refine((v) => v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:"), {
      message: "url must be http(s) or data URL",
    }),
  name: z.string().max(200).optional(),
});

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
  attachments: z.array(AttachmentSchema).max(6).optional(),
});

export const SupportAiInputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(30),
});

export type SupportAiInput = z.infer<typeof SupportAiInputSchema>;

export const SUPPORT_SYSTEM_PROMPT = `Ты — ИИ-помощник поддержки сервиса NetSpas (VPN-сервис на протоколе VLESS).
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

type GatewayMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      >;
    };

export function buildSupportGatewayMessages(input: SupportAiInput): GatewayMessage[] {
  return input.messages.map((m) => {
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
    return { role: "user", content: parts };
  });
}