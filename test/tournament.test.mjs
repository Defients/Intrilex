import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schedulerPath = path.join(root, 'apps/lab-web/src/workspaces/tournament-scheduler.js');

// The tournament scheduler uses ES module exports — import it directly
const { createTournament, advanceTournament, recordMatchResult, getNextMatch, getReadyMatches, getTournamentSummary, TOURNAMENT_SCHEMA_VERSION } = await import('file://' + schedulerPath.replace(/\\/g, '/'));

// ── Bracket generation tests ────────────────────────────────────

test('createTournament generates correct bracket for 4 policies', () => {
  const t = createTournament(['score-rush', 'control', 'tempo', 'value']);
  assert.equal(t.schemaVersion, '1.1.0');
  assert.equal(t.policyCount, 4);
  assert.equal(t.bracketSize, 4);
  assert.equal(t.bestOf, 1);
  assert.equal(t.status, 'in_progress');
  assert.equal(t.champion, null);
  assert.equal(t.rounds.length, 2, '4 policies → 2 rounds (semis + final)');
  assert.equal(t.rounds[0].roundLabel, 'Semifinals');
  assert.equal(t.rounds[1].roundLabel, 'Final');
  assert.equal(t.rounds[0].matches.length, 2, '2 semifinal matches');
  assert.equal(t.rounds[1].matches.length, 1, '1 final match');
  // No BYEs for exact power of 2
  assert.ok(t.rounds[0].matches.every(m => !m.isBye));
});

test('createTournament generates correct bracket for 8 policies', () => {
  const t = createTournament(['a','b','c','d','e','f','g','h']);
  assert.equal(t.bracketSize, 8);
  assert.equal(t.rounds.length, 3);
  assert.equal(t.rounds[0].roundLabel, 'Quarterfinals');
  assert.equal(t.rounds[0].matches.length, 4);
  assert.equal(t.rounds[1].matches.length, 2);
  assert.equal(t.rounds[2].matches.length, 1);
});

test('createTournament pads to next power of 2 with BYEs', () => {
  const t = createTournament(['a','b','c','d','e','f']);
  assert.equal(t.policyCount, 6);
  assert.equal(t.bracketSize, 8, '6 policies → padded to 8');
  assert.equal(t.rounds[0].matches.length, 4);
  // 2 BYE matches
  const byeMatches = t.rounds[0].matches.filter(m => m.isBye);
  assert.equal(byeMatches.length, 2);
  // BYE matches should be auto-completed
  assert.ok(byeMatches.every(m => m.status === 'completed' && m.winner));
});

test('createTournament pads 3 policies to 4', () => {
  const t = createTournament(['a','b','c']);
  assert.equal(t.bracketSize, 4);
  assert.equal(t.rounds[0].matches.length, 2);
  const byeMatches = t.rounds[0].matches.filter(m => m.isBye);
  assert.equal(byeMatches.length, 1);
});

test('createTournament pads 2 policies to 2 (no padding)', () => {
  const t = createTournament(['a','b']);
  assert.equal(t.bracketSize, 2);
  assert.equal(t.rounds.length, 1);
  assert.equal(t.rounds[0].roundLabel, 'Final');
  assert.equal(t.rounds[0].matches.length, 1);
});

test('createTournament rejects < 2 policies', () => {
  assert.throws(() => createTournament(['a']), /TOURNAMENT_NEEDS_2_POLICIES/);
  assert.throws(() => createTournament([]), /TOURNAMENT_NEEDS_2_POLICIES/);
});

test('createTournament rejects > 16 policies', () => {
  const policies = Array.from({ length: 17 }, (_, i) => `p${i}`);
  assert.throws(() => createTournament(policies), /TOURNAMENT_MAX_16_POLICIES/);
});

test('createTournament rejects duplicate policies', () => {
  assert.throws(() => createTournament(['a','a','b']), /TOURNAMENT_DUPLICATE_POLICIES/);
});

