// ═══════════════════════════════════════════════════════════════
// guest-migration-e2e.test.mjs — Guest→permanent migration end-to-end tests
//
// Proves:
//   - MIGRATE_GUEST with valid auth + achievements → MIGRATION_RESULT success
//   - Achievements are written to the target account
//   - Idempotency: re-running the same migration is a no-op
//   - MIGRATE_GUEST without auth → AUTH_REQUIRED error
//   - MIGRATE_GUEST with mismatched target identity → MIGRATION_IDENTITY_MISMATCH
//   - MIGRATE_GUEST with invalid payload → validation error
//   - MIGRATE_GUEST with empty achievements array → success with 0 transferred
//   - FakeMatchResultPersistor.executeGuestMigration stores migration record
//   - FakeMatchResultPersistor.isMigrationCompleted detects prior migration
//   - Conflict resolution: pre-existing achievements on target are not duplicated
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from 'node:net';

import { ReasonCode } from '../packages/network-protocol/src/reason-codes.mjs';
import { FakeIdentityVerifier } from '../apps/match-server/src/auth/fake-identity-verifier.mjs';
import { FakeMatchResultPersistor } from '../apps/match-server/src/persistence/fake-match-result-persistor.mjs';
import {
  authenticate,
  migrateGuest,
} from '../packages/network-protocol/src/protocol.mjs';
import { migrationId } from '../packages/account-domain/src/guest-migration.mjs';

// ── Helpers ──

async function findFreePort() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sendMsg(ws, obj) {
  ws.send(JSON.stringify(obj));
}

// ── Test identities ──

const TOKEN_GUEST = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJndWVzdCJ9.guest-sig-1234567890';
const TOKEN_PERMANENT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwZXJtInQ.permanent-sig-0987654321';
const TOKEN_OTHER = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvdGhlciJ9.other-sig-abcdef123456';
const ACCOUNT_GUEST = 'a1111111-1111-1111-1111-111111111111';
const ACCOUNT_PERMANENT = 'b2222222-2222-2222-2222-222222222222';
const ACCOUNT_OTHER = 'c3333333-3333-3333-3333-333333333333';

const IDENTITIES = {
  [TOKEN_GUEST]: {
    accountId: ACCOUNT_GUEST,
    isAnonymous: true,
    publicProfile: { publicPlayerId: 'PLY_guest', displayName: 'Guest', handle: null, avatarUrl: null },
  },
  [TOKEN_PERMANENT]: {
    accountId: ACCOUNT_PERMANENT,
    isAnonymous: false,
    publicProfile: { publicPlayerId: 'PLY_perm', displayName: 'Permanent', handle: 'perm', avatarUrl: null },
  },
  [TOKEN_OTHER]: {
    accountId: ACCOUNT_OTHER,
    isAnonymous: false,
    publicProfile: { publicPlayerId: 'PLY_other', displayName: 'Other', handle: 'other', avatarUrl: null },
  },
};

let server = null;
let testPort = 3399;
let verifier = null;
let persistor = null;

async function startTestServer() {
  testPort = await findFreePort();
  verifier = new FakeIdentityVerifier();
  for (const [token, id] of Object.entries(IDENTITIES)) {
    verifier.registerIdentity(token, id);
  }
  persistor = new FakeMatchResultPersistor();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  server = await startServer({
    port: testPort,
    host: '127.0.0.1',
    dbPath: ':memory:',
    persistent: false,
    rateLimitCapacity: 10000,
    authMode: 'required',
    identityVerifier: verifier,
    matchResultPersistor: persistor,
    allowFakePersistor: true,
  });
  return server;
}

async function stopTestServer() {
  if (server) {
    try { await server.close(); } catch { /* ignore */ }
    server = null;
  }
  if (verifier) { verifier.close(); verifier = null; }
  await new Promise(resolve => setTimeout(resolve, 200));
}

function connectWs() {
  return new WebSocket(`ws://127.0.0.1:${testPort}`);
}

async function authenticateConn(ws, token) {
  sendMsg(ws, authenticate(token));
  return waitForMessage(ws, 'AUTHENTICATED');
}

// ── Section 1: FakeMatchResultPersistor unit tests ──

