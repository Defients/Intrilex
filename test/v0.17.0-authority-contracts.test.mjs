// V0.17.0 Phase 1 — Authority contract tests
// Tests legal-action adapter, priority projection, reason codes, and action explanation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Reason code registry
import {
  REASON_CODES,
  getReasonCode,
  reasonShortText,
  reasonDetailedText,
  reasonRuleRef,
  isVisibilitySafe,
  mapEngineRejection,
  auditReasonCodes,
} from '../apps/lab-web/src/play/authority/reason-code-registry.js';

// Priority projection
import {
  derivePriorityContext,
  priorityBannerText,
  windowTypeLabel,
  priorityTimeline,
  WindowType,
} from '../apps/lab-web/src/play/authority/priority-projection.js';

// Legal action adapter
import {
  classifyActionForm,
  classifyActionRanks,
  isSpadesVariant,
  isSuperDeclaration,
  getSuperEffectId,
  buildLegalActionContract,
  groupActionsByTiming,
  filterBySourceCard,
  actionsForCard,
} from '../apps/lab-web/src/play/authority/legal-action-adapter.js';

// Action explanation
import {
  GuidanceMode,
  buildImmediateExplanation,
  buildWhyExplanation,
  buildDeeperExplanation,
  buildUnavailableExplanation,
  buildPostActionExplanation,
} from '../apps/lab-web/src/play/intelligence/action-explanation.js';

// ─── Reason Code Registry Tests ──────────────────────────────────

test('REASON_CODES: all codes have required fields', () => {
  for (const [code, def] of Object.entries(REASON_CODES)) {
    assert.equal(def.code, code, `Code ${code} must match key`);
    assert.ok(def.shortText, `Code ${code} must have shortText`);
    assert.ok(def.detailedText, `Code ${code} must have detailedText`);
    assert.equal(typeof def.visibilitySafe, 'boolean', `Code ${code} must have visibilitySafe boolean`);
  }
});

test('REASON_CODES: all codes are visibility-safe', () => {
  const audit = auditReasonCodes();
  assert.equal(audit.unsafe, 0, `All reason codes must be visibility-safe, got ${audit.unsafe} unsafe`);
  assert.ok(audit.total >= 25, `Must have at least 25 reason codes, got ${audit.total}`);
});

test('getReasonCode: returns definition for known code', () => {
  const def = getReasonCode('NOT_PRIORITY_HOLDER');
  assert.equal(def.code, 'NOT_PRIORITY_HOLDER');
  assert.ok(def.shortText);
});

test('getReasonCode: returns fallback for unknown code', () => {
  const def = getReasonCode('NONEXISTENT_CODE');
  assert.equal(def.code, 'NONEXISTENT_CODE');
  assert.ok(def.shortText);
});

test('mapEngineRejection: maps known engine codes', () => {
  assert.equal(mapEngineRejection('NOT_PRIORITY_HOLDER'), 'NOT_PRIORITY_HOLDER');
  assert.equal(mapEngineRejection('WRONG_PHASE'), 'WRONG_PHASE');
  assert.equal(mapEngineRejection('UNKNOWN_ENGINE_CODE'), 'ENGINE_REJECTION');
});

test('reasonShortText/reasonDetailedText: return correct text', () => {
  assert.ok(reasonShortText('NOT_PRIORITY_HOLDER').includes('priority'));
  assert.ok(reasonDetailedText('NOT_PRIORITY_HOLDER').length > reasonShortText('NOT_PRIORITY_HOLDER').length);
});

// ─── Priority Projection Tests ───────────────────────────────────

test('derivePriorityContext: terminal state', () => {
  const snapshot = { status: 'TERMINAL', match: { winner: 'P1', phase: 'End' }, human: { playerId: 'P1' } };
  const ctx = derivePriorityContext(snapshot, null);
  assert.equal(ctx.holder, 'system');
  assert.equal(ctx.canAct, false);
  assert.equal(ctx.reasonCode, 'GAME_ALREADY_TERMINAL');
});

test('derivePriorityContext: AI deciding', () => {
  const snapshot = { status: 'AI_DECISION', match: { phase: 'Action' }, human: { playerId: 'P1' }, playerView: { stack: [] } };
  const ctx = derivePriorityContext(snapshot, null);
  assert.equal(ctx.holder, 'opponent');
  assert.equal(ctx.isOpponentPriority, true);
  assert.equal(ctx.isHumanPriority, false);
});

