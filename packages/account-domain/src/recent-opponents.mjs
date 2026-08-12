// ═══════════════════════════════════════════════════════════════
// recent-opponents.mjs — Recent Opponents domain contracts (pure)
//
// The Recent Opponents surface bridges Match History and the Player
// Directory. It shows the players you've faced in completed online
// matches, with a head-to-head record (from your perspective) and a
// link to their public profile.
//
// This module is PURE: no I/O, no side effects, no DB, no UI.
// The server-side query lives in supabase/migrations/0015_recent_opponents.sql
// (get_recent_opponents RPC). The browser data layer lives in
// apps/lab-web/src/play/players/recent-opponents-data.js. The UI lives
// in apps/lab-web/src/workspaces/players.js.
//
// Recent Opponents vs Player Directory:
//   - Directory   = all discoverable players (opt-in, browsable by everyone)
//   - Recent Opps = players YOU have faced (authenticated only, no opt-in
//     needed — you already have a match relationship with them)
//
// Privacy: the OpponentEntry DTO exposes ONLY the safe public projection
// (same fields as DirectoryEntry) PLUS the head-to-head record derived
// from match_participants. It MUST NOT contain auth UUID, email, RD,
// volatility, tokens, IP, moderation notes, or private settings.
// The head-to-head is derived from the CALLER's result column, not the
// opponent's — so it reflects the caller's win/loss/draw, not the
// opponent's overall record.
// ═══════════════════════════════════════════════════════════════

import { ratingToTierDivision, RankTier, Division } from './rank-tier.mjs';
import { computeWinRate } from './leaderboard.mjs';

/**
 * Default and max limits for recent opponents queries.
 * @type {number}
 */
export const DEFAULT_RECENT_OPPONENTS_LIMIT = 25;
export const MAX_RECENT_OPPONENTS_LIMIT = 100;
export const RECENT_OPPONENTS_PAGE_SIZE = 25;

/**
 * @typedef {Object} OpponentPlayer
 * @property {string} publicPlayerId - Safe external id (PLY_xxx)
 * @property {string} displayName
 * @property {string|null} handle
 * @property {string|null} avatarUrl
 */

/**
 * @typedef {Object} OpponentRank
 * @property {boolean} isPlacement - True while unranked / in placements.
 * @property {string} tier - One of RankTier (UNRANKED during placement).
 * @property {string} division - One of Division (NONE for unranked/apex).
 * @property {number|null} rating - Intrilex Rating, or null if no ranked history.
 * @property {boolean} isApex
 */

/**
 * @typedef {Object} OpponentRecord
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} games
 * @property {number} winRate - [0,1], or 0 when no games.
 * @property {number} ratedMatches
 */

/**
 * @typedef {Object} HeadToHead
 * @property {number} wins - Matches the caller won against this opponent.
 * @property {number} losses - Matches the caller lost against this opponent.
 * @property {number} draws - Matches that ended in a draw.
 * @property {number} games - Total head-to-head games (wins + losses + draws).
 * @property {number} winRate - Caller's win rate [0,1], or 0 when no games.
 * @property {string|null} lastPlayedAt - ISO timestamp of the most recent match, or null.
 * @property {number} matchCount - Total matches played against this opponent.
 */

/**
 * @typedef {Object} OpponentEntry
 * @property {OpponentPlayer} player
 * @property {OpponentRank} rank
 * @property {OpponentRecord} record - Opponent's overall ranked record.
 * @property {HeadToHead} headToHead - Caller's head-to-head vs this opponent.
 * @property {number|null} earnedAchievements - Count if achievements are
 *   public, or null when the owner has hidden achievements.
 */

/**
 * Build a safe OpponentEntry DTO from a raw server row. Strips all
 * private fields (auth UUID, email, RD, volatility, tokens, IP, notes).
 * Derives tier/division/apex from the canonical domain.
 *
 * The head-to-head fields (opponent_wins, opponent_losses, opponent_draws)
 * are from the CALLER's perspective — "opponent_wins" means the caller
 * won that many matches against this opponent (the naming reflects that
 * these are wins in matches versus this opponent).
 *
 * @param {Object} row - Raw row from the recent opponents RPC
 * @returns {OpponentEntry}
 */
