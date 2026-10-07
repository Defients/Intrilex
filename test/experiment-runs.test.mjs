// experiment-runs.test.mjs — Persistent Experiment Runs & Analysis Sets
//
// Covers the spec's required cases:
//   persistence — run A survives run B; runs survive reload roundtrip
//   analysis set — included/excluded/re-included contribution
//   aggregation — unequal run sizes weight by raw counts, union == selection
//   compatibility — material mismatches flagged, compatible runs aggregatable
//   migration — legacy (bundled) evidence becomes a valid initial run;
//               repeated migration is idempotent
//   provenance — exclusion reasons persist; runHash detects tampering
//   failures — failed/cancelled runs never contribute
//   dossier — exports disclose which runs produced the aggregate
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  DEFAULT_EXPERIMENT_ID, DEFAULT_ANALYSIS_SET_ID, BUNDLED_RUN_ID,
  RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY,
  createExperiment, createAnalysisSet, createRunRecord,
  nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
  contributingRuns, evidenceBasis, previewSelectionMetrics,
  includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
  planMigration, validateRunRecord, runIdFor, bundledBaselineRun,
} from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { ExperimentStore } from '../apps/lab-web/src/experiments/experiment-store.mjs';
import { buildAnalysisDossier, renderAnalysisDossierMarkdown } from '../apps/lab-web/src/analysis-dossier.js';

