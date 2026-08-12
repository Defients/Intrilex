// ═══════════════════════════════════════════════════════════════
// supabase-match-result-persistor.mjs — Production persistor
//
// Writes terminal match results to Supabase via the service-role client.
// Uses upserts for idempotency — re-persisting the same matchId is safe.
//
// Tables written (service role bypasses RLS):
//   - public.matches (INSERT — PK match_id prevents duplicates)
//   - public.match_participants (INSERT — PK (match_id, user_id) prevents duplicates)
//   - public.player_ratings (UPSERT — rating, wins, losses, draws, rated_matches)
//   - public.player_stats (UPSERT — online/ranked counters)
//
// Architectural law: This module NEVER exposes the service role key.
// The key is passed in at construction and used only for Supabase client calls.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { MatchResultPersistor } from './match-result-persistor.mjs';
import {
  DEFAULT_RATING, DEFAULT_RATING_DEVIATION, DEFAULT_VOLATILITY,
  PLACEMENTS_REQUIRED, PROVISIONAL_THRESHOLD,
} from '@intrilex/account-domain';

export class SupabaseMatchResultPersistor extends MatchResultPersistor {
  /**
   * @param {object} opts
   * @param {string} opts.supabaseUrl - Supabase project URL
   * @param {string} opts.supabaseServiceKey - Service role key (server-only, never exposed to clients)
   */
  constructor({ supabaseUrl, supabaseServiceKey }) {
    super();
    if (!supabaseUrl) throw new Error('supabaseUrl is required');
    if (!supabaseServiceKey) throw new Error('supabaseServiceKey is required');

    // Service-role client — bypasses RLS for server-authoritative writes
    this._client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Resolve the active season id for a queue from ranked_seasons.
   * @param {string} queueId
   * @returns {Promise<string>}
   */
  async resolveActiveSeasonId(queueId) {
    const { data, error } = await this._client
      .from('ranked_seasons')
      .select('season_id')
      .eq('queue_id', queueId)
      .eq('status', 'ACTIVE')
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    // IRX-H07: Fail closed — return null when season resolution fails.
    // The caller (buildMatchResultRecord / broadcastMatchEnded) handles
    // null by downgrading ranked to casual. Never fabricate 'season-1'.
    if (error || !data) return null;
    return data.season_id;
  }

  /**
   * Check whether a match has already been persisted (idempotency gate).
   * @param {string} matchId
   * @returns {Promise<boolean>}
   */
  async isMatchPersisted(matchId) {
    const { data, error } = await this._client
      .from('matches')
      .select('match_id')
      .eq('match_id', matchId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  }

  /**
   * @param {string} accountId
   * @param {string} queueId
   * @param {string} [seasonId]
   */
  async getRatingState(accountId, queueId, seasonId) {
    const sid = seasonId ?? await this.resolveActiveSeasonId(queueId);
    const { data, error } = await this._client
      .from('player_ratings')
      .select('rating, rating_deviation, volatility, rated_matches, provisional, placements_played, peak_rating')
      .eq('user_id', accountId)
      .eq('queue_id', queueId)
      .eq('season_id', sid)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch rating state: ${error.message}`);
    }
    if (!data) return null;
    return {
      rating: data.rating,
      ratingDeviation: data.rating_deviation ?? DEFAULT_RATING_DEVIATION,
      volatility: data.volatility ?? DEFAULT_VOLATILITY,
      ratedMatches: data.rated_matches,
      provisional: data.provisional,
      placementsPlayed: data.placements_played ?? 0,
      peakRating: data.peak_rating ?? data.rating,
    };
  }

  /**
   * @param {import('./match-result-persistor.mjs').MatchResultRecord} record
   */
  async persistMatchResult(record) {
    // Idempotency gate (section 39/94): if the match is already persisted,
    // return success WITHOUT re-applying ratings. This prevents reconnect/
    // retry/replay from double-counting. The rating_events UNIQUE(match_id,
    // user_id) constraint is a defense-in-depth backstop.
    if (record.matchId && await this.isMatchPersisted(record.matchId)) {
      return { success: true, error: null, record, alreadyPersisted: true };
    }

    // ── Atomic path: single RPC call with server-side transaction ──
    // The persist_match_result RPC wraps all multi-table writes (matches,
    // match_participants, player_ratings, rating_events, player_stats) in
    // a single database transaction. If any write fails, all are rolled
    // back — no partial state. This replaces the previous approach of 5+
    // separate HTTP round-trips with no transaction wrapping.
    try {
      const { data, error } = await this._client.rpc('persist_match_result', {
        p_record: this._serializeRecordForRpc(record),
      });

      if (error) {
        // If the RPC doesn't exist yet (migration 0012 not applied),
        // fall back to the legacy multi-call path.
        if (this._isMissingRpcError(error)) {
          return this._persistMatchResultLegacy(record);
        }
        return { success: false, error: `persist_match_result RPC failed: ${error.message}`, record };
      }

      if (data && data.success === false) {
        return { success: false, error: data.error ?? 'persist_match_result RPC returned failure', record };
      }

      return {
        success: true,
        error: null,
        record,
        alreadyPersisted: data?.alreadyPersisted ?? false,
      };
    } catch (err) {
      // Network errors or RPC not found — fall back to legacy path
      if (this._isMissingRpcError(err)) {
        return this._persistMatchResultLegacy(record);
      }
      return { success: false, error: err?.message ?? 'persist_match_result threw', record };
    }
  }

  /**
   * Check if an error indicates the persist_match_result RPC doesn't
   * exist (migration 0012 not yet applied). In that case we fall back
   * to the legacy multi-call path for backward compatibility.
   * @param {{ message?: string, code?: string } | Error} err
   * @returns {boolean}
   */
  _isMissingRpcError(err) {
    const msg = (err?.message ?? String(err)).toLowerCase();
    return msg.includes('could not find the function')
        || msg.includes('function public.persist_match_result')
        || msg.includes('does not exist')
        || msg.includes('p089')
        || msg.includes('42883'); // undefined_function error code
  }

  /**
   * Serialize a MatchResultRecord into the JSONB shape expected by the
   * persist_match_result RPC. Converts timestamps to ISO strings and
   * omits null/undefined fields to keep the payload compact.
   * @param {import('./match-result-persistor.mjs').MatchResultRecord} record
   * @returns {Record<string, unknown>}
   */
  _serializeRecordForRpc(record) {
    return {
      matchId: record.matchId,
      rulesProfileId: record.rulesProfileId,
      status: record.status,
      startedAt: new Date(record.startedAt).toISOString(),
      endedAt: new Date(record.endedAt).toISOString(),
      terminationReason: record.terminationReason,
      winnerUserId: record.winnerUserId,
      replayHash: record.replayHash,
      serverVersion: record.serverVersion,
      rulesVersion: record.rulesVersion,
      queueId: record.queueId ?? 'casual',
      seasonId: record.seasonId ?? null,
      participants: record.participants.map(p => ({
        accountId: p.accountId,
        seat: p.seat,
        result: p.result,
        ratingBefore: p.ratingBefore,
        ratingAfter: p.ratingAfter,
        ratingDelta: p.ratingDelta,
        rdBefore: p.rdBefore ?? null,
        rdAfter: p.rdAfter ?? null,
        volatilityBefore: p.volatilityBefore ?? null,
        volatilityAfter: p.volatilityAfter ?? null,
      })),
    };
  }

  /**
   * Legacy multi-call persistence path. Used as a fallback when the
   * persist_match_result RPC is not available (migration 0012 not applied).
   * This is the original implementation — 5+ separate HTTP round-trips
   * with no transaction wrapping. Kept for backward compatibility.
   * @param {import('./match-result-persistor.mjs').MatchResultRecord} record
   * @returns {Promise<{ success: boolean, error: string|null, record: import('./match-result-persistor.mjs').MatchResultRecord, alreadyPersisted: boolean }>}
   */
  async _persistMatchResultLegacy(record) {
    // Step 1: Insert matches row (idempotent via PK)
    const matchRow = {
      match_id: record.matchId,
      rules_profile_id: record.rulesProfileId,
      status: record.status,
      started_at: new Date(record.startedAt).toISOString(),
      ended_at: new Date(record.endedAt).toISOString(),
      termination_reason: record.terminationReason,
      winner_user_id: record.winnerUserId,
      replay_hash: record.replayHash,
      server_version: record.serverVersion,
      rules_version: record.rulesVersion,
    };

    const { error: matchError } = await this._client
      .from('matches')
      .upsert(matchRow, { onConflict: 'match_id' });

    if (matchError) {
      return { success: false, error: `matches insert failed: ${matchError.message}`, record, alreadyPersisted: false };
    }

    // Step 2: Insert match_participants rows + update ratings/stats
    const queueId = record.queueId ?? 'casual';
    // IRX-H07: Never fabricate 'season-1'. If a ranked record arrives without
    // a seasonId, resolve it; if that fails, the record should not have been
    // built as ranked (the builder now downgrades to casual when season is
    // unresolvable). For non-ranked, seasonId is null.
    let seasonId = record.seasonId ?? null;
    if (!seasonId && queueId === 'ranked') {
      try {
        seasonId = await this.resolveActiveSeasonId(queueId);
      } catch {
        seasonId = null;
      }
    }

    for (const p of record.participants) {
      // Skip participants without an account (anonymous play)
      if (!p.accountId) continue;

      // Insert participant row (idempotent via PK)
      const { error: pError } = await this._client
        .from('match_participants')
        .upsert({
          match_id: record.matchId,
          user_id: p.accountId,
          seat: p.seat,
          result: p.result,
          rating_before: p.ratingBefore,
          rating_after: p.ratingAfter,
          rating_delta: p.ratingDelta,
        }, { onConflict: 'match_id,user_id' });

      if (pError) {
        return { success: false, error: `match_participants insert failed: ${pError.message}`, record, alreadyPersisted: false };
      }

      // Skip rating/stats updates for aborted matches
      if (p.result === 'ABORT') continue;

      const isWin = p.result === 'WIN' ? 1 : 0;
      const isLoss = p.result === 'LOSS' ? 1 : 0;
      const isDraw = p.result === 'DRAW' ? 1 : 0;

      // Fetch current state to compute increments
      const { data: currentRating, error: rError } = await this._client
        .from('player_ratings')
        .select('rating, rating_deviation, volatility, rated_matches, wins, losses, draws, provisional, placements_played, peak_rating')
        .eq('user_id', p.accountId)
        .eq('queue_id', queueId)
        .eq('season_id', seasonId)
        .maybeSingle();

      if (rError) {
        return { success: false, error: `player_ratings fetch failed: ${rError.message}`, record, alreadyPersisted: false };
      }

      const existing = currentRating ?? {
        rating: DEFAULT_RATING, rating_deviation: DEFAULT_RATING_DEVIATION, volatility: DEFAULT_VOLATILITY,
        rated_matches: 0, wins: 0, losses: 0, draws: 0, provisional: true,
        placements_played: 0, peak_rating: DEFAULT_RATING,
      };
      const newRatedMatches = existing.rated_matches + 1;
      const newPlacements = Math.min((existing.placements_played ?? 0) + 1, PLACEMENTS_REQUIRED);
      const newRating = p.ratingAfter ?? existing.rating;
      const newPeak = Math.max(existing.peak_rating ?? existing.rating, newRating);

      const { error: ratingError } = await this._client
        .from('player_ratings')
        .upsert({
          user_id: p.accountId,
          queue_id: queueId,
          season_id: seasonId,
          rating: newRating,
          rating_deviation: p.rdAfter ?? existing.rating_deviation ?? DEFAULT_RATING_DEVIATION,
          volatility: p.volatilityAfter ?? existing.volatility ?? DEFAULT_VOLATILITY,
          provisional: newRatedMatches < PROVISIONAL_THRESHOLD,
          rated_matches: newRatedMatches,
          placements_played: newPlacements,
          peak_rating: newPeak,
          wins: existing.wins + isWin,
          losses: existing.losses + isLoss,
          draws: existing.draws + isDraw,
          last_rated_at: new Date().toISOString(),
          last_rated_match_id: record.matchId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,queue_id,season_id' });

      if (ratingError) {
        return { success: false, error: `player_ratings upsert failed: ${ratingError.message}`, record, alreadyPersisted: false };
      }

      // Record rating event (audit ledger — idempotency via UNIQUE match_id,user_id)
      if (p.ratingBefore !== null && p.ratingAfter !== null) {
        await this._client
          .from('rating_events')
          .upsert({
            match_id: record.matchId,
            user_id: p.accountId,
            season_id: seasonId,
            queue_id: queueId,
            rating_before: p.ratingBefore,
            rating_after: p.ratingAfter,
            rating_delta: p.ratingDelta,
            rd_before: p.rdBefore ?? existing.rating_deviation ?? DEFAULT_RATING_DEVIATION,
            rd_after: p.rdAfter ?? existing.rating_deviation ?? DEFAULT_RATING_DEVIATION,
            volatility_before: p.volatilityBefore ?? existing.volatility ?? DEFAULT_VOLATILITY,
            volatility_after: p.volatilityAfter ?? existing.volatility ?? DEFAULT_VOLATILITY,
            result: p.result,
            algorithm_version: 'glicko2-v1',
          }, { onConflict: 'match_id,user_id' });
        // A conflict here means the event was already recorded — safe no-op.
      }

      // Update player_stats (upsert)
      const { data: currentStats, error: sError } = await this._client
        .from('player_stats')
        .select('*')
        .eq('user_id', p.accountId)
        .maybeSingle();

      if (sError) {
        return { success: false, error: `player_stats fetch failed: ${sError.message}`, record, alreadyPersisted: false };
      }

      const exStats = currentStats ?? {
        online_matches: 0, online_wins: 0, online_losses: 0, online_draws: 0,
        ranked_matches: 0, ranked_wins: 0, ranked_losses: 0,
        current_win_streak: 0, best_win_streak: 0,
      };

      const newWinStreak = isWin ? exStats.current_win_streak + 1 : 0;
      const newBestStreak = Math.max(exStats.best_win_streak, newWinStreak);

      const { error: statsError } = await this._client
        .from('player_stats')
        .upsert({
          user_id: p.accountId,
          online_matches: exStats.online_matches + 1,
          online_wins: exStats.online_wins + isWin,
          online_losses: exStats.online_losses + isLoss,
          online_draws: exStats.online_draws + isDraw,
          ranked_matches: exStats.ranked_matches + (queueId === 'ranked' ? 1 : 0),
          ranked_wins: exStats.ranked_wins + (queueId === 'ranked' ? isWin : 0),
          ranked_losses: exStats.ranked_losses + (queueId === 'ranked' ? isLoss : 0),
          current_win_streak: newWinStreak,
          best_win_streak: newBestStreak,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (statsError) {
        return { success: false, error: `player_stats upsert failed: ${statsError.message}`, record, alreadyPersisted: false };
      }
    }

    return { success: true, error: null, record, alreadyPersisted: false };
  }

  /**
   * @param {Array<import('./match-result-persistor.mjs').AchievementUnlockRecord>} unlocks
   */
  async persistAchievementUnlocks(unlocks) {
    if (!unlocks || unlocks.length === 0) {
      return { success: true, error: null, persisted: 0 };
    }

    // Build rows for upsert — only for unlocks with accountId
    const rows = [];
    for (const u of unlocks) {
      if (!u.accountId || !u.achievementId) continue;
      rows.push({
        user_id: u.accountId,
        achievement_id: u.achievementId,
        unlocked_at: u.unlockedAt,
        provenance: 'SERVER', // Always SERVER — this is the service role writing
        rules_version: u.rulesVersion ?? null,
        product_version: u.productVersion ?? null,
      });
    }

    if (rows.length === 0) {
      return { success: true, error: null, persisted: 0 };
    }

    // Upsert with onConflict on (user_id, achievement_id) for idempotency.
    // The PK on account_achievements prevents duplicates.
    const { error } = await this._client
      .from('account_achievements')
      .upsert(rows, { onConflict: 'user_id,achievement_id' });

    if (error) {
      return { success: false, error: `account_achievements upsert failed: ${error.message}`, persisted: 0 };
    }

    return { success: true, error: null, persisted: rows.length };
  }

  /**
   * Persist achievement progress updates (IRX-H31).
   * @param {Array<{ accountId: string, achievementId: string, progress: number, target: number|null, updatedAt: string, matchId: string }>} progress
   * @returns {Promise<{ success: boolean, error: string|null, persisted: number }>}
   */
  async persistAchievementProgress(progress) {
    if (!progress || progress.length === 0) {
      return { success: true, error: null, persisted: 0 };
    }

    const rows = [];
    for (const p of progress) {
      if (!p.accountId || !p.achievementId) continue;
      rows.push({
        user_id: p.accountId,
        achievement_id: p.achievementId,
        progress: p.progress,
        target: p.target ?? null,
        updated_at: p.updatedAt,
        last_match_id: p.matchId ?? null,
      });
    }

    if (rows.length === 0) {
      return { success: true, error: null, persisted: 0 };
    }

    // Upsert with onConflict on (user_id, achievement_id) for idempotency.
    const { error } = await this._client
      .from('achievement_progress')
      .upsert(rows, { onConflict: 'user_id,achievement_id' });

    if (error) {
      return { success: false, error: `achievement_progress upsert failed: ${error.message}`, persisted: 0 };
    }

    return { success: true, error: null, persisted: rows.length };
  }

  async close() {
    // Supabase client doesn't have an explicit close in v2
    // The HTTP connection pool is managed by the runtime
  }

  /**
   * Check if a guest→permanent migration has already been completed.
   * @param {string} migrationId - Deterministic migration ID
   * @returns {Promise<boolean>}
   */
  async isMigrationCompleted(migrationId) {
    const { data, error } = await this._client
      .from('account_migrations')
      .select('migration_id')
      .eq('migration_id', migrationId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  }

  /**
   * Execute a guest→permanent account migration.
   * Copies local achievements from the guest identity to the permanent identity
   * and writes an account_migrations row for idempotency.
   *
   * The achievements are written with LOCAL_DEVICE provenance (not SERVER)
   * because they were earned locally on the guest's device. The migration
   * record prevents re-running.
   *
   * @param {object} plan - Migration plan
   * @param {string} plan.migrationId - Deterministic migration ID
   * @param {string} plan.sourceIdentity - Guest user UUID
   * @param {string} plan.targetIdentity - Permanent user UUID
   * @param {Array<{ achievementId: string, unlockedAt: string, provenance?: string }>} achievements - Local achievements to migrate
   * @returns {Promise<{ success: boolean, error: string|null, migrationId: string, achievementsTransferred: number, alreadyMigrated: boolean }>}
   */
  async executeGuestMigration(plan, achievements) {
    // Idempotency gate: if already migrated, return success without re-writing
    if (await this.isMigrationCompleted(plan.migrationId)) {
      return { success: true, error: null, migrationId: plan.migrationId, achievementsTransferred: 0, alreadyMigrated: true };
    }

    // Step 1: Write achievements to the target account
    let achievementsTransferred = 0;
    if (achievements && achievements.length > 0) {
      const rows = achievements.map(a => ({
        user_id: plan.targetIdentity,
        achievement_id: a.achievementId,
        unlocked_at: a.unlockedAt,
        provenance: a.provenance ?? 'LOCAL_DEVICE',
      }));

      const { error: achError } = await this._client
        .from('account_achievements')
        .upsert(rows, { onConflict: 'user_id,achievement_id' });

      if (achError) {
        return { success: false, error: `account_achievements migration upsert failed: ${achError.message}`, migrationId: plan.migrationId, achievementsTransferred: 0, alreadyMigrated: false };
      }
      achievementsTransferred = rows.length;
    }

    // Step 2: Write the migration record (idempotency for future re-runs)
    const { error: migError } = await this._client
      .from('account_migrations')
      .insert({
        migration_id: plan.migrationId,
        source_identity: plan.sourceIdentity,
        target_identity: plan.targetIdentity,
        migration_version: plan.migrationVersion ?? 1,
      });

    if (migError) {
      // If the migration row already exists (race condition), the achievements
      // were already written — this is a safe state. Return success.
      if (migError.code === '23505') { // unique_violation
        return { success: true, error: null, migrationId: plan.migrationId, achievementsTransferred, alreadyMigrated: true };
      }
      return { success: false, error: `account_migrations insert failed: ${migError.message}`, migrationId: plan.migrationId, achievementsTransferred, alreadyMigrated: false };
    }

    return { success: true, error: null, migrationId: plan.migrationId, achievementsTransferred, alreadyMigrated: false };
  }
}
