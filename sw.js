/* sw.js — offline-first service worker (yalnızca http/https modunda) */
const CACHE = 'ada-translate-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './fonts/fonts.css',
  './fonts/IBMPlexSans-400-4.woff2',
  './fonts/IBMPlexSans-400-5.woff2',
  './fonts/IBMPlexSerif-400-latin-ext.woff2',
  './fonts/IBMPlexSerif-400-latin.woff2',
  './fonts/IBMPlexSerif-500-latin-ext.woff2',
  './fonts/IBMPlexSerif-500-latin.woff2',
  './js/data-bundle.js',
  './js/search.js',
  './js/app.js',
  './js/translate-worker.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Çeviri modelleri ve WASM (~700 MB) cache'e kopyalanmaz; doğrudan diskten gelir.
  if (url.origin !== location.origin || /\/(models|vendor)\//.test(url.pathname)) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      });
      if (hit) { net.catch(() => {}); return hit; }
      return net.catch(() => caches.match('./index.html'));
    })
  );
});
