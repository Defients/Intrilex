import { hashCanonical } from '@intrilex/shared';

export const TELEMETRY_SCHEMA_VERSION = '4.1.0';
export const DEFAULT_LAB_VERSION = '0.10.1';
export const SEMANTIC_CLASSES = Object.freeze([
  'mini-turn-action',
  'free-response-play',
  'response-decline',
  'engine-orchestration',
  'trigger',
  'private-choice',
  'phase-transition',
  'invariant'
]);

const RESPONSE_FAMILIES = new Set(['counter', 'disrupt', 'interrupt', 'instant', 'quick']);
const MINI_TURN_FAMILIES = new Set([
  'draw','score','play-for-points','scuttle','swap-bar','effect-three','effect-four','effect-five','effect-six','effect-seven',
  'effect-nine','effect-red-joker','effect-board-lock','effect-row-clear','effect-tap','effect-goal-shift','effect-jack-control',
  'effect-private-choice','anchor','anchor-guard','anchor-private-choice','attachment','royal-marriage','super','rank10','ultra','exhausted-pass'
]);

export function semanticClassForAction(action) {
  if (!action) return 'invariant';
  if (action.family === 'response-decline') return 'response-decline';
  if (action.family === 'private-choice') return 'private-choice';
  if (action.family === 'phase') return 'phase-transition';
  if (RESPONSE_FAMILIES.has(action.family) || ['INSTANT','QUICK','INTERRUPT'].includes(action.timingClass)) return 'free-response-play';
  if (MINI_TURN_FAMILIES.has(action.family) || action.timingClass === 'ACTION') return 'mini-turn-action';
  return 'mini-turn-action';
}

export function isMeaningfulResponseFrame(actions = []) {
  const hasDecline = actions.some((action) => action.family === 'response-decline');
  const real = actions.filter((action) => action.family !== 'response-decline');
  return hasDecline && real.length > 0;
}

export function isMiniTurnAction(action) {
  return semanticClassForAction(action) === 'mini-turn-action' && action.family !== 'phase';
}

export function semanticEventClass(event) {
  const type = String(event?.type ?? '');
  if (/AUTOMATIC_PRIORITY_ADVANCE|RESPONSE_WINDOW_CLOSED/.test(type)) return 'engine-orchestration';
  if (/RESPONSE_DECLINED/.test(type)) return 'response-decline';
  if (/TRIGGER|VOLTAGE/.test(type)) return 'trigger';
  if (/PRIVATE_CHOICE|CHOICE_/.test(type)) return 'private-choice';
  if (/PHASE|TURN_|ACTION_PHASE|FULL_TURN/.test(type)) return 'phase-transition';
  if (/REJECT|INVALID|INVARIANT|ERROR/.test(type)) return 'invariant';
  return null;
}

export function emptySemanticCounters() {
  return {
    miniTurnActionCount: 0,
    exhaustedPassActionCount: 0,
    responseOpportunityCount: 0,
    responsePlayedCount: 0,
    responseDeclinedWithOptionsCount: 0,
    automaticPriorityAdvanceCount: 0,
    responseWindowClosedCount: 0,
    counterDeclarationCount: 0,
    quickDeclarationCount: 0,
    instantDeclarationCount: 0,
    interruptDeclarationCount: 0,
    policyDecisionCount: 0,
    policyActionCount: 0,
    actionCount: 0,
    passActionCount: 0,
    miniTurnCount: 0,
    meaningfulResponseDecisionCount: 0,
    automaticOrchestrationCommandCount: 0
  };
}

export function applyEventCounters(counters, events = []) {
  for (const event of events) {
    const type = String(event.type ?? '');
    if (/AUTOMATIC_PRIORITY_ADVANCE/.test(type)) {
      counters.automaticPriorityAdvanceCount += 1;
      counters.automaticOrchestrationCommandCount += 1;
    }
    if (/RESPONSE_WINDOW_CLOSED/.test(type)) counters.responseWindowClosedCount += 1;
  }
  return counters;
}

