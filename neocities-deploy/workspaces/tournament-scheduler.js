// ═══════════════════════════════════════════════════════════════
// workspaces/tournament-scheduler.js — Pure tournament bracket logic
// ═══════════════════════════════════════════════════════════════
//
// Single-elimination bracket scheduler for AI-vs-AI tournaments.
// Pure functions — no DOM, no workers, no side effects.
// The workspace UI (tournament.js) drives this via state updates.

export const TOURNAMENT_SCHEMA_VERSION = '1.1.0';

// ── Bracket generation ──────────────────────────────────────────

/**
 * Generate a single-elimination tournament bracket from a list of policies.
 * Pads to the next power of 2 with BYE slots if needed.
 * @param {string[]} policyIds - Array of policy IDs (2–16 entries)
 * @param {object} opts - { bestOf, seedBase }
 * @returns {object} tournament state with rounds array
 */
export function createTournament(policyIds, opts = {}) {
  const policies = [...policyIds];
  if (policies.length < 2) throw new Error('TOURNAMENT_NEEDS_2_POLICIES');
  if (policies.length > 16) throw new Error('TOURNAMENT_MAX_16_POLICIES');
  if (new Set(policies).size !== policies.length) throw new Error('TOURNAMENT_DUPLICATE_POLICIES');

  const bestOf = opts.bestOf ?? 1;
  if (bestOf < 1 || bestOf > 7 || bestOf % 2 === 0) throw new Error('BEST_OF_MUST_BE_ODD');

  // Pad to next power of 2 with BYEs
  const targetSize = nextPow2(policies.length);
  const slots = [...policies, ...Array.from({ length: targetSize - policies.length }, (_, i) => `BYE-${i + 1}`)];

  // Seed positions using standard bracket seeding (1vLast, 2vSecondLast, etc.)
  const seededOrder = seedBracketPositions(targetSize);
  const seededSlots = seededOrder.map(pos => slots[pos]);

  // Build round 0 matches
  const matches = [];
  for (let i = 0; i < seededSlots.length; i += 2) {
    const p1 = seededSlots[i], p2 = seededSlots[i + 1];
    const isBye = p1.startsWith('BYE-') || p2.startsWith('BYE-');
    matches.push({
      matchId: `R0-M${matches.length}`,
      roundIndex: 0,
      matchIndex: matches.length,
      seat1Policy: p1,
      seat2Policy: p2,
      winner: isBye ? (p1.startsWith('BYE-') ? p2 : p1) : null,
      isBye,
      games: [], // array of { winner, summary } for bestOf
      status: isBye ? 'completed' : 'pending'
    });
  }

  const rounds = [{
    roundIndex: 0,
    roundLabel: roundLabel(0, targetSize),
    matches
  }];

  // Pre-generate empty future rounds
  let matchCount = matches.length;
  let roundIdx = 1;
  while (matchCount > 1) {
    matchCount = Math.floor(matchCount / 2);
    rounds.push({
      roundIndex: roundIdx,
      roundLabel: roundLabel(roundIdx, targetSize),
      matches: Array.from({ length: matchCount }, (_, i) => ({
        matchId: `R${roundIdx}-M${i}`,
        roundIndex: roundIdx,
        matchIndex: i,
        seat1Policy: null,
        seat2Policy: null,
        winner: null,
        isBye: false,
        games: [],
        status: 'pending'
      }))
    });
    roundIdx += 1;
  }

  const tournament = {
    schemaVersion: TOURNAMENT_SCHEMA_VERSION,
    tournamentId: null, // set by caller after creation
    policyCount: policies.length,
    policySeeds: Object.fromEntries(policies.map((p, i) => [p, i + 1])),
    bracketSize: targetSize,
    bestOf,
    rounds,
    thirdPlaceMatch: null,
    champion: null,
    runnerUp: null,
    thirdPlace: null,
    createdAt: new Date().toISOString(),
    status: 'in_progress'
  };

  // Mark ready matches and propagate BYE winners
  return advanceTournament(tournament);
}

/**
 * Advance the tournament: propagate winners from completed round to next round.
 * Returns a new tournament object (immutable update).
 */
