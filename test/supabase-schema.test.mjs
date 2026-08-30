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
const hardeningMigration = '20260830074714_harden_authority_and_persistence.sql';

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

test('schema: all migration files exist and are non-empty', async () => {
  const files = await readdir(migrationsDir);
  const expected = [
    '0001_profiles.sql',
    '0002_account_settings.sql',
    '0003_competitive.sql',
    '0004_match_history.sql',
    '0005_achievements.sql',
    '0006_moderation.sql',
    '0007_migration_meta.sql',
    '0008_service_role_grants.sql',
    '0009_ranked_leaderboard.sql',
    '0010_profile_customization.sql',
    '0011_tier_helpers_and_indexes.sql',
    '0012_atomic_persist_match_result.sql',
    '0013_player_directory.sql',
    '0014_authenticated_grants.sql',
    '0015_recent_opponents.sql',
    '0016_player_relationships.sql',
    '0017_revoke_public_execute_on_security_definer_functions.sql',
    '0018_achievement_catalog_constraint.sql',
    '0019_remove_season_fabrication.sql',
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
  // service_role must have explicit GRANT (strict role model)
  assert.ok(sql.includes('GRANT') && sql.includes('service_role'),
    'moderation must grant service_role access (caused production outage without it)');
});

test('schema: migration 0025 grants service_role on all server-owned tables', async () => {
  const sql = await readMigration('0025_service_role_grants_followup.sql');
  assert.ok(sql, '0025_service_role_grants_followup.sql must exist');
  assert.ok(sql.includes('GRANT') && sql.includes('account_moderation'),
    '0025 must grant on account_moderation');
  assert.ok(sql.includes('GRANT') && sql.includes('tournaments'),
    '0025 must grant on tournaments');
  assert.ok(sql.includes('GRANT') && sql.includes('tournament_participants'),
    '0025 must grant on tournament_participants');
  assert.ok(sql.includes('GRANT') && sql.includes('tournament_matches'),
    '0025 must grant on tournament_matches');
  assert.ok(sql.includes('GRANT') && sql.includes('player_reports'),
    '0025 must grant on player_reports');
  assert.ok(sql.includes('GRANT') && sql.includes('player_relationships'),
    '0025 must grant on player_relationships');
  assert.ok(sql.includes('GRANT EXECUTE') && sql.includes('upsert_tournament_atomic'),
    '0025 must grant EXECUTE on upsert_tournament_atomic to service_role');
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

test('schema: authority hardening migration is forward-only and service-role gated', async () => {
  const sql = await readMigration(hardeningMigration);
  assert.ok(sql && sql.length > 1000, `${hardeningMigration} must exist and be non-trivial`);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS queue_id text NOT NULL DEFAULT 'casual'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS season_id text/);
  assert.match(sql, /pg_advisory_xact_lock/g, 'concurrent result, report, and tournament writes need transaction locks');
  assert.match(sql, /RANKED_SEASON_REQUIRED/, 'ranked persistence must fail closed without a real season');
  assert.match(sql, /ALTER FUNCTION public\.persist_match_result_unlocked\(jsonb\) SET search_path = ''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.persist_match_result\(jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.persist_match_result\(jsonb\) TO service_role/);
});

test('schema: report and tournament authority never expose service RPCs to clients', async () => {
  const sql = await readMigration(hardeningMigration);
  assert.match(sql, /submit_player_report_server/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.submit_player_report_server\(uuid, uuid, text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_player_report_server\(uuid, uuid, text, text, text\)[\s\S]*TO service_role/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.upsert_tournament_atomic/);
  assert.match(sql, /SET search_path = ''/g);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.upsert_tournament_atomic\(jsonb, jsonb, jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE SELECT ON public\.tournament_participants FROM anon, authenticated/);
  assert.match(sql, /DROP POLICY IF EXISTS tournament_participants_select/);
});

// ── Migration 0009: Ranked Leaderboard ecosystem ──

test('schema: ranked_seasons table exists with RLS and single-active guard', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.ranked_seasons'), 'ranked_seasons table must exist');
  assert.ok(sql.includes("status IN ('UPCOMING','ACTIVE','FINALIZING','ARCHIVED')"), 'season status CHECK must exist');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'ranked_seasons must enable RLS');
  // Single-active-season invariant guard (partial unique index)
  assert.ok(sql.includes('ranked_seasons_one_active'), 'single-active-season guard index must exist');
  assert.ok(sql.includes("WHERE status = 'ACTIVE'"), 'guard must be scoped to ACTIVE status');
  // No client writes
  assert.ok(!sql.match(/FOR (INSERT|UPDATE|DELETE) TO authenticated.*ranked_seasons/s), 'ranked_seasons must not allow client writes');
});

test('schema: player_ratings extended with Glicko-2 state + peak + placements', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes('rating_deviation'), 'rating_deviation column must be added');
  assert.ok(sql.includes('volatility'), 'volatility column must be added');
  assert.ok(sql.includes('peak_rating'), 'peak_rating column must be added');
  assert.ok(sql.includes('placements_played'), 'placements_played column must be added');
  assert.ok(sql.includes('last_rated_at'), 'last_rated_at column must be added');
  // Leaderboard index
  assert.ok(sql.includes('player_ratings_leaderboard_idx'), 'leaderboard index must exist');
  assert.ok(sql.includes('rating DESC'), 'index must order by rating DESC');
});

