import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  getCatalog,
  getCatalogById,
  getAllIds,
  getDefinition,
  validateCatalog,
  assertCatalogValid,
  LAUNCH_CONSTRAINTS,
  HIDDEN_ACHIEVEMENT_IDS,
  AP_BY_RARITY,
  RARITY,
  CATEGORY,
  PROGRESS_TYPE,
  ELIGIBILITY_SCOPE,
  createAchievementProfileState,
  createMatchTracker,
  createCareerTracker,
  createTrackers,
  serializeMatchTracker,
  deserializeMatchTracker,
  serializeCareerTracker,
  deserializeCareerTracker,
  deriveAchievementFacts,
  createCheckpointFact,
  reduceFacts,
  reduceFact,
  evaluateAchievements,
  applyUnlocks,
  computeTotalAP,
  countEarned,
  isEarned,
  isQualifyingMatch,
  isEligible,
  localVsAIContext,
  networkMatchContext,
  migrateLegacyData,
  isMigrated,
  FACT_KIND,
  ZONE,
  LAUNCH_ZONE_SET,
  CLEAN_SWEEP_ZONES,
  LAUNCH_SPADES_EFFECTS,
  CARD_MASTERY_ACHIEVEMENT_IDS,
  getProgress,
} from '../packages/achievements/src/index.mjs';

import { evaluateMatchAchievements } from '../packages/match-authority/src/achievement-projection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Catalog validation ──

test('BL-01: catalog has 56 achievements', () => {
  const catalog = getCatalog();
  assert.equal(catalog.length, LAUNCH_CONSTRAINTS.TOTAL_ACHIEVEMENTS);
});

test('BL-01: catalog validates against all launch constraints', () => {
  const result = validateCatalog();
  assert.equal(result.valid, true, `Catalog validation failed:\n${result.errors.join('\n')}`);
});

test('BL-01: assertCatalogValid does not throw', () => {
  assert.doesNotThrow(() => assertCatalogValid());
});

test('BL-01: rarity distribution matches launch constraints', () => {
  const counts = { COMMON: 0, CLEVER: 0, RARE: 0, INTRILEX: 0 };
  for (const def of getCatalog()) {
    counts[def.rarity]++;
  }
  assert.equal(counts.COMMON, LAUNCH_CONSTRAINTS.COMMON_COUNT);
  assert.equal(counts.CLEVER, LAUNCH_CONSTRAINTS.CLEVER_COUNT);
  assert.equal(counts.RARE, LAUNCH_CONSTRAINTS.RARE_COUNT);
  assert.equal(counts.INTRILEX, LAUNCH_CONSTRAINTS.INTRILEX_COUNT);
});

test('BL-01: hidden count and IDs are correct', () => {
  const catalog = getCatalog();
  const hidden = catalog.filter(d => d.hidden);
  assert.equal(hidden.length, LAUNCH_CONSTRAINTS.HIDDEN_COUNT);
  const ids = hidden.map(d => d.id).sort();
  const expected = [...HIDDEN_ACHIEVEMENT_IDS].sort();
  assert.deepEqual(ids, expected);
});

test('BL-01: total AP equals 1320', () => {
  const total = getCatalog().reduce((sum, d) => sum + d.achievementPoints, 0);
  assert.equal(total, LAUNCH_CONSTRAINTS.TOTAL_AP);
});

test('BL-01: all achievement IDs are unique', () => {
  const ids = getAllIds();
  assert.equal(new Set(ids).size, ids.length);
});

// ── Facts & projection ──

test('BL-02: fact projector maps CORE_CARD_SCORED to points play', () => {
  const facts = deriveAchievementFacts([
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 7 }, sequence: 1 },
  ], {
    matchId: 'M1',
    humanPlayerId: 'P1',
    stateCards: { C1: { id: 'C1', identity: '7♣' } },
  });
  assert.ok(facts.some(f => f.kind === FACT_KIND.CARD_PLAYED_FOR_POINTS));
});

test('BL-02: fact projector emits SEVEN_SCORING_TRIGGER_RESOLVED for seven points', () => {
  const facts = deriveAchievementFacts([
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ], {
    matchId: 'M1',
    humanPlayerId: 'P1',
    stateCards: { C1: { id: 'C1', identity: '7♦' } },
  });
  assert.ok(facts.some(f => f.kind === FACT_KIND.SEVEN_SCORING_TRIGGER_RESOLVED));
});

test('BL-02: fact projector marks non-human plays correctly', () => {
  const facts = deriveAchievementFacts([
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P2', cardId: 'C1', pointValue: 3 }, sequence: 1 },
  ], {
    matchId: 'M1',
    humanPlayerId: 'P1',
    stateCards: { C1: { id: 'C1', identity: '3♣' } },
  });
  const pointFact = facts.find(f => f.kind === FACT_KIND.CARD_PLAYED_FOR_POINTS);
  assert.equal(pointFact?.payload?.isHuman, false);
});

test('BL-02: fact idempotency: same fact processed once', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const fact = createCheckpointFact('M1', 'P1', {
    humanScore: 5, opponentScore: 3, humanHandCount: 5,
    opponentHandCount: 5, stackDepth: 0, fullTurnSequence: 1,
    stateRevision: 1, isTerminal: false, winner: null, isDraw: false,
  });
  reduceFact(tracker, career, fact);
  const s1 = tracker.humanScore;
  reduceFact(tracker, career, fact);
  assert.equal(tracker.humanScore, s1);
});

// ── Evaluator detection ──

test('BL-03: First Blood unlocks on human point play', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const facts = deriveAchievementFacts([
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ], { matchId: 'M1', humanPlayerId: 'P1', stateCards: { C1: { id: 'C1', identity: '5♣' } } });
  reduceFacts(tracker, career, facts);
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: false });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'first-blood'));
});

test('BL-03: Twenty-One unlocks on human win with 21+ points', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const facts = [
    createCheckpointFact('M1', 'P1', {
      humanScore: 21, opponentScore: 5, humanHandCount: 3,
      opponentHandCount: 5, stackDepth: 0, fullTurnSequence: 5,
      stateRevision: 10, isTerminal: true, winner: 'P1', isDraw: false,
    }),
  ];
  reduceFacts(tracker, career, facts);
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: false });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'twenty-one'));
});

test('BL-03: No Shovel Required unlocks on win without spades effects', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const facts = [
    createCheckpointFact('M1', 'P1', {
      humanScore: 21, opponentScore: 5, humanHandCount: 3,
      opponentHandCount: 5, stackDepth: 0, fullTurnSequence: 5,
      stateRevision: 10, isTerminal: true, winner: 'P1', isDraw: false,
    }),
  ];
  reduceFacts(tracker, career, facts);
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: false });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'no-shovel-required'));
});

test('BL-03: Overkill unlocks on human win with 30+ points', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const facts = [
    createCheckpointFact('M1', 'P1', {
      humanScore: 32, opponentScore: 10, humanHandCount: 2,
      opponentHandCount: 5, stackDepth: 0, fullTurnSequence: 8,
      stateRevision: 20, isTerminal: true, winner: 'P1', isDraw: false,
    }),
  ];
  reduceFacts(tracker, career, facts);
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: false });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'overkill'));
});

test('BL-03: progression counter updates but does not unlock before target', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  career.gamesWon = 2;
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: false });
  assert.ok(!result.newUnlocks.some(u => u.achievementId === 'no-longer-new'));
  assert.ok(result.progressUpdates['no-longer-new']);
  assert.equal(result.progressUpdates['no-longer-new'].current, 2);
  assert.equal(result.progressUpdates['no-longer-new'].completed, false);
});

test('BL-03: counter unlocks at target', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  career.gamesWon = 5;
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: false });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'no-longer-new'));
  assert.ok(result.progressUpdates['no-longer-new'].completed);
});

// ── Eligibility ──

test('BL-04: COMPETITIVE_ONLY achievements do not unlock in tutorial', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  career.gamesWon = 5;
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: true });
  assert.ok(!result.newUnlocks.some(u => u.achievementId === 'no-longer-new'));
});

test('BL-04: TUTORIAL_ALLOWED achievements unlock in tutorial', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const facts = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ];
  reduceFacts(tracker, career, deriveAchievementFacts(facts, {
    matchId: 'M1', humanPlayerId: 'P1', stateCards: { C1: { id: 'C1', identity: '5♣' } },
  }));
  const profile = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profile, { matchId: 'M1', isTutorial: true });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'first-blood'));
});

