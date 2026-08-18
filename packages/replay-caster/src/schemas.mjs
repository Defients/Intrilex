// ═══════════════════════════════════════════════════════════════
// schemas.mjs — Versioned Replay Caster data contracts + validation.
//
// Every persisted or externally meaningful Caster contract is versioned
// and validated here. Contracts are pure data; validation never throws
// on bad input — it returns { valid, errors, normalized } so callers
// can fail closed without crashing playback.
//
// Authority note: these contracts are OBSERVATIONAL. They never carry
// engine commands and never feed IntrilexEngine.execute. Commentary
// text is presentation only.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';

export const CASTER_SCHEMA_VERSION = '1.0.0';
export const COMMENTARY_PROMPT_VERSION = '1.0.0';

// ── Enumerations ──────────────────────────────────────────────────
export const BEAT_KIND = Object.freeze({
  MATCH_START: 'MATCH_START',
  TURN_START: 'TURN_START',
  DECISION: 'DECISION',
  DECLARATION: 'DECLARATION',
  RESPONSE: 'RESPONSE',
  RESOLUTION: 'RESOLUTION',
  SCORE_CHANGE: 'SCORE_CHANGE',
  BOARD_SWING: 'BOARD_SWING',
  MATCH_END: 'MATCH_END'
});

export const COMMENTARY_MODE = Object.freeze({
  BROADCAST: 'BROADCAST',
  DEV_OBSERVATORY: 'DEV_OBSERVATORY'
});

export const VIEWER_MODE = Object.freeze({
  PUBLIC: 'public',
  PLAYER: 'player',
  OMNISCIENT: 'omniscient'
});

export const DIAGNOSTIC_VERDICT = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  INVESTIGATE: 'INVESTIGATE',
  NOT_OBSERVABLE: 'NOT_OBSERVABLE',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  CONFIRMED_FAILURE: 'CONFIRMED_FAILURE'
});

export const DIAGNOSTIC_CATEGORY = Object.freeze({
  RULE_AUDIT_FAILURE: 'RULE_AUDIT_FAILURE',
  LEGAL_ACTION_ANOMALY: 'LEGAL_ACTION_ANOMALY',
  POLICY_SELECTION_ANOMALY: 'POLICY_SELECTION_ANOMALY',
  STATE_DELTA_ANOMALY: 'STATE_DELTA_ANOMALY',
  MECHANIC_INACTIVITY: 'MECHANIC_INACTIVITY',
  SCORE_OR_GOAL_ANOMALY: 'SCORE_OR_GOAL_ANOMALY',
  REPLAY_INTEGRITY_ANOMALY: 'REPLAY_INTEGRITY_ANOMALY'
});

export const DIAGNOSTIC_SEVERITY = Object.freeze({
  INFO: 'INFO',
  INVESTIGATE: 'INVESTIGATE',
  WARNING: 'WARNING'
});

export const SPOILER_CHECK = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNVERIFIED: 'UNVERIFIED'
});

const VALID_BEAT_KINDS = new Set(Object.values(BEAT_KIND));
const VALID_MODES = new Set(Object.values(COMMENTARY_MODE));
const VALID_VIEWER = new Set(Object.values(VIEWER_MODE));
const VALID_VERDICTS = new Set(Object.values(DIAGNOSTIC_VERDICT));

// ── Helpers ───────────────────────────────────────────────────────
function isNonEmptyString(v) { return typeof v === 'string' && v.length > 0; }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function toStringArray(v) { return Array.isArray(v) ? v.filter(isNonEmptyString) : []; }

/**
 * Stable, deterministic beat ID derived from match identity + sequence.
 * Does NOT include transient timestamps or commentary fields.
 */
export function makeBeatId(matchId, sequence) {
  return `CB-${hashCanonical({ matchId, sequence }).slice(0, 16)}`;
}

/**
 * Stable commentary cache key. Includes only materially relevant inputs:
 * prompt version, model, mode, beat canonical projection, viewer mode,
 * and a compact past-thread digest. Excludes presentation-only fields.
 */
export function makeCommentaryCacheKey({ promptVersion, model, mode, beatProjectionHash, viewerMode, threadDigest }) {
  return hashCanonical({ promptVersion, model: model || '', mode, beatProjectionHash, viewerMode, threadDigest: threadDigest || '' });
}

// ── CasterBeat validation ─────────────────────────────────────────
/**
 * Validate a CasterBeat. Returns { valid, errors, normalized }.
 * Never throws.
 */
