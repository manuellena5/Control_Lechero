/* sw.js — Service Worker offline-first */

const CACHE = 'control-lechero-v10';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './css/app.css',
  './js/dexie.js',
  './js/db.js',
  './js/router.js',
  './js/home.js',
  './js/tambos.js',
  './js/sync.js',
  './js/registro.js',
  './js/html2canvas.min.js',
  './js/planilla.js',
  './js/padron.js',
  './js/config.js',
];

// ─── Mensaje desde la app (forzar actualización) ─────────────────────────────

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Install: precachear app shell ───────────────────────────────────────────

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: limpiar caches viejas ─────────────────────────────────────────

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', e => {
  // Dejar pasar las peticiones POST (sync con Apps Script)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(res => {
        // Solo cachear respuestas válidas de mismo origen o fuentes de Google
        if (
          res.ok &&
          (e.request.url.startsWith(self.location.origin) ||
           e.request.url.startsWith('https://fonts.'))
        ) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
