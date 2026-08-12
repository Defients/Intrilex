// ═══════════════════════════════════════════════════════════════
// recent-opponents.test.mjs — Recent Opponents domain + schema + UI tests
//
// Covers:
//   - recent-opponents.mjs pure domain contracts (DTO mapping, head-to-head
//     formatting, relative time formatting, privacy-safe projection)
//   - migration 0015 schema invariants (RLS, SECURITY DEFINER,
//     safe columns, authentication required, grants, indexes)
//   - Public-field-only DTO mapping (no auth UUID, email, RD, etc.)
//   - Head-to-head record derivation (caller's perspective)
//   - Pagination bounds
//   - UI structure (tab system, opponent cards, head-to-head display,
//     sign-in-required state, empty state, pagination)
//   - Subpath export @intrilex/account-domain/recent-opponents
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_RECENT_OPPONENTS_LIMIT,
  MAX_RECENT_OPPONENTS_LIMIT,
  RECENT_OPPONENTS_PAGE_SIZE,
  toOpponentEntry,
  processOpponentRows,
  formatHeadToHead,
  formatLastPlayed,
} from '@intrilex/account-domain/recent-opponents';
import { RankTier } from '@intrilex/account-domain/rank-tier';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readMigration(name) {
  return readFile(path.join(root, 'supabase', 'migrations', name), 'utf8');
}

const playersSrc = readFileSync(path.join(root, 'apps/lab-web/src/workspaces/players.js'), 'utf8');
const playersCss = readFileSync(path.join(root, 'apps/lab-web/src/play/players/players.css'), 'utf8');
const oppDataSrc = readFileSync(path.join(root, 'apps/lab-web/src/play/players/recent-opponents-data.js'), 'utf8');
const accountPkg = JSON.parse(readFileSync(path.join(root, 'packages/account-domain/package.json'), 'utf8'));

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — constants
// ═══════════════════════════════════════════════════════════════

test('recent-opponents: DEFAULT_RECENT_OPPONENTS_LIMIT is 25', () => {
  assert.equal(DEFAULT_RECENT_OPPONENTS_LIMIT, 25);
});

test('recent-opponents: MAX_RECENT_OPPONENTS_LIMIT is 100', () => {
  assert.equal(MAX_RECENT_OPPONENTS_LIMIT, 100);
});

