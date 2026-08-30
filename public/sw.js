// Game Night service worker: precache the app shell, network-first for navigation
// (so updates land immediately), cache-first for static assets. Socket.IO traffic
// is never intercepted.
const VERSION = 'gamenight-v29';
const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/main.js',
  '/js/core/ui.js',
  '/js/core/fx.js',
  '/js/core/ambience.js',
  '/js/core/backdrop.js',
  '/js/core/memes.js',
  '/js/core/rules-modal.js',
  '/js/games/registry.js',
  '/js/games/blendin/index.js',
  '/js/games/blendin/rules.js',
  '/js/games/island/index.js',
  '/js/games/island/rules.js',
  '/js/games/silentorder/index.js',
  '/js/games/silentorder/rules.js',
  '/js/games/swaporstay/index.js',
  '/js/games/swaporstay/rules.js',
  '/js/games/sleepless/index.js',
  '/js/games/sleepless/rules.js',
  '/js/core/cards.js',
  '/js/landing.js',
  '/css/landing.css',
  '/css/games/silentorder.css',
  '/css/games/swaporstay.css',
  '/css/games/sleepless.css',
  '/media/art/hand.svg',
  '/manifest.webmanifest',
  '/icons/logo.svg',
  '/icons/favicon-32.png',
  '/icons/author-48.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/socket.io/socket.io.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/socket.io/') && url.pathname !== '/socket.io/socket.io.js') return;
  // Dynamic endpoints must never be cached. /api/backdrop and /api/sfx describe what is
  // on disk right now, and a cached copy from a previous deploy makes the app ignore
  // media that has since been added.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;
  if (url.pathname === '/healthz') return;

  // Code and markup are network-first: a deployed update must never be shadowed by a
  // stale cache (a client/server protocol mismatch would break live games). The cache
  // is the offline fallback. Static art (icons, manifest) stays cache-first.
  const isCode = event.request.mode === 'navigate'
    || /\.(?:js|mjs|css|html)$/.test(url.pathname)
    || url.pathname === '/';

  if (isCode) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            const key = event.request.mode === 'navigate' ? '/' : event.request;
            caches.open(VERSION).then((cache) => cache.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request.mode === 'navigate' ? '/' : event.request)),
    );
    return;
  }

  // Cache-first with a background refresh for immutable-ish assets.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
