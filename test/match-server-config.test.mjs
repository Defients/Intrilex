// ═══════════════════════════════════════════════════════════════
// match-server-config.test.mjs
//
// Tests for the browser-side match server URL configuration module.
// Verifies:
//   - Dev fallback to ws://localhost:3099 on localhost origins
//   - Build-time injected URL takes priority
//   - localStorage override works
//   - Production with no config returns null (no silent localhost fallback)
//   - Mixed-content validation (ws:// from https:// page is invalid)
//   - URL scheme validation
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// We test the config resolution logic by simulating browser globals.
// The module reads window.__INTRILEX_CONFIG__, localStorage, and location.

/**
 * Set up a simulated browser environment.
 * @param {object} opts — { hostname, protocol, config, localStorageEntries }
 */
function setupBrowserEnv(opts = {}) {
  const hostname = opts.hostname ?? 'localhost';
  const protocol = opts.protocol ?? 'http:';
  const config = opts.config ?? null;
  const lsEntries = opts.localStorageEntries ?? {};

  // Simulate window
  globalThis.window = config ? { __INTRILEX_CONFIG__: config } : {};

  // Simulate location
  globalThis.location = { hostname, protocol };

  // Simulate localStorage with a Map-backed store
  const lsMap = new Map(Object.entries(lsEntries));
  globalThis.localStorage = {
    getItem: (key) => lsMap.get(key) ?? null,
    setItem: (key, val) => lsMap.set(key, val),
    removeItem: (key) => lsMap.delete(key),
  };
}

function teardownBrowserEnv() {
  delete globalThis.window;
  delete globalThis.location;
  delete globalThis.localStorage;
}

/**
 * Dynamically import the module fresh (bypasses ESM cache).
 * @returns {Promise<object>}
 */
async function freshImport() {
  // Use a cache-busting query to force re-evaluation
  const mod = await import(`../apps/lab-web/src/play/network/match-server-config.js?ts=${Date.now()}`);
  return mod;
}

