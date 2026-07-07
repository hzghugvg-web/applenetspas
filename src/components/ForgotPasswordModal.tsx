import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { alertDialog as toast } from "@/lib/alert";
import { translateAuthError } from "@/lib/errors";

type ContactMethod = "telegram" | "email" | "phone" | "other";

const METHODS: { id: ContactMethod; label: string; placeholder: string }[] = [
  { id: "telegram", label: "Telegram", placeholder: "@username" },
  { id: "email", label: "Email", placeholder: "you@example.com" },
  { id: "phone", label: "Телефон", placeholder: "+7 999 000-00-00" },
  { id: "other", label: "Другое", placeholder: "как с вами связаться" },
];

export function ForgotPasswordModal({
  open, onClose, initialEmail,
}: { open: boolean; onClose: () => void; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [method, setMethod] = useState<ContactMethod>("telegram");
  const [contact, setContact] = useState("");
  const [approx, setApprox] = useState("");
  const [desc, setDesc] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function reset() {
    setEmail(initialEmail ?? "");
    setMethod("telegram");
    setContact("");
    setApprox("");
    setDesc("");
    setSent(false);
  }

  async function submit() {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Введите корректный email аккаунта"); return;
    }
    if (contact.trim().length < 2) { toast.error("Укажите контакт для связи"); return; }
    if (desc.trim().length < 5) { toast.error("Опишите проблему подробнее"); return; }
    setSending(true);
    try {
      const { error } = await supabase.from("password_recovery_requests").insert({
        email: email.trim().toLowerCase(),
        contact_method: method,
        contact_value: contact.trim(),
        approximate_registration: approx.trim() || null,
        description: desc.trim(),
        status: "new",
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      toast.error(translateAuthError(e?.message ?? "Не удалось отправить"));
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    if (sending) return;
    onClose();
    // Reset after animation
    setTimeout(reset, 300);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="ns-scroll relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border p-5 sm:rounded-3xl"
            style={{
              background: "var(--card-solid)",
              boxShadow: "var(--shadow-elegant)",
              paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-4 flex items-start gap-3">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: "var(--gradient-primary)" }}
              >
                <KeyRound className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] font-semibold text-foreground">Восстановление доступа</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Опишите ситуацию — оператор свяжется с вами по указанному контакту.
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={sending}
                className="tg-press -mr-1 -mt-1 grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {sent ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <h4 className="text-[16px] font-semibold text-foreground">Заявка отправлена</h4>
                <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-snug text-muted-foreground">
                  Оператор рассмотрит запрос и свяжется с вами по указанному контакту в течение
                  нескольких часов.
                </p>
                <button
                  onClick={handleClose}
                  className="tg-press mt-5 h-11 w-full rounded-xl text-[14px] font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  Хорошо
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="Email аккаунта">
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="email, с которым регистрировались"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
                  />
                </Field>

                <Field label="Как с вами связаться">
                  <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
                    {METHODS.map((m) => {
                      const active = method === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMethod(m.id)}
                          className={`tg-press rounded-full py-1.5 text-[12px] font-medium transition-colors ${
                            active ? "text-primary-foreground" : "text-muted-foreground"
                          }`}
                          style={active ? { background: "var(--gradient-primary)" } : undefined}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder={METHODS.find((m) => m.id === method)?.placeholder}
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
                  />
                </Field>

                <Field label="Когда регистрировались (необязательно)">
                  <input
                    value={approx}
                    onChange={(e) => setApprox(e.target.value)}
                    placeholder="например, октябрь 2025"
                    className="h-11 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
                  />
                </Field>

                <Field label="Что произошло">
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={4}
                    placeholder="Забыл пароль, не приходит письмо восстановления, потерял доступ к почте и т.п."
                    className="w-full resize-none rounded-xl border border-border bg-input px-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
                  />
                </Field>

                <button
                  onClick={submit}
                  disabled={sending}
                  className="tg-press flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
                  style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
                >
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Отправить заявку
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block px-1 text-[12px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}