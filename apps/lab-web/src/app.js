// ═══════════════════════════════════════════════════════════════
// app.js — Application orchestrator. Imports all modules, dispatches
// routing to workspace renderers, and owns the Watch workspace.
// ═══════════════════════════════════════════════════════════════

import { getCardDefinition } from './card-face-data.js';
import { renderRulesPage } from './rulebook-renderer.js';
import { RULES_VERSION, ENGINE_VERSION, LAB_VERSION } from './version.js';
import { state,        app,        shell,        landingContainer,        fxLayer,        pageTitle,        pageSubtitle,        esc,        clamp,        showToast} from './state.js';
import { TITLES,   SUBTITLES,   LANDING_MODES,   isPlayRoute,   route} from './router.js';
import { boot,   loadReplay,   getObservatoryBootPromise} from './data-loader.js';
import {} from './experiment-controls.js';
import {} from './integrity.js';
import { renderRanks } from './workspaces/ranks.js';
import { renderDiagnostics } from './workspaces/diagnostics.js';
import { renderBranches} from './workspaces/branches.js';
import { renderEvidence } from './workspaces/evidence.js';
import { renderReleaseNotes } from './workspaces/release-notes.js';
import { renderIntelligence } from './workspaces/intelligence.js';
import { renderTournament } from './workspaces/tournament.js';
import { renderProfile } from './workspaces/profile.js';
import { renderPlayers, destroyPlayers } from './workspaces/players.js';
import { renderLeaderboard, destroyLeaderboard } from './workspaces/leaderboard.js';
import { renderSeasonArchive } from './workspaces/season-archive.js';
import { renderMetaReport } from './workspaces/meta-report.js';
import { renderHumanTournaments } from './workspaces/human-tournaments.js';
import { renderAuth } from './workspaces/auth.js';
import { renderSettings } from './workspaces/settings.js';
import { renderCompare, renderMechanics, renderSynergies, renderHistory, renderReplays, renderTraces } from './workspaces/observatory.js';
import { installGlobalErrorBoundary, withErrorBoundary } from './error-boundary.js';
import { renderPrivacyPage, renderTermsPage } from './legal-pages.js';
import { applyRouteMetadata, populateObservatoryShellText, populateDialogHeading } from './seo-metadata.js';

// IRX-M32: Play-related modules are dynamically imported to enable code splitting.
// The esbuild bundler (splitting: true) creates separate lazy chunks for these
// modules, keeping them out of the initial bundle. They are loaded on-demand
// when the user navigates to a play route or opens a play-related overlay.
// The lazyLoad helper caches the import promise so concurrent calls share a
// single dynamic import() — no repeated module fetches. The import() call
// must be passed as a thunk (not a string) so esbuild can statically analyze
// the literal module path and emit a separate chunk.

/**
 * Create a lazy-loaded module accessor that caches the import promise.
 * @param {() => Promise<typeof import('*')>} importFn - Thunk that calls `import('./literal-path.js')`
 * @returns {() => Promise<typeof import('*')>} Async getter with `.cached` property (null until resolved)
 */
function lazyLoad(importFn) {
  /** @type {Promise<typeof import('*')> | null} */
  let promise = null;
  /** @type {Record<string, any> | null} */
  let resolved = null;
  /** @type {(() => Promise<typeof import('*')>) & { cached: Record<string, any> | null }} */
  const getter = async () => {
    if (!promise) {
      promise = importFn().then(mod => { resolved = mod; return mod; });
    }
    return promise;
  };
  Object.defineProperty(getter, 'cached', { get: () => resolved });
  return getter;
}

const getAdvancedCardRules = lazyLoad(() => import('./play/advanced-card-rules/advanced-card-rules-controller.mjs'));
const getAchievementUi = lazyLoad(() => import('./play/achievements/achievement-ui.js'));
const getPuzzleApp = lazyLoad(() => import('./play/puzzle/puzzle-app.mjs'));
const getRankingOverlay = lazyLoad(() => import('./play/rank/ranking-system-overlay.js'));
const getMatchServerConfig = lazyLoad(() => import('./play/network/match-server-config.js'));
const getAuthController = lazyLoad(() => import('./play/network/auth-controller.js'));
const getAccountStore = lazyLoad(() => import('./play/network/account-store.js'));
const getMigrationController = lazyLoad(() => import('./play/network/migration-controller.js'));

// Install global error boundary at module load time
installGlobalErrorBoundary();

// Diagnose runtime config on bootstrap — logs structured warnings to
// console if __INTRILEX_CONFIG__ is missing or incomplete in production.
// This helps diagnose config-file load failures (404, CSP block, SW stale
// cache) without adding heavy telemetry infrastructure.
// IRX-M32: Deferred to a dynamic import so the config module is lazy-loaded.
getMatchServerConfig().then(({ diagnoseConfig }) => diagnoseConfig()).catch(() => {});

// ═══════════════════════════════════════════════════════════════
// CACHED SHELL ELEMENTS — queried once, reused across renders
// ═══════════════════════════════════════════════════════════════
// These elements live in the static shell HTML and are never replaced
// by innerHTML, so they're safe to cache. Lazy-init avoids timing issues
// if app.js loads before the shell DOM is parsed.
let _breadcrumbEl = null;
let _visibilityEl = null;
let _layoutPresetEl = null;
let _workspaceLinks = null;
let _filterBarEl = null;
let _clearFiltersEl = null;

function cachedBreadcrumb() {
  return _breadcrumbEl ??= document.querySelector('#breadcrumb-current');
}
function cachedVisibility() {
  return _visibilityEl ??= document.querySelector('#global-visibility');
}
function cachedLayoutPreset() {
  return _layoutPresetEl ??= document.querySelector('#layout-preset');
}
function cachedWorkspaceLinks() {
  return _workspaceLinks ??= document.querySelectorAll('.workspace-link');
}
function cachedFilterBar() {
  return _filterBarEl ??= document.querySelector('#global-filter-bar');
}

// ═══════════════════════════════════════════════════════════════
// MAIN RENDER DISPATCH
// ═══════════════════════════════════════════════════════════════

/**
 * Hide the observatory shell using the `hidden` attribute + `inert` +
 * `aria-hidden` for strong semantic exclusion. This prevents the Lab's
 * text content from contaminating crawler-visible content and removes
 * it from the accessibility tree and tab order.
 */
function hideShell() {
  if (!shell) return;
  shell.setAttribute('hidden', '');
  shell.setAttribute('inert', '');
  shell.setAttribute('aria-hidden', 'true');
  shell.style.display = 'none';
  // Redirect skip-link to the landing container (the visible content region)
  const skip = document.querySelector('.skip-link');
  if (skip) skip.setAttribute('href', '#landing-app');
}

/**
 * Show the observatory shell, populate its Lab-specific text content
 * from version constants, and remove the semantic hiding attributes.
 */
function showShell() {
  if (!shell) return;
  shell.removeAttribute('hidden');
  shell.removeAttribute('inert');
  shell.removeAttribute('aria-hidden');
  shell.style.display = '';
  // Restore skip-link target to the observatory main region
  const skip = document.querySelector('.skip-link');
  if (skip) skip.setAttribute('href', '#main');
  populateObservatoryShellText();
}

/**
 * Main render dispatch — routes to the appropriate workspace renderer
 * based on the current hash route. Handles three top-level modes:
 *   1. Play routes (#/play/*) → hideShell + renderPlayMode (lazy-loaded)
 *   2. Landing routes (#/, #/rules, #/auth, etc.) → hideShell + renderLandingMode
 *   3. Observatory workspaces (#/watch, #/mechanics, etc.) → showShell + renderer map
 *
 * Async renderers are caught and display an error notice in the app container.
 * The Watch workspace loads replays in the background without blocking render.
 * @param {string} [r] - Route to render (defaults to current route from router)
 */
export function render() {
  const r = route();
  // IRX-C12: Route lifecycle cleanup — when navigating away from a play route
  // to a non-play route, clean up play resources (WebSockets, timers, listeners,
  // sound/particle engines). Without this, navigating from /play/match to /rules
  // leaves queue WebSockets, spectator WebSockets, heartbeat timers, autosave
  // timers, reconnect-grace countdowns, keyboard listeners, visibility listeners,
  // beforeunload handlers, and AI work all running in the background.
  if (_previousRoute && isPlayRoute(_previousRoute) && !isPlayRoute(r)) {
    if (_playModule && typeof _playModule.cleanupPlay === 'function') {
      try { _playModule.cleanupPlay(); } catch (e) { console.warn('[render] cleanupPlay error:', e); }
    }
  }
  _previousRoute = r;
  // Apply route-scoped metadata (title, description, canonical, OG, Twitter).
  // This replaces the old ad-hoc metadata restore block and ensures every
  // route owns its own identity with no cross-route leakage.
  applyRouteMetadata(r);
  if (isPlayRoute(r)) {
    hideShell();
    if (landingContainer) landingContainer.style.display = 'block';
    renderPlayMode(r);
    return;
  }
  if (LANDING_MODES.has(r)) {
    hideShell();
    if (landingContainer) landingContainer.style.display = 'block';
    renderLandingMode(r);
    return;
  }
  showShell();
  if (landingContainer) landingContainer.style.display = 'none';
  // If observatory data is still loading in the background (started by boot()
  // for landing/play routes), wait for it to complete before rendering.
  const bootPromise = getObservatoryBootPromise();
  if (bootPromise) {
    bootPromise.then(() => { render(); }).catch(() => { render(); });
    return;
  }
  // Only the Watch workspace needs a loaded replay. Other workspaces render
  // from observatory data (summaries, analytics, indices) and must not be
  // blocked by replay loading — especially since replay blobs are excluded
  // from the build by default (~670MB savings), which means loadReplay()
  // silently fails and would otherwise cause an infinite render loop.
  if (r === '/watch' && !state.replay && state._replayLoadedFor !== state.fixtureId) {
    state._replayLoadedFor = state.fixtureId;
    // IRX-H21: Don't block the Watch workspace if replay loading fails.
    // Attempt to load the replay in the background. If it succeeds, re-render.
    // If it fails (e.g. replay blobs excluded from build), the Watch workspace
    // still renders with its title and frame-slider placeholder (renderWatch
    // handles the null replay case).
    loadReplay(state.fixtureId).then(() => {
      if (state.replay) render();
    }).catch(() => {
      // Replay load failed — render() will show the empty-state Watch workspace
    });
    // Don't return — fall through to render the Watch workspace immediately
    // with the empty state (frame-slider placeholder). When loadReplay resolves,
    // render() will be called again with the loaded replay.
  }
  pageTitle.textContent = TITLES[r];
  pageSubtitle.textContent = SUBTITLES[r];
  const breadcrumbCurrent = cachedBreadcrumb();
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = TITLES[r] ?? 'Observatory';
  cachedWorkspaceLinks().forEach(link => link.classList.toggle('active', link.dataset.route === r));
  const visEl = cachedVisibility();
  if (visEl) visEl.value = state.visibility;
  const layoutEl = cachedLayoutPreset();
  if (layoutEl) layoutEl.value = state.layout;
  shell.dataset.preset = state.layout;
  renderFilters();
  stopTransientFx();
  const renderers = {
    '/watch': renderWatch, '/replays': renderReplays, '/history': renderHistory,
    '/mechanics': renderMechanics, '/synergies': renderSynergies,
    '/ranks': renderRanks, '/compare': renderCompare, '/traces': renderTraces,
    '/branches': renderBranches, '/diagnostics': renderDiagnostics, '/tournament': renderTournament, '/evidence': renderEvidence, '/release-notes': renderReleaseNotes, '/profile': renderProfile, '/player': renderProfile, '/intelligence': renderIntelligence, '/achievements': async () => { const { renderAchievementsWorkspace } = await getAchievementUi(); return renderAchievementsWorkspace(app); }, '/settings': renderSettings
  };
  try {
    const result = (renderers[r] ?? renderEvidence)();
    // Handle async renderers (renderProfile, renderAchievementsWorkspace, renderReleaseNotes)
    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        console.error(`[render] Async workspace error for ${r}:`, error);
        app.innerHTML = `<div class="notice danger"><strong>Workspace error.</strong><p>Failed to render ${esc(r)}.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
      });
    }
  }
  catch (error) {
    console.error(`[render] Workspace error for ${r}:`, error);
    app.innerHTML = `<div class="notice danger"><strong>Workspace error.</strong><p>Failed to render ${esc(r)}.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
  }
}

/**
 * Render a landing-mode route (homepage, rules, auth, players, puzzles, leaderboard).
 * These routes render into the landing container with the observatory shell hidden.
 * @param {string} r - Route path (e.g. '/', '/rules', '/auth')
 */
