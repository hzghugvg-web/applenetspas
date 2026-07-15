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
  const body = JSON.stringify(payload);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let res: Response;
  if (botToken) {
    res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } else {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const tgKey = process.env.TELEGRAM_API_KEY;
    if (!lovableKey || !tgKey) throw new Error("Telegram keys not configured");
    res = await fetch(`${GATEWAY_URL}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": tgKey,
        "Content-Type": "application/json",
      },
      body,
    });
  }
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
    [{ text: "ℹ️ Кто создатель? И зачем нам это", callback_data: "faq" }],
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
  "ℹ️ <b>Кто создатель? И зачем нам это</b>\n\n" +
  "Это проверка VPN-сервисов: мы тестируем конфигурации, смотрим стабильность и оставляем те, которыми реально удобно пользоваться.\n\n" +
  "Сервис будет продаваться за <b>33 ₽</b>, потому что нам, увы, неудобно работать в убыток — нужно покрывать серверы и развитие проекта.\n\n" +
  "Новые направления выйдут <b>16.07.2026 в 02:00 МСК</b>.";

const DONATE_TEXT =
  "💰 Спасибо, что помогаешь VPNSUS! 💙\n\n" +
  "Реквизиты для поддержки:\n" +
  "<code>2204 1201 4171 2709</code>\n\n" +
  "Любая сумма помогает нам оплачивать серверы и добавлять новые направления. Спасибо!";

const SUPPORT_PROMPT =
  "📩 Напиши свой вопрос <b>ответом на это сообщение</b> — я передам его администратору. " +
  "Можно приложить скриншот.";

const SUPPORT_PROMPT_PLAIN = "Напиши свой вопрос ответом на это сообщение";

async function sendDirectionPicker(chatId: number, telegramUserId?: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Clean up expired links so we don't offer directions whose only links are expired
  await supabaseAdmin
    .from("vless_links")
    .delete()
    .eq("is_active", true)
    .lt("expires_at", new Date().toISOString());

  const nowIso = new Date().toISOString();

  const [dirRes, linksRes, issuedRes] = await Promise.all([
    supabaseAdmin
      .from("directions")
      .select("id, name, flag")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("vless_links")
      .select("direction_id, available_from, expires_at")
      .eq("is_active", true),
    telegramUserId
      ? supabaseAdmin
          .from("telegram_issued_keys")
          .select("direction_id")
          .eq("telegram_user_id", telegramUserId)
      : Promise.resolve({ data: [] as { direction_id: string }[], error: null } as any),
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

  const takenDirIds = new Set(
    (issuedRes?.data ?? []).map((r: any) => r.direction_id).filter(Boolean),
  );

  const usable = directions.filter(
    (d) => availableDirIds.has(d.id) && !takenDirIds.has(d.id),
  );

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
  // Показываем только самый свежий ключ — политика «1 ключ на аккаунт»
  const rows = merged.slice(0, 1);
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
    await sendDirectionPicker(chatId, cb.from.id);
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
  if (data.startsWith("login_ok:") || data.startsWith("login_no:")) {
    const approve = data.startsWith("login_ok:");
    const code = data.split(":")[1] ?? "";
    await handleLoginDecision(chatId, cb.from.id, cb.from.username ?? null, code, approve, cb.message?.message_id);
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
  if (data.startsWith("alink:")) {
    // Админ выбрал направление для добавления vless-ссылки
    if (!(await isBotAdmin(cb.from.id))) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ Нет прав." });
      return;
    }
    const dirId = data.slice(6);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: d } = await supabaseAdmin
      .from("directions")
      .select("id, name, flag")
      .eq("id", dirId)
      .maybeSingle();
    if (!d) {
      await tg("sendMessage", { chat_id: chatId, text: "❌ Направление не найдено." });
      return;
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `➕ Добавляем ключ в ${d.flag ?? "🌐"} <b>${escapeHtml(d.name)}</b>.\n\n` +
        `Пришли <b>ответом</b> на это сообщение vless-ссылку (начинается с <code>vless://</code>).\n\n` +
        `<code>[dir:${d.id}]</code>`,
      parse_mode: "HTML",
      reply_markup: { force_reply: true, input_field_placeholder: "vless://..." },
    });
    return;
  }
}

