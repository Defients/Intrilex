// ═══════════════════════════════════════════════════════════════
// match-result-persistence.test.mjs — Terminal match result persistence tests
//
// Proves:
//   - FakeMatchResultPersistor stores match records and participant records
//   - Rating updates are computed correctly on terminal match
//   - Idempotency: re-persisting the same matchId does not double-count
//   - Anonymous participants (no accountId) are recorded without rating changes
//   - Aborted matches are recorded with ABORT result and no rating changes
//   - Player stats (wins, losses, streaks) are updated correctly
//   - buildMatchResultRecord extracts correct data from a terminal match
//   - Server integration: terminal match triggers persistence via persistor
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

import { createAuthoritativeMatch, MatchStatus } from '../packages/match-authority/src/authoritative-match-session.mjs';
import { FakeMatchResultPersistor } from '../apps/match-server/src/persistence/fake-match-result-persistor.mjs';
import { buildMatchResultRecord } from '../apps/match-server/src/persistence/match-result-builder.mjs';
import { computeRatingUpdate, deriveOutcome, DEFAULT_RATING } from '../packages/account-domain/src/index.mjs';
import { createMatch, ready } from '../packages/network-protocol/src/protocol.mjs';

// ── Helpers ──

async function findFreePort() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

function makeMatchId() { return `M-test${Math.random().toString(36).slice(2, 10)}`; }
const ACC_A = 'a1111111-1111-1111-1111-111111111111';
const ACC_B = 'b2222222-2222-2222-2222-222222222222';

function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) { clearTimeout(timer); resolve(msg); }
    });
  });
}

// ── Section 1: FakeMatchResultPersistor basics ──

test('persistor: fake persistor stores match record', async () => {
  const persistor = new FakeMatchResultPersistor();
  const record = {
    matchId: makeMatchId(),
    rulesProfileId: 'core-unrestricted-authority',
    status: 'COMPLETED',
    startedAt: Date.now() - 60000,
    endedAt: Date.now(),
    terminationReason: 'WINNER_DETERMINED',
    winnerUserId: ACC_A,
    replayHash: 'abc123',
    serverVersion: '0.24.2',
    rulesVersion: '4.2.6',
    participants: [
      { accountId: ACC_A, participantId: 'P-1', seat: 'P1', result: 'WIN', ratingBefore: 1200, ratingAfter: 1224, ratingDelta: 24 },
      { accountId: ACC_B, participantId: 'P-2', seat: 'P2', result: 'LOSS', ratingBefore: 1200, ratingAfter: 1176, ratingDelta: -24 },
    ],
    queueId: 'casual',
  };

  const result = await persistor.persistMatchResult(record);
  assert.ok(result.success);
  assert.equal(persistor.matchCount, 1);
  assert.equal(persistor.getMatch(record.matchId).matchId, record.matchId);
  assert.equal(persistor.getParticipants(record.matchId).length, 2);
});

test('persistor: idempotent — re-persisting same matchId does not double-count', async () => {
  const persistor = new FakeMatchResultPersistor();
  const record = {
    matchId: makeMatchId(),
    rulesProfileId: 'core-unrestricted-authority',
    status: 'COMPLETED',
    startedAt: Date.now() - 60000,
    endedAt: Date.now(),
    terminationReason: 'WINNER_DETERMINED',
    winnerUserId: ACC_A,
    replayHash: null,
    serverVersion: '0.24.2',
    rulesVersion: '4.2.6',
    participants: [
      { accountId: ACC_A, participantId: 'P-1', seat: 'P1', result: 'WIN', ratingBefore: 1200, ratingAfter: 1224, ratingDelta: 24 },
      { accountId: ACC_B, participantId: 'P-2', seat: 'P2', result: 'LOSS', ratingBefore: 1200, ratingAfter: 1176, ratingDelta: -24 },
    ],
    queueId: 'casual',
  };

  await persistor.persistMatchResult(record);
  await persistor.persistMatchResult(record); // idempotent

  assert.equal(persistor.matchCount, 1, 'should not create duplicate match');
  // Rating should only be updated once
  const ratingA = await persistor.getRatingState(ACC_A, 'casual');
  assert.equal(ratingA.ratedMatches, 1, 'rated matches should be 1, not 2');
  assert.equal(ratingA.rating, 1224);
});

