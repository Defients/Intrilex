// ═══════════════════════════════════════════════════════════════
// player-directory.test.mjs — Player Directory domain + schema tests
//
// Covers:
//   - directory.mjs pure domain contracts (DTO mapping, search/sort/
//     tier validation, privacy-safe projection)
//   - migration 0013 schema invariants (RLS, SECURITY DEFINER,
//     safe columns, directory_visible default false, grants)
//   - Public-field-only DTO mapping (no auth UUID, email, RD, etc.)
//   - Hidden/private-account exclusion semantics
//   - Pagination bounds
//   - URL state + routing
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DirectorySort,
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  DEFAULT_DIRECTORY_LIMIT,
  MAX_DIRECTORY_LIMIT,
  DIRECTORY_PAGE_SIZE,
  MIN_DIRECTORY_SEARCH_LENGTH,
  MAX_DIRECTORY_SEARCH_LENGTH,
  normalizeDirectorySearch,
  validateDirectorySort,
  validateDirectoryTierFilter,
  toDirectoryEntry,
  processDirectoryRows,
} from '@intrilex/account-domain/directory';
import { RankTier, Division } from '@intrilex/account-domain/rank-tier';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readMigration(name) {
  return readFile(path.join(root, 'supabase', 'migrations', name), 'utf8');
}

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — search normalization
// ═══════════════════════════════════════════════════════════════

test('directory: normalizeDirectorySearch trims and accepts valid query', () => {
  assert.equal(normalizeDirectorySearch('  Deffy  '), 'Deffy');
  assert.equal(normalizeDirectorySearch('@deffy'), '@deffy');
  assert.equal(normalizeDirectorySearch('PLY_abc123'), 'PLY_abc123');
});

test('directory: normalizeDirectorySearch rejects non-string', () => {
  assert.equal(normalizeDirectorySearch(null), null);
  assert.equal(normalizeDirectorySearch(undefined), null);
  assert.equal(normalizeDirectorySearch(42), null);
  assert.equal(normalizeDirectorySearch({}), null);
});

test('directory: normalizeDirectorySearch rejects too-short query', () => {
  assert.equal(normalizeDirectorySearch(''), null);
  assert.equal(normalizeDirectorySearch('a'), null);
  assert.equal(normalizeDirectorySearch(' '.repeat(10)), null);
});

test('directory: normalizeDirectorySearch rejects too-long query', () => {
  const tooLong = 'x'.repeat(MAX_DIRECTORY_SEARCH_LENGTH + 1);
  assert.equal(normalizeDirectorySearch(tooLong), null);
});

test('directory: normalizeDirectorySearch strips control characters', () => {
  // C0 control chars + DEL removed; visible chars preserved
  assert.equal(normalizeDirectorySearch('ab\x00\x1Fc'), 'abc');
  assert.equal(normalizeDirectorySearch('ab\x7Fc'), 'abc');
  assert.equal(normalizeDirectorySearch('ab\tc'), 'abc'); // tab is C0
});

test('directory: normalizeDirectorySearch accepts max-length boundary', () => {
  const max = 'x'.repeat(MAX_DIRECTORY_SEARCH_LENGTH);
  assert.equal(normalizeDirectorySearch(max), max);
});

