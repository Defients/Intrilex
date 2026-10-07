// ═══════════════════════════════════════════════════════════════
// experiment-controller.mjs — Persistent experiment evidence orchestration
//
// The seam between the Experiment panel UI, the ExperimentStore (IndexedDB),
// and the observatory analytics pipeline. Downstream workspaces keep reading
// state.observatory / state.aggregate — this module ensures those fields are
// always recomputed from the *currently included* runs of the active
// Analysis Set, never just the most recent run.
//
// Rules this layer enforces:
//   - a new Run appends evidence; it never replaces prior runs
//   - exclusion is curation with a recorded reason, never deletion
//   - incompatible runs require an explicit "include anyway"
//   - aggregation always works on raw per-match summaries (union), so
//     unequal run sizes weight correctly — no averaging of percentages
//   - empty selection falls back to the bundled certified baseline
// ═══════════════════════════════════════════════════════════════

import { state, showToast } from '../state.js';
import { updateRailContext } from '../router.js';
import { rerender } from '../rerender.js';
import { RULES_VERSION, LAB_VERSION, ENGINE_VERSION } from '../version.js';
import { hashCanonical } from '../shared-browser.js';
import {
  DEFAULT_EXPERIMENT_ID, BUNDLED_RUN_ID,
  RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY, EXCLUSION_REASONS, RUN_INTEGRITY,
  MANIFEST_STATUS,
  createExperiment, createAnalysisSet, createRunRecord,
  createRunManifest, createManifestHeadline, foldSummariesIntoHeadline,
  commitManifestBatch, manifestTransition, manifestIsActive, manifestIsResumable,
  manifestRemainingSegments, manifestCommittedCoverage,
  runIdFor, batchSummariesHash, slimSummary,
  nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
  contributingRuns, evidenceBasis, previewSelectionMetrics,
  includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
  planMigration, payloadEvidenceHash, verifyRunPayload, markRunIntegrity,
  runIntegrityState, runAnalyticallyEligible,
} from '../evolution/experiment-domain.mjs';
import { ExperimentStore } from './experiment-store.mjs';

let _store = null;
let _experiment = null;
let _runs = [];
let _set = null;
let _sessionPayloads = new Map(); // runId → {summaries, aggregate} for payloadKind 'session'
// runIds whose *record* could not be persisted at all — they live only in
// _runs for this session. Tracked explicitly so a store refresh can merge
// them back in (never silently dropping a completed run) without resurrecting
// records that were legitimately deleted.
let _memoryOnlyRunIds = new Set();
// Live run manifests (in-progress / interrupted runs). manifestId === the
// runId the manifest will seal into — one manifest per run, ever.
let _manifests = new Map();
// Optional executor injected by experiment-controls: given a resume plan it
// re-spawns workers and drives the remaining segments to completion.
let _runExecutor = null;
let _bootSummaries = [];
let _ready = false;
let _applyToken = 0;

// Matches ExperimentStore.listRuns ordering so merged in-memory records slot
// into the same position a persisted record would occupy.
const _byOrdinal = (a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));

/** Per-run retention truth for UI disclosure:
 *  'session-record'  — nothing about this run reached durable storage.
 *  'session-payload' — record persisted; evidence payload is session-only.
 *  'persisted'       — record (and payload, when kind is indexeddb) durable. */
function _persistenceOf(run) {
  if (_memoryOnlyRunIds.has(run.runId)) return 'session-record';
  if (run.payloadKind === 'session') return 'session-payload';
  return 'persisted';
}

// ── Queries (the downstream-facing read surface) ────────────────

export function experimentsReady() { return _ready; }
export function storePersisted() { return _store?.persisted === true; }
export function getExperiment() { return _experiment; }
export function getExperimentRuns() { return [..._runs]; }
export function getActiveAnalysisSet() { return _set ? structuredClone(_set) : null; }
export function getIncludedRuns() { return contributingRuns(_runs, _set); }
export function getEvidenceBasis() {
  const basis = evidenceBasis(_runs, _set);
  return { ...basis, persisted: storePersisted(), memoryOnlyRunCount: _memoryOnlyRunIds.size, sessionPayloadRunCount: _runs.filter(r => r.payloadKind === 'session' && !_memoryOnlyRunIds.has(r.runId)).length, experimentId: _experiment?.experimentId ?? null, analysisSetId: _set?.analysisSetId ?? null, fallback: contributingRuns(_runs, _set).filter(r => r.runId !== BUNDLED_RUN_ID).length ? null : 'certified-baseline' };
}

/** Compatibility classification for every stored run vs the current
 * contributing baseline — drives badges and warnings in the UI. */
export function runsWithCompatibility() {
  const contributing = contributingRuns(_runs, _set);
  const baseline = compatibilityBaseline(_runs, new Set(contributing.map(r => r.runId)));
  return _runs.map(run => ({
    run,
    compatibility: baseline && run.runId !== baseline.runId ? classifyRunCompatibility(run, baseline) : { status: COMPATIBILITY.COMPATIBLE, diffs: [] },
    exclusion: _set?.exclusions?.[run.runId] ?? null,
    included: contributing.some(r => r.runId === run.runId),
    baseline: baseline?.runId === run.runId,
    persistence: _persistenceOf(run),
  }));
}

/** Cheap headline preview over an arbitrary run-id set (e.g. "what would the
 * numbers look like with the excluded runs restored") — uses stored per-run
 * metrics only, no payload load. */
export function previewRunSelection(runIds) {
  return previewSelectionMetrics(_runs, runIds);
}

export function allRunIds() { return _runs.map(r => r.runId); }

/** Ordinal continuation: a new run continues the experiment-wide ordinal
 * sequence so ordinal-hash seeding produces fresh games rather than
 * re-observing identical seeds across runs. */
export function nextRunOrdinalStart() {
  const start = nextOrdinalStart(_runs.filter(r => r.origin !== 'bundled'));
  // Retained manifests reserve their ordinal ranges too — a new run must
  // never re-observe ordinals an interrupted run already committed (or may
  // still commit on resume). Resuming reuses the manifest's own range.
  let manifestEnd = 0;
  for (const m of _manifests.values()) {
    if (m.sealedRunId) continue; // sealed coverage lives on the run record
    for (const s of m.segments ?? []) manifestEnd = Math.max(manifestEnd, s.ordinalEnd ?? 0);
  }
  const next = Math.max(Number.isInteger(start) && start > 0 ? start : 0, manifestEnd);
  return next;
}

// ── Boot / migration ────────────────────────────────────────────

/**
 * Load persisted experiment evidence and apply the saved analysis selection.
 * Idempotent: the bundled corpus registers exactly once (RUN-0000) and the
 * default experiment/analysis set are created only when absent.
 * @returns {{hasActiveSelection:boolean}} whether a non-default selection
 *   exists that must be recomputed into state.observatory before render.
 */
