// ═══════════════════════════════════════════════════════════════
// guest-migration.mjs — Guest→permanent account migration contracts
//
// When a guest (anonymous) player links their account to Discord:
//   1. A new permanent Supabase user is created (via Discord OAuth)
//   2. The guest's anonymous user is the "source_identity"
//   3. The new permanent user is the "target_identity"
//   4. Data is migrated: achievements, stats, match history references
//   5. A migration record is written to account_migrations (service role)
//   6. Idempotency: re-running the same migration is a no-op
//
// The actual Supabase writes happen server-side (service role) because
// the account_migrations table blocks all client writes.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MigrationPlan
 * @property {string} migrationId - Unique migration ID (deterministic)
 * @property {string} sourceIdentity - Guest/anonymous user UUID
 * @property {string} targetIdentity - Permanent user UUID
 * @property {number} migrationVersion - Schema version (1)
 * @property {Array<MigrationStep>} steps - Ordered migration steps
 */

/**
 * @typedef {Object} MigrationStep
 * @property {string} type - 'achievements' | 'stats' | 'ratings' | 'match_history'
 * @property {string} description - Human-readable description
 * @property {boolean} required - Whether the step must succeed
 */

/**
 * Generate a deterministic migration ID from source and target UUIDs.
 * This ensures idempotency — the same source→target pair always
 * produces the same migration ID, so re-running is safe.
 * @param {string} sourceIdentity - Guest user UUID
 * @param {string} targetIdentity - Permanent user UUID
 * @returns {string}
 */
export function migrationId(sourceIdentity, targetIdentity) {
  if (!sourceIdentity || !targetIdentity) throw new Error('source and target identities required');
  if (sourceIdentity === targetIdentity) throw new Error('source and target must be different');
  // Deterministic ID: mig_{source}_{target}
  return `mig_${sourceIdentity}_${targetIdentity}`;
}

/**
 * Build a migration plan for guest→permanent account linking.
 * @param {object} opts
 * @param {string} opts.sourceIdentity - Guest/anonymous user UUID
 * @param {string} opts.targetIdentity - New permanent user UUID
 * @returns {MigrationPlan}
 */
export function buildMigrationPlan({ sourceIdentity, targetIdentity }) {
  if (!sourceIdentity || !targetIdentity) throw new Error('source and target identities required');
  if (sourceIdentity === targetIdentity) throw new Error('cannot migrate to the same identity');

  return {
    migrationId: migrationId(sourceIdentity, targetIdentity),
    sourceIdentity,
    targetIdentity,
    migrationVersion: 1,
    steps: [
      {
        type: 'achievements',
        description: 'Copy account_achievements from guest to permanent user',
        required: true,
      },
      {
        type: 'stats',
        description: 'Copy player_stats from guest to permanent user',
        required: true,
      },
      {
        type: 'ratings',
        description: 'Copy player_ratings from guest to permanent user',
        required: false, // Guests may not have rated matches
      },
      {
        type: 'match_history',
        description: 'Reassign match_participants from guest to permanent user',
        required: false, // Guests may not have online match history
      },
    ],
  };
}

/**
 * Validate that a migration plan is well-formed.
 * @param {MigrationPlan} plan
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateMigrationPlan(plan) {
  if (!plan) return { valid: false, error: 'plan is required' };
  if (!plan.migrationId) return { valid: false, error: 'migrationId is required' };
  if (!plan.sourceIdentity) return { valid: false, error: 'sourceIdentity is required' };
  if (!plan.targetIdentity) return { valid: false, error: 'targetIdentity is required' };
  if (plan.sourceIdentity === plan.targetIdentity) return { valid: false, error: 'source and target must differ' };
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return { valid: false, error: 'steps must be a non-empty array' };
  const expectedId = migrationId(plan.sourceIdentity, plan.targetIdentity);
  if (plan.migrationId !== expectedId) return { valid: false, error: 'migrationId does not match source+target' };
  return { valid: true };
}

/**
 * Check if a migration has already been completed by looking at the
 * migration record. This is used for idempotency.
 * @param {Array<{ migration_id: string, source_identity: string, target_identity: string }>} existingMigrations
 * @param {MigrationPlan} plan
 * @returns {boolean}
 */
export function isMigrationCompleted(existingMigrations, plan) {
  return existingMigrations.some(m => m.migration_id === plan.migrationId);
}

/**
 * Build the SQL operations for a migration step.
 * Returns a description of what the service role should do — not the SQL itself,
 * since the persistor handles the actual database operations.
 * @param {MigrationPlan} plan
 * @param {string} stepType
 * @returns {{ sourceTable: string, targetColumn: string, description: string } | null}
 */
export function describeMigrationStep(plan, stepType) {
  const step = plan.steps.find(s => s.type === stepType);
  if (!step) return null;

  const tableMap = {
    achievements: { sourceTable: 'account_achievements', targetColumn: 'user_id', description: 'Copy achievement unlocks' },
    stats: { sourceTable: 'player_stats', targetColumn: 'user_id', description: 'Copy player statistics' },
    ratings: { sourceTable: 'player_ratings', targetColumn: 'user_id', description: 'Copy competitive ratings' },
    match_history: { sourceTable: 'match_participants', targetColumn: 'user_id', description: 'Reassign match participation' },
  };

  return tableMap[stepType] ?? null;
}