function renderLandingMode(r) {
  if (!landingContainer) return;
  if (r === '/') renderWipLanding();
  else if (r === '/dev') renderLanding();
  else if (r === '/rules') renderRules();
  else if (r === '/privacy') renderLegalPage(r);
  else if (r === '/terms') renderLegalPage(r);
  else if (r === '/auth') {
    // Sign In is an overlay on the homepage, not a Simulation Lab workspace.
    // Render the landing page first, then open the auth overlay on top.
    renderWipLanding();
    openAuthOverlay();
  }
  else if (r === '/players') {
    // Players is an overlay on the homepage, not a Simulation Lab workspace.
    renderWipLanding();
    openPlayersOverlay();
  }
  else if (r === '/dev/puzzles' || r === '/puzzles') {
    // Puzzle Mode — promoted to player-facing /puzzles route (v0.28.0).
    // The /dev/puzzles route is kept for backward compatibility.
    // Renders into the landing container (homepage shell hidden).
    if (landingContainer) landingContainer.innerHTML = '<div id="puzzle-root"></div>';
    const root = landingContainer?.querySelector('#puzzle-root');
    if (root) {
      getPuzzleApp().then(({ handlePuzzleRoute }) => handlePuzzleRoute(root))
        .catch((err) => console.error('[puzzle] failed to load puzzle module:', err));
    }
  }
  else if (r === '/leaderboard') {
    // Leaderboard is an overlay on the homepage, not a Simulation Lab workspace.
    renderWipLanding();
    openLeaderboardOverlay();
  }
  else if (r === '/seasons') {
    // Season Archive — player-facing summary of all past ranked seasons.
    if (landingContainer) {
      landingContainer.innerHTML = '';
      renderSeasonArchive().catch((err) => {
        console.error('[season-archive] failed to render:', err);
        landingContainer.innerHTML = `<div class="notice danger"><strong>Season archive error.</strong><pre>${esc(err.stack ?? err.message)}</pre></div>`;
      });
    }
  }
  else if (r === '/meta') {
    // Meta Report — competitive landscape aggregate view.
    if (landingContainer) {
      landingContainer.innerHTML = '';
      renderMetaReport().catch((err) => {
        console.error('[meta-report] failed to render:', err);
        landingContainer.innerHTML = `<div class="notice danger"><strong>Meta report error.</strong><pre>${esc(err.stack ?? err.message)}</pre></div>`;
      });
    }
  }
  else if (r === '/tournaments') {
    // Human Tournaments — discovery, registration, and bracket viewer.
    if (landingContainer) {
      landingContainer.innerHTML = '';
      renderHumanTournaments().catch((err) => {
        console.error('[human-tournaments] failed to render:', err);
        landingContainer.innerHTML = `<div class="notice danger"><strong>Tournament error.</strong><pre>${esc(err.stack ?? err.message)}</pre></div>`;
      });
    }
  }
}

/**
 * Render a legal page (Privacy Policy or Terms of Service) inside the
 * landing container using the same reading layout as the rules page.
 * Metadata is handled by applyRouteMetadata() in the render() dispatch.
 * @param {string} r - Route ('/privacy' or '/terms')
 */
function renderLegalPage(r) {
  landingContainer.innerHTML = `<div class="landing-app rules-app">
    <a class="skip skip-link" href="#legal-content">Skip to content</a>
    <a class="back-button" href="#/" aria-label="Back to landing">&larr; Back</a>
    <div id="legal-page-root"></div>
  </div>`;
  const root = landingContainer.querySelector('#legal-page-root');
  if (r === '/privacy') renderPrivacyPage(root);
  else renderTermsPage(root);
}

// ═══════════════════════════════════════════════════════════════
// LANDING OVERLAY — Large modal overlay for account features
// (Settings, Achievements, Match History, Profile, Sign In)
// Renders on top of the homepage without navigating away.
// ═══════════════════════════════════════════════════════════════
let _landingOverlay = null;
let _landingOverlayTeardown = null;

