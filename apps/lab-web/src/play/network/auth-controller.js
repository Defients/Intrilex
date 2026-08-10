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
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js';

/**
 * @typedef {'UNCONFIGURED'|'SIGNED_OUT'|'ANONYMOUS'|'AUTHENTICATED'|'LINKING'} AuthState
 */

/** @type {AuthState} */
let _state = 'UNCONFIGURED';
let _session = null;       // Supabase session (access_token, user, etc.)
let _profile = null;       // Safe public profile
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
    _session = newSession;
    if (!newSession) {
      _profile = null;
      setState('SIGNED_OUT');
    } else {
      _profile = deriveProfile(newSession.user);
      setState(newSession.user?.is_anonymous ? 'ANONYMOUS' : 'AUTHENTICATED');
    }
  });

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
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'discord',
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
 * @returns {{ publicPlayerId: string, displayName: string, handle: string|null, avatarUrl: string|null, isAnonymous: boolean } | null}
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
  return {
    publicPlayerId: meta.public_player_id ?? `PLY_${(user.id ?? '').slice(0, 12)}`,
    displayName: meta.display_name ?? meta.user_name ?? 'Player',
    handle: meta.handle ?? null,
    avatarUrl: meta.avatar_url ?? null,
    isAnonymous: Boolean(user.is_anonymous),
  };
}