test('recent-opponents: RECENT_OPPONENTS_PAGE_SIZE is 25', () => {
  assert.equal(RECENT_OPPONENTS_PAGE_SIZE, 25);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — toOpponentEntry DTO mapping
// ═══════════════════════════════════════════════════════════════

test('recent-opponents: toOpponentEntry maps camelCase row', () => {
  const row = {
    publicPlayerId: 'PLY_abc123',
    displayName: 'Deffy',
    handle: 'deffy',
    avatarUrl: 'https://example.com/a.png',
    rating: 1850,
    wins: 10, losses: 5, draws: 2,
    ratedMatches: 17,
    earnedAchievements: 12,
    opponentWins: 3, opponentLosses: 1, opponentDraws: 0,
    lastPlayedAt: '2026-08-10T12:00:00Z',
    matchCount: 4,
  };
  const entry = toOpponentEntry(row);
  assert.equal(entry.player.publicPlayerId, 'PLY_abc123');
  assert.equal(entry.player.displayName, 'Deffy');
  assert.equal(entry.player.handle, 'deffy');
  assert.equal(entry.player.avatarUrl, 'https://example.com/a.png');
  assert.equal(entry.rank.rating, 1850);
  assert.equal(entry.rank.isPlacement, false);
  assert.equal(entry.rank.tier, RankTier.ASCENDANT);
  assert.equal(entry.record.wins, 10);
  assert.equal(entry.record.losses, 5);
  assert.equal(entry.record.draws, 2);
  assert.equal(entry.record.games, 17);
  assert.equal(entry.record.ratedMatches, 17);
  assert.equal(entry.headToHead.wins, 3);
  assert.equal(entry.headToHead.losses, 1);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.games, 4);
  assert.equal(entry.headToHead.matchCount, 4);
  assert.equal(entry.headToHead.lastPlayedAt, '2026-08-10T12:00:00Z');
  assert.equal(entry.earnedAchievements, 12);
});

test('recent-opponents: toOpponentEntry maps snake_case row', () => {
  const row = {
    public_player_id: 'PLY_xyz',
    display_name: 'Alex',
    handle: null,
    avatar_url: null,
    rating: null,
    wins: 0, losses: 0, draws: 0,
    rated_matches: 0,
    earned_achievement_count: null,
    opponent_wins: 1, opponent_losses: 1, opponent_draws: 1,
    last_played_at: '2026-08-09T10:00:00Z',
    match_count: 3,
  };
  const entry = toOpponentEntry(row);
  assert.equal(entry.player.publicPlayerId, 'PLY_xyz');
  assert.equal(entry.player.displayName, 'Alex');
  assert.equal(entry.player.handle, null);
  assert.equal(entry.player.avatarUrl, null);
  assert.equal(entry.rank.rating, null);
  assert.equal(entry.rank.isPlacement, true);
  assert.equal(entry.rank.tier, RankTier.UNRANKED);
  assert.equal(entry.record.games, 0);
  assert.equal(entry.headToHead.wins, 1);
  assert.equal(entry.headToHead.losses, 1);
  assert.equal(entry.headToHead.draws, 1);
  assert.equal(entry.headToHead.games, 3);
  assert.equal(entry.earnedAchievements, null);
});

test('recent-opponents: toOpponentEntry never exposes auth UUID or email', () => {
  const row = {
    publicPlayerId: 'PLY_test',
    displayName: 'Test',
    handle: 'test',
    rating: 1200,
    wins: 1, losses: 1, draws: 0,
    ratedMatches: 2,
    opponentWins: 1, opponentLosses: 1, opponentDraws: 0,
    lastPlayedAt: '2026-08-10T12:00:00Z',
    matchCount: 2,
    // These should NEVER appear in the DTO
    user_id: 'uuid-12345',
    email: 'test@example.com',
    rating_deviation: 80,
    volatility: 0.06,
  };
  const entry = toOpponentEntry(row);
  const json = JSON.stringify(entry);
  assert.ok(!json.includes('uuid-12345'), 'DTO must not expose auth UUID');
  assert.ok(!json.includes('test@example.com'), 'DTO must not expose email');
  assert.ok(!json.includes('rating_deviation'), 'DTO must not expose RD');
  assert.ok(!json.includes('volatility'), 'DTO must not expose volatility');
});

test('recent-opponents: toOpponentEntry clamps negative values to 0', () => {
  const row = {
    publicPlayerId: 'PLY_neg',
    displayName: 'Neg',
    rating: 1200,
    wins: -5, losses: -3, draws: -1,
    ratedMatches: -10,
    opponentWins: -2, opponentLosses: -1, opponentDraws: -1,
    matchCount: -4,
  };
  const entry = toOpponentEntry(row);
  assert.equal(entry.record.wins, 0);
  assert.equal(entry.record.losses, 0);
  assert.equal(entry.record.draws, 0);
  assert.equal(entry.record.ratedMatches, 0);
  assert.equal(entry.headToHead.wins, 0);
  assert.equal(entry.headToHead.losses, 0);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.matchCount, 0);
});

test('recent-opponents: toOpponentEntry handles missing head-to-head fields', () => {
  const row = {
    publicPlayerId: 'PLY_min',
    displayName: 'Min',
    rating: null,
  };
  const entry = toOpponentEntry(row);
  assert.equal(entry.headToHead.wins, 0);
  assert.equal(entry.headToHead.losses, 0);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.games, 0);
  assert.equal(entry.headToHead.matchCount, 0);
  assert.equal(entry.headToHead.lastPlayedAt, null);
  assert.equal(entry.earnedAchievements, null);
});

