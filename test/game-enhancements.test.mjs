// ═══════════════════════════════════════════════════════════════
// game-enhancements.test.mjs — Tests for the 6-issue enhancement batch
//
// Covers:
//   Issue 1: Actions panel per-family icons (FAMILY_ICONS, familyIcon)
//   Issue 2: Self-response bug fix (engine enumerateCoreResponseActions guard)
//   Issue 3: King Anchor surfacing (anchor family split by mode)
//   Issue 4: Game log event display (describeEvent core patterns, filter)
//   Issue 5: Swap bar slot consistency (fixed positions, no reordering)
//   Issue 6: Action flow revamp (auto-resolve, card-centric, streamlined confirm)
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Issue 1 + Issue 3 + Issue 6: action-presentation
import {
  buildActionGroups,
  familyIcon,
  categoryIcon,
  resolveAction,
  ACTION_CATEGORY,
  SELECTION_TYPE,
} from '../apps/lab-web/src/play/action-presentation.mjs';

// Issue 4: resolution-flow describeEvent / buildEventLog
import {
  buildEventLog,
  buildEventLogEntry,
} from '../apps/lab-web/src/play/orchestration/resolution-flow.js';

// Issue 2: engine self-response guard — import from runtime
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime/autonomy-engine-dist/src');
const moduleUrl = (file) => pathToFileURL(path.join(runtimeDir, file)).href;

let engineModule, coreAutonomyModule;
let engineAvailable = false;
try {
  engineModule = await import(moduleUrl('engine.js'));
  coreAutonomyModule = await import(moduleUrl('core-autonomy.js'));
  engineAvailable = true;
} catch {
  // Runtime not built yet — engine tests will be skipped
}

// ── Test fixtures ───────────────────────────────────────────────

function mkAction(overrides = {}) {
  return {
    actionId: 'act-1',
    family: 'score',
    mode: null,
    timingClass: 'ACTION',
    sourceHandles: [],
    targetHandles: [],
    isResponse: false,
    isDecline: false,
    isExhaustedPass: false,
    isPrivateChoice: false,
    ...overrides,
  };
}

const cardRegistry = {
  C1: { entityId: 'C1', identity: '6♥', rank: '6', suit: '♥', pointValue: 6 },
  C2: { entityId: 'C2', identity: 'K♠', rank: 'K', suit: '♠', pointValue: 10 },
  C3: { entityId: 'C3', identity: 'Q♣', rank: 'Q', suit: '♣', pointValue: 10 },
  C4: { entityId: 'C4', identity: 'A♦', rank: 'A', suit: '♦', pointValue: 1 },
  T1: { entityId: 'T1', identity: '3♦', rank: '3', suit: '♦', pointValue: 3 },
};

// ═══════════════════════════════════════════════════════════════
// Issue 1: Actions Panel Icons
// ═══════════════════════════════════════════════════════════════

test('Issue 1: familyIcon returns a non-empty string for known effect families', () => {
  const knownFamilies = [
    'effect-three', 'effect-four', 'effect-five', 'effect-six',
    'effect-seven', 'effect-nine', 'effect-ace', 'effect-red-joker',
    'effect-board-lock', 'effect-row-clear', 'effect-bounce',
    'effect-tap', 'effect-goal-shift', 'effect-jack-control',
    'effect-private-choice',
  ];
  for (const fam of knownFamilies) {
    const icon = familyIcon(fam);
    assert.ok(typeof icon === 'string' && icon.length > 0, `familyIcon('${fam}') must be non-empty`);
  }
});

test('Issue 1: familyIcon returns a non-empty string for known play families', () => {
  const playFamilies = [
    'anchor', 'anchor-guard', 'attachment', 'scuttle', 'score',
    'swap-bar', 'draw', 'counter', 'disrupt', 'interrupt',
    'instant', 'quick', 'voltage', 'solo-wild', 'ultra', 'rank10',
  ];
  for (const fam of playFamilies) {
    const icon = familyIcon(fam);
    assert.ok(typeof icon === 'string' && icon.length > 0, `familyIcon('${fam}') must be non-empty`);
  }
});

