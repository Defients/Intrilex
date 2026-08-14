// ═══════════════════════════════════════════════════════════════
// tournament-domain.mjs — Human tournament format domain (pure)
//
// Pure domain types and functions for human tournament formats.
// This is the alpha scaffolding for human competition — the actual
// server-side tournament infrastructure (registration, match
// scheduling, results reporting) will be built on top of this.
//
// Supported formats:
//   SINGLE_ELIM — Single-elimination bracket. Best-of-N matches.
//                 BYEs fill to the next power of 2.
//   SWISS       — Swiss system. Fixed number of rounds (default: 3).
//                 Players with similar records are paired each round.
//
// This module is PURE: no I/O, no DB, no UI. It defines the data
// structures and validation logic that the server and UI will use.
// ═══════════════════════════════════════════════════════════════

/**
 * @readonly
 * @enum {string} Tournament format type.
 */
export const TournamentFormat = Object.freeze({
  SINGLE_ELIM: 'SINGLE_ELIM',
  SWISS: 'SWISS',
});

/**
 * @readonly
 * @enum {string} Tournament status lifecycle.
 */
export const TournamentStatus = Object.freeze({
  SCHEDULED: 'SCHEDULED',   // Created but registration not open
  REGISTRATION: 'REGISTRATION', // Open for sign-ups
  IN_PROGRESS: 'IN_PROGRESS', // Matches being played
  FINALIZING: 'FINALIZING',   // All matches done, computing results
  COMPLETED: 'COMPLETED',     // Final results available
  CANCELLED: 'CANCELLED',
});

/**
 * @readonly
 * @enum {string} Match status within a tournament.
 */
export const TournamentMatchStatus = Object.freeze({
  PENDING: 'PENDING',     // Not yet scheduled or waiting for prior round
  SCHEDULED: 'SCHEDULED', // Assigned to a round, waiting for players
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  BYE: 'BYE',             // Auto-win (no opponent)
});

/**
 * @typedef {Object} TournamentPlayer
 * @property {string} publicPlayerId - PLY_xxx
 * @property {string} displayName
 * @property {string|null} handle
 * @property {number} seed - 1-based seed (1 = top seed)
 */

/**
 * @typedef {Object} TournamentMatch
 * @property {string} matchId - TM_xxx
 * @property {number} round - 1-based round number
 * @property {string|null} playerAId
 * @property {string|null} playerBId
 * @property {string} status - One of TournamentMatchStatus
 * @property {string|null} winnerId - Set when COMPLETED
 * @property {number|null} scoreA - Games won by player A
 * @property {number|null} scoreB - Games won by player B
 * @property {string|null} matchRef - Reference to the actual match (e.g. replay ID)
 */

/**
 * @typedef {Object} TournamentDefinition
 * @property {string} tournamentId - TR_xxx
 * @property {string} name
 * @property {string} format - One of TournamentFormat
 * @property {number} bestOf - Games per match (1, 3, 5, 7)
 * @property {number} maxPlayers - Maximum registered players
 * @property {string} status - One of TournamentStatus
 * @property {string} createdAt - ISO timestamp
 * @property {string|null} startedAt - ISO timestamp when matches began
 * @property {string|null} completedAt - ISO timestamp when tournament ended
 * @property {TournamentPlayer[]} players
 * @property {TournamentMatch[]} matches
 * @property {number} swissRounds - For SWISS format: number of rounds
 */

/**
 * Validate a tournament format value.
 * @param {string} format
 * @returns {string|null} The canonical format, or null when invalid.
 */
export function validateTournamentFormat(format) {
  if (!format || typeof format !== 'string') return null;
  return Object.values(TournamentFormat).includes(format) ? format : null;
}

/**
 * Validate a best-of value (must be odd and >= 1).
 * @param {number} bestOf
 * @returns {number} Validated best-of (default 1 if invalid).
 */
export function validateBestOf(bestOf) {
  const n = Number(bestOf);
  if (!Number.isInteger(n) || n < 1 || n > 7) return 1;
  return n % 2 === 0 ? n + 1 : n; // Force odd
}

/**
 * Compute the next power of 2 >= n. Used for single-elim bracket sizing.
 * @param {number} n
 * @returns {number}
 */
