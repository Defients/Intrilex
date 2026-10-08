import { admitSummaries, selectEvidence } from './evidence-admission.mjs';
import { observatorySummariesForRun } from './observatory-bridge.mjs';
import { hashCanonical } from '../shared-browser.js';
import { evidenceGradeDetailed, normalCdf, benjaminiHochberg, Z95 } from '../shared-analytics/estimators.mjs';
import { assertIdentity, labConfig, LAB_PROFILES, STATIC_POLICIES, LAB_LIMITS } from './evolution-domain.mjs';
import { LAB_TRUST_POLICY } from './lab-trust-policy.mjs';

export const GRADE_RANK = Object.freeze({ INSUFFICIENT: 0, EXPLORATORY: 1, SUPPORTED: 2, ROBUST: 3 });

// ═══════════════════════════════════════════════════════════════
// discovery-domain.mjs — DISCOVER V1 contracts.
//
// The Discovery Engine is an evidence-driven research instrument: it
// scans stored Simulation Lab evidence for anomalies, forms falsifiable
// hypotheses, runs targeted mirrored series, attempts falsification,
// replicates survivors, and promotes only gated results to Discovery
// artifacts. FINDING ≠ DISCOVERY is structural: a run may legitimately
// promote zero discoveries.
//
// This module is pure — no DOM, no storage, no engine I/O. Stage
// execution is delegated to the existing lab series machinery
// (runLabSeries in Node, executeBrowserSeries in the browser).
// ═══════════════════════════════════════════════════════════════

export const DISCOVERY_SCHEMA = 1;
export const DISCOVERY_RUN_CONTRACT = 'intrilex-discovery-run@1';
export const DISCOVERY_CONTRACT = 'intrilex-discovery@1';

export const DISCOVERY_MODES = Object.freeze(['open', 'explorer', 'auditor', 'balancer', 'bug-hunter']);
export const DISCOVERY_CATEGORIES = Object.freeze(['matchup', 'card', 'turn-phase', 'profile', 'seat', 'integrity']);

/** Research-object lifecycle. Append-only: objects move forward through
 * this order (rejected/unresolved are terminal for a run; discovery and
 * conditional_discovery may later be weakened by new evidence). */
export const LIFECYCLE = Object.freeze(['observation', 'candidate', 'hypothesis', 'supported_finding', 'replicated_finding', 'discovery', 'conditional_discovery', 'rejected', 'unresolved']);
export const TERMINAL_HYPOTHESIS_STATES = Object.freeze(['discovery', 'conditional_discovery', 'rejected', 'unresolved']);
// BLOCKED is a pre-research terminal state: the run's frozen evidence
// scope resolved to zero admissible game rows, so execution never
// started. It is an input failure — never a scientific outcome.
export const RUN_STATES = Object.freeze(['IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETE', 'BLOCKED', 'ERROR']);
export const STAGE_STATES = Object.freeze(['pending', 'running', 'complete', 'skipped']);
export const CHECK_VERDICTS = Object.freeze(['passed', 'failed', 'inconclusive', 'not-applicable']);

export const DISCOVERY_LIMITS = Object.freeze({
  gameBudgetMin: 128,
  gameBudgetMax: 64000,
  gameBudgetDefault: 4096,
  candidatesMax: 200,
  hypothesesMax: 24,
  journalMax: 400,
  warningsMax: 64,
  confirmGamesMin: 32,
  confirmGamesMax: 512,
  replicationBatches: 2,
  replicationGames: 96,
  controlGames: 96,
  expandFactor: 2,
  minScanDecisive: 40,
  minMechanicCohort: 30,
  minPairingDecisive: 60,
  minComboOpportunities: 30,
  evidenceRunsMax: 512,
});

/** Deterministic promotion gates — centralized and conservative. A
 * hypothesis may promote to `discovery` only when EVERY gate passes;
 * `conditional_discovery` is used when evidence is strong but scope was
 * narrowed by a challenge (e.g. effect vanished in one population). */
export const PROMOTION_GATES = Object.freeze({
  minDecisiveGames: 200,            // pooled decisive games across confirm + replications
  minEffect: 0.03,                  // minimum meaningful effect on the probability scale (3pp)
  maxIntervalWidth: 0.25,           // pooled 95% interval width cap — aligned with the SUPPORTED evidence tier's supportedWidth
  minReplicationBatches: 2,         // independent-seed batches beyond the confirm stage
  replicationMinDecisive: 48,       // decisive games required per replication batch
  seatConsistencyGap: 0.06,         // orientation-split estimates may not diverge beyond this
  requiredEvidenceGrade: 'SUPPORTED', // evidenceGradeDetailed floor on the pooled estimate
  highConfidenceGrade: 'ROBUST',
});

