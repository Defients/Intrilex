// ═══════════════════════════════════════════════════════════════
// experiment-domain.mjs — Persistent experiment evidence model
//
// Domain concepts (platform-neutral, no I/O):
//   Experiment    — a persistent investigation container.
//   Run           — one immutable execution of an Experiment. The evidence
//                   payload (summaries/aggregate) is referenced by
//                   payloadKind, never embedded in the record.
//   AnalysisSet   — the named selection of Runs currently contributing to
//                   analysis. V1 ships one active set per experiment; the
//                   record shape already supports many named sets.
//
// Curation state is intentionally separated from evidence:
//   - run.lifecycle is mutable bookkeeping (invalidated/archived/pinned)
//   - analysisSet.includedRunIds / exclusions are selection bookkeeping
//   - everything else on a run record is frozen at creation and covered by
//     runHash — mutating provenance/config/metrics is detectable.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '../shared-browser.js';

export const EXPERIMENT_SCHEMA_VERSION = '1.0.0';
export const RUN_SCHEMA_VERSION = '1.0.0';
export const ANALYSIS_SET_SCHEMA_VERSION = '1.0.0';

/** The default investigation that absorbs ad-hoc (non-preset) browser runs. */
export const DEFAULT_EXPERIMENT_ID = 'EXP-LAB';
export const DEFAULT_ANALYSIS_SET_ID = 'primary';
/** The bundled certified corpus is registered as a run so it remains
 * inspectable next to session runs. Its payload is never duplicated into
 * IndexedDB — payloadKind 'bundled' resolves to the shipped dataset file. */
export const BUNDLED_RUN_ID = 'RUN-0000-CERTIFIED-CORPUS';
export const BUNDLED_EXPERIMENT_ID = DEFAULT_EXPERIMENT_ID;

export const RUN_STATUS = Object.freeze({ COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'CANCELLED' });
export const RUN_LIFECYCLE = Object.freeze({ ACTIVE: 'active', INVALIDATED: 'invalidated', ARCHIVED: 'archived' });
export const COMPATIBILITY = Object.freeze({ COMPATIBLE: 'compatible', TREATMENT_CHANGE: 'treatment-change', INCOMPATIBLE: 'incompatible' });
// 'indexeddb-batches' — evidence lives in the runBatches store as committed
// batch records; the payloads row holds only the batch descriptor chain and
// the run aggregate. This is the durable chunked-execution payload kind.
export const PAYLOAD_KINDS = Object.freeze(['indexeddb', 'indexeddb-batches', 'bundled', 'session', 'none']);
// lifecycle.integrity.state — detected integrity states. Unlike lifecycle
// curation (user bookkeeping) these are written by the evidence layer when
// verification fails. 'quarantined' = detected corruption (runHash or
// payloadHash mismatch); 'payload-unavailable' = the record references a
// payload that no longer exists (e.g. a session-only payload after reload).
// Both keep the run inspectable but analytically ineligible.
export const RUN_INTEGRITY = Object.freeze({ QUARANTINED: 'quarantined', PAYLOAD_UNAVAILABLE: 'payload-unavailable' });

export const EXCLUSION_REASONS = Object.freeze([
  'configuration-mismatch', 'engine-defect', 'corrupted-incomplete',
  'superseded-ruleset', 'exploratory', 'duplicate', 'other',
]);

// persistRunBytes bounds one run's stored evidence payload (summaries +
// aggregate). Sized generously — a 10k-game run produces ~25–60 MB of
// summaries; beyond that the run record still persists but the payload is
// marked 'session' and the UI must disclose the retention limit.
export const EXPERIMENT_LIMITS = Object.freeze({ persistRunBytes: 96 * 1024 * 1024, metaBytes: 512 * 1024, importBytes: 256 * 1024 * 1024, batchBytes: 64 * 1024 * 1024 });

const fail = code => { throw Object.assign(new Error(code), { code }); };
const isStr = v => typeof v === 'string' && v.length > 0;

// ── Identity ────────────────────────────────────────────────────

export function experimentIdForConfig(config = {}) {
  const preset = config.presetId ?? config.preset ?? null;
  if (isStr(preset)) return preset;
  return DEFAULT_EXPERIMENT_ID;
}

export function experimentNameForId(experimentId) {
  if (experimentId === DEFAULT_EXPERIMENT_ID) return 'Simulation Lab investigation';
  return String(experimentId).replaceAll('-', ' ');
}

export function runIdFor(experimentId, ordinal) {
  const slug = String(experimentId).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'EXP';
  return `RUN-${slug}-${String(ordinal).padStart(4, '0')}`;
}

// ── Records ─────────────────────────────────────────────────────

export function createExperiment({ experimentId = DEFAULT_EXPERIMENT_ID, name = null, createdAt }) {
  if (!isStr(experimentId)) fail('EXPERIMENT_ID_REQUIRED');
  return {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    experimentId,
    name: name ?? experimentNameForId(experimentId),
    kind: 'browser-campaign',
    createdAt: createdAt ?? new Date().toISOString(),
    activeAnalysisSetId: `${experimentId}/${DEFAULT_ANALYSIS_SET_ID}`,
  };
}

export function createAnalysisSet({ experimentId, setId = DEFAULT_ANALYSIS_SET_ID, name = 'Primary evidence', includedRunIds = [], createdAt }) {
  if (!isStr(experimentId)) fail('EXPERIMENT_ID_REQUIRED');
  return {
    schemaVersion: ANALYSIS_SET_SCHEMA_VERSION,
    analysisSetId: `${experimentId}/${setId}`,
    experimentId,
    name,
    // Membership is explicit: includedRunIds is the source of truth for what
    // contributes. exclusions records WHY a run was removed from this set —
    // exclusion is curation metadata, never deletion.
    includedRunIds: [...new Set(includedRunIds)],
    exclusions: {},
    // activated flips true once the user has deliberately shaped the set
    // (any non-bundled run included). While false and empty, the UI falls
    // back to the bundled certified baseline as the working dataset.
    activated: includedRunIds.length > 0,
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: createdAt ?? new Date().toISOString(),
  };
}

/**
 * Material comparability fields. Differences here make a run incompatible
 * with the analysis baseline (rules/engine/authority identity changed).
 */
export function compatibilityFingerprintParts(run) {
  const p = run?.provenance ?? {};
  const c = run?.config ?? {};
  return { rulesVersion: p.rulesVersion ?? null, engineVersion: p.engineVersion ?? null, profileId: c.profileId ?? p.profileId ?? null };
}

export function compatibilityFingerprint(run) {
  return hashCanonical(compatibilityFingerprintParts(run)).slice(0, 16);
}

/**
 * Treatment fields differ from material fields: they change what is being
 * measured (the experimental question) but not the measuring instrument.
 * Aggregating across treatment changes is legal but must be disclosed.
 */
