import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { translateAuthError } from "@/lib/errors";
import { toast } from "sonner";
import { LogOut, Trash2, Mail, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_app/profile")({ component: ProfilePage });

function ProfilePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? ""); setNewEmail(data.user?.email ?? ""); });
  }, []);

  async function updateEmail() {
    if (!newEmail || newEmail === email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("Email обновлён");
      setEmail(newEmail);
    } catch (e: any) { toast.error(translateAuthError(e?.message)); }
    finally { setLoading(false); }
  }

  async function updatePassword() {
    if (newPassword.length < 6) { toast.error("Пароль должен содержать минимум 6 символов"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Пароль обновлён");
      setNewPassword("");
    } catch (e: any) { toast.error(translateAuthError(e?.message)); }
    finally { setLoading(false); }
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  async function deleteAccount() {
    if (!confirm("Удалить аккаунт? Действие необратимо.")) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").delete().eq("id", u.user.id);
    if (error) { toast.error(translateAuthError(error.message)); return; }
    await supabase.auth.signOut();
    toast.success("Аккаунт удалён");
    navigate({ to: "/auth" });
  }

  return (
    <MobileShell title="Профиль">
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Текущий email</div>
          <div className="mt-1 text-base font-medium">{email}</div>
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4 text-primary" /> Сменить email</div>
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
          <button onClick={updateEmail} disabled={loading} className="h-11 w-full rounded-xl bg-secondary font-medium disabled:opacity-60">Сохранить</button>
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4 text-primary" /> Сменить пароль</div>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Новый пароль" minLength={6}
            className="h-11 w-full rounded-xl border border-border bg-input px-3 outline-none focus:border-primary" />
          <button onClick={updatePassword} disabled={loading} className="h-11 w-full rounded-xl bg-secondary font-medium disabled:opacity-60">Обновить пароль</button>
        </section>

        <button onClick={logout} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary font-medium">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
        <button onClick={deleteAccount} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 font-medium text-destructive">
          <Trash2 className="h-4 w-4" /> Удалить аккаунт
        </button>
      </div>
    </MobileShell>
  );
}
