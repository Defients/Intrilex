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
  renderLiveMatchesSection,
} from '../apps/lab-web/src/play/network/network-lobby-renderer.mjs';

import {
  queueJoin, queueLeave, spectateMatch, spectateLeave, listSpectatable, PROTOCOL_VERSION,
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

test('protocol-client: queueJoin defaults to ranked queueId (H1 ranked-loop closure)', () => {
  const msg = queueJoin('core-unrestricted-authority');
  assert.equal(msg.payload.queueId, 'ranked', 'Find Match must request the ranked queue by default');
});

test('protocol-client: queueJoin accepts an explicit queueId', () => {
  const casual = queueJoin('core-unrestricted-authority', 'casual');
  assert.equal(casual.payload.queueId, 'casual');
  const ranked = queueJoin('core-unrestricted-authority', 'ranked');
  assert.equal(ranked.payload.queueId, 'ranked');
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

// ── Section 6: Live match browser (spectator discovery) ──

test('protocol-client: listSpectatable builds correct message', () => {
  const msg = listSpectatable();
  assert.equal(msg.type, 'LIST_SPECTATABLE');
  assert.ok(msg.requestId, 'Must have a request ID');
  assert.equal(msg.protocolVersion, 2);
  assert.deepEqual(msg.payload, {});
});

test('live-section: hidden by default (no live state provided)', () => {
  const html = renderLiveMatchesSection({});
  assert.equal(html, '', 'Must render nothing when no live state is provided');
});

test('live-section: renders loading indicator when liveLoading=true', () => {
  const html = renderLiveMatchesSection({ liveLoading: true });
  assert.ok(html.includes('data-testid="network-live-matches"'), 'Must have section container');
  assert.ok(html.includes('data-testid="network-live-loading"'), 'Must show loading indicator');
  assert.ok(html.includes('Scanning for live matches'), 'Must show scanning text');
  assert.ok(html.includes('data-testid="network-live-refresh"'), 'Must have refresh button');
  assert.ok(html.includes('disabled'), 'Refresh must be disabled while loading');
});

test('live-section: renders empty notice when liveMatches is empty array', () => {
  const html = renderLiveMatchesSection({ liveMatches: [] });
  assert.ok(html.includes('data-testid="network-live-empty"'), 'Must show empty notice');
  assert.ok(html.includes('No live matches'), 'Must show empty text');
  assert.ok(!html.includes('data-testid="network-live-list"'), 'Must not render list when empty');
});

test('live-section: renders error notice when liveError is set', () => {
  const html = renderLiveMatchesSection({ liveError: 'Connection refused' });
  assert.ok(html.includes('data-testid="network-live-error"'), 'Must show error notice');
  assert.ok(html.includes('Connection refused'), 'Must show error text');
  assert.ok(!html.includes('data-testid="network-live-list"'), 'Must not render list on error');
});

test('live-section: renders one card per spectatable match', () => {
  const matches = [
    { matchId: 'M-aaa', participants: [{ displayName: 'Alice' }, { displayName: 'Bob' }], spectatorCount: 3, queueId: 'ranked', matchMode: 'public' },
    { matchId: 'M-bbb', participants: [{ displayName: 'Carol' }, { displayName: 'Dave' }], spectatorCount: 0, queueId: 'casual', matchMode: 'public' },
  ];
  const html = renderLiveMatchesSection({ liveMatches: matches });
  assert.ok(html.includes('data-testid="network-live-list"'), 'Must render list');
  const items = html.match(/data-testid="network-live-item"/g) || [];
  assert.equal(items.length, 2, 'Must render one item per match');
  assert.ok(html.includes('Alice vs Bob'), 'Must render versus label for match 1');
  assert.ok(html.includes('Carol vs Dave'), 'Must render versus label for match 2');
});

test('live-section: ranked matches get a Ranked badge, others get Casual', () => {
  const matches = [
    { matchId: 'M-aaa', participants: [{ displayName: 'A' }, { displayName: 'B' }], spectatorCount: 0, queueId: 'ranked' },
    { matchId: 'M-bbb', participants: [{ displayName: 'C' }, { displayName: 'D' }], spectatorCount: 0, queueId: 'casual' },
  ];
  const html = renderLiveMatchesSection({ liveMatches: matches });
  assert.ok(html.includes('Ranked'), 'Must show Ranked badge');
  assert.ok(html.includes('Casual'), 'Must show Casual badge');
});

test('live-section: each card has a one-click Watch button with matchId', () => {
  const matches = [
    { matchId: 'M-aaa', participants: [{ displayName: 'A' }, { displayName: 'B' }], spectatorCount: 1, queueId: 'ranked' },
  ];
  const html = renderLiveMatchesSection({ liveMatches: matches });
  assert.ok(html.includes('data-action="network-spectate-live"'), 'Must have watch action');
  assert.ok(html.includes('data-match-id="M-aaa"'), 'Must carry matchId on the button');
  assert.ok(html.includes('data-testid="network-live-watch"'), 'Watch button must have testid');
  assert.ok(html.includes('Watch'), 'Must have visible Watch text');
});

test('live-section: spectator count is shown for each match', () => {
  const matches = [
    { matchId: 'M-aaa', participants: [{ displayName: 'A' }, { displayName: 'B' }], spectatorCount: 7, queueId: 'ranked' },
  ];
  const html = renderLiveMatchesSection({ liveMatches: matches });
  assert.ok(html.includes('> 7</span>'), 'Must show spectator count');
});

test('live-section: missing participants fall back gracefully', () => {
  const html = renderLiveMatchesSection({ liveMatches: [{ matchId: 'M-x', spectatorCount: 0, queueId: 'ranked' }] });
  assert.ok(html.includes('Match in progress'), 'Must fall back to generic label when no participants');
});

test('live-section: refresh button is enabled when not loading', () => {
  const html = renderLiveMatchesSection({ liveMatches: [] });
  const refreshMatch = html.match(/<button[^>]*data-action="network-live-refresh"[^>]*>/);
  assert.ok(refreshMatch, 'Must have refresh button');
  assert.ok(!refreshMatch[0].includes('disabled'), 'Refresh must be enabled when not loading');
});

test('spectate-form: live section is integrated into the spectate form', () => {
  const html = renderNetworkSpectateForm({ liveMatches: [] });
  assert.ok(html.includes('data-testid="network-live-matches"'), 'Spectate form must include live section');
  assert.ok(html.includes('data-testid="network-spectate-form-element"'), 'Manual form must still be present');
});

test('spectate-form: live section appears before the manual form', () => {
  const html = renderNetworkSpectateForm({ liveMatches: [] });
  const liveIdx = html.indexOf('data-testid="network-live-matches"');
  const formIdx = html.indexOf('data-testid="network-spectate-form-element"');
  assert.ok(liveIdx > -1 && formIdx > -1, 'Both sections must be present');
  assert.ok(liveIdx < formIdx, 'Live section must come before the manual form');
});

test('spectate-form: subtitle mentions both browsing and Match ID entry', () => {
  const html = renderNetworkSpectateForm({});
  assert.ok(html.includes('Pick one below'), 'Subtitle must mention browsing');
  assert.ok(html.includes('Match ID'), 'Subtitle must mention manual entry');
});

test('spectate-form: no live state hides the live section but keeps the form', () => {
  const html = renderNetworkSpectateForm({});
  assert.ok(!html.includes('data-testid="network-live-matches"'), 'Live section must be hidden without state');
  assert.ok(html.includes('data-testid="network-spectate-form-element"'), 'Manual form must still render');
});
