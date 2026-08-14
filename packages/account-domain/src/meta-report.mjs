// ═══════════════════════════════════════════════════════════════
// meta-report.mjs — Competitive meta report (pure domain)
//
// Aggregates leaderboard entries into a meta snapshot: tier
// distribution, rating statistics, activity metrics, and
// competitive health indicators. All derived from deterministic
// leaderboard data — no AI interpretation, no fabricated stats.
//
// This module is PURE: no I/O, no DB, no UI. It takes an array of
// LeaderboardEntry-like objects and returns a structured meta report.
// ═══════════════════════════════════════════════════════════════

import { RankTier, RANK_LADDER } from './rank-tier.mjs';

/**
 * @typedef {Object} MetaTierBucket
 * @property {string} tier - RankTier identifier
 * @property {number} count - Number of players in this tier
 * @property {number} percentage - Share of total [0, 1]
 * @property {number} avgRating - Average IR in this tier
 * @property {number} avgWinRate - Average win rate [0, 1]
 * @property {number} totalGames - Total rated games played by players in this tier
 */

/**
 * @typedef {Object} MetaReport
 * @property {string} generatedAt - ISO timestamp
 * @property {string|null} seasonId - Season this report covers
 * @property {number} totalPlayers - Total ranked players
 * @property {number} totalGames - Total rated games across all players
 * @property {number} avgRating - Average IR across all players
 * @property {number} medianRating - Median IR
 * @property {number} avgWinRate - Average win rate [0, 1]
 * @property {MetaTierBucket[]} tierDistribution - One bucket per tier, ladder order
 * @property {string} dominantTier - Tier with the most players
 * @property {string} topTier - Highest tier with at least 1 player
 * @property {number} activePlayerCount - Players with >= 10 rated games
 * @property {number} placementPlayerCount - Players still in placements
 * @property {number} apexCount - Number of INTRILEX-tier players
 * @property {number} ratingSpread - max rating - min rating
 * @property {string} competitiveHealth - 'EMERGING' | 'GROWING' | 'ESTABLISHED' | 'MATURE'
 * @property {string} summary - One-sentence human-readable summary
 */

/**
 * Compute median of a sorted numeric array.
 * @param {number[]} sorted
 * @returns {number}
 */
function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Derive competitive health from player count and game volume.
 * @param {number} totalPlayers
 * @param {number} totalGames
 * @returns {string}
 */
function deriveCompetitiveHealth(totalPlayers, totalGames) {
  if (totalPlayers >= 200 && totalGames >= 2000) return 'MATURE';
  if (totalPlayers >= 100 && totalGames >= 1000) return 'ESTABLISHED';
  if (totalPlayers >= 20 && totalGames >= 200) return 'GROWING';
  return 'EMERGING';
}

/**
 * Build a meta report from an array of leaderboard entries.
 *
 * Each entry should have: { rank: { tier, rating, isApex }, record: { wins, losses, draws, games, winRate } }
 * This matches the LeaderboardEntry DTO from leaderboard.mjs.
 *
 * @param {Object[]} entries - Leaderboard entries
 * @param {Object} [opts]
 * @param {string|null} [opts.seasonId]
 * @returns {MetaReport}
 */
