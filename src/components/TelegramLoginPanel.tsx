import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AtSign, ArrowLeft, KeyRound, Loader2, Send, ShieldCheck, X } from "lucide-react";
import {
  finalizeTelegramSignIn,
  getConfirmedTelegramLoginAccounts,
  sendTelegramLoginCode,
  verifyTelegramLoginCode,
} from "@/lib/telegram-auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapUser } from "@/lib/bootstrap";
import { alertDialog as toast } from "@/lib/alert";

type Account = { id: string; email: string; emailMasked: string; linkedAt: string | null };
type Step = "username" | "code" | "choose";
type DeliveryMode = "telegram" | "manual";

function translate(err: string): string {
  switch (err) {
    case "not_linked":
      return "Этот Telegram не привязан ни к одному аккаунту VPNSUS. Сначала войдите обычным способом и привяжите Telegram в настройках.";
    case "chat_not_found":
      return "Не удалось отправить код в Telegram. Откройте бота @netspas_bot и нажмите Start — потом попробуйте ещё раз.";
    case "invalid_username":
      return "Введите ваш @username из Telegram (минимум 3 символа).";
    case "invalid_code":
      return "Код неверный или устарел. Проверьте цифры или запросите новый.";
    case "expired":
      return "Код истёк. Запросите новый.";
    case "telegram_send_failed":
      return "Не удалось отправить код в Telegram. Попробуйте ещё раз.";
    case "link_failed":
      return "Не удалось подготовить вход. Попробуйте ещё раз.";
    case "auth_not_configured":
      return "Вход временно недоступен. Мы уже проверяем настройки сервера.";
    default:
      if (/invalid login|credentials/i.test(err)) return "Пароль от выбранного аккаунта неверный.";
      if (/permission denied/i.test(err)) return "Вход через Telegram обновляется. Попробуйте ещё раз через минуту.";
      return "Что-то пошло не так. Попробуйте ещё раз.";
  }
}

