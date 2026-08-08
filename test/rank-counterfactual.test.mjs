import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANK_COUNTERFACTUAL_SCHEMA_VERSION,
  eligibleRankAnchor,
  computeRankDecisionValue,
  buildRankSwapMatrix,
  aggregateRankDecisionValues,
  selectEligibleRankAnchors,
  buildRankCounterfactualOutput
} from '@intrilex/simulation-runtime/rank-counterfactual';

function makeRollouts(n, winner, margin) {
  return Array.from({ length: n }, (_, i) => ({ winner, winningSeat: winner, scoreMargin: margin, rolloutIndex: i }));
}

test('rank counterfactual schema version is 1.0.0', () => {
  assert.equal(RANK_COUNTERFACTUAL_SCHEMA_VERSION, '1.0.0');
});

test('eligibleRankAnchor returns eligible when 2+ rank-distinct actions', () => {
  const state = {
    cards: {
      'C1': { identity: '7♠', controllerId: 'P1', zone: 'P1_HAND' },
      'C2': { identity: 'K♥', controllerId: 'P1', zone: 'P1_HAND' }
    },
    viewerId: 'P1'
  };
  const legalActions = [
    { actionId: 'A1', sourceCardIds: ['C1'], family: 'score' },
    { actionId: 'A2', sourceCardIds: ['C2'], family: 'score' }
  ];
  const result = eligibleRankAnchor(legalActions, state);
  assert.ok(result.eligible);
  assert.equal(result.rankDistinctCount, 2);
});

test('eligibleRankAnchor returns not eligible when only 1 rank', () => {
  const state = {
    cards: {
      'C1': { identity: '7♠', controllerId: 'P1', zone: 'P1_HAND' },
      'C2': { identity: '7♣', controllerId: 'P1', zone: 'P1_HAND' }
    },
    viewerId: 'P1'
  };
  const legalActions = [
    { actionId: 'A1', sourceCardIds: ['C1'], family: 'score' },
    { actionId: 'A2', sourceCardIds: ['C2'], family: 'score' }
  ];
  const result = eligibleRankAnchor(legalActions, state);
  assert.equal(result.eligible, false);
  assert.equal(result.rankDistinctCount, 1);
});

test('eligibleRankAnchor returns not eligible when 0 rank-distinct actions', () => {
  const state = { cards: {}, viewerId: 'P1' };
  const legalActions = [
    { actionId: 'A1', family: 'response-decline' },
    { actionId: 'A2', family: 'exhausted-pass' }
  ];
  const result = eligibleRankAnchor(legalActions, state);
  assert.equal(result.eligible, false);
  assert.equal(result.rankDistinctCount, 0);
});

test('computeRankDecisionValue computes win rate delta correctly', () => {
  const selected = { rollouts: makeRollouts(10, 'P1', 5) };
  const alternative = { rollouts: makeRollouts(10, 'P2', -3) };
  const cdv = computeRankDecisionValue(selected, alternative, '7', 'K', 'P1');
  assert.equal(cdv.selectedRank, '7');
  assert.equal(cdv.alternativeRank, 'K');
  assert.equal(cdv.rolloutCount, 10);
  assert.equal(cdv.selectedWinRate, 1.0);
  assert.equal(cdv.alternativeWinRate, 0.0);
  assert.equal(cdv.winRateDelta, 1.0);
  assert.equal(cdv.selectedScoreMargin, 5);
  assert.equal(cdv.alternativeScoreMargin, -3);
  assert.equal(cdv.scoreMarginDelta, 8);
  assert.equal(cdv.confidence, 'LOW'); // 10 < 16
});

test('computeRankDecisionValue confidence HIGH for 32+ rollouts', () => {
  const selected = { rollouts: makeRollouts(32, 'P1', 2) };
  const alternative = { rollouts: makeRollouts(32, 'P2', -2) };
  const cdv = computeRankDecisionValue(selected, alternative, 'A', '2', 'P1');
  assert.equal(cdv.confidence, 'HIGH');
});

