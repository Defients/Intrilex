// ═══════════════════════════════════════════════════════════════
// tournament-operations.mjs — Tournament check-in & admin corrections (pure)
//
// Pure domain functions for tournament check-in flow and administrative
// match corrections with full audit history. These build on top of the
// core tournament-domain.mjs types (TournamentStatus, TournamentMatchStatus,
// TournamentDefinition, TournamentPlayer, TournamentMatch).
//
// This module is PURE: no I/O, no DB, no UI, no mutation of inputs.
// All functions return new objects via spread / structuredClone.
// ═══════════════════════════════════════════════════════════════

import {
  TournamentStatus,
  TournamentMatchStatus,
  TournamentFormat,
  generateSingleElimBracket,
} from './tournament-domain.mjs';

/**
 * @readonly
 * @enum {string} Audit actions recorded for admin corrections.
 */
export const TournamentAuditAction = Object.freeze({
  CORRECT_RESULT: 'CORRECT_RESULT',
  CORRECT_SEED: 'CORRECT_SEED',
  DISQUALIFY: 'DISQUALIFY',
  RESCHEDULE_MATCH: 'RESCHEDULE_MATCH',
  VOID_MATCH: 'VOID_MATCH',
  REVERT_RESULT: 'REVERT_RESULT',
});

/**
 * @typedef {Object} TournamentAuditEntry
 * @property {string} action - One of TournamentAuditAction
 * @property {string} tournamentId - TR_xxx
 * @property {string|null} matchId - TM_xxx or null when action is tournament-wide
 * @property {string} operatorAccountId - Admin account performing the action
 * @property {string} timestamp - ISO timestamp
 * @property {string} reason - Human-readable justification
 * @property {*} before - Snapshot of state before the change
 * @property {*} after - Snapshot of state after the change
 */

// ─────────────────────────────────────────────────────────────────
// Check-in flow
// ─────────────────────────────────────────────────────────────────

/**
 * Mark a registered player as checked in. Only allowed during
 * REGISTRATION status. Returns a new tournament with the player's
 * checkedIn flag set and checkedInAt timestamp recorded.
 *
 * @param {TournamentDefinition} tournament
 * @param {string} publicPlayerId - PLY_xxx of the player to check in
 * @returns {TournamentDefinition} New tournament with player checked in
 * @throws {Error} If tournament is not in REGISTRATION status
 * @throws {Error} If the player is not registered
 * @throws {Error} If the player is already checked in
 */
export function checkInPlayer(tournament, publicPlayerId) {
  if (tournament.status !== TournamentStatus.REGISTRATION) {
    throw new Error('Check-in is only allowed during REGISTRATION status');
  }
  const player = tournament.players.find(p => p.publicPlayerId === publicPlayerId);
  if (!player) {
    throw new Error(`Player ${publicPlayerId} is not registered`);
  }
  if (player.checkedIn) {
    throw new Error(`Player ${publicPlayerId} is already checked in`);
  }
  const now = new Date().toISOString();
  const players = tournament.players.map(p =>
    p.publicPlayerId === publicPlayerId
      ? { ...p, checkedIn: true, checkedInAt: now }
      : p
  );
  return { ...tournament, players };
}

/**
 * Withdraw a player from registration. Only allowed during
 * SCHEDULED or REGISTRATION status. Remaining players are re-seeded
 * (1-based, preserving original registration order). Returns a new
 * tournament without the withdrawn player.
 *
 * @param {TournamentDefinition} tournament
 * @param {string} publicPlayerId - PLY_xxx of the player to withdraw
 * @returns {TournamentDefinition} New tournament with player removed and seeds re-assigned
 * @throws {Error} If tournament is not in SCHEDULED or REGISTRATION status
 * @throws {Error} If the player is not registered
 */
export function withdrawPlayer(tournament, publicPlayerId) {
  if (
    tournament.status !== TournamentStatus.SCHEDULED &&
    tournament.status !== TournamentStatus.REGISTRATION
  ) {
    throw new Error('Withdrawal is only allowed during SCHEDULED or REGISTRATION status');
  }
  const player = tournament.players.find(p => p.publicPlayerId === publicPlayerId);
  if (!player) {
    throw new Error(`Player ${publicPlayerId} is not registered`);
  }
  const remaining = tournament.players
    .filter(p => p.publicPlayerId !== publicPlayerId)
    .map((p, i) => ({ ...p, seed: i + 1 }));
  return { ...tournament, players: remaining };
}

/**
 * Get all players who have checked in.
 *
 * @param {TournamentDefinition} tournament
 * @returns {TournamentPlayer[]} Array of checked-in players
 */
export function getCheckedInPlayers(tournament) {
  return tournament.players.filter(p => p.checkedIn === true);
}

