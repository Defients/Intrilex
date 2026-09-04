// ═══════════════════════════════════════════════════════════════
// investigation-workflow.mjs — WAIT WHAT investigation lifecycle.
//
// Extends the `captureWaitWhat` envelope (see wait-what.mjs, spec §10)
// into a full investigation lifecycle:
//
//   bookmark → preserve context → inspect alternatives → branch →
//   compare → annotate → export
//
// with automatic invalidation when the engine authority hash changes.
//
// Design contract:
//   - Pure functions only — every operation takes an Investigation and
//     returns a NEW Investigation (immutable updates). No I/O, no side
//     effects. The caller (CasterSession or UI) owns persistence.
//   - Deterministic IDs derived via `hashCanonical` from stable inputs.
//   - Authority-hash invalidation is automatic: `checkInvalidation` is
//     called on every workflow operation by the caller, and transitions
//     the investigation to INVALIDATED when the hash drifts.
//   - Investigations are OBSERVATIONAL only (like the capture envelope):
//     they never carry engine commands and never feed IntrilexEngine.
//
// Capture contract reference (wait-what.mjs):
//   - deterministic where derived from replay
//   - locally inspectable
//   - jumpable back to the referenced replay position
//   - safely serializable
//   - free from unauthorized hidden information per active viewer mode
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import { CASTER_SCHEMA_VERSION, validateWaitWhatCapture } from './schemas.mjs';

// ── Investigation lifecycle states ────────────────────────────────

/**
 * Investigation lifecycle states.
 *
 * The lifecycle is monotonic forward (BOOKMARKED → … → EXPORTED) except
 * for INVALIDATED, which is a terminal sink reached when the authority
 * hash drifts. Once INVALIDATED, no further forward transitions occur.
 *
 * @enum {string}
 */
export const InvestigationStatus = Object.freeze({
  BOOKMARKED: 'BOOKMARKED',
  INSPECTING: 'INSPECTING',
  BRANCHED: 'BRANCHED',
  COMPARING: 'COMPARING',
  ANNOTATED: 'ANNOTATED',
  EXPORTED: 'EXPORTED',
  INVALIDATED: 'INVALIDATED'
});

const VALID_STATUSES = new Set(Object.values(InvestigationStatus));

const COMPARISON_METRICS = new Set(['evaluationScore', 'stateDelta', 'manual']);

// ── Helpers ───────────────────────────────────────────────────────

function isNonEmptyString(v) { return typeof v === 'string' && v.length > 0; }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function nowIso() { return new Date().toISOString(); }

function toStringArray(v) {
  return Array.isArray(v) ? v.filter(isNonEmptyString) : [];
}

/**
 * Deterministic investigation ID derived from the capture id + creation
 * timestamp. Stable across re-serialization as long as the capture and
 * creation time are unchanged.
 */
function makeInvestigationId(captureId, createdAt) {
  return `INV-${hashCanonical({ captureId, createdAt }).slice(0, 16)}`;
}

/**
 * Deterministic branch ID derived from the parent investigation + branch
 * inputs (excluding volatile fields like notes that may be edited).
 */
function makeBranchId(investigationId, alternativeActionId, createdAt) {
  return `BR-${hashCanonical({ investigationId, alternativeActionId, createdAt }).slice(0, 16)}`;
}

/**
 * Deterministic annotation ID derived from the parent investigation +
 * beat + text + creation time.
 */
function makeAnnotationId(investigationId, beatId, text, createdAt) {
  return `ANN-${hashCanonical({ investigationId, beatId, text, createdAt }).slice(0, 16)}`;
}

/**
 * Deterministic comparison ID derived from the parent investigation +
 * sorted branch ids + metric.
 */
function makeComparisonId(investigationId, branchIds, metric) {
  const sorted = [...branchIds].sort();
  return `CMP-${hashCanonical({ investigationId, branchIds: sorted, metric }).slice(0, 16)}`;
}

/**
 * Shallow-clone with a single field replaced. Keeps the rest of the
 * investigation structurally shared where practical.
 */
function withUpdate(investigation, patch) {
  return { ...investigation, ...patch, updatedAt: nowIso() };
}

/**
 * Guard: refuse forward transitions once the investigation is invalidated.
 * Returns true if the caller should no-op (return the investigation as-is).
 */
function isTerminal(investigation) {
  return investigation.status === InvestigationStatus.INVALIDATED ||
    investigation.status === InvestigationStatus.EXPORTED;
}

// ── Investigation creation ────────────────────────────────────────

