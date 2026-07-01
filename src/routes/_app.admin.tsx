import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { Plus, Trash2, RotateCcw, Ban, CheckCircle2, MessageCircle } from "lucide-react";
import { ComplaintChatModal } from "@/components/ComplaintChat";

export const Route = createFileRoute("/_app/admin")({ component: AdminPage });

type Direction = { id: string; name: string; flag: string | null; is_active: boolean };
type VlessLink = { id: string; url: string; direction_id: string; is_active: boolean };
type UserRow = { id: string; email: string; is_blocked: boolean; cooldown_until: string | null; subscription_until: string | null };

function AdminPage() {
  const [tab, setTab] = useState<"dirs" | "links" | "users" | "complaints">("dirs");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setIsAdmin(false); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  if (isAdmin === false) return <MobileShell title="Админ"><div className="text-center text-muted-foreground">Нет доступа</div></MobileShell>;
  if (isAdmin === null) return <MobileShell title="Админ"><div className="text-center text-muted-foreground">Загрузка...</div></MobileShell>;

  return (
    <MobileShell title="Админ-панель">
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
        {([
          ["dirs", "Направления"],
          ["links", "Ссылки"],
          ["users", "Пользователи"],
          ["complaints", "Обращения"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg py-2 text-xs font-medium transition-colors ${tab === k ? "bg-card text-foreground" : "text-muted-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "dirs" && <DirectionsTab />}
      {tab === "links" && <LinksTab />}
      {tab === "users" && <UsersTab />}
      {tab === "complaints" && <ComplaintsTab />}
    </MobileShell>
  );
}

function DirectionsTab() {
  const [list, setList] = useState<Direction[]>([]);
  const [name, setName] = useState(""); const [flag, setFlag] = useState("");
  async function load() {
    const { data } = await supabase.from("directions").select("*").order("name");
    setList((data ?? []) as Direction[]);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!name) return;
    const { error } = await supabase.from("directions").insert({ name, flag: flag || null });
    if (error) toast.error(translateAuthError(error.message));
    else { setName(""); setFlag(""); load(); toast.success("Добавлено"); }
  }
  async function toggle(d: Direction) {
    await supabase.from("directions").update({ is_active: !d.is_active }).eq("id", d.id); load();
  }
  async function del(id: string) {
    if (!confirm("Удалить направление?")) return;
    await supabase.from("directions").delete().eq("id", id); load();
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-medium">Добавить направление</div>
        <div className="flex gap-2">
          <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="🇳🇱" className="h-11 w-16 rounded-xl border border-border bg-input px-3 text-center outline-none focus:border-primary" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" className="h-11 flex-1 rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
          <button onClick={add} className="grid h-11 w-11 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
      {list.map((d) => (
        <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <span className="text-xl">{d.flag}</span>
          <span className="flex-1 text-sm font-medium">{d.name}</span>
          <button onClick={() => toggle(d)} className="rounded-lg bg-secondary px-2 py-1 text-xs">{d.is_active ? "Вкл" : "Выкл"}</button>
          <button onClick={() => del(d.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function LinksTab() {
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [links, setLinks] = useState<VlessLink[]>([]);
  const [dir, setDir] = useState<string>(""); const [url, setUrl] = useState("");
  async function load() {
    const [{ data: ds }, { data: ls }] = await Promise.all([
      supabase.from("directions").select("*").order("name"),
      supabase.from("vless_links").select("*").order("created_at", { ascending: false }),
    ]);
    setDirs((ds ?? []) as Direction[]);
    setLinks((ls ?? []) as VlessLink[]);
    if (!dir && ds?.length) setDir(ds[0].id);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!dir || !url) return;
    const { error } = await supabase.from("vless_links").insert({ direction_id: dir, url });
    if (error) toast.error(translateAuthError(error.message));
    else { setUrl(""); load(); toast.success("Добавлено"); }
  }
  async function del(id: string) {
    if (!confirm("Удалить ссылку?")) return;
    await supabase.from("vless_links").delete().eq("id", id); load();
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-medium">Добавить VLESS-ссылку</div>
        <select value={dir} onChange={(e) => setDir(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary">
          {dirs.map((d) => <option key={d.id} value={d.id}>{d.flag} {d.name}</option>)}
        </select>
        <textarea value={url} onChange={(e) => setUrl(e.target.value)} placeholder="vless://..." rows={3}
          className="w-full rounded-xl border border-border bg-input px-3 py-2 text-xs outline-none focus:border-primary" />
        <button onClick={add} className="h-11 w-full rounded-xl font-medium text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>Добавить</button>
      </div>
      {links.map((l) => {
        const d = dirs.find((x) => x.id === l.direction_id);
        return (
          <div key={l.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{d?.flag} {d?.name ?? "—"}</span>
              <button onClick={() => del(l.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="break-all text-xs text-muted-foreground">{l.url}</div>
          </div>
        );
      })}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  async function load() {
    const { data } = await supabase.from("profiles").select("id,email,is_blocked,cooldown_until,subscription_until").order("created_at", { ascending: false });
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
          <div className="flex items-center gap-2">
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
        </div>
      ))}
      {!users.length && <div className="text-center text-sm text-muted-foreground">Нет пользователей</div>}
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
      <div className="flex gap-1 overflow-x-auto rounded-full bg-[#1C2C3C] p-1">
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
              <a href={`tel:${c.phone}`} className="inline-block rounded-full bg-[#1C2C3C] px-2 py-0.5 text-[12px] text-primary">
                📞 {c.phone}
              </a>
            )}
            <p className="whitespace-pre-wrap text-foreground/90">{c.description}</p>
            {videoUrl && <video src={videoUrl} controls playsInline className="w-full rounded-lg bg-black" />}
            <div className="space-y-2 rounded-lg bg-[#1C2C3C] p-2">
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