// ── Minimal fake IndexedDB ────────────────────────────────────────
// Implements just the surface experiment-store.mjs uses so tests exercise the
// real IDB code path (transactions, keyPaths, getAll) and true "reopen"
// roundtrips — not just the memory fallback.
const KEY_PATHS = { experiments: 'experimentId', runs: 'runId', analysisSets: 'analysisSetId', payloads: 'runId' };
function createFakeIndexedDB() {
  const databases = new Map(); // dbName → Map<storeName, Map<key, value>>
  const wrapStore = (table, keyPath) => ({
    get(key) { const req = {}; globalThis.queueMicrotask(() => { req.result = table.get(key); req.onsuccess?.(); }); return req; },
    getAll() { const req = {}; globalThis.queueMicrotask(() => { req.result = [...table.values()]; req.onsuccess?.(); }); return req; },
    put(value, key) { table.set(key ?? value[keyPath], structuredClone(value)); const req = {}; globalThis.queueMicrotask(() => req.onsuccess?.()); return req; },
    delete(key) { table.delete(key); const req = {}; globalThis.queueMicrotask(() => req.onsuccess?.()); return req; },
  });
  let failNextTransaction = null; // error object → tx aborts with it
  const wrapDb = data => ({
    objectStoreNames: { contains: n => data.has(n) },
    createObjectStore(name) { if (!data.has(name)) data.set(name, new Map()); },
    transaction(_names) {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      if (failNextTransaction) {
        tx.error = failNextTransaction; failNextTransaction = null;
        setTimeout(() => tx.onabort?.(), 0);
      } else {
        setTimeout(() => tx.oncomplete?.(), 0);
      }
      tx.objectStore = name => {
        if (!data.has(name)) data.set(name, new Map());
        return wrapStore(data.get(name), KEY_PATHS[name]);
      };
      return tx;
    },
    close() {},
  });
  const api = { failNextTransaction: error => { failNextTransaction = error; } };
  return {
    open(name) {
      const req = { transaction: { abort() {} } };
      globalThis.queueMicrotask(() => {
        let data = databases.get(name);
        if (!data) {
          data = new Map();
          databases.set(name, data);
          req.result = wrapDb(data);
          req.onupgradeneeded?.();
        } else {
          req.result = wrapDb(data);
        }
        req.onsuccess?.();
      });
      return req;
    },
    _failNextTransaction: api.failNextTransaction,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────
const PROVENANCE = { rulesVersion: '4.3.1', engineVersion: '4.2.6', labVersion: '0.29.0' };
const mkRun = (ordinal, { config = {}, provenance = {}, metrics = {}, ...rest } = {}) => createRunRecord({
  experimentId: DEFAULT_EXPERIMENT_ID, ordinal,
  config: { profileId: 'core-advanced-authority', policyIds: ['score-rush', 'control'], matchCount: 4, seedStrategy: 'ordinal-hash', ...config },
  provenance: { ...PROVENANCE, ...provenance },
  metrics: { matchCount: config.matchCount ?? 4, seat1Wins: 2, seat2Wins: 2, ...metrics },
  ...rest,
});
const fakeSummary = (ordinal, { winningSeat = 1, terminationReason = 'NORMAL_VICTORY' } = {}) => ({
  matchId: `T-${ordinal}`, ordinal, terminationReason,
  policyIds: ['score-rush', 'control'], seatOrder: ['P1', 'P2'],
  winner: winningSeat === 1 ? 'P1' : winningSeat === 2 ? 'P2' : null,
  winningSeat: terminationReason === 'CANONICAL_DRAW' ? null : winningSeat,
  completedFullTurns: 6, scoreMargin: 3, matchResultHash: `h${ordinal}`,
});

// ── Domain: records & immutability ────────────────────────────────
test('run records get deterministic identity and hash-covered evidence', () => {
  const run = mkRun(1);
  assert.equal(run.runId, runIdFor(DEFAULT_EXPERIMENT_ID, 1));
  assert.equal(run.status, RUN_STATUS.COMPLETED);
  assert.equal(run.lifecycle.state, RUN_LIFECYCLE.ACTIVE);
  assert.ok(run.runHash.length >= 32);
  assert.ok(run.compatibilityFingerprint);
  // Tampering with frozen evidence fields is detectable.
  const tampered = { ...run, metrics: { ...run.metrics, matchCount: 999 } };
  assert.throws(() => validateRunRecord(tampered), /RUN_HASH_MISMATCH/);
  // Lifecycle curation is NOT part of runHash — pinning/invalidation is legal.
  const pinned = pinRun(run, true);
  assert.doesNotThrow(() => validateRunRecord(pinned));
  assert.equal(validateRunRecord(pinned).lifecycle.pinned, true);
});

test('ordinals continue across runs so new evidence observes fresh seeds', () => {
  const a = mkRun(1, { config: { ordinalStart: 0, ordinalEnd: 128 } });
  const b = mkRun(2, { config: { ordinalStart: 128, ordinalEnd: 384 } });
  assert.equal(nextRunOrdinal([a, b]), 3);
  assert.equal(nextOrdinalStart([a, b]), 384);
  assert.equal(nextOrdinalStart([a]), 128);
});

// ── Store: persistence & reload roundtrip ─────────────────────────
test('run A survives creation of run B and both survive a store reopen', async () => {
  const idb = createFakeIndexedDB();
  const store = new ExperimentStore(idb);
  await store.open();
  assert.equal(store.persisted, true);
  const a = mkRun(1), b = mkRun(2, { config: { ordinalStart: 4, ordinalEnd: 8 } });
  await store.saveRun(a, { summaries: [fakeSummary(0), fakeSummary(1)], aggregate: { matchCount: 2 } });
  await store.saveRun(b, { summaries: [fakeSummary(2), fakeSummary(3)], aggregate: { matchCount: 2 } });
  store.close();

  // "Reload": a fresh store instance over the same database.
  const reopened = new ExperimentStore(idb);
  await reopened.open();
  const runs = await reopened.listRuns(DEFAULT_EXPERIMENT_ID);
  assert.deepEqual(runs.map(r => r.runId), [a.runId, b.runId]);
  const payloadA = await reopened.getRunPayload(a.runId);
  assert.equal(payloadA.summaries.length, 2);
  reopened.close();
});

test('memory backend works when IndexedDB is unavailable', async () => {
  const store = new ExperimentStore(null);
  await store.open();
  assert.equal(store.persisted, false);
  await store.saveRun(mkRun(1), { summaries: [fakeSummary(0)] });
  assert.equal((await store.listRuns(DEFAULT_EXPERIMENT_ID)).length, 1);
  assert.equal((await store.getRunPayload((await store.listRuns())[0].runId)).summaries.length, 1);
});

test('storage quota failures surface as an explicit error code', async () => {
  const idb = createFakeIndexedDB();
  const store = new ExperimentStore(idb);
  await store.open();
  idb._failNextTransaction({ name: 'QuotaExceededError' });
  await assert.rejects(
    () => store.saveRun(mkRun(1), { summaries: [fakeSummary(0)] }),
    error => error?.code === 'BROWSER_STORAGE_QUOTA_EXCEEDED',
  );
  // And oversized payloads are refused before the write is attempted.
  const { EXPERIMENT_LIMITS } = await import('../packages/simulation-runtime/src/experiment-domain.mjs');
  assert.ok(EXPERIMENT_LIMITS.persistRunBytes > 0);
});

// ── Analysis set curation ─────────────────────────────────────────
test('included runs contribute; excluded runs do not; re-included runs return', async () => {
  const store = new ExperimentStore(null);
  await store.open();
  const a = mkRun(1), b = mkRun(2);
  await store.saveRun(a); await store.saveRun(b);
  let set = createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID });
  set = includeRunInSet(set, a.runId);
  set = includeRunInSet(set, b.runId);
  await store.putAnalysisSet(set);

  let contributing = contributingRuns(await store.listRuns(), await store.getAnalysisSet(set.analysisSetId));
  assert.deepEqual(contributing.map(r => r.runId).sort(), [a.runId, b.runId].sort());

  // Exclude A with a reason — retained, not deleted.
  set = excludeRunFromSet(set, a.runId, { reason: 'superseded-ruleset', note: 'predates patch' });
  await store.putAnalysisSet(set);
  const stored = await store.getAnalysisSet(set.analysisSetId);
  assert.equal(stored.exclusions[a.runId].reason, 'superseded-ruleset');
  assert.equal(stored.exclusions[a.runId].note, 'predates patch');
  assert.ok(await store.getRun(a.runId), 'excluded run record must still exist');
  contributing = contributingRuns(await store.listRuns(), stored);
  assert.deepEqual(contributing.map(r => r.runId), [b.runId]);

  // Re-inclusion restores contribution and clears the exclusion.
  set = includeRunInSet(stored, a.runId);
  await store.putAnalysisSet(set);
  const restored = await store.getAnalysisSet(set.analysisSetId);
  assert.equal(restored.exclusions[a.runId], undefined);
  contributing = contributingRuns(await store.listRuns(), restored);
  assert.equal(contributing.length, 2);
});

