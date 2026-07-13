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
    const accessToken = result.session?.access_token;
    const refreshToken = result.session?.refresh_token;
    if (!accessToken || !refreshToken) throw new Error("session_missing");

    return {
      accessToken,
      refreshToken,
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

    const accessToken = result.session?.access_token;
    const refreshToken = result.session?.refresh_token;

    if (!accessToken || !refreshToken) {
      const { data: loginResult, error: loginError } = await authClient.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (loginError) throw new Error(loginError.message);
      const loginAccessToken = loginResult.session?.access_token;
      const loginRefreshToken = loginResult.session?.refresh_token;
      if (!loginAccessToken || !loginRefreshToken) {
        return { needsConfirmation: true as const };
      }
      return {
        accessToken: loginAccessToken,
        refreshToken: loginRefreshToken,
        userId: loginResult.user?.id ?? null,
      };
    }

    return {
      accessToken,
      refreshToken,
      userId: result.user?.id ?? null,
    };
  });