async function forwardToAdmin(message: {
  chat: { id: number };
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
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

  // Admin commands (Telegram-based management of directions and vless links)
  if (text.startsWith("/") && msg.from?.id) {
    const handled = await tryHandleAdminCommand(msg.chat.id, msg.from.id, text);
    if (handled) return;
  }

  // Admin: reply to "add link" prompt with a vless URL
  const replyText = msg.reply_to_message?.text ?? "";
  const dirMarker = replyText.match(/\[dir:([0-9a-f-]{36})\]/i);
  if (dirMarker && msg.reply_to_message?.from?.is_bot && msg.from?.id) {
    if (!(await isBotAdmin(msg.from.id))) {
      await tg("sendMessage", { chat_id: msg.chat.id, text: "⛔ Нет прав." });
      return;
    }
    const url = text;
    if (!/^(vless|vmess|trojan|ss):\/\/\S+/i.test(url)) {
      await tg("sendMessage", {
        chat_id: msg.chat.id,
        text: "❌ Это не похоже на vless-ссылку. Отправь ещё раз ответом на прошлое сообщение.",
      });
      return;
    }
    const dirId = dirMarker[1];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: d } = await supabaseAdmin
      .from("directions")
      .select("id, name, flag")
      .eq("id", dirId)
      .maybeSingle();
    if (!d) {
      await tg("sendMessage", { chat_id: msg.chat.id, text: "❌ Направление больше не существует." });
      return;
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("vless_links")
      .insert({ direction_id: d.id, url, is_active: true })
      .select("id")
      .single();
    if (error) {
      await tg("sendMessage", { chat_id: msg.chat.id, text: `⚠️ Ошибка: ${escapeHtml(error.message)}`, parse_mode: "HTML" });
      return;
    }
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: `✅ Ссылка добавлена в ${d.flag ?? "🌐"} <b>${escapeHtml(d.name)}</b>\n<code>${inserted.id}</code>`,
      parse_mode: "HTML",
    });
    return;
  }

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
        // Prefer TELEGRAM_WEBHOOK_SECRET when set (works on Vercel where the
        // Lovable gateway env vars are absent). Otherwise derive the secret
        // from TELEGRAM_API_KEY / TELEGRAM_BOT_TOKEN for backwards compat.
        const explicitSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        const seed = explicitSecret || process.env.TELEGRAM_API_KEY || process.env.TELEGRAM_BOT_TOKEN;
        if (!seed) return new Response("Not configured", { status: 500 });
        const expected = explicitSecret ? explicitSecret : deriveSecret(seed);
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

// ============================================================
// Admin commands (управление направлениями и vless-ссылками из бота)
// ============================================================

async function isBotAdmin(tgUserId: number): Promise<boolean> {
  const envAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (envAdmin && String(envAdmin) === String(tgUserId)) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("telegram_user_id")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();
  return !!data;
}

const ADMIN_HELP =
  "🛠 <b>Админ-команды</b>\n\n" +
  "<b>Админы:</b>\n" +
  "• <code>/adminhelp</code> — эта справка\n" +
  "• <code>/admins</code> — список админов\n" +
  "• <code>/grantadmin ID</code> — выдать админку\n" +
  "• <code>/revokeadmin ID</code> — забрать админку\n\n" +
  "<b>Направления:</b>\n" +
  "• <code>/directions</code> — список\n" +
  "• <code>/adddir 🇩🇪 Germany</code> — добавить\n" +
  "• <code>/toggledir &lt;id_или_имя&gt;</code> — вкл/выкл\n" +
  "• <code>/deldir &lt;id_или_имя&gt;</code> — удалить (если нет ссылок)\n\n" +
  "<b>VLESS-ссылки:</b>\n" +
  "• <code>/links</code> — список активных\n" +
  "• <code>/links &lt;имя&gt;</code> — по направлению\n" +
  "• <code>/addlink</code> — добавить ключ (кнопки + ответ)\n" +
  "• <code>/dellink &lt;id_ссылки&gt;</code> — удалить";

async function findDirection(query: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = query.trim();
  if (/^[0-9a-f-]{8,}$/i.test(q)) {
    const { data } = await supabaseAdmin
      .from("directions")
      .select("id, name, flag, is_active")
      .ilike("id", `${q}%`)
      .limit(2);
    if (data && data.length === 1) return data[0];
    if (data && data.length > 1) return { _ambiguous: true };
  }
  const { data } = await supabaseAdmin
    .from("directions")
    .select("id, name, flag, is_active")
    .ilike("name", q)
    .limit(2);
  if (data && data.length === 1) return data[0];
  if (data && data.length > 1) return { _ambiguous: true };
  return null;
}

