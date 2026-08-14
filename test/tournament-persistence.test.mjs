// ═══════════════════════════════════════════════════════════════
// tournament-persistence.test.mjs — Tests for tournament DB persistence
// and bracket progression infrastructure
//
// 1. Supabase migration 0020 schema
// 2. Tournament repository (in-memory)
// 3. Tournament handlers (TOURNAMENT_START, TOURNAMENT_REPORT_RESULT)
// 4. Protocol validation (validateTournamentStart, validateTournamentReportResult)
// 5. Protocol exports
// 6. Client protocol builders
// 7. Network session methods
// 8. Server wiring
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Domain imports ──
import {
  createTournament,
  registerPlayer,
  startTournament,
  TournamentMatchStatus,
} from '@intrilex/account-domain/tournament-domain';

import {
  validateTournamentStart,
  validateTournamentReportResult,
} from '../packages/network-protocol/src/validation.mjs';

import {
  InMemoryTournamentRepository,
} from '../apps/match-server/src/persistence/tournament-repository.mjs';

import {
  createTournamentHandlers,
} from '../apps/match-server/src/handlers/tournament-handlers.mjs';

// ── Source file reads ──
const migrationSrc = readFileSync(join(process.cwd(), 'supabase/migrations/0020_tournaments.sql'), 'utf8');
const protocolSrc = readFileSync(join(process.cwd(), 'packages/network-protocol/src/protocol.mjs'), 'utf8');
const protocolClientSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-protocol-client.mjs'), 'utf8');
const networkSessionSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-session.mjs'), 'utf8');
const serverSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/server.mjs'), 'utf8');
const tournamentHandlersSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/handlers/tournament-handlers.mjs'), 'utf8');
const repositorySrc = readFileSync(join(process.cwd(), 'apps/match-server/src/persistence/tournament-repository.mjs'), 'utf8');

// ── Mock helpers ──

function mockSend() {
  const sent = [];
  const send = (ws, msg) => sent.push({ ws, msg });
  send._sent = sent;
  return send;
}

function mockLogEvent() {
  const events = [];
  const logEvent = (event, data) => events.push({ event, data });
  logEvent._events = events;
  return logEvent;
}

function mockConnections() {
  const connections = new Map();
  return connections;
}

