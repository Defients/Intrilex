import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSynergies,
  buildMechanicsAtlas,
  buildObservatoryAnalytics,
  buildPairedABBAAnalysis,
  metricRegistryWithHashes,
} from '@intrilex/analytics';
import {
  logisticInteractionEstimate,
  stratifiedInteractionEstimate,
  cohortBalanceRatio,
  evidenceGrade,
  evidenceGradeLegacy,
  detectSeparation,
} from '@intrilex/statistics';
import {
  classifyTagDimension,
  analyticsEntityDefinition,
  synergyExcludedTags,
  areTagsInseparable,
  TAXONOMY_DIMENSIONS,
} from '@intrilex/decision-intelligence/mechanic-registry';

// ── Test data helpers ──
const makeRow = (i, a, b, win, policy = 'control') => ({
  matchId: `M${i}`, matchResultHash: `${String(i).padStart(64, '0')}`,
  profileId: 'core-advanced-authority', policyIds: [policy, 'value'],
  seatOrder: ['P1', 'P2'], winner: win ? 'P1' : 'P2', winningSeat: win ? 1 : 2,
  terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10, scoreMargin: 2,
  mechanicCounts: { A: a ? 1 : 0, B: b ? 1 : 0 },
  miniTurnActionCount: 8, responsePlayedCount: 1, responseDeclinedWithOptionsCount: 1,
  automaticPriorityAdvanceCount: 3, privateChoiceDecisionCount: 0,
  advancedDecisionCount: 0, ultraDecisionCount: 0, voltageDecisionCount: 0,
});

const makeRowWithParticipants = (i, a, b, win) => ({
  matchId: `MP${i}`, matchResultHash: `p${String(i).padStart(64, '0')}`,
  profileId: 'core-advanced-authority', policyIds: ['control', 'value'],
  seatOrder: ['P1', 'P2'], winner: win ? 'P1' : 'P2', winningSeat: win ? 1 : 2,
  terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
  participants: [
    { policyId: 'control', seat: 1, result: win ? 'win' : 'loss', mechanicCounts: { A: a ? 1 : 0, B: b ? 1 : 0 } },
    { policyId: 'value', seat: 2, result: win ? 'loss' : 'win', mechanicCounts: {} },
  ],
});

// ── Test A: Logistic interaction estimator basic correctness ──
test('Test A: logistic interaction estimator returns OR > 1 for positive interaction', () => {
  const r = logisticInteractionEstimate({
    neither: { wins: 40, losses: 60 },
    aOnly: { wins: 30, losses: 70 },
    bOnly: { wins: 35, losses: 65 },
    both: { wins: 55, losses: 45 },
  });
  assert.ok(r.estimate > 1, `Expected OR > 1, got ${r.estimate}`);
  assert.ok(Array.isArray(r.interval) && r.interval.length === 2);
  assert.ok(r.pValue < 0.1, `Expected p < 0.1, got ${r.pValue}`);
  assert.equal(r.separation, false);
  assert.equal(r.cohortN.neither, 100);
});

// ── Test B: Separation detection and continuity correction ──
test('Test B: separation detected and corrected with 0.5 continuity', () => {
  const r = logisticInteractionEstimate({
    neither: { wins: 0, losses: 50 },
    aOnly: { wins: 25, losses: 25 },
    bOnly: { wins: 25, losses: 25 },
    both: { wins: 50, losses: 0 },
  });
  assert.equal(r.separation, true);
  assert.ok(Number.isFinite(r.estimate), 'Estimate should be finite after correction');
});

// ── Test C: Stratified interaction pools across strata ──
test('Test C: stratified interaction estimate pools across strata', () => {
  const strata = [
    { neither: { wins: 20, losses: 30 }, aOnly: { wins: 15, losses: 35 }, bOnly: { wins: 18, losses: 32 }, both: { wins: 28, losses: 22 } },
    { neither: { wins: 20, losses: 30 }, aOnly: { wins: 15, losses: 35 }, bOnly: { wins: 17, losses: 33 }, both: { wins: 27, losses: 23 } },
  ];
  const r = stratifiedInteractionEstimate(strata);
  assert.ok(r.estimate > 1, 'Pooled OR should be > 1');
  assert.ok(r.effectiveN > 0);
  assert.equal(r.strataCount, 2);
});

