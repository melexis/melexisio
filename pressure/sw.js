/* Service Worker for offline support */
const CACHE_NAME = 'pressure-cache-v16';
const CORE_ASSETS = [
  './index.html',
  './README.md',
  './LICENSE',
  './manifest.webmanifest',
  './img/favicon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png',
  './js/MelexisIO.js',
  './js/mlx90835_i2c.js',
  './js/mlx90835_spi.js',
  './js/mlx90835_i2c_examples.js',
  './js/mlx90835_spi_examples.js',
  // External CDNs (cached as opaque)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (k !== CACHE_NAME) {
          return caches.delete(k);
        }
      }));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // only cache GETs
  event.respondWith(
    (async () => {
      const url = new URL(req.url);
      const isIndexHtml = url.pathname.endsWith('/index.html') || url.pathname === '/' || req.mode === 'navigate';

      // Network-first for navigations/index.html to avoid serving stale UI code.
      if (isIndexHtml) {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
          return res;
        } catch (err) {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      }

      // Cache-first strategy for everything else
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        // Put a clone in cache for future
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
        return res;
      } catch (err) {
        // If README/LICENSE requested and not cached, return minimal message
        if (url.pathname.endsWith('/README.md') || url.pathname.endsWith('/LICENSE')) {
          return new Response('Offline: asset not cached yet. Please visit online once.', {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        // Generic fallback
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
