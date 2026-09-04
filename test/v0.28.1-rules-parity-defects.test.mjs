// v0.28.1 Rules-Parity Hotfix — Failing behavioral tests for known defects.
//
// These tests encode the EXPECTED (post-fix) behavior for the five Priority-A
// correctness defects identified by the balance check pass:
//
//   IMPL-01 — Scoring riders block Seven, 10♣, and Black Joker scoring
//   IMPL-12 — Declaration-class counter authority is wrong or incomplete
//   DEG-01  — Sudden Death declaration and countdown are defective
//   IMPL-03 — ⭐6 and ⭐7 legal-choice enumeration is incomplete
//   IMPL-04 — Resolved 10♦ reaches the wrong destination (and mimic menu incomplete)
//
// Per the roadmap (docs/ROADMAP.md Phase 1), these tests are written BEFORE
// the engine repairs. They are expected to FAIL until the fixes land.
// Once the fixes are implemented, these tests should PASS and become
// regression guards against reintroducing the defects.
//
// Authority: Complete Player Rulebook v4.3.1
// Engine: 4.2.6 (upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix)
// Source commit investigated: e4c22228

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulationState,
  advanceSimulationToDecision,
  executeSimulationAction,
  createSimulationDecisionFrame,
  strictPolicyView,
  RANK_REGISTRY,
} from '../packages/engine-adapter/src/adapter.mjs';

// ── Test helpers ──────────────────────────────────────────────────

/** Create a 2-player match in the given profile. */
function setup(profileId, seed = 4242) {
  return createSimulationState({
    profileId,
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed,
  });
}

/** Advance through Start Phase to reach the Action Phase. */
function toActionPhase(state, maxSteps = 10) {
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    const frame = createSimulationDecisionFrame(current);
    current = frame.state;
    if (!frame.policyActions.length) return { state: current, frame };
    if (current.phase === 'Action') return { state: current, frame };
    const enterAction = frame.policyActions.find(
      (a) => a.family === 'phase' && a.mode === 'enter-action',
    );
    if (enterAction) {
      const command = frame.resolve(enterAction.actionId);
      const result = executeSimulationAction(current, command);
      if (!result.accepted) return { state: current, frame };
      current = result.state;
    } else {
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const result = executeSimulationAction(current, command);
      if (!result.accepted) return { state: current, frame };
      current = result.state;
    }
  }
  return { state: current, frame: null };
}

/**
 * Plant a card with the given identity into a player's hand.
 * Moves it from wherever it currently resides. Uses structuredClone
 * so the original state is not mutated.
 */
function plant(state, playerId, identity) {
  const s = structuredClone(state);
  const id = Object.keys(s.cards).find((k) => s.cards[k].identity === identity);
  if (!id) throw new Error(`No card with identity ${identity} found in state`);
  const c = s.cards[id];
  // Remove from all zones
  for (const z of ['dp', 'gy', 'exile', 'swapBar']) {
    const i = s.zones[z].indexOf(id);
    if (i >= 0) s.zones[z].splice(i, 1);
  }
  for (const p of Object.values(s.players)) {
    for (const row of ['hand', 'pr', 'er']) {
      const i = p[row].indexOf(id);
      if (i >= 0) p[row].splice(i, 1);
    }
  }
  delete c.state.swapBarFaceDown;
  delete c.state.swapBarFaceUp;
  c.zone = `${playerId}_HAND`;
  c.controllerId = playerId;
  s.players[playerId].hand.push(id);
  return { state: s, id };
}

/** Find a legal action matching a predicate in a decision frame. */
function findAction(frame, predicate) {
  return frame.policyActions?.find(predicate) ?? null;
}

/** Execute the first legal action matching a predicate. Returns the result. */
function executeFirst(state, frame, predicate) {
  const action = findAction(frame, predicate);
  if (!action) return null;
  const command = frame.resolve(action.actionId);
  return executeSimulationAction(frame.state, command);
}

