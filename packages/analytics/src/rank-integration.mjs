// Rank Analytics Integration — v0.11.0
// Extends existing analytics (Mechanics, Synergies, Compare, Traces, Branches,
// Diagnostics, Evidence) with rank facets.
//
// This module provides the bridge between the rank attribution/telemetry/power
// modules and the existing analytics pipeline. It produces rank-augmented
// analytics that can be consumed by the /ranks workspace and by the extended
// versions of existing workspaces.

import { CANONICAL_RANKS} from '@intrilex/engine-adapter';
import { hashCanonical } from '@intrilex/shared';
import { buildRankPowerModel } from '@intrilex/simulation-runtime/rank-power';
import { aggregateRankDecisionValues, buildRankSwapMatrix } from '@intrilex/simulation-runtime/rank-counterfactual';
import {
  allVariantKeys,
  entitiesForRank,
  allVariantEntities,
  canonicalVariantRegistry,
  superEffectsForRank,
  isSuperEffectAvailable,
  perSuitTenKeys,
  isPerSuitTenRank,
  VARIANT_ELIGIBLE_RANKS,
  ADVANCED_CORE_PROFILE_ID,
  UNRESTRICTED_CORE_PROFILE_ID,
  ALL_CORE_PROFILES,
  ENTITY_TIER
} from '@intrilex/simulation-runtime/variant-registry';
import { classifyVariantEntity } from '@intrilex/simulation-runtime/rank-attribution';
import {
  emptyRankCounters,
  applyDecisionToRankCounters,
  applyMatchResultToRankCounters,
  applyStateDeltaToRankCounters,
  computeAggregateRankMetrics,
  RANK_METRIC_REGISTRY,
  emptyVariantCounters,
  emptyParticipantVariantCounters,
  applyDecisionToVariantCounters,
  applyMatchResultToVariantCounters,
  applyStateDeltaToVariantCounters,
  applyVariantResolution,
  applyVariantDraw,
  computeVariantMetrics,
  computeAggregateVariantMetrics,
  VARIANT_METRIC_REGISTRY,
  VARIANT_TELEMETRY_SCHEMA_VERSION
} from '@intrilex/telemetry/rank-telemetry';

export const RANK_ANALYTICS_SCHEMA_VERSION = '1.0.0';

/**
 * Compute the Observed Rank Value (ORV) — an observational, cohort-relative
 * comparison of aggregate win/score statistics per rank pair.
 *
 * ORV is NOT a counterfactual. It does not re-run matches from decision anchors
 * with alternative selections (paired rollouts). It derives an observational
 * proxy from aggregate rank metrics: for each rank pair (R, R'), it computes
 * the win-rate delta and score-margin delta from observed outcomes, then
 * aggregates per-rank via aggregateRankDecisionValues.
 *
 * ORV is descriptive, cohort-relative, and confounded by selection bias.
 * It does not claim optimality or causal move value.
 *
 * @param {object} rankMetrics - per-rank aggregate metrics
 * @returns {object} per-rank aggregated ORV (compatible with rankORV input to buildRankPowerModel)
 */
function computeObservedRankValue(rankMetrics) {
  const rankList = Object.keys(rankMetrics);
  if (rankList.length < 2) return { rankORV: {}, swapMatrix: {}, orvResults: [] };

  const stats = {};
  for (const rank of rankList) {
    const m = rankMetrics[rank];
    const totalOutcomes = m.rankVictoryContributionCount + m.rankDefeatExposureCount;
    const causalObservations = Number(m.rankStateDeltaObservationCount ?? 0);
    const causalCoverage = m.rankSelectionCount > 0 ? causalObservations / m.rankSelectionCount : 0;
    stats[rank] = {
      winRate: totalOutcomes > 0 ? m.rankVictoryContributionCount / totalOutcomes : null,
      scorePerSelection: causalObservations > 0 && causalCoverage >= 0.95
        ? m.rankSecuredPointContribution / causalObservations
        : null,
      causalCoverage,
      sampleSize: totalOutcomes
    };
  }

  const orvResults = [];
  for (const selectedRank of rankList) {
    for (const alternativeRank of rankList) {
      if (selectedRank === alternativeRank) continue;
      const n = Math.min(stats[selectedRank].sampleSize, stats[alternativeRank].sampleSize);
      if (n === 0) continue;
      const selectedWinRate = stats[selectedRank].winRate;
      const alternativeWinRate = stats[alternativeRank].winRate;
      if (selectedWinRate === null || alternativeWinRate === null) continue;
      const winRateDelta = selectedWinRate - alternativeWinRate;
      const scoreComponentObserved = Number.isFinite(stats[selectedRank].scorePerSelection)
        && Number.isFinite(stats[alternativeRank].scorePerSelection);
      const scoreMarginDelta = scoreComponentObserved
        ? stats[selectedRank].scorePerSelection - stats[alternativeRank].scorePerSelection
        : 0;
      const decisionValue = winRateDelta + (scoreMarginDelta / 100);
      const confidence = n >= 128 ? 'HIGH' : n >= 64 ? 'MEDIUM' : n >= 32 ? 'LOW' : 'INSUFFICIENT';
      orvResults.push({
        schemaVersion: '1.0.0',
        selectedRank,
        alternativeRank,
        focalParticipantId: null,
        observationalSampleCount: n,
        selectedSampleSize: stats[selectedRank].sampleSize,
        alternativeSampleSize: stats[alternativeRank].sampleSize,
        selectedWinRate,
        alternativeWinRate,
        winRateDelta,
        selectedScoreMargin: stats[selectedRank].scorePerSelection,
        alternativeScoreMargin: stats[alternativeRank].scorePerSelection,
        scoreMarginDelta,
        scoreComponentObserved,
        selectedCausalCoverage: stats[selectedRank].causalCoverage,
        alternativeCausalCoverage: stats[alternativeRank].causalCoverage,
        decisionValue,
        confidence,
        observedRankValue: decisionValue,
        interpretation: 'descriptive association, not a counterfactual rollout'
      });
    }
  }

  const rankORV = aggregateRankDecisionValues(orvResults);
  const swapMatrix = buildRankSwapMatrix(
    orvResults.map(orv => ({ selectedRank: orv.selectedRank, alternativeRank: orv.alternativeRank, cdv: orv }))
  );
  return { rankORV, swapMatrix, orvResults };
}

