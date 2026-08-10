// ═══════════════════════════════════════════════════════════════
// rating.mjs — Elo-based competitive rating system
//
// Pure, deterministic rating calculation. No I/O, no side effects.
// The server calls computeRatingUpdate() on terminal match and
// the persistor writes the result to player_ratings + match_participants.
//
// Design:
//   - Standard Elo with configurable K-factor
//   - Provisional players (rated_matches < PROVISIONAL_THRESHOLD) use higher K
//   - Rating clamped to [0, 5000] to match DB CHECK constraint
//   - Draw support (score 0.5 for both)
//   - No external dependencies — pure math
// ═══════════════════════════════════════════════════════════════

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
 * K-factor for established players (rated_matches >= PROVISIONAL_THRESHOLD).
 * Lower K = rating changes less per game once established.
 */
export const K_ESTABLISHED = 24;

/**
 * K-factor for provisional players (rated_matches < PROVISIONAL_THRESHOLD).
 * Higher K = rating changes faster while the system calibrates.
 */
export const K_PROVISIONAL = 40;

/**
 * Number of rated matches before a player is no longer provisional.
 * Matches the `provisional` column semantics in player_ratings.
 */
export const PROVISIONAL_THRESHOLD = 10;

/**
 * Clamp a rating to the valid range [MIN_RATING, MAX_RATING].
 * @param {number} rating
 * @returns {number}
 */
export function clampRating(rating) {
  if (!Number.isFinite(rating)) return DEFAULT_RATING;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating)));
}

/**
 * Resolve the K-factor for a player based on their match count.
 * @param {number} ratedMatches - Number of rated matches played
 * @returns {number}
 */
export function resolveKFactor(ratedMatches) {
  return ratedMatches < PROVISIONAL_THRESHOLD ? K_PROVISIONAL : K_ESTABLISHED;
}

/**
 * Expected score for player A against player B.
 * Standard Elo formula: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 * @param {number} ratingA - Player A's rating
 * @param {number} ratingB - Player B's rating
 * @returns {number} Expected score in [0, 1]
 */
export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * @typedef {Object} PlayerRatingState
 * @property {string} accountId - Supabase user UUID
 * @property {number} rating - Current rating
 * @property {number} ratedMatches - Total rated matches played
 * @property {boolean} provisional - Whether still in provisional period
 */

/**
 * @typedef {Object} RatingUpdateResult
 * @property {string} accountId
 * @property {number} ratingBefore
 * @property {number} ratingAfter
 * @property {number} ratingDelta
 * @property {'WIN'|'LOSS'|'DRAW'} result
 * @property {boolean} provisional
 */

/**
 * Compute the rating update for a completed match between two players.
 *
 * Uses standard Elo with asymmetric K-factors (provisional vs established).
 * The function is pure — it does not write to any database.
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

  const kA = resolveKFactor(playerA.ratedMatches ?? 0);
  const kB = resolveKFactor(playerB.ratedMatches ?? 0);

  const eA = expectedScore(ratingA, ratingB);
  const eB = 1 - eA;

  // Actual scores: 1 for win, 0 for loss, 0.5 for draw
  let scoreA, scoreB;
  let resultA, resultB;
  if (outcome === 'WIN_A') {
    scoreA = 1; scoreB = 0;
    resultA = 'WIN'; resultB = 'LOSS';
  } else if (outcome === 'WIN_B') {
    scoreA = 0; scoreB = 1;
    resultA = 'LOSS'; resultB = 'WIN';
  } else {
    scoreA = 0.5; scoreB = 0.5;
    resultA = 'DRAW'; resultB = 'DRAW';
  }

  const newRatingA = clampRating(ratingA + kA * (scoreA - eA));
  const newRatingB = clampRating(ratingB + kB * (scoreB - eB));

  const matchesA = (playerA.ratedMatches ?? 0) + 1;
  const matchesB = (playerB.ratedMatches ?? 0) + 1;

  return {
    playerA: {
      accountId: playerA.accountId,
      ratingBefore: ratingA,
      ratingAfter: newRatingA,
      ratingDelta: newRatingA - ratingA,
      result: /** @type {'WIN'|'LOSS'|'DRAW'} */ (resultA),
      provisional: matchesA < PROVISIONAL_THRESHOLD,
    },
    playerB: {
      accountId: playerB.accountId,
      ratingBefore: ratingB,
      ratingAfter: newRatingB,
      ratingDelta: newRatingB - ratingB,
      result: /** @type {'WIN'|'LOSS'|'DRAW'} */ (resultB),
      provisional: matchesB < PROVISIONAL_THRESHOLD,
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
 * Build the initial rating state for a new player.
 * @param {string} accountId
 * @returns {PlayerRatingState}
 */
export function initialRatingState(accountId) {
  return {
    accountId,
    rating: DEFAULT_RATING,
    ratedMatches: 0,
    provisional: true,
  };
}
