// ═══════════════════════════════════════════════════════════════
// ranked-entry-requirements.mjs — P9: Ranked entry requirements
//
// Pure functions that check whether a player meets the requirements
// to enter the ranked queue. Gates smurfs and bots cheaply without
// requiring complex verification.
//
// Requirements:
//   1. At least N casual matches played (default: 3)
//   2. Tutorial completion (checked via funnel state or academy progress)
//   3. Not a fresh guest account (must have a permanent account)
//
// These are soft gates — the server can override for operator accounts.
// ═══════════════════════════════════════════════════════════════

/** Default minimum casual matches before ranked is unlocked */
export const MIN_CASUAL_MATCHES = 3;

/**
 * @typedef {Object} RankedEntryCheck
 * @property {boolean} allowed - Whether the player can enter ranked
 * @property {string|null} reason - Rejection reason code, or null if allowed
 * @property {string} message - Human-readable message
 */

/**
 * Check if a player meets ranked entry requirements.
 * @param {object} opts
 * @param {boolean} [opts.isAnonymous] - Whether the account is anonymous/guest
 * @param {number} [opts.casualMatchesPlayed] - Number of casual matches played
 * @param {boolean} [opts.tutorialCompleted] - Whether the tutorial was completed
 * @param {boolean} [opts.isOperator] - Whether this is an operator account (bypasses checks)
 * @param {number} [opts.minCasualMatches] - Override minimum casual matches
 * @returns {RankedEntryCheck}
 */
export function checkRankedEntryRequirements(opts) {
  const {
    isAnonymous = false,
    casualMatchesPlayed = 0,
    tutorialCompleted = false,
    isOperator = false,
    minCasualMatches = MIN_CASUAL_MATCHES,
  } = opts ?? {};

  // Operators bypass all checks
  if (isOperator) {
    return { allowed: true, reason: null, message: 'Ranked queue available (operator)' };
  }

  // Must have a permanent account
  if (isAnonymous) {
    return {
      allowed: false,
      reason: 'RANKED_REQUIRES_PERMANENT_ACCOUNT',
      message: 'Ranked play requires a permanent account. Sign in to unlock ranked.',
    };
  }

  // Must have played enough casual matches
  if (casualMatchesPlayed < minCasualMatches) {
    return {
      allowed: false,
      reason: 'RANKED_REQUIRES_CASUAL_EXPERIENCE',
      message: `Play at least ${minCasualMatches} casual match${minCasualMatches > 1 ? 'es' : ''} before entering ranked (${casualMatchesPlayed}/${minCasualMatches} completed).`,
    };
  }

  // Must have completed the tutorial
  if (!tutorialCompleted) {
    return {
      allowed: false,
      reason: 'RANKED_REQUIRES_TUTORIAL',
      message: 'Complete the Academy tutorial before entering ranked play.',
    };
  }

  return { allowed: true, reason: null, message: 'Ranked queue available' };
}