test('schema: rating_events ledger has idempotency constraint + RLS', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rating_events'), 'rating_events table must exist');
  assert.ok(sql.includes('UNIQUE (match_id, user_id)'), 'idempotency UNIQUE constraint must exist');
  assert.ok(sql.includes('algorithm_version'), 'algorithm_version must be tracked');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'rating_events must enable RLS');
  // Owner-only SELECT; no client INSERT/UPDATE/DELETE
  assert.ok(sql.includes('rating_events_owner_select'), 'owner SELECT policy must exist');
  assert.ok(!sql.match(/FOR (INSERT|UPDATE|DELETE) TO authenticated.*rating_events/s), 'rating_events must not allow client writes');
});

test('schema: ranked_season_archive is read-only to clients', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes('ranked_season_archive'), 'archive table must exist');
  assert.ok(sql.includes('final_position'), 'archive must store final_position');
  assert.ok(sql.includes('peak_rating'), 'archive must store peak_rating');
  assert.ok(sql.includes('peak_tier'), 'archive must store peak_tier');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'archive must enable RLS');
  assert.ok(!sql.match(/FOR (INSERT|UPDATE|DELETE) TO authenticated.*archive/s), 'archive must not allow client writes');
});

test('schema: leaderboard RPCs are SECURITY DEFINER with locked search_path', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes('get_ranked_leaderboard'), 'leaderboard RPC must exist');
  assert.ok(sql.includes('get_player_standing'), 'player standing RPC must exist');
  assert.ok(sql.includes('get_ranked_seasons'), 'seasons RPC must exist');
  assert.ok(sql.includes('get_player_season_history'), 'season history RPC must exist');
  // All RPCs must be SECURITY DEFINER with locked search_path (section 64)
  const secDefCount = (sql.match(/SECURITY DEFINER/g) || []).length;
  assert.ok(secDefCount >= 4, 'all 4 leaderboard RPCs must be SECURITY DEFINER');
  assert.ok(sql.includes("SET search_path = public"), 'RPCs must lock search_path');
  // RPCs must use ROW_NUMBER (derived position, not stored mutable state)
  assert.ok(sql.includes('ROW_NUMBER()'), 'RPCs must derive position via ROW_NUMBER');
  // RPCs must exclude banned players
  assert.ok(sql.includes("m.status = 'ACTIVE'"), 'RPCs must exclude banned/suspended players');
  // RPCs must not expose auth uuid as a returned column — they use public_player_id
  assert.ok(sql.includes('public_player_id'), 'RPCs must return safe public_player_id');
  // The leaderboard RPC's RETURNS block lists safe columns only (no user_id column)
  const lbBlock = sql.split('get_ranked_leaderboard')[1].split('get_player_standing')[0];
  assert.ok(!lbBlock.includes('user_id'), 'get_ranked_leaderboard RETURNS block must not list user_id');
});

test('schema: leaderboard RPC grants execute to authenticated (read-only)', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_ranked_leaderboard TO authenticated'), 'leaderboard RPC must be executable by authenticated');
  // No GRANT INSERT/UPDATE/DELETE on the new tables to authenticated
  assert.ok(!sql.match(/GRANT (INSERT|UPDATE|DELETE) ON TABLE.*TO authenticated/s), 'no client write grants on ranked tables');
});

test('schema: first season is seeded idempotently', async () => {
  const sql = await readMigration('0009_ranked_leaderboard.sql');
  assert.ok(sql.includes("season-1"), 'first season must be seeded');
  assert.ok(sql.includes("ON CONFLICT (season_id) DO NOTHING"), 'season seed must be idempotent');
  assert.ok(sql.includes("'ACTIVE'"), 'seeded season must be ACTIVE');
});