/**
 * Create a new Investigation from a WAIT WHAT capture envelope.
 *
 * The capture is re-validated through `validateWaitWhatCapture` so the
 * investigation always carries a normalized envelope. The authority hash
 * is captured at creation time and used for subsequent invalidation
 * checks.
 *
 * @param {object} capture - a WaitWhatCapture envelope (see wait-what.mjs)
 * @param {string} authorityHash - engine authority hash at creation time
 * @returns {object} a new Investigation in BOOKMARKED status
 */
export function createInvestigation(capture, authorityHash) {
  const { normalized, errors } = validateWaitWhatCapture(capture);
  if (errors.length) {
    // Fail closed: still produce an investigation, but surface validation
    // errors as a non-fatal field for inspection (mirrors wait-what.mjs).
    normalized._validationErrors = errors;
  }
  const createdAt = nowIso();
  const captureId = normalized.captureId || `WW-unknown-${hashCanonical(normalized).slice(0, 12)}`;
  return {
    schemaVersion: CASTER_SCHEMA_VERSION,
    investigationId: makeInvestigationId(captureId, createdAt),
    status: InvestigationStatus.BOOKMARKED,
    capture: normalized,
    branches: [],
    annotations: [],
    comparisons: [],
    authorityHashAtCreation: isNonEmptyString(authorityHash) ? authorityHash : null,
    createdAt,
    updatedAt: createdAt,
    exportFormat: null
  };
}

// ── Lifecycle transitions ─────────────────────────────────────────

/**
 * Transition an investigation into the INSPECTING state.
 *
 * No-op if the investigation is terminal (EXPORTED or INVALIDATED).
 *
 * @param {object} investigation - current Investigation
 * @returns {object} a new Investigation in INSPECTING status
 */
export function transitionToInvestigating(investigation) {
  if (isTerminal(investigation)) return investigation;
  if (investigation.status === InvestigationStatus.INSPECTING) return investigation;
  return withUpdate(investigation, { status: InvestigationStatus.INSPECTING });
}

/**
 * Add a branch (alternative exploration) to an investigation.
 *
 * A branch represents an alternative action taken from the bookmarked
 * position. The investigation transitions to BRANCHED (or remains there
 * if already branched). Branches carry an optional snapshot of the
 * state after the alternative action and an optional numeric evaluation
 * score for later comparison.
 *
 * @param {object} investigation - current Investigation
 * @param {object} opts
 * @param {string} [opts.label] - user-provided or auto-generated label
 * @param {string} opts.alternativeActionId - the action taken instead
 * @param {string} [opts.notes] - user notes about this branch
 * @param {object} [opts.createdState] - snapshot of state after the alternative action
 * @param {number} [opts.evaluationScore] - optional numeric score for comparison
 * @returns {object} a new Investigation with the branch appended
 */
export function addBranch(investigation, { label, alternativeActionId, notes, createdState, evaluationScore } = {}) {
  if (isTerminal(investigation)) return investigation;
  if (!isNonEmptyString(alternativeActionId)) return investigation;

  const createdAt = nowIso();
  const branch = {
    branchId: makeBranchId(investigation.investigationId, alternativeActionId, createdAt),
    label: isNonEmptyString(label) ? label : `Branch ${investigation.branches.length + 1}`,
    alternativeActionId,
    notes: isNonEmptyString(notes) ? notes : '',
    createdState: createdState ?? null,
    evaluationScore: isFiniteNumber(evaluationScore) ? evaluationScore : null,
    createdAt,
    stale: false
  };

  const branches = [...investigation.branches, branch];
  return withUpdate(investigation, {
    status: InvestigationStatus.BRANCHED,
    branches
  });
}

/**
 * Add a user annotation to an investigation.
 *
 * Annotations are attached to a specific beat (by beatId) and transition
 * the investigation to ANNOTATED (or remain there if already annotated).
 *
 * @param {object} investigation - current Investigation
 * @param {object} opts
 * @param {string} opts.text - the annotation text
 * @param {string} [opts.beatId] - which beat the annotation is attached to
 * @returns {object} a new Investigation with the annotation appended
 */
export function addAnnotation(investigation, { text, beatId } = {}) {
  if (isTerminal(investigation)) return investigation;
  if (!isNonEmptyString(text)) return investigation;

  const createdAt = nowIso();
  const annotation = {
    annotationId: makeAnnotationId(investigation.investigationId, beatId ?? '', text, createdAt),
    text,
    beatId: isNonEmptyString(beatId) ? beatId : null,
    createdAt
  };

  const annotations = [...investigation.annotations, annotation];
  // Preserve a higher lifecycle state if already reached (e.g. BRANCHED).
  const status = forwardStatus(investigation.status, InvestigationStatus.ANNOTATED);
  return withUpdate(investigation, { annotations, status });
}

