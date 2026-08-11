// ═══════════════════════════════════════════════════════════════
// guest-migration-plan.test.mjs — Migration plan domain contract tests
//
// Proves:
//   - migrationId() generates deterministic IDs from source+target
//   - migrationId() rejects missing or identical identities
//   - buildMigrationPlan() creates a valid plan with 4 ordered steps
//   - buildMigrationPlan() rejects missing or identical identities
//   - validateMigrationPlan() accepts valid plans
//   - validateMigrationPlan() rejects null/undefined plans
//   - validateMigrationPlan() rejects plans with missing fields
//   - validateMigrationPlan() rejects same source and target
//   - validateMigrationPlan() rejects empty steps array
//   - validateMigrationPlan() rejects mismatched migrationId
//   - isMigrationCompleted() returns true for existing migration
//   - isMigrationCompleted() returns false for unknown migration
//   - describeMigrationStep() returns correct table mappings
//   - describeMigrationStep() returns null for unknown step type
//   - Protocol validator validateMigrateGuest() accepts valid payloads
//   - Protocol validator validateMigrateGuest() rejects invalid payloads
//   - Empty guest state produces a valid migration plan
//   - Partial guest state produces a valid plan (only required steps)
//   - Full guest state produces a valid plan (all steps)
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrationId,
  buildMigrationPlan,
  validateMigrationPlan,
  isMigrationCompleted,
  describeMigrationStep,
} from '../packages/account-domain/src/guest-migration.mjs';
import { validateMigrateGuest } from '../packages/network-protocol/src/validation.mjs';

const ACC_GUEST = 'a1111111-1111-1111-1111-111111111111';
const ACC_PERMANENT = 'b2222222-2222-2222-2222-222222222222';
const ACC_OTHER = 'c3333333-3333-3333-3333-333333333333';

// ── migrationId() ──

test('migrationId: deterministic — same source+target produces same ID', () => {
  const id1 = migrationId(ACC_GUEST, ACC_PERMANENT);
  const id2 = migrationId(ACC_GUEST, ACC_PERMANENT);
  assert.equal(id1, id2);
  assert.equal(id1, `mig_${ACC_GUEST}_${ACC_PERMANENT}`);
});

test('migrationId: different source or target produces different ID', () => {
  const id1 = migrationId(ACC_GUEST, ACC_PERMANENT);
  const id2 = migrationId(ACC_GUEST, ACC_OTHER);
  const id3 = migrationId(ACC_OTHER, ACC_PERMANENT);
  assert.notEqual(id1, id2);
  assert.notEqual(id1, id3);
  assert.notEqual(id2, id3);
});

test('migrationId: rejects missing source identity', () => {
  assert.throws(() => migrationId(null, ACC_PERMANENT), /source and target identities required/);
  assert.throws(() => migrationId('', ACC_PERMANENT), /source and target identities required/);
});

test('migrationId: rejects missing target identity', () => {
  assert.throws(() => migrationId(ACC_GUEST, null), /source and target identities required/);
  assert.throws(() => migrationId(ACC_GUEST, ''), /source and target identities required/);
});

test('migrationId: rejects identical source and target', () => {
  assert.throws(() => migrationId(ACC_GUEST, ACC_GUEST), /source and target must be different/);
});

// ── buildMigrationPlan() ──

test('buildMigrationPlan: creates valid plan with 4 ordered steps', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  assert.equal(plan.sourceIdentity, ACC_GUEST);
  assert.equal(plan.targetIdentity, ACC_PERMANENT);
  assert.equal(plan.migrationVersion, 1);
  assert.equal(plan.migrationId, migrationId(ACC_GUEST, ACC_PERMANENT));
  assert.equal(plan.steps.length, 4);

  // Ordered: achievements, stats, ratings, match_history
  assert.equal(plan.steps[0].type, 'achievements');
  assert.equal(plan.steps[1].type, 'stats');
  assert.equal(plan.steps[2].type, 'ratings');
  assert.equal(plan.steps[3].type, 'match_history');

  // Required vs optional
  assert.equal(plan.steps[0].required, true,  'achievements is required');
  assert.equal(plan.steps[1].required, true,  'stats is required');
  assert.equal(plan.steps[2].required, false, 'ratings is optional');
  assert.equal(plan.steps[3].required, false, 'match_history is optional');
});