const TREATMENT_FIELDS = ['policyIds', 'presetId', 'seedStrategy', 'strategicTrace', 'workers'];

export function createRunRecord({ experimentId, ordinal, createdAt, status = RUN_STATUS.COMPLETED, config = {}, provenance = {}, metrics = {}, payloadKind = 'indexeddb', payloadHash = null, origin = 'session', error = null }) {
  if (!isStr(experimentId)) fail('EXPERIMENT_ID_REQUIRED');
  if (!Number.isInteger(ordinal) || ordinal < 0) fail('RUN_ORDINAL_INVALID');
  if (!Object.values(RUN_STATUS).includes(status)) fail('RUN_STATUS_INVALID');
  const runId = origin === 'bundled' ? BUNDLED_RUN_ID : runIdFor(experimentId, ordinal);
  const run = {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId,
    experimentId,
    ordinal,
    origin, // 'session' | 'bundled' | 'imported'
    createdAt: createdAt ?? new Date().toISOString(),
    status,
    error,
    config: {
      presetId: config.presetId ?? null,
      profileId: config.profileId ?? null,
      policyIds: Array.isArray(config.policyIds) ? [...config.policyIds] : null,
      matchCount: config.matchCount ?? metrics.matchCount ?? 0,
      workers: config.workers ?? null,
      seedStrategy: config.seedStrategy ?? null,
      ordinalStart: config.ordinalStart ?? null,
      ordinalEnd: config.ordinalEnd ?? null,
      strategicTrace: config.strategicTrace === true,
      // Design-of-record: the scheduler knows the experimental design at
      // creation time — persist it so exported analysis never has to infer
      // AB/BA structure from incidental match ordering. Legacy runs simply
      // lack this field (cannot prove seat balance retrospectively).
      ...(config.experimentDesign ? { experimentDesign: config.experimentDesign } : {}),
      // Partial-seal fields — only present when a run was sealed before its
      // full requested range committed. requestedMatchCount keeps the
      // requested/committed distinction explicit on the immutable record;
      // ordinalCoverage records the exact committed ordinal ranges (which
      // may be sparse across segments for multi-worker runs).
      ...(config.requestedMatchCount != null ? { requestedMatchCount: config.requestedMatchCount } : {}),
      ...(Array.isArray(config.ordinalCoverage) ? { ordinalCoverage: config.ordinalCoverage.map(c => ({ start: c.start, end: c.end })) } : {}),
    },
    provenance: {
      rulesVersion: provenance.rulesVersion ?? null,
      engineVersion: provenance.engineVersion ?? null,
      labVersion: provenance.labVersion ?? null,
      experimentHash: provenance.experimentHash ?? null,
      canonicalResultHash: provenance.canonicalResultHash ?? null,
      aggregateHash: provenance.aggregateHash ?? null,
    },
    metrics: {
      matchCount: metrics.matchCount ?? 0,
      completedMatchCount: metrics.completedMatchCount ?? 0,
      abortCount: metrics.abortCount ?? 0,
      drawCount: metrics.drawCount ?? 0,
      seat1Wins: metrics.seat1Wins ?? null,
      seat2Wins: metrics.seat2Wins ?? null,
      seat1WinRate: metrics.seat1WinRate ?? null,
      durationMs: metrics.durationMs ?? null,
      // Headline per-policy outcomes from the run's own aggregate — enough for
      // the runs table and cheap preview metrics without loading the payload.
      policyResults: metrics.policyResults ?? null,
    },
    payloadKind, // 'indexeddb' | 'bundled' | 'session' | 'none'
    // payloadHash binds the run to one exact evidence payload (canonical
    // summaries+aggregate). Storage bookkeeping (payloadKind/retentionNote)
    // is NOT evidence identity — see runHash below.
    payloadHash: payloadHash ?? null,
    lifecycle: { state: RUN_LIFECYCLE.ACTIVE, pinned: false, invalidated: null, archivedAt: null, integrity: null },
  };
  // runHash covers identity + evidence fields only. lifecycle is curation
  // bookkeeping; payloadKind/retentionNote are retention bookkeeping — where
  // the evidence payload lives is mutable storage state, never part of the
  // experiment's immutable identity. All three are deliberately excluded so
  // retention/lifecycle changes don't look like evidence tampering.
  const { lifecycle: _lifecycle, payloadKind: _payloadKind, retentionNote: _retentionNote, ...evidence } = run;
  run.runHash = hashCanonical(evidence);
  run.compatibilityFingerprint = compatibilityFingerprint(run);
  return run;
}

export function nextRunOrdinal(runs) {
  return runs.reduce((max, r) => Math.max(max, Number(r?.ordinal ?? 0)), 0) + 1;
}

/** Runs continue the experiment-wide ordinal sequence so ordinal-hash seeding
 * produces fresh games instead of re-observing identical seeds. */
export function nextOrdinalStart(runs) {
  return runs.reduce((max, r) => {
    const end = r?.config?.ordinalEnd;
    if (Number.isInteger(end)) return Math.max(max, end);
    return Math.max(max, Number(r?.metrics?.matchCount ?? r?.config?.matchCount ?? 0) + Number(r?.config?.ordinalStart ?? 0));
  }, 0);
}

/**
 * Upper bound of the reserved sample-ordinal stream across run records AND
 * run manifests — the authoritative allocation frontier (R03). Counts every
 * recorded reservation: sealed runs (`config.ordinalEnd` or
 * start+matchCount), live/interrupted manifests (segment ends and config
 * range), failed/cancelled manifests whose committed evidence must keep its
 * pinned ordinals, and imported artifacts. A store that reserves new ranges
 * above this frontier can never hand two executions the same deterministic
 * samples — regardless of what a caller's stale local computation believed.
 */
export function ordinalReservationEnd(records) {
  return (records ?? []).reduce((max, r) => {
    const cfg = r?.config ?? {};
    let end = Number.isInteger(cfg.ordinalEnd) ? cfg.ordinalEnd : 0;
    for (const s of r?.segments ?? []) {
      if (Number.isInteger(s?.ordinalEnd)) end = Math.max(end, s.ordinalEnd);
    }
    if (!end && Number.isInteger(cfg.ordinalStart)) {
      end = cfg.ordinalStart + (r?.metrics?.matchCount ?? cfg.matchCount ?? cfg.requestedMatchCount ?? r?.requestedMatches ?? 0);
    }
    return Math.max(max, end);
  }, 0);
}

// ── Validation ──────────────────────────────────────────────────

