/* SPOT — service worker : la coquille de l'app hors ligne, et la file des prises (spec 8.4 :
   « hors ligne pendant la capture → la prise est mise en file et envoyée au retour du réseau »). */
const SHELL = "spot-shell-v1";
const PAGES = ["/", "/carnet", "/planches", "/terrain", "/vault", "/marques", "/vie-privee", "/legal", "/reglages"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PAGES).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(SHELL).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => (c.put(req, r.clone()), r))));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r ?? caches.match("/"))));
  }
});

/* File des prises : la page enregistre une synchronisation quand l'envoi échoue hors ligne. */
self.addEventListener("sync", (e) => {
  if (e.tag === "spot-prises") e.waitUntil(flushPrises());
});

async function flushPrises() {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const c of clients) c.postMessage({ type: "spot:flush-prises" });
}
