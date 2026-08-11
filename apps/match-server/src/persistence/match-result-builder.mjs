// ═══════════════════════════════════════════════════════════════
// match-result-builder.mjs — Builds MatchResultRecord from a terminal match
//
// Pure function — extracts data from AuthoritativeMatchSession and
// computes rating updates using the Elo system from account-domain.
// Does NOT write to any database — returns the record for the persistor.
// ═══════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import {
  computeRatingUpdate,
  deriveOutcome,
  initialRatingState,
  DEFAULT_RATING,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  RANKED_QUEUE_ID,
} from '@intrilex/account-domain';
import { ENGINE_VERSION, RULES_VERSION } from '@intrilex/engine-adapter';
import { MatchStatus } from '@intrilex/match-authority';

/**
 * @typedef {import('./match-result-persistor.mjs').MatchResultRecord} MatchResultRecord
 * @typedef {import('./match-result-persistor.mjs').MatchParticipantRecord} MatchParticipantRecord
 */

/**
 * Build a MatchResultRecord from a terminal AuthoritativeMatchSession.
 *
 * This function:
 *   1. Extracts participant data (accountId, seat, result)
 *   2. Fetches current rating state via the persistor
 *   3. Computes Elo rating updates
 *   4. Returns a complete record ready for persistMatchResult()
 *
 * @param {object} opts
 * @param {import('@intrilex/match-authority').AuthoritativeMatchSession} opts.match - Terminal match
 * @param {import('./match-result-persistor.mjs').MatchResultPersistor} opts.persistor - For fetching current ratings
 * @param {string} [opts.queueId='casual'] - 'casual' or 'ranked'
 * @param {string} [opts.serverVersion] - Intrilex version string
 * @param {boolean} [opts.isAborted=false] - Whether the match was aborted (no rating change)
 * @returns {Promise<MatchResultRecord | null>} null if match is not terminal or has no rated participants
 */
