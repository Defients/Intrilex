import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANK_POWER_SCHEMA_VERSION,
  RPI_AXIS_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  BALANCE_THRESHOLDS,
  normalizeMinimax,
  computePowerAxes,
  computeObservedRPI,
  computeDecisionPower,
  confidenceStatus,
  buildBalanceWatchlist,
  buildRankPowerModel
} from '@intrilex/simulation-runtime/rank-power';

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","RJ","BJ"];

function makeMetrics(overrides = {}) {
  const base = {};
  for (const rank of RANKS) {
    base[rank] = {
      rankSelectionCount: 10,
      rankOpportunityCount: 20,
      rankSelectionRate: 0.5,
      rankVictoryContributionCount: 5,
      rankDefeatExposureCount: 5,
      rankSecuredPointContribution: 30,
      rankBoardPresenceContribution: 10,
      rankStateDeltaObservationCount: 10,
      rankCounterDeclarationCount: 2,
      rankScuttleCount: 1,
      rankEffectPlayCount: 3,
      rankGeneratedEffectCount: 0,
      rankSuperPlayCount: 1,
      rankUltraPlayCount: 0,
      rankRoyalMarriageCount: 0,
      rankResponsePlayedCount: 2,
      rankResponseDeclinedCount: 1
    };
  }
  return { ...base, ...overrides };
}

test('rank power schema version is 1.0.0', () => {
  assert.equal(RANK_POWER_SCHEMA_VERSION, '1.0.0');
});

test('RPI axis weights sum to 1.0', () => {
  const sum = Object.values(RPI_AXIS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `weights sum to ${sum}, expected 1.0`);
});

test('RPI axis weights has 6 axes', () => {
  assert.equal(Object.keys(RPI_AXIS_WEIGHTS).length, 6);
  assert.ok(RPI_AXIS_WEIGHTS.selectionPower !== undefined);
  assert.ok(RPI_AXIS_WEIGHTS.victoryPower !== undefined);
  assert.ok(RPI_AXIS_WEIGHTS.scorePower !== undefined);
  assert.ok(RPI_AXIS_WEIGHTS.boardPower !== undefined);
  assert.ok(RPI_AXIS_WEIGHTS.responsePower !== undefined);
  assert.ok(RPI_AXIS_WEIGHTS.observedRankValue !== undefined);
});

test('RPI axis weights are frozen', () => {
  assert.ok(Object.isFrozen(RPI_AXIS_WEIGHTS));
});

test('normalizeMinimax scales to [0, 1]', () => {
  const result = normalizeMinimax({ A: 10, B: 20, C: 30 });
  assert.equal(result.A, 0);
  assert.equal(result.B, 0.5);
  assert.equal(result.C, 1);
});

test('normalizeMinimax returns 0.5 for all-equal values', () => {
  const result = normalizeMinimax({ A: 5, B: 5, C: 5 });
  assert.equal(result.A, 0.5);
  assert.equal(result.B, 0.5);
  assert.equal(result.C, 0.5);
});

test('normalizeMinimax handles empty input', () => {
  assert.deepEqual(normalizeMinimax({}), {});
});

test('computePowerAxes produces six axes per rank', () => {
  const metrics = makeMetrics();
  const profiles = computePowerAxes(metrics);
  assert.equal(Object.keys(profiles).length, 15);
  for (const rank of RANKS) {
    assert.ok(profiles[rank].axes.selectionPower !== undefined);
    assert.ok(profiles[rank].axes.victoryPower !== undefined);
    assert.ok(profiles[rank].axes.scorePower !== undefined);
    assert.ok(profiles[rank].axes.boardPower !== undefined);
    assert.ok(profiles[rank].axes.responsePower !== undefined);
    assert.ok(profiles[rank].axes.observedRankValue !== undefined);
    assert.ok(profiles[rank].raw.selectionRate !== undefined);
  }
});