export async function initExperiments({ bootSummaries = [], bootAggregate = null, store = null } = {}) {
  _bootSummaries = bootSummaries ?? [];
  _sessionPayloads = new Map();
  _memoryOnlyRunIds = new Set();
  _store = store ?? new ExperimentStore();
  await _store.open();
  const writes = planMigration({
    experiments: await _store.listExperiments(),
    runs: await _store.listRuns(),
    analysisSets: await _store.listAnalysisSets(),
    aggregate: bootAggregate,
    summaryCount: _bootSummaries.length,
  });
  await _store.applyMigration(writes);
  _experiment = await _store.getExperiment(DEFAULT_EXPERIMENT_ID)
    ?? createExperiment({ experimentId: DEFAULT_EXPERIMENT_ID });
  _set = await _store.getActiveAnalysisSet(_experiment)
    ?? createAnalysisSet({ experimentId: _experiment.experimentId });
  _runs = await _store.listRuns(_experiment.experimentId);
  // Scrub ghost memberships: a session-only run that never reached durable
  // storage leaves its runId inside the persisted analysis set after reload.
  // The run is gone — keeping the id would reference evidence that cannot
  // ever load again.
  const runIds = new Set(_runs.map(r => r.runId));
  const storedIncluded = _set.includedRunIds ?? [];
  const liveIncluded = storedIncluded.filter(id => runIds.has(id));
  if (liveIncluded.length !== storedIncluded.length) {
    _set = { ..._set, includedRunIds: liveIncluded };
    await _persistSet();
  }
  // Crash/reload recovery: any manifest still marked active was cut off
  // mid-execution (the tab cannot resume a dead worker). Reclassify it
  // interrupted — committed batches are already durable; the run becomes
  // resumable evidence rather than silently vanishing.
  _manifests = new Map();
  try {
    if (typeof _store.listManifests === 'function') {
      for (const manifest of await _store.listManifests(_experiment.experimentId)) {
        let live = manifest;
        if (manifestIsActive(manifest)) {
          live = manifestTransition(manifest, MANIFEST_STATUS.INTERRUPTED, {
            failure: { message: 'Execution interrupted (browser closed or reloaded before the run finished).', phase: 'execution' },
          });
          try { await _store.putManifest(live); }
          catch (error) { console.warn('[experiments] interrupted-manifest persist failed:', error); }
        }
        _manifests.set(live.manifestId, live);
      }
    }
  } catch (error) { console.warn('[experiments] manifest recovery failed — interrupted runs may not be listed:', error); }
  _ready = true;
  _syncEvidenceBasis();
  return { hasActiveSelection: contributingRuns(_runs, _set).some(r => r.runId !== BUNDLED_RUN_ID) };
}

// ── Run lifecycle ───────────────────────────────────────────────

function _semanticFromBaseline() {
  const contributing = contributingRuns(_runs, _set);
  const baseline = compatibilityBaseline(_runs, new Set(contributing.map(r => r.runId))) ?? contributing.at(-1) ?? null;
  return baseline;
}

/**
 * Refresh _runs from the store WITHOUT losing session-only records. A run
 * whose record could not be persisted lives in _memoryOnlyRunIds; it is
 * merged back after every listRuns so a later store read can never silently
 * erase a completed run from the library or the analysis set. Persisted
 * records win on runId collision (the durable copy is authoritative), and a
 * memory-only record that later lands in the store stops being tracked.
 * A listRuns failure keeps the current in-memory view rather than blanking it.
 */
async function _refreshRuns() {
  let persisted = null;
  try { persisted = await _store.listRuns(_experiment.experimentId); }
  catch (error) { console.warn('[experiments] run list refresh failed — keeping current in-memory view:', error); return; }
  const persistedIds = new Set(persisted.map(r => r.runId));
  for (const id of [..._memoryOnlyRunIds]) if (persistedIds.has(id)) _memoryOnlyRunIds.delete(id);
  const memoryOnly = _runs.filter(r => _memoryOnlyRunIds.has(r.runId) && !persistedIds.has(r.runId));
  _runs = [...persisted, ...memoryOnly].sort(_byOrdinal);
}

/**
 * Persist the active analysis set. Storage failure never erases the
 * in-memory selection — it degrades to session-only bookkeeping and returns
 * false so callers can disclose the retention limit.
 */
async function _persistSet() {
  try { await _store.putAnalysisSet(_set); return true; }
  catch (error) {
    console.warn('[experiments] analysis-set persist failed — selection kept for this session only:', error);
    return false;
  }
}

/**
 * Persist a lifecycle/curation update and mirror it into _runs. For
 * session-only records the update still applies locally when the store
 * refuses the write — a memory-resident run stays fully curatable.
 */
async function _updateRun(updated) {
  try {
    await _store.updateRun(updated);
    _memoryOnlyRunIds.delete(updated.runId);
  } catch (error) {
    if (!_memoryOnlyRunIds.has(updated.runId)) throw error;
    console.warn('[experiments] session-only run update could not persist — applied for this session:', error?.code ?? error);
  }
  _runs = _runs.map(r => r.runId === updated.runId ? updated : r);
}

async function _persistRunAndPayload(run, payload) {
  try {
    await _store.saveRun(run, payload);
    return { run, persisted: true, payloadSessionOnly: false, metaFailed: false };
  } catch (error) {
    // Payload too large or quota exhausted: the run record still persists but
    // the evidence lives only for this session — disclosed, never silent.
    // payloadKind/retentionNote are retention bookkeeping outside runHash, so
    // this fallback stays a valid record without resealing or bypassing
    // validation — retention state must never masquerade as evidence.
    // payloadKind only flips to 'session' when a payload actually exists:
    // relabeling a payload-free run would later read as RUN_PAYLOAD_MISSING.
    const code = error?.code ?? error?.message ?? 'storage unavailable';
    const sessionRun = payload
      ? { ...run, payloadKind: 'session', retentionNote: `Evidence payload retained for this session only (${code})` }
      : { ...run, retentionNote: `Evidence could not be archived (${code})` };
    if (payload) _sessionPayloads.set(run.runId, payload);
    try {
      await _store.saveRun(sessionRun, null);
    } catch (metaError) {
      // Even the lightweight record cannot persist: keep the run — and its
      // evidence — alive in memory for the rest of this session. The run
      // remains listed, curatable, and analytically eligible; retention is
      // disclosed on the record itself.
      console.warn('[experiments] run metadata persist failed:', metaError);
      const memoryRun = {
        ...sessionRun,
        retentionNote: `${sessionRun.retentionNote} · run record could not be persisted — retained for this session only, it will not survive reload`,
      };
      _memoryOnlyRunIds.add(run.runId);
      _runs = [..._runs.filter(r => r.runId !== run.runId), memoryRun].sort(_byOrdinal);
      return { run: memoryRun, persisted: false, metaFailed: true, payloadSessionOnly: payload != null };
    }
    return { run: sessionRun, persisted: true, payloadSessionOnly: payload != null, metaFailed: false };
  }
}

/**
 * Append a completed campaign execution as a new Run. Returns
 * { run, compatibility, included } — included=false means the run was
 * recorded but auto-excluded as incompatible with the current baseline.
 */