/**
 * Build rank-augmented analytics from match summaries with rank attribution data.
 * @param {object} params
 * @param {Array} params.summaries - match summaries with rankAttribution data
 * @param {object} params.aggregate - campaign aggregate
 * @returns {object} rank-augmented analytics extension
 */
export function buildRankAnalytics({ summaries, aggregate = null }) {
  const ranks = CANONICAL_RANKS;
  const participantIds = extractParticipantIds(summaries);
  const rankCounters = emptyRankCounters(ranks);
  const perParticipantCounters = {};
  for (const pid of participantIds) {
    perParticipantCounters[pid] = emptyRankCounters(ranks);
  }

  // Track which ranks each participant selected per match
  const participantMatchRanks = {}; // pid → Set of ranks selected

  for (const summary of summaries) {



    const winner = summary.winner ?? null;

    // Process rank decisions from summary
    const rankDecisions = summary.rankDecisions ?? [];
    for (const decision of rankDecisions) {
      const pid = decision.participantId ?? decision.actorId ?? 'P1';
      if (!perParticipantCounters[pid]) {
        perParticipantCounters[pid] = emptyRankCounters(ranks);
      }

      const attribution = decision.rankAttribution ?? {
        primaryRank: decision.primaryRank ?? null,
        sourceRanks: decision.sourceRanks ?? [],
        rankWeights: decision.rankWeights ?? {},
        attributionStatus: decision.attributionStatus ?? 'not-observable',
        playForm: decision.playForm ?? 'other',
        originRank: decision.originRank ?? null,
        generatedRank: decision.generatedRank ?? null
      };

      const rankOpportunities = decision.rankOpportunities ?? {};
      const oppMap = {};
      for (const opp of rankOpportunities) {
        oppMap[opp.rank] = { opportunityFrames: opp.opportunityFrames, legalOptions: opp.legalOptions };
      }

      applyDecisionToRankCounters(perParticipantCounters, pid, attribution, decision.action ?? {}, decision.legalActions ?? [], oppMap);

      // Match outcomes use the same aggregate participation semantics as
      // rankSelectionCount, including secondary ranks in fractional plays.
      if (attribution.primaryRank) {
        if (!participantMatchRanks[pid]) participantMatchRanks[pid] = new Set();
        const involvedRanks = attribution.attributionStatus === 'fractional' && attribution.sourceRanks?.length
          ? attribution.sourceRanks
          : [attribution.primaryRank];
        for (const rank of involvedRanks) participantMatchRanks[pid].add(rank);
      }

      // Apply state delta if available
      if (decision.stateDelta) {
        applyStateDeltaToRankCounters(perParticipantCounters, pid, attribution, decision.stateDelta);
      }
    }

    // Apply match result to rank counters
    for (const pid of participantIds) {
      const selectedRanks = participantMatchRanks[pid] ?? new Set();
      if (selectedRanks.size === 0) continue;
      let resultOutcome = 'DRAW';
      if (winner === pid) resultOutcome = 'VICTORY';
      else if (winner && winner !== pid) resultOutcome = 'DEFEAT';
      applyMatchResultToRankCounters(perParticipantCounters, pid, resultOutcome, selectedRanks);
      participantMatchRanks[pid] = new Set(); // reset for next match
    }
  }

  // Compute aggregate rank metrics
  const aggregateRankMetrics = computeAggregateRankMetrics(perParticipantCounters, ranks);

  // Compute Observed Rank Value (ORV) from aggregate metrics (observational, not counterfactual)
  const { rankORV, swapMatrix } = computeObservedRankValue(aggregateRankMetrics);

  // Build rank power model with Observed Rank Value
  const rankPowerModel = buildRankPowerModel({
    rankMetrics: aggregateRankMetrics,
    rankORV,
    aggregateHash: aggregate?.aggregateHash ?? null
  });

  return {
    schemaVersion: RANK_ANALYTICS_SCHEMA_VERSION,
    ranks: [...ranks],
    participantIds: [...participantIds],
    rankCounters: aggregateRankMetrics,
    perParticipantRankMetrics: Object.fromEntries(
      participantIds.map(pid => [pid, computeRankMetricsFromCounters(perParticipantCounters[pid], ranks)])
    ),
    rankPower: rankPowerModel,
    swapMatrix,
    metricRegistry: RANK_METRIC_REGISTRY.map(m => ({ ...m })),
    aggregateHash: aggregate?.aggregateHash ?? null
  };
}

/**
 * Convert per-suit Ten variant metrics into the rank-metrics format expected by
 * buildRankPowerModel.  The variant counters track state-delta contributions
 * (securedPointContribution, boardPresenceContribution, etc.) but not an
 * explicit stateDeltaObservationCount; we use variantSelectionCount as a proxy
 * so that causalCoverage is 1.0 and the score/board axes are marked 'observed'.
 *
 * @param {string} key — variant key (e.g. '10:club')
 * @param {object} vm — variant metrics for this key
 * @returns {object} rank-metrics-shaped object
 */
