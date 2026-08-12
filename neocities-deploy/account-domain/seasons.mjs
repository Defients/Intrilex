// ═══════════════════════════════════════════════════════════════
// seasons.mjs — Ranked season domain (pure)
//
// First-class season infrastructure. Seasons are database/config driven,
// never computed from browser clocks. Exactly one season is ACTIVE for a
// given Ranked queue at any time.
//
// Season lifecycle:
//   UPCOMING → ACTIVE → FINALIZING → ARCHIVED
//
// Season transitions do NOT hard-reset ratings. The canonical Glicko-2
// model handles recalibration via uncertainty (RD). This module exposes
// an extensible soft-reset hook (increase RD) without inventing
// destructive rating resets.
// ═══════════════════════════════════════════════════════════════

/**
 * @readonly
 * @enum {string} Ranked season status.
 */
export const SeasonStatus = Object.freeze({
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  FINALIZING: 'FINALIZING',
  ARCHIVED: 'ARCHIVED',
});

/**
 * Default Ranked queue identifier.
 */
export const RANKED_QUEUE_ID = 'ranked';

/**
 * Default season duration (approx 3 months) in milliseconds, used only
 * for seeding/dev. Production seasons are database-driven.
 */
export const DEFAULT_SEASON_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Soft-reset RD multiplier applied at season transition. Increases
 * uncertainty to allow recalibration without destroying the rating.
 * 1.0 = no change. Configurable; not a destructive reset.
 */
export const SEASON_SOFT_RESET_RD_MULTIPLIER = 1.25;

/**
 * @typedef {Object} RankedSeason
 * @property {string} seasonId - Stable season identifier (e.g. 'season-1')
 * @property {string} queueId - Ranked queue
 * @property {string} name - Display name (e.g. 'Season 1')
 * @property {number} startsAt - Unix ms
 * @property {number} endsAt - Unix ms
 * @property {string} status - One of SeasonStatus
 */

/**
 * Determine whether a season is currently active at a given time.
 * @param {RankedSeason} season
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isSeasonActive(season, now = Date.now()) {
  if (!season) return false;
  if (season.status === SeasonStatus.ACTIVE) return true;
  // Date-based fallback: within [startsAt, endsAt)
  return now >= season.startsAt && now < season.endsAt;
}

/**
 * Find the single active season for a queue from a list. Returns null if
 * none is active. If multiple are ACTIVE (misconfiguration), the one with
 * the earliest startsAt wins deterministically.
 * @param {RankedSeason[]} seasons
 * @param {string} queueId
 * @param {number} [now]
 * @returns {RankedSeason|null}
 */
export function activeSeasonForQueue(seasons, queueId, now) {
  if (!Array.isArray(seasons)) return null;
  const candidates = seasons
    .filter(s => s.queueId === queueId && isSeasonActive(s, now))
    .sort((a, b) => a.startsAt - b.startsAt || a.seasonId.localeCompare(b.seasonId));
  return candidates[0] ?? null;
}

/**
 * Validate the single-active-season invariant for a queue. Returns the
 * count of active seasons (must be 0 or 1).
 * @param {RankedSeason[]} seasons
 * @param {string} queueId
 * @param {number} [now]
 * @returns {number}
 */
export function countActiveSeasons(seasons, queueId, now) {
  if (!Array.isArray(seasons)) return 0;
  return seasons.filter(s => s.queueId === queueId && isSeasonActive(s, now)).length;
}

/**
 * Sort seasons for a season picker: active first, then upcoming, then
 * archived (most recent first).
 * @param {RankedSeason[]} seasons
 * @returns {RankedSeason[]}
 */
export function sortSeasonsForPicker(seasons) {
  const rank = (s) => {
    if (s.status === SeasonStatus.ACTIVE) return 0;
    if (s.status === SeasonStatus.UPCOMING) return 1;
    return 2;
  };
  return [...seasons].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    // Within a group: active/upcoming by startsAt asc; archived by endsAt desc
    if (ra === 2) return b.endsAt - a.endsAt;
    return a.startsAt - b.startsAt;
  });
}

/**
 * Compute the soft-reset state for a season transition. Increases RD by
 * the configurable multiplier (capped at the initial RD) without
 * changing the rating. This is the canonical, non-destructive recalibration.
 * @param {Object} state - { rating, ratingDeviation, volatility }
 * @param {Object} [opts]
 * @param {number} [opts.multiplier=SEASON_SOFT_RESET_RD_MULTIPLIER]
 * @param {number} [opts.maxRd] - Cap for the new RD
 * @returns {{ rating: number, ratingDeviation: number, volatility: number }}
 */
export function applySeasonSoftReset(state, opts = {}) {
  const multiplier = opts.multiplier ?? SEASON_SOFT_RESET_RD_MULTIPLIER;
  const maxRd = opts.maxRd ?? 350;
  if (!state) throw new Error('applySeasonSoftReset: state required');
  return {
    rating: Number(state.rating),
    ratingDeviation: Math.min(Number(state.ratingDeviation ?? 350) * multiplier, maxRd),
    volatility: Number(state.volatility ?? 0.06),
  };
}

/**
 * Derive a stable season ID from an ordinal (e.g. 1 → 'season-1').
 * @param {number} ordinal
 * @returns {string}
 */
export function seasonIdFromOrdinal(ordinal) {
  return `season-${ordinal}`;
}

/**
 * Derive a display name from an ordinal (e.g. 1 → 'Season 1').
 * @param {number} ordinal
 * @returns {string}
 */
export function seasonNameFromOrdinal(ordinal) {
  return `Season ${ordinal}`;
}
