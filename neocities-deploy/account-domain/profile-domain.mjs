// ═══════════════════════════════════════════════════════════════
// profile-domain.mjs — Player Profile domain contracts (pure)
//
// The Profile layer OWNS only profile-owned state:
//   - display identity (display name, handle, avatar)
//   - equipped cosmetics (title, frame, card back)
//   - showcase (featured achievements + badges)
//   - privacy settings
//
// It CONSUMES (never owns) authoritative state from:
//   - Ranked (rating, tier, division, position, peak, season history)
//   - Achievements (earned count, AP, unlock records)
//   - Match History (safe public summaries)
//   - Entitlements (cosmetic ownership)
//
// This module is PURE: no I/O, no side effects, no DB, no UI.
// Database migrations live in supabase/migrations/. Browser data
// fetching lives in apps/lab-web/src/play/profile/. UI lives in
// apps/lab-web/src/workspaces/profile.js.
//
// Identity hierarchy (NEVER collapse):
//   accountId (Supabase UUID) — internal, never public
//   publicPlayerId (PLY_…)     — stable public identity
//   handle (@deffy)            — unique locator, mutable
//   displayName (Deffy)        — non-unique friendly name
// ═══════════════════════════════════════════════════════════════

import { RankTier, Division, ratingToTierDivision, isApexTier } from './rank-tier.mjs';
import { computeWinRate, apexLabel } from './leaderboard.mjs';
import {
  validateHandle,
  normalizeHandle,
  isReservedHandle,
  sanitizeDisplayName,
  sanitizeAvatarUrl,
} from './validation.mjs';

// ── Showcase limits ─────────────────────────────────────────────

/** Maximum featured achievements in the profile showcase. */
export const MAX_FEATURED_ACHIEVEMENTS = 3;
/** Maximum featured badges in the profile showcase. */
export const MAX_FEATURED_BADGES = 3;
/** Total showcase slots (achievements + badges). */
export const MAX_SHOWCASE_SLOTS = MAX_FEATURED_ACHIEVEMENTS + MAX_FEATURED_BADGES;

// ── Privacy enums ───────────────────────────────────────────────

/** @typedef {('PUBLIC'|'PRIVATE')} Visibility */

/**
 * @readonly
 * @enum {string} Profile visibility values.
 */
export const Visibility = Object.freeze({
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
});

/**
 * @typedef {Object} ProfilePrivacySettings
 * @property {Visibility} matchHistory
 * @property {Visibility} achievements
 * @property {Visibility} onlineStatus
 * @property {Visibility} localStats
 */

/** Default privacy settings for a new account. */
// IRX-M20: Default to PRIVATE for all privacy-sensitive data.
// New accounts must explicitly opt-in to public visibility.
export const DEFAULT_PRIVACY = Object.freeze({
  matchHistory: Visibility.PRIVATE,
  achievements: Visibility.PRIVATE,
  onlineStatus: Visibility.PRIVATE,
  localStats: Visibility.PRIVATE,
});

/**
 * Validate a privacy settings object.
 * @param {unknown} v
 * @returns {{ valid: boolean, settings?: ProfilePrivacySettings, error?: string }}
 */
export function validatePrivacySettings(v) {
  if (!v || typeof v !== 'object') {
    return { valid: false, error: 'Privacy settings must be an object' };
  }
  const o = /** @type {Record<string, unknown>} */ (v);
  const keys = ['matchHistory', 'achievements', 'onlineStatus', 'localStats'];
  const settings = /** @type {ProfilePrivacySettings} */ ({});
  for (const k of keys) {
    const val = o[k];
    if (val !== Visibility.PUBLIC && val !== Visibility.PRIVATE) {
      return { valid: false, error: `Privacy setting '${k}' must be PUBLIC or PRIVATE` };
    }
    settings[/** @type {keyof ProfilePrivacySettings} */ (k)] = val;
  }
  return { valid: true, settings };
}

/**
 * Coerce a raw privacy row (from DB) into a normalized settings object,
 * filling missing fields with defaults.
 * @param {Record<string, unknown>|null} row
 * @returns {ProfilePrivacySettings}
 */
export function coercePrivacy(row) {
  if (!row) return { ...DEFAULT_PRIVACY };
  const get = (/** @type {string} */ k) => {
    const v = row[k];
    return v === Visibility.PUBLIC || v === Visibility.PRIVATE ? v : DEFAULT_PRIVACY[/** @type {'matchHistory'} */ (k)];
  };
  return {
    matchHistory: get('matchHistory'),
    achievements: get('achievements'),
    onlineStatus: get('onlineStatus'),
    localStats: get('localStats'),
  };
}