test('derivePriorityContext: human proactive window', () => {
  const snapshot = {
    status: 'HUMAN_DECISION',
    match: { phase: 'Action' },
    human: { playerId: 'P1' },
    playerView: { stack: [] },
  };
  const decision = { actorId: 'P1', kind: 'ACTION', legalActions: [{ actionId: 'a1', isDecline: false, isExhaustedPass: false }] };
  const ctx = derivePriorityContext(snapshot, decision);
  assert.equal(ctx.holder, 'human');
  assert.equal(ctx.isHumanPriority, true);
  assert.equal(ctx.windowType, WindowType.PROACTIVE);
  assert.equal(ctx.stackDepth, 0);
});

test('derivePriorityContext: human response window', () => {
  const snapshot = {
    status: 'HUMAN_DECISION',
    match: { phase: 'Action' },
    human: { playerId: 'P1' },
    playerView: { stack: [{ declarationId: 'D1' }] },
  };
  const decision = { actorId: 'P1', kind: 'RESPONSE', legalActions: [{ actionId: 'a1', isDecline: true, isExhaustedPass: false }] };
  const ctx = derivePriorityContext(snapshot, decision);
  assert.equal(ctx.holder, 'human');
  assert.equal(ctx.windowType, WindowType.RESPONSE);
  assert.equal(ctx.stackDepth, 1);
  assert.equal(ctx.canPass, true);
});

test('priorityBannerText: human response window with pass info', () => {
  const ctx = {
    holder: 'human',
    isHumanPriority: true,
    windowType: WindowType.RESPONSE,
    stackDepth: 1,
    canPass: true,
    nextOnPass: 'Passing lets the declaration continue toward resolution.',
  };
  const banner = priorityBannerText(ctx, 'Vorian');
  assert.ok(banner.includes('Your Priority'));
  assert.ok(banner.includes('Response Window'));
  assert.ok(banner.includes('Passing lets'));
});

test('priorityBannerText: opponent priority', () => {
  const ctx = {
    holder: 'opponent',
    isHumanPriority: false,
    windowType: WindowType.PROACTIVE,
    stackDepth: 0,
  };
  const banner = priorityBannerText(ctx, 'Vorian');
  assert.ok(banner.includes('Vorian'));
});

test('priorityTimeline: returns ordered steps', () => {
  const ctx = { windowType: WindowType.RESPONSE, stackDepth: 1 };
  const timeline = priorityTimeline(ctx);
  assert.ok(timeline.length >= 5);
  assert.ok(timeline.some(s => s.active));
});

// ─── Legal Action Adapter Tests ──────────────────────────────────

test('classifyActionForm: score', () => {
  assert.equal(classifyActionForm({ family: 'score', mode: 'points' }), 'score');
  assert.equal(classifyActionForm({ family: 'play-for-points', mode: 'pr' }), 'score');
});

test('classifyActionForm: super', () => {
  assert.equal(classifyActionForm({ family: 'counter', mode: 'super-ace' }), 'super');
  assert.equal(classifyActionForm({ family: 'ultra', mode: 'something' }), 'ultra');
});

test('classifyActionForm: response', () => {
  assert.equal(classifyActionForm({ family: 'counter', mode: 'ace-base' }), 'response');
  assert.equal(classifyActionForm({ family: 'interrupt', mode: 'x' }), 'response');
});

test('classifyActionForm: pass', () => {
  assert.equal(classifyActionForm({ family: 'response-decline' }), 'pass');
  assert.equal(classifyActionForm({ family: 'exhausted-pass' }), 'pass');
});

test('classifyActionForm: generated effect', () => {
  assert.equal(classifyActionForm({ family: 'effect-seven', mode: 'rank7-generated-ace-anchor' }), 'generated');
});

test('isSpadesVariant: detects spades source', () => {
  const cardRegistry = { C1: { identity: 'K♠', rank: 'K', suit: '♠' }, C2: { identity: 'K♥', rank: 'K', suit: '♥' } };
  assert.ok(isSpadesVariant({ sourceHandles: ['C1'], family: 'score' }, cardRegistry));
  assert.ok(!isSpadesVariant({ sourceHandles: ['C2'], family: 'score' }, cardRegistry));
});

