// ═══════════════════════════════════════════════════════════════
// ranked-duel-viewmodel.mjs — Pure deterministic adapter from
// authorized engine snapshot to Ranked Duel UI view model.
//
// NEVER mutates its input.
// NEVER inspects raw private engine state.
// NEVER manufactures legal actions.
// ═══════════════════════════════════════════════════════════════

import { buildLegalActionContract, groupActionsByTiming } from './authority/legal-action-adapter.js';
import { actionLabel, shortActionLabel, timingLabel } from './action-presenter.js';

const SCHEMA_VERSION = '1.1.0';

/**
 * @param {object} snapshot — Authorized player snapshot from play-controller
 * @param {object} localProfile — Local player profile (rating, badges, record)
 * @param {object} [modeInfo] — Optional mode metadata { kind, label, networkRanked }
 * @returns {object} RankedDuelViewModel
 */
export function buildRankedDuelViewModel(snapshot, localProfile = null, modeInfo = null) {
  if (!snapshot || !snapshot.state) {
    return createErrorModel('MISSING_SNAPSHOT', 'No authorized snapshot available');
  }

  const state = snapshot.state;
  const privacy = validateSnapshotPrivacy(state);

  if (!privacy.valid) {
    return createErrorModel('PRIVACY_VIOLATION', privacy.reason);
  }

  const humanPlayerId = snapshot.humanPlayerId ?? state.seatOrder?.[0] ?? 'P1';
  const opponentPlayerId = state.seatOrder?.find(id => id !== humanPlayerId) ?? 'P2';
  const humanSeatIndex = state.seatOrder?.indexOf(humanPlayerId) ?? 0;
  const opponentSeatIndex = humanSeatIndex === 0 ? 1 : 0;

  const human = buildPlayerPlate(state, humanPlayerId, humanSeatIndex, true, localProfile);
  const opponent = buildPlayerPlate(state, opponentPlayerId, opponentSeatIndex, false, null);

  const zones = buildZones(state, humanPlayerId);
  const actions = buildAuthorizedActions(snapshot);
  // Extract legal source card IDs so hand cards can be marked as legal sources
  const legalSourceIds = new Set();
  for (const a of actions) {
    for (const sid of a.sourceEntityIds ?? []) legalSourceIds.add(sid);
  }
  const battlefield = buildBattlefield(state, humanPlayerId, opponentPlayerId, humanSeatIndex, legalSourceIds);
  const stack = buildStack(state);
  const chat = buildChat(snapshot);

  const mode = modeInfo ?? { kind: 'LOCAL_AI', label: 'LOCAL \u00b7 VS AI', networkRanked: false };

  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: snapshot.sessionId ?? null,
    status: deriveStatus(state, snapshot),
    mode,
    match: {
      fullTurnSequence: state.fullTurnSequence ?? 0,
      phase: state.phase ?? 'SETUP',
      activePlayerId: state.activePlayerId ?? null,
      priorityOwnerId: state.priorityOwnerId ?? null,
      windowLabel: state.windowLabel ?? '',
      goalMayBeDynamic: true,
      globalStates: extractGlobalStates(state),
      terminationReason: state.terminationReason ?? null,
      winner: state.winner ?? null,
    },
    human,
    opponent,
    zones,
    battlefield,
    stack,
    actions,
    chat,
    privacy: {
      opponentHandIdentifiersPresent: false,
      rawCommandsPresent: false,
    },
  };
}

function createErrorModel(code, reason, modeInfo = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: null,
    status: 'ERROR',
    mode: modeInfo ?? { kind: 'LOCAL_AI', label: 'LOCAL \u00b7 VS AI', networkRanked: false },
    match: { fullTurnSequence: 0, phase: 'ERROR', activePlayerId: null, priorityOwnerId: null, windowLabel: '', goalMayBeDynamic: true, terminationReason: null, winner: null },
    human: emptyPlayerPlate(),
    opponent: emptyPlayerPlate(),
    zones: emptyZones(),
    battlefield: emptyBattlefield(),
    stack: [],
    actions: [],
    chat: [],
    privacy: { opponentHandIdentifiersPresent: false, rawCommandsPresent: false },
    error: { code, reason },
  };
}

// ── Privacy validation ─────────────────────────────────────────

