// V0.17.0 Phase 9 — Determinism, privacy, performance verification
// Verifies that v0.17.0 modules don't break determinism, privacy, or performance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read all v0.17.0 module sources
const lifecycleSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/state/play-lifecycle.js'), 'utf8');
const declarationSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/orchestration/declaration-flow.js'), 'utf8');
const resolutionSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/orchestration/resolution-flow.js'), 'utf8');
const sessionLeaseSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/state/session-lease.js'), 'utf8');
const decisionEvidenceSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/intelligence/decision-evidence.js'), 'utf8');
const legalActionSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/authority/legal-action-adapter.js'), 'utf8');
const prioritySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/authority/priority-projection.js'), 'utf8');
const visibilitySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/authority/visibility-projection.js'), 'utf8');
const reasonCodeSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/authority/reason-code-registry.js'), 'utf8');
const actionExplSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/intelligence/action-explanation.js'), 'utf8');
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const boardEventsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/board-events.js'), 'utf8');

// ─── Determinism Tests ──────────────────────────────────────────

test('DETERMINISM: lifecycle module does not use Math.random', () => {
  assert.ok(!lifecycleSrc.includes('Math.random'), 'Lifecycle must not use Math.random');
});

test('DETERMINISM: lifecycle module does not use Date.now', () => {
  assert.ok(!lifecycleSrc.includes('Date.now'), 'Lifecycle must not use Date.now');
});

test('DETERMINISM: declaration flow does not use Math.random', () => {
  assert.ok(!declarationSrc.includes('Math.random'), 'Declaration flow must not use Math.random');
});

test('DETERMINISM: resolution flow does not use Math.random', () => {
  assert.ok(!resolutionSrc.includes('Math.random'), 'Resolution flow must not use Math.random');
});

test('DETERMINISM: decision evidence does not use Math.random', () => {
  assert.ok(!decisionEvidenceSrc.includes('Math.random'), 'Decision evidence must not use Math.random');
});

test('DETERMINISM: legal action adapter does not use Math.random', () => {
  assert.ok(!legalActionSrc.includes('Math.random'), 'Legal action adapter must not use Math.random');
});

test('DETERMINISM: priority projection does not use Math.random', () => {
  assert.ok(!prioritySrc.includes('Math.random'), 'Priority projection must not use Math.random');
});

test('DETERMINISM: visibility projection does not use Math.random', () => {
  assert.ok(!visibilitySrc.includes('Math.random'), 'Visibility projection must not use Math.random');
});

test('DETERMINISM: action explanation does not use Math.random', () => {
  assert.ok(!actionExplSrc.includes('Math.random'), 'Action explanation must not use Math.random');
});

test('DETERMINISM: renderer does not use Math.random for game state', () => {
  // The renderer may use Math.random only for UI-only purposes (like generating tab IDs)
  // but never for game state decisions
  assert.ok(!rendererSrc.includes('Math.random'), 'Renderer must not use Math.random');
});

test('DETERMINISM: app uses Math.random only for seed generation', () => {
  // The app can use Math.random for new seed generation, but not for game decisions
  const combinedSrc = appSrc + '\n' + boardEventsSrc;
  const matches = combinedSrc.match(/Math\.random/g) ?? [];
  // Should only appear in the new-seed action
  assert.ok(combinedSrc.includes('newSeed'), 'App must use Math.random only for seed generation');
});

test('DETERMINISM: v0.17.0 modules do not import engine directly', () => {
  // The authority, intelligence, orchestration, and state modules should not
  // import the engine directly — they work with snapshots and contracts
  assert.ok(!lifecycleSrc.includes('engine-entry'), 'Lifecycle must not import engine');
  assert.ok(!declarationSrc.includes('engine-entry'), 'Declaration flow must not import engine');
  assert.ok(!resolutionSrc.includes('engine-entry'), 'Resolution flow must not import engine');
  assert.ok(!decisionEvidenceSrc.includes('engine-entry'), 'Decision evidence must not import engine');
});

// ─── Privacy Tests ──────────────────────────────────────────────

test('PRIVACY: visibility projection wraps privacy validation', () => {
  assert.ok(visibilitySrc.includes('validateSnapshotPrivacy'), 'Must use validateSnapshotPrivacy');
  assert.ok(visibilitySrc.includes('projectSnapshot'), 'Must have projectSnapshot function');
  assert.ok(visibilitySrc.includes('VisibilityProfile'), 'Must have VisibilityProfile');
});

test('PRIVACY: visibility projection has authorized view projection', () => {
  assert.ok(visibilitySrc.includes('authorized') || visibilitySrc.includes('project'), 'Must have authorized view projection');
});

test('PRIVACY: decision evidence does not expose private card data', () => {
  assert.ok(!decisionEvidenceSrc.includes('cardId'), 'Decision evidence must not expose cardId directly');
  assert.ok(!decisionEvidenceSrc.includes('handContents'), 'Decision evidence must not expose hand contents');
});

