const STATIC_CACHE_NAME = 'rits-oic-map-static-v7';
const RUNTIME_CACHE_NAME = 'rits-oic-map-runtime-v7';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon/favicon-20260412b.ico',
  '/icon/favicon-20260412b.png',
  '/icon/pwa-192-20260412b.png',
  '/icon/pwa-512-20260412b.png'
];
const STATIC_PATH_PREFIXES = ['/assets/', '/cmaps/', '/icon/', '/standard_fonts/'];
const STATIC_PATHS = new Set(['/manual-search-index.json']);

function isEditorPath(pathname) {
  return pathname === '/editor' || pathname.startsWith('/editor/');
}

function isStaticAssetRequest(request, url) {
  if (STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) || STATIC_PATHS.has(url.pathname)) {
    return true;
  }

  return ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination);
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }

    return caches.match('/') || Response.error();
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request, { ignoreSearch: true });
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (!response || !response.ok) {
    return response;
  }

  const cache = await caches.open(RUNTIME_CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => ![STATIC_CACHE_NAME, RUNTIME_CACHE_NAME].includes(cacheName))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || isEditorPath(url.pathname)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirst(request));
  }
});
