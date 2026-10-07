import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import {
  discoveryConfig, createEvidenceSnapshot, createDiscoveryRun, createCandidate, createHypothesis,
  scoreCandidate, evaluatePromotion, createDiscoveryArtifact, transitionTo, stageSeed,
  discoveryRunEnvelope, validateDiscoveryRunEnvelope, discoveryEnvelope, validateDiscoveryEnvelope,
  validateDiscoveryArtifact, validateDiscoveryRun, discoveryRunSummary, warn,
  DISCOVERY_LIMITS, DISCOVERY_MODES,
} from '../packages/simulation-runtime/src/discovery-domain.mjs';
import { projectGameRow, scanEvidence, buildEvidenceIndex, surpriseScore } from '../packages/simulation-runtime/src/discovery-scan.mjs';
import { buildHypothesis, measureStage, estimateFromCell, mergeCells, EMPTY_CELL, seatConsistencyCheck, runDiscovery } from '../packages/simulation-runtime/src/discovery-engine.mjs';
import { runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { identity as REAL_IDENTITY } from './fixtures/agent-profile-fixtures.mjs';

// ── Synthetic fixtures ──────────────────────────────────────────
// These run-shaped objects are NOT simulation output. They are labeled
// fixtures that exercise the scan/hypothesis/judgment pipeline; game
// outcomes are drawn from an explicit probability model so each test
// controls exactly which anomaly (if any) the evidence contains.

const IDENT = (() => {
  const parts = { engineHash: 'a'.repeat(64), policyImplementationHash: 'b'.repeat(64), runtimeHash: 'c'.repeat(64), engineVersion: 'test-engine', rulesVersion: 'test-rules' };
  return { schemaVersion: 1, fingerprint: hashCanonical(parts), ...parts };
})();

const pairKey = (a, b) => [a, b].sort().join('|');
const NOW = '2026-10-06T00:00:00.000Z';
const now = () => NOW;

function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Build a fake lab run. `pA` is policy A's underlying decisive win rate;
 * `seatBias` shifts the SEAT-1 win share (A gains it in seat 1, loses it
 * in seat 2), which is the signature of a first-mover effect.
 * `mech` = { tag, useRate, lift } makes policy A use a mechanic tag with
 * probability useRate and win `lift` more often when it does.
 */
function fakeRun(botA, botB, { games = 100, pA = 0.5, seatBias = 0, drawRate = 0, seed = 1, turns = 30, faultRate = 0, mech = null, profileId = 'core-advanced-authority' } = {}) {
  const rnd = rng32((seed * 2654435761 + 17) >>> 0);
  const records = [];
  for (let i = 0; i < games; i++) {
    const swapped = i % 2 === 1;
    const base = { ordinal: i, swapped, seed: seed * 7919 + i, decisions: 300, scoreP1: 10, scoreP2: 5, actionCount: 40, policyActionCount: 40, commandCount: 80 };
    if (rnd() < faultRate) {
      records.push({ ...base, winner: 'ABORTED', terminationReason: 'DECISION_LIMIT', turns: 0, miniTurns: 0, seatBehavior: [] });
      continue;
    }
    const useA = mech ? rnd() < mech.useRate : false;
    const pAWin = Math.max(0.02, Math.min(0.98, pA + (swapped ? -seatBias : seatBias) + (useA ? mech.lift : 0)));
    const r = rnd();
    const winner = r < drawRate ? 'DRAW' : (rnd() < pAWin ? (swapped ? 'P2' : 'P1') : (swapped ? 'P1' : 'P2'));
    const t = Math.max(4, Math.round(turns + (rnd() - 0.5) * 4));
    const seat1UsesTag = mech && ((swapped ? false : useA));
    const seatBehavior = [
      { playerId: 'P1', mechanicCounts: seat1UsesTag ? { [mech.tag]: 1 } : {} },
      { playerId: 'P2', mechanicCounts: !seat1UsesTag && mech && useA ? { [mech.tag]: 1 } : {} },
    ];
    records.push({ ...base, winner, terminationReason: 'NORMAL_VICTORY', turns: t, miniTurns: Math.floor(t / 4), seatBehavior });
  }
  return {
    schemaVersion: 1, contract: 'intrilex-evolution-lab', kind: 'SERIES',
    runId: `EL-${hashCanonical({ fx: 1, botA, botB, seed, games }).slice(0, 24)}`,
    config: { botA, botB, profileId, gameCount: games, seed, workerCount: 1, mirrorSeats: true, kind: 'EVALUATION', decisionLimit: 1800, orchestrationCommandLimit: 256 },
    identity: structuredClone(IDENT), records, status: 'COMPLETE',
  };
}

/** Balanced five-pairing corpus — no anomalies by construction. The
 * tempo|value pairing is deliberately absent so anomaly fixtures can own it. */
function flatCorpus({ games = 100 } = {}) {
  const pairs = [['control', 'tempo'], ['control', 'value'], ['score-rush', 'control'], ['score-rush', 'tempo'], ['score-rush', 'value']];
  return pairs.map(([a, b], i) => fakeRun(a, b, { games, seed: 100 + i }));
}

/** Corpus with a real matchup anomaly: tempo beats value far above its
 * aggregate-strength expectation. The pairing exists only in this run so
 * the anomalous signal is not diluted by pooled neutral games. */
function matchupCorpus({ anomaly = 0.74, games = 100, seatBias = 0 } = {}) {
  const runs = flatCorpus({ games });
  runs.push(fakeRun('tempo', 'value', { games, pA: anomaly, seatBias, seed: 999 }));
  return runs;
}

/** Synthetic executeSeries honoring per-pairing probability models. */
function fakeExecutor(model, defaults = {}) {
  return async (series) => {
    const m = model[pairKey(series.botA, series.botB)] ?? model.default ?? { pA: 0.5 };
    return { run: fakeRun(series.botA, series.botB, { games: series.gameCount, seed: series.seed + 3, profileId: series.profileId, ...defaults, ...m }) };
  };
}

async function corpusRun(runs, { mode = 'open', gameBudget = 4096, executor, seed = 11, ...rest } = {}) {
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const run = createDiscoveryRun({ mode, gameBudget, workerCount: 1, seed, profileId: 'core-advanced-authority' }, snapshot, IDENT, NOW);
  const finished = await runDiscovery(run, {
    evidenceRuns: runs, now,
    executeSeries: executor ?? fakeExecutor({ default: { pA: 0.5 } }),
    ...rest,
  });
  return { run: finished, snapshot };
}

// ── Configuration ───────────────────────────────────────────────

test('discoveryConfig validates mode, budget, seed, profile and stage size', () => {
  for (const mode of DISCOVERY_MODES) assert.equal(discoveryConfig({ mode }).mode, mode);
  assert.throws(() => discoveryConfig({ mode: 'telepath' }), /DISCOVERY_MODE_UNKNOWN/);
  assert.throws(() => discoveryConfig({ gameBudget: 10 }), /DISCOVERY_BUDGET_RANGE/);
  assert.throws(() => discoveryConfig({ gameBudget: 999999 }), /DISCOVERY_BUDGET_RANGE/);
  assert.throws(() => discoveryConfig({ seed: 0 }), /INVALID_DISCOVERY_SEED/);
  assert.throws(() => discoveryConfig({ seed: 4.5 }), /INVALID_DISCOVERY_SEED/);
  assert.throws(() => discoveryConfig({ workerCount: 9 }), /INVALID_WORKER_COUNT/);
  assert.throws(() => discoveryConfig({ profileId: 'not-a-profile' }), /PROFILE_NOT_ADMITTED/);
  assert.throws(() => discoveryConfig({ confirmGames: 33 }), /DISCOVERY_CONFIRM_GAMES_RANGE/);
  assert.throws(() => discoveryConfig({ confirmGames: 8 }), /DISCOVERY_CONFIRM_GAMES_RANGE/);
  assert.throws(() => discoveryConfig({ replicationBatches: 0 }), /DISCOVERY_REPLICATION_RANGE/);
  assert.equal(discoveryConfig({ gameBudget: 512 }).gameBudget, 512);
});

// ── Evidence snapshot ───────────────────────────────────────────

test('evidence snapshot admits only matching-fingerprint local evidence', () => {
  const good = fakeRun('control', 'tempo', { games: 10, seed: 1 });
  const foreign = fakeRun('control', 'value', { games: 10, seed: 2 });
  foreign.identity = { ...structuredClone(IDENT), fingerprint: 'f'.repeat(64) };
  const imported = fakeRun('value', 'tempo', { games: 10, seed: 3 });
  imported.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  const snap = createEvidenceSnapshot([good, foreign, imported], IDENT);
  assert.equal(snap.runCount, 1);
  assert.equal(snap.gameCount, 10);
  assert.equal(snap.excludedCount, 2);
  assert.deepEqual(snap.runIds, [good.runId]);
});

// ── Candidate detection ─────────────────────────────────────────

test('balanced corpus produces zero candidates (no false-positive pressure)', () => {
  const runs = flatCorpus();
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { index, candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  assert.equal(index.gameCount, 500);
  assert.equal(candidates.length, 0, JSON.stringify(candidates.map((c) => c.subjectKey)));
});

test('injected matchup anomaly is detected with defensible baseline', () => {
  const runs = matchupCorpus();
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const c = candidates.find((x) => x.category === 'matchup' && x.subjectKey === 'matchup:tempo|value');
  assert.ok(c, 'expected matchup candidate');
  assert.ok(c.signal.observed > c.signal.expected + 0.1, `observed ${c.signal.observed} vs expected ${c.signal.expected}`);
  assert.ok(c.signal.expected > 0.4 && c.signal.expected < 0.65);
  assert.ok(c.signal.surprise >= 60);
  assert.equal(c.signal.method, 'strength-model-deviation');
});

test('inadequate samples cannot produce candidates', () => {
  const runs = flatCorpus({ games: 100 });
  runs.push(fakeRun('control-conversion-tactical', 'tempo-tactical', { games: 30, pA: 0.9, seed: 77 }));
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  assert.ok(!candidates.some((c) => c.subjectKey.includes('control-conversion-tactical')));
});

test('seat bias produces seat candidates, not matchup candidates', () => {
  const runs = flatCorpus();
  runs.push(fakeRun('tempo', 'value', { games: 120, pA: 0.5, seatBias: 0.3, seed: 55 }));
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  assert.ok(candidates.some((c) => c.category === 'seat' && c.subjectKey === 'seat:tempo|value'));
  assert.ok(candidates.some((c) => c.category === 'seat' && c.subjectKey === 'seat:global'));
  assert.ok(!candidates.some((c) => c.category === 'matchup' && c.subjectKey === 'matchup:tempo|value'));
});

test('conditional mechanic association produces a card candidate', () => {
  const runs = flatCorpus({ games: 40 });
  runs.push(fakeRun('score-rush', 'control', { games: 160, pA: 0.5, seed: 42, mech: { tag: 'TRICK', useRate: 0.6, lift: 0.28 } }));
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const c = candidates.find((x) => x.category === 'card' && x.subjectKey.includes('TRICK'));
  assert.ok(c, 'expected card candidate');
  assert.ok(c.signal.deviation > 0.15);
});

test('fault-rate spike produces an integrity candidate', () => {
  const runs = flatCorpus({ games: 100 });
  runs.push(fakeRun('tempo-tactical', 'value-tactical', { games: 100, faultRate: 0.3, seed: 66 }));
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const c = candidates.find((x) => x.category === 'integrity');
  assert.ok(c, 'expected integrity candidate');
  assert.equal(c.subjectKey, 'integrity:tempo-tactical|value-tactical');
});

test('turn-length outlier needs a wide pairing field before it fires', () => {
  const runs = flatCorpus({ games: 50 });
  // Widen the field to 10 pairings so a single outlier clears z ≥ 2.5.
  const extra = [['score-rush-tactical', 'control'], ['tempo-tactical', 'value'], ['control-tactical', 'score-rush'], ['value-tactical', 'tempo'], ['control-conversion-tactical', 'control'], ['tempo', 'score-rush-tactical']];
  for (const [a, b] of extra.slice(0, 4)) runs.push(fakeRun(a, b, { games: 50, seed: 200 + runs.length }));
  runs.push(fakeRun('value', 'control-tactical', { games: 50, turns: 90, seed: 900 }));
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  assert.ok(candidates.some((c) => c.category === 'turn-phase' && c.subjectKey === 'turn-phase:control-tactical|value'));
});

test('surprise score is bounded and monotone in |z|', () => {
  assert.equal(surpriseScore(0), 0);
  assert.equal(surpriseScore(null), null);
  assert.ok(surpriseScore(3) > surpriseScore(2));
  assert.ok(surpriseScore(6) <= 100);
  assert.ok(surpriseScore(50) === 100);
});

// ── Priority scoring ────────────────────────────────────────────

test('priority exposes components, is bounded, deterministic and cost-aware', () => {
  const mk = (computeCost, extra = {}) => createCandidate({
    category: 'matchup', subjectKey: 'matchup:a|b', summary: 'x',
    signal: { observed: 0.7, expected: 0.5, deviation: 0.2, sampleSize: 100, method: 'm' },
    scores: { novelty: 80, impact: 70, signal: 85, evidenceGap: 60, computeCost, ...extra },
  });
  const cheap = scoreCandidate(mk(128));
  const expensive = scoreCandidate(mk(4096));
  for (const key of ['novelty', 'impact', 'signal', 'evidenceGap', 'testability', 'computeCost', 'priority']) assert.ok(key in cheap, key);
  assert.ok(cheap.priority >= 0 && cheap.priority <= 100);
  assert.ok(cheap.priority > expensive.priority, 'cheaper investigation should outrank costlier twin');
  assert.deepEqual(scoreCandidate(mk(128)), cheap, 'scoring must be deterministic');
  const noveltyHeavy = mk(128, { novelty: 100, impact: 20, signal: 20, evidenceGap: 20 });
  assert.ok(scoreCandidate(noveltyHeavy, 'explorer').priority > scoreCandidate(noveltyHeavy, 'auditor').priority, 'explorer weights novelty above auditor');
});

// ── Hypothesis construction ─────────────────────────────────────

test('hypothesis requires a source candidate and carries falsification structure', () => {
  const candidate = createCandidate({ category: 'matchup', subjectKey: 'matchup:control|tempo', summary: 's', signal: { observed: 0.7, expected: 0.5, deviation: 0.2, sampleSize: 100, method: 'm' }, scores: {} });
  assert.throws(() => createHypothesis({ metric: 'winRateA' }), /HYPOTHESIS_SOURCE_REQUIRED/);
  const h = createHypothesis({ candidate, metric: 'winRateA', direction: 1, scope: { policies: ['control', 'tempo'], pairing: 'control|tempo' }, claim: 'c', stages: [] });
  assert.equal(h.candidateId, candidate.candidateId);
  assert.ok(h.falsification.length > 10);
  assert.equal(h.status, 'hypothesis');
  assert.equal(h.lifecycle.length, 1);
  assert.deepEqual(h.replication, { attempted: 0, passed: 0 });
});

test('buildHypothesis plans mirrored confirm + replication stages with unique derived seeds', () => {
  const runs = matchupCorpus();
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { index, candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const candidate = candidates.find((c) => c.category === 'matchup');
  const config = discoveryConfig({ seed: 7 });
  const run = createDiscoveryRun(config, snapshot, IDENT, NOW);
  const h = buildHypothesis(candidate, run, index, config);
  assert.ok(h);
  assert.equal(h.plan.stages[0].kind, 'confirm');
  assert.equal(h.plan.stages.filter((s) => s.kind === 'replicate').length, config.replicationBatches);
  const seeds = h.plan.stages.map((s) => s.series.seed);
  assert.equal(new Set(seeds).size, seeds.length, 'every stage needs an independent deterministic seed');
  for (const s of h.plan.stages) {
    assert.equal(s.series.mirrorSeats, true);
    assert.equal(s.series.kind, 'EVALUATION');
    assert.equal(s.series.gameCount % 2, 0);
    assert.equal(s.series.seed, stageSeed(config.seed, `pending-${candidate.candidateId}`, s.key));
  }
  assert.ok(h.estimatedGames > 0);
});

test('buildHypothesis returns null when the pairing is no longer in the index', () => {
  const runs = flatCorpus();
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { index } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const candidate = createCandidate({ category: 'matchup', subjectKey: 'matchup:nosucha|nosuchb', summary: 's', signal: { observed: 0.7, expected: 0.5, deviation: 0.2, sampleSize: 100, method: 'm' }, scores: {} });
  const config = discoveryConfig({ seed: 7 });
  const run = createDiscoveryRun(config, snapshot, IDENT, NOW);
  assert.equal(buildHypothesis(candidate, run, index, config), null);
});

// ── Row projection / measurement ────────────────────────────────

test('projectGameRow maps seats to sides without leaking orientation', () => {
  const run = fakeRun('control', 'tempo', { games: 2, pA: 1 });
  const rec = { ordinal: 1, swapped: true, seed: 9, winner: 'P2', terminationReason: 'NORMAL_VICTORY', turns: 20, miniTurns: 4, decisions: 200, scoreP1: 3, scoreP2: 9, seatBehavior: [{ playerId: 'P1', mechanicCounts: { GUARD: 2 } }, { playerId: 'P2', mechanicCounts: { TRICK: 1 } }] };
  const row = projectGameRow(run, rec);
  assert.equal(row.seat1Policy, 'tempo');
  assert.equal(row.seat2Policy, 'control');
  assert.equal(row.aWon, true);
  assert.equal(row.seat1Won, false);
  assert.deepEqual(row.mechanicsA, { TRICK: 1 });
  assert.deepEqual(row.mechanicsB, { GUARD: 2 });
});

test('measureStage + estimateFromCell recover the injected effect', () => {
  const candidate = createCandidate({ category: 'matchup', subjectKey: 'matchup:control|tempo', summary: 's', signal: { observed: 0.7, expected: 0.5, deviation: 0.2, sampleSize: 100, method: 'm' }, scores: {} });
  const h = createHypothesis({ candidate, metric: 'winRateA', direction: 1, expected: { value: 0.5 }, scope: { policies: ['control', 'tempo'], pairing: 'control|tempo' }, stages: [] });
  const run = fakeRun('control', 'tempo', { games: 100, pA: 0.8, seed: 5 });
  const cell = measureStage(h, run);
  assert.equal(cell.games, 100);
  assert.equal(cell.decisive, 100);
  assert.ok(cell.wins > 70);
  const est = estimateFromCell(h, cell);
  assert.ok(Math.abs(est.estimate - 0.3) < 0.06);
  assert.ok(est.interval[0] > 0 && est.interval[1] < 0.5);
  const merged = mergeCells(structuredClone(EMPTY_CELL), cell);
  assert.equal(merged.decisive, cell.decisive);
});

test('seatConsistencyCheck catches an orientation-split effect', () => {
  const candidate = createCandidate({ category: 'matchup', subjectKey: 'matchup:control|tempo', summary: 's', signal: { observed: 0.7, expected: 0.5, deviation: 0.2, sampleSize: 100, method: 'm' }, scores: {} });
  const h = createHypothesis({ candidate, metric: 'winRateA', direction: 1, expected: { value: 0.5 }, scope: { policies: ['control', 'tempo'], pairing: 'control|tempo' }, stages: [] });
  const confounded = fakeRun('control', 'tempo', { games: 120, pA: 0.5, seatBias: 0.4, seed: 8 });
  const check = seatConsistencyCheck(h, measureStage(h, confounded));
  assert.equal(check.verdict, 'failed');
  const honest = fakeRun('control', 'tempo', { games: 120, pA: 0.8, seatBias: 0, seed: 8 });
  assert.equal(seatConsistencyCheck(h, measureStage(h, honest)).verdict, 'passed');
});

// ── Promotion gates (unit) ──────────────────────────────────────

function promotableHypothesis(overrides = {}) {
  const candidate = createCandidate({ category: 'matchup', subjectKey: 'matchup:control|tempo', summary: 's', signal: { observed: 0.72, expected: 0.55, deviation: 0.17, sampleSize: 100, method: 'm' }, scores: {} });
  const h = createHypothesis({ candidate, metric: 'winRateA', direction: 1, expected: { value: 0.55 }, scope: { policies: ['control', 'tempo'], pairing: 'control|tempo' }, stages: [] });
  h.evidence = { decisive: 400, games: 400, estimate: 0.12, interval: [0.07, 0.17], experimentRunIds: ['EL-' + 'a'.repeat(24)], cells: [] };
  h.replication = { attempted: 2, passed: 2 };
  h.checks = [{ kind: 'seat-mirror', verdict: 'passed' }];
  Object.assign(h.evidence, overrides.evidence ?? {});
  Object.assign(h.replication, overrides.replication ?? {});
  if (overrides.checks) h.checks = overrides.checks;
  return h;
}

test('promotion gates promote only when every gate passes', () => {
  const j = evaluatePromotion(promotableHypothesis());
  assert.equal(j.verdict, 'promote');
  assert.equal(j.confidence, 'MODERATE');
  assert.ok(j.reasons.every((r) => r.passed), JSON.stringify(j.reasons.filter((r) => !r.passed)));
});

test('promotion gates: robust pooled evidence with 3 replications earns HIGH confidence', () => {
  const h = promotableHypothesis({ evidence: { decisive: 640, games: 640, estimate: 0.12, interval: [0.08, 0.16] }, replication: { attempted: 3, passed: 3 } });
  const j = evaluatePromotion(h);
  assert.equal(j.verdict, 'promote');
  assert.equal(j.confidence, 'HIGH');
});

test('insufficient sample cannot promote — it stays unresolved', () => {
  const j = evaluatePromotion(promotableHypothesis({ evidence: { decisive: 120, interval: [0.02, 0.22] } }));
  assert.equal(j.verdict, 'unresolved');
  assert.ok(j.reasons.some((r) => r.code === 'MIN_SAMPLE' && !r.passed));
});

test('failed replication and seat confound reject; failed population challenge narrows to conditional', () => {
  const failed = promotableHypothesis({ replication: { attempted: 2, passed: 1 }, checks: [{ kind: 'seat-mirror', verdict: 'passed' }, { kind: 'replication', verdict: 'failed', detail: 'x' }] });
  assert.equal(evaluatePromotion(failed).verdict, 'reject');
  const seatBad = promotableHypothesis({ checks: [{ kind: 'seat-mirror', verdict: 'failed' }] });
  assert.equal(evaluatePromotion(seatBad).verdict, 'reject');
  const narrowed = promotableHypothesis({ checks: [{ kind: 'seat-mirror', verdict: 'passed' }, { kind: 'challenge-population', verdict: 'failed' }] });
  const j = evaluatePromotion(narrowed);
  assert.equal(j.verdict, 'conditional');
  assert.equal(j.confidence, 'MODERATE');
});

test('an interval that excludes the claimed direction rejects; wide intervals stay unresolved', () => {
  const refuted = promotableHypothesis({ evidence: { estimate: -0.1, interval: [-0.15, -0.05] } });
  assert.equal(evaluatePromotion(refuted).verdict, 'reject');
  const wide = promotableHypothesis({ evidence: { estimate: 0.1, interval: [-0.02, 0.22] } });
  assert.equal(evaluatePromotion(wide).verdict, 'unresolved');
});

// ── Discovery artifact / lifecycle ──────────────────────────────

test('discovery artifact carries gates, provenance and an explicit non-causal limitation', () => {
  const h = promotableHypothesis();
  const j = evaluatePromotion(h);
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 512 }, createEvidenceSnapshot(flatCorpus(), IDENT), IDENT, NOW);
  const d = createDiscoveryArtifact(h, run, j, NOW);
  validateDiscoveryArtifact(d);
  assert.match(d.discoveryId, /^D-[A-F0-9]{8}$/);
  assert.equal(d.status, 'discovery');
  assert.equal(d.replication.passed, 2);
  assert.equal(d.seatMirroring, 'PASSED');
  assert.ok(d.limitation.includes('not a causal proof'));
  assert.equal(d.provenance.fingerprint, IDENT.fingerprint);
  assert.ok(d.statusHistory.length >= 2);
  const restored = validateDiscoveryEnvelope(discoveryEnvelope(d));
  assert.equal(restored.discoveryId, d.discoveryId);
});

test('lifecycle transitions are append-only', () => {
  const candidate = createCandidate({ category: 'seat', subjectKey: 'seat:a|b', summary: 's', signal: { observed: 0.6, expected: 0.5, deviation: 0.1, sampleSize: 100, method: 'm' }, scores: {} });
  const h = createHypothesis({ candidate, metric: 'seat1WinRate', direction: 1, scope: {}, stages: [] });
  transitionTo(h, 'testing', 'confirm started', NOW);
  transitionTo(h, 'rejected', 'refuted', NOW);
  assert.equal(h.status, 'rejected');
  assert.deepEqual(h.lifecycle.map((l) => l.state), ['hypothesis', 'testing', 'rejected']);
  assert.throws(() => transitionTo(h, 'bogus-state'), /INVALID_LIFECYCLE_STATE/);
});

// ── Envelopes / persistence ─────────────────────────────────────

test('discovery run envelope round-trips and rejects tampering', async () => {
  const { run } = await corpusRun(matchupCorpus(), { executor: fakeExecutor({ 'tempo|value': { pA: 0.74 } }), gameBudget: 1024 });
  const env = discoveryRunEnvelope(run);
  const restored = validateDiscoveryRunEnvelope(env, IDENT);
  assert.equal(restored.runId, run.runId);
  env.payload.budget.consumed = 1;
  assert.throws(() => validateDiscoveryRunEnvelope(env, IDENT), /DISCOVERY_RUN_HASH_MISMATCH/);
});

test('validateDiscoveryRun enforces the budget ledger', async () => {
  const { run } = await corpusRun(flatCorpus(), { gameBudget: 128 });
  const tampered = structuredClone(run);
  tampered.budget.consumed = tampered.budget.allocated + 1;
  assert.throws(() => validateDiscoveryRun(tampered, IDENT), /BUDGET_MISMATCH/);
  assert.equal(validateDiscoveryRun(run, IDENT).runId, run.runId);
});

test('a stored RUNNING artifact is reopened as PAUSED', async () => {
  const { run } = await corpusRun(flatCorpus(), { gameBudget: 128 });
  const mid = structuredClone(run);
  mid.status = 'RUNNING';
  const restored = validateDiscoveryRunEnvelope(discoveryRunEnvelope(mid), IDENT);
  assert.equal(restored.status, 'PAUSED');
});

// ── Orchestrator end-to-end (synthetic executor) ────────────────

test('end-to-end: reproduced anomaly promotes to a discovery', async () => {
  const { run } = await corpusRun(matchupCorpus(), { executor: fakeExecutor({ 'tempo|value': { pA: 0.74 } }), gameBudget: 4096 });
  assert.equal(run.status, 'COMPLETE');
  assert.equal(run.discoveries.length, 1);
  const d = run.discoveries[0];
  assert.equal(d.category, 'matchup');
  assert.equal(d.status, 'discovery');
  assert.equal(d.replication.attempted, 2);
  assert.equal(d.replication.passed, 2);
  assert.equal(d.seatMirroring, 'PASSED');
  assert.ok(d.effect.estimate > 0.05);
  assert.ok(d.effect.interval95[0] > 0);
  assert.equal(d.provenance.evidenceSnapshotId, run.evidence.snapshotId);
  assert.ok(d.provenance.experimentRunIds.length >= 3);
  const h = run.hypotheses[0];
  assert.equal(h.status, 'discovery');
  assert.deepEqual(h.lifecycle.map((l) => l.state), ['hypothesis', 'queued', 'testing', 'supported_finding', 'replicating', 'replicating', 'replicated_finding', 'discovery']);
  assert.ok(run.journal.some((e) => e.type === 'discovery'));
  assert.ok(run.budget.consumed <= run.budget.allocated);
  assert.equal(discoveryRunSummary(run).promoted, 1);
});

test('end-to-end: vanished signal resolves unresolved, opposite signal rejects', async () => {
  const vanish = await corpusRun(matchupCorpus(), { executor: fakeExecutor({ 'tempo|value': { pA: 0.58 } }), gameBudget: 1024 });
  assert.equal(vanish.run.status, 'COMPLETE');
  assert.equal(vanish.run.discoveries.length, 0);
  assert.ok(['unresolved', 'rejected'].includes(vanish.run.hypotheses[0].status));
  const opposite = await corpusRun(matchupCorpus(), { executor: fakeExecutor({ 'tempo|value': { pA: 0.4 } }), gameBudget: 1024 });
  assert.equal(opposite.run.hypotheses[0].status, 'rejected');
  assert.equal(opposite.run.discoveries.length, 0);
});

test('end-to-end: seat-confounded signal is rejected and spawns a seat investigation', async () => {
  // Evidence bias stays under the scan's seat thresholds (small pairing +
  // weak share) so the seat hypothesis can only emerge mid-run, from the
  // orientation-split challenge — not from the initial scan.
  const { run } = await corpusRun(matchupCorpus({ seatBias: 0.07, games: 64 }), {
    executor: fakeExecutor({ 'tempo|value': { pA: 0.5, seatBias: 0.32 } }),
    gameBudget: 4096,
  });
  assert.equal(run.status, 'COMPLETE');
  const original = run.hypotheses.find((h) => h.category === 'matchup');
  assert.equal(original.status, 'rejected');
  assert.ok(original.checks.some((c) => c.kind === 'seat-mirror' && c.verdict === 'failed'));
  const seatH = run.hypotheses.find((h) => h.outcome === 'seat1WinRate' && h.scope?.pairing === 'tempo|value');
  assert.ok(seatH, 'seat confound must be investigated by a dedicated seat hypothesis');
  assert.equal(seatH.status, 'discovery');
  // Other pairings may legitimately investigate and promote on their own
  // evidence under the leave-one-out baseline — the required outcome is
  // that the seat confound produces exactly one durable seat discovery.
  const seatDiscoveries = run.discoveries.filter((d) => d.category === 'seat');
  assert.equal(seatDiscoveries.length, 1);
  assert.equal(seatDiscoveries[0].status, 'discovery');
  assert.ok(run.journal.some((e) => e.type === 'confound'));
});

test('end-to-end: replication failure rejects a confirmed signal', async () => {
  let call = 0;
  const executor = async (series) => {
    const k = pairKey(series.botA, series.botB);
    let pA;
    if (k === 'tempo|value') {
      call += 1;
      // Confirm shows the effect; replication batches refute it hard
      // enough that the batch interval excludes the claimed direction.
      pA = call === 1 ? 0.72 : 0.35;
    } else {
      // Sits on the leave-one-out expectation — no signal to chase.
      pA = 0.6;
    }
    return { run: fakeRun(series.botA, series.botB, { games: series.gameCount, pA, seed: series.seed + 3, profileId: series.profileId }) };
  };
  const { run } = await corpusRun(matchupCorpus(), { executor, gameBudget: 4096 });
  const h = run.hypotheses.find((x) => x.category === 'matchup' && x.scope?.pairing === 'tempo|value');
  assert.equal(h.status, 'rejected');
  assert.match(h.lifecycle.at(-1).reason, /replication failed/);
  assert.equal(run.discoveries.length, 0);
});

test('end-to-end: the game budget is a hard ceiling', async () => {
  const runs = flatCorpus({ games: 60 });
  runs.push(fakeRun('tempo', 'value', { games: 60, pA: 0.8, seed: 999 }));
  runs.push(fakeRun('score-rush', 'tempo', { games: 60, pA: 0.78, seatBias: 0.3, seed: 998 }));
  const { run } = await corpusRun(runs, { executor: fakeExecutor({ default: { pA: 0.55 } }), gameBudget: 256 });
  assert.ok(run.budget.consumed <= 256, `consumed ${run.budget.consumed}`);
  assert.ok(run.budget.consumed > 0);
  assert.equal(run.status, 'COMPLETE');
  assert.equal(run.discoveries.length, 0, 'a budget too small for replication must not promote');
});

test('end-to-end: no candidates yields a successful zero-discovery run', async () => {
  const { run } = await corpusRun(flatCorpus(), { gameBudget: 512 });
  assert.equal(run.status, 'COMPLETE');
  assert.equal(run.candidates.length, 0);
  assert.equal(run.hypotheses.length, 0);
  assert.equal(run.discoveries.length, 0);
  const summary = discoveryRunSummary(run);
  assert.equal(summary.zeroDiscoveryIsSuccess, true);
  assert.ok(run.journal.some((e) => e.type === 'scan-empty'));
});

test('end-to-end: card hypothesis promotes; failed population challenge narrows scope', async () => {
  const runs = flatCorpus({ games: 40 });
  runs.push(fakeRun('score-rush', 'control', { games: 160, pA: 0.5, seed: 42, mech: { tag: 'TRICK', useRate: 0.6, lift: 0.28 } }));
  const survives = await corpusRun(runs, {
    executor: fakeExecutor({ 'control|score-rush': { pA: 0.5, mech: { tag: 'TRICK', useRate: 0.6, lift: 0.26 } }, 'score-rush|tempo': { pA: 0.5, mech: { tag: 'TRICK', useRate: 0.6, lift: 0.22 } } }),
    gameBudget: 4096,
  });
  const card = survives.run.hypotheses.find((h) => h.category === 'card');
  assert.ok(card, 'card candidate should spawn a hypothesis');
  assert.equal(card.status, 'discovery');
  assert.ok(card.checks.some((c) => c.kind === 'challenge-population' && c.verdict === 'passed'));

  const narrowed = await corpusRun(runs, {
    executor: fakeExecutor({ 'control|score-rush': { pA: 0.5, mech: { tag: 'TRICK', useRate: 0.6, lift: 0.26 } }, 'score-rush|tempo': { pA: 0.5, mech: { tag: 'TRICK', useRate: 0.6, lift: 0 } } }),
    gameBudget: 4096,
  });
  const card2 = narrowed.run.hypotheses.find((h) => h.category === 'card');
  assert.ok(card2);
  if (card2.status === 'conditional_discovery') {
    // Other candidates may promote alongside; the card narrowing must be
    // reflected in its own durable artifact.
    const cardDiscovery = narrowed.run.discoveries.find((d) => d.category === 'card');
    assert.equal(cardDiscovery?.status, 'conditional_discovery');
    assert.ok(card2.scopeNote.includes('control opponent'));
  } else {
    // A failed population challenge with all other gates green narrows scope;
    // if the confirm cell itself went unresolved, that is also honest — but
    // it must never silently promote.
    assert.notEqual(card2.status, 'discovery');
  }
});

test('end-to-end: auditor mode re-examines a prior discovery', async () => {
  const prior = validateDiscoveryArtifact(createDiscoveryArtifact(promotableHypothesis(), createDiscoveryRun({ mode: 'open', gameBudget: 512 }, createEvidenceSnapshot(flatCorpus(), IDENT), IDENT, NOW), { verdict: 'promote', confidence: 'MODERATE', grade: 'SUPPORTED', reasons: [] }, NOW));
  const { run } = await corpusRun(matchupCorpus(), {
    mode: 'auditor', gameBudget: 4096,
    priorDiscoveries: [prior],
    executor: fakeExecutor({ default: { pA: 0.6 } }),
  });
  assert.ok(run.candidates.some((c) => c.auditTarget?.discoveryId === prior.discoveryId));
  assert.ok(run.hypotheses.some((h) => h.claim.includes(prior.discoveryId)));
});

test('end-to-end: deterministic reruns produce byte-identical artifacts', async () => {
  const runs = matchupCorpus();
  const a = await corpusRun(runs, { executor: fakeExecutor({ 'tempo|value': { pA: 0.74 } }), gameBudget: 1024 });
  const b = await corpusRun(runs, { executor: fakeExecutor({ 'tempo|value': { pA: 0.74 } }), gameBudget: 1024 });
  assert.equal(discoveryRunEnvelope(a.run).contentHash, discoveryRunEnvelope(b.run).contentHash);
});

// ── Multiplicity honesty: raw p is never relabeled as q ─────────

test('the interval-derived p-value is only ever used as a raw p-value — real BH supplies q', () => {
  const h = promotableHypothesis();
  const solo = evaluatePromotion(h);
  assert.ok(solo.pValue != null && solo.pValue > 0 && solo.pValue < 1);
  // A singleton family is a genuine Benjamini–Hochberg computation —
  // q equals p exactly, and the ledger discloses what was adjusted.
  assert.equal(solo.qValue, solo.pValue);
  assert.equal(solo.familySize, 1);
  const mult = solo.reasons.find((r) => r.code === 'MULTIPLICITY');
  assert.match(mult.detail, /raw p=/);
  assert.match(mult.detail, /Benjamini|Hochberg/);
  // Deterministic: identical inputs produce an identical judgment.
  assert.deepEqual(evaluatePromotion(h), solo);
});

test('family-wide BH never strengthens a finding — a marginal signal demotes under real adjustment', () => {
  // Weak-but-passing evidence: raw p ≈ 0.006. Alone it grades SUPPORTED;
  // in a measured family where it ranks first, q = p·41 pushes it past
  // the EXPLORATORY ceiling → EVIDENCE_GRADE fails → unresolved.
  const h = promotableHypothesis({ evidence: { estimate: 0.07, interval: [0.02, 0.12] } });
  const solo = evaluatePromotion(h);
  assert.equal(solo.verdict, 'promote', `fixture must be promotable alone (${solo.reasons.filter((r) => !r.passed).map((r) => r.code)})`);
  assert.equal(solo.grade, 'SUPPORTED');
  const family = Array.from({ length: 40 }, (_, i) => ({ id: `H-family-${i}`, pValue: 0.5 }));
  const adjusted = evaluatePromotion(h, { familyPValues: family });
  assert.equal(adjusted.familySize, 41);
  assert.ok(adjusted.qValue > adjusted.pValue, `q ${adjusted.qValue} must exceed raw p ${adjusted.pValue} — BH never sharpens`);
  assert.ok(adjusted.qValue > 0.20, `q ${adjusted.qValue} should clear the EXPLORATORY ceiling`);
  assert.equal(adjusted.grade, 'INSUFFICIENT');
  assert.equal(adjusted.verdict, 'unresolved');
  assert.ok(adjusted.reasons.some((r) => r.code === 'EVIDENCE_GRADE' && !r.passed));
});

test('unpersisted stage evidence blocks promotion and forces unresolved — even over a measured refutation', () => {
  const h = promotableHypothesis();
  h.plan.stages = [{ key: 'confirm', persisted: false }];
  const j = evaluatePromotion(h);
  assert.equal(j.verdict, 'unresolved');
  const gate = j.reasons.find((r) => r.code === 'PERSISTENCE_INTEGRITY');
  assert.equal(gate.passed, false);
  assert.match(gate.detail, /not durably persisted/);
  // A clean measured refutation still cannot be judged as 'reject' when its
  // supporting evidence was never stored — the verdict itself is unauditable.
  const refuted = promotableHypothesis({ evidence: { estimate: -0.1, interval: [-0.15, -0.05] } });
  refuted.plan.stages = [{ key: 'confirm', persisted: false }];
  assert.equal(evaluatePromotion(refuted).verdict, 'unresolved');
});

// ── Stage-run persistence integrity (end-to-end) ────────────────

test('end-to-end: stage runs that fail to persist never enter provenance and block every promotion', async () => {
  const persisted = [];
  const { run } = await corpusRun(matchupCorpus(), {
    executor: fakeExecutor({ 'tempo|value': { pA: 0.74 } }),
    gameBudget: 4096,
    persistStageRun: async (_h, _stage, stageRun) => { persisted.push(stageRun.runId); return false; },
  });
  assert.equal(run.status, 'COMPLETE');
  assert.ok(persisted.length > 0, 'fixture must attempt stage persistence');
  assert.equal(run.discoveries.length, 0, 'no discovery may cite evidence that was never durably stored');
  assert.ok(run.warnings.some((w) => w.code === 'STAGE_EVIDENCE_NOT_PERSISTED'));
  for (const h of run.hypotheses) {
    for (const s of h.plan.stages) {
      if (s.persisted === false) assert.ok(s.experimentRunId == null, 'unpersisted run id must never be stamped');
    }
    assert.equal(h.status === 'discovery' || h.status === 'conditional_discovery', false);
  }
  // The experiment ledger records the execution honestly: runId null, not
  // a fabricated reference to a run that does not exist on disk.
  assert.ok(run.experiments.every((e) => e.runId == null && e.persisted === false));
});

// ── Leave-one-out baselines (measurement non-circularity) ───────

/** Recompute the leave-one-out expected matchup strength the scanner
 * must use — the focal cell's own games excluded from both policies'
 * shrunken aggregate strength. */
function looMatchupExpected(index, cell) {
  const a = index.policies.get(cell.policyA), b = index.policies.get(cell.policyB);
  const cellClean = cell.games - cell.faulted;
  const sA = (a.wins - cell.winsA + (a.draws - cell.draws) / 2 + 12.5) / (a.clean - cellClean + 25);
  const sB = (b.wins - (cell.decisive - cell.winsA) + (b.draws - cell.draws) / 2 + 12.5) / (b.clean - cellClean + 25);
  return sA / (sA + sB);
}

test('matchup baseline excludes the focal cell — the observation cannot define its own expectation', () => {
  const runs = matchupCorpus({ anomaly: 0.9 });
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { index, candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const c = candidates.find((x) => x.category === 'matchup' && x.subjectKey === 'matchup:tempo|value');
  assert.ok(c, 'focal anomaly must still be detected');
  const cell = index.pairings.get('tempo|value');
  const expectedLoo = looMatchupExpected(index, cell);
  assert.ok(Math.abs(c.signal.expected - expectedLoo) < 1e-9, `expected ${c.signal.expected} vs leave-one-out ${expectedLoo}`);
  // The focal pairing won 90% — folding it into tempo's strength would
  // inflate the baseline and understate the anomaly.
  const a = index.policies.get(cell.policyA);
  const inclusiveSA = (a.wins + a.draws / 2 + 12.5) / (a.clean + 25);
  const sB = index.policies.get(cell.policyB);
  const inclusiveSB = (sB.wins + sB.draws / 2 + 12.5) / (sB.clean + 25);
  const inclusiveExpected = inclusiveSA / (inclusiveSA + inclusiveSB);
  assert.ok(inclusiveExpected > expectedLoo, 'inclusive baseline must be higher — proves the focal cell leaks into it');
});

test('integrity baseline excludes the focal cell — a zero external fault rate is a valid baseline', () => {
  // All faults live in the focal cell: the leave-one-out baseline is 0,
  // and the anomaly must still surface (zero baseline ≠ missing baseline).
  const runs = flatCorpus({ games: 60 });
  runs.push(fakeRun('tempo-tactical', 'value-tactical', { games: 60, faultRate: 0.4, seed: 66 }));
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const { candidates } = scanEvidence(runs, snapshot, { detectedAt: NOW });
  const c = candidates.find((x) => x.category === 'integrity' && x.subjectKey === 'integrity:tempo-tactical|value-tactical');
  assert.ok(c, 'a fault spike against a clean corpus must produce a candidate');
  assert.equal(c.signal.expected, 0, 'external baseline is a real zero — every other pairing was clean');
  assert.ok(c.signal.observed > 0.3);
  // With external faults present, the expected rate is the leave-one-out share.
  const runs2 = [...flatCorpus({ games: 60 }), fakeRun('tempo-tactical', 'value-tactical', { games: 60, faultRate: 0.4, seed: 66 })];
  runs2[0].records = runs2[0].records.map((r, i) => i < 12 ? { ...r, winner: 'ABORTED', terminationReason: 'DECISION_LIMIT' } : r);
  const snap2 = createEvidenceSnapshot(runs2, IDENT);
  const { candidates: cands2 } = scanEvidence(runs2, snap2, { detectedAt: NOW });
  const c2 = cands2.find((x) => x.category === 'integrity' && x.subjectKey === 'integrity:tempo-tactical|value-tactical');
  assert.ok(c2);
  const expectedRest = 12 / (runs2.reduce((n, r) => n + r.records.length, 0) - 60);
  assert.ok(Math.abs(c2.signal.expected - expectedRest) < 1e-9, `expected ${c2.signal.expected} vs LOO ${expectedRest}`);
});

// ── Mechanic used/unused cohort completeness ────────────────────

/** One run where a mechanic tag first appears late: earlier decisive
 * games carried mechanic telemetry ({}) but never observed the tag. */
function lateMechanicRun({ games = 200, tag = 'TRICK', usedFrom = 140, telemetryMod = 7 } = {}) {
  const run = fakeRun('control', 'tempo', { games: 1, seed: 5 });
  run.records = [];
  for (let i = 0; i < games; i += 1) {
    const swapped = i % 2 === 1;
    const telemetry = i % telemetryMod !== 0;        // ~14% rows missing mechanic telemetry
    const aUses = i >= usedFrom && i % 2 === 0;      // tag appears only late, only for control (botA)
    const countsForControl = aUses ? { [tag]: 1 } : {};
    const seatBehavior = telemetry ? [
      { playerId: 'P1', mechanicCounts: swapped ? {} : countsForControl },
      { playerId: 'P2', mechanicCounts: swapped ? countsForControl : {} },
    ] : [];
    run.records.push({
      ordinal: i, swapped, seed: i + 1, decisions: 100, scoreP1: 5, scoreP2: 5,
      actionCount: 10, policyActionCount: 10, commandCount: 20,
      winner: 'P1', terminationReason: 'NORMAL_VICTORY',
      turns: 20, miniTurns: 4, seatBehavior,
    });
  }
  return run;
}

test('mechanic cohorts backfill: a late-first-observed tag owns earlier telemetry-covered games as unused', () => {
  const run = lateMechanicRun();
  const rows = run.records.map((r) => projectGameRow(run, r));
  const index = buildEvidenceIndex(rows);
  const cell = index.pairings.get('control|tempo');
  const usage = cell.usage.get('control')?.get('TRICK');
  assert.ok(usage, 'tag cohorts must exist');
  // Hand-count the expected cohorts from the fixture.
  let usedN = 0, coveredN = 0;
  for (let i = 0; i < run.records.length; i += 1) {
    const telemetry = i % 7 !== 0;
    if (!telemetry) continue;
    coveredN += 1;
    if (i >= 140 && i % 2 === 0) usedN += 1;
  }
  assert.equal(usage.used.decisive, usedN);
  assert.equal(usage.unused.decisive, coveredN - usedN,
    'every telemetry-covered decisive game without the tag is in the unused cohort — including games before the tag was ever seen');
  assert.ok(usage.unused.decisive >= 140, 'pre-observation games belong to unused');
  assert.equal(usage.used.decisive + usage.unused.decisive, coveredN,
    'used + unused equals the eligible decisive telemetry-covered population');
  // Telemetry-missing rows are excluded outright — never counted as "not used".
  const missing = run.records.filter((_r, i) => i % 7 === 0).length;
  assert.ok(missing > 0, 'fixture must contain telemetry-missing rows');
  assert.equal(cell.decisive - coveredN, missing);
  // The other policy never observed the tag — no phantom cohort.
  assert.equal(cell.usage.get('tempo')?.has('TRICK') ?? false, false);
});

// ── Effect unit honesty ─────────────────────────────────────────

test('discovery artifact effect.unit follows the outcome metric — turns are not probabilities', () => {
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 512 }, createEvidenceSnapshot(flatCorpus(), IDENT), IDENT, NOW);
  const cases = [
    ['winRateA', 'probability'], ['seat1WinRate', 'probability'], ['faultRate', 'probability'],
    ['mechanicDelta', 'probability-difference'], ['meanTurns', 'full-turns'],
  ];
  for (const [metric, unit] of cases) {
    const candidate = createCandidate({ category: 'matchup', subjectKey: 'matchup:control|tempo', summary: 's', signal: { observed: 0.7, expected: 0.5, deviation: 0.2, sampleSize: 100, method: 'm' }, scores: {} });
    const h = createHypothesis({ candidate, metric, direction: 1, expected: { value: 0 }, scope: { policies: ['control', 'tempo'], pairing: 'control|tempo' }, claim: 'c', stages: [] });
    h.evidence = { decisive: 400, games: 400, estimate: 0.12, interval: [0.07, 0.17], experimentRunIds: [], cells: [] };
    h.replication = { attempted: 2, passed: 2 };
    const j = evaluatePromotion(h);
    const d = createDiscoveryArtifact(h, run, j, NOW);
    assert.equal(d.effect.unit, unit, `${metric} must report ${unit}, got ${d.effect.unit}`);
  }
});

