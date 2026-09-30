// ═══════════════════════════════════════════════════════════════
// guided-renderer.mjs — Guided Exhibition UI renderer
//
// Renders the intro screen, commentary rail, HUD, and debrief
// for the GUIDED_EXHIBITION_01 scenario.
// ═══════════════════════════════════════════════════════════════

/**
 * Render the guided exhibition intro screen.
 * @param {object} scenario - The GuidedScenario object
 * @returns {string} HTML
 */
export function renderGuidedIntro(scenario) {
  return `
    <div class="guided-exhibition-intro" data-testid="guided-exhibition-intro" role="article" aria-labelledby="guided-title">
      <div class="guided-exhibition-header">
        <h1 class="guided-exhibition-title" id="guided-title">${escapeHtml(scenario.title)}</h1>
        <p class="guided-exhibition-subtitle">${escapeHtml(scenario.subtitle ?? '')}</p>
      </div>
      <div class="guided-exhibition-body">
        <p class="guided-exhibition-intro-text">${escapeHtml(scenario.introText)}</p>
        <div class="guided-exhibition-meta">
          <span class="guided-exhibition-duration">~${scenario.estimatedMinutes} min</span>
          <span class="guided-exhibition-mode">Guided Exhibition</span>
        </div>
      </div>
      <div class="guided-exhibition-actions">
        <button class="btn-primary" data-action="guided-start" data-testid="guided-start-btn" aria-label="Begin guided exhibition">
          Begin Exhibition
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the commentary rail overlay.
 * @param {object} commentary - Current commentary object
 * @param {object} opts - { visible: boolean }
 * @returns {string} HTML
 */
export function renderCommentaryRail(commentary, { visible = true } = {}) {
  if (!commentary || !visible) return '';
  const lines = (commentary.lines ?? []).map(l =>
    `<p class="guided-commentary-line ${l.bold ? 'bold' : ''}">${escapeHtml(l.text)}</p>`
  ).join('');
  return `
    <div class="guided-commentary-rail" data-testid="guided-commentary-rail" role="status" aria-live="polite">
      <div class="guided-commentary-header">
        <span>Guide</span>
        <button class="guided-commentary-skip" data-action="guided-skip-commentary" aria-label="Skip commentary" title="Skip commentary">Skip</button>
      </div>
      <div class="guided-commentary-body">${lines}</div>
    </div>
  `;
}

/**
 * Render the guided HUD overlay.
 * @param {object} opts - { status, checkpoint, hint, glowLevel }
 * @returns {string} HTML
 */
export function renderGuidedHud(opts = {}) {
  const { status = 'playing', checkpoint = null, hint = null, glowLevel = 'ambient', waitingForPlayer = false } = opts;
  const cpText = checkpoint ? `Checkpoint: ${checkpoint.description ?? checkpoint.id}` : '';
  const hintText = hint?.text ? `Hint: ${hint.text}` : (typeof hint === 'string' ? `Hint: ${hint}` : '');
  const statusLabel = waitingForPlayer ? 'YOUR MOVE' : status;
  const showSkipHints = waitingForPlayer && !hintText;
  return `
    <div class="guided-hud" data-testid="guided-hud" data-status="${status}" role="banner" aria-label="Guided exhibition status">
      <div class="guided-hud-status ${waitingForPlayer ? 'guided-hud-your-turn' : ''}">${escapeHtml(statusLabel)}</div>
      ${cpText ? `<div class="guided-hud-checkpoint">${escapeHtml(cpText)}</div>` : ''}
      ${hintText ? `<div class="guided-hud-hint">${escapeHtml(hintText)}</div>` : ''}
      <div class="guided-hud-glow" data-level="${glowLevel}" aria-hidden="true"></div>
      ${showSkipHints ? `<button class="guided-hud-skip-hints" data-action="guided-skip-hints" aria-label="Show explicit hint" title="Show explicit hint">Reveal Hint</button>` : ''}
    </div>
  `;
}

/**
 * Render the debrief screen.
 * @param {object} debrief - The DebriefConfig object
 * @returns {string} HTML
 */
export function renderGuidedDebrief(debrief) {
  const steps = (debrief.steps ?? []).map(s =>
    `<div class="guided-debrief-step">
      <p class="guided-debrief-step-text ${s.bold ? 'bold' : ''}">${escapeHtml(s.text)}</p>
    </div>`
  ).join('');
  return `
    <div class="guided-exhibition-debrief" data-testid="guided-exhibition-debrief">
      <div class="guided-debrief-header">
        <h2>Debrief</h2>
      </div>
      <div class="guided-debrief-body">
        ${steps}
        <div class="guided-debrief-transparency">${escapeHtml(debrief.transparencyText ?? '')}</div>
        <div class="guided-debrief-footer">${escapeHtml(debrief.footerText ?? '')}</div>
      </div>
      <div class="guided-debrief-actions">
        <button class="btn-secondary" data-action="guided-replay" data-testid="guided-replay-btn">
          Replay
        </button>
        <a class="btn-secondary" href="#/play/academy" data-testid="guided-academy-link">
          Academy
        </a>
        <button class="btn-primary" data-action="guided-exit" data-testid="guided-exit-btn">
          Play Real Match
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the replay mode selector.
 * @param {object} opts - { currentLevel }
 * @returns {string} HTML
 */
export function renderReplaySelector(currentLevel = 'full') {
  const levels = [
    { id: 'full', label: 'Full Guidance', desc: 'All commentary and hints' },
    { id: 'light', label: 'Light Guidance', desc: 'Minimal commentary' },
    { id: 'none', label: 'No Guidance', desc: 'Silent replay' },
  ];
  const items = levels.map(l => `
    <button class="guided-replay-option ${currentLevel === l.id ? 'active' : ''}"
            data-action="guided-replay-mode"
            data-level="${l.id}"
            data-testid="guided-replay-${l.id}">
      <span class="guided-replay-label">${l.label}</span>
      <span class="guided-replay-desc">${l.desc}</span>
    </button>
  `).join('');
  return `
    <div class="guided-replay-selector" data-testid="guided-replay-selector">
      ${items}
    </div>
  `;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
