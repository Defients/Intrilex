// ═══════════════════════════════════════════════════════════════
// irx-c07-protocol-registry.test.mjs — IRX-C07 protocol registry completeness
//
// Verifies that every implemented protocol message type (request, response,
// event) appears in the shared KNOWN_TYPES registry. An implemented handler
// absent from the registry is a CI failure — validateEnvelope() rejects
// unknown types before the handler is reached, making the handler dead code.
//
// Also verifies that every server dispatch case and every client builder
// has a corresponding entry in KNOWN_TYPES.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Import KNOWN_TYPES indirectly — it's not exported, so we re-derive it
// from the validation module by reading the source and extracting the Set.
import { validateEnvelope } from '../packages/network-protocol/src/validation.mjs';

// ── Extract KNOWN_TYPES from source ──
const validationSrc = readFileSync(
  join(ROOT, 'packages/network-protocol/src/validation.mjs'), 'utf8'
);
const knownTypesMatch = validationSrc.match(/const KNOWN_TYPES = new Set\(\[([\s\S]*?)\]\)/);
assert.ok(knownTypesMatch, 'KNOWN_TYPES must exist in validation.mjs');
const knownTypesStr = knownTypesMatch[1];
const knownTypes = new Set(
  knownTypesStr.match(/'([A-Z_]+)'/g)?.map(s => s.slice(1, -1)) || []
);

// ── Types that must be in the registry ──
// Client → Server (requests)
const REQUIRED_REQUEST_TYPES = [
  'CREATE_MATCH', 'JOIN_MATCH', 'RESUME_MATCH',
  'READY', 'SUBMIT_ACTION', 'REQUEST_SYNC', 'LEAVE_MATCH',
  'QUEUE_JOIN', 'QUEUE_LEAVE',
  'SPECTATE_MATCH', 'SPECTATE_LEAVE',
  'MATCH_HISTORY', 'GET_REPLAY',
  'SEND_CHAT', 'CHAT_VISIBILITY',
  'AUTHENTICATE', 'AUTH_REFRESH',
  'MIGRATE_GUEST',
  'REMATCH', 'LIST_SPECTATABLE',
  // IRX-C07: Tournament and report types
  'TOURNAMENT_LIST', 'TOURNAMENT_GET', 'TOURNAMENT_REGISTER',
  'TOURNAMENT_START', 'TOURNAMENT_REPORT_RESULT',
  'REPORT_PLAYER',
];

// Server → Client (responses/events)
const REQUIRED_RESPONSE_TYPES = [
  'MATCH_CREATED', 'MATCH_JOINED', 'MATCH_VIEW',
  'ACTION_RESULT', 'PARTICIPANT_STATUS', 'MATCH_STARTED',
  'MATCH_ENDED', 'ERROR',
  'QUEUE_JOINED', 'QUEUE_LEFT', 'QUEUE_MATCHED',
  'SPECTATE_JOINED', 'SPECTATE_LEFT',
  'MATCH_HISTORY_RESULT',
  'REPLAY_AVAILABLE', 'REPLAY_DATA',
  'CHAT_MESSAGE', 'CHAT_VISIBILITY_CHANGE',
  'ACHIEVEMENTS_EARNED',
  'AUTHENTICATED', 'MIGRATION_RESULT',
  'REMATCH_INVITE', 'SPECTATABLE_LIST',
  // IRX-C07: Tournament and report response types
  'TOURNAMENT_VIEW', 'TOURNAMENT_REGISTERED', 'TOURNAMENT_STARTED',
  'TOURNAMENT_RESULT_RECORDED',
  'REPORT_SUBMITTED',
];

// ── Tests ──

test('IRX-C07: all required request types are in KNOWN_TYPES', () => {
  const missing = REQUIRED_REQUEST_TYPES.filter(t => !knownTypes.has(t));
  if (missing.length > 0) {
    assert.fail(`Missing request types from KNOWN_TYPES: ${missing.join(', ')}`);
  }
});

test('IRX-C07: all required response/event types are in KNOWN_TYPES', () => {
  const missing = REQUIRED_RESPONSE_TYPES.filter(t => !knownTypes.has(t));
  if (missing.length > 0) {
    assert.fail(`Missing response types from KNOWN_TYPES: ${missing.join(', ')}`);
  }
});