// ── Showcase slot contracts ─────────────────────────────────────

/** @typedef {('ACHIEVEMENT'|'BADGE')} ShowcaseItemType */

/**
 * @readonly
 * @enum {ShowcaseItemType}
 */
export const ShowcaseItemType = Object.freeze({
  ACHIEVEMENT: 'ACHIEVEMENT',
  BADGE: 'BADGE',
});

/**
 * @typedef {Object} ShowcaseSlot
 * @property {number} slot - 0-based slot index.
 * @property {ShowcaseItemType} type
 * @property {string} itemId - Achievement or badge ID.
 */

/**
 * Validate a single showcase slot.
 * @param {unknown} v
 * @returns {{ valid: boolean, slot?: ShowcaseSlot, error?: string }}
 */
export function validateShowcaseSlot(v) {
  if (!v || typeof v !== 'object') {
    return { valid: false, error: 'Showcase slot must be an object' };
  }
  const o = /** @type {Record<string, unknown>} */ (v);
  const slot = Number(o.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SHOWCASE_SLOTS) {
    return { valid: false, error: `Slot must be an integer in [0, ${MAX_SHOWCASE_SLOTS - 1}]` };
  }
  const type = o.type;
  if (type !== ShowcaseItemType.ACHIEVEMENT && type !== ShowcaseItemType.BADGE) {
    return { valid: false, error: 'Type must be ACHIEVEMENT or BADGE' };
  }
  const itemId = o.itemId;
  if (typeof itemId !== 'string' || itemId.length === 0 || itemId.length > 128) {
    return { valid: false, error: 'itemId must be a non-empty string (max 128 chars)' };
  }
  return { valid: true, slot: { slot, type, itemId } };
}

/**
 * Validate a full showcase array (ordering, duplicates, slot limits).
 * @param {unknown[]} slots
 * @param {{ maxAchievements?: number, maxBadges?: number }} [limits]
 * @returns {{ valid: boolean, slots?: ShowcaseSlot[], error?: string }}
 */
export function validateShowcase(slots, limits = {}) {
  if (!Array.isArray(slots)) {
    return { valid: false, error: 'Showcase must be an array' };
  }
  const maxA = limits.maxAchievements ?? MAX_FEATURED_ACHIEVEMENTS;
  const maxB = limits.maxBadges ?? MAX_FEATURED_BADGES;
  if (slots.length > maxA + maxB) {
    return { valid: false, error: `Showcase exceeds ${maxA + maxB} slots` };
  }
  const seenSlots = new Set();
  const seenItems = new Set();
  let achCount = 0;
  let badgeCount = 0;
  const validated = /** @type {ShowcaseSlot[]} */ ([]);
  for (const raw of slots) {
    const r = validateShowcaseSlot(raw);
    if (!r.valid) return { valid: false, error: r.error };
    const s = /** @type {ShowcaseSlot} */ (r.slot);
    if (seenSlots.has(s.slot)) {
      return { valid: false, error: `Duplicate slot ${s.slot}` };
    }
    const itemKey = `${s.type}:${s.itemId}`;
    if (seenItems.has(itemKey)) {
      return { valid: false, error: `Duplicate showcase item ${s.itemId}` };
    }
    if (s.type === ShowcaseItemType.ACHIEVEMENT) {
      achCount++;
      if (achCount > maxA) return { valid: false, error: `Too many featured achievements (max ${maxA})` };
    } else {
      badgeCount++;
      if (badgeCount > maxB) return { valid: false, error: `Too many featured badges (max ${maxB})` };
    }
    seenSlots.add(s.slot);
    seenItems.add(itemKey);
    validated.push(s);
  }
  // Stable ordering by slot index
  validated.sort((a, b) => a.slot - b.slot);
  return { valid: true, slots: validated };
}

// ── Cosmetic catalogs (canonical, single source of truth) ───────
//
// Titles, frames, and card backs are defined HERE. The entitlement
// bridge maps an earned achievement → owned cosmetic. The Profile
// customization layer reads these catalogs and the entitlement source
// to determine what a player may equip.
//
// Adding a new cosmetic:
//   1. Add definition to the appropriate catalog below.
//   2. If achievement-gated, set achievementId to the canonical ID.
//   3. Provide asset/key for UI rendering.
//   4. Add ownership test + equip test.
// No bespoke per-cosmetic Profile code.