test('migration: fake persistor executeGuestMigration writes achievements', async () => {
  const fp = new FakeMatchResultPersistor();
  const plan = {
    migrationId: migrationId(ACCOUNT_GUEST, ACCOUNT_PERMANENT),
    sourceIdentity: ACCOUNT_GUEST,
    targetIdentity: ACCOUNT_PERMANENT,
    migrationVersion: 1,
  };
  const achievements = [
    { achievementId: 'first-duel', unlockedAt: '2026-01-01T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'first-victory', unlockedAt: '2026-01-02T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'streak-3', unlockedAt: '2026-01-03T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
  ];

  const result = await fp.executeGuestMigration(plan, achievements);
  assert.ok(result.success, 'migration should succeed');
  assert.equal(result.achievementsTransferred, 3);
  assert.equal(result.alreadyMigrated, false);
  assert.equal(fp.migrationCount, 1);
  assert.ok(fp.hasAchievement(ACCOUNT_PERMANENT, 'first-duel'));
  assert.ok(fp.hasAchievement(ACCOUNT_PERMANENT, 'first-victory'));
  assert.ok(fp.hasAchievement(ACCOUNT_PERMANENT, 'streak-3'));
});

test('migration: fake persistor idempotent — re-running is a no-op', async () => {
  const fp = new FakeMatchResultPersistor();
  const plan = {
    migrationId: migrationId(ACCOUNT_GUEST, ACCOUNT_PERMANENT),
    sourceIdentity: ACCOUNT_GUEST,
    targetIdentity: ACCOUNT_PERMANENT,
    migrationVersion: 1,
  };
  const achievements = [
    { achievementId: 'first-duel', unlockedAt: '2026-01-01T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
  ];

  const r1 = await fp.executeGuestMigration(plan, achievements);
  assert.ok(r1.success);
  assert.equal(r1.achievementsTransferred, 1);
  assert.equal(r1.alreadyMigrated, false);

  const r2 = await fp.executeGuestMigration(plan, achievements);
  assert.ok(r2.success);
  assert.equal(r2.achievementsTransferred, 0);
  assert.equal(r2.alreadyMigrated, true);
  assert.equal(fp.migrationCount, 1, 'should still have 1 migration record');
  assert.equal(fp.achievementCount, 1, 'should still have 1 achievement');
});

test('migration: fake persistor isMigrationCompleted detects prior migration', async () => {
  const fp = new FakeMatchResultPersistor();
  const mid = migrationId(ACCOUNT_GUEST, ACCOUNT_PERMANENT);
  assert.equal(await fp.isMigrationCompleted(mid), false);

  await fp.executeGuestMigration({
    migrationId: mid,
    sourceIdentity: ACCOUNT_GUEST,
    targetIdentity: ACCOUNT_PERMANENT,
    migrationVersion: 1,
  }, []);

  assert.equal(await fp.isMigrationCompleted(mid), true);
});

test('migration: fake persistor conflict resolution — pre-existing achievements not duplicated', async () => {
  const fp = new FakeMatchResultPersistor();
  // Pre-seed an achievement on the target account (e.g. from a network match)
  await fp.persistAchievementUnlocks([{
    accountId: ACCOUNT_PERMANENT,
    achievementId: 'first-duel',
    unlockedAt: '2026-01-15T00:00:00.000Z',
    provenance: 'SERVER',
  }]);
  assert.ok(fp.hasAchievement(ACCOUNT_PERMANENT, 'first-duel'));

  const plan = {
    migrationId: migrationId(ACCOUNT_GUEST, ACCOUNT_PERMANENT),
    sourceIdentity: ACCOUNT_GUEST,
    targetIdentity: ACCOUNT_PERMANENT,
    migrationVersion: 1,
  };
  const achievements = [
    { achievementId: 'first-duel', unlockedAt: '2026-01-01T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'first-victory', unlockedAt: '2026-01-02T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
  ];

  const result = await fp.executeGuestMigration(plan, achievements);
  assert.ok(result.success);
  // first-duel already exists → only first-victory is new
  assert.equal(result.achievementsTransferred, 1);
  assert.equal(fp.achievementCount, 2);
});

test('migration: fake persistor empty achievements → success with 0 transferred', async () => {
  const fp = new FakeMatchResultPersistor();
  const plan = {
    migrationId: migrationId(ACCOUNT_GUEST, ACCOUNT_PERMANENT),
    sourceIdentity: ACCOUNT_GUEST,
    targetIdentity: ACCOUNT_PERMANENT,
    migrationVersion: 1,
  };

  const result = await fp.executeGuestMigration(plan, []);
  assert.ok(result.success);
  assert.equal(result.achievementsTransferred, 0);
  assert.equal(fp.migrationCount, 1);
});

// ── Section 2: Server integration tests ──

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test('migration: MIGRATE_GUEST with valid auth + achievements → MIGRATION_RESULT success', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Authenticate as the permanent account
  await authenticateConn(ws, TOKEN_PERMANENT);

  // Send MIGRATE_GUEST
  const achievements = [
    { achievementId: 'first-duel', unlockedAt: '2026-01-01T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'first-victory', unlockedAt: '2026-01-02T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'streak-3', unlockedAt: '2026-01-03T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'field-tested', unlockedAt: '2026-01-04T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
    { achievementId: 'duelist', unlockedAt: '2026-01-05T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
  ];
  sendMsg(ws, migrateGuest(ACCOUNT_GUEST, ACCOUNT_PERMANENT, achievements));

  const result = await waitForMessage(ws, 'MIGRATION_RESULT');
  assert.ok(result.payload.success, 'migration should succeed');
  assert.equal(result.payload.achievementsTransferred, 5);
  assert.equal(result.payload.alreadyMigrated, false);
  assert.equal(result.payload.migrationId, migrationId(ACCOUNT_GUEST, ACCOUNT_PERMANENT));

  ws.close();
});

test('migration: idempotent — re-running MIGRATE_GUEST is a no-op', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await authenticateConn(ws, TOKEN_PERMANENT);

  // Same migration as the previous test — should be already migrated
  const achievements = [
    { achievementId: 'first-duel', unlockedAt: '2026-01-01T00:00:00.000Z', provenance: 'LOCAL_DEVICE' },
  ];
  sendMsg(ws, migrateGuest(ACCOUNT_GUEST, ACCOUNT_PERMANENT, achievements));

  const result = await waitForMessage(ws, 'MIGRATION_RESULT');
  assert.ok(result.payload.success);
  assert.equal(result.payload.alreadyMigrated, true);
  assert.equal(result.payload.achievementsTransferred, 0);

  ws.close();
});

test('migration: MIGRATE_GUEST without auth → AUTH_REQUIRED error', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Don't authenticate — send MIGRATE_GUEST directly
  sendMsg(ws, migrateGuest(ACCOUNT_GUEST, ACCOUNT_PERMANENT, []));

  const result = await waitForMessage(ws, 'ERROR');
  assert.equal(result.payload.code, ReasonCode.AUTH_REQUIRED);

  ws.close();
});

test('migration: MIGRATE_GUEST with mismatched target → MIGRATION_IDENTITY_MISMATCH', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Authenticate as ACCOUNT_PERMANENT
  await authenticateConn(ws, TOKEN_PERMANENT);

  // Try to migrate to ACCOUNT_OTHER (mismatch)
  sendMsg(ws, migrateGuest(ACCOUNT_GUEST, ACCOUNT_OTHER, []));

  const result = await waitForMessage(ws, 'ERROR');
  assert.equal(result.payload.code, ReasonCode.MIGRATION_IDENTITY_MISMATCH);

  ws.close();
});

test('migration: MIGRATE_GUEST with invalid payload → validation error', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await authenticateConn(ws, TOKEN_PERMANENT);

  // Send MIGRATE_GUEST with missing sourceIdentity
  ws.send(JSON.stringify({
    protocolVersion: 2,
    type: 'MIGRATE_GUEST',
    requestId: 'req-test-invalid',
    payload: { sourceIdentity: 'not-a-uuid', targetIdentity: ACCOUNT_PERMANENT, achievements: [] },
  }));

  const result = await waitForMessage(ws, 'ERROR');
  assert.equal(result.payload.code, ReasonCode.MISSING_REQUIRED_FIELD);

  ws.close();
});

