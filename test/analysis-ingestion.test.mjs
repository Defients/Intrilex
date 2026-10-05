/* global queueMicrotask */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { strategyEvidenceForGame, createStrategyEvidenceWriter, ingestRunEvidence, runProvenance } from '../packages/simulation-runtime/src/strategy-live.mjs';
import { classifyStrategySource } from '../packages/simulation-runtime/src/strategy-evidence.mjs';
import { StrategyStore } from '../apps/lab-web/src/strategy/strategy-store.mjs';

// In-memory IndexedDB stand-in — same coverage pattern as
// strategy-v121-correction.test.mjs, extended with the 'provenance' store.
const keyEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fakeRequest() { return { result: undefined, error: null }; }
function memoryIdbFactory() {
  const stores = new Map();
  const ensure = (name, keyPath) => { if (!stores.has(name)) stores.set(name, { keyPath, indexes: new Map(), data: new Map() }); return stores.get(name); };
  const matchesIndex = (row, spec, only) => {
    if (only === undefined) return true;
    const v = row?.[spec.keyPath];
    return spec.multiEntry ? (Array.isArray(v) && v.some(x => keyEq(x, only))) : keyEq(v, only);
  };
  function cursorReq(r, rows) {
    let i = 0;
    const step = () => {
      r.result = i < rows.length ? { value: rows[i], continue: () => { i++; queueMicrotask(step); } } : null;
      r.onsuccess?.();
    };
    queueMicrotask(step); return r;
  }
  function transaction() {
    const tx = { aborted: false, error: null, oncomplete: null, onabort: null, onerror: null,
      objectStore: n => storeObj(n),
      abort() { if (tx.aborted) return; tx.aborted = true; tx.error = new Error('ABORTED'); queueMicrotask(() => tx.onabort?.()); } };
    setTimeout(() => { if (!tx.aborted) tx.oncomplete?.(); }, 0);
    return tx;
  }
  function storeObj(name) {
    const s = ensure(name);
    return {
      keyPath: s.keyPath,
      indexNames: { contains: n => s.indexes.has(n) },
      createIndex(n, keyPath, opts = {}) { s.indexes.set(n, { keyPath, multiEntry: !!opts.multiEntry }); },
      index(n) { const spec = s.indexes.get(n); return {
        count(range) { const r = fakeRequest(); queueMicrotask(() => { r.result = [...s.data.values()].filter(row => matchesIndex(row, spec, range?.__only)).length; r.onsuccess?.(); }); return r; },
        openCursor(range) { const rows = [...s.data.values()].filter(row => matchesIndex(row, spec, range?.__only)); return cursorReq(fakeRequest(), rows); } }; },
      get(key) { const r = fakeRequest(); queueMicrotask(() => { r.result = s.data.get(key); r.onsuccess?.(); }); return r; },
      getAll() { const r = fakeRequest(); queueMicrotask(() => { r.result = [...s.data.values()]; r.onsuccess?.(); }); return r; },
      add(value) { const r = fakeRequest(); queueMicrotask(() => { s.data.set(value[s.keyPath], value); r.onsuccess?.(); }); return r; },
      put(value) { const r = fakeRequest(); queueMicrotask(() => { s.data.set(value[s.keyPath], value); r.onsuccess?.(); }); return r; },
      delete(key) { const r = fakeRequest(); queueMicrotask(() => { s.data.delete(key); r.onsuccess?.(); }); return r; },
      openCursor(range) { const rows = [...s.data.values()].filter(row => range === undefined || keyEq(row[s.keyPath], range.__only)); return cursorReq(fakeRequest(), rows); }
    };
  }
  const db = { objectStoreNames: { contains: n => stores.has(n) }, transaction, close() {}, onversionchange: null };
  db.createObjectStore = (n, opts) => { const s = ensure(n, opts.keyPath); return { indexNames: { contains: i => s.indexes.has(i) }, createIndex(i, keyPath, o = {}) { s.indexes.set(i, { keyPath, multiEntry: !!o.multiEntry }) } }; };
  return {
    open() {
      const request = fakeRequest();
      const firstOpen = stores.size === 0;
      if (firstOpen) for (const [name, keyPath] of [['evidence','artifactId'],['sources','artifactId'],['events','eventId'],['replays','replayHash'],['studies','artifactId'],['claims','artifactId'],['archives','archiveId'],['informationSets','artifactId'],['informationPlans','artifactId'],['informationStudies','artifactId'],['provenance','id']]) ensure(name, keyPath);
      queueMicrotask(() => {
        request.result = db;
        request.transaction = transaction();
        if (firstOpen) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}
globalThis.IDBKeyRange = globalThis.IDBKeyRange ?? { only: key => ({ __only: key }) };

// ── Real run fixtures ──────────────────────────────────────────────────
const identity = await evolutionIdentity();
const traced = (await runLabSeries({ botA: 'value', botB: 'tempo', gameCount: 4, seed: 1337, workerCount: 1, strategicTrace: true, kind: 'EVALUATION', mirrorSeats: true }, { identity, createdAt: '2026-10-04T16:00:00.000Z' })).run;
const untraced = (await runLabSeries({ botA: 'value', botB: 'tempo', gameCount: 4, seed: 4242, workerCount: 1, kind: 'SELF_PLAY', mirrorSeats: true }, { identity, createdAt: '2026-10-05T16:00:00.000Z' })).run;
assert.equal(traced.status, 'COMPLETE');
assert.equal(untraced.status, 'COMPLETE');
const scope = { fingerprint: identity.fingerprint, rulesProfile: traced.config.profileId, eraId: identity.fingerprint, subject: 'family:draw' };

// ── Automatic ingestion ────────────────────────────────────────────────
test('every finalized Arena record registers exactly one analysis source', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const stats = await ingestRunEvidence(store, traced);
  assert.equal(stats.committed, traced.records.length);
  assert.equal(stats.failed, 0);
  const sources = await store.listSources();
  assert.equal(sources.length, traced.records.length, 'one analysis record per finalized game');
  assert.deepEqual(sources.map(s => s.ordinal).sort((a, b) => a - b), traced.records.map(r => r.ordinal).sort((a, b) => a - b));
  assert.ok(sources.every(s => s.runId === traced.runId && s.origin === 'LOCAL' && s.purpose === 'EVALUATION' && s.fidelity === 'FULL_DECISION_EVIDENCE' && s.clean));
  assert.ok(sources.every(s => s.fingerprint === identity.fingerprint && s.rulesProfile === traced.config.profileId));
});

test('untraced Arena games still register as analysis records', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const stats = await ingestRunEvidence(store, untraced);
  assert.equal(stats.committed, untraced.records.length);
  const sources = await store.listSources();
  assert.equal(sources.length, untraced.records.length);
  // Untraced games carry per-seat behavior aggregates (PARTIAL) — never full
  // decision context — so they index without fabricating telemetry.
  assert.ok(sources.every(s => s.fidelity === 'PARTIAL_OBSERVATIONAL_EVIDENCE' && s.eventCount === 0 && s.purpose === 'SELF_PLAY'));
});

test('re-ingesting the same run produces zero duplicates', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, traced);
  const first = await store.listSources();
  await ingestRunEvidence(store, traced);
  await ingestRunEvidence(store, traced);
  const second = await store.listSources();
  assert.equal(second.length, first.length);
  assert.deepEqual(second.map(s => s.artifactId).sort(), first.map(s => s.artifactId).sort());
});

