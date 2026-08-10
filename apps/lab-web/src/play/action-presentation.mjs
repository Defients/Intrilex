// ═══════════════════════════════════════════════════════════════
// action-presentation.mjs — Semantic action grouping layer
//
// Transforms raw engine legal-action permutations into player-facing
// intent groups following the progressive disclosure model:
//
//   Intent → Variant → Target → Confirmation
//
// The engine remains authoritative. This module only determines:
//   - which actions belong together,
//   - how the group is described,
//   - which decision dimension comes next.
//
// It must NOT manufacture legality.
// ═══════════════════════════════════════════════════════════════

import { familyLabel, modeLabel, shortActionLabel, actionLabel, timingLabel } from './action-presenter.js';

// ── Category definitions ───────────────────────────────────────

/**
 * Semantic categories for action grouping.
 * Ordered by player-purpose priority.
 */
export const ACTION_CATEGORY = Object.freeze({
  PLAY: 'play',
  SCORE: 'score',
  MANIPULATE: 'manipulate',
  RESPOND: 'respond',
  SYSTEM: 'system',
});

const CATEGORY_LABELS = Object.freeze({
  [ACTION_CATEGORY.PLAY]: 'Play',
  [ACTION_CATEGORY.SCORE]: 'Score',
  [ACTION_CATEGORY.MANIPULATE]: 'Manipulate',
  [ACTION_CATEGORY.RESPOND]: 'Respond',
  [ACTION_CATEGORY.SYSTEM]: 'System',
});

const CATEGORY_ICONS = Object.freeze({
  [ACTION_CATEGORY.PLAY]: '\u25B8',
  [ACTION_CATEGORY.SCORE]: '\u2605',
  [ACTION_CATEGORY.MANIPULATE]: '\u21C4',
  [ACTION_CATEGORY.RESPOND]: '\u21A9',
  [ACTION_CATEGORY.SYSTEM]: '\u2699',
});

// ── Family → category mapping ──────────────────────────────────

const EFFECT_FAMILIES = new Set([
  'effect-three', 'effect-four', 'effect-five', 'effect-six',
  'effect-seven', 'effect-nine', 'effect-ace', 'effect-red-joker',
  'effect-board-lock', 'effect-row-clear', 'effect-bounce',
  'effect-tap', 'effect-goal-shift', 'effect-jack-control',
  'effect-private-choice',
]);

const PLAY_FAMILIES = new Set([
  'solo-wild', 'ultra', 'scuttle', 'anchor', 'anchor-guard',
  'anchor-private-choice', 'attachment', 'rank10', 'voltage',
  'royal-marriage', 'queens-court', 'wild-sovereignty',
  'super-ace', 'king-spade-counter', 'board-lock',
  'sudden-death-autonomy',
]);

const SCORE_FAMILIES = new Set(['score', 'play-for-points']);

const MANIPULATE_FAMILIES = new Set(['swap-bar']);

const RESPONSE_FAMILIES = new Set([
  'counter', 'disrupt', 'interrupt', 'instant', 'quick',
  'response-decline',
]);

const SYSTEM_FAMILIES = new Set([
  'draw', 'phase', 'exhausted-pass', 'private-choice',
]);

/**
 * Map an action family to a semantic category.
 * @param {string} family
 * @param {object} action - The action object (for fallback checks)
 * @returns {string} One of ACTION_CATEGORY values
 */
export function familyToCategory(family, action) {
  const fam = family ?? 'unknown';
  if (EFFECT_FAMILIES.has(fam)) return ACTION_CATEGORY.PLAY;
  if (PLAY_FAMILIES.has(fam)) return ACTION_CATEGORY.PLAY;
  if (SCORE_FAMILIES.has(fam)) return ACTION_CATEGORY.SCORE;
  if (MANIPULATE_FAMILIES.has(fam)) return ACTION_CATEGORY.MANIPULATE;
  if (RESPONSE_FAMILIES.has(fam)) return ACTION_CATEGORY.RESPOND;
  if (SYSTEM_FAMILIES.has(fam)) return ACTION_CATEGORY.SYSTEM;
  // Fallback: check isResponse / isPass flags
  if (action?.isResponse) return ACTION_CATEGORY.RESPOND;
  if (action?.isExhaustedPass || action?.isDecline) return ACTION_CATEGORY.SYSTEM;
  return ACTION_CATEGORY.PLAY; // Default to play for unknown effect-like families
}

