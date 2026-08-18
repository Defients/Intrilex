// ═══════════════════════════════════════════════════════════════
// narrative-thread.mjs — Lightweight narrative continuity.
//
// Threads are derived deterministically from the completed beat
// sequence. The commentator's planner may use future-aware thread
// state to create setup/payoff commentary, but threads shown to the
// audience never carry spoiler-level information (spoilerLevel: NONE,
// foreshadowAllowed: true means only vague foreshadowing is permitted).
//
// A thread's payoffBeatId is PRIVATE commentator context. The
// viewer-facing thread state exposes only: topic, subject, status,
// foreshadowAllowed, spoilerLevel. It never exposes the payoff beat
// or any future fact.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  BEAT_KIND, CASTER_SCHEMA_VERSION, THREAD_STATUS, validateNarrativeThread
} from './schemas.mjs';
import { PACING_BAND, pacingBand } from './importance.mjs';

const ADVANCED_FAMILIES = new Set(['royal-marriage', 'super', 'rank10', 'ultra', 'voltage']);

/**
 * Build a deterministic narrative thread registry from the full beat
 * sequence. Threads are created for:
 *   - advanced mechanic declarations (setup → later resolution)
 *   - close decision margins (tension thread)
 *   - threshold approach (match-point thread)
 *
 * Each thread records a PRIVATE payoffBeatId (the beat where the
 * thread pays off or resolves). This is commentator-private and must
 * never be surfaced to the viewer payload.
 *
 * @param {Array} beats - full CasterBeat sequence
 * @returns {Array} validated NarrativeThread objects (with private fields)
 */
export function buildThreadRegistry(beats) {
  if (!Array.isArray(beats)) return [];
  const threads = [];

  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i];
    if (beat.beatKind !== BEAT_KIND.DECISION && beat.beatKind !== BEAT_KIND.RESPONSE) continue;
    const family = beat.action?.family;
    const mode = beat.action?.mode;

    // Advanced mechanic setup thread.
    if ((family && ADVANCED_FAMILIES.has(family)) || (mode && ADVANCED_FAMILIES.has(mode))) {
      const payoff = findPayoff(beats, i, family ?? mode);
      threads.push(makeThread({
        beats, createdAt: i, topic: 'advanced-mechanic',
        subject: family ?? mode, payoffIndex: payoff,
        foreshadowAllowed: true
      }));
    }

    // Close-decision tension thread.
    const margin = beat.decision?.selectionMargin;
    if (Number.isFinite(margin) && margin <= 5 && beat.decision?.legalActionCount > 1) {
      const payoff = findNextScoreChange(beats, i);
      threads.push(makeThread({
        beats, createdAt: i, topic: 'close-decision',
        subject: `margin-${Math.round(margin)}`, payoffIndex: payoff,
        foreshadowAllowed: true
      }));
    }
  }

  return threads;
}

/**
 * Return viewer-safe thread state at a given beat index.
 * Threads not yet created are excluded. Threads whose payoff has
 * passed are marked PAID_OFF. The returned objects OMIT payoffBeatId
 * and any future-only field — those remain commentator-private.
 *
 * @param {Array} threads - full registry (with private fields)
 * @param {number} beatIndex - current playback position
 * @returns {Array} viewer-safe thread summaries
 */
export function viewerThreadState(threads, beatIndex) {
  const out = [];
  for (const t of threads) {
    if (t._createdAtIndex > beatIndex) continue; // not yet created
    const paidOff = t._payoffIndex != null && beatIndex >= t._payoffIndex;
    const status = paidOff ? THREAD_STATUS.PAID_OFF : THREAD_STATUS.OPEN;
    const { normalized } = validateNarrativeThread({
      schemaVersion: CASTER_SCHEMA_VERSION,
      threadId: t.threadId,
      createdAtBeat: t.createdAtBeat,
      topic: t.topic,
      subject: t.subject,
      status,
      foreshadowAllowed: t.foreshadowAllowed,
      spoilerLevel: 'NONE'
      // payoffBeatId intentionally omitted — private
    });
    out.push(normalized);
  }
  return out;
}

/**
 * Return commentator-private thread state at a given beat index.
 * Includes payoffBeatId and future planning hints. This object is
 * fed ONLY to the commentary planner's FUTURE channel and must never
 * appear in the viewer-facing payload.
 */
export function privateThreadState(threads, beatIndex, beats) {
  const out = [];
  for (const t of threads) {
    if (t._createdAtIndex > beatIndex) continue;
    const paidOff = t._payoffIndex != null && beatIndex >= t._payoffIndex;
    out.push({
      threadId: t.threadId,
      topic: t.topic,
      subject: t.subject,
      status: paidOff ? THREAD_STATUS.PAID_OFF : THREAD_STATUS.OPEN,
      createdAtBeat: t.createdAtBeat,
      payoffBeatId: t.payoffBeatId ?? null,
      payoffImportance: t._payoffIndex != null && beats[t._payoffIndex]
        ? beats[t._payoffIndex].importance : null,
      foreshadowAllowed: t.foreshadowAllowed,
      spoilerLevel: 'NONE',
      visibleToViewer: false
    });
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────

function makeThread({ beats, createdAt, topic, subject, payoffIndex, foreshadowAllowed }) {
  const threadId = `NT-${hashCanonical({ matchId: beats[0]?.matchId, createdAt, topic, subject }).slice(0, 14)}`;
  return {
    threadId,
    createdAtBeat: beats[createdAt]?.beatId ?? null,
    topic,
    subject,
    foreshadowAllowed: foreshadowAllowed !== false,
    payoffBeatId: payoffIndex != null ? (beats[payoffIndex]?.beatId ?? null) : null,
    _createdAtIndex: createdAt,
    _payoffIndex: payoffIndex ?? null
  };
}

/** Find the next beat where the same mechanic family resolves or scores. */
function findPayoff(beats, fromIndex, family) {
  for (let i = fromIndex + 1; i < beats.length; i += 1) {
    const b = beats[i];
    if (b.beatKind === BEAT_KIND.MATCH_END) return i;
    if ((b.publicSummary?.scoreDelta ?? 0) !== 0) return i;
    if (b.action?.family === family || b.action?.mode === family) return i;
    if (pacingBand(b.importance) === PACING_BAND.HIGHLIGHT) return i;
  }
  return null;
}

/** Find the next beat where a score changes. */
function findNextScoreChange(beats, fromIndex) {
  for (let i = fromIndex + 1; i < beats.length; i += 1) {
    if ((beats[i].publicSummary?.scoreDelta ?? 0) !== 0) return i;
    if (beats[i].beatKind === BEAT_KIND.MATCH_END) return i;
  }
  return null;
}
