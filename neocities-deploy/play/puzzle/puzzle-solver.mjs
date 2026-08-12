// puzzle-solver.mjs - Bounded canonical legal-action search for Puzzle Mode.
//
// Every node is a real canonical state. Every edge is a real canonical legal
// action executed through IntrilexEngine.execute. The solver NEVER bypasses
// legality or duplicates rules logic.
//
// Proof semantics:
//   PROVEN_WIN      - perspective can force the objective regardless of opponent
//   PROVEN_FAILURE  - opponent can force failure (no line satisfies objective)
//   BEST_FOUND      - a satisfying line was found but optimality not proven
//                     (search was truncated by a limit)
//   LIMIT_REACHED   - no satisfying line found and search was truncated
//   INVALID         - puzzle/state invalid
//   ERROR           - engine error during search
//
// We never claim optimality unless the search actually proves it under the
// configured model. A line found under incomplete search is BEST_FOUND, not
// "the optimal line."

import {
  IntrilexEngine,
  advanceCoreToDecision,
} from '../../engine/browser-entry.js';
import {
  PuzzleObjectiveType,
  PuzzleSolverStatus,
} from './puzzle-types.mjs';
import { stateFingerprint } from './puzzle-runtime.mjs';

/**
 * @typedef {Object} SolverLimits
 * @property {number} [maxDepth] - Max plies (half-turns) to search.
 * @property {number} [maxNodes] - Max total nodes to expand.
 * @property {number} [timeoutMs] - Wall-clock budget (best-effort; tests prefer node limits).
 * @property {number} [maxBranchingPerNode] - Cap actions considered per node (lexical first N).
 */

/** @type {Required<SolverLimits>} */
const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 12,
  maxNodes: 20000,
  timeoutMs: 4000,
  maxBranchingPerNode: 24,
});

/**
 * Advance a cloned state to the next decision boundary, returning the legal
 * action frame. Mirrors PuzzleRuntime._advance but pure (no shared state).
 * @param {any} state
 * @returns {{status:string, state:any, frame:any|null, reasonCode?:string}}
 */
function advanceToDecisionPure(state) {
  let cur = state;
  let safety = 0;
  while (safety++ < 64) {
    const result = advanceCoreToDecision(cur);
    cur = result.state;
    if (result.status === 'TERMINAL') return { status: 'TERMINAL', state: cur, frame: null, reasonCode: result.reasonCode };
    if (result.status === 'UNSUPPORTED_CONFIGURATION') return { status: 'UNSUPPORTED', state: cur, frame: null, reasonCode: result.reasonCode };
    if (result.status === 'PLAYER_DECISION_REQUIRED') return { status: 'DECISION', state: cur, frame: result.legalActionFrame };
  }
  return { status: 'UNSUPPORTED', state: cur, frame: null, reasonCode: 'ORCH_LIMIT' };
}

/**
 * Evaluate the objective at a node (terminal or decision boundary).
 * @returns {{success:boolean, failure:boolean, reason?:string, terminal:boolean}}
 */
function evaluateObjective(state, def, startTurn, terminal, reasonCode) {
  const perspective = def.perspectivePlayerId;
  const winner = state.winner;
  const obj = def.objective;
  const currentTurn = state.fullTurnSequence;
  if (winner === perspective) return { success: true, failure: false, terminal: true };
  if (terminal) {
    if (winner === null && reasonCode === 'CANONICAL_DRAW' && obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
      return { success: true, failure: false, terminal: true };
    }
    if (winner === null && obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
      return { success: true, failure: false, terminal: true };
    }
    return { success: false, failure: true, reason: winner ? `OPPONENT_WIN:${winner}` : reasonCode ?? 'TERMINAL', terminal: true };
  }
  if (winner !== null && winner !== perspective) {
    return { success: false, failure: true, reason: `OPPONENT_WIN:${winner}`, terminal: false };
  }
  if (obj.type === PuzzleObjectiveType.WIN_THIS_TURN) {
    if (currentTurn > startTurn) return { success: false, failure: true, reason: 'TURN_ADVANCED', terminal: false };
    return { success: false, failure: false, terminal: false };
  }
  if (obj.type === PuzzleObjectiveType.WIN_WITHIN_TURNS) {
    if (currentTurn - startTurn > obj.maxTurns) return { success: false, failure: true, reason: 'HORIZON_EXCEEDED', terminal: false };
    return { success: false, failure: false, terminal: false };
  }
  if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
    if (currentTurn - startTurn >= obj.turns) return { success: true, failure: false, terminal: false };
    return { success: false, failure: false, terminal: false };
  }
  return { success: false, failure: false, terminal: false };
}

/**
 * Analyze a puzzle with bounded legal-action search.
 *
 * @param {import('./puzzle-types.mjs').PuzzleDefinition} def
 * @param {any} initialState - Reconstructed canonical state (will be cloned).
 * @param {SolverLimits} [limits]
 * @returns {import('./puzzle-types.mjs').PuzzleSolution & {reason?:string, elapsedMs:number}}
 */
