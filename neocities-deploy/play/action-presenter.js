// ═══════════════════════════════════════════════════════════════
// action-presenter.js — Maps engine action semantics to player copy
// Never constructs commands. Never decides legality.
// Only translates engine-enumerated family/mode/timing into labels.
// ═══════════════════════════════════════════════════════════════

/**
 * Static family → player label map.
 * Covers 100% of engine-emitted action families across both supported profiles.
 */
const FAMILY_LABELS = Object.freeze({
  'draw': 'Draw',
  'score': 'Play for Points',
  'play-for-points': 'Play for Points',
  'scuttle': 'Scuttle',
  'swap-bar': 'Swap Bar',
  'counter': 'Counter',
  'disrupt': 'Disrupt',
  'instant': 'Instant',
  'quick': 'Quick',
  'interrupt': 'Interrupt',
  'response-decline': 'Decline response',
  'exhausted-pass': 'Exhausted Pass',
  'phase': 'Phase Transition',
  'private-choice': 'Private Choice',
  'effect-three': 'Three — Bounce',
  'effect-four': 'Four — Row Clear',
  'effect-five': 'Five — Recycle',
  'effect-six': 'Six — Dig',
  'effect-seven': 'Seven — Topdeck',
  'effect-nine': 'Nine — Tap',
  'effect-ace': 'Ace — Purge',
  'effect-red-joker': 'Red Joker',
  'effect-board-lock': 'Black Joker — Board Lock',
  'effect-row-clear': 'Row Clear',
  'effect-bounce': 'Bounce',
  'effect-tap': 'Tap',
  'effect-goal-shift': 'Goal Shift',
  'effect-jack-control': 'Jack — Attachment',
  'effect-private-choice': 'Private Choice Effect',
  'anchor': 'Anchor',
  'anchor-guard': 'Anchor Guard',
  'anchor-private-choice': 'Anchor Choice',
  'attachment': 'Attachment',
  'rank10': 'Rank 10 — Advanced',
  'ultra': 'Ultra',
  'voltage': 'Voltage',
  'solo-wild': 'Solo Wild',
});

/**
 * Mode label generators for known static modes.
 * Dynamic modes (card-ID-based) get a generic but informative label.
 */
const MODE_LABELS = Object.freeze({
  'top': 'from top of Draw Pile',
  'top-dp': 'from top of Draw Pile',
  'points': 'to Point Row',
  'score-pr': 'to Point Row',
  'ordinary': 'against target',
  'face-down': 'face-down to Swap Bar',
  'face-up-draw': 'take face-up Swap card',
  'decline': 'decline to respond',
  'forced-mini-turn': 'forced — no legal action',
  'enter-action': 'Enter Action Phase',
  'ace-base': 'Ace base counter',
  'ace-anchor': 'Ace anchor counter',
  'ace-spade': 'Ace spade counter',
  'king-anchor': 'King anchor counter',
  'king-specialized': 'King specialized counter',
  'super-ace': 'Super Ace counter',
  'eight-scuttle': 'Eight scuttle counter',
  'eight-aegis-field': 'Aegis field',
  'eight-spade-free-scuttle': 'free scuttle',
  'queen-aegis': 'Queen Aegis',
  'queen': 'Queen',
  'king': 'King',
  'ace': 'Ace',
  'jack': 'Jack',
  'jack-pr': 'Jack to Point Row',
  'nine': 'Nine',
  'nine-tap': 'tap target',
  'nine-anchor-discard': 'anchor discard',
  'black-joker': 'Black Joker',
  'hand-swap': 'hand swap',
  'opponent-attack': 'opponent attack',
  'self-reset': 'self reset',
  'shuffle-reset': 'shuffle reset',
  'bottom': 'to bottom',
  'er': 'Enduring Row',
  'pr': 'Point Row',
  'pr-attachment': 'PR attachment',
  'five-recycle': 'recycle five',
  'five-gy-bottom': 'GY bottom',
  'five-refine': 'refine',
  'seven-topdeck': 'topdeck seven',
  'six-dig': 'dig six',
  'three-force-discard': 'force discard',
  'three-present-take': 'present and take',
  'three-hand': 'hand raid',
  'three-points': 'three points',
  'three-bounce-top': 'bounce to top',
  'three-black-bounce-top': 'bounce to top',
  'three-black-clear-er': 'clear Enduring Row',
  'three-black-clear-pr': 'clear Point Row',
  'three-black-jack-pr': 'Jack PR',
  'three-black-queen': 'Queen',
  'three-red-counter': 'red counter',
  'clear-er': 'clear Enduring Row',
  'clear-pr': 'clear Point Row',
  'total-clear': 'total clear',
  'bounce-top': 'bounce to top',
  'purge-aegis': 'purge Aegis',
  'purge-anchor-bounce': 'purge anchor bounce',
  'club-foundation': 'club foundation',
  'club-foundation-bonus': 'club foundation bonus',
  'heart-tempo': 'heart tempo',
  'diamond-mimic-row-exchange-er': 'Mimic row exchange (ER)',
  'diamond-mimic-row-exchange-pr': 'Mimic row exchange (PR)',
  'diamond-mimic-paired-row-exchange-pr': 'paired Mimic row exchange (PR)',
  'rank10-stack-theft': 'Stack Theft',
  'rank3-present': 'present',
  'rank3-take': 'take',
  'rank3-discard': 'discard',
  'rank5-rummage': 'rummage',
  'rank6-keep-all-discard': 'keep all, discard',
  'rank6-keep-return-bottom': 'keep, return bottom',
  'rank6-keep-return-top': 'keep, return top',
  'rank7-hand-and-effect': 'hand and effect',
  'rank7-hand-and-score': 'hand and score',
  'rank7-score-only': 'score for points',
  'rank7-generated-score': 'score for points',
  'rank7-generated-unavailable': 'no legal effect',
  'no-legal-effect': 'no legal effect',
  'select-none': 'select none',
  '2-black-2-red-draw': '2 black 2 red draw',
  '2-black-2-red-rummage': '2 black 2 red rummage',
  'deep-draw': 'deep draw',
  'plus-3': '+3',
});

