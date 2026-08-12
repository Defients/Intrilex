// ═══════════════════════════════════════════════════════════════
// relationships.test.mjs — Player Relationships domain + schema + UI tests
//
// Covers:
//   - relationships.mjs pure domain contracts (RelationshipKind, DTO
//     mapping, rivalry intensity, rivalry score, self-relationship guard,
//     status DTO, formatting helpers, privacy-safe projection)
//   - migration 0016 schema invariants (table, RLS owner-only, no UPDATE
//     policy, SECURITY DEFINER RPCs, safe columns, self-relationship
//     CHECK + RPC guards, grants authenticated-only, no anon grants)
//   - Public-field-only DTO mapping (no auth UUID, email, RD, etc.)
//   - Head-to-head record derivation (caller's perspective, zeroed for blocks)
//   - Pagination bounds + page-size constants
//   - Subpath export @intrilex/account-domain/relationships
//   - UI structure (Rivals tab, segmented control, relationship cards,
//     intensity badges, mutual-rival marker, sign-in-required state,
//     empty states, suggested-rival quick action)
//   - Profile hero relationship buttons (Follow/Rival states, sign-in
//     prompt, loading placeholder, mutual-rival tag)
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RelationshipKind,
  RELATIONSHIP_KINDS,
  RivalryIntensity,
  DEFAULT_RELATIONSHIPS_LIMIT,
  MAX_RELATIONSHIPS_LIMIT,
  RELATIONSHIPS_PAGE_SIZE,
  RIVALRY_EMERGING_THRESHOLD,
  RIVALRY_HEATED_THRESHOLD,
  RIVALRY_DEEP_THRESHOLD,
  validateRelationshipKind,
  deriveRivalryIntensity,
  rivalryScore,
  toRelationshipEntry,
  processRelationshipRows,
  toRelationshipStatus,
  formatRelationshipHeadToHead,
  relationshipKindLabel,
  rivalryIntensityLabel,
  isSelfRelationship,
} from '@intrilex/account-domain/relationships';
import { RankTier } from '@intrilex/account-domain/rank-tier';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readMigration(name) {
  return readFile(path.join(root, 'supabase', 'migrations', name), 'utf8');
}

