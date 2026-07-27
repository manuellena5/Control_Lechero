/* sw.js — Service Worker offline-first */

const CACHE = 'control-lechero-v43';

// html2canvas.min.js (~195 KB) no forma parte del app shell:
// solo se usa para compartir imagen por WhatsApp y tiene fallback a texto.
// Se excluye del precacheo para acelerar la instalación del SW.
// El fetch handler lo cachea automáticamente en el primer uso.
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
  './js/planilla.js',
  './js/padron.js',
  './js/config.js',
  './js/ayuda.js',
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

  // Nunca cachear el propio sw.js: la pantalla de Config lo descarga para leer
  // el número de versión publicado. Si lo sirviéramos desde caché, siempre
  // leería la versión vieja y nunca detectaría actualizaciones.
  if (new URL(e.request.url).pathname.endsWith('/sw.js')) return;

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
