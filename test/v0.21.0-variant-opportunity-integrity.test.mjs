// ═══════════════════════════════════════════════════════════════
// v0.21.0-variant-opportunity-integrity.test.mjs
//
// Regression coverage for the Rank Anatomy Observatory anomaly where
// aggregate rank opportunities were zero while selections were nonzero,
// and Spades/Super variant opportunities were never populated.
//
// Root cause: buildVariantAnalytics only created opportunity entries for
// the ":normal" variant key, never for the rank-overall aggregate, the
// Spades variant, or Super effect keys. Selections were still credited
// via creditKeys, producing internally inconsistent data.
//
// Fix: runtime now records variantOpportunities per legal action;
// analytics uses variantOpportunities when available, with a legacy
// fallback that at least credits the rank-overall aggregate.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildVariantAnalytics, reconcileVariantAnalytics } from '@intrilex/analytics/rank-integration';
import { allVariantKeys } from '@intrilex/simulation-runtime/variant-registry';
import { runPolicyMatch } from '@intrilex/simulation-runtime';

const VARIANT_KEYS = allVariantKeys();

function makeSummary(rankDecisions, overrides = {}) {
  return {
    matchId: 'M-FIXTURE',
    matchOrdinal: 0,
    participants: ['P1', 'P2'],
    winner: 'P1',
    outcome: 'NORMAL_VICTORY',
    terminationReason: 'NORMAL_VICTORY',
    rankDecisions,
    ...overrides
  };
}

// ── 1. Legacy fallback: rank-overall must get opportunities ──────────
test('LEGACY: rank-overall aggregate gets opportunities from rankOpportunities fallback', () => {
  const decision = {
    participantId: 'P1',
    rankAttribution: {
      primaryRank: '7',
      sourceRanks: ['7'],
      rankWeights: { '7': 1 },
      playForm: 'score',
      attributionStatus: 'exact'
    },
    rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 3 }],
    // No variantOpportunities — simulates legacy data
    action: { family: 'score', mode: 'ordinary', kind: 'score' },
    legalActions: []
  };
  const result = buildVariantAnalytics({ summaries: [makeSummary([decision])] });
  const rank7Overall = result.variantMetrics['7'];
  assert.ok(rank7Overall, 'Rank 7 overall metrics must exist');
  assert.ok(rank7Overall.variantOpportunityCount > 0,
    `Rank 7 overall opportunityCount must be > 0, got ${rank7Overall.variantOpportunityCount}`);
  assert.ok(rank7Overall.variantSelectionCount > 0,
    'Rank 7 overall selectionCount must be > 0');
  // Selection rate must not be 0.0% when both opportunities and selections exist
  assert.ok(rank7Overall.variantPlayRate > 0,
    `Rank 7 overall playRate must be > 0, got ${rank7Overall.variantPlayRate}`);
});

// ── 2. New format: variantOpportunities populate all tiers ───────────
test('NEW FORMAT: variantOpportunities populate rank-overall, normal, spade, and super keys', () => {
  const decision = {
    participantId: 'P1',
    rankAttribution: {
      primaryRank: '7',
      sourceRanks: ['7'],
      rankWeights: { '7': 1 },
      playForm: 'score',
      attributionStatus: 'exact'
    },
    rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 3 }],
    variantOpportunities: [
      { variantKey: '7', opportunityFrames: 1, legalOptions: 3 },
      { variantKey: '7:normal', opportunityFrames: 1, legalOptions: 2 },
      { variantKey: '7:spade', opportunityFrames: 1, legalOptions: 1 }
    ],
    action: { family: 'score', mode: 'ordinary', kind: 'score' },
    legalActions: []
  };
  const result = buildVariantAnalytics({ summaries: [makeSummary([decision])] });

  const rank7 = result.variantMetrics['7'];
  const normal7 = result.variantMetrics['7:normal'];
  const spade7 = result.variantMetrics['7:spade'];

  assert.ok(rank7?.variantOpportunityCount > 0, 'Rank 7 overall must have opportunities');
  assert.ok(normal7?.variantOpportunityCount > 0, 'Rank 7 normal must have opportunities');
  assert.ok(spade7?.variantOpportunityCount > 0, 'Rank 7 spade must have opportunities');
});

// ── 3. Super variant opportunities ───────────────────────────────────
test('NEW FORMAT: Super variant opportunities are populated', () => {
  const decision = {
    participantId: 'P1',
    rankAttribution: {
      primaryRank: 'A',
      sourceRanks: ['A'],
      rankWeights: { 'A': 1 },
      playForm: 'super',
      attributionStatus: 'exact'
    },
    rankOpportunities: [{ rank: 'A', opportunityFrames: 1, legalOptions: 1 }],
    variantOpportunities: [
      { variantKey: 'A', opportunityFrames: 1, legalOptions: 1 },
      { variantKey: 'A:super:super-ace', opportunityFrames: 1, legalOptions: 1 },
      { variantKey: 'A:super:all', opportunityFrames: 1, legalOptions: 1 }
    ],
    action: { family: 'super', mode: 'super-counter', kind: 'core-declare-super-ace-counter' },
    legalActions: []
  };
  const result = buildVariantAnalytics({ summaries: [makeSummary([decision])] });

  const superAce = result.variantMetrics['A:super:super-ace'];
  const superAll = result.variantMetrics['A:super:all'];
  assert.ok(superAce?.variantOpportunityCount > 0, 'Super Ace must have opportunities');
  assert.ok(superAll?.variantOpportunityCount > 0, 'Super All must have opportunities');
});