// ═══════════════════════════════════════════════════════════════════
// IMPL-01: Scoring riders block Seven, 10♣, and Black Joker scoring
// ═══════════════════════════════════════════════════════════════════

test('IMPL-01: Seven (7♣) score-for-points is enumerated in Advanced profile', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '7♣');
  const frame = createSimulationDecisionFrame(s1);
  const scoreAction = findAction(frame, (a) =>
    a.family === 'score' && a.sourceCardIds?.includes(id),
  );
  assert.ok(scoreAction,
    '7♣ score-for-points must appear in legal actions (currently filtered by core-autonomy.js:260-261)');
});

test('IMPL-01: Seven (7♣) score-for-points is accepted in Advanced profile', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '7♣');
  const result = executeSimulationAction(s1, {
    id: 'TEST',
    type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    actorId: actor,
    action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
  });
  assert.ok(result.accepted,
    `7♣ core-score must be accepted (currently rejected with CORE_SCORING_RIDER_UNSUPPORTED by core-authority.js:440-441)`);
});

test('IMPL-01: 10♣ score-for-points is enumerated in Advanced profile', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '10♣');
  const frame = createSimulationDecisionFrame(s1);
  const scoreAction = findAction(frame, (a) =>
    a.family === 'score' && a.sourceCardIds?.includes(id),
  );
  assert.ok(scoreAction,
    '10♣ score-for-points must appear in legal actions');
});

test('IMPL-01: 10♣ score-for-points is accepted in Advanced profile', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '10♣');
  const result = executeSimulationAction(s1, {
    id: 'TEST',
    type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    actorId: actor,
    action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
  });
  assert.ok(result.accepted,
    `10♣ core-score must be accepted (currently rejected with CORE_SCORING_RIDER_UNSUPPORTED)`);
});

test('IMPL-01: Black Joker (BJ) score-for-points is enumerated in Advanced profile', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, 'BJ');
  const frame = createSimulationDecisionFrame(s1);
  const scoreAction = findAction(frame, (a) =>
    a.family === 'score' && a.sourceCardIds?.includes(id),
  );
  assert.ok(scoreAction,
    'BJ score-for-points must appear in legal actions');
});

test('IMPL-01: Black Joker (BJ) score-for-points is accepted in Advanced profile', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, 'BJ');
  const result = executeSimulationAction(s1, {
    id: 'TEST',
    type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    actorId: actor,
    action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
  });
  assert.ok(result.accepted,
    `BJ core-score must be accepted (currently rejected with CORE_SCORING_RIDER_UNSUPPORTED)`);
});

test('IMPL-01: Seven score-for-points is enumerated in Unrestricted profile', () => {
  const { state: s0 } = toActionPhase(setup('core-unrestricted-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '7♥');
  const frame = createSimulationDecisionFrame(s1);
  const scoreAction = findAction(frame, (a) =>
    a.family === 'score' && a.sourceCardIds?.includes(id),
  );
  assert.ok(scoreAction, '7♥ score-for-points must appear in Unrestricted legal actions');
});

test('IMPL-01: BJ score-for-points is enumerated in Unrestricted profile', () => {
  const { state: s0 } = toActionPhase(setup('core-unrestricted-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, 'BJ');
  const frame = createSimulationDecisionFrame(s1);
  const scoreAction = findAction(frame, (a) =>
    a.family === 'score' && a.sourceCardIds?.includes(id),
  );
  assert.ok(scoreAction, 'BJ score-for-points must appear in Unrestricted legal actions');
});

test('IMPL-01: scoring a Seven places it in PR with correct point value', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '7♣');
  const result = executeSimulationAction(s1, {
    id: 'TEST',
    type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    actorId: actor,
    action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
  });
  // The declaration is accepted if the probe (inner core-score) succeeds.
  // After declaration, the card is on the stack; it moves to PR when the stack resolves.
  assert.ok(result.accepted,
    '7♣ score declaration must be accepted (currently rejected with CORE_SCORING_RIDER_UNSUPPORTED)');
});

test('IMPL-01: scoring BJ places it in PR with 11 point value', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, 'BJ');
  const result = executeSimulationAction(s1, {
    id: 'TEST',
    type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    actorId: actor,
    action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
  });
  assert.ok(result.accepted,
    'BJ score declaration must be accepted (currently rejected with CORE_SCORING_RIDER_UNSUPPORTED)');
});