/** Close the active landing overlay, running its teardown callback and removing the DOM node. */
function closeLandingOverlay() {
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

// ── Overlay content renderers ────────────────────────────────────

function openProfileOverlay() {
  openLandingOverlay('Profile', (c) => renderProfile(c));
}

function openSettingsOverlay() {
  openLandingOverlay('Settings', (c) => renderSettings(c));
}

function openAuthOverlay() {
  // Sign In has its own panel (.auth-card), so we bypass the standard
  // landing-overlay-card wrapper to avoid a panel-inside-a-panel.
  // The .auth-card is rendered directly as the floating overlay card.
  if (_landingOverlay) {
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

function openAchievementsOverlay() {
  openLandingOverlay('Achievements', async (c) => {
    const { renderAchievementsWorkspace } = await getAchievementUi();
    return renderAchievementsWorkspace(c);
  });
}

function openReleaseNotesOverlay() {
  openLandingOverlay("What's New", (c) => renderReleaseNotes(c));
}

function openLeaderboardOverlay() {
  openLandingOverlay('Leaderboard', (c) => renderLeaderboard(c), destroyLeaderboard);
}

function openPlayersOverlay() {
  openLandingOverlay('Players', (c) => renderPlayers(c), destroyPlayers);
}

function openRankingSystemOverlay() {
  openLandingOverlay('Ranking System', async (c) => {
    const { renderRankingSystemOverlay } = await getRankingOverlay();
    return renderRankingSystemOverlay(c);
  });
}

async function openMatchHistoryOverlay() {
  openLandingOverlay('Match History', async (container) => {
    container.innerHTML = '<div class="loading-state"><span class="loading-spinner" aria-hidden="true"></span><strong>Loading match history…</strong></div>';
    try {
      const { isIndexedDBAvailable, listSaves } = await import('./play/persistence.js');
      if (!isIndexedDBAvailable()) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">⚙</span><strong>No local match history.</strong><p>Match saves require IndexedDB, which is not available in this browser.</p></div>';
        return;
      }
      const saves = await listSaves();
      if (!saves || saves.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">⚔</span><strong>No matches yet.</strong><p>Play your first duel to start building match history.</p></div>';
        return;
      }
      container.innerHTML = `<div class="match-history-meta">${saves.length} saved match${saves.length > 1 ? 'es' : ''}</div><div class="match-history-list">${saves.map(s => {
        const sum = s.summary;
        const mode = sum?.mode ?? (s.mode ? String(s.mode).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Local vs AI');
        const turn = sum?.turn ? `Turn ${sum.turn}` : (s.stableBoundary?.turn ? `Turn ${s.stableBoundary.turn}` : '');
        const score = (sum && typeof sum.humanScore === 'number') ? `${sum.humanScore}\u2013${sum.opponentScore}` : '';
        const opponent = sum?.opponentLabel ?? '';
        const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : '';
        const parts = [mode, turn, score, opponent].filter(Boolean);
        return `<button class="match-history-item" data-save-id="${esc(s.saveId)}">
          <div class="match-history-item-info">
            <strong>${esc(parts[0] ?? 'Match')}</strong>
            <small>${esc(parts.slice(1).join(' · '))}</small>
            <small class="match-history-item-date">${esc(updated)}</small>
          </div>
          <span class="match-history-item-action">Resume &rarr;</span>
        </button>`;
      }).join('')}</div>`;
      container.querySelectorAll('.match-history-item').forEach(item => {
        item.addEventListener('click', () => {
          const saveId = item.dataset.saveId;
          closeLandingOverlay();
          localStorage.setItem('intrilex:resume-save-id', saveId);
          location.hash = '#/play/match';
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="notice danger"><strong>Could not load match history.</strong><p>${esc(err.message ?? 'Unknown error')}</p></div>`;
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// PLAY MODULE — lazy-loaded
// ═══════════════════════════════════════════════════════════════
let _playModule = null;
let _boardCssLoaded = false;
// IRX-C12: Route lifecycle tracking — previous route for cleanup on navigation
let _previousRoute = null;
/**
 * Render a play route by lazy-loading the play module and delegating to it.
 * Loads base play CSS on first call, ranked-duel CSS only for match routes.
 * @param {string} r - Play route path (e.g. '/play', '/play/match', '/play/online')
 */
async function renderPlayMode(r) {
  if (!landingContainer) return;
  if (!_playModule) {
    _playModule = await import('./play/play-app.js');
    // Load base play CSS (tokens, hub, setup, network lobby, terminal) — needed for all play routes
    if (!document.querySelector('link[data-play-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'play/play-v3.css';
      link.dataset.playCss = '1';
      document.head.appendChild(link);
    }
  }
  // Load ranked-duel.css (competitive board layout) only for match routes
  // This defers ~88KB of CSS until the user actually enters a match
  if ((r === '/play/match' || r === '/play/online/match') && !_boardCssLoaded) {
    _boardCssLoaded = true;
    const rdLink = document.createElement('link');
    rdLink.rel = 'stylesheet';
    rdLink.href = 'play/ranked-duel.css?v=' + LAB_VERSION;
    rdLink.dataset.playCss = '1';
    document.head.appendChild(rdLink);
    // Gameplay skin system (Light/Dark/CosmoTech/Corrupture) — loaded
    // alongside the board CSS so the first paint already carries the
    // correct skin. Must load AFTER ranked-duel.css for override specificity.
    const skinLink = document.createElement('link');
    skinLink.rel = 'stylesheet';
    skinLink.href = 'play/gameplay-skins.css?v=' + LAB_VERSION;
    skinLink.dataset.playCss = '1';
    document.head.appendChild(skinLink);
  }
  landingContainer.innerHTML = '<div id="play-root" class="play-root" tabindex="-1"></div>';
  const playRoot = landingContainer.querySelector('#play-root');
  const safeHandle = withErrorBoundary(_playModule.handlePlayRoute, playRoot, `play route ${r}`);
  await safeHandle(r, playRoot);
}

// ═══════════════════════════════════════════════════════════════
// LANDING PAGE — Player-first home screen (v0.24.2 redesign)
// Play dominant · Learn secondary · Rules available · Lab hidden
// ═══════════════════════════════════════════════════════════════
let _landingSelectedMode = 'local';
// AbortController for the current landing page's document-level listeners.
// Aborted on each re-render to prevent listener accumulation (IRX-M41).
let _landingListenerAbort = null;

/**
 * Render the player-first landing page (v0.24.2 redesign).
 * Layout: Play dominant, Learn secondary, Rules available, Lab hidden.
 * Includes mode selector (local/online), account dropdown, and overlay triggers.
 * Binds all landing-page event listeners (mode cards, account menu, overlays).
 */
function renderLanding() {
  _landingSelectedMode = 'local';
  landingContainer.innerHTML = `<div class="landing-app">
    <video class="landing-video-bg" autoplay muted loop playsinline preload="metadata" aria-hidden="true" data-mobile-skip>
      <source src="assets/landing1.mp4" type="video/mp4" />
    </video>
    <div class="landing-video-overlay" aria-hidden="true"></div>
    <div class="landing-aurora" aria-hidden="true"></div>
    <div class="landing-grid-bg" aria-hidden="true"></div>
    <div class="landing-orbital" aria-hidden="true"></div>
    <a class="skip skip-link" href="#landing-main">Skip to content</a>
    <header class="landing-topbar">
      <a class="landing-brand" href="#/" aria-label="Intrilex home">
        <img src="assets/intrilex-name.png" alt="INTRILEX" class="landing-brand-logo" />
        <small class="landing-brand-sub">TACTICAL PLAYING CARD GAME</small>
      </a>
      <nav class="landing-utility-nav" aria-label="Utility navigation">
        <div id="landing-continue-slot" aria-live="polite"></div>
        <a href="#/sim" class="lab-button" aria-label="Open Simulation Lab">
          <svg class="lab-button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 3h6M10 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9.5V3"/>
            <circle cx="12" cy="15" r="1.5"/>
            <path d="M9.5 15.5l2-1M14.5 15.5l-2-1" opacity=".6"/>
          </svg>
          <span class="lab-button-label">Lab</span>
          <svg class="lab-button-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 3l5 5-5 5"/>
          </svg>
        </a>
        <div class="account-menu" data-account-menu>
          <button class="account-trigger" data-account-trigger aria-label="Account menu" aria-expanded="false" aria-haspopup="menu">
            <span class="account-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
              </svg>
            </span>
            <span class="account-name">Guest</span>
            <svg class="account-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 5l5 5 5-5"/>
            </svg>
          </button>
          <div class="account-dropdown" data-account-dropdown role="menu" aria-label="Account">
            <div class="account-dropdown-header">
              <span class="account-dropdown-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
                </svg>
              </span>
              <div class="account-dropdown-id">
                <strong>Guest Player</strong>
                <small>Not signed in</small>
              </div>
            </div>
            <div class="account-dropdown-divider"></div>
            <a class="account-dropdown-item" href="#/profile" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
              <span>Profile</span>
            </a>
            <a class="account-dropdown-item" href="#/history" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span>Match History</span>
            </a>
            <a class="account-dropdown-item" href="#/achievements" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>
              <span>Achievements</span>
            </a>
            <a class="account-dropdown-item" href="#/settings" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Settings</span>
            </a>
            <div class="account-dropdown-divider"></div>
            <a class="account-dropdown-item sign-in" href="#/auth" role="menuitem" data-account-signin>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>
              <span>Sign In</span>
            </a>
          </div>
        </div>
      </nav>
    </header>
    <main id="landing-main" class="landing-hero" tabindex="-1">
      <div class="landing-content">
        <section class="landing-play-panel landing-card play" aria-labelledby="play-heading">
          <div class="landing-play-crest" aria-hidden="true"><img src="assets/intrilex-crest.png" alt="" /></div>
          <div class="landing-play-content">
            <p class="landing-eyebrow">BUILD &middot; COUNTER &middot; OUTTHINK &middot; WIN</p>
            <h1 class="landing-title" id="play-heading">PLAY NOW</h1>
            <p class="landing-tagline">A tactical card game of public score, disruption, and perfectly timed commitment.</p>
            <div class="landing-mode-section">
              <p class="landing-mode-label" id="mode-label">CHOOSE MODE</p>
              <div class="landing-mode-grid" role="radiogroup" aria-labelledby="mode-label">
                <button class="landing-mode-tile selected" role="radio" aria-checked="true" data-mode="local" data-href="#/play/new">
                  <span class="landing-mode-icon" aria-hidden="true">&#128100;</span>
                  <span class="landing-mode-body"><strong>Local vs AI</strong><small>Solo practice against adaptive AI</small></span>
                  <span class="landing-mode-check" aria-hidden="true">&#10003;</span>
                </button>
                <button class="landing-mode-tile" role="radio" aria-checked="false" data-mode="online" data-href="#/play/online">
                  <span class="landing-mode-icon" aria-hidden="true">&#127760;</span>
                  <span class="landing-mode-body"><strong>Online Duel</strong><small>Compete against players online</small></span>
                  <span class="landing-mode-check" aria-hidden="true">&#10003;</span>
                </button>
              </div>
            </div>
            <button class="landing-play-cta" data-testid="landing-cta" data-href="#/play/new">
              <span>START LOCAL DUEL</span><span class="landing-cta-arrow" aria-hidden="true">&rarr;</span>
            </button>
            <p class="landing-play-subline" data-mode-subline></p>
          </div>
        </section>
        <aside class="landing-secondary-rail" aria-label="Secondary navigation">
          <div class="landing-cards">
            <a class="landing-rail-card whats-new" href="#/release-notes">
              <span class="landing-rail-body">
                <strong>WHAT'S NEW</strong>
                <p>Homepage revamp &middot; zero-overflow layout &middot; visual polish</p>
                <span class="landing-rail-cta">v${LAB_VERSION} release details &rarr;</span>
              </span>
              <span class="landing-rail-emblem gold subtle" aria-hidden="true">&#10022;</span>
            </a>
            <a class="landing-rail-card rules landing-card rules" href="#/rules">
              <span class="landing-rail-body">
                <strong>&sect; Rules</strong>
                <p>Read the complete official rulebook.</p>
              </span>
              <span class="landing-rail-chevron" aria-hidden="true">&rsaquo;</span>
            </a>
            <button class="landing-rail-card ranking-system" data-ranking-system-card data-testid="ranking-system-button">
              <span class="landing-rail-emblem ranking-system-emblem" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z"/>
                  <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>
                </svg>
              </span>
              <span class="landing-rail-body">
                <strong>Ranking System</strong>
                <p>How Intrilex Rating works &middot; the rank ladder &middot; how to climb</p>
                <span class="landing-rail-cta">How ranking works &rarr;</span>
              </span>
              <span class="landing-rail-chevron" aria-hidden="true">&rsaquo;</span>
            </button>
            <a class="landing-rail-card players" href="#/players" data-players-card data-testid="landing-players-card">
              <span class="landing-rail-body">
                <strong>PLAYERS</strong>
                <p>Find players &middot; search by name &middot; inspect profiles &amp; rankings</p>
                <span class="landing-rail-cta">Browse the directory &rarr;</span>
              </span>
              <span class="landing-rail-emblem players-emblem" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7"/>
                  <path d="M21 21l-4.3-4.3"/>
                </svg>
              </span>
            </a>
            <a class="landing-rail-card leaderboard" href="#/leaderboard" data-leaderboard-card>
              <span class="landing-rail-body">
                <strong>LEADERBOARD</strong>
                <p>Season ladder &middot; Top 100 &middot; Your rank &middot; Tier filter</p>
                <span class="landing-rail-cta">View standings &rarr;</span>
              </span>
              <span class="landing-rail-emblem leaderboard-emblem" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z"/>
                  <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>
                </svg>
              </span>
            </a>
            <a class="landing-rail-card forums" href="https://intrilex.discourse.group/" target="_blank" rel="noopener noreferrer">
              <span class="landing-rail-forums-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
              </span>
              <span class="landing-rail-body">
                <strong>Official Forums</strong>
                <p>Discuss strategy, report issues, and connect with players.</p>
              </span>
              <span class="landing-rail-chevron" aria-hidden="true">&rsaquo;</span>
            </a>
            <a class="landing-rail-card subreddit" href="https://reddit.com/r/intrilex" target="_blank" rel="noopener noreferrer">
              <span class="landing-rail-emblem reddit-emblem" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="34" height="34" role="presentation">
                  <circle cx="12" cy="12" r="12" fill="#FF4500"/>
                  <path fill="#fff" d="M19.9 12a1.6 1.6 0 0 0-2.7-1.1 7.9 7.9 0 0 0-4.3-1.4l.9-2.9 2.4.6a1.2 1.2 0 1 0 .1-.6l-2.8-.7a.3.3 0 0 0-.4.2l-1 3.4a7.9 7.9 0 0 0-4.3 1.4A1.6 1.6 0 1 0 6 13.4a3 3 0 0 0 0 .5c0 2.4 2.7 4.3 6 4.3s6-1.9 6-4.3a3 3 0 0 0 0-.5 1.6 1.6 0 0 0 1.9-1.4zM9.3 13a1.1 1.1 0 1 1 1.1 1.1A1.1 1.1 0 0 1 9.3 13zm6.1 2.9a4 4 0 0 1-2.6.8h-1.6a4 4 0 0 1-2.6-.8.3.3 0 0 1 .4-.4 3.4 3.4 0 0 0 2.2.6h1.6a3.4 3.4 0 0 0 2.2-.6.3.3 0 0 1 .4.4zm-.8-1.8A1.1 1.1 0 1 1 15.7 13a1.1 1.1 0 0 1-1.1 1.1z"/>
                </svg>
              </span>
              <span class="landing-rail-body">
                <strong>r/intrilex</strong>
                <p>Reddit community &middot; posts, polls, and discussion.</p>
              </span>
              <span class="landing-rail-chevron" aria-hidden="true">&rsaquo;</span>
            </a>
          </div>
        </aside>
      </div>
    </main>
    <footer class="landing-footer">
      <span class="landing-footer-brand"><img src="assets/intrilex-icon.png" alt="IX" class="landing-footer-crest" /> INTRILEX</span>
      <nav class="landing-footer-legal" aria-label="Legal">
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
      </nav>
      <a class="landing-footer-credit" href="https://deffy.me" target="_blank" rel="noopener noreferrer" aria-label="Created and Designed by Ðeffy Urz">
        <span class="landing-footer-credit-prefix">Created &amp; Designed by</span>
        <span class="landing-footer-credit-name">Ðeffy Urz</span>
      </a>
    </footer>
  </div>`;
  bindLandingEvents();
  loadContinueCard();
  const preAlphaScheduled = showPreAlphaOverlay();
  // If the pre-alpha notice was already acknowledged (skipped), show the
  // developer blog directly — otherwise it appears after the pre-alpha dismiss.
  if (!preAlphaScheduled) showDevBlogOverlay(2000);
  maybeSkipLandingVideo();
}

/**
 * Skip the 6MB landing background video on small screens, reduced-motion, or
 * metered connections. The video is decorative (aria-hidden) and the gradient
 * + aurora layers remain as a graceful fallback. Setting preload="none" and
 * removing the <source> stops the network fetch entirely on these clients.
 */
function maybeSkipLandingVideo() {
  const video = landingContainer.querySelector('.landing-video-bg[data-mobile-skip]');
  if (!video) return;
  const mq = window.matchMedia;
  // Skip the 6MB decorative video on tablets/phones (≤1024px), touch devices,
  // reduced-motion, or metered/slow connections. The gradient + aurora layers
  // remain as a graceful fallback.
  const small = mq && mq('(max-width: 1024px)').matches;
  const coarsePointer = mq && mq('(pointer: coarse)').matches;
  const reducedMotion = mq && mq('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && (navigator.connection.saveData || navigator.connection.effectiveType === 'slow-2g' || navigator.connection.effectiveType === '2g');
  if (small || coarsePointer || reducedMotion || saveData) {
    video.preload = 'none';
    video.pause();
    video.removeAttribute('autoplay');
    const source = video.querySelector('source');
    if (source) source.remove();
    video.load();
  }
}

let _preAlphaOverlayTimer = null;

/**
 * Show the pre-alpha announcement overlay (dismissable, shown once per session).
 * Returns true if the overlay was scheduled, false if it was skipped because
 * the user already acknowledged it within the 12-hour window.
 * @returns {boolean}
 */
function showPreAlphaOverlay() {
  if (_preAlphaOverlayTimer) { clearTimeout(_preAlphaOverlayTimer); _preAlphaOverlayTimer = null; }
  const existing = document.getElementById('prealpha-overlay');
  if (existing) existing.remove();

  // Only show the overlay once every 12 hours per browser.
  // The timestamp of the last acknowledgement is stored; if less than
  // 12 hours have passed, the overlay is skipped entirely.
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const lastAck = Number(localStorage.getItem('intrilex-prealpha-acknowledged-at') || 0);
  const acknowledged = lastAck > 0 && (Date.now() - lastAck) < TWELVE_HOURS_MS;
  if (acknowledged) return false; // still within the 12-hour window — skip overlay

  const firstTime = lastAck === 0;
  const waitSeconds = firstTime ? 5 : 2;

  _preAlphaOverlayTimer = setTimeout(() => {
    // Guard: if the user navigated away from the landing page during the
    // delay, skip showing the overlay — it would appear on the wrong route.
    if (!landingContainer.isConnected || landingContainer.style.display === 'none') return;
    const overlay = document.createElement('div');
    overlay.id = 'prealpha-overlay';
    overlay.className = 'prealpha-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'prealpha-title');
    overlay.innerHTML = `<div class="prealpha-card">
      <div class="prealpha-badge"><span class="prealpha-badge-dot" aria-hidden="true"></span>PRE-ALPHA</div>
      <h2 class="prealpha-title" id="prealpha-title">Early Pre-Alpha Preview</h2>
      <p class="prealpha-body">Intrilex is currently in an <strong>early pre-Alpha stage</strong> and is intended for <strong>preview purposes</strong> rather than full play. Mechanics, balance, and features are under <strong>active development</strong> and may change frequently. Thank you for exploring and sharing the journey.</p>
      <button class="prealpha-acknowledge" id="prealpha-acknowledge" disabled aria-disabled="true">
        <span class="prealpha-acknowledge-text">Please wait ${waitSeconds}s&hellip;</span>
      </button>
      <div class="prealpha-dev-stamp" aria-label="Last development date: August 15, 2026">
        <span class="prealpha-dev-stamp-line" aria-hidden="true"></span>
        <span class="prealpha-dev-stamp-content">
          <span class="prealpha-dev-stamp-dot" aria-hidden="true"></span>
          <span class="prealpha-dev-stamp-label">Last development</span>
          <time class="prealpha-dev-stamp-date" datetime="2026-08-15">Aug 15, 2026</time>
        </span>
        <span class="prealpha-dev-stamp-line" aria-hidden="true"></span>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('prealpha-overlay--visible'));

    const btn = overlay.querySelector('#prealpha-acknowledge');
    const btnText = overlay.querySelector('.prealpha-acknowledge-text');
    let remaining = waitSeconds;
    const countdown = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        btnText.textContent = `Please wait ${remaining}s\u2026`;
      } else {
        clearInterval(countdown);
        btn.disabled = false;
        btn.setAttribute('aria-disabled', 'false');
        btnText.textContent = 'I Understand \u2014 Continue';
      }
    }, 1000);

    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      localStorage.setItem('intrilex-prealpha-acknowledged-at', String(Date.now()));
      overlay.classList.remove('prealpha-overlay--visible');
      setTimeout(() => overlay.remove(), 400);
      // After dismissing the pre-alpha notice, surface the developer blog
      // ("You're Early. Quite Early." — a note from Deffy).
      showDevBlogOverlay(600);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !btn.disabled) btn.click();
    });
  }, 2000);
  return true;
}

let _devBlogOverlayTimer = null;

/**
 * Show the developer blog overlay — "You're Early. Quite Early.", a personal
 * note from Deffy, the creator of Intrilex. Shown once per browser: it appears
 * either right after the pre-alpha notice is acknowledged, or directly on
 * landing render if the pre-alpha notice was already acknowledged within its
 * 12-hour window. Dismissal is permanent (localStorage flag).
 * @param {number} [delay=2000] - ms to wait before showing the overlay.
 */
