// Telemetry Schema v5 — Rank Attribution Extension
// Additive layer on top of v4.0.0 telemetry. Adds per-participant rank counters
// and rank metrics to decision facts and resolution facts.
//
// v5.0.0 is fully backward compatible: v4 consumers can ignore the new fields.
// v5 consumers MUST handle missing rankAttribution gracefully (v4 facts won't have it).
//
// This module does NOT import simulation-runtime (to avoid a dependency cycle).
// Callers pass in pre-computed attribution results.


export const TELEMETRY_SCHEMA_VERSION_V5 = '5.0.0';
export const RANK_METRIC_REGISTRY = Object.freeze([
  { metricId: 'rankSelectionCount', description: 'Number of decisions where this rank was primary or participated in a fractional multi-rank play', unit: 'count' },
  { metricId: 'rankOpportunityCount', description: 'Number of decision frames where this rank had at least one legal option', unit: 'frames' },
  { metricId: 'rankSelectionRate', description: 'Selection count divided by opportunity count', unit: 'ratio' },
  { metricId: 'rankVictoryContributionCount', description: 'Number of victorious matches where this rank participated at least once', unit: 'matches' },
  { metricId: 'rankDefeatExposureCount', description: 'Number of lost matches where this rank participated at least once', unit: 'matches' },
  { metricId: 'rankSecuredPointContribution', description: 'Sum of secured point deltas attributed to this rank', unit: 'points' },
  { metricId: 'rankBoardPresenceContribution', description: 'Sum of board presence deltas attributed to this rank', unit: 'cards' },
  { metricId: 'rankStateDeltaObservationCount', description: 'Number of attributed rank selections with an attached causal state delta (including observed zero deltas)', unit: 'count' },
  { metricId: 'rankCounterDeclarationCount', description: 'Number of counter declarations attributed to this rank', unit: 'count' },
  { metricId: 'rankScuttleCount', description: 'Number of scuttles attributed to this rank', unit: 'count' },
  { metricId: 'rankEffectPlayCount', description: 'Number of effect plays attributed to this rank', unit: 'count' },
  { metricId: 'rankGeneratedEffectCount', description: 'Number of generated effects with this rank as origin', unit: 'count' },
  { metricId: 'rankSuperPlayCount', description: 'Number of Super plays attributed to this rank', unit: 'count' },
  { metricId: 'rankUltraPlayCount', description: 'Number of Ultra plays attributed to this rank', unit: 'count' },
  { metricId: 'rankRoyalMarriageCount', description: 'Number of Royal Marriage plays involving this rank', unit: 'count' },
  { metricId: 'rankResponsePlayedCount', description: 'Number of response plays attributed to this rank', unit: 'count' },
  { metricId: 'rankResponseDeclinedCount', description: 'Number of response declines in frames where this rank had options', unit: 'count' }
]);

/**
 * Initialize empty per-participant rank counters for all 15 canonical ranks.
 * @param {Array<string>} ranks - canonical rank list
 * @returns {object} per-rank counter map
 */
export function emptyRankCounters(ranks) {
  const counters = {};
  for (const rank of ranks) {
    counters[rank] = {
      selectionCount: 0,
      opportunityCount: 0,
      victoryContributionCount: 0,
      defeatExposureCount: 0,
      securedPointContribution: 0,
      boardPresenceContribution: 0,
      stateDeltaObservationCount: 0,
      counterDeclarationCount: 0,
      scuttleCount: 0,
      effectPlayCount: 0,
      generatedEffectCount: 0,
      superPlayCount: 0,
      ultraPlayCount: 0,
      royalMarriageCount: 0,
      responsePlayedCount: 0,
      responseDeclinedCount: 0
    };
  }
  return counters;
}

/**
 * Initialize per-participant rank counters.
 * @param {Array<string>} participantIds
 * @param {Array<string>} ranks
 * @returns {object} per-participant per-rank counters
 */
export function emptyParticipantRankCounters(participantIds, ranks) {
  const byParticipant = {};
  for (const pid of participantIds) {
    byParticipant[pid] = emptyRankCounters(ranks);
  }
  return byParticipant;
}

