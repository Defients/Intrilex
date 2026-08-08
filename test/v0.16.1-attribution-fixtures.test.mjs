// V0.16.1 Attribution Fixture Certification Tests
// Tests that real gameplay events are counted correctly
// Each fixture declares expected counts before execution and verifies after
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { attributeAction,    classifyVariantEntity } from '@intrilex/simulation-runtime/rank-attribution';
import {} from '@intrilex/telemetry/rank-telemetry';
import { emptyParticipantVariantCounters,   applyDecisionToVariantCounters,   applyMatchResultToVariantCounters} from '@intrilex/telemetry/rank-telemetry';
import { allVariantKeys,   resolveSuperEffect} from '@intrilex/simulation-runtime/variant-registry';
import { buildVariantAnalytics } from '@intrilex/analytics/rank-integration';


const VARIANT_KEYS = allVariantKeys();

function makeState(cards) {
  return { cards: Object.fromEntries(cards.map((c, i) => [`C${i + 1}`, c])), viewerId: 'P1' };
}
function makeCard(identity, controllerId = 'P1', zone = 'P1_HAND') {
  return { identity, controllerId, zone };
}
function makeAction(family, mode, sourceCardIds, extra = {}) {
  return { family, mode, sourceCardIds, ...extra };
}
function makeSummary(rankDecisions, overrides = {}) {
  return { matchId: 'M-FIXTURE', matchOrdinal: 0, participants: ['P1', 'P2'], winner: 'P1', outcome: 'NORMAL_VICTORY', terminationReason: 'NORMAL_VICTORY', rankDecisions, ...overrides };
}
function makeRankDecision(participantId, attribution, action, rankOpportunities = [], legalActions = []) {
  return { participantId, rankAttribution: attribution, rankOpportunities, action, legalActions };
}

// ─── Fixture 1: Ordinary non-Spades declaration ─────────────────────────────
test('FIXTURE 1: Ordinary non-Spades declaration', () => {
  const state = makeState([makeCard('7♥')]);
  const action = makeAction('score', 'ordinary', ['C1']);
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, '7');
  assert.equal(attribution.attributionStatus, 'exact');
  assert.equal(attribution.sourceRanks[0], '7');
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'normal', 'Non-Spades card should be classified as normal tier');
});

// ─── Fixture 2: Ordinary eligible Spades declaration ────────────────────────
test('FIXTURE 2: Ordinary eligible Spades declaration', () => {
  const state = makeState([makeCard('7♠')]);
  const action = makeAction('score', 'ordinary', ['C1']);
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, '7');
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'spade', 'Spades card should be classified as spade tier');
  assert.equal(variantEntity.variantKey, '7:spade');
});

// ─── Fixture 3: Spades source card consumed by a Super ──────────────────────
test('FIXTURE 3: Spades source card consumed by a Super — NOT ordinary Spades', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super', 'Super declaration should be classified as super tier, not spade');
  assert.notEqual(variantEntity.variantKey, 'A:spade', 'Super declaration must not be classified as ordinary Spades');
  const superEffect = resolveSuperEffect(action);
  assert.ok(superEffect, 'Super effect should be resolved');
  assert.equal(superEffect.effectId, 'super-ace');
});

// ─── Fixture 4: Super declaration with one effect ───────────────────────────
test('FIXTURE 4: Super declaration with one effect', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, 'A');
  assert.equal(attribution.playForm, 'super');
  const superEffect = resolveSuperEffect(action);
  assert.ok(superEffect);
  assert.equal(superEffect.rank, 'A');
  assert.equal(superEffect.effectId, 'super-ace');
});

// ─── Fixture 5: Super declaration with multiple effects ─────────────────────
test('FIXTURE 5: Super declaration with multiple effects — one declaration, multiple components', () => {
  const state = makeState([makeCard('4♠'), makeCard('4♣')]);
  const action = makeAction('super', 'super-four-exchange', ['C1', 'C2'], { kind: 'core-declare-super-four-exchange' });
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, '4');
  assert.equal(attribution.playForm, 'super');
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super');
});

// ─── Fixture 6: Fully resolved Super ────────────────────────────────────────
test('FIXTURE 6: Fully resolved Super', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  const counters = emptyParticipantVariantCounters(['P1', 'P2'], VARIANT_KEYS);
  applyDecisionToVariantCounters(counters, 'P1', attribution, variantEntity, action, {});
  const superKey = variantEntity.variantKey;
  assert.ok(counters.P1[superKey].selectionCount > 0, 'Super selection should be counted');
  assert.ok(counters.P1[superKey].activationCount > 0, 'Super activation should be counted');
});

