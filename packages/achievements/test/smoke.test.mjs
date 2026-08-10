import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCatalog,
  getCatalogById,
  getDefinition,
  getAllIds,
  validateCatalog,
  assertCatalogValid,
  LAUNCH_CONSTRAINTS,
  HIDDEN_ACHIEVEMENT_IDS,
  AP_BY_RARITY,
  RARITY,
  CATEGORY,
  PROGRESS_TYPE,
  FACT_KIND,
  ELIGIBILITY_SCOPE,
  createAchievementProfileState,
  createMatchTracker,
  createCareerTracker,
  createTrackers,
  deriveAchievementFacts,
  createCheckpointFact,
  reduceFacts,
  reduceFact,
  evaluateAchievements,
  applyUnlocks,
  computeTotalAP,
  countEarned,
  isEarned,
  getProgress,
  isQualifyingMatch,
  isEligible,
  localVsAIContext,
  networkMatchContext,
  migrateLegacyData,
  isMigrated,
  serializeMatchTracker,
  deserializeMatchTracker,
  serializeCareerTracker,
  deserializeCareerTracker,
  LAUNCH_SPADES_EFFECTS,
  LAUNCH_SPADES_EFFECT_COUNT,
  CARD_MASTERY_ACHIEVEMENT_IDS,
} from '@intrilex/achievements';

test('catalog has exactly 56 achievements', () => {
  const catalog = getCatalog();
  assert.equal(catalog.length, 56);
});

test('catalog validates against all launch constraints', () => {
  const result = validateCatalog();
  assert.equal(result.valid, true, `Validation errors:\n${result.errors.join('\n')}`);
});

test('assertCatalogValid does not throw', () => {
  assert.doesNotThrow(() => assertCatalogValid());
});

test('rarity distribution matches launch constraints', () => {
  const catalog = getCatalog();
  const counts = { COMMON: 0, CLEVER: 0, RARE: 0, INTRILEX: 0 };
  for (const def of catalog) {
    counts[def.rarity]++;
  }
  assert.equal(counts.COMMON, LAUNCH_CONSTRAINTS.COMMON_COUNT);
  assert.equal(counts.CLEVER, LAUNCH_CONSTRAINTS.CLEVER_COUNT);
  assert.equal(counts.RARE, LAUNCH_CONSTRAINTS.RARE_COUNT);
  assert.equal(counts.INTRILEX, LAUNCH_CONSTRAINTS.INTRILEX_COUNT);
});

test('exactly 4 hidden achievements with correct IDs', () => {
  const catalog = getCatalog();
  const hidden = catalog.filter(d => d.hidden);
  assert.equal(hidden.length, 4);
  const hiddenIds = hidden.map(d => d.id).sort();
  assert.deepEqual(hiddenIds, [...HIDDEN_ACHIEVEMENT_IDS].sort());
});

test('total AP equals 1320', () => {
  const catalog = getCatalog();
  let total = 0;
  for (const def of catalog) {
    total += def.achievementPoints;
  }
  assert.equal(total, 1320);
});

test('all IDs are unique', () => {
  const ids = getAllIds();
  assert.equal(new Set(ids).size, ids.length);
});

test('getDefinition returns correct definition', () => {
  const def = getDefinition('welcome-to-intrilex');
  assert.ok(def);
  assert.equal(def.id, 'welcome-to-intrilex');
  assert.equal(def.rarity, RARITY.COMMON);
  assert.equal(def.achievementPoints, 10);
});

test('Card Savant has correct prerequisites', () => {
  const def = getDefinition('card-savant');
  assert.ok(def);
  assert.equal(def.progressType, PROGRESS_TYPE.COMPOSITE);
  assert.equal(def.prerequisiteAchievementIds?.length, CARD_MASTERY_ACHIEVEMENT_IDS.length);
  for (const id of CARD_MASTERY_ACHIEVEMENT_IDS) {
    assert.ok(def.prerequisiteAchievementIds.includes(id), `Missing prereq: ${id}`);
  }
});