function validateSnapshotPrivacy(state) {
  // Opponent hand must not expose card identities
  const opponentPlayerId = state.seatOrder?.[1] ?? 'P2';
  const opponentHand = state.players?.[opponentPlayerId]?.hand ?? [];

  // Support both array hands (legacy) and object hand contracts { count }
  if (Array.isArray(opponentHand)) {
    for (const card of opponentHand) {
      if (card && (card.identity || card.rank || card.suit)) {
        return { valid: false, reason: `Opponent hand exposes card identity: ${card.identity ?? card.rank ?? 'unknown'}` };
      }
    }
  }

  // No raw commands in view model
  if (state._rawCommands || state._commandVault) {
    return { valid: false, reason: 'Raw commands present in snapshot' };
  }

  return { valid: true, reason: null };
}

// ── Player plate ───────────────────────────────────────────────

function buildPlayerPlate(state, playerId, seatIndex, isHuman, localProfile) {
  const player = state.players?.[playerId] ?? {};
  const secured = player.securedPoints ?? 0;
  const goal = player.goal ?? state.startingGoal ?? 21;

  return {
    playerId,
    seatIndex,
    displayName: isHuman ? (localProfile?.displayName ?? 'You') : (player.displayName ?? 'AI'),
    isHuman,
    monogram: isHuman ? 'H' : 'A',
    secured,
    goal,
    goalLabel: secured >= goal ? 'REACHED' : `${secured}/${goal}`,
    rating: isHuman ? (localProfile?.rating ?? null) : null,
    aiRating: !isHuman ? (player.aiRating ?? null) : null,
    badges: isHuman ? (localProfile?.badges ?? []) : [],
    statusIndicators: buildStatusIndicators(player),
  };
}

function emptyPlayerPlate() {
  return {
    playerId: '', seatIndex: 0, displayName: '', isHuman: true,
    monogram: '?', secured: 0, goal: 21, goalLabel: '0/21',
    rating: null, aiRating: null, badges: [], statusIndicators: [],
  };
}

function buildStatusIndicators(player) {
  const indicators = [];
  if (player.isActive) indicators.push({ type: 'ACTIVE', label: 'Active' });
  if (player.hasPriority) indicators.push({ type: 'PRIORITY', label: 'Priority' });
  return indicators;
}

// ── Zones ──────────────────────────────────────────────────────

function buildZones(state, humanPlayerId) {
  // Support both array-based zones (legacy) and object-based zone contracts (v0.21+).
  // Object contracts: { count, topCard?, newestVisibleCard? }
  // Array zones: [card, ...] (length = count, last element = top/newest)
  const drawPile = state.drawPile ?? [];
  const discard = state.graveyard ?? state.discard ?? [];
  const exile = state.exile ?? [];

  const drawCount = Array.isArray(drawPile) ? drawPile.length : (drawPile.count ?? 0);
  const discardCount = Array.isArray(discard) ? discard.length : (discard.count ?? 0);
  const discardTop = Array.isArray(discard)
    ? (discard.length > 0 ? buildPublicCardView(discard[discard.length - 1]) : null)
    : (discard.topCard ?? null);
  const exileCount = Array.isArray(exile) ? exile.length : (exile.count ?? 0);
  const exileNewest = Array.isArray(exile)
    ? (exile.length > 0 ? buildPublicCardView(exile[exile.length - 1]) : null)
    : (exile.newestVisibleCard ?? null);

  return {
    draw: { count: drawCount },
    discard: { count: discardCount, topCard: discardTop },
    exile: { count: exileCount, newestCard: exileNewest },
    swap: buildSwapSlots(state),
  };
}

function emptyZones() {
  return {
    draw: { count: 0 },
    discard: { count: 0, topCard: null },
    exile: { count: 0, newestCard: null },
    swap: [],
  };
}

function buildSwapSlots(state) {
  const swap = state.swapBar ?? state.swap ?? [];
  return swap.map((card, index) => ({
    slotId: index,
    entityId: card?.id ?? null,
    card: card && !card.faceDown ? buildPublicCardView(card) : null,
    faceDown: card ? card.faceDown === true : true,
    swapAvailable: state.swapAvailable ?? true,
  }));
}

// ── Battlefield ────────────────────────────────────────────────

