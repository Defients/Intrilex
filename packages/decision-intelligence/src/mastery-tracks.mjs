// ═══════════════════════════════════════════════════════════════
// mastery-tracks.mjs — G2: Per-mechanic mastery tracks
//
// Pure functions that compute player mastery progress per mechanic
// from match history. Uses the mechanic registry to define tracks
// and evaluates player actions to track progression.
//
// Mastery tracks are:
//   - Mechanic-specific (scuttle, effect-3, effect-5, etc.)
//   - Tiered (Novice → Apprentice → Adept → Expert → Master)
//   - Progress-based (N uses of a mechanic to advance)
//   - Deterministic (same match history → same mastery)
// ═══════════════════════════════════════════════════════════════

import { MECHANIC_REGISTRY, analyticsEligibleMechanics } from './mechanic-registry.mjs';

/**
 * @typedef {Object} MasteryTier
 * @property {string} id - Tier identifier
 * @property {string} name - Display name
 * @property {number} threshold - Uses required to reach this tier
 * @property {string} description - Tier description
 */

/** Mastery tiers in ascending order */
export const MASTERY_TIERS = Object.freeze([
  { id: 'NOVICE', name: 'Novice', threshold: 0, description: 'Just starting to use this mechanic' },
  { id: 'APPRENTICE', name: 'Apprentice', threshold: 5, description: 'Beginning to understand the mechanic' },
  { id: 'ADEPT', name: 'Adept', threshold: 15, description: 'Comfortable using this mechanic in most situations' },
  { id: 'EXPERT', name: 'Expert', threshold: 40, description: 'Strategic use of this mechanic' },
  { id: 'MASTER', name: 'Master', threshold: 100, description: 'Deep mastery — uses this mechanic optimally' },
]);

/**
 * Get the mastery tier for a given number of uses.
 * @param {number} uses - Total times the mechanic has been used
 * @returns {MasteryTier}
 */
export function getMasteryTier(uses) {
  let tier = MASTERY_TIERS[0];
  for (const t of MASTERY_TIERS) {
    if (uses >= t.threshold) tier = t;
  }
  return tier;
}

/**
 * Get progress to the next mastery tier.
 * @param {number} uses
 * @returns {{ current: MasteryTier, next: MasteryTier|null, progress: number, remaining: number }}
 */
export function getMasteryProgress(uses) {
  const current = getMasteryTier(uses);
  const currentIdx = MASTERY_TIERS.indexOf(current);
  const next = currentIdx < MASTERY_TIERS.length - 1 ? MASTERY_TIERS[currentIdx + 1] : null;
  if (!next) {
    return { current, next: null, progress: 1, remaining: 0 };
  }
  const range = next.threshold - current.threshold;
  const progress = range > 0 ? (uses - current.threshold) / range : 1;
  return {
    current,
    next,
    progress: Math.min(1, Math.max(0, progress)),
    remaining: Math.max(0, next.threshold - uses),
  };
}

/**
 * @typedef {Object} MasteryTrack
 * @property {string} mechanicId
 * @property {string} mechanicName
 * @property {string} category
 * @property {number} uses
 * @property {MasteryTier} currentTier
 * @property {MasteryTier|null} nextTier
 * @property {number} progress - 0 to 1
 * @property {number} remaining - Uses until next tier
 */

/**
 * Compute mastery tracks from a mechanic usage summary.
 * @param {Record<string, number>} usageByMechanic - mechanicId → use count
 * @returns {MasteryTrack[]}
 */
export function computeMasteryTracks(usageByMechanic) {
  const eligible = analyticsEligibleMechanics();
  return eligible.map((def) => {
    const uses = usageByMechanic?.[def.mechanicId] ?? 0;
    const prog = getMasteryProgress(uses);
    return {
      mechanicId: def.mechanicId,
      mechanicName: def.displayName,
      category: def.category,
      uses,
      currentTier: prog.current,
      nextTier: prog.next,
      progress: prog.progress,
      remaining: prog.remaining,
    };
  });
}