export function validateRunRecord(run) {
  if (!run || typeof run !== 'object') fail('RUN_RECORD_INVALID');
  if (!isStr(run.runId) || !isStr(run.experimentId)) fail('RUN_IDENTITY_MISSING');
  if (!Number.isInteger(run.ordinal) || run.ordinal < 0) fail('RUN_ORDINAL_INVALID');
  if (!Object.values(RUN_STATUS).includes(run.status)) fail('RUN_STATUS_INVALID');
  if (!PAYLOAD_KINDS.includes(run.payloadKind)) fail('RUN_PAYLOAD_KIND_INVALID');
  // Current envelope: evidence fields only — lifecycle (curation) and
  // retention bookkeeping (payloadKind/retentionNote) are excluded.
  const { lifecycle: _lifecycle, runHash: _runHash, compatibilityFingerprint: _fp, payloadKind: _pk, retentionNote: _rn, ...evidence } = run;
  if (isStr(run.runHash)) {
    if (run.runHash === hashCanonical(evidence)) return run;
    // Schema 1.0 compatibility: the original envelope also covered
    // payloadKind/retentionNote. Records sealed under that formula stay
    // valid — retention state is not evidence, so widening the exclusion
    // cannot conceal tampering with the evidence itself.
    const legacy = { ...evidence };
    if (run.payloadKind !== undefined) legacy.payloadKind = run.payloadKind;
    if (run.retentionNote !== undefined) legacy.retentionNote = run.retentionNote;
    if (run.runHash !== hashCanonical(legacy)) fail('RUN_HASH_MISMATCH');
  }
  return run;
}

export function validateAnalysisSet(set) {
  if (!set || typeof set !== 'object') fail('ANALYSIS_SET_INVALID');
  if (!isStr(set.analysisSetId) || !isStr(set.experimentId)) fail('ANALYSIS_SET_IDENTITY_MISSING');
  if (!Array.isArray(set.includedRunIds)) fail('ANALYSIS_SET_MEMBERSHIP_INVALID');
  return set;
}

export function validateExperimentRecord(experiment) {
  if (!experiment || typeof experiment !== 'object' || !isStr(experiment.experimentId)) fail('EXPERIMENT_RECORD_INVALID');
  return experiment;
}

// ── Compatibility ───────────────────────────────────────────────

/**
 * Classify a run against a baseline run (the most recent contributing run).
 * Returns { status, diffs } where diffs is a list of {field, baseline, actual}.
 *   incompatible     — material fields differ (ruleset, engine, profile)
 *   treatment-change — treatment fields differ (matchup, seed, tracing)
 *   compatible       — no material or treatment difference
 */
export function classifyRunCompatibility(run, baseline) {
  if (!baseline || !run) return { status: COMPATIBILITY.COMPATIBLE, diffs: [] };
  const diffs = [];
  const bp = compatibilityFingerprintParts(baseline);
  const rp = compatibilityFingerprintParts(run);
  for (const field of ['rulesVersion', 'engineVersion', 'profileId']) {
    if (bp[field] != null && rp[field] != null && bp[field] !== rp[field]) {
      diffs.push({ field, level: 'material', baseline: bp[field], actual: rp[field] });
    }
  }
  const bc = baseline.config ?? {}, rc = run.config ?? {};
  for (const field of TREATMENT_FIELDS) {
    const b = field === 'policyIds' ? JSON.stringify(bc[field] ?? null) : (bc[field] ?? null);
    const r = field === 'policyIds' ? JSON.stringify(rc[field] ?? null) : (rc[field] ?? null);
    if (b != null && r != null && b !== r) {
      diffs.push({ field, level: 'treatment', baseline: bc[field] ?? null, actual: rc[field] ?? null });
    }
  }
  const status = diffs.some(d => d.level === 'material') ? COMPATIBILITY.INCOMPATIBLE
    : diffs.length ? COMPATIBILITY.TREATMENT_CHANGE : COMPATIBILITY.COMPATIBLE;
  return { status, diffs };
}

/** Baseline for compatibility: the most recently created contributing run. */
export function compatibilityBaseline(runs, contributingIds) {
  const contributing = runs.filter(r => contributingIds.has(r.runId));
  if (!contributing.length) return null;
  return contributing.reduce((a, b) => (a.ordinal >= b.ordinal ? a : b));
}

// ── Curation transitions (pure — return new objects) ────────────

export function includeRunInSet(set, runId, { at = null } = {}) {
  validateAnalysisSet(set);
  if (set.includedRunIds.includes(runId)) return set;
  const exclusions = { ...(set.exclusions ?? {}) };
  const prior = exclusions[runId] ?? null;
  delete exclusions[runId];
  const next = { ...set, includedRunIds: [...set.includedRunIds, runId], exclusions, activated: true, updatedAt: at ?? new Date().toISOString() };
  // Re-inclusion history is kept on the prior exclusion record for
  // transparency — the exclusion fact itself is cleared.
  if (prior) next.exclusions = { ...exclusions };
  return next;
}

export function excludeRunFromSet(set, runId, { reason = 'other', note = '', at = null, auto = null } = {}) {
  validateAnalysisSet(set);
  if (!EXCLUSION_REASONS.includes(reason)) fail('EXCLUSION_REASON_INVALID');
  const next = { ...set, includedRunIds: set.includedRunIds.filter(id => id !== runId), updatedAt: at ?? new Date().toISOString() };
  next.exclusions = { ...(set.exclusions ?? {}), [runId]: { reason, note: String(note ?? ''), excludedAt: at ?? new Date().toISOString(), ...(auto ? { auto } : {}) } };
  return next;
}

export function invalidateRun(run, { reason = 'other', note = '', at = null } = {}) {
  if (!EXCLUSION_REASONS.includes(reason)) fail('EXCLUSION_REASON_INVALID');
  return { ...run, lifecycle: { ...run.lifecycle, state: RUN_LIFECYCLE.INVALIDATED, invalidated: { reason, note: String(note ?? ''), invalidatedAt: at ?? new Date().toISOString() } } };
}

export function archiveRun(run, { at = null } = {}) {
  return { ...run, lifecycle: { ...run.lifecycle, state: RUN_LIFECYCLE.ARCHIVED, archivedAt: at ?? new Date().toISOString() } };
}

export function restoreRun(run) {
  return { ...run, lifecycle: { ...run.lifecycle, state: RUN_LIFECYCLE.ACTIVE, invalidated: null, archivedAt: null } };
}

export function pinRun(run, pinned = true) {
  return { ...run, lifecycle: { ...run.lifecycle, pinned: pinned === true } };
}

// ── Payload integrity ───────────────────────────────────────────

/**
 * Canonical hash of a run's evidence payload — the analytical content only
 * ({summaries, aggregate}), never incidental storage fields like runId or
 * storedAt. Deterministic across runtimes because hashCanonical is.
 */
export function payloadEvidenceHash(payload) {
  // Batched payload (payloadKind 'indexeddb-batches'): the descriptor chain
  // binds each batch's summariesHash in ordinal order — the seal covers the
  // same analytical content ({summaries, aggregate}) without the payload row
  // ever materializing the raw evidence again.
  if (Array.isArray(payload?.batches)) {
    return hashCanonical({
      summariesChain: payload.batches.map(b => ({ batchIndex: b.batchIndex, summariesHash: b.summariesHash, matchCount: b.matchCount })),
      aggregate: payload.aggregate ?? null,
    });
  }
  return hashCanonical({ summaries: payload?.summaries ?? [], aggregate: payload?.aggregate ?? null });
}

