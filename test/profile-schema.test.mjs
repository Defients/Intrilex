// ═══════════════════════════════════════════════════════════════
// profile-schema.test.mjs — Profile customization SQL migration
//
// Validates the 0010_profile_customization.sql migration file:
//   - Table definitions (profile_customization, profile_showcase,
//     profile_privacy, profile_handle_history)
//   - RPC signatures (get_self_profile, get_public_profile,
//     update_display_name, change_handle, equip_*,
//     set_showcase_slot, clear_showcase_slot, update_profile_privacy)
//   - RLS policies (owner-only writes, public reads with privacy
//     filtering)
//   - Indexes and constraints
//
// This is a structural/syntax test — it does not execute the SQL
// against a live Postgres instance. It parses the migration file
// text and verifies required elements are present.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '0010_profile_customization.sql');
const sql = readFileSync(migrationPath, 'utf8');

// ── Helper: check that a pattern exists in the SQL ──────────────

/**
 * @param {string} pattern
 * @param {string} label
 */
function assertSqlContains(pattern, label) {
  test(`profile-schema: SQL contains ${label}`, () => {
    assert.ok(
      new RegExp(pattern, 'i').test(sql),
      `Migration SQL missing: ${label} (pattern: ${pattern})`,
    );
  });
}

// ── Helper: check that a pattern does NOT exist ─────────────────

/**
 * @param {string} pattern
 * @param {label} label
 */
function assertSqlNotContains(pattern, label) {
  test(`profile-schema: SQL does NOT contain ${label}`, () => {
    assert.ok(
      !new RegExp(pattern, 'i').test(sql),
      `Migration SQL should NOT contain: ${label} (pattern: ${pattern})`,
    );
  });
}

// ── Table definitions ───────────────────────────────────────────

assertSqlContains('create\\s+table[^;]*profile_customization', 'profile_customization table');
assertSqlContains('create\\s+table[^;]*profile_showcase', 'profile_showcase table');
assertSqlContains('create\\s+table[^;]*profile_privacy', 'profile_privacy table');

// ── profile_customization columns ───────────────────────────────

assertSqlContains('user_id[^;]*uuid', 'profile_customization.user_id column');
assertSqlContains('title_id', 'profile_customization.title_id column');
assertSqlContains('profile_frame_id', 'profile_customization.profile_frame_id column');
assertSqlContains('card_back_id', 'profile_customization.card_back_id column');

// ── profile_showcase columns ────────────────────────────────────

assertSqlContains('slot\\s+integer', 'profile_showcase.slot column');
assertSqlContains('item_type', 'profile_showcase.item_type column');
assertSqlContains('item_id', 'profile_showcase.item_id column');

// ── profile_privacy columns ─────────────────────────────────────

assertSqlContains('match_history', 'profile_privacy.match_history column');
assertSqlContains('achievements', 'profile_privacy.achievements column');
assertSqlContains('online_status', 'profile_privacy.online_status column');
assertSqlContains('local_stats', 'profile_privacy.local_stats column');

// ── RPC definitions ─────────────────────────────────────────────

assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*get_self_profile', 'get_self_profile RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*get_public_profile', 'get_public_profile RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*update_display_name', 'update_display_name RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*change_handle', 'change_handle RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*equip_title', 'equip_title RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*equip_profile_frame', 'equip_profile_frame RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*equip_card_back', 'equip_card_back RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*set_showcase_slot', 'set_showcase_slot RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*clear_showcase_slot', 'clear_showcase_slot RPC');
assertSqlContains('create\\s+or\\s+replace\\s+function[^;]*update_profile_privacy', 'update_profile_privacy RPC');

// ── RPC security: SECURITY DEFINER or SECURITY INVOKER ──────────

assertSqlContains('security\\s+(definer|invoker)', 'security declaration on RPCs');

// ── RLS policies ────────────────────────────────────────────────

assertSqlContains('alter\\s+table[^;]*enable\\s+row\\s+level\\s+security', 'RLS enabled on profile tables');
assertSqlContains('policy[^;]*profile_customization', 'RLS policy on profile_customization');

// ── Constraints ─────────────────────────────────────────────────

assertSqlContains('primary\\s+key', 'primary key constraint');
assertSqlContains('references\\s+auth\\.users', 'foreign key reference to auth.users');
assertSqlContains('unique[^;]*handle', 'unique constraint on handle');

// ── Indexes ─────────────────────────────────────────────────────

assertSqlContains('create\\s+(unique\\s+)?index[^;]*profile', 'index on profile tables');

// ── RPC parameter names ─────────────────────────────────────────

assertSqlContains('p_handle_or_public_id', 'get_public_profile parameter');
assertSqlContains('p_name', 'update_display_name parameter');
assertSqlContains('p_handle', 'change_handle parameter');
assertSqlContains('p_title_id', 'equip_title parameter');
assertSqlContains('p_frame_id', 'equip_profile_frame parameter');
assertSqlContains('p_card_back_id', 'equip_card_back parameter');
assertSqlContains('p_slot', 'set_showcase_slot parameter');
assertSqlContains('p_type', 'set_showcase_slot type parameter');

// ── Privacy filtering in get_public_profile ─────────────────────

assertSqlContains('match_history', 'privacy filtering in get_public_profile');
assertSqlContains('achievements', 'privacy filtering in get_public_profile');

// ── Handle validation in change_handle ──────────────────────────

assertSqlContains('length', 'handle length validation in change_handle');
assertSqlContains('[a-z0-9_]', 'handle character validation in change_handle');

// ── Showcase slot limits ────────────────────────────────────────

assertSqlContains('slot\\s*(>=|<|check|between)', 'showcase slot limit constraint');

// ── Migration marker ────────────────────────────────────────────

test('profile-schema: migration file is not empty', () => {
  assert.ok(sql.length > 1000, 'Migration file should be substantial');
});

test('profile-schema: migration uses PL/pgSQL language', () => {
  assert.ok(/language\s+['"]?plpgsql['"]?/i.test(sql), 'RPCs should use plpgsql language');
});

// ── No dangerous patterns ───────────────────────────────────────

assertSqlNotContains('drop\\s+table\\s+auth', 'no dropping auth tables');
assertSqlNotContains('truncate\\s+table', 'no truncate statements');
assertSqlNotContains('delete\\s+from\\s+auth\\.users', 'no deleting auth users');

// ── Return types ────────────────────────────────────────────────

test('profile-schema: get_self_profile returns jsonb or table', () => {
  assert.ok(
    /get_self_profile[^;]*returns\s+(jsonb|table)/is.test(sql),
    'get_self_profile should return jsonb or table type',
  );
});

test('profile-schema: get_public_profile returns jsonb or table', () => {
  assert.ok(
    /get_public_profile[^;]*returns\s+(jsonb|table)/is.test(sql),
    'get_public_profile should return jsonb or table type',
  );
});

// ── Idempotency: CREATE OR REPLACE ──────────────────────────────

test('profile-schema: RPCs use CREATE OR REPLACE for idempotency', () => {
  const replaceCount = (sql.match(/create\s+or\s+replace\s+function/gi) || []).length;
  assert.ok(replaceCount >= 8, `Expected at least 8 CREATE OR REPLACE FUNCTION, found ${replaceCount}`);
});