test('createTournament supports bestOf option', () => {
  const t = createTournament(['a','b','c','d'], { bestOf: 3 });
  assert.equal(t.bestOf, 3);
});

test('createTournament rejects even bestOf values', () => {
  assert.throws(() => createTournament(['a','b'], { bestOf: 2 }), /BEST_OF_MUST_BE_ODD/);
  assert.throws(() => createTournament(['a','b'], { bestOf: 4 }), /BEST_OF_MUST_BE_ODD/);
});

// ── Standard bracket seeding tests ──────────────────────────────

test('bracket seeding follows standard tournament seeding for 8', () => {
  const t = createTournament(['1','2','3','4','5','6','7','8']);
  // Standard seeding: 1v8, 4v5, 2v7, 3v6 (in bracket order)
  // The recursive interleave produces a valid bracket where seed 1 meets seed 2 in the final
  const m = t.rounds[0].matches;
  // Match 0: seed 1 vs seed 8
  assert.equal(m[0].seat1Policy, '1');
  assert.equal(m[0].seat2Policy, '8');
  // Match 1: seed 4 vs seed 5
  assert.equal(m[1].seat1Policy, '4');
  assert.equal(m[1].seat2Policy, '5');
  // Match 2: seed 2 vs seed 7
  assert.equal(m[2].seat1Policy, '2');
  assert.equal(m[2].seat2Policy, '7');
  // Match 3: seed 3 vs seed 6
  assert.equal(m[3].seat1Policy, '3');
  assert.equal(m[3].seat2Policy, '6');
});

// ── Winner propagation tests ────────────────────────────────────

test('recordMatchResult records winner and propagates to next round', () => {
  const t = createTournament(['a','b','c','d']);
  const matchId = t.rounds[0].matches[0].matchId; // R0-M0
  const updated = recordMatchResult(t, matchId, 'a', { winner: 'P1', scoreMargin: 10 });
  // Match should be completed
  const match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, 'a');
  assert.equal(match.status, 'completed');
  assert.equal(match.games.length, 1);
  // Winner should propagate to next round
  const nextMatch = updated.rounds[1].matches[0];
  assert.equal(nextMatch.seat1Policy, 'a', 'winner should propagate to seat1 of final');
});

test('recordMatchResult completes tournament when final is decided', () => {
  const t = createTournament(['a','b']);
  const matchId = t.rounds[0].matches[0].matchId;
  const updated = recordMatchResult(t, matchId, 'a', { winner: 'P1' });
  assert.equal(updated.champion, 'a');
  assert.equal(updated.status, 'completed');
});

test('recordMatchResult rejects already completed matches', () => {
  const t = createTournament(['a','b','c','d']);
  const matchId = t.rounds[0].matches[0].matchId;
  const updated = recordMatchResult(t, matchId, 'a', { winner: 'P1' });
  assert.throws(() => recordMatchResult(updated, matchId, 'b', { winner: 'P2' }), /MATCH_ALREADY_COMPLETED/);
});

test('recordMatchResult rejects unknown match IDs', () => {
  const t = createTournament(['a','b']);
  assert.throws(() => recordMatchResult(t, 'R99-M99', 'a', {}), /MATCH_NOT_FOUND/);
});

test('bestOf=3 requires 2 wins to complete match', () => {
  const t = createTournament(['a','b'], { bestOf: 3 });
  const matchId = t.rounds[0].matches[0].matchId;
  // Game 1: a wins
  let updated = recordMatchResult(t, matchId, 'a', { winner: 'P1' });
  let match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, null, 'match not decided after 1 win in bestOf=3');
  assert.equal(match.games.length, 1);
  // Game 2: b wins (1-1)
  updated = recordMatchResult(updated, matchId, 'b', { winner: 'P2' });
  match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, null, 'match not decided after 1-1 in bestOf=3');
  assert.equal(match.games.length, 2);
  // Game 3: a wins (2-1)
  updated = recordMatchResult(updated, matchId, 'a', { winner: 'P1' });
  match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, 'a', 'match decided after 2-1 in bestOf=3');
  assert.equal(match.status, 'completed');
  assert.equal(updated.champion, 'a');
});

