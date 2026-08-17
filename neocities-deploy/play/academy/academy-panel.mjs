// ═══════════════════════════════════════════════════════════════
// academy-panel.mjs — In-match persistent objective panel
//
// Renders a collapsible panel shown during academy matches. Displays
// the lesson title + objective checklist with live status (pending/✓).
// Default open for first attempt, collapsed for replays. Includes a
// Hint button (Phase 2 wires it to coachmark dispatch; Phase 3 makes
// it adaptive). The panel does not obscure the board.
//
// Phase 1: objectives are populated from the lesson briefing. Live
// status updates are wired via AcademyController.setObjectiveMet() in
// Phase 2; in Phase 1 all objectives render as pending during the match
// (completion is judged by winning the match).
// ═══════════════════════════════════════════════════════════════

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * localStorage key prefix for per-lesson panel collapse preference.
 * First attempt defaults to open; once collapsed, stays collapsed.
 */
const COLLAPSE_KEY_PREFIX = 'intrilex:academy-panel-collapsed:';

/**
 * Should the panel start collapsed for this lesson?
 * @param {string} lessonId
 * @returns {boolean}
 */
export function shouldPanelStartCollapsed(lessonId) {
  try {
    return localStorage.getItem(COLLAPSE_KEY_PREFIX + lessonId) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the panel collapse preference for a lesson.
 * @param {string} lessonId
 * @param {boolean} collapsed
 */
export function setPanelCollapsed(lessonId, collapsed) {
  try {
    if (collapsed) localStorage.setItem(COLLAPSE_KEY_PREFIX + lessonId, '1');
    else localStorage.removeItem(COLLAPSE_KEY_PREFIX + lessonId);
  } catch { /* localStorage unavailable */ }
}

/**
 * Render the in-match objective panel.
 * @param {object} lesson - AcademyLesson
 * @param {object} [opts]
 * @param {string[]} [opts.metObjectiveIds] - ids of objectives met so far
 * @param {boolean} [opts.collapsed] - render in collapsed state
 * @param {boolean} [opts.allowHint] - show the hint button (Phase 2+)
 * @returns {string} HTML
 */
export function renderObjectivePanel(lesson, opts = {}) {
  const metSet = new Set(opts.metObjectiveIds ?? []);
  const collapsed = opts.collapsed === true;
  const allowHint = opts.allowHint === true;
  const objectives = lesson.briefing.objectives ?? [];
  const metCount = objectives.filter((o) => metSet.has(o.id)).length;
  const total = objectives.length;

  const itemsHtml = objectives.map((o) => {
    const met = metSet.has(o.id);
    const icon = met ? '✓' : '○';
    const cls = met ? 'academy-objective-check met' : 'academy-objective-check pending';
    return `<li class="academy-objective-item" data-objective-id="${esc(o.id)}" data-met="${met ? '1' : '0'}">
      <span class="${cls}" aria-hidden="true">${icon}</span>
      <span class="academy-objective-label">${esc(o.label)}</span>
    </li>`;
  }).join('');

  const hintBtnHtml = allowHint
    ? `<button class="academy-objective-hint" data-action="academy-hint" data-testid="academy-hint" aria-label="Get a hint">Hint</button>`
    : '';

  const toggleLabel = collapsed ? 'Show objectives' : 'Hide';
  const bodyStyle = collapsed ? ' style="display:none"' : '';
  const summaryText = `${metCount}/${total} objectives`;

  return `<section class="academy-objective-panel${collapsed ? ' collapsed' : ''}" data-testid="academy-objective-panel" aria-label="Lesson objectives" data-lesson-id="${esc(lesson.id)}">
    <div class="academy-objective-panel-header">
      <button class="academy-panel-toggle" data-action="academy-toggle-panel" data-testid="academy-toggle-panel" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="academy-objective-panel-body">
        <span class="academy-panel-toggle-icon" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>
        <span class="academy-panel-toggle-title">${esc(lesson.icon)} ${esc(lesson.title)}</span>
        <span class="academy-panel-toggle-summary" data-testid="academy-panel-summary">${summaryText}</span>
      </button>
      ${hintBtnHtml}
    </div>
    <ul class="academy-objective-list" id="academy-objective-panel-body" data-testid="academy-objective-list"${bodyStyle}>
      ${itemsHtml}
    </ul>
  </section>`;
}

/**
 * Return the HTML for embedding inside the board layout (passed via
 * opts.academyPanelHtml to renderBoard). Returns empty string if no
 * lesson is supplied (non-academy matches).
 * @param {object|null} lesson
 * @param {object} [opts]
 * @returns {string}
 */
export function renderPanelForBoard(lesson, opts = {}) {
  if (!lesson) return '';
  return renderObjectivePanel(lesson, opts);
}
