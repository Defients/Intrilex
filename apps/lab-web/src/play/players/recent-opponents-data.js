// ═══════════════════════════════════════════════════════════════
// recent-opponents-data.js — Browser-side Recent Opponents data layer
//
// Uses the authenticated Supabase browser client to call the server-side
// get_recent_opponents RPC. Returns opponents the signed-in player has
// faced in completed online matches, with a head-to-head record.
//
// Privacy: this module NEVER receives private fields. The RPC returns
// only the safe public projection + head-to-head (from the caller's
// perspective). It requires authentication (auth.uid()) — anonymous
// users have no match history.
//
// When Supabase is not configured (offline/local-only mode), or the
// user is not authenticated, it returns a structured "unavailable"
// result so the UI can show a graceful state.
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from '../network/supabase-client.js';
import { getAuthState } from '../network/auth-controller.js';
import {
  toOpponentEntry,
  DEFAULT_RECENT_OPPONENTS_LIMIT,
  MAX_RECENT_OPPONENTS_LIMIT,
} from '@intrilex/account-domain/recent-opponents';

/**
 * @typedef {import('@intrilex/account-domain/recent-opponents').OpponentEntry} OpponentEntry
 */

/**
 * @typedef {Object} RecentOpponentsResult
 * @property {boolean} available - False when Supabase is not configured or user not authenticated.
 * @property {boolean} authenticated - False when the user is not signed in.
 * @property {OpponentEntry[]} entries
 * @property {number} count - Number of entries returned in this page.
 * @property {number} offset - The offset used for this page.
 * @property {number} limit - The limit used for this page.
 */

/**
 * Fetch a page of recent opponents the signed-in player has faced.
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=25]
 * @param {number} [opts.offset=0]
 * @param {AbortSignal} [opts.signal] - Optional abort signal to cancel the request
 * @returns {Promise<RecentOpponentsResult>}
 */
export async function fetchRecentOpponents(opts = {}) {
  // Not configured → unavailable
  if (!isSupabaseConfigured()) {
    return { available: false, authenticated: false, entries: [], count: 0, offset: 0, limit: 0 };
  }
  // Not authenticated → unavailable (recent opponents require auth.uid())
  const authState = getAuthState();
  if (authState !== 'AUTHENTICATED') {
    return { available: false, authenticated: false, entries: [], count: 0, offset: 0, limit: 0 };
  }

  const client = getSupabaseClient();
  if (!client) return { available: false, authenticated: true, entries: [], count: 0, offset: 0, limit: 0 };

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_RECENT_OPPONENTS_LIMIT, 1), MAX_RECENT_OPPONENTS_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);

  const { data, error } = await client.rpc('get_recent_opponents', {
    p_limit: limit,
    p_offset: offset,
  }, { signal: opts.signal ?? undefined });

  if (error) {
    throw new Error(`Recent opponents unavailable: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const entries = rows.map((row) => toOpponentEntry(row));

  return {
    available: true,
    authenticated: true,
    entries,
    count: entries.length,
    offset,
    limit,
  };
}
