import { AggregateWorker } from './fixtures/aggregate-worker.mjs';
import { trustedSummary } from './fixtures/admission-fixtures.mjs';
import * as admissionContract from '../packages/simulation-runtime/src/evidence-admission.mjs';
import { evolutionIdentity } from '../scripts/evolution-identity.mjs';
const LAB_IDENTITY = await evolutionIdentity();
// experiment-portability.test.mjs — portable evidence contracts
//
// Covers the portability layer that makes an attached experiment run a
// durable, independently verifiable artifact:
//   artifact export     — sealed run → self-verifying intrilex-experiment-run
//   artifact import     — dedupe on sealed identity, conflict detection,
//                         foreign-experiment admission, membership replay
//   integrity           — tampered payload/hash/manifest fails closed
//   research package    — manifest completeness is derived, never claimed;
//                         PARTIAL/ANALYSIS_ONLY when artifacts are missing
//   fidelity            — summary telemetry never reported as deep decision
//                         evidence; mixed cohorts report MIXED
//   replay coverage     — retained transcripts vs seed-reproducible ordinals
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import {
  DEFAULT_EXPERIMENT_ID, DEFAULT_ANALYSIS_SET_ID, BUNDLED_RUN_ID,
  RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY, EXCLUSION_REASONS, RUN_INTEGRITY,
  MANIFEST_STATUS, MANIFEST_SCHEMA_VERSION, EXPERIMENT_LIMITS,
  createExperiment, createAnalysisSet, createRunRecord,
  createRunManifest, createManifestHeadline, foldSummariesIntoHeadline,
  commitManifestBatch, planManifestBatchCommit, manifestTransition, manifestIsActive, manifestIsResumable,
  manifestRemainingSegments, manifestCommittedCoverage, manifestRetainedOrdinals,
  runIdFor, batchSummariesHash, slimSummary,
  nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
  contributingRuns, evidenceBasis, previewSelectionMetrics,
  includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
  planMigration,
  payloadEvidenceHash, verifyRunPayload, markRunIntegrity, runIntegrityState,
  runAnalyticallyEligible, validateRunRecord,
} from '../packages/simulation-runtime/src/experiment-domain.mjs';
import {
  EXPERIMENT_RUN_FORMAT, RESEARCH_PACKAGE_FORMAT, PACKAGE_COMPLETENESS,
  DECISION_FIDELITY,
  experimentRunArtifact, artifactEvidenceForRun,
  validateExperimentRunArtifact, parseExperimentRunArtifact,
  researchPackageManifest, buildResearchPackage,
  validateResearchPackage, parseResearchPackage,
  runDecisionFidelity, replayCoverageForSummaries, runEvidenceBearing,
  packageDecisionFidelity, summariesCarryDecisionEvidence,
} from '../packages/simulation-runtime/src/experiment-portability.mjs';
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

const fakeSummary = (ordinal, { winningSeat = 1, terminationReason = 'NORMAL_VICTORY', deep = false } = {}) => trustedSummary({
  identity: { schemaVersion: '2.0.0', executionFingerprint: LAB_IDENTITY.fingerprint, analysisFingerprint: LAB_IDENTITY.analysisFingerprint },
  matchId: `T-${ordinal}`, matchOrdinal: ordinal, ordinal, terminationReason,
  policyIds: ['score-rush', 'control'], seatOrder: ['P1', 'P2'],
  winner: winningSeat === 1 ? 'P1' : winningSeat === 2 ? 'P2' : null,
  winningSeat: terminationReason === 'CANONICAL_DRAW' ? null : winningSeat,
  completedFullTurns: 6, scoreMargin: 3, durationMs: 12, matchResultHash: `h${ordinal}`,
  ...(deep ? { decisions: [{ turn: 1, candidateScores: [{ policy: 'score-rush', score: 0.8 }] }], strategicTelemetry: { turns: 6 } } : {}),
});
const fakeSummaries = (from, count, opts = {}) => Array.from({ length: count }, (_, i) => fakeSummary(from + i, opts));

/** Reseal a mutated run record under the domain's canonical hash shape —
 * lifecycle/runHash/compatibilityFingerprint/payloadKind/retentionNote are
 * excluded from the evidence hash (see createRunRecord/validateRunRecord). */