function showDevBlogOverlay(delay = 2000) {
  if (_devBlogOverlayTimer) { clearTimeout(_devBlogOverlayTimer); _devBlogOverlayTimer = null; }
  // Permanent flag — the blog is a one-time welcome message.
  if (localStorage.getItem('intrilex-devblog-acknowledged-at')) return;

  _devBlogOverlayTimer = setTimeout(() => {
    // Guard: if the user navigated away from the landing page during the
    // delay, skip showing the overlay — it would appear on the wrong route.
    if (!landingContainer.isConnected || landingContainer.style.display === 'none') return;
    const existing = document.getElementById('devblog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'devblog-overlay';
    overlay.className = 'devblog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'devblog-title');
    overlay.innerHTML = `<div class="devblog-card">
      <div class="devblog-progress" aria-hidden="true"><div class="devblog-progress-fill" id="devblog-progress-fill"></div></div>
      <button class="devblog-close" id="devblog-close" aria-label="Close note">&times;</button>
      <header class="devblog-header">
        <div class="devblog-monogram" aria-hidden="true">D</div>
        <div class="devblog-badge"><span class="devblog-badge-dot" aria-hidden="true"></span>FROM THE CREATOR</div>
        <h1 class="devblog-title" id="devblog-title">You&rsquo;re Early. Quite Early.</h1>
        <p class="devblog-subtitle">A note from <strong>Deffy</strong>, Creator of Intrilex</p>
      </header>
      <div class="devblog-audio" id="devblog-audio">
        <div class="devblog-audio-top">
          <div class="devblog-audio-label"><span class="devblog-audio-icon" aria-hidden="true">&#9835;</span>Listen to this note</div>
          <div class="devblog-voices" id="devblog-voices" role="tablist" aria-label="Choose a reader">
            <button class="devblog-voice devblog-voice--woman" data-voice="woman" data-src="assets/dev-note-woman.wav" data-duration="414.70" data-accent="--magenta" data-accent-rgb="238,108,183" role="tab" aria-selected="false">
              <span class="devblog-voice-name">Woman</span>
              <span class="devblog-voice-dur">6:55</span>
            </button>
            <button class="devblog-voice devblog-voice--streamer" data-voice="streamer" data-src="assets/dev-note-streamer.wav" data-duration="479.90" data-accent="--blue" data-accent-rgb="91,156,240" role="tab" aria-selected="false">
              <span class="devblog-voice-name">Male Streamer</span>
              <span class="devblog-voice-dur">8:00</span>
            </button>
            <button class="devblog-voice devblog-voice--ymzo" data-voice="ymzo" data-src="assets/dev-note-ymzo.wav" data-duration="609.13" data-accent="--violet" data-accent-rgb="167,139,250" role="tab" aria-selected="false">
              <span class="devblog-voice-name">Ymzo</span>
              <span class="devblog-voice-dur">10:09</span>
            </button>
            <button class="devblog-voice devblog-voice--developer devblog-voice--active" data-voice="developer" data-src="assets/dev-note.wav" data-duration="426.80" data-accent="--amber" data-accent-rgb="241,189,93" role="tab" aria-selected="true">
              <span class="devblog-voice-name">Developer</span>
              <span class="devblog-voice-dur">7:07</span>
            </button>
          </div>
        </div>
        <div class="devblog-audio-controls">
          <button class="devblog-audio-btn devblog-audio-skip" id="devblog-audio-back" aria-label="Skip back 10 seconds" title="Skip back 10s">&#9664;&#9664;</button>
          <button class="devblog-audio-btn devblog-audio-play" id="devblog-audio-play" aria-label="Play audio" title="Play">
            <span class="devblog-audio-play-icon" aria-hidden="true">&#9654;</span>
            <span class="devblog-audio-pause-icon" aria-hidden="true">&#10074;&#10074;</span>
          </button>
          <button class="devblog-audio-btn devblog-audio-skip" id="devblog-audio-fwd" aria-label="Skip forward 10 seconds" title="Skip forward 10s">&#9654;&#9654;</button>
          <div class="devblog-audio-time" id="devblog-audio-current">0:00</div>
          <div class="devblog-audio-seek-wrap">
            <input type="range" class="devblog-audio-seek" id="devblog-audio-seek" min="0" max="426.8" step="0.1" value="0" aria-label="Seek" />
            <div class="devblog-audio-seek-buffer" id="devblog-audio-buffer" aria-hidden="true"></div>
            <div class="devblog-audio-seek-progress" id="devblog-audio-seek-progress" aria-hidden="true"></div>
          </div>
          <div class="devblog-audio-time devblog-audio-duration" id="devblog-audio-duration">7:07</div>
          <div class="devblog-audio-vol-wrap">
            <button class="devblog-audio-btn devblog-audio-mute" id="devblog-audio-mute" aria-label="Mute" title="Mute">
              <span class="devblog-audio-vol-icon" aria-hidden="true">&#128266;</span>
              <span class="devblog-audio-mute-icon" aria-hidden="true">&#128263;</span>
            </button>
            <input type="range" class="devblog-audio-vol" id="devblog-audio-vol" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
          </div>
        </div>
        <audio id="devblog-audio-el" preload="metadata" src="assets/dev-note.wav"></audio>
      </div>
      <div class="devblog-content" id="devblog-content">
        <p class="devblog-lede">Hey.</p>
        <p>I&rsquo;m <strong>Deffy</strong>, the creator of Intrilex.</p>
        <p>And, uh&hellip;</p>
        <p class="devblog-pull"><strong>I see you.</strong></p>
        <p>More of you have been finding this site than I expected&mdash;especially considering I haven&rsquo;t exactly gone out of my way to announce that it&rsquo;s here yet.</p>
        <p>Which is exciting.</p>
        <p>And slightly terrifying.</p>
        <p>Because you&rsquo;ve caught Intrilex at a very specific moment:</p>
        <p class="devblog-pull"><strong>the arena exists, but I&rsquo;m still building the damn doors.</strong></p>
        <p>Right now, Intrilex is under extremely active development. The website is online, the rules are taking their proper form, and a large amount of the infrastructure underneath the game already exists&mdash;but the actual public gameplay experience is <strong>not reliable enough yet for me to call it playable.</strong></p>
        <p>I know.</p>
        <p>You find a competitive card game, hit <strong>Play</strong>, and naturally expect to be able to&hellip; y&rsquo;know&hellip;</p>
        <p class="devblog-pull"><strong>play the card game.</strong></p>
        <p>Fair.</p>
        <p>So rather than pretend otherwise, I want to tell you exactly what you&rsquo;ve stumbled into.</p>
        <hr class="devblog-rule" />
        <h2 class="devblog-heading">What <em>is</em> Intrilex?</h2>
        <p>At its foundation, Intrilex uses something almost absurdly familiar:</p>
        <p class="devblog-pull"><strong>a normal deck of playing cards.</strong></p>
        <p>No proprietary 300-card collection required. No booster packs. No rotating pile of cardboard you need to purchase before you can understand what is happening.</p>
        <p>Just the deck humanity already knows.</p>
        <p>And then Intrilex asks:</p>
        <p class="devblog-pull"><strong>How much game can we actually extract from it?</strong></p>
        <p>Cards aren&rsquo;t merely numbers you throw onto a pile.</p>
        <p>Ranks can carry distinct tactical functions. Cards can be played for <strong>Points or Effects</strong>. Actions can create responses. Responses can create counterplay. Persistent states can reshape future turns. Combinations reward planning. Timing matters. Resource management matters. Reading another player matters.</p>
        <p>The same card that looks useless in one position can become exactly what you needed several decisions later.</p>
        <p>The objective is understandable.</p>
        <p>The path toward mastering it is very much not.</p>
        <p>That&rsquo;s intentional.</p>
        <p>Intrilex is meant to live in that wonderful territory where you can learn how to play&hellip;</p>
        <p>&hellip;and then realize much later that you&rsquo;re only beginning to understand <strong>how to play well.</strong></p>
        <hr class="devblog-rule" />
        <h2 class="devblog-heading">This Didn&rsquo;t Appear Overnight</h2>
        <p>Intrilex isn&rsquo;t something I decided to generate over a weekend because card games looked interesting.</p>
        <p>This idea has been mutating, breaking, rebuilding, renaming itself, being reconsidered, and getting dragged forward by me for <strong>years</strong>.</p>
        <p>A frankly unreasonable amount of my creative life has ended up somewhere inside it.</p>
        <p>What you&rsquo;re seeing now is the point where a long-running private passion project is finally becoming an actual public system:</p>
        <p class="devblog-pull"><strong>rules, software, identity, competition, players, and eventually a living game around all of it.</strong></p>
        <p>And somehow&hellip;</p>
        <p>some of you found it <strong>while I&rsquo;m still putting the pieces together.</strong></p>
        <p>I wasn&rsquo;t quite prepared for that.</p>
        <p>But I&rsquo;m very glad you&rsquo;re here.</p>
        <hr class="devblog-rule" />
        <h2 class="devblog-heading">So When Can I Actually Play?</h2>
        <p>That is currently my priority.</p>
        <p>Not one of my priorities.</p>
        <p class="devblog-pull"><strong>The priority.</strong></p>
        <p>I&rsquo;ve temporarily pushed my other projects aside so I can focus on getting Intrilex&rsquo;s playable experience across the line.</p>
        <p>Could that take a few days?</p>
        <p>Yep.</p>
        <p>Could it take a week?</p>
        <p>Yep.</p>
        <p>Could I discover some horrible little networking goblin hiding underneath everything and need longer?</p>
        <p class="devblog-pull"><strong>Also yep.</strong></p>
        <p>I don&rsquo;t want to give you a fake countdown just because countdowns look good on websites.</p>
        <p>I want the first real public duels to demonstrate why I&rsquo;ve spent all this time building Intrilex in the first place.</p>
        <hr class="devblog-rule" />
        <h2 class="devblog-heading">What Happens After That?</h2>
        <p>First:</p>
        <h3 class="devblog-subheading"><strong>You duel someone.</strong></h3>
        <p>A real person.</p>
        <p>Two players sitting across the same strange little battlefield, working from the same ancient deck of cards and trying to outthink each other.</p>
        <p>That&rsquo;s the center of everything.</p>
        <p>Then the world around those matches begins growing.</p>
        <p>Player identities. Competition. Rankings. Rivalries. Social systems. Ways of finding the people you actually <em>want</em> to duel again.</p>
        <p>And I&rsquo;m already experimenting with ways Intrilex can become more than straightforward PvP&mdash;including ideas like <strong>Puzzle Mode</strong>, where specific game states become problems to solve rather than ordinary matches to win.</p>
        <p>There is an uncomfortable amount I want to build.</p>
        <p>The difference now is that it finally has somewhere to live.</p>
        <hr class="devblog-rule" />
        <h2 class="devblog-chapter">You Have One Advantage</h2>
        <p>Since you found Intrilex this early, you can do something future players won&rsquo;t be able to do:</p>
        <p class="devblog-pull"><strong>learn it before they arrive.</strong></p>
        <p>The <strong>Rules</strong> are currently the most complete part of the public experience.</p>
        <p>So go snoop.</p>
        <p>Study the ranks.</p>
        <p>Figure out the scoring system.</p>
        <p>Look at the Effects.</p>
        <p>Start noticing the interactions.</p>
        <p>Come up with something clever.</p>
        <p>Because once the doors actually open, I&rsquo;d much rather discover that the people who wandered in early spent this awkward construction period preparing to absolutely ruin somebody&rsquo;s first match.</p>
        <div class="devblog-cta-wrap">
          <button class="devblog-rules-cta" id="devblog-rules-cta">Explore the Rules <span aria-hidden="true">&rarr;</span></button>
        </div>
        <hr class="devblog-rule" />
        <h2 class="devblog-heading">One More Thing.</h2>
        <p>If you&rsquo;re here during the beginning, I want the game to remember that.</p>
        <p class="devblog-pull"><strong>Accounts created during Intrilex&rsquo;s first month will receive an exclusive early-user badge.</strong></p>
        <p>Nothing that gives you a gameplay advantage.</p>
        <p>Just proof that when Intrilex was still held together by ambition, debugging, and one increasingly sleep-deprived creator&hellip;</p>
        <p class="devblog-pull"><strong>you were already here.</strong></p>
        <p>And yes&mdash;</p>
        <p>for the moment, this really is mostly <strong>just me</strong> building it.</p>
        <p>So if you&rsquo;re looking around thinking:</p>
        <p class="devblog-quote"><em>&ldquo;Wait. One guy is trying to build all of this?&rdquo;</em></p>
        <p>Correct.</p>
        <p>I have questioned this arrangement as well.</p>
        <hr class="devblog-rule" />
        <p>Anyway.</p>
        <p class="devblog-pull"><strong>You&rsquo;re early. Quite early.</strong></p>
        <p>Earlier than I expected you to be, actually.</p>
        <p>I see you finding Intrilex.</p>
        <p>I&rsquo;m nervous that the game isn&rsquo;t ready for you yet.</p>
        <p>I&rsquo;m also more motivated than ever to make sure that when you come back&hellip;</p>
        <p class="devblog-pull"><strong>it is.</strong></p>
        <p>Take a look around.</p>
        <p>Read the Rules&hellip;.</p>
        <p>Get ahead while you still can.</p>
        <p>And check back soon.</p>
        <p>I&rsquo;m building.</p>
        <div class="devblog-signature">
          <p class="devblog-signoff">&mdash; <strong>Deffy</strong></p>
          <p class="devblog-signoff-role">Creator of Intrilex</p>
          <p class="devblog-pyah">PYAH.</p>
        </div>
      </div>
      <footer class="devblog-footer">
        <button class="devblog-dismiss" id="devblog-dismiss">Take me to the lab</button>
      </footer>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('devblog-overlay--visible'));

    const content = overlay.querySelector('#devblog-content');
    const progressFill = overlay.querySelector('#devblog-progress-fill');
    const closeBtn = overlay.querySelector('#devblog-close');
    const dismissBtn = overlay.querySelector('#devblog-dismiss');
    const rulesCta = overlay.querySelector('#devblog-rules-cta');

    /** Permanently dismiss the blog overlay (also pauses audio if playing). */
    const dismiss = () => {
      const ae = overlay.querySelector('#devblog-audio-el');
      if (ae) { try { ae.pause(); } catch { /* noop */ } }
      localStorage.setItem('intrilex-devblog-acknowledged-at', String(Date.now()));
      overlay.classList.remove('devblog-overlay--visible');
      setTimeout(() => overlay.remove(), 420);
    };

    closeBtn.addEventListener('click', dismiss);
    dismissBtn.addEventListener('click', dismiss);
    const rulesCtaHandler = () => { dismiss(); location.hash = '#/rules'; };
    rulesCta.addEventListener('click', rulesCtaHandler);

    // ── Audio player: play/pause, seek, volume, skip, karaoke highlighting ──
    const audioEl = overlay.querySelector('#devblog-audio-el');
    const playBtn = overlay.querySelector('#devblog-audio-play');
    const backBtn = overlay.querySelector('#devblog-audio-back');
    const fwdBtn = overlay.querySelector('#devblog-audio-fwd');
    const seekEl = overlay.querySelector('#devblog-audio-seek');
    const seekProgress = overlay.querySelector('#devblog-audio-seek-progress');
    const currentEl = overlay.querySelector('#devblog-audio-current');
    const durationEl = overlay.querySelector('#devblog-audio-duration');
    const volEl = overlay.querySelector('#devblog-audio-vol');
    const muteBtn = overlay.querySelector('#devblog-audio-mute');
    const audioSection = overlay.querySelector('#devblog-audio');
    // Set initial accent color for the default Developer voice (amber).
    // Variables are set on the overlay (root) so they cascade to both the
    // audio controls and the content highlight bar.
    overlay.style.setProperty('--devblog-accent', 'var(--amber)');
    overlay.style.setProperty('--devblog-accent-rgb', '241,189,93');

    /** Format seconds as M:SS. */
    const fmtTime = (s) => {
      if (!isFinite(s) || s < 0) s = 0;
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    };

    // ── Karaoke timing: load pre-computed alignment from silence detection ──
    // The timing data is generated by scripts/analyze-devblog-audio.mjs which
    // uses RMS silence detection + DP forced alignment to map each text line
    // to its actual time range in the audio. Falls back to proportional
    // character-count distribution if the JSON fails to load.
    // Include the h1 title ("You're Early. Quite Early.") as the first text
    // element — the audio reads the title before the body, so the timing
    // JSON's first entry corresponds to the title. Without this, every
    // highlight is off by one (visuals trail ahead of the audio at first).
    const titleEl = overlay.querySelector('#devblog-title');
    const textEls = [
      ...(titleEl ? [titleEl] : []),
      ...content.querySelectorAll('p, h2, h3, button.devblog-rules-cta'),
    ];
    let timingMap = [];
    let fallbackDur = 426.80; // default = Developer voice; updated when voice changes
    let timingData = null;   // parsed JSON: { [voiceId]: { timings: [...] } }
    let currentVoiceId = 'developer';

    /** Build timing map from pre-computed JSON data for the current voice. */
    const buildTimingMapFromJson = () => {
      if (!timingData || !timingData[currentVoiceId]) return false;
      const voiceData = timingData[currentVoiceId];
      const jsonTimings = voiceData.timings;
      // Filter to text entries only (skip hr), in order
      const textTimings = jsonTimings.filter(t => t.t === 'text');
      // Match each JSON text entry to a DOM element by order
      timingMap = [];
      const count = Math.min(textTimings.length, textEls.length);
      for (let i = 0; i < count; i++) {
        timingMap.push({
          el: textEls[i],
          start: textTimings[i].s,
          end: textTimings[i].e,
        });
      }
      return timingMap.length > 0;
    };

    /** Fallback: proportional distribution by character count. */
    const buildTimingMapFallback = () => {
      const dur = (audioEl.duration && isFinite(audioEl.duration)) ? audioEl.duration : fallbackDur;
      const totalChars = textEls.reduce((s, el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return s + text.length;
      }, 0);
      const charRate = totalChars > 0 ? dur / totalChars : 0;
      let t = 0;
      timingMap = textEls.map(el => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const segDur = text.length * charRate;
        const seg = { el, start: t, end: t + segDur };
        t += segDur;
        return seg;
      });
    };

    /** Build timing map — tries JSON first, falls back to proportional. */
    const buildTimingMap = () => {
      if (!buildTimingMapFromJson()) buildTimingMapFallback();
    };
    buildTimingMap();

    // Fetch the pre-computed timing JSON (generated by analyze-devblog-audio.mjs).
    // This uses actual silence detection + DP alignment for accurate highlighting.
    fetch('assets/devblog-timings.json')
      .then(r => r.json())
      .then(data => {
        timingData = data;
        buildTimingMap(); // rebuild with real data
      })
      .catch(() => { /* fallback to proportional distribution already in place */ });

    // ── Voice selector: switch between 4 readers (preserves position) ──
    const voiceBtns = [...overlay.querySelectorAll('.devblog-voice')];
    const seekBuffer = overlay.querySelector('#devblog-audio-buffer');
    let pendingSeekTime = null;
    let pendingPlay = false;

    /** Switch the audio source to a different reader's recording.
     *  Preserves the current reading position by mapping the active line
     *  index to the new voice's timing data. */
    const switchVoice = (btn, autoPlay) => {
      if (btn.classList.contains('devblog-voice--active')) return; // already active
      const wasPlaying = !audioEl.paused;
      const newSrc = btn.dataset.src;
      const newDur = Number(btn.dataset.duration) || fallbackDur;
      const oldDur = audioEl.duration || fallbackDur;
      const oldTime = audioEl.currentTime;

      // Find current line index from the timing map
      let lineIndex = 0;
      for (let i = 0; i < timingMap.length; i++) {
        if (oldTime >= timingMap[i].start && oldTime < timingMap[i].end) {
          lineIndex = i;
          break;
        }
        if (oldTime >= timingMap[i].end) lineIndex = i;
      }

      // Update active state + theme on all voice buttons
      voiceBtns.forEach(b => {
        b.classList.remove('devblog-voice--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('devblog-voice--active');
      btn.setAttribute('aria-selected', 'true');

      // Apply the voice's accent color to the overlay for dynamic theming
      // (cascades to audio controls + content highlight bar)
      const accentVar = btn.dataset.accent || '--amber';
      overlay.style.setProperty('--devblog-accent', `var(${accentVar})`);
      overlay.style.setProperty('--devblog-accent-rgb', btn.dataset.accentRgb || '241,189,93');

      // Swap the audio source
      audioEl.src = newSrc;
      fallbackDur = newDur;
      currentVoiceId = btn.dataset.voice || 'developer';

      // Rebuild the karaoke timing map for the new voice
      buildTimingMap();

      // Find the start time of the same line in the new voice's timing
      let seekToTime = 0;
      if (lineIndex >= 0 && lineIndex < timingMap.length) {
        seekToTime = timingMap[lineIndex].start;
      } else if (oldDur > 0) {
        // Fallback: proportional position
        seekToTime = (oldTime / oldDur) * newDur;
      }

      // Update UI to reflect the new position immediately
      seekEl.max = String(newDur);
      seekEl.value = String(seekToTime);
      currentEl.textContent = fmtTime(seekToTime);
      durationEl.textContent = fmtTime(newDur);
      seekProgress.style.width = `${(seekToTime / newDur) * 100}%`;
      if (seekBuffer) seekBuffer.style.width = '0%';

      // Update highlight for the new position
      if (activeHighlight) { activeHighlight.classList.remove('devblog-line-active'); activeHighlight = null; }
      updateHighlight(seekToTime);

      // Load the new audio, then seek + play once metadata is ready
      pendingSeekTime = seekToTime;
      pendingPlay = autoPlay || wasPlaying;
      audioEl.load();
    };
    voiceBtns.forEach(btn => {
      btn.addEventListener('click', () => switchVoice(btn, false));
    });

    let activeHighlight = null;
    /** Highlight the text element currently being read and auto-scroll to it. */
    const updateHighlight = (time) => {
      let found = null;
      for (const seg of timingMap) {
        if (time >= seg.start && time < seg.end) { found = seg.el; break; }
        if (time >= seg.end) found = seg.el; // keep last as fallback
      }
      if (found !== activeHighlight) {
        if (activeHighlight) activeHighlight.classList.remove('devblog-line-active');
        activeHighlight = found;
        if (found) {
          found.classList.add('devblog-line-active');
          // Auto-scroll the highlighted line into view within the content area.
          // The h1 title lives in the header (outside #devblog-content), so
          // when it's highlighted, scroll the content to the very top.
          if (found === titleEl) {
            content.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            const elTop = found.offsetTop;
            const elBottom = elTop + found.offsetHeight;
            const viewTop = content.scrollTop;
            const viewBottom = viewTop + content.clientHeight;
            if (elTop < viewTop + 60 || elBottom > viewBottom - 60) {
              content.scrollTo({ top: Math.max(0, elTop - content.clientHeight * 0.35), behavior: 'smooth' });
            }
          }
        }
      }
    };

    // ── Play / Pause ──
    const setPlaying = (playing) => {
      playBtn.classList.toggle('devblog-audio-playing', playing);
      playBtn.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
      playBtn.title = playing ? 'Pause' : 'Play';
    };
    playBtn.addEventListener('click', () => {
      if (audioEl.paused) audioEl.play().catch(() => {});
      else audioEl.pause();
    });
    audioEl.addEventListener('play', () => setPlaying(true));
    audioEl.addEventListener('pause', () => setPlaying(false));
    audioEl.addEventListener('ended', () => setPlaying(false));

    // ── Skip back / forward 10s ──
    backBtn.addEventListener('click', () => { audioEl.currentTime = Math.max(0, audioEl.currentTime - 10); });
    fwdBtn.addEventListener('click', () => { audioEl.currentTime = Math.min(audioEl.duration || fallbackDur, audioEl.currentTime + 10); });

    // ── Seek bar ──
    seekEl.addEventListener('input', () => {
      audioEl.currentTime = Number(seekEl.value);
      updateHighlight(Number(seekEl.value));
    });

    // ── Volume + Mute ──
    volEl.addEventListener('input', () => {
      audioEl.volume = Number(volEl.value);
      audioEl.muted = audioEl.volume === 0;
      muteBtn.classList.toggle('devblog-audio-muted', audioEl.muted);
    });
    muteBtn.addEventListener('click', () => {
      audioEl.muted = !audioEl.muted;
      muteBtn.classList.toggle('devblog-audio-muted', audioEl.muted);
      if (!audioEl.muted && audioEl.volume === 0) {
        audioEl.volume = 0.5;
        volEl.value = '0.5';
      }
    });

    // ── Time updates ──
    audioEl.addEventListener('loadedmetadata', () => {
      const dur = audioEl.duration;
      if (isFinite(dur)) {
        seekEl.max = String(dur);
        durationEl.textContent = fmtTime(dur);
        buildTimingMap();
      }
      // Apply pending seek from a voice switch (preserves reading position)
      if (pendingSeekTime != null) {
        audioEl.currentTime = pendingSeekTime;
        updateHighlight(pendingSeekTime);
        pendingSeekTime = null;
      }
      if (pendingPlay) {
        audioEl.play().catch(() => {});
        pendingPlay = false;
      }
    });
    audioEl.addEventListener('timeupdate', () => {
      const t = audioEl.currentTime;
      const dur = audioEl.duration || fallbackDur;
      seekEl.value = String(t);
      currentEl.textContent = fmtTime(t);
      const pct = (t / dur) * 100;
      seekProgress.style.width = `${pct}%`;
      updateHighlight(t);
    });
    audioEl.addEventListener('progress', () => {
      // Update buffered indicator if ranges are available
      if (audioEl.buffered.length > 0) {
        const buffered = audioEl.buffered.end(audioEl.buffered.length - 1);
        const dur = audioEl.duration || fallbackDur;
        const bufPct = (buffered / dur) * 100;
        const bufEl = overlay.querySelector('#devblog-audio-buffer');
        if (bufEl) bufEl.style.width = `${bufPct}%`;
      }
    });
    audioEl.addEventListener('error', () => {
      audioSection.classList.add('devblog-audio-error');
      const label = overlay.querySelector('.devblog-audio-label');
      if (label) label.textContent = 'Audio unavailable — read the note below.';
    });

    // Audio pause on dismiss is handled inside the dismiss() function itself.

    // Update the scroll-progress bar as the user reads.
    const updateProgress = () => {
      const max = content.scrollHeight - content.clientHeight;
      const ratio = max > 0 ? Math.min(1, content.scrollTop / max) : 1;
      progressFill.style.transform = `scaleX(${ratio})`;
    };
    content.addEventListener('scroll', updateProgress, { passive: true });
    requestAnimationFrame(updateProgress);

    // Click on the backdrop (outside the card) dismisses the overlay.
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });

    // ESC dismisses the overlay. Space toggles play/pause. Arrows seek.
    const onKey = (e) => {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
      else if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        if (audioEl.paused) audioEl.play().catch(() => {}); else audioEl.pause();
      }
      else if (e.key === 'ArrowLeft' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
      }
      else if (e.key === 'ArrowRight' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        audioEl.currentTime = Math.min(audioEl.duration || fallbackDur, audioEl.currentTime + 5);
      }
    };
    document.addEventListener('keydown', onKey);

    // Focus the dismiss button for keyboard users, then scroll content to top.
    dismissBtn.focus({ preventScroll: true });
    content.scrollTop = 0;
  }, delay);
}

/**
 * Wire up mode-tile selection and primary CTA on the landing page.
 */
function bindLandingEvents() {
  // Abort any document-level listeners from a previous landing render to
  // prevent accumulation (each re-render would otherwise add a new
  // document click listener that is never removed).
  if (_landingListenerAbort) _landingListenerAbort.abort();
  _landingListenerAbort = new AbortController();
  const { signal } = _landingListenerAbort;

  const tiles = [...landingContainer.querySelectorAll('.landing-mode-tile')];
  const cta = landingContainer.querySelector('.landing-play-cta');
  if (!tiles.length || !cta) return;
  const selectTile = (tile) => {
    tiles.forEach(t => { t.classList.remove('selected'); t.setAttribute('aria-checked', 'false'); });
    tile.classList.add('selected');
    tile.setAttribute('aria-checked', 'true');
    _landingSelectedMode = tile.dataset.mode || 'local';
    cta.dataset.href = tile.dataset.href || '#/play/new';
    const label = cta.querySelector('span:first-child');
    if (label) {
      const modeLabels = { local: 'START LOCAL DUEL', online: 'START ONLINE DUEL' };
      label.textContent = modeLabels[_landingSelectedMode] || 'START DUEL';
    }
    const subline = landingContainer.querySelector('[data-mode-subline]');
    if (subline) {
      const sublines = {
        local: 'Fast matches. Adaptive AI. Deterministic outcomes.',
        online: 'Server-authoritative. Real opponents. Verified replays.',
      };
      subline.textContent = sublines[_landingSelectedMode] || '';
    }
  };
  tiles.forEach(tile => {
    tile.addEventListener('click', () => selectTile(tile));
    // Arrow-key navigation within the radiogroup
    tile.addEventListener('keydown', (e) => {
      const i = tiles.indexOf(tile);
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tiles.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tiles.length) % tiles.length;
      if (next >= 0) { e.preventDefault(); tiles[next].focus(); selectTile(tiles[next]); }
    });
  });
  cta.addEventListener('click', () => {
    location.hash = cta.dataset.href || '#/play/new';
  });

  // ── Account dropdown menu ──
  const accountTrigger = landingContainer.querySelector('[data-account-trigger]');
  const accountDropdown = landingContainer.querySelector('[data-account-dropdown]');
  const accountMenu = landingContainer.querySelector('[data-account-menu]');
  if (accountTrigger && accountDropdown && accountMenu) {
    const toggleMenu = (open) => {
      const isOpen = open ?? !accountMenu.classList.contains('open');
      accountMenu.classList.toggle('open', isOpen);
      accountTrigger.setAttribute('aria-expanded', String(isOpen));
    };
    accountTrigger.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    // Close on outside click (signal-scoped to prevent listener accumulation)
    document.addEventListener('click', (e) => {
      if (!accountMenu.contains(e.target)) toggleMenu(false);
    }, { signal });
    // Close on Escape
    accountMenu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { toggleMenu(false); accountTrigger.focus(); }
    });
    // Close after clicking a menu item and intercept account routes → overlays
    accountDropdown.querySelectorAll('.account-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu(false);
        // The sign-in/sign-out link is dual-purpose: when signed out it opens
        // the auth overlay; when signed in it signs the user out directly.
        if (item.hasAttribute('data-account-signin')) {
          // IRX-M32: Auth module is lazy-loaded. Check cached state synchronously
          // via the module ref if already loaded; otherwise open the auth overlay.
          const authMod = getAuthController.cached;
          if (authMod && (authMod.getAuthState() === 'AUTHENTICATED' || authMod.getAuthState() === 'ANONYMOUS')) {
            authMod.signOut().then((ok) => {
              if (ok) showToast('Signed out', { type: 'info' });
              else showToast('Sign-out failed', { type: 'error' });
            }).catch(() => showToast('Sign-out failed', { type: 'error' }));
          } else {
            openAuthOverlay();
          }
          return;
        }
        const href = item.getAttribute('href') || '';
        if (href === '#/profile') { openProfileOverlay(); }
        else if (href === '#/history') { openMatchHistoryOverlay(); }
        else if (href === '#/achievements') { openAchievementsOverlay(); }
        else if (href === '#/settings') { openSettingsOverlay(); }
        else if (href === '#/auth') { openAuthOverlay(); }
      });
    });
  }

  // ── WHAT'S NEW card → overlay ──
  const whatsNewLink = landingContainer.querySelector('.landing-rail-card.whats-new');
  if (whatsNewLink) {
    whatsNewLink.addEventListener('click', (e) => {
      e.preventDefault();
      openReleaseNotesOverlay();
    });
  }

  // ── LEADERBOARD card → overlay ──
  const leaderboardLink = landingContainer.querySelector('[data-leaderboard-card]');
  if (leaderboardLink) {
    leaderboardLink.addEventListener('click', (e) => {
      e.preventDefault();
      openLeaderboardOverlay();
    });
  }

  // ── PLAYERS card → overlay ──
  const playersLink = landingContainer.querySelector('[data-players-card]');
  if (playersLink) {
    playersLink.addEventListener('click', (e) => {
      e.preventDefault();
      openPlayersOverlay();
    });
  }

  // ── RANKING SYSTEM card → overlay ──
  const rankingSystemBtn = landingContainer.querySelector('[data-ranking-system-card]');
  if (rankingSystemBtn) {
    rankingSystemBtn.addEventListener('click', () => {
      openRankingSystemOverlay();
    });
  }
}

/**
 * Async-load saved match state and insert a Continue Duel card if one exists.
 * Renders nothing if IndexedDB is unavailable or no saves are found.
 */
async function loadContinueCard() {
  const slot = landingContainer.querySelector('#landing-continue-slot');
  if (!slot) return;
  try {
    const { isIndexedDBAvailable, listSaves } = await import('./play/persistence.js');
    if (!isIndexedDBAvailable()) return;
    const saves = await listSaves();
    // Guard: user may have navigated away during the async import/listSaves.
    // If the slot is no longer in the DOM, skip rendering to avoid writing
    // to a detached node (IRX-M42).
    if (!slot.isConnected) return;
    if (!saves || saves.length === 0) return;
    const save = saves.find(s => s.stableBoundary?.decisionFrameHash) ?? saves[0];
    if (!save) return;
    // Build rich metadata from the save summary (v2 envelope) or fall back to basics
    const sum = save.summary;
    const mode = sum?.mode ?? (save.mode ? String(save.mode).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Local vs AI');
    const turn = sum?.turn ? `Turn ${sum.turn}` : (save.stableBoundary?.turn ? `Turn ${save.stableBoundary.turn}` : '');
    const score = (sum && typeof sum.humanScore === 'number') ? `${sum.humanScore}\u2013${sum.opponentScore}` : '';
    const parts = [turn, score].filter(Boolean);
    const meta = parts.join(' &middot; ');
    slot.innerHTML = `<button class="landing-continue-btn" data-save-id="${esc(save.saveId)}" aria-label="Continue duel${meta ? ': ' + meta.replace(/&middot;/g, '·') : ''}">
      <svg class="landing-continue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/></svg>
      <span class="landing-continue-label">CONTINUE DUEL</span>
      ${meta ? `<span class="landing-continue-meta">${meta}</span>` : ''}
    </button>`;
    const continueBtn = slot.querySelector('.landing-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        const saveId = continueBtn.dataset.saveId;
        if (!saveId) return;
        // Hand off the saveId to the play hub, which restores via continueMatch
        try { sessionStorage.setItem('intrilex-continue-save', saveId); } catch { /* unavailable */ }
        location.hash = '#/play/match';
      });
    }
  } catch { /* persistence unavailable — silently omit Continue card */ }
}

// ═══════════════════════════════════════════════════════════════
// W.I.P. CINEMATIC LANDING PAGE — Coming Soon & Development Hub
// ═══════════════════════════════════════════════════════════════
let _wipLandingListenerAbort = null;

/**
 * Render the cinematic "Coming Soon" W.I.P. landing page.
 * Homepage (#/) displaying the under-construction / coming-soon state with
 * newsletter capture, feature previews, and links to the Developer Preview (#/dev).
 */
function renderWipLanding() {
  landingContainer.innerHTML = `<div class="landing-app wip-landing">
    <video class="landing-video-bg" autoplay muted loop playsinline preload="metadata" aria-hidden="true" data-mobile-skip>
      <source src="assets/landing1.mp4" type="video/mp4" />
    </video>
    <div class="landing-video-overlay" aria-hidden="true"></div>
    <div class="landing-aurora" aria-hidden="true"></div>
    <div class="landing-grid-bg" aria-hidden="true"></div>
    <div class="landing-orbital" aria-hidden="true"></div>
    <a class="skip skip-link" href="#wip-main">Skip to content</a>
    <header class="landing-topbar wip-topbar">
      <a class="landing-brand wip-brand" href="#/" aria-label="Intrilex home">
        <img src="assets/intrilex-name.png" alt="INTRILEX" class="landing-brand-logo wip-topbar-logo" />
        <small class="landing-brand-sub">TACTICAL PLAYING CARD GAME</small>
      </a>
      <nav class="wip-topbar-nav" aria-label="Preview navigation">
        <a href="#/rules" class="wip-topbar-rules-link" aria-label="Rulebook">
          <span aria-hidden="true">&sect;</span>
          <span>Rulebook</span>
        </a>
        <a href="#/dev" class="wip-dev-preview-btn" aria-label="Open Developer Preview">
          <span class="wip-dev-preview-dot" aria-hidden="true"></span>
          <span>Developer Preview</span>
          <svg class="wip-dev-preview-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 3l5 5-5 5"/>
          </svg>
        </a>
      </nav>
    </header>
    <main id="wip-main" class="wip-hero" tabindex="-1">
      <div class="wip-hero-inner">
        <div class="wip-coming-soon">
          <span class="wip-coming-soon-dot" aria-hidden="true"></span>
          <span class="wip-coming-soon-text">COMING SOON</span>
        </div>
        <div class="wip-logo-container">
          <img src="assets/intrilex-name.png" alt="INTRILEX" class="wip-logo" />
        </div>
        <p class="wip-tagline">
          A tactical competitive playing card game of public score, disruption, and exactly-when spending.
        </p>
        <div class="wip-notice" role="status">
          <div class="wip-notice-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <div class="wip-notice-content">
            <strong class="wip-notice-heading">Under Active Development</strong>
            <p class="wip-notice-text">
              Intrilex is under active development. The game is not yet playable. Follow along as we build.
            </p>
          </div>
        </div>
        <div class="wip-features" role="list" aria-label="Key Features">
          <div class="wip-feature-pill" role="listitem">
            <span class="wip-feature-icon" aria-hidden="true">⚔</span>
            <span class="wip-feature-label">Tactical Card Duels</span>
          </div>
          <div class="wip-feature-pill" role="listitem">
            <span class="wip-feature-icon" aria-hidden="true">★</span>
            <span class="wip-feature-label">Ranked Online Play</span>
          </div>
          <div class="wip-feature-pill" role="listitem">
            <span class="wip-feature-icon" aria-hidden="true">🤖</span>
            <span class="wip-feature-label">AI Opponents</span>
          </div>
          <div class="wip-feature-pill" role="listitem">
            <span class="wip-feature-icon" aria-hidden="true">📊</span>
            <span class="wip-feature-label">Match Replay &amp; Analysis</span>
          </div>
        </div>
        <div class="wip-newsletter" aria-labelledby="wip-newsletter-title">
          <h2 id="wip-newsletter-title" class="wip-newsletter-title">Stay Updated on Launch</h2>
          <p class="wip-newsletter-desc">Sign up to receive early playtest invites and major development updates.</p>
          <form class="wip-newsletter-form" id="wip-newsletter-form" novalidate>
            <div class="wip-newsletter-input-wrap">
              <svg class="wip-newsletter-mail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <input type="email" id="wip-newsletter-email" class="wip-newsletter-input" placeholder="Enter your email address…" aria-label="Email address for updates" required autocomplete="email" spellcheck="false" />
            </div>
            <button type="submit" class="wip-newsletter-btn" id="wip-newsletter-submit">
              <span>Notify Me</span>
              <svg class="wip-newsletter-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 3l5 5-5 5"/>
              </svg>
            </button>
          </form>
          <div class="wip-newsletter-feedback" id="wip-newsletter-feedback" aria-live="polite"></div>
        </div>
        <div class="wip-community" aria-label="Community Links">
          <a class="wip-community-btn rules" href="#/rules">
            <span class="wip-community-icon" aria-hidden="true">&sect;</span>
            <span class="wip-community-label">Official Rulebook</span>
          </a>
          <a class="wip-community-btn forums" href="https://intrilex.discourse.group/" target="_blank" rel="noopener noreferrer">
            <svg class="wip-community-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            <span class="wip-community-label">Official Forums</span>
          </a>
          <a class="wip-community-btn reddit" href="https://reddit.com/r/intrilex" target="_blank" rel="noopener noreferrer">
            <svg class="wip-community-icon reddit-emblem" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill="#FF4500"/>
              <path fill="#fff" d="M19.9 12a1.6 1.6 0 0 0-2.7-1.1 7.9 7.9 0 0 0-4.3-1.4l.9-2.9 2.4.6a1.2 1.2 0 1 0 .1-.6l-2.8-.7a.3.3 0 0 0-.4.2l-1 3.4a7.9 7.9 0 0 0-4.3 1.4A1.6 1.6 0 1 0 6 13.4a3 3 0 0 0 0 .5c0 2.4 2.7 4.3 6 4.3s6-1.9 6-4.3a3 3 0 0 0 0-.5 1.6 1.6 0 0 0 1.9-1.4zM9.3 13a1.1 1.1 0 1 1 1.1 1.1A1.1 1.1 0 0 1 9.3 13zm6.1 2.9a4 4 0 0 1-2.6.8h-1.6a4 4 0 0 1-2.6-.8.3.3 0 0 1 .4-.4 3.4 3.4 0 0 0 2.2.6h1.6a3.4 3.4 0 0 0 2.2-.6.3.3 0 0 1 .4.4zm-.8-1.8A1.1 1.1 0 1 1 15.7 13a1.1 1.1 0 0 1-1.1 1.1z"/>
            </svg>
            <span class="wip-community-label">r/intrilex</span>
          </a>
        </div>
      </div>
    </main>
    <footer class="landing-footer wip-footer">
      <span class="landing-footer-brand"><img src="assets/intrilex-icon.png" alt="IX" class="landing-footer-crest" /> INTRILEX</span>
      <nav class="landing-footer-legal" aria-label="Legal">
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
        <a href="#/dev">Developer Preview</a>
      </nav>
      <a class="landing-footer-credit" href="https://deffy.me" target="_blank" rel="noopener noreferrer" aria-label="Created and Designed by Ðeffy Urz">
        <span class="landing-footer-credit-prefix">Created &amp; Designed by</span>
        <span class="landing-footer-credit-name">Ðeffy Urz</span>
      </a>
    </footer>
  </div>`;
  bindWipLandingEvents();
  maybeSkipLandingVideo();
}

/**
 * Bind event handlers for the W.I.P. landing page.
 * Handles newsletter subscription with localStorage storage and toast confirmation.
 */
function bindWipLandingEvents() {
  if (_wipLandingListenerAbort) _wipLandingListenerAbort.abort();
  _wipLandingListenerAbort = new AbortController();

  const form = landingContainer.querySelector('#wip-newsletter-form');
  const input = landingContainer.querySelector('#wip-newsletter-email');
  const feedback = landingContainer.querySelector('#wip-newsletter-feedback');

  const savedEmail = localStorage.getItem('intrilex:newsletter-email');
  if (savedEmail && feedback) {
    feedback.innerHTML = `<span class="wip-newsletter-success">&check; You are subscribed (${esc(savedEmail)})</span>`;
  }

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input.value.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailPattern.test(email)) {
        showToast('Please enter a valid email address.', { type: 'warning' });
        if (feedback) {
          feedback.innerHTML = '<span class="wip-newsletter-error">Please enter a valid email address.</span>';
        }
        input.focus();
        return;
      }
      try {
        localStorage.setItem('intrilex:newsletter-email', email);
        const list = JSON.parse(localStorage.getItem('intrilex:newsletter-list') || '[]');
        if (!list.includes(email)) {
          list.push(email);
          localStorage.setItem('intrilex:newsletter-list', JSON.stringify(list));
        }
      } catch (err) {
        console.warn('[newsletter] failed to save to localStorage:', err);
      }
      showToast('Thank you for subscribing! We\'ll notify you when Intrilex launches.', { type: 'success' });
      input.value = '';
      if (feedback) {
        feedback.innerHTML = `<span class="wip-newsletter-success">&check; Thank you! We'll notify you at <strong>${esc(email)}</strong>.</span>`;
      }
    });
  }
}

