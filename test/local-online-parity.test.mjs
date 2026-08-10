// ═══════════════════════════════════════════════════════════════
// local-online-parity.test.mjs
// v0.25 Phase D: Local vs Online rendering parity matrix.
//
// Verifies that the renderer and play-app treat local and network
// sessions through the same code path, and that the documented
// differences are intentional (not bugs).
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');

// ── Static parity: shared rendering path ──

test('play-app uses a single renderActiveMatch for both local and network', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // renderNetworkActiveMatch delegates to renderActiveMatch for board rendering
  assert.match(src, /await renderActiveMatch\(container\)/, 'renderNetworkActiveMatch must delegate to renderActiveMatch');
  // state.session is assigned from networkSession for board-events transparency
  assert.match(src, /state\.session\s*=\s*session/, 'network session must be assigned to state.session');
});

test('ranked-duel-renderer receives isNetworkMatch flag for mode labeling', async () => {
  const src = await read('apps/lab-web/src/play/ranked-duel-renderer.mjs');
  // The renderer must handle isNetworkMatch for mode labeling
  assert.match(src, /isNetworkMatch/, 'renderer must handle isNetworkMatch option');
  // Network matches show ONLINE · DIRECT DUEL mode
  assert.match(src, /ONLINE.*DIRECT DUEL/, 'renderer must label network matches as ONLINE · DIRECT DUEL');
});

test('board-events uses state.session transparently for action submission', async () => {
  const src = await read('apps/lab-web/src/play/board-events.js');
  // Action submission uses state.session.submitHumanAction — works for both session types
  assert.match(src, /state\.session\.submitHumanAction/, 'action submission must use state.session');
  // Chat send routes to networkSession when available
  assert.match(src, /state\.networkSession.*sendChatMessage/, 'chat send must route to networkSession for online matches');
});

test('NetworkPlaySession implements getSnapshot() compatible with PlaySession', async () => {
  const src = await read('apps/lab-web/src/play/network/network-session.mjs');
  // Must implement getSnapshot()
  assert.match(src, /getSnapshot\(\)/, 'NetworkPlaySession must implement getSnapshot()');
  // Snapshot must include playerView and decision (same shape as PlaySession)
  assert.match(src, /playerView/, 'snapshot must include playerView');
  assert.match(src, /decision/, 'snapshot must include decision');
});

test('NetworkPlaySession implements submitHumanAction() compatibility shim', async () => {
  const src = await read('apps/lab-web/src/play/network/network-session.mjs');
  // Must implement submitHumanAction as a compatibility shim
  assert.match(src, /submitHumanAction/, 'NetworkPlaySession must implement submitHumanAction');
});

test('chat messages merge from networkSession when available', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // Renderer must use networkSession.chatMessages when available
  assert.match(src, /networkSession\?\.chatMessages/, 'renderer must use networkSession.chatMessages for online matches');
});

// ── Documented intentional differences ──

test('network matches do not autosave to IndexedDB (server-side persistence instead)', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // startAutosave is only called for local matches, not network matches
  // This is intentional — the server persists match state durably via SqliteMatchStore
  assert.match(src, /startAutosave\(\)/, 'startAutosave must exist for local matches');
  // Extract the renderNetworkActiveMatch function body precisely
  const fnStart = src.indexOf('async function renderNetworkActiveMatch');
  const fnEnd = src.indexOf('function bindNetworkReconnectEvents', fnStart);
  const networkSection = src.substring(fnStart, fnEnd);
  assert.doesNotMatch(networkSection, /startAutosave/, 'network flow must not call startAutosave (server persists)');
});

test('network terminal shows download replay, local shows rematch', async () => {
  const src = await read('apps/lab-web/src/play/ranked-duel-terminal.mjs');
  // Network terminal: download certified replay
  assert.match(src, /download-replay/, 'network terminal must show download-replay button');
  // Local terminal: rematch same seed
  assert.match(src, /rematch-same-seed|new-seed/, 'local terminal must show rematch/new-seed buttons');
});

test('network matches do not initialize tutorial (tutorials are single-player learning)', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // Tutorial is only initialized in startTutorial, not in network flows
  // This is intentional — tutorials teach mechanics against AI, not human opponents
  assert.match(src, /new TutorialRuntime/, 'tutorial must exist for local play');
  // Extract the renderNetworkActiveMatch function body precisely
  const fnStart = src.indexOf('async function renderNetworkActiveMatch');
  const fnEnd = src.indexOf('function bindNetworkReconnectEvents', fnStart);
  const networkSection = src.substring(fnStart, fnEnd);
  assert.doesNotMatch(networkSection, /TutorialRuntime/, 'network flow must not initialize tutorial');
});

test('inspector and advanced card rules work for both local and network', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // Inspector state is UI-level, not session-specific
  assert.match(src, /inspectorCardId/, 'inspector state must exist');
  // Advanced card rules dialog is available for both session types
  assert.match(src, /openAdvancedCardRules/, 'advanced card rules must be available');
});

test('guidance mode is loaded from global preference for both local and network', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // Guidance mode is loaded once on first entry, applies to all match types
  assert.match(src, /guidanceMode/, 'guidance mode must exist');
  assert.match(src, /guidancePrefLoaded/, 'guidance preference loading must exist');
});

// ── Protocol parity ──

test('network-protocol-client exports all required client builders', async () => {
  const src = await read('apps/lab-web/src/play/network/network-protocol-client.mjs');
  const requiredExports = [
    'createMatch', 'joinMatch', 'resumeMatch', 'ready', 'submitAction',
    'requestSync', 'leaveMatch', 'queueJoin', 'queueLeave',
    'spectateMatch', 'spectateLeave', 'matchHistory', 'sendChat',
  ];
  for (const name of requiredExports) {
    assert.match(src, new RegExp(`export function ${name}\\b`), `must export ${name}`);
  }
});

test('network-protocol package exports chat builders and validators', async () => {
  const src = await read('packages/network-protocol/src/protocol.mjs');
  assert.match(src, /export function sendChat/, 'must export sendChat builder');
  assert.match(src, /export function chatMessage/, 'must export chatMessage builder');
  assert.match(src, /validateSendChat/, 'must export validateSendChat');
});

test('server handles SEND_CHAT and broadcasts CHAT_MESSAGE', async () => {
  const src = await read('apps/match-server/src/server.mjs');
  assert.match(src, /case 'SEND_CHAT'/, 'server must route SEND_CHAT');
  assert.match(src, /function handleSendChat/, 'server must implement handleSendChat');
  assert.match(src, /chatMessage\(/, 'server must broadcast chatMessage');
});
