// ═══════════════════════════════════════════════════════════════
// supabase-schema.test.mjs — Schema migration structural validation
//
// Validates the SQL migration files without requiring a running
// Supabase instance. Checks for:
//   - All migrations exist and are non-empty
//   - RLS is enabled on all tables
//   - No client-writable paths for server-authoritative tables
//   - Required columns and constraints are present
//   - Profile provisioning trigger exists
//   - Reserved handles are enforced
//   - config.toml has required sections
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const configPath = path.join(root, 'supabase', 'config.toml');

async function readMigration(name) {
  const filePath = path.join(migrationsDir, name);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf8');
}

test('schema: supabase directory structure exists', async () => {
  assert.ok(existsSync(migrationsDir), 'supabase/migrations/ must exist');
  assert.ok(existsSync(configPath), 'supabase/config.toml must exist');
  assert.ok(existsSync(path.join(root, 'supabase', 'seed.sql')), 'supabase/seed.sql must exist');
});

test('schema: all 7 migration files exist and are non-empty', async () => {
  const files = await readdir(migrationsDir);
  const expected = [
    '0001_profiles.sql',
    '0002_account_settings.sql',
    '0003_competitive.sql',
    '0004_match_history.sql',
    '0005_achievements.sql',
    '0006_moderation.sql',
    '0007_migration_meta.sql',
  ];
  for (const name of expected) {
    assert.ok(files.includes(name), `migration ${name} must exist`);
    const content = await readMigration(name);
    assert.ok(content && content.length > 100, `migration ${name} must be non-trivial`);
  }
});

test('schema: profiles table has RLS enabled', async () => {
  const sql = await readMigration('0001_profiles.sql');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'profiles must enable RLS');
  assert.ok(sql.includes('CREATE POLICY profiles_owner_select'), 'profiles must have owner SELECT policy');
  assert.ok(sql.includes('CREATE POLICY profiles_owner_update'), 'profiles must have owner UPDATE policy');
  // No direct INSERT policy for authenticated — trigger-driven only
  assert.ok(!sql.includes('FOR INSERT TO authenticated'), 'profiles must not allow client INSERT');
});

test('schema: profiles has public_player_id UNIQUE constraint', async () => {
  const sql = await readMigration('0001_profiles.sql');
  assert.ok(sql.includes('public_player_id'), 'profiles must have public_player_id column');
  assert.ok(sql.includes('UNIQUE'), 'public_player_id must be UNIQUE');
});

test('schema: profiles has handle format and reserved-name constraints', async () => {
  const sql = await readMigration('0001_profiles.sql');
  assert.ok(sql.includes('profiles_handle_format'), 'handle format CHECK constraint must exist');
  assert.ok(sql.includes('profiles_handle_not_reserved'), 'reserved handle CHECK must exist');
  assert.ok(sql.includes('admin'), 'reserved list must include "admin"');
  assert.ok(sql.includes('intrilex'), 'reserved list must include "intrilex"');
});

test('schema: profile provisioning trigger exists', async () => {
  const sql = await readMigration('0001_profiles.sql');
  assert.ok(sql.includes('handle_new_user'), 'handle_new_user function must exist');
  assert.ok(sql.includes('SECURITY DEFINER'), 'handle_new_user must be SECURITY DEFINER');
  assert.ok(sql.includes('on_auth_user_created'), 'auth user trigger must exist');
  assert.ok(sql.includes('PLY_'), 'handle_new_user must generate PLY_ prefix');
  assert.ok(sql.includes('gen_random_bytes'), 'handle_new_user must use crypto random');
});