test('recent-opponents: toOpponentEntry computes winRate for head-to-head', () => {
  const row = {
    publicPlayerId: 'PLY_wr',
    displayName: 'WR',
    rating: 1500,
    wins: 0, losses: 0, draws: 0,
    ratedMatches: 0,
    opponentWins: 2, opponentLosses: 1, opponentDraws: 0,
    matchCount: 3,
  };
  const entry = toOpponentEntry(row);
  assert.equal(entry.headToHead.games, 3);
  assert.ok(entry.headToHead.winRate > 0.66 && entry.headToHead.winRate < 0.67);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — processOpponentRows
// ═══════════════════════════════════════════════════════════════

test('recent-opponents: processOpponentRows returns empty for null/empty', () => {
  assert.deepEqual(processOpponentRows({ rows: null }), []);
  assert.deepEqual(processOpponentRows({ rows: [] }), []);
  assert.deepEqual(processOpponentRows({}), []);
});

test('recent-opponents: processOpponentRows maps all rows', () => {
  const rows = [
    { publicPlayerId: 'PLY_a', displayName: 'A', rating: 1200, wins: 1, losses: 0, draws: 0, ratedMatches: 1, opponentWins: 1, opponentLosses: 0, matchCount: 1 },
    { publicPlayerId: 'PLY_b', displayName: 'B', rating: 1400, wins: 0, losses: 1, draws: 0, ratedMatches: 1, opponentWins: 0, opponentLosses: 1, matchCount: 1 },
  ];
  const entries = processOpponentRows({ rows });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].player.publicPlayerId, 'PLY_a');
  assert.equal(entries[1].player.publicPlayerId, 'PLY_b');
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — formatHeadToHead
// ═══════════════════════════════════════════════════════════════

test('recent-opponents: formatHeadToHead formats W-L-D', () => {
  assert.equal(formatHeadToHead({ wins: 3, losses: 1, draws: 0, games: 4 }), '3–1');
  assert.equal(formatHeadToHead({ wins: 2, losses: 2, draws: 1, games: 5 }), '2–2–1');
  assert.equal(formatHeadToHead({ wins: 0, losses: 0, draws: 0, games: 0 }), '0–0');
});

test('recent-opponents: formatHeadToHead handles null/undefined', () => {
  assert.equal(formatHeadToHead(null), '0–0');
  assert.equal(formatHeadToHead(undefined), '0–0');
});

test('recent-opponents: formatHeadToHead omits draws when zero', () => {
  assert.equal(formatHeadToHead({ wins: 5, losses: 0, draws: 0, games: 5 }), '5–0');
  assert.equal(formatHeadToHead({ wins: 0, losses: 5, draws: 0, games: 5 }), '0–5');
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — formatLastPlayed
// ═══════════════════════════════════════════════════════════════

test('recent-opponents: formatLastPlayed returns dash for null/invalid', () => {
  assert.equal(formatLastPlayed(null), '—');
  assert.equal(formatLastPlayed(undefined), '—');
  assert.equal(formatLastPlayed('not-a-date'), '—');
});

test('recent-opponents: formatLastPlayed returns just now for recent', () => {
  const now = new Date(Date.now() - 5000).toISOString(); // 5s ago
  assert.equal(formatLastPlayed(now), 'just now');
});

test('recent-opponents: formatLastPlayed returns minutes ago', () => {
  const past = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5m ago
  assert.equal(formatLastPlayed(past), '5m ago');
});

test('recent-opponents: formatLastPlayed returns hours ago', () => {
  const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
  assert.equal(formatLastPlayed(past), '3h ago');
});

test('recent-opponents: formatLastPlayed returns days ago', () => {
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2d ago
  assert.equal(formatLastPlayed(past), '2d ago');
});

test('recent-opponents: formatLastPlayed returns weeks ago', () => {
  const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 2w ago
  assert.equal(formatLastPlayed(past), '2w ago');
});

test('recent-opponents: formatLastPlayed guards against clock skew', () => {
  const future = new Date(Date.now() + 60000).toISOString(); // 1m in future
  assert.equal(formatLastPlayed(future), 'just now');
});

// ═══════════════════════════════════════════════════════════════
// Section: Schema — migration 0015
// ═══════════════════════════════════════════════════════════════

test('schema: migration 0015 file exists and is non-empty', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.length > 100, 'Migration must be non-trivial');
});

test('schema: get_recent_opponents RPC is SECURITY DEFINER', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('SECURITY DEFINER'), 'RPC must be SECURITY DEFINER');
  assert.ok(sql.includes("search_path = public"), 'RPC must set search_path = public');
});

test('schema: get_recent_opponents requires authentication', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('auth.uid()'), 'RPC must check auth.uid()');
  assert.ok(sql.includes('IF v_caller IS NULL THEN'), 'RPC must return empty for anonymous');
});

test('schema: get_recent_opponents granted to authenticated only', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_recent_opponents TO authenticated'), 'Must grant to authenticated');
  assert.ok(!sql.includes('TO anon'), 'Must NOT grant to anon (requires auth)');
});