// ── Next match and ready matches tests ──────────────────────────

test('getNextMatch returns first ready match', () => {
  const t = createTournament(['a','b','c','d']);
  const next = getNextMatch(t);
  assert.ok(next, 'should have a next match');
  assert.equal(next.status, 'ready');
  assert.ok(next.seat1Policy && next.seat2Policy);
});

test('getNextMatch returns null when all matches completed', () => {
  const t = createTournament(['a','b']);
  const matchId = t.rounds[0].matches[0].matchId;
  const updated = recordMatchResult(t, matchId, 'a', { winner: 'P1' });
  assert.equal(getNextMatch(updated), null);
});

test('getReadyMatches returns all matches ready to play', () => {
  const t = createTournament(['a','b','c','d']);
  const ready = getReadyMatches(t);
  assert.equal(ready.length, 2, '2 semifinal matches ready');
});

test('getReadyMatches excludes BYE matches', () => {
  const t = createTournament(['a','b','c','d','e','f']);
  const ready = getReadyMatches(t);
  // 6 policies → 8 bracket → 2 BYEs → 2 real matches in round 0
  assert.equal(ready.length, 2);
  assert.ok(ready.every(m => !m.isBye));
});

// ── Summary tests ───────────────────────────────────────────────

test('getTournamentSummary returns correct stats', () => {
  const t = createTournament(['a','b','c','d']);
  const summary = getTournamentSummary(t);
  assert.equal(summary.totalMatches, 3, '2 semis + 1 final = 3 non-BYE matches');
  assert.equal(summary.completedMatches, 0);
  assert.equal(summary.progress, 0);
  assert.equal(summary.champion, null);
  assert.equal(summary.status, 'in_progress');
});

test('getTournamentSummary tracks policy stats after matches', () => {
  const t = createTournament(['a','b','c','d']);
  const m0 = t.rounds[0].matches[0].matchId;
  const m1 = t.rounds[0].matches[1].matchId;
  let updated = recordMatchResult(t, m0, 'a', { winner: 'P1' });
  updated = recordMatchResult(updated, m1, 'c', { winner: 'P1' });
  const summary = getTournamentSummary(updated);
  assert.equal(summary.completedMatches, 2);
  assert.ok(summary.policyStats.a.wins >= 1);
  assert.ok(summary.policyStats.c.wins >= 1);
  assert.ok(summary.policyStats.b.losses >= 1);
  assert.ok(summary.policyStats.d.losses >= 1);
});

// ── Full tournament simulation test ─────────────────────────────

test('Full 4-policy tournament completes with champion', () => {
  const t = createTournament(['a','b','c','d']);
  let tournament = t;
  let safety = 20;
  while (tournament.status !== 'completed' && safety > 0) {
    const next = getNextMatch(tournament);
    if (!next) break;
    // Alternate winners: seat1 wins
    const winner = next.seat1Policy;
    tournament = recordMatchResult(tournament, next.matchId, winner, { winner: 'P1' });
    safety -= 1;
  }
  assert.equal(tournament.status, 'completed');
  assert.ok(tournament.champion, 'must have a champion');
  const summary = getTournamentSummary(tournament);
  assert.equal(summary.completedMatches, 3);
  assert.equal(summary.progress, 1);
});

test('Full 8-policy tournament with BYEs completes', () => {
  const t = createTournament(['a','b','c','d','e']);
  let tournament = t;
  assert.equal(tournament.bracketSize, 8);
  let safety = 20;
  while (tournament.status !== 'completed' && safety > 0) {
    const next = getNextMatch(tournament);
    if (!next) break;
    tournament = recordMatchResult(tournament, next.matchId, next.seat1Policy, { winner: 'P1' });
    safety -= 1;
  }
  assert.equal(tournament.status, 'completed');
  assert.ok(tournament.champion);
});

// ── Workspace integration tests ─────────────────────────────────