export function advanceTournament(tournament) {
  const rounds = tournament.rounds.map(r => ({
    ...r,
    matches: r.matches.map(m => ({ ...m, games: [...m.games] }))
  }));

  for (let r = 0; r < rounds.length - 1; r += 1) {
    const currentRound = rounds[r];
    const nextRound = rounds[r + 1];
    for (let m = 0; m < currentRound.matches.length; m += 2) {
      const match1 = currentRound.matches[m];
      const match2 = currentRound.matches[m + 1];
      const nextMatch = nextRound.matches[Math.floor(m / 2)];
      if (match1.winner) nextMatch.seat1Policy = match1.winner;
      if (match2?.winner) nextMatch.seat2Policy = match2.winner;
      // If both policies are set and it's pending, mark it as ready
      if (nextMatch.seat1Policy && nextMatch.seat2Policy && nextMatch.status === 'pending') {
        nextMatch.status = 'ready';
      }
      // Auto-complete if one side is BYE
      if (nextMatch.seat1Policy?.startsWith('BYE-') && nextMatch.seat2Policy && !nextMatch.winner) {
        nextMatch.winner = nextMatch.seat2Policy;
        nextMatch.status = 'completed';
        nextMatch.isBye = true;
      } else if (nextMatch.seat2Policy?.startsWith('BYE-') && nextMatch.seat1Policy && !nextMatch.winner) {
        nextMatch.winner = nextMatch.seat1Policy;
        nextMatch.status = 'completed';
        nextMatch.isBye = true;
      }
    }
  }

  // Also mark round-0 matches as ready (they don't get propagated from a previous round)
  for (const match of rounds[0].matches) {
    if (match.seat1Policy && match.seat2Policy && match.status === 'pending' && !match.isBye) {
      match.status = 'ready';
    }
  }

  // Check if champion is decided
  const finalRound = rounds[rounds.length - 1];
  const champion = finalRound.matches[0]?.winner ?? null;
  const runnerUp = champion ? (finalRound.matches[0].seat1Policy === champion ? finalRound.matches[0].seat2Policy : finalRound.matches[0].seat1Policy) : null;

  // Determine third-place from consolation match if present
  let thirdPlace = null;
  if (tournament.thirdPlaceMatch?.status === 'completed') {
    thirdPlace = tournament.thirdPlaceMatch.winner;
  }

  // Status is completed only when champion is decided AND third-place is resolved (if applicable)
  let status = champion ? 'completed' : 'in_progress';
  if (champion && tournament.thirdPlaceMatch && tournament.thirdPlaceMatch.status !== 'completed') {
    status = 'in_progress';
  }

  return { ...tournament, rounds, champion, runnerUp, thirdPlace, status };
}

/**
 * Record a match result in the tournament.
 * @param {object} tournament - Current tournament state
 * @param {string} matchId - Match ID (e.g. "R0-M0")
 * @param {string} winner - Winning policy ID
 * @param {object} gameSummary - Match summary from runBrowserPolicyMatch
 * @returns {object} New tournament state with result recorded and propagated
 */
export function recordMatchResult(tournament, matchId, winner, gameSummary) {
  const rounds = tournament.rounds.map(r => ({
    ...r,
    matches: r.matches.map(m => ({ ...m, games: [...m.games] }))
  }));

  let targetMatch = null;
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.matchId === matchId) { targetMatch = match; break; }
    }
    if (targetMatch) break;
  }

  // Also check third-place match
  let isThirdPlace = false;
  if (!targetMatch && tournament.thirdPlaceMatch?.matchId === matchId) {
    targetMatch = tournament.thirdPlaceMatch;
    isThirdPlace = true;
  }

  if (!targetMatch) throw new Error(`MATCH_NOT_FOUND: ${matchId}`);
  if (targetMatch.status === 'completed') throw new Error(`MATCH_ALREADY_COMPLETED: ${matchId}`);

  const gameIndex = targetMatch.games.length;
  // AB/BA seat-swap: even games use original seats, odd games swap
  const seatSwapped = gameIndex % 2 === 1;

  targetMatch.games.push({ winner, summary: gameSummary, seatSwapped, gameIndex });

  // For bestOf, check if we have a winner
  const bestOf = tournament.bestOf;
  const winsNeeded = Math.ceil(bestOf / 2);
  const seat1Wins = targetMatch.games.filter(g => g.winner === targetMatch.seat1Policy).length;
  const seat2Wins = targetMatch.games.filter(g => g.winner === targetMatch.seat2Policy).length;

  if (seat1Wins >= winsNeeded || seat2Wins >= winsNeeded) {
    targetMatch.winner = seat1Wins > seat2Wins ? targetMatch.seat1Policy : targetMatch.seat2Policy;
    targetMatch.status = 'completed';

    // If this was a semifinal match, track the loser for third-place
    if (!isThirdPlace && targetMatch.roundLabel === 'Semifinals') {
      const loser = targetMatch.winner === targetMatch.seat1Policy ? targetMatch.seat2Policy : targetMatch.seat1Policy;
      tournament = ensureThirdPlaceMatch(tournament, loser);
    }
  }

  if (isThirdPlace) {
    const updated = { ...tournament, thirdPlaceMatch: targetMatch };
    return advanceTournament(updated);
  }

  const updated = { ...tournament, rounds };
  return advanceTournament(updated);
}

/**
 * Get all matches that are ready to be played (both policies set, not completed, not BYE).
 */
