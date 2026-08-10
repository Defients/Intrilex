// ═══════════════════════════════════════════════════════════════
// app.js — Application orchestrator. Imports all modules, dispatches
// routing to workspace renderers, and owns the Watch workspace.
// ═══════════════════════════════════════════════════════════════

import { getCardDefinition } from './card-face-data.js';
import { openAdvancedCardRules } from './play/advanced-card-rules/advanced-card-rules-controller.mjs';
import { renderRulesPage } from './rulebook-renderer.js';
import { RULES_VERSION, ENGINE_VERSION, LAB_VERSION } from './version.js';
import { state,        app,        shell,        landingContainer,        fxLayer,        pageTitle,        pageSubtitle,        esc,        clamp,        showToast} from './state.js';
import { TITLES,   SUBTITLES,   LANDING_MODES,   isPlayRoute,   route} from './router.js';
import { boot,   loadReplay} from './data-loader.js';
import {} from './experiment-controls.js';
import {} from './integrity.js';
import { renderRanks } from './workspaces/ranks.js';
import { renderDiagnostics } from './workspaces/diagnostics.js';
import { renderBranches} from './workspaces/branches.js';
import { renderEvidence } from './workspaces/evidence.js';
import { renderIntelligence } from './workspaces/intelligence.js';
import { renderTournament } from './workspaces/tournament.js';
import { renderProfile } from './workspaces/profile.js';
import { renderLeaderboard } from './workspaces/leaderboard.js';
import { renderAchievementsWorkspace } from './play/achievements/achievement-ui.js';
import { renderCompare, renderMechanics, renderSynergies, renderHistory, renderReplays, renderTraces, renderCardFaces } from './workspaces/observatory.js';
import { installGlobalErrorBoundary, withErrorBoundary } from './error-boundary.js';
import { shouldShowTour, startTour } from './onboarding-tour.js';

// Install global error boundary at module load time
installGlobalErrorBoundary();

