import { evolutionIdentity } from '../scripts/evolution-identity.mjs';
const LAB_IDENTITY = await evolutionIdentity();
// experiment-run-durability.test.mjs — Incremental durability for chunked runs
//
// Covers the P0 durability contract:
//   chunked persistence — batches commit atomically with the manifest
//   failure mid-run     — committed batches survive; the run never fakes done
//   reload recovery     — a 'running' manifest reclassifies to interrupted
//   resume              — only uncommitted ordinals re-simulate, no duplicates
//   partial seal        — committed < requested stays honest on the record
//   stacked runs        — N manifests coexist; sealed runs all contribute
//   integrity           — a corrupted committed batch quarantines the run
//   retention           — the UI index is slim; heavy fields are not retained
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import {
  DEFAULT_EXPERIMENT_ID, DEFAULT_ANALYSIS_SET_ID, BUNDLED_RUN_ID,
  RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY, EXCLUSION_REASONS, RUN_INTEGRITY,
  MANIFEST_STATUS,
  createExperiment, createAnalysisSet, createRunRecord,
  createRunManifest, createManifestHeadline, foldSummariesIntoHeadline,
  commitManifestBatch, planManifestBatchCommit, manifestTransition, manifestIsActive, manifestIsResumable,
  manifestRemainingSegments, manifestCommittedCoverage, manifestRetainedOrdinals,
  runIdFor, batchSummariesHash, slimSummary,
  nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
  contributingRuns, evidenceBasis, previewSelectionMetrics,
  includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
  planMigration, validateRunRecord,
  payloadEvidenceHash, verifyRunPayload, markRunIntegrity, runIntegrityState,
  runAnalyticallyEligible,
} from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { summariesCarryDecisionEvidence } from '../packages/simulation-runtime/src/experiment-portability.mjs';
import { ExperimentStore } from '../apps/lab-web/src/experiments/experiment-store.mjs';

// ── Minimal fake IndexedDB (same surface as experiment-runs.test.mjs) ──
const KEY_PATHS = { experiments: 'experimentId', runs: 'runId', analysisSets: 'analysisSetId', payloads: 'runId', manifests: 'manifestId', runBatches: 'batchId' };
function createFakeIndexedDB() {
  const databases = new Map();
  let failNextTransaction = null;
  const wrapDb = data => ({
    objectStoreNames: { contains: n => data.has(n) },
    createObjectStore(name) { if (!data.has(name)) data.set(name, new Map()); },
    transaction(_names) {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      // Stage writes: a real IDB transaction commits all-or-nothing — an
      // abort must leave no partial record, mirroring commit/finalize atomicity.
      const staged = [];
      if (failNextTransaction) {
        tx.error = failNextTransaction; failNextTransaction = null;
        setTimeout(() => tx.onabort?.(), 0);
      } else {
        setTimeout(() => {
          for (const op of staged) { if (op.del) op.table.delete(op.key); else op.table.set(op.key, structuredClone(op.value)); }
          tx.oncomplete?.();
        }, 0);
      }
      tx.objectStore = name => {
        if (!data.has(name)) data.set(name, new Map());
        const table = data.get(name);
        return {
          get(key) { const req = {}; globalThis.queueMicrotask(() => { req.result = table.get(key); req.onsuccess?.(); }); return req; },
          getAll() { const req = {}; globalThis.queueMicrotask(() => { req.result = [...table.values()]; req.onsuccess?.(); }); return req; },
          put(value, key) { staged.push({ table, key: key ?? value[KEY_PATHS[name]], value }); const req = {}; globalThis.queueMicrotask(() => req.onsuccess?.()); return req; },
          delete(key) { staged.push({ table, key, del: true }); const req = {}; globalThis.queueMicrotask(() => req.onsuccess?.()); return req; },
        };
      };
      return tx;
    },
    close() {},
  });
  return {
    open(name) {
      const req = { transaction: { abort() {} } };
      globalThis.queueMicrotask(() => {
        let data = databases.get(name);
        if (!data) { data = new Map(); databases.set(name, data); req.result = wrapDb(data); req.onupgradeneeded?.(); }
        else req.result = wrapDb(data);
        req.onsuccess?.();
      });
      return req;
    },
    _failNextTransaction: error => { failNextTransaction = error; },
  };
}