test('createAchievementProfileState returns valid empty state', () => {
  const state = createAchievementProfileState();
  assert.ok(state);
  assert.equal(state.schemaVersion, '1.0.0');
  assert.deepEqual(state.earned, {});
  assert.deepEqual(state.progress, {});
  assert.equal(countEarned(state), 0);
  assert.equal(computeTotalAP(state, getCatalogById()), 0);
});

test('isQualifyingMatch correctly filters contexts', () => {
  assert.ok(isQualifyingMatch(localVsAIContext('M1', 'P1')));
  assert.ok(isQualifyingMatch(networkMatchContext('M1', 'P1')));
  assert.ok(!isQualifyingMatch({ isSimulation: true }));
  assert.ok(!isQualifyingMatch({ isReplayPlayback: true }));
  assert.ok(!isQualifyingMatch({ isSpectator: true }));
  assert.ok(!isQualifyingMatch({ isAiVsAi: true }));
});

test('isEligible respects COMPETITIVE_ONLY scope', () => {
  const tutorialCtx = localVsAIContext('M1', 'P1', true);
  assert.ok(!isEligible('welcome-to-intrilex', tutorialCtx)); // COMPETITIVE_ONLY
  assert.ok(isEligible('first-blood', tutorialCtx)); // TUTORIAL_ALLOWED
});

test('deriveAchievementFacts produces facts from engine events', () => {
  const events = [
    { type: 'CORE_FOUNDATION_SETUP_APPLIED', payload: { profileId: 'core-advanced-authority' } },
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ];
  const facts = deriveAchievementFacts(events, {
    matchId: 'M1',
    humanPlayerId: 'P1',
    stateCards: { C1: { id: 'C1', identity: '5♠' } },
  });
  assert.ok(facts.length > 0);
  assert.ok(facts.some(f => f.kind === FACT_KIND.MATCH_STARTED));
  assert.ok(facts.some(f => f.kind === FACT_KIND.CARD_PLAYED_FOR_POINTS));
});

test('reduceFacts + evaluateAchievements unlocks First Blood', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const events = [
    { type: 'CORE_CARD_SCORED', payload: { playerId: 'P1', cardId: 'C1', pointValue: 5 }, sequence: 1 },
  ];
  const facts = deriveAchievementFacts(events, {
    matchId: 'M1',
    humanPlayerId: 'P1',
    stateCards: { C1: { id: 'C1', identity: '5♣' } },
  });
  reduceFacts(tracker, career, facts);
  const profileState = createAchievementProfileState();
  const result = evaluateAchievements(tracker, career, profileState, {
    matchId: 'M1',
    isTutorial: false,
  });
  assert.ok(result.newUnlocks.some(u => u.achievementId === 'first-blood'));
});

test('idempotency: processing same fact twice does not duplicate', () => {
  const { tracker, career } = createTrackers('M1', 'P1');
  const fact = {
    schemaVersion: '1.0.0',
    factId: 'M1:0:0:CARD_PLAYED_FOR_POINTS',
    matchId: 'M1',
    sequence: 0,
    stateRevision: null,
    actorId: 'P1',
    kind: FACT_KIND.CARD_PLAYED_FOR_POINTS,
    payload: { isHuman: true, rank: '5', mode: 'points' },
    provenance: 'LOCAL_AUTHORITY',
  };
  reduceFact(tracker, career, fact);
  const pointsAfter1 = tracker.actionsByMode.points;
  reduceFact(tracker, career, fact);
  const pointsAfter2 = tracker.actionsByMode.points;
  assert.equal(pointsAfter1, pointsAfter2);
});

