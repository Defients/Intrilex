// ═══════════════════════════════════════════════════════════════
// profile-data.js — Browser-side Player Profile data layer
//
// Fetches profile data from Supabase RPCs (get_self_profile,
// get_public_profile) and provides validated mutation methods
// (update_display_name, change_handle, equip_*, set_showcase_slot,
// update_profile_privacy).
//
// When Supabase is not configured (offline/local-only mode), it
// returns a structured "unavailable" result so the UI can fall back
// to the local-profile device data without crashing (section 93).
//
// Privacy: this module NEVER returns private projection for another
// user. Public profile RPC applies privacy filtering server-side.
// ═══════════════════════════════════════════════════════════════

import { getSupabaseClient, isSupabaseConfigured } from '../network/supabase-client.js?v=73653ac8207b';
import {
  Visibility,
  ShowcaseItemType,
  DEFAULT_PRIVACY,
  DEFAULT_LOADOUT,
  validatePrivacySettings,
  validateShowcase,
  validateLoadout,
  coercePrivacy,
  buildPublicProfile,
  buildSelfProfile,
  buildRankedSummary,
  emptyRankedSummary,
  getTitleDefinition,
  getFrameDefinition,
  getCardBackDefinition,
  getBadgeDefinition,
  TITLE_CATALOG,
  PROFILE_FRAME_CATALOG,
  CARD_BACK_CATALOG,
  BADGE_CATALOG,
  MAX_FEATURED_ACHIEVEMENTS,
  MAX_FEATURED_BADGES,
} from "../../account-domain/profile-domain.mjs";

/**
 * @typedef {import('@intrilex/account-domain/profile-domain').PublicPlayerProfile} PublicPlayerProfile
 * @typedef {import('@intrilex/account-domain/profile-domain').SelfPlayerProfile} SelfPlayerProfile
 * @typedef {import('@intrilex/account-domain/profile-domain').ProfilePrivacySettings} ProfilePrivacySettings
 * @typedef {import('@intrilex/account-domain/profile-domain').ShowcaseSlot} ShowcaseSlot
 */

// ── Profile fetch cache (TTL-based) ─────────────────────────────
//
// Caches fetchSelfProfile and fetchPublicProfile results for a short
// TTL (default 30s) to avoid redundant RPC calls when navigating
// between routes. All mutation functions automatically invalidate
// the cache on success. The UI can also call invalidateProfileCache()
// manually after local-profile changes.

const PROFILE_CACHE_TTL_MS = 30_000;

/** @type {Map<string, { value: any, expiresAt: number }>} */
const _profileCache = new Map();

/**
 * Get a cached profile result if still valid.
 * @param {string} key
 * @returns {any|null}
 */
