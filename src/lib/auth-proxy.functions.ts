import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const signInWithPasswordServer = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(6) }).parse(data),
  )
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("auth_not_configured");

    const authClient = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: result, error } = await authClient.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) throw new Error(error.message);
    if (!result.session?.access_token || !result.session.refresh_token) throw new Error("session_missing");

    return {
      accessToken: result.session.access_token,
      refreshToken: result.session.refresh_token,
      userId: result.user?.id ?? null,
    };
  });

export const signUpWithPasswordServer = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      emailRedirectTo: z.string().url(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("auth_not_configured");

    const authClient = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: result, error } = await authClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: { emailRedirectTo: data.emailRedirectTo },
    });
    if (error) throw new Error(error.message);

    if (!result.session?.access_token || !result.session.refresh_token) {
      const { data: loginResult, error: loginError } = await authClient.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (loginError) throw new Error(loginError.message);
      if (!loginResult.session?.access_token || !loginResult.session.refresh_token) {
        return { needsConfirmation: true as const };
      }
      return {
        accessToken: loginResult.session.access_token,
        refreshToken: loginResult.session.refresh_token,
        userId: loginResult.user?.id ?? null,
      };
    }

    return {
      accessToken: result.session.access_token,
      refreshToken: result.session.refresh_token,
      userId: result.user?.id ?? null,
    };
  });