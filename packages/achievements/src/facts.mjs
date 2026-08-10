// ═══════════════════════════════════════════════════════════════
// facts.mjs — Achievement fact representation and projector
// Translates canonical engine events into compact achievement facts.
// Self-contained: pattern-matches on event type strings (canonical/stable).
// Does NOT import engine modules. Does NOT alter game truth.
// ═══════════════════════════════════════════════════════════════

import { FACT_KIND, ZONE } from './constants.mjs';

/**
 * @typedef {Object} AchievementFact
 * @property {string} schemaVersion - Fact schema version
 * @property {string} factId - Stable unique identifier (matchId + eventIndex + subIndex + kind)
 * @property {string} matchId - Match identifier
 * @property {number} sequence - Event sequence number from engine
 * @property {number|null} stateRevision - State revision at fact time
 * @property {string|null} actorId - Player who caused this fact
 * @property {string} kind - One of FACT_KIND enum
 * @property {Record<string, any>} payload - Fact-specific data
 * @property {('LOCAL_AUTHORITY'|'NETWORK_AUTHORITY')} provenance - Source of truth
 */

export const FACT_SCHEMA_VERSION = '1.0.0';

/**
 * Build a stable fact ID from match and event coordinates.
 * @param {string} matchId
 * @param {number} eventIndex
 * @param {number} subIndex
 * @param {string} kind
 * @returns {string}
 */
export function buildFactId(matchId, eventIndex, subIndex, kind) {
  return `${matchId}:${eventIndex}:${subIndex}:${kind}`;
}

// ── Engine event type → fact kind mapping ───────────────────────

/**
 * Map of engine event types to achievement fact kinds.
 * Events not in this map are not directly projected (but may be used
 * by the context builder for state tracking).
 */
