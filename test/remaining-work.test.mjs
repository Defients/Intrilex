// ═══════════════════════════════════════════════════════════════
// remaining-work.test.mjs — Tests for the four remaining-work items
//
// 1. Meta report domain + UI
// 2. Replay branching domain
// 3. Tournament server handlers + protocol validation
// 4. Match stats aggregator (fingerprint enrichment)
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildMetaReport,
  formatTierPercentage,
  getTierDistributionChart,
} from '@intrilex/account-domain/meta-report';

import {
  isPlayerReplayBranchable,
  extractReplayCheckpoints,
  buildReplayBranchSummary,
  selectSampleCheckpoints,
} from '@intrilex/account-domain/replay-branching';

import {
  aggregateMatchStats,
  buildEnrichedStats,
} from '@intrilex/account-domain/match-stats-aggregator';

// network-protocol is not a root workspace dependency, so we import
// the validation functions directly from the source file.
import { validateTournamentList, validateTournamentRegister, validateTournamentGet } from '../packages/network-protocol/src/validation.mjs';

const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const metaSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/meta-report.js'), 'utf8');
const seoSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/seo-metadata.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');
const indexSrc = readFileSync(join(process.cwd(), 'packages/account-domain/src/index.mjs'), 'utf8');
const serverSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/server.mjs'), 'utf8');
const tournamentHandlersSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/handlers/tournament-handlers.mjs'), 'utf8');
const protocolSrc = readFileSync(join(process.cwd(), 'packages/network-protocol/src/protocol.mjs'), 'utf8');
const profileSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/profile.js'), 'utf8');

// ── 1. META REPORT ──

test('Meta: buildMetaReport with empty entries', () => {
  const r = buildMetaReport([]);
  assert.equal(r.totalPlayers, 0);
  assert.equal(r.totalGames, 0);
  assert.equal(r.competitiveHealth, 'EMERGING');
  assert.ok(r.summary.includes('No ranked players'));
  assert.equal(r.tierDistribution.length, 8); // 8 tiers in ladder
});

test('Meta: buildMetaReport with entries computes tier distribution', () => {
  const entries = [
    { rank: { tier: 'INITIATE', rating: 800, isApex: false }, record: { wins: 5, losses: 3, draws: 0, games: 8, winRate: 0.625 } },
    { rank: { tier: 'INITIATE', rating: 1000, isApex: false }, record: { wins: 3, losses: 5, draws: 0, games: 8, winRate: 0.375 } },
    { rank: { tier: 'CIPHER', rating: 1300, isApex: false }, record: { wins: 10, losses: 5, draws: 0, games: 15, winRate: 0.667 } },
    { rank: { tier: 'WARDEN', rating: 1500, isApex: false }, record: { wins: 8, losses: 2, draws: 0, games: 10, winRate: 0.8 } },
  ];
  const r = buildMetaReport(entries);
  assert.equal(r.totalPlayers, 4);
  assert.equal(r.totalGames, 41);
  assert.equal(r.dominantTier, 'INITIATE'); // 2 players
  assert.equal(r.topTier, 'WARDEN');
  assert.equal(r.apexCount, 0);
  assert.equal(r.activePlayerCount, 2); // 2 players with >= 10 games (15 and 10)
  assert.equal(r.competitiveHealth, 'EMERGING');
  const initiate = r.tierDistribution.find(b => b.tier === 'INITIATE');
  assert.equal(initiate.count, 2);
  assert.equal(initiate.percentage, 0.5);
});

test('Meta: buildMetaReport computes avg and median rating', () => {
  const entries = [
    { rank: { tier: 'INITIATE', rating: 800, isApex: false }, record: { wins: 1, losses: 0, draws: 0, games: 1, winRate: 1 } },
    { rank: { tier: 'INITIATE', rating: 1000, isApex: false }, record: { wins: 1, losses: 0, draws: 0, games: 1, winRate: 1 } },
    { rank: { tier: 'INITIATE', rating: 1200, isApex: false }, record: { wins: 1, losses: 0, draws: 0, games: 1, winRate: 1 } },
  ];
  const r = buildMetaReport(entries);
  assert.equal(r.avgRating, 1000);
  assert.equal(r.medianRating, 1000);
  assert.equal(r.ratingSpread, 400);
});

