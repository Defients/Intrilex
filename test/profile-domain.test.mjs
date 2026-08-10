// ═══════════════════════════════════════════════════════════════
// profile-domain.test.mjs — Player Profile domain contracts
//
// Tests the pure profile-domain module: catalogs, validation,
// entitlements, showcase limits, loadout validation, and identity
// contracts. No I/O, no DB, no UI.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FEATURED_ACHIEVEMENTS,
  MAX_FEATURED_BADGES,
  MAX_SHOWCASE_SLOTS,
  Visibility,
  ShowcaseItemType,
  DEFAULT_PRIVACY,
  DEFAULT_LOADOUT,
  TITLE_CATALOG,
  PROFILE_FRAME_CATALOG,
  CARD_BACK_CATALOG,
  BADGE_CATALOG,
  getTitleDefinition,
  getFrameDefinition,
  getCardBackDefinition,
  getBadgeDefinition,
  isKnownBadge,
  ownsTitle,
  ownsFrame,
  ownsCardBack,
  validatePrivacySettings,
  coercePrivacy,
  validateShowcaseSlot,
  validateShowcase,
  validateLoadout,
  validateShowcaseOwnership,
  apexLabel,
  isApexTier,
  validateHandle,
  normalizeHandle,
  isReservedHandle,
  sanitizeDisplayName,
  sanitizeAvatarUrl,
} from '@intrilex/account-domain';

// ── Catalog invariants ──────────────────────────────────────────

test('profile-domain: MAX_SHOWCASE_SLOTS = achievements + badges', () => {
  assert.equal(MAX_FEATURED_ACHIEVEMENTS, 3);
  assert.equal(MAX_FEATURED_BADGES, 3);
  assert.equal(MAX_SHOWCASE_SLOTS, 6);
});

test('profile-domain: Visibility enum is frozen and has PUBLIC + PRIVATE', () => {
  assert.equal(Visibility.PUBLIC, 'PUBLIC');
  assert.equal(Visibility.PRIVATE, 'PRIVATE');
  assert.ok(Object.isFrozen(Visibility));
});

test('profile-domain: ShowcaseItemType enum is frozen with ACHIEVEMENT + BADGE', () => {
  assert.equal(ShowcaseItemType.ACHIEVEMENT, 'ACHIEVEMENT');
  assert.equal(ShowcaseItemType.BADGE, 'BADGE');
  assert.ok(Object.isFrozen(ShowcaseItemType));
});

test('profile-domain: DEFAULT_PRIVACY has correct defaults', () => {
  assert.equal(DEFAULT_PRIVACY.matchHistory, Visibility.PUBLIC);
  assert.equal(DEFAULT_PRIVACY.achievements, Visibility.PUBLIC);
  assert.equal(DEFAULT_PRIVACY.onlineStatus, Visibility.PRIVATE);
  assert.equal(DEFAULT_PRIVACY.localStats, Visibility.PRIVATE);
  assert.ok(Object.isFrozen(DEFAULT_PRIVACY));
});

test('profile-domain: DEFAULT_LOADOUT has correct defaults', () => {
  assert.equal(DEFAULT_LOADOUT.titleId, 'none');
  assert.equal(DEFAULT_LOADOUT.profileFrameId, 'none');
  assert.equal(DEFAULT_LOADOUT.cardBackId, 'default');
  assert.deepEqual(DEFAULT_LOADOUT.showcase, []);
  assert.ok(Object.isFrozen(DEFAULT_LOADOUT));
});

// ── Title catalog ───────────────────────────────────────────────

test('profile-domain: TITLE_CATALOG has none as first entry with empty name', () => {
  assert.equal(TITLE_CATALOG[0].id, 'none');
  assert.equal(TITLE_CATALOG[0].name, '');
  assert.equal(TITLE_CATALOG[0].achievementId, null);
});