const playersSrc = readFileSync(path.join(root, 'apps/lab-web/src/workspaces/players.js'), 'utf8');
const playersCss = readFileSync(path.join(root, 'apps/lab-web/src/play/players/players.css'), 'utf8');
const relDataSrc = readFileSync(path.join(root, 'apps/lab-web/src/play/players/relationships-data.js'), 'utf8');
const profileSrc = readFileSync(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
const accountPkg = JSON.parse(readFileSync(path.join(root, 'packages/account-domain/package.json'), 'utf8'));
const accountIndexSrc = readFileSync(path.join(root, 'packages/account-domain/src/index.mjs'), 'utf8');

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — constants
// ═══════════════════════════════════════════════════════════════

test('relationships: RelationshipKind has follow/rival/block', () => {
  assert.equal(RelationshipKind.FOLLOW, 'follow');
  assert.equal(RelationshipKind.RIVAL, 'rival');
  assert.equal(RelationshipKind.BLOCK, 'block');
});

test('relationships: RELATIONSHIP_KINDS is frozen and complete', () => {
  assert.deepEqual([...RELATIONSHIP_KINDS], ['follow', 'rival', 'block']);
  assert.ok(Object.isFrozen(RELATIONSHIP_KINDS));
});

test('relationships: RivalryIntensity has none/emerging/heated/deep', () => {
  assert.equal(RivalryIntensity.NONE, 'none');
  assert.equal(RivalryIntensity.EMERGING, 'emerging');
  assert.equal(RivalryIntensity.HEATED, 'heated');
  assert.equal(RivalryIntensity.DEEP, 'deep');
});

test('relationships: pagination constants match recent-opponents conventions', () => {
  assert.equal(DEFAULT_RELATIONSHIPS_LIMIT, 25);
  assert.equal(MAX_RELATIONSHIPS_LIMIT, 100);
  assert.equal(RELATIONSHIPS_PAGE_SIZE, 25);
});

test('relationships: rivalry thresholds are ordered', () => {
  assert.ok(RIVALRY_EMERGING_THRESHOLD < RIVALRY_HEATED_THRESHOLD);
  assert.ok(RIVALRY_HEATED_THRESHOLD < RIVALRY_DEEP_THRESHOLD);
  assert.equal(RIVALRY_EMERGING_THRESHOLD, 1);
  assert.equal(RIVALRY_HEATED_THRESHOLD, 3);
  assert.equal(RIVALRY_DEEP_THRESHOLD, 10);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — validateRelationshipKind
// ═══════════════════════════════════════════════════════════════

test('relationships: validateRelationshipKind accepts valid kinds', () => {
  assert.equal(validateRelationshipKind('follow'), 'follow');
  assert.equal(validateRelationshipKind('rival'), 'rival');
  assert.equal(validateRelationshipKind('block'), 'block');
});

test('relationships: validateRelationshipKind rejects invalid/null', () => {
  assert.equal(validateRelationshipKind(null), null);
  assert.equal(validateRelationshipKind(undefined), null);
  assert.equal(validateRelationshipKind(''), null);
  assert.equal(validateRelationshipKind('friend'), null);
  assert.equal(validateRelationshipKind('FOLLOW'), null); // case-sensitive
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — deriveRivalryIntensity
// ═══════════════════════════════════════════════════════════════

test('relationships: deriveRivalryIntensity bands', () => {
  assert.equal(deriveRivalryIntensity(0), RivalryIntensity.NONE);
  assert.equal(deriveRivalryIntensity(1), RivalryIntensity.EMERGING);
  assert.equal(deriveRivalryIntensity(2), RivalryIntensity.EMERGING);
  assert.equal(deriveRivalryIntensity(3), RivalryIntensity.HEATED);
  assert.equal(deriveRivalryIntensity(9), RivalryIntensity.HEATED);
  assert.equal(deriveRivalryIntensity(10), RivalryIntensity.DEEP);
  assert.equal(deriveRivalryIntensity(50), RivalryIntensity.DEEP);
});

test('relationships: deriveRivalryIntensity clamps negative + non-numeric', () => {
  assert.equal(deriveRivalryIntensity(-5), RivalryIntensity.NONE);
  assert.equal(deriveRivalryIntensity(NaN), RivalryIntensity.NONE);
  assert.equal(deriveRivalryIntensity('abc'), RivalryIntensity.NONE);
  assert.equal(deriveRivalryIntensity('10'), RivalryIntensity.DEEP); // coerced
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — rivalryScore
// ═══════════════════════════════════════════════════════════════

test('relationships: rivalryScore returns 0 for no games', () => {
  assert.equal(rivalryScore({ games: 0 }), 0);
});

test('relationships: rivalryScore rewards more games', () => {
  const few = rivalryScore({ games: 3, wins: 1, losses: 2 });
  const many = rivalryScore({ games: 20, wins: 10, losses: 10 });
  assert.ok(many > few, 'more games should score higher');
});

test('relationships: rivalryScore rewards closeness (50/50 > blowout)', () => {
  const blowout = rivalryScore({ games: 10, wins: 10, losses: 0 });
  const close = rivalryScore({ games: 10, wins: 5, losses: 5 });
  assert.ok(close > blowout, 'a close record should score higher than a blowout');
});

test('relationships: rivalryScore all-draws is perfectly balanced', () => {
  const allDraws = rivalryScore({ games: 6, wins: 0, losses: 0, draws: 6 });
  const even = rivalryScore({ games: 6, wins: 3, losses: 3 });
  // both are perfectly balanced (closeness = 1); scores should be equal
  // ignoring the recency term (no lastPlayedAt on either)
  assert.ok(Math.abs(allDraws - even) < 0.001, 'all-draws and even split should score equally');
});

test('relationships: rivalryScore adds recency bonus', () => {
  const recent = rivalryScore({ games: 4, wins: 2, losses: 2, lastPlayedAt: new Date().toISOString() });
  const old = rivalryScore({ games: 4, wins: 2, losses: 2, lastPlayedAt: '2020-01-01T00:00:00Z' });
  assert.ok(recent > old, 'a recent match should score higher than an old one');
});

test('relationships: rivalryScore clamps negative inputs', () => {
  const neg = rivalryScore({ games: -10, wins: -5, losses: -5 });
  assert.equal(neg, 0);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — toRelationshipEntry DTO mapping
// ═══════════════════════════════════════════════════════════════

test('relationships: toRelationshipEntry maps camelCase follow row', () => {
  const row = {
    publicPlayerId: 'PLY_abc123',
    displayName: 'Deffy',
    handle: 'deffy',
    avatarUrl: 'https://example.com/a.png',
    kind: 'follow',
    rating: 1850,
    ratedMatches: 17,
    earnedAchievements: 12,
    opponentWins: 3, opponentLosses: 1, opponentDraws: 0,
    lastPlayedAt: '2026-08-10T12:00:00Z',
    createdAt: '2026-07-01T10:00:00Z',
    isMutualRival: false,
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.player.publicPlayerId, 'PLY_abc123');
  assert.equal(entry.player.displayName, 'Deffy');
  assert.equal(entry.player.handle, 'deffy');
  assert.equal(entry.player.avatarUrl, 'https://example.com/a.png');
  assert.equal(entry.kind, 'follow');
  assert.equal(entry.rank.rating, 1850);
  assert.equal(entry.rank.isPlacement, false);
  assert.equal(entry.rank.tier, RankTier.ASCENDANT);
  assert.equal(entry.headToHead.wins, 3);
  assert.equal(entry.headToHead.losses, 1);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.games, 4);
  assert.equal(entry.headToHead.lastPlayedAt, '2026-08-10T12:00:00Z');
  assert.equal(entry.createdAt, '2026-07-01T10:00:00Z');
  assert.equal(entry.intensity, RivalryIntensity.HEATED);
  assert.equal(entry.isMutualRival, false);
  assert.equal(entry.earnedAchievements, 12);
});

test('relationships: toRelationshipEntry maps snake_case rival row', () => {
  const row = {
    public_player_id: 'PLY_xyz',
    display_name: 'Alex',
    handle: null,
    avatar_url: null,
    kind: 'rival',
    rating: null,
    rated_matches: 0,
    earned_achievement_count: null,
    opponent_wins: 1, opponent_losses: 1, opponent_draws: 1,
    last_played_at: '2026-08-09T10:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    is_mutual_rival: true,
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.player.publicPlayerId, 'PLY_xyz');
  assert.equal(entry.player.displayName, 'Alex');
  assert.equal(entry.player.handle, null);
  assert.equal(entry.kind, 'rival');
  assert.equal(entry.rank.rating, null);
  assert.equal(entry.rank.isPlacement, true);
  assert.equal(entry.rank.tier, RankTier.UNRANKED);
  assert.equal(entry.headToHead.games, 3);
  assert.equal(entry.headToHead.lastPlayedAt, '2026-08-09T10:00:00Z');
  assert.equal(entry.intensity, RivalryIntensity.HEATED);
  assert.equal(entry.isMutualRival, true);
  assert.equal(entry.earnedAchievements, null);
});

test('relationships: toRelationshipEntry zeroes head-to-head for blocks', () => {
  const row = {
    publicPlayerId: 'PLY_blk',
    displayName: 'Blocked',
    kind: 'block',
    rating: 1200,
    ratedMatches: 5,
    // Even if the RPC returned h2h, the DTO must zero it for blocks.
    opponentWins: 99, opponentLosses: 99, opponentDraws: 99,
    lastPlayedAt: '2026-08-10T12:00:00Z',
    createdAt: '2026-08-05T00:00:00Z',
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.kind, 'block');
  assert.equal(entry.headToHead.wins, 0);
  assert.equal(entry.headToHead.losses, 0);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.games, 0);
  assert.equal(entry.headToHead.lastPlayedAt, null);
  assert.equal(entry.intensity, RivalryIntensity.NONE);
  assert.equal(entry.isMutualRival, false, 'blocks can never be mutual rivals');
});

test('relationships: toRelationshipEntry never exposes auth UUID or email', () => {
  const row = {
    publicPlayerId: 'PLY_test',
    displayName: 'Test',
    handle: 'test',
    kind: 'follow',
    rating: 1200,
    ratedMatches: 2,
    opponentWins: 1, opponentLosses: 1, opponentDraws: 0,
    createdAt: '2026-01-01T00:00:00Z',
    // These must NEVER appear in the DTO
    user_id: 'uuid-12345',
    email: 'test@example.com',
    rating_deviation: 80,
    volatility: 0.06,
    follower_id: 'uuid-caller',
    target_id: 'uuid-target',
  };
  const entry = toRelationshipEntry(row);
  const json = JSON.stringify(entry);
  assert.ok(!json.includes('uuid-12345'), 'DTO must not expose target auth UUID');
  assert.ok(!json.includes('uuid-caller'), 'DTO must not expose caller auth UUID');
  assert.ok(!json.includes('uuid-target'), 'DTO must not expose target auth UUID');
  assert.ok(!json.includes('test@example.com'), 'DTO must not expose email');
  assert.ok(!json.includes('rating_deviation'), 'DTO must not expose RD');
  assert.ok(!json.includes('volatility'), 'DTO must not expose volatility');
  assert.ok(!json.includes('follower_id'), 'DTO must not expose follower_id');
  assert.ok(!json.includes('target_id'), 'DTO must not expose target_id');
});

test('relationships: toRelationshipEntry clamps negative values to 0', () => {
  const row = {
    publicPlayerId: 'PLY_neg',
    displayName: 'Neg',
    kind: 'follow',
    rating: 1200,
    ratedMatches: -10,
    opponentWins: -2, opponentLosses: -1, opponentDraws: -1,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.headToHead.wins, 0);
  assert.equal(entry.headToHead.losses, 0);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.games, 0);
});

test('relationships: toRelationshipEntry handles missing head-to-head fields', () => {
  const row = {
    publicPlayerId: 'PLY_min',
    displayName: 'Min',
    kind: 'follow',
    rating: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.headToHead.wins, 0);
  assert.equal(entry.headToHead.losses, 0);
  assert.equal(entry.headToHead.draws, 0);
  assert.equal(entry.headToHead.games, 0);
  assert.equal(entry.headToHead.lastPlayedAt, null);
  assert.equal(entry.intensity, RivalryIntensity.NONE);
  assert.equal(entry.earnedAchievements, null);
});

test('relationships: toRelationshipEntry computes winRate for head-to-head', () => {
  const row = {
    publicPlayerId: 'PLY_wr',
    displayName: 'WR',
    kind: 'rival',
    rating: 1500,
    ratedMatches: 0,
    opponentWins: 2, opponentLosses: 1, opponentDraws: 0,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.headToHead.games, 3);
  assert.ok(entry.headToHead.winRate > 0.66 && entry.headToHead.winRate < 0.67);
});

test('relationships: toRelationshipEntry falls back to FOLLOW for invalid kind', () => {
  const row = {
    publicPlayerId: 'PLY_x',
    displayName: 'X',
    kind: 'bogus',
    rating: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.kind, 'follow', 'invalid kind should fall back to follow');
});

test('relationships: toRelationshipEntry derives deep intensity at threshold', () => {
  const row = {
    publicPlayerId: 'PLY_deep',
    displayName: 'Deep',
    kind: 'rival',
    rating: 1500,
    opponentWins: 5, opponentLosses: 5, opponentDraws: 0,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const entry = toRelationshipEntry(row);
  assert.equal(entry.headToHead.games, 10);
  assert.equal(entry.intensity, RivalryIntensity.DEEP);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — processRelationshipRows
// ═══════════════════════════════════════════════════════════════

test('relationships: processRelationshipRows maps an array', () => {
  const rows = [
    { publicPlayerId: 'PLY_a', displayName: 'A', kind: 'follow', rating: 1200, createdAt: '2026-01-01T00:00:00Z' },
    { publicPlayerId: 'PLY_b', displayName: 'B', kind: 'rival', rating: 1400, opponentWins: 2, opponentLosses: 0, createdAt: '2026-01-02T00:00:00Z' },
  ];
  const entries = processRelationshipRows({ rows });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].player.publicPlayerId, 'PLY_a');
  assert.equal(entries[1].kind, 'rival');
  assert.equal(entries[1].intensity, RivalryIntensity.EMERGING);
});

test('relationships: processRelationshipRows handles empty/null', () => {
  assert.deepEqual(processRelationshipRows({ rows: [] }), []);
  assert.deepEqual(processRelationshipRows({}), []);
  assert.deepEqual(processRelationshipRows(), []);
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — toRelationshipStatus
// ═══════════════════════════════════════════════════════════════

test('relationships: toRelationshipStatus null row → all false', () => {
  const s = toRelationshipStatus(null);
  assert.equal(s.following, false);
  assert.equal(s.rivaling, false);
  assert.equal(s.blocking, false);
  assert.equal(s.isMutualRival, false);
  assert.equal(s.followedAt, null);
  assert.equal(s.rivaledAt, null);
  assert.equal(s.blockedAt, null);
});

test('relationships: toRelationshipStatus maps full row', () => {
  const s = toRelationshipStatus({
    following: true, rivaling: true, blocking: false,
    isMutualRival: true,
    followedAt: '2026-01-01T00:00:00Z',
    rivaledAt: '2026-01-02T00:00:00Z',
    blockedAt: null,
  });
  assert.equal(s.following, true);
  assert.equal(s.rivaling, true);
  assert.equal(s.blocking, false);
  assert.equal(s.isMutualRival, true);
  assert.equal(s.followedAt, '2026-01-01T00:00:00Z');
  assert.equal(s.rivaledAt, '2026-01-02T00:00:00Z');
  assert.equal(s.blockedAt, null);
});

test('relationships: toRelationshipStatus maps snake_case', () => {
  const s = toRelationshipStatus({
    following: false, rivaling: false, blocking: true,
    is_mutual_rival: false, blocked_at: '2026-03-01T00:00:00Z',
  });
  assert.equal(s.blocking, true);
  assert.equal(s.isMutualRival, false);
  assert.equal(s.blockedAt, '2026-03-01T00:00:00Z');
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — formatting helpers
// ═══════════════════════════════════════════════════════════════

test('relationships: formatRelationshipHeadToHead formats W-L-D', () => {
  assert.equal(formatRelationshipHeadToHead({ games: 0 }), '0–0');
  assert.equal(formatRelationshipHeadToHead({ wins: 3, losses: 1, draws: 0, games: 4 }), '3–1');
  assert.equal(formatRelationshipHeadToHead({ wins: 3, losses: 1, draws: 2, games: 6 }), '3–1–2');
  assert.equal(formatRelationshipHeadToHead(null), '0–0');
});

test('relationships: relationshipKindLabel returns human labels', () => {
  assert.equal(relationshipKindLabel(RelationshipKind.FOLLOW), 'Following');
  assert.equal(relationshipKindLabel(RelationshipKind.RIVAL), 'Rival');
  assert.equal(relationshipKindLabel(RelationshipKind.BLOCK), 'Blocked');
  assert.equal(relationshipKindLabel('bogus'), 'Unknown');
});

test('relationships: rivalryIntensityLabel returns human labels', () => {
  assert.equal(rivalryIntensityLabel(RivalryIntensity.NONE), 'No History');
  assert.equal(rivalryIntensityLabel(RivalryIntensity.EMERGING), 'Emerging Rivalry');
  assert.equal(rivalryIntensityLabel(RivalryIntensity.HEATED), 'Heated Rivalry');
  assert.equal(rivalryIntensityLabel(RivalryIntensity.DEEP), 'Deep Rivalry');
});

// ═══════════════════════════════════════════════════════════════
// Section: Domain contracts — isSelfRelationship
// ═══════════════════════════════════════════════════════════════

test('relationships: isSelfRelationship detects same id', () => {
  assert.ok(isSelfRelationship('PLY_same', 'PLY_same'));
  assert.ok(!isSelfRelationship('PLY_a', 'PLY_b'));
  assert.ok(!isSelfRelationship('', 'PLY_a'), 'empty ids are not self');
  assert.ok(!isSelfRelationship('PLY_a', ''), 'empty ids are not self');
});

// ═══════════════════════════════════════════════════════════════
// Section: Package exports
// ═══════════════════════════════════════════════════════════════

test('package: @intrilex/account-domain exposes ./relationships subpath', () => {
  assert.ok(accountPkg.exports['./relationships'],
    'package.json must export ./relationships subpath');
  assert.equal(accountPkg.exports['./relationships'], './src/relationships.mjs');
});

test('package: account-domain index re-exports relationships API', () => {
  assert.ok(accountIndexSrc.includes('RelationshipKind'), 'index must re-export RelationshipKind');
  assert.ok(accountIndexSrc.includes('toRelationshipEntry'), 'index must re-export toRelationshipEntry');
  assert.ok(accountIndexSrc.includes('toRelationshipStatus'), 'index must re-export toRelationshipStatus');
  assert.ok(accountIndexSrc.includes('rivalryScore'), 'index must re-export rivalryScore');
  assert.ok(accountIndexSrc.includes("from './relationships.mjs'"), 'index must import from relationships.mjs');
});

// ═══════════════════════════════════════════════════════════════
// Section: Schema invariants — migration 0016
// ═══════════════════════════════════════════════════════════════

test('schema: player_relationships table exists with correct columns', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.player_relationships'), 'table must exist');
  assert.ok(sql.includes('follower_id uuid NOT NULL'), 'follower_id column');
  assert.ok(sql.includes('target_id   uuid NOT NULL'), 'target_id column');
  assert.ok(sql.includes("kind        text NOT NULL CHECK (kind IN ('follow','rival','block'))"), 'kind column with CHECK');
  assert.ok(sql.includes('created_at  timestamptz NOT NULL DEFAULT now()'), 'created_at column');
});

test('schema: player_relationships has UNIQUE(follower, target, kind)', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('UNIQUE (follower_id, target_id, kind)'), 'unique constraint on (follower, target, kind)');
});

test('schema: player_relationships has no-self CHECK', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('follower_id <> target_id'), 'CHECK no self-relationship');
});

test('schema: RLS enabled with owner-only policies', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
  assert.ok(sql.includes('player_relationships_select_own'), 'SELECT own policy');
  assert.ok(sql.includes('player_relationships_insert_own'), 'INSERT own policy');
  assert.ok(sql.includes('player_relationships_delete_own'), 'DELETE own policy');
  // All policies must gate on follower_id = auth.uid()
  assert.ok(sql.includes('follower_id = auth.uid()'), 'policies must gate on follower_id = auth.uid()');
});

test('schema: NO UPDATE policy (relationships are immutable)', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(!sql.includes('FOR UPDATE'), 'no UPDATE policy — relationships are immutable');
  assert.ok(sql.includes('No UPDATE policy'), 'migration must document the no-UPDATE design');
});

test('schema: grants to authenticated, NOT to anon', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('GRANT SELECT, INSERT, DELETE ON public.player_relationships TO authenticated'),
    'authenticated must have SELECT/INSERT/DELETE');
  assert.ok(!sql.includes('TO anon'), 'anon must NOT have any grants on the table or RPCs');
});

test('schema: all mutation RPCs are SECURITY DEFINER with locked search_path', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  const rpcs = ['follow_player', 'unfollow_player', 'set_rival', 'unset_rival', 'block_player', 'unblock_player'];
  for (const rpc of rpcs) {
    assert.ok(sql.includes(`public.${rpc}(`), `${rpc} must exist`);
    assert.ok(sql.includes('SECURITY DEFINER'), `${rpc} must be SECURITY DEFINER`);
  }
  // All RPCs lock search_path
  const searchPathCount = (sql.match(/SET search_path = public/g) ?? []).length;
  assert.ok(searchPathCount >= 8, 'all RPCs + helper must lock search_path (>= 8 occurrences)');
});

test('schema: mutation RPCs reject unauthenticated + self-relationship', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('NOT_AUTHENTICATED'), 'RPCs must reject unauthenticated');
  assert.ok(sql.includes('CANNOT_RELATE_TO_SELF'), 'RPCs must reject self-relationship');
  assert.ok(sql.includes('TARGET_NOT_FOUND'), 'RPCs must reject unknown targets');
});

