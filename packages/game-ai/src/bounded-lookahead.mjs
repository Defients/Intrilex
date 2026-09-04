// ═══════════════════════════════════════════════════════════════
// bounded-lookahead.mjs — Bounded lookahead search policy (pure, deterministic)
//
// Implements a fixed-budget minimax lookahead for the Intrilex card
// game AI. The search expands at most N nodes (configurable), enumerates
// opponent response sets in engine-legal order, and selects the action
// that maximises the searcher's evaluation after the opponent's best
// (minimising) response.
//
// Design pillars:
//   1. Fixed node budget   — search expands ≤ maxNodes states
//   2. Optional time budget — deadlineMs checked after each expansion
//                             (real-time only; deterministic mode uses
//                             node budget solely)
//   3. Opponent response   — all legal opponent actions enumerated in
//                             engine order; capped at maxOpponentResponses
//                             by taking the first N (NOT random sampling)
//   4. Injected evaluation — evaluationFn(state, searcherId) → number;
//                             the search module contains NO game-specific
//                             evaluation logic beyond a placeholder default
//   5. Deterministic       — no RNG, no score-sorting during expansion,
//                             engine-legal order throughout; same input
//                             always yields the same best action
//   6. Benchmark suite     — runLookaheadBenchmark reports nodes, time,
//                             best action, best score, budget flags;
//                             does NOT label the result "expert"
//   7. Policy integration  — createLookaheadPolicy returns a policy-sdk
//                             compatible definition with strengthTier
//                             'lookahead' (distinct from baseline/heuristic)
//
// This module is PURE: no I/O, no timers that depend on wall-clock time,
// no randomness. The same (state, config) pair always produces the same
// output. It is importable in Node without a browser environment.
//
// Exports:
//   - LOOKAHEAD_STRENGTH_TIER
//   - DEFAULT_LOOKAHEAD_CONFIG
//   - defaultEvaluation(state, searcherId)
//   - createBoundedLookahead(config)
//   - runLookaheadBenchmark(config)
//   - createLookaheadPolicy({ policyId, difficulty, configOverride })
// ═══════════════════════════════════════════════════════════════

import { createPolicyDefinition } from '@intrilex/policy-sdk';
import { hashCanonical } from '@intrilex/shared';

// ── Strength tier ──────────────────────────────────────────────

/**
 * The policy-strength tier for lookahead-based policies.
 * Distinct from 'baseline' and 'heuristic' — indicates that the
 * policy evaluates limited continuations rather than scoring only
 * the current state.
 *
 * @type {string}
 */
export const LOOKAHEAD_STRENGTH_TIER = 'lookahead';

// ── Default configuration ──────────────────────────────────────

/**
 * Default configuration for the bounded lookahead search.
 *
 * @typedef {object} LookaheadConfig
 * @property {number} maxNodes               - Maximum nodes (simulation states) to expand.
 * @property {number} maxDepth               - Search depth (1 = searcher only, 2 = searcher + opponent response).
 * @property {number} maxOpponentResponses   - Cap on opponent responses enumerated per candidate action.
 * @property {number|null} deadlineMs        - Optional wall-clock deadline (null = node-budget only).
 * @property {Function|null} evaluationFn    - Injected evaluation function; null = use defaultEvaluation.
 * @property {Function|null} simulateFn      - Injected simulation function: (state, command) → { state, accepted, error }.
 *                                             Required for depth ≥ 1 search; null in default config.
 * @property {Function|null} enumerateActionsFn - Injected action enumerator: (state) → { legalActions, resolveAction, status } | null.
 *                                                Required for depth ≥ 2 search; null in default config.
 */

/**
 * Frozen default configuration. Callers override fields as needed.
 * `simulateFn` and `enumerateActionsFn` are null by default — they
 * must be provided (via config or configOverride) for the search to
 * simulate actions and enumerate opponent responses.
 *
 * @type {Readonly<LookaheadConfig>}
 */
