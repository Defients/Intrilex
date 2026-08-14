// ═══════════════════════════════════════════════════════════════
// action-introspection.mjs — E4: Action-space introspection API
//
// Provides structured explanations of why each action is legal or
// illegal. Extends the existing reason-code registry with a full
// introspection API that powers:
//   - Academy adjudication UI ("Why?" / "Why not?")
//   - Post-match teaching moments
//   - Beginner-trap diagnostics
//
// This module wraps the engine adapter's legalActions and adds
// structured metadata: reason codes, rule references, and
// visibility-safe explanations.
// ═══════════════════════════════════════════════════════════════

import { REASON_CODE_VOCABULARY } from '@intrilex/decision-intelligence/reason-codes';

/**
 * @typedef {Object} ActionIntrospection
 * @property {string} actionId - The action identifier
 * @property {boolean} legal - Whether the action is legal
 * @property {string|null} reasonCode - Why it's legal/illegal
 * @property {string} shortText - Short explanation
 * @property {string} detailedText - Detailed explanation
 * @property {string|null} ruleRef - Rule reference
 * @property {boolean} visibilitySafe - Safe to show to spectators
 */

/**
 * Introspect a single action against the current state.
 * @param {object} state - Engine state
 * @param {object} action - Action to introspect
 * @param {object} adapter - Engine adapter
 * @returns {ActionIntrospection}
 */
export function introspectAction(state, action, adapter) {
  if (!state || !action || !adapter) {
    return {
      actionId: action?.id ?? 'unknown',
      legal: false,
      reasonCode: 'INVALID_REQUEST',
      shortText: 'Cannot introspect this action',
      detailedText: 'The action or state is missing or invalid.',
      ruleRef: null,
      visibilitySafe: true,
    };
  }

  // Check if the action is in the legal actions list
  const legalActions = adapter.legalActions(state) ?? [];
  const isLegal = legalActions.some(a => a.id === action.id || a.type === action.type);

  if (isLegal) {
    return {
      actionId: action.id ?? action.type ?? 'unknown',
      legal: true,
      reasonCode: 'LEGAL',
      shortText: 'This action is legal in the current game state.',
      detailedText: describeLegalAction(action),
      ruleRef: getRuleRef(action),
      visibilitySafe: true,
    };
  }

  // Action is illegal — determine why
  const reason = determineIllegalReason(state, action, adapter);
  return {
    actionId: action.id ?? action.type ?? 'unknown',
    legal: false,
    reasonCode: reason.code,
    shortText: reason.shortText,
    detailedText: reason.detailedText,
    ruleRef: reason.ruleRef,
    visibilitySafe: reason.visibilitySafe,
  };
}

/**
 * Introspect all legal actions in the current state.
 * @param {object} state - Engine state
 * @param {object} adapter - Engine adapter
 * @returns {ActionIntrospection[]}
 */
export function introspectAllLegalActions(state, adapter) {
  if (!state || !adapter) return [];
  const legalActions = adapter.legalActions(state) ?? [];
  return legalActions.map(action => introspectAction(state, action, adapter));
}

/**
 * Introspect why a specific illegal action is not allowed.
 * Common reasons: wrong phase, insufficient resources, wrong player, etc.
 * @param {object} state - Engine state
 * @param {object} action - The illegal action
 * @param {object} adapter - Engine adapter
 * @returns {{ code: string, shortText: string, detailedText: string, ruleRef: string|null, visibilitySafe: boolean }}
 */
function determineIllegalReason(state, action, adapter) {
  const actionType = action.type ?? action.id ?? 'unknown';
  const phase = state.phase ?? 'UNKNOWN';

  // Check if it's a phase mismatch
  const expectedPhases = ACTION_PHASE_MAP[actionType];
  if (expectedPhases && !expectedPhases.includes(phase)) {
    return {
      code: 'WRONG_PHASE',
      shortText: `Cannot ${actionType} during the ${phase} phase.`,
      detailedText: `This action is only available during: ${expectedPhases.join(', ')}. The current phase is ${phase}.`,
      ruleRef: 'rules/player-rulebook.md#phases',
      visibilitySafe: true,
    };
  }

  // Check if it's a resource issue (e.g., not enough cards)
  if (actionType.includes('draw') && state.drawPile?.count === 0) {
    return {
      code: 'NO_CARDS_TO_DRAW',
      shortText: 'The draw pile is empty.',
      detailedText: 'You cannot draw when there are no cards left in the draw pile.',
      ruleRef: 'rules/player-rulebook.md#draw',
      visibilitySafe: true,
    };
  }

  // Check if it's a scuttle issue (need a higher card)
  if (actionType.includes('scuttle')) {
    return {
      code: 'SCUTTLE_INVALID',
      shortText: 'Cannot scuttle this card.',
      detailedText: 'Scuttling requires a higher-value card than the target. Check the card values.',
      ruleRef: 'rules/player-rulebook.md#scuttle',
      visibilitySafe: true,
    };
  }

  // Generic illegal action
  return {
    code: 'ILLEGAL_ACTION',
    shortText: 'This action is not legal in the current state.',
    detailedText: `The action "${actionType}" is not available. Check the legal actions for the current phase.`,
    ruleRef: null,
    visibilitySafe: true,
  };
}

