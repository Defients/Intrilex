import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TELEMETRY_SCHEMA_VERSION_V5,
  RANK_METRIC_REGISTRY,
  emptyRankCounters,
  emptyParticipantRankCounters,
  applyDecisionToRankCounters,
  applyMatchResultToRankCounters,
  applyStateDeltaToRankCounters,
  rankDecisionExtension,
  rankOpportunityExtension,
  rankSelectionRate,
  computeRankMetrics,
  computeAggregateRankMetrics,
  buildRankAnalyticsOutput
} from '@intrilex/telemetry/rank-telemetry';

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","RJ","BJ"];

test('telemetry v5 schema version is 5.0.0', () => {
  assert.equal(TELEMETRY_SCHEMA_VERSION_V5, '5.0.0');
});

test('rank metric registry has 17 metrics', () => {
  assert.equal(RANK_METRIC_REGISTRY.length, 17);
  const ids = RANK_METRIC_REGISTRY.map(m => m.metricId);
  assert.ok(ids.includes('rankSelectionCount'));
  assert.ok(ids.includes('rankOpportunityCount'));
  assert.ok(ids.includes('rankSelectionRate'));
  assert.ok(ids.includes('rankVictoryContributionCount'));
  assert.ok(ids.includes('rankDefeatExposureCount'));
  assert.ok(ids.includes('rankSecuredPointContribution'));
  assert.ok(ids.includes('rankBoardPresenceContribution'));
  assert.ok(ids.includes('rankCounterDeclarationCount'));
  assert.ok(ids.includes('rankScuttleCount'));
  assert.ok(ids.includes('rankEffectPlayCount'));
  assert.ok(ids.includes('rankGeneratedEffectCount'));
  assert.ok(ids.includes('rankSuperPlayCount'));
  assert.ok(ids.includes('rankUltraPlayCount'));
  assert.ok(ids.includes('rankRoyalMarriageCount'));
  assert.ok(ids.includes('rankResponsePlayedCount'));
  assert.ok(ids.includes('rankResponseDeclinedCount'));
});

test('RANK_METRIC_REGISTRY is frozen', () => {
  assert.ok(Object.isFrozen(RANK_METRIC_REGISTRY));
});

test('emptyRankCounters has all 15 ranks with zero counters', () => {
  const counters = emptyRankCounters(RANKS);
  assert.equal(Object.keys(counters).length, 15);
  for (const rank of RANKS) {
    assert.equal(counters[rank].selectionCount, 0);
    assert.equal(counters[rank].opportunityCount, 0);
    assert.equal(counters[rank].victoryContributionCount, 0);
    assert.equal(counters[rank].defeatExposureCount, 0);
    assert.equal(counters[rank].securedPointContribution, 0);
    assert.equal(counters[rank].boardPresenceContribution, 0);
    assert.equal(counters[rank].stateDeltaObservationCount, 0);
    assert.equal(counters[rank].counterDeclarationCount, 0);
    assert.equal(counters[rank].scuttleCount, 0);
    assert.equal(counters[rank].effectPlayCount, 0);
    assert.equal(counters[rank].generatedEffectCount, 0);
    assert.equal(counters[rank].superPlayCount, 0);
    assert.equal(counters[rank].ultraPlayCount, 0);
    assert.equal(counters[rank].royalMarriageCount, 0);
    assert.equal(counters[rank].responsePlayedCount, 0);
    assert.equal(counters[rank].responseDeclinedCount, 0);
  }
});

test('emptyParticipantRankCounters creates per-participant structure', () => {
  const counters = emptyParticipantRankCounters(['P1', 'P2'], RANKS);
  assert.ok(counters.P1);
  assert.ok(counters.P2);
  assert.equal(Object.keys(counters.P1).length, 15);
  assert.equal(counters.P1['A'].selectionCount, 0);
  assert.equal(counters.P2['K'].selectionCount, 0);
});

test('applyDecisionToRankCounters increments selection for exact attribution', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: '7',
    sourceRanks: ['7'],
    rankWeights: { '7': 1.0 },
    attributionStatus: 'exact',
    playForm: 'score',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'score' }, [], { '7': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['7'].selectionCount, 1);
  assert.equal(counters.P1['7'].opportunityCount, 1);
});

test('applyDecisionToRankCounters increments super play count', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: 'A',
    sourceRanks: ['A'],
    rankWeights: { 'A': 1.0 },
    attributionStatus: 'exact',
    playForm: 'super',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'super' }, [], { 'A': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['A'].superPlayCount, 1);
  assert.equal(counters.P1['A'].selectionCount, 1);
});

