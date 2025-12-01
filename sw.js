const CACHE_NAME = 'cam-test-v1.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './exif.js',
  './piexif.js',
  './frentes.json',
  './img/icon-512x512.png',
  './img/LOGO GDR.jpeg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});