test('BL-04: non-qualifying contexts are ineligible', () => {
  assert.ok(!isQualifyingMatch({ isSimulation: true }));
  assert.ok(!isQualifyingMatch({ isReplayPlayback: true }));
  assert.ok(!isQualifyingMatch({ isSpectator: true }));
  assert.ok(!isQualifyingMatch({ isAiVsAi: true }));
});

// ── Persistence and migration ──

test('BL-05: career tracker serializes and deserializes', () => {
  const career = createCareerTracker();
  career.gamesWon = 12;
  career.zonesDiscovered.add('PR');
  const s = serializeCareerTracker(career);
  const d = deserializeCareerTracker(s);
  assert.equal(d.gamesWon, 12);
  assert.ok(d.zonesDiscovered.has('PR'));
});

test('BL-05: applyUnlocks updates profile state and computes AP', () => {
  const state = createAchievementProfileState();
  const catalogById = getCatalogById();
  const result = applyUnlocks(state, [
    { achievementId: 'first-blood', unlockedAt: '2024-01-01T00:00:00Z', matchId: 'M1', provenance: 'LOCAL_AUTHORITY', rulesVersion: '4.3.1', productVersion: '0.24.2' },
    { achievementId: 'welcome-to-intrilex', unlockedAt: '2024-01-01T00:00:00Z', matchId: 'M1', provenance: 'LOCAL_AUTHORITY', rulesVersion: '4.3.1', productVersion: '0.24.2' },
  ], {});
  assert.ok(isEarned(result, 'first-blood'));
  assert.equal(countEarned(result), 2);
  assert.equal(computeTotalAP(result, catalogById), AP_BY_RARITY.COMMON + AP_BY_RARITY.COMMON);
});

test('BL-05: migration preserves trustworthy evidence only', () => {
  const result = migrateLegacyData(
    { badges: [{ id: 'supercharged' }, { id: 'first-duel' }], record: { wins: 30, losses: 10 } },
    { totalMatches: 40, wins: 30, supersDeclared: 3 }
  );
  assert.ok(isMigrated(result.state));
  assert.ok(result.migratedAchievements.includes('supercharged'));
  assert.ok(result.migratedAchievements.includes('welcome-to-intrilex'));
  assert.ok(result.migratedAchievements.includes('getting-dangerous'));
  assert.ok(!result.migratedAchievements.includes('from-behind'));
});

// ── Network authority ──

test('BL-06: server-side evaluator produces per-participant results', () => {
  const matchId = 'NM-1';
  const engineState = {
    cards: { C1: { id: 'C1', identity: '7♣' } },
    players: { P1: { securedPoints: 21, hand: ['C2'] }, P2: { securedPoints: 5, hand: ['C3'] } },
    stack: [],
    fullTurnSequence: 5,
    revision: 10,
    winner: 'P1',
  };
  const events = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 7 }, sequence: 1 },
  ];
  const results = evaluateMatchAchievements({ matchId, engineState, playerIds: ['P1', 'P2'], events });
  assert.ok(results.P1);
  assert.ok(results.P2);
  // P1 won and scored, P1 should get first-blood and twenty-one
  assert.ok(results.P1.newUnlocks.some(u => u.achievementId === 'first-blood'));
  assert.ok(results.P1.newUnlocks.some(u => u.achievementId === 'twenty-one'));
  // P2 did not win and did not score
  assert.ok(!results.P2.newUnlocks.some(u => u.achievementId === 'first-blood'));
});

// ── Build & file integrity ──

test('BL-07: build.mjs copies achievements package to dist', async () => {
  const buildSrc = await readFile(path.join(root, 'scripts/build.mjs'), 'utf8');
  assert.ok(buildSrc.includes("packages/achievements/src"), 'build.mjs must copy achievements package');
  assert.ok(buildSrc.includes("dist/achievements"), 'build.mjs must copy to dist/achievements');
});

test('BL-07: dev-server watches achievements package', async () => {
  const devSrc = await readFile(path.join(root, 'scripts/dev-server.mjs'), 'utf8');
  assert.ok(devSrc.includes("packages/achievements/src"), 'dev-server must watch achievements package');
});

test('BL-07: CI runs package smoke tests including achievements', async () => {
  const ci = await readFile(path.join(root, 'scripts/ci.mjs'), 'utf8');
  assert.ok(ci.includes("packages/achievements/test/smoke.test.mjs"), 'ci.mjs must run achievements smoke');
});

test('BL-07: package.json test script includes achievements', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.test.includes('test/achievements.test.mjs'), 'package.json test script must include achievements.test.mjs');
});

// ═══════════════════════════════════════════════════════════════
// COMPREHENSIVE EVALUATOR COVERAGE — all 56 achievements
// ═══════════════════════════════════════════════════════════════

/**
 * Build a tracker pre-populated with the conditions needed to unlock a
 * specific achievement. Returns { tracker, career, profile } ready for
 * evaluateAchievements. This avoids constructing raw engine events for
 * every test and lets us directly verify evaluator detection logic.
 */
function buildStateFor(achievementId, overrides = {}) {
  const { tracker, career } = createTrackers('M1', 'P1');
  const profile = createAchievementProfileState();
  const t = tracker;
  const c = career;
  // Default: terminal human win, score 21, opponent 5, 3 cards in hand
  t.isTerminal = true;
  t.winner = 'P1';
  t.isDraw = false;
  t.humanScore = 21;
  t.opponentScore = 5;
  t.humanHandCount = 3;
  t.stackDepthAtTerminal = 0;
  Object.assign(t, overrides.tracker ?? {});
  Object.assign(c, overrides.career ?? {});
  return { tracker: t, career: c, profile };
}

/** Helper: evaluate and check that an achievement is in newUnlocks. */
function expectUnlock(state, id, ctx = { matchId: 'M1', isTutorial: false }) {
  const result = evaluateAchievements(state.tracker, state.career, state.profile, ctx);
  assert.ok(
    result.newUnlocks.some(u => u.achievementId === id),
    `Expected unlock for ${id}. Got: ${result.newUnlocks.map(u => u.achievementId).join(', ')}`
  );
  return result;
}

/** Helper: evaluate and check that an achievement is NOT in newUnlocks. */
function expectNoUnlock(state, id, ctx = { matchId: 'M1', isTutorial: false }) {
  const result = evaluateAchievements(state.tracker, state.career, state.profile, ctx);
  assert.ok(
    !result.newUnlocks.some(u => u.achievementId === id),
    `Expected NO unlock for ${id}. Got: ${result.newUnlocks.map(u => u.achievementId).join(', ')}`
  );
  return result;
}

// ── FIRST_STEPS (01-10) ──

test('BL-03: 01 welcome-to-intrilex unlocks on terminal match', () => {
  expectUnlock(buildStateFor('welcome-to-intrilex'), 'welcome-to-intrilex');
});

test('BL-03: 02 first-blood unlocks on points action', () => {
  expectUnlock(buildStateFor('first-blood', {
    tracker: { isTerminal: false, actionsByMode: { points: 1, effect: 0, other: 0 } },
  }), 'first-blood');
});

test('BL-03: 03 twenty-one unlocks on win with 21+ points', () => {
  expectUnlock(buildStateFor('twenty-one'), 'twenty-one');
});

test('BL-03: 04 exactly-enough unlocks on win with exactly 21', () => {
  expectUnlock(buildStateFor('exactly-enough', { tracker: { humanScore: 21 } }), 'exactly-enough');
});

test('BL-03: 04 exactly-enough does NOT unlock on 22', () => {
  expectNoUnlock(buildStateFor('exactly-enough', { tracker: { humanScore: 22 } }), 'exactly-enough');
});

test('BL-03: 05 read-the-card unlocks on effect action', () => {
  expectUnlock(buildStateFor('read-the-card', {
    tracker: { isTerminal: false, actionsByMode: { points: 0, effect: 1, other: 0 } },
  }), 'read-the-card');
});

test('BL-03: 06 other-side-of-the-card unlocks on rank overlap (career)', () => {
  const s = buildStateFor('other-side-of-the-card');
  s.career.ranksPlayedForPoints.add('7');
  s.career.ranksPlayedForEffect.add('7');
  expectUnlock(s, 'other-side-of-the-card');
});

test('BL-03: 07 the-stack-exists unlocks on human response', () => {
  expectUnlock(buildStateFor('the-stack-exists', {
    tracker: { isTerminal: false, humanResponsesPlayed: 1 },
  }), 'the-stack-exists');
});

test('BL-03: 08 not-so-fast unlocks on interrupt response', () => {
  expectUnlock(buildStateFor('not-so-fast', {
    tracker: { isTerminal: false, lastResponseWasInterrupt: true, humanResponsesPlayed: 1 },
  }), 'not-so-fast');
});

