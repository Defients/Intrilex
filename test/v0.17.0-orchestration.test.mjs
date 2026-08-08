// V0.17.0 Phase 2 — Match orchestration tests
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LifecycleState, mapToLifecycleState, lifecycleStateLabel, validTransitions, isValidTransition } from '../apps/lab-web/src/play/state/play-lifecycle.js';
import {
  DeclarationPhase,
  createDeclarationFlow,
  selectSourceCard,
  selectAction,
  selectTarget,
  moveToConfirmation,
  cancelDeclaration,
  buildSubmission,
  handleRejection,
  handleAccepted,
  isSubmittable,
  needsTargetSelection,
  describeFlowState,
} from '../apps/lab-web/src/play/orchestration/declaration-flow.js';
import {
  buildEventLog,
  buildEventLogEntry,
  buildStackDisplay,
  buildEffectExplanation,
  buildPartialResolution,
} from '../apps/lab-web/src/play/orchestration/resolution-flow.js';

// ─── Lifecycle State Machine Tests ──────────────────────────────

test('mapToLifecycleState: terminal', () => {
  assert.equal(mapToLifecycleState('TERMINAL', {}), LifecycleState.TERMINAL);
});

test('mapToLifecycleState: human decision awaiting priority', () => {
  assert.equal(mapToLifecycleState('HUMAN_DECISION', { selectedActionId: null }), LifecycleState.AWAITING_PRIORITY);
});

test('mapToLifecycleState: human decision with action selected', () => {
  assert.equal(mapToLifecycleState('HUMAN_DECISION', { selectedActionId: 'a1', isConfirming: false }), LifecycleState.CONFIRMING_DECLARATION);
});

test('mapToLifecycleState: human decision confirming', () => {
  assert.equal(mapToLifecycleState('HUMAN_DECISION', { selectedActionId: 'a1', isConfirming: true }), LifecycleState.CONFIRMING_DECLARATION);
});

test('mapToLifecycleState: AI decision', () => {
  assert.equal(mapToLifecycleState('AI_DECISION', {}), LifecycleState.RESPONSE_WINDOW);
});

test('mapToLifecycleState: advancing', () => {
  assert.equal(mapToLifecycleState('ADVANCING', {}), LifecycleState.RESOLVING);
});

test('mapToLifecycleState: error with version code', () => {
  assert.equal(mapToLifecycleState('ERROR', { hasError: true, errorCode: 'INCOMPATIBLE_ENGINE_VERSION' }), LifecycleState.UNSUPPORTED_VERSION);
});

test('mapToLifecycleState: error with save conflict', () => {
  assert.equal(mapToLifecycleState('ERROR', { hasError: true, errorCode: 'SAVE_HASH_MISMATCH' }), LifecycleState.SAVE_CONFLICT);
});

test('mapToLifecycleState: targeting state', () => {
  const result = mapToLifecycleState('HUMAN_DECISION', {
    selectedActionId: 'a1',
    actionContracts: [{ optionId: 'a1', targets: { required: true, legalTargetIds: ['t1'] } }],
    selectedTargets: [],
  });
  assert.equal(result, LifecycleState.SELECTING_TARGETS);
});

test('lifecycleStateLabel: returns human-readable label', () => {
  assert.equal(lifecycleStateLabel(LifecycleState.TERMINAL), 'Match complete');
  assert.equal(lifecycleStateLabel(LifecycleState.AWAITING_PRIORITY), 'Awaiting priority');
});

test('validTransitions: AWAITING_PRIORITY has valid transitions', () => {
  const transitions = validTransitions(LifecycleState.AWAITING_PRIORITY);
  assert.ok(transitions.includes(LifecycleState.SELECTING_ACTION));
  assert.ok(transitions.includes(LifecycleState.RESOLVING));
  assert.ok(transitions.includes(LifecycleState.TERMINAL));
});

test('isValidTransition: valid transition', () => {
  assert.ok(isValidTransition(LifecycleState.AWAITING_PRIORITY, LifecycleState.SELECTING_ACTION));
});

