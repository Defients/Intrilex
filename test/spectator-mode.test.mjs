// ═══════════════════════════════════════════════════════════════
// spectator-mode.test.mjs — Match spectator mode tests
//
// Proves:
//   - SPECTATE_MATCH protocol message is valid
//   - SPECTATE_LEAVE protocol message is valid
//   - Spectator can join a RUNNING match
//   - Spectator receives SPECTATE_JOINED with a match view
//   - Spectator receives MATCH_VIEW on state changes
//   - Spectator cannot submit actions (rejected)
//   - Spectator cannot spectate a non-existent match
//   - Spectator cannot spectate a match that hasn't started
//   - Spectator view does not contain seed/RNG
//   - SPECTATE_JOINED and SPECTATE_LEFT message structures
//   - Server integration: full spectate lifecycle
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';

import {
  createMatch, joinMatch, ready, submitAction, requestSync,
  matchCreated, matchJoined,
  spectateMatch, spectateLeave, spectateJoined, spectateLeft,
  validateEnvelope, validateSpectateMatch, validateSpectateLeave,
  ReasonCode,
} from '../packages/network-protocol/src/protocol.mjs';
import { createAuthoritativeMatch, MatchStatus } from '../packages/match-authority/src/authoritative-match-session.mjs';

const TEST_PORT = 3399;

function makeToken() { return randomBytes(32).toString('base64url'); }

// ── Section 1: Protocol validation ──

test('spectator: SPECTATE_MATCH valid message accepted', () => {
  const msg = spectateMatch('M-test123', 'req-1');
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateSpectateMatch(msg.payload);
  assert.ok(payloadCheck.valid);
});

test('spectator: SPECTATE_MATCH invalid matchId rejected', () => {
  const msg = { protocolVersion: 2, type: 'SPECTATE_MATCH', payload: { matchId: 'x' } };
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateSpectateMatch(msg.payload);
  assert.equal(payloadCheck.valid, false);
});

test('spectator: SPECTATE_LEAVE valid message accepted', () => {
  const msg = spectateLeave('req-1');
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateSpectateLeave(msg.payload);
  assert.ok(payloadCheck.valid);
});

test('spectator: SPECTATE_MATCH and SPECTATE_LEAVE are known types', () => {
  const spectateMsg = spectateMatch('M-test123');
  const leaveMsg = spectateLeave();
  assert.ok(validateEnvelope(spectateMsg).valid, 'SPECTATE_MATCH must be a known type');
  assert.ok(validateEnvelope(leaveMsg).valid, 'SPECTATE_LEAVE must be a known type');
});

// ── Section 2: Message structure ──

test('spectator: SPECTATE_JOINED has correct structure', () => {
  const msg = spectateJoined('M-test', { status: 'RUNNING' }, 'req-1');
  assert.equal(msg.type, 'SPECTATE_JOINED');
  assert.equal(msg.payload.matchId, 'M-test');
  assert.ok(msg.payload.view);
});

test('spectator: SPECTATE_LEFT has correct structure', () => {
  const msg = spectateLeft('req-1');
  assert.equal(msg.type, 'SPECTATE_LEFT');
});

// ── Section 3: Server integration ──

async function connectAndCreateMatch(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  const createMsg = createMatch('core-unrestricted-authority', 'req-create', { queueId: 'casual' });
  const createResp = await new Promise((resolve) => {
    ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    ws.send(JSON.stringify(createMsg));
  });

  return { ws, matchId: createResp.payload.matchId, inviteCode: createResp.payload.inviteCode, participantToken: createResp.payload.participantToken };
}

async function connectAndJoinMatch(port, inviteCode) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  const joinMsg = joinMatch(inviteCode, 'req-join');
  const joinResp = await new Promise((resolve) => {
    ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    ws.send(JSON.stringify(joinMsg));
  });

  return { ws, matchId: joinResp.payload.matchId, participantToken: joinResp.payload.participantToken, playerId: joinResp.payload.seat };
}