test('directory: MIN/MAX search length constants are sane', () => {
  assert.ok(MIN_DIRECTORY_SEARCH_LENGTH >= 1);
  assert.ok(MAX_DIRECTORY_SEARCH_LENGTH <= 128);
  assert.ok(MIN_DIRECTORY_SEARCH_LENGTH < MAX_DIRECTORY_SEARCH_LENGTH);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — sort validation
// ═══════════════════════════════════════════════════════════════

test('directory: validateDirectorySort accepts valid sorts', () => {
  for (const s of DIRECTORY_SORTS) {
    assert.equal(validateDirectorySort(s), s);
  }
});

test('directory: validateDirectorySort defaults to RATING for invalid/null', () => {
  assert.equal(validateDirectorySort(null), DirectorySort.RATING);
  assert.equal(validateDirectorySort(undefined), DirectorySort.RATING);
  assert.equal(validateDirectorySort(''), DirectorySort.RATING);
  assert.equal(validateDirectorySort('bogus'), DirectorySort.RATING);
  assert.equal(validateDirectorySort(42), DirectorySort.RATING);
});

test('directory: DIRECTORY_SORTS contains the five canonical sorts', () => {
  assert.deepEqual([...DIRECTORY_SORTS].sort(), [
    DirectorySort.GAMES, DirectorySort.NAME, DirectorySort.NEWEST,
    DirectorySort.RATING, DirectorySort.RECENT,
  ]);
});

test('directory: DIRECTORY_SORT_LABELS has a label for every sort', () => {
  for (const s of DIRECTORY_SORTS) {
    assert.ok(typeof DIRECTORY_SORT_LABELS[s] === 'string' && DIRECTORY_SORT_LABELS[s].length > 0,
      `sort ${s} must have a label`);
  }
});

test('directory: DirectorySort is frozen', () => {
  assert.ok(Object.isFrozen(DirectorySort));
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — tier filter validation
// ═══════════════════════════════════════════════════════════════

test('directory: validateDirectoryTierFilter accepts canonical tiers', () => {
  assert.equal(validateDirectoryTierFilter(RankTier.INITIATE), RankTier.INITIATE);
  assert.equal(validateDirectoryTierFilter(RankTier.INTRILEX), RankTier.INTRILEX);
});

test('directory: validateDirectoryTierFilter returns null for ALL/unranked/invalid', () => {
  assert.equal(validateDirectoryTierFilter('ALL'), null);
  assert.equal(validateDirectoryTierFilter(null), null);
  assert.equal(validateDirectoryTierFilter(RankTier.UNRANKED), null);
  assert.equal(validateDirectoryTierFilter('bogus'), null);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — DTO mapping (privacy-safe projection)
// ═══════════════════════════════════════════════════════════════

test('directory: toDirectoryEntry maps a ranked player correctly', () => {
  const row = {
    public_player_id: 'PLY_abc123',
    display_name: 'Deffy',
    handle: 'deffy',
    avatar_url: 'https://example.com/a.png',
    created_at: '2025-01-01T00:00:00Z',
    rating: 1870,
    tier: 'ASCENDANT',
    division: 'II',
    is_apex: false,
    is_placement: false,
    wins: 30, losses: 20, draws: 5,
    win_rate: 0.545,
    rated_matches: 55,
    earned_achievement_count: 12,
  };
  const e = toDirectoryEntry(row);
  assert.equal(e.player.publicPlayerId, 'PLY_abc123');
  assert.equal(e.player.displayName, 'Deffy');
  assert.equal(e.player.handle, 'deffy');
  assert.equal(e.player.avatarUrl, 'https://example.com/a.png');
  assert.equal(e.player.createdAt, '2025-01-01T00:00:00Z');
  assert.equal(e.rank.tier, 'ASCENDANT');
  assert.equal(e.rank.division, 'II');
  assert.equal(e.rank.rating, 1870);
  assert.equal(e.rank.isPlacement, false);
  assert.equal(e.rank.isApex, false);
  assert.equal(e.record.wins, 30);
  assert.equal(e.record.losses, 20);
  assert.equal(e.record.draws, 5);
  assert.equal(e.record.games, 55);
  assert.equal(e.record.ratedMatches, 55);
  assert.ok(e.record.winRate > 0.54 && e.record.winRate < 0.55);
  assert.equal(e.earnedAchievements, 12);
});

test('directory: toDirectoryEntry maps an unranked/placement player', () => {
  const row = {
    public_player_id: 'PLY_new',
    display_name: 'Newbie',
    handle: null,
    avatar_url: null,
    created_at: '2025-06-01T00:00:00Z',
    rating: null,
    tier: 'UNRANKED',
    division: 'NONE',
    is_apex: false,
    is_placement: true,
    wins: 0, losses: 0, draws: 0,
    win_rate: 0,
    rated_matches: 0,
    earned_achievement_count: 0,
  };
  const e = toDirectoryEntry(row);
  assert.equal(e.rank.tier, RankTier.UNRANKED);
  assert.equal(e.rank.division, Division.NONE);
  assert.equal(e.rank.rating, null);
  assert.equal(e.rank.isPlacement, true);
  assert.equal(e.rank.isApex, false);
  assert.equal(e.record.games, 0);
  assert.equal(e.record.winRate, 0);
  assert.equal(e.earnedAchievements, 0);
});

test('directory: toDirectoryEntry maps an apex (INTRILEX) player', () => {
  const row = {
    public_player_id: 'PLY_apex',
    display_name: 'Champ',
    handle: 'champ',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z',
    rating: 2500,
    tier: 'INTRILEX',
    division: 'NONE',
    is_apex: true,
    is_placement: false,
    wins: 100, losses: 10, draws: 2,
    win_rate: 0.89,
    rated_matches: 112,
    earned_achievement_count: 40,
  };
  const e = toDirectoryEntry(row);
  assert.equal(e.rank.tier, RankTier.INTRILEX);
  assert.equal(e.rank.division, Division.NONE);
  assert.equal(e.rank.rating, 2500);
  assert.equal(e.rank.isApex, true);
  assert.equal(e.rank.isPlacement, false);
});

test('directory: toDirectoryEntry nulls earnedAchievements when hidden (null)', () => {
  const row = {
    public_player_id: 'PLY_hidden',
    display_name: 'Private',
    handle: 'private',
    avatar_url: null,
    created_at: '2025-01-01T00:00:00Z',
    rating: 1500,
    tier: 'WARDEN',
    division: 'I',
    is_apex: false,
    is_placement: false,
    wins: 10, losses: 5, draws: 0,
    win_rate: 0.667,
    rated_matches: 15,
    earned_achievement_count: null,
  };
  const e = toDirectoryEntry(row);
  assert.equal(e.earnedAchievements, null);
});

test('directory: toDirectoryEntry NEVER exposes private fields', () => {
  const row = {
    public_player_id: 'PLY_x',
    display_name: 'X',
    handle: 'x',
    avatar_url: null,
    created_at: '2025-01-01T00:00:00Z',
    rating: 1500,
    tier: 'WARDEN',
    division: 'I',
    is_apex: false,
    is_placement: false,
    wins: 1, losses: 1, draws: 0,
    win_rate: 0.5,
    rated_matches: 2,
    earned_achievement_count: 1,
    // Simulate accidentally-included private fields — they must be dropped
    user_id: 'auth-uuid-secret',
    email: 'secret@example.com',
    rating_deviation: 50,
    volatility: 0.06,
  };
  const e = toDirectoryEntry(row);
  const json = JSON.stringify(e);
  assert.ok(!json.includes('user_id'), 'DTO must not expose user_id');
  assert.ok(!json.includes('email'), 'DTO must not expose email');
  assert.ok(!json.includes('rating_deviation'), 'DTO must not expose rating_deviation');
  assert.ok(!json.includes('volatility'), 'DTO must not expose volatility');
  assert.ok(!json.includes('auth-uuid'), 'DTO must not expose auth uuid value');
});

test('directory: toDirectoryEntry handles missing display name with fallback', () => {
  const e = toDirectoryEntry({ public_player_id: 'PLY_x' });
  assert.equal(e.player.displayName, 'Player');
  assert.equal(e.player.publicPlayerId, 'PLY_x');
  assert.equal(e.player.handle, null);
  assert.equal(e.player.avatarUrl, null);
});

test('directory: toDirectoryEntry clamps negative wins/losses to 0', () => {
  const e = toDirectoryEntry({
    public_player_id: 'PLY_x', display_name: 'X',
    wins: -5, losses: -3, draws: -1, rated_matches: -10,
  });
  assert.equal(e.record.wins, 0);
  assert.equal(e.record.losses, 0);
  assert.equal(e.record.draws, 0);
  assert.equal(e.record.ratedMatches, 0);
});

test('directory: processDirectoryRows returns empty for empty/undefined', () => {
  assert.deepEqual(processDirectoryRows({ rows: [] }), []);
  assert.deepEqual(processDirectoryRows({ rows: undefined }), []);
  assert.deepEqual(processDirectoryRows({}), []);
  assert.deepEqual(processDirectoryRows(), []);
});

test('directory: processDirectoryRows maps each row preserving order', () => {
  const rows = [
    { public_player_id: 'PLY_a', display_name: 'A', rating: 2000, wins: 10, losses: 5, draws: 0, rated_matches: 15 },
    { public_player_id: 'PLY_b', display_name: 'B', rating: 1500, wins: 5, losses: 5, draws: 0, rated_matches: 10 },
  ];
  const entries = processDirectoryRows({ rows });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].player.publicPlayerId, 'PLY_a');
  assert.equal(entries[1].player.publicPlayerId, 'PLY_b');
});

// ═══════════════════════════════════════════════════════════════
// Section: Pagination bounds
// ═══════════════════════════════════════════════════════════════

test('directory: DEFAULT/MAX limit and page size constants are sane', () => {
  assert.ok(DEFAULT_DIRECTORY_LIMIT >= 1 && DEFAULT_DIRECTORY_LIMIT <= MAX_DIRECTORY_LIMIT);
  assert.ok(MAX_DIRECTORY_LIMIT <= 200);
  assert.ok(DIRECTORY_PAGE_SIZE >= 1 && DIRECTORY_PAGE_SIZE <= MAX_DIRECTORY_LIMIT);
});

// ═══════════════════════════════════════════════════════════════
// Section: Schema invariants — migration 0013
// ═══════════════════════════════════════════════════════════════

test('schema: migration 0013 exists and is non-trivial', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql && sql.length > 100, '0013 migration must be non-trivial');
});

test('schema: directory_visible column defaults to false (no silent exposure)', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes('directory_visible'), 'directory_visible column must be added');
  assert.ok(sql.includes('DEFAULT false'), 'directory_visible must default to false');
});

