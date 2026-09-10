// ═══════════════════════════════════════════════════════════════
// forensic-viewer.mjs — Forensic replay viewer UI
//
// Renders the forensic replay workspace with:
//   - Bookmark panel (add, list, remove, navigate)
//   - Annotation panel (add, list, remove)
//   - Branch panel (create alternate lines, compare)
//   - Puzzle generation from bookmarked positions
//   - Comparison view
//
// This module is the UI layer — it imports the pure model functions
// and persistence layer, but contains no business logic itself.
// When the rendering architecture consolidates to React/TypeScript,
// only this file needs rewriting — the model stays unchanged.
// ═══════════════════════════════════════════════════════════════

import {
  createForensicSession,
  addBookmark,
  removeBookmark,
  sortedBookmarks,
  addBranch,
  removeBranch,
  branchesAtFrame,
  addAnnotation,
  removeAnnotation,
  annotationsAtFrame,
  addComparison,
  removeComparison,
  frameSummary,
  exportForensicSession,
} from './forensic-model.mjs';

import {
  saveForensicSession,
  loadForensicSession,
  deleteForensicSession,
  listForensicSessionIds,
} from './forensic-persistence.mjs';

import { derivePuzzleFromReplay, suggestObjectiveType } from './puzzle-generator.mjs';
import { generateTraceInsights, renderTraceInsights, generateReplayCommentary, recommendPracticeFromInsight } from './trace-teaching.mjs';

// Phase 5 consolidation seam: use the shared store-adapter instead of
// a bare module-level _state object. The store provides immutable
// snapshots, subscribe/notify, and is compatible with React's
// useSyncExternalStore for future migration. The external API is
// unchanged — callers still use initForensicViewer, getForensicState,
// setCurrentFrame, renderForensicSidebar, handleForensicAction.
import { createStore } from '../store-adapter.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Forensic viewer store (module-level, reset on navigation).
 * Uses the shared store-adapter for immutable snapshots and
 * subscribe/notify support.
 * @type {object|null}
 */
let _store = null;

/**
 * Initialize forensic viewer state for a replay.
 * @param {string} replayId
 * @param {object} certifiedReplay
 * @param {number} currentFrameIndex
 */
export async function initForensicViewer(replayId, certifiedReplay, currentFrameIndex = 0) {
  let session = await loadForensicSession(replayId);
  if (!session) {
    session = createForensicSession(replayId);
  }
  _store = createStore({
    session,
    certifiedReplay,
    currentFrameIndex,
    selectedBookmarkId: null,
    annotationText: '',
    bookmarkLabel: '',
    branchLabel: '',
    comparisonFrameCount: sortedBookmarks(session).length,
    activeComparison: null,
    traceInsights: null,
    replayCommentary: null,
    replayCommentaryMap: null,
  });
  return _store.getSnapshot();
}

/**
 * Get current forensic viewer state (immutable snapshot).
 * @returns {object|null}
 */
export function getForensicState() {
  return _store?.getSnapshot() ?? null;
}

/**
 * Get the underlying store (for React useSyncExternalStore integration).
 * @returns {object|null}
 */
export function getForensicStore() {
  return _store;
}

/**
 * Subscribe to forensic state changes.
 * @param {function} listener
 * @returns {function} Unsubscribe function
 */
export function subscribeForensic(listener) {
  if (!_store) return () => {};
  return _store.subscribe(listener);
}

/**
 * Get the replay commentary for a specific frame, or null if no commentary
 * has been generated or no commentary exists at that frame.
 * @param {number} frameIndex
 * @returns {{ frameIndex: number, commentary: string, category: string } | null}
 */
export function getFrameCommentary(frameIndex) {
  const state = _store?.getSnapshot();
  if (!state?.replayCommentary) return null;
  // Use the Map index for O(1) lookup when available, fall back to linear scan.
  if (state.replayCommentaryMap) {
    return state.replayCommentaryMap.get(frameIndex) ?? null;
  }
  return state.replayCommentary.find(c => c.frameIndex === frameIndex) ?? null;
}

/**
 * Render a commentary banner for the current frame.
 * Returns HTML string, or empty string if no commentary exists.
 * @param {number} frameIndex
 * @returns {string}
 */
export function renderFrameCommentary(frameIndex) {
  const commentary = getFrameCommentary(frameIndex);
  if (!commentary) return '';
  return `<div class="forensic-commentary-banner" data-testid="forensic-commentary-banner" data-category="${esc(commentary.category)}">
    <span class="forensic-commentary-icon" aria-hidden="true">💡</span>
    <span class="forensic-commentary-text">${esc(commentary.commentary)}</span>
  </div>`;
}

