// ═══════════════════════════════════════════════════════════════
// action-presentation.test.mjs — Tests for the semantic action grouping layer
//
// Verifies that buildActionGroups correctly:
//   - Groups raw engine actions by player-facing intent
//   - Detects the right selection type (direct, source, variant, etc.)
//   - Assigns correct categories (play, score, manipulate, respond, system)
//   - Resolves concrete actions from groups + selected source card
//   - Handles edge cases (empty, single action, multi-source)
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionGroups,
  familyToCategory,
  categoryLabel,
  categoryIcon,
  activeCategories,
  groupsByCategory,
  isResponseWindow,
  resolveAction,
  variantLabel,
  ACTION_CATEGORY,
  SELECTION_TYPE,
} from '../apps/lab-web/src/play/action-presentation.mjs';

// ── Test fixtures ───────────────────────────────────────────────

/** A minimal raw engine action with the fields the module reads. */
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
  T1: { entityId: 'T1', identity: '3♦', rank: '3', suit: '♦', pointValue: 3 },
};

// ── familyToCategory ────────────────────────────────────────────

test('familyToCategory: score families map to SCORE category', () => {
  assert.equal(familyToCategory('score', mkAction()), ACTION_CATEGORY.SCORE);
  assert.equal(familyToCategory('play-for-points', mkAction()), ACTION_CATEGORY.SCORE);
});

test('familyToCategory: effect families map to PLAY category', () => {
  assert.equal(familyToCategory('effect-three', mkAction()), ACTION_CATEGORY.PLAY);
  assert.equal(familyToCategory('effect-ace', mkAction()), ACTION_CATEGORY.PLAY);
  assert.equal(familyToCategory('effect-private-choice', mkAction()), ACTION_CATEGORY.PLAY);
});

test('familyToCategory: play families map to PLAY category', () => {
  assert.equal(familyToCategory('solo-wild', mkAction()), ACTION_CATEGORY.PLAY);
  assert.equal(familyToCategory('ultra', mkAction()), ACTION_CATEGORY.PLAY);
  assert.equal(familyToCategory('scuttle', mkAction()), ACTION_CATEGORY.PLAY);
});

test('familyToCategory: swap-bar maps to MANIPULATE category', () => {
  assert.equal(familyToCategory('swap-bar', mkAction()), ACTION_CATEGORY.MANIPULATE);
});

test('familyToCategory: response families map to RESPOND category', () => {
  assert.equal(familyToCategory('counter', mkAction()), ACTION_CATEGORY.RESPOND);
  assert.equal(familyToCategory('disrupt', mkAction()), ACTION_CATEGORY.RESPOND);
  assert.equal(familyToCategory('response-decline', mkAction()), ACTION_CATEGORY.RESPOND);
});

test('familyToCategory: system families map to SYSTEM category', () => {
  assert.equal(familyToCategory('draw', mkAction()), ACTION_CATEGORY.SYSTEM);
  assert.equal(familyToCategory('phase', mkAction()), ACTION_CATEGORY.SYSTEM);
  assert.equal(familyToCategory('exhausted-pass', mkAction()), ACTION_CATEGORY.SYSTEM);
});

test('familyToCategory: isResponse flag falls back to RESPOND for unknown families', () => {
  assert.equal(familyToCategory('unknown-fam', mkAction({ isResponse: true })), ACTION_CATEGORY.RESPOND);
});

test('familyToCategory: isExhaustedPass falls back to SYSTEM for unknown families', () => {
  assert.equal(familyToCategory('unknown-fam', mkAction({ isExhaustedPass: true })), ACTION_CATEGORY.SYSTEM);
});

test('familyToCategory: unknown family defaults to PLAY', () => {
  assert.equal(familyToCategory('unknown-fam', mkAction()), ACTION_CATEGORY.PLAY);
});

// ── categoryLabel / categoryIcon ────────────────────────────────

test('categoryLabel: returns human-readable labels for all categories', () => {
  assert.equal(categoryLabel(ACTION_CATEGORY.PLAY), 'Play');
  assert.equal(categoryLabel(ACTION_CATEGORY.SCORE), 'Score');
  assert.equal(categoryLabel(ACTION_CATEGORY.MANIPULATE), 'Manipulate');
  assert.equal(categoryLabel(ACTION_CATEGORY.RESPOND), 'Respond');
  assert.equal(categoryLabel(ACTION_CATEGORY.SYSTEM), 'System');
});

test('categoryLabel: returns the raw category for unknown values', () => {
  assert.equal(categoryLabel('unknown'), 'unknown');
});

test('categoryIcon: returns icon characters for all categories', () => {
  for (const cat of Object.values(ACTION_CATEGORY)) {
    const icon = categoryIcon(cat);
    assert.ok(typeof icon === 'string' && icon.length > 0, `Icon for ${cat} must be a non-empty string`);
  }
});

