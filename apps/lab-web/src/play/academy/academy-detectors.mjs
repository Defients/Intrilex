// ═══════════════════════════════════════════════════════════════
// academy-detectors.mjs — Live objective detection from engine events
//
// Maps canonical engine events to Academy objective IDs. Each detector
// is a pure function that examines a batch of events + snapshot and
// returns the set of objective IDs that are newly satisfied.
//
// Event shapes (from the canonical engine):
//   event.type       — string event type (e.g. 'CORE_ACTION_DECLARED')
//   event.payload    — { playerId?, actorId?, actionType?, cardId?, ... }
//
// The achievement system's EVENT_TYPE_MAP (achievements/facts.mjs) is
// the reference for event type → semantic action mapping. We reuse the
// same event types here for objective detection.
//
// Detectors are stateless — they only look at the current event batch
// + snapshot. The controller tracks which objectives have already been
// met and only adds new ones.
// ═══════════════════════════════════════════════════════════════

/**
 * Extract the actor player ID from an event.
 * @param {object} event
 * @returns {string|null}
 */
function actorOf(event) {
  return event?.payload?.playerId ?? event?.payload?.actorId ?? event?.actorId ?? null;
}

/**
 * Extract the actionType from an event.
 * @param {object} event
 * @returns {string}
 */
function actionTypeOf(event) {
  return String(event?.payload?.actionType ?? '');
}

/**
 * Check if an event was caused by the human player.
 * @param {object} event
 * @param {string} humanId
 * @returns {boolean}
 */
function isHumanEvent(event, humanId) {
  return actorOf(event) === humanId;
}

// ── Event type constants (mirroring achievements/facts.mjs) ──
const EVT = {
  ACTION_DECLARED: 'CORE_ACTION_DECLARED',
  CARD_SCORED: 'CORE_CARD_SCORED',
  CARD_SCORED_ALT: 'CARD_SCORED',
  DRAW_RESOLVED: 'CORE_DRAW_RESOLVED',
  CARDS_DRAWN: 'CARDS_DRAWN_AND_SELECTED',
  COUNTER_DECLARED: 'CORE_COUNTER_DECLARED',
  COUNTER_DECLARED_ALT: 'COUNTER_DECLARED',
  COUNTER_RESOLVED: 'CORE_COUNTER_RESOLVED',
  RESPONSE_WINDOW_CLOSED: 'CORE_RESPONSE_WINDOW_CLOSED',
  PRIORITY_CLOSED: 'PRIORITY_CLOSED',
  FULL_TURN_COMPLETED: 'CORE_FULL_TURN_COMPLETED',
  FULL_TURN_STARTED: 'CORE_START_PREPARED',
  SWAP_RESOLVED: 'CORE_FACE_DOWN_SWAP_RESOLVED',
  SWAP_DRAW_RESOLVED: 'CORE_FACE_UP_SWAP_DRAW_RESOLVED',
  ANCHOR_ENTERED_ACE: 'CORE_ACE_ANCHOR_ENTERED',
  ANCHOR_ENTERED_KING: 'CORE_KING_ANCHOR_ENTERED',
  ANCHOR_ENTERED_QUEEN: 'CORE_QUEEN_ANCHOR_ENTERED',
  ANCHOR_ENTERED_QUEEN_ALT: 'QUEEN_ANCHOR_ENTERED',
  NORMAL_VICTORY: 'CORE_NORMAL_VICTORY',
  EXHAUSTED_RESOLVED: 'CORE_EXHAUSTED_RESOLVED',
  ROOT_RESOLVED: 'CORE_ROOT_RESOLVED',
  ROOT_FIZZLED: 'CORE_ROOT_FIZZLED',
  DECLARATION_COMMITTED: 'DECLARATION_COMMITTED',
};

