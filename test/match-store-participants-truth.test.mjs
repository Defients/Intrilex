// ═══════════════════════════════════════════════════════════════
// match-store-participants-truth.test.mjs — v0.24.2 Truth Closure II
//
// Regression proof for the SQLite listMatches participant ID bug.
// toSnapshot() serializes participants as an ARRAY of objects:
//   [{ participantId: 'P-xxx', playerId: 'P1', token: '...', ... }, ...]
// But SqliteMatchStore.listMatches() was using Object.keys() on the array,
// which returned ["0","1"] (array indices) instead of participant IDs.
//
// This test proves:
//   - SQLite listMatches returns real participant IDs (not array indices)
//   - SQLite and InMemory return the same semantic MatchSummary
//   - Works across READY_CHECK, RUNNING, and TERMINAL statuses
//   - Participant IDs are nontrivial (not "0", "1", etc.)
//   - Participant IDs survive store close and reopen
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAuthoritativeMatch, MatchStatus } from '../packages/match-authority/src/authoritative-match-session.mjs';
import { InMemoryMatchStore, SqliteMatchStore } from '../packages/match-authority/src/match-store.mjs';

// ── Helpers ──

function makeToken() { return randomBytes(32).toString('base64url'); }
function makePid(prefix) { return `${prefix}-${randomBytes(8).toString('base64url')}`; }
function makeMatchId() { return `M-${randomBytes(12).toString('hex')}`; }

/**
 * Create a match with deliberately nontrivial participant IDs and return it
 * in the requested status.
 */
function createMatchInStatus(status) {
  const match = createAuthoritativeMatch({
    matchId: makeMatchId(),
    profileId: 'core-unrestricted-authority',
    seed: 42,
  });
  const pid1 = makePid('P');
  const pid2 = makePid('P');
  const token1 = makeToken();
  const token2 = makeToken();
  match.addParticipant(pid1, token1);
  match.addParticipant(pid2, token2);

  if (status === MatchStatus.READY_CHECK) {
    return { match, pids: [pid1, pid2] };
  }

  match.setReady(pid1);
  match.setReady(pid2);
  match.start();

  if (status === MatchStatus.RUNNING) {
    return { match, pids: [pid1, pid2] };
  }

  if (status === MatchStatus.TERMINAL) {
    // Force terminal state for testing — the store only reads status + participants
    match.status = MatchStatus.TERMINAL;
    match.terminalReason = 'TEST_TERMINAL';
    match.winner = pid1;
    return { match, pids: [pid1, pid2] };
  }

  throw new Error(`Unknown status: ${status}`);
}

/**
 * Safely cleanup a temp directory, retrying on Windows file-lock errors.
 */
function safeCleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may lock SQLite files — retry after a short delay
    setTimeout(() => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }, 500);
  }
}

// ── Tests ──

test('SQLite listMatches: participant IDs are real IDs, not array indices', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-pid-'));
  try {
    const dbPath = join(tmpDir, 'test.sqlite');
    const store = new SqliteMatchStore({ path: dbPath });
    const { match, pids } = createMatchInStatus(MatchStatus.READY_CHECK);
    store.save(match);

    const summaries = store.listMatches({ limit: 10 });
    assert.equal(summaries.length, 1);
    const s = summaries[0];
    assert.equal(s.matchId, match.matchId);

    // The critical assertion: participants must be the real participant IDs
    assert.equal(s.participants.length, 2, 'must have 2 participants');
    assert.ok(s.participants.includes(pids[0]), `must include ${pids[0]}, got ${JSON.stringify(s.participants)}`);
    assert.ok(s.participants.includes(pids[1]), `must include ${pids[1]}, got ${JSON.stringify(s.participants)}`);

    // Must NOT be array indices
    assert.ok(!s.participants.includes('0'), 'must not return array index "0"');
    assert.ok(!s.participants.includes('1'), 'must not return array index "1"');

    store.close();
  } finally {
    safeCleanup(tmpDir);
  }
});

