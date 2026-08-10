// ═══════════════════════════════════════════════════════════════
// auth-protocol.test.mjs — Protocol v2 auth message validation
//
// Proves:
//   - PROTOCOL_VERSION is 2
//   - authenticate() builds valid AUTHENTICATE envelope
//   - authRefresh() builds valid AUTH_REFRESH envelope
//   - authenticated() builds valid AUTHENTICATED envelope
//   - validateAuthenticate accepts valid JWT-format tokens
//   - validateAuthenticate rejects missing/empty/non-JWT tokens
//   - validateAuthRefresh mirrors AUTHENTICATE validation
//   - AUTHENTICATE/AUTH_REFRESH/AUTHENTICATED are in the valid type set
//   - Auth reason codes are defined
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROTOCOL_VERSION, validateEnvelope, validateAuthenticate, validateAuthRefresh,
  authenticate, authRefresh, authenticated,
} from '../packages/network-protocol/src/protocol.mjs';
import { ReasonCode } from '../packages/network-protocol/src/reason-codes.mjs';

const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature123';

test('protocol: PROTOCOL_VERSION is 2', () => {
  assert.equal(PROTOCOL_VERSION, 2);
});

test('protocol: authenticate() builds valid AUTHENTICATE envelope', () => {
  const msg = authenticate(FAKE_JWT, 'req-1');
  assert.equal(msg.type, 'AUTHENTICATE');
  assert.equal(msg.protocolVersion, 2);
  assert.equal(msg.payload.accessToken, FAKE_JWT);
  assert.equal(msg.requestId, 'req-1');
  assert.ok(validateEnvelope(msg).valid, 'AUTHENTICATE envelope must pass validation');
});

test('protocol: authRefresh() builds valid AUTH_REFRESH envelope', () => {
  const msg = authRefresh(FAKE_JWT, 'req-2');
  assert.equal(msg.type, 'AUTH_REFRESH');
  assert.equal(msg.protocolVersion, 2);
  assert.equal(msg.payload.accessToken, FAKE_JWT);
  assert.equal(msg.requestId, 'req-2');
  assert.ok(validateEnvelope(msg).valid, 'AUTH_REFRESH envelope must pass validation');
});

test('protocol: authenticated() builds valid AUTHENTICATED envelope', () => {
  const account = {
    publicPlayerId: 'PLY_test',
    displayName: 'Test',
    handle: null,
    avatarUrl: null,
    isAnonymous: false,
    capabilities: { onlineCasual: true, ranked: false },
  };
  const msg = authenticated(account, Date.now() + 3600000, 'req-3');
  assert.equal(msg.type, 'AUTHENTICATED');
  assert.equal(msg.protocolVersion, 2);
  assert.equal(msg.payload.account.publicPlayerId, 'PLY_test');
  assert.ok(msg.payload.expiresAt > Date.now());
  assert.ok(validateEnvelope(msg).valid, 'AUTHENTICATED envelope must pass validation');
});

test('protocol: validateAuthenticate accepts valid JWT-format token', () => {
  const result = validateAuthenticate({ accessToken: FAKE_JWT });
  assert.ok(result.valid, 'valid JWT must pass');
});

test('protocol: validateAuthenticate rejects missing token', () => {
  assert.ok(!validateAuthenticate({}).valid);
  assert.ok(!validateAuthenticate({ accessToken: '' }).valid);
  assert.ok(!validateAuthenticate({ accessToken: null }).valid);
});

test('protocol: validateAuthenticate rejects non-JWT token', () => {
  assert.ok(!validateAuthenticate({ accessToken: 'not-a-jwt' }).valid);
  assert.ok(!validateAuthenticate({ accessToken: 'two.parts' }).valid);
  assert.ok(!validateAuthenticate({ accessToken: 'four.parts.here.wow' }).valid);
});

test('protocol: validateAuthRefresh mirrors AUTHENTICATE validation', () => {
  assert.ok(validateAuthRefresh({ accessToken: FAKE_JWT }).valid);
  assert.ok(!validateAuthRefresh({}).valid);
  assert.ok(!validateAuthRefresh({ accessToken: 'not-a-jwt' }).valid);
});

test('protocol: AUTHENTICATE/AUTH_REFRESH/AUTHENTICATED are valid message types', () => {
  assert.ok(validateEnvelope({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: FAKE_JWT } }).valid);
  assert.ok(validateEnvelope({ protocolVersion: 2, type: 'AUTH_REFRESH', payload: { accessToken: FAKE_JWT } }).valid);
  assert.ok(validateEnvelope({ protocolVersion: 2, type: 'AUTHENTICATED', payload: { account: {}, expiresAt: 123 } }).valid);
});

test('protocol: auth reason codes are defined', () => {
  assert.equal(typeof ReasonCode.AUTH_REQUIRED, 'string');
  assert.equal(typeof ReasonCode.AUTH_TOKEN_MISSING, 'string');
  assert.equal(typeof ReasonCode.AUTH_TOKEN_INVALID, 'string');
  assert.equal(typeof ReasonCode.AUTH_TOKEN_EXPIRED, 'string');
  assert.equal(typeof ReasonCode.AUTH_ACCOUNT_MISMATCH, 'string');
  assert.equal(typeof ReasonCode.AUTH_ACCOUNT_SUSPENDED, 'string');
  assert.equal(typeof ReasonCode.AUTH_ACCOUNT_BANNED, 'string');
  assert.equal(typeof ReasonCode.AUTH_PERMANENT_ACCOUNT_REQUIRED, 'string');
  assert.equal(typeof ReasonCode.AUTH_PROVIDER_ERROR, 'string');
  assert.equal(typeof ReasonCode.AUTH_CONFIG_UNAVAILABLE, 'string');
});

test('protocol: AUTHENTICATED envelope never contains accessToken field', () => {
  const account = { publicPlayerId: 'PLY_test', displayName: 'T', handle: null, avatarUrl: null, isAnonymous: false, capabilities: {} };
  const msg = authenticated(account, Date.now() + 3600, 'req-1');
  assert.ok(!('accessToken' in msg.payload), 'AUTHENTICATED must not have accessToken field');
  assert.ok(!('token' in msg.payload), 'AUTHENTICATED must not have token field');
});