const fail = (code, detail) => { throw Object.assign(new Error(detail !== undefined ? `${code}:${detail}` : code), { code }); };
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isFiniteNum = (v) => Number.isFinite(v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function shortId(hashish, length = 10) {
  return String(hashish ?? '').replace(/[^a-f0-9]/gi, '').slice(0, length) || '0';
}

// ── Configuration ────────────────────────────────────────────────

export function discoveryConfig(input = {}) {
  const { mode = 'open', gameBudget = DISCOVERY_LIMITS.gameBudgetDefault, workerCount = 2, seed = 1, profileId = LAB_PROFILES[0] } = input ?? {};
  if (!DISCOVERY_MODES.includes(mode)) fail('DISCOVERY_MODE_UNKNOWN', mode);
  if (!Number.isInteger(gameBudget) || gameBudget < DISCOVERY_LIMITS.gameBudgetMin || gameBudget > DISCOVERY_LIMITS.gameBudgetMax) fail('DISCOVERY_BUDGET_RANGE');
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > LAB_LIMITS.workers) fail('INVALID_WORKER_COUNT');
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) fail('INVALID_DISCOVERY_SEED');
  if (!LAB_PROFILES.includes(profileId)) fail('PROFILE_NOT_ADMITTED');
  const confirmGames = input.confirmGames ?? 128;
  if (!Number.isInteger(confirmGames) || confirmGames < DISCOVERY_LIMITS.confirmGamesMin || confirmGames > DISCOVERY_LIMITS.confirmGamesMax || confirmGames % 2) fail('DISCOVERY_CONFIRM_GAMES_RANGE');
  const replicationBatches = input.replicationBatches ?? DISCOVERY_LIMITS.replicationBatches;
  if (!Number.isInteger(replicationBatches) || replicationBatches < 1 || replicationBatches > 6) fail('DISCOVERY_REPLICATION_RANGE');
  return { mode, gameBudget, workerCount, seed, profileId, confirmGames, replicationBatches };
}

// ── Evidence snapshot ────────────────────────────────────────────

/** Reason codes for evidence exclusion — disclosed per run, never silent. */
export const EVIDENCE_EXCLUSION = Object.freeze({
  FOREIGN_FINGERPRINT: 'FOREIGN_FINGERPRINT',
  IMPORTED_UNVERIFIED: 'IMPORTED_UNVERIFIED',
  MISSING_RECORDS: 'MISSING_RECORDS',
  UNREADABLE: 'UNREADABLE',
  RESTRICTED: 'EVIDENCE_RESTRICTED',
  SUBJECT: 'EVIDENCE_SUBJECT_NOT_EXECUTABLE',
});

/**
 * Freeze the evidence scope for a run. Only runs whose identity matches
 * the executing implementation are admissible — imported or
 * foreign-fingerprint runs are counted and disclosed, never pooled.
 * @param {Array<object>} runs validated intrilex-evolution-lab payloads
 * @param {object} identity RulesetFingerprint
 * @param {object} [opts]
 * @param {Array<string>} [opts.unreadableRunIds] history rows whose
 *   payloads failed to load — counted as UNREADABLE exclusions so the
 *   selected→admissible ledger reconciles.
 * @param {number|null} [opts.historyRunCount] total stored rows before
 *   the selection cap was applied (disclosed scope truncation).
 * @param {number} [opts.truncatedRunCount] stored rows beyond the cap.
 */
export function createEvidenceSnapshot(runs, identity, { unreadableRunIds = [], historyRunCount = null, truncatedRunCount = 0 } = {}) {
  assertIdentity(identity);
  const eligible = [], excluded = [];
  const exclusionReasons = {};
  let selectedGameCount = 0;
  const exclude = (runId, reason) => {
    excluded.push(runId);
    exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
  };
  for (const run of runs ?? []) {
    if (Array.isArray(run?.records)) selectedGameCount += run.records.length;
    if (run?.identity?.fingerprint !== identity.fingerprint || run?.identity?.analysisFingerprint !== identity.analysisFingerprint) exclude(run?.runId ?? 'unknown', EVIDENCE_EXCLUSION.FOREIGN_FINGERPRINT);
    else if (run.evidenceOrigin === 'IMPORTED_UNVERIFIED') exclude(run.runId, EVIDENCE_EXCLUSION.IMPORTED_UNVERIFIED);
    else if (!Array.isArray(run.records)) exclude(run.runId, EVIDENCE_EXCLUSION.MISSING_RECORDS);
    else {
      try {
        const summaries=observatorySummariesForRun(run),admission=admitSummaries(summaries,{run,expectedCount:run.records.length});
        if(!admission.eligible)exclude(run.runId,EVIDENCE_EXCLUSION.RESTRICTED);
        else if(!STATIC_POLICIES.includes(run.config.botA) || !STATIC_POLICIES.includes(run.config.botB))exclude(run.runId,EVIDENCE_EXCLUSION.SUBJECT);
        else eligible.push(run);
      }catch{exclude(run.runId,EVIDENCE_EXCLUSION.RESTRICTED);}
    }
  }
  for (const runId of unreadableRunIds ?? []) exclude(runId ?? 'unknown', EVIDENCE_EXCLUSION.UNREADABLE);
  eligible.sort((a, b) => a.runId.localeCompare(b.runId));
  const runIds = eligible.map((r) => r.runId);
  const selected=selectEvidence(eligible.map(run=>({id:run.runId,summaries:observatorySummariesForRun(run)})));
  const gameCount=selected.summaries.length;
  const snapshotId = `ES-${selected.selection.digest}`;
  return {
    snapshotId, selectionDigest:selected.selection.digest, sampleIds:selected.selection.sampleIds, repeatCount:selected.selection.repeatCount, runIds, runCount: runIds.length, gameCount, fingerprint: identity.fingerprint,
    selectedRunCount: (runs?.length ?? 0) + (unreadableRunIds?.length ?? 0), selectedGameCount,
    excludedCount: excluded.length, excludedRunIds: excluded.slice(0, 32), exclusionReasons,
    ...(historyRunCount != null ? { historyRunCount } : {}),
    ...(truncatedRunCount ? { truncatedRunCount } : {}),
  };
}

