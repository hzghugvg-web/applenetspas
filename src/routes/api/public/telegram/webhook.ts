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
    [{ text: "🔐 Мой VPN", callback_data: "my_vpn" }],
    [{ text: "📖 Как установить и настроить", callback_data: "howto" }],
    [{ text: "❓ Частые вопросы", callback_data: "faq" }],
    [{ text: "📩 Связаться с поддержкой", callback_data: "support" }],
    [{ text: "💰 Поддержать проект", callback_data: "donate" }],
  ],
};

const BACK_MENU = {
  inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "menu" }]],
};

function welcomeText(name?: string) {
  const who = (name ?? "").trim() || "друг";
  return (
    `👋 Приветствуем тебя, <b>${escapeHtml(who)}</b>!\n\n` +
    "🚀 <b>VPNSUS</b> — бесплатный и по-настоящему быстрый VPN, который стабильно работает у 100% пользователей в России.\n\n" +
    "🎁 Дарим <b>30 дней премиум-доступа</b> — наслаждайся любимыми сервисами без ограничений и на максимальной скорости.\n\n" +
    "⏱ Подключение займёт всего <b>2 минуты</b>. Поехали 👇"
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

const HOWTO =
  "📖 <b>Как установить и настроить</b>\n\n" +
  "1️⃣ Скачай VLESS-клиент:\n" +
  "• iOS: <b>FoXray</b>, <b>Streisand</b> или <b>Shadowrocket</b> (App Store)\n" +
  "• Android: <b>v2rayNG</b> или <b>Hiddify</b> (Google Play)\n\n" +
  "2️⃣ Скопируй ключ, который я прислал (начинается с <code>vless://</code>).\n\n" +
  "3️⃣ Открой приложение → «+» → «Импорт из буфера обмена».\n\n" +
  "4️⃣ Нажми «Подключить» — готово, интернет без границ! 🌍";

const FAQ_TEXT =
  "❓ <b>Частые вопросы</b>\n\n" +
  "<b>Нужно ли включать VPN, чтобы открыть сайт?</b>\n" +
  "Нет, сайт netspas.lovable.app открывается у всех.\n\n" +
  "<b>Это безопасно?</b>\n" +
  "Да, логи не храним.\n\n" +
  "<b>Ключ перестал работать?</b>\n" +
  "Просто запросите новый — нажми «🚀 Получить VPN-доступ» в меню.";

const DONATE_TEXT =
  "💰 Спасибо, что помогаешь VPNSUS! 💙\n\n" +
  "Реквизиты для поддержки:\n" +
  "<code>2204 1201 4171 2709</code>\n\n" +
  "Любая сумма помогает нам оплачивать серверы и добавлять новые направления. Спасибо!";

const SUPPORT_PROMPT =
  "📩 Напиши свой вопрос <b>ответом на это сообщение</b> — я передам его администратору. " +
  "Можно приложить скриншот.";

const SUPPORT_PROMPT_PLAIN = "Напиши свой вопрос ответом на это сообщение";

async function sendDirectionPicker(chatId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Clean up expired links so we don't offer directions whose only links are expired
  await supabaseAdmin
    .from("vless_links")
    .delete()
    .eq("is_active", true)
    .lt("expires_at", new Date().toISOString());

  const nowIso = new Date().toISOString();

  const [dirRes, linksRes] = await Promise.all([
    supabaseAdmin
      .from("directions")
      .select("id, name, flag")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("vless_links")
      .select("direction_id, available_from, expires_at")
      .eq("is_active", true),
  ]);

  const directions = dirRes.data ?? [];
  const availableDirIds = new Set(
    (linksRes.data ?? [])
      .filter((l) => {
        if (l.available_from && l.available_from > nowIso) return false;
        if (l.expires_at && l.expires_at <= nowIso) return false;
        return true;
      })
      .map((l) => l.direction_id),
  );

  const usable = directions.filter((d) => availableDirIds.has(d.id));

  if (dirRes.error || linksRes.error || usable.length === 0) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "😕 Сейчас нет свободных направлений — все ключи разобрали. Загляни позже.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const keyboard: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < usable.length; i += 2) {
    const row = usable.slice(i, i + 2).map((d) => ({
      text: `${d.flag ?? "🌐"} ${d.name}`,
      callback_data: `dir:${d.id}`,
    }));
    keyboard.push(row);
  }
  keyboard.push([{ text: "⬅️ В меню", callback_data: "menu" }]);

  await tg("sendMessage", {
    chat_id: chatId,
    text: "🚀 <b>Выбери направление:</b>",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function issueKeyForDirection(chatId: number, directionId: string, telegramUserId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rpc, error } = await (supabaseAdmin as any).rpc("tg_issue_vpn_config", {
    _tg_user_id: telegramUserId,
    _tg_username: null,
    _chat_id: chatId,
    _direction_id: directionId,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/limit_reached/.test(msg)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          "⚠️ У тебя уже есть выданный ключ.\n\n" +
          "На один аккаунт (Telegram + сайт) выдаётся только <b>1 ключ</b>. " +
          "Посмотреть его можно в разделе «🔐 Мой VPN».",
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔐 Мой VPN", callback_data: "my_vpn" }],
            [{ text: "⬅️ В меню", callback_data: "menu" }],
          ],
        },
      });
      return;
    }
    if (/no_links/.test(msg)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "😔 Для этого направления сейчас нет свободных ключей. Попробуй другое или загляни позже.",
        reply_markup: BACK_MENU,
      });
      return;
    }
    if (/blocked/.test(msg)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "⛔ Твой аккаунт заблокирован. Обратись в поддержку.",
        reply_markup: BACK_MENU,
      });
      return;
    }
    console.error("[bot] tg_issue_vpn_config failed", error);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Ошибка при получении ключа. Попробуй ещё раз или напиши в поддержку.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const row = (rpc as Array<{ vless_url: string }> | null)?.[0];
  if (!row?.vless_url) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Ошибка при получении ключа. Попробуй ещё раз или напиши в поддержку.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "🚀 <b>Твой ключ доступа</b>\n\n" +
      `<code>${row.vless_url}</code>\n\n` +
      "📱 Скачай VLESS-клиент (v2rayNG / Hiddify / FoXray), добавь этот ключ — готово!\n" +
      "Ключ всегда можно посмотреть снова в разделе «🔐 Мой VPN».",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔐 Мой VPN", callback_data: "my_vpn" }],
        [{ text: "⬅️ В меню", callback_data: "menu" }],
      ],
    },
    disable_web_page_preview: true,
  });
}

