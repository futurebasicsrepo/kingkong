// Lets the game be installed and keeps it playable with a poor connection.
// Hashed files under /assets never change, so they are served from the cache;
// everything else is fetched fresh and only falls back to the cache offline.
const CACHE = 'silverback-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === '/health') return;
  const keep = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(keep)));
  } else {
    e.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('/'))));
  }
});