/**
 * Apply a decision to rank counters.
 * @param {object} counters - per-participant rank counters
 * @param {string} participantId
 * @param {object} attribution - result of attributeRankAction
 * @param {object} action - the selected action
 * @param {Array} legalActions - all legal actions in the frame
 * @param {object} rankOpportunities - result of rankOpportunitiesFromFrame
 */
export function applyDecisionToRankCounters(counters, participantId, attribution, action, legalActions, rankOpportunities) {
  const participantCounters = counters[participantId];
  if (!participantCounters) return counters;

  // Update opportunity counts for all ranks that had options in this frame
  if (rankOpportunities) {
    for (const [rank, info] of Object.entries(rankOpportunities)) {
      if (participantCounters[rank]) {
        participantCounters[rank].opportunityCount += 1;
      }
    }
  }

  // If no attribution, check if it was a response decline
  if (attribution.attributionStatus === 'not-observable') {
    if (action?.family === 'response-decline' && rankOpportunities) {
      for (const rank of Object.keys(rankOpportunities)) {
        if (participantCounters[rank]) {
          participantCounters[rank].responseDeclinedCount += 1;
        }
      }
    }
    return counters;
  }

  const primaryRank = attribution.primaryRank;
  if (!primaryRank || !participantCounters[primaryRank]) return counters;

  // Selection count
  participantCounters[primaryRank].selectionCount += 1;

  // Play form specific counters
  const form = attribution.playForm;
  if (form === 'super') participantCounters[primaryRank].superPlayCount += 1;
  if (form === 'ultra') participantCounters[primaryRank].ultraPlayCount += 1;
  if (form === 'royal-marriage') {
    // Credit all involved ranks
    for (const r of attribution.sourceRanks) {
      if (participantCounters[r]) participantCounters[r].royalMarriageCount += 1;
    }
  }
  if (form === 'generated') participantCounters[primaryRank].generatedEffectCount += 1;

  // Action family specific counters
  const family = action?.family ?? '';
  if (family === 'counter') participantCounters[primaryRank].counterDeclarationCount += 1;
  if (family === 'scuttle') participantCounters[primaryRank].scuttleCount += 1;
  if (family?.startsWith('effect-')) participantCounters[primaryRank].effectPlayCount += 1;
  const isResponsePlay = attribution.semanticClass === 'free-response-play'
    || ['counter', 'disrupt', 'interrupt', 'instant', 'quick'].includes(family)
    || ['INSTANT', 'QUICK', 'INTERRUPT'].includes(action?.timingClass);
  if (isResponsePlay) participantCounters[primaryRank].responsePlayedCount += 1;

  // For fractional attribution, also credit secondary ranks with selection
  if (attribution.attributionStatus === 'fractional') {
    for (const r of attribution.sourceRanks) {
      if (r !== primaryRank && participantCounters[r]) {
        participantCounters[r].selectionCount += 1;
      }
    }
  }

  return counters;
}

/**
 * Apply a match result to rank counters (victory/defeat attribution).
 * @param {object} counters
 * @param {string} participantId
 * @param {string} outcome - 'VICTORY' | 'DEFEAT' | 'DRAW'
 * @param {Set<string>} ranksSelected - set of ranks selected by this participant
 */
export function applyMatchResultToRankCounters(counters, participantId, outcome, ranksSelected) {
  const participantCounters = counters[participantId];
  if (!participantCounters) return counters;
  for (const rank of ranksSelected) {
    if (!participantCounters[rank]) continue;
    if (outcome === 'VICTORY') participantCounters[rank].victoryContributionCount += 1;
    else if (outcome === 'DEFEAT') participantCounters[rank].defeatExposureCount += 1;
  }
  return counters;
}

/**
 * Apply a state delta to rank counters (point/board contributions).
 * @param {object} counters
 * @param {string} participantId
 * @param {object} attribution
 * @param {object} stateDelta - { securedPointDeltaByPlayer, boardPresenceDeltaByPlayer }
 */
