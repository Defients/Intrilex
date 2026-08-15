// ═══════════════════════════════════════════════════════════════
// academy-coachmarks.mjs — Coachmark state machine + renderer
//
// Manages the in-match coachmark overlay for Academy lessons. Each
// lesson defines a sequence of steps; each step has a trigger that
// determines when it should be shown and a coachmark (callout) to
// display.
//
// State machine:
//   - Steps are shown in order (one at a time)
//   - A step is "eligible" when its trigger condition is met AND it
//     hasn't been shown yet AND no earlier step is pending
//   - When a step is shown, it becomes the "active" coachmark
//   - The player can dismiss it (X button or click-through)
//   - Once dismissed, the step is marked "shown" and won't reappear
//   - The next eligible step becomes active on the next trigger check
//
// Trigger types:
//   - 'turn-start':     fires when fullTurnSequence reaches `turn`
//   - 'action-detected': fires when an event matching `family` + `actor` is seen
//   - 'objective-pending': fires when `objectiveId` is NOT yet met (nudge)
//   - 'phase-enter':    fires when the match phase changes to `phase`
//
// The controller calls `evaluateTriggers()` after each event batch
// to determine if a new coachmark should be shown.
// ═══════════════════════════════════════════════════════════════

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @typedef {Object} CoachmarkState
 * @property {number} currentStepIndex - Index of the currently-active step (-1 = none)
 * @property {Set<string>} shownStepIds - Step IDs that have been shown + dismissed
 * @property {object|null} activeCoachmark - The currently-displayed coachmark
 * @property {number} turnCount - Last known full turn count
 * @property {string|null} lastPhase - Last known match phase
 */

/**
 * Create a fresh coachmark state for a lesson.
 * @returns {CoachmarkState}
 */
export function createCoachmarkState() {
  return {
    currentStepIndex: -1,
    shownStepIds: new Set(),
    activeCoachmark: null,
    turnCount: 0,
    lastPhase: null,
  };
}

/**
 * Evaluate step triggers against the current match state and determine
 * if a new coachmark should be shown.
 *
 * @param {object[]} steps - Lesson steps (from curriculum)
 * @param {CoachmarkState} cmState - Mutable coachmark state
 * @param {{ turnCount: number, phase: string, recentEvents: object[], metObjectives: Set<string>, humanPlayerId: string }} matchCtx
 * @returns {object|null} The new active coachmark, or null if no change
 */
export function evaluateTriggers(steps, cmState, matchCtx) {
  if (!steps || steps.length === 0) return null;
  // Don't show a new coachmark if one is already active
  if (cmState.activeCoachmark !== null) return null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (cmState.shownStepIds.has(step.id)) continue;
    if (i < cmState.currentStepIndex) continue; // skip already-passed steps

    if (isTriggerMet(step.trigger, matchCtx, cmState)) {
      cmState.currentStepIndex = i;
      cmState.activeCoachmark = {
        stepId: step.id,
        ...step.coachmark,
      };
      return cmState.activeCoachmark;
    }
  }
  return null;
}

/**
 * Check if a step trigger condition is met.
 * @param {object} trigger
 * @param {object} matchCtx
 * @param {CoachmarkState} cmState
 * @returns {boolean}
 */
function isTriggerMet(trigger, matchCtx, cmState) {
  if (!trigger || !trigger.type) return false;

  switch (trigger.type) {
    case 'turn-start': {
      const targetTurn = trigger.turn ?? 1;
      return matchCtx.turnCount >= targetTurn;
    }
    case 'action-detected': {
      const family = trigger.family?.toLowerCase() ?? '';
      const actor = trigger.actor ?? 'human';
      const humanId = matchCtx.humanPlayerId;
      return matchCtx.recentEvents.some((e) => {
        const eventActor = e?.payload?.playerId ?? e?.payload?.actorId ?? e?.actorId ?? null;
        const isRightActor = actor === 'human' ? eventActor === humanId : eventActor !== humanId;
        if (!isRightActor) return false;
        const actionType = String(e?.payload?.actionType ?? '').toLowerCase();
        const eventType = String(e?.type ?? '').toLowerCase();
        return actionType.includes(family) || eventType.includes(family);
      });
    }
    case 'objective-pending': {
      const objId = trigger.objectiveId;
      if (!objId) return false;
      // Fire when the objective is NOT yet met (nudge the player)
      return !matchCtx.metObjectives.has(objId);
    }
    case 'phase-enter': {
      const phase = trigger.phase;
      if (!phase) return false;
      const changed = cmState.lastPhase !== null && cmState.lastPhase !== matchCtx.phase;
      return changed && matchCtx.phase === phase;
    }
    default:
      return false;
  }
}

