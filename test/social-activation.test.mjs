// ═══════════════════════════════════════════════════════════════
// social-activation.test.mjs — Epoch 4 Social Activation tests
//
// Tests rival milestones, nemesis/kryptonite detection (pure domain
// functions), leaderboard links from profile, and the rendering of
// nemesis/milestone badges in the players workspace.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  deriveRivalMilestones,
  detectNemesis,
  detectKryptonite,
  RivalMilestone,
} from '@intrilex/account-domain/relationships';

const playersSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/players.js'), 'utf8');
const profileSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
const playersCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/players/players.css'), 'utf8');
const indexSrc = readFileSync(join(process.cwd(), 'packages/account-domain/src/index.mjs'), 'utf8');

// ── Pure domain: deriveRivalMilestones ──

test('Milestones: empty h2h returns no milestones', () => {
  assert.deepEqual(deriveRivalMilestones(null), []);
  assert.deepEqual(deriveRivalMilestones({ games: 0, wins: 0, losses: 0, draws: 0, winRate: 0 }), []);
});

test('Milestones: first win earns First Blood', () => {
  const ms = deriveRivalMilestones({ games: 1, wins: 1, losses: 0, draws: 0, winRate: 1 });
  assert.ok(ms.some(m => m.type === RivalMilestone.FIRST_BLOOD), 'Must earn First Blood');
});

test('Milestones: first loss earns First Loss', () => {
  const ms = deriveRivalMilestones({ games: 1, wins: 0, losses: 1, draws: 0, winRate: 0 });
  assert.ok(ms.some(m => m.type === RivalMilestone.FIRST_LOSS), 'Must earn First Loss');
});

test('Milestones: 5 games earns Five Games milestone', () => {
  const ms = deriveRivalMilestones({ games: 5, wins: 3, losses: 2, draws: 0, winRate: 0.6 });
  assert.ok(ms.some(m => m.type === RivalMilestone.FIVE_GAMES), 'Must earn 5 Games milestone');
});

test('Milestones: 10 games earns Ten Games milestone', () => {
  const ms = deriveRivalMilestones({ games: 10, wins: 5, losses: 5, draws: 0, winRate: 0.5 });
  assert.ok(ms.some(m => m.type === RivalMilestone.TEN_GAMES), 'Must earn 10 Games milestone');
});

test('Milestones: even record (min 4 games, 2-2) earns Even Steven', () => {
  const ms = deriveRivalMilestones({ games: 4, wins: 2, losses: 2, draws: 0, winRate: 0.5 });
  assert.ok(ms.some(m => m.type === RivalMilestone.EVEN_STEVEN), 'Must earn Even Steven');
});

test('Milestones: 75%+ win rate (min 4 decided) earns Dominant', () => {
  const ms = deriveRivalMilestones({ games: 4, wins: 3, losses: 1, draws: 0, winRate: 0.75 });
  assert.ok(ms.some(m => m.type === RivalMilestone.DOMINANT), 'Must earn Dominant');
});

test('Milestones: 25%- win rate (min 4 decided) earns Dominated', () => {
  const ms = deriveRivalMilestones({ games: 4, wins: 1, losses: 3, draws: 0, winRate: 0.25 });
  assert.ok(ms.some(m => m.type === RivalMilestone.DOMINATED), 'Must earn Dominated');
});

test('Milestones: 3+ wins, 0 losses earns Unbeaten', () => {
  const ms = deriveRivalMilestones({ games: 3, wins: 3, losses: 0, draws: 0, winRate: 1 });
  assert.ok(ms.some(m => m.type === RivalMilestone.WIN_STREAK), 'Must earn Unbeaten');
});

test('Milestones: 3+ losses, 0 wins earns Winless', () => {
  const ms = deriveRivalMilestones({ games: 3, wins: 0, losses: 3, draws: 0, winRate: 0 });
  assert.ok(ms.some(m => m.type === RivalMilestone.LOSS_STREAK), 'Must earn Winless');
});

test('Milestones: comeback (3+ wins, 2+ losses) earns Comeback King', () => {
  const ms = deriveRivalMilestones({ games: 5, wins: 3, losses: 2, draws: 0, winRate: 0.6 });
  assert.ok(ms.some(m => m.type === RivalMilestone.COMEBACK_KING), 'Must earn Comeback King');
});

// ── Pure domain: detectNemesis ──

test('Nemesis: null for empty h2h', () => {
  assert.equal(detectNemesis(null), null);
  assert.equal(detectNemesis({ games: 0, wins: 0, losses: 0, draws: 0, winRate: 0 }), null);
});

test('Nemesis: null for < 3 decided games', () => {
  assert.equal(detectNemesis({ games: 2, wins: 0, losses: 2, draws: 0, winRate: 0 }), null);
});

