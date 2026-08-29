import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const vendorRuntime = path.join(root, 'runtime/vendor-dist/src');
const authorityRuntime = path.join(root, 'runtime/autonomy-engine-dist/src');
/**
 * Build a file:// URL for a runtime module.
 * @param {string} dir - Runtime directory path
 * @param {string} file - Module filename
 * @returns {string}
 */
const moduleUrl = (dir, file) => pathToFileURL(path.join(dir, file)).href;

const phase16 = await import(moduleUrl(vendorRuntime, 'phase16.js'));
const views = await import(moduleUrl(authorityRuntime, 'views.js'));
const hash = await import(moduleUrl(authorityRuntime, 'hash.js'));
const engineModule = await import(moduleUrl(authorityRuntime, 'engine.js'));
const authorityPhase16 = await import(moduleUrl(authorityRuntime, 'phase16.js'));
const authorityState = await import(moduleUrl(authorityRuntime, 'state.js'));
const firstContact = await import(moduleUrl(authorityRuntime, 'autonomy.js'));
const core = await import(moduleUrl(authorityRuntime, 'core-autonomy.js'));
const coreAdvanced = await import(moduleUrl(authorityRuntime, 'core-advanced.js'));
const coreAuthority = await import(moduleUrl(authorityRuntime, 'core-authority.js'));
const coreEffects = await import(moduleUrl(authorityRuntime, 'core-effects.js'));
const coreResponse = await import(moduleUrl(authorityRuntime, 'core-response.js'));
const corePrivate = await import(moduleUrl(authorityRuntime, 'core-private-choice.js'));
const ranksModule = await import(moduleUrl(authorityRuntime, 'ranks.js'));

export const { parseCertifiedReplay, verifyCertifiedReplay, publicCertifiedReplayView, serializeCertifiedReplay } = phase16;
export const { publicStateView, privateStateView, publicEventView } = views;
export const { hashCanonical } = hash;
export const authorityHashCanonical = hash.hashCanonical;
export const deriveSecuredPoints = authorityState.deriveSecuredPoints;

export const {
  FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE,
  FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE,
  FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE,
  FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE,
  FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE,
  autonomousCapabilities
} = firstContact;
export const { CORE_ADVANCED_AUTHORITY_PROFILE, CORE_UNRESTRICTED_AUTHORITY_PROFILE } = coreAdvanced;
export const { CORE_FOUNDATION_AUTHORITY_PROFILE } = coreAuthority;
export const { CORE_EFFECT_DECLARATION_PROFILE } = coreEffects;
export const { CORE_RESPONSE_AUTHORITY_PROFILE } = coreResponse;
export const { CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE } = corePrivate;
export const { coreAuthorityCapabilities } = core;

/**
 * Exact set of supported engine rules profile IDs, derived from the
 * canonical profile objects. Used by the match server to cross-check
 * the network-protocol's SUPPORTED_PROFILE_IDS at startup (PROTO-01).
 */
export const SUPPORTED_PROFILE_IDS = Object.freeze(new Set([
  CORE_FOUNDATION_AUTHORITY_PROFILE.id,
  CORE_ADVANCED_AUTHORITY_PROFILE.id,
  CORE_UNRESTRICTED_AUTHORITY_PROFILE.id,
  CORE_EFFECT_DECLARATION_PROFILE.id,
  CORE_RESPONSE_AUTHORITY_PROFILE.id,
  CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id,
]));

export const DEFAULT_SIMULATION_PROFILE = CORE_ADVANCED_AUTHORITY_PROFILE.id;
export const ENGINE_VERSION = '4.2.6';
export const RULES_VERSION = '4.3.1';
export const OFFICIAL_RULES_VERSION = '4.3.1';

// Rank authority — engine-derived, not hand-copied
export const RANK_REGISTRY = ranksModule.RANK_REGISTRY;
export const allRankDefinitions = ranksModule.allRankDefinitions;
export const rankDefinition = ranksModule.rankDefinition;
export const parseIdentity = ranksModule.parseIdentity;
export const hasOrdinaryScuttleImmunity = ranksModule.hasOrdinaryScuttleImmunity;
export const compareScuttle = ranksModule.compareScuttle;

