// ═══════════════════════════════════════════════════════════════
// match-result-persistor.mjs — Interface for persisting terminal match results
//
// The match server calls persistMatchResult() when a match reaches
// TERMINAL status. The persistor writes:
//   1. matches row (match_id, status, started_at, ended_at, winner, replay_hash, versions)
//   2. match_participants rows (one per participant with seat, result, rating delta)
//   3. player_ratings update (upsert rating, wins, losses, draws, rated_matches)
//   4. player_stats update (increment online/ranked match counters)
//   5. account_achievements rows (server-provenance unlocks per participant)
//
// Implementations:
//   - FakeMatchResultPersistor: in-memory, for tests
//   - SupabaseMatchResultPersistor: production, writes via service-role client
//
// Architectural law: Only the server (service role) writes to these tables.
// RLS blocks all client writes. The persistor never exposes secrets.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MatchParticipantRecord
 * @property {string} accountId - Supabase user UUID (null for anonymous/unauth)
 * @property {string} participantId - Intrilex participant ID (P-xxxx)
 * @property {string} seat - 'P1' or 'P2'
 * @property {'WIN'|'LOSS'|'DRAW'|'ABORT'} result
 * @property {number|null} ratingBefore
 * @property {number|null} ratingAfter
 * @property {number|null} ratingDelta
 */

/**
 * @typedef {Object} MatchResultRecord
 * @property {string} matchId - Intrilex match ID (M-xxxx)
 * @property {string} rulesProfileId - Engine profile (e.g. 'core-unrestricted-authority')
 * @property {'COMPLETED'|'ABORTED'|'EXPIRED'} status
 * @property {number} startedAt - Unix timestamp (ms) when match started
 * @property {number} endedAt - Unix timestamp (ms) when match ended
 * @property {string|null} terminationReason
 * @property {string|null} winnerUserId - Supabase UUID of winner (null for draw/abort)
 * @property {string|null} replayHash - SHA-256 hex of certified replay
 * @property {string} serverVersion - Intrilex version (e.g. '0.24.2')
 * @property {string} rulesVersion - Engine rules version
 * @property {Array<MatchParticipantRecord>} participants
 * @property {string|null} queueId - 'casual' or 'ranked' (null for private duels)
 */

/**
 * @typedef {Object} PersistedMatchResult
 * @property {boolean} success
 * @property {string|null} error - Error message if failed
 * @property {MatchResultRecord} record - The record that was persisted
 */

/**
 * @typedef {Object} AchievementUnlockRecord
 * @property {string} accountId - Supabase user UUID
 * @property {string} achievementId - Stable achievement ID from catalog
 * @property {string} unlockedAt - ISO timestamp
 * @property {string} provenance - 'SERVER' for server-evaluated unlocks
 * @property {string|null} matchId - Match that triggered the unlock
 * @property {string|null} rulesVersion
 * @property {string|null} productVersion
 */

/**
 * Interface for match result persistence.
 * Implementations must be idempotent — persisting the same matchId twice
 * should not double-count ratings or create duplicate rows.
 */
export class MatchResultPersistor {
  /**
   * Persist a terminal match result to the authoritative store.
   * @param {MatchResultRecord} record
   * @returns {Promise<PersistedMatchResult>}
   */
  async persistMatchResult(_record) {
    throw new Error('MatchResultPersistor.persistMatchResult() not implemented');
  }

  /**
   * Get the current rating state for a player.
   * Used to fetch ratingBefore before computing the update.
   * @param {string} accountId
   * @param {string} queueId
   * @returns {Promise<{rating: number, ratedMatches: number, provisional: boolean} | null>}
   */
  async getRatingState(_accountId, _queueId) {
    throw new Error('MatchResultPersistor.getRatingState() not implemented');
  }

  /**
   * Persist server-authoritative achievement unlocks to account_achievements.
   * Only called for participants with an accountId (authenticated players).
   * Uses SERVER provenance — these rows can only be written by the service role.
   * Idempotent: re-persisting the same (accountId, achievementId) is a no-op.
   * @param {Array<AchievementUnlockRecord>} unlocks
   * @returns {Promise<{ success: boolean, error: string|null, persisted: number }>}
   */
  async persistAchievementUnlocks(_unlocks) {
    throw new Error('MatchResultPersistor.persistAchievementUnlocks() not implemented');
  }

  /**
   * Close any open connections (e.g. Supabase client).
   * @returns {Promise<void>}
   */
  async close() {
    // No-op by default
  }
}