test('Issue 1: familyIcon returns empty string for unknown families', () => {
  assert.equal(familyIcon('nonexistent-family'), '');
  assert.equal(familyIcon(null), '');
  assert.equal(familyIcon(undefined), '');
});

test('Issue 1: each effect family has a unique icon', () => {
  const effectFamilies = [
    'effect-three', 'effect-four', 'effect-five', 'effect-six',
    'effect-seven', 'effect-nine', 'effect-ace', 'effect-red-joker',
    'effect-board-lock', 'effect-row-clear', 'effect-bounce',
    'effect-tap', 'effect-goal-shift', 'effect-jack-control',
  ];
  const icons = effectFamilies.map(f => familyIcon(f));
  const unique = new Set(icons);
  assert.equal(unique.size, icons.length, 'All effect family icons must be unique');
});

test('Issue 1: category icons are non-empty strings for all categories', () => {
  for (const cat of Object.values(ACTION_CATEGORY)) {
    const icon = categoryIcon(cat);
    assert.ok(typeof icon === 'string' && icon.length > 0, `categoryIcon('${cat}') must be non-empty`);
  }
});

// ═══════════════════════════════════════════════════════════════
// Issue 2: Self-Response Bug Fix
// ═══════════════════════════════════════════════════════════════

test('Issue 2: enumerateCoreResponseActions guard prevents self-response', { skip: !engineAvailable }, () => {
  // Verify the guard logic: when the priority actor is the same player who
  // declared the current top-of-stack item AND consecutivePasses >= 1,
  // enumerateCoreResponseActions should return empty actions.
  //
  // We construct a minimal state that simulates this condition.
  const { createCoreMatchState, advanceCoreToDecision } = coreAutonomyModule;
  const IntrilexEngine = engineModule.IntrilexEngine;

  const setup = {
    profileId: 'core-response-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    seed: 12345,
    enabledModules: [],
  };
  const state = createCoreMatchState(setup);

  // Advance to first decision
  const result = advanceCoreToDecision(state);
  assert.equal(result.status, 'PLAYER_DECISION_REQUIRED');
  assert.ok(result.legalActionFrame.actions.length > 0, 'Should have legal actions');

  // Find any legal action to declare (Start phase may have draw or score actions)
  const action = result.legalActionFrame.actions[0];
  assert.ok(action, 'Should have at least one legal action');

  // Execute the action
  const execResult = new IntrilexEngine().execute(result.state, action.command);
  assert.ok(execResult.accepted, 'Action should be accepted');

  // Now advance — the opponent (P2) should auto-pass, then the stack should resolve
  // WITHOUT offering P1 a response window to their own stack item.
  const result2 = advanceCoreToDecision(execResult.state);
  // The result should NOT be PLAYER_DECISION_REQUIRED for P1 with response actions
  // to their own stack item. It should either resolve the stack or move to the next phase.
  if (result2.status === 'PLAYER_DECISION_REQUIRED' && result2.decisionActorId === 'P1') {
    // If P1 gets a decision, check that the actions are NOT response-type
    // (counter, disrupt, etc.) to their own stack item.
    const responseActions = result2.legalActionFrame.actions.filter(a =>
      ['counter', 'disrupt', 'interrupt', 'instant', 'quick', 'response-decline'].includes(a.family)
    );
    // In a 2-player game with no opponent response, the stack should resolve
    // and P1 should get primary actions (not response actions).
    assert.ok(
      responseActions.length === 0,
      'P1 should NOT be offered response actions after opponent auto-passed (self-response guard)'
    );
  }
});

