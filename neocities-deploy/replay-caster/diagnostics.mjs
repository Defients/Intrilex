// ═══════════════════════════════════════════════════════════════
// diagnostics.mjs — Deterministic anomaly detectors for the
// commentator. The LLM is NOT the detector of record.
//
// Each diagnostic carries a verdict from a constrained enum:
//   SUPPORTED          — evidence confirms expected behavior
//   INVESTIGATE        — something looks unusual; deserves a look
//   NOT_OBSERVABLE     — cannot determine from available evidence
//   NOT_SUPPORTED      — authority says this should not happen
//   CONFIRMED_FAILURE  — deterministic evidence of a real defect
//
// HARD INVARIANT: never convert NOT_OBSERVABLE into CONFIRMED_FAILURE
// without evidence. We never fabricate expected behavior when
// authority is unavailable.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  CASTER_SCHEMA_VERSION,
  DIAGNOSTIC_CATEGORY, DIAGNOSTIC_SEVERITY, DIAGNOSTIC_VERDICT,
  validateDiagnosticRecord
} from './schemas.mjs';

/**
 * Run deterministic diagnostics across the full beat sequence + match
 * result. Returns an array of validated DiagnosticRecord objects keyed
 * to beats.
 *
 * @param {object} matchResult - runPolicyMatch result
 * @param {Array} beats - CasterBeat sequence
 * @param {Array} [frames] - reconstructed authority frames (for integrity check)
 * @returns {Array} validated DiagnosticRecord[]
 */
export function runDiagnostics(matchResult, beats, frames) {
  const out = [];
  if (!matchResult || !Array.isArray(beats)) return out;
  const summary = matchResult.summary;
  const decisions = Array.isArray(matchResult.decisions) ? matchResult.decisions : [];
  const traces = Array.isArray(matchResult.decisionTraces) ? matchResult.decisionTraces : [];

  // ── Replay integrity: cross-check final-state hash ──
  // This is the one place a CONFIRMED_FAILURE can arise: the runtime
  // itself asserts final-state hash parity when building the certified
  // replay. We re-derive the final state hash from the reconstructed
  // frames and compare it to the summary's finalStateHash. These are
  // the SAME hash space (authorityHashCanonical of the final state).
  // We never compare the replay envelope contentHash (a different
  // hash space) — that would fabricate a failure.
  if (summary && summary.finalStateHash && frames && frames.length > 0) {
    const finalState = frames[frames.length - 1]?.state ?? frames[frames.length - 1]?.omniscientState;
    const reconstructedHash = finalState ? hashCanonical(finalState) : null;
    if (reconstructedHash && reconstructedHash !== summary.finalStateHash) {
      out.push(makeDiagnostic({
        beats, beatIndex: beats.length - 1,
        category: DIAGNOSTIC_CATEGORY.REPLAY_INTEGRITY_ANOMALY,
        severity: DIAGNOSTIC_SEVERITY.WARNING,
        observed: `Reconstructed final-state hash ${reconstructedHash.slice(0, 12)} differs from summary ${summary.finalStateHash.slice(0, 12)}`,
        evidence: [`summary.finalStateHash=${summary.finalStateHash}`, `reconstructedFinalHash=${reconstructedHash}`],
        expectedBasis: 'runtime AUTHORITY_REPLAY_FINAL_HASH_MISMATCH assertion',
        verdict: DIAGNOSTIC_VERDICT.CONFIRMED_FAILURE
      }));
    }
  }

  // ── Per-decision diagnostics ──
  for (let i = 0; i < decisions.length; i += 1) {
    const decision = decisions[i];
    const trace = traces[i] ?? null;
    const beat = findDecisionBeat(beats, i);
    if (!beat) continue;

    // Close policy selection → INVESTIGATE (not a failure).
    const margin = beat.decision?.selectionMargin;
    if (Number.isFinite(margin) && margin <= 3 && (decision.legalActionCount ?? 0) > 1) {
      out.push(makeDiagnostic({
        beats, beatIndex: beats.indexOf(beat),
        category: DIAGNOSTIC_CATEGORY.POLICY_SELECTION_ANOMALY,
        severity: DIAGNOSTIC_SEVERITY.INVESTIGATE,
        observed: `Policy selection margin ${Math.round(margin)} between top two candidates`,
        evidence: [`margin=${margin}`, `legalActionCount=${decision.legalActionCount ?? 0}`],
        expectedBasis: null,
        verdict: DIAGNOSTIC_VERDICT.INVESTIGATE
      }));
    }

    // Rule audit from the decision trace, if present and authoritative.
    // Only CONFIRMED_FAILURE if the trace explicitly records a failed
    // audit. Otherwise NOT_OBSERVABLE — we do not infer rule compliance
    // from appearance.
    const audit = trace?.ruleAudit ?? trace?.evidence?.ruleAudit;
    if (audit && Array.isArray(audit.violations) && audit.violations.length > 0) {
      out.push(makeDiagnostic({
        beats, beatIndex: beats.indexOf(beat),
        category: DIAGNOSTIC_CATEGORY.RULE_AUDIT_FAILURE,
        severity: DIAGNOSTIC_SEVERITY.WARNING,
        observed: `Decision trace reports ${audit.violations.length} rule-audit violation(s)`,
        evidence: audit.violations.map(v => typeof v === 'string' ? v : JSON.stringify(v)),
        expectedBasis: 'decision-trace ruleAudit',
        verdict: DIAGNOSTIC_VERDICT.CONFIRMED_FAILURE
      }));
    } else if (trace && trace.ruleAudit === undefined && trace.evidence?.ruleAudit === undefined) {
      // No rule audit available — explicitly NOT_OBSERVABLE, never a failure.
      // (We do not emit a record for every decision to avoid spam; only
      //  when an INVESTIGATE signal already exists do we annotate that
      //  audit was not observable.)
    }
  }

  return out;
}