const EVENT_TYPE_MAP = {
  // Match lifecycle
  'CORE_FOUNDATION_SETUP_APPLIED': FACT_KIND.MATCH_STARTED,
  'CORE_NORMAL_VICTORY': FACT_KIND.MATCH_COMPLETED,
  'CORE_EXHAUSTED_RESOLVED': FACT_KIND.MATCH_COMPLETED,

  // Turn lifecycle
  'CORE_START_PREPARED': FACT_KIND.FULL_TURN_STARTED,
  'CORE_FULL_TURN_COMPLETED': FACT_KIND.FULL_TURN_ENDED,

  // Action declarations
  'CORE_ACTION_DECLARED': FACT_KIND.ACTION_DECLARED,
  'DECLARATION_COMMITTED': FACT_KIND.STACK_OBJECT_ADDED,
  'CORE_ROOT_RESOLVED': FACT_KIND.ACTION_RESOLVED,
  'CORE_ROOT_FIZZLED': FACT_KIND.ACTION_CANCELED,

  // Counter/response declarations
  'CORE_ACE_COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_SPADE_ACE_COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_EIGHT_SCUTTLE_COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_KING_COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_JACK_DISRUPT_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_NINE_TAP_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_EIGHT_SPADE_SCUTTLE_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_EIGHT_AEGIS_FIELD_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_QUEEN_AEGIS_QUICK_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_BOARD_LOCK_QUICK_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_SUPER_ACE_COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_KING_SPADE_COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'CORE_ULTRA_THREE_RED_DECLARED': FACT_KIND.RESPONSE_PLAYED,
  'COUNTER_DECLARED': FACT_KIND.RESPONSE_PLAYED,

  // Counter resolution
  'CORE_COUNTER_RESOLVED': FACT_KIND.ACTION_COUNTERED,
  'STACK_ITEM_COUNTERED': FACT_KIND.ACTION_COUNTERED,
  'STACK_ITEM_FIZZLED': FACT_KIND.STACK_OBJECT_REMOVED,
  'RESOLUTION_BEGAN': FACT_KIND.STACK_RESOLVED,

  // Response window
  'CORE_RESPONSE_WINDOW_CLOSED': FACT_KIND.STACK_RESOLVED,
  'PRIORITY_CLOSED': FACT_KIND.STACK_RESOLVED,

  // Scoring
  'CORE_CARD_SCORED': FACT_KIND.CARD_PLAYED_FOR_POINTS,
  'CARD_SCORED': FACT_KIND.CARD_PLAYED_FOR_POINTS,

  // Card movement / zones
  'CARD_MOVED': FACT_KIND.CARD_MOVED,
  'CARDS_DISCARDED': FACT_KIND.ZONE_INTERACTED,
  'CARDS_DRAWN_AND_SELECTED': FACT_KIND.ZONE_INTERACTED,
  'CORE_DRAW_RESOLVED': FACT_KIND.ZONE_INTERACTED,
  'TARGET_REMOVED': FACT_KIND.CARD_MOVED,
  'EXILE_BOUND_APPLIED': FACT_KIND.ZONE_INTERACTED,

  // Swap bar
  'CORE_FACE_DOWN_SWAP_RESOLVED': FACT_KIND.SWAP_USED,
  'CORE_FACE_UP_SWAP_DRAW_RESOLVED': FACT_KIND.SWAP_USED,

  // Anchors
  'CORE_ACE_ANCHOR_ENTERED': FACT_KIND.ANCHOR_ESTABLISHED,
  'CORE_KING_ANCHOR_ENTERED': FACT_KIND.ANCHOR_ESTABLISHED,
  'CORE_QUEEN_ANCHOR_ENTERED': FACT_KIND.ANCHOR_ESTABLISHED,
  'QUEEN_ANCHOR_ENTERED': FACT_KIND.ANCHOR_ESTABLISHED,

  // Super
  'CORE_ADVANCED_SUPER_TWO_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_FOUR_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_EIGHT_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_J_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_THREE_RAID_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_FIVE_RECYCLE_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_SIX_DIG_RESOLVED': FACT_KIND.SUPER_RESOLVED,
  'CORE_ADVANCED_SUPER_SEVEN_TOPDECK_RESOLVED': FACT_KIND.SUPER_RESOLVED,

  // Spades effects (resolution events only — declaration events are already
  // mapped to RESPONSE_PLAYED above; spades enrichment is handled separately
  // via extractSpadesEffectId in the projector)
  'WILD_SOVEREIGNTY_RESOLVED': FACT_KIND.SPADES_EFFECT_RESOLVED,
  'TEN_SPADE_STACK_THEFT_RESOLVED': FACT_KIND.SPADES_EFFECT_RESOLVED,
  'CORE_RANK10_STACK_THEFT_RESOLVED': FACT_KIND.SPADES_EFFECT_RESOLVED,
  'CORE_EIGHT_SPADE_SCUTTLE_RESOLVED': FACT_KIND.SPADES_EFFECT_RESOLVED,

  // Seven
  'SEVEN_TOPDECK_RESOLVED': FACT_KIND.SEVEN_REVEAL_RESOLVED,
  'MIMIC_TOPDECK_SEVEN_RESOLVED': FACT_KIND.SEVEN_REVEAL_RESOLVED,
  'CORE_SEVEN_GENERATED_EFFECT_DECLARED': FACT_KIND.GENERATED_PLAY_RESOLVED,

  // Queen's Court
  'CORE_ADVANCED_QUEENS_COURT_RESOLVED': FACT_KIND.QUEENS_COURT_ESTABLISHED,
};

// ── Fact payload enrichment ─────────────────────────────────────

/**
 * Extract card identity (rank) from an event payload.
 * @param {Record<string, any>} event - Engine event
 * @param {Record<string, any>|null} [stateCards] - Optional map of cardId → card for identity lookup
 * @returns {string|null}
 */
function extractRank(event, stateCards) {
  const p = event.payload ?? {};
  if (p.sourceCardId && stateCards) {
    const card = stateCards[p.sourceCardId];
    if (card && card.identity) {
      return card.identity.replace(/[♣♦♥♠]$/, '');
    }
  }
  if (p.cardId && stateCards) {
    const card = stateCards[p.cardId];
    if (card && card.identity) {
      return card.identity.replace(/[♣♦♥♠]$/, '');
    }
  }
  return null;
}

/**
 * Extract suit from an event payload.
 * @param {Record<string, any>} event
 * @param {Record<string, any>|null} [stateCards]
 * @returns {string|null}
 */
function extractSuit(event, stateCards) {
  const p = event.payload ?? {};
  const cardId = p.sourceCardId ?? p.cardId;
  if (cardId && stateCards) {
    const card = stateCards[cardId];
    if (card && card.identity) {
      const match = card.identity.match(/[♣♦♥♠]$/);
      return match ? match[0] : null;
    }
  }
  return null;
}

