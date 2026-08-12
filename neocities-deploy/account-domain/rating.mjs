// ═══════════════════════════════════════════════════════════════
// rating.mjs — Canonical Intrilex Rating (IR) system
//
// The canonical skill model is Glicko-2 (see glicko2.mjs). This module
// exposes a match-oriented API (computeRatingUpdate) that the match
// server calls on terminal Ranked matches. Internal Glicko-2 state
// (ratingDeviation, volatility) is server-owned and NEVER exposed in
// ordinary player UI — only the public IR is shown.
//
// A legacy Elo implementation (computeEloUpdate) is retained for
// backward-compatibility references and historical parity tests, but
// the canonical rating transaction uses Glicko-2.
//
// Pure, deterministic. No I/O, no side effects.
// ═══════════════════════════════════════════════════════════════

import {
  glicko2Update,
  initialGlicko2State,
  resultToScore,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
} from './glicko2.mjs';

/**
 * Default starting rating for new players.
 * Matches the DB DEFAULT in player_ratings.
 */
export const DEFAULT_RATING = 1200;

/**
 * Minimum rating (matches DB CHECK constraint).
 */
export const MIN_RATING = 0;

/**
 * Maximum rating (matches DB CHECK constraint).
 */
export const MAX_RATING = 5000;

/**
 * Number of rated matches before a player is no longer provisional.
 * Distinct from the placement count (PLACEMENTS_REQUIRED in rank-tier).
 * Provisional = higher Glicko-2 uncertainty window for calibration.
 */
export const PROVISIONAL_THRESHOLD = 10;

// ── Legacy Elo constants (retained for computeEloUpdate parity) ──
export const K_ESTABLISHED = 24;
export const K_PROVISIONAL = 40;

/**
 * Clamp a rating to the valid range [MIN_RATING, MAX_RATING].
 * Non-finite values fall back to DEFAULT_RATING.
 * @param {number} rating
 * @returns {number}
 */
export function clampRating(rating) {
  if (!Number.isFinite(rating)) return DEFAULT_RATING;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating)));
}

/**
 * @typedef {Object} PlayerRatingState
 * @property {string} accountId - Supabase user UUID
 * @property {number} rating - Current IR
 * @property {number} [ratingDeviation] - Current RD (defaults to initial)
 * @property {number} [volatility] - Current σ (defaults to initial)
 * @property {number} ratedMatches - Total rated matches played
 * @property {boolean} [provisional] - Whether still in provisional period
 */

/**
 * @typedef {Object} RatingUpdateResult
 * @property {string} accountId
 * @property {number} ratingBefore
 * @property {number} ratingAfter
 * @property {number} ratingDelta
 * @property {'WIN'|'LOSS'|'DRAW'} result
 * @property {boolean} provisional
 * @property {number} ratingDeviation - New RD (server-only, not for player UI)
 * @property {number} volatility - New σ (server-only, not for player UI)
 */

/**
 * Resolve the provisional flag from the post-update match count.
 * @param {number} ratedMatchesAfter
 * @returns {boolean}
 */
function isProvisional(ratedMatchesAfter) {
  return ratedMatchesAfter < PROVISIONAL_THRESHOLD;
}

/**
 * Compute the canonical Glicko-2 rating update for a completed match
 * between two players. This is the function the match server calls on
 * terminal Ranked matches.
 *
 * Both players are updated simultaneously using each other as the single
 * opponent for this rating period. The function is pure — it does not
 * write to any database.
 *
 * @param {object} opts
 * @param {PlayerRatingState} opts.playerA - Player A (seat P1)
 * @param {PlayerRatingState} opts.playerB - Player B (seat P2)
 * @param {'WIN_A'|'WIN_B'|'DRAW'} opts.outcome - Match outcome
 * @returns {{ playerA: RatingUpdateResult, playerB: RatingUpdateResult }}
 */
export function computeRatingUpdate({ playerA, playerB, outcome }) {
  if (!playerA || !playerB) throw new Error('Both players required');
  if (!playerA.accountId || !playerB.accountId) throw new Error('Both players must have accountId');
  if (playerA.accountId === playerB.accountId) throw new Error('Cannot rate a self-match');
  if (!['WIN_A', 'WIN_B', 'DRAW'].includes(outcome)) throw new Error(`Invalid outcome: ${outcome}`);

  const ratingA = playerA.rating ?? DEFAULT_RATING;
  const ratingB = playerB.rating ?? DEFAULT_RATING;
  const rdA = playerA.ratingDeviation ?? DEFAULT_RATING_DEVIATION;
  const rdB = playerB.ratingDeviation ?? DEFAULT_RATING_DEVIATION;
  const volA = playerA.volatility ?? DEFAULT_VOLATILITY;
  const volB = playerB.volatility ?? DEFAULT_VOLATILITY;

  let scoreA, scoreB, resultA, resultB;
  if (outcome === 'WIN_A') {
    scoreA = 1; scoreB = 0; resultA = 'WIN'; resultB = 'LOSS';
  } else if (outcome === 'WIN_B') {
    scoreA = 0; scoreB = 1; resultA = 'LOSS'; resultB = 'WIN';
  } else {
    scoreA = 0.5; scoreB = 0.5; resultA = 'DRAW'; resultB = 'DRAW';
  }

  const updateA = glicko2Update(
    { rating: ratingA, ratingDeviation: rdA, volatility: volA },
    [{ rating: ratingB, ratingDeviation: rdB, score: scoreA }],
  );
  const updateB = glicko2Update(
    { rating: ratingB, ratingDeviation: rdB, volatility: volB },
    [{ rating: ratingA, ratingDeviation: rdA, score: scoreB }],
  );

  const matchesA = (playerA.ratedMatches ?? 0) + 1;
  const matchesB = (playerB.ratedMatches ?? 0) + 1;

  return {
    playerA: {
      accountId: playerA.accountId,
      ratingBefore: ratingA,
      ratingAfter: clampRating(updateA.rating),
      ratingDelta: clampRating(updateA.rating) - ratingA,
      result: /** @type {'WIN'|'LOSS'|'DRAW'} */ (resultA),
      provisional: isProvisional(matchesA),
      ratingDeviation: updateA.ratingDeviation,
      volatility: updateA.volatility,
    },
    playerB: {
      accountId: playerB.accountId,
      ratingBefore: ratingB,
      ratingAfter: clampRating(updateB.rating),
      ratingDelta: clampRating(updateB.rating) - ratingB,
      result: /** @type {'WIN'|'LOSS'|'DRAW'} */ (resultB),
      provisional: isProvisional(matchesB),
      ratingDeviation: updateB.ratingDeviation,
      volatility: updateB.volatility,
    },
  };
}