export function validateBeat(beat) {
  const errors = [];
  if (beat == null || typeof beat !== 'object' || Array.isArray(beat)) {
    return { valid: false, errors: ['beat must be an object'], normalized: null };
  }
  if (!isNonEmptyString(beat.beatId)) errors.push('beatId must be a non-empty string');
  if (!isNonEmptyString(beat.matchId)) errors.push('matchId must be a non-empty string');
  if (!Number.isInteger(beat.sequence) || beat.sequence < 0) errors.push('sequence must be a non-negative integer');
  if (!VALID_BEAT_KINDS.has(beat.beatKind)) errors.push(`beatKind must be one of ${[...VALID_BEAT_KINDS].join(', ')}`);
  if (beat.importance !== undefined && !isFiniteNumber(beat.importance)) errors.push('importance must be a number when present');

  const normalized = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    beatId: beat.beatId || '',
    matchId: beat.matchId || '',
    sequence: Number(beat.sequence) || 0,
    beatKind: VALID_BEAT_KINDS.has(beat.beatKind) ? beat.beatKind : BEAT_KIND.DECISION,
    seat: beat.seat ?? null,
    turn: beat.turn ?? null,
    phase: beat.phase ?? null,
    decisionId: beat.decisionId ?? null,
    checkpointHashBefore: beat.checkpointHashBefore ?? null,
    checkpointHashAfter: beat.checkpointHashAfter ?? null,
    publicSummary: beat.publicSummary ?? {},
    action: beat.action ?? null,
    decision: beat.decision ?? null,
    resolution: beat.resolution ?? null,
    visibleEvents: Array.isArray(beat.visibleEvents) ? beat.visibleEvents : [],
    importance: isFiniteNumber(beat.importance) ? clamp01(beat.importance) : 0,
    commentaryEligible: beat.commentaryEligible !== false
  };
  return { valid: errors.length === 0, errors, normalized };
}

// ── CommentaryRecord validation ───────────────────────────────────
/**
 * Validate a CommentaryRecord (provider output shape).
 * The LLM is untrusted; this is the boundary that accepts or rejects
 * model output. Malformed output fails to UNVERIFIED, never crashes.
 */
export function validateCommentaryRecord(obj) {
  const errors = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['commentary must be an object'], normalized: emptyCommentaryRecord() };
  }
  if (!isNonEmptyString(obj.commentary)) errors.push('commentary must be a non-empty string');
  if (obj.importance !== undefined && !isFiniteNumber(obj.importance)) errors.push('importance must be a number when present');
  const spoiler = VALID_VERDICTS.has(obj.spoilerCheck) ? obj.spoilerCheck : SPOILER_CHECK.UNVERIFIED;
  // spoilerCheck is constrained to the spoiler enum, not the diagnostic verdict enum
  const validSpoiler = [SPOILER_CHECK.PASS, SPOILER_CHECK.FAIL, SPOILER_CHECK.UNVERIFIED].includes(obj.spoilerCheck);
  const normalized = {
    importance: isFiniteNumber(obj.importance) ? clamp01(obj.importance) : 0.5,
    headline: isNonEmptyString(obj.headline) ? String(obj.headline) : '',
    commentary: isNonEmptyString(obj.commentary) ? String(obj.commentary) : '',
    tone: isNonEmptyString(obj.tone) ? String(obj.tone) : 'NEUTRAL',
    threadActions: Array.isArray(obj.threadActions) ? obj.threadActions.filter(a => a && typeof a === 'object') : [],
    diagnosticReferences: toStringArray(obj.diagnosticReferences),
    spoilerCheck: validSpoiler ? obj.spoilerCheck : SPOILER_CHECK.UNVERIFIED
  };
  return { valid: errors.length === 0, errors, normalized };
}

export function emptyCommentaryRecord() {
  return {
    importance: 0,
    headline: '',
    commentary: '',
    tone: 'NEUTRAL',
    threadActions: [],
    diagnosticReferences: [],
    spoilerCheck: SPOILER_CHECK.UNVERIFIED
  };
}

// ── DiagnosticRecord validation ───────────────────────────────────
export function validateDiagnosticRecord(d) {
  const errors = [];
  if (d == null || typeof d !== 'object') {
    return { valid: false, errors: ['diagnostic must be an object'], normalized: null };
  }
  if (!isNonEmptyString(d.diagnosticId)) errors.push('diagnosticId required');
  if (!VALID_VERDICTS.has(d.verdict)) errors.push(`verdict must be one of ${[...VALID_VERDICTS].join(', ')}`);
  const normalized = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    diagnosticId: d.diagnosticId || '',
    severity: [DIAGNOSTIC_SEVERITY.INFO, DIAGNOSTIC_SEVERITY.INVESTIGATE, DIAGNOSTIC_SEVERITY.WARNING].includes(d.severity) ? d.severity : DIAGNOSTIC_SEVERITY.INFO,
    category: isNonEmptyString(d.category) ? d.category : DIAGNOSTIC_CATEGORY.LEGAL_ACTION_ANOMALY,
    beatId: d.beatId ?? null,
    decisionId: d.decisionId ?? null,
    checkpointHash: d.checkpointHash ?? null,
    observed: isNonEmptyString(d.observed) ? d.observed : '',
    evidence: toStringArray(d.evidence),
    expectedBasis: d.expectedBasis ?? null,
    verdict: VALID_VERDICTS.has(d.verdict) ? d.verdict : DIAGNOSTIC_VERDICT.NOT_OBSERVABLE,
    source: 'DETERMINISTIC_CHECK'
  };
  return { valid: errors.length === 0, errors, normalized };
}