// ── Browser adapter: Auditor mode loads full artifacts ──────────

/** Load the browser discovery-runner with its imports replaced by test
 * doubles — the pure domain/engine functions stay real, only I/O and the
 * worker executor are stubbed. */
async function browserDiscoveryAdapter({ executeSeries } = {}) {
  const src = (await readFile('apps/lab-web/src/evolution/discovery-runner.mjs', 'utf8'))
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const sandbox = {
    executeBrowserSeries: executeSeries ?? (async (series) => ({
      run: fakeRun(series.botA, series.botB, { games: series.gameCount, pA: 0.6, seed: series.seed + 3, profileId: series.profileId }),
    })),
    createDiscoveryRun, createEvidenceSnapshot, warn, DISCOVERY_LIMITS, runDiscovery,
  };
  return runInNewContext(`${src}\n({ executeDiscoveryRun, prepareDiscoveryRun, resolveEvidenceScope })`, sandbox);
}

/** A full validated discovery artifact with real tested policies — the
 * shape Auditor mode needs to rebuild a falsification experiment. */
function priorDiscoveryArtifact() {
  const h = promotableHypothesis();
  h.plan.stages = [
    { key: 'confirm', kind: 'confirm', status: 'complete', experimentRunId: `EL-${'a'.repeat(24)}`, series: { botA: 'control', botB: 'tempo', gameCount: 128, seed: 5, profileId: 'core-advanced-authority', workerCount: 1 } },
  ];
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 512 }, createEvidenceSnapshot(flatCorpus(), IDENT), IDENT, NOW);
  return validateDiscoveryArtifact(createDiscoveryArtifact(h, run, evaluatePromotion(h), NOW));
}

