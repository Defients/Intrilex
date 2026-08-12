// ═══════════════════════════════════════════════════════════════
// relationships.mjs — Player Relationships domain contracts (pure)
//
// The social-graph foundation for Intrilex. Bridges the Player
// Directory (discovery), Recent Opponents (head-to-head history),
// and Profiles (identity) into a coherent relationship layer.
//
// Three relationship kinds, each with distinct semantics:
//   FOLLOW — lightweight social subscription. Asymmetric. The follower
//            sees the target in their Rivals/Follows list. The target
//            is NOT notified (no notification infrastructure yet) and
//            does not see their follower list.
//   RIVAL  — a stronger, competitive signal. A player marks an opponent
//            they want to track closely — usually someone they have a
//            competitive history with. Rivals are a subset of follows:
//            you can follow without rivaling, but rivaling implies
//            following (the UI enforces this; the schema stores both
//            rows or a single row with kind=RIVAL — see migration).
//   BLOCK  — safety/moderation. A blocked player cannot challenge you
//            to a direct duel (match server consults the relationship
//            table). Blocks are PRIVATE: the blocked player never sees
//            that they are blocked. Blocks do not appear in any public
//            surface.
//
// This module is PURE: no I/O, no side effects, no DB, no UI.
// The server-side queries live in supabase/migrations/0016_player_relationships.sql.
// The browser data layer lives in apps/lab-web/src/play/players/relationships-data.js.
// The UI lives in apps/lab-web/src/workspaces/players.js (Rivals tab) and
// apps/lab-web/src/workspaces/profile.js (Follow/Rival buttons).
//
// Privacy: the RelationshipEntry DTO exposes ONLY the safe public
// projection of the TARGET player (same fields as DirectoryEntry's
// player block) PLUS the relationship kind, direction, and timestamp.
// It MUST NOT contain auth UUID, email, RD, volatility, tokens, IP,
// moderation notes, or private settings of either party.
//
// Rivalry intensity is DERIVED from head-to-head data (when available)
// — it is not stored. It is computed from the caller's head-to-head
// record against the target: more games + closer record = higher
// intensity. This makes "suggested rivals" a pure function of match
// history, not a subjective vote.
// ═══════════════════════════════════════════════════════════════

import { ratingToTierDivision, RankTier, Division } from './rank-tier.mjs';
import { computeWinRate } from './leaderboard.mjs';

/**
 * @readonly
 * @enum {string} Relationship kind. Each kind is stored as a distinct
 * row in player_relationships. RIVAL and FOLLOW are independent rows
 * (rivaling does not auto-follow at the schema level — the UI layer
 * coordinates the two so that rivaling also follows, but the domain
 * treats them as orthogonal signals).
 */
export const RelationshipKind = Object.freeze({
  FOLLOW: 'follow',
  RIVAL: 'rival',
  BLOCK: 'block',
});

/** Ordered list of valid relationship kinds (for validation). */
export const RELATIONSHIP_KINDS = Object.freeze([
  RelationshipKind.FOLLOW,
  RelationshipKind.RIVAL,
  RelationshipKind.BLOCK,
]);

/**
 * @readonly
 * @enum {string} Rivalry intensity band, derived from head-to-head.
 * Used by the UI to badge rival cards and sort the suggested-rivals list.
 */
export const RivalryIntensity = Object.freeze({
  NONE: 'none',       // No completed games (follow-only or new rivalry)
  EMERGING: 'emerging', // 1–2 games
  HEATED: 'heated',     // 3–9 games
  DEEP: 'deep',         // 10+ games
});

/**
 * Default and max limits for relationship queries.
 * @type {number}
 */
export const DEFAULT_RELATIONSHIPS_LIMIT = 25;
export const MAX_RELATIONSHIPS_LIMIT = 100;
export const RELATIONSHIPS_PAGE_SIZE = 25;

/**
 * Game-count thresholds for rivalry intensity bands.
 * @type {number}
 */
