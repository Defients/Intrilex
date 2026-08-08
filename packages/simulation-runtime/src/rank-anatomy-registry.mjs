// Canonical Rank Anatomy Registry — v0.16.0
//
// Generates a browser-safe, hash-linked artifact that exposes the internal
// anatomy of each Intrilex rank by separating:
//   1. Ordinary rank performance (baseline)
//   2. Mechanically distinct Spades-card performance
//   3. Each individual Super declaration
//   4. Each individual effect produced by a Super
//   5. Origin classification (natural/generated/copied/mimicked/replayed)
//
// This registry is derived from engine authority (RANK_REGISTRY, card-face
// data, and the variant registry). It does NOT duplicate game logic.

import { RANK_REGISTRY, CANONICAL_RANKS, ENGINE_VERSION, RULES_VERSION, canonicalRankAuthority } from '@intrilex/engine-adapter';
import {
  VARIANT_ELIGIBLE_RANKS,
  ALL_CORE_PROFILES,
  ADVANCED_CORE_PROFILE_ID,
  UNRESTRICTED_CORE_PROFILE_ID,
  VARIANT_REGISTRY_SCHEMA_VERSION,
  hasSpadeVariant,
  spadeVariantForRank,
  superEffectsForRank,
  entitiesForRank,
  allVariantEntities,
} from './variant-registry.mjs';

export const RANK_ANATOMY_SCHEMA_VERSION = '1.0.0';

// Origin kinds — every effect instance must identify its origin
export const ORIGIN_KINDS = Object.freeze(['natural', 'generated', 'copied', 'mimicked', 'replayed', 'transferred', 'unknown']);

// Attribution statuses
export const ATTRIBUTION_STATUS = Object.freeze({
  EXACT: 'exact',
  FRACTIONAL: 'fractional',
  GENERATED_ORIGIN: 'generated-origin',
  NOT_OBSERVABLE: 'not-observable',
});

// Evidence grades
export const EVIDENCE_GRADES = Object.freeze(['measured', 'provisional', 'weak', 'insufficient', 'not-observable', 'unsupported']);

// Descriptive classifications (never balance verdicts)
export const DESCRIPTIVE_CLASSIFICATIONS = Object.freeze([
  'investigate-high-impact',
  'policy-sensitive',
  'rare-high-potency',
  'frequent-low-impact',
  'variant-concentrated',
  'super-dependent',
  'insufficient-evidence',
]);

/**
 * Determine Spades variant eligibility for a rank using the precise
 * eligibility model that separates printed effects, play forms, and resolution.
 *
 * Properties:
 *   hasDistinctPrintedSpadesEffect — the card text for ♠ differs from ♣/♦/♥
 *   hasDistinctSpadesPlayForm       — the set of legal declarations differs
 *   hasDistinctSpadesResolution     — the resolution semantics differ
 *   spadesAnalyticsEligible         — independent Spades statistics answer a meaningful question
 *   eligibilityReasonCode           — stable machine-readable reason
 */
function spadesEligibilityRecord(rank) {
  const variant = spadeVariantForRank(rank);
  if (!variant) {
    return {
      eligible: false,
      hasDistinctPrintedSpadesEffect: false,
      hasDistinctSpadesPlayForm: false,
      hasDistinctSpadesResolution: false,
      spadesAnalyticsEligible: false,
      reasonCode: 'NO_DISTINCT_SPADES_BEHAVIOR',
      authorityRefs: ['RANK_REGISTRY', 'card-face-data'],
      note: `Rank ${rank} has no mechanically distinct Spades variant in canonical authority.`,
    };
  }

  // Rank 2 is a special case: the printed ability (Solo Wild Copy) is the same
  // for all suits, but 2♠ can TARGET spade-enhanced Base modes (3♠/4♠/6♠/7♠)
  // that 2♣/2♦/2♥ cannot target. The distinction is in the play form (targeting
  // scope), not in a printed effect.
  if (rank === '2') {
    return {
      eligible: true,
      hasDistinctPrintedSpadesEffect: false,
      hasDistinctSpadesPlayForm: true,
      hasDistinctSpadesResolution: true,
      spadesAnalyticsEligible: true,
      reasonCode: 'DISTINCT_SPADES_PLAY_FORM',
      authorityRefs: ['RANK_REGISTRY', 'card-face-data', 'variant-registry'],
      mode: variant.mode,
      displayName: variant.displayName,
      distinctFromNormal: variant.distinctFromNormal,
      note: variant.note ?? '2♠ Solo Wild Copy may target spade-enhanced Base modes (3♠/4♠/6♠/7♠) that 2♣/2♦/2♥ cannot copy. The printed ability is the same; the distinction is in targeting scope.',
    };
  }

  // All other eligible ranks have distinct printed Spades effects
  return {
    eligible: true,
    hasDistinctPrintedSpadesEffect: true,
    hasDistinctSpadesPlayForm: true,
    hasDistinctSpadesResolution: true,
    spadesAnalyticsEligible: true,
    reasonCode: 'DISTINCT_PRINTED_SPADES_EFFECT',
    authorityRefs: ['RANK_REGISTRY', 'card-face-data', 'variant-registry'],
    mode: variant.mode,
    displayName: variant.displayName,
    distinctFromNormal: variant.distinctFromNormal,
    note: variant.note ?? null,
  };
}

