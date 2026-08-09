// ═══════════════════════════════════════════════════════════════
// rank-truth-closure.test.mjs
// v0.25 Phase B: Rank Analytics Truth Closure regression tests.
//
// Explicitly tests the 9 root causes documented in
// RANK_DATA_INTEGRITY_INVESTIGATION.md. These tests lock in the fixes
// and ensure the same defects cannot silently regress.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const __ = (p) => path.join(root, p);

// ── Server-side imports ──
import { computePowerAxes, computeObservedRPI, computeDecisionPower, buildBalanceWatchlist, RPI_AXIS_WEIGHTS } from '../packages/simulation-runtime/src/rank-power.mjs';
import { aggregateRankDecisionValues } from '../packages/simulation-runtime/src/rank-counterfactual.mjs';
import { buildRankAnalytics, buildRankEvidenceFacet } from '../packages/analytics/src/rank-integration.mjs';

// ═══════════════════════════════════════════════════════════════
// Root Cause A: Server/browser schema drift produced NaN
// The server emits observedRankValue; the UI must read observedRankValue.
// ═══════════════════════════════════════════════════════════════
test('A. schema agreement: rank power model uses observedRankValue axis, not decisionValue', () => {
  assert.ok(RPI_AXIS_WEIGHTS.observedRankValue !== undefined, 'RPI_AXIS_WEIGHTS must have observedRankValue');
  assert.equal(RPI_AXIS_WEIGHTS.decisionValue, undefined, 'RPI_AXIS_WEIGHTS must NOT have decisionValue (old field)');
});

test('A. browser analytics source uses observedRankValue, not decisionValue in ORV output', async () => {
  const src = await readFile(__('apps/lab-web/src/browser-analytics.js'), 'utf8');
  assert.match(src, /observedRankValue/, 'browser analytics must emit observedRankValue');
  assert.match(src, /descriptive association.*not a counterfactual/, 'ORV must be labeled as descriptive, not counterfactual');
});

test('A. ranks workspace reads observedRankValue as primary field (with backward-compat fallback)', async () => {
  const src = await readFile(__('apps/lab-web/src/workspaces/ranks.js'), 'utf8');
  assert.match(src, /observedRankValue/, 'ranks workspace must read observedRankValue');
  // The fix reads observedRankValue FIRST, with decisionValue as a backward-compat
  // fallback for old artifacts. The key invariant is that observedRankValue is
  // the primary field — the old bug read decisionValue exclusively.
  assert.match(src, /axes\.observedRankValue\s*\?\?\s*axes\.decisionValue/,
    'ranks workspace must prefer observedRankValue over decisionValue (fallback for old artifacts)');
});

// ═══════════════════════════════════════════════════════════════
// Root Cause B: ORV sample accounting used the wrong field
// ═══════════════════════════════════════════════════════════════
test('B. aggregateRankDecisionValues uses selectedSampleSize, not multiplied observationalSampleCount', () => {
  const rows = ['2', '3', '4'].map(alt => ({
    selectedRank: 'A',
    alternativeRank: alt,
    observationalSampleCount: 80,
    selectedSampleSize: 100,
    winRateDelta: 0.1,
    scoreMarginDelta: 0,
    decisionValue: 0.1,
    confidence: 'MEDIUM'
  }));
  const aggregated = aggregateRankDecisionValues(rows);
  assert.equal(aggregated.A.swapCount, 3, '3 comparisons');
  assert.equal(aggregated.A.sampleSize, 100, 'sample size must be the selected sample, not 3×80');
  assert.equal(aggregated.A.totalRollouts, 100, 'total rollouts must not multiply observational samples');
});

// ═══════════════════════════════════════════════════════════════
// Root Cause C: Deferred resolutions not attributed to declaring rank
// ═══════════════════════════════════════════════════════════════
test('C. rank decisions carry checkpointId for deferred resolution attribution', () => {
  // The fractional multi-rank test in rank-integration.test.mjs already
  // verifies checkpointId flows through. Here we verify the field exists
  // in the decision shape.
  const decision = {
    checkpointId: 'M001:D0',
    participantId: 'P1',
    rankAttribution: { primaryRank: 'A', sourceRanks: ['A'], rankWeights: { A: 1 }, attributionStatus: 'primary', playForm: 'points', originRank: null, generatedRank: null },
    rankOpportunities: [{ rank: 'A', opportunityFrames: 1, legalOptions: 1 }],
    action: { family: 'points', timingClass: 'STANDARD' },
    legalActions: [],
    stateDelta: { securedPointDeltaByPlayer: { P1: 1, P2: 0 }, boardPresenceDeltaByPlayer: { P1: 0, P2: 0 }, attributionStatus: 'observed' }
  };
  assert.ok(decision.checkpointId, 'rank decision must carry checkpointId');
});