export function toOpponentEntry(row) {
  const ratedMatches = Math.max(0, Number(row.ratedMatches ?? row.rated_matches ?? 0));
  const wins = Math.max(0, Number(row.wins ?? 0));
  const losses = Math.max(0, Number(row.losses ?? 0));
  const draws = Math.max(0, Number(row.draws ?? 0));
  const games = wins + losses + draws;
  const hasRating = row.rating != null && Number.isFinite(Number(row.rating));
  const rating = hasRating ? Math.round(Number(row.rating)) : null;

  let tier = RankTier.UNRANKED;
  let division = Division.NONE;
  let isPlacement = true;
  let isApex = false;
  if (rating != null) {
    const assignment = ratingToTierDivision(rating, { ratedMatches });
    tier = assignment.tier;
    division = assignment.division;
    isPlacement = assignment.isPlacement;
    isApex = assignment.isApex;
  }

  // Head-to-head (from the caller's perspective)
  const h2hWins = Math.max(0, Number(row.opponentWins ?? row.opponent_wins ?? 0));
  const h2hLosses = Math.max(0, Number(row.opponentLosses ?? row.opponent_losses ?? 0));
  const h2hDraws = Math.max(0, Number(row.opponentDraws ?? row.opponent_draws ?? 0));
  const h2hGames = h2hWins + h2hLosses + h2hDraws;
  const matchCount = Math.max(0, Number(row.matchCount ?? row.match_count ?? h2hGames));
  const lastPlayedAt = row.lastPlayedAt ?? row.last_played_at ?? null;

  // earnedAchievements: null means the opponent hid achievements
  const rawAch = row.earnedAchievements ?? row.earned_achievement_count;
  const earnedAch = rawAch != null ? Math.max(0, Number(rawAch) || 0) : null;

  return {
    player: {
      publicPlayerId: String(row.publicPlayerId ?? row.public_player_id ?? ''),
      displayName: String(row.displayName ?? row.display_name ?? 'Player'),
      handle: row.handle ?? null,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
    },
    rank: {
      isPlacement,
      tier,
      division,
      rating,
      isApex,
    },
    record: {
      wins,
      losses,
      draws,
      games,
      winRate: computeWinRate(wins, losses, draws),
      ratedMatches,
    },
    headToHead: {
      wins: h2hWins,
      losses: h2hLosses,
      draws: h2hDraws,
      games: h2hGames,
      winRate: computeWinRate(h2hWins, h2hLosses, h2hDraws),
      lastPlayedAt,
      matchCount,
    },
    earnedAchievements: earnedAch,
  };
}

/**
 * Process raw recent opponent rows into safe entries. Each opponent
 * appears at most once (the RPC deduplicates by opponent user_id).
 *
 * @param {Object} opts
 * @param {Array<Record<string,*>>} opts.rows - Raw rows (already ordered by the RPC)
 * @returns {OpponentEntry[]}
 */
export function processOpponentRows({ rows } = {}) {
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => toOpponentEntry(row));
}

/**
 * Format a head-to-head record as a human-readable string.
 * Example: "3–1–0" (wins-losses-draws, draws omitted when zero).
 * @param {HeadToHead} h2h
 * @returns {string}
 */
export function formatHeadToHead(h2h) {
  if (!h2h || h2h.games === 0) return '0–0';
  const draws = h2h.draws > 0 ? `–${h2h.draws}` : '';
  return `${h2h.wins}–${h2h.losses}${draws}`;
}

/**
 * Format a relative time label for the last-played timestamp.
 * Returns a human-readable string like "2d ago", "3h ago", "just now",
 * or '—' when the timestamp is null.
 * @param {string|null} isoTimestamp
 * @returns {string}
 */
export function formatLastPlayed(isoTimestamp) {
  if (!isoTimestamp) return '—';
  const then = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(then)) return '—';
  const now = Date.now();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now'; // clock skew guard
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

// Re-export Division for DTO consumers.
export { Division };
