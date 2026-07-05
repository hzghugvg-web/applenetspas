import { createFileRoute } from "@tanstack/react-router";

// Same-origin proxy to the Supabase project. This lets the app reach Supabase
// from networks where the *.supabase.co host is blocked (e.g. RU ISPs) — the
// browser talks only to our own domain, and the Vercel/edge worker forwards
// the request server-side.

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, range, accept, accept-profile, content-profile, x-requested-with",
  "access-control-expose-headers":
    "content-range, x-total-count, content-encoding, content-length, content-type",
  "access-control-max-age": "86400",
};

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
  // Node/undici fetch on the server auto-decompresses the upstream body but
  // leaves this header in place. Forwarding it makes the browser try to
  // decode an already-plain body → net::ERR_CONTENT_DECODING_FAILED.
  "content-encoding",
]);

function buildTargetUrl(request: Request, splat: string | undefined): string {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("SUPABASE_URL not configured");
  const path = splat ? `/${splat}` : "";
  const search = new URL(request.url).search;
  return `${base}${path}${search}`;
}

async function proxy(request: Request, splat: string | undefined): Promise<Response> {
  let target: string;
  try {
    target = buildTargetUrl(request, splat);
  } catch {
    return new Response("Proxy misconfigured", { status: 500, headers: CORS });
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "upstream_unreachable", message: String((e as Error)?.message ?? e) }),
      { status: 502, headers: { "content-type": "application/json", ...CORS } },
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });
  Object.entries(CORS).forEach(([k, v]) => outHeaders.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const Route = createFileRoute("/api/public/sb/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => proxy(request, (params as { _splat?: string })._splat),
      POST: async ({ request, params }) => proxy(request, (params as { _splat?: string })._splat),
      PUT: async ({ request, params }) => proxy(request, (params as { _splat?: string })._splat),
      PATCH: async ({ request, params }) => proxy(request, (params as { _splat?: string })._splat),
      DELETE: async ({ request, params }) => proxy(request, (params as { _splat?: string })._splat),
      HEAD: async ({ request, params }) => proxy(request, (params as { _splat?: string })._splat),
    },
  },
});