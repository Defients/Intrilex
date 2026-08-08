import { hashCanonical } from '@intrilex/shared';
import { REASON_CODE_VERSION,  reasonCodeVocabularyHash,  validateReasonCodes } from './reason-codes.mjs';
import { MECHANIC_REGISTRY_VERSION,   mechanicRegistryHash,   resolveMechanicId,   mechanicDisplayName} from './mechanic-registry.mjs';

export const DECISION_TRACE_SCHEMA_VERSION = '2.0.0';

const RESPONSE_FAMILIES = new Set(['counter', 'disrupt', 'interrupt', 'instant', 'quick']);
const ADVANCED_FAMILIES = new Set(['royal-marriage', 'super', 'rank10', 'ultra', 'voltage']);

function stableHash(value) {
  return hashCanonical(value).slice(0, 16);
}

function classifyDecisionKind(action, legalActions) {
  if (action.family === 'private-choice') return 'PRIVATE_CHOICE';
  if (action.family === 'response-decline' || RESPONSE_FAMILIES.has(action.family) || ['INSTANT', 'QUICK', 'INTERRUPT'].includes(action.timingClass)) return 'RESPONSE';
  return 'MINI_TURN';
}

function deriveReasonCodes(policyId, action, context, scoreComponents) {
  const codes = [];
  const family = action.family;
  const response = context.response ?? {};

  if (family === 'play-for-points' || family === 'score') {
    if (scoreComponents.terminal > 0) codes.push('WIN_PRESSURE_SCORE');
    else codes.push('MAX_SCORE_PRESSURE');
  }
  if (family === 'response-decline') {
    if (response.ownTop) codes.push('DECLINE_OWN_TOP');
    else codes.push('DECLINE_WITH_OPTIONS');
    codes.push('PRESERVE_RESPONSE');
  }
  if (family === 'counter') {
    if (response.opponentRoot) codes.push('COUNTER_OPPONENT_ROOT');
    else if (response.opponentTop) codes.push('COUNTER_OPPONENT_TOP');
  }
  if (family === 'disrupt' || family === 'scuttle') {
    codes.push('BOARD_CONTROL_GAIN');
  }
  if (family === 'draw') {
    codes.push('HAND_REFILL');
  }
  if (family === 'exhausted-pass') {
    codes.push('EXHAUSTED_FORCED');
  }
  if (ADVANCED_FAMILIES.has(family)) {
    if (family === 'ultra' || family === 'voltage') codes.push('ADVANCED_ULTIMATE');
    else if (family === 'rank10') codes.push('ADVANCED_BOARD_LOCK');
    else codes.push('ADVANCED_UTILITY');
  }
  if (family === 'anchor' || family === 'anchor-guard') {
    codes.push('ANCHOR_SETUP');
  }
  if (family.startsWith('effect-')) {
    if (scoreComponents.points > 0) codes.push('EFFECT_GOAL_PROGRESS');
    else codes.push('EFFECT_UTILITY');
  }
  if (family === 'swap-bar') {
    codes.push('SWAP_BAR_VALUE');
  }

  if (codes.length === 0) {
    if (policyId === 'tempo') codes.push('MAX_TEMPO');
    else if (policyId === 'control') codes.push('MAX_BOARD_AND_RESPONSE_CONTROL');
    else if (policyId === 'value') codes.push('MAX_EXPECTED_VALUE');
    else if (policyId === 'score-rush') codes.push('MAX_SCORE_PRESSURE');
    else codes.push('UNIFORM_RANDOM');
  }

  return [...new Set(codes)].sort();
}