// ═══════════════════════════════════════════════════════════════
// MAIN RENDER DISPATCH
// ═══════════════════════════════════════════════════════════════
export function render() {
  const r = route();
  if (isPlayRoute(r)) {
    shell.style.display = 'none';
    if (landingContainer) landingContainer.style.display = 'block';
    document.title = 'Intrilex — Play';
    renderPlayMode(r);
    return;
  }
  if (LANDING_MODES.has(r)) {
    shell.style.display = 'none';
    if (landingContainer) landingContainer.style.display = 'block';
    document.title = r === '/' ? 'Intrilex — Play' : r === '/rules' ? 'Intrilex — Rules' : 'Intrilex';
    renderLandingMode(r);
    return;
  }
  shell.style.display = '';
  if (landingContainer) landingContainer.style.display = 'none';
  if (!state.replay) { loadReplay(state.fixtureId).then(render); return; }
  pageTitle.textContent = TITLES[r];
  pageSubtitle.textContent = SUBTITLES[r];
  const breadcrumbCurrent = document.querySelector('#breadcrumb-current');
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = TITLES[r] ?? 'Observatory';
  document.querySelectorAll('.workspace-link').forEach(link => link.classList.toggle('active', link.dataset.route === r));
  document.querySelector('#global-visibility').value = state.visibility;
  document.querySelector('#layout-preset').value = state.layout;
  shell.dataset.preset = state.layout;
  renderFilters();
  stopTransientFx();
  const renderers = {
    '/watch': renderWatch, '/replays': renderReplays, '/history': renderHistory,
    '/mechanics': renderMechanics, '/cards': renderCardFaces, '/synergies': renderSynergies,
    '/ranks': renderRanks, '/compare': renderCompare, '/traces': renderTraces,
    '/branches': renderBranches, '/diagnostics': renderDiagnostics, '/tournament': renderTournament, '/evidence': renderEvidence, '/profile': renderProfile, '/player': renderProfile, '/leaderboard': () => renderLeaderboard(app), '/intelligence': renderIntelligence, '/achievements': () => renderAchievementsWorkspace(app)
  };
  try { (renderers[r] ?? renderEvidence)(); }
  catch (error) {
    console.error(`[render] Workspace error for ${r}:`, error);
    app.innerHTML = `<div class="notice danger"><strong>Workspace error.</strong><p>Failed to render ${esc(r)}.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
  }
  // Trigger onboarding tour on first observatory visit
  if (shouldShowTour()) {
    // Defer to next frame so the workspace DOM is fully painted
    requestAnimationFrame(() => startTour());
  }
}

function renderLandingMode(r) {
  if (!landingContainer) return;
  if (r === '/') renderLanding();
  else if (r === '/rules') renderRules();
}

// ═══════════════════════════════════════════════════════════════
// PLAY MODULE — lazy-loaded
// ═══════════════════════════════════════════════════════════════
let _playModule = null;
let _boardCssLoaded = false;
async function renderPlayMode(r) {
  if (!landingContainer) return;
  if (!_playModule) {
    _playModule = await import('./play/play-app.js');
    // Load base play CSS (tokens, hub, setup, tutorial, network lobby, terminal) — needed for all play routes
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
    rdLink.href = 'play/ranked-duel.css?v=' + Date.now();
    rdLink.dataset.playCss = '1';
    document.head.appendChild(rdLink);
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

function renderLanding() {
  _landingSelectedMode = 'local';
  landingContainer.innerHTML = `<div class="landing-app">
    <video class="landing-video-bg" autoplay muted loop playsinline preload="auto" aria-hidden="true">
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
            <a class="account-dropdown-item disabled" aria-disabled="true" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
              <span>Profile</span>
              <svg class="account-lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
            </a>
            <a class="account-dropdown-item disabled" aria-disabled="true" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span>Match History</span>
              <svg class="account-lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
            </a>
            <a class="account-dropdown-item disabled" aria-disabled="true" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>
              <span>Achievements</span>
              <svg class="account-lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
            </a>
            <a class="account-dropdown-item disabled" aria-disabled="true" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Settings</span>
              <svg class="account-lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
            </a>
            <div class="account-dropdown-divider"></div>
            <a class="account-dropdown-item sign-in" href="#/auth" role="menuitem">
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
            <p class="landing-tagline">A tactical card game of public score, disruption, and exactly-when spending. Every decision matters.</p>
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
                <button class="landing-mode-tile" role="radio" aria-checked="false" data-mode="tutorial" data-href="#/play/tutorial">
                  <span class="landing-mode-icon" aria-hidden="true">&#128214;</span>
                  <span class="landing-mode-body"><strong>Guided Tutorial</strong><small>Learn by playing your first guided duel</small></span>
                  <span class="landing-mode-check" aria-hidden="true">&#10003;</span>
                </button>
              </div>
            </div>
            <button class="landing-play-cta" data-testid="landing-cta" data-href="#/play/new">
              <span>START LOCAL DUEL</span><span class="landing-cta-arrow" aria-hidden="true">&rarr;</span>
            </button>
            <p class="landing-play-subline" data-mode-subline>Choose your mode. Make every decision count.</p>
          </div>
        </section>
        <aside class="landing-secondary-rail" aria-label="Secondary navigation">
          <div class="landing-cards">
            <div id="landing-continue-slot" aria-live="polite"></div>
            <a class="landing-rail-card rules landing-card rules" href="#/rules">
              <span class="landing-rail-body">
                <strong>&sect; Rules</strong>
                <p>Read the complete official rulebook.</p>
              </span>
              <span class="landing-rail-chevron" aria-hidden="true">&rsaquo;</span>
            </a>
            <a class="landing-rail-card forums" href="https://intrilex.discourse.group/" target="_blank" rel="noopener noreferrer">
              <span class="landing-rail-forums-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
              </span>
              <span class="landing-rail-body">
                <strong>Official Forums</strong>
                <p>Join the community. Discuss strategy, report issues, and connect with other players.</p>
              </span>
              <span class="landing-rail-chevron" aria-hidden="true">&rsaquo;</span>
            </a>
            <a class="landing-rail-card whats-new" href="#/evidence">
              <span class="landing-rail-body">
                <strong>WHAT'S NEW</strong>
                <p>Intrilex v${LAB_VERSION} &middot; Engine ${ENGINE_VERSION} &middot; Rules ${RULES_VERSION}</p>
                <span class="landing-rail-cta">Release details &rarr;</span>
              </span>
              <span class="landing-rail-emblem gold subtle" aria-hidden="true">&#10022;</span>
            </a>
          </div>
        </aside>
      </div>
    </main>
    <footer class="landing-footer">
      <span class="landing-footer-brand"><img src="assets/intrilex-crest.png" alt="IX" class="landing-footer-crest" /> INTRILEX</span>
      <a class="landing-footer-credit" href="https://deffy.me" target="_blank" rel="noopener noreferrer" aria-label="Created and Designed by Ðeffy Urz">
        <span class="landing-footer-credit-prefix">Created &amp; Designed by</span>
        <span class="landing-footer-credit-name">Ðeffy Urz</span>
      </a>
    </footer>
  </div>`;
  bindLandingEvents();
  loadContinueCard();
}

/**
 * Wire up mode-tile selection and primary CTA on the landing page.
 */
function bindLandingEvents() {
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
      const modeLabels = { local: 'START LOCAL DUEL', online: 'START ONLINE DUEL', tutorial: 'START GUIDED TUTORIAL' };
      label.textContent = modeLabels[_landingSelectedMode] || 'START DUEL';
    }
    const subline = landingContainer.querySelector('[data-mode-subline]');
    if (subline) {
      const sublines = {
        local: 'Fast matches. Adaptive AI. Deterministic outcomes.',
        online: 'Server-authoritative. Real opponents. Verified replays.',
        tutorial: 'Learn the basics. Interactive guidance. No pressure.',
      };
      subline.textContent = sublines[_landingSelectedMode] || 'Choose your mode. Make every decision count.';
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
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!accountMenu.contains(e.target)) toggleMenu(false);
    });
    // Close on Escape
    accountMenu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { toggleMenu(false); accountTrigger.focus(); }
    });
    // Close after clicking a menu item
    accountDropdown.querySelectorAll('.account-dropdown-item').forEach(item => {
      item.addEventListener('click', () => toggleMenu(false));
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
    if (!saves || saves.length === 0) return;
    const save = saves.find(s => s.stableBoundary?.decisionFrameHash) ?? saves[0];
    if (!save) return;
    // Build rich metadata from the save summary (v2 envelope) or fall back to basics
    const sum = save.summary;
    const mode = sum?.mode ?? (save.mode ? String(save.mode).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Local vs AI');
    const turn = sum?.turn ? `Turn ${sum.turn}` : (save.stableBoundary?.turn ? `Turn ${save.stableBoundary.turn}` : '');
    const score = (sum && typeof sum.humanScore === 'number') ? `${sum.humanScore}\u2013${sum.opponentScore}` : '';
    const opponent = sum?.opponentLabel ?? '';
    const parts = [mode, turn, score].filter(Boolean);
    const meta = parts.join(' &middot; ');
    slot.innerHTML = `<button class="landing-rail-card continue" data-save-id="${esc(save.saveId)}">
      <span class="landing-rail-body">
        <strong>CONTINUE DUEL</strong>
        <p>Pick up where you left off.${meta ? `<br><span class="landing-rail-sub">${meta}</span>` : ''}</p>
        <span class="landing-resume-btn">RESUME &rarr;</span>
      </span>
      <img src="assets/intrilex-crest.png" alt="" class="landing-rail-crest" aria-hidden="true" />
    </button>`;
    const continueBtn = slot.querySelector('.landing-rail-card.continue');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        const saveId = continueBtn.dataset.saveId;
        if (!saveId) return;
        // Hand off the saveId to the play hub, which restores via continueMatch
        try { sessionStorage.setItem('intrilex-continue-save', saveId); } catch { /* unavailable */ }
        location.hash = '#/play';
      });
    }
    // Continue slot is already first in the rail; no promotion needed
    // (Learn Intrilex card was removed — Continue Duel is the top rail card)
  } catch { /* persistence unavailable — silently omit Continue card */ }
}

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
function renderFilters() {
  const chips = [];
  if (state.filters.profile !== 'all') chips.push(['Profile', state.filters.profile, () => state.filters.profile = 'all']);
  if (state.selectedMechanic) chips.push(['Mechanic', state.selectedMechanic, () => state.selectedMechanic = null]);
  if (state.selectedPolicy) chips.push(['Policy', state.selectedPolicy, () => state.selectedPolicy = null]);
  if (state.filters.evidence !== 'all') chips.push(['Evidence', state.filters.evidence, () => state.filters.evidence = 'all']);
  document.querySelector('#global-filter-bar').innerHTML = `<span class="eyebrow">COHORT</span>${chips.length ? `<span class="filter-count-badge" aria-label="${chips.length} active filters">${chips.length}</span>` : ''}${chips.length ? chips.map(([k, v], i) => `<span class="filter-chip"><b>${esc(k)}</b>${esc(v)}<button data-remove-filter="${i}" aria-label="Remove ${esc(k)} filter: ${esc(v)}">×</button></span>`).join('') : '<span class="footer-note">All compatible v' + RULES_VERSION + ' / Engine ' + ENGINE_VERSION + ' observations</span>'}<button id="clear-filters" class="ghost-button" ${chips.length ? '' : 'disabled'}>Clear</button>`;
  document.querySelectorAll('[data-remove-filter]').forEach(button => button.addEventListener('click', () => { chips[Number(button.dataset.removeFilter)][2](); render(); }));
  document.querySelector('#clear-filters').addEventListener('click', () => { state.selectedMechanic = null; state.selectedPolicy = null; state.filters = { profile: 'all', policy: 'all', outcome: 'all', evidence: 'all', search: '' }; render(); });
}

// ═══════════════════════════════════════════════════════════════
// WATCH WORKSPACE — playback engine (tightly coupled, stays inline)
// ═══════════════════════════════════════════════════════════════
function currentFrame() { return state.visibility === 'public' ? state.replay.frames[state.frame] : state.authorized?.frames[state.frame]; }
function currentState() { const frame = currentFrame(); if (!frame) return {}; if (state.visibility === 'public') return frame.state; if (state.visibility === 'player') return frame.playerViews?.[state.viewer] ?? {}; return frame.omniscientState ?? {}; }
export function stop() { state.playing = false; if (state.timer) clearInterval(state.timer); state.timer = null; }
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
function renderWatch() {
  if (!state.replay || !state.replay.frames) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">◈</span><strong>No replay loaded.</strong><p>Select a replay from the Replays workspace or run a campaign.</p><a class="primary-button empty-action" href="#/replays">Browse replays</a></div>'; return; }
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
        openAdvancedCardRules(identity);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT — analysis export
// ═══════════════════════════════════════════════════════════════
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

// Set up hashchange listener BEFORE boot, so play routes (which return
// early from boot without calling bindGlobal) still respond to navigation.
window.addEventListener('hashchange', () => { render(); });

boot().then(() => {
  render();
});
