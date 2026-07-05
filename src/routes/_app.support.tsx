import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { alertDialog as toast } from "@/lib/alert";
import { translateAuthError } from "@/lib/errors";
import { Plus, Upload, X, Loader2, MessageCircle } from "lucide-react";
import { ComplaintChatModal } from "@/components/ComplaintChat";

export const Route = createFileRoute("/_app/support")({ component: SupportPage });

type Complaint = {
  id: string;
  description: string;
  video_url: string | null;
  status: "new" | "in_progress" | "resolved" | "rejected";
  admin_reply: string | null;
  created_at: string;
  category: "question" | "problem";
  phone: string | null;
};

const STATUS_LABEL: Record<Complaint["status"], string> = {
  new: "Новая",
  in_progress: "В работе",
  resolved: "Решена",
  rejected: "Отклонена",
};

const STATUS_DOT: Record<Complaint["status"], string> = {
  new: "bg-yellow-400",
  in_progress: "bg-primary",
  resolved: "bg-emerald-500",
  rejected: "bg-destructive",
};

function SupportPage() {
  return (
    <>
      <MyComplaints />
    </>
  );
}

function MyComplaints() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);

  const { data: items = [] } = useQuery<Complaint[]>({
    queryKey: ["complaints"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("complaints")
        .select("id,description,video_url,status,admin_reply,created_at,category,phone")
        .order("created_at", { ascending: false });
      return (data ?? []) as Complaint[];
    },
  });
  const load = () => qc.invalidateQueries({ queryKey: ["complaints"] });

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpenForm(true)}
        className="tg-press flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-medium text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> Новое обращение
      </button>

      {items.length === 0 && (
        <p className="pt-4 text-center text-[14px] text-muted-foreground">Обращений пока нет</p>
      )}

      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setChatId(c.id)}
          className="tg-press flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left"
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-foreground">{c.description}</p>
            <p className="text-[12px] text-muted-foreground">
              {STATUS_LABEL[c.status]} · {new Date(c.created_at).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}

      {items.map((c) => (
        <ComplaintChatModal
          key={`m-${c.id}`}
          open={chatId === c.id}
          onClose={() => setChatId(null)}
          title={c.category === "problem" ? "Проблема" : "Вопрос"}
          subtitle={`${STATUS_LABEL[c.status]} · ${new Date(c.created_at).toLocaleDateString("ru-RU")}`}
          complaintId={c.id}
          asAdmin={false}
          closed={c.status === "resolved" || c.status === "rejected"}
          onClosed={load}
          beforeChat={
            <div className="space-y-2 rounded-xl bg-card p-2 text-[13px]">
              <p className="whitespace-pre-wrap text-foreground/90">{c.description}</p>
              {c.phone && <p className="text-[12px] text-muted-foreground">📞 {c.phone}</p>}
              {c.video_url && <VideoPlayer path={c.video_url} />}
            </div>
          }
        />
      ))}

      {openForm && (
        <ComplaintForm
          onClose={() => setOpenForm(false)}
          onSaved={() => { setOpenForm(false); load(); }}
        />
      )}
    </div>
  );
}

function VideoPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.storage.from("complaints").createSignedUrl(path, 3600);
      if (alive) setUrl(data?.signedUrl ?? null);
    })();
    return () => { alive = false; };
  }, [path]);
  if (!url) return <div className="text-[12px] text-muted-foreground">Загрузка видео…</div>;
  return <video src={url} controls playsInline className="w-full rounded-lg bg-black" />;
}

function ComplaintForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<"question" | "problem">("question");
  const [desc, setDesc] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("Файл должен быть видео"); return; }
    if (f.size > 20 * 1024 * 1024) { toast.error("Видео до 20 МБ"); return; }
    setFile(f);
  }

  async function submit() {
    if (!desc.trim()) { toast.error("Опишите проблему"); return; }
    if (category === "problem" && !file) { toast.error("Для проблемы прикрепите видео"); return; }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("unauthorized");
      let path: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "mp4";
        path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
        setProgress(20);
        const { error: upErr } = await supabase.storage
          .from("complaints")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        setProgress(80);
      } else {
        setProgress(60);
      }
      const { error: insErr } = await supabase.from("complaints").insert({
        user_id: u.user.id,
        description: desc.trim(),
        video_url: path,
        status: "new",
        category,
        phone: phone.trim() || null,
      });
      if (insErr) throw insErr;
      setProgress(100);
      toast.success("Обращение отправлено");
      onSaved();
    } catch (e: any) {
      toast.error(translateAuthError(e.message ?? "Ошибка"));
    } finally {
      setUploading(false);
    }
  }

  const [closing, setClosing] = useState(false);
  function requestClose() {
    if (closing) return;
    setClosing(true);
    // Keep backdrop mounted for ~280ms so tap-through / ghost-click
    // can't reach the complaint cards behind the modal.
    setTimeout(onClose, 280);
  }

  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      style={{ pointerEvents: "auto", touchAction: "none" }}
      onPointerDown={(e) => { e.preventDefault(); requestClose(); }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: closing ? 60 : 0, opacity: closing ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.9 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-2xl bg-card p-4"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-semibold">Новое обращение</h3>
          <button
            type="button"
            aria-label="Закрыть"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); requestClose(); }}
            className="tg-press -mr-1 grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="pointer-events-none h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {([
            ["question", "Вопрос"],
            ["problem", "Проблема"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k)}
              className={`tg-press rounded-full py-1.5 text-[13px] font-medium transition-colors ${
                category === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={category === "problem" ? "Опишите проблему…" : "Ваш вопрос…"}
          rows={4}
          className="w-full rounded-xl border border-border bg-input p-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          placeholder="Телефон (необязательно)"
          className="w-full rounded-xl border border-border bg-input p-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
        />
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="tg-press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted py-3 text-[14px] text-muted-foreground"
        >
          <Upload className="h-4 w-4" />
          {file
            ? file.name
            : category === "problem"
              ? "Прикрепить видео (до 20 МБ) — обязательно"
              : "Прикрепить видео (необязательно)"}
        </button>
        {uploading && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <button
          onClick={submit}
          disabled={uploading}
          className="tg-press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-medium text-primary-foreground disabled:opacity-60"
        >
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          Отправить
        </button>
      </motion.div>
    </motion.div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}