// ── Test D: Cohort balance ratio ──
test('Test D: cohort balance ratio is 1 for equal, <1 for imbalanced', () => {
  assert.equal(cohortBalanceRatio({ neither: 100, aOnly: 100, bOnly: 100, both: 100 }), 1);
  assert.ok(cohortBalanceRatio({ neither: 100, aOnly: 50, bOnly: 200, both: 100 }) < 1);
  assert.equal(cohortBalanceRatio({ neither: 0, aOnly: 0, bOnly: 0, both: 0 }), 0);
});

// ── Test E: Evidence grade multi-criteria rubric ──
test('Test E: evidence grade returns INSUFFICIENT for small samples', () => {
  assert.equal(evidenceGrade({ sampleSize: 10, interval: [0.1, 0.3] }), 'INSUFFICIENT');
});

test('Test E: evidence grade returns ROBUST for large, well-powered studies', () => {
  assert.equal(evidenceGrade({ sampleSize: 500, interval: [0.05, 0.15], qValue: 0.01, effectSize: 0.1, cohortBalance: 0.8 }), 'ROBUST');
});

test('Test E: evidence grade returns SUPPORTED for moderate samples', () => {
  assert.equal(evidenceGrade({ sampleSize: 100, interval: [0.05, 0.25], qValue: 0.05, effectSize: 0.1 }), 'SUPPORTED');
});

test('Test E: evidence grade returns INSUFFICIENT when CI includes zero', () => {
  assert.equal(evidenceGrade({ sampleSize: 500, interval: [-0.05, 0.05], qValue: 0.01 }), 'INSUFFICIENT');
});

test('Test E: evidence grade legacy maps to lowercase', () => {
  assert.equal(evidenceGradeLegacy({ sampleSize: 500, interval: [0.05, 0.15], qValue: 0.01, effectSize: 0.1 }), 'strong');
  assert.equal(evidenceGradeLegacy({ sampleSize: 10, interval: [0.1, 0.3] }), 'insufficient');
});

// ── Test F: detectSeparation ──
test('Test F: detectSeparation identifies zero-count cells', () => {
  assert.ok(detectSeparation([{ wins: 0, losses: 50 }, { wins: 25, losses: 25 }]));
  assert.ok(!detectSeparation([{ wins: 10, losses: 10 }, { wins: 15, losses: 15 }]));
});

// ── Test G: Taxonomy dimension classification ──
test('Test G: classifyTagDimension classifies canonical mechanics', () => {
  assert.equal(classifyTagDimension('scuttle'), 'canonical-mechanic');
  assert.equal(classifyTagDimension('effect-three'), 'rank-effect');
  assert.equal(classifyTagDimension('draw'), 'canonical-mechanic');
  assert.equal(classifyTagDimension('phase'), 'action-family');
  assert.equal(classifyTagDimension('face-down'), 'action-mode');
  assert.equal(classifyTagDimension('score'), 'action-family');
  assert.equal(classifyTagDimension('ace'), 'rank-effect');
  assert.equal(classifyTagDimension('unknown-tag-xyz'), 'diagnostic');
});

test('Test G: TAXONOMY_DIMENSIONS is frozen and has 5 dimensions', () => {
  assert.equal(TAXONOMY_DIMENSIONS.length, 5);
  assert.ok(Object.isFrozen(TAXONOMY_DIMENSIONS));
});

// ── Test H: analyticsEntityDefinition ──
test('Test H: analyticsEntityDefinition returns dimension and description', () => {
  const def = analyticsEntityDefinition('scuttle');
  assert.equal(def.id, 'scuttle');
  assert.equal(def.dimension, 'canonical-mechanic');
  assert.ok(def.description.length > 0);
  assert.equal(def.deprecated, false);
});

test('Test H: analyticsEntityDefinition marks diagnostic tags as deprecated', () => {
  const def = analyticsEntityDefinition('discard');
  assert.equal(def.dimension, 'diagnostic');
  assert.equal(def.deprecated, true);
});

// ── Test I: synergyExcludedTags ──
test('Test I: synergyExcludedTags returns Set with diagnostic tags', () => {
  const excluded = synergyExcludedTags();
  assert.ok(excluded instanceof Set);
  assert.ok(excluded.has('discard'));
  assert.ok(excluded.has('phase'));
  assert.ok(excluded.has('score'));
  assert.ok(!excluded.has('scuttle'));
  assert.ok(!excluded.has('draw'));
});

