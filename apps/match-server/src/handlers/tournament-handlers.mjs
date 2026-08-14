// ═══════════════════════════════════════════════════════════════
// handlers/tournament-handlers.mjs — Tournament WebSocket handlers
//
// Server-side tournament infrastructure for human tournaments.
// Manages tournament state, registration, bracket progression,
// and result reporting. Tournament match execution reuses the
// existing match-handlers flow — this module handles tournament
// lifecycle.
//
// Handlers:
//   TOURNAMENT_LIST         — List tournaments (any authenticated user)
//   TOURNAMENT_GET          — Get tournament details (any authenticated user)
//   TOURNAMENT_REGISTER     — Register the authenticated player
//   TOURNAMENT_START        — Start bracket generation (operator-only)
//   TOURNAMENT_REPORT_RESULT— Record a bracket match result (operator-only)
//
// Persistence:
//   Production: SupabaseTournamentRepository (DB-backed)
//   Dev/test:   InMemoryTournamentRepository (Map-backed)
//
// Authorization:
//   TOURNAMENT_START and TOURNAMENT_REPORT_RESULT require the
//   connection's accountId to be in the operatorAccountIds set.
//   Other handlers require only authentication.
// ═══════════════════════════════════════════════════════════════

import {
  registerPlayer,
  startTournament,
  recordTournamentResult,
  TournamentStatus,
} from '@intrilex/account-domain/tournament-domain';
import {
  validateTournamentList,
  validateTournamentGet,
  validateTournamentRegister,
  validateTournamentStart,
  validateTournamentReportResult,
  ReasonCode,
  error as errorMsg,
} from '@intrilex/network-protocol';

/**
 * Create the tournament handlers context.
 * @param {Object} ctx
 * @param {Map} ctx.connections - connectionId → connection object
 * @param {object} ctx.tournamentRepository - TournamentRepository instance
 * @param {Set<string>} [ctx.operatorAccountIds] - Set of account IDs allowed to start/report
 * @param {Function} ctx.send
 * @param {Function} ctx.logEvent
 * @returns {Object}
 */
