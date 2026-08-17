// ═══════════════════════════════════════════════════════════════
// academy-recap.mjs — Post-lesson recap screen renderer
//
// Renders after a match ends for an academy lesson. Shows objectives
// met/missed, performance summary (attempts, hints used, mastery score
// in Phase 3), key takeaway, and Next/Replay/Back actions. If the
// lesson was failed (objectives not met / lost), "Try Again" is prominent.
// ═══════════════════════════════════════════════════════════════
import { TierId } from './curriculum.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TIER_ACCENT = {
  [TierId.FOUNDATIONS]: 'foundations',
  [TierId.MECHANICS]: 'mechanics',
  [TierId.APPLIED]: 'applied',
};

/**
 * @typedef {Object} RecapInput
 * @property {object} lesson - AcademyLesson
 * @property {boolean} won - human won the match
 * @property {string[]} objectivesMet - ids of objectives met during play
 * @property {number} attempts - total attempts on this lesson
 * @property {number} hintsUsed - hints used this attempt
 * @property {number} retries - retries this attempt
 * @property {number|null} masteryScore - Phase 3 mastery score
 * @property {boolean} isReplay - true if this was a replay of a completed lesson
 * @property {string|null} nextLessonId - id of the next lesson, or null if last
 * @property {string|null} nextLessonTitle - title of the next lesson, or null
 */

/**
 * Render the post-lesson recap screen.
 * @param {RecapInput} input
 * @returns {string} HTML
 */