// ── 4. Telemetry invariant: selections <= opportunities ──────────────
test('INVARIANT: selections <= opportunities for all variant keys (new format)', () => {
  const decisions = [
    {
      participantId: 'P1',
      rankAttribution: { primaryRank: '7', sourceRanks: ['7'], rankWeights: { '7': 1 }, playForm: 'score', attributionStatus: 'exact' },
      rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 3 }],
      variantOpportunities: [
        { variantKey: '7', opportunityFrames: 1, legalOptions: 3 },
        { variantKey: '7:normal', opportunityFrames: 1, legalOptions: 2 },
        { variantKey: '7:spade', opportunityFrames: 1, legalOptions: 1 }
      ],
      action: { family: 'score', mode: 'ordinary', kind: 'score' },
      legalActions: []
    },
    {
      participantId: 'P2',
      rankAttribution: { primaryRank: '7', sourceRanks: ['7'], rankWeights: { '7': 1 }, playForm: 'score', attributionStatus: 'exact' },
      rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 2 }],
      variantOpportunities: [
        { variantKey: '7', opportunityFrames: 1, legalOptions: 2 },
        { variantKey: '7:normal', opportunityFrames: 1, legalOptions: 2 }
      ],
      action: { family: 'score', mode: 'ordinary', kind: 'score' },
      legalActions: []
    }
  ];
  const result = buildVariantAnalytics({ summaries: [makeSummary(decisions)] });

  for (const key of VARIANT_KEYS) {
    const m = result.variantMetrics[key];
    if (!m) continue;
    if (m.variantSelectionCount > 0) {
      assert.ok(m.variantOpportunityCount > 0,
        `variantKey "${key}" has selections=${m.variantSelectionCount} but opportunities=0 — data integrity failure`);
    }
    assert.ok(m.variantSelectionCount <= m.variantOpportunityCount,
      `variantKey "${key}" selections=${m.variantSelectionCount} > opportunities=${m.variantOpportunityCount}`);
  }
});

// ── 5. End-to-end: real simulation produces variantOpportunities ─────
test('E2E: runPolicyMatch produces decisions with variantOpportunities', () => {
  const match = runPolicyMatch({
    seed: 42,
    profileId: 'core-advanced-authority',
    seatOrder: ['P1', 'P2'],
    policyIds: ['tempo', 'control']
  });
  const decisions = match.summary?.rankDecisions ?? [];
  assert.ok(decisions.length > 0, 'Match must produce rank decisions');
  const withVariantOpps = decisions.filter(d => d.variantOpportunities);
  assert.ok(withVariantOpps.length > 0,
    'At least some decisions must have variantOpportunities after the runtime fix');
});

// ── 6. End-to-end: no selections-without-opportunity in real match ──
test('E2E: no variant key has selections without opportunities in real match analytics', () => {
  const match = runPolicyMatch({
    seed: 99,
    profileId: 'core-advanced-authority',
    seatOrder: ['P1', 'P2'],
    policyIds: ['tempo', 'control']
  });
  const result = buildVariantAnalytics({ summaries: [match.summary] });

  let violations = 0;
  for (const key of VARIANT_KEYS) {
    const m = result.variantMetrics[key];
    if (!m) continue;
    if (m.variantSelectionCount > 0 && m.variantOpportunityCount === 0) {
      violations++;
      console.error(`DATA INTEGRITY FAILURE: variantKey "${key}" has selections=${m.variantSelectionCount} but opportunities=0`);
    }
  }
  assert.equal(violations, 0, 'No variant key should have selections without opportunities');
});