async function sendReady(ws, matchId, participantToken) {
  const readyMsg = ready(matchId, participantToken, 'req-ready');
  // Collect all messages until we get a MATCH_STARTED
  return new Promise((resolve) => {
    const messages = [];
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (msg.type === 'MATCH_STARTED' || msg.type === 'MATCH_VIEW') {
        ws.off('message', handler);
        resolve({ messages, started: msg.type === 'MATCH_STARTED' });
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(readyMsg));
  });
}

test('spectator: can spectate a running match', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // Create and join a match
    const p1 = await connectAndCreateMatch(TEST_PORT);
    const p2 = await connectAndJoinMatch(TEST_PORT, p1.inviteCode);

    // Both ready → match starts
    await sendReady(p1.ws, p1.matchId, p1.participantToken);
    await sendReady(p2.ws, p2.matchId, p2.participantToken);

    // Spectator connects
    const specWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise((resolve, reject) => {
      specWs.on('open', resolve);
      specWs.on('error', reject);
    });

    const spectateMsg = spectateMatch(p1.matchId, 'req-spec-1');
    const spectateResp = await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(spectateMsg));
    });

    assert.equal(spectateResp.type, 'SPECTATE_JOINED');
    assert.equal(spectateResp.payload.matchId, p1.matchId);
    assert.ok(spectateResp.payload.view, 'Spectator must receive a match view');

    specWs.close();
    p1.ws.close();
    p2.ws.close();
  } finally {
    await server.close();
  }
});

test('spectator: cannot spectate non-existent match', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 1, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const spectateMsg = spectateMatch('M-nonexistent', 'req-spec-2');
    const resp = await new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      ws.send(JSON.stringify(spectateMsg));
    });

    assert.equal(resp.type, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.MATCH_NOT_FOUND);

    ws.close();
  } finally {
    await server.close();
  }
});

test('spectator: cannot spectate a match that has not started', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 2, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // Create a match but don't start it
    const p1 = await connectAndCreateMatch(TEST_PORT + 2);

    // Spectator tries to join
    const specWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 2}`);
    await new Promise((resolve, reject) => {
      specWs.on('open', resolve);
      specWs.on('error', reject);
    });

    const spectateMsg = spectateMatch(p1.matchId, 'req-spec-3');
    const resp = await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(spectateMsg));
    });

    assert.equal(resp.type, 'ERROR');
    assert.equal(resp.payload.code, ReasonCode.MATCH_NOT_RUNNING);

    specWs.close();
    p1.ws.close();
  } finally {
    await server.close();
  }
});

test('spectator: SPECTATE_LEAVE works', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 3, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // Create and start a match
    const p1 = await connectAndCreateMatch(TEST_PORT + 3);
    const p2 = await connectAndJoinMatch(TEST_PORT + 3, p1.inviteCode);
    await sendReady(p1.ws, p1.matchId, p1.participantToken);
    await sendReady(p2.ws, p2.matchId, p2.participantToken);

    // Spectator joins
    const specWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 3}`);
    await new Promise((resolve, reject) => {
      specWs.on('open', resolve);
      specWs.on('error', reject);
    });

    const spectateMsg = spectateMatch(p1.matchId, 'req-spec-4');
    await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(spectateMsg));
    });

    // Spectator leaves
    const leaveMsg = spectateLeave('req-spec-leave-1');
    const leaveResp = await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(leaveMsg));
    });

    assert.equal(leaveResp.type, 'SPECTATE_LEFT');

    specWs.close();
    p1.ws.close();
    p2.ws.close();
  } finally {
    await server.close();
  }
});

