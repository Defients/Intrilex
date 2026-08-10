// ═══════════════════════════════════════════════════════════════
// migration.mjs — Legacy badge/stat migration to achievement system
// Evidence-preserving: never fabricates achievements without proof.
// ═══════════════════════════════════════════════════════════════

import { getDefinition } from './catalog.mjs';
import { PROVENANCE, ACHIEVEMENT_PRODUCT_VERSION, ACHIEVEMENT_RULES_VERSION } from './constants.mjs';
import { createAchievementProfileState } from './progress.mjs';

/**
 * @typedef {Object} LegacyProfile
 * @property {any[]} [badges] - Legacy badge entries
 * @property {{ wins: number, losses: number, draws: number }} record
 * @property {object[]} [verifiedResults]
 */

/**
 * @typedef {Object} LegacyPlayerStats
 * @property {number} [totalMatches]
 * @property {number} [wins]
 * @property {number} [losses]
 * @property {number} [draws]
 * @property {number} [supersDeclared]
 */

/**
 * Migrate legacy profile and stats into achievement profile state.
 * Evidence-preserving: only grants achievements where legacy data proves the condition.
 *
 * @param {LegacyProfile} legacyProfile
 * @param {LegacyPlayerStats} legacyStats
 * @param {Record<string, any>} [existingAchievementState] - Existing achievement state to merge into
 * @returns {{ state: object, migratedAchievements: string[], migrationNotes: string[] }}
 */
export function migrateLegacyData(legacyProfile, legacyStats, existingAchievementState) {
  const state = existingAchievementState ?? createAchievementProfileState();
  state.migratedFrom = 'legacy-badges-v1';
  /** @type {string[]} */
  const migratedAchievements = [];
  /** @type {string[]} */
  const migrationNotes = [];

  const timestamp = new Date().toISOString();
  /** @param {string} id */
  const unlockRecord = (id) => ({
    achievementId: id,
    unlockedAt: timestamp,
    matchId: null,
    provenance: PROVENANCE.LEGACY_MIGRATION,
    rulesVersion: ACHIEVEMENT_RULES_VERSION,
    productVersion: ACHIEVEMENT_PRODUCT_VERSION,
  });

  /** @param {string} id @param {string} [note] */
  const grantIfNotEarned = (id, note) => {
    if (state.earned[id]) return; // Don't double-award
    const def = getDefinition(id);
    if (!def) return;
    state.earned[id] = {
      unlockedAt: timestamp,
      matchId: null,
      provenance: PROVENANCE.LEGACY_MIGRATION,
      rulesVersion: ACHIEVEMENT_RULES_VERSION,
      productVersion: ACHIEVEMENT_PRODUCT_VERSION,
    };
    migratedAchievements.push(id);
    if (note) migrationNotes.push(note);
  };

  // ── Badge-based migration ──
  const badges = legacyProfile?.badges ?? [];
  const badgeIds = new Set(badges.map(b => b.id ?? b));

  // supercharged badge → supercharged achievement (trustworthy: declaration evidence)
  if (badgeIds.has('supercharged')) {
    grantIfNotEarned('supercharged', 'Migrated from legacy supercharged badge');
  }

  // first-duel badge → welcome-to-intrilex (trustworthy: completed a duel)
  if (badgeIds.has('first-duel')) {
    grantIfNotEarned('welcome-to-intrilex', 'Migrated from legacy first-duel badge');
  }

  // first-victory badge → no-longer-new is NOT granted (need 5 wins, badge only proves 1)
  // But first-victory does prove the player won at least once — no specific achievement for single win
  // We do NOT grant no-longer-new from first-victory alone

  // unshaken badge → from-behind is NOT granted (badge doesn't prove 10-point deficit)
  migrationNotes.push('unshaken badge NOT migrated to from-behind (insufficient deficit evidence)');

  // ── Stat-based migration ──
  const wins = legacyStats?.wins ?? legacyProfile?.record?.wins ?? 0;

  // wins >= 5 → no-longer-new
  if (wins >= 5) {
    grantIfNotEarned('no-longer-new', `Migrated from ${wins} historical wins (>= 5)`);
    state.progress['no-longer-new'] = {
      achievementId: 'no-longer-new',
      type: 'COUNTER',
      current: Math.min(wins, 5),
      target: 5,
      setItems: [],
      completed: true,
    };
  } else if (wins > 0) {
    state.progress['no-longer-new'] = {
      achievementId: 'no-longer-new',
      type: 'COUNTER',
      current: wins,
      target: 5,
      setItems: [],
      completed: false,
    };
  }

  // wins >= 25 → getting-dangerous
  if (wins >= 25) {
    grantIfNotEarned('getting-dangerous', `Migrated from ${wins} historical wins (>= 25)`);
    state.progress['getting-dangerous'] = {
      achievementId: 'getting-dangerous',
      type: 'COUNTER',
      current: Math.min(wins, 25),
      target: 25,
      setItems: [],
      completed: true,
    };
  } else if (wins > 0) {
    state.progress['getting-dangerous'] = {
      achievementId: 'getting-dangerous',
      type: 'COUNTER',
      current: wins,
      target: 25,
      setItems: [],
      completed: false,
    };
  }

  // wins >= 100 → intrilexian
  if (wins >= 100) {
    grantIfNotEarned('intrilexian', `Migrated from ${wins} historical wins (>= 100)`);
    state.progress['intrilexian'] = {
      achievementId: 'intrilexian',
      type: 'COUNTER',
      current: Math.min(wins, 100),
      target: 100,
      setItems: [],
      completed: true,
    };
  } else if (wins > 0) {
    state.progress['intrilexian'] = {
      achievementId: 'intrilexian',
      type: 'COUNTER',
      current: wins,
      target: 100,
      setItems: [],
      completed: false,
    };
  }

  // ── Career tracker seeding from stats ──
  const record = legacyProfile?.record ?? {};
  const gamesCompleted = legacyStats?.totalMatches
    ?? (record.wins ?? 0) + (record.losses ?? 0) + (record.draws ?? 0);
  state.career = {
    ...state.career,
    gamesCompleted,
    gamesWon: wins,
  };

  // supersDeclared stat → supercharged (if not already from badge)
  const supersDeclared = legacyStats?.supersDeclared ?? 0;
  if (supersDeclared > 0) {
    grantIfNotEarned('supercharged', `Migrated from ${supersDeclared} supers declared stat`);
    state.career.superDeclarationsTotal = supersDeclared;
  }

  state.updatedAt = timestamp;

  return { state, migratedAchievements, migrationNotes };
}

/**
 * Check if migration has already been applied.
 * @param {Record<string, any>} state
 * @returns {boolean}
 */
export function isMigrated(state) {
  return state?.migratedFrom != null;
}
