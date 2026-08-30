// ═══════════════════════════════════════════════════════════════
// irx-c08-tournament-progression.test.mjs — IRX-C08/C09/C10/C11
//
// Proves:
//   1. Single-elim tournament advances through all rounds (not just R1)
//   2. Tournament match IDs are tournament-scoped (no collisions)
//   3. recordTournamentResult validates winner is a participant
//   4. getChampion returns the final match winner, not a semifinalist
//   5. Swiss tournament advances through configured rounds
//   6. Repository uses upsert (not delete/reinsert) for participants
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TournamentFormat,
  TournamentStatus,
  TournamentMatchStatus,
  createTournament,
  startTournament,
  recordTournamentResult,
  advanceSingleElimRound,
  advanceSwissRound,
  getChampion,
  getSwissStandings,
  singleElimRoundCount,
  swissRoundCount,
} from '../packages/account-domain/src/tournament-domain.mjs';

function makePlayer(id, seed) {
  return { publicPlayerId: id, displayName: `Player ${seed}`, handle: `p${seed}`, seed };
}

function setupTournament(players, opts = {}) {
  const t = createTournament({
    name: opts.name || 'Test Cup',
    format: opts.format || TournamentFormat.SINGLE_ELIM,
    bestOf: opts.bestOf || 1,
    maxPlayers: opts.maxPlayers || 32,
    swissRounds: opts.swissRounds,
  });
  // Move to REGISTRATION so we can add players and start
  t.status = TournamentStatus.REGISTRATION;
  for (const p of players) t.players.push(p);
  return startTournament(t);
}

// ── IRX-C08: Single-elim advances through all rounds ──

test('IRX-C08: 4-player single-elim advances through semifinals and final', () => {
  const players = [
    makePlayer('PLY_A', 1),
    makePlayer('PLY_B', 2),
    makePlayer('PLY_C', 3),
    makePlayer('PLY_D', 4),
  ];
  let t = setupTournament(players, { name: 'Test Cup' });

  // Round 1: 2 semifinal matches
  const r1Matches = t.matches.filter(m => m.round === 1);
  assert.equal(r1Matches.length, 2, 'should have 2 semifinal matches');

  // Record R1 results: A beats B, C beats D
  t = recordTournamentResult(t, r1Matches[0].matchId, 'PLY_A', 1, 0);
  t = recordTournamentResult(t, r1Matches[1].matchId, 'PLY_C', 1, 0);

  // IRX-C08: After R1 completes, R2 (final) should be generated
  const r2Matches = t.matches.filter(m => m.round === 2);
  assert.ok(r2Matches.length > 0, 'final round should be generated after semifinals complete');
  assert.equal(r2Matches.length, 1, 'should have exactly 1 final match');
  assert.equal(r2Matches[0].playerAId, 'PLY_A', 'final should have winner of SF1');
  assert.equal(r2Matches[0].playerBId, 'PLY_C', 'final should have winner of SF2');

  // Record final: A beats C
  t = recordTournamentResult(t, r2Matches[0].matchId, 'PLY_A', 1, 0);

  // Tournament should be complete
  assert.equal(t.status, TournamentStatus.COMPLETED, 'tournament should be completed after final');

  // IRX-C08: Champion should be the final winner
  const champion = getChampion(t);
  assert.ok(champion, 'champion should exist');
  assert.equal(champion.publicPlayerId, 'PLY_A', 'champion should be the final winner');
});

test('IRX-C08: 8-player single-elim advances through 3 rounds', () => {
  const players = [];
  for (let i = 0; i < 8; i++) players.push(makePlayer(`PLY_${i}`, i + 1));

  let t = setupTournament(players, { name: '8-Player Cup' });

  const totalRounds = singleElimRoundCount(8);
  assert.equal(totalRounds, 3, '8 players = 3 rounds (quarter, semi, final)');

  // Play through all rounds
  let round = 1;
  while (t.status !== TournamentStatus.COMPLETED) {
    const roundMatches = t.matches.filter(
      m => m.round === round && m.status === TournamentMatchStatus.SCHEDULED
    );
    if (roundMatches.length === 0) {
      round++;
      if (round > totalRounds + 1) break;
      continue;
    }
    for (const m of roundMatches) {
      t = recordTournamentResult(t, m.matchId, m.playerAId, 1, 0);
    }
    round++;
  }

  assert.equal(t.status, TournamentStatus.COMPLETED, '8-player tournament should complete');
  const champion = getChampion(t);
  assert.ok(champion, 'champion should exist');
  assert.equal(champion.publicPlayerId, 'PLY_0', 'top seed should win all matches');
});

// ── IRX-C10: Tournament match IDs are tournament-scoped ──

