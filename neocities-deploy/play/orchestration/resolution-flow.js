// ═══════════════════════════════════════════════════════════════
// resolution-flow.js — Resolution stack and event log
//
// Provides:
//   - Structured event log from accepted engine events
//   - Stack display data
//   - Effect explanation data
//   - Partial resolution representation
//
// The log never invents causal relationships.
// ═══════════════════════════════════════════════════════════════

/**
 * Build a structured event log entry from an engine event.
 *
 * @param {object} event - The engine event
 * @param {object} cardRegistry - Map of cardId → { identity, rank, suit }
 * @returns {object} { index, type, description, actorId, details }
 */
export function buildEventLogEntry(event, cardRegistry) {
  if (!event) return null;

  const type = event.type ?? 'UNKNOWN';
  const actorId = event.controllerId ?? event.payload?.controllerId ?? null;
  const description = describeEvent(event, cardRegistry);

  return {
    index: event.index ?? 0,
    type,
    description,
    actorId,
    details: extractEventDetails(event, cardRegistry),
  };
}

/**
 * Build a human-readable event log from accepted engine events.
 *
 * @param {object[]} events - Array of engine events
 * @param {object} cardRegistry - Map of cardId → { identity, rank, suit }
 * @returns {object[]} Array of event log entries
 */
export function buildEventLog(events, cardRegistry) {
  if (!events || events.length === 0) return [];
  return events.map((e, i) => {
    const entry = buildEventLogEntry(e, cardRegistry);
    if (entry) entry.index = i + 1;
    return entry;
  }).filter(Boolean);
}

/**
 * Describe an event in human-readable terms.
 * Never invents causal relationships.
 */
function describeEvent(event, cardRegistry) {
  const type = event.type ?? '';
  const payload = event.payload ?? {};

  // Card movement events
  if (type.includes('DRAW')) return `${describeActor(event)} drew a card.`;
  if (type.includes('SCORE') || type.includes('POINTS')) {
    const card = describeCard(payload.cardId, cardRegistry);
    return `${describeActor(event)} scored ${card}.`;
  }
  if (type.includes('SCUTTLE')) {
    const target = describeCard(payload.targetId, cardRegistry);
    return `${describeActor(event)} scuttled ${target}.`;
  }
  if (type.includes('SWAP')) return `${describeActor(event)} used the Swap Bar.`;
  if (type.includes('COUNTER')) {
    const target = describeCard(payload.targetId, cardRegistry);
    return `${describeActor(event)} countered ${target}.`;
  }
  if (type.includes('DISCARD')) return `${describeActor(event)} discarded a card.`;
  if (type.includes('EXILE')) return `${describeActor(event)} exiled a card.`;
  if (type.includes('BOUNCE')) {
    const target = describeCard(payload.targetId, cardRegistry);
    return `${describeActor(event)} bounced ${target}.`;
  }
  if (type.includes('TAP')) {
    const target = describeCard(payload.targetId, cardRegistry);
    return `${describeActor(event)} tapped ${target}.`;
  }
  if (type.includes('PURGE')) return `${describeActor(event)} purged a card.`;
  if (type.includes('ROW_CLEAR')) return `${describeActor(event)} cleared a row.`;
  // Core engine effect events (anchor, attachment, joker, board lock, etc.)
  // These must be checked BEFORE the generic RESOLVE/CANCEL patterns below,
  // since their event types include "RESOLVED" (e.g. CORE_JACK_ATTACHMENT_RESOLVED).
  if (type.includes('ANCHOR_ENTERED')) {
    const card = describeCard(payload.sourceCardId, cardRegistry);
    return `${describeActor(event)} placed ${card} as an anchor on the Enduring Row.`;
  }
  if (type.includes('ATTACHMENT_RESOLVED')) {
    const jack = describeCard(payload.jackCardId, cardRegistry);
    const host = describeCard(payload.hostCardId, cardRegistry);
    return `${describeActor(event)} attached ${jack} to ${host}.`;
  }
  if (type.includes('RED_JOKER')) return `${describeActor(event)} used a Red Joker effect.`;
  if (type.includes('BOARD_LOCK')) return `${describeActor(event)} activated Board Lock.`;
  if (type.includes('ENTER_ACTION')) return `Entered the Action Phase.`;
  if (type.includes('BEGIN_START')) return `Start phase began.`;
  if (type.includes('CARD_MOVED')) return `A card was moved.`;
  if (type.includes('CARD_TAKEN')) return `${describeActor(event)} took a card.`;
  if (type.includes('GOAL_CHANGED')) return `${describeActor(event)}'s goal changed.`;
  if (type.includes('TARGET_REMOVED')) return `A target was removed.`;
  if (type.includes('MARKER_SET')) return `A marker was set on a card.`;
  if (type.includes('TRIGGER_QUEUED')) return `A trigger was queued.`;
  if (type.includes('STACK_ITEM_REBOUND')) return `A stack item rebounded.`;
  if (type.includes('RESPONSE_WINDOW_CLOSED') || type.includes('PRIORITY_CLOSED')) {
    return `The response window closed.`;
  }
  if (type.includes('RESPONSE_DECLINED') || type.includes('PRIORITY_PASSED')) {
    return `${describeActor(event)} passed priority.`;
  }
  if (type.includes('RESOLVE')) {
    const kind = payload.kind ?? 'effect';
    return `${kind} resolved.`;
  }
  if (type.includes('CANCEL')) {
    const kind = payload.kind ?? 'effect';
    return `${kind} was cancelled.`;
  }
  if (type.includes('PASS')) return `${describeActor(event)} passed.`;
  if (type.includes('PHASE')) return `Phase transition: ${payload.phase ?? 'unknown'}.`;
  if (type.includes('TURN')) return `Turn ${payload.turnNumber ?? ''} began.`;
  if (type.includes('TERMINAL') || type.includes('GAME_OVER')) {
    return `Match ended. Winner: ${payload.winner ?? 'unknown'}.`;
  }
  if (type.includes('SUPER')) return `${describeActor(event)} declared a Super.`;
  if (type.includes('DECLARATION') || type.includes('DECLARE_PRIMARY')) {
    const kind = payload.kind ?? 'action';
    return `${describeActor(event)} declared ${kind}.`;
  }

  // Fallback: generic but not misleading
  return `${type.replace(/_/g, ' ').toLowerCase()}.`;
}

