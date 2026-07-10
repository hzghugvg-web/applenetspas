export function translateAuthError(msg?: string | null): string {
  const OFFLINE = "Отсутствует интернет. Возможно, вы в офлайн-режиме или у вас медленный интернет — проверьте подключение.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;
  if (!msg || msg === "{}" || msg === "[object Object]") return OFFLINE;
  const m = msg.toLowerCase();
  if (
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("fetch is aborted") ||
    m.includes("aborterror") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("upstream_unreachable") ||
    m === "network error"
  ) return OFFLINE;
  if (m.includes("lovable error") || m.includes("access denied")) return "Сервер временно недоступен. Попробуйте ещё раз.";
  if (m.includes("invalid login")) return "Неверный email или пароль";
  if (m.includes("user already") || m.includes("already registered")) return "Пользователь с таким email уже существует";
  if (m.includes("password") && m.includes("weak")) return "Слишком простой пароль";
  if (m.includes("password") && m.includes("6")) return "Пароль должен содержать минимум 6 символов";
  if (m.includes("email") && m.includes("valid")) return "Введите корректный email";
  if (m.includes("rate limit")) return "Слишком много попыток, попробуйте позже";
  if (m.includes("network")) return OFFLINE;
  if (m.includes("blocked")) return "Аккаунт заблокирован";
  if (m.includes("cooldown")) return "Подождите до окончания кулдауна";
  if (m.includes("no_links")) return "Нет доступных конфигураций для этого направления";
  if (m.includes("limit_reached")) return "Достигнут лимит: только 1 конфигурация на аккаунт";
  if (m.includes("subscription_active")) return "У вас уже активна подписка — дождитесь её окончания";
  if (m.includes("forbidden") || m.includes("unauthorized")) return "Недостаточно прав";
  return msg;
}
