// ═══════════════════════════════════════════════════════════════
// ranked-duel-hub.mjs — New Match configurator renderer.
//
// Information architecture:
//
//     QUICK MODES (Academy / Puzzles / Guided — secondary)
//     ─────────────────────────────────────────────────────
//     LEFT  : Rule profile → Your seat → AI opponent → Advanced
//     RIGHT : Match Brief (sticky) with the Start Match action
//
// The AI opponent is modelled as TWO independent decisions:
//
//     difficulty  (how strong)   ×   archetype  (how it plays)
//
// Opponent structure and copy come from opponent-catalog.mjs — the single
// source of truth shared with ai-personality.js. This module only renders.
// ═══════════════════════════════════════════════════════════════

import {
  DIFFICULTY_IDS,
  DIFFICULTY_DEFINITIONS,
  buildOpponentModel,
  compatibleArchetypes,
  getArchetypeDefinition,
  describeOpponent,
} from './opponent-catalog.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Default rule profile — preserved from the pre-redesign configurator. */
export const DEFAULT_PROFILE_ID = 'core-advanced-authority';

/** Default seat — preserved from the pre-redesign configurator. */
export const DEFAULT_SEAT_ID = 'P1';

// ── Rule profile explanations in player language ──────────────
export const PROFILE_EXPLANATIONS = Object.freeze({
  'first-contact-trigger-closure': {
    label: 'First Contact',
    icon: '📖',
    short: 'Learn the basics',
    full: 'A simplified rule set that teaches core mechanics: draw cards, play for points, and reach the goal score. No advanced effects, no royal cards, no counters. Perfect for your first match.',
    systems: 'Draw · Score · Goal',
    systemsBrief: 'Core systems only',
    recommendedFor: 'New players',
  },
  'core-advanced-authority': {
    label: 'Advanced Core',
    icon: '⚔',
    short: 'Full standard rules',
    full: 'The complete Intrilex rule set at the standard competitive level. Includes all card effects, royal cards (Jack, Queen, King, Ace), counters, the Swap Bar, and the priority-pass system. Some advanced systems (hidden-choice supers, generated-effect copy, sudden death) are replay-only in this profile.',
    systems: 'All standard systems · 4 advanced systems replay-only',
    systemsBrief: 'Standard systems: all · Replay-only: 4',
    recommendedFor: 'Players who know the basics',
  },
  'core-unrestricted-authority': {
    label: 'Unrestricted',
    icon: '🔥',
    short: 'All systems active',
    full: 'The full rule set with every system autonomously playable, including hidden-choice supers, generated-effect copy, and sudden death. The most complex and complete Intrilex experience. Use this when you want no limits.',
    systems: 'All systems fully playable',
    systemsBrief: 'Standard + advanced systems: all',
    recommendedFor: 'Experienced players',
  },
});

// ── Seat options ──────────────────────────────────────────────
const SEAT_OPTIONS = Object.freeze([
  { id: 'P1', label: 'First', icon: '①', note: 'You take the opening turn.' },
  { id: 'P2', label: 'Second', icon: '②', note: 'Opponent opens, you respond.' },
  { id: 'random', label: 'Random', icon: '🎲', note: 'Whoever wins the coin flip opens.' },
]);

// ── Secondary modes — discoverable, deliberately subordinate ──
const QUICK_MODES = Object.freeze([
  { id: 'first-contact', href: '#/play/first-contact', icon: '🛰', title: 'First Contact', blurb: 'New? Start here — learn by playing', testId: 'first-contact-entry-link' },
  { id: 'academy', href: '#/play/academy', icon: '🎓', title: 'Academy', blurb: 'Guided learning', testId: 'academy-entry-link' },
  { id: 'puzzles', href: '#/puzzles', icon: '🧩', title: 'Puzzles', blurb: 'Tactical challenges', testId: 'puzzles-entry-link' },
  { id: 'guided', href: '#/play/guided', icon: '🎭', title: 'Guided Exhibition', blurb: 'Scripted match with commentary', testId: 'guided-entry-link' },
]);

/** Safe lookup for a rule profile definition. */
function profileDefinition(profileId) {
  return PROFILE_EXPLANATIONS[profileId] ?? PROFILE_EXPLANATIONS[DEFAULT_PROFILE_ID];
}

/** Safe lookup for a seat definition. */
function seatDefinition(seatId) {
  return SEAT_OPTIONS.find(s => s.id === seatId) ?? SEAT_OPTIONS[0];
}

/** Safe lookup for a difficulty definition. */
function difficultyDefinition(difficultyId) {
  return DIFFICULTY_DEFINITIONS[difficultyId] ?? DIFFICULTY_DEFINITIONS.normal;
}

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

