// ═══════════════════════════════════════════════════════════════
// academy-renderer.mjs — Academy 2.0 tiered tutorial renderer
//
// Renders the Academy landing page as a tiered curriculum (Foundations,
// Mechanics, Applied Play). Each tier shows its lessons as cards with
// locked/available/complete/in-progress states derived from the v2
// progress object.
//
// Backward compatibility:
//   - Exports ACADEMY_LESSONS (a flat array mirroring the v1 shape) so
//     legacy tests and any external readers keep working. The canonical
//     curriculum lives in curriculum.mjs.
//   - Exports getCompletedLessons() and markLessonComplete() as thin
//     delegates to academy-progress.mjs (v2 storage with v1 migration).
//   - Exports findLesson() delegating to curriculum.mjs.
//   - Exports renderAcademy() with the same signature/contract.
//
// v1 lesson ids are preserved as aliases via V1_TO_V2_LESSON_MAP so
// existing progress migrates automatically on first load.
// ═══════════════════════════════════════════════════════════════
import {
  CURRICULUM,
  curriculumByTier,  findLesson as findLessonV2,
  V1_TO_V2_LESSON_MAP,
  TierId,
} from './curriculum.mjs';
import {
  getCompletedLessonIds,
  markLessonComplete as markCompleteV2,
  loadProgress,
  isLessonLocked,
  isLessonAvailable,
  isLessonCompleted,
  overallProgress,
  tierSummaries,
  LessonStatus,
} from './academy-progress.mjs';
import {
  masteryTierFromScore,
  masteryTierDisplay,
  MasteryTier,
} from './academy-mastery.mjs';
import { getRecommendedLessons } from '../puzzle/puzzle-progress.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @typedef {Object} AcademyLesson
 * @property {string} id - Lesson identifier
 * @property {string} title - Display title
 * @property {string} icon - Emoji icon
 * @property {string} summary - Short description
 * @property {string[]} objectives - Learning objectives (flat labels)
 * @property {string} aiPolicy - AI policy ID for the practice match
 */

/**
 * Flat lesson array mirroring the v1 Academy 1.0 shape, derived from the
 * canonical v2 curriculum. Kept for backward compatibility with existing
 * tests and any external readers. The v2 curriculum (curriculum.mjs) is
 * the source of truth.
 * @type {AcademyLesson[]}
 */
export const ACADEMY_LESSONS = CURRICULUM.map((l) => ({
  id: l.id,
  title: l.title,
  icon: l.icon,
  summary: l.summary,
  objectives: (l.briefing.objectives ?? []).map((o) => o.label),
  aiPolicy: l.scenario.aiPolicyId,
}));

/**
 * Get the list of completed lesson IDs from localStorage (v2 shape,
 * migrated from v1 on first load). Backward-compatible return type
 * (string array) with the v1 Academy 1.0 implementation.
 * @returns {string[]}
 */
export function getCompletedLessons() {
  return getCompletedLessonIds();
}

/**
 * Mark a lesson as completed in localStorage. Accepts both v2 lesson
 * ids and legacy v1 ids (mapped via V1_TO_V2_LESSON_MAP).
 * @param {string} lessonId
 */
export function markLessonComplete(lessonId) {
  // Accept legacy v1 ids transparently
  const v2Id = V1_TO_V2_LESSON_MAP[lessonId] ?? lessonId;
  markCompleteV2(v2Id);
}

/**
 * Find a lesson by ID. Accepts both v2 and legacy v1 ids.
 * @param {string} lessonId
 * @returns {AcademyLesson|undefined}
 */
export function findLesson(lessonId) {
  const v2Id = V1_TO_V2_LESSON_MAP[lessonId] ?? lessonId;
  const v2 = findLessonV2(v2Id);
  if (!v2) return undefined;
  return ACADEMY_LESSONS.find((l) => l.id === v2.id);
}

/**
 * Find the canonical v2 lesson definition (full data model).
 * @param {string} lessonId
 * @returns {object|undefined}
 */
export function findLessonV2Full(lessonId) {
  const v2Id = V1_TO_V2_LESSON_MAP[lessonId] ?? lessonId;
  return findLessonV2(v2Id);
}