test('schema: set_rival establishes follow (rival implies follow)', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  // set_rival must insert a 'follow' row in addition to 'rival'
  const setRivalStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.set_rival');
  const setRivalEnd = sql.indexOf('$$;', setRivalStart);
  const setRivalBlock = sql.substring(setRivalStart, setRivalEnd);
  assert.ok(setRivalBlock.includes("'follow'"), 'set_rival must insert a follow row');
  assert.ok(setRivalBlock.includes("'rival'"), 'set_rival must insert a rival row');
});

test('schema: block_player removes follow + rival', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  const blockStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.block_player');
  const blockEnd = sql.indexOf('$$;', blockStart);
  const blockBlock = sql.substring(blockStart, blockEnd);
  assert.ok(blockBlock.includes("kind IN ('follow','rival')"), 'block must remove follow + rival');
  assert.ok(blockBlock.includes("'block'"), 'block must insert a block row');
});

test('schema: get_relationships RPC is SECURITY DEFINER + authenticated', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('public.get_relationships('), 'get_relationships RPC must exist');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_relationships TO authenticated'),
    'get_relationships must be granted to authenticated');
});

test('schema: get_relationship_status RPC exists', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('public.get_relationship_status('), 'get_relationship_status RPC must exist');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_relationship_status TO authenticated'),
    'get_relationship_status must be granted to authenticated');
});

