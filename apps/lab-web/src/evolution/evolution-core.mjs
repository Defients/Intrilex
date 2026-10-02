// ═══════════════════════════════════════════════════════════════
// evolution/evolution-core.mjs — Evolution Lab (Prototype Zero) core.
//
// Pure, dependency-free series machinery shared by the browser worker
// (worker.js 'run-evolution-batch') and the /evolution workspace. No DOM,
// no engine imports — safe to unit test in Node and to lazy-load inside
// the module worker.
//
// The authoritative game engine remains the sole source of truth for
// legal actions, state transitions, scoring, and termination. This module
// only schedules games (ordinals/seats/seeds) and aggregates the slim
// per-game records the worker returns.
// ═══════════════════════════════════════════════════════════════

export const EVOLUTION_LIMITS = Object.freeze({
  MIN_GAMES: 1,
  MAX_GAMES: 10000,
  DECISION_LIMIT: 1800,
  MAX_WORKERS: 4,
  DEFAULT_BATCH_SIZE: 25,
  MAX_CHART_SAMPLES: 360,
});

export const GAME_PRESETS = Object.freeze([100, 1000, 10000]);

export const SERIES_STATES = Object.freeze(['IDLE', 'RUNNING', 'STOPPED', 'COMPLETE', 'ERROR']);