export const DEFAULT_LOOKAHEAD_CONFIG = Object.freeze({
  maxNodes: 200,
  maxDepth: 2,             // 2 = searcher + opponent response
  maxOpponentResponses: 30,
  deadlineMs: null,        // null = node-budget only (deterministic mode)
  evaluationFn: null,      // injected; null = use defaultEvaluation
  simulateFn: null,        // injected; (state, command) → { state, accepted, error }
  enumerateActionsFn: null // injected; (state) → { legalActions, resolveAction, status } | null
});

// ── Default evaluation (PLACEHOLDER) ───────────────────────────

/**
 * Placeholder evaluation function.
 *
 * Uses simple heuristics: secured-points difference, hand-size
 * advantage, and board presence (PR + ER card count). This is
 * intentionally crude — production callers should inject a
 * domain-specific evaluationFn via config.
 *
 * The evaluation is always from the searcher's perspective: a
 * positive score favours the searcher, a negative score favours
 * the opponent.
 *
 * @param {object} state     - Simulation state after an action sequence.
 * @param {string} [searcherId] - The searching player's ID. If omitted,
 *                                inferred from `state.activePlayerId`.
 * @returns {number} Numeric score (higher = better for searcher).
 */
export function defaultEvaluation(state, searcherId) {
  if (!state || typeof state !== 'object') return 0;
  const players = state.players ?? {};
  const turnOrder = state.turnOrder ?? [];
  if (turnOrder.length === 0) return 0;

  const resolvedSearcher = searcherId ?? state.activePlayerId ?? turnOrder[0];
  const searcher = players[resolvedSearcher];
  if (!searcher) return 0;

  // Secured points — primary signal
  const searcherScore = searcher.goal?.secured ?? searcher.securedPoints ?? 0;
  let opponentScore = 0;
  for (const id of turnOrder) {
    if (id === resolvedSearcher) continue;
    const opp = players[id];
    if (!opp) continue;
    opponentScore = Math.max(opponentScore, opp.goal?.secured ?? opp.securedPoints ?? 0);
  }
  const scoreDelta = searcherScore - opponentScore;

  // Hand-size advantage (more options = better)
  const searcherHand = Array.isArray(searcher.hand) ? searcher.hand.length : 0;
  let opponentHand = 0;
  for (const id of turnOrder) {
    if (id === resolvedSearcher) continue;
    const opp = players[id];
    if (!opp || !Array.isArray(opp.hand)) continue;
    opponentHand = Math.max(opponentHand, opp.hand.length);
  }
  const handDelta = searcherHand - opponentHand;

  // Board presence: PR (point row) + ER (effect row) card counts
  const searcherBoard =
    (Array.isArray(searcher.pr) ? searcher.pr.length : 0) +
    (Array.isArray(searcher.er) ? searcher.er.length : 0);
  let opponentBoard = 0;
  for (const id of turnOrder) {
    if (id === resolvedSearcher) continue;
    const opp = players[id];
    if (!opp) continue;
    const board =
      (Array.isArray(opp.pr) ? opp.pr.length : 0) +
      (Array.isArray(opp.er) ? opp.er.length : 0);
    opponentBoard = Math.max(opponentBoard, board);
  }
  const boardDelta = searcherBoard - opponentBoard;

  // Weighted combination (placeholder weights)
  return scoreDelta * 10 + handDelta * 1.5 + boardDelta * 2.0;
}

// ── Lookahead search ───────────────────────────────────────────

/**
 * Create a bounded lookahead search instance.
 *
 * The search is stateless across calls — each `search()` invocation
 * starts fresh. The config is merged with defaults and frozen.
 *
 * @param {Partial<LookaheadConfig>} [configOverride] - Optional config overrides.
 * @returns {LookaheadSearch} Search instance with a `search()` method.
 */
