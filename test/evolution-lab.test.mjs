// ═══════════════════════════════════════════════════════════════
// evolution-lab.test.mjs — Evolution Lab (Prototype Zero) tests.
// Covers the pure series machinery in apps/lab-web/src/evolution/:
// scheduling (ordinals/seats/seeds), aggregation, metrics, chart
// sampling, config validation, and the worker protocol contract.
// A small real-engine section verifies the full record pipeline
// through runBrowserPolicyMatch.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  EVOLUTION_LIMITS,
  DEFAULT_PROFILE_ID,
  evolutionGameSeed,
  seatPlan,
  strideOrdinals,
  validateSeriesConfig,
  slimGameRecord,
  faultGameRecord,
  createSeriesAggregator,
  ingestGameRecord,
  seriesMetrics,
  pushChartSample,
} from '../apps/lab-web/src/evolution/evolution-core.mjs';

const rec = (over = {}) => ({
  ordinal: 0,
  swapped: false,
  winner: 'P1',
  winningSeat: 1,
  terminationReason: 'NORMAL_VICTORY',
  errorCode: null,
  scoreP1: 20,
  scoreP2: 10,
  turns: 30,
  decisions: 60,
  ...over,
});

// ── Config validation ───────────────────────────────────────────

test('evolution: validateSeriesConfig accepts a valid config and applies defaults', () => {
  const { ok, errors, config } = validateSeriesConfig({ botA: 'score-rush', botB: 'control', gameCount: 1000, seed: 1337, workerCount: 2 });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
  assert.equal(config.botA, 'score-rush');
  assert.equal(config.botB, 'control');
  assert.equal(config.gameCount, 1000);
  assert.equal(config.seed, 1337);
  assert.equal(config.mirrorSeats, true);
  assert.equal(config.workerCount, 2);
  assert.equal(config.profileId, DEFAULT_PROFILE_ID);
  assert.equal(config.decisionLimit, EVOLUTION_LIMITS.DECISION_LIMIT);
});

test('evolution: validateSeriesConfig rejects unsafe game counts', () => {
  for (const gameCount of [0, -5, 1.5, Number.NaN, 'abc', EVOLUTION_LIMITS.MAX_GAMES + 1, 1000000]) {
    const { ok, errors } = validateSeriesConfig({ botA: 'a', botB: 'b', gameCount });
    assert.equal(ok, false, `gameCount ${gameCount} must be rejected`);
    assert.ok(errors.some((e) => e.startsWith('INVALID_GAME_COUNT')));
  }
  // Boundary values are valid
  assert.equal(validateSeriesConfig({ botA: 'a', botB: 'b', gameCount: 1 }).ok, true);
  assert.equal(validateSeriesConfig({ botA: 'a', botB: 'b', gameCount: EVOLUTION_LIMITS.MAX_GAMES }).ok, true);
});

test('evolution: validateSeriesConfig rejects missing bots and bad seeds/workers', () => {
  assert.equal(validateSeriesConfig({ botA: '', botB: 'b', gameCount: 10 }).ok, false);
  assert.equal(validateSeriesConfig({ botA: 'a', gameCount: 10 }).ok, false);
  for (const seed of [-1, 1.5, 'x', 0x100000000]) {
    assert.equal(validateSeriesConfig({ botA: 'a', botB: 'b', gameCount: 10, seed }).ok, false, `seed ${seed} rejected`);
  }
  for (const workerCount of [0, -1, 5, 1.5]) {
    assert.equal(validateSeriesConfig({ botA: 'a', botB: 'b', gameCount: 10, workerCount }).ok, false, `workerCount ${workerCount} rejected`);
  }
});

// ── Deterministic seeding ───────────────────────────────────────

