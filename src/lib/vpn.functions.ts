import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function tryBase64Decode(s: string): string | null {
  try {
    const clean = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
    return decodeURIComponent(escape(atob(clean + pad)));
  } catch {
    return null;
  }
}

function rewriteVmess(link: string, brand: string): string {
  try {
    const decoded = atob(link.slice("vmess://".length));
    const obj = JSON.parse(decoded);
    obj.ps = brand;
    return "vmess://" + btoa(JSON.stringify(obj));
  } catch {
    return link;
  }
}

function rewriteFragment(link: string, brand: string): string {
  const hashIdx = link.indexOf("#");
  const base = hashIdx >= 0 ? link.slice(0, hashIdx) : link;
  return base + "#" + encodeURIComponent(brand);
}

function extractLinks(body: string, brand: string): string[] {
  const trimmed = body.trim();
  const source =
    /^(vless|vmess|trojan|ss):\/\//im.test(trimmed) ? trimmed : tryBase64Decode(trimmed) ?? trimmed;
  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(vless|vmess|trojan|ss):\/\//i.test(l));
  return lines.map((line, i) => {
    const tag = i === 0 ? brand : brand + "-" + (i + 1);
    return line.toLowerCase().startsWith("vmess://")
      ? rewriteVmess(line, tag)
      : rewriteFragment(line, tag);
  });
}

export const issueVpnConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { directionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rpc, error } = await context.supabase.rpc("issue_vpn_config", {
      _direction_id: data.directionId,
    });
    if (error) throw new Error(error.message);
    const row = (rpc as Array<{ vless_url: string; upstream_url: string }> | null)?.[0];
    if (!row) throw new Error("no_result");

    let brand = "NetSpas";
    const { data: setting } = await context.supabase
      .from("system_settings")
      .select("value")
      .eq("key", "config_name")
      .maybeSingle();
    const raw = (setting?.value ?? null) as unknown;
    if (typeof raw === "string" && raw.trim()) brand = raw.trim();

    let links: string[] = [];
    if (/^(vless|vmess|trojan|ss):\/\//i.test(row.upstream_url)) {
      links = extractLinks(row.upstream_url, brand);
    } else {
      try {
        const r = await fetch(row.upstream_url, {
          headers: { "User-Agent": "NetSpas/1.0" },
        });
        if (r.ok) {
          const text = await r.text();
          links = extractLinks(text, brand);
        }
      } catch {
        // fallback below
      }
    }

    return {
      links,
      subscriptionUrl: row.vless_url,
    };
  });
