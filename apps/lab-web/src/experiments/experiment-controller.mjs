import { LAB_IDENTITY } from '../evolution/identity.mjs';
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
import { hashCanonical } from '../../../../packages/shared/src/canonical.mjs';
import {
  DEFAULT_EXPERIMENT_ID, BUNDLED_RUN_ID,
  RUN_STATUS, RUN_LIFECYCLE, COMPATIBILITY, EXCLUSION_REASONS, RUN_INTEGRITY,
  MANIFEST_STATUS, MANIFEST_SCHEMA_VERSION, EXPERIMENT_LIMITS,
  createExperiment, createAnalysisSet, createRunRecord,
  manifestTransition, manifestIsActive, manifestIsResumable,
  manifestRemainingSegments, manifestCommittedCoverage, manifestRetainedOrdinals,
  batchSummariesHash, slimSummary,
  nextRunOrdinal, nextOrdinalStart, classifyRunCompatibility, compatibilityBaseline,
  contributingRuns, evidenceBasis, previewSelectionMetrics,
  includeRunInSet, excludeRunFromSet, invalidateRun, archiveRun, restoreRun, pinRun,
  planMigration, payloadEvidenceHash, verifyRunPayload, markRunIntegrity,
  runIntegrityState, runAnalyticallyEligible, validateRunRecord,
} from '../../../../packages/simulation-runtime/src/experiment-domain.mjs';
import {
  BROWSER_CAPACITY, evidenceBudget,
  experimentRunArtifact, artifactEvidenceForRun,
  validateExperimentRunArtifact, parseExperimentRunArtifact,
  validateResearchPackage, parseResearchPackage,
  runEvidenceBearing, DECISION_FIDELITY,
  createEvidenceAdmission, validateEvidenceBatch, selectEvidence, analyticsSummaries, publishEvidenceSnapshot, markEvidenceSnapshotStale,
} from '../../../../packages/simulation-runtime/src/experiment-portability.mjs';
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
// Durable ownership fencing (R02): this controller instance's owner id is
// minted once per boot. Manifests carry {ownerId, fencingToken, leaseUntil};
// the store rejects any mutation whose owner/token no longer matches, so a
// superseded controller can never mutate a run another owner holds.
let _ownerId = null;
const OWNER_LEASE_MS = 30000;

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
function _selectionBasis() {
  const basis = evidenceBasis(_runs, _set);
  return { ...basis, persisted: storePersisted(), memoryOnlyRunCount: _memoryOnlyRunIds.size, sessionPayloadRunCount: _runs.filter(r => r.payloadKind === 'session' && !_memoryOnlyRunIds.has(r.runId)).length, experimentId: _experiment?.experimentId ?? null, analysisSetId: _set?.analysisSetId ?? null, fallback: contributingRuns(_runs, _set).filter(r => r.runId !== BUNDLED_RUN_ID).length ? null : 'certified-baseline' };
}

