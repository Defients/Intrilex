/** Owns the active landing dialog, focus trap, dismissal and renderer cleanup. */
export function createLandingOverlays({ state, esc, renderAuth }) {
let _landingOverlay = null;
let _landingOverlayTeardown = null;

/** Close the active landing overlay, running its teardown callback and removing the DOM node. */
function closeLandingOverlay() {
  document.removeEventListener('keydown', _overlayEscHandler);
  if (!_landingOverlay) return;
  // Run any registered teardown (e.g. abort in-flight requests, clear timers)
  if (_landingOverlayTeardown) {
    try { _landingOverlayTeardown(); } catch (e) { console.error('[closeLandingOverlay] teardown error:', e); }
    _landingOverlayTeardown = null;
  }
  _landingOverlay.classList.remove('landing-overlay--visible');
  const el = _landingOverlay;
  _landingOverlay = null;
  // IRX-M07: Respect reduced motion — remove immediately instead of animating
  const delay = state.reducedMotion ? 0 : 300;
  setTimeout(() => el.remove(), delay);
}

/**
 * Open a full-screen landing overlay with the given title and content renderer.
 * @param {string} title - Overlay title shown in the header
 * @param {(container: HTMLElement) => void|Promise<void>} renderer - Renders overlay content into the container
 * @param {() => void} [teardown] - Optional cleanup callback (abort requests, clear timers) called on close
 */
function openLandingOverlay(title, renderer, teardown) {
  // Remove any existing overlay (and run its teardown)
  if (_landingOverlay) {
    document.removeEventListener('keydown', _overlayEscHandler);
    if (_landingOverlayTeardown) { try { _landingOverlayTeardown(); } catch { /* best-effort */ } }
    _landingOverlayTeardown = null;
    _landingOverlay.remove();
    _landingOverlay = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'landing-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'landing-overlay-title');
  overlay.innerHTML = `<div class="landing-overlay-backdrop" data-overlay-close></div>
    <div class="landing-overlay-card">
      <div class="landing-overlay-header">
        <h2 id="landing-overlay-title">${esc(title)}</h2>
        <button class="landing-overlay-close" data-overlay-close aria-label="Close ${esc(title)}">&times;</button>
      </div>
      <div class="landing-overlay-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  _landingOverlay = overlay;
  _landingOverlayTeardown = typeof teardown === 'function' ? teardown : null;
  requestAnimationFrame(() => overlay.classList.add('landing-overlay--visible'));

  // Close handlers
  overlay.querySelectorAll('[data-overlay-close]').forEach(el =>
    el.addEventListener('click', closeLandingOverlay));
  document.addEventListener('keydown', _overlayEscHandler);

  // IRX-M08: Focus trap — keep Tab/Shift+Tab within the dialog
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  /** @param {KeyboardEvent} e */
  function _overlayTabTrap(e) {
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll(focusableSelector);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  overlay.addEventListener('keydown', _overlayTabTrap);
  // Focus the first focusable element to enter the dialog
  const initialFocus = overlay.querySelector(focusableSelector);
  if (initialFocus) initialFocus.focus();

  // Render content
  const body = overlay.querySelector('.landing-overlay-body');
  try {
    const result = renderer(body);
    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        if (_landingOverlay !== overlay) return;
        console.error(`[openLandingOverlay] Async error for ${title}:`, error);
        body.innerHTML = `<div class="notice danger"><strong>Error.</strong><p>Failed to render ${esc(title)}.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
      });
    }
  } catch (error) {
    console.error(`[openLandingOverlay] Error for ${title}:`, error);
    body.innerHTML = `<div class="notice danger"><strong>Error.</strong><p>Failed to render ${esc(title)}.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
  }
}

function _overlayEscHandler(e) {
  if (e.key === 'Escape' && _landingOverlay) {
    closeLandingOverlay();
    document.removeEventListener('keydown', _overlayEscHandler);
  }
}


function openAuthOverlay() {
  // Sign In has its own panel (.auth-card), so we bypass the standard
  // landing-overlay-card wrapper to avoid a panel-inside-a-panel.
  // The .auth-card is rendered directly as the floating overlay card.
  if (_landingOverlay) {
    document.removeEventListener('keydown', _overlayEscHandler);
    if (_landingOverlayTeardown) { try { _landingOverlayTeardown(); } catch { /* best-effort */ } }
    _landingOverlayTeardown = null;
    _landingOverlay.remove();
    _landingOverlay = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'landing-overlay landing-overlay--bare';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'auth-overlay-title');
  overlay.innerHTML = `<div class="landing-overlay-backdrop" data-overlay-close></div>
    <div class="landing-overlay-body landing-overlay-body--bare"></div>`;
  document.body.appendChild(overlay);
  _landingOverlay = overlay;
  requestAnimationFrame(() => overlay.classList.add('landing-overlay--visible'));

  // Close handlers
  overlay.querySelectorAll('[data-overlay-close]').forEach(el =>
    el.addEventListener('click', closeLandingOverlay));
  document.addEventListener('keydown', _overlayEscHandler);

  // Render auth content; the .auth-card becomes the floating panel.
  const body = overlay.querySelector('.landing-overlay-body--bare');
  try {
    renderAuth(body);
  } catch (error) {
    console.error('[openAuthOverlay] Error:', error);
    body.innerHTML = `<div class="notice danger"><strong>Error.</strong><p>Failed to render Sign In.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
  }

  // Inject a close button into the auth-card header so the overlay is dismissible.
  const authHeader = body.querySelector('.auth-card .auth-header');
  if (authHeader) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'landing-overlay-close auth-overlay-close';
    closeBtn.setAttribute('aria-label', 'Close Sign In');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeLandingOverlay);
    authHeader.appendChild(closeBtn);
  }

  // The Continue to Lobby button should also close this overlay; the
  // wireAuthActions handler in auth.js will navigate the hash to
  // #/play/online. Use event delegation because renderAuth re-renders
  // the auth-card when auth state changes, replacing the button and
  // any listener attached directly to it.
  body.addEventListener('click', (e) => {
    const continueBtn = e.target.closest('#auth-continue');
    if (continueBtn) closeLandingOverlay();
  });
}


return { closeLandingOverlay, openLandingOverlay, openAuthOverlay };
}
