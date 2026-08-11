import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playSrc = (rel) => readFile(path.join(root, 'apps/lab-web/src/play', rel), 'utf8');

// ═══════════════════════════════════════════════════════════════
// Action Presenter Tests (pure data module — works in Node.js)
// ═══════════════════════════════════════════════════════════════

test('action-presenter: familyLabel covers all known engine families', async () => {
  const { familyLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  const knownFamilies = [
    'draw', 'score', 'play-for-points', 'scuttle', 'swap-bar',
    'counter', 'disrupt', 'instant', 'quick', 'interrupt',
    'response-decline', 'exhausted-pass', 'phase', 'private-choice',
    'effect-three', 'effect-four', 'effect-five', 'effect-six',
    'effect-seven', 'effect-nine', 'effect-ace', 'effect-red-joker',
    'effect-board-lock', 'effect-row-clear', 'effect-bounce',
    'effect-tap', 'effect-goal-shift', 'effect-jack-control',
    'effect-private-choice', 'anchor', 'anchor-guard',
    'anchor-private-choice', 'attachment', 'rank10', 'ultra',
    'voltage', 'solo-wild',
  ];
  for (const family of knownFamilies) {
    const label = familyLabel(family);
    assert.ok(label, `family "${family}" must have a label`);
    assert.notEqual(label, null, `family "${family}" must not return null`);
  }
});

test('action-presenter: familyLabel returns null for unknown families', async () => {
  const { familyLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.equal(familyLabel('nonexistent-family'), null);
});

test('action-presenter: modeLabel handles static modes', async () => {
  const { modeLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.equal(modeLabel('draw', 'top'), 'from top of Draw Pile');
  assert.equal(modeLabel('score', 'points'), 'to Point Row');
  assert.equal(modeLabel('response-decline', 'decline'), 'decline to respond');
});

test('action-presenter: modeLabel handles dynamic voltage modes', async () => {
  const { modeLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  const label = modeLabel('voltage', 'four-guess-10-♠');
  assert.ok(label.includes('guess'), `voltage guess mode should include "guess", got: ${label}`);
});

test('action-presenter: modeLabel handles dynamic private-choice modes', async () => {
  const { modeLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.match(modeLabel('private-choice', 'select-C-001'), /select/);
  assert.match(modeLabel('private-choice', 'take-C-012'), /take/);
  assert.match(modeLabel('private-choice', 'keep-all-discard-C-008'), /keep all/);
  assert.match(modeLabel('private-choice', 'keep-return-bottom-C-012-C-014'), /keep.*bottom/);
});

test('action-presenter: modeLabel handles rank-7 generated modes', async () => {
  const { modeLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.match(modeLabel('private-choice', 'rank7-generated-ace-anchor'), /generated Ace anchor/);
  assert.match(modeLabel('private-choice', 'rank7-generated-four-row-clear'), /generated Four row clear/);
});

test('action-presenter: actionLabel combines family and mode', async () => {
  const { actionLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  const label = actionLabel({ family: 'draw', mode: 'top' });
  assert.match(label, /Draw/);
  assert.match(label, /top/);
});

test('action-presenter: shortActionLabel returns compact label', async () => {
  const { shortActionLabel } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.equal(shortActionLabel({ family: 'draw' }), 'Draw');
  assert.equal(shortActionLabel({ family: 'response-decline' }), 'Decline response');
  assert.equal(shortActionLabel({ family: 'exhausted-pass' }), 'Exhausted Pass — forced');
});

test('action-presenter: classifyDecisionKind categorizes actions correctly', async () => {
  const { classifyDecisionKind } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.equal(classifyDecisionKind({ family: 'draw', timingClass: 'ACTION' }), 'ACTION');
  assert.equal(classifyDecisionKind({ family: 'counter' }), 'RESPONSE');
  assert.equal(classifyDecisionKind({ family: 'private-choice' }), 'PRIVATE_CHOICE');
  assert.equal(classifyDecisionKind({ family: 'exhausted-pass' }), 'EXHAUSTED_PASS');
  assert.equal(classifyDecisionKind({ family: 'phase' }), 'PHASE');
  assert.equal(classifyDecisionKind({ family: 'instant', timingClass: 'INSTANT' }), 'RESPONSE');
  assert.equal(classifyDecisionKind(null), 'UNKNOWN');
});

test('action-presenter: isResponseFamily identifies response families', async () => {
  const { isResponseFamily } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.ok(isResponseFamily('counter'));
  assert.ok(isResponseFamily('disrupt'));
  assert.ok(isResponseFamily('response-decline'));
  assert.ok(!isResponseFamily('draw'));
  assert.ok(!isResponseFamily('score'));
});

test('action-presenter: isExhaustedPass and isResponseDecline are distinct', async () => {
  const { isExhaustedPass, isResponseDecline } = await import('../apps/lab-web/src/play/action-presenter.js');
  assert.ok(isExhaustedPass({ family: 'exhausted-pass' }));
  assert.ok(!isExhaustedPass({ family: 'response-decline' }));
  assert.ok(isResponseDecline({ family: 'response-decline' }));
  assert.ok(!isResponseDecline({ family: 'exhausted-pass' }));
});

test('action-presenter: presentAction returns full presentation object', async () => {
  const { presentAction } = await import('../apps/lab-web/src/play/action-presenter.js');
  const action = {
    actionId: 'draw:top:C-001',
    family: 'draw',
    mode: 'top',
    timingClass: 'ACTION',
    sourceHandles: ['C-001'],
    targetHandles: [],
    featureVector: { cost: 1 },
    commandHash: 'abc123',
  };
  const presented = presentAction(action, null);
  assert.equal(presented.actionId, 'draw:top:C-001');
  assert.equal(presented.family, 'draw');
  assert.ok(presented.label);
  assert.ok(presented.shortLabel);
  assert.ok(presented.summary);
  assert.equal(presented.kind, 'ACTION');
  assert.ok(!presented.isResponse);
  assert.ok(!presented.isDecline);
  assert.ok(!presented.isExhaustedPass);
  assert.deepEqual(presented.sourceHandles, ['C-001']);
});

test('action-presenter: priorityExplainer provides guidance', async () => {
  const { priorityExplainer } = await import('../apps/lab-web/src/play/action-presenter.js');
  const view = { stack: [] };
  assert.ok(priorityExplainer(view, 'ACTION', true));
  assert.ok(priorityExplainer(view, 'RESPONSE', true));
  assert.ok(priorityExplainer(view, 'AI_THINKING', false));
  assert.ok(priorityExplainer(view, 'TERMINAL', false));
});

test('action-presenter: auditPresentationCoverage identifies uncovered families', async () => {
  const { auditPresentationCoverage } = await import('../apps/lab-web/src/play/action-presenter.js');
  const actions = [
    { actionId: 'a1', family: 'draw', mode: 'top' },
    { actionId: 'a2', family: 'nonexistent', mode: 'xyz' },
  ];
  const result = auditPresentationCoverage(actions);
  assert.equal(result.covered.length, 1);
  assert.equal(result.uncovered.length, 1);
  assert.equal(result.uncovered[0].family, 'nonexistent');
});

// ═══════════════════════════════════════════════════════════════
// Privacy Tests (pure data module — works in Node.js)
// ═══════════════════════════════════════════════════════════════

test('play-privacy: validateSnapshotPrivacy rejects forbidden fields', async () => {
  const { validateSnapshotPrivacy } = await import('../apps/lab-web/src/play/play-privacy.js');
  const bad = { rng: {}, seed: 123, cards: {}, playerView: {} };
  const result = validateSnapshotPrivacy(bad);
  assert.ok(!result.valid, 'snapshot with forbidden fields should fail');
  assert.ok(result.violations.length > 0, 'should have violations');
});

test('play-privacy: validateSnapshotPrivacy accepts clean snapshot', async () => {
  const { validateSnapshotPrivacy } = await import('../apps/lab-web/src/play/play-privacy.js');
  const clean = {
    sessionId: 'S-test',
    status: 'HUMAN_DECISION',
    playerView: {
      own: { hand: [], pr: [], er: [] },
      opponents: [{ handCount: 5, pr: [], er: [] }],
    },
    decision: { legalActions: [{ actionId: 'a1', family: 'draw' }] },
  };
  const result = validateSnapshotPrivacy(clean);
  assert.ok(result.valid, `clean snapshot should pass: ${result.violations.join(', ')}`);
});

test('play-privacy: validateSnapshotPrivacy rejects command in legal actions', async () => {
  const { validateSnapshotPrivacy } = await import('../apps/lab-web/src/play/play-privacy.js');
  const bad = {
    decision: { legalActions: [{ actionId: 'a1', command: { type: 'DRAW' } }] },
  };
  const result = validateSnapshotPrivacy(bad);
  assert.ok(!result.valid, 'snapshot with command bodies should fail');
  assert.ok(result.violations.some(v => v.includes('ACTION_CONTAINS_COMMAND')));
});

test('play-privacy: differentialPrivacyCheck identifies identical views', async () => {
  const { differentialPrivacyCheck } = await import('../apps/lab-web/src/play/play-privacy.js');
  const viewA = {
    own: { hand: [{ id: 'C-001', identity: 'A♣' }], goal: 21 },
    opponents: [{ handCount: 5, goal: 21 }],
  };
  const viewB = {
    own: { hand: [{ id: 'C-001', identity: 'A♣' }], goal: 21 },
    opponents: [{ handCount: 5, goal: 21 }],
  };
  const result = differentialPrivacyCheck(viewA, viewB);
  assert.ok(result.identical, 'identical views should be detected as identical');
});

// ═══════════════════════════════════════════════════════════════
// Replay Library Tests (pure data module — works in Node.js)
// ═══════════════════════════════════════════════════════════════

test('replay-library: exportReplayJSON produces valid JSON for private export', async () => {
  const { exportReplayJSON } = await import('../apps/lab-web/src/play/replay-library.js');
  const record = {
    replayId: 'R-test',
    completedAt: '2025-01-01T00:00:00Z',
    profileId: 'core-advanced-authority',
    seed: 12345,
    humanPlayerId: 'P1',
    aiPolicyId: 'random-legal',
    winner: 'P1',
    certifiedReplay: { format: 'intrilex-replay', version: 2 },
    certifiedReplayHash: 'abc',
    publicView: { format: 'intrilex-public-replay', version: 2 },
    publicViewHash: 'def',
  };
  const json = exportReplayJSON(record, 'private');
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'intrilex-private-replay-export');
  assert.equal(parsed.replayId, 'R-test');
  assert.ok(parsed.certifiedReplay, 'private export must include certified replay');
});

test('replay-library: exportReplayJSON produces valid JSON for public export', async () => {
  const { exportReplayJSON } = await import('../apps/lab-web/src/play/replay-library.js');
  const record = {
    replayId: 'R-test',
    completedAt: '2025-01-01T00:00:00Z',
    profileId: 'core-advanced-authority',
    winner: 'P1',
    publicView: { format: 'intrilex-public-replay', version: 2 },
    publicViewHash: 'def',
  };
  const json = exportReplayJSON(record, 'public');
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'intrilex-public-replay-export');
  assert.equal(parsed.replayId, 'R-test');
  assert.ok(parsed.publicView, 'public export must include public view');
  assert.ok(!parsed.certifiedReplay, 'public export must NOT include certified replay');
  assert.ok(!parsed.seed, 'public export must NOT include seed');
});

test('replay-library: renderReplayLibrary renders empty state', async () => {
  const { renderReplayLibrary } = await import('../apps/lab-web/src/play/replay-library.js');
  const html = renderReplayLibrary([]);
  assert.match(html, /No completed matches/);
});

test('replay-library: renderReplayLibrary renders table with replays', async () => {
  const { renderReplayLibrary } = await import('../apps/lab-web/src/play/replay-library.js');
  const summaries = [{
    replayId: 'R-1',
    completedAt: '2025-01-01T00:00:00Z',
    profileId: 'core-advanced-authority',
    winner: 'P1',
    fullTurnSequence: 10,
    decisionCount: 25,
    aiPolicyId: 'random-legal',
    certified: true,
  }];
  const html = renderReplayLibrary(summaries);
  assert.match(html, /replay-table/);
  assert.match(html, /R-1/);
});

// ═══════════════════════════════════════════════════════════════
// Static File Tests (verify source code patterns)
// ═══════════════════════════════════════════════════════════════

test('play module: all play source files exist', async () => {
  const files = [
    'action-presenter.js', 'play-controller.js', 'ranked-duel-renderer.mjs',
    'persistence.js', 'replay-library.js',
    'play-privacy.js', 'play-app.js', 'play-v3.css', 'save-integrity.js',
  ];
  for (const file of files) {
    const content = await playSrc(file);
    assert.ok(content.length > 0, `${file} should not be empty`);
  }
});

test('play module: action-presenter has no node: imports', async () => {
  const js = await playSrc('action-presenter.js');
  assert.doesNotMatch(js, /node:/, 'action-presenter must not import node: modules');
});

test('play module: play-controller has no node: imports', async () => {
  const js = await playSrc('play-controller.js');
  assert.doesNotMatch(js, /node:/, 'play-controller must not import node: modules');
});

test('play module: persistence has no node: imports', async () => {
  const js = await playSrc('persistence.js');
  assert.doesNotMatch(js, /node:/, 'persistence must not import node: modules');
});

test('play module: play-renderer-v3 exports renderBoard and renderNewMatchSetup', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /export function renderBoard/);
  // renderNewMatchSetup is in ranked-duel-hub.mjs, re-exported
  assert.match(js, /renderNewMatchSetup/);
  const hubJs = await playSrc('ranked-duel-hub.mjs');
  assert.match(hubJs, /export function renderNewMatchSetup/);
});

test('play module: play-app exports handlePlayRoute', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /export async function handlePlayRoute/);
  assert.match(js, /export function cleanupPlay/);
});

test('play module: play-controller exports createSession and restoreSession', async () => {
  const js = await playSrc('play-controller.js');
  assert.match(js, /export async function createSession/);
  assert.match(js, /export async function restoreSession/);
  assert.match(js, /export class PlaySession/);
  assert.match(js, /export const SessionState/);
});

test('play module: play-controller has command vault pattern', async () => {
  const js = await playSrc('play-controller.js');
  assert.match(js, /commandVault/, 'must have commandVault');
  assert.match(js, /commandVault\.get/, 'must resolve through vault');
  assert.match(js, /commandVault\.has/, 'must check vault for action existence');
});

test('play module: play-controller has staleness checking', async () => {
  const js = await playSrc('play-controller.js');
  assert.match(js, /STALE_REVISION/);
  assert.match(js, /STALE_FRAME/);
  assert.match(js, /stateRevision/);
  assert.match(js, /frameHash/);
});

test('play module: play-controller has save envelope format', async () => {
  const js = await playSrc('play-controller.js');
  assert.match(js, /intrilex-player-save/);
  assert.match(js, /playerRuntimeVersion/);
  assert.match(js, /contentHash/);
  assert.match(js, /decisionJournal/);
  assert.match(js, /stableBoundary/);
});

test('play module: play-controller has certified replay support', async () => {
  const js = await playSrc('play-controller.js');
  assert.match(js, /createCertifiedReplay/);
  assert.match(js, /verifyCertifiedReplay/);
  assert.match(js, /publicCertifiedReplayView/);
});

test('play module: play-v3.css has responsive breakpoints', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /1366/);
  assert.match(css, /768/);
  assert.match(css, /390/);
  assert.match(css, /prefers-reduced-motion/);
});