const fakeSummary = (ordinal, { winningSeat = 1, terminationReason = 'NORMAL_VICTORY', heavy = false } = {}) => ({
  identity: { schemaVersion: '2.0.0', executionFingerprint: LAB_IDENTITY.fingerprint, analysisFingerprint: LAB_IDENTITY.analysisFingerprint },
  matchId: `T-${ordinal}`, matchOrdinal: ordinal, ordinal, terminationReason,
  policyIds: ['score-rush', 'control'], seatOrder: ['P1', 'P2'],
  winner: winningSeat === 1 ? 'P1' : winningSeat === 2 ? 'P2' : null,
  winningSeat: terminationReason === 'CANONICAL_DRAW' ? null : winningSeat,
  completedFullTurns: 6, scoreMargin: 3, durationMs: 12, matchResultHash: `h${ordinal}`,
  ...(heavy ? { rankDecisions: [{ pad: 'x'.repeat(64) }], decisions: [{ pad: 'y'.repeat(64) }], strategicTelemetry: { pad: 'z'.repeat(64) } } : {}),
});
const fakeSummaries = (from, count, opts = {}) => Array.from({ length: count }, (_, i) => fakeSummary(from + i, opts));

const RUN_CFG = { matchCount: 250, profileId: 'core-advanced-authority', policyIds: ['score-rush', 'control'], seedStrategy: 'ordinal-hash', ordinalStart: 0, ordinalEnd: 250, ordinalBase: 0, workers: 1 };
const RUN_SEGMENTS = [{ index: 0, ordinalStart: 0, ordinalEnd: 250 }];

// ── Controller harness (vm sandbox, browser imports stubbed) ─────────
async function experimentController({ state: stateOverrides = {} } = {}) {
  const src = (await readFile('apps/lab-web/src/experiments/experiment-controller.mjs', 'utf8'))
    .replace(/import\s[^;]*?from\s*'[^']*';/gs, '')
    .replace(/^export /gm, '');
  const state = { bootState: null, observatory: {}, aggregate: {}, evidenceBasis: null, ...stateOverrides };
  const toasts = [];
  const sandbox = {
    console, structuredClone, TextEncoder, setTimeout, queueMicrotask: globalThis.queueMicrotask,
    Worker: class { constructor() { throw new Error('no workers in tests'); } },
    state, showToast: (msg, opts) => toasts.push({ msg, ...opts }),
    updateRailContext() {}, rerender() {},
    RULES_VERSION: '4.3.1', LAB_VERSION: '0.29.0', ENGINE_VERSION: '4.2.6',
    hashCanonical, LAB_IDENTITY, ExperimentStore,
    DEFAULT_EXPERIMENT_ID, DEFAULT_ANALYSIS_SET_ID, BUNDLED_RUN_ID,
    RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY, EXCLUSION_REASONS, RUN_INTEGRITY,
    MANIFEST_STATUS,
    createExperiment, createAnalysisSet, createRunRecord,
    createRunManifest, createManifestHeadline, foldSummariesIntoHeadline,
    commitManifestBatch, planManifestBatchCommit, manifestTransition, manifestIsActive, manifestIsResumable,
    manifestRemainingSegments, manifestCommittedCoverage, manifestRetainedOrdinals,
    runIdFor, batchSummariesHash, slimSummary,
    nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
    contributingRuns, evidenceBasis, previewSelectionMetrics,
    includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
    planMigration, payloadEvidenceHash, verifyRunPayload, markRunIntegrity,
    runIntegrityState, runAnalyticallyEligible, validateRunRecord,
    summariesCarryDecisionEvidence,
  };
  const api = runInNewContext(`${src}\n({ initExperiments, recordCampaignRun, recordFailedRun, recordCancelledRun, experimentsReady, storePersisted, getExperiment, getExperimentRuns, getActiveAnalysisSet, getIncludedRuns, getEvidenceBasis, runsWithCompatibility, previewRunSelection, allRunIds, nextRunOrdinalStart, setRunIncluded, setRunExcluded, markRunInvalidated, markRunArchived, markRunRestored, markRunPinned, includeAllCompatible, isolateRun, restoreBaseline, deleteRun, applySelection, collectExperimentEvidence, registerRunExecutor, beginExperimentRun, commitExperimentBatch, finalizeExperimentRun, failExperimentRun, cancelExperimentRun, getIncompleteRuns, resumeExperimentRun, discardManifest, loadRunMatchDetail })`, sandbox);
  return { api, state, toasts };
}