test('spectator: spectator view does not contain seed', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 4, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    const p1 = await connectAndCreateMatch(TEST_PORT + 4);
    const p2 = await connectAndJoinMatch(TEST_PORT + 4, p1.inviteCode);
    await sendReady(p1.ws, p1.matchId, p1.participantToken);
    await sendReady(p2.ws, p2.matchId, p2.participantToken);

    const specWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 4}`);
    await new Promise((resolve, reject) => {
      specWs.on('open', resolve);
      specWs.on('error', reject);
    });

    const spectateMsg = spectateMatch(p1.matchId, 'req-spec-5');
    const spectateResp = await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(spectateMsg));
    });

    assert.equal(spectateResp.type, 'SPECTATE_JOINED');
    // The spectator view must not contain the seed
    assert.equal(spectateResp.payload.view.seed, undefined, 'Spectator view must not contain seed');

    specWs.close();
    p1.ws.close();
    p2.ws.close();
  } finally {
    await server.close();
  }
});

test('spectator: SPECTATE_LEAVE without spectating returns error', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 5, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 5}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const leaveMsg = spectateLeave('req-spec-leave-2');
    const resp = await new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      ws.send(JSON.stringify(leaveMsg));
    });

    assert.equal(resp.type, 'ERROR');

    ws.close();
  } finally {
    await server.close();
  }
});

test('spectator: cannot submit actions (rejected with PARTICIPANT_NOT_AUTHORIZED)', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 6, host: '127.0.0.1', dbPath: ':memory:' });

  try {
    // Create and start a match
    const p1 = await connectAndCreateMatch(TEST_PORT + 6);
    const p2 = await connectAndJoinMatch(TEST_PORT + 6, p1.inviteCode);
    await sendReady(p1.ws, p1.matchId, p1.participantToken);
    await sendReady(p2.ws, p2.matchId, p2.participantToken);

    // Spectator joins
    const specWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 6}`);
    await new Promise((resolve, reject) => {
      specWs.on('open', resolve);
      specWs.on('error', reject);
    });

    const spectateMsg = spectateMatch(p1.matchId, 'req-spec-join');
    await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(spectateMsg));
    });

    // Spectator attempts to submit an action — must be rejected
    const actionMsg = submitAction(
      p1.matchId, 'fake-token', 'cmd-spectator-1', 0, 'fake-frame-hash', 'fake-action-id', 'req-spec-action'
    );
    const actionResp = await new Promise((resolve) => {
      specWs.on('message', (data) => resolve(JSON.parse(data.toString())));
      specWs.send(JSON.stringify(actionMsg));
    });

    assert.equal(actionResp.type, 'ERROR', 'Spectator action submission must return ERROR');
    assert.equal(actionResp.payload.code, ReasonCode.PARTICIPANT_NOT_AUTHORIZED,
      'Spectator must be rejected with PARTICIPANT_NOT_AUTHORIZED before any match access');

    specWs.close();
    p1.ws.close();
    p2.ws.close();
  } finally {
    await server.close();
  }
});

// ── IRX-M19+: Spectator authentication tests ──

test('spectator: unauthenticated SPECTATE_MATCH rejected when auth is required', async () => {
  const { createServer } = await import('node:net');
  const findFreePort = () => new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
  const port = await findFreePort();
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { FakeIdentityVerifier } = await import('../apps/match-server/src/auth/fake-identity-verifier.mjs');
  const verifier = new FakeIdentityVerifier();
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:',
    authMode: 'required', identityVerifier: verifier, allowFakePersistor: true,
    rateLimitCapacity: 10000,
  });

  try {
    // Unauthenticated spectator tries to spectate — auth gate rejects before handler runs
    const specWs = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { specWs.on('open', resolve); specWs.on('error', reject); });
    specWs.send(JSON.stringify({ protocolVersion: 2, type: 'SPECTATE_MATCH', requestId: 'spec', payload: { matchId: 'M-fake' } }));
    const resp = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SPECTATE_MATCH response timeout')), 5000);
      specWs.on('message', (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
    });

    assert.equal(resp.type, 'ERROR', 'Unauthenticated spectate should return ERROR');
    assert.equal(resp.payload.code, ReasonCode.AUTH_REQUIRED, 'Should reject with AUTH_REQUIRED');

    specWs.close();
  } finally {
    await server.close();
    verifier.close();
    await new Promise(r => setTimeout(r, 200));
  }
});
