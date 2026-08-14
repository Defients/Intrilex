// ═══════════════════════════════════════════════════════════════
// spectator-handlers.mjs — Spectator mode handlers
//
// Extracted from server.mjs to reduce file size and improve testability.
// Receives a context object with shared server state and helpers.
//
// Handlers:
//   - handleSpectateMatch:  Attach a connection as a spectator to a match
//   - handleSpectateLeave:  Detach a connection from spectating
//   - broadcastToSpectators: Push a neutral match view to all spectators
//
// Security:
//   - Spectators never see either player's hand, private decisions, legal
//     actions, command IDs, RNG state, seed, tokens, or role-private data.
//   - Private matches reject spectators (IRX-M19).
//   - Spectator count is capped at MAX_SPECTATORS_PER_MATCH per match.
//   - Spectators cannot submit actions (enforced in handleMessage auth gate).
// ═══════════════════════════════════════════════════════════════

import {
  validateSpectateMatch, validateSpectateLeave, validateListSpectatable,
  ReasonCode,
  matchView, spectateJoined, spectateLeft, spectatableList,
  error as errorMsg,
} from '@intrilex/network-protocol';
import { buildSpectatorView } from '@intrilex/match-authority/player-projection';

/**
 * @typedef {Object} SpectatorHandlerContext
 * @property {Map<string, object>} connections - connectionId → connection state
 * @property {() => import('@intrilex/match-authority').InMemoryMatchStore | import('@intrilex/match-authority').SqliteMatchStore} getMatchStore - accessor for the active match store
 * @property {number} maxSpectatorsPerMatch - spectator cap per match
 * @property {() => string} getAuthMode - accessor for the active auth mode
 * @property {(ws: object, msg: object) => void} send - send a JSON message to a WebSocket
 * @property {(event: string, data?: object) => void} logEvent - structured log emitter
 */

/**
 * Create spectator handlers bound to the given server context.
 *
 * @param {SpectatorHandlerContext} ctx
 * @returns {{ handleSpectateMatch: Function, handleSpectateLeave: Function, broadcastToSpectators: Function }}
 */