// ── Lifecycle / journal ─────────────────────────────────────────

/** Append a state transition to an object's append-only lifecycle log. */
export function transitionTo(obj, state, reason, at = new Date().toISOString()) {
  if (!LIFECYCLE.includes(state) && !['queued', 'testing', 'challenging', 'replicating'].includes(state)) fail('INVALID_LIFECYCLE_STATE', state);
  obj.status = state;
  if (!Array.isArray(obj.lifecycle)) obj.lifecycle = [];
  obj.lifecycle.push({ state, reason: String(reason ?? ''), at });
  return obj;
}

/** Append a journal event derived from a real state transition. Bounded;
 * when the cap is hit the run records a truncation warning once. */
export function appendJournal(run, type, message, ref = null, at = new Date().toISOString()) {
  if (!Array.isArray(run.journal)) run.journal = [];
  if (run.journal.length >= DISCOVERY_LIMITS.journalMax) {
    if (!run.journalTruncated) { run.journalTruncated = true; warn(run, 'JOURNAL_TRUNCATED'); }
    return run;
  }
  run.journal.push({ seq: run.journal.length, type, message: String(message).slice(0, 300), ref, at });
  return run;
}

export function warn(run, code, detail = '') {
  if (!Array.isArray(run.warnings)) run.warnings = [];
  if (run.warnings.length >= DISCOVERY_LIMITS.warningsMax) return;
  if (!run.warnings.some((w) => w.code === code && w.detail === detail)) run.warnings.push({ code, detail: String(detail).slice(0, 200) });
}

// ── Candidate / hypothesis records ───────────────────────────────

/**
 * Research-priority component scores, all normalized 0–100.
 * priority is a weighted geometric mean (bounded, monotone, auditable)
 * multiplied by a compute-cost discount factor.
 */
export const PRIORITY_COMPONENTS = Object.freeze(['novelty', 'impact', 'signal', 'evidenceGap', 'testability']);

/** Per-mode weighting over the component scores. Weights shift what the
 * scheduler prefers; they never fabricate signal. */
export const MODE_WEIGHTS = Object.freeze({
  open: Object.freeze({ novelty: 1, impact: 1, signal: 1, evidenceGap: 1, testability: 1 }),
  explorer: Object.freeze({ novelty: 2.2, impact: 0.8, signal: 0.8, evidenceGap: 1.8, testability: 1 }),
  auditor: Object.freeze({ novelty: 0.7, impact: 1.2, signal: 1.6, evidenceGap: 0.6, testability: 1.2 }),
  balancer: Object.freeze({ novelty: 0.8, impact: 1.8, signal: 1.2, evidenceGap: 1, testability: 1 }),
  'bug-hunter': Object.freeze({ novelty: 1.4, impact: 1.4, signal: 0.9, evidenceGap: 0.8, testability: 1 }),
});

const CATEGORY_TESTABILITY = Object.freeze({ matchup: 92, seat: 95, profile: 80, integrity: 82, card: 68, 'turn-phase': 55 });

export function scoreCandidate(candidate, mode = 'open') {
  const weights = MODE_WEIGHTS[mode] ?? MODE_WEIGHTS.open;
  const bounded = (v, fallback = 0) => (isFiniteNum(v) ? clamp01(v / 100) * 100 : fallback);
  const components = {
    novelty: bounded(candidate.scores?.novelty),
    impact: bounded(candidate.scores?.impact),
    signal: bounded(candidate.scores?.signal),
    evidenceGap: bounded(candidate.scores?.evidenceGap),
    testability: bounded(candidate.scores?.testability, CATEGORY_TESTABILITY[candidate.category] ?? 60),
  };
  let logSum = 0, weightSum = 0;
  for (const key of PRIORITY_COMPONENTS) {
    const w = weights[key] ?? 1;
    logSum += w * Math.log(Math.max(1, components[key]));
    weightSum += w;
  }
  const geometric = Math.exp(logSum / weightSum); // 0–100
  // computeCost is a discount: cheaper investigations keep more priority.
  const cost = Math.max(1, Number(candidate.scores?.computeCost) || 1);
  const costFactor = Math.max(0.25, Math.min(1, 96 / (96 + cost / 40)));
  const priority = Math.round(geometric * costFactor);
  return { ...components, computeCost: cost, priority: Math.max(0, Math.min(100, priority)) };
}