test('evolution: game seeds are deterministic per (baseSeed, ordinal)', () => {
  for (const ordinal of [0, 1, 2, 50, 9999]) {
    assert.equal(evolutionGameSeed(1337, ordinal), evolutionGameSeed(1337, ordinal));
  }
  // Different base seeds diverge; different ordinals diverge
  assert.notEqual(evolutionGameSeed(1, 0), evolutionGameSeed(2, 0));
  assert.notEqual(evolutionGameSeed(1, 0), evolutionGameSeed(1, 1));
  // Always a positive uint32
  for (const s of [0, 1, 1337, 4294967295]) {
    for (const o of [0, 1, 2, 3]) {
      const seed = evolutionGameSeed(s, o);
      assert.ok(Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff, `seed ${seed} in range`);
    }
  }
});

// ── Seat mirroring ──────────────────────────────────────────────

test('evolution: seatPlan alternates seats AB/BA when mirroring is on', () => {
  const a = seatPlan(0, true, 'alpha', 'beta');
  const b = seatPlan(1, true, 'alpha', 'beta');
  const c = seatPlan(2, true, 'alpha', 'beta');
  const d = seatPlan(3, true, 'alpha', 'beta');
  assert.deepEqual(a.policyIds, ['alpha', 'beta']);
  assert.equal(a.swapped, false);
  assert.deepEqual(b.policyIds, ['beta', 'alpha']);
  assert.equal(b.swapped, true);
  assert.deepEqual(c.policyIds, ['alpha', 'beta']);
  assert.deepEqual(d.policyIds, ['beta', 'alpha']);
});

test('evolution: seatPlan never swaps when mirroring is off', () => {
  for (const ordinal of [0, 1, 2, 3, 4, 5]) {
    const plan = seatPlan(ordinal, false, 'alpha', 'beta');
    assert.deepEqual(plan.policyIds, ['alpha', 'beta']);
    assert.equal(plan.swapped, false);
  }
});

// ── Strided ordinal scheduling ──────────────────────────────────

test('evolution: strideOrdinals partitions the series exactly once across workers', () => {
  const total = 97;
  const seen = new Set();
  for (let w = 0; w < 4; w += 1) {
    const ordinals = strideOrdinals(w, total, 4, total);
    for (const o of ordinals) {
      assert.ok(o < total);
      assert.ok(!seen.has(o), `ordinal ${o} duplicated`);
      seen.add(o);
    }
  }
  assert.equal(seen.size, total, 'every ordinal covered exactly once');
});

test('evolution: strideOrdinals respects the batch cap', () => {
  const batch = strideOrdinals(0, 1000, 2, 25);
  assert.equal(batch.length, 25);
  assert.deepEqual(batch.slice(0, 4), [0, 2, 4, 6]);
});

// ── Aggregation & metrics ───────────────────────────────────────

test('evolution: win/loss/draw accounting maps seats to bots through swaps', () => {
  const agg = createSeriesAggregator();
  // Game 0: not swapped, seat1 (P1) = Bot A wins
  ingestGameRecord(agg, rec({ ordinal: 0, swapped: false, winner: 'P1' }));
  // Game 1: swapped, seat2 (P2) = Bot A wins (Bot A occupied seat 2)
  ingestGameRecord(agg, rec({ ordinal: 1, swapped: true, winner: 'P2' }));
  // Game 2: swapped, seat1 (P1) = Bot B wins
  ingestGameRecord(agg, rec({ ordinal: 2, swapped: true, winner: 'P1' }));
  // Game 3: draw
  ingestGameRecord(agg, rec({ ordinal: 3, winner: 'DRAW', winningSeat: null, terminationReason: 'CANONICAL_DRAW' }));

  const m = seriesMetrics(agg, 4000);
  assert.equal(m.gamesCompleted, 4);
  assert.equal(m.gamesClean, 4);
  assert.equal(m.winsA, 2);
  assert.equal(m.winsB, 1);
  assert.equal(m.draws, 1);
  assert.equal(m.aborted, 0);
  assert.equal(m.winPctA, 0.5);
  assert.equal(m.winPctB, 0.25);
  assert.equal(m.drawPct, 0.25);
  // Seat accounting is independent of bot identity: seat1 won games 0+2, seat2 won game 1
  assert.equal(m.seat1Wins === undefined, false);
  assert.equal(agg.seat1Wins, 2);
  assert.equal(agg.seat2Wins, 1);
});