// ── buildActionGroups: basic grouping ───────────────────────────

test('buildActionGroups: returns empty array for empty input', () => {
  assert.deepEqual(buildActionGroups([]), []);
  assert.deepEqual(buildActionGroups(null), []);
  assert.deepEqual(buildActionGroups(undefined), []);
});

test('buildActionGroups: single action produces a single group with DIRECT selection', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].selectionType, SELECTION_TYPE.DIRECT);
  assert.equal(groups[0].variantCount, 1);
  assert.equal(groups[0].actions.length, 1);
});

test('buildActionGroups: groups actions by family (same family → one group)', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
    mkAction({ actionId: 'a3', family: 'score', sourceHandles: ['C3'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1, 'All score actions should be in one group');
  assert.equal(groups[0].actions.length, 3);
  assert.equal(groups[0].variantCount, 3);
  assert.equal(groups[0].selectionType, SELECTION_TYPE.SOURCE, 'Differ by source card → SOURCE');
});

test('buildActionGroups: different families produce separate groups', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score' }),
    mkAction({ actionId: 'a2', family: 'draw' }),
    mkAction({ actionId: 'a3', family: 'phase', mode: 'enter-action' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 3);
  const families = groups.map(g => g.family).sort();
  assert.deepEqual(families, ['draw', 'phase', 'score']);
});

test('buildActionGroups: swap-bar groups by family|mode (different intents)', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'swap-bar', mode: 'face-down' }),
    mkAction({ actionId: 'a2', family: 'swap-bar', mode: 'face-up-draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 2, 'swap-bar face-down and face-up-draw are different intents');
  assert.ok(groups.some(g => g.label === 'Face-down Swap'));
  assert.ok(groups.some(g => g.label === 'Take Swap Card'));
});

test('buildActionGroups: phase groups by family|mode', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'phase', mode: 'enter-action' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Enter Action Phase');
});

// ── buildActionGroups: selection type detection ─────────────────

test('buildActionGroups: actions differing by target → TARGET selection', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'effect-bounce', sourceHandles: ['C1'], targetHandles: ['T1'] }),
    mkAction({ actionId: 'a2', family: 'effect-bounce', sourceHandles: ['C1'], targetHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.TARGET);
});

test('buildActionGroups: actions differing by mode → VARIANT selection', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'solo-wild', mode: 'copy-3' }),
    mkAction({ actionId: 'a2', family: 'solo-wild', mode: 'copy-4' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.VARIANT);
});

test('buildActionGroups: actions differing by multi-source set → COMBINATION selection', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'ultra', sourceHandles: ['C1', 'C2'] }),
    mkAction({ actionId: 'a2', family: 'ultra', sourceHandles: ['C1', 'C3'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.COMBINATION);
});

test('buildActionGroups: single-source actions with same family → SOURCE selection', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.SOURCE);
});

// ── buildActionGroups: selectedCardMatch ────────────────────────

test('buildActionGroups: selectedCardMatch is true when selected card is a source', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry, selectedSourceCardId: 'C1' });
  assert.ok(groups[0].selectedCardMatch, 'Group should match selected card C1');
});

test('buildActionGroups: selectedCardMatch is false when selected card is not a source', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry, selectedSourceCardId: 'T1' });
  assert.ok(!groups[0].selectedCardMatch, 'Group should not match selected card T1');
});

test('buildActionGroups: selectedCardMatch is false when no card is selected', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(!groups[0].selectedCardMatch);
});

// ── buildActionGroups: sorting ──────────────────────────────────

test('buildActionGroups: RESPOND category sorts first (most urgent)', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score' }),
    mkAction({ actionId: 'a2', family: 'counter', isResponse: true }),
    mkAction({ actionId: 'a3', family: 'draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].category, ACTION_CATEGORY.RESPOND, 'Response actions should sort first');
});

test('buildActionGroups: selected-card matches sort before non-matches within same category', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C2'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C1'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry, selectedSourceCardId: 'C1' });
  // Both are in the same group (score family), so this tests the group-level match
  assert.ok(groups[0].selectedCardMatch, 'Score group should match selected card C1');
});

// ── buildActionGroups: variants ─────────────────────────────────

test('buildActionGroups: variants are built for non-direct multi-action groups', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(groups[0].variants, 'Variants should be built');
  assert.equal(groups[0].variants.length, 2);
  assert.equal(groups[0].variants[0].actionId, 'a1');
  assert.equal(groups[0].variants[1].actionId, 'a2');
});

test('buildActionGroups: variants are null for direct (single-action) groups', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(!groups[0].variants, 'Direct groups should not have variants');
});

