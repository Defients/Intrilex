// ═══════════════════════════════════════════════════════════════
// priority-projection.js — Derives priority context from engine state
//
// Priority is a central player-facing system, not a decorative badge.
// This module derives the priority model from runtime authority.
// The UI renders this — it never invents priority.
// ═══════════════════════════════════════════════════════════════

/**
 * Window types for the priority model.
 */
export const WindowType = Object.freeze({
  PROACTIVE: 'proactive',
  RESPONSE: 'response',
  INTERRUPT: 'interrupt',
  RESOLUTION: 'resolution',
  TRANSITION: 'transition',
});

/**
 * Derive the priority context from the current snapshot and decision frame.
 *
 * @param {object} snapshot - The UI snapshot from play-controller.getSnapshot()
 * @param {object|null} decision - The current decision frame (snapshot.decision)
 * @returns {object} Priority context object
 */
export function derivePriorityContext(snapshot, decision) {
  if (!snapshot) return emptyPriority();

  const match = snapshot.match ?? {};
  const human = snapshot.human ?? {};
  const playerView = snapshot.playerView ?? {};

  // Terminal state — no priority
  if (snapshot.status === 'TERMINAL' || match.winner) {
    return {
      holder: 'system',
      phase: match.phase ?? '',
      windowType: WindowType.TRANSITION,
      canAct: false,
      canPass: false,
      pendingDeclarationId: null,
      stackDepth: 0,
      reasonCode: 'GAME_ALREADY_TERMINAL',
      nextOnPass: null,
      isHumanPriority: false,
      isOpponentPriority: false,
    };
  }

  // AI is deciding — opponent has priority
  if (snapshot.status === 'AI_DECISION') {
    return {
      holder: 'opponent',
      phase: match.phase ?? '',
      windowType: WindowType.PROACTIVE,
      canAct: false,
      canPass: false,
      pendingDeclarationId: null,
      stackDepth: playerView.stack?.length ?? 0,
      reasonCode: null,
      nextOnPass: null,
      isHumanPriority: false,
      isOpponentPriority: true,
    };
  }

  // Human decision pending
  if (snapshot.status === 'HUMAN_DECISION' && decision) {
    const kind = decision.kind ?? 'ACTION';
    const stack = playerView.stack ?? [];
    const stackDepth = stack.length;
    const isHumanPriority = decision.actorId === human.playerId;
    const windowType = classifyWindowType(kind, stackDepth);
    const canPass = canHumanPass(decision);
    const pendingDeclarationId = stackDepth > 0 ? (stack[stackDepth - 1]?.declarationId ?? null) : null;

    return {
      holder: isHumanPriority ? 'human' : 'opponent',
      phase: match.phase ?? '',
      windowType,
      canAct: true,
      canPass,
      pendingDeclarationId,
      stackDepth,
      reasonCode: null,
      nextOnPass: describeNextOnPass(windowType, stackDepth),
      isHumanPriority,
      isOpponentPriority: !isHumanPriority,
      decisionKind: kind,
    };
  }

  // Advancing or other states
  return {
    holder: 'system',
    phase: match.phase ?? '',
    windowType: WindowType.RESOLUTION,
    canAct: false,
    canPass: false,
    pendingDeclarationId: null,
    stackDepth: playerView.stack?.length ?? 0,
    reasonCode: null,
    nextOnPass: null,
    isHumanPriority: false,
    isOpponentPriority: false,
  };
}

/**
 * Classify the window type from the decision kind and stack depth.
 */
function classifyWindowType(kind, stackDepth) {
  if (kind === 'RESPONSE') return WindowType.RESPONSE;
  if (kind === 'EXHAUSTED_PASS') return WindowType.PROACTIVE;
  if (kind === 'PHASE') return WindowType.TRANSITION;
  if (kind === 'PRIVATE_CHOICE') return WindowType.PROACTIVE;
  if (stackDepth > 0) return WindowType.RESPONSE;
  return WindowType.PROACTIVE;
}