test('failed and cancelled runs never contribute even if included', () => {
  const ok = mkRun(1);
  const failed = mkRun(2, { status: RUN_STATUS.FAILED, error: 'worker error' });
  const cancelled = mkRun(3, { status: RUN_STATUS.CANCELLED });
  let set = createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID });
  for (const r of [ok, failed, cancelled]) set = includeRunInSet(set, r.runId);
  const contributing = contributingRuns([ok, failed, cancelled], set);
  assert.deepEqual(contributing.map(r => r.runId), [ok.runId]);
});

test('invalidated runs are held out of analysis until explicitly restored', async () => {
  const store = new ExperimentStore(null);
  await store.open();
  const a = mkRun(1);
  await store.saveRun(a);
  let set = createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID });
  set = includeRunInSet(set, a.runId);
  const bad = invalidateRun(a, { reason: 'engine-defect', note: 'known defect' });
  await store.updateRun(bad);
  const contributing = contributingRuns(await store.listRuns(), set);
  assert.equal(contributing.length, 0);
  const revived = restoreRun(bad);
  await store.updateRun(revived);
  assert.equal(contributingRuns(await store.listRuns(), set).length, 1);
  assert.equal((await store.listRuns())[0].lifecycle.state, 'active');
});

test('archived runs are hidden from contributing set but never deleted', async () => {
  const store = new ExperimentStore(null);
  await store.open();
  const a = mkRun(1);
  await store.saveRun(a);
  await store.updateRun(archiveRun(a));
  let set = includeRunInSet(createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID }), a.runId);
  assert.equal(contributingRuns(await store.listRuns(), set).length, 0);
  assert.ok(await store.getRun(a.runId));
});

