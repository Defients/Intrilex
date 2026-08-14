// ═══════════════════════════════════════════════════════════════
// provision-season.test.mjs — Season provisioning CLI pure-logic tests
//
// Tests the pure helpers (buildSeasonRow, parseArgs) exported from
// scripts/provision-season.mjs. DB I/O is not exercised here.
// Addresses H2: season provisioning path.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeasonRow, parseArgs, findNextUpcomingSeason, findActiveSeason } from '../scripts/provision-season.mjs';

test('provision-season: buildSeasonRow derives season id + name from ordinal', () => {
  const row = buildSeasonRow({ ordinal: 1 });
  assert.equal(row.season_id, 'season-1');
  assert.equal(row.name, 'Season 1');
  assert.equal(row.queue_id, 'ranked');
  assert.equal(row.status, 'UPCOMING');
  assert.ok(new Date(row.ends_at) > new Date(row.starts_at), 'ends_at must follow starts_at');
});

test('provision-season: buildSeasonRow respects explicit name + queue + activate', () => {
  const row = buildSeasonRow({ ordinal: 3, name: 'Phoenix League', queueId: 'casual', activate: true });
  assert.equal(row.season_id, 'season-3');
  assert.equal(row.name, 'Phoenix League');
  assert.equal(row.queue_id, 'casual');
  assert.equal(row.status, 'ACTIVE');
});

test('provision-season: buildSeasonRow honors custom starts-at + duration-days', () => {
  const row = buildSeasonRow({ ordinal: 2, startsAt: '2026-01-01T00:00:00Z', durationDays: 30 });
  assert.equal(row.starts_at, '2026-01-01T00:00:00.000Z');
  // 30 days later
  assert.equal(row.ends_at, '2026-01-31T00:00:00.000Z');
});

test('provision-season: buildSeasonRow attaches rules_version when provided', () => {
  const row = buildSeasonRow({ ordinal: 1, rulesVersion: '4.3.1' });
  assert.equal(row.rules_version, '4.3.1');
});

test('provision-season: buildSeasonRow rejects non-positive ordinal', () => {
  assert.throws(() => buildSeasonRow({ ordinal: 0 }), /positive integer/);
  assert.throws(() => buildSeasonRow({ ordinal: -1 }), /positive integer/);
  assert.throws(() => buildSeasonRow({ ordinal: 'x' }), /positive integer/);
});

test('provision-season: parseArgs parses command + flags + values', () => {
  const { command, opts } = parseArgs(['node', 'provision-season.mjs', 'provision', '--ordinal', '2', '--activate', '--name', 'Season 2']);
  assert.equal(command, 'provision');
  assert.equal(opts.ordinal, 2);
  assert.equal(opts.activate, true);
  assert.equal(opts.name, 'Season 2');
});

test('provision-season: parseArgs parses duration-days as number', () => {
  const { opts } = parseArgs(['node', 'x', 'provision', '--duration-days', '60']);
  assert.equal(opts.durationDays, 60);
});

test('provision-season: parseArgs rejects missing command', () => {
  assert.throws(() => parseArgs(['node', 'x']), /usage/);
});

// ── Rollover helpers ──

test('provision-season: findActiveSeason returns the active season for a queue', () => {
  const seasons = [
    { season_id: 'season-1', queue_id: 'ranked', status: 'ARCHIVED', ordinal: 1 },
    { season_id: 'season-2', queue_id: 'ranked', status: 'ACTIVE', ordinal: 2 },
    { season_id: 'season-3', queue_id: 'ranked', status: 'UPCOMING', ordinal: 3 },
  ];
  const active = findActiveSeason(seasons, 'ranked');
  assert.equal(active?.season_id, 'season-2');
});

test('provision-season: findActiveSeason returns null when no active season', () => {
  const seasons = [
    { season_id: 'season-1', queue_id: 'ranked', status: 'ARCHIVED', ordinal: 1 },
    { season_id: 'season-2', queue_id: 'ranked', status: 'UPCOMING', ordinal: 2 },
  ];
  assert.equal(findActiveSeason(seasons, 'ranked'), null);
});

test('provision-season: findNextUpcomingSeason returns lowest-ordinal upcoming', () => {
  const seasons = [
    { season_id: 'season-1', queue_id: 'ranked', status: 'ARCHIVED', ordinal: 1 },
    { season_id: 'season-2', queue_id: 'ranked', status: 'ACTIVE', ordinal: 2 },
    { season_id: 'season-3', queue_id: 'ranked', status: 'UPCOMING', ordinal: 3 },
    { season_id: 'season-4', queue_id: 'ranked', status: 'UPCOMING', ordinal: 4 },
  ];
  const next = findNextUpcomingSeason(seasons, 'ranked');
  assert.equal(next?.season_id, 'season-3');
});

test('provision-season: findNextUpcomingSeason returns null when none upcoming', () => {
  const seasons = [
    { season_id: 'season-1', queue_id: 'ranked', status: 'ARCHIVED', ordinal: 1 },
    { season_id: 'season-2', queue_id: 'ranked', status: 'ACTIVE', ordinal: 2 },
  ];
  assert.equal(findNextUpcomingSeason(seasons, 'ranked'), null);
});

test('provision-season: findNextUpcomingSeason filters by queue_id', () => {
  const seasons = [
    { season_id: 'season-2', queue_id: 'ranked', status: 'ACTIVE', ordinal: 2 },
    { season_id: 'casual-1', queue_id: 'casual', status: 'UPCOMING', ordinal: 1 },
  ];
  // Should not return the casual season when looking for ranked
  assert.equal(findNextUpcomingSeason(seasons, 'ranked'), null);
  const casualNext = findNextUpcomingSeason(seasons, 'casual');
  assert.equal(casualNext?.season_id, 'casual-1');
});

test('provision-season: findNextUpcomingSeason handles empty/non-array input', () => {
  assert.equal(findNextUpcomingSeason(null, 'ranked'), null);
  assert.equal(findNextUpcomingSeason([], 'ranked'), null);
});

test('provision-season: parseArgs accepts rollover command', () => {
  const { command, opts } = parseArgs(['node', 'x', 'rollover', '--auto-provision', '--duration-days', '60']);
  assert.equal(command, 'rollover');
  assert.equal(opts['auto-provision'], true);
  assert.equal(opts.durationDays, 60);
});
