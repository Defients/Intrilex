// puzzle-types.mjs - Puzzle Mode v0.1.0 domain model (JSDoc typedefs).
//
// A puzzle is a constrained canonical Intrilex game state plus an objective.
// The state is represented canonically as a deterministic recipe
// (profileId + seed + setupCommands) — the same representation the
// AuthoritativeMatchSession uses for snapshot reconstruction (see
// match-authority/src/authoritative-match-session.mjs toSnapshot(): "The
// engine state itself is NOT serialized — it is reconstructed deterministically
// from seed + command log on restore."). Puzzle Mode reuses that convention
// rather than hand-serializing a full engine state.
//
// No runtime behaviour is defined here — this module is pure type metadata.

export const PUZZLE_SCHEMA_VERSION = 1;

export const PuzzleObjectiveType = Object.freeze({
  WIN_THIS_TURN: 'WIN_THIS_TURN',
  WIN_WITHIN_TURNS: 'WIN_WITHIN_TURNS',
  SURVIVE_TURNS: 'SURVIVE_TURNS',
});

export const PuzzleOpponentPolicyKind = Object.freeze({
  FIRST_LEGAL: 'first-legal',
  AI: 'ai',
  SCRIPTED: 'scripted',
  HUMAN_DEBUG: 'human-debug',
});

export const PuzzleRuntimeStatus = Object.freeze({
  UNLOADED: 'UNLOADED',
  READY: 'READY',
  PLAYING: 'PLAYING',
  WON: 'WON',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
});

export const PuzzleResultKind = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  FAILURE: 'failure',
  ABANDONED: 'abandoned',
  ERROR: 'error',
});

export const PuzzleSolverStatus = Object.freeze({
  SOLVED: 'SOLVED',
  PROVEN_WIN: 'PROVEN_WIN',
  PROVEN_FAILURE: 'PROVEN_FAILURE',
  PARTIAL: 'PARTIAL',
  LIMIT_REACHED: 'LIMIT_REACHED',
  INVALID: 'INVALID',
  ERROR: 'ERROR',
});

/**
 * @typedef {Object} PuzzleObjective
 * @property {'WIN_THIS_TURN'} [type]
 * @property {'WIN_WITHIN_TURNS'} [type]
 * @property {number} [maxTurns]
 * @property {'SURVIVE_TURNS'} [type]
 * @property {number} [turns]
 */

/**
 * @typedef {Object} PuzzleOpponentPolicy
 * @property {string} kind - One of PuzzleOpponentPolicyKind
 * @property {string} [aiPolicyId] - For kind='ai' (e.g. 'random-legal')
 * @property {string[]} [scriptedActionIds] - For kind='scripted' (actionId sequence)
 */

/**
 * @typedef {Object} PuzzleMetadata
 * @property {string|number} [difficulty]
 * @property {'handcrafted'|'simulation'|'match'|'generated'} [source]
 * @property {string[]} [tags]
 * @property {string} [author]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} PuzzleDefinition
 * @property {number} schemaVersion - Must equal PUZZLE_SCHEMA_VERSION
 * @property {string} id - Stable logical puzzle id (e.g. "IXP-WINTURN-001")
 * @property {string} title
 * @property {string} [description]
 * @property {string} profileId - Canonical engine profile id
 * @property {number} seed - Deterministic match seed
 * @property {object[]} setupCommands - Canonical command replay prefix producing initialState
 * @property {string} perspectivePlayerId - Player whose objective is evaluated ("P1"|"P2")
 * @property {PuzzleObjective} objective
 * @property {PuzzleOpponentPolicy} [opponentPolicy] - Default first-legal
 * @property {PuzzleMetadata} [metadata]
 */

/**
 * @typedef {Object} PuzzleValidationIssue
 * @property {string} code
 * @property {'error'|'warning'} severity
 * @property {string} message
 * @property {string} [path]
 */

/**
 * @typedef {Object} PuzzleActionRecord
 * @property {number} index
 * @property {string} actorId
 * @property {string} source - 'human' | 'opponent' | 'orchestration'
 * @property {string} actionId
 * @property {object} command - Canonical command
 * @property {string} commandHash
 * @property {string} family
 * @property {string} [mode]
 * @property {number} stateRevisionBefore
 * @property {number} stateRevisionAfter
 * @property {number} fullTurnSequenceBefore
 * @property {number} fullTurnSequenceAfter
 */

/**
 * @typedef {Object} PuzzleAttempt
 * @property {string} puzzleId
 * @property {string} startedAt
 * @property {string} [completedAt]
 * @property {string} result - One of PuzzleResultKind
 * @property {PuzzleActionRecord[]} actions
 * @property {string} [finalStateHash]
 * @property {string} [failureReason]
 */

/**
 * @typedef {Object} PuzzleSolution
 * @property {object[]} actions - Canonical commands of the discovered line
 * @property {boolean} proven - True only if search proved optimality
 * @property {number} nodesExplored
 * @property {number} depth
 * @property {string} status - One of PuzzleSolverStatus
 * @property {number} [alternateSolutions]
 */

export const OBJECTIVE_TYPES = new Set(Object.values(PuzzleObjectiveType));
export const OPPONENT_POLICY_KINDS = new Set(Object.values(PuzzleOpponentPolicyKind));
