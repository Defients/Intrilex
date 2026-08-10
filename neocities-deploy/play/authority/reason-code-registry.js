// ═══════════════════════════════════════════════════════════════
// reason-code-registry.js — Stable reason codes for action legality
//
// Every visible disabled action or rejection must map to a stable
// reason code with a precise, visibility-safe explanation.
//
// The UI never invents legality. It renders authority data.
// Explanations map to stable reason codes and authority data.
// ═══════════════════════════════════════════════════════════════

/**
 * Stable reason code definitions.
 * Each code has:
 *   - shortText: concise explanation for Layer 1 (Immediate)
 *   - detailedText: fuller explanation for Layer 2 (Why)
 *   - ruleRef: rule reference for deeper inspection
 *   - visibilitySafe: true if the explanation never leaks hidden info
 */
export const REASON_CODES = Object.freeze({
  // ── Priority / timing ──────────────────────────────────────────
  NOT_PRIORITY_HOLDER: {
    code: 'NOT_PRIORITY_HOLDER',
    shortText: 'You do not currently hold priority.',
    detailedText: 'This action becomes available during your next legal response or proactive window, unless its source leaves your hand first.',
    ruleRef: 'Priority rules — only the priority holder may declare actions.',
    visibilitySafe: true,
  },
  WRONG_PHASE: {
    code: 'WRONG_PHASE',
    shortText: 'This action is not legal in the current phase.',
    detailedText: 'The current phase does not permit this action type. Wait for the appropriate phase.',
    ruleRef: 'Phase rules — actions are restricted by phase.',
    visibilitySafe: true,
  },
  WRONG_WINDOW: {
    code: 'WRONG_WINDOW',
    shortText: 'This action is not legal in the current window.',
    detailedText: 'The current window (proactive, response, interrupt, or resolution) does not permit this action type.',
    ruleRef: 'Window rules — timing classes restrict when actions can be declared.',
    visibilitySafe: true,
  },
  QUICK_ONLY: {
    code: 'QUICK_ONLY',
    shortText: 'Only Quick actions are legal right now.',
    detailedText: 'The current window permits Quick actions only. Other action types must wait for a proactive window.',
    ruleRef: 'Quick timing — Quick actions can be declared in specific windows.',
    visibilitySafe: true,
  },
  INTERRUPT_ONLY: {
    code: 'INTERRUPT_ONLY',
    shortText: 'Only Interrupt actions are legal right now.',
    detailedText: 'The current window permits Interrupt actions only. Other action types must wait for a proactive window.',
    ruleRef: 'Interrupt timing — Interrupts can be declared in response windows.',
    visibilitySafe: true,
  },
  RESPONSE_ONLY: {
    code: 'RESPONSE_ONLY',
    shortText: 'Only Response actions are legal right now.',
    detailedText: 'The current window permits Response actions only. You may respond to the pending declaration or decline.',
    ruleRef: 'Response timing — Response actions react to pending declarations.',
    visibilitySafe: true,
  },
  FULL_TURN_REQUIRED: {
    code: 'FULL_TURN_REQUIRED',
    shortText: 'This action requires a Full Turn commitment.',
    detailedText: 'This action can only be declared during your Full Turn Action Phase, not during a response window.',
    ruleRef: 'Full Turn rules — some actions require the Action Phase.',
    visibilitySafe: true,
  },

  // ── Source / component issues ──────────────────────────────────
  SOURCE_NOT_AVAILABLE: {
    code: 'SOURCE_NOT_AVAILABLE',
    shortText: 'The source card is not available.',
    detailedText: 'The source card is not in a zone from which it can be played, or it has already been committed this turn.',
    ruleRef: 'Source availability — cards must be in the correct zone and uncommitted.',
    visibilitySafe: true,
  },
  SOURCE_ALREADY_COMMITTED: {
    code: 'SOURCE_ALREADY_COMMITTED',
    shortText: 'This card has already been used this turn.',
    detailedText: 'The source card has already been committed to another action this turn and cannot be reused.',
    ruleRef: 'Commitment rules — a card can only be used once per turn.',
    visibilitySafe: true,
  },
  INSUFFICIENT_COMPONENTS: {
    code: 'INSUFFICIENT_COMPONENTS',
    shortText: 'Not enough components to declare this action.',
    detailedText: 'This action requires multiple component cards (e.g., a Super requires two same-rank cards). You do not have enough eligible components.',
    ruleRef: 'Component rules — multi-card actions require sufficient eligible sources.',
    visibilitySafe: true,
  },
  SUPER_REQUIREMENT_NOT_MET: {
    code: 'SUPER_REQUIREMENT_NOT_MET',
    shortText: 'Super requirements not met.',
    detailedText: 'A Super declaration requires two cards of the same rank. You do not have two eligible same-rank cards in the required zone.',
    ruleRef: 'Super rules — two same-rank cards are required for a Super declaration.',
    visibilitySafe: true,
  },

  // ── Target issues ──────────────────────────────────────────────
  NO_LEGAL_TARGET: {
    code: 'NO_LEGAL_TARGET',
    shortText: 'No legal target available.',
    detailedText: 'This action requires a target, but no legal target exists in the current game state.',
    ruleRef: 'Targeting rules — actions with targets require at least one legal target.',
    visibilitySafe: true,
  },
  TARGET_PROTECTED: {
    code: 'TARGET_PROTECTED',
    shortText: 'The target is protected.',
    detailedText: 'The selected target has an Aegis or other protection effect that prevents this action from affecting it.',
    ruleRef: 'Protection rules — Aegis and similar effects prevent targeting.',
    visibilitySafe: true,
  },
  TARGET_IMMUNE: {
    code: 'TARGET_IMMUNE',
    shortText: 'The target is immune.',
    detailedText: 'The selected target is immune to this type of effect.',
    ruleRef: 'Immunity rules — some effects grant immunity to specific action types.',
    visibilitySafe: true,
  },

  // ── Action state issues ────────────────────────────────────────
  ACTION_ALREADY_USED: {
    code: 'ACTION_ALREADY_USED',
    shortText: 'This action has already been used.',
    detailedText: 'This specific action has already been declared and cannot be repeated.',
    ruleRef: 'Action frequency — some actions can only be declared once.',
    visibilitySafe: true,
  },
  SCORE_REQUIREMENT_NOT_MET: {
    code: 'SCORE_REQUIREMENT_NOT_MET',
    shortText: 'Scoring requirements not met.',
    detailedText: 'This scoring action requires specific conditions (e.g., sufficient points, correct phase) that are not currently satisfied.',
    ruleRef: 'Scoring rules — scoring actions have specific requirements.',
    visibilitySafe: true,
  },

  // ── Profile / configuration ────────────────────────────────────
  PROFILE_DISABLED: {
    code: 'PROFILE_DISABLED',
    shortText: 'This action is not available in the current rules profile.',
    detailedText: 'The current rules profile does not permit this action type.',
    ruleRef: 'Profile rules — each profile enables or disables specific mechanics.',
    visibilitySafe: true,
  },

  // ── Hidden information ─────────────────────────────────────────
  HIDDEN_INFORMATION_REQUIRED: {
    code: 'HIDDEN_INFORMATION_REQUIRED',
    shortText: 'This action requires information you do not have.',
    detailedText: 'This action requires knowledge of hidden cards or state that is not available to you.',
    ruleRef: 'Visibility rules — some actions require authorized visibility.',
    visibilitySafe: true,
  },

  // ── Game state ─────────────────────────────────────────────────
  GAME_ALREADY_TERMINAL: {
    code: 'GAME_ALREADY_TERMINAL',
    shortText: 'The match has already ended.',
    detailedText: 'No further actions can be declared because the match has reached a terminal state.',
    ruleRef: 'Terminal rules — no actions are legal after the match ends.',
    visibilitySafe: true,
  },

  // ── Submission errors (from play-controller) ───────────────────
  NOT_HUMAN_DECISION: {
    code: 'NOT_HUMAN_DECISION',
    shortText: 'No human decision is pending.',
    detailedText: 'The engine is not currently waiting for your input. The game may have advanced or the opponent may be deciding.',
    ruleRef: 'Session state — actions can only be submitted when a human decision is pending.',
    visibilitySafe: true,
  },
  SESSION_MISMATCH: {
    code: 'SESSION_MISMATCH',
    shortText: 'Session mismatch.',
    detailedText: 'The action was submitted for a different session. This may happen if you have multiple tabs open.',
    ruleRef: 'Session integrity — actions must match the active session.',
    visibilitySafe: true,
  },
  STALE_REVISION: {
    code: 'STALE_REVISION',
    shortText: 'The game state has changed.',
    detailedText: 'The action was submitted for an older state. The current frame has been re-rendered with updated legal actions.',
    ruleRef: 'State revision — actions must match the current state revision.',
    visibilitySafe: true,
  },
  STALE_FRAME: {
    code: 'STALE_FRAME',
    shortText: 'The decision frame has changed.',
    detailedText: 'The legal actions have changed since this action was selected. Please review the current options.',
    ruleRef: 'Frame integrity — actions must match the current decision frame.',
    visibilitySafe: true,
  },
  UNKNOWN_ACTION: {
    code: 'UNKNOWN_ACTION',
    shortText: 'Unknown action.',
    detailedText: 'The selected action is not in the current set of legal actions. It may have been removed by a state change.',
    ruleRef: 'Action validity — only current legal actions can be submitted.',
    visibilitySafe: true,
  },
  ENGINE_REJECTION: {
    code: 'ENGINE_REJECTION',
    shortText: 'The engine rejected this action.',
    detailedText: 'The engine determined this action is not legal in the current state. This should not happen during normal play — it indicates a state desynchronization.',
    ruleRef: 'Engine authority — the engine has final say on legality.',
    visibilitySafe: true,
  },

  // ── Save / restore errors ──────────────────────────────────────
  INVALID_SAVE_FORMAT: {
    code: 'INVALID_SAVE_FORMAT',
    shortText: 'Invalid save format.',
    detailedText: 'The save file is not a valid Intrilex player save. It may be corrupted or from an incompatible version.',
    ruleRef: 'Save format — saves must match the expected format.',
    visibilitySafe: true,
  },
  INCOMPATIBLE_ENGINE_VERSION: {
    code: 'INCOMPATIBLE_ENGINE_VERSION',
    shortText: 'Incompatible engine version.',
    detailedText: 'The save was created with a different engine version. The match cannot be resumed.',
    ruleRef: 'Version compatibility — saves require matching engine versions.',
    visibilitySafe: true,
  },
  INCOMPATIBLE_RULES_VERSION: {
    code: 'INCOMPATIBLE_RULES_VERSION',
    shortText: 'Incompatible rules version.',
    detailedText: 'The save was created with different rules. The match cannot be resumed.',
    ruleRef: 'Version compatibility — saves require matching rules versions.',
    visibilitySafe: true,
  },
  SAVE_HASH_MISMATCH: {
    code: 'SAVE_HASH_MISMATCH',
    shortText: 'Save integrity check failed.',
    detailedText: 'The save file\'s integrity hash does not match. The save may be corrupted or tampered with.',
    ruleRef: 'Save integrity — hashes must match for resume.',
    visibilitySafe: true,
  },
  DUPLICATE_TAB: {
    code: 'DUPLICATE_TAB',
    shortText: 'This match is active in another tab.',
    detailedText: 'Another browser tab is currently controlling this match. You can open read-only, take control, or cancel.',
    ruleRef: 'Session lease — only one tab can control a match at a time.',
    visibilitySafe: true,
  },

  // ── Catch-all ──────────────────────────────────────────────────
  UNSUPPORTED_CONFIGURATION: {
    code: 'UNSUPPORTED_CONFIGURATION',
    shortText: 'Unsupported configuration.',
    detailedText: 'The current game configuration is not supported by the engine.',
    ruleRef: 'Configuration — only supported configurations can be played.',
    visibilitySafe: true,
  },
  ORCHESTRATION_LIMIT: {
    code: 'ORCHESTRATION_LIMIT',
    shortText: 'Orchestration limit exceeded.',
    detailedText: 'The engine exceeded its maximum orchestration steps. This indicates a rules loop or engine issue.',
    ruleRef: 'Engine safety — orchestration has a maximum step count.',
    visibilitySafe: true,
  },
  ADVANCE_EXCEPTION: {
    code: 'ADVANCE_EXCEPTION',
    shortText: 'Engine error during advance.',
    detailedText: 'The engine encountered an error while advancing the game state.',
    ruleRef: 'Engine safety — exceptions are caught and reported.',
    visibilitySafe: true,
  },
  AI_POLICY_EXCEPTION: {
    code: 'AI_POLICY_EXCEPTION',
    shortText: 'AI policy error.',
    detailedText: 'The AI policy encountered an error while selecting an action.',
    ruleRef: 'AI safety — policy exceptions are caught and reported.',
    visibilitySafe: true,
  },
  AI_NO_SELECTION: {
    code: 'AI_NO_SELECTION',
    shortText: 'AI made no selection.',
    detailedText: 'The AI policy returned no action selection. This indicates a policy issue.',
    ruleRef: 'AI safety — policies must return a selection.',
    visibilitySafe: true,
  },
  UNKNOWN_STATUS: {
    code: 'UNKNOWN_STATUS',
    shortText: 'Unknown engine status.',
    detailedText: 'The engine returned an unrecognized status. This indicates an engine issue.',
    ruleRef: 'Engine safety — unknown statuses are treated as errors.',
    visibilitySafe: true,
  },
});

