/* Basic service worker: lets players install the game and open it even without internet
   (pass-and-play works offline; multiplayer needs the server). Bump V to force an update. */
const V = "mafia-v7", SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/icon-180.png", "/favicon-32.png",
  "/fonts/cairo-arabic-400-normal.woff2", "/fonts/cairo-arabic-700-normal.woff2", "/fonts/cairo-latin-400-normal.woff2", "/fonts/cairo-latin-700-normal.woff2", "/fonts/aref-ruqaa-arabic-400-normal.woff2", "/fonts/aref-ruqaa-arabic-700-normal.woff2", "/fonts/aref-ruqaa-latin-400-normal.woff2", "/fonts/aref-ruqaa-latin-700-normal.woff2"];
/* everything the page needs (HTML, icons, fonts) is precached so pass-the-phone works in airplane mode. Sounds are synthesized (no audio files). */

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k != V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  /* never cache: other sites, non-GET, the admin/health/test pages, or the live-config script */
  if (e.request.method != "GET" || u.origin != location.origin || /^\/(admin|health|mp-config|test)/.test(u.pathname)) return;
  /* only the game page itself is handled as a page. Any other page (a renamed admin page, test pages) goes straight to the network and is never cached. */
  if (e.request.mode == "navigate" && u.pathname != "/" && u.pathname != "/index.html") return;
  if (e.request.mode == "navigate") { /* the game page: newest from the network, saved copy when offline */
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put("/index.html", cp)); } return r; })
      .catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
    return r;
  })));
});
