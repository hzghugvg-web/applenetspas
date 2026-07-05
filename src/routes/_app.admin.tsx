import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { Plus, Trash2, RotateCcw, Ban, CheckCircle2, MessageCircle, Megaphone, Send, Pencil, X } from "lucide-react";
import { ComplaintChatModal } from "@/components/ComplaintChat";

export const Route = createFileRoute("/_app/admin")({ component: AdminPage });

type Direction = { id: string; name: string; flag: string | null; is_active: boolean };
type VlessLink = { id: string; url: string; direction_id: string; is_active: boolean; available_from: string | null; expires_at: string | null };
type UserRow = { id: string; email: string; is_blocked: boolean; cooldown_until: string | null; subscription_from: string | null; subscription_until: string | null };
type IssuedConfig = { id: string; vless_url: string; issued_at: string; direction_id: string | null };

function AdminPage() {
  const [tab, setTab] = useState<"catalog" | "users" | "complaints" | "broadcast">("catalog");
  const { data: isAdmin, isLoading } = useIsAdmin();

  if (isLoading || isAdmin === undefined)
    return <><div className="text-center text-muted-foreground">Загрузка…</div></>;
  if (!isAdmin)
    return <><div className="text-center text-muted-foreground">Нет доступа</div></>;

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
        {([
          ["catalog", "Каталог"],
          ["users", "Пользователи"],
          ["complaints", "Обращения"],
          ["broadcast", "Рассылка"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`tg-press rounded-xl py-2 text-xs font-medium transition-colors ${tab === k ? "bg-card-solid text-foreground shadow" : "text-muted-foreground"}`}
            style={tab === k ? { background: "var(--card-solid)" } : undefined}>
            {l}
          </button>
        ))}
      </div>
      {tab === "catalog" && <CatalogTab />}
      {tab === "users" && <UsersTab />}
      {tab === "complaints" && <ComplaintsTab />}
      {tab === "broadcast" && <BroadcastTab />}
    </>
  );
}

type BroadcastRow = {
  id: string;
  message: string;
  title: string | null;
  link: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
  delivery_style?: "top" | "imessage";
};

