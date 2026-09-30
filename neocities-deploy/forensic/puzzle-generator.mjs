// ═══════════════════════════════════════════════════════════════
// puzzle-generator.mjs — Replay-derived puzzle generation
//
// Derives puzzle definitions from bookmarked replay positions.
// Uses the certified replay's initialState + command prefix to
// reconstruct the game state at a specific frame, then creates a
// PuzzleDefinition compatible with the existing puzzle system.
//
// All functions are pure: they take plain data and return plain data.
// The caller is responsible for engine execution (frame reconstruction).
//
// Puzzle types generated:
//   - WIN_THIS_TURN: When the active player can potentially win this turn
//   - WIN_WITHIN_TURNS: When the active player is close to winning
//   - SURVIVE_TURNS: When the active player is under pressure
// ═══════════════════════════════════════════════════════════════

import { PUZZLE_SCHEMA_VERSION, PuzzleObjectiveType, PuzzleOpponentPolicyKind } from '../play/puzzle/puzzle-types.mjs';
import { generateId } from './forensic-model.mjs';

/**
 * Derive a puzzle definition from a replay position.
 *
 * @param {object} opts
 * @param {object} opts.certifiedReplay - Certified replay envelope
 * @param {number} opts.frameIndex - Frame to derive puzzle from (1-based, since frame 0 is initial state)
 * @param {string} opts.perspectivePlayerId - Player whose objective is evaluated
 * @param {string} [opts.title] - Puzzle title
 * @param {string} [opts.description] - Puzzle description
 * @param {string} [opts.objectiveType] - One of PuzzleObjectiveType
 * @param {number} [opts.maxTurns] - For WIN_WITHIN_TURNS
 * @param {number} [opts.surviveTurns] - For SURVIVE_TURNS
 * @param {string} [opts.opponentPolicyKind] - One of PuzzleOpponentPolicyKind
 * @param {string} [opts.aiPolicyId] - AI policy ID for kind='ai'
 * @returns {object} PuzzleDefinition
 */
export function derivePuzzleFromReplay(opts) {
  const {
    certifiedReplay,
    frameIndex,
    perspectivePlayerId,
    title,
    description,
    objectiveType = PuzzleObjectiveType.WIN_THIS_TURN,
    maxTurns = 3,
    surviveTurns = 3,
    opponentPolicyKind = PuzzleOpponentPolicyKind.FIRST_LEGAL,
    aiPolicyId = 'random-legal',
  } = opts;

  if (!certifiedReplay || !certifiedReplay.initialState || !Array.isArray(certifiedReplay.commands)) {
    throw new Error('PUZZLE_GEN_INVALID_REPLAY');
  }
  if (typeof frameIndex !== 'number' || frameIndex < 1) {
    throw new Error('PUZZLE_GEN_INVALID_FRAME_INDEX');
  }
  if (!perspectivePlayerId) {
    throw new Error('PUZZLE_GEN_INVALID_PERSPECTIVE');
  }

  // The setup commands are the prefix of commands up to (but not including)
  // the frame's command. Frame N corresponds to commands[0..N-1].
  const setupCommands = certifiedReplay.commands.slice(0, frameIndex);

  // Build objective from type
  const objective = buildObjective(objectiveType, maxTurns, surviveTurns);

  // Build opponent policy
  const opponentPolicy = buildOpponentPolicy(opponentPolicyKind, aiPolicyId);

  // Derive puzzle ID from replay identity and frame
  const replayId = certifiedReplay.fixtureId ?? certifiedReplay.matchId ?? 'unknown';
  const puzzleId = `IXP-REPLAY-${replayId}-F${frameIndex}`;

  return {
    schemaVersion: PUZZLE_SCHEMA_VERSION,
    id: puzzleId,
    title: title || `Replay Puzzle: Frame ${frameIndex}`,
    description: description || `Derived from replay ${replayId} at frame ${frameIndex}. Find the winning line.`,
    profileId: certifiedReplay.profileId ?? 'first-contact-trigger-closure',
    seed: certifiedReplay.seed ?? 0,
    setupCommands,
    perspectivePlayerId,
    objective,
    opponentPolicy,
    metadata: {
      source: 'match',
      tags: ['replay-derived', `frame-${frameIndex}`],
      notes: `Auto-generated from replay ${replayId} at frame ${frameIndex}`,
    },
  };
}

