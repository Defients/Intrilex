// ═══════════════════════════════════════════════════════════════
// architectural-consolidation.test.mjs
//
// Regression tests for the architectural consolidation seams:
//   1. CSS token bridge — verifies Astra tokens are bridged to shared tokens
//   2. State store adapter — verifies subscribe/snapshot pattern
//   3. Coexistence gates — verifies old and new patterns work together
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createStore,
  createSelector,
  createDerivedStore,
} from '../apps/lab-web/src/store-adapter.mjs';

// ── CSS Token Bridge tests ──────────────────────────────────────

const tokensBaseSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/tokens-base.css'), 'utf8');
const gameTableCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/client/game-table.css'), 'utf8');

test('TokenBridge: bridge is present in game-table.css', () => {
  assert.ok(gameTableCssSrc.includes('--astra-text: var(--text)'),
    'game-table.css should contain the token bridge');
});

test('TokenBridge: bridges exact-duplicate tokens', () => {
  // The bridge should map these exact duplicates
  assert.ok(gameTableCssSrc.includes('--astra-text: var(--text)'));
  assert.ok(gameTableCssSrc.includes('--astra-muted: var(--muted)'));
  assert.ok(gameTableCssSrc.includes('--astra-cyan: var(--cyan)'));
  assert.ok(gameTableCssSrc.includes('--astra-amber: var(--amber)'));
  assert.ok(gameTableCssSrc.includes('--astra-focus: var(--focus)'));
});

test('TokenBridge: does NOT bridge intentionally different tokens', () => {
  // These tokens have different values and should NOT be bridged
  // Check the bridge block at the end, not the original definitions at the top
  const bridgeBlock = gameTableCssSrc.slice(gameTableCssSrc.lastIndexOf('Astra Token Bridge'));
  assert.ok(!bridgeBlock.includes('--astra-bg: var('));
  assert.ok(!bridgeBlock.includes('--astra-table: var('));
  assert.ok(!bridgeBlock.includes('--astra-panel: var('));
  assert.ok(!bridgeBlock.includes('--astra-edge: var('));
  assert.ok(!bridgeBlock.includes('--astra-radius: var('));
  assert.ok(!bridgeBlock.includes('--astra-danger: var('));
});

test('TokenBridge: bridge is appended to game-table.css', () => {
  // The bridge should be at the end of game-table.css
  assert.ok(gameTableCssSrc.includes('--astra-text: var(--text)'));
  assert.ok(gameTableCssSrc.includes('--astra-muted: var(--muted)'));
  assert.ok(gameTableCssSrc.includes('--astra-cyan: var(--cyan)'));
  assert.ok(gameTableCssSrc.includes('--astra-amber: var(--amber)'));
  assert.ok(gameTableCssSrc.includes('--astra-focus: var(--focus)'));
});

test('TokenBridge: shared tokens exist in tokens-base.css', () => {
  // Verify the shared tokens that the bridge references
  assert.ok(tokensBaseSrc.includes('--text:'));
  assert.ok(tokensBaseSrc.includes('--muted:'));
  assert.ok(tokensBaseSrc.includes('--cyan:'));
  assert.ok(tokensBaseSrc.includes('--amber:'));
  assert.ok(tokensBaseSrc.includes('--focus:'));
});

test('TokenBridge: bridged values match between Astra and shared', () => {
  // Extract and compare the exact hex values for ALL bridged tokens
  const bridges = [
    ['astra-text', 'text'],
    ['astra-muted', 'muted'],
    ['astra-cyan', 'cyan'],
    ['astra-amber', 'amber'],
    ['astra-focus', 'focus'],
  ];
  for (const [astraName, sharedName] of bridges) {
    const astraVal = gameTableCssSrc.match(new RegExp(`--${astraName}:\\s*(#[0-9a-fA-F]+)`))?.[1];
    const sharedVal = tokensBaseSrc.match(new RegExp(`--${sharedName}:\\s*(#[0-9a-fA-F]+)`))?.[1];
    assert.ok(astraVal, `--${astraName} should have a hex value in game-table.css`);
    assert.ok(sharedVal, `--${sharedName} should have a hex value in tokens-base.css`);
    assert.equal(astraVal?.toLowerCase(), sharedVal?.toLowerCase(),
      `--${astraName} (${astraVal}) should match --${sharedName} (${sharedVal})`);
  }
});

