// ═══════════════════════════════════════════════════════════════
// auth-controller.js — Browser auth controller interface
//
// Coordinates Supabase auth state with the network session.
// Provides a clean interface for the UI layer — no Supabase details
// leak into UI components.
//
// State machine:
//   UNCONFIGURED → SIGNED_OUT → ANONYMOUS / AUTHENTICATED
//                              ↕ (link account)
//                              LINKING
//
// The controller emits state changes via subscribe().
//
// Guest migration detection:
//   When a guest (ANONYMOUS) links their Discord account, the auth state
//   transitions ANONYMOUS → AUTHENTICATED. The controller saves the guest
//   identity before the OAuth redirect and exposes a "migration pending"
//   flag so the migration-controller can transfer local achievements.
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js';

/**
 * @typedef {'UNCONFIGURED'|'SIGNED_OUT'|'ANONYMOUS'|'AUTHENTICATED'|'LINKING'} AuthState
 */

/** localStorage key for the guest identity saved before OAuth redirect */
const GUEST_IDENTITY_KEY = 'intrilex:guest-identity';

/** @type {AuthState} */
let _state = 'UNCONFIGURED';
let _session = null;       // Supabase session (access_token, user, etc.)
let _profile = null;       // Safe public profile
let _migrationPending = false;  // True when guest→permanent migration is needed
let _guestIdentity = null;      // Saved guest UUID for migration (read from localStorage)
const _subscribers = new Set();

/**
 * Initialize the auth controller — call once on app startup.
 * Reads the current Supabase session and subscribes to changes.
 * @returns {Promise<AuthState>}
 */
export async function initAuth() {
  if (!isSupabaseConfigured()) {
    setState('UNCONFIGURED');
    return _state;
  }
  const client = getSupabaseClient();
  if (!client) {
    setState('UNCONFIGURED');
    return _state;
  }

  try {
    // Read existing session
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      _session = session;
      _profile = deriveProfile(session.user);
      setState(session.user?.is_anonymous ? 'ANONYMOUS' : 'AUTHENTICATED');
    } else {
      setState('SIGNED_OUT');
    }

    // Subscribe to future changes
    client.auth.onAuthStateChange((_event, newSession) => {
      const wasAnonymous = _state === 'ANONYMOUS';
      _session = newSession;
      if (!newSession) {
        _profile = null;
        setState('SIGNED_OUT');
      } else {
        _profile = deriveProfile(newSession.user);
        const nowAuthenticated = !newSession.user?.is_anonymous;
        // Detect ANONYMOUS→AUTHENTICATED transition (guest linked Discord)
        if (wasAnonymous && nowAuthenticated) {
          _guestIdentity = _readGuestIdentity();
          if (_guestIdentity && _guestIdentity !== newSession.user.id) {
            _migrationPending = true;
          }
        }
        setState(nowAuthenticated ? 'AUTHENTICATED' : 'ANONYMOUS');
      }
    });
  } catch (err) {
    // Network error, CSP block, or Supabase unreachable — degrade gracefully
    // to SIGNED_OUT so the UI still renders sign-in options.
    console.warn('[auth] initAuth failed, degrading to SIGNED_OUT:', err?.message ?? err);
    setState('SIGNED_OUT');
  }

  return _state;
}

/**
 * Sign in anonymously (guest account with limited capabilities).
 * @returns {Promise<boolean>}
 */
export async function signInAnonymously() {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.auth.signInAnonymously();
  return !error;
}

/**
 * Sign in with Discord OAuth.
 * Redirects the browser to Discord's consent screen.
 * @param {string} [redirectPath] - Path to return to after OAuth callback
 * @returns {Promise<boolean>}
 */
export async function signInWithDiscord(redirectPath = '/play/online') {
  return signInWithOAuthProvider('discord', redirectPath);
}

/**
 * Sign in with Google OAuth.
 * Redirects the browser to Google's consent screen.
 * @param {string} [redirectPath] - Path to return to after OAuth callback
 * @returns {Promise<boolean>}
 */
export async function signInWithGoogle(redirectPath = '/play/online') {
  return signInWithOAuthProvider('google', redirectPath);
}

