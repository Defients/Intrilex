// ═══════════════════════════════════════════════════════════════
// forensic-phase1-remediation.test.mjs
//
// Tests for Phase 1 forensic remediation fixes:
//   IRX-H07: Missing active season no longer fabricates 'season-1'
//   IRX-H09: Casual/private matches cannot mutate ratings
//   IRX-H10: Forfeit mechanism on disconnect timeout
//   IRX-H13: Terminal durability ordering (persist before broadcast)
//   IRX-H18: start() cannot overwrite TERMINAL/ABORTED state
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';

// ── IRX-H07 & IRX-H09: buildMatchResultRecord behavior ──

test('IRX-H07: buildMatchResultRecord does not fabricate season-1 for ranked', async () => {
  const { buildMatchResultRecord } = await import('../apps/match-server/src/persistence/match-result-builder.mjs');
  const { MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  // Create a mock terminal match
  const mockMatch = {
    status: MatchStatus.TERMINAL,
    matchId: 'M-test-h07',
    profileId: 'core-unrestricted-authority',
    queueId: 'ranked',
    seasonId: 'pending',
    terminalReason: 'NORMAL_VICTORY',
    winner: 'P1',
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    participants: new Map([
      ['P-1', { playerId: 'P1', accountId: 'acc-1', connectionState: 'CONNECTED' }],
      ['P-2', { playerId: 'P2', accountId: 'acc-2', connectionState: 'CONNECTED' }],
    ]),
    getReplay: () => null,
    getAuthoritativeState: () => ({}),
    getAllEvents: () => [],
  };

  // Mock persistor that fails to resolve season
  const mockPersistor = {
    resolveActiveSeasonId: async () => null,
    getRatingState: async () => null,
  };

  const record = await buildMatchResultRecord({
    match: mockMatch,
    persistor: mockPersistor,
    queueId: 'ranked',
    seasonId: undefined,
    serverVersion: '0.28.1',
  });

  // The record should have null seasonId, NOT 'season-1'
  assert.ok(record, 'record should be built');
  assert.equal(record.seasonId, null, 'seasonId must be null, not fabricated season-1');
  assert.notEqual(record.seasonId, 'season-1', 'must NOT fabricate season-1');
});

test('IRX-H07: buildMatchResultRecord returns null seasonId when resolveActiveSeasonId throws', async () => {
  const { buildMatchResultRecord } = await import('../apps/match-server/src/persistence/match-result-builder.mjs');
  const { MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const mockMatch = {
    status: MatchStatus.TERMINAL,
    matchId: 'M-test-h07b',
    profileId: 'core-unrestricted-authority',
    queueId: 'ranked',
    seasonId: 'pending',
    terminalReason: 'NORMAL_VICTORY',
    winner: 'P1',
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    participants: new Map([
      ['P-1', { playerId: 'P1', accountId: 'acc-1', connectionState: 'CONNECTED' }],
      ['P-2', { playerId: 'P2', accountId: 'acc-2', connectionState: 'CONNECTED' }],
    ]),
    getReplay: () => null,
    getAuthoritativeState: () => ({}),
    getAllEvents: () => [],
  };

  const mockPersistor = {
    resolveActiveSeasonId: async () => { throw new Error('DB unavailable'); },
    getRatingState: async () => null,
  };

  const record = await buildMatchResultRecord({
    match: mockMatch,
    persistor: mockPersistor,
    queueId: 'ranked',
    seasonId: undefined,
    serverVersion: '0.28.1',
  });

  assert.ok(record, 'record should still be built');
  assert.equal(record.seasonId, null, 'seasonId must be null when resolution throws');
});

test('IRX-H09: casual match does not compute rating updates', async () => {
  const { buildMatchResultRecord } = await import('../apps/match-server/src/persistence/match-result-builder.mjs');
  const { MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const mockMatch = {
    status: MatchStatus.TERMINAL,
    matchId: 'M-test-h09',
    profileId: 'core-unrestricted-authority',
    queueId: 'casual',
    seasonId: null,
    terminalReason: 'NORMAL_VICTORY',
    winner: 'P1',
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    participants: new Map([
      ['P-1', { playerId: 'P1', accountId: 'acc-1', connectionState: 'CONNECTED' }],
      ['P-2', { playerId: 'P2', accountId: 'acc-2', connectionState: 'CONNECTED' }],
    ]),
    getReplay: () => null,
    getAuthoritativeState: () => ({}),
    getAllEvents: () => [],
  };

  const mockPersistor = {
    resolveActiveSeasonId: async () => 'season-1',
    getRatingState: async () => ({ rating: 1500, ratingDeviation: 200, volatility: 0.06, ratedMatches: 0, provisional: true }),
  };

  const record = await buildMatchResultRecord({
    match: mockMatch,
    persistor: mockPersistor,
    queueId: 'casual',
    serverVersion: '0.28.1',
  });

  assert.ok(record, 'record should be built for casual match');
  assert.equal(record.queueId, 'casual');
  // Casual match participants should have WIN/LOSS results but NO rating changes
  for (const p of record.participants) {
    assert.ok(p.result === 'WIN' || p.result === 'LOSS' || p.result === 'DRAW',
      `casual participant result should be WIN/LOSS/DRAW, got ${p.result}`);
    assert.equal(p.ratingBefore, null, 'casual match must not have ratingBefore');
    assert.equal(p.ratingAfter, null, 'casual match must not have ratingAfter');
    assert.equal(p.ratingDelta, null, 'casual match must not have ratingDelta');
  }
});

test('IRX-H09: private match does not compute rating updates', async () => {
  const { buildMatchResultRecord } = await import('../apps/match-server/src/persistence/match-result-builder.mjs');
  const { MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const mockMatch = {
    status: MatchStatus.TERMINAL,
    matchId: 'M-test-h09b',
    profileId: 'core-unrestricted-authority',
    queueId: 'private',
    seasonId: null,
    terminalReason: 'NORMAL_VICTORY',
    winner: 'P1',
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    participants: new Map([
      ['P-1', { playerId: 'P1', accountId: 'acc-1', connectionState: 'CONNECTED' }],
      ['P-2', { playerId: 'P2', accountId: 'acc-2', connectionState: 'CONNECTED' }],
    ]),
    getReplay: () => null,
    getAuthoritativeState: () => ({}),
    getAllEvents: () => [],
  };

  const mockPersistor = {
    getRatingState: async () => ({ rating: 1500, ratingDeviation: 200, volatility: 0.06, ratedMatches: 0, provisional: true }),
  };

  const record = await buildMatchResultRecord({
    match: mockMatch,
    persistor: mockPersistor,
    queueId: 'private',
    serverVersion: '0.28.1',
  });

  assert.ok(record, 'record should be built for private match');
  for (const p of record.participants) {
    assert.equal(p.ratingBefore, null, 'private match must not have ratingBefore');
    assert.equal(p.ratingAfter, null, 'private match must not have ratingAfter');
  }
});

// ── IRX-H10: Forfeit mechanism ──

test('IRX-H10: forfeit() terminalizes match with remaining player as winner', async () => {
  const { AuthoritativeMatchSession, MatchStatus, ConnectionState } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const match = new AuthoritativeMatchSession({
    matchId: 'M-forfeit-test',
    profileId: 'core-unrestricted-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    queueId: 'ranked',
    seasonId: 'season-1',
  });

  // Add participants
  match.addParticipant('P-1', 'P1', 'token-1');
  match.addParticipant('P-2', 'P2', 'token-2');

  // Start the match
  match.setReady('P-1');
  match.setReady('P-2');
  match.start();
  assert.equal(match.status, MatchStatus.RUNNING, 'match must be running');

  // Disconnect P1
  match.disconnectParticipant('P-1');

  // Forfeit P1 — P2 should win
  const result = match.forfeit('P-1');
  assert.ok(result, 'forfeit should return true');
  assert.equal(match.status, MatchStatus.TERMINAL, 'match must be terminal after forfeit');
  assert.equal(match.terminalReason, 'FORFEIT', 'terminal reason must be FORFEIT');
  assert.equal(match.winner, 'P2', 'winner must be the remaining player (P2)');
});

test('IRX-H10: forfeit() on already-terminal match returns false', async () => {
  const { AuthoritativeMatchSession, MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const match = new AuthoritativeMatchSession({
    matchId: 'M-forfeit-test2',
    profileId: 'core-unrestricted-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
  });

  match.addParticipant('P-1', 'P1', 'token-1');
  match.addParticipant('P-2', 'P2', 'token-2');
  match.setReady('P-1');
  match.setReady('P-2');
  match.start();

  // Manually set to TERMINAL
  match.status = MatchStatus.TERMINAL;
  match.terminalReason = 'NORMAL_VICTORY';
  match.winner = 'P1';

  // Forfeit should not overwrite terminal state
  const result = match.forfeit('P-2');
  assert.equal(result, false, 'forfeit on terminal match should return false');
  assert.equal(match.terminalReason, 'NORMAL_VICTORY', 'terminal reason must not change');
  assert.equal(match.winner, 'P1', 'winner must not change');
});

test('IRX-H10: forfeit() on non-running match returns false', async () => {
  const { AuthoritativeMatchSession, MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const match = new AuthoritativeMatchSession({
    matchId: 'M-forfeit-test3',
    profileId: 'core-unrestricted-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
  });

  match.addParticipant('P-1', 'P1', 'token-1');
  match.addParticipant('P-2', 'P2', 'token-2');

  // Match is in READY_CHECK (not RUNNING)
  assert.equal(match.status, MatchStatus.READY_CHECK);

  const result = match.forfeit('P-1');
  assert.equal(result, false, 'forfeit on non-running match should return false');
  assert.notEqual(match.status, MatchStatus.TERMINAL, 'match must not be terminalized');
});

// ── IRX-H18: start() cannot overwrite terminal/aborted state ──

test('IRX-H18: start() throws on TERMINAL state', async () => {
  const { AuthoritativeMatchSession, MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const match = new AuthoritativeMatchSession({
    matchId: 'M-h18-terminal',
    profileId: 'core-unrestricted-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
  });

  match.addParticipant('P-1', 'P1', 'token-1');
  match.addParticipant('P-2', 'P2', 'token-2');
  match.setReady('P-1');
  match.setReady('P-2');
  match.start();

  // Set to TERMINAL
  match.status = MatchStatus.TERMINAL;
  match.terminalReason = 'NORMAL_VICTORY';
  match.winner = 'P1';

  // start() should throw — cannot overwrite terminal state
  assert.throws(() => match.start(), /Match not in READY_CHECK/, 'start() must throw on terminal match');
  assert.equal(match.status, MatchStatus.TERMINAL, 'status must remain TERMINAL');
});

test('IRX-H18: start() throws on ABORTED state', async () => {
  const { AuthoritativeMatchSession, MatchStatus } = await import('../packages/match-authority/src/authoritative-match-session.mjs');

  const match = new AuthoritativeMatchSession({
    matchId: 'M-h18-aborted',
    profileId: 'core-unrestricted-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
  });

  match.addParticipant('P-1', 'P1', 'token-1');
  match.addParticipant('P-2', 'P2', 'token-2');

  // Abort the match
  match.close();
  assert.equal(match.status, MatchStatus.ABORTED);

  // start() should throw — cannot overwrite aborted state
  assert.throws(() => match.start(), /Match not in READY_CHECK/, 'start() must throw on aborted match');
  assert.equal(match.status, MatchStatus.ABORTED, 'status must remain ABORTED');
});