test('buildActionGroups: variant labels use card identity from registry', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const labels = groups[0].variants.map(v => v.label);
  assert.ok(labels.includes('6♥'), 'Variant label should include card identity 6♥');
  assert.ok(labels.includes('K♠'), 'Variant label should include card identity K♠');
});

// ── buildActionGroups: score value extraction ───────────────────

test('buildActionGroups: scoreValue is extracted from card registry for score family', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].scoreValue, 6, 'Score value should come from card C1 pointValue');
});

test('buildActionGroups: scoreValue is null for non-score families', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'draw' })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].scoreValue, null);
});

test('buildActionGroups: scoreValue is null when card registry is missing the card', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['UNKNOWN'] })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].scoreValue, null);
});

// ── buildActionGroups: isPass / isFullTurn ──────────────────────

test('buildActionGroups: isPass is true for exhausted-pass family', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'exhausted-pass', isExhaustedPass: true })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(groups[0].isPass, 'exhausted-pass should set isPass');
});

test('buildActionGroups: isPass is true for response-decline family', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'response-decline', isDecline: true })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(groups[0].isPass, 'response-decline should set isPass');
});

test('buildActionGroups: isFullTurn is true for ACTION timing without response', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', timingClass: 'ACTION', isResponse: false })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(groups[0].isFullTurn, 'ACTION timing + not response → isFullTurn');
});

test('buildActionGroups: isFullTurn is false for QUICK timing', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'counter', timingClass: 'QUICK', isResponse: true })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(!groups[0].isFullTurn, 'QUICK timing → not isFullTurn');
});

// ── activeCategories / groupsByCategory ─────────────────────────

test('activeCategories: returns categories in priority order', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score' }),
    mkAction({ actionId: 'a2', family: 'counter', isResponse: true }),
    mkAction({ actionId: 'a3', family: 'draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const cats = activeCategories(groups);
  assert.equal(cats[0], ACTION_CATEGORY.RESPOND, 'RESPOND should be first');
  assert.ok(cats.includes(ACTION_CATEGORY.SCORE));
  assert.ok(cats.includes(ACTION_CATEGORY.SYSTEM));
});

test('activeCategories: returns empty array for empty groups', () => {
  assert.deepEqual(activeCategories([]), []);
});

test('groupsByCategory: filters groups to a specific category', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score' }),
    mkAction({ actionId: 'a2', family: 'draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const scoreGroups = groupsByCategory(groups, ACTION_CATEGORY.SCORE);
  assert.equal(scoreGroups.length, 1);
  assert.equal(scoreGroups[0].family, 'score');
  const systemGroups = groupsByCategory(groups, ACTION_CATEGORY.SYSTEM);
  assert.equal(systemGroups.length, 1);
  assert.equal(systemGroups[0].family, 'draw');
});

test('groupsByCategory: returns empty array for category with no groups', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score' })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.deepEqual(groupsByCategory(groups, ACTION_CATEGORY.RESPOND), []);
});

// ── isResponseWindow ────────────────────────────────────────────

test('isResponseWindow: true when any group is in RESPOND category', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score' }),
    mkAction({ actionId: 'a2', family: 'counter', isResponse: true }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(isResponseWindow(groups));
});

test('isResponseWindow: false when no groups are in RESPOND category', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score' }),
    mkAction({ actionId: 'a2', family: 'draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(!isResponseWindow(groups));
});

test('isResponseWindow: false for empty groups', () => {
  assert.ok(!isResponseWindow([]));
});

// ── resolveAction ───────────────────────────────────────────────

test('resolveAction: returns the single action for single-action groups', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] })];
  const groups = buildActionGroups(actions, { cardRegistry });
  const resolved = resolveAction(groups[0]);
  assert.equal(resolved.actionId, 'a1');
});

test('resolveAction: returns matching action when source card is selected', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const resolved = resolveAction(groups[0], 'C2');
  assert.equal(resolved.actionId, 'a2', 'Should resolve to action using card C2');
});

test('resolveAction: returns null when source card does not match any action', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const resolved = resolveAction(groups[0], 'UNKNOWN');
  assert.equal(resolved, null);
});

test('resolveAction: returns null for ambiguous groups without source card', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] }),
    mkAction({ actionId: 'a2', family: 'score', sourceHandles: ['C2'] }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const resolved = resolveAction(groups[0]);
  assert.equal(resolved, null, 'Ambiguous without source → null');
});

test('resolveAction: returns null for null/undefined group', () => {
  assert.equal(resolveAction(null), null);
  assert.equal(resolveAction(undefined), null);
});

