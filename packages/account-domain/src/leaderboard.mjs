// ═══════════════════════════════════════════════════════════════
// leaderboard.mjs — Canonical Ranked leaderboard contracts (pure)
//
// ONE prestigious canonical Ranked leaderboard. No secondary boards
// (most-wins, streak, etc.) at launch — the architecture allows future
// board types without corrupting canonical Ranked standings.
//
// Ranking/order belongs to the database/backend (RPC), NOT the browser.
// The browser never loads every player and sorts client-side. This module
// defines the safe DTO shapes and the deterministic tie-break policy.
//
// Canonical ordering (deterministic, stable across identical queries):
//   rating            DESC
//   ratingDeviation   ASC   (more certain players rank higher on tie)
//   ratedMatches      DESC
//   lastRatedAt       DESC
//   publicPlayerId    ASC   (stable final tie-break)
//
// Privacy: the LeaderboardEntry DTO exposes ONLY safe public competitive
// identity. It MUST NOT contain auth UUID, email, RD, volatility, tokens,
// IP, or moderation notes. (publicPlayerId is the safe external id.)
// ═══════════════════════════════════════════════════════════════

import { ratingToTierDivision, RankTier, Division } from './rank-tier.mjs';

/**
 * @readonly
 * @enum {string} Leaderboard board type. Launch ships only RANKED.
 */
export const LeaderboardType = Object.freeze({
  RANKED: 'RANKED',
  // Future board types may be added here without affecting canonical
  // Ranked standings. Do NOT add MOST_WINS / BEST_STREAK — those are
  // explicitly out of scope for launch (section 73).
});

/**
 * Default leaderboard parameters.
 */
export const DEFAULT_LEADERBOARD_LIMIT = 100; // Top 100
export const MAX_LEADERBOARD_LIMIT = 200;
export const LEADERBOARD_PAGE_SIZE = 25;
export const MAX_SEARCH_RESULTS = 50;
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 64;

/**
 * Default season id used only when no season infrastructure is present.
 * Production uses the active season from the database.
 */
export const DEFAULT_SEASON_ID = 'season-1';

/**
 * @typedef {Object} LeaderboardPlayer
 * @property {string} publicPlayerId - Safe external id (PLY_xxx)
 * @property {string} displayName
 * @property {string|null} handle
 * @property {string|null} avatarUrl
 */

/**
 * @typedef {Object} LeaderboardRank
 * @property {string} tier - One of RankTier
 * @property {string} division - One of Division (NONE for apex/unranked)
 * @property {number} rating - Intrilex Rating (IR)
 * @property {boolean} isApex
 */

/**
 * @typedef {Object} LeaderboardRecord
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} games
 * @property {number} winRate - [0,1]
 */

/**
 * @typedef {Object} LeaderboardEntry
 * @property {number} position - 1-based deterministic position
 * @property {LeaderboardPlayer} player
 * @property {LeaderboardRank} rank
 * @property {LeaderboardRecord} record
 */

/**
 * Compute win rate from wins, losses, and draws.
 * Win rate = wins / (wins + losses + draws). Returns 0 if no games.
 * @param {number} wins
 * @param {number} losses
 * @param {number} draws
 * @returns {number} Win rate in [0, 1]
 */
export function computeWinRate(wins, losses, draws) {
  const w = Math.max(0, Number(wins) || 0);
  const l = Math.max(0, Number(losses) || 0);
  const d = Math.max(0, Number(draws) || 0);
  const total = w + l + d;
  if (total === 0) return 0;
  return w / total;
}

/**
 * The canonical deterministic tie-break comparator for leaderboard rows.
 * Higher standing → returns negative (sorts first in ascending order).
 *
 * Order:
 *   rating DESC, ratingDeviation ASC, ratedMatches DESC,
 *   lastRatedAt DESC, publicPlayerId ASC
 *
 * @param {Object} a - raw row { rating, ratingDeviation, ratedMatches, lastRatedAt, publicPlayerId }
 * @param {Object} b
 * @returns {number}
 */
export function leaderboardComparator(a, b) {
  if (a.rating !== b.rating) return b.rating - a.rating;
  const rdA = a.ratingDeviation ?? 0;
  const rdB = b.ratingDeviation ?? 0;
  if (rdA !== rdB) return rdA - rdB; // lower RD first
  const rmA = a.ratedMatches ?? 0;
  const rmB = b.ratedMatches ?? 0;
  if (rmA !== rmB) return rmB - rmA; // more matches first
  const laA = a.lastRatedAt ?? 0;
  const laB = b.lastRatedAt ?? 0;
  if (laA !== laB) return laB - laA; // more recent first
  const pidA = a.publicPlayerId ?? '';
  const pidB = b.publicPlayerId ?? '';
  return pidA.localeCompare(pidB); // stable final tie-break
}