export function renderRecap(input) {
  const { lesson, won, objectivesMet, attempts, hintsUsed, retries, masteryScore, isReplay, nextLessonId, nextLessonTitle,
    masteryTier, masteryTierLabel, masteryTierIcon, graduationAssessment, guidanceReason } = input;
  const accent = TIER_ACCENT[lesson.tier] ?? 'foundations';
  const metSet = new Set(objectivesMet ?? []);
  const allObjectives = lesson.briefing.objectives ?? [];
  const requiredObjectives = lesson.completion?.requiredObjectives ?? [];
  const allRequiredMet = requiredObjectives.every((id) => metSet.has(id));
  const passed = won && allRequiredMet;

  const objectivesHtml = allObjectives.map((o) => {
    const met = metSet.has(o.id);
    const icon = met ? '✓' : '✗';
    const cls = met ? 'academy-recap-check met' : 'academy-recap-check missed';
    return `<li class="academy-recap-objective" data-objective-id="${esc(o.id)}">
      <span class="${cls}" aria-hidden="true">${icon}</span>
      <span class="academy-recap-objective-text">${esc(o.label)}</span>
    </li>`;
  }).join('');

  // Phase 3: mastery badge with tier
  const masteryHtml = (typeof masteryScore === 'number')
    ? `<div class="academy-recap-stat academy-recap-mastery-stat" data-testid="academy-recap-mastery">
        <span class="academy-recap-stat-label">Mastery</span>
        <span class="academy-recap-stat-value">${(masteryScore * 100).toFixed(0)}%</span>
        ${masteryTier && masteryTier !== 'none' ? `<span class="academy-mastery-badge academy-mastery-${esc(masteryTier)}" data-testid="academy-mastery-badge">${esc(masteryTierIcon ?? '')} ${esc(masteryTierLabel ?? '')}</span>` : ''}
      </div>`
    : '';

  // Phase 3: guidance reason (adaptive feedback)
  const guidanceHtml = guidanceReason
    ? `<p class="academy-recap-guidance-reason" data-testid="academy-recap-guidance-reason">${esc(guidanceReason)}</p>`
    : '';

  // Phase 3: graduation assessment
  const graduationHtml = graduationAssessment
    ? `<div class="academy-graduation-assessment${graduationAssessment.passed ? ' passed' : ''}" data-testid="academy-graduation-assessment">
        <h3 class="academy-graduation-title">${graduationAssessment.passed ? '🎓 Graduated!' : 'Graduation Assessment'}</h3>
        <ul class="academy-graduation-requirements" data-testid="academy-graduation-requirements">
          ${graduationAssessment.requirements.map((r) => `<li class="academy-graduation-requirement">${esc(r)}</li>`).join('')}
        </ul>
        ${graduationAssessment.passed ? '<p class="academy-graduation-message">You have demonstrated mastery across the entire Academy curriculum. You are ready for the full game!</p>' : ''}
      </div>`
    : '';

  const nextHtml = (passed && nextLessonId)
    ? `<button class="primary-button academy-recap-next" data-action="academy-next-lesson" data-testid="academy-next-lesson" data-lesson-id="${esc(nextLessonId)}">Next: ${esc(nextLessonTitle ?? 'Lesson')}</button>`
    : '';

  const tryAgainHtml = (!passed)
    ? `<button class="primary-button academy-recap-retry" data-action="academy-retry-lesson" data-testid="academy-retry-lesson" data-lesson-id="${esc(lesson.id)}">Try again</button>`
    : `<button class="secondary-button academy-recap-replay" data-action="academy-retry-lesson" data-testid="academy-replay-lesson" data-lesson-id="${esc(lesson.id)}">Replay</button>`;

  const resultBanner = passed
    ? `<div class="academy-recap-banner pass" data-testid="academy-recap-banner"><span class="academy-recap-banner-icon" aria-hidden="true">✓</span><h2>Lesson complete</h2></div>`
    : `<div class="academy-recap-banner fail" data-testid="academy-recap-banner"><span class="academy-recap-banner-icon" aria-hidden="true">↻</span><h2>Lesson not passed yet</h2></div>`;

  return `<div class="academy-recap academy-tier-${esc(accent)}" data-testid="academy-recap" role="region" aria-label="${esc(lesson.title)} recap">
    <a class="play-setup-back" href="#/play/academy" aria-label="Back to Academy">← Back</a>
    <header class="academy-recap-header">
      <span class="academy-recap-icon" aria-hidden="true">${lesson.icon}</span>
      <div class="academy-recap-heading">
        <span class="academy-recap-tier-label">${esc(lesson.tier)}</span>
        <h2 class="academy-recap-title">${esc(lesson.title)}</h2>
      </div>
    </header>
    ${resultBanner}
    <div class="academy-recap-objectives-wrap">
      <h3 class="academy-recap-objectives-title">Objectives</h3>
      <ul class="academy-recap-objectives" data-testid="academy-recap-objectives">${objectivesHtml}</ul>
    </div>
    <div class="academy-recap-stats" data-testid="academy-recap-stats">
      <div class="academy-recap-stat" data-testid="academy-recap-attempts">
        <span class="academy-recap-stat-label">Attempts</span>
        <span class="academy-recap-stat-value">${attempts}</span>
      </div>
      <div class="academy-recap-stat" data-testid="academy-recap-hints">
        <span class="academy-recap-stat-label">Hints used</span>
        <span class="academy-recap-stat-value">${hintsUsed}</span>
      </div>
      <div class="academy-recap-stat" data-testid="academy-recap-retries">
        <span class="academy-recap-stat-label">Retries</span>
        <span class="academy-recap-stat-value">${retries}</span>
      </div>
      ${masteryHtml}
    </div>
    ${guidanceHtml}
    ${graduationHtml}
    <p class="academy-recap-takeaway" data-testid="academy-recap-takeaway">${esc(lesson.recap.takeaway)}</p>
    ${nextLessonId ? `<p class="academy-recap-next-preview" data-testid="academy-recap-next-preview">${esc(lesson.recap.nextPreview)}</p>` : ''}
    <div class="academy-recap-actions">
      ${nextHtml}
      ${tryAgainHtml}
      <a class="secondary-button academy-recap-back" href="#/play/academy" data-testid="academy-recap-back">Back to Academy</a>
    </div>
  </div>`;
}