export function createTournamentHandlers(ctx) {
  const {
    connections,
    tournamentRepository,
    operatorAccountIds = new Set(),
    send,
    logEvent,
  } = ctx;

  // ── Helper: get authenticated account from connection ──
  function getAccount(connectionId) {
    const conn = connections.get(connectionId);
    if (!conn || !conn.account) return null;
    return conn.account;
  }

  // ── Helper: check operator authorization ──
  function isOperator(account) {
    if (!account) return false;
    return operatorAccountIds.has(account.accountId);
  }

  // ── Helper: build a safe public tournament view ──
  function buildPublicView(tournament) {
    return {
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      bestOf: tournament.bestOf,
      maxPlayers: tournament.maxPlayers,
      createdAt: tournament.createdAt,
      startedAt: tournament.startedAt,
      completedAt: tournament.completedAt,
      players: tournament.players.map(p => ({
        publicPlayerId: p.publicPlayerId,
        displayName: p.displayName,
        handle: p.handle,
        seed: p.seed,
      })),
      matches: tournament.matches.map(m => ({
        matchId: m.matchId,
        round: m.round,
        playerAId: m.playerAId,
        playerBId: m.playerBId,
        status: m.status,
        winnerId: m.winnerId,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
      })),
      swissRounds: tournament.swissRounds,
    };
  }

  // ── Helper: build a tournament summary ──
  function buildSummary(t) {
    return {
      tournamentId: t.tournamentId,
      name: t.name,
      format: t.format,
      status: t.status,
      bestOf: t.bestOf,
      maxPlayers: t.maxPlayers,
      registeredPlayers: t.players.length,
      createdAt: t.createdAt,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    };
  }

  // ── TOURNAMENT_LIST ──
  async function handleTournamentList(connectionId, ws, payload, requestId) {
    const check = validateTournamentList(payload ?? {});
    if (!check.valid) {
      return send(ws, errorMsg(check.code, check.message, requestId));
    }
    const status = payload?.status ?? null;
    const limit = Math.min(Math.max(payload?.limit ?? 20, 1), 100);
    try {
      const tournaments = await tournamentRepository.list(status, limit);
      const summaries = tournaments.map(buildSummary);
      send(ws, {
        type: 'TOURNAMENT_LIST',
        requestId: requestId ?? undefined,
        payload: { tournaments: summaries, count: summaries.length },
      });
      logEvent('tournament_list', { connectionId, status, count: summaries.length });
    } catch (err) {
      logEvent('tournament_list_error', { connectionId, error: err?.message });
      send(ws, errorMsg('TOURNAMENT_LIST_FAILED', 'Failed to list tournaments', requestId));
    }
  }

  // ── TOURNAMENT_GET ──
  async function handleTournamentGet(connectionId, ws, payload, requestId) {
    const check = validateTournamentGet(payload ?? {});
    if (!check.valid) {
      return send(ws, errorMsg(check.code, check.message, requestId));
    }
    try {
      const tournament = await tournamentRepository.get(payload.tournamentId);
      if (!tournament) {
        return send(ws, errorMsg('TOURNAMENT_NOT_FOUND', 'Tournament not found', requestId));
      }
      send(ws, {
        type: 'TOURNAMENT_VIEW',
        requestId: requestId ?? undefined,
        payload: { tournament: buildPublicView(tournament) },
      });
      logEvent('tournament_get', { connectionId, tournamentId: tournament.tournamentId });
    } catch (err) {
      logEvent('tournament_get_error', { connectionId, error: err?.message });
      send(ws, errorMsg('TOURNAMENT_GET_FAILED', 'Failed to get tournament', requestId));
    }
  }

  // ── TOURNAMENT_REGISTER ──
  async function handleTournamentRegister(connectionId, ws, payload, requestId) {
    const check = validateTournamentRegister(payload ?? {});
    if (!check.valid) {
      return send(ws, errorMsg(check.code, check.message, requestId));
    }
    const account = getAccount(connectionId);
    if (!account) {
      return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required to register', requestId));
    }
    try {
      const tournament = await tournamentRepository.get(payload.tournamentId);
      if (!tournament) {
        return send(ws, errorMsg('TOURNAMENT_NOT_FOUND', 'Tournament not found', requestId));
      }
      const updated = registerPlayer(tournament, {
        publicPlayerId: account.publicPlayerId,
        displayName: account.displayName ?? 'Player',
        handle: account.handle ?? null,
        userId: account.accountId,
      });
      await tournamentRepository.save(updated);
      const seed = updated.players.find(p => p.publicPlayerId === account.publicPlayerId)?.seed;
      send(ws, {
        type: 'TOURNAMENT_REGISTERED',
        requestId: requestId ?? undefined,
        payload: {
          tournamentId: updated.tournamentId,
          seed,
          registeredPlayers: updated.players.length,
          maxPlayers: updated.maxPlayers,
        },
      });
      logEvent('tournament_register', {
        connectionId,
        tournamentId: updated.tournamentId,
        publicPlayerId: account.publicPlayerId,
        seed,
      });
    } catch (err) {
      send(ws, errorMsg('TOURNAMENT_REGISTRATION_FAILED', err.message, requestId));
      logEvent('tournament_register_failed', {
        connectionId,
        tournamentId: payload.tournamentId,
        error: err.message,
      });
    }
  }

  // ── TOURNAMENT_START (operator-only) ──
  async function handleTournamentStart(connectionId, ws, payload, requestId) {
    const check = validateTournamentStart(payload ?? {});
    if (!check.valid) {
      return send(ws, errorMsg(check.code, check.message, requestId));
    }
    const account = getAccount(connectionId);
    if (!account) {
      return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required', requestId));
    }
    if (!isOperator(account)) {
      logEvent('tournament_start_unauthorized', { connectionId, accountId: account.accountId });
      return send(ws, errorMsg('TOURNAMENT_OPERATOR_ONLY', 'Only tournament operators may start tournaments', requestId));
    }
    try {
      const tournament = await tournamentRepository.get(payload.tournamentId);
      if (!tournament) {
        return send(ws, errorMsg('TOURNAMENT_NOT_FOUND', 'Tournament not found', requestId));
      }
      const updated = startTournament(tournament);
      await tournamentRepository.save(updated);
      send(ws, {
        type: 'TOURNAMENT_STARTED',
        requestId: requestId ?? undefined,
        payload: {
          tournamentId: updated.tournamentId,
          status: updated.status,
          matchCount: updated.matches.length,
          startedAt: updated.startedAt,
        },
      });
      logEvent('tournament_start', {
        connectionId,
        tournamentId: updated.tournamentId,
        matchCount: updated.matches.length,
      });
    } catch (err) {
      send(ws, errorMsg('TOURNAMENT_START_FAILED', err.message, requestId));
      logEvent('tournament_start_failed', {
        connectionId,
        tournamentId: payload.tournamentId,
        error: err.message,
      });
    }
  }

  // ── TOURNAMENT_REPORT_RESULT (operator-only) ──
  async function handleTournamentReportResult(connectionId, ws, payload, requestId) {
    const check = validateTournamentReportResult(payload ?? {});
    if (!check.valid) {
      return send(ws, errorMsg(check.code, check.message, requestId));
    }
    const account = getAccount(connectionId);
    if (!account) {
      return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required', requestId));
    }
    if (!isOperator(account)) {
      logEvent('tournament_report_unauthorized', { connectionId, accountId: account.accountId });
      return send(ws, errorMsg('TOURNAMENT_OPERATOR_ONLY', 'Only tournament operators may report results', requestId));
    }
    try {
      const tournament = await tournamentRepository.get(payload.tournamentId);
      if (!tournament) {
        return send(ws, errorMsg('TOURNAMENT_NOT_FOUND', 'Tournament not found', requestId));
      }
      const updated = recordTournamentResult(
        tournament,
        payload.matchId,
        payload.winnerId,
        payload.scoreA ?? 0,
        payload.scoreB ?? 0,
        payload.matchRef ?? null,
      );
      await tournamentRepository.save(updated);
      const isComplete = updated.status === TournamentStatus.COMPLETED;
      send(ws, {
        type: 'TOURNAMENT_RESULT_RECORDED',
        requestId: requestId ?? undefined,
        payload: {
          tournamentId: updated.tournamentId,
          matchId: payload.matchId,
          winnerId: payload.winnerId,
          scoreA: payload.scoreA ?? 0,
          scoreB: payload.scoreB ?? 0,
          tournamentComplete: isComplete,
          tournamentStatus: updated.status,
        },
      });
      logEvent('tournament_result_reported', {
        connectionId,
        tournamentId: updated.tournamentId,
        matchId: payload.matchId,
        winnerId: payload.winnerId,
        tournamentComplete: isComplete,
      });
    } catch (err) {
      send(ws, errorMsg('TOURNAMENT_REPORT_FAILED', err.message, requestId));
      logEvent('tournament_report_failed', {
        connectionId,
        tournamentId: payload.tournamentId,
        matchId: payload.matchId,
        error: err.message,
      });
    }
  }

  return {
    handleTournamentList,
    handleTournamentGet,
    handleTournamentRegister,
    handleTournamentStart,
    handleTournamentReportResult,
  };
}
