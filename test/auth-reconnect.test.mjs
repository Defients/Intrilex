// ═══════════════════════════════════════════════════════════════
// auth-reconnect.test.mjs — Account-bound reconnect security
//
// Proves:
//   - Reconnect with matching accountId succeeds
//   - Reconnect with mismatched accountId returns AUTH_ACCOUNT_MISMATCH
//   - A stolen participant token cannot be reused by a different account
//   - Self-join prevention: same account cannot join its own match
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

async function startAuthServer(identities = {}) {
  testPort = await findFreePort();
  verifier = new FakeIdentityVerifier();
  for (const [token, id] of Object.entries(identities)) {
    verifier.registerIdentity(token, id);
  }
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  server = await startServer({
    port: testPort, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    rateLimitCapacity: 10000, authMode: 'required', identityVerifier: verifier,
    // DATA-04: Allow FakeMatchResultPersistor in auth tests (testing only)
    allowFakePersistor: true,
  });
  return server;
}

async function stopTestServer() {
  if (server) { try { await server.close(); } catch (e) { /* ignore close errors */ } server = null; }
  if (verifier) { verifier.close(); verifier = null; }
  await new Promise(r => setTimeout(r, 200));
}

function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) { clearTimeout(timer); resolve(msg); }
    });
  });
}

function sendMsg(ws, obj) { ws.send(JSON.stringify(obj)); }

function connectWs() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    ws.on('open', () => resolve(ws));
  });
}

async function authenticateConn(ws, token) {
  sendMsg(ws, { protocolVersion: 2, type: 'AUTHENTICATE', requestId: 'auth', payload: { accessToken: token } });
  await waitForMessage(ws, 'AUTHENTICATED');
}

const TOKEN_ALICE = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.reconnect-alice-sig-1234';
const TOKEN_BOB = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJib2IifQ.reconnect-bob-sig-0987';
const TOKEN_CAROL = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYXJvbCJ9.reconnect-carol-sig-abc';
const ACCOUNT_ALICE = 'a1111111-1111-1111-1111-111111111111';
const ACCOUNT_BOB = 'b2222222-2222-2222-2222-222222222222';
const ACCOUNT_CAROL = 'c3333333-3333-3333-3333-333333333333';

const IDENTITIES = {
  [TOKEN_ALICE]: { accountId: ACCOUNT_ALICE, isAnonymous: false, publicProfile: { publicPlayerId: 'PLY_alice', displayName: 'Alice', handle: 'alice', avatarUrl: null } },
  [TOKEN_BOB]: { accountId: ACCOUNT_BOB, isAnonymous: false, publicProfile: { publicPlayerId: 'PLY_bob', displayName: 'Bob', handle: 'bob', avatarUrl: null } },
  [TOKEN_CAROL]: { accountId: ACCOUNT_CAROL, isAnonymous: false, publicProfile: { publicPlayerId: 'PLY_carol', displayName: 'Carol', handle: 'carol', avatarUrl: null } },
};

// ── Tests ──

test('reconnect: matching accountId reconnects successfully', async () => {
  await startAuthServer(IDENTITIES);
  try {
    // Alice creates a match
    const ws1 = await connectWs();
    await authenticateConn(ws1, TOKEN_ALICE);
    sendMsg(ws1, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const matchId = created.payload.matchId;
    const aliceToken = created.payload.participantToken;

    // Alice disconnects
    ws1.close();
    await new Promise(r => setTimeout(r, 200));

    // Alice reconnects with the same account
    const ws2 = await connectWs();
    await authenticateConn(ws2, TOKEN_ALICE);
    sendMsg(ws2, { protocolVersion: 2, type: 'RESUME_MATCH', requestId: 'r2', payload: { matchId, participantToken: aliceToken } });
    const view = await waitForMessage(ws2, 'MATCH_VIEW');
    assert.equal(view.payload.matchId, matchId);
    ws2.close();
  } finally { await stopTestServer(); }
});

test('reconnect: mismatched accountId returns AUTH_ACCOUNT_MISMATCH', async () => {
  await startAuthServer(IDENTITIES);
  try {
    // Alice creates a match
    const ws1 = await connectWs();
    await authenticateConn(ws1, TOKEN_ALICE);
    sendMsg(ws1, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const matchId = created.payload.matchId;
    const aliceToken = created.payload.participantToken;
    ws1.close();
    await new Promise(r => setTimeout(r, 200));

    // Carol tries to reconnect with Alice's participant token
    const ws2 = await connectWs();
    await authenticateConn(ws2, TOKEN_CAROL);
    sendMsg(ws2, { protocolVersion: 2, type: 'RESUME_MATCH', requestId: 'r2', payload: { matchId, participantToken: aliceToken } });
    const msg = await waitForMessage(ws2, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_ACCOUNT_MISMATCH);
    ws2.close();
  } finally { await stopTestServer(); }
});

test('reconnect: stolen token cannot be reused by different account', async () => {
  await startAuthServer(IDENTITIES);
  try {
    // Alice creates a match and gets a participant token
    const ws1 = await connectWs();
    await authenticateConn(ws1, TOKEN_ALICE);
    sendMsg(ws1, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const matchId = created.payload.matchId;
    const stolenToken = created.payload.participantToken;

    // Bob (different account) tries to resume with the stolen token
    const ws2 = await connectWs();
    await authenticateConn(ws2, TOKEN_BOB);
    sendMsg(ws2, { protocolVersion: 2, type: 'RESUME_MATCH', requestId: 'r2', payload: { matchId, participantToken: stolenToken } });
    const msg = await waitForMessage(ws2, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_ACCOUNT_MISMATCH);
    ws2.close();
    ws1.close();
  } finally { await stopTestServer(); }
});

test('self-match: same account cannot join its own private duel', async () => {
  await startAuthServer(IDENTITIES);
  try {
    // Alice creates a match
    const ws1 = await connectWs();
    await authenticateConn(ws1, TOKEN_ALICE);
    sendMsg(ws1, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const inviteCode = created.payload.inviteCode;

    // Alice opens a second connection (same account) and tries to join
    const ws2 = await connectWs();
    await authenticateConn(ws2, TOKEN_ALICE);
    sendMsg(ws2, { protocolVersion: 2, type: 'JOIN_MATCH', requestId: 'r2', payload: { inviteCode } });
    const msg = await waitForMessage(ws2, 'ERROR');
    assert.equal(msg.payload.code, ReasonCode.AUTH_ACCOUNT_MISMATCH);
    ws2.close();
    ws1.close();
  } finally { await stopTestServer(); }
});

test('self-match: different accounts can join private duel', async () => {
  await startAuthServer(IDENTITIES);
  try {
    // Alice creates a match
    const ws1 = await connectWs();
    await authenticateConn(ws1, TOKEN_ALICE);
    sendMsg(ws1, { protocolVersion: 2, type: 'CREATE_MATCH', requestId: 'r1', payload: { profileId: 'core-unrestricted-authority' } });
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const inviteCode = created.payload.inviteCode;

    // Bob (different account) joins
    const ws2 = await connectWs();
    await authenticateConn(ws2, TOKEN_BOB);
    sendMsg(ws2, { protocolVersion: 2, type: 'JOIN_MATCH', requestId: 'r2', payload: { inviteCode } });
    const msg = await waitForMessage(ws2, 'MATCH_JOINED');
    assert.ok(msg.payload.participantToken);
    assert.ok(msg.payload.seat);
    ws2.close();
    ws1.close();
  } finally { await stopTestServer(); }
});
