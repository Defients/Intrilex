import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VARIANT_REGISTRY_SCHEMA_VERSION,
  ADVANCED_CORE_PROFILE_ID,
  UNRESTRICTED_CORE_PROFILE_ID,
  ALL_CORE_PROFILES,
  ENTITY_TIER,
  VARIANT_ELIGIBLE_RANKS,
  entitiesForRank,
  allVariantEntities,
  allVariantKeys,
  resolveSuperEffect,
  hasSpadeVariant,
} from '@intrilex/simulation-runtime/variant-registry';
import {
  classifyPlayForm,
  attributeRankAction,
} from '@intrilex/simulation-runtime/rank-attribution';
import {
  POLICY_CATALOG,
  POLICY_BY_ID,
} from '@intrilex/simulation-runtime/policy-catalog';

// ─── Variant Registry ───────────────────────────────────────────────────────

test('VARIANT_REGISTRY_SCHEMA_VERSION is "1.0.0"', () => {
  assert.equal(VARIANT_REGISTRY_SCHEMA_VERSION, '1.0.0');
});

test('ALL_CORE_PROFILES contains advanced and unrestricted profile IDs', () => {
  assert.deepEqual(ALL_CORE_PROFILES, ['core-advanced-authority', 'core-unrestricted-authority']);
  assert.equal(ADVANCED_CORE_PROFILE_ID, 'core-advanced-authority');
  assert.equal(UNRESTRICTED_CORE_PROFILE_ID, 'core-unrestricted-authority');
});

test('ENTITY_TIER has 5 tiers', () => {
  assert.equal(ENTITY_TIER.RANK, 'rank');
  assert.equal(ENTITY_TIER.NORMAL, 'normal');
  assert.equal(ENTITY_TIER.SPADE, 'spade');
  assert.equal(ENTITY_TIER.SUPER, 'super');
  assert.equal(ENTITY_TIER.SUPER_AGGREGATE, 'super-aggregate');
});

test('VARIANT_ELIGIBLE_RANKS excludes jokers (13 ranks A–K)', () => {
  assert.equal(VARIANT_ELIGIBLE_RANKS.length, 13);
  assert.ok(!VARIANT_ELIGIBLE_RANKS.includes('RJ'));
  assert.ok(!VARIANT_ELIGIBLE_RANKS.includes('BJ'));
});

test('entitiesForRank returns rank overall + normal + spade for suited ranks', () => {
  const entities = entitiesForRank('A');
  const tiers = entities.map(e => e.tier);
  assert.ok(tiers.includes(ENTITY_TIER.RANK), 'must have rank overall');
  assert.ok(tiers.includes(ENTITY_TIER.NORMAL), 'must have normal');
  assert.ok(tiers.includes(ENTITY_TIER.SPADE), 'must have spade');
  // A also has a super effect
  assert.ok(tiers.includes(ENTITY_TIER.SUPER), 'A must have super effect');
  assert.ok(tiers.includes(ENTITY_TIER.SUPER_AGGREGATE), 'A must have super-aggregate');
});

test('entitiesForRank for jokers returns only rank overall', () => {
  const rjEntities = entitiesForRank('RJ');
  assert.equal(rjEntities.length, 1);
  assert.equal(rjEntities[0].tier, ENTITY_TIER.RANK);
  assert.equal(rjEntities[0].variantKey, 'RJ');
});

test('allVariantEntities returns a non-empty array covering all 15 ranks', () => {
  const all = allVariantEntities();
  assert.ok(all.length > 15, 'must have more than 15 entities (variants add to count)');
  const ranks = new Set(all.map(e => e.rank));
  assert.equal(ranks.size, 15, 'must cover all 15 canonical ranks');
});

test('allVariantKeys returns string array matching allVariantEntities', () => {
  const keys = allVariantKeys();
  const entities = allVariantEntities();
  assert.equal(keys.length, entities.length);
  for (let i = 0; i < keys.length; i++) {
    assert.equal(keys[i], entities[i].variantKey);
    assert.equal(typeof keys[i], 'string');
  }
});

test('hasSpadeVariant returns true for A–K and false for jokers', () => {
  assert.equal(hasSpadeVariant('A'), true);
  assert.equal(hasSpadeVariant('2'), true);
  assert.equal(hasSpadeVariant('K'), true);
  assert.equal(hasSpadeVariant('RJ'), false);
  assert.equal(hasSpadeVariant('BJ'), false);
});

