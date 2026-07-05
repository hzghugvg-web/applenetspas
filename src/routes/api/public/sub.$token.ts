import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/sub/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || !/^[a-f0-9]{20,80}$/i.test(token)) {
          return new Response("Not found", { status: 404 });
        }

        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(url, key, { auth: { persistSession: false } });

        const { data, error } = await sb
          .from("issued_configs")
          .select("upstream_url")
          .eq("sub_token", token)
          .maybeSingle();
        if (error || !data?.upstream_url) {
          return new Response("Not found", { status: 404 });
        }

        let brand = "NetSpas";
        const { data: setting } = await sb
          .from("system_settings")
          .select("value")
          .eq("key", "config_name")
          .maybeSingle();
        if (setting?.value && typeof setting.value === "string") brand = setting.value;

        let upstreamBody: string;
        try {
          const r = await fetch(data.upstream_url, {
            headers: { "User-Agent": "NetSpas/1.0" },
          });
          if (!r.ok) return new Response("Upstream error", { status: 502 });
          upstreamBody = await r.text();
        } catch {
          return new Response("Upstream error", { status: 502 });
        }

        const rewritten = rewriteSubscription(upstreamBody, brand);

        return new Response(rewritten, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
            "profile-update-interval": "24",
            "subscription-userinfo": "upload=0; download=0; total=0; expire=0",
          },
        });
      },
    },
  },
});

function rewriteSubscription(body: string, brand: string): string {
  const trimmed = body.trim();
  // Xray/V2Ray JSON config (array or single object) — convert outbounds to vless://
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const links: string[] = [];
      let idx = 0;
      for (const cfg of arr) {
        const link = xrayJsonToVless(cfg, brand, ++idx, arr.length);
        if (link) links.push(link);
      }
      if (links.length) return links.join("\n");
    } catch {
      // fall through
    }
  }
  // Try base64-decoded subscription list
  const decoded = tryBase64Decode(trimmed);
  if (decoded && /^(vless|vmess|trojan|ss):\/\//im.test(decoded)) {
    const rewritten = rewriteLines(decoded, brand);
    return btoa(unescape(encodeURIComponent(rewritten)));
  }
  // Plain-text list of links
  if (/^(vless|vmess|trojan|ss):\/\//im.test(trimmed)) {
    return rewriteLines(trimmed, brand);
  }
  return body;
}

function xrayJsonToVless(cfg: unknown, brand: string, i: number, total: number): string | null {
  try {
    const c = cfg as {
      outbounds?: Array<{
        protocol?: string;
        settings?: { vnext?: Array<{ address?: string; port?: number; users?: Array<{ id?: string; encryption?: string; flow?: string }> }> };
        streamSettings?: {
          network?: string;
          security?: string;
          realitySettings?: { serverName?: string; publicKey?: string; shortId?: string; spiderX?: string; fingerprint?: string };
          tlsSettings?: { serverName?: string; fingerprint?: string; alpn?: string[] };
          wsSettings?: { path?: string; headers?: { Host?: string } };
          grpcSettings?: { serviceName?: string };
        };
      }>;
      remarks?: string;
    };
    const ob = (c.outbounds ?? []).find((o) => o?.protocol === "vless");
    if (!ob) return null;
    const vnext = ob.settings?.vnext?.[0];
    const user = vnext?.users?.[0];
    if (!vnext?.address || !vnext?.port || !user?.id) return null;
    const stream = ob.streamSettings ?? {};
    const params = new URLSearchParams();
    params.set("encryption", user.encryption || "none");
    const network = stream.network || "tcp";
    params.set("type", network);
    const security = stream.security || "none";
    params.set("security", security);
    if (user.flow) params.set("flow", user.flow);
    if (security === "reality" && stream.realitySettings) {
      const r = stream.realitySettings;
      if (r.serverName) params.set("sni", r.serverName);
      if (r.fingerprint) params.set("fp", r.fingerprint);
      if (r.publicKey) params.set("pbk", r.publicKey);
      if (r.shortId) params.set("sid", r.shortId);
      if (r.spiderX) params.set("spx", r.spiderX);
    } else if (security === "tls" && stream.tlsSettings) {
      const t = stream.tlsSettings;
      if (t.serverName) params.set("sni", t.serverName);
      if (t.fingerprint) params.set("fp", t.fingerprint);
      if (t.alpn?.length) params.set("alpn", t.alpn.join(","));
    }
    if (network === "ws" && stream.wsSettings) {
      if (stream.wsSettings.path) params.set("path", stream.wsSettings.path);
      if (stream.wsSettings.headers?.Host) params.set("host", stream.wsSettings.headers.Host);
    } else if (network === "grpc" && stream.grpcSettings?.serviceName) {
      params.set("serviceName", stream.grpcSettings.serviceName);
    }
    const remarks = c.remarks || (total > 1 ? `${brand}-${i}` : brand);
    return `vless://${user.id}@${vnext.address}:${vnext.port}?${params.toString()}#${encodeURIComponent(remarks)}`;
  } catch {
    return null;
  }
}

function tryBase64Decode(s: string): string | null {
  try {
    const clean = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
    const decoded = atob(clean + pad);
    return decodeURIComponent(escape(decoded));
  } catch {
    return null;
  }
}

function rewriteLines(text: string, brand: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let idx = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    const scheme = line.split("://", 1)[0].toLowerCase();
    if (scheme === "vmess") {
      out.push(rewriteVmess(line, brand, ++idx));
    } else if (scheme === "vless" || scheme === "trojan" || scheme === "ss") {
      out.push(rewriteFragment(line, brand, ++idx));
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function rewriteFragment(link: string, brand: string, i: number): string {
  const hashIdx = link.indexOf("#");
  const base = hashIdx >= 0 ? link.slice(0, hashIdx) : link;
  const tag = i > 1 ? `${brand}-${i}` : brand;
  return `${base}#${encodeURIComponent(tag)}`;
}

function rewriteVmess(link: string, brand: string, i: number): string {
  try {
    const payload = link.slice("vmess://".length);
    const decoded = atob(payload);
    const obj = JSON.parse(decoded);
    obj.ps = i > 1 ? `${brand}-${i}` : brand;
    const re = JSON.stringify(obj);
    return "vmess://" + btoa(re);
  } catch {
    return link;
  }
}