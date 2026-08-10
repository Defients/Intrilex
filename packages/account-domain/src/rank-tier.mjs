// ═══════════════════════════════════════════════════════════════
// rank-tier.mjs — Pure competitive rank domain (tier + division).
//
// Maps an Intrilex Rating (Elo-based, see rating.mjs) to a canonical
// Ranked tier and division. This module is PURE: no I/O, no side
// effects, no image paths, no UI. Presentation lives in the browser
// presentation registry (apps/lab-web/src/play/rank/rank-presentation.mjs).
//
// Canonical ladder (lowest → highest):
//   UNRANKED → INITIATE → CIPHER → WARDEN → VANGUARD →
//   ASCENDANT → PARAGON → SOVEREIGN → INTRILEX
//
// Division structure (visible standard):
//   III → II → I   (I is the top division within a tier)
//
// INTRILEX is the apex tier and has NO standard division — at apex it
// supports leaderboard rank presentation (e.g. "INTRILEX #47").
//
// Rating thresholds (Intrilex Rating):
//   UNRANKED   — placement period (ratedMatches < PLACEMENTS_REQUIRED)
//   INITIATE   — [0, 1200)
//   CIPHER     — [1200, 1400)
//   WARDEN     — [1400, 1600)
//   VANGUARD   — [1600, 1800)
//   ASCENDANT  — [1800, 2000)
//   PARAGON    — [2000, 2200)
//   SOVEREIGN  — [2200, 2400)
//   INTRILEX   — [2400, ∞)   (apex, no division)
//
// Each non-apex tier spans 200 rating points split into three divisions
// of ~67 points: III (lowest), II (middle), I (highest).
// ═══════════════════════════════════════════════════════════════

/**
 * Number of rated matches a player must complete before they exit the
 * UNRANKED placement period and receive a tier.
 */
export const PLACEMENTS_REQUIRED = 5;

/**
 * @readonly
 * @enum {string} Canonical Ranked tier identifiers.
 */
export const RankTier = Object.freeze({
  UNRANKED: 'UNRANKED',
  INITIATE: 'INITIATE',
  CIPHER: 'CIPHER',
  WARDEN: 'WARDEN',
  VANGUARD: 'VANGUARD',
  ASCENDANT: 'ASCENDANT',
  PARAGON: 'PARAGON',
  SOVEREIGN: 'SOVEREIGN',
  INTRILEX: 'INTRILEX',
});

/**
 * @readonly
 * @enum {string} Canonical division identifiers within a tier.
 */
export const Division = Object.freeze({
  III: 'III',
  II: 'II',
  I: 'I',
  NONE: 'NONE', // INTRILEX (apex) and UNRANKED have no division
});

/**
 * Ordered ladder of EARNED tiers (excludes UNRANKED). Index 0 = lowest.
 * This is the single source of truth for tier ordering — runtime code
 * must never derive order from filenames or glyph paths.
 * @type {ReadonlyArray<string>}
 */
export const RANK_LADDER = Object.freeze([
  RankTier.INITIATE,
  RankTier.CIPHER,
  RankTier.WARDEN,
  RankTier.VANGUARD,
  RankTier.ASCENDANT,
  RankTier.PARAGON,
  RankTier.SOVEREIGN,
  RankTier.INTRILEX,
]);

/**
 * Rating thresholds for each earned tier. Each entry is [minInclusive, maxExclusive).
 * INTRILEX has maxExclusive = Infinity (apex).
 * @type {Record<string, [number, number]>}
 */
const TIER_THRESHOLDS = Object.freeze({
  [RankTier.INITIATE]: [0, 1200],
  [RankTier.CIPHER]: [1200, 1400],
  [RankTier.WARDEN]: [1400, 1600],
  [RankTier.VANGUARD]: [1600, 1800],
  [RankTier.ASCENDANT]: [1800, 2000],
  [RankTier.PARAGON]: [2000, 2200],
  [RankTier.SOVEREIGN]: [2200, 2400],
  [RankTier.INTRILEX]: [2400, Infinity],
});

/**
 * Ordered divisions within a tier (lowest → highest). Index 0 = lowest.
 * @type {ReadonlyArray<string>}
 */
export const DIVISION_LADDER = Object.freeze([Division.III, Division.II, Division.I]);

const TIER_SPAN = 200;
const DIVISION_SPAN = TIER_SPAN / 3; // ~66.67

/**
 * @typedef {Object} RankPlacement
 * @property {boolean} isPlacement - True while in the UNRANKED placement period.
 * @property {number} placementsPlayed - Rated matches played so far (capped at required).
 * @property {number} placementsRequired - Matches needed to exit placement.
 */

