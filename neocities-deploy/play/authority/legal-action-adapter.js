// ═══════════════════════════════════════════════════════════════
// legal-action-adapter.js — Normalizes engine actions into the
// v0.17.0 legal-action contract.
//
// The UI never determines legality independently. This adapter
// transforms engine-enumerated actions into the structured contract
// defined in spec section 10.1.
// ═══════════════════════════════════════════════════════════════

import {} from '../action-presenter.js?v=4f30833b427f';

/**
 * Action form classification for Rank Anatomy linking.
 * Maps engine family/mode to the form used in Rank Anatomy.
 */
export function classifyActionForm(action) {
  if (!action) return 'other';
  const { family, mode } = action;

  // Super declarations
  if (family === 'ultra') return 'ultra';
  if (mode && typeof mode === 'string' && mode.startsWith('super-')) return 'super';
  if (family === 'solo-wild') return 'other'; // solo-wild-copy is classified as 'other' by engine

  // Royal Marriage (cross-rank compound)
  if (family === 'royal-marriage' || (mode === 'royal-marriage')) return 'royal-marriage';

  // Scoring
  if (family === 'score' || family === 'play-for-points') return 'score';

  // Swap bar
  if (family === 'swap-bar') return 'swap';

  // Generated effects (rank 7)
  if (mode && typeof mode === 'string' && mode.startsWith('rank7-generated-')) return 'generated';

  // Effects
  if (family && family.startsWith('effect-')) return 'effect';

  // Response/counter
  if (['counter', 'disrupt', 'interrupt', 'instant', 'quick'].includes(family)) return 'response';

  // Pass/decline
  if (family === 'response-decline') return 'pass';
  if (family === 'exhausted-pass') return 'pass';

  // Draw
  if (family === 'draw') return 'draw';

  // Phase
  if (family === 'phase') return 'phase';

  return 'other';
}

/**
 * Classify the rank(s) involved in an action from its source handles.
 * @param {object} action - The presented action
 * @param {object|null} cardRegistry - Map of cardId → { identity, rank, suit }
 * @returns {string[]} Array of rank strings (e.g., ['K', 'Q'])
 */
export function classifyActionRanks(action, cardRegistry) {
  if (!action || !cardRegistry) return [];
  const sources = action.sourceHandles ?? action.sourceCardIds ?? [];
  const ranks = new Set();
  for (const cardId of sources) {
    const card = cardRegistry[cardId];
    if (card?.rank) ranks.add(card.rank);
    else if (card?.identity) {
      // Parse rank from identity (e.g., "K♠" → "K", "10♥" → "10")
      const match = card.identity.match(/^(\d+|[A-Z]+|BJ|RJ)/);
      if (match) ranks.add(match[1]);
    }
  }
  return [...ranks];
}

/**
 * Determine if an action is a Spades variant.
 * @param {object} action - The presented action
 * @param {object|null} cardRegistry - Map of cardId → { identity, rank, suit }
 * @returns {boolean}
 */
export function isSpadesVariant(action, cardRegistry) {
  if (!action || !cardRegistry) return false;
  if (classifyActionForm(action) === 'super') return false; // Super is not ordinary Spades
  if (classifyActionForm(action) === 'ultra') return false;
  const sources = action.sourceHandles ?? action.sourceCardIds ?? [];
  return sources.some(cardId => {
    const card = cardRegistry[cardId];
    return card?.suit === '♠' || (card?.identity && card.identity.endsWith('♠'));
  });
}

/**
 * Determine if an action is a Super declaration.
 * @param {object} action
 * @returns {boolean}
 */
export function isSuperDeclaration(action) {
  return classifyActionForm(action) === 'super';
}

/**
 * Get the Super effect ID from an action, if applicable.
 * @param {object} action
 * @returns {string|null}
 */
export function getSuperEffectId(action) {
  if (!isSuperDeclaration(action)) return null;
  const mode = action.mode ?? '';
  if (mode.startsWith('super-')) return mode;
  return null;
}

/**
 * Build the v0.17.0 legal-action contract from a presented action.
 *
 * @param {object} presentedAction - The action from action-presenter.presentAction()
 * @param {object} options - { cardRegistry, frameHash, actorId }
 * @returns {object} The normalized legal-action contract
 */