test('Meta: formatTierPercentage', () => {
  assert.equal(formatTierPercentage({ count: 0, percentage: 0 }), '0%');
  assert.equal(formatTierPercentage({ count: 5, percentage: 0.333 }), '33%');
  assert.equal(formatTierPercentage({ count: 10, percentage: 0.667 }), '67%');
});

test('Meta: getTierDistributionChart', () => {
  const r = buildMetaReport([
    { rank: { tier: 'INITIATE', rating: 800, isApex: false }, record: { wins: 1, losses: 0, draws: 0, games: 1, winRate: 1 } },
  ]);
  const chart = getTierDistributionChart(r);
  assert.equal(chart.length, 8);
  assert.equal(chart[0].tier, 'INITIATE');
  assert.equal(chart[0].count, 1);
  assert.equal(chart[0].label, 'Initiate');
});

test('Meta: competitive health thresholds', () => {
  // EMERGING: < 20 players
  const emerging = buildMetaReport(Array.from({ length: 5 }, (_, i) => ({
    rank: { tier: 'INITIATE', rating: 800 + i * 100, isApex: false },
    record: { wins: 5, losses: 5, draws: 0, games: 10, winRate: 0.5 },
  })));
  assert.equal(emerging.competitiveHealth, 'EMERGING');

  // GROWING: 20+ players, 200+ games
  const growing = buildMetaReport(Array.from({ length: 25 }, (_, i) => ({
    rank: { tier: 'INITIATE', rating: 800 + i * 10, isApex: false },
    record: { wins: 5, losses: 5, draws: 0, games: 10, winRate: 0.5 },
  })));
  assert.equal(growing.competitiveHealth, 'GROWING');
  assert.equal(growing.totalGames, 250);
});

// Meta UI tests

test('Meta UI: /meta route in LANDING_MODES', () => {
  assert.ok(routerSrc.includes("'/meta'"), 'Router must include /meta in LANDING_MODES');
});

test('Meta UI: /meta route handler in app.js', () => {
  assert.ok(appSrc.includes("r === '/meta'"), 'App must handle /meta route');
  assert.ok(appSrc.includes('renderMetaReport'), 'App must call renderMetaReport');
});

test('Meta UI: workspace module exists', () => {
  assert.ok(metaSrc.includes('export async function renderMetaReport'), 'Must export renderMetaReport');
  assert.ok(metaSrc.includes('data-testid="meta-panel"'), 'Must have panel testid');
  assert.ok(metaSrc.includes('data-testid="meta-tier-distribution"'), 'Must have tier distribution testid');
  assert.ok(metaSrc.includes('data-testid="meta-stat-grid"'), 'Must have stat grid testid');
});

test('Meta UI: uses buildMetaReport from domain', () => {
  assert.ok(metaSrc.includes('buildMetaReport'), 'Must use buildMetaReport');
  assert.ok(metaSrc.includes('fetchLeaderboard'), 'Must fetch leaderboard data');
});

test('Meta UI: handles offline and empty states', () => {
  assert.ok(metaSrc.includes('meta-offline'), 'Must have offline state');
  assert.ok(metaSrc.includes('meta-empty'), 'Must have empty state');
});

test('Meta SEO: /meta page has metadata', () => {
  assert.ok(seoSrc.includes("'/meta'"), 'SEO must include /meta route');
  assert.ok(seoSrc.includes('Meta Report'), 'SEO must mention Meta Report');
});

test('Meta CSS: styles exist', () => {
  assert.ok(cssSrc.includes('.meta-panel'), 'CSS must have .meta-panel');
  assert.ok(cssSrc.includes('.meta-tier-list'), 'CSS must have tier list');
  assert.ok(cssSrc.includes('.meta-health-badge'), 'CSS must have health badge');
});

// ── 2. REPLAY BRANCHING ──

test('Branching: isPlayerReplayBranchable rejects null', () => {
  const r = isPlayerReplayBranchable(null);
  assert.equal(r.supported, false);
  assert.equal(r.reason, 'NO_REPLAY');
});

