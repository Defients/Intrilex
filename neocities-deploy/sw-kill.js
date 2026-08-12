// sw-kill.js — Unregister any stale service worker and clear caches.
// The service worker was removed in v0.27.1 because stale caches served
// raw source files with bare package imports the browser cannot resolve.
// This file is loaded via <script src="sw-kill.js"> (CSP-compliant).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
  caches.keys().then(function (keys) {
    keys.forEach(function (k) { caches.delete(k); });
  });
}
