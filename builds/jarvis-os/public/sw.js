/* JARVIS OS service worker — app shell + offline fallback. */
const VERSION = "jarvis-v3";
const SHELL = [
  "/",
  "/dashboard",
  "/auth",
  "/lock",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch API traffic (Convex, OTP endpoint, OpenRouter) — must hit network.
  if (
    url.hostname.endsWith(".convex.cloud") ||
    url.hostname.endsWith(".convex.site") ||
    url.pathname.startsWith("/api/") ||
    url.hostname === "openrouter.ai"
  ) {
    return;
  }

  // Static assets (Next build output): cache-first, revalidate in background.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/pdf.worker.min.mjs") {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  // Navigations: network-first, fall back to cached shell (offline boot).
  // Only cache GOOD responses — previously a transient 500/404 HTML page got
  // cached and served forever, which made the app look like a dead template.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            caches.open(VERSION).then((cache) => cache.put(request, res.clone()));
            return res;
          }
          // Bad response from network: purge any bad cached copy and try cache.
          caches.open(VERSION).then((cache) => cache.delete(request));
          return caches
            .match(request)
            .then((cached) => cached || res);
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/dashboard")) || Response.error())
    );
  }
});