const resealRun = run => {
  const { lifecycle: _l, runHash: _h, compatibilityFingerprint: _f, payloadKind: _p, retentionNote: _r, ...evidence } = run;
  run.runHash = hashCanonical(evidence);
  return run;
};

const RUN_CFG = { matchCount: 100, profileId: 'core-advanced-authority', policyIds: ['score-rush', 'control'], seedStrategy: 'ordinal-hash', ordinalStart: 0, ordinalEnd: 100, ordinalBase: 0, workers: 1 };

// ── Controller harness (vm sandbox, browser imports stubbed) ─────────
async function experimentController({ state: stateOverrides = {} } = {}) {
  const src = (await readFile('apps/lab-web/src/experiments/experiment-controller.mjs', 'utf8'))
    .replace(/import\s[^;]*?from\s*'[^']*';/gs, '')
    .replace(/^export /gm, '');
  const state = { bootState: null, observatory: {}, aggregate: {}, evidenceBasis: null, ...stateOverrides };
  const toasts = [];
  const sandbox = { ...admissionContract,
    console, structuredClone, TextEncoder, setTimeout, clearTimeout, queueMicrotask: globalThis.queueMicrotask,
    Worker: AggregateWorker,
    state, showToast: (msg, opts) => toasts.push({ msg, ...opts }),
    updateRailContext() {}, rerender() {},
    RULES_VERSION: '4.3.1', LAB_VERSION: '0.29.0', ENGINE_VERSION: '4.2.6',
    hashCanonical, LAB_IDENTITY, ExperimentStore,
    DEFAULT_EXPERIMENT_ID, DEFAULT_ANALYSIS_SET_ID, BUNDLED_RUN_ID,
    RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY, EXCLUSION_REASONS, RUN_INTEGRITY,
    MANIFEST_STATUS, MANIFEST_SCHEMA_VERSION, EXPERIMENT_LIMITS,
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
    DECISION_FIDELITY,
    experimentRunArtifact, artifactEvidenceForRun,
    validateExperimentRunArtifact, parseExperimentRunArtifact,
    validateResearchPackage, parseResearchPackage,
    runDecisionFidelity, runEvidenceBearing, summariesCarryDecisionEvidence,
  };
  const api = runInNewContext(`${src}\n({ initExperiments, recordCampaignRun, recordFailedRun, recordCancelledRun, experimentsReady, storePersisted, getExperiment, getExperimentRuns, getActiveAnalysisSet, getIncludedRuns, getEvidenceBasis, runsWithCompatibility, previewRunSelection, allRunIds, nextRunOrdinalStart, setRunIncluded, setRunExcluded, markRunInvalidated, markRunArchived, markRunRestored, markRunPinned, includeAllCompatible, isolateRun, restoreBaseline, deleteRun, applySelection, collectExperimentEvidence, registerRunExecutor, beginExperimentRun, commitExperimentBatch, finalizeExperimentRun, failExperimentRun, cancelExperimentRun, getIncompleteRuns, resumeExperimentRun, discardManifest, loadRunMatchDetail, verifyRunArtifacts, exportRunArtifactEnvelope, exportRunArtifactText, exportAllRunArtifacts, importRunArtifact, importResearchPackage })`, sandbox);
  return { api, state, toasts };
}

const initApi = async (idb, opts = {}) => {
  const { api, state, toasts } = await experimentController(opts);
  const store = new ExperimentStore(idb);
  await api.initExperiments({ bootSummaries: [fakeSummary(9000)], store, ...opts.init });
  return { api, state, toasts, store };
};

/** Seal a 100-match batched run and return its ids. The committed range is
 * the manifest's AUTHORITATIVE allocation — a stale requested base is
 * rebased by the store, so commits follow manifest.segments, not the hint. */
const sealRun = async (api, { ordinals = [0, 100], batchSize = 50, summariesOf = (o, n) => fakeSummaries(o, n) } = {}) => {
  const segments = [{ index: 0, ordinalStart: ordinals[0], ordinalEnd: ordinals[1] }];
  const config = { ...RUN_CFG, matchCount: ordinals[1] - ordinals[0], ordinalStart: ordinals[0], ordinalEnd: ordinals[1] };
  const { runId, manifest } = await api.beginExperimentRun({ config, segments, batchSize });
  for (const seg of manifest.segments) {
    for (let o = seg.ordinalStart; o < seg.ordinalEnd; o += batchSize) {
      const n = Math.min(batchSize, seg.ordinalEnd - o);
      await api.commitExperimentBatch(runId, { segmentIndex: seg.index, ordinalStart: o, ordinalEnd: o + n, summaries: summariesOf(o, n) });
    }
  }
  const rec = await api.finalizeExperimentRun(runId);
  return { runId, run: rec.run };
};