test('schema: get_recent_opponents returns safe public columns only', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('public_player_id'), 'Returns public_player_id');
  assert.ok(sql.includes('display_name'), 'Returns display_name');
  assert.ok(sql.includes('handle'), 'Returns handle');
  assert.ok(sql.includes('avatar_url'), 'Returns avatar_url');
  // Extract the RETURNS TABLE (...) block and verify it does NOT
  // contain private columns. The comments mention "email" etc. as
  // "NEVER returns" — we only check the actual column declarations.
  const returnsMatch = sql.match(/RETURNS TABLE \(([^)]+)\)/s);
  assert.ok(returnsMatch, 'Must have a RETURNS TABLE declaration');
  const returnsCols = returnsMatch[1];
  assert.ok(!/\bemail\b/i.test(returnsCols), 'Must not return email column');
  assert.ok(!/rating_deviation/i.test(returnsCols), 'Must not return RD column');
  assert.ok(!/volatility/i.test(returnsCols), 'Must not return volatility column');
  assert.ok(!/\buser_id\b/i.test(returnsCols), 'Must not return user_id column');
});

test('schema: get_recent_opponents includes head-to-head fields', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('opponent_wins'), 'Returns opponent_wins');
  assert.ok(sql.includes('opponent_losses'), 'Returns opponent_losses');
  assert.ok(sql.includes('opponent_draws'), 'Returns opponent_draws');
  assert.ok(sql.includes('last_played_at'), 'Returns last_played_at');
  assert.ok(sql.includes('match_count'), 'Returns match_count');
});

test('schema: get_recent_opponents excludes ABORT results from head-to-head', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes("mp.result IN ('WIN', 'LOSS', 'DRAW')"), 'Must filter to WIN/LOSS/DRAW only');
});

test('schema: get_recent_opponents excludes suspended/banned opponents', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('account_moderation'), 'Must join moderation table');
  assert.ok(sql.includes("m.status IS NULL OR m.status = 'ACTIVE'"), 'Must filter to active opponents');
});

test('schema: get_recent_opponents respects achievements privacy', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('profile_privacy'), 'Must join privacy table');
  assert.ok(sql.includes("COALESCE(pp.achievements, 'PUBLIC') = 'PUBLIC'"), 'Must check achievements visibility');
});

test('schema: get_recent_opponents has pagination bounds', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('LEAST(GREATEST'), 'Must clamp limit');
  assert.ok(sql.includes('LIMIT v_limit'), 'Must use LIMIT');
  assert.ok(sql.includes('OFFSET v_offset'), 'Must use OFFSET');
});

test('schema: get_recent_opponents orders by most recent first', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('ORDER BY os.last_played_at DESC'), 'Must order by last_played_at DESC');
});

test('schema: migration 0015 creates indexes for performance', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('match_participants_user_id_idx'), 'Must index user_id');
  assert.ok(sql.includes('match_participants_match_id_idx'), 'Must index match_id');
});

test('schema: get_recent_opponents deduplicates by opponent', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('GROUP BY om.opponent_user_id'), 'Must group by opponent');
});

test('schema: get_recent_opponents uses CTE for clarity', async () => {
  const sql = await readMigration('0015_recent_opponents.sql');
  assert.ok(sql.includes('WITH caller_matches AS'), 'Must use caller_matches CTE');
  assert.ok(sql.includes('opponent_matches AS'), 'Must use opponent_matches CTE');
  assert.ok(sql.includes('opponent_stats AS'), 'Must use opponent_stats CTE');
});

// ═══════════════════════════════════════════════════════════════
// Section: Subpath export
// ═══════════════════════════════════════════════════════════════

test('export: @intrilex/account-domain/recent-opponents subpath exists', () => {
  assert.ok(
    accountPkg.exports['./recent-opponents'],
    'package.json must export ./recent-opponents'
  );
  assert.equal(
    accountPkg.exports['./recent-opponents'],
    './src/recent-opponents.mjs',
  );
});

// ═══════════════════════════════════════════════════════════════
// Section: Browser data layer
// ═══════════════════════════════════════════════════════════════

test('data: fetchRecentOpponents exported', () => {
  assert.ok(oppDataSrc.includes('export async function fetchRecentOpponents'), 'Must export fetchRecentOpponents');
});

test('data: fetchRecentOpponents checks Supabase configured', () => {
  assert.ok(oppDataSrc.includes('isSupabaseConfigured'), 'Must check isSupabaseConfigured');
});