export const RIVALRY_EMERGING_THRESHOLD = 1;   // >= 1 game → emerging
export const RIVALRY_HEATED_THRESHOLD = 3;     // >= 3 games → heated
export const RIVALRY_DEEP_THRESHOLD = 10;      // >= 10 games → deep

/**
 * @typedef {Object} RelationshipPlayer
 * @property {string} publicPlayerId - Safe external id (PLY_xxx)
 * @property {string} displayName
 * @property {string|null} handle
 * @property {string|null} avatarUrl
 */

/**
 * @typedef {Object} RelationshipRank
 * @property {boolean} isPlacement - True while unranked / in placements.
 * @property {string} tier - One of RankTier (UNRANKED during placement).
 * @property {string} division - One of Division (NONE for unranked/apex).
 * @property {number|null} rating - Intrilex Rating, or null if no ranked history.
 * @property {boolean} isApex
 */

/**
 * @typedef {Object} HeadToHead
 * @property {number} wins - Matches the caller won against this target.
 * @property {number} losses - Matches the caller lost against this target.
 * @property {number} draws - Matches that ended in a draw.
 * @property {number} games - Total head-to-head games (wins + losses + draws).
 * @property {number} winRate - Caller's win rate [0,1], or 0 when no games.
 * @property {string|null} lastPlayedAt - ISO timestamp of the most recent match, or null.
 */

/**
 * @typedef {Object} RelationshipEntry
 * @property {RelationshipPlayer} player - The TARGET player (who you follow/rival/block).
 * @property {string} kind - One of RelationshipKind.
 * @property {RelationshipRank} rank - Target's ranked projection.
 * @property {HeadToHead} headToHead - Caller's head-to-head vs target (FOLLOW/RIVAL only; zeros for BLOCK).
 * @property {string} createdAt - ISO timestamp when the relationship was established.
 * @property {string} intensity - One of RivalryIntensity (derived from headToHead.games).
 * @property {boolean} isMutualRival - True when BOTH players have a RIVAL relationship with each other.
 * @property {number|null} earnedAchievements - Count if target's achievements are public, or null when hidden.
 */

/**
 * @typedef {Object} RelationshipStatus
 * @property {boolean} following - True when caller follows target.
 * @property {boolean} rivaling - True when caller has marked target as rival.
 * @property {boolean} blocking - True when caller has blocked target.
 * @property {boolean} isMutualRival - True when both players rival each other.
 * @property {string|null} followedAt - ISO timestamp of follow, or null.
 * @property {string|null} rivaledAt - ISO timestamp of rival, or null.
 * @property {string|null} blockedAt - ISO timestamp of block, or null.
 */

/**
 * Validate a relationship kind value.
 * @param {string|null|undefined} kind
 * @returns {string|null} The canonical kind, or null when invalid.
 */
export function validateRelationshipKind(kind) {
  if (!kind || typeof kind !== 'string') return null;
  return RELATIONSHIP_KINDS.includes(kind) ? kind : null;
}

/**
 * Derive the rivalry intensity band from a head-to-head game count.
 * Pure function — no I/O. Used by both the DTO builder and the
 * suggested-rivals ranking.
 * @param {number} games - Total head-to-head games (>= 0).
 * @returns {string} One of RivalryIntensity.
 */
export function deriveRivalryIntensity(games) {
  const g = Math.max(0, Number(games) || 0);
  if (g >= RIVALRY_DEEP_THRESHOLD) return RivalryIntensity.DEEP;
  if (g >= RIVALRY_HEATED_THRESHOLD) return RivalryIntensity.HEATED;
  if (g >= RIVALRY_EMERGING_THRESHOLD) return RivalryIntensity.EMERGING;
  return RivalryIntensity.NONE;
}

