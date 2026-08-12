// ═══════════════════════════════════════════════════════════════
// sw.js — Intrilex Simulation Lab Service Worker
//
// Provides offline-first PWA capability by caching the app shell,
// static assets, and data files. Uses a version-keyed cache that
// is invalidated on each build (via BUILD_INFO.json version).
//
// v0.24.2: CACHE_VERSION is now derived from the build identity in
// BUILD_INFO.json, not manually maintained. This prevents cache-version
// drift when the product version is bumped.
//
// v0.27.1: Non-hashed .js and .css files now use networkFirst instead of
// staleWhileRevalidate. This prevents a stale SW from serving old cached
// raw source files (e.g., app.js, workspaces/*.js) that contain bare
// @intrilex/* imports the browser cannot resolve. Hashed assets
// (app.[hash].js, styles.[hash].css) remain cache-first (immutable).
// BUILD_SW_STAMP is injected by build.mjs to force SW re-installation.
// ═══════════════════════════════════════════════════════════════

// Fallback version if BUILD_INFO.json is not yet fetched.
// The real version is loaded asynchronously in the install handler.
let CACHE_VERSION = 'intrilex-v0.27.0-unknown';
let CACHE_NAME = `${CACHE_VERSION}-${self.registration ? self.registration.scope : 'root'}`;

// App shell — always cached for offline use
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/BUILD_INFO.json',
  '/BUNDLE_MANIFEST.json',
];

// Maximum cache entries to prevent unbounded growth
const MAX_CACHE_ENTRIES = 800;

// ── Install: pre-cache app shell ────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // v0.24.2: Derive cache version from BUILD_INFO.json
      try {
        const infoResp = await fetch('/BUILD_INFO.json', { cache: 'no-store' });
        if (infoResp.ok) {
          const info = await infoResp.json();
          const ver = info.version || info.labVersion || 'unknown';
          CACHE_VERSION = `intrilex-v${ver}`;
          CACHE_NAME = `${CACHE_VERSION}-${self.registration ? self.registration.scope : 'root'}`;
        }
      } catch (_e) {
        // Fallback to default version — cache will still work
      }
      const cache = await caches.open(CACHE_NAME);
      // Cache app shell individually so one failure doesn't block all
      await Promise.allSettled(
        APP_SHELL.map(async (url) => {
          try {
            const resp = await fetch(url, { cache: 'no-store' });
            if (resp.ok) await cache.put(url, resp.clone());
          } catch (_e) {
            // Network failure during install is non-fatal
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

// ── Activate: clean old caches ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('intrilex-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ── Fetch: stale-while-revalidate for hashed assets, ────────────
//              network-first for data, cache-first for static
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (e.g., Google Fonts)
  if (url.origin !== self.location.origin) return;

  // Skip non-HTTP(s) protocols (e.g., chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Hashed assets (app.[hash].js, styles.[hash].css) — cache-first (immutable)
  if (/\.[a-f0-9]{12}\.(js|css)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Runtime config (unhashed dev path) — network-first to prevent stale
  // config from causing connection errors. In production builds, the config
  // file is content-hashed (__intrilex-config.[hash].js) and is handled by
  // the hashed-asset branch above as cache-first (immutable).
  if (url.pathname === '/__intrilex-config.js') {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML documents — network-first (always get latest version)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Non-hashed .js and .css files — network-first to prevent stale SW
  // from serving old cached raw source files with bare @intrilex/* imports.
  // (Hashed assets were already handled above as cache-first/immutable.)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Engine modules, data files, card art — cache-first with background refresh
  if (
    url.pathname.startsWith('/engine/') ||
    url.pathname.startsWith('/data/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/hybrix/') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(networkFirst(request));
});

// ── Cache strategies ────────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      // Only cache OK, non-partial, non-opaque responses
      if (response && response.ok && response.status !== 206 && response.type !== 'opaque') {
        cache.put(request, response.clone()).catch(() => {});
        evictIfNeeded(cache);
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.status !== 206 && response.type !== 'opaque') {
      cache.put(request, response.clone()).catch(() => {});
      evictIfNeeded(cache);
    }
    return response;
  } catch (_e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const fallback = await cache.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function evictIfNeeded(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_CACHE_ENTRIES) {
    // Evict oldest entries (FIFO approximation)
    const toEvict = keys.length - MAX_CACHE_ENTRIES;
    for (let i = 0; i < toEvict; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// ── Message: allow page to trigger update ───────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
