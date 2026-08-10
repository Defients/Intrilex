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
import { DEFAULT_RATING } from '@intrilex/account-domain';

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
   * @param {string} accountId
   * @param {string} queueId
   */
  async getRatingState(accountId, queueId) {
    const { data, error } = await this._client
      .from('player_ratings')
      .select('rating, rated_matches, provisional')
      .eq('user_id', accountId)
      .eq('queue_id', queueId)
      .eq('season_id', 'season-0')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch rating state: ${error.message}`);
    }
    if (!data) return null;
    return {
      rating: data.rating,
      ratedMatches: data.rated_matches,
      provisional: data.provisional,
    };
  }

  /**
   * @param {import('./match-result-persistor.mjs').MatchResultRecord} record
   */
  async persistMatchResult(record) {
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
      return { success: false, error: `matches insert failed: ${matchError.message}`, record };
    }

    // Step 2: Insert match_participants rows + update ratings/stats
    const queueId = record.queueId ?? 'casual';

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
        return { success: false, error: `match_participants insert failed: ${pError.message}`, record };
      }

      // Skip rating/stats updates for aborted matches
      if (p.result === 'ABORT') continue;

      // Update player_ratings (upsert)
      const isWin = p.result === 'WIN' ? 1 : 0;
      const isLoss = p.result === 'LOSS' ? 1 : 0;
      const isDraw = p.result === 'DRAW' ? 1 : 0;

      // Fetch current state to compute increments
      const { data: currentRating, error: rError } = await this._client
        .from('player_ratings')
        .select('rating, rated_matches, wins, losses, draws, provisional')
        .eq('user_id', p.accountId)
        .eq('queue_id', queueId)
        .eq('season_id', 'season-0')
        .maybeSingle();

      if (rError) {
        return { success: false, error: `player_ratings fetch failed: ${rError.message}`, record };
      }

      const existing = currentRating ?? {
        rating: DEFAULT_RATING, rated_matches: 0, wins: 0, losses: 0, draws: 0, provisional: true,
      };
      const newRatedMatches = existing.rated_matches + 1;

      const { error: ratingError } = await this._client
        .from('player_ratings')
        .upsert({
          user_id: p.accountId,
          queue_id: queueId,
          season_id: 'season-0',
          rating: p.ratingAfter ?? existing.rating,
          provisional: newRatedMatches < 10,
          rated_matches: newRatedMatches,
          wins: existing.wins + isWin,
          losses: existing.losses + isLoss,
          draws: existing.draws + isDraw,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,queue_id,season_id' });

      if (ratingError) {
        return { success: false, error: `player_ratings upsert failed: ${ratingError.message}`, record };
      }

      // Update player_stats (upsert)
      const { data: currentStats, error: sError } = await this._client
        .from('player_stats')
        .select('*')
        .eq('user_id', p.accountId)
        .maybeSingle();

      if (sError) {
        return { success: false, error: `player_stats fetch failed: ${sError.message}`, record };
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
        return { success: false, error: `player_stats upsert failed: ${statsError.message}`, record };
      }
    }

    return { success: true, error: null, record };
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

  async close() {
    // Supabase client doesn't have an explicit close in v2
    // The HTTP connection pool is managed by the runtime
  }
}