const initApi = async (idb, opts = {}) => {
  const { api, state, toasts } = await experimentController(opts);
  const store = new ExperimentStore(idb);
  await api.initExperiments({ bootSummaries: [fakeSummary(9000)], store, ...opts.init });
  return { api, state, toasts, store };
};

/** Simulate elapsed time after a tab crash: the dead owner's lease lapses,
 * so the next boot's recovery path may authoritatively interrupt/reclaim
 * the manifest. Ownership fencing forbids interrupting a live lease — this
 * helper is the test's stand-in for the 30s lease window passing. */
const expireLease = async (store, manifestId) => {
  const m = await store.getManifest(manifestId);
  if (m?.owner) await store.putManifest({ ...m, owner: { ...m.owner, leaseUntil: new Date(0).toISOString() } });
};

/** Drive a plan's segments synchronously through the commit API — the test
 * double for the worker executor. Commits in 50-match batches. */
const drivePlan = (api, plan, { batchSize = 50, summariesOf = (o, n) => fakeSummaries(o, n) } = {}) => api.registerRunExecutor(async p => {
  if (p.runId !== plan.runId) return;
  for (const seg of p.segments) {
    for (let o = seg.ordinalStart; o < seg.ordinalEnd; o += batchSize) {
      const n = Math.min(batchSize, seg.ordinalEnd - o);
      await api.commitExperimentBatch(p.runId, { segmentIndex: seg.index, ordinalStart: o, ordinalEnd: o + n, summaries: summariesOf(o, n) });
    }
  }
  await api.finalizeExperimentRun(p.runId);
});

// ── Domain: manifest model ───────────────────────────────────────────
test('manifest tracks committed frontiers; remaining segments exclude committed ordinals', () => {
  const m = createRunManifest({ runId: 'RUN-X-0001', experimentId: DEFAULT_EXPERIMENT_ID, ordinal: 1, config: RUN_CFG, requestedMatches: 250, batchSize: 50, segments: RUN_SEGMENTS });
  assert.equal(m.status, MANIFEST_STATUS.RUNNING);
  assert.equal(m.committedMatches, 0);
  let next = commitManifestBatch(m, { batchIndex: 0, segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, matchCount: 50, summariesHash: 'h0', matchResultHashes: [] });
  next = commitManifestBatch(next, { batchIndex: 1, segmentIndex: 0, ordinalStart: 50, ordinalEnd: 100, matchCount: 50, summariesHash: 'h1', matchResultHashes: [] });
  assert.equal(next.committedMatches, 100);
  assert.equal(next.segments[0].nextOrdinal, 100);
  assert.deepEqual(manifestRemainingSegments(next), [{ index: 0, ordinalStart: 100, ordinalEnd: 250 }]);
  assert.deepEqual(manifestCommittedCoverage(next), [{ start: 0, end: 100 }]);
  const interrupted = manifestTransition(next, MANIFEST_STATUS.INTERRUPTED, { failure: { message: 'crash', phase: 'execution' } });
  assert.equal(manifestIsResumable(interrupted), true);
  assert.equal(manifestIsActive(interrupted), false);
  const sealed = manifestTransition({ ...next, sealedRunId: 'RUN-X-0001', resumable: false }, MANIFEST_STATUS.COMPLETED);
  assert.equal(sealed.completedAt != null, true);
});

