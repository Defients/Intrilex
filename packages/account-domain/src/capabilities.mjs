// ═══════════════════════════════════════════════════════════════
// capabilities.mjs — Central capability model
//
// Defines what anonymous vs permanent accounts may do.
// Policy is centralized here — never scatter `if (!user.isAnonymous)`
// checks across 30 unrelated files.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} AccountCapabilities
 * @property {boolean} onlineCasual
 * @property {boolean} createPrivateDuel
 * @property {boolean} joinPrivateDuel
 * @property {boolean} spectate
 * @property {boolean} ranked
 * @property {boolean} publicLeaderboard
 * @property {boolean} persistentCloudProgress
 * @property {boolean} accountManagement
 */

/**
 * Capabilities for an anonymous (guest) Supabase user.
 *
 * Allowed:
 *   - private/casual online duels
 *   - create/join invite games
 *   - reconnect
 *   - basic online profile
 *
 * Not allowed:
 *   - Ranked
 *   - leaderboard placement
 *   - public competitive identity requiring permanence
 *   - account-level moderation appeals requiring permanent identity
 *
 * @returns {AccountCapabilities}
 */
export function anonymousCapabilities() {
  return Object.freeze({
    onlineCasual: true,
    createPrivateDuel: true,
    joinPrivateDuel: true,
    spectate: true,
    ranked: false,
    publicLeaderboard: false,
    persistentCloudProgress: false,
    accountManagement: false,
  });
}

/**
 * Capabilities for a permanent (Discord/email) Supabase user.
 *
 * Allowed:
 *   - casual
 *   - private
 *   - Ranked (when Ranked exists)
 *   - leaderboard
 *   - persistent account progress
 *   - account customization
 *
 * @returns {AccountCapabilities}
 */
export function permanentCapabilities() {
  return Object.freeze({
    onlineCasual: true,
    createPrivateDuel: true,
    joinPrivateDuel: true,
    spectate: true,
    ranked: true,
    publicLeaderboard: true,
    persistentCloudProgress: true,
    accountManagement: true,
  });
}

/**
 * Capabilities when auth is disabled (development mode).
 * Matches permanent capabilities to avoid friction in dev.
 * @returns {AccountCapabilities}
 */
export function devModeCapabilities() {
  return Object.freeze({
    onlineCasual: true,
    createPrivateDuel: true,
    joinPrivateDuel: true,
    spectate: true,
    ranked: false, // Ranked not active in dev-disabled mode
    publicLeaderboard: false,
    persistentCloudProgress: false,
    accountManagement: false,
  });
}

/**
 * Resolve capabilities for a verified identity.
 * @param {{ isAnonymous: boolean }} identity - Verified identity
 * @param {boolean} [authDisabled] - True when auth mode is disabled (dev)
 * @returns {AccountCapabilities}
 */
export function resolveCapabilities(identity, authDisabled = false) {
  if (authDisabled) return devModeCapabilities();
  if (identity?.isAnonymous) return anonymousCapabilities();
  return permanentCapabilities();
}

/**
 * Check if a capability set allows a specific action.
 * @param {AccountCapabilities} caps
 * @param {keyof AccountCapabilities} capability
 * @returns {boolean}
 */
export function can(caps, capability) {
  return Boolean(caps?.[capability]);
}

/**
 * Verify that a capability set allows a specific action, throwing if not.
 * @param {AccountCapabilities} caps
 * @param {keyof AccountCapabilities} capability
 * @param {string} [reason] - Reason code for the error
 * @returns {void}
 * @throws {{ code: string, message: string }} When capability is not allowed
 */
export function requireCapability(caps, capability, reason = 'AUTH_PERMANENT_ACCOUNT_REQUIRED') {
  if (!can(caps, capability)) {
    throw Object.assign(
      new Error(`Capability '${capability}' is not available for this account type`),
      { code: reason },
    );
  }
}