test('BL-03: 09 miniature-warfare unlocks on any action', () => {
  expectUnlock(buildStateFor('miniature-warfare', {
    tracker: { isTerminal: false, actionsByMode: { points: 0, effect: 1, other: 0 } },
  }), 'miniature-warfare');
});

test('BL-03: 10 no-longer-new unlocks at 5 career wins', () => {
  const s = buildStateFor('no-longer-new');
  s.career.gamesWon = 5;
  expectUnlock(s, 'no-longer-new');
});

// ── CORE_SYSTEMS (11-20) ──

test('BL-03: 11 fair-trade unlocks on swap use', () => {
  expectUnlock(buildStateFor('fair-trade', {
    tracker: { isTerminal: false, swapUsedCount: 1 },
  }), 'fair-trade');
});

test('BL-03: 12 upgrade unlocks on win with swap-acquired card', () => {
  const s = buildStateFor('upgrade');
  s.tracker.acquiredFromSwap.add('C-SWAP');
  expectUnlock(s, 'upgrade');
});

test('BL-03: 13 gone-forever unlocks on human-caused exile', () => {
  expectUnlock(buildStateFor('gone-forever', {
    tracker: { _humanCausedExile: true },
  }), 'gone-forever');
});

test('BL-03: 14 drop-anchor unlocks on anchor established', () => {
  const s = buildStateFor('drop-anchor');
  s.tracker.humanAnchorsActive.add('C-ANCHOR');
  expectUnlock(s, 'drop-anchor');
});

test('BL-03: 15 hold-fast unlocks on anchor surviving opponent turn', () => {
  expectUnlock(buildStateFor('hold-fast', {
    tracker: { anchorSurvivedOpponentFullTurn: true },
  }), 'hold-fast');
});

test('BL-03: 16 supercharged unlocks on super declared', () => {
  expectUnlock(buildStateFor('supercharged', {
    tracker: { isTerminal: false, superDeclaredCount: 1 },
  }), 'supercharged');
});

test('BL-03: 17 two-become-one unlocks on super resolved', () => {
  expectUnlock(buildStateFor('two-become-one', {
    tracker: { superResolvedCount: 1 },
  }), 'two-become-one');
});

test('BL-03: 18 digging-deeper unlocks on spades effect resolved', () => {
  const s = buildStateFor('digging-deeper');
  s.tracker.spadesEffectsResolved.add('A_SPADE_COUNTER');
  expectUnlock(s, 'digging-deeper');
});

test('BL-03: 19 clean-sweep unlocks on all 4 zones interacted', () => {
  const s = buildStateFor('clean-sweep');
  for (const z of CLEAN_SWEEP_ZONES) s.tracker.zonesInteractedThisMatch.add(z);
  expectUnlock(s, 'clean-sweep');
});

test('BL-03: 19 clean-sweep does NOT unlock with only 3 zones', () => {
  const s = buildStateFor('clean-sweep');
  s.tracker.zonesInteractedThisMatch.add('DP');
  s.tracker.zonesInteractedThisMatch.add('GY');
  s.tracker.zonesInteractedThisMatch.add('EXILE');
  // Missing SWAP_BAR
  expectNoUnlock(s, 'clean-sweep');
});

test('BL-03: 20 know-the-table unlocks on all launch zones (career)', () => {
  const s = buildStateFor('know-the-table');
  for (const z of LAUNCH_ZONE_SET) s.career.zonesDiscovered.add(z);
  expectUnlock(s, 'know-the-table');
});

// ── STACK_COUNTERPLAY (21-28) ──

test('BL-03: 21 stack-student unlocks on response + chain depth', () => {
  expectUnlock(buildStateFor('stack-student', {
    tracker: { humanResponsesPlayed: 1, maxResponseChainDepth: 1 },
  }), 'stack-student');
});

test('BL-03: 22 denied unlocks on _deniedDetected flag', () => {
  expectUnlock(buildStateFor('denied', { tracker: { _deniedDetected: true } }), 'denied');
});

test('BL-03: 23 double-denied unlocks on _doubleDeniedDetected flag', () => {
  expectUnlock(buildStateFor('double-denied', { tracker: { _doubleDeniedDetected: true } }), 'double-denied');
});

test('BL-03: 24 nope-three unlocks on chain depth >= 3', () => {
  expectUnlock(buildStateFor('nope-three', {
    tracker: { humanResponsesPlayed: 3, maxResponseChainDepth: 3 },
  }), 'nope-three');
});

test('BL-03: 25 the-stackening (hidden) unlocks on maxStackDepth >= 5', () => {
  expectUnlock(buildStateFor('the-stackening', { tracker: { maxStackDepth: 5 } }), 'the-stackening');
});

test('BL-03: 26 perfect-timing unlocks on interrupt as final response', () => {
  expectUnlock(buildStateFor('perfect-timing', {
    tracker: { interruptWasFinalResponse: true },
  }), 'perfect-timing');
});

test('BL-03: 27 sequence-breaker unlocks on _sequenceBreakerDetected flag', () => {
  expectUnlock(buildStateFor('sequence-breaker', {
    tracker: { _sequenceBreakerDetected: true },
  }), 'sequence-breaker');
});

test('BL-03: 28 clean-kill unlocks on win with empty stack at terminal', () => {
  expectUnlock(buildStateFor('clean-kill', { tracker: { stackDepthAtTerminal: 0 } }), 'clean-kill');
});

test('BL-03: 28 clean-kill does NOT unlock with non-empty stack', () => {
  expectNoUnlock(buildStateFor('clean-kill', { tracker: { stackDepthAtTerminal: 2 } }), 'clean-kill');
});

// ── CARD_MASTERY (29-38) ──

test('BL-03: 29 lucky-seven unlocks on seven scoring trigger resolved', () => {
  expectUnlock(buildStateFor('lucky-seven', {
    tracker: { _sevenScoringTriggerResolved: true },
  }), 'lucky-seven');
});

test('BL-03: 30 topdeck-sorcery unlocks on seven-generated effect', () => {
  const s = buildStateFor('topdeck-sorcery');
  s.tracker.sevenGeneratedEffectCardIds.add('C-GEN');
  s.tracker.actionsByMode.effect = 1;
  expectUnlock(s, 'topdeck-sorcery');
});

test('BL-03: 31 found-money unlocks on seven-generated score card', () => {
  const s = buildStateFor('found-money');
  s.tracker.sevenGeneratedEffectCardIds.add('C-GEN');
  s.tracker._sevenScoreCardUsed = true;
  expectUnlock(s, 'found-money');
});

test('BL-03: 32 recursive-seven (hidden) unlocks on recursive detection', () => {
  expectUnlock(buildStateFor('recursive-seven', {
    tracker: { sevenRecursiveDetected: true },
  }), 'recursive-seven');
});

test('BL-03: 33 seven-heaven unlocks on 3+ seven interactions in full turn', () => {
  expectUnlock(buildStateFor('seven-heaven', {
    tracker: { sevenInteractionsThisFullTurn: 3 },
  }), 'seven-heaven');
});

test('BL-03: 34 queens-court unlocks on _queensCourtEstablished flag', () => {
  expectUnlock(buildStateFor('queens-court', {
    tracker: { _queensCourtEstablished: true },
  }), 'queens-court');
});

test('BL-03: 35 ace-in-the-hole unlocks on _aceCounterResolved flag', () => {
  expectUnlock(buildStateFor('ace-in-the-hole', {
    tracker: { _aceCounterResolved: true },
  }), 'ace-in-the-hole');
});

test('BL-03: 36 super-authority unlocks on _superAceCounterResolved flag', () => {
  expectUnlock(buildStateFor('super-authority', {
    tracker: { _superAceCounterResolved: true },
  }), 'super-authority');
});

test('BL-03: 37 stack-theft unlocks on TEN_SPADE_STACK_THEFT resolved', () => {
  const s = buildStateFor('stack-theft');
  s.tracker.spadesEffectsResolved.add('TEN_SPADE_STACK_THEFT');
  expectUnlock(s, 'stack-theft');
});

test('BL-03: 38 wild-card unlocks on KING_SPADE_WILD resolved', () => {
  const s = buildStateFor('wild-card');
  s.tracker.spadesEffectsResolved.add('KING_SPADE_WILD');
  expectUnlock(s, 'wild-card');
});

// ── TACTICAL_WINS (39-46) ──

test('BL-03: 39 photo-finish unlocks on win with opponent at 20', () => {
  expectUnlock(buildStateFor('photo-finish', { tracker: { opponentScore: 20 } }), 'photo-finish');
});