test('schema: get_suggested_rivals RPC excludes already-rivaled + blocked', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('public.get_suggested_rivals('), 'get_suggested_rivals RPC must exist');
  assert.ok(sql.includes("pr2.kind = 'rival'"), 'suggested must exclude already-rivaled');
  assert.ok(sql.includes("pr3.kind = 'block'"), 'suggested must exclude blocked');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_suggested_rivals TO authenticated'),
    'get_suggested_rivals must be granted to authenticated');
});

test('schema: get_relationships zeroes head-to-head for blocks', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes("r.kind = 'block' THEN 0"), 'get_relationships must zero h2h for blocks');
  assert.ok(sql.includes("r.kind = 'block' THEN NULL"), 'get_relationships must null last_played_at for blocks');
});

test('schema: get_relationships returns safe columns only (no auth UUID/email/RD)', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  // The RETURNS TABLE clause lists the safe columns. Verify the dangerous
  // ones are absent from the column list (they may appear in JOIN/WHERE
  // but not as returned columns).
  const retStart = sql.indexOf('RETURNS TABLE (');
  const retEnd = sql.indexOf(')', sql.indexOf('is_mutual_rival', retStart));
  const retBlock = sql.substring(retStart, retEnd);
  assert.ok(!retBlock.includes('user_id'), 'must not return user_id');
  assert.ok(!retBlock.includes('email'), 'must not return email');
  assert.ok(!retBlock.includes('rating_deviation'), 'must not return RD');
  assert.ok(!retBlock.includes('volatility'), 'must not return volatility');
  assert.ok(retBlock.includes('public_player_id'), 'returns public_player_id');
  assert.ok(retBlock.includes('is_mutual_rival'), 'returns is_mutual_rival');
});

