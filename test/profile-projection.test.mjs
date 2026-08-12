// ═══════════════════════════════════════════════════════════════
// profile-projection.test.mjs — Profile projection builders
//
// Tests buildPublicProfile (privacy firewall), buildSelfProfile
// (owner projection with private state), and buildRankedSummary.
// Verifies that private fields are NEVER included in public
// projections — not merely hidden in the DOM.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Visibility,
  ShowcaseItemType,
  DEFAULT_PRIVACY,
  DEFAULT_LOADOUT,
  buildPublicProfile,
  buildSelfProfile,
  buildRankedSummary,
  emptyRankedSummary,
} from '@intrilex/account-domain';

// ── Test fixtures ───────────────────────────────────────────────

const BASE_IDENTITY = {
  publicPlayerId: 'PLY_TEST001',
  displayName: 'TestPlayer',
  handle: 'testplayer',
  avatarUrl: null,
  joinedAt: '2025-01-15T00:00:00Z',
  accountType: 'PERMANENT',
  loadout: { ...DEFAULT_LOADOUT },
};

const BASE_RANKED = {
  available: true,
  isPlacement: false,
  placementsPlayed: 5,
  placementsRequired: 5,
  tier: 'CIPHER',
  division: 'II',
  rating: 1650,
  leaderboardPosition: 42,
  wins: 10,
  losses: 5,
  draws: 1,
  games: 16,
  winRate: 0.625,
  peakRating: 1700,
  peakTier: 'CIPHER',
  peakDivision: 'I',
  isApex: false,
};

const BASE_ACHIEVEMENTS = {
  earnedCount: 15,
  totalCount: 56,
  achievementPoints: 300,
  maxAp: 1320,
};

const BASE_SHOWCASE = [
  { slot: 0, type: ShowcaseItemType.ACHIEVEMENT, itemId: 'first-blood' },
  { slot: 1, type: ShowcaseItemType.BADGE, itemId: 'first-duel' },
];

const BASE_MATCHES = [
  {
    matchId: 'match-001',
    result: 'WIN',
    opponentDisplayName: 'Opponent1',
    opponentHandle: 'opp1',
    opponentTier: 'INITIATE',
    ratingDelta: 16,
    timestamp: '2025-06-01T12:00:00Z',
    seasonId: 'season-1',
  },
];

const BASE_SEASONS = [
  {
    seasonId: 'season-1',
    name: 'Season 1',
    status: 'ARCHIVED',
    finalRating: 1600,
    finalPosition: 50,
    finalTier: 'CIPHER',
    finalDivision: 'III',
    peakRating: 1650,
    peakTier: 'CIPHER',
    peakDivision: 'II',
    wins: 8,
    losses: 4,
    draws: 0,
    games: 12,
    isCurrent: false,
  },
];

// ── buildPublicProfile: privacy firewall ────────────────────────

test('profile-projection: buildPublicProfile includes ranked by default (public per Ranked policy)', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    recentMatches: BASE_MATCHES,
    seasonHistory: BASE_SEASONS,
    privacy: DEFAULT_PRIVACY,
  });
  assert.ok(p.ranked);
  assert.equal(p.ranked.tier, 'CIPHER');
  assert.equal(p.ranked.rating, 1650);
});

test('profile-projection: buildPublicProfile includes achievements when PUBLIC', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: { ...DEFAULT_PRIVACY, achievements: Visibility.PUBLIC },
  });
  assert.ok(p.achievements);
  assert.equal(p.achievements.earnedCount, 15);
});

test('profile-projection: buildPublicProfile nulls achievements when PRIVATE', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: { ...DEFAULT_PRIVACY, achievements: Visibility.PRIVATE },
  });
  assert.equal(p.achievements, null);
});

test('profile-projection: buildPublicProfile filters achievement showcase items when achievements PRIVATE', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: { ...DEFAULT_PRIVACY, achievements: Visibility.PRIVATE },
  });
  // Badge items remain, achievement items are dropped
  assert.equal(p.showcase.length, 1);
  assert.equal(p.showcase[0].type, ShowcaseItemType.BADGE);
});

test('profile-projection: buildPublicProfile keeps badge showcase items even when achievements PRIVATE', () => {
  const allBadgeShowcase = [
    { slot: 0, type: ShowcaseItemType.BADGE, itemId: 'first-duel' },
    { slot: 1, type: ShowcaseItemType.BADGE, itemId: 'first-victory' },
  ];
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: allBadgeShowcase,
    privacy: { ...DEFAULT_PRIVACY, achievements: Visibility.PRIVATE },
  });
  assert.equal(p.showcase.length, 2);
});