/**
 * Determine the spades effect identity from an event.
 * @param {Record<string, any>} event
 * @param {Record<string, any>|null} [stateCards]
 * @returns {string|null}
 */
function extractSpadesEffectId(event, stateCards) {
  const type = event.type;
  const p = event.payload ?? {};
  switch (type) {
    case 'CORE_SPADE_ACE_COUNTER_DECLARED': return 'A_SPADE_COUNTER';
    case 'CORE_KING_SPADE_COUNTER_DECLARED':
    case 'WILD_SOVEREIGNTY_RESOLVED': return 'KING_SPADE_WILD';
    case 'CORE_EIGHT_SPADE_SCUTTLE_DECLARED':
    case 'CORE_EIGHT_SPADE_SCUTTLE_RESOLVED': return 'EIGHT_SPADE_SCUTTLE';
    case 'TEN_SPADE_STACK_THEFT_RESOLVED':
    case 'CORE_RANK10_STACK_THEFT_RESOLVED': return 'TEN_SPADE_STACK_THEFT';
    case 'CORE_SUPER_ACE_COUNTER_DECLARED':
      // Check if source is A♠
      if (p.sourceCardIds && stateCards) {
        const card = stateCards[p.sourceCardIds[0]];
        if (card && card.identity === 'A♠') return 'SUPER_ACE_SPADE';
      }
      return null;
    case 'SEVEN_TOPDECK_RESOLVED':
      // Check if source is 7♠
      if (p.sourceCardId && stateCards) {
        const card = stateCards[p.sourceCardId];
        if (card && card.identity === '7♠') return 'SEVEN_SPADE_TOPDECK';
      }
      return null;
    case 'CORE_ADVANCED_SUPER_SEVEN_TOPDECK_RESOLVED':
      // Check if source is 7♠
      if (p.sourceCardIds && stateCards) {
        const card = stateCards[p.sourceCardIds[0]];
        if (card && card.identity === '7♠') return 'SUPER_SEVEN_SPADE';
      }
      return null;
    default: return null;
  }
}

/**
 * Determine zone from event.
 * @param {Record<string, any>} event
 * @returns {string|null}
 */
function extractZone(event) {
  const type = event.type;
  const p = event.payload ?? {};
  switch (type) {
    case 'CORE_DRAW_RESOLVED':
    case 'CARDS_DRAWN_AND_SELECTED': return ZONE.DRAW_PILE;
    case 'CARDS_DISCARDED': return ZONE.GRAVEYARD;
    case 'EXILE_BOUND_APPLIED': return ZONE.EXILE;
    case 'CORE_FACE_DOWN_SWAP_RESOLVED':
    case 'CORE_FACE_UP_SWAP_DRAW_RESOLVED': return ZONE.SWAP_BAR;
    case 'CARD_MOVED':
      if (p.actualDestination === 'EXILE' || p.destination === 'EXILE') return ZONE.EXILE;
      if (p.actualDestination === 'GY' || p.destination === 'GY') return ZONE.GRAVEYARD;
      if (p.actualDestination === 'SWAP_BAR' || p.destination === 'SWAP_BAR') return ZONE.SWAP_BAR;
      if (p.actualDestination === 'DP' || p.destination === 'DP') return ZONE.DRAW_PILE;
      return null;
    case 'CORE_CARD_SCORED':
    case 'CARD_SCORED': return ZONE.POINT_ROW;
    case 'DECLARATION_COMMITTED':
    case 'CORE_ACTION_DECLARED': return ZONE.STACK;
    default: return null;
  }
}

/**
 * Determine if an event represents an interrupt timing class.
 * @param {Record<string, any>} event
 * @returns {boolean}
 */
function isInterruptEvent(event) {
  const type = event.type;
  // These response types have interrupt timing
  return type === 'CORE_SUPER_ACE_COUNTER_DECLARED' ||
    type === 'CORE_ULTRA_THREE_RED_DECLARED' ||
    type === 'CORE_KING_SPADE_COUNTER_DECLARED' ||
    (type === 'CORE_ACTION_DECLARED' && event.payload?.stackClass === 'interrupt');
}