test('schema: _resolve_target_user_id is internal (no grant)', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('_resolve_target_user_id'), 'helper must exist');
  assert.ok(!sql.includes('GRANT EXECUTE ON FUNCTION public._resolve_target_user_id'),
    'internal helper must NOT be granted to any role');
});

test('schema: indexes on follower + target for query performance', async () => {
  const sql = await readMigration('0016_player_relationships.sql');
  assert.ok(sql.includes('player_relationships_follower_idx'), 'follower index');
  assert.ok(sql.includes('player_relationships_target_idx'), 'target index');
});

// ═══════════════════════════════════════════════════════════════
// Section: Browser data layer — relationships-data.js
// ═══════════════════════════════════════════════════════════════

test('data: relationships-data.js exports all required functions', () => {
  const required = [
    'fetchRelationships', 'fetchRelationshipStatus', 'fetchSuggestedRivals',
    'followPlayer', 'unfollowPlayer', 'setRival', 'unsetRival',
    'blockPlayer', 'unblockPlayer',
  ];
  for (const fn of required) {
    assert.ok(relDataSrc.includes(`export async function ${fn}`), `must export ${fn}`);
  }
});

test('data: relationships-data.js imports the domain module via subpath', () => {
  assert.ok(relDataSrc.includes("@intrilex/account-domain/relationships"),
    'must import from @intrilex/account-domain/relationships');
});