test('profile-domain: every title has unique id', () => {
  const ids = TITLE_CATALOG.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('profile-domain: hidden titles have hidden=true', () => {
  const hidden = TITLE_CATALOG.filter(t => t.hidden);
  for (const t of hidden) {
    assert.ok(t.achievementId, `Hidden title ${t.id} must have achievementId`);
  }
});

test('profile-domain: getTitleDefinition returns null for unknown id', () => {
  assert.equal(getTitleDefinition('nonexistent-title'), null);
});

test('profile-domain: getTitleDefinition returns definition for known id', () => {
  const def = getTitleDefinition('initiate');
  assert.ok(def);
  assert.equal(def.id, 'initiate');
  assert.equal(def.name, 'Initiate');
});

// ── Frame catalog ───────────────────────────────────────────────

test('profile-domain: PROFILE_FRAME_CATALOG has none as default', () => {
  assert.equal(PROFILE_FRAME_CATALOG[0].id, 'none');
  assert.equal(PROFILE_FRAME_CATALOG[0].achievementId, null);
  assert.equal(PROFILE_FRAME_CATALOG[0].cssClass, 'frame-none');
});

test('profile-domain: every frame has unique id and cssClass', () => {
  const ids = PROFILE_FRAME_CATALOG.map(f => f.id);
  const classes = PROFILE_FRAME_CATALOG.map(f => f.cssClass);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(classes).size, classes.length);
});

test('profile-domain: getFrameDefinition returns null for unknown id', () => {
  assert.equal(getFrameDefinition('nonexistent-frame'), null);
});

// ── Card back catalog ───────────────────────────────────────────

test('profile-domain: CARD_BACK_CATALOG has default as first entry', () => {
  assert.equal(CARD_BACK_CATALOG[0].id, 'default');
  assert.equal(CARD_BACK_CATALOG[0].achievementId, null);
});

test('profile-domain: every card back has unique id and assetKey', () => {
  const ids = CARD_BACK_CATALOG.map(c => c.id);
  const keys = CARD_BACK_CATALOG.map(c => c.assetKey);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(keys).size, keys.length);
});

test('profile-domain: getCardBackDefinition returns null for unknown id', () => {
  assert.equal(getCardBackDefinition('nonexistent-back'), null);
});

// ── Badge catalog ───────────────────────────────────────────────

