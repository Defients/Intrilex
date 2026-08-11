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
        localStorageEntries: { 'intrilex:network-server-url': 'ws://custom:8080' },
      });
      const { getMatchServerUrl } = await freshImport();
      assert.equal(getMatchServerUrl(), 'ws://custom:8080');
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
  });
});
