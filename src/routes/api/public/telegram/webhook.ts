import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function deriveSecret(apiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${apiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

async function tg(method: string, payload: Record<string, unknown>) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !tgKey) throw new Error("Telegram keys not configured");
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[tg] ${method} failed`, res.status, body.slice(0, 500));
  }
  return res;
}

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: "🚀 Получить VPN-доступ", callback_data: "get_vpn" }],
    [{ text: "📖 Как установить и настроить", callback_data: "howto" }],
    [{ text: "❓ Частые вопросы", callback_data: "faq" }],
    [{ text: "📩 Связаться с поддержкой", callback_data: "support" }],
    [{ text: "💰 Поддержать проект", callback_data: "donate" }],
  ],
};

const BACK_MENU = {
  inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "menu" }]],
};

const WELCOME =
  "Привет! Я бот NetSpas — помогу тебе получить свободный доступ в интернет. Выбери, что нужно:";

const HOWTO =
  "📖 <b>Как установить и настроить</b>\n\n" +
  "1️⃣ Скачай <b>Outline Client</b>:\n" +
  "• iOS: https://apps.apple.com/app/outline-app/id1356177741\n" +
  "• Android: https://play.google.com/store/apps/details?id=org.outline.android.client\n" +
  "• Windows/macOS/Linux: https://getoutline.org/get-started/\n\n" +
  "2️⃣ Скопируй ключ, который я тебе прислал (начинается с <code>ss://</code>).\n\n" +
  "3️⃣ Открой Outline — он сам предложит добавить ключ из буфера. Нажми «Добавить сервер».\n\n" +
  "4️⃣ Нажми «Подключить» — готово, интернет без границ! 🌍";

const FAQ_TEXT =
  "❓ <b>Частые вопросы</b>\n\n" +
  "<b>Нужно ли включать VPN, чтобы открыть сайт?</b>\n" +
  "Нет, сайт netspas.vercel.app открывается у всех.\n\n" +
  "<b>Это безопасно?</b>\n" +
  "Да, логи не храним.\n\n" +
  "<b>Ключ перестал работать?</b>\n" +
  "Просто запросите новый — нажми «🚀 Получить VPN-доступ» в меню.";

const DONATE_TEXT =
  "💰 Спасибо, что помогаешь NetSpas! 💙\n\n" +
  "Реквизиты для поддержки:\n" +
  "<code>2204 1201 4171 2709</code>\n\n" +
  "Любая сумма помогает нам оплачивать серверы и добавлять новые направления. Спасибо!";

const SUPPORT_PROMPT =
  "📩 Напиши свой вопрос <b>ответом на это сообщение</b> — я передам его администратору. " +
  "Можно приложить скриншот.";

const SUPPORT_PROMPT_PLAIN = "Напиши свой вопрос ответом на это сообщение";

function getVpnMessage(): string {
  const key = process.env.VPN_ACCESS_KEY;
  if (!key) {
    return (
      "🚀 <b>Твой ключ доступа</b>\n\n" +
      "Ключи ещё не настроены. Напиши в поддержку — админ выдаст ключ вручную."
    );
  }
  return (
    "🚀 <b>Твой ключ доступа</b>\n\n" +
    `<code>${key}</code>\n\n` +
    "📱 Скачай <b>Outline Client</b>, добавь этот ключ — готово!\n" +
    "Подробная инструкция — в разделе «📖 Как установить и настроить»."
  );
}

async function sendMenu(chatId: number, text = WELCOME) {
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: MAIN_MENU,
    disable_web_page_preview: true,
  });
}

async function handleCallback(cb: {
  id: string;
  data?: string;
  from: { id: number; first_name?: string; username?: string };
  message?: { chat: { id: number }; message_id: number };
}) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  const chatId = cb.message?.chat.id;
  if (!chatId) return;
  const data = cb.data ?? "";

  if (data === "menu") {
    await sendMenu(chatId);
    return;
  }
  if (data === "get_vpn") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: getVpnMessage(),
      parse_mode: "HTML",
      reply_markup: BACK_MENU,
      disable_web_page_preview: true,
    });
    return;
  }
  if (data === "howto") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: HOWTO,
      parse_mode: "HTML",
      reply_markup: BACK_MENU,
      disable_web_page_preview: true,
    });
    return;
  }
  if (data === "faq") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: FAQ_TEXT,
      parse_mode: "HTML",
      reply_markup: BACK_MENU,
    });
    return;
  }
  if (data === "donate") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: DONATE_TEXT,
      parse_mode: "HTML",
      reply_markup: BACK_MENU,
    });
    return;
  }
  if (data === "support") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: SUPPORT_PROMPT,
      parse_mode: "HTML",
      reply_markup: { force_reply: true, selective: true },
    });
    return;
  }
}

async function forwardToAdmin(message: {
  chat: { id: number };
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
}) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) {
    await tg("sendMessage", {
      chat_id: message.chat.id,
      text: "⚠️ Поддержка временно недоступна: админ не настроен. Попробуй позже.",
    });
    return;
  }
  const from = message.from;
  const who = from
    ? `${from.first_name ?? ""}${from.username ? " (@" + from.username + ")" : ""} [id ${from.id}]`
    : "unknown";
  await tg("sendMessage", {
    chat_id: adminChatId,
    text: `📩 Обращение в поддержку от ${who}:`,
  });
  await tg("forwardMessage", {
    chat_id: adminChatId,
    from_chat_id: message.chat.id,
    message_id: message.message_id,
  });
  await tg("sendMessage", {
    chat_id: message.chat.id,
    text: "✅ Спасибо! Обращение передано администратору — ответим в ближайшее время.",
    reply_markup: BACK_MENU,
  });
}

async function handleMessage(msg: {
  chat: { id: number; type: string };
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  reply_to_message?: { text?: string; from?: { is_bot?: boolean } };
}) {
  const text = msg.text?.trim() ?? "";

  // Support flow: user replied to the support prompt
  const reply = msg.reply_to_message;
  if (reply?.from?.is_bot && reply.text?.includes(SUPPORT_PROMPT_PLAIN)) {
    await forwardToAdmin(msg);
    return;
  }

  if (text === "/start" || text === "/menu") {
    await sendMenu(msg.chat.id);
    return;
  }
  if (text === "/help") {
    await sendMenu(msg.chat.id, "Вот что я умею:");
    return;
  }

  // Default fallback
  await sendMenu(msg.chat.id, "Не понял 🤔 Вот что я умею:");
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const tgKey = process.env.TELEGRAM_API_KEY;
        if (!tgKey) return new Response("Not configured", { status: 500 });

        const expected = deriveSecret(tgKey);
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: {
          update_id: number;
          message?: Parameters<typeof handleMessage>[0];
          edited_message?: Parameters<typeof handleMessage>[0];
          callback_query?: Parameters<typeof handleCallback>[0];
        };
        try {
          update = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        try {
          if (update.callback_query) {
            await handleCallback(update.callback_query);
          } else if (update.message) {
            await handleMessage(update.message);
          } else if (update.edited_message) {
            await handleMessage(update.edited_message);
          }
        } catch (err) {
          console.error("[telegram-webhook] handler failed", err);
        }

        return Response.json({ ok: true });
      },
    },
  },
});