/**
 * Verify that a loaded payload is the exact evidence the run record was
 * sealed against. Returns { ok, verified, code }:
 *   verified:false + ok — the record predates payload sealing (legacy or
 *     bundled); nothing to check, contribute on the record's own authority.
 *   RUN_PAYLOAD_MISSING      — the record binds a payload that isn't there.
 *   RUN_PAYLOAD_HASH_MISMATCH — the stored payload is not the sealed evidence.
 */
export function verifyRunPayload(run, payload) {
  const expected = run?.payloadHash ?? null;
  if (!isStr(expected)) return { ok: true, verified: false, code: null };
  if (!payload || typeof payload !== 'object') return { ok: false, verified: false, code: 'RUN_PAYLOAD_MISSING' };
  if (payloadEvidenceHash(payload) !== expected) return { ok: false, verified: false, code: 'RUN_PAYLOAD_HASH_MISMATCH' };
  return { ok: true, verified: true, code: null };
}

/**
 * Detected-integrity transition (evidence layer, not user curation):
 * 'quarantined' for corruption, 'payload-unavailable' for a referenced
 * payload that no longer exists. Pure — returns a new record.
 */
export function markRunIntegrity(run, { state, code = null, note = '', at = null } = {}) {
  if (!Object.values(RUN_INTEGRITY).includes(state)) fail('RUN_INTEGRITY_STATE_INVALID');
  return { ...run, lifecycle: { ...run.lifecycle, integrity: { state, code, note: String(note ?? ''), detectedAt: at ?? new Date().toISOString() } } };
}

/** The run's analytic integrity: 'corrupt' (failed hash validation at read),
 * an integrity state ('quarantined'/'payload-unavailable'), or 'ok'. */
export function runIntegrityState(run) {
  if (run?.corrupt === true) return 'corrupt';
  return run?.lifecycle?.integrity?.state ?? 'ok';
}

/** Analytically eligible — the inverse of every integrity exclusion. */
export function runAnalyticallyEligible(run) {
  return runIntegrityState(run) === 'ok' && run.lifecycle?.admission?.eligible !== false;
}

// ── Evidence basis ──────────────────────────────────────────────

/** Runs that actually contribute to analysis: included in the set,
 * completed, not invalidated/archived, and integrity-clean. A record whose
 * sealed hash failed validation (corrupt:true) or whose evidence payload
 * failed verification is analytically ineligible forever — it stays
 * inspectable but can never silently enter an aggregate. */
export function contributingRuns(runs, set) {
  const included = new Set(set?.includedRunIds ?? []);
  return runs.filter(r => included.has(r.runId)
    && r.status === RUN_STATUS.COMPLETED
    && (r.lifecycle?.state ?? RUN_LIFECYCLE.ACTIVE) === RUN_LIFECYCLE.ACTIVE
    && runAnalyticallyEligible(r));
}

/**
 * Describe what the current analysis is built on. This is the evidence basis
 * every analytical surface should disclose.
 */
export function evidenceBasis(runs, set, { baselineRun = null } = {}) {
  const _includedIds = new Set(set?.includedRunIds ?? []);
  const contributing = contributingRuns(runs, set);
  const contributingIds = new Set(contributing.map(r => r.runId));
  const baseline = baselineRun ?? compatibilityBaseline(runs, contributingIds);
  const warnings = [];
  for (const run of runs) {
    const compat = baseline && run.runId !== baseline.runId ? classifyRunCompatibility(run, baseline) : { status: COMPATIBILITY.COMPATIBLE, diffs: [] };
    if (compat.status !== COMPATIBILITY.COMPATIBLE) {
      warnings.push({ runId: run.runId, ordinal: run.ordinal, status: compat.status, diffs: compat.diffs, contributing: contributingIds.has(run.runId) });
    }
  }
  const excludedRuns = runs.filter(r => !contributingIds.has(r.runId) && r.runId !== BUNDLED_RUN_ID);
  const excludedGameCount = excludedRuns.reduce((n, r) => n + (r.metrics?.matchCount ?? 0), 0);
  return {
    totalRuns: runs.filter(r => r.runId !== BUNDLED_RUN_ID).length,
    includedRunIds: [...contributingIds],
    includedRunCount: contributing.filter(r => r.runId !== BUNDLED_RUN_ID).length,
    includedGames: contributing.reduce((n, r) => n + (r.metrics?.matchCount ?? 0), 0),
    restrictedCount:runs.filter(r=>r.lifecycle?.admission?.classification==='RESTRICTED_LEGACY').length,
    admissionFailures:runs.filter(r=>r.lifecycle?.admission?.eligible===false).map(r=>({runId:r.runId,...r.lifecycle.admission})),
    excludedRunCount: excludedRuns.length,
    excludedGames: excludedGameCount,
    // Integrity disclosure — never folded silently into "excluded".
    corruptCount: runs.filter(r => r.corrupt === true).length,
    quarantinedCount: runs.filter(r => runIntegrityState(r) === 'quarantined').length,
    payloadUnavailableCount: runs.filter(r => runIntegrityState(r) === 'payload-unavailable').length,
    integrityFailures: runs.filter(r => !runAnalyticallyEligible(r)).map(r => ({ runId: r.runId, state: runIntegrityState(r), code: r.corruptCode ?? r.lifecycle?.integrity?.code ?? null })),
    invalidatedCount: runs.filter(r => r.lifecycle?.state === RUN_LIFECYCLE.INVALIDATED).length,
    archivedCount: runs.filter(r => r.lifecycle?.state === RUN_LIFECYCLE.ARCHIVED).length,
    failedCount: runs.filter(r => r.status === RUN_STATUS.FAILED).length,
    warnings,
    activated: set?.activated === true || contributing.length > 0,
  };
}

/** Quick headline preview over an arbitrary run-id selection, using stored
 * per-run metrics only — no payload load or worker recompute needed. */
export function previewSelectionMetrics(runs, runIds) {
  const selected = new Set(runIds);
  const chosen = runs.filter(r => selected.has(r.runId) && r.status === RUN_STATUS.COMPLETED && runAnalyticallyEligible(r));
  const games = chosen.reduce((n, r) => n + (r.metrics?.matchCount ?? 0), 0);
  const completed = chosen.reduce((n, r) => n + (r.metrics?.completedMatchCount ?? 0), 0);
  const s1 = chosen.reduce((n, r) => n + (r.metrics?.seat1Wins ?? 0), 0);
  const s2 = chosen.reduce((n, r) => n + (r.metrics?.seat2Wins ?? 0), 0);
  const draws = chosen.reduce((n, r) => n + (r.metrics?.drawCount ?? 0), 0);
  const decisive = s1 + s2;
  return { runCount: chosen.length, games, completed, seat1Wins: s1, seat2Wins: s2, draws, seat1WinRate: decisive ? s1 / decisive : null };
}