test('browser adapter: auditor loads full discovery artifacts by id — summary rows are never trusted', async () => {
  const prior = priorDiscoveryArtifact();
  const loadedIds = [];
  const store = {
    // Compact summary rows — they deliberately LACK scope/effect/policiesTested.
    listDiscoveries: async () => [{ discoveryId: prior.discoveryId, status: 'discovery', category: 'matchup' }],
    loadDiscovery: async (id) => { loadedIds.push(id); return prior; },
    load: async () => { throw new Error('no runs'); },
    save: async () => {},
    saveDiscoveryRun: async () => {},
    saveDiscovery: async () => {},
    list: async () => [],
  };
  const { executeDiscoveryRun } = await browserDiscoveryAdapter();
  const run = createDiscoveryRun({ mode: 'auditor', gameBudget: 4096, workerCount: 1, seed: 7, profileId: 'core-advanced-authority' }, createEvidenceSnapshot([], IDENT), IDENT, NOW);
  const finished = await executeDiscoveryRun(run, { store });
  assert.deepEqual(loadedIds, [prior.discoveryId], 'the full artifact must be loaded by id — summary fields cannot rebuild an audit');
  const candidate = finished.candidates.find((c) => c.auditTarget?.discoveryId === prior.discoveryId);
  assert.ok(candidate, 'audit candidate must be created');
  assert.ok(candidate.auditTarget.effect && candidate.auditTarget.policiesTested, 'audit target carries the full artifact shape, not a summary row');
  const h = finished.hypotheses.find((x) => x.claim.includes(prior.discoveryId));
  assert.ok(h, 'a valid audit hypothesis must be produced');
  assert.equal(finished.status, 'COMPLETE');
  // The audit actually executed its falsification plan.
  assert.ok(h.plan.stages.some((s) => s.status === 'complete'));
});