export function applyDecisionCounters(counters, action, legalActions = []) {
  const semanticClass = semanticClassForAction(action);
  counters.policyDecisionCount += 1;
  if (isMeaningfulResponseFrame(legalActions)) counters.responseOpportunityCount += 1;
  if (semanticClass === 'response-decline') {
    counters.responseDeclinedWithOptionsCount += 1;
    counters.meaningfulResponseDecisionCount += 1;
    return counters;
  }
  counters.policyActionCount += 1;
  if (semanticClass === 'free-response-play') {
    counters.responsePlayedCount += 1;
    counters.meaningfulResponseDecisionCount += 1;
  }
  if (isMiniTurnAction(action)) {
    counters.miniTurnActionCount += 1;
    counters.actionCount += 1;
    counters.miniTurnCount += 1;
    if (action.family === 'exhausted-pass') {
      counters.exhaustedPassActionCount += 1;
      counters.passActionCount += 1;
    }
  }
  if (action.family === 'counter') counters.counterDeclarationCount += 1;
  if (action.timingClass === 'QUICK') counters.quickDeclarationCount += 1;
  if (action.timingClass === 'INSTANT') counters.instantDeclarationCount += 1;
  if (action.timingClass === 'INTERRUPT') counters.interruptDeclarationCount += 1;
  return counters;
}

export function createRunProvenance(input) {
  const value = {
    runId: input.runId,
    matchId: input.matchId,
    labVersion: input.labVersion ?? DEFAULT_LAB_VERSION,
    engineVersion: input.engineVersion,
    rulesVersion: input.rulesVersion,
    profileId: input.profileId,
    capabilityManifestHash: input.capabilityManifestHash ?? 'runtime-unbound',
    telemetrySchemaVersion: TELEMETRY_SCHEMA_VERSION,
    analyticsSchemaVersion: input.analyticsSchemaVersion ?? '4.0.0',
    replayFormatVersion: input.replayFormatVersion ?? 2,
    seed: String(input.seed),
    policyIdsBySeat: input.policyIdsBySeat,
    workerCount: input.workerCount ?? 1,
    authorizedScope: input.authorizedScope ?? 'omniscient'
  };
  const errors = validateProvenanceShape(value);
  if (errors.length > 0) {
    throw new Error(`createRunProvenance: schema validation failed:\n${errors.join('\n')}`);
  }
  return Object.freeze({ ...value, provenanceHash: hashCanonical(value) });
}