export function createCandidate({ category, subjectKey, summary, signal, scores, detectedAt }) {
  if (!DISCOVERY_CATEGORIES.includes(category)) fail('DISCOVERY_CATEGORY_UNKNOWN', category);
  if (typeof subjectKey !== 'string' || !subjectKey) fail('CANDIDATE_SUBJECT_REQUIRED');
  const candidateId = `C-${hashCanonical({ category, subjectKey, observed: signal?.observed ?? null })}`.slice(0, 14).replace(/^C-(.{10}).*/, 'C-$1');
  return {
    schemaVersion: DISCOVERY_SCHEMA,
    candidateId,
    category,
    subjectKey,
    summary: String(summary ?? '').slice(0, 300),
    signal: {
      observed: isFiniteNum(signal?.observed) ? signal.observed : null,
      expected: isFiniteNum(signal?.expected) ? signal.expected : null,
      deviation: isFiniteNum(signal?.deviation) ? signal.deviation : null,
      unit: signal?.unit ?? 'probability',
      sampleSize: Math.max(0, Math.floor(signal?.sampleSize ?? 0)),
      method: String(signal?.method ?? 'unknown'),
      surprise: isFiniteNum(signal?.surprise) ? Math.round(Math.max(0, Math.min(100, signal.surprise))) : null,
    },
    scores: { ...scores },
    detectedAt,
  };
}

/** Falsifiable hypothesis derived from a candidate. All quantitative
 * fields are machine-readable; `claim` prose is display-only. */
export function createHypothesis({ candidate, metric, direction, minEffect, expected, scope, claim, falsification, confounders = [], stages = [], estimatedGames, at }) {
  if (!candidate?.candidateId) fail('HYPOTHESIS_SOURCE_REQUIRED');
  const hypothesisId = `H-${hashCanonical({ candidateId: candidate.candidateId, metric, scope })}`.slice(0, 14).replace(/^H-(.{10}).*/, 'H-$1');
  const h = {
    schemaVersion: DISCOVERY_SCHEMA,
    hypothesisId,
    candidateId: candidate.candidateId,
    category: candidate.category,
    claim: String(claim ?? candidate.summary ?? '').slice(0, 400),
    outcome: metric,
    direction: direction === -1 ? -1 : 1,
    minEffect: isFiniteNum(minEffect) ? Math.abs(minEffect) : PROMOTION_GATES.minEffect,
    expected: expected ?? null,
    scope: structuredClone(scope ?? {}),
    scopeNote: null,
    interpretation: null,
    falsification: String(falsification ?? 'Controlled series fails to reproduce the effect direction.').slice(0, 300),
    confounders: confounders.map((c) => ({ kind: String(c.kind), status: c.status ?? 'untested', detail: c.detail ?? null })),
    plan: { stages },
    estimatedGames: Math.max(0, Math.floor(estimatedGames ?? 0)),
    status: 'hypothesis',
    stageIndex: -1,
    replication: { attempted: 0, passed: 0 },
    checks: [],
    evidence: { decisive: 0, games: 0, estimate: null, interval: null, experimentRunIds: [], cells: [] },
    lifecycle: [{ state: 'hypothesis', reason: `spawned from ${candidate.candidateId}`, at: at ?? new Date().toISOString() }],
  };
  return h;
}

export function planStage({ key, kind, series, note }) {
  if (!['confirm', 'replicate', 'challenge-population', 'expand'].includes(kind)) fail('STAGE_KIND_UNKNOWN', kind);
  const cfg = labConfig({ ...series, kind: 'EVALUATION', mirrorSeats: true });
  return { key, kind, series: cfg, note: String(note ?? '').slice(0, 200), status: 'pending', result: null, experimentRunId: null };
}

/** Derive a fresh deterministic seed for an investigation stage. Each
 * (run seed, hypothesis, stage, attempt) tuple produces a unique seed
 * that is fully reproducible from the run artifact alone. */
export function stageSeed(runSeed, hypothesisId, stageKey) {
  return (Number.parseInt(hashCanonical({ stream: 'DISCOVERY_V1', runSeed, hypothesisId, stageKey }).slice(0, 8), 16) >>> 0) || 1;
}

// ── Run artifact ─────────────────────────────────────────────────

export function createDiscoveryRun(input, evidenceSnapshot, identity, createdAt = new Date().toISOString()) {
  assertIdentity(identity);
  const config = discoveryConfig(input);
  if (evidenceSnapshot?.fingerprint !== identity.fingerprint) fail('EVIDENCE_SNAPSHOT_MISMATCH');
  const runId = `DR-${hashCanonical({ config, snapshotId: evidenceSnapshot.snapshotId, fingerprint: identity.fingerprint, createdAt }).slice(0, 20)}`;
  return {
    schemaVersion: DISCOVERY_SCHEMA,
    contract: DISCOVERY_RUN_CONTRACT,
    kind: 'DISCOVERY_RUN',
    runId,
    mode: config.mode,
    status: 'IDLE',
    createdAt,
    completedAt: null,
    identity: structuredClone(identity),
    config,
    evidence: structuredClone(evidenceSnapshot),
    candidates: [],
    hypotheses: [],
    experiments: [],
    budget: { allocated: config.gameBudget, consumed: 0 },
    findings: { rejected: 0, unresolved: 0, supported: 0, replicated: 0 },
    discoveries: [],
    journal: [],
    journalTruncated: false,
    warnings: [],
  };
}

// ── Promotion gates ──────────────────────────────────────────────

/**
 * Deterministic promotion judgment over a hypothesis whose stages have
 * run. Never consults prose; only measured structure. Returns a verdict
 * plus the full gate ledger so the outcome is auditable.
 *
 * verdict: 'promote' | 'conditional' | 'reject' | 'unresolved'
 *   reject      — evidence refuted the claim (a clean negative result)
 *   unresolved  — evidence ran out before a verdict (budget, weak CI)
 *   conditional — survived but a challenge narrowed the claimed scope
 *   promote     — all gates passed
 */