test('TokenBridge: skin overrides are preserved', () => {
  // Skin overrides should still exist in game-table.css
  assert.ok(gameTableCssSrc.includes('[data-skin="cosmotech"]'));
  assert.ok(gameTableCssSrc.includes('[data-skin="corrupture"]'));
  assert.ok(gameTableCssSrc.includes('[data-skin="light"]'));
});

// ── State Store Adapter tests ───────────────────────────────────

test('Store: createStore creates a store with correct interface', () => {
  const store = createStore({ count: 0 });
  assert.equal(typeof store.getSnapshot, 'function');
  assert.equal(typeof store.subscribe, 'function');
  assert.equal(typeof store.setState, 'function');
  assert.equal(typeof store.dispatch, 'function');
  assert.equal(typeof store.dispose, 'function');
});

test('Store: getSnapshot returns initial state', () => {
  const store = createStore({ count: 0, name: 'test' });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.name, 'test');
});

test('Store: setState updates state immutably', () => {
  const store = createStore({ count: 0 });
  const original = store.getSnapshot();
  store.setState({ count: 1 });
  const updated = store.getSnapshot();
  assert.equal(updated.count, 1);
  assert.equal(original.count, 0, 'Original snapshot should be unchanged');
  assert.notEqual(updated, original, 'New snapshot should be a different object');
});

test('Store: setState with function updater', () => {
  const store = createStore({ count: 5 });
  store.setState(prev => ({ count: prev.count + 10 }));
  assert.equal(store.getSnapshot().count, 15);
});

test('Store: setState with no change does not notify', () => {
  const store = createStore({ count: 0 });
  let notified = false;
  store.subscribe(() => { notified = true; });
  store.setState(prev => prev); // Same reference
  assert.equal(notified, false, 'Should not notify when state is unchanged');
});

test('Store: setState merges partial updates', () => {
  const store = createStore({ count: 0, name: 'test', flag: true });
  store.setState({ count: 1 });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.name, 'test', 'Unchanged fields should persist');
  assert.equal(snapshot.flag, true);
});

test('Store: subscribe receives notifications on setState', () => {
  const store = createStore({ count: 0 });
  let callCount = 0;
  const unsub = store.subscribe(() => { callCount++; });
  store.setState({ count: 1 });
  assert.equal(callCount, 1);
  store.setState({ count: 2 });
  assert.equal(callCount, 2);
  unsub();
  store.setState({ count: 3 });
  assert.equal(callCount, 2, 'Should not notify after unsubscribe');
});

test('Store: subscribe returns unsubscribe function', () => {
  const store = createStore({ count: 0 });
  const unsub = store.subscribe(() => {});
  assert.equal(typeof unsub, 'function');
  unsub(); // Should not throw
});

test('Store: state is frozen (immutable)', () => {
  const store = createStore({ count: 0 });
  const snapshot = store.getSnapshot();
  assert.ok(Object.isFrozen(snapshot), 'Snapshot should be frozen');
});

test('Store: dispatch with reducer', () => {
  const reducer = (state, action) => {
    switch (action.type) {
      case 'INCREMENT': return { ...state, count: state.count + 1 };
      case 'SET': return { ...state, count: action.value };
      default: return state;
    }
  };
  const store = createStore({ count: 0 }, reducer);
  store.dispatch({ type: 'INCREMENT' });
  assert.equal(store.getSnapshot().count, 1);
  store.dispatch({ type: 'SET', value: 42 });
  assert.equal(store.getSnapshot().count, 42);
});

test('Store: dispatch without reducer throws', () => {
  const store = createStore({ count: 0 });
  assert.throws(() => store.dispatch({ type: 'X' }), { message: 'STORE_NO_REDUCER' });
});

test('Store: dispose stops notifications and clears listeners', () => {
  const store = createStore({ count: 0 });
  let notified = false;
  store.subscribe(() => { notified = true; });
  store.dispose();
  store.setState({ count: 1 });
  assert.equal(notified, false, 'Should not notify after dispose');
});