export function createBoundedLookahead(configOverride) {
  const config = Object.freeze({
    ...DEFAULT_LOOKAHEAD_CONFIG,
    ...configOverride
  });

  const evaluationFn = config.evaluationFn ?? defaultEvaluation;
  const simulateFn = config.simulateFn;
  const enumerateActionsFn = config.enumerateActionsFn;
  const maxNodes = config.maxNodes;
  const maxDepth = config.maxDepth;
  const maxOpponentResponses = config.maxOpponentResponses;
  const deadlineMs = config.deadlineMs;

  // Validate config
  if (!Number.isInteger(maxNodes) || maxNodes <= 0) {
    throw new Error(`bounded-lookahead: maxNodes must be a positive integer, got ${maxNodes}`);
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 2) {
    throw new Error(`bounded-lookahead: maxDepth must be 1 or 2, got ${maxDepth}`);
  }
  if (!Number.isInteger(maxOpponentResponses) || maxOpponentResponses <= 0) {
    throw new Error(`bounded-lookahead: maxOpponentResponses must be a positive integer, got ${maxOpponentResponses}`);
  }
  if (typeof evaluationFn !== 'function') {
    throw new Error('bounded-lookahead: evaluationFn must be a function');
  }

  /**
   * Simulate a single action on a state.
   * @param {object} state    - Current simulation state.
   * @param {*} command       - Engine command to execute.
   * @returns {{ state: object, accepted: boolean, error: * }}
   */
  function simulate(state, command) {
    if (typeof simulateFn !== 'function') {
      throw new Error('bounded-lookahead: simulateFn is required but was not provided in config');
    }
    return simulateFn(state, command);
  }

  /**
   * Enumerate legal actions for the active player in a state.
   * Returns null if no decision is required (e.g. terminal state).
   * @param {object} state - Simulation state.
   * @returns {{ legalActions: Array, resolveAction: Function, status: string } | null}
   */
  function enumerateActions(state) {
    if (typeof enumerateActionsFn !== 'function') {
      throw new Error('bounded-lookahead: enumerateActionsFn is required for depth ≥ 2 but was not provided in config');
    }
    return enumerateActionsFn(state);
  }

  /**
   * Evaluate a state from the searcher's perspective.
   * @param {object} state      - Simulation state.
   * @param {string} searcherId - The searching player's ID.
   * @returns {number}
   */
  function evaluate(state, searcherId) {
    return evaluationFn(state, searcherId);
  }

  /**
   * Check whether the deadline has been exceeded.
   * @param {number} startTime - Search start timestamp (ms).
   * @returns {boolean}
   */
  function deadlineExceeded(startTime) {
    if (deadlineMs === null || deadlineMs === undefined) return false;
    return (nowMs() - startTime) >= deadlineMs;
  }

  /**
   * Run the bounded lookahead search.
   *
   * @param {object} rootState       - Current simulation state.
   * @param {Array} legalActions     - Legal actions for the searching player (engine order).
   * @param {Function} resolveAction - Maps actionId → engine command.
   * @returns {{ bestAction: *, bestScore: number, nodesExpanded: number, depthReached: number, budgetExhausted: boolean, timeExceeded: boolean, deadlineMs: number|null }}
   */
  function search(rootState, legalActions, resolveAction) {
    if (!Array.isArray(legalActions) || legalActions.length === 0) {
      throw Object.assign(new Error('NO_LEGAL_ACTION'), { code: 'NO_LEGAL_ACTION' });
    }
    if (typeof resolveAction !== 'function') {
      throw new Error('bounded-lookahead: resolveAction must be a function');
    }

    const startTime = nowMs();
    const searcherId = rootState?.activePlayerId ?? rootState?.turnOrder?.[0] ?? null;
    let nodesExpanded = 0;
    let budgetExhausted = false;
    let timeExceeded = false;
    let depthReached = 0;

    // Track the best action and its minimax score.
    // Iterate in engine-legal order (no sorting during expansion).
    // Ties are broken by first-seen order (stable, deterministic).
    let bestAction = null;
    let bestScore = -Infinity;

    for (let i = 0; i < legalActions.length; i++) {
      const action = legalActions[i];

      // ── Simulate the searcher's action ──
      const command = resolveAction(action.actionId ?? action);
      const simResult = simulate(rootState, command);
      nodesExpanded++;
      depthReached = Math.max(depthReached, 1);

      if (!simResult.accepted) {
        // Engine rejected — skip this action (score = -Infinity)
        continue;
      }

      const afterSearcherState = simResult.state;

      // Check budget after each node expansion
      if (nodesExpanded >= maxNodes) {
        budgetExhausted = true;
        break;
      }
      if (deadlineExceeded(startTime)) {
        timeExceeded = true;
        break;
      }

      let actionScore;

      if (maxDepth >= 2) {
        // ── Enumerate opponent responses ──
        const oppFrame = enumerateActions(afterSearcherState);

        if (oppFrame && Array.isArray(oppFrame.legalActions) && oppFrame.legalActions.length > 0) {
          // Cap opponent responses: take first N in engine-legal order
          // (NOT random sampling — deterministic)
          const cappedResponses = oppFrame.legalActions.slice(0, maxOpponentResponses);
          const oppResolve = oppFrame.resolveAction;

          // Opponent minimises the searcher's evaluation (minimax)
          let minScore = Infinity;

          for (let j = 0; j < cappedResponses.length; j++) {
            const oppAction = cappedResponses[j];
            const oppCommand = oppResolve(oppAction.actionId ?? oppAction);
            const oppSimResult = simulate(afterSearcherState, oppCommand);
            nodesExpanded++;
            depthReached = Math.max(depthReached, 2);

            if (!oppSimResult.accepted) {
              continue;
            }

            const score = evaluate(oppSimResult.state, searcherId);
            if (score < minScore) {
              minScore = score;
            }

            // Check budget after each opponent response expansion
            if (nodesExpanded >= maxNodes) {
              budgetExhausted = true;
              break;
            }
            if (deadlineExceeded(startTime)) {
              timeExceeded = true;
              break;
            }
          }

          // If all opponent responses were rejected, evaluate the
          // post-searcher state directly.
          actionScore = (minScore === Infinity)
            ? evaluate(afterSearcherState, searcherId)
            : minScore;
        } else {
          // No opponent decision required (e.g. terminal state, or
          // the searcher gets another turn). Evaluate directly.
          actionScore = evaluate(afterSearcherState, searcherId);
        }
      } else {
        // maxDepth === 1: evaluate after searcher's action only
        actionScore = evaluate(afterSearcherState, searcherId);
      }

      // Select the action with the highest score (stable: first-seen wins ties)
      if (actionScore > bestScore) {
        bestScore = actionScore;
        bestAction = action;
      }

      if (budgetExhausted || timeExceeded) {
        break;
      }
    }

    // Fallback: if no action produced a valid score (all rejected),
    // pick the first legal action as a safe default.
    if (bestAction === null) {
      bestAction = legalActions[0];
      bestScore = evaluate(rootState, searcherId);
    }

    return Object.freeze({
      bestAction,
      bestScore,
      nodesExpanded,
      depthReached,
      budgetExhausted,
      timeExceeded,
      deadlineMs: deadlineMs ?? null
    });
  }

  return Object.freeze({ search, config });
}