test('profile-projection: buildPublicProfile includes matches when matchHistory PUBLIC', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    recentMatches: BASE_MATCHES,
    seasonHistory: BASE_SEASONS,
    privacy: { ...DEFAULT_PRIVACY, matchHistory: Visibility.PUBLIC },
  });
  assert.ok(p.recentMatches);
  assert.equal(p.recentMatches.length, 1);
  assert.ok(p.seasonHistory);
  assert.equal(p.seasonHistory.length, 1);
});

test('profile-projection: buildPublicProfile nulls matches when matchHistory PRIVATE', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    recentMatches: BASE_MATCHES,
    seasonHistory: BASE_SEASONS,
    privacy: { ...DEFAULT_PRIVACY, matchHistory: Visibility.PRIVATE },
  });
  assert.equal(p.recentMatches, null);
  assert.equal(p.seasonHistory, null);
});

test('profile-projection: buildPublicProfile never includes localStats', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: DEFAULT_PRIVACY,
  });
  assert.ok(!('localStats' in p));
});

test('profile-projection: buildPublicProfile never includes onlineStats', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: DEFAULT_PRIVACY,
  });
  assert.ok(!('onlineStats' in p));
});

test('profile-projection: buildPublicProfile never includes ownedCosmetics', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: DEFAULT_PRIVACY,
  });
  assert.ok(!('ownedCosmetics' in p));
  assert.ok(!('isSelf' in p));
});

test('profile-projection: buildPublicProfile privacy object reports visibility flags', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    privacy: { ...DEFAULT_PRIVACY, achievements: Visibility.PRIVATE, matchHistory: Visibility.PUBLIC },
  });
  assert.equal(p.privacy.achievementsVisible, false);
  assert.equal(p.privacy.matchHistoryVisible, true);
});

test('profile-projection: buildPublicProfile uses DEFAULT_PRIVACY when not specified', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
  });
  // IRX-M20: DEFAULT_PRIVACY is now all PRIVATE
  assert.equal(p.privacy.achievementsVisible, false);
  assert.equal(p.privacy.matchHistoryVisible, false);
});

test('profile-projection: buildPublicProfile handles null ranked', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: null,
    achievements: BASE_ACHIEVEMENTS,
    showcase: [],
  });
  assert.equal(p.ranked, null);
});

test('profile-projection: buildPublicProfile handles empty showcase', () => {
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: [],
  });
  assert.deepEqual(p.showcase, []);
});

// ── buildSelfProfile: owner projection ──────────────────────────

test('profile-projection: buildSelfProfile includes isSelf=true', () => {
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
  });
  assert.equal(p.isSelf, true);
});

test('profile-projection: buildSelfProfile includes full privacy settings', () => {
  const privacy = {
    matchHistory: Visibility.PRIVATE,
    achievements: Visibility.PUBLIC,
    onlineStatus: Visibility.PRIVATE,
    localStats: Visibility.PUBLIC,
  };
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    privacy,
  });
  assert.deepEqual(p.privacy, privacy);
});

test('profile-projection: buildSelfProfile includes localStats', () => {
  const localStats = { rating: 1500, provisional: true, ratedMatches: 3, wins: 2, losses: 1, draws: 0 };
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    localStats,
  });
  assert.deepEqual(p.localStats, localStats);
});

test('profile-projection: buildSelfProfile includes onlineStats', () => {
  const onlineStats = {
    onlineMatches: 20, onlineWins: 12, onlineLosses: 7, onlineDraws: 1,
    rankedMatches: 15, rankedWins: 10, rankedLosses: 5,
    currentWinStreak: 3, bestWinStreak: 5,
  };
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    onlineStats,
  });
  assert.deepEqual(p.onlineStats, onlineStats);
});

test('profile-projection: buildSelfProfile includes ownedCosmetics based on earned achievements', () => {
  const earned = new Set(['welcome-to-intrilex', 'the-stack-exists', 'first-blood']);
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    earnedAchievementIds: earned,
  });
  // Default cosmetics always owned
  assert.ok(p.ownedCosmetics.titles.some(t => t.id === 'none'));
  // Achievement-gated cosmetics owned
  assert.ok(p.ownedCosmetics.titles.some(t => t.id === 'initiate'));
  assert.ok(p.ownedCosmetics.frames.some(f => f.id === 'cipher-frame'));
  assert.ok(p.ownedCosmetics.cardBacks.some(c => c.id === 'cipher-back'));
  // Non-owned gated cosmetics NOT included
  assert.ok(!p.ownedCosmetics.titles.some(t => t.id === 'sovereign'));
});

test('profile-projection: buildSelfProfile includes unavailable badges in ownedCosmetics', () => {
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    earnedBadgeIds: new Set(),
  });
  // Tournament badges are available=false, so they show as "coming soon"
  assert.ok(p.ownedCosmetics.badges.some(b => b.id === 'tournament-champion'));
  assert.ok(p.ownedCosmetics.badges.some(b => b.id === 'bracket-buster'));
});

