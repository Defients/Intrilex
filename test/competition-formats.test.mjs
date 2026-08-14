// ═══════════════════════════════════════════════════════════════
// competition-formats.test.mjs — Epoch 5 competition format tests
//
// Tests the season archive UI, season archive route, and the
// tournament domain module (pure functions for bracket generation,
// player registration, match results, and champion determination).
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  validateTournamentFormat,
  validateBestOf,
  nextPowerOfTwo,
  countByes,
  generateSingleElimBracket,
  singleElimRoundCount,
  swissRoundCount,
  createTournament,
  registerPlayer,
  startTournament,
  recordTournamentResult,
  getChampion,
  getSwissStandings,
} from '@intrilex/account-domain/tournament-domain';

const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const seasonArchiveSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/season-archive.js'), 'utf8');
const profileSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
const seoSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/seo-metadata.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');
const indexSrc = readFileSync(join(process.cwd(), 'packages/account-domain/src/index.mjs'), 'utf8');

// ── Tournament domain: validation ──

test('Tournament: validateTournamentFormat accepts valid formats', () => {
  assert.equal(validateTournamentFormat('SINGLE_ELIM'), 'SINGLE_ELIM');
  assert.equal(validateTournamentFormat('SWISS'), 'SWISS');
});

test('Tournament: validateTournamentFormat rejects invalid formats', () => {
  assert.equal(validateTournamentFormat('ROUND_ROBIN'), null);
  assert.equal(validateTournamentFormat(null), null);
  assert.equal(validateTournamentFormat(''), null);
});

test('Tournament: validateBestOf forces odd numbers', () => {
  assert.equal(validateBestOf(1), 1);
  assert.equal(validateBestOf(2), 3); // 2 → 3
  assert.equal(validateBestOf(3), 3);
  assert.equal(validateBestOf(4), 5); // 4 → 5
  assert.equal(validateBestOf(5), 5);
  assert.equal(validateBestOf(0), 1); // invalid → default
  assert.equal(validateBestOf(9), 1); // > 7 → default
});

// ── Tournament domain: bracket math ──

test('Tournament: nextPowerOfTwo', () => {
  assert.equal(nextPowerOfTwo(1), 1);
  assert.equal(nextPowerOfTwo(2), 2);
  assert.equal(nextPowerOfTwo(3), 4);
  assert.equal(nextPowerOfTwo(5), 8);
  assert.equal(nextPowerOfTwo(8), 8);
  assert.equal(nextPowerOfTwo(16), 16);
});

test('Tournament: countByes', () => {
  assert.equal(countByes(2), 0);
  assert.equal(countByes(3), 1); // bracket=4, byes=1
  assert.equal(countByes(5), 3); // bracket=8, byes=3
  assert.equal(countByes(8), 0);
  assert.equal(countByes(7), 1); // bracket=8, byes=1
});

test('Tournament: singleElimRoundCount', () => {
  assert.equal(singleElimRoundCount(2), 1);
  assert.equal(singleElimRoundCount(4), 2);
  assert.equal(singleElimRoundCount(8), 3);
  assert.equal(singleElimRoundCount(16), 4);
  assert.equal(singleElimRoundCount(6), 3); // bracket=8 → 3 rounds
});

test('Tournament: swissRoundCount', () => {
  assert.equal(swissRoundCount(2), 3); // min 3
  assert.equal(swissRoundCount(8), 3);
  assert.equal(swissRoundCount(16), 4);
  assert.equal(swissRoundCount(32), 5);
  assert.equal(swissRoundCount(256), 8); // capped at 8
});

// ── Tournament domain: createTournament ──

test('Tournament: createTournament defaults', () => {
  const t = createTournament({ name: 'Test Cup' });
  assert.equal(t.name, 'Test Cup');
  assert.equal(t.format, 'SINGLE_ELIM');
  assert.equal(t.bestOf, 1);
  assert.equal(t.maxPlayers, 16);
  assert.equal(t.status, 'SCHEDULED');
  assert.equal(t.players.length, 0);
  assert.equal(t.matches.length, 0);
  assert.ok(t.tournamentId.startsWith('TR_'));
});

test('Tournament: createTournament Swiss format sets swissRounds', () => {
  const t = createTournament({ name: 'Swiss Cup', format: 'SWISS', maxPlayers: 16 });
  assert.equal(t.format, 'SWISS');
  assert.equal(t.swissRounds, 4); // log2(16) = 4
});

// ── Tournament domain: registration ──