test('Nemesis: detected when win rate <= 33% and 2+ more losses than wins', () => {
  const nemesis = detectNemesis({ games: 5, wins: 1, losses: 4, draws: 0, winRate: 0.2 });
  assert.ok(nemesis, 'Must detect nemesis');
  assert.equal(nemesis.label, 'Nemesis');
  assert.ok(nemesis.icon, 'Nemesis must have icon');
  assert.ok(nemesis.description, 'Nemesis must have description');
});

test('Nemesis: not detected when win rate > 33%', () => {
  assert.equal(detectNemesis({ games: 4, wins: 2, losses: 2, draws: 0, winRate: 0.5 }), null);
});

test('Nemesis: not detected when loss margin < 2', () => {
  // 1-2: winRate=0.33, but losses - wins = 1, not >= 2
  assert.equal(detectNemesis({ games: 3, wins: 1, losses: 2, draws: 0, winRate: 0.33 }), null);
});

// ── Pure domain: detectKryptonite ──

test('Kryptonite: null for empty h2h', () => {
  assert.equal(detectKryptonite(null), null);
});

test('Kryptonite: detected when win rate >= 67% and 2+ more wins than losses', () => {
  const k = detectKryptonite({ games: 5, wins: 4, losses: 1, draws: 0, winRate: 0.8 });
  assert.ok(k, 'Must detect kryptonite');
  assert.equal(k.label, 'Kryptonite');
});

test('Kryptonite: not detected when win rate < 67%', () => {
  assert.equal(detectKryptonite({ games: 4, wins: 2, losses: 2, draws: 0, winRate: 0.5 }), null);
});

// ── Domain exports ──

test('Domain: new functions exported from account-domain index', () => {
  assert.ok(indexSrc.includes('deriveRivalMilestones'), 'index.mjs must export deriveRivalMilestones');
  assert.ok(indexSrc.includes('detectNemesis'), 'index.mjs must export detectNemesis');
  assert.ok(indexSrc.includes('detectKryptonite'), 'index.mjs must export detectKryptonite');
  assert.ok(indexSrc.includes('RivalMilestone'), 'index.mjs must export RivalMilestone');
});

// ── Players workspace: nemesis/milestone rendering ──

test('Players: imports nemesis/milestone functions', () => {
  assert.ok(
    playersSrc.includes('detectNemesis') && playersSrc.includes('detectKryptonite'),
    'Players workspace must import nemesis/kryptonite detection'
  );
  assert.ok(
    playersSrc.includes('deriveRivalMilestones'),
    'Players workspace must import deriveRivalMilestones'
  );
});

test('Players: rival card renders nemesis badge', () => {
  assert.ok(
    playersSrc.includes('pd-nemesis-badge') && playersSrc.includes('pd-nemesis'),
    'Rival card must render nemesis badge with CSS classes'
  );
  assert.ok(
    playersSrc.includes('data-testid="pd-nemesis"'),
    'Nemesis badge must have data-testid'
  );
});

test('Players: rival card renders kryptonite badge', () => {
  assert.ok(
    playersSrc.includes('pd-kryptonite'),
    'Rival card must render kryptonite badge'
  );
  assert.ok(
    playersSrc.includes('data-testid="pd-kryptonite"'),
    'Kryptonite badge must have data-testid'
  );
});

test('Players: rival card renders milestone badges', () => {
  assert.ok(
    playersSrc.includes('pd-milestone-badge'),
    'Rival card must render milestone badges'
  );
  assert.ok(
    playersSrc.includes('data-testid="pd-milestone"'),
    'Milestone badges must have data-testid'
  );
});

// ── Profile: leaderboard link ──

test('Profile: ranked detail card has leaderboard link', () => {
  assert.ok(
    profileSrc.includes('profile-leaderboard-link'),
    'Profile ranked detail card must have leaderboard link'
  );
  assert.ok(
    profileSrc.includes('data-testid="profile-leaderboard-link"'),
    'Leaderboard link must have data-testid'
  );
  assert.ok(
    profileSrc.includes('#/leaderboard'),
    'Leaderboard link must point to #/leaderboard'
  );
});

// ── CSS ──

test('CSS: nemesis/kryptonite badge styles exist', () => {
  assert.ok(playersCssSrc.includes('.pd-nemesis'), 'CSS must have .pd-nemesis styles');
  assert.ok(playersCssSrc.includes('.pd-kryptonite'), 'CSS must have .pd-kryptonite styles');
});

test('CSS: milestone badge styles exist', () => {
  assert.ok(playersCssSrc.includes('.pd-milestone-badge'), 'CSS must have .pd-milestone-badge styles');
});

test('CSS: profile leaderboard link styles exist', () => {
  assert.ok(playersCssSrc.includes('.profile-leaderboard-link'), 'CSS must have .profile-leaderboard-link styles');
});