/**
 * Build a safe LeaderboardEntry DTO from a raw server row. Strips all
 * private fields (auth UUID, email, RD, volatility, tokens, IP, notes).
 * Derives tier/division/apex from the canonical domain.
 *
 * @param {Object} row - Raw row from the leaderboard RPC/repository
 * @param {number} position - 1-based deterministic position
 * @returns {LeaderboardEntry}
 */
export function toLeaderboardEntry(row, position) {
  const rating = Math.round(Number(row.rating ?? 0));
  const ratedMatches = Number(row.ratedMatches ?? row.rated_matches ?? 0);
  const wins = Number(row.wins ?? 0);
  const losses = Number(row.losses ?? 0);
  const draws = Number(row.draws ?? 0);
  const assignment = ratingToTierDivision(rating, { ratedMatches });

  return {
    position,
    player: {
      publicPlayerId: String(row.publicPlayerId ?? row.public_player_id ?? ''),
      displayName: String(row.displayName ?? row.display_name ?? 'Player'),
      handle: row.handle ?? null,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
    },
    rank: {
      tier: assignment.tier,
      division: assignment.division,
      rating,
      isApex: assignment.isApex,
    },
    record: {
      wins,
      losses,
      draws,
      games: wins + losses + draws,
      winRate: computeWinRate(wins, losses, draws),
    },
  };
}

/**
 * Process raw leaderboard rows into safe ranked entries. Assigns
 * 1-based deterministic positions using the canonical comparator.
 *
 * @param {Object} opts
 * @param {Array<Record<string, *>>} opts.rows - Raw rows (already ordered by the RPC)
 * @param {number} [opts.offset=0] - Position offset for pagination
 * @returns {LeaderboardEntry[]}
 */
export function processLeaderboardRows({ rows, offset = 0 }) {
  if (!rows || rows.length === 0) return [];
  return rows.map((row, i) => toLeaderboardEntry(row, offset + i + 1));
}

/**
 * Find a player's entry in a leaderboard by publicPlayerId.
 * @param {LeaderboardEntry[]} leaderboard
 * @param {string} publicPlayerId
 * @returns {LeaderboardEntry | null}
 */
export function findPlayerRank(leaderboard, publicPlayerId) {
  return leaderboard.find(e => e.player.publicPlayerId === publicPlayerId) ?? null;
}

/**
 * Validate and normalize a search query. Returns null if the query is
 * too short, too long, or contains control characters. The raw query is
 * never used to construct SQL — the RPC parameterizes it.
 * @param {string} query
 * @returns {string|null} Trimmed query or null if invalid
 */
export function normalizeSearchQuery(query) {
  if (typeof query !== 'string') return null;
  // Strip control characters (C0 + DEL) — char-code filter avoids a
  // literal control-character regex (no-control-regex lint rule).
  let cleaned = '';
  for (const ch of query) {
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c !== 0x7F) cleaned += ch;
  }
  cleaned = cleaned.trim();
  if (cleaned.length < MIN_SEARCH_LENGTH) return null;
  if (cleaned.length > MAX_SEARCH_LENGTH) return null;
  return cleaned;
}

/**
 * Validate a tier filter value. Returns the canonical RankTier or null
 * (null = all tiers).
 * @param {string|null} tier
 * @returns {string|null}
 */
export function validateTierFilter(tier) {
  if (!tier || tier === 'ALL') return null;
  if (tier === RankTier.UNRANKED) return null; // unranked not a board filter
  const valid = [
    RankTier.INITIATE, RankTier.CIPHER, RankTier.WARDEN, RankTier.VANGUARD,
    RankTier.ASCENDANT, RankTier.PARAGON, RankTier.SOVEREIGN, RankTier.INTRILEX,
  ];
  return valid.includes(tier) ? tier : null;
}

/**
 * Derive the apex display label for an Intrilex-ranked player given
 * their leaderboard position. Returns "INTRILEX #N" when eligible, or
 * "INTRILEX" when no position is available (inactive/historical).
 * @param {number|null} position
 * @returns {string}
 */
export function apexLabel(position) {
  if (position && position > 0) return `INTRILEX #${position}`;
  return 'INTRILEX';
}

// Re-export Division for DTO consumers.
export { Division };