test('BL-03: 40 from-behind unlocks on win after 10+ deficit', () => {
  expectUnlock(buildStateFor('from-behind', { tracker: { maxPointDeficit: 12 } }), 'from-behind');
});

test('BL-03: 41 overkill unlocks on win with 30+ points', () => {
  expectUnlock(buildStateFor('overkill', { tracker: { humanScore: 30 } }), 'overkill');
});

test('BL-03: 42 last-card-standing unlocks on win with 1 card in hand', () => {
  expectUnlock(buildStateFor('last-card-standing', { tracker: { humanHandCount: 1 } }), 'last-card-standing');
});

test('BL-03: 43 empty-handed-victory unlocks on win with 0 cards', () => {
  expectUnlock(buildStateFor('empty-handed-victory', { tracker: { humanHandCount: 0 } }), 'empty-handed-victory');
});

test('BL-03: 44 plan-b-was-plan-a (hidden) unlocks on win after own play countered', () => {
  const s = buildStateFor('plan-b-was-plan-a');
  s.tracker.counteredHumanDeclarationsThisFullTurn.add('STACK-1');
  expectUnlock(s, 'plan-b-was-plan-a');
});

test('BL-03: 45 turnabout unlocks on _turnaboutDetected flag', () => {
  expectUnlock(buildStateFor('turnabout', { tracker: { _turnaboutDetected: true } }), 'turnabout');
});

test('BL-03: 46 no-shovel-required unlocks on win without spades effects', () => {
  expectUnlock(buildStateFor('no-shovel-required'), 'no-shovel-required');
});

test('BL-03: 46 no-shovel-required does NOT unlock with spades declared', () => {
  const s = buildStateFor('no-shovel-required');
  s.tracker.spadesEffectsDeclared.add('A_SPADE_COUNTER');
  expectNoUnlock(s, 'no-shovel-required');
});

// ── PLAYSTYLE (47-52) ──

test('BL-03: 47 big-number-good unlocks on 75%+ points ratio (min 4 declarations)', () => {
  expectUnlock(buildStateFor('big-number-good', {
    tracker: { actionsByMode: { points: 4, effect: 1, other: 0 } },
  }), 'big-number-good');
});

test('BL-03: 47 big-number-good does NOT unlock with <75% ratio', () => {
  expectNoUnlock(buildStateFor('big-number-good', {
    tracker: { actionsByMode: { points: 3, effect: 2, other: 0 } },
  }), 'big-number-good');
});

test('BL-03: 48 reading-is-overpowered unlocks on 5+ effect resolutions', () => {
  expectUnlock(buildStateFor('reading-is-overpowered', {
    tracker: { actionsByMode: { points: 0, effect: 5, other: 0 } },
  }), 'reading-is-overpowered');
});

test('BL-03: 49 controlled-chaos unlocks on 3+ effects + positive delta in turn', () => {
  expectUnlock(buildStateFor('controlled-chaos', {
    tracker: { effectResolutionsThisFullTurn: 3, pointDeltaThisFullTurn: 5 },
  }), 'controlled-chaos');
});

test('BL-03: 50 window-shopper unlocks on win without swap', () => {
  expectUnlock(buildStateFor('window-shopper', { tracker: { swapUsedCount: 0 } }), 'window-shopper');
});

test('BL-03: 51 absolutely-excessive unlocks on 3+ supers resolved', () => {
  expectUnlock(buildStateFor('absolutely-excessive', { tracker: { superResolvedCount: 3 } }), 'absolutely-excessive');
});

test('BL-03: 51 absolutely-excessive progress shows partial at 2', () => {
  const s = buildStateFor('absolutely-excessive', { tracker: { superResolvedCount: 2 } });
  const r = evaluateAchievements(s.tracker, s.career, s.profile, { matchId: 'M1', isTutorial: false });
  assert.equal(r.progressUpdates['absolutely-excessive'].current, 2);
  assert.equal(r.progressUpdates['absolutely-excessive'].completed, false);
});

test('BL-03: 52 black-magic (hidden) unlocks on 2+ spades effects same turn', () => {
  const s = buildStateFor('black-magic');
  s.tracker.spadesEffectsThisFullTurn.add('A_SPADE_COUNTER');
  s.tracker.spadesEffectsThisFullTurn.add('EIGHT_SPADE_SCUTTLE');
  expectUnlock(s, 'black-magic');
});

// ── PROGRESSION (53-56) ──

test('BL-03: 53 getting-dangerous unlocks at 25 career wins', () => {
  const s = buildStateFor('getting-dangerous');
  s.career.gamesWon = 25;
  expectUnlock(s, 'getting-dangerous');
});

test('BL-03: 54 intrilexian unlocks at 100 career wins', () => {
  const s = buildStateFor('intrilexian');
  s.career.gamesWon = 100;
  expectUnlock(s, 'intrilexian');
});

test('BL-03: 55 spades-scholar unlocks on all launch spades effects used (career)', () => {
  const s = buildStateFor('spades-scholar');
  for (const e of LAUNCH_SPADES_EFFECTS) s.career.spadesEffectsUsed.add(e);
  expectUnlock(s, 'spades-scholar');
});

test('BL-03: 55 spades-scholar does NOT unlock with missing effect', () => {
  const s = buildStateFor('spades-scholar');
  for (const e of LAUNCH_SPADES_EFFECTS) s.career.spadesEffectsUsed.add(e);
  s.career.spadesEffectsUsed.delete('KING_SPADE_WILD');
  expectNoUnlock(s, 'spades-scholar');
});

test('BL-03: 56 card-savant unlocks when all 10 card mastery prereqs earned', () => {
  const s = buildStateFor('card-savant');
  for (const id of CARD_MASTERY_ACHIEVEMENT_IDS) {
    s.profile.earned[id] = { unlockedAt: '2024-01-01', matchId: 'M0', provenance: 'LOCAL_AUTHORITY' };
  }
  expectUnlock(s, 'card-savant');
});

test('BL-03: 56 card-savant does NOT unlock with missing prereq', () => {
  const s = buildStateFor('card-savant');
  for (const id of CARD_MASTERY_ACHIEVEMENT_IDS) {
    s.profile.earned[id] = { unlockedAt: '2024-01-01', matchId: 'M0', provenance: 'LOCAL_AUTHORITY' };
  }
  delete s.profile.earned['wild-card'];
  expectNoUnlock(s, 'card-savant');
});

// ── Eligibility scope enforcement ──

test('BL-04: COMPETITIVE_ONLY achievements blocked in tutorial', () => {
  // welcome-to-intrilex is COMPETITIVE_ONLY
  const s = buildStateFor('welcome-to-intrilex');
  expectNoUnlock(s, 'welcome-to-intrilex', { matchId: 'M1', isTutorial: true });
});

test('BL-04: QUALIFYING_DUEL achievements unlock in tutorial (no tutorial restriction)', () => {
  // fair-trade is QUALIFYING_DUEL + TUTORIAL_ALLOWED scope not enforced against tutorial
  const s = buildStateFor('fair-trade', { tracker: { isTerminal: false, swapUsedCount: 1 } });
  // fair-trade is TUTORIAL_ALLOWED, so it should unlock in tutorial
  const result = evaluateAchievements(s.tracker, s.career, s.profile, { matchId: 'M1', isTutorial: true });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'fair-trade'));
});

test('BL-04: isEligible returns false for non-qualifying contexts', () => {
  assert.equal(isEligible('first-blood', { isSimulation: true, matchId: 'M1', humanPlayerId: 'P1' }), false);
  assert.equal(isEligible('first-blood', { isReplayPlayback: true, matchId: 'M1', humanPlayerId: 'P1' }), false);
  assert.equal(isEligible('first-blood', { isSpectator: true, matchId: 'M1', humanPlayerId: 'P1' }), false);
});

test('BL-04: isEligible returns true for qualifying local vs AI', () => {
  assert.equal(isEligible('first-blood', localVsAIContext('M1', 'P1')), true);
});

test('BL-04: isEligible returns true for network match', () => {
  assert.equal(isEligible('first-blood', networkMatchContext('M1', 'P1')), true);
});

test('BL-04: isEligible blocks COMPETITIVE_ONLY in tutorial', () => {
  const ctx = localVsAIContext('M1', 'P1', true); // tutorial
  assert.equal(isEligible('welcome-to-intrilex', ctx), false);
});

// ── Idempotency ──

test('BL-05: fact idempotency: re-reducing same facts does not double-count', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const facts = deriveAchievementFacts([
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ], { matchId: 'M1', humanPlayerId: 'P1', stateCards: { C1: { id: 'C1', identity: '5♣' } } });
  reduceFacts(tracker, career, facts);
  const pointsBefore = tracker.actionsByMode.points;
  reduceFacts(tracker, career, facts); // re-reduce same facts
  assert.equal(tracker.actionsByMode.points, pointsBefore, 'points should not double-count');
});