export function analyzePuzzle(def, initialState, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const startTurn = initialState.fullTurnSequence;
  const engine = new IntrilexEngine();
  const startedAt = Date.now();
  /** @type {Set<string>} */
  const visited = new Set();
  let nodesExplored = 0;
  let truncated = false;
  let bestLine = null; // discovered satisfying action sequence (commands)
  let maxDepthReached = 0;

  /**
   * Recursive search. Returns 'WIN' if perspective can force success,
   * 'LOSS' if opponent can force failure, 'UNKNOWN' if truncated.
   * @param {any} state
   * @param {number} depth
   * @param {object[]} line - commands leading to this node
   * @param {boolean} perspectiveToMove
   */
  function search(state, depth, line, perspectiveToMove) {
    if (nodesExplored >= L.maxNodes) { truncated = true; return 'UNKNOWN'; }
    if (Date.now() - startedAt > L.timeoutMs) { truncated = true; return 'UNKNOWN'; }
    if (depth > L.maxDepth) { truncated = true; return 'UNKNOWN'; }
    if (depth > maxDepthReached) maxDepthReached = depth;
    nodesExplored++;

    const fp = stateFingerprint(state);
    if (visited.has(fp)) return 'UNKNOWN'; // transposition: don't re-expand
    visited.add(fp);

    const adv = advanceToDecisionPure(state);
    if (adv.status === 'UNSUPPORTED') { truncated = true; return 'UNKNOWN'; }

    const evalRes = evaluateObjective(adv.state, def, startTurn, adv.status === 'TERMINAL', adv.reasonCode);
    if (evalRes.success) {
      if (!bestLine) bestLine = [...line];
      return 'WIN';
    }
    if (evalRes.failure) return 'LOSS';
    if (adv.status === 'TERMINAL') return 'LOSS'; // terminal without success/failure => loss

    // Decision node: expand legal actions.
    const actions = adv.frame.actions;
    const cap = Math.min(actions.length, L.maxBranchingPerNode);
    // Lexical ordering for determinism.
    const ordered = [...actions].slice(0, actions.length).sort((a, b) => a.actionId.localeCompare(b.actionId)).slice(0, cap);

    if (perspectiveToMove) {
      // Perspective maximizes: any move leading to WIN is a win.
      let anyNonLoss = false;
      for (const action of ordered) {
        const result = engine.execute(adv.state, action.command);
        if (!result.accepted) continue; // skip rejected (shouldn't happen for legal)
        const r = search(result.state, depth + 1, [...line, action.command], !perspectiveToMove);
        if (r === 'WIN') {
          if (!bestLine) bestLine = [...line, action.command];
          return 'WIN';
        }
        if (r === 'UNKNOWN') anyNonLoss = true;
      }
      if (anyNonLoss) return 'UNKNOWN';
      return 'LOSS';
    } else {
      // Opponent minimizes: ALL moves must lead to WIN for perspective to win.
      let anyUnknown = false;
      for (const action of ordered) {
        const result = engine.execute(adv.state, action.command);
        if (!result.accepted) continue;
        const r = search(result.state, depth + 1, [...line, action.command], !perspectiveToMove);
        if (r === 'LOSS') return 'LOSS';
        if (r === 'UNKNOWN') anyUnknown = true;
      }
      if (anyUnknown) return 'UNKNOWN';
      return 'WIN';
    }
  }

  const rootPerspective = initialState.activePlayerId === def.perspectivePlayerId;
  let rootResult;
  try {
    rootResult = search(initialState, 0, [], rootPerspective);
  } catch (e) {
    return {
      actions: [],
      proven: false,
      nodesExplored,
      depth: maxDepthReached,
      status: PuzzleSolverStatus.ERROR,
      reason: e.message,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const elapsedMs = Date.now() - startedAt;
  if (rootResult === 'WIN' && !truncated) {
    return { actions: bestLine ?? [], proven: true, nodesExplored, depth: maxDepthReached, status: PuzzleSolverStatus.PROVEN_WIN, elapsedMs };
  }
  if (rootResult === 'WIN' && truncated) {
    return { actions: bestLine ?? [], proven: false, nodesExplored, depth: maxDepthReached, status: PuzzleSolverStatus.BEST_FOUND, elapsedMs };
  }
  if (rootResult === 'LOSS' && !truncated) {
    return { actions: [], proven: true, nodesExplored, depth: maxDepthReached, status: PuzzleSolverStatus.PROVEN_FAILURE, elapsedMs };
  }
  if (bestLine) {
    return { actions: bestLine, proven: false, nodesExplored, depth: maxDepthReached, status: PuzzleSolverStatus.BEST_FOUND, elapsedMs };
  }
  return { actions: [], proven: false, nodesExplored, depth: maxDepthReached, status: PuzzleSolverStatus.LIMIT_REACHED, elapsedMs };
}

/**
 * Enumerate the canonical legal actions at a state (for diagnostics).
 * @param {any} state
 * @returns {{actions: any[], status:string}}
 */
export function enumerateLegalActionsAt(state) {
  const adv = advanceToDecisionPure(state);
  return { actions: adv.frame?.actions ?? [], status: adv.status };
}

export { DEFAULT_LIMITS };