/** Render the rules/rulebook page inside the landing container with a reading layout. */
function renderRules() {
  landingContainer.innerHTML = `<div class="landing-app rules-app">
    <a class="skip skip-link" href="#rules-main">Skip to content</a>
    <a class="back-button" href="#/" aria-label="Back to landing">← Back</a>
    <main id="rules-main" class="rules-main" tabindex="-1"></main>
  </div>`;
  renderRulesPage(landingContainer.querySelector('#rules-main'));
}

// ═══════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════
/** Render the global filter bar (cohort chips + clear button) in the shell footer. */
function renderFilters() {
  const chips = [];
  if (state.filters.profile !== 'all') chips.push(['Profile', state.filters.profile, () => state.filters.profile = 'all']);
  if (state.selectedMechanic) chips.push(['Mechanic', state.selectedMechanic, () => state.selectedMechanic = null]);
  if (state.selectedPolicy) chips.push(['Policy', state.selectedPolicy, () => state.selectedPolicy = null]);
  if (state.filters.evidence !== 'all') chips.push(['Evidence', state.filters.evidence, () => state.filters.evidence = 'all']);
  const filterBar = cachedFilterBar();
  if (!filterBar) return;
  filterBar.innerHTML = `<span class="eyebrow">COHORT</span>${chips.length ? `<span class="filter-count-badge" aria-label="${chips.length} active filters">${chips.length}</span>` : ''}${chips.length ? chips.map(([k, v], i) => `<span class="filter-chip"><b>${esc(k)}</b>${esc(v)}<button data-remove-filter="${i}" aria-label="Remove ${esc(k)} filter: ${esc(v)}">×</button></span>`).join('') : '<span class="footer-note">All compatible v' + RULES_VERSION + ' / Engine ' + ENGINE_VERSION + ' observations</span>'}<button id="clear-filters" class="ghost-button" ${chips.length ? '' : 'disabled'}>Clear</button>`;
  // Re-query after innerHTML replaces child nodes — these can't be cached
  filterBar.querySelectorAll('[data-remove-filter]').forEach(button => button.addEventListener('click', () => { chips[Number(button.dataset.removeFilter)][2](); render(); }));
  const clearBtn = filterBar.querySelector('#clear-filters');
  if (clearBtn) clearBtn.addEventListener('click', () => { state.selectedMechanic = null; state.selectedPolicy = null; state.filters = { profile: 'all', policy: 'all', outcome: 'all', evidence: 'all', search: '' }; render(); });
}