test('play module: play-v3.css has focus-visible styles', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /focus-visible/);
});

test('play module: app.js lazy-loads play module', async () => {
  const js = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.match(js, /import\('\.\/play\/play-app\.js'\)/);
  assert.match(js, /renderPlayMode/);
  assert.match(js, /isPlayRoute/);
});

test('play module: app.js skips Observatory boot for play routes', async () => {
  const js = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.match(js, /if\s*\(isPlayRoute\(r\)\)/);
});

test('play module: persistence has IndexedDB stores', async () => {
  const js = await playSrc('persistence.js');
  assert.match(js, /SAVES/);
  assert.match(js, /REPLAYS/);
  assert.match(js, /PREFERENCES/);
  assert.match(js, /QUARANTINE/);
});

test('play module: persistence has autosave and quarantine support', async () => {
  const js = await playSrc('persistence.js');
  assert.match(js, /getAutosave/);
  assert.match(js, /quarantineSave/);
});

test('play module: play-privacy has DOM leak checking', async () => {
  const js = await playSrc('play-privacy.js');
  assert.match(js, /checkDOMForHiddenInfo/);
  assert.match(js, /ARIA_LEAK/);
  assert.match(js, /TEXT_LEAK/);
});

test('play module: play-renderer-v3 has data-testid attributes', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /data-testid/);
});

