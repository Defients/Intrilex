// Counterfactual Rank Decision Value — v0.11.0
// Extends the existing counterfactual machinery with rank-aware analysis.
// For each decision where a rank R was selected, computes the difference in
// outcome when an alternative action of a different rank R' is selected instead.
//
// Key outputs:
// - Per-rank counterfactual decision value (CDV)
// - Per-rank-pair swap value (R → R')
// - Confidence intervals from rollout variance
// - Eligible anchor selection (only decisions with at least 2 rank-distinct legal options)

import {  buildSourceCards,   isNoAttributionAction } from './rank-attribution.mjs';
import { parseIdentity} from '@intrilex/engine-adapter';

export const RANK_COUNTERFACTUAL_SCHEMA_VERSION = '1.0.0';

/**
 * Check if a decision frame is eligible for rank counterfactual analysis.
 * A frame is eligible if it has at least 2 legal actions with distinct primary ranks.
 * @param {Array} legalActions
 * @param {object} state - engine state for resolving card identities
 * @returns {object} { eligible, rankDistinctActions, rankDistinctCount }
 */
export function eligibleRankAnchor(legalActions, state) {
  const rankActions = new Map(); // rank → first action with that rank
  for (const action of legalActions) {
    if (isNoAttributionAction(action)) continue;
    const sourceCards = buildSourceCards(state, action, 'private');
    if (sourceCards.length === 0) continue;
    const observableCards = sourceCards.filter(c => c.identity && c.identity !== 'UNKNOWN');
    if (observableCards.length === 0) continue;
    const ranks = new Set();
    for (const c of observableCards) {
      const parsed = parseIdentity(c.identity);
      if (parsed) ranks.add(parsed.rank);
    }
    if (ranks.size === 0) continue;
    // Use first rank as primary for eligibility
    const primaryRank = [...ranks][0];
    if (!rankActions.has(primaryRank)) {
      rankActions.set(primaryRank, action);
    }
  }
  return {
    eligible: rankActions.size >= 2,
    rankDistinctActions: [...rankActions.entries()].map(([rank, action]) => ({ rank, actionId: action.actionId, action })),
    rankDistinctCount: rankActions.size
  };
}

/**
 * Compute the counterfactual rank decision value from paired rollout results.
 * @param {object} selected - { rollouts: [{ winner, scoreMargin, ... }] }
 * @param {object} alternative - { rollouts: [{ winner, scoreMargin, ... }] }
 * @param {string} selectedRank
 * @param {string} alternativeRank
 * @param {string} focalParticipantId
 * @returns {object} CDV result
 */
export function computeRankDecisionValue(selected, alternative, selectedRank, alternativeRank, focalParticipantId) {
  const selectedRollouts = selected.rollouts ?? selected.results ?? [];
  const alternativeRollouts = alternative.rollouts ?? alternative.results ?? [];
  const n = Math.min(selectedRollouts.length, alternativeRollouts.length);
  if (n === 0) {
    return {
      schemaVersion: RANK_COUNTERFACTUAL_SCHEMA_VERSION,
      selectedRank,
      alternativeRank,
      focalParticipantId,
      rolloutCount: 0,
      selectedWinRate: null,
      alternativeWinRate: null,
      winRateDelta: null,
      selectedScoreMargin: null,
      alternativeScoreMargin: null,
      scoreMarginDelta: null,
      confidence: 'INSUFFICIENT',
      decisionValue: null
    };
  }

  let selectedWins = 0, alternativeWins = 0;
  let selectedScoreSum = 0, alternativeScoreSum = 0;
  const selectedMargins = [], alternativeMargins = [];
  for (let i = 0; i < n; i++) {
    const s = selectedRollouts[i], a = alternativeRollouts[i];
    if (s.winner === focalParticipantId || s.winningSeat === focalParticipantId) selectedWins++;
    if (a.winner === focalParticipantId || a.winningSeat === focalParticipantId) alternativeWins++;
    const sMargin = s.scoreMargin ?? 0;
    const aMargin = a.scoreMargin ?? 0;
    selectedScoreSum += sMargin;
    alternativeScoreSum += aMargin;
    selectedMargins.push(sMargin);
    alternativeMargins.push(aMargin);
  }

  const selectedWinRate = selectedWins / n;
  const alternativeWinRate = alternativeWins / n;
  const winRateDelta = selectedWinRate - alternativeWinRate;
  const selectedScoreMargin = selectedScoreSum / n;
  const alternativeScoreMargin = alternativeScoreSum / n;
  const scoreMarginDelta = selectedScoreMargin - alternativeScoreMargin;

  // Confidence: based on sample size and variance
  const confidence = n >= 32 ? 'HIGH' : n >= 16 ? 'MEDIUM' : n >= 8 ? 'LOW' : 'INSUFFICIENT';

  // Decision value: composite of win rate delta and score margin delta
  // Normalized to [-1, 1] range
  const decisionValue = winRateDelta + (scoreMarginDelta / 100);

  return {
    schemaVersion: RANK_COUNTERFACTUAL_SCHEMA_VERSION,
    selectedRank,
    alternativeRank,
    focalParticipantId,
    rolloutCount: n,
    selectedWinRate,
    alternativeWinRate,
    winRateDelta,
    selectedScoreMargin,
    alternativeScoreMargin,
    scoreMarginDelta,
    confidence,
    decisionValue
  };
}

