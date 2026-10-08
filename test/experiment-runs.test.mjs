import * as browserCapacity from '../packages/simulation-runtime/src/browser-capacity.mjs';
import { AggregateWorker } from './fixtures/aggregate-worker.mjs';
import { trustedSummary } from './fixtures/admission-fixtures.mjs';
import * as admissionContract from '../packages/simulation-runtime/src/evidence-admission.mjs';
import { evolutionIdentity } from '../scripts/evolution-identity.mjs';
const LAB_IDENTITY = await evolutionIdentity();
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
  manifestRemainingSegments, manifestCommittedCoverage,
  batchSummariesHash, slimSummary,
  nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
  contributingRuns, evidenceBasis, previewSelectionMetrics,
  includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
  planMigration, validateRunRecord, runIdFor, bundledBaselineRun,
  payloadEvidenceHash, verifyRunPayload, markRunIntegrity, runIntegrityState,
  runAnalyticallyEligible,
} from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { summariesCarryDecisionEvidence } from '../packages/simulation-runtime/src/experiment-portability.mjs';
import { ExperimentStore } from '../apps/lab-web/src/experiments/experiment-store.mjs';
import { buildAnalysisDossier, renderAnalysisDossierMarkdown } from '../apps/lab-web/src/analysis-dossier.js';

