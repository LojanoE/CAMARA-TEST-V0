const CACHE_NAME = 'cam-test-v9-offline-fix'; // Incrementamos versión
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './exif.js',
  './piexif.js',
  './jszip.min.js',
  './FileSaver.min.js',
  './frentes.json',
  './manifest.json',
  './img/icon-512x512.png',
  './img/LOGO GDR.jpeg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forzar activación inmediata de la nueva versión
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching assets');
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Limpiar cachés antiguas
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean GET o que sean a otros dominios (analytics, etc)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(async function() {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);

    // 1. Detección de Red: ¿Es lenta?
    // La API navigator.connection no está en todos los navegadores, así que la verificamos.
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isSlow = connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' || connection.saveData === true);

    // LÓGICA DE ESTRATEGIA
    if (isSlow || !navigator.onLine) {
      // ESTRATEGIA: CACHE FIRST (Prioridad Velocidad/Offline)
      // Si tenemos el archivo en caché, lo devolvemos inmediatamente.
      if (cachedResponse) {
        return cachedResponse;
      }
      // Si no, intentamos red (aunque sea lenta, es la única opción)
      return fetch(event.request);
      
    } else {
      // ESTRATEGIA: NETWORK FIRST (Prioridad Actualización)
      // Intentamos ir a la red para buscar actualizaciones
      try {
        const networkResponse = await fetch(event.request);
        
        // Si la respuesta es válida, actualizamos la caché para la próxima vez
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        // Si falla la red (ej. se cae el wifi momentáneamente), usamos la caché
        console.log('[Service Worker] Network failed, falling back to cache');
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    }
  }());
});