// ═══════════════════════════════════════════════════════════════
// season-service.mjs — Ranked season lifecycle service
//
// Resolves the active season, lists seasons, and provides an idempotent
// season-finalization procedure (section 48). Season transitions use the
// canonical Glicko-2 soft-reset (increase RD) — never a destructive
// hard reset (section 21).
// ═══════════════════════════════════════════════════════════════

import {
  SeasonStatus,
  RANKED_QUEUE_ID,
  applySeasonSoftReset,
  activeSeasonForQueue,
  countActiveSeasons,
} from '@intrilex/account-domain';

/**
 * In-memory season provider for tests/dev (no DB). Production uses the
 * Supabase-backed provider via the persistor/leaderboard repository.
 */
export class InMemorySeasonProvider {
  /**
   * @param {Array<object>} [seasons]
   */
  constructor(seasons = []) {
    this._seasons = [...seasons];
  }

  /** @param {object} season */
  addSeason(season) { this._seasons.push(season); }

  /**
   * @param {string} queueId
   * @returns {Promise<object|null>}
   */
  async getActiveSeason(queueId) {
    return activeSeasonForQueue(this._seasons, queueId);
  }

  /**
   * @param {string} queueId
   * @returns {Promise<object[]>}
   */
  async listSeasons(queueId) {
    return this._seasons.filter(s => s.queueId === queueId);
  }

  /** @param {string} seasonId @param {string} status */
  async setStatus(seasonId, status) {
    const s = this._seasons.find(x => x.seasonId === seasonId);
    if (s) s.status = status;
  }
}

export class SeasonService {
  /**
   * @param {object} provider - season provider (InMemory or DB-backed)
   * @param {object} [logger]
   */
  constructor(provider, logger = console) {
    this._provider = provider;
    this._logger = logger;
  }

  /**
   * Resolve the active season id for a queue.
   * @param {string} [queueId]
   * @returns {Promise<string>}
   */
  async resolveActiveSeasonId(queueId = RANKED_QUEUE_ID) {
    const season = await this._provider.getActiveSeason(queueId);
    // IRX-H07: Return null when no active season exists. The caller must
    // handle this (downgrade ranked to casual, or abort). Never fabricate.
    return season?.seasonId ?? null;
  }

  /**
   * List seasons for a picker.
   * @param {string} [queueId]
   * @returns {Promise<object[]>}
   */
  async listSeasons(queueId = RANKED_QUEUE_ID) {
    return this._provider.listSeasons(queueId);
  }

  /**
   * Validate the single-active-season invariant.
   * @param {string} [queueId]
   * @returns {Promise<number>} count of active seasons (must be 0 or 1)
   */
  async invariantActiveSeasonCount(queueId = RANKED_QUEUE_ID) {
    const seasons = await this._provider.listSeasons(queueId);
    return countActiveSeasons(seasons, queueId);
  }

  /**
   * Compute the soft-reset state for a season transition (section 21).
   * Non-destructive: increases RD, preserves rating + volatility.
   * @param {Object} state - { rating, ratingDeviation, volatility }
   * @returns {Object}
   */
  computeTransitionState(state) {
    return applySeasonSoftReset(state);
  }

  /**
   * Idempotent season finalization (section 48). This is a high-level
   * orchestration outline; the actual snapshot writes are performed by
   * the persistor/DB layer. Returns a structured result. Re-finalizing
   * an already-archived season is a safe no-op.
   *
   * @param {string} seasonId
   * @param {Object} [finalizeOpts] - injected finalize functions for DB writes
   * @returns {Promise<{ seasonId: string, finalized: boolean, alreadyArchived: boolean }>}
   */
  async finalizeSeason(seasonId, finalizeOpts = {}) {
    const seasons = await this._provider.listSeasons(RANKED_QUEUE_ID);
    const season = seasons.find(s => s.seasonId === seasonId);
    if (!season) return { seasonId, finalized: false, alreadyArchived: false };

    // Idempotency: already archived → no-op
    if (season.status === SeasonStatus.ARCHIVED) {
      return { seasonId, finalized: false, alreadyArchived: true };
    }

    // 1. Mark finalizing (stop new rated matches)
    await this._provider.setStatus(seasonId, SeasonStatus.FINALIZING);

    // 2-3. Process terminal matches + snapshot standings.
    // If either hook throws, roll back to ACTIVE so the season can continue
    // and finalization can be retried — never leave a season stuck in FINALIZING.
    try {
      if (typeof finalizeOpts.processPendingMatches === 'function') {
        await finalizeOpts.processPendingMatches(seasonId);
      }
      if (typeof finalizeOpts.snapshotStandings === 'function') {
        await finalizeOpts.snapshotStandings(seasonId);
      }
    } catch (err) {
      await this._provider.setStatus(seasonId, SeasonStatus.ACTIVE);
      this._log('seasonFinalizeFailed', { seasonId, error: err?.message ?? String(err) });
      return { seasonId, finalized: false, alreadyArchived: false, error: err?.message ?? 'finalize hook failed' };
    }

    // 4. Mark archived
    await this._provider.setStatus(seasonId, SeasonStatus.ARCHIVED);

    // 5. Activate next season (caller-provided hook).
    // If this fails, the season is correctly archived but the next one isn't
    // active — log the error for operator intervention but don't roll back.
    if (typeof finalizeOpts.activateNextSeason === 'function') {
      try {
        await finalizeOpts.activateNextSeason(seasonId);
      } catch (err) {
        this._log('seasonActivateNextFailed', { seasonId, error: err?.message ?? String(err) });
      }
    }

    this._log('seasonFinalized', { seasonId });
    return { seasonId, finalized: true, alreadyArchived: false };
  }

  /** @param {string} event @param {object} data */
  _log(event, data) {
    if (this._logger && typeof this._logger.debug === 'function') {
      this._logger.debug({ event, ...data });
    }
  }
}
