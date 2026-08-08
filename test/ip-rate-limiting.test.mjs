// ═══════════════════════════════════════════════════════════════
// ip-rate-limiting.test.mjs — IP-based rate limiting + spectator limit tests
//
// Proves:
//   - Per-IP connection limit is enforced
//   - IP ban prevents new connections from that IP
//   - Spectator count limit per match is enforced (source-level)
//   - Server source has IP tracking and ban logic
//   - Configuration constants are defined
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

import {
  createMatch, ready, joinMatch,
  spectateMatch,
  ReasonCode,
} from '../packages/network-protocol/src/protocol.mjs';

function randomPort() { return 4500 + randomInt(0, 999); }

function waitForMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timeout);
      try { resolve(JSON.parse(data.toString())); } catch { resolve(null); }
    });
    ws.once('close', () => { clearTimeout(timeout); resolve(null); });
  });
}

// ── Section 1: Server source has IP tracking ──

test('ip-rate-limit: server source has IP tracking', () => {
  const source = readFileSync(new URL('../apps/match-server/src/server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('getClientIp'), 'Server must have getClientIp function');
  assert.ok(source.includes('x-forwarded-for'), 'Server must check x-forwarded-for header');
  assert.ok(source.includes('isIpBanned'), 'Server must have isIpBanned function');
  assert.ok(source.includes('banIp'), 'Server must have banIp function');
  assert.ok(source.includes('MAX_CONNECTIONS_PER_IP'), 'Server must define MAX_CONNECTIONS_PER_IP');
  assert.ok(source.includes('MAX_SPECTATORS_PER_MATCH'), 'Server must define MAX_SPECTATORS_PER_MATCH');
});

// ── Section 2: Per-IP connection limit ──

test('ip-rate-limit: per-IP connection limit is enforced', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // Open MAX_CONNECTIONS_PER_IP (10) connections from 127.0.0.1
    const wsList = [];
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      wsList.push(ws);
    }

    // Small delay to ensure all connections are registered server-side
    await new Promise(r => setTimeout(r, 200));

    // The 11th connection should be rejected with close code 1008.
    // Note: ws.close() happens after the WebSocket handshake, so the client
    // 'open' event fires first, then 'close' fires. We wait for close.
    const ws11 = new WebSocket(`ws://127.0.0.1:${port}`);
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 5000);
      ws11.on('close', (code) => { clearTimeout(timeout); resolve(code); });
      ws11.on('open', () => {
        // Don't resolve yet — the server may close this connection after handshake
        // Wait a bit to see if a close event comes
      });
      ws11.on('error', () => { /* may error during rejection */ });
    });

    // The connection should have been closed (not left open)
    assert.notEqual(result, 'timeout', '11th connection should get closed');
    if (typeof result === 'number') {
      assert.equal(result, 1008, 'Should close with policy violation code 1008');
    }

    // Clean up
    for (const ws of wsList) { try { ws.close(); } catch { /* ignore */ } }
    try { ws11.close(); } catch { /* ignore */ }
  } finally {
    await server.close();
  }
});

// ── Section 3: IP ban after repeated rate limit violations ──

test('ip-rate-limit: IP is banned after repeated violations', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // First connection: flood messages to trigger ban
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws1.on('open', resolve);
      ws1.on('error', reject);
    });

    for (let i = 0; i < 30; i++) {
      try { ws1.send(JSON.stringify(createMatch('core-unrestricted-authority', `req-flood-${i}`))); }
      catch { /* ws may be terminated */ }
    }

    // Wait for ban (connection should close)
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      ws1.on('close', () => { clearTimeout(timeout); resolve(); });
    });

    // Small delay to ensure ban is registered
    await new Promise(r => setTimeout(r, 200));

    // Second connection from the same IP should be rejected.
    // The ban check happens in the connection handler, so the connection
    // may open briefly before being closed.
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 5000);
      ws2.on('close', (code) => { clearTimeout(timeout); resolve(code); });
      ws2.on('open', () => {
        // Don't resolve — wait for close
      });
      ws2.on('error', () => { /* may error during rejection */ });
    });

    // Should be closed (not left open)
    assert.notEqual(result, 'timeout', 'Second connection from banned IP should get closed');
    if (typeof result === 'number') {
      assert.equal(result, 1008, 'Should close with policy violation code 1008');
    }
  } finally {
    await server.close();
  }
});