/**
 * Add a comparison between branches.
 *
 * The comparison records which branches are being compared, the metric
 * used, the result (which branch is better, or 'inconclusive'), and
 * optional notes. The investigation transitions to COMPARING (or a
 * higher forward state if already reached).
 *
 * @param {object} investigation - current Investigation
 * @param {object} opts
 * @param {string[]} opts.branchIds - the branches being compared
 * @param {string} opts.metric - 'evaluationScore' | 'stateDelta' | 'manual'
 * @param {string} [opts.result] - which branch is better, or 'inconclusive'
 * @param {string} [opts.notes] - comparison notes
 * @returns {object} a new Investigation with the comparison appended
 */
export function addComparison(investigation, { branchIds, metric, result, notes } = {}) {
  if (isTerminal(investigation)) return investigation;
  const ids = toStringArray(branchIds);
  if (ids.length < 2) return investigation;
  const normalizedMetric = COMPARISON_METRICS.has(metric) ? metric : 'manual';

  const comparison = {
    comparisonId: makeComparisonId(investigation.investigationId, ids, normalizedMetric),
    branchIds: ids,
    metric: normalizedMetric,
    result: isNonEmptyString(result) ? result : 'inconclusive',
    notes: isNonEmptyString(notes) ? notes : '',
    createdAt: nowIso(),
    stale: false
  };

  const comparisons = [...investigation.comparisons, comparison];
  const status = forwardStatus(investigation.status, InvestigationStatus.COMPARING);
  return withUpdate(investigation, { comparisons, status });
}

// ── Authority-hash invalidation ───────────────────────────────────

/**
 * Check whether the investigation is still valid against the current
 * engine authority hash.
 *
 * If the current hash differs from `authorityHashAtCreation`, the
 * investigation transitions to INVALIDATED and all branches/comparisons
 * are marked stale. This is automatic — the caller should invoke this on
 * every workflow operation. Once invalidated, the investigation is
 * terminal: no further forward transitions occur.
 *
 * If the hashes match (or both are null), the investigation is returned
 * unchanged.
 *
 * @param {object} investigation - current Investigation
 * @param {string} currentAuthorityHash - engine authority hash now
 * @returns {object} a new Investigation (INVALIDATED if drifted, else unchanged)
 */
export function checkInvalidation(investigation, currentAuthorityHash) {
  if (investigation.status === InvestigationStatus.INVALIDATED) return investigation;

  const stored = investigation.authorityHashAtCreation;
  const current = isNonEmptyString(currentAuthorityHash) ? currentAuthorityHash : null;

  // No stored hash and no current hash: cannot determine drift; leave as-is.
  if (stored == null && current == null) return investigation;
  // Drift detected.
  if (stored !== current) {
    const branches = investigation.branches.map(b => ({ ...b, stale: true }));
    const comparisons = investigation.comparisons.map(c => ({ ...c, stale: true }));
    return withUpdate(investigation, {
      status: InvestigationStatus.INVALIDATED,
      branches,
      comparisons
    });
  }
  return investigation;
}

// ── Export ────────────────────────────────────────────────────────

/**
 * Export an investigation as a JSON-serializable object or markdown.
 *
 * The export includes the original capture envelope, all branches,
 * annotations, and comparisons. The investigation status transitions to
 * EXPORTED (terminal). The return value bundles the updated
 * investigation, the export payload, and the export format.
 *
 * @param {object} investigation - current Investigation
 * @param {string} format - 'json' or 'markdown'
 * @returns {{ investigation: object, exportData: object|string, exportFormat: string }}
 */
export function exportInvestigation(investigation, format = 'json') {
  if (investigation.status === InvestigationStatus.INVALIDATED) {
    return { investigation, exportData: null, exportFormat: format };
  }

  const exportFormat = format === 'markdown' ? 'markdown' : 'json';
  const exportData = exportFormat === 'markdown'
    ? investigationToMarkdown(investigation)
    : investigationToJSON(investigation);

  const updated = withUpdate(investigation, {
    status: InvestigationStatus.EXPORTED,
    exportFormat
  });
  return { investigation: updated, exportData, exportFormat };
}

// ── Summary & validation ──────────────────────────────────────────

/**
 * Produce a compact summary of an investigation for UI/list views.
 *
 * @param {object} investigation - current Investigation
 * @returns {object} summary object
 */
