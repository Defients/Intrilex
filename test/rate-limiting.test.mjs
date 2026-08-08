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