export function buildMetaReport(entries, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const totalPlayers = list.length;

  if (totalPlayers === 0) {
    return {
      generatedAt: new Date().toISOString(),
      seasonId: opts.seasonId ?? null,
      totalPlayers: 0,
      totalGames: 0,
      avgRating: 0,
      medianRating: 0,
      avgWinRate: 0,
      tierDistribution: RANK_LADDER.map(tier => ({
        tier, count: 0, percentage: 0, avgRating: 0, avgWinRate: 0, totalGames: 0,
      })),
      dominantTier: '—',
      topTier: '—',
      activePlayerCount: 0,
      placementPlayerCount: 0,
      apexCount: 0,
      ratingSpread: 0,
      competitiveHealth: 'EMERGING',
      summary: 'No ranked players yet. The ladder is open.',
    };
  }

  const ratings = list.map(e => e.rank?.rating ?? 0).sort((a, b) => a - b);
  const totalGames = list.reduce((sum, e) => sum + (e.record?.games ?? 0), 0);
  const avgRating = Math.round(ratings.reduce((a, b) => a + b, 0) / totalPlayers);
  const medRating = median(ratings);
  const avgWinRate = list.reduce((sum, e) => sum + (e.record?.winRate ?? 0), 0) / totalPlayers;
  const activePlayerCount = list.filter(e => (e.record?.games ?? 0) >= 10).length;
  const apexCount = list.filter(e => e.rank?.isApex === true).length;
  const ratingSpread = ratings[ratings.length - 1] - ratings[0];

  // Tier distribution
  const tierBuckets = RANK_LADDER.map(tier => {
    const inTier = list.filter(e => e.rank?.tier === tier);
    const count = inTier.length;
    const tierRatings = inTier.map(e => e.rank?.rating ?? 0);
    const tierGames = inTier.reduce((sum, e) => sum + (e.record?.games ?? 0), 0);
    const tierWinRate = count > 0
      ? inTier.reduce((sum, e) => sum + (e.record?.winRate ?? 0), 0) / count
      : 0;
    return {
      tier,
      count,
      percentage: count / totalPlayers,
      avgRating: tierRatings.length > 0 ? Math.round(tierRatings.reduce((a, b) => a + b, 0) / tierRatings.length) : 0,
      avgWinRate: tierWinRate,
      totalGames: tierGames,
    };
  });

  const dominantTier = tierBuckets.reduce((best, b) => b.count > best.count ? b : best, tierBuckets[0]).tier;
  const topTier = [...RANK_LADDER].reverse().find(t => tierBuckets.find(b => b.tier === t && b.count > 0)) ?? '—';

  // Placement players: those with UNRANKED tier or < PLACEMENTS_REQUIRED games
  // Since leaderboard entries are already ranked (they passed placements),
  // placement count is typically 0. But we check for completeness.
  const placementPlayerCount = list.filter(e => e.rank?.tier === RankTier.UNRANKED).length;

  const health = deriveCompetitiveHealth(totalPlayers, totalGames);

  const summary = buildMetaSummary({
    totalPlayers, totalGames, dominantTier, topTier, apexCount, health, avgRating,
  });

  return {
    generatedAt: new Date().toISOString(),
    seasonId: opts.seasonId ?? null,
    totalPlayers,
    totalGames,
    avgRating,
    medianRating: medRating,
    avgWinRate,
    tierDistribution: tierBuckets,
    dominantTier,
    topTier,
    activePlayerCount,
    placementPlayerCount,
    apexCount,
    ratingSpread,
    competitiveHealth: health,
    summary,
  };
}

/**
 * Build a human-readable meta summary sentence.
 * @param {Object} p
 * @returns {string}
 */
function buildMetaSummary(p) {
  const { totalPlayers, totalGames, dominantTier, topTier, apexCount, health, avgRating } = p;
  const parts = [];
  parts.push(`${totalPlayers} ranked player${totalPlayers === 1 ? '' : 's'}`);
  parts.push(`${totalGames} rated game${totalGames === 1 ? '' : 's'}`);
  parts.push(`average ${avgRating} IR`);
  if (dominantTier !== '—') parts.push(`most players in ${dominantTier}`);
  if (topTier !== '—' && topTier !== dominantTier) parts.push(`top tier reached: ${topTier}`);
  if (apexCount > 0) parts.push(`${apexCount} at INTRILEX tier`);
  parts.push(`competitive health: ${health}`);
  return parts.join(' · ');
}

/**
 * Format a tier bucket for display as a percentage string.
 * @param {MetaTierBucket} bucket
 * @returns {string}
 */
export function formatTierPercentage(bucket) {
  if (!bucket || bucket.count === 0) return '0%';
  return `${Math.round(bucket.percentage * 100)}%`;
}

/**
 * Get the tier distribution as a simple { tier, count } array
 * for chart rendering.
 * @param {MetaReport} report
 * @returns {Array<{ tier: string, count: number, label: string }>}
 */
export function getTierDistributionChart(report) {
  if (!report || !report.tierDistribution) return [];
  return report.tierDistribution.map(b => ({
    tier: b.tier,
    count: b.count,
    label: b.tier.charAt(0) + b.tier.slice(1).toLowerCase(),
  }));
}