/**
 * Build the Super effect records for a rank.
 * Each Super declaration gets its own record with individual effect components.
 */
function superRecords(rank) {
  const effects = superEffectsForRank(rank);
  return effects.map(e => ({
    superId: `rank-${rank.toLowerCase()}-super-${e.effectId}`,
    effectId: e.effectId,
    displayName: e.displayName,
    mode: e.mode,
    kind: e.kind,
    altKinds: [...(e.altKinds ?? [])],
    actionModes: [...(e.actionModes ?? [])],
    profiles: [...e.profiles],
    authorityRefs: ['SUPER_EFFECTS', 'variant-registry', 'card-face-data'],
  }));
}

/**
 * Build the ordinary baseline record for a rank.
 * Excludes Spades-specific, Super, Ultra, generated, copied, mimicked, replayed.
 */
function ordinaryBaselineRecord(rank) {
  const def = RANK_REGISTRY[rank];
  if (!def) return null;
  // Ordinary effect IDs are derived from the rank's modes (excluding spade-specific)
  const ordinaryModes = (def.modes ?? []).filter(m => !m.startsWith('spade') && m !== 'solo-wild-copy');
  return {
    effectIds: ordinaryModes,
    eligibleCardIds: CANONICAL_RANKS.includes(rank)
      ? ['♣', '♦', '♥'].map(s => `${rank}${s}`).filter(id => rank !== 'RJ' && rank !== 'BJ')
      : [],
  };
}

/**
 * Build the Spades variant record for a rank.
 */
function spadesVariantRecord(rank) {
  const eligibility = spadesEligibilityRecord(rank);
  if (!eligibility.eligible) {
    return {
      eligible: false,
      hasDistinctPrintedSpadesEffect: false,
      hasDistinctSpadesPlayForm: false,
      hasDistinctSpadesResolution: false,
      spadesAnalyticsEligible: false,
      cardId: rank === 'RJ' || rank === 'BJ' ? null : `${rank}♠`,
      effectIds: [],
      ineligibilityReason: eligibility.reasonCode,
      ineligibilityNote: eligibility.note,
    };
  }
  const variant = spadeVariantForRank(rank);
  return {
    eligible: true,
    hasDistinctPrintedSpadesEffect: eligibility.hasDistinctPrintedSpadesEffect,
    hasDistinctSpadesPlayForm: eligibility.hasDistinctSpadesPlayForm,
    hasDistinctSpadesResolution: eligibility.hasDistinctSpadesResolution,
    spadesAnalyticsEligible: eligibility.spadesAnalyticsEligible,
    cardId: `${rank}♠`,
    mode: variant.mode,
    displayName: variant.displayName,
    effectIds: [variant.mode],
    ineligibilityReason: null,
    eligibilityReasonCode: eligibility.reasonCode,
    note: variant.note ?? null,
  };
}

/**
 * Build the full canonical Rank Anatomy registry artifact.
 * @param {function} [hashFn] - canonical hash function (hashCanonical from @intrilex/shared)
 * @returns {object} the canonical rank anatomy registry
 */
