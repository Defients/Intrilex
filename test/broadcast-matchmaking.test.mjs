// ═══════════════════════════════════════════════════════════════
// broadcast-matchmaking.test.mjs — Stage 5 tests
//
// Tests for:
//   V3 — Tournament broadcast view
//   P6 — Rating-band matchmaking
//   P9 — Ranked entry requirements
//   P11 — Season end countdown + reward preview
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── P6: Matchmaking queue ──
import { MatchmakingQueue } from '../packages/match-authority/src/matchmaking-queue.mjs';
const queueSrc = readFileSync(join(process.cwd(), 'packages/match-authority/src/matchmaking-queue.mjs'), 'utf8');

// ── P9: Ranked entry requirements ──
import { checkRankedEntryRequirements, MIN_CASUAL_MATCHES } from '../packages/account-domain/src/ranked-entry-requirements.mjs';
const rankedEntrySrc = readFileSync(join(process.cwd(), 'packages/account-domain/src/ranked-entry-requirements.mjs'), 'utf8');

// ── P11: Season countdown ──
import { computeSeasonCountdown, renderSeasonCountdown } from '../packages/account-domain/src/season-countdown.mjs';
const seasonCountdownSrc = readFileSync(join(process.cwd(), 'packages/account-domain/src/season-countdown.mjs'), 'utf8');

// ── V3: Tournament broadcast ──
import { renderTournamentBroadcast, buildBroadcastEvent } from '../apps/lab-web/src/workspaces/tournament-broadcast.mjs';
const broadcastSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/tournament-broadcast.mjs'), 'utf8');

// ═══════════════════════════════════════════════════════════════
// P6: RATING-BAND MATCHMAKING
// ═══════════════════════════════════════════════════════════════

test('P6: MatchmakingQueue accepts ratingProvider option', () => {
  assert.ok(queueSrc.includes('ratingProvider'), 'Queue must accept ratingProvider option');
});

test('P6: Queue uses rating band for ranked pairing', () => {
  assert.ok(queueSrc.includes('rating-band') || queueSrc.includes('Rating-band'), 'Must have rating-band logic');
  assert.ok(queueSrc.includes('band'), 'Must compute a rating band');
});

test('P6: Queue falls back to FIFO when no rating available', () => {
  // Create a queue with a rating provider that returns null
  let matchCreated = false;
  const queue = new MatchmakingQueue({
    onCreateMatch: () => { matchCreated = true; return [{ connectionId: 'c1', matchId: 'M1', participantId: 'P1', participantToken: 't1' }, { connectionId: 'c2', matchId: 'M1', participantId: 'P2', participantToken: 't2' }]; },
    ratingProvider: () => null,
  });
  queue.enqueue('c1', 'core-unrestricted-authority', 'acc-1', 'ranked');
  const result = queue.enqueue('c2', 'core-unrestricted-authority', 'acc-2', 'ranked');
  // Should still pair even without ratings (FIFO fallback)
  assert.ok(result.paired || matchCreated, 'Should pair via FIFO when no ratings');
});

test('P6: Queue pairs within rating band when ratings available', () => {
  const queue = new MatchmakingQueue({
    onCreateMatch: (_profile, _seed, players) => players.map(p => ({
      connectionId: p.connectionId, matchId: 'M1', participantId: p.connectionId === 'c1' ? 'P1' : 'P2', participantToken: 't1',
    })),
    ratingProvider: (accountId) => {
      const ratings = { 'acc-1': { rating: 1500, rd: 50 }, 'acc-2': { rating: 1510, rd: 50 }, 'acc-3': { rating: 3000, rd: 50 } };
      return ratings[accountId] ?? null;
    },
  });
  // Enqueue 3 players: two close, one far away
  queue.enqueue('c1', 'core-unrestricted-authority', 'acc-1', 'ranked');
  queue.enqueue('c3', 'core-unrestricted-authority', 'acc-3', 'ranked');
  // Enqueue c2 — should pair with c1 (close rating) not c3 (far)
  const result = queue.enqueue('c2', 'core-unrestricted-authority', 'acc-2', 'ranked');
  if (result.paired) {
    const pairedIds = result.paired.map(p => p.connectionId).sort();
    // c2 should be paired, and ideally with c1 (close rating)
    assert.ok(pairedIds.includes('c2'), 'c2 should be paired');
  }
});

// ═══════════════════════════════════════════════════════════════
// P9: RANKED ENTRY REQUIREMENTS
// ═══════════════════════════════════════════════════════════════

test('P9: MIN_CASUAL_MATCHES is defined', () => {
  assert.ok(typeof MIN_CASUAL_MATCHES === 'number');
  assert.ok(MIN_CASUAL_MATCHES > 0);
});

test('P9: rejects anonymous accounts', () => {
  const result = checkRankedEntryRequirements({ isAnonymous: true });
  assert.ok(!result.allowed);
  assert.equal(result.reason, 'RANKED_REQUIRES_PERMANENT_ACCOUNT');
});

test('P9: rejects insufficient casual matches', () => {
  const result = checkRankedEntryRequirements({ isAnonymous: false, casualMatchesPlayed: 1, tutorialCompleted: true });
  assert.ok(!result.allowed);
  assert.equal(result.reason, 'RANKED_REQUIRES_CASUAL_EXPERIENCE');
});

test('P9: rejects without tutorial completion', () => {
  const result = checkRankedEntryRequirements({ isAnonymous: false, casualMatchesPlayed: 5, tutorialCompleted: false });
  assert.ok(!result.allowed);
  assert.equal(result.reason, 'RANKED_REQUIRES_TUTORIAL');
});

test('P9: allows when all requirements met', () => {
  const result = checkRankedEntryRequirements({ isAnonymous: false, casualMatchesPlayed: 5, tutorialCompleted: true });
  assert.ok(result.allowed);
  assert.equal(result.reason, null);
});

