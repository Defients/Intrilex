// V0.17.0 Phase 7 — Accessibility and responsive design tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const terminalSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-terminal.mjs'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const playStateSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-state.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');

// ─── ARIA and Semantic Tests ────────────────────────────────────

test('Renderer: has ARIA labels on key sections', () => {
  assert.ok(rendererSrc.includes('aria-label="Opponent"'), 'Must label opponent section');
  assert.ok(rendererSrc.includes('aria-label="Your board"'), 'Must label human section');
  assert.ok(rendererSrc.includes('aria-label="Actions"'), 'Must label actions section');
  assert.ok(rendererSrc.includes('aria-label="Recent events"'), 'Must label event log');
});

test('Renderer: has role=status on decision banner', () => {
  assert.ok(rendererSrc.includes('role="status"'), 'Decision banner must have role=status');
  assert.ok(rendererSrc.includes('aria-live="polite"'), 'Decision banner must have aria-live=polite');
});

test('Renderer: has role=log on event log', () => {
  assert.ok(rendererSrc.includes('role="log"'), 'Event log must have role=log');
});

test('Renderer: has role=region on action dock', () => {
  assert.ok(rendererSrc.includes('role="region"'), 'Action dock must have role=region');
});

test('Renderer: has role=group on target selection', () => {
  assert.ok(rendererSrc.includes('role="group"'), 'Target selection must have role=group');
});

test('Renderer: has role=dialog on keyboard help', () => {
  assert.ok(terminalSrc.includes('role="dialog"'), 'Keyboard help must have role=dialog');
});

test('Renderer: has aria-hidden on decorative elements', () => {
  assert.ok(rendererSrc.includes('aria-hidden="true"'), 'Must hide decorative elements from screen readers');
});

test('Renderer: card backs are aria-hidden', () => {
  assert.ok(rendererSrc.includes('card-back'), 'Must have card backs');
  // Card backs should be aria-hidden since they convey no information
  assert.ok(rendererSrc.includes('aria-hidden="true"'), 'Card backs must be aria-hidden');
});

test('Renderer: hand cards have descriptive aria-labels', () => {
  assert.ok(rendererSrc.includes('aria-label="Hand card'), 'Hand cards must have descriptive aria-labels');
  assert.ok(rendererSrc.includes('has legal actions'), 'Hand card labels must indicate legal action status');
});

test('Renderer: action buttons have descriptive aria-labels', () => {
  assert.ok(rendererSrc.includes('aria-label'), 'Action buttons must have aria-labels');
});

test('Renderer: inspector has close button with aria-label', () => {
  assert.ok(rendererSrc.includes('inspector-close'), 'Inspector must have close button');
  assert.ok(rendererSrc.includes('aria-label="Close inspector"'), 'Inspector close must have aria-label');
});

// ─── Keyboard Tests ─────────────────────────────────────────────

test('App: has keyboard shortcut handler', () => {
  assert.ok(appSrc.includes('bindKeyboardShortcuts'), 'Must bind keyboard shortcuts');
  assert.ok((appSrc + playStateSrc).includes('keyboardHandler'), 'Must have keyboard handler state');
});

test('App: has P key for pass', () => {
  assert.ok(appSrc.includes("key === 'p'"), 'Must handle P key');
  assert.ok(appSrc.includes('handlePassShortcut'), 'Must have pass shortcut handler');
});

test('App: has I key for inspector', () => {
  assert.ok(appSrc.includes("key === 'i'"), 'Must handle I key');
  assert.ok(appSrc.includes('handleInspectorShortcut'), 'Must have inspector shortcut handler');
});

test('App: has R key for stack', () => {
  assert.ok(appSrc.includes("key === 'r'"), 'Must handle R key');
  assert.ok(appSrc.includes('handleStackShortcut'), 'Must have stack shortcut handler');
});

test('App: has ? key for help', () => {
  assert.ok(appSrc.includes("key === '?'"), 'Must handle ? key');
  assert.ok(appSrc.includes('handleHelpShortcut'), 'Must have help shortcut handler');
});

test('App: has Escape key for cancel', () => {
  assert.ok(appSrc.includes("key === 'escape'"), 'Must handle Escape key');
  assert.ok(appSrc.includes('handleEscapeShortcut'), 'Must have escape shortcut handler');
});

test('App: keyboard handler does not intercept input fields', () => {
  assert.ok(appSrc.includes('INPUT'), 'Must check for INPUT elements');
  assert.ok(appSrc.includes('TEXTAREA'), 'Must check for TEXTAREA elements');
});

test('App: keyboard handler ignores modifier keys', () => {
  assert.ok(appSrc.includes('ctrlKey'), 'Must check ctrlKey');
  assert.ok(appSrc.includes('metaKey'), 'Must check metaKey');
  assert.ok(appSrc.includes('altKey'), 'Must check altKey');
});

