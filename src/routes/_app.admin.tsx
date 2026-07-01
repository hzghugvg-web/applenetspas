import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { translateAuthError } from "@/lib/errors";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, Ban, CheckCircle2, ChevronDown, Send } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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
