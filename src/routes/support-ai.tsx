import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { askSupportAI } from "@/lib/support-ai.functions";
import { alertDialog as toast } from "@/lib/alert";
import { translateAuthError } from "@/lib/errors";
import { hasStoredSupabaseSession } from "@/lib/fast-auth";
import { useTheme } from "@/lib/theme";
import { appendComplaintAttachmentBlock } from "@/lib/complaint-attachments";
import {
  Send, Loader2, Sparkles, Headphones, CheckCircle2, ChevronLeft,
  Paperclip, X, Play, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/support-ai")({
  ssr: false,
  beforeLoad: () => {
    if (!hasStoredSupabaseSession()) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Чат с ИИ-помощником · NetSpas" },
      { name: "description", content: "Задайте вопрос ИИ-помощнику NetSpas — быстрые ответы 24/7." },
    ],
  }),
  component: AiChatPage,
});

type Attachment = {
  id: string;
  kind: "image" | "video";
  url: string;
  path: string;
  name: string;
  /** For images: downscaled JPEG data URL used to send to the AI (so the model
   *  reliably sees the image instead of relying on the provider fetching our
   *  signed Storage URL, which is often blocked/unreliable). */
  dataUrl?: string;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "system-note";
  content: string;
  attachments?: Attachment[];
};

const CHAT_KEY_PREFIX = "ns_ai_chat_v1_";

function greetingMsg(): Msg {
  return { id: "g", role: "assistant", content: GREETING };
}

function stripAttachmentUrls(m: Msg): Msg {
  if (!m.attachments?.length) return m;
  return {
    ...m,
    attachments: m.attachments.map((a) => ({ ...a, url: "" })),
  };
}

async function refreshAttachmentUrls(msgs: Msg[]): Promise<Msg[]> {
  const out: Msg[] = [];
  for (const m of msgs) {
    if (!m.attachments?.length) { out.push(m); continue; }
    const refreshed: Attachment[] = [];
    for (const a of m.attachments) {
      const { data } = await supabase.storage
        .from("complaints")
        .createSignedUrl(a.path, 3600);
      refreshed.push({ ...a, url: data?.signedUrl ?? a.url });
    }
    out.push({ ...m, attachments: refreshed });
  }
  return out;
}

async function imageFileToCompressedDataUrl(
  file: File,
  maxSize = 1280,
  quality = 0.82,
): Promise<string> {
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if (bitmap.src.startsWith("blob:")) URL.revokeObjectURL(bitmap.src);
  }
}

const GREETING =
  "Привет! Я ИИ-помощник NetSpas. Спросите про подключение, кулдаун, подписку — постараюсь ответить сразу. Можно прикрепить скриншот 📎 — я его увижу. Если не смогу помочь, передам оператору.";

