// ═══════════════════════════════════════════════════════════════
// fake-match-result-persistor.mjs — In-memory persistor for tests
//
// Stores all persisted results in arrays for inspection.
// Tracks rating state per (accountId, queueId) for deterministic testing.
// Idempotent: re-persisting the same matchId is a no-op.
// ═══════════════════════════════════════════════════════════════

import { MatchResultPersistor } from './match-result-persistor.mjs';
import { DEFAULT_RATING, initialRatingState } from '@intrilex/account-domain';

export class FakeMatchResultPersistor extends MatchResultPersistor {
  constructor() {
    super();
    /** @type {Map<string, import('./match-result-persistor.mjs').MatchResultRecord>} */
    this._matches = new Map(); // matchId → record
    /** @type {Array<{ matchId: string, accountId: string, seat: string, result: string, ratingBefore: number|null, ratingAfter: number|null, ratingDelta: number|null }>} */
    this._participants = [];
    /** @type {Map<string, { rating: number, ratedMatches: number, provisional: boolean }>} */
    this._ratings = new Map(); // `${accountId}:${queueId}` → state
    /** @type {Map<string, { onlineMatches: number, onlineWins: number, onlineLosses: number, onlineDraws: number, rankedMatches: number, rankedWins: number, rankedLosses: number, currentWinStreak: number, bestWinStreak: number }>} */
    this._stats = new Map(); // accountId → stats
    /** @type {Set<string>} — `${accountId}:${achievementId}` for idempotency */
    this._achievements = new Set();
    /** @type {Array<{ accountId: string, achievementId: string, unlockedAt: string, provenance: string, matchId: string|null, rulesVersion: string|null, productVersion: string|null }>} */
    this._achievementRows = [];
  }

  /**
   * @param {string} accountId
   * @param {string} queueId
   * @returns {string}
   * @private
   */
  _key(accountId, queueId) {
    return `${accountId}:${queueId}`;
  }

  /**
   * Pre-seed a rating state for a player (for testing specific rating scenarios).
   * @param {string} accountId
   * @param {string} queueId
   * @param {number} rating
   * @param {number} ratedMatches
   */
  seedRating(accountId, queueId, rating, ratedMatches = 0) {
    const provisional = ratedMatches < 10;
    this._ratings.set(this._key(accountId, queueId), { rating, ratedMatches, provisional });
  }

  async getRatingState(accountId, queueId) {
    return this._ratings.get(this._key(accountId, queueId)) ?? null;
  }

  /**
   * @param {import('./match-result-persistor.mjs').MatchResultRecord} record
   */
  async persistMatchResult(record) {
    // Idempotency: if already persisted, return success without double-counting
    if (this._matches.has(record.matchId)) {
      return { success: true, error: null, record };
    }

    this._matches.set(record.matchId, record);

    const queueId = record.queueId ?? 'casual';

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

      // Update rating state
      const key = this._key(p.accountId, queueId);
      const current = this._ratings.get(key) ?? { rating: DEFAULT_RATING, ratedMatches: 0, provisional: true };
      const newRating = p.ratingAfter ?? current.rating;
      const newMatches = current.ratedMatches + 1;
      this._ratings.set(key, {
        rating: newRating,
        ratedMatches: newMatches,
        provisional: newMatches < 10,
      });

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

    return { success: true, error: null, record };
  }

  /**
   * @param {Array<import('./match-result-persistor.mjs').AchievementUnlockRecord>} unlocks
   */
  async persistAchievementUnlocks(unlocks) {
    let persisted = 0;
    for (const u of unlocks) {
      if (!u.accountId || !u.achievementId) continue;
      const key = `${u.accountId}:${u.achievementId}`;
      // Idempotent: skip if already unlocked
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

  // ── Inspection helpers for tests ──

  /** @returns {import('./match-result-persistor.mjs').MatchResultRecord | null} */
  getMatch(matchId) {
    return this._matches.get(matchId) ?? null;
  }

  /** @returns {Array<import('./match-result-persistor.mjs').MatchResultRecord>} */
  getAllMatches() {
    return [...this._matches.values()];
  }

  /** @returns {number} */
  get matchCount() {
    return this._matches.size;
  }

  /**
   * @param {string} matchId
   * @returns {Array<object>}
   */
  getParticipants(matchId) {
    return this._participants.filter(p => p.matchId === matchId);
  }

  /**
   * @param {string} accountId
   * @returns {{ onlineMatches: number, onlineWins: number, onlineLosses: number, onlineDraws: number, rankedMatches: number, rankedWins: number, rankedLosses: number, currentWinStreak: number, bestWinStreak: number } | null}
   */
  getStats(accountId) {
    return this._stats.get(accountId) ?? null;
  }

  /**
   * Get all persisted achievement rows for a player.
   * @param {string} accountId
   * @returns {Array<{ accountId: string, achievementId: string, unlockedAt: string, provenance: string, matchId: string|null, rulesVersion: string|null, productVersion: string|null }>}
   */
  getAchievements(accountId) {
    return this._achievementRows.filter(r => r.accountId === accountId);
  }

  /**
   * Get all persisted achievement rows (for inspection).
   * @returns {number}
   */
  get achievementCount() {
    return this._achievementRows.length;
  }

  /**
   * Check if a specific achievement has been persisted for a player.
   * @param {string} accountId
   * @param {string} achievementId
   * @returns {boolean}
   */
  hasAchievement(accountId, achievementId) {
    return this._achievements.has(`${accountId}:${achievementId}`);
  }

  async close() {
    // No-op — in-memory
  }
}