const DRAW_EVENTS = new Set([EVT.DRAW_RESOLVED, EVT.CARDS_DRAWN]);
const SCORE_EVENTS = new Set([EVT.CARD_SCORED, EVT.CARD_SCORED_ALT]);
const COUNTER_EVENTS = new Set([EVT.COUNTER_DECLARED, EVT.COUNTER_DECLARED_ALT]);
const RESPONSE_CLOSED_EVENTS = new Set([EVT.RESPONSE_WINDOW_CLOSED, EVT.PRIORITY_CLOSED]);
const ANCHOR_EVENTS = new Set([EVT.ANCHOR_ENTERED_ACE, EVT.ANCHOR_ENTERED_KING, EVT.ANCHOR_ENTERED_QUEEN, EVT.ANCHOR_ENTERED_QUEEN_ALT]);
const SWAP_EVENTS = new Set([EVT.SWAP_RESOLVED, EVT.SWAP_DRAW_RESOLVED]);
const VICTORY_EVENTS = new Set([EVT.NORMAL_VICTORY, EVT.EXHAUSTED_RESOLVED]);

/**
 * Check if an action declaration is for points (scoring).
 * @param {string} actionType
 * @returns {boolean}
 */
function isPointsAction(actionType) {
  return actionType === 'play-for-points' || actionType === 'score';
}

/**
 * Check if an action declaration is for an effect.
 * @param {string} actionType
 * @returns {boolean}
 */
function isEffectAction(actionType) {
  return actionType.includes('effect') || actionType === 'scuttle' ||
    actionType.includes('anchor') || actionType.includes('jack') ||
    actionType.includes('queen') || actionType.includes('super') ||
    actionType.includes('rank10') || actionType.includes('peek') ||
    actionType.includes('swap');
}

/**
 * Check if an action declaration is a scuttle (7 effect).
 * @param {string} actionType
 * @returns {boolean}
 */
function isScuttleAction(actionType) {
  return actionType === 'scuttle' || actionType.includes('scuttle');
}

/**
 * Check if an action declaration is an anchor (6 effect).
 * @param {string} actionType
 * @returns {boolean}
 */
function isAnchorAction(actionType) {
  return actionType.includes('anchor');
}

/**
 * Check if an action declaration is a swap (5 effect).
 * @param {string} actionType
 * @returns {boolean}
 */
function isSwapAction(actionType) {
  return actionType.includes('swap');
}

/**
 * Check if an action declaration is a peek (4 effect).
 * @param {string} actionType
 * @returns {boolean}
 */
function isPeekAction(actionType) {
  return actionType.includes('peek');
}

/**
 * Check if an action declaration is a Jack play.
 * @param {string} actionType
 * @returns {boolean}
 */
function isJackAction(actionType) {
  return actionType.includes('jack');
}

/**
 * Check if an action declaration is a Queen play.
 * @param {string} actionType
 * @returns {boolean}
 */
function isQueenAction(actionType) {
  return actionType.includes('queen') || actionType.includes('ultra');
}

/**
 * Detect objectives from a batch of engine events + snapshot.
 *
 * @param {object[]} events - Engine events since last detection
 * @param {object} snapshot - Compact achievement snapshot or full snapshot
 * @param {{ humanPlayerId: string, lesson: object, metObjectives: Set<string>, turnCount: number }} context
 * @returns {{ newlyMet: string[], turnCount: number, effectsUsed: Set<string> }}
 */