function makeConnection(accountId = 'acc-1', publicPlayerId = 'PLY_001') {
  return {
    account: {
      accountId,
      publicPlayerId,
      displayName: 'TestPlayer',
      handle: 'testplayer',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. SUPABASE MIGRATION 0020 SCHEMA
// ═══════════════════════════════════════════════════════════════

test('Migration 0020: creates tournaments table', () => {
  assert.ok(migrationSrc.includes('CREATE TABLE IF NOT EXISTS public.tournaments'), 'Must create tournaments table');
  assert.ok(migrationSrc.includes('tournament_id'), 'Must have tournament_id column');
  assert.ok(migrationSrc.includes('format'), 'Must have format column');
  assert.ok(migrationSrc.includes("CHECK (format IN ('SINGLE_ELIM', 'SWISS'))"), 'Must validate format');
  assert.ok(migrationSrc.includes("CHECK (status IN ('SCHEDULED', 'REGISTRATION', 'IN_PROGRESS', 'FINALIZING', 'COMPLETED', 'CANCELLED'))"), 'Must validate status');
});

test('Migration 0020: creates tournament_participants table', () => {
  assert.ok(migrationSrc.includes('CREATE TABLE IF NOT EXISTS public.tournament_participants'), 'Must create participants table');
  assert.ok(migrationSrc.includes('public_player_id'), 'Must have public_player_id column');
  assert.ok(migrationSrc.includes('REFERENCES public.tournaments(tournament_id)'), 'Must FK to tournaments');
});

test('Migration 0020: creates tournament_matches table', () => {
  assert.ok(migrationSrc.includes('CREATE TABLE IF NOT EXISTS public.tournament_matches'), 'Must create matches table');
  assert.ok(migrationSrc.includes('player_a_id'), 'Must have player_a_id column');
  assert.ok(migrationSrc.includes('winner_id'), 'Must have winner_id column');
  assert.ok(migrationSrc.includes("CHECK (status IN ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'BYE'))"), 'Must validate match status');
});

test('Migration 0020: enables RLS on all tables', () => {
  assert.ok(migrationSrc.includes('ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on tournaments');
  assert.ok(migrationSrc.includes('ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on participants');
  assert.ok(migrationSrc.includes('ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on matches');
});

test('Migration 0020: creates SELECT policies for authenticated users', () => {
  assert.ok(migrationSrc.includes('tournaments_select'), 'Must have tournaments SELECT policy');
  assert.ok(migrationSrc.includes('tournament_participants_select'), 'Must have participants SELECT policy');
  assert.ok(migrationSrc.includes('tournament_matches_select'), 'Must have matches SELECT policy');
  assert.ok(migrationSrc.includes('FOR SELECT TO authenticated'), 'Must allow authenticated SELECT');
});

test('Migration 0020: no INSERT/UPDATE/DELETE policies for authenticated', () => {
  // The migration should NOT create write policies for authenticated users
  // Only the service role (server) can write
  const writePolicyCount = (migrationSrc.match(/FOR (INSERT|UPDATE|DELETE) TO authenticated/g) || []).length;
  assert.equal(writePolicyCount, 0, 'Must not create write policies for authenticated users');
});

test('Migration 0020: creates indexes', () => {
  assert.ok(migrationSrc.includes('idx_tournament_matches_tournament_id'), 'Must create matches index');
  assert.ok(migrationSrc.includes('idx_tournament_participants_tournament_id'), 'Must create participants index');
});

// ═══════════════════════════════════════════════════════════════
// 2. TOURNAMENT REPOSITORY (IN-MEMORY)
// ═══════════════════════════════════════════════════════════════

test('Repository: InMemoryTournamentRepository save and get', async () => {
  const repo = new InMemoryTournamentRepository();
  const tournament = createTournament({ name: 'Test Cup', format: 'SINGLE_ELIM', maxPlayers: 8 });
  await repo.save(tournament);
  const retrieved = await repo.get(tournament.tournamentId);
  assert.ok(retrieved, 'Should retrieve saved tournament');
  assert.equal(retrieved.name, 'Test Cup');
  assert.equal(retrieved.format, 'SINGLE_ELIM');
});

test('Repository: InMemoryTournamentRepository list', async () => {
  const repo = new InMemoryTournamentRepository();
  const t1 = createTournament({ name: 'Cup A', maxPlayers: 4 });
  const t2 = createTournament({ name: 'Cup B', maxPlayers: 8 });
  await repo.save(t1);
  await repo.save(t2);
  const all = await repo.list(null, 100);
  assert.equal(all.length, 2, 'Should list all tournaments');
});

test('Repository: InMemoryTournamentRepository list with status filter', async () => {
  const repo = new InMemoryTournamentRepository();
  const t1 = createTournament({ name: 'Cup A', maxPlayers: 4 });
  const t2 = createTournament({ name: 'Cup B', maxPlayers: 8 });
  // Register a player in t1 to move it to REGISTRATION
  const t1Registered = registerPlayer(t1, { publicPlayerId: 'PLY_001', displayName: 'P1' });
  await repo.save(t1Registered);
  await repo.save(t2);
  const registrationOnly = await repo.list('REGISTRATION', 100);
  assert.equal(registrationOnly.length, 1);
  assert.equal(registrationOnly[0].name, 'Cup A');
});

test('Repository: InMemoryTournamentRepository get returns null for missing', async () => {
  const repo = new InMemoryTournamentRepository();
  const result = await repo.get('TR_NONEXISTENT');
  assert.equal(result, null);
});

test('Repository: InMemoryTournamentRepository delete', async () => {
  const repo = new InMemoryTournamentRepository();
  const t = createTournament({ name: 'Delete Me', maxPlayers: 4 });
  await repo.save(t);
  await repo.delete(t.tournamentId);
  const result = await repo.get(t.tournamentId);
  assert.equal(result, null);
});

test('Repository: InMemoryTournamentRepository save is a deep copy', async () => {
  const repo = new InMemoryTournamentRepository();
  const t = createTournament({ name: 'Original', maxPlayers: 4 });
  await repo.save(t);
  // Mutate the original
  t.name = 'Mutated';
  const retrieved = await repo.get(t.tournamentId);
  assert.equal(retrieved.name, 'Original', 'Repository should store a copy, not a reference');
});

test('Repository: InMemoryTournamentRepository clear', async () => {
  const repo = new InMemoryTournamentRepository();
  const t = createTournament({ name: 'Clear Me', maxPlayers: 4 });
  await repo.save(t);
  repo.clear();
  const all = await repo.list(null, 100);
  assert.equal(all.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// 3. TOURNAMENT HANDLERS — TOURNAMENT_START
// ═══════════════════════════════════════════════════════════════

test('Handlers: TOURNAMENT_START by operator succeeds', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();
  const operatorAccountIds = new Set(['acc-operator']);

  // Create a tournament with 2 registered players
  let tournament = createTournament({ name: 'Op Cup', format: 'SINGLE_ELIM', maxPlayers: 4 });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_001', displayName: 'P1' });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_002', displayName: 'P2' });
  await repo.save(tournament);

  // Set up operator connection
  connections.set('conn-1', makeConnection('acc-operator', 'PLY_op', true));

  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds,
    send,
    logEvent,
  });

  await handlers.handleTournamentStart('conn-1', {}, { tournamentId: tournament.tournamentId }, 'req-1');

  assert.equal(send._sent.length, 1);
  assert.equal(send._sent[0].msg.type, 'TOURNAMENT_STARTED');
  assert.equal(send._sent[0].msg.payload.status, 'IN_PROGRESS');
  assert.ok(send._sent[0].msg.payload.matchCount > 0, 'Should have matches generated');
});

test('Handlers: TOURNAMENT_START by non-operator is rejected', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();
  const operatorAccountIds = new Set(['acc-operator']);

  let tournament = createTournament({ name: 'Op Cup', maxPlayers: 4 });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_001', displayName: 'P1' });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_002', displayName: 'P2' });
  await repo.save(tournament);

  // Non-operator connection
  connections.set('conn-1', makeConnection('acc-regular', 'PLY_reg', false));

  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds,
    send,
    logEvent,
  });

  await handlers.handleTournamentStart('conn-1', {}, { tournamentId: tournament.tournamentId }, 'req-1');

  assert.equal(send._sent.length, 1);
  assert.equal(send._sent[0].msg.type, 'ERROR');
  assert.equal(send._sent[0].msg.payload.code, 'TOURNAMENT_OPERATOR_ONLY');
});

