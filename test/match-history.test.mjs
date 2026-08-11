// ═══════════════════════════════════════════════════════════════
// match-history.test.mjs — Match history endpoint tests
//
// Proves:
//   - MATCH_HISTORY protocol message is valid
//   - MATCH_HISTORY_RESULT message structure is correct
//   - Server returns match history via WebSocket
//   - InMemoryMatchStore.listMatches returns correct results
//   - SqliteMatchStore.listMatches returns correct results
//   - Filtering by status works
//   - Limit parameter works
//   - Lobby UI no longer renders a Match History button (removed — redundant with homepage overlay)
//   - Protocol client matchHistory builder is correct
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { WebSocket } from 'ws';

import {
  matchHistory, matchHistoryResult,
  validateEnvelope, validateMatchHistory,
  createMatch,
  ReasonCode,
} from '../packages/network-protocol/src/protocol.mjs';

import { InMemoryMatchStore, SqliteMatchStore } from '../packages/match-authority/src/match-store.mjs';
import { AuthoritativeMatchSession } from '../packages/match-authority/src/authoritative-match-session.mjs';

function makeMatch() {
  return new AuthoritativeMatchSession({ matchId: `M-${randomInt(100000, 999999)}`, profileId: 'core-unrestricted-authority' });
}

import {
  renderNetworkLobby,
} from '../apps/lab-web/src/play/network/network-lobby-renderer.mjs';

import {
  matchHistory as clientMatchHistory,
} from '../apps/lab-web/src/play/network/network-protocol-client.mjs';

function randomPort() { return 5500 + randomInt(0, 999); }

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

// ── Section 1: Protocol validation ──

test('match-history: MATCH_HISTORY valid message accepted', () => {
  const msg = matchHistory(20, null, 'req-1');
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateMatchHistory(msg.payload);
  assert.ok(payloadCheck.valid);
});

test('match-history: MATCH_HISTORY with status filter accepted', () => {
  const msg = matchHistory(10, 'RUNNING', 'req-2');
  const payloadCheck = validateMatchHistory(msg.payload);
  assert.ok(payloadCheck.valid);
});

test('match-history: MATCH_HISTORY with invalid limit rejected', () => {
  const msg = matchHistory(0, null, 'req-3');
  const payloadCheck = validateMatchHistory(msg.payload);
  assert.equal(payloadCheck.valid, false);
});

test('match-history: MATCH_HISTORY with limit > 100 rejected', () => {
  const msg = matchHistory(101, null, 'req-4');
  const payloadCheck = validateMatchHistory(msg.payload);
  assert.equal(payloadCheck.valid, false);
});

test('match-history: MATCH_HISTORY_RESULT is a known type', () => {
  const msg = matchHistoryResult([], 'req-5');
  assert.ok(validateEnvelope(msg).valid, 'MATCH_HISTORY_RESULT must be a known type');
});

test('match-history: MATCH_HISTORY is a known type', () => {
  const msg = matchHistory(20, null);
  assert.ok(validateEnvelope(msg).valid, 'MATCH_HISTORY must be a known type');
});

// ── Section 2: Message structure ──

test('match-history: MATCH_HISTORY_RESULT has correct structure', () => {
  const matches = [{ matchId: 'M-test', status: 'RUNNING', createdAt: 0, updatedAt: 0, participants: [] }];
  const msg = matchHistoryResult(matches, 'req-6');
  assert.equal(msg.type, 'MATCH_HISTORY_RESULT');
  assert.ok(Array.isArray(msg.payload.matches));
  assert.equal(msg.payload.matches.length, 1);
  assert.equal(msg.payload.matches[0].matchId, 'M-test');
});

// ── Section 3: InMemoryMatchStore.listMatches ──

test('match-history: InMemoryMatchStore.listMatches returns empty for no matches', () => {
  const store = new InMemoryMatchStore();
  const result = store.listMatches();
  assert.equal(result.length, 0);
  store.close();
});

test('match-history: InMemoryMatchStore.listMatches returns match summaries', () => {
  const store = new InMemoryMatchStore();
  const match = makeMatch();
  store.save(match);
  const result = store.listMatches();
  assert.equal(result.length, 1);
  assert.equal(result[0].matchId, match.matchId);
  assert.equal(result[0].status, match.status);
  store.close();
});

test('match-history: InMemoryMatchStore.listMatches filters by status', () => {
  const store = new InMemoryMatchStore();
  const match1 = makeMatch();
  const match2 = makeMatch();
  store.save(match1);
  store.save(match2);
  // Both are WAITING_FOR_OPPONENT status by default
  const waitingMatches = store.listMatches({ status: 'WAITING_FOR_OPPONENT' });
  assert.equal(waitingMatches.length, 2);
  const runningMatches = store.listMatches({ status: 'RUNNING' });
  assert.equal(runningMatches.length, 0);
  store.close();
});