/**
 * Dismiss the currently-active coachmark. Marks the step as shown.
 * @param {CoachmarkState} cmState
 */
export function dismissCoachmark(cmState) {
  if (cmState.activeCoachmark) {
    cmState.shownStepIds.add(cmState.activeCoachmark.stepId);
    cmState.activeCoachmark = null;
  }
}

/**
 * Render the coachmark overlay HTML.
 * @param {object|null} coachmark - The active coachmark object
 * @returns {string} HTML (empty if no coachmark)
 */
export function renderCoachmark(coachmark) {
  if (!coachmark) return '';
  const pos = coachmark.position ?? 'bottom';
  const target = esc(coachmark.target ?? '');
  return `<div class="academy-coachmark academy-coachmark-${esc(pos)}" data-testid="academy-coachmark" data-target="${target}" data-position="${esc(pos)}" role="alert" aria-live="assertive">
    <div class="academy-coachmark-body">
      <p class="academy-coachmark-text">${esc(coachmark.text)}</p>
      <button class="academy-coachmark-dismiss" data-action="academy-dismiss-coachmark" data-testid="academy-dismiss-coachmark" aria-label="Dismiss coachmark">✕</button>
    </div>
    <div class="academy-coachmark-arrow academy-coachmark-arrow-${esc(pos)}" aria-hidden="true"></div>
  </div>`;
}

/**
 * Generate a contextual hint for the current match state.
 * Hints are derived from the lesson's objectives and which ones are
 * still pending. The hint text guides the player toward the next
 * unmet objective.
 *
 * @param {object} lesson - Academy lesson
 * @param {Set<string>} metObjectives - Objectives met so far
 * @param {number} hintsUsed - Hints used this attempt
 * @returns {{ text: string, targetObjectiveId: string|null }}
 */
export function generateHint(lesson, metObjectives, hintsUsed = 0) {
  const objectives = lesson.briefing?.objectives ?? [];
  const pending = objectives.filter((o) => !metObjectives.has(o.id));

  if (pending.length === 0) {
    return { text: 'All objectives met — finish the match to complete the lesson!', targetObjectiveId: null };
  }

  // First pending objective is the next goal
  const next = pending[0];
  const hintLevel = hintsUsed < 1 ? 'gentle' : 'direct';

  // Build hint text based on the objective
  const hintText = buildHintForObjective(next.id, lesson, hintLevel);
  return { text: hintText, targetObjectiveId: next.id };
}

/**
 * Build hint text for a specific objective.
 * @param {string} objectiveId
 * @param {object} lesson
 * @param {'gentle'|'direct'} level
 * @returns {string}
 */
function buildHintForObjective(objectiveId, lesson, level) {
  const hints = HINT_LIBRARY[objectiveId];
  if (!hints) {
    // Fallback: just echo the objective label
    const obj = (lesson.briefing?.objectives ?? []).find((o) => o.id === objectiveId);
    return obj ? obj.label : 'Continue playing to meet the lesson objectives.';
  }
  return level === 'direct' ? hints.direct : hints.gentle;
}

/**
 * Hint text library — per-objective hint strings.
 * Gentle hints nudge; direct hints tell the player exactly what to do.
 */