export async function recordCampaignRun({ config = {}, result = {}, summaries = [], aggregate = null } = {}) {
  if (!_ready) return null;
  const baseline = _semanticFromBaseline();
  const ordinal = nextRunOrdinal(_runs.filter(r => r.origin !== 'bundled'));
  const run = createRunRecord({
    experimentId: _experiment.experimentId,
    ordinal,
    status: RUN_STATUS.COMPLETED,
    config: {
      presetId: config.presetId ?? null,
      profileId: config.profileId ?? aggregate?.profileId ?? null,
      policyIds: config.policyIds ?? aggregate?.policyIds ?? null,
      matchCount: config.matchCount ?? summaries.length,
      workers: config.workers ?? null,
      seedStrategy: config.seedStrategy ?? null,
      ordinalStart: config.ordinalStart ?? null,
      ordinalEnd: config.ordinalEnd ?? null,
      strategicTrace: config.strategicTrace === true,
    },
    provenance: {
      rulesVersion: aggregate?.rulesVersion ?? RULES_VERSION,
      engineVersion: aggregate?.engineVersion ?? result?.engineVersion ?? ENGINE_VERSION,
      labVersion: aggregate?.labVersion ?? LAB_VERSION,
      experimentHash: aggregate?.experimentHash ?? result?.canonicalResultHash ?? null,
      canonicalResultHash: aggregate?.canonicalResultHash ?? result?.canonicalResultHash ?? null,
      aggregateHash: aggregate?.aggregateHash ?? null,
    },
    metrics: {
      matchCount: aggregate?.matchCount ?? summaries.length,
      completedMatchCount: aggregate?.completedMatchCount ?? null,
      abortCount: aggregate?.abortCount ?? result?.abortCount ?? 0,
      drawCount: aggregate?.drawCount ?? 0,
      seat1Wins: aggregate?.seatWins?.['1'] ?? null,
      seat2Wins: aggregate?.seatWins?.['2'] ?? null,
      seat1WinRate: aggregate?.seat1WinRate ?? null,
      durationMs: result?.durationMs ?? null,
      policyResults: aggregate?.policies ?? null,
    },
    payloadKind: summaries.length ? 'indexeddb' : 'none',
    // Seal the run against the exact evidence payload BEFORE persistence —
    // the hash binds analytical content ({summaries, aggregate}), never
    // storage fields. Verification happens at load time in applySelection.
    payloadHash: summaries.length ? payloadEvidenceHash({ summaries, aggregate }) : null,
  });
  const { run: stored, persisted, payloadSessionOnly, metaFailed } = await _persistRunAndPayload(run, summaries.length ? { summaries, aggregate } : null);
  const { compatibility: compat, included, setPersisted } = await _registerStoredRun(stored, baseline);
  return { run: stored, compatibility: compat, included, persisted, payloadSessionOnly, metaFailed, setPersisted };
}

/** Shared post-persistence registration: baseline compatibility check,
 * include-or-auto-exclude in the analysis set, refresh + basis sync. */
async function _registerStoredRun(stored, baseline = _semanticFromBaseline()) {
  const compat = classifyRunCompatibility(stored, baseline);
  let included = false;
  if (compat.status === COMPATIBILITY.INCOMPATIBLE && baseline) {
    _set = excludeRunFromSet(_set, stored.runId, {
      reason: 'configuration-mismatch',
      note: `Auto-excluded: ${compat.diffs.map(d => `${d.field} ${d.baseline ?? '?'} → ${d.actual ?? '?'}`).join('; ')}`,
      auto: 'incompatible',
    });
  } else {
    _set = includeRunInSet(_set, stored.runId);
    included = true;
  }
  // A set-write failure must not abort registration: the selection stays
  // correct in memory and is disclosed as session-scoped.
  const setPersisted = await _persistSet();
  // Merge — never a blind replace — so a run the store could not hold is not
  // erased from the library by this refresh.
  await _refreshRuns();
  _syncEvidenceBasis();
  return { compatibility: compat, included, setPersisted };
}

/** Record a failed execution — retained for provenance, never contributes. */
export async function recordFailedRun({ config = {}, error = null } = {}) {
  if (!_ready) return null;
  const ordinal = nextRunOrdinal(_runs.filter(r => r.origin !== 'bundled'));
  const run = createRunRecord({
    experimentId: _experiment.experimentId, ordinal,
    status: RUN_STATUS.FAILED, error: String(error ?? 'unknown').slice(0, 500),
    config: { presetId: config.presetId ?? null, profileId: config.profileId ?? null, policyIds: config.policyIds ?? null, matchCount: config.matchCount ?? 0, workers: config.workers ?? null, seedStrategy: config.seedStrategy ?? null, ordinalStart: config.ordinalStart ?? null, ordinalEnd: config.ordinalEnd ?? null, strategicTrace: config.strategicTrace === true },
    provenance: { rulesVersion: RULES_VERSION, engineVersion: ENGINE_VERSION, labVersion: LAB_VERSION },
    payloadKind: 'none',
  });
  try { await _store.saveRun(run, null); }
  catch (e) {
    console.warn('[experiments] failed-run persist failed:', e);
    _memoryOnlyRunIds.add(run.runId);
    _runs = [..._runs.filter(r => r.runId !== run.runId), run].sort(_byOrdinal);
  }
  await _refreshRuns();
  _syncEvidenceBasis();
  return run;
}

export async function recordCancelledRun({ config = {} } = {}) {
  if (!_ready) return null;
  const ordinal = nextRunOrdinal(_runs.filter(r => r.origin !== 'bundled'));
  const run = createRunRecord({
    experimentId: _experiment.experimentId, ordinal,
    status: RUN_STATUS.CANCELLED,
    config: { presetId: config.presetId ?? null, profileId: config.profileId ?? null, policyIds: config.policyIds ?? null, matchCount: config.matchCount ?? 0, workers: config.workers ?? null, seedStrategy: config.seedStrategy ?? null, ordinalStart: config.ordinalStart ?? null, ordinalEnd: config.ordinalEnd ?? null, strategicTrace: config.strategicTrace === true },
    provenance: { rulesVersion: RULES_VERSION, engineVersion: ENGINE_VERSION, labVersion: LAB_VERSION },
    payloadKind: 'none',
  });
  try { await _store.saveRun(run, null); }
  catch (e) {
    console.warn('[experiments] cancelled-run persist failed:', e);
    _memoryOnlyRunIds.add(run.runId);
    _runs = [..._runs.filter(r => r.runId !== run.runId), run].sort(_byOrdinal);
  }
  await _refreshRuns();
  _syncEvidenceBasis();
  return run;
}

// ── Chunked run lifecycle (manifest → batch commits → seal) ─────
//
// The durable execution contract:
//   beginExperimentRun    — manifest persisted BEFORE any simulation runs
//   commitExperimentBatch — batch record + manifest checkpoint atomically
//   finalizeExperimentRun — payload descriptor + run record + completed
//                           manifest atomically; only then is the run
//                           allowed to exist or contribute
//   fail/cancel           — manifest transitions; committed batches kept
//   resume                — replan from the committed frontier
//
// A run NEVER appears completed unless every required write committed.
// A crash loses at most the in-flight batch.

async function _getManifest(manifestId) {
  return _manifests.get(manifestId) ?? await _store.getManifest(manifestId) ?? null;
}

async function _persistManifest(manifest) {
  await _store.putManifest(manifest);
  _manifests.set(manifest.manifestId, manifest);
}

/** Inject the UI executor that drives worker segments for a resume plan. */
export function registerRunExecutor(fn) { _runExecutor = fn; }

/**
 * Open a manifest for a new run. Persisted before any simulation begins so
 * even a crash during batch 1 leaves an honest interrupted record. Throws
 * when experiments aren't ready or the manifest can't be written — a run
 * that cannot checkpoint does not start.
 */
