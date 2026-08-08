import {
  reconstructAuthorityCheckpoints,
  createSimulationDecisionFrame,
  executeSimulationAction,
  authorityHashCanonical,
  verifyAuthorityCertifiedReplay
} from '@intrilex/engine-adapter';
import {
  COUNTERFACTUAL_SCHEMA_VERSION,
  ANALYSIS_VERSION,
  deriveContinuationSeed,
  isCounterfactualSupported,
  notSupportedResult,
  buildCounterfactualResult,
  compareCounterfactual
} from '@intrilex/decision-intelligence/counterfactual';
import { verifyAnchorAuthority } from '@intrilex/decision-intelligence/anchor';
import { runPolicyMatch } from './runtime.mjs';

export {
  COUNTERFACTUAL_SCHEMA_VERSION,
  ANALYSIS_VERSION,
  deriveContinuationSeed,
  isCounterfactualSupported,
  compareCounterfactual
} from '@intrilex/decision-intelligence/counterfactual';

// Anchor authority is verified by the shared pure resolver
// (@intrilex/decision-intelligence/anchor), used verbatim by Node and the
// browser. The runtime's job is to RESOLVE authority from a real certified
// replay and a real retained Decision Evidence record (supplied by the caller
// as config.retainedDecisionEvidence), then hand it to the resolver. The
// runtime never re-derives the decisionId from a self-invented formula and
// never presence-checks actor/seat — it value-matches them via the resolver.

// Derive the unique decision-to-command mapping from full command hashes and
// replay execution: the replay command whose canonical hash equals the
// selected action's command hash. Returns { index } or { ambiguous: true } or
// { none: true }.
function deriveDecisionCommandMapping(replay, selectedCommandHash) {
  const matches = [];
  for (let i = 0; i < replay.commands.length; i += 1) {
    if (authorityHashCanonical(replay.commands[i]) === selectedCommandHash) matches.push(i);
  }
  if (matches.length === 0) return { none: true };
  if (matches.length > 1) return { ambiguous: true };
  return { index: matches[0] };
}