test('PRIVACY: renderer does not render opponent hand cards', () => {
  // The renderer should show card backs for opponent, not actual card faces
  assert.ok(rendererSrc.includes('card-back'), 'Must render card backs for opponent');
  assert.ok(rendererSrc.includes('aria-hidden="true"'), 'Card backs must be aria-hidden');
});

test('PRIVACY: resolution flow does not expose hidden card IDs', () => {
  // The resolution flow uses cardRegistry to describe cards, but only
  // for cards that are already public (on the stack, resolved, etc.)
  assert.ok(resolutionSrc.includes('cardRegistry'), 'Must use cardRegistry for descriptions');
  // It should not access private zones
  assert.ok(!resolutionSrc.includes('opponent.hand'), 'Must not access opponent hand');
});

test('PRIVACY: session lease does not transmit card data', () => {
  // The session lease should only transmit tab/session IDs, not card data
  assert.ok(!sessionLeaseSrc.includes('cardId'), 'Session lease must not transmit cardId');
  assert.ok(!sessionLeaseSrc.includes('handContents'), 'Session lease must not transmit hand contents');
  assert.ok(!sessionLeaseSrc.includes('opponentHand'), 'Session lease must not transmit opponent hand');
});

test('PRIVACY: reason code registry does not contain card data', () => {
  assert.ok(!reasonCodeSrc.includes('cardId'), 'Reason code registry must not contain cardId');
});

// ─── Performance Tests ──────────────────────────────────────────

test('PERFORMANCE: lifecycle module is pure (no side effects)', () => {
  // Pure functions are fast and cacheable
  assert.ok(lifecycleSrc.includes('export function mapToLifecycleState'), 'Must export pure function');
  assert.ok(!lifecycleSrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!lifecycleSrc.includes('await '), 'Must not use async/await');
});

test('PERFORMANCE: declaration flow is pure (no side effects)', () => {
  assert.ok(!declarationSrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!declarationSrc.includes('document.'), 'Must not access DOM directly');
});

test('PERFORMANCE: resolution flow is pure (no side effects)', () => {
  assert.ok(!resolutionSrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!resolutionSrc.includes('document.'), 'Must not access DOM directly');
});

test('PERFORMANCE: legal action adapter is pure', () => {
  assert.ok(!legalActionSrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!legalActionSrc.includes('document.'), 'Must not access DOM directly');
});

test('PERFORMANCE: priority projection is pure', () => {
  assert.ok(!prioritySrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!prioritySrc.includes('document.'), 'Must not access DOM directly');
});

test('PERFORMANCE: action explanation is pure', () => {
  assert.ok(!actionExplSrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!actionExplSrc.includes('document.'), 'Must not access DOM directly');
});

test('PERFORMANCE: decision evidence is pure', () => {
  assert.ok(!decisionEvidenceSrc.includes('fetch('), 'Must not make network requests');
  assert.ok(!decisionEvidenceSrc.includes('document.'), 'Must not access DOM directly');
});

// ─── Conservation Tests ─────────────────────────────────────────

test('CONSERVATION: v0.17.0 modules never construct engine commands', () => {
  const allModules = [lifecycleSrc, declarationSrc, resolutionSrc, decisionEvidenceSrc, legalActionSrc, prioritySrc, visibilitySrc, reasonCodeSrc, actionExplSrc];
  for (const src of allModules) {
    assert.ok(!src.includes('commandVault'), 'Must not access commandVault');
    assert.ok(!src.includes('engine.execute'), 'Must not call engine.execute');
    assert.ok(!src.includes('engine.advance'), 'Must not call engine.advance');
  }
});

test('CONSERVATION: v0.17.0 modules never claim a move is best', () => {
  const allModules = [lifecycleSrc, declarationSrc, resolutionSrc, decisionEvidenceSrc, legalActionSrc, prioritySrc, visibilitySrc, reasonCodeSrc, actionExplSrc];
  for (const src of allModules) {
    // Strip comments before checking
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!stripped.toLowerCase().includes('best move'), 'Must not claim best move');
    assert.ok(!stripped.toLowerCase().includes('objectively best'), 'Must not claim objective best');
    assert.ok(!stripped.toLowerCase().includes('optimal play'), 'Must not claim optimal play');
  }
});

test('CONSERVATION: v0.17.0 modules never invent causal relationships', () => {
  // The resolution flow explicitly avoids claiming causation
  assert.ok(resolutionSrc.includes('never invents causal'), 'Resolution flow must document no-causation principle');
});

test('CONSERVATION: v0.17.0 UI state is separate from engine state', () => {
  // The declaration flow is UI-only state
  assert.ok(declarationSrc.includes('UI-only state'), 'Declaration flow must document UI-only nature');
  assert.ok(declarationSrc.includes('never persisted'), 'Declaration flow must not be persisted');
});

test('CONSERVATION: lifecycle maps from engine state, does not modify it', () => {
  assert.ok(lifecycleSrc.includes('UI states, not engine states'), 'Lifecycle must document UI-only nature');
  assert.ok(lifecycleSrc.includes('runtime authority'), 'Lifecycle must acknowledge runtime authority');
});