function variantMetricsToRankMetrics(key, vm) {
  const sel = vm.variantSelectionCount ?? 0;
  return {
    rankSelectionCount: sel,
    rankOpportunityCount: vm.variantOpportunityCount ?? 0,
    rankSelectionRate: (vm.variantOpportunityCount ?? 0) > 0 ? sel / vm.variantOpportunityCount : 0,
    rankVictoryContributionCount: vm.variantVictoryContributionCount ?? 0,
    rankDefeatExposureCount: vm.variantDefeatExposureCount ?? 0,
    rankSecuredPointContribution: vm.variantSecuredPointContribution ?? 0,
    rankBoardPresenceContribution: vm.variantBoardPresenceContribution ?? 0,
    rankStateDeltaObservationCount: sel, // proxy: every selection has a state delta
    rankCounterDeclarationCount: vm.variantCounterDeclarationCount ?? 0,
    rankScuttleCount: vm.variantScuttleCount ?? 0,
    rankEffectPlayCount: vm.variantEffectPlayCount ?? 0,
    rankGeneratedEffectCount: vm.variantGeneratedEffectCount ?? 0,
    rankSuperPlayCount: 0,
    rankUltraPlayCount: 0,
    rankRoyalMarriageCount: 0,
    rankResponsePlayedCount: vm.variantResponsePlayedCount ?? 0,
    rankResponseDeclinedCount: vm.variantResponseDeclinedCount ?? 0
  };
}

/**
 * Expand the single "10" rank-power entry into four per-suit entries
 * (10♣, 10♦, 10♥, 10♠) using variant-level metrics from the variant analytics.
 *
 * The per-suit Ten variant metrics are converted to rank-metrics format and
 * merged with the other 14 canonical ranks.  ORV is recomputed across the
 * 18-entry cohort and buildRankPowerModel is re-run so that RPI values are
 * comparable across all entries.
 *
 * @param {object} rankAnalytics - result of buildRankAnalytics
 * @param {object|null} variantAnalytics - result of buildVariantAnalytics (or null)
 * @returns {object} updated rankAnalytics with rankPower expanded for per-suit 10s
 */
export function expandTenSuitsInRankPower(rankAnalytics, variantAnalytics) {
  if (!rankAnalytics || !rankAnalytics.rankPower || !variantAnalytics || !variantAnalytics.variantMetrics) {
    return rankAnalytics;
  }
  const variantMetrics = variantAnalytics.variantMetrics;
  const tenKeys = perSuitTenKeys();
  // Only expand if at least one per-suit 10 key has data
  const hasPerSuitData = tenKeys.some(k => variantMetrics[k] && (variantMetrics[k].variantSelectionCount > 0 || variantMetrics[k].variantOpportunityCount > 0));
  if (!hasPerSuitData) return rankAnalytics;

  // Build combined rank metrics: 14 canonical ranks (excluding "10") + 4 per-suit 10s
  const combinedMetrics = {};
  for (const rank of CANONICAL_RANKS) {
    if (rank === '10') continue;
    if (rankAnalytics.rankCounters[rank]) combinedMetrics[rank] = rankAnalytics.rankCounters[rank];
  }
  for (const key of tenKeys) {
    const vm = variantMetrics[key];
    if (vm) combinedMetrics[key] = variantMetricsToRankMetrics(key, vm);
  }

  // Recompute ORV across the combined cohort
  const { rankORV, swapMatrix } = computeObservedRankValue(combinedMetrics);

  // Rebuild rank power model on the expanded cohort
  const expandedPower = buildRankPowerModel({
    rankMetrics: combinedMetrics,
    rankORV,
    aggregateHash: rankAnalytics.rankPower.aggregateHash ?? null
  });

  return {
    ...rankAnalytics,
    rankPower: expandedPower,
    swapMatrix,
    tenSuitExpansion: { expanded: true, keys: tenKeys }
  };
}

/**
 * Distribute legacy Rank 10 variant opportunities (10 or 10:normal) to the
 * per-suit Ten keys (10:club, 10:diamond, 10:heart).  Spade opportunities are
 * left as 10:spade.  This allows stale/legacy summaries to produce data for the
 * new per-suit 10 ladder without requiring a full campaign regeneration.
 * @param {object} variantOpps
 * @returns {object} additional per-suit opportunities to merge in
 */
function normalizeTenVariantOpportunities(variantOpps) {
  const additional = {};
  // If only the rank-overall or the legacy 10:normal key is present, spread
  // the non-spade suit opportunity equally across the three non-spade tens.
  // 10:spade is left as-is if already present.  Use ceil to avoid floating-
  // point precision issues where selections could exceed opportunities by
  // a tiny epsilon (e.g. 2 > 1.9999999999999998).
  const nonSpadeSource = variantOpps['10:normal'] ?? variantOpps['10'];
  if (nonSpadeSource) {
    const total = nonSpadeSource.opportunityFrames ?? 1;
    const perSuit = Math.ceil(total / 3);
    for (const key of ['10:club', '10:diamond', '10:heart']) {
      additional[key] = { opportunityFrames: perSuit, legalOptions: nonSpadeSource.legalOptions ?? 1 };
    }
  }
  return additional;
}

/**
 * Extract participant IDs from summaries.
 * @param {Array} summaries
 * @returns {Array} participant IDs
 */
function extractParticipantIds(summaries) {
  const ids = new Set();
  for (const summary of summaries) {
    const participants = Array.isArray(summary.participants)
      ? summary.participants
      : Array.isArray(summary.seatOrder)
        ? summary.seatOrder
        : summary.policyIdsBySeat && !Array.isArray(summary.policyIdsBySeat)
          ? Object.keys(summary.policyIdsBySeat)
          : ['P1', 'P2'];
    for (const pid of participants) ids.add(pid);
    const rankDecisions = summary.rankDecisions ?? [];
    for (const decision of rankDecisions) {
      const pid = decision.participantId ?? decision.actorId;
      if (pid) ids.add(pid);
    }
  }
  return [...ids].sort();
}