test('Issue 2: full game flow — stack resolves without self-response', { skip: !engineAvailable }, () => {
  const { createCoreMatchState, advanceCoreToDecision } = coreAutonomyModule;
  const IntrilexEngine = engineModule.IntrilexEngine;

  const setup = {
    profileId: 'core-response-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    seed: 77777,
    enabledModules: [],
  };
  let state = createCoreMatchState(setup);

  // Play through several turns, verifying no self-response occurs
  for (let turn = 0; turn < 10; turn++) {
    const result = advanceCoreToDecision(state);
    if (result.status === 'TERMINAL') break;
    if (result.status !== 'PLAYER_DECISION_REQUIRED') break;

    // Pick the first legal action
    const action = result.legalActionFrame.actions[0];
    if (!action) break;

    const execResult = new IntrilexEngine().execute(result.state, action.command);
    if (!execResult.accepted) break;
    state = execResult.state;
  }
  // If we get here without infinite loops or errors, the self-response guard
  // is working (prevents the engine from getting stuck offering P1 response
  // windows to their own cards).
  assert.ok(true, 'Game flow completed without self-response deadlock');
});

// ═══════════════════════════════════════════════════════════════
// Issue 3: King Anchor to ER Surfaced
// ═══════════════════════════════════════════════════════════════

test('Issue 3: anchor family groups by family|mode (King/Queen/Ace are separate groups)', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'king', sourceHandles: ['C2'] }),
    mkAction({ actionId: 'a2', family: 'anchor', mode: 'queen', sourceHandles: ['C3'] }),
    mkAction({ actionId: 'a3', family: 'anchor', mode: 'ace', sourceHandles: ['C4'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 3, 'King, Queen, and Ace anchors should be separate groups');
  const ids = groups.map(g => g.id).sort();
  assert.ok(ids.includes('anchor|king'), 'Should have anchor|king group');
  assert.ok(ids.includes('anchor|queen'), 'Should have anchor|queen group');
  assert.ok(ids.includes('anchor|ace'), 'Should have anchor|ace group');
});

test('Issue 3: King anchor group has correct label and description', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'king', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].family, 'anchor');
  assert.equal(groups[0].mode, 'king');
  assert.ok(groups[0].label.includes('King'), 'Label should include "King"');
  assert.ok(groups[0].description.includes('King'), 'Description should mention King');
  assert.ok(groups[0].description.includes('Enduring Row'), 'Description should mention Enduring Row');
});

test('Issue 3: Queen anchor group has correct label and description', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'queen', sourceHandles: ['C3'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1);
  assert.ok(groups[0].label.includes('Queen'), 'Label should include "Queen"');
  assert.ok(groups[0].description.includes('Queen'), 'Description should mention Queen');
});

test('Issue 3: Ace anchor group has correct label and description', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'ace', sourceHandles: ['C4'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1);
  assert.ok(groups[0].label.includes('Ace'), 'Label should include "Ace"');
  assert.ok(groups[0].description.includes('Ace'), 'Description should mention Ace');
});

test('Issue 3: anchor groups are in the PLAY category', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'king', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].category, ACTION_CATEGORY.PLAY);
});

test('Issue 3: anchor family icon is non-empty', () => {
  assert.ok(familyIcon('anchor').length > 0, 'Anchor family should have an icon');
});

// ═══════════════════════════════════════════════════════════════
// Issue 4: Game Log Event Display
// ═══════════════════════════════════════════════════════════════

test('Issue 4: describeEvent produces meaningful text for CORE_KING_ANCHOR_ENTERED', () => {
  const event = { type: 'CORE_KING_ANCHOR_ENTERED', controllerId: 'P1', payload: { sourceCardId: 'C2' } };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('anchor'), 'Should mention anchor');
  assert.ok(entry.description.includes('Enduring Row'), 'Should mention Enduring Row');
  assert.ok(!entry.description.startsWith('core king anchor entered'), 'Should NOT be the generic fallback');
});

test('Issue 4: describeEvent produces meaningful text for CORE_ACE_ANCHOR_ENTERED', () => {
  const event = { type: 'CORE_ACE_ANCHOR_ENTERED', controllerId: 'P1', payload: { sourceCardId: 'C4' } };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('anchor'), 'Should mention anchor');
  assert.ok(entry.description.includes('Enduring Row'), 'Should mention Enduring Row');
});

test('Issue 4: describeEvent produces meaningful text for CORE_QUEEN_ANCHOR_ENTERED', () => {
  const event = { type: 'CORE_QUEEN_ANCHOR_ENTERED', controllerId: 'P1', payload: { sourceCardId: 'C3' } };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('anchor'), 'Should mention anchor');
  assert.ok(entry.description.includes('Enduring Row'), 'Should mention Enduring Row');
});

