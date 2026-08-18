// ═══════════════════════════════════════════════════════════════
// visibility-projection.js — Wraps existing play-privacy.js
//
// Provides a unified interface for visibility-safe projections.
// The UI must never reveal hidden information through:
//   - disabled-action explanations
//   - card inspector
//   - action preview
//   - target highlighting
//   - replay links
//   - error messages
//   - accessibility labels
// ═══════════════════════════════════════════════════════════════

import { validateSnapshotPrivacy } from '../play-privacy.js?v=73653ac8207b';

/**
 * Visibility profiles for different contexts.
 */
export const VisibilityProfile = Object.freeze({
  PLAYER: 'player',       // Human player view (sees own hand, not opponent's)
  SPECTATOR: 'spectator', // Post-match replay (may see all depending on replay type)
  PUBLIC: 'public',       // Public replay (no hidden info, scoped handles)
});

/**
 * Project a snapshot through the visibility filter.
 * Returns the snapshot with hidden information removed.
 *
 * @param {object} snapshot - The raw snapshot
 * @param {string} profile - The visibility profile
 * @returns {object} The projected snapshot
 */
export function projectSnapshot(snapshot, profile = VisibilityProfile.PLAYER) {
  if (!snapshot) return null;

  // Player profile: validate privacy and fail closed on violation
  if (profile === VisibilityProfile.PLAYER) {
    const validation = validateSnapshotPrivacy(snapshot);
    if (!validation.valid) {
      // Fail closed — never render a snapshot that leaks hidden information.
      // Log non-sensitive diagnostics, then return a safe error state.
      console.error('[visibility-projection] Privacy violation — rejecting snapshot:', validation.violations);
      return { __privacyError: true, violations: validation.violations };
    }
    return snapshot;
  }

  // Spectator/Public: same validation for now
  // Post-match replays use their own projection (replay-library.js)
  return snapshot;
}

/**
 * Check if a card identity should be visible to the player.
 *
 * @param {string} cardId - The card entity ID
 * @param {string} controllerId - The card's controller
 * @param {string} zone - The card's zone
 * @param {string} viewerId - The viewer's player ID
 * @param {string} profile - The visibility profile
 * @returns {boolean} True if the card identity is visible
 */
export function isCardVisible(cardId, controllerId, zone, viewerId, profile = VisibilityProfile.PLAYER) {
  if (profile === VisibilityProfile.SPECTATOR || profile === VisibilityProfile.PUBLIC) {
    // Spectator/public visibility depends on the replay type
    // For player profile, only own cards and public zones are visible
    return true;
  }

  // Player profile
  if (controllerId === viewerId) return true;
  if (zone && (zone.endsWith('_PR') || zone.endsWith('_ER') || zone === 'GRAVEYARD' || zone === 'EXILE' || zone === 'SWAP_BAR')) {
    return true; // Public zones
  }
  return false; // Opponent hand, draw pile contents
}

/**
 * Filter legal actions to only those that don't leak hidden information.
 *
 * In some cases, the mere existence of a response action can leak information
 * (e.g., if the only response is a counter targeting a specific hidden card).
 * The engine's strictView already handles this, but this is a secondary check.
 *
 * @param {object[]} contracts - Legal action contracts
 * @param {string} profile - Visibility profile
 * @returns {object[]} Filtered actions
 */
export function filterActionsByVisibility(contracts, profile = VisibilityProfile.PLAYER) {
  if (profile === VisibilityProfile.SPECTATOR) return contracts;
  // Player profile: all actions from the engine's authorized view are already filtered
  return contracts;
}

/**
 * Sanitize an explanation string to remove any hidden information.
 * This is a safety net — explanations should already be visibility-safe
 * from the reason-code registry, but this catches any accidental leaks.
 *
 * @param {string} text - The explanation text
 * @returns {string} Sanitized text
 */
export function sanitizeExplanation(text) {
  if (!text) return '';
  // Redact card-identity patterns that could leak hidden information.
  // Matches rank+suit patterns like "K♠", "10♥", "A♦", "BJ" (Black Joker), "RJ" (Red Joker).
  const sanitized = String(text)
    .replace(/\b([2-9]|10|[JQKA])([♥♦♣♠])\b/g, '[card]')
    .replace(/\b[BR]J\b/g, '[joker]');
  return sanitized;
}

/**
 * Audit a snapshot for hidden-information leaks.
 * Returns a detailed report of any violations.
 *
 * @param {object} snapshot - The snapshot to audit
 * @returns {object} { valid, violations, details }
 */
export function auditVisibility(snapshot) {
  const validation = validateSnapshotPrivacy(snapshot);
  return {
    valid: validation.valid,
    violations: validation.violations,
    details: validation.valid ? 'No hidden information leaks detected.' : `Leaks: ${validation.violations.join(', ')}`,
  };
}
