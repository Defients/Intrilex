// ═══════════════════════════════════════════════════════════════
// network-lobby-ui.test.mjs — Lobby UI renderer tests for matchmaking + spectate
//
// Proves:
//   - Lobby hub includes "Find Match" button
//   - Lobby hub includes "Spectate" button
//   - Queue waiting screen renders with position and ETA
//   - Spectate form renders with match ID input
//   - Spectating view renders with match status
//   - Protocol client builders for queue and spectate are correct
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderNetworkLobby,
  renderNetworkQueueWaiting,
  renderNetworkSpectateForm,
  renderNetworkSpectating,
} from '../apps/lab-web/src/play/network/network-lobby-renderer.mjs';

import {
  queueJoin, queueLeave, spectateMatch, spectateLeave, PROTOCOL_VERSION,
} from '../apps/lab-web/src/play/network/network-protocol-client.mjs';

// ── Section 1: Lobby hub includes new buttons ──

test('lobby-ui: lobby hub includes Find Match button', () => {
  const html = renderNetworkLobby({ serverUrl: 'ws://localhost:3099' });
  assert.ok(html.includes('data-action="network-queue"'), 'Lobby must have Find Match button');
  assert.ok(html.includes('data-testid="network-queue"'), 'Find Match button must have testid');
  assert.ok(html.includes('Find Match'), 'Find Match button must have visible text');
});

test('lobby-ui: lobby hub includes Spectate button', () => {
  const html = renderNetworkLobby({ serverUrl: 'ws://localhost:3099' });
  assert.ok(html.includes('data-action="network-spectate"'), 'Lobby must have Spectate button');
  assert.ok(html.includes('data-testid="network-spectate"'), 'Spectate button must have testid');
  assert.ok(html.includes('Spectate'), 'Spectate button must have visible text');
});

test('lobby-ui: lobby hub has 4 cards (create, join, queue, spectate)', () => {
  const html = renderNetworkLobby({ serverUrl: 'ws://localhost:3099' });
  const cards = html.match(/class="play-hub-card network-lobby-card[^"]*"/g) || [];
  assert.equal(cards.length, 4, 'Lobby must have 4 cards');
  // Match History card was removed (redundant with homepage overlay)
  assert.ok(!html.includes('data-action="network-history"'), 'Lobby must NOT have Match History button');
});

// ── Section 2: Queue waiting screen ──

test('lobby-ui: queue waiting screen renders with position', () => {
  const html = renderNetworkQueueWaiting({ position: 3, estimatedWaitMs: 15000 });
  assert.ok(html.includes('data-testid="network-queue-waiting"'), 'Must have queue waiting container');
  assert.ok(html.includes('Position in queue:'), 'Must show position label');
  assert.ok(html.includes('<strong>3</strong>'), 'Must show position value');
  assert.ok(html.includes('~15s'), 'Must show estimated wait');
});

test('lobby-ui: queue waiting screen has cancel button', () => {
  const html = renderNetworkQueueWaiting({ position: 1 });
  assert.ok(html.includes('data-action="network-queue-leave"'), 'Must have cancel/leave action');
  assert.ok(html.includes('Cancel matchmaking'), 'Must have cancel button text');
});

test('lobby-ui: queue waiting screen shows error', () => {
  const html = renderNetworkQueueWaiting({ error: 'Queue is full' });
  assert.ok(html.includes('data-testid="network-error"'), 'Must have error element');
  assert.ok(html.includes('Queue is full'), 'Must show error text');
});

// ── Section 3: Spectate form ──

test('lobby-ui: spectate form renders with match ID input', () => {
  const html = renderNetworkSpectateForm({});
  assert.ok(html.includes('data-testid="network-spectate-form"'), 'Must have spectate form container');
  assert.ok(html.includes('name="matchId"'), 'Must have matchId input');
  assert.ok(html.includes('data-testid="network-spectate-input"'), 'Must have spectate input testid');
  assert.ok(html.includes('data-testid="network-spectate-submit"'), 'Must have submit button');
});

test('lobby-ui: spectate form shows connecting state', () => {
  const html = renderNetworkSpectateForm({ connecting: true });
  assert.ok(html.includes('disabled'), 'Input must be disabled when connecting');
  assert.ok(html.includes('Connecting…'), 'Must show connecting text');
});

test('lobby-ui: spectate form shows error', () => {
  const html = renderNetworkSpectateForm({ error: 'Match not found' });
  assert.ok(html.includes('data-testid="network-error"'), 'Must have error element');
  assert.ok(html.includes('Match not found'), 'Must show error text');
});

// ── Section 4: Spectating view ──

test('lobby-ui: spectating view renders with match status', () => {
  const html = renderNetworkSpectating({
    matchId: 'M-abc123def456',
    view: { status: 'RUNNING', match: { phase: 'MAIN', activePlayerId: 'P1' } },
  });
  assert.ok(html.includes('data-testid="network-spectating"'), 'Must have spectating container');
  assert.ok(html.includes('RUNNING'), 'Must show match status');
  assert.ok(html.includes('MAIN'), 'Must show match phase');
  assert.ok(html.includes('P1'), 'Must show active player');
});

test('lobby-ui: spectating view shows winner when terminal', () => {
  const html = renderNetworkSpectating({
    matchId: 'M-abc123',
    view: { status: 'TERMINAL', match: { winner: 'P1', phase: 'Ended' } },
  });
  assert.ok(html.includes('data-testid="network-spectating-winner"'), 'Must have winner element');
  assert.ok(html.includes('P1'), 'Must show winner');
});

test('lobby-ui: spectating view has leave button', () => {
  const html = renderNetworkSpectating({ matchId: 'M-test' });
  assert.ok(html.includes('data-action="network-spectate-leave"'), 'Must have leave action');
  assert.ok(html.includes('Stop spectating'), 'Must have leave button text');
});

test('lobby-ui: spectating view shows read-only badge', () => {
  const html = renderNetworkSpectating({ matchId: 'M-test' });
  assert.ok(html.includes('Read-only'), 'Must show read-only badge');
});

// ── Section 5: Protocol client builders ──

test('protocol-client: queueJoin builds correct message', () => {
  const msg = queueJoin('core-unrestricted-authority');
  assert.equal(msg.protocolVersion, PROTOCOL_VERSION);
  assert.equal(msg.type, 'QUEUE_JOIN');
  assert.equal(msg.payload.profileId, 'core-unrestricted-authority');
  assert.ok(msg.requestId, 'Must have a request ID');
});

test('protocol-client: queueLeave builds correct message', () => {
  const msg = queueLeave();
  assert.equal(msg.type, 'QUEUE_LEAVE');
  assert.ok(msg.requestId, 'Must have a request ID');
});

test('protocol-client: spectateMatch builds correct message', () => {
  const msg = spectateMatch('M-test123');
  assert.equal(msg.type, 'SPECTATE_MATCH');
  assert.equal(msg.payload.matchId, 'M-test123');
  assert.ok(msg.requestId, 'Must have a request ID');
});

test('protocol-client: spectateLeave builds correct message', () => {
  const msg = spectateLeave();
  assert.equal(msg.type, 'SPECTATE_LEAVE');
  assert.ok(msg.requestId, 'Must have a request ID');
});

test('protocol-client: all new builders have correct protocol version', () => {
  assert.equal(queueJoin('core-test').protocolVersion, 2);
  assert.equal(queueLeave().protocolVersion, 2);
  assert.equal(spectateMatch('M-test').protocolVersion, 2);
  assert.equal(spectateLeave().protocolVersion, 2);
});
