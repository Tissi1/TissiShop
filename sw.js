const CACHE_NAME = 'ma-liste-courses-v22';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './logos/carrefour.svg',
  './logos/leclerc.svg',
  './logos/intermarche.svg',
  './logos/lidl.svg',
  './logos/superu.svg',
  './logos/chlorophylle.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