export function rawEstimatePValue(estimate, interval) {
  if (!isFiniteNum(estimate) || !isFiniteNum(interval?.[0]) || !isFiniteNum(interval?.[1])) return null;
  const se = Math.abs(interval[1] - interval[0]) / (2 * Z95);
  if (!(se > 0)) return null;
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(estimate) / se)));
}

/**
 * @param {object} hypothesis hypothesis carrying pooled evidence + plan
 * @param {{familyPValues?: Array<{id: string, pValue: number}>}} [options]
 *   familyPValues: the measured hypothesis family used for multiplicity
 *   adjustment ({id, pValue} entries; the focal hypothesis is always
 *   added). Only a real Benjamini–Hochberg q-value is supplied to the
 *   evidence grader — a raw p-value is never relabeled as a q-value.
 */
export function evaluatePromotion(hypothesis, options = {}) {
  const g = PROMOTION_GATES;
  const ev = hypothesis.evidence ?? {};
  const reasons = [];
  const gate = (code, passed, detail) => { reasons.push({ code, passed: Boolean(passed), detail }); return passed; };
  const check = (kind) => (hypothesis.checks ?? []).find((c) => c.kind === kind);

  const decisive = Number(ev.decisive ?? 0);
  const estimate = Number(ev.estimate);
  const interval = Array.isArray(ev.interval) ? ev.interval : [null, null];
  const predicted = hypothesis.direction === -1 ? -1 : 1;
  const estimateOk = isFiniteNum(estimate) && Math.sign(estimate) === predicted && Math.abs(estimate) >= hypothesis.minEffect;
  const ciExcludesNull = isFiniteNum(interval[0]) && isFiniteNum(interval[1]) && (predicted > 0 ? interval[0] > 0 : interval[1] < 0);
  const ciRefutes = isFiniteNum(interval[0]) && isFiniteNum(interval[1]) && (predicted > 0 ? interval[1] <= 0 : interval[0] >= 0);
  const width = isFiniteNum(interval[0]) && isFiniteNum(interval[1]) ? Math.abs(interval[1] - interval[0]) : null;

  gate('MIN_SAMPLE', decisive >= g.minDecisiveGames, `decisive ${decisive} vs ${g.minDecisiveGames} required`);
  gate('EFFECT_DIRECTION', isFiniteNum(estimate) && Math.sign(estimate) === predicted, `estimate ${isFiniteNum(estimate) ? estimate.toFixed(4) : 'n/a'} vs direction ${predicted}`);
  gate('MIN_EFFECT', estimateOk, `|estimate| ≥ ${hypothesis.minEffect}`);
  gate('CI_EXCLUDES_NULL', ciExcludesNull, `95% interval [${interval.map((v) => (isFiniteNum(v) ? v.toFixed(3) : 'n/a')).join(', ')}]`);
  gate('CI_WIDTH', width != null && width <= g.maxIntervalWidth, `width ${width == null ? 'n/a' : width.toFixed(3)} ≤ ${g.maxIntervalWidth}`);

  // Multiplicity handling is explicit: the interval-derived quantity is
  // a raw p-value only. It becomes usable significance evidence solely
  // after a real Benjamini–Hochberg adjustment over the measured
  // hypothesis family supplied by the caller. The ledger discloses the
  // raw p, the adjusted q and the family size — what was and was not
  // adjusted stays on the record.
  const pValue = rawEstimatePValue(estimate, interval);
  let qValue = null, familySize = 0;
  if (pValue != null) {
    const family = (Array.isArray(options.familyPValues) ? options.familyPValues : [])
      .filter((f) => f && f.id !== hypothesis.hypothesisId && isFiniteNum(f.pValue));
    family.push({ id: hypothesis.hypothesisId, pValue });
    familySize = family.length;
    qValue = benjaminiHochberg(family).find((f) => f.id === hypothesis.hypothesisId)?.qValue ?? null;
    gate('MULTIPLICITY', qValue != null,
      `raw p=${pValue.toFixed(4)} → Benjamini–Hochberg q=${qValue != null ? qValue.toFixed(4) : 'unavailable'} over ${familySize} measured hypothesis(es)`);
  } else {
    gate('MULTIPLICITY', true, 'no measurable estimate — nothing to adjust');
  }
  const grade = evidenceGradeDetailed({
    sampleSize: decisive, interval, effectSize: estimate, minimum: g.replicationMinDecisive, nullValue: 0, scale: 'difference',
    ...(qValue != null ? { qValue } : {}),
  });
  gate('EVIDENCE_GRADE', GRADE_RANK[grade.grade] >= GRADE_RANK[g.requiredEvidenceGrade], `grade ${grade.grade} vs ${g.requiredEvidenceGrade} required`);

  const unpersisted = (hypothesis.plan?.stages ?? []).filter((s) => s.persisted === false);
  gate('PERSISTENCE_INTEGRITY', unpersisted.length === 0,
    unpersisted.length === 0
      ? 'every completed stage run is durably persisted'
      : `stage run(s) ${unpersisted.map((s) => s.key).join(', ')} executed but were not durably persisted — promotion is blocked until durable evidence exists`);

  const rep = hypothesis.replication ?? { attempted: 0, passed: 0 };
  gate('REPLICATION_COUNT', rep.attempted >= g.minReplicationBatches && rep.passed === rep.attempted, `replication ${rep.passed}/${rep.attempted} vs ${g.minReplicationBatches} independent batches`);
  const repFailed = (hypothesis.checks ?? []).some((c) => c.kind === 'replication' && c.verdict === 'failed');
  gate('NO_REPLICATION_FAILURE', !repFailed, 'no replication batch may contradict the claimed direction');

  const seatCheck = check('seat-mirror');
  const seatRequired = ['matchup', 'card', 'profile'].includes(hypothesis.category);
  gate('SEAT_MIRROR', !seatRequired || seatCheck?.verdict === 'passed', seatRequired ? `seat-mirror ${seatCheck?.verdict ?? 'not-run'}` : 'not required');
  const seatConfounded = seatCheck?.verdict === 'failed';

  const popCheck = check('challenge-population');
  const populationFailed = popCheck?.verdict === 'failed';
  gate('POPULATION_CHALLENGE', !popCheck || popCheck.verdict !== 'inconclusive', popCheck ? `challenge-population ${popCheck.verdict}` : 'not run');

  const anyCheckInconclusive = (hypothesis.checks ?? []).some((c) => c.verdict === 'inconclusive');
  gate('NO_UNRESOLVED_CONFOUND', !anyCheckInconclusive, 'no challenge may remain inconclusive at promotion');
  gate(LAB_TRUST_POLICY.comparisonReason, LAB_TRUST_POLICY.confirmatoryComparison, LAB_TRUST_POLICY.notice);

  // Verdict precedence: integrity failures first (a missing durable
  // evidence artifact means no verdict can be rendered at all — the
  // measurement cannot be audited), then hard refutations, then gaps.
  if (unpersisted.length > 0) {
    return { verdict: 'unresolved', confidence: null, grade: grade.grade, reasons, pValue, qValue, familySize };
  }
  if (ciRefutes || repFailed || seatConfounded) {
    return { verdict: 'reject', confidence: null, grade: grade.grade, reasons, pValue, qValue, familySize };
  }
  const allPassed = reasons.every((r) => r.passed);
  if (allPassed && !populationFailed) {
    const confidence = GRADE_RANK[grade.grade] >= GRADE_RANK[g.highConfidenceGrade] && rep.passed >= 3 ? 'HIGH' : 'MODERATE';
    return { verdict: 'promote', confidence, grade: grade.grade, reasons, pValue, qValue, familySize };
  }
  if (allPassed && populationFailed) {
    return { verdict: 'conditional', confidence: 'MODERATE', grade: grade.grade, reasons, pValue, qValue, familySize };
  }
  // Sample/width/grade/replication gaps are inconclusive, not refutations.
  return { verdict: 'unresolved', confidence: null, grade: grade.grade, reasons, pValue, qValue, familySize };
}

