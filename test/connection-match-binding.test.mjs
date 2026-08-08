// ═══════════════════════════════════════════════════════════════
// connection-match-binding.test.mjs — v0.24.2 Truth Closure II
//
// Proves defense-in-depth match binding:
//   - READY with mismatched matchId is rejected
//   - SUBMIT_ACTION with mismatched matchId is rejected
//   - REQUEST_SYNC with mismatched matchId is rejected
//   - LEAVE_MATCH with mismatched matchId is rejected
//   - LEAVE_MATCH with invalid participant token is rejected
//   - GET_REPLAY with mismatched matchId is rejected
//   - All return CONNECTION_MATCH_MISMATCH reason code
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from 'node:net';

import { createMatch, ready } from '../packages/network-protocol/src/protocol.mjs';
import { ReasonCode } from '../packages/network-protocol/src/reason-codes.mjs';

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

async function startTestServer() {
  testPort = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  server = await startServer({
    port: testPort,
    host: '127.0.0.1',
    dbPath: ':memory:',
    persistent: false,
    rateLimitCapacity: 10000,
  });
  return server;
}

async function stopTestServer() {
  if (server) {
    try { await server.close(); } catch { /* ignore */ }
    server = null;
  }
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

// ── Tests ──

test('connection-binding: READY with mismatched matchId returns CONNECTION_MATCH_MISMATCH', async () => {
  await startTestServer();
  try {
    // Create match A — connection is bound to match A
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const p1Token = created.payload.participantToken;

    // Send READY for a DIFFERENT matchId — must be rejected
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'READY',
      payload: { matchId: 'M-fakeMatchId123', participantToken: p1Token },
    }));
    const resp = await waitForMessage(ws, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.CONNECTION_MATCH_MISMATCH);
    ws.close();
  } finally {
    await stopTestServer();
  }
});

test('connection-binding: SUBMIT_ACTION with mismatched matchId returns CONNECTION_MATCH_MISMATCH', async () => {
  await startTestServer();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const p1Token = created.payload.participantToken;

    // Send SUBMIT_ACTION for a different matchId
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'SUBMIT_ACTION',
      payload: {
        matchId: 'M-fakeMatchId456',
        participantToken: p1Token,
        clientCommandId: 'cmd-1',
        expectedRevision: 0,
        decisionFrameHash: 'a'.repeat(16),
        actionId: 'act-1',
      },
    }));
    const resp = await waitForMessage(ws, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.CONNECTION_MATCH_MISMATCH);
    ws.close();
  } finally {
    await stopTestServer();
  }
});

test('connection-binding: REQUEST_SYNC with mismatched matchId returns CONNECTION_MATCH_MISMATCH', async () => {
  await startTestServer();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const p1Token = created.payload.participantToken;

    // Send REQUEST_SYNC for a different matchId
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'REQUEST_SYNC',
      payload: { matchId: 'M-fakeMatchId789', participantToken: p1Token },
    }));
    const resp = await waitForMessage(ws, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.CONNECTION_MATCH_MISMATCH);
    ws.close();
  } finally {
    await stopTestServer();
  }
});

test('connection-binding: LEAVE_MATCH with mismatched matchId returns CONNECTION_MATCH_MISMATCH', async () => {
  await startTestServer();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const matchId = created.payload.matchId;
    const p1Token = created.payload.participantToken;

    // Send LEAVE_MATCH for a different matchId — must not disconnect from the real match
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'LEAVE_MATCH',
      payload: { matchId: 'M-fakeMatchId000', participantToken: p1Token },
    }));
    const resp = await waitForMessage(ws, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.CONNECTION_MATCH_MISMATCH);
    ws.close();
  } finally {
    await stopTestServer();
  }
});

test('connection-binding: LEAVE_MATCH with invalid participant token returns AUTH_TOKEN_INVALID', async () => {
  await startTestServer();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const matchId = created.payload.matchId;

    // Send LEAVE_MATCH with a fake token — must be rejected
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'LEAVE_MATCH',
      payload: { matchId, participantToken: 'fake-token-not-valid-1234567890' },
    }));
    const resp = await waitForMessage(ws, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.AUTH_TOKEN_INVALID);
    ws.close();
  } finally {
    await stopTestServer();
  }
});

test('connection-binding: GET_REPLAY with mismatched matchId returns CONNECTION_MATCH_MISMATCH', async () => {
  await startTestServer();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const p1Token = created.payload.participantToken;

    // Send GET_REPLAY for a different matchId
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'GET_REPLAY',
      payload: { matchId: 'M-fakeMatchId999', participantToken: p1Token },
    }));
    const resp = await waitForMessage(ws, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.CONNECTION_MATCH_MISMATCH);
    ws.close();
  } finally {
    await stopTestServer();
  }
});

test('connection-binding: LEAVE_MATCH with correct matchId and token succeeds', async () => {
  await startTestServer();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await waitForMessage(ws, 'MATCH_CREATED');
    const matchId = created.payload.matchId;
    const p1Token = created.payload.participantToken;

    // Send LEAVE_MATCH with correct matchId and token — must succeed
    ws.send(JSON.stringify({
      protocolVersion: 1,
      type: 'LEAVE_MATCH',
      payload: { matchId, participantToken: p1Token },
    }));
    const resp = await waitForMessage(ws, 'LEFT_MATCH');
    assert.equal(resp.payload.matchId, matchId);
    ws.close();
  } finally {
    await stopTestServer();
  }
});
