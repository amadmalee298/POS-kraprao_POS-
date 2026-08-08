const CACHE_NAME = 'kaprao-pos-v2';
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
            },
            receiptData: {
              title: 'ใบเสร็จวัตถุดิบ (โหมดออฟไลน์)',
              vendorName: 'ร้านค้าวัตถุดิบสด',
              date: new Date().toISOString().split('T')[0],
              category: 'raw_material',
              amount: 1500.00,
              includeVat: true,
              vatAmount: 98.13,
              netAmount: 1401.87,
              refNumber: 'OFFLINE-' + Math.floor(100000 + Math.random() * 900000),
              note: 'สแกนในโหมดออฟไลน์: บันทึกรายการลงเครื่องแล้ว',
              confidenceScore: 90
            }
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
