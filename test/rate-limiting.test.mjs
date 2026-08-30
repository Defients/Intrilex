// ═══════════════════════════════════════════════════════════════
// rate-limiting.test.mjs — Server rate limiting tests
//
// Proves:
//   - Normal message rate is allowed
//   - Burst above capacity is rate-limited
//   - Repeated rate-limit hits result in connection termination
//   - Rate limit config exists in server source
//   - RATE_LIMITED reason code exists
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

import {
  createMatch,
  ReasonCode,
} from '../packages/network-protocol/src/protocol.mjs';

// Use random ports to avoid conflicts between parallel test runs
function randomPort() { return 4000 + randomInt(0, 999); }

// Helper: wait for a single message
function waitForMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timeout);
      try { resolve(JSON.parse(data.toString())); } catch { resolve(null); }
    });
    ws.once('close', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

// ── Section 1: Normal rate is allowed ──

test('rate-limit: single message is allowed', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.send(JSON.stringify(createMatch('core-unrestricted-authority', 'req-1')));
    const resp = await waitForMessage(ws);

    assert.ok(resp, 'Should receive a response');
    assert.equal(resp.type, 'MATCH_CREATED');
    ws.close();
  } finally {
    await server.close();
  }
});

// ── Section 2: Burst above capacity is rate-limited ──

test('rate-limit: burst above capacity returns RATE_LIMITED', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Send 20 messages rapidly (capacity is 10, so 10+ should be rate-limited)
    const allMessages = [];
    const done = new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      ws.on('message', (data) => {
        try { allMessages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
      });
      ws.on('close', () => { clearTimeout(timeout); resolve(); });
    });

    for (let i = 0; i < 20; i++) {
      try { ws.send(JSON.stringify(createMatch('core-unrestricted-authority', `req-burst-${i}`))); }
      catch { /* ws may be closed */ }
    }

    await done;

    const rateLimited = allMessages.filter(m => m.type === 'ERROR' && m.payload.code === ReasonCode.RATE_LIMITED);
    assert.ok(rateLimited.length > 0, 'At least some messages should be rate-limited');

    try { ws.close(); } catch { /* ignore */ }
  } finally {
    await server.close();
  }
});

// ── Section 3: Repeated rate-limit hits terminate connection ──

test('rate-limit: repeated violations terminate connection', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Send a flood of messages to trigger ban (capacity=10, ban threshold=5 hits)
    for (let i = 0; i < 30; i++) {
      try { ws.send(JSON.stringify(createMatch('core-unrestricted-authority', `req-flood-${i}`))); }
      catch { /* ws may be terminated */ }
    }

    // Wait for connection to be terminated
    const closed = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      ws.on('close', () => { clearTimeout(timeout); resolve(true); });
    });

    assert.ok(closed, 'Connection should be terminated after repeated rate-limit violations');
  } finally {
    await server.close();
  }
});

// ── Section 4: Rate limit config exists ──

