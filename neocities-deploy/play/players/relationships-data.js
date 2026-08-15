// ═══════════════════════════════════════════════════════════════
// relationships-data.js — Browser-side Player Relationships data layer
//
// Uses the authenticated Supabase browser client to call the server-side
// relationship RPCs (migration 0016). The browser NEVER receives private
// fields — the RPCs return only the safe public projection of the target
// player plus the relationship kind, head-to-head (from the caller's
// perspective), and timestamps.
//
// Privacy: all relationship state is computed SERVER-SIDE. The browser
// cannot enumerate relationships or construct head-to-head records
// client-side. FOLLOW/RIVAL are self-visible only; BLOCK is private to
// the blocker. The blocked player never sees that they are blocked.
//
// When Supabase is not configured (offline/local-only mode), or the
// user is not authenticated, read operations return a structured
// "unavailable" result and mutations return { ok: false, error } so
// the UI can show a graceful state.
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from '../network/supabase-client.js?v=9ea1c2f9e91d';
import { getAuthState } from '../network/auth-controller.js?v=9ea1c2f9e91d';
import {
  toRelationshipEntry,
  toRelationshipStatus,
  validateRelationshipKind,
  DEFAULT_RELATIONSHIPS_LIMIT,
  MAX_RELATIONSHIPS_LIMIT,
  RelationshipKind,
} from "../../account-domain/relationships.mjs";

/**
 * @typedef {import('@intrilex/account-domain/relationships').RelationshipEntry} RelationshipEntry
 * @typedef {import('@intrilex/account-domain/relationships').RelationshipStatus} RelationshipStatus
 */

/**
 * @typedef {Object} RelationshipsResult
 * @property {boolean} available - False when Supabase is not configured or user not authenticated.
 * @property {boolean} authenticated - False when the user is not signed in.
 * @property {RelationshipEntry[]} entries
 * @property {number} count - Number of entries returned in this page.
 * @property {number} offset - The offset used for this page.
 * @property {number} limit - The limit used for this page.
 */

/** Default limit for suggested rivals (smaller — it's a recommendation list). */
export const DEFAULT_SUGGESTED_RIVALS_LIMIT = 10;
export const MAX_SUGGESTED_RIVALS_LIMIT = 50;

/**
 * Guard: returns true when relationship operations are unavailable
 * (offline or not authenticated). Read callers return an unavailable
 * result; mutation callers return an error result.
 * @returns {boolean}
 */
function _unavailable() {
  return !isSupabaseConfigured() || getAuthState() !== 'AUTHENTICATED';
}

/**
 * Fetch a page of the caller's relationships of a given kind.
 *
 * @param {Object} [opts]
 * @param {string} [opts.kind='follow'] - One of RelationshipKind.
 * @param {number} [opts.limit=25]
 * @param {number} [opts.offset=0]
 * @param {AbortSignal} [opts.signal] - Optional abort signal to cancel the request
 * @returns {Promise<RelationshipsResult>}
 */
