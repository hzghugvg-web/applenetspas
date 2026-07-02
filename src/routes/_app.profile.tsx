import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { FaqList } from "@/components/FaqList";
import { translateAuthError } from "@/lib/errors";
import { alertDialog as toast } from "@/lib/alert";
import { LogOut, Trash2, KeyRound, Loader2, Moon, Sun, Mail } from "lucide-react";

export const Route = createFileRoute("/_app/profile")({ component: ProfilePage });

function ProfilePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(true);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("ns_theme") === "light" ? "light" : "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
    document.documentElement.classList.toggle("dark", saved === "dark");
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setEmailLoading(false);
    });
  }, []);

  function changeTheme(next: "dark" | "light") {
    setTheme(next);
    localStorage.setItem("ns_theme", next);
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  async function updatePassword() {
    if (!oldPassword) { toast.error("Введите текущий пароль"); return; }
    if (newPassword.length < 6) { toast.error("Новый пароль минимум 6 символов"); return; }
    if (oldPassword === newPassword) { toast.error("Новый пароль совпадает с текущим"); return; }
    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
      if (signErr) { toast.error("Неверный текущий пароль"); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setOldPassword("");
      setNewPassword("");
      toast.success("Пароль обновлён");
    } catch (e: any) { toast.error(translateAuthError(e?.message)); }
    finally { setLoading(false); }
  }

  async function logout() {
    sessionStorage.removeItem("ns_is_admin");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  async function deleteAccount() {
    if (!confirm("Удалить аккаунт? Действие необратимо.")) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").delete().eq("id", u.user.id);
    if (error) { toast.error(translateAuthError(error.message)); return; }
    sessionStorage.removeItem("ns_is_admin");
    await supabase.auth.signOut();
    toast.success("Аккаунт удалён");
    navigate({ to: "/auth" });
  }

  return (
    <MobileShell title="Настройки">
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-primary" /> Текущий email
          </div>
          <div className="mt-2 min-h-6 text-base font-medium">
            {emailLoading ? <span className="inline-block h-5 w-40 animate-pulse rounded-md bg-muted" /> : (email || "—")}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-medium">Тема приложения</div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
            <button
              type="button"
              onClick={() => changeTheme("dark")}
              className={`tg-press flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${theme === "dark" ? "bg-card-solid text-foreground" : "text-muted-foreground"}`}
            >
              <Moon className="h-4 w-4" /> Чёрная
            </button>
            <button
              type="button"
              onClick={() => changeTheme("light")}
              className={`tg-press flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${theme === "light" ? "bg-card-solid text-foreground" : "text-muted-foreground"}`}
            >
              <Sun className="h-4 w-4" /> Светлая
            </button>
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4 text-primary" /> Сменить пароль</div>
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
            placeholder="Текущий пароль" autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Новый пароль (минимум 6 символов)" minLength={6} autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
          <button onClick={updatePassword} disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary font-medium disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить пароль"}
          </button>
        </section>

        <button onClick={logout} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary font-medium">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
        <button onClick={deleteAccount} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 font-medium text-destructive">
          <Trash2 className="h-4 w-4" /> Удалить аккаунт
        </button>

        <section className="space-y-3 pt-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">FAQ</div>
          <FaqList />
        </section>
      </div>
    </MobileShell>
  );
}