test('evolution: score averages respect seat swap', () => {
  const agg = createSeriesAggregator();
  // Bot A scores 30 as seat 1
  ingestGameRecord(agg, rec({ swapped: false, winner: 'P1', scoreP1: 30, scoreP2: 10 }));
  // Bot A scores 12 as seat 2 (swapped)
  ingestGameRecord(agg, rec({ swapped: true, winner: 'P1', scoreP1: 40, scoreP2: 12 }));
  const m = seriesMetrics(agg, 1000);
  assert.equal(m.avgScoreA, 21);   // (30 + 12) / 2
  assert.equal(m.avgScoreB, 25);   // (10 + 40) / 2
  assert.equal(m.avgScoreDiff, -4);
});

test('evolution: aborted/error games are counted and excluded from rates', () => {
  const agg = createSeriesAggregator();
  ingestGameRecord(agg, rec({ terminationReason: 'DECISION_LIMIT', winner: 'ABORTED', winningSeat: null }));
  ingestGameRecord(agg, rec({ terminationReason: 'POLICY_ERROR', winner: 'ABORTED', winningSeat: null, errorCode: 'POLICY_THROW' }));
  ingestGameRecord(agg, faultGameRecord(2, true, new Error('boom')));
  ingestGameRecord(agg, rec({ winner: 'P2' }));
  const m = seriesMetrics(agg, 2000);
  assert.equal(m.gamesCompleted, 4);
  assert.equal(m.gamesClean, 1);
  assert.equal(m.aborted, 3);
  assert.equal(m.winsA, 0);
  assert.equal(m.winsB, 1); // not swapped → P2 = Bot B
  assert.equal(m.abortReasons.DECISION_LIMIT, 1);
  assert.equal(m.abortReasons.POLICY_ERROR, 1);
  assert.equal(m.abortReasons.WORKER_FAULT, 1);
  assert.equal(m.winPctB, 1);
});

test('evolution: completed game without a recorded winner lands in unresolved, not draws', () => {
  const agg = createSeriesAggregator();
  ingestGameRecord(agg, rec({ terminationReason: 'EXHAUSTED_RESOLUTION', winner: 'ABORTED', winningSeat: null }));
  const m = seriesMetrics(agg, 500);
  assert.equal(m.gamesClean, 1);
  assert.equal(m.draws, 0);
  assert.equal(m.unresolved, 1);
  assert.equal(m.winsA + m.winsB, 0);
});

test('evolution: empty series metrics are null-safe', () => {
  const m = seriesMetrics(createSeriesAggregator(), 0);
  assert.equal(m.gamesCompleted, 0);
  assert.equal(m.winPctA, null);
  assert.equal(m.avgScoreA, null);
  assert.equal(m.gamesPerSec, null);
});

// ── Chart sampling ──────────────────────────────────────────────

test('evolution: chart samples stay bounded and ordered', () => {
  const agg = createSeriesAggregator();
  const samples = [];
  for (let i = 0; i < 5000; i += 1) {
    ingestGameRecord(agg, rec({ ordinal: i, winner: i % 3 === 0 ? 'P2' : 'P1' }));
    pushChartSample(samples, agg);
  }
  assert.ok(samples.length <= EVOLUTION_LIMITS.MAX_CHART_SAMPLES * 2, `samples bounded: ${samples.length}`);
  const ns = samples.map((s) => s.n);
  assert.deepEqual([...ns].sort((a, b) => a - b), ns, 'samples stay ordinal-ordered');
  const last = samples.at(-1);
  assert.ok(last.a !== null && last.b !== null && last.d !== null);
  assert.ok(Math.abs(last.a + last.b + last.d - 100) < 0.001, 'series shares sum to 100%');
});

// ── Slim record mapping ─────────────────────────────────────────

