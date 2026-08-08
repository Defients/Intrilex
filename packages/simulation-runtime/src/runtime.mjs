import {
  DEFAULT_SIMULATION_PROFILE,
  ENGINE_VERSION,
  RULES_VERSION,
  authorityHashCanonical,
  createAuthorityCertifiedReplay,
  createSimulationDecisionFrame,
  createSimulationState,
  deriveSecuredPoints,
  executeSimulationAction,
  strictPolicyView,
  verifyAuthorityCertifiedReplay
} from '@intrilex/engine-adapter';
import { DeterministicPolicyRng, validateDecision } from '@intrilex/policy-sdk';
import { POLICY_BY_ID } from './policy-catalog.mjs';
import { hashCanonical } from '@intrilex/shared';
import { LAB_VERSION, REPLAY_DATA_VERSION, ANALYTICS_SCHEMA_VERSION } from '@intrilex/shared/version';
import {
  TELEMETRY_SCHEMA_VERSION,
  applyDecisionCounters,
  applyEventCounters,
  createCausalEdges,
  createDecisionFact,
  createResolutionFact,
  createRunProvenance,
  createStateDeltaFact,
  emptySemanticCounters,
  isMeaningfulResponseFrame,
  isMiniTurnAction,
  semanticClassForAction
} from '@intrilex/telemetry';
import { createDecisionTrace} from '@intrilex/decision-intelligence/decision-trace';
import { attributeAction, classifyVariantEntity, isNoAttributionAction } from './rank-attribution.mjs';

export { LAB_VERSION, REPLAY_DATA_VERSION, ANALYTICS_SCHEMA_VERSION };
const COMPLETE_REASONS = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const RESPONSE_FAMILIES = new Set(['counter', 'disrupt', 'interrupt', 'instant', 'quick']);
const ADVANCED_FAMILIES = new Set(['royal-marriage', 'super', 'rank10', 'ultra', 'voltage']);