test('headline folds scalar counts without retaining payloads', () => {
  const h = foldSummariesIntoHeadline(createManifestHeadline(), [
    fakeSummary(0, { winningSeat: 1 }),
    fakeSummary(1, { winningSeat: 2 }),
    fakeSummary(2, { terminationReason: 'CANONICAL_DRAW' }),
    fakeSummary(3, { terminationReason: 'DECISION_LIMIT' }),
  ]);
  assert.deepEqual({ matchCount: h.matchCount, completed: h.completedMatchCount, aborts: h.abortCount, draws: h.drawCount, s1: h.seatWins['1'], s2: h.seatWins['2'] },
    { matchCount: 4, completed: 3, aborts: 1, draws: 1, s1: 1, s2: 1 });
});

test('slimSummary strips heavy detail but keeps analytical fields', () => {
  const full = fakeSummary(0, { heavy: true });
  const slim = slimSummary(full);
  assert.equal(slim.rankDecisions, undefined);
  assert.equal(slim.decisions, undefined);
  assert.equal(slim.strategicTelemetry, undefined);
  assert.equal(slim.matchResultHash, full.matchResultHash);
  assert.equal(slim.winningSeat, full.winningSeat);
});

// ── Store: chunked persistence ───────────────────────────────────────
test('IDB v2 stores manifests and batches; commit+seal are atomic transactions', async () => {
  const idb = createFakeIndexedDB();
  const store = new ExperimentStore(idb);
  await store.open();
  assert.equal(store.persisted, true);
  const m = createRunManifest({ runId: 'RUN-T-0001', experimentId: DEFAULT_EXPERIMENT_ID, ordinal: 1, config: RUN_CFG, requestedMatches: 100, batchSize: 50, segments: [{ index: 0, ordinalStart: 0, ordinalEnd: 100 }] });
  await store.putManifest(m);
  const summaries = fakeSummaries(0, 50);
  const batch = { batchId: 'RUN-T-0001#0', runId: 'RUN-T-0001', batchIndex: 0, segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, matchCount: 50, summariesHash: batchSummariesHash(summaries), committedAt: new Date().toISOString(), summaries };
  const next = commitManifestBatch(m, { batchIndex: 0, segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, matchCount: 50, summariesHash: batch.summariesHash });
  await store.commitRunBatch({ manifest: next, batch });
  // Reopen — durable across store instances (the reload boundary).
  const store2 = new ExperimentStore(idb);
  await store2.open();
  const m2 = await store2.getManifest('RUN-T-0001');
  assert.equal(m2.committedMatches, 50);
  assert.equal((await store2.getRunBatch('RUN-T-0001', 0)).summaries.length, 50);
  assert.equal((await store2.listRunBatches('RUN-T-0001')).length, 1);
  // A failed transaction commits neither side. (The batch must be a VALID
  // next range — strict admission rejects overlapping ordinals before the
  // injected transaction failure would surface.)
  const nextBatchSummaries = fakeSummaries(50, 50);
  idb._failNextTransaction({ name: 'QuotaExceededError' });
  await assert.rejects(() => store2.commitRunBatch({ manifest: m2, batch: { ...batch, batchId: 'RUN-T-0001#1', batchIndex: 1, ordinalStart: 50, ordinalEnd: 100, summaries: nextBatchSummaries, summariesHash: batchSummariesHash(nextBatchSummaries) } }), /QUOTA/i);
  assert.equal((await store2.listRunBatches('RUN-T-0001')).length, 1, 'failed batch commit leaves no partial record');
});