// ═══════════════════════════════════════════════════════════════
// WATCH WORKSPACE — playback engine (tightly coupled, stays inline)
// ═══════════════════════════════════════════════════════════════
function currentFrame() { return state.visibility === 'public' ? state.replay.frames[state.frame] : state.authorized?.frames[state.frame]; }
function currentState() { const frame = currentFrame(); if (!frame) return {}; if (state.visibility === 'public') return frame.state; if (state.visibility === 'player') return frame.playerViews?.[state.viewer] ?? {}; return frame.omniscientState ?? {}; }
/** Stop replay playback and clear the playback timer. */
export function stop() { state.playing = false; if (state.timer) clearInterval(state.timer); state.timer = null; }
/** Toggle replay playback (play/pause). Re-renders after state change. */
export function togglePlay() { if (state.playing) { stop(); render(); return; } state.playing = true; state.timer = setInterval(() => { if (state.frame >= state.replay.frames.length - 1) { stop(); render(); return; } stepTo(state.frame + 1); }, Math.max(65, 700 / state.speed)); render(); }
function stepTo(index) { state.frame = clamp(index, 0, state.replay.frames.length - 1); state.selectedTimelineIndex = null; triggerFxForFrame(); render(); }
function commandAt(index) { return state.replay.commands?.[Math.max(0, index - 1)] ?? null; }
function commandAction(command) { return command?.action ?? command?.payload?.action ?? null; }
function frameEventTypes(frame) { return (frame?.events ?? (frame?.eventTypes ?? []).map(type => ({ type }))).map(event => event.type); }
function semanticForCommand(command, frame) {
  const action = commandAction(command), kind = String(action?.kind ?? command?.type ?? '').toLowerCase(), semantic = action?.semantic, types = frameEventTypes(frame);
  if (types.some(type => /RESPONSE_WINDOW_CLOSED/.test(type))) return 'engine-orchestration-summary';
  if (semantic === 'AUTOMATIC_PRIORITY_ADVANCE' || types.some(type => /AUTOMATIC_PRIORITY_ADVANCE/.test(type))) return 'engine-orchestration';
  if (semantic === 'DECLINE_RESPONSE' || types.some(type => /RESPONSE_DECLINED/.test(type)) || kind.includes('pass-priority')) return 'response-decline';
  if (kind.includes('private-choice') || kind.includes('hidden_choice')) return 'private-choice';
  if (/counter|disrupt|instant|quick|interrupt/.test(kind)) return 'free-response-play';
  if (/phase|complete-turn|begin-/.test(kind)) return 'phase-transition';
  if (types.some(t => /TRIGGER|VOLTAGE/.test(t))) return 'trigger';
  return 'mini-turn-action';
}
function semanticLabel(command, frame) {
  const cls = semanticForCommand(command, frame), action = commandAction(command), types = frameEventTypes(frame);
  if (types.some(type => /RESPONSE_WINDOW_CLOSED/.test(type))) return 'Response window closed — no responses';
  if (cls === 'engine-orchestration') return 'Response priority advanced automatically';
  if (cls === 'response-decline') return `${command?.actorId ?? 'Player'} declined a legal response`;
  if (types.some(type => /EXHAUSTED_PASS/.test(type))) return `${command?.actorId ?? 'Player'} took the forced Exhausted Pass`;
  const key = String(action?.kind ?? command?.type ?? 'Initial state').replace(/^(core|autonomy)-/, '').replaceAll('-', ' ');
  return key.replace(/\b\w/g, c => c.toUpperCase());
}
function visibleTimeline() {
  const items = state.replay.frames.map((frame, index) => ({ index, frame, command: index ? state.replay.commands[index - 1] : null, class: semanticForCommand(index ? state.replay.commands[index - 1] : null, frame) }));
  return items.filter(item => state.showOrchestration || item.class !== 'engine-orchestration');
}
function triggerFxForFrame() { if (!state.fx || state.reducedMotion || state.reducedSensory) return; const types = frameEventTypes(state.replay.frames[state.frame]); let cls = ''; if (types.some(t => /ULTRA/.test(t))) cls = 'fx-ultra'; else if (types.some(t => /COUNTER/.test(t))) cls = 'fx-counter'; else if (types.some(t => /SCORE|GOAL/.test(t))) cls = 'fx-score'; else if (types.some(t => /REJECT|INVARIANT/.test(t))) cls = 'fx-error'; if (cls) { fxLayer.className = `fx-layer ${cls}`; setTimeout(() => fxLayer.className = 'fx-layer', 650); } }
function stopTransientFx() { if (!state.fx) fxLayer.className = 'fx-layer'; }
function cardPoint(card) { if (Number.isFinite(card?.state?.pointValue)) return card.state.pointValue; const rank = String(card?.identity ?? '').replace(/[♣♦♥♠]/gu, ''); return Number(rank) || ({ A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[rank] ?? 0); }
function secured(s, player) { return (player?.pr ?? []).reduce((sum, id) => { const c = s.cards?.[id]; return sum + (c?.state?.tapped ? 0 : cardPoint(c)); }, 0); }
function markerList(card) { return [card?.state?.tapped ? 'TAP' : '', card?.state?.aegis || card?.state?.aegisExpiresAt ? 'AEGIS' : '', card?.state?.providesGuard ? 'GUARD' : '', card?.state?.anchorValue !== undefined ? 'ANCHOR' : '', card?.state?.exileBound ? 'EXILE' : '', card?.state?.jackHostId ? 'ATTACH' : ''].filter(Boolean); }
function cardToken(s, id) {
  const card = s.cards?.[id] ?? {}, drawPileHidden = (card.zone === 'DP' || card.zone === 'dp') && state.visibility !== 'judge', hidden = drawPileHidden || !card.identity || card.identity === 'HIDDEN', identity = hidden ? '◆' : card.identity, markers = hidden ? [] : markerList(card), match = String(identity).match(/^(10|[A2-9JQK])([♣♦♥♠])$/u), rank = match?.[1] ?? identity, suit = match?.[2] ?? '', suitClass = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' }[suit] ?? 'neutral', red = /[♦♥]|RJ/.test(card.identity ?? '');
  return `<button class="card-token ${hidden ? 'hidden' : ''} ${red ? 'red' : ''} suit-${suitClass}" data-card="${esc(id)}" data-identity="${hidden ? 'HIDDEN' : esc(card.identity ?? 'HIDDEN')}" ${hidden ? 'data-private-label="Private card — not visible in this view"' : ''} aria-label="${hidden ? 'Hidden card, private — not visible in this view' : `Card ${card.identity}`}${markers.length ? `, ${markers.join(', ')}` : ''}"><b class="token-rank">${esc(rank)}</b>${suit ? `<span class="token-suit" aria-hidden="true">${esc(suit)}</span>` : ''}<small>${esc(hidden ? 'private' : id)}</small><span class="card-markers">${markers.map(x => `<span class="card-marker">${x}</span>`).join('')}</span></button>`;
}
function zone(s, title, ids = [], className = '') { return `<section class="zone ${className}"><h4>${esc(title)} · ${ids.length}</h4><div class="cards">${ids.length ? ids.map(id => cardToken(s, id)).join('') : '<span class="footer-note">Empty</span>'}</div></section>`; }
function playerBoard(s, player, id) {
  if (!player) return '';
  const points = secured(s, player);
  return `<div class="player-board"><div class="player-header"><span class="player-seat">${esc(id)}</span><span class="player-score">${points} pts · Goal ${player.goal ?? 0}</span></div><div class="player-zones">${zone(s, 'Point Row', player.pr ?? [], 'pr')}${zone(s, 'Effect Row', player.er ?? [], 'er')}${zone(s, 'Hand', player.hand ?? [], 'hand')}</div></div>`;
}
/**
 * Render the Watch workspace — replay playback with transport controls,
 * frame slider, board visualization, and timeline.
 * Shows an empty-state placeholder when no replay is loaded (IRX-H21).
 */
function renderWatch() {
  if (!state.replay || !state.replay.frames) {
    // IRX-H21: Render a minimal Watch workspace shell with a frame-slider
    // placeholder so the workspace is still functional even when replay
    // blobs are excluded from the build (~670MB savings).
    app.innerHTML = '<div class="watch-layout"><div class="watch-controls"><div class="transport" role="group" aria-label="Playback transport"><button id="step-prev" disabled title="Previous frame" aria-label="Previous frame">◀</button><button id="play-toggle" aria-label="Play">▶</button><button id="step-next" disabled title="Next frame" aria-label="Next frame">▶</button><button id="step-end" disabled title="Skip to end" aria-label="Skip to end">⏭</button></div><div class="progress"><input type="range" id="frame-slider" aria-label="Replay frame slider" min="0" max="0" value="0" disabled><span>0/0</span></div><div class="speed-control"><label>Speed<select id="play-speed" disabled><option value="1">1×</option></select></label></div><div class="current-action"><span class="action-label">No replay loaded</span></div></div><div class="watch-board"><div class="empty-state" style="grid-column:1/-1"><span class="empty-state-icon" aria-hidden="true">◈</span><strong>No replay loaded.</strong><p>Select a replay from the Replays workspace or run a campaign.</p><a class="primary-button empty-action" href="#/replays">Browse replays</a></div></div></div>';
    return;
  }
  const frame = currentFrame(), s = currentState(), timeline = visibleTimeline(), total = state.replay.frames.length - 1;
  const players = s.turnOrder ?? Object.keys(s.players ?? {});
  const currentCmd = commandAt(state.frame);
  const currentLabel = state.frame === 0 ? 'Initial state' : semanticLabel(currentCmd, frame);
  const currentClass = state.frame === 0 ? '' : semanticForCommand(currentCmd, frame);
  app.innerHTML = `<div class="watch-layout">
    <div class="watch-controls">
      <div class="transport" role="group" aria-label="Playback transport"><button id="step-prev" ${state.frame === 0 ? 'disabled' : ''} title="Previous frame" aria-label="Previous frame">◀</button><button id="play-toggle" aria-label="${state.playing ? 'Pause' : 'Play'}">${state.playing ? '⏸' : '▶'}</button><button id="step-next" ${state.frame >= total ? 'disabled' : ''} title="Next frame" aria-label="Next frame">▶</button><button id="step-end" ${state.frame >= total ? 'disabled' : ''} title="Skip to end" aria-label="Skip to end">⏭</button></div>
      <div class="progress"><input type="range" id="frame-slider" aria-label="Replay frame slider" min="0" max="${total}" value="${state.frame}"><span>${state.frame}/${total}</span></div>
      <div class="speed-control"><label>Speed<select id="play-speed"><option value="1" ${state.speed === 1 ? 'selected' : ''}>1×</option><option value="2" ${state.speed === 2 ? 'selected' : ''}>2×</option><option value="4" ${state.speed === 4 ? 'selected' : ''}>4×</option><option value="8" ${state.speed === 8 ? 'selected' : ''}>8×</option></select></label></div>
      <div class="current-action ${currentClass}"><span class="action-label">${esc(currentLabel)}</span></div>
    </div>
    <div class="watch-board">${players.map(id => playerBoard(s, s.players?.[id], id)).join('')}</div>
    <div class="watch-timeline"><div class="timeline-header">Timeline</div><div class="timeline-items">${timeline.map(item => {
      const isCurrent = item.index === state.frame;
      const label = item.index === 0 ? 'Start' : semanticLabel(item.command, item.frame);
      return `<button class="timeline-item ${item.class} ${isCurrent ? 'current' : ''}" data-frame="${item.index}" title="${esc(label)}" aria-current="${isCurrent ? 'true' : 'false'}"><span class="timeline-dot" aria-hidden="true"></span><span class="timeline-label">${esc(label)}</span></button>`;
    }).join('')}</div></div>
  </div>`;
  document.querySelector('#play-toggle').onclick = togglePlay;
  document.querySelector('#step-prev').onclick = () => stepTo(state.frame - 1);
  document.querySelector('#step-next').onclick = () => stepTo(state.frame + 1);
  document.querySelector('#step-end').onclick = () => stepTo(total);
  document.querySelector('#frame-slider').oninput = e => stepTo(Number(e.target.value));
  document.querySelector('#play-speed').onchange = e => { state.speed = Number(e.target.value); };
  document.querySelectorAll('.timeline-item').forEach(btn => btn.onclick = () => stepTo(Number(btn.dataset.frame)));
  document.querySelectorAll('.card-token').forEach(btn => btn.onclick = () => {
    const identity = btn.dataset.identity;
    if (identity && identity !== 'HIDDEN') {
      const def = getCardDefinition(identity);
      if (def) {
        // Open the Advanced Card Rules View (replaces the old card-face dialog).
        // IRX-M32: Lazy-load the advanced card rules module on first card click.
        getAdvancedCardRules().then(({ openAdvancedCardRules }) => openAdvancedCardRules(identity))
          .catch((err) => console.error('[card-rules] failed to load module:', err));
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT — analysis export
// ═══════════════════════════════════════════════════════════════
/**
 * Export the current observatory analysis to the clipboard as JSON or Markdown.
 * @param {'json'|'markdown'} format - Output format
 */
export async function showExtract(format) {
  if (!state._extractModule) {
    app.innerHTML = '<div class="notice warning"><strong>Extract module not loaded.</strong></div>';
    return;
  }
  try {
    const result = await state._extractModule.extractAnalysis(state.observatory, format);
    await navigator.clipboard.writeText(result);
    app.innerHTML = `<div class="notice supported"><strong>Analysis copied to clipboard.</strong><p>${format === 'json' ? 'JSON' : 'Markdown'} extract is now in your clipboard.</p></div>`;
    showToast(`${format === 'json' ? 'JSON' : 'Markdown'} extract copied to clipboard`, { type: 'success', title: 'Analysis copied' });
    setTimeout(() => render(), 3000);
  } catch (err) {
    app.innerHTML = `<div class="notice danger"><strong>Extract failed:</strong> ${esc(err.message)}</div>`;
    showToast(err.message ?? 'Extract failed', { type: 'error', title: 'Extract failed' });
  }
}

// ═══════════════════════════════════════════════════════════════
// BOOT — entry point
// ═══════════════════════════════════════════════════════════════

/**
 * Update the account dropdown in the landing header to reflect the
 * current auth state. Called on boot and whenever auth state changes.
 */
function updateAccountDropdown() {
  // IRX-M32: Auth module is lazy-loaded — guard against null ref before bootstrap completes.
  const authMod = getAuthController.cached;
  if (!authMod) return;
  const authState = authMod.getAuthState();
  const profile = authMod.getProfile();
  const signedIn = authState === 'AUTHENTICATED' || authState === 'ANONYMOUS';

  // Update account name in the trigger button
  const accountName = document.querySelector('.account-name');
  if (accountName) {
    accountName.textContent = signedIn ? (profile?.displayName ?? 'Player') : 'Guest';
  }

  // Update dropdown header
  const dropdownHeader = document.querySelector('.account-dropdown-id strong');
  if (dropdownHeader) {
    dropdownHeader.textContent = signedIn ? (profile?.displayName ?? 'Player') : 'Guest Player';
  }
  const dropdownSub = document.querySelector('.account-dropdown-id small');
  if (dropdownSub) {
    dropdownSub.textContent = signedIn
      ? (authState === 'ANONYMOUS' ? 'Guest session' : (profile?.handle ? `@${profile.handle}` : 'Signed in'))
      : 'Not signed in';
  }

  // Update the sign-in / sign-out link.
  // The click handler in bindLandingEvents intercepts this link and acts
  // based on the current auth state (sign out when signed in, open auth
  // overlay when signed out), so the href is only a semantic fallback.
  const signInLink = document.querySelector('[data-account-signin]');
  if (signInLink) {
    if (signedIn) {
      signInLink.setAttribute('aria-label', 'Sign out');
      signInLink.querySelector('span').textContent = 'Sign Out';
      signInLink.querySelector('svg').innerHTML = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>';
    } else {
      signInLink.setAttribute('aria-label', 'Sign in');
      signInLink.querySelector('span').textContent = 'Sign In';
      signInLink.querySelector('svg').innerHTML = '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>';
    }
  }
}

// Set up hashchange listener BEFORE boot, so play routes (which return
// early from boot without calling bindGlobal) still respond to navigation.
window.addEventListener('hashchange', () => { render(); });

// Initialize auth and account store on boot.
// initAuth reads the Supabase session and subscribes to changes.
// initAccountStore syncs the reactive store with auth-controller.
// Both are safe to call when Supabase is not configured (they return UNCONFIGURED).
// IRX-M32: Auth, account-store, and migration modules are lazy-loaded via
// dynamic import() so they stay out of the initial bundle. The bootstrap
// sequence is unchanged — it just loads the modules first.
getAuthController().then(async ({ initAuth, isMigrationPending }) => {
  await initAuth();
  const { initAccountStore, subscribe: subscribeToAccount } = await getAccountStore();
  initAccountStore();
  // Subscribe to auth state changes to update the account dropdown reactively
  subscribeToAccount(() => updateAccountDropdown());
  // Update the dropdown once on init
  updateAccountDropdown();
  // Guest→permanent migration: if the user just linked Discord, transfer
  // local achievements to the permanent account via the match server.
  if (isMigrationPending()) {
    showToast('Transferring your progress to your permanent account…', { type: 'info' });
    const { runMigrationIfPending } = await getMigrationController();
    runMigrationIfPending().then((result) => {
      if (result && result.success) {
        if (result.alreadyMigrated) {
          showToast('Progress already transferred — welcome back!', { type: 'info' });
        } else {
          showToast(`Transfer complete! ${result.achievementsTransferred} achievement${result.achievementsTransferred === 1 ? '' : 's'} transferred.`, { type: 'success' });
        }
      } else if (result === null) {
        // No migration was pending — shouldn't happen, but handle gracefully
      } else {
        showToast('Progress transfer failed — your local data is safe. Try again from Settings.', { type: 'error' });
      }
    }).catch(() => {
      showToast('Progress transfer failed — your local data is safe.', { type: 'error' });
    });
  }
}).catch((err) => {
  console.warn('[app] initAuth failed, continuing without auth:', err?.message ?? err);
});

// IRX-C06: Register render function with the rerender bus so workspace
// modules can trigger re-renders without dynamically importing app.js.
// This breaks the backedge from workspace modules to the entry point.
import { setRenderer } from './rerender.js';
setRenderer(render);

boot().then(() => {
  render();
});