test('BL-05: applyUnlocks is idempotent — applying same unlocks twice does not double-award', () => {
  const state = createAchievementProfileState();
  const unlock = { achievementId: 'first-blood', unlockedAt: '2024-01-01T00:00:00Z', matchId: 'M1', provenance: 'LOCAL_AUTHORITY', rulesVersion: '4.3.1', productVersion: '0.24.2' };
  const s1 = applyUnlocks(state, [unlock], {});
  const s2 = applyUnlocks(s1, [unlock], {});
  assert.equal(countEarned(s2), 1, 'should still have only 1 earned achievement');
});

// ── Tracker serialization round-trip ──

test('BL-05: match tracker serializes and deserializes with all fields', () => {
  const { tracker } = createTrackers('M1', 'P1');
  tracker.actionsByMode.points = 5;
  tracker.ranksPlayedForPoints.add('7');
  tracker.zonesInteractedThisMatch.add('PR');
  tracker.acquiredFromSwap.add('C1');
  tracker.spadesEffectsResolved.add('A_SPADE_COUNTER');
  tracker.humanAnchorsActive.add('A1');
  tracker.maxStackDepth = 3;
  tracker.maxResponseChainDepth = 2;
  tracker.humanResponsesPlayed = 4;
  tracker.isTerminal = true;
  tracker.winner = 'P1';
  tracker.humanScore = 25;
  const serialized = serializeMatchTracker(tracker);
  const restored = deserializeMatchTracker(serialized);
  assert.equal(restored.actionsByMode.points, 5);
  assert.ok(restored.ranksPlayedForPoints.has('7'));
  assert.ok(restored.zonesInteractedThisMatch.has('PR'));
  assert.ok(restored.acquiredFromSwap.has('C1'));
  assert.ok(restored.spadesEffectsResolved.has('A_SPADE_COUNTER'));
  assert.ok(restored.humanAnchorsActive.has('A1'));
  assert.equal(restored.maxStackDepth, 3);
  assert.equal(restored.maxResponseChainDepth, 2);
  assert.equal(restored.humanResponsesPlayed, 4);
  assert.equal(restored.isTerminal, true);
  assert.equal(restored.winner, 'P1');
  assert.equal(restored.humanScore, 25);
});

test('BL-05: career tracker serializes and deserializes with sets', () => {
  const career = createCareerTracker();
  career.gamesWon = 42;
  career.zonesDiscovered.add('PR');
  career.zonesDiscovered.add('ER');
  career.spadesEffectsUsed.add('A_SPADE_COUNTER');
  career.ranksPlayedForPoints.add('7');
  const serialized = serializeCareerTracker(career);
  const restored = deserializeCareerTracker(serialized);
  assert.equal(restored.gamesWon, 42);
  assert.ok(restored.zonesDiscovered.has('PR'));
  assert.ok(restored.zonesDiscovered.has('ER'));
  assert.ok(restored.spadesEffectsUsed.has('A_SPADE_COUNTER'));
  assert.ok(restored.ranksPlayedForPoints.has('7'));
});

test('BL-05: deserializeMatchTracker tolerates missing fields (schema evolution)', () => {
  const restored = deserializeMatchTracker({ matchId: 'M1', humanPlayerId: 'P1' });
  assert.equal(restored.actionsByMode.points, 0);
  assert.equal(restored.swapUsedCount, 0);
  assert.ok(restored.ranksPlayedForPoints instanceof Set);
  assert.equal(restored.isTerminal, false);
});

// ── Migration edge cases ──

test('BL-05: migration with empty legacy data still marks as migrated', () => {
  const result = migrateLegacyData({}, {});
  assert.ok(isMigrated(result.state));
  assert.equal(result.migratedAchievements.length, 0);
});

test('BL-05: migration with 100+ wins grants intrilexian', () => {
  const result = migrateLegacyData(
    { badges: [], record: { wins: 100, losses: 5, draws: 0 } },
    { totalMatches: 105, wins: 100 }
  );
  assert.ok(result.migratedAchievements.includes('intrilexian'));
  assert.ok(result.migratedAchievements.includes('getting-dangerous'));
  assert.ok(result.migratedAchievements.includes('no-longer-new'));
});

test('BL-05: migration does not double-award when run twice on same state', () => {
  const first = migrateLegacyData(
    { badges: [{ id: 'supercharged' }], record: { wins: 30, losses: 5, draws: 0 } },
    { totalMatches: 35, wins: 30 }
  );
  const second = migrateLegacyData(
    { badges: [{ id: 'supercharged' }], record: { wins: 30, losses: 5, draws: 0 } },
    { totalMatches: 35, wins: 30 },
    first.state
  );
  // supercharged should only appear once in migratedAchievements across both runs
  const allMigrated = [...first.migratedAchievements, ...second.migratedAchievements];
  const superchargedCount = allMigrated.filter(id => id === 'supercharged').length;
  assert.equal(superchargedCount, 1, 'supercharged should not be double-awarded');
});

test('BL-05: migration preserves supersDeclared stat in career', () => {
  const result = migrateLegacyData(
    { badges: [], record: { wins: 0, losses: 0, draws: 0 } },
    { totalMatches: 0, wins: 0, supersDeclared: 7 }
  );
  assert.equal(result.state.career.superDeclarationsTotal, 7);
  assert.ok(result.migratedAchievements.includes('supercharged'));
});

test('BL-05: migration notes explain unshaken is NOT migrated to from-behind', () => {
  const result = migrateLegacyData(
    { badges: [{ id: 'unshaken' }], record: { wins: 0, losses: 0, draws: 0 } },
    {}
  );
  assert.ok(result.migrationNotes.some(n => n.includes('unshaken')));
  assert.ok(!result.migratedAchievements.includes('from-behind'));
});

// ── Network authority: player-safe projection ──

test('BL-06: server-side evaluator returns empty for non-qualifying match', () => {
  // Single player (no opponent) — still qualifies as network match by context
  // But test with empty playerIds to verify graceful handling
  const results = evaluateMatchAchievements({
    matchId: 'NM-1',
    engineState: { cards: {}, players: {}, stack: [], fullTurnSequence: 0, revision: 0, winner: null },
    playerIds: [],
    events: [],
  });
  assert.deepEqual(results, {});
});

test('BL-06: server-side evaluator produces per-participant results with no cross-contamination', () => {
  const matchId = 'NM-2';
  const engineState = {
    cards: { C1: { id: 'C1', identity: '7♣' }, C2: { id: 'C2', identity: '5♦' } },
    players: {
      P1: { securedPoints: 21, hand: ['C3'] },
      P2: { securedPoints: 5, hand: ['C4', 'C5'] },
    },
    stack: [],
    fullTurnSequence: 5,
    revision: 10,
    winner: 'P1',
  };
  const events = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 7 }, sequence: 1 },
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P2', cardId: 'C2', pointValue: 5 }, sequence: 2 },
  ];
  const results = evaluateMatchAchievements({ matchId, engineState, playerIds: ['P1', 'P2'], events });
  // P1 won and scored → should have first-blood, twenty-one, welcome-to-intrilex
  assert.ok(results.P1.newUnlocks.some(u => u.achievementId === 'first-blood'));
  assert.ok(results.P1.newUnlocks.some(u => u.achievementId === 'twenty-one'));
  assert.ok(results.P1.newUnlocks.some(u => u.achievementId === 'welcome-to-intrilex'));
  // P2 scored but did not win → should have first-blood but NOT twenty-one
  assert.ok(results.P2.newUnlocks.some(u => u.achievementId === 'first-blood'));
  assert.ok(!results.P2.newUnlocks.some(u => u.achievementId === 'twenty-one'));
  // P2 completed a duel (even as loser) → welcome-to-intrilex is valid
  assert.ok(results.P2.newUnlocks.some(u => u.achievementId === 'welcome-to-intrilex'));
});

test('BL-06: server-side evaluator uses NETWORK_AUTHORITY provenance', () => {
  const matchId = 'NM-3';
  const engineState = {
    cards: { C1: { id: 'C1', identity: '7♣' } },
    players: { P1: { securedPoints: 21, hand: [] }, P2: { securedPoints: 5, hand: [] } },
    stack: [], fullTurnSequence: 5, revision: 10, winner: 'P1',
  };
  const events = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 7 }, sequence: 1 },
  ];
  const results = evaluateMatchAchievements({ matchId, engineState, playerIds: ['P1', 'P2'], events });
  assert.ok(results.P1.newUnlocks.every(u => u.provenance === 'NETWORK_AUTHORITY'));
});