test('migration: MIGRATE_GUEST with empty achievements → success with 0 transferred', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await authenticateConn(ws, TOKEN_OTHER);

  // Use a different source/target pair so it's a fresh migration
  const achievements = [];
  sendMsg(ws, migrateGuest(ACCOUNT_GUEST, ACCOUNT_OTHER, achievements));

  const result = await waitForMessage(ws, 'MIGRATION_RESULT');
  assert.ok(result.payload.success);
  assert.equal(result.payload.achievementsTransferred, 0);
  assert.equal(result.payload.alreadyMigrated, false);

  ws.close();
});

test('migration: MIGRATE_GUEST with same source and target → MIGRATION_PLAN_INVALID', async () => {
  const ws = connectWs();
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await authenticateConn(ws, TOKEN_PERMANENT);

  // Same source and target — should fail validation
  ws.send(JSON.stringify({
    protocolVersion: 2,
    type: 'MIGRATE_GUEST',
    requestId: 'req-test-same',
    payload: { sourceIdentity: ACCOUNT_PERMANENT, targetIdentity: ACCOUNT_PERMANENT, achievements: [] },
  }));

  const result = await waitForMessage(ws, 'ERROR');
  assert.equal(result.payload.code, ReasonCode.MIGRATION_PLAN_INVALID);

  ws.close();
});
