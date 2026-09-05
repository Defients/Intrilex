// ═══════════════════════════════════════════════════════════════
// ranked-duel-hub.mjs — New match setup renderer.
// Extracted from ranked-duel-renderer.mjs for modularity.
// v0.30.0: Full game-start experience — rule-profile explanations,
// AI difficulty descriptions, seed under Advanced, resume prompt,
// compatibility warnings.
// ═══════════════════════════════════════════════════════════════

import { getArchetypePersonality } from './ai-personality.js';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Rule profile explanations in player language ──────────────
const PROFILE_EXPLANATIONS = Object.freeze({
  'first-contact-trigger-closure': {
    label: 'First Contact',
    icon: '📖',
    short: 'Learn the basics',
    full: 'A simplified rule set that teaches core mechanics: draw cards, play for points, and reach the goal score. No advanced effects, no royal cards, no counters. Perfect for your first match.',
    systems: 'Draw · Score · Goal',
    recommendedFor: 'New players',
  },
  'core-advanced-authority': {
    label: 'Advanced Core',
    icon: '⚔',
    short: 'Full standard rules',
    full: 'The complete Intrilex rule set at the standard competitive level. Includes all card effects, royal cards (Jack, Queen, King, Ace), counters, the Swap Bar, and the priority-pass system. Some advanced systems (hidden-choice supers, generated-effect copy, sudden death) are replay-only in this profile.',
    systems: 'All standard systems · 4 advanced systems replay-only',
    recommendedFor: 'Players who know the basics',
  },
  'core-unrestricted-authority': {
    label: 'Unrestricted',
    icon: '🔥',
    short: 'All systems active',
    full: 'The full rule set with every system autonomously playable, including hidden-choice supers, generated-effect copy, and sudden death. The most complex and complete Intrilex experience. Use this when you want no limits.',
    systems: 'All systems fully playable',
    recommendedFor: 'Experienced players',
  },
});

// ── AI difficulty descriptions ────────────────────────────────
const DIFFICULTY_DESCRIPTIONS = Object.freeze({
  easy: 'Forgiving opponent that makes simple decisions and rarely counters. Good for learning card interactions.',
  normal: 'Balanced opponent that plays competently and responds to your moves. A fair test of your strategy.',
  hard: 'Skilled opponent that optimizes plays, counters aggressively, and punishes mistakes. Expect a real challenge.',
  nightmare: 'Ruthless opponent that plays near-optimally. Every decision matters. For experienced players only.',
});

/**
 * Render a resume prompt if a saved match exists.
 * @param {object|null} saveInfo - Save metadata or null
 * @returns {string} HTML for the resume banner
 */
export function renderResumePrompt(saveInfo) {
  if (!saveInfo) return '';
  const profileLabel = PROFILE_EXPLANATIONS[saveInfo.profileId]?.label ?? saveInfo.profileId ?? 'Unknown';
  const turnInfo = saveInfo.turnNumber != null ? `Turn ${saveInfo.turnNumber}` : 'In progress';
  return `<div class="setup-resume-prompt" data-testid="setup-resume-prompt">
    <div class="setup-resume-info">
      <span class="setup-resume-icon" aria-hidden="true">▶</span>
      <div class="setup-resume-body">
        <strong>Resume match</strong>
        <small>${esc(profileLabel)} · ${esc(turnInfo)}${saveInfo.seed != null ? ` · Seed ${esc(saveInfo.seed)}` : ''}</small>
      </div>
    </div>
    <button type="button" class="setup-resume-button" data-testid="resume-match" data-save-id="${esc(saveInfo.saveId ?? '')}">Continue</button>
  </div>`;
}

/**
 * Render a compatibility warning for old saves or replays.
 * @param {object|null} compatInfo - { type: 'save'|'replay', reason, message } or null
 * @returns {string} HTML for the warning banner
 */
export function renderCompatibilityWarning(compatInfo) {
  if (!compatInfo) return '';
  return `<div class="setup-compat-warning" data-testid="setup-compat-warning" role="alert">
    <span class="setup-compat-icon" aria-hidden="true">⚠</span>
    <div class="setup-compat-body">
      <strong>Compatibility notice</strong>
      <small>${esc(compatInfo.message)}</small>
    </div>
  </div>`;
}

