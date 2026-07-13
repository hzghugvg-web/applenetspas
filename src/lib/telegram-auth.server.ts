const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export async function botSendMessage(chatId: number, text: string) {
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
    if (res.status === 400 && /chat not found|bot was blocked/i.test(body)) {
      throw new Error("chat_not_found");
    }
    throw new Error("telegram_send_failed");
  }
}

export async function getBotUsername(): Promise<string> {
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

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const name = email.slice(0, at);
  const dom = email.slice(at + 1);
  const shown = name.length <= 2 ? `${name[0]}•` : `${name[0]}•••${name[name.length - 1]}`;
  return `${shown}@${dom}`;
}