test('isValidTransition: invalid transition', () => {
  assert.ok(!isValidTransition(LifecycleState.UNINITIALIZED, LifecycleState.TERMINAL));
});

// ─── Declaration Flow Tests ──────────────────────────────────────

test('createDeclarationFlow: returns idle state', () => {
  const flow = createDeclarationFlow();
  assert.equal(flow.phase, DeclarationPhase.IDLE);
  assert.equal(flow.selectedSourceCardId, null);
  assert.equal(flow.selectedActionId, null);
});

test('selectSourceCard: selects card and finds actions', () => {
  const flow = createDeclarationFlow();
  const actions = [
    { optionId: 'a1', sourceEntityIds: ['C1'], targets: { required: false } },
    { optionId: 'a2', sourceEntityIds: ['C2'], targets: { required: false } },
  ];
  const { flow: newFlow, actionsForCard } = selectSourceCard(flow, 'C1', actions);
  assert.equal(newFlow.phase, DeclarationPhase.SOURCE_SELECTED);
  assert.equal(newFlow.selectedSourceCardId, 'C1');
  assert.equal(actionsForCard.length, 1);
  assert.equal(actionsForCard[0].optionId, 'a1');
});

test('selectSourceCard: toggles off when same card', () => {
  const flow = { ...createDeclarationFlow(), selectedSourceCardId: 'C1', phase: DeclarationPhase.SOURCE_SELECTED };
  const { flow: newFlow } = selectSourceCard(flow, 'C1', []);
  assert.equal(newFlow.phase, DeclarationPhase.IDLE);
  assert.equal(newFlow.selectedSourceCardId, null);
});

test('selectSourceCard: no actions for card', () => {
  const flow = createDeclarationFlow();
  const actions = [{ optionId: 'a1', sourceEntityIds: ['C2'] }];
  const { flow: newFlow } = selectSourceCard(flow, 'C1', actions);
  assert.equal(newFlow.phase, DeclarationPhase.IDLE);
  assert.equal(newFlow.rejectionReason, 'SOURCE_NOT_AVAILABLE');
});

test('selectAction: action without targets goes to preview', () => {
  const flow = { ...createDeclarationFlow(), selectedSourceCardId: 'C1', phase: DeclarationPhase.SOURCE_SELECTED };
  const actions = [{ optionId: 'a1', sourceEntityIds: ['C1'], targets: { required: false } }];
  const { flow: newFlow, needsTargets } = selectAction(flow, 'a1', actions, null);
  assert.equal(newFlow.phase, DeclarationPhase.PREVIEW);
  assert.equal(newFlow.selectedActionId, 'a1');
  assert.equal(needsTargets, false);
});

test('selectAction: action with targets goes to targeting', () => {
  const flow = { ...createDeclarationFlow(), selectedSourceCardId: 'C1', phase: DeclarationPhase.SOURCE_SELECTED };
  const actions = [{ optionId: 'a1', sourceEntityIds: ['C1'], targets: { required: true, legalTargetIds: ['T1', 'T2'] } }];
  const { flow: newFlow, needsTargets } = selectAction(flow, 'a1', actions, null);
  assert.equal(newFlow.phase, DeclarationPhase.TARGETING);
  assert.equal(needsTargets, true);
  assert.deepEqual(newFlow.availableTargets, ['T1', 'T2']);
});

test('selectTarget: selects valid target', () => {
  const flow = {
    ...createDeclarationFlow(),
    phase: DeclarationPhase.TARGETING,
    selectedActionId: 'a1',
    availableTargets: ['T1', 'T2'],
    selectedTargetIds: [],
  };
  const { flow: newFlow, isComplete } = selectTarget(flow, 'T1');
  assert.deepEqual(newFlow.selectedTargetIds, ['T1']);
  assert.equal(isComplete, true);
  assert.equal(newFlow.phase, DeclarationPhase.PREVIEW);
});

