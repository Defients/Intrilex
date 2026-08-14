// ═══════════════════════════════════════════════════════════════
// match-stats-aggregator.mjs — Per-player match stats aggregation (pure)
//
// Aggregates match-level statistics from completed match records
// (replays) into a PlayerMatchStats object suitable for the
// strategic fingerprint. This bridges the gap between the
// post-match intelligence card data (which has turns, IR margin,
// draw pile, goal progress) and the strategic fingerprint domain.
//
// The aggregator works with both:
//   - Local IndexedDB replay records (browser-side)
//   - Server-side match result records (if available)
//
// This module is PURE: it takes an array of match records and
// returns aggregated stats. No I/O.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MatchRecord
 * @property {string} matchId
 * @property {string|null} winnerId - publicPlayerId of winner, null = draw
 * @property {string} humanPlayerId - The player we're aggregating for
 * @property {number} turns - Full turns played
 * @property {number} humanIR - Human's final IR (secured points)
 * @property {number} oppIR - Opponent's final IR
 * @property {number} drawPileRemaining - Cards left in draw pile at game end
 * @property {number} goalProgress - [0, 1] how close to the goal
 * @property {string} terminationReason - How the game ended
 * @property {boolean|null} wasBehindAtMidpoint - True if human was behind at midpoint
 */

/**
 * @typedef {Object} PlayerMatchStats
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} totalGames
 * @property {number} avgTurns
 * @property {number} avgIrMargin
 * @property {number} avgDrawPileRemaining
 * @property {number} avgGoalProgress
 * @property {number} comebackWins
 */

/**
 * Aggregate an array of match records into PlayerMatchStats.
 * @param {MatchRecord[]} matches
 * @param {string} playerPublicId - The player to aggregate for
 * @returns {PlayerMatchStats}
 */
export function aggregateMatchStats(matches, playerPublicId) {
  if (!matches || !Array.isArray(matches) || matches.length === 0) {
    return {
      wins: 0, losses: 0, draws: 0, totalGames: 0,
      avgTurns: 0, avgIrMargin: 0, avgDrawPileRemaining: 0,
      avgGoalProgress: 0, comebackWins: 0,
    };
  }

  // Filter to matches where this player participated
  const playerMatches = matches.filter(m =>
    m.humanPlayerId === playerPublicId ||
    m.winnerId === playerPublicId ||
    m.playerAId === playerPublicId ||
    m.playerBId === playerPublicId
  );

  if (playerMatches.length === 0) {
    return {
      wins: 0, losses: 0, draws: 0, totalGames: 0,
      avgTurns: 0, avgIrMargin: 0, avgDrawPileRemaining: 0,
      avgGoalProgress: 0, comebackWins: 0,
    };
  }

  let wins = 0, losses = 0, draws = 0;
  let totalTurns = 0, totalIrMargin = 0, totalDrawPile = 0, totalGoalProgress = 0;
  let comebackWins = 0;

  for (const m of playerMatches) {
    const isWin = m.winnerId === playerPublicId;
    const isDraw = m.winnerId === null || m.winnerId === undefined || m.terminationReason === 'CANONICAL_DRAW';

    if (isDraw) draws++;
    else if (isWin) {
      wins++;
      if (m.wasBehindAtMidpoint === true) comebackWins++;
    } else losses++;

    totalTurns += Number(m.turns ?? 0);
    // IR margin: absolute value of (human - opp)
    const irMargin = Math.abs(Number(m.humanIR ?? 0) - Number(m.oppIR ?? 0));
    totalIrMargin += irMargin;
    totalDrawPile += Number(m.drawPileRemaining ?? 0);
    totalGoalProgress += Math.max(0, Math.min(1, Number(m.goalProgress ?? 0)));
  }

  const n = playerMatches.length;
  return {
    wins,
    losses,
    draws,
    totalGames: n,
    avgTurns: Math.round(totalTurns / n),
    avgIrMargin: Math.round(totalIrMargin / n),
    avgDrawPileRemaining: Math.round(totalDrawPile / n),
    avgGoalProgress: totalGoalProgress / n,
    comebackWins,
  };
}

/**
 * Build a PlayerMatchStats object from a ranked profile DTO + match records.
 * This is the enrichment path: when match-level data is available
 * (from IndexedDB replays), we use real averages. When only the
 * ranked DTO is available, we fall back to defaults.
 *
 * @param {Object} ranked - The ranked profile DTO
 * @param {MatchRecord[]} matches - Match-level records (may be empty)
 * @param {string} playerPublicId
 * @returns {PlayerMatchStats}
 */
export function buildEnrichedStats(ranked, matches, playerPublicId) {
  // If we have match-level data, use it
  if (matches && matches.length > 0) {
    const aggregated = aggregateMatchStats(matches, playerPublicId);
    // Merge with ranked DTO for win/loss/draw (authoritative source)
    return {
      wins: ranked.wins ?? aggregated.wins,
      losses: ranked.losses ?? aggregated.losses,
      draws: ranked.draws ?? aggregated.draws,
      totalGames: ranked.games ?? aggregated.totalGames,
      avgTurns: aggregated.avgTurns || 20,
      avgIrMargin: aggregated.avgIrMargin || 16,
      avgDrawPileRemaining: aggregated.avgDrawPileRemaining || 10,
      avgGoalProgress: aggregated.avgGoalProgress || 0.7,
      comebackWins: aggregated.comebackWins,
    };
  }

  // Fallback: use ranked DTO with sensible defaults
  const totalGames = ranked.games ?? ((ranked.wins + ranked.losses + ranked.draws) || 0);
  return {
    wins: ranked.wins ?? 0,
    losses: ranked.losses ?? 0,
    draws: ranked.draws ?? 0,
    totalGames,
    avgTurns: 20,
    avgIrMargin: 16,
    avgDrawPileRemaining: 10,
    avgGoalProgress: 0.7,
    comebackWins: 0,
  };
}