/**
 * Start a tournament using only checked-in players. Non-checked-in
 * registered players are removed from the bracket. Throws if fewer
 * than 2 players have checked in. Generates matches from checked-in
 * players only (sorted by seed), then transitions to IN_PROGRESS.
 *
 * @param {TournamentDefinition} tournament
 * @returns {TournamentDefinition} New tournament with matches from checked-in players
 * @throws {Error} If tournament is not in REGISTRATION status
 * @throws {Error} If fewer than 2 players are checked in
 */
export function startTournamentWithCheckIn(tournament) {
  if (tournament.status !== TournamentStatus.REGISTRATION) {
    throw new Error('Tournament must be in REGISTRATION status to start');
  }
  const checkedIn = getCheckedInPlayers(tournament);
  if (checkedIn.length < 2) {
    throw new Error('At least 2 checked-in players required');
  }

  // Keep only checked-in players, re-seed by original seed order
  const kept = checkedIn
    .slice()
    .sort((a, b) => a.seed - b.seed)
    .map((p, i) => ({ ...p, seed: i + 1 }));

  const tid = tournament.tournamentId || 'TR';
  let matches;
  if (tournament.format === TournamentFormat.SINGLE_ELIM) {
    matches = generateSingleElimBracket(kept, tournament.bestOf, tid);
  } else {
    // Swiss: first round pairs by seed (1v2, 3v4, etc.)
    matches = [];
    for (let i = 0; i < kept.length; i += 2) {
      const a = kept[i];
      const b = kept[i + 1];
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
    players: kept,
    matches,
  };
}

// ─────────────────────────────────────────────────────────────────
// Audit infrastructure
// ─────────────────────────────────────────────────────────────────

/**
 * Create a structured audit entry with an ISO timestamp.
 *
 * @param {string} action - One of TournamentAuditAction
 * @param {string} tournamentId - TR_xxx
 * @param {Object} details
 * @param {string|null} [details.matchId=null] - Affected match ID
 * @param {string} details.operatorAccountId - Admin performing the action
 * @param {string} details.reason - Justification for the correction
 * @param {*} [details.before=null] - State snapshot before the change
 * @param {*} [details.after=null] - State snapshot after the change
 * @returns {TournamentAuditEntry}
 */
export function createAuditEntry(action, tournamentId, {
  matchId = null,
  operatorAccountId,
  reason,
  before = null,
  after = null,
} = {}) {
  return {
    action,
    tournamentId,
    matchId,
    operatorAccountId,
    timestamp: new Date().toISOString(),
    reason: String(reason ?? ''),
    before: before ?? null,
    after: after ?? null,
  };
}

/**
 * Append an audit entry to a tournament's audit log immutably.
 * Returns a new tournament with the entry appended.
 *
 * @param {TournamentDefinition} tournament
 * @param {TournamentAuditEntry} entry
 * @returns {TournamentDefinition}
 * @private
 */
function appendAuditEntry(tournament, entry) {
  const auditLog = [...(tournament.auditLog ?? []), entry];
  return { ...tournament, auditLog };
}

// ─────────────────────────────────────────────────────────────────
// Admin corrections
// ─────────────────────────────────────────────────────────────────

/**
 * Admin-correct a match result. Only allowed when the tournament is
 * IN_PROGRESS. The previous result is preserved in the audit entry's
 * `before` field. Returns the updated tournament and audit entry.
 *
 * @param {TournamentDefinition} tournament
 * @param {string} matchId - TM_xxx of the match to correct
 * @param {string} newWinnerId - PLY_xxx of the corrected winner
 * @param {number} newScoreA - Corrected score for player A
 * @param {number} newScoreB - Corrected score for player B
 * @param {string} operatorAccountId - Admin performing the correction
 * @param {string} reason - Justification
 * @returns {{ tournament: TournamentDefinition, auditEntry: TournamentAuditEntry }}
 * @throws {Error} If tournament is not IN_PROGRESS
 * @throws {Error} If the match is not found
 * @throws {Error} If the match is not COMPLETED
 */
export function adminCorrectResult(tournament, matchId, newWinnerId, newScoreA, newScoreB, operatorAccountId, reason) {
  if (tournament.status !== TournamentStatus.IN_PROGRESS) {
    throw new Error('Result correction is only allowed when tournament is IN_PROGRESS');
  }
  const match = tournament.matches.find(m => m.matchId === matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }
  if (match.status !== TournamentMatchStatus.COMPLETED) {
    throw new Error('Can only correct a completed match');
  }

  const before = structuredClone(match);
  const after = {
    ...match,
    status: TournamentMatchStatus.COMPLETED,
    winnerId: newWinnerId,
    scoreA: newScoreA,
    scoreB: newScoreB,
  };

  const matches = tournament.matches.map(m =>
    m.matchId === matchId ? after : m
  );

  const auditEntry = createAuditEntry(
    TournamentAuditAction.CORRECT_RESULT,
    tournament.tournamentId,
    {
      matchId,
      operatorAccountId,
      reason,
      before,
      after: structuredClone(after),
    }
  );

  const updated = appendAuditEntry({ ...tournament, matches }, auditEntry);
  return { tournament: updated, auditEntry };
}

/**
 * Admin-disqualify a player. All of the disqualified player's pending
 * matches become BYEs for the opponent. Completed matches involving
 * the player are voided (reverted to PENDING with results cleared).
 * Returns the updated tournament and audit entry.
 *
 * @param {TournamentDefinition} tournament
 * @param {string} publicPlayerId - PLY_xxx of the player to disqualify
 * @param {string} operatorAccountId - Admin performing the DQ
 * @param {string} reason - Justification
 * @returns {{ tournament: TournamentDefinition, auditEntry: TournamentAuditEntry }}
 * @throws {Error} If the player is not registered
 */
export function adminDisqualifyPlayer(tournament, publicPlayerId, operatorAccountId, reason) {
  const player = tournament.players.find(p => p.publicPlayerId === publicPlayerId);
  if (!player) {
    throw new Error(`Player ${publicPlayerId} is not registered`);
  }

  const before = structuredClone(tournament.matches);
  const matches = tournament.matches.map(m => {
    const involvesPlayer = m.playerAId === publicPlayerId || m.playerBId === publicPlayerId;
    if (!involvesPlayer) return m;

    if (m.status === TournamentMatchStatus.COMPLETED) {
      // Void the completed match — clear result, revert to PENDING
      return {
        ...m,
        status: TournamentMatchStatus.PENDING,
        winnerId: null,
        scoreA: null,
        scoreB: null,
        matchRef: null,
      };
    }

    if (
      m.status === TournamentMatchStatus.SCHEDULED ||
      m.status === TournamentMatchStatus.PENDING ||
      m.status === TournamentMatchStatus.IN_PROGRESS
    ) {
      // Pending/in-progress match becomes a BYE for the opponent
      const opponentId = m.playerAId === publicPlayerId ? m.playerBId : m.playerAId;
      if (opponentId) {
        return {
          ...m,
          playerAId: opponentId,
          playerBId: null,
          status: TournamentMatchStatus.BYE,
          winnerId: opponentId,
          scoreA: null,
          scoreB: null,
          matchRef: null,
        };
      }
      // No opponent — just void
      return {
        ...m,
        status: TournamentMatchStatus.PENDING,
        winnerId: null,
        scoreA: null,
        scoreB: null,
        matchRef: null,
      };
    }

    return m;
  });

  // Mark the player as disqualified
  const players = tournament.players.map(p =>
    p.publicPlayerId === publicPlayerId
      ? { ...p, disqualified: true, disqualifiedAt: new Date().toISOString() }
      : p
  );

  const after = structuredClone(matches);
  const auditEntry = createAuditEntry(
    TournamentAuditAction.DISQUALIFY,
    tournament.tournamentId,
    {
      matchId: null,
      operatorAccountId,
      reason,
      before,
      after,
    }
  );

  const updated = appendAuditEntry({ ...tournament, players, matches }, auditEntry);
  return { tournament: updated, auditEntry };
}

/**
 * Admin-void a match result. The match reverts to PENDING status with
 * all result fields cleared. Returns the updated tournament and audit
 * entry.
 *
 * @param {TournamentDefinition} tournament
 * @param {string} matchId - TM_xxx of the match to void
 * @param {string} operatorAccountId - Admin performing the void
 * @param {string} reason - Justification
 * @returns {{ tournament: TournamentDefinition, auditEntry: TournamentAuditEntry }}
 * @throws {Error} If the match is not found
 */
export function adminVoidMatch(tournament, matchId, operatorAccountId, reason) {
  const match = tournament.matches.find(m => m.matchId === matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  const before = structuredClone(match);
  const after = {
    ...match,
    status: TournamentMatchStatus.PENDING,
    winnerId: null,
    scoreA: null,
    scoreB: null,
    matchRef: null,
  };

  const matches = tournament.matches.map(m =>
    m.matchId === matchId ? after : m
  );

  const auditEntry = createAuditEntry(
    TournamentAuditAction.VOID_MATCH,
    tournament.tournamentId,
    {
      matchId,
      operatorAccountId,
      reason,
      before,
      after: structuredClone(after),
    }
  );

  const updated = appendAuditEntry({ ...tournament, matches }, auditEntry);
  return { tournament: updated, auditEntry };
}

/**
 * Get the tournament's audit log. Returns an empty array if no audit
 * log has been initialized.
 *
 * @param {TournamentDefinition} tournament
 * @returns {TournamentAuditEntry[]}
 */
export function getAuditLog(tournament) {
  return tournament.auditLog ?? [];
}