test('data: relationships-data.js checks auth state before mutations', () => {
  // The _unavailable helper gates on isSupabaseConfigured + getAuthState
  assert.ok(relDataSrc.includes("getAuthState() !== 'AUTHENTICATED'"),
    'mutations must check authenticated state');
});

test('data: relationships-data.js returns unavailable result when offline', () => {
  assert.ok(relDataSrc.includes('available: false'),
    'must return available: false when offline');
  assert.ok(relDataSrc.includes('authenticated: false'),
    'must return authenticated: false when not signed in');
});

test('data: relationships-data.js clamps limit to MAX', () => {
  assert.ok(relDataSrc.includes('MAX_RELATIONSHIPS_LIMIT'),
    'must clamp to MAX_RELATIONSHIPS_LIMIT');
});

// ═══════════════════════════════════════════════════════════════
// Section: UI — players.js Rivals tab
// ═══════════════════════════════════════════════════════════════

test('ui: players.js has a Rivals tab button', () => {
  assert.ok(playersSrc.includes('pd-tab-rivals'), 'Rivals tab button must exist');
  assert.ok(playersSrc.includes('data-tab="rivals"'), 'Rivals tab data-tab attribute');
  assert.ok(playersSrc.includes('pd-tabpanel-rivals'), 'Rivals tabpanel must exist');
});