/**
 * Filter diagnostics to those relevant at or before a given beat index
 * (viewer-visible past + present). Future diagnostics are excluded
 * from the viewer payload.
 */
export function diagnosticsThroughBeat(diagnostics, beatIndex) {
  return diagnostics.filter(d => d._beatIndex != null && d._beatIndex <= beatIndex);
}

// ── Helpers ───────────────────────────────────────────────────────

function makeDiagnostic({ beats, beatIndex, category, severity, observed, evidence, expectedBasis, verdict }) {
  const beat = beats[beatIndex] ?? null;
  const diagnosticId = `DX-${hashCanonical({ beatId: beat?.beatId, category, observed }).slice(0, 16)}`;
  const { normalized } = validateDiagnosticRecord({
    schemaVersion: CASTER_SCHEMA_VERSION,
    diagnosticId,
    severity,
    category,
    beatId: beat?.beatId ?? null,
    decisionId: beat?.decisionId ?? null,
    checkpointHash: beat?.checkpointHashAfter ?? beat?.checkpointHashBefore ?? null,
    observed,
    evidence: evidence || [],
    expectedBasis: expectedBasis ?? null,
    verdict,
    source: 'DETERMINISTIC_CHECK'
  });
  // Attach private beat index for internal filtering.
  normalized._beatIndex = beatIndex;
  return normalized;
}

function findDecisionBeat(beats, decisionIndex) {
  // Decision beats appear in order; the i-th decision beat corresponds
  // to decisionIndex i. Structural beats (MATCH_START/TURN_START) are
  // interleaved, so we scan for the (i+1)-th DECISION/RESPONSE beat.
  let seen = 0;
  for (const b of beats) {
    if (b.beatKind === 'DECISION' || b.beatKind === 'RESPONSE') {
      if (seen === decisionIndex) return b;
      seen += 1;
    }
  }
  return null;
}

function computeReplayFinalHash(replay) {
  // Unused — retained for backward compatibility. The integrity check
  // now compares the reconstructed final-frame state hash (same hash
  // space as summary.finalStateHash) instead of the replay envelope
  // contentHash (a different hash space).
  return replay.integrityHash ?? replay.contentHash ?? null;
}
