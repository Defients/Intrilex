// ═══════════════════════════════════════════════════════════════
// player-projection.mjs — Safe network DTO for player views
//
// Ensures no hidden information, raw commands, RNG, seeds,
// or authority tokens cross the network boundary.
// ═══════════════════════════════════════════════════════════════

/**
 * Fields that must NEVER appear in a network player view.
 */
const FORBIDDEN_VIEW_FIELDS = new Set([
  'rng', 'seed', 'setupSeed', 'rawState',
  'commandVault', 'command', 'commands', 'engineCommand',
  'privateChoiceToken', 'privateChoiceTokens',
  'opponentHandIdentities', 'drawPileIdentities',
  'omniscientState', 'authorityHash',
]);

/**
 * Fields that must NEVER appear in a network legal action.
 */
const FORBIDDEN_ACTION_FIELDS = new Set([
  'command', 'engineCommand', 'rawCommand',
  'privateToken', 'choiceToken',
  'omniscientCardId',
]);

/**
 * @typedef {Object} AuthorizedView
 * @property {string} [matchId]
 * @property {string} [status]
 * @property {string} [profileId]
 * @property {string} [playerId]
 * @property {string} [viewHash]
 * @property {Record<string, *>} [match]
 * @property {{ actorId: *, stateRevision: *, frameHash: *, isMyDecision: *, legalActions?: Array<Record<string, *>> }} [decision]
 * @property {Record<string, *>|null} [playerView]
 * @property {Array<{ type: string, controllerId?: string }>} [recentEvents]
 * @property {{ playerId: string, connectionState: string }|null} [opponent]
 */

/**
 * Build a safe network view for a specific player.
 * This is an allowlist approach — only permitted fields pass through.
 *
 * @param {AuthorizedView|null} authorizedView - The authorized view from the match session
 * @returns {Record<string, *>|null} Safe network DTO
 */
export function buildNetworkPlayerView(authorizedView) {
  if (!authorizedView) return null;

  /** @type {Record<string, *>} */
  const safe = {};

  // Copy allowed top-level fields
  /** @type {('matchId'|'status'|'profileId'|'playerId'|'viewHash')[]} */
  const allowedFields = ['matchId', 'status', 'profileId', 'playerId', 'viewHash'];
  for (const key of allowedFields) {
    if (authorizedView[key] !== undefined) {
      safe[key] = authorizedView[key];
    }
  }

  // Match info
  if (authorizedView.match) {
    safe.match = {
      fullTurnSequence: authorizedView.match.fullTurnSequence,
      phase: authorizedView.match.phase,
      activePlayerId: authorizedView.match.activePlayerId,
      winner: authorizedView.match.winner,
      terminationReason: authorizedView.match.terminationReason,
    };
  }

  // Decision (only if it's this player's decision, and only safe fields)
  if (authorizedView.decision) {
    const dec = authorizedView.decision;
    safe.decision = {
      actorId: dec.actorId,
      stateRevision: dec.stateRevision,
      frameHash: dec.frameHash,
      isMyDecision: dec.isMyDecision,
    };
    if (dec.isMyDecision && dec.legalActions) {
      safe.decision.legalActions = dec.legalActions.map(action => sanitizeAction(action));
    }
  }

  // Player view (pass through the engine's privateStateView — it's already safe)
  if (authorizedView.playerView) {
    safe.playerView = sanitizePlayerView(authorizedView.playerView);
  }

  // Recent events (only safe public events)
  if (authorizedView.recentEvents) {
    safe.recentEvents = authorizedView.recentEvents.map(e => ({
      type: e.type,
      controllerId: e.controllerId ?? null,
    }));
  }

  // Opponent info (connection state only, no hand identities)
  if (authorizedView.opponent) {
    safe.opponent = {
      playerId: authorizedView.opponent.playerId,
      connectionState: authorizedView.opponent.connectionState,
    };
  }

  return safe;
}

/**
 * Sanitize a legal action for network transport.
 * Removes all authority-only fields.
 *
 * @param {Record<string, *>} action
 * @returns {Record<string, *>}
 */
function sanitizeAction(action) {
  /** @type {Record<string, *>} */
  const safe = {};
  const allowed = ['actionId', 'family', 'mode', 'timingClass',
                    'sourceCardIds', 'targetCardIds', 'displayLabel'];
  for (const key of allowed) {
    if (action[key] !== undefined) {
      safe[key] = action[key];
    }
  }
  return safe;
}

/**
 * Sanitize the player view, removing any hidden info that might have leaked.
 *
 * @param {Record<string, *>|null} view
 * @returns {Record<string, *>|null}
 */
function sanitizePlayerView(view) {
  if (!view) return view;
  const safe = structuredClone(view);

  // Remove any forbidden fields
  for (const key of FORBIDDEN_VIEW_FIELDS) {
    delete safe[key];
  }

  // Ensure opponent hand is only a count, not identities
  if (safe.opponents) {
    for (const opp of safe.opponents) {
      if (opp.hand && Array.isArray(opp.hand)) {
        opp.handCount = opp.hand.length;
        delete opp.hand;
      }
    }
  }

  // Ensure draw pile is only a count
  if (safe.drawPile && Array.isArray(safe.drawPile)) {
    safe.drawPileCount = safe.drawPile.length;
    delete safe.drawPile;
  }

  // Ensure swap bar face-down cards are hidden
  if (safe.swapBar && Array.isArray(safe.swapBar)) {
    safe.swapBar = safe.swapBar.map(c => {
      if (c.faceDown) {
        return { id: 'HIDDEN', identity: 'HIDDEN', faceDown: true };
      }
      return c;
    });
  }

  return safe;
}

