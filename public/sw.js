/* Service worker Stimia: offline per l'app shell e cache runtime.
   Usa percorsi relativi allo scope, così funziona anche su GitHub Pages
   in una sottocartella (es. /stimia/). */
const BASE = new URL('./', self.location.href).pathname;
const CACHE_NAME = 'stimia-v1';
const STATIC_FILES = [BASE + 'manifest.webmanifest', BASE + 'icon-192.png', BASE + 'icon-512.png'];
const INDEX_URL = BASE + 'index.html';

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    STATIC_FILES.map(async url => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) await cache.put(url, response);
      } catch {
        /* ignora file mancanti */
      }
    })
  );

  try {
    const response = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!response.ok) return;
    await cache.put(INDEX_URL, response.clone());
    await cache.put(BASE, response.clone());

    const html = await response.text();
    const assets = Array.from(html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)).map(match => match[1]);
    await Promise.all(
      Array.from(new Set(assets)).map(async url => {
        try {
          const assetResponse = await fetch(url, { cache: 'no-store' });
          if (assetResponse.ok) await cache.put(url, assetResponse);
        } catch {
          /* asset non disponibile */
        }
      })
    );
  } catch {
    /* install offline: mantiene la cache esistente */
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response || !response.ok) throw new Error('Rete non disponibile');
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, copy));
          return response;
        })
        .catch(async () => (await caches.match(INDEX_URL)) || (await caches.match(BASE)) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'default')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
