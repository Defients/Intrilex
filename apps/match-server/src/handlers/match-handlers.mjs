// ═══════════════════════════════════════════════════════════════
// match-handlers.mjs — Match lifecycle handlers
//
// Extracted from server.mjs to reduce file size and improve testability.
// Receives a context object with shared server state and helper callbacks.
//
// Handlers:
//   - handleCreateMatch:   Create a new match and bind the creator as P1
//   - handleJoinMatch:     Join an existing match via invite code
//   - handleResumeMatch:   Reconnect to a disconnected match session
//   - handleReady:         Mark a participant as ready and start if both ready
//   - handleSubmitAction:  Submit a game action to the authoritative session
//   - handleRequestSync:   Request a fresh match view
//   - handleLeaveMatch:    Leave a match and notify the opponent
//
// Security:
//   - Connection-match binding checks before match lookup (v0.24.2)
//   - Participant token validation on all privileged operations
//   - Self-join prevention (same account cannot occupy both seats)
//   - IRX-H19: Block checker on join
//   - IRX-H20: Token rotation on reconnect
//   - IRX-H10: Pending forfeit timer cancellation on reconnect
//   - Spectators cannot submit actions
// ═══════════════════════════════════════════════════════════════

import { randomBytes } from 'node:crypto';
import {
  validateCreateMatch, validateJoinMatch, validateResumeMatch,
  validateSubmitAction, validateReady, validateRequestSync, validateLeaveMatch,
  validateRematch,
  ReasonCode,
  matchCreated, matchJoined, matchView, actionResult,
  participantStatus, matchStarted, error as errorMsg,
  rematchInvite,
  envelope,
} from '@intrilex/network-protocol';
import { createAuthoritativeMatch } from '@intrilex/match-authority';
import { buildNetworkPlayerView } from '@intrilex/match-authority/player-projection';
import { AuthMode } from '@intrilex/account-domain';

/**
 * @typedef {Object} MatchHandlerContext
 * @property {Map<string, object>} connections - connectionId → connection state
 * @property {() => import('@intrilex/match-authority').InMemoryMatchStore | import('@intrilex/match-authority').SqliteMatchStore} getMatchStore - accessor for the active match store
 * @property {() => string} getAuthMode - accessor for the active auth mode
 * @property {() => Function | null} getBlockChecker - accessor for the block-check function
 * @property {Map<string, {timer: object, forfeitingParticipantId: string}>} pendingForfeits - matchId → pending forfeit
 * @property {number} maxMatches - server match capacity
 * @property {(conn: object) => object} buildPublicProfile - build a public profile from a connection
 * @property {(payload: object) => object} classifyMatchForCreate - classify match mode/queue from payload
 * @property {(participantId: string, matchId: string, excludeConnectionId?: string) => object|null} findConnectionByParticipant - find a connection by participant ID
 * @property {(participantId: string, matchId: string, newConnectionId: string) => void} supersedeOldConnection - supersede an old connection for a participant
 * @property {(match: object) => Promise<void>} broadcastMatchEnded - broadcast match end to both participants
 * @property {(match: object) => void} broadcastToSpectators - broadcast match view to spectators
 * @property {(ws: object, msg: object) => void} send - send a JSON message to a WebSocket
 * @property {(event: string, data?: object) => void} logEvent - structured log emitter
 */

/**
 * Create match lifecycle handlers bound to the given server context.
 *
 * @param {MatchHandlerContext} ctx
 * @returns {{ handleCreateMatch: Function, handleJoinMatch: Function, handleResumeMatch: Function, handleReady: Function, handleSubmitAction: Function, handleRequestSync: Function, handleLeaveMatch: Function }}
 */