test('Branching: isPlayerReplayBranchable rejects no commands', () => {
  assert.equal(isPlayerReplayBranchable({}).supported, false);
  assert.equal(isPlayerReplayBranchable({ commands: [] }).supported, false);
  assert.equal(isPlayerReplayBranchable({ commands: 'x' }).supported, false);
});

test('Branching: isPlayerReplayBranchable rejects no contentHash', () => {
  const r = isPlayerReplayBranchable({ commands: [{ actionId: 'A' }] });
  assert.equal(r.supported, false);
  assert.equal(r.reason, 'NO_CONTENT_HASH');
});

test('Branching: isPlayerReplayBranchable accepts valid replay', () => {
  const r = isPlayerReplayBranchable({ commands: [{ actionId: 'A' }], contentHash: 'abc123' });
  assert.equal(r.supported, true);
  assert.equal(r.reason, null);
});

test('Branching: extractReplayCheckpoints filters to human seat', () => {
  const replay = {
    commands: [
      { actionId: 'PLAY_CARD', seat: 1, turn: 1, phase: 'ACTION' },
      { actionId: 'PLAY_CARD', seat: 2, turn: 1, phase: 'ACTION' },
      { actionId: 'DRAW_CARD', seat: 1, turn: 2, phase: 'ACTION' },
      { actionId: 'SYS_SHUFFLE', seat: 0, turn: 0, phase: 'SETUP' },
    ],
    contentHash: 'abc',
  };
  const cps = extractReplayCheckpoints(replay, { humanSeat: 1 });
  assert.equal(cps.length, 2); // Only seat 1, non-SYS, non-SETUP
  assert.equal(cps[0].commandId, 'PLAY_CARD');
  assert.equal(cps[1].commandId, 'DRAW_CARD');
});

test('Branching: extractReplayCheckpoints respects maxCheckpoints', () => {
  const commands = Array.from({ length: 100 }, (_, i) => ({
    actionId: `A${i}`, seat: 1, turn: i, phase: 'ACTION',
  }));
  const cps = extractReplayCheckpoints({ commands, contentHash: 'x' }, { maxCheckpoints: 10 });
  assert.equal(cps.length, 10);
});

test('Branching: buildReplayBranchSummary for unsupported replay', () => {
  const s = buildReplayBranchSummary({ commands: [] });
  assert.equal(s.supported, false);
  assert.equal(s.unsupportedReason, 'EMPTY_REPLAY');
  assert.equal(s.checkpoints.length, 0);
});

test('Branching: buildReplayBranchSummary for valid replay', () => {
  const s = buildReplayBranchSummary({
    replayId: 'R1',
    contentHash: 'hash123',
    commands: [
      { actionId: 'A', seat: 1, turn: 1, phase: 'ACTION' },
      { actionId: 'B', seat: 1, turn: 2, phase: 'ACTION' },
    ],
  });
  assert.equal(s.supported, true);
  assert.equal(s.replayId, 'R1');
  assert.equal(s.contentHash, 'hash123');
  assert.equal(s.commandCount, 2);
  assert.equal(s.checkpoints.length, 2);
});

test('Branching: selectSampleCheckpoints returns subset', () => {
  const cps = Array.from({ length: 50 }, (_, i) => ({ index: i, commandId: `A${i}`, label: `L${i}`, isDecision: true }));
  const sampled = selectSampleCheckpoints(cps, 5);
  assert.equal(sampled.length, 5);
  assert.equal(sampled[0].index, 0);
});

test('Branching: selectSampleCheckpoints returns all when count >= length', () => {
  const cps = [{ index: 0, commandId: 'A', label: 'L', isDecision: true }];
  const sampled = selectSampleCheckpoints(cps, 10);
  assert.equal(sampled.length, 1);
});

test('Branching: domain exports from index', () => {
  assert.ok(indexSrc.includes('isPlayerReplayBranchable'), 'index must export isPlayerReplayBranchable');
  assert.ok(indexSrc.includes('buildReplayBranchSummary'), 'index must export buildReplayBranchSummary');
});

