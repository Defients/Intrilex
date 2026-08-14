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
// ═══════════════════════════════════════════════════════════════

/**
 * Reconstruct a frames array from a certified replay envelope.
 *
 * Each frame is { state, events, command, commandIndex, accepted }.
 * Frame 0 is the initial state (commandIndex -1, no command).
 *
 * @param {object} certifiedReplay - Certified replay envelope with
 *   `initialState` and `commands` fields.
 * @returns {Promise<Array<{state: object, events: Array, command: object|null, commandIndex: number, accepted: boolean|null}>>}
 */
export async function reconstructReplayFrames(certifiedReplay) {
  if (!certifiedReplay || !certifiedReplay.initialState || !Array.isArray(certifiedReplay.commands)) {
    return [];
  }
  const { IntrilexEngine } = await import('./engine/browser-entry.js?v=73b458295383');
  const engine = new IntrilexEngine();
  let state = structuredClone(certifiedReplay.initialState);
  const frames = [{ state, events: [], command: null, commandIndex: -1, accepted: null }];
  for (const [index, command] of certifiedReplay.commands.entries()) {
    const result = engine.execute(state, command);
    state = result.state;
    frames.push({ state, events: result.events, command, commandIndex: index, accepted: result.accepted });
  }
  return frames;
}

/**
 * Reconstruct frames and attach them to a replay object in-place.
 *
 * If the replay already has a `frames` array (e.g. authorized replays),
 * this is a no-op.
 *
 * @param {object} replay - Replay object to augment with `frames`.
 * @returns {Promise<object>} The same replay object (for chaining).
 */
export async function ensureReplayFrames(replay) {
  if (!replay) return replay;
  if (Array.isArray(replay.frames) && replay.frames.length > 0) return replay;
  replay.frames = await reconstructReplayFrames(replay);
  return replay;
}
