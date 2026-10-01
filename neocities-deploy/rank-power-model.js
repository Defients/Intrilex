// === Rank Power Model (browser-safe) ===
// Mirrors packages/simulation-runtime/src/rank-power.mjs. Keep this section in
// schema lockstep with the server implementation; browser campaigns use it
// directly and must not emit the retired CDV/decisionValue field names.

export const RANK_POWER_SCHEMA_VERSION = '1.0.0';

export const RPI_AXIS_WEIGHTS = Object.freeze({
  selectionPower: 0.20,
  victoryPower: 0.25,
  scorePower: 0.20,
  boardPower: 0.10,
  responsePower: 0.10,
  observedRankValue: 0.15
});

export const CONFIDENCE_THRESHOLDS = Object.freeze({ HIGH: 200, MEDIUM: 50, LOW: 10 });
export const BALANCE_THRESHOLDS = Object.freeze({ OVERPOWERED_RPI: 0.75, UNDERPOWERED_RPI: 0.25, DOMINANT_SELECTION: 0.80, NEGLIGIBLE_SELECTION: 0.05 });

function normalizeMinimax(valuesByRank) {
  const values = Object.values(valuesByRank);
  if (values.length === 0) return {};
  const min = Math.min(...values), max = Math.max(...values), range = max - min;
  if (range === 0) { const r = {}; for (const k of Object.keys(valuesByRank)) r[k] = 0.5; return r; }
  const r = {}; for (const [k, v] of Object.entries(valuesByRank)) r[k] = (v - min) / range; return r;
}

function normalizeMinimaxAware(valuesByRank) {
  const entries = Object.entries(valuesByRank).filter(([, value]) => value !== null && value !== undefined && Number.isFinite(value));
  const result = {};
  if (entries.length === 0) {
    for (const rank of Object.keys(valuesByRank)) result[rank] = null;
    return result;
  }
  const values = entries.map(([, value]) => value);
  const min = Math.min(...values), max = Math.max(...values), range = max - min;
  for (const [rank, value] of Object.entries(valuesByRank)) {
    if (value === null || value === undefined || !Number.isFinite(value)) result[rank] = null;
    else result[rank] = range === 0 ? 0.5 : (value - min) / range;
  }
  return result;
}

function confidenceStatus(rankMetrics, axisStatus = null) {
  const opp = rankMetrics.rankOpportunityCount;
  const base = opp >= CONFIDENCE_THRESHOLDS.HIGH ? 'HIGH'
    : opp >= CONFIDENCE_THRESHOLDS.MEDIUM ? 'MEDIUM'
      : opp >= CONFIDENCE_THRESHOLDS.LOW ? 'LOW' : 'INSUFFICIENT';
  if (base === 'HIGH' && axisStatus) {
    const scoreObserved = axisStatus.scorePower === 'observed';
    const boardObserved = axisStatus.boardPower === 'observed';
    if (!scoreObserved || !boardObserved) return 'MEDIUM';
  }
  return base;
}

