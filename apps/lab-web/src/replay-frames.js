// ═══════════════════════════════════════════════════════════════
// replay-frames.js — Shared certified-replay frame reconstruction
//
// Certified replay envelopes (format "intrilex-replay", version 2) store
// `initialState` + `commands` + `events` + `checkpoints` but NOT a
// pre-computed `frames` array. The Watch workspace and other replay
// viewers consume a `frames` array where each entry is
//   { state, events, command, commandIndex, accepted }.
//
// This module reconstructs that frames array by re-executing each command
// against the engine, producing the same deterministic state trajectory.
//
// FULL-MATCH WATCH CONTRACT (replay-contract.mjs):
//   ensureReplayFrames() never silently accepts a non-canonical frames
//   array. Canonical means exactly commands.length + 1 aligned frames.
//   Incomplete frame arrays are rebuilt from the command stream when the
//   commands are executable and a real (non-redacted) initialState exists;
//   when a recorded finalStateHash exists the reconstruction is verified
//   against it. Anything that cannot be proven canonical is flagged on
//   replay._frameIntegrity instead of being presented as complete.
// ═══════════════════════════════════════════════════════════════

import { analyzeFrames, FRAME_INTEGRITY } from './replay-contract.mjs';

/**
 * Reconstruct a frames array from a certified replay envelope.
 *
 * Each frame is { state, events, command, commandIndex, accepted }.
 * Frame 0 is the initial state (commandIndex -1, no command).
 *
 * @param {object} certifiedReplay - Certified replay envelope with
 *   `initialState` and `commands` fields.
 * @param {object} [deps]
 * @param {object} [deps.engineModule] - Injected engine module (tests);
 *   defaults to the bundled './engine/browser-entry.js'.
 * @returns {Promise<Array<{state: object, events: Array, command: object|null, commandIndex: number, frameIndex: number, accepted: boolean|null}>>}
 */
export async function reconstructReplayFrames(certifiedReplay, deps = {}) {
  if (!certifiedReplay || !certifiedReplay.initialState || !Array.isArray(certifiedReplay.commands)) {
    return [];
  }
  const engineModule = deps.engineModule ?? await import('./engine/browser-entry.js');
  const engine = new engineModule.IntrilexEngine();
  let state = structuredClone(certifiedReplay.initialState);
  const frames = [{ state, events: [], command: null, commandIndex: -1, frameIndex: 0, accepted: null }];
  for (const [index, command] of certifiedReplay.commands.entries()) {
    const result = engine.execute(state, command);
    state = result.state;
    frames.push({ state, events: result.events, command, commandIndex: index, frameIndex: index + 1, accepted: result.accepted });
  }
  return frames;
}

/**
 * True when the recorded initial state is privacy-redacted (opaque card
 * identities). Re-executing commands against a redacted start diverges —
 * the resulting states would be fabricated, not evidence. Public certified
 * envelopes (format 'intrilex-public-replay') are structurally
 * non-re-executable for this reason; their Watchable counterpart is the
 * frame-embedded artifact (autonomy/lab-replays).
 */
export function hasRedactedInitialState(replay) {
  const cards = replay?.initialState?.cards;
  if (!cards || typeof cards !== 'object') return false;
  return Object.values(cards).some(c => String(c?.id ?? '').startsWith('OPAQUE-HIDDEN') || c?.identity === 'HIDDEN');
}

async function loadEngineModule(deps) {
  return deps.engineModule ?? await import('./engine/browser-entry.js');
}

/**
 * Verify a reconstructed trajectory against the envelope's recorded
 * finalStateHash when one exists. Returns a FRAME_INTEGRITY value.
 */
async function verifyReconstruction(replay, frames, deps) {
  if (!replay?.finalStateHash) return FRAME_INTEGRITY.RECONSTRUCTED;
  try {
    const engineModule = await loadEngineModule(deps);
    const finalFrame = frames[frames.length - 1];
    if (!finalFrame?.state || typeof engineModule.hashCanonical !== 'function') {
      return FRAME_INTEGRITY.RECONSTRUCTED;
    }
    return engineModule.hashCanonical(finalFrame.state) === replay.finalStateHash
      ? FRAME_INTEGRITY.VERIFIED
      : FRAME_INTEGRITY.DIVERGED;
  } catch {
    // Hash verification unavailable — report honestly as unverified.
    return FRAME_INTEGRITY.RECONSTRUCTED;
  }
}

