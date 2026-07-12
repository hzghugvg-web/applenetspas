import { createFileRoute } from "@tanstack/react-router";

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

export const Route = createFileRoute("/api/public/sub/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || !/^[a-f0-9]{20,80}$/i.test(token)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("issued_configs")
          .select("upstream_url")
          .eq("sub_token", token)
          .maybeSingle();
        if (error || !data?.upstream_url) {
          return new Response("Not found", { status: 404 });
        }

        let brand = "VPNSUS";
        const { data: sourceLink } = await supabaseAdmin
          .from("vless_links")
          .select("title")
          .eq("url", data.upstream_url)
          .maybeSingle();
        if (sourceLink?.title?.trim()) brand = sourceLink.title.trim();

        const { data: setting } = await supabaseAdmin
          .from("system_settings")
          .select("value")
          .eq("key", "config_name")
          .maybeSingle();
        if (brand === "VPNSUS" && setting?.value && typeof setting.value === "string") {
          brand = setting.value;
        }

        let upstreamBody: string;
        if (/^https?:\/\//i.test(data.upstream_url)) {
          try {
            const r = await fetch(data.upstream_url, {
              headers: { "User-Agent": "VPNSUS/1.0" },
            });
            if (!r.ok) return new Response("Upstream error", { status: 502, headers: TEXT_HEADERS });
            upstreamBody = await r.text();
          } catch {
            return new Response("Upstream error", { status: 502, headers: TEXT_HEADERS });
          }
        } else {
          upstreamBody = data.upstream_url;
        }

        const rewritten = rewriteSubscription(upstreamBody, brand);

        return new Response(rewritten, {
          status: 200,
          headers: {
            ...TEXT_HEADERS,
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
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      rewriteJsonConfigNames(parsed, brand);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // fall through
    }
  }
  // Try base64-decoded subscription list
  const decoded = tryBase64Decode(trimmed);
  if (decoded && /^(vless|vmess|trojan|ss):\/\//im.test(decoded)) {
    const rewritten = rewriteLines(decoded, brand);
    return Buffer.from(rewritten, "utf8").toString("base64");
  }
  // Plain-text list of links
  if (/^(vless|vmess|trojan|ss):\/\//im.test(trimmed)) {
    return rewriteLines(trimmed, brand);
  }
  return body;
}

function tryBase64Decode(s: string): string | null {
  try {
    const clean = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
    return Buffer.from(clean + pad, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function rewriteJsonConfigNames(value: unknown, brand: string) {
  let seen = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const nameKeys = ["remarks", "ps", "name", "title", "displayName", "remark"];
    for (const key of nameKeys) {
      if (typeof obj[key] === "string") {
        seen += 1;
        obj[key] = seen > 1 ? `${brand}-${seen}` : brand;
      }
    }
    Object.values(obj).forEach(visit);
  };
  visit(value);
  if (seen === 0 && value && typeof value === "object" && !Array.isArray(value)) {
    (value as Record<string, unknown>).remarks = brand;
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
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const obj = JSON.parse(decoded);
    obj.ps = i > 1 ? `${brand}-${i}` : brand;
    const re = JSON.stringify(obj);
    return "vmess://" + Buffer.from(re, "utf8").toString("base64");
  } catch {
    return link;
  }
}