// ── Controller: full chunked lifecycle ───────────────────────────────
test('begin → batch commits → seal produces a completed indexeddb-batches run that contributes', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  for (let o = 0; o < 250; o += 50) {
    const res = await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: o, ordinalEnd: o + 50, summaries: fakeSummaries(o, 50) });
    assert.equal(res.committedMatches, o + 50);
  }
  const rec = await api.finalizeExperimentRun(runId, { durationMs: 1234 });
  assert.equal(rec.run.status, RUN_STATUS.COMPLETED);
  assert.equal(rec.run.payloadKind, 'indexeddb-batches');
  assert.equal(rec.run.metrics.matchCount, 250);
  assert.equal(rec.included, true);
  // The run survives a store reopen with verified payload.
  const listed = (await store.listRuns(DEFAULT_EXPERIMENT_ID)).find(r => r.runId === runId);
  assert.equal(validateRunRecord(listed).status, RUN_STATUS.COMPLETED);
  const payload = await store.getRunPayload(runId);
  assert.equal(verifyRunPayload(listed, payload).ok, true);
  assert.equal(payload.batches.length, 5);
  // No incomplete work remains; the manifest is sealed history.
  assert.equal(api.getIncompleteRuns().length, 0);
  // Durable evidence reads back in ordinal order through the lazy path.
  const batches = await store.listRunBatches(runId);
  assert.equal(batches.length, 5);
  assert.deepEqual(batches.map(b => b.ordinalStart), [0, 50, 100, 150, 200]);
});

test('crash mid-run: committed batches survive; manifest becomes resumable interrupted', async () => {
  const idb = createFakeIndexedDB();
  const first = await initApi(idb);
  const { runId } = await first.api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  for (let o = 0; o < 150; o += 50) {
    await first.api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: o, ordinalEnd: o + 50, summaries: fakeSummaries(o, 50) });
  }
  // Simulate the tab dying and the ownership lease expiring: a fresh
  // controller boots against the same DB after the lease window.
  await expireLease(first.store, runId);
  const second = await initApi(idb);
  const incomplete = second.api.getIncompleteRuns();
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].manifestId, runId);
  assert.equal(incomplete[0].status, MANIFEST_STATUS.INTERRUPTED);
  assert.equal(incomplete[0].committedMatches, 150);
  assert.equal(incomplete[0].requestedMatches, 250);
  assert.equal(incomplete[0].resumable, true);
  // Nothing was claimed completed — no run record exists for it.
  assert.equal(second.api.getExperimentRuns().some(r => r.runId === runId), false);
});

test('resume replans only uncommitted ordinals and seals without duplicates', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  for (let o = 0; o < 150; o += 50) {
    await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: o, ordinalEnd: o + 50, summaries: fakeSummaries(o, 50) });
  }
  await expireLease(store, runId);
  const second = await initApi(idb);
  drivePlan(second.api, { runId });
  const plan = await second.api.resumeExperimentRun(runId);
  assert.equal(plan.resumed !== false, true);
  // Relative worker ranges: only ordinals 150–250 re-simulate.
  assert.deepEqual(plan.segments.map(s => ({ index: s.index, ordinalStart: s.ordinalStart, ordinalEnd: s.ordinalEnd })), [{ index: 0, ordinalStart: 150, ordinalEnd: 250 }]);
  // Executor ran (registered by drivePlan): poll until the seal lands.
  for (let i = 0; i < 200 && !second.api.getExperimentRuns().some(r => r.runId === runId); i += 1) {
    await new Promise(r => setTimeout(r, 10));
  }
  const batches = await store.listRunBatches(runId);
  const ranges = batches.map(b => [b.ordinalStart, b.ordinalEnd]).sort((a, b2) => a[0] - b2[0]);
  // No duplicate committed coverage: ranges are contiguous [0,250).
  assert.deepEqual(ranges, [[0, 50], [50, 100], [100, 150], [150, 200], [200, 250]]);
  const run = second.api.getExperimentRuns().find(r => r.runId === runId);
  assert.equal(run?.status, RUN_STATUS.COMPLETED);
  assert.equal(run?.metrics.matchCount, 250);
});