/**
 * Reconstruct frames and attach them to a replay object in-place.
 *
 * Contract (see module header):
 *   - canonical embedded frames → kept as-is (integrity 'embedded')
 *   - missing/incomplete/misaligned frames + executable commands + real
 *     initialState → rebuilt to the canonical commands.length + 1 sequence,
 *     then verified against finalStateHash when the envelope records one
 *   - redacted initial state → reconstruction would fabricate state, so the
 *     artifact is flagged 'unreconstructable' rather than replayed wrongly
 *   - non-canonical frames that cannot be rebuilt → kept (they are real
 *     recorded evidence) and flagged 'partial'; the classifier surfaces
 *     PARTIAL_REPLAY instead of pretending completeness
 *
 * Side effects on `replay`:
 *   replay._frameAnalysis  — analyzeFrames() structural report
 *   replay._frameIntegrity — FRAME_INTEGRITY value
 *
 * @param {object} replay - Replay object to augment with `frames`.
 * @param {object} [deps] - { engineModule } injection point for Node tests.
 * @returns {Promise<object>} The same replay object (for chaining).
 */
export async function ensureReplayFrames(replay, deps = {}) {
  if (!replay) return replay;
  const analysis = analyzeFrames(replay);
  replay._frameAnalysis = analysis;

  if (analysis.status === 'canonical') {
    replay._frameIntegrity ??= FRAME_INTEGRITY.EMBEDDED;
    return replay;
  }

  const reconstructable = Boolean(replay.initialState) && analysis.executable
    && !hasRedactedInitialState(replay);

  if (reconstructable) {
    try {
      const reconstructed = await reconstructReplayFrames(replay, deps);
      if (reconstructed.length === analysis.expected) {
        replay.frames = reconstructed;
        replay._frameAnalysis = { ...analysis, actual: reconstructed.length, status: 'canonical', reason: `Reconstructed canonical frame sequence: ${reconstructed.length} frames for ${analysis.commandCount} commands.` };
        replay._frameIntegrity = await verifyReconstruction(replay, reconstructed, deps);
        if (replay._frameIntegrity === FRAME_INTEGRITY.DIVERGED) {
          // The command stream does not reproduce the recorded terminal
          // state — serving these states would fabricate history. Keep any
          // embedded frames that existed; the classifier reports PARTIAL.
          replay._frameAnalysis = { ...analysis, status: 'diverged', reason: 'Reconstructed trajectory diverges from the recorded finalStateHash.' };
          if (analysis.actual === 0) replay.frames = [];
        }
        return replay;
      }
    } catch {
      // Reconstruction threw — fall through to honest partial reporting.
    }
  }

  const frames = Array.isArray(replay.frames) ? replay.frames : [];
  if (frames.length > 0) {
    replay._frameIntegrity = FRAME_INTEGRITY.PARTIAL;
    if (analysis.status === 'unverifiable' || analysis.status === 'misaligned') {
      // Length checks out (or no command stream to check against) but
      // canonicality is unproven — embedded evidence stays usable.
      replay._frameIntegrity = analysis.status === 'unverifiable' ? FRAME_INTEGRITY.EMBEDDED : FRAME_INTEGRITY.PARTIAL;
    }
  } else {
    replay._frameIntegrity = hasRedactedInitialState(replay)
      ? FRAME_INTEGRITY.UNRECONSTRUCTABLE
      : (analysis.executable ? FRAME_INTEGRITY.PARTIAL : FRAME_INTEGRITY.UNRECONSTRUCTABLE);
    if (hasRedactedInitialState(replay)) {
      replay._frameAnalysis = { ...analysis, reason: 'Initial state is privacy-redacted — command replay cannot faithfully reconstruct it.' };
    }
    replay.frames = frames;
  }
  return replay;
}