/**
 * @typedef {Object} RankAssignment
 * @property {string} tier - One of RankTier.
 * @property {string} division - One of Division (NONE for UNRANKED/INTRILEX).
 * @property {boolean} isPlacement - True while in the UNRANKED placement period.
 * @property {number} placementsPlayed - Rated matches played (capped at required).
 * @property {number} placementsRequired - Matches needed to exit placement.
 * @property {number} tierOrdinal - Position in ladder (UNRANKED=-1, INITIATE=0, …, INTRILEX=7).
 * @property {number} divisionOrdinal - Division position (III=0, II=1, I=2; NONE=-1).
 * @property {boolean} isApex - True for INTRILEX.
 */

/**
 * Resolve the ladder ordinal (0-based) of an earned tier.
 * UNRANKED returns -1.
 * @param {string} tier
 * @returns {number}
 */
export function tierOrdinal(tier) {
  if (tier === RankTier.UNRANKED) return -1;
  const idx = RANK_LADDER.indexOf(tier);
  return idx; // -1 if unknown
}

/**
 * Resolve the division ordinal (0-based, lowest→highest) of a division.
 * III=0, II=1, I=2. NONE (and unknown) returns -1.
 * @param {string} division
 * @returns {number}
 */
export function divisionOrdinal(division) {
  if (division === Division.NONE) return -1;
  return DIVISION_LADDER.indexOf(division);
}

/**
 * Whether a tier is the apex tier (INTRILEX). Apex tiers have no division.
 * @param {string} tier
 * @returns {boolean}
 */
export function isApexTier(tier) {
  return tier === RankTier.INTRILEX;
}

/**
 * Whether a tier supports standard III/II/I divisions.
 * UNRANKED and INTRILEX do not.
 * @param {string} tier
 * @returns {boolean}
 */
export function tierHasDivisions(tier) {
  return tier !== RankTier.UNRANKED && tier !== RankTier.INTRILEX;
}

/**
 * Resolve the division for a rating within a non-apex tier span.
 * @param {number} rating
 * @param {number} tierMin - Inclusive lower bound of the tier.
 * @returns {string} One of Division.III / II / I
 */
function divisionForRating(rating, tierMin) {
  const offset = rating - tierMin;
  if (offset < DIVISION_SPAN) return Division.III;
  if (offset < DIVISION_SPAN * 2) return Division.II;
  return Division.I;
}

/**
 * Map an Intrilex Rating + match count to a canonical tier/division assignment.
 *
 * Placement period: while `ratedMatches` < PLACEMENTS_REQUIRED the player is
 * UNRANKED (no earned tier, no division). After placement, the rating maps to
 * the canonical tier ladder. INTRILEX (apex) receives Division.NONE.
 *
 * @param {number} rating - Intrilex Rating (clamped to >= 0).
 * @param {Object} [opts]
 * @param {number} [opts.ratedMatches=0] - Rated matches played.
 * @returns {RankAssignment}
 */
export function ratingToTierDivision(rating, opts = {}) {
  const ratedMatches = Math.max(0, Math.floor(opts.ratedMatches ?? 0));
  const placementsPlayed = Math.min(ratedMatches, PLACEMENTS_REQUIRED);
  const isPlacement = ratedMatches < PLACEMENTS_REQUIRED;

  if (isPlacement) {
    return {
      tier: RankTier.UNRANKED,
      division: Division.NONE,
      isPlacement: true,
      placementsPlayed,
      placementsRequired: PLACEMENTS_REQUIRED,
      tierOrdinal: -1,
      divisionOrdinal: -1,
      isApex: false,
    };
  }

  const r = Math.max(0, Math.round(rating));
  let tier = RankTier.INITIATE;
  for (const t of RANK_LADDER) {
    const [min, max] = TIER_THRESHOLDS[t];
    if (r >= min && r < max) { tier = t; break; }
  }
  const apex = isApexTier(tier);
  const division = apex ? Division.NONE : divisionForRating(r, TIER_THRESHOLDS[tier][0]);
  return {
    tier,
    division,
    isPlacement: false,
    placementsPlayed,
    placementsRequired: PLACEMENTS_REQUIRED,
    tierOrdinal: tierOrdinal(tier),
    divisionOrdinal: divisionOrdinal(division),
    isApex: apex,
  };
}

/**
 * Compare two rank assignments by competitive standing (tier first, then
 * division). Higher standing → higher number.
 * @param {RankAssignment} a
 * @param {RankAssignment} b
 * @returns {number} negative if a < b, positive if a > b, 0 if equal
 */
export function compareRank(a, b) {
  if (a.tierOrdinal !== b.tierOrdinal) return a.tierOrdinal - b.tierOrdinal;
  return a.divisionOrdinal - b.divisionOrdinal;
}
