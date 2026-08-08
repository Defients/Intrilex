// Canonical Variant & Super-Effect Registry — v0.14.0
//
// Single source of truth for the analytical entities that the rank analytics
// system tracks *independently* of the rank-wide aggregate.
//
// For each eligible rank the registry enumerates:
//   1. The Spades (♠) variant — tracked separately from Hearts/Diamonds/Clubs.
//   2. Each individual Super (⭐) effect — tracked separately from the normal
//      version of the rank, from other Super effects on the same rank, and
//      from the rank's combined aggregate.
//
// Analytical entity keys (the "variantKey" used throughout the pipeline):
//   "<rank>"              — rank overall (existing rank-wide aggregate)
//   "<rank>:normal"       — normal suit variants (♣/♦/♥) combined
//   "<rank>:spade"        — Spades variant
//   "<rank>:super:<id>"   — a single named Super effect
//   "<rank>:super:all"    — combined contribution of all Super effects on the rank
//
// Every Spades variant and Super effect is also tagged with the rules-authority
// profiles in which it is available, so that results can be segmented by
// Advanced Core vs Unrestricted Core.
//
// Rank 2 Spades is NOT excluded: against the canonical card registry, 2♠ has
// mechanically distinct behavior — its Solo Wild Copy may target the
// suit-specific enhanced Base modes of 3♠/4♠/6♠/7♠ that 2♣/2♦/2♥ cannot copy.

import { CANONICAL_RANKS } from '@intrilex/engine-adapter';

export const VARIANT_REGISTRY_SCHEMA_VERSION = '1.0.0';

// Rules-authority profile identifiers (mirror engine core-advanced.js)
export const ADVANCED_CORE_PROFILE_ID = 'core-advanced-authority';
export const UNRESTRICTED_CORE_PROFILE_ID = 'core-unrestricted-authority';
export const ALL_CORE_PROFILES = Object.freeze([ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID]);

// Entity tiers — the comparison levels exposed by the analytics UI.
export const ENTITY_TIER = Object.freeze({
  RANK: 'rank',           // rank overall
  NORMAL: 'normal',        // ♣/♦/♥ combined
  SPADE: 'spade',          // ♠ variant
  SUIT: 'suit',            // individual suit (per-suit 10s: 10♣/10♦/10♥/10♠)
  SUPER: 'super',          // a single ⭐ effect
  SUPER_AGGREGATE: 'super-aggregate' // all ⭐ effects on the rank combined
});

// ─── Spades variant definitions ─────────────────────────────────────────────
// Derived from the canonical card registry (RANK_REGISTRY modes + card-face
// data). Every rank A–K has a mechanically distinct Spades variant.
const SPADE_VARIANTS = Object.freeze({
  A:  { mode: 'spade-exile-counter',  displayName: 'A♠ Exile Counter',   distinctFromNormal: true },
  '2': { mode: 'solo-wild-copy',      displayName: '2♠ Enhanced Wild Copy', distinctFromNormal: true,
         note: '2♠ Solo Wild Copy may target spade-enhanced Base modes (3♠/4♠/6♠/7♠) that 2♣/2♦/2♥ cannot copy.' },
  '3': { mode: 'spade-enhancement',   displayName: '3♠ Enhancement',    distinctFromNormal: true },
  '4': { mode: 'total-clear',         displayName: '4♠ Total Clear',    distinctFromNormal: true },
  '5': { mode: 'suit-rummage',        displayName: '5♠ Any-Exile Rummage', distinctFromNormal: true,
         note: '5♠ rummage may access any Exile card; other suits have position-restricted access.' },
  '6': { mode: 'deep-draw',           displayName: '6♠ Deep Draw',      distinctFromNormal: true },
  '7': { mode: 'spade-topdeck',       displayName: '7♠ Topdeck',        distinctFromNormal: true },
  '8': { mode: 'free-scuttle',        displayName: '8♠ Free Scuttle',   distinctFromNormal: true },
  '9': { mode: 'spade-goal-shift',    displayName: '9♠ Goal Shift',     distinctFromNormal: true },
  '10': { mode: 'spade-stack-theft',  displayName: '10♠ Stack Theft / Exile Recovery', distinctFromNormal: true },
  J:  { mode: 'jack-er',             displayName: 'J♠ ER Attachment',  distinctFromNormal: true },
  Q:  { mode: 'spade-protection',     displayName: 'Q♠ Special Protection', distinctFromNormal: true },
  K:  { mode: 'spade-multi-counter',  displayName: 'K♠ Multi-Counter / Wild Sovereignty',  distinctFromNormal: true }
});