test('Handlers: TOURNAMENT_START by unauthenticated is rejected', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  const tournament = createTournament({ name: 'Cup', maxPlayers: 4 });
  await repo.save(tournament);

  // Connection without account
  connections.set('conn-1', {});

  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(),
    send,
    logEvent,
  });

  await handlers.handleTournamentStart('conn-1', {}, { tournamentId: tournament.tournamentId }, 'req-1');

  assert.equal(send._sent[0].msg.type, 'ERROR');
  assert.equal(send._sent[0].msg.payload.code, 'AUTH_REQUIRED');
});

test('Handlers: TOURNAMENT_START on non-existent tournament returns error', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  connections.set('conn-1', makeConnection('acc-op', 'PLY_op'));
  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(['acc-op']),
    send,
    logEvent,
  });

  await handlers.handleTournamentStart('conn-1', {}, { tournamentId: 'TR_NONEXISTENT' }, 'req-1');

  assert.equal(send._sent[0].msg.type, 'ERROR');
  assert.equal(send._sent[0].msg.payload.code, 'TOURNAMENT_NOT_FOUND');
});

// ═══════════════════════════════════════════════════════════════
// 4. TOURNAMENT HANDLERS — TOURNAMENT_REPORT_RESULT
// ═══════════════════════════════════════════════════════════════

