// ═══════════════════════════════════════════════════════════════
// sw-register.js — Service Worker registration script.
//
// Extracted from inline <script> in index.html for CSP compliance.
// Registers sw.js on window load with feature detection.
// ═══════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.error('SW registration failed:', err);
    });
  });
}