test('data: fetchRecentOpponents checks auth state', () => {
  assert.ok(oppDataSrc.includes('getAuthState'), 'Must check auth state');
  assert.ok(oppDataSrc.includes("AUTHENTICATED"), 'Must require AUTHENTICATED state');
});

test('data: fetchRecentOpponents calls get_recent_opponents RPC', () => {
  assert.ok(oppDataSrc.includes("rpc('get_recent_opponents'"), 'Must call get_recent_opponents RPC');
});

test('data: fetchRecentOpponents supports AbortSignal', () => {
  assert.ok(oppDataSrc.includes('signal'), 'Must support signal option');
});

test('data: fetchRecentOpponents returns unavailable when not configured', () => {
  assert.ok(oppDataSrc.includes('available: false'), 'Must return available: false when not configured');
});

test('data: fetchRecentOpponents returns authenticated flag', () => {
  assert.ok(oppDataSrc.includes('authenticated'), 'Must return authenticated flag');
});

// ═══════════════════════════════════════════════════════════════
// Section: UI — tab system
// ═══════════════════════════════════════════════════════════════

test('ui: players workspace has tab system', () => {
  assert.ok(playersSrc.includes('role="tablist"'), 'Must have tablist role');
  assert.ok(playersSrc.includes('role="tab"'), 'Must have tab role');
  assert.ok(playersSrc.includes('role="tabpanel"'), 'Must have tabpanel role');
});

test('ui: directory tab exists', () => {
  assert.ok(playersSrc.includes('pd-tab-directory'), 'Must have directory tab');
  assert.ok(playersSrc.includes('data-tab="directory"'), 'Must have data-tab="directory"');
});

test('ui: opponents tab exists', () => {
  assert.ok(playersSrc.includes('pd-tab-opponents'), 'Must have opponents tab');
  assert.ok(playersSrc.includes('data-tab="opponents"'), 'Must have data-tab="opponents"');
});

test('ui: switchTab function exists', () => {
  assert.ok(playersSrc.includes('function switchTab'), 'Must have switchTab function');
});

test('ui: switchTab updates aria-selected', () => {
  assert.ok(playersSrc.includes("setAttribute('aria-selected'"), 'switchTab must update aria-selected');
});

test('ui: switchTab updates tabindex for roving', () => {
  assert.ok(playersSrc.includes("setAttribute('tabindex'"), 'switchTab must update tabindex');
});

test('ui: switchTab lazy-loads opponents on first visit', () => {
  assert.ok(playersSrc.includes('view.opp._loaded'), 'Must track opponents loaded state');
  assert.ok(playersSrc.includes('!view.opp._loaded'), 'Must check _loaded before loading');
});

test('ui: tab state persisted to URL', () => {
  assert.ok(playersSrc.includes("params.set('tab'"), 'Must persist tab to URL');
  assert.ok(playersSrc.includes("tab === 'opponents'"), 'Must read tab from URL');
});

test('ui: tab switching wired in click delegation', () => {
  assert.ok(playersSrc.includes("action === 'switch-tab'"), 'Must handle switch-tab action');
});

// ═══════════════════════════════════════════════════════════════
// Section: UI — opponents rendering
// ═══════════════════════════════════════════════════════════════

test('ui: renderOpponentsContent function exists', () => {
  assert.ok(playersSrc.includes('function renderOpponentsContent'), 'Must have renderOpponentsContent');
});

test('ui: renderOppCards function exists', () => {
  assert.ok(playersSrc.includes('function renderOppCards'), 'Must have renderOppCards');
});

test('ui: renderOppCard function exists', () => {
  assert.ok(playersSrc.includes('function renderOppCard'), 'Must have renderOppCard');
});

test('ui: opponent card links to public profile', () => {
  assert.ok(playersSrc.includes('#/player/'), 'Opponent card must link to public profile');
  assert.ok(playersSrc.includes('pd-opp-card-link'), 'Must have opponent card link class');
});

test('ui: opponent card shows head-to-head record', () => {
  assert.ok(playersSrc.includes('formatHeadToHead'), 'Must use formatHeadToHead');
  assert.ok(playersSrc.includes('pd-h2h'), 'Must have head-to-head element');
});

test('ui: opponent card shows last played time', () => {
  assert.ok(playersSrc.includes('formatLastPlayed'), 'Must use formatLastPlayed');
});