// ── Rule profile ──────────────────────────────────────────────

/**
 * Selected-profile detail panel. Only the selected profile is ever visible,
 * so the full explanatory prose no longer competes with the configuration.
 */
export function renderProfileDetail(profileId) {
  return Object.entries(PROFILE_EXPLANATIONS).map(([id, profile]) => `
    <div class="profile-explanation nm-profile-detail" data-profile="${esc(id)}" ${id === profileId ? '' : 'hidden'}>
      <p class="profile-explanation-full">${esc(profile.full)}</p>
      <div class="profile-explanation-meta">
        <span class="profile-explanation-systems" aria-label="Active systems">${esc(profile.systems)}</span>
        <span class="profile-explanation-audience" aria-label="Recommended for">${esc(profile.recommendedFor)}</span>
      </div>
    </div>`).join('');
}

function renderProfileCards(selectedProfileId) {
  return Object.entries(PROFILE_EXPLANATIONS).map(([id, profile]) => `
    <label class="nm-card nm-profile-card" data-testid="profile-card-${esc(id)}">
      <input type="radio" name="profile" value="${esc(id)}"${id === selectedProfileId ? ' checked' : ''}>
      <span class="nm-card-check" aria-hidden="true">✓</span>
      <span class="nm-card-icon" aria-hidden="true">${profile.icon}</span>
      <span class="nm-card-body">
        <span class="nm-card-title">${esc(profile.label)}</span>
        <span class="nm-card-sub">${esc(profile.short)}</span>
      </span>
    </label>`).join('');
}

// ── AI opponent: difficulty ───────────────────────────────────

const difficultyDescriptionId = (difficultyId) => `nm-difficulty-desc-${difficultyId}`;

function renderDifficultyOptions(selectedDifficulty) {
  return DIFFICULTY_IDS.map(id => {
    const definition = difficultyDefinition(id);
    return `
    <label class="nm-difficulty-option" data-difficulty="${esc(id)}" data-testid="difficulty-option-${esc(id)}">
      <input type="radio" name="ai-difficulty" value="${esc(id)}"${id === selectedDifficulty ? ' checked' : ''} aria-describedby="${difficultyDescriptionId(id)}">
      <span class="nm-difficulty-marker" aria-hidden="true">${definition.icon}</span>
      <span class="nm-difficulty-body">
        <span class="nm-difficulty-label">${esc(definition.label)}</span>
        <span class="nm-difficulty-tagline">${esc(definition.tagline)}</span>
      </span>
      <span class="nm-difficulty-check" aria-hidden="true">✓</span>
    </label>`;
  }).join('');
}

/**
 * Full difficulty descriptions for assistive tech. Kept out of the option
 * label so the audible name stays short, and referenced via aria-describedby.
 */
function renderDifficultyDescriptions() {
  return DIFFICULTY_IDS.map(id => {
    const definition = difficultyDefinition(id);
    return `<span class="difficulty-description nm-visually-hidden" id="${difficultyDescriptionId(id)}">${esc(definition.description)}</span>`;
  }).join('');
}

// ── AI opponent: playstyle ────────────────────────────────────

function renderArchetypeCard(archetype, selectedArchetypeId) {
  const definition = archetype.definition;
  return `
    <label class="nm-archetype-card" data-archetype="${esc(archetype.id)}" data-testid="archetype-card-${esc(archetype.id)}">
      <input type="radio" name="ai-archetype" value="${esc(archetype.id)}"${archetype.id === selectedArchetypeId ? ' checked' : ''}>
      <span class="nm-archetype-check" aria-hidden="true">✓</span>
      <span class="nm-archetype-icon" aria-hidden="true">${definition.icon}</span>
      <span class="nm-archetype-body">
        <span class="nm-archetype-name">${esc(definition.label)}</span>
        <span class="nm-archetype-style">${esc(definition.playstyle)}</span>
        <span class="nm-archetype-desc">${esc(definition.description)}</span>
      </span>
    </label>`;
}

/**
 * Playstyle cards for the archetypes that actually exist at the selected
 * difficulty. Rendered once per archetype — never once per difficulty group.
 * @param {object} model - Result of buildOpponentModel
 * @param {string} difficultyId
 * @param {string|null} selectedArchetypeId
 */
export function renderArchetypeGrid(model, difficultyId, selectedArchetypeId) {
  const compatible = compatibleArchetypes(model, difficultyId);
  if (!compatible.length) {
    return '<p class="nm-empty">No opponent archetypes are available in this build.</p>';
  }
  return compatible.map(a => renderArchetypeCard(a, selectedArchetypeId)).join('');
}

/**
 * Scope note above the grid: explains why the archetype list changes when
 * the difficulty changes.
 */