test('Handlers: TOURNAMENT_REPORT_RESULT by operator succeeds', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  // Create and start a tournament
  let tournament = createTournament({ name: 'Result Cup', format: 'SINGLE_ELIM', maxPlayers: 4 });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_001', displayName: 'P1' });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_002', displayName: 'P2' });
  tournament = startTournament(tournament);
  await repo.save(tournament);

  connections.set('conn-1', makeConnection('acc-op', 'PLY_op'));
  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(['acc-op']),
    send,
    logEvent,
  });

  // Find the first non-BYE match
  const match = tournament.matches.find(m => m.status === TournamentMatchStatus.SCHEDULED);
  assert.ok(match, 'Should have at least one scheduled match');

  await handlers.handleTournamentReportResult('conn-1', {}, {
    tournamentId: tournament.tournamentId,
    matchId: match.matchId,
    winnerId: match.playerAId,
    scoreA: 2,
    scoreB: 1,
  }, 'req-1');

  assert.equal(send._sent[0].msg.type, 'TOURNAMENT_RESULT_RECORDED');
  assert.equal(send._sent[0].msg.payload.winnerId, match.playerAId);
  assert.equal(send._sent[0].msg.payload.scoreA, 2);
  assert.equal(send._sent[0].msg.payload.scoreB, 1);
});

test('Handlers: TOURNAMENT_REPORT_RESULT by non-operator is rejected', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  let tournament = createTournament({ name: 'Cup', maxPlayers: 4 });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_001', displayName: 'P1' });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_002', displayName: 'P2' });
  tournament = startTournament(tournament);
  await repo.save(tournament);

  connections.set('conn-1', makeConnection('acc-regular', 'PLY_reg'));
  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(['acc-op']),
    send,
    logEvent,
  });

  const match = tournament.matches[0];
  await handlers.handleTournamentReportResult('conn-1', {}, {
    tournamentId: tournament.tournamentId,
    matchId: match.matchId,
    winnerId: 'PLY_001',
    scoreA: 1,
    scoreB: 0,
  }, 'req-1');

  assert.equal(send._sent[0].msg.type, 'ERROR');
  assert.equal(send._sent[0].msg.payload.code, 'TOURNAMENT_OPERATOR_ONLY');
});

test('Handlers: TOURNAMENT_REPORT_RESULT on completed tournament marks complete', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  // Create a 2-player single-elim — one match completes the tournament
  let tournament = createTournament({ name: 'Quick Cup', format: 'SINGLE_ELIM', maxPlayers: 2, bestOf: 1 });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_001', displayName: 'P1' });
  tournament = registerPlayer(tournament, { publicPlayerId: 'PLY_002', displayName: 'P2' });
  tournament = startTournament(tournament);
  await repo.save(tournament);

  connections.set('conn-1', makeConnection('acc-op', 'PLY_op'));
  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(['acc-op']),
    send,
    logEvent,
  });

  const match = tournament.matches.find(m => m.status === TournamentMatchStatus.SCHEDULED);
  await handlers.handleTournamentReportResult('conn-1', {}, {
    tournamentId: tournament.tournamentId,
    matchId: match.matchId,
    winnerId: 'PLY_001',
    scoreA: 1,
    scoreB: 0,
  }, 'req-1');

  assert.equal(send._sent[0].msg.payload.tournamentComplete, true);
  assert.equal(send._sent[0].msg.payload.tournamentStatus, 'COMPLETED');
});

// ═══════════════════════════════════════════════════════════════
// 5. TOURNAMENT HANDLERS — REGISTRATION FIX (conn.account)
// ═══════════════════════════════════════════════════════════════

test('Handlers: TOURNAMENT_REGISTER uses conn.account correctly', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  const tournament = createTournament({ name: 'Reg Cup', maxPlayers: 8 });
  await repo.save(tournament);

  // Connection with account (the correct shape)
  connections.set('conn-1', {
    account: {
      accountId: 'acc-1',
      publicPlayerId: 'PLY_001',
      displayName: 'Alice',
      handle: 'alice',
    },
  });

  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(),
    send,
    logEvent,
  });

  await handlers.handleTournamentRegister('conn-1', {}, { tournamentId: tournament.tournamentId }, 'req-1');

  assert.equal(send._sent[0].msg.type, 'TOURNAMENT_REGISTERED');
  assert.equal(send._sent[0].msg.payload.seed, 1);
  assert.equal(send._sent[0].msg.payload.registeredPlayers, 1);
});