function uint32FromHash(value) {
  const parsed = Number.parseInt(hashCanonical(value).slice(0, 8), 16) >>> 0;
  return parsed || 1;
}
function increment(record, key, amount = 1) { record[key] = (record[key] ?? 0) + amount; }
function countFamilies(counts, families) { let sum = 0; for (const family of families) sum += Number(counts[family] ?? 0); return sum; }
function pointsByPlayer(state, seatOrder) { return Object.fromEntries(seatOrder.map((id) => [id, deriveSecuredPoints(state, id)])); }
function sumNumericMaps(left = {}, right = {}) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) result[key] = Number(result[key] ?? 0) + Number(value ?? 0);
  return result;
}
function mergeRankStateDelta(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    securedPointDeltaByPlayer: sumNumericMaps(existing.securedPointDeltaByPlayer, incoming.securedPointDeltaByPlayer),
    boardPresenceDeltaByPlayer: sumNumericMaps(existing.boardPresenceDeltaByPlayer, incoming.boardPresenceDeltaByPlayer),
    attributionStatus: existing.attributionStatus === 'observed' || incoming.attributionStatus === 'observed' ? 'observed' : (incoming.attributionStatus ?? existing.attributionStatus),
    deferredResolution: Boolean(existing.deferredResolution || incoming.deferredResolution)
  };
}
const NON_MECHANIC_FAMILIES = new Set(['phase', 'response-decline', 'private-choice']);
const NON_MECHANIC_MODES = new Set(['enter-action', 'decline', 'points', 'ordinary', 'top', 'forced-mini-turn', '♣', '♦', '♥', '♠']);
const TIMING_FAMILIES = new Set(['instant', 'quick', 'interrupt']);
const MECHANIC_TAG_CACHE = new WeakMap();
function mechanicTags(action) {
  const cached = MECHANIC_TAG_CACHE.get(action);
  if (cached) return cached;
  const tags = new Set();
  if (!NON_MECHANIC_FAMILIES.has(action.family) && !TIMING_FAMILIES.has(action.family)) tags.add(action.family);
  if (action.mode && !NON_MECHANIC_MODES.has(action.mode) && action.mode !== action.family) tags.add(action.mode);
  const result = [...tags].sort();
  MECHANIC_TAG_CACHE.set(action, result);
  return result;
}
function primaryMechanicTag(action) {
  if (NON_MECHANIC_FAMILIES.has(action.family)) return null;
  if (action.mode && !NON_MECHANIC_MODES.has(action.mode) && action.mode !== action.family) return action.mode;
  if (TIMING_FAMILIES.has(action.family)) return null;
  return action.family;
}
function countUntappedQueens(state, playerId) {
  return (state.players?.[playerId]?.er ?? []).filter((id) => /^Q[♣♦♥♠]$/u.test(String(state.cards?.[id]?.identity ?? '')) && state.cards?.[id]?.state?.tapped !== true).length;
}
function buildRuleCompliance({ decisions, events, state }) {
  // Single-pass iteration over decisions to collect targets and count violations.
  // This avoids creating 8+ intermediate arrays from separate .filter() calls.
  const interruptTargets = [];
  const threeRedTargets = [];
  let ordinaryPassActionCount = 0;
  let nonExhaustedPassActionCount = 0;
  let responseDeclineMiniTurnViolationCount = 0;
  let freePlayMiniTurnViolationCount = 0;
  let quickTimingViolationCount = 0;
  let interruptWindowViolationCount = 0;
  const timingSet = new Set(['INSTANT', 'QUICK', 'INTERRUPT']);
  for (const item of decisions) {
    const fam = item.family ?? '';
    if (item.mode === 'rank10-stack-theft') interruptTargets.push(item);
    if (item.mode === 'three-red-counter') threeRedTargets.push(item);
    if (fam === 'pass') ordinaryPassActionCount++;
    if (fam.includes('pass') && fam !== 'exhausted-pass') nonExhaustedPassActionCount++;
    if (fam === 'response-decline' && item.consumedMiniTurn) responseDeclineMiniTurnViolationCount++;
    if (timingSet.has(item.timingClass) && item.consumedMiniTurn) freePlayMiniTurnViolationCount++;
    if (item.timingClass === 'QUICK' && item.actorId !== item.activePlayerId) quickTimingViolationCount++;
    if (item.timingClass === 'INTERRUPT' && !item.hadLawfulResponse && item.actorId !== item.activePlayerId) interruptWindowViolationCount++;
  }
  // Post-process target-specific violations (requires collected arrays)
  let stackTheftTargetViolationCount = 0;
  for (const item of interruptTargets) {
    if (!['ordinary-effect','anchor','rank10'].includes(item.targetStackClass) || item.targetSourceCount !== 1) stackTheftTargetViolationCount++;
  }
  let threeRedQueenDefenseViolationCount = 0;
  for (const item of threeRedTargets) {
    if (item.targetUntappedQueenDefenders >= 2) threeRedQueenDefenseViolationCount++;
  }
  // Single-pass over events for skip accounting
  let authorizedFullTurnSkips = 0;
  let consumedFullTurnSkips = 0;
  for (const event of events) {
    if (event.type === 'CORE_RANK10_STACK_THEFT_RESOLVED') authorizedFullTurnSkips += 2;
    else if (event.type === 'CORE_COUNTER_RESOLVED' && event.payload?.stackTheftPrintedSkipApplied === true) authorizedFullTurnSkips += 1;
    else if (event.type === 'CORE_FULL_TURN_SKIP_CONSUMED') consumedFullTurnSkips++;
  }
  const pendingFullTurnSkips = Object.values(state.players ?? {}).reduce((sum, player) => sum + Number(player.limits?.pendingFullTurnSkips ?? 0), 0);
  const checks = {
    ordinaryPassActionCount,
    nonExhaustedPassActionCount,
    responseDeclineMiniTurnViolationCount,
    freePlayMiniTurnViolationCount,
    quickTimingViolationCount,
    interruptWindowViolationCount,
    stackTheftTargetViolationCount,
    threeRedQueenDefenseViolationCount,
    unauthorizedFullTurnSkipCount: Math.max(0, consumedFullTurnSkips + pendingFullTurnSkips - authorizedFullTurnSkips),
    missingPrintedFullTurnSkipCount: Math.max(0, authorizedFullTurnSkips - consumedFullTurnSkips - pendingFullTurnSkips)
  };
  const violationCount = Object.values(checks).reduce((sum, value) => sum + value, 0);
  return {
    status: violationCount === 0 ? 'PASS' : 'FAIL',
    violationCount,
    ...checks,
    authorizedFullTurnSkips,
    consumedFullTurnSkips,
    pendingFullTurnSkips
  };
}
function resolutionOutcome(result) {
  if (!result.accepted) return 'rejected';
  const types = result.events.map((event) => String(event.type ?? ''));
  if (types.some((type) => /COUNTERED|COUNTER_RESOLVED/.test(type))) return 'countered';
  if (types.some((type) => /FIZZLE/.test(type))) return 'fizzled';
  if (types.some((type) => /REPLACED|THEFT/.test(type))) return 'replaced';
  if (types.some((type) => /PARTIAL/.test(type))) return 'partially-resolved';
  return 'resolved';
}

export function createMatchId(config) {
  return `M-${hashCanonical({ profileId: config.profileId, seed: config.seed, seatOrder: config.seatOrder, policyIds: config.policyIds }).slice(0, 20)}`;
}

/**
 * Build rank and variant opportunity maps from the legal actions in a decision frame.
 * Each unique rank/variant gets ONE opportunity count per frame (not per legal action).
 * @returns {{ rankOppMap: Record<string, {rank,opportunityFrames,legalOptions}>, variantOppMap: Record<string, {variantKey,opportunityFrames,legalOptions}> }}
 */