/**
 * Build a neutral spectator view that hides BOTH players' hands,
 * private decisions, legal actions, command IDs, RNG state, seed,
 * tokens, and role-private engine data.
 *
 * Spectators see only public board state: phase, turn, active player,
 * point rows, enduring rows, secured points, goals, zone counts,
 * stack (public items only), and terminal info.
 *
 * @param {AuthorizedView|null} authorizedView - The authorized view from the match session
 *   (can be from any participant — only public fields are extracted)
 * @returns {Record<string, *>|null} Neutral spectator DTO
 */
export function buildSpectatorView(authorizedView) {
  if (!authorizedView) return null;

  /** @type {Record<string, *>} */
  const safe = {};

  // Copy allowed top-level fields (no playerId — spectator has no seat)
  /** @type {('matchId'|'status'|'profileId'|'viewHash')[]} */
  const allowedFields = ['matchId', 'status', 'profileId', 'viewHash'];
  for (const key of allowedFields) {
    if (authorizedView[key] !== undefined) {
      safe[key] = authorizedView[key];
    }
  }
  safe.playerId = null; // Spectator has no player ID
  safe.isSpectator = true;

  // Match info (public)
  if (authorizedView.match) {
    safe.match = {
      fullTurnSequence: authorizedView.match.fullTurnSequence,
      phase: authorizedView.match.phase,
      activePlayerId: authorizedView.match.activePlayerId,
      winner: authorizedView.match.winner,
      terminationReason: authorizedView.match.terminationReason,
    };
  }

  // Decision metadata — actor and revision only, NO legal actions
  if (authorizedView.decision) {
    safe.decision = {
      actorId: authorizedView.decision.actorId,
      stateRevision: authorizedView.decision.stateRevision,
      frameHash: authorizedView.decision.frameHash,
      isMyDecision: false, // Spectator never has a decision
    };
    // legalActions intentionally omitted
  }

  // Build a neutral board view from the playerView, hiding BOTH hands
  if (authorizedView.playerView) {
    safe.playerView = buildNeutralBoardView(authorizedView.playerView);
  }

  // Recent events (public types only)
  if (authorizedView.recentEvents) {
    safe.recentEvents = authorizedView.recentEvents.map(e => ({
      type: e.type,
      controllerId: e.controllerId ?? null,
    }));
  }

  // No opponent info — spectator has no opponent
  safe.opponent = null;

  return safe;
}

/**
 * Build a neutral board view from a player's private view.
 * Hides both the player's own hand and opponent hands.
 * Shows only public board state: PR, ER, secured points, goals, zone counts.
 *
 * @param {Record<string, *>|null} pv - The engine's privateStateView for a player
 * @returns {Record<string, *>|null} Neutral board view with no hand identities
 */
function buildNeutralBoardView(pv) {
  if (!pv) return null;
  const safe = structuredClone(pv);

  // Remove forbidden fields
  for (const key of FORBIDDEN_VIEW_FIELDS) {
    delete safe[key];
  }

  // Hide own hand — replace with count only
  if (safe.own) {
    if (safe.own.hand && Array.isArray(safe.own.hand)) {
      safe.own.handCount = safe.own.hand.length;
      delete safe.own.hand;
    }
  }

  // Hide opponent hands — already count-only in privateStateView, but enforce
  if (safe.opponents) {
    for (const opp of safe.opponents) {
      if (opp.hand && Array.isArray(opp.hand)) {
        opp.handCount = opp.hand.length;
        delete opp.hand;
      }
    }
  }

  // Draw pile is count only
  if (safe.drawPile && Array.isArray(safe.drawPile)) {
    safe.drawPileCount = safe.drawPile.length;
    delete safe.drawPile;
  }

  // Swap bar face-down cards are hidden
  if (safe.swapBar && Array.isArray(safe.swapBar)) {
    safe.swapBar = safe.swapBar.map(c => {
      if (c.faceDown) {
        return { id: 'HIDDEN', identity: 'HIDDEN', faceDown: true };
      }
      return c;
    });
  }

  // Hide pending choice (private decision data)
  if (safe.pendingChoice) {
    safe.pendingChoice = null;
  }

  // Hide known cards that include hand identities
  if (safe.knownCards) {
    // Keep only public-zone cards (PR, ER, GY, exile, swap-bar face-up)
    // Remove any cards that are in a hand zone
    /** @type {Record<string, *>} */
    const filtered = {};
    for (const [id, card] of Object.entries(safe.knownCards)) {
      if (card && card.zone && card.zone !== 'hand') {
        filtered[id] = card;
      }
    }
    safe.knownCards = filtered;
  }

  return safe;
}

/**
 * Validate that a network view contains no forbidden fields.
 * Used in tests to assert privacy.
 *
 * @param {AuthorizedView} view - The network view to validate
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateNetworkViewPrivacy(view) {
  const violations = [];
  if (!view || typeof view !== 'object') return { valid: false, violations: ['NOT_OBJECT'] };

  const json = JSON.stringify(view);

  // Check for forbidden top-level fields
  for (const key of Object.keys(view)) {
    if (FORBIDDEN_VIEW_FIELDS.has(key)) {
      violations.push(`FORBIDDEN_FIELD:${key}`);
    }
  }

  // Check legal actions for command leakage
  if (view.decision?.legalActions) {
    for (const action of view.decision.legalActions) {
      for (const key of FORBIDDEN_ACTION_FIELDS) {
        if (action[key] !== undefined) {
          violations.push(`ACTION_LEAK:${key}:${action.actionId}`);
        }
      }
    }
  }

  // Check for seed/RNG in the serialized form
  if (json.includes('"seed"') && !json.includes('"seed":undefined')) {
    violations.push('SEED_IN_VIEW');
  }
  if (json.includes('"rng"')) {
    violations.push('RNG_IN_VIEW');
  }

  return { valid: violations.length === 0, violations };
}