/**
 * Render the new match setup screen.
 * @param {Array} policyCatalog - Policy definitions with traits
 * @param {object} options - { saveInfo, compatInfo }
 */
export function renderNewMatchSetup(policyCatalog, options = {}) {
  const { saveInfo = null, compatInfo = null } = options;
  const profiles = Object.entries(PROFILE_EXPLANATIONS).map(([id, info]) => ({ id, ...info }));
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

  const resumeHtml = renderResumePrompt(saveInfo);
  const compatHtml = renderCompatibilityWarning(compatInfo);

  return `<div class="play-setup" data-testid="play-setup">
    <a class="play-setup-back" href="#/" aria-label="Back to home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back</a>
    <h1>New Match</h1>
    <a class="academy-entry-link" href="#/play/academy" data-testid="academy-entry-link">
      <span class="academy-entry-icon" aria-hidden="true">🎓</span>
      <span class="academy-entry-body"><strong>Academy</strong><small>New to Intrilex? Start with guided lessons.</small></span>
      <span class="academy-entry-arrow" aria-hidden="true">→</span>
    </a>
    ${resumeHtml}
    ${compatHtml}
    <form id="new-match-form" data-testid="new-match-form">
      <fieldset class="setup-section">
        <legend>Rule profile</legend>
        <div class="setup-card-grid">
          ${profiles.map(p => `<label class="setup-card" data-testid="profile-card-${esc(p.id)}">
            <input type="radio" name="profile" value="${esc(p.id)}" ${p.id === 'core-advanced-authority' ? 'checked' : ''}>
            <span class="setup-card-icon" aria-hidden="true">${p.icon}</span>
            <span class="setup-card-body">
              <strong>${esc(p.label)}</strong>
              <small>${esc(p.short)}</small>
            </span>
          </label>`).join('')}
        </div>
        <div class="setup-profile-explainer" data-testid="profile-explainer" role="region" aria-label="Rule profile explanation">
          ${profiles.map(p => `<div class="profile-explanation" data-profile="${esc(p.id)}" ${p.id === 'core-advanced-authority' ? '' : 'hidden'}>
            <p class="profile-explanation-full">${esc(p.full)}</p>
            <div class="profile-explanation-meta">
              <span class="profile-explanation-systems" aria-label="Active systems">${esc(p.systems)}</span>
              <span class="profile-explanation-audience" aria-label="Recommended for">${esc(p.recommendedFor)}</span>
            </div>
          </div>`).join('')}
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
          const diffDesc = DIFFICULTY_DESCRIPTIONS[diff] ?? '';
          return `<div class="difficulty-group" data-difficulty="${esc(diff)}">
            <div class="difficulty-header">
              <span class="difficulty-pill">${esc(difficultyLabels[diff] ?? diff)}</span>
              <span class="difficulty-description">${esc(diffDesc)}</span>
            </div>
            <div class="ai-personality-grid">
              ${policies.map(p => {
                const archetype = p.traits?.archetype ?? '';
                const personality = getArchetypePersonality(archetype);
                const checked = !firstPolicyRendered ? ' checked' : '';
                firstPolicyRendered = true;
                return `<label class="ai-personality-card" title="${esc(personality.playStyle)}">
                  <input type="radio" name="ai-policy" value="${esc(p.policyId)}"${checked}>
                  <span class="ai-personality-name">${esc(archetype || p.policyId)}</span>
                  <span class="ai-personality-desc">${esc(personality.description)}</span>
                </label>`;
              }).join('')}
            </div>
          </div>`;
          }).join('');
        })()}
      </fieldset>
      <details class="setup-advanced" data-testid="setup-advanced">
        <summary>Advanced options</summary>
        <fieldset class="setup-section setup-seed-section">
          <legend>Seed</legend>
          <input type="number" name="seed" min="1" max="4294967295" placeholder="Random" class="seed-input">
          <small class="seed-hint">Set a specific seed to reproduce a match. Leave blank for a random seed each game.</small>
        </fieldset>
      </details>
      <div class="setup-actions">
        <button type="submit" class="primary-button" data-testid="start-match">Start match</button>
      </div>
    </form>
  </div>`;
}
