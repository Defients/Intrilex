import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePublicPlayerId,
  isValidPublicPlayerId,
  isValidAccountId,
  hashParticipantToken,
  verifyParticipantTokenHash,
  anonymousCapabilities,
  permanentCapabilities,
  resolveCapabilities,
  can,
  requireCapability,
  validateHandle,
  normalizeHandle,
  isReservedHandle,
  sanitizeDisplayName,
  defaultDisplayName,
  sanitizeAvatarUrl,
  AuthMode,
  AuthState,
  ConnectionAuthState,
  DEFAULT_RATING,
  MIN_RATING,
  MAX_RATING,
  K_ESTABLISHED,
  K_PROVISIONAL,
  PROVISIONAL_THRESHOLD,
  clampRating,
  resolveKFactor,
  expectedScore,
  computeRatingUpdate,
  deriveOutcome,
  initialRatingState,
  AchievementProvenance,
  computeSyncDelta,
  resolveConflict,
  toCloudRow,
  fromCloudRow,
  mergeAchievements,
  migrationId,
  buildMigrationPlan,
  validateMigrationPlan,
  isMigrationCompleted,
  describeMigrationStep,
  LeaderboardType,
  computeWinRate,
  leaderboardComparator,
  toLeaderboardEntry,
  processLeaderboardRows,
  findPlayerRank,
  normalizeSearchQuery,
  validateTierFilter,
  apexLabel,
  DEFAULT_LEADERBOARD_LIMIT,
  MAX_LEADERBOARD_LIMIT,
} from '../src/index.mjs';

test('account-domain: generatePublicPlayerId produces valid PLY_ IDs', () => {
  const id = generatePublicPlayerId();
  assert.ok(id.startsWith('PLY_'), `expected PLY_ prefix, got ${id}`);
  assert.ok(isValidPublicPlayerId(id), 'generated ID must pass validation');
  // Uniqueness check — 1000 generations should not collide
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(generatePublicPlayerId());
  assert.equal(ids.size, 1000, 'all generated IDs must be unique');
});

