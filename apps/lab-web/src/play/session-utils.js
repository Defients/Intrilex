// ═══════════════════════════════════════════════════════════════
// session-utils.js — Utility functions for PlaySession.
//
// Extracted from play-controller.js (P2.2 modularization).
// Contains the deterministic policy RNG, action family constants,
// and post-match stats computation.
// ═══════════════════════════════════════════════════════════════

/**
 * PolicyRng — deterministic RNG for policy decisions.
 * Matches the implementation in autonomy-runtime.js.
 */
export class createPolicyRng {
  constructor(seed) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.cursor = 0;
  }
  nextUint32() {
    let x = this.seed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    this.cursor += 1;
    return this.seed;
  }
  nextIndex(length) {
    if (!Number.isInteger(length) || length <= 0) throw new RangeError('length');
    return this.nextUint32() % length;
  }
}

// ── Action family classification ──

export const SCORE_FAMILIES = new Set(['score', 'play-for-points']);
export const PASS_FAMILIES = new Set(['response-decline', 'exhausted-pass']);
export const RESPONSE_FAMILIES = new Set(['counter', 'disrupt', 'interrupt', 'instant', 'quick']);
export const NON_CARD_FAMILIES = new Set(['response-decline', 'exhausted-pass', 'phase', 'draw']);

/**
 * Compute player stats from the decision journal.
 * @param {object[]} journal - The decision journal entries
 * @param {string} playerId - The player ID to compute stats for
 * @returns {object} { securedPoints, cardsPlayed, supersDeclared, responses, passes }
 */
export function computePlayerStats(journal, playerId) {
  const stats = { securedPoints: 0, cardsPlayed: 0, supersDeclared: 0, responses: 0, passes: 0 };
  if (!journal) return stats;
  for (const entry of journal) {
    if (entry.actorId !== playerId) continue;
    const family = entry.family ?? '';
    if (SCORE_FAMILIES.has(family)) stats.securedPoints += 1;
    if (entry.isSuper) stats.supersDeclared += 1;
    if (RESPONSE_FAMILIES.has(family)) stats.responses += 1;
    if (PASS_FAMILIES.has(family)) stats.passes += 1;
    if (!NON_CARD_FAMILIES.has(family)) stats.cardsPlayed += 1;
  }
  return stats;
}