test('evolution: slimGameRecord extracts only dashboard fields', () => {
  const heavy = {
    winner: 'P2', winningSeat: 2, terminationReason: 'NORMAL_VICTORY', errorCode: null,
    finalScores: { P1: 11, P2: 22 }, completedFullTurns: 41, policyDecisionCount: 87,
    rankDecisions: [{ big: 'payload' }], actionCounts: { x: 1 },
  };
  const g = slimGameRecord(heavy, 5, true);
  assert.equal(g.ordinal, 5);
  assert.equal(g.swapped, true);
  assert.equal(g.winner, 'P2');
  assert.equal(g.winningSeat, 2);
  assert.equal(g.scoreP1, 11);
  assert.equal(g.scoreP2, 22);
  assert.equal(g.turns, 41);
  assert.equal(g.decisions, 87);
  assert.equal(g.rankDecisions, undefined);
  assert.equal(g.actionCounts, undefined);
});

test('evolution: faultGameRecord produces a countable abort record', () => {
  const g = faultGameRecord(9, false, Object.assign(new Error('kaboom'), { code: 'FAULT_X' }));
  assert.equal(g.terminationReason, 'WORKER_FAULT');
  assert.equal(g.errorCode, 'FAULT_X');
  const agg = createSeriesAggregator();
  ingestGameRecord(agg, g);
  assert.equal(agg.aborted, 1);
  assert.equal(agg.abortReasons.WORKER_FAULT, 1);
});

// ── Simulated full series (scheduling + aggregation end-to-end) ──

test('evolution: a simulated 200-game series completes with consistent accounting', () => {
  const total = 200;
  const workers = 4;
  // Fake match function: deterministic pseudo-result per ordinal
  const fakeMatch = (ordinal, _policyIds) => ({
    winner: ordinal % 7 === 0 ? 'DRAW' : ordinal % 2 === 0 ? 'P1' : 'P2',
    winningSeat: ordinal % 7 === 0 ? null : ordinal % 2 === 0 ? 1 : 2,
    terminationReason: ordinal % 7 === 0 ? 'CANONICAL_DRAW' : 'NORMAL_VICTORY',
    finalScores: { P1: 20, P2: 15 },
    completedFullTurns: 25,
    policyDecisionCount: 50,
  });
  const agg = createSeriesAggregator();
  const seen = new Set();
  for (let w = 0; w < workers; w += 1) {
    for (const ordinal of strideOrdinals(w, total, workers, total)) {
      const plan = seatPlan(ordinal, true, 'bot-a', 'bot-b');
      assert.deepEqual(plan.policyIds, ordinal % 2 === 0 ? ['bot-a', 'bot-b'] : ['bot-b', 'bot-a']);
      const g = slimGameRecord(fakeMatch(ordinal, plan.policyIds), ordinal, plan.swapped);
      ingestGameRecord(agg, g);
      seen.add(ordinal);
    }
  }
  assert.equal(seen.size, total, 'all games ran exactly once');
  const m = seriesMetrics(agg, 8000);
  assert.equal(m.gamesCompleted, total);
  assert.equal(m.aborted, 0);
  const expectedDraws = Math.ceil(total / 7);
  assert.equal(m.draws, expectedDraws);
  assert.equal(m.winsA + m.winsB + m.draws, m.gamesClean);
  assert.ok(m.gamesPerSec !== null && m.gamesPerSec > 0);
  assert.ok(m.seat1WinPct !== null && m.seat2WinPct !== null);
});

// ── Reset behavior ──────────────────────────────────────────────

test('evolution: a fresh aggregator fully resets all accounting', () => {
  const agg = createSeriesAggregator();
  ingestGameRecord(agg, rec({}));
  ingestGameRecord(agg, rec({ terminationReason: 'DECISION_LIMIT', winner: 'ABORTED', winningSeat: null }));
  const fresh = createSeriesAggregator();
  assert.equal(fresh.completed, 0);
  assert.equal(fresh.winsA + fresh.winsB + fresh.draws + fresh.aborted + fresh.unresolved, 0);
  assert.deepEqual(fresh.abortReasons, {});
  const m = seriesMetrics(fresh, 100);
  assert.equal(m.gamesCompleted, 0);
});

// ── Wiring contract (source-level, mirrors browser-contract.test) ──