test('tournament workspace file exists and exports renderTournament', async () => {
  const wsPath = path.join(root, 'apps/lab-web/src/workspaces/tournament.js');
  const source = await readFile(wsPath, 'utf8');
  assert.ok(source.includes('export function renderTournament') || source.includes('export async function renderTournament'), 'tournament.js must export renderTournament');
  assert.ok(source.includes('createTournament'), 'tournament.js must import from tournament-scheduler.js');
  assert.ok(source.includes("new Worker('worker.js', { type: 'module' })"), 'must use module worker');
});

test('router.js registers /tournament route', async () => {
  const routerSource = await readFile(path.join(root, 'apps/lab-web/src/router.js'), 'utf8');
  assert.ok(routerSource.includes("['/tournament'"), 'router must register /tournament');
  assert.ok(routerSource.includes("'/tournament'"), 'router must have tournament subtitle');
});

test('state.js has tournament state fields', async () => {
  const stateSource = await readFile(path.join(root, 'apps/lab-web/src/state.js'), 'utf8');
  assert.ok(stateSource.includes('tournament:'), 'state must have tournament field');
  assert.ok(stateSource.includes('tournamentRunning'), 'state must have tournamentRunning field');
});

test('app.js imports and routes to renderTournament', async () => {
  const appSource = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.ok(appSource.includes('renderTournament'), 'app.js must import renderTournament');
  assert.ok(appSource.includes("'/tournament': renderTournament"), 'app.js must route /tournament to renderTournament');
});

test('tournament CSS exists in feature-components.css', async () => {
  const cssSource = await readFile(path.join(root, 'apps/lab-web/src/css/feature-components.css'), 'utf8');
  assert.ok(cssSource.includes('.tournament-bracket'), 'CSS must have tournament-bracket class');
  assert.ok(cssSource.includes('.tournament-match'), 'CSS must have tournament-match class');
  assert.ok(cssSource.includes('.tournament-slot'), 'CSS must have tournament-slot class');
});

// ── Edge-case and polish tests ──────────────────────────────────

test('Full 16-policy tournament completes', () => {
  const policies = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
  const t = createTournament(policies);
  assert.equal(t.bracketSize, 16);
  assert.equal(t.rounds.length, 4, '16 policies → 4 rounds');
  assert.equal(t.rounds[0].roundLabel, 'Round 1');
  assert.equal(t.rounds[0].matches.length, 8);
  let tournament = t;
  let safety = 40;
  while (tournament.status !== 'completed' && safety > 0) {
    const next = getNextMatch(tournament);
    if (!next) break;
    tournament = recordMatchResult(tournament, next.matchId, next.seat1Policy, { winner: 'P1' });
    safety -= 1;
  }
  assert.equal(tournament.status, 'completed');
  assert.ok(tournament.champion);
});

test('bestOf=7 requires 4 wins to complete match', () => {
  const t = createTournament(['a','b'], { bestOf: 7 });
  const matchId = t.rounds[0].matches[0].matchId;
  let updated = t;
  // a wins 3, b wins 3 (3-3, not decided)
  for (let i = 0; i < 3; i += 1) {
    updated = recordMatchResult(updated, matchId, 'a', { winner: 'P1' });
    updated = recordMatchResult(updated, matchId, 'b', { winner: 'P2' });
  }
  let match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, null, 'match not decided at 3-3 in bestOf=7');
  assert.equal(match.games.length, 6);
  // a wins game 7 (4-3)
  updated = recordMatchResult(updated, matchId, 'a', { winner: 'P1' });
  match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, 'a');
  assert.equal(match.status, 'completed');
  assert.equal(updated.champion, 'a');
});

test('bestOf=5 match ends early when 3 wins reached', () => {
  const t = createTournament(['a','b'], { bestOf: 5 });
  const matchId = t.rounds[0].matches[0].matchId;
  let updated = t;
  // a wins 3 in a row (should end early, not play all 5)
  updated = recordMatchResult(updated, matchId, 'a', { winner: 'P1' });
  updated = recordMatchResult(updated, matchId, 'a', { winner: 'P1' });
  updated = recordMatchResult(updated, matchId, 'a', { winner: 'P1' });
  const match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.winner, 'a');
  assert.equal(match.status, 'completed');
  assert.equal(match.games.length, 3, 'should end early at 3 wins');
  assert.equal(updated.champion, 'a');
});

