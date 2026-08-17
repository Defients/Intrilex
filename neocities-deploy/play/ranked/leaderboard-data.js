// ═══════════════════════════════════════════════════════════════
// leaderboard-data.js — Browser-side Ranked leaderboard data fetcher
//
// Uses the authenticated Supabase browser client to call the server-side
// RPCs (get_ranked_leaderboard, get_player_standing, get_ranked_seasons,
// get_player_season_history). The browser NEVER sorts the full table —
// ranking is performed server-side. This module only validates inputs,
// calls the RPCs, and maps safe rows to DTOs.
//
// When Supabase is not configured (offline/local-only mode), it returns
// a structured "unavailable" result so the UI can show a graceful state
// without crashing Online Play (section 80).
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from '../network/supabase-client.js?v=4f30833b427f';
import {
  toLeaderboardEntry,
  normalizeSearchQuery,
  validateTierFilter,
  DEFAULT_LEADERBOARD_LIMIT,
  MAX_LEADERBOARD_LIMIT,
} from "../../account-domain/leaderboard.mjs";

/**
 * @typedef {import('@intrilex/account-domain').LeaderboardEntry} LeaderboardEntry
 */

/**
 * @typedef {Object} LeaderboardResult
 * @property {boolean} available - False when Supabase is not configured.
 * @property {LeaderboardEntry[]} entries
 * @property {string|null} seasonId
 * @property {number} count
 */

/**
 * Fetch the canonical Ranked leaderboard from the server RPC.
 * @param {Object} [opts]
 * @param {string} [opts.seasonId]
 * @param {string} [opts.queueId='ranked']
 * @param {string} [opts.tier] - Tier filter or null/ALL
 * @param {string} [opts.search]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @param {AbortSignal} [opts.signal] - Optional abort signal to cancel the request
 * @returns {Promise<LeaderboardResult>}
 */
export async function fetchLeaderboard(opts = {}) {
  if (!isSupabaseConfigured()) {
    return { available: false, entries: [], seasonId: null, count: 0 };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, entries: [], seasonId: null, count: 0 };

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LEADERBOARD_LIMIT, 1), MAX_LEADERBOARD_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);
  const tier = validateTierFilter(opts.tier ?? null);
  const search = normalizeSearchQuery(opts.search ?? '');
  const queueId = opts.queueId ?? 'ranked';

  const { data, error } = await client.rpc('get_ranked_leaderboard', {
    p_season_id: opts.seasonId ?? null,
    p_queue_id: queueId,
    p_tier_filter: tier,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  }, { signal: opts.signal ?? undefined });

  if (error) {
    throw new Error(`Leaderboard query failed (season=${opts.seasonId ?? 'active'}, tier=${tier ?? 'ALL'}): ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
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

  return { available: true, entries, seasonId: opts.seasonId ?? null, count: entries.length };
}

/**
 * Fetch the signed-in player's standing (My Rank). Works outside Top 100.
 * @param {Object} [opts]
 * @param {string} [opts.seasonId]
 * @param {string} [opts.queueId='ranked']
 * @param {AbortSignal} [opts.signal] - Optional abort signal to cancel the request
 * @returns {Promise<{ available: boolean, standing: (LeaderboardEntry & { peakRating: number, placementsPlayed: number, isPlacement: boolean }) | null }>}
 */
export async function fetchPlayerStanding(opts = {}) {
  if (!isSupabaseConfigured()) {
    return { available: false, standing: null };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, standing: null };

  const { data, error } = await client.rpc('get_player_standing', {
    p_season_id: opts.seasonId ?? null,
    p_queue_id: opts.queueId ?? 'ranked',
    p_user_id: null,
  }, { signal: opts.signal ?? undefined });

  if (error) {
    throw new Error(`Player standing query failed (season=${opts.seasonId ?? 'active'}): ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { available: true, standing: null };
  }
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
    available: true,
    standing: {
      ...base,
      peakRating: row.peak_rating,
      placementsPlayed: row.placements_played,
      isPlacement: row.is_placement,
    },
  };
}

/**
 * Fetch the season list for a picker.
 * @param {string} [queueId='ranked']
 * @param {AbortSignal} [signal] - Optional abort signal to cancel the request
 * @returns {Promise<{ available: boolean, seasons: Array<{ seasonId: string, name: string, ordinal: number, startsAt: string, endsAt: string, status: string }> }>}
 */
export async function fetchSeasons(queueId = 'ranked', signal) {
  if (!isSupabaseConfigured()) {
    return { available: false, seasons: [] };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, seasons: [] };

  const { data, error } = await client.rpc('get_ranked_seasons', { p_queue_id: queueId }, { signal: signal ?? undefined });
  if (error) throw new Error(`Seasons query failed (queue=${queueId}): ${error.message}`);
  const seasons = (Array.isArray(data) ? data : []).map(r => ({
    seasonId: r.season_id,
    name: r.name,
    ordinal: r.ordinal,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
  }));
  return { available: true, seasons };
}

/**
 * Fetch the signed-in player's season history (current + archives).
 * @param {string} [queueId='ranked']
 * @param {AbortSignal} [signal] - Optional abort signal to cancel the request
 * @returns {Promise<{ available: boolean, history: Array<object> }>}
 */
export async function fetchPlayerSeasonHistory(queueId = 'ranked', signal) {
  if (!isSupabaseConfigured()) {
    return { available: false, history: [] };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, history: [] };

  const { data, error } = await client.rpc('get_player_season_history', { p_queue_id: queueId }, { signal: signal ?? undefined });
  if (error) throw new Error(`Season history query failed (queue=${queueId}): ${error.message}`);
  return { available: true, history: Array.isArray(data) ? data : [] };
}