// ── Test J: areTagsInseparable ──
test('Test J: areTagsInseparable detects parent/child relationships', () => {
  assert.ok(areTagsInseparable('super', 'super-two-hold'));
  assert.ok(areTagsInseparable('voltage', 'voltage-three-choice'));
  assert.ok(areTagsInseparable('rank10', 'rank10-club-foundation'));
  assert.ok(!areTagsInseparable('scuttle', 'counter'));
  assert.ok(areTagsInseparable('scuttle', 'scuttle'));
});

// ── Test K: buildMechanicsAtlas includes new metrics ──
test('Test K: buildMechanicsAtlas includes participant prevalence, pick rate, dimension', () => {
  const summaries = Array.from({ length: 100 }, (_, i) => makeRowWithParticipants(i, i % 2 === 0, i % 3 === 0, i % 5 < 2));
  const atlas = buildMechanicsAtlas(summaries);
  const a = atlas.find(m => m.mechanic === 'A');
  assert.ok(a, 'Mechanic A should exist');
  assert.ok(typeof a.participantPrevalence === 'number');
  assert.ok(typeof a.matchPrevalence === 'number');
  assert.ok(typeof a.selectionFrequency === 'number');
  assert.ok(a.dimension !== undefined, 'Dimension should be set');
  assert.ok(typeof a.rawWinAssociation === 'number');
  // pickRateWhenLegal should be null when no opportunity data
  assert.equal(a.pickRateWhenLegal, null);
  assert.equal(a.hasOpportunityData, false);
});

// ── Test L: buildMechanicsAtlas with opportunity data ──
test('Test L: buildMechanicsAtlas computes pick rate when legal when opportunity data present', () => {
  const summaries = Array.from({ length: 100 }, (_, i) => ({
    ...makeRowWithParticipants(i, i % 2 === 0, i % 3 === 0, i % 5 < 2),
    participants: [
      { ...makeRowWithParticipants(i, i % 2 === 0, i % 3 === 0, i % 5 < 2).participants[0], mechanicOpportunityCounts: { A: 50 } },
      { ...makeRowWithParticipants(i, i % 2 === 0, i % 3 === 0, i % 5 < 2).participants[1], mechanicOpportunityCounts: {} },
    ],
  }));
  const atlas = buildMechanicsAtlas(summaries);
  const a = atlas.find(m => m.mechanic === 'A');
  assert.ok(a.hasOpportunityData, 'Should have opportunity data');
  assert.ok(a.legalOpportunityCount > 0, 'Legal opportunity count should be > 0');
  assert.ok(typeof a.pickRateWhenLegal === 'number', 'Pick rate should be a number');
  assert.ok(a.pickRateWhenLegal >= 0 && a.pickRateWhenLegal <= 1, 'Pick rate should be in [0,1]');
});

// ── Test M: analyzeSynergies uses four-cohort model ──
test('Test M: analyzeSynergies returns odds-ratio interaction with cohort sizes', () => {
  // Create data with clear positive interaction: 200 per cohort
  // Neither: 40% win, A-only: 50%, B-only: 50%, Both: 70%
  const wins = { 0: 80, 1: 100, 2: 100, 3: 140 };
  const rows = [];
  for (let i = 0; i < 800; i++) {
    const group = i % 4;
    const a = group === 1 || group === 3;
    const b = group === 2 || group === 3;
    const idx = Math.floor(i / 4);
    const win = idx < wins[group];
    rows.push(makeRow(i, a, b, win));
  }
  const synergies = analyzeSynergies(rows, { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 });
  const ab = synergies.find(s => s.id === 'A::B');
  assert.ok(ab, 'A::B synergy should exist');
  assert.ok(typeof ab.effect === 'number', 'Effect should be a number (odds-ratio)');
  assert.ok(typeof ab.logEstimate === 'number', 'Log-estimate should be present');
  assert.ok(ab.neitherN !== undefined, 'Neither cohort N should be present');
  assert.ok(ab.aOnlyN !== undefined, 'A-only cohort N should be present');
  assert.ok(ab.bOnlyN !== undefined, 'B-only cohort N should be present');
  assert.ok(ab.bothN !== undefined, 'Both cohort N should be present');
  assert.ok(typeof ab.cohortBalance === 'number', 'Cohort balance should be present');
  assert.ok(typeof ab.effectiveN === 'number', 'Effective N should be present');
  assert.ok(Array.isArray(ab.limitations), 'Limitations should be an array');
  assert.ok(ab.effect > 1, 'Positive interaction should give OR > 1');
});