test('Store: createStore rejects null/undefined initial state', () => {
  assert.throws(() => createStore(null), { message: 'STORE_INVALID_INITIAL_STATE' });
  assert.throws(() => createStore(undefined), { message: 'STORE_INVALID_INITIAL_STATE' });
});

test('Store: setState rejects invalid updater', () => {
  const store = createStore({ count: 0 });
  assert.throws(() => store.setState('string'), { message: 'STORE_INVALID_UPDATER' });
  assert.throws(() => store.setState(123), { message: 'STORE_INVALID_UPDATER' });
});

test('Store: subscribe rejects non-function listener', () => {
  const store = createStore({ count: 0 });
  assert.throws(() => store.subscribe('not a function'), { message: 'STORE_INVALID_LISTENER' });
});

test('Store: multiple subscribers all get notified', () => {
  const store = createStore({ count: 0 });
  let calls1 = 0, calls2 = 0;
  store.subscribe(() => { calls1++; });
  store.subscribe(() => { calls2++; });
  store.setState({ count: 1 });
  assert.equal(calls1, 1);
  assert.equal(calls2, 1);
});

test('Store: listener that throws does not block other listeners', () => {
  const store = createStore({ count: 0 });
  let secondCalled = false;
  store.subscribe(() => { throw new Error('listener error'); });
  store.subscribe(() => { secondCalled = true; });
  store.setState({ count: 1 });
  assert.equal(secondCalled, true, 'Second listener should still be called');
});

// ── createSelector tests ────────────────────────────────────────

test('Selector: createSelector returns a function', () => {
  const store = createStore({ count: 5, name: 'test' });
  const getCount = createSelector(store, s => s.count);
  assert.equal(typeof getCount, 'function');
  assert.equal(getCount(), 5);
});

test('Selector: createSelector reflects state changes', () => {
  const store = createStore({ count: 0 });
  const getCount = createSelector(store, s => s.count);
  assert.equal(getCount(), 0);
  store.setState({ count: 42 });
  assert.equal(getCount(), 42);
});

test('Selector: createSelector rejects invalid selector', () => {
  const store = createStore({ count: 0 });
  assert.throws(() => createSelector(store, 'not a function'), { message: 'STORE_INVALID_SELECTOR' });
});

// ── createDerivedStore tests ────────────────────────────────────

test('DerivedStore: creates a store derived from parent stores', () => {
  const store1 = createStore({ a: 1 });
  const store2 = createStore({ b: 2 });
  const derived = createDerivedStore([store1, store2], (s1, s2) => ({ sum: s1.a + s2.b }));
  assert.equal(derived.getSnapshot().sum, 3);
});

test('DerivedStore: updates when parent store updates', () => {
  const store1 = createStore({ a: 1 });
  const store2 = createStore({ b: 2 });
  const derived = createDerivedStore([store1, store2], (s1, s2) => ({ sum: s1.a + s2.b }));
  assert.equal(derived.getSnapshot().sum, 3);
  store1.setState({ a: 10 });
  assert.equal(derived.getSnapshot().sum, 12);
});

test('DerivedStore: subscribe receives notifications', () => {
  const store1 = createStore({ a: 1 });
  const store2 = createStore({ b: 2 });
  const derived = createDerivedStore([store1, store2], (s1, s2) => ({ sum: s1.a + s2.b }));
  let notified = false;
  derived.subscribe(() => { notified = true; });
  store1.setState({ a: 10 });
  assert.equal(notified, true);
});

test('DerivedStore: rejects empty parents array', () => {
  assert.throws(() => createDerivedStore([], () => ({})), { message: 'STORE_INVALID_PARENTS' });
});

test('DerivedStore: rejects invalid derive function', () => {
  const store = createStore({ a: 1 });
  assert.throws(() => createDerivedStore([store], 'not a function'), { message: 'STORE_INVALID_DERIVE' });
});

test('DerivedStore: snapshot is frozen', () => {
  const store = createStore({ a: 1 });
  const derived = createDerivedStore([store], s => ({ doubled: s.a * 2 }));
  assert.ok(Object.isFrozen(derived.getSnapshot()));
});

// ── Coexistence gates ───────────────────────────────────────────

