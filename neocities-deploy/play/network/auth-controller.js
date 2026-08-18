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

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js?v=73653ac8207b';

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
let _initialized = false;       // Guard: initAuth runs once
let _authUnsubscribe = null;    // Unsubscribe from Supabase onAuthStateChange
let _authEventSeq = 0;          // Monotonic sequence to reject stale fetchProfile results
let _signingOut = false;        // IRX-H28: Guard against auth callback race after signOut
let _tokenRefreshCallback = null; // IRX-H27: Called when access token is refreshed
const _subscribers = new Set();

/**
 * Initialize the auth controller — call once on app startup.
 * Reads the current Supabase session and subscribes to changes.
 * @returns {Promise<AuthState>}
 */
export async function initAuth() {
  // Re-entry guard: if initAuth was already called, return the current
  // state without subscribing again. Multiple subscriptions would cause
  // duplicate event handling and a memory leak.
  if (_initialized) return _state;
  _initialized = true;

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
      _profile = await fetchProfile(client, session.user);
      const isAnonymous = Boolean(session.user?.is_anonymous);
      // Detect guest→permanent migration on page load. OAuth redirects
      // reload the page, so the in-memory ANONYMOUS state is lost and the
      // onAuthStateChange handler's wasAnonymous check never fires. Check
      // the saved guest identity here so the migration controller can
      // transfer local achievements to the permanent account.
      if (!isAnonymous) {
        const savedGuestId = _readGuestIdentity();
        if (savedGuestId && savedGuestId !== session.user.id) {
          _guestIdentity = savedGuestId;
          _migrationPending = true;
        }
      }
      setState(isAnonymous ? 'ANONYMOUS' : 'AUTHENTICATED');
      // IRX-H36: After OAuth callback, navigate to the saved redirect path
      if (!isAnonymous) {
        try {
          const savedRedirect = sessionStorage.getItem('intrilex:oauth-redirect');
          if (savedRedirect) {
            sessionStorage.removeItem('intrilex:oauth-redirect');
            // Defer navigation to allow app to initialize first
            setTimeout(() => { if (location.hash !== '#' + savedRedirect) location.hash = '#' + savedRedirect; }, 100);
          }
        } catch { /* non-fatal */ }
      }
    } else {
      setState('SIGNED_OUT');
    }

    // Subscribe to future changes
    const { data: subscription } = client.auth.onAuthStateChange(async (_event, newSession) => {
      // IRX-H28: Guard against auth callback race resurrecting a signed-out profile.
      // If the user explicitly signed out, ignore any pending OAuth callbacks
      // that arrive within the sign-out grace window.
      if (_signingOut) {
        return;
      }
      const wasAnonymous = _state === 'ANONYMOUS';
      _session = newSession;
      if (!newSession) {
        _profile = null;
        setState('SIGNED_OUT');
        return;
      }
      // Monotonic sequence: if a newer auth event arrives while this
      // fetchProfile is in flight, discard the stale result so a slow
      // older fetch doesn't overwrite a fresher profile.
      const seq = ++_authEventSeq;
      const profile = await fetchProfile(client, newSession.user);
      if (seq === _authEventSeq) {
        _profile = profile;
      }
      const nowAuthenticated = !newSession.user?.is_anonymous;
      // IRX-H27: Notify registered callback when access token changes (refresh).
      // This keeps live network match sessions authenticated with the latest token.
      if (_tokenRefreshCallback && newSession?.access_token) {
        try { _tokenRefreshCallback(newSession.access_token); } catch { /* ignore callback errors */ }
      }
      // Detect ANONYMOUS→AUTHENTICATED transition (guest linked Discord)
      if (wasAnonymous && nowAuthenticated) {
        _guestIdentity = _readGuestIdentity();
        if (_guestIdentity && _guestIdentity !== newSession.user.id) {
          _migrationPending = true;
        }
      }
      setState(nowAuthenticated ? 'AUTHENTICATED' : 'ANONYMOUS');
    });
    // Capture unsubscribe for clean teardown (currently never called at
    // runtime, but prevents leaks if initAuth is ever reset for testing).
    _authUnsubscribe = subscription?.unsubscribe ?? null;
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
    // OAuth providers append access-token hash params to the redirect URL.
    // Hash-routing cannot receive a clean token if the redirect URL itself
    // contains a hash (e.g. /#/auth#access_token=...). Use the origin only
    // and let the app consume the token on the homepage.
    options: { redirectTo: window.location.origin },
  });
  // IRX-H36: Preserve the requested redirect path so the app can navigate
  // to it after the OAuth callback completes. We can't put it in the OAuth
  // redirect URL (hash-routing conflict), so we stash it in sessionStorage.
  if (!error && redirectPath && redirectPath !== '/') {
    try { sessionStorage.setItem('intrilex:oauth-redirect', redirectPath); } catch { /* non-fatal */ }
  }
  return !error;
}

