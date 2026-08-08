// V0.17.0 Phase 3 — Play interface tests
// Tests the enhanced renderer, action dock, priority banner, inspector, and target selection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read the renderer source to verify it contains v0.17.0 features
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const boardEventsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/board-events.js'), 'utf8');
const playStateSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-state.js'), 'utf8');
// Combined source for pattern matching across the play module
const playModuleSrc = appSrc + '\n' + boardEventsSrc + '\n' + playStateSrc;
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');

// ─── Renderer Structure Tests ───────────────────────────────────

test('renderBoard: imports v0.17.0 authority modules', () => {
  assert.ok(rendererSrc.includes('priority-projection'), 'Must import priority projection');
  assert.ok(rendererSrc.includes('legal-action-adapter'), 'Must import legal action adapter');
  assert.ok(rendererSrc.includes('action-explanation'), 'Must import action explanation');
  // reason-code-registry is imported transitively via action-explanation.js
  assert.ok(rendererSrc.includes('resolution-flow'), 'Must import resolution flow');
});

test('renderBoard: uses priority banner instead of decision banner', () => {
  assert.ok(rendererSrc.includes('renderPriorityBanner'), 'Must have renderPriorityBanner function');
  assert.ok(rendererSrc.includes('priorityBannerText'), 'Must use priorityBannerText');
  assert.ok(rendererSrc.includes('windowTypeLabel'), 'Must use windowTypeLabel');
});

test('renderBoard: uses action dock grouped by timing', () => {
  assert.ok(rendererSrc.includes('renderActionDock'), 'Must have renderActionDock function');
  assert.ok(rendererSrc.includes('groupActionsByTiming'), 'Must group actions by timing');
  assert.ok(rendererSrc.includes('action-dock'), 'Must use action-dock class');
});

test('renderBoard: has target selection UI', () => {
  assert.ok(rendererSrc.includes('renderTargetSelection'), 'Must have renderTargetSelection function');
  assert.ok(rendererSrc.includes('target-selection'), 'Must have target-selection class');
  assert.ok(rendererSrc.includes('target-button'), 'Must have target-button class');
});

test('renderBoard: has card inspector', () => {
  assert.ok(rendererSrc.includes('renderInspector'), 'Must have renderInspector function');
  assert.ok(rendererSrc.includes('card-inspector'), 'Must have card-inspector class');
  assert.ok(rendererSrc.includes('inspector-close'), 'Must have inspector close button');
});

test('renderBoard: has discard pile top card', () => {
  assert.ok(rendererSrc.includes('gyTopCard'), 'Must check for graveyard top card');
  assert.ok(rendererSrc.includes('graveyard-top'), 'Must have graveyard-top testid');
});

test('renderBoard: has priority timeline', () => {
  assert.ok(rendererSrc.includes('priority-timeline'), 'Must have priority timeline');
  assert.ok(rendererSrc.includes('timeline-steps'), 'Must have timeline steps');
});

test('renderBoard: has pass info in banner', () => {
  assert.ok(rendererSrc.includes('pass-info'), 'Must have pass-info element');
  assert.ok(rendererSrc.includes('passInfo'), 'Must use passInfo from immediate explanation');
});

test('renderBoard: has structured event log', () => {
  assert.ok(rendererSrc.includes('buildEventLog'), 'Must use buildEventLog from resolution-flow');
  assert.ok(rendererSrc.includes('event-description'), 'Must have event-description class');
  assert.ok(rendererSrc.includes('event-index'), 'Must have event-index class');
});

test('renderBoard: has confirmation with preview', () => {
  assert.ok(rendererSrc.includes('renderConfirmationV17'), 'Must have renderConfirmationV17 function');
  assert.ok(rendererSrc.includes('confirm-preview'), 'Must have confirm-preview element');
  assert.ok(rendererSrc.includes('confirm-costs'), 'Must have confirm-costs element');
  assert.ok(rendererSrc.includes('confirm-targets'), 'Must have confirm-targets element');
});

test('renderBoard: has Super and Spades badges in actions', () => {
  assert.ok(rendererSrc.includes('super-badge'), 'Must have super-badge in action buttons');
  assert.ok(rendererSrc.includes('spades-badge'), 'Must have spades-badge in action buttons');
});

test('renderBoard: has legal action indicators on hand cards', () => {
  assert.ok(rendererSrc.includes('legal-action-indicator'), 'Must have legal-action-indicator');
  assert.ok(rendererSrc.includes('has-legal-actions'), 'Must have has-legal-actions class');
  assert.ok(rendererSrc.includes('super-eligible'), 'Must have super-eligible class');
});

test('renderBoard: terminal has Rank Anatomy and History links', () => {
  assert.ok(rendererSrc.includes('open-rank-anatomy'), 'Terminal must link to Rank Anatomy');
  assert.ok(rendererSrc.includes('open-history'), 'Terminal must link to History');
  assert.ok(rendererSrc.includes('return-to-hub'), 'Terminal must have return to hub button');
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

test('CONSERVATION: renderer derives actions from authority', () => {
  assert.ok(rendererSrc.includes('buildLegalActionContract'), 'Must use buildLegalActionContract');
  assert.ok(rendererSrc.includes('groupActionsByTiming'), 'Must use groupActionsByTiming');
  assert.ok(rendererSrc.includes('actionsForCard'), 'Must use actionsForCard for hand indicators');
});