/**
 * @typedef {Object} TitleDefinition
 * @property {string} id - Stable unique identifier.
 * @property {string} name - Display text shown under the player name.
 * @property {string|null} achievementId - Achievement that grants this title (null = default/always-owned).
 * @property {boolean} hidden - True if the source achievement is hidden (show "Secret Unlock" until earned).
 * @property {string} description
 */

/**
 * Canonical title catalog. Some titles are granted by achievements;
 * when the achievement is earned, the title becomes equippable.
 * @type {ReadonlyArray<TitleDefinition>}
 */
export const TITLE_CATALOG = Object.freeze([
  { id: 'none', name: '', achievementId: null, hidden: false, description: 'No title equipped.' },
  { id: 'initiate', name: 'Initiate', achievementId: 'welcome-to-intrilex', hidden: false, description: 'Granted by Welcome to Intrilex.' },
  { id: 'twenty-one', name: 'Twenty-One', achievementId: 'twenty-one', hidden: false, description: 'Granted by Twenty-One.' },
  { id: 'lucky-vii', name: 'Lucky VII', achievementId: 'lucky-seven', hidden: false, description: 'Granted by Lucky Seven.' },
  { id: 'stack-thief', name: 'Stack Thief', achievementId: 'stack-theft', hidden: false, description: 'Granted by Stack Theft.' },
  { id: 'intrilexian', name: 'Intrilexian', achievementId: 'the-stackening', hidden: true, description: 'Secret unlock.' },
  { id: 'card-savant', name: 'Card Savant', achievementId: 'card-savant', hidden: false, description: 'Granted by Card Savant.' },
  { id: 'sovereign', name: 'Sovereign', achievementId: 'wild-card', hidden: false, description: 'Granted by Wild Card.' },
]);

/**
 * @typedef {Object} ProfileFrameDefinition
 * @property {string} id
 * @property {string} name
 * @property {string|null} achievementId - Achievement that grants this frame (null = default/always-owned).
 * @property {boolean} hidden
 * @property {string} description
 * @property {string} cssClass - CSS class applied to the hero frame element.
 */

/**
 * Canonical profile frame catalog.
 * @type {ReadonlyArray<ProfileFrameDefinition>}
 */
export const PROFILE_FRAME_CATALOG = Object.freeze([
  { id: 'none', name: 'No Frame', achievementId: null, hidden: false, description: 'Default hero presentation.', cssClass: 'frame-none' },
  { id: 'initiate-frame', name: 'Initiate Frame', achievementId: 'welcome-to-intrilex', hidden: false, description: 'Granted by Welcome to Intrilex.', cssClass: 'frame-initiate' },
  { id: 'cipher-frame', name: 'Cipher Frame', achievementId: 'the-stack-exists', hidden: false, description: 'Granted by The Stack Exists.', cssClass: 'frame-cipher' },
  { id: 'warden-frame', name: 'Warden Frame', achievementId: 'not-so-fast', hidden: false, description: 'Granted by Not So Fast.', cssClass: 'frame-warden' },
  { id: 'vanguard-frame', name: 'Vanguard Frame', achievementId: 'stack-theft', hidden: false, description: 'Granted by Stack Theft.', cssClass: 'frame-vanguard' },
  { id: 'ascendant-frame', name: 'Ascendant Frame', achievementId: 'overkill', hidden: false, description: 'Granted by Overkill.', cssClass: 'frame-ascendant' },
  { id: 'intrilex-frame', name: 'Intrilex Frame', achievementId: 'the-stackening', hidden: true, description: 'Secret unlock.', cssClass: 'frame-intrilex' },
]);

/**
 * @typedef {Object} CardBackDefinition
 * @property {string} id
 * @property {string} name
 * @property {string|null} achievementId
 * @property {boolean} hidden
 * @property {string} description
 * @property {string} assetKey - Key for the card-back renderer.
 */

/**
 * Canonical card back catalog.
 * @type {ReadonlyArray<CardBackDefinition>}
 */
