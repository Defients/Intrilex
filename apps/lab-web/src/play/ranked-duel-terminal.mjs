// ═══════════════════════════════════════════════════════════════
// ranked-duel-terminal.mjs — Terminal, error, and keyboard help renderers.
// Extracted from ranked-duel-renderer.mjs for modularity.
// ═══════════════════════════════════════════════════════════════

import { getTerminalBanter } from './ai-personality.js';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Format a phase string for display.
 */
export function formatPhase(phase) {
  if (!phase) return '';
  return String(phase).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a termination reason for display.
 */
export function formatTerminationReason(reason) {
  if (!reason) return 'Unknown';
  return String(reason).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Render the terminal match screen.
 */
export function renderTerminal(vm, opts) {
  const winner = vm.match.winner ?? null;
  const humanId = vm.human?.playerId ?? null;
  const isDraw = winner === null || winner === undefined || vm.match.terminationReason === 'CANONICAL_DRAW';
  const outcome = isDraw ? 'draw' : winner === humanId ? 'win' : 'loss';
  const outcomeLabel = outcome === 'win' ? 'VICTORY' : outcome === 'loss' ? 'DEFEAT' : 'DRAW';
  const resultIcon = outcome === 'win' ? '🏆' : outcome === 'loss' ? '💀' : '🤝';

  // v0.19.0: AI banter on terminal
  const archetype = vm.opponent?.archetype ?? '';
  const banter = getTerminalBanter(archetype, outcome === 'loss');

  return `<div class="play-terminal ${outcome}" data-testid="play-terminal">
    <div class="terminal-result-banner ${outcome}">
      <span class="terminal-result-icon" aria-hidden="true">${resultIcon}</span>
      <h2>Match Complete</h2>
      <p class="terminal-result" data-testid="terminal-result">${outcomeLabel === 'VICTORY' ? 'You won!' : outcomeLabel === 'DEFEAT' ? 'You lost.' : 'Draw.'}</p>
      <p class="terminal-banter" data-testid="terminal-banter">${esc(banter)}</p>
    </div>
    <dl class="terminal-details">
      <dt>Winner</dt><dd data-testid="terminal-winner">${esc(outcome === 'win' ? 'You' : outcome === 'loss' ? 'AI' : 'Draw')}</dd>
      <dt>Termination</dt><dd>${esc(formatTerminationReason(vm.match.terminationReason || 'UNKNOWN'))}</dd>
      <dt>Full Turns</dt><dd>${vm.match.fullTurnSequence ?? 0}</dd>
    </dl>
    ${opts.achievementSummaryHtml || ''}
    <div class="terminal-actions">
      <button class="primary-button" data-testid="watch-replay" data-action="watch-replay">Watch replay</button>
      ${opts.isNetworkMatch ? '<button class="secondary-button" data-testid="download-replay" data-action="download-replay">Download certified replay</button>' : ''}
      ${opts.isNetworkMatch ? '' : '<button class="secondary-button" data-testid="rematch-same-seed" data-action="rematch">Rematch same seed</button>'}
      ${opts.isNetworkMatch ? '' : '<button class="secondary-button" data-testid="new-seed" data-action="new-seed">New seed</button>'}
      <a class="secondary-button" data-testid="open-rank-anatomy" href="#/ranks">Open Rank Anatomy</a>
      <a class="secondary-button" data-testid="open-history" href="#/history">Open History</a>
      <a class="secondary-button" data-testid="open-achievements" href="#/achievements">View Achievements</a>
      <button class="secondary-button" data-testid="return-to-hub" data-action="return-to-hub">Return to Play hub</button>
    </div>
  </div>`;
}

/**
 * Render the error screen.
 */
export function renderError(vm, opts) {
  return `<div class="play-error" data-testid="play-error" role="alert">
    <h2>Session Error</h2>
    <p>${esc(vm.error?.reason || vm.error || 'Unknown error')}</p>
    <button class="secondary-button" data-action="return-to-hub">Return to Play hub</button>
  </div>`;
}

/**
 * Render keyboard help overlay (v0.17.0 port).
 */
export function renderKeyboardHelp() {
  return `<div class="keyboard-help-overlay" data-testid="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
    <h3>Keyboard Shortcuts</h3>
    <dl class="keyboard-help-list">
      <dt><kbd>P</kbd></dt><dd>Pass priority / Decline response</dd>
      <dt><kbd>I</kbd></dt><dd>Open card inspector for selected card</dd>
      <dt><kbd>A</kbd></dt><dd>Open Advanced Card Rules for selected/inspected card</dd>
      <dt><kbd>R</kbd></dt><dd>Toggle stack details</dd>
      <dt><kbd>?</kbd></dt><dd>Toggle this help</dd>
      <dt><kbd>Esc</kbd></dt><dd>Close Advanced View, cancel selection, or close inspector</dd>
      <dt><kbd>Enter</kbd></dt><dd>Confirm selected action</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="keyboard-help-close" aria-label="Close keyboard help">Close</button>
  </div>`;
}
