// Browser-safe Rank Analytics — v0.21.0
// Combines rank attribution, telemetry, power model, variant analytics,
// campaign aggregation, and observatory analytics for the browser bundle.
//
// Rank attribution extracted to rank-attribution-browser.js (P4.3).
// Rank power model extracted to rank-power-model.js (P4.3).

import { parseIdentity, RANK_REGISTRY } from './engine/ranks.js?v=73b458295383';
import { hashCanonical, sha256Text } from './engine/browser-entry.js?v=73b458295383';
import { RULES_VERSION, ENGINE_VERSION } from './version.js?v=73b458295383';
import {
  CANONICAL_RANKS,
  classifyPlayForm,
  isNoAttributionAction,
  buildSourceCards,
  attributeRankAction,
  attributeAction,
} from './rank-attribution-browser.js?v=73b458295383';
import {
  RANK_POWER_SCHEMA_VERSION,
  RPI_AXIS_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  BALANCE_THRESHOLDS,
  computePowerAxes,
  computeObservedRPI,
  computeDecisionPower,
  buildBalanceWatchlist,
  buildRankPowerModel,
} from './rank-power-model.js?v=73b458295383';
import {
  buildMechanicsAtlas,
  analyzeSynergies,
  mineCausalMotifs,
  buildPolicyFingerprints,
  detectAnomalies,
  mcnemarPairedTest,
  pairedBootstrapABBA,
} from './observatory-analytics-browser.js?v=73b458295383';
import {
  mechanicRegistryHash,
  quarantineUnknownTags,
} from './mechanic-registry-browser.js?v=73b458295383';

// Re-export for backward compatibility (other modules import from browser-analytics)
export {
  CANONICAL_RANKS,
  classifyPlayForm,
  isNoAttributionAction,
  buildSourceCards,
  attributeRankAction,
  attributeAction,
  RANK_POWER_SCHEMA_VERSION,
  RPI_AXIS_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  BALANCE_THRESHOLDS,
  computePowerAxes,
  computeObservedRPI,
  computeDecisionPower,
  buildBalanceWatchlist,
  buildRankPowerModel,
};

// === Rank Telemetry (browser-safe) ===

export const TELEMETRY_SCHEMA_VERSION_V5 = '5.0.0';

export const RANK_METRIC_REGISTRY = Object.freeze([
  { metricId: 'rankSelectionCount', schemaVersion: '5.0.0', unit: 'count', description: 'Decisions where a rank was primary or participated in a fractional multi-rank play' },
  { metricId: 'rankOpportunityCount', schemaVersion: '5.0.0', unit: 'count', description: 'Number of decision frames where the rank was available as a legal option' },
  { metricId: 'rankSelectionRate', schemaVersion: '5.0.0', unit: 'ratio', description: 'Selection count divided by opportunity count' },
  { metricId: 'rankVictoryContributionCount', schemaVersion: '5.0.0', unit: 'count', description: 'Victories where the rank participated at least once for the winner' },
  { metricId: 'rankDefeatExposureCount', schemaVersion: '5.0.0', unit: 'count', description: 'Defeats where the rank participated at least once for the loser' },
  { metricId: 'rankSecuredPointContribution', schemaVersion: '5.0.0', unit: 'points', description: 'Sum of secured points contributed to actions with this rank attribution' },
  { metricId: 'rankBoardPresenceContribution', schemaVersion: '5.0.0', unit: 'count', description: 'Sum of board presence contributions for actions with this rank' },
  { metricId: 'rankStateDeltaObservationCount', schemaVersion: '5.0.0', unit: 'count', description: 'Attributed rank selections with an attached causal state delta, including observed zero deltas' },
  { metricId: 'rankCounterDeclarationCount', schemaVersion: '5.0.0', unit: 'count', description: 'Counter declarations attributed to this rank' },
  { metricId: 'rankScuttleCount', schemaVersion: '5.0.0', unit: 'count', description: 'Scuttle operations attributed to this rank' },
  { metricId: 'rankEffectPlayCount', schemaVersion: '5.0.0', unit: 'count', description: 'Effect plays attributed to this rank' },
  { metricId: 'rankGeneratedEffectCount', schemaVersion: '5.0.0', unit: 'count', description: 'Generated effects attributed to this rank as origin' },
  { metricId: 'rankSuperPlayCount', schemaVersion: '5.0.0', unit: 'count', description: 'Super plays attributed to this rank' },
  { metricId: 'rankUltraPlayCount', schemaVersion: '5.0.0', unit: 'count', description: 'Ultra plays attributed to this rank' },
  { metricId: 'rankRoyalMarriageCount', schemaVersion: '5.0.0', unit: 'count', description: 'Royal Marriage declarations attributed to this rank' },
  { metricId: 'rankResponsePlayedCount', schemaVersion: '5.0.0', unit: 'count', description: 'Response plays attributed to this rank' },
  { metricId: 'rankResponseDeclinedCount', schemaVersion: '5.0.0', unit: 'count', description: 'Response declines attributed to this rank' }
]);

export function emptyRankCounters(ranks = CANONICAL_RANKS) {
  const counters = {};
  for (const rank of ranks) {
    counters[rank] = {
      selectionCount: 0, opportunityCount: 0, victoryContributionCount: 0, defeatExposureCount: 0,
      securedPointContribution: 0, boardPresenceContribution: 0, stateDeltaObservationCount: 0, counterDeclarationCount: 0,
      scuttleCount: 0, effectPlayCount: 0, generatedEffectCount: 0, superPlayCount: 0,
      ultraPlayCount: 0, royalMarriageCount: 0, responsePlayedCount: 0, responseDeclinedCount: 0
    };
  }
  return counters;
}

export function emptyParticipantRankCounters(participantIds, ranks = CANONICAL_RANKS) {
  const result = {};
  for (const pid of participantIds) result[pid] = emptyRankCounters(ranks);
  return result;
}

export function applyDecisionToRankCounters(counters, participantId, attribution, action, legalActions = [], rankOpportunities = {}) {
  const participantCounters = counters[participantId];
  if (!participantCounters) return counters;

  for (const rank of Object.keys(rankOpportunities ?? {})) {
    if (participantCounters[rank]) participantCounters[rank].opportunityCount += 1;
  }

  if (attribution?.attributionStatus === 'not-observable') {
    if (action?.family === 'response-decline') {
      for (const rank of Object.keys(rankOpportunities ?? {})) {
        if (participantCounters[rank]) participantCounters[rank].responseDeclinedCount += 1;
      }
    }
    return counters;
  }

  const primaryRank = attribution?.primaryRank;
  if (!primaryRank || !participantCounters[primaryRank]) return counters;
  participantCounters[primaryRank].selectionCount += 1;

  const form = attribution.playForm;
  if (form === 'super') participantCounters[primaryRank].superPlayCount += 1;
  if (form === 'ultra') participantCounters[primaryRank].ultraPlayCount += 1;
  if (form === 'royal-marriage') {
    for (const rank of attribution.sourceRanks ?? []) {
      if (participantCounters[rank]) participantCounters[rank].royalMarriageCount += 1;
    }
  }
  if (form === 'generated') participantCounters[primaryRank].generatedEffectCount += 1;

  const family = action?.family ?? '';
  if (family === 'counter') participantCounters[primaryRank].counterDeclarationCount += 1;
  if (family === 'scuttle') participantCounters[primaryRank].scuttleCount += 1;
  if (family.startsWith('effect-')) participantCounters[primaryRank].effectPlayCount += 1;
  const isResponsePlay = attribution.semanticClass === 'free-response-play'
    || ['counter', 'disrupt', 'interrupt', 'instant', 'quick'].includes(family)
    || ['INSTANT', 'QUICK', 'INTERRUPT'].includes(action?.timingClass);
  if (isResponsePlay) participantCounters[primaryRank].responsePlayedCount += 1;

  // Preserve current aggregate-rank semantics for multi-rank plays. This is
  // intentionally separate from variant analytics, which classifies the
  // primary variant entity only.
  if (attribution.attributionStatus === 'fractional') {
    for (const rank of attribution.sourceRanks ?? []) {
      if (rank !== primaryRank && participantCounters[rank]) participantCounters[rank].selectionCount += 1;
    }
  }
  return counters;
}

export function applyMatchResultToRankCounters(counters, participantId, outcome, selectedRanks) {
  const c = counters[participantId];
  if (!c) return;
  for (const rank of selectedRanks) {
    if (!c[rank]) continue;
    if (outcome === 'VICTORY') c[rank].victoryContributionCount += 1;
    else if (outcome === 'DEFEAT') c[rank].defeatExposureCount += 1;
  }
}

export function applyStateDeltaToRankCounters(counters, participantId, attribution, stateDelta) {
  const participantCounters = counters[participantId];
  if (!participantCounters || attribution?.attributionStatus === 'not-observable') return counters;
  const primaryRank = attribution?.primaryRank;
  if (!primaryRank || !participantCounters[primaryRank]) return counters;
  const pointDelta = stateDelta?.securedPointDeltaByPlayer?.[participantId] ?? 0;
  const boardDelta = stateDelta?.boardPresenceDeltaByPlayer?.[participantId] ?? 0;
  if (attribution.attributionStatus === 'fractional') {
    for (const [rank, weight] of Object.entries(attribution.rankWeights ?? {})) {
      if (participantCounters[rank]) {
        participantCounters[rank].securedPointContribution += pointDelta * weight;
        participantCounters[rank].boardPresenceContribution += boardDelta * weight;
        participantCounters[rank].stateDeltaObservationCount += 1;
      }
    }
  } else {
    participantCounters[primaryRank].securedPointContribution += pointDelta;
    participantCounters[primaryRank].boardPresenceContribution += boardDelta;
    participantCounters[primaryRank].stateDeltaObservationCount += 1;
  }
  return counters;
}

