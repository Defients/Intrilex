// ═══════════════════════════════════════════════════════════════
// app.js — Application orchestrator. Imports all modules, dispatches
// routing to workspace renderers, and owns the Watch workspace.
// ═══════════════════════════════════════════════════════════════

import { createLandingOverlays } from './landing-overlays.js';
import { getCardDefinition } from './card-face-data.js';
import { renderRulesPage } from './rulebook-renderer.js';
import { RULES_VERSION, ENGINE_VERSION, LAB_VERSION } from './version.js';
import { state,        app,        shell,        landingContainer,        fxLayer,        pageTitle,        pageSubtitle,        esc,        fmt,        clamp,        showToast,        persistSetting} from './state.js';
import { TITLES,   SUBTITLES,   INSTRUMENTS,   LANDING_MODES,   isPlayRoute,   route,   updateRailContext} from './router.js';
import { boot,   loadReplay,   loadAuthorized,   getObservatoryBootPromise,   openReplay,   openRetainedFullMatch} from './data-loader.js';
import { replayDescriptorKey,   describeWatchStandby,   REPLAY_STATUS} from './replay-resolver.js';
import { syncRailToggle } from './experiment-controls.js';
import {} from './integrity.js';
import { renderRanks } from './workspaces/ranks.js';
import { renderDiagnostics } from './workspaces/diagnostics.js';
import { renderEvolutionLab, cleanupEvolutionLab } from './workspaces/evolution.js';
import { renderMutationChamber, cleanupMutationChamber } from './workspaces/mutation.js';
import { renderDiscover, cleanupDiscover } from './workspaces/discover.js';
import { renderStrategy, cleanupStrategy } from './strategy/strategy-workspace.js';
import { renderBranches} from './workspaces/branches.js';
import { renderForensicWorkspace, initForensicViewer, getForensicState, setCurrentFrame, renderForensicSidebar, renderForensicComparisonOverlay, renderFrameCommentary, handleForensicAction } from './forensic/forensic-viewer.mjs';
import { frameSummary as forensicFrameSummary, branchesAtFrame as forensicBranchesAtFrame } from './forensic/forensic-model.mjs';
import { renderEvidence } from './workspaces/evidence.js';
import { renderReleaseNotes } from './workspaces/release-notes.js';
import { renderHome } from './home/home.js';
import { renderIntelligence } from './workspaces/intelligence.js';
import { renderTournament } from './workspaces/tournament.js';
import { renderCaster, cleanupCaster } from './workspaces/caster-workspace.js';
import { renderProfile } from './workspaces/profile.js';
import { renderPlayers, destroyPlayers } from './workspaces/players.js';
import { renderLeaderboard, destroyLeaderboard } from './workspaces/leaderboard.js';
import { renderSeasonArchive } from './workspaces/season-archive.js';
import { renderMetaReport } from './workspaces/meta-report.js';
import { renderHumanTournaments } from './workspaces/human-tournaments.js';
import { renderCards } from './workspaces/cards/card-workspace.js';
import { renderAuth } from './workspaces/auth.js';
import { renderSettings } from './workspaces/settings.js';
import { renderCompare, renderMechanics, renderSynergies, renderHistory, renderReplays, renderTraces } from './workspaces/observatory.js';
import { renderComboAtlas } from './workspaces/combo-atlas.js';
import { renderMetaAtlas } from './workspaces/meta-atlas.js';
import { installGlobalErrorBoundary, withErrorBoundary } from './error-boundary.js';
import { createReplayTransport } from './replay-transport.mjs';
import {
  TIMELINE_MODES, REPLAY_ARTIFACT_CLASS, ARTIFACT_CLASS_LABEL,
  timelineModel, artifactHeadline, commandSemanticClass, commandLabel,
  commandAction, frameEventTypes,
} from './replay-contract.mjs';
import { renderPrivacyPage, renderTermsPage } from './legal-pages.js';
import { applyRouteMetadata, populateObservatoryShellText } from './seo-metadata.js';

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
let _workspaceLinks = null;
let _filterBarEl = null;
let _clearFiltersEl = null;
let _eyebrowEl = null;