// ── Discovery artifact ───────────────────────────────────────────

/** Machine-readable units for each supported outcome metric. The unit
 * is semantic — artifacts that measure turns must not claim to measure
 * probabilities. */
export const EFFECT_UNITS = {
  winRateA: 'probability',
  seat1WinRate: 'probability',
  faultRate: 'probability',
  mechanicDelta: 'probability-difference',
  meanTurns: 'full-turns',
};

export function effectUnitForMetric(metric) {
  return EFFECT_UNITS[metric] ?? 'probability';
}

export function createDiscoveryArtifact(hypothesis, run, promotion, createdAt = new Date().toISOString()) {
  const ev = hypothesis.evidence;
  const discoveryId = `D-${hashCanonical({ hypothesisId: hypothesis.hypothesisId, runId: run.runId }).slice(0, 8).toUpperCase()}`;
  const seatCheck = (hypothesis.checks ?? []).find((c) => c.kind === 'seat-mirror');
  return {
    schemaVersion: DISCOVERY_SCHEMA,
    contract: DISCOVERY_CONTRACT,
    discoveryId,
    status: promotion.verdict === 'conditional' ? 'conditional_discovery' : 'discovery',
    statusHistory: [
      ...(hypothesis.lifecycle ?? []).map((l) => ({ status: l.state, at: l.at, reason: l.reason })),
      { status: promotion.verdict === 'conditional' ? 'conditional_discovery' : 'discovery', at: createdAt, reason: 'promotion gates passed' },
    ],
    createdAt,
    claim: hypothesis.claim,
    category: hypothesis.category,
    effect: {
      metric: hypothesis.outcome,
      estimate: ev.estimate,
      interval95: ev.interval,
      unit: effectUnitForMetric(hypothesis.outcome),
      direction: hypothesis.direction,
      decisive: ev.decisive,
      games: ev.games,
    },
    policiesTested: [...new Set(hypothesis.plan.stages.flatMap((s) => [s.series.botA, s.series.botB]))],
    replication: { attempted: hypothesis.replication.attempted, passed: hypothesis.replication.passed },
    seatMirroring: seatCheck ? (seatCheck.verdict === 'passed' ? 'PASSED' : seatCheck.verdict.toUpperCase()) : 'NOT_REQUIRED',
    independentSeeds: 'PASSED',
    challenges: (hypothesis.checks ?? []).map((c) => ({ kind: c.kind, verdict: c.verdict, detail: c.detail ?? null })),
    confounders: structuredClone(hypothesis.confounders ?? []),
    scope: { ...structuredClone(hypothesis.scope ?? {}), note: hypothesis.scopeNote ?? null },
    confidence: promotion.confidence,
    evidenceGrade: promotion.grade,
    promotionGates: promotion.reasons,
    provenance: {
      runId: run.runId,
      hypothesisId: hypothesis.hypothesisId,
      candidateId: hypothesis.candidateId,
      evidenceSnapshotId: run.evidence.snapshotId,
      experimentRunIds: hypothesis.plan.stages.map((s) => s.experimentRunId).filter(Boolean),
      fingerprint: run.identity.fingerprint,
      engineVersion: run.identity.engineVersion,
      rulesVersion: run.identity.rulesVersion,
    },
    interpretation: hypothesis.interpretation
      ? { text: String(hypothesis.interpretation).slice(0, 400), basis: 'interpretation' }
      : null,
    limitation: 'Effect is measured inside deterministic self-play simulation. Unless the experiment design warrants stronger language this is a reproducible association, not a causal proof.',
  };
}