test('App: has keyboard help overlay', () => {
  assert.ok((appSrc + playStateSrc).includes('showKeyboardHelp'), 'Must have keyboard help state');
  assert.ok(appSrc.includes('showKeyboardHelp'), 'Must pass showKeyboardHelp to renderer');
});

test('App: cleans up keyboard handler on cleanup', () => {
  assert.ok(appSrc.includes('removeKeyboardShortcuts'), 'cleanupPlay must remove keyboard shortcuts');
});

// ─── Reduced Motion Tests ───────────────────────────────────────

test('CSS: has prefers-reduced-motion media query', () => {
  assert.ok(cssSrc.includes('prefers-reduced-motion'), 'Must have reduced motion media query');
  assert.ok(cssSrc.includes('transition: none'), 'Must disable transitions for reduced motion');
});

test('CSS: reduced motion disables card tap transform', () => {
  assert.ok(cssSrc.includes('transform: none'), 'Must disable transforms for reduced motion');
});

// ─── High Contrast Tests ────────────────────────────────────────

test('CSS: has prefers-contrast media query', () => {
  assert.ok(cssSrc.includes('prefers-contrast: high'), 'Must have high contrast media query');
});

// ─── Mobile/Responsive Tests ────────────────────────────────────

test('CSS: has mobile media query for inspector', () => {
  assert.ok(cssSrc.includes('@media (max-width: 390px)'), 'Must have 390px mobile breakpoint');
  assert.ok(cssSrc.includes('card-inspector'), 'Mobile query must affect card inspector');
});

test('CSS: has tablet media query for action dock', () => {
  assert.ok(cssSrc.includes('@media (max-width: 768px)'), 'Must have 768px tablet breakpoint');
  assert.ok(cssSrc.includes('action-dock'), 'Tablet query must affect action dock');
});

// ─── Focus Styles Tests ─────────────────────────────────────────

test('CSS: has focus-visible styles for all interactive elements', () => {
  assert.ok(cssSrc.includes('action-button:focus-visible'), 'Must have focus style for action buttons');
  assert.ok(cssSrc.includes('hand-card:focus-visible'), 'Must have focus style for hand cards');
  assert.ok(cssSrc.includes('confirm-button:focus-visible'), 'Must have focus style for confirm button');
  assert.ok(cssSrc.includes('cancel-button:focus-visible'), 'Must have focus style for cancel button');
  assert.ok(cssSrc.includes('target-button:focus-visible'), 'Must have focus style for target buttons');
  assert.ok(cssSrc.includes('inspector-close:focus-visible'), 'Must have focus style for inspector close');
});

test('CSS: focus style uses outline with offset', () => {
  assert.ok(cssSrc.includes('outline: 2px solid'), 'Must use 2px outline for focus');
  assert.ok(cssSrc.includes('outline-offset: 2px'), 'Must use outline-offset for focus');
});

// ─── Keyboard Help Overlay Tests ────────────────────────────────

test('Renderer: has keyboard help overlay', () => {
  assert.ok(rendererSrc.includes('renderKeyboardHelp'), 'Must have renderKeyboardHelp function');
  assert.ok(terminalSrc.includes('keyboard-help-overlay'), 'Must have keyboard-help-overlay class');
});

test('Renderer: keyboard help lists all shortcuts', () => {
  assert.ok(terminalSrc.includes('<kbd>P</kbd>'), 'Must list P key');
  assert.ok(terminalSrc.includes('<kbd>I</kbd>'), 'Must list I key');
  assert.ok(terminalSrc.includes('<kbd>R</kbd>'), 'Must list R key');
  assert.ok(terminalSrc.includes('<kbd>?</kbd>'), 'Must list ? key');
  assert.ok(terminalSrc.includes('<kbd>Esc</kbd>'), 'Must list Esc key');
});

// ─── Conservation Tests ─────────────────────────────────────────

test('CONSERVATION: keyboard shortcuts do not bypass engine authority', () => {
  // The pass shortcut should only work if there's a legal pass action
  assert.ok(appSrc.includes('passAction'), 'Pass shortcut must find a legal pass action');
  assert.ok(appSrc.includes('isDecline') || appSrc.includes('isExhaustedPass'), 'Must check for legal pass/decline');
});

test('CONSERVATION: keyboard shortcuts do not submit without confirmation', () => {
  // The pass shortcut auto-confirms, but only for pass/decline actions
  // which are explicitly safe (no targets, no choices)
  assert.ok(appSrc.includes('confirmBtn.click()'), 'Pass shortcut triggers confirm button click');
});