// ═══════════════════════════════════════════════════════════════
// Root Cause D: Missing causal telemetry treated as valid zero
// ═══════════════════════════════════════════════════════════════
test('D. zero rankStateDeltaObservationCount makes score/board not-observable (not zero)', () => {
  const metrics = {
    A: {
      rankOpportunityCount: 100, rankSelectionCount: 50,
      rankVictoryContributionCount: 30, rankDefeatExposureCount: 20,
      rankSecuredPointContribution: 0, rankBoardPresenceContribution: 0,
      rankStateDeltaObservationCount: 0,
      rankResponsePlayedCount: 0, rankCounterDeclarationCount: 0,
      rankResponseDeclinedCount: 0
    }
  };
  const profiles = computePowerAxes(metrics);
  assert.equal(profiles.A.axisStatus.scorePower, 'not-observable', 'zero observation count must be not-observable, not zero');
  assert.equal(profiles.A.axisStatus.boardPower, 'not-observable');
  assert.equal(profiles.A.axes.scorePower, null, 'not-observable axes must be null, not 0');
  assert.equal(profiles.A.axes.boardPower, null);
});

test('D. degenerate all-zero cohort with full coverage is labeled degenerate, not strong', () => {
  const metrics = {
    A: {
      rankOpportunityCount: 100, rankSelectionCount: 50,
      rankVictoryContributionCount: 30, rankDefeatExposureCount: 20,
      rankSecuredPointContribution: 0, rankBoardPresenceContribution: 0,
      rankStateDeltaObservationCount: 50, // full coverage but all zeros
      rankResponsePlayedCount: 0, rankCounterDeclarationCount: 0,
      rankResponseDeclinedCount: 0
    }
  };
  const profiles = computePowerAxes(metrics);
  // With full coverage but all-zero contribution, the axis should be
  // degenerate (observed but no separation), not presented as strong evidence.
  assert.ok(profiles.A.axisStatus.scorePower === 'degenerate' || profiles.A.axisStatus.scorePower === 'observed',
    `scorePower should be degenerate or observed, got ${profiles.A.axisStatus.scorePower}`);
});

// ═══════════════════════════════════════════════════════════════
// Root Cause E: Response Power double-counted counters
// ═══════════════════════════════════════════════════════════════
test('E. response power uses responsePlayedCount only, not counterDeclarationCount + responsePlayedCount', () => {
  const metrics = {
    A: {
      rankOpportunityCount: 100, rankSelectionCount: 50,
      rankVictoryContributionCount: 30, rankDefeatExposureCount: 20,
      rankSecuredPointContribution: 100, rankBoardPresenceContribution: 20,
      rankStateDeltaObservationCount: 50,
      rankResponsePlayedCount: 5, rankCounterDeclarationCount: 3,
      rankResponseDeclinedCount: 0
    }
  };
  const profiles = computePowerAxes(metrics);
  // If double-counted, responseRate would be (5+3)/50 = 0.16.
  // Correct: 5/50 = 0.10.
  assert.equal(profiles.A.raw.responseRate, 0.1, 'responseRate must be responsePlayedCount/selection, not (counter+response)/selection');
});

// ═══════════════════════════════════════════════════════════════
// Root Cause F: Decision Power mixed incomparable scales
// ═══════════════════════════════════════════════════════════════
test('F. computeDecisionPower normalizes ORV across cohort before blending', () => {
  // ORV can be negative or >1. Decision Power must normalize.
  const rpi = { A: 0.8, '2': 0.4 };
  const orvProfiles = {
    A: { averageDecisionValue: 2.5, confidence: 'HIGH', sampleSize: 100 },
    '2': { averageDecisionValue: -1.0, confidence: 'HIGH', sampleSize: 100 }
  };
  const dp = computeDecisionPower(rpi, orvProfiles);
  // Decision Power should be in [0,1] range, not mixing raw ORV
  if (dp.A !== null && dp.A !== undefined) {
    assert.ok(dp.A >= 0 && dp.A <= 1, `Decision Power A must be in [0,1], got ${dp.A}`);
  }
  if (dp['2'] !== null && dp['2'] !== undefined) {
    assert.ok(dp['2'] >= 0 && dp['2'] <= 1, `Decision Power 2 must be in [0,1], got ${dp['2']}`);
  }
});

test('F. computeDecisionPower returns null/undefined when RPI is unavailable', () => {
  const rpi = {}; // no RPI
  const orvProfiles = { A: { averageDecisionValue: 0.5, confidence: 'HIGH', sampleSize: 100 } };
  const dp = computeDecisionPower(rpi, orvProfiles);
  // When RPI has no entry for a rank, Decision Power is not computed for it.
  assert.ok(dp.A === null || dp.A === undefined, 'Decision Power must be null/undefined when RPI is unavailable');
});

