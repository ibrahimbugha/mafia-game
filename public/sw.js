/* Basic service worker: lets players install the game and open it even without internet
   (pass-and-play works offline; multiplayer needs the server). The server replaces __BUILD__ with a hash of the app files on every deploy, so phones detect new versions by themselves. */
const V = "mafia-__BUILD__", SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/icon-180.png", "/favicon-32.png",
  "/fonts/cairo-arabic-400-normal.woff2", "/fonts/cairo-arabic-700-normal.woff2", "/fonts/cairo-latin-400-normal.woff2", "/fonts/cairo-latin-700-normal.woff2", "/fonts/aref-ruqaa-arabic-400-normal.woff2", "/fonts/aref-ruqaa-arabic-700-normal.woff2", "/fonts/aref-ruqaa-latin-400-normal.woff2", "/fonts/aref-ruqaa-latin-700-normal.woff2"];
/* everything the page needs (HTML, icons, fonts) is precached so pass-the-phone works in airplane mode. Sounds are synthesized (no audio files). */

self.addEventListener("install", e => {
  /* no skipWaiting here: the page decides when to switch to the new version (seamlessly when idle, or via the update banner) */
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k != V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  /* never cache: other sites, non-GET, the admin/health/test pages, or the live-config script */
  if (e.request.method != "GET" || u.origin != location.origin || /^\/(admin|health|mp-config|push-api|test)/.test(u.pathname)) return;
  /* only the game page itself is handled as a page. Any other page (a renamed admin page, test pages) goes straight to the network and is never cached. */
  if (e.request.mode == "navigate" && u.pathname != "/" && u.pathname != "/index.html") return;
  if (e.request.mode == "navigate") { /* the game page: newest from the network, saved copy when offline */
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put("/index.html", cp)); } return r; })
      .catch(() => caches.match("/index.html")));
    return;
  }
  /* icons, fonts, scripts: answer from the saved copy instantly, and refresh that copy in the background while online */
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => hit || Response.error());
    return hit || net;
  }));
});

/* push: "A new public Mafia room is open!" (the server sends the text). If the game is open and visible the page shows its own banner instead. */
self.addEventListener("push", e => {
  let d = {}; try { d = e.data.json(); } catch (x) {}
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    if (cs.some(c => c.visibilityState == "visible")) return;
    return self.registration.showNotification(d.title || "Mafia", { body: d.body || "", tag: d.tag || "mafia", renotify: true, icon: "/icon-192.png", badge: "/favicon-32.png", data: { url: d.url || "/" } });
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => "focus" in x); if (c) { c.postMessage({ t: "nav", url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener("message", e => { if (e.data && e.data.t == "skip") self.skipWaiting(); }); /* the page asks to switch to the new version */