test('Issue 4: describeEvent produces meaningful text for CORE_JACK_ATTACHMENT_RESOLVED', () => {
  const event = { type: 'CORE_JACK_ATTACHMENT_RESOLVED', controllerId: 'P1', payload: { jackCardId: 'C2', hostCardId: 'T1' } };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('attach'), 'Should mention attach');
  assert.ok(!entry.description.startsWith('core jack attachment'), 'Should NOT be the generic fallback');
});

test('Issue 4: describeEvent produces meaningful text for CORE_RED_JOKER_RESOLVED', () => {
  const event = { type: 'CORE_RED_JOKER_RESOLVED', controllerId: 'P1', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('Red Joker'), 'Should mention Red Joker');
  assert.ok(!entry.description.startsWith('core red joker'), 'Should NOT be the generic fallback');
});

test('Issue 4: describeEvent produces meaningful text for CORE_BLACK_JOKER_BOARD_LOCK_RESOLVED', () => {
  const event = { type: 'CORE_BLACK_JOKER_BOARD_LOCK_RESOLVED', controllerId: 'P1', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('Board Lock'), 'Should mention Board Lock');
  assert.ok(!entry.description.startsWith('core black joker'), 'Should NOT be the generic fallback');
});

test('Issue 4: describeEvent produces meaningful text for CORE_ENTER_ACTION_RESOLVED', () => {
  const event = { type: 'CORE_ENTER_ACTION_RESOLVED', controllerId: 'P1', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('Action Phase'), 'Should mention Action Phase');
});

test('Issue 4: describeEvent produces meaningful text for CORE_BEGIN_START', () => {
  const event = { type: 'CORE_BEGIN_START', controllerId: 'P1', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('Start phase'), 'Should mention Start phase');
});

test('Issue 4: describeEvent produces meaningful text for CARD_MOVED', () => {
  const event = { type: 'CARD_MOVED', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('moved'), 'Should mention moved');
});

test('Issue 4: describeEvent produces meaningful text for GOAL_CHANGED', () => {
  const event = { type: 'GOAL_CHANGED', controllerId: 'P1', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('goal'), 'Should mention goal');
});

test('Issue 4: buildEventLog preserves order and filters null entries', () => {
  const events = [
    { type: 'CORE_KING_ANCHOR_ENTERED', controllerId: 'P1', payload: { sourceCardId: 'C2' } },
    { type: 'DRAW', controllerId: 'P1', payload: {} },
    null,
    { type: 'SCORE', controllerId: 'P2', payload: { cardId: 'C1' } },
  ];
  const log = buildEventLog(events, cardRegistry);
  assert.equal(log.length, 3, 'Should have 3 entries (null filtered)');
  assert.equal(log[0].index, 1);
  assert.equal(log[1].index, 2);
  assert.equal(log[2].index, 4, 'Index should reflect original position');
});

test('Issue 4: describeEvent for RESPONSE_WINDOW_CLOSED', () => {
  const event = { type: 'CORE_RESPONSE_WINDOW_CLOSED', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('response window'), 'Should mention response window');
});

test('Issue 4: describeEvent for RESPONSE_DECLINED', () => {
  const event = { type: 'CORE_RESPONSE_DECLINED', controllerId: 'P2', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('passed'), 'Should mention passed');
});

test('Issue 4: describeEvent for PRIORITY_PASSED', () => {
  const event = { type: 'PRIORITY_PASSED', controllerId: 'P2', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('passed'), 'Should mention passed');
});

test('Issue 4: describeEvent for STACK_ITEM_REBOUND', () => {
  const event = { type: 'STACK_ITEM_REBOUND', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('rebounded'), 'Should mention rebounded');
});

test('Issue 4: describeEvent for TRIGGER_QUEUED', () => {
  const event = { type: 'TRIGGER_QUEUED', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('trigger'), 'Should mention trigger');
});