// ── Benchmark suite ────────────────────────────────────────────

/**
 * @typedef {object} BenchmarkPosition
 * @property {string} name       - Position identifier.
 * @property {object} state      - Mock simulation state.
 * @property {Array} legalActions - Legal actions for the searcher.
 * @property {Function} resolveAction - Maps actionId → mock command.
 * @property {Function} simulateFn - Mock simulation function.
 * @property {Function} enumerateActionsFn - Mock action enumerator.
 */

/**
 * @typedef {object} BenchmarkPositionResult
 * @property {string} name             - Position identifier.
 * @property {number} nodesExpanded    - Nodes expanded during search.
 * @property {number} timeMs           - Wall-clock time taken (ms).
 * @property {*} bestAction            - Best action found.
 * @property {number} bestScore        - Score of the best action.
 * @property {boolean} budgetExhausted - Whether the node budget was exhausted.
 * @property {boolean} timeExceeded    - Whether the time budget was exceeded.
 * @property {number} depthReached     - Maximum depth reached (1 or 2).
 */

/**
 * @typedef {object} BenchmarkResult
 * @property {number} totalNodes      - Total nodes across all positions.
 * @property {number} totalTimeMs     - Total wall-clock time (ms).
 * @property {Array<BenchmarkPositionResult>} positions - Per-position results.
 * @property {number} positionCount   - Number of benchmark positions.
 * @property {number} maxNodes        - Node budget used.
 * @property {number} maxDepth        - Search depth used.
 */

