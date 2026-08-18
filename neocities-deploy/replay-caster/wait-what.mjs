// ═══════════════════════════════════════════════════════════════
// wait-what.mjs — One-click investigation envelope capture.
//
// Pressing "WAIT WHAT?" bookmarks the exact playback context so a
// developer can jump back to the referenced decision/checkpoint/
// evidence without manually reconstructing it.
//
// Capture contract (spec §10):
//   - deterministic where derived from replay
//   - locally inspectable
//   - jumpable back to the referenced replay position
//   - safely serializable
//   - free from unauthorized hidden information per active viewer mode
//
// Future beats are included ONLY under an explicitly authorized
// OMNISCIENT/DEV viewer mode. Otherwise they are redacted.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  CASTER_SCHEMA_VERSION, VIEWER_MODE, validateWaitWhatCapture
} from './schemas.mjs';

const CONTEXT_RADIUS = 10;

/**
 * Build a WAIT WHAT capture envelope at the current playback position.
 *
 * @param {object} ctx
 * @param {Array} ctx.beats - full beat sequence
 * @param {number} ctx.beatIndex - current beat index
 * @param {object} ctx.session - CasterSession envelope (matchId, replayHash, etc.)
 * @param {Array} [ctx.diagnostics] - diagnostic registry
 * @param {string|null} [ctx.commentary] - current commentary text
 * @param {number} [ctx.playbackTime] - presentation-only playback time
 * @param {object} [ctx.decisionTrace] - decision trace for the current beat (if any)
 * @returns {object} validated WaitWhatCapture
 */
export function captureWaitWhat(ctx) {
  const { beats, beatIndex, session, diagnostics = [], commentary = null, playbackTime = 0, decisionTrace = null } = ctx;
  const beat = beats[beatIndex] ?? null;
  const viewerMode = session?.viewerMode ?? VIEWER_MODE.PUBLIC;
  const omniscient = viewerMode === VIEWER_MODE.OMNISCIENT;

  const before = beats.slice(Math.max(0, beatIndex - CONTEXT_RADIUS), beatIndex);
  // Future context: redact unless explicitly omniscient/dev.
  const afterRaw = beats.slice(beatIndex + 1, beatIndex + 1 + CONTEXT_RADIUS);
  const after = omniscient ? afterRaw : afterRaw.map(redactBeat);

  const capture = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    captureId: `WW-${hashCanonical({ matchId: session?.matchId, beatId: beat?.beatId, beatIndex }).slice(0, 16)}`,
    createdAt: new Date().toISOString(),
    matchId: session?.matchId ?? null,
    replayId: session?.replayHash ?? null,
    casterBeatId: beat?.beatId ?? null,
    decisionId: beat?.decisionId ?? null,
    checkpointHash: beat?.checkpointHashAfter ?? beat?.checkpointHashBefore ?? null,
    playbackTime,
    policyIds: session?.policyIds ?? [],
    engineVersion: session?.engineVersion ?? null,
    rulesVersion: session?.rulesVersion ?? null,
    profileId: session?.profileId ?? null,
    viewerMode,
    selectedAction: beat?.action ?? null,
    legalOptions: beat?.decision?.legalActionCount != null
      ? [{ count: beat.decision.legalActionCount }]
      : [],
    decisionTrace: omniscient ? (decisionTrace ?? null) : redactTrace(decisionTrace),
    diagnostics: diagnostics.filter(d => d.beatId === beat?.beatId),
    commentary,
    contextBefore: before.map(viewerSafeBeatSummary),
    contextAfter: after.map(viewerSafeBeatSummary),
    redacted: !omniscient
  };

  const { normalized, errors } = validateWaitWhatCapture(capture);
  // Attach any validation errors as a non-fatal field for inspection.
  if (errors.length) normalized._validationErrors = errors;
  return normalized;
}

// ── Redaction helpers ─────────────────────────────────────────────

function redactBeat(beat) {
  if (!beat) return null;
  return {
    beatId: beat.beatId,
    sequence: beat.sequence,
    beatKind: beat.beatKind,
    redacted: true,
    publicSummary: { scores: beat.publicSummary?.scores ?? {} }
  };
}

function redactTrace(trace) {
  if (!trace) return null;
  // Keep only the decision id and authorized-context hash; drop private fields.
  return {
    decisionId: trace.decisionId ?? null,
    authorizedContextHash: trace.authorizedContextHash ?? null,
    redacted: true
  };
}

function viewerSafeBeatSummary(beat) {
  if (!beat) return null;
  return {
    beatId: beat.beatId,
    sequence: beat.sequence,
    beatKind: beat.beatKind,
    seat: beat.seat,
    turn: beat.turn,
    action: beat.action,
    decision: beat.decision,
    publicSummary: beat.publicSummary,
    importance: beat.importance,
    redacted: beat.redacted === true
  };
}