test('ui: players.js has segmented control (rivals/following/suggested)', () => {
  assert.ok(playersSrc.includes('pd-seg'), 'segmented control class');
  // The segmented control is built via a segBtn(value, label, testid) helper
  // that emits data-segment="${value}". Verify the helper exists and is
  // called with each segment value.
  assert.ok(playersSrc.includes('data-segment="${value}"'), 'segBtn template uses data-segment');
  assert.ok(playersSrc.includes("segBtn('rivals',"), 'rivals segment');
  assert.ok(playersSrc.includes("segBtn('following',"), 'following segment');
  assert.ok(playersSrc.includes("segBtn('suggested',"), 'suggested segment');
  assert.ok(playersSrc.includes('rivals-segment'), 'segment switch action');
});

test('ui: players.js renders relationship cards with head-to-head + intensity', () => {
  assert.ok(playersSrc.includes('pd-riv-card'), 'rivals card class');
  assert.ok(playersSrc.includes('pd-intensity-badge'), 'intensity badge');
  assert.ok(playersSrc.includes('pd-mutual-badge'), 'mutual rival badge');
  assert.ok(playersSrc.includes('formatRelationshipHeadToHead'), 'uses h2h formatter');
  assert.ok(playersSrc.includes('rivalryIntensityLabel'), 'uses intensity label');
});

test('ui: players.js has sign-in-required + empty states for rivals', () => {
  assert.ok(playersSrc.includes('pd-riv-signin-required'), 'sign-in required state');
  assert.ok(playersSrc.includes('pd-riv-empty-rivals'), 'empty rivals state');
  assert.ok(playersSrc.includes('pd-riv-empty-following'), 'empty following state');
  assert.ok(playersSrc.includes('pd-riv-empty-suggested'), 'empty suggested state');
});

test('ui: players.js has rivals pagination (not for suggested)', () => {
  assert.ok(playersSrc.includes('riv-prev'), 'rivals prev button');
  assert.ok(playersSrc.includes('riv-next'), 'rivals next button');
  // Suggested segment is a single bounded page — no pagination
  assert.ok(playersSrc.includes("segment === 'suggested'"), 'suggested segment check');
});

test('ui: players.js suggested-rival quick action marks rival', () => {
  assert.ok(playersSrc.includes('riv-add-rival'), 'quick add rival action');
  assert.ok(playersSrc.includes('handleQuickRival'), 'quick rival handler');
  assert.ok(playersSrc.includes('setRival'), 'calls setRival');
});

test('ui: players.js switchTab handles three tabs', () => {
  assert.ok(playersSrc.includes("'rivals', '#pd-tab-rivals'"), 'switchTab includes rivals');
  assert.ok(playersSrc.includes('loadRivals'), 'switchTab lazy-loads rivals');
});

test('ui: players.js syncs rivals segment to URL', () => {
  assert.ok(playersSrc.includes("params.set('seg'"), 'URL sync for segment');
  assert.ok(playersSrc.includes("params.get('seg')"), 'URL read for segment');
});

test('ui: players.js imports relationships domain + data layer', () => {
  assert.ok(playersSrc.includes('@intrilex/account-domain/relationships'), 'imports domain');
  assert.ok(playersSrc.includes('relationships-data.js'), 'imports data layer');
  assert.ok(playersSrc.includes('RelationshipKind'), 'imports RelationshipKind');
  assert.ok(playersSrc.includes('rivalryIntensityLabel'), 'imports rivalryIntensityLabel');
});