test('Handlers: TOURNAMENT_REGISTER without account is rejected', async () => {
  const repo = new InMemoryTournamentRepository();
  const connections = mockConnections();
  const send = mockSend();
  const logEvent = mockLogEvent();

  const tournament = createTournament({ name: 'Reg Cup', maxPlayers: 8 });
  await repo.save(tournament);

  // Connection without account
  connections.set('conn-1', {});

  const handlers = createTournamentHandlers({
    connections,
    tournamentRepository: repo,
    operatorAccountIds: new Set(),
    send,
    logEvent,
  });

  await handlers.handleTournamentRegister('conn-1', {}, { tournamentId: tournament.tournamentId }, 'req-1');

  assert.equal(send._sent[0].msg.type, 'ERROR');
  assert.equal(send._sent[0].msg.payload.code, 'AUTH_REQUIRED');
});

// ═══════════════════════════════════════════════════════════════
// 6. PROTOCOL VALIDATION
// ═══════════════════════════════════════════════════════════════

test('Validation: validateTournamentStart with valid payload', () => {
  const result = validateTournamentStart({ tournamentId: 'TR_abc123' });
  assert.ok(result.valid);
});

test('Validation: validateTournamentStart with missing tournamentId', () => {
  const result = validateTournamentStart({});
  assert.ok(!result.valid);
});

test('Validation: validateTournamentReportResult with valid payload', () => {
  const result = validateTournamentReportResult({
    tournamentId: 'TR_abc123',
    matchId: 'TM_R1_M1',
    winnerId: 'PLY_001',
    scoreA: 2,
    scoreB: 1,
  });
  assert.ok(result.valid);
});

test('Validation: validateTournamentReportResult with missing matchId', () => {
  const result = validateTournamentReportResult({
    tournamentId: 'TR_abc123',
    winnerId: 'PLY_001',
  });
  assert.ok(!result.valid);
});

test('Validation: validateTournamentReportResult with empty winnerId', () => {
  const result = validateTournamentReportResult({
    tournamentId: 'TR_abc123',
    matchId: 'TM_R1_M1',
    winnerId: '',
  });
  assert.ok(!result.valid);
});

test('Validation: validateTournamentReportResult with negative score', () => {
  const result = validateTournamentReportResult({
    tournamentId: 'TR_abc123',
    matchId: 'TM_R1_M1',
    winnerId: 'PLY_001',
    scoreA: -1,
    scoreB: 0,
  });
  assert.ok(!result.valid);
});

test('Validation: validateTournamentReportResult with non-integer score', () => {
  const result = validateTournamentReportResult({
    tournamentId: 'TR_abc123',
    matchId: 'TM_R1_M1',
    winnerId: 'PLY_001',
    scoreA: 1.5,
    scoreB: 0,
  });
  assert.ok(!result.valid);
});

// ═══════════════════════════════════════════════════════════════
// 7. PROTOCOL EXPORTS
// ═══════════════════════════════════════════════════════════════

test('Protocol exports: validateTournamentStart is exported', () => {
  assert.ok(protocolSrc.includes('validateTournamentStart'), 'Must export validateTournamentStart');
});

test('Protocol exports: validateTournamentReportResult is exported', () => {
  assert.ok(protocolSrc.includes('validateTournamentReportResult'), 'Must export validateTournamentReportResult');
});

// ═══════════════════════════════════════════════════════════════
// 8. CLIENT PROTOCOL BUILDERS
// ═══════════════════════════════════════════════════════════════

test('Client protocol: tournamentStart builder exists', () => {
  assert.ok(protocolClientSrc.includes('export function tournamentStart'), 'Must export tournamentStart');
  assert.ok(protocolClientSrc.includes("envelope('TOURNAMENT_START'"), 'Must build TOURNAMENT_START envelope');
});

test('Client protocol: tournamentReportResult builder exists', () => {
  assert.ok(protocolClientSrc.includes('export function tournamentReportResult'), 'Must export tournamentReportResult');
  assert.ok(protocolClientSrc.includes("envelope('TOURNAMENT_REPORT_RESULT'"), 'Must build TOURNAMENT_REPORT_RESULT envelope');
});

// ═══════════════════════════════════════════════════════════════
// 9. NETWORK SESSION METHODS
// ═══════════════════════════════════════════════════════════════

test('NetworkSession: imports tournamentStart and tournamentReportResult', () => {
  assert.ok(networkSessionSrc.includes('tournamentStart'), 'Must import tournamentStart');
  assert.ok(networkSessionSrc.includes('tournamentReportResult'), 'Must import tournamentReportResult');
});

