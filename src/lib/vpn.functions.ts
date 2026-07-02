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
  // Xray/V2Ray JSON config (array of configs or single config with outbounds)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const configs = Array.isArray(parsed) ? parsed : [parsed];
      const out: string[] = [];
      configs.forEach((cfg: any) => {
        const outbounds: any[] = cfg?.outbounds ?? [];
        outbounds.forEach((ob) => {
          const uri = outboundToUri(ob);
          if (uri) out.push(uri);
        });
      });
      if (out.length) {
        return out.map((line, i) => {
          const tag = i === 0 ? brand : brand + "-" + (i + 1);
          return line.toLowerCase().startsWith("vmess://")
            ? rewriteVmess(line, tag)
            : rewriteFragment(line, tag);
        });
      }
    } catch {
      // fall through
    }
  }
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

function outboundToUri(ob: any): string | null {
  const proto = String(ob?.protocol ?? "").toLowerCase();
  const stream = ob?.streamSettings ?? {};
  const network = String(stream.network ?? "tcp");
  const security = String(stream.security ?? "none");

  const streamParams: Record<string, string> = { type: network, security };
  if (security === "tls" || security === "reality") {
    const tls = stream.tlsSettings ?? {};
    const reality = stream.realitySettings ?? {};
    const sni = reality.serverName ?? tls.serverName;
    if (sni) streamParams.sni = sni;
    const fp = reality.fingerprint ?? tls.fingerprint;
    if (fp) streamParams.fp = fp;
    if (reality.publicKey) streamParams.pbk = reality.publicKey;
    if (reality.shortId !== undefined) streamParams.sid = String(reality.shortId);
    if (tls.alpn?.length) streamParams.alpn = tls.alpn.join(",");
  }
  if (network === "ws") {
    const ws = stream.wsSettings ?? {};
    if (ws.path) streamParams.path = ws.path;
    if (ws.headers?.Host) streamParams.host = ws.headers.Host;
  } else if (network === "grpc") {
    const g = stream.grpcSettings ?? {};
    if (g.serviceName) streamParams.serviceName = g.serviceName;
  }

  const enc = (o: Record<string, string>) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");

  if (proto === "vless") {
    const v = ob.settings?.vnext?.[0];
    if (!v) return null;
    const u = v.users?.[0];
    if (!u?.id) return null;
    const params = { ...streamParams, encryption: u.encryption ?? "none", flow: u.flow ?? "" };
    return `vless://${u.id}@${v.address}:${v.port}?${enc(params)}#Config`;
  }
  if (proto === "trojan") {
    const s = ob.settings?.servers?.[0];
    if (!s?.password) return null;
    return `trojan://${encodeURIComponent(s.password)}@${s.address}:${s.port}?${enc(streamParams)}#Config`;
  }
  if (proto === "vmess") {
    const v = ob.settings?.vnext?.[0];
    const u = v?.users?.[0];
    if (!u?.id) return null;
    const obj = {
      v: "2",
      ps: "Config",
      add: v.address,
      port: String(v.port),
      id: u.id,
      aid: String(u.alterId ?? 0),
      scy: u.security ?? "auto",
      net: network,
      type: "none",
      host: streamParams.host ?? "",
      path: streamParams.path ?? "",
      tls: security === "tls" ? "tls" : "",
      sni: streamParams.sni ?? "",
    };
    return "vmess://" + btoa(JSON.stringify(obj));
  }
  if (proto === "shadowsocks") {
    const s = ob.settings?.servers?.[0];
    if (!s?.password || !s?.method) return null;
    const userinfo = btoa(`${s.method}:${s.password}`);
    return `ss://${userinfo}@${s.address}:${s.port}#Config`;
  }
  return null;
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
      links: links.slice(0, 1),
      subscriptionUrl: row.vless_url,
    };
  });

export const getMyIssuedLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("issued_configs")
      .select("upstream_url, issued_at")
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);

    let brand = "NetSpas";
    const { data: setting } = await context.supabase
      .from("system_settings")
      .select("value")
      .eq("key", "config_name")
      .maybeSingle();
    const raw = (setting?.value ?? null) as unknown;
    if (typeof raw === "string" && raw.trim()) brand = raw.trim();

    const all: string[] = [];
    for (const row of rows ?? []) {
      const url = (row as any).upstream_url as string | null;
      if (!url) continue;
      if (/^(vless|vmess|trojan|ss):\/\//i.test(url)) {
        const ex = extractLinks(url, brand);
        if (ex[0]) all.push(ex[0]);
      } else {
        try {
          const r = await fetch(url, { headers: { "User-Agent": "NetSpas/1.0" } });
          if (r.ok) {
            const text = await r.text();
            const ex = extractLinks(text, brand);
            if (ex[0]) all.push(ex[0]);
          }
        } catch {
          // skip
        }
      }
      if (all.length >= 1) break;
    }
    return { links: all.slice(0, 1) };
  });
