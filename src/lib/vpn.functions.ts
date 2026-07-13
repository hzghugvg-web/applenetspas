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
    // Always hand out the original (uploaded) link, not the proxied subscription URL.
    const link = row.upstream_url || row.vless_url;
    return { links: link ? [link] : [], subscriptionUrl: link };
  });

export const getMyIssuedLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Unified list — includes keys issued from the site AND keys issued by the
    // Telegram bot for the profile's linked telegram_user_id.
    const { data: rows, error } = await (context.supabase as any).rpc("get_my_all_vpn_configs");
    if (error) throw new Error(error.message);

    const list = ((rows ?? []) as Array<{
      source: string;
      id: string;
      vless_url: string | null;
      upstream_url: string | null;
      issued_at: string;
      direction_id: string | null;
      direction_name: string | null;
      direction_flag: string | null;
    }>).sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));

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
        const link = r.upstream_url || r.vless_url;
        if (!link) return null;
        return {
          id: r.id,
          link,
          title:
            (r.upstream_url && titleByUrl[r.upstream_url]) ||
            r.direction_name ||
            null,
          issuedAt: r.issued_at,
          directionId: r.direction_id ?? null,
        };
      })
      .filter(Boolean) as Array<{ id: string; link: string; title: string | null; issuedAt: string; directionId: string | null }>;
    return { links: configs.map((c) => c.link), configs };
  });
