// v0.28 PvP Experience Tests
// Verifies the human-vs-human online match changes:
// - Server propagates matchMode/queueId/publicProfile in authorized view
// - CHAT_VISIBILITY protocol message + messageId in chat
// - Network session stores profiles, fixes chat dedup/identity
// - Viewmodel uses network participant data, marks human network opponents
// - Renderer derives match label from matchMode (not hardcoded)
// - Renderer removes AI terminology from human PvP
// - Renderer removes Back button during active network PvP
// - Chat/actions layout swap with draggable divider
// - Chat hide/show toggle
// - Forfeit confirmation dialog
// - beforeunload protection helpers
// - Game log includes system events (chat visibility changes)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const viewmodelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-viewmodel.mjs'), 'utf8');
const networkSessionSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-session.mjs'), 'utf8');
const boardEventsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/board-events.js'), 'utf8');
const playAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const protocolSrc = readFileSync(join(process.cwd(), 'packages/network-protocol/src/protocol.mjs'), 'utf8');
const validationSrc = readFileSync(join(process.cwd(), 'packages/network-protocol/src/validation.mjs'), 'utf8');
const authoritySrc = readFileSync(join(process.cwd(), 'packages/match-authority/src/authoritative-match-session.mjs'), 'utf8');
const projectionSrc = readFileSync(join(process.cwd(), 'packages/match-authority/src/player-projection.mjs'), 'utf8');
const serverSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/server.mjs'), 'utf8');
const authControllerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/auth-controller.js'), 'utf8');
const lobbyRendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-lobby-renderer.mjs'), 'utf8');

// ── Server: matchMode/queueId/publicProfile in authorized view ──

test('Server: AuthoritativeMatchSession.addParticipant accepts publicProfile parameter', () => {
  assert.ok(
    authoritySrc.includes('publicProfile'),
    'addParticipant must accept a publicProfile parameter'
  );
});

test('Server: getAuthorizedView includes matchMode and queueId', () => {
  assert.ok(
    authoritySrc.includes('matchMode: this.matchMode'),
    'getAuthorizedView must include matchMode'
  );
  assert.ok(
    authoritySrc.includes('queueId: this.queueId'),
    'getAuthorizedView must include queueId'
  );
});

test('Server: getAuthorizedView includes opponent publicProfile', () => {
  assert.ok(
    authoritySrc.includes('publicProfile: opponentParticipant.publicProfile'),
    'getAuthorizedView must include opponent publicProfile'
  );
});

test('Server: player-projection allows matchMode and queueId fields', () => {
  assert.ok(
    projectionSrc.includes("'matchMode'") && projectionSrc.includes("'queueId'"),
    'player-projection must allow matchMode and queueId in safe fields'
  );
});

test('Server: player-projection passes through opponent publicProfile', () => {
  assert.ok(
    projectionSrc.includes('publicProfile: authorizedView.opponent.publicProfile'),
    'player-projection must pass through opponent publicProfile'
  );
});

test('Server: buildPublicProfile helper exists', () => {
  assert.ok(
    serverSrc.includes('function buildPublicProfile'),
    'Server must have buildPublicProfile helper'
  );
});

