// ═══════════════════════════════════════════════════════════════
// directory.mjs — Player Directory domain contracts (pure)
//
// The Player Directory is the discovery surface between Profiles and
// the future social layer. It lists discoverable players (those who
// have opted into directory visibility) with a safe public projection
// only — never auth UUIDs, email, RD, volatility, tokens, or private
// account metadata.
//
// This module is PURE: no I/O, no side effects, no DB, no UI.
// The server-side query lives in supabase/migrations/0013_player_directory.sql
// (get_player_directory RPC). The browser data layer lives in
// apps/lab-web/src/play/players/players-data.js. The UI lives in
// apps/lab-web/src/workspaces/players.js.
//
// Directory vs Leaderboard:
//   - Leaderboard = canonical Ranked standings (placements-complete,
//     ranked-eligible only, deterministic position).
//   - Directory   = discoverable players (opt-in, includes unranked &
//     placement players, no competitive position).
//
// Ordering belongs to the database/backend (RPC), NOT the browser.
// The browser never loads every player and sorts client-side.
//
// Privacy: the DirectoryEntry DTO exposes ONLY safe public identity.
// It MUST NOT contain auth UUID, email, RD, volatility, tokens, IP,
// moderation notes, or any field the owner has set to PRIVATE.
// (publicPlayerId is the safe external id.)
// ═══════════════════════════════════════════════════════════════

import { ratingToTierDivision, RankTier, Division } from './rank-tier.mjs';
import { computeWinRate } from './leaderboard.mjs';

/**
 * @readonly
 * @enum {string} Directory sort options. Each must be honestly
 * implementable from real data; "online now" is intentionally absent
 * (no presence infrastructure).
 */
export const DirectorySort = Object.freeze({
  RATING: 'rating',     // Highest rated (canonical IR DESC)
  GAMES: 'games',       // Most rated games played
  RECENT: 'recent',     // Recently active (last rated match DESC)
  NEWEST: 'newest',     // Newest accounts (created_at DESC)
  NAME: 'name',         // Display name A–Z
});

/** Ordered list of valid sort values (for UI select + validation). */
export const DIRECTORY_SORTS = Object.freeze([
  DirectorySort.RATING,
  DirectorySort.GAMES,
  DirectorySort.RECENT,
  DirectorySort.NEWEST,
  DirectorySort.NAME,
]);

/** Human-readable labels for each sort option. */
export const DIRECTORY_SORT_LABELS = Object.freeze({
  [DirectorySort.RATING]: 'Highest Rated',
  [DirectorySort.GAMES]: 'Most Games',
  [DirectorySort.RECENT]: 'Recently Active',
  [DirectorySort.NEWEST]: 'Newest',
  [DirectorySort.NAME]: 'Name (A–Z)',
});

/**
 * Default directory parameters.
 * @type {number}
 */
export const DEFAULT_DIRECTORY_LIMIT = 50;
export const MAX_DIRECTORY_LIMIT = 100;
export const DIRECTORY_PAGE_SIZE = 25;

export const MIN_DIRECTORY_SEARCH_LENGTH = 2;
export const MAX_DIRECTORY_SEARCH_LENGTH = 64;

/**
 * @typedef {Object} DirectoryPlayer
 * @property {string} publicPlayerId - Safe external id (PLY_xxx)
 * @property {string} displayName
 * @property {string|null} handle
 * @property {string|null} avatarUrl
 * @property {string|null} createdAt - ISO timestamp of account creation
 */

/**
 * @typedef {Object} DirectoryRank
 * @property {boolean} isPlacement - True while unranked / in placements.
 * @property {string} tier - One of RankTier (UNRANKED during placement).
 * @property {string} division - One of Division (NONE for unranked/apex).
 * @property {number|null} rating - Intrilex Rating, or null if no ranked history.
 * @property {boolean} isApex
 */

/**
 * @typedef {Object} DirectoryRecord
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} games
 * @property {number} winRate - [0,1], or 0 when no games.
 * @property {number} ratedMatches
 */

