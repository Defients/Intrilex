import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createAuthoritativeMatch, AuthoritativeMatchSession, MatchStatus, ConnectionState } from '../src/authoritative-match-session.mjs';
import { buildNetworkPlayerView, validateNetworkViewPrivacy } from '../src/player-projection.mjs';
import { InMemoryMatchStore } from '../src/match-store.mjs';

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