function computeScoreComponents(policyId, action, context, rawScore) {
  const fv = action.featureVector ?? {};
  const response = context.response ?? {};
  const terminal = (action.family === 'play-for-points' || action.family === 'score') && (Number(fv.immediateScore ?? fv.immediatePoints ?? 0) + (context.own?.securedPoints ?? 0) >= (context.own?.goal ?? Infinity)) ? 1 : 0;
  const points = Number(fv.immediateScore ?? fv.immediatePoints ?? 0);
  const resource = (action.family === 'draw' ? 1 : 0) + (action.family === 'swap-bar' ? 1 : 0) + (action.family === 'effect-six' ? 1 : 0);
  const tempo = (action.family === 'tempo' || action.timingClass === 'QUICK') ? 1 : 0;
  const defense = (action.family === 'anchor' || action.family === 'anchor-guard' || action.family === 'effect-nine') ? 1 : 0;
  const synergy = Number(fv.anchorValue ?? 0) > 0 ? 0.25 : 0;
  const risk = (action.family === 'counter' && response.ownTop) ? 1 : 0;
  return { terminal, points, resource, tempo, defense, synergy, risk };
}

function reconcileScore(components) {
  return components.terminal * 1000 + components.points * 30 + components.resource * 50 + components.tempo * 20 + components.defense * 40 + components.synergy * 100 - components.risk * 200;
}

function buildLegalOption(action, context, scoreComponents, reasonCodes, actualScore) {
  const mechanicId = resolveMechanicId(action.family, action.mode);
  const isPolicyScored = actualScore !== undefined;
  const reconstructedTotal = reconcileScore(scoreComponents);
  // When the policy provides an actual score, the trace carries BOTH:
  //   - the authoritative policy score (scoreSource='policy', actualTotal)
  //   - the reconstructed causal decomposition (scoreComponents)
  // actualContributions carries the reconstructed components so the trace is
  // not causally opaque. The policy score is the total; the components are the
  // best available causal decomposition. A residual field discloses any gap
  // between the policy total and the reconstructed total, so the trace is
  // honest about what is known and what is reconstructed.
  const residual = isPolicyScored ? Number((actualScore - reconstructedTotal).toFixed(2)) : null;
  return {
    actionId: action.actionId,
    displayLabel: buildDisplayLabel(action),
    family: action.family,
    mechanicIds: mechanicId ? [mechanicId] : [],
    score: isPolicyScored ? actualScore : reconstructedTotal,
    scoreComponents,
    scoreSource: isPolicyScored ? 'policy' : 'reconstructed',
    actualContributions: isPolicyScored ? scoreComponents : undefined,
    actualTotal: isPolicyScored ? actualScore : undefined,
    residual: isPolicyScored ? residual : undefined,
    reasonCodes
  };
}

function buildDisplayLabel(action) {
  const family = action.family;
  const mode = action.mode;
  const mechanicId = resolveMechanicId(family, mode);
  const baseName = mechanicDisplayName(mechanicId ?? family);
  if (mode && mode !== family) return `${baseName} (${mode})`;
  return baseName;
}

