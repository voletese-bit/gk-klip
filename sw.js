// Appen kan åbnes uden net (selve klipningen kræver net for at hente og aflevere opgaver)
const C = "gk-klip-v6";
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(["./", "index.html", "top.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "lib/three.module.min.js", "lib/GLTFLoader.js", "lib/BufferGeometryUtils.js", "lib/SkeletonUtils.js"])).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