test('schema: get_player_directory RPC is SECURITY DEFINER with locked search_path', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes('get_player_directory'), 'get_player_directory RPC must exist');
  assert.ok(sql.includes('SECURITY DEFINER'), 'RPC must be SECURITY DEFINER');
  assert.ok(sql.includes("SET search_path = public"), 'RPC must lock search_path');
});

test('schema: get_player_directory returns only safe public columns (no auth uuid/email/RD/volatility)', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  // The RETURNS TABLE block must list safe columns only
  const returnsBlock = sql.split('RETURNS TABLE')[1].split('LANGUAGE')[0];
  assert.ok(returnsBlock.includes('public_player_id'), 'must return public_player_id');
  assert.ok(returnsBlock.includes('display_name'), 'must return display_name');
  assert.ok(returnsBlock.includes('handle'), 'must return handle');
  assert.ok(returnsBlock.includes('avatar_url'), 'must return avatar_url');
  assert.ok(returnsBlock.includes('earned_achievement_count'), 'must return earned_achievement_count');
  // Must NOT return private fields
  assert.ok(!returnsBlock.includes('user_id'), 'must not return user_id');
  assert.ok(!returnsBlock.includes('email'), 'must not return email');
  assert.ok(!returnsBlock.includes('rating_deviation'), 'must not return rating_deviation');
  assert.ok(!returnsBlock.includes('volatility'), 'must not return volatility');
});

