// Cohort-Relative Rank Power Model — v0.14.1
// Computes a six-axis power profile for each rank, relative to the cohort
// (all ranks in the same campaign). Includes Observed RPI, Decision Power,
// confidence/status, and balance watchlist.
//
// The six axes:
// 1. Selection Power — how often this rank is selected when available
// 2. Victory Power — contribution to victories vs defeats
// 3. Score Power — secured point contribution per selection
// 4. Board Power — board presence contribution per selection
// 5. Response Power — counter/response play frequency
// 6. Observed Rank Value (ORV) — observational decision value when selected
//
// All axes are normalized to [0, 1] within the cohort (min-max across ranks).
// The composite Observed RPI is a weighted sum of the six axes.
// Decision Power incorporates Observed Rank Value (ORV).
//
// Missingness is not zero: axes without causal state deltas are labeled
// 'not-observable' and never normalize to 0, 0.5, or HIGH.


export const RANK_POWER_SCHEMA_VERSION = '1.0.0';

// Weights for the six axes in the composite Observed RPI
export const RPI_AXIS_WEIGHTS = Object.freeze({
  selectionPower: 0.20,
  victoryPower: 0.25,
  scorePower: 0.20,
  boardPower: 0.10,
  responsePower: 0.10,
  observedRankValue: 0.15
});

// Confidence status thresholds
export const CONFIDENCE_THRESHOLDS = Object.freeze({
  HIGH: 200,    // 200+ total opportunities
  MEDIUM: 50,   // 50+ total opportunities
  LOW: 10       // 10+ total opportunities
});

// Balance watchlist thresholds
export const BALANCE_THRESHOLDS = Object.freeze({
  OVERPOWERED_RPI: 0.75,    // RPI > 0.75 with HIGH confidence
  UNDERPOWERED_RPI: 0.25,   // RPI < 0.25 with HIGH confidence
  DOMINANT_SELECTION: 0.80, // Selection rate > 80% with HIGH confidence
  NEGLIGIBLE_SELECTION: 0.05 // Selection rate < 5% with HIGH confidence
});

/**
 * Normalize a set of values to [0, 1] using min-max scaling.
 * If all values are equal, returns 0.5 for all.
 * @param {object} valuesByRank - { [rank]: number }
 * @returns {object} normalized values { [rank]: number }
 */
export function normalizeMinimax(valuesByRank) {
  const values = Object.values(valuesByRank);
  if (values.length === 0) return {};
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) {
    const result = {};
    for (const rank of Object.keys(valuesByRank)) result[rank] = 0.5;
    return result;
  }
  const result = {};
  for (const [rank, value] of Object.entries(valuesByRank)) {
    result[rank] = (value - min) / range;
  }
  return result;
}

/**
 * Compute the six-axis power profile for each rank.
 * @param {object} rankMetrics - per-rank metrics from computeRankMetrics or aggregate
 * @param {object} rankORV - aggregated Observed Rank Value per rank
 * @returns {object} per-rank six-axis power profile with missingness-aware status
 */