// ── IRX-C09 / IRX-H44: Privilege hardening (migration 0017) ──

test('IRX-C09: migration 0017 revokes PUBLIC EXECUTE on persist_match_result', async () => {
  const sql = await readMigration('0017_revoke_public_execute_on_security_definer_functions.sql');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.persist_match_result(jsonb) FROM PUBLIC'),
    'must revoke PUBLIC EXECUTE on persist_match_result');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.persist_match_result(jsonb) TO service_role'),
    'must grant EXECUTE to service_role only');
  // Must NOT grant to authenticated or anon
  assert.ok(!sql.match(/GRANT EXECUTE.*persist_match_result.*TO (authenticated|anon)/),
    'must NOT grant persist_match_result to client roles');
});

test('IRX-H44: migration 0017 revokes PUBLIC EXECUTE on _resolve_target_user_id', async () => {
  const sql = await readMigration('0017_revoke_public_execute_on_security_definer_functions.sql');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public._resolve_target_user_id(text) FROM PUBLIC'),
    'must revoke PUBLIC EXECUTE on _resolve_target_user_id');
  // Must NOT grant to any client role — internal helper only
  assert.ok(!sql.match(/GRANT EXECUTE.*_resolve_target_user_id.*TO (authenticated|anon|service_role)/),
    'must NOT grant _resolve_target_user_id to any role — internal only');
});

test('IRX-C09/H44: migration 0017 revokes PUBLIC EXECUTE on every SECURITY DEFINER function', async () => {
  const sql = await readMigration('0017_revoke_public_execute_on_security_definer_functions.sql');
  // Every SECURITY DEFINER function must have a REVOKE FROM PUBLIC line
  const secDefFunctions = [
    'handle_new_user()',
    'update_updated_at()',
    'get_ranked_leaderboard(text, text, text, text, integer, integer)',
    'get_player_standing(text, text, uuid)',
    'get_ranked_seasons(text)',
    'get_player_season_history(text, uuid)',
    'get_self_profile()',
    'update_display_name(text)',
    'change_handle(text)',
    'update_profile_privacy(text, text, text, text)',
    'equip_title(text)',
    'equip_profile_frame(text)',
    'equip_card_back(text)',
    'set_showcase_slot(integer, text, text)',
    'clear_showcase_slot(integer)',
    'persist_match_result(jsonb)',
    'get_player_directory(text, text, text, integer, integer)',
    'get_player_directory_count(text, text)',
    'set_directory_visible(boolean)',
    'get_public_profile(text)',
    'get_recent_opponents(integer, integer)',
    '_resolve_target_user_id(text)',
    'follow_player(text)',
    'unfollow_player(text)',
    'set_rival(text)',
    'unset_rival(text)',
    'block_player(text)',
    'unblock_player(text)',
    'get_relationships(text, integer, integer)',
    'get_relationship_status(text)',
    'get_suggested_rivals(integer)',
  ];
  for (const sig of secDefFunctions) {
    assert.ok(
      sql.includes(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC`),
      `must revoke PUBLIC EXECUTE on ${sig}`,
    );
  }
});

test('IRX-C09/H44: migration 0017 does not leave any function with only PUBLIC grant', async () => {
  const sql = await readMigration('0017_revoke_public_execute_on_security_definer_functions.sql');
  // Count REVOKE FROM PUBLIC statements — must cover all SECURITY DEFINER functions
  const revokeCount = (sql.match(/REVOKE EXECUTE ON FUNCTION public\.\S+.*FROM PUBLIC/g) || []).length;
  assert.ok(revokeCount >= 31, `expected at least 31 REVOKE FROM PUBLIC statements, got ${revokeCount}`);
  // Helper functions (non-SECURITY DEFINER) should also be hardened
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.tier_for_rating(integer) FROM PUBLIC'),
    'tier_for_rating must revoke PUBLIC EXECUTE');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.division_for_rating(integer) FROM PUBLIC'),
    'division_for_rating must revoke PUBLIC EXECUTE');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.is_apex_rating(integer) FROM PUBLIC'),
    'is_apex_rating must revoke PUBLIC EXECUTE');
});

test('IRX-C09/H44: migration 0017 preserves intended access patterns', async () => {
  const sql = await readMigration('0017_revoke_public_execute_on_security_definer_functions.sql');
  // Service-role only
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.persist_match_result(jsonb) TO service_role'));
  // Authenticated-only RPCs
  const authGrants = [
    'get_self_profile()',
    'update_display_name(text)',
    'change_handle(text)',
    'get_ranked_leaderboard(text, text, text, text, integer, integer)',
    'get_player_standing(text, text, uuid)',
    'get_recent_opponents(integer, integer)',
    'follow_player(text)',
    'block_player(text)',
    'get_relationships(text, integer, integer)',
  ];
  for (const sig of authGrants) {
    assert.ok(
      sql.includes(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated`),
      `must grant EXECUTE to authenticated for ${sig}`,
    );
  }
  // Public + authenticated (anon can call)
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_player_directory(text, text, text, integer, integer) TO anon'),
    'get_player_directory must be callable by anon');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_player_directory_count(text, text) TO anon'),
    'get_player_directory_count must be callable by anon');
});