export async function beginExperimentRun({ config = {}, segments = null, batchSize = 0 } = {}) {
  if (!_ready || !_experiment) throw Object.assign(new Error('EXPERIMENTS_NOT_READY'), { code: 'EXPERIMENTS_NOT_READY' });
  const ordinal = Math.max(
    nextRunOrdinal(_runs.filter(r => r.origin !== 'bundled')),
    [..._manifests.values()].reduce((m, x) => Math.max(m, (x.ordinal ?? 0) + 1), 0),
  );
  const runId = runIdFor(_experiment.experimentId, ordinal);
  const manifest = createRunManifest({
    runId, experimentId: _experiment.experimentId, ordinal,
    config, requestedMatches: config.matchCount ?? 0, batchSize, segments,
  });
  await _persistManifest(manifest);
  return { runId, manifest };
}

/**
 * Commit a simulated batch durably. The batch record and the manifest
 * checkpoint write in ONE transaction — committedMatches can never claim
 * evidence the store doesn't hold. Throws on write failure; callers must
 * treat that as a persistence failure (pause/fail the run, never continue
 * accumulating unsaved work).
 */
export async function commitExperimentBatch(runId, { segmentIndex = 0, ordinalStart = null, ordinalEnd = null, summaries = [] } = {}) {
  const manifest = await _getManifest(runId);
  if (!manifest) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING' });
  if (!manifestIsActive(manifest)) {
    throw Object.assign(new Error('RUN_MANIFEST_NOT_ACTIVE'), { code: 'RUN_MANIFEST_NOT_ACTIVE' });
  }
  const batchIndex = (manifest.committedBatches ?? []).length;
  const batch = {
    batchId: `${runId}#${batchIndex}`,
    runId, batchIndex, segmentIndex,
    ordinalStart: ordinalStart ?? summaries[0]?.matchOrdinal ?? null,
    ordinalEnd: ordinalEnd ?? (summaries.length ? (summaries[summaries.length - 1]?.matchOrdinal ?? 0) + 1 : ordinalStart),
    matchCount: summaries.length,
    summariesHash: batchSummariesHash(summaries),
    committedAt: new Date().toISOString(),
    summaries,
  };
  const next = commitManifestBatch(manifest, {
    batchIndex, segmentIndex,
    ordinalStart: batch.ordinalStart, ordinalEnd: batch.ordinalEnd,
    matchCount: batch.matchCount,
    summariesHash: batch.summariesHash,
    matchResultHashes: summaries.map(s => ({ o: s.matchOrdinal, h: s.matchResultHash })),
    committedAt: batch.committedAt,
  });
  next.headline = foldSummariesIntoHeadline(manifest.headline ? { ...manifest.headline, seatWins: { ...manifest.headline.seatWins } } : createManifestHeadline(), summaries);
  await _store.commitRunBatch({ manifest: next, batch });
  _manifests.set(runId, next);
  return { runId, batchIndex, committedMatches: next.committedMatches, requestedMatches: next.requestedMatches };
}

/**
 * Stream a run's committed batches to the aggregate pipeline (worker when
 * available). Each batch is loaded, hash-verified, posted, and released —
 * finalize never materializes the whole run on the main thread.
 */
async function _aggregateCommitted(runId, descriptors, semantic) {
  let stream = null;
  try { stream = _aggregateStream(); } catch { stream = null; }
  const parts = stream ? null : []; // union only for the no-worker fallback
  for (const d of descriptors) {
    const batch = await _store.getRunBatch(runId, d.batchIndex);
    if (!batch) throw Object.assign(new Error('RUN_PAYLOAD_MISSING'), { code: 'RUN_PAYLOAD_MISSING' });
    if (batchSummariesHash(batch.summaries) !== d.summariesHash) {
      throw Object.assign(new Error('RUN_PAYLOAD_HASH_MISMATCH'), { code: 'RUN_PAYLOAD_HASH_MISMATCH' });
    }
    if (stream) stream.worker.postMessage({ type: 'run-autonomy-aggregate-chunk', summariesJson: JSON.stringify(batch.summaries) });
    else parts.push(...batch.summaries);
  }
  if (stream) {
    stream.worker.postMessage({ type: 'run-autonomy-aggregate-finish', semantic });
    try { return await stream.done; }
    catch (error) { console.warn('[experiments] streamed aggregate failed — sealing with headline metrics:', error?.message ?? error); return { aggregate: null, observatory: null }; }
  }
  try {
    const { campaignAggregate, buildObservatoryAnalytics } = await import('../browser-analytics.js');
    const aggregate = campaignAggregate(parts, semantic);
    return { aggregate, observatory: buildObservatoryAnalytics({ summaries: parts, aggregate }) };
  } catch (error) {
    // The seal must not fail because the observatory recompute did — the
    // committed batches are already durable evidence. Metrics fall back to
    // the manifest headline; applySelection recomputes analytics later.
    console.warn('[experiments] aggregate unavailable at seal — headline metrics used:', error?.message ?? error);
    return { aggregate: null, observatory: null };
  }
}

/**
 * Seal a manifest into an immutable Run. Committed batches stay in the
 * runBatches store; the payload row holds the descriptor chain + aggregate.
 * Finalize uses only committed work — sealing an interrupted manifest
 * produces honest partial evidence (requested vs committed is explicit).
 */