function getCached(key) {
  const entry = _profileCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _profileCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Store a profile result in the cache with TTL.
 * @param {string} key
 * @param {any} value
 */
function setCached(key, value) {
  _profileCache.set(key, { value, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
}

/**
 * Invalidate the entire profile cache. Called automatically after
 * mutations and can be called manually by the UI.
 */
export function invalidateProfileCache() {
  _profileCache.clear();
}

// ── Self profile ────────────────────────────────────────────────

/**
 * Fetch the signed-in player's full profile (self projection).
 * Uses a TTL cache to avoid redundant RPC calls on route revisits.
 * @returns {Promise<{ available: boolean, profile: SelfPlayerProfile | null, error?: string }>}
 */
export async function fetchSelfProfile() {
  if (!isSupabaseConfigured()) {
    return { available: false, profile: null };
  }
  const cached = getCached('self');
  if (cached) return cached;
  const client = getSupabaseClient();
  if (!client) return { available: false, profile: null };

  const { data, error } = await client.rpc('get_self_profile');
  if (error) {
    return { available: true, profile: null, error: error.message };
  }
  if (!data || data.found === false) {
    return { available: true, profile: null };
  }
  const profile = mapSelfProfile(data);
  const result = { available: true, profile };
  setCached('self', result);
  return result;
}

/**
 * Fetch a public profile by handle or publicPlayerId.
 * Uses a TTL cache to avoid redundant RPC calls on route revisits.
 * @param {string} handleOrPublicId - Handle (without @) or PLY_… id.
 * @returns {Promise<{ available: boolean, profile: PublicPlayerProfile | null, error?: string }>}
 */
export async function fetchPublicProfile(handleOrPublicId) {
  if (!isSupabaseConfigured()) {
    return { available: false, profile: null };
  }
  const cacheKey = `public:${handleOrPublicId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const client = getSupabaseClient();
  if (!client) return { available: false, profile: null };

  const { data, error } = await client.rpc('get_public_profile', {
    p_handle_or_public_id: handleOrPublicId,
  });
  if (error) {
    return { available: true, profile: null, error: error.message };
  }
  if (!data || data.found === false) {
    return { available: true, profile: null };
  }
  const profile = mapPublicProfile(data);
  const result = { available: true, profile };
  setCached(cacheKey, result);
  return result;
}

// ── Mutations ───────────────────────────────────────────────────
//
// All mutations invalidate the profile cache on success so that the
// next fetchSelfProfile/fetchPublicProfile call re-fetches fresh data.

/**
 * Wrap an RPC mutation result: invalidate cache on success.
 * @param {{ data: any, error: any }} rpcResult
 * @returns {{ ok: boolean, error?: string } & any}
 */
function handleMutationResult(rpcResult) {
  if (rpcResult.error) return { ok: false, error: rpcResult.error.message };
  const result = rpcResult.data ?? { ok: false, error: 'UNKNOWN' };
  if (result.ok) invalidateProfileCache();
  return result;
}

/**
 * Update the signed-in player's display name.
 * @param {string} name
 * @returns {Promise<{ ok: boolean, error?: string, displayName?: string }>}
 */
export async function updateDisplayName(name) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('update_display_name', { p_name: name }));
}

/**
 * Change the signed-in player's handle.
 * @param {string} handle
 * @returns {Promise<{ ok: boolean, error?: string, handle?: string }>}
 */
export async function changeHandle(handle) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('change_handle', { p_handle: handle }));
}

/**
 * Update privacy settings.
 * @param {ProfilePrivacySettings} privacy
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function updatePrivacy(privacy) {
  const v = validatePrivacySettings(privacy);
  if (!v.valid) return { ok: false, error: v.error };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('update_profile_privacy', {
    p_match_history: v.settings.matchHistory,
    p_achievements: v.settings.achievements,
    p_online_status: v.settings.onlineStatus,
    p_local_stats: v.settings.localStats,
  }));
}

/**
 * Set the signed-in player's directory discoverability flag.
 * Owner-only; validated server-side. Distinct from updatePrivacy so
 * the four visibility fields can never accidentally reset the flag.
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

/**
 * Equip a title. Ownership is validated server-side.
 * @param {string} titleId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function equipTitle(titleId) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('equip_title', { p_title_id: titleId }));
}

/**
 * Equip a profile frame.
 * @param {string} frameId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function equipProfileFrame(frameId) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('equip_profile_frame', { p_frame_id: frameId }));
}

/**
 * Equip a card back.
 * @param {string} cardBackId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function equipCardBack(cardBackId) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('equip_card_back', { p_card_back_id: cardBackId }));
}

/**
 * Set a showcase slot.
 * @param {number} slot
 * @param {string} type - 'ACHIEVEMENT' | 'BADGE'
 * @param {string} itemId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function setShowcaseSlot(slot, type, itemId) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('set_showcase_slot', {
    p_slot: slot, p_type: type, p_item_id: itemId,
  }));
}

/**
 * Clear a showcase slot.
 * @param {number} slot
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function clearShowcaseSlot(slot) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  return handleMutationResult(await client.rpc('clear_showcase_slot', { p_slot: slot }));
}

// ── Mappers (RPC jsonb → typed DTOs) ────────────────────────────

/**
 * Map raw RPC identity + showcase data into the shared identity+loadout
 * structure used by both self and public profile builders.
 * @param {Record<string, any>} data
 * @returns {{ identity: import('@intrilex/account-domain').PlayerProfileIdentity, showcase: ShowcaseSlot[] }}
 */
function mapIdentityAndLoadout(data) {
  const id = data.identity ?? {};
  const showcase = mapShowcase(data.showcase);
  const loadout = {
    titleId: id.titleId ?? 'none',
    profileFrameId: id.profileFrameId ?? 'none',
    cardBackId: id.cardBackId ?? 'default',
    showcase,
  };
  const identity = {
    publicPlayerId: id.publicPlayerId ?? '',
    displayName: id.displayName ?? 'Player',
    handle: id.handle ?? null,
    avatarUrl: id.avatarUrl ?? null,
    joinedAt: id.joinedAt ?? new Date().toISOString(),
    accountType: id.accountType === 'GUEST' ? 'GUEST' : 'PERMANENT',
    loadout,
  };
  return { identity, showcase };
}

/**
 * Map a raw self-profile RPC row to a SelfPlayerProfile DTO.
 * @param {Record<string, any>} data
 * @returns {SelfPlayerProfile}
 */
function mapSelfProfile(data) {
  const { identity, showcase } = mapIdentityAndLoadout(data);
  return buildSelfProfile({
    identity,
    ranked: data.ranked ? mapRanked(data.ranked) : emptyRankedSummary(),
    achievements: data.achievements ?? null,
    showcase,
    recentMatches: mapRecentMatches(data.recentMatches),
    seasonHistory: mapSeasonHistory(data.seasonHistory),
    privacy: coercePrivacy(data.privacy),
    directoryVisible: data.directoryVisible === true,
    onlineStats: data.onlineStats ?? null,
    localStats: null, // merged by UI from local-profile
  });
}

/**
 * Map a raw public-profile RPC row to a PublicPlayerProfile DTO.
 * @param {Record<string, any>} data
 * @returns {PublicPlayerProfile}
 */
function mapPublicProfile(data) {
  const { identity, showcase } = mapIdentityAndLoadout(data);
  return buildPublicProfile({
    identity,
    ranked: data.ranked ? mapRanked(data.ranked) : null,
    achievements: data.achievements ?? null,
    showcase,
    recentMatches: mapRecentMatches(data.recentMatches),
    seasonHistory: mapSeasonHistory(data.seasonHistory),
    privacy: data.privacy ? {
      achievements: data.privacy.achievementsVisible ? Visibility.PUBLIC : Visibility.PRIVATE,
      matchHistory: data.privacy.matchHistoryVisible ? Visibility.PUBLIC : Visibility.PRIVATE,
      onlineStatus: Visibility.PRIVATE,
      localStats: Visibility.PRIVATE,
    } : DEFAULT_PRIVACY,
  });
}

/**
 * @param {Record<string, any>} r
 * @returns {import('@intrilex/account-domain').RankedSummary}
 */
function mapRanked(r) {
  return {
    available: true,
    isPlacement: Boolean(r.isPlacement),
    placementsPlayed: Number(r.placementsPlayed ?? 0),
    placementsRequired: Number(r.placementsRequired ?? 5),
    tier: r.tier ?? 'UNRANKED',
    division: r.division ?? 'NONE',
    rating: Number(r.rating ?? 0),
    leaderboardPosition: r.leaderboardPosition ?? null,
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    draws: Number(r.draws ?? 0),
    games: Number(r.games ?? 0),
    winRate: r.winRate != null ? Number(r.winRate) : null,
    peakRating: r.peakRating != null ? Number(r.peakRating) : null,
    peakTier: r.peakTier ?? null,
    peakDivision: r.peakDivision ?? null,
    isApex: Boolean(r.isApex),
  };
}

/**
 * @param {any} raw
 * @returns {ShowcaseSlot[]}
 */
function mapShowcase(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    slot: Number(s.slot),
    type: s.type === 'ACHIEVEMENT' ? ShowcaseItemType.ACHIEVEMENT : ShowcaseItemType.BADGE,
    itemId: String(s.itemId),
  })).sort((a, b) => a.slot - b.slot);
}

/**
 * @param {any} raw
 * @returns {import('@intrilex/account-domain').PublicMatchSummary[]}
 */
function mapRecentMatches(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => ({
    matchId: String(m.matchId ?? ''),
    result: String(m.result ?? 'DRAW'),
    opponentDisplayName: m.opponentDisplayName ?? null,
    opponentHandle: m.opponentHandle ?? null,
    opponentTier: m.opponentTier ?? null,
    ratingDelta: m.ratingDelta != null ? Number(m.ratingDelta) : null,
    timestamp: String(m.timestamp ?? ''),
    seasonId: String(m.seasonId ?? ''),
  }));
}

/**
 * @param {any} raw
 * @returns {import('@intrilex/account-domain').SeasonHistoryEntry[]}
 */
function mapSeasonHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    seasonId: String(s.seasonId ?? ''),
    name: String(s.name ?? ''),
    status: String(s.status ?? 'ARCHIVED'),
    finalRating: Number(s.finalRating ?? 0),
    finalPosition: s.finalPosition ?? null,
    finalTier: String(s.finalTier ?? 'UNRANKED'),
    finalDivision: s.finalDivision ?? null,
    peakRating: Number(s.peakRating ?? 0),
    peakTier: String(s.peakTier ?? 'UNRANKED'),
    peakDivision: s.peakDivision ?? null,
    wins: Number(s.wins ?? 0),
    losses: Number(s.losses ?? 0),
    draws: Number(s.draws ?? 0),
    games: Number(s.games ?? 0),
    isCurrent: Boolean(s.isCurrent),
  }));
}

// ── Local fallback (offline mode) ───────────────────────────────
//
// When Supabase is not configured, the UI uses local-profile data.
// This builder constructs a SelfPlayerProfile from local-profile data
// so the UI can render a consistent view in offline mode.

/**
 * Build a self profile from local-profile data (offline mode).
 * @param {object} localProfile - From local-profile.mjs loadProfile()
 * @param {object} [achievementSummary] - From achievement runtime
 * @param {Set<string>} [earnedAchievementIds]
 * @param {Set<string>} [earnedBadgeIds]
 * @returns {SelfPlayerProfile}
 */
export function buildLocalSelfProfile(localProfile, achievementSummary = null, earnedAchievementIds = new Set(), earnedBadgeIds = new Set()) {
  const r = localProfile.rating;
  const rec = localProfile.record;
  const ranked = buildRankedSummary({
    rating: r.value,
    ratedMatches: r.ratedMatches,
    wins: rec.wins,
    losses: rec.losses,
    draws: rec.draws,
    peakRating: r.value,
    placementsPlayed: r.ratedMatches,
    provisional: r.provisional,
  });
  // Override: local profile has no leaderboard position
  ranked.leaderboardPosition = null;
  ranked.peakRating = (localProfile.ratingHistory && localProfile.ratingHistory.length)
    ? Math.max(...localProfile.ratingHistory.map(h => h.rating))
    : r.value;
  const totalGames = rec.wins + rec.losses + rec.draws;
  ranked.games = totalGames;
  ranked.winRate = totalGames > 0 ? rec.wins / totalGames : null;

  const identity = {
    publicPlayerId: 'LOCAL_DEVICE',
    displayName: localProfile.displayName ?? 'You',
    handle: null,
    avatarUrl: null,
    joinedAt: new Date().toISOString(),
    accountType: 'GUEST',
    loadout: DEFAULT_LOADOUT,
  };

  return buildSelfProfile({
    identity,
    ranked,
    achievements: achievementSummary,
    showcase: [],
    recentMatches: [],
    seasonHistory: [],
    privacy: { ...DEFAULT_PRIVACY },
    onlineStats: null,
    localStats: {
      rating: r.value,
      provisional: r.provisional,
      ratedMatches: r.ratedMatches,
      wins: rec.wins,
      losses: rec.losses,
      draws: rec.draws,
    },
    earnedAchievementIds,
    earnedBadgeIds,
  });
}

// Re-export domain helpers for UI convenience
export {
  Visibility,
  ShowcaseItemType,
  DEFAULT_PRIVACY,
  DEFAULT_LOADOUT,
  validatePrivacySettings,
  validateShowcase,
  validateLoadout,
  getTitleDefinition,
  getFrameDefinition,
  getCardBackDefinition,
  getBadgeDefinition,
  TITLE_CATALOG,
  PROFILE_FRAME_CATALOG,
  CARD_BACK_CATALOG,
  BADGE_CATALOG,
  MAX_FEATURED_ACHIEVEMENTS,
  MAX_FEATURED_BADGES,
};