test('BL-06: server-side evaluator accepts career state per participant', () => {
  const matchId = 'NM-4';
  const engineState = {
    cards: {},
    players: { P1: { securedPoints: 21, hand: [] }, P2: { securedPoints: 5, hand: [] } },
    stack: [], fullTurnSequence: 5, revision: 10, winner: 'P1',
  };
  const careerByParticipant = new Map();
  const p1Career = createCareerTracker();
  p1Career.gamesWon = 5; // already at 5 wins → no-longer-new unlocks
  careerByParticipant.set('P1', p1Career);
  const results = evaluateMatchAchievements(
    { matchId, engineState, playerIds: ['P1', 'P2'], events: [] },
    careerByParticipant
  );
  // P1 should now have 5 wins → no-longer-new unlocks
  assert.ok(results.P1.newUnlocks.some(u => u.achievementId === 'no-longer-new'));
});

// ── Fact projector edge cases ──

test('BL-02: fact projector ignores unknown event types', () => {
  const facts = deriveAchievementFacts([
    { type: 'UNKNOWN_EVENT_TYPE', payload: { playerId: 'P1' }, sequence: 1 },
  ], { matchId: 'M1', humanPlayerId: 'P1', stateCards: {} });
  // Should produce no facts (or only minimal) — unknown events are ignored
  assert.ok(facts.length === 0 || facts.every(f => f.kind !== 'UNKNOWN'));
});

test('BL-02: fact projector produces stable fact IDs', () => {
  const events = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ];
  const ctx = { matchId: 'M1', humanPlayerId: 'P1', stateCards: { C1: { id: 'C1', identity: '5♣' } } };
  const facts1 = deriveAchievementFacts(events, ctx);
  const facts2 = deriveAchievementFacts(events, ctx);
  assert.deepEqual(facts1.map(f => f.factId), facts2.map(f => f.factId));
});

test('BL-02: createCheckpointFact produces MATCH_STATE_CHECKPOINT kind', () => {
  const fact = createCheckpointFact('M1', 'P1', {
    humanScore: 21, opponentScore: 5, humanHandCount: 3,
    opponentHandCount: 5, stackDepth: 0, fullTurnSequence: 5,
    stateRevision: 10, isTerminal: true, winner: 'P1', isDraw: false,
  });
  assert.equal(fact.kind, FACT_KIND.MATCH_STATE_CHECKPOINT);
  assert.equal(fact.payload.humanScore, 21);
  assert.equal(fact.payload.isTerminal, true);
});

// ── Catalog invariants ──

test('BL-01: every achievement has required fields', () => {
  for (const def of getCatalog()) {
    assert.ok(def.id, `achievement missing id`);
    assert.ok(def.name, `${def.id} missing name`);
    assert.ok(def.description, `${def.id} missing description`);
    assert.ok(def.category, `${def.id} missing category`);
    assert.ok(def.rarity, `${def.id} missing rarity`);
    assert.ok(typeof def.hidden === 'boolean', `${def.id} hidden must be boolean`);
    assert.ok(typeof def.achievementPoints === 'number', `${def.id} AP must be number`);
    assert.ok(def.progressType, `${def.id} missing progressType`);
    assert.ok(def.eligibilityScope, `${def.id} missing eligibilityScope`);
    assert.ok(def.iconKey, `${def.id} missing iconKey`);
    assert.ok(def.introducedProductVersion, `${def.id} missing introducedProductVersion`);
    assert.ok(def.introducedRulesVersion, `${def.id} missing introducedRulesVersion`);
    assert.ok(def.schemaVersion, `${def.id} missing schemaVersion`);
    assert.ok(def.catalogVersion, `${def.id} missing catalogVersion`);
  }
});

test('BL-01: COUNTER achievements have progressTarget', () => {
  for (const def of getCatalog()) {
    if (def.progressType === PROGRESS_TYPE.COUNTER) {
      assert.ok(typeof def.progressTarget === 'number' && def.progressTarget > 0,
        `${def.id} (COUNTER) must have positive progressTarget`);
    }
  }
});

test('BL-01: COMPOSITE achievements have prerequisiteAchievementIds', () => {
  for (const def of getCatalog()) {
    if (def.progressType === PROGRESS_TYPE.COMPOSITE) {
      assert.ok(def.prerequisiteAchievementIds && def.prerequisiteAchievementIds.length > 0,
        `${def.id} (COMPOSITE) must have prerequisiteAchievementIds`);
    }
  }
});

test('BL-01: achievementPoints match rarity-derived values', () => {
  for (const def of getCatalog()) {
    assert.equal(def.achievementPoints, AP_BY_RARITY[def.rarity],
      `${def.id} AP ${def.achievementPoints} does not match rarity ${def.rarity}`);
  }
});

test('BL-01: category distribution covers all 7 categories', () => {
  const cats = new Set(getCatalog().map(d => d.category));
  assert.equal(cats.size, 7, 'should have all 7 categories');
  for (const c of Object.values(CATEGORY)) {
    assert.ok(cats.has(c), `category ${c} missing from catalog`);
  }
});

test('BL-01: getDefinition returns undefined for unknown id', () => {
  assert.equal(getDefinition('nonexistent-achievement'), undefined);
});

test('BL-01: getCatalogById returns Map keyed by id', () => {
  const byId = getCatalogById();
  assert.ok(byId instanceof Map);
  assert.equal(byId.size, 56);
  assert.ok(byId.get('first-blood'));
  assert.equal(byId.get('first-blood').id, 'first-blood');
});

test('BL-01: hidden achievements are exactly the 4 specified IDs', () => {
  const hidden = getCatalog().filter(d => d.hidden).map(d => d.id).sort();
  assert.deepEqual(hidden, [...HIDDEN_ACHIEVEMENT_IDS].sort());
});

// ── Browser persistence layer (fake IndexedDB shim) ──

// Minimal fake IndexedDB for testing persistence.js fallback behavior.
// We test the localStorage fallback path since Node has no native IndexedDB.
test('BL-05: persistence.js exports achievement store functions', async () => {
  // Verify the persistence module exports the expected functions by reading source.
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/persistence.js'), 'utf8');
  assert.ok(src.includes('getAchievementState'), 'persistence.js must export getAchievementState');
  assert.ok(src.includes('saveAchievementState'), 'persistence.js must export saveAchievementState');
  assert.ok(src.includes('resetAchievementState'), 'persistence.js must export resetAchievementState');
  assert.ok(src.includes("STORES.ACHIEVEMENTS"), 'persistence.js must define ACHIEVEMENTS store');
  assert.ok(src.includes('intrilex-achievements-v1'), 'persistence.js must have localStorage fallback key');
});

test('BL-05: persistence.js creates ACHIEVEMENTS store in upgradeDB', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/persistence.js'), 'utf8');
  // The store creation must be inside the onupgradeneeded handler
  const upgradeSection = src.match(/onupgradeneeded[\s\S]*?createObjectStore\(STORES\.ACHIEVEMENTS/);
  assert.ok(upgradeSection, 'ACHIEVEMENTS store must be created in onupgradeneeded');
});

// ── Browser achievement runtime (logic-only test via dynamic import) ──

test('BL-07: achievement-runtime.js validates catalog at module load', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-runtime.js'), 'utf8');
  assert.ok(src.includes('validateCatalog()'), 'runtime must validate catalog at load');
  assert.ok(src.includes('class AchievementRuntime'), 'runtime must define AchievementRuntime class');
  assert.ok(src.includes('getAchievementRuntime'), 'runtime must export singleton getter');
  assert.ok(src.includes('consumeEvents'), 'runtime must have consumeEvents method');
  assert.ok(src.includes('startMatch'), 'runtime must have startMatch method');
  assert.ok(src.includes('finishMatch'), 'runtime must have finishMatch method');
  assert.ok(src.includes('getGalleryData'), 'runtime must have getGalleryData method');
  assert.ok(src.includes('getSummary'), 'runtime must have getSummary method');
});

test('BL-07: achievement-runtime.js imports from relative achievements path (browser transport)', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-runtime.js'), 'utf8');
  // Must import via relative path that works after build copies to dist/achievements/
  assert.ok(src.includes("'../../achievements/index.mjs'") || src.includes('"../../achievements/index.mjs"'),
    'runtime must import from ../../achievements/index.mjs (browser transport path)');
});

// ── Achievement presenter (toast notifications) ──

