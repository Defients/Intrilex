// ═══════════════════════════════════════════════════════════════
// glicko2.mjs — Canonical Glicko-2 skill model for Intrilex Rating (IR)
//
// Pure, deterministic implementation of Glicko-2 (Glickman 2013).
// No I/O, no side effects, no external dependencies.
//
// Internal state (server-owned, never exposed to ordinary player UI):
//   rating            — Intrilex Rating (IR), public skill estimate
//   ratingDeviation   — uncertainty (RD), hidden from players
//   volatility        — σ, hidden from players
//
// Scale: the Glicko-2 internal scale conversion uses the canonical
// constants (173.7178 divisor, 1500 origin). These are mathematical
// scale factors only — the algorithm operates correctly on the Intrilex
// rating scale (default 1200). The origin constant does NOT constrain
// the default rating.
//
// Reference: "Example of the Glicko-2 system" — Glickman.
// The published example (player 1500/200/0.06 vs three opponents) is
// used as a regression vector in test/glicko2.test.mjs.
// ═══════════════════════════════════════════════════════════════

/**
 * Glicko-2 scale conversion constant.
 */
export const GLICKO2_SCALE = 173.7178;

/**
 * Glicko-2 scale origin (canonical constant — a scale factor, not the
 * default rating). The Intrilex default rating is DEFAULT_RATING (1200).
 */
export const GLICKO2_ORIGIN = 1500;

/**
 * System constant τ (tau) controlling volatility change per update.
 * Lower τ = volatility changes less. Glickman suggests 0.3–1.2.
 * Intrilex uses 0.5 (moderate — stable but responsive).
 */
export const GLICKO2_TAU = 0.5;

/**
 * Default rating deviation (uncertainty) for a brand-new player.
 * Standard Glicko-2 initial RD is 350.
 */
export const DEFAULT_RATING_DEVIATION = 350;

/**
 * Default volatility for a brand-new player.
 */
export const DEFAULT_VOLATILITY = 0.06;

/**
 * RD applied when a player has been inactive (no rated matches) for a
 * rating period. This widens uncertainty without destroying the rating.
 * Capped at DEFAULT_RATING_DEVIATION.
 */
export const INACTIVE_RATING_DEVIATION = 350;

/**
 * Convergence tolerance for the volatility iteration (Illinois algorithm).
 */
const VOLATILITY_TOLERANCE = 1e-6;
const VOLATILITY_MAX_ITERATIONS = 100;

/**
 * @typedef {Object} Glicko2State
 * @property {number} rating - Intrilex Rating (IR)
 * @property {number} ratingDeviation - RD (uncertainty)
 * @property {number} volatility - σ
 */

/**
 * @typedef {Object} Glicko2Opponent
 * @property {number} rating - Opponent IR
 * @property {number} ratingDeviation - Opponent RD
 * @property {number} score - Actual score: 1 (win), 0 (loss), 0.5 (draw)
 */

/**
 * @typedef {Object} Glicko2UpdateResult
 * @property {number} rating - New IR
 * @property {number} ratingDeviation - New RD
 * @property {number} volatility - New σ
 * @property {number} ratingBefore - IR before update
 * @property {number} ratingDelta - Change in IR
 */

/**
 * Convert a rating to the Glicko-2 internal scale.
 * @param {number} rating
 * @returns {number}
 */
function toInternalRating(rating) {
  return (rating - GLICKO2_ORIGIN) / GLICKO2_SCALE;
}

/**
 * Convert a rating deviation to the Glicko-2 internal scale.
 * @param {number} rd
 * @returns {number}
 */
function toInternalRd(rd) {
  return rd / GLICKO2_SCALE;
}

/**
 * Convert an internal rating back to the public scale.
 * @param {number} mu
 * @returns {number}
 */
function fromInternalRating(mu) {
  return GLICKO2_SCALE * mu + GLICKO2_ORIGIN;
}

/**
 * Convert an internal RD back to the public scale.
 * @param {number} phi
 * @returns {number}
 */
function fromInternalRd(phi) {
  return GLICKO2_SCALE * phi;
}

/**
 * g(φ) — the standard Glicko-2 weighting function.
 * @param {number} phi - Internal RD
 * @returns {number}
 */
function gPhi(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/**
 * Expected score E(μ, μj, φj).
 * @param {number} mu - Internal rating of player
 * @param {number} muj - Internal rating of opponent
 * @param {number} phij - Internal RD of opponent
 * @returns {number}
 */
function expectedScore(mu, muj, phij) {
  return 1 / (1 + Math.exp(-gPhi(phij) * (mu - muj)));
}

/**
 * Compute the new volatility via the iterative Illinois algorithm
 * (Glickman 2013, step 5).
 * @param {number} sigma - Current volatility
 * @param {number} phi - Current internal RD
 * @param {number} v - Estimated variance
 * @param {number} delta - Estimated improvement
 * @param {number} tau - System constant
 * @returns {number} New volatility
 */
function computeNewVolatility(sigma, phi, v, delta, tau) {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  // f(x) as defined in the Glicko-2 paper
  const f = (x) => {
    const ex = Math.exp(x);
    const denom = phi2 + v + ex;
    return (ex * (delta2 - phi2 - v)) / (denom * denom) - (x - a) / (tau * tau);
  };

  // Step 5.1: initial bounds
  let A = a;
  let B;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    // Iterate k until f(a - kτ) > 0
    let k = 1;
    while (f(a - k * tau) < 0) {
      k++;
      if (k > 50) break; // safety
    }
    B = a - k * tau;
  }

  // Step 5.2: Illinois algorithm
  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > VOLATILITY_TOLERANCE && iterations < VOLATILITY_MAX_ITERATIONS) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    iterations++;
  }

  return Math.exp(A / 2);
}

