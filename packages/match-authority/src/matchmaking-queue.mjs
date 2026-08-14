// ═══════════════════════════════════════════════════════════════
// matchmaking-queue.mjs — Public matchmaking queue for the match server
//
// Provides a simple FIFO queue that pairs two waiting players into
// a new match. No MMR, no accounts — just first-come-first-served
// pairing by profile.
//
// Lifecycle:
//   1. Player sends QUEUE_JOIN → added to queue, receives QUEUE_JOINED
//   2. When 2 players are in queue for the same profile, they are paired
//   3. Both players receive QUEUE_MATCHED with matchId + participantToken
//   4. Player can QUEUE_LEAVE to cancel while waiting
//
// Limits:
//   - MAX_QUEUE_SIZE: 200 (rejects beyond this)
//   - QUEUE_TIMEOUT_MS: 120000 (2 min) — stale entries are cleaned
//   - One entry per connection (ALREADY_IN_QUEUE if duplicate)
// ═══════════════════════════════════════════════════════════════

import { randomBytes } from 'node:crypto';

export const MAX_QUEUE_SIZE = 200;
export const QUEUE_TIMEOUT_MS = 120000; // 2 minutes

/**
 * @typedef {{ connectionId: string, profileId: string, joinedAt: number, accountId: string|null, queueId: string|null }} QueueEntry
 */
/**
 * @typedef {object} EnqueueResult
 * @property {boolean} queued
 * @property {number} [position]
 * @property {number} [estimatedWaitMs]
 * @property {string} [error]
 * @property {string} [code]
 * @property {*} [paired]
 */

/**
 * Matchmaking queue.
 *
 * @param {object} opts
 * @param {function} [opts.onCreateMatch] - Called when two players are paired.
 *   Receives (profileId, seed) and must return { matchId, inviteCode, participantId, participantToken }
 *   for each of the two players. Returns an array of two entries:
 *   [{ connectionId, matchId, participantId, participantToken }, ...]
 */
export class MatchmakingQueue {
  /**
   * @param {object} [opts]
   * @param {function} [opts.onCreateMatch]
   * @param {(function(string, string): Promise<boolean>)|null} [opts.blockChecker] - IRX-H19: async (accountIdA, accountIdB) → boolean
   *   Accepted for injection-point compatibility but NOT used inside the queue.
   *   Block enforcement is performed by the match server's `handleQueueJoin`
   *   after pairing (it calls `blockChecker(accountId, partnerAccountId)` and
   *   cancels the match if either player has blocked the other). Kept here so
   *   callers can pass it through without a conditional.
   * @param {(function(string): { rating: number, rd: number }|null)|null} [opts.ratingProvider]
   *   P6: Optional async function that returns a player's rating + RD for
   *   rating-band matchmaking. If provided, ranked queue entries will be
   *   paired preferentially within a rating band. Falls back to FIFO if
   *   no rating is available or the band is empty.
   */
  constructor({ onCreateMatch, blockChecker = null, ratingProvider = null } = {}) {
    /** @type {QueueEntry[]} */
    this._queue = []; // [{ connectionId, profileId, joinedAt }]
    this._byConnection = new Map(); // connectionId → queue index
    this._onCreateMatch = onCreateMatch;
    // Stored for caller introspection only; the queue itself never invokes it.
    /** @type {(function(string, string): Promise<boolean>)|null} */
    this._blockChecker = blockChecker;
    /** @type {(function(string): { rating: number, rd: number }|null)|null} */
    this._ratingProvider = ratingProvider;
  }

  /**
   * Add a connection to the queue.
   * @param {string} connectionId
   * @param {string} profileId
   * @param {string|null} [accountId] - Account ID for identity-based queue dedup + self-match prevention
   * @param {string|null} [queueId] - Requested queue ('ranked'|'casual'|null) — RANK-01
   * @returns {EnqueueResult}
   */
  enqueue(connectionId, profileId, accountId = null, queueId = null) {
    if (this._byConnection.has(connectionId)) {
      return { queued: false, error: 'Already in queue', code: 'ALREADY_IN_QUEUE' };
    }
    // One active queue entry per account (prevents multi-queue abuse).
    // If the same account is already queued, supersede the stale entry —
    // this happens when a player's connection drops and they reconnect
    // with a new connectionId before the old connection's disconnect
    // handler has fired.
    if (accountId) {
      for (const entry of this._queue) {
        if (entry.accountId && entry.accountId === accountId) {
          this.dequeue(entry.connectionId);
          break;
        }
      }
    }
    if (this._queue.length >= MAX_QUEUE_SIZE) {
      return { queued: false, error: 'Queue is full', code: 'QUEUE_FULL' };
    }

    const entry = { connectionId, profileId, joinedAt: Date.now(), accountId, queueId };
    this._queue.push(entry);
    this._byConnection.set(connectionId, this._queue.length - 1);

    const position = this._queue.filter(e => e.profileId === profileId).indexOf(entry) + 1;
    const estimatedWaitMs = position * 5000; // rough estimate: 5s per position

    // Try to pair immediately
    const pair = this._tryPair(profileId);

    return {
      queued: true,
      position,
      estimatedWaitMs,
      paired: pair, // null if not paired, else array of 2 results
    };
  }

