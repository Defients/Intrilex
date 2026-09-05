// ═══════════════════════════════════════════════════════════════
// account-store.js — Browser-side account state store
//
// Thin reactive store for account/profile state. UI components
// subscribe to changes and re-render when the account state updates.
//
// This is intentionally minimal — no Redux, no external state library.
// The auth-controller drives state changes; this store just broadcasts.
// ═══════════════════════════════════════════════════════════════

import { subscribe as subscribeToAuth, getAuthState, getProfile } from './auth-controller.js?v=75c53031ef21';

/**
 * @typedef {Object} AccountState
 * @property {string} authState - Current auth state
 * @property {object|null} profile - Safe public profile
 * @property {boolean} isConfigured - Whether Supabase is configured
 */

/** @type {AccountState} */
let _state = {
  authState: 'UNCONFIGURED',
  profile: null,
  isConfigured: false,
};

const _listeners = new Set();

/**
 * Initialize the account store and sync with auth-controller.
 * Call once on app startup (after initAuth).
 * @returns {AccountState}
 */
export function initAccountStore() {
  _state = {
    authState: getAuthState(),
    profile: getProfile(),
    isConfigured: getAuthState() !== 'UNCONFIGURED',
  };
  // Sync future changes
  subscribeToAuth((authState, profile) => {
    _state = { authState, profile, isConfigured: authState !== 'UNCONFIGURED' };
    notify();
  });
  return _state;
}

/**
 * Get the current account state.
 * @returns {AccountState}
 */
export function getAccountState() {
  return _state;
}

/**
 * Subscribe to account state changes.
 * @param {(state: AccountState) => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/**
 * Check if the current account is anonymous (guest).
 * @returns {boolean}
 */
export function isAnonymous() {
  return _state.authState === 'ANONYMOUS';
}

/**
 * Check if the user is authenticated with a permanent account.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return _state.authState === 'AUTHENTICATED';
}

function notify() {
  for (const listener of _listeners) {
    try { listener(_state); } catch { /* listener error — ignore */ }
  }
}
