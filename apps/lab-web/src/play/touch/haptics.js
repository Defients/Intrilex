// Haptic feedback controller for touch devices.
// Gates navigator.vibrate() behind the user's persisted `haptics` setting
// (see state.js SETTINGS_DEFAULTS). Dynamically imported by workspaces/settings.js
// so the rest of the app does not pay the cost on non-touch devices.

let _enabled = true;

/** @param {boolean} enabled */
export function setHapticsEnabled(enabled) {
  _enabled = !!enabled;
}

/**
 * Trigger a vibration pattern if haptics are enabled and the platform supports it.
 * @param {number | number[]} pattern - Milliseconds or pattern array for navigator.vibrate.
 * @returns {boolean} true if a vibration was actually issued.
 */
export function vibrate(pattern) {
  if (!_enabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}