/**
 * Apply a Glicko-2 update for a single rating period given a set of
 * completed games. Each game contributes one opponent + score.
 *
 * For Intrilex, one rated match = one rating period with one opponent.
 * Processing multiple opponents in a single call is supported for
 * batched rating periods (and for the canonical reference vector test).
 *
 * @param {Glicko2State} state - Current rating state
 * @param {Glicko2Opponent[]} opponents - Games played this period
 * @param {Object} [opts]
 * @param {number} [opts.tau=GLICKO2_TAU] - System constant
 * @returns {Glicko2UpdateResult}
 */
export function glicko2Update(state, opponents, opts = {}) {
  if (!state) throw new Error('glicko2Update: state is required');
  if (!Array.isArray(opponents)) throw new Error('glicko2Update: opponents must be an array');
  const tau = opts.tau ?? GLICKO2_TAU;

  const rating = Number(state.rating);
  const rd = Number(state.ratingDeviation ?? DEFAULT_RATING_DEVIATION);
  const sigma = Number(state.volatility ?? DEFAULT_VOLATILITY);
  if (!Number.isFinite(rating)) throw new Error('glicko2Update: rating must be finite');
  if (!Number.isFinite(rd) || rd <= 0) throw new Error('glicko2Update: ratingDeviation must be > 0');
  if (!Number.isFinite(sigma) || sigma <= 0) throw new Error('glicko2Update: volatility must be > 0');

  // No games this period → only RD widens (inactivity), volatility unchanged.
  if (opponents.length === 0) {
    const phi = toInternalRd(rd);
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    const newRd = fromInternalRd(phiStar);
    return {
      rating,
      ratingDeviation: Math.min(newRd, INACTIVE_RATING_DEVIATION),
      volatility: sigma,
      ratingBefore: rating,
      ratingDelta: 0,
    };
  }

  // Step 1: convert to internal scale
  const mu = toInternalRating(rating);
  const phi = toInternalRd(rd);

  // Steps 2-5: compute v and Δ
  let vInv = 0; // 1/v accumulator
  let deltaSum = 0;
  for (const opp of opponents) {
    const oppRating = Number(opp.rating);
    const oppRd = Number(opp.ratingDeviation ?? DEFAULT_RATING_DEVIATION);
    const oppScore = Number(opp.score);
    if (!Number.isFinite(oppRating)) throw new Error('glicko2Update: opponent.rating must be finite');
    if (!Number.isFinite(oppRd) || oppRd <= 0) throw new Error('glicko2Update: opponent.ratingDeviation must be > 0');
    if (!Number.isFinite(oppScore) || oppScore < 0 || oppScore > 1) throw new Error('glicko2Update: opponent.score must be in [0, 1]');
    const muj = toInternalRating(oppRating);
    const phij = toInternalRd(oppRd);
    const g = gPhi(phij);
    const E = expectedScore(mu, muj, phij);
    vInv += g * g * E * (1 - E);
    deltaSum += g * (oppScore - E);
  }
  if (vInv === 0) throw new Error('glicko2Update: variance is zero (opponents may have degenerate RD)');
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 6: new volatility
  const newSigma = computeNewVolatility(sigma, phi, v, delta, tau);

  // Step 7: update RD
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);

  // Step 8: shrink RD using v
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

  // Step 9: update rating
  const muNew = mu + phiNew * phiNew * deltaSum;

  // Step 10: convert back
  const newRating = fromInternalRating(muNew);
  const newRd = fromInternalRd(phiNew);

  return {
    rating: newRating,
    ratingDeviation: newRd,
    volatility: newSigma,
    ratingBefore: rating,
    ratingDelta: newRating - rating,
  };
}

/**
 * Build the initial Glicko-2 state for a new player.
 * @param {number} [rating=1200] - Starting IR
 * @returns {Glicko2State}
 */
export function initialGlicko2State(rating = 1200) {
  return {
    rating,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
  };
}

/**
 * Apply an inactivity widening to a player's RD without changing their
 * rating or volatility. Used when a player skips rating periods.
 * @param {Glicko2State} state
 * @returns {Glicko2State}
 */
export function applyInactivity(state) {
  const phi = toInternalRd(Number(state.ratingDeviation ?? DEFAULT_RATING_DEVIATION));
  const sigma = Number(state.volatility ?? DEFAULT_VOLATILITY);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  return {
    rating: Number(state.rating),
    ratingDeviation: Math.min(fromInternalRd(phiStar), INACTIVE_RATING_DEVIATION),
    volatility: sigma,
  };
}

/**
 * Convert a score outcome to the Glicko-2 numeric score.
 * @param {'WIN'|'LOSS'|'DRAW'} result
 * @returns {number} 1 | 0 | 0.5
 */
export function resultToScore(result) {
  if (result === 'WIN') return 1;
  if (result === 'LOSS') return 0;
  if (result === 'DRAW') return 0.5;
  throw new Error(`resultToScore: invalid result ${result}`);
}