// ── Minimal fake IndexedDB ────────────────────────────────────────
// Implements just the surface experiment-store.mjs uses so tests exercise the
// real IDB code path (transactions, keyPaths, getAll) and true "reopen"
// roundtrips — not just the memory fallback.
const KEY_PATHS = { experiments: 'experimentId', runs: 'runId', analysisSets: 'analysisSetId', payloads: 'runId', manifests: 'manifestId', runBatches: 'batchId' };
function createFakeIndexedDB() {
  const databases = new Map(); // dbName → Map<storeName, Map<key, value>>
  let failNextTransaction = null; // error object → tx aborts with it
  const wrapDb = data => ({
    objectStoreNames: { contains: n => data.has(n) },
    createObjectStore(name) { if (!data.has(name)) data.set(name, new Map()); },
    transaction(_names) {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      // Stage writes: a real IDB transaction commits all-or-nothing — an
      // abort must leave no partial record.
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
const fakeSummary = (ordinal, { winningSeat = 1, terminationReason = 'NORMAL_VICTORY' } = {}) => trustedSummary({
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

// ═══════════════════════════════════════════════════════════════
// Integrity hardening — the forensic pass:
//   1. retention bookkeeping (payloadKind/retentionNote) is OUTSIDE runHash
//      so the session-only fallback survives validation instead of
//      disappearing as RUN_HASH_MISMATCH (the reported P1 defect)
//   2. payloadHash seals the exact evidence payload — verified on load,
//      never before analytics
//   3. corrupt records and failed payloads are quarantined — inspectable,
//      disclosed, analytically ineligible forever (no force-include)
// ═══════════════════════════════════════════════════════════════

test('runHash excludes retention bookkeeping; the schema-1.0 hash envelope still validates', () => {
  const run = mkRun(1);
  // The exact fallback shape _persistRunAndPayload writes after a quota
  // rejection — retention state must never masquerade as evidence.
  const sessionized = { ...run, payloadKind: 'session', retentionNote: 'Evidence payload retained for this session only' };
  assert.doesNotThrow(() => validateRunRecord(sessionized), 'retention fallback must not trip RUN_HASH_MISMATCH');
  // A truly schema-1.0 record: payloadHash field absent, hash computed over
  // the old envelope that DID include payloadKind.
  const { payloadHash: _ph, ...onePointZero } = run;
  const { lifecycle: _l, runHash: _h, compatibilityFingerprint: _f, payloadKind, ...evidence } = onePointZero;
  const legacy = { ...onePointZero, runHash: hashCanonical({ ...evidence, payloadKind }) };
  assert.doesNotThrow(() => validateRunRecord(legacy));
  // But tampering with actual evidence still fails under both formulas.
  const tampered = { ...legacy, metrics: { ...legacy.metrics, matchCount: 999 } };
  assert.throws(() => validateRunRecord(tampered), /RUN_HASH_MISMATCH/);
});

test('payloadHash seals analytical content only — incidental storage fields are not evidence', () => {
  const payload = { summaries: [fakeSummary(0)], aggregate: { matchCount: 1 } };
  const sealed = mkRun(1, { payloadHash: payloadEvidenceHash(payload) });
  // Same analytical content + incidental storage bookkeeping → same hash.
  const stored = { runId: 'RUN-X', storedAt: '2026-01-01T00:00:00Z', ...payload };
  assert.equal(verifyRunPayload(sealed, stored).ok, true);
  assert.equal(verifyRunPayload(sealed, stored).verified, true);
  // Tampered content fails; missing payload fails; unsealed legacy passes unverified.
  assert.equal(verifyRunPayload(sealed, { summaries: [fakeSummary(7)], aggregate: null }).code, 'RUN_PAYLOAD_HASH_MISMATCH');
  assert.equal(verifyRunPayload(sealed, null).code, 'RUN_PAYLOAD_MISSING');
  const legacy = mkRun(2); // payloadHash null — schema 1.0
  const v = verifyRunPayload(legacy, null);
  assert.equal(v.ok, true);
  assert.equal(v.verified, false);
});

test('markRunIntegrity quarantines a run without breaking its record hash — and it can never contribute', () => {
  const run = mkRun(1);
  const quarantined = markRunIntegrity(run, { state: RUN_INTEGRITY.QUARANTINED, code: 'RUN_PAYLOAD_HASH_MISMATCH', note: 'tampered payload' });
  assert.doesNotThrow(() => validateRunRecord(quarantined), 'integrity marks are lifecycle state — the sealed evidence is untouched');
  assert.equal(runIntegrityState(quarantined), 'quarantined');
  assert.equal(runAnalyticallyEligible(quarantined), false);
  let set = createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID });
  set = includeRunInSet(set, run.runId);
  assert.equal(contributingRuns([quarantined], set).length, 0, 'an includedRunId pointing at a quarantined record yields zero contribution');
  const basis = evidenceBasis([quarantined], set);
  assert.equal(basis.quarantinedCount, 1);
  assert.ok(basis.integrityFailures.some(f => f.runId === run.runId && f.code === 'RUN_PAYLOAD_HASH_MISMATCH'));
});

// ── Real controller path (vm) ────────────────────────────────────
// The reported defect lives in _persistRunAndPayload → saveRun(sessionRun)
// → validateRunRecord → listRuns — only the real controller exercises it.
// Browser imports are stubbed; domain + store are the real modules.

async function experimentController({ state: stateOverrides = {} } = {}) {
  const src = (await readFile('apps/lab-web/src/experiments/experiment-controller.mjs', 'utf8'))
    .replace(/import\s[^;]*?from\s*'[^']*';/gs, '')
    .replace(/^export /gm, '');
  const state = { bootState: null, observatory: {}, aggregate: {}, evidenceBasis: null, ...stateOverrides };
  const toasts = [];
  const sandbox = { ...browserCapacity, ...admissionContract,
    console, structuredClone, TextEncoder, setTimeout, clearTimeout, queueMicrotask: globalThis.queueMicrotask,
    Worker: AggregateWorker,
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
    manifestRemainingSegments, manifestCommittedCoverage,
    runIdFor, batchSummariesHash, slimSummary,
    nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
    contributingRuns, evidenceBasis, previewSelectionMetrics,
    includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
    planMigration, payloadEvidenceHash, verifyRunPayload, markRunIntegrity,
    runIntegrityState, runAnalyticallyEligible, validateRunRecord,
    summariesCarryDecisionEvidence,
  };
  const api = runInNewContext(`${src}\n({ initExperiments, recordCampaignRun, recordFailedRun, recordCancelledRun, experimentsReady, storePersisted, getExperiment, getExperimentRuns, getActiveAnalysisSet, getIncludedRuns, getEvidenceBasis, runsWithCompatibility, previewRunSelection, allRunIds, nextRunOrdinalStart, setRunIncluded, setRunExcluded, markRunInvalidated, markRunArchived, markRunRestored, markRunPinned, includeAllCompatible, isolateRun, restoreBaseline, deleteRun, applySelection, collectExperimentEvidence })`, sandbox);
  return { api, state, toasts };
}

const campaignArgs = { config: { matchCount: 1, profileId: 'core-advanced-authority', policyIds: ['score-rush', 'control'] }, summaries: [fakeSummary(0)], aggregate: { matchCount: 1 } };

test('P1 regression — quota fallback records a session-only run that persists, stays visible, and contributes this session', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await experimentController();
  const store = new ExperimentStore(idb);
  await api.initExperiments({ bootSummaries: [fakeSummary(100)], store });
  // Force the payload-write transaction to abort with quota — the exact
  // reported failure in _persistRunAndPayload.
  idb._failNextTransaction({ name: 'QuotaExceededError' });
  const rec = await api.recordCampaignRun(campaignArgs);
  assert.equal(rec.run.payloadKind, 'session');
  assert.equal(rec.payloadSessionOnly, true);
  assert.equal(rec.persisted, true, 'the session-fallback record must persist — previously it died on RUN_HASH_MISMATCH and vanished');
  assert.ok(api.getExperimentRuns().some(r => r.runId === rec.run.runId), 'session-only run stays visible in the run library');
  assert.ok(api.getIncludedRuns().some(r => r.runId === rec.run.runId), 'session evidence contributes during the session');
  // Reload against the same database — the record survives with honest
  // retention disclosure, and it still passes validation.
  const reopened = new ExperimentStore(idb);
  await reopened.open();
  const persisted = (await reopened.listRuns(DEFAULT_EXPERIMENT_ID)).find(r => r.runId === rec.run.runId);
  assert.ok(persisted, 'session-only run record survives a store reopen');
  assert.equal(persisted.corrupt, undefined);
  assert.equal(persisted.payloadKind, 'session');
  assert.match(persisted.retentionNote ?? '', /session only/i);
});

test('session-only payload sealed at record time verifies while it exists; a reopened app honestly marks it payload-unavailable', async () => {
  const idb = createFakeIndexedDB();
  const first = await experimentController();
  await first.api.initExperiments({ bootSummaries: [fakeSummary(100)], store: new ExperimentStore(idb) });
  idb._failNextTransaction({ name: 'QuotaExceededError' });
  const rec = await first.api.recordCampaignRun(campaignArgs);
  // Boot 2: a fresh controller (empty _sessionPayloads) over the same db —
  // the run is there, its payload is not. That is disclosed, not hidden.
  const second = await experimentController();
  await second.api.initExperiments({ bootSummaries: [fakeSummary(100)], store: new ExperimentStore(idb) });
  const listed = second.api.getExperimentRuns().find(r => r.runId === rec.run.runId);
  assert.ok(listed, 'session run persists across reload');
  assert.equal(listed.payloadKind, 'session');
  await second.api.applySelection();
  const marked = second.api.getExperimentRuns().find(r => r.runId === rec.run.runId);
  assert.equal(marked.lifecycle?.integrity?.state, 'payload-unavailable');
  assert.equal(marked.lifecycle?.integrity?.code, 'RUN_PAYLOAD_MISSING');
  assert.equal(second.api.getIncludedRuns().some(r => r.runId === rec.run.runId), false, 'a run with no evidence payload cannot contribute');
  assert.equal(second.api.getEvidenceBasis().payloadUnavailableCount, 1);
  assert.ok(second.toasts.some(t => t.title === 'Evidence integrity'), 'eviction is disclosed, never silent');
  await assert.rejects(() => second.api.setRunIncluded(rec.run.runId, { force: true }), /RUN_PAYLOAD_UNAVAILABLE/);
});

test('P2 — tampered stored payload is detected at load: run is quarantined, stays inspectable, contributes nothing', async () => {
  const idb = createFakeIndexedDB();
  const first = await experimentController();
  await first.api.initExperiments({ bootSummaries: [fakeSummary(100)], store: new ExperimentStore(idb) });
  const rec = await first.api.recordCampaignRun(campaignArgs);
  assert.equal(rec.run.payloadKind, 'indexeddb');
  assert.ok(rec.run.payloadHash, 'run sealed against its payload before persistence');
  // Tamper the stored payload in place — the fake's get returns the live
  // stored object, so mutating it simulates in-place storage corruption.
  const raw = new ExperimentStore(idb);
  await raw.open();
  const payload = await raw.getRunPayload(rec.run.runId);
  payload.summaries[0].scoreMargin = 9999;

  const second = await experimentController();
  await second.api.initExperiments({ bootSummaries: [fakeSummary(100)], store: new ExperimentStore(idb) });
  assert.equal(second.api.getIncludedRuns().some(r => r.runId === rec.run.runId), false, 'reload admission rejects the corrupt payload before inclusion');
  await second.api.applySelection();
  const marked = second.api.getExperimentRuns().find(r => r.runId === rec.run.runId);
  assert.ok(marked, 'quarantined run remains inspectable in the library');
  assert.equal(marked.lifecycle?.integrity?.state, 'quarantined');
  assert.equal(marked.lifecycle?.integrity?.code, 'RUN_PAYLOAD_HASH_MISMATCH');
  assert.equal(second.api.getIncludedRuns().some(r => r.runId === rec.run.runId), false, 'a hash-mismatched payload contributes zero games');
  const basis = second.api.getEvidenceBasis();
  assert.equal(basis.quarantinedCount, 1);
  assert.ok(basis.integrityFailures.some(f => f.runId === rec.run.runId));
  const evidence = second.api.collectExperimentEvidence();
  assert.equal(evidence.quarantinedCount, 1);
  assert.equal(evidence.runs.find(r => r.runId === rec.run.runId).integrity, 'quarantined');
  await assert.rejects(() => second.api.setRunIncluded(rec.run.runId, { force: true }), /RUN_CORRUPTED/, '"Include anyway" must never override cryptographic corruption');
  await assert.rejects(() => second.api.isolateRun(rec.run.runId), /RUN_CORRUPTED/);
});

test('P2 — a stored record whose sealed evidence fields are tampered loads as corrupt: inspectable, never contributes, cannot be force-included', async () => {
  const idb = createFakeIndexedDB();
  const first = await experimentController();
  await first.api.initExperiments({ bootSummaries: [fakeSummary(100)], store: new ExperimentStore(idb) });
  const rec = await first.api.recordCampaignRun(campaignArgs);
  // Corrupt the sealed record in place (live-object mutation via fake get).
  const raw = new ExperimentStore(idb);
  await raw.open();
  (await raw.getRun(rec.run.runId)).metrics.matchCount = 9999;

  const second = await experimentController();
  await second.api.initExperiments({ bootSummaries: [fakeSummary(100)], store: new ExperimentStore(idb) });
  const listed = second.api.getExperimentRuns().find(r => r.runId === rec.run.runId);
  assert.ok(listed, 'corrupt record is surfaced, never silently deleted');
  assert.equal(listed.corrupt, true);
  assert.equal(listed.corruptCode, 'RUN_HASH_MISMATCH');
  assert.equal(second.api.getIncludedRuns().some(r => r.runId === rec.run.runId), false, 'includedRunId → corrupt record yields zero contribution');
  await assert.rejects(() => second.api.setRunIncluded(rec.run.runId, { force: true }), /RUN_CORRUPTED/);
  const basis = second.api.getEvidenceBasis();
  assert.equal(basis.corruptCount, 1);
  assert.ok(basis.integrityFailures.some(f => f.runId === rec.run.runId && f.state === 'corrupt'));
  assert.equal(second.api.collectExperimentEvidence().runs.find(r => r.runId === rec.run.runId).integrity, 'corrupt');
});

test('dossier discloses quarantined/corrupt runs and why they were excluded', () => {
  const bad = mkRun(1);
  const experiments = {
    available: true, experimentId: DEFAULT_EXPERIMENT_ID,
    analysisSetId: `${DEFAULT_EXPERIMENT_ID}/${DEFAULT_ANALYSIS_SET_ID}`,
    persisted: true, includedRunIds: [], includedRunCount: 0, includedGames: 0,
    excludedRunCount: 1, excludedGames: 0, totalRuns: 1,
    invalidatedCount: 0, archivedCount: 0, failedCount: 0,
    corruptCount: 0, quarantinedCount: 1, payloadUnavailableCount: 0,
    integrityFailures: [{ runId: bad.runId, state: 'quarantined', code: 'RUN_PAYLOAD_HASH_MISMATCH' }],
    bundledBaselineContributing: false, fallback: null,
    runs: [{ runId: bad.runId, ordinal: 1, status: 'COMPLETED', lifecycle: 'active', included: false, integrity: 'quarantined', integrityCode: 'RUN_PAYLOAD_HASH_MISMATCH', integrityNote: 'payload tampered', rulesVersion: '4.3.1', engineVersion: '4.2.6', runHash: bad.runHash }],
    warnings: [],
  };
  const dossier = buildAnalysisDossier({ observatory: { datasetOrigin: 'CERTIFIED_CORPUS', summaries: [] }, aggregate: null, versions: {}, experiments });
  assert.equal(dossier.experiment.quarantinedCount, 1);
  assert.equal(dossier.experiment.integrityFailures[0].code, 'RUN_PAYLOAD_HASH_MISMATCH');
  assert.equal(dossier.experiment.runs[0].integrity, 'quarantined');
  assert.equal(dossier.experiment.runs[0].integrityCode, 'RUN_PAYLOAD_HASH_MISMATCH');
  assert.match(dossier.experiment.exclusionReason ?? '', /quarantined/);
});