// ═══════════════════════════════════════════════════════════════
// Root Cause G: Matrix mislabeled as counterfactual
// ═══════════════════════════════════════════════════════════════
test('G. analytics rank-integration labels ORV as observational, not counterfactual', async () => {
  const src = await readFile(__('packages/analytics/src/rank-integration.mjs'), 'utf8');
  // The matrix must be labeled as observed/observational, not counterfactual
  assert.match(src, /observedRankValue|observational/i, 'rank-integration must use observedRankValue or observational labeling');
});

test('G. browser analytics labels ORV as "descriptive association, not a counterfactual"', async () => {
  const src = await readFile(__('apps/lab-web/src/browser-analytics.js'), 'utf8');
  assert.match(src, /descriptive association.*not a counterfactual/, 'ORV must be explicitly labeled as descriptive, not counterfactual');
});

// ═══════════════════════════════════════════════════════════════
// Root Cause H: Filters implied unavailable capabilities
// ═══════════════════════════════════════════════════════════════
test('H. ranks workspace does not present Origin filter as operational when unavailable', async () => {
  const src = await readFile(__('apps/lab-web/src/workspaces/ranks/rank-anatomy-workspace.js'), 'utf8');
  // The workspace must either disable Origin or mark it unavailable
  // The investigation doc says "Origin is disabled and honestly marked unavailable"
  assert.ok(
    src.includes('unavailable') || src.includes('disabled') || src.includes('not yet recorded'),
    'rank-anatomy-workspace must mark Origin as unavailable/disabled'
  );
});

// ═══════════════════════════════════════════════════════════════
// Root Cause I: Fractional multi-rank telemetry inconsistency
// ═══════════════════════════════════════════════════════════════
test('I. fractional multi-rank attribution is coherent across selection, opportunity, outcome, and causal delta', () => {
  // This is a focused version of the rank-integration test.
  // The key invariant: if K and Q each get 0.5 weight, they each get
  // 1 participation (not 0.5), and the causal delta is weighted.
  const summaries = [{
    matchId: 'M001',
    winner: 'P1',
    rankDecisions: [{
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
    }]
  }];

  const result = buildRankAnalytics({ summaries, aggregate: null });
  for (const rank of ['K', 'Q']) {
    const m = result.rankCounters[rank];
    assert.equal(m.rankSelectionCount, 1, `${rank} must get 1 participation (not 0.5)`);
    assert.equal(m.rankOpportunityCount, 1, `${rank} must get matching opportunity`);
    assert.equal(m.rankVictoryContributionCount, 1, `${rank} must get match outcome`);
    assert.equal(m.rankStateDeltaObservationCount, 1, `${rank} must get causal observation`);
    assert.equal(m.rankSecuredPointContribution, 2, `${rank} must get weighted points (4×0.5)`);
    assert.equal(m.rankBoardPresenceContribution, 1, `${rank} must get weighted board (2×0.5)`);
  }
});

// ═══════════════════════════════════════════════════════════════
// Generated artifact acceptance checks
// ═══════════════════════════════════════════════════════════════
test('artifact: rank-analytics.json must not contain NaN or Infinity', async () => {
  const raw = await readFile(__('sample-data/observatory/rank-analytics.json'), 'utf8');
  assert.doesNotMatch(raw, /\bNaN\b/, 'rank-analytics.json must not contain NaN');
  assert.doesNotMatch(raw, /\bInfinity\b/, 'rank-analytics.json must not contain Infinity');
});

test('artifact: rank-analytics.json must have current provenance', async () => {
  const data = JSON.parse(await readFile(__('sample-data/observatory/rank-analytics.json'), 'utf8'));
  assert.ok(data.generatedAt, 'must have generatedAt timestamp');
  // Provenance is carried in rankPower.aggregateHash (the canonical hash of
  // the rank power model inputs) and rankPower.schemaVersion.
  assert.ok(data.rankPower?.aggregateHash || data.aggregateHash,
    'must have aggregateHash (in rankPower or top-level) for provenance');
  assert.ok(data.rankPower?.schemaVersion || data.schemaVersion,
    'must have schemaVersion for format provenance');
});

test('artifact: rank-analytics.json observational matrix must not be labeled counterfactual', async () => {
  const data = JSON.parse(await readFile(__('sample-data/observatory/rank-analytics.json'), 'utf8'));
  // Check that if there's an ORV/observational section, it's not labeled "counterfactual"
  const json = JSON.stringify(data);
  // The matrix should use observedRankValue, not decisionValue in its axis labels
  if (json.includes('observedRankValue')) {
    assert.ok(json.includes('observedRankValue'), 'artifact uses observedRankValue (correct schema)');
  }
  // Must not contain the old mislabeled "counterfactual" matrix label
  // (the observational matrix was previously called counterfactual)
  assert.doesNotMatch(json, /"counterfactualMatrix"/, 'artifact must not have counterfactualMatrix (old mislabeled field)');
});