test('profile-projection: buildSelfProfile includes earned badges in ownedCosmetics', () => {
  const p = buildSelfProfile({
    identity: BASE_IDENTITY,
    earnedBadgeIds: new Set(['first-duel', 'first-victory']),
  });
  assert.ok(p.ownedCosmetics.badges.some(b => b.id === 'first-duel'));
  assert.ok(p.ownedCosmetics.badges.some(b => b.id === 'first-victory'));
});

test('profile-projection: buildSelfProfile defaults privacy to DEFAULT_PRIVACY', () => {
  const p = buildSelfProfile({ identity: BASE_IDENTITY });
  assert.deepEqual(p.privacy, DEFAULT_PRIVACY);
});

test('profile-projection: buildSelfProfile defaults missing fields', () => {
  const p = buildSelfProfile({ identity: BASE_IDENTITY });
  assert.equal(p.ranked, null);
  assert.equal(p.achievements, null);
  assert.deepEqual(p.showcase, []);
  assert.deepEqual(p.recentMatches, []);
  assert.deepEqual(p.seasonHistory, []);
  assert.equal(p.onlineStats, null);
  assert.equal(p.localStats, null);
});

// ── buildRankedSummary ──────────────────────────────────────────

test('profile-projection: buildRankedSummary builds from raw row', () => {
  const r = buildRankedSummary({
    rating: 1650,
    ratedMatches: 16,
    wins: 10,
    losses: 5,
    draws: 1,
  });
  assert.ok(r.available);
  assert.equal(r.rating, 1650);
  assert.equal(r.wins, 10);
  assert.equal(r.losses, 5);
  assert.equal(r.draws, 1);
  assert.equal(r.games, 16);
  assert.ok(r.winRate > 0);
});

test('profile-projection: buildRankedSummary includes leaderboard position from standing', () => {
  const r = buildRankedSummary(
    { rating: 2000, ratedMatches: 20, wins: 15, losses: 5, draws: 0 },
    { position: 5, seasonId: 's1' },
  );
  assert.equal(r.leaderboardPosition, 5);
});

test('profile-projection: buildRankedSummary computes peak assignment', () => {
  const r = buildRankedSummary({
    rating: 1650,
    ratedMatches: 16,
    wins: 10,
    losses: 5,
    draws: 1,
    peakRating: 1800,
  });
  assert.equal(r.peakRating, 1800);
  assert.ok(r.peakTier);
});

test('profile-projection: buildRankedSummary handles placement period', () => {
  const r = buildRankedSummary({
    rating: 1500,
    ratedMatches: 2,
    wins: 1,
    losses: 1,
    draws: 0,
  });
  assert.ok(r.isPlacement);
  assert.equal(r.placementsPlayed, 2);
});

test('profile-projection: buildRankedSummary handles zero games', () => {
  const r = buildRankedSummary({
    rating: 1000,
    ratedMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
  });
  assert.equal(r.games, 0);
  assert.equal(r.winRate, null);
});

// ── emptyRankedSummary ──────────────────────────────────────────

test('profile-projection: emptyRankedSummary returns unavailable placeholder', () => {
  const r = emptyRankedSummary();
  assert.equal(r.available, false);
  assert.equal(r.rating, 0);
  assert.equal(r.wins, 0);
  assert.equal(r.losses, 0);
  assert.equal(r.leaderboardPosition, null);
  assert.equal(r.peakRating, null);
});

// ── Privacy firewall: comprehensive ─────────────────────────────

test('profile-projection: public profile with all PRIVATE still shows ranked + identity', () => {
  const allPrivate = {
    matchHistory: Visibility.PRIVATE,
    achievements: Visibility.PRIVATE,
    onlineStatus: Visibility.PRIVATE,
    localStats: Visibility.PRIVATE,
  };
  const p = buildPublicProfile({
    identity: BASE_IDENTITY,
    ranked: BASE_RANKED,
    achievements: BASE_ACHIEVEMENTS,
    showcase: BASE_SHOWCASE,
    recentMatches: BASE_MATCHES,
    seasonHistory: BASE_SEASONS,
    privacy: allPrivate,
  });
  // Identity always visible
  assert.equal(p.identity.publicPlayerId, 'PLY_TEST001');
  // Ranked always visible (public leaderboard policy)
  assert.ok(p.ranked);
  // Achievements hidden
  assert.equal(p.achievements, null);
  // Matches hidden
  assert.equal(p.recentMatches, null);
  assert.equal(p.seasonHistory, null);
  // Showcase: achievement items dropped, badge items kept
  assert.equal(p.showcase.length, 1);
  assert.equal(p.showcase[0].type, ShowcaseItemType.BADGE);
});