// ── Fidelity + replay coverage (pure domain) ─────────────────────────
test('fidelity is evidence-grounded: config alone cannot claim deep evidence', () => {
  const run = { config: { strategicTrace: true }, status: RUN_STATUS.COMPLETED, payloadKind: 'indexeddb-batches' };
  // Traced + decision-level detail retained → FULL
  assert.equal(runDecisionFidelity(run, { sampleSummaries: fakeSummaries(0, 2, { deep: true }) }), DECISION_FIDELITY.FULL);
  // Traced but summaries carry no decision capture → SUMMARY (honest disclosure)
  assert.equal(runDecisionFidelity(run, { sampleSummaries: fakeSummaries(0, 2) }), DECISION_FIDELITY.SUMMARY);
  // Untraced → SUMMARY regardless
  assert.equal(runDecisionFidelity({ config: {} }, { sampleSummaries: fakeSummaries(0, 2, { deep: true }) }), DECISION_FIDELITY.FULL);
  assert.equal(runDecisionFidelity({ config: {} }, { sampleSummaries: fakeSummaries(0, 2) }), DECISION_FIDELITY.SUMMARY);
  // Package-level: mixed cohorts report MIXED, never upgraded to FULL
  assert.equal(packageDecisionFidelity([DECISION_FIDELITY.FULL, DECISION_FIDELITY.SUMMARY]), DECISION_FIDELITY.MIXED);
  assert.equal(packageDecisionFidelity([]), DECISION_FIDELITY.NONE);
});

test('replay coverage separates retained transcripts from seed-reproducible games', () => {
  const coverage = replayCoverageForSummaries(fakeSummaries(0, 4));
  assert.equal(coverage.gamesWithFullTranscript, 0); // no replay.commands retained
  assert.equal(coverage.gamesReproducible, 0);       // ordinal+seed alone cannot establish executable subjects
  assert.equal(coverage.totalGames, 4);
  const withReplay = [{ ...fakeSummary(0), replay: { commands: ['c1'] } }];
  assert.equal(replayCoverageForSummaries(withReplay).gamesWithFullTranscript, 1);
});

// ── Artifact export → validate → import round-trip ───────────────────
test('sealed batched run exports as a self-verifying artifact and re-imports intact', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await sealRun(api);

  const text = await api.exportRunArtifactText(runId);
  const envelope = JSON.parse(text);
  assert.equal(envelope.format, EXPERIMENT_RUN_FORMAT);
  assert.equal(envelope.contentHash, hashCanonical(envelope.payload));
  assert.equal(envelope.payload.evidence.kind, 'batches');
  assert.equal(envelope.payload.evidence.batches.length, 2);

  // Import into a FRESH experiment store — the artifact carries everything.
  const idb2 = createFakeIndexedDB();
  const other = await initApi(idb2);
  const res = await other.api.importRunArtifact(text);
  assert.equal(res.outcome, 'imported');
  assert.equal(res.runId, runId);
  assert.equal(res.included, true, 'compatible imported evidence joins the active set');

  // Evidence resolves durably in the new store: record + payload + batches.
  const run = other.api.getExperimentRuns().find(r => r.runId === runId);
  assert.equal(run.status, RUN_STATUS.COMPLETED);
  assert.equal(run.payloadKind, 'indexeddb-batches');
  const artifacts = await other.api.verifyRunArtifacts();
  assert.equal(artifacts.find(a => a.runId === runId)?.artifact, 'durable');
  assert.equal(other.api.getEvidenceBasis().includedGames, 100);
});

test('duplicate import dedupes on sealed run identity — never double-counts', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await sealRun(api);
  const text = await api.exportRunArtifactText(runId);
  const res = await api.importRunArtifact(text);
  assert.equal(res.outcome, 'duplicate');
  assert.equal(res.alreadyPresent, true);
  assert.equal(api.getEvidenceBasis().includedGames, 100, 'matches counted once');
});