test('account-domain: isValidAccountId validates UUID format', () => {
  assert.ok(isValidAccountId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'));
  assert.ok(!isValidAccountId('not-a-uuid'));
  assert.ok(!isValidAccountId(null));
  assert.ok(!isValidAccountId(123));
});

test('account-domain: hashParticipantToken + verifyParticipantTokenHash round-trip', () => {
  const raw = 'super-secret-token-1234567890abcdef';
  const hash = hashParticipantToken(raw);
  assert.ok(verifyParticipantTokenHash(raw, hash), 'correct token must verify');
  assert.ok(!verifyParticipantTokenHash('wrong-token', hash), 'wrong token must not verify');
  assert.ok(!verifyParticipantTokenHash(raw, 'wrong-hash'), 'wrong hash must not verify');
  assert.ok(!verifyParticipantTokenHash(null, hash));
  assert.ok(!verifyParticipantTokenHash(raw, null));
  // Hash must not be the raw token
  assert.notEqual(hash, raw);
  // Hash must be 64 hex chars (SHA-256)
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('account-domain: anonymous capabilities block ranked/leaderboard', () => {
  const caps = anonymousCapabilities();
  assert.ok(caps.onlineCasual);
  assert.ok(caps.createPrivateDuel);
  assert.ok(caps.joinPrivateDuel);
  assert.ok(caps.spectate);
  assert.ok(!caps.ranked);
  assert.ok(!caps.publicLeaderboard);
  assert.ok(!caps.persistentCloudProgress);
  assert.ok(!caps.accountManagement);
});

test('account-domain: permanent capabilities allow ranked/leaderboard', () => {
  const caps = permanentCapabilities();
  assert.ok(caps.ranked);
  assert.ok(caps.publicLeaderboard);
  assert.ok(caps.persistentCloudProgress);
  assert.ok(caps.accountManagement);
});

test('account-domain: resolveCapabilities dispatches by identity type', () => {
  assert.ok(!resolveCapabilities({ isAnonymous: true }).ranked);
  assert.ok(resolveCapabilities({ isAnonymous: false }).ranked);
  assert.ok(!resolveCapabilities({ isAnonymous: true }, true).ranked, 'dev mode caps');
});

test('account-domain: requireCapability throws on missing capability', () => {
  const caps = anonymousCapabilities();
  assert.throws(() => requireCapability(caps, 'ranked'), /ranked/);
  // Should not throw for allowed capability
  assert.doesNotThrow(() => requireCapability(caps, 'onlineCasual'));
});

test('account-domain: validateHandle enforces constraints', () => {
  assert.ok(validateHandle('Deffy').valid);
  assert.ok(validateHandle('deffy_123').valid);
  assert.ok(!validateHandle('ab').valid, 'too short');
  assert.ok(!validateHandle('a'.repeat(25)).valid, 'too long');
  assert.ok(!validateHandle('spaces here').valid, 'spaces not allowed');
  assert.ok(!validateHandle('admin').valid, 'reserved name');
  assert.ok(!validateHandle('ADMIN').valid, 'reserved name case-insensitive');
  assert.ok(!validateHandle('emoji🎉').valid, 'emoji not allowed');
});

test('account-domain: handle case-insensitive normalization', () => {
  assert.equal(normalizeHandle('Deffy'), 'deffy');
  assert.equal(normalizeHandle('DEFFY'), 'deffy');
  assert.ok(isReservedHandle('Admin'));
  assert.ok(isReservedHandle('ADMIN'));
  assert.ok(!isReservedHandle('Deffy'));
});

test('account-domain: sanitizeDisplayName strips control chars and trims', () => {
  const result = sanitizeDisplayName('  Deffy  ');
  assert.ok(result.valid);
  assert.equal(result.sanitized, 'Deffy');
  // Control characters stripped
  const withCtrl = sanitizeDisplayName('De\x00ff\x07y');
  assert.ok(result.valid);
  assert.equal(withCtrl.sanitized, 'Deffy');
  // Empty after trim
  assert.ok(!sanitizeDisplayName('   ').valid);
  // Too long
  assert.ok(!sanitizeDisplayName('a'.repeat(33)).valid);
});

test('account-domain: defaultDisplayName falls back gracefully', () => {
  assert.equal(defaultDisplayName('Deffy'), 'Deffy');
  assert.equal(defaultDisplayName(null, 'player@example.com'), 'player');
  assert.equal(defaultDisplayName(null, null), 'Player');
});

test('account-domain: sanitizeAvatarUrl rejects unsafe schemes', () => {
  assert.equal(sanitizeAvatarUrl('https://cdn.discord.com/avatar.png'), 'https://cdn.discord.com/avatar.png');
  assert.equal(sanitizeAvatarUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeAvatarUrl('data:text/html,<script>'), null);
  assert.equal(sanitizeAvatarUrl('http://example.com/avatar.png'), null, 'http rejected');
  assert.equal(sanitizeAvatarUrl(null), null);
  assert.equal(sanitizeAvatarUrl(''), null);
});

test('account-domain: auth mode constants are frozen', () => {
  assert.equal(AuthMode.REQUIRED, 'required');
  assert.equal(AuthMode.DISABLED, 'disabled');
  assert.equal(AuthState.AUTHENTICATED, 'AUTHENTICATED');
  assert.equal(ConnectionAuthState.AUTHENTICATED, 'AUTHENTICATED');
});

// ── Rating system tests ──

test('rating: DEFAULT_RATING is 1200 and clamped to [0, 5000]', () => {
  assert.equal(DEFAULT_RATING, 1200);
  assert.equal(MIN_RATING, 0);
  assert.equal(MAX_RATING, 5000);
  assert.equal(clampRating(1200), 1200);
  assert.equal(clampRating(-100), MIN_RATING);
  assert.equal(clampRating(99999), MAX_RATING);
  assert.equal(clampRating(NaN), DEFAULT_RATING);
  assert.equal(clampRating(Infinity), DEFAULT_RATING);
});

test('rating: K-factor is higher for provisional players', () => {
  assert.equal(resolveKFactor(0), K_PROVISIONAL);
  assert.equal(resolveKFactor(PROVISIONAL_THRESHOLD - 1), K_PROVISIONAL);
  assert.equal(resolveKFactor(PROVISIONAL_THRESHOLD), K_ESTABLISHED);
  assert.equal(resolveKFactor(100), K_ESTABLISHED);
  assert.ok(K_PROVISIONAL > K_ESTABLISHED, 'provisional K should be higher');
});

test('rating: expectedScore is 0.5 for equal ratings', () => {
  assert.equal(expectedScore(1200, 1200), 0.5);
  // Higher-rated player has higher expected score
  assert.ok(expectedScore(1500, 1200) > 0.5);
  assert.ok(expectedScore(1200, 1500) < 0.5);
  // Sum of expected scores is 1
  assert.equal(expectedScore(1500, 1200) + expectedScore(1200, 1500), 1);
});

test('rating: computeRatingUpdate — win for player A', () => {
  const playerA = { accountId: 'a1111111-1111-1111-1111-111111111111', rating: 1200, ratedMatches: 0, provisional: true };
  const playerB = { accountId: 'b2222222-2222-2222-2222-222222222222', rating: 1200, ratedMatches: 0, provisional: true };
  const result = computeRatingUpdate({ playerA, playerB, outcome: 'WIN_A' });

  assert.equal(result.playerA.result, 'WIN');
  assert.equal(result.playerB.result, 'LOSS');
  assert.ok(result.playerA.ratingAfter > result.playerA.ratingBefore, 'winner rating increases');
  assert.ok(result.playerB.ratingAfter < result.playerB.ratingBefore, 'loser rating decreases');
  // Glicko-2 is not strictly zero-sum in general, but for symmetric initial
  // states the deltas are mirror images (within rounding tolerance).
  assert.ok(Math.abs(result.playerA.ratingDelta + result.playerB.ratingDelta) <= 1, 'near zero-sum for symmetric states');
});

test('rating: computeRatingUpdate — draw keeps ratings near equal', () => {
  const playerA = { accountId: 'a1111111-1111-1111-1111-111111111111', rating: 1200, ratedMatches: 5, provisional: true };
  const playerB = { accountId: 'b2222222-2222-2222-2222-222222222222', rating: 1200, ratedMatches: 5, provisional: true };
  const result = computeRatingUpdate({ playerA, playerB, outcome: 'DRAW' });

  assert.equal(result.playerA.result, 'DRAW');
  assert.equal(result.playerB.result, 'DRAW');
  // Equal ratings + draw = no change
  assert.equal(result.playerA.ratingDelta, 0);
  assert.equal(result.playerB.ratingDelta, 0);
});

test('rating: computeRatingUpdate — upset gives larger swing', () => {
  // Low-rated player beats high-rated player → bigger gain
  const playerA = { accountId: 'a1111111-1111-1111-1111-111111111111', rating: 1000, ratedMatches: 20, provisional: false };
  const playerB = { accountId: 'b2222222-2222-2222-2222-222222222222', rating: 1800, ratedMatches: 20, provisional: false };
  const upset = computeRatingUpdate({ playerA, playerB, outcome: 'WIN_A' });

  // Expected: low-rated winner gains more than they would in an even match
  assert.ok(upset.playerA.ratingDelta > 5, 'upset winner should gain significant points');
  assert.ok(upset.playerB.ratingDelta < -5, 'upset loser should lose significant points');
});

test('rating: computeRatingUpdate — rejects self-match', () => {
  const playerA = { accountId: 'a1111111-1111-1111-1111-111111111111', rating: 1200, ratedMatches: 0, provisional: true };
  assert.throws(() => computeRatingUpdate({ playerA, playerB: playerA, outcome: 'WIN_A' }), /self-match/);
});

test('rating: computeRatingUpdate — rejects missing accountId', () => {
  const playerA = { accountId: null, rating: 1200, ratedMatches: 0, provisional: true };
  const playerB = { accountId: 'b2222222-2222-2222-2222-222222222222', rating: 1200, ratedMatches: 0, provisional: true };
  assert.throws(() => computeRatingUpdate({ playerA, playerB, outcome: 'WIN_A' }), /accountId/);
});

test('rating: deriveOutcome maps winner to WIN_A/WIN_B/DRAW', () => {
  assert.equal(deriveOutcome('P1', 'P1', 'P2'), 'WIN_A');
  assert.equal(deriveOutcome('P2', 'P1', 'P2'), 'WIN_B');
  assert.equal(deriveOutcome(null, 'P1', 'P2'), 'DRAW');
  assert.equal(deriveOutcome(undefined, 'P1', 'P2'), 'DRAW');
  assert.equal(deriveOutcome('P3', 'P1', 'P2'), null);
});

test('rating: initialRatingState returns default for new player', () => {
  const state = initialRatingState('a1111111-1111-1111-1111-111111111111');
  assert.equal(state.accountId, 'a1111111-1111-1111-1111-111111111111');
  assert.equal(state.rating, DEFAULT_RATING);
  assert.equal(state.ratedMatches, 0);
  assert.equal(state.provisional, true);
});

// ── Achievement sync tests ──

test('achievement-sync: computeSyncDelta identifies uploads and downloads', () => {
  const localUnlocks = [
    { achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: '4.2.6', productVersion: '0.24.2' },
    { achievementId: 'welcome-to-intrilex', unlockedAt: '2025-01-02T00:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: '4.2.6', productVersion: '0.24.2' },
  ];
  const cloudRows = [
    { achievement_id: 'welcome-to-intrilex', unlocked_at: '2025-01-02T00:00:00Z', provenance: 'LOCAL_DEVICE', rules_version: '4.2.6', product_version: '0.24.2' },
    { achievement_id: 'twenty-one', unlocked_at: '2025-01-03T00:00:00Z', provenance: 'SERVER', rules_version: '4.2.6', product_version: '0.24.2' },
  ];

  const delta = computeSyncDelta({ localUnlocks, cloudRows });
  assert.equal(delta.toUpload.length, 1, 'first-blood should need upload');
  assert.equal(delta.toUpload[0].achievementId, 'first-blood');
  assert.equal(delta.toDownload.length, 1, 'twenty-one should need download');
  assert.equal(delta.toDownload[0].achievement_id, 'twenty-one');
  assert.equal(delta.conflicts.length, 0, 'welcome-to-intrilex matches — no conflict');
});

test('achievement-sync: computeSyncDelta detects timestamp conflicts', () => {
  const localUnlocks = [
    { achievementId: 'first-blood', unlockedAt: '2025-01-01T10:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: null, productVersion: null },
  ];
  const cloudRows = [
    { achievement_id: 'first-blood', unlocked_at: '2025-01-01T08:00:00Z', provenance: 'SERVER', rules_version: null, product_version: null },
  ];

  const delta = computeSyncDelta({ localUnlocks, cloudRows });
  assert.equal(delta.conflicts.length, 1);
  assert.equal(delta.conflicts[0].achievementId, 'first-blood');
});

test('achievement-sync: resolveConflict prefers earlier unlock', () => {
  const local = { achievementId: 'first-blood', unlockedAt: '2025-01-01T10:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: null, productVersion: null };
  const cloud = { achievement_id: 'first-blood', unlocked_at: '2025-01-01T08:00:00Z', provenance: 'SERVER', rules_version: null, product_version: null };

  const resolution = resolveConflict({ local, cloud });
  assert.equal(resolution.winner, 'cloud', 'earlier (cloud) should win');
  assert.equal(resolution.unlock.unlockedAt, '2025-01-01T08:00:00Z');
});

test('achievement-sync: toCloudRow rejects SERVER provenance from clients', () => {
  const userId = 'a1111111-1111-1111-1111-111111111111';
  const serverUnlock = { achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'SERVER', matchId: null, rulesVersion: null, productVersion: null };
  assert.equal(toCloudRow(userId, serverUnlock), null, 'SERVER provenance must be rejected');

  const localUnlock = { achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: null, productVersion: null };
  const row = toCloudRow(userId, localUnlock);
  assert.ok(row);
  assert.equal(row.user_id, userId);
  assert.equal(row.achievement_id, 'first-blood');
  assert.equal(row.provenance, 'LOCAL_DEVICE');
});

test('achievement-sync: toCloudRow rejects missing userId', () => {
  const unlock = { achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: null, productVersion: null };
  assert.equal(toCloudRow(null, unlock), null);
  assert.equal(toCloudRow('', unlock), null);
});

test('achievement-sync: fromCloudRow converts cloud row to local unlock', () => {
  const row = { achievement_id: 'twenty-one', unlocked_at: '2025-01-03T00:00:00Z', provenance: 'SERVER', rules_version: '4.2.6', product_version: '0.24.2' };
  const unlock = fromCloudRow(row);
  assert.equal(unlock.achievementId, 'twenty-one');
  assert.equal(unlock.unlockedAt, '2025-01-03T00:00:00Z');
  assert.equal(unlock.provenance, 'SERVER');
  assert.equal(unlock.rulesVersion, '4.2.6');
});

test('achievement-sync: mergeAchievements combines local and cloud', () => {
  const localUnlocks = [
    { achievementId: 'first-blood', unlockedAt: '2025-01-01T00:00:00Z', provenance: 'LOCAL_DEVICE', matchId: null, rulesVersion: null, productVersion: null },
  ];
  const cloudRows = [
    { achievement_id: 'twenty-one', unlocked_at: '2025-01-03T00:00:00Z', provenance: 'SERVER', rules_version: null, product_version: null },
  ];

  const merged = mergeAchievements(localUnlocks, cloudRows);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(u => u.achievementId === 'first-blood'));
  assert.ok(merged.some(u => u.achievementId === 'twenty-one'));
});

test('achievement-sync: AchievementProvenance constants are frozen', () => {
  assert.equal(AchievementProvenance.SERVER, 'SERVER');
  assert.equal(AchievementProvenance.LOCAL_DEVICE, 'LOCAL_DEVICE');
  assert.equal(AchievementProvenance.LOCAL_AI, 'LOCAL_AI');
  assert.equal(AchievementProvenance.UNVERIFIED, 'UNVERIFIED');
});

// ── Guest migration tests ──

const GUEST_ID = 'g3333333-3333-3333-3333-333333333333';
const PERM_ID = 'p4444444-4444-4444-4444-444444444444';

test('migration: migrationId is deterministic for same source+target', () => {
  const id1 = migrationId(GUEST_ID, PERM_ID);
  const id2 = migrationId(GUEST_ID, PERM_ID);
  assert.equal(id1, id2);
  assert.match(id1, /^mig_/);
  assert.ok(id1.includes(GUEST_ID));
  assert.ok(id1.includes(PERM_ID));
});

test('migration: migrationId rejects same source and target', () => {
  assert.throws(() => migrationId(GUEST_ID, GUEST_ID), /different/);
  assert.throws(() => migrationId(null, PERM_ID), /required/);
});

test('migration: buildMigrationPlan creates valid plan with 4 steps', () => {
  const plan = buildMigrationPlan({ sourceIdentity: GUEST_ID, targetIdentity: PERM_ID });
  assert.ok(plan.migrationId);
  assert.equal(plan.sourceIdentity, GUEST_ID);
  assert.equal(plan.targetIdentity, PERM_ID);
  assert.equal(plan.migrationVersion, 1);
  assert.equal(plan.steps.length, 4);
  assert.ok(plan.steps.some(s => s.type === 'achievements' && s.required));
  assert.ok(plan.steps.some(s => s.type === 'stats' && s.required));
  assert.ok(plan.steps.some(s => s.type === 'ratings' && !s.required));
  assert.ok(plan.steps.some(s => s.type === 'match_history' && !s.required));
});

test('migration: validateMigrationPlan accepts valid plan', () => {
  const plan = buildMigrationPlan({ sourceIdentity: GUEST_ID, targetIdentity: PERM_ID });
  const result = validateMigrationPlan(plan);
  assert.ok(result.valid);
});

test('migration: validateMigrationPlan rejects invalid plans', () => {
  assert.ok(!validateMigrationPlan(null).valid);
  assert.ok(!validateMigrationPlan({ ...buildMigrationPlan({ sourceIdentity: GUEST_ID, targetIdentity: PERM_ID }), migrationId: 'wrong' }).valid);
  assert.ok(!validateMigrationPlan({ ...buildMigrationPlan({ sourceIdentity: GUEST_ID, targetIdentity: PERM_ID }), steps: [] }).valid);
});

test('migration: isMigrationCompleted detects existing migration', () => {
  const plan = buildMigrationPlan({ sourceIdentity: GUEST_ID, targetIdentity: PERM_ID });
  const existing = [{ migration_id: plan.migrationId, source_identity: GUEST_ID, target_identity: PERM_ID }];
  assert.ok(isMigrationCompleted(existing, plan));
  assert.ok(!isMigrationCompleted([], plan));
});

test('migration: describeMigrationStep returns table info', () => {
  const plan = buildMigrationPlan({ sourceIdentity: GUEST_ID, targetIdentity: PERM_ID });
  const achStep = describeMigrationStep(plan, 'achievements');
  assert.ok(achStep);
  assert.equal(achStep.sourceTable, 'account_achievements');
  assert.equal(achStep.targetColumn, 'user_id');

  const ratingsStep = describeMigrationStep(plan, 'ratings');
  assert.ok(ratingsStep);
  assert.equal(ratingsStep.sourceTable, 'player_ratings');

  assert.equal(describeMigrationStep(plan, 'nonexistent'), null);
});

// ── Leaderboard tests ──

test('leaderboard: canonical board type is RANKED only at launch', () => {
  assert.equal(LeaderboardType.RANKED, 'RANKED');
  assert.equal(DEFAULT_LEADERBOARD_LIMIT, 100, 'Top 100 default');
  assert.ok(MAX_LEADERBOARD_LIMIT >= 100);
});

test('leaderboard: computeWinRate handles edge cases', () => {
  assert.equal(computeWinRate(0, 0, 0), 0);
  assert.equal(computeWinRate(10, 0, 0), 1);
  assert.equal(computeWinRate(5, 5, 0), 0.5);
  assert.equal(computeWinRate(3, 3, 4), 0.3);
});

test('leaderboard: toLeaderboardEntry strips private fields and derives tier', () => {
  const entry = toLeaderboardEntry({
    publicPlayerId: 'PLY_abc',
    displayName: 'Deffy',
    handle: 'deffy',
    avatarUrl: null,
    rating: 1674,
    ratedMatches: 61,
    wins: 61, losses: 44, draws: 0,
    // Private fields that MUST NOT appear in the DTO:
    user_id: 'a1111111-1111-1111-1111-111111111111',
    email: 'x@x.com',
    ratingDeviation: 80,
    volatility: 0.06,
  }, 7);
  assert.equal(entry.position, 7);
  assert.equal(entry.player.publicPlayerId, 'PLY_abc');
  assert.equal(entry.player.displayName, 'Deffy');
  assert.equal(entry.player.handle, 'deffy');
  assert.equal(entry.rank.rating, 1674);
  assert.equal(entry.rank.tier, 'VANGUARD');
  assert.equal(entry.record.games, 105);
  assert.equal(entry.record.winRate, 61 / 105);
  // No private leakage in the DTO shape
  assert.equal(/** @type {any} */ (entry).user_id, undefined);
  assert.equal(/** @type {any} */ (entry).email, undefined);
  assert.equal(/** @type {any} */ (entry).ratingDeviation, undefined);
  assert.equal(/** @type {any} */ (entry).volatility, undefined);
});

test('leaderboard: processLeaderboardRows assigns positions and computes win rate', () => {
  const rows = [
    { publicPlayerId: 'PLY_a', displayName: 'A', rating: 1800, ratedMatches: 20, wins: 15, losses: 5, draws: 0 },
    { publicPlayerId: 'PLY_b', displayName: 'B', rating: 1500, ratedMatches: 20, wins: 10, losses: 10, draws: 0 },
  ];
  const entries = processLeaderboardRows({ rows });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].position, 1);
  assert.equal(entries[0].player.publicPlayerId, 'PLY_a');
  assert.equal(entries[0].rank.rating, 1800);
  assert.equal(entries[0].record.winRate, 0.75);
  assert.equal(entries[1].position, 2);
});

test('leaderboard: processLeaderboardRows respects offset for pagination', () => {
  const rows = [{ publicPlayerId: 'PLY_c', displayName: 'C', rating: 1400, ratedMatches: 10, wins: 5, losses: 5, draws: 0 }];
  const entries = processLeaderboardRows({ rows, offset: 100 });
  assert.equal(entries[0].position, 101);
});

test('leaderboard: processLeaderboardRows handles empty input', () => {
  assert.deepEqual(processLeaderboardRows({ rows: [] }), []);
  assert.deepEqual(processLeaderboardRows({ rows: null }), []);
});

test('leaderboard: leaderboardComparator orders by rating DESC then deterministic tie-breaks', () => {
  const rows = [
    { rating: 1500, ratingDeviation: 100, ratedMatches: 10, lastRatedAt: 1, publicPlayerId: 'PLY_a' },
    { rating: 1800, ratingDeviation: 100, ratedMatches: 10, lastRatedAt: 1, publicPlayerId: 'PLY_b' },
    { rating: 1800, ratingDeviation: 80, ratedMatches: 10, lastRatedAt: 1, publicPlayerId: 'PLY_c' },
  ];
  const sorted = [...rows].sort(leaderboardComparator);
  assert.equal(sorted[0].publicPlayerId, 'PLY_c', 'higher rating, lower RD first');
  assert.equal(sorted[1].publicPlayerId, 'PLY_b');
  assert.equal(sorted[2].publicPlayerId, 'PLY_a');
});

test('leaderboard: findPlayerRank locates a player by publicPlayerId', () => {
  const entries = [
    { position: 1, player: { publicPlayerId: 'PLY_a' }, rank: { rating: 1800 }, record: { wins: 15, losses: 5, draws: 0, games: 20, winRate: 0.75 } },
    { position: 2, player: { publicPlayerId: 'PLY_b' }, rank: { rating: 1500 }, record: { wins: 10, losses: 10, draws: 0, games: 20, winRate: 0.5 } },
  ];
  const found = findPlayerRank(entries, 'PLY_b');
  assert.ok(found);
  assert.equal(found.position, 2);
  assert.equal(findPlayerRank(entries, 'PLY_zzz'), null);
});

test('leaderboard: normalizeSearchQuery validates input', () => {
  assert.equal(normalizeSearchQuery('a'), null, 'too short');
  assert.equal(normalizeSearchQuery('   '), null);
  assert.equal(normalizeSearchQuery('ab'), 'ab');
  assert.equal(normalizeSearchQuery('  Deffy  '), 'Deffy');
  assert.equal(normalizeSearchQuery('a'.repeat(100)), null, 'too long');
  assert.equal(normalizeSearchQuery('D\x00effy'), 'Deffy', 'control chars stripped');
});

test('leaderboard: validateTierFilter accepts canonical tiers only', () => {
  assert.equal(validateTierFilter('ALL'), null);
  assert.equal(validateTierFilter(null), null);
  assert.equal(validateTierFilter('VANGUARD'), 'VANGUARD');
  assert.equal(validateTierFilter('INTRILEX'), 'INTRILEX');
  assert.equal(validateTierFilter('FAKE'), null);
  assert.equal(validateTierFilter('UNRANKED'), null, 'unranked is not a board filter');
});

test('leaderboard: apexLabel renders INTRILEX #N or bare INTRILEX', () => {
  assert.equal(apexLabel(1), 'INTRILEX #1');
  assert.equal(apexLabel(83), 'INTRILEX #83');
  assert.equal(apexLabel(null), 'INTRILEX');
  assert.equal(apexLabel(0), 'INTRILEX');
});