/**
 * Construct benchmark positions from simple mock states.
 *
 * These positions are intentionally minimal — they exercise the
 * search mechanics (node counting, budget enforcement, minimax
 * selection) without requiring a full engine instance.
 *
 * @returns {Array<BenchmarkPosition>}
 */
function createBenchmarkPositions() {
  // ── Mock state factory ──
  function mockState(searcherScore, opponentScore, searcherHand, opponentHand, activePlayerId) {
    return {
      activePlayerId,
      turnOrder: ['p1', 'p2'],
      phase: 'PLAYER_DECISION_REQUIRED',
      players: {
        p1: {
          goal: { secured: searcherScore },
          securedPoints: searcherScore,
          hand: new Array(searcherHand).fill({ id: 'c1', identity: 'A♠' }),
          pr: [],
          er: []
        },
        p2: {
          goal: { secured: opponentScore },
          securedPoints: opponentScore,
          hand: new Array(opponentHand).fill({ id: 'c2', identity: 'K♥' }),
          pr: [],
          er: []
        }
      }
    };
  }

  // ── Mock action factory ──
  function mockActions(actionIds) {
    return actionIds.map(id => ({ actionId: id, family: 'score', mode: 'base', kind: 'normal' }));
  }

  // ── Mock resolve: returns a command object carrying the actionId ──
  function mockResolve(actionId) {
    return { actorId: 'p1', actionId, type: 'SCORE' };
  }

  // ── Mock simulate: applies the action to produce a new state ──
  // The mock simulation adjusts scores based on the action's embedded
  // delta value. The delta map covers BOTH the searcher's and the
  // opponent's action IDs, so the same simulateFn handles both plys.
  function makeMockSimulate(allDeltas) {
    return function simulate(state, command) {
      const delta = allDeltas[command.actionId] ?? 0;
      const newState = {
        ...state,
        activePlayerId: state.activePlayerId === 'p1' ? 'p2' : 'p1',
        players: {
          ...state.players,
          p1: {
            ...state.players.p1,
            goal: { secured: (state.players.p1.goal?.secured ?? 0) + (command.actorId === 'p1' ? delta : 0) },
            securedPoints: (state.players.p1.securedPoints ?? 0) + (command.actorId === 'p1' ? delta : 0)
          },
          p2: {
            ...state.players.p2,
            goal: { secured: (state.players.p2.goal?.secured ?? 0) + (command.actorId === 'p2' ? delta : 0) },
            securedPoints: (state.players.p2.securedPoints ?? 0) + (command.actorId === 'p2' ? delta : 0)
          }
        }
      };
      return { state: newState, accepted: true, events: [], error: null };
    };
  }

  // ── Mock enumerate: returns opponent actions after searcher's move ──
  function makeMockEnumerate(oppActions) {
    return function enumerate(state) {
      if (state.activePlayerId !== 'p2') return null;
      const actions = mockActions(oppActions);
      const resolve = (actionId) => ({ actorId: 'p2', actionId, type: 'SCORE' });
      // The search calls the config's simulateFn for the actual
      // simulation of opponent responses — we only provide the
      // legal action surface and resolve function here.
      return { legalActions: actions, resolveAction: resolve, status: 'PLAYER_DECISION_REQUIRED' };
    };
  }

  // Position 1: Clear best action — action 'a3' gives the most points
  const pos1State = mockState(10, 8, 5, 5, 'p1');
  const pos1Deltas = { a1: 1, a2: 3, a3: 7, a4: 0, b1: -2, b2: -5, b3: 0 };
  const pos1Simulate = makeMockSimulate(pos1Deltas);

  // Position 2: Tight race — opponent can punish aggressive plays
  const pos2State = mockState(15, 14, 3, 4, 'p1');
  const pos2Deltas = { a1: 2, a2: 5, a3: 8, b1: -3, b2: -8, b3: -1, b4: 0 };
  const pos2Simulate = makeMockSimulate(pos2Deltas);

  // Position 3: Many actions — tests budget exhaustion
  const pos3ActionIds = Array.from({ length: 20 }, (_, i) => `act${i + 1}`);
  const pos3OppIds = Array.from({ length: 15 }, (_, i) => `resp${i + 1}`);
  const pos3Deltas = {};
  for (let i = 0; i < 20; i++) pos3Deltas[`act${i + 1}`] = i;
  for (let i = 0; i < 15; i++) pos3Deltas[`resp${i + 1}`] = -i;
  const pos3State = mockState(5, 5, 7, 7, 'p1');
  const pos3Simulate = makeMockSimulate(pos3Deltas);

  // Position 4: Defensive position — low scores, few actions
  const pos4State = mockState(3, 20, 2, 6, 'p1');
  const pos4Deltas = { a1: 1, a2: 2, b1: -1, b2: -4 };
  const pos4Simulate = makeMockSimulate(pos4Deltas);

  // Position 5: Depth-1 only — no opponent responses
  const pos5State = mockState(12, 10, 4, 4, 'p1');
  const pos5Deltas = { a1: 3, a2: 6, a3: 1 };
  const pos5Simulate = makeMockSimulate(pos5Deltas);

  return [
    {
      name: 'clear-best',
      state: pos1State,
      legalActions: mockActions(['a1', 'a2', 'a3', 'a4']),
      resolveAction: mockResolve,
      simulateFn: pos1Simulate,
      enumerateActionsFn: makeMockEnumerate(['b1', 'b2', 'b3'])
    },
    {
      name: 'tight-race',
      state: pos2State,
      legalActions: mockActions(['a1', 'a2', 'a3']),
      resolveAction: mockResolve,
      simulateFn: pos2Simulate,
      enumerateActionsFn: makeMockEnumerate(['b1', 'b2', 'b3', 'b4'])
    },
    {
      name: 'budget-pressure',
      state: pos3State,
      legalActions: mockActions(pos3ActionIds),
      resolveAction: mockResolve,
      simulateFn: pos3Simulate,
      enumerateActionsFn: makeMockEnumerate(pos3OppIds)
    },
    {
      name: 'defensive',
      state: pos4State,
      legalActions: mockActions(['a1', 'a2']),
      resolveAction: mockResolve,
      simulateFn: pos4Simulate,
      enumerateActionsFn: makeMockEnumerate(['b1', 'b2'])
    },
    {
      name: 'depth-1-only',
      state: pos5State,
      legalActions: mockActions(['a1', 'a2', 'a3']),
      resolveAction: mockResolve,
      simulateFn: pos5Simulate,
      enumerateActionsFn: () => null // no opponent response — depth 1
    }
  ];
}