// Rank-7 generated effect mode prefixes → labels
const RANK7_LABELS = Object.freeze({
  'rank7-generated-ace-anchor': 'generated Ace anchor',
  'rank7-generated-black-joker-board-lock': 'generated Black Joker',
  'rank7-generated-five-recycle': 'generated Five recycle',
  'rank7-generated-four-row-clear': 'generated Four row clear',
  'rank7-generated-jack-attach': 'generated Jack attach',
  'rank7-generated-king-anchor': 'generated King anchor',
  'rank7-generated-nine-anchor': 'generated Nine anchor',
  'rank7-generated-queen-anchor': 'generated Queen anchor',
  'rank7-generated-seven-topdeck': 'generated Seven topdeck',
  'rank7-generated-six-dig': 'generated Six dig',
  'rank7-generated-three-bounce': 'generated Three bounce',
  'rank7-generated-three-hand-raid': 'generated Three hand raid',
});

/**
 * Timing class labels for player-facing display.
 */
const TIMING_LABELS = Object.freeze({
  'ACTION': 'Action',
  'QUICK': 'Quick',
  'INSTANT': 'Instant',
  'INTERRUPT': 'Interrupt',
  'SETUP': 'Setup',
});

/**
 * Decision kind classification for the priority banner.
 */
export function classifyDecisionKind(action) {
  if (!action) return 'UNKNOWN';
  if (action.family === 'response-decline') return 'RESPONSE';
  if (action.family === 'phase') return 'PHASE';
  if (action.family === 'private-choice') return 'PRIVATE_CHOICE';
  if (action.family === 'exhausted-pass') return 'EXHAUSTED_PASS';
  if (['counter', 'disrupt', 'interrupt', 'instant', 'quick'].includes(action.family)) return 'RESPONSE';
  if (action.timingClass && ['INSTANT', 'QUICK', 'INTERRUPT'].includes(action.timingClass)) return 'RESPONSE';
  return 'ACTION';
}

/**
 * Get player-facing label for an action family.
 */
export function familyLabel(family) {
  return FAMILY_LABELS[family] ?? null;
}

/**
 * Get player-facing label for an action mode.
 * Handles dynamic modes (card-ID-based) with pattern matching.
 */