export function computeAggregateRankMetrics(participantCounters, ranks = CANONICAL_RANKS) {
  const aggregate = {};
  for (const rank of ranks) {
    aggregate[rank] = {
      rankSelectionCount: 0, rankOpportunityCount: 0, rankVictoryContributionCount: 0,
      rankDefeatExposureCount: 0, rankSecuredPointContribution: 0, rankBoardPresenceContribution: 0,
      rankStateDeltaObservationCount: 0, rankCounterDeclarationCount: 0, rankScuttleCount: 0, rankEffectPlayCount: 0,
      rankGeneratedEffectCount: 0, rankSuperPlayCount: 0, rankUltraPlayCount: 0,
      rankRoyalMarriageCount: 0, rankResponsePlayedCount: 0, rankResponseDeclinedCount: 0,
      rankSelectionRate: 0
    };
    for (const pid of Object.keys(participantCounters)) {
      const c = participantCounters[pid]?.[rank];
      if (!c) continue;
      aggregate[rank].rankSelectionCount += c.selectionCount;
      aggregate[rank].rankOpportunityCount += c.opportunityCount;
      aggregate[rank].rankVictoryContributionCount += c.victoryContributionCount;
      aggregate[rank].rankDefeatExposureCount += c.defeatExposureCount;
      aggregate[rank].rankSecuredPointContribution += c.securedPointContribution;
      aggregate[rank].rankBoardPresenceContribution += c.boardPresenceContribution;
      aggregate[rank].rankStateDeltaObservationCount += c.stateDeltaObservationCount ?? 0;
      aggregate[rank].rankCounterDeclarationCount += c.counterDeclarationCount;
      aggregate[rank].rankScuttleCount += c.scuttleCount;
      aggregate[rank].rankEffectPlayCount += c.effectPlayCount;
      aggregate[rank].rankGeneratedEffectCount += c.generatedEffectCount;
      aggregate[rank].rankSuperPlayCount += c.superPlayCount;
      aggregate[rank].rankUltraPlayCount += c.ultraPlayCount;
      aggregate[rank].rankRoyalMarriageCount += c.royalMarriageCount;
      aggregate[rank].rankResponsePlayedCount += c.responsePlayedCount;
      aggregate[rank].rankResponseDeclinedCount += c.responseDeclinedCount;
    }
    aggregate[rank].rankSelectionRate = aggregate[rank].rankOpportunityCount > 0
      ? aggregate[rank].rankSelectionCount / aggregate[rank].rankOpportunityCount : 0;
  }
  return aggregate;
}

// === Rank Power Model (extracted to rank-power-model.js) ===

// === Full Rank Analytics (browser-safe) ===

export const RANK_ANALYTICS_SCHEMA_VERSION = '1.0.0';

// Observed Rank Value (ORV) is a descriptive cohort comparison, not a
// counterfactual. It compares each rank's observed win rate and score-per-
// selection against every other rank in the same campaign.
function computeObservedRankValue(rankMetrics) {
  const rankList = Object.keys(rankMetrics);
  if (rankList.length < 2) return { rankORV: {}, swapMatrix: {} };
  const stats = {};
  for (const rank of rankList) {
    const m = rankMetrics[rank];
    const total = m.rankVictoryContributionCount + m.rankDefeatExposureCount;
    const causalObservations = Number(m.rankStateDeltaObservationCount ?? 0);
    const causalCoverage = m.rankSelectionCount > 0 ? causalObservations / m.rankSelectionCount : 0;
    stats[rank] = {
      winRate: total > 0 ? m.rankVictoryContributionCount / total : null,
      scorePerSelection: causalObservations > 0 && causalCoverage >= 0.95
        ? m.rankSecuredPointContribution / causalObservations
        : null,
      causalCoverage,
      sampleSize: total
    };
  }

  const swapMatrix = {};
  const byRank = {};
  for (const selectedRank of rankList) {
    for (const alternativeRank of rankList) {
      if (selectedRank === alternativeRank) continue;
      const selected = stats[selectedRank];
      const alternative = stats[alternativeRank];
      const n = Math.min(selected.sampleSize, alternative.sampleSize);
      if (n === 0 || selected.winRate === null || alternative.winRate === null) continue;
      const winRateDelta = selected.winRate - alternative.winRate;
      const scoreComponentObserved = Number.isFinite(selected.scorePerSelection) && Number.isFinite(alternative.scorePerSelection);
      const scoreMarginDelta = scoreComponentObserved ? selected.scorePerSelection - alternative.scorePerSelection : 0;
      const decisionValue = winRateDelta + scoreMarginDelta / 100;
      const confidence = n >= 128 ? 'HIGH' : n >= 64 ? 'MEDIUM' : n >= 32 ? 'LOW' : 'INSUFFICIENT';
      const result = {
        schemaVersion: '1.0.0',
        selectedRank,
        alternativeRank,
        observationalSampleCount: n,
        sampleSize: n,
        selectedSampleSize: selected.sampleSize,
        alternativeSampleSize: alternative.sampleSize,
        selectedWinRate: selected.winRate,
        alternativeWinRate: alternative.winRate,
        winRateDelta,
        selectedScoreMargin: selected.scorePerSelection,
        alternativeScoreMargin: alternative.scorePerSelection,
        scoreMarginDelta,
        scoreComponentObserved,
        selectedCausalCoverage: selected.causalCoverage,
        alternativeCausalCoverage: alternative.causalCoverage,
        decisionValue,
        observedRankValue: decisionValue,
        confidence,
        interpretation: 'descriptive association, not a counterfactual rollout'
      };
      (swapMatrix[selectedRank] ??= {})[alternativeRank] = result;
      if (confidence === 'INSUFFICIENT') continue;
      const aggregate = byRank[selectedRank] ??= { values: [], effectiveSampleSize: 0, swapCount: 0 };
      aggregate.values.push(decisionValue);
      aggregate.effectiveSampleSize = Math.max(aggregate.effectiveSampleSize, selected.sampleSize);
      aggregate.swapCount += 1;
    }
  }

  const rankORV = {};
  for (const [rank, data] of Object.entries(byRank)) {
    rankORV[rank] = {
      rank,
      swapCount: data.swapCount,
      observationalSampleCount: data.effectiveSampleSize,
      sampleSize: data.effectiveSampleSize,
      totalRollouts: data.effectiveSampleSize, // legacy compatibility only
      averageDecisionValue: data.values.reduce((sum, value) => sum + value, 0) / data.values.length,
      confidence: data.effectiveSampleSize >= 128 ? 'HIGH' : data.effectiveSampleSize >= 64 ? 'MEDIUM' : data.effectiveSampleSize >= 32 ? 'LOW' : 'INSUFFICIENT'
    };
  }
  return { rankORV, swapMatrix };
}

export function buildRankAnalytics({ summaries, aggregate = null }) {
  const ranks = CANONICAL_RANKS;
  const participantIds = [...new Set((summaries ?? []).flatMap(summary => {
    const declared = Array.isArray(summary.participants)
      ? summary.participants
      : Array.isArray(summary.seatOrder)
        ? summary.seatOrder
        : summary.policyIdsBySeat && !Array.isArray(summary.policyIdsBySeat)
          ? Object.keys(summary.policyIdsBySeat)
          : [];
    const decisionActors = (summary.rankDecisions ?? []).map(decision => decision.participantId ?? decision.actorId).filter(Boolean);
    return [...declared, ...decisionActors];
  }))];
  if (participantIds.length === 0) participantIds.push('P1', 'P2');
  const rankCounters = emptyParticipantRankCounters(participantIds, ranks);
  const participantMatchRanks = {};

  for (const summary of summaries) {
    const winner = summary.winner ?? null;
    const rankDecisions = summary.rankDecisions ?? [];
    for (const decision of rankDecisions) {
      const pid = decision.participantId ?? 'P1';
      if (!rankCounters[pid]) rankCounters[pid] = emptyRankCounters(ranks);
      const attribution = decision.rankAttribution;
      const oppMap = {};
      for (const opp of (decision.rankOpportunities ?? [])) oppMap[opp.rank] = { opportunityFrames: opp.opportunityFrames, legalOptions: opp.legalOptions };
      applyDecisionToRankCounters(rankCounters, pid, attribution, decision.action ?? {}, decision.legalActions ?? [], oppMap);
      if (decision.stateDelta) {
        applyStateDeltaToRankCounters(rankCounters, pid, attribution, decision.stateDelta);
      }
      if (attribution.primaryRank) {
        if (!participantMatchRanks[pid]) participantMatchRanks[pid] = new Set();
        const involvedRanks = attribution.attributionStatus === 'fractional' && attribution.sourceRanks?.length
          ? attribution.sourceRanks
          : [attribution.primaryRank];
        for (const rank of involvedRanks) participantMatchRanks[pid].add(rank);
      }
    }
    for (const pid of participantIds) {
      const selectedRanks = participantMatchRanks[pid] ?? new Set();
      if (selectedRanks.size === 0) continue;
      let outcome = 'DRAW';
      if (winner === pid) outcome = 'VICTORY';
      else if (winner && winner !== pid) outcome = 'DEFEAT';
      applyMatchResultToRankCounters(rankCounters, pid, outcome, selectedRanks);
      participantMatchRanks[pid] = new Set();
    }
  }

  const aggregateRankMetrics = computeAggregateRankMetrics(rankCounters, ranks);
  const { rankORV, swapMatrix } = computeObservedRankValue(aggregateRankMetrics);
  const rankPowerModel = buildRankPowerModel({ rankMetrics: aggregateRankMetrics, rankORV, aggregateHash: aggregate?.aggregateHash ?? null });

  return {
    schemaVersion: RANK_ANALYTICS_SCHEMA_VERSION,
    ranks: [...ranks],
    participantIds: [...participantIds],
    rankCounters: aggregateRankMetrics,
    rankPower: rankPowerModel,
    swapMatrix,
    metricRegistry: RANK_METRIC_REGISTRY.map(m => ({ ...m })),
    aggregateHash: aggregate?.aggregateHash ?? null
  };
}