export function computePowerAxes(rankMetrics, rankORV = {}) {
  const ranks = Object.keys(rankMetrics);
  if (ranks.length === 0) return {};

  // Raw values per axis
  const rawSelection = {};
  const rawVictory = {};
  const rawScore = {};
  const rawBoard = {};
  const rawResponse = {};
  const rawObservedRankValue = {};
  // Axis availability status: 'observed' | 'insufficient' | 'not-observable' | 'degenerate'
  const axisStatus = {};

  for (const rank of ranks) {
    const m = rankMetrics[rank];
    axisStatus[rank] = {};

    // Selection Power: selection rate
    if (m.rankOpportunityCount > 0) {
      rawSelection[rank] = m.rankSelectionCount / m.rankOpportunityCount;
      axisStatus[rank].selectionPower = 'observed';
    } else {
      rawSelection[rank] = null;
      axisStatus[rank].selectionPower = 'not-observable';
    }

    // Victory Power: victory contribution / (victory + defeat)
    const totalOutcomes = m.rankVictoryContributionCount + m.rankDefeatExposureCount;
    if (totalOutcomes > 0) {
      rawVictory[rank] = m.rankVictoryContributionCount / totalOutcomes;
      axisStatus[rank].victoryPower = 'observed';
    } else {
      rawVictory[rank] = null; // not-observable — never 0.5
      axisStatus[rank].victoryPower = 'not-observable';
    }

    // Score/Board Power require an attached causal state delta. A numeric zero
    // is valid evidence only when the observation counter proves the action was
    // actually measured; legacy/missing telemetry must not masquerade as zero.
    const causalObservations = Number(m.rankStateDeltaObservationCount ?? 0);
    const causalCoverage = m.rankSelectionCount > 0 ? causalObservations / m.rankSelectionCount : 0;
    if (m.rankSelectionCount > 0 && causalObservations > 0 && m.rankSecuredPointContribution !== undefined) {
      rawScore[rank] = m.rankSecuredPointContribution / causalObservations;
      axisStatus[rank].scorePower = causalCoverage >= 0.95 ? 'observed' : 'insufficient';
    } else {
      rawScore[rank] = null;
      axisStatus[rank].scorePower = 'not-observable';
    }

    if (m.rankSelectionCount > 0 && causalObservations > 0 && m.rankBoardPresenceContribution !== undefined) {
      rawBoard[rank] = m.rankBoardPresenceContribution / causalObservations;
      axisStatus[rank].boardPower = causalCoverage >= 0.95 ? 'observed' : 'insufficient';
    } else {
      rawBoard[rank] = null;
      axisStatus[rank].boardPower = 'not-observable';
    }

    // Response Power: counter + response played frequency per selection
    if (m.rankSelectionCount > 0) {
      // rankResponsePlayedCount already includes counters; summing the two
      // double-counts counter actions and inflates the response axis.
      rawResponse[rank] = m.rankResponsePlayedCount / m.rankSelectionCount;
      axisStatus[rank].responsePower = 'observed';
    } else {
      rawResponse[rank] = null;
      axisStatus[rank].responsePower = 'not-observable';
    }

    // Observed Rank Value (ORV): observational, not counterfactual
    const orv = rankORV[rank];
    const orvSampleSize = orv?.sampleSize ?? orv?.observationalSampleCount ?? orv?.totalRollouts ?? 0;
    if (orv && Number.isFinite(orv.averageDecisionValue) && orvSampleSize > 0) {
      rawObservedRankValue[rank] = orv.averageDecisionValue;
      axisStatus[rank].observedRankValue = 'observed';
    } else {
      rawObservedRankValue[rank] = null;
      axisStatus[rank].observedRankValue = 'not-observable';
    }
  }

  // A cohort-constant axis carries no ranking information. Mark it as
  // degenerate so it is displayed as neutral/unavailable and excluded from
  // RPI/watchlist evidence instead of silently contributing 0.5 everywhere.
  const rawByAxis = {
    selectionPower: rawSelection,
    victoryPower: rawVictory,
    scorePower: rawScore,
    boardPower: rawBoard,
    responsePower: rawResponse,
    observedRankValue: rawObservedRankValue
  };
  for (const [axis, valuesByRank] of Object.entries(rawByAxis)) {
    const observedValues = Object.entries(valuesByRank)
      .filter(([rank, value]) => axisStatus[rank]?.[axis] === 'observed' && Number.isFinite(value))
      .map(([, value]) => value);
    if (observedValues.length > 0 && Math.max(...observedValues) === Math.min(...observedValues)) {
      for (const rank of ranks) {
        if (axisStatus[rank]?.[axis] === 'observed') axisStatus[rank][axis] = 'degenerate';
      }
    }
  }

  // Normalize each axis to [0, 1], excluding not-observable entries
  const normSelection = normalizeMinimaxAware(rawSelection);
  const normVictory = normalizeMinimaxAware(rawVictory);
  const normScore = normalizeMinimaxAware(rawScore);
  const normBoard = normalizeMinimaxAware(rawBoard);
  const normResponse = normalizeMinimaxAware(rawResponse);
  const normObservedRankValue = normalizeMinimaxAware(rawObservedRankValue);

  const profiles = {};
  for (const rank of ranks) {
    const m = rankMetrics[rank];
    profiles[rank] = {
      rank,
      axes: {
        selectionPower: normSelection[rank],
        victoryPower: normVictory[rank],
        scorePower: normScore[rank],
        boardPower: normBoard[rank],
        responsePower: normResponse[rank],
        observedRankValue: normObservedRankValue[rank]
      },
      axisStatus: axisStatus[rank],
      raw: {
        selectionRate: rawSelection[rank],
        victoryRate: rawVictory[rank],
        scorePerSelection: rawScore[rank],
        boardPerSelection: rawBoard[rank],
        responseRate: rawResponse[rank],
        observedRankValue: rawObservedRankValue[rank],
        causalCoverage: m.rankSelectionCount > 0 ? Number(m.rankStateDeltaObservationCount ?? 0) / m.rankSelectionCount : 0
      }
    };
  }
  return profiles;
}