// Canonical rank list in engine order
export const CANONICAL_RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","RJ","BJ"];

// Build a browser-safe canonical rank authority artifact
/**
 * Build a browser-safe canonical rank authority artifact.
 * @returns {{ schemaVersion: string, engineVersion: string, rulesVersion: string, authorityHash: *, ranks: *[] }}
 */
export function canonicalRankAuthority() {
  const defs = allRankDefinitions();
  const authorityHash = hash.hashCanonical(defs);
  return {
    schemaVersion: '1.0.0',
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    authorityHash,
    ranks: defs.map(
      /** @param {*} d */
      (d) => ({
      rankId: d.rank,
      displayName: d.rank,
      prPoints: d.prPoints,
      scuttleOrder: d.scuttleOrder,
      modes: [...d.modes],
      prScuttleImmune: d.prScuttleImmune ?? false,
      prEffectTargetImmune: d.prEffectTargetImmune ?? false,
      notes: [...d.notes],
      sourceEngineVersion: ENGINE_VERSION,
      sourceRulesVersion: RULES_VERSION
    }))
  };
}

/**
 * Load and parse a certified replay from a file path.
 * @param {string} file - Path to the replay file
 * @returns {Promise<*>}
 */
export async function loadCertifiedReplay(file) {
  return parseCertifiedReplay(await readFile(file, 'utf8'));
}

/**
 * Project a simulation frame for a viewer.
 * @param {{ state: * }} frame - Simulation frame with a state property
 * @param {'public'|'player'|'spectator'} mode - Projection mode
 * @param {string} viewerId - Viewer player identifier
 * @returns {*}
 */
export function projectFrame(frame, mode, viewerId) {
  if (mode === 'public') return views.publicStateView(frame.state);
  if (mode === 'player') return views.privateStateView(frame.state, viewerId);
  // IRX-M23: Spectator mode must use publicStateView (hides all hands),
  // NOT raw frame.state (which contains seed, RNG, all hand identities).
  // Unknown modes must throw — never fall through to raw state.
  if (mode === 'spectator') return views.publicStateView(frame.state);
  throw new Error(`Unknown projection mode: ${mode}`);
}

/**
 * Check if a profile identifier is a core profile.
 * @param {unknown} profileId - Profile identifier to check
 * @returns {boolean}
 */
export function isCoreProfile(profileId) {
  return typeof profileId === 'string' && profileId.startsWith('core-');
}

export function simulationCapabilities() {
  return [...firstContact.autonomousCapabilities(), ...core.coreAuthorityCapabilities()];
}

/**
 * Create a new simulation state from a match setup.
 * @param {Record<string, *>} setup - Match setup configuration
 * @returns {*}
 */
export function createSimulationState(setup) {
  if (isCoreProfile(setup.profileId)) {
    return core.createCoreMatchState({
      profileId: setup.profileId,
      playerIds: setup.playerIds,
      seatOrder: setup.seatOrder,
      enabledModules: setup.enabledModules ?? [],
      seed: setup.seed
    });
  }
  return firstContact.createMatchState({ ...setup, eventApprovedModules: setup.eventApprovedModules ?? [] });
}

/**
 * Advance the simulation to the next decision point.
 * @param {Record<string, *>} state - Current simulation state
 * @returns {*}
 */
export function advanceSimulationToDecision(state) {
  return isCoreProfile(state.metadata?.coreAuthority?.profileId)
    ? core.advanceCoreToDecision(state)
    : firstContact.advanceToDecision(state);
}

/**
 * Produce an authorized view of a legal action.
 * @param {*} action - Legal action object
 * @param {string} profileId - Profile identifier
 * @returns {*}
 */
export function authorizedActionView(action, profileId) {
  return isCoreProfile(profileId) ? core.toAuthorizedCoreAction(action) : firstContact.authorizedLegalActionView(action);
}

/**
 * Create a decision frame from the current simulation state.
 * @param {Record<string, *>} state - Current simulation state
 * @returns {*}
 */