async function sendMyVpn(chatId: number, telegramUserId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Combine Telegram-issued keys AND site-issued keys via the linked profile,
  // so both surfaces show the same list.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .order("telegram_linked_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const [{ data: tgRows, error }, siteRes] = await Promise.all([
    supabaseAdmin
      .from("telegram_issued_keys")
      .select("direction_name, direction_flag, vless_url, issued_at")
      .eq("telegram_user_id", telegramUserId)
      .order("issued_at", { ascending: false })
      .limit(10),
    profile?.id
      ? supabaseAdmin
          .from("issued_configs")
          .select("vless_url, upstream_url, issued_at, direction_id, directions(name, flag)")
          .eq("user_id", profile.id)
          .order("issued_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (error) {
    console.error("[bot] my_vpn fetch failed", error);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Не удалось загрузить твои ключи. Попробуй ещё раз.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const seen = new Set<string>();
  const merged: Array<{ name: string; flag: string; url: string; issuedAt: string }> = [];
  for (const r of tgRows ?? []) {
    if (!r.vless_url || seen.has(r.vless_url)) continue;
    seen.add(r.vless_url);
    merged.push({
      name: r.direction_name ?? "Направление",
      flag: r.direction_flag ?? "🌐",
      url: r.vless_url,
      issuedAt: r.issued_at,
    });
  }
  for (const r of (siteRes.data ?? []) as any[]) {
    const url = r.upstream_url ?? r.vless_url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push({
      name: r.directions?.name ?? "Направление",
      flag: r.directions?.flag ?? "🌐",
      url,
      issuedAt: r.issued_at,
    });
  }
  merged.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  const rows = merged;
  if (rows.length === 0) {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        "🔐 <b>Мой VPN</b>\n\nУ тебя пока нет выданных ключей. Нажми «🚀 Получить VPN-доступ», чтобы выбрать направление.",
      parse_mode: "HTML",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const blocks = rows.map((r) => {
    const date = r.issuedAt ? new Date(r.issuedAt).toLocaleDateString("ru-RU") : "";
    return `${r.flag} <b>${r.name}</b>${date ? ` — ${date}` : ""}\n<code>${r.url}</code>`;
  });

  await tg("sendMessage", {
    chat_id: chatId,
    text: `🔐 <b>Мой VPN</b>\n\n${blocks.join("\n\n")}`,
    parse_mode: "HTML",
    reply_markup: BACK_MENU,
    disable_web_page_preview: true,
  });
}

async function sendMenu(chatId: number, text?: string, name?: string) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: text ?? welcomeText(name),
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
    await sendDirectionPicker(chatId);
    return;
  }
  if (data === "my_vpn") {
    await sendMyVpn(chatId, cb.from.id);
    return;
  }
  if (data.startsWith("dir:")) {
    await issueKeyForDirection(chatId, data.slice(4), cb.from.id);
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
      reply_markup: { force_reply: true, input_field_placeholder: "Ваш вопрос…" },
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
  // Do not forward admin's own messages back to themselves
  if (String(message.chat.id) === String(adminChatId)) {
    return;
  }
  const from = message.from;
  const who = from
    ? `${from.first_name ?? ""}${from.username ? " (@" + from.username + ")" : ""} [id ${from.id}]`
    : "unknown";
  const header = await tg("sendMessage", {
    chat_id: adminChatId,
    text: `📩 Обращение в поддержку от ${escapeHtml(who)}\n💬 Ответь <b>реплаем</b> на следующее сообщение — я передам ответ пользователю.`,
    parse_mode: "HTML",
  });
  if (!header.ok) {
    console.error("[support] header send failed", header.status);
  }
  // copyMessage works even when forwarding is restricted by user privacy settings
  const copyRes = await tg("copyMessage", {
    chat_id: adminChatId,
    from_chat_id: message.chat.id,
    message_id: message.message_id,
  });
  if (!copyRes.ok) {
    // Fallback: send plaintext body with user id so admin can still reply manually
    await tg("sendMessage", {
      chat_id: adminChatId,
      text: `(chat_id: ${message.chat.id})\n${message.text ? escapeHtml(message.text) : "<em>(без текста)</em>"}`,
      parse_mode: "HTML",
    });
  }
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

  // /start <payload> — deep links from the web app
  if (text.startsWith("/start ")) {
    const payload = text.slice(7).trim();
    if (payload.startsWith("link_")) {
      await handleLinkPayload(msg, payload.slice(5));
      return;
    }
    if (payload.startsWith("login_")) {
      await handleLoginPayload(msg, payload.slice(6));
      return;
    }
    // Unknown payload — fall back to menu
    await sendMenu(msg.chat.id, undefined, msg.from?.first_name);
    return;
  }

  if (text === "/start" || text === "/menu") {
    await sendMenu(msg.chat.id, undefined, msg.from?.first_name);
    return;
  }
  if (text === "/help") {
    await sendMenu(msg.chat.id, "Вот что я умею:");
    return;
  }

  // Bare 6-digit code — treat as link/login code
  const digits = text.match(/^\s*(\d{6})\s*$/);
  if (digits) {
    const code = digits[1];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("telegram_auth_codes")
      .select("purpose")
      .eq("code", code)
      .maybeSingle();
    if (row?.purpose === "login") {
      await handleLoginPayload(msg, code);
      return;
    }
    if (row?.purpose === "link") {
      await handleLinkPayload(msg, code);
      return;
    }
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: "❌ Такой код не найден или уже использован. Запроси новый в приложении VPNSUS.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  // Default fallback
  if (process.env.TELEGRAM_ADMIN_CHAT_ID && String(msg.chat.id) !== String(process.env.TELEGRAM_ADMIN_CHAT_ID)) {
    await forwardToAdmin(msg);
    return;
  }

  await sendMenu(msg.chat.id, "Выберите действие в меню:");
}

async function handleLinkPayload(
  msg: { chat: { id: number }; from?: { id: number; username?: string; first_name?: string } },
  code: string,
) {
  const chatId = msg.chat.id;
  const tgUserId = msg.from?.id;
  const tgUsername = msg.from?.username ?? null;
  if (!tgUserId) {
    await tg("sendMessage", { chat_id: chatId, text: "⚠️ Не удалось определить твой Telegram-аккаунт." });
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("telegram_auth_codes")
    .select("code, purpose, user_id, status, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!row || row.purpose !== "link" || !row.user_id) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Код привязки не найден. Запроси новый в приложении: Настройки → Способы входа → Telegram.",
      reply_markup: BACK_MENU,
    });
    return;
  }
  if (row.status !== "pending") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "ℹ️ Этот код уже был использован. Запроси новый в приложении.",
      reply_markup: BACK_MENU,
    });
    return;
  }
  if (new Date(row.expires_at) < new Date()) {
    await supabaseAdmin.from("telegram_auth_codes").update({ status: "expired" }).eq("code", code);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⌛ Код истёк. Запроси новый в приложении.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  // Ensure this Telegram account is not already linked to another user
  // Enforce max 2 profiles per Telegram (excluding the current profile being linked)
  const { data: existingList } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", tgUserId)
    .neq("id", row.user_id);
  const alreadyLinkedCount = existingList?.length ?? 0;
  if (alreadyLinkedCount >= 2) {
    await supabaseAdmin
      .from("telegram_auth_codes")
      .update({ status: "rejected", error: "max_devices" })
      .eq("code", code);
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        "⚠️ <b>Достигнут лимит устройств</b>\n\n" +
        "К этому Telegram уже привязано максимальное количество аккаунтов VPNSUS (2). " +
        "Отвяжите один из старых аккаунтов в разделе «Настройки → Telegram», а затем повторите попытку.",
      parse_mode: "HTML",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({
      telegram_user_id: tgUserId,
      telegram_username: tgUsername,
      telegram_linked_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", row.user_id);

  if (updErr) {
    console.error("[bot] link update failed", updErr);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Не удалось сохранить привязку. Попробуй ещё раз.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  await supabaseAdmin
    .from("telegram_auth_codes")
    .update({
      status: "confirmed",
      telegram_user_id: tgUserId,
      telegram_username: tgUsername,
      confirmed_at: nowIso,
    })
    .eq("code", code);

  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "✅ <b>Telegram привязан!</b>\n\nТеперь ты можешь входить в VPNSUS одним нажатием — прямо через Telegram.",
    parse_mode: "HTML",
    reply_markup: MAIN_MENU,
  });
}

async function handleLoginPayload(
  msg: { chat: { id: number }; from?: { id: number; username?: string } },
  code: string,
) {
  const chatId = msg.chat.id;
  const tgUserId = msg.from?.id;
  if (!tgUserId) {
    await tg("sendMessage", { chat_id: chatId, text: "⚠️ Не удалось определить твой Telegram-аккаунт." });
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("telegram_auth_codes")
    .select("code, purpose, status, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!row || row.purpose !== "login") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Код входа не найден. Открой страницу входа VPNSUS и запроси новый.",
    });
    return;
  }
  if (row.status !== "pending") {
    await tg("sendMessage", { chat_id: chatId, text: "ℹ️ Этот код уже использован." });
    return;
  }
  if (new Date(row.expires_at) < new Date()) {
    await supabaseAdmin.from("telegram_auth_codes").update({ status: "expired" }).eq("code", code);
    await tg("sendMessage", { chat_id: chatId, text: "⌛ Код истёк. Запроси новый на странице входа." });
    return;
  }

  // Find linked profile for this Telegram user
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", tgUserId)
    .limit(1)
    .maybeSingle();

  if (!profile) {
    await supabaseAdmin
      .from("telegram_auth_codes")
      .update({ status: "rejected", error: "not_linked" })
      .eq("code", code);
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        "⚠️ Твой Telegram ещё не привязан к аккаунту VPNSUS.\n\n" +
        "Сначала войди в приложение по email и в разделе «Настройки → Telegram» нажми «Привязать Telegram».",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const { data: userRes, error: getUserErr } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  if (getUserErr || !userRes?.user?.email) {
    await supabaseAdmin
      .from("telegram_auth_codes")
      .update({ status: "rejected", error: "user_missing" })
      .eq("code", code);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Не удалось подготовить вход. Напиши в поддержку или войди по email.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  const origin = process.env.PUBLIC_SITE_URL ?? "https://netspas.lovable.app";
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: userRes.user.email,
    options: { redirectTo: `${origin}/vpn` },
  });
  const actionLink = link?.properties?.action_link;
  if (linkErr || !actionLink) {
    await supabaseAdmin
      .from("telegram_auth_codes")
      .update({ status: "rejected", error: linkErr?.message ?? "link_failed" })
      .eq("code", code);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Не удалось подготовить вход. Попробуй ещё раз или войди по email.",
      reply_markup: BACK_MENU,
    });
    return;
  }

  await supabaseAdmin
    .from("telegram_auth_codes")
    .update({
      status: "confirmed",
      action_link: actionLink,
      user_id: profile.id,
      telegram_user_id: tgUserId,
      telegram_username: msg.from?.username ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("code", code);

  await tg("sendMessage", {
    chat_id: chatId,
    text: "✅ Вход подтверждён! Возвращайся на вкладку VPNSUS — она войдёт автоматически.",
    reply_markup: BACK_MENU,
  });
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