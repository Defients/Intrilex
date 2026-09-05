// ═══════════════════════════════════════════════════════════════
// supabase-rpc-contracts.test.mjs — RPC caller contract tests
//
// Static-source tests that verify Supabase RPC definitions in migration
// files are aligned with their application callers. These tests prevent
// the class of drift where an RPC's params or return columns don't match
// what the caller sends or reads.
//
// Each test reads the canonical migration that defines the RPC and asserts
// that the params and return columns match the caller's expectations.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readMigration(name) {
  return readFile(path.join(root, 'supabase', 'migrations', name), 'utf8');
}

async function readCaller(relPath) {
  return readFile(path.join(root, relPath), 'utf8');
}

// ═══════════════════════════════════════════════════════════════
// Section: get_ranked_leaderboard — caller contract
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: get_ranked_leaderboard params match caller (leaderboard-data.js)', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  const caller = await readCaller('apps/lab-web/src/play/ranked/leaderboard-data.js');

  // Caller sends: p_season_id, p_queue_id, p_tier_filter, p_search, p_limit, p_offset
  const callerParams = ['p_season_id', 'p_queue_id', 'p_tier_filter', 'p_search', 'p_limit', 'p_offset'];
  for (const param of callerParams) {
    assert.ok(caller.includes(`'${param}'`) || caller.includes(`${param}:`),
      `caller sends ${param}`);
  }

  // RPC must accept all these params
  const fnBlock = sql.split('CREATE FUNCTION public.get_ranked_leaderboard')[1].split('$$')[0];
  for (const param of callerParams) {
    assert.ok(fnBlock.includes(param),
      `get_ranked_leaderboard RPC must declare ${param}`);
  }
});

test('rpc-contract: get_ranked_leaderboard returns wins/losses/draws', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  const fnBlock = sql.split('CREATE FUNCTION public.get_ranked_leaderboard')[1].split('LANGUAGE')[0];

  assert.ok(fnBlock.includes('wins'), 'get_ranked_leaderboard must return wins');
  assert.ok(fnBlock.includes('losses'), 'get_ranked_leaderboard must return losses');
  assert.ok(fnBlock.includes('draws'), 'get_ranked_leaderboard must return draws');
  assert.ok(fnBlock.includes('rated_matches'), 'get_ranked_leaderboard must return rated_matches');
  assert.ok(fnBlock.includes('is_apex'), 'get_ranked_leaderboard must return is_apex');
});

test('rpc-contract: get_ranked_leaderboard caller reads returned columns', async () => {
  const caller = await readCaller('apps/lab-web/src/play/ranked/leaderboard-data.js');
  // The caller maps row.public_player_id, row.display_name, etc.
  assert.ok(caller.includes('row.wins'), 'caller reads row.wins');
  assert.ok(caller.includes('row.losses'), 'caller reads row.losses');
  assert.ok(caller.includes('row.draws'), 'caller reads row.draws');
});

// ═══════════════════════════════════════════════════════════════
// Section: get_player_standing — caller contract
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: get_player_standing params match caller', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  const caller = await readCaller('apps/lab-web/src/play/ranked/leaderboard-data.js');

  // Caller sends: p_season_id, p_queue_id, p_user_id
  const callerParams = ['p_season_id', 'p_queue_id', 'p_user_id'];
  for (const param of callerParams) {
    assert.ok(caller.includes(`${param}:`),
      `caller sends ${param}`);
  }

  // RPC must accept all these params
  const fnBlock = sql.split('CREATE FUNCTION public.get_player_standing')[1].split('$$')[0];
  for (const param of callerParams) {
    assert.ok(fnBlock.includes(param),
      `get_player_standing RPC must declare ${param}`);
  }
});

