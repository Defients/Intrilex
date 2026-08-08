import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANK_ANALYTICS_SCHEMA_VERSION,
  buildRankAnalytics,
  augmentMechanicsWithRankFacets,
  buildRankCompareFacet,
  buildRankEvidenceFacet
} from '@intrilex/analytics/rank-integration';



function makeSummary(overrides = {}) {
  return {
    matchId: 'M001',
    matchOrdinal: 0,
    participants: ['P1', 'P2'],
    winner: 'P1',
    outcome: 'NORMAL_VICTORY',
    terminationReason: 'NORMAL_VICTORY',
    rankDecisions: [],
    ...overrides
  };
}

test('rank analytics schema version is 1.0.0', () => {
  assert.equal(RANK_ANALYTICS_SCHEMA_VERSION, '1.0.0');
});

test('buildRankAnalytics produces complete output with empty summaries', () => {
  const result = buildRankAnalytics({ summaries: [], aggregate: null });
  assert.equal(result.schemaVersion, '1.0.0');
  assert.equal(result.ranks.length, 15);
  assert.ok(result.rankCounters);
  assert.ok(result.rankPower);
  assert.ok(result.metricRegistry);
});

test('buildRankAnalytics processes rank decisions', () => {
  const summaries = [
    makeSummary({
      rankDecisions: [
        {
          participantId: 'P1',
          rankAttribution: {
            primaryRank: '7',
            sourceRanks: ['7'],
            rankWeights: { '7': 1.0 },
            attributionStatus: 'exact',
            playForm: 'score',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 1 }],
          action: { family: 'score' },
          legalActions: []
        },
        {
          participantId: 'P1',
          rankAttribution: {
            primaryRank: 'K',
            sourceRanks: ['K'],
            rankWeights: { 'K': 1.0 },
            attributionStatus: 'exact',
            playForm: 'base',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [{ rank: 'K', opportunityFrames: 1, legalOptions: 1 }],
          action: { family: 'score' },
          legalActions: []
        }
      ]
    })
  ];
  const result = buildRankAnalytics({ summaries, aggregate: null });
  assert.equal(result.participantIds.length, 2); // P1 and P2
  assert.ok(result.rankCounters['7']);
  assert.ok(result.rankCounters['K']);
  assert.equal(result.rankCounters['7'].rankSelectionCount, 1);
  assert.equal(result.rankCounters['K'].rankSelectionCount, 1);
});

test('buildRankAnalytics attributes victory to selected ranks', () => {
  const summaries = [
    makeSummary({
      winner: 'P1',
      rankDecisions: [
        {
          participantId: 'P1',
          rankAttribution: {
            primaryRank: 'A',
            sourceRanks: ['A'],
            rankWeights: { 'A': 1.0 },
            attributionStatus: 'exact',
            playForm: 'base',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [{ rank: 'A', opportunityFrames: 1, legalOptions: 1 }],
          action: { family: 'score' },
          legalActions: []
        }
      ]
    })
  ];
  const result = buildRankAnalytics({ summaries, aggregate: null });
  assert.equal(result.rankCounters['A'].rankVictoryContributionCount, 1);
  assert.equal(result.rankCounters['A'].rankDefeatExposureCount, 0);
});

test('buildRankAnalytics attributes defeat to selected ranks', () => {
  const summaries = [
    makeSummary({
      winner: 'P2',
      rankDecisions: [
        {
          participantId: 'P1',
          rankAttribution: {
            primaryRank: 'A',
            sourceRanks: ['A'],
            rankWeights: { 'A': 1.0 },
            attributionStatus: 'exact',
            playForm: 'base',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [{ rank: 'A', opportunityFrames: 1, legalOptions: 1 }],
          action: { family: 'score' },
          legalActions: []
        }
      ]
    })
  ];
  const result = buildRankAnalytics({ summaries, aggregate: null });
  assert.equal(result.rankCounters['A'].rankDefeatExposureCount, 1);
  assert.equal(result.rankCounters['A'].rankVictoryContributionCount, 0);
});

test('buildRankAnalytics produces rank power model', () => {
  const summaries = [
    makeSummary({
      rankDecisions: [
        {
          participantId: 'P1',
          rankAttribution: {
            primaryRank: '7',
            sourceRanks: ['7'],
            rankWeights: { '7': 1.0 },
            attributionStatus: 'exact',
            playForm: 'score',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 1 }],
          action: { family: 'score' },
          legalActions: []
        }
      ]
    })
  ];
  const result = buildRankAnalytics({ summaries, aggregate: { aggregateHash: 'abc123' } });
  assert.ok(result.rankPower);
  assert.equal(result.rankPower.schemaVersion, '1.0.0');
  assert.ok(result.rankPower.ladder);
  assert.ok(result.rankPower.ranks['7']);
  assert.equal(result.rankPower.aggregateHash, 'abc123');
});

test('buildRankAnalytics produces per-participant metrics', () => {
  const summaries = [
    makeSummary({
      rankDecisions: [
        {
          participantId: 'P1',
          rankAttribution: {
            primaryRank: '7',
            sourceRanks: ['7'],
            rankWeights: { '7': 1.0 },
            attributionStatus: 'exact',
            playForm: 'score',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 1 }],
          action: { family: 'score' },
          legalActions: []
        }
      ]
    })
  ];
  const result = buildRankAnalytics({ summaries, aggregate: null });
  assert.ok(result.perParticipantRankMetrics.P1);
  assert.ok(result.perParticipantRankMetrics.P1['7']);
  assert.equal(result.perParticipantRankMetrics.P1['7'].rankSelectionCount, 1);
});