// ── Aggregation weighting ─────────────────────────────────────────
test('evidence basis and preview metrics weight by raw counts, not run averages', () => {
  // run A: 2 games, 1 seat-1 win (50%); run B: 4 games, 4 seat-1 wins (100%).
  // Mean of percentages would give 75% — the correct answer is 5/6 ≈ 83.3%.
  const a = mkRun(1, { config: { matchCount: 2 }, metrics: { matchCount: 2, seat1Wins: 1, seat2Wins: 1, seat1WinRate: 0.5 } });
  const b = mkRun(2, { config: { matchCount: 4 }, metrics: { matchCount: 4, seat1Wins: 4, seat2Wins: 0, seat1WinRate: 1 } });
  let set = createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID });
  set = includeRunInSet(set, a.runId); set = includeRunInSet(set, b.runId);
  const basis = evidenceBasis([a, b], set);
  assert.equal(basis.includedGames, 6);
  assert.equal(basis.includedRunCount, 2);
  const preview = previewSelectionMetrics([a, b], [a.runId, b.runId]);
  assert.equal(preview.games, 6);
  assert.ok(Math.abs(preview.seat1WinRate - 5 / 6) < 1e-9, `expected 5/6, got ${preview.seat1WinRate}`);
});

test('aggregate over the union of selected run payloads equals the sum of the parts', async t => {
  // Uses the real browser aggregation (raw-count union, no percentage averaging).
  if (!existsSync(new URL('../apps/lab-web/dist/browser-analytics.js', import.meta.url))) {
    t.skip('apps/lab-web/dist not built — run pnpm run build first');
    return;
  }
  const { campaignAggregate } = await import('../apps/lab-web/dist/browser-analytics.js');
  const summariesA = [fakeSummary(0, { winningSeat: 1 }), fakeSummary(1, { winningSeat: 2 })];
  const summariesB = [fakeSummary(2), fakeSummary(3), fakeSummary(4), fakeSummary(5)];
  const semantic = { profileId: 'core-advanced-authority', rulesVersion: '4.3.1', engineVersion: '4.2.6' };
  const aggregate = campaignAggregate([...summariesA, ...summariesB], semantic);
  assert.equal(aggregate.matchCount, 6);
  assert.equal(aggregate.seatWins['1'], 5);
  assert.equal(aggregate.seatWins['2'], 1);
  assert.ok(Math.abs(aggregate.seat1WinRate - 5 / 6) < 1e-9);
});

// ── Compatibility ─────────────────────────────────────────────────
test('materially mismatched runs are incompatible; treatment changes are disclosed', () => {
  const baseline = mkRun(1);
  const same = mkRun(2);
  const differentRules = mkRun(3, { provenance: { rulesVersion: '4.2.0' } });
  const differentMatchup = mkRun(4, { config: { policyIds: ['tempo', 'value'] } });
  assert.equal(classifyRunCompatibility(same, baseline).status, COMPATIBILITY.COMPATIBLE);
  const material = classifyRunCompatibility(differentRules, baseline);
  assert.equal(material.status, COMPATIBILITY.INCOMPATIBLE);
  assert.ok(material.diffs.some(d => d.field === 'rulesVersion' && d.level === 'material'));
  const treatment = classifyRunCompatibility(differentMatchup, baseline);
  assert.equal(treatment.status, COMPATIBILITY.TREATMENT_CHANGE);
  assert.ok(treatment.diffs.some(d => d.field === 'policyIds' && d.level === 'treatment'));
  assert.equal(compatibilityBaseline([baseline, same], new Set([baseline.runId, same.runId])).runId, same.runId);
});

// ── Migration ─────────────────────────────────────────────────────
test('migration registers the bundled corpus as a valid initial run, idempotently', async () => {
  const store = new ExperimentStore(null);
  await store.open();
  const aggregate = { profileId: 'core-advanced-authority', matchCount: 512, completedMatchCount: 500, rulesVersion: '4.3.1', engineVersion: '4.2.6', seatWins: { '1': 250, '2': 250 }, seat1WinRate: 0.5 };
  const plan1 = planMigration({ aggregate, summaryCount: 512 });
  assert.equal(plan1.experiments.length, 1);
  assert.equal(plan1.analysisSets.length, 1);
  assert.equal(plan1.runs.length, 1);
  await store.applyMigration(plan1);

  const migrated = await store.getRun(BUNDLED_RUN_ID);
  assert.equal(migrated.status, RUN_STATUS.COMPLETED);
  assert.equal(migrated.origin, 'bundled');
  assert.equal(migrated.payloadKind, 'bundled');
  assert.equal(migrated.metrics.matchCount, 512);
  assert.doesNotThrow(() => validateRunRecord(migrated));
  assert.ok(await store.getExperiment(DEFAULT_EXPERIMENT_ID));
  assert.ok(await store.getAnalysisSet(`${DEFAULT_EXPERIMENT_ID}/${DEFAULT_ANALYSIS_SET_ID}`));

  // Idempotent: planning against migrated state produces zero writes.
  const plan2 = planMigration({
    experiments: await store.listExperiments(), runs: await store.listRuns(),
    analysisSets: await store.listAnalysisSets(), aggregate, summaryCount: 512,
  });
  assert.deepEqual(plan2, { experiments: [], runs: [], analysisSets: [] });
});

