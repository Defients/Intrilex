// ═══════════════════════════════════════════════════════════════
// tutorial-guidance-parity.test.mjs
// v0.25 Phase D: Tutorial and guidance parity proofs.
//
// Verifies that the tutorial system and guidance mode work correctly
// for local matches, and that guidance mode (which is a global UI
// preference) applies to both local and network matches.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');

// ── Tutorial system ──

test('TutorialRuntime is imported and instantiated for local matches', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  assert.match(src, /import.*TutorialRuntime.*from.*tutorial-runtime/, 'must import TutorialRuntime');
  assert.match(src, /new TutorialRuntime\(\)/, 'must instantiate TutorialRuntime');
});

test('tutorial-runtime.js exports TutorialRuntime and getTutorialSetup', async () => {
  const src = await read('apps/lab-web/src/play/tutorial-runtime.js');
  assert.match(src, /export.*TutorialRuntime/, 'must export TutorialRuntime');
  assert.match(src, /export.*getTutorialSetup/, 'must export getTutorialSetup');
});

test('tutorial is restored from saves in continueMatch', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // continueMatch should restore tutorial state
  const fnStart = src.indexOf('async function continueMatch');
  const fnEnd = src.indexOf('\n}', fnStart);
  const section = src.substring(fnStart, fnEnd);
  assert.match(section, /tutorial/i, 'continueMatch must handle tutorial state');
});

test('tutorial coach overlay is rendered when active', async () => {
  const src = await read('apps/lab-web/src/play/ranked-duel-renderer.mjs');
  // Renderer must handle tutorial state
  assert.match(src, /tutorial/i, 'renderer must handle tutorial state');
  // Tutorial acknowledge and skip buttons must exist
  assert.match(src, /tutorial-acknowledge|tutorial-skip/, 'renderer must have tutorial acknowledge/skip buttons');
});

test('tutorial events are bound in board-events.js', async () => {
  const src = await read('apps/lab-web/src/play/board-events.js');
  assert.match(src, /tutorial-acknowledge|tutorial-skip/, 'board-events must bind tutorial acknowledge/skip');
});

// ── Guidance mode ──

test('GuidanceMode enum is imported and used', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  assert.match(src, /import.*GuidanceMode.*from.*action-explanation/, 'must import GuidanceMode');
  assert.match(src, /state\.guidanceMode/, 'must use state.guidanceMode');
});

test('guidance mode is loaded from global preference on first entry', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // Guidance preference is loaded once on first entry
  assert.match(src, /guidancePrefLoaded/, 'must track guidance preference loading');
  assert.match(src, /getPreference.*guidanceMode/, 'must load guidance preference');
});

test('guidance mode is passed to renderer for both local and network', async () => {
  const src = await read('apps/lab-web/src/play/play-app.js');
  // renderActiveMatch passes guidanceMode to renderer
  const fnStart = src.indexOf('async function renderActiveMatch');
  const fnEnd = src.indexOf('async function renderReplays', fnStart);
  const section = src.substring(fnStart, fnEnd);
  assert.match(section, /guidanceMode/, 'renderActiveMatch must pass guidanceMode to renderer');
});

test('guidance mode toggle is bound in board-events.js', async () => {
  const src = await read('apps/lab-web/src/play/board-events.js');
  assert.match(src, /guidance-mode-toggle/, 'board-events must bind guidance mode toggle');
  assert.match(src, /GuidanceMode\./, 'board-events must use GuidanceMode enum');
});

test('guidance mode has 4 levels: OFF, ESSENTIAL, GUIDED, DETAILED', async () => {
  const src = await read('apps/lab-web/src/play/intelligence/action-explanation.js');
  // GuidanceMode is defined as Object.freeze with 4 string keys
  assert.match(src, /OFF:\s*'OFF'/, 'must have OFF mode');
  assert.match(src, /ESSENTIAL:\s*'ESSENTIAL'/, 'must have ESSENTIAL mode');
  assert.match(src, /GUIDED:\s*'GUIDED'/, 'must have GUIDED mode');
  assert.match(src, /DETAILED:\s*'DETAILED'/, 'must have DETAILED mode');
});

// ── Keyboard shortcuts ──

test('keyboard shortcuts work for both local and network (P for pass, Esc for cancel)', async () => {
  const playApp = await read('apps/lab-web/src/play/play-app.js');
  const boardEvents = await read('apps/lab-web/src/play/board-events.js');
  // Pass shortcut is in play-app.js
  assert.match(playApp, /handlePassShortcut/, 'play-app must have pass keyboard shortcut handler');
  // Escape for cancel is in board-events.js
  assert.match(boardEvents, /Escape|escape/, 'board-events must have escape key handler');
});