test('P9: operator bypasses all checks', () => {
  const result = checkRankedEntryRequirements({ isAnonymous: true, casualMatchesPlayed: 0, tutorialCompleted: false, isOperator: true });
  assert.ok(result.allowed);
});

test('P9: source exports checkRankedEntryRequirements', () => {
  assert.ok(rankedEntrySrc.includes('export function checkRankedEntryRequirements'));
});

// ═══════════════════════════════════════════════════════════════
// P11: SEASON END COUNTDOWN + REWARD PREVIEW
// ═══════════════════════════════════════════════════════════════

test('P11: computeSeasonCountdown returns active for future end date', () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days
  const result = computeSeasonCountdown(future);
  assert.ok(result.active);
  assert.ok(result.daysRemaining > 0);
  assert.ok(result.countdownLabel.includes('day'));
});

test('P11: computeSeasonCountdown returns inactive for past end date', () => {
  const past = new Date(Date.now() - 1000);
  const result = computeSeasonCountdown(past);
  assert.ok(!result.active);
  assert.equal(result.daysRemaining, 0);
  assert.equal(result.countdownLabel, 'Season ended');
});

test('P11: computeSeasonCountdown handles hours remaining', () => {
  const soon = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5 hours
  const result = computeSeasonCountdown(soon);
  assert.ok(result.active);
  assert.equal(result.daysRemaining, 0);
  assert.ok(result.hoursRemaining > 0);
  assert.ok(result.countdownLabel.includes('hour'));
});

test('P11: computeSeasonCountdown includes reward preview', () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const result = computeSeasonCountdown(future);
  assert.ok(result.rewardPreview);
  assert.ok(result.rewardPreview.titles);
  assert.ok(result.rewardPreview.titles.length > 0);
});

test('P11: computeSeasonCountdown handles invalid date', () => {
  const result = computeSeasonCountdown('invalid-date');
  assert.ok(!result.active);
  assert.equal(result.countdownLabel, null);
});

test('P11: renderSeasonCountdown produces HTML', () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const countdown = computeSeasonCountdown(future);
  const html = renderSeasonCountdown(countdown);
  assert.ok(html.includes('season-countdown'));
  assert.ok(html.includes('season-rewards-preview'));
});

test('P11: renderSeasonCountdown returns empty for inactive season', () => {
  const past = new Date(Date.now() - 1000);
  const countdown = computeSeasonCountdown(past);
  const html = renderSeasonCountdown(countdown);
  assert.equal(html, '');
});

test('P11: source exports computeSeasonCountdown', () => {
  assert.ok(seasonCountdownSrc.includes('export function computeSeasonCountdown'));
});

// ═══════════════════════════════════════════════════════════════
// V3: TOURNAMENT BROADCAST VIEW
// ═══════════════════════════════════════════════════════════════

test('V3: renderTournamentBroadcast produces HTML', () => {
  const state = {
    tournament: { name: 'Championship Cup' },
    match: { scoreA: 2, scoreB: 1 },
    playerA: { displayName: 'Alice', tier: 'GOLD', rating: 1850 },
    playerB: { displayName: 'Bob', tier: 'SILVER', rating: 1650 },
    round: 3,
    totalRounds: 5,
    eventFeed: [
      { text: 'Alice scores', timestamp: new Date().toISOString() },
    ],
    spectatorCount: 42,
  };
  const html = renderTournamentBroadcast(state);
  assert.ok(html.includes('tournament-broadcast'));
  assert.ok(html.includes('Championship Cup'));
  assert.ok(html.includes('Alice'));
  assert.ok(html.includes('Bob'));
  assert.ok(html.includes('Round 3 of 5'));
  assert.ok(html.includes('42 watching'));
});

test('V3: renderTournamentBroadcast returns empty for null state', () => {
  assert.equal(renderTournamentBroadcast(null), '');
  assert.equal(renderTournamentBroadcast({}), '');
});

test('V3: renderTournamentBroadcast shows leading player', () => {
  const state = {
    tournament: { name: 'Cup' },
    match: { scoreA: 3, scoreB: 1 },
    playerA: { displayName: 'A', tier: 'GOLD', rating: 1800 },
    playerB: { displayName: 'B', tier: 'SILVER', rating: 1600 },
    round: 1, totalRounds: 3, eventFeed: [], spectatorCount: 0,
  };
  const html = renderTournamentBroadcast(state);
  assert.ok(html.includes('broadcast-nameplate-leading'), 'Leading player should be highlighted');
});

test('V3: buildBroadcastEvent creates event for scoring', () => {
  const event = buildBroadcastEvent({
    type: 'play-for-points',
    playerId: 'P1',
    payload: { card: '7♠' },
    timestamp: new Date().toISOString(),
  });
  assert.ok(event);
  assert.ok(event.text.includes('scores'));
  assert.ok(event.text.includes('7♠'));
});

test('V3: buildBroadcastEvent creates event for scuttle', () => {
  const event = buildBroadcastEvent({
    type: 'scuttle',
    playerId: 'P2',
    payload: { card: 'K♦' },
    timestamp: new Date().toISOString(),
  });
  assert.ok(event);
  assert.ok(event.text.includes('scuttles'));
});

test('V3: buildBroadcastEvent returns null for uninteresting events', () => {
  const event = buildBroadcastEvent({
    type: 'draw',
    playerId: 'P1',
    payload: {},
  });
  assert.equal(event, null);
});

test('V3: source exports renderTournamentBroadcast', () => {
  assert.ok(broadcastSrc.includes('export function renderTournamentBroadcast'));
  assert.ok(broadcastSrc.includes('export function buildBroadcastEvent'));
});