function buildRestoredAuthority(config, replay, frames, checkpointIndex, decisionFrame, selectedActionId, seatOrder) {
  const beforeStateHash = authorityHashCanonical(decisionFrame.state);
  const legalActionIds = decisionFrame.policyActions.map((a) => a.actionId);
  const legalActionSetHash = authorityHashCanonical([...legalActionIds].sort());
  const selectedCommand = decisionFrame.resolve(selectedActionId);
  const selectedCommandHash = authorityHashCanonical(selectedCommand);
  const selectedActionResult = executeSimulationAction(decisionFrame.state, selectedCommand);
  const postSelectedActionStateHash = authorityHashCanonical(selectedActionResult.state);
  const frameActorId = selectedCommand.actorId ?? null;
  const frameSeat = Array.isArray(seatOrder) ? (seatOrder.indexOf(frameActorId) + 1) : null;

  const mapping = deriveDecisionCommandMapping(replay, selectedCommandHash);
  const derivedReplayCommandIndex = mapping.index ?? null;

  const replayCommandIndex = config.replayCommandIndex;
  const commandHashAtReplayCommandIndex = (typeof replayCommandIndex === 'number' && replayCommandIndex >= 0 && replayCommandIndex < replay.commands.length)
    ? authorityHashCanonical(replay.commands[replayCommandIndex])
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

// Resolve and verify the anchor once. Returns { valid } or
// { valid: false, reason, missingAuthority }. Also surfaces mapping errors
// (none / ambiguous) that the pure resolver cannot detect without the replay.
function verifyAnchor(config, replay, frames, checkpointIndex, decisionFrame, selectedActionId, seatOrder) {
  const retainedRecord = config.retainedDecisionEvidence;
  if (!retainedRecord || typeof retainedRecord !== 'object') {
    return { valid: false, reason: 'MISSING_RETAINED_DECISION_EVIDENCE', missingAuthority: 'retained-decision-evidence' };
  }
  const restoredAuthority = buildRestoredAuthority(config, replay, frames, checkpointIndex, decisionFrame, selectedActionId, seatOrder);
  const mapping = deriveDecisionCommandMapping(replay, restoredAuthority.selectedCommandHash);
  if (mapping.none) return { valid: false, reason: 'NO_DECISION_COMMAND_MAPPING', missingAuthority: 'replay-command-index' };
  if (mapping.ambiguous) return { valid: false, reason: 'AMBIGUOUS_DECISION_COMMAND_MAPPING', missingAuthority: 'replay-command-index' };
  const anchor = buildAnchorFromConfig(config, replay);
  // Fill in derived fields from restored authority when config doesn't provide
  // them (undefined/null). This lets callers pass minimal config and have the
  // resolver derive the rest from the engine. Explicitly provided values
  // (including truncated hashes) are NOT overridden — truncated hashes still
  // fail the isFullHash check in the resolver.
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

function runSingleBranch(config, sharedSeeds) {
  const {
    matchId, checkpointHash, baseSeed, seatOrder, policyIds, profileId,
    alternativeActionId, continuationPolicyIds, rolloutCount = 32,
    analysisVersion = ANALYSIS_VERSION,
    replay, checkpointIndex = 0, decisionIndex = 0,
    focalSeat, selectedActionId
  } = config;

  const supportCheck = isCounterfactualSupported(replay, checkpointIndex);
  if (!supportCheck.supported) {
    return notSupportedResult(supportCheck.reason, supportCheck.missingAuthority, config);
  }

  let replayVerification;
  try {
    replayVerification = verifyAuthorityCertifiedReplay(replay);
  } catch (err) {
    console.warn('[counterfactual] REPLAY_VERIFICATION_FAILED:', err?.message ?? err);
    return notSupportedResult('REPLAY_VERIFICATION_FAILED', 'authority-certified-replay', config);
  }

  let frames;
  try {
    frames = reconstructAuthorityCheckpoints(replay);
  } catch (err) {
    console.warn('[counterfactual] CHECKPOINT_RECONSTRUCTION_FAILED:', err?.message ?? err);
    return notSupportedResult('CHECKPOINT_RECONSTRUCTION_FAILED', 'checkpoint-reconstruction', config);
  }

  const checkpointState = frames[checkpointIndex].state;

  let decisionFrame;
  try {
    decisionFrame = createSimulationDecisionFrame(checkpointState);
  } catch (err) {
    console.warn('[counterfactual] NO_DECISION_AT_CHECKPOINT:', err?.message ?? err);
    return notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
  }

  if (decisionFrame.status !== 'PLAYER_DECISION_REQUIRED' || !decisionFrame.policyActions?.length) {
    return notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
  }

  // The historical selected action must be present before anchor verification,
  // since the resolver reconstructs the selected command from it. A missing
  // selectedActionId fails closed here, before any engine resolution.
  if (config.selectedActionId === undefined || config.selectedActionId === null || config.selectedActionId === '') {
    return notSupportedResult('MISSING_SELECTEDACTIONID', 'selectedActionId', config);
  }

  // Verify the anchor against resolved retained authority (shared pure resolver).
  // The historical selected action (config.selectedActionId) is verified for
  // every branch; the branch then executes either that action or the alternative.
  const anchorCheck = verifyAnchor(config, replay, frames, checkpointIndex, decisionFrame, config.selectedActionId, seatOrder);
  if (!anchorCheck.valid) {
    return notSupportedResult(anchorCheck.reason, anchorCheck.missingAuthority, config);
  }

  const beforeStateHash = authorityHashCanonical(decisionFrame.state);

  const legalActionSetHash = authorityHashCanonical(
    decisionFrame.policyActions.map(a => a.actionId).sort()
  );

  const isAlternativeBranch = alternativeActionId !== undefined && alternativeActionId !== null;
  const actionToExecuteId = isAlternativeBranch ? alternativeActionId : selectedActionId;
  const actionToExecute = decisionFrame.policyActions.find(a => a.actionId === actionToExecuteId);

  if (!actionToExecute) {
    return notSupportedResult(isAlternativeBranch ? 'ALTERNATIVE_ACTION_NOT_LEGAL' : 'SELECTED_ACTION_NOT_LEGAL', 'legal-action-set', config,
      { legalActionIds: decisionFrame.policyActions.map(a => a.actionId) });
  }

  const command = decisionFrame.resolve(actionToExecute.actionId);
  const actionResult = executeSimulationAction(decisionFrame.state, command);
  if (!actionResult.accepted) {
    return notSupportedResult(isAlternativeBranch ? 'ALTERNATIVE_ACTION_REJECTED' : 'SELECTED_ACTION_REJECTED', 'engine-acceptance', config,
      { engineError: actionResult.error?.code ?? null });
  }

  const postActionState = actionResult.state;
  const postActionStateHash = authorityHashCanonical(postActionState);

  const replayContentHash = replay.contentHash;
  const contPolicyIds = continuationPolicyIds ?? policyIds;
  const results = [];
  for (let rolloutIndex = 0; rolloutIndex < rolloutCount; rolloutIndex += 1) {
    const continuationSeed = sharedSeeds
      ? sharedSeeds[rolloutIndex]
      : deriveContinuationSeed({ matchId, checkpointHash: replayContentHash, replayContentHash, rolloutIndex, analysisVersion, verifiedDecisionId: config.decisionId, orderedContinuationPolicyIds: contPolicyIds });
    const branchSeed = (baseSeed ^ continuationSeed) >>> 0 || 1;
    try {
      const match = runPolicyMatch({
        profileId,
        seed: branchSeed,
        seatOrder,
        policyIds: contPolicyIds,
        decisionLimit: 1800,
        telemetryEnabled: false,
        includeReplay: false,
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
    decisionIndex: decisionIndex ?? checkpointIndex,
    legalActionSetHash,
    actionAccepted: true,
    executedActionId: actionToExecute.actionId,
    isReplaySelected: !isAlternativeBranch
  };

  return buildCounterfactualResult(
    { ...config, replayContentHash, focalSeat, alternativeActionId: actionToExecute.actionId },
    results,
    anchorVerification
  );
}

export function runCounterfactualBranch(config) {
  return runSingleBranch(config);
}

export function runPairedCounterfactual(config) {
  const { replay, checkpointIndex = 0, rolloutCount = 32, analysisVersion = ANALYSIS_VERSION, continuationPolicyIds, policyIds } = config;

  const supportCheck = isCounterfactualSupported(replay, checkpointIndex);
  if (!supportCheck.supported) {
    const ns = notSupportedResult(supportCheck.reason, supportCheck.missingAuthority, config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  try {
    verifyAuthorityCertifiedReplay(replay);
  } catch (err) {
    console.warn('[counterfactual] REPLAY_VERIFICATION_FAILED:', err?.message ?? err);
    const ns = notSupportedResult('REPLAY_VERIFICATION_FAILED', 'authority-certified-replay', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  let frames;
  try {
    frames = reconstructAuthorityCheckpoints(replay);
  } catch (err) {
    console.warn('[counterfactual] CHECKPOINT_RECONSTRUCTION_FAILED:', err?.message ?? err);
    const ns = notSupportedResult('CHECKPOINT_RECONSTRUCTION_FAILED', 'checkpoint-reconstruction', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const checkpointState = frames[checkpointIndex].state;
  let decisionFrame;
  try {
    decisionFrame = createSimulationDecisionFrame(checkpointState);
  } catch (err) {
    console.warn('[counterfactual] NO_DECISION_AT_CHECKPOINT:', err?.message ?? err);
    const ns = notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  if (decisionFrame.status !== 'PLAYER_DECISION_REQUIRED' || !decisionFrame.policyActions?.length) {
    const ns = notSupportedResult('NO_DECISION_AT_CHECKPOINT', 'decision-frame', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const selectedActionId = config.selectedActionId;
  if (!selectedActionId) {
    const ns = notSupportedResult('MISSING_SELECTED_ACTION_ID', 'selected-action-id', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  // Verify the anchor against resolved retained authority (shared pure resolver).
  const anchorCheck = verifyAnchor(config, replay, frames, checkpointIndex, decisionFrame, selectedActionId, config.seatOrder);
  if (!anchorCheck.valid) {
    const ns = notSupportedResult(anchorCheck.reason, anchorCheck.missingAuthority, config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const selectedAction = decisionFrame.policyActions.find(a => a.actionId === selectedActionId);
  if (!selectedAction) {
    const ns = notSupportedResult('SELECTED_ACTION_NOT_LEGAL', 'legal-action-set', config);
    return { selected: ns, alternative: ns, comparison: null };
  }

  const alternativeActionId = config.alternativeActionId
    ?? decisionFrame.policyActions.find(a => a.actionId !== selectedActionId)?.actionId
    ?? decisionFrame.policyActions[1]?.actionId;

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

  const selected = runSingleBranch({ ...config, selectedActionId, alternativeActionId: null }, sharedSeeds);
  const alternative = runSingleBranch({ ...config, selectedActionId, alternativeActionId }, sharedSeeds);
  const comparison = compareCounterfactual(selected, alternative);

  return { selected, alternative, comparison };
}
