const CACHE_NAME = 'cam-test-v22-3-catalog-4col'; // Version v22.3 - Catalog grid 4 columns
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './exif.js',
  './piexif.js',
  './jszip.min.js',
  './FileSaver.min.js',
  './connection-monitor.js',
  './db-manager.js',
  './supabase-client.js',
  './admin-panel.js',
  './manifest.json',
  './img/icon-512x512.png',
  './img/LOGO GDR.jpeg'
];

// CDN resources to cache
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forzar activación inmediata de la nueva versión
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching assets');
      // Cache local assets
      return cache.addAll(ASSETS).then(() => {
        // Cache CDN assets (optional, may fail if offline during install)
        return Promise.allSettled(
          CDN_ASSETS.map(url => 
            fetch(url, { mode: 'no-cors' })
              .then(response => cache.put(url, response))
              .catch(err => console.log('[SW] Could not cache CDN:', url))
          )
        );
      });
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
  const url = new URL(event.request.url);
  
  // 1. Ignorar peticiones que no sean GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // 2. Peticiones a Supabase API: siempre network (no cachear)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // 3. Peticiones a otros dominios (CDN, analytics, etc): pasar directo
  if (!event.request.url.startsWith(self.location.origin)) {
    // Intentar cache primero para CDN conocidos
    if (CDN_ASSETS.includes(event.request.url)) {
      event.respondWith(async function() {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        return fetch(event.request);
      }());
    }
    return;
  }

  // 4. Peticiones locales: usar estrategia según conexión
  event.respondWith(async function() {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);

    // Detección de Red: ¿Es lenta?
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isSlow = connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' || connection.saveData === true);

    // LÓGICA DE ESTRATEGIA
    if (isSlow || !navigator.onLine) {
      // ESTRATEGIA: CACHE FIRST (Prioridad Velocidad/Offline)
      if (cachedResponse) {
        return cachedResponse;
      }
      // Si no está en caché, intentar red
      return fetch(event.request);
      
    } else {
      // ESTRATEGIA: NETWORK FIRST (Prioridad Actualización)
      try {
        const networkResponse = await fetch(event.request);
        
        // Si la respuesta es válida, actualizamos la caché
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        // Si falla la red, usamos la caché
        console.log('[Service Worker] Network failed, falling back to cache');
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    }
  }());
});