test('resume-style partial then full ingestion commits only missing games', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const writer = createStrategyEvidenceWriter(store);
  for (const record of traced.records.slice(0, 2)) await writer.offer(traced, record);
  await writer.flush();
  assert.equal((await store.listSources()).length, 2);
  const stats = await ingestRunEvidence(store, traced);
  assert.equal(stats.committed, traced.records.length, 'all records offered; dedup keeps one copy');
  const sources = await store.listSources();
  assert.equal(sources.length, traced.records.length);
});

// ── Provenance ─────────────────────────────────────────────────────────
test('run provenance records producer, origin, rules, fingerprint and lineage', async () => {
  const p = runProvenance(traced);
  assert.equal(p.producer, 'ARENA');
  assert.equal(p.origin, 'LOCAL');
  assert.equal(p.purpose, 'EVALUATION');
  assert.equal(p.rulesProfile, traced.config.profileId);
  assert.equal(p.fingerprint, identity.fingerprint);
  assert.equal(p.checkpointIds.length, 2);
  assert.equal(p.matrixId, null);
});

test('ingestion writes one provenance row per run', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, traced);
  const rows = await store.listProvenance();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].runId, traced.runId);
  assert.equal(rows[0].producer, 'ARENA');
  // Repeat ingestion: identical row deduplicates.
  await ingestRunEvidence(store, traced);
  assert.equal((await store.listProvenance()).length, 1);
});