test('ui: opponent card has h2h-dominant attribute for coloring', () => {
  assert.ok(playersSrc.includes('data-h2h-dominant'), 'Must have data-h2h-dominant attribute');
});

test('ui: sign-in-required state for unauthenticated users', () => {
  assert.ok(playersSrc.includes('renderOppSignInRequired'), 'Must have sign-in-required renderer');
  assert.ok(playersSrc.includes('pd-opp-signin-required'), 'Must have sign-in-required testid');
  assert.ok(playersSrc.includes('Sign in to see your recent opponents'), 'Must have sign-in prompt');
});

test('ui: empty state for no opponents', () => {
  assert.ok(playersSrc.includes('renderOppEmpty'), 'Must have empty state renderer');
  assert.ok(playersSrc.includes('pd-opp-empty'), 'Must have empty state testid');
  assert.ok(playersSrc.includes('No opponents yet'), 'Must have empty state message');
});

test('ui: unavailable state for offline mode', () => {
  assert.ok(playersSrc.includes('renderOppUnavailable'), 'Must have unavailable renderer');
  assert.ok(playersSrc.includes('pd-opp-unavailable'), 'Must have unavailable testid');
});

test('ui: error state with retry', () => {
  assert.ok(playersSrc.includes('renderOppError'), 'Must have error renderer');
  assert.ok(playersSrc.includes('pd-opp-error'), 'Must have error testid');
  assert.ok(playersSrc.includes('opp-retry'), 'Must have retry action');
});

test('ui: skeleton loading state', () => {
  assert.ok(playersSrc.includes('renderOppSkeleton'), 'Must have skeleton renderer');
});

test('ui: opponents pagination', () => {
  assert.ok(playersSrc.includes('renderOpponentsPagination'), 'Must have opponents pagination');
  assert.ok(playersSrc.includes('pd-opp-prev'), 'Must have prev button');
  assert.ok(playersSrc.includes('pd-opp-next'), 'Must have next button');
  assert.ok(playersSrc.includes('opp-prev'), 'Must handle opp-prev action');
  assert.ok(playersSrc.includes('opp-next'), 'Must handle opp-next action');
});

test('ui: loadOpponents function exists', () => {
  assert.ok(playersSrc.includes('async function loadOpponents'), 'Must have loadOpponents function');
});

test('ui: loadOpponents uses separate abort controller', () => {
  assert.ok(playersSrc.includes('view.opp._abortCtrl'), 'Must use opponents abort controller');
  assert.ok(playersSrc.includes('view.opp._loadId'), 'Must use opponents load ID');
});

test('ui: destroyPlayers cleans up opponents abort controller', () => {
  assert.ok(
    playersSrc.includes('view.opp._abortCtrl') && playersSrc.includes('view.opp._abortCtrl.abort'),
    'destroyPlayers must abort opponents controller',
  );
});

// ═══════════════════════════════════════════════════════════════
// Section: CSS
// ═══════════════════════════════════════════════════════════════

test('css: tab bar styles exist', () => {
  assert.ok(playersCss.includes('.pd-tabs'), 'Must have tab bar styles');
  assert.ok(playersCss.includes('.pd-tab'), 'Must have tab button styles');
  assert.ok(playersCss.includes('.pd-tab-active'), 'Must have active tab styles');
});

test('css: head-to-head styles exist', () => {
  assert.ok(playersCss.includes('.pd-h2h'), 'Must have head-to-head styles');
  assert.ok(playersCss.includes('.pd-h2h-record'), 'Must have head-to-head record styles');
});

test('css: h2h-dominant win/loss coloring exists', () => {
  assert.ok(playersCss.includes('data-h2h-dominant="win"'), 'Must have win-dominant color');
  assert.ok(playersCss.includes('data-h2h-dominant="loss"'), 'Must have loss-dominant color');
});

test('css: opponent card grid styles exist', () => {
  assert.ok(playersCss.includes('.pd-opp-grid'), 'Must have opponent grid styles');
  assert.ok(playersCss.includes('.pd-opp-card'), 'Must have opponent card styles');
});

test('css: reduced-motion override for tabs', () => {
  assert.ok(
    playersCss.includes('prefers-reduced-motion') && playersCss.includes('.pd-tab'),
    'Must have reduced-motion override for tabs',
  );
});