/**
 * Normalize a set of values to [0, 1] using min-max scaling, treating null
 * (not-observable) entries as unavailable rather than zero or 0.5.
 * If all observed values are equal, returns 0.5 for observed entries (labeled
 * 'degenerate' by the caller) and null for not-observable entries.
 * @param {object} valuesByRank - { [rank]: number | null }
 * @returns {object} normalized values { [rank]: number | null }
 */
export function normalizeMinimaxAware(valuesByRank) {
  const entries = Object.entries(valuesByRank).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) {
    const result = {};
    for (const rank of Object.keys(valuesByRank)) result[rank] = null;
    return result;
  }
  const values = entries.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const result = {};
  for (const rank of Object.keys(valuesByRank)) {
    if (valuesByRank[rank] === null || valuesByRank[rank] === undefined) {
      result[rank] = null; // not-observable stays null
    } else if (range === 0) {
      result[rank] = 0.5; // degenerate: all observed values equal
    } else {
      result[rank] = (valuesByRank[rank] - min) / range;
    }
  }
  return result;
}

/**
 * Compute the Observed RPI (Rank Power Index) for each rank.
 * RPI = weighted sum of the six normalized axes, skipping not-observable (null)
 * axes and renormalizing weights over observed axes only.
 * @param {object} powerProfiles - result of computePowerAxes
 * @returns {object} per-rank RPI (null if insufficient axes observed)
 */
export function computeObservedRPI(powerProfiles) {
  const rpi = {};
  for (const [rank, profile] of Object.entries(powerProfiles)) {
    const a = profile.axes;
    const status = profile.axisStatus ?? {};
    let weightedSum = 0, weightSum = 0, observedAxes = 0;
    for (const [axis, weight] of Object.entries(RPI_AXIS_WEIGHTS)) {
      const value = a[axis];
      const stat = status[axis];
      if (value !== null && value !== undefined && (stat === 'observed' || stat === 'degenerate')) {
        // Degenerate axes are neutral cohort constants. They keep the composite
        // numerically stable but never qualify as evidence for confidence or
        // balance-watchlist decisions.
        weightedSum += value * weight;
        weightSum += weight;
        observedAxes += 1;
      }
    }
    if (weightSum === 0 || observedAxes < 3) {
      rpi[rank] = null; // insufficient observed axes
    } else {
      rpi[rank] = weightedSum / weightSum; // renormalized over observed axes
    }
  }
  return rpi;
}

/**
 * Compute the Decision Power for each rank.
 * Decision Power = RPI adjusted by Observed Rank Value (ORV) confidence.
 * @param {object} rpi - per-rank RPI
 * @param {object} rankORV - aggregated Observed Rank Value per rank
 * @returns {object} per-rank Decision Power
 */
export function computeDecisionPower(rpi, rankORV, powerProfiles = {}) {
  const fallbackRawOrv = {};
  for (const rank of Object.keys(rpi)) {
    const orv = rankORV[rank];
    const sampleSize = orv?.sampleSize ?? orv?.observationalSampleCount ?? orv?.totalRollouts ?? 0;
    fallbackRawOrv[rank] = orv && Number.isFinite(orv.averageDecisionValue) && sampleSize > 0
      ? orv.averageDecisionValue
      : null;
  }
  const fallbackNormalizedOrv = normalizeMinimaxAware(fallbackRawOrv);
  const result = {};
  for (const rank of Object.keys(rpi)) {
    const baseRpi = rpi[rank];
    if (!Number.isFinite(baseRpi)) {
      result[rank] = null;
      continue;
    }
    const orv = rankORV[rank];
    const orvConfidence = orv?.confidence ?? 'INSUFFICIENT';
    // Decision Power blends RPI with cohort-normalized ORV. Raw ORV values are
    // not bounded and must never be shifted with a magic +0.5 constant.
    const orvWeight = orvConfidence === 'HIGH' ? 0.3 : orvConfidence === 'MEDIUM' ? 0.2 : orvConfidence === 'LOW' ? 0.1 : 0;
    const normalizedOrv = powerProfiles[rank]?.axes?.observedRankValue ?? fallbackNormalizedOrv[rank];
    result[rank] = orvWeight > 0 && Number.isFinite(normalizedOrv)
      ? baseRpi * (1 - orvWeight) + normalizedOrv * orvWeight
      : baseRpi;
  }
  return result;
}