test('play module: play-renderer-v3 has ARIA labels', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /aria-label/);
  assert.match(js, /aria-live/);
});

test('play module: play-renderer-v3 has priority explainer', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /why-can-i-act/);
});

test('play module: play-renderer-v3 has terminal and error states', async () => {
  // Terminal/error states are now in ranked-duel-terminal.mjs, imported by the main renderer
  const js = await playSrc('ranked-duel-terminal.mjs');
  assert.match(js, /renderTerminal/);
  assert.match(js, /renderError/);
  assert.match(js, /watch-replay/);
  assert.match(js, /rematch-same-seed/);
});

test('play module: ranked-duel-renderer has download-replay button for network matches', async () => {
  const js = await playSrc('ranked-duel-terminal.mjs');
  assert.match(js, /download-replay/, 'must have download-replay action');
  assert.match(js, /isNetworkMatch/, 'must check isNetworkMatch option');
});

test('play module: board-events handles download-replay action', async () => {
  const js = await playSrc('board-events.js');
  assert.match(js, /download-replay/, 'must handle download-replay action');
  assert.match(js, /createNetworkReplayRecord/, 'must use createNetworkReplayRecord for network replays');
});

test('play module: network-session has getReplay method and replayUrl property', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /async getReplay/, 'must have async getReplay method');
  assert.match(js, /replayUrl/, 'must store replayUrl from REPLAY_AVAILABLE');
  assert.match(js, /replayHash/, 'must store replayHash from REPLAY_AVAILABLE');
  assert.match(js, /REPLAY_AVAILABLE/, 'must handle REPLAY_AVAILABLE message type');
  assert.match(js, /GET_REPLAY/, 'must send GET_REPLAY request type');
});

