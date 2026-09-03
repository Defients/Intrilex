// ═══════════════════════════════════════════════════════════════
// test/caster-fullscreen.test.mjs
//
// Regression tests for the Caster Full-Screen Spectator Experience.
// Verifies:
//   - frameStateToSnapshot adapter output shape
//   - cardViewToViewModelCard conversion
//   - Route changes (LANDING_MODES includes /caster)
//   - renderRankedDuel supports rightRailHtml option
//   - renderOpponentHand supports face-up cards (omniscient)
//   - renderHeader supports isCaster option
//   - caster-workspace uses renderRankedDuel (not custom renderBoard)
//   - Old custom board renderer is removed
//
// Source-text-based testing pattern (consistent with v0.28-pvp-experience.test.mjs)
// because caster-workspace.js imports browser-only modules.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const casterSrc = readFileSync(join(root, 'apps/lab-web/src/workspaces/caster-workspace.js'), 'utf8');
const routerSrc = readFileSync(join(root, 'apps/lab-web/src/router.js'), 'utf8');
const appSrc = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
const rendererSrc = readFileSync(join(root, 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
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

test('caster-workspace.js: frameStateToSnapshot builds snapshot with state.seatOrder', () => {
  assert.match(casterSrc, /seatOrder/, 'adapter must set seatOrder');
  assert.match(casterSrc, /state:\s*\{/, 'adapter must build state object');
  assert.match(casterSrc, /fullTurnSequence/, 'adapter must include fullTurnSequence');
  assert.match(casterSrc, /phase/, 'adapter must include phase');
  assert.match(casterSrc, /activePlayerId/, 'adapter must include activePlayerId');
  assert.match(casterSrc, /priorityOwnerId/, 'adapter must include priorityOwnerId');
});

test('caster-workspace.js: frameStateToSnapshot maps players with required fields', () => {
  assert.match(casterSrc, /securedPoints/, 'adapter must map securedPoints');
  assert.match(casterSrc, /goal/, 'adapter must map goal');
  assert.match(casterSrc, /hand/, 'adapter must map hand');
  assert.match(casterSrc, /pointRow/, 'adapter must map pointRow');
  assert.match(casterSrc, /enduringRow/, 'adapter must map enduringRow');
  assert.match(casterSrc, /isActive/, 'adapter must map isActive');
  assert.match(casterSrc, /hasPriority/, 'adapter must map hasPriority');
});

test('caster-workspace.js: frameStateToSnapshot maps zones (drawPile, graveyard, exile)', () => {
  assert.match(casterSrc, /drawPile/, 'adapter must map drawPile');
  assert.match(casterSrc, /graveyard/, 'adapter must map graveyard');
  assert.match(casterSrc, /exile/, 'adapter must map exile');
});

test('caster-workspace.js: frameStateToSnapshot sets humanPlayerId to seatOrder[0]', () => {
  assert.match(casterSrc, /humanPlayerId.*seatOrder\[0\]/, 'adapter must set humanPlayerId to seatOrder[0]');
});

test('caster-workspace.js: frameStateToSnapshot does NOT set terminationReason (keeps board visible)', () => {
  // The adapter must not set terminationReason in the state, otherwise
  // deriveStatus would return TERMINAL and renderTerminal would be used
  // instead of renderMatch (the board).
  assert.match(casterSrc, /terminationReason:\s*null/, 'adapter must set terminationReason to null');
});

test('caster-workspace.js: frameStateToSnapshot handles public vs omniscient viewer modes', () => {
  assert.match(casterSrc, /omniscient/, 'adapter must check omniscient mode');
  assert.match(casterSrc, /opponentHandCards/, 'adapter must build opponentHandCards for omniscient');
  // In public mode, opponent hand must be {count} (no card IDs)
  assert.match(casterSrc, /hand:\s*\{\s*count:/, 'adapter must use {count} for opponent hand in public mode');
});

test('caster-workspace.js: frameStateToSnapshot passes recentEvents for game log', () => {
  assert.match(casterSrc, /recentEvents/, 'adapter must pass recentEvents for game log');
  assert.match(casterSrc, /visibleEvents/, 'adapter must use beat visibleEvents');
});

test('caster-workspace.js: cardViewToViewModelCard converts card views correctly', () => {
  assert.match(casterSrc, /function cardViewToViewModelCard/, 'cardViewToViewModelCard must exist');
  assert.match(casterSrc, /entityId.*card\.id/, 'must map id to entityId');
  assert.match(casterSrc, /identity/, 'must map identity');
  assert.match(casterSrc, /statusMarkers/, 'must build statusMarkers');
  assert.match(casterSrc, /TAPPED/, 'must map tapped to TAPPED marker');
  assert.match(casterSrc, /AEGIS/, 'must map aegis to AEGIS marker');
});

// ── renderRankedDuel changes ──

test('ranked-duel-renderer.mjs: renderMatch supports opts.rightRailHtml', () => {
  assert.match(rendererSrc, /opts\.rightRailHtml/, 'renderMatch must check opts.rightRailHtml');
  assert.match(rendererSrc, /renderRightRailBottom/, 'renderRightRailBottom must still exist (fallback)');
});

test('ranked-duel-renderer.mjs: renderOpponentHand supports face-up cards', () => {
  assert.match(rendererSrc, /function renderOpponentHand\(count,\s*faceUpCards/, 'renderOpponentHand must accept faceUpCards parameter');
  assert.match(rendererSrc, /rd-opponent-hand-omniscient/, 'must have omniscient class for face-up opponent hand');
});

test('ranked-duel-renderer.mjs: renderHeader supports opts.isCaster', () => {
  assert.match(rendererSrc, /opts\.isCaster/, 'renderHeader must check opts.isCaster');
  assert.match(rendererSrc, /Back to Observatory/, 'isCaster must show "Back to Observatory" label');
  assert.match(rendererSrc, /exit-caster/, 'isCaster must use exit-caster action');
});

test('ranked-duel-renderer.mjs: data-caster attribute on shell', () => {
  assert.match(rendererSrc, /data-caster/, 'Shell must have data-caster attribute when isCaster');
});

// ── caster-workspace.js uses renderRankedDuel ──

test('caster-workspace.js: imports renderRankedDuel', () => {
  assert.match(casterSrc, /import.*renderRankedDuel.*from.*ranked-duel-renderer/, 'must import renderRankedDuel');
});

test('caster-workspace.js: renderTheatre calls renderRankedDuel', () => {
  assert.match(casterSrc, /renderRankedDuel\(snapshot/, 'renderTheatre must call renderRankedDuel with snapshot');
  assert.match(casterSrc, /rightRailHtml/, 'must pass rightRailHtml option');
  assert.match(casterSrc, /isReadOnly:\s*true/, 'must pass isReadOnly: true');
  assert.match(casterSrc, /isCaster:\s*true/, 'must pass isCaster: true');
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
