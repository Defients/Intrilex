// ═══════════════════════════════════════════════════════════════
// onboarding-tour.js — First-visit guided tour of key workspaces
//
// Shows a lightweight overlay tour on first visit to the observatory.
// Highlights 4 key workspaces with contextual tooltips.
// Persists completion in localStorage so it only shows once.
// Re-triggerable via #/watch?tour=1 or clearing localStorage.
// ═══════════════════════════════════════════════════════════════

const TOUR_KEY = 'intrilex-onboarding-completed';
const TOUR_VERSION = 1;

// Tour steps — each highlights a workspace nav link and shows a tooltip
const TOUR_STEPS = [
  {
    selector: '[data-route="/watch"]',
    title: 'Watch',
    body: 'The match theatre. Step through any match frame-by-frame with semantic navigation and causal evidence.',
    cta: 'Next',
  },
  {
    selector: '[data-route="/replays"]',
    title: 'Replays',
    body: 'Verify, search, and compare retained match evidence. Every replay is hash-verified against the canonical engine.',
    cta: 'Next',
  },
  {
    selector: '[data-route="/ranks"]',
    title: 'Ranks',
    body: 'Cohort-relative rank power profiles, counterfactual decision value, and the balance watchlist.',
    cta: 'Next',
  },
  {
    selector: '[data-route="/traces"]',
    title: 'Traces',
    body: 'Per-decision traces with score decomposition, reason codes, and full rule audit. Investigate why any decision was made.',
    cta: 'Finish',
  },
];

/**
 * Check if the onboarding tour should be shown.
 * Returns true if the user hasn't completed the tour (or is forcing it via ?tour=1).
 */
export function shouldShowTour() {
  // Force tour via URL parameter
  const url = new URL(location.href);
  if (url.searchParams.get('tour') === '1') return true;
  // Check localStorage
  try {
    const stored = localStorage.getItem(TOUR_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === TOUR_VERSION && parsed.completed) return false;
    }
  } catch { /* localStorage may be disabled */ }
  return true;
}

/**
 * Mark the onboarding tour as completed.
 */
function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify({ completed: true, version: TOUR_VERSION, at: new Date().toISOString() }));
  } catch { /* ignore */ }
}

/**
 * Start the onboarding tour. Creates an overlay with a spotlight
 * on each highlighted element and a tooltip with contextual info.
 */
export function startTour() {
  let currentStep = 0;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Workspace tour');

  // Spotlight element (punched-out hole in the overlay)
  const spotlight = document.createElement('div');
  spotlight.className = 'tour-spotlight';
  overlay.appendChild(spotlight);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';
  overlay.appendChild(tooltip);

  document.body.appendChild(overlay);

  // Keyboard handler
  function onKeyDown(e) {
    if (e.key === 'Escape') { closeTour(); }
    else if (e.key === 'ArrowRight') { nextStep(); }
    else if (e.key === 'ArrowLeft') { prevStep(); }
  }
  document.addEventListener('keydown', onKeyDown);

  function positionSpotlight(target) {
    if (!target) { spotlight.style.display = 'none'; return; }
    const rect = target.getBoundingClientRect();
    const pad = 8;
    spotlight.style.display = '';
    spotlight.style.top = `${rect.top - pad}px`;
    spotlight.style.left = `${rect.left - pad}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;
  }

  function positionTooltip(target) {
    if (!target) { tooltip.style.display = 'none'; return; }
    const rect = target.getBoundingClientRect();
    tooltip.style.display = '';
    // Position tooltip to the right of the target, or below if not enough space
    const tooltipWidth = 320;
    const spaceRight = window.innerWidth - rect.right;
    if (spaceRight >= tooltipWidth + 24) {
      tooltip.style.top = `${rect.top}px`;
      tooltip.style.left = `${rect.right + 16}px`;
      tooltip.style.right = '';
    } else {
      tooltip.style.top = `${rect.bottom + 16}px`;
      tooltip.style.left = `${Math.max(16, rect.left)}px`;
      tooltip.style.right = '';
    }
  }

  function renderStep() {
    const step = TOUR_STEPS[currentStep];
    if (!step) { closeTour(); return; }
    const target = document.querySelector(step.selector);
    positionSpotlight(target);
    positionTooltip(target);
    const stepNum = currentStep + 1;
    const total = TOUR_STEPS.length;
    tooltip.innerHTML = `
      <div class="tour-tooltip-header">
        <span class="tour-step-count">${stepNum} / ${total}</span>
        <button class="tour-skip" aria-label="Skip tour">Skip</button>
      </div>
      <h3 class="tour-title">${step.title}</h3>
      <p class="tour-body">${step.body}</p>
      <div class="tour-tooltip-footer">
        ${currentStep > 0 ? '<button class="tour-back">Back</button>' : ''}
        <button class="tour-next">${step.cta}</button>
      </div>
    `;
    tooltip.querySelector('.tour-skip')?.addEventListener('click', closeTour);
    tooltip.querySelector('.tour-back')?.addEventListener('click', prevStep);
    tooltip.querySelector('.tour-next')?.addEventListener('click', () => {
      if (currentStep < TOUR_STEPS.length - 1) nextStep();
      else closeTour();
    });
    // Focus the next button for keyboard navigation
    tooltip.querySelector('.tour-next')?.focus();
  }

  function nextStep() {
    if (currentStep < TOUR_STEPS.length - 1) { currentStep++; renderStep(); }
    else closeTour();
  }

  function prevStep() {
    if (currentStep > 0) { currentStep--; renderStep(); }
  }

  function closeTour() {
    markTourCompleted();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    // Remove the tour parameter from the URL
    if (location.hash.includes('tour=1')) {
      const cleanHash = location.hash.replace(/[?&]tour=1/, '');
      history.replaceState(null, '', cleanHash);
    }
  }

  // Reposition on resize/scroll
  function reposition() {
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const target = document.querySelector(step.selector);
    positionSpotlight(target);
    positionTooltip(target);
  }
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  renderStep();
}