async function tryHandleAdminCommand(chatId: number, tgUserId: number, text: string): Promise<boolean> {
  const [cmdRaw, ...restParts] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, "");
  const adminCmds = new Set([
    "/adminhelp",
    "/admins",
    "/grantadmin",
    "/revokeadmin",
    "/directions",
    "/adddir",
    "/toggledir",
    "/deldir",
    "/links",
    "/addlink",
    "/dellink",
  ]);
  if (!adminCmds.has(cmd)) return false;
  console.log(`[admin-cmd] user=${tgUserId} cmd=${cmd}`);

  if (!(await isBotAdmin(tgUserId))) {
    console.log(`[admin-cmd] denied for tgUserId=${tgUserId}`);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⛔ У тебя нет прав администратора бота.\n\nТвой Telegram ID: <code>${tgUserId}</code>`,
      parse_mode: "HTML",
    });
    return true;
  }

  const rest = restParts.join(" ").trim();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    if (cmd === "/adminhelp") {
      await tg("sendMessage", { chat_id: chatId, text: ADMIN_HELP, parse_mode: "HTML" });
      return true;
    }

    if (cmd === "/admins") {
      const { data } = await supabaseAdmin
        .from("telegram_bot_admins")
        .select("telegram_user_id, note, created_at")
        .order("created_at", { ascending: true });
      const envAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
      const lines = (data ?? []).map(
        (r) => `• <code>${r.telegram_user_id}</code>${r.note ? ` — ${escapeHtml(r.note)}` : ""}`,
      );
      if (envAdmin) lines.unshift(`• <code>${envAdmin}</code> — root (env)`);
      await tg("sendMessage", {
        chat_id: chatId,
        text: `👥 <b>Админы бота</b>\n\n${lines.length ? lines.join("\n") : "— пусто —"}`,
        parse_mode: "HTML",
      });
      return true;
    }

    if (cmd === "/grantadmin") {
      const id = Number(rest.split(/\s+/)[0]);
      if (!Number.isFinite(id) || id <= 0) {
        await tg("sendMessage", { chat_id: chatId, text: "Использование: <code>/grantadmin ID</code>", parse_mode: "HTML" });
        return true;
      }
      const { error } = await supabaseAdmin
        .from("telegram_bot_admins")
        .upsert({ telegram_user_id: id, added_by: tgUserId }, { onConflict: "telegram_user_id" });
      if (error) throw error;
      await tg("sendMessage", { chat_id: chatId, text: `✅ Админка выдана: <code>${id}</code>`, parse_mode: "HTML" });
      return true;
    }

    if (cmd === "/revokeadmin") {
      const id = Number(rest.split(/\s+/)[0]);
      if (!Number.isFinite(id) || id <= 0) {
        await tg("sendMessage", { chat_id: chatId, text: "Использование: <code>/revokeadmin ID</code>", parse_mode: "HTML" });
        return true;
      }
      const { error } = await supabaseAdmin.from("telegram_bot_admins").delete().eq("telegram_user_id", id);
      if (error) throw error;
      await tg("sendMessage", { chat_id: chatId, text: `✅ Админка отозвана: <code>${id}</code>`, parse_mode: "HTML" });
      return true;
    }

    if (cmd === "/directions") {
      const { data } = await supabaseAdmin
        .from("directions")
        .select("id, name, flag, is_active")
        .order("name", { ascending: true });
      const lines = (data ?? []).map(
        (d) =>
          `${d.is_active ? "🟢" : "⚪️"} ${d.flag ?? "🌐"} <b>${escapeHtml(d.name)}</b>\n   <code>${d.id.slice(0, 8)}</code>`,
      );
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🗺 <b>Направления</b>\n\n${lines.length ? lines.join("\n\n") : "— пусто —"}`,
        parse_mode: "HTML",
      });
      return true;
    }

    if (cmd === "/adddir") {
      const parts = rest.split(/\s+/);
      const flag = parts[0] ?? "";
      const name = parts.slice(1).join(" ").trim();
      if (!flag || !name || name.length > 60) {
        await tg("sendMessage", { chat_id: chatId, text: "Использование: <code>/adddir 🇩🇪 Germany</code>", parse_mode: "HTML" });
        return true;
      }
      const { data, error } = await supabaseAdmin
        .from("directions")
        .insert({ name, flag, is_active: true })
        .select("id")
        .single();
      if (error) throw error;
      await tg("sendMessage", {
        chat_id: chatId,
        text: `✅ Направление создано: ${flag} <b>${escapeHtml(name)}</b>\n<code>${data.id}</code>`,
        parse_mode: "HTML",
      });
      return true;
    }

    if (cmd === "/toggledir" || cmd === "/deldir") {
      if (!rest) {
        await tg("sendMessage", { chat_id: chatId, text: `Использование: <code>${cmd} &lt;id или имя&gt;</code>`, parse_mode: "HTML" });
        return true;
      }
      const dir = await findDirection(rest);
      if (!dir) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ Направление не найдено." });
        return true;
      }
      if ((dir as any)._ambiguous) {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ Найдено несколько — уточни ID." });
        return true;
      }
      const d = dir as { id: string; name: string; flag: string; is_active: boolean };
      if (cmd === "/toggledir") {
        const { error } = await supabaseAdmin
          .from("directions")
          .update({ is_active: !d.is_active })
          .eq("id", d.id);
        if (error) throw error;
        await tg("sendMessage", {
          chat_id: chatId,
          text: `✅ ${d.flag} <b>${escapeHtml(d.name)}</b> теперь ${!d.is_active ? "🟢 активно" : "⚪️ выключено"}`,
          parse_mode: "HTML",
        });
        return true;
      }
      // deldir
      const { count } = await supabaseAdmin
        .from("vless_links")
        .select("id", { count: "exact", head: true })
        .eq("direction_id", d.id);
      if ((count ?? 0) > 0) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `⚠️ Нельзя удалить: у направления есть ${count} ссылок. Сначала удали их (<code>/links ${escapeHtml(d.name)}</code>).`,
          parse_mode: "HTML",
        });
        return true;
      }
      const { error } = await supabaseAdmin.from("directions").delete().eq("id", d.id);
      if (error) throw error;
      await tg("sendMessage", { chat_id: chatId, text: `✅ Удалено: ${d.flag} ${escapeHtml(d.name)}`, parse_mode: "HTML" });
      return true;
    }

    if (cmd === "/links") {
      let dirId: string | null = null;
      let dirLabel = "все";
      if (rest) {
        const dir = await findDirection(rest);
        if (!dir || (dir as any)._ambiguous) {
          await tg("sendMessage", { chat_id: chatId, text: "❌ Направление не найдено (или неоднозначно)." });
          return true;
        }
        const d = dir as { id: string; name: string; flag: string };
        dirId = d.id;
        dirLabel = `${d.flag} ${d.name}`;
      }
      let q = supabaseAdmin
        .from("vless_links")
        .select("id, direction_id, url, is_active, expires_at, directions(name, flag)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (dirId) q = q.eq("direction_id", dirId);
      const { data } = await q;
      const lines = ((data ?? []) as any[]).map((l) => {
        const dn = l.directions?.name ? `${l.directions.flag ?? "🌐"} ${l.directions.name}` : "—";
        const state = l.is_active ? "🟢" : "⚪️";
        return `${state} <b>${escapeHtml(dn)}</b>\n<code>${l.id.slice(0, 8)}</code> · ${escapeHtml((l.url ?? "").slice(0, 60))}…`;
      });
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔗 <b>Ссылки (${escapeHtml(dirLabel)})</b>\n\n${lines.length ? lines.join("\n\n") : "— пусто —"}`,
        parse_mode: "HTML",
      });
      return true;
    }

    if (cmd === "/addlink") {
      // Без аргументов — показываем интерактивный выбор направления
      if (!rest) {
        const { data: dirs } = await supabaseAdmin
          .from("directions")
          .select("id, name, flag")
          .eq("is_active", true)
          .order("name", { ascending: true });
        if (!dirs || dirs.length === 0) {
          await tg("sendMessage", { chat_id: chatId, text: "❌ Нет активных направлений. Сначала добавь через <code>/adddir</code>.", parse_mode: "HTML" });
          return true;
        }
        const keyboard: { text: string; callback_data: string }[][] = [];
        for (let i = 0; i < dirs.length; i += 2) {
          keyboard.push(
            dirs.slice(i, i + 2).map((d) => ({
              text: `${d.flag ?? "🌐"} ${d.name}`,
              callback_data: `alink:${d.id}`,
            })),
          );
        }
        await tg("sendMessage", {
          chat_id: chatId,
          text: "➕ <b>Добавление ссылки</b>\n\nВыбери направление:",
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard },
        });
        return true;
      }
      // /addlink <name> <vless://...>  — имя может быть многословным, разделитель — пробел перед протоколом
      const m = rest.match(/^(.*?)\s+((?:vless|vmess|trojan|ss):\/\/\S+)\s*$/i);
      if (!m) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Использование: <code>/addlink Germany vless://...</code>",
          parse_mode: "HTML",
        });
        return true;
      }
      const [, dirQuery, url] = m;
      const dir = await findDirection(dirQuery);
      if (!dir || (dir as any)._ambiguous) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ Направление не найдено." });
        return true;
      }
      const d = dir as { id: string; name: string; flag: string };
      const { data, error } = await supabaseAdmin
        .from("vless_links")
        .insert({ direction_id: d.id, url, is_active: true })
        .select("id")
        .single();
      if (error) throw error;
      await tg("sendMessage", {
        chat_id: chatId,
        text: `✅ Ссылка добавлена в ${d.flag} <b>${escapeHtml(d.name)}</b>\n<code>${data.id}</code>`,
        parse_mode: "HTML",
      });
      return true;
    }

    if (cmd === "/dellink") {
      const q = rest.split(/\s+/)[0] ?? "";
      if (!q) {
        await tg("sendMessage", { chat_id: chatId, text: "Использование: <code>/dellink &lt;id_ссылки&gt;</code>", parse_mode: "HTML" });
        return true;
      }
      const { data: found } = await supabaseAdmin
        .from("vless_links")
        .select("id")
        .ilike("id", `${q}%`)
        .limit(2);
      if (!found || found.length === 0) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ Ссылка не найдена." });
        return true;
      }
      if (found.length > 1) {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ Найдено несколько — уточни ID." });
        return true;
      }
      const { error } = await supabaseAdmin.from("vless_links").delete().eq("id", found[0].id);
      if (error) throw error;
      await tg("sendMessage", { chat_id: chatId, text: `✅ Удалено: <code>${found[0].id}</code>`, parse_mode: "HTML" });
      return true;
    }
  } catch (err) {
    console.error("[admin-cmd] failed", err);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚠️ Ошибка: ${escapeHtml(String((err as Error).message ?? err))}`,
      parse_mode: "HTML",
    });
    return true;
  }

  return false;
}