test('applyDecisionToRankCounters increments ultra play count', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: '2',
    sourceRanks: ['2'],
    rankWeights: { '2': 1.0 },
    attributionStatus: 'exact',
    playForm: 'ultra',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'ultra' }, [], { '2': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['2'].ultraPlayCount, 1);
});

test('applyDecisionToRankCounters credits both ranks for Royal Marriage', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: 'K',
    sourceRanks: ['K', 'Q'],
    rankWeights: { 'K': 0.5, 'Q': 0.5 },
    attributionStatus: 'fractional',
    playForm: 'royal-marriage',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'royal-marriage' }, [], { 'K': { opportunityFrames: 1, legalOptions: 1 }, 'Q': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['K'].royalMarriageCount, 1);
  assert.equal(counters.P1['Q'].royalMarriageCount, 1);
  assert.equal(counters.P1['K'].selectionCount, 1);
  assert.equal(counters.P1['Q'].selectionCount, 1);
});

test('applyDecisionToRankCounters increments counter declaration count', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: 'A',
    sourceRanks: ['A'],
    rankWeights: { 'A': 1.0 },
    attributionStatus: 'exact',
    playForm: 'base',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'counter' }, [], { 'A': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['A'].counterDeclarationCount, 1);
  assert.equal(counters.P1['A'].responsePlayedCount, 1);
});

test('applyDecisionToRankCounters increments scuttle count', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: '8',
    sourceRanks: ['8'],
    rankWeights: { '8': 1.0 },
    attributionStatus: 'exact',
    playForm: 'base',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'scuttle' }, [], { '8': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['8'].scuttleCount, 1);
});

test('applyDecisionToRankCounters increments effect play count', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: '3',
    sourceRanks: ['3'],
    rankWeights: { '3': 1.0 },
    attributionStatus: 'exact',
    playForm: 'base',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'effect-three' }, [], { '3': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['3'].effectPlayCount, 1);
});

test('applyDecisionToRankCounters increments generated effect count', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: '7',
    sourceRanks: ['7'],
    rankWeights: { '7': 1.0 },
    attributionStatus: 'generated-origin',
    playForm: 'generated',
    originRank: '7',
    generatedRank: 'BJ'
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'effect-seven' }, [], { '7': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['7'].generatedEffectCount, 1);
});

test('applyDecisionToRankCounters handles response decline with rank opportunities', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: null,
    sourceRanks: [],
    rankWeights: {},
    attributionStatus: 'not-observable',
    playForm: 'other',
    originRank: null,
    generatedRank: null
  };
  applyDecisionToRankCounters(counters, 'P1', attribution, { family: 'response-decline' }, [], { 'A': { opportunityFrames: 1, legalOptions: 1 }, '2': { opportunityFrames: 1, legalOptions: 1 } });
  assert.equal(counters.P1['A'].responseDeclinedCount, 1);
  assert.equal(counters.P1['2'].responseDeclinedCount, 1);
  assert.equal(counters.P1['A'].selectionCount, 0);
});

test('applyMatchResultToRankCounters credits victory', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  applyMatchResultToRankCounters(counters, 'P1', 'VICTORY', new Set(['A', '7', 'K']));
  assert.equal(counters.P1['A'].victoryContributionCount, 1);
  assert.equal(counters.P1['7'].victoryContributionCount, 1);
  assert.equal(counters.P1['K'].victoryContributionCount, 1);
  assert.equal(counters.P1['Q'].victoryContributionCount, 0);
});

test('applyMatchResultToRankCounters credits defeat', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  applyMatchResultToRankCounters(counters, 'P1', 'DEFEAT', new Set(['A', '7']));
  assert.equal(counters.P1['A'].defeatExposureCount, 1);
  assert.equal(counters.P1['7'].defeatExposureCount, 1);
  assert.equal(counters.P1['K'].defeatExposureCount, 0);
});

test('applyStateDeltaToRankCounters attributes secured points for exact attribution', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: '5',
    sourceRanks: ['5'],
    rankWeights: { '5': 1.0 },
    attributionStatus: 'exact',
    playForm: 'score',
    originRank: null,
    generatedRank: null
  };
  applyStateDeltaToRankCounters(counters, 'P1', attribution, {
    securedPointDeltaByPlayer: { P1: 5 },
    boardPresenceDeltaByPlayer: { P1: 1 }
  });
  assert.equal(counters.P1['5'].securedPointContribution, 5);
  assert.equal(counters.P1['5'].boardPresenceContribution, 1);
  assert.equal(counters.P1['5'].stateDeltaObservationCount, 1);
});

