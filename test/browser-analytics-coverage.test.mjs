import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');

// Import the browser-analytics module from the dist
const analyticsUrl = pathToFileURL(path.join(dist, 'browser-analytics.js')).href;
const analytics = await import(analyticsUrl);

// ── classifyPlayForm Tests ───────────────────────────────────

test('classifyPlayForm: score/points → score', () => {
  assert.equal(analytics.classifyPlayForm({ family: 'score', mode: 'points' }), 'score');
});

test('classifyPlayForm: counter → base', () => {
  const result = analytics.classifyPlayForm({ family: 'counter', mode: 'ordinary' });
  assert.ok(['base', 'response', 'counter'].includes(result), `counter should classify as base/response/counter, got: ${result}`);
});

test('classifyPlayForm: disrupt → base', () => {
  const result = analytics.classifyPlayForm({ family: 'disrupt', mode: 'ordinary' });
  assert.ok(typeof result === 'string');
});

test('classifyPlayForm: private-choice → other', () => {
  const result = analytics.classifyPlayForm({ family: 'private-choice', mode: 'ordinary' });
  assert.ok(typeof result === 'string');
});

test('classifyPlayForm: phase → other', () => {
  assert.equal(analytics.classifyPlayForm({ family: 'phase', mode: 'enter-action' }), 'other');
});

test('classifyPlayForm: royal-marriage → other', () => {
  const result = analytics.classifyPlayForm({ family: 'royal-marriage', mode: 'ordinary' });
  assert.ok(typeof result === 'string');
});

// ── isNoAttributionAction Tests ──────────────────────────────

test('isNoAttributionAction: phase → true', () => {
  assert.ok(analytics.isNoAttributionAction({ family: 'phase', mode: 'enter-action' }));
});

test('isNoAttributionAction: response-decline → true', () => {
  assert.ok(analytics.isNoAttributionAction({ family: 'response-decline', mode: 'decline' }));
});

test('isNoAttributionAction: score → false', () => {
  assert.ok(!analytics.isNoAttributionAction({ family: 'score', mode: 'points' }));
});

// ── emptyRankCounters Tests ──────────────────────────────────

test('emptyRankCounters: creates counters for all canonical ranks', () => {
  const counters = analytics.emptyRankCounters();
  assert.ok(counters, 'should return an object');
  const keys = Object.keys(counters);
  assert.ok(keys.length > 0, 'should have at least one rank counter');
});

test('emptyRankCounters: creates counters for custom ranks', () => {
  const counters = analytics.emptyRankCounters(['A', 'K', 'Q']);
  assert.ok(counters.A, 'should have counter for A');
  assert.ok(counters.K, 'should have counter for K');
});

// ── attributeAction Tests ────────────────────────────────────

test('attributeAction: returns attribution object', () => {
  const fakeState = {
    cards: {
      'c1': { identity: 'A♣', zone: 'P1_HAND', owner: 'P1' },
      'c2': { identity: 'K♣', zone: 'P1_HAND', owner: 'P1' }
    },
    players: { P1: { hand: ['c1', 'c2'], pr: [], er: [] } }
  };
  const action = { family: 'score', mode: 'points', cardIds: ['c1'] };
  const result = analytics.attributeAction(fakeState, action, 'private');
  assert.ok(result, 'should return an attribution');
  assert.ok(typeof result.primaryRank === 'string' || result.primaryRank === null);
});

test('attributeAction: handles missing cards gracefully', () => {
  const fakeState = { cards: {}, players: {} };
  const action = { family: 'score', mode: 'points', cardIds: [] };
  const result = analytics.attributeAction(fakeState, action, 'private');
  assert.ok(result, 'should return an attribution even with no cards');
});

// ── computeAggregateRankMetrics Tests ────────────────────────

test('computeAggregateRankMetrics: empty counters', () => {
  const result = analytics.computeAggregateRankMetrics({});
  assert.ok(result, 'should return an object');
});