// ── Selection type definitions ─────────────────────────────────

/**
 * How a group's concrete actions differ from each other.
 * Determines the progressive disclosure flow.
 */
export const SELECTION_TYPE = Object.freeze({
  DIRECT: 'direct',         // Single action — no variant needed
  SOURCE: 'source',         // Actions differ by source card only
  VARIANT: 'variant',       // Actions differ by mode/effect
  COMBINATION: 'combination', // Actions differ by source card set
  TARGET: 'target',         // Actions differ by target card
});

// ── Group key computation ──────────────────────────────────────

/**
 * Compute the group key for an action.
 *
 * Group key strategy:
 *   - Most families group by family alone (collapses all modes/sources)
 *   - swap-bar: group by family|mode (face-down vs face-up-draw are
 *     fundamentally different player intents)
 *   - response-decline: always a single group
 *   - phase: group by family|mode (enter-action is the only one but
 *     keep it explicit)
 *
 * @param {object} action - A presented action with family, mode, etc.
 * @returns {string} The group key
 */
function groupKeyForAction(action) {
  const family = action?.family ?? 'unknown';
  const mode = action?.mode ?? null;
  // swap-bar modes are genuinely different intents (place vs take)
  if (family === 'swap-bar') return `swap-bar|${mode}`;
  // phase modes are genuinely different (enter-action vs others)
  if (family === 'phase') return `phase|${mode}`;
  // private-choice families: group by family only (mode is choice-specific)
  if (family === 'private-choice' || family === 'effect-private-choice') return family;
  // All other families: group by family alone
  return family;
}

// ── Variant dimension analysis ─────────────────────────────────

/**
 * Analyze what dimension differs across actions within a group.
 * @param {object[]} actions - All concrete actions in the group
 * @returns {string} One of SELECTION_TYPE values
 */
function detectSelectionType(actions) {
  if (!actions || actions.length <= 1) return SELECTION_TYPE.DIRECT;

  // Check if actions differ by target
  const getTargets = a => (a?.targetHandles ?? a?.targets?.legalTargetIds ?? []);
  const targetSets = new Set(actions.map(a => getTargets(a).join(',')));
  if (targetSets.size > 1) return SELECTION_TYPE.TARGET;

  // Check if actions differ by mode (different effects/variants)
  const modeSet = new Set(actions.map(a => a?.mode ?? ''));
  if (modeSet.size > 1) return SELECTION_TYPE.VARIANT;

  // Check if actions differ by source card set (combination)
  const getSources = a => (a?.sourceHandles ?? a?.sourceEntityIds ?? []);
  const sourceSets = new Set(actions.map(a => getSources(a).slice().sort().join(',')));
  if (sourceSets.size > 1) {
    // If all source sets have the same length > 1, it's a combination
    // If source sets have length 1, it's a simple source choice
    const sourceLengths = new Set(actions.map(a => getSources(a).length));
    if (sourceLengths.has(1) && sourceLengths.size === 1) {
      return SELECTION_TYPE.SOURCE;
    }
    return SELECTION_TYPE.COMBINATION;
  }

  // Same family, mode, sources, targets — true duplicates
  return SELECTION_TYPE.DIRECT;
}

// ── Variant label generation ───────────────────────────────────

/**
 * Generate a human-readable label for a specific variant within a group.
 * Used when the player drills into a group and sees the list of variants.
 * @param {object} action - The concrete action
 * @param {object} cardRegistry - Map of cardId → { identity, ... }
 * @returns {string} Variant label
 */
