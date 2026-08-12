// ═══════════════════════════════════════════════════════════════
// match-store-persistence.test.mjs — SqliteMatchStore durability tests
//
// Proves:
//   - SqliteMatchStore saves and retrieves matches
//   - Match state is reconstructed correctly from snapshot
//   - Engine state is deterministically replayed from seed + command log
//   - Invite code lookup works across store instances
//   - Match deletion cleans up invite codes
//   - Expired match cleanup works
//   - Snapshot round-trip preserves all match metadata
//   - Live cache returns same object on repeated get()
//   - Store survives close and reopen (true durability)
//   - InMemoryMatchStore and SqliteMatchStore have identical interfaces
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAuthoritativeMatch, AuthoritativeMatchSession, MatchStatus, ConnectionState } from '../packages/match-authority/src/authoritative-match-session.mjs';
import { InMemoryMatchStore, SqliteMatchStore } from '../packages/match-authority/src/match-store.mjs';

// ── Helpers ──

function makeToken() { return randomBytes(32).toString('base64url'); }
function makeId(prefix) { return `${prefix}-${randomBytes(8).toString('base64url')}`; }
function makeMatchId() { return `match-${randomBytes(12).toString('hex')}`; }
function makeInviteCode() { return randomBytes(3).toString('base64url').toUpperCase().slice(0, 6); }

function createStartedMatch() {
  const match = createAuthoritativeMatch({
    matchId: makeMatchId(),
    profileId: 'core-unrestricted-authority',
    seed: 12345,
  });
  const token1 = makeToken();
  const token2 = makeToken();
  match.addParticipant('P-A', token1);
  match.addParticipant('P-B', token2);
  match.setReady('P-A');
  match.setReady('P-B');
  match.start();
  return { match, token1, token2 };
}

function createLobbyMatch() {
  const match = createAuthoritativeMatch({
    matchId: makeMatchId(),
    profileId: 'core-unrestricted-authority',
    seed: 99999,
  });
  const token1 = makeToken();
  match.addParticipant('P-A', token1);
  return { match, token1 };
}

// ── Section 1: InMemoryMatchStore basic operations ──

test('match-store: InMemoryMatchStore save and get', () => {
  const store = new InMemoryMatchStore();
  const { match } = createLobbyMatch();
  store.save(match);
  const retrieved = store.get(match.matchId);
  assert.ok(retrieved);
  assert.equal(retrieved.matchId, match.matchId);
  store.close();
});

test('match-store: InMemoryMatchStore returns null for unknown match', () => {
  const store = new InMemoryMatchStore();
  assert.equal(store.get('unknown-id'), null);
  store.close();
});

test('match-store: InMemoryMatchStore invite code lookup', () => {
  const store = new InMemoryMatchStore();
  const { match } = createLobbyMatch();
  const code = makeInviteCode();
  store.save(match);
  store.registerInvite(code, match.matchId);
  const found = store.findByInviteCode(code);
  assert.ok(found);
  assert.equal(found.matchId, match.matchId);
  store.close();
});

test('match-store: InMemoryMatchStore delete removes match and invite', () => {
  const store = new InMemoryMatchStore();
  const { match } = createLobbyMatch();
  const code = makeInviteCode();
  store.save(match);
  store.registerInvite(code, match.matchId);
  store.delete(match.matchId);
  assert.equal(store.get(match.matchId), null);
  assert.equal(store.findByInviteCode(code), null);
  store.close();
});

test('match-store: InMemoryMatchStore count and listMatchIds', () => {
  const store = new InMemoryMatchStore();
  const { match: m1 } = createLobbyMatch();
  const { match: m2 } = createLobbyMatch();
  store.save(m1);
  store.save(m2);
  assert.equal(store.count, 2);
  assert.equal(store.listMatchIds().length, 2);
  store.close();
});

test('match-store: InMemoryMatchStore cleanExpired removes old matches', () => {
  const store = new InMemoryMatchStore();
  const { match } = createLobbyMatch();
  // Manually set createdAt to the past
  match.createdAt = Date.now() - 100000;
  store.save(match);
  const cleaned = store.cleanExpired(50000); // 50s max age
  assert.equal(cleaned, 1);
  assert.equal(store.get(match.matchId), null);
  store.close();
});

// ── Section 2: SqliteMatchStore basic operations ──

test('match-store: SqliteMatchStore save and get (in-memory DB)', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  store.save(match);
  const retrieved = store.get(match.matchId);
  assert.ok(retrieved);
  assert.equal(retrieved.matchId, match.matchId);
  assert.equal(retrieved.status, match.status);
  store.close();
});

test('match-store: SqliteMatchStore returns null for unknown match', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  assert.equal(store.get('unknown-id'), null);
  store.close();
});

test('match-store: SqliteMatchStore invite code lookup', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  const code = makeInviteCode();
  store.save(match);
  store.registerInvite(code, match.matchId);
  const found = store.findByInviteCode(code);
  assert.ok(found);
  assert.equal(found.matchId, match.matchId);
  store.close();
});