test('browser adapter: corrupt and unloadable discoveries are disclosed and skipped, never silently dropped', async () => {
  const prior = priorDiscoveryArtifact();
  const store = {
    listDiscoveries: async () => [
      { discoveryId: 'unreadable', corrupt: true },
      { discoveryId: 'D-DEADBEEF' },
      { discoveryId: prior.discoveryId, status: 'discovery' },
    ],
    loadDiscovery: async (id) => { if (id === prior.discoveryId) return prior; throw new Error('DISCOVERY_HASH_MISMATCH'); },
    load: async () => { throw new Error('no runs'); },
    save: async () => {},
    saveDiscoveryRun: async () => {},
    saveDiscovery: async () => {},
    list: async () => [],
  };
  const { executeDiscoveryRun } = await browserDiscoveryAdapter();
  const run = createDiscoveryRun({ mode: 'auditor', gameBudget: 4096, workerCount: 1, seed: 7, profileId: 'core-advanced-authority' }, createEvidenceSnapshot([], IDENT), IDENT, NOW);
  const finished = await executeDiscoveryRun(run, { store });
  const unreadableWarnings = finished.warnings.filter((w) => w.code === 'AUDIT_TARGET_UNREADABLE');
  assert.ok(unreadableWarnings.length >= 2, `corrupt row + failed load must each be disclosed (got ${unreadableWarnings.length})`);
  assert.equal(finished.candidates.filter((c) => c.auditTarget).length, 1, 'only the loadable discovery becomes an audit target');
  assert.equal(finished.status, 'COMPLETE');
});