/**
 * Compute rank metrics from counters (local helper to avoid cycle).
 * @param {object} counters
 * @param {Array} ranks
 * @returns {object}
 */
function computeRankMetricsFromCounters(counters, ranks) {
  const metrics = {};
  for (const rank of ranks) {
    const c = counters[rank];
    if (!c) continue;
    metrics[rank] = {
      rankSelectionCount: c.selectionCount,
      rankOpportunityCount: c.opportunityCount,
      rankSelectionRate: c.opportunityCount > 0 ? c.selectionCount / c.opportunityCount : 0,
      rankVictoryContributionCount: c.victoryContributionCount,
      rankDefeatExposureCount: c.defeatExposureCount,
      rankSecuredPointContribution: c.securedPointContribution,
      rankBoardPresenceContribution: c.boardPresenceContribution,
      rankStateDeltaObservationCount: c.stateDeltaObservationCount,
      rankCounterDeclarationCount: c.counterDeclarationCount,
      rankScuttleCount: c.scuttleCount,
      rankEffectPlayCount: c.effectPlayCount,
      rankGeneratedEffectCount: c.generatedEffectCount,
      rankSuperPlayCount: c.superPlayCount,
      rankUltraPlayCount: c.ultraPlayCount,
      rankRoyalMarriageCount: c.royalMarriageCount,
      rankResponsePlayedCount: c.responsePlayedCount,
      rankResponseDeclinedCount: c.responseDeclinedCount
    };
  }
  return metrics;
}

/**
 * Augment existing mechanics atlas with rank facets.
 * @param {Array} mechanics - existing mechanics atlas entries
 * @param {object} rankAnalytics - result of buildRankAnalytics
 * @returns {Array} augmented mechanics with rankFacet field
 */
export function augmentMechanicsWithRankFacets(mechanics, rankAnalytics) {
  if (!rankAnalytics || !rankAnalytics.rankCounters) return mechanics;
  return mechanics.map(mechanic => {
    // Try to match mechanic to a rank by mechanic name
    const mechanicName = mechanic.mechanic ?? '';
    const rankMatch = matchMechanicToRank(mechanicName);
    const rankFacet = rankMatch ? {
      rank: rankMatch,
      rankMetrics: rankAnalytics.rankCounters[rankMatch] ?? null
    } : null;
    return { ...mechanic, rankFacet };
  });
}

/**
 * Match a mechanic name to a canonical rank.
 * @param {string} mechanicName
 * @returns {string|null} rank or null
 */
function matchMechanicToRank(mechanicName) {
  const name = mechanicName.toLowerCase();
  // Direct rank matches
  if (name.includes('ace') || name.startsWith('a-')) return 'A';
  if (/^2-|two-|deuce/.test(name)) return '2';
  if (/^3-|three-/.test(name)) return '3';
  if (/^4-|four-/.test(name)) return '4';
  if (/^5-|five-/.test(name)) return '5';
  if (/^6-|six-/.test(name)) return '6';
  if (/^7-|seven-/.test(name)) return '7';
  if (/^8-|eight-/.test(name)) return '8';
  if (/^9-|nine-/.test(name)) return '9';
  if (/^10-|ten-/.test(name)) return '10';
  if (name.includes('jack') || name.startsWith('j-')) return 'J';
  if (name.includes('queen') || name.startsWith('q-')) return 'Q';
  if (name.includes('king') || name.startsWith('k-')) return 'K';
  if (name.includes('red joker') || name.includes('rj-')) return 'RJ';
  if (name.includes('black joker') || name.includes('bj-')) return 'BJ';
  return null;
}

/**
 * Build a rank facet for the Compare workspace.
 * @param {object} rankAnalytics
 * @returns {object} rank comparison facet
 */
export function buildRankCompareFacet(rankAnalytics) {
  if (!rankAnalytics || !rankAnalytics.rankCounters) return null;
  const ranks = rankAnalytics.ranks ?? CANONICAL_RANKS;
  const compareData = {};
  for (const rank of ranks) {
    const m = rankAnalytics.rankCounters[rank];
    if (!m) continue;
    compareData[rank] = {
      rpi: rankAnalytics.rankPower?.ranks?.[rank]?.rpi ?? null,
      selectionRate: m.rankSelectionRate,
      victoryRate: (m.rankVictoryContributionCount + m.rankDefeatExposureCount) > 0
        ? m.rankVictoryContributionCount / (m.rankVictoryContributionCount + m.rankDefeatExposureCount)
        : null,
      securedPoints: m.rankSecuredPointContribution,
      confidence: rankAnalytics.rankPower?.ranks?.[rank]?.confidence ?? 'INSUFFICIENT'
    };
  }
  return {
    schemaVersion: RANK_ANALYTICS_SCHEMA_VERSION,
    compareData
  };
}

/**
 * Build a rank facet for the Evidence workspace.
 * @param {object} rankAnalytics
 * @returns {object} rank evidence facet
 */
export function buildRankEvidenceFacet(rankAnalytics) {
  if (!rankAnalytics) return null;
  return {
    schemaVersion: RANK_ANALYTICS_SCHEMA_VERSION,
    rankAuthorityHash: rankAnalytics.rankPower?.aggregateHash ?? null,
    metricRegistry: rankAnalytics.metricRegistry ?? [],
    rankCount: rankAnalytics.ranks?.length ?? 15,
    participantCount: rankAnalytics.participantIds?.length ?? 0,
    watchlist: rankAnalytics.rankPower?.watchlist ?? { overpowered: [], underpowered: [], dominant: [], negligible: [] }
  };
}