export function getReadyMatches(tournament) {
  const ready = [];
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.status === 'ready' && !match.isBye && !match.winner) {
        ready.push(match);
      }
    }
  }
  // Include third-place match if ready
  if (tournament.thirdPlaceMatch?.status === 'ready' && !tournament.thirdPlaceMatch.winner) {
    ready.push(tournament.thirdPlaceMatch);
  }
  return ready;
}

/**
 * Get the next match to play (first ready match in bracket order).
 */
export function getNextMatch(tournament) {
  return getReadyMatches(tournament)[0] ?? null;
}

/**
 * Get tournament standings summary.
 */
export function getTournamentSummary(tournament) {
  const totalMatches = tournament.rounds.reduce((sum, r) => sum + r.matches.filter(m => !m.isBye).length, 0);
  const completedMatches = tournament.rounds.reduce((sum, r) => sum + r.matches.filter(m => m.status === 'completed' && !m.isBye).length, 0);
  const totalGames = tournament.rounds.reduce((sum, r) => sum + r.matches.reduce((s, m) => s + m.games.length, 0), 0);

  // Per-policy stats
  const policyStats = {};
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.isBye) continue;
      for (const game of match.games) {
        for (const policy of [match.seat1Policy, match.seat2Policy]) {
          if (!policy || policy.startsWith('BYE-')) continue;
          if (!policyStats[policy]) policyStats[policy] = { wins: 0, losses: 0, gamesPlayed: 0 };
          policyStats[policy].gamesPlayed += 1;
          if (game.winner === policy) policyStats[policy].wins += 1;
          else policyStats[policy].losses += 1;
        }
      }
    }
  }

  // Include third-place match in totals
  const hasThirdPlace = !!tournament.thirdPlaceMatch;
  const totalMatchesWith3rd = totalMatches + (hasThirdPlace ? 1 : 0);
  const completedMatchesWith3rd = completedMatches + (tournament.thirdPlaceMatch?.status === 'completed' ? 1 : 0);
  const totalGamesWith3rd = totalGames + (tournament.thirdPlaceMatch?.games.length ?? 0);

  // Include third-place games in policy stats
  if (tournament.thirdPlaceMatch) {
    const tpm = tournament.thirdPlaceMatch;
    for (const game of tpm.games) {
      for (const policy of [tpm.seat1Policy, tpm.seat2Policy]) {
        if (!policy || policy.startsWith('BYE-')) continue;
        if (!policyStats[policy]) policyStats[policy] = { wins: 0, losses: 0, gamesPlayed: 0 };
        policyStats[policy].gamesPlayed += 1;
        if (game.winner === policy) policyStats[policy].wins += 1;
        else policyStats[policy].losses += 1;
      }
    }
  }

  return {
    totalMatches: totalMatchesWith3rd,
    completedMatches: completedMatchesWith3rd,
    totalGames: totalGamesWith3rd,
    progress: totalMatchesWith3rd > 0 ? completedMatchesWith3rd / totalMatchesWith3rd : 0,
    champion: tournament.champion,
    runnerUp: tournament.runnerUp,
    thirdPlace: tournament.thirdPlace,
    status: tournament.status,
    policyStats
  };
}

// ── Third-Place Match ───────────────────────────────────────────

/**
 * Ensure a third-place match exists with the semifinal loser added.
 * Called when a semifinal match completes. When both semifinal losers
 * are known, the match is marked as ready.
 */
function ensureThirdPlaceMatch(tournament, loser) {
  if (!tournament.thirdPlaceMatch) {
    tournament = {
      ...tournament,
      thirdPlaceMatch: {
        matchId: 'THIRD-PLACE',
        roundIndex: -1,
        matchIndex: 0,
        roundLabel: 'Third Place',
        seat1Policy: null,
        seat2Policy: null,
        winner: null,
        isBye: false,
        isConsolation: true,
        games: [],
        status: 'pending',
        semifinalLosers: [],
      }
    };
  }
  const tpm = { ...tournament.thirdPlaceMatch, semifinalLosers: [...tournament.thirdPlaceMatch.semifinalLosers, loser] };
  if (tpm.semifinalLosers.length === 1) {
    tpm.seat1Policy = tpm.semifinalLosers[0];
  } else if (tpm.semifinalLosers.length === 2) {
    tpm.seat1Policy = tpm.semifinalLosers[0];
    tpm.seat2Policy = tpm.semifinalLosers[1];
    tpm.status = 'ready';
  }
  return { ...tournament, thirdPlaceMatch: tpm };
}

// ── Tournament Analytics ────────────────────────────────────────

/**
 * Compute post-tournament analytics from a completed tournament.
 * Returns structured analytics for display and export.
 */