// Termination reasons that mean the engine completed the game normally.
// Anything else (DECISION_LIMIT, POLICY_ERROR, ENGINE_REJECTION,
// UNSUPPORTED_CONFIGURATION, WORKER_FAULT) is an aborted/error game.
export const COMPLETE_REASONS = Object.freeze(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const COMPLETE_SET = new Set(COMPLETE_REASONS);

export const DEFAULT_PROFILE_ID = 'core-advanced-authority';

/**
 * Deterministic per-game seed: uint32 mix of (baseSeed, ordinal).
 * Same baseSeed + ordinal + config always produces the same game seed,
 * so a full series is reproducible end-to-end.
 */
export function evolutionGameSeed(baseSeed, ordinal) {
  let h = ((Number(baseSeed) >>> 0) || 1) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul((h ^ (Number(ordinal) >>> 0)) >>> 0, 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h || 1;
}

/**
 * Seat assignment for one game. policyIds[i] is bound to seat i (seat 1 =
 * 'P1' = first player) by the simulation runtime. With seat mirroring on,
 * odd ordinals swap which bot occupies seat 1 (AB/BA alternation).
 */
export function seatPlan(ordinal, mirrorSeats, botA, botB) {
  const swapped = mirrorSeats === true && Math.abs(Number(ordinal) % 2) === 1;
  return { swapped, policyIds: swapped ? [botB, botA] : [botA, botB] };
}

/**
 * Ordinals owned by one worker in a strided multi-worker split.
 * Worker w handles ordinals w, w+stride, w+2*stride, … so seat-swap parity
 * stays balanced across the whole series and workers finish together.
 */
export function strideOrdinals(start, total, stride, max) {
  const out = [];
  const s = Math.max(1, Number(stride) || 1);
  const cap = Math.max(1, Number(max) || 1);
  for (let o = Number(start) || 0; o < total && out.length < cap; o += s) out.push(o);
  return out;
}

/**
 * Validate and normalize a series configuration. Returns { ok, errors, config }.
 * Never throws — callers surface errors to the UI.
 */
export function validateSeriesConfig(cfg = {}) {
  const errors = [];
  const botA = String(cfg.botA ?? '');
  const botB = String(cfg.botB ?? '');
  if (!botA) errors.push('BOT_A_MISSING');
  if (!botB) errors.push('BOT_B_MISSING');
  const gameCount = Number(cfg.gameCount);
  if (!Number.isInteger(gameCount) || gameCount < EVOLUTION_LIMITS.MIN_GAMES || gameCount > EVOLUTION_LIMITS.MAX_GAMES) {
    errors.push(`INVALID_GAME_COUNT:${cfg.gameCount}`);
  }
  const seed = cfg.seed === '' || cfg.seed === undefined || cfg.seed === null ? 1 : Number(cfg.seed);
  if (!Number.isFinite(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(seed)) {
    errors.push(`INVALID_SEED:${cfg.seed}`);
  }
  const workerCount = Number(cfg.workerCount ?? 1);
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > EVOLUTION_LIMITS.MAX_WORKERS) {
    errors.push(`INVALID_WORKER_COUNT:${cfg.workerCount}`);
  }
  const profileId = String(cfg.profileId ?? DEFAULT_PROFILE_ID);
  const config = {
    botA, botB,
    gameCount: Number.isInteger(gameCount) ? gameCount : 0,
    seed: (Number.isInteger(seed) && seed >= 0 ? seed >>> 0 : 0) || 1,
    mirrorSeats: cfg.mirrorSeats !== false,
    workerCount: Number.isInteger(workerCount) ? workerCount : 1,
    profileId,
    decisionLimit: EVOLUTION_LIMITS.DECISION_LIMIT,
  };
  return { ok: errors.length === 0, errors, config };
}

/**
 * Map a full runBrowserPolicyMatch summary to a slim per-game record.
 * Only the fields the dashboard needs cross the worker boundary.
 */
export function slimGameRecord(summary, ordinal, swapped) {
  return {
    ordinal,
    swapped: swapped === true,
    winner: summary?.winner ?? 'ABORTED',
    winningSeat: Number(summary?.winningSeat) || null,
    terminationReason: summary?.terminationReason ?? 'WORKER_FAULT',
    errorCode: summary?.errorCode ?? null,
    scoreP1: Number(summary?.finalScores?.P1) || 0,
    scoreP2: Number(summary?.finalScores?.P2) || 0,
    turns: Number(summary?.completedFullTurns) || 0,
    decisions: Number(summary?.policyDecisionCount) || 0,
  };
}

/** Record for a game that threw inside the worker (never reaches the engine boundary cleanly). */
export function faultGameRecord(ordinal, swapped, error) {
  return {
    ordinal,
    swapped: swapped === true,
    winner: 'ABORTED',
    winningSeat: null,
    terminationReason: 'WORKER_FAULT',
    errorCode: String(error?.code ?? error?.message ?? 'GAME_FAULT').slice(0, 80),
    scoreP1: 0, scoreP2: 0, turns: 0, decisions: 0,
  };
}

/**
 * Fresh series accumulator. winsA/winsB count decisive games mapped to the
 * configured bots regardless of seat. seat1/seat2 wins track first-player
 * vs second-player performance. Scores/turns/decisions average over
 * canonically completed games only.
 */
export function createSeriesAggregator() {
  return {
    completed: 0,        // all games that produced a record (incl. aborted)
    completedClean: 0,   // canonically completed games
    winsA: 0,
    winsB: 0,
    draws: 0,
    unresolved: 0,       // completed without a winner or draw (defensive)
    aborted: 0,
    seat1Wins: 0,
    seat2Wins: 0,
    scoreSumA: 0,
    scoreSumB: 0,
    turnsSum: 0,
    decisionsSum: 0,
    abortReasons: {},
  };
}

/** Fold one slim game record into the accumulator. Returns the accumulator. */
export function ingestGameRecord(agg, g) {
  agg.completed += 1;
  if (!COMPLETE_SET.has(g.terminationReason)) {
    agg.aborted += 1;
    const reason = String(g.terminationReason ?? 'UNKNOWN');
    agg.abortReasons[reason] = (agg.abortReasons[reason] ?? 0) + 1;
    return agg;
  }
  agg.completedClean += 1;
  const winnerSeat = g.winner === 'P1' ? 1 : g.winner === 'P2' ? 2 : null;
  if (winnerSeat === 1) agg.seat1Wins += 1;
  else if (winnerSeat === 2) agg.seat2Wins += 1;
  if (winnerSeat === null) {
    if (g.terminationReason === 'CANONICAL_DRAW' || g.winner === 'DRAW') agg.draws += 1;
    else agg.unresolved += 1;
  } else {
    const botAWon = (!g.swapped && winnerSeat === 1) || (g.swapped && winnerSeat === 2);
    if (botAWon) agg.winsA += 1; else agg.winsB += 1;
  }
  agg.scoreSumA += g.swapped ? g.scoreP2 : g.scoreP1;
  agg.scoreSumB += g.swapped ? g.scoreP1 : g.scoreP2;
  agg.turnsSum += g.turns;
  agg.decisionsSum += g.decisions;
  return agg;
}

/**
 * Derived metrics. elapsedMs is wall-clock time of the series so far
 * (live) or total (finished). All rates are null-safe for empty series.
 */
export function seriesMetrics(agg, elapsedMs) {
  const clean = agg.completedClean || 0;
  const ratio = (n, d) => (d > 0 ? n / d : null);
  const seconds = Number(elapsedMs) / 1000;
  return {
    gamesCompleted: agg.completed,
    gamesClean: clean,
    winsA: agg.winsA,
    winsB: agg.winsB,
    draws: agg.draws,
    unresolved: agg.unresolved,
    aborted: agg.aborted,
    abortReasons: { ...agg.abortReasons },
    winPctA: ratio(agg.winsA, clean),
    winPctB: ratio(agg.winsB, clean),
    drawPct: ratio(agg.draws, clean),
    seat1Wins: agg.seat1Wins,
    seat2Wins: agg.seat2Wins,
    seat1WinPct: ratio(agg.seat1Wins, clean),
    seat2WinPct: ratio(agg.seat2Wins, clean),
    avgScoreA: ratio(agg.scoreSumA, clean),
    avgScoreB: ratio(agg.scoreSumB, clean),
    avgScoreDiff: clean > 0 ? (agg.scoreSumA - agg.scoreSumB) / clean : null,
    avgTurns: ratio(agg.turnsSum, clean),
    avgDecisions: ratio(agg.decisionsSum, clean),
    gamesPerSec: seconds > 0 && agg.completed > 0 ? agg.completed / seconds : null,
  };
}

/**
 * Append a cumulative-win-rate sample and bound the buffer.
 * When the buffer exceeds 2×max it is halved by keeping every other point
 * (deterministic decimation), so long runs stay cheap to render.
 */
export function pushChartSample(samples, agg, max = EVOLUTION_LIMITS.MAX_CHART_SAMPLES) {
  const clean = agg.completedClean || 0;
  samples.push({
    n: agg.completed,
    a: clean > 0 ? (agg.winsA / clean) * 100 : null,
    b: clean > 0 ? (agg.winsB / clean) * 100 : null,
    d: clean > 0 ? (agg.draws / clean) * 100 : null,
  });
  if (samples.length > max * 2) {
    let w = 0;
    for (let i = 0; i < samples.length; i += 1) {
      if (i % 2 === 0 || i === samples.length - 1) samples[w++] = samples[i];
    }
    samples.length = w;
  }
  return samples;
}