// ═══════════════════════════════════════════════════════════════
// Section: UI — profile.js relationship buttons
// ═══════════════════════════════════════════════════════════════

test('ui: profile.js imports relationships data layer', () => {
  assert.ok(profileSrc.includes('relationships-data.js'), 'imports relationships data layer');
  assert.ok(profileSrc.includes('fetchRelationshipStatus'), 'imports fetchRelationshipStatus');
  assert.ok(profileSrc.includes('followPlayer'), 'imports followPlayer');
  assert.ok(profileSrc.includes('setRival'), 'imports setRival');
});

test('ui: profile.js fetches relationship status for public profiles', () => {
  assert.ok(profileSrc.includes('_ws.relationshipStatus'), 'stores relationship status');
  assert.ok(profileSrc.includes('fetchRelationshipStatus'), 'fetches status');
  assert.ok(profileSrc.includes('_ws.isOwnPublicProfile'), 'tracks own-public-profile');
});

test('ui: profile.js renders Follow/Rival buttons with correct states', () => {
  assert.ok(profileSrc.includes('profile-follow-btn'), 'follow button');
  assert.ok(profileSrc.includes('profile-unfollow-btn'), 'unfollow button');
  assert.ok(profileSrc.includes('profile-set-rival-btn'), 'set rival button');
  assert.ok(profileSrc.includes('profile-unset-rival-btn'), 'unset rival button');
  assert.ok(profileSrc.includes('profile-relationship-actions'), 'relationship actions container');
});

test('ui: profile.js shows sign-in prompt when not authenticated', () => {
  assert.ok(profileSrc.includes('profile-signin-to-follow'), 'sign-in to follow prompt');
});

test('ui: profile.js shows loading placeholder while fetching status', () => {
  assert.ok(profileSrc.includes('profile-relationship-loading'), 'loading placeholder');
  assert.ok(profileSrc.includes('_ws.relationshipLoading'), 'loading state flag');
});

test('ui: profile.js shows mutual-rival tag', () => {
  assert.ok(profileSrc.includes('profile-mutual-rival-tag'), 'mutual rival tag');
  assert.ok(profileSrc.includes('isMutualRival'), 'reads isMutualRival from status');
});

test('ui: profile.js wires relationship actions with optimistic state update', () => {
  assert.ok(profileSrc.includes('wireRelationshipActions'), 'wire function exists');
  assert.ok(profileSrc.includes('data-action="follow"'), 'follow action wired');
  assert.ok(profileSrc.includes('data-action="set-rival"'), 'set rival action wired');
  assert.ok(profileSrc.includes('_ws.relationshipStatus.following = true'), 'optimistic follow update');
  assert.ok(profileSrc.includes('_ws.relationshipStatus.rivaling = true'), 'optimistic rival update');
});

test('ui: profile.js hides relationship buttons for own public profile', () => {
  assert.ok(profileSrc.includes('_ws.isOwnPublicProfile'), 'checks own public profile');
  assert.ok(profileSrc.includes('!_ws.isOwnPublicProfile'), 'hides buttons when viewing self');
});

// ═══════════════════════════════════════════════════════════════
// Section: CSS — rivals tab + relationship buttons
// ═══════════════════════════════════════════════════════════════

test('css: players.css has segmented control styles', () => {
  assert.ok(playersCss.includes('.pd-seg'), 'segmented control styles');
  assert.ok(playersCss.includes('.pd-seg-btn-active'), 'active segment style');
});

test('css: players.css has rivalry intensity badge styles', () => {
  assert.ok(playersCss.includes('.pd-intensity-badge'), 'intensity badge base');
  assert.ok(playersCss.includes('.pd-intensity-emerging'), 'emerging band');
  assert.ok(playersCss.includes('.pd-intensity-heated'), 'heated band');
  assert.ok(playersCss.includes('.pd-intensity-deep'), 'deep band');
});

test('css: players.css has mutual-rival badge style', () => {
  assert.ok(playersCss.includes('.pd-mutual-badge'), 'mutual rival badge');
});

test('css: players.css has suggested-rival action button style', () => {
  assert.ok(playersCss.includes('.pd-riv-action'), 'rival action button');
  assert.ok(playersCss.includes('.pd-riv-action-error'), 'error state');
});

test('css: players.css has profile relationship button styles', () => {
  assert.ok(playersCss.includes('.profile-rel-btn'), 'relationship button base');
  assert.ok(playersCss.includes('.profile-rel-btn-active'), 'active following state');
  assert.ok(playersCss.includes('.profile-rel-btn-rival'), 'rival button');
  assert.ok(playersCss.includes('.profile-rel-btn-rival-active'), 'active rival state');
  assert.ok(playersCss.includes('.profile-mutual-rival-tag'), 'mutual rival tag');
});

test('css: rivals styles respect prefers-reduced-motion', () => {
  assert.ok(playersCss.includes('prefers-reduced-motion'), 'reduced motion query');
});