export async function finalizeExperimentRun(runId, { durationMs = null } = {}) {
  if (!_ready) return null;
  const manifest = await _getManifest(runId);
  if (!manifest) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING' });
  if (manifest.sealedRunId) throw Object.assign(new Error('RUN_ALREADY_SEALED'), { code: 'RUN_ALREADY_SEALED' });
  const descriptors = (manifest.committedBatches ?? []).slice()
    .sort((a, b) => (a.ordinalStart ?? 0) - (b.ordinalStart ?? 0) || (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  if (!descriptors.length) {
    const failed = manifestTransition(manifest, MANIFEST_STATUS.FAILED, { failure: { message: 'No committed evidence to seal.', phase: 'finalize' } });
    await _persistManifest(failed).catch(() => {});
    throw Object.assign(new Error('RUN_NO_COMMITTED_EVIDENCE'), { code: 'RUN_NO_COMMITTED_EVIDENCE' });
  }
  const committed = manifest.committedMatches ?? descriptors.reduce((n, d) => n + (d.matchCount ?? 0), 0);
  const requested = manifest.requestedMatches ?? committed;
  const partial = committed < requested;
  const hashEntries = descriptors.flatMap(d => d.matchResultHashes ?? []).sort((a, b) => (a.o ?? 0) - (b.o ?? 0));
  const canonicalResultHash = hashCanonical(hashEntries.map(x => x.h));
  const semantic = {
    experimentHash: canonicalResultHash,
    profileId: manifest.config?.profileId ?? null,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    labVersion: LAB_VERSION,
    canonicalResultHash,
  };
  const { aggregate, observatory } = await _aggregateCommitted(runId, descriptors, semantic);
  const baseline = _semanticFromBaseline();
  const run = createRunRecord({
    experimentId: _experiment.experimentId,
    ordinal: manifest.ordinal ?? nextRunOrdinal(_runs.filter(r => r.origin !== 'bundled')),
    status: RUN_STATUS.COMPLETED,
    config: {
      ...manifest.config,
      matchCount: committed,
      ...(partial ? { requestedMatchCount: requested, ordinalCoverage: manifestCommittedCoverage(manifest) } : {}),
    },
    provenance: {
      rulesVersion: RULES_VERSION,
      engineVersion: ENGINE_VERSION,
      labVersion: LAB_VERSION,
      experimentHash: aggregate?.experimentHash ?? canonicalResultHash,
      canonicalResultHash,
      aggregateHash: aggregate?.aggregateHash ?? null,
    },
    metrics: {
      matchCount: aggregate?.matchCount ?? committed,
      completedMatchCount: aggregate?.completedMatchCount ?? manifest.headline?.completedMatchCount ?? null,
      abortCount: aggregate?.abortCount ?? manifest.headline?.abortCount ?? 0,
      drawCount: aggregate?.drawCount ?? manifest.headline?.drawCount ?? 0,
      seat1Wins: aggregate?.seatWins?.['1'] ?? manifest.headline?.seatWins?.['1'] ?? null,
      seat2Wins: aggregate?.seatWins?.['2'] ?? manifest.headline?.seatWins?.['2'] ?? null,
      seat1WinRate: aggregate?.seat1WinRate ?? null,
      durationMs: durationMs ?? aggregate?.durationMs ?? manifest.headline?.durationMs ?? null,
      policyResults: aggregate?.policies ?? null,
    },
    payloadKind: 'indexeddb-batches',
    payloadHash: payloadEvidenceHash({
      kind: 'batches',
      batches: descriptors.map(d => ({ batchIndex: d.batchIndex, ordinalStart: d.ordinalStart, ordinalEnd: d.ordinalEnd, matchCount: d.matchCount, summariesHash: d.summariesHash })),
      aggregate,
    }),
  });
  const payload = {
    kind: 'batches',
    batches: descriptors.map(d => ({ batchIndex: d.batchIndex, ordinalStart: d.ordinalStart, ordinalEnd: d.ordinalEnd, matchCount: d.matchCount, summariesHash: d.summariesHash })),
    aggregate,
  };
  const sealed = run;
  if (partial) sealed.retentionNote = `Sealed as partial evidence — ${committed} of ${requested} requested matches committed before the run stopped.`;
  const finalManifest = manifestTransition(
    { ...manifest, sealedRunId: run.runId, resumable: false },
    MANIFEST_STATUS.COMPLETED,
  );
  await _store.finalizeRun({ run: sealed, payload, manifest: finalManifest });
  _manifests.set(runId, finalManifest);
  const { compatibility: compat, included, setPersisted } = await _registerStoredRun(sealed, baseline);
  await applySelection({ fastPath: { aggregate, observatory } });
  return { run: sealed, compatibility: compat, included, persisted: _store.persisted === true, payloadSessionOnly: false, metaFailed: false, setPersisted, aggregate, observatory };
}

/** Mark a manifest run failed — committed evidence is preserved. */
export async function failExperimentRun(runId, error = null) {
  const manifest = await _getManifest(runId);
  if (!manifest) return null;
  const next = manifestTransition(manifest, MANIFEST_STATUS.FAILED, {
    failure: { message: String(error ?? 'unknown').slice(0, 500), phase: 'execution' },
  });
  await _persistManifest(next).catch(e => { console.warn('[experiments] fail-transition persist failed:', e); _manifests.set(runId, next); });
  _syncEvidenceBasis();
  return next;
}

/** Cancel a manifest run — committed evidence is preserved and resumable. */
export async function cancelExperimentRun(runId) {
  const manifest = await _getManifest(runId);
  if (!manifest) return null;
  const next = manifestTransition(manifest, MANIFEST_STATUS.CANCELLED, {
    failure: { message: 'Cancelled by user.', phase: 'execution' },
  });
  await _persistManifest(next).catch(e => { console.warn('[experiments] cancel-transition persist failed:', e); _manifests.set(runId, next); });
  _syncEvidenceBasis();
  return next;
}

/** Incomplete manifests for the Manage Runs surface. */
export function getIncompleteRuns() {
  return [..._manifests.values()]
    .filter(m => m.status !== MANIFEST_STATUS.COMPLETED)
    .map(m => ({
      manifestId: m.manifestId,
      runId: m.runId,
      ordinal: m.ordinal ?? 0,
      status: m.status,
      requestedMatches: m.requestedMatches ?? 0,
      committedMatches: m.committedMatches ?? 0,
      headline: m.headline ?? null,
      updatedAt: m.updatedAt ?? null,
      createdAt: m.createdAt ?? null,
      resumable: manifestIsResumable(m),
      failure: m.failure ?? null,
      config: m.config ?? {},
    }))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

/**
 * Resume an interrupted/cancelled manifest from its committed frontier.
 * Returns the plan executed — deterministic: the same ordinals produce the
 * same seeds, so resumed evidence is indistinguishable from uninterrupted.
 */
export async function resumeExperimentRun(manifestId) {
  const manifest = await _getManifest(manifestId);
  if (!manifest) throw new Error('RUN_MANIFEST_MISSING');
  if (manifest.sealedRunId) throw new Error('RUN_ALREADY_SEALED');
  if (manifestRemainingSegments(manifest).length === 0) {
    // Every ordinal committed but the seal never landed — no resimulation
    // needed, the caller just finalizes.
    return { runId: manifestId, resumed: false, needsSeal: true };
  }
  if (!manifestIsResumable(manifest)) throw new Error('RUN_NOT_RESUMABLE');
  const running = manifestTransition(manifest, MANIFEST_STATUS.RUNNING, { failure: null });
  await _persistManifest(running);
  const base = manifest.config?.ordinalStart ?? 0;
  const plan = {
    runId: manifestId,
    config: manifest.config ?? {},
    batchSize: manifest.batchSize ?? 0,
    requestedMatches: manifest.requestedMatches ?? 0,
    committedMatches: manifest.committedMatches ?? 0,
    // Worker-relative ranges: workers take ordinalStart/End relative to the
    // campaign's matchCount, while manifest segments are absolute ordinals.
    segments: manifestRemainingSegments(manifest).map(s => ({
      index: s.index,
      ordinalStart: s.ordinalStart - base,
      ordinalEnd: s.ordinalEnd - base,
    })),
  };
  if (_runExecutor) {
    Promise.resolve(_runExecutor(plan)).catch(error => {
      failExperimentRun(manifestId, error?.message ?? error).catch(() => {});
    });
  }
  return plan;
}

/** Delete an unfinalized manifest plus its committed batches. */
export async function discardManifest(manifestId) {
  const manifest = await _getManifest(manifestId);
  if (!manifest) throw new Error('RUN_MANIFEST_MISSING');
  if (manifest.sealedRunId) throw new Error('RUN_ALREADY_SEALED');
  await _store.deleteManifestCascade(manifestId);
  _manifests.delete(manifestId);
  _syncEvidenceBasis();
  return manifestId;
}

/**
 * Load a single match's full detail (decisions, traces, replay) on demand.
 * The retained UI index is slim — detail lives in the batch store and is
 * fetched only for explicit inspection (Watch, traces, debugging).
 */
export async function loadRunMatchDetail(runId, matchId) {
  const run = _findRun(runId);
  const manifest = await _getManifest(runId);
  const descriptors = run?.payloadKind === 'indexeddb-batches'
    ? (await _store.getRunPayload(runId))?.batches ?? []
    : (manifest?.committedBatches ?? []);
  for (const d of descriptors) {
    const batch = await _store.getRunBatch(runId, d.batchIndex);
    if (!batch) continue;
    const found = (batch.summaries ?? []).find(s => s.matchId === matchId || s.matchOrdinal === matchId);
    if (found) return found;
  }
  return null;
}

// ── Curation ────────────────────────────────────────────────────

function _findRun(runId) { return _runs.find(r => r.runId === runId) ?? null; }

/** Include a run in the active analysis set. Incompatible runs require
 * force:true — the UI surfaces the diff and asks for explicit consent. */
export async function setRunIncluded(runId, { force = false } = {}) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  if (run.status !== RUN_STATUS.COMPLETED) throw new Error('RUN_NOT_COMPLETED');
  if (run.lifecycle?.state === RUN_LIFECYCLE.INVALIDATED) throw new Error('RUN_INVALIDATED');
  // Integrity is not a curation preference: "include anyway" can never
  // override a failed hash, a tampered payload, or a missing payload —
  // there is no verified evidence to analyze.
  const integrity = runIntegrityState(run);
  if (integrity === 'corrupt' || integrity === RUN_INTEGRITY.QUARANTINED) throw new Error('RUN_CORRUPTED');
  if (integrity === RUN_INTEGRITY.PAYLOAD_UNAVAILABLE) throw new Error('RUN_PAYLOAD_UNAVAILABLE');
  const baseline = _semanticFromBaseline();
  const compat = classifyRunCompatibility(run, baseline && baseline.runId !== runId ? baseline : null);
  if (compat.status === COMPATIBILITY.INCOMPATIBLE && !force) {
    return { ok: false, requiresForce: true, compatibility: compat };
  }
  _set = includeRunInSet(_set, runId);
  await _persistSet();
  _syncEvidenceBasis();
  await applySelection();
  return { ok: true, compatibility: compat };
}

export async function setRunExcluded(runId, { reason = 'other', note = '' } = {}) {
  if (!EXCLUSION_REASONS.includes(reason)) throw new Error('EXCLUSION_REASON_INVALID');
  if (!_findRun(runId)) throw new Error('RUN_NOT_FOUND');
  _set = excludeRunFromSet(_set, runId, { reason, note });
  await _persistSet();
  _syncEvidenceBasis();
  await applySelection();
  return { ok: true };
}

/** Invalidation marks evidence defective — it leaves the set and cannot be
 * re-included until explicitly restored. */
export async function markRunInvalidated(runId, { reason = 'other', note = '' } = {}) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  const updated = invalidateRun(run, { reason, note });
  await _updateRun(updated);
  if (_set.includedRunIds.includes(runId)) {
    _set = excludeRunFromSet(_set, runId, { reason, note: note || `Invalidated: ${reason}`, auto: 'invalidated' });
    await _persistSet();
  }
  _syncEvidenceBasis();
  await applySelection();
  return { ok: true };
}

export async function markRunArchived(runId, archived = true) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  const updated = archived ? archiveRun(run) : restoreRun(run);
  await _updateRun(updated);
  if (archived && _set.includedRunIds.includes(runId)) {
    _set = excludeRunFromSet(_set, runId, { reason: 'other', note: 'Archived — removed from active evidence view.', auto: 'archived' });
    await _persistSet();
  }
  _syncEvidenceBasis();
  await applySelection();
  return { ok: true };
}