export const CARD_BACK_CATALOG = Object.freeze([
  { id: 'default', name: 'Default', achievementId: null, hidden: false, description: 'Standard Intrilex card back.', assetKey: 'default' },
  { id: 'initiate-back', name: 'Initiate Back', achievementId: 'welcome-to-intrilex', hidden: false, description: 'Granted by Welcome to Intrilex.', assetKey: 'initiate' },
  { id: 'cipher-back', name: 'Cipher Back', achievementId: 'first-blood', hidden: false, description: 'Granted by First Blood.', assetKey: 'cipher' },
  { id: 'seven-back', name: 'Seven Back', achievementId: 'lucky-seven', hidden: false, description: 'Granted by Lucky Seven.', assetKey: 'seven' },
  { id: 'theft-back', name: 'Theft Back', achievementId: 'stack-theft', hidden: false, description: 'Granted by Stack Theft.', assetKey: 'theft' },
  { id: 'intrilex-back', name: 'Intrilex Back', achievementId: 'recursive-seven', hidden: true, description: 'Secret unlock.', assetKey: 'intrilex' },
]);

/**
 * @typedef {Object} BadgeDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {boolean} available - False for not-yet-implemented badges (e.g. tournament).
 * @property {string} icon - Icon key/emoji.
 */

/**
 * Canonical badge catalog for profile showcase. These are distinct from
 * achievements — they represent special-status badges (tournament, etc).
 * Reuses the legacy local badge IDs for migration continuity.
 * @type {ReadonlyArray<BadgeDefinition>}
 */
export const BADGE_CATALOG = Object.freeze([
  { id: 'first-duel', name: 'First Duel', description: 'Complete your first verified duel.', available: true, icon: '🛡' },
  { id: 'first-victory', name: 'First Victory', description: 'Win your first verified duel.', available: true, icon: '🏆' },
  { id: 'field-tested', name: 'Field Tested', description: 'Complete 10 verified duels.', available: true, icon: '⭐' },
  { id: 'duelist', name: 'Duelist', description: 'Complete 25 verified duels.', available: true, icon: '👑' },
  { id: 'streak-3', name: 'Streak ×3', description: 'Win 3 consecutive verified duels.', available: true, icon: '🔥' },
  { id: 'supercharged', name: 'Supercharged', description: 'Declare your first Super.', available: true, icon: '⚡' },
  { id: 'unshaken', name: 'Unshaken', description: 'Win after trailing in Secured Points.', available: true, icon: '❤' },
  { id: 'tactician', name: 'Tactician', description: 'Win 5 matches against hard/nightmare AI.', available: true, icon: '🧠' },
  { id: 'tournament-champion', name: 'Tournament Champion', description: 'Win a tournament (coming soon).', available: false, icon: '🏅' },
  { id: 'bracket-buster', name: 'Bracket Buster', description: 'Win a tournament as the lowest seed (coming soon).', available: false, icon: '⚔' },
]);

// ── Catalog lookup helpers ──────────────────────────────────────

/** @type {Map<string, TitleDefinition>} */
const TITLE_MAP = new Map(TITLE_CATALOG.map(t => [t.id, t]));
/** @type {Map<string, ProfileFrameDefinition>} */
const FRAME_MAP = new Map(PROFILE_FRAME_CATALOG.map(f => [f.id, f]));
/** @type {Map<string, CardBackDefinition>} */
const CARD_BACK_MAP = new Map(CARD_BACK_CATALOG.map(c => [c.id, c]));
/** @type {Map<string, BadgeDefinition>} */
const BADGE_MAP = new Map(BADGE_CATALOG.map(b => [b.id, b]));

/**
 * @param {string} id
 * @returns {TitleDefinition|null}
 */
export function getTitleDefinition(id) {
  return TITLE_MAP.get(id) ?? null;
}

/**
 * @param {string} id
 * @returns {ProfileFrameDefinition|null}
 */
export function getFrameDefinition(id) {
  return FRAME_MAP.get(id) ?? null;
}

/**
 * @param {string} id
 * @returns {CardBackDefinition|null}
 */
export function getCardBackDefinition(id) {
  return CARD_BACK_MAP.get(id) ?? null;
}

/**
 * @param {string} id
 * @returns {BadgeDefinition|null}
 */
export function getBadgeDefinition(id) {
  return BADGE_MAP.get(id) ?? null;
}

/**
 * Check if a badge ID is a known badge in the canonical catalog.
 * @param {string} id
 * @returns {boolean}
 */
export function isKnownBadge(id) {
  return BADGE_MAP.has(id);
}