test('schema: get_player_directory enforces directory_visible server-side', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes("directory_visible"), 'RPC must filter on directory_visible');
  assert.ok(sql.match(/directory_visible.*=.*true/i) || sql.includes("COALESCE(pp.directory_visible, false) = true"),
    'RPC must require directory_visible = true');
});

test('schema: get_player_directory excludes suspended/banned players', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes("m.status IS NULL OR m.status = 'ACTIVE'"),
    'RPC must exclude suspended/banned players');
});

test('schema: get_player_directory bounds limit and offset', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes('LEAST(GREATEST'), 'RPC must bound limit/offset');
  assert.ok(sql.includes('100'), 'RPC must cap limit at 100');
});

test('schema: get_player_directory validates sort to a fixed allowlist', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes("'rating','games','recent','newest','name'"),
    'RPC must validate sort against a fixed allowlist');
});

test('schema: get_player_directory sanitizes search length (2-64)', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes("length(v_search) < 2"), 'RPC must reject too-short search');
  assert.ok(sql.includes("length(v_search) > 64"), 'RPC must reject too-long search');
});

test('schema: set_directory_visible RPC is SECURITY DEFINER + owner-only', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes('set_directory_visible'), 'set_directory_visible RPC must exist');
  assert.ok(sql.includes('SECURITY DEFINER'), 'set_directory_visible must be SECURITY DEFINER');
  assert.ok(sql.includes("auth.uid() IS NULL"), 'set_directory_visible must check auth');
  assert.ok(sql.includes('NOT_AUTHENTICATED'), 'set_directory_visible must reject unauthenticated');
});

