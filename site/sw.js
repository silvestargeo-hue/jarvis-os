/* JARVIS OS service worker — offline shell + runtime cache */
const CACHE = "jarvis-os-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./features.html",
  "./downloads.html",
  "./docs.html",
  "./lore.html",
  "./404.html",
  "./assets/style.css",
  "./assets/os.css",
  "./assets/i18n.js",
  "./assets/os.js",
  "./assets/state.js",
  "./assets/sync-notes.js",
  "./assets/ai.js",
  "./assets/apps.js",
  "./assets/library.js",
  "./assets/mesh.js",
  "./assets/surprises.js",
  "./assets/surprises2.js",
  "./assets/tour.js",
  "./assets/voice.js",
  "./assets/settings.js",
  "./assets/marketplace.js",
  "./assets/help.js",
  "./assets/achievements.js",
  "./assets/code.js",
  "./assets/boot.js",
  "./assets/main.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/og-image.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache AI/image endpoints
  if (url.host.includes("puter.com") || url.host.includes("pollinations.ai")) return;

  // Network-first for navigation & JS (stay fresh), cache fallback offline
  if (e.request.mode === "navigate" || url.pathname.endsWith(".js")) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first for everything else (css, icons, images)
  e.respondWith(
    caches.match(e.request).then((m) =>
      m ||
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
    )
  );
});