// ─── Per-suit Ten variant definitions ────────────────────────────────────────
// Rank 10 has four mechanically distinct effects by suit, each tracked as a
// separate analytical entity instead of being collapsed into 10:normal/10:spade.
//   10♣ — club-foundation (scoring with Aegis + bonus trigger)
//   10♦ — diamond-mimic   (copies another effect)
//   10♥ — heart-tempo     (+2 Mini-Turns)
//   10♠ — spade-stack-theft (steals a pending effect / Exile recovery)
const PER_SUIT_TEN_VARIANTS = Object.freeze({
  '♣': { variantKey: '10:club',   mode: 'club-foundation',   displayName: '10♣ Foundation' },
  '♦': { variantKey: '10:diamond', mode: 'diamond-mimic',     displayName: '10♦ Mimic' },
  '♥': { variantKey: '10:heart',  mode: 'heart-tempo',        displayName: '10♥ Tempo Spike' },
  '♠': { variantKey: '10:spade',  mode: 'spade-stack-theft',  displayName: '10♠ Stack Theft / Exile Recovery' }
});

/**
 * Canonical ordered list of per-suit Ten variant keys.
 * @returns {Array<string>}
 */
export function perSuitTenKeys() {
  return ['10:club', '10:diamond', '10:heart', '10:spade'];
}

/**
 * Whether a rank is the per-suit-expanded Ten rank.
 * @param {string} rank
 * @returns {boolean}
 */
export function isPerSuitTenRank(rank) {
  return rank === '10';
}

/**
 * Resolve the per-suit Ten variant descriptor for a given suit symbol.
 * @param {string} suit — '♣' | '♦' | '♥' | '♠'
 * @returns {object|null}
 */
export function perSuitTenForSuit(suit) {
  return PER_SUIT_TEN_VARIANTS[suit] ?? null;
}