/**
 * @typedef {Object} DirectoryEntry
 * @property {DirectoryPlayer} player
 * @property {DirectoryRank} rank
 * @property {DirectoryRecord} record
 * @property {number|null} earnedAchievements - Count if achievements are
 *   public, or null when the owner has hidden achievements.
 */

/**
 * Validate and normalize a directory search query. Returns null if the
 * query is too short, too long, or contains control characters. The raw
 * query is never used to construct SQL — the RPC parameterizes it.
 * @param {string} query
 * @returns {string|null} Trimmed query or null if invalid/empty-ish
 */
export function normalizeDirectorySearch(query) {
  if (typeof query !== 'string') return null;
  // Strip control characters (C0 + DEL) — char-code filter avoids a
  // literal control-character regex (no-control-regex lint rule).
  let cleaned = '';
  for (const ch of query) {
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c !== 0x7F) cleaned += ch;
  }
  cleaned = cleaned.trim();
  if (cleaned.length < MIN_DIRECTORY_SEARCH_LENGTH) return null;
  if (cleaned.length > MAX_DIRECTORY_SEARCH_LENGTH) return null;
  return cleaned;
}

/**
 * Validate a directory sort value. Returns the canonical DirectorySort
 * or the default (RATING) when invalid/empty.
 * @param {string|null|undefined} sort
 * @returns {string}
 */
export function validateDirectorySort(sort) {
  if (!sort || typeof sort !== 'string') return DirectorySort.RATING;
  return DIRECTORY_SORTS.includes(sort) ? sort : DirectorySort.RATING;
}

/**
 * Validate a tier filter value. Returns the canonical RankTier or null
 * (null = all tiers, including unranked/placement players).
 * @param {string|null} tier
 * @returns {string|null}
 */
export function validateDirectoryTierFilter(tier) {
  if (!tier || tier === 'ALL') return null;
  if (tier === RankTier.UNRANKED) return null; // unranked not a directory filter
  const valid = [
    RankTier.INITIATE, RankTier.CIPHER, RankTier.WARDEN, RankTier.VANGUARD,
    RankTier.ASCENDANT, RankTier.PARAGON, RankTier.SOVEREIGN, RankTier.INTRILEX,
  ];
  return valid.includes(tier) ? tier : null;
}

/**
 * Build a safe DirectoryEntry DTO from a raw server row. Strips all
 * private fields (auth UUID, email, RD, volatility, tokens, IP, notes).
 * Derives tier/division/apex from the canonical domain.
 *
 * Unranked / placement players (no rated history) are represented with
 * `rank.isPlacement = true`, `rank.tier = UNRANKED`, `rank.rating = null`.
 *
 * @param {Object} row - Raw row from the directory RPC
 * @returns {DirectoryEntry}
 */
export function toDirectoryEntry(row) {
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

  // earnedAchievements: null means the owner hid achievements; a number
  // (incl. 0) means achievements are public. The RPC returns
  // earned_achievement_count (snake_case); accept both forms.
  const rawAch = row.earnedAchievements ?? row.earned_achievement_count;
  const earnedAch = rawAch != null ? Math.max(0, Number(rawAch) || 0) : null;

  return {
    player: {
      publicPlayerId: String(row.publicPlayerId ?? row.public_player_id ?? ''),
      displayName: String(row.displayName ?? row.display_name ?? 'Player'),
      handle: row.handle ?? null,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
      createdAt: row.createdAt ?? row.created_at ?? null,
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
    earnedAchievements: earnedAch,
  };
}

/**
 * Process raw directory rows into safe entries. Unlike the leaderboard,
 * directory entries carry no competitive position (positions are a
 * Ranked-only concept).
 *
 * @param {Object} opts
 * @param {Array<Record<string, *>>} opts.rows - Raw rows (already ordered by the RPC)
 * @returns {DirectoryEntry[]}
 */
export function processDirectoryRows({ rows } = {}) {
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => toDirectoryEntry(row));
}

// Re-export Division for DTO consumers.
export { Division };