test('play module: network-session verifies replay hash via SHA-256', async () => {
  const js = await playSrc('network/network-session.mjs');
  assert.match(js, /_computeReplayHash/, 'must have _computeReplayHash method');
  assert.match(js, /SHA-256/, 'must use SHA-256 for hash verification');
  assert.match(js, /crypto\.subtle\.digest/, 'must use Web Crypto API');
  assert.match(js, /hash mismatch/i, 'must warn on hash mismatch');
});

test('play module: replay-library has createNetworkReplayRecord function', async () => {
  const js = await playSrc('replay-library.js');
  assert.match(js, /export async function createNetworkReplayRecord/, 'must export createNetworkReplayRecord');
  assert.match(js, /isNetworkMatch/, 'must mark network replay records with isNetworkMatch flag');
  assert.match(js, /network-duel/, 'must use network-duel mode for network replays');
});

test('play module: board-events saves network replay to IndexedDB', async () => {
  const js = await playSrc('board-events.js');
  assert.match(js, /createNetworkReplayRecord/, 'must call createNetworkReplayRecord for network replays');
  assert.match(js, /saveReplay/, 'must save network replay to local library');
});

// ═══════════════════════════════════════════════════════════════
// Engine Adapter Integration Tests (using Node.js packages)
// ═══════════════════════════════════════════════════════════════