test('conflicting evidence under the same runId fails closed — no silent overwrite', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await sealRun(api);
  const envelope = JSON.parse(await api.exportRunArtifactText(runId));
  // Forge different evidence under the same identity: change the sealed
  // metrics AND reseal runHash so the record itself validates, then rehash
  // the envelope. The hash chain is intact — the identity conflicts.
  const run = structuredClone(envelope.payload.run);
  run.metrics.matchCount = 99;
  resealRun(run); // reseal so the record itself validates — the conflict is identity-vs-identity
  const forged = { ...envelope, payload: { ...envelope.payload, run } };
  forged.contentHash = hashCanonical(forged.payload);
  // payloadHash still binds the unchanged payload — hash chain intact;
  // the admission gate must catch the different sealed identity on runId.
  await assert.rejects(() => api.importRunArtifact(JSON.stringify(forged)), /RUN_COUNTS_MISMATCH/);
});

test('tampered evidence fails verification — payload and envelope both hashed', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await sealRun(api);
  const envelope = JSON.parse(await api.exportRunArtifactText(runId));

  // 1. Tamper with a summary inside a batch → payload chain breaks.
  const tampered = structuredClone(envelope);
  tampered.payload.evidence.batches[0].summaries[0].winningSeat = 2;
  tampered.contentHash = hashCanonical(tampered.payload); // outer hash now valid — inner chain must still fail
  await assert.rejects(() => api.importRunArtifact(JSON.stringify(tampered)), /RUN_PAYLOAD_HASH_MISMATCH/);

  // 2. Tamper with the envelope without rehashing → contentHash fails.
  const tampered2 = structuredClone(envelope);
  tampered2.payload.evidence.batches[0].summaries[0].winningSeat = 2;
  await assert.rejects(() => api.importRunArtifact(JSON.stringify(tampered2)), /RUN_ARTIFACT_HASH_MISMATCH/);
});

test('export refuses runs whose evidence cannot resolve — no hollow artifacts', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await sealRun(api);
  // Destroy the payload row — the run record survives but evidence is gone.
  const batches = await store.listRunBatches(runId);
  await store._delAll([[ 'payloads', runId ]]);
  await assert.rejects(() => api.exportRunArtifactEnvelope(runId), /RUN_PAYLOAD_MISSING/);
  const artifacts = await api.verifyRunArtifacts();
  assert.equal(artifacts.find(a => a.runId === runId)?.artifact, 'missing');
  assert.equal(batches.length > 0, true, 'batches remain — partial evidence is inspectable');
});

test('verifyRunArtifacts reports missing chunks, session and durable honestly', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const a = await sealRun(api);
  const b = await sealRun(api, { ordinals: [100, 200] });
  // Drop one committed batch from run b → 'missing-chunks'.
  const bs = await store.listRunBatches(b.runId);
  await store._delAll([['runBatches', bs[0].batchId]]);
  const rows = await api.verifyRunArtifacts();
  assert.equal(rows.find(r => r.runId === a.runId)?.artifact, 'durable');
  assert.equal(rows.find(r => r.runId === b.runId)?.artifact, 'missing-chunks');
  assert.equal(rows.find(r => r.runId === b.runId)?.exportable, false);
  // Export of the chunked run fails loudly — never a silent partial artifact.
  await assert.rejects(() => api.exportRunArtifactEnvelope(b.runId), /RUN_CHUNK_MISSING/);
});

// ── Foreign-experiment import ────────────────────────────────────────
test('artifact sealed under a different experimentId persists under its own id', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await sealRun(api);
  const envelope = JSON.parse(await api.exportRunArtifactText(runId));
  // Re-seal identity under a foreign experiment id.
  const run = structuredClone(envelope.payload.run);
  run.experimentId = 'EXP-FOREIGN';
  resealRun(run);
  envelope.payload.run = run;
  envelope.contentHash = hashCanonical(envelope.payload);

  const other = await initApi(createFakeIndexedDB());
  const res = await other.api.importRunArtifact(JSON.stringify(envelope));
  assert.equal(res.outcome, 'imported');
  assert.equal(res.sameExperiment, false);
  // The foreign experiment container is created — the run is durable and
  // ledger-visible, but it is NOT counted in the active experiment's basis.
  assert.equal(other.api.getEvidenceBasis().includedGames, 0);
});