test('computeObservedRPI produces values in [0, 1]', () => {
  const metrics = makeMetrics({
    A: { ...makeMetrics().A, rankSelectionCount: 20, rankVictoryContributionCount: 15, rankDefeatExposureCount: 5, rankSecuredPointContribution: 100 }
  });
  const profiles = computePowerAxes(metrics);
  const rpi = computeObservedRPI(profiles);
  for (const rank of RANKS) {
    assert.ok(rpi[rank] >= 0 && rpi[rank] <= 1, `RPI for ${rank} is ${rpi[rank]}, expected [0,1]`);
  }
  // A should have highest RPI due to high selection and victory
  const maxRank = Object.entries(rpi).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(maxRank, 'A');
});

test('computeDecisionPower blends RPI with cohort-normalized ORV', () => {
  const metrics = makeMetrics({
    A: { ...makeMetrics().A, rankSelectionCount: 18, rankStateDeltaObservationCount: 18 },
    '2': { ...makeMetrics()['2'], rankSelectionCount: 8, rankStateDeltaObservationCount: 8 }
  });
  const rankORV = {
    A: { averageDecisionValue: 0.5, confidence: 'HIGH', swapCount: 10, observationalSampleCount: 120 },
    '2': { averageDecisionValue: -0.2, confidence: 'HIGH', swapCount: 10, observationalSampleCount: 120 }
  };
  const profiles = computePowerAxes(metrics, rankORV);
  const rpi = computeObservedRPI(profiles);
  const dp = computeDecisionPower(rpi, rankORV, profiles);
  assert.notEqual(dp.A, rpi.A);
  assert.notEqual(dp['2'], rpi['2']);
  assert.ok(dp.A >= 0 && dp.A <= 1);
  assert.ok(dp['2'] >= 0 && dp['2'] <= 1);
});

test('confidenceStatus returns HIGH for 200+ opportunities', () => {
  assert.equal(confidenceStatus({ rankOpportunityCount: 200 }), 'HIGH');
  assert.equal(confidenceStatus({ rankOpportunityCount: 500 }), 'HIGH');
});

test('confidenceStatus returns MEDIUM for 50+ opportunities', () => {
  assert.equal(confidenceStatus({ rankOpportunityCount: 50 }), 'MEDIUM');
  assert.equal(confidenceStatus({ rankOpportunityCount: 199 }), 'MEDIUM');
});

test('confidenceStatus returns LOW for 10+ opportunities', () => {
  assert.equal(confidenceStatus({ rankOpportunityCount: 10 }), 'LOW');
  assert.equal(confidenceStatus({ rankOpportunityCount: 49 }), 'LOW');
});

test('confidenceStatus returns INSUFFICIENT for <10 opportunities', () => {
  assert.equal(confidenceStatus({ rankOpportunityCount: 9 }), 'INSUFFICIENT');
  assert.equal(confidenceStatus({ rankOpportunityCount: 0 }), 'INSUFFICIENT');
});

test('buildBalanceWatchlist flags overpowered ranks', () => {
  const metrics = makeMetrics({
    A: { ...makeMetrics().A, rankOpportunityCount: 300, rankSelectionCount: 280, rankVictoryContributionCount: 200, rankDefeatExposureCount: 50, rankSecuredPointContribution: 500 }
  });
  const profiles = computePowerAxes(metrics);
  const rpi = computeObservedRPI(profiles);
  const watchlist = buildBalanceWatchlist(rpi, metrics);
  // A should be overpowered and dominant
  assert.ok(watchlist.overpowered.some(w => w.rank === 'A') || watchlist.dominant.some(w => w.rank === 'A'),
    'A should be flagged as overpowered or dominant');
});

test('buildBalanceWatchlist flags underpowered ranks', () => {
  const metrics = makeMetrics({
    '2': { ...makeMetrics()['2'], rankOpportunityCount: 300, rankSelectionCount: 5, rankVictoryContributionCount: 10, rankDefeatExposureCount: 200, rankSecuredPointContribution: 1 }
  });
  const profiles = computePowerAxes(metrics);
  const rpi = computeObservedRPI(profiles);
  const watchlist = buildBalanceWatchlist(rpi, metrics);
  assert.ok(watchlist.underpowered.some(w => w.rank === '2') || watchlist.negligible.some(w => w.rank === '2'),
    '2 should be flagged as underpowered or negligible');
});

