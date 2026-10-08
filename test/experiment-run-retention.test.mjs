// experiment-run-retention.test.mjs — Evidence-integrity regression tests for
// the run-registration failure class that made a completed 1000-match run
// vanish from MANAGE RUNS and silently revert the Observatory to the bundled
// 100-match corpus.
//
//   A. normal small run — persists, lists, contributes
//   B. payload exceeds archive limit — valid session run, evidence kept
//   C. IndexedDB quota failure — same session fallback
//   D. metadata persistence also fails — run survives in memory, refresh cannot erase it
//   E. large-run scenario — 1000-match session fallback stays the active evidence
//   F. reload semantics — persisted runs rebuild; session-only evidence degrades disclosed
//
// These tests drive the REAL experiment-controller (not just the domain/store)
// through an injected ExperimentStore over a fake IndexedDB, with saveRun
// wrapped to simulate each storage failure mode.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as portability from '../packages/simulation-runtime/src/experiment-portability.mjs';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import { evolutionIdentity } from '../scripts/evolution-identity.mjs';

// ── Minimal browser shims (must precede the controller import) ────
// state.js touches window/document/localStorage at module scope. Everything
// the controller calls (showToast/updateRailContext/rerender) degrades safely
// on these stubs.
globalThis.window = { addEventListener() {} };
globalThis.localStorage = {
  getItem: () => null, setItem() {}, removeItem() {},
};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
  createElement: tag => ({
    tagName: String(tag).toUpperCase(),
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    children: [],
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    remove() {},
    querySelector: () => null,
    innerHTML: '',
    textContent: '',
  }),
  body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
  documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
};

const { state } = await import('../apps/lab-web/src/state.js');
const { ExperimentStore } = await import('../apps/lab-web/src/experiments/experiment-store.mjs');
const domain = await import('../packages/simulation-runtime/src/experiment-domain.mjs');
// Execute current controller source with its generated build identity supplied
// explicitly; the checkout does not contain a generated identity source file.
const source=(await readFile(new URL('../apps/lab-web/src/experiments/experiment-controller.mjs',import.meta.url),'utf8')).replace(/import\s[^;]*?from\s*'[^']*';/gs,'').replace(/^export /gm,'');
const controller=runInNewContext(source+';({initExperiments,recordCampaignRun,recordFailedRun,applySelection,getExperimentRuns,getIncludedRuns,getEvidenceBasis,runsWithCompatibility,experimentsReady})',{...domain,...portability,LAB_IDENTITY:await evolutionIdentity(),ExperimentStore,hashCanonical,state,structuredClone,TextEncoder,setTimeout,queueMicrotask:globalThis.queueMicrotask,console,RULES_VERSION:'4.3.1',ENGINE_VERSION:'4.2.6',LAB_VERSION:'1.0.0',showToast(){},updateRailContext(){},rerender(){}});
const {
  initExperiments, recordCampaignRun, recordFailedRun, applySelection,
  getExperimentRuns, getIncludedRuns, getEvidenceBasis, runsWithCompatibility,
  experimentsReady,
} = controller;
const { BUNDLED_RUN_ID, validateRunRecord, runIntegrityState, RUN_INTEGRITY } = domain;