// ── Envelopes and validation ─────────────────────────────────────

function validateStage(stage) {
  if (!stage || typeof stage !== 'object') fail('INVALID_STAGE');
  if (typeof stage.key !== 'string' || !stage.key) fail('INVALID_STAGE_KEY');
  labConfig(stage.series);
  if (!STAGE_STATES.includes(stage.status)) fail('INVALID_STAGE_STATUS');
  if (stage.experimentRunId != null && !/^EL-[a-f0-9]{24}$/.test(stage.experimentRunId)) fail('INVALID_STAGE_RUN_REF');
}

export function validateHypothesis(h) {
  if (!h || h.schemaVersion !== DISCOVERY_SCHEMA || typeof h.hypothesisId !== 'string' || !/^H-[a-f0-9]{10}$/.test(h.hypothesisId)) fail('INVALID_HYPOTHESIS');
  if (typeof h.candidateId !== 'string' || !h.candidateId) fail('HYPOTHESIS_SOURCE_REQUIRED');
  if (!DISCOVERY_CATEGORIES.includes(h.category)) fail('DISCOVERY_CATEGORY_UNKNOWN', h.category);
  if (!['queued', 'testing', 'challenging', 'replicating', 'hypothesis', 'supported_finding', 'replicated_finding', 'discovery', 'conditional_discovery', 'rejected', 'unresolved'].includes(h.status)) fail('INVALID_HYPOTHESIS_STATUS');
  if (!Array.isArray(h.plan?.stages)) fail('INVALID_HYPOTHESIS_PLAN');
  for (const stage of h.plan.stages) validateStage(stage);
  if (!Array.isArray(h.lifecycle) || !h.lifecycle.length) fail('HYPOTHESIS_LIFECYCLE_REQUIRED');
  return h;
}

export function validateCandidate(c) {
  if (!c || c.schemaVersion !== DISCOVERY_SCHEMA || typeof c.candidateId !== 'string' || !/^C-[a-f0-9]{10}$/.test(c.candidateId)) fail('INVALID_CANDIDATE');
  if (!DISCOVERY_CATEGORIES.includes(c.category) || typeof c.subjectKey !== 'string' || !c.subjectKey) fail('INVALID_CANDIDATE');
  if (!c.signal || !isFiniteNum(c.signal.sampleSize)) fail('INVALID_CANDIDATE_SIGNAL');
  return c;
}

export function validateDiscoveryRun(run, identity) {
  if (!run || run.schemaVersion !== DISCOVERY_SCHEMA || run.contract !== DISCOVERY_RUN_CONTRACT || run.kind !== 'DISCOVERY_RUN') fail('INVALID_DISCOVERY_RUN');
  assertIdentity(run.identity, identity);
  discoveryConfig(run.config);
  if (!RUN_STATES.includes(run.status) || !/^DR-[a-f0-9]{20}$/.test(run.runId)) fail('INVALID_DISCOVERY_RUN');
  if (!Number.isFinite(Date.parse(run.createdAt)) || (run.completedAt != null && !Number.isFinite(Date.parse(run.completedAt)))) fail('INVALID_RUN_METADATA');
  if (!run.evidence || run.evidence.fingerprint !== identity.fingerprint || typeof run.evidence.snapshotId !== 'string') fail('EVIDENCE_SNAPSHOT_MISMATCH');
  if (run.candidates.length > DISCOVERY_LIMITS.candidatesMax || run.hypotheses.length > DISCOVERY_LIMITS.hypothesesMax + 24) fail('ARTIFACT_BUDGET_EXCEEDED');
  const candidateIds = new Set();
  for (const c of run.candidates) { validateCandidate(c); if (candidateIds.has(c.candidateId)) fail('DUPLICATE_CANDIDATE'); candidateIds.add(c.candidateId); }
  const hypothesisIds = new Set();
  for (const h of run.hypotheses) {
    validateHypothesis(h);
    if (hypothesisIds.has(h.hypothesisId)) fail('DUPLICATE_HYPOTHESIS');
    hypothesisIds.add(h.hypothesisId);
    if (!candidateIds.has(h.candidateId)) fail('HYPOTHESIS_ORPHAN');
  }
  if (!run.budget || !Number.isInteger(run.budget.consumed) || run.budget.consumed < 0 || run.budget.consumed > run.budget.allocated) fail('BUDGET_MISMATCH');
  if (!Array.isArray(run.journal) || run.journal.length > DISCOVERY_LIMITS.journalMax + 1) fail('ARTIFACT_BUDGET_EXCEEDED');
  if (!Array.isArray(run.discoveries) || run.discoveries.some((d) => typeof d !== 'object' || !d)) fail('INVALID_DISCOVERY_LIST');
  return run;
}

