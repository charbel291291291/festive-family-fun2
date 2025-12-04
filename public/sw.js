const CACHE_NAME = "festive-family-fun-v1";
const CACHE_URLS = [
  "/",
  "/index.html",
  "/icon-192.png",
  "/icon-512.png",
  "/src/main.tsx",
  "/src/index.css",
];

self.addEventListener("install", (event) => {
  console.log("[SW] installing");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Avoid caching API requests: use network-first
  if (request.url.includes("/rest/v1") || request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches
      .match(request)
      .then(
        (cached) =>
          cached ||
          fetch(request).then((r) => {
            if (r && r.status === 200) {
              const rClone = r.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, rClone));
            }
            return r;
          })
      )
      .catch(() => caches.match("/index.html"))
  );
});
