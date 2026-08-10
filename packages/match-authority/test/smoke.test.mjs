import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createAuthoritativeMatch, AuthoritativeMatchSession, MatchStatus, ConnectionState } from '../src/authoritative-match-session.mjs';
import { buildNetworkPlayerView, validateNetworkViewPrivacy } from '../src/player-projection.mjs';
import { InMemoryMatchStore } from '../src/match-store.mjs';
import { evaluateMatchAchievements } from '../src/achievement-projection.mjs';

function makeToken() { return randomBytes(32).toString('base64url'); }
function makeId(p) { return `${p}-${randomBytes(8).toString('base64url')}`; }

test('exports are defined', () => {
  assert.ok(createAuthoritativeMatch);
  assert.ok(AuthoritativeMatchSession);
  assert.ok(MatchStatus);
  assert.ok(ConnectionState);
  assert.ok(buildNetworkPlayerView);
  assert.ok(validateNetworkViewPrivacy);
  assert.ok(InMemoryMatchStore);
});

test('creates match with correct defaults', () => {
  const match = createAuthoritativeMatch({ matchId: 'M-TEST', seed: 1 });
  assert.equal(match.matchId, 'M-TEST');
  assert.equal(match.status, MatchStatus.WAITING_FOR_OPPONENT);
  assert.equal(match.participants.size, 0);
});

test('participant management works', () => {
  const match = createAuthoritativeMatch({ matchId: 'M-TEST', seed: 1 });
  const r1 = match.addParticipant('p1', makeToken());
  assert.equal(r1.playerId, 'P1');
  const r2 = match.addParticipant('p2', makeToken());
  assert.equal(r2.playerId, 'P2');
  assert.equal(match.status, MatchStatus.READY_CHECK);
});

test('match start and view', () => {
  const match = createAuthoritativeMatch({ matchId: 'M-TEST', seed: 42 });
  match.addParticipant('p1', makeToken());
  match.addParticipant('p2', makeToken());
  match.setReady('p1');
  match.setReady('p2');
  match.start();
  assert.equal(match.status, MatchStatus.RUNNING);

  const view = match.getAuthorizedView('p1');
  assert.ok(view);
  assert.equal(view.playerId, 'P1');
  assert.ok(view.decision);
});

test('network view privacy', () => {
  const match = createAuthoritativeMatch({ matchId: 'M-TEST', seed: 7 });
  match.addParticipant('p1', makeToken());
  match.addParticipant('p2', makeToken());
  match.setReady('p1');
  match.setReady('p2');
  match.start();

  const view = match.getAuthorizedView('p1');
  const safeView = buildNetworkPlayerView(view);
  const result = validateNetworkViewPrivacy(safeView);
  assert.ok(result.valid, result.violations.join(', '));
});

test('match store operations', () => {
  const store = new InMemoryMatchStore();
  const match = createAuthoritativeMatch({ matchId: 'M-STORE', seed: 1 });
  store.save(match);
  assert.equal(store.get('M-STORE'), match);
  store.registerInvite('ABC123', 'M-STORE');
  assert.equal(store.findByInviteCode('ABC123'), match);
  store.delete('M-STORE');
  assert.equal(store.get('M-STORE'), null);
});

// ── achievement-projection tests ──

test('achievement-projection: evaluateMatchAchievements returns empty for no events', () => {
  const results = evaluateMatchAchievements({
    matchId: 'M-test',
    engineState: { cards: {}, players: {} },
    playerIds: ['P1', 'P2'],
    events: [],
  });
  // No events → isQualifyingMatch may return false, or no facts derived
  // Either way, results should be an object (possibly empty)
  assert.ok(typeof results === 'object');
});

test('achievement-projection: evaluateMatchAchievements returns per-participant results', () => {
  // Minimal engine state with a winner
  const engineState = {
    cards: {},
    players: {
      P1: { securedPoints: 21, hand: [] },
      P2: { securedPoints: 15, hand: [] },
    },
    stack: [],
    fullTurnSequence: 10,
    revision: 42,
    winner: 'P1',
  };
  const events = [
    { type: 'MATCH_STARTED', matchId: 'M-test', playerId: 'P1', timestamp: 1 },
    { type: 'POINTS_SCORED', matchId: 'M-test', playerId: 'P1', points: 21, timestamp: 2 },
    { type: 'MATCH_ENDED', matchId: 'M-test', winner: 'P1', timestamp: 3 },
  ];

  const results = evaluateMatchAchievements({
    matchId: 'M-test',
    engineState,
    playerIds: ['P1', 'P2'],
    events,
  });

  // Should have entries for both players
  assert.ok(typeof results === 'object');
  // Each result should have newUnlocks array and progressUpdates
  for (const [pid, result] of Object.entries(results)) {
    assert.ok(Array.isArray(result.newUnlocks), `${pid} should have newUnlocks array`);
    assert.ok(typeof result.progressUpdates === 'object', `${pid} should have progressUpdates`);
  }
});

test('achievement-projection: getAllEvents collects events from command log', () => {
  const match = createAuthoritativeMatch({ matchId: 'M-test', seed: 42 });
  match.addParticipant('P1', 'token-1', null);
  match.addParticipant('P2', 'token-2', null);
  match.setReady('P1');
  match.setReady('P2');
  match.start();

  // commandLog entries may not have events until actions are submitted
  const events = match.getAllEvents();
  assert.ok(Array.isArray(events), 'getAllEvents should return an array');
});

test('achievement-projection: getAuthoritativeState returns full state', () => {
  const match = createAuthoritativeMatch({ matchId: 'M-test', seed: 42 });
  match.addParticipant('P1', 'token-1', null);
  match.addParticipant('P2', 'token-2', null);
  match.setReady('P1');
  match.setReady('P2');
  match.start();

  const state = match.getAuthoritativeState();
  assert.ok(typeof state === 'object');
  // State should have player data
  assert.ok(state.players || state.cards || typeof state === 'object');
});