/**
 * Determine confidence status for a rank based on opportunity count AND causal
 * coverage. Confidence must not be HIGH from opportunity count alone — score
 * and board axes require causal state deltas to be observed.
 * @param {object} rankMetrics
 * @param {object} axisStatus - optional axis availability status from powerProfiles
 * @returns {string} HIGH | MEDIUM | LOW | INSUFFICIENT
 */
export function confidenceStatus(rankMetrics, axisStatus = null) {
  const opportunities = rankMetrics.rankOpportunityCount;
  const baseStatus = opportunities >= CONFIDENCE_THRESHOLDS.HIGH ? 'HIGH'
    : opportunities >= CONFIDENCE_THRESHOLDS.MEDIUM ? 'MEDIUM'
    : opportunities >= CONFIDENCE_THRESHOLDS.LOW ? 'LOW'
    : 'INSUFFICIENT';
  // If causal axes (score, board) are not-observable, cap confidence at MEDIUM
  if (baseStatus === 'HIGH' && axisStatus) {
    const scoreObserved = axisStatus.scorePower === 'observed';
    const boardObserved = axisStatus.boardPower === 'observed';
    if (!scoreObserved || !boardObserved) return 'MEDIUM';
  }
  return baseStatus;
}

/**
 * Build the balance watchlist from RPI and confidence.
 * Balance flags require all mandatory axes (selection, victory, score, board)
 * to be observed with valid causal provenance, adequate effective samples, and
 * HIGH confidence. If requirements are unmet, return an empty watchlist with
 * an explicit suppression reason.
 * @param {object} rpi - per-rank RPI
 * @param {object} rankMetrics - per-rank metrics
 * @param {object} powerProfiles - optional power profiles with axisStatus
 * @returns {object} watchlist { overpowered: [], underpowered: [], dominant: [], negligible: [], suppressed: boolean, suppressionReason: string|null }
 */
export function buildBalanceWatchlist(rpi, rankMetrics, powerProfiles = null) {
  const watchlist = { overpowered: [], underpowered: [], dominant: [], negligible: [], suppressed: false, suppressionReason: null };
  const MANDATORY_AXES = ['selectionPower', 'victoryPower', 'scorePower', 'boardPower'];

  for (const [rank, value] of Object.entries(rpi)) {
    if (value === null || value === undefined) continue;
    const m = rankMetrics[rank];
    if (!m) continue;
    const axisStatus = powerProfiles?.[rank]?.axisStatus ?? null;
    const status = confidenceStatus(m, axisStatus);
    if (status !== 'HIGH') continue;

    // Require all mandatory axes to be observed
    if (axisStatus) {
      const allMandatoryObserved = MANDATORY_AXES.every(axis => axisStatus[axis] === 'observed');
      if (!allMandatoryObserved) {
        watchlist.suppressed = true;
        watchlist.suppressionReason = `rank ${rank}: mandatory axes not all observed (causal state deltas missing)`;
        continue;
      }
    }

    if (value > BALANCE_THRESHOLDS.OVERPOWERED_RPI) {
      watchlist.overpowered.push({ rank, rpi: value, reason: 'RPI exceeds 0.75 with HIGH confidence and all mandatory axes observed' });
    }
    if (value < BALANCE_THRESHOLDS.UNDERPOWERED_RPI) {
      watchlist.underpowered.push({ rank, rpi: value, reason: 'RPI below 0.25 with HIGH confidence and all mandatory axes observed' });
    }
    const selectionRate = m.rankOpportunityCount > 0 ? m.rankSelectionCount / m.rankOpportunityCount : 0;
    if (selectionRate > BALANCE_THRESHOLDS.DOMINANT_SELECTION) {
      watchlist.dominant.push({ rank, selectionRate, reason: 'Selection rate exceeds 80% with HIGH confidence' });
    }
    if (selectionRate < BALANCE_THRESHOLDS.NEGLIGIBLE_SELECTION) {
      watchlist.negligible.push({ rank, selectionRate, reason: 'Selection rate below 5% with HIGH confidence' });
    }
  }
  if (watchlist.suppressed && watchlist.overpowered.length === 0 && watchlist.underpowered.length === 0 && watchlist.dominant.length === 0 && watchlist.negligible.length === 0) {
    watchlist.suppressionReason = watchlist.suppressionReason ?? 'mandatory axes not all observed (causal state deltas missing)';
  }
  return watchlist;
}