test('isSpadesVariant: super is not spades', () => {
  const cardRegistry = { C1: { identity: 'A♠', rank: 'A', suit: '♠' }, C2: { identity: 'A♣', rank: 'A', suit: '♣' } };
  assert.ok(!isSpadesVariant({ sourceHandles: ['C1', 'C2'], family: 'counter', mode: 'super-ace' }, cardRegistry));
});

test('isSuperDeclaration: detects super mode', () => {
  assert.ok(isSuperDeclaration({ family: 'counter', mode: 'super-ace' }));
  assert.ok(!isSuperDeclaration({ family: 'score', mode: 'points' }));
});

test('getSuperEffectId: extracts effect ID', () => {
  assert.equal(getSuperEffectId({ family: 'counter', mode: 'super-ace' }), 'super-ace');
  assert.equal(getSuperEffectId({ family: 'score', mode: 'points' }), null);
});

test('buildLegalActionContract: produces full contract', () => {
  const presented = {
    actionId: 'act-1',
    family: 'score',
    mode: 'points',
    timingClass: 'ACTION',
    label: 'Play for Points — to Point Row',
    shortLabel: 'Play for Points',
    kind: 'ACTION',
    isResponse: false,
    isDecline: false,
    isExhaustedPass: false,
    isPrivateChoice: false,
    sourceHandles: ['C1'],
    targetHandles: [],
    featureVector: {},
    commandHash: 'hash123',
  };
  const cardRegistry = { C1: { identity: 'K♠', rank: 'K', suit: '♠' } };
  const contract = buildLegalActionContract(presented, { cardRegistry, frameHash: 'frame1', actorId: 'P1' });

  assert.equal(contract.optionId, 'act-1');
  assert.equal(contract.actorId, 'P1');
  assert.equal(contract.form, 'score');
  assert.deepEqual(contract.rankIds, ['K']);
  assert.equal(contract.isSpadesVariant, true);
  assert.equal(contract.isSuper, false);
  assert.equal(contract.reasonCode, 'LEGAL');
  assert.equal(contract.authorityHash, 'frame1');
  assert.equal(contract.targets.required, false);
});

test('groupActionsByTiming: groups correctly', () => {
  const contracts = [
    { timingClass: 'ACTION', form: 'score', isExhaustedPass: false, isDecline: false, isResponse: false },
    { timingClass: 'QUICK', form: 'response', isExhaustedPass: false, isDecline: false, isResponse: true },
    { timingClass: 'INTERRUPT', form: 'response', isExhaustedPass: false, isDecline: false, isResponse: true },
    { timingClass: 'ACTION', form: 'pass', isExhaustedPass: true, isDecline: false, isResponse: false },
    { timingClass: 'ACTION', form: 'pass', isExhaustedPass: false, isDecline: true, isResponse: false },
  ];
  const groups = groupActionsByTiming(contracts);
  assert.equal(groups.score.length, 1);
  assert.equal(groups.quick.length, 1);
  assert.equal(groups.interrupt.length, 1);
  assert.equal(groups.pass.length, 2);
});

test('filterBySourceCard: filters by selected card', () => {
  const contracts = [
    { sourceEntityIds: ['C1', 'C2'] },
    { sourceEntityIds: ['C3'] },
    { sourceEntityIds: ['C1'] },
  ];
  const filtered = filterBySourceCard(contracts, 'C1');
  assert.equal(filtered.length, 2);
});

test('actionsForCard: finds actions for a card', () => {
  const contracts = [
    { sourceEntityIds: ['C1', 'C2'] },
    { sourceEntityIds: ['C3'] },
  ];
  const found = actionsForCard(contracts, 'C1');
  assert.equal(found.length, 1);
});

// ─── Action Explanation Tests ────────────────────────────────────

test('buildImmediateExplanation: OFF mode returns empty', () => {
  const result = buildImmediateExplanation({}, [], GuidanceMode.OFF);
  assert.equal(result.title, '');
});

test('buildImmediateExplanation: human proactive with actions', () => {
  const ctx = { isHumanPriority: true, windowType: 'proactive', stackDepth: 0, canPass: false, nextOnPass: null };
  const actions = [
    { displayLabel: 'Play for Points', form: 'score' },
    { displayLabel: 'Scuttle', form: 'response' },
  ];
  const result = buildImmediateExplanation(ctx, actions, GuidanceMode.GUIDED);
  assert.ok(result.title.includes('Your Priority'));
  assert.ok(result.body.includes('2 legal actions'));
});

