// ═══════════════════════════════════════════════════════════════
// monte-carlo.mjs — Monte Carlo win-probability estimator for the
// Caster replay theatre.
//
// Runs N random-legal playouts from a given game state and aggregates
// the results into a win-probability distribution, score statistics,
// and termination-reason breakdown.
//
// Authority invariants:
//   - Monte Carlo is purely observational. It never mutates the
//     replay state, match result, or frame data.
//   - Playouts use random-legal policies — they do NOT predict what
//     the actual policies will do. They estimate the *position value*
//     (who is ahead from this board state), not the *policy strength*.
//   - All playouts are deterministic given the same state + seed.
//   - The playout function is injected (runPlayout) so this module
//     has no dependency on @intrilex/simulation-runtime or
//     autonomy-runtime.js. The browser Caster injects
//     runBrowserPolicyMatch; Node tests inject a mock.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MonteCarloResult
 * @property {number} simulations - number of playouts completed
 * @property {number} seat1Wins - P1 wins
 * @property {number} seat2Wins - P2 wins
 * @property {number} draws - canonical draws
 * @property {number} aborts - incomplete playouts (decision limit, error)
 * @property {number} seat1WinRate - P1 win rate (0-1, excluding draws/aborts)
 * @property {number} seat2WinRate - P2 win rate (0-1, excluding draws/aborts)
 * @property {number} seat1WinPct - P1 win percentage including draws (0-100)
 * @property {number} seat2WinPct - P2 win percentage including draws (0-100)
 * @property {number} drawPct - draw percentage (0-100)
 * @property {number} avgTurns - average completed full turns
 * @property {number} avgScoreSeat1 - average final score for P1
 * @property {number} avgScoreSeat2 - average final score for P2
 * @property {number} avgMargin - average score margin (abs)
 * @property {Object} terminationReasons - { reason: count }
 * @property {number} durationMs - wall-clock duration
 * @property {number} seed - base seed used
 */

/**
 * Default number of simulations. Tuned for browser responsiveness
 * (~200ms for 50 playouts on a typical match state).
 */
export const DEFAULT_SIM_COUNT = 50;
export const MAX_SIM_COUNT = 500;
export const MIN_SIM_COUNT = 10;

/**
 * Run Monte Carlo simulations from a given game state.
 *
 * @param {object} opts
 * @param {object} opts.initialState - the game state to simulate from
 * @param {Function} opts.runPlayout - async or sync function(state, seed) -> summary
 *   Must return { winner, winningSeat, finalScores, completedFullTurns, terminationReason }
 * @param {number} [opts.simulations=50] - number of playouts
 * @param {number} [opts.baseSeed=1] - base seed (each playout uses baseSeed + i)
 * @param {string[]} [opts.policyIds] - policy IDs for playouts (default: random-legal)
 * @param {string} [opts.profileId] - profile ID for playouts
 * @param {Function} [opts.onProgress] - callback(completed, total) for progress updates
 * @returns {Promise<MonteCarloResult>} aggregated results
 */
