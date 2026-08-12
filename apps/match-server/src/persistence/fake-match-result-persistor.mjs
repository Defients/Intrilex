// ═══════════════════════════════════════════════════════════════
// fake-match-result-persistor.mjs — In-memory persistor for tests
//
// Stores all persisted results in arrays for inspection.
// Tracks Glicko-2 rating state per (accountId, queueId, seasonId) for
// deterministic testing. Idempotent: re-persisting the same matchId is a
// no-op that does NOT re-apply ratings (idempotency gate via _matches).
// Records rating_events, peak_rating, placements_played, last_rated_at.
// ═══════════════════════════════════════════════════════════════

import { MatchResultPersistor } from './match-result-persistor.mjs';
import {
  DEFAULT_RATING, DEFAULT_RATING_DEVIATION, DEFAULT_VOLATILITY,
  PLACEMENTS_REQUIRED, PROVISIONAL_THRESHOLD,
} from '@intrilex/account-domain';

export class FakeMatchResultPersistor extends MatchResultPersistor {
  constructor() {
    super();
    /** @type {Map<string, import('./match-result-persistor.mjs').MatchResultRecord>} */
    this._matches = new Map(); // matchId → record
    /** @type {Array<{ matchId: string, accountId: string, seat: string, result: string, ratingBefore: number|null, ratingAfter: number|null, ratingDelta: number|null }>} */
    this._participants = [];
    /** @type {Map<string, { rating: number, ratingDeviation: number, volatility: number, ratedMatches: number, provisional: boolean, placementsPlayed: number, peakRating: number, lastRatedAt: number|null, lastRatedMatchId: string|null }>} */
    this._ratings = new Map(); // `${accountId}:${queueId}:${seasonId}` → state
    /** @type {Map<string, { onlineMatches: number, onlineWins: number, onlineLosses: number, onlineDraws: number, rankedMatches: number, rankedWins: number, rankedLosses: number, currentWinStreak: number, bestWinStreak: number }>} */
    this._stats = new Map(); // accountId → stats
    /** @type {Array<{ matchId: string, userId: string, seasonId: string, ratingBefore: number, ratingAfter: number, ratingDelta: number, rdBefore: number, rdAfter: number, volatilityBefore: number, volatilityAfter: number, result: string, algorithmVersion: string, createdAt: number }>} */
    this._ratingEvents = [];
    /** @type {Set<string>} — `${accountId}:${achievementId}` for idempotency */
    this._achievements = new Set();
    /** @type {Array<{ accountId: string, achievementId: string, unlockedAt: string, provenance: string, matchId: string|null, rulesVersion: string|null, productVersion: string|null }>} */
    this._achievementRows = [];
    /** @type {Map<string, string>} — queueId → active seasonId */
    this._activeSeasons = new Map([['ranked', 'season-1'], ['casual', 'season-1']]);
  }

  /**
   * @param {string} accountId
   * @param {string} queueId
   * @param {string} [seasonId]
   * @returns {string}
   * @private
   */
  _key(accountId, queueId, seasonId) {
    return `${accountId}:${queueId}:${seasonId ?? 'season-1'}`;
  }

  /**
   * Pre-seed a rating state for a player (for testing specific rating scenarios).
   * @param {string} accountId
   * @param {string} queueId
   * @param {number} rating
   * @param {number} ratedMatches
   * @param {Object} [opts]
   * @param {number} [opts.ratingDeviation]
   * @param {number} [opts.volatility]
   * @param {number} [opts.peakRating]
   * @param {number} [opts.placementsPlayed]
   * @param {string} [opts.seasonId]
   */
  seedRating(accountId, queueId, rating, ratedMatches = 0, opts = {}) {
    const seasonId = opts.seasonId ?? 'season-1';
    const provisional = ratedMatches < PROVISIONAL_THRESHOLD;
    this._ratings.set(this._key(accountId, queueId, seasonId), {
      rating,
      ratingDeviation: opts.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
      volatility: opts.volatility ?? DEFAULT_VOLATILITY,
      ratedMatches,
      provisional,
      placementsPlayed: opts.placementsPlayed ?? Math.min(ratedMatches, PLACEMENTS_REQUIRED),
      peakRating: opts.peakRating ?? rating,
      lastRatedAt: null,
      lastRatedMatchId: null,
    });
  }

  async resolveActiveSeasonId(queueId) {
    return this._activeSeasons.get(queueId) ?? 'season-1';
  }

  /** Set the active season for a queue (test helper). */
  setActiveSeason(queueId, seasonId) {
    this._activeSeasons.set(queueId, seasonId);
  }

  async isMatchPersisted(matchId) {
    return this._matches.has(matchId);
  }