/**
 * Runtime validation of run provenance against schemas/run-provenance.schema.json.
 * Checks required fields (15) and authorizedScope enum.
 * @param {object} value - The provenance record (without provenanceHash)
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateProvenanceShape(value) {
  const errors = [];
  const required = ['runId','matchId','labVersion','engineVersion','rulesVersion','profileId','capabilityManifestHash','telemetrySchemaVersion','analyticsSchemaVersion','replayFormatVersion','seed','policyIdsBySeat','workerCount','authorizedScope'];
  for (const field of required) {
    if (value[field] === undefined || value[field] === null) {
      errors.push(`  missing required property "${field}"`);
    }
  }
  const validScopes = ['public', 'player', 'omniscient'];
  if (value.authorizedScope && !validScopes.includes(value.authorizedScope)) {
    errors.push(`  authorizedScope "${value.authorizedScope}" not in enum [${validScopes.join(', ')}]`);
  }
  return errors;
}

function zoneCounts(state, playerId) {
  const player = state.players?.[playerId] ?? {};
  return {
    hand: player.hand?.length ?? 0,
    pr: player.pr?.length ?? 0,
    er: player.er?.length ?? 0
  };
}

export function createStateDeltaFact({ matchId, checkpointId, before, after, securedBefore, securedAfter }) {
  const players = after.turnOrder ?? Object.keys(after.players ?? {});
  const securedPointDeltaByPlayer = {};
  const goalDeltaByPlayer = {};
  const handDeltaByPlayer = {};
  const boardPresenceDeltaByPlayer = {};
  const miniTurnDeltaByPlayer = {};
  for (const id of players) {
    const a = zoneCounts(after, id), b = zoneCounts(before, id);
    securedPointDeltaByPlayer[id] = Number(securedAfter?.[id] ?? 0) - Number(securedBefore?.[id] ?? 0);
    goalDeltaByPlayer[id] = Number(after.players?.[id]?.goal ?? 0) - Number(before.players?.[id]?.goal ?? 0);
    handDeltaByPlayer[id] = a.hand - b.hand;
    boardPresenceDeltaByPlayer[id] = (a.pr + a.er) - (b.pr + b.er);
    miniTurnDeltaByPlayer[id] = Number(after.players?.[id]?.limits?.miniTurnsRemaining ?? 0) - Number(before.players?.[id]?.limits?.miniTurnsRemaining ?? 0);
  }
  const cardsMovedByZonePair = {};
  let controllerChanges = 0;
  for (const [id, cardAfter] of Object.entries(after.cards ?? {})) {
    const cardBefore = before.cards?.[id];
    if (!cardBefore) continue;
    if (cardBefore.zone !== cardAfter.zone) {
      const key = `${cardBefore.zone}->${cardAfter.zone}`;
      cardsMovedByZonePair[key] = (cardsMovedByZonePair[key] ?? 0) + 1;
    }
    if (cardBefore.controllerId !== cardAfter.controllerId) controllerChanges += 1;
  }
  const core = {
    matchId, checkpointId,
    securedPointDeltaByPlayer, goalDeltaByPlayer, handDeltaByPlayer,
    boardPresenceDeltaByPlayer, miniTurnDeltaByPlayer, controllerChanges,
    cardsMovedByZonePair: Object.fromEntries(Object.entries(cardsMovedByZonePair).sort())
  };
  return { factId: `SD-${hashCanonical(core).slice(0, 20)}`, ...core };
}

export function createDecisionFact(input) {
  const action = input.action;
  const semanticClass = semanticClassForAction(action);
  const core = {
    matchId: input.matchId,
    checkpointId: input.checkpointId,
    turn: input.turn,
    phase: input.phase,
    actorId: input.actorId,
    semanticClass,
    legalOptionIds: input.legalActions.map((entry) => entry.actionId),
    chosenOptionId: action?.actionId,
    policyScores: input.policyScores ?? {},
    hadLawfulResponse: isMeaningfulResponseFrame(input.legalActions),
    consumedMiniTurn: isMiniTurnAction(action),
    createdSkip: Boolean(input.createdSkip),
    engineCommandId: input.engineCommandId,
    engineEventIds: input.engineEventIds ?? [],
    visibility: input.visibility ?? 'authorized'
  };
  return { factId: `DF-${hashCanonical(core).slice(0, 20)}`, ...core };
}

export function createResolutionFact(input) {
  const core = {
    declarationFactId: input.declarationFactId,
    mechanicTags: [...new Set(input.mechanicTags ?? [])].sort(),
    sourceEntityIds: [...(input.sourceEntityIds ?? [])],
    targetEntityIds: [...(input.targetEntityIds ?? [])],
    outcome: input.outcome,
    stateDeltaId: input.stateDeltaId,
    causalChainId: input.causalChainId,
    engineEventIds: input.engineEventIds ?? []
  };
  return { factId: `RF-${hashCanonical(core).slice(0, 20)}`, ...core };
}

export function createCausalEdges(decisionFact, resolutionFact, stateDeltaFact) {
  return [
    { fromFactId: decisionFact.factId, toFactId: resolutionFact.factId, relation: 'declared' },
    { fromFactId: resolutionFact.factId, toFactId: stateDeltaFact.factId, relation: 'caused-state-delta' }
  ];
}

