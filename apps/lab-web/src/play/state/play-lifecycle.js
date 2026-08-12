// ═══════════════════════════════════════════════════════════════
// play-lifecycle.js — UI lifecycle state machine
//
// Maps the engine's SessionState to the v0.17.0 player-facing
// lifecycle states defined in spec section 7.2.
//
// State transitions are driven by runtime authority.
// The UI never advances state independently.
// ═══════════════════════════════════════════════════════════════

/**
 * Engine SessionState values (mirrored from play-controller.js to avoid
 * importing the engine module in unit tests).
 */
const SessionState = Object.freeze({
  EMPTY: 'EMPTY',
  SETTING_UP: 'SETTING_UP',
  ADVANCING: 'ADVANCING',
  HUMAN_DECISION: 'HUMAN_DECISION',
  AI_DECISION: 'AI_DECISION',
  // Network human-vs-human: the remote opponent is deciding. Distinct from
  // AI_DECISION so the UI can show "Opponent is choosing…" vs "AI is choosing…"
  OPPONENT_DECISION: 'OPPONENT_DECISION',
  TERMINAL: 'TERMINAL',
  SAVING: 'SAVING',
  RESTORING: 'RESTORING',
  ERROR: 'ERROR',
});

/**
 * Player-facing lifecycle states (spec section 7.2).
 * These are UI states, not engine states. They map from SessionState.
 */
export const LifecycleState = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  SETUP: 'SETUP',
  MATCH_START: 'MATCH_START',
  AWAITING_PRIORITY: 'AWAITING_PRIORITY',
  SELECTING_ACTION: 'SELECTING_ACTION',
  SELECTING_TARGETS: 'SELECTING_TARGETS',
  CONFIRMING_DECLARATION: 'CONFIRMING_DECLARATION',
  RESOLVING: 'RESOLVING',
  RESPONSE_WINDOW: 'RESPONSE_WINDOW',
  TURN_TRANSITION: 'TURN_TRANSITION',
  TERMINAL: 'TERMINAL',
  SAVING: 'SAVING',
  COMPLETE: 'COMPLETE',
  // Recovery states
  RECOVERABLE_ERROR: 'RECOVERABLE_ERROR',
  SAVE_CONFLICT: 'SAVE_CONFLICT',
  REPLAY_INVALID: 'REPLAY_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
});

/**
 * Map engine SessionState + UI context to player-facing LifecycleState.
 *
 * @param {string} sessionStatus - The engine SessionState
 * @param {object} uiContext - { selectedActionId, selectedTargets, isConfirming, hasError, errorCode }
 * @returns {string} The LifecycleState
 */
export function mapToLifecycleState(sessionStatus, uiContext = {}) {
  const { selectedActionId, selectedTargets, isConfirming, hasError, errorCode } = uiContext;

  // Error states take priority
  if (hasError || sessionStatus === SessionState.ERROR) {
    return classifyErrorState(errorCode);
  }

  // Terminal
  if (sessionStatus === SessionState.TERMINAL) {
    return LifecycleState.TERMINAL;
  }

  // Saving/restoring
  if (sessionStatus === SessionState.SAVING) return LifecycleState.SAVING;
  if (sessionStatus === SessionState.RESTORING) return LifecycleState.MATCH_START;

  // Empty / setup
  if (sessionStatus === SessionState.EMPTY) return LifecycleState.UNINITIALIZED;
  if (sessionStatus === SessionState.SETTING_UP) return LifecycleState.SETUP;

  // Advancing (engine processing)
  if (sessionStatus === SessionState.ADVANCING) return LifecycleState.RESOLVING;

  // Human decision — sub-states based on UI context
  if (sessionStatus === SessionState.HUMAN_DECISION) {
    if (isConfirming) return LifecycleState.CONFIRMING_DECLARATION;
    if (selectedActionId && needsTargets(selectedActionId, uiContext)) {
      if (!selectedTargets || selectedTargets.length === 0) {
        return LifecycleState.SELECTING_TARGETS;
      }
    }
    if (selectedActionId) return LifecycleState.CONFIRMING_DECLARATION;
    return LifecycleState.AWAITING_PRIORITY;
  }

  // AI decision
  if (sessionStatus === SessionState.AI_DECISION) {
    return LifecycleState.RESPONSE_WINDOW;
  }

  // Network opponent decision — same lifecycle state as AI decision
  // (response window / waiting for opponent), but the UI differentiates
  // the label via the viewmodel's OPPONENT_DECISION status.
  if (sessionStatus === SessionState.OPPONENT_DECISION) {
    return LifecycleState.RESPONSE_WINDOW;
  }

  return LifecycleState.UNINITIALIZED;
}

/**
 * Classify an error code into the appropriate recovery state.
 */
function classifyErrorState(errorCode) {
  if (!errorCode) return LifecycleState.RECOVERABLE_ERROR;
  if (errorCode === 'INCOMPATIBLE_ENGINE_VERSION' || errorCode === 'INCOMPATIBLE_RULES_VERSION') {
    return LifecycleState.UNSUPPORTED_VERSION;
  }
  if (errorCode === 'INVALID_SAVE_FORMAT' || errorCode === 'SAVE_HASH_MISMATCH') {
    return LifecycleState.SAVE_CONFLICT;
  }
  if (errorCode === 'DUPLICATE_TAB') {
    return LifecycleState.SESSION_EXPIRED;
  }
  if (errorCode === 'REPLAY_INVALID') {
    return LifecycleState.REPLAY_INVALID;
  }
  return LifecycleState.RECOVERABLE_ERROR;
}