  /**
   * @param {string} accountId
   * @param {string} queueId
   * @param {string} [seasonId]
   */
  async getRatingState(accountId, queueId, seasonId) {
    const sid = seasonId ?? await this.resolveActiveSeasonId(queueId);
    return this._ratings.get(this._key(accountId, queueId, sid)) ?? null;
  }

  /**
   * @param {import('./match-result-persistor.mjs').MatchResultRecord} record
   */
  async persistMatchResult(record) {
    // Idempotency gate: if already persisted, return success without re-applying.
    if (this._matches.has(record.matchId)) {
      return { success: true, error: null, record, alreadyPersisted: true };
    }

    this._matches.set(record.matchId, record);

    const queueId = record.queueId ?? 'casual';
    const seasonId = record.seasonId ?? 'season-1';

    for (const p of record.participants) {
      // Store participant record
      this._participants.push({
        matchId: record.matchId,
        accountId: p.accountId,
        seat: p.seat,
        result: p.result,
        ratingBefore: p.ratingBefore,
        ratingAfter: p.ratingAfter,
        ratingDelta: p.ratingDelta,
      });

      // Skip rating/stats updates for anonymous (no accountId) or aborted matches
      if (!p.accountId || p.result === 'ABORT') continue;

      // Update rating state (Glicko-2)
      const key = this._key(p.accountId, queueId, seasonId);
      const current = this._ratings.get(key) ?? {
        rating: DEFAULT_RATING, ratingDeviation: DEFAULT_RATING_DEVIATION, volatility: DEFAULT_VOLATILITY,
        ratedMatches: 0, provisional: true, placementsPlayed: 0, peakRating: DEFAULT_RATING,
        lastRatedAt: null, lastRatedMatchId: null,
      };
      const newRating = p.ratingAfter ?? current.rating;
      const newMatches = current.ratedMatches + 1;
      const newPlacements = Math.min(current.placementsPlayed + 1, PLACEMENTS_REQUIRED);
      const newPeak = Math.max(current.peakRating, newRating);
      this._ratings.set(key, {
        rating: newRating,
        ratingDeviation: p.rdAfter ?? current.ratingDeviation,
        volatility: p.volatilityAfter ?? current.volatility,
        ratedMatches: newMatches,
        provisional: newMatches < PROVISIONAL_THRESHOLD,
        placementsPlayed: newPlacements,
        peakRating: newPeak,
        lastRatedAt: Date.now(),
        lastRatedMatchId: record.matchId,
      });

      // Record rating event (idempotency via _matches gate; ledger for audit)
      if (p.ratingBefore !== null && p.ratingAfter !== null) {
        this._ratingEvents.push({
          matchId: record.matchId,
          userId: p.accountId,
          seasonId,
          ratingBefore: p.ratingBefore,
          ratingAfter: p.ratingAfter,
          ratingDelta: p.ratingDelta,
          rdBefore: p.rdBefore ?? current.ratingDeviation,
          rdAfter: p.rdAfter ?? current.ratingDeviation,
          volatilityBefore: p.volatilityBefore ?? current.volatility,
          volatilityAfter: p.volatilityAfter ?? current.volatility,
          result: p.result,
          algorithmVersion: 'glicko2-v1',
          createdAt: Date.now(),
        });
      }

      // Update stats
      const stats = this._stats.get(p.accountId) ?? {
        onlineMatches: 0, onlineWins: 0, onlineLosses: 0, onlineDraws: 0,
        rankedMatches: 0, rankedWins: 0, rankedLosses: 0,
        currentWinStreak: 0, bestWinStreak: 0,
      };
      stats.onlineMatches++;
      if (p.result === 'WIN') {
        stats.onlineWins++;
        stats.currentWinStreak++;
        stats.bestWinStreak = Math.max(stats.bestWinStreak, stats.currentWinStreak);
      } else if (p.result === 'LOSS') {
        stats.onlineLosses++;
        stats.currentWinStreak = 0;
      } else if (p.result === 'DRAW') {
        stats.onlineDraws++;
        stats.currentWinStreak = 0;
      }
      if (queueId === 'ranked') {
        stats.rankedMatches++;
        if (p.result === 'WIN') stats.rankedWins++;
        else if (p.result === 'LOSS') stats.rankedLosses++;
      }
      this._stats.set(p.accountId, stats);
    }

    return { success: true, error: null, record, alreadyPersisted: false };
  }

