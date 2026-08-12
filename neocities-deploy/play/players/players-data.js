// ═══════════════════════════════════════════════════════════════
// players-data.js — Browser-side Player Directory data layer
//
// Uses the authenticated Supabase browser client to call the server-side
// get_player_directory RPC. The browser NEVER sorts the full table —
// search, filtering, and ordering are performed server-side. This
// module only validates inputs, calls the RPC, and maps safe rows to
// DirectoryEntry DTOs.
//
// Privacy: this module NEVER receives private fields. The RPC returns
// only the safe public projection (section 13/34). It also enforces
// directory_visible server-side, so a client cannot enumerate players
// who have not opted in.
//
// When Supabase is not configured (offline/local-only mode), it returns
// a structured "unavailable" result so the UI can show a graceful state.
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from '../network/supabase-client.js?v=659a089d50b6';
import {
  toDirectoryEntry,
  normalizeDirectorySearch,
  validateDirectorySort,
  validateDirectoryTierFilter,
  DEFAULT_DIRECTORY_LIMIT,
  MAX_DIRECTORY_LIMIT,
} from "../../account-domain/directory.mjs";

/**
 * @typedef {import('@intrilex/account-domain/directory').DirectoryEntry} DirectoryEntry
 */

/**
 * @typedef {Object} DirectoryResult
 * @property {boolean} available - False when Supabase is not configured.
 * @property {DirectoryEntry[]} entries
 * @property {number} count - Number of entries returned in this page.
 * @property {number} offset - The offset used for this page.
 * @property {number} limit - The limit used for this page.
 * @property {number|null} total - Total matching players (for pagination summary), or null when unavailable.
 */

/**
 * Fetch a page of discoverable players from the server directory RPC.
 *
 * @param {Object} [opts]
 * @param {string} [opts.search] - Search by handle/display name (2–64 chars).
 * @param {string} [opts.tier] - Tier filter or null/ALL.
 * @param {string} [opts.sort] - One of DirectorySort.
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @param {AbortSignal} [opts.signal] - Optional abort signal to cancel the request
 * @returns {Promise<DirectoryResult>}
 */
export async function fetchDirectory(opts = {}) {
  if (!isSupabaseConfigured()) {
    return { available: false, entries: [], count: 0, offset: 0, limit: 0, total: null };
  }
  const client = getSupabaseClient();
  if (!client) return { available: false, entries: [], count: 0, offset: 0, limit: 0, total: null };

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_DIRECTORY_LIMIT, 1), MAX_DIRECTORY_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);
  const tier = validateDirectoryTierFilter(opts.tier ?? null);
  const sort = validateDirectorySort(opts.sort ?? null);
  // Empty/too-short search → null (server returns all discoverable players)
  const search = normalizeDirectorySearch(opts.search ?? '');
  // normalizeDirectorySearch returns null for empty/invalid — pass null to RPC
  const searchParam = search ?? null;

  const { data, error } = await client.rpc('get_player_directory', {
    p_search: searchParam,
    p_tier_filter: tier,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  }, { signal: opts.signal ?? undefined });

  if (error) {
    // Sanitize: don't expose internal parameter names (sort/tier values)
    // to the user-facing error message. The raw error.message from
    // Supabase is sufficient for diagnostics.
    throw new Error(`Directory unavailable: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const entries = rows.map((row) => toDirectoryEntry(row));

  // Fetch total count in parallel for the pagination summary.
  // This is a separate lightweight COUNT query (no row data).
  // If it fails, we degrade gracefully — total stays null and the UI
  // shows "Showing 1–25" without the "of N" suffix.
  let total = null;
  try {
    const { data: countData, error: countError } = await client.rpc(
      'get_player_directory_count',
      { p_search: searchParam, p_tier_filter: tier },
      { signal: opts.signal ?? undefined },
    );
    if (!countError && countData && typeof countData.count === 'number') {
      total = countData.count;
    }
  } catch {
    // AbortError or network failure — degrade gracefully (total = null)
  }

  return {
    available: true,
    entries,
    count: entries.length,
    offset,
    limit,
    total,
  };
}

/**
 * Set the signed-in player's directory discoverability flag.
 * Owner-only; validated server-side.
 * @param {boolean} visible
 * @returns {Promise<{ ok: boolean, error?: string, directoryVisible?: boolean }>}
 */
export async function setDirectoryVisible(visible) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.rpc('set_directory_visible', { p_visible: visible });
  if (error) return { ok: false, error: error.message };
  const result = data ?? { ok: false, error: 'UNKNOWN' };
  return result;
}
