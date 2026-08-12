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
 * @property {number|null} [rdBefore] - Glicko-2 rating deviation before (server-only)
 * @property {number|null} [rdAfter] - Glicko-2 rating deviation after (server-only)
 * @property {number|null} [volatilityBefore] - Glicko-2 volatility before (server-only)
 * @property {number|null} [volatilityAfter] - Glicko-2 volatility after (server-only)
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
 * @property {string} serverVersion - Intrilex version (e.g. '0.27.0')
 * @property {string} rulesVersion - Engine rules version
 * @property {Array<MatchParticipantRecord>} participants
 * @property {string|null} queueId - 'casual' or 'ranked' (null for private duels)
 * @property {string} [seasonId] - Active ranked season id (for rated queues)
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
   * @param {MatchResultRecord} _record
   * @returns {Promise<PersistedMatchResult>}
   */
  async persistMatchResult(_record) {
    throw new Error('MatchResultPersistor.persistMatchResult() not implemented');
  }

  /**
   * Get the current rating state for a player.
   * Used to fetch ratingBefore before computing the update.
   * @param {string} _accountId
   * @param {string} _queueId
   * @param {string} [_seasonId] - Active season id (defaults to canonical)
   * @returns {Promise<{rating: number, ratingDeviation: number, volatility: number, ratedMatches: number, provisional: boolean, placementsPlayed: number, peakRating: number} | null>}
   */
  async getRatingState(_accountId, _queueId, _seasonId) {
    throw new Error('MatchResultPersistor.getRatingState() not implemented');
  }

  /**
   * Resolve the active season id for a queue. Returns a stable season id.
   * @param {string} _queueId
   * @returns {Promise<string>}
   */
  async resolveActiveSeasonId(_queueId) {
    throw new Error('MatchResultPersistor.resolveActiveSeasonId() not implemented');
  }

  /**
   * Check whether a match result has already been persisted (idempotency
   * gate). Returns true if the matchId is already in the authoritative
   * store, so re-persisting is a safe no-op that does NOT re-apply ratings.
   * @param {string} _matchId
   * @returns {Promise<boolean>}
   */
  async isMatchPersisted(_matchId) {
    throw new Error('MatchResultPersistor.isMatchPersisted() not implemented');
  }

  /**
   * Persist server-authoritative achievement unlocks to account_achievements.
   * Only called for participants with an accountId (authenticated players).
   * Uses SERVER provenance — these rows can only be written by the service role.
   * Idempotent: re-persisting the same (accountId, achievementId) is a no-op.
   * @param {Array<AchievementUnlockRecord>} _unlocks
   * @returns {Promise<{ success: boolean, error: string|null, persisted: number }>}
   */
  async persistAchievementUnlocks(_unlocks) {
    throw new Error('MatchResultPersistor.persistAchievementUnlocks() not implemented');
  }

  /**
   * Persist achievement progress updates (IRX-H31).
   * Writes progress rows for multi-step achievements (counters, sets).
   * Idempotent: re-persisting the same (accountId, achievementId) upserts.
   * @param {Array<{ accountId: string, achievementId: string, progress: number, target: number|null, updatedAt: string, matchId: string }>} _progress
   * @returns {Promise<{ success: boolean, error: string|null, persisted: number }>}
   */
  async persistAchievementProgress(_progress) {
    throw new Error('MatchResultPersistor.persistAchievementProgress() not implemented');
  }

  /**
   * Execute a guest→permanent account migration.
   * Copies local achievements from a guest identity to a permanent identity
   * and records the migration for idempotency. Only the service role can
   * write to account_migrations, so this is always server-side.
   * @param {object} plan - Migration plan (from account-domain/guest-migration)
   * @param {string} plan.migrationId - Deterministic migration ID
   * @param {string} plan.sourceIdentity - Guest user UUID
   * @param {string} plan.targetIdentity - Permanent user UUID
   * @param {Array<{ achievementId: string, unlockedAt: string, provenance?: string }>} _achievements - Local achievements to migrate
   * @returns {Promise<{ success: boolean, error: string|null, migrationId: string, achievementsTransferred: number, alreadyMigrated: boolean }>}
   */
  async executeGuestMigration(_plan, _achievements) {
    throw new Error('MatchResultPersistor.executeGuestMigration() not implemented');
  }

  /**
   * Check if a guest→permanent migration has already been completed.
   * @param {string} _migrationId - Deterministic migration ID
   * @returns {Promise<boolean>}
   */
  async isMigrationCompleted(_migrationId) {
    throw new Error('MatchResultPersistor.isMigrationCompleted() not implemented');
  }

  /**
   * Close any open connections (e.g. Supabase client).
   * @returns {Promise<void>}
   */
  async close() {
    // No-op by default
  }
}