test('SQLite and InMemory listMatches return the same semantic MatchSummary', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-parity-'));
  try {
    const sqliteStore = new SqliteMatchStore({ path: join(tmpDir, 'test.sqlite') });
    const memStore = new InMemoryMatchStore();

    for (const status of [MatchStatus.READY_CHECK, MatchStatus.RUNNING, MatchStatus.TERMINAL]) {
      const { match, pids } = createMatchInStatus(status);
      sqliteStore.save(match);
      memStore.save(match);
    }

    const sqliteSummaries = sqliteStore.listMatches({ limit: 50 });
    const memSummaries = memStore.listMatches({ limit: 50 });

    assert.equal(sqliteSummaries.length, 3, 'SQLite must have 3 matches');
    assert.equal(memSummaries.length, 3, 'InMemory must have 3 matches');

    // Sort by matchId for stable comparison
    sqliteSummaries.sort((a, b) => a.matchId.localeCompare(b.matchId));
    memSummaries.sort((a, b) => a.matchId.localeCompare(b.matchId));

    for (let i = 0; i < sqliteSummaries.length; i++) {
      const sql = sqliteSummaries[i];
      const mem = memSummaries[i];
      assert.equal(sql.matchId, mem.matchId, `matchId must match at index ${i}`);
      assert.equal(sql.status, mem.status, `status must match at index ${i}`);
      assert.equal(sql.participants.length, mem.participants.length,
        `participant count must match at index ${i}`);
      // Both must contain the same participant IDs
      for (const pid of mem.participants) {
        assert.ok(sql.participants.includes(pid),
          `SQLite must include participant ${pid} for match ${sql.matchId}; got ${JSON.stringify(sql.participants)}`);
      }
      // Neither should contain array indices
      for (const pid of sql.participants) {
        assert.ok(!['0', '1'].includes(pid),
          `SQLite participant ID must not be array index "${pid}"`);
      }
    }

    sqliteStore.close();
  } finally {
    safeCleanup(tmpDir);
  }
});

test('SQLite listMatches: READY_CHECK status returns correct participant IDs', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-ready-'));
  try {
    const store = new SqliteMatchStore({ path: join(tmpDir, 'test.sqlite') });
    const { match, pids } = createMatchInStatus(MatchStatus.READY_CHECK);
    store.save(match);

    const summaries = store.listMatches({ status: 'READY_CHECK', limit: 10 });
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0].participants.sort(), [...pids].sort());

    store.close();
  } finally {
    safeCleanup(tmpDir);
  }
});

test('SQLite listMatches: RUNNING status returns correct participant IDs', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-running-'));
  try {
    const store = new SqliteMatchStore({ path: join(tmpDir, 'test.sqlite') });
    const { match, pids } = createMatchInStatus(MatchStatus.RUNNING);
    store.save(match);

    const summaries = store.listMatches({ status: 'RUNNING', limit: 10 });
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0].participants.sort(), [...pids].sort());

    store.close();
  } finally {
    safeCleanup(tmpDir);
  }
});

test('SQLite listMatches: TERMINAL status returns correct participant IDs', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-terminal-'));
  try {
    const store = new SqliteMatchStore({ path: join(tmpDir, 'test.sqlite') });
    const { match, pids } = createMatchInStatus(MatchStatus.TERMINAL);
    store.save(match);

    const summaries = store.listMatches({ status: 'TERMINAL', limit: 10 });
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0].participants.sort(), [...pids].sort());

    store.close();
  } finally {
    safeCleanup(tmpDir);
  }
});

test('SQLite listMatches: participant IDs survive store close and reopen', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-reopen-'));
  try {
    const dbPath = join(tmpDir, 'test.sqlite');
    const store1 = new SqliteMatchStore({ path: dbPath });
    const { match, pids } = createMatchInStatus(MatchStatus.READY_CHECK);
    store1.save(match);
    store1.close();

    // Reopen — verify participant IDs are still correct
    const store2 = new SqliteMatchStore({ path: dbPath });
    const summaries = store2.listMatches({ limit: 10 });
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0].participants.sort(), [...pids].sort());
    assert.ok(!summaries[0].participants.includes('0'));
    assert.ok(!summaries[0].participants.includes('1'));
    store2.close();
  } finally {
    safeCleanup(tmpDir);
  }
});