/**
 * Sign out the current session.
 * @returns {Promise<boolean>}
 */
export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return false;
  // IRX-H28: Set guard flag to prevent auth callback race from resurrecting
  // the signed-out profile. The flag is cleared after a short grace period.
  _signingOut = true;
  const { error } = await client.auth.signOut();
  if (!error) {
    _session = null;
    _profile = null;
    setState('SIGNED_OUT');
  }
  // Clear the guard after 3 seconds — enough time for pending OAuth callbacks
  // to be rejected, but short enough that a legitimate re-login works.
  setTimeout(() => { _signingOut = false; }, 3000);
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
 * IRX-H27: Register a callback to be notified when the access token is refreshed.
 * The network session uses this to send AUTH_REFRESH to the match server
 * so live matches stay authenticated when Supabase refreshes the token.
 * @param {function(string): void} callback - Called with the new access token
 */
export function onTokenRefresh(callback) {
  _tokenRefreshCallback = callback;
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
  // IRX-H30: Switch achievement runtime to account-scoped storage on auth changes.
  // AUTHENTICATED → use the user's accountId. ANONYMOUS/SIGNED_OUT → use guest/legacy.
  try {
    const accountId = (newState === 'AUTHENTICATED' && _session?.user?.id) ? _session.user.id : null;
    import('../achievements/achievement-runtime.js?v=73653ac8207b').then(({ getAchievementRuntime }) => {
      const runtime = getAchievementRuntime();
      if (runtime._initialized) {
        runtime.switchAccount(accountId).catch(() => { /* non-fatal */ });
      }
    }).catch(() => { /* module load failure — non-fatal */ });
  } catch { /* non-fatal */ }
  for (const cb of _subscribers) {
    try { cb(_state, _profile); } catch { /* subscriber error — ignore */ }
  }
}

/**
 * Fetch the authoritative public.profiles row for a user and merge it
 * with OAuth metadata fallbacks. The server-side profile owns the real
 * public_player_id; the metadata fields (name, avatar) are fallbacks.
 * @param {import("../../vendor/supabase-js.js").SupabaseClient} client
 * @param {import("../../vendor/supabase-js.js").User} user
 * @returns {Promise<ReturnType<deriveProfile>>}
 */
async function fetchProfile(client, user) {
  if (!user) return null;
  const fallback = deriveProfile(user);
  try {
    const { data, error } = await client
      .from('profiles')
      .select('public_player_id, display_name, handle, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[auth] fetchProfile failed, using metadata fallback:', error.message);
      return fallback;
    }
    if (data) {
      return {
        publicPlayerId: data.public_player_id ?? fallback.publicPlayerId,
        displayName: data.display_name ?? fallback.displayName,
        handle: data.handle ?? fallback.handle,
        avatarUrl: data.avatar_url ?? fallback.avatarUrl,
        isAnonymous: fallback.isAnonymous,
        provider: fallback.provider,
      };
    }
  } catch (err) {
    console.warn('[auth] fetchProfile error, using metadata fallback:', err?.message ?? err);
  }
  return fallback;
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
    displayName: meta.display_name ?? meta.user_name ?? meta.full_name ?? meta.name ?? 'Player',
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

/**
 * Reset all auth controller state (for testing or config change).
 * Unsubscribes from Supabase auth state changes and clears all
 * cached state so initAuth can be called fresh.
 */
export function _resetAuthState() {
  if (_authUnsubscribe) {
    try { _authUnsubscribe(); } catch { /* ignore */ }
    _authUnsubscribe = null;
  }
  _initialized = false;
  _state = 'UNCONFIGURED';
  _session = null;
  _profile = null;
  _migrationPending = false;
  _guestIdentity = null;
  _authEventSeq = 0;
  _subscribers.clear();
}