export function getInvestigationSummary(investigation) {
  const capture = investigation.capture ?? {};
  const scored = investigation.branches.filter(b => b.evaluationScore != null);
  const bestBranch = scored.length
    ? scored.reduce((best, b) => (b.evaluationScore > best.evaluationScore ? b : best), scored[0])
    : null;
  return {
    investigationId: investigation.investigationId,
    status: investigation.status,
    captureId: capture.captureId ?? null,
    matchId: capture.matchId ?? null,
    casterBeatId: capture.casterBeatId ?? null,
    decisionId: capture.decisionId ?? null,
    branchCount: investigation.branches.length,
    annotationCount: investigation.annotations.length,
    comparisonCount: investigation.comparisons.length,
    bestBranchId: bestBranch?.branchId ?? null,
    bestBranchScore: bestBranch?.evaluationScore ?? null,
    authorityHashAtCreation: investigation.authorityHashAtCreation,
    createdAt: investigation.createdAt,
    updatedAt: investigation.updatedAt,
    exportFormat: investigation.exportFormat,
    invalidated: investigation.status === InvestigationStatus.INVALIDATED
  };
}

/**
 * Validate an Investigation object. Returns { valid, errors, normalized }.
 * Never throws.
 *
 * @param {object} investigation - candidate Investigation
 * @returns {{ valid: boolean, errors: string[], normalized: object }}
 */
export function validateInvestigation(investigation) {
  const errors = [];
  if (investigation == null || typeof investigation !== 'object' || Array.isArray(investigation)) {
    return { valid: false, errors: ['investigation must be an object'], normalized: null };
  }
  if (!isNonEmptyString(investigation.investigationId)) errors.push('investigationId must be a non-empty string');
  if (!VALID_STATUSES.has(investigation.status)) errors.push(`status must be one of ${[...VALID_STATUSES].join(', ')}`);
  if (investigation.capture == null || typeof investigation.capture !== 'object') {
    errors.push('capture must be an object');
  }
  if (!Array.isArray(investigation.branches)) errors.push('branches must be an array');
  if (!Array.isArray(investigation.annotations)) errors.push('annotations must be an array');
  if (!Array.isArray(investigation.comparisons)) errors.push('comparisons must be an array');

  const { normalized: captureNorm, errors: captureErrors } = validateWaitWhatCapture(investigation.capture ?? {});
  if (captureErrors.length) errors.push(...captureErrors.map(e => `capture: ${e}`));

  const normalized = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    investigationId: investigation.investigationId || '',
    status: VALID_STATUSES.has(investigation.status) ? investigation.status : InvestigationStatus.BOOKMARKED,
    capture: captureNorm,
    branches: Array.isArray(investigation.branches) ? investigation.branches.map(normalizeBranch).filter(Boolean) : [],
    annotations: Array.isArray(investigation.annotations) ? investigation.annotations.map(normalizeAnnotation).filter(Boolean) : [],
    comparisons: Array.isArray(investigation.comparisons) ? investigation.comparisons.map(normalizeComparison).filter(Boolean) : [],
    authorityHashAtCreation: investigation.authorityHashAtCreation ?? null,
    createdAt: investigation.createdAt ?? null,
    updatedAt: investigation.updatedAt ?? null,
    exportFormat: investigation.exportFormat ?? null
  };
  return { valid: errors.length === 0, errors, normalized };
}

function normalizeBranch(b) {
  if (b == null || typeof b !== 'object') return null;
  return {
    branchId: b.branchId || '',
    label: isNonEmptyString(b.label) ? b.label : '',
    alternativeActionId: b.alternativeActionId ?? null,
    notes: isNonEmptyString(b.notes) ? b.notes : '',
    createdState: b.createdState ?? null,
    evaluationScore: isFiniteNumber(b.evaluationScore) ? b.evaluationScore : null,
    createdAt: b.createdAt ?? null,
    stale: Boolean(b.stale)
  };
}

function normalizeAnnotation(a) {
  if (a == null || typeof a !== 'object') return null;
  return {
    annotationId: a.annotationId || '',
    text: isNonEmptyString(a.text) ? a.text : '',
    beatId: isNonEmptyString(a.beatId) ? a.beatId : null,
    createdAt: a.createdAt ?? null
  };
}

function normalizeComparison(c) {
  if (c == null || typeof c !== 'object') return null;
  return {
    comparisonId: c.comparisonId || '',
    branchIds: toStringArray(c.branchIds),
    metric: COMPARISON_METRICS.has(c.metric) ? c.metric : 'manual',
    result: isNonEmptyString(c.result) ? c.result : 'inconclusive',
    notes: isNonEmptyString(c.notes) ? c.notes : '',
    createdAt: c.createdAt ?? null,
    stale: Boolean(c.stale)
  };
}