// ── 3. TOURNAMENT SERVER INFRASTRUCTURE ──

test('Protocol: validateTournamentList accepts valid payload', () => {
  const r = validateTournamentList({ status: 'REGISTRATION', limit: 50 });
  assert.equal(r.valid, true);
});

test('Protocol: validateTournamentList accepts empty payload', () => {
  const r = validateTournamentList({});
  assert.equal(r.valid, true);
});

test('Protocol: validateTournamentList rejects invalid limit', () => {
  assert.equal(validateTournamentList({ limit: 0 }).valid, false);
  assert.equal(validateTournamentList({ limit: 200 }).valid, false);
  assert.equal(validateTournamentList({ limit: 'x' }).valid, false);
});

test('Protocol: validateTournamentRegister requires tournamentId', () => {
  assert.equal(validateTournamentRegister({}).valid, false);
  assert.equal(validateTournamentRegister({ tournamentId: 'TR_abc123' }).valid, true);
});

test('Protocol: validateTournamentGet requires tournamentId', () => {
  assert.equal(validateTournamentGet({}).valid, false);
  assert.equal(validateTournamentGet({ tournamentId: 'TR_abc123' }).valid, true);
});

test('Protocol: tournament validators exported from protocol.mjs', () => {
  assert.ok(protocolSrc.includes('validateTournamentList'), 'protocol.mjs must export validateTournamentList');
  assert.ok(protocolSrc.includes('validateTournamentRegister'), 'protocol.mjs must export validateTournamentRegister');
  assert.ok(protocolSrc.includes('validateTournamentGet'), 'protocol.mjs must export validateTournamentGet');
});

test('Server: tournament handlers module exists', () => {
  assert.ok(tournamentHandlersSrc.includes('export function createTournamentHandlers'), 'Must export createTournamentHandlers');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentList'), 'Must have handleTournamentList');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentGet'), 'Must have handleTournamentGet');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentRegister'), 'Must have handleTournamentRegister');
});

test('Server: tournament handlers wired into server.mjs', () => {
  assert.ok(serverSrc.includes('createTournamentHandlers'), 'server.mjs must import createTournamentHandlers');
  assert.ok(serverSrc.includes('_tournamentHandlers'), 'server.mjs must have _tournamentHandlers');
  assert.ok(serverSrc.includes("case 'TOURNAMENT_LIST'"), 'server.mjs must dispatch TOURNAMENT_LIST');
  assert.ok(serverSrc.includes("case 'TOURNAMENT_GET'"), 'server.mjs must dispatch TOURNAMENT_GET');
  assert.ok(serverSrc.includes("case 'TOURNAMENT_REGISTER'"), 'server.mjs must dispatch TOURNAMENT_REGISTER');
  assert.ok(serverSrc.includes('tournamentRepository'), 'server.mjs must use tournament repository');
});

test('Server: tournament handlers use tournament domain', () => {
  assert.ok(tournamentHandlersSrc.includes('registerPlayer'), 'Handlers must use registerPlayer from domain');
  assert.ok(tournamentHandlersSrc.includes('startTournament'), 'Handlers must use startTournament from domain');
  assert.ok(tournamentHandlersSrc.includes('recordTournamentResult'), 'Handlers must use recordTournamentResult from domain');
});

// ── 4. MATCH STATS AGGREGATOR (fingerprint enrichment) ──

test('Aggregator: aggregateMatchStats with empty matches', () => {
  const s = aggregateMatchStats([], 'PLY_A');
  assert.equal(s.totalGames, 0);
  assert.equal(s.wins, 0);
  assert.equal(s.avgTurns, 0);
});

test('Aggregator: aggregateMatchStats computes wins/losses/draws', () => {
  const matches = [
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 15, humanIR: 21, oppIR: 15, drawPileRemaining: 8, goalProgress: 1.0, terminationReason: 'GOAL_REACHED' },
    { winnerId: 'PLY_B', humanPlayerId: 'PLY_A', turns: 20, humanIR: 15, oppIR: 21, drawPileRemaining: 5, goalProgress: 0.7, terminationReason: 'GOAL_REACHED' },
    { winnerId: null, humanPlayerId: 'PLY_A', turns: 25, humanIR: 18, oppIR: 18, drawPileRemaining: 2, goalProgress: 0.85, terminationReason: 'CANONICAL_DRAW' },
  ];
  const s = aggregateMatchStats(matches, 'PLY_A');
  assert.equal(s.totalGames, 3);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  assert.equal(s.draws, 1);
  assert.equal(s.avgTurns, 20); // (15+20+25)/3 = 20
});