test('BL-07: achievement-presenter.js escapes HTML to prevent XSS', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-presenter.js'), 'utf8');
  assert.ok(src.includes('_escapeHtml'), 'presenter must have _escapeHtml method');
  assert.ok(src.includes('textContent'), 'presenter must use textContent for escaping');
  assert.ok(src.includes('aria-live'), 'presenter must set aria-live for accessibility');
  assert.ok(src.includes("'role'") && src.includes("'status'"), 'presenter must set role=status');
});

test('BL-07: achievement-presenter.js has idempotent toast display', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-presenter.js'), 'utf8');
  assert.ok(src.includes('_displayedFactIds'), 'presenter must track displayed fact IDs');
  assert.ok(src.includes('queueUnlocks'), 'presenter must have queueUnlocks method');
  assert.ok(src.includes('buildTerminalSummaryHtml'), 'presenter must have buildTerminalSummaryHtml');
});

// ── Achievement UI (gallery) ──

test('BL-07: achievement-ui.js renders gallery with filters and categories', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-ui.js'), 'utf8');
  assert.ok(src.includes('renderAchievementsWorkspace'), 'ui must export renderAchievementsWorkspace');
  assert.ok(src.includes('CATEGORY_LABELS'), 'ui must define category labels');
  assert.ok(src.includes('RARITY_COLORS'), 'ui must define rarity colors');
  assert.ok(src.includes('data-filter'), 'ui must have filter buttons');
  assert.ok(src.includes('data-category-filter'), 'ui must have category filter buttons');
  assert.ok(src.includes('achievement-card'), 'ui must render achievement cards');
});

test('BL-07: achievement-ui.js hides hidden achievement names until unlocked', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-ui.js'), 'utf8');
  // The runtime's getGalleryData handles the hidden masking; verify ui consumes it
  assert.ok(src.includes('getGalleryData'), 'ui must call getGalleryData');
  // Verify the runtime masks hidden achievements
  const rtSrc = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-runtime.js'), 'utf8');
  assert.ok(rtSrc.includes("'???'"), 'runtime must mask hidden achievement names');
  assert.ok(rtSrc.includes("'Hidden Achievement'"), 'runtime must mask hidden descriptions');
});

// ── Router integration ──

test('BL-07: router.js includes /achievements route', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/router.js'), 'utf8');
  assert.ok(src.includes('/achievements') || src.includes('achievements'),
    'router must include achievements route');
});

test('BL-07: app.js wires achievements workspace', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.ok(src.includes('achievement') || src.includes('Achievement'),
    'app.js must reference achievements');
});

// ── Play controller integration ──

test('BL-07: play-controller.js integrates achievement runtime', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/play-controller.js'), 'utf8');
  assert.ok(src.includes('achievement') || src.includes('Achievement'),
    'play-controller must reference achievements');
  // Look for fact generation hooks at session boundaries
  assert.ok(src.includes('_achievementConsumer') || src.includes('_notifyAchievementConsumer') || src.includes('deriveAchievementFacts') || src.includes('consumeEvents'),
    'play-controller must integrate achievement consumer or fact generation');
});

// ── Determinism: same inputs produce same outputs ──

test('BL-08: evaluator is deterministic — same inputs produce same unlocks', () => {
  const s1 = buildStateFor('twenty-one');
  const s2 = buildStateFor('twenty-one');
  const r1 = evaluateAchievements(s1.tracker, s1.career, s1.profile, { matchId: 'M1', isTutorial: false, timestamp: 'T1' });
  const r2 = evaluateAchievements(s2.tracker, s2.career, s2.profile, { matchId: 'M1', isTutorial: false, timestamp: 'T1' });
  assert.deepEqual(
    r1.newUnlocks.map(u => u.achievementId).sort(),
    r2.newUnlocks.map(u => u.achievementId).sort()
  );
});

test('BL-08: evaluator does not mutate tracker or career', () => {
  const s = buildStateFor('twenty-one');
  const trackerSnapshot = JSON.stringify(serializeMatchTracker(s.tracker));
  const careerSnapshot = JSON.stringify(serializeCareerTracker(s.career));
  evaluateAchievements(s.tracker, s.career, s.profile, { matchId: 'M1', isTutorial: false });
  assert.equal(JSON.stringify(serializeMatchTracker(s.tracker)), trackerSnapshot);
  assert.equal(JSON.stringify(serializeCareerTracker(s.career)), careerSnapshot);
});

// ── Privacy: facts do not leak hidden info ──

test('BL-08: achievement facts do not contain seed or RNG state', () => {
  const facts = deriveAchievementFacts([
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ], { matchId: 'M1', humanPlayerId: 'P1', stateCards: { C1: { id: 'C1', identity: '5♣' } } });
  for (const f of facts) {
    const serialized = JSON.stringify(f);
    assert.ok(!serialized.includes('seed'), 'facts must not contain seed');
    assert.ok(!serialized.includes('rng'), 'facts must not contain rng');
    assert.ok(!serialized.includes('drawPile'), 'facts must not contain drawPile');
  }
});

test('BL-08: server-side projection does not expose opponent hand to client', () => {
  const matchId = 'NM-PRIV';
  const engineState = {
    cards: { C1: { id: 'C1', identity: '7♣' } },
    players: {
      P1: { securedPoints: 21, hand: ['C-MY-1', 'C-MY-2'] },
      P2: { securedPoints: 5, hand: ['C-OPP-SECRET-1', 'C-OPP-SECRET-2'] },
    },
    stack: [], fullTurnSequence: 5, revision: 10, winner: 'P1',
  };
  const events = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 7 }, sequence: 1 },
  ];
  const results = evaluateMatchAchievements({ matchId, engineState, playerIds: ['P1', 'P2'], events });
  // The results for P1 should not contain P2's hand card IDs
  const p1ResultJson = JSON.stringify(results.P1);
  assert.ok(!p1ResultJson.includes('C-OPP-SECRET'), 'P1 results must not expose opponent hand cards');
  // The tracker is included in results — verify it doesn't leak opponent hand
  assert.ok(!p1ResultJson.includes('C-OPP-SECRET'), 'tracker must not leak opponent hand');
});

// ── Provenance tracking ──

test('BL-08: unlock records carry provenance and version stamps', () => {
  const s = buildStateFor('first-blood', {
    tracker: { isTerminal: false, actionsByMode: { points: 1, effect: 0, other: 0 } },
  });
  const result = evaluateAchievements(s.tracker, s.career, s.profile, {
    matchId: 'M1', isTutorial: false, provenance: 'NETWORK_AUTHORITY', timestamp: '2024-06-15T12:00:00Z',
  });
  const unlock = result.newUnlocks.find(u => u.achievementId === 'first-blood');
  assert.ok(unlock);
  assert.equal(unlock.provenance, 'NETWORK_AUTHORITY');
  assert.equal(unlock.unlockedAt, '2024-06-15T12:00:00Z');
  assert.equal(unlock.matchId, 'M1');
  assert.ok(unlock.rulesVersion);
  assert.ok(unlock.productVersion);
});

// ── Progress display for SET-type achievements ──

test('BL-05: SET progress updates include current count and setItems', () => {
  const s = buildStateFor('clean-sweep');
  s.tracker.zonesInteractedThisMatch.add('DP');
  s.tracker.zonesInteractedThisMatch.add('GY');
  const r = evaluateAchievements(s.tracker, s.career, s.profile, { matchId: 'M1', isTutorial: false });
  const prog = r.progressUpdates['clean-sweep'];
  assert.ok(prog);
  assert.equal(prog.type, 'SET');
  assert.equal(prog.current, 2);
  assert.equal(prog.target, CLEAN_SWEEP_ZONES.length);
  assert.equal(prog.completed, false);
});

test('BL-05: COMPOSITE progress shows earned count out of total prereqs', () => {
  const s = buildStateFor('card-savant');
  // Earn 3 of 10 prereqs
  const prereqs = CARD_MASTERY_ACHIEVEMENT_IDS.slice(0, 3);
  for (const id of prereqs) {
    s.profile.earned[id] = { unlockedAt: '2024-01-01', matchId: 'M0', provenance: 'LOCAL_AUTHORITY' };
  }
  const r = evaluateAchievements(s.tracker, s.career, s.profile, { matchId: 'M1', isTutorial: false });
  const prog = r.progressUpdates['card-savant'];
  assert.ok(prog);
  assert.equal(prog.type, 'COMPOSITE');
  assert.equal(prog.current, 3);
  assert.equal(prog.target, CARD_MASTERY_ACHIEVEMENT_IDS.length);
  assert.equal(prog.completed, false);
});

// ── Smoke test for the achievements package itself ──

test('BL-07: achievements package smoke test file exists', async () => {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(path.join(root, 'packages/achievements/test/smoke.test.mjs'));
    assert.ok(true);
  } catch {
    assert.fail('packages/achievements/test/smoke.test.mjs must exist');
  }
});