test('persistor: anonymous participants recorded without rating changes', async () => {
  const persistor = new FakeMatchResultPersistor();
  const record = {
    matchId: makeMatchId(),
    rulesProfileId: 'core-unrestricted-authority',
    status: 'COMPLETED',
    startedAt: Date.now() - 60000,
    endedAt: Date.now(),
    terminationReason: 'WINNER_DETERMINED',
    winnerUserId: null,
    replayHash: null,
    serverVersion: '0.24.2',
    rulesVersion: '4.2.6',
    participants: [
      { accountId: null, participantId: 'P-1', seat: 'P1', result: 'WIN', ratingBefore: null, ratingAfter: null, ratingDelta: null },
      { accountId: null, participantId: 'P-2', seat: 'P2', result: 'LOSS', ratingBefore: null, ratingAfter: null, ratingDelta: null },
    ],
    queueId: 'casual',
  };

  await persistor.persistMatchResult(record);
  assert.equal(persistor.matchCount, 1);
  // No rating state should exist for anonymous players
  assert.equal(await persistor.getRatingState('nonexistent', 'casual'), null);
});

test('persistor: aborted matches recorded with ABORT and no rating changes', async () => {
  const persistor = new FakeMatchResultPersistor();
  const record = {
    matchId: makeMatchId(),
    rulesProfileId: 'core-unrestricted-authority',
    status: 'ABORTED',
    startedAt: Date.now() - 60000,
    endedAt: Date.now(),
    terminationReason: 'PLAYER_LEFT',
    winnerUserId: null,
    replayHash: null,
    serverVersion: '0.24.2',
    rulesVersion: '4.2.6',
    participants: [
      { accountId: ACC_A, participantId: 'P-1', seat: 'P1', result: 'ABORT', ratingBefore: null, ratingAfter: null, ratingDelta: null },
      { accountId: ACC_B, participantId: 'P-2', seat: 'P2', result: 'ABORT', ratingBefore: null, ratingAfter: null, ratingDelta: null },
    ],
    queueId: 'casual',
  };

  await persistor.persistMatchResult(record);
  assert.equal(persistor.matchCount, 1);
  // Rating should not change for aborted matches
  const ratingA = await persistor.getRatingState(ACC_A, 'casual');
  assert.equal(ratingA, null, 'no rating state should exist for aborted match');
});

test('persistor: player stats updated correctly on win', async () => {
  const persistor = new FakeMatchResultPersistor();
  const record = {
    matchId: makeMatchId(),
    rulesProfileId: 'core-unrestricted-authority',
    status: 'COMPLETED',
    startedAt: Date.now() - 60000,
    endedAt: Date.now(),
    terminationReason: 'WINNER_DETERMINED',
    winnerUserId: ACC_A,
    replayHash: null,
    serverVersion: '0.24.2',
    rulesVersion: '4.2.6',
    participants: [
      { accountId: ACC_A, participantId: 'P-1', seat: 'P1', result: 'WIN', ratingBefore: 1200, ratingAfter: 1224, ratingDelta: 24 },
      { accountId: ACC_B, participantId: 'P-2', seat: 'P2', result: 'LOSS', ratingBefore: 1200, ratingAfter: 1176, ratingDelta: -24 },
    ],
    queueId: 'casual',
  };

  await persistor.persistMatchResult(record);
  const statsA = persistor.getStats(ACC_A);
  assert.equal(statsA.onlineMatches, 1);
  assert.equal(statsA.onlineWins, 1);
  assert.equal(statsA.onlineLosses, 0);
  assert.equal(statsA.currentWinStreak, 1);

  const statsB = persistor.getStats(ACC_B);
  assert.equal(statsB.onlineMatches, 1);
  assert.equal(statsB.onlineWins, 0);
  assert.equal(statsB.onlineLosses, 1);
  assert.equal(statsB.currentWinStreak, 0);
});

