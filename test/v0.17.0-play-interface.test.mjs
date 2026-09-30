// V0.17.0 Phase 3 — Play interface tests
// Tests the enhanced renderer, action dock, priority banner, inspector, and target selection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read the renderer source to verify it contains v0.17.0 features
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const terminalSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-terminal.mjs'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const boardEventsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/board-events.js'), 'utf8');
const playStateSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-state.js'), 'utf8');
// Combined source for pattern matching across the play module
const playModuleSrc = appSrc + '\n' + boardEventsSrc + '\n' + playStateSrc;
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');

// ─── Renderer Structure Tests ───────────────────────────────────

test('renderBoard: terminal has Rank Anatomy and History links', () => {
  // Terminal functions extracted to ranked-duel-terminal.mjs
  assert.ok(terminalSrc.includes('open-rank-anatomy'), 'Terminal must link to Rank Anatomy');
  assert.ok(terminalSrc.includes('open-history'), 'Terminal must link to History');
  assert.ok(terminalSrc.includes('return-to-hub'), 'Terminal must have return to hub button');
});

// ─── App Controller Tests ───────────────────────────────────────

test('play-app: imports v0.17.0 modules', () => {
  assert.ok(playModuleSrc.includes('GuidanceMode'), 'Must import GuidanceMode');
  assert.ok(appSrc.includes('declaration-flow'), 'Must import declaration flow');
  assert.ok(appSrc.includes('play-lifecycle'), 'Must import lifecycle');
  assert.ok(playModuleSrc.includes('reason-code-registry'), 'Must import reason code registry');
});

test('play-app: has keyboard shortcuts', () => {
  assert.ok(appSrc.includes('bindKeyboardShortcuts'), 'Must have bindKeyboardShortcuts');
  assert.ok(appSrc.includes('removeKeyboardShortcuts'), 'Must have removeKeyboardShortcuts');
  assert.ok(appSrc.includes('handlePassShortcut'), 'Must have handlePassShortcut');
  assert.ok(appSrc.includes('handleInspectorShortcut'), 'Must have handleInspectorShortcut');
  assert.ok(appSrc.includes('handleStackShortcut'), 'Must have handleStackShortcut');
  assert.ok(appSrc.includes('handleHelpShortcut'), 'Must have handleHelpShortcut');
  assert.ok(appSrc.includes('handleEscapeShortcut'), 'Must have handleEscapeShortcut');
});

test('play-app: has target selection state', () => {
  assert.ok(playModuleSrc.includes('selectedTargetIds'), 'Must have selectedTargetIds state');
  assert.ok(playModuleSrc.includes('inspectorCardId'), 'Must have inspectorCardId state');
  assert.ok(playModuleSrc.includes('guidanceMode'), 'Must have guidanceMode state');
});

test('play-app: uses reason codes for submission errors', () => {
  assert.ok(playModuleSrc.includes('getReasonCode'), 'Must use getReasonCode for errors');
  assert.ok(playModuleSrc.includes('reasonDef.shortText'), 'Must display reason shortText');
});

test('play-app: passes new options to renderer', () => {
  assert.ok(appSrc.includes('selectedTargets'), 'Must pass selectedTargets to renderer');
  assert.ok(appSrc.includes('inspectorCardId'), 'Must pass inspectorCardId to renderer');
  assert.ok(appSrc.includes('guidanceMode'), 'Must pass guidanceMode to renderer');
});

test('play-app: handles target selection clicks', () => {
  assert.ok(playModuleSrc.includes('target-button'), 'Must bind target-button clicks');
  assert.ok(playModuleSrc.includes('selectedTargetIds'), 'Must update selectedTargetIds on click');
});

test('play-app: handles inspector close', () => {
  assert.ok(playModuleSrc.includes('inspector-close'), 'Must bind inspector-close clicks');
});

test('play-app: cleans up keyboard on cleanup', () => {
  assert.ok(appSrc.includes('removeKeyboardShortcuts'), 'cleanupPlay must remove keyboard shortcuts');
});

// ─── CSS Tests ──────────────────────────────────────────────────

test('CSS: has v0.17.0 styles', () => {
  assert.ok(cssSrc.includes('decision-window'), 'Must style decision-window');
  assert.ok(cssSrc.includes('decision-pass-info'), 'Must style decision-pass-info');
  assert.ok(cssSrc.includes('priority-timeline'), 'Must style priority-timeline');
  assert.ok(cssSrc.includes('timeline-step'), 'Must style timeline-step');
  assert.ok(cssSrc.includes('action-dock'), 'Must style action-dock');
  assert.ok(cssSrc.includes('target-selection'), 'Must style target-selection');
  assert.ok(cssSrc.includes('target-button'), 'Must style target-button');
  assert.ok(cssSrc.includes('card-inspector'), 'Must style card-inspector');
  assert.ok(cssSrc.includes('inspector-close'), 'Must style inspector-close');
  assert.ok(cssSrc.includes('legal-action-indicator'), 'Must style legal-action-indicator');
  assert.ok(cssSrc.includes('super-eligible'), 'Must style super-eligible');
  assert.ok(cssSrc.includes('zone-top-card'), 'Must style zone-top-card');
  assert.ok(cssSrc.includes('super-badge'), 'Must style super-badge');
  assert.ok(cssSrc.includes('spades-badge'), 'Must style spades-badge');
  assert.ok(cssSrc.includes('confirm-preview'), 'Must style confirm-preview');
  assert.ok(cssSrc.includes('confirm-costs'), 'Must style confirm-costs');
  assert.ok(cssSrc.includes('submission-error'), 'Must style submission-error');
});

test('CSS: has mobile inspector bottom-sheet', () => {
  assert.ok(cssSrc.includes('@media (max-width: 390px)'), 'Must have mobile media query');
  assert.ok(cssSrc.includes('card-inspector'), 'Mobile query must affect card-inspector');
});

test('CSS: has focus styles for new elements', () => {
  assert.ok(cssSrc.includes('target-button:focus-visible'), 'Must have focus style for target-button');
  assert.ok(cssSrc.includes('inspector-close:focus-visible'), 'Must have focus style for inspector-close');
});

// ─── Conservation Tests ─────────────────────────────────────────

test('CONSERVATION: renderer never constructs engine commands', () => {
  assert.ok(!rendererSrc.includes('commandVault'), 'Renderer must not access commandVault');
  assert.ok(!rendererSrc.includes('engine.execute'), 'Renderer must not call engine.execute');
});