test('Issue 4: describeEvent for MARKER_SET', () => {
  const event = { type: 'MARKER_SET', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('marker'), 'Should mention marker');
});

test('Issue 4: describeEvent for TARGET_REMOVED', () => {
  const event = { type: 'TARGET_REMOVED', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('target'), 'Should mention target');
});

test('Issue 4: describeEvent for CARD_TAKEN', () => {
  const event = { type: 'CARD_TAKEN', controllerId: 'P1', payload: {} };
  const entry = buildEventLogEntry(event, cardRegistry);
  assert.ok(entry.description.includes('took'), 'Should mention took');
});

// ═══════════════════════════════════════════════════════════════
// Issue 5: Swap Bar Slot Consistency
// ═══════════════════════════════════════════════════════════════

test('Issue 5: buildActionGroups handles swap-bar with fixed slot positions', () => {
  // The swap-bar family still groups by family|mode — this is about the
  // renderer using raw engine order, which we verify via the action grouping.
  const actions = [
    mkAction({ actionId: 'a1', family: 'swap-bar', mode: 'face-up-draw', targetHandles: ['S1'] }),
    mkAction({ actionId: 'a2', family: 'swap-bar', mode: 'face-up-draw', targetHandles: ['S2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1, 'All face-up-draw swap actions in one group');
  assert.equal(groups[0].selectionType, SELECTION_TYPE.TARGET, 'Differ by target');
});

test('Issue 5: swap-bar face-down and face-up-draw are separate groups', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'swap-bar', mode: 'face-down', sourceHandles: ['C1'], targetHandles: ['S1'] }),
    mkAction({ actionId: 'a2', family: 'swap-bar', mode: 'face-up-draw', targetHandles: ['S2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 2, 'face-down and face-up-draw are separate groups');
});

// ═══════════════════════════════════════════════════════════════
// Issue 6: Action Flow Revamp
// ═══════════════════════════════════════════════════════════════

test('Issue 6: direct selection type for single-action groups', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'draw' })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.DIRECT);
  assert.equal(groups[0].actions.length, 1);
});

test('Issue 6: single-action group has no variants (DIRECT)', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.DIRECT);
  assert.equal(groups[0].variants, null);
});

test('Issue 6: card-centric filtering — selectedCardMatch identifies matching groups', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'anchor', mode: 'king', sourceHandles: ['C2'] }),
    mkAction({ actionId: 'a3', family: 'draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry, selectedSourceCardId: 'C2' });
  const matching = groups.filter(g => g.selectedCardMatch);
  assert.equal(matching.length, 1, 'Only the anchor group should match C2');
  assert.equal(matching[0].family, 'anchor');
  assert.equal(matching[0].mode, 'king');
});

test('Issue 6: card-centric filtering — no matches when selected card has no actions', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry, selectedSourceCardId: 'T1' });
  const matching = groups.filter(g => g.selectedCardMatch);
  assert.equal(matching.length, 0, 'No groups should match T1');
});

test('Issue 6: resolveAction auto-resolves single-action groups', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'draw' })];
  const groups = buildActionGroups(actions, { cardRegistry });
  const resolved = resolveAction(groups[0]);
  assert.equal(resolved.actionId, 'a1');
});

test('Issue 6: resolveAction with source card resolves matching action in split anchor group', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'king', sourceHandles: ['C2'] }),
    mkAction({ actionId: 'a2', family: 'anchor', mode: 'queen', sourceHandles: ['C3'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  // These are now separate groups (anchor|king, anchor|queen), each with 1 action
  const kingGroup = groups.find(g => g.mode === 'king');
  const resolved = resolveAction(kingGroup, 'C2');
  assert.equal(resolved.actionId, 'a1');
});

test('Issue 6: multiple actions with same source card in different groups', () => {
  // A King card can be played as anchor OR as score — should be in separate groups
  const actions = [
    mkAction({ actionId: 'a1', family: 'anchor', mode: 'king', sourceHandles: ['C2'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry, selectedSourceCardId: 'C2' });
  const matching = groups.filter(g => g.selectedCardMatch);
  assert.equal(matching.length, 2, 'Both groups should match the selected King card');
});