export function createSimulationDecisionFrame(state) {
  const advanced = advanceSimulationToDecision(state);
  if (advanced.status !== 'PLAYER_DECISION_REQUIRED' || !advanced.legalActionFrame) {
    return { ...advanced, policyActions: [], resolve: () => null };
  }
  const profileId = state.metadata?.coreAuthority?.profileId ?? state.metadata?.autonomy?.profileId ?? null;
  const commandVault = new Map(advanced.legalActionFrame.actions.map(
    /** @param {*} action */
    (action) => [action.actionId, action.command]));
  const policyActions = advanced.legalActionFrame.actions.map(
    /** @param {*} action */
    (action) => authorizedActionView(action, profileId));
  return {
    ...advanced,
    policyActions,
    resolve(/** @type {string} */ actionId) {
      const command = commandVault.get(actionId);
      if (!command) throw Object.assign(new Error(`Unknown or stale action id: ${actionId}`), { code: 'ACTION_ID_INVALID' });
      return command;
    }
  };
}

/**
 * Execute a simulation action and return the resulting state.
 * @param {Record<string, *>} state - Current simulation state
 * @param {*} command - Command to execute
 * @returns {*}
 */
export function executeSimulationAction(state, command) {
  return new engineModule.IntrilexEngine().execute(state, command);
}

export const createAuthorityCertifiedReplay = authorityPhase16.createCertifiedReplay;
export const verifyAuthorityCertifiedReplay = authorityPhase16.verifyCertifiedReplay;
export const publicAuthorityCertifiedReplayView = authorityPhase16.publicCertifiedReplayView;

/**
 * Compute the point value of a card.
 * @param {*} card - Card object
 * @returns {?number}
 */