/**
 * Validate that cosmetic catalog IDs are globally unique across all
 * catalogs (titles, frames, card backs, badges). A collision would
 * cause ambiguous entitlement lookups. Returns a structured result
 * with any collisions found.
 *
 * @returns {{ valid: boolean, collisions: Array<{ id: string, catalogs: string[] }>, duplicateIds: Array<{ catalog: string, ids: string[] }> }}
 */
export function validateCatalogConsistency() {
  /** @type {Map<string, string[]>} */
  const idToCatalogs = new Map();
  /** @type {Array<{ catalog: string, ids: string[] }>} */
  const perCatalogIds = [
    { catalog: 'TITLE_CATALOG', ids: TITLE_CATALOG.map(t => t.id) },
    { catalog: 'PROFILE_FRAME_CATALOG', ids: PROFILE_FRAME_CATALOG.map(f => f.id) },
    { catalog: 'CARD_BACK_CATALOG', ids: CARD_BACK_CATALOG.map(c => c.id) },
    { catalog: 'BADGE_CATALOG', ids: BADGE_CATALOG.map(b => b.id) },
  ];

  // Check for duplicate IDs within each catalog
  const duplicateIds = [];
  for (const { catalog, ids } of perCatalogIds) {
    const seen = new Set();
    const dups = [];
    for (const id of ids) {
      if (seen.has(id)) dups.push(id);
      seen.add(id);
    }
    if (dups.length > 0) duplicateIds.push({ catalog, ids: [...new Set(dups)] });
  }

  // Check for cross-catalog collisions
  for (const { catalog, ids } of perCatalogIds) {
    for (const id of ids) {
      if (!idToCatalogs.has(id)) idToCatalogs.set(id, []);
      idToCatalogs.get(id).push(catalog);
    }
  }
  const collisions = [];
  for (const [id, catalogs] of idToCatalogs) {
    if (catalogs.length > 1) {
      collisions.push({ id, catalogs: [...new Set(catalogs)] });
    }
  }

  return {
    valid: collisions.length === 0 && duplicateIds.length === 0,
    collisions,
    duplicateIds,
  };
}

// ── Entitlement resolution ──────────────────────────────────────
//
// A player "owns" a cosmetic if:
//   - it has no achievementId (default, always owned), OR
//   - the granting achievement is in their earnedAchievements set.
//
// Hidden-achievement cosmetics show "Secret Unlock" until earned.

/**
 * Check if a player owns a title given their earned achievements.
 * @param {string} titleId
 * @param {Set<string>} earnedAchievementIds
 * @returns {boolean}
 */
export function ownsTitle(titleId, earnedAchievementIds) {
  const def = TITLE_MAP.get(titleId);
  if (!def) return false;
  if (!def.achievementId) return true; // default / always-owned
  return earnedAchievementIds.has(def.achievementId);
}

/**
 * Check if a player owns a profile frame.
 * @param {string} frameId
 * @param {Set<string>} earnedAchievementIds
 * @returns {boolean}
 */
export function ownsFrame(frameId, earnedAchievementIds) {
  const def = FRAME_MAP.get(frameId);
  if (!def) return false;
  if (!def.achievementId) return true;
  return earnedAchievementIds.has(def.achievementId);
}

/**
 * Check if a player owns a card back.
 * @param {string} cardBackId
 * @param {Set<string>} earnedAchievementIds
 * @returns {boolean}
 */
export function ownsCardBack(cardBackId, earnedAchievementIds) {
  const def = CARD_BACK_MAP.get(cardBackId);
  if (!def) return false;
  if (!def.achievementId) return true;
  return earnedAchievementIds.has(def.achievementId);
}

// ── Loadout contract ────────────────────────────────────────────

/**
 * @typedef {Object} PlayerProfileLoadout
 * @property {string} titleId
 * @property {string} profileFrameId
 * @property {string} cardBackId
 * @property {ShowcaseSlot[]} showcase
 */

/** Default loadout for a new account. */
export const DEFAULT_LOADOUT = Object.freeze({
  titleId: 'none',
  profileFrameId: 'none',
  cardBackId: 'default',
  showcase: [],
});

/**
 * Validate a loadout against ownership.
 * @param {unknown} loadout
 * @param {Set<string>} earnedAchievementIds
 * @returns {{ valid: boolean, loadout?: PlayerProfileLoadout, error?: string }}
 */