async function handleLoginDecision(
  chatId: number,
  tgUserId: number,
  tgUsername: string | null,
  code: string,
  approve: boolean,
  messageId?: number,
) {
  if (!/^\d{6}$/.test(code)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("telegram_auth_codes")
    .select("code, purpose, status, expires_at, telegram_user_id")
    .eq("code", code)
    .maybeSingle();

  const editText = async (text: string) => {
    if (!messageId) {
      await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
      return;
    }
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    });
  };

  if (!row || row.purpose !== "login") {
    await editText("❌ Запрос на вход не найден или устарел.");
    return;
  }
  if (row.status === "confirmed" || row.status === "rejected") {
    await editText(
      row.status === "confirmed"
        ? "ℹ️ Этот вход уже подтверждён."
        : "ℹ️ Этот вход уже отклонён.",
    );
    return;
  }
  if (new Date(row.expires_at) < new Date()) {
    await supabaseAdmin.from("telegram_auth_codes").update({ status: "expired" }).eq("code", code);
    await editText("⌛ Запрос истёк. Попроси новый на странице входа.");
    return;
  }
  if (row.telegram_user_id && Number(row.telegram_user_id) !== Number(tgUserId)) {
    await editText("⚠️ Этот запрос не для тебя.");
    return;
  }

  if (!approve) {
    await supabaseAdmin
      .from("telegram_auth_codes")
      .update({
        status: "rejected",
        error: "declined",
        telegram_user_id: tgUserId,
        telegram_username: tgUsername,
      })
      .eq("code", code);
    await editText("🚫 Вход отклонён. Если это был не ты — всё в порядке, никто не вошёл.");
    return;
  }

  // Approve: find linked profile.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", tgUserId)
    .order("telegram_linked_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!profile) {
    await supabaseAdmin
      .from("telegram_auth_codes")
      .update({ status: "rejected", error: "not_linked" })
      .eq("code", code);
    await editText(
      "⚠️ Твой Telegram ещё не привязан к аккаунту VPNSUS. Сначала войди по email и привяжи Telegram в настройках.",
    );
    return;
  }

  await supabaseAdmin
    .from("telegram_auth_codes")
    .update({
      status: "confirmed",
      telegram_user_id: tgUserId,
      telegram_username: tgUsername,
      confirmed_at: new Date().toISOString(),
      user_id: profile.id,
    })
    .eq("code", code);

  await editText("✅ Вход подтверждён! Возвращайся во вкладку VPNSUS — она войдёт автоматически.");
}