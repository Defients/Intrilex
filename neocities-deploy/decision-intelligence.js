import { runBrowserPolicyMatch } from './autonomy-runtime.js?v=73b458295383';
import { IntrilexEngine, verifyCertifiedReplay, hashCanonical, advanceToDecision, advanceCoreToDecision } from './engine/browser-entry.js?v=73b458295383';
import {
  ANCHOR_SCHEMA_VERSION,
  REQUIRED_ANCHOR_FIELDS,
  isFullHash,
  reconcileLegacyCheckpointHash,
  verifyAnchorAuthority,
  installAnchorHash,
  verifiedAnchorHash
} from './anchor.js?v=73b458295383';

// Install the browser hash function into the anchor resolver for parity.
installAnchorHash(hashCanonical);

// Re-export anchor authority functions for browser consumers (parity with Node).
export {
  ANCHOR_SCHEMA_VERSION,
  REQUIRED_ANCHOR_FIELDS,
  isFullHash,
  reconcileLegacyCheckpointHash,
  verifyAnchorAuthority,
  verifiedAnchorHash
} from './anchor.js?v=73b458295383';

export const COUNTERFACTUAL_SCHEMA_VERSION = '2.0.0';
export const ANALYSIS_VERSION = '2.0.0';
export const POLICY_DIAGNOSTICS_VERSION = '2.0.0';

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