// ── Serialization ─────────────────────────────────────────────────

/**
 * Convert an Investigation to a JSON-safe plain object.
 *
 * @param {object} investigation - current Investigation
 * @returns {object} JSON-safe object
 */
export function investigationToJSON(investigation) {
  const { normalized } = validateInvestigation(investigation);
  return normalized;
}

/**
 * Reconstruct an Investigation from a JSON-safe plain object.
 *
 * @param {object} json - JSON-safe object (as produced by investigationToJSON)
 * @returns {object} a normalized Investigation
 */
export function investigationFromJSON(json) {
  const { normalized } = validateInvestigation(json);
  return normalized;
}

// ── Markdown export ───────────────────────────────────────────────

function investigationToMarkdown(investigation) {
  const cap = investigation.capture ?? {};
  const lines = [];
  lines.push(`# Investigation ${investigation.investigationId}`);
  lines.push('');
  lines.push(`- **Status:** ${investigation.status}`);
  lines.push(`- **Capture ID:** ${cap.captureId ?? '—'}`);
  lines.push(`- **Match ID:** ${cap.matchId ?? '—'}`);
  lines.push(`- **Beat ID:** ${cap.casterBeatId ?? '—'}`);
  lines.push(`- **Decision ID:** ${cap.decisionId ?? '—'}`);
  lines.push(`- **Checkpoint Hash:** ${cap.checkpointHash ?? '—'}`);
  lines.push(`- **Viewer Mode:** ${cap.viewerMode ?? '—'}`);
  lines.push(`- **Redacted:** ${cap.redacted ? 'yes' : 'no'}`);
  lines.push(`- **Authority Hash (creation):** ${investigation.authorityHashAtCreation ?? '—'}`);
  lines.push(`- **Created:** ${investigation.createdAt ?? '—'}`);
  lines.push(`- **Updated:** ${investigation.updatedAt ?? '—'}`);
  lines.push('');

  if (investigation.branches.length) {
    lines.push('## Branches');
    for (const b of investigation.branches) {
      lines.push(`### ${b.label} (\`${b.branchId}\`)${b.stale ? ' — *stale*' : ''}`);
      lines.push(`- Alternative action: \`${b.alternativeActionId ?? '—'}\``);
      if (b.evaluationScore != null) lines.push(`- Evaluation score: ${b.evaluationScore}`);
      if (b.notes) lines.push(`- Notes: ${b.notes}`);
      lines.push(`- Created: ${b.createdAt ?? '—'}`);
      lines.push('');
    }
  }

  if (investigation.annotations.length) {
    lines.push('## Annotations');
    for (const a of investigation.annotations) {
      lines.push(`- **\`${a.annotationId}\`** (beat: ${a.beatId ?? '—'}) — ${a.text}`);
    }
    lines.push('');
  }

  if (investigation.comparisons.length) {
    lines.push('## Comparisons');
    for (const c of investigation.comparisons) {
      lines.push(`### \`${c.comparisonId}\`${c.stale ? ' — *stale*' : ''}`);
      lines.push(`- Branches: ${c.branchIds.join(', ')}`);
      lines.push(`- Metric: ${c.metric}`);
      lines.push(`- Result: ${c.result}`);
      if (c.notes) lines.push(`- Notes: ${c.notes}`);
      lines.push('');
    }
  }

  if (cap.commentary) {
    lines.push('## Commentary');
    lines.push(cap.commentary);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Internal: forward status resolution ───────────────────────────

/**
 * Resolve the highest forward lifecycle status between two states.
 * The lifecycle order is:
 *   BOOKMARKED → INSPECTING → BRANCHED → COMPARING → ANNOTATED → EXPORTED
 * INVALIDATED is terminal and never produced here.
 */
const STATUS_ORDER = [
  InvestigationStatus.BOOKMARKED,
  InvestigationStatus.INSPECTING,
  InvestigationStatus.BRANCHED,
  InvestigationStatus.COMPARING,
  InvestigationStatus.ANNOTATED,
  InvestigationStatus.EXPORTED
];

function forwardStatus(current, candidate) {
  if (current === InvestigationStatus.INVALIDATED) return current;
  const ci = STATUS_ORDER.indexOf(current);
  const pi = STATUS_ORDER.indexOf(candidate);
  if (ci < 0 || pi < 0) return current;
  return ci >= pi ? current : candidate;
}