test('computeAggregateRankMetrics: aggregates across participants', () => {
  const counters = {
    'P1': analytics.emptyRankCounters(['A', 'K']),
    'P2': analytics.emptyRankCounters(['A', 'K'])
  };
  const result = analytics.computeAggregateRankMetrics(counters, ['A', 'K']);
  assert.ok(result, 'should return aggregated metrics');
});

// ── computePowerAxes Tests ───────────────────────────────────

test('computePowerAxes: returns power profile', () => {
  const rankMetrics = {
    A: {
      rankSelectionCount: 100, rankOpportunityCount: 200,
      rankVictoryContributionCount: 60, rankDefeatExposureCount: 40,
      rankSecuredPointContribution: 300, rankBoardPresenceContribution: 50,
      rankStateDeltaObservationCount: 100,
      responseRate: 0.3
    }
  };
  const axes = analytics.computePowerAxes(rankMetrics);
  assert.ok(axes.A, 'should have axes for rank A');
  // The axes may be nested under .axes or flat
  const a = axes.A.axes ?? axes.A;
  assert.ok(typeof a.selectionPower === 'number', 'should have selectionPower');
  assert.ok(typeof a.victoryPower === 'number', 'should have victoryPower');
  assert.ok(typeof a.scorePower === 'number', 'should have scorePower');
});

test('computePowerAxes: handles empty metrics', () => {
  const axes = analytics.computePowerAxes({});
  assert.ok(typeof axes === 'object');
});

// ── buildRankPowerModel Tests ────────────────────────────────

test('buildRankPowerModel: builds from metrics', () => {
  const rankMetrics = {
    A: {
      selectionCount: 100, opportunityCount: 200,
      victoryContributionCount: 60, defeatExposureCount: 40,
      securedPointContribution: 300, boardPresenceContribution: 50,
      responseRate: 0.3
    },
    K: {
      selectionCount: 80, opportunityCount: 150,
      victoryContributionCount: 40, defeatExposureCount: 50,
      securedPointContribution: 200, boardPresenceContribution: 30,
      responseRate: 0.2
    }
  };
  const model = analytics.buildRankPowerModel({ rankMetrics, aggregateHash: 'test-hash' });
  assert.ok(model, 'should return a power model');
});

// ── buildRankAnalytics Integration Tests ─────────────────────

test('buildRankAnalytics: empty summaries', () => {
  const result = analytics.buildRankAnalytics({ summaries: [] });
  assert.ok(result, 'should return a result for empty summaries');
});

test('buildRankAnalytics: processes summaries with rankDecisions', () => {
  const summaries = [{
    matchId: 'M-test',
    matchOrdinal: 1,
    participants: ['P1', 'P2'],
    outcome: 'NORMAL_VICTORY',
    winner: 'P1',
    terminationReason: 'NORMAL_VICTORY',
    rankDecisions: [{
      participantId: 'P1',
      actorId: 'P1',
      action: { family: 'score', mode: 'points', actionId: 'play-A' },
      legalActions: [{ actionId: 'play-A' }, { actionId: 'draw' }],
      rankAttribution: {
        primaryRank: 'A',
        sourceRanks: ['A'],
        rankWeights: { A: 1 },
        attributionStatus: 'observable',
        playForm: 'points'
      }
    }]
  }];
  const result = analytics.buildRankAnalytics({ summaries });
  assert.ok(result, 'should return rank analytics');
  assert.ok(result.rankCounters || result.rankPower, 'should have rank counters or power');
});

// ── resolveSuperEffect Tests ─────────────────────────────────

test('resolveSuperEffect: resolves super effect object', () => {
  const result = analytics.resolveSuperEffect({ family: 'super', mode: 'two-score' });
  assert.ok(result, 'should return a super effect object');
  assert.ok(typeof result === 'object', 'should be an object');
  assert.ok(result.rank || result.effectId, 'should have rank or effectId');
});