export async function runMonteCarloSimulations({
  initialState,
  runPlayout,
  simulations = DEFAULT_SIM_COUNT,
  baseSeed = 1,
  policyIds = ['random-legal', 'random-legal'],
  profileId = null,
  onProgress = null,
}) {
  if (!initialState || typeof initialState !== 'object') {
    throw new Error('MONTE_CARLO: initialState is required');
  }
  if (typeof runPlayout !== 'function') {
    throw new Error('MONTE_CARLO: runPlayout function is required');
  }
  const simCount = Math.max(MIN_SIM_COUNT, Math.min(MAX_SIM_COUNT, Math.floor(simulations)));
  const startTime = Date.now();

  let seat1Wins = 0, seat2Wins = 0, draws = 0, aborts = 0;
  let totalTurns = 0, totalScore1 = 0, totalScore2 = 0, totalMargin = 0;
  const terminationReasons = {};
  const seatOrder = initialState.seatOrder ?? ['P1', 'P2'];

  for (let i = 0; i < simCount; i += 1) {
    const seed = ((baseSeed + i) * 2654435761) >>> 0 || 1; // Knuth multiplicative hash for varied seeds
    let summary;
    try {
      summary = await runPlayout({
        initialState: structuredClone(initialState),
        seed,
        policyIds,
        profileId,
        seatOrder,
      });
    } catch {
      aborts += 1;
      terminationReasons.SIM_ERROR = (terminationReasons.SIM_ERROR ?? 0) + 1;
      continue;
    }

    if (!summary) {
      aborts += 1;
      continue;
    }

    const reason = summary.terminationReason ?? 'UNKNOWN';
    terminationReasons[reason] = (terminationReasons[reason] ?? 0) + 1;

    const completedTurns = summary.completedFullTurns ?? 0;
    totalTurns += completedTurns;

    const fs = summary.finalScores ?? {};
    const s1 = fs[seatOrder[0]] ?? 0;
    const s2 = fs[seatOrder[1]] ?? 0;
    totalScore1 += s1;
    totalScore2 += s2;
    totalMargin += Math.abs(s1 - s2);

    if (reason === 'CANONICAL_DRAW') {
      draws += 1;
    } else if (summary.winningSeat === 1) {
      seat1Wins += 1;
    } else if (summary.winningSeat === 2) {
      seat2Wins += 1;
    } else {
      aborts += 1;
    }

    if (onProgress && (i % 5 === 0 || i === simCount - 1)) {
      onProgress(i + 1, simCount);
    }
  }

  const completed = seat1Wins + seat2Wins + draws;
  const total = simCount;
  const decisive = seat1Wins + seat2Wins;

  const durationMs = Date.now() - startTime;

  return {
    simulations: total,
    seat1Wins,
    seat2Wins,
    draws,
    aborts,
    seat1WinRate: decisive > 0 ? seat1Wins / decisive : 0,
    seat2WinRate: decisive > 0 ? seat2Wins / decisive : 0,
    seat1WinPct: total > 0 ? (seat1Wins / total) * 100 : 0,
    seat2WinPct: total > 0 ? (seat2Wins / total) * 100 : 0,
    drawPct: total > 0 ? (draws / total) * 100 : 0,
    avgTurns: completed > 0 ? totalTurns / completed : 0,
    avgScoreSeat1: total > 0 ? totalScore1 / total : 0,
    avgScoreSeat2: total > 0 ? totalScore2 / total : 0,
    avgMargin: total > 0 ? totalMargin / total : 0,
    terminationReasons,
    durationMs,
    seed: baseSeed,
  };
}

/**
 * Format a Monte Carlo result into a human-readable summary string.
 * Used by the deterministic commentary provider and the UI.
 *
 * @param {MonteCarloResult} result
 * @param {number} [seat] - the acting seat (1 or 2), for perspective
 * @returns {string} formatted summary
 */
export function formatMonteCarloSummary(result, seat = null) {
  if (!result || result.simulations === 0) return '';
  const p1 = result.seat1WinPct.toFixed(0);
  const p2 = result.seat2WinPct.toFixed(0);
  const avgT = result.avgTurns.toFixed(1);
  const avgS1 = result.avgScoreSeat1.toFixed(1);
  const avgS2 = result.avgScoreSeat2.toFixed(1);

  const parts = [];
  if (seat === 1) {
    parts.push(`Monte Carlo (${result.simulations} playouts): Seat 1 wins ${p1}% of the time.`);
  } else if (seat === 2) {
    parts.push(`Monte Carlo (${result.simulations} playouts): Seat 2 wins ${p2}% of the time.`);
  } else {
    parts.push(`Monte Carlo (${result.simulations} playouts): P1 ${p1}% — P2 ${p2}%${result.drawPct > 0 ? ` — Draw ${result.drawPct.toFixed(0)}%` : ''}.`);
  }
  parts.push(`Average outcome: ${avgS1}-${avgS2} in ${avgT} turns.`);
  if (result.aborts > 0) {
    parts.push(`${result.aborts} playout${result.aborts === 1 ? '' : 's'} did not complete.`);
  }
  return parts.join(' ');
}

/**
 * Determine the favored seat from a Monte Carlo result.
 * @param {MonteCarloResult} result
 * @returns {{ seat: number|null, confidence: 'high'|'medium'|'low', margin: number }}
 */
export function monteCarloFavored(result) {
  if (!result || result.simulations === 0) return { seat: null, confidence: 'low', margin: 0 };
  const diff = result.seat1WinPct - result.seat2WinPct;
  const absDiff = Math.abs(diff);
  const seat = diff > 0 ? 1 : diff < 0 ? 2 : null;
  const confidence = absDiff >= 30 ? 'high' : absDiff >= 15 ? 'medium' : 'low';
  return { seat, confidence, margin: absDiff };
}