export function canonicalRankAnatomyRegistry(hashFn = null) {
  const rankAuthority = canonicalRankAuthority();
  const ranks = CANONICAL_RANKS.map(rank => {
    const def = RANK_REGISTRY[rank] ?? {};
    const ordinary = ordinaryBaselineRecord(rank);
    const spades = spadesVariantRecord(rank);
    const supers = superRecords(rank);

    return {
      rankId: rank,
      displayName: def.rank ?? rank,
      authority: {
        pointRowValue: def.prPoints ?? null,
        scuttleOrder: def.scuttleOrder ?? null,
        prScuttleImmune: def.prScuttleImmune ?? false,
        prEffectTargetImmune: def.prEffectTargetImmune ?? false,
        supportedModes: [...(def.modes ?? [])],
        canonicalRestrictions: [...(def.notes ?? [])],
        authorityVersion: ENGINE_VERSION,
        rulesVersion: RULES_VERSION,
        authorityHash: rankAuthority.authorityHash,
      },
      ordinaryBaseline: ordinary,
      spadesVariant: spades,
      supers,
      superEffectCount: supers.length,
      spadesEligible: spades.eligible,
    };
  });

  // Build the core artifact (without hash)
  const core = {
    schemaVersion: RANK_ANATOMY_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    variantRegistrySchemaVersion: VARIANT_REGISTRY_SCHEMA_VERSION,
    profileIds: [...ALL_CORE_PROFILES],
    rankCount: ranks.length,
    spadesVariantCount: ranks.filter(r => r.spadesEligible).length,
    superEffectCount: ranks.reduce((s, r) => s + r.superEffectCount, 0),
    originKinds: [...ORIGIN_KINDS],
    attributionStatuses: [...Object.values(ATTRIBUTION_STATUS)],
    evidenceGrades: [...EVIDENCE_GRADES],
    descriptiveClassifications: [...DESCRIPTIVE_CLASSIFICATIONS],
    rankAuthorityHash: rankAuthority.authorityHash,
    ranks,
  };

  // Compute the registry hash
  core.registryHash = hashFn ? hashFn(core) : null;

  return core;
}

/**
 * Build a compact eligibility summary for the Evidence workspace.
 * @returns {Array<object>} per-rank eligibility records
 */
export function rankEligibilitySummary() {
  return CANONICAL_RANKS.map(rank => {
    const eligibility = spadesEligibilityRecord(rank);
    const supers = superEffectsForRank(rank);
    return {
      rankId: rank,
      spadesVariantEligible: eligibility.eligible,
      hasDistinctPrintedSpadesEffect: eligibility.hasDistinctPrintedSpadesEffect ?? false,
      hasDistinctSpadesPlayForm: eligibility.hasDistinctSpadesPlayForm ?? false,
      hasDistinctSpadesResolution: eligibility.hasDistinctSpadesResolution ?? false,
      spadesAnalyticsEligible: eligibility.spadesAnalyticsEligible ?? false,
      spadesReasonCode: eligibility.reasonCode,
      spadesNote: eligibility.note ?? null,
      superEffectIds: supers.map(s => s.effectId),
      superEffectCount: supers.length,
    };
  });
}

/**
 * Get the Rank 2 eligibility record specifically.
 * Per the directive, this must be discovered from canonical authority and
 * must separate printed effect, play form, and resolution semantics.
 */
export function rank2EligibilityRecord(hashFn = null) {
  const eligibility = spadesEligibilityRecord('2');
  const record = {
    rankId: '2',
    spadesVariantEligible: eligibility.eligible,
    hasDistinctPrintedSpadesEffect: eligibility.hasDistinctPrintedSpadesEffect,
    hasDistinctSpadesPlayForm: eligibility.hasDistinctSpadesPlayForm,
    hasDistinctSpadesResolution: eligibility.hasDistinctSpadesResolution,
    spadesAnalyticsEligible: eligibility.spadesAnalyticsEligible,
    reasonCode: eligibility.reasonCode,
    authorityRefs: eligibility.authorityRefs,
    mode: eligibility.mode ?? null,
    displayName: eligibility.displayName ?? null,
    note: eligibility.note ?? null,
    distinctFromNormal: eligibility.distinctFromNormal ?? false,
  };
  if (hashFn) record.authorityHash = hashFn(record);
  return record;
}

// Re-export key functions for convenience
export {
  hasSpadeVariant,
  spadeVariantForRank,
  superEffectsForRank,
  entitiesForRank,
  allVariantEntities,
  VARIANT_ELIGIBLE_RANKS,
  ALL_CORE_PROFILES,
  ADVANCED_CORE_PROFILE_ID,
  UNRESTRICTED_CORE_PROFILE_ID,
};
