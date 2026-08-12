// ═══════════════════════════════════════════════════════════════
// rank-presentation.mjs — Canonical Ranked presentation registry.
//
// SINGLE SOURCE OF TRUTH for tier → { label, glyph, visual treatment }.
// UI components MUST NOT define their own tier→image mappings. They call
// renderRankGlyph() (rank-glyph.js) or rankLabel()/resolveGlyphPath() here.
//
// Rank DOMAIN (tier/division/rating math) lives in
// @intrilex/account-domain/rank-tier — this module never re-derives tier
// from rating. It only maps a tier key to its presentation.
//
// Glyph assets:
//   masters:      <root>/ranked-glyphs/<tier>.png   (1024 RGBA, canonical)
//   derivatives:  /assets/ranked/glyphs/{256,128,64}/<tier>.png  (alpha PNG)
// The 256 derivative is the default production asset. Size-specific paths
// are resolved by resolveGlyphPath() so there is ONE filename mapping.
// ═══════════════════════════════════════════════════════════════

import { RankTier, Division, isApexTier, tierHasDivisions } from "../../account-domain/rank-tier.mjs";

/**
 * Base URL for ranked glyph derivatives (served from /assets/ranked/glyphs).
 */
export const RANKED_GLYPH_BASE = '/assets/ranked/glyphs';

/**
 * Default production size (root of glyph dir). 128 and 64 are size variants.
 */
export const RANKED_GLYPH_DEFAULT_SIZE = 256;

/**
 * Available derivative sizes, ordered ascending. Used by resolveGlyphPath.
 * @readonly
 * @type {ReadonlyArray<number>}
 */
export const RANKED_GLYPH_SIZES = Object.freeze([64, 128, 256]);

/**
 * @typedef {Object} TierPresentation
 * @property {string} label - Display label ("Vanguard").
 * @property {string|null} glyphFile - Canonical filename ("vanguard.png") or null for UNRANKED.
 * @property {string} glowClass - CSS class for tier-aware halo ("tier-vanguard").
 * @property {string} meaning - Ladder semantics (for docs/tooltips).
 */

/**
 * Canonical tier → presentation mapping. Exactly 8 earned tiers + UNRANKED.
 * The upper ladder (PARAGON / SOVEREIGN / INTRILEX) must NEVER be swapped.
 * @type {Record<string, TierPresentation>}
 */
export const RANK_TIER_PRESENTATION = Object.freeze({
  [RankTier.UNRANKED]: {
    label: 'Unranked',
    glyphFile: null,
    glowClass: 'tier-unranked',
    meaning: 'Placement period — no earned tier yet',
  },
  [RankTier.INITIATE]: {
    label: 'Initiate',
    glyphFile: 'initiate.png',
    glowClass: 'tier-initiate',
    meaning: 'fragment',
  },
  [RankTier.CIPHER]: {
    label: 'Cipher',
    glyphFile: 'cipher.png',
    glowClass: 'tier-cipher',
    meaning: 'pattern',
  },
  [RankTier.WARDEN]: {
    label: 'Warden',
    glyphFile: 'warden.png',
    glowClass: 'tier-warden',
    meaning: 'structure / shield',
  },
  [RankTier.VANGUARD]: {
    label: 'Vanguard',
    glyphFile: 'vanguard.png',
    glowClass: 'tier-vanguard',
    meaning: 'weapon / forward motion',
  },
  [RankTier.ASCENDANT]: {
    label: 'Ascendant',
    glyphFile: 'ascendant.png',
    glowClass: 'tier-ascendant',
    meaning: 'expansion / ascent',
  },
  [RankTier.PARAGON]: {
    label: 'Paragon',
    glyphFile: 'paragon.png',
    glowClass: 'tier-paragon',
    meaning: 'royal perfection',
  },
  [RankTier.SOVEREIGN]: {
    label: 'Sovereign',
    glyphFile: 'sovereign.png',
    glowClass: 'tier-sovereign',
    meaning: 'supremacy / throne',
  },
  [RankTier.INTRILEX]: {
    label: 'Intrilex',
    glyphFile: 'intrilex.png',
    glowClass: 'tier-intrilex',
    meaning: 'completed transcendent glyph',
  },
});

/**
 * Resolve a size-appropriate glyph URL for a tier.
 * Picks the smallest derivative >= the requested size, falling back to the
 * largest available. Returns null for UNRANKED (no earned glyph).
 * @param {string} tier - One of RankTier.
 * @param {number} [size=256] - Requested pixel size.
 * @returns {string|null} Absolute URL path, or null if the tier has no glyph.
 */
export function resolveGlyphPath(tier, size = RANKED_GLYPH_DEFAULT_SIZE) {
  const pres = RANK_TIER_PRESENTATION[tier];
  if (!pres || !pres.glyphFile) return null;
  // Pick the smallest derivative that is >= requested size; if none, use largest.
  let chosen = RANKED_GLYPH_SIZES[RANKED_GLYPH_SIZES.length - 1];
  for (const s of RANKED_GLYPH_SIZES) {
    if (s >= size) { chosen = s; break; }
  }
  return `${RANKED_GLYPH_BASE}/${chosen}/${pres.glyphFile}`;
}

/**
 * Build the canonical human-readable rank label.
 *   "Vanguard II"  /  "Intrilex"  /  "Unranked"  /  "Vanguard"
 * Apex (INTRILEX) and UNRANKED never show a division. When `division` is
 * omitted or NONE, only the tier label is returned.
 * @param {string} tier
 * @param {string} [division] - One of Division.
 * @returns {string}
 */
export function rankLabel(tier, division) {
  const pres = RANK_TIER_PRESENTATION[tier];
  if (!pres) return 'Unknown';
  if (!tierHasDivisions(tier) || !division || division === Division.NONE) {
    return pres.label;
  }
  return `${pres.label} ${division}`;
}

/**
 * Resolve the presentation record for a tier (defensive copy).
 * @param {string} tier
 * @returns {TierPresentation|null}
 */
export function presentationFor(tier) {
  const pres = RANK_TIER_PRESENTATION[tier];
  return pres ? { ...pres } : null;
}

/**
 * Whether a tier has a canonical glyph (i.e. is an earned tier, not UNRANKED).
 * @param {string} tier
 * @returns {boolean}
 */
export function hasGlyph(tier) {
  return RANK_TIER_PRESENTATION[tier]?.glyphFile != null;
}

// Re-export apex helper for UI convenience so components import from one place.
export { isApexTier };