// ── Migration ───────────────────────────────────────────────────

/**
 * Build the run record for the bundled certified corpus. Deterministic and
 * idempotent: the same store state always produces the same record, so
 * re-running the migration is a no-op for callers that check BUNDLED_RUN_ID.
 */
export function bundledBaselineRun({ aggregate = null, summaryCount = 0, createdAt }) {
  return createRunRecord({
    experimentId: BUNDLED_EXPERIMENT_ID,
    ordinal: 0,
    createdAt: createdAt ?? '2025-01-01T00:00:00.000Z',
    status: RUN_STATUS.COMPLETED,
    origin: 'bundled',
    payloadKind: 'bundled',
    config: {
      presetId: null,
      profileId: aggregate?.profileId ?? null,
      policyIds: null,
      matchCount: summaryCount || aggregate?.matchCount || 0,
      seedStrategy: 'bundled-corpus',
    },
    provenance: {
      rulesVersion: aggregate?.rulesVersion ?? null,
      engineVersion: aggregate?.engineVersion ?? null,
      labVersion: aggregate?.labVersion ?? null,
      experimentHash: aggregate?.experimentHash ?? null,
      canonicalResultHash: aggregate?.canonicalResultHash ?? null,
      aggregateHash: aggregate?.aggregateHash ?? null,
    },
    metrics: {
      matchCount: summaryCount || aggregate?.matchCount || 0,
      completedMatchCount: aggregate?.completedMatchCount ?? summaryCount ?? 0,
      abortCount: aggregate?.abortCount ?? 0,
      drawCount: aggregate?.drawCount ?? 0,
      seat1Wins: aggregate?.seatWins?.['1'] ?? null,
      seat2Wins: aggregate?.seatWins?.['2'] ?? null,
      seat1WinRate: aggregate?.seat1WinRate ?? null,
    },
  });
}

/**
 * Plan the records needed to migrate an empty store to the V1 model.
 * Pure + deterministic: given what's already stored, returns the writes
 * required. Callers apply them transactionally; running twice returns [].
 */
export function planMigration({ experiments = [], runs = [], analysisSets = [], aggregate = null, summaryCount = 0, now = null }) {
  const writes = { experiments: [], runs: [], analysisSets: [] };
  const at = now ?? new Date().toISOString();
  if (!experiments.some(e => e.experimentId === DEFAULT_EXPERIMENT_ID)) {
    writes.experiments.push(createExperiment({ experimentId: DEFAULT_EXPERIMENT_ID, createdAt: at }));
  }
  if (!analysisSets.some(s => s.analysisSetId === `${DEFAULT_EXPERIMENT_ID}/${DEFAULT_ANALYSIS_SET_ID}`)) {
    writes.analysisSets.push(createAnalysisSet({ experimentId: DEFAULT_EXPERIMENT_ID, createdAt: at }));
  }
  if (!runs.some(r => r.runId === BUNDLED_RUN_ID)) {
    writes.runs.push(bundledBaselineRun({ aggregate, summaryCount, createdAt: at }));
  }
  return writes;
}

// ── Run manifests: durable checkpoints for chunked execution ────
//
// A manifest is the mutable, durable record of a run IN PROGRESS. Unlike
// the immutable Run record (written once at seal time), the manifest is
// updated at every committed batch so a crash/reload loses at most the
// in-flight batch — never committed evidence.
//
//   segments[]        — worker ordinal ranges with a committed frontier
//                       (nextOrdinal). Resume replans from the frontier,
//                       never re-simulating committed ordinals.
//   committedBatches[]— per-batch descriptors (hashes + matchResultHash
//                       index). The batch records themselves live in the
//                       runBatches store; the manifest is the lightweight
//                       checkpoint consulted on every read path.
//   headline          — running scalar aggregates folded at commit time so
//                       an interrupted run can report honest partial stats
//                       without loading any raw evidence.
//   sealedRunId       — set when the manifest is finalized into an
//                       immutable Run; afterwards the manifest is history.

export const MANIFEST_SCHEMA_VERSION = '1.1.0';
export const MANIFEST_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});
const ACTIVE_MANIFEST_STATUSES = new Set([MANIFEST_STATUS.QUEUED, MANIFEST_STATUS.RUNNING, MANIFEST_STATUS.PAUSED]);
const RESUMABLE_MANIFEST_STATUSES = new Set([MANIFEST_STATUS.INTERRUPTED, MANIFEST_STATUS.CANCELLED, MANIFEST_STATUS.FAILED, MANIFEST_STATUS.PAUSED]);

// Heavy per-match fields stripped from the retained UI index. The full
// record stays in the batch store — this projection keeps state.observatory
// bounded while analytics/table consumers keep every field they read.
const SUMMARY_HEAVY_FIELDS = new Set(['rankDecisions', 'decisions', 'strategicTelemetry', 'strategyDecisions', 'replay', 'capturedEvents', 'auditDecisions', 'decisionTraces']);

export function slimSummary(summary) {
  if (!summary || typeof summary !== 'object') return summary;
  let slim = null;
  for (const key of SUMMARY_HEAVY_FIELDS) {
    if (summary[key] === undefined) continue;
    if (!slim) { slim = { ...summary }; }
    delete slim[key];
  }
  return slim ?? summary;
}

export function createRunManifest({ runId, experimentId = DEFAULT_EXPERIMENT_ID, ordinal = 0, config = {}, requestedMatches = null, batchSize = 0, segments = null, createdAt = null, owner = null }) {
  if (!isStr(runId)) fail('RUN_MANIFEST_ID_REQUIRED');
  const at = createdAt ?? new Date().toISOString();
  const requested = requestedMatches ?? config.matchCount ?? 0;
  const base = config.ordinalStart ?? 0;
  const segs = (segments ?? [{ index: 0, ordinalStart: base, ordinalEnd: base + requested }]).map(s => ({
    index: s.index,
    ordinalStart: s.ordinalStart,
    ordinalEnd: s.ordinalEnd,
    nextOrdinal: s.ordinalStart,
    committed: 0,
  }));
  return {
    manifestId: runId,
    runId,
    experimentId,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    ordinal,
    status: MANIFEST_STATUS.RUNNING,
    createdAt: at,
    startedAt: at,
    updatedAt: at,
    completedAt: null,
    // Requested vs committed are distinct forever — a manifest may be sealed
    // as partial evidence, and the run record records both counts.
    config: { ...config },
    requestedMatches: requested,
    committedMatches: 0,
    batchSize,
    segments: segs,
    committedBatches: [],
    // Exact retained-evidence coverage (R03) is derived from the committedBatches
    // descriptor ranges — strict admission guarantees each descriptor's
    // [ordinalStart, ordinalEnd) equals the ordinals its batch carried, so
    // ranges ARE the coverage and no per-ordinal index is duplicated here.
    // Legacy manifests may still carry a populated `retainedOrdinals` map;
    // manifestRetainedOrdinals() reads both representations.
    // Durable ownership fence (R02): only the owner carrying this fencing
    // token may mutate the run. null on legacy/ownerless manifests.
    owner: owner ?? null,
    // Recorded integrity failures (e.g. conflicting evidence for an already
    // retained sample identity). Durable — corruption never disappears.
    integrityFailures: [],
    headline: createManifestHeadline(),
    resumable: true,
    sealedRunId: null,
    failure: null,
  };
}