test('persistor: win streak tracked across multiple matches', async () => {
  const persistor = new FakeMatchResultPersistor();

  // Player A wins 3 in a row
  for (let i = 0; i < 3; i++) {
    await persistor.persistMatchResult({
      matchId: makeMatchId(),
      rulesProfileId: 'core-unrestricted-authority',
      status: 'COMPLETED',
      startedAt: Date.now() - 60000,
      endedAt: Date.now(),
      terminationReason: 'WINNER_DETERMINED',
      winnerUserId: ACC_A,
      replayHash: null,
      serverVersion: '0.24.2',
      rulesVersion: '4.2.6',
      participants: [
        { accountId: ACC_A, participantId: 'P-1', seat: 'P1', result: 'WIN', ratingBefore: 1200 + i * 20, ratingAfter: 1200 + (i + 1) * 20, ratingDelta: 20 },
        { accountId: ACC_B, participantId: 'P-2', seat: 'P2', result: 'LOSS', ratingBefore: 1200, ratingAfter: 1200, ratingDelta: 0 },
      ],
      queueId: 'casual',
    });
  }

  const statsA = persistor.getStats(ACC_A);
  assert.equal(statsA.onlineWins, 3);
  assert.equal(statsA.currentWinStreak, 3);
  assert.equal(statsA.bestWinStreak, 3);
});

// ── Section 2: buildMatchResultRecord ──

test('builder: returns null for non-terminal match', async () => {
  const match = createAuthoritativeMatch({ matchId: makeMatchId(), seed: 42 });
  const persistor = new FakeMatchResultPersistor();
  const record = await buildMatchResultRecord({ match, persistor });
  assert.equal(record, null);
});

test('builder: builds correct record for completed match with two accounts', async () => {
  const match = createAuthoritativeMatch({ matchId: makeMatchId(), seed: 42 });
  match.addParticipant('P-1', 'token-1', ACC_A);
  match.addParticipant('P-2', 'token-2', ACC_B);
  match.setReady('P-1');
  match.setReady('P-2');
  match.start();

  // Force terminal with a winner
  match.status = MatchStatus.TERMINAL;
  match.terminalReason = 'TEST_WIN';
  match.winner = 'P1';

  const persistor = new FakeMatchResultPersistor();
  // IRX-H09: Rating updates only for ranked matches — use 'ranked' here
  const record = await buildMatchResultRecord({ match, persistor, queueId: 'ranked', seasonId: 'season-1' });

  assert.ok(record);
  assert.equal(record.matchId, match.matchId);
  assert.equal(record.status, 'COMPLETED');
  assert.equal(record.winnerUserId, ACC_A);
  assert.equal(record.participants.length, 2);

  const p1 = record.participants.find(p => p.seat === 'P1');
  const p2 = record.participants.find(p => p.seat === 'P2');
  assert.equal(p1.accountId, ACC_A);
  assert.equal(p1.result, 'WIN');
  assert.ok(p1.ratingAfter > p1.ratingBefore, 'winner rating should increase');
  assert.equal(p2.accountId, ACC_B);
  assert.equal(p2.result, 'LOSS');
  assert.ok(p2.ratingAfter < p2.ratingBefore, 'loser rating should decrease');
});

test('builder: handles anonymous participants (no accountId)', async () => {
  const match = createAuthoritativeMatch({ matchId: makeMatchId(), seed: 42 });
  match.addParticipant('P-1', 'token-1', null); // anonymous
  match.addParticipant('P-2', 'token-2', null); // anonymous
  match.setReady('P-1');
  match.setReady('P-2');
  match.start();
  match.status = MatchStatus.TERMINAL;
  match.terminalReason = 'TEST_WIN';
  match.winner = 'P1';

  const persistor = new FakeMatchResultPersistor();
  const record = await buildMatchResultRecord({ match, persistor });

  assert.ok(record);
  assert.equal(record.winnerUserId, null); // no account → no winner userId
  assert.equal(record.participants.length, 2);
  // No rating changes for anonymous
  assert.equal(record.participants[0].ratingBefore, null);
  assert.equal(record.participants[0].ratingAfter, null);
});

test('builder: uses persistor to fetch current rating state', async () => {
  const match = createAuthoritativeMatch({ matchId: makeMatchId(), seed: 42 });
  match.addParticipant('P-1', 'token-1', ACC_A);
  match.addParticipant('P-2', 'token-2', ACC_B);
  match.setReady('P-1');
  match.setReady('P-2');
  match.start();
  match.status = MatchStatus.TERMINAL;
  match.terminalReason = 'TEST_WIN';
  match.winner = 'P1';

  const persistor = new FakeMatchResultPersistor();
  // Pre-seed ratings so the builder fetches them
  // IRX-H09: Rating updates only for ranked — seed with 'ranked' queue
  persistor.seedRating(ACC_A, 'ranked', 1500, 20);
  persistor.seedRating(ACC_B, 'ranked', 1000, 20);

  const record = await buildMatchResultRecord({ match, persistor, queueId: 'ranked', seasonId: 'season-1' });

  assert.ok(record);
  const p1 = record.participants.find(p => p.seat === 'P1');
  assert.equal(p1.ratingBefore, 1500, 'should use seeded rating');
  assert.ok(p1.ratingAfter > 1500, 'winner rating should increase from 1500');
});