/**
 * Run the lookahead benchmark suite.
 *
 * Executes a set of pre-defined benchmark positions and reports
 * nodes expanded, time taken, best action, best score, and budget
 * flags for each. The benchmark does NOT label the result "expert"
 * — it merely reports the numbers. The caller decides whether to
 * classify the AI as "expert" based on the results.
 *
 * @param {Partial<LookaheadConfig>} [configOverride] - Optional config overrides.
 * @returns {Readonly<BenchmarkResult>}
 */
export function runLookaheadBenchmark(configOverride) {
  const config = { ...DEFAULT_LOOKAHEAD_CONFIG, ...configOverride };
  const positions = createBenchmarkPositions();
  const results = [];
  let totalNodes = 0;
  let totalTimeMs = 0;

  for (const pos of positions) {
    const posConfig = {
      ...config,
      simulateFn: pos.simulateFn,
      enumerateActionsFn: pos.enumerateActionsFn
    };

    const searchInstance = createBoundedLookahead(posConfig);
    const startMs = nowMs();
    const result = searchInstance.search(pos.state, pos.legalActions, pos.resolveAction);
    const elapsed = nowMs() - startMs;

    totalNodes += result.nodesExpanded;
    totalTimeMs += elapsed;

    results.push({
      name: pos.name,
      nodesExpanded: result.nodesExpanded,
      timeMs: elapsed,
      bestAction: result.bestAction,
      bestScore: result.bestScore,
      budgetExhausted: result.budgetExhausted,
      timeExceeded: result.timeExceeded,
      depthReached: result.depthReached
    });
  }

  return Object.freeze({
    totalNodes,
    totalTimeMs,
    positions: Object.freeze(results),
    positionCount: positions.length,
    maxNodes: config.maxNodes,
    maxDepth: config.maxDepth
  });
}