export function createManifestHeadline() {
  return { matchCount: 0, completedMatchCount: 0, abortCount: 0, drawCount: 0, seatWins: { '1': 0, '2': 0 }, durationMs: 0 };
}

/** Scientific inputs are frozen at allocation; progress and leases may change. */
export function manifestInputDigest(manifest) {
  return hashCanonical({ runId: manifest.runId, experimentId: manifest.experimentId, ordinal: manifest.ordinal,
    config: manifest.config, requestedMatches: manifest.requestedMatches, batchSize: manifest.batchSize,
    executionOccurrenceId: manifest.executionOccurrenceId ?? null,
    segments: manifest.segments.map(s => ({ index: s.index, ordinalStart: s.ordinalStart, ordinalEnd: s.ordinalEnd })) });
}

const MANIFEST_COMPLETE_REASONS = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);

/** Fold a batch of match summaries into the manifest's running headline.
 * Scalar counts only — no per-match data is retained here. */
export function foldSummariesIntoHeadline(headline, summaries) {
  const h = headline ?? createManifestHeadline();
  for (const s of summaries ?? []) {
    h.matchCount += 1;
    if (!MANIFEST_COMPLETE_REASONS.has(s?.terminationReason)) { h.abortCount += 1; continue; }
    h.completedMatchCount += 1;
    if (s.terminationReason === 'CANONICAL_DRAW') h.drawCount += 1;
    if (s.winningSeat === 1) h.seatWins['1'] += 1;
    else if (s.winningSeat === 2) h.seatWins['2'] += 1;
    h.durationMs += s.durationMs ?? 0;
  }
  return h;
}

export function batchSummariesHash(summaries) {
  return hashCanonical(summaries ?? []);
}

/**
 * Exact retained-evidence coverage (R03): Map<ordinal, matchResultHash|null>.
 * Authoritative when `manifest.retainedOrdinals` is populated; reconstructed
 * from committed-batch descriptors for legacy manifests (per-match hashes
 * when present, else the descriptor's committed ordinal range with a null
 * digest). Coverage and remaining-work computations use this — never the
 * largest ordinal or a nextOrdinal frontier, so a failed middle batch stays
 * pending even after later batches commit.
 */
export function manifestRetainedOrdinals(manifest) {
  const map = new Map();
  if (manifest?.retainedOrdinals && typeof manifest.retainedOrdinals === 'object') {
    for (const [k, v] of Object.entries(manifest.retainedOrdinals)) {
      const o = Number(k);
      if (Number.isInteger(o)) map.set(o, v ?? null);
    }
  }
  for (const d of manifest?.committedBatches ?? []) {
    if (Array.isArray(d?.matchResultHashes) && d.matchResultHashes.length) {
      for (const { o, h } of d.matchResultHashes) {
        if (Number.isInteger(o) && !map.has(o)) map.set(o, h ?? null);
      }
    } else if (Number.isInteger(d?.ordinalStart) && Number.isInteger(d?.ordinalEnd)) {
      for (let o = d.ordinalStart; o < d.ordinalEnd; o += 1) if (!map.has(o)) map.set(o, null);
    }
  }
  return map;
}

/**
 * Plan an idempotent batch commit with STRICT admission (R03 hardening).
 * Pure — returns `{ manifest, receipt }`:
 *   receipt = { batchIndex, submitted, newlyRetained, duplicates, conflicts,
 *               violations, outOfScheduleOrdinals, accepted, duplicate, code }
 *
 * Admission rules — every rule must pass before any evidence is retained:
 * - Every carried ordinal is a non-negative integer inside the run's reserved
 *   segment schedule. Out-of-schedule ordinals are REJECTED, not flagged.
 * - No ordinal appears twice inside one batch.
 * - Declared `ordinalStart`/`ordinalEnd` (when present) must equal the exact
 *   contiguous span the batch carries; `matchCount` must equal the carried
 *   summary count.
 * - Cross-batch overlap: an identical whole-batch retry (all ordinals retained,
 *   all digests matching) is an idempotent no-op (`duplicate: true`). PARTIAL
 *   overlap is rejected with RUN_BATCH_PARTIAL_OVERLAP; overlap whose retained
 *   digest cannot be resolved is rejected with RUN_BATCH_OVERLAP_UNVERIFIED;
 *   a digest mismatch is RUN_BATCH_SAMPLE_CONFLICT.
 * `priorDigests` (optional Map<ordinal, digest>) supplies retained digests
 * resolved by the store from committed batch rows — needed for manifests
 * whose compact descriptors carry ranges but no per-ordinal hashes.
 *
 * Rejection semantics: the returned manifest carries a durable
 * `integrityFailures` mark (bounded to the latest 50) but does NOT advance
 * committed coverage, descriptor list, or counts — the caller persists the
 * mark and surfaces the rejection; committed evidence is untouched.
 */
