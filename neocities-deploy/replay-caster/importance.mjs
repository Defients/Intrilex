// ═══════════════════════════════════════════════════════════════
// importance.mjs — Deterministic beat importance scoring.
//
// A caster that speaks constantly is unusable. This module assigns a
// deterministic 0..1 importance to each beat using only authoritative,
// viewer-visible signals derived from the completed match. No RNG, no
// LLM. Same inputs always produce the same score.
//
// Pacing bands (consumed by the planner):
//   0.00–0.29 → no spoken commentary
//   0.30–0.59 → optional short line
//   0.60–0.79 → standard commentary
//   0.80–1.00 → highlighted moment
// ═══════════════════════════════════════════════════════════════

import { BEAT_KIND } from './schemas.mjs';

export const PACING_BAND = Object.freeze({
  SILENT: 'SILENT',       // 0.00–0.29
  OPTIONAL: 'OPTIONAL',   // 0.30–0.59
  STANDARD: 'STANDARD',   // 0.60–0.79
  HIGHLIGHT: 'HIGHLIGHT'  // 0.80–1.00
});

export function pacingBand(importance) {
  if (importance >= 0.8) return PACING_BAND.HIGHLIGHT;
  if (importance >= 0.6) return PACING_BAND.STANDARD;
  if (importance >= 0.3) return PACING_BAND.OPTIONAL;
  return PACING_BAND.SILENT;
}

// Mechanic families that signal high-impact moments.
const HIGH_IMPACT_FAMILIES = new Set(['super', 'ultra', 'voltage', 'counter']);
const ADVANCED_FAMILIES = new Set(['royal-marriage', 'super', 'rank10', 'ultra', 'voltage']);
const RESPONSE_FAMILIES = new Set(['counter', 'disrupt', 'interrupt', 'instant', 'quick']);

/**
 * Compute deterministic importance for a beat.
 *
 * Inputs are derived from the completed match's decision/frame evidence
 * (never from the LLM). All signals are viewer-safe: they describe
 * magnitudes and mechanics, not hidden identities.
 *
 * @param {object} beat - CasterBeat (already built)
 * @param {object} ctx  - { scoreBefore, scoreAfter, goal, opponentScore,
 *                          decisionMargin, legalActionCount, stackDepth,
 *                          terminationReason, isTerminal }
 * @returns {number} importance in [0,1]
 */
export function computeImportance(beat, ctx = {}) {
  const kind = beat.beatKind;

  // Structural beats have fixed importance.
  if (kind === BEAT_KIND.MATCH_START) return 0.35;
  if (kind === BEAT_KIND.MATCH_END) return 1.0;
  if (kind === BEAT_KIND.TURN_START) return 0.2;

  let score = 0;

  // ── Score movement ──
  // Any positive score delta is commentary-worthy; magnitude scales it.
  const goal = ctx.goal ?? 21;
  const scoreDelta = Math.abs((ctx.scoreAfter ?? 0) - (ctx.scoreBefore ?? 0));
  if (scoreDelta > 0) score += 0.3 + Math.min(0.3, scoreDelta / goal * 0.3);

  // ── Threshold proximity ──
  const scoreAfter = ctx.scoreAfter ?? 0;
  const proximity = scoreAfter / goal;
  if (proximity >= 1.0) score += 0.35;       // reached threshold
  else if (proximity >= 0.85) score += 0.2;
  else if (proximity >= 0.6) score += 0.1;

  // ── Close decision margin ──
  const margin = ctx.decisionMargin;
  if (Number.isFinite(margin)) {
    if (margin <= 5) score += 0.18;          // very close call
    else if (margin <= 15) score += 0.08;
  }

  // ── Advanced / high-impact mechanics ──
  const family = beat.action?.family ?? beat.decision?.family;
  const mode = beat.action?.mode ?? beat.decision?.mode;
  if (family && HIGH_IMPACT_FAMILIES.has(family)) score += 0.22;
  if (family && ADVANCED_FAMILIES.has(family)) score += 0.1;
  if (mode && ADVANCED_FAMILIES.has(mode)) score += 0.05;

  // ── Response / counter activity ──
  if (family && RESPONSE_FAMILIES.has(family)) score += 0.12;

  // ── Stack depth (resolution complexity) ──
  const stackDepth = ctx.stackDepth ?? 0;
  if (stackDepth >= 3) score += 0.1;
  else if (stackDepth >= 2) score += 0.05;

  // ── Terminal ──
  if (ctx.isTerminal) score = Math.max(score, 0.9);

  return Math.max(0, Math.min(1, score));
}

/**
 * Decide whether a beat is commentary-eligible given its importance
 * and the current density setting. Deterministic.
 *
 * @param {number} importance
 * @param {object} opts - { density: 'low'|'normal'|'high', lastSpokenSequence }
 * @returns {boolean}
 */
export function shouldSpeak(importance, opts = {}) {
  const band = pacingBand(importance);
  if (band === PACING_BAND.SILENT) return false;
  const density = opts.density ?? 'normal';
  // Density shifts the threshold but stays deterministic.
  const threshold = density === 'low' ? 0.5 : density === 'high' ? 0.25 : 0.3;
  return importance >= threshold;
}