export function variantLabel(action, cardRegistry) {
  const family = action?.family ?? 'unknown';
  const mode = action?.mode ?? null;
  const sourceHandles = action?.sourceHandles ?? action?.sourceEntityIds ?? [];
  const targetHandles = action?.targetHandles ?? action?.targets?.legalTargetIds ?? [];
  const modeLbl = modeLabel(family, mode);

  // For solo-wild, the mode IS the variant (which effect to copy)
  if (family === 'solo-wild') return modeLbl || mode;

  // For ultra, describe the recipe + effect
  if (family === 'ultra') {
    const srcs = (sourceHandles ?? []).map(id => cardRegistry?.[id]?.identity ?? '?');
    return `${modeLbl || mode} (${srcs.join(' + ')})`;
  }

  // For score, the variant is which card to score
  if (family === 'score' || family === 'play-for-points') {
    const src = sourceHandles?.[0];
    const card = src ? cardRegistry?.[src] : null;
    return card?.identity ?? 'Points';
  }

  // For effect families, the variant is which source card
  if (family.startsWith('effect-') || family === 'anchor' || family === 'anchor-guard') {
    const src = sourceHandles?.[0];
    const card = src ? cardRegistry?.[src] : null;
    return card?.identity ?? familyLabel(family) ?? modeLbl ?? 'Effect';
  }

  // For swap-bar, describe the target (which swap card to take)
  if (family === 'swap-bar' && mode === 'face-up-draw') {
    const tgt = targetHandles?.[0];
    const card = tgt ? cardRegistry?.[tgt] : null;
    return card?.identity ?? 'Swap Card';
  }

  // For swap-bar face-down, describe the source card
  if (family === 'swap-bar' && mode === 'face-down') {
    const src = sourceHandles?.[0];
    const card = src ? cardRegistry?.[src] : null;
    return card?.identity ?? 'Face-down';
  }

  // For response families, the mode describes the counter type
  if (['counter', 'disrupt', 'interrupt', 'instant', 'quick'].includes(family)) {
    return modeLbl || mode || (familyLabel(family) ?? family);
  }

  // Fallback: mode label or source card
  if (modeLbl && modeLbl !== familyLabel(family)) return modeLbl;
  const src = sourceHandles?.[0];
  const card = src ? cardRegistry?.[src] : null;
  return card?.identity ?? modeLbl ?? mode ?? 'Variant';
}

// ── Group description generation ───────────────────────────────

/**
 * Generate a concise description for an action group.
 * @param {object} group - The action group
 * @returns {string} Description text
 */
function groupDescription(group) {
  const { family, category, selectionType, actions } = group;

  if (category === ACTION_CATEGORY.RESPOND) {
    if (family === 'response-decline') return 'Pass priority without responding.';
    return 'Counter or interrupt the current stack item.';
  }

  if (family === 'draw') return 'Draw a card from the top of the Draw Pile.';
  if (family === 'phase') return 'Advance to the Action Phase.';
  if (family === 'exhausted-pass') return 'No legal action — forced pass.';

  if (family === 'score' || family === 'play-for-points') {
    return 'Play a card to your Point Row for its value.';
  }

  if (family === 'swap-bar') {
    if (group.mode === 'face-down') return 'Place a hand card face-down onto the Swap Bar.';
    return 'Take a face-up Swap card into your hand.';
  }

  if (family === 'solo-wild') {
    return 'Copy a rank 3–7 effect using this wild card.';
  }

  if (family === 'ultra') {
    return 'Declare a color-recipe Ultra play for powerful effects.';
  }

  if (family === 'scuttle') {
    return 'Remove a legal card from an opponent\'s row.';
  }

  if (family.startsWith('effect-')) {
    const lbl = familyLabel(family);
    return `${lbl} — play this card for its rank effect.`;
  }

  if (family === 'anchor' || family === 'anchor-guard') {
    return 'Place an Anchor on the Enduring Row for persistent defense.';
  }

  if (family === 'attachment') {
    return 'Attach a Jack to an opposing card to gain control.';
  }

  return '';
}