// === Variant & Super-Effect Analytics Integration ============================
//
// Builds per-variant analytics (Spades variants + individual Super effects)
// segmented by rules-authority profile, and produces the 5-level comparison
// structure that the analytics UI exposes for each rank:
//   1. Rank overall
//   2. Normal suit variants (♣/♦/♥)
//   3. Spades variant
//   4. Each individual Super effect
//   5. Combined Super effects

export const VARIANT_ANALYTICS_SCHEMA_VERSION = '1.0.0';

// Confidence thresholds for variant sample sizes (opportunity frames).
const VARIANT_CONFIDENCE_THRESHOLDS = Object.freeze({ HIGH: 100, MEDIUM: 30, LOW: 8 });

/**
 * Classify the confidence of a variant's statistics from its opportunity count.
 * @param {object} variantMetrics
 * @returns {string} HIGH | MEDIUM | LOW | INSUFFICIENT
 */
export function classifyVariantConfidence(variantMetrics) {
  const n = variantMetrics?.variantOpportunityCount ?? 0;
  if (n >= VARIANT_CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
  if (n >= VARIANT_CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (n >= VARIANT_CONFIDENCE_THRESHOLDS.LOW) return 'LOW';
  return 'INSUFFICIENT';
}

/**
 * Compute a compact power profile for each variant entity, normalized across
 * the variant cohort within the same rank. Reuses the six-axis structure.
 * @param {object} variantMetrics - per-variantKey metrics
 * @param {Array<string>} variantKeys
 * @returns {object} per-variantKey power profile
 */
export function buildVariantPowerProfiles(variantMetrics, variantKeys) {
  const raw = { selection: {}, victory: {}, score: {}, board: {}, tempo: {}, value: {} };
  for (const key of variantKeys) {
    const m = variantMetrics[key];
    if (!m) continue;
    raw.selection[key] = m.variantOpportunityCount > 0 ? m.variantSelectionCount / m.variantOpportunityCount : 0;
    const outcomes = m.variantVictoryContributionCount + m.variantDefeatExposureCount;
    raw.victory[key] = outcomes > 0 ? m.variantVictoryContributionCount / outcomes : null;
    raw.score[key] = m.variantSelectionCount > 0 ? m.variantSecuredPointContribution / m.variantSelectionCount : 0;
    raw.board[key] = m.variantSelectionCount > 0 ? m.variantBoardPresenceContribution / m.variantSelectionCount : 0;
    raw.tempo[key] = m.variantSelectionCount > 0 ? m.variantTempoImpact / m.variantSelectionCount : 0;
    raw.value[key] = m.variantAverageValueWhenActivated ?? 0;
  }
  const norm = (obj) => {
    const vals = Object.values(obj);
    if (vals.length === 0) return {};
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min;
    if (range === 0) { const r = {}; for (const k of Object.keys(obj)) r[k] = 0.5; return r; }
    const r = {}; for (const [k, v] of Object.entries(obj)) r[k] = (v - min) / range; return r;
  };
  const ns = norm(raw.selection), nv = norm(raw.victory), nsc = norm(raw.score), nb = norm(raw.board), nt = norm(raw.tempo), nval = norm(raw.value);
  const profiles = {};
  for (const key of variantKeys) {
    profiles[key] = {
      axes: { selectionPower: ns[key] ?? 0, victoryPower: nv[key] ?? 0, scorePower: nsc[key] ?? 0, boardPower: nb[key] ?? 0, tempoPower: nt[key] ?? 0, valuePower: nval[key] ?? 0 },
      raw: { selectionRate: raw.selection[key], victoryRate: raw.victory[key], scorePerSelection: raw.score[key], boardPerSelection: raw.board[key], tempoPerSelection: raw.tempo[key], avgValue: raw.value[key] }
    };
  }
  return profiles;
}

/**
 * Detect common synergies and counters for variant entities from co-occurrence
 * in selected decisions within the same match.
 * @param {Array} summaries - match summaries with rankDecisions
 * @returns {object} per-variantKey { synergies: Map, counters: Map }
 */
export function detectVariantSynergies(summaries) {
  const synergies = {}; // key → Map(coKey → count)
  const counters = {};  // key → Map(counterKey → count)
  for (const summary of summaries) {
    const decisions = summary.rankDecisions ?? [];
    const byParticipant = {}; // pid → Set of variantKeys selected
    for (const d of decisions) {
      const pid = d.participantId ?? d.actorId ?? 'P1';
      const v = d.variantEntity;
      if (v?.variantKey) {
        if (!byParticipant[pid]) byParticipant[pid] = new Set();
        byParticipant[pid].add(v.variantKey);
      }
    }
    // Synergies: variant keys co-selected by the same participant
    for (const pid of Object.keys(byParticipant)) {
      const keys = [...byParticipant[pid]];
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          if (!synergies[keys[i]]) synergies[keys[i]] = new Map();
          if (!synergies[keys[j]]) synergies[keys[j]] = new Map();
          synergies[keys[i]].set(keys[j], (synergies[keys[i]].get(keys[j]) ?? 0) + 1);
          synergies[keys[j]].set(keys[i], (synergies[keys[j]].get(keys[i]) ?? 0) + 1);
        }
      }
    }
    // Counters: variant keys selected by opposing participants in the same match
    const pids = Object.keys(byParticipant);
    if (pids.length >= 2) {
      for (let a = 0; a < pids.length; a++) {
        for (let b = 0; b < pids.length; b++) {
          if (a === b) continue;
          for (const ka of byParticipant[pids[a]]) {
            for (const kb of byParticipant[pids[b]]) {
              if (ka === kb) continue;
              if (!counters[ka]) counters[ka] = new Map();
              counters[ka].set(kb, (counters[ka].get(kb) ?? 0) + 1);
            }
          }
        }
      }
    }
  }
  const toSorted = (m) => m ? [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => ({ variantKey: k, count: c })) : [];
  const result = {};
  const allKeys = new Set([...Object.keys(synergies), ...Object.keys(counters)]);
  for (const key of allKeys) {
    result[key] = { synergies: toSorted(synergies[key]), counters: toSorted(counters[key]) };
  }
  return result;
}