test('rate-limit: server source has rate limit configuration', () => {
  const source = readFileSync(new URL('../apps/match-server/src/server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('RATE_LIMIT_CAPACITY'), 'Server must define RATE_LIMIT_CAPACITY');
  assert.ok(source.includes('RATE_LIMIT_REFILL_MS'), 'Server must define RATE_LIMIT_REFILL_MS');
  assert.ok(source.includes('RATE_LIMIT_BAN_THRESHOLD'), 'Server must define RATE_LIMIT_BAN_THRESHOLD');
  assert.ok(source.includes('checkRateLimit'), 'Server must have checkRateLimit function');
});

// ── Section 5: RATE_LIMITED reason code exists ──

test('rate-limit: RATE_LIMITED reason code exists', () => {
  assert.equal(ReasonCode.RATE_LIMITED, 'RATE_LIMITED');
});

// ── Section 6: Auth-attempt rate limiting ──

test('rate-limit: auth-attempt config exists in server source', () => {
  const source = readFileSync(new URL('../apps/match-server/src/server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('AUTH_ATTEMPT_MAX'), 'Server must define AUTH_ATTEMPT_MAX');
  assert.ok(source.includes('createAuthHandlers'), 'Server must install the extracted auth handlers');
  // The extracted handler owns the rate-check implementation and flood logging.
  const authHandlersSource = readFileSync(new URL('../apps/match-server/src/handlers/auth-handlers.mjs', import.meta.url), 'utf8');
  assert.ok(authHandlersSource.includes('checkAuthAttemptRate'), 'auth-handlers must apply the auth-attempt rate check');
  assert.ok(authHandlersSource.includes('auth_attempt_flood'), 'auth-handlers must log auth_attempt_flood ban reason');
});

test('rate-limit: auth attempts below threshold are allowed', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { FakeIdentityVerifier } = await import('../apps/match-server/src/auth/fake-identity-verifier.mjs');
  const { createServer } = await import('node:net');

  async function freePort() {
    return new Promise((resolve) => {
      const srv = createServer();
      srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    });
  }
  const port = await freePort();
  const verifier = new FakeIdentityVerifier();
  verifier.registerIdentity('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.alice-sig-1234567890', {
    accountId: 'a1111111-1111-1111-1111-111111111111', isAnonymous: false,
    publicProfile: { publicPlayerId: 'PLY_alice', displayName: 'Alice', handle: 'alice', avatarUrl: null },
  });
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'required', identityVerifier: verifier, allowFakePersistor: true,
    authAttemptMax: 5, rateLimitCapacity: 10000,
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    // Send 3 auth attempts (below threshold of 5) — all should be allowed
    for (let i = 0; i < 3; i++) {
      ws.send(JSON.stringify({
        protocolVersion: 2, type: 'AUTHENTICATE', requestId: `auth-${i}`,
        payload: { accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.alice-sig-1234567890' },
      }));
      const msg = await waitForMessage(ws);
      assert.ok(msg, `Attempt ${i} should get a response`);
      assert.equal(msg.type, 'AUTHENTICATED', `Attempt ${i} should succeed (below threshold)`);
    }
    ws.close();
  } finally {
    await server.close();
    verifier.close();
  }
});

test('rate-limit: auth attempts above threshold return RATE_LIMITED', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { FakeIdentityVerifier } = await import('../apps/match-server/src/auth/fake-identity-verifier.mjs');
  const { createServer } = await import('node:net');

  async function freePort() {
    return new Promise((resolve) => {
      const srv = createServer();
      srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    });
  }
  const port = await freePort();
  const verifier = new FakeIdentityVerifier();
  // Register a valid token AND an invalid one (invalid triggers auth failure but still counts as an attempt)
  verifier.registerIdentity('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.alice-sig-1234567890', {
    accountId: 'a1111111-1111-1111-1111-111111111111', isAnonymous: false,
    publicProfile: { publicPlayerId: 'PLY_alice', displayName: 'Alice', handle: 'alice', avatarUrl: null },
  });
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'required', identityVerifier: verifier, allowFakePersistor: true,
    authAttemptMax: 3, rateLimitCapacity: 10000,
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    // Send 3 valid auth attempts (at threshold) — 3rd should still be allowed (3 < 3 is false, 3 >= 3 triggers on 4th)
    // Actually: checkAuthAttemptRate checks BEFORE recording, so:
    //   Attempt 1: 0 entries → allowed, record → 1 entry
    //   Attempt 2: 1 entry  → allowed, record → 2 entries
    //   Attempt 3: 2 entries → allowed, record → 3 entries
    //   Attempt 4: 3 entries (>= max=3) → BANNED
    for (let i = 0; i < 3; i++) {
      ws.send(JSON.stringify({
        protocolVersion: 2, type: 'AUTHENTICATE', requestId: `auth-ok-${i}`,
        payload: { accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.alice-sig-1234567890' },
      }));
      const msg = await waitForMessage(ws);
      assert.equal(msg.type, 'AUTHENTICATED', `Attempt ${i + 1} should succeed (below threshold)`);
    }

    // 4th attempt should be RATE_LIMITED
    ws.send(JSON.stringify({
      protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-flood',
      payload: { accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.alice-sig-1234567890' },
    }));
    const floodMsg = await waitForMessage(ws);
    assert.ok(floodMsg, '4th attempt should get a response');
    assert.equal(floodMsg.type, 'ERROR', '4th attempt should return ERROR');
    assert.equal(floodMsg.payload.code, 'RATE_LIMITED', '4th attempt should be RATE_LIMITED');
    ws.close();
  } finally {
    await server.close();
    verifier.close();
  }
});