/**
 * Get the reason code definition for a code string.
 * Returns a fallback if the code is not recognized.
 */
export function getReasonCode(code) {
  const def = REASON_CODES[code];
  if (def) return def;
  return {
    code: code ?? 'UNKNOWN',
    shortText: 'Unknown reason.',
    detailedText: 'An unknown error occurred.',
    ruleRef: '',
    visibilitySafe: true,
  };
}

/**
 * Get the short explanation text for a reason code.
 */
export function reasonShortText(code) {
  return getReasonCode(code).shortText;
}

/**
 * Get the detailed explanation text for a reason code.
 */
export function reasonDetailedText(code) {
  return getReasonCode(code).detailedText;
}

/**
 * Get the rule reference for a reason code.
 */
export function reasonRuleRef(code) {
  return getReasonCode(code).ruleRef;
}

/**
 * Check if a reason code's explanation is visibility-safe.
 */
export function isVisibilitySafe(code) {
  return getReasonCode(code).visibilitySafe;
}

/**
 * Map an engine rejection error code to a stable reason code.
 * The engine may produce its own error codes; we normalize them.
 */
export function mapEngineRejection(engineErrorCode) {
  const mapping = {
    'NOT_PRIORITY_HOLDER': 'NOT_PRIORITY_HOLDER',
    'WRONG_PHASE': 'WRONG_PHASE',
    'WRONG_WINDOW': 'WRONG_WINDOW',
    'SOURCE_NOT_AVAILABLE': 'SOURCE_NOT_AVAILABLE',
    'SOURCE_ALREADY_COMMITTED': 'SOURCE_ALREADY_COMMITTED',
    'INSUFFICIENT_COMPONENTS': 'INSUFFICIENT_COMPONENTS',
    'SUPER_REQUIREMENT_NOT_MET': 'SUPER_REQUIREMENT_NOT_MET',
    'NO_LEGAL_TARGET': 'NO_LEGAL_TARGET',
    'TARGET_PROTECTED': 'TARGET_PROTECTED',
    'TARGET_IMMUNE': 'TARGET_IMMUNE',
    'ACTION_ALREADY_USED': 'ACTION_ALREADY_USED',
    'SCORE_REQUIREMENT_NOT_MET': 'SCORE_REQUIREMENT_NOT_MET',
    'PROFILE_DISABLED': 'PROFILE_DISABLED',
    'GAME_ALREADY_TERMINAL': 'GAME_ALREADY_TERMINAL',
  };
  return mapping[engineErrorCode] ?? 'ENGINE_REJECTION';
}

/**
 * Audit all reason codes for visibility safety.
 * Returns { total, safe, unsafe, unsafeCodes }.
 */
export function auditReasonCodes() {
  const codes = Object.values(REASON_CODES);
  const unsafe = codes.filter(c => !c.visibilitySafe);
  return {
    total: codes.length,
    safe: codes.length - unsafe.length,
    unsafe: unsafe.length,
    unsafeCodes: unsafe.map(c => c.code),
  };
}