export function createSpectatorHandlers(ctx) {
  const { connections, getMatchStore, maxSpectatorsPerMatch, getAuthMode, send, logEvent } = ctx;

  /**
   * Handle SPECTATE_MATCH — attach a connection as a spectator to a running match.
   *
   * Security checks:
   *   - Match must exist and be RUNNING or TERMINAL
   *   - Private matches reject spectators (IRX-M19) — returns MATCH_NOT_FOUND to avoid leaking existence
   *   - Spectator count cap enforced per match
   *   - Spectator view is neutralized via buildSpectatorView (no hands, legal actions, seed, RNG, tokens)
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string, *>} payload
   * @param {string} requestId
   */
  function handleSpectateMatch(connectionId, ws, payload, requestId) {
    const check = validateSpectateMatch(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    // IRX-M19+: Defense-in-depth — require authentication for spectating
    // when auth mode is 'required'. The handleMessage auth gate already
    // blocks unauthenticated SPECTATE_MATCH, but this check ensures the
    // spectator handler is safe even if called from a different dispatch path.
    if (getAuthMode() === 'required') {
      const conn = connections.get(connectionId);
      if (!conn || conn.authState !== 'AUTHENTICATED') {
        logEvent('spectateAuthRequired', { connectionId });
        return send(ws, errorMsg(ReasonCode.AUTH_REQUIRED, 'Authentication required to spectate', requestId));
      }
    }

    const matchStore = getMatchStore();
    const match = matchStore.get(payload.matchId);
    if (!match) {
      return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));
    }

    // Only allow spectating if the match has started (RUNNING or TERMINAL)
    if (match.status !== 'RUNNING' && match.status !== 'TERMINAL') {
      return send(ws, errorMsg(ReasonCode.MATCH_NOT_RUNNING, 'Match is not running', requestId));
    }

    // IRX-M19: Reject spectators for private matches.
    // Private matches require explicit invitation — no spectator consent exists yet.
    if (match.matchMode === 'private') {
      return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));
    }

    // Enforce spectator count limit per match
    let spectatorCount = 0;
    for (const c of connections.values()) {
      if (c.isSpectator && c.spectatingMatchId === payload.matchId) spectatorCount++;
    }
    if (spectatorCount >= maxSpectatorsPerMatch) {
      return send(ws, errorMsg(ReasonCode.QUEUE_FULL, 'Spectator limit reached for this match', requestId));
    }

    const conn = connections.get(connectionId);
    conn.isSpectator = true;
    conn.spectatingMatchId = payload.matchId;

    // Send a spectate-joined message with a NEUTRAL spectator view.
    // Spectators never see either player's hand, private decisions, legal actions,
    // command IDs, RNG state, seed, tokens, or role-private engine data.
    const view = match.getAuthorizedView([...match.participants.keys()][0]);
    const safeView = buildSpectatorView(view);
    send(ws, spectateJoined(payload.matchId, safeView, requestId));
    logEvent('spectateJoin', { matchId: payload.matchId, spectatorCount: spectatorCount + 1 });
  }

  /**
   * Handle SPECTATE_LEAVE — detach a connection from spectating.
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string, *>} payload
   * @param {string} requestId
   */
  function handleSpectateLeave(connectionId, ws, payload, requestId) {
    const check = validateSpectateLeave(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const conn = connections.get(connectionId);
    if (!conn || !conn.isSpectator) {
      return send(ws, errorMsg(ReasonCode.NOT_IN_QUEUE, 'Not spectating', requestId));
    }

    // v0.24.2 fix: capture matchId BEFORE nulling the field for correct logging
    const spectatingMatchId = conn.spectatingMatchId;
    conn.isSpectator = false;
    conn.spectatingMatchId = null;
    send(ws, spectateLeft(requestId));
    logEvent('spectateLeave', { matchId: spectatingMatchId });
  }

  /**
   * Broadcast a neutral match view to all spectators of a match.
   * Called after state changes (action submissions, ready transitions, etc.)
   * to keep spectator views in sync.
   *
   * @param {import('@intrilex/match-authority').AuthoritativeMatchSession} match
   */
  function broadcastToSpectators(match) {
    if (!match) return;
    // Spectators receive a NEUTRAL view — no player hands, legal actions, or private data
    const view = match.getAuthorizedView([...match.participants.keys()][0]);
    const safeView = buildSpectatorView(view);

    for (const [cid, conn] of connections) {
      if (conn.isSpectator && conn.spectatingMatchId === match.matchId) {
        send(conn.ws, matchView(match.matchId, safeView));
      }
    }
  }

  /**
   * Handle LIST_SPECTATABLE — return a list of matches available for spectating.
   * Only includes RUNNING, non-private matches with spectator capacity remaining.
   * Each entry contains: matchId, profileId, participant display names,
   * spectator count, match mode, and queue ID.
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string,*>} payload
   * @param {string} requestId
   */
  function handleListSpectatable(connectionId, ws, payload, requestId) {
    const check = validateListSpectatable(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const matchStore = getMatchStore();
    // Use listMatches to get RUNNING matches (bounded by limit=20)
    const runningSummaries = matchStore.listMatches({ status: 'RUNNING', limit: 20 });
    const spectatable = [];

    for (const summary of runningSummaries) {
      const match = matchStore.get(summary.matchId);
      if (!match) continue;
      // Private matches are never spectatable
      if (match.matchMode === 'private') continue;

      // Count current spectators for this match
      let spectatorCount = 0;
      for (const c of connections.values()) {
        if (c.isSpectator && c.spectatingMatchId === match.matchId) spectatorCount++;
      }
      // Skip matches at spectator capacity
      if (spectatorCount >= maxSpectatorsPerMatch) continue;

      // Build participant display names
      const participants = [];
      for (const [, p] of match.participants) {
        participants.push({
          displayName: p.publicProfile?.displayName ?? 'Player',
        });
      }

      spectatable.push({
        matchId: match.matchId,
        profileId: match.profileId,
        participants,
        spectatorCount,
        matchMode: match.matchMode,
        queueId: match.queueId,
      });

      // Cap at 20 entries to keep the response bounded
      if (spectatable.length >= 20) break;
    }

    send(ws, spectatableList(spectatable, requestId));
    logEvent('listSpectatable', { count: spectatable.length });
  }

  return { handleSpectateMatch, handleSpectateLeave, broadcastToSpectators, handleListSpectatable };
}