  /**
   * @param {Array<import('./match-result-persistor.mjs').AchievementUnlockRecord>} unlocks
   */
  async persistAchievementUnlocks(unlocks) {
    let persisted = 0;
    for (const u of unlocks) {
      if (!u.accountId || !u.achievementId) continue;
      const key = `${u.accountId}:${u.achievementId}`;
      if (this._achievements.has(key)) continue;
      this._achievements.add(key);
      this._achievementRows.push({
        accountId: u.accountId,
        achievementId: u.achievementId,
        unlockedAt: u.unlockedAt,
        provenance: u.provenance,
        matchId: u.matchId ?? null,
        rulesVersion: u.rulesVersion ?? null,
        productVersion: u.productVersion ?? null,
      });
      persisted++;
    }
    return { success: true, error: null, persisted };
  }

  /**
   * @param {Array<{ accountId: string, achievementId: string, progress: number, target: number|null, updatedAt: string, matchId: string }>} progress
   */
  async persistAchievementProgress(progress) {
    let persisted = 0;
    for (const p of progress) {
      if (!p.accountId || !p.achievementId) continue;
      const key = `${p.accountId}:${p.achievementId}`;
      this._achievementProgress = this._achievementProgress || new Map();
      this._achievementProgress.set(key, {
        accountId: p.accountId,
        achievementId: p.achievementId,
        progress: p.progress,
        target: p.target ?? null,
        updatedAt: p.updatedAt,
        matchId: p.matchId ?? null,
      });
      persisted++;
    }
    return { success: true, error: null, persisted };
  }

  // ── Inspection helpers for tests ──

  /** @returns {import('./match-result-persistor.mjs').MatchResultRecord | null} */
  getMatch(matchId) { return this._matches.get(matchId) ?? null; }

  /** @returns {Array<import('./match-result-persistor.mjs').MatchResultRecord>} */
  getAllMatches() { return [...this._matches.values()]; }

  /** @returns {number} */
  get matchCount() { return this._matches.size; }

  /**
   * @param {string} matchId
   * @returns {Array<object>}
   */
  getParticipants(matchId) { return this._participants.filter(p => p.matchId === matchId); }

  /**
   * @param {string} accountId
   * @returns {object|null}
   */
  getStats(accountId) { return this._stats.get(accountId) ?? null; }

  /**
   * Get rating events for a player (audit ledger).
   * @param {string} accountId
   * @returns {Array<object>}
   */
  getRatingEvents(accountId) { return this._ratingEvents.filter(e => e.userId === accountId); }

  /** @returns {number} */
  get ratingEventCount() { return this._ratingEvents.length; }

  /**
   * @param {string} accountId
   * @returns {Array<object>}
   */
  getAchievements(accountId) { return this._achievementRows.filter(r => r.accountId === accountId); }

  /** @returns {number} */
  get achievementCount() { return this._achievementRows.length; }

  /**
   * @param {string} accountId
   * @param {string} achievementId
   * @returns {boolean}
   */
  hasAchievement(accountId, achievementId) { return this._achievements.has(`${accountId}:${achievementId}`); }

  async close() { /* No-op — in-memory */ }

  // ── Guest migration ──

  /** @type {Map<string, { sourceIdentity: string, targetIdentity: string, completedAt: number }>} */
  _migrations = new Map();

  async isMigrationCompleted(migrationId) {
    return this._migrations.has(migrationId);
  }

  /**
   * @param {object} plan - Migration plan
   * @param {string} plan.migrationId
   * @param {string} plan.sourceIdentity
   * @param {string} plan.targetIdentity
   * @param {number} [plan.migrationVersion]
   * @param {Array<{ achievementId: string, unlockedAt: string, provenance?: string }>} achievements
   */
  async executeGuestMigration(plan, achievements) {
    if (this._migrations.has(plan.migrationId)) {
      return { success: true, error: null, migrationId: plan.migrationId, achievementsTransferred: 0, alreadyMigrated: true };
    }

    let achievementsTransferred = 0;
    if (achievements && achievements.length > 0) {
      for (const a of achievements) {
        const key = `${plan.targetIdentity}:${a.achievementId}`;
        if (this._achievements.has(key)) continue;
        this._achievements.add(key);
        this._achievementRows.push({
          accountId: plan.targetIdentity,
          achievementId: a.achievementId,
          unlockedAt: a.unlockedAt,
          provenance: a.provenance ?? 'LOCAL_DEVICE',
          matchId: null,
          rulesVersion: null,
          productVersion: null,
        });
        achievementsTransferred++;
      }
    }

    this._migrations.set(plan.migrationId, {
      sourceIdentity: plan.sourceIdentity,
      targetIdentity: plan.targetIdentity,
      completedAt: Date.now(),
    });

    return { success: true, error: null, migrationId: plan.migrationId, achievementsTransferred, alreadyMigrated: false };
  }

  /** @returns {number} */
  get migrationCount() { return this._migrations.size; }

  /**
   * @param {string} migrationId
   * @returns {object|null}
   */
  getMigration(migrationId) { return this._migrations.get(migrationId) ?? null; }
}