/**
 * Check if an action needs target selection.
 * An action needs targets if its contract has targets.required = true.
 */
function needsTargets(actionId, uiContext) {
  const actionContract = uiContext.actionContracts?.find(c => c.optionId === actionId);
  if (!actionContract) return false;
  return actionContract.targets?.required ?? false;
}

/**
 * Get a human-readable label for a lifecycle state.
 */
export function lifecycleStateLabel(state) {
  const labels = {
    [LifecycleState.UNINITIALIZED]: 'Not started',
    [LifecycleState.SETUP]: 'Setting up match',
    [LifecycleState.MATCH_START]: 'Starting match',
    [LifecycleState.AWAITING_PRIORITY]: 'Awaiting priority',
    [LifecycleState.SELECTING_ACTION]: 'Selecting action',
    [LifecycleState.SELECTING_TARGETS]: 'Selecting targets',
    [LifecycleState.CONFIRMING_DECLARATION]: 'Confirming declaration',
    [LifecycleState.RESOLVING]: 'Resolving',
    [LifecycleState.RESPONSE_WINDOW]: 'Response window',
    [LifecycleState.TURN_TRANSITION]: 'Turn transition',
    [LifecycleState.TERMINAL]: 'Match complete',
    [LifecycleState.SAVING]: 'Saving',
    [LifecycleState.COMPLETE]: 'Complete',
    [LifecycleState.RECOVERABLE_ERROR]: 'Recoverable error',
    [LifecycleState.SAVE_CONFLICT]: 'Save conflict',
    [LifecycleState.REPLAY_INVALID]: 'Replay invalid',
    [LifecycleState.SESSION_EXPIRED]: 'Session expired',
    [LifecycleState.UNSUPPORTED_VERSION]: 'Unsupported version',
  };
  return labels[state] ?? 'Unknown';
}

/**
 * Get the valid transitions from a lifecycle state.
 * Used for validation and debugging.
 */
export function validTransitions(state) {
  const transitions = {
    [LifecycleState.UNINITIALIZED]: [LifecycleState.SETUP],
    [LifecycleState.SETUP]: [LifecycleState.MATCH_START, LifecycleState.UNINITIALIZED],
    [LifecycleState.MATCH_START]: [LifecycleState.AWAITING_PRIORITY, LifecycleState.RESOLVING, LifecycleState.TERMINAL],
    [LifecycleState.AWAITING_PRIORITY]: [LifecycleState.SELECTING_ACTION, LifecycleState.RESOLVING, LifecycleState.RESPONSE_WINDOW, LifecycleState.TERMINAL],
    [LifecycleState.SELECTING_ACTION]: [LifecycleState.SELECTING_TARGETS, LifecycleState.CONFIRMING_DECLARATION, LifecycleState.AWAITING_PRIORITY],
    [LifecycleState.SELECTING_TARGETS]: [LifecycleState.CONFIRMING_DECLARATION, LifecycleState.SELECTING_ACTION],
    [LifecycleState.CONFIRMING_DECLARATION]: [LifecycleState.RESOLVING, LifecycleState.SELECTING_ACTION, LifecycleState.SELECTING_TARGETS, LifecycleState.AWAITING_PRIORITY],
    [LifecycleState.RESOLVING]: [LifecycleState.AWAITING_PRIORITY, LifecycleState.RESPONSE_WINDOW, LifecycleState.TERMINAL, LifecycleState.TURN_TRANSITION],
    [LifecycleState.RESPONSE_WINDOW]: [LifecycleState.AWAITING_PRIORITY, LifecycleState.RESOLVING, LifecycleState.TERMINAL],
    [LifecycleState.TURN_TRANSITION]: [LifecycleState.AWAITING_PRIORITY, LifecycleState.TERMINAL],
    [LifecycleState.TERMINAL]: [LifecycleState.SAVING, LifecycleState.COMPLETE, LifecycleState.UNINITIALIZED],
    [LifecycleState.SAVING]: [LifecycleState.COMPLETE, LifecycleState.TERMINAL],
    [LifecycleState.COMPLETE]: [LifecycleState.UNINITIALIZED, LifecycleState.SETUP],
    // Recovery states can transition back to stable states
    [LifecycleState.RECOVERABLE_ERROR]: [LifecycleState.AWAITING_PRIORITY, LifecycleState.SETUP, LifecycleState.UNINITIALIZED],
    [LifecycleState.SAVE_CONFLICT]: [LifecycleState.SETUP, LifecycleState.UNINITIALIZED],
    [LifecycleState.REPLAY_INVALID]: [LifecycleState.TERMINAL, LifecycleState.UNINITIALIZED],
    [LifecycleState.SESSION_EXPIRED]: [LifecycleState.AWAITING_PRIORITY, LifecycleState.UNINITIALIZED],
    [LifecycleState.UNSUPPORTED_VERSION]: [LifecycleState.UNINITIALIZED, LifecycleState.SETUP],
  };
  return transitions[state] ?? [];
}

/**
 * Check if a transition is valid.
 */
export function isValidTransition(from, to) {
  return validTransitions(from).includes(to);
}