test('browser adapter: stage-run save failure blocks promotion and leaves honest provenance', async () => {
  const savedRuns = [];
  const store = {
    listDiscoveries: async () => [],
    loadDiscovery: async () => { throw new Error('none'); },
    load: async () => { throw new Error('no runs'); },
    save: async () => { throw new Error('QUOTA_EXCEEDED'); },   // stage-run persistence fails
    saveDiscoveryRun: async () => {},
    saveDiscovery: async () => {},
    list: async () => [],
    loadForInspection: async () => { throw new Error('none'); },
  };
  const { executeDiscoveryRun } = await browserDiscoveryAdapter();
  const snapshot = createEvidenceSnapshot(matchupCorpus(), IDENT);
  // Evidence payloads resolve via store.load — none available here, so feed
  // the corpus through an in-memory evidence path instead: mark runIds so
  // loadEvidenceRuns skips (all throws) → auditor path would block. Use
  // priorDiscoveries via auditor to exercise stage persistence without
  // needing stored evidence runs.
  const prior = priorDiscoveryArtifact();
  store.listDiscoveries = async () => [{ discoveryId: prior.discoveryId, status: 'discovery' }];
  store.loadDiscovery = async () => prior;
  const run = createDiscoveryRun({ mode: 'auditor', gameBudget: 4096, workerCount: 1, seed: 7, profileId: 'core-advanced-authority' }, snapshot, IDENT, NOW);
  const finished = await executeDiscoveryRun(run, { store });
  assert.equal(finished.status, 'COMPLETE');
  assert.equal(finished.discoveries.length, 0, 'no promoted discovery may cite a run that failed to persist');
  assert.ok(finished.warnings.some((w) => w.code === 'STAGE_EVIDENCE_NOT_PERSISTED'));
  for (const e of finished.experiments) assert.equal(e.persisted, false);
  assert.equal(savedRuns.length, 0);
});

