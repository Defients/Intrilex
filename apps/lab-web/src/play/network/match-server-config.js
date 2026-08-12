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

  // 2. User override via Settings UI (localStorage).
  // Validate before use — a stale ws:// override from a dev session
  // would cause a mixed-content error on an HTTPS production page.
  // If invalid for the current context, silently discard and fall through.
  try {
    const saved = localStorage.getItem('intrilex:network-server-url');
    if (saved) {
      const check = validateMatchServerUrl(saved);
      if (check.valid) return saved;
      // Stale override — clear it so the user isn't permanently stuck
      localStorage.removeItem('intrilex:network-server-url');
    }
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
 * IRX-H38: Restrict localStorage override to known-safe hosts to prevent
 * JWT exfiltration to attacker-controlled servers.
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
  // IRX-H38: Allowlist check for localStorage overrides.
  // The build-time injected URL (window.__INTRILEX_CONFIG__) is trusted
  // and not subject to this check. But a user-entered URL from localStorage
  // must be restricted to known-safe hosts to prevent JWT exfiltration.
  // Allowed: localhost, 127.0.0.1 (dev), and match.intrilex.cards (prod).
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isOfficialProd = host === 'match.intrilex.cards';
    if (!isLocalhost && !isOfficialProd) {
      return {
        valid: false,
        reason: `Match server URL host "${host}" is not in the allowlist. Only localhost (dev) and match.intrilex.cards (production) are permitted.`,
      };
    }
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }
  return { valid: true };
}

// Expose for settings UI and diagnostics
export const __test = { isDevOrigin, isSecureContext, DEV_DEFAULT_PORT };

/**
 * Diagnose the runtime config state and log structured warnings for
 * missing or incomplete configuration. Called once on app bootstrap
 * to surface config issues early (e.g., config file failed to load,
 * match server URL missing in production).
 *
 * @returns {{ configPresent: boolean, hasMatchServerUrl: boolean, hasSupabase: boolean, isDev: boolean, warnings: string[] }}
 */
export function diagnoseConfig() {
  const warnings = [];
  const isDev = isDevOrigin();
  const hasConfig = typeof window !== 'undefined' && !!window.__INTRILEX_CONFIG__;
  const hasMatchServerUrl = !!(hasConfig && window.__INTRILEX_CONFIG__.matchServerUrl);
  const hasSupabase = !!(hasConfig && window.__INTRILEX_CONFIG__.supabase);

  // Production with no __INTRILEX_CONFIG__ at all — the config file may
  // have failed to load (404, CSP block, SW stale cache, etc.)
  if (!isDev && !hasConfig) {
    warnings.push('__INTRILEX_CONFIG__ is not set — runtime config file may have failed to load');
  }

  // Production with config but no match server URL
  if (!isDev && hasConfig && !hasMatchServerUrl) {
    warnings.push('matchServerUrl missing from __INTRILEX_CONFIG__ — online play will be unavailable');
  }

  // Production with config but no Supabase credentials
  if (!isDev && hasConfig && !hasSupabase) {
    warnings.push('supabase config missing from __INTRILEX_CONFIG__ — auth and cloud features will be unavailable');
  }

  // Log warnings to console for diagnostics
  for (const w of warnings) {
    console.warn('[intrilex:config] ' + w);
  }

  return { configPresent: hasConfig, hasMatchServerUrl, hasSupabase, isDev, warnings };
}