test('Aggregator: aggregateMatchStats computes avg IR margin', () => {
  const matches = [
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 10, humanIR: 21, oppIR: 10, drawPileRemaining: 15, goalProgress: 1.0, terminationReason: 'GOAL' },
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 10, humanIR: 21, oppIR: 15, drawPileRemaining: 12, goalProgress: 1.0, terminationReason: 'GOAL' },
  ];
  const s = aggregateMatchStats(matches, 'PLY_A');
  // margins: |21-10|=11, |21-15|=6 → avg = 8.5 → rounded 9
  assert.equal(s.avgIrMargin, 9);
});

test('Aggregator: aggregateMatchStats tracks comeback wins', () => {
  const matches = [
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 15, humanIR: 21, oppIR: 15, drawPileRemaining: 8, goalProgress: 1.0, terminationReason: 'GOAL', wasBehindAtMidpoint: true },
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 10, humanIR: 21, oppIR: 10, drawPileRemaining: 15, goalProgress: 1.0, terminationReason: 'GOAL', wasBehindAtMidpoint: false },
  ];
  const s = aggregateMatchStats(matches, 'PLY_A');
  assert.equal(s.wins, 2);
  assert.equal(s.comebackWins, 1);
});

test('Aggregator: aggregateMatchStats filters to player matches', () => {
  const matches = [
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 10, humanIR: 21, oppIR: 10, drawPileRemaining: 15, goalProgress: 1.0, terminationReason: 'GOAL' },
    { winnerId: 'PLY_C', humanPlayerId: 'PLY_C', turns: 10, humanIR: 21, oppIR: 10, drawPileRemaining: 15, goalProgress: 1.0, terminationReason: 'GOAL' },
  ];
  const s = aggregateMatchStats(matches, 'PLY_A');
  assert.equal(s.totalGames, 1); // Only PLY_A's match
  assert.equal(s.wins, 1);
});

test('Aggregator: buildEnrichedStats with match data uses real averages', () => {
  const ranked = { wins: 2, losses: 1, draws: 0, games: 3 };
  const matches = [
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 10, humanIR: 21, oppIR: 10, drawPileRemaining: 15, goalProgress: 1.0, terminationReason: 'GOAL' },
    { winnerId: 'PLY_A', humanPlayerId: 'PLY_A', turns: 12, humanIR: 21, oppIR: 12, drawPileRemaining: 13, goalProgress: 1.0, terminationReason: 'GOAL' },
  ];
  const s = buildEnrichedStats(ranked, matches, 'PLY_A');
  assert.equal(s.wins, 2); // from ranked DTO
  assert.equal(s.avgTurns, 11); // (10+12)/2 = 11 — real data!
  assert.equal(s.avgDrawPileRemaining, 14); // (15+13)/2 = 14
});

test('Aggregator: buildEnrichedStats without match data falls back to defaults', () => {
  const ranked = { wins: 5, losses: 3, draws: 0, games: 8 };
  const s = buildEnrichedStats(ranked, [], 'PLY_A');
  assert.equal(s.wins, 5);
  assert.equal(s.totalGames, 8);
  assert.equal(s.avgTurns, 20); // default
  assert.equal(s.avgDrawPileRemaining, 10); // default
});

test('Aggregator: domain exports from index', () => {
  assert.ok(indexSrc.includes('aggregateMatchStats'), 'index must export aggregateMatchStats');
  assert.ok(indexSrc.includes('buildEnrichedStats'), 'index must export buildEnrichedStats');
});

test('Profile: uses buildEnrichedStats for fingerprint', () => {
  assert.ok(profileSrc.includes('buildEnrichedStats'), 'Profile must import buildEnrichedStats');
});