function buildBattlefield(state, humanPlayerId, opponentPlayerId, humanSeatIndex, legalSourceIds = new Set()) {
  const human = state.players?.[humanPlayerId] ?? {};
  const opponent = state.players?.[opponentPlayerId] ?? {};

  const humanPR = (human.pointRow ?? human.pr ?? []).map(buildPublicCardView);
  const humanER = (human.enduringRow ?? human.er ?? []).map(buildPublicCardView);
  const opponentPR = (opponent.pointRow ?? opponent.pr ?? []).map(buildPublicCardView);
  const opponentER = (opponent.enduringRow ?? opponent.er ?? []).map(buildPublicCardView);

  const humanHand = (Array.isArray(human.hand) ? human.hand : []).map(card => {
    const view = buildPrivateOwnedCardView(card);
    if (view && legalSourceIds.has(view.entityId)) view.legalSource = true;
    return view;
  });
  const opponentHandCount = Array.isArray(opponent.hand) ? opponent.hand.length : (opponent.hand?.count ?? 0);

  // Determine row ordering based on seat
  const topPR = humanSeatIndex === 1 ? humanPR : opponentPR;
  const topER = humanSeatIndex === 1 ? humanER : opponentER;
  const bottomPR = humanSeatIndex === 1 ? opponentPR : humanPR;
  const bottomER = humanSeatIndex === 1 ? opponentER : humanER;

  return {
    topPR, topER, bottomPR, bottomER,
    humanHand,
    opponentHandCount,
    humanSeatIndex,
  };
}

function emptyBattlefield() {
  return {
    topPR: [], topER: [], bottomPR: [], bottomER: [],
    humanHand: [], opponentHandCount: 0, humanSeatIndex: 0,
  };
}

// ── Card views ─────────────────────────────────────────────────

function buildPublicCardView(card) {
  if (!card) return null;
  return {
    entityId: card.entityId ?? card.id ?? null,
    identity: card.identity ?? null,
    rank: card.rank ?? null,
    suit: card.suit ?? null,
    pointValue: card.pointValue ?? card.effectivePoints ?? null,
    isGeneratedCopy: card.isGeneratedCopy === true,
    statusMarkers: buildCardMarkers(card),
    zone: card.zone ?? null,
    ownerId: card.ownerId ?? card.controllerId ?? null,
  };
}

function buildPrivateOwnedCardView(card) {
  if (!card) return null;
  return {
    entityId: card.entityId ?? card.id ?? null,
    identity: card.identity ?? null,
    rank: card.rank ?? null,
    suit: card.suit ?? null,
    pointValue: card.pointValue ?? card.effectivePoints ?? null,
    isGeneratedCopy: card.isGeneratedCopy === true,
    statusMarkers: buildCardMarkers(card),
    zone: card.zone ?? 'HAND',
    ownerId: card.ownerId ?? card.controllerId ?? null,
    legalSource: card.legalSource === true,
    superEligible: card.superEligible === true,
  };
}

function buildCardMarkers(card) {
  const markers = [];
  if (card.tapped) markers.push({ type: 'TAPPED', label: 'Tapped' });
  if (card.aegis) markers.push({ type: 'AEGIS', label: 'Aegis' });
  if (card.guard) markers.push({ type: 'GUARD', label: 'Guard' });
  if (card.exileBound) markers.push({ type: 'EXILE_BOUND', label: 'Exile-Bound' });
  if (card.revealedUntilStart) markers.push({ type: 'REVEALED', label: 'Revealed' });
  if (card.isAttachment) markers.push({ type: 'ATTACHMENT', label: 'Attachment' });
  if (card.selected) markers.push({ type: 'SELECTED', label: 'Selected' });
  if (card.legalTarget) markers.push({ type: 'LEGAL_TARGET', label: 'Target' });
  if (card.isResolving) markers.push({ type: 'RESOLVING', label: 'Resolving' });
  return markers;
}

// ── Stack ──────────────────────────────────────────────────────

function buildStack(state) {
  const stackItems = state.stack ?? state.resolutionStack ?? [];
  const humanPlayerId = state.humanPlayerId ?? state.seatOrder?.[0] ?? 'P1';
  // Build a card identity lookup from all visible cards in the state
  const cardLookup = {};
  const collectCard = (c) => { if (c?.id) cardLookup[c.id] = c.identity ?? null; };
  // Hand, PR, ER for human
  const human = state.players?.[humanPlayerId] ?? {};
  (human.hand ?? []).forEach(collectCard);
  (human.pointRow ?? human.pr ?? []).forEach(collectCard);
  (human.enduringRow ?? human.er ?? []).forEach(collectCard);
  // Opponents
  for (const pid of (state.seatOrder ?? [])) {
    if (pid === humanPlayerId) continue;
    const opp = state.players?.[pid] ?? {};
    (opp.pointRow ?? opp.pr ?? []).forEach(collectCard);
    (opp.enduringRow ?? opp.er ?? []).forEach(collectCard);
  }
  // Swap bar
  (state.swapBar ?? state.swap ?? []).forEach(collectCard);
  // Graveyard top card
  if (state.graveyard?.topCard) collectCard(state.graveyard.topCard);

  return stackItems.map(item => ({
    stackIndex: item.stackIndex ?? item.index ?? 0,
    actionFamily: item.actionFamily ?? item.family ?? null,
    actionMode: item.actionMode ?? item.mode ?? null,
    actionType: item.actionType ?? null,
    stackClass: item.stackClass ?? null,
    sourcePlayerId: item.sourcePlayerId ?? item.actorId ?? item.controllerId ?? null,
    sourceCardIds: item.sourceCardIds ?? [],
    targetCardIds: item.targetCardIds ?? [],
    isHuman: item.isHuman ?? (item.controllerId === humanPlayerId),
    actorName: item.actorName ?? null,
    isResolving: item.isResolving === true || item.status === 'resolving',
    status: item.status ?? null,
    description: item.description ?? buildStackDescription(item, cardLookup),
  }));
}

