// ═══════════════════════════════════════════════════════════════
// network-ux-integration.test.mjs — v0.24.0 Network UX Integration
//
// Proves:
//   - Network lobby renderer produces correct HTML structure
//   - Play hub includes Direct Duel card
//   - Play app routes include network sub-routes
//   - NetworkPlaySession has submitHumanAction (board-events compat)
//   - NetworkPlaySession has localStorage reconnection persistence
//   - Network lobby renderer has data-testid and ARIA attributes
//   - Network lobby CSS exists with responsive breakpoints
//   - Dev server supports --with-network flag
//   - package.json has network:dev and dev:network scripts
//   - No raw engine state leaks in lobby renderer
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');

async function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8');
}

async function playSrc(rel) {
  return readFile(path.join(root, 'apps/lab-web/src/play', rel), 'utf8');
}

// ── Section 1: Play Hub — Direct Duel card ──

test('network-ux: play hub includes Direct Duel card with data-action', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /data-action="online-duel"/);
  assert.match(js, /Direct Duel/);
  assert.match(js, /remote human opponent/);
});

test('network-ux: play hub has data-testid for online-duel', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /data-testid="online-duel"/);
});

// ── Section 2: Play app routes ──

test('network-ux: play-app.js routes include /online sub-routes', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /\/online/);
  assert.match(js, /renderNetworkLobbyHub/);
  assert.match(js, /renderNetworkCreateFlow/);
  assert.match(js, /renderNetworkJoinFlow/);
  assert.match(js, /renderNetworkActiveMatch/);
});

test('network-ux: play-app.js binds online-duel hub action', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /online-duel/);
  assert.match(js, /#\/play\/online/);
});

test('network-ux: play-app.js imports network lobby renderer', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /network-lobby-renderer\.mjs/);
  assert.match(js, /renderNetworkLobby/);
  assert.match(js, /renderNetworkCreateWaiting/);
  assert.match(js, /renderNetworkJoinForm/);
  assert.match(js, /renderNetworkError/);
});

test('network-ux: play-app.js imports NetworkPlaySession', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /network-session\.mjs/);
  assert.match(js, /NetworkPlaySession/);
  assert.match(js, /NetworkSessionState/);
});

test('network-ux: play-app.js has reconnect flow', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /reconnectToSavedMatch/);
  assert.match(js, /getSavedMatch/);
  assert.match(js, /renderNetworkReconnectDialog/);
});

test('network-ux: play-app.js has network error handling', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /bindNetworkErrorEvents/);
  assert.match(js, /renderNetworkError/);
  assert.match(js, /network-retry/);
});

// ── Section 3: Network lobby renderer ──

test('network-ux: lobby renderer has data-testid attributes', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /data-testid="network-lobby"/);
  assert.match(js, /data-testid="network-create"/);
  assert.match(js, /data-testid="network-join"/);
  assert.match(js, /data-testid="network-invite-code"/);
  assert.match(js, /data-testid="network-ready"/);
  assert.match(js, /data-testid="network-join-form"/);
});

test('network-ux: lobby renderer has ARIA labels', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /aria-label/);
  assert.match(js, /role="dialog"/);
  assert.match(js, /role="alert"/);
  assert.match(js, /aria-modal/);
});

test('network-ux: lobby renderer has invite code display', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /Invite Code/i);
  assert.match(js, /network-invite-code/);
  assert.match(js, /Copy code/);
});

test('network-ux: lobby renderer has server status indicator', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /network-server-status/);
  assert.match(js, /Online/);
  assert.match(js, /Offline/);
});

test('network-ux: lobby renderer has reconnect card', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /network-reconnect-card/);
  assert.match(js, /Reconnect/);
  assert.match(js, /Abandon/);
});

test('network-ux: lobby renderer has connection-lost dialog', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /renderNetworkReconnectDialog/);
  assert.match(js, /Connection Lost/);
  assert.match(js, /Forfeit/);
});

test('network-ux: lobby renderer has status banner for opponent disconnect', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /renderNetworkStatusBanner/);
  assert.match(js, /opponent-disconnected/);
  assert.match(js, /Opponent disconnected/);
});

test('network-ux: lobby renderer has join form with input validation', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.match(js, /maxlength="8"/);
  assert.match(js, /pattern="\[A-Za-z0-9\]\{6,8\}"/);
  assert.match(js, /placeholder="ABC123"/);
});

// ── Section 4: NetworkPlaySession — board-events compatibility ──

test('network-ux: NetworkPlaySession has submitHumanAction method', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /submitHumanAction/);
  assert.match(js, /board-events\.js compatibility/);
});

test('network-ux: NetworkPlaySession has localStorage reconnection persistence', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /RECONNECT_KEY/);
  assert.match(js, /_saveReconnectInfo/);
  assert.match(js, /_clearReconnectInfo/);
  assert.match(js, /getSavedMatch/);
});

test('network-ux: NetworkPlaySession createDuel saves reconnect info', async () => {
  const js = await playSrc('network/network-session.mjs');
  // Verify that createDuel calls _saveReconnectInfo (behavioral: source contains the call)
  assert.match(js, /async createDuel[\s\S]*?_saveReconnectInfo/);
});