export async function markRunRestored(runId) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  const updated = restoreRun(run);
  await _updateRun(updated);
  _syncEvidenceBasis();
  return { ok: true };
}

export async function markRunPinned(runId, pinned = true) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  const updated = pinRun(run, pinned);
  await _updateRun(updated);
  return { ok: true };
}

/** Bulk: include every run that is compatible (or treatment-change) with
 * the current baseline. Incompatible and invalidated runs stay out. */
export async function includeAllCompatible() {
  const rows = runsWithCompatibility();
  for (const { run, compatibility } of rows) {
    if (run.status !== RUN_STATUS.COMPLETED) continue;
    if ((run.lifecycle?.state ?? 'active') !== 'active') continue;
    if (!runAnalyticallyEligible(run)) continue; // corrupt/quarantined/payload-missing stay out
    if (_set.includedRunIds.includes(run.runId)) continue;
    if (compatibility.status === COMPATIBILITY.INCOMPATIBLE) continue;
    _set = includeRunInSet(_set, run.runId);
  }
  await _persistSet();
  _syncEvidenceBasis();
  await applySelection();
}

/** Analyze a single run in isolation — excludes all others with a recorded
 * reason. Reversible: re-include the rest from the same panel. */
export async function isolateRun(runId) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  if (!runAnalyticallyEligible(run)) throw new Error(run.corrupt === true || runIntegrityState(run) === RUN_INTEGRITY.QUARANTINED ? 'RUN_CORRUPTED' : 'RUN_PAYLOAD_UNAVAILABLE');
  for (const other of _runs) {
    if (other.runId === runId) continue;
    if (other.runId === BUNDLED_RUN_ID) continue;
    if (_set.includedRunIds.includes(other.runId)) {
      _set = excludeRunFromSet(_set, other.runId, { reason: 'other', note: `Isolated analysis — inspect run #${String(run.ordinal).padStart(3, '0')} alone` });
    }
  }
  if (!_set.includedRunIds.includes(runId)) _set = includeRunInSet(_set, runId);
  await _persistSet();
  _syncEvidenceBasis();
  await applySelection();
}

/** Restore the bundled certified baseline as the working dataset — empties
 * the analysis set (exclusions are recorded, never deleted). */
export async function restoreBaseline() {
  if (!_ready) return;
  for (const id of [..._set.includedRunIds]) {
    if (id === BUNDLED_RUN_ID) continue;
    _set = excludeRunFromSet(_set, id, { reason: 'other', note: 'Restored certified baseline' });
  }
  _set = { ..._set, includedRunIds: [], activated: false };
  await _persistSet();
  _syncEvidenceBasis();
  await applySelection();
}

/** Guarded destructive delete. Exclusion/archive are the intended controls;
 * deletion exists for genuinely unwanted records. */
export async function deleteRun(runId) {
  if (runId === BUNDLED_RUN_ID) throw new Error('CANNOT_DELETE_BUNDLED_BASELINE');
  try {
    await _store.deleteRun(runId);
    _set = await _store.getActiveAnalysisSet(_experiment).catch(() => _set);
  } catch (error) {
    // A session-only record has nothing to delete in the store — removing
    // the local copy is the complete deletion. Anything else is a real
    // store failure and must surface.
    if (!_memoryOnlyRunIds.has(runId)) throw error;
  }
  _sessionPayloads.delete(runId);
  _memoryOnlyRunIds.delete(runId);
  _runs = _runs.filter(r => r.runId !== runId);
  if (_set?.includedRunIds?.includes(runId)) {
    _set = { ..._set, includedRunIds: _set.includedRunIds.filter(id => id !== runId) };
    await _persistSet();
  }
  await _refreshRuns();
  _syncEvidenceBasis();
  await applySelection();
  return runId;
}

// ── Aggregation ─────────────────────────────────────────────────

function _syncEvidenceBasis() {
  state.evidenceBasis = getEvidenceBasis();
}