export function discoveryRunEnvelope(run) {
  const payload = structuredClone(run);
  return { format: 'intrilex-discovery-run', schemaVersion: DISCOVERY_SCHEMA, payload, contentHash: hashCanonical(payload) };
}

export function validateDiscoveryRunEnvelope(envelope, identity) {
  if (envelope?.format !== 'intrilex-discovery-run' || envelope.schemaVersion !== DISCOVERY_SCHEMA || envelope.contentHash !== hashCanonical(envelope.payload)) fail('DISCOVERY_RUN_HASH_MISMATCH');
  const run = structuredClone(envelope.payload);
  validateDiscoveryRun(run, identity);
  if (run.status === 'RUNNING') run.status = 'PAUSED';
  return run;
}

export function validateDiscoveryArtifact(discovery) {
  if (!discovery || discovery.schemaVersion !== DISCOVERY_SCHEMA || discovery.contract !== DISCOVERY_CONTRACT) fail('INVALID_DISCOVERY');
  if (!/^D-[A-F0-9]{8}$/.test(discovery.discoveryId)) fail('INVALID_DISCOVERY_ID');
  if (!['discovery', 'conditional_discovery', 'weakened', 'retracted'].includes(discovery.status)) fail('INVALID_DISCOVERY_STATUS');
  if (!discovery.effect || !isFiniteNum(discovery.effect.estimate) || !Array.isArray(discovery.effect.interval95)) fail('INVALID_DISCOVERY_EFFECT');
  if (!discovery.provenance?.runId || !discovery.provenance?.evidenceSnapshotId || !digest(discovery.provenance?.fingerprint)) fail('DISCOVERY_PROVENANCE_REQUIRED');
  if (!Array.isArray(discovery.statusHistory) || !discovery.statusHistory.length) fail('DISCOVERY_HISTORY_REQUIRED');
  return discovery;
}

export function discoveryEnvelope(discovery) {
  const payload = structuredClone(discovery);
  return { format: 'intrilex-discovery', schemaVersion: DISCOVERY_SCHEMA, payload, contentHash: hashCanonical(payload) };
}

export function validateDiscoveryEnvelope(envelope) {
  if (envelope?.format !== 'intrilex-discovery' || envelope.schemaVersion !== DISCOVERY_SCHEMA || envelope.contentHash !== hashCanonical(envelope.payload)) fail('DISCOVERY_HASH_MISMATCH');
  return validateDiscoveryArtifact(structuredClone(envelope.payload));
}

/** Compact immutable summary of a finished run — what the UI shows. */
export function discoveryRunSummary(run) {
  const counts = { evaluated: 0, rejected: 0, unresolved: 0, promoted: 0, conditional: 0, abandoned: 0 };
  for (const h of run.hypotheses ?? []) {
    if (TERMINAL_HYPOTHESIS_STATES.includes(h.status)) {
      counts.evaluated += 1;
      if (h.status === 'rejected') counts.rejected += 1;
      else if (h.status === 'unresolved') counts.unresolved += 1;
      else if (h.status === 'discovery') counts.promoted += 1;
      else if (h.status === 'conditional_discovery') counts.conditional += 1;
    } else if (['queued', 'testing', 'challenging', 'replicating', 'hypothesis'].includes(h.status)) counts.abandoned += 1;
  }
  return {
    runId: run.runId, status: run.status, mode: run.mode, createdAt: run.createdAt, completedAt: run.completedAt,
    evidence: {
      snapshotId: run.evidence?.snapshotId, runCount: run.evidence?.runCount, gameCount: run.evidence?.gameCount,
      selectedRunCount: run.evidence?.selectedRunCount ?? run.evidence?.runCount ?? 0,
      selectedGameCount: run.evidence?.selectedGameCount ?? run.evidence?.gameCount ?? 0,
      excludedCount: run.evidence?.excludedCount ?? 0,
      exclusionReasons: run.evidence?.exclusionReasons ?? {},
    },
    candidates: run.candidates?.length ?? 0,
    hypotheses: run.hypotheses?.length ?? 0,
    ...counts,
    budget: { allocated: run.budget?.allocated ?? 0, consumed: run.budget?.consumed ?? 0 },
    discoveries: (run.discoveries ?? []).map((d) => d.discoveryId ?? d),
    // A zero-discovery result is a success only when research actually
    // ran to completion — a BLOCKED input failure is never a result.
    zeroDiscoveryIsSuccess: run.status === 'COMPLETE' && counts.promoted === 0 && counts.conditional === 0,
  };
}