export async function buildMatchResultRecord({ match, persistor, queueId = 'casual', serverVersion, isAborted = false, seasonId }) {
  if (match.status !== MatchStatus.TERMINAL && match.status !== MatchStatus.ABORTED && match.status !== MatchStatus.EXPIRED) {
    return null;
  }

  const participants = [...match.participants.values()];
  if (participants.length === 0) return null;

  // Resolve the active season for rated queues (server-authoritative, never
  // browser-derived). For casual queues the season is irrelevant to rating.
  let resolvedSeasonId = seasonId;
  if (!resolvedSeasonId && persistor && typeof persistor.resolveActiveSeasonId === 'function' && queueId === RANKED_QUEUE_ID) {
    try {
      resolvedSeasonId = await persistor.resolveActiveSeasonId(queueId);
    } catch {
      resolvedSeasonId = 'season-1';
    }
  }
  if (!resolvedSeasonId) resolvedSeasonId = 'season-1';

  // Sort by seat (P1 first, P2 second) for deterministic ordering
  const sorted = participants.sort((a, b) => a.playerId.localeCompare(b.playerId));

  // Determine match status for the DB
  const dbStatus = isAborted || match.status === MatchStatus.ABORTED
    ? 'ABORTED'
    : match.status === MatchStatus.EXPIRED
      ? 'EXPIRED'
      : 'COMPLETED';

  // Compute replay hash (same as broadcastMatchEnded)
  const replay = match.getReplay();
  const replayHash = replay
    ? createHash('sha256').update(JSON.stringify(replay)).digest('hex')
    : null;

  // Determine winner userId
  let winnerUserId = null;
  if (dbStatus === 'COMPLETED' && match.winner) {
    const winnerParticipant = sorted.find(p => p.playerId === match.winner);
    winnerUserId = winnerParticipant?.accountId ?? null;
  }

  // Build participant records
  /** @type {MatchParticipantRecord[]} */
  const participantRecords = [];

  if (dbStatus === 'COMPLETED' && sorted.length === 2) {
    // Rated match — compute Elo updates
    const [p1, p2] = sorted;

    // Both must have accountIds to be rated
    if (p1.accountId && p2.accountId && p1.accountId !== p2.accountId) {
      // Fetch current rating states (including Glicko-2 RD/volatility)
      const [state1, state2] = await Promise.all([
        persistor.getRatingState(p1.accountId, queueId, resolvedSeasonId),
        persistor.getRatingState(p2.accountId, queueId, resolvedSeasonId),
      ]);

      const playerA = state1
        ? { accountId: p1.accountId, rating: state1.rating, ratingDeviation: state1.ratingDeviation, volatility: state1.volatility, ratedMatches: state1.ratedMatches, provisional: state1.provisional }
        : initialRatingState(p1.accountId);
      const playerB = state2
        ? { accountId: p2.accountId, rating: state2.rating, ratingDeviation: state2.ratingDeviation, volatility: state2.volatility, ratedMatches: state2.ratedMatches, provisional: state2.provisional }
        : initialRatingState(p2.accountId);

      const outcome = deriveOutcome(match.winner, p1.playerId, p2.playerId);

      if (outcome) {
        const update = computeRatingUpdate({ playerA, playerB, outcome });

        // DATA-02: Truthful before/after provenance — use the PRE-update
        // state (playerA.ratingDeviation, playerA.volatility) for *Before
        // fields, and the POST-update result (update.playerA.ratingDeviation,
        // update.playerA.volatility) for *After fields. Previously both
        // before and after were set to the post-update value, falsifying
        // the provenance record.
        participantRecords.push({
          accountId: p1.accountId,
          participantId: [...match.participants.keys()].find(k => match.participants.get(k) === p1) ?? 'unknown',
          seat: p1.playerId,
          result: update.playerA.result,
          ratingBefore: update.playerA.ratingBefore,
          ratingAfter: update.playerA.ratingAfter,
          ratingDelta: update.playerA.ratingDelta,
          rdBefore: playerA.ratingDeviation,
          rdAfter: update.playerA.ratingDeviation,
          volatilityBefore: playerA.volatility,
          volatilityAfter: update.playerA.volatility,
        });
        participantRecords.push({
          accountId: p2.accountId,
          participantId: [...match.participants.keys()].find(k => match.participants.get(k) === p2) ?? 'unknown',
          seat: p2.playerId,
          result: update.playerB.result,
          ratingBefore: update.playerB.ratingBefore,
          ratingAfter: update.playerB.ratingAfter,
          ratingDelta: update.playerB.ratingDelta,
          rdBefore: playerB.ratingDeviation,
          rdAfter: update.playerB.ratingDeviation,
          volatilityBefore: playerB.volatility,
          volatilityAfter: update.playerB.volatility,
        });
      } else {
        // Inconclusive outcome — record without rating changes
        for (const p of sorted) {
          participantRecords.push({
            accountId: p.accountId,
            participantId: [...match.participants.keys()].find(k => match.participants.get(k) === p) ?? 'unknown',
            seat: p.playerId,
            result: 'DRAW',
            ratingBefore: null,
            ratingAfter: null,
            ratingDelta: null,
          });
        }
      }
    } else {
      // One or both players are anonymous — record without rating changes
      for (const p of sorted) {
        participantRecords.push({
          accountId: p.accountId,
          participantId: [...match.participants.keys()].find(k => match.participants.get(k) === p) ?? 'unknown',
          seat: p.playerId,
          result: match.winner === p.playerId ? 'WIN' : match.winner === null ? 'DRAW' : 'LOSS',
          ratingBefore: null,
          ratingAfter: null,
          ratingDelta: null,
        });
      }
    }
  } else {
    // Aborted/expired — record with ABORT result
    for (const p of sorted) {
      participantRecords.push({
        accountId: p.accountId,
        participantId: [...match.participants.keys()].find(k => match.participants.get(k) === p) ?? 'unknown',
        seat: p.playerId,
        result: 'ABORT',
        ratingBefore: null,
        ratingAfter: null,
        ratingDelta: null,
      });
    }
  }

  return {
    matchId: match.matchId,
    rulesProfileId: match.profileId,
    status: /** @type {'COMPLETED'|'ABORTED'|'EXPIRED'} */ (dbStatus),
    startedAt: match.createdAt ?? Date.now(),
    endedAt: match.updatedAt ?? Date.now(),
    terminationReason: match.terminalReason,
    winnerUserId,
    replayHash,
    serverVersion: serverVersion ?? '0.27.0',
    rulesVersion: RULES_VERSION ?? 'unknown',
    participants: participantRecords,
    queueId,
    seasonId: resolvedSeasonId,
  };
}