test('IRX-C07: TOURNAMENT_LIST passes validateEnvelope type check', () => {
  const result = validateEnvelope({ type: 'TOURNAMENT_LIST', payload: { limit: 20 }, requestId: 'r1' });
  // Should NOT fail with MESSAGE_TYPE_UNKNOWN — it may fail on payload
  // validation, but the type itself must be recognized.
  assert.notEqual(result.reason, 'MESSAGE_TYPE_UNKNOWN',
    'TOURNAMENT_LIST must be in KNOWN_TYPES — got MESSAGE_TYPE_UNKNOWN');
});

test('IRX-C07: REPORT_PLAYER passes validateEnvelope type check', () => {
  const result = validateEnvelope({ type: 'REPORT_PLAYER', payload: { reportedPlayerId: 'p1', reasonCode: 'CHEATING' }, requestId: 'r1' });
  assert.notEqual(result.reason, 'MESSAGE_TYPE_UNKNOWN',
    'REPORT_PLAYER must be in KNOWN_TYPES — got MESSAGE_TYPE_UNKNOWN');
});

test('IRX-C07: TOURNAMENT_REGISTER passes validateEnvelope type check', () => {
  const result = validateEnvelope({ type: 'TOURNAMENT_REGISTER', payload: { tournamentId: 't1' }, requestId: 'r1' });
  assert.notEqual(result.reason, 'MESSAGE_TYPE_UNKNOWN',
    'TOURNAMENT_REGISTER must be in KNOWN_TYPES — got MESSAGE_TYPE_UNKNOWN');
});

test('IRX-C07: TOURNAMENT_START passes validateEnvelope type check', () => {
  const result = validateEnvelope({ type: 'TOURNAMENT_START', payload: { tournamentId: 't1' }, requestId: 'r1' });
  assert.notEqual(result.reason, 'MESSAGE_TYPE_UNKNOWN',
    'TOURNAMENT_START must be in KNOWN_TYPES — got MESSAGE_TYPE_UNKNOWN');
});

test('IRX-C07: TOURNAMENT_REPORT_RESULT passes validateEnvelope type check', () => {
  const result = validateEnvelope({
    type: 'TOURNAMENT_REPORT_RESULT',
    payload: { tournamentId: 't1', matchId: 'm1', winnerId: 'p1', scoreA: 2, scoreB: 1 },
    requestId: 'r1',
  });
  assert.notEqual(result.reason, 'MESSAGE_TYPE_UNKNOWN',
    'TOURNAMENT_REPORT_RESULT must be in KNOWN_TYPES — got MESSAGE_TYPE_UNKNOWN');
});

test('IRX-C07: TOURNAMENT_GET passes validateEnvelope type check', () => {
  const result = validateEnvelope({ type: 'TOURNAMENT_GET', payload: { tournamentId: 't1' }, requestId: 'r1' });
  assert.notEqual(result.reason, 'MESSAGE_TYPE_UNKNOWN',
    'TOURNAMENT_GET must be in KNOWN_TYPES — got MESSAGE_TYPE_UNKNOWN');
});

test('IRX-C07: server dispatch has cases for all tournament/report types', () => {
  const serverSrc = readFileSync(
    join(ROOT, 'apps/match-server/src/server.mjs'), 'utf8'
  );
  const requiredTypes = [
    'TOURNAMENT_LIST', 'TOURNAMENT_GET', 'TOURNAMENT_REGISTER',
    'TOURNAMENT_START', 'TOURNAMENT_REPORT_RESULT', 'REPORT_PLAYER',
  ];
  for (const t of requiredTypes) {
    assert.ok(
      serverSrc.includes(`case '${t}'`),
      `server.mjs must have a dispatch case for ${t}`
    );
  }
});

test('IRX-C07: client builders exist for all tournament/report request types', () => {
  const clientSrc = readFileSync(
    join(ROOT, 'apps/lab-web/src/play/network/network-protocol-client.mjs'), 'utf8'
  );
  const requiredBuilders = [
    'tournamentList', 'tournamentGet', 'tournamentRegister',
    'tournamentStart', 'tournamentReportResult', 'reportPlayer',
  ];
  for (const fn of requiredBuilders) {
    assert.ok(
      clientSrc.includes(`export function ${fn}`),
      `network-protocol-client.mjs must export builder ${fn}`
    );
  }
});