const HINT_LIBRARY = {
  'draw-card': {
    gentle: 'Your turn starts with drawing — the Draw Pile is in the shared piles area.',
    direct: 'Click the Draw Pile to draw a card. Every turn begins with a draw.',
  },
  'play-points': {
    gentle: 'You have cards in your hand — try playing one to your Point Row.',
    direct: 'Select a card from your hand and choose "Play for Points" to place it in your Point Row.',
  },
  'play-to-point-row': {
    gentle: 'Your Point Row is where cards score — play a card there.',
    direct: 'Select a card and choose "Play for Points" to add it to your Point Row.',
  },
  'reach-goal': {
    gentle: 'Keep scoring — you need 21 Influence to win.',
    direct: 'You need 21 Influence to win. Play more cards for points to reach the goal.',
  },
  'reach-21': {
    gentle: 'You need 21 Influence — keep playing cards for points.',
    direct: 'Play cards for points until your Influence reaches 21.',
  },
  'reach-half-goal': {
    gentle: 'You\'re working toward 21 — try to reach 11 first (halfway).',
    direct: 'Play cards for points until your Influence reaches at least 11.',
  },
  'complete-turns': {
    gentle: 'Keep playing — each full turn (draw + action) counts.',
    direct: 'Complete at least 4 full turns: draw a card, then play it for points or an effect.',
  },
  'scuttle-opponent': {
    gentle: 'The 7 has a special effect — it can remove an opponent\'s Point Row card.',
    direct: 'Play a 7 for its effect (not points) to scuttle an opponent\'s Point Row card.',
  },
  'anchor-card': {
    gentle: 'The 6 can make your points permanent — try playing it for its effect.',
    direct: 'Play a 6 for its effect to anchor a Point Row card. Anchored points can\'t be removed.',
  },
  'play-swap': {
    gentle: 'The 5 can swap the Swap Bar contents — try it.',
    direct: 'Play a 5 for its effect to swap the Swap Bar. This changes what you and your opponent draw.',
  },
  'play-peek': {
    gentle: 'The 4 can reveal hidden information — try peeking at a face-down card.',
    direct: 'Play a 4 for its effect to peek at a face-down card. Information is power.',
  },
  'recognize-response': {
    gentle: 'When the opponent acts, a response window may open — watch for it.',
    direct: 'When the opponent plays a card, a response window opens. You can counter or decline.',
  },
  'counter-action': {
    gentle: 'You can counter an opponent\'s action with a matching rank from your hand.',
    direct: 'When a response window opens, choose to counter with a matching rank from your hand.',
  },
  'decline-pass': {
    gentle: 'You don\'t have to counter — declining lets the action resolve.',
    direct: 'When a response window opens, choose "Decline" or "Pass" to let the action resolve.',
  },
  'play-jack': {
    gentle: 'The Jack is a royal — it attaches to an opponent\'s Point Row card.',
    direct: 'Play a Jack for its effect to attach it to an opponent\'s Point Row card, stealing its points.',
  },
  'play-queen': {
    gentle: 'The Queen is a royal with a powerful Ultra effect.',
    direct: 'Play a Queen for its Ultra effect. It\'s a strong commitment play.',
  },
  'use-two-effects': {
    gentle: 'Try using different rank effects — scuttle, anchor, swap, peek, etc.',
    direct: 'Use at least two different rank effects in this match (e.g. scuttle with a 7 and anchor with a 6).',
  },
  'demonstrate-draw': {
    gentle: 'Start by drawing a card — every turn begins with a draw.',
    direct: 'Click the Draw Pile to draw a card.',
  },
  'demonstrate-effect': {
    gentle: 'Try playing a card for its effect instead of points.',
    direct: 'Play a card for its effect (e.g. a 7 to scuttle, a 6 to anchor, a 5 to swap).',
  },
  'demonstrate-response': {
    gentle: 'When the opponent acts, make a response decision — counter or decline.',
    direct: 'When a response window opens, choose to counter or decline. Either decision counts.',
  },
};

/**
 * Check if all steps in a lesson have been shown.
 * @param {object[]} steps
 * @param {CoachmarkState} cmState
 * @returns {boolean}
 */
export function allStepsShown(steps, cmState) {
  if (!steps || steps.length === 0) return true;
  return steps.every((s) => cmState.shownStepIds.has(s.id));
}