test('profile-domain: BADGE_CATALOG has unique ids', () => {
  const ids = BADGE_CATALOG.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('profile-domain: tournament badges are marked available=false', () => {
  const champ = getBadgeDefinition('tournament-champion');
  const buster = getBadgeDefinition('bracket-buster');
  assert.ok(champ);
  assert.ok(buster);
  assert.equal(champ.available, false);
  assert.equal(buster.available, false);
});

test('profile-domain: isKnownBadge returns true for catalog badges', () => {
  assert.ok(isKnownBadge('first-duel'));
  assert.ok(!isKnownBadge('nonexistent-badge'));
});

test('profile-domain: getBadgeDefinition returns null for unknown id', () => {
  assert.equal(getBadgeDefinition('nonexistent-badge'), null);
});

// ── Entitlement resolution ──────────────────────────────────────

test('profile-domain: ownsTitle returns true for default (no achievementId)', () => {
  assert.ok(ownsTitle('none', new Set()));
});

test('profile-domain: ownsTitle returns false for gated title without achievement', () => {
  assert.ok(!ownsTitle('initiate', new Set()));
});

test('profile-domain: ownsTitle returns true for gated title with achievement', () => {
  assert.ok(ownsTitle('initiate', new Set(['welcome-to-intrilex'])));
});

test('profile-domain: ownsTitle returns false for unknown title', () => {
  assert.ok(!ownsTitle('nonexistent', new Set(['welcome-to-intrilex'])));
});

test('profile-domain: ownsFrame returns true for default frame', () => {
  assert.ok(ownsFrame('none', new Set()));
});

test('profile-domain: ownsFrame returns false for gated frame without achievement', () => {
  assert.ok(!ownsFrame('cipher-frame', new Set()));
});

test('profile-domain: ownsFrame returns true for gated frame with achievement', () => {
  assert.ok(ownsFrame('cipher-frame', new Set(['the-stack-exists'])));
});

test('profile-domain: ownsCardBack returns true for default card back', () => {
  assert.ok(ownsCardBack('default', new Set()));
});

test('profile-domain: ownsCardBack returns false for gated card back without achievement', () => {
  assert.ok(!ownsCardBack('cipher-back', new Set()));
});

test('profile-domain: ownsCardBack returns true for gated card back with achievement', () => {
  assert.ok(ownsCardBack('cipher-back', new Set(['first-blood'])));
});

// ── Privacy validation ──────────────────────────────────────────

test('profile-domain: validatePrivacySettings accepts valid settings', () => {
  const r = validatePrivacySettings({
    matchHistory: 'PUBLIC',
    achievements: 'PRIVATE',
    onlineStatus: 'PUBLIC',
    localStats: 'PRIVATE',
  });
  assert.ok(r.valid);
  assert.equal(r.settings.matchHistory, 'PUBLIC');
  assert.equal(r.settings.achievements, 'PRIVATE');
});

test('profile-domain: validatePrivacySettings rejects non-object', () => {
  assert.ok(!validatePrivacySettings(null).valid);
  assert.ok(!validatePrivacySettings('PUBLIC').valid);
  assert.ok(!validatePrivacySettings(42).valid);
});

test('profile-domain: validatePrivacySettings rejects invalid visibility value', () => {
  const r = validatePrivacySettings({
    matchHistory: 'PUBLIC',
    achievements: 'WHATEVER',
    onlineStatus: 'PUBLIC',
    localStats: 'PRIVATE',
  });
  assert.ok(!r.valid);
  assert.ok(r.error.includes('achievements'));
});

test('profile-domain: validatePrivacySettings rejects missing key', () => {
  const r = validatePrivacySettings({
    matchHistory: 'PUBLIC',
    achievements: 'PUBLIC',
    onlineStatus: 'PUBLIC',
    // localStats missing
  });
  assert.ok(!r.valid);
  assert.ok(r.error.includes('localStats'));
});

test('profile-domain: coercePrivacy fills missing fields with defaults', () => {
  const r = coercePrivacy(null);
  assert.deepEqual(r, DEFAULT_PRIVACY);
});

test('profile-domain: coercePrivacy keeps valid fields and fills invalid ones', () => {
  const r = coercePrivacy({ matchHistory: 'PRIVATE', achievements: 'BAD' });
  assert.equal(r.matchHistory, 'PRIVATE');
  assert.equal(r.achievements, DEFAULT_PRIVACY.achievements);
  assert.equal(r.onlineStatus, DEFAULT_PRIVACY.onlineStatus);
  assert.equal(r.localStats, DEFAULT_PRIVACY.localStats);
});

// ── Showcase slot validation ────────────────────────────────────

test('profile-domain: validateShowcaseSlot accepts valid slot', () => {
  const r = validateShowcaseSlot({ slot: 0, type: 'ACHIEVEMENT', itemId: 'first-blood' });
  assert.ok(r.valid);
  assert.equal(r.slot.slot, 0);
  assert.equal(r.slot.type, 'ACHIEVEMENT');
  assert.equal(r.slot.itemId, 'first-blood');
});

test('profile-domain: validateShowcaseSlot rejects out-of-range slot', () => {
  assert.ok(!validateShowcaseSlot({ slot: -1, type: 'ACHIEVEMENT', itemId: 'x' }).valid);
  assert.ok(!validateShowcaseSlot({ slot: MAX_SHOWCASE_SLOTS, type: 'ACHIEVEMENT', itemId: 'x' }).valid);
});

test('profile-domain: validateShowcaseSlot rejects invalid type', () => {
  const r = validateShowcaseSlot({ slot: 0, type: 'TROPHY', itemId: 'x' });
  assert.ok(!r.valid);
});

test('profile-domain: validateShowcaseSlot rejects empty itemId', () => {
  assert.ok(!validateShowcaseSlot({ slot: 0, type: 'ACHIEVEMENT', itemId: '' }).valid);
});

test('profile-domain: validateShowcaseSlot rejects too-long itemId', () => {
  const longId = 'a'.repeat(129);
  assert.ok(!validateShowcaseSlot({ slot: 0, type: 'ACHIEVEMENT', itemId: longId }).valid);
});

test('profile-domain: validateShowcaseSlot rejects non-object', () => {
  assert.ok(!validateShowcaseSlot(null).valid);
  assert.ok(!validateShowcaseSlot('string').valid);
});

// ── Showcase array validation ───────────────────────────────────

test('profile-domain: validateShowcase accepts valid array and sorts by slot', () => {
  const r = validateShowcase([
    { slot: 2, type: 'BADGE', itemId: 'first-duel' },
    { slot: 0, type: 'ACHIEVEMENT', itemId: 'first-blood' },
  ]);
  assert.ok(r.valid);
  assert.equal(r.slots[0].slot, 0);
  assert.equal(r.slots[1].slot, 2);
});

test('profile-domain: validateShowcase rejects duplicate slot', () => {
  const r = validateShowcase([
    { slot: 0, type: 'ACHIEVEMENT', itemId: 'first-blood' },
    { slot: 0, type: 'BADGE', itemId: 'first-duel' },
  ]);
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Duplicate slot'));
});

test('profile-domain: validateShowcase rejects duplicate item', () => {
  const r = validateShowcase([
    { slot: 0, type: 'ACHIEVEMENT', itemId: 'first-blood' },
    { slot: 1, type: 'ACHIEVEMENT', itemId: 'first-blood' },
  ]);
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Duplicate showcase item'));
});

test('profile-domain: validateShowcase rejects too many achievements', () => {
  const slots = [];
  for (let i = 0; i < MAX_FEATURED_ACHIEVEMENTS + 1; i++) {
    slots.push({ slot: i, type: 'ACHIEVEMENT', itemId: `ach-${i}` });
  }
  const r = validateShowcase(slots);
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Too many featured achievements'));
});

test('profile-domain: validateShowcase rejects too many badges', () => {
  const slots = [];
  for (let i = 0; i < MAX_FEATURED_BADGES + 1; i++) {
    slots.push({ slot: i, type: 'BADGE', itemId: `badge-${i}` });
  }
  const r = validateShowcase(slots);
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Too many featured badges'));
});

test('profile-domain: validateShowcase rejects non-array', () => {
  assert.ok(!validateShowcase(null).valid);
  assert.ok(!validateShowcase('string').valid);
});

test('profile-domain: validateShowcase respects custom limits', () => {
  const r = validateShowcase(
    [{ slot: 0, type: 'ACHIEVEMENT', itemId: 'a' }, { slot: 1, type: 'ACHIEVEMENT', itemId: 'b' }],
    { maxAchievements: 1 },
  );
  assert.ok(!r.valid);
});

// ── Loadout validation ──────────────────────────────────────────

test('profile-domain: validateLoadout accepts default loadout with no achievements', () => {
  const r = validateLoadout(DEFAULT_LOADOUT, new Set());
  assert.ok(r.valid);
  assert.equal(r.loadout.titleId, 'none');
});

test('profile-domain: validateLoadout rejects unowned title', () => {
  const r = validateLoadout({ titleId: 'initiate', profileFrameId: 'none', cardBackId: 'default', showcase: [] }, new Set());
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Title not owned'));
});

test('profile-domain: validateLoadout rejects unknown title id', () => {
  const r = validateLoadout({ titleId: 'bogus', profileFrameId: 'none', cardBackId: 'default', showcase: [] }, new Set());
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Unknown title'));
});

test('profile-domain: validateLoadout rejects unknown frame id', () => {
  const r = validateLoadout({ titleId: 'none', profileFrameId: 'bogus', cardBackId: 'default', showcase: [] }, new Set());
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Unknown frame'));
});

test('profile-domain: validateLoadout rejects unknown card back id', () => {
  const r = validateLoadout({ titleId: 'none', profileFrameId: 'none', cardBackId: 'bogus', showcase: [] }, new Set());
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Unknown card back'));
});

test('profile-domain: validateLoadout accepts owned cosmetics', () => {
  const earned = new Set(['welcome-to-intrilex', 'the-stack-exists', 'first-blood']);
  const r = validateLoadout({
    titleId: 'initiate',
    profileFrameId: 'cipher-frame',
    cardBackId: 'cipher-back',
    showcase: [],
  }, earned);
  assert.ok(r.valid);
});

test('profile-domain: validateLoadout rejects non-object', () => {
  assert.ok(!validateLoadout(null, new Set()).valid);
  assert.ok(!validateLoadout('string', new Set()).valid);
});

// ── Showcase ownership validation ───────────────────────────────

test('profile-domain: validateShowcaseOwnership accepts earned achievement', () => {
  const r = validateShowcaseOwnership(
    { slot: 0, type: ShowcaseItemType.ACHIEVEMENT, itemId: 'first-blood' },
    new Set(['first-blood']),
    new Set(),
  );
  assert.ok(r.valid);
});

test('profile-domain: validateShowcaseOwnership rejects unearned achievement', () => {
  const r = validateShowcaseOwnership(
    { slot: 0, type: ShowcaseItemType.ACHIEVEMENT, itemId: 'first-blood' },
    new Set(),
    new Set(),
  );
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Achievement not earned'));
});

test('profile-domain: validateShowcaseOwnership accepts earned badge', () => {
  const r = validateShowcaseOwnership(
    { slot: 0, type: ShowcaseItemType.BADGE, itemId: 'first-duel' },
    new Set(),
    new Set(['first-duel']),
  );
  assert.ok(r.valid);
});

test('profile-domain: validateShowcaseOwnership rejects unearned badge', () => {
  const r = validateShowcaseOwnership(
    { slot: 0, type: ShowcaseItemType.BADGE, itemId: 'first-duel' },
    new Set(),
    new Set(),
  );
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Badge not earned'));
});

test('profile-domain: validateShowcaseOwnership rejects unknown badge', () => {
  const r = validateShowcaseOwnership(
    { slot: 0, type: ShowcaseItemType.BADGE, itemId: 'bogus-badge' },
    new Set(),
    new Set(['bogus-badge']),
  );
  assert.ok(!r.valid);
  assert.ok(r.error.includes('Unknown badge'));
});

// ── Re-exported helpers ─────────────────────────────────────────

test('profile-domain: apexLabel and isApexTier are re-exported', () => {
  assert.ok(typeof apexLabel === 'function');
  assert.ok(typeof isApexTier === 'function');
});

test('profile-domain: handle/displayName/avatar helpers are re-exported', () => {
  assert.ok(typeof validateHandle === 'function');
  assert.ok(typeof normalizeHandle === 'function');
  assert.ok(typeof isReservedHandle === 'function');
  assert.ok(typeof sanitizeDisplayName === 'function');
  assert.ok(typeof sanitizeAvatarUrl === 'function');
});