/**
 * Tier accent class for styling.
 * @param {string} tierId
 * @returns {string}
 */
function tierAccentClass(tierId) {
  if (tierId === TierId.FOUNDATIONS) return 'foundations';
  if (tierId === TierId.MECHANICS) return 'mechanics';
  if (tierId === TierId.APPLIED) return 'applied';
  return 'foundations';
}

/**
 * Render a single lesson card.
 * @param {object} lesson - canonical v2 lesson
 * @param {object} progress - v2 progress object
 * @param {number} indexInTier - 0-based index within its tier
 * @returns {string} HTML
 */
function renderLessonCard(lesson, progress, indexInTier) {
  const entry = progress.lessons[lesson.id] ?? { status: LessonStatus.LOCKED };
  const status = entry.status;
  const isComplete = status === LessonStatus.COMPLETED;
  const isLocked = status === LessonStatus.LOCKED;
  const isInProgress = status === LessonStatus.IN_PROGRESS;

  // Phase 3: mastery badge for completed lessons
  let masteryBadgeHtml = '';
  if (isComplete && typeof entry.masteryScore === 'number') {
    const tier = masteryTierFromScore(entry.masteryScore);
    if (tier !== MasteryTier.NONE) {
      const display = masteryTierDisplay(tier);
      masteryBadgeHtml = `<span class="academy-lesson-mastery academy-mastery-${esc(tier)}" data-testid="academy-lesson-mastery-${esc(lesson.id)}" aria-label="${esc(display.label)} mastery">${esc(display.icon)}</span>`;
    }
  }

  const cardClass = isLocked
    ? 'academy-lesson-card locked'
    : isComplete
      ? 'academy-lesson-card complete'
      : isInProgress
        ? 'academy-lesson-card in-progress'
        : 'academy-lesson-card';

  const statusBadge = isComplete
    ? '<span class="academy-lesson-status complete" aria-label="Completed">✓</span>'
    : isLocked
      ? '<span class="academy-lesson-status locked" aria-label="Locked">🔒</span>'
      : isInProgress
        ? '<span class="academy-lesson-status in-progress" aria-label="In progress">▶</span>'
        : '<span class="academy-lesson-status available" aria-label="Available">▶</span>';

  const objectivesHtml = (lesson.briefing.objectives ?? []).map((o) => `<li>${esc(o.label)}</li>`).join('');
  const actionLabel = isLocked
    ? 'Locked'
    : isComplete
      ? 'Replay'
      : isInProgress
        ? 'Continue'
        : 'Start Lesson';
  const actionAttr = isLocked
    ? 'disabled'
    : `data-action="academy-start" data-lesson-id="${esc(lesson.id)}"`;

  return `<button class="${cardClass}" data-testid="academy-lesson-${esc(lesson.id)}" ${actionAttr}>
    <div class="academy-lesson-header">
      <span class="academy-lesson-icon" aria-hidden="true">${lesson.icon}</span>
      <span class="academy-lesson-number">Lesson ${lesson.lessonOrder + 1}</span>
      ${statusBadge}
      ${masteryBadgeHtml}
    </div>
    <h3 class="academy-lesson-title">${esc(lesson.title)}</h3>
    <p class="academy-lesson-summary">${esc(lesson.summary)}</p>
    <ul class="academy-lesson-objectives">${objectivesHtml}</ul>
    <span class="academy-lesson-action">${esc(actionLabel)}</span>
  </button>`;
}

/**
 * Render a tier section.
 * @param {object} tier - { id, name, order, lessons }
 * @param {object} progress - v2 progress object
 * @returns {string} HTML
 */