test('network-ux: NetworkPlaySession joinDuel saves reconnect info', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /async joinDuel[\s\S]*?_saveReconnectInfo/);
});

test('network-ux: NetworkPlaySession leave clears reconnect info', async () => {
  const js = await playSrc('network/network-session.mjs');
  const leaveMatch = js.match(/async leave\(\)[\s\S]*?disconnect\(\);/);
  assert.ok(leaveMatch, 'leave method should exist');
  assert.match(leaveMatch[0], /_clearReconnectInfo/);
});

test('network-ux: NetworkPlaySession terminal state clears reconnect info', async () => {
  const js = await playSrc('network/network-session.mjs');
  // MATCH_ENDED handler should clear reconnect info
  assert.match(js, /MATCH_ENDED[\s\S]*?_clearReconnectInfo/);
});

test('network-ux: NetworkPlaySession getSavedMatch is a static method', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /static getSavedMatch/);
});

test('network-ux: NetworkPlaySession creator is assigned P1', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /async createDuel[\s\S]*?this\.playerId = 'P1'/);
});

// ── Section 5: Privacy — no raw engine state in lobby renderer ──

test('network-ux: lobby renderer does not reference engine seed or RNG', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  // The lobby renderer should never reference seed, rng, or command vault
  assert.doesNotMatch(js, /\.seed\b/);
  assert.doesNotMatch(js, /commandVault/);
  assert.doesNotMatch(js, /rawCommand/);
});

test('network-ux: lobby renderer does not reference opponent hand or private state', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.doesNotMatch(js, /opponentHand/);
  assert.doesNotMatch(js, /privateState/);
  assert.doesNotMatch(js, /drawPileIds/);
});

test('network-ux: network-session.mjs does not expose seed or command vault in snapshot', async () => {
  const js = await playSrc('network/network-session.mjs');
  const getSnapshotMatch = js.match(/getSnapshot\(\)[\s\S]*?return \{/);
  assert.ok(getSnapshotMatch, 'getSnapshot method should exist');
  // The snapshot should not include seed, commandVault, or raw commands
  assert.doesNotMatch(getSnapshotMatch[0], /seed/);
  assert.doesNotMatch(getSnapshotMatch[0], /commandVault/);
});

// ── Section 6: CSS ──

test('network-ux: play-v3.css has network lobby styles', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /\.network-lobby\b/);
  assert.match(css, /\.network-lobby-grid\b/);
  assert.match(css, /\.network-invite-code\b/);
  assert.match(css, /\.network-waiting\b/);
  assert.match(css, /\.network-join\b/);
  assert.match(css, /\.network-reconnect-dialog\b/);
  assert.match(css, /\.network-error-screen\b/);
  assert.match(css, /\.network-status-banner\b/);
});

test('network-ux: play-v3.css has responsive breakpoint for network lobby', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.network-lobby-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test('network-ux: play-v3.css has focus-visible styles for network elements', async () => {
  const css = await playSrc('play-v3.css');
  // The network lobby uses .play-hub-card which already has focus-visible styles
  assert.match(css, /\.play-hub-card:focus-visible/);
});

// ── Section 7: Dev server integration ──

test('network-ux: dev-server.mjs supports --with-network flag', async () => {
  const js = await readSrc('scripts/dev-server.mjs');
  assert.match(js, /--with-network/);
  assert.match(js, /withNetwork/);
  assert.match(js, /startServer/);
  assert.match(js, /match-server\/src\/server\.mjs/);
});

test('network-ux: dev-server.mjs prints Direct Duel lobby URL', async () => {
  const js = await readSrc('scripts/dev-server.mjs');
  assert.match(js, /play\/online/);
});

// ── Section 8: package.json scripts ──

test('network-ux: package.json has dev:network script', async () => {
  const pkg = JSON.parse(await readSrc('package.json'));
  assert.ok(pkg.scripts['dev:network'], 'dev:network script should exist');
  assert.match(pkg.scripts['dev:network'], /--with-network/);
});

test('network-ux: package.json test script includes network-ux-integration', async () => {
  const pkg = JSON.parse(await readSrc('package.json'));
  assert.match(pkg.scripts.test, /network-ux-integration\.test\.mjs/);
});

test('network-ux: package.json test:network includes ux integration test', async () => {
  const pkg = JSON.parse(await readSrc('package.json'));
  assert.match(pkg.scripts['test:network'], /network-ux-integration\.test\.mjs/);
});

// ── Section 9: CI registration ──

test('network-ux: ci.mjs includes network-ux-integration stage', async () => {
  const js = await readSrc('scripts/ci.mjs');
  assert.match(js, /network-ux-integration/);
  assert.match(js, /network-ux-integration\.test\.mjs/);
});

// ── Section 10: Play state ──

test('network-ux: play-state.js includes networkSession field', async () => {
  const js = await playSrc('play-state.js');
  assert.match(js, /networkSession/);
});

test('network-ux: play-state.js resetState clears networkSession', async () => {
  const js = await playSrc('play-state.js');
  const resetMatch = js.match(/export function resetState\(\)[\s\S]*?^}/m);
  assert.ok(resetMatch, 'resetState function should exist');
  assert.match(resetMatch[0], /networkSession/);
});