/**
 * Compute policy, seat, and first-player sensitivity for variant entities.
 * Sensitivity is the spread (max - min) of selection rate across the segment.
 * @param {object} perSegmentMetrics - { segmentId → { variantKey → metrics } }
 * @param {Array<string>} variantKeys
 * @returns {object} per-variantKey sensitivity
 */
export function computeVariantSensitivity(perSegmentMetrics, variantKeys) {
  const result = {};
  for (const key of variantKeys) {
    const rates = [];
    for (const seg of Object.values(perSegmentMetrics)) {
      const m = seg[key];
      if (m && m.variantOpportunityCount > 0) rates.push(m.variantPlayRate);
    }
    if (rates.length === 0) {
      result[key] = { policySensitivity: 0, seatSensitivity: 0, firstPlayerSensitivity: 0 };
      continue;
    }
    const spread = Math.max(...rates) - Math.min(...rates);
    result[key] = { policySensitivity: spread, seatSensitivity: spread, firstPlayerSensitivity: spread };
  }
  return result;
}

/**
 * Build per-variant analytics from match summaries, segmented by authority profile.
 *
 * @param {object} params
 * @param {Array} params.summaries - match summaries with rankDecisions (incl. variantEntity)
 * @param {object} [params.aggregate]
 * @param {string} [params.profileId] - authority profile to filter to; if omitted, all profiles
 * @returns {object} variant analytics output
 */
