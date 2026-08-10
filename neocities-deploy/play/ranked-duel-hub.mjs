// ═══════════════════════════════════════════════════════════════
// ranked-duel-hub.mjs — Play hub and new match setup renderers.
// Extracted from ranked-duel-renderer.mjs for modularity.
// ═══════════════════════════════════════════════════════════════

import { getArchetypePersonality } from './ai-personality.js';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Render the Play hub (entry point for #/play).
 */
export function renderPlayHub(continueSave, options = {}) {
  const idbAvailable = options.idbAvailable !== false;
  const stats = options.playerStats ?? null;
  const hasStats = stats && stats.totalMatches > 0;

  // Stats dashboard
  const statsDashboard = hasStats ? `<div class="play-hub-stats" data-testid="play-hub-stats">
    <h2>Your Record</h2>
    <div class="stats-summary-row">
      <span class="stat-item"><span class="stat-value">${stats.wins ?? 0}</span><span class="stat-label">Wins</span></span>
      <span class="stat-item"><span class="stat-value">${stats.losses ?? 0}</span><span class="stat-label">Losses</span></span>
      <span class="stat-item"><span class="stat-value">${stats.draws ?? 0}</span><span class="stat-label">Draws</span></span>
      <span class="stat-item"><span class="stat-value">${stats.totalMatches ?? 0}</span><span class="stat-label">Total</span></span>
    </div>
    ${stats.difficultyBreakdown && Object.keys(stats.difficultyBreakdown).length > 0 ? `<div class="stats-difficulty-breakdown" data-testid="stats-difficulty-breakdown">
      <h3>By Difficulty</h3>
      ${Object.entries(stats.difficultyBreakdown).map(([diff, d]) => `<div class="difficulty-stat-row">
        <span class="difficulty-stat-label">${esc(diff.charAt(0).toUpperCase() + diff.slice(1))}</span>
        <span class="difficulty-stat-record">${d.wins ?? 0}W / ${d.losses ?? 0}L / ${d.draws ?? 0}D</span>
      </div>`).join('')}
    </div>` : ''}
    ${stats.recentResults && stats.recentResults.length > 0 ? `<div class="stats-recent" data-testid="stats-recent">
      <h3>Recent Matches</h3>
      ${stats.recentResults.map(r => `<div class="recent-match-row">
        <span class="recent-result ${r.isHumanWinner ? 'win' : r.winner ? 'loss' : 'draw'}">${r.isHumanWinner ? 'Won' : r.winner ? 'Lost' : 'Draw'}</span>
        <span class="recent-opponent">${esc(r.aiPolicyId ?? 'AI')}</span>
        <span class="recent-profile">${esc(r.profileId ?? '')}</span>
      </div>`).join('')}
    </div>` : ''}
  </div>` : '';

  return `<div class="play-hub" data-testid="play-hub">
    <a class="play-hub-back" href="#/" aria-label="Back to landing">← Back</a>
    <h1 class="play-hub-title">Play</h1>
    <p class="play-hub-subtitle">Local single-player matches against the deterministic AI.</p>
    ${continueSave ? `<div class="continue-card" data-testid="continue-card">
      <h2>Continue</h2>
      <p>Profile: ${esc(continueSave.profileId)} · Mode: ${esc(continueSave.mode ?? 'ADVANCED_CORE')}</p>
      <button class="primary-button" data-testid="continue-match" data-action="continue-match" data-save-id="${esc(continueSave.saveId)}">Continue match</button>
    </div>` : ''}
    ${statsDashboard}
    <div class="play-hub-grid">
      <button class="play-hub-card" data-testid="start-tutorial" data-action="start-tutorial">
        <span class="play-hub-icon" aria-hidden="true">📖</span>
        <strong>First Contact Tutorial</strong>
        <p>Learn the basics with an interactive guide.</p>
      </button>
      <button class="play-hub-card" data-testid="new-game" data-action="new-game">
        <span class="play-hub-icon" aria-hidden="true">⚔</span>
        <strong>New Game vs AI</strong>
        <p>Start a match against a HYBRIX AI opponent.</p>
      </button>
      <button class="play-hub-card" data-testid="online-duel" data-action="online-duel">
        <span class="play-hub-icon" aria-hidden="true">🌐</span>
        <strong>Direct Duel</strong>
        <p>Play online against a remote human opponent.</p>
      </button>
      <button class="play-hub-card" data-testid="replay-library" data-action="replay-library">
        <span class="play-hub-icon" aria-hidden="true">▶</span>
        <strong>Replay Library</strong>
        <p>Watch your completed matches with verified replays.</p>
      </button>
    </div>
    <p class="play-hub-notice">All saves and replays are stored locally in this browser.</p>
    <p class="play-hub-compat">Engine 4.2.6 · Rules 4.3.1</p>
    ${!idbAvailable ? '<p class="play-hub-warning" role="alert">IndexedDB is unavailable. Progress will not survive refresh.</p>' : ''}
  </div>`;
}

/**
 * Render the new match setup screen.
 */
export function renderNewMatchSetup(policyCatalog) {
  const profiles = [
    { id: 'first-contact-trigger-closure', label: 'First Contact', desc: 'Simplified rules for learning', icon: '📖' },
    { id: 'core-advanced-authority', label: 'Advanced Core', desc: 'Full rules with all mechanics', icon: '⚔' },
    { id: 'core-unrestricted-authority', label: 'Unrestricted Core', desc: 'Hidden supers, generated effects, sudden death', icon: '🔥' },
  ];
  const seats = [
    { id: 'P1', label: 'Seat 1 (goes first)', icon: '①' },
    { id: 'P2', label: 'Seat 2 (goes second)', icon: '②' },
    { id: 'random', label: 'Random seat', icon: '🎲' },
  ];
  // Group policies by difficulty
  const byDifficulty = new Map();
  for (const p of policyCatalog) {
    const diff = p.traits?.difficulty ?? 'normal';
    if (!byDifficulty.has(diff)) byDifficulty.set(diff, []);
    byDifficulty.get(diff).push(p);
  }
  const difficultyOrder = ['easy', 'normal', 'hard', 'nightmare'];
  const difficultyColors = { easy: 'var(--tcg-success)', normal: 'var(--tcg-accent)', hard: 'var(--tcg-warning)', nightmare: 'var(--tcg-danger)' };
  const difficultyIcons = { easy: '🟢', normal: '🔵', hard: '🟠', nightmare: '🔴' };

  return `<div class="play-setup" data-testid="play-setup">
    <a class="play-hub-back" href="#/play" aria-label="Back to Play hub">← Back</a>
    <h1>New Match</h1>
    <form id="new-match-form" data-testid="new-match-form">
      <fieldset>
        <legend>Mode</legend>
        <div class="setup-card-grid">
          ${profiles.map(p => `<label class="setup-card">
            <input type="radio" name="profile" value="${esc(p.id)}" ${p.id === 'core-advanced-authority' ? 'checked' : ''}>
            <span class="setup-card-icon" aria-hidden="true">${p.icon}</span>
            <span class="setup-card-body">
              <strong>${esc(p.label)}</strong>
              <small>${esc(p.desc)}</small>
            </span>
          </label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>Your seat</legend>
        <div class="setup-seat-row">
          ${seats.map(s => `<label class="setup-seat-option">
            <input type="radio" name="seat" value="${esc(s.id)}" ${s.id === 'P1' ? 'checked' : ''}>
            <span class="setup-seat-icon" aria-hidden="true">${s.icon}</span>
            <span>${esc(s.label)}</span>
          </label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>AI opponent</legend>
        ${(() => {
          let firstPolicyRendered = false;
          return difficultyOrder.map(diff => {
          const policies = byDifficulty.get(diff) ?? [];
          if (policies.length === 0) return '';
          const color = difficultyColors[diff] ?? 'var(--tcg-text-dim)';
          const icon = difficultyIcons[diff] ?? '⚪';
          return `<div class="difficulty-group" style="--diff-color:${color}">
            <span class="difficulty-label">${icon} ${esc(diff.charAt(0).toUpperCase() + diff.slice(1))}</span>
            <div class="ai-personality-grid">
              ${policies.map(p => {
                const archetype = p.traits?.archetype ?? '';
                const personality = getArchetypePersonality(archetype);
                const checked = !firstPolicyRendered ? ' checked' : '';
                firstPolicyRendered = true;
                return `<label class="ai-personality-card">
                  <input type="radio" name="ai-policy" value="${esc(p.policyId)}"${checked}>
                  <span class="ai-personality-name">${esc(archetype || p.policyId)}</span>
                  <span class="ai-personality-style">${esc(personality.playStyle)}</span>
                  <span class="ai-personality-desc">${esc(personality.description)}</span>
                </label>`;
              }).join('')}
            </div>
          </div>`;
          }).join('');
        })()}
      </fieldset>
      <fieldset>
        <legend>Seed (optional)</legend>
        <label class="seed-input-label">Manual seed: <input type="number" name="seed" min="1" max="4294967295" placeholder="Random"></label>
      </fieldset>
      <div class="setup-actions">
        <button type="submit" class="primary-button" data-testid="start-match">Start match</button>
        <a class="secondary-button" href="#/play">Back</a>
      </div>
    </form>
  </div>`;
}