/**
 * Compute a rivalry "score" for ranking suggested rivals. Higher is a
 * stronger suggested rivalry. The score rewards:
 *   - more games played (linear)
 *   - closeness of the record (a 50/50 split is the most "rivalrous")
 *   - recency (a small bonus for having played recently)
 *
 * The score is a pure heuristic for sorting — it is never displayed
 * directly. It returns 0 when there are no completed games.
 *
 * @param {Object} opts
 * @param {number} opts.games
 * @param {number} [opts.wins]
 * @param {number} [opts.losses]
 * @param {number} [opts.draws]
 * @param {string|null} [opts.lastPlayedAt]
 * @returns {number}
 */
export function rivalryScore({ games, wins = 0, losses = 0, draws = 0, lastPlayedAt = null } = {}) {
  const g = Math.max(0, Number(games) || 0);
  if (g === 0) return 0;
  const w = Math.max(0, Number(wins) || 0);
  const l = Math.max(0, Number(losses) || 0);
  const d = Math.max(0, Number(draws) || 0);
  // games is authoritative, but guard against callers passing a games
  // value smaller than the sum of components (defensive — never negative).
  const effectiveGames = Math.max(g, w + l + d);
  // Closeness: 1.0 at 50/50 (ignoring draws), 0.0 at all-one-side.
  // decided = w + l (draws don't tilt the rivalry either way).
  const decided = w + l;
  const closeness = decided > 0
    ? 1 - Math.abs(w - l) / decided
    : 1; // all draws → perfectly balanced
  // Recency bonus: up to +5 for a match in the last 30 days, decaying to 0.
  let recency = 0;
  if (lastPlayedAt) {
    const then = new Date(lastPlayedAt).getTime();
    if (Number.isFinite(then)) {
      const days = Math.max(0, (Date.now() - then) / 86400000);
      recency = Math.max(0, 5 * (1 - days / 30));
    }
  }
  // games term dominates; closeness scales it; recency is a tiebreaker.
  return effectiveGames * (0.5 + 0.5 * closeness) + recency;
}

/**
 * Build a safe RelationshipEntry DTO from a raw server row. Strips all
 * private fields (auth UUID, email, RD, volatility, tokens, IP, notes)
 * from BOTH the caller and the target. Derives tier/division/apex and
 * rivalry intensity from canonical inputs.
 *
 * The head-to-head fields are from the CALLER's perspective — the same
 * convention as recent-opponents.mjs. For BLOCK relationships, the
 * head-to-head is zeroed (blocks are not a competitive relationship).
 *
 * @param {Object} row - Raw row from a relationships RPC
 * @returns {RelationshipEntry}
 */
export function toRelationshipEntry(row) {
  const kind = validateRelationshipKind(row.kind) ?? RelationshipKind.FOLLOW;
  const isBlock = kind === RelationshipKind.BLOCK;

  const ratedMatches = Math.max(0, Number(row.ratedMatches ?? row.rated_matches ?? 0));
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

  // Head-to-head (caller's perspective). Zeroed for blocks.
  const h2hWins = isBlock ? 0 : Math.max(0, Number(row.opponentWins ?? row.opponent_wins ?? 0));
  const h2hLosses = isBlock ? 0 : Math.max(0, Number(row.opponentLosses ?? row.opponent_losses ?? 0));
  const h2hDraws = isBlock ? 0 : Math.max(0, Number(row.opponentDraws ?? row.opponent_draws ?? 0));
  const h2hGames = h2hWins + h2hLosses + h2hDraws;
  const lastPlayedAt = isBlock ? null : (row.lastPlayedAt ?? row.last_played_at ?? null);

  const rawAch = row.earnedAchievements ?? row.earned_achievement_count;
  const earnedAch = rawAch != null ? Math.max(0, Number(rawAch) || 0) : null;

  return {
    player: {
      publicPlayerId: String(row.publicPlayerId ?? row.public_player_id ?? ''),
      displayName: String(row.displayName ?? row.display_name ?? 'Player'),
      handle: row.handle ?? null,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
    },
    kind,
    rank: {
      isPlacement,
      tier,
      division,
      rating,
      isApex,
    },
    headToHead: {
      wins: h2hWins,
      losses: h2hLosses,
      draws: h2hDraws,
      games: h2hGames,
      winRate: computeWinRate(h2hWins, h2hLosses, h2hDraws),
      lastPlayedAt,
    },
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    intensity: isBlock ? RivalryIntensity.NONE : deriveRivalryIntensity(h2hGames),
    isMutualRival: !isBlock && Boolean(row.isMutualRival ?? row.is_mutual_rival ?? false),
    earnedAchievements: earnedAch,
  };
}