export function buildLegalActionContract(presentedAction, options = {}) {
  const { cardRegistry = null, frameHash = null, actorId = null } = options;

  const form = classifyActionForm(presentedAction);
  const ranks = classifyActionRanks(presentedAction, cardRegistry);
  const isSpade = isSpadesVariant(presentedAction, cardRegistry);
  const isSuper = isSuperDeclaration(presentedAction);
  const superEffectId = getSuperEffectId(presentedAction);

  // Determine targets
  const targetHandles = presentedAction.targetHandles ?? [];
  const targets = {
    required: targetHandles.length > 0,
    minimum: targetHandles.length > 0 ? 1 : 0,
    maximum: targetHandles.length > 0 ? targetHandles.length : 0,
    legalTargetIds: [...targetHandles],
  };

  // Build preview (safely derivable facts)
  const preview = buildActionPreview(presentedAction, form, isSuper, superEffectId);

  return {
    optionId: presentedAction.actionId,
    actorId: actorId ?? presentedAction.actorId ?? null,
    sourceEntityIds: [...(presentedAction.sourceHandles ?? [])],
    cardIds: [...(presentedAction.sourceHandles ?? [])],
    rankIds: ranks,
    form,
    isSpadesVariant: isSpade,
    isSuper,
    superEffectId,
    timingClass: presentedAction.timingClass ?? 'ACTION',
    displayLabel: presentedAction.label ?? presentedAction.shortLabel ?? 'Unknown',
    shortExplanationKey: presentedAction.kind ?? 'ACTION',
    requirements: extractRequirements(presentedAction),
    costs: extractCosts(presentedAction, form),
    targets,
    preview,
    reasonCode: 'LEGAL',
    authorityHash: frameHash ?? presentedAction.commandHash ?? null,
    // Preserve original fields for backward compatibility
    family: presentedAction.family,
    mode: presentedAction.mode,
    isResponse: presentedAction.isResponse ?? false,
    isDecline: presentedAction.isDecline ?? false,
    isExhaustedPass: presentedAction.isExhaustedPass ?? false,
    isPrivateChoice: presentedAction.isPrivateChoice ?? false,
  };
}

/**
 * Build a safely derivable action preview.
 * Only includes facts that are certain from the action structure.
 */
function buildActionPreview(action, form, isSuper, superEffectId) {
  const preview = {
    sources: [...(action.sourceHandles ?? [])],
    targets: [...(action.targetHandles ?? [])],
    timingClass: action.timingClass ?? 'ACTION',
    opensResponseWindow: false,
    isFullTurnCommitment: false,
    resolutionUncertain: false,
  };

  // Full Turn commitment
  if (action.timingClass === 'ACTION' && !action.isResponse) {
    preview.isFullTurnCommitment = true;
  }

  // Opens response window
  if (action.timingClass === 'ACTION' || action.timingClass === 'INTERRUPT') {
    preview.opensResponseWindow = true;
  }

  // Resolution uncertainty
  if (action.isResponse || action.timingClass === 'INTERRUPT' || action.timingClass === 'QUICK') {
    preview.resolutionUncertain = true;
  }

  // Super-specific preview
  if (isSuper) {
    preview.isSuper = true;
    preview.superEffectId = superEffectId;
    preview.componentCount = (action.sourceHandles ?? []).length;
    preview.resolutionUncertain = true; // Supers can be countered
  }

  return preview;
}

/**
 * Extract requirements from an action (safely derivable).
 */
function extractRequirements(action) {
  const reqs = [];
  if (action.isPrivateChoice) reqs.push({ type: 'private-choice', description: 'A private choice is required.' });
  if ((action.sourceHandles ?? []).length > 1) reqs.push({ type: 'multi-source', description: 'Multiple source cards required.' });
  if ((action.targetHandles ?? []).length > 0) reqs.push({ type: 'target', description: 'A target is required.' });
  return reqs;
}

/**
 * Extract costs from an action (safely derivable).
 */
function extractCosts(action, form) {
  const costs = [];
  if (action.timingClass === 'ACTION' && !action.isResponse) {
    costs.push({ type: 'full-turn', description: 'Uses your Action Phase for this Full Turn.' });
  }
  if (form === 'super') {
    costs.push({ type: 'super-components', description: 'Consumes two same-rank source cards.' });
  }
  return costs;
}

/**
 * Group legal actions by timing class for the action dock.
 * Groups: Primary, Quick, Interrupt, Response, Score, Pass, System-required
 *
 * @param {object[]} contracts - Array of legal-action contracts
 * @returns {object} Grouped actions { primary: [], quick: [], interrupt: [], response: [], score: [], pass: [], system: [] }
 */
export function groupActionsByTiming(contracts) {
  const groups = {
    primary: [],
    quick: [],
    interrupt: [],
    response: [],
    score: [],
    pass: [],
    system: [],
  };

  for (const c of contracts) {
    if (c.isExhaustedPass || c.isDecline) {
      groups.pass.push(c);
    } else if (c.form === 'score') {
      groups.score.push(c);
    } else if (c.timingClass === 'INTERRUPT') {
      groups.interrupt.push(c);
    } else if (c.timingClass === 'QUICK') {
      groups.quick.push(c);
    } else if (c.isResponse || c.form === 'response') {
      groups.response.push(c);
    } else if (c.form === 'phase' || c.form === 'draw') {
      groups.system.push(c);
    } else {
      groups.primary.push(c);
    }
  }

  return groups;
}

/**
 * Filter legal actions by source card selection.
 * Returns only actions whose sourceEntityIds include the selected card.
 *
 * @param {object[]} contracts - Array of legal-action contracts
 * @param {string|null} selectedSourceCardId - The selected card ID
 * @returns {object[]} Filtered actions
 */
export function filterBySourceCard(contracts, selectedSourceCardId) {
  if (!selectedSourceCardId) return contracts;
  return contracts.filter(c => c.sourceEntityIds.includes(selectedSourceCardId));
}

/**
 * Find actions that are eligible for a given card (for card highlighting).
 *
 * @param {object[]} contracts - Array of legal-action contracts
 * @param {string} cardId - The card to check
 * @returns {object[]} Actions that use this card as a source
 */
export function actionsForCard(contracts, cardId) {
  return contracts.filter(c => c.sourceEntityIds.includes(cardId));
}