export function renderPlaystyleScope(model, difficultyId) {
  const count = compatibleArchetypes(model, difficultyId).length;
  const total = (model?.archetypes ?? []).length;
  if (!count) return 'No archetypes available';
  const label = count === 1 ? 'archetype' : 'archetypes';
  return total === count
    ? `All ${count} ${label} available`
    : `${count} of ${total} ${label} available here`;
}

// ── AI opponent: selected brief ───────────────────────────────

/**
 * Richer explanation of the *current* difficulty + archetype combination.
 * This is where long-form opponent copy belongs — not inside every card.
 * @param {object} model
 * @param {string} difficultyId
 * @param {string|null} archetypeId
 */
export function renderOpponentBrief(model, difficultyId, archetypeId) {
  const compatible = compatibleArchetypes(model, difficultyId);
  const selected = compatible.find(a => a.id === archetypeId) ?? compatible[0] ?? null;
  const difficulty = difficultyDefinition(difficultyId);
  if (!selected) {
    return `<p class="nm-empty">Select a difficulty with available opponents to see the opponent brief.</p>`;
  }
  const definition = selected.definition;
  return `<div class="nm-opponent-brief-head">
      <span class="nm-opponent-brief-icon" aria-hidden="true">${definition.icon}</span>
      <div class="nm-opponent-brief-heading">
        <p class="nm-opponent-brief-title">${esc(describeOpponent(difficultyId, definition.id))}</p>
        <p class="nm-opponent-brief-style">${esc(definition.playstyle)}</p>
      </div>
      <span class="nm-opponent-brief-badge" data-difficulty="${esc(difficulty.id)}">
        <span aria-hidden="true">${difficulty.icon}</span>${esc(difficulty.label)}
      </span>
    </div>
    <p class="nm-opponent-brief-desc">${esc(definition.brief)}</p>
    <p class="nm-opponent-brief-modifier">${esc(difficulty.modifier)}</p>
    <ul class="nm-tags">
      ${definition.tags.map(tag => `<li class="nm-tag">${esc(tag)}</li>`).join('')}
    </ul>`;
}

// ── Match brief ───────────────────────────────────────────────

/**
 * Reactive summary of the whole configuration. Only the rows are
 * re-rendered on change, so the Start Match button never loses focus.
 * @param {{profileId: string, seat: string, difficulty: string, archetype: string|null, seed?: string}} state
 */
export function renderMatchBrief(state) {
  const profile = profileDefinition(state.profileId);
  const seat = seatDefinition(state.seat);
  const difficulty = difficultyDefinition(state.difficulty);
  const archetype = state.archetype ? getArchetypeDefinition(state.archetype) : null;
  const seed = String(state.seed ?? '').trim();
  const opponent = archetype
    ? `${difficulty.label} · ${archetype.label}`
    : difficulty.label;
  return `
    <div class="nm-brief-row"><dt>Rules</dt><dd>${esc(profile.label)}</dd></div>
    <div class="nm-brief-row"><dt>Seat</dt><dd>${esc(seat.label)}<small>${esc(seat.note)}</small></dd></div>
    <div class="nm-brief-row"><dt>Opponent</dt><dd>${archetype ? `<span aria-hidden="true">${archetype.icon}</span> ` : ''}${esc(opponent)}</dd></div>
    <div class="nm-brief-row"><dt>Systems</dt><dd>${esc(profile.systemsBrief)}</dd></div>
    <div class="nm-brief-row"><dt>Seed</dt><dd>${seed ? esc(seed) : 'Random'}</dd></div>`;
}

// ── Page ──────────────────────────────────────────────────────

/**
 * Render the New Match configurator.
 * @param {Array} policyCatalog - Shipped policies with { policyId, traits }
 * @param {object} options - { saveInfo, compatInfo }
 * @returns {string} HTML
 */