// ── Policy integration ─────────────────────────────────────────

/**
 * Create a policy-sdk compatible lookahead policy definition.
 *
 * The policy's `choose(context)` method runs the bounded lookahead
 * search on the current simulation state and returns the best action.
 *
 * The context is expected to include:
 *   - `legalActions`        — array of legal actions (from policy-sdk runtime)
 *   - `simulationState`     — the raw simulation state (for search root)
 *   - `resolveAction`       — function mapping actionId → engine command
 *   - `actorId`             — the searching player's ID
 *
 * If `simulationState` or `resolveAction` are not present in the
 * context (e.g. when used with a runtime that does not expose them),
 * the policy falls back to depth-1 evaluation: it evaluates each
 * legal action using the injected simulateFn (if available) or
 * falls back to picking the first legal action.
 *
 * @param {object} options
 * @param {string} options.policyId       - Unique policy ID.
 * @param {string} [options.difficulty]   - Difficulty label (informational).
 * @param {Partial<LookaheadConfig>} [options.configOverride] - Config overrides.
 * @returns {object} Policy definition compatible with POLICY_BY_ID.
 */
export function createLookaheadPolicy({ policyId, difficulty = 'normal', configOverride }) {
  if (!policyId) throw new Error('createLookaheadPolicy: policyId is required');

  const config = { ...DEFAULT_LOOKAHEAD_CONFIG, ...configOverride };

  // Build a deterministic fingerprint of the policy configuration.
  const configFingerprint = hashCanonical({
    maxNodes: config.maxNodes,
    maxDepth: config.maxDepth,
    maxOpponentResponses: config.maxOpponentResponses,
    evaluation: config.evaluationFn ? 'custom' : 'default'
  });

  /**
   * Policy choose function — runs the bounded lookahead search.
   * @param {object} context - Policy context from the simulation runtime.
   * @returns {{ actionId: string, metadata: object }}
   */
  function choose(context) {
    const legalActions = context.legalActions ?? [];
    if (!legalActions.length) {
      throw Object.assign(new Error('NO_LEGAL_ACTION'), { code: 'NO_LEGAL_ACTION' });
    }

    const simulationState = context.simulationState ?? null;
    const resolveAction = context.resolveAction ?? null;

    // If the runtime provides the simulation state and resolve
    // function, run the full bounded lookahead search.
    if (simulationState && typeof resolveAction === 'function') {
      const searchInstance = createBoundedLookahead(config);
      const result = searchInstance.search(simulationState, legalActions, resolveAction);

      return {
        actionId: result.bestAction?.actionId ?? result.bestAction,
        metadata: {
          nodesExpanded: result.nodesExpanded,
          depthReached: result.depthReached,
          bestScore: result.bestScore,
          budgetExhausted: result.budgetExhausted,
          timeExceeded: result.timeExceeded,
          strengthTier: LOOKAHEAD_STRENGTH_TIER
        }
      };
    }

    // Fallback: depth-0 evaluation — score each action against the
    // current state using the evaluation function. This is used when
    // the runtime does not expose the raw simulation state.
    const evaluationFn = config.evaluationFn ?? defaultEvaluation;
    const searcherId = context.actorId ?? simulationState?.activePlayerId ?? null;
    const state = simulationState ?? context.authorizedView ?? {};

    let bestAction = legalActions[0];
    let bestScore = -Infinity;

    for (const action of legalActions) {
      const score = evaluationFn(state, searcherId);
      // In fallback mode, all actions evaluate the same state, so we
      // use the action's own properties as a tiebreaker via a simple
      // hash-based jitter (deterministic, no RNG).
      const actionHash = hashCanonical(action.actionId ?? String(action));
      const jitter = parseInt(actionHash.slice(0, 8), 16) % 100;
      const adjustedScore = score + jitter * 0.001;
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestAction = action;
      }
    }

    return {
      actionId: bestAction.actionId ?? bestAction,
      metadata: {
        nodesExpanded: 0,
        depthReached: 0,
        bestScore,
        budgetExhausted: false,
        timeExceeded: false,
        strengthTier: LOOKAHEAD_STRENGTH_TIER,
        fallback: true
      }
    };
  }

  return createPolicyDefinition({
    policyId,
    version: '1.0.0',
    strengthTier: LOOKAHEAD_STRENGTH_TIER,
    traits: Object.freeze({
      difficulty,
      lookahead: true,
      maxNodes: config.maxNodes,
      maxDepth: config.maxDepth,
      configFingerprint
    }),
    choose
  });
}