test('computeRankDecisionValue confidence MEDIUM for 16+ rollouts', () => {
  const selected = { rollouts: makeRollouts(16, 'P1', 2) };
  const alternative = { rollouts: makeRollouts(16, 'P2', -2) };
  const cdv = computeRankDecisionValue(selected, alternative, 'A', '2', 'P1');
  assert.equal(cdv.confidence, 'MEDIUM');
});

test('computeRankDecisionValue returns INSUFFICIENT for 0 rollouts', () => {
  const cdv = computeRankDecisionValue({ rollouts: [] }, { rollouts: [] }, 'A', '2', 'P1');
  assert.equal(cdv.confidence, 'INSUFFICIENT');
  assert.equal(cdv.rolloutCount, 0);
  assert.equal(cdv.decisionValue, null);
});

test('computeRankDecisionValue handles mixed outcomes', () => {
  const selected = { rollouts: [
    { winner: 'P1', scoreMargin: 10 },
    { winner: 'P2', scoreMargin: -5 },
    { winner: 'P1', scoreMargin: 3 },
    { winner: 'P2', scoreMargin: -8 }
  ]};
  const alternative = { rollouts: [
    { winner: 'P2', scoreMargin: -10 },
    { winner: 'P2', scoreMargin: -5 },
    { winner: 'P1', scoreMargin: 3 },
    { winner: 'P2', scoreMargin: -8 }
  ]};
  const cdv = computeRankDecisionValue(selected, alternative, '7', 'K', 'P1');
  assert.equal(cdv.selectedWinRate, 0.5);
  assert.equal(cdv.alternativeWinRate, 0.25);
  assert.equal(cdv.winRateDelta, 0.25);
});

test('buildRankSwapMatrix creates matrix from paired results', () => {
  const cdv1 = { selectedRank: 'A', alternativeRank: '2', winRateDelta: 0.3 };
  const cdv2 = { selectedRank: 'A', alternativeRank: 'K', winRateDelta: 0.1 };
  const cdv3 = { selectedRank: '7', alternativeRank: 'K', winRateDelta: -0.2 };
  const matrix = buildRankSwapMatrix([
    { selectedRank: 'A', alternativeRank: '2', cdv: cdv1 },
    { selectedRank: 'A', alternativeRank: 'K', cdv: cdv2 },
    { selectedRank: '7', alternativeRank: 'K', cdv: cdv3 }
  ]);
  assert.ok(matrix.A);
  assert.ok(matrix.A['2']);
  assert.equal(matrix.A['2'].winRateDelta, 0.3);
  assert.equal(matrix.A['K'].winRateDelta, 0.1);
  assert.ok(matrix['7']);
  assert.equal(matrix['7']['K'].winRateDelta, -0.2);
});

test('aggregateRankDecisionValues aggregates across decisions', () => {
  const cdv1 = computeRankDecisionValue(
    { rollouts: makeRollouts(32, 'P1', 5) },
    { rollouts: makeRollouts(32, 'P2', -5) },
    '7', 'K', 'P1'
  );
  const cdv2 = computeRankDecisionValue(
    { rollouts: makeRollouts(32, 'P1', 3) },
    { rollouts: makeRollouts(32, 'P2', -3) },
    '7', 'Q', 'P1'
  );
  const aggregated = aggregateRankDecisionValues([cdv1, cdv2]);
  assert.ok(aggregated['7']);
  assert.equal(aggregated['7'].swapCount, 2);
  assert.equal(aggregated['7'].totalRollouts, 64);
  assert.equal(aggregated['7'].confidence, 'MEDIUM');
  assert.ok(aggregated['7'].averageWinRateDelta > 0);
});