/**
 * Build a rank swap value matrix from a set of paired counterfactual results.
 * @param {Array} pairedResults - array of { selectedRank, alternativeRank, cdv }
 * @returns {object} swap matrix: { [selectedRank]: { [alternativeRank]: cdv } }
 */
export function buildRankSwapMatrix(pairedResults) {
  const matrix = {};
  for (const result of pairedResults) {
    const { selectedRank, alternativeRank, cdv } = result;
    if (!matrix[selectedRank]) matrix[selectedRank] = {};
    matrix[selectedRank][alternativeRank] = cdv;
  }
  return matrix;
}

/**
 * Aggregate counterfactual rank decision values across multiple decisions.
 * @param {Array} cdvResults - array of CDV results
 * @returns {object} aggregated per-rank CDV
 */
export function aggregateRankDecisionValues(cdvResults) {
  const byRank = {};
  for (const cdv of cdvResults) {
    if (cdv.confidence === 'INSUFFICIENT') continue;
    if (!byRank[cdv.selectedRank]) {
      byRank[cdv.selectedRank] = {
        rank: cdv.selectedRank,
        totalRollouts: 0,
        winRateDeltas: [],
        scoreMarginDeltas: [],
        decisionValues: [],
        swapCount: 0
      };
    }
    const isObservational = cdv.rolloutCount == null && (cdv.observationalSampleCount != null || cdv.selectedSampleSize != null);
    const sampleCount = cdv.rolloutCount ?? cdv.selectedSampleSize ?? cdv.observationalSampleCount ?? cdv.sampleSize ?? 0;
    // Observational pair rows reuse the same selected-rank outcomes against
    // multiple alternatives; summing them would multiply the effective sample
    // size by the number of comparisons. Paired rollout anchors remain additive.
    byRank[cdv.selectedRank].totalRollouts = isObservational
      ? Math.max(byRank[cdv.selectedRank].totalRollouts, sampleCount)
      : byRank[cdv.selectedRank].totalRollouts + sampleCount;
    byRank[cdv.selectedRank].winRateDeltas.push(cdv.winRateDelta);
    byRank[cdv.selectedRank].scoreMarginDeltas.push(cdv.scoreMarginDelta);
    byRank[cdv.selectedRank].decisionValues.push(cdv.decisionValue);
    byRank[cdv.selectedRank].swapCount++;
  }

  // Compute averages
  const aggregated = {};
  for (const [rank, data] of Object.entries(byRank)) {
    const n = data.swapCount;
    aggregated[rank] = {
      rank,
      swapCount: n,
      totalRollouts: data.totalRollouts,
      sampleSize: data.totalRollouts,
      averageWinRateDelta: n > 0 ? data.winRateDeltas.reduce((a, b) => a + b, 0) / n : 0,
      averageScoreMarginDelta: n > 0 ? data.scoreMarginDeltas.reduce((a, b) => a + b, 0) / n : 0,
      averageDecisionValue: n > 0 ? data.decisionValues.reduce((a, b) => a + b, 0) / n : 0,
      confidence: data.totalRollouts >= 128 ? 'HIGH' : data.totalRollouts >= 64 ? 'MEDIUM' : data.totalRollouts >= 32 ? 'LOW' : 'INSUFFICIENT'
    };
  }
  return aggregated;
}

/**
 * Select eligible anchors from a list of decision frames for rank counterfactual analysis.
 * @param {Array} frames - array of { checkpointIndex, state, legalActions }
 * @param {number} maxAnchors - maximum number of anchors to select
 * @returns {Array} eligible anchors with rank-distinct actions
 */
export function selectEligibleRankAnchors(frames, maxAnchors = 50) {
  const anchors = [];
  for (const frame of frames) {
    const eligibility = eligibleRankAnchor(frame.legalActions ?? [], frame.state);
    if (eligibility.eligible) {
      anchors.push({
        checkpointIndex: frame.checkpointIndex,
        rankDistinctActions: eligibility.rankDistinctActions,
        rankDistinctCount: eligibility.rankDistinctCount
      });
      if (anchors.length >= maxAnchors) break;
    }
  }
  return anchors;
}

/**
 * Build a complete rank counterfactual output from a set of paired results.
 * @param {object} params
 * @param {Array} params.cdvResults
 * @param {string} params.aggregateHash
 * @returns {object} rank counterfactual output
 */
export function buildRankCounterfactualOutput({ cdvResults, aggregateHash }) {
  const swapMatrix = buildRankSwapMatrix(cdvResults);
  const aggregated = aggregateRankDecisionValues(cdvResults);
  return {
    schemaVersion: RANK_COUNTERFACTUAL_SCHEMA_VERSION,
    swapMatrix,
    aggregated,
    aggregateHash,
    resultCount: cdvResults.length
  };
}