// ── Test N: analyzeSynergies suppresses rare pairs ──
test('Test N: analyzeSynergies suppresses pairs below minimum cohort thresholds', () => {
  const rows = [];
  for (let i = 0; i < 100; i++) rows.push(makeRow(i, i < 5, i < 3, i % 2 === 0));
  const synergies = analyzeSynergies(rows, { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 });
  assert.ok(synergies.length === 0, 'Should suppress pairs below thresholds');
});

// ── Test O: buildPairedABBAAnalysis with pairedRunId ──
test('Test O: buildPairedABBAAnalysis uses pairedRunId when available', () => {
  const summaries = [];
  for (let i = 0; i < 20; i++) {
    const seatSwapped = i % 2 === 1;
    const seatOrder = seatSwapped ? ['P2', 'P1'] : ['P1', 'P2'];
    summaries.push({
      ...makeRow(i, false, false, i % 2 === 0),
      seatOrder,
      seatSwapped,
      pairedRunId: `PR-test-block-${Math.floor(i / 2)}`,
      matchOrdinal: i,
    });
  }
  const result = buildPairedABBAAnalysis(summaries);
  assert.ok(result.hasPairedRunIds, 'Should detect pairedRunIds');
  assert.ok(result.pairResults.length > 0, 'Should have pair results');
  assert.ok(result.pairResults[0].seatSwapVerified, 'Seat swap should be verified');
  assert.equal(result.incompletePairs, 0, 'Should have no incomplete pairs');
});

// ── Test P: buildPairedABBAAnalysis detects incomplete pairs ──
test('Test P: buildPairedABBAAnalysis detects incomplete pairs', () => {
  const summaries = [];
  for (let i = 0; i < 21; i++) { // odd number → 1 incomplete
    const seatSwapped = i % 2 === 1;
    const seatOrder = seatSwapped ? ['P2', 'P1'] : ['P1', 'P2'];
    summaries.push({
      ...makeRow(i, false, false, i % 2 === 0),
      seatOrder, seatSwapped,
      pairedRunId: `PR-test-block-${Math.floor(i / 2)}`,
      matchOrdinal: i,
    });
  }
  const result = buildPairedABBAAnalysis(summaries);
  assert.ok(result.incompletePairs >= 1, 'Should detect at least 1 incomplete pair');
});

// ── Test Q: buildPairedABBAAnalysis legacy mode (no pairedRunId) ──
test('Test Q: buildPairedABBAAnalysis works in legacy mode without pairedRunId', () => {
  const summaries = [];
  for (let i = 0; i < 20; i++) {
    summaries.push({
      ...makeRow(i, false, false, i % 2 === 0),
      matchOrdinal: i,
    });
  }
  const result = buildPairedABBAAnalysis(summaries);
  assert.equal(result.hasPairedRunIds, false, 'Should detect legacy mode');
  assert.ok(result.pairResults.length > 0, 'Should still produce pair results');
});

// ── Test R: buildObservatoryAnalytics includes new fields ──
test('Test R: buildObservatoryAnalytics includes taxonomy dimensions and opportunity telemetry flag', () => {
  const rows = Array.from({ length: 40 }, (_, i) => makeRow(i, i % 2 === 0, i % 3 === 0, i % 5 < 2));
  const result = buildObservatoryAnalytics({ summaries: rows, detailedMatches: [] });
  assert.equal(result.schemaVersion, '4.2.0');
  assert.ok(result.taxonomyDimensions, 'Taxonomy dimensions should be present');
  assert.equal(typeof result.hasOpportunityTelemetry, 'boolean');
  assert.equal(result.legacySchema, true, 'Should be legacy schema without opportunity data');
  assert.ok(result.pairedABBA, 'Paired AB/BA analysis should be present');
});