// ── Main grouping function ─────────────────────────────────────

/**
 * Build semantic action groups from a list of presented actions.
 *
 * @param {object[]} actions - Array of presented action objects
 *   (from presentAction / buildAuthorizedActions)
 * @param {object} options - { cardRegistry, selectedSourceCardId }
 * @returns {object[]} Array of action groups, ordered by category priority
 */
export function buildActionGroups(actions, options = {}) {
  const { cardRegistry = null, selectedSourceCardId = null } = options;

  if (!actions || actions.length === 0) return [];

  // Phase 1: Group actions by group key (skip null/undefined actions)
  const groupMap = new Map();
  for (const action of actions) {
    if (!action) continue;
    const key = groupKeyForAction(action);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(action);
  }

  // Phase 2: Build group objects
  const groups = [];
  for (const [key, groupActions] of groupMap) {
    const first = groupActions[0] ?? {};
    const family = first.family ?? 'unknown';
    const category = familyToCategory(family, first);
    const selectionType = detectSelectionType(groupActions);

    // Collect all source card IDs across actions
    const sourceCardIds = new Set();
    for (const a of groupActions) {
      if (!a) continue;
      for (const sid of a.sourceHandles ?? a.sourceEntityIds ?? []) {
        sourceCardIds.add(sid);
      }
    }

    // Collect all target IDs across actions
    const targetIds = new Set();
    for (const a of groupActions) {
      if (!a) continue;
      const handles = a.targetHandles ?? a.targets?.legalTargetIds ?? [];
      for (const tid of handles) {
        targetIds.add(tid);
      }
    }

    // Determine the group label
    const famLabel = familyLabel(family) ?? 'Unknown';
    let groupLabel = famLabel;
    // For swap-bar, use mode-specific label
    if (family === 'swap-bar') {
      groupLabel = first.mode === 'face-down' ? 'Face-down Swap' : 'Take Swap Card';
    }
    // For phase, use mode-specific label
    if (family === 'phase') {
      groupLabel = 'Enter Action Phase';
    }
    // For response-decline
    if (family === 'response-decline') {
      groupLabel = 'Decline Response';
    }
    // For exhausted-pass
    if (family === 'exhausted-pass') {
      groupLabel = 'Exhausted Pass';
    }

    // Count distinct variants (for the "N options" badge)
    let variantCount = groupActions.length;
    if (selectionType === SELECTION_TYPE.DIRECT) variantCount = 1;

    // Determine if this group is relevant to the selected source card
    let selectedCardMatch = false;
    if (selectedSourceCardId && sourceCardIds.has(selectedSourceCardId)) {
      selectedCardMatch = true;
    }

    // Build the group object
    const group = {
      id: key,
      family,
      mode: first.mode ?? null,
      category,
      label: groupLabel,
      description: null, // set below
      selectionType,
      actions: groupActions,
      sourceCardIds: Array.from(sourceCardIds),
      targetIds: Array.from(targetIds),
      variantCount,
      selectedCardMatch,
      timingClass: first.timingClass ?? 'ACTION',
      timingLabel: timingLabel(first.timingClass ?? 'ACTION'),
      isResponse: first.isResponse ?? false,
      isDecline: first.isDecline ?? false,
      isExhaustedPass: first.isExhaustedPass ?? false,
      isPrivateChoice: first.isPrivateChoice ?? false,
      isPass: first.isExhaustedPass || first.isDecline ||
        family === 'pass' || family === 'exhausted-pass' || family === 'response-decline',
      isFullTurn: first.timingClass === 'ACTION' && !first.isResponse,
      // Score value for score actions
      scoreValue: null,
      // Variant labels for drill-down
      variants: null,
    };

    group.description = groupDescription(group);

    // Extract score value for score actions
    if (family === 'score' || family === 'play-for-points') {
      // Score value comes from the card's point value
      // We try to get it from the card registry
      if (cardRegistry && groupActions[0]?.sourceHandles?.[0]) {
        const card = cardRegistry[groupActions[0].sourceHandles[0]];
        if (card?.pointValue != null) group.scoreValue = card.pointValue;
      }
    }

    // Build variant labels for non-direct groups
    if (selectionType !== SELECTION_TYPE.DIRECT && groupActions.length > 1) {
      const seen = new Set();
      group.variants = [];
      for (const a of groupActions) {
        const v = {
          actionId: a.actionId ?? a.optionId,
          label: variantLabel(a, cardRegistry),
          sourceHandles: a.sourceHandles ?? a.sourceEntityIds ?? [],
          targetHandles: a.targetHandles ?? a.targets?.legalTargetIds ?? [],
          family: a.family,
          mode: a.mode,
        };
        // Deduplicate by label + source handles — the engine may emit
        // multiple actions for the same source card (e.g. swap-bar face-down
        // with identical source but different internal bookkeeping)
        const dedupKey = `${v.label}|${v.sourceHandles.slice().sort().join(',')}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        group.variants.push(v);
      }
    }

    groups.push(group);
  }

  // Phase 3: Sort groups by category priority, then by label
  const categoryOrder = [
    ACTION_CATEGORY.RESPOND, // Response window is most urgent
    ACTION_CATEGORY.PLAY,
    ACTION_CATEGORY.SCORE,
    ACTION_CATEGORY.MANIPULATE,
    ACTION_CATEGORY.SYSTEM,
  ];

  groups.sort((a, b) => {
    const catA = categoryOrder.indexOf(a.category);
    const catB = categoryOrder.indexOf(b.category);
    if (catA !== catB) return catA - catB;
    // Within same category, selected-card matches first
    if (a.selectedCardMatch !== b.selectedCardMatch) {
      return a.selectedCardMatch ? -1 : 1;
    }
    // Then by label
    return (a.label ?? '').localeCompare(b.label ?? '');
  });

  return groups;
}

// ── Category metadata ──────────────────────────────────────────

/**
 * Get the label for a category.
 * @param {string} category
 * @returns {string}
 */
export function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * Get the icon for a category.
 * @param {string} category
 * @returns {string}
 */
export function categoryIcon(category) {
  return CATEGORY_ICONS[category] ?? '';
}

/**
 * Get all categories that have at least one group.
 * @param {object[]} groups
 * @returns {string[]} Ordered list of categories
 */
export function activeCategories(groups) {
  const seen = new Set();
  const ordered = [];
  for (const g of groups) {
    if (!seen.has(g.category)) {
      seen.add(g.category);
      ordered.push(g.category);
    }
  }
  return ordered;
}

/**
 * Filter groups by category.
 * @param {object[]} groups
 * @param {string} category
 * @returns {object[]}
 */
export function groupsByCategory(groups, category) {
  return groups.filter(g => g.category === category);
}

/**
 * Check if the current decision is a response window.
 * @param {object[]} groups
 * @returns {boolean}
 */
export function isResponseWindow(groups) {
  return groups.some(g => g.category === ACTION_CATEGORY.RESPOND && !g.isDecline);
}

/**
 * Resolve a concrete action from a group + optional source card selection.
 * @param {object} group - The action group
 * @param {string|null} sourceCardId - Selected source card (if any)
 * @returns {object|null} The concrete action, or null if ambiguous
 */
export function resolveAction(group, sourceCardId = null) {
  if (!group?.actions) return null;
  if (group.actions.length === 1) return group.actions[0];

  // If a source card is selected, try to find an action that uses it
  if (sourceCardId) {
    const match = group.actions.find(a => {
      if (!a) return false;
      const sources = a.sourceHandles ?? a.sourceEntityIds ?? [];
      return sources.includes(sourceCardId);
    });
    if (match) return match;
  }

  // For direct groups, return the single action
  if (group.selectionType === SELECTION_TYPE.DIRECT) return group.actions[0];

  // Ambiguous — player needs to choose a variant
  return null;
}
