// ═══════════════════════════════════════════════════════════════
// first-run-funnel.js — U7: First-run funnel completion
//
// Detects new players and guides them through a structured funnel:
//   1. Landing → Tutorial (Academy)
//   2. Tutorial → First AI win
//   3. First AI win → Account prompt
//   4. Account → First online duel
//
// State is persisted in localStorage under 'intrilex:funnel-state'.
// The funnel is non-blocking — it provides gentle guidance, not gates.
// Players can skip any step and the funnel won't re-prompt for it.
// ═══════════════════════════════════════════════════════════════

const FUNNEL_KEY = 'intrilex:funnel-state';
const FUNNEL_VERSION = 1;

/** Funnel steps in order */
export const FunnelStep = Object.freeze({
  LANDING: 'landing',           // Player has visited the site
  TUTORIAL_STARTED: 'tutorial_started', // Player started the academy
  TUTORIAL_COMPLETE: 'tutorial_complete', // Player finished academy lessons
  FIRST_AI_WIN: 'first_ai_win', // Player won their first AI match
  ACCOUNT_PROMPT: 'account_prompt', // Player was prompted to create an account
  FIRST_ONLINE_DUEL: 'first_online_duel', // Player played their first online match
  COMPLETE: 'complete',         // Funnel is done
});

const STEP_ORDER = [
  FunnelStep.LANDING,
  FunnelStep.TUTORIAL_STARTED,
  FunnelStep.TUTORIAL_COMPLETE,
  FunnelStep.FIRST_AI_WIN,
  FunnelStep.ACCOUNT_PROMPT,
  FunnelStep.FIRST_ONLINE_DUEL,
  FunnelStep.COMPLETE,
];

/**
 * Load the funnel state from localStorage.
 * @returns {object} The funnel state object
 */
export function loadFunnelState() {
  try {
    const raw = localStorage.getItem(FUNNEL_KEY);
    if (!raw) return { version: FUNNEL_VERSION, step: FunnelStep.LANDING, skipped: [], completedAt: {} };
    const state = JSON.parse(raw);
    if (state.version !== FUNNEL_VERSION) {
      // Reset on version mismatch
      return { version: FUNNEL_VERSION, step: FunnelStep.LANDING, skipped: [], completedAt: {} };
    }
    return state;
  } catch {
    return { version: FUNNEL_VERSION, step: FunnelStep.LANDING, skipped: [], completedAt: {} };
  }
}

/**
 * Save the funnel state to localStorage.
 * @param {object} state
 */
function saveFunnelState(state) {
  try {
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in private browsing
  }
}

/**
 * Get the current funnel step.
 * @returns {string} The current step from FunnelStep
 */
export function getCurrentStep() {
  return loadFunnelState().step;
}

/**
 * Check if a step has been completed.
 * @param {string} step
 * @returns {boolean}
 */
export function isStepCompleted(step) {
  const state = loadFunnelState();
  return Boolean(state.completedAt[step]) || state.skipped.includes(step);
}

/**
 * Check if the funnel is complete.
 * @returns {boolean}
 */
export function isFunnelComplete() {
  return getCurrentStep() === FunnelStep.COMPLETE;
}

/**
 * Advance to a specific step. Only advances forward, never backward.
 * @param {string} step - The step to advance to
 */
export function advanceToStep(step) {
  const state = loadFunnelState();
  const currentIdx = STEP_ORDER.indexOf(state.step);
  const targetIdx = STEP_ORDER.indexOf(step);
  if (targetIdx <= currentIdx) return; // Don't go backward

  // Mark all intermediate steps as completed
  for (let i = currentIdx; i < targetIdx; i++) {
    state.completedAt[STEP_ORDER[i]] = state.completedAt[STEP_ORDER[i]] ?? Date.now();
  }
  state.step = step;
  saveFunnelState(state);
}

/**
 * Mark a step as completed and advance to the next step.
 * @param {string} step - The step that was completed
 */
export function completeStep(step) {
  const state = loadFunnelState();
  state.completedAt[step] = Date.now();
  const idx = STEP_ORDER.indexOf(step);
  const currentIdx = STEP_ORDER.indexOf(state.step);
  // Only advance the cursor if we're completing the current step.
  // This prevents skipping steps when completeStep is called out of order
  // (e.g. entering the online lobby before finishing the tutorial).
  if (idx >= 0 && idx === currentIdx && idx + 1 < STEP_ORDER.length) {
    state.step = STEP_ORDER[idx + 1];
  }
  saveFunnelState(state);
}