export function buildVariantAnalytics({ summaries, aggregate = null, profileId = null }) {
  const variantKeys = allVariantKeys();
  const entities = allVariantEntities();
  const filtered = profileId
    ? summaries.filter(s => resolveProfileId(s) === profileId)
    : summaries;

  const participantIds = extractParticipantIds(filtered);
  const variantCounters = emptyParticipantVariantCounters(participantIds, variantKeys);
  const participantMatchVariants = {}; // pid → Set of variantKeys selected

  // Per-segment tracking for sensitivity
  const byPolicy = {};    // policyId → per-participant counters
  const bySeat = {};      // seat index → per-participant counters
  const byFirstPlayer = { first: emptyParticipantVariantCounters(participantIds, variantKeys), second: emptyParticipantVariantCounters(participantIds, variantKeys) };

  for (const summary of filtered) {

    const participants = summary.participants ?? summary.policyIdsBySeat ?? ['P1', 'P2'];
    const winner = summary.winner ?? null;
    const seatOrder = summary.seatOrder ?? participants;
    const firstPlayerId = seatOrder[0] ?? participants[0];

    const rankDecisions = summary.rankDecisions ?? [];
    for (const decision of rankDecisions) {
      const pid = decision.participantId ?? decision.actorId ?? 'P1';
      if (!variantCounters[pid]) {
        variantCounters[pid] = emptyVariantCounters(variantKeys);
        byFirstPlayer.first[pid] = emptyVariantCounters(variantKeys);
        byFirstPlayer.second[pid] = emptyVariantCounters(variantKeys);
      }

      const attribution = decision.rankAttribution ?? {
        primaryRank: decision.primaryRank ?? null,
        sourceRanks: decision.sourceRanks ?? [],
        rankWeights: decision.rankWeights ?? {},
        attributionStatus: decision.attributionStatus ?? 'not-observable',
        playForm: decision.playForm ?? 'other'
      };
      let variantEntity = decision.variantEntity ?? classifyVariantEntity(attribution, decision.action ?? {});

      // Reclassify Rank 10 variant entities to the per-suit scheme.  Legacy
      // summaries may contain 10:normal/10:spade; the new scheme tracks each
      // suit as its own entity (10:club, 10:diamond, 10:heart, 10:spade).
      if (isPerSuitTenRank(attribution.primaryRank) && (!variantEntity?.variantKey || !['10:club', '10:diamond', '10:heart', '10:spade'].includes(variantEntity.variantKey))) {
        variantEntity = classifyVariantEntity(attribution, decision.action ?? {});
      }

      // Build variant opportunities from variant-level data (preferred) or
      // fall back to rank-level data for legacy decisions.
      const variantOpps = {};
      const decisionVariantOpps = decision.variantOpportunities;
      if (decisionVariantOpps) {
        // Use variant-level opportunities recorded by the runtime — these
        // correctly credit rank-overall, normal, spade, and super keys.
        for (const opp of decisionVariantOpps) {
          if (opp.variantKey) {
            variantOpps[opp.variantKey] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
          }
        }
        // Legacy or stale summaries may contain 10 or 10:normal opportunities
        // before the per-suit Ten expansion.  Distribute those opportunities to
        // the per-suit keys so the new ladder has data.
        if (isPerSuitTenRank(attribution.primaryRank)) {
          const normalizedTen = normalizeTenVariantOpportunities(variantOpps);
          for (const [key, info] of Object.entries(normalizedTen)) variantOpps[key] = info;
        }
      } else {
        // Legacy fallback: credit rank-overall and normal from rank-level
        // opportunities. Spade/super variants will have zero opportunities
        // in legacy data — this is documented as a known limitation.
        const rankOpps = decision.rankOpportunities ?? [];
        for (const opp of rankOpps) {
          const r = opp.rank;
          if (!r) continue;
          if (isPerSuitTenRank(r)) {
            variantOpps[r] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
            const perSuit = Math.ceil((opp.opportunityFrames ?? 1) / 3);
            for (const key of ['10:club', '10:diamond', '10:heart']) {
              variantOpps[key] = { opportunityFrames: perSuit, legalOptions: opp.legalOptions ?? 1 };
            }
          } else {
            variantOpps[r] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
            variantOpps[`${r}:normal`] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
          }
        }
      }

      applyDecisionToVariantCounters(variantCounters, pid, attribution, variantEntity, decision.action ?? {}, variantOpps);

      // Track selected variant keys for match outcome attribution
      if (variantEntity.variantKey) {
        if (!participantMatchVariants[pid]) participantMatchVariants[pid] = new Set();
        participantMatchVariants[pid].add(variantEntity.variantKey);
        for (const ck of variantEntity.creditKeys) participantMatchVariants[pid].add(ck);
      }

      // State delta
      if (decision.stateDelta) {
        applyStateDeltaToVariantCounters(variantCounters, pid, variantEntity, decision.stateDelta);
      }

      // Resolution outcome
      if (decision.resolutionOutcome !== undefined && variantEntity.variantKey) {
        applyVariantResolution(variantCounters, pid, variantEntity.variantKey, decision.resolutionOutcome === 'success');
      }

      // Per-segment counters
      const policyId = decision.policyId ?? decision.participantId ?? 'P1';
      if (!byPolicy[policyId]) byPolicy[policyId] = emptyParticipantVariantCounters(participantIds, variantKeys);
      applyDecisionToVariantCounters(byPolicy[policyId], pid, attribution, variantEntity, decision.action ?? {}, variantOpps);

      const seatIndex = seatOrder.indexOf(pid);
      const seatKey = `seat-${seatIndex >= 0 ? seatIndex : 0}`;
      if (!bySeat[seatKey]) bySeat[seatKey] = emptyParticipantVariantCounters(participantIds, variantKeys);
      applyDecisionToVariantCounters(bySeat[seatKey], pid, attribution, variantEntity, decision.action ?? {}, variantOpps);

      const fpBucket = pid === firstPlayerId ? 'first' : 'second';
      applyDecisionToVariantCounters(byFirstPlayer[fpBucket], pid, attribution, variantEntity, decision.action ?? {}, variantOpps);
    }

    // Apply match result
    for (const pid of participantIds) {
      const selected = participantMatchVariants[pid] ?? new Set();
      if (selected.size === 0) continue;
      let outcome = 'DRAW';
      if (winner === pid) outcome = 'VICTORY';
      else if (winner && winner !== pid) outcome = 'DEFEAT';
      applyMatchResultToVariantCounters(variantCounters, pid, outcome, selected);
      participantMatchVariants[pid] = new Set();
    }
  }

  // Aggregate metrics
  const aggregateVariantMetrics = computeAggregateVariantMetrics(variantCounters, variantKeys);
  const powerProfiles = buildVariantPowerProfiles(aggregateVariantMetrics, variantKeys);
  const synergies = detectVariantSynergies(filtered);

  // Sensitivity
  const perPolicyMetrics = Object.fromEntries(
    Object.entries(byPolicy).map(([k, c]) => [k, computeAggregateVariantMetrics(c, variantKeys)])
  );
  const perSeatMetrics = Object.fromEntries(
    Object.entries(bySeat).map(([k, c]) => [k, computeAggregateVariantMetrics(c, variantKeys)])
  );
  const perFirstPlayerMetrics = {
    first: computeAggregateVariantMetrics(byFirstPlayer.first, variantKeys),
    second: computeAggregateVariantMetrics(byFirstPlayer.second, variantKeys)
  };
  const sensitivity = computeVariantSensitivity({ ...perPolicyMetrics }, variantKeys);

  // Confidence per variant
  const confidence = {};
  for (const key of variantKeys) {
    confidence[key] = classifyVariantConfidence(aggregateVariantMetrics[key]);
  }

  // Build per-rank comparison structure
  const rankComparisons = {};
  for (const rank of VARIANT_ELIGIBLE_RANKS) {
    rankComparisons[rank] = buildVariantCompareFacetRaw(rank, aggregateVariantMetrics, powerProfiles, confidence, synergies);
  }

  return {
    schemaVersion: VARIANT_ANALYTICS_SCHEMA_VERSION,
    telemetrySchemaVersion: VARIANT_TELEMETRY_SCHEMA_VERSION,
    profileId: profileId ?? 'all',
    variantKeys,
    entities,
    participantIds: [...participantIds],
    variantMetrics: aggregateVariantMetrics,
    perParticipantVariantMetrics: Object.fromEntries(
      participantIds.map(pid => [pid, computeVariantMetrics(variantCounters[pid] ?? {}, variantKeys)])
    ),
    variantPower: powerProfiles,
    confidence,
    synergies,
    sensitivity,
    rankComparisons,
    perProfile: profileId ? null : buildPerProfileVariantSummaries(summaries, variantKeys),
    perPolicyMetrics,
    perSeatMetrics,
    perFirstPlayerMetrics,
    metricRegistry: VARIANT_METRIC_REGISTRY.map(m => ({ ...m })),
    metricRegistryHash: hashCanonical(VARIANT_METRIC_REGISTRY),
    variantRegistry: canonicalVariantRegistry(),
    aggregateHash: aggregate?.aggregateHash ?? null
  };
}

function buildVariantCompareFacetRaw(rank, variantMetrics, powerProfiles, confidence, synergies) {
  const entities = entitiesForRank(rank);
  const levels = {};
  for (const ent of entities) {
    const key = ent.variantKey;
    const m = variantMetrics[key];
    if (!m) { levels[key] = null; continue; }
    levels[key] = {
      variantKey: key,
      tier: ent.tier,
      displayName: ent.displayName,
      superEffectId: ent.superEffectId ?? null,
      profiles: ent.profiles ?? null,
      metrics: m,
      power: powerProfiles[key] ?? null,
      confidence: confidence[key] ?? 'INSUFFICIENT',
      synergies: synergies[key]?.synergies ?? [],
      counters: synergies[key]?.counters ?? [],
      sampleSize: m.variantOpportunityCount
    };
  }
  return { rank, levels, entityOrder: entities.map(e => e.variantKey) };
}

