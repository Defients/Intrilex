// ═══════════════════════════════════════════════════════════════
// matchmaking-handlers.mjs — Public matchmaking queue handlers
//
// Extracted from server.mjs to reduce file size and improve testability.
// Receives a context object with shared server state and helpers.
//
// Handlers:
//   - handleQueueJoin:  Enqueue a player for public matchmaking
//   - handleQueueLeave: Remove a player from the matchmaking queue
//
// Security:
//   - Public matchmaking is disabled by default (invite-alpha)
//   - Server capacity check before enqueue
//   - accountId-based queue identity when auth is enabled (prevents multi-queue + self-match)
//   - IRX-H19: Block checker runs on immediate pairs — fail-closed on check error
//   - RANK-01: Client may request queueId, but server validates ranked admission
// ═══════════════════════════════════════════════════════════════

import {
  validateQueueJoin, validateQueueLeave,
  ReasonCode,
  queueJoined, queueLeft,
  error as errorMsg,
} from '@intrilex/network-protocol';
import { checkRankedEntryRequirements } from '@intrilex/account-domain/ranked-entry-requirements';

/**
 * @typedef {Object} MatchmakingHandlerContext
 * @property {Map<string, object>} connections - connectionId → connection state
 * @property {() => import('@intrilex/match-authority').InMemoryMatchStore | import('@intrilex/match-authority').SqliteMatchStore} getMatchStore - accessor for the active match store
 * @property {() => import('@intrilex/match-authority/matchmaking-queue').MatchmakingQueue | null} getMatchmakingQueue - accessor for the active queue
 * @property {() => Function | null} getBlockChecker - accessor for the block-check function
 * @property {() => boolean} getPublicMatchmaking - accessor for the public matchmaking feature flag
 * @property {number} maxMatches - server match capacity
 * @property {(ws: object, msg: object) => void} send - send a JSON message to a WebSocket
 * @property {(event: string, data?: object) => void} logEvent - structured log emitter
 */

/**
 * Create matchmaking handlers bound to the given server context.
 *
 * @param {MatchmakingHandlerContext} ctx
 * @returns {{ handleQueueJoin: Function, handleQueueLeave: Function }}
 */
