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
  createExperiment, createAnalysisSet, createRunRecord,
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
  return Number.isInteger(start) && start > 0 ? start : 0;
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
  return { run: stored, compatibility: compat, included, persisted, payloadSessionOnly, metaFailed, setPersisted };
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
 * Load a run's evidence payload and verify it against the sealed payloadHash.
 * Returns { summaries, verdict } — verdict.ok=false means the payload is
 * missing or tampered and MUST NOT reach an aggregate.
 *   - bundled: baseline corpus ships with the app; its authority is the
 *     bundled artifact itself, not a stored payload.
 *   - unsealed records (payloadHash null, schema 1.0): verified:false — the
 *     record's own runHash is the authority, nothing to check against.
 */
async function _loadRunSummaries(run) {
  if (run.payloadKind === 'bundled') return { summaries: _bootSummaries, verdict: { ok: true, verified: false, code: null } };
  let payload = null;
  if (run.payloadKind === 'session') payload = _sessionPayloads.get(run.runId) ?? null;
  else if (run.payloadKind === 'indexeddb') payload = await _store.getRunPayload(run.runId);
  // A record that claims a durable/session payload but has none is an
  // integrity observation even for legacy unsealed records (payloadHash
  // null) — an empty contribution would silently underweight the set.
  if (payload == null && (run.payloadKind === 'session' || run.payloadKind === 'indexeddb')) {
    return { summaries: [], verdict: { ok: false, verified: false, code: 'RUN_PAYLOAD_MISSING' } };
  }
  const verdict = verifyRunPayload(run, payload);
  return { summaries: verdict.ok ? (payload?.summaries ?? []) : [], verdict };
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

function _aggregateWorker(summariesJson, semantic) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker('worker.js', { type: 'module' }); }
    catch (error) { reject(error); return; }
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
    worker.postMessage({ type: 'run-autonomy-aggregate', summariesJson, semantic });
  });
}

/**
 * Recompute state.observatory / state.aggregate from the currently included
 * runs. Union of raw summaries → campaignAggregate → buildObservatoryAnalytics
 * (in a worker when available). Empty selection restores the certified
 * baseline view — never an erased/blank dataset.
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
  // Verify every contributing payload against its sealed payloadHash BEFORE
  // aggregating. A missing payload marks the run payload-unavailable (kept,
  // disclosed); a hash mismatch quarantines it (kept, inspectable). Neither
  // state contributes rows — and neither is silent.
  const integrityEvents = [];
  const parts = [];
  for (const run of contributing) {
    const { summaries, verdict } = await _loadRunSummaries(run);
    if (!verdict.ok) {
      integrityEvents.push({ run, code: verdict.code });
      continue;
    }
    parts.push(...summaries);
  }
  for (const { run, code } of integrityEvents) {
    const state_ = code === 'RUN_PAYLOAD_HASH_MISMATCH' ? RUN_INTEGRITY.QUARANTINED : RUN_INTEGRITY.PAYLOAD_UNAVAILABLE;
    const note = code === 'RUN_PAYLOAD_HASH_MISMATCH'
      ? `Evidence payload failed integrity verification (${code}) — quarantined; the record stays inspectable.`
      : `Evidence payload referenced by this run is no longer available (${code}) — excluded from analytics.`;
    await _flagRunIntegrity(run.runId, { state: state_, code, note });
    showToast(`Run #${String(run.ordinal).padStart(3, '0')} ${state_ === RUN_INTEGRITY.QUARANTINED ? 'quarantined: payload failed integrity verification' : 'has no retained evidence payload'} — it cannot contribute to analysis.`, { type: 'error', title: 'Evidence integrity' });
  }
  if (token !== _applyToken) return; // superseded by a newer selection change
  const contributingClean = contributingRuns(_runs, _set);
  if (integrityEvents.length) {
    // Quarantined/unavailable runs are analytically ineligible — recompute.
    _syncEvidenceBasis();
    sessionRuns = contributingClean.filter(r => r.runId !== BUNDLED_RUN_ID);
    if (!sessionRuns.length) {
      _restoreBootView();
      updateRailContext();
      rerender();
      return;
    }
  }
  const baseline = compatibilityBaseline(_runs, new Set(contributingClean.map(r => r.runId)));
  let aggregate = null, observatory = null;
  if (fastPath && sessionRuns.length === 1 && contributingClean.length === sessionRuns.length) {
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
      canonicalResultHash: hashCanonical(parts.map(m => m.matchResultHash)),
    };
    try {
      ({ aggregate, observatory } = await _aggregateWorker(JSON.stringify(parts), semantic));
    } catch (workerError) {
      console.warn('[experiments] aggregate worker failed, computing on main thread:', workerError?.message ?? workerError);
      try {
        const { campaignAggregate, buildObservatoryAnalytics } = await import('../browser-analytics.js');
        aggregate = campaignAggregate(parts, semantic);
        observatory = buildObservatoryAnalytics({ summaries: parts, aggregate });
      } catch (inner) {
        console.error('[experiments] aggregation failed:', inner);
        showToast('Could not recompute the analysis set — showing previous evidence.', { type: 'error', title: 'Aggregation failed' });
        return;
      }
    }
  }
  if (token !== _applyToken) return;
  state.aggregate = aggregate;
  state.observatory = { ...observatory, summaries: parts, datasetOrigin: 'EXPERIMENT_RUNS' };
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