test('Batch Matrix cell runs carry matrix provenance', async () => {
  const cell = structuredClone(traced);
  cell.matrixCell = { matrixId: 'MX-deadbeef01', seatA: 'P-alpha', seatB: 'P-beta' };
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, cell);
  const rows = await store.listProvenance();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].producer, 'BATCH_MATRIX');
  assert.equal(rows[0].matrixId, 'MX-deadbeef01');
  assert.equal(rows[0].seatA, 'P-alpha');
  assert.equal(rows[0].seatB, 'P-beta');
});

test('contradictory provenance under the same key fails closed', async () => {
  const cell = structuredClone(traced);
  cell.matrixCell = { matrixId: 'MX-deadbeef01', seatA: 'P-alpha', seatB: 'P-beta' };
  const other = structuredClone(traced);
  other.matrixCell = { matrixId: 'MX-different02', seatA: 'P-alpha', seatB: 'P-beta' };
  const store = new StrategyStore(memoryIdbFactory());
  await store.registerRun(cell);
  await assert.rejects(() => store.registerRun(other), /STRATEGY_IMMUTABLE_CONFLICT/);
});

// ── Imported artifacts ─────────────────────────────────────────────────
test('imported Arena artifact registers games with IMPORTED_UNVERIFIED provenance', async () => {
  const imported = structuredClone(traced);
  imported.evidenceOrigin = 'IMPORTED_UNVERIFIED'; // parseLabImport marks copies
  const store = new StrategyStore(memoryIdbFactory());
  const stats = await ingestRunEvidence(store, imported);
  assert.equal(stats.committed, imported.records.length);
  const sources = await store.listSources();
  assert.equal(sources.length, imported.records.length);
  assert.ok(sources.every(s => s.origin === 'IMPORTED_UNVERIFIED'));
  const rows = await store.listProvenance();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].origin, 'IMPORTED_UNVERIFIED');
});

test('importing the same artifact twice never duplicates records', async () => {
  const imported = structuredClone(traced);
  imported.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, imported);
  await ingestRunEvidence(store, structuredClone(imported));
  assert.equal((await store.listSources()).length, imported.records.length);
});

test('a locally produced run later imported keeps both claims without double-counting', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, traced);
  const imported = structuredClone(traced);
  imported.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  await ingestRunEvidence(store, imported);
  const sources = await store.listSources();
  // Origin is sealed into the artifact identity, so the imported copy is a
  // distinct claim about the same games — not a silent merge into LOCAL.
  assert.equal(sources.length, traced.records.length * 2);
  const pairs = new Set(sources.map(s => `${s.runId}|${s.ordinal}`));
  assert.equal(pairs.size, traced.records.length, 'same games, two provenance claims each');
  const importedRows = sources.filter(s => s.origin === 'IMPORTED_UNVERIFIED');
  assert.equal(importedRows.length, traced.records.length);
  // Event identity dedups across claims: the decision-level sample does not double.
  const aggregate = await store.aggregate(scope);
  const single = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(single, traced);
  const singleAggregate = await single.aggregate(scope);
  assert.equal(aggregate.total.opportunities, singleAggregate.total.opportunities);
  assert.equal((await store.listProvenance()).length, 2, 'local and imported registrations coexist');
});

// ── Strategy visibility ────────────────────────────────────────────────
test('ingested Arena decisions are readable through the Strategy aggregate', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, traced);
  const aggregate = await store.aggregate(scope);
  const expected = traced.records.flatMap(r => r.strategyDecisions ?? []).length;
  assert.ok(expected > 0, 'fixture has decision events');
  assert.ok(aggregate.total.opportunities > 0);
  const decisions = await store.decisions(scope);
  assert.ok(decisions.length > 0);
});