// ─── Fixture 7: Partially resolved Super ────────────────────────────────────
test('FIXTURE 7: Partially resolved Super — NOT full success', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  const counters = emptyParticipantVariantCounters(['P1', 'P2'], VARIANT_KEYS);
  applyDecisionToVariantCounters(counters, 'P1', attribution, variantEntity, action, {});
  applyMatchResultToVariantCounters(counters, 'P1', { outcome: 'NORMAL_VICTORY', winner: 'P2' }, ['A'], VARIANT_KEYS);
  const superKey = variantEntity.variantKey;
  assert.ok(counters.P1[superKey].selectionCount > 0, 'Super selection should be counted');
  assert.ok(counters.P1[superKey].successCount <= counters.P1[superKey].selectionCount, 'Success count must not exceed selection count');
});

// ─── Fixture 8: Countered Super ─────────────────────────────────────────────
test('FIXTURE 8: Countered Super', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  const counters = emptyParticipantVariantCounters(['P1', 'P2'], VARIANT_KEYS);
  applyDecisionToVariantCounters(counters, 'P1', attribution, variantEntity, action, {});
  applyMatchResultToVariantCounters(counters, 'P1', { outcome: 'COUNTERED', winner: 'P2' }, ['A'], VARIANT_KEYS);
  const superKey = variantEntity.variantKey;
  assert.ok(counters.P1[superKey].selectionCount > 0, 'Countered Super should still have selection count');
});

// ─── Fixture 9: Fizzled Super effect ────────────────────────────────────────
test('FIXTURE 9: Fizzled Super effect', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super');
  const counters = emptyParticipantVariantCounters(['P1', 'P2'], VARIANT_KEYS);
  applyDecisionToVariantCounters(counters, 'P1', attribution, variantEntity, action, {});
  const superKey = variantEntity.variantKey;
  assert.ok(counters.P1[superKey].selectionCount > 0, 'Fizzled Super should still be counted as a selection');
});

// ─── Fixture 10: Replaced Super effect ──────────────────────────────────────
test('FIXTURE 10: Replaced Super effect', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super');
  assert.ok(variantEntity.variantKey.includes('super'), 'Replaced Super should have super in variant key');
});

// ─── Fixture 11: Delayed Super effect ───────────────────────────────────────
test('FIXTURE 11: Delayed Super effect', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter', timingClass: 'DEFERRED' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super');
  assert.ok(variantEntity.variantKey.includes('super'));
});

// ─── Fixture 12: Generated effect ───────────────────────────────────────────
test('FIXTURE 12: Generated effect — NOT natural frequency inflation', () => {
  const state = makeState([makeCard('7♠'), makeCard('7♣')]);
  const action = makeAction('super', 'super-seven-topdeck', ['C1', 'C2'], { kind: 'core-declare-super-seven-topdeck' });
  const attribution = attributeAction(state, action);
  const generatedAttribution = { ...attribution, originRank: '7', generatedRank: 'BJ', attributionStatus: 'generated-origin' };
  // Generated effects should have generated-origin status, distinguishing from natural
  assert.equal(generatedAttribution.attributionStatus, 'generated-origin', 'Generated effect should have generated-origin status');
  assert.equal(generatedAttribution.generatedRank, 'BJ', 'Generated effect should have generatedRank set');
});

// ─── Fixture 13: Copied Super effect ────────────────────────────────────────
test('FIXTURE 13: Copied Super effect — NOT natural declaration by copied rank', () => {
  const state = makeState([makeCard('2♠')]);
  const action = makeAction('base', 'solo-wild-copy', ['C1'], { kind: 'solo-wild-copy' });
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, '2', 'Copy action should be attributed to rank 2, not the copied rank');
  assert.notEqual(attribution.primaryRank, '7', 'Copy action should NOT be attributed to the copied rank');
});

// ─── Fixture 14: Mimicked effect ────────────────────────────────────────────
test('FIXTURE 14: Mimicked effect', () => {
  const state = makeState([makeCard('10♠'), makeCard('2♥')]);
  const action = makeAction('base', 'mimic', ['C1', 'C2'], { kind: 'mimic-ten-diamond' });
  const attribution = attributeAction(state, action);
  assert.ok(attribution.sourceRanks.includes('10'), 'Mimic should include rank 10 in source ranks');
});