export function modeLabel(family, mode) {
  if (!mode) return null;
  // Static mode map
  if (MODE_LABELS[mode]) return MODE_LABELS[mode];
  // Rank-7 generated effects
  if (RANK7_LABELS[mode]) return RANK7_LABELS[mode];
  // Voltage guess modes: four-guess-{rank}-{suit}
  if (/^four-guess-/.test(mode)) {
    const match = mode.match(/^four-guess-(.+)$/);
    return match ? `guess ${match[1]}` : mode;
  }
  // First Contact private-choice dynamic modes
  if (family === 'private-choice' || family === 'effect-private-choice') {
    if (/^select-/.test(mode)) {
      const ids = mode.replace(/^select-/, '').split('-');
      return ids.length === 1 && ids[0] === 'none' ? 'select none' : `select ${ids.length} card(s)`;
    }
    if (/^take-/.test(mode)) return 'take card';
    if (/^keep-all-discard-/.test(mode)) return 'keep all, discard rest';
    if (/^keep-return-bottom-/.test(mode)) return 'keep, return rest to bottom';
    if (/^keep-return-top-/.test(mode)) return 'keep, return rest to top';
    if (/^plus-5-discard-/.test(mode)) return '+5, discard a card';
    if (/^hand-.*-effect-/.test(mode)) return 'hand and effect selection';
    if (/^autonomy-/.test(mode)) return 'engine-guided choice';
    if (mode === 'no-legal-effect') return 'no legal effect';
  }
  // Solo-wild dynamic modes (card-specific)
  if (family === 'solo-wild') {
    if (/^four-row-clear-/.test(mode)) return 'row clear';
    if (/^recycle-five-/.test(mode)) return 'recycle five';
    if (/^three-bounce-/.test(mode)) return 'bounce to top';
    if (/^topdeck-seven-/.test(mode)) return 'topdeck seven';
    if (/^deep-draw-/.test(mode)) return 'deep draw';
  }
  // Ultra dynamic modes
  if (family === 'ultra') {
    if (/^three-black-/.test(mode)) {
      if (mode.includes('bounce')) return 'bounce to top';
      if (mode.includes('clear-er')) return 'clear Enduring Row';
      if (mode.includes('clear-pr')) return 'clear Point Row';
      if (mode.includes('jack-pr')) return 'Jack to PR';
      if (mode.includes('queen')) return 'Queen';
    }
    if (/^three-red-counter/.test(mode)) return 'red counter';
    if (/^2-black-2-red/.test(mode)) return mode.includes('rummage') ? 'rummage' : 'draw';
  }
  // Fallback: return the raw mode but flagged
  return mode;
}

/**
 * Get timing class label.
 */
export function timingLabel(timingClass) {
  return TIMING_LABELS[timingClass] ?? timingClass ?? '';
}

/**
 * Build the full player-facing action label.
 * Format: "{familyLabel} — {modeLabel}" or just "{familyLabel}" if no mode.
 */
export function actionLabel(action) {
  if (!action) return 'Unknown action';
  const fam = familyLabel(action.family);
  if (!fam) return `Unknown action (${action.family})`;
  const mode = modeLabel(action.family, action.mode);
  if (!mode || mode === fam) return fam;
  return `${fam} — ${mode}`;
}

/**
 * Build a short action label for compact UI (buttons, rails).
 */
export function shortActionLabel(action) {
  if (!action) return 'Unknown';
  if (action.family === 'draw') return 'Draw';
  if (action.family === 'score' || action.family === 'play-for-points') return 'Play for Points';
  if (action.family === 'scuttle') return 'Scuttle';
  if (action.family === 'swap-bar') {
    return action.mode === 'face-down' ? 'Face-down Swap' : 'Take Swap Card';
  }
  if (action.family === 'response-decline') return 'Decline response';
  if (action.family === 'exhausted-pass') return 'Exhausted Pass — forced';
  if (action.family === 'phase') return 'Enter Action Phase';
  return familyLabel(action.family) ?? 'Unknown';
}

/**
 * Build a declaration summary for the confirmation step.
 * Shows what the player is about to do.
 */
export function declarationSummary(action, cardRegistry) {
  if (!action) return 'No action selected.';
  const label = actionLabel(action);
  const sources = (action.sourceHandles ?? action.sourceCardIds ?? []).map(id => describeCard(id, cardRegistry));
  const targets = (action.targetHandles ?? action.targetCardIds ?? []).map(id => describeCard(id, cardRegistry));
  const parts = [label];
  if (sources.length > 0) parts.push(`Source: ${sources.join(', ')}`);
  if (targets.length > 0) parts.push(`Target: ${targets.join(', ')}`);
  return parts.join(' · ');
}

