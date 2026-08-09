// ═══════════════════════════════════════════════════════════════
// network-chat.test.mjs
// v0.25 Phase D: Network participant chat end-to-end tests.
//
// Tests the full chat path: client composer → protocol validation →
// server authorization/rate limit → participant broadcast → client state.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import {
  sendChat, chatMessage, envelope,
  validateEnvelope, validateSendChat,
  PROTOCOL_VERSION,
} from '../packages/network-protocol/src/protocol.mjs';
import { ReasonCode } from '../packages/network-protocol/src/reason-codes.mjs';

// ── Protocol builder tests ──

test('sendChat builds a SEND_CHAT envelope with correct fields', () => {
  const msg = sendChat('match-123', 'participant-token-abcdef', 'Hello!');
  assert.equal(msg.type, 'SEND_CHAT');
  assert.equal(msg.protocolVersion, PROTOCOL_VERSION);
  assert.equal(msg.payload.matchId, 'match-123');
  assert.equal(msg.payload.participantToken, 'participant-token-abcdef');
  assert.equal(msg.payload.text, 'Hello!');
});

test('chatMessage builds a CHAT_MESSAGE envelope with correct fields', () => {
  const msg = chatMessage('match-123', 'P1', 'Hi there', '2026-08-09T12:00:00Z');
  assert.equal(msg.type, 'CHAT_MESSAGE');
  assert.equal(msg.payload.matchId, 'match-123');
  assert.equal(msg.payload.participantId, 'P1');
  assert.equal(msg.payload.text, 'Hi there');
  assert.equal(msg.payload.timestamp, '2026-08-09T12:00:00Z');
});

// ── Validation tests ──

test('validateSendChat accepts a valid chat payload', () => {
  const result = validateSendChat({ matchId: 'match-123', participantToken: 'participant-token-abcdef', text: 'Hello!' });
  assert.equal(result.valid, true);
});

test('validateSendChat rejects empty text', () => {
  const result = validateSendChat({ matchId: 'match-123', participantToken: 'participant-token-abcdef', text: '' });
  assert.equal(result.valid, false);
  assert.equal(result.code, ReasonCode.INVALID_FIELD_TYPE);
});

test('validateSendChat rejects text over 200 chars', () => {
  const longText = 'a'.repeat(201);
  const result = validateSendChat({ matchId: 'match-123', participantToken: 'participant-token-abcdef', text: longText });
  assert.equal(result.valid, false);
  assert.equal(result.code, ReasonCode.INVALID_FIELD_TYPE);
});

test('validateSendChat accepts text of exactly 200 chars', () => {
  const maxText = 'a'.repeat(200);
  const result = validateSendChat({ matchId: 'match-123', participantToken: 'participant-token-abcdef', text: maxText });
  assert.equal(result.valid, true);
});

test('validateSendChat rejects missing matchId', () => {
  const result = validateSendChat({ participantToken: 'participant-token-abcdef', text: 'Hello' });
  assert.equal(result.valid, false);
});

test('validateSendChat rejects missing participantToken', () => {
  const result = validateSendChat({ matchId: 'match-123', text: 'Hello' });
  assert.equal(result.valid, false);
});

test('validateSendChat rejects short participantToken', () => {
  const result = validateSendChat({ matchId: 'match-123', participantToken: 'short', text: 'Hello' });
  assert.equal(result.valid, false);
});

test('validateSendChat rejects non-string text', () => {
  const result = validateSendChat({ matchId: 'match-123', participantToken: 'participant-token-abcdef', text: 123 });
  assert.equal(result.valid, false);
});

// ── Envelope validation ──

test('validateEnvelope accepts SEND_CHAT type', () => {
  const msg = sendChat('match-123', 'participant-token-abcdef', 'Hello!');
  const result = validateEnvelope(msg);
  assert.equal(result.valid, true);
});

test('validateEnvelope accepts CHAT_MESSAGE type', () => {
  const msg = chatMessage('match-123', 'P1', 'Hi', '2026-08-09T12:00:00Z');
  const result = validateEnvelope(msg);
  assert.equal(result.valid, true);
});

// ── Server handler integration tests ──

const TEST_PORT = 3198;

function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    ws.on('message', function handler(data) {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    });
  });
}

test('server handleSendChat broadcasts to all match participants', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT, host: '127.0.0.1', dbPath: ':memory:', rateLimitCapacity: 100 });

  try {
    const ws1 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await Promise.all([
      new Promise(r => ws1.on('open', r)),
      new Promise(r => ws2.on('open', r)),
    ]);

    // P1 creates a match
    ws1.send(JSON.stringify(envelope('CREATE_MATCH', { profileId: 'core-advanced-authority' })));
    const created = await waitForMessage(ws1, 'MATCH_CREATED');
    const matchId = created.payload.matchId;
    const inviteCode = created.payload.inviteCode;
    const p1Token = created.payload.participantToken;

    // P2 joins
    ws2.send(JSON.stringify(envelope('JOIN_MATCH', { inviteCode })));
    const joined = await waitForMessage(ws2, 'MATCH_JOINED');
    const p2Token = joined.payload.participantToken;

    // Both ready
    ws1.send(JSON.stringify(envelope('READY', { matchId, participantToken: p1Token })));
    ws2.send(JSON.stringify(envelope('READY', { matchId, participantToken: p2Token })));

    // Wait for match to start
    await waitForMessage(ws1, 'MATCH_STARTED');

    // P1 sends a chat message
    ws1.send(JSON.stringify(sendChat(matchId, p1Token, 'Hello from P1!')));

    // Both clients should receive the CHAT_MESSAGE
    const p1Received = await waitForMessage(ws1, 'CHAT_MESSAGE');
    assert.equal(p1Received.payload.text, 'Hello from P1!');
    assert.ok(p1Received.payload.participantId, 'participantId must be present');

    const p2Received = await waitForMessage(ws2, 'CHAT_MESSAGE');
    assert.equal(p2Received.payload.text, 'Hello from P1!');
    assert.equal(p2Received.payload.participantId, p1Received.payload.participantId);

    // Cleanup
    ws1.close();
    ws2.close();
  } finally {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
  }
});

test('server handleSendChat rejects chat from non-participant (connection-match binding)', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 1, host: '127.0.0.1', dbPath: ':memory:', rateLimitCapacity: 100 });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}`);
    await new Promise(r => ws.on('open', r));

    // Try to send chat with a fake match — connection is not bound to any match
    ws.send(JSON.stringify(sendChat('fake-match-id', 'fake-token-1234567890', 'Hello')));
    const error = await waitForMessage(ws, 'ERROR');
    assert.equal(error.payload.code, ReasonCode.CONNECTION_MATCH_MISMATCH);

    ws.close();
  } finally {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
  }
});

test('server handleSendChat rejects empty text', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const server = await startServer({ port: TEST_PORT + 2, host: '127.0.0.1', dbPath: ':memory:', rateLimitCapacity: 100 });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 2}`);
    await new Promise(r => ws.on('open', r));

    // Send a chat with empty text (bypass client validation)
    ws.send(JSON.stringify(envelope('SEND_CHAT', { matchId: 'fake-match-id', participantToken: 'fake-token-1234567890', text: '' })));
    const error = await waitForMessage(ws, 'ERROR');
    assert.equal(error.payload.code, ReasonCode.INVALID_FIELD_TYPE);

    ws.close();
  } finally {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
  }
});