test('IRX-C10: match IDs include tournament ID to prevent collisions', () => {
  const players = [makePlayer('PLY_A', 1), makePlayer('PLY_B', 2)];

  const t1 = setupTournament(players, { name: 'Alpha' });
  const t2 = setupTournament(players, { name: 'Beta' });

  // Match IDs should be different across tournaments
  const t1Ids = t1.matches.map(m => m.matchId);
  const t2Ids = t2.matches.map(m => m.matchId);
  for (const id of t1Ids) {
    assert.ok(!t2Ids.includes(id), `match ID ${id} should not exist in both tournaments`);
  }
  // Match IDs should start with the tournament ID
  for (const id of t1Ids) {
    assert.ok(id.startsWith(t1.tournamentId), `match ID ${id} should start with tournament ID ${t1.tournamentId}`);
  }
  for (const id of t2Ids) {
    assert.ok(id.startsWith(t2.tournamentId), `match ID ${id} should start with tournament ID ${t2.tournamentId}`);
  }
});

// ── IRX-C08: recordTournamentResult validates winner ──

test('IRX-C08: recordTournamentResult rejects winner not in match', () => {
  const players = [makePlayer('PLY_A', 1), makePlayer('PLY_B', 2)];
  const t = setupTournament(players, { name: 'Test' });

  const match = t.matches.find(m => m.status === TournamentMatchStatus.SCHEDULED);
  assert.throws(
    () => recordTournamentResult(t, match.matchId, 'PLY_Z', 1, 0),
    /Winner must be a participant/,
    'should reject winner not in match'
  );
});

test('IRX-C08: recordTournamentResult rejects invalid score for best-of-3', () => {
  const players = [makePlayer('PLY_A', 1), makePlayer('PLY_B', 2)];
  const t = setupTournament(players, { name: 'Bo3 Test', bestOf: 3 });

  const match = t.matches.find(m => m.status === TournamentMatchStatus.SCHEDULED);
  // best-of-3 requires 2 wins — 1-0 should be rejected
  assert.throws(
    () => recordTournamentResult(t, match.matchId, 'PLY_A', 1, 0),
    /at least 2 wins/,
    'should reject score below wins threshold for best-of-3'
  );
});

// ── IRX-C08: Swiss tournament advances through rounds ──

test('IRX-C08: 4-player Swiss advances through configured rounds', () => {
  const players = [
    makePlayer('PLY_A', 1),
    makePlayer('PLY_B', 2),
    makePlayer('PLY_C', 3),
    makePlayer('PLY_D', 4),
  ];
  let t = setupTournament(players, {
    name: 'Swiss Test', format: TournamentFormat.SWISS, swissRounds: 3,
  });

  const totalRounds = t.swissRounds;
  assert.equal(totalRounds, 3, 'should have 3 Swiss rounds');

  // Play through all rounds
  let round = 1;
  while (t.status !== TournamentStatus.COMPLETED) {
    const roundMatches = t.matches.filter(
      m => m.round === round && m.status === TournamentMatchStatus.SCHEDULED
    );
    if (roundMatches.length === 0) {
      round++;
      if (round > totalRounds + 1) break;
      continue;
    }
    for (const m of roundMatches) {
      t = recordTournamentResult(t, m.matchId, m.playerAId, 1, 0);
    }
    round++;
  }

  assert.equal(t.status, TournamentStatus.COMPLETED, 'Swiss tournament should complete after all rounds');

  const standings = getSwissStandings(t);
  assert.ok(standings.length > 0, 'standings should exist');
});

// ── IRX-C09/C11: Repository uses one atomic authority boundary ──

test('IRX-C09: tournament repository uses the atomic RPC without a sequential fallback', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const src = readFileSync(
    resolve('apps/match-server/src/persistence/tournament-repository.mjs'), 'utf8'
  );

  assert.match(src, /\.rpc\('upsert_tournament_atomic'/, 'should use the atomic tournament RPC');
  assert.match(src, /p_participants:\s*participantRows/, 'should send participant rows through the atomic RPC');
  assert.match(src, /p_matches:\s*matchRows/, 'should send match rows through the atomic RPC');
  assert.doesNotMatch(
    src,
    /from\('tournament_participants'\)\.upsert/,
    'must not retain a non-atomic participant fallback',
  );
  assert.doesNotMatch(
    src,
    /from\('tournament_matches'\)\.upsert/,
    'must not retain a non-atomic match fallback',
  );

  // The file should NOT have delete + insert pattern for participants or matches in save()
  // The only delete() should be in the delete() method for the tournament row itself
  const deleteCalls = src.match(/\.delete\(\)/g) || [];
  // Only 1 delete call allowed — in the delete() method for tournament row
  assert.equal(deleteCalls.length, 1, 'only 1 delete() call allowed (in delete method for tournament row)');
});

// ── IRX-C11: Repository fails closed without leaking backend details ──

test('IRX-C11: tournament repository fails closed with sanitized atomic errors', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const src = readFileSync(
    resolve('apps/match-server/src/persistence/tournament-repository.mjs'), 'utf8'
  );

  assert.match(src, /Atomic RPC is the only production-safe write path/, 'atomicity rationale should remain explicit');
  assert.match(src, /throw new Error\('Atomic tournament save failed'\)/, 'RPC failures should reject');
  assert.match(
    src,
    /throw new Error\('Atomic tournament save returned an invalid result'\)/,
    'invalid RPC acknowledgements should reject',
  );
  assert.doesNotMatch(src, /rpcErr\.message/, 'backend error details must not be reflected to callers');
});