function buildRankOpportunityMaps(policyActions, state) {
  const rankOppMap = {};
  const variantOppMap = {};
  for (const pa of policyActions) {
    if (isNoAttributionAction(pa)) continue;
    const paAttrib = attributeAction(state, pa, 'private');
    if (paAttrib.primaryRank) {
      const opportunityRanks = paAttrib.sourceRanks?.length ? [...new Set(paAttrib.sourceRanks)] : [paAttrib.primaryRank];
      for (const rank of opportunityRanks) {
        if (!rankOppMap[rank]) rankOppMap[rank] = { rank, opportunityFrames: 1, legalOptions: 1 };
        else rankOppMap[rank].legalOptions += 1;
      }
    }
    const paVariant = classifyVariantEntity(paAttrib, pa);
    if (paVariant.variantKey) {
      if (!variantOppMap[paVariant.variantKey]) variantOppMap[paVariant.variantKey] = { variantKey: paVariant.variantKey, opportunityFrames: 1, legalOptions: 1 };
      else variantOppMap[paVariant.variantKey].legalOptions += 1;
      for (const ck of paVariant.creditKeys) {
        if (ck === paVariant.variantKey) continue;
        if (!variantOppMap[ck]) variantOppMap[ck] = { variantKey: ck, opportunityFrames: 1, legalOptions: 1 };
        else variantOppMap[ck].legalOptions += 1;
      }
    } else if (paAttrib.primaryRank) {
      const rank = paAttrib.primaryRank;
      if (!variantOppMap[rank]) variantOppMap[rank] = { variantKey: rank, opportunityFrames: 1, legalOptions: 1 };
      else variantOppMap[rank].legalOptions += 1;
      const normalKey = `${rank}:normal`;
      if (!variantOppMap[normalKey]) variantOppMap[normalKey] = { variantKey: normalKey, opportunityFrames: 1, legalOptions: 1 };
      else variantOppMap[normalKey].legalOptions += 1;
    }
  }
  return { rankOppMap, variantOppMap };
}

/**
 * Attribute deferred stack resolution to the previous declaration.
 * When a frame resolves the stack (moving cards to PR/ER), that resolution
 * delta is credited to the originating declaration, not the current decision.
 * Mutates facts and rankDecisions in place.
 */
function attributeDeferredResolution({ pendingCausality, preFrameState, preFrameScores, state, frame, matchId, seatOrder, facts, rankDecisions }) {
  const postFrameScores = pointsByPlayer(state, seatOrder);
  const frameScoreChanged = seatOrder.some((id) => postFrameScores[id] !== preFrameScores[id]);
  const frameBoardChanged = seatOrder.some((id) => {
    const a = state.players?.[id];
    const b = preFrameState?.players?.[id];
    return ((a?.pr?.length ?? 0) + (a?.er?.length ?? 0)) !== ((b?.pr?.length ?? 0) + (b?.er?.length ?? 0));
  });
  if (frameScoreChanged || frameBoardChanged) {
    const frameDelta = createStateDeltaFact({
      matchId, checkpointId: `${pendingCausality.checkpointId}:RES`,
      before: preFrameState, after: state,
      securedBefore: preFrameScores, securedAfter: postFrameScores
    });
    const frameResolutionFact = createResolutionFact({
      declarationFactId: pendingCausality.declarationFactId,
      mechanicTags: pendingCausality.mechanicTags,
      sourceEntityIds: pendingCausality.sourceEntityIds,
      targetEntityIds: pendingCausality.targetEntityIds,
      outcome: 'resolved',
      stateDeltaId: frameDelta.factId,
      causalChainId: pendingCausality.causalChainId,
      engineEventIds: frame.events.map((event) => event.id)
    });
    facts.stateDeltaFacts.push(frameDelta);
    facts.resolutionFacts.push(frameResolutionFact);
    facts.causalEdges.push(
      { fromFactId: pendingCausality.declarationFactId, toFactId: frameResolutionFact.factId, relation: 'declared' },
      { fromFactId: frameResolutionFact.factId, toFactId: frameDelta.factId, relation: 'caused-state-delta' }
    );
    const originatingDecision = rankDecisions.find((rd) => rd.participantId === pendingCausality.actorId && rd.checkpointId === pendingCausality.checkpointId);
    if (originatingDecision) {
      originatingDecision.stateDelta = mergeRankStateDelta(originatingDecision.stateDelta, {
        securedPointDeltaByPlayer: frameDelta.securedPointDeltaByPlayer,
        boardPresenceDeltaByPlayer: frameDelta.boardPresenceDeltaByPlayer,
        attributionStatus: 'observed',
        causedByDeclarationFactId: pendingCausality.declarationFactId,
        deferredResolution: true
      });
    }
  }
}

/**
 * Build the decision trace context object from the authorized view and current state.
 * @returns {object} traceContext for createDecisionTrace()
 */
function buildDecisionTraceContext(authorizedView, state, beforePhase, actorId) {
  const stack = authorizedView.stack ?? [];
  const top = stack.at(-1) ?? null;
  return {
    activePlayerId: authorizedView.activePlayerId,
    phase: beforePhase,
    fullTurnSequence: state.fullTurnSequence,
    stack,
    own: authorizedView.own,
    opponents: authorizedView.opponents,
    response: {
      top,
      root: stack[0] ?? null,
      opponentRoot: Boolean(stack[0] && stack[0].controllerId !== actorId),
      opponentTop: Boolean(top && top.controllerId !== actorId),
      ownTop: Boolean(top && top.controllerId === actorId),
      depth: stack.length
    }
  };
}