test('Tournament: registerPlayer adds player with seed', () => {
  let t = createTournament({ name: 'Cup', maxPlayers: 8 });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice', handle: 'alice' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_B', displayName: 'Bob', handle: 'bob' });
  assert.equal(t.players.length, 2);
  assert.equal(t.players[0].seed, 1);
  assert.equal(t.players[1].seed, 2);
  assert.equal(t.status, 'REGISTRATION');
});

test('Tournament: registerPlayer rejects duplicates', () => {
  let t = createTournament({ name: 'Cup', maxPlayers: 8 });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' });
  assert.throws(() => registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' }));
});

test('Tournament: registerPlayer rejects when full', () => {
  let t = createTournament({ name: 'Cup', maxPlayers: 2 });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_B', displayName: 'Bob' });
  assert.throws(() => registerPlayer(t, { publicPlayerId: 'PLY_C', displayName: 'Charlie' }));
});

// ── Tournament domain: startTournament + bracket generation ──

test('Tournament: startTournament generates single-elim bracket', () => {
  let t = createTournament({ name: 'Cup', format: 'SINGLE_ELIM', maxPlayers: 8 });
  for (let i = 0; i < 4; i++) {
    t = registerPlayer(t, { publicPlayerId: `PLY_${i}`, displayName: `Player ${i}` });
  }
  t = startTournament(t);
  assert.equal(t.status, 'IN_PROGRESS');
  assert.ok(t.matches.length > 0);
  assert.ok(t.startedAt);
  // 4 players → bracket size 4 → 2 first-round matches
  assert.equal(t.matches.length, 2);
});

test('Tournament: startTournament with 5 players gives 3 BYEs', () => {
  let t = createTournament({ name: 'Cup', format: 'SINGLE_ELIM', maxPlayers: 8 });
  for (let i = 0; i < 5; i++) {
    t = registerPlayer(t, { publicPlayerId: `PLY_${i}`, displayName: `Player ${i}` });
  }
  t = startTournament(t);
  const byes = t.matches.filter(m => m.status === 'BYE');
  assert.equal(byes.length, 3); // bracket=8, 5 players, 3 BYEs
});

test('Tournament: startTournament requires REGISTRATION status', () => {
  const t = createTournament({ name: 'Cup' });
  assert.throws(() => startTournament(t));
});

test('Tournament: startTournament requires 2+ players', () => {
  let t = createTournament({ name: 'Cup' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' });
  // Still SCHEDULED → throws
  assert.throws(() => startTournament(t));
});

// ── Tournament domain: match results + champion ──

test('Tournament: recordTournamentResult and getChampion', () => {
  let t = createTournament({ name: 'Cup', format: 'SINGLE_ELIM', maxPlayers: 4 });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_B', displayName: 'Bob' });
  t = startTournament(t);
  // 2 players → 1 match
  assert.equal(t.matches.length, 1);
  const match = t.matches[0];
  t = recordTournamentResult(t, match.matchId, 'PLY_A', 1, 0, 'replay-123');
  assert.equal(t.status, 'COMPLETED');
  const champ = getChampion(t);
  assert.ok(champ);
  assert.equal(champ.publicPlayerId, 'PLY_A');
});

test('Tournament: recordTournamentResult rejects completed matches', () => {
  let t = createTournament({ name: 'Cup', maxPlayers: 4 });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_B', displayName: 'Bob' });
  t = startTournament(t);
  const match = t.matches[0];
  t = recordTournamentResult(t, match.matchId, 'PLY_A', 1, 0);
  assert.throws(() => recordTournamentResult(t, match.matchId, 'PLY_B', 0, 1));
});

// ── Tournament domain: Swiss standings ──

test('Tournament: getSwissStandings sorts by wins', () => {
  let t = createTournament({ name: 'Swiss', format: 'SWISS', maxPlayers: 4 });
  t = registerPlayer(t, { publicPlayerId: 'PLY_A', displayName: 'Alice' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_B', displayName: 'Bob' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_C', displayName: 'Charlie' });
  t = registerPlayer(t, { publicPlayerId: 'PLY_D', displayName: 'Diana' });
  t = startTournament(t);
  // Round 1: A vs B, C vs D
  const matches = t.matches.filter(m => m.status === 'SCHEDULED');
  assert.equal(matches.length, 2);
  t = recordTournamentResult(t, matches[0].matchId, 'PLY_A', 1, 0);
  t = recordTournamentResult(t, matches[1].matchId, 'PLY_C', 1, 0);
  const standings = getSwissStandings(t);
  assert.equal(standings[0].player.publicPlayerId, 'PLY_A');
  assert.equal(standings[0].wins, 1);
  assert.equal(standings[1].player.publicPlayerId, 'PLY_C');
  assert.equal(standings[1].wins, 1);
});

// ── Tournament domain: generateSingleElimBracket ──

test('Tournament: generateSingleElimBracket with 8 players → 4 matches, 0 BYEs', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    publicPlayerId: `PLY_${i}`, displayName: `P${i}`, seed: i + 1,
  }));
  const matches = generateSingleElimBracket(players, 1);
  assert.equal(matches.length, 4);
  assert.equal(matches.filter(m => m.status === 'BYE').length, 0);
});