test('play integration: engine adapter creates and advances simulation state', async () => {
  const { createSimulationState,  createSimulationDecisionFrame } = await import('@intrilex/engine-adapter');
  const state = createSimulationState({
    profileId: 'core-advanced-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed: 12345,
  });
  assert.ok(state, 'state must be created');
  const frame = createSimulationDecisionFrame(state);
  assert.ok(frame, 'decision frame must be created');
  assert.ok(frame.policyActions !== undefined, 'frame must have policy actions');
  if (frame.status === 'PLAYER_DECISION_REQUIRED') {
    assert.ok(frame.legalActionFrame, 'must have legal action frame');
    assert.ok(frame.resolve, 'must have resolve function');
  }
});

test('play integration: strictPolicyView hides opponent hand identities', async () => {
  const { createSimulationState, advanceSimulationToDecision, strictPolicyView } = await import('@intrilex/engine-adapter');
  const state = createSimulationState({
    profileId: 'core-advanced-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed: 77,
  });
  const advanced = advanceSimulationToDecision(state);
  if (advanced.status === 'PLAYER_DECISION_REQUIRED') {
    const view = strictPolicyView(advanced.state, 'P1');
    assert.ok(view.own, 'must have own info');
    assert.ok(view.opponents, 'must have opponents info');
    for (const opp of view.opponents) {
      assert.ok(opp.handCount !== undefined, 'opponent must have handCount');
      // Opponent should NOT have hand array with card identities
      assert.ok(!opp.hand || opp.hand.length === 0, 'opponent hand must not expose card identities');
    }
  }
});

