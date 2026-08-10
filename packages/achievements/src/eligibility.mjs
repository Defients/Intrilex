// ═══════════════════════════════════════════════════════════════
// eligibility.mjs — Central eligibility checks
// Determines whether a match context qualifies for achievements.
// ═══════════════════════════════════════════════════════════════

import { ELIGIBILITY_SCOPE } from './constants.mjs';
import { getDefinition } from './catalog.mjs';

/**
 * @typedef {Object} MatchContext
 * @property {string} matchId - Unique match identifier
 * @property {string} humanPlayerId - The human player's ID (P1/P2)
 * @property {boolean} isTutorial - Whether this is a tutorial match
 * @property {boolean} isNetworkMatch - Whether this is an online authority match
 * @property {boolean} isLocalVsAI - Whether this is a local vs AI match
 * @property {boolean} isSimulation - Whether this is a batch simulation
 * @property {boolean} isReplayPlayback - Whether this is replay viewing
 * @property {boolean} isSpectator - Whether the viewer is a spectator
 * @property {boolean} isAiVsAi - Whether this is AI vs AI
 */

/**
 * Check if a match context qualifies for achievement tracking at all.
 * @param {MatchContext} ctx
 * @returns {boolean}
 */
export function isQualifyingMatch(ctx) {
  // Never eligible: simulations, replays, spectators, AI-vs-AI
  if (ctx.isSimulation || ctx.isReplayPlayback || ctx.isSpectator || ctx.isAiVsAi) {
    return false;
  }
  // Eligible: Local vs AI or Network match
  if (ctx.isLocalVsAI || ctx.isNetworkMatch) {
    return true;
  }
  return false;
}

/**
 * Check if a specific achievement is eligible to unlock in this context.
 * @param {string} achievementId
 * @param {MatchContext} ctx
 * @returns {boolean}
 */
export function isEligible(achievementId, ctx) {
  if (!isQualifyingMatch(ctx)) return false;

  const def = getDefinition(achievementId);
  if (!def) return false;

  const scope = def.eligibilityScope;

  // COMPETITIVE_ONLY: no tutorial
  if (scope === ELIGIBILITY_SCOPE.COMPETITIVE_ONLY) {
    return !ctx.isTutorial;
  }

  // TUTORIAL_ALLOWED: tutorial ok if canonical engine
  if (scope === ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED) {
    return true; // qualifying match already checked
  }

  // QUALIFYING_DUEL: any qualifying duel (not tutorial-specific restriction)
  if (scope === ELIGIBILITY_SCOPE.QUALIFYING_DUEL) {
    return true;
  }

  return false;
}

/**
 * Create a default match context for Local vs AI.
 * @param {string} matchId
 * @param {string} humanPlayerId
 * @param {boolean} [isTutorial=false]
 * @returns {MatchContext}
 */
export function localVsAIContext(matchId, humanPlayerId, isTutorial = false) {
  return {
    matchId,
    humanPlayerId,
    isTutorial,
    isNetworkMatch: false,
    isLocalVsAI: true,
    isSimulation: false,
    isReplayPlayback: false,
    isSpectator: false,
    isAiVsAi: false,
  };
}

/**
 * Create a match context for network authority match.
 * @param {string} matchId
 * @param {string} humanPlayerId
 * @returns {MatchContext}
 */
export function networkMatchContext(matchId, humanPlayerId) {
  return {
    matchId,
    humanPlayerId,
    isTutorial: false,
    isNetworkMatch: true,
    isLocalVsAI: false,
    isSimulation: false,
    isReplayPlayback: false,
    isSpectator: false,
    isAiVsAi: false,
  };
}
