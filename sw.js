/*
 * Service worker : met l'appli en cache pour qu'elle fonctionne sans réseau.
 * À CHAQUE MISE EN LIGNE : augmenter le numéro de CACHE_NAME (venaison-v1 → venaison-v2 …),
 * sinon les téléphones garderont l'ancienne version. Le numéro s'affiche en bas des Réglages.
 */
const CACHE_NAME = 'venaison-v4';

const FICHIERS = [
  './',
  './index.html',
  './css/app.css',
  './js/logic.js',
  './js/store.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Cache d'abord : l'appli s'ouvre instantanément, avec ou sans réseau.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