function AiChatPage() {
  const navigate = useNavigate();
  const ask = useServerFn(askSupportAI);
  const { motion: motionPref } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([greetingMsg()]);
  const [hydrated, setHydrated] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [thinking, setThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingEscalate, setConfirmingEscalate] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const anim = motionPref !== "none";

  // Hydrate from localStorage (per-user).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = u.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const raw = localStorage.getItem(CHAT_KEY_PREFIX + uid);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Msg[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              const refreshed = await refreshAttachmentUrls(parsed);
              if (!cancelled) setMessages(refreshed);
            }
          } catch { /* corrupt — ignore */ }
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist on change (skip the initial greeting-only state).
  useEffect(() => {
    if (!hydrated || !userId) return;
    const onlyGreeting = messages.length === 1 && messages[0].id === "g";
    const key = CHAT_KEY_PREFIX + userId;
    if (onlyGreeting) {
      localStorage.removeItem(key);
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(messages.map(stripAttachmentUrls)));
    } catch { /* quota — ignore */ }
  }, [messages, userId, hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, confirmingEscalate, escalated, pending.length]);

  function clearChat() {
    setMessages([greetingMsg()]);
    setConfirmingEscalate(false);
    setEscalated(false);
    setConfirmClear(false);
    setText("");
    setPending([]);
    if (userId) localStorage.removeItem(CHAT_KEY_PREFIX + userId);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (uploading) return;
    const list = Array.from(files).slice(0, 6 - pending.length);
    if (list.length === 0) { toast.error("Максимум 6 файлов за сообщение"); return; }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("unauthorized");
      const uploaded: Attachment[] = [];
      for (const f of list) {
        const isImage = f.type.startsWith("image/");
        const isVideo = f.type.startsWith("video/");
        if (!isImage && !isVideo) { toast.error(`${f.name}: только фото или видео`); continue; }
        const limit = isVideo ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
        if (f.size > limit) {
          toast.error(`${f.name}: ${isVideo ? "видео до 20 МБ" : "фото до 10 МБ"}`);
          continue;
        }
        const ext = f.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = `${u.user.id}/ai-chat/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("complaints")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) { toast.error(`${f.name}: ${translateAuthError(upErr.message)}`); continue; }
        const { data: signed } = await supabase.storage
          .from("complaints")
          .createSignedUrl(path, 3600);
        if (!signed?.signedUrl) { toast.error(`${f.name}: не удалось получить ссылку`); continue; }
        let dataUrl: string | undefined;
        if (isImage) {
          try {
            dataUrl = await imageFileToCompressedDataUrl(f);
          } catch {
            // Non-fatal — AI just won't see it, but оператор ещё увидит.
          }
        }
        uploaded.push({
          id: crypto.randomUUID(),
          kind: isImage ? "image" : "video",
          url: signed.signedUrl,
          path,
          name: f.name,
          dataUrl,
        });
      }
      if (uploaded.length) setPending((p) => [...p, ...uploaded]);
    } catch (e: any) {
      toast.error(translateAuthError(e?.message ?? "Ошибка загрузки"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send() {
    const body = text.trim();
    if ((!body && pending.length === 0) || thinking || escalated || uploading) return;
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: body,
      attachments: pending.length ? pending : undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setText("");
    setPending([]);
    setThinking(true);
    try {
      const history = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-16)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          attachments: m.attachments?.map((a) => ({
            kind: a.kind,
            // Prefer inline data URL for images so the AI actually sees them.
            url: a.kind === "image" && a.dataUrl ? a.dataUrl : a.url,
            name: a.name,
          })),
        }));
      const res = await ask({ data: { messages: history } });
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: res.text },
      ]);
      if (res.escalate) setConfirmingEscalate(true);
    } catch (err) {
      console.error("[support-ai] request failed", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Не удалось получить ответ ИИ. Хотите, я передам вопрос оператору — он ответит в разделе «Мои обращения».",
        },
      ]);
      setConfirmingEscalate(true);
    } finally {
      setThinking(false);
    }
  }

  async function escalate() {
    if (creating) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      toast.error("Опишите вопрос — потом передам оператору");
      setConfirmingEscalate(false);
      return;
    }
    setCreating(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("unauthorized");
      const transcript = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => {
          const att = m.attachments?.length
            ? ` [вложения: ${m.attachments.map((a) => `${a.kind}:${a.name}`).join(", ")}]`
            : "";
          return `${m.role === "user" ? "Пользователь" : "ИИ"}: ${m.content}${att}`;
        })
        .join("\n\n");
      const baseDescription =
        `Обращение из чата с ИИ.\n\nВопрос: ${lastUser.content}\n\n— История —\n${transcript}`.slice(
          0, 2000,
        );
      const forwardedAttachments = [...messages]
        .reverse()
        .flatMap((m) => m.attachments ?? [])
        .map((a) => ({ kind: a.kind, path: a.path, name: a.name }));
      const description = appendComplaintAttachmentBlock(baseDescription, forwardedAttachments);
      const firstVideo = forwardedAttachments.find((a) => a.kind === "video");
      const { error } = await supabase.from("complaints").insert({
        user_id: u.user.id,
        description,
        video_url: firstVideo?.path ?? null,
        status: "new",
        category: "question",
        phone: null,
      });
      if (error) throw error;
      setEscalated(true);
      setConfirmingEscalate(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system-note",
          content:
            "Ваше обращение передано оператору. Обычно ответ приходит в течение 5–15 минут — он появится в разделе «Мои обращения».",
        },
      ]);
    } catch (e: any) {
      toast.error(translateAuthError(e?.message ?? "Не удалось создать обращение"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col text-foreground"
      style={{ background: "var(--app-bg)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="safe-top shrink-0 border-b border-border" style={{ background: "var(--card-solid)" }}>
        <div className="flex h-13 items-center gap-2 px-2">
          <Link
            to="/support"
            className="tg-press grid h-11 w-11 place-items-center rounded-full text-primary"
            aria-label="Назад"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-[18px] w-[18px] text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight text-foreground">ИИ-помощник</p>
            <p className="truncate text-[11px] leading-tight text-emerald-400">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
              онлайн · отвечает мгновенно
            </p>
          </div>
          {messages.length > 1 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="tg-press grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              aria-label="Очистить чат"
              title="Очистить чат"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Messages (scroll area) */}
      <div className="ns-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 pb-3">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} anim={anim} />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {thinking && (
              <motion.div
                key="thinking"
                initial={anim ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={anim ? { opacity: 0 } : undefined}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex justify-start"
              >
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
          {confirmingEscalate && !escalated && (
            <motion.div
              initial={anim ? { opacity: 0, y: 8, scale: 0.98 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={anim ? { opacity: 0, y: 4 } : undefined}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="mt-1 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-[13px]"
            >
              <p className="mb-2 font-medium text-foreground">Передать вопрос оператору?</p>
              <p className="mb-3 text-[12px] text-muted-foreground">
                Оператор ответит в разделе «Мои обращения», обычно за несколько минут.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingEscalate(false)}
                  disabled={creating}
                  className="tg-press flex-1 rounded-xl border border-border bg-transparent py-2 text-[13px] font-medium text-muted-foreground"
                >
                  Не надо
                </button>
                <button
                  onClick={escalate}
                  disabled={creating}
                  className="tg-press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Headphones className="h-3.5 w-3.5" />}
                  Передать
                </button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div
        className="shrink-0 border-t border-border px-3 pt-2"
        style={{ background: "var(--card-solid)", paddingBottom: "max(0.5rem, var(--ns-control-bottom-fill))" }}
      >
        {escalated ? (
          <button
            onClick={() => navigate({ to: "/support" })}
            className="tg-press flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-medium text-primary-foreground"
          >
            Перейти к моим обращениям
          </button>
        ) : (
          <div className="mx-auto max-w-2xl">
            <AnimatePresence initial={false}>
            {pending.length > 0 && (
              <motion.div
                key="pending"
                initial={anim ? { opacity: 0, height: 0 } : false}
                animate={{ opacity: 1, height: "auto" }}
                exit={anim ? { opacity: 0, height: 0 } : undefined}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="mb-2 flex gap-2 overflow-x-auto pb-1"
              >
                {pending.map((a) => (
                  <motion.div
                    key={a.id}
                    layout={anim}
                    initial={anim ? { opacity: 0, scale: 0.9 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={anim ? { opacity: 0, scale: 0.9 } : undefined}
                    transition={{ type: "spring", stiffness: 360, damping: 26 }}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    {a.kind === "image" ? (
                      <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-black text-white">
                        <Play className="h-5 w-5" />
                      </div>
                    )}
                    <button
                      onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))}
                      className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white"
                      aria-label="Убрать"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
            </AnimatePresence>
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || pending.length >= 6}
                className="tg-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground disabled:opacity-50"
                aria-label="Прикрепить"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Сообщение…"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-input px-4 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
              />
              <button
                onClick={send}
                disabled={thinking || uploading || (!text.trim() && pending.length === 0)}
                className="tg-press grid h-10 w-10 shrink-0 place-items-center rounded-full text-white disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
                aria-label="Отправить"
              >
                {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => setConfirmingEscalate(true)}
              className="tg-press mt-1.5 flex w-full items-center justify-center gap-1.5 py-1 text-[11.5px] font-medium text-muted-foreground"
            >
              <Headphones className="h-3 w-3" /> Позвать оператора
            </button>
          </div>
        )}
      </div>

      {/* Clear chat confirm */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            key="clear-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            onClick={() => setConfirmClear(false)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={anim ? { opacity: 0, y: 24, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={anim ? { opacity: 0, y: 24, scale: 0.96 } : undefined}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="w-full max-w-[340px] rounded-2xl border border-border p-5"
              style={{ background: "var(--card-solid)", boxShadow: "var(--shadow-elegant)" }}
            >
              <div className="mb-2 flex items-center gap-2 text-[16px] font-semibold text-foreground">
                <Trash2 className="h-4 w-4 text-destructive" /> Очистить чат?
              </div>
              <p className="text-[13px] text-muted-foreground">
                История переписки с ИИ будет удалена. Обращения, переданные оператору, сохранятся.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="tg-press flex-1 rounded-xl border border-border py-2.5 text-[13px] font-medium text-foreground"
                >
                  Отмена
                </button>
                <button
                  onClick={clearChat}
                  className="tg-press flex-1 rounded-xl py-2.5 text-[13px] font-medium text-white"
                  style={{ background: "linear-gradient(135deg,#F43F5E,#B91C1C)" }}
                >
                  Очистить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageBubble({ m, anim }: { m: Msg; anim: boolean }) {
  const enter = anim
    ? { initial: { opacity: 0, y: 8, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0 } }
    : { initial: false as const, animate: { opacity: 1 } };
  if (m.role === "system-note") {
    return (
      <motion.div
        layout={anim}
        {...enter}
        transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.7 }}
        className="flex justify-center"
      >
        <div className="max-w-[92%] rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-[12px] text-emerald-300">
          <CheckCircle2 className="mr-1 -mt-0.5 inline h-3.5 w-3.5" />
          {m.content}
        </div>
      </motion.div>
    );
  }
  const isUser = m.role === "user";
  return (
    <motion.div
      layout={anim}
      {...enter}
      transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.7 }}
      className={isUser ? "flex justify-end" : "flex justify-start"}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-snug ${
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-card text-foreground"
        }`}
      >
        {!isUser && (
          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-primary">
            <Sparkles className="h-2.5 w-2.5" /> ИИ
          </p>
        )}
        {m.attachments && m.attachments.length > 0 && (
          <div
            className="mb-1.5 grid gap-1.5"
            style={{ gridTemplateColumns: m.attachments.length > 1 ? "1fr 1fr" : "1fr" }}
          >
            {m.attachments.map((a) => (
              <AttachmentPreview key={a.id} a={a} />
            ))}
          </div>
        )}
        {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
      </div>
    </motion.div>
  );
}

function AttachmentPreview({ a }: { a: Attachment }) {
  if (a.kind === "image") {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
        <img src={a.url} alt={a.name} className="max-h-56 w-full object-cover" />
      </a>
    );
  }
  return (
    <video src={a.url} controls playsInline className="max-h-56 w-full rounded-xl bg-black" />
  );
}