test('evolution: worker.js exposes the run-evolution-series protocol', async () => {
  const src = await readFile('apps/lab-web/src/worker.js', 'utf8');
  assert.match(src, /run-evolution-series/);
  assert.match(src, /evolution-game/);
  assert.match(src, /evolution-worker-done/);
  assert.match(src, /runBrowserPolicyMatch/);
});

test('evolution: route, renderer, and stylesheet are registered', async () => {
  const router = await readFile('apps/lab-web/src/router.js', 'utf8');
  assert.match(router, /\['\/evolution'/);
  assert.match(router, /'\/evolution':/);
  const appCode = await readFile('apps/lab-web/src/app.js', 'utf8');
  assert.match(appCode, /renderEvolutionLab/);
  assert.match(appCode, /'\/evolution': renderEvolutionLab/);
  const styles = await readFile('apps/lab-web/src/styles.css', 'utf8');
  assert.match(styles, /evolution\.css/);
});

test('evolution: workspace marks future modules as coming later and stays non-learning', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/evolution.js', 'utf8');
  assert.match(src, /coming later/i);
  assert.match(src, /Evolution/);
  assert.match(src, /Checkpoints/);
  assert.match(src, /Benchmarks/);
  assert.match(src, /Lineages/);
  assert.match(src, /Hall of Fame/);
  assert.match(src, /Balance Lab/);
  // Prototype Zero honesty: no learning claims
  assert.doesNotMatch(src, /has learned|discovered a strategy|evolved weights|training/i);
});

// ── Real engine integration ─────────────────────────────────────

const distRuntime = 'apps/lab-web/dist/autonomy-runtime.js';
const distAvailable = existsSync(distRuntime);

test('evolution: real engine games produce valid slim records and deterministic results', { skip: !distAvailable && 'dist build not present' }, async () => {
  const { runBrowserPolicyMatch } = await import('../apps/lab-web/dist/autonomy-runtime.js');
  const agg = createSeriesAggregator();
  const games = 4;
  const firstRunRecords = [];
  for (let ordinal = 0; ordinal < games; ordinal += 1) {
    const plan = seatPlan(ordinal, true, 'score-rush', 'control');
    const seed = evolutionGameSeed(42, ordinal);
    const summary = runBrowserPolicyMatch({ seed, policyIds: plan.policyIds, profileId: DEFAULT_PROFILE_ID });
    const g = slimGameRecord(summary, ordinal, plan.swapped);
    firstRunRecords.push(g);
    ingestGameRecord(agg, g);
  }
  const m = seriesMetrics(agg, 1000);
  assert.equal(m.gamesCompleted, games);
  assert.equal(m.winsA + m.winsB + m.draws + m.unresolved, m.gamesClean);
  assert.ok(m.avgTurns !== null && m.avgTurns > 0);
  assert.ok(m.avgScoreA !== null);
  // Determinism: identical seeds + config reproduce identical records
  for (let ordinal = 0; ordinal < games; ordinal += 1) {
    const plan = seatPlan(ordinal, true, 'score-rush', 'control');
    const summary = runBrowserPolicyMatch({ seed: evolutionGameSeed(42, ordinal), policyIds: plan.policyIds, profileId: DEFAULT_PROFILE_ID });
    const g2 = slimGameRecord(summary, ordinal, plan.swapped);
    assert.deepEqual(g2, firstRunRecords[ordinal], `game ${ordinal} must be deterministic`);
  }
});

test('evolution: decision-limit aborts surface as error games, not wins', { skip: !distAvailable && 'dist build not present' }, async () => {
  const { runBrowserPolicyMatch } = await import('../apps/lab-web/dist/autonomy-runtime.js');
  const summary = runBrowserPolicyMatch({ seed: 7, policyIds: ['random-legal', 'random-legal'], decisionLimit: 5, profileId: DEFAULT_PROFILE_ID });
  const g = slimGameRecord(summary, 0, false);
  assert.equal(g.terminationReason, 'DECISION_LIMIT');
  const agg = createSeriesAggregator();
  ingestGameRecord(agg, g);
  const m = seriesMetrics(agg, 100);
  assert.equal(m.aborted, 1);
  assert.equal(m.winsA + m.winsB, 0);
  assert.equal(m.gamesClean, 0);
});