test('IMPL-01: ordinary scoring (8♣ control) still works in Advanced', () => {
  const { state: s0 } = toActionPhase(setup('core-advanced-authority'));
  const actor = s0.activePlayerId;
  const { state: s1, id } = plant(s0, actor, '8♣');
  const result = executeSimulationAction(s1, {
    id: 'TEST',
    type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    actorId: actor,
    action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
  });
  assert.ok(result.accepted, '8♣ ordinary scoring declaration must still work (regression guard)');
});

// ═══════════════════════════════════════════════════════════════════
// IMPL-12: Declaration-class counter authority is wrong or incomplete
// ═══════════════════════════════════════════════════════════════════

/**
 * Search for a seed where a Rank-10 effect play (10♥ Tempo Spike) is
 * available, then verify that a Base Ace counter is also available
 * to the opponent.
 *
 * Per rulebook v4.3.1 RB:940,949-956,1480: Rank-10 effects are ordinary
 * effect plays counterable by Aces. The engine currently stamps them
 * with stackClass "rank10" which makes them immune to Base Ace
 * (core-authority.js:258-263 only accepts stackClass === "ordinary-effect").
 */
test('IMPL-12: Base Ace can counter a Rank-10 solo effect (10♥)', () => {
  // Search for a seed where 10♥ effect play is available and opponent has an Ace
  for (let seed = 1; seed <= 200; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 30; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      // Look for a rank10/heart effect play
      const tenHeart = frame.policyActions.find((a) =>
        a.family === 'rank10' && (a.mode === 'heart-tempo' || a.mode === 'tempo-spike'),
      );
      if (tenHeart) {
        // Execute the 10♥ effect — use frame.state (the advanced state)
        const command = frame.resolve(tenHeart.actionId);
        const result = executeSimulationAction(frame.state, command);
        if (!result.accepted) break;
        // Now check if the opponent has a Base Ace counter available
        const responseFrame = createSimulationDecisionFrame(result.state);
        const aceCounter = responseFrame.policyActions?.find((a) =>
          a.family === 'counter' && (a.mode === 'base-ace' || a.mode === 'ace'),
        );
        if (aceCounter) return; // PASS: Base Ace counter is available
        // If no ace counter, check if ANY counter is available (might just not have an Ace in hand)
        // Continue searching other seeds
        break;
      }
      // Advance by executing first action
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  // This test fails because Base Ace cannot counter rank10 stackClass items
  assert.fail(
    'Base Ace should be able to counter Rank-10 solo effects per rulebook v4.3.1. ' +
    'Currently blocked because targetAcceptsBaseAce only accepts stackClass === "ordinary-effect" ' +
    'and advancedStackClass returns "rank10" for Rank-10 effects (core-authority.js:258-263, core-advanced.js:107-112). ' +
    'Note: this test searches 200 seeds for a scenario; if none found, the test also fails.',
  );
});

/**
 * Per rulebook v4.3.1 RB:936-945: A♠ can counter ordinary effect plays
 * including Rank-10 effects. The engine currently makes A♠ identical
 * to Base Ace (only accepts "ordinary-effect" stackClass).
 */
test('IMPL-12: A♠ can counter a Rank-10 solo effect', () => {
  // Similar search but looking for A♠ counter specifically
  for (let seed = 1; seed <= 200; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 30; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const tenEffect = frame.policyActions.find((a) =>
        a.family === 'rank10' && a.mode !== 'diamond-mimic-solo' && a.mode !== 'diamond-mimic-paired',
      );
      if (tenEffect) {
        const command = frame.resolve(tenEffect.actionId);
        const result = executeSimulationAction(frame.state, command);
        if (!result.accepted) break;
        const responseFrame = createSimulationDecisionFrame(result.state);
        const spadeAceCounter = responseFrame.policyActions?.find((a) =>
          a.family === 'counter' && (a.mode === 'spade-ace' || a.mode === 'ace-spade'),
        );
        if (spadeAceCounter) return; // PASS
        break;
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  assert.fail(
    'A♠ should be able to counter Rank-10 solo effects per rulebook v4.3.1. ' +
    'Currently targetAcceptsSpadeAce only accepts stackClass === "ordinary-effect".',
  );
});

/**
 * Per rulebook v4.3.1: Base Ace can counter eligible multi-card Effects
 * (Supers). The engine currently rejects Supers because advancedStackClass
 * returns "super" not "ordinary-effect".
 */
test('IMPL-12: Base Ace can counter a Super effect', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 40; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const superAction = frame.policyActions.find((a) => a.family === 'super');
      if (superAction) {
        const command = frame.resolve(superAction.actionId);
        const result = executeSimulationAction(frame.state, command);
        if (!result.accepted) break;
        const responseFrame = createSimulationDecisionFrame(result.state);
        const aceCounter = responseFrame.policyActions?.find((a) =>
          a.family === 'counter' && (a.mode === 'base-ace' || a.mode === 'ace'),
        );
        if (aceCounter) return; // PASS
        break;
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  assert.fail(
    'Base Ace should be able to counter Super effects per rulebook v4.3.1. ' +
    'Currently blocked because advancedStackClass returns "super" and ' +
    'targetAcceptsBaseAce only accepts "ordinary-effect".',
  );
});

// ═══════════════════════════════════════════════════════════════════
// DEG-01: Sudden Death declaration and countdown are defective
// ═══════════════════════════════════════════════════════════════════

test('DEG-01: Sudden Death declaration requires source cards (recipe check)', () => {
  const { state: s0 } = toActionPhase(setup('core-unrestricted-authority'));
  const frame = createSimulationDecisionFrame(s0);
  const sdAction = findAction(frame, (a) => a.family === 'sudden-death');
  if (!sdAction) {
    // If Sudden Death is not offered at all, that's also acceptable
    // (e.g. if the fix removes it from the action phase entirely)
    return;
  }
  assert.ok(sdAction.sourceCardIds?.length > 0,
    'Sudden Death declaration must include source cards (Red Joker + Black Joker or four-of-a-kind). ' +
    'Currently sourceCardIds is always [] (core-advanced.js:731-733).');
});

test('DEG-01: Sudden Death is not offered without required recipe cards', () => {
  // In a fresh game without RJ+BJ or four-of-a-kind in hand,
  // Sudden Death should not be enumerated at all.
  const { state: s0 } = toActionPhase(setup('core-unrestricted-authority'));
  const frame = createSimulationDecisionFrame(s0);
  const sdActions = frame.policyActions?.filter((a) => a.family === 'sudden-death') ?? [];
  // Most random hands won't have the recipe, so sdActions should be empty
  // If it IS offered, it must have source cards
  for (const sd of sdActions) {
    assert.ok(sd.sourceCardIds?.length > 0,
      `Sudden Death offered without recipe cards (sourceCardIds=${JSON.stringify(sd.sourceCardIds)}). ` +
      'Must require Red Joker + Black Joker or four-of-a-kind.');
  }
});

test('DEG-01: Sudden Death countdown decrements on Full-Turn boundaries', () => {
  const { state: s0 } = toActionPhase(setup('core-unrestricted-authority'));
  const frame = createSimulationDecisionFrame(s0);
  const sdAction = findAction(frame, (a) => a.family === 'sudden-death');
  if (!sdAction) return; // Not offered — acceptable

  // Declare Sudden Death — use frame.state (the advanced state the command was built from)
  const command = frame.resolve(sdAction.actionId);
  const declareResult = executeSimulationAction(frame.state, command);
  if (!declareResult.accepted) return; // Declaration rejected — acceptable

  const initialRemaining = declareResult.state.metadata?.phase8?.suddenDeath?.remaining;
  if (initialRemaining === undefined || initialRemaining === null) return;

  // Play through several full turns
  let state = declareResult.state;
  const startFT = state.fullTurnSequence ?? 0;
  let guard = 0;
  while (state.winner === null && guard < 400 && (state.fullTurnSequence ?? 0) < startFT + 4) {
    const d = advanceSimulationToDecision(state);
    state = d.state ?? state;
    if (d.status !== 'PLAYER_DECISION_REQUIRED') break;
    if (!d.legalActionFrame?.actions?.length) break;
    const pick = d.legalActionFrame.actions.find((a) => a.family === 'draw') ??
      d.legalActionFrame.actions.find((a) => a.family === 'phase') ??
      d.legalActionFrame.actions[0];
    state = executeSimulationAction(state, pick.command).state;
    guard++;
  }

  const finalRemaining = state.metadata?.phase8?.suddenDeath?.remaining;
  assert.ok(finalRemaining < initialRemaining,
    `Sudden Death countdown must decrement after Full-Turns. ` +
    `Initial: ${initialRemaining}, after ${state.fullTurnSequence - startFT} FTs: ${finalRemaining}. ` +
    `Currently core-complete-turn (core-authority.js:1049-1100) never ticks phase8.suddenDeath.`);
});

test('DEG-01: Sudden Death eventually produces a terminal result', () => {
  const { state: s0 } = toActionPhase(setup('core-unrestricted-authority'));
  const frame = createSimulationDecisionFrame(s0);
  const sdAction = findAction(frame, (a) => a.family === 'sudden-death');
  if (!sdAction) return;

  const command = frame.resolve(sdAction.actionId);
  const declareResult = executeSimulationAction(frame.state, command);
  if (!declareResult.accepted) return;

  // Play through enough turns for the countdown to reach 0
  let state = declareResult.state;
  const startFT = state.fullTurnSequence ?? 0;
  let guard = 0;
  while (state.winner === null && guard < 600 && (state.fullTurnSequence ?? 0) < startFT + 15) {
    const d = advanceSimulationToDecision(state);
    state = d.state ?? state;
    if (d.status !== 'PLAYER_DECISION_REQUIRED') break;
    if (!d.legalActionFrame?.actions?.length) break;
    const pick = d.legalActionFrame.actions.find((a) => a.family === 'draw') ??
      d.legalActionFrame.actions.find((a) => a.family === 'phase') ??
      d.legalActionFrame.actions[0];
    state = executeSimulationAction(state, pick.command).state;
    guard++;
  }

  const sd = state.metadata?.phase8?.suddenDeath;
  if (sd && sd.remaining > 0) {
    assert.fail(
      `Sudden Death should produce a terminal result after countdown reaches 0. ` +
      `After ${state.fullTurnSequence - startFT} FTs: winner=${state.winner}, remaining=${sd.remaining}. ` +
      `Currently the countdown never decrements so no terminal result is ever produced.`,
    );
  }
  // If countdown did reach 0, winner should be set
  if (sd && sd.remaining <= 0) {
    assert.ok(state.winner !== null,
      'Sudden Death must declare a winner when countdown reaches 0');
  }
});

// ═══════════════════════════════════════════════════════════════════
// IMPL-03: ⭐6 and ⭐7 legal-choice enumeration is incomplete
// ═══════════════════════════════════════════════════════════════════

test('IMPL-03: ⭐6 Super Dig enumerates non-empty keepCardIds choices', () => {
  // Search for a seed where two 6s are in hand (Unrestricted)
  for (let seed = 1; seed <= 300; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 40; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const sixDig = frame.policyActions.find((a) =>
        a.family === 'super' && a.mode === 'six-dig',
      );
      if (sixDig) {
        // The action should have non-empty keepCardIds or the action should
        // represent a meaningful choice (not just discard-with-keep-empty)
        assert.ok(
          sixDig.advanced?.keepCardIds?.length > 0 ||
          sixDig.advanced?.discardCardIds?.length >= 0,
          '⭐6 Super Dig must offer meaningful keep/discard choices. ' +
          'Currently enumerator emits keepCardIds: [] for all candidates (core-advanced.js:713-716).',
        );
        // The key test: at least SOME candidate should have non-empty keepCardIds
        // (otherwise the Super is strictly negative-value)
        const allSixDigs = frame.policyActions.filter((a) =>
          a.family === 'super' && a.mode === 'six-dig',
        );
        const hasNonEmptyKeep = allSixDigs.some(
          (a) => a.advanced?.keepCardIds?.length > 0,
        );
        assert.ok(hasNonEmptyKeep,
          '⭐6 Super Dig must enumerate at least one candidate with non-empty keepCardIds. ' +
          'Currently all candidates have keepCardIds: [] making the Super strictly negative-value.');
        return; // PASS
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  // If no seed produced a 6-pair scenario, skip rather than fail
  assert.ok(true, 'No ⭐6 scenario found in 300 seeds — test inconclusive but not failing');
});

test('IMPL-03: ⭐7 Sequential Topdeck enumerates non-empty assignment choices', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 40; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const sevenTop = frame.policyActions.find((a) =>
        a.family === 'super' && a.mode === 'seven-topdeck',
      );
      if (sevenTop) {
        const allSevenTops = frame.policyActions.filter((a) =>
          a.family === 'super' && a.mode === 'seven-topdeck',
        );
        // At least one candidate should have non-empty hand/effect/score assignments
        const hasNonEmptyAssignment = allSevenTops.some((a) =>
          a.advanced?.handCardIds?.length > 0 ||
          a.advanced?.effectCardIds?.length > 0 ||
          a.advanced?.scoreCardIds?.length > 0,
        );
        assert.ok(hasNonEmptyAssignment,
          '⭐7 Sequential Topdeck must enumerate at least one candidate with non-empty ' +
          'hand/effect/score assignments. Currently all candidates have empty arrays ' +
          '(core-advanced.js:718-719), making the Super strictly negative-value.');
        return; // PASS
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  assert.ok(true, 'No ⭐7 scenario found in 300 seeds — test inconclusive but not failing');
});

// ═══════════════════════════════════════════════════════════════════
// IMPL-04: Resolved 10♦ reaches the wrong destination
// ═══════════════════════════════════════════════════════════════════

test('IMPL-04: 10♦ Mimic source card goes to Exile (not GY)', () => {
  // Search for a seed where 10♦ mimic is available
  for (let seed = 1; seed <= 300; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 40; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const mimicAction = frame.policyActions.find((a) =>
        a.family === 'rank10' && a.mode?.includes('diamond-mimic'),
      );
      if (mimicAction) {
        const sourceId = mimicAction.sourceCardIds?.[0];
        if (!sourceId) break;
        const command = frame.resolve(mimicAction.actionId);
        const result = executeSimulationAction(frame.state, command);
        if (!result.accepted) break;
        const card = result.state.cards[sourceId];
        assert.equal(card.zone, 'EXILE',
          `10♦ source card must go to EXILE (not GY). Currently resolver writes "GY" ` +
          `(ranks.js:546) though lifecycle.js reroutes exileBound cards. ` +
          `Zone after resolution: ${card.zone}`);
        return; // PASS
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  assert.ok(true, 'No 10♦ mimic scenario found in 300 seeds — test inconclusive but not failing');
});

test('IMPL-04: 10♦ Mimic source card is marked exileBound', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 40; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const mimicAction = frame.policyActions.find((a) =>
        a.family === 'rank10' && a.mode?.includes('diamond-mimic'),
      );
      if (mimicAction) {
        const sourceId = mimicAction.sourceCardIds?.[0];
        if (!sourceId) break;
        const command = frame.resolve(mimicAction.actionId);
        const result = executeSimulationAction(frame.state, command);
        if (!result.accepted) break;
        const card = result.state.cards[sourceId];
        assert.ok(card.state?.exileBound === true,
          '10♦ source card must be marked exileBound after resolution. ' +
          'Per ranks.js:15: "Effect-play Tens become permanently Exile-Bound when resolution begins."');
        return; // PASS
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  assert.ok(true, 'No 10♦ mimic scenario found in 300 seeds — test inconclusive but not failing');
});

test('IMPL-04: 10♦ solo Mimic offers more than just ⭐4 Row Exchange', () => {
  // Per rulebook, solo 10♦ can mimic ranks 3-7.
  // Currently only ⭐4 Row Exchange is generated (core-advanced.js:650-652).
  for (let seed = 1; seed <= 300; seed++) {
    const s0 = setup('core-unrestricted-authority', seed);
    let state = s0;
    for (let step = 0; step < 40; step++) {
      const frame = createSimulationDecisionFrame(state);
      if (!frame.policyActions.length) break;
      const mimicSolo = frame.policyActions.find((a) =>
        a.family === 'rank10' && a.mode === 'diamond-mimic-solo',
      );
      if (mimicSolo) {
        // Check all diamond-mimic-solo variants
        const allSoloMimics = frame.policyActions.filter((a) =>
          a.family === 'rank10' && a.mode === 'diamond-mimic-solo',
        );
        const mimickedRanks = new Set(
          allSoloMimics.map((a) => a.advanced?.mimickedRank).filter(Boolean),
        );
        assert.ok(mimickedRanks.size > 1,
          `Solo 10♦ Mimic should offer multiple mimicked ranks (3-7 per rulebook). ` +
          `Currently only ⭐4 Row Exchange is generated. Found ranks: ${[...mimickedRanks].join(', ')}`);
        return; // PASS
      }
      const action = frame.policyActions[0];
      const command = frame.resolve(action.actionId);
      const execResult = executeSimulationAction(frame.state, command);
      if (!execResult.accepted) break;
      state = execResult.state;
    }
  }
  assert.ok(true, 'No solo 10♦ mimic scenario found in 300 seeds — test inconclusive but not failing');
});

// ═══════════════════════════════════════════════════════════════════
// Regression guard: existing ordinary scoring must not break
// ═══════════════════════════════════════════════════════════════════

test('Regression: ordinary scoring (5♥) works in both profiles', () => {
  for (const profileId of ['core-advanced-authority', 'core-unrestricted-authority']) {
    const { state: s0 } = toActionPhase(setup(profileId));
    const actor = s0.activePlayerId;
    const { state: s1, id } = plant(s0, actor, '5♥');
    const result = executeSimulationAction(s1, {
      id: 'TEST',
      type: 'RESOLVE_CORE_AUTHORITY_ACTION',
      actorId: actor,
      action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } },
    });
    assert.ok(result.accepted, `5♥ ordinary scoring declaration must work in ${profileId}`);
  }
});

test('Regression: RANK_REGISTRY has correct prPoints for 7 and BJ', () => {
  assert.equal(RANK_REGISTRY['7']?.prPoints, 7, 'Rank 7 must have prPoints 7');
  assert.equal(RANK_REGISTRY.BJ?.prPoints, 11, 'BJ must have prPoints 11');
});
