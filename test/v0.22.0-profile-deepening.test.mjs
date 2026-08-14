// ═══════════════════════════════════════════════════════════════
// v0.22.0-profile-deepening.test.mjs
// Tests for local profile v1.1.0: complete AI ratings, new badges,
// rating history, match history expansion, and profile workspace.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'apps/lab-web/src/play/local-profile.mjs');
const { loadProfile, saveProfile, recordVerifiedResult, isStorageAvailable } = await import('file://' + profilePath.replace(/\\/g, '/'));

// ── Schema version ──────────────────────────────────────────────

test('local-profile SCHEMA_VERSION is 1.1.0', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("SCHEMA_VERSION = '1.1.0'"), 'schema version must be 1.1.0');
});

test('DEFAULT_PROFILE has ratingHistory field', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes('ratingHistory'), 'must have ratingHistory in default profile');
});

test('DEFAULT_PROFILE has archetypeBreakdown field', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes('archetypeBreakdown'), 'must have archetypeBreakdown in default profile');
});

// ── AI ratings completeness ──────────────────────────────────────

test('getAiRating covers all baseline policies', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("'random-legal':"), 'must rate random-legal');
  assert.ok(source.includes("'score-rush':"), 'must rate score-rush');
  assert.ok(source.includes("'control':"), 'must rate control');
  assert.ok(source.includes("'tempo':"), 'must rate tempo');
  assert.ok(source.includes("'value':"), 'must rate value');
});

test('getAiRating covers HYBIX normal policies', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("'hybrix-rusher':"), 'must rate hybrix-rusher');
  assert.ok(source.includes("'hybrix-defender':"), 'must rate hybrix-defender');
  assert.ok(source.includes("'hybrix-trickster':"), 'must rate hybrix-trickster');
  assert.ok(source.includes("'hybrix-sniper':"), 'must rate hybrix-sniper');
  assert.ok(source.includes("'hybrix-support':"), 'must rate hybrix-support');
  assert.ok(source.includes("'hybrix-tank':"), 'must rate hybrix-tank');
  assert.ok(source.includes("'hybrix-baseline':"), 'must rate hybrix-baseline');
});

test('getAiRating covers HYBIX difficulty variants', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("-hard':"), 'must rate hard difficulty variants');
  assert.ok(source.includes("-easy':"), 'must rate easy difficulty variants');
  assert.ok(source.includes("-nightmare':"), 'must rate nightmare difficulty variants');
});

// ── New badges ───────────────────────────────────────────────────

test('BADGE_DEFINITIONS includes tournament-champion badge', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("'tournament-champion'"), 'must have tournament-champion badge');
});

test('BADGE_DEFINITIONS includes bracket-buster badge', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("'bracket-buster'"), 'must have bracket-buster badge');
});

test('BADGE_DEFINITIONS includes tactician badge', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes("'tactician'"), 'must have tactician badge');
});

// ── Rating history tracking ──────────────────────────────────────

test('recordVerifiedResult tracks rating history', () => {
  // We can't use localStorage in Node, but we can test the function logic
  // by constructing a profile manually and calling the function
  const profile = {
    schemaVersion: '1.1.0',
    displayName: 'Test',
    rating: { scope: 'LOCAL_AI', value: 1200, provisional: true, ratedMatches: 0 },
    badges: [],
    record: { wins: 0, losses: 0, draws: 0 },
    verifiedResults: [],
    streakData: { currentStreak: 0, bestStreak: 0, lastResult: null },
    ratingHistory: [],
    archetypeBreakdown: {},
  };

  // Mock saveProfile to prevent localStorage access
  const result = recordVerifiedResult(profile, {
    sessionId: 'test-1',
    terminalHash: 'abc123',
    outcome: 'win',
    aiPolicyId: 'hybrix-rusher',
    aiDifficulty: 'normal',
    aiArchetype: 'rusher',
  });

  assert.ok(result.profile.ratingHistory.length >= 1, 'rating history must have at least 1 entry');
  const entry = result.profile.ratingHistory[0];
  assert.ok(entry.rating, 'history entry must have rating');
  assert.ok(entry.delta !== undefined, 'history entry must have delta');
  assert.ok(entry.opponent, 'history entry must have opponent');
  assert.equal(entry.outcome, 'win');
});

test('rating history entries include timestamp and opponent', () => {
  const profile = {
    schemaVersion: '1.1.0',
    displayName: 'Test',
    rating: { scope: 'LOCAL_AI', value: 1200, provisional: true, ratedMatches: 0 },
    badges: [],
    record: { wins: 0, losses: 0, draws: 0 },
    verifiedResults: [],
    streakData: { currentStreak: 0, bestStreak: 0, lastResult: null },
    ratingHistory: [],
    archetypeBreakdown: {},
  };

  recordVerifiedResult(profile, {
    sessionId: 'test-2',
    terminalHash: 'def456',
    outcome: 'loss',
    aiPolicyId: 'hybrix-sniper-hard',
    aiDifficulty: 'hard',
    aiArchetype: 'sniper',
  });

  const entry = profile.ratingHistory[0];
  assert.ok(entry.timestamp, 'must have timestamp');
  assert.equal(entry.opponent, 'hybrix-sniper-hard');
  assert.equal(entry.outcome, 'loss');
});