test('rpc-contract: get_player_standing returns position (not rank_position)', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  const fnBlock = sql.split('CREATE FUNCTION public.get_player_standing')[1].split('LANGUAGE')[0];

  assert.ok(fnBlock.includes('position'), 'get_player_standing must return position');
  assert.ok(fnBlock.includes('peak_rating'), 'get_player_standing must return peak_rating');
  assert.ok(fnBlock.includes('placements_played'), 'get_player_standing must return placements_played');
  assert.ok(fnBlock.includes('wins'), 'get_player_standing must return wins');
  assert.ok(fnBlock.includes('losses'), 'get_player_standing must return losses');
  assert.ok(fnBlock.includes('draws'), 'get_player_standing must return draws');
});

test('rpc-contract: get_player_standing caller reads position and peak_rating', async () => {
  const caller = await readCaller('apps/lab-web/src/play/ranked/leaderboard-data.js');
  assert.ok(caller.includes('row.position'), 'caller reads row.position');
  assert.ok(caller.includes('row.peak_rating'), 'caller reads row.peak_rating');
  assert.ok(caller.includes('row.placements_played'), 'caller reads row.placements_played');
});

// ═══════════════════════════════════════════════════════════════
// Section: get_recent_opponents — caller contract
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: get_recent_opponents returns aggregated head-to-head', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  const fnBlock = sql.split('CREATE FUNCTION public.get_recent_opponents')[1].split('LANGUAGE')[0];

  // Must return aggregated fields, not per-match fields
  assert.ok(fnBlock.includes('match_count'), 'get_recent_opponents must return match_count');
  assert.ok(fnBlock.includes('last_played_at'), 'get_recent_opponents must return last_played_at');
  assert.ok(fnBlock.includes('opponent_wins_h2h') || fnBlock.includes('opponent_wins'),
    'get_recent_opponents must return head-to-head wins');
  assert.ok(fnBlock.includes('earned_achievement_count'),
    'get_recent_opponents must return earned_achievement_count');
});

test('rpc-contract: get_recent_opponents caller reads aggregated fields', async () => {
  const caller = await readCaller('apps/lab-web/src/play/players/recent-opponents-data.js');
  // The caller passes raw rows to toOpponentEntry which reads opponent_wins, match_count, etc.
  assert.ok(caller.includes('toOpponentEntry'), 'caller uses toOpponentEntry mapper');
});

test('rpc-contract: toOpponentEntry reads head-to-head fields', async () => {
  const mapper = await readCaller('packages/account-domain/src/recent-opponents.mjs');
  assert.ok(mapper.includes("row.opponentWins ?? row.opponent_wins"),
    'toOpponentEntry reads opponent_wins');
  assert.ok(mapper.includes("row.matchCount ?? row.match_count"),
    'toOpponentEntry reads match_count');
  assert.ok(mapper.includes("row.lastPlayedAt ?? row.last_played_at"),
    'toOpponentEntry reads last_played_at');
});

// ═══════════════════════════════════════════════════════════════
// Section: get_self_profile — directoryVisible contract
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: get_self_profile returns directoryVisible', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  // The function body must include directory_visible in the SELECT and in the RETURN
  const selfProfileBlock = sql.split('CREATE OR REPLACE FUNCTION public.get_self_profile')[1];
  assert.ok(selfProfileBlock.includes('v_dir_visible'),
    'get_self_profile must read directory_visible from profile_privacy');
  assert.ok(selfProfileBlock.includes("'directoryVisible'"),
    'get_self_profile must return directoryVisible in jsonb');
});

test('rpc-contract: get_self_profile caller reads directoryVisible', async () => {
  const caller = await readCaller('apps/lab-web/src/play/profile/profile-data.js');
  assert.ok(caller.includes('data.directoryVisible'),
    'caller reads data.directoryVisible');
});

// ═══════════════════════════════════════════════════════════════
// Section: get_public_profile — season-1 fabrication removed
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: get_public_profile no longer hardcodes season-1', async () => {
  const sql = await readMigration('0028_fix_rpc_caller_alignment.sql');
  const publicProfileBlock = sql.split('CREATE OR REPLACE FUNCTION public.get_public_profile')[1];

  // Must NOT contain the hardcoded 'season-1' fabrication
  assert.ok(!publicProfileBlock.includes("'seasonId', 'season-1'"),
    'get_public_profile must not hardcode season-1');

  // Must use COALESCE(m.season_id, '') instead
  assert.ok(publicProfileBlock.includes("COALESCE(m.season_id, '')"),
    'get_public_profile must use COALESCE(m.season_id, "")');
});

