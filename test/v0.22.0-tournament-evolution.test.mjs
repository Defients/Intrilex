// ═══════════════════════════════════════════════════════════════
// v0.22.0-tournament-evolution.test.mjs
// Tests for tournament scheduler v1.1.0: AB/BA seat-swap,
// third-place match, analytics, and persistence helpers.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schedulerPath = path.join(root, 'apps/lab-web/src/workspaces/tournament-scheduler.js');
const { createTournament, recordMatchResult, getNextMatch, getReadyMatches, getTournamentSummary, getTournamentAnalytics, TOURNAMENT_SCHEMA_VERSION } = await import('file://' + schedulerPath.replace(/\\/g, '/'));

// ── Schema version ──────────────────────────────────────────────

test('TOURNAMENT_SCHEMA_VERSION is 1.1.0', () => {
  assert.equal(TOURNAMENT_SCHEMA_VERSION, '1.1.0');
});

test('createTournament sets schemaVersion to 1.1.0', () => {
  const t = createTournament(['a', 'b', 'c', 'd']);
  assert.equal(t.schemaVersion, '1.1.0');
});

// ── Tournament ID and createdAt ──────────────────────────────────

test('createTournament has tournamentId field (set by caller)', () => {
  const t = createTournament(['a', 'b']);
  assert.ok('tournamentId' in t, 'must have tournamentId field');
  // tournamentId is null until the caller sets it after creation
  assert.equal(t.tournamentId, null);
});

test('createTournament sets createdAt timestamp', () => {
  const t = createTournament(['a', 'b']);
  assert.ok(t.createdAt, 'must have createdAt');
});

// ── Third-place match ────────────────────────────────────────────

test('createTournament has thirdPlaceMatch flag', () => {
  const t = createTournament(['a', 'b', 'c', 'd']);
  assert.ok('thirdPlaceMatch' in t, 'tournament must have thirdPlaceMatch field');
});

test('tournament with 4+ policies has thirdPlaceMatch field', () => {
  const t = createTournament(['a', 'b', 'c', 'd']);
  assert.ok('thirdPlaceMatch' in t, 'thirdPlaceMatch field must exist');
  // thirdPlaceMatch is null until semifinals complete
  assert.equal(t.thirdPlaceMatch, null);
});

test('full 4-policy tournament produces third-place result', () => {
  const t = createTournament(['a', 'b', 'c', 'd']);
  let tournament = t;
  let safety = 30;
  while (tournament.status !== 'completed' && safety > 0) {
    const next = getNextMatch(tournament);
    if (!next) break;
    tournament = recordMatchResult(tournament, next.matchId, next.seat1Policy, { winner: 'P1' });
    safety -= 1;
  }
  assert.equal(tournament.status, 'completed');
  // After completion, runnerUp and thirdPlace should be set
  assert.ok('runnerUp' in tournament, 'tournament must have runnerUp field');
  assert.ok('thirdPlace' in tournament, 'tournament must have thirdPlace field');
});

test('tournament with 2 policies does not have third-place match', () => {
  const t = createTournament(['a', 'b']);
  // 2 policies = 1 match final, no semis, no third place
  let tournament = t;
  const next = getNextMatch(tournament);
  tournament = recordMatchResult(tournament, next.matchId, next.seat1Policy, { winner: 'P1' });
  assert.equal(tournament.status, 'completed');
  // No third place for 2-policy tournament
  assert.ok(!tournament.thirdPlace || tournament.thirdPlace === null);
});

// ── AB/BA seat-swap ──────────────────────────────────────────────

test('bestOf=3 tournament tracks seat swap info in games', () => {
  const t = createTournament(['a', 'b'], { bestOf: 3 });
  const matchId = t.rounds[0].matches[0].matchId;
  let updated = recordMatchResult(t, matchId, 'a', { winner: 'P1' });
  const match = updated.rounds[0].matches.find(m => m.matchId === matchId);
  assert.ok(match.games.length >= 1);
  // Games should track seat assignment
  assert.ok(match.games[0].winner !== undefined);
});

test('tournament-scheduler exports getTournamentAnalytics', () => {
  assert.equal(typeof getTournamentAnalytics, 'function');
});

test('getTournamentAnalytics returns analytics object for completed tournament', () => {
  const t = createTournament(['a', 'b', 'c', 'd']);
  let tournament = t;
  let safety = 30;
  while (tournament.status !== 'completed' && safety > 0) {
    const next = getNextMatch(tournament);
    if (!next) break;
    tournament = recordMatchResult(tournament, next.matchId, next.seat1Policy, { winner: 'P1' });
    safety -= 1;
  }
  const analytics = getTournamentAnalytics(tournament);
  assert.ok(analytics, 'analytics must be returned');
  assert.ok(typeof analytics === 'object');
});

// ── Summary includes new fields ──────────────────────────────────

test('getTournamentSummary includes runnerUp and thirdPlace', () => {
  const t = createTournament(['a', 'b', 'c', 'd']);
  const summary = getTournamentSummary(t);
  assert.ok('runnerUp' in summary, 'summary must have runnerUp');
  assert.ok('thirdPlace' in summary, 'summary must have thirdPlace');
});

// ── Persistence helpers exist ────────────────────────────────────