function cardPointValue(card) {
  if (!card) return null;
  if (typeof card.state?.pointValue === 'number') return card.state.pointValue;
  const rank = String(card.identity ?? '').replace(/[♣♦♥♠]/u, '');
  if (/^\d+$/.test(rank)) return Number(rank);
  return { A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[rank] ?? 0;
}

/**
 * Build a safe view of a single card.
 * @param {Record<string, *>} state - Simulation state
 * @param {Object<string, *>} knownCards - Map of known card views
 * @param {string} id - Card identifier
 * @returns {*}
 */
function cardView(state, knownCards, id) {
  const card = state.cards[id];
  if (!card) return null;
  const view = {
    id,
    identity: card.identity,
    controllerId: card.controllerId,
    originalOwnerId: card.originalOwnerId,
    zone: card.zone,
    pointValue: cardPointValue(card),
    tapped: card.state?.tapped === true,
    aegis: card.state?.aegis !== undefined || card.state?.aegisExpiresAt !== undefined,
    swapBarFaceDown: card.state?.swapBarFaceDown === true,
    swapBarFaceUp: card.state?.swapBarFaceUp === true,
    providesGuard: card.state?.providesGuard === true,
    jackHostId: card.state?.jackHostId ?? null,
    jackAttachmentId: card.state?.jackAttachmentId ?? null,
    exileBound: card.state?.exileBound === true,
    revealedUntilStart: card.state?.revealedUntilStart !== undefined
  };
  knownCards[id] = view;
  return view;
}

/**
 * Build a strict policy view for a specific actor.
 * @param {Record<string, *>} state - Current simulation state
 * @param {string} actorId - Actor player identifier
 * @returns {*}
 */
export function strictPolicyView(state, actorId) {
  const actor = state.players[actorId];
  if (!actor) throw new Error(`Unknown actor ${actorId}`);
  const knownCards = {};
  /** @param {string} id */
  const include = (id) => cardView(state, knownCards, id);
  const own = {
    goal: actor.goal,
    securedPoints: deriveSecuredPoints(state, actorId),
    hand: actor.hand.map(include).filter(Boolean),
    pr: actor.pr.map(include).filter(Boolean),
    er: actor.er.map(include).filter(Boolean),
    limits: structuredClone(actor.limits ?? {})
  };
  const opponents = state.turnOrder.filter(
    /** @param {string} id */
    (id) => id !== actorId).map(
    /** @param {string} id */
    (id) => ({
    playerId: id,
    goal: state.players[id].goal,
    securedPoints: deriveSecuredPoints(state, id),
    handCount: state.players[id].hand.length,
    pr: state.players[id].pr.map(include).filter(Boolean),
    er: state.players[id].er.map(include).filter(Boolean),
    limits: {
      pendingFullTurnSkips: state.players[id].limits?.pendingFullTurnSkips ?? 0,
      pendingActionPhaseSkips: state.players[id].limits?.pendingActionPhaseSkips ?? 0
    }
  }));
  const coreRuntime = state.metadata?.coreAuthority;
  const firstRuntime = state.metadata?.autonomy;
  const choice = coreRuntime?.privateChoice ?? firstRuntime?.privateChoice ?? null;
  const pendingChoice = choice?.chooserId === actorId ? {
    choiceId: choice.choiceId,
    kind: choice.kind,
    stage: choice.stage,
    minSelections: choice.minSelections,
    maxSelections: choice.maxSelections,
    optionCards: (choice.optionCardIds ?? []).map(include).filter(Boolean),
    sourceCard: choice.sourceCardId ? include(choice.sourceCardId) : null,
    context: structuredClone(choice.context ?? {})
  } : null;
  const stack = (state.stack ?? []).map(
    /** @param {*} item */
    (item) => ({
    id: item.id,
    controllerId: item.controllerId,
    originalControllerId: item.originalControllerId ?? null,
    kind: item.kind,
    status: item.status,
    sourceCardIds: [...(item.sourceCardIds ?? [])],
    targetCardIds: [...(item.targetCardIds ?? [])],
    actionType: item.coreAuthority?.actionType ?? item.firstContactAuthority?.actionType ?? null,
    stackClass: item.coreAuthority?.stackClass ?? item.firstContactAuthority?.stackClass ?? null,
    advancedKind: item.coreAuthority?.advanced?.kind ?? null
  }));
  const swapBar = state.zones.swapBar.map(
    /** @param {string} id */
    (id) => {
    const card = state.cards[id];
    return card?.state?.swapBarFaceUp === true ? include(id) : { id, identity: 'HIDDEN', faceDown: true };
  });
  return {
    schemaVersion: '3.0',
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    profileId: coreRuntime?.profileId ?? firstRuntime?.profileId ?? null,
    actorId,
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    revision: state.revision,
    fullTurnSequence: state.fullTurnSequence,
    dpCount: state.zones.dp.length,
    gyCount: state.zones.gy.length,
    gyTopCard: state.zones.gy.length > 0 ? include(state.zones.gy[state.zones.gy.length - 1]) : null,
    exileCount: state.zones.exile.length,
    swapBar,
    boardLock: structuredClone(state.metadata?.boardLock ?? null),
    suddenDeath: structuredClone(state.metadata?.suddenDeath ?? null),
    exhausted: structuredClone(coreRuntime?.exhausted ?? firstRuntime?.exhausted ?? null),
    voltage: structuredClone(state.metadata?.phase8 ?? null),
    priority: structuredClone(state.priority),
    stack,
    triggerQueue: (state.triggerQueue ?? []).map(
      /** @param {*} trigger */
      (trigger) => ({ id: trigger.id, type: trigger.type, controllerId: trigger.controllerId ?? null, status: trigger.status ?? null })),
    pendingChoice,
    knownCards,
    own,
    opponents
  };
}

/**
 * Reconstruct authority checkpoints by replaying commands.
 * @param {Record<string, *>} replay - Certified replay object
 * @returns {*[]}
 */
export function reconstructAuthorityCheckpoints(replay) {
  verifyAuthorityCertifiedReplay(replay);
  const engine = new engineModule.IntrilexEngine();
  let state = structuredClone(replay.initialState);
  const frames = [{ commandIndex: -1, frameIndex: 0, state, events: [], accepted: null, error: null }];
  for (const [index, command] of replay.commands.entries()) {
    const result = engine.execute(state, command);
    state = result.state;
    frames.push({ commandIndex: index, frameIndex: index + 1, accepted: result.accepted, state, events: result.events, error: result.error ?? null });
  }
  return frames;
}

export const authorityPublicStateView = views.publicStateView;
export const authorityPrivateStateView = views.privateStateView;
/**
 * Build a public event view for a single event.
 * @param {*} event - Event object
 * @returns {*}
 */
export const authorityPublicEventView = (event) => views.publicEventView([event])[0];