export function TelegramLoginPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const sendCode = useServerFn(sendTelegramLoginCode);
  const verifyCode = useServerFn(verifyTelegramLoginCode);
  const getConfirmedAccounts = useServerFn(getConfirmedTelegramLoginAccounts);
  const finalizeSignIn = useServerFn(finalizeTelegramSignIn);

  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [displayCode, setDisplayCode] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("telegram");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signingInId, setSigningInId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const startedAt = useRef<number>(0);

  // reset on open
  useEffect(() => {
    if (open) {
      setStep("username");
      setUsername("");
      setCode("");
        setDisplayCode("");
        setDeliveryMode("telegram");
      setAccounts([]);
      setSending(false);
      setVerifying(false);
      setSigningInId(null);
      setCooldown(0);
    }
  }, [open]);

  // resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      const rem = Math.max(0, 60 - Math.floor((Date.now() - startedAt.current) / 1000));
      setCooldown(rem);
      if (rem <= 0) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  const canSend = useMemo(
    () => username.trim().replace(/^@/, "").length >= 3 && !sending,
    [username, sending],
  );

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await sendCode({ data: { username: username.trim().replace(/^@/, "") } });
      setCode("");
      setDisplayCode(res.code ?? "");
      setDeliveryMode(res.delivery);
      startedAt.current = Date.now();
      setCooldown(60);
      setStep("code");
    } catch (e: any) {
      toast.error(translate(String(e?.message ?? "")));
    } finally {
      setSending(false);
    }
  }

  async function completeSignIn(profileId: string, currentCode: string) {
    setSigningInId(profileId);
    try {
      const session = await finalizeSignIn({
        data: {
          username: username.trim().replace(/^@/, ""),
          code: currentCode,
          profileId,
        },
      });
      await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      await bootstrapUser();
      toast.success("Вход выполнен");
      onClose();
      navigate({ to: "/vpn", replace: true });
    } catch (e: any) {
      toast.error(translate(String(e?.message ?? "")));
    } finally {
      setSigningInId(null);
    }
  }

  async function handleVerify() {
    const currentCode = deliveryMode === "manual" ? displayCode : code;
    if (!/^\d{6}$/.test(currentCode)) return;
    setVerifying(true);
    try {
      const payload = {
        username: username.trim().replace(/^@/, ""),
        code: currentCode,
      };
      const res = deliveryMode === "manual"
        ? await getConfirmedAccounts({ data: payload })
        : await verifyCode({ data: payload });
      if (res.status === "pending") {
        toast.info("Код ещё не подтверждён", "Отправьте показанный код сообщением боту @netspas_bot, затем нажмите «Проверить». ");
        return;
      }
      if (res.status === "choose") {
        setAccounts(res.accounts);
        setStep("choose");
      } else if (res.status === "password") {
        // No password step — Telegram itself is the confirmation.
        await completeSignIn(res.account.id, currentCode);
      }
    } catch (e: any) {
      toast.error(translate(String(e?.message ?? "")));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    await handleSend();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-2xl border border-border p-5"
        style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[16px] font-semibold">
            <Send className="h-4 w-4" style={{ color: "#38BDF8" }} />
            {step === "username" && "Вход через Telegram"}
            {step === "code" && "Введите код"}
            {step === "choose" && "Выберите аккаунт"}
          </div>
          <button
            onClick={onClose}
            className="tg-press -m-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "username" && (
          <div className="space-y-4">
            <p className="text-[13px] leading-snug text-muted-foreground">
              Введите ваш <b>@username</b> в Telegram — мы отправим одноразовый код в чат с ботом.
            </p>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                inputMode="text"
                autoComplete="username"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="h-11 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#38BDF8,#0EA5E9)" }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Отправить код
            </button>
            <p className="text-[11px] leading-snug text-muted-foreground/80">
              Чтобы получить код, нужно один раз нажать <b>Start</b> в нашем боте.
            </p>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-4">
            <p className="text-[13px] leading-snug text-muted-foreground">
              {deliveryMode === "manual" ? (
                <>
                  Отправьте этот код сообщением боту <b>@netspas_bot</b> с привязанного Telegram:
                </>
              ) : (
                <>
                  Мы отправили 6-значный код в Telegram для <b>@{username.replace(/^@/, "")}</b>.
                  Введите его ниже.
                </>
              )}
            </p>
            {deliveryMode === "manual" && (
              <div className="rounded-xl border border-border bg-input px-4 py-3 text-center">
                <div className="font-mono text-[26px] font-semibold tracking-[0.28em] text-foreground">{displayCode}</div>
                <a
                  href={`https://t.me/netspas_bot?start=login_${displayCode}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-[12px] font-medium text-primary"
                >
                  Открыть бота
                </a>
              </div>
            )}
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={deliveryMode === "manual" ? displayCode : code}
                readOnly={deliveryMode === "manual"}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                className="h-12 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-center font-mono text-[22px] tracking-[0.4em] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
              />
            </div>
            <button
              onClick={() => handleVerify()}
              disabled={(deliveryMode === "manual" ? displayCode.length !== 6 : code.length !== 6) || verifying}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#38BDF8,#0EA5E9)" }}
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {deliveryMode === "manual" ? "Проверить" : "Войти"}
            </button>
            <div className="flex items-center justify-between text-[12px]">
              <button
                onClick={() => setStep("username")}
                className="tg-press inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Другой @username
              </button>
              <button
                onClick={handleResend}
                disabled={cooldown > 0}
                className="tg-press text-primary disabled:text-muted-foreground/60"
              >
                {cooldown > 0 ? `Отправить ещё раз (${cooldown}с)` : "Отправить ещё раз"}
              </button>
            </div>
          </div>
        )}

        {step === "choose" && (
          <div className="space-y-3">
            <p className="text-[13px] leading-snug text-muted-foreground">
              К этому Telegram привязано несколько аккаунтов. Выберите, в какой войти:
            </p>
            <div className="space-y-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    const currentCode = deliveryMode === "manual" ? displayCode : code;
                    void completeSignIn(a.id, currentCode);
                  }}
                  disabled={verifying || signingInId !== null}
                  className="tg-press flex w-full items-center gap-3 rounded-xl border border-border bg-input px-3 py-3 text-left transition-colors hover:border-primary/60 disabled:opacity-60"
                >
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                    style={{ background: "color-mix(in srgb, #38BDF8 20%, transparent)" }}
                  >
                    <ShieldCheck className="h-4 w-4" style={{ color: "#38BDF8" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-foreground">
                      {a.emailMasked}
                    </div>
                    {a.linkedAt && (
                      <div className="text-[10.5px] text-muted-foreground">
                        Привязан {new Date(a.linkedAt).toLocaleDateString("ru-RU")}
                      </div>
                    )}
                  </div>
                  {signingInId === a.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep("code")}
              className="tg-press inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Назад
            </button>
          </div>
        )}
      </div>
    </div>
  );
}