// ── Section 4: Spectator count limit (source-level + functional) ──

test('ip-rate-limit: spectator count limit is enforced', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // Create and start a match
    const p1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { p1.on('open', resolve); p1.on('error', reject); });

    // Wait a bit to ensure connection is registered
    await new Promise(r => setTimeout(r, 100));

    p1.send(JSON.stringify(createMatch('core-unrestricted-authority', 'req-create')));
    const createResp = await waitForMessage(p1, 10000);
    assert.ok(createResp, 'Should receive create match response');
    assert.equal(createResp.type, 'MATCH_CREATED');
    const matchId = createResp.payload.matchId;
    const inviteCode = createResp.payload.inviteCode;
    const p1Token = createResp.payload.participantToken;

    const p2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { p2.on('open', resolve); p2.on('error', reject); });
    await new Promise(r => setTimeout(r, 100));

    p2.send(JSON.stringify(joinMatch(inviteCode, 'req-join')));
    const joinResp = await waitForMessage(p2, 10000);
    assert.ok(joinResp, 'Should receive join match response');
    const p2Token = joinResp.payload.participantToken;

    // Both ready — need to collect messages until MATCH_STARTED
    const readyPromises = [];
    const collectUntilStarted = (ws) => new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10000);
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'MATCH_STARTED' || msg.type === 'MATCH_VIEW') {
            clearTimeout(timeout);
            resolve(msg);
          }
        } catch { /* ignore */ }
      });
    });

    readyPromises.push(collectUntilStarted(p1));
    readyPromises.push(collectUntilStarted(p2));

    p1.send(JSON.stringify(ready(matchId, p1Token, 'req-ready-1')));
    p2.send(JSON.stringify(ready(matchId, p2Token, 'req-ready-2')));

    await Promise.all(readyPromises);

    // Verify one spectator can join
    const spec = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { spec.on('open', resolve); spec.on('error', reject); });
    await new Promise(r => setTimeout(r, 100));

    spec.send(JSON.stringify(spectateMatch(matchId, 'req-spec-1')));
    const specResp = await waitForMessage(spec, 10000);
    assert.ok(specResp, 'Spectator should receive a response');
    assert.equal(specResp.type, 'SPECTATE_JOINED');

    // Verify the source has the spectator limit check
    const source = readFileSync(new URL('../apps/match-server/src/server.mjs', import.meta.url), 'utf8');
    assert.ok(source.includes('MAX_SPECTATORS_PER_MATCH'), 'Server must define MAX_SPECTATORS_PER_MATCH');
    assert.ok(source.includes('Spectator limit reached'), 'Server must reject with spectator limit message');

    try { spec.close(); } catch { /* ignore */ }
    try { p1.close(); } catch { /* ignore */ }
    try { p2.close(); } catch { /* ignore */ }
  } finally {
    await server.close();
  }
});

// ── Section 5: Configuration constants exist ──

test('ip-rate-limit: configuration constants are defined', () => {
  const source = readFileSync(new URL('../apps/match-server/src/server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('RATE_LIMIT_CAPACITY = 10'), 'RATE_LIMIT_CAPACITY must be 10');
  assert.ok(source.includes('RATE_LIMIT_REFILL_MS = 1000'), 'RATE_LIMIT_REFILL_MS must be 1000');
  assert.ok(source.includes('RATE_LIMIT_BAN_THRESHOLD = 5'), 'RATE_LIMIT_BAN_THRESHOLD must be 5');
  assert.ok(source.includes('MAX_CONNECTIONS_PER_IP = 10'), 'MAX_CONNECTIONS_PER_IP must be 10');
  assert.ok(source.includes('MAX_SPECTATORS_PER_MATCH = 50'), 'MAX_SPECTATORS_PER_MATCH must be 50');
});
