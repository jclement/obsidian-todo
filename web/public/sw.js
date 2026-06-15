// PWA service worker.
//
// Navigations are NETWORK-FIRST: "/" always fetches the current index.html so it
// references the current (content-hashed) assets — otherwise, after a redeploy, a
// cached "/" points at deleted /static/*.js and the browser gets the HTML
// fallback (wrong MIME) and fails to boot. Offline → last-seen "/".
//
// Hashed /static assets are immutable, so cache-first. API GETs are network-first
// with a cached fallback for offline reading. Writes always hit the network.
const CACHE = "obtodo-v2";
const SHELL = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const putInCache = (req, res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; };

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname === "/api/ws") return;

  // SPA navigations → network-first (fresh HTML + current asset refs).
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); return res; })
        .catch(() => caches.match("/").then((hit) => hit || caches.match(e.request))),
    );
    return;
  }

  // Content-hashed build assets → cache-first.
  if (url.pathname.startsWith("/static/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => putInCache(e.request, res))));
    return;
  }

  // API reads → network-first, fall back to cache (read-only offline).
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(e.request).then((res) => putInCache(e.request, res)).catch(() => caches.match(e.request)));
    return;
  }

  if (SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});