// ── Research package ─────────────────────────────────────────────────
test('package completeness is derived — never claims COMPLETE with missing artifacts', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const a = await sealRun(api);
  const b = await sealRun(api, { ordinals: [100, 200] });
  const evidence = api.collectExperimentEvidence();

  const files = {};
  const perRun = [];
  for (const id of [a.runId, b.runId]) {
    const env = await api.exportRunArtifactEnvelope(id);
    files[`runs/${id}.json`] = JSON.stringify(env);
    perRun.push({ runId: id, ordinal: env.payload.run.ordinal, matchCount: 100, included: true, persistence: 'persisted', evidenceBearing: true, fidelity: DECISION_FIDELITY.SUMMARY, artifactFile: `runs/${id}.json`, replayCoverage: replayCoverageForSummaries(fakeSummaries(0, 4)) });
  }
  files['analysis/dossier.json'] = '{"dossier":true}';

  // COMPLETE — every expected artifact present + analysis present.
  const manifest = researchPackageManifest({
    experimentId: evidence.experimentId,
    identity: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '0.29.0', fingerprint: 'fp' },
    cohort: { matches: 200, runs: 2 }, perRun, analysisPresent: true, markdownProjection: false,
  });
  assert.equal(manifest.completeness, PACKAGE_COMPLETENESS.COMPLETE);
  const pkg = buildResearchPackage({ manifest, files });
  assert.equal(pkg.format, RESEARCH_PACKAGE_FORMAT);
  const validated = validateResearchPackage(pkg);
  assert.equal(validated.runArtifacts.length, 2);
  assert.equal(validated.analysis.dossierJson, files['analysis/dossier.json']);

  // PARTIAL — drop one run file and declare it missing.
  const partialPerRun = perRun.map((r, i) => i === 0 ? { ...r, artifactFile: null, missingReason: 'RUN_PAYLOAD_MISSING' } : r);
  const partialManifest = researchPackageManifest({
    experimentId: evidence.experimentId, cohort: { matches: 200, runs: 2 }, perRun: partialPerRun, analysisPresent: true,
  });
  assert.equal(partialManifest.completeness, PACKAGE_COMPLETENESS.PARTIAL);
  assert.deepEqual(partialManifest.runArtifacts.missingRunIds, [a.runId]);
  assert.ok(partialManifest.warnings.some(w => w.startsWith('PACKAGE_INCOMPLETE')));

  // ANALYSIS_ONLY — no artifacts at all.
  const analysisOnly = researchPackageManifest({ experimentId: evidence.experimentId, perRun: [], analysisPresent: true });
  assert.equal(analysisOnly.completeness, PACKAGE_COMPLETENESS.ANALYSIS_ONLY);
  assert.ok(analysisOnly.warnings.some(w => w.includes('ANALYSIS_ONLY')));
});

test('package validation fails closed on tampered or missing files', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  const { runId } = await sealRun(api);
  const env = await api.exportRunArtifactEnvelope(runId);
  const files = { [`runs/${runId}.json`]: JSON.stringify(env), 'analysis/dossier.json': '{}' };
  const manifest = researchPackageManifest({
    experimentId: 'EXP-X', perRun: [{ runId, matchCount: 100, included: true, evidenceBearing: true, fidelity: DECISION_FIDELITY.SUMMARY, artifactFile: `runs/${runId}.json` }], analysisPresent: true,
  });
  const pkg = buildResearchPackage({ manifest, files });

  // Missing declared file → PACKAGE_FILE_MISSING.
  const missing = structuredClone(pkg);
  delete missing.files[`runs/${runId}.json`];
  missing.contentHash = hashCanonical({ manifest: missing.manifest, files: missing.files });
  assert.throws(() => validateResearchPackage(missing), /PACKAGE_(FILE_MISSING|HASH_MISMATCH)/);

  // Tampered run file → inner artifact validation fails.
  const tampered = structuredClone(pkg);
  tampered.files[`runs/${runId}.json`] = JSON.stringify({ ...env, schemaVersion: 999 });
  tampered.contentHash = hashCanonical({ manifest: tampered.manifest, files: tampered.files });
  assert.throws(() => validateResearchPackage(tampered), /PACKAGE_HASH_MISMATCH|RUN_ARTIFACT_VERSION_UNSUPPORTED/);
});