test('schema: competitive tables block client writes', async () => {
  const sql = await readMigration('0003_competitive.sql');
  assert.ok(sql.includes('player_ratings'), 'player_ratings table must exist');
  assert.ok(sql.includes('player_stats'), 'player_stats table must exist');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
  // Only SELECT policies — no INSERT/UPDATE/DELETE for authenticated
  assert.ok(!sql.includes('FOR INSERT TO authenticated'), 'player_ratings must not allow client INSERT');
  assert.ok(!sql.includes('FOR UPDATE TO authenticated'), 'player_ratings must not allow client UPDATE');
  assert.ok(!sql.includes('FOR DELETE TO authenticated'), 'player_ratings must not allow client DELETE');
});

test('schema: match history tables block client writes', async () => {
  const sql = await readMigration('0004_match_history.sql');
  assert.ok(sql.includes('public.matches'), 'matches table must exist');
  assert.ok(sql.includes('match_participants'), 'match_participants table must exist');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
  assert.ok(!sql.includes('FOR INSERT TO authenticated'), 'matches must not allow client INSERT');
  assert.ok(!sql.includes('FOR UPDATE TO authenticated'), 'matches must not allow client UPDATE');
});

test('schema: achievements allow local-provenance client INSERT only', async () => {
  const sql = await readMigration('0005_achievements.sql');
  assert.ok(sql.includes('account_achievements'), 'account_achievements table must exist');
  assert.ok(sql.includes('provenance'), 'achievements must have provenance column');
  assert.ok(sql.includes("provenance IN ('SERVER', 'LOCAL_DEVICE', 'LOCAL_AI', 'UNVERIFIED')"), 'provenance CHECK must exist');
  // Client can INSERT only LOCAL_DEVICE/LOCAL_AI/UNVERIFIED
  assert.ok(sql.includes("provenance IN ('LOCAL_DEVICE', 'LOCAL_AI', 'UNVERIFIED')"), 'client INSERT must be local-only');
});

test('schema: moderation table blocks all client access except owner SELECT', async () => {
  const sql = await readMigration('0006_moderation.sql');
  assert.ok(sql.includes('account_moderation'), 'account_moderation table must exist');
  assert.ok(sql.includes('status'), 'moderation must have status column');
  assert.ok(sql.includes("'ACTIVE', 'SUSPENDED', 'BANNED'"), 'status CHECK must exist');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
  // Only SELECT — no INSERT/UPDATE/DELETE for authenticated
  assert.ok(!sql.includes('FOR INSERT TO authenticated'), 'moderation must not allow client INSERT');
  assert.ok(!sql.includes('FOR UPDATE TO authenticated'), 'moderation must not allow client UPDATE');
});

test('schema: config.toml has required sections', async () => {
  const config = await readFile(configPath, 'utf8');
  assert.ok(config.includes('project_id'), 'config must have project_id');
  assert.ok(config.includes('[api]'), 'config must have [api] section');
  assert.ok(config.includes('[db]'), 'config must have [db] section');
  assert.ok(config.includes('[auth]'), 'config must have [auth] section');
  assert.ok(config.includes('enable_anonymous_sign_ins'), 'config must enable anonymous sign-ins');
});

test('schema: config.toml has Discord OAuth placeholder', async () => {
  const config = await readFile(configPath, 'utf8');
  assert.ok(config.includes('[auth.external.discord]'), 'config must have Discord OAuth section');
  assert.ok(config.includes('enabled = false'), 'Discord OAuth must be disabled by default');
});

test('schema: .env.example documents required variables', async () => {
  const envExample = await readFile(path.join(root, '.env.example'), 'utf8');
  assert.ok(envExample.includes('SUPABASE_URL'), '.env.example must document SUPABASE_URL');
  assert.ok(envExample.includes('SUPABASE_PUBLISHABLE_KEY'), '.env.example must document SUPABASE_PUBLISHABLE_KEY');
  assert.ok(envExample.includes('SUPABASE_SECRET_KEY'), '.env.example must document SUPABASE_SECRET_KEY');
  assert.ok(envExample.includes('INTRILEX_AUTH_MODE'), '.env.example must document INTRILEX_AUTH_MODE');
  assert.ok(envExample.includes('NEVER'), '.env.example must warn about secrets');
});