function cachedBreadcrumb() {
  return _breadcrumbEl ??= document.querySelector('#breadcrumb-current');
}
function cachedEyebrow() {
  return _eyebrowEl ??= document.querySelector('.observatory-shell .global-header .eyebrow');
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
  shell.removeAttribute('data-workspace');
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
  // Caster workspace cleanup: stop playback timer and terminate worker on route change.
  if (_previousRoute === '/caster' && r !== '/caster') {
    try { cleanupCaster(); } catch (e) { console.warn('[render] cleanupCaster error:', e); }
  }
  // Evolution Lab cleanup: stop a running series and terminate its workers on route change.
  if (_previousRoute === '/evolution' && r !== '/evolution') {
    try { cleanupEvolutionLab(); } catch (e) { console.warn('[render] cleanupEvolutionLab error:', e); }
  }
  // Mutation Chamber cleanup: terminate any in-flight A/B workers on route change.
  if (_previousRoute === '/mutation' && r !== '/mutation') {
    try { cleanupMutationChamber(); } catch (e) { console.warn('[render] cleanupMutationChamber error:', e); }
  }
  // Discover cleanup: abort the investigation loop and its stage workers.
  if (_previousRoute === '/discover' && r !== '/discover') {
    try { cleanupDiscover(); } catch (e) { console.warn('[render] cleanupDiscover error:', e); }
  }
  if (_previousRoute === '/strategy' && r !== '/strategy') cleanupStrategy();
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
  // Caster workspace: full-screen landing mode using the authentic game UI.
  // Renders into #landing-app (shell hidden) with ranked-duel.css + gameplay-skins.css
  // loaded on demand. Remains in the observatory sidebar nav for discovery.
  if (r === '/caster') {
    hideShell();
    if (landingContainer) landingContainer.style.display = 'block';
    // Load ranked-duel.css + gameplay-skins.css (same pattern as renderPlayMode match routes)
    if (!_boardCssLoaded) {
      _boardCssLoaded = true;
      const rdLink = document.createElement('link');
      rdLink.rel = 'stylesheet';
      rdLink.href = 'play/ranked-duel.css?v=' + LAB_VERSION;
      rdLink.dataset.playCss = '1';
      document.head.appendChild(rdLink);
      const skinLink = document.createElement('link');
      skinLink.rel = 'stylesheet';
      skinLink.href = 'play/gameplay-skins.css?v=' + LAB_VERSION;
      skinLink.dataset.playCss = '1';
      document.head.appendChild(skinLink);
    }
    renderCaster(landingContainer);
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
  // can legitimately end in an unavailable state.
  // The pending request key distinguishes descriptors: a failed load marks
  // only its own key as attempted, so selecting any replay later (including
  // retrying the same one through an explicit openReplay call) still works.
  const watchPendingKey = state.replayRequest
    ? replayDescriptorKey(state.replayRequest)
    : replayDescriptorKey({ kind: state.replayKind === 'autonomy' ? 'autonomy' : 'corpus', fixtureId: state.fixtureId });
  if (r === '/watch' && !state.replay && state.replayStatus !== REPLAY_STATUS.LOADING
    && watchPendingKey && state._replayLoadedFor !== watchPendingKey) {
    // IRX-H21: Don't block the Watch workspace if replay loading fails.
    // Attempt to load the replay in the background; renderWatch presents the
    // honest standby/unavailable/error state from state.replayStatus.
    loadReplay(state.fixtureId).then(() => {
      render();
    }).catch(() => {
      render();
    });
    // Don't return — fall through to render the Watch workspace immediately
    // with the honest standby/loading state. When loadReplay resolves,
    // render() will be called again with the outcome.
  }
  pageTitle.textContent = TITLES[r];
  pageSubtitle.textContent = SUBTITLES[r];
  const breadcrumbCurrent = cachedBreadcrumb();
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = TITLES[r] ?? 'Observatory';
  cachedWorkspaceLinks().forEach(link => link.classList.toggle('active', link.dataset.route === r));
  shell.dataset.preset = state.layout;
  syncRailToggle();
  // CosmoTech: tag the shell with the active instrument so the accent
  // system can tint chrome (nav, tabs, wells) per workspace without
  // touching workspace markup.
  shell.dataset.workspace = r.replace(/^\//, '');
  const eyebrowEl = cachedEyebrow();
  if (eyebrowEl && INSTRUMENTS[r]) eyebrowEl.textContent = INSTRUMENTS[r];
  renderFilters();
  stopTransientFx();
  const renderers = {
    '/strategy': renderStrategy,
    '/watch': renderWatch, '/replays': renderReplays, '/history': renderHistory,
    '/mechanics': renderMechanics, '/combo': renderComboAtlas, '/synergies': renderSynergies,
    '/ranks': renderRanks, '/atlas': renderMetaAtlas, '/cards': renderCards, '/compare': renderCompare, '/traces': renderTraces,
    '/branches': renderBranches, '/forensic': renderForensic, '/diagnostics': renderDiagnostics, '/evolution': renderEvolutionLab, '/mutation': renderMutationChamber, '/discover': renderDiscover, '/tournament': renderTournament, '/evidence': renderEvidence, '/release-notes': renderReleaseNotes, '/profile': renderProfile, '/player': renderProfile, '/intelligence': renderIntelligence, '/achievements': async () => { const { renderAchievementsWorkspace } = await getAchievementUi(); return renderAchievementsWorkspace(app); }, '/settings': renderSettings
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
  // The canonical homepage serves both '/' and '/dev' (the developer
  // preview now IS the product front door). Overlay routes render the
  // homepage first, then stack the overlay on top.
  const homeCtx = {
    getAuthController, showToast,
    openAuthOverlay, openProfileOverlay, openSettingsOverlay,
    openAchievementsOverlay, openMatchHistoryOverlay,
    openReleaseNotesOverlay, openLeaderboardOverlay,
    openPlayersOverlay, openRankingSystemOverlay,
  };
  const renderHomePageRoute = () => { renderHome(landingContainer, homeCtx); maybeSkipLandingVideo(); };
  if (r === '/') renderHomePageRoute();
  else if (r === '/dev') {
    renderHomePageRoute();
    const preAlphaScheduled = showPreAlphaOverlay();
    // If the pre-alpha notice was already acknowledged (skipped), show the
    // developer blog directly — otherwise it appears after the dismiss.
    if (!preAlphaScheduled) showDevBlogOverlay(2000);
  }
  else if (r === '/rules') renderRules();
  else if (r === '/privacy') renderLegalPage(r);
  else if (r === '/terms') renderLegalPage(r);
  else if (r === '/auth') {
    // Sign In is an overlay on the homepage, not a Simulation Lab workspace.
    // Render the landing page first, then open the auth overlay on top.
    renderHomePageRoute();
    openAuthOverlay();
  }
  else if (r === '/players') {
    // Players is an overlay on the homepage, not a Simulation Lab workspace.
    renderHomePageRoute();
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
    renderHomePageRoute();
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
  else if (r === '/forensic') {
    // Forensic Replay Lab — bookmark, branch, annotate, and compare replays.
    if (landingContainer) {
      landingContainer.innerHTML = '';
      renderForensicWorkspace(landingContainer);
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
const { closeLandingOverlay, openLandingOverlay, openAuthOverlay } = createLandingOverlays({ state, esc, renderAuth });

// ── Overlay content renderers ────────────────────────────────────

function openProfileOverlay() {
  openLandingOverlay('Profile', (c) => renderProfile(c));
}

function openSettingsOverlay() {
  openLandingOverlay('Settings', (c) => renderSettings(c));
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
  // Idempotent: if the overlay is already scheduled or on-screen, do not
  // restart it. Re-renders of /dev (duplicate hashchange listeners, auth
  // updates, navigating back) must not tear down a visible overlay and
  // reschedule it — that made the notice vanish and appear a second time.
  if (_preAlphaOverlayTimer || document.getElementById('prealpha-overlay')) return true;

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
    _preAlphaOverlayTimer = null;
    // Guard: only show while still on the /dev route. landingContainer stays
    // connected and visible on every landing route (/rules, /auth, …), so the
    // container check alone lets the overlay fire on the wrong page — and it
    // would then fire again when the user returns to /dev.
    if (route() !== '/dev' || !landingContainer.isConnected || landingContainer.style.display === 'none') return;
    // Never stack a second copy if one already exists.
    if (document.getElementById('prealpha-overlay')) return;
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
      <div class="prealpha-dev-stamp" aria-label="Last development date: October 1, 2026">
        <span class="prealpha-dev-stamp-line" aria-hidden="true"></span>
        <span class="prealpha-dev-stamp-content">
          <span class="prealpha-dev-stamp-dot" aria-hidden="true"></span>
          <span class="prealpha-dev-stamp-label">Last development</span>
          <time class="prealpha-dev-stamp-date" datetime="2026-10-01">Oct 1, 2026</time>
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
  const visOpt = (v, l) => `<option value="${v}"${state.visibility === v ? ' selected' : ''}>${l}</option>`;
  // Provenance readout: dataset size + engine/rules authority, so the bar
  // communicates analytical confidence instead of reading as a bare filter.
  const matchCount = state.aggregate?.matchCount ?? (Array.isArray(state.observatory?.summaries) ? state.observatory.summaries.length : null);
  const provenanceNote = `${matchCount != null ? fmt(matchCount) + ' matches · ' : ''}Engine ${ENGINE_VERSION} · Rules v${RULES_VERSION} · all compatible observations`;
  filterBar.innerHTML = `<span class="eyebrow">COHORT</span>${chips.length ? `<span class="filter-count-badge" aria-label="${chips.length} active filters">${chips.length}</span>` : ''}${chips.length ? chips.map(([k, v], i) => `<span class="filter-chip"><b>${esc(k)}</b>${esc(v)}<button data-remove-filter="${i}" aria-label="Remove ${esc(k)} filter: ${esc(v)}">×</button></span>`).join('') : `<span class="footer-note cohort-provenance">${esc(provenanceNote)}</span>`}<button id="clear-filters" class="ghost-button" ${chips.length ? '' : 'disabled'} title="Clear cohort filters only — does not affect Discovery runs">Clear Cohort</button><label class="compact-control filter-view">View <select id="global-visibility" aria-label="Visibility mode">${visOpt('public', 'Public')}${visOpt('player', 'Player-authorized')}${visOpt('judge', 'Omniscient')}</select></label>`;
  // Re-query after innerHTML replaces child nodes — these can't be cached
  filterBar.querySelectorAll('[data-remove-filter]').forEach(button => button.addEventListener('click', () => { chips[Number(button.dataset.removeFilter)][2](); render(); }));
  const visSelect = filterBar.querySelector('#global-visibility');
  if (visSelect) visSelect.addEventListener('change', async e => {
    state.visibility = e.target.value;
    persistSetting('visibility', state.visibility);
    if (state.visibility !== 'public') await loadAuthorized();
    updateRailContext();
    render();
  });
  const clearBtn = filterBar.querySelector('#clear-filters');
  if (clearBtn) clearBtn.addEventListener('click', () => { state.selectedMechanic = null; state.selectedPolicy = null; state.filters = { profile: 'all', policy: 'all', outcome: 'all', evidence: 'all', search: '' }; render(); });
}

// ═══════════════════════════════════════════════════════════════
// WATCH WORKSPACE — playback engine (tightly coupled, stays inline)
// ═══════════════════════════════════════════════════════════════
function currentFrame() { return state.visibility === 'public' ? state.replay.frames[state.frame] : state.authorized?.frames[state.frame]; }
function currentState() { const frame = currentFrame(); if (!frame) return {}; if (state.visibility === 'public') return frame.state; if (state.visibility === 'player') return frame.playerViews?.[state.viewer] ?? {}; return frame.omniscientState ?? {}; }
// Playback lifecycle lives in replay-transport.mjs (Node-testable). The
// transport guarantees: no replay → toggle/step are pure no-ops; a tick that
// finds the replay cleared stops the timer; stop() is idempotent.
const replayTransport = createReplayTransport({
  getState: () => state,
  setCurrentFrame,
  triggerFx: triggerFxForFrame,
  render,
});
/** Stop replay playback and clear the playback timer. */
export function stop() { replayTransport.stop(); }
/** Toggle replay playback (play/pause). No-op when no replay is loaded. */
export function togglePlay() { replayTransport.togglePlay(); }
function stepTo(index) { replayTransport.stepTo(index); }
function stepBy(delta) { replayTransport.stepBy(delta); }
function commandAt(index) { return state.replay.commands?.[Math.max(0, index - 1)] ?? null; }
// Timeline semantics delegate to the Full-Match Watch Contract
// (replay-contract.mjs) — one canonical implementation shared by the
// Watch timeline, scrubber, and the browser tests.
function semanticForCommand(command, frame) { return commandSemanticClass(command, frame); }
function semanticLabel(command, frame) { return commandLabel(command, frame); }
/**
 * Timeline model for the active replay under the selected display mode.
 * 'all' is canonical (every frame); 'actions' hides engine orchestration;
 * 'turns' groups frames per observed full turn without removing evidence.
 * state.showOrchestration remains as an explicit override — when true the
 * 'actions' filter is bypassed (equivalent to 'all' visibility).
 */
function watchTimelineModel() {
  const mode = TIMELINE_MODES.includes(state.watchTimelineMode) ? state.watchTimelineMode : 'actions';
  return timelineModel(state.replay, {
    mode: state.showOrchestration && mode === 'actions' ? 'all' : mode,
    currentFrame: state.frame,
  });
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
/**
 * Render the Forensic workspace — replay forensics with bookmarks,
 * branches, annotations, and puzzle generation.
 */
async function renderForensic() {
  await renderForensicWorkspace(app);
}

// ── Match Theatre helpers ─────────────────────────────────────
/** Replay index record for the active fixture (autonomy or corpus kind). */
function watchIndexRecord() {
  const index = state.replayKind === 'autonomy' ? state.autonomyIndex : state.index;
  return index?.records?.find(r => r.fixtureId === state.fixtureId) ?? null;
}
/** Match summary for the active fixture — exists for retained autonomy matches only. */
function watchMatchSummary() {
  return state.observatory?.summaries?.find(s => s.matchId === state.fixtureId) ?? null;
}
/**
 * Semantic scrubber ticks — one positional tick per frame, classed by the
 * same semantic categories as the timeline dots, with taller markers for
 * scoring/terminal evidence and amber marks for forensic bookmarks.
 * Every marker derives from existing replay data (frame event types,
 * command semantics, forensic session); nothing is synthesized.
 */
function watchScrubberMarkers(total, forensicSession) {
  if (!state.replay?.frames?.length || total < 1) return '';
  const bookmarked = new Set((forensicSession?.bookmarks ?? []).map(b => b.frameIndex));
  const ticks = [];
  for (let i = 0; i <= total; i += 1) {
    const frame = state.replay.frames[i];
    const types = frameEventTypes(frame);
    const classes = [];
    if (i > 0) classes.push(semanticForCommand(state.replay.commands[i - 1], frame));
    if (types.some(t => /VICTORY|TERMINATION/.test(t))) classes.push('terminal');
    else if (types.some(t => /SCORED|SCORING|GOAL|ROW_CLEAR/.test(t))) classes.push('score');
    if (bookmarked.has(i)) classes.push('bookmark');
    ticks.push(`<i class="${classes.join(' ')}" style="left:${((i / total) * 100).toFixed(2)}%" aria-hidden="true"></i>`);
  }
  const pos = (clamp(state.frame, 0, total) / total) * 100;
  return `${ticks.join('')}<span class="scrubber-position" style="left:${pos.toFixed(2)}%"></span>`;
}
/**
 * Full-Match Watch Contract evidence strip — one honest line of artifact
 * disclosure rendered next to the transport for BOTH loaded and standby
 * states. Every field comes from the resolver-attached classification
 * (replay-contract.mjs); nothing is inferred for display only.
 */
function watchEvidenceHtml() {
  const cls = state.replayContract ?? state.replay?._contract ?? null;
  const ev = cls?.evidence ?? {};
  const artifactClass = cls?.class ?? REPLAY_ARTIFACT_CLASS.UNKNOWN;
  const headline = cls ? artifactHeadline(cls) : 'NO REPLAY';
  const badge = `<span class="evidence-badge evidence-${esc(artifactClass.toLowerCase().replaceAll('_', '-'))}" data-testid="evidence-class">${esc(ARTIFACT_CLASS_LABEL[artifactClass] ?? 'Unknown artifact')}</span>`;
  const chips = [];
  const sourceLabel = { corpus: 'Certified corpus', autonomy: 'Retained lab replay', local: 'Local replay', object: 'Runtime session' }[state.replaySource?.kind] ?? null;
  if (sourceLabel) chips.push(sourceLabel);
  const matchId = ev.fixtureId ?? state.replaySource?.id ?? null;
  if (matchId) chips.push(matchId);
  if (artifactClass === REPLAY_ARTIFACT_CLASS.METADATA_ONLY) {
    chips.push('Replay body not present in this build');
  } else {
    if (ev.turns != null) chips.push(`${ev.turns} turns`);
    if (ev.commandCount != null) chips.push(`${ev.commandCount} commands`);
    if (ev.frameCount != null) chips.push(`${ev.frameCount} frames`);
    if (ev.frameIntegrity) chips.push(ev.frameIntegrity);
    if (ev.terminationReason) chips.push(`termination ${ev.terminationReason}`);
    else if (ev.winner != null) chips.push(`winner ${typeof ev.winner === 'string' ? ev.winner : (ev.winner.playerId ?? '—')}`);
    if (ev.hash) chips.push(`hash ${String(ev.hash).slice(0, 12)}…`);
  }
  return `<div class="watch-evidence" data-testid="watch-evidence" data-artifact-class="${esc(artifactClass)}"><div class="evidence-headline">${badge}<span class="evidence-line">${esc(headline)}</span></div>${chips.length ? `<div class="evidence-chips">${chips.map(c => `<span class="evidence-chip">${esc(c)}</span>`).join('')}</div>` : ''}</div>`;
}

/** Transport console — forensic replay transport shared by live and standby states. */
function watchTransportHtml({ loaded, total, forensicSession, currentLabel = '', currentClass = '' }) {
  const s = loaded ? currentState() : {};
  const dis = loaded ? '' : 'disabled ';
  const posMeta = loaded
    ? `TURN ${esc(String(s.fullTurnSequence ?? '—'))} · ${esc(String(s.phase ?? '—').toUpperCase())}`
    : 'STANDBY';
  const posValue = loaded
    ? `F ${state.frame}<em>/${total}</em>`
    : 'F —<em>/0</em>';
  return `<div class="watch-controls">
    <div class="transport" role="group" aria-label="Playback transport"><button id="step-start" ${dis}title="Skip to start" aria-label="Skip to start">⏮</button><button id="step-prev" ${dis}title="Previous frame" aria-label="Previous frame">◀</button><button id="play-toggle" ${dis}aria-label="${loaded && state.playing ? 'Pause' : 'Play'}">${loaded && state.playing ? '⏸' : '▶'}</button><button id="step-next" ${dis}title="Next frame" aria-label="Next frame">▶</button><button id="step-end" ${dis}title="Skip to end" aria-label="Skip to end">⏭</button></div>
    <div class="watch-scrubber"><div class="scrubber-markers" aria-hidden="true">${loaded ? watchScrubberMarkers(total, forensicSession) : ''}</div><input type="range" id="frame-slider" aria-label="Replay frame slider" min="0" max="${total}" value="${loaded ? state.frame : 0}" ${dis}></div>
    <div class="watch-position"><b>${posValue}</b><small>${posMeta}</small></div>
    <div class="speed-control"><label>Speed<select id="play-speed" ${dis}>${[1, 2, 4, 8].map(v => `<option value="${v}" ${state.speed === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label></div>
    <div class="current-action ${currentClass}"><span class="action-label">${esc(currentLabel || 'No replay loaded')}</span></div>
    ${loaded ? '<span class="transport-keys" aria-hidden="true">←/→ step · space play · home/end jump</span>' : ''}
  </div>`;
}

/**
 * Two coherent analytical readout regions below the theatre:
 * MATCH STATE (seat rows + real engine fields) and EVENT / DECISION
 * (current semantic action, event-type chips, adjacent commands, and
 * cross-workspace provenance links). Every value comes from the replay,
 * the reconstructed frame, or the Observatory index — nothing invented.
 */
function watchReadoutsHtml({ s, frame, players, currentCmd, currentLabel, currentClass, indexRec, summary, total }) {
  const activeId = s.activePlayerId;
  const seatRows = players.map(id => {
    const p = s.players?.[id] ?? {};
    const detail = [`goal ${p.goal ?? '—'}`, `hand ${(p.hand ?? []).length}`, `pr ${(p.pr ?? []).length}`, `er ${(p.er ?? []).length}`].join(' · ');
    return `<div class="watch-seat-row ${id === activeId ? 'active' : ''}"><span class="seat-id">${esc(id)}</span><span class="seat-detail">${esc(detail)}</span><span class="seat-score">${secured(s, p)}<small> pts</small></span></div>`;
  }).join('');
  const stackDepth = Array.isArray(s.stack) ? s.stack.length : 0;
  const triggerDepth = Array.isArray(s.triggerQueue) ? s.triggerQueue.length : 0;
  const winner = s.winner ? (typeof s.winner === 'string' ? s.winner : (s.winner.playerId ?? '—')) : null;
  const stateKvs = [
    ['Turn', s.fullTurnSequence],
    ['Phase', s.phase],
    ['Active player', activeId],
    ['Mini-turns left', s.players?.[activeId]?.limits?.miniTurnsRemaining],
    stackDepth ? ['Stack depth', stackDepth] : null,
    triggerDepth ? ['Trigger queue', triggerDepth] : null,
    winner ? ['Winner', winner] : null,
    summary?.completedFullTurns != null ? ['Match turns', summary.completedFullTurns] : null,
  ].filter(r => r && r[1] != null && r[1] !== '');
  const types = frameEventTypes(frame);
  const chipClass = t => /VICTORY|TERMINATION/.test(t) ? 'terminal'
    : /SCORED|SCORING|GOAL|ROW_CLEAR/.test(t) ? 'score'
    : /TRIGGER|VOLTAGE/.test(t) ? 'trigger'
    : /RESPONSE|PRIORITY/.test(t) ? 'response' : '';
  const chipHtml = types.slice(0, 8).map(t => `<span class="watch-event-chip ${chipClass(t)}" title="${esc(t)}">${esc(t.replace(/^CORE_/, '').replaceAll('_', ' '))}</span>`).join('') + (types.length > 8 ? `<span class="watch-event-chip more">+${types.length - 8}</span>` : '');
  const kind = commandAction(currentCmd)?.kind ?? currentCmd?.type ?? null;
  const decisionKvs = [
    ['Command kind', kind],
    ['Actor', currentCmd?.actorId],
    ['Command', currentCmd?.id],
    frame?.commandIndex >= 0 ? ['Index', `#${frame.commandIndex}`] : null,
    frame?.accepted === false ? ['Status', 'REJECTED'] : null,
    indexRec?.hasDecisionTraces ? ['Traces', indexRec.traceCount != null ? `${indexRec.traceCount} recorded` : 'available'] : null,
    indexRec?.contentHash ? ['Replay hash', `${String(indexRec.contentHash).slice(0, 12)}…`] : null,
  ].filter(r => r && r[1] != null && r[1] !== '');
  const prevLabel = state.frame > 0 ? semanticLabel(commandAt(state.frame - 1), state.replay.frames[state.frame - 1]) : null;
  const nextLabel = state.frame < total ? semanticLabel(commandAt(state.frame + 1), state.replay.frames[state.frame + 1]) : null;
  const links = [];
  if (indexRec?.hasDecisionTraces) links.push(`<button type="button" class="ix-cross-link" id="watch-open-traces">◇ Decision traces${indexRec.traceCount ? ` (${indexRec.traceCount})` : ''}</button>`);
  if (summary) links.push('<button type="button" class="ix-cross-link" id="watch-open-history">☰ Match detail</button>');
  links.push('<a class="ix-cross-link" href="#/replays">▶ Replay vault</a>');
  return `<div class="watch-readouts">
    <section class="watch-readout" aria-label="Match state"><h4>Match state</h4>
      <div class="watch-seat-rows">${seatRows}</div>
      ${stateKvs.map(([k, v]) => `<div class="obs-kv"><span>${esc(k)}</span><span>${esc(String(v))}</span></div>`).join('')}
    </section>
    <section class="watch-readout" aria-label="Event and decision evidence"><h4>Event / decision</h4>
      <div class="readout-headline"><span class="semantic-tag">${esc(currentClass || 'initial')}</span><span>${esc(currentLabel)}</span></div>
      ${decisionKvs.map(([k, v]) => `<div class="obs-kv"><span>${esc(k)}</span><span>${esc(String(v))}</span></div>`).join('')}
      ${chipHtml ? `<div class="watch-event-chips">${chipHtml}</div>` : ''}
      ${(prevLabel || nextLabel) ? `<div class="readout-adjacent">${prevLabel ? `<span>PREV ▸ ${esc(prevLabel)}</span>` : ''}${nextLabel ? `<span>NEXT ▸ ${esc(nextLabel)}</span>` : ''}</div>` : ''}
      <div class="readout-links">${links.join('')}</div>
    </section>
  </div>`;
}

/**
 * One timeline item button. `item` is a timelineModel() entry
 * ({ index, frame, command, class, turn, label }); forensic markers are
 * layered on by frame index exactly as before.
 */
function watchTimelineItemHtml(item, forensicState) {
  const isCurrent = item.index === state.frame;
  const label = item.label ?? (item.index === 0 ? 'Start' : '—');
  let forensicClasses = '';
  if (forensicState?.session) {
    const fs = forensicFrameSummary(forensicState.session, item.index);
    if (fs.hasBookmark) forensicClasses += ' has-bookmark';
    if (fs.annotationCount > 0) forensicClasses += ' has-annotation';
    if (fs.branchCount > 0) forensicClasses += ' has-branch';
  }
  return `<button class="timeline-item ${item.class} ${isCurrent ? 'current' : ''}${forensicClasses}" data-class="${item.class}" data-frame="${item.index}" title="${esc(label)}" aria-current="${isCurrent ? 'true' : 'false'}"><span class="timeline-dot" aria-hidden="true"></span><span class="timeline-label">${esc(label)}</span></button>`;
}

/**
 * Timeline markup for the active mode.
 *   all     — every canonical frame in order.
 *   actions — player-facing frames; orchestration hidden (counted).
 *   turns   — per-turn group headers; the group containing the current
 *             frame expands to expose its canonical frames in place.
 */
function watchTimelineHtml(model, forensicState) {
  const modeButtons = TIMELINE_MODES.map(mode =>
    `<button type="button" class="timeline-mode ${mode === model.mode ? 'active' : ''}" data-timeline-mode="${mode}" aria-pressed="${mode === model.mode}">${mode[0].toUpperCase()}${mode.slice(1)}</button>`).join('');
  const counts = model.mode === 'all'
    ? `${model.totalFrames} frames · canonical — nothing hidden`
    : model.mode === 'actions'
      ? `${model.visibleCount} visible · ${model.hiddenOrchestration} engine transitions hidden · ${model.totalFrames} total`
      : `${model.turnCount} turns · ${model.totalFrames} frames grouped — nothing removed`;
  const bookmarkBadge = forensicState?.session?.bookmarks?.length
    ? ` <span class="forensic-timeline-badge" aria-label="${forensicState.session.bookmarks.length} bookmarks">${forensicState.session.bookmarks.length}</span>` : '';
  let body;
  if (model.mode === 'turns') {
    body = model.groups.map((group, gi) => {
      const isCurrentGroup = gi === model.currentGroup;
      const seat = group.seat ? ` — ${esc(group.seat)}` : '';
      const turnTitle = group.turn == null ? 'Untracked' : `Turn ${group.turn}`;
      const header = `<button class="timeline-item turn-group ${isCurrentGroup ? 'current' : ''}" data-frame="${group.firstIndex}" title="${esc(`${turnTitle}${seat} — ${group.count} frames`)}" aria-current="${isCurrentGroup ? 'true' : 'false'}"><span class="timeline-dot" aria-hidden="true"></span><span class="timeline-label">${esc(turnTitle)}${seat}</span><span class="turn-group-count">${group.count}</span></button>`;
      const nested = isCurrentGroup
        ? `<div class="turn-group-frames">${group.items.map(item => watchTimelineItemHtml(item, forensicState)).join('')}</div>` : '';
      return header + nested;
    }).join('');
  } else {
    body = model.items.map(item => watchTimelineItemHtml(item, forensicState)).join('');
  }
  return `<div class="watch-timeline"><div class="timeline-header">Timeline${bookmarkBadge}<span class="timeline-mode-switch" role="group" aria-label="Timeline mode">${modeButtons}</span><span class="timeline-counts" data-testid="timeline-counts">${esc(counts)}</span></div><div class="timeline-items" data-timeline-mode="${model.mode}">${body}</div></div>`;
}

function renderWatch() {
  if (!state.replay || !state.replay.frames) {
    // IRX-H21: The Watch workspace renders even when replay blobs are
    // excluded from the build (~670MB savings). The theatre presents a
    // designed STANDBY state — ghost board topology, dormant transport —
    // and the copy is honest about WHY there is no signal: nothing
    // selected, loading, metadata-only (body excluded from this build),
    // or a load/normalization failure (replay-resolver.js statuses).
    const standby = describeWatchStandby(state);
    const eyebrowByVariant = { loading: 'LOADING', unavailable: 'METADATA ONLY', error: 'NO SIGNAL', idle: 'STANDBY' };
    const eyebrow = eyebrowByVariant[standby.variant] ?? 'STANDBY';
    const sourceLabel = state.replaySource?.id ? `<span class="theatre-source-label">${esc(state.replaySource.label ?? `${state.replaySource.kind ?? 'replay'} · ${state.replaySource.id}`)}</span>` : '';
    const retryButton = standby.variant === 'error' && state.replayRequest
      ? '<button id="watch-standby-retry" type="button" class="secondary-button">Retry</button>' : '';
    const fullMatchButton = standby.variant === 'idle'
      ? '<button id="watch-standby-full" type="button" class="secondary-button">Open a full match</button>' : '';
    app.innerHTML = `<div class="watch-layout watch-layout-idle">
      <section class="watch-theatre theatre-standby" aria-label="Match theatre — standby" data-standby-variant="${esc(standby.variant)}">
        <div class="theatre-chrome"><span class="theatre-eyebrow"><span class="live-dot standby" aria-hidden="true"></span>MATCH THEATRE // ${esc(eyebrow)}</span><span class="theatre-chrome-meta">OBS-01 · ${esc(eyebrow)}</span></div>
        <div class="theatre-ghost" aria-hidden="true">
          <div class="ghost-board"><div class="ghost-seat"><span class="ghost-line w40"></span><span class="ghost-line w24"></span></div><div class="ghost-zones"><i></i><i></i><i></i></div></div>
          <div class="ghost-board"><div class="ghost-seat"><span class="ghost-line w40"></span><span class="ghost-line w24"></span></div><div class="ghost-zones"><i></i><i></i><i></i></div></div>
          <span class="ghost-standby-glyph" aria-hidden="true">◈</span>
        </div>
        <div class="theatre-standby-core">
          <strong>${esc(standby.headline)}</strong>${sourceLabel}
          <p>${esc(standby.detail)}</p>
          <div class="theatre-standby-actions"><a class="primary-button" href="#/replays">Browse replays</a>${fullMatchButton}${retryButton}<button id="watch-standby-experiment" type="button" class="secondary-button">Run experiment</button></div>
        </div>
        <div class="theatre-ghost-timeline" aria-hidden="true">${'<i></i>'.repeat(28)}</div>
      </section>
      ${watchEvidenceHtml()}
      ${watchTransportHtml({ loaded: false, total: 0, forensicSession: null })}
    </div>`;
    document.querySelector('#watch-standby-experiment')?.addEventListener('click', () => {
      document.querySelector('#experiment-button')?.click();
    });
    document.querySelector('#watch-standby-retry')?.addEventListener('click', () => {
      if (state.replayRequest) void openReplay(state.replayRequest, { navigate: false });
    });
    // Full-Match Watch Contract: the standby offers to open a provably
    // complete match — never a scenario fixture (CT-*). Local retained
    // replays carry real completedAt chronology, so the newest local match
    // wins; bundled index records carry no trustworthy chronology, so the
    // action makes a documented deterministic pick instead of claiming
    // "latest" (see orderFullMatchCandidates in replay-contract.mjs).
    document.querySelector('#watch-standby-full')?.addEventListener('click', () => {
      void openRetainedFullMatch().then(result => {
        if (!result) showToast('No complete match replay is retained in this build.', { type: 'info' });
      });
    });
    return;
  }
  // IRX-FORENSIC: Initialize forensic viewer for this replay if not already loaded.
  // The forensic sidebar provides bookmarking, annotation, branching, and puzzle
  // generation tools alongside the Watch workspace.
  const forensicState = getForensicState();
  const replayId = state.fixtureId ?? state.replay?.fixtureId ?? state.replay?.matchId ?? 'unknown';
  if (!forensicState || forensicState?.session?.replayId !== replayId) {
    initForensicViewer(replayId, state.replay, state.frame).then(() => render()).catch(() => {});
    return; // Will re-render after async init
  }
  setCurrentFrame(state.frame);

  // Preserve the timeline scroll position across the full re-render — the
  // DOM is rebuilt on every frame transition, so without this the viewport
  // snaps to the top of a 300+ item timeline (the reported "truncated
  // match" impression). scrollIntoView below then guarantees the current
  // item stays visible.
  const previousTimelineScroll = document.querySelector('.timeline-items')?.scrollTop ?? null;
  const frame = currentFrame(), s = currentState(), timeline = watchTimelineModel(), total = state.replay.frames.length - 1;
  const players = s.turnOrder ?? Object.keys(s.players ?? {});
  const currentCmd = commandAt(state.frame);
  const currentLabel = state.frame === 0 ? 'Initial state' : semanticLabel(currentCmd, frame);
  const currentClass = state.frame === 0 ? '' : semanticForCommand(currentCmd, frame);
  const forensicSidebarHtml = renderForensicSidebar();
  const indexRec = watchIndexRecord();
  const summary = watchMatchSummary();
  const chromeMeta = [
    state.replay.engineVersion ? `ENGINE ${state.replay.engineVersion}` : null,
    state.replay.rulesVersion ? `RULES ${state.replay.rulesVersion}` : null,
    summary?.policyIds?.length ? summary.policyIds.join(' vs ').toUpperCase() : null,
    summary?.terminationReason ?? indexRec?.terminationReason ?? indexRec?.outcome ?? null,
  ].filter(Boolean).join(' · ');
  const winnerLabel = s.winner ? (typeof s.winner === 'string' ? s.winner : (s.winner.playerId ?? '—')) : null;
  const railFlag = winnerLabel
    ? `<span class="theatre-rail-flag terminal">TERMINAL · ${esc(winnerLabel)} WINS</span>`
    : (state.frame >= total ? '<span class="theatre-rail-flag">END OF RECORD</span>' : '');
  app.innerHTML = `<div class="watch-layout watch-layout-forensic">
    <div class="watch-main">
      <section class="watch-theatre" aria-label="Match theatre">
        <div class="theatre-chrome"><span class="theatre-eyebrow"><span class="live-dot" aria-hidden="true"></span>MATCH THEATRE · ${esc(replayId)}</span><span class="theatre-chrome-meta">${esc(chromeMeta) || 'CERTIFIED REPLAY'}</span></div>
        <div class="watch-board">${players.map(id => playerBoard(s, s.players?.[id], id)).join('')}</div>
        <div class="theatre-statusrail"><span>TURN <b>${esc(String(s.fullTurnSequence ?? '—'))}</b></span><span>PHASE <b>${esc(String(s.phase ?? '—').toUpperCase())}</b></span><span>ACTIVE <b>${esc(String(s.activePlayerId ?? '—'))}</b></span><span>${players.map(id => `${esc(id)} <b>${secured(s, s.players?.[id])}</b> PTS`).join(' · ')}</span>${railFlag}</div>
      </section>
      ${renderFrameCommentary(state.frame)}
      ${watchEvidenceHtml()}
      ${watchTransportHtml({ loaded: true, total, forensicSession: forensicState?.session, currentLabel, currentClass })}
      ${watchReadoutsHtml({ s, frame, players, currentCmd, currentLabel, currentClass, indexRec, summary, total })}
      ${(() => {
        // IRX-FORENSIC: Render branch previews below the board when branches exist at this frame.
        if (!forensicState?.session) return '';
        const frameBranches = forensicBranchesAtFrame(forensicState.session, state.frame);
        if (frameBranches.length === 0) return '';
        return `<div class="forensic-branch-previews" data-testid="forensic-branch-previews">${frameBranches.map(b => `
          <div class="forensic-branch-preview" data-testid="forensic-branch-preview">
            <div class="forensic-branch-preview-header">
              <strong>⎇ Alternate Line</strong>
              <span>${esc(b.label || 'Untitled branch')}</span>
            </div>
            <div class="forensic-branch-preview-commands">${b.alternateCommands.length > 0 ? `${b.alternateCommands.length} alternate command(s)` : '<span class="forensic-branch-preview-empty">No alternate commands yet — add commands to explore this line</span>'}</div>
          </div>
        `).join('')}</div>`;
      })()}
      ${watchTimelineHtml(timeline, forensicState)}
    </div>
    ${forensicSidebarHtml}
  </div>${renderForensicComparisonOverlay()}`;
  document.querySelector('#play-toggle').onclick = togglePlay;
  document.querySelector('#step-start').onclick = () => stepTo(0);
  document.querySelector('#step-prev').onclick = () => stepTo(state.frame - 1);
  document.querySelector('#step-next').onclick = () => stepTo(state.frame + 1);
  document.querySelector('#step-end').onclick = () => stepTo(total);
  // Provenance links — reuse the same cross-workspace navigation the
  // History/Traces rows use (real actions, no fabricated behavior).
  document.querySelector('#watch-open-traces')?.addEventListener('click', () => {
    state.traceSelectedId = state.fixtureId;
    location.hash = '#/traces';
  });
  document.querySelector('#watch-open-history')?.addEventListener('click', () => {
    state.historySelectedMatch = state.fixtureId;
    location.hash = '#/history';
  });
  document.querySelector('#frame-slider').oninput = e => stepTo(Number(e.target.value));
  document.querySelector('#play-speed').onchange = e => { state.speed = Number(e.target.value); };
  document.querySelectorAll('.timeline-item').forEach(btn => btn.onclick = () => stepTo(Number(btn.dataset.frame)));
  document.querySelectorAll('[data-timeline-mode]').forEach(btn => btn.onclick = () => {
    state.watchTimelineMode = btn.dataset.timelineMode;
    persistSetting('watchTimelineMode', state.watchTimelineMode);
    render();
  });
  // Keep the active timeline entry visible across the full re-render —
  // restore the user's scroll position first, then nudge the current item
  // into view only when it is actually out of sight.
  const timelineEl = document.querySelector('.timeline-items');
  if (timelineEl) {
    if (previousTimelineScroll != null) timelineEl.scrollTop = previousTimelineScroll;
    timelineEl.querySelector('.timeline-item.current')?.scrollIntoView({ block: 'nearest' });
  }
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
  // IRX-FORENSIC: Wire up forensic sidebar action handlers.
  wireForensicSidebar();
  // IRX-FORENSIC: Wire up comparison overlay close button (outside sidebar).
  wireForensicOverlay();
}

// ═══════════════════════════════════════════════════════════════
// FORENSIC — wire sidebar actions into the Watch workspace
// ═══════════════════════════════════════════════════════════════

/**
 * Wire up forensic sidebar action handlers in the Watch workspace.
 * Delegates to handleForensicAction() and handles results:
 *   - frameJump → stepTo() to navigate to a bookmarked frame
 *   - puzzle → navigate to /puzzles with the generated puzzle
 *   - exportJson → trigger a file download
 *   - message → show a transient toast
 */
function wireForensicSidebar() {
  const sidebar = document.querySelector('[data-testid="forensic-sidebar"]');
  if (!sidebar) return;

  sidebar.querySelectorAll('[data-forensic-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.forensicAction;
      const data = {};

      // Gather input values based on action type
      if (action === 'add-bookmark') {
        const labelInput = sidebar.querySelector('#forensic-bookmark-label');
        data.label = labelInput?.value?.trim() || '';
      } else if (action === 'add-annotation') {
        const textArea = sidebar.querySelector('#forensic-annotation-text');
        data.text = textArea?.value?.trim() || '';
        if (!data.text) return; // Don't submit empty annotations
      } else if (action === 'create-branch') {
        const labelInput = sidebar.querySelector('#forensic-branch-label');
        data.label = labelInput?.value?.trim() || '';
      } else if (action === 'generate-puzzle') {
        // IRX-FORENSIC: Pass the actual frame state for better objective suggestions.
        // Use the public state to avoid leaking hidden information into generated puzzles.
        data.frameState = currentState();
      } else if (action === 'remove-bookmark') {
        data.bookmarkId = btn.dataset.bookmarkId;
      } else if (action === 'jump-bookmark') {
        data.frameIndex = Number(btn.dataset.frame);
        data.bookmarkId = btn.dataset.bookmarkId;
      } else if (action === 'remove-annotation') {
        data.annotationId = btn.dataset.annotationId;
      } else if (action === 'remove-branch') {
        data.branchId = btn.dataset.branchId;
      } else if (action === 'view-comparison') {
        data.comparisonId = btn.dataset.comparisonId;
      } else if (action === 'remove-comparison') {
        data.comparisonId = btn.dataset.comparisonId;
      } else if (action === 'add-bookmark-from-insight') {
        data.frame = btn.dataset.frame;
        data.label = btn.dataset.label;
      } else if (action === 'practice-from-insight') {
        data.frame = btn.dataset.frame;
        data.category = btn.dataset.category;
      }

      const result = await handleForensicAction(action, data, () => render());

      // Handle frame jump (bookmark navigation)
      if (typeof result.frameJump === 'number') {
        stepTo(result.frameJump);
      }

      // Handle puzzle generation — store puzzle and navigate to puzzles route
      if (result.puzzle) {
        try {
          // Store the generated puzzle for the puzzle app to pick up
          window._forensicGeneratedPuzzle = result.puzzle;
          location.hash = '#/puzzles';
        } catch (err) {
          console.error('[forensic] puzzle navigation failed:', err);
        }
      }

      // Handle export — trigger a file download
      if (result.exportJson) {
        try {
          const blob = new Blob([result.exportJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `forensic-session-${state.fixtureId ?? 'replay'}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('[forensic] export download failed:', err);
        }
      }
    });
  });
}

/**
 * Wire up the forensic comparison overlay close button.
 * The overlay renders outside the sidebar (fixed position), so it
 * needs its own event wiring.
 */
function wireForensicOverlay() {
  const overlay = document.querySelector('[data-testid="forensic-comparison-overlay"]');
  if (!overlay) return;
  const closeBtn = overlay.querySelector('[data-forensic-action="close-comparison"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      await handleForensicAction('close-comparison', {}, () => render());
    });
  }
  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      handleForensicAction('close-comparison', {}, () => render()).catch(() => {});
    }
  });
  // Close on Escape key
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleForensicAction('close-comparison', {}, () => render()).catch(() => {});
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// ANALYSIS DOSSIER — research-state export (see docs/ANALYSIS_DOSSIER.md)
// ═══════════════════════════════════════════════════════════════
/**
 * Download the canonical Analysis Dossier as JSON, Markdown, or both.
 * @param {'json'|'markdown'|'both'} format - Output format
 */
export async function exportAnalysisDossier(format = 'json') {
  try {
    const exporter = await import('./analysis-dossier-export.js');
    const { files } = await exporter.exportAnalysisDossier(['json', 'markdown', 'both'].includes(format) ? format : 'json');
    showToast(`Downloaded ${files.join(' and ')}`, { type: 'success', title: 'Analysis Dossier exported' });
  } catch (err) {
    showToast(err.message ?? 'Dossier export failed', { type: 'error', title: 'Export failed' });
  }
}

/**
 * Export the Research Evidence Package — manifest + dossier + every
 * resolvable durable run artifact. Completeness is declared in the
 * manifest, never implied.
 */
export async function exportResearchPackage() {
  try {
    const { downloadResearchPackage } = await import('./experiments/research-package.mjs');
    const { name, report } = await downloadResearchPackage();
    showToast(`${name} — ${report.completeness} · ${report.artifactsIncluded}/${report.artifactsExpected} run artifacts`, { type: report.completeness === 'COMPLETE' ? 'success' : 'warning', title: 'Research package exported' });
  } catch (err) {
    showToast(err.message ?? 'Package export failed', { type: 'error', title: 'Export failed' });
  }
}

/**
 * Legacy extract contract, repaired: the clipboard now receives the canonical
 * Analysis Dossier serialization (JSON or deterministic Markdown), which is a
 * superset of the old analysis extract.
 * @param {'json'|'markdown'} format - Output format
 */
export async function showExtract(format) {
  try {
    const { extractAnalysisToClipboard } = await import('./analysis-dossier-export.js');
    const result = await extractAnalysisToClipboard(format === 'markdown' ? 'markdown' : 'json');
    await navigator.clipboard.writeText(result);
    app.innerHTML = `<div class="notice supported"><strong>Analysis copied to clipboard.</strong><p>${format === 'json' ? 'JSON' : 'Markdown'} dossier is now in your clipboard.</p></div>`;
    showToast(`${format === 'json' ? 'JSON' : 'Markdown'} dossier copied to clipboard`, { type: 'success', title: 'Analysis copied' });
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
  // The click handler in home.js bindAccountMenu intercepts this link and
  // acts based on the current auth state (sign out when signed in, open
  // auth overlay when signed out), so the href is only a semantic fallback.
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
import { setRenderer, setAppActions } from './rerender.js';
setRenderer(render);
setAppActions({ togglePlay, stop, stepBy, stepTo, showExtract, exportAnalysisDossier, exportResearchPackage });

// IRX-FORENSIC: Expose state on window for the forensic viewer's open-session
// flow, which needs to set replay state before navigating to Watch. This is
// a minimal bridge — the forensic model itself is pure and framework-agnostic.
window.__intrilexState = state;

boot().then(() => {
  render();
});