/** Map of action types to their valid phases */
const ACTION_PHASE_MAP = {
  'play-for-points': ['ACTION'],
  'scuttle': ['ACTION'],
  'draw': ['ACTION'],
  'pass': ['ACTION'],
  'effect-three': ['ACTION'],
  'effect-four': ['ACTION'],
  'effect-five': ['ACTION'],
  'effect-six': ['ACTION'],
  'swap-bar': ['ACTION'],
  'respond': ['RESPONSE'],
  'counter': ['RESPONSE'],
  'decline': ['RESPONSE'],
};

/**
 * Describe a legal action in human-readable terms.
 * @param {object} action
 * @returns {string}
 */
function describeLegalAction(action) {
  const type = action.type ?? action.id ?? 'unknown';
  const card = action.payload?.card ?? action.card ?? '';
  const descriptions = {
    'play-for-points': card ? `Play ${card} into the Point Row for its face value.` : 'Play a card into the Point Row for its face value.',
    'scuttle': card ? `Scuttle an opponent's Point Row card using ${card}.` : 'Scuttle an opponent\'s Point Row card using a higher-value card.',
    'draw': 'Draw a card from the Draw Pile.',
    'pass': 'Pass this turn, taking no action.',
    'effect-three': card ? `Use ${card} to peek at hidden information.` : 'Use a 3 to peek at hidden information.',
    'effect-four': card ? `Use ${card} to scout the opponent's hand.` : 'Use a 4 to scout the opponent\'s hand.',
    'effect-five': card ? `Use ${card} to disrupt or steal from the opponent.` : 'Use a 5 to disrupt or steal from the opponent.',
    'effect-six': card ? `Use ${card} to recycle a card from the graveyard.` : 'Use a 6 to recycle a card from the graveyard.',
    'swap-bar': 'Exchange a hand card with a Swap Bar slot.',
    'respond': 'Respond to the opponent\'s action.',
    'counter': 'Counter the opponent\'s action.',
    'decline': 'Decline to respond (let the action resolve).',
  };
  return descriptions[type] ?? `Perform action: ${type}`;
}

/**
 * Get a rule reference for an action type.
 * @param {object} action
 * @returns {string|null}
 */
function getRuleRef(action) {
  const type = action.type ?? action.id ?? '';
  const refs = {
    'play-for-points': 'rules/player-rulebook.md#scoring',
    'scuttle': 'rules/player-rulebook.md#scuttle',
    'draw': 'rules/player-rulebook.md#draw',
    'pass': 'rules/player-rulebook.md#pass',
    'effect-three': 'rules/player-rulebook.md#effect-3',
    'effect-four': 'rules/player-rulebook.md#effect-4',
    'effect-five': 'rules/player-rulebook.md#effect-5',
    'effect-six': 'rules/player-rulebook.md#effect-6',
    'swap-bar': 'rules/player-rulebook.md#swap-bar',
  };
  return refs[type] ?? null;
}

/**
 * Render an action introspection as HTML for the adjudication UI.
 * @param {ActionIntrospection} intro
 * @returns {string}
 */
export function renderActionIntrospection(intro) {
  if (!intro) return '';
  const legalClass = intro.legal ? 'action-legal' : 'action-illegal';
  const icon = intro.legal ? '✓' : '✗';
  return `<div class="action-introspection ${legalClass}" data-testid="action-introspection" data-legal="${intro.legal}">
    <span class="action-introspection-icon">${icon}</span>
    <div class="action-introspection-content">
      <span class="action-introspection-short" data-testid="action-introspection-short">${intro.shortText}</span>
      <span class="action-introspection-detail" data-testid="action-introspection-detail">${intro.detailedText}</span>
      ${intro.ruleRef ? `<a class="action-introspection-rule" href="#/rulebook#${intro.ruleRef}" data-testid="action-introspection-rule">📖 Rule</a>` : ''}
    </div>
  </div>`;
}

/**
 * Build introspection data for a list of already-known legal actions.
 * Unlike introspectAllLegalActions, this does NOT need an adapter — it
 * assumes all provided actions are legal and builds explanations from
 * the action metadata alone. Suitable for client-side use where the
 * legal actions are already known from the match snapshot.
 *
 * @param {Array<{type?: string, id?: string, family?: string, mode?: string, payload?: object}>} actions
 * @returns {ActionIntrospection[]}
 */
export function explainLegalActions(actions) {
  if (!actions || !Array.isArray(actions)) return [];
  return actions.map(action => ({
    actionId: action.id ?? action.type ?? action.family ?? 'unknown',
    legal: true,
    reasonCode: 'LEGAL',
    shortText: 'This action is legal in the current game state.',
    detailedText: describeLegalAction(action),
    ruleRef: getRuleRef(action),
    visibilitySafe: true,
  }));
}
