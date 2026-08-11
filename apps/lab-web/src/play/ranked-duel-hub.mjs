// ═══════════════════════════════════════════════════════════════
// ranked-duel-hub.mjs — New match setup renderer.
// Extracted from ranked-duel-renderer.mjs for modularity.
// ═══════════════════════════════════════════════════════════════

import { getArchetypePersonality } from './ai-personality.js';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Render the new match setup screen.
 */
export function renderNewMatchSetup(policyCatalog) {
  const profiles = [
    { id: 'first-contact-trigger-closure', label: 'First Contact', desc: 'Learn', icon: '📖' },
    { id: 'core-advanced-authority', label: 'Advanced Core', desc: 'Full rules', icon: '⚔' },
    { id: 'core-unrestricted-authority', label: 'Unrestricted', desc: 'No limits', icon: '🔥' },
  ];
  const seats = [
    { id: 'P1', label: 'First', icon: '①' },
    { id: 'P2', label: 'Second', icon: '②' },
    { id: 'random', label: 'Random', icon: '🎲' },
  ];
  // Group policies by difficulty
  const byDifficulty = new Map();
  for (const p of policyCatalog) {
    const diff = p.traits?.difficulty ?? 'normal';
    if (!byDifficulty.has(diff)) byDifficulty.set(diff, []);
    byDifficulty.get(diff).push(p);
  }
  const difficultyOrder = ['easy', 'normal', 'hard', 'nightmare'];
  const difficultyLabels = { easy: 'Easy', normal: 'Normal', hard: 'Hard', nightmare: 'Nightmare' };

  return `<div class="play-setup" data-testid="play-setup">
    <a class="play-setup-back" href="#/" aria-label="Back to home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back</a>
    <h1>New Match</h1>
    <form id="new-match-form" data-testid="new-match-form">
      <fieldset class="setup-section">
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
      <fieldset class="setup-section">
        <legend>Your seat</legend>
        <div class="setup-seat-row">
          ${seats.map(s => `<label class="setup-seat-option">
            <input type="radio" name="seat" value="${esc(s.id)}" ${s.id === 'P1' ? 'checked' : ''}>
            <span class="setup-seat-icon" aria-hidden="true">${s.icon}</span>
            <span>${esc(s.label)}</span>
          </label>`).join('')}
        </div>
      </fieldset>
      <fieldset class="setup-section">
        <legend>AI opponent</legend>
        ${(() => {
          let firstPolicyRendered = false;
          return difficultyOrder.map(diff => {
          const policies = byDifficulty.get(diff) ?? [];
          if (policies.length === 0) return '';
          return `<div class="difficulty-group" data-difficulty="${esc(diff)}">
            <span class="difficulty-pill">${esc(difficultyLabels[diff] ?? diff)}</span>
            <div class="ai-personality-grid">
              ${policies.map(p => {
                const archetype = p.traits?.archetype ?? '';
                const personality = getArchetypePersonality(archetype);
                const checked = !firstPolicyRendered ? ' checked' : '';
                firstPolicyRendered = true;
                return `<label class="ai-personality-card" title="${esc(personality.playStyle)}">
                  <input type="radio" name="ai-policy" value="${esc(p.policyId)}"${checked}>
                  <span class="ai-personality-name">${esc(archetype || p.policyId)}</span>
                </label>`;
              }).join('')}
            </div>
          </div>`;
          }).join('');
        })()}
      </fieldset>
      <fieldset class="setup-section setup-seed-section">
        <legend>Seed</legend>
        <input type="number" name="seed" min="1" max="4294967295" placeholder="Random" class="seed-input">
      </fieldset>
      <div class="setup-actions">
        <button type="submit" class="primary-button" data-testid="start-match">Start match</button>
      </div>
    </form>
  </div>`;
}