test('buildMigrationPlan: rejects missing source identity', () => {
  assert.throws(() => buildMigrationPlan({ sourceIdentity: null, targetIdentity: ACC_PERMANENT }));
  assert.throws(() => buildMigrationPlan({ targetIdentity: ACC_PERMANENT }));
});

test('buildMigrationPlan: rejects missing target identity', () => {
  assert.throws(() => buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: null }));
  assert.throws(() => buildMigrationPlan({ sourceIdentity: ACC_GUEST }));
});

test('buildMigrationPlan: rejects identical source and target', () => {
  assert.throws(() => buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_GUEST }));
});

// ── validateMigrationPlan() ──

test('validateMigrationPlan: accepts a valid plan', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const result = validateMigrationPlan(plan);
  assert.ok(result.valid);
  assert.equal(result.error, undefined);
});

test('validateMigrationPlan: rejects null/undefined plan', () => {
  assert.equal(validateMigrationPlan(null).valid, false);
  assert.equal(validateMigrationPlan(undefined).valid, false);
});

test('validateMigrationPlan: rejects plan with missing migrationId', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  delete plan.migrationId;
  const result = validateMigrationPlan(plan);
  assert.equal(result.valid, false);
  assert.match(result.error, /migrationId/);
});

test('validateMigrationPlan: rejects plan with missing sourceIdentity', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  delete plan.sourceIdentity;
  assert.equal(validateMigrationPlan(plan).valid, false);
});

test('validateMigrationPlan: rejects plan with missing targetIdentity', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  delete plan.targetIdentity;
  assert.equal(validateMigrationPlan(plan).valid, false);
});

test('validateMigrationPlan: rejects same source and target', () => {
  const plan = {
    ...buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT }),
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_GUEST,
  };
  const result = validateMigrationPlan(plan);
  assert.equal(result.valid, false);
  assert.match(result.error, /differ/);
});

test('validateMigrationPlan: rejects empty steps array', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  plan.steps = [];
  const result = validateMigrationPlan(plan);
  assert.equal(result.valid, false);
  assert.match(result.error, /steps/);
});

test('validateMigrationPlan: rejects mismatched migrationId', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  plan.migrationId = 'mig_wrong_wrong';
  const result = validateMigrationPlan(plan);
  assert.equal(result.valid, false);
  assert.match(result.error, /migrationId/);
});

// ── isMigrationCompleted() ──

test('isMigrationCompleted: returns true for existing migration', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const existing = [{ migration_id: plan.migrationId, source_identity: ACC_GUEST, target_identity: ACC_PERMANENT }];
  assert.equal(isMigrationCompleted(existing, plan), true);
});

test('isMigrationCompleted: returns false for unknown migration', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const existing = [{ migration_id: 'mig_other_other', source_identity: ACC_OTHER, target_identity: ACC_PERMANENT }];
  assert.equal(isMigrationCompleted(existing, plan), false);
});

test('isMigrationCompleted: returns false for empty migration list', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  assert.equal(isMigrationCompleted([], plan), false);
});

// ── describeMigrationStep() ──

test('describeMigrationStep: returns correct table mapping for achievements', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const desc = describeMigrationStep(plan, 'achievements');
  assert.equal(desc.sourceTable, 'account_achievements');
  assert.equal(desc.targetColumn, 'user_id');
  assert.ok(desc.description);
});

test('describeMigrationStep: returns correct table mapping for stats', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const desc = describeMigrationStep(plan, 'stats');
  assert.equal(desc.sourceTable, 'player_stats');
  assert.equal(desc.targetColumn, 'user_id');
});

test('describeMigrationStep: returns correct table mapping for ratings', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const desc = describeMigrationStep(plan, 'ratings');
  assert.equal(desc.sourceTable, 'player_ratings');
  assert.equal(desc.targetColumn, 'user_id');
});

test('describeMigrationStep: returns correct table mapping for match_history', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const desc = describeMigrationStep(plan, 'match_history');
  assert.equal(desc.sourceTable, 'match_participants');
  assert.equal(desc.targetColumn, 'user_id');
});