export function validateLoadout(loadout, earnedAchievementIds) {
  if (!loadout || typeof loadout !== 'object') {
    return { valid: false, error: 'Loadout must be an object' };
  }
  const o = /** @type {Record<string, unknown>} */ (loadout);
  const titleId = typeof o.titleId === 'string' ? o.titleId : DEFAULT_LOADOUT.titleId;
  const profileFrameId = typeof o.profileFrameId === 'string' ? o.profileFrameId : DEFAULT_LOADOUT.profileFrameId;
  const cardBackId = typeof o.cardBackId === 'string' ? o.cardBackId : DEFAULT_LOADOUT.cardBackId;

  if (!getTitleDefinition(titleId)) return { valid: false, error: `Unknown title: ${titleId}` };
  if (!getFrameDefinition(profileFrameId)) return { valid: false, error: `Unknown frame: ${profileFrameId}` };
  if (!getCardBackDefinition(cardBackId)) return { valid: false, error: `Unknown card back: ${cardBackId}` };

  if (!ownsTitle(titleId, earnedAchievementIds)) return { valid: false, error: `Title not owned: ${titleId}` };
  if (!ownsFrame(profileFrameId, earnedAchievementIds)) return { valid: false, error: `Frame not owned: ${profileFrameId}` };
  if (!ownsCardBack(cardBackId, earnedAchievementIds)) return { valid: false, error: `Card back not owned: ${cardBackId}` };

  const showRes = validateShowcase(o.showcase ?? []);
  if (!showRes.valid) return { valid: false, error: showRes.error };

  return {
    valid: true,
    loadout: { titleId, profileFrameId, cardBackId, showcase: showRes.slots },
  };
}

/**
 * Validate that a showcase item is owned by the player.
 * @param {ShowcaseSlot} slot
 * @param {Set<string>} earnedAchievementIds
 * @param {Set<string>} earnedBadgeIds
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateShowcaseOwnership(slot, earnedAchievementIds, earnedBadgeIds) {
  if (slot.type === ShowcaseItemType.ACHIEVEMENT) {
    if (!earnedAchievementIds.has(slot.itemId)) {
      return { valid: false, error: `Achievement not earned: ${slot.itemId}` };
    }
    return { valid: true };
  }
  if (slot.type === ShowcaseItemType.BADGE) {
    if (!earnedBadgeIds.has(slot.itemId)) {
      return { valid: false, error: `Badge not earned: ${slot.itemId}` };
    }
    if (!isKnownBadge(slot.itemId)) {
      return { valid: false, error: `Unknown badge: ${slot.itemId}` };
    }
    return { valid: true };
  }
  return { valid: false, error: `Unknown showcase type: ${slot.type}` };
}

// ── Profile identity contract ───────────────────────────────────

/**
 * @typedef {Object} PlayerProfileIdentity
 * @property {string} publicPlayerId
 * @property {string} displayName
 * @property {string|null} handle
 * @property {string|null} avatarUrl
 * @property {string} joinedAt - ISO timestamp.
 * @property {'GUEST'|'PERMANENT'} accountType
 * @property {PlayerProfileLoadout} loadout
 */

/**
 * @typedef {Object} RankedSummary
 * @property {boolean} available - False when no ranked data exists.
 * @property {boolean} isPlacement
 * @property {number} placementsPlayed
 * @property {number} placementsRequired
 * @property {string} tier
 * @property {string} division
 * @property {number} rating
 * @property {number|null} leaderboardPosition
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} games
 * @property {number|null} winRate
 * @property {number|null} peakRating
 * @property {string|null} peakTier
 * @property {string|null} peakDivision
 * @property {boolean} isApex
 */

/**
 * @typedef {Object} AchievementSummary
 * @property {number} earnedCount
 * @property {number} totalCount
 * @property {number} achievementPoints
 * @property {number} maxAp
 */

/**
 * @typedef {Object} PublicMatchSummary
 * @property {string} matchId
 * @property {string} result - 'WIN'|'LOSS'|'DRAW'
 * @property {string|null} opponentDisplayName
 * @property {string|null} opponentHandle
 * @property {string|null} opponentTier
 * @property {number|null} ratingDelta
 * @property {string} timestamp - ISO timestamp.
 * @property {string} seasonId
 */

/**
 * @typedef {Object} SeasonHistoryEntry
 * @property {string} seasonId
 * @property {string} name
 * @property {string} status
 * @property {number} finalRating
 * @property {number|null} finalPosition
 * @property {string} finalTier
 * @property {string|null} finalDivision
 * @property {number} peakRating
 * @property {string} peakTier
 * @property {string|null} peakDivision
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} games
 * @property {boolean} isCurrent
 */