/**
 * Build the complete rank power model output.
 * @param {object} params
 * @param {object} params.rankMetrics - per-rank metrics (aggregate)
 * @param {object} params.rankORV - aggregated Observed Rank Value per rank
 * @param {string} params.aggregateHash
 * @returns {object} complete rank power model
 */
export function buildRankPowerModel({ rankMetrics, rankORV = {}, rankCDV = {}, aggregateHash }) {
  // Support both new rankORV and legacy rankCDV parameter names
  const orvInput = Object.keys(rankORV).length > 0 ? rankORV : rankCDV;
  const powerProfiles = computePowerAxes(rankMetrics, orvInput);
  const rpi = computeObservedRPI(powerProfiles);
  const decisionPower = computeDecisionPower(rpi, orvInput, powerProfiles);
  const watchlist = buildBalanceWatchlist(rpi, rankMetrics, powerProfiles);

  // Compute axis coverage
  const axisCoverage = {};
  for (const axis of Object.keys(RPI_AXIS_WEIGHTS)) {
    const observed = Object.values(powerProfiles).filter(p => p.axisStatus?.[axis] === 'observed').length;
    const total = Object.keys(powerProfiles).length;
    axisCoverage[axis] = { observed, total, rate: total > 0 ? observed / total : 0 };
  }

  // Build per-rank complete profile
  const ranks = {};
  for (const rank of Object.keys(rankMetrics)) {
    const m = rankMetrics[rank];
    const profile = powerProfiles[rank];
    ranks[rank] = {
      rank,
      rpi: rpi[rank],
      rpiStatus: rpi[rank] === null ? 'UNAVAILABLE' : 'OBSERVED',
      decisionPower: decisionPower[rank],
      confidence: confidenceStatus(m, profile?.axisStatus),
      axes: profile?.axes ?? {},
      axisStatus: profile?.axisStatus ?? {},
      raw: profile?.raw ?? {},
      metrics: {
        selectionCount: m.rankSelectionCount,
        opportunityCount: m.rankOpportunityCount,
        selectionRate: m.rankOpportunityCount > 0 ? m.rankSelectionCount / m.rankOpportunityCount : 0,
        victoryContributionCount: m.rankVictoryContributionCount,
        defeatExposureCount: m.rankDefeatExposureCount,
        securedPointContribution: m.rankSecuredPointContribution,
        boardPresenceContribution: m.rankBoardPresenceContribution,
        stateDeltaObservationCount: m.rankStateDeltaObservationCount ?? 0,
        causalCoverage: m.rankSelectionCount > 0 ? Number(m.rankStateDeltaObservationCount ?? 0) / m.rankSelectionCount : 0
      },
      orv: orvInput[rank] ?? null
    };
  }

  // Rank ladder (sorted by RPI descending, null RPI at end)
  const ladder = Object.entries(ranks)
    .map(([rank, data]) => ({ rank, rpi: data.rpi, rpiStatus: data.rpiStatus, confidence: data.confidence }))
    .sort((a, b) => (b.rpi ?? -1) - (a.rpi ?? -1));

  return {
    schemaVersion: RANK_POWER_SCHEMA_VERSION,
    axisWeights: { ...RPI_AXIS_WEIGHTS },
    axisCoverage,
    ranks,
    ladder,
    watchlist,
    aggregateHash
  };
}