// ─── Super effect definitions ───────────────────────────────────────────────
// Each entry maps the engine action `kind` / `mode` to a canonical super-effect
// identifier, and records the authority profiles in which it is available.
// ⭐9 is undefined in the canonical registry and is therefore absent.
// RJ and BJ have no Super effects.
const SUPER_EFFECTS = Object.freeze({
  A: [
    { effectId: 'super-ace', displayName: '⭐A Super Counter', mode: 'super-counter', kind: 'core-declare-super-ace-counter',
      altKinds: ['advanced-super-ace'], actionModes: ['super-ace'],
      profiles: [ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '2': [
    { effectId: 'super-two', displayName: '⭐2 Commandeer', mode: 'commandeer', kind: 'advanced-super-two',
      actionModes: ['two-score', 'two-hold'],
      profiles: [ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '3': [
    { effectId: 'super-three-raid', displayName: '⭐3 Super Raid', mode: 'super-raid', kind: 'advanced-super-three-raid',
      actionModes: ['three-raid'],
      profiles: [UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '4': [
    { effectId: 'super-four-exchange', displayName: '⭐4 Row Exchange', mode: 'row-exchange', kind: 'advanced-super-four-exchange',
      actionModes: ['four-exchange-pr', 'four-exchange-er'],
      profiles: [ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '5': [
    { effectId: 'super-five-recycle', displayName: '⭐5 Super Recycle', mode: 'super-recycle', kind: 'advanced-super-five-recycle',
      actionModes: ['five-recycle'],
      profiles: [UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '6': [
    { effectId: 'super-six-dig', displayName: '⭐6 Super Dig', mode: 'super-dig', kind: 'advanced-super-six-dig',
      actionModes: ['six-dig'],
      profiles: [UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '7': [
    { effectId: 'super-seven-topdeck', displayName: '⭐7 Sequential Topdeck', mode: 'sequential-topdeck', kind: 'advanced-super-seven-topdeck',
      actionModes: ['seven-topdeck'],
      profiles: [UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  '8': [
    { effectId: 'super-eight-scuttle', displayName: '⭐8 Absolute Scuttle', mode: 'absolute-scuttle', kind: 'advanced-super-eight-scuttle',
      actionModes: ['eight-absolute-scuttle'],
      profiles: [ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID] }
  ],
  J: [
    { effectId: 'super-jack-tempo', displayName: '⭐J Tempo Force', mode: 'tempo-force', kind: 'advanced-super-j-tempo',
      actionModes: ['jack-tempo'],
      profiles: [ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID] }
  ]
});

// Ranks eligible for variant-level tracking (A–K; Jokers have no suit variants)
export const VARIANT_ELIGIBLE_RANKS = Object.freeze(
  CANONICAL_RANKS.filter(r => r !== 'RJ' && r !== 'BJ')
);

/**
 * Build the canonical list of all analytical entities for a rank.
 * @param {string} rank
 * @returns {Array<object>} entity descriptors
 */
export function entitiesForRank(rank) {
  const out = [];
  out.push({ variantKey: rank, rank, tier: ENTITY_TIER.RANK, displayName: `Rank ${rank} (overall)` });
  // Rank 10 has four mechanically distinct per-suit effects — track each suit
  // as its own analytical entity instead of collapsing into normal/spade.
  if (isPerSuitTenRank(rank)) {
    for (const suit of ['♣', '♦', '♥', '♠']) {
      const v = PER_SUIT_TEN_VARIANTS[suit];
      out.push({ variantKey: v.variantKey, rank, tier: ENTITY_TIER.SUIT, suit, displayName: v.displayName });
    }
  } else if (SPADE_VARIANTS[rank]) {
    out.push({ variantKey: `${rank}:normal`, rank, tier: ENTITY_TIER.NORMAL, displayName: `Rank ${rank} Normal (♣/♦/♥)` });
    out.push({ variantKey: `${rank}:spade`, rank, tier: ENTITY_TIER.SPADE, displayName: SPADE_VARIANTS[rank].displayName });
  }
  const supers = SUPER_EFFECTS[rank] ?? [];
  for (const s of supers) {
    out.push({ variantKey: `${rank}:super:${s.effectId}`, rank, tier: ENTITY_TIER.SUPER, superEffectId: s.effectId, displayName: s.displayName, profiles: [...s.profiles] });
  }
  if (supers.length > 0) {
    out.push({ variantKey: `${rank}:super:all`, rank, tier: ENTITY_TIER.SUPER_AGGREGATE, displayName: `Rank ${rank} All Supers (combined)` });
  }
  return out;
}

/**
 * Build the full canonical list of all analytical entities across all ranks.
 * @returns {Array<object>}
 */
export function allVariantEntities() {
  const out = [];
  for (const rank of CANONICAL_RANKS) {
    out.push(...entitiesForRank(rank));
  }
  return out;
}

/**
 * All variant entity keys (used to initialize counters).
 * @returns {Array<string>}
 */
export function allVariantKeys() {
  return allVariantEntities().map(e => e.variantKey);
}

/**
 * Lookup a Super effect by engine action kind or mode.
 * @param {object} action
 * @returns {object|null} super effect descriptor or null
 */
export function resolveSuperEffect(action) {
  const kind = action?.kind ?? action?.advanced?.kind ?? '';
  const mode = action?.mode ?? action?.authority ?? '';
  const actionModes = action?.actionModes ?? [];
  for (const rank of Object.keys(SUPER_EFFECTS)) {
    for (const s of SUPER_EFFECTS[rank]) {
      const kinds = [s.kind, ...(s.altKinds ?? [])];
      const modes = [s.mode, ...(s.actionModes ?? [])];
      if (kinds.includes(kind) || modes.includes(mode) || mode === s.effectId || actionModes.some(am => modes.includes(am))) {
        return { rank, ...s };
      }
    }
  }
  // Fallback: family === 'super' with a mode that contains a known effect fragment
  if ((action?.family ?? '') === 'super' && mode) {
    for (const rank of Object.keys(SUPER_EFFECTS)) {
      for (const s of SUPER_EFFECTS[rank]) {
        const modes = [s.mode, ...(s.actionModes ?? [])];
        if (mode.includes(s.effectId) || modes.some(m => mode.includes(m))) return { rank, ...s };
      }
    }
  }
  return null;
}

/**
 * Determine whether a Spades variant exists for a rank (mechanically distinct).
 * @param {string} rank
 * @returns {boolean}
 */
export function hasSpadeVariant(rank) {
  return Boolean(SPADE_VARIANTS[rank]);
}

/**
 * Get the Spades variant descriptor for a rank.
 * @param {string} rank
 * @returns {object|null}
 */
export function spadeVariantForRank(rank) {
  return SPADE_VARIANTS[rank] ?? null;
}

/**
 * Get all Super effects for a rank.
 * @param {string} rank
 * @returns {Array<object>}
 */
export function superEffectsForRank(rank) {
  return SUPER_EFFECTS[rank] ? SUPER_EFFECTS[rank].map(s => ({ rank, ...s })) : [];
}

/**
 * Get all Super effects available under a given authority profile.
 * @param {string} profileId
 * @returns {Array<object>}
 */
export function superEffectsForProfile(profileId) {
  const out = [];
  for (const rank of Object.keys(SUPER_EFFECTS)) {
    for (const s of SUPER_EFFECTS[rank]) {
      if (s.profiles.includes(profileId)) out.push({ rank, ...s });
    }
  }
  return out;
}

/**
 * Check whether a Super effect is available under a given authority profile.
 * @param {string} effectId
 * @param {string} profileId
 * @returns {boolean}
 */
export function isSuperEffectAvailable(effectId, profileId) {
  for (const rank of Object.keys(SUPER_EFFECTS)) {
    for (const s of SUPER_EFFECTS[rank]) {
      if (s.effectId === effectId) return s.profiles.includes(profileId);
    }
  }
  return false;
}

/**
 * Build a compact, serializable registry artifact (for the browser bundle /
 * evidence workspace). Includes a canonical hash of the entity list.
 * @param {function} [hashFn] - canonical hash function (hashCanonical)
 * @returns {object}
 */
export function canonicalVariantRegistry(hashFn = null) {
  const entities = allVariantEntities().map(e => ({
    variantKey: e.variantKey,
    rank: e.rank,
    tier: e.tier,
    suit: e.suit ?? null,
    superEffectId: e.superEffectId ?? null,
    displayName: e.displayName,
    profiles: e.profiles ?? [...ALL_CORE_PROFILES]
  }));
  return {
    schemaVersion: VARIANT_REGISTRY_SCHEMA_VERSION,
    profileIds: [...ALL_CORE_PROFILES],
    variantEligibleRanks: [...VARIANT_ELIGIBLE_RANKS],
    spadeVariantRanks: Object.keys(SPADE_VARIANTS).sort((a, b) => rankSort(a) - rankSort(b)),
    superEffectRanks: Object.keys(SUPER_EFFECTS).sort((a, b) => rankSort(a) - rankSort(b)),
    entities,
    entityCount: entities.length,
    authorityHash: hashFn ? hashFn(entities) : null
  };
}

function rankSort(a) {
  const order = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','RJ','BJ'];
  return order.indexOf(a);
}