test('aggregateRankDecisionValues skips INSUFFICIENT results', () => {
  const cdv1 = computeRankDecisionValue(
    { rollouts: makeRollouts(32, 'P1', 5) },
    { rollouts: makeRollouts(32, 'P2', -5) },
    '7', 'K', 'P1'
  );
  const cdv2 = computeRankDecisionValue(
    { rollouts: [] },
    { rollouts: [] },
    '7', 'Q', 'P1'
  );
  const aggregated = aggregateRankDecisionValues([cdv1, cdv2]);
  assert.ok(aggregated['7']);
  assert.equal(aggregated['7'].swapCount, 1); // Only cdv1 counted
});

test('selectEligibleRankAnchors filters and limits', () => {
  const frames = [
    {
      checkpointIndex: 0,
      state: {
        cards: {
          'C1': { identity: '7♠', controllerId: 'P1', zone: 'P1_HAND' },
          'C2': { identity: 'K♥', controllerId: 'P1', zone: 'P1_HAND' }
        },
        viewerId: 'P1'
      },
      legalActions: [
        { actionId: 'A1', sourceCardIds: ['C1'], family: 'score' },
        { actionId: 'A2', sourceCardIds: ['C2'], family: 'score' }
      ]
    },
    {
      checkpointIndex: 1,
      state: { cards: {}, viewerId: 'P1' },
      legalActions: [{ actionId: 'A1', family: 'response-decline' }]
    },
    {
      checkpointIndex: 2,
      state: {
        cards: {
          'C3': { identity: 'A♣', controllerId: 'P1', zone: 'P1_HAND' },
          'C4': { identity: '2♦', controllerId: 'P1', zone: 'P1_HAND' }
        },
        viewerId: 'P1'
      },
      legalActions: [
        { actionId: 'A3', sourceCardIds: ['C3'], family: 'score' },
        { actionId: 'A4', sourceCardIds: ['C4'], family: 'score' }
      ]
    }
  ];
  const anchors = selectEligibleRankAnchors(frames, 50);
  assert.equal(anchors.length, 2); // frames 0 and 2 are eligible
  assert.equal(anchors[0].checkpointIndex, 0);
  assert.equal(anchors[1].checkpointIndex, 2);
});

test('selectEligibleRankAnchors respects maxAnchors', () => {
  const frames = Array.from({ length: 10 }, (_, i) => ({
    checkpointIndex: i,
    state: {
      cards: {
        'C1': { identity: '7♠', controllerId: 'P1', zone: 'P1_HAND' },
        'C2': { identity: 'K♥', controllerId: 'P1', zone: 'P1_HAND' }
      },
      viewerId: 'P1'
    },
    legalActions: [
      { actionId: 'A1', sourceCardIds: ['C1'], family: 'score' },
      { actionId: 'A2', sourceCardIds: ['C2'], family: 'score' }
    ]
  }));
  const anchors = selectEligibleRankAnchors(frames, 3);
  assert.equal(anchors.length, 3);
});

test('buildRankCounterfactualOutput produces complete output', () => {
  const cdv1 = computeRankDecisionValue(
    { rollouts: makeRollouts(32, 'P1', 5) },
    { rollouts: makeRollouts(32, 'P2', -5) },
    '7', 'K', 'P1'
  );
  const output = buildRankCounterfactualOutput({
    cdvResults: [cdv1],
    aggregateHash: 'abc123'
  });
  assert.equal(output.schemaVersion, '1.0.0');
  assert.equal(output.resultCount, 1);
  assert.ok(output.swapMatrix);
  assert.ok(output.aggregated);
  assert.equal(output.aggregateHash, 'abc123');
});

test('aggregateRankDecisionValues does not multiply observational sample size across pair rows', () => {
  const rows = ['2', '3', '4'].map(alternativeRank => ({
    selectedRank: 'A',
    alternativeRank,
    observationalSampleCount: 80,
    selectedSampleSize: 100,
    winRateDelta: 0.1,
    scoreMarginDelta: 0,
    decisionValue: 0.1,
    confidence: 'MEDIUM'
  }));
  const aggregated = aggregateRankDecisionValues(rows);
  assert.equal(aggregated.A.swapCount, 3);
  assert.equal(aggregated.A.sampleSize, 100);
  assert.equal(aggregated.A.totalRollouts, 100);
});