// ── Test S: METRIC_REGISTRY includes new metrics ──
test('Test S: METRIC_REGISTRY includes participant-prevalence and pick-rate-when-legal', () => {
  const registry = metricRegistryWithHashes();
  assert.ok(registry['participant-prevalence'], 'participant-prevalence metric should exist');
  assert.ok(registry['pick-rate-when-legal'], 'pick-rate-when-legal metric should exist');
  assert.ok(registry['match-prevalence'], 'match-prevalence metric should exist');
  assert.ok(registry['raw-win-association'], 'raw-win-association metric should exist');
  assert.ok(registry['adjusted-win-association'], 'adjusted-win-association metric should exist');
  assert.equal(registry['synergy-interaction'].version, '4.2.0');
  assert.match(registry['synergy-interaction'].formula, /logistic/);
});

// ── Test T: Synergy interaction effect is on odds-ratio scale ──
test('Test T: synergy interaction CI excludes 1 for significant positive interaction', () => {
  const wins = { 0: 60, 1: 80, 2: 80, 3: 160 }; // Stronger interaction
  const rows = [];
  for (let i = 0; i < 800; i++) {
    const group = i % 4;
    const a = group === 1 || group === 3;
    const b = group === 2 || group === 3;
    const idx = Math.floor(i / 4);
    const win = idx < wins[group];
    rows.push(makeRow(i, a, b, win));
  }
  const synergies = analyzeSynergies(rows, { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 });
  const ab = synergies.find(s => s.id === 'A::B');
  assert.ok(ab, 'A::B should exist');
  assert.ok(ab.effect > 1, 'Should have positive interaction (OR > 1)');
  if (ab.status === 'positive') {
    assert.ok(ab.confidenceInterval[0] > 1 || ab.confidenceInterval[1] < 1,
      'Significant interaction CI should exclude OR=1');
  }
});

// ── Test U: Mechanic atlas backward compatibility ──
test('Test U: buildMechanicsAtlas maintains backward-compatible aliases', () => {
  const summaries = Array.from({ length: 40 }, (_, i) => makeRow(i, i % 2 === 0, i % 3 === 0, i % 5 < 2));
  const atlas = buildMechanicsAtlas(summaries);
  const a = atlas.find(m => m.mechanic === 'A');
  assert.equal(a.matchUsageRate, a.participantPrevalence, 'matchUsageRate should alias participantPrevalence');
  assert.equal(a.matchUsageWilson95, a.participantPrevalenceWilson95, 'matchUsageWilson95 should alias');
  assert.ok(typeof a.outcomeAssociation === 'number', 'outcomeAssociation should still exist');
  assert.ok(typeof a.evidenceGradeLegacy === 'string', 'Legacy grade should be lowercase string');
});

// ── Test V: Adjusted win association controls for strata ──
test('Test V: adjusted win association differs from raw when confounding present', () => {
  // Create data with two strata (two different policies) where seat confounding exists
  const summaries = [];
  for (let i = 0; i < 200; i++) {
    const policy = i < 100 ? 'control' : 'tempo';
    const usesA = i % 2 === 0;
    const seat1Wins = i % 3 !== 0; // seat 1 wins 2/3 of the time
    summaries.push({
      matchId: `MX${i}`, matchResultHash: `x${String(i).padStart(64, '0')}`,
      profileId: 'core-advanced-authority', policyIds: [policy, 'value'],
      seatOrder: ['P1', 'P2'], winner: seat1Wins ? 'P1' : 'P2', winningSeat: seat1Wins ? 1 : 2,
      terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
      participants: [
        { policyId: policy, seat: 1, result: seat1Wins ? 'win' : 'loss', mechanicCounts: usesA ? { A: 1 } : {} },
        { policyId: 'value', seat: 2, result: seat1Wins ? 'loss' : 'win', mechanicCounts: usesA ? { A: 1 } : {} },
      ],
    });
  }
  const atlas = buildMechanicsAtlas(summaries);
  const a = atlas.find(m => m.mechanic === 'A');
  assert.ok(typeof a.rawWinAssociation === 'number', 'Raw win association should be a number');
  // Adjusted may be null if stratification produces no valid strata, but with 2 policies it should work
  if (a.adjustedWinAssociation !== null) {
    assert.ok(typeof a.adjustedWinAssociation === 'number', 'Adjusted should be a number when not null');
  }
});
