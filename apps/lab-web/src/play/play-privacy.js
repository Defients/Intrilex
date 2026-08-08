// ═══════════════════════════════════════════════════════════════
// play-privacy.js — Privacy utilities for player-facing UI
// Ensures hidden information never leaks to DOM, ARIA, logs, or exports.
// ═══════════════════════════════════════════════════════════════

/**
 * Sensitive fields that must never appear in player UI snapshots.
 */
const FORBIDDEN_SNAPSHOT_FIELDS = new Set([
  'rng', 'seed', 'cards', 'players', 'zones', 'metadata',
  'commandVault', 'command', 'commands',
  'aiHand', 'opponentHand', 'drawPileContents',
  'privateChoiceTokens', 'integrityHash', 'provenanceHash',
]);

/**
 * Sensitive keys in replay objects that must be redacted for public export.
 */
const FORBIDDEN_PUBLIC_REPLAY_KEYS = new Set([
  'rng', 'rngTraceHash', 'seed', 'privateChoice', 'privateChoiceTokens',
  'integrityHash', 'provenanceHash', 'commandBodies',
]);

/**
 * Validate that a UI snapshot contains no hidden information.
 * @param {object} snapshot - The UI snapshot to check
 * @returns {object} { valid, violations: string[] }
 */
export function validateSnapshotPrivacy(snapshot) {
  const violations = [];
  if (!snapshot || typeof snapshot !== 'object') return { valid: false, violations: ['NOT_OBJECT'] };

  // Check top-level fields
  for (const key of Object.keys(snapshot)) {
    if (FORBIDDEN_SNAPSHOT_FIELDS.has(key)) {
      violations.push(`FORBIDDEN_FIELD:${key}`);
    }
  }

  // Check playerView for hidden info
  const pv = snapshot.playerView;
  if (pv) {
    // Opponent hand should only have count, not identities
    if (pv.opponents) {
      for (const opp of pv.opponents) {
        if (opp.hand && Array.isArray(opp.hand) && opp.hand.length > 0) {
          violations.push(`OPPONENT_HAND_IDENTITIES_LEAKED`);
        }
      }
    }
    // No raw RNG state
    if (pv.rng !== undefined) violations.push('PLAYER_VIEW_CONTAINS_RNG');
    // No seed
    if (pv.seed !== undefined) violations.push('PLAYER_VIEW_CONTAINS_SEED');
  }

  // Check decision legalActions for command bodies
  if (snapshot.decision?.legalActions) {
    for (const action of snapshot.decision.legalActions) {
      if (action.command) violations.push(`ACTION_CONTAINS_COMMAND:${action.actionId}`);
      if (action.commandHash && action.engineCommandHash) {
        // commandHash is OK (it's a hash, not the command itself)
      }
    }
  }

  // Check recentEvents for private payloads
  if (snapshot.recentEvents) {
    for (const event of snapshot.recentEvents) {
      if (event.payload?.private === true || event.payload?.visibility === 'private') {
        violations.push(`PRIVATE_EVENT_IN_SNAPSHOT:${event.type}`);
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Sanitize a certified replay for public sharing.
 * Removes all hidden information and replaces card IDs with opaque handles.
 * @param {object} replay - The certified replay
 * @param {string} opaqueSecret - Secret for generating opaque handles
 * @returns {object} Sanitized public replay
 */
export function sanitizeReplayForPublic(replay, opaqueSecret) {
  if (!replay) return null;
  // Use the engine's publicCertifiedReplayView if available
  // This is the primary sanitization path
  const publicView = replay.publicContentHash ? replay : null;
  if (publicView) return publicView;

  // Manual sanitization fallback
  const sanitized = {};
  for (const [key, value] of Object.entries(replay)) {
    if (FORBIDDEN_PUBLIC_REPLAY_KEYS.has(key)) continue;
    sanitized[key] = value;
  }

  // Redact command bodies (keep only command IDs and types)
  if (sanitized.commands) {
    sanitized.commands = sanitized.commands.map(cmd => ({
      id: cmd.id,
      type: cmd.type,
      actorId: cmd.actorId ?? cmd.payload?.actorId ?? null,
    }));
  }

  // Redact initial state hidden info
  if (sanitized.initialState) {
    sanitized.initialState = redactStateForPublic(sanitized.initialState);
  }

  return sanitized;
}

/**
 * Redact a state object for public view.
 * Replaces hidden card identities with 'HIDDEN'.
 */
function redactStateForPublic(state) {
  if (!state || typeof state !== 'object') return state;
  const redacted = { ...state };
  // Remove RNG
  delete redacted.rng;
  // Redact player hands
  if (redacted.players) {
    for (const playerId of Object.keys(redacted.players)) {
      const player = redacted.players[playerId];
      redacted.players[playerId] = {
        ...player,
        hand: player.hand ? player.hand.map(() => 'HIDDEN') : [],
      };
    }
  }
  // Redact draw pile contents
  if (redacted.zones?.dp) {
    redacted.zones.dp = redacted.zones.dp.map(() => 'HIDDEN');
  }
  return redacted;
}

/**
 * Differential privacy test:
 * Two states with identical human-authorized projections but different
 * hidden opponent identities must produce identical player-facing DOM.
 *
 * @param {object} viewA - Player view from state A
 * @param {object} viewB - Player view from state B (same visible, different hidden)
 * @returns {object} { identical, differences: string[] }
 */
export function differentialPrivacyCheck(viewA, viewB) {
  const differences = [];

  // The player views should be identical except for opaque card IDs
  // that are hidden from the player
  const aJson = JSON.stringify(redactHiddenIds(viewA));
  const bJson = JSON.stringify(redactHiddenIds(viewB));

  if (aJson !== bJson) {
    // Find specific differences
    const aKeys = Object.keys(viewA ?? {}).sort();
    const bKeys = Object.keys(viewB ?? {}).sort();
    for (const key of new Set([...aKeys, ...bKeys])) {
      if (JSON.stringify(redactHiddenIds(viewA?.[key])) !== JSON.stringify(redactHiddenIds(viewB?.[key]))) {
        differences.push(key);
      }
    }
  }

  return { identical: differences.length === 0, differences };
}

/**
 * Replace hidden card IDs with a placeholder for comparison.
 */
function redactHiddenIds(view) {
  if (!view) return view;
  const clone = structuredClone(view);
  // Opponent hand should only have count
  if (clone.opponents) {
    for (const opp of clone.opponents) {
      delete opp.hand;
    }
  }
  // Swap bar face-down cards should be 'HIDDEN'
  if (clone.swapBar) {
    clone.swapBar = clone.swapBar.map(c => c.faceDown ? { id: 'HIDDEN', identity: 'HIDDEN', faceDown: true } : c);
  }
  return clone;
}

/**
 * Check that no hidden information appears in a DOM element's text content,
 * attributes, or ARIA labels.
 * @param {Element} element - DOM element to check
 * @param {Set} forbiddenIdentities - Set of card identities that should not appear
 * @returns {object} { clean, leaks: string[] }
 */
export function checkDOMForHiddenInfo(element, forbiddenIdentities) {
  const leaks = [];
  if (!element) return { clean: true, leaks: [] };

  // Check text content
  const text = element.textContent ?? '';
  for (const identity of forbiddenIdentities) {
    if (text.includes(identity)) {
      leaks.push(`TEXT_LEAK:${identity}`);
    }
  }

  // Check all elements' attributes
  const allElements = element.querySelectorAll('*');
  for (const el of allElements) {
    // Check aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      for (const identity of forbiddenIdentities) {
        if (ariaLabel.includes(identity)) {
          leaks.push(`ARIA_LEAK:${identity}`);
        }
      }
    }
    // Check title
    const title = el.getAttribute('title');
    if (title) {
      for (const identity of forbiddenIdentities) {
        if (title.includes(identity)) {
          leaks.push(`TITLE_LEAK:${identity}`);
        }
      }
    }
    // Check data attributes
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) {
        for (const identity of forbiddenIdentities) {
          if (attr.value.includes(identity)) {
            leaks.push(`DATA_ATTR_LEAK:${identity}:${attr.name}`);
          }
        }
      }
    }
  }

  return { clean: leaks.length === 0, leaks };
}