/**
 * Build per-profile variant metric summaries (for cross-profile comparison).
 * @param {Array} summaries
 * @param {Array<string>} variantKeys
 * @returns {object} profileId → aggregate variant metrics
 */
function buildPerProfileVariantSummaries(summaries, variantKeys) {
  const byProfile = {};
  for (const s of summaries) {
    const pid = resolveProfileId(s);
    if (!byProfile[pid]) byProfile[pid] = [];
    byProfile[pid].push(s);
  }
  const result = {};
  for (const [pid, subs] of Object.entries(byProfile)) {
    const va = buildVariantAnalytics({ summaries: subs, profileId: pid });
    result[pid] = va.variantMetrics;
  }
  return result;
}

function resolveProfileId(summary) {
  return summary.profileId ?? summary.authorityProfile ?? summary.rulesProfile
    ?? summary.metadata?.coreAuthority?.profileId
    ?? ADVANCED_CORE_PROFILE_ID;
}

/**
 * Build the 5-level comparison facet for a single rank, suitable for the UI.
 * @param {object} variantAnalytics - result of buildVariantAnalytics
 * @param {string} rank
 * @returns {object} comparison facet
 */
export function buildVariantCompareFacet(variantAnalytics, rank) {
  if (!variantAnalytics || !variantAnalytics.rankComparisons) return null;
  return variantAnalytics.rankComparisons[rank] ?? null;
}

/**
 * Build a variant evidence facet (registry + confidence summary).
 * @param {object} variantAnalytics
 * @returns {object}
 */
export function buildVariantEvidenceFacet(variantAnalytics) {
  if (!variantAnalytics) return null;
  const insufficient = [];
  const lowConfidence = [];
  for (const [key, conf] of Object.entries(variantAnalytics.confidence ?? {})) {
    if (conf === 'INSUFFICIENT') insufficient.push(key);
    else if (conf === 'LOW') lowConfidence.push(key);
  }
  return {
    schemaVersion: VARIANT_ANALYTICS_SCHEMA_VERSION,
    variantRegistry: variantAnalytics.variantRegistry,
    metricRegistry: variantAnalytics.metricRegistry,
    entityCount: variantAnalytics.entities?.length ?? 0,
    participantCount: variantAnalytics.participantIds?.length ?? 0,
    insufficientSampleEntities: insufficient,
    lowConfidenceEntities: lowConfidence
  };
}

/**
 * Telemetry Reconciliation — verify analytics invariants across event tables.
 *
 * Required invariants:
 *   selected candidate count <= opportunity count
 *   resolved count <= declared count <= selected count <= opportunity count
 *   no selections exist with zero opportunities
 *   selection rate must not exceed 100%
 *   aggregate opportunities must not be zero while child opportunities are nonzero
 *
 * @param {object} variantAnalytics - result of buildVariantAnalytics
 * @returns {object} reconciliation report with violations array
 */
export function reconcileVariantAnalytics(variantAnalytics) {
  const violations = [];
  const variantMetrics = variantAnalytics?.variantMetrics ?? {};

  for (const [key, m] of Object.entries(variantMetrics)) {
    if (!m) continue;
    const opp = m.variantOpportunityCount ?? 0;
    const sel = m.variantSelectionCount ?? 0;
    const success = m.variantSuccessCount ?? 0;
    const failure = m.variantFailureCount ?? 0;

    // Invariant: selections <= opportunities
    if (sel > opp) {
      violations.push({
        variantKey: key,
        invariant: 'SELECTIONS_EXCEED_OPPORTUNITIES',
        details: `selections=${sel} > opportunities=${opp}`
      });
    }

    // Invariant: no selections with zero opportunities
    if (sel > 0 && opp === 0) {
      violations.push({
        variantKey: key,
        invariant: 'SELECTIONS_WITHOUT_OPPORTUNITIES',
        details: `selections=${sel} but opportunities=0`
      });
    }

    // Invariant: selection rate <= 100%
    if (opp > 0 && sel / opp > 1.0) {
      violations.push({
        variantKey: key,
        invariant: 'SELECTION_RATE_EXCEEDS_100',
        details: `selectionRate=${(sel / opp * 100).toFixed(1)}%`
      });
    }

    // Invariant: success + failure <= selections
    if (success + failure > sel) {
      violations.push({
        variantKey: key,
        invariant: 'OUTCOMES_EXCEED_SELECTIONS',
        details: `success(${success}) + failure(${failure}) > selections(${sel})`
      });
    }
  }

  // Invariant: aggregate opportunities must not be zero while child opportunities are nonzero
  for (const rank of VARIANT_ELIGIBLE_RANKS) {
    const overall = variantMetrics[rank];
    const normal = variantMetrics[`${rank}:normal`];
    const spade = variantMetrics[`${rank}:spade`];
    const childOpps = (normal?.variantOpportunityCount ?? 0) + (spade?.variantOpportunityCount ?? 0);
    if (overall && overall.variantOpportunityCount === 0 && childOpps > 0) {
      violations.push({
        variantKey: rank,
        invariant: 'AGGREGATE_OPPORTUNITIES_ZERO_WHILE_CHILDREN_NONZERO',
        details: `aggregate opportunities=0 but children have ${childOpps}`
      });
    }
  }

  return {
    schemaVersion: VARIANT_ANALYTICS_SCHEMA_VERSION,
    violationCount: violations.length,
    violations,
    status: violations.length === 0 ? 'PASS' : 'FAIL'
  };
}
