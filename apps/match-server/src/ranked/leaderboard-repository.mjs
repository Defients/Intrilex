// ═══════════════════════════════════════════════════════════════
// leaderboard-repository.mjs — Server-side Ranked leaderboard queries
//
// Calls the Supabase RPCs (get_ranked_leaderboard, get_player_standing,
// get_ranked_seasons, get_player_season_history) which perform
// deterministic server-side ranking. The browser never sorts the full
// table — it receives already-ranked safe DTOs.
//
// This repository may be used by the match server (for network protocol
// responses) or by a thin read API. It uses a service-role or anon
// Supabase client; the RPCs are SECURITY DEFINER and respect RLS for
// safe projection.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import {
  processLeaderboardRows,
  toLeaderboardEntry,
  normalizeSearchQuery,
  validateTierFilter,
  DEFAULT_LEADERBOARD_LIMIT,
  LEADERBOARD_PAGE_SIZE,
  MAX_LEADERBOARD_LIMIT,
} from '@intrilex/account-domain';

/**
 * @typedef {import('@intrilex/account-domain').LeaderboardEntry} LeaderboardEntry
 */

export class LeaderboardRepository {
  /**
   * @param {object} opts
   * @param {string} opts.supabaseUrl
   * @param {string} opts.supabaseKey - Anon key (RPCs are executable by authenticated) or service key
   * @param {string} [opts.accessToken] - Optional user access token for RLS-context queries
   */
  constructor({ supabaseUrl, supabaseKey, accessToken }) {
    if (!supabaseUrl) throw new Error('supabaseUrl is required');
    if (!supabaseKey) throw new Error('supabaseKey is required');
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
    this._client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: headers ? { headers } : undefined,
    });
  }

  /**
   * Fetch the canonical Ranked leaderboard (Top N + filters + search).
   * Ranking is performed server-side by the RPC; this method only
   * validates inputs and maps the safe rows to DTOs.
   * @param {Object} opts
   * @param {string} [opts.seasonId]
   * @param {string} [opts.queueId='ranked']
   * @param {string} [opts.tier] - Tier filter or null/ALL
   * @param {string} [opts.search]
   * @param {number} [opts.limit=100]
   * @param {number} [opts.offset=0]
   * @returns {Promise<{ entries: LeaderboardEntry[], seasonId: string }>}
   */
  async getLeaderboard(opts = {}) {
    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LEADERBOARD_LIMIT, 1), MAX_LEADERBOARD_LIMIT);
    const offset = Math.max(opts.offset ?? 0, 0);
    const tier = validateTierFilter(opts.tier ?? null);
    const search = normalizeSearchQuery(opts.search ?? '');
    const queueId = opts.queueId ?? 'ranked';

    const { data, error } = await this._client.rpc('get_ranked_leaderboard', {
      p_season_id: opts.seasonId ?? null,
      p_queue_id: queueId,
      p_tier_filter: tier,
      p_search: search,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`get_ranked_leaderboard failed: ${error.message}`);
    }

    const rows = data ?? [];
    const entries = rows.map((row, i) => toLeaderboardEntry({
      publicPlayerId: row.public_player_id,
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      rating: row.rating,
      ratedMatches: row.rated_matches,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      tier: row.tier,
      division: row.division,
      isApex: row.is_apex,
    }, offset + i + 1));

    return { entries, seasonId: opts.seasonId ?? null, count: entries.length };
  }

  /**
   * Fetch the signed-in player's standing (My Rank). Works outside Top 100.
   * @param {Object} opts
   * @param {string} [opts.seasonId]
   * @param {string} [opts.queueId='ranked']
   * @returns {Promise<LeaderboardEntry & { peakRating: number, placementsPlayed: number, isPlacement: boolean } | null>}
   */
  async getPlayerStanding(opts = {}) {
    const queueId = opts.queueId ?? 'ranked';
    const { data, error } = await this._client.rpc('get_player_standing', {
      p_season_id: opts.seasonId ?? null,
      p_queue_id: queueId,
      p_user_id: null, // RPC uses auth.uid()
    });

    if (error) {
      throw new Error(`get_player_standing failed: ${error.message}`);
    }
    if (!data || data.length === 0) return null;

    const row = data[0];
    const base = toLeaderboardEntry({
      publicPlayerId: row.public_player_id,
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      rating: row.rating,
      ratedMatches: row.rated_matches,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      tier: row.tier,
      division: row.division,
      isApex: row.is_apex,
    }, row.position);
    return {
      ...base,
      peakRating: row.peak_rating,
      placementsPlayed: row.placements_played,
      isPlacement: row.is_placement,
    };
  }

  /**
   * Fetch the season list for a picker (active + archives).
   * @param {string} [queueId='ranked']
   * @returns {Promise<Array<{ seasonId: string, name: string, ordinal: number, startsAt: string, endsAt: string, status: string }>>}
   */
  async getSeasons(queueId = 'ranked') {
    const { data, error } = await this._client.rpc('get_ranked_seasons', { p_queue_id: queueId });
    if (error) throw new Error(`get_ranked_seasons failed: ${error.message}`);
    return (data ?? []).map(r => ({
      seasonId: r.season_id,
      name: r.name,
      ordinal: r.ordinal,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status,
    }));
  }

  /**
   * Fetch the signed-in player's season history (current + archives).
   * @param {string} [queueId='ranked']
   * @returns {Promise<Array<object>>}
   */
  async getPlayerSeasonHistory(queueId = 'ranked') {
    const { data, error } = await this._client.rpc('get_player_season_history', { p_queue_id: queueId });
    if (error) throw new Error(`get_player_season_history failed: ${error.message}`);
    return data ?? [];
  }
}

export { DEFAULT_LEADERBOARD_LIMIT, LEADERBOARD_PAGE_SIZE };