test('buildImmediateExplanation: human response with pass info', () => {
  const ctx = { isHumanPriority: true, windowType: 'response', stackDepth: 1, canPass: true, nextOnPass: 'Passing lets it resolve.' };
  const result = buildImmediateExplanation(ctx, [], GuidanceMode.GUIDED);
  assert.ok(result.passInfo.includes('Passing'));
});

test('buildWhyExplanation: returns structured explanation', () => {
  const contract = {
    displayLabel: 'Play for Points',
    timingClass: 'ACTION',
    form: 'score',
    costs: [{ description: 'Uses your Action Phase.' }],
    targets: { required: false },
    preview: { opensResponseWindow: true, isFullTurnCommitment: true, resolutionUncertain: false },
  };
  const result = buildWhyExplanation(contract, null, GuidanceMode.GUIDED);
  assert.equal(result.label, 'Play for Points');
  assert.ok(result.timing.includes('Action'));
  assert.equal(result.costs.length, 1);
  assert.ok(result.preview.includes('response window'));
});

test('buildDeeperExplanation: links to Rank Anatomy', () => {
  const contract = {
    form: 'score',
    rankIds: ['K'],
    isSpadesVariant: true,
    isSuper: false,
  };
  const result = buildDeeperExplanation(contract, null);
  assert.ok(result.rankAnatomyLinks.length >= 2); // Ordinary + Spades
  assert.ok(result.rankAnatomyLinks.some(l => l.form === 'ordinary'));
  assert.ok(result.rankAnatomyLinks.some(l => l.form === 'spades'));
});

test('buildDeeperExplanation: super links to exact Super effect', () => {
  const contract = {
    form: 'super',
    rankIds: ['A'],
    isSpadesVariant: false,
    isSuper: true,
    superEffectId: 'super-ace',
  };
  const result = buildDeeperExplanation(contract, null);
  assert.ok(result.rankAnatomyLinks.some(l => l.form === 'super' && l.superEffectId === 'super-ace'));
});

test('buildUnavailableExplanation: returns reason text', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.GUIDED);
  assert.ok(result.shortText.includes('priority'));
  assert.ok(result.detailedText.length > 0);
});

test('buildUnavailableExplanation: ESSENTIAL mode returns short only', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.ESSENTIAL);
  assert.ok(result.shortText);
  assert.equal(result.detailedText, '');
});

test('buildPostActionExplanation: returns structured result', () => {
  const action = { family: 'score', mode: 'points' };
  const events = [{ type: 'CARD_SCORED' }, { type: 'POINTS_UPDATED' }];
  const ctx = { isHumanPriority: true };
  const result = buildPostActionExplanation(action, events, ctx);
  assert.ok(result.whatHappened.includes('2 event'));
  assert.ok(result.whyLegal.includes('enumerated'));
  assert.ok(result.whatChanged.includes('Priority'));
  assert.ok(result.whereToInspect.length >= 2);
});

// ─── Conservation / Privacy Tests ────────────────────────────────

test('CONSERVATION: reason codes never mention specific hidden cards', () => {
  for (const def of Object.values(REASON_CODES)) {
    // Reason codes should not contain card identity patterns like "K♠" or "7♥"
    assert.doesNotMatch(def.shortText, /[AKQJ0-9RJBJ][♠♥♦♣]/, `Code ${def.code} shortText must not contain card identities`);
    assert.doesNotMatch(def.detailedText, /[AKQJ0-9RJBJ][♠♥♦♣]/, `Code ${def.code} detailedText must not contain card identities`);
  }
});

test('CONSERVATION: all reason codes are visibility-safe', () => {
  for (const def of Object.values(REASON_CODES)) {
    assert.equal(def.visibilitySafe, true, `Code ${def.code} must be visibility-safe`);
  }
});

test('CONSERVATION: action form classification is mutually exclusive for super vs spades', () => {
  // A Super declaration should NOT be classified as spades
  const cardRegistry = { C1: { identity: 'A♠', rank: 'A', suit: '♠' }, C2: { identity: 'A♣', rank: 'A', suit: '♣' } };
  const superAction = { sourceHandles: ['C1', 'C2'], family: 'counter', mode: 'super-ace' };
  assert.equal(classifyActionForm(superAction), 'super');
  assert.ok(!isSpadesVariant(superAction, cardRegistry), 'Super must not be classified as Spades');
});