export function planManifestBatchCommit(manifest, { batchIndex, segmentIndex = 0, ordinalStart, ordinalEnd, matchCount, summariesHash, matchResultHashes = [], committedAt = null } = {}, { priorDigests = null } = {}) {
  const at = committedAt ?? new Date().toISOString();
  const retained = manifestRetainedOrdinals(manifest);
  const items = matchResultHashes.length
    ? matchResultHashes.map(({ o, h }) => ({ o, h: h ?? null }))
    : (Number.isInteger(ordinalStart) && Number.isInteger(ordinalEnd)
        ? Array.from({ length: Math.max(0, ordinalEnd - ordinalStart) }, (_, i) => ({ o: ordinalStart + i, h: null }))
        : []);
  const scheduled = new Set();
  for (const s of manifest?.segments ?? []) {
    for (let o = s.ordinalStart; o < s.ordinalEnd; o += 1) scheduled.add(o);
  }
  // ── Structural admission ──────────────────────────────────────
  const violations = [], outOfSchedule = [];
  const seenInBatch = new Set();
  for (const { o } of items) {
    if (!Number.isInteger(o) || o < 0) { violations.push({ code: 'ORDINAL_INVALID', ordinal: o ?? null }); continue; }
    if (seenInBatch.has(o)) violations.push({ code: 'ORDINAL_DUPLICATE_IN_BATCH', ordinal: o });
    else seenInBatch.add(o);
    if (!scheduled.has(o)) { violations.push({ code: 'ORDINAL_OUT_OF_SCHEDULE', ordinal: o }); outOfSchedule.push(o); }
  }
  if (!items.length) violations.push({ code: 'EMPTY', declared: matchCount ?? null });
  if (matchCount != null && matchCount !== items.length) {
    violations.push({ code: 'MATCH_COUNT_MISMATCH', declared: matchCount, actual: items.length });
  }
  if (Number.isInteger(ordinalStart) && Number.isInteger(ordinalEnd) && items.length) {
    const sorted = [...seenInBatch].sort((a, b) => a - b);
    if (sorted.length !== ordinalEnd - ordinalStart || sorted[0] !== ordinalStart || sorted[sorted.length - 1] !== ordinalEnd - 1) {
      violations.push({ code: 'ORDINAL_RANGE_MISMATCH', declaredStart: ordinalStart, declaredEnd: ordinalEnd,
        actualStart: sorted[0] ?? null, actualEnd: sorted.length ? sorted[sorted.length - 1] + 1 : null });
    }
  }
  // ── Retained-evidence reconciliation ──────────────────────────
  const conflicts = [], overlaps = [], dupOrdinals = [], unverifiable = [];
  for (const { o, h } of items) {
    if (!Number.isInteger(o) || o < 0 || !retained.has(o)) continue;
    overlaps.push(o);
    const manifestDigest = retained.get(o);
    const prior = manifestDigest != null ? manifestDigest
      : (priorDigests?.has(o) ? priorDigests.get(o) : undefined);
    if (prior == null) {
      // No resolvable retained digest: only a digest-free incoming ordinal can
      // stand as a verifiable identical retry of a digest-free commitment.
      if (h == null) dupOrdinals.push(o); else unverifiable.push(o);
      continue;
    }
    if (h == null) { unverifiable.push(o); continue; }
    if (prior !== h) conflicts.push({ ordinal: o, retainedHash: prior, incomingHash: h });
    else dupOrdinals.push(o);
  }
  const receipt = {
    batchIndex, segmentIndex, ordinalStart, ordinalEnd,
    submitted: items.length,
    declaredMatchCount: matchCount ?? items.length,
    newlyRetained: 0,
    duplicates: dupOrdinals.length,
    conflicts,
    outOfScheduleOrdinals: outOfSchedule,
    violations,
    accepted: false,
    duplicate: false,
    code: null,
  };
  const reject = code => ({
    receipt: { ...receipt, code },
    manifest: {
      ...manifest,
      updatedAt: at,
      integrityFailures: [...(manifest.integrityFailures ?? []), {
        code, batchIndex, segmentIndex, ordinalStart, ordinalEnd,
        ...(violations.length ? { violations: violations.slice(0, 25) } : {}),
        ...(conflicts.length ? { conflicts } : {}),
        ...(unverifiable.length ? { unverifiableOrdinals: unverifiable.slice(0, 50) } : {}),
        at,
      }].slice(-50),
    },
  });
  if (violations.length) return reject(`RUN_BATCH_${violations[0].code}`);
  if (conflicts.length) return reject('RUN_BATCH_SAMPLE_CONFLICT');
  if (unverifiable.length) return reject('RUN_BATCH_OVERLAP_UNVERIFIED');
  const allDuplicate = items.length > 0 && dupOrdinals.length === items.length;
  if (overlaps.length && !allDuplicate) return reject('RUN_BATCH_PARTIAL_OVERLAP');
  if (allDuplicate) {
    receipt.accepted = true;
    receipt.duplicate = true;
    return { receipt, manifest };
  }
  receipt.accepted = true;
  receipt.newlyRetained = items.length;
  // Coverage after admission — retained ordinals plus this batch (overlap is
  // empty here, so the union is just the sum of distinct ordinals).
  const covered = new Set(retained.keys());
  for (const { o } of items) covered.add(o);
  // Legacy manifests that already carry a populated retainedOrdinals map
  // keep maintaining it — its per-ordinal digests remain forensic evidence.
  // Compact manifests derive coverage from descriptor ranges instead.
  const maintainOrdinalMap = manifest.retainedOrdinals != null && typeof manifest.retainedOrdinals === 'object' && Object.keys(manifest.retainedOrdinals).length > 0;
  const nextRetained = maintainOrdinalMap
    ? Object.fromEntries([...covered].map(o => [String(o), retained.get(o) ?? items.find(i => i.o === o)?.h ?? null]))
    : null;
  const segments = (manifest.segments ?? []).map((s) => {
    let firstOpen = s.ordinalEnd;
    let committed = 0;
    for (let o = s.ordinalStart; o < s.ordinalEnd; o += 1) {
      if (covered.has(o)) committed += 1;
      else if (o < firstOpen) firstOpen = o;
    }
    // nextOrdinal = first uncovered ordinal (progress hint only — coverage
    // is always derived from committed evidence, never from this frontier).
    return { ...s, committed, nextOrdinal: firstOpen };
  });
  const next = {
    ...manifest,
    updatedAt: at,
    committedMatches: covered.size,
    ...(nextRetained ? { retainedOrdinals: nextRetained } : {}),
    // Compact descriptor (R03-scale): range + batch-level content hash only.
    // Per-match digests live once, in the committed batch row — the manifest
    // must not double-store them (10k-match runs would exceed metaBytes).
    committedBatches: [...(manifest.committedBatches ?? []), {
      batchIndex, segmentIndex, ordinalStart, ordinalEnd, matchCount: matchCount ?? items.length,
      summariesHash, committedAt: at, newlyRetained: items.length, duplicates: 0,
    }],
    segments,
  };
  return { manifest: next, receipt };
}

/**
 * Record a successfully persisted batch on the manifest. Pure — returns the
 * updated manifest; the caller persists it atomically with the batch record.
 * The descriptor carries the batch's integrity hash and the per-match
 * result-hash index so a finalize can rebuild the canonical run hash and an
 * integrity check can verify evidence without touching run records.
 *
 * Idempotent (R03): retries of identical evidence are detected against the
 * retained-ordinal map and do not double-count. Use planManifestBatchCommit
 * when the caller needs the commit receipt (duplicate/conflict detail).
 */
export function commitManifestBatch(manifest, descriptor) {
  return planManifestBatchCommit(manifest, descriptor).manifest;
}

export function manifestTransition(manifest, status, { failure = null, completedAt = null } = {}) {
  if (!Object.values(MANIFEST_STATUS).includes(status)) fail('RUN_MANIFEST_STATUS_INVALID');
  const at = new Date().toISOString();
  return {
    ...manifest,
    status,
    updatedAt: at,
    completedAt: status === MANIFEST_STATUS.COMPLETED ? (completedAt ?? at) : (manifest.completedAt ?? null),
    failure,
  };
}