function buildRuleAudit(action, legalActions, context, evidence) {
  const checks = [];
  const ev = evidence ?? {};
  const actorId = ev.actorId ?? null;
  const activePlayerId = context.activePlayerId ?? null;

  checks.push({
    checkId: 'no-ordinary-pass',
    status: legalActions.some(a => a.family === 'pass') ? 'FAIL' : 'NOT_APPLICABLE',
    expected: { ordinaryPassCount: 0 },
    observed: { ordinaryPassCount: legalActions.filter(a => a.family === 'pass').length },
    evidenceRefs: ['legalAction.families']
  });

  if (action.timingClass === 'QUICK') {
    const isOwnTurn = actorId !== null && actorId === activePlayerId;
    checks.push({
      checkId: 'quick-own-turn',
      status: isOwnTurn ? 'PASS' : 'FAIL',
      expected: { actorEqualsActive: true },
      observed: { actorId, activePlayerId },
      evidenceRefs: ['evidence.actorId', 'context.activePlayerId']
    });
  }

  if (action.timingClass === 'INTERRUPT') {
    // Evidence-derived: verify against actual engine acceptance record, not
    // hardcoded. The evidence object must carry consumedMiniTurn and skipCreated
    // from the engine's acceptance result. If evidence is absent, the check is
    // UNAVAILABLE (not PASS) — ceremonial PASS is rejected.
    const consumedMiniTurn = ev.consumedMiniTurn ?? null;
    const skipCreated = ev.skipCreated ?? null;
    checks.push({
      checkId: 'interrupt-no-miniturn',
      status: consumedMiniTurn === null ? 'UNAVAILABLE' : (consumedMiniTurn === false ? 'PASS' : 'FAIL'),
      expected: { consumedMiniTurn: false },
      observed: { consumedMiniTurn },
      evidenceRefs: ['evidence.consumedMiniTurn']
    });
    checks.push({
      checkId: 'interrupt-no-generic-skip',
      status: skipCreated === null ? 'UNAVAILABLE' : (skipCreated === false ? 'PASS' : 'FAIL'),
      expected: { skipCreated: false },
      observed: { skipCreated },
      evidenceRefs: ['evidence.skipCreated']
    });
  }

  if (action.timingClass === 'INSTANT') {
    const consumedMiniTurn = ev.consumedMiniTurn ?? null;
    checks.push({
      checkId: 'instant-no-miniturn',
      status: consumedMiniTurn === null ? 'UNAVAILABLE' : (consumedMiniTurn === false ? 'PASS' : 'FAIL'),
      expected: { consumedMiniTurn: false },
      observed: { consumedMiniTurn },
      evidenceRefs: ['evidence.consumedMiniTurn']
    });
  }

  if (action.family === 'rank10') {
    const targetStackClass = ev.targetStackClass ?? null;
    const targetSourceCount = ev.targetSourceCount ?? null;
    if (targetStackClass === null && targetSourceCount === 0) {
      checks.push({
        checkId: 'stack-theft-target-valid',
        status: 'NOT_APPLICABLE',
        expected: { targetStackClass: null, targetSourceCount: 0 },
        observed: { targetStackClass, targetSourceCount },
        evidenceRefs: ['evidence.targetStackClass', 'evidence.targetSourceCount']
      });
    } else {
      const validClasses = ['ordinary-effect', 'anchor', 'rank10'];
      const isValid = validClasses.includes(targetStackClass) && targetSourceCount === 1;
      checks.push({
        checkId: 'stack-theft-target-valid',
        status: isValid ? 'PASS' : 'FAIL',
        expected: { targetStackClass: validClasses, targetSourceCount: 1 },
        observed: { targetStackClass, targetSourceCount },
        evidenceRefs: ['evidence.targetStackClass', 'evidence.targetSourceCount']
      });
    }
  }

  if (action.family === 'counter') {
    const response = context.response ?? {};
    const ownTop = Boolean(response.ownTop);
    checks.push({
      checkId: 'counter-not-own-top',
      status: ownTop ? 'FAIL' : 'PASS',
      expected: { ownTop: false },
      observed: { ownTop },
      evidenceRefs: ['context.response.ownTop']
    });
  }

  if (action.family === 'exhausted-pass') {
    const nonExhaustedAlternatives = legalActions.filter(a => a.family !== 'exhausted-pass' && a.family !== 'pass').length;
    const drawPileEmpty = ev.drawPileEmpty ?? null;
    const exhaustedActive = ev.exhaustedActive ?? null;
    // Evidence-derived: PASS requires ALL three conditions to be verified
    // against real evidence. If evidence is absent (null), the check is
    // UNAVAILABLE, not PASS. A PASS with nonExhaustedAlternatives===0 but
    // null evidence is ceremonial and rejected.
    const hasFullEvidence = exhaustedActive !== null && drawPileEmpty !== null;
    const forcedPass = nonExhaustedAlternatives === 0 && exhaustedActive === true && drawPileEmpty === true;
    const hasAlternatives = nonExhaustedAlternatives > 0;
    const status = hasFullEvidence
      ? (forcedPass ? 'PASS' : (hasAlternatives ? 'FAIL' : 'FAIL'))
      : (hasAlternatives ? 'FAIL' : 'UNAVAILABLE');
    checks.push({
      checkId: 'exhausted-pass-forced',
      status,
      expected: { nonExhaustedAlternatives: 0, exhaustedActive: true, drawPileEmpty: true },
      observed: { nonExhaustedAlternatives, totalLegalActions: legalActions.length, exhaustedActive, drawPileEmpty },
      evidenceRefs: ['legalAction.families', 'evidence.exhaustedActive', 'evidence.drawPileEmpty']
    });
  }

  if (action.family === 'response-decline') {
    const responseOptions = legalActions.filter(a =>
      a.family !== 'response-decline' && a.family !== 'pass' &&
      ['counter', 'disrupt', 'interrupt', 'instant', 'quick'].includes(a.family)
    ).length;
    checks.push({
      checkId: 'response-decline-had-options',
      status: responseOptions > 0 ? 'PASS' : 'NOT_APPLICABLE',
      expected: { responseOptions: '>0' },
      observed: { responseOptions, totalLegalActions: legalActions.length },
      evidenceRefs: ['legalAction.families']
    });
  }

  if (action.family === 'private-choice') {
    const alternatives = legalActions.filter(a => a.family === 'private-choice').length;
    checks.push({
      checkId: 'private-choice-had-alternatives',
      status: alternatives > 1 ? 'PASS' : 'NOT_APPLICABLE',
      expected: { privateChoiceCount: '>1' },
      observed: { privateChoiceCount: alternatives },
      evidenceRefs: ['legalAction.families']
    });
  }

  if (action.family === 'super' || action.family === 'ultra') {
    const advancedLegal = legalActions.filter(a =>
      ['super', 'ultra', 'voltage', 'rank10', 'royal-marriage'].includes(a.family)
    ).length;
    checks.push({
      checkId: 'advanced-action-legal',
      status: advancedLegal > 0 ? 'PASS' : 'FAIL',
      expected: { advancedLegalCount: '>0' },
      observed: { advancedLegalCount: advancedLegal },
      evidenceRefs: ['legalAction.families']
    });
  }

  const applicableChecks = checks.filter(c => c.status === 'PASS' || c.status === 'FAIL');
  const violationCount = applicableChecks.filter(c => c.status === 'FAIL').length;
  const overallStatus = applicableChecks.length === 0
    ? 'NOT_APPLICABLE'
    : violationCount === 0 ? 'PASS' : 'FAIL';
  return { status: overallStatus, checks };
}