/**
 * Persist the current session to storage.
 */
async function persist() {
  const state = _store?.getSnapshot();
  if (!state?.session) return;
  await saveForensicSession(state.session);
}

/**
 * Update the current frame index and refresh state.
 * @param {number} frameIndex
 */
export function setCurrentFrame(frameIndex) {
  if (_store) _store.setState({ currentFrameIndex: frameIndex });
}

/**
 * Render the forensic sidebar panel (shown alongside the Watch workspace).
 * Returns HTML string for the panel.
 * @returns {string}
 */
export function renderForensicSidebar() {
  const state = _store?.getSnapshot();
  if (!state?.session) return '';
  const { session, currentFrameIndex } = state;
  const summary = frameSummary(session, currentFrameIndex);
  const bookmarks = sortedBookmarks(session);
  const annotations = annotationsAtFrame(session, currentFrameIndex);
  const branches = branchesAtFrame(session, currentFrameIndex);

  return `<div class="forensic-sidebar" data-testid="forensic-sidebar">
    <div class="forensic-sidebar-header">
      <h3>Forensic Tools</h3>
      <span class="forensic-frame-label" data-testid="forensic-frame-label">Frame ${currentFrameIndex}</span>
    </div>

    <div class="forensic-section" data-testid="forensic-bookmark-section">
      <div class="forensic-section-header">
        <h4>Bookmarks (${bookmarks.length})</h4>
        ${summary.hasBookmark ? '<span class="forensic-active-indicator" aria-label="Bookmark at this frame">●</span>' : ''}
      </div>
      <div class="forensic-bookmark-actions">
        <input type="text" id="forensic-bookmark-label" placeholder="Label (optional)" value="${esc(state.bookmarkLabel)}" aria-label="Bookmark label">
        <button class="forensic-btn" data-forensic-action="add-bookmark" data-testid="forensic-add-bookmark">+ Bookmark this frame</button>
      </div>
      ${bookmarks.length > 0 ? `
        <ul class="forensic-bookmark-list" data-testid="forensic-bookmark-list">
          ${bookmarks.map(b => `
            <li class="forensic-bookmark-item ${b.frameIndex === currentFrameIndex ? 'current' : ''}" data-bookmark-id="${esc(b.id)}">
              <button class="forensic-bookmark-jump" data-forensic-action="jump-bookmark" data-bookmark-id="${esc(b.id)}" data-frame="${b.frameIndex}" data-testid="forensic-jump-bookmark">
                <span class="forensic-bookmark-frame">F${b.frameIndex}</span>
                <span class="forensic-bookmark-label">${esc(b.label || 'Untitled')}</span>
              </button>
              <button class="forensic-bookmark-delete" data-forensic-action="remove-bookmark" data-bookmark-id="${esc(b.id)}" aria-label="Delete bookmark" data-testid="forensic-delete-bookmark">×</button>
            </li>
          `).join('')}
        </ul>
      ` : '<p class="forensic-empty">No bookmarks yet.</p>'}
    </div>

    <div class="forensic-section" data-testid="forensic-annotation-section">
      <div class="forensic-section-header">
        <h4>Annotations (${annotations.length} at this frame)</h4>
      </div>
      <div class="forensic-annotation-input">
        <textarea id="forensic-annotation-text" placeholder="Annotate this frame..." rows="2" aria-label="Annotation text">${esc(state.annotationText)}</textarea>
        <button class="forensic-btn" data-forensic-action="add-annotation" data-testid="forensic-add-annotation">+ Add note</button>
      </div>
      ${annotations.length > 0 ? `
        <ul class="forensic-annotation-list" data-testid="forensic-annotation-list">
          ${annotations.map(a => `
            <li class="forensic-annotation-item" data-annotation-id="${esc(a.id)}">
              <p class="forensic-annotation-text">${esc(a.text)}</p>
              <button class="forensic-annotation-delete" data-forensic-action="remove-annotation" data-annotation-id="${esc(a.id)}" aria-label="Delete annotation" data-testid="forensic-delete-annotation">×</button>
            </li>
          `).join('')}
        </ul>
      ` : ''}
    </div>

    <div class="forensic-section" data-testid="forensic-branch-section">
      <div class="forensic-section-header">
        <h4>Branches (${branches.length} at this frame)</h4>
      </div>
      <div class="forensic-branch-actions">
        <input type="text" id="forensic-branch-label" placeholder="Branch label" value="${esc(state.branchLabel)}" aria-label="Branch label">
        <button class="forensic-btn" data-forensic-action="create-branch" data-testid="forensic-create-branch">+ Explore alternate line</button>
      </div>
      ${branches.length > 0 ? `
        <ul class="forensic-branch-list" data-testid="forensic-branch-list">
          ${branches.map(b => `
            <li class="forensic-branch-item" data-branch-id="${esc(b.id)}">
              <span class="forensic-branch-label">${esc(b.label || 'Untitled branch')}</span>
              <span class="forensic-branch-commands">${b.alternateCommands.length} alt commands</span>
              <button class="forensic-branch-delete" data-forensic-action="remove-branch" data-branch-id="${esc(b.id)}" aria-label="Delete branch" data-testid="forensic-delete-branch">×</button>
            </li>
          `).join('')}
        </ul>
      ` : '<p class="forensic-empty">No branches at this frame.</p>'}
    </div>

    <div class="forensic-section" data-testid="forensic-comparison-section">
      <div class="forensic-section-header">
        <h4>Comparisons (${session.comparisons.length})</h4>
      </div>
      <div class="forensic-comparison-actions">
        <button class="forensic-btn" data-forensic-action="add-comparison-frame" data-testid="forensic-add-comparison-frame" ${state.comparisonFrameCount < 2 ? 'disabled' : ''}>Compare current vs saved frame</button>
      </div>
      ${session.comparisons.length > 0 ? `
        <ul class="forensic-comparison-list" data-testid="forensic-comparison-list">
          ${session.comparisons.map(c => `
            <li class="forensic-comparison-item" data-comparison-id="${esc(c.id)}">
              <button class="forensic-comparison-view" data-forensic-action="view-comparison" data-comparison-id="${esc(c.id)}" data-testid="forensic-view-comparison">
                <span class="forensic-comparison-label">${esc(c.label)}</span>
                <span class="forensic-comparison-entries">${c.entries.length} positions</span>
              </button>
              <button class="forensic-comparison-delete" data-forensic-action="remove-comparison" data-comparison-id="${esc(c.id)}" aria-label="Delete comparison" data-testid="forensic-delete-comparison">×</button>
            </li>
          `).join('')}
        </ul>
      ` : '<p class="forensic-empty">No comparisons yet. Bookmark 2+ frames, then compare them.</p>'}
    </div>

    <div class="forensic-section" data-testid="forensic-puzzle-section">
      <div class="forensic-section-header">
        <h4>Puzzle Generation</h4>
      </div>
      <button class="forensic-btn forensic-btn-primary" data-forensic-action="generate-puzzle" data-testid="forensic-generate-puzzle">Generate puzzle from this frame</button>
    </div>

    <div class="forensic-section" data-testid="forensic-teaching-section">
      <div class="forensic-section-header">
        <h4>Teaching Insights</h4>
        <button class="forensic-btn forensic-btn-small" data-forensic-action="generate-insights" data-testid="forensic-generate-insights">Analyze replay</button>
      </div>
      <div class="forensic-trace-insights" data-testid="forensic-trace-insights">
        ${state.traceInsights ? renderTraceInsights(state.traceInsights) : '<p class="forensic-empty">Click "Analyze replay" to generate frame-level teaching insights.</p>'}
      </div>
    </div>

    <div class="forensic-section forensic-section-footer">
      <button class="forensic-btn" data-forensic-action="export-session" data-testid="forensic-export">Export session</button>
      <button class="forensic-btn forensic-btn-danger" data-forensic-action="clear-session" data-testid="forensic-clear">Clear all</button>
    </div>
  </div>`;
}