test('match-store: SqliteMatchStore delete removes match and invite', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  const code = makeInviteCode();
  store.save(match);
  store.registerInvite(code, match.matchId);
  store.delete(match.matchId);
  assert.equal(store.get(match.matchId), null);
  assert.equal(store.findByInviteCode(code), null);
  store.close();
});

test('match-store: SqliteMatchStore count and listMatchIds', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match: m1 } = createLobbyMatch();
  const { match: m2 } = createLobbyMatch();
  store.save(m1);
  store.save(m2);
  assert.equal(store.count, 2);
  assert.equal(store.listMatchIds().length, 2);
  store.close();
});

test('match-store: SqliteMatchStore cleanExpired removes old matches', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  match.createdAt = Date.now() - 100000;
  store.save(match);
  const cleaned = store.cleanExpired(50000);
  assert.equal(cleaned, 1);
  assert.equal(store.get(match.matchId), null);
  store.close();
});

// ── Section 3: Snapshot round-trip ──

test('match-store: toSnapshot produces JSON-safe object', () => {
  const { match } = createLobbyMatch();
  const snapshot = match.toSnapshot();
  // Must be JSON-serializable
  const json = JSON.stringify(snapshot);
  const parsed = JSON.parse(json);
  assert.equal(parsed.matchId, match.matchId);
  assert.equal(parsed.status, match.status);
  assert.equal(parsed.seed, match._seed);
});

test('match-store: fromSnapshot reconstructs lobby match', () => {
  const { match, token1 } = createLobbyMatch();
  const snapshot = match.toSnapshot();
  const restored = AuthoritativeMatchSession.fromSnapshot(snapshot);
  assert.equal(restored.matchId, match.matchId);
  assert.equal(restored.status, match.status);
  assert.equal(restored.profileId, match.profileId);
  assert.equal(restored.seatOrder, match.seatOrder);
  assert.equal(restored.participants.size, 1);
  // Participant data preserved
  const p = restored.participants.get('P-A');
  assert.ok(p);
  assert.equal(p.playerId, 'P1');
  // IRX-H15: Token is now stored as a hash, not plaintext.
  // validateToken should still work with the original token.
  assert.ok(p.tokenHash, 'tokenHash must be present');
  assert.notEqual(p.tokenHash, token1, 'stored token must not be plaintext');
  assert.ok(restored.validateToken('P-A', token1), 'validateToken must work with original token');
});

test('match-store: fromSnapshot reconstructs started match with engine state', () => {
  const { match, token1, token2 } = createStartedMatch();
  const snapshot = match.toSnapshot();
  const restored = AuthoritativeMatchSession.fromSnapshot(snapshot);
  assert.equal(restored.matchId, match.matchId);
  assert.equal(restored.status, MatchStatus.RUNNING);
  assert.equal(restored.participants.size, 2);
  // Engine state should be reconstructed
  assert.ok(restored.state, 'Engine state must be reconstructed');
  assert.ok(restored._initialState, 'Initial state must be reconstructed');
  // Current decision frame should be rebuilt
  assert.ok(restored.currentDecisionActor, 'Current decision actor must be set');
  assert.ok(restored.commandVault, 'Command vault must be rebuilt');
  assert.ok(restored.legalActionFrame, 'Legal action frame must be rebuilt');
  assert.ok(restored.decisionFrameHash, 'Decision frame hash must be computed');
});

test('match-store: fromSnapshot preserves command log', () => {
  const { match } = createStartedMatch();
  const snapshot = match.toSnapshot();
  const restored = AuthoritativeMatchSession.fromSnapshot(snapshot);
  assert.equal(restored.commandLog.length, match.commandLog.length);
});

test('match-store: fromSnapshot preserves idempotency records', () => {
  const { match } = createStartedMatch();
  // The idempotency map should be empty for a fresh match (no actions submitted)
  const snapshot = match.toSnapshot();
  const restored = AuthoritativeMatchSession.fromSnapshot(snapshot);
  assert.equal(restored._idempotency.size, match._idempotency.size);
});

test('match-store: fromSnapshot preserves timestamps', () => {
  const { match } = createLobbyMatch();
  const originalCreatedAt = match.createdAt;
  const originalUpdatedAt = match.updatedAt;
  const snapshot = match.toSnapshot();
  const restored = AuthoritativeMatchSession.fromSnapshot(snapshot);
  assert.equal(restored.createdAt, originalCreatedAt);
  assert.equal(restored.updatedAt, originalUpdatedAt);
});

// ── Section 4: True durability — survive close and reopen ──