test('NetworkSession: requestTournamentStart method exists', () => {
  assert.ok(networkSessionSrc.includes('async requestTournamentStart'), 'Must have requestTournamentStart method');
});

test('NetworkSession: requestTournamentReportResult method exists', () => {
  assert.ok(networkSessionSrc.includes('async requestTournamentReportResult'), 'Must have requestTournamentReportResult method');
});

// ═══════════════════════════════════════════════════════════════
// 10. SERVER WIRING
// ═══════════════════════════════════════════════════════════════

test('Server: imports tournament repository classes', () => {
  assert.ok(serverSrc.includes('InMemoryTournamentRepository'), 'Must import InMemoryTournamentRepository');
  assert.ok(serverSrc.includes('SupabaseTournamentRepository'), 'Must import SupabaseTournamentRepository');
});

test('Server: uses tournamentRepository (not tournamentStore)', () => {
  assert.ok(serverSrc.includes('tournamentRepository'), 'Must use tournamentRepository');
  assert.ok(!serverSrc.includes('_tournamentStore'), 'Must not reference old _tournamentStore');
});

test('Server: dispatches TOURNAMENT_START', () => {
  assert.ok(serverSrc.includes("case 'TOURNAMENT_START'"), 'Must dispatch TOURNAMENT_START');
  assert.ok(serverSrc.includes('handleTournamentStart'), 'Must call handleTournamentStart');
});

test('Server: dispatches TOURNAMENT_REPORT_RESULT', () => {
  assert.ok(serverSrc.includes("case 'TOURNAMENT_REPORT_RESULT'"), 'Must dispatch TOURNAMENT_REPORT_RESULT');
  assert.ok(serverSrc.includes('handleTournamentReportResult'), 'Must call handleTournamentReportResult');
});

test('Server: supports operatorAccountIds option', () => {
  assert.ok(serverSrc.includes('operatorAccountIds'), 'Must support operatorAccountIds option');
  assert.ok(serverSrc.includes('INTRILEX_OPERATOR_ACCOUNTS'), 'Must read from env INTRILEX_OPERATOR_ACCOUNTS');
});

test('Server: creates SupabaseTournamentRepository when configured', () => {
  assert.ok(serverSrc.includes('new SupabaseTournamentRepository'), 'Must create Supabase repository in production');
});

test('Server: falls back to InMemoryTournamentRepository in dev', () => {
  assert.ok(serverSrc.includes('new InMemoryTournamentRepository'), 'Must fall back to in-memory repository');
});

// ═══════════════════════════════════════════════════════════════
// 11. HANDLER SOURCE STRUCTURE
// ═══════════════════════════════════════════════════════════════

test('Handlers: imports from tournament-domain', () => {
  assert.ok(tournamentHandlersSrc.includes('startTournament'), 'Must import startTournament');
  assert.ok(tournamentHandlersSrc.includes('recordTournamentResult'), 'Must import recordTournamentResult');
});

test('Handlers: imports validation from network-protocol', () => {
  assert.ok(tournamentHandlersSrc.includes('validateTournamentStart'), 'Must import validateTournamentStart');
  assert.ok(tournamentHandlersSrc.includes('validateTournamentReportResult'), 'Must import validateTournamentReportResult');
});

test('Handlers: uses conn.account (not conn.publicPlayerId directly)', () => {
  assert.ok(tournamentHandlersSrc.includes('conn.account'), 'Must access conn.account');
  assert.ok(!tournamentHandlersSrc.includes('conn.publicPlayerId'), 'Must not access conn.publicPlayerId directly (bug fix)');
});

test('Handlers: exports all 5 handler functions', () => {
  assert.ok(tournamentHandlersSrc.includes('handleTournamentList'), 'Must export handleTournamentList');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentGet'), 'Must export handleTournamentGet');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentRegister'), 'Must export handleTournamentRegister');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentStart'), 'Must export handleTournamentStart');
  assert.ok(tournamentHandlersSrc.includes('handleTournamentReportResult'), 'Must export handleTournamentReportResult');
});

test('Handlers: repository source exports both classes', () => {
  assert.ok(repositorySrc.includes('class InMemoryTournamentRepository'), 'Must export InMemoryTournamentRepository');
  assert.ok(repositorySrc.includes('class SupabaseTournamentRepository'), 'Must export SupabaseTournamentRepository');
});