function buildStackDescription(item, cardLookup) {
  const actionType = item.actionType ?? item.actionFamily ?? item.family ?? null;
  const stackClass = item.stackClass ?? null;
  const kind = item.kind ?? null;

  let label = actionType ?? stackClass ?? kind ?? 'Action';
  label = label.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const sourceIds = item.sourceCardIds ?? [];
  const targetIds = item.targetCardIds ?? [];
  const sourceIdentities = sourceIds.map(id => cardLookup[id]).filter(Boolean);
  const targetIdentities = targetIds.map(id => cardLookup[id]).filter(Boolean);

  let desc = label;
  if (sourceIdentities.length > 0) {
    desc += ` \u2014 ${sourceIdentities.join(', ')}`;
  }
  if (targetIdentities.length > 0) {
    desc += ` \u2192 ${targetIdentities.join(', ')}`;
  }
  return desc;
}

// ── Authorized actions ─────────────────────────────────────────

function buildAuthorizedActions(snapshot) {
  const rawActions = snapshot.legalActions ?? snapshot.authorizedActions ?? [];
  // Build legal-action contracts for enriched display: labels, timing, costs, targets
  const contracts = rawActions.map(action => {
    const contract = buildLegalActionContract(action, {});
    return {
      actionId: contract.optionId,
      family: contract.family,
      mode: contract.mode,
      form: contract.form ?? null,
      timingClass: contract.timingClass ?? 'ACTION',
      requiresSource: contract.sourceEntityIds.length > 0,
      requiresTarget: contract.targets?.required ?? false,
      targetCount: contract.targets?.minimum ?? 0,
      targetZone: null,
      sourceCardId: contract.sourceEntityIds[0] ?? null,
      sourceEntityIds: contract.sourceEntityIds,
      // Use the canonical action-presenter label, falling back to contract displayLabel
      displayLabel: actionLabel({ family: contract.family, mode: contract.mode }) || contract.displayLabel || action.description || 'Unknown',
      shortLabel: shortActionLabel({ family: contract.family, mode: contract.mode }) || contract.displayLabel || 'Unknown',
      timingLabel: timingLabel(contract.timingClass),
      isSuper: contract.isSuper ?? false,
      isSpadesVariant: contract.isSpadesVariant ?? false,
      costs: contract.costs ?? [],
      targets: contract.targets ?? { required: false, legalTargetIds: [] },
      description: action.description ?? contract.displayLabel ?? `${contract.family ?? 'Action'} ${contract.mode ?? ''}`.trim(),
      isPass: contract.isExhaustedPass || contract.isDecline || contract.family === 'pass' || contract.family === 'exhausted-pass' || contract.family === 'response-decline',
      isDecline: contract.isDecline ?? false,
      isExhaustedPass: contract.isExhaustedPass ?? false,
      isResponse: contract.isResponse ?? false,
      preview: contract.preview ?? null,
    };
  });
  return contracts;
}

/**
 * Group actions by timing class for the renderer.
 * Returns { groups, groupOrder } where groups is a map of timing key → action[].
 */
export function buildGroupedActions(actions) {
  const groups = groupActionsByTiming(actions);
  const groupOrder = ['primary', 'score', 'quick', 'interrupt', 'response', 'pass', 'system'];
  return { groups, groupOrder };
}

/**
 * Group actions by player intent: actions with the same (family, mode) pair
 * represent the same player-facing intent, differing only in source card.
 * Returns an array of intent groups sorted by intent label.
 */