test('Tournament: generateSingleElimBracket with 2 players → 1 match', () => {
  const players = [
    { publicPlayerId: 'PLY_1', displayName: 'A', seed: 1 },
    { publicPlayerId: 'PLY_2', displayName: 'B', seed: 2 },
  ];
  const matches = generateSingleElimBracket(players, 3);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, 'SCHEDULED');
});

// ── Domain exports ──

test('Domain: tournament functions exported from index', () => {
  assert.ok(indexSrc.includes('TournamentFormat'), 'index.mjs must export TournamentFormat');
  assert.ok(indexSrc.includes('createTournament'), 'index.mjs must export createTournament');
  assert.ok(indexSrc.includes('getChampion'), 'index.mjs must export getChampion');
  assert.ok(indexSrc.includes('getSwissStandings'), 'index.mjs must export getSwissStandings');
});

// ── Season Archive: route + UI ──

test('Router: /seasons is in LANDING_MODES', () => {
  assert.ok(routerSrc.includes("'/seasons'"), 'Router must include /seasons in LANDING_MODES');
});

test('App: /seasons route handler exists', () => {
  assert.ok(appSrc.includes("r === '/seasons'"), 'App must handle /seasons route');
  assert.ok(appSrc.includes('renderSeasonArchive'), 'App must call renderSeasonArchive');
});

test('SeasonArchive: workspace module exists with render function', () => {
  assert.ok(seasonArchiveSrc.includes('export async function renderSeasonArchive'), 'Must export renderSeasonArchive');
  assert.ok(seasonArchiveSrc.includes('data-testid="season-archive-panel"'), 'Must have panel testid');
  assert.ok(seasonArchiveSrc.includes('data-testid="season-archive-card"'), 'Must have card testid');
});

test('SeasonArchive: uses fetchSeasons from leaderboard-data', () => {
  assert.ok(seasonArchiveSrc.includes('fetchSeasons'), 'Must use fetchSeasons');
  assert.ok(seasonArchiveSrc.includes('SeasonStatus'), 'Must use SeasonStatus for badges');
});

test('SeasonArchive: handles offline mode', () => {
  assert.ok(seasonArchiveSrc.includes('isSupabaseConfigured'), 'Must check Supabase config');
  assert.ok(seasonArchiveSrc.includes('season-archive-offline'), 'Must have offline state');
});

test('SeasonArchive: handles empty state', () => {
  assert.ok(seasonArchiveSrc.includes('season-archive-empty'), 'Must have empty state');
});

test('SeasonArchive: links to leaderboard for each season', () => {
  assert.ok(seasonArchiveSrc.includes('#/leaderboard'), 'Must link to leaderboard');
  assert.ok(seasonArchiveSrc.includes('data-season-id'), 'Must pass season ID');
});

// ── Profile: season archive link ──

test('Profile: season history links to season archive', () => {
  assert.ok(
    profileSrc.includes('data-testid="profile-season-archive-link"'),
    'Profile season history must have archive link'
  );
  assert.ok(
    profileSrc.includes('#/seasons'),
    'Profile must link to #/seasons'
  );
});

// ── SEO ──

test('SEO: /seasons page has metadata', () => {
  assert.ok(seoSrc.includes("'/seasons'"), 'SEO metadata must include /seasons route');
  assert.ok(seoSrc.includes('Season Archive'), 'SEO metadata must mention Season Archive');
});

// ── CSS ──

test('CSS: season archive styles exist', () => {
  assert.ok(cssSrc.includes('.season-archive-panel'), 'CSS must have .season-archive-panel');
  assert.ok(cssSrc.includes('.season-archive-card'), 'CSS must have .season-archive-card');
  assert.ok(cssSrc.includes('.season-archive-active'), 'CSS must have .season-archive-active badge');
  assert.ok(cssSrc.includes('.season-archive-archived'), 'CSS must have .season-archive-archived badge');
});
