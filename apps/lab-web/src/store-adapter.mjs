// ═══════════════════════════════════════════════════════════════
// store-adapter.mjs — Vanilla-JS-compatible state store
//
// This is the second architectural consolidation seam: it provides
// a state management pattern that bridges the gap between the
// existing global mutable `state` object (from state.js) and the
// React `GameStore` pattern (from client/game-store.ts).
//
// The store follows the same subscribe/getSnapshot pattern as
// GameStore, making it compatible with React's useSyncExternalStore
// when needed. But it's also usable from vanilla JS workspaces
// without React.
//
// Migration path:
//   1. New workspaces use createStore() instead of mutating global state
//   2. Existing workspaces can be gradually migrated
//   3. The global `state` object can eventually be replaced by stores
//   4. React workspaces can consume stores via useSyncExternalStore
// ═══════════════════════════════════════════════════════════════

/**
 * Create a vanilla-JS-compatible state store.
 *
 * @param {object} initialState - The initial state object
 * @param {function} [reducer] - Optional reducer: (state, action) => newState
 * @returns {object} Store with getSnapshot, subscribe, setState, dispatch, dispose
 */
export function createStore(initialState, reducer) {
  if (initialState === undefined || initialState === null) {
    throw new Error('STORE_INVALID_INITIAL_STATE');
  }

  let state = Object.freeze({ ...initialState });
  let disposed = false;
  const listeners = new Set();

  function getSnapshot() {
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('STORE_INVALID_LISTENER');
    }
    if (!disposed) listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function setState(updater) {
    if (disposed) return;
    let next;
    if (typeof updater === 'function') {
      next = updater(state);
    } else if (typeof updater === 'object' && updater !== null) {
      next = { ...state, ...updater };
    } else {
      throw new Error('STORE_INVALID_UPDATER');
    }
    if (next === state) return; // No change
    state = Object.freeze(next);
    for (const listener of [...listeners]) {
      if (disposed) break;
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch {
        // Continue notifying other listeners even if one throws
        continue;
      }
    }
  }

  function dispatch(action) {
    if (disposed) return;
    if (!reducer) {
      throw new Error('STORE_NO_REDUCER');
    }
    const next = reducer(state, action);
    if (next !== state) {
      state = Object.freeze(next);
      for (const listener of [...listeners]) {
        if (disposed) break;
        if (!listeners.has(listener)) continue;
        try {
          listener();
        } catch {
          continue;
        }
      }
    }
  }

  function dispose() {
    disposed = true;
    listeners.clear();
  }

  return Object.freeze({ getSnapshot, subscribe, setState, dispatch, dispose });
}

/**
 * Create a selector hook for a store. Returns a function that
 * extracts a specific slice of the store's state.
 *
 * @param {object} store - A store created by createStore()
 * @param {function} selector - (state) => slice
 * @returns {function} A function that returns the current slice value
 */
export function createSelector(store, selector) {
  if (typeof selector !== 'function') {
    throw new Error('STORE_INVALID_SELECTOR');
  }
  return () => selector(store.getSnapshot());
}

/**
 * Create a derived store that depends on one or more parent stores.
 * The derived store updates when any parent store updates.
 *
 * @param {object[]} stores - Array of parent stores
 * @param {function} derive - (states) => derivedState
 * @returns {object} A derived store with the same interface
 */
export function createDerivedStore(stores, derive) {
  if (!Array.isArray(stores) || stores.length === 0) {
    throw new Error('STORE_INVALID_PARENTS');
  }
  if (typeof derive !== 'function') {
    throw new Error('STORE_INVALID_DERIVE');
  }

  let disposed = false;
  const listeners = new Set();
  let cachedSnapshot = null;

  function computeSnapshot() {
    const parentStates = stores.map(s => s.getSnapshot());
    return Object.freeze(derive(...parentStates));
  }

  function getSnapshot() {
    // Always recompute when called directly — the cache is only valid
    // between notifications. If a parent changed without a listener
    // being subscribed, the cache would be stale.
    if (listeners.size === 0) {
      cachedSnapshot = null;
    }
    if (cachedSnapshot === null) {
      cachedSnapshot = computeSnapshot();
    }
    return cachedSnapshot;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('STORE_INVALID_LISTENER');
    }
    if (disposed) return () => {};
    listeners.add(listener);
    const unsubs = stores.map(s => s.subscribe(() => {
      cachedSnapshot = null; // Invalidate cache
      for (const l of [...listeners]) {
        if (disposed) break;
        if (!listeners.has(l)) continue;
        try {
          l();
        } catch {
          continue;
        }
      }
    }));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        unsubs.forEach(u => u());
      }
    };
  }

  function dispose() {
    disposed = true;
    listeners.clear();
    cachedSnapshot = null;
  }

  return Object.freeze({ getSnapshot, subscribe, dispose });
}