export function computePowerAxes(rankMetrics, rankORV = {}) {
  const ranks = Object.keys(rankMetrics);
  if (ranks.length === 0) return {};
  const raw = { selection: {}, victory: {}, score: {}, board: {}, response: {}, observedRankValue: {} };
  const axisStatus = {};
  for (const rank of ranks) {
    const m = rankMetrics[rank];
    axisStatus[rank] = {};
    if (m.rankOpportunityCount > 0) {
      raw.selection[rank] = m.rankSelectionCount / m.rankOpportunityCount;
      axisStatus[rank].selectionPower = 'observed';
    } else {
      raw.selection[rank] = null;
      axisStatus[rank].selectionPower = 'not-observable';
    }
    const total = m.rankVictoryContributionCount + m.rankDefeatExposureCount;
    if (total > 0) {
      raw.victory[rank] = m.rankVictoryContributionCount / total;
      axisStatus[rank].victoryPower = 'observed';
    } else {
      raw.victory[rank] = null;
      axisStatus[rank].victoryPower = 'not-observable';
    }
    const causalObservations = Number(m.rankStateDeltaObservationCount ?? 0);
    const causalCoverage = m.rankSelectionCount > 0 ? causalObservations / m.rankSelectionCount : 0;
    if (m.rankSelectionCount > 0 && causalObservations > 0 && m.rankSecuredPointContribution !== undefined) {
      raw.score[rank] = m.rankSecuredPointContribution / causalObservations;
      axisStatus[rank].scorePower = causalCoverage >= 0.95 ? 'observed' : 'insufficient';
    } else {
      raw.score[rank] = null;
      axisStatus[rank].scorePower = 'not-observable';
    }
    if (m.rankSelectionCount > 0 && causalObservations > 0 && m.rankBoardPresenceContribution !== undefined) {
      raw.board[rank] = m.rankBoardPresenceContribution / causalObservations;
      axisStatus[rank].boardPower = causalCoverage >= 0.95 ? 'observed' : 'insufficient';
    } else {
      raw.board[rank] = null;
      axisStatus[rank].boardPower = 'not-observable';
    }
    if (m.rankSelectionCount > 0) {
      // responsePlayedCount already includes counters; do not double count.
      raw.response[rank] = m.rankResponsePlayedCount / m.rankSelectionCount;
      axisStatus[rank].responsePower = 'observed';
    } else {
      raw.response[rank] = null;
      axisStatus[rank].responsePower = 'not-observable';
    }
    const orv = rankORV[rank];
    const sampleSize = orv?.sampleSize ?? orv?.observationalSampleCount ?? orv?.totalRollouts ?? 0;
    if (orv && Number.isFinite(orv.averageDecisionValue) && sampleSize > 0) {
      raw.observedRankValue[rank] = orv.averageDecisionValue;
      axisStatus[rank].observedRankValue = 'observed';
    } else {
      raw.observedRankValue[rank] = null;
      axisStatus[rank].observedRankValue = 'not-observable';
    }
  }
  const rawByAxis = {
    selectionPower: raw.selection,
    victoryPower: raw.victory,
    scorePower: raw.score,
    boardPower: raw.board,
    responsePower: raw.response,
    observedRankValue: raw.observedRankValue
  };
  for (const [axis, valuesByRank] of Object.entries(rawByAxis)) {
    const observedValues = Object.entries(valuesByRank)
      .filter(([rank, value]) => axisStatus[rank]?.[axis] === 'observed' && Number.isFinite(value))
      .map(([, value]) => value);
    if (observedValues.length > 0 && Math.max(...observedValues) === Math.min(...observedValues)) {
      for (const rank of ranks) if (axisStatus[rank]?.[axis] === 'observed') axisStatus[rank][axis] = 'degenerate';
    }
  }

  const normalized = {
    selection: normalizeMinimaxAware(raw.selection),
    victory: normalizeMinimaxAware(raw.victory),
    score: normalizeMinimaxAware(raw.score),
    board: normalizeMinimaxAware(raw.board),
    response: normalizeMinimaxAware(raw.response),
    observedRankValue: normalizeMinimaxAware(raw.observedRankValue)
  };
  const profiles = {};
  for (const rank of ranks) {
    const m = rankMetrics[rank];
    profiles[rank] = {
      rank,
      axes: {
        selectionPower: normalized.selection[rank],
        victoryPower: normalized.victory[rank],
        scorePower: normalized.score[rank],
        boardPower: normalized.board[rank],
        responsePower: normalized.response[rank],
        observedRankValue: normalized.observedRankValue[rank]
      },
      axisStatus: axisStatus[rank],
      raw: {
        selectionRate: raw.selection[rank],
        victoryRate: raw.victory[rank],
        scorePerSelection: raw.score[rank],
        boardPerSelection: raw.board[rank],
        responseRate: raw.response[rank],
        observedRankValue: raw.observedRankValue[rank],
        causalCoverage: m.rankSelectionCount > 0 ? Number(m.rankStateDeltaObservationCount ?? 0) / m.rankSelectionCount : 0
      }
    };
  }
  return profiles;
}

export function computeObservedRPI(powerProfiles) {
  const rpi = {};
  for (const [rank, profile] of Object.entries(powerProfiles)) {
    let weighted = 0, totalWeight = 0, observedAxes = 0;
    for (const [axis, weight] of Object.entries(RPI_AXIS_WEIGHTS)) {
      const value = profile.axes?.[axis];
      const status = profile.axisStatus?.[axis];
      if ((status === 'observed' || status === 'degenerate') && Number.isFinite(value)) {
        weighted += value * weight;
        totalWeight += weight;
        observedAxes += 1;
      }
    }
    rpi[rank] = totalWeight > 0 && observedAxes >= 3 ? weighted / totalWeight : null;
  }
  return rpi;
}

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
    const base = rpi[rank];
    if (!Number.isFinite(base)) {
      result[rank] = null;
      continue;
    }
    const confidence = rankORV[rank]?.confidence ?? 'INSUFFICIENT';
    const weight = confidence === 'HIGH' ? 0.3 : confidence === 'MEDIUM' ? 0.2 : confidence === 'LOW' ? 0.1 : 0;
    const normalizedOrv = powerProfiles[rank]?.axes?.observedRankValue ?? fallbackNormalizedOrv[rank];
    result[rank] = weight > 0 && Number.isFinite(normalizedOrv)
      ? base * (1 - weight) + normalizedOrv * weight
      : base;
  }
  return result;
}