test('partial seal: interrupted run seals committed evidence with honest requested-vs-committed', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  for (let o = 0; o < 100; o += 50) {
    await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: o, ordinalEnd: o + 50, summaries: fakeSummaries(o, 50) });
  }
  await api.failExperimentRun(runId, 'persistence stalled');
  const rec = await api.finalizeExperimentRun(runId);
  assert.equal(rec.run.status, RUN_STATUS.COMPLETED);
  assert.equal(rec.run.metrics.matchCount, 100);
  assert.equal(rec.run.config.requestedMatchCount, 250);
  assert.equal(rec.run.config.ordinalCoverage.length > 0, true);
  assert.ok(rec.run.retentionNote?.includes('partial'), 'partial seal discloses on the record');
});

test('a cancelled run keeps committed evidence resumable rather than deleting it', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50) });
  await api.cancelExperimentRun(runId);
  const incomplete = api.getIncompleteRuns();
  assert.equal(incomplete[0]?.status, MANIFEST_STATUS.CANCELLED);
  assert.equal(incomplete[0]?.committedMatches, 50);
  assert.equal(incomplete[0]?.resumable, true);
  // Commits to a cancelled manifest are refused — no silent late writes.
  await assert.rejects(() => api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 50, ordinalEnd: 100, summaries: fakeSummaries(50, 50) }), /RUN_MANIFEST_NOT_ACTIVE/);
});

test('persistence failure pauses the run honestly — committed stays committed', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50) });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 50, ordinalEnd: 100, summaries: fakeSummaries(50, 50) });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 100, ordinalEnd: 150, summaries: fakeSummaries(100, 50) });
  idb._failNextTransaction({ name: 'QuotaExceededError' });
  await assert.rejects(() => api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 150, ordinalEnd: 200, summaries: fakeSummaries(150, 50) }), /QUOTA/i);
  await api.failExperimentRun(runId, 'BROWSER_STORAGE_QUOTA_EXCEEDED');
  const manifest = await store.getManifest(runId);
  // The manifest may or may not have persisted the failed transition (the
  // same quota failure can hit it) — either way it never claims > 150.
  assert.ok((manifest?.committedMatches ?? 150) <= 150);
  assert.equal((await store.listRunBatches(runId)).length, 3);
  const incomplete = api.getIncompleteRuns();
  assert.equal(incomplete[0]?.committedMatches <= 150, true);
});

test('three stacked runs: manifests coexist, all seal, all contribute', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const runIds = [];
  for (let r = 0; r < 3; r += 1) {
    const cfg = { ...RUN_CFG, matchCount: 100, ordinalStart: r * 100, ordinalEnd: r * 100 + 100, ordinalBase: r * 100 };
    const segs = [{ index: 0, ordinalStart: r * 100, ordinalEnd: r * 100 + 100 }];
    const { runId } = await api.beginExperimentRun({ config: cfg, segments: segs, batchSize: 50 });
    runIds.push(runId);
    for (let o = r * 100; o < r * 100 + 100; o += 50) {
      await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: o, ordinalEnd: o + 50, summaries: fakeSummaries(o, 50) });
    }
    const rec = await api.finalizeExperimentRun(runId);
    assert.equal(rec.run.status, RUN_STATUS.COMPLETED);
  }
  assert.equal(new Set(runIds).size, 3, 'each run gets its own ordinal/identity');
  const basis = api.getEvidenceBasis();
  assert.equal(basis.includedRunCount, 3);
  assert.equal(basis.includedGames, 300);
  // Reload: all three completed runs are still there with verified payloads.
  const second = await initApi(idb);
  const runs = second.api.getExperimentRuns().filter(r => runIds.includes(r.runId));
  assert.equal(runs.length, 3);
  for (const run of runs) {
    const payload = await store.getRunPayload(run.runId);
    assert.equal(verifyRunPayload(run, payload).ok, true);
  }
  assert.equal(second.api.getIncompleteRuns().length, 0);
});