test('rpc-contract: original migration 0010 still has season-1 (proves the fix was needed)', async () => {
  const sql = await readMigration('0010_profile_customization.sql');
  assert.ok(sql.includes("'seasonId', 'season-1'"),
    'migration 0010 originally hardcoded season-1 (this is what 0028 fixes)');
});

// ═══════════════════════════════════════════════════════════════
// Section: migration 0027 — ALTER FUNCTION signatures correct
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: migration 0027 ALTER signatures match actual functions', async () => {
  const sql = await readMigration('0027_harden_all_security_definer_search_path.sql');

  // These were the broken signatures — verify they are NOT present
  assert.ok(!sql.includes('get_ranked_leaderboard(INTEGER, INTEGER, UUID, TEXT, TEXT)'),
    '0027 must not have wrong get_ranked_leaderboard signature');
  assert.ok(!sql.includes('get_player_standing(UUID, UUID)'),
    '0027 must not have wrong get_player_standing signature');
  assert.ok(!sql.includes('get_recent_opponents(UUID, INTEGER)'),
    '0027 must not have wrong get_recent_opponents signature');
  assert.ok(!sql.includes('get_self_profile(UUID)'),
    '0027 must not have wrong get_self_profile signature');
  assert.ok(!sql.includes('get_public_profile(UUID)'),
    '0027 must not have wrong get_public_profile signature');

  // Verify correct signatures ARE present
  assert.ok(sql.includes('get_ranked_leaderboard(text, text, text, text, integer, integer)'),
    '0027 has correct get_ranked_leaderboard signature');
  assert.ok(sql.includes('get_player_standing(text, text, uuid)'),
    '0027 has correct get_player_standing signature');
  assert.ok(sql.includes('get_recent_opponents(integer, integer)'),
    '0027 has correct get_recent_opponents signature');
  assert.ok(sql.includes('get_self_profile()'),
    '0027 has correct get_self_profile signature');
  assert.ok(sql.includes('get_public_profile(text)'),
    '0027 has correct get_public_profile signature');
});

test('rpc-contract: migration 0027 does not override secure search_path on persist_match_result', async () => {
  const sql = await readMigration('0027_harden_all_security_definer_search_path.sql');
  // 20260830074714 sets search_path = '' on persist_match_result (more secure)
  // 0027 must NOT override it back to 'public'
  assert.ok(!sql.includes('persist_match_result'),
    '0027 must not touch persist_match_result (already hardened by 20260830074714)');
  assert.ok(!sql.includes('submit_player_report'),
    '0027 must not touch submit_player_report (already hardened by 20260830074714)');
});

// ═══════════════════════════════════════════════════════════════
// Section: leaderboard-repository.mjs (server-side caller) contract
// ═══════════════════════════════════════════════════════════════

test('rpc-contract: leaderboard-repository.mjs uses same params as browser caller', async () => {
  const repo = await readCaller('apps/match-server/src/ranked/leaderboard-repository.mjs');
  // Both callers must use the same param names
  assert.ok(repo.includes('p_season_id'), 'repository sends p_season_id');
  assert.ok(repo.includes('p_queue_id'), 'repository sends p_queue_id');
  assert.ok(repo.includes('p_tier_filter'), 'repository sends p_tier_filter');
  assert.ok(repo.includes('p_search'), 'repository sends p_search');
  assert.ok(repo.includes('row.wins'), 'repository reads row.wins');
  assert.ok(repo.includes('row.position'), 'repository reads row.position');
  assert.ok(repo.includes('row.peak_rating'), 'repository reads row.peak_rating');
});
