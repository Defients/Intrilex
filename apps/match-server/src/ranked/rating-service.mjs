// ═══════════════════════════════════════════════════════════════
// rating-service.mjs — Server-authoritative Rated result application
//
// Orchestrates the idempotent application of a terminal Ranked match
// result to persistent competitive state. The browser is never
// authoritative (section 3). This service:
//   1. rejects non-Ranked / non-terminal / self-match / anonymous results
//   2. delegates to the persistor (which gates on matchId idempotency)
//   3. emits safe structured observability events (section 104)
//
// Idempotency (section 39/94): the persistor's isMatchPersisted gate +
// the rating_events UNIQUE(match_id, user_id) constraint guarantee a
// reconnect/retry/replay cannot apply rating twice.
// ═══════════════════════════════════════════════════════════════

import { RANKED_QUEUE_ID } from '@intrilex/account-domain';

/**
 * Queues/match types that may NEVER affect Ranked rating (section 40).
 */
const NON_RATED_QUEUES = new Set(['casual', 'private', 'tutorial', 'simulation', 'local-ai']);

export class RatingService {
  /**
   * @param {object} opts
   * @param {import('../persistence/match-result-persistor.mjs').MatchResultPersistor} opts.persistor
   * @param {object} [opts.logger]
   */
  constructor({ persistor, logger = console }) {
    if (!persistor) throw new Error('RatingService: persistor is required');
    this._persistor = persistor;
    this._logger = logger;
  }

  /**
   * Determine whether a match result is eligible to be rated.
   * @param {import('../persistence/match-result-persistor.mjs').MatchResultRecord} record
   * @returns {{ eligible: boolean, reason: string|null }}
   */
  static isRateable(record) {
    if (!record) return { eligible: false, reason: 'no-record' };
    if (record.status !== 'COMPLETED') return { eligible: false, reason: `status:${record.status}` };
    const queueId = record.queueId ?? 'casual';
    if (queueId !== RANKED_QUEUE_ID) return { eligible: false, reason: `queue:${queueId}` };
    const rated = (record.participants ?? []).filter(p => p.accountId && p.ratingAfter !== null);
    if (rated.length !== 2) return { eligible: false, reason: 'not-two-rated-accounts' };
    const [a, b] = rated;
    if (a.accountId === b.accountId) return { eligible: false, reason: 'self-match' };
    return { eligible: true, reason: null };
  }

  /**
   * Apply a terminal match result to persistent competitive state.
   * Idempotent: re-applying the same matchId is a safe no-op.
   * @param {import('../persistence/match-result-persistor.mjs').MatchResultRecord} record
   * @returns {Promise<{ success: boolean, alreadyPersisted: boolean, rated: boolean, reason: string|null, error: string|null }>}
   */
  async applyRatedResult(record) {
    const check = RatingService.isRateable(record);
    if (!check.eligible && record?.queueId !== RANKED_QUEUE_ID) {
      // Non-ranked matches are still persisted (for history) but not rated.
      // The caller persists via the persistor directly; this service only
      // rates Ranked matches. For non-ranked, return rated=false.
      this._log('ratingUpdateRejectedNotRanked', { matchId: record?.matchId, reason: check.reason });
      return { success: true, alreadyPersisted: false, rated: false, reason: check.reason, error: null };
    }
    // IRX-H08: If a RANKED record fails eligibility (self-match, anonymous,
    // not-two-rated-accounts, non-COMPLETED), REJECT it entirely. Do NOT
    // persist it as a ranked match — an ineligible ranked record must never
    // enter account truth. Previously, such records fell through to
    // persistMatchResult and were stored as ranked matches without rating
    // updates, polluting match history with invalid ranked results.
    if (!check.eligible && record?.queueId === RANKED_QUEUE_ID) {
      this._log('rankedResultRejectedIneligible', { matchId: record?.matchId, reason: check.reason });
      return { success: false, alreadyPersisted: false, rated: false, reason: check.reason, error: `Ineligible ranked result rejected: ${check.reason}` };
    }

    // Persist (the persistor is the idempotency gate + writes rating state).
    const result = await this._persistor.persistMatchResult(record);

    if (!result.success) {
      this._log('ratingUpdateFailed', { matchId: record.matchId, error: result.error });
      return { success: false, alreadyPersisted: false, rated: false, reason: null, error: result.error };
    }

    if (result.alreadyPersisted) {
      this._log('ratingUpdateRejectedDuplicate', { matchId: record.matchId });
      return { success: true, alreadyPersisted: true, rated: false, reason: 'duplicate', error: null };
    }

    // Emit per-participant observability (safe fields only — no tokens/uuid in logs)
    for (const p of record.participants) {
      if (!p.accountId || p.ratingAfter === null) continue;
      this._log('ratingUpdated', {
        matchId: record.matchId,
        seasonId: record.seasonId,
        queueId: record.queueId,
        result: p.result,
        ratingBefore: p.ratingBefore,
        ratingAfter: p.ratingAfter,
        ratingDelta: p.ratingDelta,
      });
      if (p.ratingAfter > (p.ratingBefore ?? 0)) {
        this._log('seasonPeakUpdated', { matchId: record.matchId, seasonId: record.seasonId, ratingAfter: p.ratingAfter });
      }
    }
    this._log('rankedResultApplied', { matchId: record.matchId, seasonId: record.seasonId, queueId: record.queueId });

    return { success: true, alreadyPersisted: false, rated: true, reason: null, error: null };
  }

  /** @param {string} event @param {object} data */
  _log(event, data) {
    if (this._logger && typeof this._logger.debug === 'function') {
      this._logger.debug({ event, ...data });
    }
  }
}

export { NON_RATED_QUEUES };