test('resolveAction: handles viewmodel-style actions with sourceEntityIds', () => {
  const actions = [
    { actionId: 'a1', family: 'score', mode: null, sourceEntityIds: ['C1'], targets: { legalTargetIds: [] } },
    { actionId: 'a2', family: 'score', mode: null, sourceEntityIds: ['C2'], targets: { legalTargetIds: [] } },
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  const resolved = resolveAction(groups[0], 'C1');
  assert.equal(resolved.actionId, 'a1', 'Should resolve using sourceEntityIds fallback');
});

// ── variantLabel ────────────────────────────────────────────────

test('variantLabel: score variant uses card identity', () => {
  const action = mkAction({ family: 'score', sourceHandles: ['C1'] });
  assert.equal(variantLabel(action, cardRegistry), '6♥');
});

test('variantLabel: ultra variant includes recipe with + separator', () => {
  const action = mkAction({ family: 'ultra', mode: 'super-ace', sourceHandles: ['C1', 'C2'] });
  const label = variantLabel(action, cardRegistry);
  assert.ok(label.includes('6♥'), 'Ultra label should include first source');
  assert.ok(label.includes('K♠'), 'Ultra label should include second source');
  assert.ok(label.includes('+'), 'Ultra label should use + separator');
});

test('variantLabel: solo-wild variant uses mode label', () => {
  const action = mkAction({ family: 'solo-wild', mode: 'copy-3' });
  const label = variantLabel(action, cardRegistry);
  assert.ok(label.length > 0, 'solo-wild label should not be empty');
});

test('variantLabel: handles viewmodel-style actions with sourceEntityIds', () => {
  const action = { family: 'score', mode: null, sourceEntityIds: ['C1'], targets: { legalTargetIds: [] } };
  const label = variantLabel(action, cardRegistry);
  assert.equal(label, '6♥', 'Should use sourceEntityIds fallback to find card identity');
});

// ── Edge cases ──────────────────────────────────────────────────

test('buildActionGroups: handles actions with no sourceHandles', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'draw' }),
    mkAction({ actionId: 'a2', family: 'phase', mode: 'enter-action' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].sourceCardIds.length, 0);
});

test('buildActionGroups: handles actions with targets.legalTargetIds (viewmodel format)', () => {
  const actions = [
    { actionId: 'a1', family: 'effect-bounce', mode: null, sourceEntityIds: ['C1'], targets: { legalTargetIds: ['T1'] } },
    { actionId: 'a2', family: 'effect-bounce', mode: null, sourceEntityIds: ['C1'], targets: { legalTargetIds: ['C2'] } },
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.equal(groups[0].selectionType, SELECTION_TYPE.TARGET, 'Should detect TARGET selection from viewmodel format');
  assert.ok(groups[0].targetIds.includes('T1'));
  assert.ok(groups[0].targetIds.includes('C2'));
});

test('buildActionGroups: group id is stable for same family', () => {
  const actions1 = [mkAction({ actionId: 'a1', family: 'score' })];
  const actions2 = [mkAction({ actionId: 'a2', family: 'score' })];
  const groups1 = buildActionGroups(actions1, { cardRegistry });
  const groups2 = buildActionGroups(actions2, { cardRegistry });
  assert.equal(groups1[0].id, groups2[0].id, 'Same family should produce same group id');
});

test('buildActionGroups: group id differs for swap-bar modes', () => {
  const actions = [
    mkAction({ actionId: 'a1', family: 'swap-bar', mode: 'face-down' }),
    mkAction({ actionId: 'a2', family: 'swap-bar', mode: 'face-up-draw' }),
  ];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.notEqual(groups[0].id, groups[1].id, 'Different swap-bar modes should have different group ids');
});

test('buildActionGroups: description is populated for groups', () => {
  const actions = [mkAction({ actionId: 'a1', family: 'score', sourceHandles: ['C1'] })];
  const groups = buildActionGroups(actions, { cardRegistry });
  assert.ok(groups[0].description !== null, 'Description should be populated');
  assert.ok(typeof groups[0].description === 'string');
});

// ── ACTION_CATEGORY / SELECTION_TYPE immutability ───────────────

test('ACTION_CATEGORY is frozen', () => {
  assert.ok(Object.isFrozen(ACTION_CATEGORY));
});

test('SELECTION_TYPE is frozen', () => {
  assert.ok(Object.isFrozen(SELECTION_TYPE));
});

test('SELECTION_TYPE has all expected values', () => {
  assert.equal(SELECTION_TYPE.DIRECT, 'direct');
  assert.equal(SELECTION_TYPE.SOURCE, 'source');
  assert.equal(SELECTION_TYPE.VARIANT, 'variant');
  assert.equal(SELECTION_TYPE.COMBINATION, 'combination');
  assert.equal(SELECTION_TYPE.TARGET, 'target');
});