test('package import admits runs, replays analysis membership, and dedupes on re-import', async () => {
  const src = await initApi(createFakeIndexedDB());
  const a = await sealRun(src.api);
  const b = await sealRun(src.api, { ordinals: [100, 200] });
  // Exclude run b BEFORE export — membership intent is part of the package.
  await src.api.setRunExcluded(b.runId, { reason: 'exploratory', note: 'held out' });
  const files = {};
  const perRun = [];
  for (const row of src.api.collectExperimentEvidence().runs.filter(r => r.origin !== 'bundled')) {
    const env = await src.api.exportRunArtifactEnvelope(row.runId);
    files[`runs/${row.runId}.json`] = JSON.stringify(env);
    perRun.push({ runId: row.runId, ordinal: row.ordinal, matchCount: row.matchCount, included: row.included, persistence: 'persisted', evidenceBearing: true, fidelity: DECISION_FIDELITY.SUMMARY, artifactFile: `runs/${row.runId}.json` });
  }
  files['analysis/dossier.json'] = '{}';
  const manifest = researchPackageManifest({ experimentId: src.api.getExperiment().experimentId, cohort: { matches: 200, runs: 2 }, perRun, analysisPresent: true });
  const pkg = buildResearchPackage({ manifest, files });
  const text = JSON.stringify(pkg);

  // Import into a fresh store — same experimentId so membership applies.
  const dst = await initApi(createFakeIndexedDB());
  const report = await dst.api.importResearchPackage(text);
  assert.equal(report.imported.length, 2);
  assert.equal(report.duplicates.length, 0);
  assert.equal(report.failed.length, 0);
  assert.equal(report.membershipApplied, true);
  // a is included, b stays excluded — the manifest's declared membership.
  const set = dst.api.getActiveAnalysisSet();
  assert.ok(set.includedRunIds.includes(a.runId));
  assert.ok(!set.includedRunIds.includes(b.runId));
  assert.equal(dst.api.getEvidenceBasis().includedGames, 100);

  // Re-import → all duplicates, still counted once.
  const again = await dst.api.importResearchPackage(text);
  assert.equal(again.imported.length, 0);
  assert.equal(again.duplicates.length, 2);
  assert.equal(dst.api.getEvidenceBasis().includedGames, 100);
});

// ── Deep artifact verification — corruption is never 'missing' ───
test('verifyRunArtifacts detects in-place batch corruption — corrupt, and the exporter agrees', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await sealRun(api);
  // Mutate a committed batch in place — same batchId, same index, poisoned
  // summaries. The fake's get returns the stored object, so this simulates
  // storage-layer corruption of an otherwise "present" chunk.
  (await store.getRunBatch(runId, 0)).summaries[0].scoreMargin = 9999;
  const row = (await api.verifyRunArtifacts()).find(r => r.runId === runId);
  assert.equal(row.artifact, 'corrupt', 'a present-but-tampered batch is corrupt, never durable or missing');
  assert.equal(row.code, 'RUN_PAYLOAD_HASH_MISMATCH');
  assert.equal(row.exportable, false);
  // Verifier and exporter run the same sealed chain — identical failure.
  await assert.rejects(() => api.exportRunArtifactEnvelope(runId), /RUN_PAYLOAD_HASH_MISMATCH/);
  // The batch row is still stored — corrupt evidence stays inspectable.
  assert.ok((await store.listRunBatches(runId)).length > 0);
});

test('verifyRunArtifacts detects tampered payload descriptors — payload hash mismatch is corrupt', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const { runId } = await sealRun(api);
  // Forge the descriptor chain: point a descriptor at a different hash while
  // leaving every batch row intact — the sealed payloadHash must reject it.
  (await store.getRunPayload(runId)).batches[0].summariesHash = 'forged-descriptor';
  const row = (await api.verifyRunArtifacts()).find(r => r.runId === runId);
  assert.equal(row.artifact, 'corrupt');
  assert.equal(row.code, 'RUN_PAYLOAD_HASH_MISMATCH');
  await assert.rejects(() => api.exportRunArtifactEnvelope(runId), /RUN_PAYLOAD_HASH_MISMATCH/);
});