export async function fetchRelationships(opts = {}) {
  if (!isSupabaseConfigured()) {
    return { available: false, authenticated: false, entries: [], count: 0, offset: 0, limit: 0 };
  }
  const authState = getAuthState();
  if (authState !== 'AUTHENTICATED') {
    return { available: false, authenticated: false, entries: [], count: 0, offset: 0, limit: 0 };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, authenticated: true, entries: [], count: 0, offset: 0, limit: 0 };

  const kind = validateRelationshipKind(opts.kind ?? RelationshipKind.FOLLOW) ?? RelationshipKind.FOLLOW;
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_RELATIONSHIPS_LIMIT, 1), MAX_RELATIONSHIPS_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);

  const { data, error } = await client.rpc('get_relationships', {
    p_kind: kind,
    p_limit: limit,
    p_offset: offset,
  }, { signal: opts.signal ?? undefined });

  if (error) {
    throw new Error(`Relationships unavailable: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const entries = rows.map((row) => toRelationshipEntry(row));

  return {
    available: true,
    authenticated: true,
    entries,
    count: entries.length,
    offset,
    limit,
  };
}

/**
 * Fetch the caller's relationship status to a single target player.
 * Used by the profile hero to render the correct Follow/Rival/Block
 * button state. Returns a default "no relationship" status when
 * unavailable.
 *
 * @param {string} targetPublicPlayerId - The target's PLY_ id or @handle.
 * @param {AbortSignal} [signal]
 * @returns {Promise<RelationshipStatus>}
 */
export async function fetchRelationshipStatus(targetPublicPlayerId, signal) {
  if (_unavailable()) {
    return toRelationshipStatus(null);
  }
  const client = getSupabaseClient();
  if (!client) return toRelationshipStatus(null);

  const { data, error } = await client.rpc('get_relationship_status', {
    p_target_public_id: targetPublicPlayerId,
  }, { signal: signal ?? undefined });

  if (error) {
    // Degrade gracefully — the profile still renders, just without
    // relationship button state. The user can retry by re-opening.
    console.warn('[relationships] fetchRelationshipStatus failed:', error.message);
    return toRelationshipStatus(null);
  }
  // The RPC returns a single row (or null). Normalize.
  const row = Array.isArray(data) ? data[0] : data;
  return toRelationshipStatus(row);
}

/**
 * Fetch suggested rivals — opponents ranked by rivalry intensity whom
 * the caller does not already rival. A pure function of match history.
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=10]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<RelationshipsResult>}
 */
export async function fetchSuggestedRivals(opts = {}) {
  if (!isSupabaseConfigured()) {
    return { available: false, authenticated: false, entries: [], count: 0, offset: 0, limit: 0 };
  }
  const authState = getAuthState();
  if (authState !== 'AUTHENTICATED') {
    return { available: false, authenticated: false, entries: [], count: 0, offset: 0, limit: 0 };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, authenticated: true, entries: [], count: 0, offset: 0, limit: 0 };

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_SUGGESTED_RIVALS_LIMIT, 1), MAX_SUGGESTED_RIVALS_LIMIT);

  const { data, error } = await client.rpc('get_suggested_rivals', {
    p_limit: limit,
  }, { signal: opts.signal ?? undefined });

  if (error) {
    throw new Error(`Suggested rivals unavailable: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  // Suggested rivals are not yet relationships — synthesize entries with
  // kind='follow' (the weakest relationship) so the DTO shape is uniform.
  // The UI distinguishes suggestions from established follows by context.
  const entries = rows.map((row) => toRelationshipEntry({ ...row, kind: RelationshipKind.FOLLOW, created_at: null }));

  return {
    available: true,
    authenticated: true,
    entries,
    count: entries.length,
    offset: 0,
    limit,
  };
}

// ── Mutations ──

/**
 * Follow a player. Idempotent. Clears any existing block on the target.
 * @param {string} targetPublicPlayerId
 * @returns {Promise<{ ok: boolean, error?: string, followed?: boolean }>}
 */
export async function followPlayer(targetPublicPlayerId) {
  if (_unavailable()) return { ok: false, error: 'Sign in to follow players.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('follow_player', { p_target_public_id: targetPublicPlayerId });
  if (error) return { ok: false, error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  return result ?? { ok: false, error: 'UNKNOWN' };
}

/**
 * Unfollow a player. Idempotent.
 * @param {string} targetPublicPlayerId
 * @returns {Promise<{ ok: boolean, error?: string, followed?: boolean }>}
 */
export async function unfollowPlayer(targetPublicPlayerId) {
  if (_unavailable()) return { ok: false, error: 'Sign in to manage follows.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('unfollow_player', { p_target_public_id: targetPublicPlayerId });
  if (error) return { ok: false, error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  return result ?? { ok: false, error: 'UNKNOWN' };
}

/**
 * Mark a player as a rival. Also establishes a follow (rival implies
 * follow). Clears any existing block.
 * @param {string} targetPublicPlayerId
 * @returns {Promise<{ ok: boolean, error?: string, rivaled?: boolean }>}
 */
export async function setRival(targetPublicPlayerId) {
  if (_unavailable()) return { ok: false, error: 'Sign in to mark rivals.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('set_rival', { p_target_public_id: targetPublicPlayerId });
  if (error) return { ok: false, error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  return result ?? { ok: false, error: 'UNKNOWN' };
}

/**
 * Remove the rival mark from a player (the follow is preserved).
 * @param {string} targetPublicPlayerId
 * @returns {Promise<{ ok: boolean, error?: string, rivaled?: boolean }>}
 */
export async function unsetRival(targetPublicPlayerId) {
  if (_unavailable()) return { ok: false, error: 'Sign in to manage rivals.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('unset_rival', { p_target_public_id: targetPublicPlayerId });
  if (error) return { ok: false, error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  return result ?? { ok: false, error: 'UNKNOWN' };
}

/**
 * Block a player. Removes any existing follow/rival on the target.
 * @param {string} targetPublicPlayerId
 * @returns {Promise<{ ok: boolean, error?: string, blocked?: boolean }>}
 */
export async function blockPlayer(targetPublicPlayerId) {
  if (_unavailable()) return { ok: false, error: 'Sign in to block players.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('block_player', { p_target_public_id: targetPublicPlayerId });
  if (error) return { ok: false, error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  return result ?? { ok: false, error: 'UNKNOWN' };
}

/**
 * Unblock a player. Idempotent.
 * @param {string} targetPublicPlayerId
 * @returns {Promise<{ ok: boolean, error?: string, blocked?: boolean }>}
 */
export async function unblockPlayer(targetPublicPlayerId) {
  if (_unavailable()) return { ok: false, error: 'Sign in to manage blocks.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('unblock_player', { p_target_public_id: targetPublicPlayerId });
  if (error) return { ok: false, error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  return result ?? { ok: false, error: 'UNKNOWN' };
}