export function createMatchHandlers(ctx) {
  const {
    connections, getMatchStore, getAuthMode, getBlockChecker,
    pendingForfeits, maxMatches,
    buildPublicProfile, classifyMatchForCreate,
    findConnectionByParticipant, supersedeOldConnection,
    broadcastMatchEnded, broadcastToSpectators,
    send, logEvent,
  } = ctx;

  // ── Invite code generation ──
  const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  async function handleCreateMatch(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    if (matchStore.count >= maxMatches) {
      return send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Server at match capacity', requestId));
    }

    // Prevent conflicting bindings — one connection cannot create/join/queue simultaneously
    const existingConn = connections.get(connectionId);
    if (existingConn && (existingConn.participantId || existingConn.isSpectator)) {
      return send(ws, errorMsg(ReasonCode.MATCH_ALREADY_JOINED, 'Connection already bound to a match or spectating', requestId));
    }

    const check = validateCreateMatch(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    // C3i: If a targetAccountId is specified (challenge flow), check block status
    // before creating the match. This prevents creating invite codes for players
    // who have blocked you.
    const conn = connections.get(connectionId);
    if (payload.targetAccountId && conn?.account?.accountId) {
      const blockChecker = getBlockChecker();
      if (blockChecker) {
        const blocked = await blockChecker(conn.account.accountId, payload.targetAccountId);
        if (blocked) {
          logEvent('blockCreateRejected', { creator: conn.account.accountId, target: payload.targetAccountId });
          return send(ws, errorMsg(ReasonCode.BLOCKED_BY_PLAYER, 'Cannot create a match with this player', requestId));
        }
      }
    }

    const matchId = `M-${randomBytes(12).toString('base64url')}`;
    const participantToken = randomBytes(32).toString('base64url');
    const participantId = `P-${randomBytes(8).toString('base64url')}`;
    const seed = randomBytes(4).readUInt32BE(0);

    // Generate a unique 6-character invite code (uppercase alphanumeric)
    // 36^6 ≈ 2.2B possibilities — sufficient for invite-alpha
    // Retry on collision — never overwrite an existing invite mapping
    let inviteCode;
    let attempts = 0;
    do {
      inviteCode = Array.from(randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      attempts++;
      if (attempts > 10) {
        return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, 'Failed to generate unique invite code', requestId));
      }
    } while (matchStore.findByInviteCode(inviteCode));

    const match = createAuthoritativeMatch({
      matchId,
      profileId: payload.profileId,
      seed,
      // RANK-01: Server-owned match classification — client may request a
      // queue, but the server validates and creates authoritative classification.
      ...classifyMatchForCreate(payload),
    });

    // Bind connection to participant (conn was already retrieved above for block check)
    match.addParticipant(participantId, participantToken, conn?.account?.accountId ?? null, buildPublicProfile(conn));
    matchStore.save(match);
    matchStore.registerInvite(inviteCode, matchId);

    conn.participantId = participantId;
    conn.matchId = matchId;

    send(ws, matchCreated(matchId, inviteCode, participantToken, requestId));
    logEvent('matchCreate', { matchId, profileId: payload.profileId, matchMode: match.matchMode, queueId: match.queueId, accountId: conn?.account?.accountId ?? null });
  }

  async function handleJoinMatch(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    // Prevent conflicting bindings
    const existingConn = connections.get(connectionId);
    if (existingConn && (existingConn.participantId || existingConn.isSpectator)) {
      return send(ws, errorMsg(ReasonCode.MATCH_ALREADY_JOINED, 'Connection already bound to a match or spectating', requestId));
    }

    const check = validateJoinMatch(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const match = matchStore.findByInviteCode(payload.inviteCode);
    if (!match) {
      return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Invalid invite code', requestId));
    }
    if (match.participants.size >= 2) {
      return send(ws, errorMsg(ReasonCode.MATCH_FULL, 'Match is full', requestId));
    }

    // Prevent self-join: same account cannot occupy both seats (when auth enabled)
    const conn = connections.get(connectionId);
    const joinerAccountId = conn?.account?.accountId ?? null;
    if (joinerAccountId) {
      for (const [, p] of match.participants) {
        if (p.accountId === joinerAccountId) {
          return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_MISMATCH, 'Cannot join your own match', requestId));
        }
        // IRX-H19: Check if either player has blocked the other
        const blockChecker = getBlockChecker();
        if (blockChecker && p.accountId) {
          const blocked = await blockChecker(joinerAccountId, p.accountId);
          if (blocked) {
            logEvent('blockJoinRejected', { matchId: match.matchId, joiner: joinerAccountId, existing: p.accountId });
            return send(ws, errorMsg(ReasonCode.BLOCKED_BY_PLAYER, 'Cannot join a match with this player', requestId));
          }
        }
      }
    }

    const participantToken = randomBytes(32).toString('base64url');
    const participantId = `P-${randomBytes(8).toString('base64url')}`;

    const result = match.addParticipant(participantId, participantToken, joinerAccountId, buildPublicProfile(conn));
    matchStore.save(match);

    // Bind connection
    conn.participantId = participantId;
    conn.matchId = match.matchId;

    send(ws, matchJoined(match.matchId, participantToken, result.playerId, requestId));
    logEvent('matchJoin', { matchId: match.matchId, participantId, accountId: joinerAccountId });

    // Notify the opponent (P1) that P2 has connected, AND notify P2 of the
    // opponent's (P1's) current connection state. Without the latter, P2's
    // lobby UI stays stuck on "Waiting for opponent…" even though P1 is
    // already in the lobby — because P2 never receives a PARTICIPANT_STATUS
    // for P1.
    const opponentId = [...match.participants.keys()].find(pid => pid !== participantId);
    if (opponentId) {
      const opponentParticipant = match.participants.get(opponentId);
      const opponentConnState = opponentParticipant?.connectionState ?? 'DISCONNECTED';

      // Tell P1 that P2 connected
      const oppConn = findConnectionByParticipant(opponentId, match.matchId);
      if (oppConn) {
        send(oppConn.ws, participantStatus(match.matchId, {
          participantId,
          status: 'CONNECTED',
        }));
      }

      // Tell P2 about P1's current connection state
      send(ws, participantStatus(match.matchId, {
        participantId: opponentId,
        status: opponentConnState,
      }));
    }
  }

  function handleResumeMatch(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    const check = validateResumeMatch(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const match = matchStore.get(payload.matchId);
    if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

    const participantId = match.findParticipantByToken(payload.participantToken);
    if (!participantId) return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));

    // ── Account-bound reconnect security ──
    // When auth is enabled, the verified accountId must match the participant's accountId.
    // A stolen participant token alone cannot be reused by an unrelated authenticated account.
    const conn = connections.get(connectionId);
    const participant = match.participants.get(participantId);
    const reconnectAccountId = conn?.account?.accountId ?? null;
    if (getAuthMode() === AuthMode.REQUIRED && reconnectAccountId && participant?.accountId) {
      if (reconnectAccountId !== participant.accountId) {
        logEvent('authFailure', { connectionId, code: 'AUTH_ACCOUNT_MISMATCH', reason: 'reconnect' });
        return send(ws, errorMsg(ReasonCode.AUTH_ACCOUNT_MISMATCH, 'This match belongs to another Intrilex account', requestId));
      }
    }

    // Bind new connection FIRST, then supersede old — eliminates the race window
    // where neither connection is bound during reconnection.
    conn.participantId = participantId;
    conn.matchId = match.matchId;

    // Supersede old connection for this participant (now safe — new conn is bound)
    supersedeOldConnection(participantId, match.matchId, connectionId);

    match.reconnectParticipant(participantId);
    matchStore.save(match);

    // IRX-H10: Cancel any pending forfeit timer for this match
    const pendingForfeit = pendingForfeits.get(match.matchId);
    if (pendingForfeit) {
      clearTimeout(pendingForfeit.timer);
      pendingForfeits.delete(match.matchId);
      logEvent('forfeitTimerCancelled', { matchId: match.matchId, participantId });
    }

    // IRX-H20: Rotate the participant token on successful reconnect.
    // This prevents replay attacks — a stolen token can only be used once.
    // The old token's hash is overwritten, so any subsequent reconnect attempt
    // with the old token will fail validation. The new token is sent to the
    // reconnecting client via the MATCH_VIEW response.
    const newToken = match.rotateParticipantToken(participantId);
    matchStore.save(match);

    // Send fresh view with the rotated token
    const view = match.getAuthorizedView(participantId);
    const safeView = buildNetworkPlayerView(view);
    send(ws, matchView(match.matchId, safeView, requestId, newToken));
    logEvent('reconnect', { matchId: match.matchId, participantId, accountId: reconnectAccountId, tokenRotated: true });

    // Notify the opponent that this participant has reconnected.
    // Without this, the opponent's UI stays stuck on "Opponent disconnected"
    // even after the player successfully reconnects.
    const opponentId = [...match.participants.keys()].find(pid => pid !== participantId);
    if (opponentId) {
      const oppConn = findConnectionByParticipant(opponentId, match.matchId);
      if (oppConn) {
        send(oppConn.ws, participantStatus(match.matchId, {
          participantId,
          status: 'CONNECTED',
        }));
      }
    }
  }

  function handleReady(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    const check = validateReady(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const conn = connections.get(connectionId);
    // v0.24.2: Defense-in-depth — connection must be bound to this match.
    // Check BEFORE match lookup so a fake matchId can't bypass the binding.
    if (conn.matchId !== payload.matchId) {
      return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
    }

    const match = matchStore.get(payload.matchId);
    if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

    if (!match.validateToken(conn.participantId, payload.participantToken)) {
      return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
    }

    match.setReady(conn.participantId);

    // If all ready, start the match
    if (match.allReady() && match.status === 'READY_CHECK') {
      match.start();
      matchStore.save(match);
      logEvent('matchStart', { matchId: match.matchId, profileId: match.profileId });

      // Broadcast MATCH_STARTED to both participants
      for (const [pid, p] of match.participants) {
        const view = match.getAuthorizedView(pid);
        const safeView = buildNetworkPlayerView(view);
        const targetConn = findConnectionByParticipant(pid, match.matchId);
        if (targetConn) {
          send(targetConn.ws, matchStarted(match.matchId, safeView));
        }
      }
    }
    matchStore.save(match);

    // Send current view
    const view = match.getAuthorizedView(conn.participantId);
    const safeView = buildNetworkPlayerView(view);
    send(ws, matchView(match.matchId, safeView, requestId));

    // Notify spectators if any
    broadcastToSpectators(match);
  }

  async function handleSubmitAction(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    // Spectators cannot submit actions — reject before any validation or match access
    const conn = connections.get(connectionId);
    if (conn?.isSpectator) {
      return send(ws, errorMsg(ReasonCode.PARTICIPANT_NOT_AUTHORIZED, 'Spectators cannot submit actions', requestId));
    }

    const check = validateSubmitAction(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    // v0.24.2: Defense-in-depth — connection must be bound to this match.
    // Check BEFORE match lookup so a fake matchId can't bypass the binding.
    if (conn.matchId !== payload.matchId) {
      return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
    }

    const match = matchStore.get(payload.matchId);
    if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

    if (!match.validateToken(conn.participantId, payload.participantToken)) {
      return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
    }

    const result = await match.submitAction(conn.participantId, {
      clientCommandId: payload.clientCommandId,
      expectedRevision: payload.expectedRevision,
      decisionFrameHash: payload.decisionFrameHash,
      actionId: payload.actionId,
    });

    // Send result to the actor
    const actorView = match.getAuthorizedView(conn.participantId);
    const safeActorView = buildNetworkPlayerView(actorView);
    // E4: Enrich rejection with action introspection (detailed explanation + rule ref)
    let introspection = null;
    if (!result.accepted && result.reasonCode) {
      try {
        const { introspectAction } = await import('@intrilex/engine-adapter/action-introspection');
        // Build a minimal adapter-like object from the match session's legal action frame.
        // The introspection module only needs adapter.legalActions(state) to check legality.
        const engineState = match.getAuthoritativeState?.();
        const legalFrame = match.legalActionFrame ?? [];
        if (engineState) {
          const miniAdapter = { legalActions: () => legalFrame };
          const actionObj = { id: payload.actionId, type: payload.actionId };
          const intro = introspectAction(engineState, actionObj, miniAdapter);
          introspection = { shortText: intro.shortText, detailedText: intro.detailedText, ruleRef: intro.ruleRef };
        }
      } catch { /* introspection is optional enrichment — fail silently */ }
    }
    send(ws, actionResult(match.matchId, {
      accepted: result.accepted,
      reasonCode: result.reasonCode ?? null,
      error: result.error ?? null,
      view: safeActorView,
      introspection: introspection,
    }, requestId));
    logEvent(result.accepted ? 'actionSubmit' : 'actionReject', { matchId: match.matchId, participantId: conn.participantId, reasonCode: result.reasonCode ?? null });

    // If accepted, send updated view to the opponent
    if (result.accepted) {
      matchStore.save(match);

      const opponentId = [...match.participants.keys()].find(pid => pid !== conn.participantId);
      if (opponentId) {
        const oppView = match.getAuthorizedView(opponentId);
        const safeOppView = buildNetworkPlayerView(oppView);
        const oppConn = findConnectionByParticipant(opponentId, match.matchId);
        if (oppConn) {
          send(oppConn.ws, matchView(match.matchId, safeOppView));
        }
      }

      // If terminal, send MATCH_ENDED to both
      if (match.status === 'TERMINAL') {
        await broadcastMatchEnded(match);
        logEvent('matchEnd', { matchId: match.matchId, winner: match.winner, reason: match.terminalReason });
      }

      // Notify spectators of the state change
      broadcastToSpectators(match);
    }
  }

  function handleRequestSync(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    const check = validateRequestSync(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const conn = connections.get(connectionId);
    // v0.24.2: Defense-in-depth — connection must be bound to this match.
    // Check BEFORE match lookup so a fake matchId can't bypass the binding.
    if (conn.matchId !== payload.matchId) {
      return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
    }

    const match = matchStore.get(payload.matchId);
    if (!match) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

    if (!match.validateToken(conn.participantId, payload.participantToken)) {
      return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
    }

    const view = match.getAuthorizedView(conn.participantId);
    const safeView = buildNetworkPlayerView(view);
    send(ws, matchView(match.matchId, safeView, requestId));
  }

  function handleLeaveMatch(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    const check = validateLeaveMatch(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const conn = connections.get(connectionId);
    // v0.24.2: Defense-in-depth — connection must be bound to this match.
    // Check BEFORE match lookup so a fake matchId can't bypass the binding.
    // This prevents a stale/malicious payload from disconnecting a participant
    // from a different match than the one their connection is bound to.
    if (conn.matchId !== payload.matchId) {
      return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
    }

    const match = matchStore.get(payload.matchId);

    // v0.24.2: Authenticate the participant token before disconnecting.
    // Previously, LEAVE_MATCH accepted a participantToken in validation but
    // the handler never checked it — any connection could leave any match
    // by simply knowing the matchId.
    if (match && conn) {
      if (!match.validateToken(conn.participantId, payload.participantToken)) {
        return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));
      }

      match.disconnectParticipant(conn.participantId);
      matchStore.save(match);

      // Notify opponent
      const opponentId = [...match.participants.keys()].find(pid => pid !== conn.participantId);
      if (opponentId) {
        const oppConn = findConnectionByParticipant(opponentId, match.matchId);
        if (oppConn) {
          send(oppConn.ws, participantStatus(match.matchId, {
            participantId: conn.participantId,
            status: 'DISCONNECTED',
          }));
        }
      }
    }

    conn.participantId = null;
    conn.matchId = null;
    // Send a LEFT_MATCH acknowledgment, not an ERROR with code 'OK'
    send(ws, envelope('LEFT_MATCH', { matchId: payload.matchId }, requestId));
  }

  // ── Rematch: create a new match with the same opponent ──

  function handleRematch(connectionId, ws, payload, requestId) {
    const matchStore = getMatchStore();
    const check = validateRematch(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const conn = connections.get(connectionId);
    // Connection must be bound to the completed match
    if (conn.matchId !== payload.matchId) {
      return send(ws, errorMsg(ReasonCode.CONNECTION_MATCH_MISMATCH, 'Connection is not bound to this match', requestId));
    }

    const oldMatch = matchStore.get(payload.matchId);
    if (!oldMatch) return send(ws, errorMsg(ReasonCode.MATCH_NOT_FOUND, 'Match not found', requestId));

    // Validate participant token
    const participantId = oldMatch.findParticipantByToken(payload.participantToken);
    if (!participantId) return send(ws, errorMsg(ReasonCode.AUTH_TOKEN_INVALID, 'Invalid participant token', requestId));

    // Match must be terminal
    if (oldMatch.status !== 'TERMINAL') {
      return send(ws, errorMsg(ReasonCode.MATCH_NOT_RUNNING, 'Rematch only available for completed matches', requestId));
    }

    // Find the opponent and verify they're still connected
    const opponentId = [...oldMatch.participants.keys()].find(pid => pid !== participantId);
    if (!opponentId) return send(ws, errorMsg(ReasonCode.MATCH_FULL, 'No opponent in this match', requestId));

    const oppConn = findConnectionByParticipant(opponentId, payload.matchId);
    if (!oppConn) {
      return send(ws, errorMsg(ReasonCode.PARTICIPANT_DISCONNECTED, 'Opponent is no longer connected', requestId));
    }

    // Check server capacity
    if (matchStore.count >= maxMatches) {
      return send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Server at match capacity', requestId));
    }

    // Create the new match with the same profile and queue classification
    const newMatchId = `M-${randomBytes(12).toString('base64url')}`;
    const newParticipantToken = randomBytes(32).toString('base64url');
    const newParticipantId = `P-${randomBytes(8).toString('base64url')}`;
    const seed = randomBytes(4).readUInt32BE(0);

    // Generate invite code
    let inviteCode;
    let attempts = 0;
    do {
      inviteCode = Array.from(randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      attempts++;
      if (attempts > 10) {
        return send(ws, errorMsg(ReasonCode.INTERNAL_ERROR, 'Failed to generate unique invite code', requestId));
      }
    } while (matchStore.findByInviteCode(inviteCode));

    // Classify the new match using the old match's profile + queue
    const classification = classifyMatchForCreate({
      profileId: oldMatch.profileId,
      queueId: oldMatch.queueId,
    });

    const newMatch = createAuthoritativeMatch({
      matchId: newMatchId,
      profileId: oldMatch.profileId,
      seed,
      ...classification,
    });

    // Bind the requester as P1 in the new match
    newMatch.addParticipant(newParticipantId, newParticipantToken, conn?.account?.accountId ?? null, buildPublicProfile(conn));
    matchStore.save(newMatch);
    matchStore.registerInvite(inviteCode, newMatchId);

    // Unbind the requester from the old match and bind to the new one
    conn.participantId = newParticipantId;
    conn.matchId = newMatchId;

    // Send MATCH_CREATED to the requester
    send(ws, matchCreated(newMatchId, inviteCode, newParticipantToken, requestId));
    logEvent('rematchCreate', { fromMatchId: payload.matchId, newMatchId, profileId: oldMatch.profileId, matchMode: newMatch.matchMode, queueId: newMatch.queueId, initiatedBy: participantId });

    // Send REMATCH_INVITE to the opponent
    const requesterProfile = oldMatch.participants.get(participantId);
    const fromDisplayName = requesterProfile?.publicProfile?.displayName ?? 'Opponent';
    send(oppConn.ws, rematchInvite(payload.matchId, newMatchId, inviteCode, fromDisplayName));
    logEvent('rematchInvite', { fromMatchId: payload.matchId, newMatchId, inviteCode, sentTo: opponentId });
  }

  return {
    handleCreateMatch, handleJoinMatch, handleResumeMatch,
    handleReady, handleSubmitAction, handleRequestSync, handleLeaveMatch,
    handleRematch,
  };
}