export function buildIntentGroups(actions) {
  const intentMap = new Map();
  for (const a of actions) {
    const key = `${a.family}|${a.mode ?? ''}`;
    if (!intentMap.has(key)) {
      intentMap.set(key, {
        intentKey: key,
        family: a.family,
        mode: a.mode,
        displayLabel: a.displayLabel,
        shortLabel: a.shortLabel,
        timingLabel: a.timingLabel,
        timingClass: a.timingClass,
        isSuper: a.isSuper,
        isSpadesVariant: a.isSpadesVariant,
        costs: a.costs,
        requiresTarget: a.requiresTarget,
        requiresSource: a.requiresSource,
        isPass: a.isPass,
        isDecline: a.isDecline,
        isExhaustedPass: a.isExhaustedPass,
        isResponse: a.isResponse,
        preview: a.preview,
        // Collect all concrete actions for this intent
        actions: [],
        // Collect all source card IDs for this intent
        sourceCardIds: new Set(),
        // Collect all legal target IDs (union across concrete actions)
        legalTargetIds: new Set(),
      });
    }
    const intent = intentMap.get(key);
    intent.actions.push(a);
    for (const sid of a.sourceEntityIds ?? []) intent.sourceCardIds.add(sid);
    for (const tid of a.targets?.legalTargetIds ?? []) intent.legalTargetIds.add(tid);
  }

  // Convert Sets to arrays and sort by display label
  const intents = Array.from(intentMap.values()).map(intent => ({
    ...intent,
    sourceCardIds: Array.from(intent.sourceCardIds),
    legalTargetIds: Array.from(intent.legalTargetIds),
  }));
  intents.sort((a, b) => (a.displayLabel ?? '').localeCompare(b.displayLabel ?? ''));
  return intents;
}

/**
 * Resolve the concrete action for a given intent + source card selection.
 * Returns the matching action object, or null if no action matches.
 */
export function resolveConcreteAction(intent, sourceCardId) {
  if (!intent?.actions) return null;
  // Find the concrete action that uses this source card
  const match = intent.actions.find(a =>
    a.sourceEntityIds?.includes(sourceCardId)
  );
  return match ?? intent.actions[0] ?? null;
}

// ── Chat ───────────────────────────────────────────────────────

function buildChat(snapshot) {
  const messages = snapshot.chat ?? snapshot.matchChat ?? [];
  return messages.map(msg => ({
    sender: msg.sender ?? 'system',
    text: sanitizeChatText(msg.text ?? msg.message ?? ''),
    timestamp: msg.timestamp ?? null,
    isHuman: msg.isHuman === true,
    isAi: msg.isAi === true,
    isSystem: msg.isSystem === true || (!msg.isHuman && !msg.isAi),
  }));
}

function sanitizeChatText(text) {
  return String(text).slice(0, 500).replace(/[<>]/g, '');
}

// ── Global state extraction (v0.25) ────────────────────────────
// Extracts authoritative global state badges from engine state.
// Never invents states — only exposes what the engine actually provides.
function extractGlobalStates(state) {
  const states = [];
  // Voltage: check both top-level and per-player
  const voltage = state.voltage ?? state.voltageLevel;
  if (voltage && voltage > 0) {
    states.push({ key: 'voltage', label: `VOLTAGE ${voltage}`, icon: '\u26A1' });
  }
  // Board lock
  if (state.boardLock === true || state.boardLocked === true) {
    states.push({ key: 'boardLock', label: 'BOARD LOCK', icon: '\u{1F512}' });
  }
  // Sudden death
  if (state.suddenDeath === true || state.suddenDeathMode === true) {
    states.push({ key: 'suddenDeath', label: 'SUDDEN DEATH', icon: '\u26A0' });
  }
  // Time bomb
  if (state.timeBomb !== undefined && state.timeBomb !== null && state.timeBomb > 0) {
    states.push({ key: 'timeBomb', label: `TIME BOMB ${state.timeBomb}`, icon: '\u{23F0}' });
  }
  // Response window
  if (state.windowLabel && (state.windowLabel.includes('response') || state.windowLabel.includes('Response'))) {
    states.push({ key: 'responseWindow', label: 'RESPONSE WINDOW', icon: '\u21A9' });
  }
  return states;
}

// ── Status derivation ──────────────────────────────────────────

function deriveStatus(state, snapshot) {
  if (state.terminationReason) return 'TERMINAL';
  // The decision frame's isHuman flag is authoritative — in response windows,
  // the active player may be the AI (who acted) but the human has a response action.
  const isHuman = snapshot.decision?.isHuman;
  if (isHuman === true) return 'HUMAN_DECISION';
  if (isHuman === false) return 'AI_DECISION';
  // Fallback: infer from active player when no decision frame is present
  const humanId = snapshot.humanPlayerId ?? state.seatOrder?.[0];
  return state.activePlayerId === humanId ? 'HUMAN_DECISION' : 'AI_DECISION';
}
