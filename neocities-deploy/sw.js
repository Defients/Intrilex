// sw.js — self-unregistering kill switch (v0.27.1+)
// The service worker was removed because stale caches served raw
// source files with bare package imports the browser cannot resolve.
// This file exists only to ensure old SWs update to a version that
// immediately unregisters itself and clears all caches.

self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.claim();
    const allClients = await self.clients.matchAll();
    allClients.forEach((c) => c.navigate(c.url));
  })());
});