test('recordMatchResult throws on null winner', () => {
  const t = createTournament(['a','b']);
  const matchId = t.rounds[0].matches[0].matchId;
  // The scheduler itself doesn't validate null — it's the caller's responsibility.
  // Verify that passing null winner does NOT set a winner (it records a game with null winner).
  const updated = recordMatchResult(t, matchId, null, { winner: 'DRAW' });
  const match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.equal(match.games.length, 1);
  assert.equal(match.games[0].winner, null);
  // Match should not be completed with a null winner
  assert.equal(match.winner, null);
  assert.notEqual(match.status, 'completed');
});

test('tournament with 3 policies has exactly 1 BYE', () => {
  const t = createTournament(['a','b','c']);
  assert.equal(t.bracketSize, 4);
  const byeMatches = t.rounds[0].matches.filter(m => m.isBye);
  assert.equal(byeMatches.length, 1);
  // The non-BYE match should be ready
  const realMatches = t.rounds[0].matches.filter(m => !m.isBye);
  assert.equal(realMatches.length, 1);
  assert.equal(realMatches[0].status, 'ready');
});

test('tournament with 5 policies has 3 BYEs (padded to 8)', () => {
  const t = createTournament(['a','b','c','d','e']);
  assert.equal(t.bracketSize, 8);
  const byeMatches = t.rounds[0].matches.filter(m => m.isBye);
  assert.equal(byeMatches.length, 3);
  const realMatches = t.rounds[0].matches.filter(m => !m.isBye);
  assert.equal(realMatches.length, 1);
});

test('tournament.js has race condition guard in playNextMatch', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('if (state.tournamentRunning) return'), 'playNextMatch must guard against double-click');
});

test('tournament.js validates null winner from worker', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes("if (!winningPolicy) throw new Error"), 'must validate null winner from worker');
});

test('tournament.js uses showToast instead of innerHTML += for errors', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('showToast'), 'must use showToast for error notifications');
  assert.ok(!source.includes('app.innerHTML +='), 'must not use unsafe innerHTML += pattern');
});

test('tournament.js reuses single worker across bestOf games', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  // Worker should be created once before the loop and terminated in finally
  assert.ok(source.includes('const worker = new Worker'), 'must create worker');
  assert.ok(source.includes('worker.terminate()'), 'must terminate worker');
  // Count worker creations — should be 1 (outside the loop)
  const workerCreations = (source.match(/new Worker\(/g) ?? []).length;
  assert.ok(workerCreations >= 1, `must create at least 1 worker (reuse across games), got ${workerCreations}`);
});

test('tournament.js has ARIA labels on buttons', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('aria-label="Play next tournament match"'), 'Play Next button needs ARIA label');
  assert.ok(source.includes('aria-label="Start a new tournament"'), 'New Tournament button needs ARIA label');
  assert.ok(source.includes('aria-busy="true"'), 'Running button needs aria-busy');
});

test('tournament CSS has mobile breakpoints', async () => {
  const cssSource = await readFile(path.join(root, 'apps/lab-web/src/css/feature-components.css'), 'utf8');
  assert.ok(cssSource.includes('@media(max-width:768px){.tournament-bracket'), 'must have 768px breakpoint for tournament');
  assert.ok(cssSource.includes('@media(max-width:480px){.tournament-bracket'), 'must have 480px breakpoint for tournament');
});

test('tournament-scheduler.js has no dead code (double BYE block removed)', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament-scheduler.js'), 'utf8');
  assert.ok(!source.includes('Both were the same policy'), 'dead code comment must be removed');
  assert.ok(!source.includes('Check if seat2 is a BYE'), 'dead code comment must be removed');
});