export function createMatchmakingHandlers(ctx) {
  const { connections, getMatchStore, getMatchmakingQueue, getBlockChecker, getPublicMatchmaking, maxMatches, send, logEvent } = ctx;

  /**
   * Handle QUEUE_JOIN — enqueue a player for public matchmaking.
   *
   * If a partner is available, the queue pairs immediately and the
   * onCreateMatch callback (set up in startServer) sends QUEUE_MATCHED.
   * If no partner is available, sends QUEUE_JOINED with position + ETA.
   *
   * IRX-H19: If paired immediately and a blockChecker is configured,
   * checks if either player has blocked the other. Fail-closed on
   * block-check errors — the match is cancelled to protect the player.
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string, *>} payload
   * @param {string} requestId
   */
  async function handleQueueJoin(connectionId, ws, payload, requestId) {
    const check = validateQueueJoin(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    // Public matchmaking is disabled by default in v0.24.1 invite-alpha
    if (!getPublicMatchmaking()) {
      return send(ws, errorMsg(ReasonCode.QUEUE_FULL, 'Public matchmaking is disabled in invite-alpha', requestId));
    }

    const matchStore = getMatchStore();
    if (matchStore.count >= maxMatches) {
      return send(ws, errorMsg(ReasonCode.RATE_LIMITED, 'Server at match capacity', requestId));
    }

    const matchmakingQueue = getMatchmakingQueue();
    // Use accountId for queue identity when auth is enabled (prevents multi-queue abuse + self-match)
    const conn = connections.get(connectionId);
    const accountId = conn?.account?.accountId ?? null;

    // P9: Ranked entry requirements — validate eligibility before enqueueing
    const queueId = payload.queueId ?? null;
    if (queueId === 'ranked') {
      const entryCheck = checkRankedEntryRequirements({
        isAnonymous: !accountId || conn?.account?.isAnonymous === true,
        casualMatchesPlayed: conn?.account?.casualMatchesPlayed ?? 0,
        tutorialCompleted: conn?.account?.tutorialCompleted ?? false,
        isOperator: conn?.account?.isOperator === true,
      });
      if (!entryCheck.allowed) {
        return send(ws, errorMsg(ReasonCode.QUEUE_FULL, entryCheck.message, requestId));
      }
    }

    // RANK-01: Pass client-requested queueId — server validates ranked admission
    const result = matchmakingQueue.enqueue(connectionId, payload.profileId, accountId, queueId);
    if (!result.queued) {
      return send(ws, errorMsg(result.code || ReasonCode.INTERNAL_ERROR, result.error || 'Failed to join queue', requestId));
    }

    // IRX-H19: If paired immediately, check if either player has blocked the other.
    // If so, cancel the match and notify both players.
    const blockChecker = getBlockChecker();
    if (result.paired && blockChecker && accountId) {
      const pair = Array.isArray(result.paired) ? result.paired : [result.paired];
      const partnerConnId = pair.find(r => r.connectionId !== connectionId)?.connectionId;
      const partnerConn = partnerConnId ? connections.get(partnerConnId) : null;
      const partnerAccountId = partnerConn?.account?.accountId ?? null;
      if (partnerAccountId) {
        const matchId = pair[0]?.matchId;
        let blocked = false;
        try {
          blocked = await blockChecker(accountId, partnerAccountId);
        } catch (err) {
          // Block check failed — fail closed (treat as blocked so the match is cancelled)
          logEvent('blockQueueCheckError', { accountId, partnerAccountId, error: err?.message ?? String(err) });
          blocked = true;
        }
        if (blocked) {
          logEvent('blockQueuePairRejected', { accountId, partnerAccountId });
          // Notify both players that the match was cancelled due to a block.
          // Both already received QUEUE_MATCHED from onCreateMatch, so they must
          // be told the match is no longer valid.
          send(ws, errorMsg(ReasonCode.BLOCKED_BY_PLAYER, 'Matchmaking cancelled — cannot match with this player', requestId));
          if (partnerConnId && partnerConn?.ws) {
            send(partnerConn.ws, errorMsg(ReasonCode.BLOCKED_BY_PLAYER, 'Matchmaking cancelled — cannot match with this player'));
          }
          // Clean up the match that was just created and unbind both connections
          // so neither player is left with stale participant/match state pointing
          // at a deleted match.
          if (matchId && matchStore) {
            matchStore.delete(matchId);
          }
          for (const r of pair) {
            const c = connections.get(r.connectionId);
            if (c) { c.participantId = null; c.matchId = null; }
          }
          return;
        }
      }
    }

    // If paired immediately, the onCreateMatch callback already sent QUEUE_MATCHED
    if (!result.paired) {
      send(ws, queueJoined(result.position, result.estimatedWaitMs, requestId));
    }
  }

  /**
   * Handle QUEUE_LEAVE — remove a player from the matchmaking queue.
   *
   * @param {string} connectionId
   * @param {object} ws
   * @param {Record<string, *>} payload
   * @param {string} requestId
   */
  function handleQueueLeave(connectionId, ws, payload, requestId) {
    const check = validateQueueLeave(payload);
    if (!check.valid) return send(ws, errorMsg(check.code, check.message, requestId));

    const matchmakingQueue = getMatchmakingQueue();
    const result = matchmakingQueue.dequeue(connectionId);
    if (!result.removed) {
      return send(ws, errorMsg(ReasonCode.NOT_IN_QUEUE, 'Not in queue', requestId));
    }
    send(ws, queueLeft(requestId));
  }

  return { handleQueueJoin, handleQueueLeave };
}