test('selectTarget: rejects invalid target', () => {
  const flow = {
    ...createDeclarationFlow(),
    phase: DeclarationPhase.TARGETING,
    availableTargets: ['T1'],
    selectedTargetIds: [],
  };
  const { flow: newFlow, isComplete } = selectTarget(flow, 'INVALID');
  assert.equal(isComplete, false);
  assert.deepEqual(newFlow.selectedTargetIds, []);
});

test('selectTarget: toggles target off', () => {
  const flow = {
    ...createDeclarationFlow(),
    phase: DeclarationPhase.TARGETING,
    availableTargets: ['T1'],
    selectedTargetIds: ['T1'],
  };
  const { flow: newFlow } = selectTarget(flow, 'T1');
  assert.deepEqual(newFlow.selectedTargetIds, []);
});

test('moveToConfirmation: moves to confirming', () => {
  const flow = { ...createDeclarationFlow(), selectedActionId: 'a1', phase: DeclarationPhase.PREVIEW };
  const newFlow = moveToConfirmation(flow);
  assert.equal(newFlow.phase, DeclarationPhase.CONFIRMING);
});

test('cancelDeclaration: resets to idle', () => {
  const flow = { ...createDeclarationFlow(), selectedActionId: 'a1', phase: DeclarationPhase.CONFIRMING };
  const newFlow = cancelDeclaration(flow);
  assert.equal(newFlow.phase, DeclarationPhase.IDLE);
  assert.equal(newFlow.selectedActionId, null);
});

test('buildSubmission: builds correct submission', () => {
  const flow = { ...createDeclarationFlow(), selectedActionId: 'a1', phase: DeclarationPhase.CONFIRMING };
  const snapshot = {
    sessionId: 'S1',
    decision: { stateRevision: 5, frameHash: 'hash1' },
  };
  const submission = buildSubmission(flow, snapshot);
  assert.equal(submission.sessionId, 'S1');
  assert.equal(submission.stateRevision, 5);
  assert.equal(submission.decisionFrameHash, 'hash1');
  assert.equal(submission.actionId, 'a1');
});

test('buildSubmission: returns null without action', () => {
  const flow = createDeclarationFlow();
  const submission = buildSubmission(flow, { sessionId: 'S1', decision: {} });
  assert.equal(submission, null);
});

test('handleRejection: sets rejection state', () => {
  const flow = { ...createDeclarationFlow(), selectedActionId: 'a1', phase: DeclarationPhase.CONFIRMING };
  const newFlow = handleRejection(flow, { accepted: false, error: 'STALE_FRAME' });
  assert.equal(newFlow.phase, DeclarationPhase.REJECTED);
  assert.equal(newFlow.rejectionReason, 'STALE_FRAME');
});

test('handleAccepted: clears flow', () => {
  const flow = { ...createDeclarationFlow(), selectedActionId: 'a1', phase: DeclarationPhase.CONFIRMING };
  const newFlow = handleAccepted(flow);
  assert.equal(newFlow.phase, DeclarationPhase.SUBMITTED);
  assert.equal(newFlow.selectedActionId, null);
});

test('isSubmittable: true when confirming with action', () => {
  assert.ok(isSubmittable({ phase: DeclarationPhase.CONFIRMING, selectedActionId: 'a1' }));
  assert.ok(!isSubmittable({ phase: DeclarationPhase.PREVIEW, selectedActionId: 'a1' }));
  assert.ok(!isSubmittable({ phase: DeclarationPhase.CONFIRMING, selectedActionId: null }));
});

test('describeFlowState: returns description for each phase', () => {
  assert.ok(describeFlowState({ phase: DeclarationPhase.IDLE }).includes('No action'));
  assert.ok(describeFlowState({ phase: DeclarationPhase.TARGETING }).includes('target'));
  assert.ok(describeFlowState({ phase: DeclarationPhase.CONFIRMING }).includes('Confirm'));
  assert.ok(describeFlowState({ phase: DeclarationPhase.REJECTED, rejectionReason: 'STALE_FRAME' }).includes('STALE_FRAME'));
});

// ─── Resolution Flow Tests ───────────────────────────────────────