export function runPolicyMatch(config) {
  const profileId = config.profileId ?? DEFAULT_SIMULATION_PROFILE;
  const seatOrder = config.seatOrder ?? ['P1', 'P2'];
  const policyIds = config.policyIds ?? ['random-legal', 'random-legal'];
  const decisionLimit = config.decisionLimit ?? 1800;
  const runInstanceId = config.runInstanceId ?? `RI-${hashCanonical({ profileId, seed: config.seed >>> 0 || 1, seatOrder, policyIds, decisionLimit }).slice(0, 20)}`;
  const setup = { profileId, playerIds: seatOrder, enabledModules: [], eventApprovedModules: [], seed: config.seed >>> 0 || 1, seatOrder };
  const initialState = config.initialState ?? createSimulationState(setup);
  let state = initialState;
  const commands = [], events = [], decisions = [];
  const facts = { decisionFacts: [], resolutionFacts: [], stateDeltaFacts: [], causalEdges: [] };
  const decisionTraces = [];
  const captureFacts = config.telemetryEnabled !== false;
  const captureTraces = config.decisionTracesEnabled === true;
  const actionCounts = {}, decisionFamilyCounts = {}, actionModeCounts = {}, decisionModeCounts = {}, responseActionCounts = {}, timingClassCounts = {}, eventTypeCounts = {}, mechanicCounts = {}, primaryMechanicCounts = {}, mechanicOpportunityCounts = {}, primaryMechanicOpportunityCounts = {};
  const rankDecisions = [];
  const semanticCounters = emptySemanticCounters();
  const perSeat = seatOrder.map(() => ({ miniTurnActionCount:0, exhaustedPassActionCount:0, responsePlayedCount:0, responseDeclinedCount:0, responseOpportunityCount:0, counterDeclarationCount:0, quickDeclarationCount:0, instantDeclarationCount:0, interruptDeclarationCount:0, policyDecisionCount:0, policyActionCount:0, actionCount:0, passActionCount:0, miniTurnCount:0, meaningfulResponseDecisionCount:0, advancedDecisionCount:0, voltageDecisionCount:0, ultraDecisionCount:0, privateChoiceDecisionCount:0, mechanicCounts:{}, primaryMechanicCounts:{}, mechanicOpportunityCounts:{}, primaryMechanicOpportunityCounts:{}, decisionFamilyCounts:{} }));
  const policyRngByPlayer = Object.fromEntries(seatOrder.map((playerId, index) => [playerId, new DeterministicPolicyRng(uint32FromHash({ seed: setup.seed, playerId, policyId: policyIds[index], stream: 'POLICY_V4' }))]));
  let terminationReason = 'DECISION_LIMIT', errorCode = null;
  const captureEvents = (items) => {
    events.push(...items);
    applyEventCounters(semanticCounters, items);
    for (const event of items) increment(eventTypeCounts, event.type);
  };
  const matchId = createMatchId({ ...config, profileId, seatOrder, policyIds });
  const provenance = createRunProvenance({
    runId: config.runId ?? `RUN-${matchId}`,
    matchId, labVersion: LAB_VERSION, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION,
    profileId, capabilityManifestHash: config.capabilityManifestHash ?? 'runtime-capability-manifest',
    analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION, seed: setup.seed,
    policyIdsBySeat: Object.fromEntries(policyIds.map((id, index) => [String(index + 1), id])),
    workerCount: config.workerCount ?? 1, authorizedScope: config.authorizedScope ?? 'omniscient'
  });

  // Pending causality ledger: tracks the previous declaration's fact ID so that
  // deferred stack resolution (which happens in the NEXT frame) is attributed to
  // the declaration that caused it, not to whichever player receives the next
  // decision frame.
  let pendingCausality = null;

  for (let decisionIndex = 0; decisionIndex < decisionLimit; decisionIndex += 1) {
    // Capture pre-frame state for deferred-resolution attribution. The frame may
    // resolve the stack (moving cards to PR/ER), which is a consequence of the
    // PREVIOUS decision's declaration. That resolution delta must be credited to
    // the originating declaration, not to the current decision.
    const preFrameState = captureFacts ? structuredClone(state) : null;
    const preFrameScores = captureFacts ? pointsByPlayer(state, seatOrder) : null;
    const frame = createSimulationDecisionFrame(state);
    state = frame.state;
    commands.push(...frame.executedCommands);
    captureEvents(frame.events);

    // ── Causal boundary: attribute frame/orchestration transitions (stack
    // resolution, automatic priority advancement) to the PREVIOUS declaration. ──
    if (captureFacts && pendingCausality) {
      attributeDeferredResolution({ pendingCausality, preFrameState, preFrameScores, state, frame, matchId, seatOrder, facts, rankDecisions });
    }

    if (frame.status === 'TERMINAL') {
      terminationReason = frame.reasonCode === 'CANONICAL_DRAW' ? 'CANONICAL_DRAW' : frame.reasonCode === 'EXHAUSTED_RESOLUTION' ? 'EXHAUSTED_RESOLUTION' : 'NORMAL_VICTORY';
      // Clear pending causality — terminal flush is a non-decision transition.
      pendingCausality = null;
      break;
    }
    if (frame.status !== 'PLAYER_DECISION_REQUIRED') {
      terminationReason = 'UNSUPPORTED_CONFIGURATION'; errorCode = frame.reasonCode ?? 'UNKNOWN'; break;
    }
    if (!frame.policyActions.length) {
      terminationReason = 'UNSUPPORTED_CONFIGURATION'; errorCode = 'EMPTY_POLICY_FRAME'; break;
    }

    // ── Legal opportunity counting at the authoritative legality boundary ──
    // For each decision frame, collect the set of unique mechanic tags across
    // ALL legal actions. Each unique tag gets ONE opportunity count per frame
    // (not one per legal action), representing a distinct decision window in
    // which the mechanic was legally available to the acting player.
    {
      const opportunitySeatIndex = seatOrder.indexOf(frame.decisionActorId);
      if (opportunitySeatIndex >= 0) {
        const ps = perSeat[opportunitySeatIndex];
        const frameTags = new Set();
        const framePrimaryTags = new Set();
        for (const legalAction of frame.policyActions) {
          for (const tag of mechanicTags(legalAction)) frameTags.add(tag);
          const pt = primaryMechanicTag(legalAction);
          if (pt) framePrimaryTags.add(pt);
        }
        for (const tag of frameTags) { increment(ps.mechanicOpportunityCounts, tag); increment(mechanicOpportunityCounts, tag); }
        for (const tag of framePrimaryTags) { increment(ps.primaryMechanicOpportunityCounts, tag); increment(primaryMechanicOpportunityCounts, tag); }
      }
    }

    // Capture post-frame state — the baseline for the CURRENT action's delta.
    const postFrameState = captureFacts ? structuredClone(state) : null;
    const postFrameScores = captureFacts ? pointsByPlayer(state, seatOrder) : null;
    const actorId = frame.decisionActorId;
    const seatIndex = seatOrder.indexOf(actorId);
    const policy = POLICY_BY_ID[policyIds[seatIndex]];
    if (!policy) { terminationReason = 'POLICY_ERROR'; errorCode = `UNKNOWN_POLICY:${policyIds[seatIndex]}`; break; }
    const authorizedView = strictPolicyView(state, actorId);
    const rng = policyRngByPlayer[actorId];
    const rngCursorBefore = rng.cursor;
    let selected;
    try {
      selected = validateDecision(policy.choose({ matchId, runInstanceId, decisionIndex, actorId, authorizedView, legalActions: frame.policyActions, rng, traits: policy.traits }), frame.policyActions);
    } catch (error) {
      terminationReason = 'POLICY_ERROR'; errorCode = error.code ?? 'POLICY_THROW'; break;
    }
    const selectedAction = frame.policyActions.find((action) => action.actionId === selected.actionId);
    const command = frame.resolve(selected.actionId);
    const targetStackItem = state.stack?.at(-1) ?? null;
    const targetControllerId = targetStackItem?.controllerId ?? null;
    const targetStackClass = targetStackItem?.coreAuthority?.stackClass ?? null;
    const targetSourceCount = targetStackItem?.sourceCardIds?.length ?? 0;
    const targetUntappedQueenDefenders = targetControllerId ? countUntappedQueens(state, targetControllerId) : 0;
    const beforePhase = state.phase;
    const beforeStateHash = authorityHashCanonical(state);
    const result = executeSimulationAction(state, command);
    commands.push(command); captureEvents(result.events);
    if (!result.accepted) { terminationReason = 'ENGINE_REJECTION'; errorCode = result.error?.code ?? 'UNKNOWN'; break; }

    const checkpointId = `${matchId}:D${decisionIndex}`;

    // Capture rank attribution for this decision (use pre-execution state for card access)
    const rankAttribution = attributeAction(state, selectedAction, 'private');
    const { rankOppMap, variantOppMap } = buildRankOpportunityMaps(frame.policyActions, state);
    rankDecisions.push({ checkpointId, participantId: actorId, decisionIndex, rankAttribution, rankOpportunities: Object.values(rankOppMap), variantOpportunities: Object.values(variantOppMap), action: { family: selectedAction.family, mode: selectedAction.mode, kind: selectedAction.kind, authority: selectedAction.authority, timingClass: selectedAction.timingClass }, legalActions: frame.policyActions.map(pa => ({ actionId: pa.actionId, family: pa.family, mode: pa.mode, kind: pa.kind })) });

    state = result.state;

    applyDecisionCounters(semanticCounters, selectedAction, frame.policyActions);
    const ps = perSeat[seatIndex];
    ps.policyDecisionCount += 1;
    if (isMeaningfulResponseFrame(frame.policyActions)) ps.responseOpportunityCount += 1;
    if (selectedAction.family === 'response-decline') { ps.responseDeclinedCount += 1; ps.meaningfulResponseDecisionCount += 1; }
    else { ps.policyActionCount += 1; if (RESPONSE_FAMILIES.has(selectedAction.family) || ['INSTANT','QUICK','INTERRUPT'].includes(selectedAction.timingClass)) { ps.responsePlayedCount += 1; ps.meaningfulResponseDecisionCount += 1; } }
    if (isMiniTurnAction(selectedAction)) { ps.miniTurnActionCount += 1; ps.actionCount += 1; ps.miniTurnCount += 1; if (selectedAction.family === 'exhausted-pass') { ps.exhaustedPassActionCount += 1; ps.passActionCount += 1; } }
    if (selectedAction.family === 'counter') ps.counterDeclarationCount += 1;
    if (selectedAction.timingClass === 'QUICK') ps.quickDeclarationCount += 1;
    if (selectedAction.timingClass === 'INSTANT') ps.instantDeclarationCount += 1;
    if (selectedAction.timingClass === 'INTERRUPT') ps.interruptDeclarationCount += 1;
    increment(ps.decisionFamilyCounts, selectedAction.family);
    const selectedMechanicTags = mechanicTags(selectedAction);
    const selectedPrimaryMechanic = primaryMechanicTag(selectedAction);
    for (const tag of selectedMechanicTags) increment(ps.mechanicCounts, tag);
    if (selectedPrimaryMechanic) increment(ps.primaryMechanicCounts, selectedPrimaryMechanic);
    increment(decisionFamilyCounts, selectedAction.family);
    increment(decisionModeCounts, `${selectedAction.family}:${selectedAction.mode}`);
    if (isMiniTurnAction(selectedAction)) {
      increment(actionCounts, selectedAction.family);
      increment(actionModeCounts, `${selectedAction.family}:${selectedAction.mode}`);
    }
    if (RESPONSE_FAMILIES.has(selectedAction.family) || selectedAction.family === 'response-decline') increment(responseActionCounts, `${selectedAction.family}:${selectedAction.mode}`);
    increment(timingClassCounts, selectedAction.timingClass);
    for (const tag of selectedMechanicTags) increment(mechanicCounts, tag);
    if (selectedPrimaryMechanic) increment(primaryMechanicCounts, selectedPrimaryMechanic);

    const policyScores = Object.fromEntries((selected.metadata.candidateScores ?? []).map((entry) => [entry.actionId, entry.score]));
    const decisionFact = createDecisionFact({
      matchId, checkpointId, turn: state.fullTurnSequence, phase: beforePhase, actorId,
      action: selectedAction, legalActions: frame.policyActions, policyScores,
      engineCommandId: command.id, engineEventIds: result.events.map((event) => event.id), visibility: 'authorized'
    });
    if (captureFacts) {
      // Causal boundary: the current action's delta spans from postFrameState
      // (after stack resolution) to the post-action state. This ensures the
      // current decision receives ONLY the delta it caused, not the deferred
      // resolution of the previous declaration.
      const stateDelta = createStateDeltaFact({ matchId, checkpointId, before: postFrameState, after: state, securedBefore: postFrameScores, securedAfter: pointsByPlayer(state, seatOrder) });
      const causalChainId = `CC-${hashCanonical({ matchId, decisionIndex, command: command.id }).slice(0, 18)}`;
      const resolutionFact = createResolutionFact({
        declarationFactId: decisionFact.factId, mechanicTags: selectedMechanicTags,
        sourceEntityIds: selectedAction.sourceHandles ?? [], targetEntityIds: selectedAction.targetHandles ?? [],
        outcome: resolutionOutcome(result), stateDeltaId: stateDelta.factId,
        causalChainId,
        engineEventIds: result.events.map((event) => event.id)
      });
      facts.decisionFacts.push(decisionFact);
      facts.resolutionFacts.push(resolutionFact);
      facts.stateDeltaFacts.push(stateDelta);
      facts.causalEdges.push(...createCausalEdges(decisionFact, resolutionFact, stateDelta));
      // Attach stateDelta to the rankDecisions entry so rank analytics can attribute
      // secured-point and board-presence contributions per rank (scorePower/boardPower axes).
      const lastRankDecision = rankDecisions[rankDecisions.length - 1];
      if (lastRankDecision) {
        lastRankDecision.stateDelta = mergeRankStateDelta(lastRankDecision.stateDelta, {
          securedPointDeltaByPlayer: stateDelta.securedPointDeltaByPlayer,
          boardPresenceDeltaByPlayer: stateDelta.boardPresenceDeltaByPlayer,
          attributionStatus: 'observed',
          causedByDeclarationFactId: decisionFact.factId,
          deferredResolution: false
        });
      }
      // Update pending causality: the current declaration may have deferred
      // resolution (stack items that resolve in the next frame). Track its
      // identity so the next iteration can credit any frame-resolution delta
      // to this declaration rather than to the next decision.
      pendingCausality = {
        declarationFactId: decisionFact.factId,
        checkpointId,
        actorId,
        mechanicTags: selectedMechanicTags,
        sourceEntityIds: selectedAction.sourceHandles ?? [],
        targetEntityIds: selectedAction.targetHandles ?? [],
        causalChainId
      };
    } else {
      pendingCausality = null;
    }

    decisions.push({
      schemaVersion: TELEMETRY_SCHEMA_VERSION, matchId, decisionIndex, checkpointId, factId: decisionFact.factId,
      actorId, policyId: policy.policyId, policyVersion: policy.version, policyHash: policy.policyHash,
      semanticClass: semanticClassForAction(selectedAction), consumedMiniTurn: decisionFact.consumedMiniTurn,
      hadLawfulResponse: decisionFact.hadLawfulResponse, createdSkip: decisionFact.createdSkip,
      activePlayerId: authorizedView.activePlayerId,
      targetControllerId,
      targetStackClass,
      targetSourceCount,
      targetUntappedQueenDefenders,
      authorizedViewHash: hashCanonical(authorizedView), legalActionCount: frame.policyActions.length,
      legalActionSetHash: hashCanonical(frame.policyActions.map((action) => action.actionId).sort()),
      actionId: selected.actionId, family: selectedAction.family, mode: selectedAction.mode, timingClass: selectedAction.timingClass,
      engineCommandHash: authorityHashCanonical(command), frameHash: frame.legalActionFrame.frameHash,
      beforeStateHash, afterStateHash: authorityHashCanonical(state), rngCursorBefore, rngCursorAfter: rng.cursor,
      reasonCode: selected.metadata.reasonCode, candidateScores: selected.metadata.candidateScores ?? [],
      hybrixTrace: selected.metadata.hybrixTrace ?? null,
      selectionMetadata: selected.metadata
    });

    if (captureTraces) {
      const traceContext = buildDecisionTraceContext(authorizedView, state, beforePhase, actorId);
      const top = traceContext.response.top;
      const trace = createDecisionTrace({
        matchId,
        decisionIndex,
        checkpointHash: beforeStateHash.slice(0, 16),
        fullCheckpointHash: beforeStateHash,
        seat: seatIndex + 1,
        policyId: policy.policyId,
        policyVersion: policy.version,
        policyHash: policy.policyHash,
        action: selectedAction,
        legalActions: frame.policyActions,
        context: traceContext,
        turn: state.fullTurnSequence,
        phase: beforePhase,
        authorizedContextHash: hashCanonical(authorizedView).slice(0, 16),
        ownItemOnTop: Boolean(top && top.controllerId === actorId),
        candidateScores: selected.metadata.candidateScores ?? [],
        selectionMetadata: selected.metadata,
        evidence: {
          actorId,
          activePlayerId: authorizedView.activePlayerId,
          targetStackClass,
          targetSourceCount,
          consumedMiniTurn: decisionFact.consumedMiniTurn ?? null,
          skipCreated: decisionFact.createdSkip ?? null,
          exhaustedActive: Boolean(state.exhausted) || null,
          drawPileEmpty: (state.drawPile !== undefined ? state.drawPile.length === 0 : null)
        }
      });
      decisionTraces.push(trace);
    }
  }

  if (terminationReason === 'DECISION_LIMIT' && state.winner !== null) terminationReason = 'NORMAL_VICTORY';
  const finalScores = pointsByPlayer(state, seatOrder);
  const participants = seatOrder.map((playerId, seatIndex) => {
    const ps = perSeat[seatIndex];
    const isWinner = state.winner === playerId;
    const isDraw = terminationReason === 'CANONICAL_DRAW';
    const isAborted = !COMPLETE_REASONS.has(terminationReason);
    return { participantId:`${matchId}:seat-${seatIndex+1}`, matchId, seat:seatIndex+1, playerId, policyId:policyIds[seatIndex], profileId, result:isAborted?'abort':isDraw?'draw':isWinner?'win':'loss', scoreFor:finalScores[playerId], scoreAgainst:finalScores[seatOrder[1-seatIndex]], decisionCount:ps.policyDecisionCount, responseOpportunityCount:ps.responseOpportunityCount, responsePlayCount:ps.responsePlayedCount, responseDeclineCount:ps.responseDeclinedCount, miniTurnActionCount:ps.miniTurnActionCount, exhaustedPassActionCount:ps.exhaustedPassActionCount, counterDeclarationCount:ps.counterDeclarationCount, quickDeclarationCount:ps.quickDeclarationCount, instantDeclarationCount:ps.instantDeclarationCount, interruptDeclarationCount:ps.interruptDeclarationCount, meaningfulResponseDecisionCount:ps.meaningfulResponseDecisionCount, advancedDecisionCount:countFamilies(ps.decisionFamilyCounts,ADVANCED_FAMILIES), voltageDecisionCount:ps.decisionFamilyCounts.voltage??0, ultraDecisionCount:ps.decisionFamilyCounts.ultra??0, privateChoiceDecisionCount:ps.decisionFamilyCounts['private-choice']??0, mechanicCounts:Object.fromEntries(Object.entries(ps.mechanicCounts).sort()), primaryMechanicCounts:Object.fromEntries(Object.entries(ps.primaryMechanicCounts).sort()), mechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.mechanicOpportunityCounts).sort()), primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.primaryMechanicOpportunityCounts).sort()) };
  });
  const privateChoiceDecisionCount = decisionFamilyCounts['private-choice'] ?? 0;
  const advancedDecisionCount = countFamilies(decisionFamilyCounts, ADVANCED_FAMILIES);
  const voltageDecisionCount = decisionFamilyCounts.voltage ?? 0;
  const ultraDecisionCount = decisionFamilyCounts.ultra ?? 0;
  const triggerCount = Object.entries(eventTypeCounts).filter(([type]) => type.includes('TRIGGER') || type.includes('VOLTAGE')).reduce((sum, [, count]) => sum + count, 0);
  const ruleCompliance = buildRuleCompliance({ decisions, events, state });
  const summaryCore = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION, analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION,
    matchId, matchOrdinal: config.ordinal ?? 0, seed: setup.seed, profileId, seatOrder, policyIds,
    pairedRunId: config.pairedRunId ?? null, seatSwapped: config.seatSwapped ?? false,
    engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION, labVersion: LAB_VERSION, replayDataVersion: REPLAY_DATA_VERSION, provenanceHash: provenance.provenanceHash,
    winner: state.winner ?? (terminationReason === 'CANONICAL_DRAW' ? 'DRAW' : 'ABORTED'), winningSeat: state.winner ? seatOrder.indexOf(state.winner) + 1 : null,
    terminationReason, completedFullTurns: Math.max(0, state.fullTurnSequence - 1),
    ...semanticCounters,
    responseDecisionCount: semanticCounters.meaningfulResponseDecisionCount,
    privateChoiceDecisionCount, advancedDecisionCount, voltageDecisionCount, ultraDecisionCount, triggerCount,
    commandCount: commands.length, acceptedCommandCount: commands.length - (terminationReason === 'ENGINE_REJECTION' ? 1 : 0), eventCount: events.length,
    finalScores, scoreMargin: Math.abs(finalScores[seatOrder[0]] - finalScores[seatOrder[1]]), finalStateHash: authorityHashCanonical(state),
    participants,
    actionCounts: Object.fromEntries(Object.entries(actionCounts).sort()),
    decisionFamilyCounts: Object.fromEntries(Object.entries(decisionFamilyCounts).sort()),
    actionModeCounts: Object.fromEntries(Object.entries(actionModeCounts).sort()),
    decisionModeCounts: Object.fromEntries(Object.entries(decisionModeCounts).sort()),
    responseActionCounts: Object.fromEntries(Object.entries(responseActionCounts).sort()),
    timingClassCounts: Object.fromEntries(Object.entries(timingClassCounts).sort()),
    eventTypeCounts: Object.fromEntries(Object.entries(eventTypeCounts).sort()),
    mechanicCounts: Object.fromEntries(Object.entries(mechanicCounts).sort()),
    primaryMechanicCounts: Object.fromEntries(Object.entries(primaryMechanicCounts).sort()),
    mechanicOpportunityCounts: Object.fromEntries(Object.entries(mechanicOpportunityCounts).sort()),
    primaryMechanicOpportunityCounts: Object.fromEntries(Object.entries(primaryMechanicOpportunityCounts).sort()),
    ruleCompliance, errorCode
  };
  const { provenanceHash: _executionProvenanceHash, labVersion: _labVersion, mechanicOpportunityCounts: _mechOppCounts, primaryMechanicOpportunityCounts: _primaryMechOppCounts, ...semanticResultCore } = summaryCore;
  // Also strip labVersion and per-participant opportunity counts from the hash.
  // labVersion is a packaging label that bumps on every release (including UI/doc-only
  // changes) regardless of whether the engine changed; engineVersion and rulesVersion
  // already capture semantic identity. Including labVersion would invalidate every
  // stored matchResultHash on each version bump. Opportunity counts are diagnostic
  // telemetry that can vary with legal-action enumeration order, not core match results.
  const hashInput = {
    ...semanticResultCore,
    participants: semanticResultCore.participants.map(p => {
      const { mechanicOpportunityCounts: _m, primaryMechanicOpportunityCounts: _pm, ...rest } = p;
      return rest;
    }),
  };
  const summary = { ...summaryCore, matchResultHash: hashCanonical(hashInput), rankDecisions };
  const base = { summary, decisions, facts, provenance };
  if (captureTraces) base.decisionTraces = decisionTraces;
  if (!config.includeReplay) return base;
  const replay = createAuthorityCertifiedReplay(matchId, initialState, commands, ENGINE_VERSION);
  const verified = verifyAuthorityCertifiedReplay(replay);
  if (authorityHashCanonical(verified.state) !== summary.finalStateHash) throw new Error('AUTHORITY_REPLAY_FINAL_HASH_MISMATCH');
  return { ...base, summary: { ...summary, replayHash: replay.contentHash }, replay };
}

export function deriveMatchSeed(experimentHash, ordinal) { return uint32FromHash({ experimentHash, ordinal }); }
export const isCanonicalTermination = (reason) => COMPLETE_REASONS.has(reason);
