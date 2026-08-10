// ═══════════════════════════════════════════════════════════════
// auth-server.test.mjs — Account auth handshake + message gate tests
//
// Proves:
//   - AUTHENTICATE with valid token → AUTHENTICATED response
//   - AUTHENTICATE with invalid token → AUTH_TOKEN_INVALID error
//   - AUTHENTICATE with missing token → AUTH_TOKEN_MISSING error
//   - Pre-auth privileged commands → AUTH_REQUIRED error
//   - Post-auth CREATE_MATCH succeeds
//   - AUTH_REFRESH with matching account updates expiry
//   - AUTH_REFRESH with different account → disconnect
//   - Auth-disabled mode: AUTHENTICATE is a no-op (dev mode)
//   - Banned account → AUTH_ACCOUNT_BANNED
//   - Suspended account → AUTH_ACCOUNT_SUSPENDED
//   - AUTHENTICATED response never echoes the access token
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from 'node:net';

import { ReasonCode } from '../packages/network-protocol/src/reason-codes.mjs';
import { FakeIdentityVerifier } from '../apps/match-server/src/auth/fake-identity-verifier.mjs';

async function findFreePort() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

let server = null;
let testPort = 3399;
let verifier = null;

async function startAuthServer(opts = {}) {
  testPort = await findFreePort();
  verifier = new FakeIdentityVerifier();
  // Register test identities
  if (opts.identities) {
    for (const [token, id] of Object.entries(opts.identities)) {
      verifier.registerIdentity(token, id);
    }
  }
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  server = await startServer({
    port: testPort,
    host: '127.0.0.1',
    dbPath: ':memory:',
    persistent: false,
    rateLimitCapacity: 10000,
    authMode: opts.authMode ?? 'required',
    identityVerifier: opts.authMode === 'disabled' ? undefined : verifier,
  });
  return server;
}

async function stopTestServer() {
  if (server) {
    try { await server.close(); } catch (e) { /* ignore close errors */ }
    server = null;
  }
  if (verifier) { verifier.close(); verifier = null; }
  await new Promise(resolve => setTimeout(resolve, 200));
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
  });
}

function sendMsg(ws, obj) {
  ws.send(JSON.stringify(obj));
}

const TOKEN_ALICE = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.alice-sig-1234567890';
const TOKEN_BOB = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJib2IifQ.bob-sig-0987654321';
const TOKEN_INVALID = 'invalid.jwt.token';
const ACCOUNT_ALICE = 'a1111111-1111-1111-1111-111111111111';
const ACCOUNT_BOB = 'b2222222-2222-2222-2222-222222222222';

const IDENTITIES = {
  [TOKEN_ALICE]: { accountId: ACCOUNT_ALICE, isAnonymous: false, publicProfile: { publicPlayerId: 'PLY_alice', displayName: 'Alice', handle: 'alice', avatarUrl: null } },
  [TOKEN_BOB]: { accountId: ACCOUNT_BOB, isAnonymous: false, publicProfile: { publicPlayerId: 'PLY_bob', displayName: 'Bob', handle: 'bob', avatarUrl: null } },
};

// ── Tests ──