function variantMetricsToRankMetrics(vm) {
  const sel = vm.variantSelectionCount ?? 0;
  return {
    rankSelectionCount: sel,
    rankOpportunityCount: vm.variantOpportunityCount ?? 0,
    rankSelectionRate: (vm.variantOpportunityCount ?? 0) > 0 ? sel / vm.variantOpportunityCount : 0,
    rankVictoryContributionCount: vm.variantVictoryContributionCount ?? 0,
    rankDefeatExposureCount: vm.variantDefeatExposureCount ?? 0,
    rankSecuredPointContribution: vm.variantSecuredPointContribution ?? 0,
    rankBoardPresenceContribution: vm.variantBoardPresenceContribution ?? 0,
    rankStateDeltaObservationCount: sel,
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

export function expandTenSuitsInRankPower(rankAnalytics, variantAnalytics) {
  if (!rankAnalytics || !rankAnalytics.rankPower || !variantAnalytics || !variantAnalytics.variantMetrics) return rankAnalytics;
  const vm = variantAnalytics.variantMetrics;
  const tenKeys = perSuitTenKeys();
  const hasPerSuitData = tenKeys.some(k => vm[k] && (vm[k].variantSelectionCount > 0 || vm[k].variantOpportunityCount > 0));
  if (!hasPerSuitData) return rankAnalytics;
  const combinedMetrics = {};
  for (const rank of CANONICAL_RANKS) {
    if (rank === '10') continue;
    if (rankAnalytics.rankCounters[rank]) combinedMetrics[rank] = rankAnalytics.rankCounters[rank];
  }
  for (const key of tenKeys) {
    if (vm[key]) combinedMetrics[key] = variantMetricsToRankMetrics(vm[key]);
  }
  const { rankORV, swapMatrix } = computeObservedRankValue(combinedMetrics);
  const expandedPower = buildRankPowerModel({ rankMetrics: combinedMetrics, rankORV, aggregateHash: rankAnalytics.rankPower.aggregateHash ?? null });
  return { ...rankAnalytics, rankPower: expandedPower, swapMatrix, tenSuitExpansion: { expanded: true, keys: tenKeys } };
}

// === Variant & Super-Effect Analytics (browser-safe, self-contained) ========
//
// Mirrors packages/simulation-runtime/variant-registry.mjs + the variant
// telemetry/integration layers so the browser bundle can compute per-variant
// analytics (Spades variants + individual Super effects) independently of the
// rank-wide aggregate, segmented by rules-authority profile.

export const VARIANT_ANALYTICS_SCHEMA_VERSION = '1.0.0';
export const VARIANT_TELEMETRY_SCHEMA_VERSION = '5.1.0';

export const ADVANCED_CORE_PROFILE_ID = 'core-advanced-authority';
export const UNRESTRICTED_CORE_PROFILE_ID = 'core-unrestricted-authority';
export const ALL_CORE_PROFILES = Object.freeze([ADVANCED_CORE_PROFILE_ID, UNRESTRICTED_CORE_PROFILE_ID]);

export const ENTITY_TIER = Object.freeze({
  RANK: 'rank', NORMAL: 'normal', SPADE: 'spade', SUIT: 'suit', SUPER: 'super', SUPER_AGGREGATE: 'super-aggregate'
});

const SPADE_VARIANTS = Object.freeze({
  A: { mode: 'spade-exile-counter', displayName: 'A♠ Exile Counter' },
  '2': { mode: 'solo-wild-copy', displayName: '2♠ Enhanced Wild Copy' },
  '3': { mode: 'spade-enhancement', displayName: '3♠ Enhancement' },
  '4': { mode: 'total-clear', displayName: '4♠ Total Clear' },
  '5': { mode: 'suit-rummage', displayName: '5♠ Any-Exile Rummage' },
  '6': { mode: 'deep-draw', displayName: '6♠ Deep Draw' },
  '7': { mode: 'spade-topdeck', displayName: '7♠ Topdeck' },
  '8': { mode: 'free-scuttle', displayName: '8♠ Free Scuttle' },
  '9': { mode: 'spade-goal-shift', displayName: '9♠ Goal Shift' },
  '10': { mode: 'spade-stack-theft', displayName: '10♠ Stack Theft / Exile Recovery' },
  J: { mode: 'jack-er', displayName: 'J♠ ER Attachment' },
  Q: { mode: 'spade-protection', displayName: 'Q♠ Special Protection' },
  K: { mode: 'spade-multi-counter', displayName: 'K♠ Multi-Counter / Wild Sovereignty' }
});

const PER_SUIT_TEN_VARIANTS = Object.freeze({
  '♣': { variantKey: '10:club',   mode: 'club-foundation',   displayName: '10♣ Foundation' },
  '♦': { variantKey: '10:diamond', mode: 'diamond-mimic',     displayName: '10♦ Mimic' },
  '♥': { variantKey: '10:heart',  mode: 'heart-tempo',        displayName: '10♥ Tempo Spike' },
  '♠': { variantKey: '10:spade',  mode: 'spade-stack-theft',  displayName: '10♠ Stack Theft / Exile Recovery' }
});

export function perSuitTenKeys() { return ['10:club', '10:diamond', '10:heart', '10:spade']; }
export function isPerSuitTenRank(rank) { return rank === '10'; }
export function perSuitTenForSuit(suit) { return PER_SUIT_TEN_VARIANTS[suit] ?? null; }

const SUPER_EFFECTS = Object.freeze({
  A: [{ effectId: 'super-ace', displayName: '⭐A Super Counter', kind: 'core-declare-super-ace-counter', altKinds: ['advanced-super-ace'], modes: ['super-ace', 'super-counter'], profiles: [...ALL_CORE_PROFILES] }],
  '2': [{ effectId: 'super-two', displayName: '⭐2 Commandeer', kind: 'advanced-super-two', modes: ['two-score', 'two-hold', 'commandeer'], profiles: [...ALL_CORE_PROFILES] }],
  '3': [{ effectId: 'super-three-raid', displayName: '⭐3 Super Raid', kind: 'advanced-super-three-raid', modes: ['three-raid', 'super-raid'], profiles: [UNRESTRICTED_CORE_PROFILE_ID] }],
  '4': [{ effectId: 'super-four-exchange', displayName: '⭐4 Row Exchange', kind: 'advanced-super-four-exchange', modes: ['four-exchange-pr', 'four-exchange-er', 'row-exchange'], profiles: [...ALL_CORE_PROFILES] }],
  '5': [{ effectId: 'super-five-recycle', displayName: '⭐5 Super Recycle', kind: 'advanced-super-five-recycle', modes: ['five-recycle', 'super-recycle'], profiles: [UNRESTRICTED_CORE_PROFILE_ID] }],
  '6': [{ effectId: 'super-six-dig', displayName: '⭐6 Super Dig', kind: 'advanced-super-six-dig', modes: ['six-dig', 'super-dig'], profiles: [UNRESTRICTED_CORE_PROFILE_ID] }],
  '7': [{ effectId: 'super-seven-topdeck', displayName: '⭐7 Sequential Topdeck', kind: 'advanced-super-seven-topdeck', modes: ['seven-topdeck', 'sequential-topdeck'], profiles: [UNRESTRICTED_CORE_PROFILE_ID] }],
  '8': [{ effectId: 'super-eight-scuttle', displayName: '⭐8 Absolute Scuttle', kind: 'advanced-super-eight-scuttle', modes: ['eight-absolute-scuttle', 'absolute-scuttle'], profiles: [...ALL_CORE_PROFILES] }],
  J: [{ effectId: 'super-jack-tempo', displayName: '⭐J Tempo Force', kind: 'advanced-super-j-tempo', modes: ['jack-tempo', 'tempo-force'], profiles: [...ALL_CORE_PROFILES] }]
});

export const VARIANT_ELIGIBLE_RANKS = Object.freeze(CANONICAL_RANKS.filter(r => r !== 'RJ' && r !== 'BJ'));

export function resolveSuperEffect(action) {
  const kind = action?.kind ?? action?.advanced?.kind ?? '';
  const mode = action?.mode ?? action?.authority ?? '';
  for (const rank of Object.keys(SUPER_EFFECTS)) {
    for (const s of SUPER_EFFECTS[rank]) {
      const kinds = [s.kind, ...(s.altKinds ?? [])];
      if (kinds.includes(kind) || s.modes.includes(mode) || mode === s.effectId) return { rank, ...s };
    }
  }
  if ((action?.family ?? '') === 'super' && mode) {
    for (const rank of Object.keys(SUPER_EFFECTS)) {
      for (const s of SUPER_EFFECTS[rank]) {
        if (mode.includes(s.effectId) || s.modes.some(m => mode.includes(m))) return { rank, ...s };
      }
    }
  }
  return null;
}

export function hasSpadeVariant(rank) { return Boolean(SPADE_VARIANTS[rank]); }

export function entitiesForRank(rank) {
  const out = [{ variantKey: rank, rank, tier: ENTITY_TIER.RANK, displayName: `Rank ${rank} (overall)` }];
  if (isPerSuitTenRank(rank)) {
    for (const suit of ['♣', '♦', '♥', '♠']) {
      const v = PER_SUIT_TEN_VARIANTS[suit];
      out.push({ variantKey: v.variantKey, rank, tier: ENTITY_TIER.SUIT, suit, displayName: v.displayName });
    }
  } else if (SPADE_VARIANTS[rank]) {
    out.push({ variantKey: `${rank}:normal`, rank, tier: ENTITY_TIER.NORMAL, displayName: `Rank ${rank} Normal (♣/♦/♥)` });
    out.push({ variantKey: `${rank}:spade`, rank, tier: ENTITY_TIER.SPADE, displayName: SPADE_VARIANTS[rank].displayName });
  }
  const supers = SUPER_EFFECTS[rank] ?? [];
  for (const s of supers) {
    out.push({ variantKey: `${rank}:super:${s.effectId}`, rank, tier: ENTITY_TIER.SUPER, superEffectId: s.effectId, displayName: s.displayName, profiles: [...s.profiles] });
  }
  if (supers.length > 0) out.push({ variantKey: `${rank}:super:all`, rank, tier: ENTITY_TIER.SUPER_AGGREGATE, displayName: `Rank ${rank} All Supers (combined)` });
  return out;
}

export function allVariantEntities() {
  const out = [];
  for (const rank of CANONICAL_RANKS) out.push(...entitiesForRank(rank));
  return out;
}

export function allVariantKeys() { return allVariantEntities().map(e => e.variantKey); }

// --- Variant entity classification ---

function primarySourceSuit(attribution) {
  const cards = attribution.sourceCards ?? [];
  const observable = cards.filter(c => c.suit);
  return observable.length > 0 ? observable[0].suit : null;
}

export function classifyVariantEntity(attribution, action = {}) {
  if (!attribution || attribution.attributionStatus === 'not-observable' || !attribution.primaryRank) {
    return { variantKey: null, tier: null, superEffectId: null, suit: null, creditKeys: [] };
  }
  const rank = attribution.primaryRank;
  const playForm = attribution.playForm ?? 'other';
  const suit = primarySourceSuit(attribution);
  const creditKeys = [rank];

  if (playForm === 'super') {
    const se = resolveSuperEffect(action);
    if (se && se.rank === rank) {
      const specific = `${rank}:super:${se.effectId}`, agg = `${rank}:super:all`;
      creditKeys.push(specific, agg);
      return { variantKey: specific, tier: ENTITY_TIER.SUPER, superEffectId: se.effectId, suit, creditKeys };
    }
    const agg = `${rank}:super:all`;
    creditKeys.push(agg);
    return { variantKey: agg, tier: ENTITY_TIER.SUPER_AGGREGATE, superEffectId: null, suit, creditKeys };
  }
  if (isPerSuitTenRank(rank) && suit) {
    const perSuit = perSuitTenForSuit(suit);
    if (perSuit) {
      creditKeys.push(perSuit.variantKey);
      return { variantKey: perSuit.variantKey, tier: ENTITY_TIER.SUIT, superEffectId: null, suit, creditKeys };
    }
  }
  if (suit === '♠' && hasSpadeVariant(rank)) {
    const key = `${rank}:spade`;
    creditKeys.push(key);
    return { variantKey: key, tier: ENTITY_TIER.SPADE, superEffectId: null, suit, creditKeys };
  }
  const key = `${rank}:normal`;
  creditKeys.push(key);
  return { variantKey: key, tier: ENTITY_TIER.NORMAL, superEffectId: null, suit, creditKeys };
}

// --- Variant telemetry counters ---

const VARIANT_COUNTER_FIELDS = Object.freeze([
  'drawCount', 'appearanceCount', 'opportunityCount', 'selectionCount', 'activationCount',
  'successCount', 'failureCount', 'victoryContributionCount', 'defeatExposureCount',
  'securedPointContribution', 'boardPresenceContribution', 'immediateStateImpact',
  'delayedValue', 'tempoImpact', 'goalContribution',
  'counterDeclarationCount', 'scuttleCount', 'responsePlayedCount', 'responseDeclinedCount',
  'effectPlayCount', 'generatedEffectCount'
]);

export const VARIANT_METRIC_REGISTRY = Object.freeze([
  { metricId: 'variantDrawCount', unit: 'count', description: 'Times the variant was drawn into hand' },
  { metricId: 'variantAppearanceCount', unit: 'count', description: 'Times the variant appeared in an observable position' },
  { metricId: 'variantOpportunityCount', unit: 'frames', description: 'Decision frames where the variant had a legal option' },
  { metricId: 'variantSelectionCount', unit: 'count', description: 'Times the variant was selected as primary attribution' },
  { metricId: 'variantActivationCount', unit: 'count', description: 'Times a Super effect was activated' },
  { metricId: 'variantPlayRate', unit: 'ratio', description: 'Selection count divided by opportunity count' },
  { metricId: 'variantConversionRate', unit: 'ratio', description: 'Activation count divided by opportunity count' },
  { metricId: 'variantSuccessCount', unit: 'count', description: 'Resolutions where the variant succeeded' },
  { metricId: 'variantFailureCount', unit: 'count', description: 'Resolutions where the variant was countered or fizzled' },
  { metricId: 'variantSuccessRate', unit: 'ratio', description: 'Success count divided by success plus failure' },
  { metricId: 'variantVictoryContributionCount', unit: 'matches', description: 'Victorious matches where the variant was selected' },
  { metricId: 'variantDefeatExposureCount', unit: 'matches', description: 'Lost matches where the variant was selected' },
  { metricId: 'variantWinRate', unit: 'ratio', description: 'Victory contribution divided by victory plus defeat' },
  { metricId: 'variantSecuredPointContribution', unit: 'points', description: 'Sum of secured point deltas' },
  { metricId: 'variantBoardPresenceContribution', unit: 'cards', description: 'Sum of board presence deltas' },
  { metricId: 'variantImmediateStateImpact', unit: 'index', description: 'Sum of immediate state-impact magnitude' },
  { metricId: 'variantDelayedValue', unit: 'index', description: 'Sum of downstream / delayed value' },
  { metricId: 'variantTempoImpact', unit: 'mini-turns', description: 'Sum of mini-turn / tempo deltas' },
  { metricId: 'variantGoalContribution', unit: 'goal-points', description: 'Sum of goal-shift deltas' },
  { metricId: 'variantCounterDeclarationCount', unit: 'count', description: 'Counter declarations attributed to the variant' },
  { metricId: 'variantScuttleCount', unit: 'count', description: 'Scuttles attributed to the variant' },
  { metricId: 'variantResponsePlayedCount', unit: 'count', description: 'Response plays attributed to the variant' },
  { metricId: 'variantResponseDeclinedCount', unit: 'count', description: 'Response declines where the variant had options' },
  { metricId: 'variantEffectPlayCount', unit: 'count', description: 'Effect plays attributed to the variant' },
  { metricId: 'variantGeneratedEffectCount', unit: 'count', description: 'Generated effects with this variant as origin' },
  { metricId: 'variantAverageValueWhenActivated', unit: 'index', description: 'Mean immediate-plus-delayed value per activation' }
]);

export function emptyVariantCounters(variantKeys) {
  const c = {};
  for (const k of variantKeys) c[k] = Object.fromEntries(VARIANT_COUNTER_FIELDS.map(f => [f, 0]));
  return c;
}

export function emptyParticipantVariantCounters(participantIds, variantKeys) {
  const r = {};
  for (const pid of participantIds) r[pid] = emptyVariantCounters(variantKeys);
  return r;
}

export function applyDecisionToVariantCounters(counters, pid, attribution, variantEntity, action, variantOpps) {
  const pc = counters[pid]; if (!pc) return;
  if (variantOpps) for (const [k, info] of Object.entries(variantOpps)) if (pc[k]) pc[k].opportunityCount += info.opportunityFrames ?? 1;
  if (!variantEntity || !variantEntity.variantKey || attribution.attributionStatus === 'not-observable') { if (action?.family === 'response-decline' && variantOpps) for (const k of Object.keys(variantOpps)) if (pc[k]) pc[k].responseDeclinedCount += 1; return; }
  const sk = variantEntity.variantKey, family = action?.family ?? '', form = attribution.playForm ?? 'other', isSuper = variantEntity.tier === 'super' || variantEntity.tier === 'super-aggregate';
  const bump = (c) => { if (!c) return; c.selectionCount += 1; if (isSuper) c.activationCount += 1; if (family === 'counter') c.counterDeclarationCount += 1; if (family === 'scuttle') c.scuttleCount += 1; if (family?.startsWith('effect-') || form === 'super' || form === 'ultra' || form === 'generated') c.effectPlayCount += 1; if (form === 'generated') c.generatedEffectCount += 1; if (family === 'counter' || family === 'disrupt' || family === 'interrupt') c.responsePlayedCount += 1; };
  bump(pc[sk]); for (const k of variantEntity.creditKeys) if (k !== sk) bump(pc[k]);
}

export function applyMatchResultToVariantCounters(counters, pid, outcome, selectedKeys) {
  const pc = counters[pid]; if (!pc) return;
  for (const k of selectedKeys) { if (!pc[k]) continue; if (outcome === 'VICTORY') pc[k].victoryContributionCount += 1; else if (outcome === 'DEFEAT') pc[k].defeatExposureCount += 1; }
}

export function applyStateDeltaToVariantCounters(counters, pid, variantEntity, stateDelta) {
  const pc = counters[pid]; if (!pc || !variantEntity?.variantKey) return;
  const d = stateDelta ?? {}, pd = d.securedPointDeltaByPlayer ?? {}, bd = d.boardPresenceDeltaByPlayer ?? {}, td = d.tempoDeltaByPlayer ?? {}, gd = d.goalDeltaByPlayer ?? {}, im = d.immediateImpactByPlayer ?? {}, dv = d.delayedValueByPlayer ?? {};
  for (const k of variantEntity.creditKeys) { const c = pc[k]; if (!c) continue; c.securedPointContribution += pd[pid] ?? 0; c.boardPresenceContribution += bd[pid] ?? 0; c.tempoImpact += td[pid] ?? 0; c.goalContribution += gd[pid] ?? 0; c.immediateStateImpact += Math.abs(im[pid] ?? 0); c.delayedValue += dv[pid] ?? 0; }
}

export function computeVariantMetrics(counters, variantKeys) {
  const m = {};
  for (const k of variantKeys) {
    const c = counters[k]; if (!c) continue;
    const pr = c.opportunityCount > 0 ? c.selectionCount / c.opportunityCount : 0, cv = c.opportunityCount > 0 ? c.activationCount / c.opportunityCount : 0, res = c.successCount + c.failureCount, sr = res > 0 ? c.successCount / res : 0, mo = c.victoryContributionCount + c.defeatExposureCount, wr = mo > 0 ? c.victoryContributionCount / mo : 0, acts = c.activationCount > 0 ? c.activationCount : c.selectionCount, avg = acts > 0 ? (c.immediateStateImpact + c.delayedValue) / acts : 0;
    m[k] = { variantDrawCount: c.drawCount, variantAppearanceCount: c.appearanceCount, variantOpportunityCount: c.opportunityCount, variantSelectionCount: c.selectionCount, variantActivationCount: c.activationCount, variantPlayRate: pr, variantConversionRate: cv, variantSuccessCount: c.successCount, variantFailureCount: c.failureCount, variantSuccessRate: sr, variantVictoryContributionCount: c.victoryContributionCount, variantDefeatExposureCount: c.defeatExposureCount, variantWinRate: wr, variantSecuredPointContribution: c.securedPointContribution, variantBoardPresenceContribution: c.boardPresenceContribution, variantImmediateStateImpact: c.immediateStateImpact, variantDelayedValue: c.delayedValue, variantTempoImpact: c.tempoImpact, variantGoalContribution: c.goalContribution, variantCounterDeclarationCount: c.counterDeclarationCount, variantScuttleCount: c.scuttleCount, variantResponsePlayedCount: c.responsePlayedCount, variantResponseDeclinedCount: c.responseDeclinedCount, variantEffectPlayCount: c.effectPlayCount, variantGeneratedEffectCount: c.generatedEffectCount, variantAverageValueWhenActivated: avg
    };
  }
  return m;
}

export function computeAggregateVariantMetrics(participantCounters, variantKeys) {
  const agg = emptyVariantCounters(variantKeys);
  for (const pc of Object.values(participantCounters)) {
    for (const k of variantKeys) {
      const s = pc[k], d = agg[k]; if (!s || !d) continue;
      for (const f of VARIANT_COUNTER_FIELDS) d[f] += s[f];
    }
  }
  return computeVariantMetrics(agg, variantKeys);
}

const VARIANT_CONFIDENCE_THRESHOLDS = Object.freeze({ HIGH: 100, MEDIUM: 30, LOW: 8 });

export function classifyVariantConfidence(variantMetrics) {
  const n = variantMetrics?.variantOpportunityCount ?? 0;
  if (n >= VARIANT_CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
  if (n >= VARIANT_CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (n >= VARIANT_CONFIDENCE_THRESHOLDS.LOW) return 'LOW';
  return 'INSUFFICIENT';
}

export function buildVariantPowerProfiles(variantMetrics, variantKeys) {
  const raw = { selection: {}, victory: {}, score: {}, board: {}, tempo: {}, value: {} };
  for (const k of variantKeys) {
    const m = variantMetrics[k]; if (!m) continue;
    raw.selection[k] = m.variantOpportunityCount > 0 ? m.variantSelectionCount / m.variantOpportunityCount : 0;
    const o = m.variantVictoryContributionCount + m.variantDefeatExposureCount;
    raw.victory[k] = o > 0 ? m.variantVictoryContributionCount / o : 0.5;
    raw.score[k] = m.variantSelectionCount > 0 ? m.variantSecuredPointContribution / m.variantSelectionCount : 0;
    raw.board[k] = m.variantSelectionCount > 0 ? m.variantBoardPresenceContribution / m.variantSelectionCount : 0;
    raw.tempo[k] = m.variantSelectionCount > 0 ? m.variantTempoImpact / m.variantSelectionCount : 0;
    raw.value[k] = m.variantAverageValueWhenActivated ?? 0;
  }
  const norm = (obj) => {
    const vs = Object.values(obj); if (vs.length === 0) return {};
    const mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn;
    if (rg === 0) { const r = {}; for (const k of Object.keys(obj)) r[k] = 0.5; return r; }
    const r = {}; for (const [k, v] of Object.entries(obj)) r[k] = (v - mn) / rg; return r;
  };
  const ns = norm(raw.selection), nv = norm(raw.victory), nsc = norm(raw.score), nb = norm(raw.board), nt = norm(raw.tempo), nval = norm(raw.value);
  const p = {};
  for (const k of variantKeys) {
    p[k] = {
      axes: { selectionPower: ns[k] ?? 0, victoryPower: nv[k] ?? 0, scorePower: nsc[k] ?? 0, boardPower: nb[k] ?? 0, tempoPower: nt[k] ?? 0, valuePower: nval[k] ?? 0 },
      raw: { selectionRate: raw.selection[k], victoryRate: raw.victory[k], scorePerSelection: raw.score[k], boardPerSelection: raw.board[k], tempoPerSelection: raw.tempo[k], avgValue: raw.value[k] }
    };
  }
  return p;
}

function resolveProfileId(summary) {
  return summary.profileId ?? summary.authorityProfile ?? summary.rulesProfile
    ?? summary.metadata?.coreAuthority?.profileId ?? ADVANCED_CORE_PROFILE_ID;
}

/**
 * Build per-variant analytics from match summaries, segmented by authority profile.
 * @param {object} params
 * @param {Array} params.summaries
 * @param {object} [params.aggregate]
 * @param {string} [params.profileId] - filter to a single profile; omit for all
 * @returns {object}
 */
export function buildVariantAnalytics({ summaries, aggregate = null, profileId = null }) {
  const variantKeys = allVariantKeys();
  const entities = allVariantEntities();
  const filtered = profileId ? summaries.filter(s => resolveProfileId(s) === profileId) : summaries;
  const participantIds = ['P1', 'P2'];
  const variantCounters = emptyParticipantVariantCounters(participantIds, variantKeys);
  const participantMatchVariants = {};

  for (const summary of filtered) {
    const winner = summary.winner ?? null;
    const rankDecisions = summary.rankDecisions ?? [];
    for (const decision of rankDecisions) {
      const pid = decision.participantId ?? 'P1';
      if (!variantCounters[pid]) variantCounters[pid] = emptyVariantCounters(variantKeys);
      const attribution = decision.rankAttribution ?? {
        primaryRank: decision.primaryRank ?? null, attributionStatus: decision.attributionStatus ?? 'not-observable', playForm: decision.playForm ?? 'other'
      };
      let variantEntity = decision.variantEntity ?? classifyVariantEntity(attribution, decision.action ?? {});
      // Reclassify legacy Rank 10 variant entities to per-suit scheme.
      if (attribution.primaryRank === '10' && (!variantEntity?.variantKey || !['10:club', '10:diamond', '10:heart', '10:spade'].includes(variantEntity.variantKey))) {
        variantEntity = classifyVariantEntity(attribution, decision.action ?? {});
      }
      const variantOpps = {};
      for (const opp of (decision.rankOpportunities ?? [])) {
        if (!opp.rank) continue;
        if (opp.rank === '10') {
          const perSuit = Math.ceil((opp.opportunityFrames ?? 1) / 3);
          variantOpps['10'] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
          for (const key of ['10:club', '10:diamond', '10:heart']) variantOpps[key] = { opportunityFrames: perSuit, legalOptions: opp.legalOptions ?? 1 };
        } else {
          variantOpps[opp.rank] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
          variantOpps[`${opp.rank}:normal`] = { opportunityFrames: opp.opportunityFrames ?? 1, legalOptions: opp.legalOptions ?? 1 };
        }
      }
      applyDecisionToVariantCounters(variantCounters, pid, attribution, variantEntity, decision.action ?? {}, variantOpps);
      if (variantEntity.variantKey) {
        if (!participantMatchVariants[pid]) participantMatchVariants[pid] = new Set();
        participantMatchVariants[pid].add(variantEntity.variantKey);
        for (const ck of variantEntity.creditKeys) participantMatchVariants[pid].add(ck);
      }
      if (decision.stateDelta) applyStateDeltaToVariantCounters(variantCounters, pid, variantEntity, decision.stateDelta);
    }
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

  const aggMetrics = computeAggregateVariantMetrics(variantCounters, variantKeys);
  const power = buildVariantPowerProfiles(aggMetrics, variantKeys);
  const confidence = {};
  for (const k of variantKeys) confidence[k] = classifyVariantConfidence(aggMetrics[k]);

  // Per-rank 5-level comparison
  const rankComparisons = {};
  for (const rank of VARIANT_ELIGIBLE_RANKS) {
    const ents = entitiesForRank(rank);
    const levels = {};
    for (const ent of ents) {
      const m = aggMetrics[ent.variantKey];
      levels[ent.variantKey] = m ? {
        variantKey: ent.variantKey, tier: ent.tier, displayName: ent.displayName,
        superEffectId: ent.superEffectId ?? null, profiles: ent.profiles ?? null,
        metrics: m, power: power[ent.variantKey] ?? null,
        confidence: confidence[ent.variantKey] ?? 'INSUFFICIENT',
        sampleSize: m.variantOpportunityCount
      } : null;
    }
    rankComparisons[rank] = { rank, levels, entityOrder: ents.map(e => e.variantKey) };
  }

  // Per-profile breakdown
  let perProfile = null;
  if (!profileId) {
    perProfile = {};
    for (const pid of ALL_CORE_PROFILES) {
      perProfile[pid] = buildVariantAnalytics({ summaries, profileId: pid }).variantMetrics;
    }
  }

  return {
    schemaVersion: VARIANT_ANALYTICS_SCHEMA_VERSION,
    telemetrySchemaVersion: VARIANT_TELEMETRY_SCHEMA_VERSION,
    profileId: profileId ?? 'all',
    variantKeys, entities,
    participantIds: [...participantIds],
    variantMetrics: aggMetrics,
    variantPower: power,
    confidence,
    rankComparisons,
    perProfile,
    metricRegistry: VARIANT_METRIC_REGISTRY.map(m => ({ ...m })),
    aggregateHash: aggregate?.aggregateHash ?? null
  };
}

export function buildVariantCompareFacet(variantAnalytics, rank) {
  if (!variantAnalytics?.rankComparisons) return null;
  return variantAnalytics.rankComparisons[rank] ?? null;
}

// ── Campaign aggregate (browser-safe port of packages/simulation-runtime/src/campaign.mjs) ──
const COMPLETE_REASONS = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const _increment = (record, key, amount = 1) => { record[key] = (record[key] ?? 0) + amount; };

function _wilsonInterval(successes, total, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) throw new TypeError('Invalid binomial counts');
  if (total === 0) return [0, 0];
  const p = successes / total, z2 = z * z, denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function _quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const pos = (clean.length - 1) * q;
  const low = Math.floor(pos), high = Math.ceil(pos);
  if (low === high) return clean[low];
  return clean[low] * (high - pos) + clean[high] * (pos - low);
}

function _summarizeNumbers(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return { count: 0, mean: null, median: null, min: null, max: null, p05: null, p25: null, p75: null, p95: null, standardDeviation: null };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.length > 1 ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1) : 0;
  return {
    count: clean.length, mean, median: _quantile(clean, 0.5), min: clean[0], max: clean.at(-1),
    p05: _quantile(clean, 0.05), p25: _quantile(clean, 0.25), p75: _quantile(clean, 0.75), p95: _quantile(clean, 0.95),
    standardDeviation: Math.sqrt(variance)
  };
}

export function campaignAggregate(summaries, semantic = {}) {
  const completed = summaries.filter((match) => COMPLETE_REASONS.has(match.terminationReason));
  const decisive = completed.filter((match) => match.terminationReason !== 'CANONICAL_DRAW');
  const seatWins = { '1': 0, '2': 0 }, terminations = {}, actionCounts = {}, decisionFamilyCounts = {}, actionModeCounts = {}, decisionModeCounts = {}, responseActionCounts = {}, eventTypeCounts = {}, mechanicCounts = {}, primaryMechanicCounts = {};
  const policy = {}, matchups = {};
  const distributionFields = {
    completedFullTurns: [], policyDecisions: [], policyActions: [], miniTurnActions: [], exhaustedPassActions: [],
    responseOpportunities: [], responsePlayed: [], responseDeclinedWithOptions: [], automaticPriorityAdvances: [], responseWindowsClosed: [],
    privateChoices: [], triggerActivity: [], advancedDecisions: [], voltageDecisions: [], ultraDecisions: [], scoreMargin: []
  };
  const semanticTotals = {
    miniTurnActionCount:0, exhaustedPassActionCount:0, responseOpportunityCount:0, responsePlayedCount:0,
    responseDeclinedWithOptionsCount:0, automaticPriorityAdvanceCount:0, responseWindowClosedCount:0,
    counterDeclarationCount:0, quickDeclarationCount:0, instantDeclarationCount:0, interruptDeclarationCount:0,
    policyDecisionCount:0, policyActionCount:0, actionCount:0, passActionCount:0, miniTurnCount:0,
    meaningfulResponseDecisionCount:0, automaticOrchestrationCommandCount:0
  };
  const ruleCompliance = { checkedMatchCount: summaries.length, passedMatchCount: 0, failedMatchCount: 0, violationCount: 0 };

  for (const match of summaries) {
    _increment(terminations, match.terminationReason);
    const df = distributionFields, m = match;
    df.completedFullTurns.push(m.completedFullTurns); df.policyDecisions.push(m.policyDecisionCount ?? 0); df.policyActions.push(m.policyActionCount ?? 0);
    df.miniTurnActions.push(m.miniTurnActionCount ?? 0); df.exhaustedPassActions.push(m.exhaustedPassActionCount ?? 0); df.responseOpportunities.push(m.responseOpportunityCount ?? 0);
    df.responsePlayed.push(m.responsePlayedCount ?? 0); df.responseDeclinedWithOptions.push(m.responseDeclinedWithOptionsCount ?? 0); df.automaticPriorityAdvances.push(m.automaticPriorityAdvanceCount ?? 0);
    df.responseWindowsClosed.push(m.responseWindowClosedCount ?? 0); df.privateChoices.push(m.privateChoiceDecisionCount ?? 0); df.triggerActivity.push(m.triggerCount ?? 0);
    df.advancedDecisions.push(m.advancedDecisionCount ?? 0); df.voltageDecisions.push(m.voltageDecisionCount ?? 0); df.ultraDecisions.push(m.ultraDecisionCount ?? 0);
    df.scoreMargin.push(m.scoreMargin);
    for (const key of Object.keys(semanticTotals)) semanticTotals[key] += Number(m[key] ?? 0);
    for (const [k, v] of Object.entries(m.actionCounts ?? {})) _increment(actionCounts, k, v);
    for (const [k, v] of Object.entries(m.decisionFamilyCounts ?? {})) _increment(decisionFamilyCounts, k, v);
    for (const [k, v] of Object.entries(m.actionModeCounts ?? {})) _increment(actionModeCounts, k, v);
    for (const [k, v] of Object.entries(m.decisionModeCounts ?? {})) _increment(decisionModeCounts, k, v);
    for (const [k, v] of Object.entries(m.responseActionCounts ?? {})) _increment(responseActionCounts, k, v);
    for (const [k, v] of Object.entries(m.eventTypeCounts ?? {})) _increment(eventTypeCounts, k, v);
    for (const [k, v] of Object.entries(m.mechanicCounts ?? {})) _increment(mechanicCounts, k, v);
    for (const [k, v] of Object.entries(m.primaryMechanicCounts ?? {})) _increment(primaryMechanicCounts, k, v);
    if (m.ruleCompliance?.status === 'PASS') ruleCompliance.passedMatchCount += 1;
    else { ruleCompliance.failedMatchCount += 1; ruleCompliance.violationCount += Number(m.ruleCompliance?.violationCount ?? 1); }
    for (const id of match.policyIds) policy[id] ??= { games: 0, wins: 0, draws: 0, aborts: 0, miniTurnActions:0, responsesPlayed:0, responsesDeclined:0 };
    policy[match.policyIds[0]].games += 1; policy[match.policyIds[1]].games += 1;
    const hasParticipants = Array.isArray(match.participants) && match.participants.length === 2;
    if (hasParticipants) { for (const p of match.participants) { policy[p.policyId].miniTurnActions += p.miniTurnActionCount ?? 0; policy[p.policyId].responsesPlayed += p.responsePlayCount ?? 0; policy[p.policyId].responsesDeclined += p.responseDeclineCount ?? 0; } }
    else { const mt = match.miniTurnActionCount ?? 0, rp = match.responsePlayedCount ?? 0, rd = match.responseDeclinedWithOptionsCount ?? 0; for (const pid of match.policyIds) { policy[pid].miniTurnActions += mt; policy[pid].responsesPlayed += rp; policy[pid].responsesDeclined += rd; } }
    const matchupKey = `${match.policyIds[0]}__vs__${match.policyIds[1]}`;
    matchups[matchupKey] ??= { games: 0, seat1Wins: 0, seat2Wins: 0, draws: 0, aborts: 0, totalFullTurns:0, totalResponses:0, totalChoices:0 };
    const matchup = matchups[matchupKey]; matchup.games += 1; matchup.totalFullTurns += match.completedFullTurns; matchup.totalResponses += match.meaningfulResponseDecisionCount ?? 0; matchup.totalChoices += match.privateChoiceDecisionCount ?? 0;
    if (!COMPLETE_REASONS.has(match.terminationReason)) {
      matchup.aborts += 1; policy[match.policyIds[0]].aborts += 1; policy[match.policyIds[1]].aborts += 1;
    } else if (match.terminationReason === 'CANONICAL_DRAW') {
      matchup.draws += 1; policy[match.policyIds[0]].draws += 1; policy[match.policyIds[1]].draws += 1;
    } else {
      _increment(seatWins, String(match.winningSeat)); matchup[match.winningSeat === 1 ? 'seat1Wins' : 'seat2Wins'] += 1;
      const winnerIndex = match.seatOrder.indexOf(match.winner); policy[match.policyIds[winnerIndex]].wins += 1;
    }
  }
  for (const item of Object.values(policy)) {
    item.winRate = item.games ? item.wins / item.games : 0;
    item.wilson95 = _wilsonInterval(item.wins, Math.max(1, item.games - item.draws - item.aborts));
  }
  for (const item of Object.values(matchups)) {
    item.meanFullTurns = item.games ? item.totalFullTurns / item.games : 0;
    item.meanResponses = item.games ? item.totalResponses / item.games : 0;
    item.meanPrivateChoices = item.games ? item.totalChoices / item.games : 0;
    item.seat1Wilson95 = _wilsonInterval(item.seat1Wins, Math.max(1, item.seat1Wins + item.seat2Wins));
  }
  const core = {
    schemaVersion: '4.1.0', telemetrySchemaVersion: '4.1.0', analyticsSchemaVersion: '4.1.0',
    experimentHash: semantic.experimentHash ?? null, profileId: semantic.profileId, engineVersion: semantic.engineVersion,
    rulesVersion: semantic.rulesVersion, labVersion: semantic.labVersion,
    matchCount: summaries.length, completedMatchCount: completed.length, abortCount: summaries.length - completed.length,
    drawCount: terminations.CANONICAL_DRAW ?? 0, terminationCounts: Object.fromEntries(Object.entries(terminations).sort()),
    seatWins, seat1WinRate: decisive.length ? seatWins['1'] / decisive.length : 0,
    seat1Wilson95: _wilsonInterval(seatWins['1'], decisive.length), semanticTotals,
    distributions: Object.fromEntries(Object.entries(distributionFields).map(([key, values]) => [key, _summarizeNumbers(values)])),
    actionCounts: Object.fromEntries(Object.entries(actionCounts).sort()),
    decisionFamilyCounts: Object.fromEntries(Object.entries(decisionFamilyCounts).sort()),
    actionModeCounts: Object.fromEntries(Object.entries(actionModeCounts).sort()),
    decisionModeCounts: Object.fromEntries(Object.entries(decisionModeCounts).sort()),
    responseActionCounts: Object.fromEntries(Object.entries(responseActionCounts).sort()),
    eventTypeCounts: Object.fromEntries(Object.entries(eventTypeCounts).sort()),
    mechanicCounts: Object.fromEntries(Object.entries(mechanicCounts).sort()),
    primaryMechanicCounts: Object.fromEntries(Object.entries(primaryMechanicCounts).sort()),
    ruleCompliance: { ...ruleCompliance, status: ruleCompliance.failedMatchCount === 0 ? 'PASS' : 'FAIL' },
    policies: Object.fromEntries(Object.entries(policy).sort()), matchups: Object.fromEntries(Object.entries(matchups).sort()),
    canonicalResultHash: semantic.canonicalResultHash ?? null,
    interpretationBoundary: 'Policy-conditioned Advanced Core observation. Associations are not causal proof; unsupported branches remain fail-closed.'
  };
  return { ...core, aggregateHash: hashCanonical(core) };
}

// ── Extract analysis (browser-safe port of packages/analytics/src/extract.mjs) ──
function formulaHash(formula) { return sha256Text(String(formula)); }

const ANALYTICS_SCHEMA_VERSION = '4.2.0';
const _V = ANALYTICS_SCHEMA_VERSION;
const METRIC_REGISTRY = Object.freeze({
  'win-rate': { version: _V, formula: 'wins / decisive completed matches', uncertainty: 'Wilson 95% interval' },
  'participant-prevalence': { version: _V, formula: 'unique participant-match pairs that selected entity ≥1 / all eligible participant-match records', uncertainty: 'Wilson 95% interval' },
  'match-prevalence': { version: _V, formula: 'unique matches in which entity selected ≥1 / all eligible matches', uncertainty: 'Wilson 95% interval' },
  'pick-rate-when-legal': { version: _V, formula: 'selections / distinct legal decision windows', uncertainty: 'Wilson 95% interval; N/A when zero legal opportunities' },
  'selection-frequency': { version: _V, formula: 'total selections / eligible participant-match records', uncertainty: 'descriptive rate' },
  'resolution-rate': { version: _V, formula: 'resolved declarations / accepted declarations', uncertainty: 'Wilson 95% interval' },
  'response-play-rate': { version: _V, formula: 'response plays / lawful response opportunities', uncertainty: 'Wilson 95% interval' },
  'counter-efficiency': { version: _V, formula: 'opponent value prevented / own card and tempo cost', uncertainty: 'match-clustered deterministic bootstrap' },
  'synergy-interaction': { version: _V, formula: 'stratified logistic A×B interaction (odds-ratio scale) from four-cohort model', uncertainty: 'Wald CI from inverse-variance pooled SE + BH FDR' },
  'immediate-point-impact': { version: _V, formula: 'sum actor-perspective secured point delta / resolved selections with point data', uncertainty: 'match-clustered deterministic bootstrap' },
  'raw-win-association': { version: _V, formula: 'P(win|selected) - P(win|not selected)', uncertainty: 'two-proportion z-test CI' },
  'adjusted-win-association': { version: _V, formula: 'stratified win-rate differential controlling for policy, seat, profile', uncertainty: 'Mantel-Haenszel-style stratified estimator CI' },
  'policy-fingerprint': { version: _V, formula: 'policy event/action count / policy games', uncertainty: 'descriptive; no optimality claim' }
});

function metricRegistryWithHashes() {
  return Object.fromEntries(Object.entries(METRIC_REGISTRY).map(([id, metric]) => [id, { metricId: id, ...metric, formulaHash: formulaHash(metric.formula) }]));
}

const EXTRACT_VERSION = '1.0.0';
function _pct(v) { return Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : null; }
function _fmtCI(ci) { if (!Array.isArray(ci) || ci.length < 2) return null; return `[${Number(ci[0]).toFixed(3)}, ${Number(ci[1]).toFixed(3)}]`; }
function _gradeLabel(g) { const m = { A: 'strong', B: 'moderate', C: 'weak', D: 'very weak' }; return m[g] ?? 'insufficient'; }
function _describePolicy(p) {
  const fp = p.fingerprint ?? {}, traits = [];
  if (fp.scoreAggression > 0.6) traits.push('high action frequency'); else if (fp.scoreAggression < 0.25) traits.push('low action frequency');
  if (fp.responseUse > 0.5) traits.push('response-heavy'); else if (fp.responseUse < 0.15) traits.push('response-averse');
  if (fp.responseConservation > 0.5) traits.push('conservative with responses');
  if (fp.advancedFrequency > 0.3) traits.push('advanced-heavy');
  if (fp.ultraFrequency > 0.15) traits.push('ultra-heavy');
  if (fp.voltageFrequency > 0.15) traits.push('voltage-heavy');
  if (fp.matchLength > 15) traits.push('long matches'); else if (fp.matchLength < 8) traits.push('short matches');
  return traits;
}
function _describeMechanic(m) {
  const parts = [];
  const unit = m.usageUnit ?? 'match', opportunities = m.analysisUnitOpportunityCount ?? m.matchOpportunityCount;
  parts.push(`Used in ${_pct(m.matchUsageRate)} of ${unit} observations (${m.sampleSize}/${opportunities}).`);
  if (m.outcomeAssociation !== null && Number.isFinite(m.outcomeAssociation)) { const dir = m.outcomeAssociation > 0 ? 'positive' : 'negative'; parts.push(`Outcome association: ${dir} (${m.outcomeAssociation.toFixed(3)}, CI ${_fmtCI(m.outcomeAssociation95)}).`); }
  if (m.immediatePointImpact) { const i = m.immediatePointImpact; parts.push(`Immediate point impact: mean ${i.mean?.toFixed(2)} over ${i.n} measured declarations.`); }
  parts.push(`Evidence grade: ${m.evidenceGrade} (${_gradeLabel(m.evidenceGrade)}).`);
  if (m.status === 'not-observable') parts.push('Status: not observable in current dataset.');
  return parts.join(' ');
}
function _describeSynergy(s) {
  const dir = s.relationshipClass === 'synergy' ? 'positive synergy' : 'anti-synergy';
  const status = s.status === 'positive' || s.status === 'negative' ? 'statistically significant' : 'inconclusive after FDR correction';
  return `${s.source} + ${s.target}: ${dir} (effect ${s.effect?.toFixed(3)}, shrunk ${s.shrunkEffect?.toFixed(3)}, CI ${_fmtCI(s.confidenceInterval)}, q=${s.qValue?.toFixed(4)}). ${status}. Joint sample: ${s.jointOpportunityCount}.`;
}
export function extractAnalysis({ analytics, aggregate = null }) {
  const policies = analytics.policies ?? [], mechanics = analytics.mechanics ?? [], synergies = analytics.synergies ?? [], motifs = analytics.motifs ?? [], anomalies = analytics.anomalies ?? [];
  const policyFindings = policies.map(p => ({ policyId: p.policyId, games: p.games, wins: p.wins, winRate: p.winRate, winRateCI: p.winWilson95, fingerprint: p.fingerprint, keyTraits: _describePolicy(p), summary: `${p.policyId}: ${p.wins}/${p.games} wins (${_pct(p.winRate)}, Wilson CI ${_fmtCI(p.winWilson95)}). Traits: ${_describePolicy(p).join(', ') || 'none notable'}.` }));
  const mechanicFindings = mechanics.map(m => ({ mechanic: m.mechanic, selectionCount: m.selectionCount, usageUnit: m.usageUnit ?? 'match', analysisUnitOpportunityCount: m.analysisUnitOpportunityCount ?? m.matchOpportunityCount, matchUsageRate: m.matchUsageRate, matchUsageWilson95: m.matchUsageWilson95, outcomeAssociation: m.outcomeAssociation, outcomeAssociationCI: m.outcomeAssociation95, immediatePointImpact: m.immediatePointImpact, evidenceGrade: m.evidenceGrade, status: m.status, sampleSize: m.sampleSize, replayRefs: m.replayRefs, summary: _describeMechanic(m) }));
  const synergyFindings = synergies.map(s => ({ pair: s.id, source: s.source, target: s.target, relationshipClass: s.relationshipClass, effect: s.effect, shrunkEffect: s.shrunkEffect, confidenceInterval: s.confidenceInterval, pValue: s.pValue, qValue: s.qValue, status: s.status, evidenceGrade: s.evidenceGrade, jointOpportunityCount: s.jointOpportunityCount, baselineCount: s.baselineCount, replayRefs: s.replayRefs, summary: _describeSynergy(s) }));
  const motifFindings = motifs.map(m => ({ motif: m.motif, count: m.count, matchIds: m.matchIds, outcomes: m.outcomes, summary: `${m.motif}: observed ${m.count} time(s) across ${m.matchIds?.length ?? 0} match(es).` }));
  const anomalySummary = anomalies.length ? { count: anomalies.length, byType: anomalies.reduce((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc; }, {}), summary: `${anomalies.length} anomaly/anomalies: ${Object.entries(anomalies.reduce((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc; }, {})).map(([t, c]) => `${t} (${c})`).join(', ')}.`, critical: anomalies.filter(a => a.severity === 'critical').length, warnings: anomalies.filter(a => a.severity === 'warning').length, info: anomalies.filter(a => a.severity === 'info').length } : { count: 0, byType: {}, summary: 'No anomalies detected.', critical: 0, warnings: 0, info: 0 };
  const matchCount = aggregate?.matchCount ?? analytics.summaryCount ?? 0, abortCount = aggregate?.abortCount ?? 0;
  const sumLines = [];
  sumLines.push(`Analysis covers ${matchCount} Advanced Core matches under Engine v${ENGINE_VERSION} / Rules v${RULES_VERSION}.`);
  sumLines.push(abortCount > 0 ? `${abortCount} match(es) aborted — integrity failures present.` : 'All matches completed without aborts.');
  const topPolicy = [...policyFindings].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  if (topPolicy) sumLines.push(`Highest win rate: ${topPolicy.policyId} at ${_pct(topPolicy.winRate)} (CI ${_fmtCI(topPolicy.winRateCI)}, ${topPolicy.games} games).`);
  const sigSyn = synergyFindings.filter(s => s.status === 'positive' || s.status === 'negative');
  sumLines.push(sigSyn.length ? `${sigSyn.length} statistically significant synergy/anti-synergy pair(s) after BH-FDR correction (q<=0.1).` : 'No synergy pairs reached statistical significance after FDR correction.');
  sumLines.push(`${mechanicFindings.filter(m => m.status === 'measured').length} mechanic(s) measured with evidence-backed associations.`);
  sumLines.push(anomalySummary.count > 0 ? `${anomalySummary.count} anomaly/anomalies flagged (${anomalySummary.critical} critical, ${anomalySummary.warnings} warning, ${anomalySummary.info} info).` : 'No anomalies flagged.');
  sumLines.push(analytics.completeness?.status === 'FAIL' ? `Data completeness: ${analytics.completeness.unclassifiedCount} unclassified fact(s) — tolerance exceeded.` : 'Data completeness: PASS (no unclassified facts).');
  sumLines.push(analytics.interpretationBoundary);
  const executiveSummary = sumLines.join(' ');
  const recommendations = [];
  if (anomalySummary.critical > 0) recommendations.push('Investigate critical anomalies — engine rejections or unsupported configurations detected.');
  if (analytics.completeness?.status === 'FAIL') recommendations.push('Reduce unclassified facts by expanding mechanic tagging coverage.');
  const inconclusive = synergyFindings.filter(s => s.status === 'inconclusive').length;
  if (inconclusive > synergyFindings.length * 0.8) recommendations.push('Most synergy findings are inconclusive — consider increasing match count for statistical power.');
  const lowSample = mechanicFindings.filter(m => m.sampleSize < 20).length;
  if (lowSample > 0) recommendations.push(`${lowSample} mechanic(s) have sample size below 20 — interpret with caution.`);
  if (!recommendations.length) recommendations.push('No action required — dataset is internally consistent and statistically sound.');
  const core = { extractVersion: EXTRACT_VERSION, analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION, sourceHash: analytics.observatoryHash ?? null, aggregateHash: aggregate?.aggregateHash ?? analytics.aggregateHash ?? null, executiveSummary, dataset: { matchCount, completedMatchCount: aggregate?.completedMatchCount ?? 0, abortCount, drawCount: aggregate?.drawCount ?? 0, detailedMatchCount: analytics.detailedMatchCount ?? 0, policyCount: policies.length, mechanicCount: mechanics.length, synergyCount: synergies.length, motifCount: motifs.length, anomalyCount: anomalies.length }, policyFindings, mechanicFindings, synergyFindings, motifFindings, anomalies: anomalySummary, completeness: analytics.completeness, metricRegistry: metricRegistryWithHashes(), interpretationBoundary: analytics.interpretationBoundary, recommendations };
  return { ...core, extractHash: hashCanonical(core) };
}

// ── Observatory analytics (browser-safe port) ─────────────────────
export function buildObservatoryAnalytics({ summaries, detailedMatches = [], aggregate = null }) {
  const mechanics = buildMechanicsAtlas(summaries, detailedMatches);
  const synergies = analyzeSynergies(summaries, { includeDiagnostics: true });
  const synergyDiagnostics = synergies.diagnostics ?? [];
  const motifs = mineCausalMotifs(detailedMatches);
  const policies = buildPolicyFingerprints(summaries);
  const anomalies = detectAnomalies(summaries, detailedMatches);
  const unclassifiedCount = mechanics.filter((item) => item.mechanic === 'unclassified').reduce((s, item) => s + item.selectionCount, 0);
  const allMechanicTags = [...new Set(mechanics.map((m) => m.mechanic))].sort();
  const quarantineLedger = quarantineUnknownTags(allMechanicTags);
  const dimensionCounts = {};
  for (const m of mechanics) { const dim = m.dimension ?? 'diagnostic'; dimensionCounts[dim] = (dimensionCounts[dim] ?? 0) + 1; }
  const hasOpportunityTelemetry = summaries.some((s) => s.mechanicOpportunityCounts && Object.keys(s.mechanicOpportunityCounts).length > 0);
  let rankAnalytics = buildRankAnalytics({ summaries, aggregate });
  let variantAnalytics = null;
  try { variantAnalytics = buildVariantAnalytics({ summaries, aggregate }); }
  catch (error) { console.error('buildObservatoryAnalytics: variant analytics failed:', error); }
  try { rankAnalytics = expandTenSuitsInRankPower(rankAnalytics, variantAnalytics); }
  catch (error) { console.error('buildObservatoryAnalytics: ten-suit expansion failed:', error); }
  const pairedABBA = buildPairedABBAAnalysis(summaries);
  const _f = (p) => mechanics.filter(p).length;
  const nearThresholdPairs = synergyDiagnostics.filter(d => d.reasonCode === 'INSUFFICIENT_BOTH' && (d.cohortN?.both ?? 0) >= 10).length;
  const campaignHealth = { trackedEntities: mechanics.length, canonicalMechanics: _f(m => m.dimension === 'canonical-mechanic'), entitiesWithOpportunityData: _f(m => m.hasOpportunityData), entitiesWithValidPickRate: _f(m => m.pickRateStatus?.status === 'available'), entitiesWithRawAssociation: _f(m => m.rawWinAssociationStatus?.status === 'available'), entitiesWithAdjustedAssociation: _f(m => m.adjustedWinAssociationStatus?.status === 'available'), entitiesWithPointImpact: _f(m => m.pointImpactStatus?.status === 'available' && m.actorPointImpact != null), eligibleSynergyPairs: synergies.length, nearThresholdPairs, successfullyModeledSynergyPairs: synergies.filter(s => s.evidenceGrade !== 'INSUFFICIENT').length, unmappedDiagnostics: _f(m => m.dimension === 'diagnostic' && !m.registryVerified), incompleteABBA: pairedABBA?.incompletePairs ?? 0 };
  const core = { schemaVersion: ANALYTICS_SCHEMA_VERSION, metricRegistry: metricRegistryWithHashes(), summaryCount: summaries.length, aggregateHash: aggregate?.aggregateHash ?? null, mechanics, synergies, synergyDiagnostics, motifs, policies, anomalies, rankPower: rankAnalytics.rankPower, swapMatrix: rankAnalytics.swapMatrix, rankCounters: rankAnalytics.rankCounters, tenSuitExpansion: rankAnalytics.tenSuitExpansion ?? null, variantAnalytics, pairedABBA, mechanicRegistryHash: mechanicRegistryHash(), quarantineLedger, taxonomyDimensions: dimensionCounts, hasOpportunityTelemetry, legacySchema: !hasOpportunityTelemetry, campaignHealth, completeness: { unclassifiedCount, tolerance: 0, status: unclassifiedCount === 0 ? 'PASS' : 'FAIL' }, interpretationBoundary: 'Browser-side observatory analytics. Associations are evidence-backed, not causal proof. Win association is not causal proof. Synergy interaction is the A×B odds-ratio from a stratified logistic model.' };
  return { ...core, observatoryHash: hashCanonical(core) };
}

// ── Paired AB/BA seat-swap analysis (browser port) ──
function buildPairedABBAAnalysis(summaries) {
  const hasPairedRunIds = summaries.some((r) => r.pairedRunId);
  const pairBlocks = new Map();
  let incompletePairs = 0;
  for (const row of summaries) {
    const blockKey = (hasPairedRunIds && row.pairedRunId) ? row.pairedRunId : [...(row.policyIds ?? [])].sort().join('__');
    if (!pairBlocks.has(blockKey)) pairBlocks.set(blockKey, []);
    pairBlocks.get(blockKey).push(row);
  }
  const pairResults = [];
  for (const [blockKey, rows] of pairBlocks) {
    rows.sort((a, b) => (a.matchOrdinal ?? 0) - (b.matchOrdinal ?? 0));
    const policyA = rows[0]?.policyIds?.[0] ?? 'A', policyB = rows[0]?.policyIds?.[1] ?? 'B';
    const pairs = [];
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const seat1Row = rows[i], seat2Row = rows[i + 1];
      if (!seat1Row || !seat2Row) { incompletePairs += 1; continue; }
      const seatSwapped = seat2Row.seatSwapped === true || (JSON.stringify(seat2Row.seatOrder) !== JSON.stringify(seat1Row.seatOrder));
      const s1wp = seat1Row.winner !== 'DRAW' && seat1Row.winner !== 'ABORTED' ? seat1Row.policyIds[seat1Row.seatOrder.indexOf(seat1Row.winner)] : null;
      const s2wp = seat2Row.winner !== 'DRAW' && seat2Row.winner !== 'ABORTED' ? seat2Row.policyIds[seat2Row.seatOrder.indexOf(seat2Row.winner)] : null;
      pairs.push({ aSeat1Win: s1wp === policyA, bSeat1Win: s1wp === policyB, aSeat2Win: s2wp === policyA, bSeat2Win: s2wp === policyB, seatSwapped, pairedRunId: seat1Row.pairedRunId ?? null });
    }
    if (rows.length % 2 === 1) incompletePairs += 1;
    if (pairs.length === 0) continue;
    const allSwapped = pairs.every((p) => p.seatSwapped);
    const mcnemar = mcnemarPairedTest(pairs);
    const bootstrap = pairedBootstrapABBA(pairs, { iterations: 2000, seed: `abba:${blockKey}` });
    pairResults.push({ policyPair: blockKey, policyA, policyB, pairedBlocks: pairs.length, seatSwapVerified: allSwapped, mcnemar, bootstrap, design: allSwapped ? 'matched AB/BA seat-swap (verified)' : 'AB/BA seat-swap (unverified — legacy or incomplete)', interpretation: mcnemar.pValue < 0.05 ? 'statistically significant seat-policy differential (p < 0.05)' : 'no statistically significant seat-policy differential detected' });
  }
  const totalPairs = pairResults.reduce((s, r) => s + r.pairedBlocks, 0);
  return { schemaVersion: ANALYTICS_SCHEMA_VERSION, design: 'matched AB/BA seat-swap', pairCount: pairResults.length, totalPairedBlocks: totalPairs, incompletePairs, hasPairedRunIds, pairResults: pairResults.sort((a, b) => a.policyPair.localeCompare(b.policyPair)), interpretationBoundary: hasPairedRunIds ? 'AB/BA pairs are linked by pairedRunId.' : 'AB/BA pairs are matched by policy-pair block (legacy).' };
}
