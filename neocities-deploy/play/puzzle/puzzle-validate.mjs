// puzzle-validate.mjs - Structured validation for PuzzleDefinition and the
// reconstructed canonical state.
//
// Validation is fail-closed: an invalid puzzle MUST NOT load. Issues are
// returned as structured {code,severity,message,path} records so the UI can
// render diagnostics. We never silently "repair" a corrupted puzzle.
//
// The canonical engine does not expose a public standalone state validator
// (runtime/autonomy-engine-dist/src/validation.js exists but is internal and
// checks a stale rulesVersion). We therefore implement a focused structural
// invariant check over the public state fields, reusing the public
// deriveSecuredPoints primitive where applicable.

import { deriveSecuredPoints } from '../../engine/browser-entry.js';
import {
  PUZZLE_SCHEMA_VERSION,
  OBJECTIVE_TYPES,
  OPPONENT_POLICY_KINDS,
  PuzzleObjectiveType,
} from './puzzle-types.mjs';

/**
 * Validate a PuzzleDefinition structurally (without reconstructing state).
 * @param {any} def
 * @returns {{valid:boolean, issues: import('./puzzle-types.mjs').PuzzleValidationIssue[]}}
 */
export function validateDefinition(def) {
  /** @type {import('./puzzle-types.mjs').PuzzleValidationIssue[]} */
  const issues = [];
  const err = (code, message, path) => issues.push({ code, severity: 'error', message, path });

  if (def === null || typeof def !== 'object') {
    err('NOT_OBJECT', 'Puzzle definition must be an object');
    return { valid: false, issues };
  }
  if (def.schemaVersion !== PUZZLE_SCHEMA_VERSION) {
    err('SCHEMA_VERSION', `schemaVersion must equal ${PUZZLE_SCHEMA_VERSION}, got ${String(def.schemaVersion)}`, 'schemaVersion');
  }
  if (typeof def.id !== 'string' || def.id.length === 0) {
    err('ID_MISSING', 'id must be a non-empty string', 'id');
  }
  if (typeof def.title !== 'string' || def.title.length === 0) {
    err('TITLE_MISSING', 'title must be a non-empty string', 'title');
  }
  if (typeof def.profileId !== 'string' || def.profileId.length === 0) {
    err('PROFILE_MISSING', 'profileId must be a non-empty string', 'profileId');
  }
  if (!Number.isInteger(def.seed) || def.seed <= 0) {
    err('SEED_INVALID', 'seed must be a positive integer', 'seed');
  }
  if (!Array.isArray(def.setupCommands)) {
    err('SETUP_COMMANDS_NOT_ARRAY', 'setupCommands must be an array of canonical commands', 'setupCommands');
  } else {
    for (let i = 0; i < def.setupCommands.length; i++) {
      const cmd = def.setupCommands[i];
      // Canonical commands have shape {id, type, actorId, action:{kind}} OR
      // {kind, ...} (orchestration-style). Accept either canonical form.
      const hasType = typeof cmd.type === 'string' && cmd.type.length > 0;
      const hasKind = typeof cmd.kind === 'string' && cmd.kind.length > 0;
      const hasActionKind = cmd && typeof cmd.action === 'object' && typeof cmd.action?.kind === 'string';
      if (cmd === null || typeof cmd !== 'object' || typeof cmd.actorId !== 'string' || !(hasType || hasKind || hasActionKind)) {
        err('SETUP_COMMAND_MALFORMED', `setupCommands[${i}] must be a canonical command object with actorId and a type/kind`, `setupCommands[${i}]`);
      }
    }
  }
  if (def.perspectivePlayerId !== 'P1' && def.perspectivePlayerId !== 'P2') {
    err('PERSPECTIVE_INVALID', 'perspectivePlayerId must be "P1" or "P2"', 'perspectivePlayerId');
  }
  const obj = def.objective;
  if (obj === null || typeof obj !== 'object' || typeof obj.type !== 'string' || !OBJECTIVE_TYPES.has(obj.type)) {
    err('OBJECTIVE_TYPE', `objective.type must be one of ${[...OBJECTIVE_TYPES].join(', ')}`, 'objective.type');
  } else {
    if (obj.type === PuzzleObjectiveType.WIN_WITHIN_TURNS) {
      if (!Number.isInteger(obj.maxTurns) || obj.maxTurns < 1) {
        err('OBJECTIVE_HORIZON', 'WIN_WITHIN_TURNS requires maxTurns >= 1', 'objective.maxTurns');
      }
    }
    if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
      if (!Number.isInteger(obj.turns) || obj.turns < 1) {
        err('OBJECTIVE_HORIZON', 'SURVIVE_TURNS requires turns >= 1', 'objective.turns');
      }
    }
  }
  const pol = def.opponentPolicy;
  if (pol !== undefined && pol !== null) {
    if (typeof pol !== 'object' || typeof pol.kind !== 'string' || !OPPONENT_POLICY_KINDS.has(pol.kind)) {
      err('OPPONENT_POLICY_KIND', `opponentPolicy.kind must be one of ${[...OPPONENT_POLICY_KINDS].join(', ')}`, 'opponentPolicy.kind');
    } else if (pol.kind === 'ai' && (typeof pol.aiPolicyId !== 'string' || pol.aiPolicyId.length === 0)) {
      err('OPPONENT_POLICY_AI', 'opponentPolicy.kind="ai" requires aiPolicyId', 'opponentPolicy.aiPolicyId');
    } else if (pol.kind === 'scripted' && !Array.isArray(pol.scriptedActionIds)) {
      err('OPPONENT_POLICY_SCRIPTED', 'opponentPolicy.kind="scripted" requires scriptedActionIds array', 'opponentPolicy.scriptedActionIds');
    }
  }
  if (def.metadata !== undefined && def.metadata !== null) {
    if (typeof def.metadata !== 'object') {
      err('METADATA_NOT_OBJECT', 'metadata must be an object', 'metadata');
    } else if (def.metadata.tags !== undefined && !Array.isArray(def.metadata.tags)) {
      err('METADATA_TAGS', 'metadata.tags must be an array', 'metadata.tags');
    }
  }
  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