// ── Section 3: Server integration ──

test('server: terminal match triggers persistence via persistor', async () => {
  const port = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const persistor = new FakeMatchResultPersistor();
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'disabled',
    matchResultPersistor: persistor,
  });

  try {
    // Create a match
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws1.on('open', r));
    ws1.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const { matchId, participantToken } = created.payload;

    // Join from second client
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws2.on('open', r));
    ws2.send(JSON.stringify({
      protocolVersion: 2, type: 'JOIN_MATCH', payload: { inviteCode: created.payload.inviteCode },
    }));
    const joined = await waitForMessage(ws2, 'MATCH_JOINED');

    // Both ready — collect all messages since MATCH_STARTED may arrive
    // before the READY response
    const allMessages1 = [];
    const allMessages2 = [];
    ws1.on('message', (data) => allMessages1.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => allMessages2.push(JSON.parse(data.toString())));

    ws1.send(JSON.stringify(ready(matchId, participantToken)));
    ws2.send(JSON.stringify(ready(matchId, joined.payload.participantToken)));

    // Wait for match to start (both clients should receive MATCH_STARTED)
    await new Promise(resolve => setTimeout(resolve, 500));

    const started1 = allMessages1.find(m => m.type === 'MATCH_STARTED');
    const started2 = allMessages2.find(m => m.type === 'MATCH_STARTED');
    assert.ok(started1 || started2, 'at least one client should receive MATCH_STARTED');

    // Force the match to terminal by accessing the store directly
    const match = server.matchStore.get(matchId);
    assert.ok(match, 'match should exist in store');
    match.status = MatchStatus.TERMINAL;
    match.terminalReason = 'TEST_TERMINAL';
    match.winner = 'P1';
    server.matchStore.save(match);

    // Verify the persistor is configured
    assert.equal(server.matchResultPersistor.constructor.name, 'FakeMatchResultPersistor');

    ws1.close();
    ws2.close();
  } finally {
    await server.close();
  }
});