export function applyStateDeltaToRankCounters(counters, participantId, attribution, stateDelta) {
  const participantCounters = counters[participantId];
  if (!participantCounters || attribution.attributionStatus === 'not-observable') return counters;

  const primaryRank = attribution.primaryRank;
  if (!primaryRank || !participantCounters[primaryRank]) return counters;

  const pointDelta = stateDelta?.securedPointDeltaByPlayer?.[participantId] ?? 0;
  const boardDelta = stateDelta?.boardPresenceDeltaByPlayer?.[participantId] ?? 0;

  if (attribution.attributionStatus === 'fractional') {
    // Split contribution by weight. Observation count tracks whether a causal
    // delta was attached, including legitimate zero deltas.
    for (const [rank, weight] of Object.entries(attribution.rankWeights)) {
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

/**
 * Build a rank attribution extension for a decision fact (v5).
 * @param {object} attribution - result of attributeRankAction
 * @returns {object} v5 extension fields
 */
export function rankDecisionExtension(attribution) {
  return {
    rankAttribution: {
      primaryRank: attribution.primaryRank,
      sourceRanks: attribution.sourceRanks,
      rankWeights: attribution.rankWeights,
      attributionStatus: attribution.attributionStatus,
      playForm: attribution.playForm,
      originRank: attribution.originRank,
      generatedRank: attribution.generatedRank
    }
  };
}

/**
 * Build a rank opportunities extension for a decision fact (v5).
 * @param {object} rankOpportunities - result of rankOpportunitiesFromFrame
 * @returns {object} v5 extension fields
 */
export function rankOpportunityExtension(rankOpportunities) {
  return {
    rankOpportunities: Object.entries(rankOpportunities).map(([rank, info]) => ({
      rank,
      opportunityFrames: info.opportunityFrames,
      legalOptions: info.legalOptions
    }))
  };
}

/**
 * Compute rank selection rate for a single rank's counters.
 * @param {object} rankCounters
 * @returns {number} selection rate (0-1), or 0 if no opportunities
 */
export function rankSelectionRate(rankCounters) {
  if (rankCounters.opportunityCount === 0) return 0;
  return rankCounters.selectionCount / rankCounters.opportunityCount;
}

/**
 * Compute the full rank metrics registry output for a participant.
 * @param {object} participantCounters - per-rank counters for one participant
 * @param {Array<string>} ranks - canonical rank list
 * @returns {object} per-rank metrics
 */
export function computeRankMetrics(participantCounters, ranks) {
  const metrics = {};
  for (const rank of ranks) {
    const c = participantCounters[rank];
    if (!c) continue;
    metrics[rank] = {
      rankSelectionCount: c.selectionCount,
      rankOpportunityCount: c.opportunityCount,
      rankSelectionRate: rankSelectionRate(c),
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
 * Compute aggregate rank metrics across all participants.
 * @param {object} participantRankCounters - per-participant per-rank counters
 * @param {Array<string>} ranks
 * @returns {object} aggregate per-rank metrics
 */
export function computeAggregateRankMetrics(participantRankCounters, ranks) {
  const aggregate = emptyRankCounters(ranks);
  for (const participantCounters of Object.values(participantRankCounters)) {
    for (const rank of ranks) {
      const src = participantCounters[rank];
      const dst = aggregate[rank];
      if (!src || !dst) continue;
      for (const key of Object.keys(dst)) {
        dst[key] += src[key];
      }
    }
  }
  return computeRankMetrics(aggregate, ranks);
}

/**
 * Build the complete rank analytics output for a campaign.
 * @param {object} params
 * @param {object} params.participantRankCounters
 * @param {Array<string>} params.ranks
 * @param {Array<string>} params.participantIds
 * @param {string} params.aggregateHash
 * @returns {object} rank analytics output contract
 */
export function buildRankAnalyticsOutput({ participantRankCounters, ranks, participantIds, aggregateHash }) {
  const perParticipant = {};
  for (const pid of participantIds) {
    perParticipant[pid] = computeRankMetrics(participantRankCounters[pid] ?? {}, ranks);
  }
  const aggregate = computeAggregateRankMetrics(participantRankCounters, ranks);
  return {
    schemaVersion: '5.0.0',
    metricRegistry: RANK_METRIC_REGISTRY.map(m => ({ ...m })),
    ranks: [...ranks],
    participantIds: [...participantIds],
    perParticipant,
    aggregate,
    aggregateHash,
    rankAuthorityHash: null  // Filled by caller from canonicalRankAuthority()
  };
}

// === Variant & Super-Effect Telemetry (v5.1) =================================
//
// Per-variant counters keyed by variantKey (e.g. "A:spade", "A:super:super-ace",
// "A:normal", "A:super:all"). This module does NOT import simulation-runtime
// (to avoid a dependency cycle); callers pass the canonical variant-key list
// from the variant registry.
//
// The expanded metric set tracks, for every Spades variant and Super effect:
//   - draw / appearance frequency
//   - legal opportunity frequency
//   - play / activation rate
//   - opportunity conversion rate
//   - success / failure rate
//   - immediate state impact
//   - delayed / downstream value
//   - win-rate correlation
//   - turn-efficiency / tempo impact
//   - score / goal contribution
//   - average value when activated
//   (policy / seat / first-player sensitivity, synergies, counters, replay
//   evidence, and confidence classification are derived in the integration
//   layer from per-participant and per-match data.)

export const VARIANT_TELEMETRY_SCHEMA_VERSION = '5.1.0';

export const VARIANT_METRIC_REGISTRY = Object.freeze([
  { metricId: 'variantDrawCount', unit: 'count', description: 'Number of times the variant was drawn into a player hand' },
  { metricId: 'variantAppearanceCount', unit: 'count', description: 'Number of times the variant appeared in an observable position' },
  { metricId: 'variantOpportunityCount', unit: 'frames', description: 'Decision frames where the variant had at least one legal option' },
  { metricId: 'variantSelectionCount', unit: 'count', description: 'Times the variant was selected as primary attribution in a decision' },
  { metricId: 'variantActivationCount', unit: 'count', description: 'Times a Super effect was activated (Super entities only)' },
  { metricId: 'variantPlayRate', unit: 'ratio', description: 'Selection count divided by opportunity count' },
  { metricId: 'variantConversionRate', unit: 'ratio', description: 'Activation count divided by opportunity count' },
  { metricId: 'variantSuccessCount', unit: 'count', description: 'Resolutions where the variant effect succeeded' },
  { metricId: 'variantFailureCount', unit: 'count', description: 'Resolutions where the variant effect was countered or fizzled' },
  { metricId: 'variantSuccessRate', unit: 'ratio', description: 'Success count divided by success plus failure count' },
  { metricId: 'variantVictoryContributionCount', unit: 'matches', description: 'Victorious matches where the variant was selected at least once' },
  { metricId: 'variantDefeatExposureCount', unit: 'matches', description: 'Lost matches where the variant was selected at least once' },
  { metricId: 'variantWinRate', unit: 'ratio', description: 'Victory contribution divided by victory plus defeat exposure' },
  { metricId: 'variantSecuredPointContribution', unit: 'points', description: 'Sum of secured point deltas attributed to the variant' },
  { metricId: 'variantBoardPresenceContribution', unit: 'cards', description: 'Sum of board presence deltas attributed to the variant' },
  { metricId: 'variantImmediateStateImpact', unit: 'index', description: 'Sum of immediate state-impact magnitude attributed to the variant' },
  { metricId: 'variantDelayedValue', unit: 'index', description: 'Sum of downstream / delayed value attributed to the variant' },
  { metricId: 'variantTempoImpact', unit: 'mini-turns', description: 'Sum of mini-turn / tempo deltas attributed to the variant' },
  { metricId: 'variantGoalContribution', unit: 'goal-points', description: 'Sum of goal-shift deltas caused by the variant' },
  { metricId: 'variantCounterDeclarationCount', unit: 'count', description: 'Counter declarations attributed to the variant' },
  { metricId: 'variantScuttleCount', unit: 'count', description: 'Scuttle operations attributed to the variant' },
  { metricId: 'variantResponsePlayedCount', unit: 'count', description: 'Response plays attributed to the variant' },
  { metricId: 'variantResponseDeclinedCount', unit: 'count', description: 'Response declines in frames where the variant had options' },
  { metricId: 'variantEffectPlayCount', unit: 'count', description: 'Effect plays attributed to the variant' },
  { metricId: 'variantGeneratedEffectCount', unit: 'count', description: 'Generated effects with this variant as origin' },
  { metricId: 'variantAverageValueWhenActivated', unit: 'index', description: 'Mean immediate-plus-delayed value per activation' }
]);

const VARIANT_COUNTER_FIELDS = Object.freeze([
  'drawCount', 'appearanceCount', 'opportunityCount', 'selectionCount', 'activationCount',
  'successCount', 'failureCount', 'victoryContributionCount', 'defeatExposureCount',
  'securedPointContribution', 'boardPresenceContribution', 'immediateStateImpact',
  'delayedValue', 'tempoImpact', 'goalContribution',
  'counterDeclarationCount', 'scuttleCount', 'responsePlayedCount', 'responseDeclinedCount',
  'effectPlayCount', 'generatedEffectCount'
]);

/**
 * Initialize empty per-variant counters for a list of variant keys.
 * @param {Array<string>} variantKeys
 * @returns {object} per-variantKey counter map
 */
export function emptyVariantCounters(variantKeys) {
  const counters = {};
  for (const key of variantKeys) {
    counters[key] = Object.fromEntries(VARIANT_COUNTER_FIELDS.map(f => [f, 0]));
  }
  return counters;
}

/**
 * Initialize per-participant variant counters.
 * @param {Array<string>} participantIds
 * @param {Array<string>} variantKeys
 * @returns {object}
 */
export function emptyParticipantVariantCounters(participantIds, variantKeys) {
  const byParticipant = {};
  for (const pid of participantIds) {
    byParticipant[pid] = emptyVariantCounters(variantKeys);
  }
  return byParticipant;
}

/**
 * Apply a decision to variant counters.
 *
 * Credits every variant key in `variantEntity.creditKeys` (the specific tier +
 * rank overall, and for Supers also the combined-super aggregate).
 *
 * @param {object} counters - per-participant variant counters
 * @param {string} participantId
 * @param {object} attribution - result of attributeRankAction
 * @param {object} variantEntity - result of classifyVariantEntity
 * @param {object} action - the selected action
 * @param {object} variantOpportunities - per-variantKey opportunity map
 */
export function applyDecisionToVariantCounters(counters, participantId, attribution, variantEntity, action, variantOpportunities) {
  const pc = counters[participantId];
  if (!pc) return counters;

  // Opportunity counting for all variant keys that had options this frame
  if (variantOpportunities) {
    for (const [key, info] of Object.entries(variantOpportunities)) {
      if (pc[key]) pc[key].opportunityCount += info.opportunityFrames ?? 1;
    }
  }

  if (!variantEntity || !variantEntity.variantKey || attribution.attributionStatus === 'not-observable') {
    // Response decline: credit decline to all variant keys that had options
    if (action?.family === 'response-decline' && variantOpportunities) {
      for (const key of Object.keys(variantOpportunities)) {
        if (pc[key]) pc[key].responseDeclinedCount += 1;
      }
    }
    return counters;
  }

  const specificKey = variantEntity.variantKey;
  const family = action?.family ?? '';
  const form = attribution.playForm ?? 'other';
  const isSuper = variantEntity.tier === 'super' || variantEntity.tier === 'super-aggregate';

  // Credit the specific variant key
  const sc = pc[specificKey];
  if (sc) {
    sc.selectionCount += 1;
    if (isSuper) sc.activationCount += 1;
    if (family === 'counter') sc.counterDeclarationCount += 1;
    if (family === 'scuttle') sc.scuttleCount += 1;
    if (family?.startsWith('effect-') || form === 'super' || form === 'ultra' || form === 'generated') sc.effectPlayCount += 1;
    if (form === 'generated') sc.generatedEffectCount += 1;
    if (attribution.semanticClass === 'free-response-play' || family === 'counter' || family === 'disrupt' || family === 'interrupt') {
      sc.responsePlayedCount += 1;
    }
  }

  // Credit the rank-overall aggregate and (for supers) the combined-super aggregate
  for (const key of variantEntity.creditKeys) {
    if (key === specificKey) continue;
    const c = pc[key];
    if (!c) continue;
    c.selectionCount += 1;
    if (isSuper) c.activationCount += 1;
    if (family === 'counter') c.counterDeclarationCount += 1;
    if (family === 'scuttle') c.scuttleCount += 1;
    if (family?.startsWith('effect-') || form === 'super' || form === 'ultra' || form === 'generated') c.effectPlayCount += 1;
    if (form === 'generated') c.generatedEffectCount += 1;
    if (attribution.semanticClass === 'free-response-play' || family === 'counter' || family === 'disrupt' || family === 'interrupt') {
      c.responsePlayedCount += 1;
    }
  }

  return counters;
}

/**
 * Apply a resolution outcome (success/failure) to a variant counter.
 * @param {object} counters - per-participant variant counters
 * @param {string} participantId
 * @param {string} variantKey
 * @param {boolean} succeeded
 */
export function applyVariantResolution(counters, participantId, variantKey, succeeded) {
  const c = counters[participantId]?.[variantKey];
  if (!c) return counters;
  if (succeeded) c.successCount += 1;
  else c.failureCount += 1;
  return counters;
}

/**
 * Apply a match result to variant counters (victory/defeat attribution).
 * @param {object} counters
 * @param {string} participantId
 * @param {string} outcome - 'VICTORY' | 'DEFEAT' | 'DRAW'
 * @param {Set<string>} selectedVariantKeys - variant keys selected by this participant
 */
export function applyMatchResultToVariantCounters(counters, participantId, outcome, selectedVariantKeys) {
  const pc = counters[participantId];
  if (!pc) return counters;
  for (const key of selectedVariantKeys) {
    if (!pc[key]) continue;
    if (outcome === 'VICTORY') pc[key].victoryContributionCount += 1;
    else if (outcome === 'DEFEAT') pc[key].defeatExposureCount += 1;
  }
  return counters;
}

/**
 * Apply a state delta to variant counters.
 * Credits point, board, tempo, goal, and immediate/delayed impact to all
 * credit keys of the variant entity.
 *
 * @param {object} counters
 * @param {string} participantId
 * @param {object} variantEntity
 * @param {object} stateDelta - { securedPointDeltaByPlayer, boardPresenceDeltaByPlayer,
 *   tempoDeltaByPlayer, goalDeltaByPlayer, immediateImpactByPlayer, delayedValueByPlayer }
 */
export function applyStateDeltaToVariantCounters(counters, participantId, variantEntity, stateDelta) {
  const pc = counters[participantId];
  if (!pc || !variantEntity || !variantEntity.variantKey) return counters;

  const pointDelta = stateDelta?.securedPointDeltaByPlayer?.[participantId] ?? 0;
  const boardDelta = stateDelta?.boardPresenceDeltaByPlayer?.[participantId] ?? 0;
  const tempoDelta = stateDelta?.tempoDeltaByPlayer?.[participantId] ?? 0;
  const goalDelta = stateDelta?.goalDeltaByPlayer?.[participantId] ?? 0;
  const immediate = stateDelta?.immediateImpactByPlayer?.[participantId] ?? 0;
  const delayed = stateDelta?.delayedValueByPlayer?.[participantId] ?? 0;

  const weight = 1; // variant entity attribution is already specific
  for (const key of variantEntity.creditKeys) {
    const c = pc[key];
    if (!c) continue;
    c.securedPointContribution += pointDelta * weight;
    c.boardPresenceContribution += boardDelta * weight;
    c.tempoImpact += tempoDelta * weight;
    c.goalContribution += goalDelta * weight;
    c.immediateStateImpact += Math.abs(immediate) * weight;
    c.delayedValue += delayed * weight;
  }
  return counters;
}

/**
 * Record a draw event for a variant (draw/appearance frequency).
 * @param {object} counters
 * @param {string} participantId
 * @param {string} variantKey
 * @param {boolean} appeared - whether the card appeared in an observable position
 */
export function applyVariantDraw(counters, participantId, variantKey, appeared = false) {
  const c = counters[participantId]?.[variantKey];
  if (!c) return counters;
  c.drawCount += 1;
  if (appeared) c.appearanceCount += 1;
  return counters;
}

/**
 * Compute derived variant metrics from raw counters for one participant.
 * @param {object} counters - per-variantKey counters
 * @param {Array<string>} variantKeys
 * @returns {object} per-variantKey metrics
 */
export function computeVariantMetrics(counters, variantKeys) {
  const metrics = {};
  for (const key of variantKeys) {
    const c = counters[key];
    if (!c) continue;
    const playRate = c.opportunityCount > 0 ? c.selectionCount / c.opportunityCount : 0;
    const conversionRate = c.opportunityCount > 0 ? c.activationCount / c.opportunityCount : 0;
    const totalOutcomes = c.successCount + c.failureCount;
    const successRate = totalOutcomes > 0 ? c.successCount / totalOutcomes : 0;
    const totalMatchOutcomes = c.victoryContributionCount + c.defeatExposureCount;
    const winRate = totalMatchOutcomes > 0 ? c.victoryContributionCount / totalMatchOutcomes : 0;
    const activations = c.activationCount > 0 ? c.activationCount : c.selectionCount;
    const avgValue = activations > 0 ? (c.immediateStateImpact + c.delayedValue) / activations : 0;
    metrics[key] = {
      variantDrawCount: c.drawCount,
      variantAppearanceCount: c.appearanceCount,
      variantOpportunityCount: c.opportunityCount,
      variantSelectionCount: c.selectionCount,
      variantActivationCount: c.activationCount,
      variantPlayRate: playRate,
      variantConversionRate: conversionRate,
      variantSuccessCount: c.successCount,
      variantFailureCount: c.failureCount,
      variantSuccessRate: successRate,
      variantVictoryContributionCount: c.victoryContributionCount,
      variantDefeatExposureCount: c.defeatExposureCount,
      variantWinRate: winRate,
      variantSecuredPointContribution: c.securedPointContribution,
      variantBoardPresenceContribution: c.boardPresenceContribution,
      variantImmediateStateImpact: c.immediateStateImpact,
      variantDelayedValue: c.delayedValue,
      variantTempoImpact: c.tempoImpact,
      variantGoalContribution: c.goalContribution,
      variantCounterDeclarationCount: c.counterDeclarationCount,
      variantScuttleCount: c.scuttleCount,
      variantResponsePlayedCount: c.responsePlayedCount,
      variantResponseDeclinedCount: c.responseDeclinedCount,
      variantEffectPlayCount: c.effectPlayCount,
      variantGeneratedEffectCount: c.generatedEffectCount,
      variantAverageValueWhenActivated: avgValue
    };
  }
  return metrics;
}

/**
 * Compute aggregate variant metrics across all participants.
 * @param {object} participantVariantCounters
 * @param {Array<string>} variantKeys
 * @returns {object}
 */
export function computeAggregateVariantMetrics(participantVariantCounters, variantKeys) {
  const aggregate = emptyVariantCounters(variantKeys);
  for (const pc of Object.values(participantVariantCounters)) {
    for (const key of variantKeys) {
      const src = pc[key];
      const dst = aggregate[key];
      if (!src || !dst) continue;
      for (const field of VARIANT_COUNTER_FIELDS) dst[field] += src[field];
    }
  }
  return computeVariantMetrics(aggregate, variantKeys);
}