function notSupportedResult(reason, missingAuthority, config, extra = {}) {
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

function reconstructCheckpoints(replay) {
  verifyCertifiedReplay(replay);
  const engine = new IntrilexEngine();
  let state = structuredClone(replay.initialState);
  const frames = [{ commandIndex: -1, state, events: [], accepted: null, error: null }];
  for (const [index, command] of replay.commands.entries()) {
    const result = engine.execute(state, command);
    state = result.state;
    frames.push({ commandIndex: index, accepted: result.accepted, state, events: result.events, error: result.error ?? null });
  }
  return frames;
}

// ── Anchor authority helpers (browser parity with Node) ──
// The browser mirrors the Node runtime's anchor verification using the SAME
// pure resolver (anchor.js, copied verbatim from packages/decision-intelligence/
// src/anchor.mjs). The browser resolves authority from a real certified replay
// and a real retained Decision Evidence record (config.retainedDecisionEvidence),
// then hands it to the resolver. The browser never re-derives decisionId from a
// self-invented formula and never presence-checks actor/seat.

function deriveDecisionCommandMapping(replay, selectedCommandHash) {
  const matches = [];
  for (let i = 0; i < replay.commands.length; i += 1) {
    if (hashCanonical(replay.commands[i]) === selectedCommandHash) matches.push(i);
  }
  if (matches.length === 0) return { none: true };
  if (matches.length > 1) return { ambiguous: true };
  return { index: matches[0] };
}

function buildRestoredAuthority(config, replay, checkpointIndex, advanced, selectedActionId, seatOrder) {
  const engineActions = advanced.legalActionFrame.actions;
  const vault = new Map(engineActions.map((action) => [action.actionId, action.command]));
  const legalActionIds = engineActions.map((a) => a.actionId).sort();
  const legalActionSetHash = hashCanonical(legalActionIds);
  const beforeStateHash = hashCanonical(advanced.state);
  const selectedCommand = vault.get(selectedActionId);
  const selectedCommandHash = hashCanonical(selectedCommand);
  const engine = new IntrilexEngine();
  const selectedActionResult = engine.execute(advanced.state, selectedCommand);
  const postSelectedActionStateHash = hashCanonical(selectedActionResult.state);
  const frameActorId = selectedCommand.actorId ?? null;
  const frameSeat = Array.isArray(seatOrder) ? (seatOrder.indexOf(frameActorId) + 1) : null;

  const mapping = deriveDecisionCommandMapping(replay, selectedCommandHash);
  const derivedReplayCommandIndex = mapping.index ?? null;

  const replayCommandIndex = config.replayCommandIndex;
  const commandHashAtReplayCommandIndex = (typeof replayCommandIndex === 'number' && replayCommandIndex >= 0 && replayCommandIndex < replay.commands.length)
    ? hashCanonical(replay.commands[replayCommandIndex])
    : null;

  return {
    matchId: replay.fixtureId ?? replay.matchId ?? null,
    replayContentHash: replay.contentHash ?? null,
    replayIntegrityHash: replay.integrityHash ?? null,
    replayEngineVersion: replay.engineVersion ?? null,
    replayRulesVersion: replay.rulesVersion ?? null,
    replayCommandCount: replay.commands.length,
    checkpointIndex,
    beforeStateHash,
    legalActionSetHash,
    legalActionIds,
    frameActorId,
    frameSeat,
    selectedCommandHash,
    postSelectedActionStateHash,
    commandHashAtReplayCommandIndex,
    derivedReplayCommandIndex
  };
}

function buildAnchorFromConfig(config, replay) {
  return {
    matchId: config.matchId,
    replayContentHash: config.replayContentHash ?? replay.contentHash ?? null,
    replayIntegrityHash: config.replayIntegrityHash ?? replay.integrityHash ?? null,
    decisionId: config.decisionId,
    decisionIndex: config.decisionIndex,
    replayCommandIndex: config.replayCommandIndex,
    beforeStateHash: config.checkpointHash,
    actorId: config.actorId,
    seat: config.seat,
    legalActionSetHash: config.legalActionSetHash,
    selectedActionId: config.selectedActionId,
    selectedCommandHash: config.selectedCommandHash,
    postSelectedActionStateHash: config.postSelectedActionStateHash,
    engineVersion: config.engineVersion,
    rulesVersion: config.rulesVersion
  };
}

function verifyAnchor(config, replay, checkpointIndex, advanced, selectedActionId, seatOrder) {
  const retainedRecord = config.retainedDecisionEvidence;
  if (!retainedRecord || typeof retainedRecord !== 'object') {
    return { valid: false, reason: 'MISSING_RETAINED_DECISION_EVIDENCE', missingAuthority: 'retained-decision-evidence' };
  }
  const restoredAuthority = buildRestoredAuthority(config, replay, checkpointIndex, advanced, selectedActionId, seatOrder);
  const mapping = deriveDecisionCommandMapping(replay, restoredAuthority.selectedCommandHash);
  if (mapping.none) return { valid: false, reason: 'NO_DECISION_COMMAND_MAPPING', missingAuthority: 'replay-command-index' };
  if (mapping.ambiguous) return { valid: false, reason: 'AMBIGUOUS_DECISION_COMMAND_MAPPING', missingAuthority: 'replay-command-index' };

  // Build the anchor, filling in derived fields from restored authority when
  // the config doesn't provide them (undefined/null). Explicitly provided
  // values (including truncated hashes) are NOT overridden — truncated hashes
  // still fail the isFullHash check in the resolver.
  const anchor = buildAnchorFromConfig(config, replay);
  if (anchor.beforeStateHash === undefined || anchor.beforeStateHash === null) {
    anchor.beforeStateHash = restoredAuthority.beforeStateHash;
  }
  if (anchor.replayCommandIndex === undefined || anchor.replayCommandIndex === null) {
    anchor.replayCommandIndex = restoredAuthority.derivedReplayCommandIndex;
  }
  if (anchor.actorId === undefined || anchor.actorId === null) {
    anchor.actorId = restoredAuthority.frameActorId;
  }
  if (anchor.legalActionSetHash === undefined || anchor.legalActionSetHash === null) {
    anchor.legalActionSetHash = restoredAuthority.legalActionSetHash;
  }
  if (anchor.selectedCommandHash === undefined || anchor.selectedCommandHash === null) {
    anchor.selectedCommandHash = restoredAuthority.selectedCommandHash;
  }
  if (anchor.postSelectedActionStateHash === undefined || anchor.postSelectedActionStateHash === null) {
    anchor.postSelectedActionStateHash = restoredAuthority.postSelectedActionStateHash;
  }

  return verifyAnchorAuthority({ anchor, retainedRecord, restoredAuthority });
}

/**
 * Extract legal actions at a specific checkpoint in a certified replay.
 *
 * Reconstructs the engine state up to the checkpoint, advances to the next
 * decision, and returns the legal actions with the historically-taken action
 * flagged. This enables the Branch Lab UI to show a dropdown of legal actions
 * instead of requiring the user to type an action ID.
 *
 * @param {object} replay - Certified replay object
 * @param {number} checkpointIndex - Checkpoint index (0-based, into replay.commands)
 * @param {string} profileId - Simulation profile ID (e.g. 'core-advanced-authority')
 * @returns {{status: string, legalActions: Array<{actionId: string, label: string, isHistorical: boolean}>, selectedActionId: string|null, matchId: string, profileId: string, baseSeed: number, seatOrder: string[]}|{status: string, reason: string, missingAuthority: string}}
 */
export function getCheckpointLegalActions(replay, checkpointIndex, profileId) {
  if (!replay) {
    return { status: 'NOT_SUPPORTED', reason: 'NO_REPLAY', missingAuthority: 'authority-certified-replay' };
  }

  const supportCheck = isCounterfactualSupported(replay, checkpointIndex);
  if (!supportCheck.supported) {
    return { status: 'NOT_SUPPORTED', reason: supportCheck.reason, missingAuthority: supportCheck.missingAuthority };
  }

  try { verifyCertifiedReplay(replay); } catch (error) {
    return { status: 'NOT_SUPPORTED', reason: 'REPLAY_VERIFICATION_FAILED', missingAuthority: 'authority-certified-replay' };
  }

  let frames;
  try {
    frames = reconstructCheckpoints(replay);
  } catch (error) {
    return { status: 'NOT_SUPPORTED', reason: 'CHECKPOINT_RECONSTRUCTION_FAILED', missingAuthority: 'checkpoint-reconstruction' };
  }

  const checkpointState = frames[checkpointIndex].state;
  let advanced;
  try {
    advanced = isCore(profileId) ? advanceCoreToDecision(checkpointState) : advanceToDecision(checkpointState);
  } catch (error) {
    return { status: 'NOT_SUPPORTED', reason: 'NO_DECISION_AT_CHECKPOINT', missingAuthority: 'decision-frame' };
  }

  if (advanced.status !== 'PLAYER_DECISION_REQUIRED' || !advanced.legalActionFrame) {
    return { status: 'NOT_SUPPORTED', reason: 'NO_DECISION_AT_CHECKPOINT', missingAuthority: 'decision-frame' };
  }

  const engineActions = advanced.legalActionFrame.actions;
  const historicalCommand = replay.commands[checkpointIndex];
  const historicalCommandHash = hashCanonical(historicalCommand);

  // Find which legal action corresponds to the historically-taken command
  let selectedActionId = null;
  const legalActions = engineActions.map((action) => {
    const isHistorical = hashCanonical(action.command) === historicalCommandHash;
    if (isHistorical) selectedActionId = action.actionId;
    return {
      actionId: action.actionId,
      label: action.actionId,
      isHistorical,
    };
  });

  const matchId = replay.fixtureId ?? replay.matchId ?? 'unknown';
  const baseSeed = replay.initialState?.rng?.seed ?? 0;
  const seatOrder = replay.initialState?.turnOrder ?? ['P1', 'P2'];

  return {
    status: 'OK',
    legalActions,
    selectedActionId,
    matchId,
    profileId,
    baseSeed,
    seatOrder,
  };
}

export function runCounterfactualBranch(config) {
  const { matchId,  baseSeed,  seatOrder,  policyIds,  profileId,  alternativeActionId,  continuationPolicyIds,  replay,  checkpointIndex = 0,  rolloutCount = 32,  focalSeat,  analysisVersion = ANALYSIS_VERSION,  selectedActionId } = config;

  if (!replay) {
    return notSupportedResult('NO_REPLAY', 'authority-certified-replay', config);
  }

  const supportCheck = isCounterfactualSupported(replay, checkpointIndex);
  if (!supportCheck.supported) {
    return notSupportedResult(supportCheck.reason, supportCheck.missingAuthority, config);
  }

  try { verifyCertifiedReplay(replay); } catch (error) {
    console.warn('runCounterfactualBranch: replay verification failed:', error?.message ?? error);
    return notSupportedResult('REPLAY_VERIFICATION_FAILED', 'authority-certified-replay', config);
  }

  let frames;
  try {
    frames = reconstructCheckpoints(replay);
  } catch (error) {
    console.warn('runCounterfactualBranch: checkpoint reconstruction failed:', error?.message ?? error);
    return notSupportedResult('CHECKPOINT_RECONSTRUCTION_FAILED', 'checkpoint-reconstruction', config);
  }

  const checkpointState = frames[checkpointIndex].state;
  const engine = new IntrilexEngine();

  let advanced;
  try {
    advanced = isCore(profileId) ? advanceCoreToDecision(checkpointState) : advanceToDecision(checkpointState);
  } catch (error) {
    console.warn('runCounterfactualBranch: advance to decision failed:', error?.message ?? error);
    return notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
  }

  if (advanced.status !== 'PLAYER_DECISION_REQUIRED' || !advanced.legalActionFrame) {
    return notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
  }

  // The historical selected action must be present before anchor verification.
  if (selectedActionId === undefined || selectedActionId === null || selectedActionId === '') {
    return notSupportedResult('MISSING_SELECTEDACTIONID', 'selectedActionId', config);
  }

  // Verify the anchor against resolved retained authority (shared pure resolver).
  const anchorCheck = verifyAnchor(config, replay, checkpointIndex, advanced, selectedActionId, seatOrder);
  if (!anchorCheck.valid) {
    return notSupportedResult(anchorCheck.reason, anchorCheck.missingAuthority, config);
  }

  const engineActions = advanced.legalActionFrame.actions;
  const vault = new Map(engineActions.map(action => [action.actionId, action.command]));
  const legalActionIds = engineActions.map(a => a.actionId).sort();
  const legalActionSetHash = hashCanonical(legalActionIds);
  const beforeStateHash = hashCanonical(advanced.state);

  const isAlternativeBranch = alternativeActionId !== undefined && alternativeActionId !== null;
  const actionToExecuteId = isAlternativeBranch ? alternativeActionId : selectedActionId;
  const actionToExecuteCommand = vault.get(actionToExecuteId);
  if (!actionToExecuteCommand) {
    return notSupportedResult(isAlternativeBranch ? 'ALTERNATIVE_ACTION_NOT_LEGAL' : 'SELECTED_ACTION_NOT_LEGAL', 'legal-action-set', config,
      { legalActionIds });
  }

  const actionResult = engine.execute(advanced.state, actionToExecuteCommand);
  if (!actionResult.accepted) {
    return notSupportedResult(isAlternativeBranch ? 'ALTERNATIVE_ACTION_REJECTED' : 'SELECTED_ACTION_REJECTED', 'engine-acceptance', config,
      { engineError: actionResult.error?.code ?? null });
  }

  const postActionState = actionResult.state;
  const postActionStateHash = hashCanonical(postActionState);
  const replayContentHash = replay.contentHash;

  const results = [];
  for (let rolloutIndex = 0; rolloutIndex < rolloutCount; rolloutIndex += 1) {
    const continuationSeed = deriveContinuationSeed({ matchId, checkpointHash: replayContentHash, replayContentHash, rolloutIndex, analysisVersion, verifiedDecisionId: config.decisionId, orderedContinuationPolicyIds: continuationPolicyIds ?? policyIds });
    const branchSeed = (baseSeed ^ continuationSeed) >>> 0 || 1;
    try {
      const match = runBrowserPolicyMatch({
        profileId,
        seed: branchSeed,
        policyIds: continuationPolicyIds ?? policyIds,
        decisionLimit: 1800,
        initialState: postActionState
      });
      results.push({
        rolloutIndex,
        seed: branchSeed,
        winner: match.summary.winner,
        winningSeat: match.summary.winningSeat,
        terminationReason: match.summary.terminationReason,
        finalScores: match.summary.finalScores,
        scoreMargin: match.summary.scoreMargin,
        completedFullTurns: match.summary.completedFullTurns,
        postActionStateHash
      });
    } catch (error) {
      results.push({ rolloutIndex, seed: branchSeed, error: error.code ?? error.message });
    }
  }

  const anchorVerification = {
    matchId: replay.fixtureId ?? replay.matchId ?? matchId,
    beforeStateHash,
    postActionStateHash,
    replayContentHash,
    checkpointIndex,
    legalActionSetHash,
    actionAccepted: true,
    executedActionId: actionToExecuteId,
    isReplaySelected: !isAlternativeBranch
  };

  return buildCounterfactualResult(
    { ...config, replayContentHash, focalSeat, alternativeActionId: actionToExecuteId },
    results,
    anchorVerification
  );
}

export function runPairedCounterfactual(config) {
  const { replay, checkpointIndex = 0, rolloutCount = 32, analysisVersion = ANALYSIS_VERSION, continuationPolicyIds, policyIds } = config;

  const supportCheck = isCounterfactualSupported(replay, checkpointIndex);
  if (!supportCheck.supported) {
    const ns = notSupportedResult(supportCheck.reason, supportCheck.missingAuthority, config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  try { verifyCertifiedReplay(replay); } catch (error) {
    console.warn('runPairedCounterfactual: replay verification failed:', error?.message ?? error);
    const ns = notSupportedResult('REPLAY_VERIFICATION_FAILED', 'authority-certified-replay', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  let frames;
  try {
    frames = reconstructCheckpoints(replay);
  } catch (error) {
    console.warn('runPairedCounterfactual: checkpoint reconstruction failed:', error?.message ?? error);
    const ns = notSupportedResult('CHECKPOINT_RECONSTRUCTION_FAILED', 'checkpoint-reconstruction', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const checkpointState = frames[checkpointIndex].state;
  let advanced;
  try {
    advanced = isCore(config.profileId) ? advanceCoreToDecision(checkpointState) : advanceToDecision(checkpointState);
  } catch (error) {
    console.warn('runPairedCounterfactual: advance to decision failed:', error?.message ?? error);
    const ns = notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  if (advanced.status !== 'PLAYER_DECISION_REQUIRED' || !advanced.legalActionFrame) {
    const ns = notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const selectedActionId = config.selectedActionId;
  if (!selectedActionId) {
    const ns = notSupportedResult('MISSING_SELECTED_ACTION_ID', 'selected-action-id', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  // Verify the anchor against resolved retained authority (shared pure resolver).
  const anchorCheck = verifyAnchor(config, replay, checkpointIndex, advanced, selectedActionId, config.seatOrder);
  if (!anchorCheck.valid) {
    const ns = notSupportedResult(anchorCheck.reason, anchorCheck.missingAuthority, config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const engineActions = advanced.legalActionFrame.actions;
  const selectedAction = engineActions.find((a) => a.actionId === selectedActionId);
  if (!selectedAction) {
    const ns = notSupportedResult('SELECTED_ACTION_NOT_LEGAL', 'legal-action-set', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const alternativeActionId = config.alternativeActionId
    ?? engineActions.find((a) => a.actionId !== selectedActionId)?.actionId
    ?? engineActions[1]?.actionId;

  if (!alternativeActionId || alternativeActionId === selectedActionId) {
    const ns = notSupportedResult('NO_ALTERNATIVE_ACTION', 'legal-action-set', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const replayContentHash = replay.contentHash;
  const contPolicyIds = continuationPolicyIds ?? policyIds;
  const sharedSeeds = [];
  for (let i = 0; i < rolloutCount; i += 1) {
    sharedSeeds.push(deriveContinuationSeed({
      matchId: config.matchId,
      checkpointHash: replayContentHash,
      replayContentHash,
      rolloutIndex: i,
      analysisVersion,
      verifiedDecisionId: config.decisionId,
      orderedContinuationPolicyIds: contPolicyIds
    }));
  }

  const selected = runCounterfactualBranch({ ...config, selectedActionId, alternativeActionId: null });
  const alternative = runCounterfactualBranch({ ...config, selectedActionId, alternativeActionId });
  const comparison = compareCounterfactual(selected, alternative);

  return { selected, alternative, comparison };
}

function isCore(profileId) { return String(profileId).startsWith('core-'); }

function buildCounterfactualResult(config, results, anchorVerification) {
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

  // Confidence intervals (Wilson score for win rate, bootstrap-style for utility)
  const sWinCI = wilsonInterval(s.focalWins, s.completedCount);
  const aWinCI = wilsonInterval(a.focalWins, a.completedCount);
  const sUtilCI = bootstrapMeanCI(s.focalUtilityDistribution);
  const aUtilCI = bootstrapMeanCI(a.focalUtilityDistribution);

  // Effect size and significance
  const pooledSD = Math.sqrt(((s.completedCount - 1) * variance(s.focalUtilityDistribution) + (a.completedCount - 1) * variance(a.focalUtilityDistribution)) / Math.max(1, s.completedCount + a.completedCount - 2));
  const cohenD = pooledSD > 0 ? diff / pooledSD : null;
  const significant = sUtilCI && aUtilCI ? !(sUtilCI[1] >= aUtilCI[0] && aUtilCI[1] >= sUtilCI[0]) : false;

  return {
    selectedFocalUtility: sUtil,
    alternativeFocalUtility: aUtil,
    estimatedDifference: Number(diff.toFixed(4)),
    selectedWinRateCI: sWinCI,
    alternativeWinRateCI: aWinCI,
    selectedUtilityCI: sUtilCI,
    alternativeUtilityCI: aUtilCI,
    cohenD: cohenD != null ? Number(cohenD.toFixed(4)) : null,
    significant,
    selectedRolloutCount: s.totalRollouts,
    alternativeRolloutCount: a.totalRollouts,
    selectedAbortedCount: s.abortedCount,
    alternativeAbortedCount: a.abortedCount,
    interpretation: significant
      ? `Under these paired deterministic, policy-conditioned continuations, the alternative produced a ${diff > 0 ? 'significantly higher' : 'significantly lower'} mean focal-seat utility (95% CI intervals do not overlap). Effect size (Cohen's d): ${cohenD != null ? cohenD.toFixed(3) : 'N/A'}.`
      : 'Under these paired deterministic, policy-conditioned continuations, the alternative produced a different mean focal-seat utility. The difference is not statistically significant at the 95% level (CI intervals overlap).',
    limitations: [
      'Sample size may be insufficient for narrow claims.',
      'Continuation policies are heuristics, not optimal play.',
      'This is an estimate, not proof of what should have happened.',
      'Aborted rollouts are preserved and counted as failures, not draws.',
      'Wilson score intervals are used for win rate; bootstrap-style quantile intervals for utility.',
      'Cohen\'s d assumes approximately normal distributions and equal variances.'
    ]
  };
}

// ── Statistical helpers (inlined to avoid node:crypto dependency from @intrilex/statistics) ──

/**
 * Wilson score interval for a binomial proportion.
 * @param {number} successes
 * @param {number} total
 * @param {number} [z=1.96] - Z-score (default: 95%)
 * @returns {[number, number]} [lower, upper] in [0, 1]
 */
function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (total === 0) return [0, 0];
  const p = successes / total, z2 = z * z, denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Compute variance of a numeric array.
 * @param {number[]} values
 * @returns {number}
 */
function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
}

/**
 * Bootstrap-style confidence interval for the mean using quantiles.
 * Uses the t-distribution approximation for small samples.
 * @param {number[]} values
 * @param {number} [alpha=0.05] - Significance level (default: 95% CI)
 * @returns {[number, number] | null} [lower, upper] or null if insufficient data
 */
function bootstrapMeanCI(values, alpha = 0.05) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const sd = Math.sqrt(variance(clean));
  const n = clean.length;
  const se = sd / Math.sqrt(n);
  // t-distribution approximation: for n >= 30, t ≈ z; for small n, use conservative t-value
  const tCritical = n >= 30 ? 1.959963984540054 : n >= 10 ? 2.262 : n >= 5 ? 2.776 : 3.182;
  const margin = tCritical * se;
  return [Number((mean - margin).toFixed(4)), Number((mean + margin).toFixed(4))];
}

export function diagnosePolicy(summaries, decisions = [], policyId) {
  const policyDecisions = decisions.filter((d) => d.policyId === policyId);
  const policyMatches = summaries.filter((s) => s.policyIds?.includes(policyId) || s.participants?.some((p) => p.policyId === policyId));

  const diagnostics = {
    policyId,
    schemaVersion: POLICY_DIAGNOSTICS_VERSION,
    matchCount: policyMatches.length,
    decisionCount: policyDecisions.length,
    metrics: {},
    lowMarginDecisions: [],
    highRiskDecisions: [],
    resourceConservation: {},
    timingAnalysis: {},
    limitations: []
  };

  const normalizeDecision = (d) => ({
    ...d,
    decisionId: d.decisionId ?? `DT-${d.matchId ?? ''}-${d.decisionIndex ?? 0}`,
    selectionMargin: d.selectionMargin ?? null,
    targetControllerId: d.targetControllerId ?? null,
    actorId: d.actorId ?? null,
    consumedMiniTurn: d.consumedMiniTurn ?? null
  });
  const normalized = policyDecisions.map(normalizeDecision);

  const margins = normalized.map((d) => d.selectionMargin).filter((m) => m !== null && Number.isFinite(m));
  if (margins.length) {
    diagnostics.metrics.decisionMarginMean = margins.reduce((a, b) => a + b, 0) / margins.length;
    diagnostics.metrics.decisionMarginMedian = margins.sort((a, b) => a - b)[Math.floor(margins.length / 2)];
    diagnostics.lowMarginDecisions = normalized.filter((d) => d.selectionMargin !== null && d.selectionMargin > 0 && d.selectionMargin < 5).map((d) => ({
      decisionId: d.decisionId,
      margin: d.selectionMargin,
      action: d.family
    }));
  }

  const counterDecisions = normalized.filter((d) => d.family === 'counter');
  const ownTopCounters = counterDecisions.filter((d) => d.targetControllerId !== null && d.actorId !== null && d.targetControllerId === d.actorId);
  if (counterDecisions.length) {
    diagnostics.metrics.selfCounterRate = ownTopCounters.length / counterDecisions.length;
    diagnostics.highRiskDecisions = ownTopCounters.map((d) => ({
      decisionId: d.decisionId,
      issue: 'self-counter-own-top',
      family: d.family
    }));
  }

  const responseDecisions = normalized.filter((d) => ['counter', 'disrupt', 'interrupt', 'instant', 'quick', 'response-decline'].includes(d.family));
  const declines = responseDecisions.filter((d) => d.family === 'response-decline');
  if (responseDecisions.length) {
    diagnostics.resourceConservation.responseDeclineRate = declines.length / responseDecisions.length;
    diagnostics.resourceConservation.responsePlayRate = (responseDecisions.length - declines.length) / responseDecisions.length;
  }

  const miniTurnActions = normalized.filter((d) => d.consumedMiniTurn === true);
  const exhaustedPasses = miniTurnActions.filter((d) => d.family === 'exhausted-pass');
  if (miniTurnActions.length) {
    diagnostics.metrics.exhaustedPassRate = exhaustedPasses.length / miniTurnActions.length;
  }

  const quickDecisions = normalized.filter((d) => d.timingClass === 'QUICK');
  const interruptDecisions = normalized.filter((d) => d.timingClass === 'INTERRUPT');
  diagnostics.timingAnalysis.quickCount = quickDecisions.length;
  diagnostics.timingAnalysis.interruptCount = interruptDecisions.length;

  const wins = policyMatches.filter((s) => {
    if (s.participants) {
      const p = s.participants.find((part) => part.policyId === policyId);
      return p?.result === 'win';
    }
    return s.winner !== 'DRAW' && s.winner !== 'ABORTED' && s.policyIds[s.seatOrder.indexOf(s.winner)] === policyId;
  }).length;
  const decisive = policyMatches.filter((s) => {
    if (s.participants) return s.participants.some((p) => p.policyId === policyId && (p.result === 'win' || p.result === 'loss'));
    return s.winner !== 'DRAW' && s.winner !== 'ABORTED';
  }).length;
  if (decisive > 0) {
    diagnostics.metrics.winRate = wins / decisive;
    diagnostics.metrics.decisiveMatches = decisive;
  }

  if (policyDecisions.length < 50) {
    diagnostics.limitations.push('Insufficient decision sample for robust statistical claims.');
  }
  if (policyMatches.length < 20) {
    diagnostics.limitations.push('Insufficient match sample for reliable win-rate estimates.');
  }

  return Object.freeze({ ...diagnostics, diagnosticsHash: hashCanonical(diagnostics) });
}

export function comparePolicyDiagnostics(baseline, candidate) {
  return {
    baselinePolicyId: baseline.policyId,
    candidatePolicyId: candidate.policyId,
    baselineWinRate: baseline.metrics.winRate ?? null,
    candidateWinRate: candidate.metrics.winRate ?? null,
    winRateDelta: (candidate.metrics.winRate ?? 0) - (baseline.metrics.winRate ?? 0),
    baselineSelfCounterRate: baseline.metrics.selfCounterRate ?? null,
    candidateSelfCounterRate: candidate.metrics.selfCounterRate ?? null,
    baselineDecisionMarginMean: baseline.metrics.decisionMarginMean ?? null,
    candidateDecisionMarginMean: candidate.metrics.decisionMarginMean ?? null,
    interpretation: 'Policy comparison is descriptive. Win-rate differences require uncertainty quantification and multiple opponents before promotion.',
    limitations: [
      'Win-rate alone is insufficient for policy promotion.',
      'Behavioral metrics must be evaluated across multiple opponents and seat orientations.',
      'A candidate that gains one matchup while degrading general robustness must be rejected or disclosed.'
    ]
  };
}