export function renderNewMatchSetup(policyCatalog, options = {}) {
  const { saveInfo = null, compatInfo = null } = options;
  const model = buildOpponentModel(policyCatalog);
  const profileId = DEFAULT_PROFILE_ID;
  const seatId = DEFAULT_SEAT_ID;
  const difficultyId = model.defaultDifficulty;
  const archetypeId = model.defaultArchetype;

  const quickModesHtml = QUICK_MODES.map(mode => `
    <a class="quick-mode-card" href="${esc(mode.href)}" data-testid="${esc(mode.testId)}" data-mode="${esc(mode.id)}">
      <span class="quick-mode-icon" aria-hidden="true">${mode.icon}</span>
      <span class="quick-mode-body">
        <span class="quick-mode-title">${esc(mode.title)}</span>
        <span class="quick-mode-blurb">${esc(mode.blurb)}</span>
      </span>
      <span class="quick-mode-arrow" aria-hidden="true">→</span>
    </a>`).join('');

  const seatHtml = SEAT_OPTIONS.map(seat => `
    <label class="nm-seat-option" data-testid="seat-option-${esc(seat.id)}">
      <input type="radio" name="seat" value="${esc(seat.id)}"${seat.id === seatId ? ' checked' : ''}>
      <span class="nm-seat-icon" aria-hidden="true">${seat.icon}</span>
      <span class="nm-seat-label">${esc(seat.label)}</span>
      <span class="nm-seat-check" aria-hidden="true">✓</span>
    </label>`).join('');

  const briefState = { profileId, seat: seatId, difficulty: difficultyId, archetype: archetypeId, seed: '' };

  return `<div class="play-setup" data-testid="play-setup">
    <a class="play-setup-back" href="#/" aria-label="Back to home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back</a>
    <header class="nm-header">
      <p class="nm-eyebrow">Play</p>
      <h1>New Match</h1>
      <p class="nm-subtitle">Configure a rules-assisted match, then enter the table.</p>
    </header>

    <section class="nm-quickmodes" aria-labelledby="nm-quickmodes-title">
      <h2 class="nm-quickmodes-title" id="nm-quickmodes-title">Quick modes</h2>
      <div class="nm-quickmodes-grid">${quickModesHtml}</div>
    </section>

    ${renderResumePrompt(saveInfo)}
    ${renderCompatibilityWarning(compatInfo)}

    <form id="new-match-form" data-testid="new-match-form" class="nm-layout">
      <div class="nm-config">
        <fieldset class="setup-section nm-section">
          <legend>Rule profile</legend>
          <div class="nm-card-grid nm-profile-grid">${renderProfileCards(profileId)}</div>
          <div class="setup-profile-explainer" data-testid="profile-explainer" role="region" aria-label="Rule profile detail">
            ${renderProfileDetail(profileId)}
          </div>
        </fieldset>

        <fieldset class="setup-section nm-section">
          <legend>Your seat</legend>
          <div class="nm-seat-row" role="group" aria-labelledby="nm-seat-label">
            <span class="nm-visually-hidden" id="nm-seat-label">Your seat</span>
            ${seatHtml}
          </div>
        </fieldset>

        <fieldset class="setup-section nm-section nm-opponent">
          <legend>AI opponent</legend>

          <div class="nm-subfield">
            <div class="nm-subfield-head">
              <span class="nm-subfield-label" id="nm-difficulty-label">Difficulty</span>
            </div>
            <div class="nm-difficulty-grid" role="group" aria-labelledby="nm-difficulty-label" data-testid="difficulty-grid">
              ${renderDifficultyOptions(difficultyId)}
            </div>
            <div class="nm-visually-hidden">${renderDifficultyDescriptions()}</div>
          </div>

          <div class="nm-subfield">
            <div class="nm-subfield-head">
              <span class="nm-subfield-label" id="nm-playstyle-label">Playstyle</span>
              <span class="nm-playstyle-note" data-testid="archetype-scope">${esc(renderPlaystyleScope(model, difficultyId))}</span>
            </div>
            <div class="nm-archetype-grid" role="group" aria-labelledby="nm-playstyle-label" data-testid="archetype-grid">
              ${renderArchetypeGrid(model, difficultyId, archetypeId)}
            </div>
          </div>

          <section class="nm-opponent-brief" data-testid="opponent-brief" aria-label="Opponent brief" aria-live="polite">
            <p class="nm-opponent-brief-eyebrow">Opponent brief</p>
            <div data-testid="opponent-brief-body">${renderOpponentBrief(model, difficultyId, archetypeId)}</div>
          </section>
        </fieldset>

        <details class="setup-advanced" data-testid="setup-advanced">
          <summary>Advanced options</summary>
          <fieldset class="setup-section setup-seed-section">
            <legend>Seed</legend>
            <input type="number" name="seed" min="1" max="4294967295" placeholder="Random" class="seed-input" data-testid="seed-input">
            <small class="seed-hint">Set a specific seed to reproduce a match. Leave blank for a random seed each game.</small>
          </fieldset>
        </details>
      </div>

      <aside class="nm-brief" aria-label="Match brief">
        <div class="nm-brief-inner">
          <p class="nm-brief-eyebrow">Match brief</p>
          <dl class="nm-brief-rows" data-testid="match-brief-rows">${renderMatchBrief(briefState)}</dl>
          <div class="setup-actions nm-brief-cta">
            <button type="submit" class="primary-button" data-testid="start-match">Start match</button>
          </div>
        </div>
      </aside>
    </form>
  </div>`;
}