export function nextPowerOfTwo(n) {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Count BYEs needed for a single-elim bracket.
 * @param {number} playerCount
 * @returns {number}
 */
export function countByes(playerCount) {
  const bracketSize = nextPowerOfTwo(playerCount);
  return bracketSize - playerCount;
}

/**
 * Generate a single-elimination bracket from a seeded player list.
 * BYEs are inserted so that top seeds get the BYEs (standard seeding).
 * Returns the first-round matches only — subsequent rounds are PENDING
 * and filled in as prior rounds complete via advanceSingleElimRound().
 *
 * IRX-C10: Match IDs include the tournament ID to prevent collisions
 * across concurrent tournaments. Format: ${tournamentId}_R${round}_M${matchNum}
 *
 * @param {TournamentPlayer[]} players - Sorted by seed (seed 1 first)
 * @param {number} bestOf
 * @param {string} [tournamentId] - Tournament ID for unique match IDs
 * @returns {TournamentMatch[]} First-round matches
 */
export function generateSingleElimBracket(players, _bestOf = 1, tournamentId = 'TR') {
  const n = players.length;
  if (n < 2) return [];
  const bracketSize = nextPowerOfTwo(n);
  const byes = bracketSize - n;

  // Standard seeding: 1 vs bye, 2 vs (last), etc.
  // For simplicity, top `byes` seeds get BYEs.
  const matches = [];
  let matchNum = 0;

  // Players who don't get BYEs are paired
  const byePlayers = players.slice(0, byes);
  const playingPlayers = players.slice(byes);

  // Create BYE matches for top seeds
  for (const p of byePlayers) {
    matchNum++;
    matches.push({
      matchId: `${tournamentId}_R1_M${matchNum}`,
      round: 1,
      playerAId: p.publicPlayerId,
      playerBId: null,
      status: TournamentMatchStatus.BYE,
      winnerId: p.publicPlayerId,
      scoreA: null,
      scoreB: null,
      matchRef: null,
    });
  }

  // Pair remaining players: 1v2, 3v4, etc. (seeded pairing)
  for (let i = 0; i < playingPlayers.length; i += 2) {
    matchNum++;
    const a = playingPlayers[i];
    const b = playingPlayers[i + 1];
    matches.push({
      matchId: `${tournamentId}_R1_M${matchNum}`,
      round: 1,
      playerAId: a?.publicPlayerId ?? null,
      playerBId: b?.publicPlayerId ?? null,
      status: (a && b) ? TournamentMatchStatus.SCHEDULED : TournamentMatchStatus.BYE,
      winnerId: (a && !b) ? a.publicPlayerId : (b && !a) ? b.publicPlayerId : null,
      scoreA: null,
      scoreB: null,
      matchRef: null,
    });
  }

  return matches;
}

/**
 * IRX-C08: Advance a single-elimination tournament to the next round.
 * Called after all matches in the current round are completed.
 * Generates the next round's matches by pairing winners from the
 * current round. If only one winner remains, the tournament is complete.
 *
 * @param {TournamentDefinition} tournament
 * @returns {TournamentDefinition} Updated tournament with next round matches or completed status
 */
export function advanceSingleElimRound(tournament) {
  if (tournament.format !== TournamentFormat.SINGLE_ELIM) return tournament;

  const currentRound = Math.max(...tournament.matches.map(m => m.round));
  const currentRoundMatches = tournament.matches
    .filter(m => m.round === currentRound)
    .sort((a, b) => {
      // Sort by match number for deterministic pairing
      const aNum = parseInt(a.matchId.split('_M')[1] || '0', 10);
      const bNum = parseInt(b.matchId.split('_M')[1] || '0', 10);
      return aNum - bNum;
    });

  // Collect winners in order
  const winners = currentRoundMatches.map(m => m.winnerId).filter(Boolean);

  // If only one winner, tournament is complete
  if (winners.length <= 1) {
    return {
      ...tournament,
      status: TournamentStatus.COMPLETED,
      completedAt: new Date().toISOString(),
    };
  }

  // Generate next round matches
  const nextRound = currentRound + 1;
  const nextMatches = [];
  const tid = tournament.tournamentId || 'TR';

  for (let i = 0; i < winners.length; i += 2) {
    const aId = winners[i];
    const bId = winners[i + 1] ?? null;
    const matchNum = Math.floor(i / 2) + 1;
    nextMatches.push({
      matchId: `${tid}_R${nextRound}_M${matchNum}`,
      round: nextRound,
      playerAId: aId,
      playerBId: bId,
      status: (aId && bId) ? TournamentMatchStatus.SCHEDULED : TournamentMatchStatus.BYE,
      winnerId: (aId && !bId) ? aId : (bId && !aId) ? bId : null,
      scoreA: null,
      scoreB: null,
      matchRef: null,
    });
  }

  return {
    ...tournament,
    matches: [...tournament.matches, ...nextMatches],
  };
}

/**
 * Compute the number of rounds in a single-elim tournament.
 * @param {number} playerCount
 * @returns {number}
 */
export function singleElimRoundCount(playerCount) {
  if (playerCount < 2) return 0;
  return Math.ceil(Math.log2(nextPowerOfTwo(playerCount)));
}

/**
 * Compute the number of Swiss rounds based on player count.
 * Standard formula: ceil(log2(players)) rounds, capped at 8.
 * @param {number} playerCount
 * @returns {number}
 */
export function swissRoundCount(playerCount) {
  if (playerCount < 2) return 0;
  const rounds = Math.ceil(Math.log2(playerCount));
  return Math.min(Math.max(rounds, 3), 8);
}

/**
 * Create a new tournament definition.
 * @param {Object} opts
 * @param {string} opts.name
 * @param {string} opts.format - One of TournamentFormat
 * @param {number} [opts.bestOf=1]
 * @param {number} [opts.maxPlayers=16]
 * @param {number} [opts.swissRounds] - For SWISS format
 * @returns {TournamentDefinition}
 */
export function createTournament(opts = {}) {
  const format = validateTournamentFormat(opts.format) ?? TournamentFormat.SINGLE_ELIM;
  const bestOf = validateBestOf(opts.bestOf ?? 1);
  const maxPlayers = Math.max(2, Math.min(128, Number(opts.maxPlayers) || 16));
  const swissRounds = format === TournamentFormat.SWISS
    ? (opts.swissRounds ?? swissRoundCount(maxPlayers))
    : 0;

  return {
    tournamentId: `TR_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: String(opts.name ?? 'Untitled Tournament'),
    format,
    bestOf,
    maxPlayers,
    status: TournamentStatus.SCHEDULED,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    players: [],
    matches: [],
    swissRounds,
  };
}

/**
 * Register a player in a tournament. Returns a new tournament definition
 * (immutable update). Throws if registration is closed or player is
 * already registered.
 * @param {TournamentDefinition} tournament
 * @param {TournamentPlayer} player
 * @returns {TournamentDefinition}
 */
export function registerPlayer(tournament, player) {
  if (tournament.status !== TournamentStatus.SCHEDULED && tournament.status !== TournamentStatus.REGISTRATION) {
    throw new Error('Registration is closed');
  }
  if (tournament.players.length >= tournament.maxPlayers) {
    throw new Error('Tournament is full');
  }
  if (tournament.players.some(p => p.publicPlayerId === player.publicPlayerId)) {
    throw new Error('Player already registered');
  }
  const seed = tournament.players.length + 1;
  return {
    ...tournament,
    status: tournament.status === TournamentStatus.SCHEDULED ? TournamentStatus.REGISTRATION : tournament.status,
    players: [...tournament.players, { ...player, seed }],
  };
}

/**
 * Start a tournament — generates the bracket (single-elim) or
 * first-round pairings (Swiss). Returns a new tournament definition.
 * @param {TournamentDefinition} tournament
 * @returns {TournamentDefinition}
 */
export function startTournament(tournament) {
  if (tournament.status !== TournamentStatus.REGISTRATION) {
    throw new Error('Tournament must be in REGISTRATION status to start');
  }
  if (tournament.players.length < 2) {
    throw new Error('At least 2 players required');
  }

  let matches;
  const tid = tournament.tournamentId || 'TR';
  if (tournament.format === TournamentFormat.SINGLE_ELIM) {
    const seeded = [...tournament.players].sort((a, b) => a.seed - b.seed);
    matches = generateSingleElimBracket(seeded, tournament.bestOf, tid);
  } else {
    // Swiss: first round pairs by seed (1v2, 3v4, etc.)
    // IRX-C10: Use tournament-scoped match IDs
    matches = [];
    const sorted = [...tournament.players].sort((a, b) => a.seed - b.seed);
    for (let i = 0; i < sorted.length; i += 2) {
      const a = sorted[i];
      const b = sorted[i + 1];
      matches.push({
        matchId: `${tid}_R1_M${matches.length + 1}`,
        round: 1,
        playerAId: a?.publicPlayerId ?? null,
        playerBId: b?.publicPlayerId ?? null,
        status: (a && b) ? TournamentMatchStatus.SCHEDULED : TournamentMatchStatus.BYE,
        winnerId: (a && !b) ? a.publicPlayerId : (b && !a) ? b.publicPlayerId : null,
        scoreA: null,
        scoreB: null,
        matchRef: null,
      });
    }
  }

  return {
    ...tournament,
    status: TournamentStatus.IN_PROGRESS,
    startedAt: new Date().toISOString(),
    matches,
  };
}

/**
 * Record a match result. Returns a new tournament definition with
 * the match updated. In single-elim, this may unlock the next round.
 * @param {TournamentDefinition} tournament
 * @param {string} matchId
 * @param {string} winnerId
 * @param {number} scoreA
 * @param {number} scoreB
 * @param {string|null} matchRef
 * @returns {TournamentDefinition}
 */
export function recordTournamentResult(tournament, matchId, winnerId, scoreA, scoreB, matchRef = null) {
  const match = tournament.matches.find(m => m.matchId === matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);
  if (match.status === TournamentMatchStatus.COMPLETED) {
    throw new Error('Match already completed');
  }
  if (match.status === TournamentMatchStatus.BYE) {
    throw new Error('Cannot record result for a BYE match');
  }

  // IRX-C08: Validate winner is a participant in this match
  if (winnerId !== match.playerAId && winnerId !== match.playerBId) {
    throw new Error('Winner must be a participant in this match');
  }

  // IRX-C08: Validate score consistency with best-of
  const bestOf = tournament.bestOf || 1;
  const winsNeeded = Math.ceil(bestOf / 2);
  const winnerScore = winnerId === match.playerAId ? scoreA : scoreB;
  const loserScore = winnerId === match.playerAId ? scoreB : scoreA;
  if (winnerScore < winsNeeded) {
    throw new Error(`Winner must have at least ${winsNeeded} wins for best-of-${bestOf}`);
  }
  if (winnerScore <= loserScore) {
    throw new Error('Winner score must exceed loser score');
  }

  const updatedMatches = tournament.matches.map(m =>
    m.matchId === matchId
      ? { ...m, status: TournamentMatchStatus.COMPLETED, winnerId, scoreA, scoreB, matchRef }
      : m
  );

  let updatedTournament = {
    ...tournament,
    matches: updatedMatches,
  };

  // IRX-C08: For single-elim, check if the current round is complete and advance
  if (tournament.format === TournamentFormat.SINGLE_ELIM) {
    const currentRound = match.round;
    const roundMatches = updatedMatches.filter(m => m.round === currentRound);
    const pendingInRound = roundMatches.filter(
      m => m.status !== TournamentMatchStatus.COMPLETED && m.status !== TournamentMatchStatus.BYE
    );

    if (pendingInRound.length === 0) {
      // All matches in this round are done — advance to next round
      updatedTournament = advanceSingleElimRound(updatedTournament);
    }
  }

  // IRX-C08: For Swiss, check if all matches in the current round are done
  if (tournament.format === TournamentFormat.SWISS) {
    const currentRound = match.round;
    const roundMatches = updatedMatches.filter(m => m.round === currentRound);
    const pendingInRound = roundMatches.filter(
      m => m.status !== TournamentMatchStatus.COMPLETED && m.status !== TournamentMatchStatus.BYE
    );

    if (pendingInRound.length === 0) {
      const totalRounds = tournament.swissRounds || swissRoundCount(tournament.players.length);
      if (currentRound >= totalRounds) {
        // All Swiss rounds complete
        updatedTournament = {
          ...updatedTournament,
          status: TournamentStatus.COMPLETED,
          completedAt: new Date().toISOString(),
        };
      } else {
        // Generate next Swiss round via Swiss pairing
        updatedTournament = advanceSwissRound(updatedTournament);
      }
    }
  }

  return updatedTournament;
}

/**
 * IRX-C08: Advance a Swiss tournament to the next round.
 * Pairs players with similar records, avoiding rematch where possible.
 * @param {TournamentDefinition} tournament
 * @returns {TournamentDefinition}
 */
export function advanceSwissRound(tournament) {
  if (tournament.format !== TournamentFormat.SWISS) return tournament;

  const currentRound = Math.max(...tournament.matches.map(m => m.round));
  const nextRound = currentRound + 1;
  const totalRounds = tournament.swissRounds || swissRoundCount(tournament.players.length);

  if (nextRound > totalRounds) {
    return {
      ...tournament,
      status: TournamentStatus.COMPLETED,
      completedAt: new Date().toISOString(),
    };
  }

  // Get standings to pair by record
  const standings = getSwissStandings(tournament);
  const tid = tournament.tournamentId || 'TR';

  // Track previous pairings to avoid rematches
  const previousPairs = new Set();
  for (const m of tournament.matches) {
    if (m.playerAId && m.playerBId) {
      const key = [m.playerAId, m.playerBId].sort().join('|');
      previousPairs.add(key);
    }
  }

  // Simple Swiss pairing: pair adjacent players in standings, skip rematches
  const paired = new Set();
  const nextMatches = [];
  let matchNum = 0;

  for (let i = 0; i < standings.length; i++) {
    if (paired.has(standings[i].player.publicPlayerId)) continue;
    for (let j = i + 1; j < standings.length; j++) {
      if (paired.has(standings[j].player.publicPlayerId)) continue;
      const aId = standings[i].player.publicPlayerId;
      const bId = standings[j].player.publicPlayerId;
      const pairKey = [aId, bId].sort().join('|');
      if (!previousPairs.has(pairKey)) {
        matchNum++;
        nextMatches.push({
          matchId: `${tid}_R${nextRound}_M${matchNum}`,
          round: nextRound,
          playerAId: aId,
          playerBId: bId,
          status: TournamentMatchStatus.SCHEDULED,
          winnerId: null,
          scoreA: null,
          scoreB: null,
          matchRef: null,
        });
        paired.add(aId);
        paired.add(bId);
        break;
      }
    }
  }

  // Handle unpaired players (odd count or all rematches) — give BYE
  for (const s of standings) {
    if (!paired.has(s.player.publicPlayerId)) {
      matchNum++;
      nextMatches.push({
        matchId: `${tid}_R${nextRound}_M${matchNum}`,
        round: nextRound,
        playerAId: s.player.publicPlayerId,
        playerBId: null,
        status: TournamentMatchStatus.BYE,
        winnerId: s.player.publicPlayerId,
        scoreA: null,
        scoreB: null,
        matchRef: null,
      });
    }
  }

  return {
    ...tournament,
    matches: [...tournament.matches, ...nextMatches],
  };
}

/**
 * Get the tournament champion (single-elim winner).
 * Returns null if the tournament is not completed.
 * @param {TournamentDefinition} tournament
 * @returns {TournamentPlayer|null}
 */
export function getChampion(tournament) {
  if (tournament.status !== TournamentStatus.COMPLETED) return null;
  if (tournament.format !== TournamentFormat.SINGLE_ELIM) return null;
  // IRX-C08: The champion is the winner of the FINAL match (the highest round).
  // Previously this took the first completed match in the latest round, which
  // could be a semifinal if the final hadn't been played yet. Now we require
  // the final match to be completed.
  const maxRound = Math.max(...tournament.matches.map(m => m.round));
  const finalMatch = tournament.matches.find(
    m => m.round === maxRound && m.status === TournamentMatchStatus.COMPLETED
  );
  if (!finalMatch) return null;
  return tournament.players.find(p => p.publicPlayerId === finalMatch.winnerId) ?? null;
}

/**
 * Get the standings for a Swiss tournament (sorted by wins, then by seed).
 * @param {TournamentDefinition} tournament
 * @returns {Array<{ player: TournamentPlayer, wins: number, losses: number, draws: number }>}
 */
export function getSwissStandings(tournament) {
  const standings = tournament.players.map(p => ({ player: p, wins: 0, losses: 0, draws: 0 }));
  for (const m of tournament.matches) {
    if (m.status !== TournamentMatchStatus.COMPLETED) continue;
    const a = standings.find(s => s.player.publicPlayerId === m.playerAId);
    const b = standings.find(s => s.player.publicPlayerId === m.playerBId);
    if (a && m.winnerId === m.playerAId) { a.wins++; if (b) b.losses++; }
    else if (b && m.winnerId === m.playerBId) { b.wins++; if (a) a.losses++; }
  }
  return standings.sort((a, b) => b.wins - a.wins || a.player.seed - b.player.seed);
}
