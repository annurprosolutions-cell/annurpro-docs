/* Service worker — Annur Invoice. Naikkan CACHE setiap rilis (sama dengan version dalam config.js). */
const CACHE = 'annur-invoice-v0.4.0';
const CORE = [
  './', './config.js', './css/app.css', './js/core.js', './js/auth.js', './js/license.js', './js/schema.js', './js/google.js',
  './js/workspace.js', './js/store.js', './js/idb.js', './js/settings.js', './js/ui-settings.js', './js/images.js', './js/sign.js', './js/ui-images.js', './js/app.js',
  './manifest.webmanifest', './brand/annurpro-icon-64.png', './icons/icon-192.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Google API, GIS: terus ke rangkaian
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/bcl/')) return;

  // network-first supaya kemas kini cepat; cache bila luar talian
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && !res.redirected) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('./');
      throw err;
    }
  })());
});
