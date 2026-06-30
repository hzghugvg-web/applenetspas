export function translateAuthError(msg?: string | null): string {
  if (!msg) return "Произошла ошибка";
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Неверный email или пароль";
  if (m.includes("user already") || m.includes("already registered")) return "Пользователь с таким email уже существует";
  if (m.includes("password") && m.includes("weak")) return "Слишком простой пароль";
  if (m.includes("password") && m.includes("6")) return "Пароль должен содержать минимум 6 символов";
  if (m.includes("email") && m.includes("valid")) return "Введите корректный email";
  if (m.includes("rate limit")) return "Слишком много попыток, попробуйте позже";
  if (m.includes("network")) return "Нет соединения с сервером";
  if (m.includes("blocked")) return "Аккаунт заблокирован";
  if (m.includes("cooldown")) return "Подождите до окончания кулдауна";
  if (m.includes("no_links")) return "Нет доступных конфигураций для этого направления";
  if (m.includes("forbidden") || m.includes("unauthorized")) return "Недостаточно прав";
  return msg;
}