test('resolveSuperEffect returns effect descriptor for known super action', () => {
  const effect = resolveSuperEffect({ kind: 'advanced-super-two' });
  assert.ok(effect, '⭐2 should resolve');
  assert.equal(effect.effectId, 'super-two');
});

test('resolveSuperEffect returns null for non-super action', () => {
  assert.equal(resolveSuperEffect({ kind: 'draw' }), null);
  assert.equal(resolveSuperEffect({}), null);
});

// ─── Rank Attribution ───────────────────────────────────────────────────────

test('classifyPlayForm identifies super plays', () => {
  assert.equal(classifyPlayForm({ authority: 'super' }), 'super');
  assert.equal(classifyPlayForm({ family: 'super' }), 'super');
});

test('classifyPlayForm identifies ultra plays', () => {
  assert.equal(classifyPlayForm({ authority: 'ultra' }), 'ultra');
  assert.equal(classifyPlayForm({ kind: 'Ultra' }), 'ultra');
});

test('classifyPlayForm identifies score and swap plays', () => {
  assert.equal(classifyPlayForm({ family: 'score' }), 'score');
  assert.equal(classifyPlayForm({ family: 'swap-bar' }), 'swap');
});

test('classifyPlayForm returns "other" for unknown forms', () => {
  assert.equal(classifyPlayForm({}), 'other');
  assert.equal(classifyPlayForm({ family: 'unknown' }), 'other');
});

test('attributeRankAction returns not-observable for no source cards', () => {
  const result = attributeRankAction({ sourceCards: [], playForm: 'base' });
  assert.equal(result.attributionStatus, 'not-observable');
  assert.equal(result.primaryRank, null);
  assert.equal(result.sourceRanks.length, 0);
});

test('attributeRankAction returns exact for single-rank source', () => {
  const result = attributeRankAction({
    sourceCards: [{ identity: 'A♠', rank: 'A' }],
    playForm: 'base',
  });
  assert.equal(result.attributionStatus, 'exact');
  assert.equal(result.primaryRank, 'A');
  assert.equal(result.rankWeights['A'], 1.0);
});

test('attributeRankAction returns fractional for cross-rank source', () => {
  const result = attributeRankAction({
    sourceCards: [
      { identity: 'K♠', rank: 'K' },
      { identity: 'Q♥', rank: 'Q' },
    ],
    playForm: 'royal-marriage',
  });
  assert.equal(result.attributionStatus, 'fractional');
  assert.ok(result.sourceRanks.includes('K'));
  assert.ok(result.sourceRanks.includes('Q'));
  // Weights should sum to 1.0
  const totalWeight = Object.values(result.rankWeights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(totalWeight - 1.0) < 0.001, 'weights must sum to 1.0');
});

test('attributeRankAction returns generated-origin for generated play form', () => {
  const result = attributeRankAction({
    sourceCards: [{ identity: '7♠', rank: '7' }],
    playForm: 'generated',
    originRank: '7',
    generatedRank: 'BJ',
  });
  assert.equal(result.attributionStatus, 'generated-origin');
  assert.equal(result.primaryRank, '7');
  assert.equal(result.generatedRank, 'BJ');
});

test('attributeRankAction returns not-observable for hidden identities', () => {
  const result = attributeRankAction({
    sourceCards: [{ identity: 'UNKNOWN' }],
    playForm: 'base',
  });
  assert.equal(result.attributionStatus, 'not-observable');
});

// ─── Policy Catalog ─────────────────────────────────────────────────────────

test('POLICY_CATALOG is a non-empty frozen array', () => {
  assert.ok(Array.isArray(POLICY_CATALOG));
  assert.ok(POLICY_CATALOG.length > 0, 'must have at least one policy');
  assert.ok(Object.isFrozen(POLICY_CATALOG));
});

test('POLICY_BY_ID maps every catalog entry by policyId', () => {
  for (const policy of POLICY_CATALOG) {
    assert.ok(policy.policyId, 'policy must have policyId');
    const lookup = POLICY_BY_ID[policy.policyId];
    assert.ok(lookup, `policy ${policy.policyId} must be in POLICY_BY_ID`);
    assert.equal(lookup, policy);
  }
});

test('POLICY_BY_ID is frozen', () => {
  assert.ok(Object.isFrozen(POLICY_BY_ID));
});
