// Bump when static assets change so phones drop the old (broken) logo from the cache
const CACHE_NAME = 'kaprao-pos-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './icon.svg',
  './manifest.json'
];

// Install Event - Pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching POS Application Shell');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[Service Worker] Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First with Cache Fallback + AI API offline handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Other sites (Telegram, Firebase, LINE relay, payment server...) go straight to the network:
  // answering them here turned any failure into a fake "503 Offline" and hid the real response
  if (url.origin !== self.location.origin) return;

  // Handle AI API endpoints when offline gracefully
  if (url.pathname.startsWith('/api/ai/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        console.log('[Service Worker] Network offline. Returning cached/simulated AI response for:', url.pathname);
        return new Response(
          JSON.stringify({
            source: 'offline-service-worker-cache',
            offlineMessage: 'ระบบอยู่ในโหมดออฟไลน์ - ทำงานประมวลผลด้วยเกณฑ์ในเครื่องชั่วคราว',
            overallSummary: {
              healthScore: 80,
              averageFoodCostPercent: 32.0,
              totalMenuCount: 5,
              starCount: 2,
              plowhorseCount: 2,
              puzzleCount: 1,
              dogCount: 0,
              marketTrendSummary: 'ทำงานในโหมดออฟไลน์: บันทึกข้อมูลเมนูและต้นทุนในเครื่องเพื่อใช้งานต่อเนื่องโดยไม่สะดุด'
            }
            // No receiptData here: an offline "scan" must never invent an expense amount
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // Standard static assets & navigation fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache valid HTTP 200 GET responses dynamically
        if (
          event.request.method === 'GET' &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed - load from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If HTML page request and not in cache, fallback to /index.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html') || caches.match('index.html');
          }
          return new Response('Offline - Asset unavailable', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