/**
 * Build an objective object from type and parameters.
 */
function buildObjective(type, maxTurns, surviveTurns) {
  switch (type) {
    case PuzzleObjectiveType.WIN_THIS_TURN:
      return { type: PuzzleObjectiveType.WIN_THIS_TURN };
    case PuzzleObjectiveType.WIN_WITHIN_TURNS:
      return { type: PuzzleObjectiveType.WIN_WITHIN_TURNS, maxTurns };
    case PuzzleObjectiveType.SURVIVE_TURNS:
      return { type: PuzzleObjectiveType.SURVIVE_TURNS, turns: surviveTurns };
    default:
      return { type: PuzzleObjectiveType.WIN_THIS_TURN };
  }
}

/**
 * Build an opponent policy object.
 */
function buildOpponentPolicy(kind, aiPolicyId) {
  switch (kind) {
    case PuzzleOpponentPolicyKind.AI:
      return { kind, aiPolicyId };
    case PuzzleOpponentPolicyKind.SCRIPTED:
      return { kind, scriptedActionIds: [] };
    case PuzzleOpponentPolicyKind.HUMAN_DEBUG:
      return { kind };
    case PuzzleOpponentPolicyKind.FIRST_LEGAL:
    default:
      return { kind: PuzzleOpponentPolicyKind.FIRST_LEGAL };
  }
}

/**
 * Suggest an objective type based on the game state at a frame.
 *
 * This is a heuristic: if the active player is close to their goal,
 * suggest WIN_THIS_TURN or WIN_WITHIN_TURNS. If the opponent is close,
 * suggest SURVIVE_TURNS. Otherwise, default to WIN_WITHIN_TURNS.
 *
 * @param {object} frameState - Engine state at the frame
 * @param {string} perspectivePlayerId - Player whose perspective to evaluate
 * @returns {string} One of PuzzleObjectiveType
 */
export function suggestObjectiveType(frameState, perspectivePlayerId) {
  if (!frameState || !frameState.players) {
    return PuzzleObjectiveType.WIN_WITHIN_TURNS;
  }

  const player = frameState.players[perspectivePlayerId];
  if (!player) return PuzzleObjectiveType.WIN_WITHIN_TURNS;

  const playerScore = player.securedPoints ?? 0;
  const playerGoal = player.goal ?? 21;
  const scoreNeeded = playerGoal - playerScore;

  // Find opponent
  const opponentId = Object.keys(frameState.players).find(id => id !== perspectivePlayerId);
  const opponent = opponentId ? frameState.players[opponentId] : null;
  const opponentScore = opponent?.securedPoints ?? 0;
  const opponentGoal = opponent?.goal ?? 21;
  const opponentNeeds = opponentGoal - opponentScore;

  // If player can win this turn (score needed <= max single-card value)
  if (scoreNeeded <= 11) {
    return PuzzleObjectiveType.WIN_THIS_TURN;
  }

  // If opponent is very close to winning, survival puzzle
  if (opponentNeeds <= 5) {
    return PuzzleObjectiveType.SURVIVE_TURNS;
  }

  // Default: win within a few turns
  return PuzzleObjectiveType.WIN_WITHIN_TURNS;
}

/**
 * Batch-generate puzzles from multiple replay positions.
 *
 * @param {object} certifiedReplay
 * @param {number[]} frameIndices
 * @param {string} perspectivePlayerId
 * @returns {object[]} Array of PuzzleDefinitions
 */
export function derivePuzzlesFromFrames(certifiedReplay, frameIndices, perspectivePlayerId) {
  if (!Array.isArray(frameIndices)) return [];
  return frameIndices.map(frameIndex => {
    const objectiveType = suggestObjectiveType(
      // Note: caller should provide frameState for better suggestions.
      // Without it, we default to WIN_WITHIN_TURNS.
      null,
      perspectivePlayerId
    );
    return derivePuzzleFromReplay({
      certifiedReplay,
      frameIndex,
      perspectivePlayerId,
      objectiveType,
    });
  });
}