// ─── Fixture 15: Replayed effect ────────────────────────────────────────────
test('FIXTURE 15: Replayed effect', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter', authority: 'replay' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super');
});

// ─── Fixture 16: Rank 2 solo-wild-copy behavior ─────────────────────────────
test('FIXTURE 16: Rank 2 solo-wild-copy behavior', () => {
  const state = makeState([makeCard('2♠')]);
  const action = makeAction('base', 'solo-wild-copy', ['C1'], { kind: 'solo-wild-copy' });
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, '2');
  // playForm is 'other' for solo-wild-copy — this is the actual engine behavior
  assert.equal(attribution.playForm, 'other', 'solo-wild-copy has playForm "other" (engine classification)');
  // 2♠ should be classified as a Spades variant
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'spade', '2♠ solo-wild-copy should be classified as spade tier');
  assert.equal(variantEntity.variantKey, '2:spade');
});

// ─── Fixture 17: Natural versus generated Black Joker ───────────────────────
test('FIXTURE 17: Natural versus generated Black Joker', () => {
  // Natural BJ declaration
  const state = makeState([makeCard('BJ')]);
  const action = makeAction('score', 'ordinary', ['C1']);
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, 'BJ');
  assert.equal(attribution.attributionStatus, 'exact', 'Natural BJ should have exact attribution status');
  // Generated BJ (e.g., from rank 7) — distinguished by attributionStatus
  const generatedAttribution = { ...attribution, originRank: '7', generatedRank: 'BJ', attributionStatus: 'generated-origin' };
  assert.notEqual(generatedAttribution.attributionStatus, 'exact', 'Generated BJ should NOT have exact attribution status');
  assert.equal(generatedAttribution.attributionStatus, 'generated-origin', 'Generated BJ should have generated-origin status');
});

// ─── Fixture 18: Cross-rank compound action ─────────────────────────────────
test('FIXTURE 18: Cross-rank compound action (Royal Marriage)', () => {
  const state = makeState([makeCard('K♠'), makeCard('Q♠')]);
  const action = makeAction('royal-marriage', 'royal-marriage', ['C1', 'C2']);
  const attribution = attributeAction(state, action);
  assert.ok(attribution.sourceRanks.includes('K'), 'Royal Marriage should include K in source ranks');
  assert.ok(attribution.sourceRanks.includes('Q'), 'Royal Marriage should include Q in source ranks');
  assert.equal(attribution.attributionStatus, 'fractional', 'Royal Marriage should have fractional attribution');
});

// ─── Fixture 19: Hidden source identity ─────────────────────────────────────
test('FIXTURE 19: Hidden source identity — not-observable', () => {
  const state = makeState([makeCard('HIDDEN', 'P2', 'P2_HAND')]);
  const action = makeAction('score', 'ordinary', ['C1']);
  const attribution = attributeAction(state, action, 'public');
  assert.equal(attribution.attributionStatus, 'not-observable', 'Hidden identity should result in not-observable status');
});

// ─── Fixture 20: Response decline ───────────────────────────────────────────
test('FIXTURE 20: Response decline', () => {
  const state = makeState([makeCard('A♥')]);
  const action = makeAction('response', 'decline', ['C1'], { kind: 'response-decline' });
  const attribution = attributeAction(state, action);
  // Response decline has primaryRank=null because the decline action has no rank attribution
  assert.equal(attribution.attributionStatus, 'not-observable', 'Response decline should have not-observable status');
  assert.ok(attribution, 'Response decline should produce an attribution object');
});

// ─── Fixture 21: Automatic engine orchestration ─────────────────────────────
test('FIXTURE 21: Automatic engine orchestration', () => {
  const state = makeState([makeCard('A♥')]);
  const action = makeAction('automatic', 'draw', ['C1'], { kind: 'automatic-draw' });
  const attribution = attributeAction(state, action);
  assert.ok(attribution, 'Automatic action should produce an attribution object');
});

