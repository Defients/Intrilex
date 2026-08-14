// puzzle-app.mjs - Route handler + controller glue for Puzzle Mode v0.1.0.
//
// Owns a single PuzzleRuntime instance and the DOM event wiring for the
// #/dev/puzzles route. The renderer is a pure function; this module owns state.
//
// Analysis runs only when explicitly requested (Analyze button) and is bound
// to the exact state fingerprint at request time so stale async results never
// overwrite newer puzzle state.

import { PuzzleRuntime, setAutonomyModule } from './puzzle-runtime.mjs';
import { analyzePuzzle } from './puzzle-solver.mjs';
import { listPuzzleDefinitions, getPuzzleDefinition } from './puzzle-fixtures.mjs';
import { renderPuzzleWorkspace } from './puzzle-renderer.mjs';
import { reconstructInitialState } from './puzzle-runtime.mjs';
import { PuzzleRuntimeStatus, PuzzleResultKind } from './puzzle-types.mjs';
import { recordPuzzleAttempt, getPuzzleProgress } from './puzzle-progress.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let _runtime = null;
let _currentId = null;
let _solverResult = null;
let _analyzing = false;
let _analysisFingerprint = null;
let _lastRecordedId = null;
let _lastRecordedResult = null;

async function ensureAutonomy() {
  // Inject the autonomy-runtime module so the AI opponent policy works.
  // Optional: without it, AI policy falls back to first-legal.
  try {
    const mod = await import('../autonomy-runtime.js');
    setAutonomyModule(mod);
  } catch (e) {
    console.warn('[puzzle] autonomy-runtime unavailable; AI opponent policy falls back to first-legal', e);
  }
}

function rerender(container) {
  const snap = _runtime ? _runtime.getSnapshot() : { status: PuzzleRuntimeStatus.UNLOADED };
  const diagnostics = _runtime ? _runtime.getDiagnostics() : null;
  const fixtures = listPuzzleDefinitions();
  // Record puzzle attempt result when the puzzle reaches a terminal state
  if (_runtime && _currentId && _runtime.attempt) {
    const result = _runtime.attempt.result;
    if (result === PuzzleResultKind.SUCCESS || result === PuzzleResultKind.FAILURE) {
      // Only record once per attempt — check if we already recorded this result
      if (_lastRecordedId !== _currentId || _lastRecordedResult !== result) {
        recordPuzzleAttempt(_currentId, result);
        _lastRecordedId = _currentId;
        _lastRecordedResult = result;
      }
    }
  }
  const progress = getPuzzleProgress();
  container.innerHTML = renderPuzzleWorkspace(snap, {
    fixtures,
    currentId: _currentId,
    diagnostics,
    solverResult: _solverResult,
    analyzing: _analyzing,
    puzzleProgress: progress,
  });
  bindEvents(container);
}

function bindEvents(container) {
  const loadBtn = container.querySelector('#puzzle-load');
  const restartBtn = container.querySelector('#puzzle-restart');
  const analyzeBtn = container.querySelector('#puzzle-analyze');
  const select = container.querySelector('#puzzle-select');
  if (loadBtn) loadBtn.addEventListener('click', () => {
    const id = select?.value;
    if (id) loadPuzzle(container, id);
  });
  if (restartBtn) restartBtn.addEventListener('click', () => {
    if (_runtime) {
      _solverResult = null;
      _runtime.restart();
      rerender(container);
    }
  });
  if (analyzeBtn) analyzeBtn.addEventListener('click', () => runAnalysis(container));
  for (const btn of container.querySelectorAll('[data-puzzle-action]')) {
    btn.addEventListener('click', () => {
      if (!_runtime) return;
      const actionId = btn.getAttribute('data-puzzle-action');
      _solverResult = null;
      const res = _runtime.submitAction(actionId);
      if (!res.accepted) console.warn('[puzzle] action rejected:', res.error);
      rerender(container);
    });
  }
}

function loadPuzzle(container, id) {
  const def = getPuzzleDefinition(id);
  if (!def) {
    container.innerHTML = `<div class="puzzle-error">Unknown puzzle id: ${esc(id)}</div>`;
    return;
  }
  _currentId = id;
  _solverResult = null;
  _analyzing = false;
  _lastRecordedId = null;
  _lastRecordedResult = null;
  if (!_runtime) _runtime = new PuzzleRuntime({ autoAdvance: true });
  const result = _runtime.load(def);
  if (!result.valid) console.warn('[puzzle] validation issues:', result.issues);
  rerender(container);
}

function runAnalysis(container) {
  if (!_runtime || !_runtime.state) return;
  if (_analyzing) return;
  const def = _runtime.definition;
  // Bind analysis to the current state fingerprint so stale results are dropped.
  const state = _runtime.state;
  _analysisFingerprint = _runtime.getSnapshot().stateFingerprint;
  _analyzing = true;
  rerender(container);
  // Run synchronously off the event loop via setTimeout to keep UI responsive.
  setTimeout(() => {
    try {
      // Clone the state so analysis never mutates the live puzzle state.
      const cloned = structuredClone(state);
      const result = analyzePuzzle(def, cloned, { maxNodes: 30000, timeoutMs: 5000, maxDepth: 16 });
      // Only accept if the live state hasn't changed during analysis.
      const liveFp = _runtime.getSnapshot().stateFingerprint;
      if (liveFp === _analysisFingerprint) {
        _solverResult = result;
      } else {
        console.warn('[puzzle] analysis result discarded (stale state)');
      }
    } catch (e) {
      _solverResult = { status: 'ERROR', proven: false, nodesExplored: 0, depth: 0, actions: [], elapsedMs: 0, reason: e.message };
    } finally {
      _analyzing = false;
      rerender(container);
    }
  }, 0);
}

/**
 * Route handler for #/dev/puzzles.
 * @param {HTMLElement} container
 */
export async function handlePuzzleRoute(container) {
  await ensureAutonomy();
  if (!_runtime) _runtime = new PuzzleRuntime({ autoAdvance: true });
  // Auto-load the first fixture on first entry so the surface is immediately functional.
  if (!_currentId) {
    const fixtures = listPuzzleDefinitions();
    if (fixtures.length > 0) {
      loadPuzzle(container, fixtures[0].id);
      return;
    }
  }
  rerender(container);
}

export { reconstructInitialState };