export function getEvidenceBasis() { return state.evidenceSnapshot?.basis ?? _selectionBasis(); }

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
  state.evidenceSnapshot=null;
  state.evidenceViewStatus={stale:false,error:null};
  _bootSummaries = bootSummaries ?? [];
  _sessionPayloads = new Map();
  _memoryOnlyRunIds = new Set();
  _store = store ?? new ExperimentStore();
  _ownerId = `LAB-OWNER-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  // Crash/reload recovery (R02-aware): a manifest still marked active was
  // cut off mid-execution ONLY if its ownership lease has lapsed or it was
  // never fenced. A manifest owned by another controller with a live lease
  // is still being worked — this boot must not invalidate or interrupt it.
  _manifests = new Map();
  try {
    if (typeof _store.listManifests === 'function') {
      const now = Date.now();
      for (const manifest of await _store.listManifests(_experiment.experimentId)) {
        let live = manifest;
        const foreignLeaseLive = manifest?.owner?.ownerId && manifest.owner.ownerId !== _ownerId
          && Number.isFinite(Date.parse(manifest.owner.leaseUntil ?? '')) && Date.parse(manifest.owner.leaseUntil) > now;
        if (manifestIsActive(manifest) && !foreignLeaseLive) {
          try { live = await _store.recoverManifest(manifest.manifestId); }
          catch (error) { console.warn('[experiments] interrupted-manifest persist failed:', error); }
        }
        _manifests.set(live.manifestId, live);
      }
    }
  } catch (error) { console.warn('[experiments] manifest recovery failed — interrupted runs may not be listed:', error); }
  _ready = true;
  for (const run of _runs.filter(r=>r.payloadKind!=='bundled')) {
    const probe=await _probeRunEvidence(run);
    const admission=probe.admission ?? {contract:'intrilex-admission@1',classification:'INVALID_QUARANTINED',eligible:false,reasons:[probe.code]};
    const integrity=probe.ok || run.corrupt ? run.lifecycle?.integrity : {
      state:['RUN_PAYLOAD_MISSING','RUN_CHUNK_MISSING','RUN_NO_RETAINED_EVIDENCE'].includes(probe.code)?RUN_INTEGRITY.PAYLOAD_UNAVAILABLE:RUN_INTEGRITY.QUARANTINED,
      code:probe.code,note:'Classified during evidence reload.'};
    const classified={...run,lifecycle:{...run.lifecycle,admission,integrity}};
    if(run.corrupt) _runs=_runs.map(r=>r.runId===run.runId?classified:r);
    else await _updateRun(classified);
    if(!probe.ok)showToast(`Run evidence excluded: ${probe.code}`,{type:'error',title:'Evidence integrity'});
  }
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
  try { await _store.putAnalysisSet(_set); return _store.persisted === true; }
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
    return { run, persisted: _store.persisted === true, payloadSessionOnly: _store.persisted !== true && payload != null, metaFailed: false };
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
    return { run: sessionRun, persisted: _store.persisted === true, payloadSessionOnly: payload != null, metaFailed: false };
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
  const observed=createEvidenceAdmission();observed.add(summaries);
  const retained=observed.finish().headline;
  const run = createRunRecord({
    experimentId: _experiment.experimentId,
    ordinal,
    status: RUN_STATUS.COMPLETED,
    config: {
      ...config,
      presetId: config.presetId ?? null,
      profileId: config.profileId ?? aggregate?.profileId ?? null,
      policyIds: config.policyIds ?? aggregate?.policyIds ?? null,
      matchCount: config.matchCount ?? summaries.length,
      workers: config.workers ?? null,
      seedStrategy: config.seedStrategy ?? null,
      ordinalStart: config.ordinalStart ?? null,
      ordinalEnd: config.ordinalEnd ?? null,
      strategicTrace: config.strategicTrace === true,
      experimentDesign: config.experimentDesign ?? aggregate?.experimentDesign ?? null,
    },
    provenance: {
      rulesVersion: aggregate?.rulesVersion ?? null,
      engineVersion: aggregate?.engineVersion ?? result?.engineVersion ?? ENGINE_VERSION,
      labVersion: aggregate?.labVersion ?? null,
      experimentHash: aggregate?.experimentHash ?? result?.canonicalResultHash ?? null,
      canonicalResultHash: aggregate?.canonicalResultHash ?? result?.canonicalResultHash ?? null,
      aggregateHash: aggregate?.aggregateHash ?? null,
    },
    metrics: {
      matchCount: aggregate?.matchCount ?? summaries.length,
      completedMatchCount: aggregate?.completedMatchCount ?? retained.completedMatchCount,
      abortCount: aggregate?.abortCount ?? result?.abortCount ?? retained.abortCount,
      drawCount: aggregate?.drawCount ?? retained.drawCount,
      seat1Wins: aggregate?.seatWins?.['1'] ?? retained.seatWins['1'],
      seat2Wins: aggregate?.seatWins?.['2'] ?? retained.seatWins['2'],
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
  return { run: stored, compatibility: compat, included, persistenceState: persisted && !payloadSessionOnly ? 'LOCALLY_COMMITTED' : 'SESSION_ONLY', persisted, payloadSessionOnly, metaFailed, setPersisted };
}

/** Shared post-persistence registration: baseline compatibility check,
 * include-or-auto-exclude in the analysis set, refresh + basis sync. */
async function _registerStoredRun(stored, baseline = _semanticFromBaseline()) {
  const compat = classifyRunCompatibility(stored, baseline);
  let included = false;
  const probe=await _probeRunEvidence(stored);
  const admission=probe.admission ?? {classification:'INVALID_QUARANTINED',eligible:false,reasons:[probe.code]};
  stored={...stored,lifecycle:{...stored.lifecycle,admission}};
  if(_memoryOnlyRunIds.has(stored.runId))_runs=_runs.map(r=>r.runId===stored.runId?stored:r);
  else await _updateRun(stored);
  if (!probe.ok || !probe.admission?.eligible) {
    _set=excludeRunFromSet(_set,stored.runId,{reason:'exploratory',note:probe.code ?? probe.admission?.reasons.join(', ') ?? 'Restricted evidence',auto:'admission'});
  } else if (compat.status === COMPATIBILITY.INCOMPATIBLE && baseline) {
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

/** Local ownership guard — fails fast before I/O when this controller is
 * not the fenced owner. The store still performs the authoritative compare
 * on every write (another instance may have taken over between checks). */
function _assertManifestOwner(manifest) {
  const owner = manifest?.owner ?? null;
  if (owner?.ownerId && owner.ownerId !== _ownerId) {
    throw Object.assign(new Error('RUN_OWNERSHIP_STALE'), { code: 'RUN_OWNERSHIP_STALE', manifestId: manifest.manifestId });
  }
}

/** Is `manifest` owned by a different live lease? (Inspection is always
 * allowed; mutation is not.) */
function _manifestForeignHeld(manifest) {
  const owner = manifest?.owner ?? null;
  return Boolean(owner?.ownerId) && owner.ownerId !== _ownerId
    && Number.isFinite(Date.parse(owner.leaseUntil ?? '')) && Date.parse(owner.leaseUntil) > Date.now();
}

/** Fresh owner record for a newly claimed manifest. */
function _newOwnerLease() {
  const now = Date.now();
  return { ownerId: _ownerId, fencingToken: 1, acquiredAt: new Date(now).toISOString(), leaseUntil: new Date(now + OWNER_LEASE_MS).toISOString() };
}

/** Extend this owner's lease on a manifest we hold (heartbeat piggy-back). */
function _renewedLease(owner) {
  if (!owner?.ownerId) return owner;
  return { ...owner, leaseUntil: new Date(Date.now() + OWNER_LEASE_MS).toISOString() };
}

/** Release ownership on a terminal transition so another controller may
 * resume the run without waiting out the lease. */
function _releasedOwner(owner) {
  if (!owner?.ownerId) return owner;
  return { ...owner, leaseUntil: new Date(0).toISOString() };
}

async function _persistManifest(manifest) {
  if (manifest?.owner) {
    _assertManifestOwner(manifest);
    manifest = await _store.putManifestFenced(manifest);
  } else {
    await _store.putManifest(manifest);
  }
  _manifests.set(manifest.manifestId, manifest);
}

/** Wave 0: memory fallback remains readable/exportable, never resumable. */
function requirePersistentCampaign() {
  if (_store?.persisted !== true) throw Object.assign(
    new Error('Persistent storage unavailable; durable campaign start/resume is suspended. Existing session evidence remains available for inspection and export.'),
    { code: 'LAB_WAVE0_PERSISTENT_STORAGE_REQUIRED' },
  );
}

/** Inject the UI executor that drives worker segments for a resume plan. */
export function registerRunExecutor(fn) { _runExecutor = fn; }

/**
 * Open a manifest for a new run — atomically claimed before any simulation
 * begins (R02). The ordinal/runId is recomputed from the STORE's authoritative
 * state on every claim attempt, so two controllers racing for the same
 * ordinal cannot both win: the loser gets EXPERIMENT_OCCURRENCE_CONFLICT and
 * retries on a fresh, actually-free occurrence. A display ordinal is never
 * treated as ownership — the claimed manifest carries this controller's
 * lease and every subsequent mutation is fence-checked.
 */
const executionFor = m => ({runId:m.runId,ownerId:m.owner?.ownerId,fencingToken:m.owner?.fencingToken});
function assertExecution(manifest, execution) {
  if(execution && (execution.runId!==manifest.runId || execution.ownerId!==manifest.owner?.ownerId || execution.fencingToken!==manifest.owner?.fencingToken))throw Object.assign(new Error('RUN_EXECUTION_STALE'),{code:'RUN_EXECUTION_STALE'});
}

export async function beginExperimentRun({ config = {}, segments = null, batchSize = 0 } = {}) {
  if (!_ready || !_experiment) throw Object.assign(new Error('EXPERIMENTS_NOT_READY'), { code: 'EXPERIMENTS_NOT_READY' });
  requirePersistentCampaign();
  const manifest = await _store.allocateRunManifest({ experimentId: _experiment.experimentId, config: { ...config, implementation: LAB_IDENTITY, seedStreamVersion: 'POLICY_V4', seedCatalogVersion: 'INTRILEX_LAB_SEED_CATALOG_V1', labVersion: LAB_VERSION }, segments, batchSize, owner: _newOwnerLease() });
  _manifests.set(manifest.runId, manifest);
  return { runId: manifest.runId, manifest, execution: executionFor(manifest) };
}

/**
 * Commit a simulated batch durably. The batch record and the manifest
 * checkpoint write in ONE transaction — committedMatches can never claim
 * evidence the store doesn't hold. Throws on write failure; callers must
 * treat that as a persistence failure (pause/fail the run, never continue
 * accumulating unsaved work).
 */
export async function commitExperimentBatch(runId, { segmentIndex = 0, ordinalStart = null, ordinalEnd = null, summaries = [], execution = null } = {}) {
  const manifest = await _getManifest(runId);
  if(manifest)assertExecution(manifest,execution);
  if (!manifest) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING' });
  if (!manifestIsActive(manifest)) {
    throw Object.assign(new Error('RUN_MANIFEST_NOT_ACTIVE'), { code: 'RUN_MANIFEST_NOT_ACTIVE' });
  }
  _assertManifestOwner(manifest);
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
  // Strict admission runs INSIDE the store transaction against the stored
  // manifest (R03) — out-of-schedule ordinals, intra-batch duplicates,
  // range/count mismatches and partial overlaps are rejected with a durable
  // integrity mark; an identical whole-batch retry is an idempotent no-op.
  const carrier = { ...manifest, owner: _renewedLease(manifest.owner) };
  const committed = await _store.commitRunBatch({ manifest: carrier, batch });
  _manifests.set(runId, committed.manifest ?? manifest);
  if (committed.receipt && committed.accepted === false) {
    const code = committed.receipt.code ?? 'RUN_BATCH_REJECTED';
    throw Object.assign(new Error(code), { code, receipt: committed.receipt, conflicts: committed.receipt.conflicts });
  }
  if (committed.duplicate) {
    return { runId, batchIndex, committedMatches: committed.manifest?.committedMatches ?? manifest.committedMatches ?? 0, requestedMatches: manifest.requestedMatches, duplicate: true };
  }
  return { runId, batchIndex, committedMatches: committed.manifest?.committedMatches ?? manifest.committedMatches, requestedMatches: manifest.requestedMatches, receipt: committed.receipt };
}

/** Owner heartbeat — extend the lease on a manifest this controller holds.
 * No-op for foreign or inactive manifests; stale owners surface via the
 * store's fencing rejection. */
export async function touchRunLease(runId, execution = null) {
  const manifest = _manifests.get(runId);
  if(manifest)assertExecution(manifest,execution);
  if (!manifest?.owner || manifest.owner.ownerId !== _ownerId || !manifestIsActive(manifest)) return null;
  const next = await _store.renewManifestLease(runId, { ownerId: _ownerId, fencingToken: manifest.owner.fencingToken, storageRevision: manifest.storageRevision ?? 0, leaseMs: OWNER_LEASE_MS });
  _manifests.set(runId, next);
  return next;
}

/**
 * Stream a run's committed batches to the aggregate pipeline (worker when
 * available). Each batch is loaded, hash-verified, posted, and released —
 * finalize never materializes the whole run on the main thread.
 */
async function _aggregateCommitted(runId,descriptors,semantic) {
  if(descriptors.reduce((n,d)=>n+d.matchCount,0)>BROWSER_CAPACITY.analysisRows)return {aggregate:null,observatory:null};
  let stream;
  try {stream=_aggregateStream();}catch{return {aggregate:null,observatory:null};}
  const budget=evidenceBudget();
  try {
    for(const d of descriptors){
      const batch=await _store.getRunBatch(runId,d.batchIndex);
      if(!batch)throw new Error('RUN_PAYLOAD_MISSING');
      if(batchSummariesHash(batch.summaries)!==d.summariesHash)throw new Error('RUN_PAYLOAD_HASH_MISMATCH');
      budget.add(batch.summaries);await stream.send(batch.summaries);
    }
    return await stream.finish(semantic);
  }catch(error){stream.abort(error);console.warn('[experiments] aggregate unavailable at seal — committed headline retained:',error.message);return {aggregate:null,observatory:null};}
}

/** Load and hash-verify every descriptor's batch row, returning the
 * per-ordinal outcome digests in stored order. Throws RUN_PAYLOAD_MISSING /
 * RUN_PAYLOAD_HASH_MISMATCH on any gap — the canonical seal hash is built
 * only from verified evidence rows, never from manifest bookkeeping. */
async function _collectVerifiedDigests(runId, descriptors) {
  const hashEntries = [];
  for (const d of descriptors) {
    const batch = await _store.getRunBatch(runId, d.batchIndex);
    if (!batch) throw Object.assign(new Error('RUN_PAYLOAD_MISSING'), { code: 'RUN_PAYLOAD_MISSING' });
    if (batchSummariesHash(batch.summaries) !== d.summariesHash) {
      throw Object.assign(new Error('RUN_PAYLOAD_HASH_MISMATCH'), { code: 'RUN_PAYLOAD_HASH_MISMATCH' });
    }
    for (const s of batch.summaries ?? []) {
      hashEntries.push({ o: s?.matchOrdinal ?? s?.ordinal, h: s?.matchResultHash ?? s?.identity?.outcomeDigest ?? null });
    }
  }
  return hashEntries.sort((a, b) => (a.o ?? 0) - (b.o ?? 0));
}

/**
 * Seal a manifest into an immutable Run. Committed batches stay in the
 * runBatches store; the payload row holds the descriptor chain + aggregate.
 * Finalize uses only committed work — sealing an interrupted manifest
 * produces honest partial evidence (requested vs committed is explicit).
 */
export async function finalizeExperimentRun(runId, { durationMs = null, execution = null, requireComplete = false } = {}) {
  if (!_ready) return null;
  let manifest = await _store.readRunRecovery(runId);
  _manifests.set(runId,manifest);
  if(manifest)assertExecution(manifest,execution);
  if (!manifest) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING' });
  if (manifest.sealedRunId) throw Object.assign(new Error('RUN_ALREADY_SEALED'), { code: 'RUN_ALREADY_SEALED' });
  // Sealing is a mutation — only the fenced owner may finalize (R02). An
  // unowned or expired-lease manifest (e.g. needsSeal after resume) is
  // claimed atomically; a live foreign owner is refused.
  if (_manifestForeignHeld(manifest)) {
    throw Object.assign(new Error('RUN_OWNERSHIP_HELD'), { code: 'RUN_OWNERSHIP_HELD', manifestId: runId });
  }
  if (manifest.owner?.ownerId !== _ownerId) {
    manifest = await _store.acquireManifestOwnership(runId, { ownerId: _ownerId, leaseMs: OWNER_LEASE_MS });
    _manifests.set(runId, manifest);
  }
  const descriptors = (manifest.committedBatches ?? []).slice()
    .sort((a, b) => (a.ordinalStart ?? 0) - (b.ordinalStart ?? 0) || (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  if (!descriptors.length) {
    const failed = manifestTransition(manifest, MANIFEST_STATUS.FAILED, { failure: { message: 'No committed evidence to seal.', phase: 'finalize' } });
    await _persistManifest(failed).catch(() => {});
    throw Object.assign(new Error('RUN_NO_COMMITTED_EVIDENCE'), { code: 'RUN_NO_COMMITTED_EVIDENCE' });
  }
  // Exact-coverage seal (R03): the retained ordinal SET must be a subset of
  // the reserved schedule — an extra/foreign ordinal is an integrity
  // failure, not a completed run. `committedMatches == requestedMatches`
  // alone proves nothing: {0,1,999} is three entries but not [0,3).
  const retained = manifestRetainedOrdinals(manifest);
  const scheduled = new Set();
  for (const s of manifest.segments ?? []) {
    for (let o = s.ordinalStart; o < s.ordinalEnd; o += 1) scheduled.add(o);
  }
  const extraOrdinals = [...retained.keys()].filter(o => !scheduled.has(o));
  if (extraOrdinals.length) {
    const marked = { ...manifest, integrityFailures: [...(manifest.integrityFailures ?? []), { code: 'RUN_COVERAGE_MISMATCH', reason: 'retained ordinals outside the reserved schedule', extraOrdinals: extraOrdinals.slice(0, 50), at: new Date().toISOString() }].slice(-50) };
    try { await _store.putManifestFenced(marked); _manifests.set(runId, marked); } catch { /* the mark persists when the fence still holds */ }
    throw Object.assign(new Error('RUN_COVERAGE_MISMATCH'), { code: 'RUN_COVERAGE_MISMATCH', extraOrdinals });
  }
  const committed = retained.size;
  const requested = manifest.requestedMatches ?? committed;
  const partial = committed < requested;
  if(requireComplete && partial)throw Object.assign(new Error('RUN_REQUESTED_EXECUTION_INCOMPLETE'),{code:'RUN_REQUESTED_EXECUTION_INCOMPLETE'});
  // canonicalResultHash is rebuilt from VERIFIED batch rows — compact
  // descriptors carry ranges, not per-match digests, so the seal hash reads
  // the evidence itself.
  const hashEntries = await _collectVerifiedDigests(runId, descriptors);
  const canonicalResultHash = hashCanonical(hashEntries.map(x => x.h));
  const semantic = {
    experimentHash: canonicalResultHash,
    profileId: manifest.config?.profileId ?? null,
    engineVersion: manifest.config?.implementation?.engineVersion ?? null,
    rulesVersion: manifest.config?.implementation?.rulesVersion ?? null,
    labVersion: manifest.config?.labVersion ?? null,
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
      implementation: manifest.config?.implementation ?? null,
      rulesVersion: manifest.config?.implementation?.rulesVersion ?? null,
      engineVersion: manifest.config?.implementation?.engineVersion ?? null,
      labVersion: manifest.config?.labVersion ?? null,
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
  const finalized = await _store.finalizeRun({ run: sealed, payload, manifest: finalManifest });
  _manifests.set(runId, finalized.manifest ?? finalManifest);
  const { compatibility: compat, included, setPersisted } = await _registerStoredRun(sealed, baseline);
  await applySelection({ fastPath: { aggregate, observatory } });
  return { run: sealed, compatibility: compat, included, persistenceState: _store.persisted === true ? 'LOCALLY_COMMITTED' : 'SESSION_ONLY', persisted: _store.persisted === true, payloadSessionOnly: false, metaFailed: false, setPersisted, aggregate, observatory };
}

/** Mark a manifest run failed — committed evidence is preserved. Ownership
 * is released so the run remains resumable by another controller; a stale
 * owner's transition is rejected by the store fence and reported as a no-op. */
export async function failExperimentRun(runId, error = null, execution = null) {
  const manifest = await _getManifest(runId);
  if(manifest)assertExecution(manifest,execution);
  if (!manifest) return null;
  if (_manifestForeignHeld(manifest)) return null; // another live owner decides
  const next = {
    ...manifestTransition(manifest, MANIFEST_STATUS.FAILED, {
      failure: { message: String(error ?? 'unknown').slice(0, 500), phase: 'execution' },
    }),
    owner: _releasedOwner(manifest.owner),
  };
  try { await _persistManifest(next); }
  catch (e) {
    if (['RUN_OWNERSHIP_STALE', 'RUN_MANIFEST_VERSION_CONFLICT', 'RUN_MANIFEST_TERMINAL'].includes(e?.code)) { console.warn('[experiments] fail-transition rejected — ownership superseded:', runId); return null; }
    console.warn('[experiments] fail-transition persist failed:', e); _manifests.set(runId, next);
  }
  _syncEvidenceBasis();
  return next;
}

/** Cancel a manifest run — committed evidence is preserved and resumable.
 * Ownership is released; stale-owner cancels are fence-rejected. */
export async function cancelExperimentRun(runId, execution = null) {
  const manifest = await _getManifest(runId);
  if(manifest)assertExecution(manifest,execution);
  if (!manifest) return null;
  if (_manifestForeignHeld(manifest)) return null; // another live owner decides
  const next = {
    ...manifestTransition(manifest, MANIFEST_STATUS.CANCELLED, {
      failure: { message: 'Cancelled by user.', phase: 'execution' },
    }),
    owner: _releasedOwner(manifest.owner),
  };
  try { await _persistManifest(next); }
  catch (e) {
    if (['RUN_OWNERSHIP_STALE', 'RUN_MANIFEST_VERSION_CONFLICT', 'RUN_MANIFEST_TERMINAL'].includes(e?.code)) { console.warn('[experiments] cancel-transition rejected — ownership superseded:', runId); return null; }
    console.warn('[experiments] cancel-transition persist failed:', e); _manifests.set(runId, next);
  }
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
  requirePersistentCampaign();
  const manifest = await _store.readRunRecovery(manifestId);
  _manifests.set(manifestId,manifest);
  if (!manifest) throw new Error('RUN_MANIFEST_MISSING');
  if (manifest.sealedRunId) throw new Error('RUN_ALREADY_SEALED');
  if (manifest.config?.implementation?.fingerprint !== LAB_IDENTITY.fingerprint || manifest.config?.seedStreamVersion !== 'POLICY_V4' || manifest.config?.seedCatalogVersion !== 'INTRILEX_LAB_SEED_CATALOG_V1') throw Object.assign(new Error('RUN_EXECUTION_IDENTITY_MISMATCH: inspect/export or start a new run; unknown historical identity cannot resume.'), { code: 'RUN_EXECUTION_IDENTITY_MISMATCH' });
  if(manifest.config.implementation.analysisFingerprint!==LAB_IDENTITY.analysisFingerprint)throw Object.assign(new Error('RUN_PROTOCOL_IDENTITY_MISMATCH: inspect/export or start a new run; the original analysis protocol is unavailable.'),{code:'RUN_PROTOCOL_IDENTITY_MISMATCH'});
  if (manifestRemainingSegments(manifest).length === 0) {
    // Every ordinal committed but the seal never landed — no resimulation
    // needed, the caller just finalizes.
    return { runId: manifestId, resumed: false, needsSeal: true };
  }
  if (!manifestIsResumable(manifest)) throw new Error('RUN_NOT_RESUMABLE');
  // Take over durable ownership atomically (R02): an expired/absent lease
  // transfers with a bumped fencing token; a live foreign owner is refused.
  const acquired = await _store.acquireManifestOwnership(manifestId, { ownerId: _ownerId, leaseMs: OWNER_LEASE_MS });
  const running = manifestTransition(acquired, MANIFEST_STATUS.RUNNING, { failure: null });
  _manifests.set(manifestId, await _store.putManifestFenced(running));
  const base = manifest.config?.ordinalStart ?? 0;
  const plan = {
    runId: manifestId,
    execution: executionFor(acquired),
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
      failExperimentRun(manifestId, error?.message ?? error,plan.execution).catch(() => {});
    });
  }
  return plan;
}

/** Delete an unfinalized manifest plus its committed batches. A manifest
 * held by another live owner cannot be discarded (R02). */
export async function discardManifest(manifestId) {
  const manifest = await _getManifest(manifestId);
  if (!manifest) throw new Error('RUN_MANIFEST_MISSING');
  if (manifest.sealedRunId) throw new Error('RUN_ALREADY_SEALED');
  if (_manifestForeignHeld(manifest)) throw Object.assign(new Error('RUN_OWNERSHIP_HELD'), { code: 'RUN_OWNERSHIP_HELD', manifestId });
  const owned = await _store.acquireManifestOwnership(manifestId, { ownerId: _ownerId, leaseMs: OWNER_LEASE_MS });
  await _store.deleteManifestCascade(manifestId, owned);
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
  const probe=await _probeRunEvidence(run);
  if(!probe.ok)throw Object.assign(new Error(probe.code),{code:probe.code});
  if(!probe.admission?.eligible && run.payloadKind!=='bundled')throw Object.assign(new Error('EVIDENCE_RESTRICTED'),{code:'EVIDENCE_RESTRICTED',admission:probe.admission});
  const baseline = _semanticFromBaseline();
  const compat = classifyRunCompatibility(run, baseline && baseline.runId !== runId ? baseline : null);
  if (compat.status === COMPATIBILITY.INCOMPATIBLE && !force) {
    return { ok: false, requiresForce: true, compatibility: compat };
  }
  _set = includeRunInSet(_set, runId);
  await _persistSet();
  _syncEvidenceBasis();
    const result=await applySelection();
    return { ...result, compatibility: compat };
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
    const probe=await _probeRunEvidence(run);
    if (!probe.ok || (run.payloadKind!=='bundled' && !probe.admission?.eligible)) continue;
    if (_set.includedRunIds.includes(run.runId)) continue;
    if (compatibility.status === COMPATIBILITY.INCOMPATIBLE) continue;
    _set = includeRunInSet(_set, run.runId);
  }
  await _persistSet();
  _syncEvidenceBasis();
  return applySelection();
}

/** Analyze a single run in isolation — excludes all others with a recorded
 * reason. Reversible: re-include the rest from the same panel. */
export async function isolateRun(runId) {
  const run = _findRun(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  if (!runAnalyticallyEligible(run)) throw new Error(run.corrupt === true || runIntegrityState(run) === RUN_INTEGRITY.QUARANTINED ? 'RUN_CORRUPTED' : 'RUN_PAYLOAD_UNAVAILABLE');
  const probe=await _probeRunEvidence(run);
  if(!probe.ok || (run.payloadKind!=='bundled' && !probe.admission?.eligible))throw new Error(probe.code ?? 'EVIDENCE_RESTRICTED');
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
  return applySelection();
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
  if (!state.evidenceSnapshot) state.evidenceBasis = _selectionBasis();
}

function _restoreBootView() {
  state.evidenceSnapshot = null; state.evidenceViewStatus = {stale:false,error:null};
  if (!state.bootState) {
    Object.assign(state,{observatory:{},aggregate:{},rankPower:null,swapMatrix:null,variantAnalytics:null});
    return;
  }
  state.observatory = structuredClone(state.bootState.observatory);
  state.aggregate = structuredClone(state.bootState.aggregate);
  state.rankPower = state.bootState.rankPower != null ? structuredClone(state.bootState.rankPower) : state.observatory?.rankPower ?? null;
  state.swapMatrix = state.bootState.swapMatrix != null ? structuredClone(state.bootState.swapMatrix) : state.observatory?.swapMatrix ?? null;
  state.variantAnalytics = state.bootState.variantAnalytics != null ? structuredClone(state.bootState.variantAnalytics) : state.observatory?.variantAnalytics ?? state.variantAnalytics;
}

/**
 * Shared evidence-integrity probe — the single definition of "this run's
 * retained evidence verifies". Manage Runs verification, artifact export,
 * analysis ingestion, dossier/export status, and package assembly all
 * resolve artifact state through this function so they can never disagree
 * about what 'durable' means.
 *
 * A run reports 'durable' only when the FULL sealed chain verifies:
 *   runHash (validateRunRecord) → payload presence → payloadHash binding
 *   the descriptor chain → every expected committed batch exists → every
 *   batch's summariesHash → descriptor↔batch consistency → no duplicate
 *   batch indexes or match ordinals. Corruption is never downgraded to
 *   'missing': hash/consistency failures report 'corrupt' with a stable
 *   code; genuinely absent rows report 'missing'/'missing-chunks'.
 *
 * Evidence is probed at batch granularity — one batch in memory at a time,
 * released before the next loads. Returns:
 *   { ok, code, artifact, payload, descriptors, decisionEvidence, summaryCount }
 *   artifact: 'durable'|'session'|'missing'|'missing-chunks'|'corrupt'|
 *             'unreachable'|'none'|'bundled'|integrity state
 */
async function _probeRunEvidence(run,{budget=null}={}) {
  const rejected = (code, artifact = 'corrupt') => ({ ok: false, code, artifact, payload: null, descriptors: null, decisionEvidence: null, summaryCount: 0 });
  if (runIntegrityState(run) !== 'ok') return rejected(run.corruptCode ?? run.lifecycle?.integrity?.code ?? 'RUN_INTEGRITY_FLAGGED', runIntegrityState(run));
  try {
    validateRunRecord(run);
    if (run.payloadKind === 'bundled') return {ok:true,artifact:'bundled',summaryCount:_bootSummaries.length};
    if (run.payloadKind === 'none') return rejected('RUN_NO_RETAINED_EVIDENCE','none');
    const payload = run.payloadKind === 'session' ? _sessionPayloads.get(run.runId) : await _store.getRunPayload(run.runId);
    if (!payload) return rejected('RUN_PAYLOAD_MISSING','missing');
    const bytes = verifyRunPayload(run,payload);
    if (!bytes.ok) return rejected(bytes.code);
    const admission = createEvidenceAdmission({run,aggregate:payload.aggregate});
    let descriptors = null;
    const receiptHashes=[];
      if (run.payloadKind === 'indexeddb-batches') {
      const manifest=await _store.getManifest(run.runId);
      const committed=manifest?.sealedRunId ? new Map((manifest.committedBatches ?? []).map(d=>[d.batchIndex,d])) : null;
        descriptors = (payload.batches ?? []).slice().sort((a,b)=>a.ordinalStart-b.ordinalStart || a.batchIndex-b.batchIndex);
      if(committed && committed.size!==descriptors.length)return rejected('RUN_DESCRIPTOR_MISMATCH');
      const indexes = new Set();
      for (const d of descriptors) {
        if(indexes.has(d.batchIndex))return rejected('RUN_DESCRIPTOR_DUPLICATE'); indexes.add(d.batchIndex);
        const batch = await _store.getRunBatch(run.runId,d.batchIndex);
        if(!batch)return rejected('RUN_CHUNK_MISSING','missing-chunks');
        const sealed=committed?.get(d.batchIndex);
        if(committed && (!sealed || ['ordinalStart','ordinalEnd','matchCount','summariesHash'].some(key=>sealed[key]!==d[key])))return rejected('RUN_DESCRIPTOR_MISMATCH');
          validateEvidenceBatch(batch,sealed ?? d,run.runId);
        if(batch.receipt)receiptHashes.push(batch.receipt.receiptHash);
        if(batchSummariesHash(batch.summaries)!==d.summariesHash)return rejected('RUN_PAYLOAD_HASH_MISMATCH');
        if(batch.ordinalStart!==d.ordinalStart || batch.ordinalEnd!==d.ordinalEnd || d.matchCount!==batch.summaries.length ||
          d.ordinalEnd-d.ordinalStart!==batch.summaries.length || batch.summaries.some(s=>!Number.isInteger(s.matchOrdinal) || s.matchOrdinal<d.ordinalStart || s.matchOrdinal>=d.ordinalEnd))return rejected('RUN_DESCRIPTOR_MISMATCH');
        budget?.add(batch.summaries);admission.add(batch.summaries);
      }
    } else {budget?.add(payload.summaries);admission.add(payload.summaries);}
    const result = admission.finish();
    if(descriptors){
      const manifest=await _store.getManifest(run.runId);
      if(manifest?.sealedRunId && manifest.committedMatches!==result.summaryCount)return rejected('RUN_COUNTS_MISMATCH');
      if(manifest?.sealedRunId && manifest.headline && (['matchCount','completedMatchCount','abortCount','drawCount'].some(key=>manifest.headline[key]!==result.headline[key]) ||
        hashCanonical(manifest.headline?.seatWins)!==hashCanonical(result.headline.seatWins)))return rejected('RUN_COUNTS_MISMATCH');
    }
    return {ok:true,code:null,artifact:run.payloadKind==='session'?'session':'durable',payload,descriptors,
      admission:result,receiptDigest:hashCanonical(receiptHashes),decisionEvidence:result.fidelity==='FULL_DECISION_EVIDENCE',summaryCount:result.summaryCount};
  } catch(error) {return rejected(error.code ?? 'RUN_STORE_UNREACHABLE',error.code ? 'corrupt' : 'unreachable');}
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
async function _verifyAndStreamRun(run, onChunk, verifiedProbe=null) {
  const probe = verifiedProbe ?? await _probeRunEvidence(run);
  if (!probe.ok) return { ok: false, code: probe.code };
  if (probe.artifact === 'bundled') { await onChunk(_bootSummaries); return { ok: true, code: null }; }
  if (probe.descriptors) {
    // Pass 2: stream one verified batch at a time; each is released after
    // consume — whole-run evidence never materializes on the main thread.
    for (const d of probe.descriptors) {
      const batch = await _store.getRunBatch(run.runId, d.batchIndex);
      if (!batch) return { ok: false, code: 'RUN_CHUNK_MISSING' };
      if (batchSummariesHash(batch.summaries)!==d.summariesHash) return {ok:false,code:'RUN_PAYLOAD_HASH_MISMATCH'};
      await onChunk(batch.summaries ?? []);
    }
    return { ok: true, code: null };
  }
  if (probe.payload) await onChunk(probe.payload.summaries ?? []);
  return { ok: true, code: null };
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

/** Open a streaming aggregate worker: post begin → chunk×N → finish. */
function _aggregateStream() {
  const worker=new Worker('worker.js',{type:'module'});
  let sequence=0,pending=null,closed=false,resolveDone,rejectDone;
  const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
  done.catch(()=>{});
  const close=error=>{if(closed)return;closed=true;clearTimeout(timer);worker.terminate();if(error){pending?.reject(error);pending=null;rejectDone(error);}};
  const timer=setTimeout(()=>close(new Error('AGGREGATE_WORKER_TIMEOUT')),180000);
  worker.onmessage=({data:x})=>{
    if(closed)return;
    if(x.type==='autonomy-aggregate-ack' && pending?.sequence===x.sequence){pending.resolve();pending=null;return;}
    if(x.type!=='autonomy-aggregate-result')return;
    if(!x.ok){close(new Error(x.error ?? 'AGGREGATE_FAILED'));return;}
    try {const value={aggregate:JSON.parse(x.aggregateJson ?? 'null'),observatory:JSON.parse(x.observatoryJson ?? 'null')};close();resolveDone(value);}catch(error){close(error);}
  };
  worker.onerror=event=>close(new Error(event.message ?? 'AGGREGATE_WORKER_ERROR'));
  worker.onmessageerror=()=>close(new Error('AGGREGATE_WORKER_MESSAGE_ERROR'));
  worker.postMessage({type:'run-autonomy-aggregate-begin'});
  return {worker,done,abort:close,
    async send(rows){
      for(let i=0;i<rows.length;i+=BROWSER_CAPACITY.batchRows){
        if(closed||pending)throw new Error('AGGREGATE_TRANSPORT_CLOSED');
        const summariesJson=JSON.stringify(rows.slice(i,i+BROWSER_CAPACITY.batchRows));
        if(new TextEncoder().encode(summariesJson).byteLength>BROWSER_CAPACITY.batchBytes){const error=new Error('AGGREGATE_PAGE_TOO_LARGE');close(error);throw error;}
        await new Promise((resolve,reject)=>{const current=sequence++;pending={sequence:current,resolve,reject};try{worker.postMessage({type:'run-autonomy-aggregate-chunk',sequence:current,summariesJson});}catch(error){close(error);}});
      }
    },
    finish(semantic){if(closed||pending)throw new Error('AGGREGATE_TRANSPORT_CLOSED');worker.postMessage({type:'run-autonomy-aggregate-finish',semantic});return done;}
  };
}

export async function aggregateBoundedEvidence(rows,semantic={}) {
  evidenceBudget().add(rows);
  const stream=_aggregateStream();
  try {await stream.send(rows);return await stream.finish(semantic);}catch(error){stream.abort(error);throw error;}
}

/**
 * Recompute state.observatory / state.aggregate from the currently included
 * runs. Admission selects compatible independent samples before sending
 * chunks to the aggregate worker. The retained UI index is the slim
 * projection (no per-decision detail). Empty selection
 * restores the certified baseline view — never an erased/blank dataset.
 */
export async function applySelection({ fastPath: _fastPath = null, cohort = null } = {}) {
  if (!_ready) return;
  const token=++_applyToken;
  const runs=contributingRuns(_runs,_set).filter(r=>r.runId!==BUNDLED_RUN_ID);
  if(!runs.length){_restoreBootView();_syncEvidenceBasis();updateRailContext();rerender();return {ok:true};}
  try {
    const entries=[],budget=evidenceBudget(),probeBudget=evidenceBudget();
    if(runs.length>BROWSER_CAPACITY.analysisSources || runs.reduce((n,r)=>n+(r.metrics?.matchCount ?? 0),0)>BROWSER_CAPACITY.analysisRows)throw new Error('EVIDENCE_ANALYSIS_CAPACITY_EXCEEDED');
    for(const run of runs){
      const probe=await _probeRunEvidence(run,{budget:probeBudget});
      if(!probe.ok){
        if(probe.code==='EVIDENCE_ANALYSIS_CAPACITY_EXCEEDED')throw new Error(probe.code);
        const missing=['RUN_PAYLOAD_MISSING','RUN_CHUNK_MISSING','RUN_NO_RETAINED_EVIDENCE'].includes(probe.code);
        await _flagRunIntegrity(run.runId,{state:missing?RUN_INTEGRITY.PAYLOAD_UNAVAILABLE:RUN_INTEGRITY.QUARANTINED,code:probe.code,note:'Evidence admission failed; retained for inspection.'});
        continue;
      }
      const summaries=[];
      const streamed=await _verifyAndStreamRun(run,async chunk=>{budget.add(chunk);summaries.push(...chunk);},probe);
      if(!streamed.ok)throw Object.assign(new Error(streamed.code),{code:streamed.code});
      entries.push({id:run.runId,summaries,admission:probe.admission,receiptDigest:probe.receiptDigest});
    }
    const selected=selectEvidence(entries,{cohort});
    if(!selected.summaries.length)throw new Error('EVIDENCE_NO_ADMISSIBLE_SAMPLES');
    if(token!==_applyToken)return;
    const analytical=analyticsSummaries(selected.summaries);
    const {aggregate,observatory}=await aggregateBoundedEvidence(analytical,{labVersion:LAB_VERSION,canonicalResultHash:selected.selection.digest});
    if(token!==_applyToken)return;
    const basis={..._selectionBasis(),includedRunIds:entries.filter(e=>e.admission.eligible && e.admission.cohorts.includes(selected.selection.cohort)).map(e=>e.id),
      includedRunCount:entries.filter(e=>e.admission.eligible && e.admission.cohorts.includes(selected.selection.cohort)).length,
      includedGames:selected.summaries.length,effectiveSampleCount:selected.selection.effectiveSampleCount,repeatCount:selected.selection.repeatCount,selection:selected.selection};
    publishEvidenceSnapshot(state,{aggregate,observatory:{...observatory,summaries:analytical.map(slimSummary)},basis,selection:selected.selection,origin:'EXPERIMENT_RUNS'});
    updateRailContext();rerender();
    return {ok:true,digest:selected.selection.digest};
  } catch(error){
    if(token!==_applyToken)return;
    markEvidenceSnapshotStale(state,error);
    if(error.cohorts)state.evidenceViewStatus.cohorts=error.cohorts;
    showToast(`Could not recompute evidence (${error.code ?? error.message}) — previous view retained.`,{type:'error',title:'Evidence selection'});
    rerender();
    return {ok:false,code:error.code ?? error.message};
  }
}

export function getEvidenceViewStatus() { return state.evidenceViewStatus ?? {stale:false,error:null}; }

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
      strategicTrace: run.config?.strategicTrace === true,
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

// ── Portability: run artifacts, verification, import ────────────
//
// An experiment attachment resolves to durable evidence through this layer.
// `exportRunArtifactEnvelope` reads the canonical store (batches or legacy
// payload), verifies every hash chain before serializing, and produces the
// self-describing `intrilex-experiment-run` envelope. `importRunArtifact`
// admits an envelope transactionally and dedupes on sealed run identity —
// importing the same evidence twice can never double-count matches.

/** Per-run artifact resolution status for Manage Runs / ledger surfaces.
 *  artifact: 'durable' | 'session' | 'missing' | 'missing-chunks' |
 *            'unreachable' | 'none' | integrity state (corrupt/quarantined/…)
 *  'durable' requires the full sealed chain verified by _probeRunEvidence —
 *  runHash, payloadHash→descriptor chain, every committed batch's
 *  summariesHash, descriptor↔batch consistency, ordinal uniqueness.
 *  fidelity is evidence-grounded: FULL/SUMMARY only when the retained
 *  summaries were inspected; UNRESOLVED when the run is evidence-bearing
 *  but its evidence could not be trusted this pass; NONE otherwise. */
export async function verifyRunArtifacts() {
  const rows = [];
  for (const run of _runs) {
    if (run.runId === BUNDLED_RUN_ID) continue;
    const probe = await _probeRunEvidence(run);
    const artifact = probe.artifact;
    let fidelity = DECISION_FIDELITY.NONE;
    if (runEvidenceBearing(run)) {
      if ((artifact === 'durable' || artifact === 'session') && probe.decisionEvidence != null) {
        fidelity = probe.admission?.fidelity ?? DECISION_FIDELITY.UNRESOLVED;
      } else if (artifact === 'missing' || artifact === 'none' || artifact === 'payload-unavailable') {
        fidelity = DECISION_FIDELITY.NONE; // verified: nothing analyzable retained
      } else {
        fidelity = DECISION_FIDELITY.UNRESOLVED; // evidence exists but could not be trusted/inspected
      }
    }
    rows.push({
      runId: run.runId, ordinal: run.ordinal, matchCount: run.metrics?.matchCount ?? 0,
      status: run.status, persistence: _persistenceOf(run), artifact, code: probe.code,
      fidelity, admission:probe.admission ?? null,
      exportable: artifact === 'durable' || artifact === 'session',
    });
  }
  return rows;
}

/**
 * Serialize one run's durable evidence into the intrilex-experiment-run
 * envelope. Throws stable codes when evidence cannot resolve — export never
 * silently produces a hollow artifact.
 */
export async function exportRunArtifactEnvelope(runId) {
  if (!_ready) throw Object.assign(new Error('EXPERIMENTS_NOT_READY'), { code: 'EXPERIMENTS_NOT_READY' });
  const run = _findRun(runId);
  if (!run) throw Object.assign(new Error('RUN_NOT_FOUND'), { code: 'RUN_NOT_FOUND' });
  if (run.payloadKind === 'bundled') {
    throw Object.assign(new Error('RUN_ARTIFACT_BUNDLED — the certified corpus ships with the application; there is no run artifact to export.'), { code: 'RUN_ARTIFACT_BUNDLED' });
  }
  // The export path runs the SAME verification probe as Manage Runs /
  // dossier status — a run that cannot verify is never serialized into a
  // self-verifying envelope, and the failure code matches exactly what
  // verifyRunArtifacts() reported.
  const probe = await _probeRunEvidence(run);
  if (!probe.ok && run.payloadKind !== 'none') {
    // Preserve the historical export vocabulary for session-only evidence.
    const code = run.payloadKind === 'session' && probe.code === 'RUN_PAYLOAD_MISSING'
      ? 'RUN_PAYLOAD_UNAVAILABLE' : probe.code;
    throw Object.assign(new Error(code), { code });
  }
  let payload = null, batches = null;
  if (run.payloadKind === 'indexeddb-batches') {
    payload = probe.payload;
    batches = [];
    for (const d of probe.descriptors) {
      const batch = await _store.getRunBatch(runId, d.batchIndex);
      if (!batch) throw Object.assign(new Error('RUN_CHUNK_MISSING'), { code: 'RUN_CHUNK_MISSING' });
      batches.push(batch);
    }
  } else if (run.payloadKind === 'indexeddb' || run.payloadKind === 'session') {
    payload = probe.payload;
    if (!payload) throw Object.assign(new Error(run.payloadKind === 'session' ? 'RUN_PAYLOAD_UNAVAILABLE' : 'RUN_PAYLOAD_MISSING'), { code: run.payloadKind === 'session' ? 'RUN_PAYLOAD_UNAVAILABLE' : 'RUN_PAYLOAD_MISSING' });
  }
  const evidence = artifactEvidenceForRun(run, payload, batches);
  return experimentRunArtifact({
    run, evidence,
    versions: run.provenance ?? {},
  });
}

export async function exportRunArtifactText(runId) {
  return JSON.stringify(await exportRunArtifactEnvelope(runId));
}

/** Export every resolvable attached run — one artifact per run; failures
 *  are reported per run, never silently skipped. */
export async function exportAllRunArtifacts() {
  const out = [];
  for (const run of _runs) {
    if (run.runId === BUNDLED_RUN_ID || run.payloadKind === 'none') continue;
    try { out.push({ runId: run.runId, ok: true, text: await exportRunArtifactText(run.runId) }); }
    catch (error) { out.push({ runId: run.runId, ok: false, code: error?.code ?? 'EXPORT_FAILED', message: String(error?.message ?? error) }); }
  }
  return out;
}

/**
 * Admit a validated artifact triple (or validate text/envelope first).
 * Dedupes on sealed identity: same runHash → 'duplicate'; different evidence
 * under the same runId → RUN_ARTIFACT_CONFLICT (never a silent overwrite).
 * Runs sealed under a foreign experimentId persist under that id — durable
 * and ledger-visible, but not rehomed into the active experiment.
 */
async function _admitRunArtifact({ run, payload, batches, admission }) {
  run={...run,lifecycle:{...run.lifecycle,imported:{origin:'IMPORTED_UNVERIFIED',localPromotionAuthority:false}}};
  const existing = _findRun(run.runId) ?? await _store.getRun(run.runId).catch(() => null);
  if (existing) {
    // Equal runHash implies equal experimentId — the experiment id is part
    // of the sealed evidence the hash covers, so a cryptographically
    // identical duplicate shares the artifact's experiment identity.
    if (existing.runHash === run.runHash) return { runId: run.runId, outcome: 'duplicate', alreadyPresent: true, sameExperiment: run.experimentId === _experiment.experimentId };
    throw Object.assign(new Error('RUN_ARTIFACT_CONFLICT — a different run already holds this runId.'), { code: 'RUN_ARTIFACT_CONFLICT' });
  }
  if (run.experimentId !== _experiment.experimentId) {
    const exp = await _store.getExperiment(run.experimentId).catch(() => null);
    if (!exp) await _store.putExperiment(createExperiment({ experimentId: run.experimentId }));
  }
  const descriptors = (payload?.batches ?? []).map(d => ({
    batchIndex: d.batchIndex, segmentIndex: d.segmentIndex ?? 0,
    ordinalStart: d.ordinalStart, ordinalEnd: d.ordinalEnd,
    matchCount: d.matchCount, summariesHash: d.summariesHash,
    committedAt: d.committedAt ?? run.createdAt,
  }));
  const sealedManifest = {
    manifestId: run.runId, runId: run.runId, experimentId: run.experimentId,
    schemaVersion: MANIFEST_SCHEMA_VERSION, ordinal: run.ordinal,
    status: MANIFEST_STATUS.COMPLETED,
    createdAt: run.createdAt, startedAt: run.createdAt,
    updatedAt: new Date().toISOString(), completedAt: run.createdAt,
    config: run.config ?? {}, requestedMatches: run.config?.requestedMatchCount ?? run.config?.matchCount ?? run.metrics?.matchCount ?? 0,
    committedMatches: run.metrics?.matchCount ?? 0, batchSize: 0,
    segments: [], committedBatches: descriptors, headline: admission?.headline ?? null,
    derivation:admission ? {source:'RETAINED_ORIGINAL_SUMMARIES',evidenceDigest:admission.evidenceDigest,fields:['headline']} : null,
    resumable: false, sealedRunId: run.runId, failure: null,
  };
  await _store.saveRunArtifact({ run, payload, manifest: sealedManifest, batches: batches ?? [] });
  const sameExperiment = run.experimentId === _experiment.experimentId;
  if (sameExperiment && run.status === RUN_STATUS.COMPLETED) {
    // Same admission rule as live runs: compatible evidence joins the active
    // set, incompatible evidence is recorded but auto-excluded with a reason.
    const { included } = await _registerStoredRun(run, _semanticFromBaseline());
    if (included) await applySelection();
    return { runId: run.runId, outcome: 'imported', sameExperiment, included };
  }
  await _refreshRuns();
  _syncEvidenceBasis();
  return { runId: run.runId, outcome: 'imported', sameExperiment, included: false };
}

export async function importRunArtifact(input) {
  if (!_ready) throw Object.assign(new Error('EXPERIMENTS_NOT_READY'), { code: 'EXPERIMENTS_NOT_READY' });
  const validated = typeof input === 'string'
    ? parseExperimentRunArtifact(input, { importBytes: EXPERIMENT_LIMITS.importBytes })
    : validateExperimentRunArtifact(input);
  return _admitRunArtifact(validated);
}

/**
 * Import a research package: verify the manifest and every embedded artifact
 * hash (validation is all-or-nothing on integrity, per-artifact on
 * admission), admit runs with dedupe, then reconstruct the analysis-set
 * membership the manifest declares — for the CURRENT experiment only.
 * Artifacts belonging to a foreign experimentId persist under their own id
 * and are reported, never silently merged.
 */
export async function importResearchPackage(input) {
  if (!_ready) throw Object.assign(new Error('EXPERIMENTS_NOT_READY'), { code: 'EXPERIMENTS_NOT_READY' });
  const { manifest, runArtifacts } = typeof input === 'string'
    ? parseResearchPackage(input, { importBytes: EXPERIMENT_LIMITS.importBytes })
    : validateResearchPackage(input);
  const report = {
    experimentId: manifest.experimentId ?? null,
    completeness: manifest.completeness ?? null,
    artifactsInPackage: runArtifacts.length,
    imported: [], duplicates: [], foreign: [], failed: [],
    warnings: [...(manifest.warnings ?? [])],
    membershipApplied: false,
    membershipUnresolved: [],
  };
  // Resolution map: runId → admitted identity for THIS experiment. Only
  // artifacts that were actually admitted (fresh import) or cryptographically
  // identical duplicates count — a local run that merely shares the string
  // runId (different runHash) must never satisfy package membership.
  const resolved = new Map();
  for (const art of runArtifacts) {
    try {
      const res = await _admitRunArtifact({ run: art.run, payload: art.payload, batches: art.batches, admission:art.admission });
      resolved.set(art.run.runId, { sameExperiment: res.sameExperiment === true });
      if (res.outcome === 'duplicate') report.duplicates.push(art.run.runId);
      else report.imported.push(art.run.runId);
      if (res.sameExperiment === false) report.foreign.push(art.run.runId);
    } catch (error) {
      report.failed.push({ runId: art.run?.runId ?? null, code: error?.code ?? 'IMPORT_FAILED', message: String(error?.message ?? error) });
    }
  }
  // Membership reconstruction: the manifest's declared inclusion applies only
  // to runs the package actually resolved under this experiment — imported
  // or hash-identical duplicate. A conflicting local record under the same
  // runId is left untouched: it gains no membership and is not excluded on
  // the package's behalf.
  if (manifest.experimentId === _experiment.experimentId) {
    const perRun = manifest.runArtifacts?.perRun ?? [];
    const declared = perRun.filter(r => r.includedInAnalysis === true).map(r => r.runId);
    const admitted = new Set([...resolved].filter(([, r]) => r.sameExperiment).map(([id]) => id));
    const wanted = declared.filter(id => admitted.has(id) && id !== BUNDLED_RUN_ID);
    report.membershipUnresolved = declared.filter(id => !wanted.includes(id));
    const current = new Set(_set.includedRunIds ?? []);
    let changed = false;
    for (const id of wanted) {
      if (!current.has(id)) { _set = includeRunInSet(_set, id); changed = true; }
    }
    for (const id of [...current]) {
      // Exclusion replays only for ids the package resolved — a conflicting
      // or unresolvable local run keeps its local curation state.
      const isPackageRun = perRun.some(r => r.runId === id);
      if (isPackageRun && !wanted.includes(id) && admitted.has(id) && id !== BUNDLED_RUN_ID) {
        _set = excludeRunFromSet(_set, id, { reason: 'other', note: 'Excluded by imported research package manifest' });
        changed = true;
      }
    }
    if (changed) { await _persistSet(); _syncEvidenceBasis(); await applySelection(); }
    report.membershipApplied = changed || wanted.length > 0;
    report.includedRunIds = [...(_set.includedRunIds ?? [])].filter(id => id !== BUNDLED_RUN_ID);
  }
  return report;
}