// ── WaitWhatCapture validation ────────────────────────────────────
export function validateWaitWhatCapture(c) {
  const errors = [];
  if (c == null || typeof c !== 'object') {
    return { valid: false, errors: ['capture must be an object'], normalized: null };
  }
  if (!isNonEmptyString(c.captureId)) errors.push('captureId required');
  if (!isNonEmptyString(c.matchId)) errors.push('matchId required');
  const normalized = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    captureId: c.captureId || '',
    createdAt: c.createdAt ?? null,
    matchId: c.matchId || '',
    replayId: c.replayId ?? null,
    casterBeatId: c.casterBeatId ?? null,
    decisionId: c.decisionId ?? null,
    checkpointHash: c.checkpointHash ?? null,
    playbackTime: isFiniteNumber(c.playbackTime) ? c.playbackTime : 0,
    policyIds: toStringArray(c.policyIds),
    engineVersion: c.engineVersion ?? null,
    rulesVersion: c.rulesVersion ?? null,
    profileId: c.profileId ?? null,
    viewerMode: VALID_VIEWER.has(c.viewerMode) ? c.viewerMode : VIEWER_MODE.PUBLIC,
    selectedAction: c.selectedAction ?? null,
    legalOptions: Array.isArray(c.legalOptions) ? c.legalOptions : [],
    decisionTrace: c.decisionTrace ?? null,
    diagnostics: Array.isArray(c.diagnostics) ? c.diagnostics : [],
    commentary: c.commentary ?? null,
    contextBefore: Array.isArray(c.contextBefore) ? c.contextBefore : [],
    contextAfter: Array.isArray(c.contextAfter) ? c.contextAfter : [],
    redacted: Boolean(c.redacted)
  };
  return { valid: errors.length === 0, errors, normalized };
}

// ── NarrativeThread validation ────────────────────────────────────
export const THREAD_STATUS = Object.freeze({ OPEN: 'OPEN', PAID_OFF: 'PAID_OFF', ABANDONED: 'ABANDONED' });

export function validateNarrativeThread(t) {
  const errors = [];
  if (t == null || typeof t !== 'object') {
    return { valid: false, errors: ['thread must be an object'], normalized: null };
  }
  if (!isNonEmptyString(t.threadId)) errors.push('threadId required');
  const validStatus = [THREAD_STATUS.OPEN, THREAD_STATUS.PAID_OFF, THREAD_STATUS.ABANDONED].includes(t.status);
  const normalized = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    threadId: t.threadId || '',
    createdAtBeat: t.createdAtBeat ?? null,
    topic: isNonEmptyString(t.topic) ? t.topic : '',
    subject: t.subject ?? null,
    status: validStatus ? t.status : THREAD_STATUS.OPEN,
    payoffBeatId: t.payoffBeatId ?? null,
    foreshadowAllowed: t.foreshadowAllowed !== false,
    spoilerLevel: t.spoilerLevel ?? 'NONE'
  };
  return { valid: errors.length === 0, errors, normalized };
}

// ── CasterSession envelope ────────────────────────────────────────
/**
 * Build a serializable CasterSession envelope from session state.
 * Commentary output is NOT part of canonical match identity; the
 * session envelope is a presentation artifact only.
 */
export function buildSessionEnvelope(session) {
  return {
    schemaVersion: CASTER_SCHEMA_VERSION,
    sessionType: 'replay-caster',
    matchId: session.matchId ?? null,
    replayHash: session.replayHash ?? null,
    finalStateHash: session.finalStateHash ?? null,
    engineVersion: session.engineVersion ?? null,
    rulesVersion: session.rulesVersion ?? null,
    profileId: session.profileId ?? null,
    policyIds: session.policyIds ?? [],
    beatCount: session.beats?.length ?? 0,
    commentaryMode: session.commentaryMode ?? COMMENTARY_MODE.BROADCAST,
    viewerMode: session.viewerMode ?? VIEWER_MODE.PUBLIC,
    commentaryPromptVersion: COMMENTARY_PROMPT_VERSION,
    casterSchemaVersion: CASTER_SCHEMA_VERSION
  };
}