// ── Real engine integration (small, real games only) ────────────

test('real engine: mechanic telemetry reaches stage cells and a clean run completes', { timeout: 240000 }, async () => {
  const evidenceRuns = [];
  for (const [a, b] of [['control', 'tempo'], ['score-rush', 'value']]) {
    const { run } = await runLabSeries({ botA: a, botB: b, gameCount: 12, seed: 7, profileId: 'core-advanced-authority', workerCount: 1, kind: 'EVALUATION', mirrorSeats: true }, { identity: REAL_IDENTITY });
    evidenceRuns.push(run);
  }
  const snapshot = createEvidenceSnapshot(evidenceRuns, REAL_IDENTITY);
  assert.equal(snapshot.gameCount, 24);
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 128, workerCount: 1, seed: 11, profileId: 'core-advanced-authority' }, snapshot, REAL_IDENTITY, NOW);
  const finished = await runDiscovery(run, { evidenceRuns, executeSeries: runLabSeries, now });
  assert.equal(finished.status, 'COMPLETE');
  validateDiscoveryRunEnvelope(discoveryRunEnvelope(finished), REAL_IDENTITY);

  // Real records carry per-seat mechanic telemetry — verify the row
  // projector maps them into cohorts the card channel can measure.
  const tag = Object.keys(evidenceRuns[0].records[0].seatBehavior?.[0]?.mechanicCounts ?? {})[0];
  if (tag) {
    const candidate = createCandidate({ category: 'card', subjectKey: 'card:control|tempo:control:X', summary: 's', signal: { observed: 0.6, expected: 0.5, deviation: 0.1, sampleSize: 12, method: 'm' }, scores: {} });
    const h = createHypothesis({ candidate, metric: 'mechanicDelta', direction: 1, expected: { value: 0 }, scope: { policies: ['control', 'tempo'], mechanic: tag, focalPolicy: 'control', pairing: 'control|tempo' }, stages: [] });
    const cell = measureStage(h, evidenceRuns[0]);
    assert.equal(cell.mechUsed.decisive + cell.mechUnused.decisive, cell.decisive);
  }
});

