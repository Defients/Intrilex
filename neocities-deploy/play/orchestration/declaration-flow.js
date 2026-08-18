// ═══════════════════════════════════════════════════════════════
// declaration-flow.js — Manages the declaration and targeting flow
//
// Sequence (spec section 13.1):
//   Select source → choose declaration form → select targets
//   → review preview → confirm → engine accepts or rejects
//
// Does NOT mutate authoritative state before engine acceptance.
// ═══════════════════════════════════════════════════════════════

import {  actionsForCard } from '../authority/legal-action-adapter.js?v=73653ac8207b';
import { buildWhyExplanation } from '../intelligence/action-explanation.js?v=73653ac8207b';

/**
 * Declaration flow state.
 * This is UI-only state — never persisted, never affects determinism.
 */
export const DeclarationPhase = Object.freeze({
  IDLE: 'IDLE',
  SOURCE_SELECTED: 'SOURCE_SELECTED',
  ACTION_SELECTED: 'ACTION_SELECTED',
  TARGETING: 'TARGETING',
  PREVIEW: 'PREVIEW',
  CONFIRMING: 'CONFIRMING',
  SUBMITTED: 'SUBMITTED',
  REJECTED: 'REJECTED',
});

/**
 * Create a new declaration flow state.
 */
export function createDeclarationFlow() {
  return {
    phase: DeclarationPhase.IDLE,
    selectedSourceCardId: null,
    selectedActionId: null,
    selectedTargetIds: [],
    availableActions: [],
    availableTargets: [],
    preview: null,
    rejectionReason: null,
  };
}

/**
 * Select a source card (from the hand).
 * Returns the updated flow state and the actions available for this card.
 *
 * @param {object} flow - The current declaration flow state
 * @param {string} cardId - The selected card ID
 * @param {object[]} legalActions - The legal action contracts
 * @returns {object} { flow, actionsForCard }
 */
export function selectSourceCard(flow, cardId, legalActions) {
  // Toggle off if same card
  if (flow.selectedSourceCardId === cardId) {
    return {
      flow: resetFlow(flow),
      actionsForCard: [],
    };
  }

  const newFlow = {
    ...flow,
    phase: DeclarationPhase.SOURCE_SELECTED,
    selectedSourceCardId: cardId,
    selectedActionId: null,
    selectedTargetIds: [],
    availableActions: actionsForCard(legalActions, cardId),
    availableTargets: [],
    preview: null,
    rejectionReason: null,
  };

  // If no actions for this card, stay in IDLE with a note
  if (newFlow.availableActions.length === 0) {
    newFlow.phase = DeclarationPhase.IDLE;
    newFlow.rejectionReason = 'SOURCE_NOT_AVAILABLE';
  }

  return { flow: newFlow, actionsForCard: newFlow.availableActions };
}

/**
 * Select an action (declaration form).
 * Returns the updated flow state with target information if needed.
 *
 * @param {object} flow - The current declaration flow state
 * @param {string} actionId - The selected action ID
 * @param {object[]} legalActions - All legal action contracts
 * @param {object} cardRegistry - Card registry for descriptions
 * @returns {object} { flow, needsTargets, preview }
 */
export function selectAction(flow, actionId, legalActions, cardRegistry) {
  const action = legalActions.find(a => a.optionId === actionId);
  if (!action) {
    return {
      flow: { ...flow, phase: DeclarationPhase.REJECTED, rejectionReason: 'UNKNOWN_ACTION' },
      needsTargets: false,
      preview: null,
    };
  }

  const needsTargets = action.targets?.required ?? false;
  const preview = buildWhyExplanation(action, cardRegistry);

  const newFlow = {
    ...flow,
    phase: needsTargets ? DeclarationPhase.TARGETING : DeclarationPhase.PREVIEW,
    selectedActionId: actionId,
    selectedTargetIds: [],
    availableTargets: needsTargets ? (action.targets.legalTargetIds ?? []) : [],
    preview,
    rejectionReason: null,
  };

  return { flow: newFlow, needsTargets, preview };
}

/**
 * Select a target.
 * Returns the updated flow state.
 *
 * @param {object} flow - The current declaration flow state
 * @param {string} targetId - The selected target ID
 * @returns {object} { flow, isComplete }
 */
