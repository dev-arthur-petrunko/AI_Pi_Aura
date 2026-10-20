/* π · Aura — минимальный Service Worker: кэш первого успеха + фоновое обновление. */
const CACHE = 'pi-aura-v2';

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
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      // фоновое обновление копии (stale-while-revalidate)
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