test('buildEventLog: builds log from events', () => {
  const events = [
    { type: 'CARD_DRAWN', controllerId: 'P1', payload: {} },
    { type: 'CARD_SCORED', controllerId: 'P2', payload: { cardId: 'C1' } },
  ];
  const cardRegistry = { C1: { identity: 'K♠', rank: 'K', suit: '♠' } };
  const log = buildEventLog(events, cardRegistry);
  assert.equal(log.length, 2);
  assert.ok(log[0].description.includes('drew'));
  assert.ok(log[1].description.includes('scored'));
});

test('buildEventLog: empty events returns empty', () => {
  assert.deepEqual(buildEventLog([], null), []);
  assert.deepEqual(buildEventLog(null, null), []);
});

test('buildStackDisplay: builds stack with top highlighted', () => {
  const stack = [
    { id: 's1', kind: 'declaration', controllerId: 'P1', status: 'pending' },
    { id: 's2', kind: 'counter', controllerId: 'P2', status: 'pending' },
  ];
  const display = buildStackDisplay(stack, null);
  assert.equal(display.length, 2);
  assert.ok(display[0].isTop); // First item is top (reversed)
  assert.equal(display[0].id, 's2');
});

test('buildStackDisplay: empty stack returns empty', () => {
  assert.deepEqual(buildStackDisplay([], null), []);
});

test('buildEffectExplanation: extracts effect details', () => {
  const event = {
    type: 'EFFECT_RESOLVED',
    payload: {
      effectName: 'Bounce',
      cardId: 'C1',
      targetId: 'C2',
      result: 'resolved',
    },
  };
  const cardRegistry = { C1: { identity: '3♠' }, C2: { identity: 'K♥' } };
  const expl = buildEffectExplanation(event, cardRegistry);
  assert.equal(expl.effectName, 'Bounce');
  assert.equal(expl.source, '3♠');
  assert.deepEqual(expl.targets, ['K♥']);
  assert.equal(expl.result, 'resolved');
});

test('buildPartialResolution: counts resolved vs fizzled', () => {
  const events = [
    { type: 'EFFECT_RESOLVED', payload: {} },
    { type: 'EFFECT_FIZZLED', payload: {} },
    { type: 'EFFECT_RESOLVED', payload: {} },
    { type: 'EFFECT_CANCELLED', payload: {} },
  ];
  const result = buildPartialResolution(events, null);
  assert.equal(result.attempted, 4);
  assert.equal(result.resolved, 2);
  assert.equal(result.fizzled, 1);
  assert.equal(result.cancelled, 1);
  assert.ok(result.summary.includes('2 of 4'));
});

test('buildPartialResolution: all resolved', () => {
  const events = [
    { type: 'EFFECT_RESOLVED', payload: {} },
    { type: 'EFFECT_RESOLVED', payload: {} },
  ];
  const result = buildPartialResolution(events, null);
  assert.equal(result.resolved, 2);
  assert.ok(result.summary.includes('All 2'));
});

// ─── Conservation Tests ──────────────────────────────────────────

test('CONSERVATION: declaration flow never mutates engine state', () => {
  // The flow is pure UI state — it should never touch the session
  const flow = createDeclarationFlow();
  const { flow: newFlow } = selectSourceCard(flow, 'C1', [{ optionId: 'a1', sourceEntityIds: ['C1'] }]);
  // The flow should only have UI fields, no engine state
  assert.ok(!newFlow.state);
  assert.ok(!newFlow.command);
  assert.ok(!newFlow.engine);
});

test('CONSERVATION: event log never invents causal relationships', () => {
  const events = [
    { type: 'CARD_DRAWN', controllerId: 'P1', payload: {} },
    { type: 'CARD_SCORED', controllerId: 'P2', payload: { cardId: 'C1' } },
  ];
  const log = buildEventLog(events, null);
  // Each entry should describe only its own event, not claim causation
  for (const entry of log) {
    assert.ok(!entry.description.includes('because'));
    assert.ok(!entry.description.includes('caused'));
    assert.ok(!entry.description.includes('led to'));
  }
});
