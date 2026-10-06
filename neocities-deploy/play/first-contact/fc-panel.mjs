// ═══════════════════════════════════════════════════════════════
// fc-panel.mjs — First Contact coach surface (HTML builders)
//
// Renders the persistent in-match coach panel and the one-shot
// welcome coachmark. Markup is injected through the board's existing
// `teaching` surface ({ panelHtml, coachmarkHtml, onAction }) — the
// same channel the Academy uses — so there is exactly one way for
// guidance UI to reach the player.
//
// Copy rules (shared with the scenario): 1–3 short sentences,
// concrete, no premature mechanics. Lesson `text`/`why` are authored
// HTML; everything else is escaped.
// ═══════════════════════════════════════════════════════════════

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Coach action ids routed through teaching.onAction.
 * play-app maps these back onto the controller.
 */
export const FC_ACTIONS = Object.freeze({
  CONTINUE: 'fc-continue',   // dismiss the welcome coachmark
  WHY: 'fc-why',
  WHAT: 'fc-what',
  SHOW: 'fc-show',
});

/**
 * The blocking welcome beat — the only coachmark First Contact uses.
 * @param {object} lesson — the welcome lesson
 * @returns {string} HTML
 */
export function renderFcCoachmark(lesson) {
  return `<div class="fc-coachmark" role="dialog" aria-modal="true" aria-label="Welcome to First Contact">
    <div class="fc-coachmark-card">
      <p class="fc-coachmark-eyebrow">${esc(lesson.title ?? 'First Contact')}</p>
      <p class="fc-coachmark-text">${lesson.text}</p>
      <button type="button" class="fc-coachmark-button" data-action="${FC_ACTIONS.CONTINUE}" data-testid="fc-continue">${esc(lesson.button ?? 'Let\u2019s play')}</button>
    </div>
  </div>`;
}

/**
 * The persistent coach panel.
 * @param {object} view
 * @param {object} view.lesson — current lesson (or null)
 * @param {number} view.step — 1-based position among guided lessons
 * @param {number} view.total — count of guided lessons
 * @param {boolean} view.railsOff — guidance has been removed
 * @param {string} [view.coachSay] — transient reaction/coach answer line
 * @param {string} [view.statusLine] — small state line ("Turn 4 · You 7 — Rival 10")
 * @returns {string} HTML
 */
export function renderFcPanel(view) {
  const { lesson, step, total, railsOff, coachSay, statusLine } = view;
  const dots = Array.from({ length: total }, (_v, i) => {
    const state = i + 1 < step ? 'done' : i + 1 === step ? 'now' : 'todo';
    return `<span class="fc-dot fc-dot-${state}" aria-hidden="true"></span>`;
  }).join('');

  const text = lesson
    ? (railsOff ? `<p class="fc-text fc-text-railsoff">${lesson.text}</p>` : `<p class="fc-text">${lesson.text}</p>`)
    : '';

  return `<section class="fc-coach${railsOff ? ' fc-coach-railsoff' : ''}" data-testid="fc-coach" aria-label="First Contact coach">
    <header class="fc-coach-head">
      <span class="fc-coach-eyebrow">First Contact</span>
      ${statusLine ? `<span class="fc-coach-status" data-testid="fc-status">${esc(statusLine)}</span>` : ''}
      <span class="fc-dots" role="img" aria-label="Lesson ${step} of ${total}">${dots}</span>
    </header>
    ${text}
    ${coachSay ? `<p class="fc-say" data-testid="fc-say">${coachSay}</p>` : ''}
    <div class="fc-coach-actions" role="group" aria-label="Coach tools">
      <button type="button" class="fc-btn" data-action="${FC_ACTIONS.WHY}" data-testid="fc-why">Why?</button>
      <button type="button" class="fc-btn" data-action="${FC_ACTIONS.WHAT}" data-testid="fc-what">What can I do?</button>
      <button type="button" class="fc-btn" data-action="${FC_ACTIONS.SHOW}" data-testid="fc-show">Show me</button>
    </div>
  </section>`;
}

/**
 * Terminal-screen recap block. `recap` comes from
 * FirstContactController.onMatchEnd(). Rendered above the terminal
 * action row; CTAs are plain routes — no session state survives them.
 * @param {object} recap
 * @returns {string} HTML
 */
export function renderFcRecapBlock(recap) {
  const lines = (recap.lines ?? []).map((l) => `<p class="fc-recap-line">${esc(l)}</p>`).join('');
  return `<section class="fc-recap" data-testid="fc-recap" aria-label="First Contact recap">
    <p class="fc-recap-eyebrow">First Contact</p>
    <h3 class="fc-recap-title">${esc(recap.title)}</h3>
    <p class="fc-recap-progress" data-testid="fc-recap-progress">${recap.lessonsDone} of ${recap.lessonsTotal} lessons completed</p>
    ${lines}
    <div class="fc-recap-actions">
      <a class="primary-button" href="#/play/new" data-testid="fc-real-match">Play a real match</a>
      <a class="secondary-button" href="#/play/first-contact" data-testid="fc-restart">Run it back</a>
      <a class="secondary-button" href="#/play/academy" data-testid="fc-academy">Full Academy</a>
    </div>
  </section>`;
}
