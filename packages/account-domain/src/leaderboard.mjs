// ═══════════════════════════════════════════════════════════════
// leaderboard.mjs — Leaderboard query contracts
//
// Pure functions for building and processing leaderboard queries.
// The actual Supabase queries happen in the browser using the
// user's authenticated Supabase client (RLS allows SELECT on
// player_ratings and player_stats for authenticated users).
//
// Leaderboard types:
//   - TOP_RATED: Top players by rating (descending)
//   - MOST_WINS: Top players by total wins (descending)
//   - BEST_STREAK: Top players by best win streak (descending)
// ═══════════════════════════════════════════════════════════════

/**
 * @readonly
 * @enum {string}
 */
export const LeaderboardType = Object.freeze({
  TOP_RATED: 'TOP_RATED',
  MOST_WINS: 'MOST_WINS',
  BEST_STREAK: 'BEST_STREAK',
});

/**
 * Default leaderboard parameters.
 */
export const DEFAULT_LEADERBOARD_LIMIT = 50;
export const MAX_LEADERBOARD_LIMIT = 200;
export const DEFAULT_SEASON_ID = 'season-0';

/**
 * @typedef {Object} LeaderboardEntry
 * @property {number} rank - 1-based rank position
 * @property {string} userId - Supabase user UUID
 * @property {string} [displayName] - From profiles table (joined)
 * @property {string} [handle] - From profiles table (joined)
 * @property {string} [avatarUrl] - From profiles table (joined)
 * @property {number} rating
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} ratedMatches
 * @property {boolean} provisional
 * @property {number} [winRate] - Computed win rate (0-1)
 */

/**
 * Build a Supabase query specification for a leaderboard.
 * Returns the table, filters, ordering, and limit — not the query itself,
 * since the caller (browser or server) executes it via their Supabase client.
 *
 * @param {object} opts
 * @param {string} [opts.type='TOP_RATED'] - LeaderboardType
 * @param {string} [opts.queueId='casual'] - Queue filter
 * @param {string} [opts.seasonId='season-0'] - Season filter
 * @param {number} [opts.limit=50] - Max entries
 * @param {boolean} [opts.includeProvisional=false] - Include provisional players
 * @returns {{ table: string, select: string, filters: Array<{ column: string, value: string }>, order: { column: string, ascending: boolean }, limit: number }}
 */
export function buildLeaderboardQuery(opts = {}) {
  const type = opts.type ?? LeaderboardType.TOP_RATED;
  const queueId = opts.queueId ?? 'casual';
  const seasonId = opts.seasonId ?? DEFAULT_SEASON_ID;
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LEADERBOARD_LIMIT, 1), MAX_LEADERBOARD_LIMIT);
  const includeProvisional = opts.includeProvisional ?? false;

  // Determine which table and ordering to use based on type
  let table, select, orderColumn, orderAsc;

  if (type === LeaderboardType.MOST_WINS || type === LeaderboardType.BEST_STREAK) {
    // player_stats has win counts and streaks
    table = 'player_stats';
    select = 'user_id, online_wins, online_losses, online_draws, current_win_streak, best_win_streak';
    orderColumn = type === LeaderboardType.MOST_WINS ? 'online_wins' : 'best_win_streak';
    orderAsc = false; // descending — most wins/best streak first
  } else {
    // TOP_RATED — player_ratings
    table = 'player_ratings';
    select = 'user_id, rating, wins, losses, draws, rated_matches, provisional';
    orderColumn = 'rating';
    orderAsc = false; // descending — highest rating first
  }

  /** @type {Array<{ column: string, value: string }>} */
  const filters = [];
  if (table === 'player_ratings') {
    filters.push({ column: 'queue_id', value: queueId });
    filters.push({ column: 'season_id', value: seasonId });
    if (!includeProvisional) {
      // Filter out provisional players — they don't have stable ratings yet
      // This is done client-side via .eq('provisional', false)
    }
  }

  return {
    table,
    select,
    filters,
    order: { column: orderColumn, ascending: orderAsc },
    limit,
  };
}

/**
 * Compute win rate from wins, losses, and draws.
 * @param {number} wins
 * @param {number} losses
 * @param {number} draws
 * @returns {number} Win rate in [0, 1], or 0 if no matches
 */
export function computeWinRate(wins, losses, draws) {
  const total = wins + losses + draws;
  if (total === 0) return 0;
  return wins / total;
}

/**
 * Process raw leaderboard rows from Supabase into ranked entries.
 * Assigns 1-based ranks, computes win rates, and optionally joins
 * profile data (displayName, handle, avatarUrl).
 *
 * @param {object} opts
 * @param {Array<Record<string, *>>} opts.rows - Raw rows from Supabase
 * @param {string} [opts.type='TOP_RATED'] - LeaderboardType
 * @param {Array<{ user_id: string, display_name: string, handle: string, avatar_url: string|null }>} [opts.profiles] - Joined profile data
 * @returns {LeaderboardEntry[]}
 */
export function processLeaderboardRows({ rows, type = LeaderboardType.TOP_RATED, profiles }) {
  if (!rows || rows.length === 0) return [];

  const profileById = new Map((profiles ?? []).map(p => [p.user_id, p]));

  return rows.map((row, index) => {
    const profile = profileById.get(row.user_id);
    const wins = row.wins ?? row.online_wins ?? 0;
    const losses = row.losses ?? row.online_losses ?? 0;
    const draws = row.draws ?? row.online_draws ?? 0;

    return {
      rank: index + 1,
      userId: row.user_id,
      displayName: profile?.display_name ?? null,
      handle: profile?.handle ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      rating: row.rating ?? 0,
      wins,
      losses,
      draws,
      ratedMatches: row.rated_matches ?? (wins + losses + draws),
      provisional: row.provisional ?? false,
      winRate: computeWinRate(wins, losses, draws),
    };
  });
}

/**
 * Find a player's rank in a leaderboard.
 * @param {LeaderboardEntry[]} leaderboard - Processed leaderboard
 * @param {string} userId - User to find
 * @returns {LeaderboardEntry | null}
 */
export function findPlayerRank(leaderboard, userId) {
  return leaderboard.find(e => e.userId === userId) ?? null;
}