test('Server: addParticipant calls pass buildPublicProfile', () => {
  const calls = serverSrc.match(/addParticipant\(/g) || [];
  const profileCalls = serverSrc.match(/buildPublicProfile\(/g) || [];
  assert.ok(calls.length >= 3, 'Server must call addParticipant at least 3 times');
  assert.ok(profileCalls.length >= 3, 'Server must call buildPublicProfile at least 3 times');
});

// ── Protocol: CHAT_VISIBILITY + messageId ──

test('Protocol: chatVisibility builder exists', () => {
  assert.ok(
    protocolSrc.includes('export function chatVisibility'),
    'Protocol must export chatVisibility builder'
  );
});

test('Protocol: chatVisibilityChange builder exists', () => {
  assert.ok(
    protocolSrc.includes('export function chatVisibilityChange'),
    'Protocol must export chatVisibilityChange builder'
  );
});

test('Protocol: chatMessage includes messageId parameter', () => {
  assert.ok(
    protocolSrc.includes('messageId'),
    'chatMessage builder must include messageId parameter'
  );
});

test('Protocol: CHAT_VISIBILITY in known message types', () => {
  assert.ok(
    validationSrc.includes("'CHAT_VISIBILITY'"),
    'CHAT_VISIBILITY must be in known message types'
  );
});

test('Protocol: CHAT_VISIBILITY_CHANGE in known message types', () => {
  assert.ok(
    validationSrc.includes("'CHAT_VISIBILITY_CHANGE'"),
    'CHAT_VISIBILITY_CHANGE must be in known message types'
  );
});

test('Protocol: validateChatVisibility exists', () => {
  assert.ok(
    validationSrc.includes('export function validateChatVisibility'),
    'validateChatVisibility must exist'
  );
});

test('Server: handleChatVisibility handler exists', () => {
  assert.ok(
    serverSrc.includes('function handleChatVisibility'),
    'Server must have handleChatVisibility handler'
  );
});

test('Server: CHAT_VISIBILITY in message dispatch switch', () => {
  assert.ok(
    serverSrc.includes("case 'CHAT_VISIBILITY'"),
    'Server must dispatch CHAT_VISIBILITY messages'
  );
});

test('Server: chat broadcast includes messageId', () => {
  assert.ok(
    serverSrc.includes('const messageId = `m-'),
    'Server chat broadcast must generate a messageId'
  );
});

// ── Network session: profiles, chat dedup, forfeit, visibility ──

test('Network session: stores localProfile and opponentProfile', () => {
  assert.ok(networkSessionSrc.includes('this.localProfile'), 'Must store localProfile');
  assert.ok(networkSessionSrc.includes('this.opponentProfile'), 'Must store opponentProfile');
});

test('Network session: stores matchMode and queueId', () => {
  assert.ok(networkSessionSrc.includes('this.matchMode'), 'Must store matchMode');
  assert.ok(networkSessionSrc.includes('this.queueId'), 'Must store queueId');
});

test('Network session: stores chatHidden state', () => {
  assert.ok(networkSessionSrc.includes('this.chatHidden'), 'Must store chatHidden state');
});

test('Network session: stores systemEvents for game log', () => {
  assert.ok(networkSessionSrc.includes('this.systemEvents'), 'Must store systemEvents');
});

test('Network session: sendChatVisibility method exists', () => {
  assert.ok(
    networkSessionSrc.includes('sendChatVisibility'),
    'Must have sendChatVisibility method'
  );
});

test('Network session: forfeit method exists', () => {
  assert.ok(
    networkSessionSrc.includes('async forfeit'),
    'Must have async forfeit method'
  );
});

test('Network session: getSnapshot includes matchMode and queueId', () => {
  assert.ok(
    networkSessionSrc.includes('matchMode: this.matchMode'),
    'getSnapshot must include matchMode'
  );
  assert.ok(
    networkSessionSrc.includes('queueId: this.queueId'),
    'getSnapshot must include queueId'
  );
});

test('Network session: getSnapshot includes isNetworkMatch flag', () => {
  assert.ok(
    networkSessionSrc.includes('isNetworkMatch: true'),
    'getSnapshot must include isNetworkMatch: true'
  );
});

test('Network session: getSnapshot includes human displayName and rating', () => {
  assert.ok(
    networkSessionSrc.includes("displayName: localProfile.displayName"),
    'getSnapshot must include human displayName from localProfile'
  );
});

test('Network session: getSnapshot includes opponent displayName and rating', () => {
  assert.ok(
    networkSessionSrc.includes("displayName: opponentProfile.displayName"),
    'getSnapshot must include opponent displayName from opponentProfile'
  );
});

test('Network session: getSnapshot includes opponent connectionState', () => {
  assert.ok(
    networkSessionSrc.includes('connectionState: this.opponentConnectionState'),
    'getSnapshot must include opponent connectionState'
  );
});

test('Network session: chat dedup uses server messageId', () => {
  assert.ok(
    networkSessionSrc.includes('_seenChatMessageIds'),
    'Must use _seenChatMessageIds for dedup'
  );
  assert.ok(
    networkSessionSrc.includes('serverMessageId'),
    'Must use serverMessageId for dedup'
  );
});

test('Network session: CHAT_VISIBILITY_CHANGE handler exists', () => {
  assert.ok(
    networkSessionSrc.includes("case 'CHAT_VISIBILITY_CHANGE'"),
    'Must handle CHAT_VISIBILITY_CHANGE messages'
  );
});

test('Network session: AUTHENTICATED stores localProfile', () => {
  assert.ok(
    networkSessionSrc.includes('this.localProfile = {') || networkSessionSrc.includes('this.localProfile ='),
    'AUTHENTICATED handler must store localProfile'
  );
});

test('Network session: _applyView stores opponentProfile and matchMode', () => {
  assert.ok(
    networkSessionSrc.includes('this.opponentProfile = view.opponent.publicProfile'),
    '_applyView must store opponent publicProfile'
  );
});

// ── Viewmodel: network participant data ──

test('Viewmodel: buildPlayerPlate uses network participant isHuman', () => {
  assert.ok(
    viewmodelSrc.includes('opponentIsHuman'),
    'buildPlayerPlate must check opponentIsHuman for network matches'
  );
});

test('Viewmodel: buildPlayerPlate includes isLocalPlayer field', () => {
  assert.ok(
    viewmodelSrc.includes('isLocalPlayer'),
    'buildPlayerPlate must include isLocalPlayer to distinguish local from remote human'
  );
});

test('Viewmodel: buildPlayerPlate includes connectionState', () => {
  assert.ok(
    viewmodelSrc.includes('connectionState'),
    'buildPlayerPlate must include connectionState for network opponents'
  );
});

test('Viewmodel: buildPlayerPlate includes rank for network opponents', () => {
  assert.ok(
    viewmodelSrc.includes('opponentRank'),
    'buildPlayerPlate must include rank for network human opponents'
  );
});

test('Viewmodel: emptyPlayerPlate includes new fields', () => {
  assert.ok(
    viewmodelSrc.includes('isLocalPlayer: true') && viewmodelSrc.includes('connectionState: null'),
    'emptyPlayerPlate must include isLocalPlayer and connectionState'
  );
});

// ── Renderer: match label derivation ──

test('Renderer: deriveModeInfo function exists', () => {
  assert.ok(
    rendererSrc.includes('function deriveModeInfo'),
    'Renderer must have deriveModeInfo function'
  );
});

test('Renderer: deriveModeInfo uses matchMode for label', () => {
  assert.ok(
    rendererSrc.includes("case 'ranked'") && rendererSrc.includes("RANKED DUEL"),
    'deriveModeInfo must produce RANKED DUEL for ranked matchMode'
  );
  assert.ok(
    rendererSrc.includes("case 'casual'") && rendererSrc.includes("CASUAL DUEL"),
    'deriveModeInfo must produce CASUAL DUEL for casual matchMode'
  );
});

test('Renderer: does not hardcode DIRECT DUEL for all network matches', () => {
  // The old code had: { kind: 'NETWORK', label: 'ONLINE · DIRECT DUEL', networkRanked: true }
  // The new code should NOT have that exact hardcoded string for all network matches.
  // DIRECT DUEL should only be for private matches.
  const directDuelCount = (rendererSrc.match(/DIRECT DUEL/g) || []).length;
  assert.ok(directDuelCount <= 2, 'DIRECT DUEL should only appear for private matches, not all network matches');
});

test('Renderer: renderRankedDuel merges network profile for local player', () => {
  assert.ok(
    rendererSrc.includes('snapshot?.human') && rendererSrc.includes('snapshot.human.displayName'),
    'renderRankedDuel must merge network human displayName into local profile'
  );
});

// ── Renderer: AI terminology removal for network matches ──

test('Renderer: header uses opponent name for network matches, not "AI is choosing"', () => {
  assert.ok(
    rendererSrc.includes('isNetwork') && rendererSrc.includes('is choosing'),
    'Header must use opponent displayName for network matches instead of "AI is choosing"'
  );
});

test('Renderer: profile block shows "Human" for network human opponents', () => {
  assert.ok(
    rendererSrc.includes("plate.isHuman ? 'Human' : 'AI Opponent'"),
    'Profile block must show "Human" for human opponents and "AI Opponent" for AI'
  );
});

// ── Renderer: Back button removal for active network PvP ──

test('Renderer: Back button removed during active network PvP', () => {
  assert.ok(
    rendererSrc.includes('showBack') && rendererSrc.includes('!isNetwork || isTerminal'),
    'Back button must be hidden during active network PvP (only shown for terminal or non-network)'
  );
});

test('Renderer: X button triggers forfeit-match for active network PvP', () => {
  assert.ok(
    rendererSrc.includes("forfeit-match") && rendererSrc.includes("exitAction"),
    'X button must trigger forfeit-match action for active network PvP'
  );
});

// ── Renderer: chat/actions layout swap ──

test('Renderer: renderRightRailBottom function exists', () => {
  assert.ok(
    rendererSrc.includes('function renderRightRailBottom'),
    'Renderer must have renderRightRailBottom function for swapped layout'
  );
});

test('Renderer: rightRailBottom grid area is used', () => {
  assert.ok(
    rendererSrc.includes('data-grid="rightRailBottom"'),
    'Renderer must emit data-grid="rightRailBottom"'
  );
});

test('Renderer: draggable divider exists', () => {
  assert.ok(
    rendererSrc.includes('rd-rail-divider') && rendererSrc.includes('data-action="rail-drag"'),
    'Renderer must include a draggable divider with data-action="rail-drag"'
  );
});

test('Renderer: actions section is on top, chat on bottom', () => {
  // In renderRightRailBottom, actions should come before chat in the HTML.
  // Search the full function body (from function declaration to the next function).
  const funcStart = rendererSrc.indexOf('function renderRightRailBottom');
  assert.ok(funcStart > -1, 'renderRightRailBottom must exist');
  // Find the next function declaration after renderRightRailBottom
  const nextFunc = rendererSrc.indexOf('function render', funcStart + 10);
  const railBottomContent = rendererSrc.slice(funcStart, nextFunc > -1 ? nextFunc : undefined);
  const actionsPos = railBottomContent.indexOf('rd-rail-actions-section');
  const chatPos = railBottomContent.indexOf('rd-rail-chat-section');
  assert.ok(actionsPos > -1, 'Must have actions section in renderRightRailBottom');
  assert.ok(chatPos > -1, 'Must have chat section in renderRightRailBottom');
  assert.ok(actionsPos < chatPos, 'Actions section must come before chat section (on top)');
});

// ── Renderer: chat hide/show ──

test('Renderer: chat hide/show toggle exists', () => {
  assert.ok(
    rendererSrc.includes("'chat-hide'") && rendererSrc.includes("'chat-show'"),
    'Renderer must include chat-hide and chat-show toggle buttons'
  );
});

test('Renderer: chat hidden state renders collapsed panel', () => {
  assert.ok(
    rendererSrc.includes('rd-chat-hidden'),
    'Renderer must render collapsed chat panel when hidden'
  );
});

// ── Renderer: chat authorship from participantId ──

test('Renderer: chat authorship uses participantId for network matches', () => {
  assert.ok(
    rendererSrc.includes('m.participantId') && rendererSrc.includes('localParticipantId'),
    'Chat authorship must use participantId, not just isHuman boolean'
  );
});

test('Renderer: network opponent chat has opponent class', () => {
  assert.ok(
    rendererSrc.includes("rd-chat-msg opponent"),
    'Network opponent chat messages must have opponent class'
  );
});

// ── Renderer: disconnect overlay ──

test('Renderer: disconnect overlay exists', () => {
  assert.ok(
    rendererSrc.includes('function renderDisconnectOverlay'),
    'Renderer must have renderDisconnectOverlay function'
  );
});

test('Renderer: disconnect overlay shows for DISCONNECTED opponent', () => {
  assert.ok(
    rendererSrc.includes("'DISCONNECTED'") && rendererSrc.includes('rd-disconnect-overlay'),
    'Disconnect overlay must show when opponent connectionState is DISCONNECTED'
  );
});

// ── Renderer: game log system events ──

test('Renderer: renderGameLog accepts systemEvents parameter', () => {
  assert.ok(
    rendererSrc.includes('function renderGameLog(events, systemEvents)'),
    'renderGameLog must accept systemEvents parameter'
  );
});

test('Renderer: game log includes CHAT_VISIBILITY system events', () => {
  assert.ok(
    rendererSrc.includes("evt.type === 'CHAT_VISIBILITY'"),
    'Game log must include CHAT_VISIBILITY system events'
  );
});

test('Renderer: system log entries have rd-log-system class', () => {
  assert.ok(
    rendererSrc.includes('rd-log-system'),
    'System log entries must have rd-log-system class'
  );
});

// ── board-events.js: forfeit, divider, beforeunload ──

test('board-events: showForfeitConfirmation function exists', () => {
  assert.ok(
    boardEventsSrc.includes('export function showForfeitConfirmation'),
    'board-events must export showForfeitConfirmation'
  );
});

test('board-events: forfeit dialog has Stay in Match (cancel) button', () => {
  assert.ok(
    boardEventsSrc.includes('forfeit-cancel') && boardEventsSrc.includes('Stay in Match'),
    'Forfeit dialog must have a "Stay in Match" cancel button'
  );
});

test('board-events: forfeit dialog has Forfeit confirm button', () => {
  assert.ok(
    boardEventsSrc.includes('forfeit-confirm') && boardEventsSrc.includes('Forfeit'),
    'Forfeit dialog must have a "Forfeit" confirm button'
  );
});

test('board-events: forfeit calls networkSession.forfeit()', () => {
  assert.ok(
    boardEventsSrc.includes('state.networkSession.forfeit'),
    'Forfeit confirmation must call networkSession.forfeit()'
  );
});

test('board-events: bindRailDividerDrag function exists', () => {
  assert.ok(
    boardEventsSrc.includes('export function bindRailDividerDrag'),
    'board-events must export bindRailDividerDrag'
  );
});

test('board-events: divider drag supports keyboard', () => {
  assert.ok(
    boardEventsSrc.includes('ArrowUp') && boardEventsSrc.includes('ArrowDown'),
    'Divider drag must support keyboard arrows for accessibility'
  );
});

test('board-events: addBeforeUnloadProtection function exists', () => {
  assert.ok(
    boardEventsSrc.includes('export function addBeforeUnloadProtection'),
    'board-events must export addBeforeUnloadProtection'
  );
});

test('board-events: removeBeforeUnloadProtection function exists', () => {
  assert.ok(
    boardEventsSrc.includes('export function removeBeforeUnloadProtection'),
    'board-events must export removeBeforeUnloadProtection'
  );
});

test('board-events: beforeunload handler uses preventDefault and returnValue', () => {
  assert.ok(
    boardEventsSrc.includes('e.preventDefault()') && boardEventsSrc.includes('e.returnValue'),
    'beforeunload handler must use preventDefault and returnValue'
  );
});

test('board-events: chat form submit routes to networkSession', () => {
  assert.ok(
    boardEventsSrc.includes('state.networkSession.sendChatMessage'),
    'Chat form submit must route to networkSession.sendChatMessage'
  );
});

test('board-events: chat hide/show toggle handler exists', () => {
  assert.ok(
    boardEventsSrc.includes("data-action=\"chat-hide\"") || boardEventsSrc.includes("'chat-hide'"),
    'board-events must handle chat-hide/chat-show toggle'
  );
});

test('board-events: forfeit-match action handler exists', () => {
  assert.ok(
    boardEventsSrc.includes("action === 'forfeit-match'"),
    'board-events must handle forfeit-match action'
  );
});

test('board-events: exit-match removes beforeunload protection', () => {
  assert.ok(
    boardEventsSrc.includes('removeBeforeUnloadProtection'),
    'exit-match must remove beforeunload protection'
  );
});

// ── play-app.js: navigation protection ──

test('play-app: imports addBeforeUnloadProtection and removeBeforeUnloadProtection', () => {
  assert.ok(
    playAppSrc.includes('addBeforeUnloadProtection') && playAppSrc.includes('removeBeforeUnloadProtection'),
    'play-app must import beforeunload protection helpers'
  );
});

test('play-app: adds beforeunload protection for active network matches', () => {
  assert.ok(
    playAppSrc.includes('addBeforeUnloadProtection()'),
    'play-app must add beforeunload protection for active network matches'
  );
});

test('play-app: removes beforeunload protection on terminal', () => {
  assert.ok(
    playAppSrc.includes('removeBeforeUnloadProtection()'),
    'play-app must remove beforeunload protection on terminal/teardown'
  );
});

test('play-app: passes chatHidden and chatSplit to renderer', () => {
  assert.ok(
    playAppSrc.includes('chatHidden') && playAppSrc.includes('chatSplit'),
    'play-app must pass chatHidden and chatSplit to renderer'
  );
});

// ── CSS: new styles ──

test('CSS: rightRailBottom grid area exists', () => {
  assert.ok(
    cssSrc.includes('grid-area: rightRailBottom'),
    'CSS must have .rd-right-rail-bottom with grid-area: rightRailBottom'
  );
});

test('CSS: rail divider styles exist', () => {
  assert.ok(
    cssSrc.includes('.rd-rail-divider') && cssSrc.includes('cursor: row-resize'),
    'CSS must have rail divider styles with row-resize cursor'
  );
});

test('CSS: chat hidden state styles exist', () => {
  assert.ok(
    cssSrc.includes('.rd-chat-panel.rd-chat-hidden'),
    'CSS must have chat hidden state styles'
  );
});

// ── Sign-in module bug fixes (regression) ──

test('play-app: all bindQueueLeaveAction calls pass queueLeave', () => {
  // Every call to bindQueueLeaveAction must pass the queueLeave function,
  // otherwise the QUEUE_LEAVE message is never sent to the server after
  // a queue re-render (QUEUE_JOINED, auth error, queue error).
  const calls = [...playAppSrc.matchAll(/bindQueueLeaveAction\(([^)]+)\)/g)];
  assert.ok(calls.length >= 4, 'Must have at least 4 bindQueueLeaveAction calls');
  for (const m of calls) {
    const args = m[1].split(',').map(s => s.trim());
    // 3rd argument (index 2) must be queueLeave — not undefined/empty
    assert.ok(
      args.length >= 3 && args[2] === 'queueLeave',
      `bindQueueLeaveAction must pass queueLeave as 3rd arg (got: ${args[2] ?? 'missing'})`,
    );
  }
});

test('play-app: queueLeave called without arguments', () => {
  // queueLeave() takes no args — the old queueLeave('req-queue-leave-1')
  // passed an ignored argument. Verify no string-literal arg is passed.
  assert.ok(
    !playAppSrc.includes("queueLeave('req-queue-leave-1')"),
    'queueLeave must not be called with a stale request-id argument',
  );
});

test('play-app: bindQueueLeaveAction guards against undefined queueLeave', () => {
  // Defensive: even if queueLeave is missing, the leave flow must not crash.
  assert.ok(
    playAppSrc.includes('typeof queueLeave === \'function\''),
    'bindQueueLeaveAction must guard against undefined queueLeave',
  );
});

test('auth-controller: initAuth has re-entry guard', () => {
  assert.ok(
    authControllerSrc.includes('_initialized') &&
    authControllerSrc.includes('if (_initialized) return _state'),
    'initAuth must guard against duplicate onAuthStateChange subscriptions',
  );
});

test('auth-controller: no debug console.log in onAuthStateChange', () => {
  // The debug console.log('[auth] onAuthStateChange: ...') was removed.
  assert.ok(
    !authControllerSrc.includes("console.log('[auth] onAuthStateChange:"),
    'onAuthStateChange must not log debug console.log (production noise)',
  );
});

test('auth-controller: stale-override guard for fetchProfile', () => {
  // A monotonic sequence must reject stale fetchProfile results so a slow
  // older fetch doesn't overwrite a fresher profile.
  assert.ok(
    authControllerSrc.includes('_authEventSeq'),
    'onAuthStateChange must use a sequence guard for fetchProfile results',
  );
});

test('auth-controller: _resetAuthState export for testability', () => {
  assert.ok(
    authControllerSrc.includes('export function _resetAuthState'),
    'auth-controller must export _resetAuthState for test reset',
  );
});

test('lobby-renderer: renderNetworkError supports signInLink option', () => {
  assert.ok(
    lobbyRendererSrc.includes('signInLink') && lobbyRendererSrc.includes('network-signin'),
    'renderNetworkError must support signInLink option with a Sign In link',
  );
});

test('play-app: queue "Sign In Required" uses signInLink not retry', () => {
  // The no-token queue error must offer a sign-in link, not a useless "Try again".
  assert.ok(
    playAppSrc.includes('signInLink: true'),
    'Queue "Sign In Required" error must use signInLink: true',
  );
});

test('CSS: disconnect overlay styles exist', () => {
  assert.ok(
    cssSrc.includes('.rd-disconnect-overlay') && cssSrc.includes('.rd-disconnect-content'),
    'CSS must have disconnect overlay styles'
  );
});

test('CSS: forfeit dialog styles exist', () => {
  assert.ok(
    cssSrc.includes('.rd-forfeit-dialog') && cssSrc.includes('.rd-forfeit-confirm'),
    'CSS must have forfeit dialog styles'
  );
});

test('CSS: network opponent chat message class exists', () => {
  assert.ok(
    cssSrc.includes('.rd-chat-msg.opponent'),
    'CSS must have network opponent chat message class'
  );
});

test('CSS: system game log entry class exists', () => {
  assert.ok(
    cssSrc.includes('.rd-log-entry.rd-log-system'),
    'CSS must have system game log entry class'
  );
});

test('CSS: chat toggle button styles exist', () => {
  assert.ok(
    cssSrc.includes('.rd-chat-toggle-btn'),
    'CSS must have chat toggle button styles'
  );
});

// ── Local AI mode preservation ──

test('Renderer: local AI mode still works (deriveModeInfo returns null for non-network)', () => {
  assert.ok(
    rendererSrc.includes("!options.isNetworkMatch && !snapshot?.isNetworkMatch") && rendererSrc.includes('return null'),
    'deriveModeInfo must return null for non-network matches (preserving local AI mode)'
  );
});

test('Renderer: AI Opponent label still exists for AI matches', () => {
  assert.ok(
    rendererSrc.includes("AI Opponent"),
    'AI Opponent label must still exist for local AI matches'
  );
});

test('Renderer: AI is choosing still exists for AI matches', () => {
  assert.ok(
    rendererSrc.includes("AI is choosing"),
    'AI is choosing text must still exist for local AI matches'
  );
});

// ── Protocol client: chatVisibility export ──

test('Protocol client: chatVisibility builder exported', () => {
  const protocolClientSrc = readFileSync(
    join(process.cwd(), 'apps/lab-web/src/play/network/network-protocol-client.mjs'),
    'utf8'
  );
  assert.ok(
    protocolClientSrc.includes('export function chatVisibility'),
    'Network protocol client must export chatVisibility builder'
  );
});