// ── Pre-built lookahead policy variants ────────────────────────

/**
 * Standard lookahead policy with default config (200 nodes, depth 2).
 * Callers must provide `simulateFn` and `enumerateActionsFn` via
 * configOverride when wiring into a real engine.
 */
export const LOOKAHEAD_STANDARD = createLookaheadPolicy({
  policyId: 'lookahead-standard',
  difficulty: 'hard'
});

/**
 * Deep lookahead policy with expanded budget (500 nodes, depth 2).
 * Intended for offline analysis or high-stakes decisions.
 */
export const LOOKAHEAD_DEEP = createLookaheadPolicy({
  policyId: 'lookahead-deep',
  difficulty: 'nightmare',
  configOverride: { maxNodes: 500, maxOpponentResponses: 50 }
});

/**
 * Shallow lookahead policy (100 nodes, depth 1).
 * Fastest lookahead variant — evaluates only the searcher's action
 * without modelling opponent responses.
 */
export const LOOKAHEAD_SHALLOW = createLookaheadPolicy({
  policyId: 'lookahead-shallow',
  difficulty: 'normal',
  configOverride: { maxNodes: 100, maxDepth: 1 }
});

/**
 * All pre-built lookahead policy variants.
 */
export const LOOKAHEAD_POLICIES = Object.freeze([
  LOOKAHEAD_STANDARD,
  LOOKAHEAD_DEEP,
  LOOKAHEAD_SHALLOW
]);

/**
 * Frozen array of lookahead policy IDs.
 */
export const LOOKAHEAD_POLICY_IDS = Object.freeze(
  LOOKAHEAD_POLICIES.map(p => p.policyId)
);

// ── Internal helpers ───────────────────────────────────────────

/**
 * Get the current time in milliseconds. Uses `performance.now()`
 * when available (Node.js / browser), falls back to `Date.now()`.
 * This is the ONLY wall-clock dependency and is used solely for
 * the optional deadlineMs check — never for determinism.
 * @returns {number}
 */
function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
