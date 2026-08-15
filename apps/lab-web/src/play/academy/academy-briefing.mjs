// ═══════════════════════════════════════════════════════════════
// academy-briefing.mjs — Pre-lesson briefing screen renderer
//
// Renders a compact pre-lesson card with: title, icon, concept, key rule,
// objective checklist, and Start/Skip buttons. Returning players can
// skip the briefing (preference persisted per-lesson).
// ═══════════════════════════════════════════════════════════════
import { TierId } from './curriculum.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** localStorage key prefix for per-lesson skip-briefing preference */
const SKIP_KEY_PREFIX = 'intrilex:academy-skip-briefing:';

/**
 * Tier → gradient border color token (matches CSS .academy-tier-* classes).
 */
const TIER_ACCENT = {
  [TierId.FOUNDATIONS]: 'foundations',
  [TierId.MECHANICS]: 'mechanics',
  [TierId.APPLIED]: 'applied',
};

/**
 * Has the player opted to skip the briefing for this lesson?
 * @param {string} lessonId
 * @returns {boolean}
 */
export function shouldSkipBriefing(lessonId) {
  try {
    return localStorage.getItem(SKIP_KEY_PREFIX + lessonId) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the skip-briefing preference for a lesson.
 * @param {string} lessonId
 * @param {boolean} skip
 */
export function setSkipBriefing(lessonId, skip) {
  try {
    if (skip) localStorage.setItem(SKIP_KEY_PREFIX + lessonId, '1');
    else localStorage.removeItem(SKIP_KEY_PREFIX + lessonId);
  } catch { /* localStorage unavailable */ }
}

/**
 * Render the pre-lesson briefing screen.
 * @param {object} lesson - AcademyLesson
 * @param {object} [opts]
 * @param {boolean} [opts.isReplay] - true if replaying a completed lesson
 * @returns {string} HTML
 */
export function renderBriefing(lesson, opts = {}) {
  const tier = lesson.tier;
  const accent = TIER_ACCENT[tier] ?? 'foundations';
  const isReplay = opts.isReplay === true;
  const objectivesHtml = (lesson.briefing.objectives ?? []).map((o, i) => {
    const checkClass = 'academy-briefing-check pending';
    return `<li class="academy-briefing-objective" data-objective-id="${esc(o.id)}">
      <span class="${checkClass}" aria-hidden="true">○</span>
      <span class="academy-briefing-objective-text">${esc(o.label)}</span>
    </li>`;
  }).join('');

  const skipHtml = isReplay
    ? `<button class="academy-briefing-skip" data-action="academy-skip-briefing" data-testid="academy-skip-briefing" data-lesson-id="${esc(lesson.id)}">Skip briefing</button>`
    : '';

  return `<div class="academy-briefing academy-tier-${esc(accent)}" data-testid="academy-briefing" role="region" aria-label="${esc(lesson.title)} briefing">
    <a class="play-setup-back" href="#/play/academy" aria-label="Back to Academy">← Back</a>
    <header class="academy-briefing-header">
      <span class="academy-briefing-icon" aria-hidden="true">${lesson.icon}</span>
      <div class="academy-briefing-heading">
        <span class="academy-briefing-tier-label">${esc(tier)}</span>
        <h2 class="academy-briefing-title">${esc(lesson.title)}</h2>
      </div>
    </header>
    <p class="academy-briefing-concept">${esc(lesson.briefing.concept)}</p>
    <p class="academy-briefing-keyrule"><strong>Key rule:</strong> ${esc(lesson.briefing.keyRule)}</p>
    <div class="academy-briefing-objectives-wrap">
      <h3 class="academy-briefing-objectives-title">Objectives</h3>
      <ul class="academy-briefing-objectives" data-testid="academy-briefing-objectives">${objectivesHtml}</ul>
    </div>
    <div class="academy-briefing-actions">
      <button class="primary-button academy-briefing-start" data-action="academy-start-lesson" data-testid="academy-start-lesson" data-lesson-id="${esc(lesson.id)}">
        ${isReplay ? 'Replay lesson' : 'Start lesson'}
      </button>
      ${skipHtml}
    </div>
  </div>`;
}
