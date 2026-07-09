const VERSION = "netspas-offline-2026-07-09-2";
const APP_CACHE = `${VERSION}-app`;
const ASSET_CACHE = `${VERSION}-assets`;
const APP_SHELL = [
  "/",
  "/auth",
  "/vpn",
  "/my-vpn",
  "/support",
  "/profile",
  "/faq",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await Promise.all(
        APP_SHELL.map(async (path) => {
          try {
            const response = await fetch(path, { cache: "reload", credentials: "same-origin" });
            if (response.ok || response.type === "basic") await cache.put(path, response);
          } catch {
            // A single route failing must not block the service worker install.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("netspas-offline-") && !name.startsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/~oauth")) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await withTimeout(fetch(request), 3500);
    if (response.ok) await cache.put(normalizePath(request.url), response.clone());
    return response;
  } catch {
    return (
      (await cache.match(normalizePath(request.url))) ||
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      offlineHtml()
    );
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "basic") await cache.put(request, response.clone());
  return response;
}

function isStaticAsset(request, url) {
  if (["script", "style", "worker", "font", "image", "manifest"].includes(request.destination)) return true;
  return /\.(?:js|css|mjs|woff2?|png|jpg|jpeg|webp|svg|ico|webmanifest)$/i.test(url.pathname);
}

function normalizePath(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.pathname}${url.search}`;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function offlineHtml() {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#10131F"><title>NetSpas офлайн</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10131F;color:#F8FAFC;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.box{max-width:340px;padding:24px;text-align:center}.icon{width:64px;height:64px;margin:0 auto 18px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#38BDF8,#6366F1)}h1{font-size:24px;margin:0 0 8px}p{margin:0;color:#A9B4C4;font-size:14px;line-height:1.55}</style></head><body><main class="box"><div class="icon">🛡️</div><h1>NetSpas офлайн</h1><p>Интерфейс сохранён на устройстве. Подключение VPN и получение новых конфигураций заработают после возврата интернета.</p></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}