test('applyStateDeltaToRankCounters splits points for fractional attribution', () => {
  const counters = emptyParticipantRankCounters(['P1'], RANKS);
  const attribution = {
    primaryRank: 'K',
    sourceRanks: ['K', 'Q'],
    rankWeights: { 'K': 0.5, 'Q': 0.5 },
    attributionStatus: 'fractional',
    playForm: 'royal-marriage',
    originRank: null,
    generatedRank: null
  };
  applyStateDeltaToRankCounters(counters, 'P1', attribution, {
    securedPointDeltaByPlayer: { P1: 8 },
    boardPresenceDeltaByPlayer: { P1: 2 }
  });
  assert.equal(counters.P1['K'].securedPointContribution, 4);
  assert.equal(counters.P1['Q'].securedPointContribution, 4);
  assert.equal(counters.P1['K'].boardPresenceContribution, 1);
  assert.equal(counters.P1['Q'].boardPresenceContribution, 1);
  assert.equal(counters.P1['K'].stateDeltaObservationCount, 1);
  assert.equal(counters.P1['Q'].stateDeltaObservationCount, 1);
});

test('rankDecisionExtension produces v5 extension fields', () => {
  const attribution = {
    primaryRank: '7',
    sourceRanks: ['7'],
    rankWeights: { '7': 1.0 },
    attributionStatus: 'exact',
    playForm: 'score',
    originRank: null,
    generatedRank: null
  };
  const ext = rankDecisionExtension(attribution);
  assert.ok(ext.rankAttribution);
  assert.equal(ext.rankAttribution.primaryRank, '7');
  assert.equal(ext.rankAttribution.attributionStatus, 'exact');
  assert.equal(ext.rankAttribution.playForm, 'score');
});

test('rankOpportunityExtension produces v5 extension fields', () => {
  const ext = rankOpportunityExtension({ '7': { opportunityFrames: 1, legalOptions: 3 } });
  assert.ok(ext.rankOpportunities);
  assert.equal(ext.rankOpportunities.length, 1);
  assert.equal(ext.rankOpportunities[0].rank, '7');
  assert.equal(ext.rankOpportunities[0].legalOptions, 3);
});

test('rankSelectionRate computes correctly', () => {
  assert.equal(rankSelectionRate({ selectionCount: 5, opportunityCount: 10 }), 0.5);
  assert.equal(rankSelectionRate({ selectionCount: 0, opportunityCount: 0 }), 0);
  assert.equal(rankSelectionRate({ selectionCount: 3, opportunityCount: 3 }), 1.0);
});

test('computeRankMetrics produces all 17 metrics per rank', () => {
  const counters = emptyRankCounters(RANKS);
  counters['7'].selectionCount = 5;
  counters['7'].opportunityCount = 10;
  const metrics = computeRankMetrics(counters, RANKS);
  assert.equal(metrics['7'].rankSelectionCount, 5);
  assert.equal(metrics['7'].rankOpportunityCount, 10);
  assert.equal(metrics['7'].rankSelectionRate, 0.5);
  assert.equal(metrics['7'].rankVictoryContributionCount, 0);
});

test('computeAggregateRankMetrics sums across participants', () => {
  const counters = emptyParticipantRankCounters(['P1', 'P2'], RANKS);
  counters.P1['A'].selectionCount = 3;
  counters.P2['A'].selectionCount = 2;
  const aggregate = computeAggregateRankMetrics(counters, RANKS);
  assert.equal(aggregate['A'].rankSelectionCount, 5);
});

test('buildRankAnalyticsOutput produces complete output contract', () => {
  const counters = emptyParticipantRankCounters(['P1', 'P2'], RANKS);
  counters.P1['A'].selectionCount = 5;
  counters.P1['A'].opportunityCount = 10;
  counters.P2['A'].selectionCount = 3;
  counters.P2['A'].opportunityCount = 8;
  const output = buildRankAnalyticsOutput({
    participantRankCounters: counters,
    ranks: RANKS,
    participantIds: ['P1', 'P2'],
    aggregateHash: 'abc123'
  });
  assert.equal(output.schemaVersion, '5.0.0');
  assert.equal(output.ranks.length, 15);
  assert.equal(output.participantIds.length, 2);
  assert.ok(output.perParticipant.P1);
  assert.ok(output.perParticipant.P2);
  assert.ok(output.aggregate);
  assert.equal(output.aggregate['A'].rankSelectionCount, 8);
  assert.equal(output.aggregateHash, 'abc123');
  assert.equal(output.metricRegistry.length, 17);
});