// ── IRX-H42: Achievement catalog constraint (migration 0018) ──

test('IRX-H42: migration 0018 creates achievement_catalog with FK constraints', async () => {
  const sql = await readMigration('0018_achievement_catalog_constraint.sql');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.achievement_catalog'),
    'must create achievement_catalog table');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'),
    'catalog must have RLS enabled');
  // FK from account_achievements to catalog
  assert.ok(sql.includes('account_achievements_achievement_id_fk'),
    'must add FK from account_achievements to catalog');
  assert.ok(sql.includes('achievement_progress_achievement_id_fk'),
    'must add FK from achievement_progress to catalog');
  // No client writes to catalog
  assert.ok(!sql.match(/FOR (INSERT|UPDATE|DELETE) TO authenticated.*achievement_catalog/s),
    'catalog must not allow client writes');
});

test('IRX-H42: migration 0018 seeds all 56 authoritative achievement IDs', async () => {
  const sql = await readMigration('0018_achievement_catalog_constraint.sql');
  // The 56 known achievement IDs from packages/achievements
  const expectedIds = [
    'welcome-to-intrilex', 'first-blood', 'twenty-one', 'exactly-enough',
    'read-the-card', 'other-side-of-the-card', 'the-stack-exists', 'not-so-fast',
    'miniature-warfare', 'no-longer-new', 'fair-trade', 'upgrade',
    'gone-forever', 'drop-anchor', 'hold-fast', 'supercharged',
    'two-become-one', 'digging-deeper', 'clean-sweep', 'know-the-table',
    'stack-student', 'denied', 'double-denied', 'nope-three',
    'the-stackening', 'perfect-timing', 'sequence-breaker', 'clean-kill',
    'lucky-seven', 'topdeck-sorcery', 'found-money', 'recursive-seven',
    'seven-heaven', 'queens-court', 'ace-in-the-hole', 'super-authority',
    'stack-theft', 'wild-card', 'photo-finish', 'from-behind',
    'overkill', 'last-card-standing', 'empty-handed-victory', 'plan-b-was-plan-a',
    'turnabout', 'no-shovel-required', 'big-number-good', 'reading-is-overpowered',
    'controlled-chaos', 'window-shopper', 'absolutely-excessive', 'black-magic',
    'getting-dangerous', 'intrilexian', 'spades-scholar', 'card-savant',
  ];
  for (const id of expectedIds) {
    assert.ok(sql.includes(`'${id}'`),
      `migration must seed achievement ID "${id}"`);
  }
  // Must clean up invalid existing rows before adding FK
  assert.ok(sql.includes('DELETE FROM public.account_achievements'),
    'must clean up invalid existing achievement rows');
  assert.ok(sql.includes('DELETE FROM public.achievement_progress'),
    'must clean up invalid existing progress rows');
});

// ── IRX-H07: Migration 0019 removes season fabrication ──

test('IRX-H07: migration 0019 removes season-1 fabrication from RPCs', async () => {
  const sql = await readMigration('0019_remove_season_fabrication.sql');
  // The migration must NOT add any new 'season-1' fabrication
  // (it should remove existing ones by patching the functions)
  assert.ok(sql.includes('IRX-H07'), 'must reference IRX-H07');
  assert.ok(sql.includes('RETURN;'), 'must return empty when no active season');
  // Must revoke PUBLIC execute on patched functions
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.get_ranked_leaderboard'),
    'must revoke PUBLIC on get_ranked_leaderboard');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.get_player_standing'),
    'must revoke PUBLIC on get_player_standing');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.get_recent_opponents'),
    'must revoke PUBLIC on get_recent_opponents');
});
