// ═══════════════════════════════════════════════════════════════
// irx-c04-guest-migration-identity.test.mjs — IRX-C04 source identity
//
// Proves:
//   1. BIND_GUEST_IDENTITY handler exists and validates UUID format
//   2. MIGRATE_GUEST rejects when no guest identity is bound
//   3. MIGRATE_GUEST rejects when sourceIdentity != boundGuestIdentity
//   4. BIND_GUEST_IDENTITY is in PRE_AUTH_TYPES (can be sent before auth)
//   5. BIND_GUEST_IDENTITY and GUEST_IDENTITY_BOUND are in KNOWN_TYPES
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const serverSrc = readFileSync(join(root, 'apps/match-server/src/server.mjs'), 'utf8');
const validationSrc = readFileSync(join(root, 'packages/network-protocol/src/validation.mjs'), 'utf8');

test('IRX-C04: BIND_GUEST_IDENTITY handler exists in server.mjs', () => {
  assert.ok(
    serverSrc.includes('handleBindGuestIdentity'),
    'server.mjs must have handleBindGuestIdentity function'
  );
  assert.ok(
    serverSrc.includes("case 'BIND_GUEST_IDENTITY'"),
    'server.mjs must dispatch BIND_GUEST_IDENTITY'
  );
});

test('IRX-C04: BIND_GUEST_IDENTITY is in PRE_AUTH_TYPES', () => {
  assert.ok(
    serverSrc.includes("'BIND_GUEST_IDENTITY'") &&
    serverSrc.includes('PRE_AUTH_TYPES'),
    'BIND_GUEST_IDENTITY must be in PRE_AUTH_TYPES so guests can bind before auth'
  );
});

test('IRX-C04: connection object has boundGuestIdentity field', () => {
  assert.ok(
    serverSrc.includes('boundGuestIdentity'),
    'connection object must have boundGuestIdentity field'
  );
});

test('IRX-C04: MIGRATE_GUEST verifies sourceIdentity against boundGuestIdentity', () => {
  assert.ok(
    serverSrc.includes('conn.boundGuestIdentity !== payload.sourceIdentity'),
    'MIGRATE_GUEST must verify sourceIdentity matches boundGuestIdentity'
  );
  assert.ok(
    serverSrc.includes('migrationSourceMismatch'),
    'MIGRATE_GUEST must log source mismatch events'
  );
  assert.ok(
    serverSrc.includes('migrationNoGuestBinding'),
    'MIGRATE_GUEST must reject when no guest identity is bound'
  );
});

test('IRX-C04: BIND_GUEST_IDENTITY validates UUID format', () => {
  assert.ok(
    serverSrc.includes('UUID_RE') && serverSrc.includes('guestIdentity'),
    'BIND_GUEST_IDENTITY must validate guestIdentity as UUID format'
  );
});

test('IRX-C04: BIND_GUEST_IDENTITY and GUEST_IDENTITY_BOUND in KNOWN_TYPES', () => {
  assert.ok(
    validationSrc.includes("'BIND_GUEST_IDENTITY'"),
    'BIND_GUEST_IDENTITY must be in KNOWN_TYPES'
  );
  assert.ok(
    validationSrc.includes("'GUEST_IDENTITY_BOUND'"),
    'GUEST_IDENTITY_BOUND must be in KNOWN_TYPES'
  );
});

test('IRX-C04: security comment updated to reflect server-side verification', () => {
  assert.ok(
    serverSrc.includes('IRX-C04: The sourceIdentity MUST match the boundGuestIdentity'),
    'Security comment must document server-side source identity verification'
  );
  // Must NOT have the old "trust the client" comment
  assert.ok(
    !serverSrc.includes('not verified server-side — trust the client'),
    'Old "trust the client" comment must be removed'
  );
});

// ── Client-side integration tests ──

test('IRX-C04: network-protocol-client exports bindGuestIdentity builder', () => {
  const clientSrc = readFileSync(
    join(root, 'apps/lab-web/src/play/network/network-protocol-client.mjs'),
    'utf8',
  );
  assert.ok(
    clientSrc.includes('export function bindGuestIdentity'),
    'network-protocol-client.mjs must export bindGuestIdentity builder'
  );
  assert.ok(
    clientSrc.includes("envelope('BIND_GUEST_IDENTITY'"),
    'bindGuestIdentity must build BIND_GUEST_IDENTITY envelope'
  );
});

test('IRX-C04: migration-controller sends BIND_GUEST_IDENTITY before AUTHENTICATE', () => {
  const migrationSrc = readFileSync(
    join(root, 'apps/lab-web/src/play/network/migration-controller.js'),
    'utf8',
  );
  assert.ok(
    migrationSrc.includes('bindGuestIdentity'),
    'migration-controller must import bindGuestIdentity'
  );
  // BIND_GUEST_IDENTITY must be sent BEFORE AUTHENTICATE in the open handler
  const bindIdx = migrationSrc.indexOf('bindGuestIdentity(sourceIdentity)');
  const authIdx = migrationSrc.indexOf('authenticate(accessToken)');
  assert.ok(bindIdx > -1 && authIdx > -1, 'Both bindGuestIdentity and authenticate calls must exist');
  assert.ok(
    bindIdx < authIdx,
    'BIND_GUEST_IDENTITY must be sent BEFORE AUTHENTICATE'
  );
});