test('schema: directory RPCs granted to authenticated (read + self-toggle)', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_player_directory TO authenticated'),
    'get_player_directory must be executable by authenticated');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.set_directory_visible TO authenticated'),
    'set_directory_visible must be executable by authenticated');
});

test('schema: directory indexes exist for search/sort performance', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes('profiles_handle_lower_idx'), 'handle lower index must exist');
  assert.ok(sql.includes('profiles_display_name_lower_idx'), 'display name lower index must exist');
  assert.ok(sql.includes('profiles_created_at_idx'), 'created_at index must exist');
  assert.ok(sql.includes('profile_privacy_directory_visible_idx'), 'directory_visible index must exist');
});

test('schema: get_self_profile augmented with directoryVisible (owner-readable)', async () => {
  const sql = await readMigration('0013_player_directory.sql');
  assert.ok(sql.includes("'directoryVisible', v_dir_visible"),
    'get_self_profile must expose directoryVisible to the owner');
  assert.ok(sql.includes('v_dir_visible'), 'get_self_profile must read directory_visible');
});

// ═══════════════════════════════════════════════════════════════
// Section: Routing — /players route is registered
// ═══════════════════════════════════════════════════════════════

test('routing: /players route is registered in router.js', async () => {
  const routerSrc = await readFile(path.join(root, 'apps/lab-web/src/router.js'), 'utf8');
  assert.ok(routerSrc.includes("'/players'"), 'router.js must register /players');
  assert.ok(routerSrc.includes('Players'), 'router.js must have a Players label');
});

test('routing: /players has SEO metadata in seo-metadata.js', async () => {
  const seoSrc = await readFile(path.join(root, 'apps/lab-web/src/seo-metadata.js'), 'utf8');
  assert.ok(seoSrc.includes("'/players'"), 'seo-metadata.js must have /players entry');
  assert.ok(seoSrc.includes('Discover Intrilex players'), 'seo-metadata.js must describe the directory');
});

test('routing: renderPlayers is wired in app.js renderers', async () => {
  const appSrc = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.ok(appSrc.includes('renderPlayers'), 'app.js must import renderPlayers');
  assert.ok(appSrc.includes("'/players': renderPlayers"), 'app.js must dispatch /players to renderPlayers');
});

test('routing: players workspace file exists with data-testid hooks', async () => {
  const wsSrc = await readFile(path.join(root, 'apps/lab-web/src/workspaces/players.js'), 'utf8');
  assert.ok(wsSrc.includes('data-testid="players-panel"'), 'players workspace must have panel testid');
  assert.ok(wsSrc.includes('data-testid="pd-search"'), 'players workspace must have search testid');
  assert.ok(wsSrc.includes('data-testid="pd-card"'), 'players workspace must have card testid');
});

test('routing: players-data.js calls get_player_directory RPC', async () => {
  const dataSrc = await readFile(path.join(root, 'apps/lab-web/src/play/players/players-data.js'), 'utf8');
  assert.ok(dataSrc.includes("rpc('get_player_directory'"), 'players-data.js must call get_player_directory RPC');
  assert.ok(dataSrc.includes('isSupabaseConfigured'), 'players-data.js must guard on Supabase configured');
  assert.ok(dataSrc.includes('available: false'), 'players-data.js must return unavailable when offline');
});

test('routing: players CSS imported in styles.css', async () => {
  const stylesSrc = await readFile(path.join(root, 'apps/lab-web/src/styles.css'), 'utf8');
  assert.ok(stylesSrc.includes('players/players.css'), 'styles.css must import players.css');
});