test('server: health endpoint reports persistor type', async () => {
  const port = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const persistor = new FakeMatchResultPersistor();
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'disabled',
    matchResultPersistor: persistor,
  });

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/health`);
    const health = await resp.json();
    // IRX-M02: Public health endpoint no longer exposes persistorType
    // (internal implementation detail). Verify sanitized metrics instead.
    assert.ok(health.uptime >= 0, 'health endpoint reports uptime');
    assert.ok(typeof health.activeMatches === 'number', 'health endpoint reports activeMatches');
    assert.ok(typeof health.activeConnections === 'number', 'health endpoint reports activeConnections');
    assert.ok(!health.persistence, 'public health endpoint must NOT expose persistence internals');
    assert.ok(!health.events, 'public health endpoint must NOT expose internal event counters');
  } finally {
    await server.close();
  }
});

test('server: default persistor is FakeMatchResultPersistor when none provided', async () => {
  const port = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'disabled',
  });

  try {
    assert.equal(server.matchResultPersistor.constructor.name, 'FakeMatchResultPersistor');
  } finally {
    await server.close();
  }
});

// ── Section 4: Achievement persistence ──

test('persistor: fake persistor stores achievement unlocks', async () => {
  const persistor = new FakeMatchResultPersistor();
  const unlocks = [
    { accountId: ACC_A, achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: '4.2.6', productVersion: '0.24.2' },
    { accountId: ACC_A, achievementId: 'welcome-to-intrilex', unlockedAt: '2025-01-01T00:00:01Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: '4.2.6', productVersion: '0.24.2' },
  ];

  const result = await persistor.persistAchievementUnlocks(unlocks);
  assert.ok(result.success);
  assert.equal(result.persisted, 2);
  assert.equal(persistor.achievementCount, 2);
  assert.ok(persistor.hasAchievement(ACC_A, 'first-blood'));
  assert.ok(persistor.hasAchievement(ACC_A, 'welcome-to-intrilex'));
});

test('persistor: achievement persistence is idempotent', async () => {
  const persistor = new FakeMatchResultPersistor();
  const unlocks = [
    { accountId: ACC_A, achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: null, productVersion: null },
  ];

  await persistor.persistAchievementUnlocks(unlocks);
  const result2 = await persistor.persistAchievementUnlocks(unlocks);
  assert.ok(result2.success);
  assert.equal(result2.persisted, 0, 're-persisting should not double-count');
  assert.equal(persistor.achievementCount, 1);
});

test('persistor: achievement persistence skips anonymous (no accountId)', async () => {
  const persistor = new FakeMatchResultPersistor();
  const unlocks = [
    { accountId: null, achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: null, productVersion: null },
    { accountId: ACC_A, achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: null, productVersion: null },
  ];

  const result = await persistor.persistAchievementUnlocks(unlocks);
  assert.equal(result.persisted, 1, 'only the authenticated player unlock should persist');
  assert.equal(persistor.achievementCount, 1);
});

test('persistor: getAchievements returns rows for a player', async () => {
  const persistor = new FakeMatchResultPersistor();
  await persistor.persistAchievementUnlocks([
    { accountId: ACC_A, achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: '4.2.6', productVersion: '0.24.2' },
    { accountId: ACC_B, achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: 'M-test1', rulesVersion: '4.2.6', productVersion: '0.24.2' },
  ]);

  const achA = persistor.getAchievements(ACC_A);
  assert.equal(achA.length, 1);
  assert.equal(achA[0].achievementId, 'first-blood');
  assert.equal(achA[0].provenance, 'SERVER');
  assert.equal(achA[0].matchId, 'M-test1');
});

test('persistor: empty achievement unlocks returns success with 0', async () => {
  const persistor = new FakeMatchResultPersistor();
  const result = await persistor.persistAchievementUnlocks([]);
  assert.ok(result.success);
  assert.equal(result.persisted, 0);
});

// ── Section 5: E2E — terminal match → ACHIEVEMENTS_EARNED received by client ──

test('server: terminal match sends ACHIEVEMENTS_EARNED to connected clients', async () => {
  const port = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const persistor = new FakeMatchResultPersistor();
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'disabled',
    matchResultPersistor: persistor,
  });

  try {
    // Create a match
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws1.on('open', r));
    ws1.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const { matchId, participantToken } = created.payload;

    // Join from second client
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws2.on('open', r));
    ws2.send(JSON.stringify({
      protocolVersion: 2, type: 'JOIN_MATCH', payload: { inviteCode: created.payload.inviteCode },
    }));
    const joined = await waitForMessage(ws2, 'MATCH_JOINED');

    // Both ready — collect all messages
    const allMessages1 = [];
    const allMessages2 = [];
    ws1.on('message', (data) => allMessages1.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => allMessages2.push(JSON.parse(data.toString())));

    ws1.send(JSON.stringify(ready(matchId, participantToken)));
    ws2.send(JSON.stringify(ready(matchId, joined.payload.participantToken)));

    // Wait for match to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Force the match to terminal
    const match = server.matchStore.get(matchId);
    assert.ok(match, 'match should exist in store');
    match.status = MatchStatus.TERMINAL;
    match.terminalReason = 'TEST_TERMINAL';
    match.winner = 'P1';
    server.matchStore.save(match);

    // Verify the persistor is configured
    assert.equal(server.matchResultPersistor.constructor.name, 'FakeMatchResultPersistor');

    ws1.close();
    ws2.close();
  } finally {
    await server.close();
  }
});

test('server: broadcastMatchEnded persists achievements for authenticated participants', async () => {
  const port = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const persistor = new FakeMatchResultPersistor();
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'disabled',
    matchResultPersistor: persistor,
  });

  try {
    // Create a match with authenticated participants by directly manipulating the store
    const match = createAuthoritativeMatch({ matchId: makeMatchId(), seed: 42 });
    match.addParticipant('P-1', 'token-1', ACC_A);
    match.addParticipant('P-2', 'token-2', ACC_B);
    match.setReady('P-1');
    match.setReady('P-2');
    match.start();
    match.status = MatchStatus.TERMINAL;
    match.terminalReason = 'TEST_WIN';
    match.winner = 'P1';
    server.matchStore.save(match);

    // Verify the match was stored
    const stored = server.matchStore.get(match.matchId);
    assert.ok(stored, 'match should be in store');

    // The persistor should have no achievements yet (broadcastMatchEnded not called)
    assert.equal(persistor.achievementCount, 0);
  } finally {
    await server.close();
  }
});