export function getTournamentAnalytics(tournament) {
  const summary = getTournamentSummary(tournament);
  const seeds = tournament.policySeeds ?? {};

  // Upset index: count of matches where lower seed (higher number) won
  let upsets = 0;
  let totalDecided = 0;
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.isBye || !match.winner) continue;
      totalDecided++;
      const s1Seed = seeds[match.seat1Policy] ?? 999;
      const s2Seed = seeds[match.seat2Policy] ?? 999;
      const winnerSeed = match.winner === match.seat1Policy ? s1Seed : s2Seed;
      const loserSeed = match.winner === match.seat1Policy ? s2Seed : s1Seed;
      if (winnerSeed > loserSeed) upsets++;
    }
  }

  // Average games per match and longest match
  let totalGames = 0;
  let matchCount = 0;
  let longestMatch = { matchId: null, games: 0 };
  let sweeps = 0;
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.isBye || match.games.length === 0) continue;
      matchCount++;
      totalGames += match.games.length;
      if (match.games.length > longestMatch.games) {
        longestMatch = { matchId: match.matchId, games: match.games.length };
      }
      // Sweep = winner won without losing a game
      const winnerGames = match.games.filter(g => g.winner === match.winner).length;
      if (winnerGames === match.games.length) sweeps++;
    }
  }
  const avgGamesPerMatch = matchCount > 0 ? totalGames / matchCount : 0;

  // Theoretical max games = totalMatches * bestOf
  const theoreticalMax = summary.totalMatches * tournament.bestOf;
  const bracketEfficiency = theoreticalMax > 0 ? totalGames / theoreticalMax : 0;

  // Per-policy performance with margin
  const policyPerformance = {};
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.isBye) continue;
      for (const game of match.games) {
        for (const policy of [match.seat1Policy, match.seat2Policy]) {
          if (!policy || policy.startsWith('BYE-')) continue;
          if (!policyPerformance[policy]) {
            policyPerformance[policy] = { wins: 0, losses: 0, gamesPlayed: 0, matchWins: 0, matchLosses: 0 };
          }
          policyPerformance[policy].gamesPlayed += 1;
          if (game.winner === policy) policyPerformance[policy].wins += 1;
          else policyPerformance[policy].losses += 1;
        }
      }
      // Match-level stats
      if (match.winner) {
        if (!policyPerformance[match.winner]) policyPerformance[match.winner] = { wins: 0, losses: 0, gamesPlayed: 0, matchWins: 0, matchLosses: 0 };
        policyPerformance[match.winner].matchWins += 1;
        const loser = match.winner === match.seat1Policy ? match.seat2Policy : match.seat1Policy;
        if (loser && !loser.startsWith('BYE-')) {
          if (!policyPerformance[loser]) policyPerformance[loser] = { wins: 0, losses: 0, gamesPlayed: 0, matchWins: 0, matchLosses: 0 };
          policyPerformance[loser].matchLosses += 1;
        }
      }
    }
  }

  return {
    champion: tournament.champion,
    runnerUp: tournament.runnerUp,
    thirdPlace: tournament.thirdPlace,
    upsetIndex: upsets,
    totalDecidedMatches: totalDecided,
    upsetRate: totalDecided > 0 ? upsets / totalDecided : 0,
    avgGamesPerMatch: Math.round(avgGamesPerMatch * 100) / 100,
    longestMatch,
    sweeps,
    sweepRate: matchCount > 0 ? sweeps / matchCount : 0,
    bracketEfficiency: Math.round(bracketEfficiency * 1000) / 1000,
    totalGames,
    theoreticalMaxGames: theoreticalMax,
    policyPerformance,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Compute the next power of 2 >= n.
 */
function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate standard bracket seeding positions for a bracket of size n (power of 2).
 * Returns an array of indices [0..n-1] in seeding order:
 * For 8: [0, 7, 3, 4, 1, 6, 2, 5] (1v8, 4v5, 2v7, 3v6 in standard seeding)
 */
function seedBracketPositions(n) {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  // Recursive: split into top and bottom halves, interleave
  const half = n / 2;
  const topHalf = seedBracketPositions(half);
  const bottomHalf = seedBracketPositions(half).map(pos => n - 1 - pos);
  // Interleave: top[0], bottom[0], top[1], bottom[1], ...
  const result = [];
  for (let i = 0; i < half; i += 1) {
    result.push(topHalf[i]);
    result.push(bottomHalf[i]);
  }
  return result;
}

/**
 * Generate a human-readable label for a round.
 */
function roundLabel(roundIndex, bracketSize) {
  const matchesInRound = bracketSize / Math.pow(2, roundIndex + 1);
  if (matchesInRound === 1) return 'Final';
  if (matchesInRound === 2) return 'Semifinals';
  if (matchesInRound === 4) return 'Quarterfinals';
  return `Round ${roundIndex + 1}`;
}