/**
 * Render the side-by-side comparison overlay.
 * Shows when activeComparison is set in the store state.
 * Returns HTML string for the overlay, or empty string if no active comparison.
 * @returns {string}
 */
export function renderForensicComparisonOverlay() {
  const state = _store?.getSnapshot();
  if (!state?.activeComparison) return '';
  const comparison = state.activeComparison;
  const replay = state.certifiedReplay;
  const frames = replay?.frames ?? [];

  return `<div class="forensic-comparison-overlay" data-testid="forensic-comparison-overlay" role="dialog" aria-modal="true" aria-label="${esc(comparison.label)}">
    <div class="forensic-comparison-panel">
      <div class="forensic-comparison-panel-header">
        <h3>${esc(comparison.label)}</h3>
        <button class="forensic-comparison-close" data-forensic-action="close-comparison" data-testid="forensic-close-comparison" aria-label="Close comparison">×</button>
      </div>
      <div class="forensic-comparison-grid">
        ${comparison.entries.map(entry => {
          const frame = frames[entry.frameIndex];
          const frameState = frame?.state ?? null;
          const players = frameState?.players ? Object.keys(frameState.players) : [];
          const turn = frameState?.turn ?? '?';
          const phase = frameState?.phase ?? '?';
          const pileCount = frameState?.drawPile?.length ?? '?';
          const discardCount = frameState?.discardPile?.length ?? '?';
          return `<div class="forensic-comparison-cell" data-testid="forensic-comparison-cell">
            <div class="forensic-comparison-cell-header">
              <span class="forensic-comparison-cell-label">${esc(entry.label || `Frame ${entry.frameIndex}`)}</span>
              <span class="forensic-comparison-cell-frame">F${entry.frameIndex}</span>
            </div>
            <div class="forensic-comparison-cell-body">
              <dl>
                <dt>Turn</dt><dd>${turn}</dd>
                <dt>Phase</dt><dd>${phase}</dd>
                <dt>Draw pile</dt><dd>${pileCount}</dd>
                <dt>Discard</dt><dd>${discardCount}</dd>
                <dt>Players</dt><dd>${players.join(', ')}</dd>
              </dl>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

/**
 * Handle a forensic UI action.
 * @param {string} action
 * @param {object} data
 * @param {function} rerender - Callback to trigger UI re-render
 * @returns {Promise<{frameJump?: number, puzzle?: object, exportJson?: string, message?: string}>}
 */
export async function handleForensicAction(action, data, rerender) {
  const state = _store?.getSnapshot();
  if (!state?.session) return {};

  switch (action) {
    case 'add-bookmark': {
      const updated = addBookmark(state.session, {
        frameIndex: state.currentFrameIndex,
        label: data.label || '',
        note: '',
      });
      _store.setState({ session: updated, bookmarkLabel: '', comparisonFrameCount: sortedBookmarks(updated).length });
      await persist();
      if (rerender) rerender();
      return { message: 'Bookmark added' };
    }

    case 'remove-bookmark': {
      const updated = removeBookmark(state.session, data.bookmarkId);
      _store.setState({ session: updated, comparisonFrameCount: sortedBookmarks(updated).length });
      await persist();
      if (rerender) rerender();
      return { message: 'Bookmark removed' };
    }

    case 'jump-bookmark': {
      return { frameJump: data.frameIndex };
    }

    case 'add-annotation': {
      if (!data.text || !data.text.trim()) return { message: 'Annotation text required' };
      const updated = addAnnotation(state.session, {
        frameIndex: state.currentFrameIndex,
        text: data.text.trim(),
      });
      _store.setState({ session: updated, annotationText: '' });
      await persist();
      if (rerender) rerender();
      return { message: 'Annotation added' };
    }

    case 'remove-annotation': {
      const updated = removeAnnotation(state.session, data.annotationId);
      _store.setState({ session: updated });
      await persist();
      if (rerender) rerender();
      return { message: 'Annotation removed' };
    }

    case 'create-branch': {
      // The branch is created with empty alternate commands for now.
      // The caller (Watch workspace) will populate alternate commands
      // by loading legal actions at the current frame and letting the
      // user select an alternate line.
      const updated = addBranch(state.session, {
        parentFrameIndex: state.currentFrameIndex,
        alternateCommands: data.alternateCommands || [],
        label: data.label || '',
      });
      _store.setState({ session: updated, branchLabel: '' });
      await persist();
      if (rerender) rerender();
      return { message: 'Branch created' };
    }

    case 'remove-branch': {
      const updated = removeBranch(state.session, data.branchId);
      _store.setState({ session: updated });
      await persist();
      if (rerender) rerender();
      return { message: 'Branch removed' };
    }

    case 'add-comparison-frame': {
      // Create a comparison between the current frame and the most
      // recent bookmark at a different frame.
      const bookmarks = sortedBookmarks(state.session);
      if (bookmarks.length < 2) {
        return { message: 'Need at least 2 bookmarks to compare' };
      }
      const otherBookmark = bookmarks.find(b => b.frameIndex !== state.currentFrameIndex);
      if (!otherBookmark) {
        return { message: 'No other bookmark to compare with' };
      }
      const replayId = state.session.replayId;
      const updated = addComparison(state.session, {
        label: `Frame ${state.currentFrameIndex} vs Frame ${otherBookmark.frameIndex}`,
        entries: [
          { replayId, frameIndex: state.currentFrameIndex, label: 'Current' },
          { replayId, frameIndex: otherBookmark.frameIndex, label: otherBookmark.label || `Frame ${otherBookmark.frameIndex}` },
        ],
      });
      _store.setState({ session: updated, comparisonFrameCount: sortedBookmarks(updated).length });
      await persist();
      if (rerender) rerender();
      return { message: 'Comparison created' };
    }

    case 'view-comparison': {
      const comparison = state.session.comparisons.find(c => c.id === data.comparisonId);
      if (!comparison) return { message: 'Comparison not found' };
      _store.setState({ activeComparison: comparison });
      if (rerender) rerender();
      return { comparison, message: `Viewing: ${comparison.label}` };
    }

    case 'remove-comparison': {
      const updated = removeComparison(state.session, data.comparisonId);
      _store.setState({ session: updated, activeComparison: null });
      await persist();
      if (rerender) rerender();
      return { message: 'Comparison removed' };
    }

    case 'close-comparison': {
      _store.setState({ activeComparison: null });
      if (rerender) rerender();
      return { message: 'Comparison closed' };
    }

    case 'generate-insights': {
      if (!state.certifiedReplay?.frames) return { message: 'No replay frames to analyze' };
      const insights = generateTraceInsights(state.certifiedReplay, { perspectivePlayerId: 'P1' });
      const commentary = generateReplayCommentary(state.certifiedReplay, { perspectivePlayerId: 'P1' });
      // Build a Map for O(1) frame→commentary lookup instead of linear scan.
      const commentaryMap = new Map(commentary.map(c => [c.frameIndex, c]));
      _store.setState({ traceInsights: insights, replayCommentary: commentary, replayCommentaryMap: commentaryMap });
      if (rerender) rerender();
      return { insights, commentary, message: `Generated ${insights.length} teaching insights` };
    }

    case 'add-bookmark-from-insight': {
      const frameIndex = Number(data.frame ?? data.frameIndex);
      const label = data.label || '';
      const updated = addBookmark(state.session, { frameIndex, label });
      _store.setState({ session: updated, comparisonFrameCount: sortedBookmarks(updated).length });
      await persist();
      if (rerender) rerender();
      return { message: 'Bookmark added from insight', frameJump: frameIndex };
    }

    case 'practice-from-insight': {
      if (!state.certifiedReplay) return { message: 'No replay loaded' };
      const frameIndex = Number(data.frame ?? data.frameIndex);
      const category = data.category || 'tempo';
      // Use the shared recommendation function instead of duplicating the
      // category→objective mapping here.
      const insight = { id: `practice-${frameIndex}`, category, frameIndex, title: '', observation: '', alternative: '', consequence: '', lesson: '' };
      const rec = recommendPracticeFromInsight(insight, state.certifiedReplay);
      const objectiveType = rec?.objectiveType ?? 'WIN_WITHIN_TURNS';
      const puzzle = derivePuzzleFromReplay({
        certifiedReplay: state.certifiedReplay,
        frameIndex,
        perspectivePlayerId: 'P1',
        objectiveType,
      });
      return { puzzle, message: `Practice puzzle generated from frame ${frameIndex}` };
    }

    case 'generate-puzzle': {
      if (!state.certifiedReplay) return { message: 'No replay loaded' };
      // Use the frame state from the certified replay if available.
      // The caller can also pass a frameState in data for better suggestions.
      const frameState = data.frameState ?? null;
      const objectiveType = suggestObjectiveType(frameState, 'P1');
      const puzzle = derivePuzzleFromReplay({
        certifiedReplay: state.certifiedReplay,
        frameIndex: state.currentFrameIndex,
        perspectivePlayerId: 'P1',
        objectiveType,
      });
      return { puzzle, message: `Puzzle generated: ${puzzle.id}` };
    }

    case 'export-session': {
      const json = exportForensicSession(state.session);
      return { exportJson: json, message: 'Session exported' };
    }

    case 'clear-session': {
      await deleteForensicSession(state.session.replayId);
      const cleared = createForensicSession(state.session.replayId);
      _store.setState({ session: cleared, comparisonFrameCount: 0, activeComparison: null });
      if (rerender) rerender();
      return { message: 'Session cleared' };
    }

    default:
      return {};
  }
}

/**
 * Render the full forensic workspace (/forensic route).
 * Shows a list of replays with forensic sessions and allows loading
 * a replay into the forensic-enhanced Watch workspace.
 * @param {HTMLElement} container
 */
export async function renderForensicWorkspace(container) {
  const sessionIds = await listForensicSessionIds();

  if (sessionIds.length === 0) {
    container.innerHTML = `<div class="forensic-workspace" data-testid="forensic-workspace">
      <a class="play-hub-back" href="#/" aria-label="Back to home">← Back</a>
      <h1>Forensic Replay Lab</h1>
      <div class="forensic-empty-state" data-testid="forensic-empty-state">
        <span class="forensic-empty-icon" aria-hidden="true">🔬</span>
        <strong>No forensic sessions yet.</strong>
        <p>Watch a replay and use the forensic tools to bookmark key frames, explore alternate lines, annotate decisions, and generate puzzles.</p>
        <a href="#/play/replays" class="primary-button" data-testid="forensic-browse-replays">Browse replays</a>
      </div>
    </div>`;
    return;
  }

  const items = await Promise.all(sessionIds.map(async (replayId) => {
    const session = await loadForensicSession(replayId);
    if (!session) return null;
    return {
      replayId,
      bookmarkCount: session.bookmarks?.length ?? 0,
      branchCount: session.branches?.length ?? 0,
      annotationCount: session.annotations?.length ?? 0,
      comparisonCount: session.comparisons?.length ?? 0,
      updatedAt: session.updatedAt ?? session.createdAt ?? '',
    };
  }));

  const validItems = items.filter(Boolean).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  container.innerHTML = `<div class="forensic-workspace" data-testid="forensic-workspace">
    <a class="play-hub-back" href="#/" aria-label="Back to home">← Back</a>
    <h1>Forensic Replay Lab</h1>
    <p class="forensic-workspace-desc">Bookmark, branch, annotate, and compare replays. Generate puzzles from key positions.</p>
    <table class="forensic-table" data-testid="forensic-table">
      <thead>
        <tr><th>Replay</th><th>Bookmarks</th><th>Branches</th><th>Annotations</th><th>Updated</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${validItems.map(item => `
          <tr data-replay-id="${esc(item.replayId)}" data-testid="forensic-session-row">
            <td class="mono">${esc(item.replayId)}</td>
            <td>${item.bookmarkCount}</td>
            <td>${item.branchCount}</td>
            <td>${item.annotationCount}</td>
            <td>${esc(new Date(item.updatedAt).toLocaleDateString())}</td>
            <td>
              <button class="secondary-button" data-forensic-action="open-session" data-replay-id="${esc(item.replayId)}" data-testid="forensic-open-session">Open in Watch</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;

  // Wire up open-session buttons — navigate to Watch with the replay loaded.
  // The Watch workspace's renderWatch() will initialize the forensic viewer
  // automatically when it detects a replay with forensic data.
  container.querySelectorAll('[data-forensic-action="open-session"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const replayId = btn.dataset.replayId;
      // Try to load the replay from local IndexedDB and navigate to Watch.
      // The replay library stores records with replayId = "R-{sessionId}".
      // The Watch workspace uses state.fixtureId to identify replays.
      try {
        const { getReplay } = await import('../play/persistence.js');
        const { ensureReplayFrames } = await import('../replay-frames.js');
        const record = await getReplay(replayId);
        if (record && record.certifiedReplay) {
          // Set the replay in the global observatory state and navigate to Watch.
          // This mirrors the watchLocalReplay() flow in play-app.js.
          const replay = { ...record.certifiedReplay, frames: undefined };
          await ensureReplayFrames(replay);
          // Access the global app state — this is set by app.js on boot.
          const appState = window.__intrilexState;
          if (appState) {
            appState.replay = replay;
            appState.authorized = null;
            appState.fixtureId = record.sessionId ?? replayId;
            appState._replayLoadedFor = appState.fixtureId;
            appState.frame = 0;
            appState.playing = false;
            appState.replayKind = 'corpus';
            appState.visibility = 'public';
          }
          location.hash = '#/watch';
        } else {
          // Replay not found in local storage — just navigate to Watch
          // and let the user select from the replay library.
          location.hash = '#/play/replays';
        }
      } catch (err) {
        console.error('[forensic] failed to load replay for Watch:', err);
        location.hash = '#/play/replays';
      }
    });
  });
}
