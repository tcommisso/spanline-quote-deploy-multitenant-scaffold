// Service Worker for Altaspan PWA
const CACHE_NAME = 'altaspan-v3';
const OFFLINE_URL = '/offline.html';

// Keep navigations network-only so deploys cannot leave users on stale HTML
// that points at removed hashed JS chunks.
const PRECACHE_ASSETS = [
  '/offline.html',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Push: show notification when push message received
self.addEventListener('push', (event) => {
  let data = { title: 'AltaSpan', body: 'You have a new notification' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    // If JSON parse fails, try text
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'default',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    actions: [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AltaSpan', options)
  );
});

// Notification click: open the target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Fetch: network-first with offline fallback
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls and tRPC requests entirely (don't intercept)
  if (url.pathname.startsWith('/api/')) return;

  // Skip manifests and other non-navigation static assets that might
  // get redirected by the platform auth gate — let the browser handle them natively
  if (url.pathname === '/manifest.json' || url.pathname === '/trade-portal-manifest.json' || url.pathname === '/sw.js') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
      .catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || new Response('', { status: 404 });
      })
  );
});