test('Coexistence: store-adapter is framework-agnostic (no React import)', () => {
  const storeSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/store-adapter.mjs'), 'utf8');
  // Check for actual import statements, not comment mentions
  assert.ok(!/^import .* from ['"]react['"]/m.test(storeSrc), 'store-adapter should not import React');
  assert.ok(!/^import .* useSyncExternalStore/m.test(storeSrc), 'store-adapter should not import useSyncExternalStore');
});

test('Coexistence: store interface matches GameStore pattern', () => {
  const storeSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/store-adapter.mjs'), 'utf8');
  const gameStoreSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/client/game-store.ts'), 'utf8');
  // Both should have getSnapshot and subscribe
  assert.ok(storeSrc.includes('getSnapshot'));
  assert.ok(storeSrc.includes('subscribe'));
  assert.ok(gameStoreSrc.includes('getSnapshot'));
  assert.ok(gameStoreSrc.includes('subscribe'));
});

test('Coexistence: forensic model remains pure (no store dependency)', () => {
  const forensicModelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/forensic-model.mjs'), 'utf8');
  assert.ok(!forensicModelSrc.includes('store-adapter'), 'Forensic model should not depend on store-adapter');
  assert.ok(!forensicModelSrc.includes('createStore'), 'Forensic model should not depend on createStore');
});

// ── Forensic viewer store integration tests ─────────────────────

const forensicViewerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/forensic-viewer.mjs'), 'utf8');

test('ForensicViewer: imports createStore from store-adapter', () => {
  assert.ok(forensicViewerSrc.includes("from '../store-adapter.mjs'"),
    'Forensic viewer should import from store-adapter');
  assert.ok(forensicViewerSrc.includes('createStore'),
    'Forensic viewer should use createStore');
});

test('ForensicViewer: uses _store instead of _state', () => {
  assert.ok(forensicViewerSrc.includes('let _store ='),
    'Forensic viewer should use _store module-level variable');
  assert.ok(!forensicViewerSrc.includes('let _state ='),
    'Forensic viewer should not use bare _state variable anymore');
});

test('ForensicViewer: getForensicState returns store snapshot', () => {
  assert.ok(forensicViewerSrc.includes('_store?.getSnapshot()'),
    'getForensicState should use _store.getSnapshot()');
});

test('ForensicViewer: setCurrentFrame uses store setState', () => {
  assert.ok(forensicViewerSrc.includes('_store.setState({ currentFrameIndex'),
    'setCurrentFrame should use _store.setState()');
});

test('ForensicViewer: handleForensicAction uses store setState', () => {
  assert.ok(forensicViewerSrc.includes('_store.setState({ session:'),
    'handleForensicAction should use _store.setState() for session mutations');
});

test('ForensicViewer: exports getForensicStore for React integration', () => {
  assert.ok(forensicViewerSrc.includes('export function getForensicStore'),
    'Forensic viewer should export getForensicStore for future React useSyncExternalStore');
});

test('ForensicViewer: exports subscribeForensic for external subscribers', () => {
  assert.ok(forensicViewerSrc.includes('export function subscribeForensic'),
    'Forensic viewer should export subscribeForensic');
});

test('ForensicViewer: no direct _state mutations remain', () => {
  // Check that no bare _state assignments remain (the old pattern)
  assert.ok(!forensicViewerSrc.includes('_state.session ='),
    'No direct _state.session assignments should remain');
  assert.ok(!forensicViewerSrc.includes('_state.bookmarkLabel ='),
    'No direct _state.bookmarkLabel assignments should remain');
  assert.ok(!forensicViewerSrc.includes('_state.annotationText ='),
    'No direct _state.annotationText assignments should remain');
  assert.ok(!forensicViewerSrc.includes('_state.branchLabel ='),
    'No direct _state.branchLabel assignments should remain');
});

// ── Store adapter edge cases ────────────────────────────────────

test('Store: setState with null updater throws', () => {
  const store = createStore({ count: 0 });
  assert.throws(() => store.setState(null), { message: 'STORE_INVALID_UPDATER' });
});

test('Store: setState with function returning same state does not notify', () => {
  const store = createStore({ count: 0 });
  let notified = false;
  store.subscribe(() => { notified = true; });
  store.setState(() => store.getSnapshot()); // Same reference
  assert.equal(notified, false);
});

test('Store: subscribe after dispose returns no-op unsubscribe', () => {
  const store = createStore({ count: 0 });
  store.dispose();
  const unsub = store.subscribe(() => {});
  assert.equal(typeof unsub, 'function');
  unsub(); // Should not throw
});

test('Store: setState after dispose is silent no-op', () => {
  const store = createStore({ count: 0 });
  store.dispose();
  store.setState({ count: 99 });
  assert.equal(store.getSnapshot().count, 0, 'State should not change after dispose');
});

test('Store: createSelector returns consistent values', () => {
  const store = createStore({ a: 1, b: 2 });
  const getSum = createSelector(store, s => s.a + s.b);
  assert.equal(getSum(), 3);
  store.setState({ a: 10 });
  assert.equal(getSum(), 12);
  store.setState({ b: 20 });
  assert.equal(getSum(), 30);
});

test('Store: createDerivedStore with three parents', () => {
  const s1 = createStore({ x: 1 });
  const s2 = createStore({ y: 2 });
  const s3 = createStore({ z: 3 });
  const derived = createDerivedStore([s1, s2, s3], (a, b, c) => ({ sum: a.x + b.y + c.z }));
  assert.equal(derived.getSnapshot().sum, 6);
  s2.setState({ y: 20 });
  assert.equal(derived.getSnapshot().sum, 24);
});

test('Store: createDerivedStore unsubscribe stops notifications', () => {
  const parent = createStore({ val: 1 });
  const derived = createDerivedStore([parent], s => ({ doubled: s.val * 2 }));
  let notified = false;
  const unsub = derived.subscribe(() => { notified = true; });
  parent.setState({ val: 2 });
  assert.equal(notified, true);
  notified = false;
  unsub();
  parent.setState({ val: 3 });
  assert.equal(notified, false, 'Should not notify after unsubscribe');
});

test('Store: createDerivedStore dispose stops all notifications', () => {
  const parent = createStore({ val: 1 });
  const derived = createDerivedStore([parent], s => ({ doubled: s.val * 2 }));
  let notified = false;
  derived.subscribe(() => { notified = true; });
  derived.dispose();
  parent.setState({ val: 2 });
  assert.equal(notified, false, 'Should not notify after dispose');
});


// Exercise timer ownership and asynchronous completion without a browser clock.
import { createSessionAutosave } from '../apps/lab-web/src/play/session-autosave.js';
test('Autosave lifecycle: stop and replacement sessions cannot publish stale Continue targets', async () => {
  const callbacks = new Map();
  let next = 1, finish, writes = 0;
  const published = [];
  const session = id => ({ sessionId: id, status: 'RUNNING', getSaveEnvelope: () => ({ sessionId: id }) });
  const state = { session: session('first'), autosaveTimer: null };
  const autosave = createSessionAutosave(state, {
    timers: { setInterval(fn) { const id = next++; callbacks.set(id, fn); return id; }, clearInterval(id) { callbacks.delete(id); } },
    putSave: async () => { writes++; await new Promise(resolve => { finish = resolve; }); },
    buildSaveIntegrityPayload: () => 'hash', saveContinue: id => published.push(id),
  });
  autosave.startAutosave();
  const tick = callbacks.get(state.autosaveTimer);
  const pending = tick();
  await tick();
  assert.equal(writes, 1, 'overlapping saves are prevented');
  state.session = session('second');
  autosave.startAutosave();
  assert.equal(callbacks.size, 1, 'replacement owns exactly one timer');
  finish(); await pending;
  assert.deepEqual(published, [], 'old completion cannot replace Continue');
  const current = callbacks.get(state.autosaveTimer)();
  finish(); await current;
  assert.deepEqual(published, ['AUTOSAVE-second']);
  const stopped = callbacks.get(state.autosaveTimer)();
  autosave.stopAutosave();
  finish(); await stopped;
  assert.equal(callbacks.size, 0);
  assert.deepEqual(published, ['AUTOSAVE-second'], 'stop invalidates an in-flight completion');
  state.session.status = 'TERMINAL';
  autosave.startAutosave();
  await callbacks.get(state.autosaveTimer)();
  assert.equal(writes, 3, 'terminal sessions do not save');
  autosave.stopAutosave();
});