test('verifyRunArtifacts marks a sealed-record hash failure corrupt — inspectable, exportable: false', async () => {
  const idb = createFakeIndexedDB();
  const first = await initApi(idb);
  const { runId } = await sealRun(first.api);
  // Corrupt a sealed record field in storage, then reload into a fresh
  // controller — the record surfaces corrupt:true at read time.
  const raw = new ExperimentStore(idb);
  await raw.open();
  (await raw.getRun(runId)).metrics.matchCount = 9999;
  const second = await initApi(idb);
  const row = (await second.api.verifyRunArtifacts()).find(r => r.runId === runId);
  assert.equal(row.artifact, 'corrupt');
  assert.equal(row.code, 'RUN_HASH_MISMATCH');
  assert.equal(row.exportable, false);
  await assert.rejects(() => second.api.exportRunArtifactEnvelope(runId), /RUN_HASH_MISMATCH/);
});

test('verifyRunArtifacts distinguishes session-only evidence from durable — exportable, never durable', async () => {
  const idb = createFakeIndexedDB();
  const { api } = await initApi(idb);
  // Quota failure on the payload write → session-retained evidence.
  idb._failNextTransaction({ name: 'QuotaExceededError' });
  const rec = await api.recordCampaignRun({
    config: { matchCount: 1, profileId: 'core-advanced-authority', policyIds: ['score-rush', 'control'] },
    summaries: [fakeSummary(0)], aggregate: { matchCount: 1 },
  });
  assert.equal(rec.run.payloadKind, 'session');
  const row = (await api.verifyRunArtifacts()).find(r => r.runId === rec.run.runId);
  assert.equal(row.artifact, 'session', 'session-retained evidence is honestly session, not durable');
  assert.equal(row.exportable, true);
  // And the exported session artifact is itself self-verifying.
  const env = await api.exportRunArtifactEnvelope(rec.run.runId);
  assert.equal(env.format, EXPERIMENT_RUN_FORMAT);
});

// ── Fidelity at the verification surface ─────────────────────────
test('verifyRunArtifacts grounds fidelity in inspected evidence — FULL / SUMMARY / UNRESOLVED, never config', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const deep = await sealRun(api, { ordinals: [0, 100], summariesOf: (o, n) => fakeSummaries(o, n, { deep: true }) });
  const shallow = await sealRun(api, { ordinals: [100, 200] });
  const corrupt = await sealRun(api, { ordinals: [200, 300] });
  (await store.getRunBatch(corrupt.runId, 0)).summaries[0].scoreMargin = -1;
  const rows = await api.verifyRunArtifacts();
  assert.equal(rows.find(r => r.runId === deep.runId)?.fidelity, DECISION_FIDELITY.FULL,
    'committed summaries carry decision detail → FULL');
  assert.equal(rows.find(r => r.runId === shallow.runId)?.fidelity, DECISION_FIDELITY.SUMMARY,
    'inspected summaries without decision detail → SUMMARY');
  const bad = rows.find(r => r.runId === corrupt.runId);
  assert.equal(bad.artifact, 'corrupt');
  assert.equal(bad.fidelity, DECISION_FIDELITY.UNRESOLVED,
    'corrupt evidence-bearing run reports UNRESOLVED — never a fidelity verdict it could not inspect');
});