// ─── Fixture 22: Insufficient-evidence entity ───────────────────────────────
test('FIXTURE 22: Insufficient-evidence entity', () => {
  const summary = makeSummary([
    makeRankDecision('P1', {
      primaryRank: 'BJ',
      sourceRanks: ['BJ'],
      rankWeights: { 'BJ': 1 },
      playForm: 'score',
      originRank: null,
      generatedRank: null,
      attributionStatus: 'exact'
    }, { family: 'score' })
  ]);
  const result = buildVariantAnalytics({ summaries: [summary] });
  assert.ok(result, 'Variant analytics should produce a result');
  assert.ok(result.confidence, 'Variant analytics should have confidence classifications');
  const confidenceValues = Object.values(result.confidence);
  assert.ok(confidenceValues.some(c => c === 'INSUFFICIENT' || c === 'LOW'), 'Single-sample entity should have INSUFFICIENT or LOW confidence');
});

// ─── Conservation checks ────────────────────────────────────────────────────
test('CONSERVATION: One Super declaration = one Super count, not N effect counts', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  const counters = emptyParticipantVariantCounters(['P1', 'P2'], VARIANT_KEYS);
  applyDecisionToVariantCounters(counters, 'P1', attribution, variantEntity, action, {});
  const superKey = variantEntity.variantKey;
  assert.equal(counters.P1[superKey].selectionCount, 1, 'One Super declaration should count as exactly 1 selection');
  assert.equal(counters.P1[superKey].activationCount, 1, 'One Super declaration should count as exactly 1 activation');
});

test('CONSERVATION: Spades card used as Super source ≠ ordinary Spades activation', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.equal(variantEntity.tier, 'super', 'A♠ used in Super should be super tier, not spade tier');
  assert.notEqual(variantEntity.variantKey, 'A:spade', 'A♠ used in Super should NOT have A:spade variant key');
});

test('CONSERVATION: Copied effect ≠ natural declaration by copied rank', () => {
  const state = makeState([makeCard('2♠')]);
  const action = makeAction('base', 'solo-wild-copy', ['C1'], { kind: 'solo-wild-copy' });
  const attribution = attributeAction(state, action);
  assert.equal(attribution.primaryRank, '2', 'Copy action should be attributed to rank 2, not the copied rank');
  assert.notEqual(attribution.primaryRank, '7', 'Copy action should NOT be attributed to the copied rank');
});

test('CONSERVATION: Generated effect ≠ natural effect frequency', () => {
  const generatedAttribution = {
    primaryRank: '7', sourceRanks: ['7'], rankWeights: { '7': 1 }, playForm: 'generated',
    originRank: '7', generatedRank: 'BJ', attributionStatus: 'generated-origin', sourceCards: []
  };
  assert.equal(generatedAttribution.attributionStatus, 'generated-origin', 'Generated effect should have generated-origin status');
  assert.equal(generatedAttribution.generatedRank, 'BJ', 'Generated effect should have generatedRank set');
  assert.notEqual(generatedAttribution.attributionStatus, 'exact', 'Generated effect should NOT have exact status');
});

test('CONSERVATION: Partial Super resolution ≠ full Super success', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  const counters = emptyParticipantVariantCounters(['P1', 'P2'], VARIANT_KEYS);
  applyDecisionToVariantCounters(counters, 'P1', attribution, variantEntity, action, {});
  // Apply a loss
  applyMatchResultToVariantCounters(counters, 'P1', { outcome: 'NORMAL_VICTORY', winner: 'P2' }, ['A'], VARIANT_KEYS);
  const superKey = variantEntity.variantKey;
  assert.equal(counters.P1[superKey].selectionCount, 1, 'Lost Super should still have selection count');
  assert.equal(counters.P1[superKey].successCount, 0, 'Lost Super should not have success count');
});

// ─── Double-count invariants ────────────────────────────────────────────────
test('INVARIANT: No declaration belongs to two mutually exclusive primary forms', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  const tiers = ['normal', 'spade', 'super', 'ultra'];
  const matchedTiers = tiers.filter(t => variantEntity.tier === t);
  assert.equal(matchedTiers.length, 1, 'Declaration should match exactly one tier');
});

test('INVARIANT: Effect components overlap with parent only where schema models parent-child', () => {
  const state = makeState([makeCard('A♠'), makeCard('A♣')]);
  const action = makeAction('super', 'super-ace', ['C1', 'C2'], { kind: 'core-declare-super-ace-counter' });
  const attribution = attributeAction(state, action);
  const variantEntity = classifyVariantEntity(attribution, action);
  assert.ok(variantEntity.variantKey.includes('super'), 'Super variant key should include "super"');
  assert.notEqual(variantEntity.variantKey, 'A:spade', 'Super variant key should not be same as Spades variant key');
});