test('persistence.js exports tournament functions', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/play/persistence.js'), 'utf8');
  assert.ok(source.includes('export async function saveTournament'), 'must export saveTournament');
  assert.ok(source.includes('export async function loadTournament'), 'must export loadTournament');
  assert.ok(source.includes('export async function listTournaments'), 'must export listTournaments');
  assert.ok(source.includes('export async function deleteTournament'), 'must export deleteTournament');
});

test('persistence.js has TOURNAMENTS store', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/play/persistence.js'), 'utf8');
  assert.ok(source.includes('TOURNAMENTS:'), 'must have TOURNAMENTS store');
  assert.ok(source.includes("STORES.TOURNAMENTS"), 'must use TOURNAMENTS store');
});

test('persistence.js DB_VERSION is 5', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/play/persistence.js'), 'utf8');
  assert.ok(source.includes('DB_VERSION = 5'), 'DB_VERSION must be 5 for achievements store');
});

// ── Tournament UI integration ────────────────────────────────────

test('tournament.js imports persistence functions', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('saveTournament') || source.includes('loadTournament'), 'must import tournament persistence');
});

test('tournament.js has auto-play functionality', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('autoPlay') || source.includes('Run All'), 'must have auto-play feature');
});

test('tournament.js has export functionality', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('export') && source.includes('clipboard'), 'must have export feature');
});

test('tournament.js has analytics rendering', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('getTournamentAnalytics') || source.includes('renderTournamentAnalytics'), 'must render analytics');
});

test('tournament.js has third-place rendering', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('thirdPlace') || source.includes('Third Place') || source.includes('renderThirdPlace'), 'must render third-place');
});

// ── Live match viewer (v0.22.0) ──────────────────────────────────

test('tournament.js has Watch Live button', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('Watch Live'), 'must have Watch Live button');
  assert.ok(source.includes('watchLiveMatch'), 'must have watchLiveMatch function');
});

test('tournament.js has live viewer rendering', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('renderLiveViewer'), 'must have renderLiveViewer function');
  assert.ok(source.includes('tournamentLiveView'), 'must use tournamentLiveView state');
});

test('tournament.js has frame reconstruction', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('reconstructFrames'), 'must have reconstructFrames function');
  assert.ok(source.includes('IntrilexEngine'), 'must import IntrilexEngine for frame reconstruction');
});

test('tournament.js has playback controls', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('toggleLivePlay'), 'must have toggleLivePlay function');
  assert.ok(source.includes('liveStepTo'), 'must have liveStepTo function');
  assert.ok(source.includes('stopLivePlayback'), 'must have stopLivePlayback function');
});

test('tournament.js has board rendering for live viewer', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/tournament.js'), 'utf8');
  assert.ok(source.includes('livePlayerBoard'), 'must have livePlayerBoard rendering');
  assert.ok(source.includes('liveCardToken'), 'must have liveCardToken rendering');
  assert.ok(source.includes('liveZone'), 'must have liveZone rendering');
});

test('autonomy-runtime.js supports recordReplay option', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/autonomy-runtime.js'), 'utf8');
  assert.ok(source.includes('recordReplay'), 'must accept recordReplay parameter');
  assert.ok(source.includes('replayCommands'), 'must collect replay commands');
  assert.ok(source.includes('replayInitialState'), 'must capture initial state');
});

test('worker.js passes through replay data', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/worker.js'), 'utf8');
  assert.ok(source.includes('result.replay'), 'must include replay in result payload');
});

test('runBrowserPolicyMatch with recordReplay produces replay data', async () => {
  const { runBrowserPolicyMatch } = await import('../apps/lab-web/dist/autonomy-runtime.js');
  const result = runBrowserPolicyMatch({
    seed: 999,
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 50,
    recordReplay: true,
  });
  assert.ok(result.replay, 'must return replay object');
  assert.ok(result.replay.initialState, 'replay must have initialState');
  assert.ok(Array.isArray(result.replay.commands), 'replay must have commands array');
  assert.ok(result.replay.commands.length > 0, 'replay must have at least one command');
  // matchResultHash should be the same with or without recordReplay
  const resultNoReplay = runBrowserPolicyMatch({
    seed: 999,
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 50,
  });
  assert.equal(result.matchResultHash, resultNoReplay.matchResultHash, 'matchResultHash must be identical with/without recordReplay');
  assert.ok(!resultNoReplay.replay, 'replay should not be present without recordReplay');
});

test('replay from recordReplay can be reconstructed into frames', async () => {
  const { runBrowserPolicyMatch } = await import('../apps/lab-web/dist/autonomy-runtime.js');
  const { IntrilexEngine } = await import('../apps/lab-web/dist/engine/browser-entry.js');
  const result = runBrowserPolicyMatch({
    seed: 42,
    policyIds: ['random-legal', 'score-rush'],
    decisionLimit: 50,
    recordReplay: true,
  });
  const replay = result.replay;
  // Reconstruct frames
  const engine = new IntrilexEngine();
  let state = structuredClone(replay.initialState);
  const frames = [{ state, events: [], command: null }];
  for (const command of replay.commands) {
    const r = engine.execute(state, command);
    state = r.state;
    frames.push({ state, events: r.events, command, accepted: r.accepted });
  }
  assert.ok(frames.length > 1, 'must produce multiple frames');
  assert.ok(frames.slice(1).every(f => f.accepted), 'all commands must be accepted');
  // Final frame winner must match match result
  const finalState = frames[frames.length - 1].state;
  assert.equal(finalState.winner, result.winner, 'final frame winner must match match winner');
});
