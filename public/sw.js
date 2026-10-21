/* Pi · Aura — minimal Service Worker: cache-first install + background update. */
const CACHE = 'pi-aura-' + (typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const copy = fresh.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached ?? (await caches.match('./index.html'));
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => cached ?? (await caches.match('./index.html')));
      return cached ?? fetching;
    })(),
  );
});
