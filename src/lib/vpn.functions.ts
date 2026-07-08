import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const issueVpnConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { directionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rpc, error } = await context.supabase.rpc("issue_vpn_config", {
      _direction_id: data.directionId,
    });
    if (error) throw new Error(error.message);
    const row = (rpc as Array<{ vless_url: string; upstream_url: string }> | null)?.[0];
    if (!row) throw new Error("no_result");
    const link = row.vless_url;
    return { links: link ? [link] : [], subscriptionUrl: link };
  });

export const getMyIssuedLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("issued_configs")
      .select("id, vless_url, upstream_url, issued_at, direction_id")
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string; vless_url: string | null; upstream_url: string | null;
      issued_at: string; direction_id: string | null;
    }>;
    const upstreams = Array.from(new Set(list.map((r) => r.upstream_url).filter(Boolean))) as string[];
    const titleByUrl: Record<string, string | null> = {};
    if (upstreams.length) {
      const { data: linkRows } = await context.supabase
        .from("vless_links")
        .select("url, title")
        .in("url", upstreams);
      for (const l of (linkRows ?? []) as Array<{ url: string; title: string | null }>) {
        titleByUrl[l.url] = l.title;
      }
    }
    const configs = list
      .map((r) => {
        const link = r.vless_url;
        if (!link) return null;
        return {
          id: r.id,
          link,
          title: (r.upstream_url && titleByUrl[r.upstream_url]) || null,
          issuedAt: r.issued_at,
          directionId: r.direction_id ?? null,
        };
      })
      .filter(Boolean) as Array<{ id: string; link: string; title: string | null; issuedAt: string; directionId: string | null }>;
    return { links: configs.map((c) => c.link), configs };
  });