/**
 * Internal: sign in with a given OAuth provider.
 * Saves the guest identity before the redirect so the migration
 * controller can detect the ANONYMOUS→AUTHENTICATED transition.
 * @param {'discord'|'google'} provider
 * @param {string} redirectPath
 * @returns {Promise<boolean>}
 */
async function signInWithOAuthProvider(provider, redirectPath) {
  const client = getSupabaseClient();
  if (!client) return false;

  // If currently anonymous, save the guest identity so the migration
  // controller can detect the ANONYMOUS→AUTHENTICATED transition after
  // the OAuth redirect returns.
  if (_state === 'ANONYMOUS' && _session?.user?.id) {
    try {
      localStorage.setItem(GUEST_IDENTITY_KEY, _session.user.id);
    } catch {
      // localStorage may be unavailable — migration won't trigger, but auth still works
    }
  }

  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + redirectPath },
  });
  return !error;
}

/**
 * Sign out the current session.
 * @returns {Promise<boolean>}
 */
export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.auth.signOut();
  if (!error) {
    _session = null;
    _profile = null;
    setState('SIGNED_OUT');
  }
  return !error;
}

/**
 * Get the current access token for WebSocket authentication.
 * Returns null when not authenticated.
 * @returns {string | null}
 */
export function getAccessToken() {
  return _session?.access_token ?? null;
}

/**
 * Get the current safe public profile.
 * @returns {{ publicPlayerId: string, displayName: string, handle: string|null, avatarUrl: string|null, isAnonymous: boolean, provider: string|null } | null}
 */
export function getProfile() {
  return _profile;
}

/**
 * Get the current auth state.
 * @returns {AuthState}
 */
export function getAuthState() {
  return _state;
}

/**
 * Check if a guest→permanent migration is pending.
 * True when the auth state transitioned ANONYMOUS→AUTHENTICATED and a
 * guest identity was saved before the OAuth redirect.
 * @returns {boolean}
 */
export function isMigrationPending() {
  return _migrationPending;
}

/**
 * Get the saved guest identity (for migration).
 * Returns the guest UUID or null if no migration is pending.
 * @returns {string|null}
 */
export function getGuestIdentity() {
  return _guestIdentity;
}

/**
 * Get the current authenticated account ID.
 * @returns {string|null}
 */
export function getAccountId() {
  return _session?.user?.id ?? null;
}

/**
 * Clear the migration pending state.
 * Called by the migration controller after migration completes or fails.
 */
export function clearMigrationPending() {
  _migrationPending = false;
  _guestIdentity = null;
  _clearGuestIdentity();
}

/**
 * Subscribe to auth state changes.
 * @param {(state: AuthState, profile: object|null) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribe(callback) {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
}

// ── Internal helpers ──

function setState(newState) {
  if (_state === newState) return;
  _state = newState;
  for (const cb of _subscribers) {
    try { cb(_state, _profile); } catch { /* subscriber error — ignore */ }
  }
}

function deriveProfile(user) {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const appMeta = user.app_metadata ?? {};
  // Supabase exposes the OAuth provider on app_metadata.provider
  // (e.g. 'discord', 'google'). Fall back to the first identity provider.
  const provider = appMeta.provider
    ?? user.identities?.[0]?.provider
    ?? null;
  return {
    publicPlayerId: meta.public_player_id ?? `PLY_${(user.id ?? '').slice(0, 12)}`,
    displayName: meta.display_name ?? meta.user_name ?? 'Player',
    handle: meta.handle ?? null,
    avatarUrl: meta.avatar_url ?? null,
    isAnonymous: Boolean(user.is_anonymous),
    provider,
  };
}

/**
 * Read the saved guest identity from localStorage.
 * @returns {string|null}
 */
function _readGuestIdentity() {
  try {
    return localStorage.getItem(GUEST_IDENTITY_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear the saved guest identity from localStorage.
 */
function _clearGuestIdentity() {
  try {
    localStorage.removeItem(GUEST_IDENTITY_KEY);
  } catch {
    // Ignore — localStorage may be unavailable
  }
}
