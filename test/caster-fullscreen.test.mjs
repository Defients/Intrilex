// ═══════════════════════════════════════════════════════════════
// test/caster-fullscreen.test.mjs
//
// Regression tests for the Caster Full-Screen Spectator Experience.
// Verifies:
//   - frameStateToSnapshot adapter produces an Astra-format snapshot
//   - cardViewToTableCard conversion (omniscient opponent hand)
//   - Route changes (LANDING_MODES includes /caster)
//   - caster-workspace mounts Astra (mountGameTable) with a custom rail
//   - Old custom board renderer is removed
//
// Source-text-based testing pattern (consistent with v0.28-pvp-experience.test.mjs)
// because caster-workspace.js imports browser-only modules.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = process.cwd();
const casterSrc = readFileSync(join(root, 'apps/lab-web/src/workspaces/caster-workspace.js'), 'utf8');
const routerSrc = readFileSync(join(root, 'apps/lab-web/src/router.js'), 'utf8');
const appSrc = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
const casterCssSrc = readFileSync(join(root, 'apps/lab-web/src/css/caster.css'), 'utf8');

// ── Route changes ──

test('router.js: /caster is in LANDING_MODES', () => {
  assert.match(routerSrc, /LANDING_MODES\s*=\s*new Set\(/);
  assert.match(routerSrc, /'\/caster'/, 'LANDING_MODES must include /caster');
});

test('app.js: handles /caster as full-screen landing mode before LANDING_MODES check', () => {
  // The /caster block must come before the LANDING_MODES.has(r) check
  const casterBlockPos = appSrc.indexOf("if (r === '/caster')");
  const landingModesPos = appSrc.indexOf('if (LANDING_MODES.has(r))');
  assert.ok(casterBlockPos > -1, 'app.js must have a /caster block in render()');
  assert.ok(landingModesPos > -1, 'app.js must have LANDING_MODES check');
  assert.ok(casterBlockPos < landingModesPos, '/caster block must come before LANDING_MODES check');
});

test('app.js: /caster block hides shell and shows landing container', () => {
  const casterBlockPos = appSrc.indexOf("if (r === '/caster')");
  const blockEnd = appSrc.indexOf('if (LANDING_MODES.has(r))', casterBlockPos);
  const block = appSrc.slice(casterBlockPos, blockEnd);
  assert.match(block, /hideShell\(\)/, '/caster block must hide shell');
  assert.match(block, /landingContainer\.style\.display = 'block'/, '/caster block must show landing container');
  assert.match(block, /renderCaster\(landingContainer\)/, '/caster block must render into landingContainer');
});

test('app.js: /caster block loads ranked-duel.css and gameplay-skins.css', () => {
  const casterBlockPos = appSrc.indexOf("if (r === '/caster')");
  const blockEnd = appSrc.indexOf('if (LANDING_MODES.has(r))', casterBlockPos);
  const block = appSrc.slice(casterBlockPos, blockEnd);
  assert.match(block, /ranked-duel\.css/, '/caster block must load ranked-duel.css');
  assert.match(block, /gameplay-skins\.css/, '/caster block must load gameplay-skins.css');
});

test('app.js: /caster removed from observatory renderers map', () => {
  // The observatory renderers map should NOT have /caster
  const renderersPos = appSrc.indexOf("'/watch': renderWatch");
  const renderersEnd = appSrc.indexOf('};', renderersPos);
  const renderersBlock = appSrc.slice(renderersPos, renderersEnd);
  assert.doesNotMatch(renderersBlock, /\/caster.*renderCaster/, 'Observatory renderers map must not include /caster');
});

// ── frameStateToSnapshot adapter ──

test('caster-workspace.js: frameStateToSnapshot is exported', () => {
  assert.match(casterSrc, /export async function frameStateToSnapshot/, 'frameStateToSnapshot must be exported');
});

test('caster-workspace.js: frameStateToSnapshot builds an Astra-format snapshot', () => {
  // Astra's buildSemanticGame consumes { sessionId, status, playerView, human, opponent, match, ... }.
  assert.match(casterSrc, /playerView:\s*pv/, 'adapter must pass strictView output as playerView');
  assert.match(casterSrc, /human:\s*\{\s*playerId/, 'adapter must build human with playerId');
  assert.match(casterSrc, /opponent:\s*\{\s*displayName/, 'adapter must build opponent with displayName');
  assert.match(casterSrc, /match:\s*\{\s*winner:\s*null/, 'adapter must build match with null winner');
  assert.match(casterSrc, /sessionId:/, 'adapter must set sessionId');
  assert.match(casterSrc, /decision:\s*null/, 'adapter must set decision: null (no legal actions for spectator)');
});

test('caster-workspace.js: frameStateToSnapshot sets humanPlayerId to seatOrder[0]', () => {
  assert.match(casterSrc, /humanPlayerId.*seatOrder\[0\]/, 'adapter must set humanPlayerId to seatOrder[0]');
});

test('caster-workspace.js: frameStateToSnapshot keeps status non-TERMINAL (board visible)', () => {
  // The adapter must not set TERMINAL/COMPLETED status or a terminationReason,
  // otherwise Astra would render the terminal screen instead of the board.
  assert.match(casterSrc, /status:\s*'AI_DECISION'/, 'adapter must use a non-terminal status');
  assert.match(casterSrc, /terminationReason:\s*null/, 'adapter must set terminationReason to null');
});

test('caster-workspace.js: frameStateToSnapshot handles public vs omniscient viewer modes', () => {
  assert.match(casterSrc, /omniscient/, 'adapter must check omniscient mode');
  assert.match(casterSrc, /opponentHand/, 'adapter must build opponentHand for omniscient');
  // In public mode, opponentHand stays null (opponent hand concealed — card backs only).
  assert.match(casterSrc, /opponentHand\s*=\s*null/, 'adapter must default opponentHand to null in public mode');
});

test('caster-workspace.js: frameStateToSnapshot passes recentEvents for game log', () => {
  assert.match(casterSrc, /recentEvents/, 'adapter must pass recentEvents for game log');
  assert.match(casterSrc, /visibleEvents/, 'adapter must use beat visibleEvents');
});

test('caster-workspace.js: cardViewToTableCard converts card views to Astra TableCards', () => {
  assert.match(casterSrc, /function cardViewToTableCard/, 'cardViewToTableCard must exist');
  assert.match(casterSrc, /identity:\s*hidden\s*\?\s*null/, 'must conceal identity for hidden cards');
  assert.match(casterSrc, /markers/, 'must build markers array');
  assert.match(casterSrc, /'Tapped'/, 'must map tapped to Tapped marker');
  assert.match(casterSrc, /'Aegis'/, 'must map aegis to Aegis marker');
});

// ── caster-workspace.js mounts Astra ──

test('caster-workspace.js: imports mountGameTable from client/mount', () => {
  assert.match(casterSrc, /import.*mountGameTable.*from.*client\/mount/, 'must import mountGameTable');
  assert.doesNotMatch(casterSrc, /import.*renderRankedDuel.*from.*ranked-duel-renderer/, 'must not import renderRankedDuel');
});

test('caster-workspace.js: renderTheatre mounts Astra with caster rail + opponent hand', () => {
  assert.match(casterSrc, /mountGameTable\(boardHost,\s*snapshot/, 'renderTheatre must mount Astra with the snapshot');
  assert.match(casterSrc, /railHtml/, 'must pass railHtml option');
  assert.match(casterSrc, /opponentHand/, 'must pass opponentHand option');
  assert.match(casterSrc, /submit:\s*async\s*\(\)\s*=>\s*\(\{\s*accepted:\s*false\s*\}\)/, 'must pass a read-only submit (never accepts)');
});

test('caster-workspace.js: renderTheatre updates Astra in place on beat changes', () => {
  assert.match(casterSrc, /tacticalMount\.update\(snapshot/, 'subsequent beats must call tacticalMount.update');
});

test('caster-workspace.js: theatre header carries the exit-caster control', () => {
  assert.match(casterSrc, /data-action="exit-caster"/, 'header must have exit-caster button');
  assert.match(casterSrc, /Back to Observatory/, 'header must show "Back to Observatory" label');
  assert.match(casterSrc, /data-caster="1"/, 'header must carry data-caster="1"');
});

test('caster-workspace.js: old custom renderBoard is removed', () => {
  assert.doesNotMatch(casterSrc, /function renderBoard\(/, 'old renderBoard function must be removed');
  assert.doesNotMatch(casterSrc, /function getBoardStateForBeat\(/, 'old getBoardStateForBeat must be removed');
});

test('caster-workspace.js: buildCasterRightRail builds commentary + transport sections', () => {
  assert.match(casterSrc, /function buildCasterRightRail/, 'buildCasterRightRail must exist');
  assert.match(casterSrc, /caster-rail-commentary-section/, 'must have commentary section');
  assert.match(casterSrc, /caster-rail-transport-section/, 'must have transport section');
  assert.match(casterSrc, /COMMENTARY/, 'must have COMMENTARY header');
  assert.match(casterSrc, /REPLAY CONTROLS/, 'must have REPLAY CONTROLS header');
});

test('caster-workspace.js: right rail includes transport controls', () => {
  assert.match(casterSrc, /caster-prev/, 'must have prev button');
  assert.match(casterSrc, /caster-play/, 'must have play/pause button');
  assert.match(casterSrc, /caster-next/, 'must have next button');
  assert.match(casterSrc, /caster-end/, 'must have skip to end button');
  assert.match(casterSrc, /caster-slider/, 'must have seek slider');
  assert.match(casterSrc, /caster-speed-ctrl/, 'must have speed control');
  assert.match(casterSrc, /caster-timeline/, 'must have timeline');
});

test('caster-workspace.js: right rail includes commentary display with safe text rendering', () => {
  assert.match(casterSrc, /data-testid="caster-commentary"/, 'must have commentary block');
  assert.match(casterSrc, /data-testid="caster-commentary-headline"/, 'must have headline element');
  assert.match(casterSrc, /data-testid="caster-commentary-body"/, 'must have body element');
  assert.match(casterSrc, /textContent.*commentaryHeadline/, 'must render headline via textContent');
  assert.match(casterSrc, /textContent.*commentaryText/, 'must render body via textContent');
});

test('caster-workspace.js: right rail includes WAIT WHAT button', () => {
  assert.match(casterSrc, /data-testid="caster-wait-what"/, 'must have WAIT WHAT button');
});

test('caster-workspace.js: setup screen uses game-style CSS classes', () => {
  assert.match(casterSrc, /caster-setup-game/, 'must use caster-setup-game classes');
  assert.match(casterSrc, /caster-setup-game-vs-card/, 'must have VS matchup card');
  assert.match(casterSrc, /caster-setup-game-vs-divider/, 'must have VS divider');
  assert.match(casterSrc, /caster-setup-game-start/, 'must have game-styled start button');
});

// ── CSS ──

test('caster.css: has right rail styles', () => {
  assert.match(casterCssSrc, /\.caster-right-rail/, 'must have .caster-right-rail style');
  assert.match(casterCssSrc, /\.caster-rail-commentary-section/, 'must have commentary section style');
  assert.match(casterCssSrc, /\.caster-rail-transport-section/, 'must have transport section style');
  assert.match(casterCssSrc, /\.caster-rail-section-header/, 'must have section header style');
});

test('caster.css: has card interaction disabling for caster', () => {
  assert.match(casterCssSrc, /data-caster="1"/, 'must have data-caster selector');
  assert.match(casterCssSrc, /pointer-events:\s*none/, 'must disable pointer events on cards');
});

test('caster.css: has game-style setup screen styles', () => {
  assert.match(casterCssSrc, /\.caster-setup-game\b/, 'must have .caster-setup-game style');
  assert.match(casterCssSrc, /\.caster-setup-game-vs-card/, 'must have VS card style');
  assert.match(casterCssSrc, /\.caster-setup-game-start/, 'must have start button style');
});

test('caster.css: has omniscient opponent hand style', () => {
  assert.match(casterCssSrc, /\.rd-opponent-hand-omniscient/, 'must have omniscient opponent hand style');
});

// ── Cleanup ──

test('caster-workspace.js: cleanupCaster is still exported', () => {
  assert.match(casterSrc, /export function cleanupCaster/, 'cleanupCaster must still be exported');
});

test('caster-workspace.js: render token guard prevents stale renders', () => {
  assert.match(casterSrc, /renderToken/, 'must have renderToken state');
  assert.match(casterSrc, /myToken.*renderToken/, 'must check render token');
});

// Execute the saved workspace functions with only their browser/import boundaries
// replaced. Deferred completions reproduce races without wall-clock sleeps.
function workspaceHarness({ render = () => {}, investigation = {} } = {}) {
  const source = casterSrc.replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
  return runInNewContext(`${source}\n
    renderTheatre = render;
    getInvestigation = async () => investigation;
    getAuthorityHash = async () => 'authority';
    getCaster = async () => ({});
    getStrictView = async () => (() => ({}));
    loadSavedReplays = async () => {};
    ({ state: casterState, renderCaster, onBeatChange, cleanupCaster, wireCasterRightRail,
       wireWaitWhatExport, wireWaitWhatAnnotation, runMatchInWorker, renderWaitWhatPanel });`, {
    render, investigation, setInterval, clearInterval, setTimeout, clearTimeout,
    esc: value => String(value ?? ''),
    Worker: class { postMessage() {} terminate() {} }
  });
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('Caster browser controller ignores old streams and completions after a newer beat', async () => {
  const harness = workspaceHarness();
  const body = { textContent: '' };
  const container = { isConnected: true, querySelector: () => body };
  const pending = [];
  const session = {
    currentBeat: { beatId: 'first' },
    generateCommentaryForCurrentBeat(callbacks) {
      const request = deferred(); pending.push({ ...request, callbacks }); return request.promise;
    }
  };
  harness.state.activeContainer = container;
  harness.state.session = session;
  harness.state.commentaryText = 'previous';
  const first = harness.onBeatChange(container);
  assert.equal(harness.state.commentaryText, '');
  session.currentBeat = { beatId: 'second' };
  const second = harness.onBeatChange(container);
  pending[1].callbacks.onToken('current');
  // An ordinary host rerender must not orphan an otherwise current request.
  await harness.renderCaster(container);
  pending[1].resolve({ ok: true, record: { commentary: 'current', headline: 'Now', tone: 'neutral' } });
  await second;
  pending[0].callbacks.onToken('obsolete');
  pending[0].resolve({ ok: true, record: { commentary: 'obsolete' } });
  await first;
  assert.equal(harness.state.commentaryText, 'current');
  assert.equal(harness.state.commentaryHeadline, 'Now');
  assert.equal(body.textContent, 'current');
});

test('leaving Caster prevents late errors and remounts even when the shared container stays connected', async () => {
  let renders = 0, cancelled = 0, paused = 0;
  const harness = workspaceHarness({ render: () => { renders += 1; } });
  const container = { isConnected: true, querySelector: () => null };
  const pending = deferred();
  harness.state.activeContainer = container;
  harness.state.session = {
    currentBeat: { beatId: 'first' },
    generateCommentaryForCurrentBeat: () => pending.promise,
    cancelCommentary: () => { cancelled += 1; }, pause: () => { paused += 1; }
  };
  const work = harness.onBeatChange(container);
  harness.cleanupCaster();
  pending.reject(new Error('old route error'));
  await work;
  assert.equal(renders, 1, 'only the initial loading render should execute');
  assert.equal(harness.state.commentaryError, null);
  assert.equal(harness.state.commentaryLoading, false);
  assert.equal(cancelled, 1);
  assert.equal(paused, 1);
  assert.ok(harness.state.session, 'the replay survives route exit');
});

test('cleanup settles a cancelled worker and clears loading for route re-entry', async () => {
  const harness = workspaceHarness();
  harness.state.loading = true;
  const result = harness.runMatchInWorker({ seed: 1 });
  harness.cleanupCaster();
  await assert.rejects(result, /Match generation cancelled/);
  assert.equal(harness.state.worker, null);
  assert.equal(harness.state.cancelWorker, null);
  assert.equal(harness.state.loading, false);
});

test('WAIT WHAT pauses at capture and cannot restore an investigation after navigation', async () => {
  let paused = false;
  const load = deferred();
  const harness = workspaceHarness({ investigation: load.promise });
  const button = {};
  const container = { isConnected: true, querySelector: id => id === '#caster-wait-what' ? button : null, querySelectorAll: () => [] };
  harness.state.activeContainer = container;
  const session = {
    pause: () => { paused = true; }, cancelCommentary() {},
    waitWhat: () => { assert.equal(paused, true); return { captureId: 'bookmark' }; }
  };
  harness.state.session = session;
  harness.wireCasterRightRail(container, session, 0, 2);
  const work = button.onclick();
  harness.cleanupCaster();
  load.resolve({ createInvestigation: () => { throw new Error('must not recreate the closed investigation'); } });
  await work;
  assert.equal(harness.state.waitWhatInvestigation, null);
  assert.equal(harness.state.waitWhatVisible, false);
});

test('public investigation HTML shows neutral future anchors and no fabricated runner-up', () => {
  const harness = workspaceHarness();
  const html = harness.renderWaitWhatPanel({
    captureId: 'bookmark', viewerMode: 'public', redacted: true,
    contextAfter: [{ beatId: 'future', redacted: true }], legalOptions: [{ count: 4 }]
  }, null, false);
  assert.match(html, /Future beat \(hidden\)/);
  assert.match(html, /does not include a verified alternative action/);
  assert.doesNotMatch(html, /data-action-id="runner-up"/);
});