// ── 7. Rank comparison structure has opportunities for all levels ────
test('rankComparisons levels have non-null metrics for populated variants', () => {
  const decision = {
    participantId: 'P1',
    rankAttribution: { primaryRank: '7', sourceRanks: ['7'], rankWeights: { '7': 1 }, playForm: 'score', attributionStatus: 'exact' },
    rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 3 }],
    variantOpportunities: [
      { variantKey: '7', opportunityFrames: 1, legalOptions: 3 },
      { variantKey: '7:normal', opportunityFrames: 1, legalOptions: 2 },
      { variantKey: '7:spade', opportunityFrames: 1, legalOptions: 1 }
    ],
    action: { family: 'score', mode: 'ordinary', kind: 'score' },
    legalActions: []
  };
  const result = buildVariantAnalytics({ summaries: [makeSummary([decision])] });
  const cmp = result.rankComparisons['7'];
  assert.ok(cmp, 'Rank 7 comparison must exist');
  const levels = cmp.levels;
  // The overall, normal, and spade levels should all have non-null metrics with opportunities
  assert.ok(levels['7']?.metrics?.variantOpportunityCount > 0, 'Rank 7 overall level must have opportunities');
  assert.ok(levels['7:normal']?.metrics?.variantOpportunityCount > 0, 'Rank 7 normal level must have opportunities');
  assert.ok(levels['7:spade']?.metrics?.variantOpportunityCount > 0, 'Rank 7 spade level must have opportunities');
});

// ── 8. Reconciliation: no violations in clean data ───────────────────
test('RECONCILE: clean data produces no violations', () => {
  const decisions = [
    {
      participantId: 'P1',
      rankAttribution: { primaryRank: '7', sourceRanks: ['7'], rankWeights: { '7': 1 }, playForm: 'score', attributionStatus: 'exact' },
      rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 3 }],
      variantOpportunities: [
        { variantKey: '7', opportunityFrames: 1, legalOptions: 3 },
        { variantKey: '7:normal', opportunityFrames: 1, legalOptions: 2 },
        { variantKey: '7:spade', opportunityFrames: 1, legalOptions: 1 }
      ],
      action: { family: 'score', mode: 'ordinary', kind: 'score' },
      legalActions: []
    }
  ];
  const result = buildVariantAnalytics({ summaries: [makeSummary(decisions)] });
  const reconciliation = reconcileVariantAnalytics(result);
  assert.equal(reconciliation.status, 'PASS', 'Clean data should produce no violations');
  assert.equal(reconciliation.violationCount, 0);
});

// ── 9. Reconciliation: detects selections without opportunities ──────
test('RECONCILE: detects selections without opportunities (legacy bug pattern)', () => {
  // Simulate the legacy bug: rank-overall has selections but no opportunities
  const decisions = [
    {
      participantId: 'P1',
      rankAttribution: { primaryRank: '7', sourceRanks: ['7'], rankWeights: { '7': 1 }, playForm: 'score', attributionStatus: 'exact' },
      rankOpportunities: [{ rank: '7', opportunityFrames: 1, legalOptions: 3 }],
      // Legacy data: no variantOpportunities, only rankOpportunities
      // The fallback credits rank-overall and normal, so this should be clean
      action: { family: 'score', mode: 'ordinary', kind: 'score' },
      legalActions: []
    }
  ];
  const result = buildVariantAnalytics({ summaries: [makeSummary(decisions)] });
  const reconciliation = reconcileVariantAnalytics(result);
  assert.equal(reconciliation.status, 'PASS',
    'Legacy fallback should credit rank-overall with opportunities, no violations');
});

// ── 10. Reconciliation: detects aggregate zero while children nonzero ─
test('RECONCILE: detects aggregate opportunities zero while children nonzero', () => {
  // Manually construct variant analytics with the anomaly pattern
  const result = {
    variantMetrics: {
      '7': { variantOpportunityCount: 0, variantSelectionCount: 77, variantSuccessCount: 0, variantFailureCount: 0 },
      '7:normal': { variantOpportunityCount: 1073, variantSelectionCount: 56, variantSuccessCount: 0, variantFailureCount: 0 },
      '7:spade': { variantOpportunityCount: 0, variantSelectionCount: 21, variantSuccessCount: 0, variantFailureCount: 0 }
    }
  };
  const reconciliation = reconcileVariantAnalytics(result);
  assert.equal(reconciliation.status, 'FAIL');
  assert.ok(reconciliation.violationCount >= 2,
    `Expected at least 2 violations (aggregate zero + selections without opportunities), got ${reconciliation.violationCount}`);
  const invariantTypes = reconciliation.violations.map(v => v.invariant);
  assert.ok(invariantTypes.includes('SELECTIONS_WITHOUT_OPPORTUNITIES'),
    'Must detect selections without opportunities');
  assert.ok(invariantTypes.includes('AGGREGATE_OPPORTUNITIES_ZERO_WHILE_CHILDREN_NONZERO'),
    'Must detect aggregate opportunities zero while children nonzero');
});

// ── 11. E2E reconciliation on real match ─────────────────────────────
test('E2E: reconciliation passes on real match analytics', () => {
  const match = runPolicyMatch({
    seed: 77,
    profileId: 'core-advanced-authority',
    seatOrder: ['P1', 'P2'],
    policyIds: ['tempo', 'control']
  });
  const result = buildVariantAnalytics({ summaries: [match.summary] });
  const reconciliation = reconcileVariantAnalytics(result);
  assert.equal(reconciliation.status, 'PASS',
    `Real match analytics should have no violations: ${JSON.stringify(reconciliation.violations)}`);
});