// ═══════════════════════════════════════════════════════════════
// Section: Polish — tab keyboard navigation (WAI-ARIA)
// ═══════════════════════════════════════════════════════════════

test('polish: tablist has arrow-key navigation handler', () => {
  assert.ok(playersSrc.includes('ArrowRight'), 'Must handle ArrowRight in tablist');
  assert.ok(playersSrc.includes('ArrowLeft'), 'Must handle ArrowLeft in tablist');
});

test('polish: tablist supports Home/End keys', () => {
  assert.ok(playersSrc.includes("'Home'"), 'Must handle Home key');
  assert.ok(playersSrc.includes("'End'"), 'Must handle End key');
});

test('polish: arrow-key handler uses automatic activation (switches tab on focus)', () => {
  assert.ok(
    playersSrc.includes('switchTab(target, tabName)') || playersSrc.includes('switchTab(target, tab.dataset.tab)'),
    'Arrow-key navigation must activate the focused tab (automatic activation)',
  );
});

test('polish: arrow-key handler prevents default to avoid page scroll', () => {
  // The keydown handler on the tablist must call preventDefault for arrow keys
  const handlerStart = playersSrc.indexOf('tablist.addEventListener');
  const handlerEnd = playersSrc.indexOf('});', handlerStart);
  const tablistHandler = playersSrc.slice(handlerStart, handlerEnd + 2);
  assert.ok(tablistHandler.includes('ev.preventDefault()'), 'Must preventDefault for arrow keys');
});

// ═══════════════════════════════════════════════════════════════
// Section: Polish — '/' shortcut with tab awareness
// ═══════════════════════════════════════════════════════════════

test('polish: "/" shortcut switches to directory tab if opponents is active', () => {
  assert.ok(
    playersSrc.includes("view.tab !== 'directory'") && playersSrc.includes("switchTab(target, 'directory')"),
    '"/" shortcut must switch to directory tab before focusing search',
  );
});

test('polish: "/" shortcut uses requestAnimationFrame for focus after tab switch', () => {
  // After switchTab (which changes DOM visibility), focus must wait
  // for the next frame to ensure the input is visible.
  const shortcutHandler = playersSrc.slice(
    playersSrc.indexOf("ev.key !== '/'"),
    playersSrc.indexOf("ev.key !== '/'") + 400,
  );
  assert.ok(shortcutHandler.includes('requestAnimationFrame'), 'Must use rAF for focus after tab switch');
});

// ═══════════════════════════════════════════════════════════════
// Section: Polish — opponents summary line
// ═══════════════════════════════════════════════════════════════

test('polish: opponents summary element exists in shell', () => {
  assert.ok(playersSrc.includes('pd-opp-summary'), 'Must have opponents summary element');
});

test('polish: renderOpponentsSummary function exists', () => {
  assert.ok(playersSrc.includes('function renderOpponentsSummary'), 'Must have renderOpponentsSummary function');
});

test('polish: renderOpponentsSummary called in loadOpponents finally block', () => {
  assert.ok(playersSrc.includes('renderOpponentsSummary(target)'), 'Must call renderOpponentsSummary in loadOpponents');
});

test('polish: opponents summary shows page range', () => {
  assert.ok(
    playersSrc.includes('Opponents ${pageStart}–${pageEnd}') || playersSrc.includes('pageStart') && playersSrc.includes('pageEnd'),
    'Opponents summary must show page start and end',
  );
});

test('polish: opponents summary has pd-opp-count testid', () => {
  assert.ok(playersSrc.includes('pd-opp-count'), 'Opponents summary must have pd-opp-count testid');
});

// ═══════════════════════════════════════════════════════════════
// Section: Polish — loadActiveTab comment accuracy
// ═══════════════════════════════════════════════════════════════

test('polish: loadActiveTab comment does not claim lazy loading (that is in switchTab)', () => {
  // The old comment said "Only loads opponents if the tab is active
  // and hasn't been loaded yet" which was misleading — loadActiveTab
  // always loads. The _loaded guard is in switchTab.
  const funcBlock = playersSrc.slice(
    playersSrc.indexOf('function loadActiveTab'),
    playersSrc.indexOf('function loadActiveTab') + 500,
  );
  assert.ok(
    !funcBlock.includes("hasn't been loaded yet"),
    'loadActiveTab comment must not claim lazy loading (that is in switchTab)',
  );
});