/**
 * Describe a card for the declaration summary.
 * Uses the card registry if available, otherwise uses the ID.
 */
function describeCard(cardId, cardRegistry) {
  if (!cardRegistry) return cardId;
  const card = cardRegistry[cardId];
  if (!card) return cardId;
  return card.identity ?? cardId;
}

/**
 * Get a human-readable description of the decision kind for the priority banner.
 */
export function decisionKindLabel(kind) {
  const labels = {
    'ACTION': 'Your action',
    'RESPONSE': 'Response window',
    'PRIVATE_CHOICE': 'Private choice required',
    'EXHAUSTED_PASS': 'Exhausted Pass — forced',
    'PHASE': 'Phase transition',
    'AI_THINKING': 'Opponent deciding',
    'RESOLVING': 'Resolving stack',
    'TERMINAL': 'Match complete',
    'UNKNOWN': 'Waiting...',
  };
  return labels[kind] ?? 'Waiting...';
}

/**
 * Get the priority explainer text for the current decision.
 */
export function priorityExplainer(view, decisionKind, isHumanTurn) {
  if (decisionKind === 'TERMINAL') return 'The match is complete.';
  if (decisionKind === 'RESOLVING') return 'The stack is resolving. No player has priority during resolution.';
  if (decisionKind === 'AI_THINKING') return 'Your opponent is deciding their next move.';
  if (decisionKind === 'ACTION') {
    return isHumanTurn
      ? 'It is your turn. Choose an action to play.'
      : 'It is your opponent\'s turn. You may have a response if they declare something.';
  }
  if (decisionKind === 'RESPONSE') {
    const stack = view?.stack ?? [];
    if (stack.length === 0) return 'You have priority but no pending stack items.';

    return `You can act because you have at least one legal response to the newest pending stack item. Choose a response, or Decline response.`;
  }
  if (decisionKind === 'PRIVATE_CHOICE') {
    return 'A private choice is required. Select from the available options.';
  }
  if (decisionKind === 'EXHAUSTED_PASS') {
    return 'You have no legal action this Mini-Turn. The engine forces an Exhausted Pass.';
  }
  return '';
}

/**
 * Check whether an action family is a response family.
 */
export function isResponseFamily(family) {
  return ['counter', 'disrupt', 'interrupt', 'instant', 'quick', 'response-decline'].includes(family);
}

/**
 * Check whether an action is an exhausted pass (the only gameplay pass).
 */
export function isExhaustedPass(action) {
  return action?.family === 'exhausted-pass';
}

/**
 * Check whether an action is a response decline (not Pass).
 */
export function isResponseDecline(action) {
  return action?.family === 'response-decline';
}

/**
 * Get the full presentation object for an action.
 * This is what the renderer uses to display actions.
 */
export function presentAction(action, cardRegistry) {
  return {
    actionId: action.actionId,
    family: action.family,
    mode: action.mode,
    timingClass: action.timingClass,
    label: actionLabel(action),
    shortLabel: shortActionLabel(action),
    summary: declarationSummary(action, cardRegistry),
    kind: classifyDecisionKind(action),
    isResponse: isResponseFamily(action.family),
    isDecline: isResponseDecline(action),
    isExhaustedPass: isExhaustedPass(action),
    isPrivateChoice: action.family === 'private-choice' || action.family === 'effect-private-choice',
    sourceHandles: [...(action.sourceHandles ?? action.sourceCardIds ?? [])],
    targetHandles: [...(action.targetHandles ?? action.targetCardIds ?? [])],
    featureVector: action.featureVector ?? {},
    commandHash: action.commandHash ?? action.engineCommandHash ?? null,
  };
}

/**
 * Validate that every action family in a list has a player-facing label.
 * Returns { covered, uncovered } arrays.
 */
export function auditPresentationCoverage(actions) {
  const covered = [];
  const uncovered = [];
  for (const action of actions) {
    const label = familyLabel(action.family);
    if (label) covered.push(action.actionId);
    else uncovered.push({ actionId: action.actionId, family: action.family, mode: action.mode });
  }
  return { covered, uncovered };
}