function BroadcastTab() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [deliveryStyle, setDeliveryStyle] = useState<"top" | "imessage">("imessage");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<BroadcastRow[]>([]);

  async function load() {
    const { data } = await (supabase as any)
      .from("broadcasts")
      .select("id,message,title,link,email,website,created_at,delivery_style")
      .order("created_at", { ascending: false })
      .limit(30);
    setList((data ?? []) as BroadcastRow[]);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setTitle(""); setMessage(""); setLink(""); setEmail(""); setWebsite("");
    setDeliveryStyle("imessage");
    setEditingId(null);
  }

  function startEdit(b: BroadcastRow) {
    setEditingId(b.id);
    setTitle(b.title ?? "");
    setMessage(b.message ?? "");
    setLink(b.link ?? "");
    setEmail(b.email ?? "");
    setWebsite(b.website ?? "");
    setDeliveryStyle((b.delivery_style ?? "imessage") as "top" | "imessage");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!message.trim()) return;
    setSaving(true);
    await supabase.auth.refreshSession();
    const payload = {
      _message: message.trim(),
      _title: title.trim() || null,
      _link: link.trim() || null,
      _email: email.trim() || null,
      _website: website.trim() || null,
      _delivery_style: deliveryStyle,
    };
    const { error } = editingId
      ? await (supabase as any).rpc("admin_update_broadcast", { _id: editingId, ...payload })
      : await (supabase as any).rpc("admin_send_broadcast", payload);
    setSaving(false);
    if (error) toast.error(translateAuthError(error.message));
    else {
      toast.success(editingId ? "Сообщение обновлено" : "Отправлено");
      resetForm();
      load();
      const { reloadBroadcasts } = await import("@/components/BroadcastBanner");
      reloadBroadcasts();
    }
  }

  async function del(id: string) {
    if (!confirm("Удалить сообщение?")) return;
    const { error } = await (supabase as any).rpc("admin_delete_broadcast", { _id: id });
    if (error) toast.error(translateAuthError(error.message));
    else { if (editingId === id) resetForm(); load(); }
  }

  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-2xl border border-border p-4" style={{ background: "var(--card-solid)" }}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Megaphone className="h-4 w-4 text-primary" />
          {editingId ? "Редактировать сообщение" : "Новое сообщение всем"}
          {editingId && (
            <button onClick={resetForm} className="ml-auto text-muted-foreground" aria-label="Отменить">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок (необязательно)"
          className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none focus:border-primary"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Напишите объявление — можно вставлять ссылки. Пользователи увидят его в виде баннера сверху и подтвердят прочтение."
          rows={4}
          className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Ссылка (необязательно) — кнопка «Копировать ссылку»"
          className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Сайт (необязательно) — например netspas.1c-umi.ru"
          className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Почта (необязательно) — например netspas@internet.ru"
          className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none focus:border-primary"
        />
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Способ показа</div>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {([
              ["top", "Сверху плашкой"],
              ["imessage", "По центру (iPhone)"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDeliveryStyle(k)}
                className={`tg-press rounded-full py-1.5 text-[12px] font-medium transition-colors ${
                  deliveryStyle === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {deliveryStyle === "top"
              ? "Появится тонкой плашкой сверху — пользователь нажмёт и прочитает."
              : "Откроется по центру как уведомление на iPhone — нужно нажать «Прочитано»."}
          </p>
        </div>
        <button onClick={submit} disabled={saving || !message.trim()} className="tg-btn w-full">
          <Send className="h-4 w-4" />
          {saving ? "Сохранение..." : editingId ? "Сохранить изменения" : "Отправить всем"}
        </button>
      </section>

      <div className="text-xs uppercase tracking-wider text-muted-foreground">История</div>
      {list.length === 0 && <p className="text-center text-sm text-muted-foreground">Пока нет сообщений</p>}
      {list.map((b) => (
        <div key={b.id} className="flex items-start gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleString("ru-RU")}</div>
            {b.title && <div className="mt-1 text-[13px] font-semibold">{b.title}</div>}
            <div className="mt-1 whitespace-pre-wrap break-words text-[13px]">{b.message}</div>
            {b.link && (
              <div className="mt-1 break-all rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">🔗 {b.link}</div>
            )}
            {b.website && (
              <div className="mt-1 break-all rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">🌐 {b.website}</div>
            )}
            {b.email && (
              <div className="mt-1 break-all rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">✉️ {b.email}</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => startEdit(b)} className="text-primary" aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => del(b.id)} className="text-destructive" aria-label="Удалить">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogTab() {
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [links, setLinks] = useState<VlessLink[]>([]);
  const [name, setName] = useState(""); const [flag, setFlag] = useState("");
  const [openDir, setOpenDir] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const [fromDraft, setFromDraft] = useState<Record<string, string>>({});
  const [untilDraft, setUntilDraft] = useState<Record<string, string>>({});

  async function load() {
    await supabase.rpc("cleanup_expired_vless_links");
    const [{ data: ds }, { data: ls }] = await Promise.all([
      supabase.from("directions").select("*").order("name"),
      supabase.from("vless_links").select("*").order("created_at", { ascending: false }),
    ]);
    setDirs((ds ?? []) as Direction[]);
    setLinks((ls ?? []) as VlessLink[]);
  }
  useEffect(() => { load(); }, []);

  async function addDir() {
    if (!name) return;
    const { error } = await supabase.from("directions").insert({ name, flag: flag || null });
    if (error) toast.error(translateAuthError(error.message));
    else { setName(""); setFlag(""); load(); toast.success("Направление добавлено"); }
  }
  async function toggleDir(d: Direction) {
    await supabase.from("directions").update({ is_active: !d.is_active }).eq("id", d.id); load();
  }
  async function delDir(id: string) {
    if (!confirm("Удалить направление вместе со ссылками?")) return;
    await supabase.from("directions").delete().eq("id", id); load();
  }
  async function addLink(dirId: string) {
    const url = (urlDraft[dirId] ?? "").trim();
    if (!url) return;
    const from = fromDraft[dirId] ? new Date(fromDraft[dirId]).toISOString() : null;
    const until = untilDraft[dirId] ? new Date(untilDraft[dirId]).toISOString() : null;
    if (from && until && new Date(until).getTime() <= new Date(from).getTime()) {
      toast.error("Дата окончания должна быть позже даты запуска");
      return;
    }
    const { error } = await supabase.from("vless_links").insert({
      direction_id: dirId,
      url,
      available_from: from,
      expires_at: until,
    });
    if (error) toast.error(translateAuthError(error.message));
    else {
      setUrlDraft((s) => ({ ...s, [dirId]: "" }));
      setFromDraft((s) => ({ ...s, [dirId]: "" }));
      setUntilDraft((s) => ({ ...s, [dirId]: "" }));
      load();
      toast.success("Ссылка добавлена");
    }
  }
  async function delLink(id: string) {
    if (!confirm("Удалить ссылку?")) return;
    await supabase.from("vless_links").delete().eq("id", id); load();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-border p-4" style={{ background: "var(--card-solid)" }}>
        <div className="text-sm font-medium">Новое направление</div>
        <div className="flex gap-2">
          <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="🇳🇱" className="h-11 w-16 rounded-xl border border-border bg-input px-3 text-center outline-none focus:border-primary" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" className="h-11 flex-1 rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
          <button onClick={addDir} className="grid h-11 w-11 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {dirs.map((d) => {
        const dirLinks = links.filter((l) => l.direction_id === d.id);
        const open = openDir === d.id;
        return (
          <div key={d.id} className="overflow-hidden rounded-2xl border border-border" style={{ background: "var(--card-solid)" }}>
            <div className="flex items-center gap-3 p-3">
              <span className="text-xl">{d.flag}</span>
              <button onClick={() => setOpenDir(open ? null : d.id)} className="flex-1 text-left">
                <div className="text-sm font-medium">{d.name}</div>
                <div className="text-[11px] text-muted-foreground">{dirLinks.length} ссылок · {d.is_active ? "активно" : "выключено"}</div>
              </button>
              <button onClick={() => toggleDir(d)} className="tg-press rounded-lg bg-secondary px-2 py-1 text-xs">{d.is_active ? "Вкл" : "Выкл"}</button>
              <button onClick={() => delDir(d.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            {open && (
              <div className="space-y-2 border-t border-border p-3">
                <div className="space-y-2">
                  <textarea
                    value={urlDraft[d.id] ?? ""}
                    onChange={(e) => setUrlDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                    placeholder="vless://..."
                    rows={2}
                    className="w-full rounded-xl border border-border bg-input px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Дата запуска VPN</span>
                      <input
                        type="datetime-local"
                        value={fromDraft[d.id] ?? ""}
                        onChange={(e) => setFromDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-border bg-input px-2 text-[11px] outline-none focus:border-primary"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Дата окончания VPN</span>
                      <input
                        type="datetime-local"
                        value={untilDraft[d.id] ?? ""}
                        onChange={(e) => setUntilDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-border bg-input px-2 text-[11px] outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                  <button onClick={() => addLink(d.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                    <Plus className="h-5 w-5" /> Добавить ссылку
                  </button>
                </div>
                {dirLinks.length === 0 && <p className="text-center text-[11px] text-muted-foreground">Ссылок пока нет</p>}
                {dirLinks.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 rounded-xl bg-muted p-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="break-all text-[11px] text-muted-foreground">{l.url}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Старт: {l.available_from ? new Date(l.available_from).toLocaleString("ru-RU") : "сразу"} · Конец: {l.expires_at ? new Date(l.expires_at).toLocaleString("ru-RU") : "не задан"}
                      </div>
                    </div>
                    <button onClick={() => delLink(l.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {!dirs.length && <p className="text-center text-sm text-muted-foreground">Направлений пока нет</p>}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  async function load() {
    const { data } = await supabase.from("profiles").select("id,email,is_blocked,cooldown_until,subscription_from,subscription_until").order("created_at", { ascending: false });
    setUsers((data ?? []) as UserRow[]);
  }
  useEffect(() => { load(); }, []);
  async function resetCd(id: string) {
    const { error } = await supabase.rpc("admin_reset_cooldown", { _target: id });
    if (error) toast.error(translateAuthError(error.message)); else { toast.success("Кулдаун сброшен"); load(); }
  }
  async function toggleBlock(u: UserRow) {
    const { error } = await supabase.rpc("admin_toggle_block", { _target: u.id, _block: !u.is_blocked });
    if (error) toast.error(translateAuthError(error.message)); else { load(); }
  }
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="flex w-full items-center gap-2">
            <span className="flex-1 truncate text-sm font-medium">{u.email}</span>
            {u.is_blocked && <span className="rounded bg-destructive/20 px-2 py-0.5 text-xs text-destructive">Блок</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            CD: {u.cooldown_until ? new Date(u.cooldown_until).toLocaleString("ru-RU") : "—"}
          </div>
          <div className="flex gap-2">
            <button onClick={() => resetCd(u.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-secondary py-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Сброс CD
            </button>
            <button onClick={() => toggleBlock(u)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-secondary py-2 text-xs">
              {u.is_blocked ? <><CheckCircle2 className="h-3.5 w-3.5" /> Разблок</> : <><Ban className="h-3.5 w-3.5" /> Блок</>}
            </button>
          </div>
          <UserDetails user={u} onChanged={load} />
        </div>
      ))}
      {!users.length && <div className="text-center text-sm text-muted-foreground">Нет пользователей</div>}
    </div>
  );
}

function toLocalInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function UserDetails({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const [from, setFrom] = useState(toLocalInput(user.subscription_from));
  const [until, setUntil] = useState(toLocalInput(user.subscription_until));
  const [configs, setConfigs] = useState<IssuedConfig[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadConfigs() {
    const { data } = await supabase
      .from("issued_configs")
      .select("id,vless_url,issued_at,direction_id")
      .eq("user_id", user.id)
      .order("issued_at", { ascending: false });
    setConfigs((data ?? []) as IssuedConfig[]);
  }
  useEffect(() => { loadConfigs(); }, [user.id]);

  async function saveDates() {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_subscription_dates", {
      _target: user.id,
      _from: (from ? new Date(from).toISOString() : null) as any,
      _until: (until ? new Date(until).toISOString() : null) as any,
    });
    setSaving(false);
    if (error) toast.error(translateAuthError(error.message));
    else { toast.success("Даты обновлены"); onChanged(); }
  }

  async function deleteConfig(id: string) {
    if (!confirm("Удалить конфигурацию у пользователя?")) return;
    const { error } = await supabase.rpc("admin_delete_issued_config", { _config_id: id });
    if (error) toast.error(translateAuthError(error.message));
    else { toast.success("Конфигурация удалена"); loadConfigs(); }
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-muted p-3">
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">Дата начала VPN</div>
        <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-input px-2 text-xs outline-none" />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">Дата окончания VPN</div>
        <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-input px-2 text-xs outline-none" />
      </div>
      <button onClick={saveDates} disabled={saving}
        className="tg-press h-9 w-full rounded-md bg-primary text-xs text-primary-foreground disabled:opacity-60">
        {saving ? "Сохранение..." : "Сохранить даты"}
      </button>

      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">Выданные конфигурации ({configs.length})</div>
        {configs.length === 0 && <p className="text-[11px] text-muted-foreground">Нет конфигураций</p>}
        {configs.map((c) => (
          <div key={c.id} className="flex items-start gap-2 rounded-md bg-card p-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-muted-foreground">{new Date(c.issued_at).toLocaleString("ru-RU")}</div>
              <div className="break-all text-[10px] text-muted-foreground">{c.vless_url.slice(0, 60)}...</div>
            </div>
            <button onClick={() => deleteConfig(c.id)} className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type AdminComplaint = {
  id: string;
  user_id: string;
  description: string;
  video_url: string | null;
  status: "new" | "in_progress" | "resolved" | "rejected";
  admin_reply: string | null;
  created_at: string;
  category: "question" | "problem";
  phone: string | null;
  profiles?: { email: string } | null;
};

const CSTATUS: Record<AdminComplaint["status"], { label: string; dot: string }> = {
  new: { label: "Новая", dot: "bg-yellow-400" },
  in_progress: { label: "В работе", dot: "bg-primary" },
  resolved: { label: "Решена", dot: "bg-emerald-500" },
  rejected: { label: "Отклонена", dot: "bg-destructive" },
};

function ComplaintsTab() {
  const [list, setList] = useState<AdminComplaint[]>([]);
  const [filter, setFilter] = useState<"all" | AdminComplaint["status"]>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    let q = supabase
      .from("complaints")
      .select("id,user_id,description,video_url,status,admin_reply,created_at,category,phone")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    const rows = (data ?? []) as AdminComplaint[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.email]));
      for (const r of rows) r.profiles = { email: map.get(r.user_id) ?? "—" };
    }
    setList(rows);
  }
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
        {([
          ["all", "Все"],
          ["new", "Новые"],
          ["in_progress", "В работе"],
          ["resolved", "Решены"],
          ["rejected", "Отклонены"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`tg-press whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
              filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-center text-sm text-muted-foreground">Обращений нет</p>}
      {list.map((c) => (
        <AdminComplaintCard
          key={c.id}
          c={c}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          onChanged={load}
        />
      ))}
    </div>
  );
}

function AdminComplaintCard({
  c, open, onToggle, onChanged,
}: {
  c: AdminComplaint;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [dirs, setDirs] = useState<{ id: string; name: string; flag: string | null }[]>([]);
  const [dir, setDir] = useState<string>("");

  useEffect(() => {
    if (!open || !c.video_url) return;
    supabase.storage.from("complaints").createSignedUrl(c.video_url, 3600)
      .then(({ data }) => setVideoUrl(data?.signedUrl ?? null));
  }, [open, c.video_url]);

  useEffect(() => {
    if (!open) return;
    supabase.from("directions").select("id,name,flag").eq("is_active", true).order("name")
      .then(({ data }) => {
        setDirs(data ?? []);
        if (data?.length && !dir) setDir(data[0].id);
      });
  }, [open]);

  async function issueConfig() {
    if (!dir) return;
    const { error } = await supabase.rpc("admin_issue_config_for", {
      _target: c.user_id, _direction_id: dir,
    });
    if (error) toast.error(translateAuthError(error.message));
    else {
      await supabase.rpc("admin_update_complaint", {
        _id: c.id, _status: "resolved", _reply: "Выдана новая конфигурация",
      });
      toast.success("Конфигурация выдана");
      onChanged();
    }
  }

  return (
    <>
      <button
        onClick={onToggle}
        className="tg-press flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CSTATUS[c.status].dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{c.profiles?.email ?? c.user_id.slice(0, 8)}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {CSTATUS[c.status].label} · {c.category === "problem" ? "Проблема" : "Вопрос"} · {new Date(c.created_at).toLocaleDateString("ru-RU")}
          </p>
        </div>
        <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <ComplaintChatModal
        open={open}
        onClose={onToggle}
        title={c.profiles?.email ?? "Обращение"}
        subtitle={`${CSTATUS[c.status].label} · ${c.category === "problem" ? "Проблема" : "Вопрос"}`}
        complaintId={c.id}
        asAdmin={true}
        closed={c.status === "resolved" || c.status === "rejected"}
        onClosed={onChanged}
        beforeChat={
          <div className="space-y-2 rounded-xl bg-card p-2 text-[13px]">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-block rounded-full bg-muted px-2 py-0.5 text-[12px] text-primary">
                📞 {c.phone}
              </a>
            )}
            <p className="whitespace-pre-wrap text-foreground/90">{c.description}</p>
            {videoUrl && <video src={videoUrl} controls playsInline className="w-full rounded-lg bg-black" />}
            <div className="space-y-2 rounded-lg bg-muted p-2">
              <p className="text-[11px] text-muted-foreground">Выдать конфигурацию (сбросит кулдаун):</p>
              <div className="flex gap-2">
                <select
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-input px-2 text-xs outline-none"
                >
                  {dirs.map((d) => <option key={d.id} value={d.id}>{d.flag} {d.name}</option>)}
                </select>
                <button
                  onClick={issueConfig}
                  className="tg-press rounded-md bg-primary px-3 text-xs text-primary-foreground"
                >
                  Выдать
                </button>
              </div>
            </div>
          </div>
        }
      />
    </>
  );
}