export function buildBalanceWatchlist(rpi, rankMetrics, powerProfiles = null) {
  const w = { overpowered: [], underpowered: [], dominant: [], negligible: [], suppressed: false, suppressionReason: null };
  const mandatory = ['selectionPower', 'victoryPower', 'scorePower', 'boardPower'];
  for (const [rank, value] of Object.entries(rpi)) {
    if (!Number.isFinite(value)) continue;
    const m = rankMetrics[rank]; if (!m) continue;
    const status = confidenceStatus(m, powerProfiles?.[rank]?.axisStatus);
    if (status !== 'HIGH') continue;
    if (powerProfiles) {
      const allObserved = mandatory.every(axis => powerProfiles?.[rank]?.axisStatus?.[axis] === 'observed');
      if (!allObserved) {
        w.suppressed = true;
        w.suppressionReason = `rank ${rank}: mandatory axes not all observed`;
        continue;
      }
    }
    if (value > BALANCE_THRESHOLDS.OVERPOWERED_RPI) w.overpowered.push({ rank, rpi: value, reason: 'RPI exceeds 0.75 with HIGH confidence and all mandatory axes observed' });
    if (value < BALANCE_THRESHOLDS.UNDERPOWERED_RPI) w.underpowered.push({ rank, rpi: value, reason: 'RPI below 0.25 with HIGH confidence and all mandatory axes observed' });
    const selRate = m.rankOpportunityCount > 0 ? m.rankSelectionCount / m.rankOpportunityCount : 0;
    if (selRate > BALANCE_THRESHOLDS.DOMINANT_SELECTION) w.dominant.push({ rank, selectionRate: selRate, reason: 'Selection rate exceeds 80% with HIGH confidence' });
    if (selRate < BALANCE_THRESHOLDS.NEGLIGIBLE_SELECTION) w.negligible.push({ rank, selectionRate: selRate, reason: 'Selection rate below 5% with HIGH confidence' });
  }
  return w;
}

export function buildRankPowerModel({ rankMetrics, rankORV = {}, rankCDV = {}, aggregateHash }) {
  const orvInput = Object.keys(rankORV).length ? rankORV : rankCDV;
  const powerProfiles = computePowerAxes(rankMetrics, orvInput);
  const rpi = computeObservedRPI(powerProfiles);
  const decisionPower = computeDecisionPower(rpi, orvInput, powerProfiles);
  const watchlist = buildBalanceWatchlist(rpi, rankMetrics, powerProfiles);
  const axisCoverage = {};
  for (const axis of Object.keys(RPI_AXIS_WEIGHTS)) {
    const observed = Object.values(powerProfiles).filter(profile => profile.axisStatus?.[axis] === 'observed').length;
    const total = Object.keys(powerProfiles).length;
    axisCoverage[axis] = { observed, total, rate: total ? observed / total : 0 };
  }
  const ranks = {};
  for (const rank of Object.keys(rankMetrics)) {
    const m = rankMetrics[rank];
    const profile = powerProfiles[rank] ?? {};
    ranks[rank] = {
      rank,
      rpi: rpi[rank],
      rpiStatus: rpi[rank] == null ? 'UNAVAILABLE' : 'OBSERVED',
      decisionPower: decisionPower[rank],
      confidence: confidenceStatus(m, profile.axisStatus),
      axes: profile.axes ?? {},
      axisStatus: profile.axisStatus ?? {},
      raw: profile.raw ?? {},
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
  const ladder = Object.values(ranks).map(({ rank, rpi: value, rpiStatus, confidence }) => ({ rank, rpi: value, rpiStatus, confidence }))
    .sort((a, b) => (b.rpi ?? -1) - (a.rpi ?? -1));
  return { schemaVersion: RANK_POWER_SCHEMA_VERSION, axisWeights: { ...RPI_AXIS_WEIGHTS }, axisCoverage, ranks, ladder, watchlist, aggregateHash };
}
