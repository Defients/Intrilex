// ═══════════════════════════════════════════════════════════════
// branch-reconstructor.mjs — Alternate-line frame reconstruction
//
// Reconstructs frames for a branch by:
// 1. Replaying the original commands up to the parent frame
// 2. Executing the alternate commands from that point forward
//
// This produces a frames array compatible with the Watch workspace,
// allowing side-by-side comparison of the original line vs the branch.
//
// The engine is lazy-loaded to keep the initial bundle small.
// ═══════════════════════════════════════════════════════════════

/**
 * Reconstruct frames for a branch (alternate line).
 *
 * @param {object} certifiedReplay - Original certified replay envelope
 * @param {number} parentFrameIndex - Frame index where the branch diverges
 * @param {object[]} alternateCommands - Commands to execute from the branch point
 * @returns {Promise<Array<{state: object, events: Array, command: object|null, commandIndex: number, frameIndex: number, accepted: boolean|null}>>}
 */
export async function reconstructBranchFrames(certifiedReplay, parentFrameIndex, alternateCommands) {
  if (!certifiedReplay || !certifiedReplay.initialState || !Array.isArray(certifiedReplay.commands)) {
    return [];
  }
  if (typeof parentFrameIndex !== 'number' || parentFrameIndex < 0) {
    return [];
  }
  if (!Array.isArray(alternateCommands)) {
    return [];
  }

  const { IntrilexEngine } = await import('../engine/browser-entry.js');
  const engine = new IntrilexEngine();

  // Step 1: Replay original commands up to parentFrameIndex
  let state = structuredClone(certifiedReplay.initialState);
  const frames = [{ state, events: [], command: null, commandIndex: -1, frameIndex: 0, accepted: null }];

  const originalCommands = certifiedReplay.commands.slice(0, parentFrameIndex);
  for (const [index, command] of originalCommands.entries()) {
    const result = engine.execute(state, command);
    state = result.state;
    frames.push({ state, events: result.events, command, commandIndex: index, frameIndex: index + 1, accepted: result.accepted });
  }

  // Step 2: Execute alternate commands from the branch point
  for (const [index, command] of alternateCommands.entries()) {
    const result = engine.execute(state, command);
    state = result.state;
    const cmdIndex = parentFrameIndex + index;
    frames.push({ state, events: result.events, command, commandIndex: cmdIndex, frameIndex: frames.length, accepted: result.accepted, isBranch: true });
  }

  return frames;
}

/**
 * Reconstruct a branch and return a branch object ready for attachment.
 *
 * @param {object} certifiedReplay
 * @param {number} parentFrameIndex
 * @param {object[]} alternateCommands
 * @returns {Promise<object[]>} Reconstructed frames
 */
export async function buildBranchFrames(certifiedReplay, parentFrameIndex, alternateCommands) {
  return reconstructBranchFrames(certifiedReplay, parentFrameIndex, alternateCommands);
}