  /**
   * Remove a connection from the queue.
   * @param {string} connectionId
   * @returns {{ removed: boolean }}
   */
  dequeue(connectionId) {
    if (!this._byConnection.has(connectionId)) {
      return { removed: false };
    }
    const idx = this._byConnection.get(connectionId);
    this._queue.splice(idx, 1);
    this._byConnection.delete(connectionId);
    // Rebuild index
    this._byConnection.clear();
    for (let i = 0; i < this._queue.length; i++) {
      this._byConnection.set(this._queue[i].connectionId, i);
    }
    return { removed: true };
  }

  /**
   * Check if a connection is in the queue.
   * @param {string} connectionId
   * @returns {boolean}
   */
  has(connectionId) {
    return this._byConnection.has(connectionId);
  }

  /**
   * Get the current queue size.
   */
  get size() {
    return this._queue.length;
  }

  /**
   * Clean up expired entries.
   * @param {number} [maxAgeMs=QUEUE_TIMEOUT_MS]
   * @returns {string[]} Array of expired connection IDs
   */
  cleanExpired(maxAgeMs = QUEUE_TIMEOUT_MS) {
    const now = Date.now();
    const expired = [];
    const remaining = [];
    for (const entry of this._queue) {
      if (now - entry.joinedAt > maxAgeMs) {
        expired.push(entry.connectionId);
      } else {
        remaining.push(entry);
      }
    }
    this._queue = remaining;
    this._byConnection.clear();
    for (let i = 0; i < this._queue.length; i++) {
      this._byConnection.set(this._queue[i].connectionId, i);
    }
    return expired;
  }

  /**
   * Try to pair the first two waiting players for a given profile.
   * @param {string} profileId
   * @returns {Array<*>|null} Array of two pairing results, or null
   * @private
   */
  _tryPair(profileId) {
    // RANK-01: Match by both profileId and queueId — ranked players should
    // only be paired with other ranked players, casual with casual.
    const candidates = this._queue.filter(e => e.profileId === profileId);
    if (candidates.length < 2) return null;

    // Prevent self-matching: don't pair two entries with the same accountId
    let [a, b] = candidates;
    if (a.accountId && b.accountId && a.accountId === b.accountId) {
      // Look for a third candidate with a different accountId
      const different = candidates.find(e => e.accountId !== a.accountId);
      if (!different) return null; // Can't pair — all same account
      b = different;
    }

    // RANK-01: Only pair entries with the same queueId (or both null)
    if ((a.queueId ?? 'casual') !== (b.queueId ?? 'casual')) {
      // Try to find a better match with the same queueId
      const sameQueue = candidates.filter(e => (e.queueId ?? 'casual') === (a.queueId ?? 'casual') && e.connectionId !== a.connectionId);
      if (sameQueue.length === 0) return null;
      const different2 = sameQueue.find(e => !a.accountId || !e.accountId || e.accountId !== a.accountId);
      if (!different2) return null;
      b = different2;
    }

    // P6: Rating-band matchmaking — for ranked queue, prefer opponents within
    // a rating band computed from RD (rating deviation). Wider RD = wider band.
    // Falls back to FIFO if no rating provider or no rating available.
    if (a.queueId === 'ranked' && this._ratingProvider && a.accountId) {
      const aRating = this._ratingProvider(a.accountId);
      if (aRating && typeof aRating.rating === 'number') {
        // Band = 2 * RD + 100 baseline (ensures even tight-RD players get some band)
        const band = (aRating.rd ?? 50) * 2 + 100;
        const sameQueue = candidates.filter(e =>
          (e.queueId ?? 'casual') === 'ranked' &&
          e.connectionId !== a.connectionId &&
          (!a.accountId || !e.accountId || e.accountId !== a.accountId)
        );
        // Find the closest opponent within the band
        let bestMatch = null;
        let bestDistance = Infinity;
        for (const candidate of sameQueue) {
          if (!candidate.accountId) continue;
          const cRating = this._ratingProvider(candidate.accountId);
          if (!cRating || typeof cRating.rating !== 'number') continue;
          const distance = Math.abs(cRating.rating - aRating.rating);
          if (distance <= band && distance < bestDistance) {
            bestDistance = distance;
            bestMatch = candidate;
          }
        }
        if (bestMatch) {
          b = bestMatch;
        }
        // If no one in band, fall through to FIFO (b is already set above)
      }
    }

    // Remove both from queue
    this.dequeue(a.connectionId);
    this.dequeue(b.connectionId);

    // Create the match
    if (!this._onCreateMatch) return null;

    const seed = randomBytes(4).readUInt32BE(0);
    const result = this._onCreateMatch(profileId, seed, [
      { connectionId: a.connectionId, accountId: a.accountId, queueId: a.queueId },
      { connectionId: b.connectionId, accountId: b.accountId, queueId: b.queueId },
    ]);

    return result; // [{ connectionId, matchId, participantId, participantToken }, ...]
  }
}