export function selectTarget(flow, targetId) {
  if (!flow.availableTargets.includes(targetId)) {
    return { flow, isComplete: false };
  }

  // Toggle target selection
  let newTargets;
  if (flow.selectedTargetIds.includes(targetId)) {
    newTargets = flow.selectedTargetIds.filter(id => id !== targetId);
  } else {
    newTargets = [...flow.selectedTargetIds, targetId];
  }

  // Check if we have enough targets
  // For now, single-target actions are most common
  const isComplete = newTargets.length >= 1; // Minimum 1 target

  return {
    flow: {
      ...flow,
      selectedTargetIds: newTargets,
      phase: isComplete ? DeclarationPhase.PREVIEW : DeclarationPhase.TARGETING,
    },
    isComplete,
  };
}

/**
 * Move to confirmation phase.
 *
 * @param {object} flow - The current declaration flow state
 * @returns {object} The updated flow state
 */
export function moveToConfirmation(flow) {
  if (!flow.selectedActionId) return flow;
  return { ...flow, phase: DeclarationPhase.CONFIRMING };
}

/**
 * Cancel the declaration and reset.
 *
 * @param {object} flow - The current declaration flow state
 * @returns {object} The reset flow state
 */
export function cancelDeclaration(flow) {
  return resetFlow(flow);
}

/**
 * Build the submission object for the engine.
 * This does NOT submit — it just prepares the submission.
 *
 * @param {object} flow - The current declaration flow state
 * @param {object} snapshot - The current session snapshot
 * @returns {object|null} The submission object, or null if not ready
 */
export function buildSubmission(flow, snapshot) {
  if (!flow.selectedActionId) return null;
  if (!snapshot?.decision) return null;

  return {
    sessionId: snapshot.sessionId,
    stateRevision: snapshot.decision.stateRevision,
    decisionFrameHash: snapshot.decision.frameHash,
    actionId: flow.selectedActionId,
  };
}

/**
 * Handle engine rejection.
 * Preserves no partial mutation. Explains what changed.
 *
 * @param {object} flow - The current declaration flow state
 * @param {object} result - The engine result { accepted, error, message }
 * @returns {object} The updated flow state with rejection info
 */
export function handleRejection(flow, result) {
  return {
    ...flow,
    phase: DeclarationPhase.REJECTED,
    rejectionReason: result.error ?? 'ENGINE_REJECTION',
    preview: null,
  };
}

/**
 * Handle successful submission.
 * Clears the flow for the next decision.
 *
 * @param {object} flow - The current declaration flow state
 * @returns {object} The reset flow state
 */
export function handleAccepted(flow) {
  return {
    ...createDeclarationFlow(),
    phase: DeclarationPhase.SUBMITTED,
  };
}

/**
 * Reset the declaration flow to idle.
 */
function resetFlow(flow) {
  return {
    ...createDeclarationFlow(),
    phase: DeclarationPhase.IDLE,
    selectedSourceCardId: null,
    selectedActionId: null,
    selectedTargetIds: [],
    availableActions: [],
    availableTargets: [],
    preview: null,
    rejectionReason: null,
  };
}

/**
 * Check if the flow is in a submittable state.
 */
export function isSubmittable(flow) {
  return flow.phase === DeclarationPhase.CONFIRMING && flow.selectedActionId !== null;
}

/**
 * Check if the flow needs target selection.
 */
export function needsTargetSelection(flow) {
  return flow.phase === DeclarationPhase.TARGETING;
}

/**
 * Get a description of the current declaration state for the UI.
 */
export function describeFlowState(flow) {
  switch (flow.phase) {
    case DeclarationPhase.IDLE:
      return 'No action selected.';
    case DeclarationPhase.SOURCE_SELECTED:
      return `Source card selected. Choose an action.`;
    case DeclarationPhase.ACTION_SELECTED:
      return 'Action selected. Review the preview.';
    case DeclarationPhase.TARGETING:
      return 'Select a target for this action.';
    case DeclarationPhase.PREVIEW:
      return 'Review the action preview and confirm.';
    case DeclarationPhase.CONFIRMING:
      return 'Confirm this declaration?';
    case DeclarationPhase.SUBMITTED:
      return 'Action submitted. Waiting for resolution.';
    case DeclarationPhase.REJECTED:
      return `Action rejected: ${flow.rejectionReason ?? 'unknown reason'}`;
    default:
      return '';
  }
}