export function createDecisionTrace(input) {
  const { matchId, decisionIndex, checkpointHash, fullCheckpointHash, seat, policyId, policyVersion, policyHash, action, legalActions, context, turn, phase, authorizedContextHash, ownItemOnTop, candidateScores, selectionMetadata, evidence } = input;
  const hybrixTrace = selectionMetadata?.hybrixTrace ?? null;
  const decisionKind = classifyDecisionKind(action, legalActions);
  const scoreComponents = computeScoreComponents(policyId, action, context);
  const reasonCodes = deriveReasonCodes(policyId, action, context, scoreComponents);
  const codeValidation = validateReasonCodes(reasonCodes);
  if (!codeValidation.valid) {
    throw new Error(`Unknown reason codes in trace: ${codeValidation.unknown.join(', ')}`);
  }

  // Build score lookup from actual policy-emitted candidate scores
  const scoreMap = new Map((candidateScores ?? []).map((c) => [c.actionId, c.score]));
  const isRandomPolicy = policyId === 'random-legal' || selectionMetadata?.reasonCode === 'UNIFORM_RANDOM';
  const selectionMode = isRandomPolicy ? 'uniform-random' : 'score-ranked';

  const legalOptions = legalActions.map((legalAction) => {
    const legalComponents = computeScoreComponents(policyId, legalAction, context);
    const legalReasons = deriveReasonCodes(policyId, legalAction, context, legalComponents);
    const actualScore = scoreMap.get(legalAction.actionId);
    return buildLegalOption(legalAction, context, legalComponents, legalReasons, actualScore);
  }).sort((a, b) => b.score - a.score || a.actionId.localeCompare(b.actionId));

  const selectedOption = legalOptions.find((opt) => opt.actionId === action.actionId);
  const secondBest = legalOptions.find((opt) => opt.actionId !== action.actionId);
  const selectionMargin = isRandomPolicy
    ? null
    : secondBest ? Number((selectedOption.score - secondBest.score).toFixed(2)) : 0;
  const selectionProbability = isRandomPolicy
    ? Number((1 / legalActions.length).toFixed(4))
    : null;

  const ruleAudit = buildRuleAudit(action, legalActions, context, evidence);

  const core = {
    schemaVersion: DECISION_TRACE_SCHEMA_VERSION,
    decisionId: `DT-${stableHash({ matchId, decisionIndex, checkpointHash, seat, policyId, actionId: action.actionId })}`,
    matchId,
    decisionIndex,
    checkpointHash,
    fullCheckpointHash: fullCheckpointHash ?? null,
    seat,
    policyId,
    policyVersion,
    policyHash,
    decisionKind,
    selectionMode,
    phase,
    turn,
    publicContext: redactPublicContext(context),
    authorizedContextHash,
    legalOptions,
    selectedActionId: action.actionId,
    selectionMargin,
    selectionProbability,
    ownItemOnTop,
    ruleAudit,
    hybrixTrace,
    reasonCodeVocabularyHash: reasonCodeVocabularyHash(),
    mechanicRegistryHash: mechanicRegistryHash(),
    reasonCodeVersion: REASON_CODE_VERSION,
    mechanicRegistryVersion: MECHANIC_REGISTRY_VERSION
  };

  return Object.freeze({ ...core, traceHash: hashCanonical(core) });
}