export function detectObjectives(events, snapshot, context) {
  const { humanPlayerId: humanId, lesson, metObjectives } = context;
  const newlyMet = [];
  let turnCount = context.turnCount ?? 0;
  /** @type {Set<string>} effect families used by human this match */
  const effectsUsed = new Set(context.effectsUsed ?? []);

  // Collect all objective IDs for this lesson for quick lookup
  const objectiveIds = new Set((lesson.briefing?.objectives ?? []).map((o) => o.id));

  for (const event of events) {
    if (!event || !event.type) continue;
    const type = event.type;
    const isHuman = isHumanEvent(event, humanId);
    const actionType = actionTypeOf(event);

    // ── Turn counting ──
    if (type === EVT.FULL_TURN_COMPLETED) {
      turnCount += 1;
    }

    // ── Draw card ──
    if (DRAW_EVENTS.has(type) && isHuman && objectiveIds.has('draw-card')) {
      if (!metObjectives.has('draw-card')) newlyMet.push('draw-card');
    }

    // ── Play for points ──
    if (SCORE_EVENTS.has(type) && isHuman) {
      if (objectiveIds.has('play-points') && !metObjectives.has('play-points')) {
        newlyMet.push('play-points');
      }
      if (objectiveIds.has('play-to-point-row') && !metObjectives.has('play-to-point-row')) {
        newlyMet.push('play-to-point-row');
      }
    }
    // Also detect via ACTION_DECLARED with play-for-points actionType
    if (type === EVT.ACTION_DECLARED && isHuman && isPointsAction(actionType)) {
      if (objectiveIds.has('play-points') && !metObjectives.has('play-points')) {
        newlyMet.push('play-points');
      }
      if (objectiveIds.has('play-to-point-row') && !metObjectives.has('play-to-point-row')) {
        newlyMet.push('play-to-point-row');
      }
    }

    // ── Scuttle (7 effect) ──
    if (type === EVT.ACTION_DECLARED && isHuman && isScuttleAction(actionType)) {
      effectsUsed.add('scuttle');
      if (objectiveIds.has('scuttle-opponent') && !metObjectives.has('scuttle-opponent')) {
        newlyMet.push('scuttle-opponent');
      }
    }

    // ── Anchor (6 effect) ──
    if ((ANCHOR_EVENTS.has(type) || (type === EVT.ACTION_DECLARED && isHuman && isAnchorAction(actionType))) && isHuman) {
      effectsUsed.add('anchor');
      if (objectiveIds.has('anchor-card') && !metObjectives.has('anchor-card')) {
        newlyMet.push('anchor-card');
      }
    }

    // ── Swap (5 effect) ──
    if ((SWAP_EVENTS.has(type) || (type === EVT.ACTION_DECLARED && isHuman && isSwapAction(actionType))) && isHuman) {
      effectsUsed.add('swap');
      if (objectiveIds.has('play-swap') && !metObjectives.has('play-swap')) {
        newlyMet.push('play-swap');
      }
    }

    // ── Peek (4 effect) ──
    if (type === EVT.ACTION_DECLARED && isHuman && isPeekAction(actionType)) {
      effectsUsed.add('peek');
      if (objectiveIds.has('play-peek') && !metObjectives.has('play-peek')) {
        newlyMet.push('play-peek');
      }
    }

    // ── Jack play ──
    if (type === EVT.ACTION_DECLARED && isHuman && isJackAction(actionType)) {
      effectsUsed.add('jack');
      if (objectiveIds.has('play-jack') && !metObjectives.has('play-jack')) {
        newlyMet.push('play-jack');
      }
    }

    // ── Queen play ──
    if (type === EVT.ACTION_DECLARED && isHuman && isQueenAction(actionType)) {
      effectsUsed.add('queen');
      if (objectiveIds.has('play-queen') && !metObjectives.has('play-queen')) {
        newlyMet.push('play-queen');
      }
    }

    // ── General effect tracking ──
    if (type === EVT.ACTION_DECLARED && isHuman && isEffectAction(actionType)) {
      const family = actionType.replace(/-/g, ' ').trim();
      effectsUsed.add(family);
      if (objectiveIds.has('demonstrate-effect') && !metObjectives.has('demonstrate-effect')) {
        newlyMet.push('demonstrate-effect');
      }
    }

    // ── Counter / response ──
    if (COUNTER_EVENTS.has(type) && isHuman) {
      effectsUsed.add('counter');
      if (objectiveIds.has('counter-action') && !metObjectives.has('counter-action')) {
        newlyMet.push('counter-action');
      }
      // Counter also counts as a response decision
      if (objectiveIds.has('demonstrate-response') && !metObjectives.has('demonstrate-response')) {
        newlyMet.push('demonstrate-response');
      }
    }

    // ── Response window recognized ──
    // When a response window opens (any counter/response event appears for
    // either player), the human "recognizes" it if they have a decision frame
    // with response actions. We detect this heuristically: if any COUNTER
    // event or RESPONSE_WINDOW_CLOSED event appears, the window was open.
    if (COUNTER_EVENTS.has(type) || RESPONSE_CLOSED_EVENTS.has(type)) {
      if (objectiveIds.has('recognize-response') && !metObjectives.has('recognize-response')) {
        newlyMet.push('recognize-response');
      }
    }

    // ── Decline / pass (let action resolve) ──
    if (RESPONSE_CLOSED_EVENTS.has(type)) {
      // If the response window closed without a counter from human, human declined
      // This is a heuristic — the window closing means the response opportunity ended
      if (objectiveIds.has('decline-pass') && !metObjectives.has('decline-pass')) {
        newlyMet.push('decline-pass');
      }
      // Decline also counts as a response decision
      if (objectiveIds.has('demonstrate-response') && !metObjectives.has('demonstrate-response')) {
        newlyMet.push('demonstrate-response');
      }
    }

    // ── Victory ──
    if (VICTORY_EVENTS.has(type) && isHuman) {
      // Victory objectives are also checked via snapshot below
    }
  }

  // ── Snapshot-based objectives ──
  // The snapshot from _buildAchievementSnapshot has humanScore, opponentScore, etc.
  // The full snapshot from getSnapshot() has state.players, state.winner, etc.
  const humanScore = snapshot?.humanScore ?? snapshot?.humanStats?.securedPoints ?? 0;
  const winner = snapshot?.winner ?? snapshot?.state?.winner ?? snapshot?.match?.winner ?? null;
  const isTerminal = snapshot?.isTerminal ?? snapshot?.state?.winner !== undefined ?? false;

  // Reach 21 / reach goal
  if (objectiveIds.has('reach-goal') && humanScore >= 21) {
    if (!metObjectives.has('reach-goal')) newlyMet.push('reach-goal');
  }
  if (objectiveIds.has('reach-21') && humanScore >= 21) {
    if (!metObjectives.has('reach-21')) newlyMet.push('reach-21');
  }
  // Reach half goal (11)
  if (objectiveIds.has('reach-half-goal') && humanScore >= 11) {
    if (!metObjectives.has('reach-half-goal')) newlyMet.push('reach-half-goal');
  }

  // Complete at least 4 full turns
  if (objectiveIds.has('complete-turns') && turnCount >= 4) {
    if (!metObjectives.has('complete-turns')) newlyMet.push('complete-turns');
  }

  // Use at least two different effects
  if (objectiveIds.has('use-two-effects') && effectsUsed.size >= 2) {
    if (!metObjectives.has('use-two-effects')) newlyMet.push('use-two-effects');
  }

  // Win objectives — checked from snapshot winner
  const winObjectives = ['win-match', 'win-short-match', 'win-full-match', 'win-after-scuttle',
    'win-after-anchor', 'win-swap-peek', 'win-royals', 'win-combo', 'win-graduation'];
  if (winner === humanId) {
    for (const objId of winObjectives) {
      if (objectiveIds.has(objId) && !metObjectives.has(objId)) {
        newlyMet.push(objId);
      }
    }
  }

  // Demonstrate draw (same as draw-card but different objective id)
  if (objectiveIds.has('demonstrate-draw') && metObjectives.has('draw-card')) {
    if (!metObjectives.has('demonstrate-draw')) newlyMet.push('demonstrate-draw');
  }
  // Also detect directly from draw events
  for (const event of events) {
    if (DRAW_EVENTS.has(event.type) && isHumanEvent(event, humanId)) {
      if (objectiveIds.has('demonstrate-draw') && !metObjectives.has('demonstrate-draw')) {
        newlyMet.push('demonstrate-draw');
      }
      break;
    }
  }

  return { newlyMet, turnCount, effectsUsed };
}

/**
 * Get the list of objective detector IDs that this module supports.
 * Used for validation and testing.
 * @returns {string[]}
 */
export function supportedObjectiveIds() {
  return [
    'draw-card', 'play-points', 'play-to-point-row', 'reach-goal', 'reach-21',
    'reach-half-goal', 'win-match', 'win-short-match', 'win-full-match',
    'complete-turns', 'scuttle-opponent', 'win-after-scuttle', 'anchor-card',
    'win-after-anchor', 'play-swap', 'play-peek', 'win-swap-peek',
    'recognize-response', 'counter-action', 'decline-pass',
    'play-jack', 'play-queen', 'win-royals', 'use-two-effects', 'win-combo',
    'demonstrate-draw', 'demonstrate-effect', 'demonstrate-response', 'win-graduation',
  ];
}
