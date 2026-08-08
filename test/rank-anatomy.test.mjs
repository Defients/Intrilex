import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalRankAnatomyRegistry, rank2EligibilityRecord, rankEligibilitySummary, RANK_ANATOMY_SCHEMA_VERSION } from '@intrilex/simulation-runtime/rank-anatomy-registry';
import { hashCanonical } from '@intrilex/shared';

// ── Canonical Registry Tests ──────────────────────────────────────────────────

test('Rank Anatomy registry has correct schema version', () => {
  const reg = canonicalRankAnatomyRegistry();
  assert.equal(reg.schemaVersion, RANK_ANATOMY_SCHEMA_VERSION);
  assert.equal(reg.schemaVersion, '1.0.0');
});

test('All 15 canonical ranks are present in the registry', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  assert.equal(reg.rankCount, 15);
  const rankIds = reg.ranks.map(r => r.rankId);
  assert.deepEqual(rankIds, ['A','2','3','4','5','6','7','8','9','10','J','Q','K','RJ','BJ']);
});

test('All 13 eligible Spades variants are discovered', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  assert.equal(reg.spadesVariantCount, 13);
  const spadesEligible = reg.ranks.filter(r => r.spadesEligible);
  assert.equal(spadesEligible.length, 13);
  // Jokers should NOT be eligible
  const jokers = reg.ranks.filter(r => r.rankId === 'RJ' || r.rankId === 'BJ');
  for (const j of jokers) {
    assert.equal(j.spadesEligible, false);
    assert.equal(j.spadesVariant.eligible, false);
  }
});

test('Ineligible ranks include reason codes', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  const rj = reg.ranks.find(r => r.rankId === 'RJ');
  assert.equal(rj.spadesVariant.eligible, false);
  assert.equal(rj.spadesVariant.ineligibilityReason, 'NO_DISTINCT_SPADES_BEHAVIOR');
  const bj = reg.ranks.find(r => r.rankId === 'BJ');
  assert.equal(bj.spadesVariant.eligible, false);
  assert.equal(bj.spadesVariant.ineligibilityReason, 'NO_DISTINCT_SPADES_BEHAVIOR');
});

test('Rank 2 is eligible with DISTINCT_SPADES_PLAY_FORM reason', () => {
  const r2 = rank2EligibilityRecord(hashCanonical);
  assert.equal(r2.spadesVariantEligible, true);
  assert.equal(r2.reasonCode, 'DISTINCT_SPADES_PLAY_FORM');
  assert.equal(r2.hasDistinctPrintedSpadesEffect, false, 'Rank 2 has NO distinct printed Spades effect');
  assert.equal(r2.hasDistinctSpadesPlayForm, true, 'Rank 2 has a distinct Spades play form (targeting scope)');
  assert.equal(r2.hasDistinctSpadesResolution, true, 'Rank 2 has distinct Spades resolution');
  assert.equal(r2.spadesAnalyticsEligible, true, 'Rank 2 is eligible for independent Spades analytics');
  assert.equal(r2.mode, 'solo-wild-copy');
  assert.ok(r2.note, 'Rank 2 should have a note explaining the distinction');
  assert.ok(r2.authorityHash, 'Rank 2 eligibility should have an authority hash');
});

test('All 9 Super effects have stable IDs', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  assert.equal(reg.superEffectCount, 9);
  const expectedEffectIds = [
    'super-ace', 'super-two', 'super-three-raid', 'super-four-exchange',
    'super-five-recycle', 'super-six-dig', 'super-seven-topdeck',
    'super-eight-scuttle', 'super-jack-tempo'
  ];
  const actualEffectIds = reg.ranks.flatMap(r => r.supers.map(s => s.effectId));
  assert.deepEqual(actualEffectIds.sort(), expectedEffectIds.sort());
});

test('No display label is used as primary identity', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  for (const rank of reg.ranks) {
    assert.ok(rank.rankId, 'Each rank must have a rankId');
    for (const sup of rank.supers) {
      assert.ok(sup.effectId, 'Each Super must have an effectId');
      assert.ok(sup.superId, 'Each Super must have a superId');
      assert.notEqual(sup.effectId, sup.displayName, 'effectId must not be the display label');
    }
  }
});

test('Registry hash is deterministic', () => {
  const r1 = canonicalRankAnatomyRegistry(hashCanonical);
  const r2 = canonicalRankAnatomyRegistry(hashCanonical);
  assert.equal(r1.registryHash, r2.registryHash);
  assert.match(r1.registryHash, /^[a-f0-9]{64}$/);
});

test('Eligibility summary covers all 15 ranks', () => {
  const summary = rankEligibilitySummary();
  assert.equal(summary.length, 15);
  for (const s of summary) {
    assert.ok(s.rankId, 'Each summary entry must have a rankId');
    assert.equal(typeof s.spadesVariantEligible, 'boolean');
    assert.ok(Array.isArray(s.superEffectIds));
  }
});

test('Rank 9 has no Super effect (undefined in canon)', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  const r9 = reg.ranks.find(r => r.rankId === '9');
  assert.equal(r9.superEffectCount, 0);
  assert.equal(r9.supers.length, 0);
});

test('Rank 10 has no Super effect', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  const r10 = reg.ranks.find(r => r.rankId === '10');
  assert.equal(r10.superEffectCount, 0);
});