/**
 * Process raw relationship rows into safe entries. Each (caller, target,
 * kind) appears at most once (the RPC deduplicates).
 *
 * @param {Object} opts
 * @param {Array<Record<string,*>>} opts.rows - Raw rows (already ordered by the RPC)
 * @returns {RelationshipEntry[]}
 */
export function processRelationshipRows({ rows } = {}) {
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => toRelationshipEntry(row));
}

/**
 * Build a RelationshipStatus DTO from a raw status row (the
 * get_relationship_status RPC returns a single row with boolean flags
 * and timestamps for each kind).
 * @param {Object} row
 * @returns {RelationshipStatus}
 */
export function toRelationshipStatus(row) {
  if (!row) {
    return {
      following: false, rivaling: false, blocking: false,
      isMutualRival: false, followedAt: null, rivaledAt: null, blockedAt: null,
    };
  }
  return {
    following: Boolean(row.following ?? false),
    rivaling: Boolean(row.rivaling ?? false),
    blocking: Boolean(row.blocking ?? false),
    isMutualRival: Boolean(row.isMutualRival ?? row.is_mutual_rival ?? false),
    followedAt: row.followedAt ?? row.followed_at ?? null,
    rivaledAt: row.rivaledAt ?? row.rivaled_at ?? null,
    blockedAt: row.blockedAt ?? row.blocked_at ?? null,
  };
}

/**
 * Format a head-to-head record as a human-readable string.
 * Example: "3–1–0" (wins-losses-draws, draws omitted when zero).
 * @param {HeadToHead} h2h
 * @returns {string}
 */
export function formatRelationshipHeadToHead(h2h) {
  if (!h2h || h2h.games === 0) return '0–0';
  const draws = h2h.draws > 0 ? `–${h2h.draws}` : '';
  return `${h2h.wins}–${h2h.losses}${draws}`;
}

/**
 * Human-readable label for a relationship kind.
 * @param {string} kind - One of RelationshipKind.
 * @returns {string}
 */
export function relationshipKindLabel(kind) {
  switch (kind) {
    case RelationshipKind.FOLLOW: return 'Following';
    case RelationshipKind.RIVAL: return 'Rival';
    case RelationshipKind.BLOCK: return 'Blocked';
    default: return 'Unknown';
  }
}

/**
 * Human-readable label for a rivalry intensity band.
 * @param {string} intensity - One of RivalryIntensity.
 * @returns {string}
 */
export function rivalryIntensityLabel(intensity) {
  switch (intensity) {
    case RivalryIntensity.EMERGING: return 'Emerging Rivalry';
    case RivalryIntensity.HEATED: return 'Heated Rivalry';
    case RivalryIntensity.DEEP: return 'Deep Rivalry';
    case RivalryIntensity.NONE:
    default: return 'No History';
  }
}

/**
 * Validate that a self-relationship is rejected. A player cannot follow,
 * rival, or block themselves — the RPC enforces this, but the domain
 * exposes the check so the UI can short-circuit without a round trip.
 * @param {string} callerPublicPlayerId
 * @param {string} targetPublicPlayerId
 * @returns {boolean} True when the relationship is a forbidden self-relationship.
 */
export function isSelfRelationship(callerPublicPlayerId, targetPublicPlayerId) {
  if (!callerPublicPlayerId || !targetPublicPlayerId) return false;
  return callerPublicPlayerId === targetPublicPlayerId;
}

// Re-export Division for DTO consumers.
export { Division };