function redactPublicContext(context) {
  const own = context.own ?? {};
  const opponents = (context.opponents ?? []).map((opp) => ({
    playerId: opp.playerId,
    goal: opp.goal,
    securedPoints: opp.securedPoints,
    handCount: opp.handCount,
    prCount: opp.pr?.length ?? 0,
    erCount: opp.er?.length ?? 0
  }));
  return {
    activePlayerId: context.activePlayerId,
    phase: context.phase,
    fullTurnSequence: context.fullTurnSequence,
    own: { goal: own.goal, securedPoints: own.securedPoints, handCount: own.hand?.length ?? 0, prCount: own.pr?.length ?? 0, erCount: own.er?.length ?? 0 },
    opponents,
    stackDepth: context.stack?.length ?? 0,
    stackTopControllerId: context.stack?.at(-1)?.controllerId ?? null
  };
}

export function reconcileScoreComponents(components) {
  const total = components.terminal * 1000 + components.points * 30 + components.resource * 50 + components.tempo * 20 + components.defense * 40 + components.synergy * 100 - components.risk * 200;
  return Number(total.toFixed(2));
}

export function validateDecisionTrace(trace) {
  const errors = [];
  if (!trace.schemaVersion) errors.push('missing schemaVersion');
  if (trace.schemaVersion !== DECISION_TRACE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${DECISION_TRACE_SCHEMA_VERSION}, got ${trace.schemaVersion}`);
  if (!trace.decisionId) errors.push('missing decisionId');
  if (!trace.matchId) errors.push('missing matchId');
  if (typeof trace.seat !== 'number') errors.push('missing seat');
  // fullCheckpointHash is optional for backward compatibility but when present
  // must be a full 64-hex hash that starts with the 16-char checkpointHash.
  if (trace.fullCheckpointHash !== null && trace.fullCheckpointHash !== undefined) {
    if (typeof trace.fullCheckpointHash !== 'string' || !/^[0-9a-f]{64}$/i.test(trace.fullCheckpointHash)) {
      errors.push('fullCheckpointHash must be a 64-hex hash');
    } else if (typeof trace.checkpointHash === 'string' && !trace.fullCheckpointHash.startsWith(trace.checkpointHash)) {
      errors.push('fullCheckpointHash must start with checkpointHash (legacy reconciliation)');
    }
  }
  if (!trace.policyId) errors.push('missing policyId');
  if (!trace.decisionKind) errors.push('missing decisionKind');
  if (!trace.selectionMode) errors.push('missing selectionMode');
  if (!['score-ranked', 'uniform-random'].includes(trace.selectionMode)) errors.push(`invalid selectionMode: ${trace.selectionMode}`);
  if (!Array.isArray(trace.legalOptions)) errors.push('missing legalOptions');
  if (!trace.selectedActionId) errors.push('missing selectedActionId');
  if (!trace.selectedActionId || !trace.legalOptions.some((opt) => opt.actionId === trace.selectedActionId)) {
    errors.push('selectedActionId not in legalOptions');
  }
  for (const opt of trace.legalOptions) {
    if (!opt.scoreSource) errors.push(`missing scoreSource for ${opt.actionId}`);
    if (!['policy', 'reconstructed'].includes(opt.scoreSource)) errors.push(`invalid scoreSource for ${opt.actionId}: ${opt.scoreSource}`);
    if (opt.scoreSource === 'reconstructed' || !opt.scoreSource) {
      const reconciled = reconcileScoreComponents(opt.scoreComponents);
      if (Math.abs(reconciled - opt.score) > 0.01) {
        errors.push(`score mismatch for ${opt.actionId}: ${opt.score} vs reconciled ${reconciled}`);
      }
    }
  }
  if (trace.ruleAudit) {
    for (const check of trace.ruleAudit.checks ?? []) {
      if (!check.checkId) errors.push('ruleAudit check missing checkId');
      if (!['PASS', 'FAIL', 'NOT_APPLICABLE', 'UNAVAILABLE'].includes(check.status)) {
        errors.push(`ruleAudit check ${check.checkId} has invalid status: ${check.status}`);
      }
      if (!('observed' in check)) errors.push(`ruleAudit check ${check.checkId} missing observed`);
      if (check.status === 'PASS' || check.status === 'FAIL') {
        if (!('expected' in check)) errors.push(`ruleAudit check ${check.checkId} missing expected`);
        if (!('evidenceRefs' in check)) errors.push(`ruleAudit check ${check.checkId} missing evidenceRefs`);
      }
    }
    const applicable = (trace.ruleAudit.checks ?? []).filter(c => c.status === 'PASS' || c.status === 'FAIL');
    if (applicable.length === 0 && trace.ruleAudit.status === 'PASS') {
      errors.push('ruleAudit overall PASS with zero applicable checks');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function publicDecisionTrace(trace) {
  return {
    schemaVersion: trace.schemaVersion,
    decisionId: trace.decisionId,
    matchId: trace.matchId,
    decisionIndex: trace.decisionIndex,
    checkpointHash: trace.checkpointHash,
    fullCheckpointHash: trace.fullCheckpointHash ?? null,
    seat: trace.seat,
    policyId: trace.policyId,
    decisionKind: trace.decisionKind,
    selectionMode: trace.selectionMode,
    phase: trace.phase,
    turn: trace.turn,
    publicContext: trace.publicContext,
    legalOptions: trace.legalOptions.map((opt) => ({
      actionId: opt.actionId,
      displayLabel: opt.displayLabel,
      family: opt.family,
      mechanicIds: opt.mechanicIds,
      score: opt.score,
      scoreComponents: opt.scoreComponents,
      reasonCodes: opt.reasonCodes,
      scoreSource: opt.scoreSource,
      actualContributions: opt.actualContributions,
      actualTotal: opt.actualTotal
    })),
    selectedActionId: trace.selectedActionId,
    selectionMargin: trace.selectionMargin,
    selectionProbability: trace.selectionProbability,
    ownItemOnTop: trace.ownItemOnTop,
    ruleAudit: trace.ruleAudit,
    traceHash: trace.traceHash
  };
}