test('serialize/deserialize match tracker round-trips', () => {
  const tracker = createMatchTracker('M1', 'P1');
  tracker.actionsByMode.points = 3;
  tracker.ranksPlayedForPoints.add('5');
  tracker.zonesInteractedThisMatch.add('DP');
  const serialized = serializeMatchTracker(tracker);
  const deserialized = deserializeMatchTracker(serialized);
  assert.equal(deserialized.actionsByMode.points, 3);
  assert.ok(deserialized.ranksPlayedForPoints.has('5'));
  assert.ok(deserialized.zonesInteractedThisMatch.has('DP'));
});

test('serialize/deserialize career tracker round-trips', () => {
  const career = createCareerTracker();
  career.gamesWon = 5;
  career.ranksPlayedForPoints.add('A');
  career.zonesDiscovered.add('PR');
  const serialized = serializeCareerTracker(career);
  const deserialized = deserializeCareerTracker(serialized);
  assert.equal(deserialized.gamesWon, 5);
  assert.ok(deserialized.ranksPlayedForPoints.has('A'));
  assert.ok(deserialized.zonesDiscovered.has('PR'));
});

test('migrateLegacyData preserves trustworthy evidence', () => {
  const legacyProfile = {
    badges: [{ id: 'supercharged' }, { id: 'first-duel' }],
    record: { wins: 30, losses: 10, draws: 0 },
  };
  const legacyStats = { totalMatches: 40, wins: 30, supersDeclared: 3 };
  const result = migrateLegacyData(legacyProfile, legacyStats);
  assert.ok(isMigrated(result.state));
  assert.ok(result.migratedAchievements.includes('supercharged'));
  assert.ok(result.migratedAchievements.includes('welcome-to-intrilex'));
  assert.ok(result.migratedAchievements.includes('getting-dangerous')); // 30 >= 25
  assert.ok(!result.migratedAchievements.includes('from-behind')); // unshaken not enough evidence
  assert.ok(result.migrationNotes.some(n => n.includes('unshaken')));
});

test('migrateLegacyData does not fabricate from-behind from unshaken', () => {
  const legacyProfile = {
    badges: [{ id: 'unshaken' }],
    record: { wins: 1, losses: 0, draws: 0 },
  };
  const result = migrateLegacyData(legacyProfile, {});
  assert.ok(!result.migratedAchievements.includes('from-behind'));
});

test('computeTotalAP derives from earned achievements', () => {
  const state = createAchievementProfileState();
  state.earned['welcome-to-intrilex'] = { unlockedAt: '2024-01-01', matchId: 'M1', provenance: 'LOCAL_AUTHORITY' };
  state.earned['the-stackening'] = { unlockedAt: '2024-01-01', matchId: 'M1', provenance: 'LOCAL_AUTHORITY' };
  const ap = computeTotalAP(state, getCatalogById());
  assert.equal(ap, 10 + 75); // COMMON + INTRILEX
});

test('LAUNCH_SPADES_EFFECTS has correct count', () => {
  assert.equal(LAUNCH_SPADES_EFFECTS.length, LAUNCH_SPADES_EFFECT_COUNT);
  assert.ok(LAUNCH_SPADES_EFFECT_COUNT >= 5, 'Should have at least 5 launch Spades effects');
});

test('applyUnlocks updates profile state correctly', () => {
  const state = createAchievementProfileState();
  const unlocks = [{
    achievementId: 'first-blood',
    unlockedAt: '2024-01-01T00:00:00Z',
    matchId: 'M1',
    provenance: 'LOCAL_AUTHORITY',
    rulesVersion: '4.3.1',
    productVersion: '0.24.2',
  }];
  const progressUpdates = {
    'no-longer-new': { achievementId: 'no-longer-new', type: 'COUNTER', current: 1, target: 5, setItems: [], completed: false },
  };
  const newState = applyUnlocks(state, unlocks, progressUpdates);
  assert.ok(isEarned(newState, 'first-blood'));
  assert.ok(getProgress(newState, 'no-longer-new'));
  assert.equal(countEarned(newState), 1);
});