// ── Public projection builder ───────────────────────────────────
//
// buildPublicProfile() applies privacy filtering at the data layer.
// Private fields are NEVER included in the returned object — not
// merely hidden in the DOM. This is the privacy firewall.

/**
 * @typedef {Object} PublicPlayerProfile
 * @property {PlayerProfileIdentity} identity
 * @property {RankedSummary|null} ranked
 * @property {AchievementSummary|null} achievements
 * @property {ShowcaseSlot[]} showcase
 * @property {PublicMatchSummary[]|null} recentMatches
 * @property {SeasonHistoryEntry[]|null} seasonHistory
 * @property {{ achievementsVisible: boolean, matchHistoryVisible: boolean }} privacy
 */

/**
 * Build a safe public profile projection from raw aggregated state.
 *
 * Privacy enforcement (section 23-27):
 *   - achievements=PRIVATE → achievements=null, showcase filtered to badges only
 *   - matchHistory=PRIVATE → recentMatches=null
 *   - localStats=PRIVATE   → localStats never included in public projection
 *   - onlineStatus=PRIVATE → no online status field included
 *
 * Ranked competitive identity (tier, division, IR, position, record)
 * remains public per Ranked policy (section 25) — a player cannot
 * invisibly occupy a public leaderboard.
 *
 * @param {Object} input
 * @param {PlayerProfileIdentity} input.identity
 * @param {RankedSummary|null} [input.ranked]
 * @param {AchievementSummary|null} [input.achievements]
 * @param {ShowcaseSlot[]} [input.showcase]
 * @param {PublicMatchSummary[]} [input.recentMatches]
 * @param {SeasonHistoryEntry[]} [input.seasonHistory]
 * @param {ProfilePrivacySettings} [input.privacy]
 * @returns {PublicPlayerProfile}
 */
export function buildPublicProfile(input) {
  const privacy = input.privacy ?? DEFAULT_PRIVACY;
  const achievementsVisible = privacy.achievements === Visibility.PUBLIC;
  const matchHistoryVisible = privacy.matchHistory === Visibility.PUBLIC;

  // Showcase: if achievements private, drop achievement showcase items
  // but keep badge items (badges are not achievement definitions).
  const showcase = achievementsVisible
    ? (input.showcase ?? [])
    : (input.showcase ?? []).filter(s => s.type !== ShowcaseItemType.ACHIEVEMENT);

  return {
    identity: input.identity,
    ranked: input.ranked ?? null,
    achievements: achievementsVisible ? (input.achievements ?? null) : null,
    showcase,
    recentMatches: matchHistoryVisible ? (input.recentMatches ?? null) : null,
    seasonHistory: matchHistoryVisible ? (input.seasonHistory ?? null) : null,
    privacy: {
      achievementsVisible,
      matchHistoryVisible,
    },
  };
}

// ── Self projection builder ─────────────────────────────────────
//
// The self projection includes private state: full privacy settings,
// local play stats, owned cosmetics catalog, and edit permissions.
// It is NEVER returned to other users.

/**
 * @typedef {Object} SelfPlayerProfile
 * @property {PlayerProfileIdentity} identity
 * @property {RankedSummary|null} ranked
 * @property {AchievementSummary|null} achievements
 * @property {ShowcaseSlot[]} showcase
 * @property {PublicMatchSummary[]} recentMatches
 * @property {SeasonHistoryEntry[]} seasonHistory
 * @property {ProfilePrivacySettings} privacy
 * @property {{ onlineMatches: number, onlineWins: number, onlineLosses: number, onlineDraws: number, rankedMatches: number, rankedWins: number, rankedLosses: number, currentWinStreak: number, bestWinStreak: number }|null} onlineStats
 * @property {{ rating: number, provisional: boolean, ratedMatches: number, wins: number, losses: number, draws: number }|null} localStats
 * @property {{ titles: TitleDefinition[], frames: ProfileFrameDefinition[], cardBacks: CardBackDefinition[], badges: BadgeDefinition[] }} ownedCosmetics
 * @property {boolean} isSelf
 */

