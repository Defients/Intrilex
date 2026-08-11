// ═══════════════════════════════════════════════════════════════
// match-server-config.js — Browser-side match server URL resolution
//
// Centralises the WebSocket endpoint configuration so that application
// code never scatters raw server URLs or hardcoded ports.
//
// Resolution priority:
//   1. window.__INTRILEX_CONFIG__.matchServerUrl  (build-time injected)
//   2. localStorage 'intrilex:network-server-url'  (user override via Settings)
//   3. Dev fallback: ws://<hostname>:3099 when running on localhost
//   4. null — production with no configured endpoint (fail visibly)
//
// CRITICAL INVARIANT:
//   Production builds must NEVER silently fall back to localhost.
//   If no match server URL is configured in production, getMatchServerUrl()
//   returns null and the lobby must show an "unavailable" state.
//
// ═══════════════════════════════════════════════════════════════

const DEV_DEFAULT_PORT = 3099;

/**
 * Returns true when the page is served from a local development origin.
 * @returns {boolean}
 */
function isDevOrigin() {
  if (typeof location === 'undefined') return false;
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

/**
 * Returns true when the page is served over HTTPS (production).
 * @returns {boolean}
 */
function isSecureContext() {
  if (typeof location === 'undefined') return false;
  return location.protocol === 'https:';
}

/**
 * Resolve the match server WebSocket URL.
 *
 * @returns {string|null} The WebSocket URL, or null when unconfigured in production.
 */
export function getMatchServerUrl() {
  // 1. Build-time injected config (production + dev with explicit config)
  if (typeof window !== 'undefined' && window.__INTRILEX_CONFIG__?.matchServerUrl) {
    return window.__INTRILEX_CONFIG__.matchServerUrl;
  }

  // 2. User override via Settings UI (localStorage)
  try {
    const saved = localStorage.getItem('intrilex:network-server-url');
    if (saved) return saved;
  } catch { /* localStorage unavailable */ }

  // 3. Dev fallback — only for localhost origins
  if (isDevOrigin()) {
    return `ws://${location.hostname}:${DEV_DEFAULT_PORT}`;
  }

  // 4. Production with no configured endpoint — fail visibly, do NOT fall back to localhost
  return null;
}

/**
 * Returns true when a match server URL is available (configured or dev fallback).
 * Use this to decide whether to show the lobby or an "unavailable" screen.
 * @returns {boolean}
 */
export function isMatchServerConfigured() {
  return getMatchServerUrl() !== null;
}

/**
 * Validate that a WebSocket URL is safe for the current page context.
 * Prevents mixed-content violations (ws:// from an https:// page).
 * @param {string} url
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateMatchServerUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'No URL provided' };
  }
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    return { valid: false, reason: 'URL must use ws:// or wss:// scheme' };
  }
  // Mixed-content check: HTTPS pages must use wss://
  if (isSecureContext() && url.startsWith('ws://')) {
    return {
      valid: false,
      reason: 'Insecure ws:// WebSocket from an HTTPS page is blocked by the browser (mixed content). Use wss:// instead.',
    };
  }
  return { valid: true };
}

// Expose for settings UI and diagnostics
export const __test = { isDevOrigin, isSecureContext, DEV_DEFAULT_PORT };
