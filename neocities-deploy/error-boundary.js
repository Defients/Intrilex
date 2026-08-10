// ═══════════════════════════════════════════════════════════════
// error-boundary.js — Global error boundary for the Intrilex app.
//
// Catches unhandled errors and unhandled promise rejections,
// renders a user-friendly error overlay with recovery actions,
// and logs structured error context to the console.
// ═══════════════════════════════════════════════════════════════

let _installed = false;
let _errorCount = 0;
const MAX_ERRORS_BEFORE_RELOAD = 5;

/**
 * Render an error overlay into the given container.
 * @param {Error|{message:string,stack?:string}} error
 * @param {HTMLElement} container
 * @param {string} [context] — optional context label (e.g. route name)
 */
export function renderErrorOverlay(error, container, context = '') {
  if (!container) return;
  const msg = esc(error.message ?? String(error));
  const stack = esc(error.stack ?? '');
  const ctx = context ? ` in <strong>${esc(context)}</strong>` : '';
  container.innerHTML = `
    <div class="error-boundary" role="alert" aria-live="assertive">
      <div class="error-boundary-card">
        <h2 class="error-boundary-title">Something went wrong</h2>
        <p class="error-boundary-message">An unexpected error occurred${ctx}.</p>
        <pre class="error-boundary-detail">${msg}</pre>
        ${stack ? `<details class="error-boundary-stack"><summary>Stack trace</summary><pre>${stack}</pre></details>` : ''}
        <div class="error-boundary-actions">
          <button class="error-boundary-btn error-boundary-retry" type="button">Retry</button>
          <button class="error-boundary-btn error-boundary-reload" type="button">Reload page</button>
        </div>
      </div>
    </div>`;
  const retryBtn = container.querySelector('.error-boundary-retry');
  const reloadBtn = container.querySelector('.error-boundary-reload');
  if (retryBtn) retryBtn.addEventListener('click', () => {
    container.innerHTML = '';
    window.dispatchEvent(new CustomEvent('error-boundary-retry'));
  });
  if (reloadBtn) reloadBtn.addEventListener('click', () => window.location.reload());
}

/**
 * Install global error handlers for unhandled errors and promise rejections.
 * Call once at app startup.
 */
export function installGlobalErrorBoundary() {
  if (_installed) return;
  _installed = true;

  window.addEventListener('error', (event) => {
    _errorCount++;
    console.error('[error-boundary] Unhandled error:', event.error ?? event.message);
    if (_errorCount >= MAX_ERRORS_BEFORE_RELOAD) {
      console.warn('[error-boundary] Too many errors — suggesting page reload');
    }
    // Prevent default white-screen
    if (event.error) {
      const app = document.querySelector('#app, #play-root, .landing-app');
      if (app && _errorCount < MAX_ERRORS_BEFORE_RELOAD) {
        renderErrorOverlay(event.error, app, event.filename ? `at ${event.filename}:${event.lineno}` : '');
        event.preventDefault();
      }
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    _errorCount++;
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    console.error('[error-boundary] Unhandled promise rejection:', reason);
    if (_errorCount < MAX_ERRORS_BEFORE_RELOAD) {
      const app = document.querySelector('#app, #play-root, .landing-app');
      if (app) renderErrorOverlay(reason, app, 'async operation');
    }
  });

  console.log('[error-boundary] Global error handlers installed');
}

/**
 * Wrap an async function with error boundary protection.
 * @param {Function} fn
 * @param {HTMLElement} container
 * @param {string} [context]
 * @returns {Function}
 */
export function withErrorBoundary(fn, container, context = '') {
  return async function (...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      console.error(`[error-boundary] Caught in ${context || 'wrapped function'}:`, error);
      renderErrorOverlay(error, container, context);
    }
  };
}

// ── Minimal HTML escaper (avoids circular import to state.js) ──
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