function _syncDerivedFromObservatory() {
  state.rankPower = state.observatory?.rankPower ?? null;
  state.swapMatrix = state.observatory?.swapMatrix ?? null;
  state.variantAnalytics = state.observatory?.variantAnalytics ?? state.variantAnalytics;
}

function _restoreBootView() {
  if (!state.bootState) return;
  state.observatory = structuredClone(state.bootState.observatory);
  state.aggregate = structuredClone(state.bootState.aggregate);
  state.rankPower = state.bootState.rankPower != null ? structuredClone(state.bootState.rankPower) : state.observatory?.rankPower ?? null;
  state.swapMatrix = state.bootState.swapMatrix != null ? structuredClone(state.bootState.swapMatrix) : state.observatory?.swapMatrix ?? null;
  state.variantAnalytics = state.bootState.variantAnalytics != null ? structuredClone(state.bootState.variantAnalytics) : state.observatory?.variantAnalytics ?? state.variantAnalytics;
}

/**
 * Verify a run's evidence and stream it to a chunk consumer, bounded by
 * batch size — never by whole-run size. Returns { ok, code }:
 *   - bundled: baseline corpus ships with the app; its authority is the
 *     bundled artifact itself, not a stored payload.
 *   - unsealed records (payloadHash null, schema 1.0): verified:false — the
 *     record's own runHash is the authority, nothing to check against.
 *   - 'indexeddb-batches': the descriptor chain is verified against the
 *     sealed payloadHash first, then every batch is hash-verified BEFORE any
 *     of its summaries streams — a corrupt batch quarantines the whole run
 *     and nothing partial reaches the aggregate.
 */
async function _verifyAndStreamRun(run, onChunk) {
  if (run.payloadKind === 'bundled') { await onChunk(_bootSummaries); return { ok: true, code: null }; }
  if (run.payloadKind === 'session') {
    const payload = _sessionPayloads.get(run.runId) ?? null;
    if (!payload) return { ok: false, code: 'RUN_PAYLOAD_MISSING' };
    const verdict = verifyRunPayload(run, payload);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    await onChunk(payload.summaries ?? []);
    return { ok: true, code: null };
  }
  if (run.payloadKind === 'indexeddb') {
    const payload = await _store.getRunPayload(run.runId);
    if (!payload) return { ok: false, code: 'RUN_PAYLOAD_MISSING' };
    const verdict = verifyRunPayload(run, payload);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    await onChunk(payload.summaries ?? []);
    return { ok: true, code: null };
  }
  if (run.payloadKind === 'indexeddb-batches') {
    const payload = await _store.getRunPayload(run.runId);
    if (!payload) return { ok: false, code: 'RUN_PAYLOAD_MISSING' };
    const verdict = verifyRunPayload(run, payload);
    if (!verdict.ok) return { ok: false, code: verdict.code };
    const descriptors = (payload.batches ?? []).slice()
      .sort((a, b) => (a.ordinalStart ?? 0) - (b.ordinalStart ?? 0) || (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
    // Pass 1: verify every batch hash before emitting — a run contributes
    // completely or not at all, never partially.
    for (const d of descriptors) {
      const batch = await _store.getRunBatch(run.runId, d.batchIndex);
      if (!batch) return { ok: false, code: 'RUN_PAYLOAD_MISSING' };
      if (batchSummariesHash(batch.summaries) !== d.summariesHash) return { ok: false, code: 'RUN_PAYLOAD_HASH_MISMATCH' };
    }
    // Pass 2: stream one batch at a time; each is released after consume.
    for (const d of descriptors) {
      const batch = await _store.getRunBatch(run.runId, d.batchIndex);
      await onChunk(batch.summaries ?? []);
    }
    return { ok: true, code: null };
  }
  return { ok: false, code: 'RUN_PAYLOAD_MISSING' };
}

/** Mark a run's detected-integrity state and persist it. The record stays in
 * the library and inspectable — it simply becomes analytically ineligible.
 * Only the evidence layer writes lifecycle.integrity; curation cannot. */
async function _flagRunIntegrity(runId, { state: integrityState, code = null, note = '' }) {
  const run = _findRun(runId);
  if (!run || run.corrupt === true) return; // corrupt records are already ineligible
  if (runIntegrityState(run) === integrityState && run.lifecycle?.integrity?.code === code) return;
  const updated = markRunIntegrity(run, { state: integrityState, code, note });
  try { await _updateRun(updated); }
  catch (error) { console.warn('[experiments] integrity mark persist failed:', error); _runs = _runs.map(r => r.runId === runId ? updated : r); }
}

/** Last-resort union collector for the no-worker fallback path. */
async function _collectUnion(runs) {
  const union = [];
  for (const run of runs) {
    const result = await _verifyAndStreamRun(run, async summaries => { union.push(...summaries); });
    if (!result.ok) console.warn(`[experiments] run ${run.runId} dropped during fallback union: ${result.code}`);
  }
  return union;
}

/** Open a streaming aggregate worker: post begin → chunk×N → finish. */
function _aggregateStream() {
  const worker = new Worker('worker.js', { type: 'module' });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { worker.terminate(); } catch { /* already terminated */ } reject(new Error('AGGREGATE_WORKER_TIMEOUT')); }, 180000);
    worker.onmessage = e => {
      const x = e.data ?? {};
      if (x.type !== 'autonomy-aggregate-result') return;
      clearTimeout(timer);
      try { worker.terminate(); } catch { /* already terminated */ }
      if (x.ok) resolve({ aggregate: JSON.parse(x.aggregateJson ?? 'null'), observatory: JSON.parse(x.observatoryJson ?? 'null') });
      else reject(new Error(x.error ?? 'AGGREGATE_FAILED'));
    };
    worker.onerror = e => { clearTimeout(timer); try { worker.terminate(); } catch { /* already terminated */ } reject(new Error(e.message ?? 'AGGREGATE_WORKER_ERROR')); };
  });
  worker.postMessage({ type: 'run-autonomy-aggregate-begin' });
  return { worker, done };
}

/**
 * Recompute state.observatory / state.aggregate from the currently included
 * runs. Verified run evidence streams to the aggregate worker one batch at
 * a time — the union is never assembled on the main thread. The retained
 * UI index is the slim projection (no per-decision detail). Empty selection
 * restores the certified baseline view — never an erased/blank dataset.
 */