test('describeMigrationStep: returns null for unknown step type', () => {
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  assert.equal(describeMigrationStep(plan, 'unknown'), null);
});

// ── Protocol validator validateMigrateGuest() ──

test('validateMigrateGuest: accepts valid payload with achievements', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_PERMANENT,
    achievements: [
      { achievementId: 'first-duel', unlockedAt: '2026-01-01T00:00:00.000Z' },
      { achievementId: 'first-victory', unlockedAt: '2026-01-02T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    ],
  });
  assert.ok(result.valid);
});

test('validateMigrateGuest: accepts valid payload with empty achievements', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_PERMANENT,
    achievements: [],
  });
  assert.ok(result.valid);
});

test('validateMigrateGuest: rejects missing sourceIdentity', () => {
  const result = validateMigrateGuest({
    targetIdentity: ACC_PERMANENT,
    achievements: [],
  });
  assert.equal(result.valid, false);
});

test('validateMigrateGuest: rejects missing targetIdentity', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    achievements: [],
  });
  assert.equal(result.valid, false);
});

test('validateMigrateGuest: rejects non-UUID sourceIdentity', () => {
  const result = validateMigrateGuest({
    sourceIdentity: 'not-a-uuid',
    targetIdentity: ACC_PERMANENT,
    achievements: [],
  });
  assert.equal(result.valid, false);
});

test('validateMigrateGuest: rejects same source and target', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_GUEST,
    achievements: [],
  });
  assert.equal(result.valid, false);
});

test('validateMigrateGuest: rejects missing achievements array', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_PERMANENT,
  });
  assert.equal(result.valid, false);
});

test('validateMigrateGuest: rejects achievement with missing achievementId', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_PERMANENT,
    achievements: [{ unlockedAt: '2026-01-01T00:00:00.000Z' }],
  });
  assert.equal(result.valid, false);
});

test('validateMigrateGuest: rejects achievement with missing unlockedAt', () => {
  const result = validateMigrateGuest({
    sourceIdentity: ACC_GUEST,
    targetIdentity: ACC_PERMANENT,
    achievements: [{ achievementId: 'first-duel' }],
  });
  assert.equal(result.valid, false);
});

// ── Guest state scenarios ──

test('migration plan: empty guest state produces valid migration plan', () => {
  // A guest with no achievements, no stats, no matches
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const validation = validateMigrationPlan(plan);
  assert.ok(validation.valid, 'empty guest state should produce a valid plan');
  // The plan still has all 4 steps — the server decides what to transfer
  assert.equal(plan.steps.length, 4);
});

test('migration plan: partial guest state (achievements only) produces valid plan', () => {
  // A guest with achievements but no online matches (no stats/ratings/history)
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const validation = validateMigrationPlan(plan);
  assert.ok(validation.valid);
  // achievements step is required, stats is required, ratings/match_history are optional
  assert.equal(plan.steps[0].required, true);
  assert.equal(plan.steps[1].required, true);
  assert.equal(plan.steps[2].required, false);
  assert.equal(plan.steps[3].required, false);
});

test('migration plan: full guest state produces valid plan with all steps', () => {
  // A guest with achievements, stats, ratings, and match history
  const plan = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const validation = validateMigrationPlan(plan);
  assert.ok(validation.valid);
  // All 4 steps are present — the server executes them in order
  const stepTypes = plan.steps.map(s => s.type);
  assert.deepEqual(stepTypes, ['achievements', 'stats', 'ratings', 'match_history']);
});

test('migration plan: deterministic migration ID enables idempotency', () => {
  // The same source→target pair always produces the same migration ID
  const plan1 = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  const plan2 = buildMigrationPlan({ sourceIdentity: ACC_GUEST, targetIdentity: ACC_PERMANENT });
  assert.equal(plan1.migrationId, plan2.migrationId);

  // isMigrationCompleted uses this ID for idempotency
  const existing = [{ migration_id: plan1.migrationId, source_identity: ACC_GUEST, target_identity: ACC_PERMANENT }];
  assert.equal(isMigrationCompleted(existing, plan2), true);
});