test('augmentMechanicsWithRankFacets adds rankFacet to matching mechanics', () => {
  const mechanics = [
    { mechanic: 'seven-topdeck-cast', selectionCount: 5 },
    { mechanic: 'ace-counter', selectionCount: 3 },
    { mechanic: 'unclassified', selectionCount: 1 }
  ];
  const rankAnalytics = buildRankAnalytics({ summaries: [], aggregate: null });
  const augmented = augmentMechanicsWithRankFacets(mechanics, rankAnalytics);
  assert.ok(augmented[0].rankFacet);
  assert.equal(augmented[0].rankFacet.rank, '7');
  assert.ok(augmented[1].rankFacet);
  assert.equal(augmented[1].rankFacet.rank, 'A');
  assert.equal(augmented[2].rankFacet, null);
});

test('augmentMechanicsWithRankFacets returns original when no rankAnalytics', () => {
  const mechanics = [{ mechanic: 'test', selectionCount: 1 }];
  const result = augmentMechanicsWithRankFacets(mechanics, null);
  assert.deepEqual(result, mechanics);
});

test('buildRankCompareFacet produces comparison data', () => {
  const rankAnalytics = buildRankAnalytics({ summaries: [], aggregate: null });
  const facet = buildRankCompareFacet(rankAnalytics);
  assert.ok(facet);
  assert.equal(facet.schemaVersion, '1.0.0');
  assert.ok(facet.compareData);
  assert.ok(facet.compareData['A']);
  assert.ok(facet.compareData['K']);
});

test('buildRankCompareFacet returns null for no rankAnalytics', () => {
  assert.equal(buildRankCompareFacet(null), null);
});

test('buildRankEvidenceFacet produces evidence data', () => {
  const rankAnalytics = buildRankAnalytics({ summaries: [], aggregate: { aggregateHash: 'abc123' } });
  const facet = buildRankEvidenceFacet(rankAnalytics);
  assert.ok(facet);
  assert.equal(facet.schemaVersion, '1.0.0');
  assert.ok(facet.metricRegistry);
  assert.equal(facet.rankCount, 15);
  assert.ok(facet.watchlist);
});

test('buildRankEvidenceFacet returns null for no rankAnalytics', () => {
  assert.equal(buildRankEvidenceFacet(null), null);
});

test('fractional multi-rank participation stays coherent across selection, outcome, and causal delta metrics', () => {
  const summaries = [
    makeSummary({
      winner: 'P1',
      rankDecisions: [
        {
          checkpointId: 'M001:D0',
          participantId: 'P1',
          rankAttribution: {
            primaryRank: 'K',
            sourceRanks: ['K', 'Q'],
            rankWeights: { K: 0.5, Q: 0.5 },
            attributionStatus: 'fractional',
            playForm: 'royal-marriage',
            originRank: null,
            generatedRank: null
          },
          rankOpportunities: [
            { rank: 'K', opportunityFrames: 1, legalOptions: 1 },
            { rank: 'Q', opportunityFrames: 1, legalOptions: 1 }
          ],
          action: { family: 'royal-marriage', timingClass: 'STANDARD' },
          legalActions: [],
          stateDelta: {
            securedPointDeltaByPlayer: { P1: 4, P2: 0 },
            boardPresenceDeltaByPlayer: { P1: 2, P2: 0 },
            attributionStatus: 'observed'
          }
        }
      ]
    })
  ];

  const result = buildRankAnalytics({ summaries, aggregate: null });
  for (const rank of ['K', 'Q']) {
    const metrics = result.rankCounters[rank];
    assert.equal(metrics.rankSelectionCount, 1, `${rank} must receive one participation`);
    assert.equal(metrics.rankOpportunityCount, 1, `${rank} must receive the matching opportunity`);
    assert.equal(metrics.rankVictoryContributionCount, 1, `${rank} must receive the match outcome`);
    assert.equal(metrics.rankStateDeltaObservationCount, 1, `${rank} must receive a causal observation`);
    assert.equal(metrics.rankSecuredPointContribution, 2, `${rank} must receive its weighted point contribution`);
    assert.equal(metrics.rankBoardPresenceContribution, 1, `${rank} must receive its weighted board contribution`);
  }
});

test('participant extraction accepts policyIdsBySeat objects without inventing numeric seat IDs', () => {
  const result = buildRankAnalytics({
    summaries: [makeSummary({
      participants: undefined,
      policyIdsBySeat: { P1: 'tempo', P2: 'control' }
    })],
    aggregate: null
  });
  assert.deepEqual(result.participantIds, ['P1', 'P2']);
});
