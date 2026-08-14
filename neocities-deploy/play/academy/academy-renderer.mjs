// ═══════════════════════════════════════════════════════════════
// academy-renderer.mjs — Academy 1.0 tutorial renderer
//
// Renders the Academy landing page with lesson cards and progress.
// Each lesson launches a first-contact match with guidance overlays.
// ═══════════════════════════════════════════════════════════════

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @typedef {Object} AcademyLesson
 * @property {string} id - Lesson identifier
 * @property {string} title - Display title
 * @property {string} icon - Emoji icon
 * @property {string} summary - Short description
 * @property {string[]} objectives - Learning objectives
 * @property {string} aiPolicy - AI policy ID for the practice match
 */

/** @type {AcademyLesson[]} */
export const ACADEMY_LESSONS = [
  {
    id: 'draw-and-score',
    title: 'Draw & Score',
    icon: '🎴',
    summary: 'Learn the core loop: draw a card, play it for points, reach your goal.',
    objectives: [
      'Draw a card from the Draw Pile each turn',
      'Play a card to your Point Row for its rank value',
      'Reach your Influence goal (21) to win',
    ],
    aiPolicy: 'score-rush-easy',
  },
  {
    id: 'card-effects',
    title: 'Card Effects',
    icon: '⚡',
    summary: 'Discover rank effects: 7=Scuttle, 6=Anchor, 5=Swap, 4=Peek, 3=Copy.',
    objectives: [
      'Play a 7 to scuttle an opponent\'s Point Row card',
      'Play a 6 to anchor a card (permanent points)',
      'Play a 5 to swap the Swap Bar',
    ],
    aiPolicy: 'control-easy',
  },
  {
    id: 'respond-and-counter',
    title: 'Respond & Counter',
    icon: '↩',
    summary: 'Master response windows: counter opponent actions or decline to pass.',
    objectives: [
      'Recognize when a response window opens',
      'Counter an opponent\'s action with a matching rank',
      'Decline (pass priority) to let the action resolve',
    ],
    aiPolicy: 'tempo-easy',
  },
  {
    id: 'royal-cards',
    title: 'Royal Cards',
    icon: '♛',
    summary: 'Learn the Queen (Ultra) and Jack (Attach) — powerful commitment plays.',
    objectives: [
      'Play a Jack to attach to an opponent\'s Point Row card',
      'Play a Queen for a powerful Ultra effect',
      'Understand that royals use your full turn commitment',
    ],
    aiPolicy: 'value-easy',
  },
  {
    id: 'win-the-game',
    title: 'Win the Game',
    icon: '🏆',
    summary: 'Put it all together: manage your hand, time your effects, and close the game.',
    objectives: [
      'Reduce opponent\'s Influence to 0, or',
      'Have the higher Influence when the Draw Pile is empty',
      'Win a full practice match against an easy AI',
    ],
    aiPolicy: 'random-legal',
  },
];

/**
 * Get the list of completed lesson IDs from localStorage.
 * @returns {string[]}
 */
export function getCompletedLessons() {
  try {
    const raw = localStorage.getItem('intrilex:academy-progress');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Mark a lesson as completed in localStorage.
 * @param {string} lessonId
 */
export function markLessonComplete(lessonId) {
  try {
    const completed = getCompletedLessons();
    if (!completed.includes(lessonId)) {
      completed.push(lessonId);
      localStorage.setItem('intrilex:academy-progress', JSON.stringify(completed));
    }
  } catch { /* localStorage unavailable */ }
}

/**
 * Render the Academy landing page.
 * @param {object} [opts]
 * @param {string[]} [opts.completedLessons] - Pre-fetched completed lesson IDs
 * @returns {string} HTML
 */
export function renderAcademy(opts = {}) {
  const completed = opts.completedLessons ?? [];
  const totalLessons = ACADEMY_LESSONS.length;
  const completedCount = completed.length;
  const progressPct = Math.round((completedCount / totalLessons) * 100);

  const lessonCards = ACADEMY_LESSONS.map((lesson, idx) => {
    const isComplete = completed.includes(lesson.id);
    const isLocked = idx > 0 && !completed.includes(ACADEMY_LESSONS[idx - 1].id);
    const cardClass = isLocked ? 'academy-lesson-card locked' : isComplete ? 'academy-lesson-card complete' : 'academy-lesson-card';
    const statusBadge = isComplete
      ? '<span class="academy-lesson-status complete" aria-label="Completed">✓</span>'
      : isLocked
        ? '<span class="academy-lesson-status locked" aria-label="Locked">🔒</span>'
        : '<span class="academy-lesson-status available" aria-label="Available">▶</span>';
    const objectivesHtml = lesson.objectives.map(o => `<li>${esc(o)}</li>`).join('');
    const actionLabel = isLocked ? 'Complete previous lesson' : isComplete ? 'Replay' : 'Start Lesson';
    const actionAttr = isLocked ? 'disabled' : `data-action="academy-start" data-lesson-id="${esc(lesson.id)}"`;

    return `<button class="${cardClass}" data-testid="academy-lesson-${esc(lesson.id)}" ${actionAttr}>
      <div class="academy-lesson-header">
        <span class="academy-lesson-icon" aria-hidden="true">${lesson.icon}</span>
        <span class="academy-lesson-number">Lesson ${idx + 1}</span>
        ${statusBadge}
      </div>
      <h3 class="academy-lesson-title">${esc(lesson.title)}</h3>
      <p class="academy-lesson-summary">${esc(lesson.summary)}</p>
      <ul class="academy-lesson-objectives">${objectivesHtml}</ul>
      <span class="academy-lesson-action">${esc(actionLabel)}</span>
    </button>`;
  }).join('');

  return `<div class="academy" data-testid="academy">
    <a class="play-setup-back" href="#/play/new" aria-label="Back to play hub">← Back</a>
    <header class="academy-header">
      <h1 class="academy-title">Academy</h1>
      <p class="academy-subtitle">Learn Intrilex step by step. Each lesson teaches a core mechanic through guided practice against an easy AI.</p>
      <div class="academy-progress-bar" data-testid="academy-progress">
        <div class="academy-progress-track">
          <div class="academy-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <span class="academy-progress-label">${completedCount} / ${totalLessons} lessons</span>
      </div>
    </header>
    <div class="academy-lessons-grid">
      ${lessonCards}
    </div>
    <div class="academy-footer">
      <p class="academy-footer-text">All lessons use the <strong>First Contact</strong> profile — simplified rules with advanced systems disabled. You graduate to the full <strong>Advanced Core</strong> profile when ready.</p>
      <a class="academy-puzzle-link" href="#/puzzles" data-testid="academy-puzzle-link">
        <span aria-hidden="true">🧩</span> Ready for challenges? Try the Puzzle Ladder →
      </a>
    </div>
  </div>`;
}

/**
 * Find a lesson by ID.
 * @param {string} lessonId
 * @returns {AcademyLesson|undefined}
 */
export function findLesson(lessonId) {
  return ACADEMY_LESSONS.find(l => l.id === lessonId);
}