// ── Minimal fake IndexedDB (same surface as experiment-store.mjs uses) ──
const KEY_PATHS = { experiments: 'experimentId', runs: 'runId', analysisSets: 'analysisSetId', payloads: 'runId' };
function createFakeIndexedDB() {
  const databases = new Map(); // dbName → Map<storeName, Map<key, value>>
  const wrapStore = (table, keyPath) => ({
    get(key) { const req = {}; globalThis.queueMicrotask(() => { req.result = table.get(key); req.onsuccess?.(); }); return req; },
    getAll() { const req = {}; globalThis.queueMicrotask(() => { req.result = [...table.values()]; req.onsuccess?.(); }); return req; },
    put(value, key) { table.set(key ?? value[keyPath], structuredClone(value)); const req = {}; globalThis.queueMicrotask(() => req.onsuccess?.()); return req; },
    delete(key) { table.delete(key); const req = {}; globalThis.queueMicrotask(() => req.onsuccess?.()); return req; },
  });
  const wrapDb = data => ({
    objectStoreNames: { contains: n => data.has(n) },
    createObjectStore(name) { if (!data.has(name)) data.set(name, new Map()); },
    transaction(_names) {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      setTimeout(() => tx.oncomplete?.(), 0);
      tx.objectStore = name => {
        if (!data.has(name)) data.set(name, new Map());
        return wrapStore(data.get(name), KEY_PATHS[name]);
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
  };
}

// ── Fixtures ──────────────────────────────────────────────────────
const fakeSummary = ordinal => ({
  matchId: `RT-${ordinal}`, ordinal, terminationReason: 'NORMAL_VICTORY',
  policyIds: ['score-rush', 'control'], seatOrder: ['P1', 'P2'],
  winner: ordinal % 2 ? 'P2' : 'P1', winningSeat: (ordinal % 2) + 1,
  completedFullTurns: 6, scoreMargin: 3, matchResultHash: `rh-${ordinal}`,
});
const summaries1000 = () => Array.from({ length: 1000 }, (_, i) => fakeSummary(i));
const aggregate1000 = () => ({
  matchCount: 1000, completedMatchCount: 1000, abortCount: 0, drawCount: 0,
  seatWins: { '1': 500, '2': 500 }, seat1WinRate: 0.5,
  rulesVersion: '4.3.1', engineVersion: '4.2.6', labVersion: '1.0.0',
  canonicalResultHash: 'crh-1000', aggregateHash: 'ah-1000', profileId: 'core-advanced-authority',
});
const runConfig = (matchCount = 1000) => ({
  profileId: 'core-advanced-authority', policyIds: ['score-rush', 'control'],
  matchCount, workers: 2, seedStrategy: 'ordinal-hash', ordinalStart: 0, ordinalEnd: matchCount,
});
const fastPath = (matchCount = 1000) => ({
  aggregate: { matchCount, completedMatchCount: matchCount },
  observatory: { mechanics: [], synergies: [] },
});

const quotaError = () => Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'), { code: 'BROWSER_STORAGE_QUOTA_EXCEEDED' });
const tooLargeError = () => Object.assign(new Error('RUN_PAYLOAD_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_PAYLOAD_TOO_LARGE_FOR_BROWSER_ARCHIVE' });

/** Boot a fresh controller session over a fresh or shared fake IndexedDB. */
async function bootController({ idb = null, mutateStore = null, bootMatchCount = 100 } = {}) {
  const database = idb ?? createFakeIndexedDB();
  const store = new ExperimentStore(database);
  await store.open();
  mutateStore?.(store);
  const bootSummaries = [fakeSummary(900001)];
  state.bootState = {
    aggregate: { matchCount: bootMatchCount },
    observatory: { summaries: bootSummaries, rankPower: null, swapMatrix: null, variantAnalytics: null },
    rankPower: null, swapMatrix: null, variantAnalytics: null,
  };
  state.observatory = { summaries: bootSummaries };
  state.aggregate = { matchCount: bootMatchCount };
  await initExperiments({ bootSummaries, bootAggregate: state.bootState.aggregate, store });
  return { store, idb: database };
}

// ── A. Normal small run ───────────────────────────────────────────
test('A: a normal run persists, lists, is included, and drives the analysis', async () => {
  await bootController();
  const summaries = [fakeSummary(0), fakeSummary(1), fakeSummary(2), fakeSummary(3)];
  const rec = await recordCampaignRun({
    config: runConfig(4), result: { durationMs: 12 },
    summaries, aggregate: { ...aggregate1000(), matchCount: 4, completedMatchCount: 4 },
  });
  assert.ok(rec?.run, 'run was recorded');
  assert.equal(rec.persisted, true);
  assert.equal(rec.payloadSessionOnly, false);
  assert.equal(rec.metaFailed, false);
  assert.equal(rec.included, true);
  assert.equal(rec.run.payloadKind, 'indexeddb');
  assert.doesNotThrow(() => validateRunRecord(rec.run));

  // Immediately visible in MANAGE RUNS and the analysis set.
  assert.ok(getExperimentRuns().some(r => r.runId === rec.run.runId), 'run listed in library');
  assert.ok(getIncludedRuns().some(r => r.runId === rec.run.runId), 'run contributes to the set');
  const basis = getEvidenceBasis();
  assert.equal(basis.includedGames, 4);
  assert.equal(basis.fallback, null, 'not on the bundled baseline');

  await applySelection({ fastPath: fastPath(4) });
  assert.equal(state.aggregate.matchCount, 4, 'rail-equivalent match count is the run, not the 100-match corpus');
  assert.equal(state.observatory.summaries.length, 4);
});

// ── B. Payload exceeds archive limit ──────────────────────────────
test('B: oversized payload falls back to a valid session run — evidence still contributes', async () => {
  await bootController({
    mutateStore: store => {
      const orig = store.saveRun.bind(store);
      store.saveRun = async (run, payload) => {
        if (payload) throw tooLargeError();
        return orig(run, null);
      };
    },
  });
  const summaries = summaries1000();
  const rec = await recordCampaignRun({
    config: runConfig(), result: { durationMs: 900 },
    summaries, aggregate: aggregate1000(),
  });
  assert.equal(rec.persisted, true, 'record itself persisted');
  assert.equal(rec.payloadSessionOnly, true);
  assert.equal(rec.metaFailed, false);
  assert.equal(rec.run.payloadKind, 'session');
  // The fallback produced an internally valid record — no RUN_HASH_MISMATCH.
  assert.doesNotThrow(() => validateRunRecord(rec.run));
  assert.match(rec.run.retentionNote ?? '', /session/i);

  assert.ok(getExperimentRuns().some(r => r.runId === rec.run.runId), 'run still listed');
  assert.equal(getEvidenceBasis().includedGames, 1000);

  // Evidence payload survives in session retention and verifies against the seal.
  await applySelection({ fastPath: fastPath() });
  assert.equal(state.observatory.summaries.length, 1000, 'session payload contributed all 1000 summaries');
  assert.equal(state.aggregate.matchCount, 1000);
  assert.equal(runIntegrityState(rec.run), 'ok', 'run was not flagged payload-missing');
});

// ── C. IndexedDB quota failure ────────────────────────────────────
test('C: QuotaExceededError on the payload write produces the same session fallback', async () => {
  await bootController({
    mutateStore: store => {
      const orig = store.saveRun.bind(store);
      store.saveRun = async (run, payload) => {
        if (payload) throw quotaError();
        return orig(run, null);
      };
    },
  });
  const rec = await recordCampaignRun({
    config: runConfig(50), result: {},
    summaries: Array.from({ length: 50 }, (_, i) => fakeSummary(i)),
    aggregate: { ...aggregate1000(), matchCount: 50, completedMatchCount: 50 },
  });
  assert.equal(rec.payloadSessionOnly, true);
  assert.equal(rec.run.payloadKind, 'session');
  assert.doesNotThrow(() => validateRunRecord(rec.run));
  assert.ok(getExperimentRuns().some(r => r.runId === rec.run.runId));
  await applySelection({ fastPath: fastPath(50) });
  assert.equal(state.observatory.summaries.length, 50);
  assert.equal(state.aggregate.matchCount, 50);
});

// ── D. Metadata persistence also fails ────────────────────────────
test('D: when even run metadata cannot persist the run survives in memory and refreshes cannot erase it', async () => {
  const { store } = await bootController({
    mutateStore: s => {
      s.saveRun = async () => { throw quotaError(); };
    },
  });
  const summaries = summaries1000();
  const rec = await recordCampaignRun({
    config: runConfig(), result: {}, summaries, aggregate: aggregate1000(),
  });
  assert.equal(rec.persisted, false);
  assert.equal(rec.metaFailed, true, 'metadata failure is disclosed, not hidden');
  assert.equal(rec.run.payloadKind, 'session');
  assert.doesNotThrow(() => validateRunRecord(rec.run));
  assert.match(rec.run.retentionNote ?? '', /will not survive reload/i);

  // MANAGE RUNS can still render it; it is eligible for the analysis set.
  const rows = runsWithCompatibility();
  const row = rows.find(r => r.run.runId === rec.run.runId);
  assert.ok(row, 'run present in the panel row model');
  assert.equal(row.included, true);
  assert.equal(row.persistence, 'session-record');
  assert.equal(row.run.metrics.matchCount, 1000);

  const basis = getEvidenceBasis();
  assert.equal(basis.includedGames, 1000);
  assert.equal(basis.memoryOnlyRunCount, 1);
  assert.equal(basis.persisted, true, 'store itself is durable — only this run failed');

  // Analysis consumes the in-memory evidence — no fallback to the corpus.
  await applySelection({ fastPath: fastPath() });
  assert.equal(state.observatory.summaries.length, 1000);
  assert.equal(state.aggregate.matchCount, 1000, 'active aggregate is the run, not the 100-match corpus');
  assert.equal(getEvidenceBasis().fallback, null);

  // A subsequent store refresh that cannot see the memory run must not erase it.
  const listed = await store.listRuns();
  assert.ok(!listed.some(r => r.runId === rec.run.runId), 'precondition: store truly lacks the record');
  await recordFailedRun({ config: runConfig(10), error: 'boom' }); // triggers _refreshRuns (its own write also fails → memory-only too)
  assert.ok(getExperimentRuns().some(r => r.runId === rec.run.runId), 'memory-only run survived a store refresh');

  // Even a listRuns hard failure keeps the in-memory view intact.
  const origList = store.listRuns.bind(store);
  store.listRuns = async () => { throw new Error('IDB dead'); };
  await recordFailedRun({ config: runConfig(10), error: 'boom2' });
  assert.ok(getExperimentRuns().some(r => r.runId === rec.run.runId), 'run survives when listRuns itself fails');
  store.listRuns = origList;
});

// ── E. Large-run scenario ─────────────────────────────────────────
test('E: a 1000-match run under session fallback stays the active evidence end-to-end', async () => {
  await bootController({
    mutateStore: store => {
      const orig = store.saveRun.bind(store);
      store.saveRun = async (run, payload) => {
        if (payload) throw tooLargeError();
        return orig(run, null);
      };
    },
  });
  const rec = await recordCampaignRun({
    config: runConfig(), result: { durationMs: 4200 },
    summaries: summaries1000(), aggregate: aggregate1000(),
  });
  assert.equal(rec.run.metrics.matchCount, 1000, 'run metrics report 1000 games');
  await applySelection({ fastPath: fastPath() });
  assert.equal(state.observatory.summaries.length, 1000);
  assert.equal(state.aggregate.matchCount, 1000, 'aggregate is the 1000-match evidence');
  const basis = getEvidenceBasis();
  assert.equal(basis.includedGames, 1000, 'Evidence Basis reports 1000 included games');
  assert.equal(basis.fallback, null, 'never fell back to the bundled 100-match corpus');
  assert.equal(state.aggregate.matchCount !== 100, true, 'rail-equivalent count did not revert to baseline');
});

// ── F. Reload semantics ───────────────────────────────────────────
test('F1: a persisted run and its set membership survive a store reopen', async () => {
  const { idb } = await bootController();
  const summaries = [fakeSummary(0), fakeSummary(1)];
  const rec = await recordCampaignRun({
    config: runConfig(2), result: {},
    summaries, aggregate: { ...aggregate1000(), matchCount: 2, completedMatchCount: 2 },
  });
  assert.equal(rec.persisted, true);

  // "Reload": new store over the same database, fresh controller session.
  await bootController({ idb });
  const runs = getExperimentRuns();
  const restored = runs.find(r => r.runId === rec.run.runId);
  assert.ok(restored, 'run record still listed after reload');
  assert.ok(getIncludedRuns().some(r => r.runId === rec.run.runId), 'analysis-set membership restored');
  const payload = await (await new ExperimentStore(idb).open()).getRunPayload(rec.run.runId);
  assert.equal(payload.summaries.length, 2, 'durable payload intact');
});

test('F2: a session-payload run degrades disclosed after reload — record kept, flagged, never silently counted', async () => {
  const { idb } = await bootController({
    mutateStore: store => {
      const orig = store.saveRun.bind(store);
      store.saveRun = async (run, payload) => {
        if (payload) throw tooLargeError();
        return orig(run, null);
      };
    },
  });
  const rec = await recordCampaignRun({
    config: runConfig(8), result: {},
    summaries: Array.from({ length: 8 }, (_, i) => fakeSummary(i)),
    aggregate: { ...aggregate1000(), matchCount: 8, completedMatchCount: 8 },
  });
  assert.equal(rec.run.payloadKind, 'session');

  // Reload: the record is durable, the session payload is gone.
  await bootController({ idb });
  const restored = getExperimentRuns().find(r => r.runId === rec.run.runId);
  assert.ok(restored, 'session-run record is still listed');
  await applySelection();
  const flagged = getExperimentRuns().find(r => r.runId === rec.run.runId);
  assert.equal(runIntegrityState(flagged), RUN_INTEGRITY.PAYLOAD_UNAVAILABLE, 'missing session evidence is flagged, not silently contributed');
  assert.equal(getEvidenceBasis().fallback, 'certified-baseline', 'fallback is disclosed via the evidence basis');
  assert.equal(state.aggregate.matchCount, 100, 'boot corpus restored — a disclosed fallback, not a hidden one');
});

test('F3: a memory-only run honestly disappears on reload (it was never durable)', async () => {
  const { idb } = await bootController({
    mutateStore: store => { store.saveRun = async () => { throw quotaError(); }; },
  });
  const rec = await recordCampaignRun({
    config: runConfig(6), result: {},
    summaries: Array.from({ length: 6 }, (_, i) => fakeSummary(i)),
    aggregate: { ...aggregate1000(), matchCount: 6, completedMatchCount: 6 },
  });
  assert.equal(rec.metaFailed, true);
  await bootController({ idb });
  assert.ok(!getExperimentRuns().some(r => r.runId === rec.run.runId), 'memory-only run is gone after reload — as disclosed');
});

// ── Registry sanity ───────────────────────────────────────────────
test('controller remains ready and the bundled corpus stays registered throughout', async () => {
  await bootController();
  assert.equal(experimentsReady(), true);
  assert.ok(getExperimentRuns().some(r => r.runId === BUNDLED_RUN_ID));
});