/**
 * Determine if the human can pass (decline response).
 * In Intrilex, explicit "Pass" is not a legal action — only:
 *   - response-decline (decline to respond in a response window)
 *   - exhausted-pass (forced when no legal action exists)
 */
function canHumanPass(decision) {
  if (!decision?.legalActions) return false;
  return decision.legalActions.some(a => a.isDecline || a.isExhaustedPass);
}

/**
 * Describe what happens if the player passes/declines.
 */
function describeNextOnPass(windowType, stackDepth) {
  if (windowType === WindowType.RESPONSE) {
    if (stackDepth > 1) {
      return 'Passing lets the current declaration continue. Other actors may still respond.';
    }
    return 'Passing lets the declaration continue toward resolution.';
  }
  if (windowType === WindowType.PROACTIVE) {
    return 'You are in a proactive window. There is no pending declaration to pass on.';
  }
  return null;
}

/**
 * Build the priority banner text from the priority context.
 * Answers: Who may act? What window? What is waiting? What if pass?
 */
export function priorityBannerText(priority, opponentName = 'Opponent') {
  if (!priority) return '';
  const { holder, windowType, stackDepth, canPass, nextOnPass, isHumanPriority } = priority;

  // Terminal
  if (holder === 'system' && !priority.canAct) {
    if (priority.reasonCode === 'GAME_ALREADY_TERMINAL') return 'The match is complete.';
    return 'The engine is processing. Please wait.';
  }

  // Opponent priority
  if (holder === 'opponent') {
    if (windowType === WindowType.RESPONSE) {
      return `${opponentName} has response priority. A declaration is waiting to resolve.`;
    }
    return `${opponentName} is deciding their next move.`;
  }

  // Human priority
  if (isHumanPriority) {
    const windowLabel = windowTypeLabel(windowType);
    let banner = `Your Priority — ${windowLabel}`;

    if (stackDepth > 0) {
      banner += `\n\nA declaration is waiting to resolve on the stack.`;
    }

    if (canPass && nextOnPass) {
      banner += `\n\n${nextOnPass}`;
    }

    return banner;
  }

  return '';
}

/**
 * Get a human-readable label for a window type.
 */
export function windowTypeLabel(windowType) {
  const labels = {
    [WindowType.PROACTIVE]: 'Proactive Window',
    [WindowType.RESPONSE]: 'Response Window',
    [WindowType.INTERRUPT]: 'Interrupt Window',
    [WindowType.RESOLUTION]: 'Resolution',
    [WindowType.TRANSITION]: 'Phase Transition',
  };
  return labels[windowType] ?? 'Unknown Window';
}

/**
 * Build the priority timeline for the optional timeline view.
 * Shows the sequence: Declaration → Response → Resolution → Priority returns
 */
export function priorityTimeline(priority) {
  if (!priority) return [];
  const { windowType, stackDepth } = priority;
  const steps = [
    { label: 'Declaration', active: false, done: stackDepth > 0 },
    { label: 'Response priority', active: windowType === WindowType.RESPONSE, done: false },
    { label: 'Additional responses', active: false, done: false },
    { label: 'Resolution', active: windowType === WindowType.RESOLUTION, done: false },
    { label: 'Priority returns', active: false, done: false },
  ];

  if (stackDepth > 0 && windowType !== WindowType.RESPONSE) {
    steps[0].active = true;
  }
  if (windowType === WindowType.RESOLUTION) {
    steps[3].active = true;
    steps[0].done = true;
    steps[1].done = true;
    steps[2].done = true;
  }

  return steps;
}

/**
 * Return an empty priority context (for error/initial states).
 */
function emptyPriority() {
  return {
    holder: 'system',
    phase: '',
    windowType: WindowType.TRANSITION,
    canAct: false,
    canPass: false,
    pendingDeclarationId: null,
    stackDepth: 0,
    reasonCode: null,
    nextOnPass: null,
    isHumanPriority: false,
    isOpponentPriority: false,
  };
}