test('exported bundle re-import is byte-identical dedup, not duplication', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  await ingestRunEvidence(store, traced);
  const bundle = await store.exportBundle(scope);
  const before = await store.listSources();
  const importedCount = await store.importBundle(JSON.stringify(bundle));
  assert.equal(importedCount, bundle.evidence.length);
  assert.equal((await store.listSources()).length, before.length, 'import deduplicates by sealed artifact identity');
});

test('aborted/fault games register as non-clean evidence, not fabricated decisions', async () => {
  const record = structuredClone(traced.records[0]);
  record.terminationReason = 'WORKER_FAULT';
  record.winner = 'ABORTED';
  record.strategyDecisions = [];
  record.seatBehavior = [];
  const { evidence } = strategyEvidenceForGame(traced, record);
  assert.equal(evidence.clean, false);
  assert.equal(evidence.fidelity, 'SUMMARY_ONLY');
  const store = new StrategyStore(memoryIdbFactory());
  const stats = await ingestRunEvidence(store, { ...structuredClone(traced), records: [record] });
  assert.equal(stats.committed, 1);
  const sources = await store.listSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].clean, false);
});

test('classification reports the honest fidelity of an untraced run', () => {
  const summary = classifyStrategySource(untraced);
  assert.equal(summary.fidelity, 'PARTIAL_OBSERVATIONAL_EVIDENCE');
  assert.equal(summary.aggregateGames, untraced.records.length);
});

// ── Writer + registration ordering ─────────────────────────────────────
test('streamed games register run provenance exactly once', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const writer = createStrategyEvidenceWriter(store);
  for (const record of traced.records) await writer.offer(traced, record);
  const stats = await writer.flush();
  assert.equal(stats.committed, traced.records.length);
  assert.equal((await store.listProvenance()).length, 1);
});

test('indexing failure is reported without invalidating the run', async () => {
  const inner = memoryIdbFactory();
  const store = new StrategyStore(inner);
  let failOnce = true;
  const real = store.addEvidence.bind(store);
  store.addEvidence = async (e, r) => { if (failOnce) { failOnce = false; throw new Error('INJECTED_QUOTA'); } return real(e, r); };
  const stats = await ingestRunEvidence(store, traced);
  assert.equal(stats.failed, 1);
  assert.ok(stats.error.includes('INJECTED_QUOTA'));
  assert.equal((await store.listSources()).length, traced.records.length - 1, 'committed games survive a failed index write');
  // Retry is idempotent and fills the gap.
  const retry = await ingestRunEvidence(store, traced);
  assert.equal(retry.failed, 0);
  assert.equal((await store.listSources()).length, traced.records.length);
});

// ── Lab ledger on import ───────────────────────────────────────────────
// Mirrors the matrix import handler: admissible constituent runs persist to
// the run ledger (Lab history); foreign-fingerprint runs fail closed and stay
// analysis-index only.
test('imported matrix cell runs enter Lab history; foreign fingerprints fail closed', async () => {
  const { EvolutionStore } = await import('../apps/lab-web/dist/evolution/evolution-store.mjs');
  const lab = new EvolutionStore(identity, memoryIdbFactory());
  const cellRun = structuredClone(untraced);
  cellRun.matrixCell = { matrixId: 'MX-deadbeef01', seatA: 'P-alpha', seatB: 'P-beta' };
  cellRun.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  await lab.save(cellRun);
  assert.ok((await lab.list()).some(h => h.runId === cellRun.runId), 'imported cell run appears in Lab history');
  await lab.save(cellRun);
  assert.equal((await lab.list()).filter(h => h.runId === cellRun.runId).length, 1, 're-import stays one row');
  const foreign = structuredClone(untraced);
  foreign.runId = `EL-${'f'.repeat(24)}`;
  foreign.identity = { ...foreign.identity, fingerprint: '0'.repeat(64) };
  await assert.rejects(() => lab.save(foreign));
  assert.ok(!(await lab.list()).some(h => h.runId === foreign.runId), 'foreign-fingerprint run is not admitted to the ledger');
});