function renderTierSection(tier, progress) {
  const accent = tierAccentClass(tier.id);
  const summary = tierSummaries(progress).find((t) => t.id === tier.id) ?? { completedCount: 0, total: tier.lessons.length };
  const tierLocked = !progress.tiers[tier.id]?.unlocked;
  const tierComplete = progress.tiers[tier.id]?.completed === true;
  const lockIcon = tierLocked ? '<span class="academy-tier-lock" aria-label="Locked tier">🔒</span>' : '';
  const completeIcon = tierComplete ? '<span class="academy-tier-complete" aria-label="Tier complete">✓</span>' : '';

  const cardsHtml = tier.lessons.map((lesson, idx) => renderLessonCard(lesson, progress, idx)).join('');

  return `<section class="academy-tier academy-tier-${esc(accent)}${tierLocked ? ' locked' : ''}${tierComplete ? ' complete' : ''}" data-testid="academy-tier-${esc(tier.id)}" data-tier-id="${esc(tier.id)}">
    <header class="academy-tier-header">
      <h2 class="academy-tier-title">${esc(tier.name)}${lockIcon}${completeIcon}</h2>
      <span class="academy-tier-progress" data-testid="academy-tier-progress-${esc(tier.id)}">${summary.completedCount} / ${summary.total}</span>
    </header>
    <div class="academy-lessons-grid">
      ${cardsHtml}
    </div>
  </section>`;
}

/**
 * Render the Academy landing page (tiered curriculum).
 * @param {object} [opts]
 * @param {string[]} [opts.completedLessons] - Pre-fetched completed lesson IDs (v2). If omitted, loaded from storage.
 * @returns {string} HTML
 */
export function renderAcademy(opts = {}) {
  // Load full v2 progress for tier/unlock state. If the caller supplied
  // only completedLessons (legacy callers), we still load progress for
  // tier state but use the supplied list for the progress bar count.
  const progress = loadProgress();
  const completed = opts.completedLessons ?? getCompletedLessonIds();
  const overall = overallProgress(progress);
  const progressPct = overall.pct;

  const tiersHtml = curriculumByTier()
    .sort((a, b) => a.order - b.order)
    .map((tier) => renderTierSection(tier, progress))
    .join('');

  // v0.30.0: Puzzle → lesson recommendations
  const recommendations = getRecommendedLessons(completed);
  const recommendationsHtml = recommendations.length > 0
    ? `<div class="academy-recommendations" data-testid="academy-recommendations" role="region" aria-label="Recommended lessons from puzzle performance">
        <h3 class="academy-recommendations-title">Recommended for you</h3>
        <p class="academy-recommendations-hint">Based on your puzzle performance, these lessons may help:</p>
        <ul class="academy-recommendations-list">
          ${recommendations.map(r => {
            const lesson = CURRICULUM.find(l => l.id === r.lessonId);
            if (!lesson) return '';
            return `<li class="academy-recommendation-item">
              <a href="#/play/academy?lesson=${esc(r.lessonId)}" data-testid="academy-recommendation-${esc(r.lessonId)}">
                <span class="academy-recommendation-icon" aria-hidden="true">${esc(lesson.icon ?? '📖')}</span>
                <span class="academy-recommendation-body">
                  <strong>${esc(lesson.title)}</strong>
                  <small>${esc(r.reason)}</small>
                </span>
              </a>
            </li>`;
          }).join('')}
        </ul>
      </div>`
    : '';

  return `<div class="academy" data-testid="academy">
    <a class="play-setup-back" href="#/play/new" aria-label="Back to play hub">← Back</a>
    <header class="academy-header">
      <h1 class="academy-title">Academy</h1>
      <p class="academy-subtitle">Learn Intrilex step by step across three tiers: Foundations, Mechanics, and Applied Play. Each lesson teaches a core mechanic through guided practice against an easy AI.</p>
      <div class="academy-progress-bar" data-testid="academy-progress">
        <div class="academy-progress-track">
          <div class="academy-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <span class="academy-progress-label">${overall.completed} / ${overall.total} lessons</span>
      </div>
    </header>
    ${tiersHtml}
    ${recommendationsHtml}
    <div class="academy-footer">
      <p class="academy-footer-text">All lessons use the <strong>First Contact</strong> profile — simplified rules with advanced systems disabled. You graduate to the full <strong>Advanced Core</strong> profile when ready.</p>
      <a class="academy-puzzle-link" href="#/puzzles" data-testid="academy-puzzle-link">
        <span aria-hidden="true">🧩</span> Ready for challenges? Try the Puzzle Ladder →
      </a>
    </div>
  </div>`;
}