/**
 * Determine if an event represents a Super declaration.
 * @param {Record<string, any>} event
 * @returns {boolean}
 */
function isSuperDeclaration(event) {
  const type = event.type;
  if (type === 'CORE_SUPER_ACE_COUNTER_DECLARED') return true;
  if (type === 'CORE_ACTION_DECLARED') {
    const at = event.payload?.actionType ?? '';
    return at.includes('super') || at.includes('Super');
  }
  // Super resolution events
  return type.startsWith('CORE_ADVANCED_SUPER_') && type.endsWith('_RESOLVED');
}

/**
 * Determine if an event represents a Seven scoring trigger.
 * @param {Record<string, any>} event
 * @param {Record<string, any>|null} [stateCards]
 * @returns {boolean}
 */
function isSevenScoringTrigger(event, stateCards) {
  // CORE_CARD_SCORED with a 7 card
  if (event.type === 'CORE_CARD_SCORED' || event.type === 'CARD_SCORED') {
    const cardId = event.payload?.cardId;
    if (cardId && stateCards) {
      const card = stateCards[cardId];
      if (card && card.identity && card.identity.startsWith('7')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determine if an event represents a mini-turn action.
 * @param {Record<string, any>} event
 * @returns {boolean}
 */
function isMiniTurnEvent(event) {
  const type = event.type;
  if (type === 'CORE_ACTION_PHASE_ENTERED') return true;
  if (type === 'CORE_ACTION_DECLARED') {
    // Actions that consume mini-turns (not responses)
    const sc = event.payload?.stackClass;
    return sc === 'primary' || sc === 'action';
  }
  if (type === 'CORE_DRAW_RESOLVED' || type === 'CORE_FACE_DOWN_SWAP_RESOLVED' ||
      type === 'CORE_FACE_UP_SWAP_DRAW_RESOLVED' || type === 'CORE_EXHAUSTED_PASS_RESOLVED' ||
      type === 'CORE_CARD_SCORED' || type === 'CORE_SCUTTLE_RESOLVED') {
    return true;
  }
  return false;
}

// ── Fact projector ──────────────────────────────────────────────

/**
 * Derive achievement facts from a batch of canonical engine events.
 * @param {Record<string, any>[]} events - Engine events (from commandLog or advance result)
 * @param {{
 *   matchId: string,
 *   humanPlayerId: string,
 *   provenance?: 'LOCAL_AUTHORITY'|'NETWORK_AUTHORITY',
 *   startEventIndex?: number,
 *   stateCards?: Record<string, any>,
 *   fullTurnSequence?: number,
 *   stateRevision?: number,
 * }} context
 * @returns {AchievementFact[]}
 */
export function deriveAchievementFacts(events, context) {
  const { matchId, humanPlayerId, provenance = 'LOCAL_AUTHORITY' } = context;
  const startIdx = context.startEventIndex ?? 0;
  const stateCards = context.stateCards ?? null;
  /** @type {AchievementFact[]} */
  const facts = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event || !event.type) continue;
    const eventIndex = startIdx + i;
    const eventSeq = event.sequence ?? eventIndex;
    const actorId = event.payload?.playerId ?? event.payload?.actorId ?? event.actorId ?? null;

    // Map event type to fact kind
    const baseKind = EVENT_TYPE_MAP[/** @type {keyof typeof EVENT_TYPE_MAP} */ (event.type)] ?? null;
    if (!baseKind) continue;

    // Build enriched payload based on fact kind
    /** @type {Record<string, any>} */
    let payload = { ...event.payload };
    /** @type {string} */
    let kind = baseKind;

    // Enrich with card identity info if available
    const rank = extractRank(event, stateCards);
    const suit = extractSuit(event, stateCards);
    if (rank) payload.rank = rank;
    if (suit) payload.suit = suit;

    // Zone enrichment
    const zone = extractZone(event);
    if (zone) payload.zone = zone;

    // Actor determination
    if (actorId) payload.actorId = actorId;

    // ── Kind-specific enrichment ──

    // Card played for points
    if (kind === FACT_KIND.CARD_PLAYED_FOR_POINTS) {
      payload.isHuman = actorId === humanPlayerId;
      if (isSevenScoringTrigger(event, stateCards)) {
        // Emit an additional SEVEN_SCORING_TRIGGER_RESOLVED fact
        facts.push({
          schemaVersion: FACT_SCHEMA_VERSION,
          factId: buildFactId(matchId, eventIndex, 1, FACT_KIND.SEVEN_SCORING_TRIGGER_RESOLVED),
          matchId,
          sequence: eventSeq,
          stateRevision: context.stateRevision ?? null,
          actorId,
          kind: FACT_KIND.SEVEN_SCORING_TRIGGER_RESOLVED,
          payload: { ...payload, isHuman: actorId === humanPlayerId, cardId: event.payload?.cardId },
          provenance,
        });
      }
    }

    // Action declared — determine mode (points vs effect)
    if (kind === FACT_KIND.ACTION_DECLARED) {
      const actionType = event.payload?.actionType ?? '';
      if (actionType === 'play-for-points' || actionType === 'score') {
        kind = FACT_KIND.CARD_PLAYED_FOR_POINTS;
        payload.mode = 'points';
      } else if (actionType.includes('effect') || actionType === 'scuttle' ||
                 actionType.includes('anchor') || actionType.includes('jack') ||
                 actionType.includes('super') || actionType.includes('rank10')) {
        kind = FACT_KIND.CARD_PLAYED_FOR_EFFECT;
        payload.mode = 'effect';
      }
      payload.isHuman = actorId === humanPlayerId;
      payload.isSuper = isSuperDeclaration(event);
      if (payload.isSuper) {
        // Also emit SUPER_DECLARED
        facts.push({
          schemaVersion: FACT_SCHEMA_VERSION,
          factId: buildFactId(matchId, eventIndex, 1, FACT_KIND.SUPER_DECLARED),
          matchId,
          sequence: eventSeq,
          stateRevision: context.stateRevision ?? null,
          actorId,
          kind: FACT_KIND.SUPER_DECLARED,
          payload: { ...payload, isHuman: actorId === humanPlayerId },
          provenance,
        });
      }
    }

    // Response played — determine if interrupt
    if (kind === FACT_KIND.RESPONSE_PLAYED) {
      payload.isHuman = actorId === humanPlayerId;
      payload.isInterrupt = isInterruptEvent(event);
      if (payload.isInterrupt) {
        // Also emit INTERRUPT_PLAYED
        facts.push({
          schemaVersion: FACT_SCHEMA_VERSION,
          factId: buildFactId(matchId, eventIndex, 1, FACT_KIND.INTERRUPT_PLAYED),
          matchId,
          sequence: eventSeq,
          stateRevision: context.stateRevision ?? null,
          actorId,
          kind: FACT_KIND.INTERRUPT_PLAYED,
          payload: { ...payload },
          provenance,
        });
      }
    }

    // Spades effect
    const spadesEffectId = extractSpadesEffectId(event, stateCards);
    if (spadesEffectId) {
      payload.spadesEffectId = spadesEffectId;
      if (kind === FACT_KIND.SPADES_EFFECT_DECLARED || kind === FACT_KIND.SPADES_EFFECT_RESOLVED) {
        payload.isHuman = actorId === humanPlayerId;
      }
    }

    // Mini-turn
    if (isMiniTurnEvent(event)) {
      payload.isMiniTurn = true;
    }

    // Stack depth from payload
    if (event.payload?.stackDepth !== undefined) {
      payload.stackDepth = event.payload.stackDepth;
    }

    // Match completed — determine winner
    if (kind === FACT_KIND.MATCH_COMPLETED) {
      payload.winner = event.payload?.playerId ?? event.payload?.winner ?? null;
      payload.isDraw = event.payload?.draw === true;
      payload.isHumanWinner = payload.winner === humanPlayerId;
    }

    // Full turn
    if (kind === FACT_KIND.FULL_TURN_STARTED) {
      payload.playerId = event.payload?.playerId ?? null;
      payload.fullTurnSequence = event.payload?.fullTurnSequence ?? context.fullTurnSequence ?? null;
      payload.isHuman = payload.playerId === humanPlayerId;
    }
    if (kind === FACT_KIND.FULL_TURN_ENDED) {
      payload.playerId = event.payload?.playerId ?? null;
      payload.isHuman = payload.playerId === humanPlayerId;
    }

    // Counter resolved — track countered target
    if (kind === FACT_KIND.ACTION_COUNTERED) {
      payload.counterId = event.payload?.counterId ?? event.payload?.stackItemId ?? null;
      payload.targetId = event.payload?.targetId ?? event.payload?.targetStackItemId ?? null;
      payload.targetWasRoot = event.payload?.targetWasRoot ?? false;
      payload.counterKind = event.payload?.counterKind ?? null;
      // Determine if the counterer is human
      // For CORE_COUNTER_RESOLVED, the counterer is the one who played the response
      // We can check responseSourceCardIds controller via state, but actorId may not be in payload
      // The evaluator will use match tracker context for this
    }

    // Seven reveal
    if (kind === FACT_KIND.SEVEN_REVEAL_RESOLVED) {
      payload.revealedCardId = event.payload?.revealed ?? null;
      payload.sourceCardId = event.payload?.sourceCardId ?? null;
      payload.effectCardId = event.payload?.effectCardId ?? null;
      payload.scoreCardId = event.payload?.scoreCardId ?? null;
      payload.handCardId = event.payload?.handCardId ?? null;
    }

    // Generated play
    if (kind === FACT_KIND.GENERATED_PLAY_RESOLVED) {
      payload.actionKind = event.payload?.actionKind ?? null;
      payload.sourceCardIds = event.payload?.sourceCardIds ?? [];
    }

    // Swap
    if (kind === FACT_KIND.SWAP_USED) {
      payload.offeredCardId = event.payload?.offeredCardId ?? null;
      payload.takenCardId = event.payload?.takenCardId ?? event.payload?.cardId ?? null;
    }

    // Anchor
    if (kind === FACT_KIND.ANCHOR_ESTABLISHED) {
      payload.sourceCardId = event.payload?.sourceCardId ?? event.payload?.cardId ?? null;
    }

    // Queen's Court
    if (kind === FACT_KIND.QUEENS_COURT_ESTABLISHED) {
      payload.queenCardIds = event.payload?.queenCardIds ?? [];
    }

    // Build the primary fact
    /** @type {AchievementFact} */
    const fact = {
      schemaVersion: FACT_SCHEMA_VERSION,
      factId: buildFactId(matchId, eventIndex, 0, kind),
      matchId,
      sequence: eventSeq,
      stateRevision: context.stateRevision ?? null,
      actorId,
      kind,
      payload,
      provenance,
    };

    facts.push(fact);
  }

  return facts;
}

/**
 * Create a single MATCH_STATE_CHECKPOINT fact with scores and state info.
 * @param {string} matchId
 * @param {string} humanPlayerId
 * @param {{
 *   humanScore: number,
 *   opponentScore: number,
 *   humanHandCount: number,
 *   opponentHandCount: number,
 *   stackDepth: number,
 *   fullTurnSequence: number,
 *   stateRevision: number,
 *   isTerminal: boolean,
 *   winner: string|null,
 *   isDraw: boolean,
 * }} snapshot
 * @param {('LOCAL_AUTHORITY'|'NETWORK_AUTHORITY')} [provenance]
 * @param {number} [eventIndex]
 * @returns {AchievementFact}
 */
export function createCheckpointFact(matchId, humanPlayerId, snapshot, provenance = 'LOCAL_AUTHORITY', eventIndex = -1) {
  return {
    schemaVersion: FACT_SCHEMA_VERSION,
    factId: buildFactId(matchId, eventIndex, 0, FACT_KIND.MATCH_STATE_CHECKPOINT),
    matchId,
    sequence: eventIndex,
    stateRevision: snapshot.stateRevision ?? null,
    actorId: null,
    kind: FACT_KIND.MATCH_STATE_CHECKPOINT,
    payload: {
      humanPlayerId,
      humanScore: snapshot.humanScore,
      opponentScore: snapshot.opponentScore,
      humanHandCount: snapshot.humanHandCount,
      opponentHandCount: snapshot.opponentHandCount,
      stackDepth: snapshot.stackDepth,
      fullTurnSequence: snapshot.fullTurnSequence,
      isTerminal: snapshot.isTerminal ?? false,
      winner: snapshot.winner ?? null,
      isDraw: snapshot.isDraw ?? false,
    },
    provenance,
  };
}