test('BL-07: achievements package.json defines exports and scripts', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'packages/achievements/package.json'), 'utf8'));
  assert.ok(pkg.name, 'package must have name');
  assert.ok(pkg.version, 'package must have version');
  assert.ok(pkg.scripts && pkg.scripts.test, 'package must have test script');
});

// ── BL-08: Polish regression tests ──
// Tests for fixes made during enhancement-first polish pass.

test('BL-08: evaluator prerequisite check uses prereqId not id', () => {
  // card-savant requires all 10 CARD_MASTERY_ACHIEVEMENT_IDS.
  // If only some are earned, card-savant should NOT unlock.
  const tracker = createMatchTracker('M1', 'P1');
  const career = createCareerTracker();
  const profileState = createAchievementProfileState();

  // Earn 9 of 10 prerequisites — card-savant should NOT unlock
  for (let i = 0; i < CARD_MASTERY_ACHIEVEMENT_IDS.length - 1; i++) {
    const prereqId = CARD_MASTERY_ACHIEVEMENT_IDS[i];
    profileState.earned[prereqId] = { unlockedAt: '2026-01-01T00:00:00Z', matchId: 'M0', provenance: 'LOCAL_AUTHORITY' };
  }

  const result = evaluateAchievements(tracker, career, profileState, {
    matchId: 'M1',
    isTutorial: false,
    provenance: 'LOCAL_AUTHORITY',
  });

  const cardSavantUnlock = result.newUnlocks.find(u => u.achievementId === 'card-savant');
  assert.equal(cardSavantUnlock, undefined, 'card-savant must not unlock with only 9/10 prerequisites');
});

test('BL-08: evaluator prerequisite check passes when all prereqs earned', () => {
  const tracker = createMatchTracker('M1', 'P1');
  const career = createCareerTracker();
  const profileState = createAchievementProfileState();

  // Earn ALL 10 prerequisites
  for (const prereqId of CARD_MASTERY_ACHIEVEMENT_IDS) {
    profileState.earned[prereqId] = { unlockedAt: '2026-01-01T00:00:00Z', matchId: 'M0', provenance: 'LOCAL_AUTHORITY' };
  }

  const result = evaluateAchievements(tracker, career, profileState, {
    matchId: 'M1',
    isTutorial: false,
    provenance: 'LOCAL_AUTHORITY',
  });

  const cardSavantUnlock = result.newUnlocks.find(u => u.achievementId === 'card-savant');
  assert.ok(cardSavantUnlock, 'card-savant must unlock when all 10 prerequisites are earned');
});

test('BL-08: evaluator uses canonical isEligible for COMPETITIVE_ONLY in tutorial', () => {
  const tracker = createMatchTracker('M1', 'P1');
  // welcome-to-intrilex is COMPETITIVE_ONLY — should NOT unlock in tutorial
  tracker.isTerminal = true;
  tracker.winner = 'P1';

  const career = createCareerTracker();
  const profileState = createAchievementProfileState();

  const result = evaluateAchievements(tracker, career, profileState, {
    matchId: 'M1',
    isTutorial: true,
    provenance: 'LOCAL_AUTHORITY',
  });

  const welcomeUnlock = result.newUnlocks.find(u => u.achievementId === 'welcome-to-intrilex');
  assert.equal(welcomeUnlock, undefined, 'welcome-to-intrilex (COMPETITIVE_ONLY) must not unlock in tutorial');
});

test('BL-08: evaluator uses canonical isEligible for TUTORIAL_ALLOWED in tutorial', () => {
  const tracker = createMatchTracker('M1', 'P1');
  // first-blood is TUTORIAL_ALLOWED — should unlock in tutorial if points scored
  tracker.actionsByMode.points = 1;

  const career = createCareerTracker();
  const profileState = createAchievementProfileState();

  const result = evaluateAchievements(tracker, career, profileState, {
    matchId: 'M1',
    isTutorial: true,
    provenance: 'LOCAL_AUTHORITY',
  });

  const firstBloodUnlock = result.newUnlocks.find(u => u.achievementId === 'first-blood');
  assert.ok(firstBloodUnlock, 'first-blood (TUTORIAL_ALLOWED) must unlock in tutorial when points scored');
});

test('BL-08: presenter toast timer is cleared on manual dismissal', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-presenter.js'), 'utf8');
  // The click handler must clear the timeout to prevent double-processing
  assert.ok(src.includes('clearTimeout'), 'presenter must clearTimeout on manual dismissal');
  assert.ok(src.includes('_activeToastTimeout'), 'presenter must track active toast timeout ID');
});

test('BL-08: presenter dedup set is capped to prevent unbounded growth', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-presenter.js'), 'utf8');
  assert.ok(src.includes('200') || src.includes('100'), 'presenter must cap _displayedFactIds size');
  assert.ok(src.includes('slice'), 'presenter must trim the dedup set when capped');
});

test('BL-08: achievement-ui.js uses event delegation for filter buttons', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-ui.js'), 'utf8');
  // Event delegation: single listener on container, uses closest() to find clicked button
  assert.ok(src.includes('addEventListener("click"') || src.includes("addEventListener('click'"),
    'ui must use event delegation on container');
  assert.ok(src.includes('closest'), 'ui must use closest() for event delegation');
  // Must NOT re-bind listeners inside render()
  assert.ok(!src.includes("querySelectorAll('[data-filter]')"),
    'ui must not re-bind filter listeners on every render');
});

test('BL-08: achievement-ui.js highlights active filter button', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-ui.js'), 'utf8');
  assert.ok(src.includes('activeFilter') || src.includes('activeCategory'),
    'ui must pass active filter state to render functions');
  assert.ok(src.includes('active') && src.includes('isActive'),
    'ui must track and render active filter state');
});

test('BL-08: play-state.js resets achievement flags on new match', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/play-state.js'), 'utf8');
  assert.ok(src.includes('_networkAchievementsApplied'),
    'play-state must reset _networkAchievementsApplied flag');
  assert.ok(src.includes('_achievementSummaryHtml'),
    'play-state must reset _achievementSummaryHtml cache');
});

test('BL-08: play-app.js caches achievement summary HTML across re-renders', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/play-app.js'), 'utf8');
  assert.ok(src.includes('_achievementSummaryHtml'),
    'play-app must cache achievement summary HTML to persist across re-renders');
  assert.ok(src.includes('state._achievementSummaryHtml !== undefined'),
    'play-app must check cached HTML before calling finishMatch');
});

test('BL-08: evaluator imports isEligible from eligibility module', async () => {
  const src = await readFile(path.join(root, 'packages/achievements/src/evaluator.mjs'), 'utf8');
  assert.ok(src.includes("from './eligibility.mjs'"),
    'evaluator must import from eligibility module');
  assert.ok(src.includes('isEligible'),
    'evaluator must use canonical isEligible function');
  // Must NOT use inline COMPETITIVE_ONLY check
  assert.ok(!src.includes("eligibilityScope === 'COMPETITIVE_ONLY' && isTutorial"),
    'evaluator must not use inline eligibility check (use canonical isEligible)');
});

test('BL-08: persistence functions log errors instead of silently swallowing', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/persistence.js'), 'utf8');
  // All three achievement persistence functions must log errors
  assert.ok(src.includes("console.error('[achievements] Failed to save state"),
    'saveAchievementState must log IndexedDB failures');
  assert.ok(src.includes("console.error('[achievements] Failed to load state"),
    'getAchievementState must log IndexedDB failures');
  assert.ok(src.includes("console.error('[achievements] Failed to reset state"),
    'resetAchievementState must log IndexedDB failures');
});

test('BL-08: runtime persist catch blocks log errors instead of swallowing', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/achievements/achievement-runtime.js'), 'utf8');
  // No more silent .catch(() => {}) blocks — all must log
  assert.ok(!src.includes('.catch(() => {}'),
    'runtime must not silently swallow persist errors');
  assert.ok(!src.includes('.catch(() => { /* non-fatal */ })'),
    'runtime must not silently swallow persist errors with non-fatal comment');
  assert.ok(src.includes('console.error'),
    'runtime persist catch blocks must log errors');
});

// ── Match-authority package integration ──

test('BL-07: match-authority package.json includes achievements dependency', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'packages/match-authority/package.json'), 'utf8'));
  // Either in dependencies or peerDependencies or workspace
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
  assert.ok(
    deps['@intrilex/achievements'] || Object.keys(deps).some(k => k.includes('achievements')),
    'match-authority must depend on @intrilex/achievements'
  );
});