test('play integration: certified replay creation and verification', async () => {
  const { createSimulationState, executeSimulationAction, createSimulationDecisionFrame, createAuthorityCertifiedReplay, verifyAuthorityCertifiedReplay } = await import('@intrilex/engine-adapter');
  const state = createSimulationState({
    profileId: 'core-advanced-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed: 42,
  });
  // Execute a few commands
  const commands = [];
  let currentState = state;
  for (let i = 0; i < 5; i++) {
    const frame = createSimulationDecisionFrame(currentState);
    if (frame.status !== 'PLAYER_DECISION_REQUIRED') break;
    if (frame.policyActions.length === 0) break;
    const action = frame.policyActions[0];
    const command = frame.resolve(action.actionId);
    if (!command) break;
    commands.push(command);
    const result = executeSimulationAction(currentState, command);
    currentState = result.state;
  }
  if (commands.length > 0) {
    const replay = createAuthorityCertifiedReplay('test-fixture', state, commands, '4.2.6');
    assert.ok(replay.contentHash, 'replay must have content hash');
    assert.ok(replay.integrityHash, 'replay must have integrity hash');
    const verified = verifyAuthorityCertifiedReplay(replay);
    assert.ok(verified, 'replay must verify');
  }
});

test('play integration: public replay view redacts private info', async () => {
  const { createSimulationState, createSimulationDecisionFrame, createAuthorityCertifiedReplay, publicAuthorityCertifiedReplayView } = await import('@intrilex/engine-adapter');
  const state = createSimulationState({
    profileId: 'core-advanced-authority',
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed: 99,
  });
  const frame = createSimulationDecisionFrame(state);
  const commands = [];
  if (frame.status === 'PLAYER_DECISION_REQUIRED' && frame.policyActions.length > 0) {
    const command = frame.resolve(frame.policyActions[0].actionId);
    if (command) commands.push(command);
  }
  if (commands.length > 0) {
    const replay = createAuthorityCertifiedReplay('test-fixture', state, commands, '4.2.6');
    const publicView = publicAuthorityCertifiedReplayView(replay);
    assert.ok(publicView.publicContentHash, 'public view must have content hash');
    // Public view should not contain private choice submissions
    const publicJson = JSON.stringify(publicView);
    assert.ok(!publicJson.includes('"submission"'), 'public view must not contain private submissions');
  }
});