export function manifestIsActive(manifest) {
  return ACTIVE_MANIFEST_STATUSES.has(manifest?.status);
}

/**
 * Segments (absolute ordinal ranges) still needing simulation — derived from
 * the retained-ordinal map, not the nextOrdinal frontier (R03). A failed
 * middle batch stays pending even when later batches committed.
 */
export function manifestRemainingSegments(manifest) {
  const retained = manifestRetainedOrdinals(manifest);
  const out = [];
  for (const s of manifest?.segments ?? []) {
    let cursor = null;
    for (let o = s.ordinalStart; o < s.ordinalEnd; o += 1) {
      if (!retained.has(o)) { if (cursor == null) cursor = o; }
      else if (cursor != null) { out.push({ index: s.index, ordinalStart: cursor, ordinalEnd: o }); cursor = null; }
    }
    if (cursor != null) out.push({ index: s.index, ordinalStart: cursor, ordinalEnd: s.ordinalEnd });
  }
  return out;
}

/** Ordinal coverage committed so far — contiguous ranges of RETAINED,
 * validated ordinals (R03), used for partial seals so the run record
 * honestly describes which ordinals produced evidence. */
export function manifestCommittedCoverage(manifest) {
  const ordinals = [...manifestRetainedOrdinals(manifest).keys()].sort((a, b) => a - b);
  const ranges = [];
  let start = null;
  let prev = null;
  for (const o of ordinals) {
    if (start == null) { start = o; prev = o; continue; }
    if (o === prev + 1) { prev = o; continue; }
    ranges.push({ start, end: prev + 1 });
    start = o; prev = o;
  }
  if (start != null) ranges.push({ start, end: prev + 1 });
  return ranges;
}

export function manifestIsResumable(manifest) {
  return manifest?.resumable === true && !manifest?.sealedRunId
    && RESUMABLE_MANIFEST_STATUSES.has(manifest?.status)
    && manifestRemainingSegments(manifest).length > 0;
}

/** Validate the run's committed rows, not a cached frontier or descriptor claim.
 * Historical rows without a receipt retain their original format and must
 * still prove their bytes and exact ordinal coverage. */
export function reconcileRunBatches(manifest, batches) {
  const bad=code=>fail(code), scheduled=new Set(), retained=new Map();
  for(const segment of manifest.segments ?? [])for(let o=segment.ordinalStart;o<segment.ordinalEnd;o++){
    if(scheduled.has(o))bad('RUN_SCHEDULE_OVERLAP'); scheduled.add(o);
  }
  if(scheduled.size!==manifest.requestedMatches)bad('RUN_COVERAGE_MISMATCH');
  const rows=new Map(batches.map(b=>[b.batchId,b])), seen=new Set(), headline=createManifestHeadline(), samples=new Map();
  const descriptors=[...(manifest.committedBatches ?? [])].sort((a,b)=>a.ordinalStart-b.ordinalStart || a.batchIndex-b.batchIndex);
  for(const d of descriptors){
    if(seen.has(d.batchIndex))bad('RUN_BATCH_DESCRIPTOR_DUPLICATE');seen.add(d.batchIndex);
    for(let o=d.ordinalStart;o<d.ordinalEnd;o++)if(!scheduled.has(o))bad('RUN_COVERAGE_MISMATCH');
    const b=rows.get(`${manifest.runId}#${d.batchIndex}`);
    if(!b)bad('RUN_BATCH_MISSING');
    if(b.runId!==manifest.runId || b.batchIndex!==d.batchIndex || batchSummariesHash(b.summaries)!==b.summariesHash || b.summariesHash!==d.summariesHash)bad('RUN_BATCH_HASH_MISMATCH');
    if(b.matchCount!==b.summaries.length || b.matchCount!==d.matchCount || b.ordinalStart!==d.ordinalStart || b.ordinalEnd!==d.ordinalEnd || b.ordinalEnd-b.ordinalStart!==b.matchCount || !b.matchCount)bad('RUN_COVERAGE_MISMATCH');
    const ordinals=b.summaries.map(s=>s.matchOrdinal ?? s.ordinal).sort((a,b)=>a-b);
    if(d.receiptHash && b.receipt?.receiptHash!==d.receiptHash)bad('RUN_BATCH_RECEIPT_MISMATCH');
    if(b.receipt){const {receiptHash,...body}=b.receipt;
      if((d.receiptHash && receiptHash!==d.receiptHash) || receiptHash!==hashCanonical(body) || body.contract!=='intrilex-batch-receipt@1' || body.runId!==manifest.runId || body.batchId!==b.batchId || body.payloadDigest!==b.summariesHash || hashCanonical(body.ordinals)!==hashCanonical(ordinals))bad('RUN_BATCH_RECEIPT_MISMATCH');
    }
    for(let i=0;i<ordinals.length;i++)if(ordinals[i]!==b.ordinalStart+i || !scheduled.has(ordinals[i]) || retained.has(ordinals[i]))bad('RUN_COVERAGE_MISMATCH');
    for(const summary of b.summaries){
      const id=summary.identity,implementation=manifest.config?.implementation;
      if(implementation?.identityContract==='intrilex-implementation@2' && (id?.schemaVersion!=='2.0.0' || id.executionFingerprint!==implementation.fingerprint || id.analysisFingerprint!==implementation.analysisFingerprint))bad('RUN_SAMPLE_IDENTITY_MISMATCH');
      if(id?.deterministicSampleId){
        if(samples.has(id.deterministicSampleId) && samples.get(id.deterministicSampleId)!==id.outcomeDigest)bad('RUN_SAMPLE_OUTCOME_CONFLICT');
        samples.set(id.deterministicSampleId,id.outcomeDigest);
      }
      retained.set(summary.matchOrdinal ?? summary.ordinal,summary.matchResultHash ?? id?.outcomeDigest ?? null);
    }
    foldSummariesIntoHeadline(headline,b.summaries);
  }
  if(batches.length!==descriptors.length || retained.size!==manifest.committedMatches || hashCanonical([...retained.keys()].sort((a,b)=>a-b))!==hashCanonical([...manifestRetainedOrdinals(manifest).keys()].sort((a,b)=>a-b)))bad('RUN_COVERAGE_MISMATCH');
  for(const key of ['matchCount','completedMatchCount','abortCount','drawCount'])if(manifest.headline?.[key]!==headline[key])bad('RUN_COUNTS_MISMATCH');
  if(hashCanonical(manifest.headline?.seatWins)!==hashCanonical(headline.seatWins))bad('RUN_COUNTS_MISMATCH');
  return {descriptors,retained,headline,canonicalResultHash:hashCanonical([...retained].sort(([a],[b])=>a-b).map(([,h])=>h)),complete:retained.size===scheduled.size};
}