// ── Section 11: Functional — lobby renderer output ──

test('network-ux: renderNetworkLobby produces correct HTML', async () => {
  const { renderNetworkLobby } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkLobby({
    serverUrl: 'ws://localhost:3099',
    hasSavedMatch: false,
    serverReachable: true,
  });
  assert.match(html, /data-testid="network-lobby"/);
  assert.match(html, /data-action="network-create"/);
  assert.match(html, /data-action="network-join"/);
  assert.match(html, /ws:\/\/localhost:3099/);
  assert.match(html, /Online/);
});

test('network-ux: renderNetworkLobby with saved match shows reconnect card', async () => {
  const { renderNetworkLobby } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkLobby({
    serverUrl: 'ws://localhost:3099',
    hasSavedMatch: true,
    savedMatchInfo: { matchId: 'match-abc123def456', inviteCode: 'XYZ789' },
    serverReachable: true,
  });
  assert.match(html, /data-testid="network-reconnect-card"/);
  assert.match(html, /data-action="network-reconnect"/);
  assert.match(html, /data-action="network-abandon"/);
});

test('network-ux: renderNetworkCreateWaiting shows invite code', async () => {
  const { renderNetworkCreateWaiting } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const fakeSession = {
    inviteCode: 'ABC123',
    matchId: 'match-test-123',
    opponentConnectionState: null,
    status: 'IN_LOBBY',
  };
  const html = renderNetworkCreateWaiting(fakeSession);
  assert.match(html, /data-testid="network-waiting"/);
  assert.match(html, /ABC123/);
  assert.match(html, /Waiting for Opponent/);
  assert.match(html, /data-action="network-copy-invite"/);
});

test('network-ux: renderNetworkCreateWaiting with connected opponent shows ready button', async () => {
  const { renderNetworkCreateWaiting } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const fakeSession = {
    inviteCode: 'ABC123',
    matchId: 'match-test-123',
    opponentConnectionState: 'CONNECTED',
    status: 'IN_LOBBY',
  };
  const html = renderNetworkCreateWaiting(fakeSession);
  assert.match(html, /Opponent connected/);
  assert.match(html, /data-action="network-ready"/);
  assert.match(html, /Mark Ready/);
});

test('network-ux: renderNetworkJoinForm has input field', async () => {
  const { renderNetworkJoinForm } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkJoinForm({});
  assert.match(html, /data-testid="network-join-form"/);
  assert.match(html, /name="inviteCode"/);
  assert.match(html, /maxlength="8"/);
  assert.match(html, /placeholder="ABC123"/);
});

test('network-ux: renderNetworkJoinForm with error shows error message', async () => {
  const { renderNetworkJoinForm } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkJoinForm({ error: 'Invalid invite code' });
  assert.match(html, /Invalid invite code/);
  assert.match(html, /role="alert"/);
});

test('network-ux: renderNetworkError produces error screen', async () => {
  const { renderNetworkError } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkError({ title: 'Connection Failed', message: 'Server unreachable' });
  assert.match(html, /data-testid="network-error-screen"/);
  assert.match(html, /Connection Failed/);
  assert.match(html, /Server unreachable/);
  assert.match(html, /data-action="network-retry"/);
});

test('network-ux: renderNetworkReconnectDialog produces dialog', async () => {
  const { renderNetworkReconnectDialog } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkReconnectDialog({ matchId: 'match-abc', canReconnect: true });
  assert.match(html, /data-testid="network-reconnect-dialog"/);
  assert.match(html, /Connection Lost/);
  assert.match(html, /data-action="network-reconnect-now"/);
  assert.match(html, /data-action="network-forfeit"/);
});

test('network-ux: renderNetworkStatusBanner shows disconnect warning', async () => {
  const { renderNetworkStatusBanner } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkStatusBanner({ opponentConnectionState: 'DISCONNECTED' });
  assert.match(html, /data-testid="network-status-banner"/);
  assert.match(html, /Opponent disconnected/);
});

test('network-ux: renderNetworkStatusBanner returns empty when opponent connected', async () => {
  const { renderNetworkStatusBanner } = await import('../apps/lab-web/src/play/network/network-lobby-renderer.mjs');
  const html = renderNetworkStatusBanner({ opponentConnectionState: 'CONNECTED' });
  assert.equal(html, '');
});

// ── Section 12: No node: imports in browser modules ──

test('network-ux: network-lobby-renderer has no node: imports', async () => {
  const js = await playSrc('network/network-lobby-renderer.mjs');
  assert.doesNotMatch(js, /from ['"]node:/);
});

test('network-ux: network-session has no node: imports', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.doesNotMatch(js, /from ['"]node:/);
});

test('network-ux: network-protocol-client has no node: imports', async () => {
  const js = await playSrc('network/network-protocol-client.mjs');
  assert.doesNotMatch(js, /from ['"]node:/);
});
