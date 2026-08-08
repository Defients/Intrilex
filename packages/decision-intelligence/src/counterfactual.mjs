import { hashCanonical } from '@intrilex/shared';

export const COUNTERFACTUAL_SCHEMA_VERSION = '2.0.0';
export const ANALYSIS_VERSION = '2.0.0';

/**
 * Derive a paired continuation seed.
 * Includes verifiedDecisionId and orderedContinuationPolicyIds so that
 * changes to the decision anchor or continuation policies produce different seeds.
 * Does NOT include alternativeActionId or branch execution order —
 * both selected and alternative branches must receive identical continuation
 * seeds for fair comparison.
 */
export function deriveContinuationSeed({ matchId, checkpointHash, replayContentHash, rolloutIndex, analysisVersion = ANALYSIS_VERSION, verifiedDecisionId = null, orderedContinuationPolicyIds = null }) {
  return Number.parseInt(hashCanonical({ matchId, checkpointHash, replayContentHash, rolloutIndex, analysisVersion, verifiedDecisionId, orderedContinuationPolicyIds }).slice(0, 8), 16) >>> 0 || 1;
}

export function isCounterfactualSupported(replay, checkpointIndex) {
  if (!replay || !replay.commands || !Array.isArray(replay.commands)) {
    return { supported: false, reason: 'NO_REPLAY', missingAuthority: 'authority-certified-replay' };
  }
  if (replay.commands.length === 0) {
    return { supported: false, reason: 'EMPTY_REPLAY', missingAuthority: 'authority-certified-replay' };
  }
  if (!replay.contentHash || typeof replay.contentHash !== 'string') {
    return { supported: false, reason: 'NO_CONTENT_HASH', missingAuthority: 'authority-certified-replay' };
  }
  if (checkpointIndex < 0 || checkpointIndex >= replay.commands.length) {
    return { supported: false, reason: 'CHECKPOINT_OUT_OF_RANGE', missingAuthority: 'checkpoint-bounds' };
  }
  return { supported: true };
}

export function notSupportedResult(reason, missingAuthority, config, extra = {}) {
  const { matchId, checkpointHash, alternativeActionId } = config;
  const core = {
    schemaVersion: COUNTERFACTUAL_SCHEMA_VERSION,
    analysisOnly: true,
    status: 'NOT_SUPPORTED',
    reason,
    missingAuthority,
    matchId,
    checkpointHash,
    alternativeActionId,
    ...extra
  };
  return { ...core, resultHash: hashCanonical(core) };
}

export function buildCounterfactualResult(config, results, anchorVerification) {
  const {
    matchId, checkpointHash, alternativeActionId, continuationPolicyIds, policyIds,
    rolloutCount, analysisVersion = ANALYSIS_VERSION, baseSeed, profileId, seatOrder,
    replayContentHash, focalSeat
  } = config;

  const completed = results.filter((r) => r.winner !== undefined && r.winner !== 'ABORTED');
  const aborted = results.length - completed.length;
  const draws = completed.filter((r) => r.winner === 'DRAW').length;
  const focal = focalSeat ?? 1;
  const focalWins = completed.filter((r) => r.winningSeat === focal).length;
  const focalLosses = completed.filter((r) => r.winner !== 'DRAW' && r.winningSeat !== focal).length;
  const focalMargins = completed.map((r) => {
    if (r.winningSeat === focal) return Math.abs(r.scoreMargin ?? 0);
    if (r.winner === 'DRAW') return 0;
    return -(Math.abs(r.scoreMargin ?? 0));
  });
  const meanFocalUtility = focalMargins.length ? focalMargins.reduce((a, b) => a + b, 0) / focalMargins.length : null;

  const configHash = hashCanonical({
    matchId, checkpointHash, alternativeActionId, continuationPolicyIds: continuationPolicyIds ?? policyIds,
    rolloutCount, analysisVersion, baseSeed, profileId, seatOrder, replayContentHash, focalSeat: focal
  });

  const failedCount = results.filter((r) => r.error !== undefined).length;
  const unsupportedCount = results.filter((r) => r.winner === undefined && r.error === undefined && r.winner !== 'ABORTED').length;
  const missingCount = results.filter((r) => r.winner === undefined && r.error === undefined && r.winner === undefined).length;
  const hasFailures = failedCount > 0 || aborted > 0 || completed.length === 0;
  const status = hasFailures ? 'FAILED' : 'COMPLETED';

  const core = {
    schemaVersion: COUNTERFACTUAL_SCHEMA_VERSION,
    analysisOnly: true,
    status,
    matchId,
    checkpointHash,
    alternativeActionId,
    continuationPolicyIds: continuationPolicyIds ?? policyIds,
    rolloutCount,
    analysisVersion,
    focalSeat: focal,
    configHash,
    anchorVerification,
    results,
    summary: {
      totalRollouts: results.length,
      completedCount: completed.length,
      abortedCount: aborted,
      failedCount,
      draws,
      focalWins,
      focalLosses,
      focalWinRate: completed.length ? focalWins / completed.length : null,
      meanFocalUtility,
      focalUtilityDistribution: focalMargins.length ? focalMargins.sort((a, b) => a - b) : []
    },
    interpretation: status === 'COMPLETED'
      ? 'Under these paired deterministic, policy-conditioned continuations, the alternative produced a different estimated focal-seat utility. This estimate depends on the continuation policies and sampled streams.'
      : 'Experiment failed: one or more required rollouts did not complete. No causal interpretation is available.',
    limitations: [
      'This is a policy-conditioned estimate, not proof of optimal play.',
      'Continuation policies are deterministic heuristics, not optimal opponents.',
      'Results are excluded from canonical replay, win-rate, and rules-compliance cohorts.',
      'Failed rollouts are preserved in the results array and counted as aborts, not draws.',
      status === 'FAILED' ? 'Experiment status derives from rollout records. Failed or aborted rollouts prevent COMPLETED status.' : null
    ].filter(Boolean)
  };

  return { ...core, resultHash: hashCanonical(core) };
}

export function compareCounterfactual(selectedBranch, alternativeBranch) {
  if (!selectedBranch || !alternativeBranch) return null;
  if (selectedBranch.status !== 'COMPLETED' || alternativeBranch.status !== 'COMPLETED') return null;
  const s = selectedBranch.summary;
  const a = alternativeBranch.summary;
  if (s.meanFocalUtility === null || a.meanFocalUtility === null) return null;
  const sUtil = s.meanFocalUtility;
  const aUtil = a.meanFocalUtility;
  const diff = aUtil - sUtil;
  return {
    selectedFocalUtility: sUtil,
    alternativeFocalUtility: aUtil,
    estimatedDifference: Number(diff.toFixed(4)),
    selectedRolloutCount: s.totalRollouts,
    alternativeRolloutCount: a.totalRollouts,
    selectedAbortedCount: s.abortedCount,
    alternativeAbortedCount: a.abortedCount,
    interpretation: 'Under these paired deterministic, policy-conditioned continuations, the alternative produced a different mean focal-seat utility. This estimate depends on the continuation policies and sampled streams.',
    limitations: [
      'Sample size may be insufficient for narrow claims.',
      'Continuation policies are heuristics, not optimal play.',
      'This is an estimate, not proof of what should have happened.',
      'Aborted rollouts are preserved and counted as failures, not draws.'
    ]
  };
}
