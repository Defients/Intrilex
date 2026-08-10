// ═══════════════════════════════════════════════════════════════
// achievement-sync.mjs — Achievement cloud sync contracts
//
// Pure functions for computing achievement sync deltas between
// local state (browser IndexedDB) and cloud state (Supabase
// account_achievements table).
//
// The actual Supabase writes happen in the browser auth-controller
// using the user's authenticated Supabase client (RLS allows
// INSERT with LOCAL_DEVICE/LOCAL_AI/UNVERIFIED provenance).
//
// SERVER-provenance achievements can only be written by the match
// server's service-role client — never by the browser.
// ═══════════════════════════════════════════════════════════════

/**
 * Provenance values matching the DB CHECK constraint.
 * @readonly
 * @enum {string}
 */
export const AchievementProvenance = Object.freeze({
  SERVER: 'SERVER',
  LOCAL_DEVICE: 'LOCAL_DEVICE',
  LOCAL_AI: 'LOCAL_AI',
  UNVERIFIED: 'UNVERIFIED',
});

/**
 * @typedef {Object} AchievementUnlock
 * @property {string} achievementId - Stable achievement ID from catalog
 * @property {string} unlockedAt - ISO timestamp
 * @property {string} provenance - One of AchievementProvenance
 * @property {string|null} matchId - Match that triggered the unlock (null for local)
 * @property {string|null} rulesVersion
 * @property {string|null} productVersion
 */

/**
 * @typedef {Object} CloudAchievementRow
 * @property {string} achievement_id
 * @property {string} unlocked_at - ISO timestamp
 * @property {string} provenance
 * @property {string|null} rules_version
 * @property {string|null} product_version
 */

/**
 * Compute the sync delta between local and cloud achievements.
 *
 * Returns the achievements that exist locally but not in the cloud
 * (need to be uploaded) and those that exist in the cloud but not
 * locally (need to be downloaded/merged).
 *
 * @param {object} opts
 * @param {AchievementUnlock[]} opts.localUnlocks - Locally unlocked achievements
 * @param {CloudAchievementRow[]} opts.cloudRows - Cloud achievement rows from Supabase
 * @returns {{ toUpload: AchievementUnlock[], toDownload: CloudAchievementRow[], conflicts: Array<{ achievementId: string, local: AchievementUnlock, cloud: CloudAchievementRow }> }}
 */
export function computeSyncDelta({ localUnlocks, cloudRows }) {
  const cloudById = new Map(cloudRows.map(r => [r.achievement_id, r]));
  const localById = new Map(localUnlocks.map(u => [u.achievementId, u]));

  /** @type {AchievementUnlock[]} */
  const toUpload = [];
  /** @type {CloudAchievementRow[]} */
  const toDownload = [];
  /** @type {Array<{ achievementId: string, local: AchievementUnlock, cloud: CloudAchievementRow }>} */
  const conflicts = [];

  // Find local achievements not in cloud → upload
  for (const local of localUnlocks) {
    const cloud = cloudById.get(local.achievementId);
    if (!cloud) {
      toUpload.push(local);
    } else if (cloud.unlocked_at !== local.unlockedAt) {
      // Both have it but with different timestamps — conflict
      // Prefer the earlier unlock (first occurrence wins)
      conflicts.push({ achievementId: local.achievementId, local, cloud });
    }
    // If both have it with same timestamp → no action needed
  }

  // Find cloud achievements not in local → download
  for (const cloud of cloudRows) {
    if (!localById.has(cloud.achievement_id)) {
      toDownload.push(cloud);
    }
  }

  return { toUpload, toDownload, conflicts };
}

/**
 * Resolve a sync conflict by preferring the earlier unlock timestamp.
 * This ensures the first occurrence is always preserved.
 * @param {{ local: AchievementUnlock, cloud: CloudAchievementRow }} conflict
 * @returns {{ winner: 'local' | 'cloud', unlock: AchievementUnlock }}
 */
export function resolveConflict(conflict) {
  const localTime = new Date(conflict.local.unlockedAt).getTime();
  const cloudTime = new Date(conflict.cloud.unlocked_at).getTime();

  if (localTime <= cloudTime) {
    return {
      winner: 'local',
      unlock: conflict.local,
    };
  }
  return {
    winner: 'cloud',
    unlock: {
      achievementId: conflict.cloud.achievement_id,
      unlockedAt: conflict.cloud.unlocked_at,
      provenance: conflict.cloud.provenance,
      matchId: null,
      rulesVersion: conflict.cloud.rules_version,
      productVersion: conflict.cloud.product_version,
    },
  };
}

/**
 * Convert a local AchievementUnlock to a Supabase insert row.
 * Only allows LOCAL_DEVICE, LOCAL_AI, or UNVERIFIED provenance
 * (SERVER provenance is service-role only).
 * @param {string} userId - Supabase user UUID
 * @param {AchievementUnlock} unlock
 * @returns {{ user_id: string, achievement_id: string, unlocked_at: string, provenance: string, rules_version: string|null, product_version: string|null } | null}
 */
export function toCloudRow(userId, unlock) {
  if (!userId) return null;
  // SERVER provenance cannot be written by clients — reject
  if (unlock.provenance === AchievementProvenance.SERVER) return null;
  return {
    user_id: userId,
    achievement_id: unlock.achievementId,
    unlocked_at: unlock.unlockedAt,
    provenance: unlock.provenance,
    rules_version: unlock.rulesVersion ?? null,
    product_version: unlock.productVersion ?? null,
  };
}

/**
 * Convert a cloud row to a local AchievementUnlock.
 * @param {CloudAchievementRow} row
 * @returns {AchievementUnlock}
 */
export function fromCloudRow(row) {
  return {
    achievementId: row.achievement_id,
    unlockedAt: row.unlocked_at,
    provenance: row.provenance,
    matchId: null,
    rulesVersion: row.rules_version,
    productVersion: row.product_version,
  };
}

/**
 * Merge local and cloud achievements into a unified set.
 * On conflicts, the earlier unlock wins.
 * @param {AchievementUnlock[]} localUnlocks
 * @param {CloudAchievementRow[]} cloudRows
 * @returns {AchievementUnlock[]}
 */
export function mergeAchievements(localUnlocks, cloudRows) {
  const delta = computeSyncDelta({ localUnlocks, cloudRows });
  const result = [...localUnlocks];

  // Add cloud-only achievements
  for (const cloud of delta.toDownload) {
    result.push(fromCloudRow(cloud));
  }

  // Resolve conflicts — replace with earlier unlock if needed
  for (const conflict of delta.conflicts) {
    const resolution = resolveConflict(conflict);
    if (resolution.winner === 'cloud') {
      const idx = result.findIndex(u => u.achievementId === conflict.achievementId);
      if (idx >= 0) result[idx] = resolution.unlock;
    }
  }

  return result;
}