/**
 * Describe the actor of an event.
 */
function describeActor(event) {
  const actorId = event.controllerId ?? event.payload?.controllerId;
  if (!actorId) return 'The game';
  if (actorId === 'P1') return 'Player 1';
  if (actorId === 'P2') return 'Player 2';
  return actorId;
}

/**
 * Describe a card using the card registry.
 */
function describeCard(cardId, cardRegistry) {
  if (!cardId || !cardRegistry) return 'a card';
  const card = cardRegistry[cardId];
  if (!card) return 'a card';
  return card.identity ?? 'a card';
}

/**
 * Extract structured details from an event for the expandable view.
 */
function extractEventDetails(event, cardRegistry) {
  const payload = event.payload ?? {};
  const details = {};

  if (payload.cardId) details.source = describeCard(payload.cardId, cardRegistry);
  if (payload.targetId) details.target = describeCard(payload.targetId, cardRegistry);
  if (payload.effectName) details.effectName = payload.effectName;
  if (payload.result) details.result = payload.result;
  if (payload.prevented) details.prevented = payload.prevented;
  if (payload.modified) details.modified = payload.modified;

  return details;
}

/**
 * Build the resolution stack display data.
 *
 * @param {object[]} stack - The stack from the player view
 * @param {object} cardRegistry - Card registry
 * @returns {object[]} Array of stack display items
 */
export function buildStackDisplay(stack, cardRegistry) {
  if (!stack || stack.length === 0) return [];

  // Stack is LIFO — display top first (reverse order)
  return [...stack].reverse().map((item, index) => ({
    id: item.id ?? item.declarationId ?? `stack-${index}`,
    kind: item.kind ?? 'declaration',
    controller: item.controllerId ?? item.actorId ?? 'unknown',
    controllerLabel: describeActor({ controllerId: item.controllerId ?? item.actorId }),
    status: item.status ?? 'pending',
    isTop: index === 0,
    source: item.sourceCardId ? describeCard(item.sourceCardId, cardRegistry) : null,
    targets: (item.targetCardIds ?? []).map(id => describeCard(id, cardRegistry)),
    position: index + 1,
  }));
}

/**
 * Build effect explanation data for a resolved effect.
 * Allows expansion to show: canonical effect name, source, targets, result, etc.
 *
 * @param {object} event - The resolution event
 * @param {object} cardRegistry - Card registry
 * @returns {object} { effectName, source, targets, result, prevented, modified, authorityRef }
 */
export function buildEffectExplanation(event, cardRegistry) {
  const payload = event?.payload ?? {};
  return {
    effectName: payload.effectName ?? event?.type ?? 'Unknown effect',
    source: payload.cardId ? describeCard(payload.cardId, cardRegistry) : null,
    targets: (payload.targetIds ?? (payload.targetId ? [payload.targetId] : [])).map(id => describeCard(id, cardRegistry)),
    result: payload.result ?? 'resolved',
    prevented: payload.prevented ?? false,
    modified: payload.modified ?? false,
    authorityRef: payload.authorityRef ?? null,
    relatedRankAnatomy: payload.rankAnatomyRef ?? null,
  };
}

/**
 * Build a partial resolution representation.
 * Never reduces "three effects attempted, two resolved, one fizzled"
 * to "Super succeeded" without component detail.
 *
 * @param {object[]} events - The events from a resolution
 * @param {object} cardRegistry - Card registry
 * @returns {object} { attempted, resolved, fizzled, cancelled, details }
 */
export function buildPartialResolution(events, cardRegistry) {
  const resolutionEvents = (events ?? []).filter(e =>
    e.type?.includes('RESOLVE') || e.type?.includes('CANCEL') || e.type?.includes('FIZZLE')
  );

  const attempted = resolutionEvents.length;
  const resolved = resolutionEvents.filter(e => e.type?.includes('RESOLVE')).length;
  const fizzled = resolutionEvents.filter(e => e.type?.includes('FIZZLE')).length;
  const cancelled = resolutionEvents.filter(e => e.type?.includes('CANCEL')).length;

  return {
    attempted,
    resolved,
    fizzled,
    cancelled,
    details: resolutionEvents.map(e => buildEffectExplanation(e, cardRegistry)),
    summary: attempted === resolved
      ? `All ${attempted} effect${attempted > 1 ? 's' : ''} resolved.`
      : `${resolved} of ${attempted} effect${attempted > 1 ? 's' : ''} resolved${fizzled > 0 ? `, ${fizzled} fizzled` : ''}${cancelled > 0 ? `, ${cancelled} cancelled` : ''}.`,
  };
}