const VALID_PHASES = new Set(['Start', 'Action', 'End']);

/**
 * Validate a reconstructed canonical state against puzzle invariants.
 * @param {any} state - Reconstructed engine state.
 * @param {import('./puzzle-types.mjs').PuzzleDefinition} def
 * @returns {{valid:boolean, issues: import('./puzzle-types.mjs').PuzzleValidationIssue[]}}
 */
export function validateReconstructedState(state, def) {
  /** @type {import('./puzzle-types.mjs').PuzzleValidationIssue[]} */
  const issues = [];
  const err = (code, message, path) => issues.push({ code, severity: 'error', message, path });
  const warn = (code, message, path) => issues.push({ code, severity: 'warning', message, path });

  if (state === null || typeof state !== 'object') {
    err('STATE_NOT_OBJECT', 'Reconstructed state must be an object');
    return { valid: false, issues };
  }
  if (typeof state.schemaVersion !== 'number') {
    err('STATE_SCHEMA', 'state.schemaVersion missing', 'schemaVersion');
  }
  if (typeof state.rulesVersion !== 'string') {
    warn('STATE_RULES_VERSION', 'state.rulesVersion missing', 'rulesVersion');
  }
  if (!state.players || typeof state.players !== 'object') {
    err('STATE_NO_PLAYERS', 'state.players missing', 'players');
    return { valid: false, issues };
  }
  const playerIds = Object.keys(state.players);
  if (playerIds.length < 2) {
    err('STATE_TOO_FEW_PLAYERS', 'state must have at least 2 players', 'players');
  }
  for (const pid of playerIds) {
    const p = state.players[pid];
    if (!p || p.id !== pid) {
      err('STATE_PLAYER_IDENTITY', `players.${pid}.id must equal "${pid}"`, `players.${pid}.id`);
    }
    if (!Array.isArray(p.hand) || !Array.isArray(p.pr) || !Array.isArray(p.er)) {
      err('STATE_PLAYER_ZONES', `players.${pid} must have hand/pr/er arrays`, `players.${pid}`);
    }
  }
  if (!state.players[def.perspectivePlayerId]) {
    err('STATE_PERSPECTIVE_MISSING', `perspectivePlayerId "${def.perspectivePlayerId}" not in state.players`, 'perspectivePlayerId');
  }
  if (typeof state.activePlayerId !== 'string' || !state.players[state.activePlayerId]) {
    err('STATE_ACTIVE_PLAYER', 'activePlayerId must reference an existing player', 'activePlayerId');
  }
  if (typeof state.phase !== 'string' || !VALID_PHASES.has(state.phase)) {
    err('STATE_PHASE', `phase must be one of ${[...VALID_PHASES].join(', ')}, got ${String(state.phase)}`, 'phase');
  }
  if (!Array.isArray(state.turnOrder) || state.turnOrder.length < 2) {
    err('STATE_TURN_ORDER', 'turnOrder must list at least 2 players', 'turnOrder');
  } else {
    if (new Set(state.turnOrder).size !== state.turnOrder.length) {
      err('STATE_TURN_ORDER_DUPLICATES', 'turnOrder contains duplicates', 'turnOrder');
    }
    for (const pid of state.turnOrder) {
      if (!state.players[pid]) err('STATE_TURN_ORDER_PLAYER', `turnOrder references unknown player ${pid}`, 'turnOrder');
    }
  }
  if (state.zones === null || typeof state.zones !== 'object') {
    err('STATE_ZONES', 'state.zones missing', 'zones');
  } else {
    for (const z of ['dp', 'exile', 'gy', 'staging', 'swapBar']) {
      if (!Array.isArray(state.zones[z])) {
        err('STATE_ZONE_MISSING', `zones.${z} must be an array`, `zones.${z}`);
      }
    }
  }
  if (state.cards === null || typeof state.cards !== 'object') {
    err('STATE_CARDS', 'state.cards missing', 'cards');
  } else {
    // Cross-check player/zone card references exist in cards map.
    const seen = new Set();
    const check = (cardId, loc) => {
      if (typeof cardId !== 'string') {
        err('STATE_CARD_ID_TYPE', `${loc}: card id must be a string, got ${typeof cardId}`, loc);
        return;
      }
      if (!state.cards[cardId]) {
        err('STATE_CARD_MISSING', `${loc}: references nonexistent card ${cardId}`, loc);
        return;
      }
      if (seen.has(cardId)) {
        err('STATE_CARD_DUPLICATE', `${loc}: card ${cardId} appears in multiple zones (duplicate identity)`, loc);
      }
      seen.add(cardId);
    };
    for (const pid of playerIds) {
      for (const z of ['hand', 'pr', 'er']) for (const id of state.players[pid][z]) check(id, `players.${pid}.${z}`);
    }
    if (state.zones) {
      for (const z of Object.keys(state.zones)) for (const id of state.zones[z]) check(id, `zones.${z}`);
    }
  }
  if (!Array.isArray(state.stack)) {
    warn('STATE_STACK', 'state.stack missing or not an array', 'stack');
  }
  if (state.winner !== null && state.winner !== undefined) {
    // Game already irreversibly over — only compatible with no objective that
    // requires future play. All v0.1.0 objectives require ongoing play.
    err('STATE_ALREADY_TERMINAL', `state.winner is set (${state.winner}); puzzle objectives require ongoing play`, 'winner');
  }
  // Objective horizon sanity against turn counter.
  const turn = Number(state.fullTurnSequence ?? 0);
  if (!Number.isInteger(turn) || turn < 1) {
    err('STATE_TURN_COUNTER', 'fullTurnSequence must be a positive integer', 'fullTurnSequence');
  }
  // Secured points should be derivable without throwing for the perspective player.
  if (state.players[def.perspectivePlayerId]) {
    try {
      deriveSecuredPoints(state, def.perspectivePlayerId);
    } catch (e) {
      err('STATE_SECURED_POINTS', `deriveSecuredPoints threw for ${def.perspectivePlayerId}: ${e.message}`, 'players');
    }
  }
  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

/**
 * Combined validation: definition + reconstructed state.
 * @param {import('./puzzle-types.mjs').PuzzleDefinition} def
 * @param {any} state - Reconstructed canonical state.
 * @returns {{valid:boolean, issues: import('./puzzle-types.mjs').PuzzleValidationIssue[]}}
 */
export function validatePuzzle(def, state) {
  const d = validateDefinition(def);
  const s = state !== undefined ? validateReconstructedState(state, def) : { valid: true, issues: [] };
  return { valid: d.valid && s.valid, issues: [...d.issues, ...s.issues] };
}