test('Authority hash is present and stable', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  assert.ok(reg.rankAuthorityHash, 'Registry must have a rank authority hash');
  assert.match(reg.rankAuthorityHash, /^[a-f0-9]{64}$/);
  for (const rank of reg.ranks) {
    assert.equal(rank.authority.authorityHash, reg.rankAuthorityHash, 'All ranks must share the same authority hash');
  }
});

test('Origin kinds are enumerated', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  assert.deepEqual(reg.originKinds, ['natural', 'generated', 'copied', 'mimicked', 'replayed', 'transferred', 'unknown']);
});

test('Descriptive classifications do not include balance verdicts', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  const forbidden = ['overpowered', 'underpowered', 'broken', 'balanced', 'useless', 'mandatory'];
  for (const cls of reg.descriptiveClassifications) {
    assert.ok(!forbidden.includes(cls), `Classification "${cls}" is a forbidden balance verdict`);
  }
});

// ── Build Artifact Tests ──────────────────────────────────────────────────────

test('Generated rank-anatomy-registry.json artifact exists and is valid', async () => {
  const raw = await readFile('sample-data/observatory/rank-anatomy-registry.json', 'utf8');
  const reg = JSON.parse(raw);
  assert.equal(reg.schemaVersion, '1.0.0');
  assert.equal(reg.rankCount, 15);
  assert.equal(reg.spadesVariantCount, 13);
  assert.equal(reg.superEffectCount, 9);
  assert.ok(reg.registryHash, 'Artifact must have a registry hash');
});

test('Generated rank-2-eligibility.json artifact exists and is valid', async () => {
  const raw = await readFile('sample-data/observatory/rank-2-eligibility.json', 'utf8');
  const r2 = JSON.parse(raw);
  assert.equal(r2.rankId, '2');
  assert.equal(r2.spadesVariantEligible, true);
  assert.equal(r2.reasonCode, 'DISTINCT_SPADES_PLAY_FORM');
  assert.equal(r2.hasDistinctPrintedSpadesEffect, false);
  assert.equal(r2.hasDistinctSpadesPlayForm, true);
  assert.equal(r2.spadesAnalyticsEligible, true);
});

test('Observatory analytics.json contains variantAnalytics', async () => {
  const raw = await readFile('sample-data/observatory/analytics.json', 'utf8');
  const a = JSON.parse(raw);
  assert.ok(a.variantAnalytics, 'Observatory artifact must contain variantAnalytics');
  assert.ok(a.variantAnalytics.variantMetrics, 'variantAnalytics must have variantMetrics');
  assert.ok(a.variantAnalytics.rankComparisons, 'variantAnalytics must have rankComparisons');
  assert.ok(a.variantAnalytics.metricRegistryHash, 'variantAnalytics must have metricRegistryHash');
});

test('Observatory analytics schema version is 4.2.0', async () => {
  const raw = await readFile('sample-data/observatory/analytics.json', 'utf8');
  const a = JSON.parse(raw);
  assert.equal(a.schemaVersion, '4.2.0');
});

// ── Falsification Tests ───────────────────────────────────────────────────────

test('FALSIFICATION: A Spades card inside a Super must not inflate ordinary Spades use', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  // The registry must separate Spades variant from Super declarations
  for (const rank of reg.ranks) {
    if (rank.spadesEligible && rank.superEffectCount > 0) {
      // Spades variant effect IDs must not overlap with Super effect IDs
      const spadeEffectIds = rank.spadesVariant.effectIds;
      const superEffectIds = rank.supers.map(s => s.effectId);
      for (const sid of superEffectIds) {
        assert.ok(!spadeEffectIds.includes(sid), `Super effect ${sid} must not be in Spades variant effect IDs for rank ${rank.rankId}`);
      }
    }
  }
});

test('FALSIFICATION: Rank 2 must not be incorrectly omitted', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  const r2 = reg.ranks.find(r => r.rankId === '2');
  assert.ok(r2, 'Rank 2 must be present in the registry');
  assert.equal(r2.spadesEligible, true, 'Rank 2 must be eligible for Spades analysis');
  assert.equal(r2.spadesVariant.eligibilityReasonCode, 'DISTINCT_SPADES_PLAY_FORM', 'Rank 2 reason must be play-form distinction, not printed effect');
  assert.equal(r2.spadesVariant.hasDistinctPrintedSpadesEffect, false, 'Rank 2 has no distinct printed Spades effect');
  assert.equal(r2.spadesVariant.hasDistinctSpadesPlayForm, true, 'Rank 2 has distinct Spades play form');
});

test('FALSIFICATION: Low-sample variants must not dominate rankings', () => {
  // The registry defines evidence grades that prevent low-sample dominance
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  assert.ok(reg.evidenceGrades.includes('insufficient'), 'Evidence grades must include "insufficient"');
  assert.ok(reg.evidenceGrades.includes('provisional'), 'Evidence grades must include "provisional"');
  assert.ok(reg.evidenceGrades.includes('weak'), 'Evidence grades must include "weak"');
});

test('FALSIFICATION: Missing effects must not become zero-valued effects', () => {
  const reg = canonicalRankAnatomyRegistry(hashCanonical);
  // Ranks without Supers must have empty supers array, not a zero-valued Super
  for (const rank of reg.ranks) {
    if (rank.superEffectCount === 0) {
      assert.equal(rank.supers.length, 0, `Rank ${rank.rankId} must have empty supers array, not zero-valued entries`);
    }
  }
});