// ── Archetype breakdown ──────────────────────────────────────────

test('recordVerifiedResult tracks archetype breakdown', () => {
  const profile = {
    schemaVersion: '1.1.0',
    displayName: 'Test',
    rating: { scope: 'LOCAL_AI', value: 1200, provisional: true, ratedMatches: 0 },
    badges: [],
    record: { wins: 0, losses: 0, draws: 0 },
    verifiedResults: [],
    streakData: { currentStreak: 0, bestStreak: 0, lastResult: null },
    ratingHistory: [],
    archetypeBreakdown: {},
  };

  recordVerifiedResult(profile, {
    sessionId: 'test-3',
    terminalHash: 'ghi789',
    outcome: 'win',
    aiPolicyId: 'hybrix-rusher',
    aiDifficulty: 'normal',
    aiArchetype: 'rusher',
  });

  assert.ok(profile.archetypeBreakdown.rusher, 'must have rusher archetype breakdown');
  assert.equal(profile.archetypeBreakdown.rusher.wins, 1);
});

// ── Match history expansion ──────────────────────────────────────

test('verifiedResults entries include aiDifficulty', () => {
  const profile = {
    schemaVersion: '1.1.0',
    displayName: 'Test',
    rating: { scope: 'LOCAL_AI', value: 1200, provisional: true, ratedMatches: 0 },
    badges: [],
    record: { wins: 0, losses: 0, draws: 0 },
    verifiedResults: [],
    streakData: { currentStreak: 0, bestStreak: 0, lastResult: null },
    ratingHistory: [],
    archetypeBreakdown: {},
  };

  recordVerifiedResult(profile, {
    sessionId: 'test-4',
    terminalHash: 'jkl012',
    outcome: 'win',
    aiPolicyId: 'hybrix-defender-hard',
    aiDifficulty: 'hard',
    aiArchetype: 'defender',
  });

  const entry = profile.verifiedResults[profile.verifiedResults.length - 1];
  assert.equal(entry.aiDifficulty, 'hard');
  assert.equal(entry.aiArchetype, 'defender');
  assert.ok(entry.ratingDelta !== undefined, 'must have ratingDelta');
});

// ── Migration ────────────────────────────────────────────────────

test('migrateProfile adds ratingHistory to old profiles', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes('if (!profile.ratingHistory)'), 'must migrate ratingHistory');
  assert.ok(source.includes('if (!profile.archetypeBreakdown)'), 'must migrate archetypeBreakdown');
});

test('migrateProfile enriches old verified results with difficulty', async () => {
  const source = await readFile(profilePath, 'utf8');
  assert.ok(source.includes('extractDifficulty'), 'must have extractDifficulty helper');
  assert.ok(source.includes('extractArchetype'), 'must have extractArchetype helper');
});

// ── Profile workspace ────────────────────────────────────────────

test('profile workspace file exists and exports renderProfile', async () => {
  const wsPath = path.join(root, 'apps/lab-web/src/workspaces/profile.js');
  const source = await readFile(wsPath, 'utf8');
  assert.ok(source.includes('export async function renderProfile'), 'profile.js must export renderProfile');
});

test('router.js registers /profile route', async () => {
  const routerSource = await readFile(path.join(root, 'apps/lab-web/src/router.js'), 'utf8');
  assert.ok(routerSource.includes("'/profile'"), 'router must register /profile');
});

test('app.js imports and routes to renderProfile', async () => {
  const appSource = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.ok(appSource.includes('renderProfile'), 'app.js must import renderProfile');
  assert.ok(appSource.includes("'/profile': renderProfile"), 'app.js must route /profile to renderProfile');
});

test('profile workspace renders rating chart', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  assert.ok(source.includes('renderRatingHistoryChart'), 'must have rating chart renderer');
  assert.ok(source.includes('svg'), 'must use SVG for chart');
});

test('profile workspace renders badge gallery', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  assert.ok(source.includes('renderShowcaseSection'), 'must have showcase section for badges');
});

// ── Profile Matches tab: replay download (Epoch 2) ──

test('profile workspace has replay download on match items', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  assert.ok(source.includes('download-match-replay'), 'match items must have replay download action');
  assert.ok(source.includes('wireMatchReplayButtons'), 'must wire replay download buttons');
  assert.ok(source.includes('getReplay'), 'must import getReplay from persistence');
  assert.ok(source.includes('downloadReplay'), 'must import downloadReplay from replay-library');
});

test('profile workspace replay download only for self (not public)', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  // renderMatchItem must accept isSelf and conditionally render the button
  assert.ok(source.includes('function renderMatchItem(m, isSelf)'), 'renderMatchItem must accept isSelf parameter');
  assert.ok(source.includes('isSelf && m.matchId'), 'replay button must be gated on isSelf && matchId');
});

test('profile workspace renders archetype breakdown', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  // Archetype breakdown was replaced by the ranked detail card in the v0.25
  // profile refactor. Verify the ranked tab has detail content.
  assert.ok(source.includes('renderRankedDetailCard'), 'must have ranked detail card');
});

test('profile workspace renders match history', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  assert.ok(source.includes('renderRecentMatches'), 'must have recent matches renderer');
  assert.ok(source.includes('renderMatchesTab'), 'must have matches tab renderer');
});