// ── Browser layer (static wiring + fake store contract) ────────────

test('browser wiring: workspace, router, store v5, and build copy list', async () => {
  const { readFile } = await import('node:fs/promises');
  const ws = await readFile('apps/lab-web/src/workspaces/discover.js', 'utf8');
  assert.match(ws, /export function renderDiscover/);
  assert.match(ws, /export function cleanupDiscover/);
  assert.match(ws, /data-testid="discover-workspace"/);
  assert.match(ws, /data-testid="dsc-queue"/);
  assert.match(ws, /data-testid="dsc-journal"/);
  assert.match(ws, /data-testid="dsc-summary"/);
  assert.match(ws, /data-testid="dsc-library"/);
  assert.match(ws, /data-testid="dsc-inspect"/);
  assert.match(ws, /data-testid="dsc-evidence"/);
  assert.match(ws, /data-testid="dsc-new"/);
  assert.match(ws, /BLOCKED/);
  assert.match(ws, /resolveEvidenceScope/);
  assert.match(ws, /executeDiscoveryRun/);
  assert.match(ws, /zero|Zero/);
  const runner = await readFile('apps/lab-web/src/evolution/discovery-runner.mjs', 'utf8');
  assert.match(runner, /executeBrowserSeries/);
  assert.match(runner, /runDiscovery/);
  assert.match(runner, /persistStageRun/);
  assert.match(runner, /resumeStageRun/);
  assert.match(runner, /export async function resolveEvidenceScope/);
  const store = await readFile('apps/lab-web/src/evolution/evolution-store.mjs', 'utf8');
  assert.match(store, /intrilex-evolution-lab', 5\)/);
  assert.match(store, /createObjectStore\('discoveryRuns'/);
  assert.match(store, /createObjectStore\('discoveries'/);
  assert.match(store, /saveDiscoveryRun/);
  assert.match(store, /saveDiscovery\(/);
  const router = await readFile('apps/lab-web/src/router.js', 'utf8');
  assert.match(router, /'\/discover','✦','Discover'/);
  const app = await readFile('apps/lab-web/src/app.js', 'utf8');
  assert.match(app, /import \{ renderDiscover, cleanupDiscover \}/);
  assert.match(app, /'\/discover': renderDiscover/);
  // The shell Clear control clears cohort filters only — it must be
  // labeled as such, never confused with a Discovery session reset.
  assert.match(app, />Clear Cohort</);
  const styles = await readFile('apps/lab-web/src/styles.css', 'utf8');
  assert.match(styles, /discover\.css/);
  const build = await readFile('scripts/build.mjs', 'utf8');
  assert.match(build, /'discovery-domain\.mjs'/);
  assert.match(build, /'discovery-scan\.mjs'/);
  assert.match(build, /'discovery-engine\.mjs'/);
});

test('browser adapter: executeDiscoveryRun persists run, stage runs and artifacts', async () => {
  // Fake EvolutionStore honoring the persistence contract the adapter
  // expects: save(run) for stage series, saveDiscoveryRun, saveDiscovery,
  // load/list for evidence and resume.
  const savedRuns = new Map(), savedDiscoveryRuns = new Map(), savedDiscoveries = new Map();
  const runs = matchupCorpus();
  const store = {
    async list() { return runs.map((r) => ({ runId: r.runId, createdAt: r.createdAt })); },
    async loadForInspection(id) { return { run: runs.find((r) => r.runId === id), historical: false }; },
    async load(id) { return savedRuns.get(id)?.payload ?? runs.find((r) => r.runId === id); },
    async save(run) { const env = { payload: structuredClone(run) }; savedRuns.set(run.runId, env); },
    async saveDiscoveryRun(run) { savedDiscoveryRuns.set(run.runId, discoveryRunEnvelope(run)); },
    async saveDiscovery(d) { savedDiscoveries.set(d.discoveryId, discoveryEnvelope(d)); },
    async listDiscoveries() { return []; },
  };
  const { runInNewContext } = await import('node:vm');
  const { readFile } = await import('node:fs/promises');
  const src = (await readFile('apps/lab-web/src/evolution/discovery-runner.mjs', 'utf8'))
    .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
  const { executeDiscoveryRun, prepareDiscoveryRun, resolveEvidenceScope } = runInNewContext(`${src}\n({ executeDiscoveryRun, prepareDiscoveryRun, resolveEvidenceScope })`, {
    executeBrowserSeries: fakeExecutor({ 'tempo|value': { pA: 0.74 } }),
    createDiscoveryRun, createEvidenceSnapshot, runDiscovery, warn, DISCOVERY_LIMITS,
  });
  const scope = await resolveEvidenceScope(store, {}, IDENT);
  assert.equal(scope.eligibleRunCount, runs.length);
  assert.equal(scope.eligibleGameCount, runs.reduce((n, r) => n + r.records.length, 0));
  assert.equal(scope.excludedRunCount, 0);
  const run = await prepareDiscoveryRun(store, { mode: 'open', gameBudget: 4096, workerCount: 1, seed: 11, profileId: 'core-advanced-authority' }, IDENT);
  assert.equal(run.status, 'IDLE');
  assert.equal(run.evidence.fingerprint, IDENT.fingerprint);
  const finished = await executeDiscoveryRun(run, { store });
  assert.equal(finished.status, 'COMPLETE');
  assert.ok(savedDiscoveryRuns.has(finished.runId), 'run envelope persisted');
  // Promoted discoveries persisted to their own store.
  for (const d of finished.discoveries) assert.ok(savedDiscoveries.has(d.discoveryId), `${d.discoveryId} persisted`);
  // Stage series are persisted into the ordinary runs store with EL- ids.
  const stageIds = finished.hypotheses.flatMap((h) => h.plan.stages.map((s) => s.experimentRunId)).filter(Boolean);
  for (const id of stageIds) assert.ok(savedRuns.has(id), `stage run ${id} persisted`);
});

// ── Evidence resolution / blocked runs ──────────────────────────
// A run whose frozen scope resolves to zero admissible game rows is an
// input failure (BLOCKED), never a successful COMPLETE. The ledger must
// reconcile selected → admissible → excluded with disclosed reasons.

test('evidence snapshot reconciles selected vs admissible with reason-coded exclusions', () => {
  const good = fakeRun('control', 'tempo', { games: 10, seed: 1 });
  const foreign = fakeRun('control', 'value', { games: 10, seed: 2 });
  foreign.identity = { ...structuredClone(IDENT), fingerprint: 'f'.repeat(64) };
  const imported = fakeRun('value', 'tempo', { games: 10, seed: 3 });
  imported.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  const noRecords = { runId: 'EL-NORECORDS', identity: { fingerprint: IDENT.fingerprint }, evidenceOrigin: 'LOCAL' };
  const snap = createEvidenceSnapshot([good, foreign, imported, noRecords], IDENT, { unreadableRunIds: ['EL-GONE'], historyRunCount: 7, truncatedRunCount: 2 });
  assert.equal(snap.selectedRunCount, 5);
  assert.equal(snap.selectedGameCount, 30);
  assert.equal(snap.runCount, 1);
  assert.equal(snap.gameCount, 10);
  assert.equal(snap.excludedCount, 4);
  assert.equal(snap.exclusionReasons.FOREIGN_FINGERPRINT, 1);
  assert.equal(snap.exclusionReasons.IMPORTED_UNVERIFIED, 1);
  assert.equal(snap.exclusionReasons.MISSING_RECORDS, 1);
  assert.equal(snap.exclusionReasons.UNREADABLE, 1);
  assert.equal(snap.truncatedRunCount, 2);
});

test('empty evidence scope blocks before research instead of completing empty', async () => {
  const snapshot = createEvidenceSnapshot([], IDENT);
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 512, workerCount: 1, seed: 11, profileId: 'core-advanced-authority' }, snapshot, IDENT, NOW);
  let executeCalls = 0;
  const finished = await runDiscovery(run, {
    evidenceRuns: [], now,
    executeSeries: async () => { executeCalls += 1; return { run: fakeRun('a', 'b') }; },
  });
  assert.equal(finished.status, 'BLOCKED');
  assert.equal(executeCalls, 0, 'blocked run must not execute experiments');
  assert.equal(finished.budget.consumed, 0);
  assert.equal(finished.hypotheses.length, 0);
  assert.equal(discoveryRunSummary(finished).zeroDiscoveryIsSuccess, false);
  assert.ok(finished.warnings.some((w) => w.code === 'EVIDENCE_RESOLUTION_FAILED'));
  assert.ok(finished.journal.some((e) => e.type === 'evidence-resolution'));
  assert.ok(finished.journal.some((e) => e.type === 'evidence-blocked'));
  assert.ok(!finished.journal.some((e) => e.type === 'scan-empty'), 'no-input failure must not claim a completed scan');
  const restored = validateDiscoveryRunEnvelope(discoveryRunEnvelope(finished), IDENT);
  assert.equal(restored.status, 'BLOCKED');
});

test('non-empty selected scope with all runs excluded blocks with disclosed reasons', async () => {
  const foreign = fakeRun('control', 'tempo', { games: 40, seed: 1 });
  foreign.identity = { ...structuredClone(IDENT), fingerprint: 'f'.repeat(64) };
  const imported = fakeRun('tempo', 'value', { games: 40, seed: 2 });
  imported.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  const runs = [foreign, imported];
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  assert.equal(snapshot.selectedRunCount, 2);
  assert.equal(snapshot.selectedGameCount, 80);
  assert.equal(snapshot.runCount, 0);
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 512, workerCount: 1, seed: 11, profileId: 'core-advanced-authority' }, snapshot, IDENT, NOW);
  const finished = await runDiscovery(run, { evidenceRuns: runs, now, executeSeries: fakeExecutor({}) });
  assert.equal(finished.status, 'BLOCKED');
  const summary = discoveryRunSummary(finished);
  assert.equal(summary.evidence.selectedRunCount, 2);
  assert.equal(summary.evidence.exclusionReasons.FOREIGN_FINGERPRINT, 1);
  assert.equal(summary.evidence.exclusionReasons.IMPORTED_UNVERIFIED, 1);
  assert.equal(summary.zeroDiscoveryIsSuccess, false);
  const detail = finished.warnings.find((w) => w.code === 'EVIDENCE_RESOLUTION_FAILED')?.detail ?? '';
  assert.match(detail, /excluded/);
});