test('buildBalanceWatchlist only flags HIGH confidence ranks', () => {
  const metrics = makeMetrics({
    A: { ...makeMetrics().A, rankOpportunityCount: 5 } // INSUFFICIENT
  });
  const profiles = computePowerAxes(metrics);
  const rpi = computeObservedRPI(profiles);
  const watchlist = buildBalanceWatchlist(rpi, metrics);
  // A has INSUFFICIENT confidence, should not be flagged
  assert.equal(watchlist.overpowered.filter(w => w.rank === 'A').length, 0);
});

test('buildRankPowerModel produces complete model', () => {
  const metrics = makeMetrics();
  const model = buildRankPowerModel({ rankMetrics: metrics, aggregateHash: 'abc123' });
  assert.equal(model.schemaVersion, '1.0.0');
  assert.ok(model.axisWeights);
  assert.ok(model.ranks);
  assert.ok(model.ladder);
  assert.ok(model.watchlist);
  assert.equal(model.aggregateHash, 'abc123');
  // Ladder should be sorted by RPI descending
  for (let i = 1; i < model.ladder.length; i++) {
    assert.ok(model.ladder[i - 1].rpi >= model.ladder[i].rpi, 'ladder must be sorted descending');
  }
});

test('buildRankPowerModel includes ORV when provided', () => {
  const metrics = makeMetrics();
  const rankORV = {
    A: { averageDecisionValue: 0.3, confidence: 'MEDIUM', swapCount: 5, observationalSampleCount: 160 }
  };
  const model = buildRankPowerModel({ rankMetrics: metrics, rankORV, aggregateHash: 'abc123' });
  assert.ok(model.ranks.A.orv);
  assert.equal(model.ranks.A.orv.averageDecisionValue, 0.3);
  assert.equal(model.ranks['2'].orv, null);
});

test('buildRankPowerModel has 15 ranks', () => {
  const metrics = makeMetrics();
  const model = buildRankPowerModel({ rankMetrics: metrics, aggregateHash: 'abc123' });
  assert.equal(Object.keys(model.ranks).length, 15);
  assert.equal(model.ladder.length, 15);
});

test('buildRankPowerModel per-rank profile has all fields', () => {
  const metrics = makeMetrics();
  const model = buildRankPowerModel({ rankMetrics: metrics, aggregateHash: 'abc123' });
  const profile = model.ranks.A;
  assert.ok(profile.rank !== undefined);
  assert.ok(profile.rpi !== undefined);
  assert.ok(profile.decisionPower !== undefined);
  assert.ok(profile.confidence !== undefined);
  assert.ok(profile.axes !== undefined);
  assert.ok(profile.raw !== undefined);
  assert.ok(profile.metrics !== undefined);
});

test('response power does not double-count counters', () => {
  const metrics = makeMetrics({
    A: { ...makeMetrics().A, rankSelectionCount: 10, rankResponsePlayedCount: 3, rankCounterDeclarationCount: 3 }
  });
  const profiles = computePowerAxes(metrics);
  assert.equal(profiles.A.raw.responseRate, 0.3);
});

test('missing causal state-delta coverage makes score and board not observable', () => {
  const metrics = makeMetrics({
    A: { ...makeMetrics().A, rankStateDeltaObservationCount: 0, rankSecuredPointContribution: 0, rankBoardPresenceContribution: 0 }
  });
  const profiles = computePowerAxes(metrics);
  assert.equal(profiles.A.axisStatus.scorePower, 'not-observable');
  assert.equal(profiles.A.axisStatus.boardPower, 'not-observable');
  assert.equal(profiles.A.axes.scorePower, null);
  assert.equal(profiles.A.axes.boardPower, null);
});

test('degenerate causal axes cannot support a HIGH-confidence balance flag', () => {
  const metrics = makeMetrics();
  for (const rank of RANKS) metrics[rank].rankOpportunityCount = 300;
  metrics.A.rankSelectionCount = 280;
  metrics.A.rankStateDeltaObservationCount = 280;
  const profiles = computePowerAxes(metrics);
  const rpi = computeObservedRPI(profiles);
  const watchlist = buildBalanceWatchlist(rpi, metrics, profiles);
  assert.equal(watchlist.overpowered.some(item => item.rank === 'A'), false);
  assert.equal(watchlist.suppressed, true);
});