/**
 * Build the self (owner) profile projection. Includes private state.
 * @param {Object} input
 * @param {PlayerProfileIdentity} input.identity
 * @param {RankedSummary|null} [input.ranked]
 * @param {AchievementSummary|null} [input.achievements]
 * @param {ShowcaseSlot[]} [input.showcase]
 * @param {PublicMatchSummary[]} [input.recentMatches]
 * @param {SeasonHistoryEntry[]} [input.seasonHistory]
 * @param {ProfilePrivacySettings} [input.privacy]
 * @param {SelfPlayerProfile['onlineStats']} [input.onlineStats]
 * @param {SelfPlayerProfile['localStats']} [input.localStats]
 * @param {Set<string>} [input.earnedAchievementIds]
 * @param {Set<string>} [input.earnedBadgeIds]
 * @returns {SelfPlayerProfile}
 */
export function buildSelfProfile(input) {
  const earnedAch = input.earnedAchievementIds ?? new Set();
  const earnedBadges = input.earnedBadgeIds ?? new Set();
  return {
    identity: input.identity,
    ranked: input.ranked ?? null,
    achievements: input.achievements ?? null,
    showcase: input.showcase ?? [],
    recentMatches: input.recentMatches ?? [],
    seasonHistory: input.seasonHistory ?? [],
    privacy: input.privacy ?? { ...DEFAULT_PRIVACY },
    directoryVisible: input.directoryVisible === true,
    onlineStats: input.onlineStats ?? null,
    localStats: input.localStats ?? null,
    ownedCosmetics: {
      titles: TITLE_CATALOG.filter(t => ownsTitle(t.id, earnedAch)),
      frames: PROFILE_FRAME_CATALOG.filter(f => ownsFrame(f.id, earnedAch)),
      cardBacks: CARD_BACK_CATALOG.filter(c => ownsCardBack(c.id, earnedAch)),
      badges: BADGE_CATALOG.filter(b => earnedBadges.has(b.id) || b.available === false),
    },
    isSelf: true,
  };
}

// ── Ranked summary builder (from raw rating row) ────────────────

/**
 * Build a RankedSummary from a raw rating row + optional standing.
 * @param {Object} row - Raw rating row { rating, ratedMatches, wins, losses, draws, peakRating, placementsPlayed, provisional }
 * @param {{ position?: number|null, seasonId?: string }} [standing]
 * @returns {RankedSummary}
 */
export function buildRankedSummary(row, standing = {}) {
  const rating = Math.round(Number(row.rating ?? 0));
  const ratedMatches = Number(row.ratedMatches ?? 0);
  const wins = Number(row.wins ?? 0);
  const losses = Number(row.losses ?? 0);
  const draws = Number(row.draws ?? 0);
  const games = wins + losses + draws;
  const assignment = ratingToTierDivision(rating, { ratedMatches });
  const peakRating = row.peakRating != null ? Number(row.peakRating) : null;
  const peakAssignment = peakRating != null
    ? ratingToTierDivision(peakRating, { ratedMatches: Math.max(ratedMatches, 1) })
    : null;

  return {
    available: true,
    isPlacement: assignment.isPlacement,
    placementsPlayed: assignment.placementsPlayed,
    placementsRequired: assignment.placementsRequired,
    tier: assignment.tier,
    division: assignment.division,
    rating,
    leaderboardPosition: standing.position ?? null,
    wins,
    losses,
    draws,
    games,
    winRate: games > 0 ? computeWinRate(wins, losses, draws) : null,
    peakRating,
    peakTier: peakAssignment ? peakAssignment.tier : null,
    peakDivision: peakAssignment ? peakAssignment.division : null,
    isApex: assignment.isApex,
  };
}

/**
 * Build an empty (no ranked history) ranked summary.
 * @returns {RankedSummary}
 */
export function emptyRankedSummary() {
  return {
    available: false,
    isPlacement: true,
    placementsPlayed: 0,
    placementsRequired: 5,
    tier: RankTier.UNRANKED,
    division: Division.NONE,
    rating: 0,
    leaderboardPosition: null,
    wins: 0,
    losses: 0,
    draws: 0,
    games: 0,
    winRate: null,
    peakRating: null,
    peakTier: null,
    peakDivision: null,
    isApex: false,
  };
}

// ── Apex label helper (re-exported for UI convenience) ──────────

export { apexLabel, isApexTier };

// ── Handle/display name/avatar helpers (re-exported) ────────────

export {
  validateHandle,
  normalizeHandle,
  isReservedHandle,
  sanitizeDisplayName,
  sanitizeAvatarUrl,
};