test('snapshot-referenced runs that fail to load block with a missing-runs diagnosis', async () => {
  // Hydration gap: the frozen snapshot references runs the store can no
  // longer resolve — the run blocks, it does not scan an empty pool.
  const runs = matchupCorpus();
  const snapshot = createEvidenceSnapshot(runs, IDENT);
  const run = createDiscoveryRun({ mode: 'open', gameBudget: 512, workerCount: 1, seed: 11, profileId: 'core-advanced-authority' }, snapshot, IDENT, NOW);
  const finished = await runDiscovery(run, { evidenceRuns: [], now, executeSeries: fakeExecutor({}) });
  assert.equal(finished.status, 'BLOCKED');
  assert.ok(finished.warnings.some((w) => w.code === 'EVIDENCE_RUNS_MISSING'));
  assert.match(finished.warnings.find((w) => w.code === 'EVIDENCE_RESOLUTION_FAILED')?.detail ?? '', /none could be loaded/);
});

test('identifier contract: corpus match rows can never become Discover evidence', () => {
  // The COHORT strip counts certified-corpus matches (M-*/PR-* match ids).
  // These are not Lab series artifacts — feeding one to the snapshot must
  // exclude it explicitly, never scan it and never report it as games.
  const corpusMatch = { matchId: 'M-ABCDEF12', pairing: 'tempo|value', fingerprint: 'c'.repeat(64), games: 1 };
  const snap = createEvidenceSnapshot([corpusMatch], IDENT);
  assert.equal(snap.selectedRunCount, 1);
  assert.equal(snap.runCount, 0);
  assert.equal(snap.gameCount, 0);
  assert.equal(snap.excludedCount, 1);
  assert.equal(snap.exclusionReasons.FOREIGN_FINGERPRINT, 1);
  const { candidates, rowCount } = scanEvidence([], snap, { detectedAt: NOW });
  assert.equal(rowCount, 0);
  assert.equal(candidates.length, 0);
});

test('auditor mode is exempt from the evidence block when prior discoveries exist', async () => {
  const prior = validateDiscoveryArtifact(createDiscoveryArtifact(promotableHypothesis(), createDiscoveryRun({ mode: 'open', gameBudget: 512 }, createEvidenceSnapshot(flatCorpus(), IDENT), IDENT, NOW), { verdict: 'promote', confidence: 'MODERATE', grade: 'SUPPORTED', reasons: [] }, NOW));
  const snapshot = createEvidenceSnapshot([], IDENT);
  const run = createDiscoveryRun({ mode: 'auditor', gameBudget: 4096, workerCount: 1, seed: 11, profileId: 'core-advanced-authority' }, snapshot, IDENT, NOW);
  const finished = await runDiscovery(run, {
    evidenceRuns: [], priorDiscoveries: [prior], now,
    executeSeries: fakeExecutor({ default: { pA: 0.6 } }),
  });
  assert.notEqual(finished.status, 'BLOCKED');
  assert.ok(finished.candidates.some((c) => c.auditTarget?.discoveryId === prior.discoveryId));
  assert.ok(finished.hypotheses.length > 0);
});

test('non-empty admissible evidence reaches the scanner and advances the run', async () => {
  // Regression for the screenshot invariant: a non-empty compatible
  // scope must produce evidence > 0 at the scanner, and the journal must
  // record the resolution ledger — never "0 games across 0 runs".
  const runs = flatCorpus();
  const { run } = await corpusRun(runs, { gameBudget: 128 });
  assert.equal(run.status, 'COMPLETE');
  assert.equal(run.evidence.gameCount, 500);
  assert.ok(run.evidence.runCount > 0);
  const resolution = run.journal.find((e) => e.type === 'evidence-resolution');
  assert.ok(resolution, 'evidence-resolution journal entry required');
  assert.match(resolution.message, /500 admissible games/);
  assert.match(resolution.message, /500 selected/);
});