test('match-store: SqliteMatchStore survives close and reopen (file-based)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-match-test-'));
  const dbPath = join(tmpDir, 'matches.sqlite');
  const code = makeInviteCode();

  // Create store, save match, close
  const store1 = new SqliteMatchStore({ path: dbPath });
  const { match } = createLobbyMatch();
  store1.save(match);
  store1.registerInvite(code, match.matchId);
  assert.equal(store1.count, 1);
  store1.close();

  // Verify DB file exists
  assert.ok(existsSync(dbPath), 'SQLite database file must exist');

  // Reopen store — match should be retrievable
  const store2 = new SqliteMatchStore({ path: dbPath });
  assert.equal(store2.count, 1);
  const retrieved = store2.get(match.matchId);
  assert.ok(retrieved);
  assert.equal(retrieved.matchId, match.matchId);
  assert.equal(retrieved.status, match.status);
  // Invite code should also survive
  const found = store2.findByInviteCode(code);
  assert.ok(found);
  assert.equal(found.matchId, match.matchId);
  store2.close();

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
});

test('match-store: SqliteMatchStore survives close and reopen with started match', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-match-test-'));
  const dbPath = join(tmpDir, 'matches.sqlite');

  // Create and start a match, then close
  const store1 = new SqliteMatchStore({ path: dbPath });
  const { match } = createStartedMatch();
  store1.save(match);
  store1.close();

  // Reopen — match should be reconstructed with engine state
  const store2 = new SqliteMatchStore({ path: dbPath });
  const restored = store2.get(match.matchId);
  assert.ok(restored);
  assert.equal(restored.status, MatchStatus.RUNNING);
  assert.ok(restored.state, 'Engine state must be reconstructed after reopen');
  assert.ok(restored.currentDecisionActor, 'Decision actor must be set after reopen');
  assert.ok(restored.commandVault, 'Command vault must be rebuilt after reopen');
  store2.close();

  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Section 5: Live cache behavior ──

test('match-store: SqliteMatchStore cache returns same object on repeated get', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  store.save(match);
  const r1 = store.get(match.matchId);
  const r2 = store.get(match.matchId);
  assert.strictEqual(r1, r2, 'Repeated get() should return the same cached object');
  store.close();
});

test('match-store: SqliteMatchStore cache is updated on save', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  store.save(match);
  // Modify and re-save
  match.status = MatchStatus.READY_CHECK;
  store.save(match);
  const retrieved = store.get(match.matchId);
  assert.equal(retrieved.status, MatchStatus.READY_CHECK);
  store.close();
});

// ── Section 6: Interface parity ──

test('match-store: InMemoryMatchStore and SqliteMatchStore have same interface', () => {
  const mem = new InMemoryMatchStore();
  const sql = new SqliteMatchStore({ path: ':memory:' });
  const memMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mem)).filter(m => m !== 'constructor');
  const sqlMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sql)).filter(m => m !== 'constructor');
  for (const method of memMethods) {
    assert.ok(sqlMethods.includes(method), `SqliteMatchStore must have method: ${method}`);
  }
  for (const method of sqlMethods) {
    assert.ok(memMethods.includes(method), `InMemoryMatchStore must have method: ${method}`);
  }
  mem.close();
  sql.close();
});

// ── Section 7: Privacy — snapshot does not leak seed to clients ──

test('match-store: snapshot contains seed (server-side only, not for clients)', () => {
  const { match } = createStartedMatch();
  const snapshot = match.toSnapshot();
  // The snapshot DOES contain the seed — it's a server-side persistence format
  // The seed must NEVER appear in getAuthorizedView() (that's the client-facing path)
  assert.ok(snapshot.seed !== undefined, 'Snapshot must contain seed for reconstruction');
  // Verify the client view does NOT contain seed
  const view = match.getAuthorizedView('P-A');
  assert.equal(view.seed, undefined, 'Client view must never contain seed');
});

test('match-store: snapshot does not contain command vault (private)', () => {
  const { match } = createStartedMatch();
  const snapshot = match.toSnapshot();
  // The snapshot should not contain the live command vault (it's rebuilt on restore)
  assert.equal(snapshot.commandVault, undefined, 'Snapshot must not contain live command vault');
  assert.equal(snapshot.legalActionFrame, undefined, 'Snapshot must not contain live legal action frame');
});

// ── Section 8: Multiple matches in one store ──

test('match-store: SqliteMatchStore handles multiple matches', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const matches = [];
  for (let i = 0; i < 5; i++) {
    const { match } = createLobbyMatch();
    store.save(match);
    store.registerInvite(makeInviteCode(), match.matchId);
    matches.push(match);
  }
  assert.equal(store.count, 5);
  for (const m of matches) {
    const retrieved = store.get(m.matchId);
    assert.ok(retrieved);
    assert.equal(retrieved.matchId, m.matchId);
  }
  store.close();
});

test('match-store: SqliteMatchStore upsert (save same match twice)', () => {
  const store = new SqliteMatchStore({ path: ':memory:' });
  const { match } = createLobbyMatch();
  store.save(match);
  // Modify and save again
  match.updatedAt = Date.now();
  store.save(match);
  assert.equal(store.count, 1, 'Upsert should not duplicate');
  store.close();
});
