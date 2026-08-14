// ═══════════════════════════════════════════════════════════════
// rerender.js — IRX-C06: Decoupled re-render bus
//
// Breaks the backedge from workspace modules to app.js.
// Instead of `import('../app.js').then(m => m.render())`,
// workspace modules call `rerender()` from this module.
//
// app.js registers its render() function on boot via setRenderer().
// Workspace modules import { rerender } from this module.
//
// This prevents duplicate ESM graphs caused by:
//   - Raw vs hashed URL imports of app.js
//   - Cache-busting query parameters creating distinct module instances
// ═══════════════════════════════════════════════════════════════

let _renderer = null;
// IRX-C06 (residual): Track missed rerender calls so app.js can detect
// if workspace modules tried to re-render before the renderer was registered
// (e.g., during async boot). The warning fires once to avoid console spam.
let _missedCount = 0;
let _warned = false;

/**
 * Register the render function that app.js provides.
 * Called once on boot from app.js.
 * @param {function} fn - The render function from app.js
 */
export function setRenderer(fn) {
  _renderer = fn;
  // If workspace modules called rerender() before registration, replay
  // a single render call so their UI updates aren't lost.
  if (_missedCount > 0 && fn) {
    try { fn(); } catch (e) { console.warn('[rerender] replay render failed:', e); }
    _missedCount = 0;
  }
}

/**
 * Trigger a re-render of the application.
 * If no renderer is registered, this is a fail-safe no-op but emits a
 * diagnostic warning so developers can identify why the UI isn't updating.
 */
export function rerender() {
  if (_renderer) {
    _renderer();
  } else {
    _missedCount++;
    if (!_warned) {
      _warned = true;
      console.warn('[rerender] rerender() called before setRenderer() — UI will not update until app.js registers. This is a diagnostic warning; the call will be replayed on registration.');
    }
  }
}

/**
 * Clear the registered renderer (for testing).
 */
export function clearRenderer() {
  _renderer = null;
  _missedCount = 0;
  _warned = false;
}