// ── Research-package membership identity binding ─────────────────
test('package membership never binds to a conflicting local run — same runId, different runHash', async () => {
  // Destination already holds a CONFLICTING run under the same ordinal-derived
  // runId (same id string, different evidence → different sealed runHash).
  const dst = await initApi(createFakeIndexedDB());
  const conflict = await sealRun(dst.api, { summariesOf: (o, n) => fakeSummaries(o, n, { winningSeat: 2, terminationReason: 'CANONICAL_DRAW' }) });
  const src = await initApi(createFakeIndexedDB());
  const orig = await sealRun(src.api);
  assert.equal(orig.runId, conflict.runId, 'same experiment + same ordinal → identical runId');
  // Local curation holds the conflicting run OUT of the analysis set.
  await dst.api.setRunExcluded(conflict.runId, { reason: 'other', note: 'held out locally' });

  const env = await src.api.exportRunArtifactEnvelope(orig.runId);
  const files = { [`runs/${orig.runId}.json`]: JSON.stringify(env), 'analysis/dossier.json': '{}' };
  const manifest = researchPackageManifest({
    experimentId: src.api.getExperiment().experimentId,
    perRun: [{ runId: orig.runId, matchCount: 100, included: true, evidenceBearing: true, fidelity: DECISION_FIDELITY.SUMMARY, artifactFile: `runs/${orig.runId}.json` }],
    analysisPresent: true,
  });
  const report = await dst.api.importResearchPackage(JSON.stringify(buildResearchPackage({ manifest, files })));
  assert.equal(report.imported.length, 0, 'conflicting artifact is not admitted');
  assert.ok(report.failed.some(f => f.code === 'RUN_ARTIFACT_CONFLICT'));
  assert.ok(report.membershipUnresolved.includes(conflict.runId), 'unresolved membership is disclosed');
  assert.equal(report.membershipApplied, false);
  // The conflicting local run did NOT gain package membership — it stays excluded.
  assert.ok(!dst.api.getActiveAnalysisSet().includedRunIds.includes(conflict.runId),
    'a same-id conflicting run must never satisfy package membership');
  // …and remains inspectable — never silently deleted.
  assert.ok(dst.api.getExperimentRuns().some(r => r.runId === conflict.runId));

  // Inverse: a package EXCLUSION must not strip the conflicting local run
  // either — manifest curation binds to artifact identity, not the string id.
  const dst2 = await initApi(createFakeIndexedDB());
  const conflict2 = await sealRun(dst2.api, { summariesOf: (o, n) => fakeSummaries(o, n, { winningSeat: 2, terminationReason: 'CANONICAL_DRAW' }) });
  assert.ok(dst2.api.getActiveAnalysisSet().includedRunIds.includes(conflict2.runId), 'locally included before import');
  const exclManifest = researchPackageManifest({
    experimentId: src.api.getExperiment().experimentId,
    perRun: [{ runId: orig.runId, matchCount: 100, included: false, evidenceBearing: true, fidelity: DECISION_FIDELITY.SUMMARY, artifactFile: `runs/${orig.runId}.json` }],
    analysisPresent: true,
  });
  await dst2.api.importResearchPackage(JSON.stringify(buildResearchPackage({ manifest: exclManifest, files })));
  assert.ok(dst2.api.getActiveAnalysisSet().includedRunIds.includes(conflict2.runId),
    'the package exclusion binds to evidence it could not admit — local inclusion survives');
});

test('identical duplicate artifacts DO satisfy package membership — hash identity, not id string', async () => {
  const src = await initApi(createFakeIndexedDB());
  const orig = await sealRun(src.api);
  const env = await src.api.exportRunArtifactEnvelope(orig.runId);
  const files = { [`runs/${orig.runId}.json`]: JSON.stringify(env), 'analysis/dossier.json': '{}' };
  const manifest = researchPackageManifest({
    experimentId: src.api.getExperiment().experimentId,
    perRun: [{ runId: orig.runId, matchCount: 100, included: true, evidenceBearing: true, fidelity: DECISION_FIDELITY.SUMMARY, artifactFile: `runs/${orig.runId}.json` }],
    analysisPresent: true,
  });
  const text = JSON.stringify(buildResearchPackage({ manifest, files }));

  // Destination already holds the SAME evidence — exclusion excluded it.
  const dst = await initApi(createFakeIndexedDB());
  const res = await dst.api.importRunArtifact(JSON.stringify(env));
  assert.equal(res.outcome, 'imported');
  await dst.api.setRunExcluded(orig.runId, { reason: 'other', note: 'held out before package import' });

  const report = await dst.api.importResearchPackage(text);
  assert.equal(report.duplicates.length, 1, 'hash-identical artifact is a duplicate, not a conflict');
  assert.equal(report.failed.length, 0);
  assert.ok(report.membershipUnresolved.length === 0);
  assert.ok(dst.api.getActiveAnalysisSet().includedRunIds.includes(orig.runId),
    'verified-identical duplicate satisfies declared membership');
});

test('exportAllRunArtifacts reports per-run failures, never silently skips', async () => {
  const idb = createFakeIndexedDB();
  const { api, store } = await initApi(idb);
  const a = await sealRun(api);
  const b = await sealRun(api, { ordinals: [100, 200] });
  await store._delAll([['payloads', b.runId]]);
  const results = await api.exportAllRunArtifacts();
  assert.equal(results.length, 2);
  assert.equal(results.find(r => r.runId === a.runId)?.ok, true);
  const failed = results.find(r => r.runId === b.runId);
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'RUN_PAYLOAD_MISSING');
});