describe('match-server-config', () => {
  beforeEach(() => teardownBrowserEnv());
  afterEach(() => teardownBrowserEnv());

  describe('getMatchServerUrl', () => {
    it('returns ws://localhost:3099 on localhost dev origin', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), 'ws://localhost:3099');
    });

    it('returns ws://127.0.0.1:3099 on 127.0.0.1 dev origin', async () => {
      setupBrowserEnv({ hostname: '127.0.0.1', protocol: 'http:' });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), 'ws://127.0.0.1:3099');
    });

    it('uses build-time injected matchServerUrl from __INTRILEX_CONFIG__', async () => {
      setupBrowserEnv({
        hostname: 'localhost',
        protocol: 'http:',
        config: { matchServerUrl: 'wss://match.intrilex.cards' },
      });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), 'wss://match.intrilex.cards');
    });

    it('build-time config takes priority over localStorage', async () => {
      setupBrowserEnv({
        hostname: 'localhost',
        protocol: 'http:',
        config: { matchServerUrl: 'wss://match.intrilex.cards' },
        localStorageEntries: { 'intrilex:network-server-url': 'ws://override:9999' },
      });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), 'wss://match.intrilex.cards');
    });

    it('localStorage override works when no build-time config', async () => {
      setupBrowserEnv({
        hostname: 'localhost',
        protocol: 'http:',
        // IRX-H38: override must be an allowlisted host (localhost is allowed)
        localStorageEntries: { 'intrilex:network-server-url': 'ws://localhost:8080' },
      });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), 'ws://localhost:8080');
    });

    it('discards stale ws:// localStorage override on HTTPS production (mixed content)', async () => {
      // Regression: a user who ran the dev server locally and then visited
      // the production site would have a stale ws://localhost:3099 in
      // localStorage. Without validation, this caused "Connection
      // Configuration Error" instead of falling through to the build-time
      // config or returning null.
      setupBrowserEnv({
        hostname: 'intrilex.neocities.org',
        protocol: 'https:',
        localStorageEntries: { 'intrilex:network-server-url': 'ws://localhost:3099' },
      });
      const { getMatchServerUrl } = await freshImport();
      // Stale override must be discarded — should return null (no build-time config)
      assert.equal(getMatchServerUrl(), null);
      // And the stale entry should be removed from localStorage
      assert.equal(globalThis.localStorage.getItem('intrilex:network-server-url'), null);
    });

    it('discards stale ws:// localStorage override when build-time config exists', async () => {
      setupBrowserEnv({
        hostname: 'intrilex.neocities.org',
        protocol: 'https:',
        config: { matchServerUrl: 'wss://match.intrilex.cards' },
        localStorageEntries: { 'intrilex:network-server-url': 'ws://localhost:3099' },
      });
      const { getMatchServerUrl } = await freshImport();
      // Build-time config takes priority anyway, but the stale override
      // should also be cleaned up from localStorage
      assert.equal(getMatchServerUrl(), 'wss://match.intrilex.cards');
    });

    it('returns null in production with no config and no localStorage override', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), null);
    });

    it('returns null on non-localhost production origin without config', async () => {
      setupBrowserEnv({ hostname: 'intrilex.neocities.org', protocol: 'https:' });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), null);
    });
  });

  describe('isMatchServerConfigured', () => {
    it('returns true on localhost (dev fallback)', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { isMatchServerConfigured } = await freshImport();
      assert.equal(isMatchServerConfigured(), true);
    });

    it('returns false in production without config', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { isMatchServerConfigured } = await freshImport();
      assert.equal(isMatchServerConfigured(), false);
    });

    it('returns true when build-time config is present', async () => {
      setupBrowserEnv({
        hostname: 'intrilex.cards',
        protocol: 'https:',
        config: { matchServerUrl: 'wss://match.intrilex.cards' },
      });
      const { isMatchServerConfigured } = await freshImport();
      assert.equal(isMatchServerConfigured(), true);
    });
  });

  describe('validateMatchServerUrl', () => {
    it('validates wss:// URL on HTTPS page', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('wss://match.intrilex.cards');
      assert.equal(result.valid, true);
    });

    it('rejects ws:// URL on HTTPS page (mixed content)', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('ws://match.intrilex.cards:3099');
      assert.equal(result.valid, false);
      assert.match(result.reason, /mixed content/i);
    });

    it('allows ws:// URL on HTTP page (dev)', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('ws://localhost:3099');
      assert.equal(result.valid, true);
    });

    it('rejects non-WebSocket URL schemes', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('http://localhost:3099');
      assert.equal(result.valid, false);
      assert.match(result.reason, /ws:\/\//i);
    });

    it('rejects null/empty URL', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { validateMatchServerUrl } = await freshImport();
      assert.equal(validateMatchServerUrl(null).valid, false);
      assert.equal(validateMatchServerUrl('').valid, false);
      assert.equal(validateMatchServerUrl(undefined).valid, false);
    });

    // IRX-H38: JWT exfiltration prevention — only allowlisted hosts permitted
    it('IRX-H38: rejects attacker-controlled host (JWT exfiltration prevention)', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('wss://evil.example.com');
      assert.equal(result.valid, false);
      assert.match(result.reason, /allowlist/i);
    });

    it('IRX-H38: rejects lookalike host that is not the official match server', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('wss://match.intrilex.cards.evil.example.com');
      assert.equal(result.valid, false);
      assert.match(result.reason, /allowlist/i);
    });

    it('IRX-H38: allows official production host match.intrilex.cards', async () => {
      setupBrowserEnv({ hostname: 'intrilex.cards', protocol: 'https:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('wss://match.intrilex.cards');
      assert.equal(result.valid, true);
    });

    it('IRX-H38: allows localhost for dev', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('ws://localhost:3099');
      assert.equal(result.valid, true);
    });

    it('IRX-H38: allows 127.0.0.1 for dev', async () => {
      setupBrowserEnv({ hostname: '127.0.0.1', protocol: 'http:' });
      const { validateMatchServerUrl } = await freshImport();
      const result = validateMatchServerUrl('ws://127.0.0.1:3099');
      assert.equal(result.valid, true);
    });
  });

  describe('diagnoseConfig', () => {
    it('returns no warnings in dev mode without config', async () => {
      setupBrowserEnv({ hostname: 'localhost', protocol: 'http:' });
      const { diagnoseConfig } = await freshImport();
      const result = diagnoseConfig();
      assert.equal(result.isDev, true);
      assert.equal(result.configPresent, false);
      assert.equal(result.warnings.length, 0, 'Dev mode should not warn about missing config');
    });

    it('warns when __INTRILEX_CONFIG__ is missing in production', async () => {
      setupBrowserEnv({ hostname: 'intrilex.neocities.org', protocol: 'https:' });
      const { diagnoseConfig } = await freshImport();
      const result = diagnoseConfig();
      assert.equal(result.configPresent, false);
      assert.ok(result.warnings.length > 0, 'Should warn about missing config in production');
      assert.ok(result.warnings.some(w => w.includes('__INTRILEX_CONFIG__')), 'Should mention __INTRILEX_CONFIG__');
    });

    it('warns when matchServerUrl is missing from config in production', async () => {
      setupBrowserEnv({
        hostname: 'intrilex.neocities.org',
        protocol: 'https:',
        config: { supabase: { url: 'https://x.supabase.co', publishableKey: 'key' } },
      });
      const { diagnoseConfig } = await freshImport();
      const result = diagnoseConfig();
      assert.equal(result.configPresent, true);
      assert.equal(result.hasMatchServerUrl, false);
      assert.ok(result.warnings.some(w => w.includes('matchServerUrl')), 'Should warn about missing matchServerUrl');
    });

    it('warns when supabase is missing from config in production', async () => {
      setupBrowserEnv({
        hostname: 'intrilex.neocities.org',
        protocol: 'https:',
        config: { matchServerUrl: 'wss://match.intrilex.cards' },
      });
      const { diagnoseConfig } = await freshImport();
      const result = diagnoseConfig();
      assert.equal(result.hasSupabase, false);
      assert.ok(result.warnings.some(w => w.includes('supabase')), 'Should warn about missing supabase config');
    });

    it('returns no warnings when config is complete in production', async () => {
      setupBrowserEnv({
        hostname: 'intrilex.neocities.org',
        protocol: 'https:',
        config: {
          matchServerUrl: 'wss://match.intrilex.cards',
          supabase: { url: 'https://x.supabase.co', publishableKey: 'key' },
        },
      });
      const { diagnoseConfig } = await freshImport();
      const result = diagnoseConfig();
      assert.equal(result.configPresent, true);
      assert.equal(result.hasMatchServerUrl, true);
      assert.equal(result.hasSupabase, true);
      assert.equal(result.warnings.length, 0, 'Complete config should produce no warnings');
    });

    it('logs warnings to console.warn', async () => {
      setupBrowserEnv({ hostname: 'intrilex.neocities.org', protocol: 'https:' });
      const warnings = [];
      const origWarn = console.warn;
      console.warn = (msg) => warnings.push(msg);
      try {
        const { diagnoseConfig } = await freshImport();
        diagnoseConfig();
      } finally {
        console.warn = origWarn;
      }
      assert.ok(warnings.length > 0, 'Should log warnings to console.warn');
      assert.ok(warnings.every(w => w.includes('[intrilex:config]')), 'Warnings should be prefixed with [intrilex:config]');
    });
  });
});