/**
 * Get mastery tracks sorted by progress (most advanced first).
 * @param {Record<string, number>} usageByMechanic
 * @returns {MasteryTrack[]}
 */
export function getTopMasteryTracks(usageByMechanic, limit = 5) {
  return computeMasteryTracks(usageByMechanic)
    .sort((a, b) => b.uses - a.uses)
    .slice(0, limit);
}

/**
 * Render a mastery track as HTML.
 * @param {MasteryTrack} track
 * @returns {string}
 */
export function renderMasteryTrack(track) {
  if (!track) return '';
  const pct = Math.round(track.progress * 100);
  const tierLabel = track.currentTier.name;
  const nextLabel = track.nextTier ? ` → ${track.nextTier.name}` : ' (Max)';
  const remainingText = track.nextTier ? `${track.remaining} to go` : 'Mastered';
  return `<div class="mastery-track" data-testid="mastery-track" data-mechanic="${track.mechanicId}">
    <div class="mastery-track-header">
      <span class="mastery-track-name">${track.mechanicName}</span>
      <span class="mastery-track-tier" data-testid="mastery-tier">${tierLabel}${nextLabel}</span>
    </div>
    <div class="mastery-track-bar">
      <div class="mastery-track-fill" style="width:${pct}%" data-testid="mastery-fill"></div>
    </div>
    <div class="mastery-track-footer">
      <span class="mastery-track-uses">${track.uses} uses</span>
      <span class="mastery-track-remaining">${remainingText}</span>
    </div>
  </div>`;
}

/**
 * Render all mastery tracks as an HTML section.
 * @param {Record<string, number>} usageByMechanic
 * @param {number} [limit]
 * @returns {string}
 */
export function renderMasterySection(usageByMechanic, limit = 5) {
  const tracks = getTopMasteryTracks(usageByMechanic, limit);
  if (tracks.length === 0) return '';
  const trackHtml = tracks.map(renderMasteryTrack).join('');
  return `<div class="mastery-section" data-testid="mastery-section">
    <h3 class="mastery-section-title">Mechanic Mastery</h3>
    ${trackHtml}
  </div>`;
}

/**
 * Compute mechanic usage counts from an array of replay records.
 * Each replay must have a `commands` array (or `certifiedReplay.commands`).
 * Only commands from the human player are counted (playerId matches humanPlayerId).
 *
 * @param {Array<{commands?: Array, certifiedReplay?: {commands?: Array}, humanPlayerId?: string}>} replays
 * @returns {Record<string, number>} mechanicId → use count
 */
export function computeUsageFromReplays(replays) {
  const usage = {};
  if (!replays || !Array.isArray(replays)) return usage;
  for (const replay of replays) {
    const commands = replay.commands ?? replay.certifiedReplay?.commands;
    if (!commands || !Array.isArray(commands)) continue;
    const humanId = replay.humanPlayerId ?? 'P1';
    for (const cmd of commands) {
      if (cmd.playerId !== humanId) continue;
      const mechanicId = identifyMechanicFromCommand(cmd);
      if (mechanicId) {
        usage[mechanicId] = (usage[mechanicId] ?? 0) + 1;
      }
    }
  }
  return usage;
}

/**
 * Identify the mechanic from a replay command.
 * Uses the same logic as replay-lesson.mjs identifyMechanic.
 * @param {{action?: string, type?: string}} cmd
 * @returns {string|null}
 */
function identifyMechanicFromCommand(cmd) {
  const action = cmd.action ?? cmd.type ?? '';
  if (action.includes('scuttle')) return 'scuttle';
  if (action.includes('effect-three') || action === 'effect-3') return 'effect-three';
  if (action.includes('effect-four') || action === 'effect-4') return 'effect-four';
  if (action.includes('effect-five') || action === 'effect-5') return 'effect-five';
  if (action.includes('effect-six') || action === 'effect-6') return 'effect-six';
  if (action.includes('swap')) return 'swap-bar';
  if (action.includes('draw')) return 'draw';
  if (action.includes('play-for-points') || action.includes('score')) return 'play-for-points';
  return null;
}