export async function applySelection({ fastPath = null } = {}) {
  if (!_ready) return;
  const token = ++_applyToken;
  const contributing = contributingRuns(_runs, _set);
  let sessionRuns = contributing.filter(r => r.runId !== BUNDLED_RUN_ID);
  if (!sessionRuns.length) {
    _restoreBootView();
    _syncEvidenceBasis();
    updateRailContext();
    rerender();
    return;
  }
  const contributingClean0 = contributing.filter(runAnalyticallyEligible);
  const useFastPath = fastPath && sessionRuns.length === 1 && contributingClean0.length === sessionRuns.length;
  // Stream verified evidence: per-run verification happens BEFORE any chunk
  // reaches the aggregate, so a corrupt run contributes nothing — identical
  // semantics to the old load-then-aggregate flow, at batch-bounded memory.
  const integrityEvents = [];
  const slimIndex = [];
  const resultHashes = [];
  let stream = null;
  if (!useFastPath) {
    try { stream = _aggregateStream(); }
    catch (error) { console.warn('[experiments] aggregate worker unavailable — unioning on main thread:', error?.message ?? error); }
  }
  const parts = stream ? null : []; // union only retained for the no-worker fallback
  for (const run of contributing) {
    const result = await _verifyAndStreamRun(run, async summaries => {
      for (const s of summaries) {
        slimIndex.push(slimSummary(s));
        resultHashes.push(s.matchResultHash);
      }
      if (stream) stream.worker.postMessage({ type: 'run-autonomy-aggregate-chunk', summariesJson: JSON.stringify(summaries) });
      else if (parts) parts.push(...summaries);
    });
    if (!result.ok) integrityEvents.push({ run, code: result.code });
  }
  for (const { run, code } of integrityEvents) {
    const state_ = code === 'RUN_PAYLOAD_HASH_MISMATCH' ? RUN_INTEGRITY.QUARANTINED : RUN_INTEGRITY.PAYLOAD_UNAVAILABLE;
    const note = code === 'RUN_PAYLOAD_HASH_MISMATCH'
      ? `Evidence payload failed integrity verification (${code}) — quarantined; the record stays inspectable.`
      : `Evidence payload referenced by this run is no longer available (${code}) — excluded from analytics.`;
    await _flagRunIntegrity(run.runId, { state: state_, code, note });
    showToast(`Run #${String(run.ordinal).padStart(3, '0')} ${state_ === RUN_INTEGRITY.QUARANTINED ? 'quarantined: payload failed integrity verification' : 'has no retained evidence payload'} — it cannot contribute to analysis.`, { type: 'error', title: 'Evidence integrity' });
  }
  if (token !== _applyToken) { try { stream?.worker.terminate(); } catch { /* already terminated */ } return; } // superseded by a newer selection change
  const contributingClean = contributingRuns(_runs, _set);
  if (integrityEvents.length) {
    // Quarantined/unavailable runs are analytically ineligible — recompute.
    _syncEvidenceBasis();
    sessionRuns = contributingClean.filter(r => r.runId !== BUNDLED_RUN_ID);
    if (!sessionRuns.length) {
      try { stream?.worker.terminate(); } catch { /* already terminated */ }
      _restoreBootView();
      updateRailContext();
      rerender();
      return;
    }
  }
  const baseline = compatibilityBaseline(_runs, new Set(contributingClean.map(r => r.runId)));
  let aggregate = null, observatory = null;
  if (useFastPath) {
    // The just-completed run's worker already computed its own analytics —
    // reuse them instead of a redundant recompute.
    aggregate = fastPath.aggregate ?? null;
    observatory = fastPath.observatory ?? null;
  }
  if (!aggregate || !observatory) {
    const semantic = {
      experimentHash: baseline?.provenance?.canonicalResultHash ?? null,
      profileId: baseline?.config?.profileId ?? baseline?.provenance?.profileId ?? null,
      engineVersion: baseline?.provenance?.engineVersion ?? null,
      rulesVersion: baseline?.provenance?.rulesVersion ?? null,
      labVersion: LAB_VERSION,
      canonicalResultHash: hashCanonical(resultHashes),
    };
    try {
      if (stream) {
        stream.worker.postMessage({ type: 'run-autonomy-aggregate-finish', semantic });
        ({ aggregate, observatory } = await stream.done);
      } else {
        throw new Error('NO_AGGREGATE_WORKER');
      }
    } catch (workerError) {
      console.warn('[experiments] aggregate worker failed, computing on main thread:', workerError?.message ?? workerError);
      try {
        // No-worker fallback unions verified evidence on the main thread
        // (bounded by the analysis union — the legacy behavior, not the
        // streaming path's batch bound).
        const union = parts ?? await _collectUnion(contributingClean);
        const { campaignAggregate, buildObservatoryAnalytics } = await import('../browser-analytics.js');
        aggregate = campaignAggregate(union, semantic);
        observatory = buildObservatoryAnalytics({ summaries: union, aggregate });
      } catch (inner) {
        console.error('[experiments] aggregation failed:', inner);
        showToast('Could not recompute the analysis set — showing previous evidence.', { type: 'error', title: 'Aggregation failed' });
        return;
      }
    }
  }
  if (token !== _applyToken) return;
  state.aggregate = aggregate;
  state.observatory = { ...observatory, summaries: slimIndex, datasetOrigin: 'EXPERIMENT_RUNS' };
  _syncDerivedFromObservatory();
  _syncEvidenceBasis();
  updateRailContext();
  rerender();
}

/** Dossier/export projection — which runs produced the current analysis. */
export function collectExperimentEvidence() {
  if (!_ready) return { available: false, reason: 'Experiment evidence store not initialized.' };
  const basis = getEvidenceBasis();
  const rows = runsWithCompatibility();
  return {
    available: true,
    experimentId: basis.experimentId,
    analysisSetId: basis.analysisSetId,
    includedRunIds: basis.includedRunIds.filter(id => id !== BUNDLED_RUN_ID),
    bundledBaselineContributing: basis.includedRunIds.includes(BUNDLED_RUN_ID),
    includedRunCount: basis.includedRunCount,
    includedGames: basis.includedGames,
    excludedRunCount: basis.excludedRunCount,
    excludedGames: basis.excludedGames,
    totalRuns: basis.totalRuns,
    invalidatedCount: basis.invalidatedCount,
    archivedCount: basis.archivedCount,
    failedCount: basis.failedCount,
    corruptCount: basis.corruptCount,
    quarantinedCount: basis.quarantinedCount,
    payloadUnavailableCount: basis.payloadUnavailableCount,
    integrityFailures: basis.integrityFailures,
    persisted: basis.persisted,
    memoryOnlyRunCount: basis.memoryOnlyRunCount,
    sessionPayloadRunCount: basis.sessionPayloadRunCount,
    incompleteRunCount: getIncompleteRuns().length,
    incompleteRuns: getIncompleteRuns().map(m => ({
      manifestId: m.manifestId, status: m.status, ordinal: m.ordinal,
      requestedMatches: m.requestedMatches, committedMatches: m.committedMatches,
      resumable: m.resumable, failure: m.failure,
    })),
    fallback: basis.fallback,
    runs: rows.map(({ run, compatibility, included, exclusion, persistence }) => ({
      runId: run.runId, ordinal: run.ordinal, status: run.status,
      lifecycle: run.lifecycle?.state ?? 'active', pinned: run.lifecycle?.pinned === true,
      included, origin: run.origin ?? 'session', persistence,
      createdAt: run.createdAt ?? null,
      matchCount: run.metrics?.matchCount ?? 0,
      seat1WinRate: run.metrics?.seat1WinRate ?? null,
      compatibility: compatibility.status,
      exclusionReason: exclusion?.reason ?? null,
      exclusionNote: exclusion?.note ?? null,
      rulesVersion: run.provenance?.rulesVersion ?? null,
      engineVersion: run.provenance?.engineVersion ?? null,
      profileId: run.config?.profileId ?? null,
      policyIds: run.config?.policyIds ?? null,
      canonicalResultHash: run.provenance?.canonicalResultHash ?? null,
      runHash: run.runHash ?? null,
      payloadHash: run.payloadHash ?? null,
      integrity: runIntegrityState(run),
      integrityCode: run.corruptCode ?? run.lifecycle?.integrity?.code ?? null,
      integrityNote: run.lifecycle?.integrity?.note ?? null,
    })),
    warnings: basis.warnings,
  };
}
