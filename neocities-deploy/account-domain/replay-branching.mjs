// ═══════════════════════════════════════════════════════════════
// replay-branching.mjs — Player replay branching (pure domain)
//
// Extends counterfactual analysis to player replays. Extracts
// checkpoint metadata from a stored replay (commands + contentHash)
// so the existing /branches workspace can offer alternate-line
// exploration for human matches, not just AI campaigns.
//
// A "checkpoint" is a command index in the replay's command log.
// At each checkpoint, the player can explore "what if I had played
// a different action here?" — the counterfactual engine replays
// from that point with an alternative action.
//
// This module is PURE: no I/O, no DB, no UI. It validates replay
// structure and extracts checkpoint metadata.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ReplayCheckpoint
 * @property {number} index - 0-based command index
 * @property {string} commandId - The command at this index
 * @property {string} label - Human-readable label for the checkpoint
 * @property {boolean} isDecision - True if this is a player decision point
 */

/**
 * @typedef {Object} ReplayBranchSummary
 * @property {string} replayId
 * @property {string} contentHash
 * @property {number} commandCount
 * @property {ReplayCheckpoint[]} checkpoints - Decision points only
 * @property {boolean} supported - Whether counterfactual analysis is supported
 * @property {string|null} unsupportedReason - Reason if not supported
 */

/**
 * Check if a replay supports counterfactual branching.
 * Mirrors the logic in counterfactual.mjs::isCounterfactualSupported
 * but works with the player replay format from IndexedDB.
 *
 * @param {Object} replay - The stored replay record
 * @returns {{ supported: boolean, reason: string|null }}
 */
export function isPlayerReplayBranchable(replay) {
  if (!replay) return { supported: false, reason: 'NO_REPLAY' };
  if (!replay.commands || !Array.isArray(replay.commands)) {
    return { supported: false, reason: 'NO_COMMANDS' };
  }
  if (replay.commands.length === 0) {
    return { supported: false, reason: 'EMPTY_REPLAY' };
  }
  if (!replay.contentHash || typeof replay.contentHash !== 'string') {
    return { supported: false, reason: 'NO_CONTENT_HASH' };
  }
  return { supported: true, reason: null };
}

/**
 * Extract decision-point checkpoints from a player replay.
 * A "decision point" is a command where the player had a choice
 * (i.e., not a system event or forced action).
 *
 * The replay command format is: { actionId, seat, turn, phase, ... }
 * We filter to commands that are player-initiated actions.
 *
 * @param {Object} replay - The stored replay record
 * @param {Object} [opts]
 * @param {number} [opts.maxCheckpoints=50] - Maximum checkpoints to return
 * @param {number} [opts.humanSeat=1] - Which seat is the human player
 * @returns {ReplayCheckpoint[]}
 */
export function extractReplayCheckpoints(replay, opts = {}) {
  const maxCheckpoints = Math.min(Math.max(opts.maxCheckpoints ?? 50, 1), 200);
  const humanSeat = opts.humanSeat ?? 1;

  if (!replay || !Array.isArray(replay.commands)) return [];

  const checkpoints = [];
  for (let i = 0; i < replay.commands.length && checkpoints.length < maxCheckpoints; i++) {
    const cmd = replay.commands[i];
    if (!cmd) continue;
    // Only include commands from the human player's seat
    if (cmd.seat !== undefined && cmd.seat !== humanSeat) continue;
    // Skip system events (no actionId or actionId starts with SYS_)
    if (!cmd.actionId || String(cmd.actionId).startsWith('SYS_')) continue;
    // Skip non-decision phases (e.g., SETUP, CLEANUP)
    if (cmd.phase && ['SETUP', 'CLEANUP', 'END'].includes(cmd.phase)) continue;

    checkpoints.push({
      index: i,
      commandId: String(cmd.actionId),
      label: formatCheckpointLabel(cmd, i),
      isDecision: true,
    });
  }
  return checkpoints;
}

/**
 * Format a human-readable label for a checkpoint.
 * @param {Object} cmd - The command at this checkpoint
 * @param {number} index - The checkpoint index
 * @returns {string}
 */
function formatCheckpointLabel(cmd, index) {
  const parts = [];
  if (cmd.turn != null) parts.push(`T${cmd.turn}`);
  if (cmd.phase) parts.push(cmd.phase);
  parts.push(cmd.actionId ?? `#${index}`);
  return parts.join(' · ');
}

/**
 * Build a complete branch summary for a player replay.
 * @param {Object} replay - The stored replay record
 * @param {Object} [opts]
 * @param {number} [opts.maxCheckpoints]
 * @param {number} [opts.humanSeat]
 * @returns {ReplayBranchSummary}
 */
export function buildReplayBranchSummary(replay, opts = {}) {
  const { supported, reason } = isPlayerReplayBranchable(replay);
  const replayId = replay?.replayId ?? replay?.matchId ?? 'unknown';
  const contentHash = replay?.contentHash ?? '';
  const commandCount = replay?.commands?.length ?? 0;

  if (!supported) {
    return {
      replayId,
      contentHash,
      commandCount,
      checkpoints: [],
      supported: false,
      unsupportedReason: reason,
    };
  }

  const checkpoints = extractReplayCheckpoints(replay, opts);
  return {
    replayId,
    contentHash,
    commandCount,
    checkpoints,
    supported: true,
    unsupportedReason: null,
  };
}

/**
 * Select a subset of checkpoints for display — evenly distributed
 * across the replay to give a representative sample.
 * @param {ReplayCheckpoint[]} checkpoints
 * @param {number} count - Maximum number to return
 * @returns {ReplayCheckpoint[]}
 */
export function selectSampleCheckpoints(checkpoints, count = 10) {
  if (!checkpoints || checkpoints.length <= count) return checkpoints ?? [];
  const step = checkpoints.length / count;
  const sampled = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(i * step);
    sampled.push(checkpoints[idx]);
  }
  return sampled;
}