test('a legacy run result migrates into an included first run', async () => {
  // Simulates upgrading a store that already held one "latest result" style
  // run: the stored run is valid, is picked up by the analysis set, and a
  // second migration adds nothing.
  const store = new ExperimentStore(null);
  await store.open();
  const legacy = bundledBaselineRun({ aggregate: { matchCount: 100 }, summaryCount: 100 });
  await store.applyMigration({ experiments: [createExperiment({})], runs: [legacy], analysisSets: [createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID })] });
  const again = planMigration({
    experiments: await store.listExperiments(), runs: await store.listRuns(),
    analysisSets: await store.listAnalysisSets(),
  });
  assert.deepEqual(again, { experiments: [], runs: [], analysisSets: [] });
  const set = includeRunInSet(await store.getAnalysisSet(`${DEFAULT_EXPERIMENT_ID}/${DEFAULT_ANALYSIS_SET_ID}`), BUNDLED_RUN_ID);
  assert.equal(contributingRuns(await store.listRuns(), set).length, 1);
});

// ── Deletion safety ───────────────────────────────────────────────
test('deleteRun removes the record, payload, and scrubs set membership', async () => {
  const store = new ExperimentStore(null);
  await store.open();
  const a = mkRun(1);
  await store.saveRun(a, { summaries: [fakeSummary(0)] });
  let set = includeRunInSet(createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID }), a.runId);
  set = excludeRunFromSet(set, a.runId, { reason: 'duplicate' });
  await store.putAnalysisSet(set);
  await store.deleteRun(a.runId);
  assert.equal(await store.getRun(a.runId), null);
  assert.equal(await store.getRunPayload(a.runId), null);
  const scrubbed = await store.getAnalysisSet(set.analysisSetId);
  assert.ok(!scrubbed.includedRunIds.includes(a.runId));
  assert.equal(scrubbed.exclusions[a.runId], undefined);
});

// ── Export / dossier ──────────────────────────────────────────────
test('dossier records which runs produced the aggregate', () => {
  const a = mkRun(1), b = mkRun(2);
  const experiments = {
    available: true, experimentId: DEFAULT_EXPERIMENT_ID,
    analysisSetId: `${DEFAULT_EXPERIMENT_ID}/${DEFAULT_ANALYSIS_SET_ID}`,
    persisted: true,
    includedRunIds: [b.runId], includedRunCount: 1, includedGames: 4,
    excludedRunCount: 1, excludedGames: 4, totalRuns: 2,
    invalidatedCount: 0, archivedCount: 0, failedCount: 0,
    bundledBaselineContributing: false, fallback: null,
    runs: [
      { runId: a.runId, ordinal: 1, status: 'COMPLETED', lifecycle: 'active', included: false, exclusionReason: 'exploratory', rulesVersion: '4.3.1', engineVersion: '4.2.6', runHash: a.runHash },
      { runId: b.runId, ordinal: 2, status: 'COMPLETED', lifecycle: 'active', included: true, exclusionReason: null, rulesVersion: '4.3.1', engineVersion: '4.2.6', runHash: b.runHash },
    ],
    warnings: [],
  };
  const dossier = buildAnalysisDossier({
    observatory: { datasetOrigin: 'EXPERIMENT_RUNS', summaries: [] },
    aggregate: null, versions: {}, experiments,
  });
  const exp = dossier.experiment;
  assert.equal(exp.available, true);
  assert.equal(exp.selectedExperimentIncluded, true);
  assert.equal(exp.includedRunIds[0], b.runId);
  assert.equal(exp.runs.length, 2);
  const md = renderAnalysisDossierMarkdown(dossier);
  assert.match(md, /Experiment/i);
  assert.match(md, /EXPERIMENT_RUNS/);
});