test('auth: AUTHENTICATE with valid token returns AUTHENTICATED', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_ALICE } });
    const msg = await waitForMessage(ws, 'AUTHENTICATED');
    assert.equal(msg.requestId, 'auth-1');
    assert.ok(msg.payload.account, 'AUTHENTICATED must include account');
    assert.equal(msg.payload.account.publicPlayerId, 'PLY_alice');
    assert.equal(msg.payload.account.displayName, 'Alice');
    assert.equal(msg.payload.account.isAnonymous, false);
    assert.ok(msg.payload.expiresAt, 'AUTHENTICATED must include expiresAt');
    // CRITICAL: access token must NEVER be echoed
    const json = JSON.stringify(msg);
    assert.ok(!json.includes(TOKEN_ALICE), 'AUTHENTICATED must not echo access token');
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: AUTHENTICATE with invalid token returns AUTH_TOKEN_INVALID', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-2', payload: { accessToken: TOKEN_INVALID } });
    const msg = await waitForMessage(ws, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_TOKEN_INVALID);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: AUTHENTICATE with missing token returns AUTH_TOKEN_MISSING', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-3', payload: {} });
    const msg = await waitForMessage(ws, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_TOKEN_MISSING);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: pre-auth CREATE_MATCH returns AUTH_REQUIRED', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const msg = await waitForMessage(ws, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_REQUIRED);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: post-auth CREATE_MATCH succeeds', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    // Authenticate first
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_ALICE } });
    await waitForMessage(ws, 'AUTHENTICATED');
    // Now create match
    sendMsg(ws, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const msg = await waitForMessage(ws, 'MATCH_CREATED');
    assert.ok(msg.payload.matchId, 'MATCH_CREATED must include matchId');
    assert.ok(msg.payload.inviteCode, 'MATCH_CREATED must include inviteCode');
    assert.ok(msg.payload.participantToken, 'MATCH_CREATED must include participantToken');
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: AUTH_REFRESH with matching account updates expiry', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_ALICE } });
    const auth1 = await waitForMessage(ws, 'AUTHENTICATED');
    // Refresh with same account token
    sendMsg(ws, { protocolVersion: 2, type: 'AUTH_REFRESH', requestId: 'auth-2', payload: { accessToken: TOKEN_ALICE } });
    const auth2 = await waitForMessage(ws, 'AUTHENTICATED');
    assert.equal(auth2.payload.account.publicPlayerId, 'PLY_alice');
    // Expiry should be >= first auth (fresh token)
    assert.ok(auth2.payload.expiresAt >= auth1.payload.expiresAt, 'refresh expiry must be fresh');
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: AUTH_REFRESH with different account disconnects', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_ALICE } });
    await waitForMessage(ws, 'AUTHENTICATED');
    // Refresh with Bob's token — different account
    sendMsg(ws, { protocolVersion: 2, type: 'AUTH_REFRESH', requestId: 'auth-2', payload: { accessToken: TOKEN_BOB } });
    const msg = await waitForMessage(ws, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_ACCOUNT_MISMATCH);
    // Connection should be terminated
    await new Promise(r => ws.on('close', r));
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: auth-disabled mode AUTHENTICATE is a no-op', async () => {
  await startAuthServer({ authMode: 'disabled' });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    // In disabled mode, no auth needed — CREATE_MATCH works directly
    sendMsg(ws, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const msg = await waitForMessage(ws, 'MATCH_CREATED');
    assert.ok(msg.payload.matchId);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: banned account returns AUTH_ACCOUNT_BANNED', async () => {
  const TOKEN_BANNED = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJiYW5uZWQifQ.banned-sig-1234567890';
  await startAuthServer({
    identities: {
      [TOKEN_BANNED]: { accountId: 'c3333333-3333-3333-3333-333333333333', isAnonymous: false, accountStatus: 'BANNED' },
    },
  });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_BANNED } });
    const msg = await waitForMessage(ws, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_ACCOUNT_BANNED);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: suspended account returns AUTH_ACCOUNT_SUSPENDED', async () => {
  const TOKEN_SUSPENDED = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdXNwZW5kZWQifQ.suspended-sig-1234567890';
  await startAuthServer({
    identities: {
      [TOKEN_SUSPENDED]: { accountId: 'd4444444-4444-4444-4444-444444444444', isAnonymous: false, accountStatus: 'SUSPENDED' },
    },
  });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_SUSPENDED } });
    const msg = await waitForMessage(ws, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_ACCOUNT_SUSPENDED);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: AUTHENTICATED response never contains access token (privacy)', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    const SECRET_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.secret-sig-1234567890';
    verifier.registerIdentity(SECRET_TOKEN, { accountId: 'e5555555-5555-5555-5555-555555555555', isAnonymous: false });
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: SECRET_TOKEN } });
    const msg = await waitForMessage(ws, 'AUTHENTICATED');
    const json = JSON.stringify(msg);
    assert.ok(!json.includes(SECRET_TOKEN), 'AUTHENTICATED must never contain the access token');
    assert.ok(!json.includes('accessToken'), 'AUTHENTICATED must not have accessToken field');
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: anonymous account can create private duels but not ranked', async () => {
  const TOKEN_ANON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbm9uIn0.anon-sig-1234567890';
  await startAuthServer({
    identities: {
      [TOKEN_ANON]: { accountId: 'f6666666-6666-6666-6666-666666666666', isAnonymous: true, publicProfile: { publicPlayerId: 'PLY_anon', displayName: 'Guest', handle: null, avatarUrl: null } },
    },
  });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth-1', payload: { accessToken: TOKEN_ANON } });
    const msg = await waitForMessage(ws, 'AUTHENTICATED');
    assert.equal(msg.payload.account.isAnonymous, true);
    // Anonymous capabilities: onlineCasual=true, ranked=false
    assert.ok(msg.payload.account.capabilities.onlineCasual);
    assert.ok(!msg.payload.account.capabilities.ranked);
    // Can create private duels
    sendMsg(ws, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    assert.ok(created.payload.matchId);
    ws.close();
  } finally { await stopTestServer(); }
});

test('auth: health endpoint reports auth mode and verifier status', async () => {
  await startAuthServer({ identities: IDENTITIES });
  try {
    const resp = await fetch(`http://127.0.0.1:${testPort}/health`);
    const health = await resp.json();
    assert.ok(health.auth, 'health must include auth section');
    assert.equal(health.auth.mode, 'required');
    assert.equal(health.auth.verifierConfigured, true);
  } finally { await stopTestServer(); }
});