test('match-history: InMemoryMatchStore.listMatches respects limit', () => {
  const store = new InMemoryMatchStore();
  for (let i = 0; i < 5; i++) {
    store.save(makeMatch());
  }
  const result = store.listMatches({ limit: 3 });
  assert.equal(result.length, 3);
  store.close();
});

// ── Section 4: SqliteMatchStore.listMatches ──

test('match-history: SqliteMatchStore.listMatches returns match summaries', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const match = makeMatch();
  store.save(match);
  const result = store.listMatches();
  assert.equal(result.length, 1);
  assert.equal(result[0].matchId, match.matchId);
  assert.equal(result[0].status, match.status);
  store.close();
});

test('match-history: SqliteMatchStore.listMatches filters by status', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  store.save(makeMatch());
  const waitingMatches = store.listMatches({ status: 'WAITING_FOR_OPPONENT' });
  assert.equal(waitingMatches.length, 1);
  const runningMatches = store.listMatches({ status: 'RUNNING' });
  assert.equal(runningMatches.length, 0);
  store.close();
});

test('match-history: SqliteMatchStore.listMatches respects limit', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  for (let i = 0; i < 5; i++) {
    store.save(makeMatch());
  }
  const result = store.listMatches({ limit: 3 });
  assert.equal(result.length, 3);
  store.close();
});

// ── Section 5: Server integration ──

test('match-history: server returns match history via WebSocket', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:', publicHistory: true });

  try {
    // Create a match first
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws1.on('open', resolve); ws1.on('error', reject); });
    ws1.send(JSON.stringify(createMatch('core-unrestricted-authority', 'req-create')));
    await waitForMessage(ws1); // MATCH_CREATED

    // Now query match history
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws2.on('open', resolve); ws2.on('error', reject); });
    ws2.send(JSON.stringify(matchHistory(20, null, 'req-history')));
    const resp = await waitForMessage(ws2);

    assert.ok(resp, 'Should receive a response');
    assert.equal(resp.type, 'MATCH_HISTORY_RESULT');
    assert.ok(Array.isArray(resp.payload.matches));
    assert.ok(resp.payload.matches.length >= 1, 'Should have at least 1 match');

    try { ws1.close(); } catch { /* ignore */ }
    try { ws2.close(); } catch { /* ignore */ }
  } finally {
    await server.close();
  }
});

test('match-history: server returns empty list when no matches', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({ port, host: '127.0.0.1', dbPath: ':memory:', publicHistory: true });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    ws.send(JSON.stringify(matchHistory(20, null, 'req-history-2')));
    const resp = await waitForMessage(ws);

    assert.ok(resp, 'Should receive a response');
    assert.equal(resp.type, 'MATCH_HISTORY_RESULT');
    assert.equal(resp.payload.matches.length, 0);

    try { ws.close(); } catch { /* ignore */ }
  } finally {
    await server.close();
  }
});

// ── Section 6: Lobby UI (Match History card removed — redundant with homepage overlay) ──

test('match-history: lobby hub does NOT include Match History button', () => {
  const html = renderNetworkLobby({ serverUrl: 'ws://localhost:3099' });
  assert.ok(!html.includes('data-action="network-history"'), 'Lobby must NOT have Match History button');
  assert.ok(!html.includes('data-testid="network-history"'), 'Lobby must NOT have Match History testid');
  assert.ok(!html.includes('Match History'), 'Lobby must NOT have Match History visible text');
});

test('match-history: lobby hub has 4 cards (create, join, queue, spectate)', () => {
  const html = renderNetworkLobby({ serverUrl: 'ws://localhost:3099' });
  const cards = html.match(/class="play-hub-card network-lobby-card[^"]*"/g) || [];
  assert.equal(cards.length, 4, 'Lobby must have 4 cards');
});

// ── Section 7: Protocol client builder ──

test('match-history: client matchHistory builder is correct', () => {
  const msg = clientMatchHistory(20, null);
  assert.equal(msg.type, 'MATCH_HISTORY');
  assert.equal(msg.payload.limit, 20);
  assert.equal(msg.payload.status, null);
  assert.ok(msg.requestId, 'Must have a request ID');
});

test('match-history: client matchHistory with status filter', () => {
  const msg = clientMatchHistory(10, 'RUNNING');
  assert.equal(msg.payload.limit, 10);
  assert.equal(msg.payload.status, 'RUNNING');
});

// ── Section 8: Server source has handler ──

test('match-history: server source has match history handler', () => {
  const source = readFileSync(new URL('../apps/match-server/src/server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('handleMatchHistory'), 'Server must have handleMatchHistory function');
  assert.ok(source.includes('MATCH_HISTORY'), 'Server must handle MATCH_HISTORY message type');
  assert.ok(source.includes('matchHistoryResult'), 'Server must send MATCH_HISTORY_RESULT');
});