test('a corrupted committed batch quarantines the run — it contributes zero games', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: { ...RUN_CFG, matchCount: 50 }, segments: [{ index: 0, ordinalStart: 0, ordinalEnd: 50 }], batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50) });
  await api.finalizeExperimentRun(runId);
  // Tamper with the stored batch evidence (post-seal corruption).
  const batch = await store.getRunBatch(runId, 0);
  await store._putAll([['runBatches', { ...batch, summaries: fakeSummaries(0, 50).map(s => ({ ...s, winningSeat: 2 })) }]]);
  await api.applySelection();
  const marked = api.getExperimentRuns().find(r => r.runId === runId);
  assert.equal(runIntegrityState(marked), RUN_INTEGRITY.QUARANTINED);
  assert.equal(api.getIncludedRuns().some(r => r.runId === runId), false, 'corrupt batch evidence contributes nothing');
  assert.equal(api.getEvidenceBasis().quarantinedCount, 1);
  // "Include anyway" can never resurrect corrupted evidence.
  await assert.rejects(() => api.setRunIncluded(runId, { force: true }), /RUN_CORRUPTED/);
});

test('a missing committed batch makes the sealed run payload-unavailable', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: { ...RUN_CFG, matchCount: 50 }, segments: [{ index: 0, ordinalStart: 0, ordinalEnd: 50 }], batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50) });
  await api.finalizeExperimentRun(runId);
  await store._delAll([['runBatches', `${runId}#0`]]);
  await api.applySelection();
  const marked = api.getExperimentRuns().find(r => r.runId === runId);
  assert.equal(runIntegrityState(marked), RUN_INTEGRITY.PAYLOAD_UNAVAILABLE);
  assert.equal(api.getIncludedRuns().some(r => r.runId === runId), false);
});

test('discardManifest removes the manifest and its committed batches', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50) });
  await api.failExperimentRun(runId, 'stopped');
  assert.equal(api.getIncompleteRuns().length, 1);
  await api.discardManifest(runId);
  assert.equal(api.getIncompleteRuns().length, 0);
  assert.equal(await store.getManifest(runId), null);
  assert.equal((await store.listRunBatches(runId)).length, 0);
});

test('lazy detail: a single match loads by id without materializing the run', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: { ...RUN_CFG, matchCount: 100 }, segments: [{ index: 0, ordinalStart: 0, ordinalEnd: 100 }], batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50, { heavy: true }) });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 50, ordinalEnd: 100, summaries: fakeSummaries(50, 50) });
  await api.finalizeExperimentRun(runId);
  const detail = await api.loadRunMatchDetail(runId, 'T-3');
  assert.equal(detail.matchOrdinal, 3);
  assert.ok(detail.rankDecisions, 'heavy detail is retrievable on demand');
  assert.equal(await api.loadRunMatchDetail(runId, 'T-999'), null);
});

test('Wave 0: memory fallback retains inspection but cannot open a durable campaign', async () => {
  const { api, store } = await (async () => {
    const c = await experimentController();
    const s = new ExperimentStore(null);
    await c.api.initExperiments({ bootSummaries: [fakeSummary(9000)], store: s });
    return { api: c.api, store: s };
  })();
  assert.equal(store.persisted, false);
  await assert.rejects(() => api.beginExperimentRun({ config: RUN_CFG }), { code: 'LAB_WAVE0_PERSISTENT_STORAGE_REQUIRED' });
  assert.equal((await store.listManifests()).length, 0);
  assert.ok(api.getExperimentRuns().length > 0, 'bundled/session inspection remains available');
});

test('dossier evidence disclosure lists incomplete runs honestly', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await api.beginExperimentRun({ config: RUN_CFG, segments: RUN_SEGMENTS, batchSize: 50 });
  await api.commitExperimentBatch(runId, { segmentIndex: 0, ordinalStart: 0, ordinalEnd: 50, summaries: fakeSummaries(0, 50) });
  await api.failExperimentRun(runId, 'mid-run fault');
  const evidence = api.collectExperimentEvidence();
  assert.equal(evidence.incompleteRunCount, 1);
  const inc = evidence.incompleteRuns[0];
  assert.equal(inc.manifestId, runId);
  assert.equal(inc.committedMatches, 50);
  assert.equal(inc.requestedMatches, 250);
});