/**
 * Derive the match outcome from the winner field.
 *
 * @param {string|null} winner - The winner playerId ('P1', 'P2', or null for draw/abort)
 * @param {string} seatA - Seat of player A (typically 'P1')
 * @param {string} seatB - Seat of player B (typically 'P2')
 * @returns {'WIN_A'|'WIN_B'|'DRAW'|null} null for aborted/inconclusive matches
 */
export function deriveOutcome(winner, seatA = 'P1', seatB = 'P2') {
  if (winner === seatA) return 'WIN_A';
  if (winner === seatB) return 'WIN_B';
  if (winner === null || winner === undefined) return 'DRAW';
  return null; // Unknown winner — don't rate
}

/**
 * Build the initial rating state for a new player (Glicko-2 defaults).
 * @param {string} accountId
 * @returns {PlayerRatingState}
 */
export function initialRatingState(accountId) {
  const init = initialGlicko2State(DEFAULT_RATING);
  return {
    accountId,
    rating: init.rating,
    ratingDeviation: init.ratingDeviation,
    volatility: init.volatility,
    ratedMatches: 0,
    provisional: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// Legacy Elo implementation — retained for historical parity tests.
// NOT used by the canonical rating transaction (Glicko-2 is canonical).
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the legacy Elo K-factor for a player based on match count.
 * @param {number} ratedMatches
 * @returns {number}
 */
export function resolveKFactor(ratedMatches) {
  return ratedMatches < PROVISIONAL_THRESHOLD ? K_PROVISIONAL : K_ESTABLISHED;
}

/**
 * Legacy Elo expected score.
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number}
 */
export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Legacy Elo rating update. Retained for parity/historical tests only.
 * The canonical system uses computeRatingUpdate (Glicko-2).
 * @param {object} opts
 * @param {PlayerRatingState} opts.playerA
 * @param {PlayerRatingState} opts.playerB
 * @param {'WIN_A'|'WIN_B'|'DRAW'} opts.outcome
 * @returns {{ playerA: RatingUpdateResult, playerB: RatingUpdateResult }}
 */
export function computeEloUpdate({ playerA, playerB, outcome }) {
  if (!playerA || !playerB) throw new Error('Both players required');
  if (playerA.accountId === playerB.accountId) throw new Error('Cannot rate a self-match');
  if (!['WIN_A', 'WIN_B', 'DRAW'].includes(outcome)) throw new Error(`Invalid outcome: ${outcome}`);

  const ratingA = playerA.rating ?? DEFAULT_RATING;
  const ratingB = playerB.rating ?? DEFAULT_RATING;
  const kA = resolveKFactor(playerA.ratedMatches ?? 0);
  const kB = resolveKFactor(playerB.ratedMatches ?? 0);
  const eA = expectedScore(ratingA, ratingB);
  const eB = 1 - eA;

  let scoreA, scoreB, resultA, resultB;
  if (outcome === 'WIN_A') {
    scoreA = 1; scoreB = 0; resultA = 'WIN'; resultB = 'LOSS';
  } else if (outcome === 'WIN_B') {
    scoreA = 0; scoreB = 1; resultA = 'LOSS'; resultB = 'WIN';
  } else {
    scoreA = 0.5; scoreB = 0.5; resultA = 'DRAW'; resultB = 'DRAW';
  }

  const newRatingA = clampRating(ratingA + kA * (scoreA - eA));
  const newRatingB = clampRating(ratingB + kB * (scoreB - eB));
  const matchesA = (playerA.ratedMatches ?? 0) + 1;
  const matchesB = (playerB.ratedMatches ?? 0) + 1;

  return {
    playerA: {
      accountId: playerA.accountId, ratingBefore: ratingA, ratingAfter: newRatingA,
      ratingDelta: newRatingA - ratingA, result: /** @type {'WIN'|'LOSS'|'DRAW'} */ (resultA),
      provisional: isProvisional(matchesA), ratingDeviation: DEFAULT_RATING_DEVIATION, volatility: DEFAULT_VOLATILITY,
    },
    playerB: {
      accountId: playerB.accountId, ratingBefore: ratingB, ratingAfter: newRatingB,
      ratingDelta: newRatingB - ratingB, result: /** @type {'WIN'|'LOSS'|'DRAW'} */ (resultB),
      provisional: isProvisional(matchesB), ratingDeviation: DEFAULT_RATING_DEVIATION, volatility: DEFAULT_VOLATILITY,
    },
  };
}

export { resultToScore };