/**
 * Skip a step. The funnel will advance past it without requiring completion.
 * @param {string} step
 */
export function skipStep(step) {
  const state = loadFunnelState();
  if (!state.skipped.includes(step)) {
    state.skipped.push(step);
  }
  state.completedAt[step] = Date.now();
  const idx = STEP_ORDER.indexOf(step);
  const currentIdx = STEP_ORDER.indexOf(state.step);
  // Only advance the cursor if we're skipping the current step.
  if (idx >= 0 && idx === currentIdx && idx + 1 < STEP_ORDER.length) {
    state.step = STEP_ORDER[idx + 1];
  }
  saveFunnelState(state);
}

/**
 * Get the next recommended action for the current funnel step.
 * Returns a description of what the player should do next.
 * @returns {{ step: string, title: string, description: string, cta: string, route: string } | null}
 */
export function getNextAction() {
  const step = getCurrentStep();
  if (step === FunnelStep.COMPLETE) return null;

  const actions = {
    [FunnelStep.LANDING]: {
      step: FunnelStep.LANDING,
      title: 'Learn the Game',
      description: 'Start with the Academy tutorial to learn the basics of Intrilex.',
      cta: 'Start Tutorial',
      route: '#/play/academy',
    },
    [FunnelStep.TUTORIAL_STARTED]: {
      step: FunnelStep.TUTORIAL_STARTED,
      title: 'Finish the Tutorial',
      description: 'Complete all Academy lessons to master the fundamentals.',
      cta: 'Continue Tutorial',
      route: '#/play/academy',
    },
    [FunnelStep.TUTORIAL_COMPLETE]: {
      step: FunnelStep.TUTORIAL_COMPLETE,
      title: 'Play Your First Match',
      description: 'Challenge the AI to your first game of Intrilex.',
      cta: 'Play vs AI',
      route: '#/play',
    },
    [FunnelStep.FIRST_AI_WIN]: {
      step: FunnelStep.FIRST_AI_WIN,
      title: 'Create an Account',
      description: 'Sign in to save your progress, unlock ranked play, and compete online.',
      cta: 'Sign In',
      route: '#/auth',
    },
    [FunnelStep.ACCOUNT_PROMPT]: {
      step: FunnelStep.ACCOUNT_PROMPT,
      title: 'Play Online',
      description: 'Test your skills against other players in an online duel.',
      cta: 'Find a Match',
      route: '#/play',
    },
    [FunnelStep.FIRST_ONLINE_DUEL]: {
      step: FunnelStep.FIRST_ONLINE_DUEL,
      title: 'You\'re Ready!',
      description: 'You\'ve completed the introduction. Explore ranked play, puzzles, and the observatory.',
      cta: 'Explore',
      route: '#/play',
    },
  };

  return actions[step] ?? null;
}

/**
 * Render a non-intrusive funnel banner for the current step.
 * Returns HTML string. Empty if funnel is complete or step is skipped.
 * @returns {string}
 */
export function renderFunnelBanner() {
  if (isFunnelComplete()) return '';
  const action = getNextAction();
  if (!action) return '';
  const state = loadFunnelState();
  if (state.skipped.includes(action.step)) return '';

  return `<div class="funnel-banner" data-testid="funnel-banner" data-funnel-step="${action.step}">
    <div class="funnel-banner-content">
      <span class="funnel-banner-title">${action.title}</span>
      <span class="funnel-banner-desc">${action.description}</span>
    </div>
    <div class="funnel-banner-actions">
      <a class="btn btn-sm funnel-banner-cta" href="${action.route}" data-testid="funnel-cta">${action.cta}</a>
      <button class="btn btn-sm funnel-banner-skip" data-action="funnel-skip" data-step="${action.step}" data-testid="funnel-skip" aria-label="Skip this step">Skip</button>
    </div>
  </div>`;
}

/**
 * Wire the funnel banner's skip button.
 * @param {HTMLElement} container
 */
export function wireFunnelBanner(container) {
  const skipBtn = container.querySelector('[data-action="funnel-skip"]');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      const step = skipBtn.dataset.step;
      skipStep(step);
      const banner = container.querySelector('[data-testid="funnel-banner"]');
      if (banner) banner.remove();
    });
  }
}
