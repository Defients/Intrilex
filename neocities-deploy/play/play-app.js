// ═══════════════════════════════════════════════════════════════
// play-app.js — Play module UI controller
// Manages session lifecycle, DOM events, and rendering.
// Never owns authoritative state — delegates to PlaySession.
// ═══════════════════════════════════════════════════════════════

import { createSession, restoreSession, SessionState } from './play-controller.js?v=73b458295383';
import { renderBoard, renderNewMatchSetup } from './ranked-duel-renderer.mjs?v=73b458295383';
import { renderReplayLibrary, listReplaySummaries, downloadReplay } from './replay-library.js?v=73b458295383';
import { getSave, putSave, isIndexedDBAvailable, getPreference, updatePlayerStats, getReplay } from './persistence.js?v=73b458295383';
import { ensureReplayFrames } from '../replay-frames.js?v=73b458295383';
import { state as observatoryState } from '../state.js?v=73b458295383';
import { buildSaveIntegrityPayload } from './save-integrity.js?v=73b458295383';
import { validateSnapshotPrivacy } from './play-privacy.js?v=73b458295383';
import { POLICY_IDS } from '../autonomy-runtime.js?v=73b458295383';
import { GuidanceMode } from './intelligence/action-explanation.js?v=73b458295383';
import './orchestration/declaration-flow.js?v=73b458295383';
import './state/play-lifecycle.js?v=73b458295383';
import { acquireLease, releaseLease, checkLease, forceTakeLease, generateTabId } from './state/session-lease.js?v=73b458295383';
import { getAiBanter } from './ai-personality.js?v=73b458295383';
import { SoundEngine } from './play-sound.js?v=73b458295383';
import { ParticleSystem } from './play-particles.js?v=73b458295383';
import { renderAcademy, findLesson, getCompletedLessons, markLessonComplete } from './academy/academy-renderer.mjs?v=73b458295383';
import { state, resetState } from './play-state.js?v=73b458295383';
import { bindBoardEvents as bindBoardEventsModule, addBeforeUnloadProtection, removeBeforeUnloadProtection } from './board-events.js?v=73b458295383';
import {
  openAdvancedCardRules as openAdvancedCardRulesController,
  closeAdvancedCardRules,
  isCardInspectable,
  buildCurrentMatchContext,
  getOpenIdentity,
} from './advanced-card-rules/advanced-card-rules-controller.mjs?v=73b458295383';
import { NetworkPlaySession, NetworkSessionState } from './network/network-session.mjs?v=73b458295383';
import {
  renderNetworkLobby, renderNetworkCreateWaiting, renderNetworkJoinForm,
  renderNetworkQueueWaiting, renderNetworkSpectateForm, renderNetworkSpectating,
  renderNetworkJoinWaiting, renderNetworkReconnectDialog, renderNetworkError,
  renderNetworkStatusBanner, renderNetworkUnavailable,
} from './network/network-lobby-renderer.mjs?v=73b458295383';
import { getMatchServerUrl, isMatchServerConfigured, validateMatchServerUrl } from './network/match-server-config.js?v=73b458295383';
import { renderFunnelBanner, wireFunnelBanner, completeStep, advanceToStep, getCurrentStep, FunnelStep } from './first-run-funnel.js?v=73b458295383';
import { getAccessToken, onTokenRefresh } from './network/auth-controller.js?v=73b458295383';
import { getAchievementRuntime } from './achievements/achievement-runtime.js?v=73b458295383';
import { getAchievementPresenter } from './achievements/achievement-presenter.js?v=73b458295383';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// IRX-H10: Reconnect-grace countdown ticker for the waiting player. The
// disconnect overlay renders a static remaining-time value; this interval
// updates it every second so the player sees a live deadline. The ticker is
// self-cleaning: if no countdown element is present, the interval is cleared.
let _graceCountdownTimerId = null;
function tickReconnectGraceCountdown(container) {
  const el = container.querySelector('[data-testid="reconnect-grace-countdown"]');
  if (!el) {
    if (_graceCountdownTimerId) { clearInterval(_graceCountdownTimerId); _graceCountdownTimerId = null; }
    return;
  }
  if (_graceCountdownTimerId) return; // already ticking
  _graceCountdownTimerId = setInterval(() => {
    const deadline = Number(el.getAttribute('data-grace-deadline-ms'));
    if (!Number.isFinite(deadline)) return;
    const remainingSec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const strong = el.querySelector('strong');
    if (strong) {
      strong.textContent = `${remainingSec}s`;
    } else {
      el.textContent = `Reconnect grace: ${remainingSec}s remaining`;
    }
    if (remainingSec <= 0 && _graceCountdownTimerId) {
      clearInterval(_graceCountdownTimerId);
      _graceCountdownTimerId = null;
    }
  }, 1000);
}

/**
 * Route handler for #/play and sub-routes.
 * Called by the main app router.
 */
export async function handlePlayRoute(route, container) {
  // Load guidance mode preference on first entry
  if (state.guidanceMode === GuidanceMode.GUIDED && !state.guidancePrefLoaded) {
    state.guidancePrefLoaded = true;
    const saved = await getPreference('guidanceMode');
    if (saved) state.guidanceMode = saved;
  }
  const sub = route.replace(/^\/play/, '') || '';

  // IRX-H25: Clean up network session when navigating away from online play routes.
  // Without this, WebSocket connections leak when the user navigates via browser
  // back button, manual hash change, or external link instead of clicking "Leave".
  const isOnlineRoute = sub.startsWith('/online');
  if (!isOnlineRoute && state.networkSession) {
    // Only disconnect — don't call leave() (which notifies the server) because
    // the user may be navigating to a different play mode, not abandoning.
    // The reconnect info in localStorage allows rejoining if they return.
    try { state.networkSession.disconnect(); }
    catch (err) { console.warn('[play-app] session disconnect failed:', err?.message ?? err); }
    state.networkSession = null;
  }

  if (sub === '' || sub === '/') {
    // #/play hub has been removed — redirect to new match setup
    location.hash = '#/play/new';
    return;
  } else if (sub === '/new') {
    await renderNewMatch(container);
  } else if (sub === '/match') {
    // Auto-continue handoff from the landing page Continue Duel card
    try {
      const pendingSaveId = sessionStorage.getItem('intrilex-continue-save');
      if (pendingSaveId) {
        sessionStorage.removeItem('intrilex-continue-save');
        if (isIndexedDBAvailable()) {
          await continueMatch(pendingSaveId, container);
          return;
        }
      }
    } catch (err) { console.warn('[play-app] sessionStorage unavailable:', err?.message ?? err); }
    await renderActiveMatch(container);
  } else if (sub === '/replays') {
    await renderReplays(container);
  } else if (sub === '/online') {
    await renderNetworkLobbyHub(container);
  } else if (sub === '/online/create') {
    await renderNetworkCreateFlow(container);
  } else if (sub === '/online/join') {
    await renderNetworkJoinFlow(container);
  } else if (sub === '/online/queue') {
    await renderNetworkQueueFlow(container);
  } else if (sub === '/online/spectate') {
    await renderNetworkSpectateFlow(container);
  } else if (sub === '/online/match') {
    await renderNetworkActiveMatch(container);
  } else if (sub === '/academy') {
    await renderAcademyHub(container);
  } else {
    // Unknown play sub-route — redirect to new match setup
    location.hash = '#/play/new';
  }
}

/**
 * Render new match setup.
 */
async function renderNewMatch(container) {
  // Build policy catalog from POLICY_IDS
  const catalog = POLICY_IDS.map(id => ({
    policyId: id,
    traits: { archetype: id.replace('hybrix-', '').replace(/-(hard|easy|nightmare|normal)$/, ''), difficulty: id.includes('-hard') ? 'hard' : id.includes('-easy') ? 'easy' : id.includes('-nightmare') ? 'nightmare' : 'normal' },
  }));
  // U7: First-run funnel banner for new players
  const funnelBanner = renderFunnelBanner();
  container.innerHTML = funnelBanner + renderNewMatchSetup(catalog);
  if (funnelBanner) wireFunnelBanner(container);
  bindNewMatchForm(container);
}

/**
 * Render the Academy hub — tutorial lesson list.
 */
async function renderAcademyHub(container) {
  const completed = getCompletedLessons();
  // U7: Mark tutorial started in the first-run funnel
  if (getCurrentStep() === FunnelStep.LANDING) advanceToStep(FunnelStep.TUTORIAL_STARTED);
  container.innerHTML = renderAcademy({ completedLessons: completed });
  bindAcademyEvents(container);
}

/**
 * Bind Academy hub events.
 */
function bindAcademyEvents(container) {
  container.querySelectorAll('[data-action="academy-start"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lessonId = btn.dataset.lessonId;
      await startAcademyLesson(lessonId, container);
    });
  });
}

/**
 * Start an Academy lesson — launches a first-contact match with the lesson's AI policy.
 */
async function startAcademyLesson(lessonId, container) {
  const lesson = findLesson(lessonId);
  if (!lesson) return;
  state.academyLessonId = lessonId;
  state.guidanceMode = GuidanceMode.GUIDED;
  await startNewMatch({
    profileId: 'first-contact-trigger-closure',
    seed: `academy-${lessonId}`,
    humanPlayerId: 'P1',
    aiPolicyId: lesson.aiPolicy,
    mode: 'ADVANCED_CORE',
  }, container);
}

/**
 * Bind new match form events.
 */
function bindNewMatchForm(container) {
  const form = container.querySelector('#new-match-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const profileId = formData.get('profile');
    const seat = formData.get('seat');
    const aiPolicy = formData.get('ai-policy');
    const seedInput = formData.get('seed');
    const seed = seedInput ? Number(seedInput) >>> 0 : (Math.random() * 4294967296) >>> 0 || 1;
    const humanPlayerId = seat === 'random' ? (Math.random() < 0.5 ? 'P1' : 'P2') : seat;

    await startNewMatch({
      profileId,
      seed,
      humanPlayerId,
      aiPolicyId: aiPolicy,
      mode: 'ADVANCED_CORE',
    }, container);
  });
}

/**
 * Start a new match.
 */
async function startNewMatch(setup, container) {
  resetState();
  container.innerHTML = '<div class="play-loading">Creating match...</div>';
  try {
    state.session = await createSession(setup);
    state.sessionId = state.session.sessionId;
    state.tabId = state.tabId || generateTabId();

    // Start achievement tracking for this match
    try {
      const achRuntime = getAchievementRuntime();
      await achRuntime.init();
      achRuntime.startMatch(state.sessionId, setup.humanPlayerId, { isTutorial: false });
      const presenter = getAchievementPresenter();
      achRuntime.onUnlock((unlocks) => presenter.queueUnlocks(unlocks));
      state.session.setAchievementConsumer((events, snapshot) => {
        achRuntime.consumeEvents(events, null, snapshot);
      });
    } catch (err) { console.warn('[play-app] achievement tracking init failed:', err?.message ?? err); }
    // Initialize sound engine
    state.sound = state.sound || new SoundEngine();
    state.particles = state.particles || new ParticleSystem();
    state.prevHandCount = 0;
    try { state.soundMuted = (await getPreference('soundMuted')) ?? false; } catch { /* ignore */ }
    // Acquire session lease for duplicate-tab protection
    const leaseResult = await acquireLease(state.sessionId, state.tabId);
    if (!leaseResult.acquired) {
      state.leaseMode = 'CONFLICT';
      await renderActiveMatch(container);
      return;
    }
    state.leaseMode = 'CONTROLLED';
    startHeartbeat();
    startAutosave();
    location.hash = '#/play/match';
    await renderActiveMatch(container);
  } catch (error) {
    container.innerHTML = `<div class="play-error" role="alert"><h2>Failed to start match</h2><p>${esc(error.message)}</p><a href="#/" class="secondary-button">Back to Home</a></div>`;
  }
}

/**
 * Continue a saved match.
 */
async function continueMatch(saveId, container) {
  try {
    const save = await getSave(saveId);
    if (!save) throw new Error('Save not found');
    state.session = await restoreSession(save);
    state.sessionId = state.session.sessionId;
    state.tabId = state.tabId || generateTabId();
    state.chatMessages = [];
    state.lastEventCount = 0;
    // Resume achievement tracking for restored match
    try {
      const achRuntime = getAchievementRuntime();
      await achRuntime.init();
      achRuntime.startMatch(state.sessionId, save.setup?.humanPlayerId ?? 'P1', { isTutorial: false });
      const presenter = getAchievementPresenter();
      achRuntime.onUnlock((unlocks) => presenter.queueUnlocks(unlocks));
      state.session.setAchievementConsumer((events, snapshot) => {
        achRuntime.consumeEvents(events, null, snapshot);
      });
    } catch (err) { console.warn('[play-app] achievement tracking init failed:', err?.message ?? err); }
    // Initialize sound + particles
    state.sound = state.sound || new SoundEngine();
    state.particles = state.particles || new ParticleSystem();
    state.prevHandCount = 0;
    state.statsRecorded = state.session.status === SessionState.TERMINAL; // Don't re-record stats for already-terminal saves
    try { state.soundMuted = (await getPreference('soundMuted')) ?? false; } catch { /* ignore */ }
    // Acquire session lease
    const leaseResult = await acquireLease(state.sessionId, state.tabId);
    if (!leaseResult.acquired) {
      state.leaseMode = 'CONFLICT';
      await renderActiveMatch(container);
      return;
    }
    state.leaseMode = 'CONTROLLED';
    startHeartbeat();
    startAutosave();
    location.hash = '#/play/match';
    await renderActiveMatch(container);
  } catch (error) {
    container.innerHTML = `<div class="play-error" role="alert"><h2>Failed to resume match</h2><p>${esc(error.message)}</p><a href="#/" class="secondary-button">Back to Home</a></div>`;
  }
}

/**
 * Start lease heartbeat — renews lease before expiry.
 */
function startHeartbeat() {
  stopHeartbeat();
  state.heartbeatTimer = setInterval(async () => {
    if (state.leaseMode !== 'CONTROLLED' || !state.sessionId) return;
    const result = checkLease(state.sessionId, state.tabId);
    if (result.leased && result.holder !== state.tabId) {
      state.leaseMode = 'LEASE_LOST';
      stopHeartbeat();
      stopAutosave();
      await renderActiveMatch(state.activeContainer);
    }
  }, 5000);
}

function stopHeartbeat() {
  if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
}

/**
 * Clean up session resources — called on leaving match or terminal.
 */
function teardownSession() {
  stopHeartbeat();
  stopAutosave();
  // Clear reconnect-grace countdown interval to prevent timer leaks
  if (_graceCountdownTimerId) { clearInterval(_graceCountdownTimerId); _graceCountdownTimerId = null; }
  // v0.28: Remove beforeunload protection when the session is torn down
  removeBeforeUnloadProtection();
  if (state.sessionId && state.tabId) {
    releaseLease(state.sessionId, state.tabId);
  }
  state.leaseMode = 'RELEASED';
}

/**
 * Bind lease conflict dialog events.
 */
function bindLeaseConflictEvents(container, sessionId) {
  const readOnlyBtn = container.querySelector('#lease-open-readonly');
  const takeControlBtn = container.querySelector('#lease-take-control');
  const cancelBtn = container.querySelector('#lease-cancel');

  if (readOnlyBtn) readOnlyBtn.onclick = () => {
    state.leaseMode = 'READ_ONLY';
    renderActiveMatch(container);
  };
  if (takeControlBtn) takeControlBtn.onclick = async () => {
    await forceTakeLease(sessionId, state.tabId);
    state.leaseMode = 'CONTROLLED';
    startHeartbeat();
    startAutosave();
    renderActiveMatch(container);
  };
  if (cancelBtn) cancelBtn.onclick = () => {
    teardownSession();
    state.session = null;
    location.hash = '#/';
  };
}

/**
 * Render the active match.
 */
async function renderActiveMatch(container) {
  if (!state.session) {
    location.hash = '#/';
    return;
  }
  if (!container) return; // Guard: heartbeat may fire after navigation away from play
  state.activeContainer = container;

  // Gate 2: Conflict UI — when another tab holds the lease
  if (state.leaseMode === 'CONFLICT' || state.leaseMode === 'LEASE_LOST') {
    const sessionId = state.sessionId || state.session.sessionId || '';
    const leaseInfo = sessionId ? checkLease(sessionId, state.tabId) : { leased: false, holder: null };
    container.innerHTML = `<div class="lease-conflict-modal" role="dialog" aria-modal="true" aria-label="Session conflict">
      <div class="lease-conflict-content">
        <h2>${state.leaseMode === 'LEASE_LOST' ? 'Session taken over' : 'Match active in another tab'}</h2>
        <p>${leaseInfo.leased ? 'Another tab currently controls this match.' : 'This session could not be acquired.'}</p>
        <div class="lease-conflict-actions">
          <button id="lease-open-readonly" class="secondary-button">Open read-only</button>
          <button id="lease-take-control" class="primary-button">Take control</button>
          <button id="lease-cancel" class="text-button">Cancel</button>
        </div>
      </div>
    </div>`;
    bindLeaseConflictEvents(container, sessionId);
    return;
  }

  // Gate 2: Read-only mode — view only, no mutation controls
  if (state.leaseMode === 'READ_ONLY') {
    container.querySelector('.lease-readonly-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'lease-readonly-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<span>Read-only — another tab controls this match.</span>';
    container.prepend(banner);
  }

  // If AI decision is pending, step it
  if (state.session.status === SessionState.AI_DECISION && !state.isAdvancing) {
    state.isAdvancing = true;
    container.innerHTML = '<div class="play-loading">Opponent is thinking...</div>';
    try {
      await state.session.stepAI();
    } catch (error) {
      // Ensure session is in ERROR state for consistent recovery
      if (state.session.status !== SessionState.ERROR) {
        state.session.status = SessionState.ERROR;
        state.session.error = { code: 'AI_STEP_EXCEPTION', message: error.message };
      }
      container.innerHTML = `<div class="play-error" role="alert"><h2>AI error</h2><p>${esc(error.message)}</p><a href="#/" class="secondary-button">Back to Home</a></div>`;
      state.isAdvancing = false;
      return;
    }
    state.isAdvancing = false;
    // Check if another AI decision is needed
    if (state.session.status === SessionState.AI_DECISION) {
      // Use setTimeout to allow UI to update. IRX-M07: Skip delay for reduced motion.
      const delay = state.reducedMotion ? 0 : 300;
      setTimeout(() => renderActiveMatch(container), delay);
      return;
    }
  }

  const snapshot = state.session.getSnapshot();

  // Validate privacy
  const privacyCheck = validateSnapshotPrivacy(snapshot);
  if (!privacyCheck.valid) {
    console.error('Privacy violation in snapshot:', privacyCheck.violations);
  }

  // Generate AI banter from new events
  generateBanterFromEvents(snapshot);

  // Update player stats on terminal
  if (snapshot.status === 'TERMINAL' && state.session && !state.statsRecorded) {
    state.statsRecorded = true;
    updatePlayerStatsOnTerminal(snapshot);
    // v0.28: Remove beforeunload protection when the match reaches terminal state
    removeBeforeUnloadProtection();
    // Academy: mark lesson complete on win
    if (state.academyLessonId) {
      const humanId = snapshot.humanPlayerId ?? 'P1';
      if (snapshot.state?.winner === humanId) {
        markLessonComplete(state.academyLessonId);
        // U7: Advance first-run funnel when tutorial is complete
        completeStep(FunnelStep.TUTORIAL_STARTED);
        advanceToStep(FunnelStep.TUTORIAL_COMPLETE);
      }
    }
    // U7: Advance first-run funnel on first AI win (non-academy match)
    if (!state.academyLessonId && !state.networkSession) {
      const humanId = snapshot.humanPlayerId ?? 'P1';
      if (snapshot.state?.winner === humanId) {
        completeStep(FunnelStep.FIRST_AI_WIN);
        advanceToStep(FunnelStep.ACCOUNT_PROMPT);
      }
    }
  }

  // Build achievement summary HTML for terminal display.
  // finishMatch() clears _matchRuntime on first call, so cache the HTML
  // to persist across re-renders of the terminal screen.
  let achievementSummaryHtml = '';
  if (snapshot.status === 'TERMINAL') {
    if (state._achievementSummaryHtml !== undefined) {
      achievementSummaryHtml = state._achievementSummaryHtml;
    } else {
      try {
        const achRuntime = getAchievementRuntime();
        const presenter = getAchievementPresenter();
        const unlocks = achRuntime.finishMatch();
        if (unlocks && unlocks.length > 0) {
          presenter.queueUnlocks(unlocks);
          achievementSummaryHtml = presenter.buildTerminalSummaryHtml(unlocks);
        }
      } catch (err) { console.warn('[play-app] achievement finalization failed:', err?.message ?? err); }
      state._achievementSummaryHtml = achievementSummaryHtml;
    }
  }

  let boardHtml;
  try {
    const isNetworkMatch = state.networkSession instanceof NetworkPlaySession;
    // v0.28: Add beforeunload protection for active network PvP matches.
    // Removed when the match ends or the session is no longer active.
    if (isNetworkMatch && state.networkSession?.status === NetworkSessionState.RUNNING) {
      addBeforeUnloadProtection();
    } else {
      removeBeforeUnloadProtection();
    }
    boardHtml = renderBoard(snapshot, {
      selectedActionId: state.selectedActionId,
      selectedIntentKey: state.selectedIntentKey,
    selectedSourceCardId: state.selectedSourceCardId,
    selectedTargets: state.selectedTargetIds,
    inspectorCardId: state.inspectorCardId,
    inspectorFaceView: state.inspectorFaceView,
    guidanceMode: state.guidanceMode,
    showKeyboardHelp: state.showKeyboardHelp,
    showRulesHelp: state.showRulesHelp,
    showMatchStats: state.showMatchStats,
    chatMessages: (state.networkSession?.chatMessages ?? state.chatMessages).slice(-30),
    rightRailTab: state.rightRailTab || 'chat',
    soundMuted: state.soundMuted,
    achievementSummaryHtml,
    isNetworkMatch,
    chatHidden: state.networkSession?.chatHidden ?? false,
    chatSplit: state.chatSplit ?? 40,
    viewMode: state.viewMode,
    // IRX-H23: Pass rating data from MATCH_ENDED to the terminal renderer.
    // Extract the current participant's rating data from the array.
    rankResult: (() => {
      if (!isNetworkMatch || !state.networkSession?.rankResult) return null;
      const ratingData = state.networkSession.rankResult;
      if (Array.isArray(ratingData)) {
        const myPid = state.networkSession.participantId;
        const myData = ratingData.find(r => r.participantId === myPid);
        return myData ?? null;
      }
      return ratingData; // Already a single object
    })(),
    // v0.28.0: Pass rematch invite from the opponent to the renderer for the
    // accept/decline overlay.
    rematchInvite: isNetworkMatch ? (state.networkSession?.rematchInvite ?? null) : null,
  });
  } catch (renderError) {
    console.error('renderBoard threw:', renderError);
    container.innerHTML = `<div class="play-error" role="alert">
      <h2>Render error</h2>
      <p>${esc(renderError.message)}</p>
      <pre>${esc(renderError.stack ?? '')}</pre>
      <a href="#/" class="secondary-button">Back to Home</a>
    </div>`;
    return;
  }
  // Phase 4C: Focus preservation during re-renders.
  // The full innerHTML replacement destroys the DOM and any focused element.
  // Save the focused element's selector before replacement, then restore focus
  // after re-binding events. This prevents keyboard users from losing their
  // place during the rapid re-renders of the game loop.
  const _previouslyFocused = document.activeElement;
  let _focusSelector = null;
  if (_previouslyFocused && container.contains(_previouslyFocused)) {
    // Build a selector to find the equivalent element after re-render
    const focused = _previouslyFocused;
    if (focused.dataset && focused.dataset.testid) {
      _focusSelector = `[data-testid="${focused.dataset.testid}"]`;
    } else if (focused.dataset && focused.dataset.grid) {
      _focusSelector = `[data-grid="${focused.dataset.grid}"]`;
    } else if (focused.id) {
      _focusSelector = `#${focused.id}`;
    } else if (focused.getAttribute && focused.getAttribute('role')) {
      const role = focused.getAttribute('role');
      const label = focused.getAttribute('aria-label');
      if (label) {
        _focusSelector = `[role="${role}"][aria-label="${label}"]`;
      } else {
        _focusSelector = `[role="${role}"]`;
      }
    }
  }

  container.innerHTML = boardHtml;

  // Mount particle canvas on the YOUR ACTION frame (or stage fallback)
  if (state.particles && snapshot.status !== 'TERMINAL') {
    const boardEl = container.querySelector('.rd-stage-idle-content')
      || container.querySelector('[data-board]')
      || container.querySelector('.tcg-board');
    if (boardEl) state.particles.mount(boardEl);
  }

  bindBoardEvents(container);
  bindKeyboardShortcuts(container);
  bindVisibilityHandler();
  tickReconnectGraceCountdown(container);

  // Phase 4C: Restore focus after re-render
  if (_focusSelector) {
    const restored = container.querySelector(_focusSelector);
    if (restored && typeof restored.focus === 'function') {
      try { restored.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  // If the Advanced Card Rules View is open, refresh its Current Match
  // section from the new authoritative state (directive §15). If the
  // inspected card is no longer inspectable, the controller sanitizes
  // (closes) the view to avoid leaking stale information.
  if (getOpenIdentity() && state.advancedRulesCardId) {
    import('./advanced-card-rules/advanced-card-rules-controller.mjs?v=73b458295383').then(({ refreshCurrentMatch }) => {
      refreshCurrentMatch(snapshot, state.advancedRulesCardId);
    });
  }
}

/**
 * Bind board events — delegates to board-events.js module.
 * Callbacks are passed so the extracted module can trigger re-renders
 * and access play-app.js internal functions without circular imports.
 */
function bindBoardEvents(container) {
  bindBoardEventsModule(container, {
    renderActiveMatch,
    openAdvancedCardRules,
    startNewMatch,
    stopAutosave,
  });
}

/**
 * Render the replay library.
 */
async function renderReplays(container) {
  const summaries = await listReplaySummaries();
  container.innerHTML = renderReplayLibrary(summaries);
  bindReplayLibraryEvents(container);
}

/**
 * Bind replay library events.
 */
function bindReplayLibraryEvents(container) {
  // Button-level actions (Watch, Export, Delete)
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.dataset.action;
      const replayId = el.dataset.replayId;
      if (action === 'watch-replay') {
        await watchLocalReplay(replayId, container);
      } else if (action === 'export-private') {
        const record = await getReplay(replayId);
        if (record) downloadReplay(record, 'private');
      } else if (action === 'export-public') {
        const record = await getReplay(replayId);
        if (record) downloadReplay(record, 'public');
      } else if (action === 'delete-replay') {
        const confirmed = await showConfirmDialog('Delete replay', `Delete replay ${replayId}? This cannot be undone.`);
        if (confirmed) {
          const { deleteReplay } = await import('./persistence.js?v=73b458295383');
          await deleteReplay(replayId);
          await renderReplays(container);
        }
      }
    });
  });
  // Row-level click — watch the replay (clicking anywhere on the row
  // except the action buttons triggers Watch)
  container.querySelectorAll('[data-watch-replay]').forEach(row => {
    row.addEventListener('click', async () => {
      const replayId = row.dataset.watchReplay;
      await watchLocalReplay(replayId, container);
    });
  });
}

/**
 * Load a local replay from IndexedDB, reconstruct its frames, and
 * navigate to the Observatory Watch workspace for playback.
 */
async function watchLocalReplay(replayId, container) {
  const record = await getReplay(replayId);
  if (!record || !record.certifiedReplay) {
    container.innerHTML = `<div class="play-error" role="alert"><h2>Replay not found</h2><p>Could not load replay ${esc(replayId)}. It may have been deleted.</p><a href="#/play/replays" class="secondary-button">Back to Replays</a></div>`;
    return;
  }
  // Show a loading indicator while frames are reconstructed
  container.innerHTML = '<div class="play-loading">Loading replay…</div>';
  try {
    // Build a replay object the Watch workspace can consume.
    // The certified replay envelope has initialState + commands but no
    // frames array — ensureReplayFrames reconstructs it via the engine.
    const replay = { ...record.certifiedReplay, frames: undefined };
    await ensureReplayFrames(replay);
    if (!replay.frames || replay.frames.length === 0) {
      throw new Error('Frame reconstruction produced no frames');
    }
    // Hand the replay to the Observatory state and navigate to Watch.
    // Setting _replayLoadedFor prevents render() from re-fetching via
    // loadReplay() (which would overwrite our local replay).
    observatoryState.replay = replay;
    observatoryState.authorized = null;
    observatoryState.fixtureId = record.sessionId ?? replayId;
    observatoryState._replayLoadedFor = observatoryState.fixtureId;
    observatoryState.frame = 0;
    observatoryState.playing = false;
    observatoryState.replayKind = 'corpus';
    observatoryState.visibility = 'public';
    location.hash = '#/watch';
  } catch (error) {
    container.innerHTML = `<div class="play-error" role="alert"><h2>Failed to load replay</h2><p>${esc(error.message)}</p><a href="#/play/replays" class="secondary-button">Back to Replays</a></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// v0.24.1: Network Direct Duel — lobby, create, join, match
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the match authority server URL.
 * Delegates to the centralised config module (match-server-config.js).
 * Returns null when unconfigured in production — the lobby must show
 * an "unavailable" state rather than silently falling back to localhost.
 * @returns {string|null}
 */
function getNetworkServerUrl() {
  return getMatchServerUrl();
}

/**
 * Render the network lobby hub — entry point for online Direct Duel.
 * If the match server URL is not configured (production without env var),
 * show an "unavailable" screen instead of silently failing.
 */
async function renderNetworkLobbyHub(container) {
  const serverUrl = getNetworkServerUrl();
  // U7: Advance first-run funnel when player enters online lobby
  completeStep(FunnelStep.ACCOUNT_PROMPT);
  advanceToStep(FunnelStep.FIRST_ONLINE_DUEL);

  // Fail visibly when no match server is configured (production without INTRILEX_MATCH_SERVER_URL)
  if (!serverUrl) {
    container.innerHTML = renderNetworkUnavailable({
      reason: 'configuration-error',
    });
    bindNetworkErrorEvents(container);
    return;
  }

  // Validate URL safety (prevent mixed-content: ws:// from https:// page)
  const validation = validateMatchServerUrl(serverUrl);
  if (!validation.valid) {
    container.innerHTML = renderNetworkUnavailable({
      reason: 'invalid-url',
      detail: validation.reason,
    });
    bindNetworkErrorEvents(container);
    return;
  }

  const savedMatch = NetworkPlaySession.getSavedMatch();
  const hasSavedMatch = !!savedMatch;

  // Check if there's an existing network session already in state
  if (state.networkSession && state.networkSession.matchId) {
    const s = state.networkSession;
    if (s.status === NetworkSessionState.IN_LOBBY || s.status === NetworkSessionState.READY) {
      // Already in a lobby — show the waiting room
      if (s.inviteCode) {
        await renderNetworkCreateWaitingRoom(container);
        return;
      }
      await renderNetworkJoinWaitingRoom(container);
      return;
    }
    if (s.status === NetworkSessionState.RUNNING) {
      location.hash = '#/play/online/match';
      return;
    }
  }

  container.innerHTML = renderNetworkLobby({
    serverUrl,
    hasSavedMatch,
    savedMatchInfo: savedMatch,
    serverReachable: null, // Unknown until we try to connect
  });
  bindNetworkLobbyEvents(container);
}

/**
 * Bind network lobby hub events.
 */
function bindNetworkLobbyEvents(container) {
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      if (action === 'network-create') {
        location.hash = '#/play/online/create';
      } else if (action === 'network-join') {
        location.hash = '#/play/online/join';
      } else if (action === 'network-queue') {
        location.hash = '#/play/online/queue';
      } else if (action === 'network-spectate') {
        location.hash = '#/play/online/spectate';
      } else if (action === 'network-reconnect') {
        await reconnectToSavedMatch(container);
      } else if (action === 'network-abandon') {
        try { localStorage.removeItem('intrilex:network-match'); } catch { /* ignore */ }
        await renderNetworkLobbyHub(container);
      }
    });
  });
}

/**
 * Render the create flow — connects to server, creates a match, shows waiting room.
 */
async function renderNetworkCreateFlow(container) {
  container.innerHTML = '<div class="play-loading">Connecting to authority server…</div>';
  try {
    const serverUrl = getNetworkServerUrl();
    if (!serverUrl) {
      container.innerHTML = renderNetworkUnavailable({ reason: 'configuration-error' });
      bindNetworkErrorEvents(container);
      return;
    }
    const session = new NetworkPlaySession(serverUrl);
    // v2: wire the Supabase access token before connect() so the server's
    // auth gate accepts CREATE_MATCH when authMode='required'.
    session.accessToken = getAccessToken();
    // IRX-H27: Wire token refresh so live matches stay authenticated.
    onTokenRefresh((newToken) => { session.refreshAccessToken(newToken); });
    session.onStateChange = () => {
      // Re-render the waiting room on state changes (opponent connect, ready, etc.)
      const activeContainer = state.activeContainer;
      if (!activeContainer) return;
      if (session.status === NetworkSessionState.RUNNING) {
        state.networkSession = session;
        state.session = session; // Set as active session for board rendering
        location.hash = '#/play/online/match';
        return;
      }
      if (session.status === NetworkSessionState.IN_LOBBY || session.status === NetworkSessionState.READY) {
        renderNetworkCreateWaitingRoom(activeContainer);
      }
    };
    session.onError = (err) => {
      const activeContainer = state.activeContainer;
      if (activeContainer) {
        activeContainer.innerHTML = renderNetworkError({
          title: 'Connection Error',
          message: err.message ?? 'Unknown error',
        });
        bindNetworkErrorEvents(activeContainer);
      }
    };

    await session.connect();
    const result = await session.createDuel('core-unrestricted-authority');
    if (result?.error) {
      container.innerHTML = renderNetworkError({
        title: 'Cannot Create Match',
        message: result.error,
      });
      bindNetworkErrorEvents(container);
      return;
    }
    state.networkSession = session;
    state.activeContainer = container;
    await renderNetworkCreateWaitingRoom(container);
  } catch (error) {
    container.innerHTML = renderNetworkError({
      title: 'Cannot Create Match',
      message: error.message ?? 'Failed to connect to the authority server.',
    });
    bindNetworkErrorEvents(container);
  }
}

/**
 * Render the create waiting room — shows invite code and ready button.
 */
async function renderNetworkCreateWaitingRoom(container) {
  const session = state.networkSession;
  if (!session || !session.inviteCode) {
    location.hash = '#/play/online';
    return;
  }
  state.activeContainer = container;
  container.innerHTML = renderNetworkCreateWaiting(session, { error: session.error });
  bindNetworkWaitingEvents(container);
}

/**
 * Render the join flow — shows the invite code input form.
 */
async function renderNetworkJoinFlow(container) {
  container.innerHTML = renderNetworkJoinForm({});
  bindNetworkJoinFormEvents(container);
}

/**
 * Bind join form events.
 */
function bindNetworkJoinFormEvents(container) {
  const form = container.querySelector('#network-join-form-element');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const inviteCode = (formData.get('inviteCode') ?? '').toString().trim().toUpperCase();
    if (!inviteCode || inviteCode.length < 6 || inviteCode.length > 8) {
      container.innerHTML = renderNetworkJoinForm({ error: 'Invite code must be 6–8 characters.' });
      bindNetworkJoinFormEvents(container);
      return;
    }

    container.innerHTML = renderNetworkJoinForm({ connecting: true });
    bindNetworkJoinFormEvents(container);

    try {
      const serverUrl = getNetworkServerUrl();
      if (!serverUrl) {
        container.innerHTML = renderNetworkUnavailable({ reason: 'configuration-error' });
        bindNetworkErrorEvents(container);
        return;
      }
      const session = new NetworkPlaySession(serverUrl);
      // v2: wire the Supabase access token before connect() so the server's
      // auth gate accepts JOIN_MATCH when authMode='required'.
      session.accessToken = getAccessToken();
      // IRX-H27: Wire token refresh so live matches stay authenticated.
      onTokenRefresh((newToken) => { session.refreshAccessToken(newToken); });
      session.onStateChange = () => {
        const activeContainer = state.activeContainer;
        if (!activeContainer) return;
        if (session.status === NetworkSessionState.RUNNING) {
          state.networkSession = session;
          state.session = session;
          location.hash = '#/play/online/match';
          return;
        }
        if (session.status === NetworkSessionState.IN_LOBBY || session.status === NetworkSessionState.READY) {
          renderNetworkJoinWaitingRoom(activeContainer);
        }
      };
      session.onError = (err) => {
        const activeContainer = state.activeContainer;
        if (activeContainer) {
          activeContainer.innerHTML = renderNetworkError({
            title: 'Join Failed',
            message: err.message ?? 'Unknown error',
          });
          bindNetworkErrorEvents(activeContainer);
        }
      };

      await session.connect();
      const result = await session.joinDuel(inviteCode);
      if (result?.error) {
        container.innerHTML = renderNetworkJoinForm({ error: result.error });
        bindNetworkJoinFormEvents(container);
        return;
      }
      state.networkSession = session;
      state.activeContainer = container;
      await renderNetworkJoinWaitingRoom(container);
    } catch (error) {
      container.innerHTML = renderNetworkJoinForm({ error: error.message ?? 'Failed to join match.' });
      bindNetworkJoinFormEvents(container);
    }
  });
}

/**
 * Render the join waiting room — after joining, before ready.
 */
async function renderNetworkJoinWaitingRoom(container) {
  const session = state.networkSession;
  if (!session || !session.matchId) {
    location.hash = '#/play/online';
    return;
  }
  state.activeContainer = container;
  container.innerHTML = renderNetworkJoinWaiting(session, { error: session.error });
  bindNetworkWaitingEvents(container);
}

/**
 * Bind waiting room events (create or join).
 */
function bindNetworkWaitingEvents(container) {
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      const session = state.networkSession;
      if (!session) return;

      if (action === 'network-ready') {
        try {
          const result = await session.markReady();
          if (result?.error) {
            const activeContainer = state.activeContainer;
            if (activeContainer) {
              if (session.inviteCode) {
                await renderNetworkCreateWaitingRoom(activeContainer);
              } else {
                await renderNetworkJoinWaitingRoom(activeContainer);
              }
            }
            return;
          }
          // Don't re-render the waiting room if the session already transitioned
          // to RUNNING via a MATCH_STARTED broadcast during markReady()
          if (session.status === NetworkSessionState.RUNNING) return;
          const activeContainer = state.activeContainer;
          if (activeContainer) {
            if (session.inviteCode) {
              await renderNetworkCreateWaitingRoom(activeContainer);
            } else {
              await renderNetworkJoinWaitingRoom(activeContainer);
            }
          }
        } catch (error) {
          const activeContainer = state.activeContainer;
          if (activeContainer) {
            if (session.inviteCode) {
              await renderNetworkCreateWaitingRoom(activeContainer);
            } else {
              await renderNetworkJoinWaitingRoom(activeContainer);
            }
          }
          const errEl = activeContainer?.querySelector('[data-testid="network-error"]');
          if (errEl) errEl.textContent = error.message;
        }
      } else if (action === 'network-leave') {
        await session.leave();
        state.networkSession = null;
        state.session = null;
        location.hash = '#/play/online';
      } else if (action === 'network-copy-invite') {
        const code = session.inviteCode ?? '';
        try {
          await navigator.clipboard.writeText(code);
          el.textContent = '✓ Copied';
          // IRX-M07: Reset button text immediately for reduced motion users
          const resetDelay = state.reducedMotion ? 0 : 2000;
          if (resetDelay > 0) {
            setTimeout(() => { el.textContent = 'Copy code'; }, resetDelay);
          } else {
            el.textContent = 'Copy code';
          }
        } catch { /* clipboard may be blocked */ }
      }
    });
  });
}

/**
 * Render the matchmaking queue flow — joins the queue and waits for pairing.
 */
async function renderNetworkQueueFlow(container) {
  const { queueJoin, queueLeave, authenticate } = await import('./network/network-protocol-client.mjs?v=73b458295383');
  const serverUrl = getNetworkServerUrl();
  if (!serverUrl) {
    container.innerHTML = renderNetworkUnavailable({ reason: 'configuration-error' });
    bindNetworkErrorEvents(container);
    return;
  }

  // v2: the server gates QUEUE_JOIN behind AUTHENTICATE when authMode='required'.
  // We must send AUTHENTICATE on open and wait for AUTHENTICATED before queueing.
  const accessToken = getAccessToken();
  if (!accessToken) {
    container.innerHTML = renderNetworkError({
      title: 'Sign In Required',
      message: 'You must sign in before joining the matchmaking queue.',
      canRetry: false,
      signInLink: true,
    });
    bindNetworkErrorEvents(container);
    return;
  }

  // ── Live queue timer ───────────────────────────────────────────
  const queueStartTime = Date.now();
  let queueTimerId = null;
  function startQueueTimer() {
    stopQueueTimer();
    queueTimerId = setInterval(() => {
      const el = container.querySelector('[data-queue-clock-time]');
      if (!el) return;
      const elapsed = Math.floor((Date.now() - queueStartTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
  }
  function stopQueueTimer() {
    if (queueTimerId) { clearInterval(queueTimerId); queueTimerId = null; }
  }

  let matched = false;
  let retryCount = 0;
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 3000;
  let retryTimerId = null;  // stored so we can cancel on close/navigation

  // ── Queue connection lifecycle ────────────────────────────────
  // Encapsulated in a function so we can retry with a fresh WebSocket
  // when the server reports ALREADY_IN_QUEUE (stale entry from a
  // previous connection that hasn't timed out yet).
  function connectAndQueue() {
    const ws = new WebSocket(serverUrl);
    let authenticated = false;
    let abandoned = false;  // set when we intentionally close to retry

    container.innerHTML = renderNetworkQueueWaiting({ position: 1, estimatedWaitMs: 5000 });
    startQueueTimer();

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(authenticate(accessToken)));
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'AUTHENTICATED') {
          authenticated = true;
          ws.send(JSON.stringify(queueJoin('core-unrestricted-authority', 'ranked')));
          return;
        }
        // Auth failure before QUEUE_JOIN — surface a clear sign-in message
        if (!authenticated && msg.type === 'ERROR') {
          container.innerHTML = renderNetworkQueueWaiting({
            error: msg.payload?.message ?? 'Authentication failed. Please sign in again.',
          });
          bindQueueLeaveAction(container, ws, queueLeave);
          return;
        }
        if (msg.type === 'QUEUE_JOINED') {
          retryCount = 0;  // reset retry counter on success
          container.innerHTML = renderNetworkQueueWaiting({
            position: msg.payload.position,
            estimatedWaitMs: msg.payload.estimatedWaitMs,
          });
          bindQueueLeaveAction(container, ws, queueLeave);
        } else if (msg.type === 'QUEUE_MATCHED') {
          matched = true;
          stopQueueTimer();
          // Save the match info and transition to the match
          // Use canonical `url` field (not `serverUrl`) for reconnect-record consistency
          const { matchId, participantToken } = msg.payload;
          try {
            localStorage.setItem('intrilex:network-match', JSON.stringify({
              schemaVersion: 2,
              url: serverUrl,
              matchId, participantToken, savedAt: Date.now(),
            }));
          } catch { /* ignore */ }
          ws.close();
          // Reconnect as a participant via the standard resume flow
          reconnectToSavedMatch(container);
        } else if (msg.type === 'ERROR') {
          const errorCode = msg.payload?.code ?? '';
          const errorMsg = msg.payload?.message ?? 'Queue error';
          // ALREADY_IN_QUEUE: a stale entry from a previous connection is
          // still in the queue (the old connection's heartbeat hasn't timed
          // out yet). Auto-retry with a fresh WebSocket after a short delay.
          // The stale entry will be removed when the old connection's
          // heartbeat times out (typically 30-60s) or when the server is
          // updated with the supersede-stale-entry fix.
          if (errorCode === 'ALREADY_IN_QUEUE' && retryCount < MAX_RETRIES) {
            retryCount++;
            abandoned = true;
            container.innerHTML = renderNetworkQueueWaiting({
              error: `Clearing previous session… retry ${retryCount}/${MAX_RETRIES}`,
            });
            try { ws.close(); } catch { /* ignore */ }
            if (retryTimerId) clearTimeout(retryTimerId);
            retryTimerId = setTimeout(() => {
              retryTimerId = null;
              if (!matched && location.hash === '#/play/online/queue') {
                connectAndQueue();
              }
            }, RETRY_DELAY_MS);
            return;
          }
          container.innerHTML = renderNetworkQueueWaiting({
            error: errorMsg,
          });
          bindQueueLeaveAction(container, ws, queueLeave);
        }
      } catch { /* ignore parse errors */ }
    });

    ws.addEventListener('close', () => {
      if (abandoned) return;  // intentional close for retry — don't navigate away
      stopQueueTimer();
      if (retryTimerId) { clearTimeout(retryTimerId); retryTimerId = null; }
      if (!matched) {
        // If closed without being matched, return to lobby
        // (only if we're still on the queue page)
        if (location.hash === '#/play/online/queue') {
          location.hash = '#/play/online';
        }
      }
    });

    ws.addEventListener('error', () => {
      if (abandoned) return;
      container.innerHTML = renderNetworkQueueWaiting({
        error: 'Connection to server failed. Please try again.',
      });
    });

    // Bind the leave/cancel action
    bindQueueLeaveAction(container, ws, queueLeave);
  }

  connectAndQueue();
}

function bindQueueLeaveAction(container, ws, queueLeave) {
  const leaveBtn = container.querySelector('[data-action="network-queue-leave"]');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      // Send QUEUE_LEAVE so the server removes us from the queue promptly.
      // Guard against queueLeave being undefined (defensive — all callers
      // should pass it, but a missing send must not crash the leave flow).
      if (typeof queueLeave === 'function') {
        try { ws.send(JSON.stringify(queueLeave())); } catch { /* ignore */ }
      }
      try { ws.close(); } catch { /* ignore */ }
      location.hash = '#/play/online';
    });
  }
}

/**
 * Render the spectate flow — enter a Match ID and spectate.
 */
async function renderNetworkSpectateFlow(container) {
  const { spectateMatch, spectateLeave } = await import('./network/network-protocol-client.mjs?v=73b458295383');
  container.innerHTML = renderNetworkSpectateForm({});

  const form = container.querySelector('#network-spectate-form-element');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[name="matchId"]');
    const matchId = input?.value?.trim();
    if (!matchId || matchId.length < 4) {
      container.innerHTML = renderNetworkSpectateForm({ error: 'Please enter a valid Match ID.' });
      return;
    }

    container.innerHTML = renderNetworkSpectateForm({ connecting: true });

    const serverUrl = getNetworkServerUrl();
    if (!serverUrl) {
      container.innerHTML = renderNetworkUnavailable({ reason: 'configuration-error' });
      bindNetworkErrorEvents(container);
      return;
    }
    const ws = new WebSocket(serverUrl);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(spectateMatch(matchId, 'req-spectate-1')));
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SPECTATE_JOINED') {
          container.innerHTML = renderNetworkSpectating({
            matchId,
            view: msg.payload.view,
          });
          // Bind leave action
          const leaveBtn = container.querySelector('[data-action="network-spectate-leave"]');
          if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
              try { ws.send(JSON.stringify(spectateLeave('req-spectate-leave-1'))); } catch { /* ignore */ }
              try { ws.close(); } catch { /* ignore */ }
              location.hash = '#/play/online';
            });
          }
        } else if (msg.type === 'MATCH_VIEW') {
          // Update the spectating view
          container.innerHTML = renderNetworkSpectating({
            matchId,
            view: msg.payload.view,
          });
          const leaveBtn = container.querySelector('[data-action="network-spectate-leave"]');
          if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
              try { ws.send(JSON.stringify(spectateLeave('req-spectate-leave-1'))); } catch { /* ignore */ }
              try { ws.close(); } catch { /* ignore */ }
              location.hash = '#/play/online';
            });
          }
        } else if (msg.type === 'MATCH_ENDED') {
          // Match ended — update view with winner
          container.innerHTML = renderNetworkSpectating({
            matchId,
            view: { status: 'TERMINAL', match: { winner: msg.payload.winner, phase: 'Ended' } },
          });
          const leaveBtn = container.querySelector('[data-action="network-spectate-leave"]');
          if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
              try { ws.close(); } catch { /* ignore */ }
              location.hash = '#/play/online';
            });
          }
        } else if (msg.type === 'ERROR') {
          container.innerHTML = renderNetworkSpectateForm({
            error: msg.payload.message ?? 'Failed to spectate match.',
          });
          try { ws.close(); } catch { /* ignore */ }
        }
      } catch { /* ignore parse errors */ }
    });

    ws.addEventListener('error', () => {
      container.innerHTML = renderNetworkSpectateForm({
        error: 'Connection to server failed. Please try again.',
      });
    });
  });
}

/**
 * Render the active network match — uses the existing board renderer.
 * Installs a durable subscription so opponent actions update live.
 */
async function renderNetworkActiveMatch(container) {
  const session = state.networkSession;
  // Reset network achievement state when entering a non-terminal session
  if (session && session.status !== NetworkSessionState.TERMINAL) {
    state._networkAchievementsApplied = false;
  }
  if (!session) {
    // Try reconnecting from saved info
    const saved = NetworkPlaySession.getSavedMatch();
    if (saved) {
      await reconnectToSavedMatch(container);
      return;
    }
    location.hash = '#/play/online';
    return;
  }

  if (session.status === NetworkSessionState.DISCONNECTED && session.matchId) {
    // Connection dropped — show reconnect dialog
    container.innerHTML = renderNetworkReconnectDialog({
      matchId: session.matchId,
      canReconnect: true,
    });
    bindNetworkReconnectEvents(container);
    return;
  }

  if (session.status === NetworkSessionState.IN_LOBBY || session.status === NetworkSessionState.READY) {
    // Match hasn't started yet — show waiting room
    if (session.inviteCode) {
      await renderNetworkCreateWaitingRoom(container);
    } else {
      await renderNetworkJoinWaitingRoom(container);
    }
    return;
  }

  if (session.status === NetworkSessionState.TERMINAL) {
    // Match ended — show terminal state via board renderer
    // Apply server-authoritative achievement unlocks if available
    if (session.achievementUnlocks && session.achievementUnlocks.length > 0 && !state._networkAchievementsApplied) {
      state._networkAchievementsApplied = true;
      try {
        const achRuntime = getAchievementRuntime();
        const presenter = getAchievementPresenter();
        const newUnlocks = achRuntime.applyServerUnlocks(session.achievementUnlocks, session.achievementProgressUpdates || {});
        if (newUnlocks.length > 0) {
          presenter.queueUnlocks(newUnlocks);
        }
      } catch (err) { console.warn('[play-app] achievement merge failed:', err?.message ?? err); }
    }
  }

  state.session = session; // Make board-events.js use the network session
  state.activeContainer = container;

  // Install durable subscription for live opponent updates.
  // This re-renders the board whenever the server pushes a MATCH_VIEW
  // (e.g., opponent acted). Prevents duplicate listeners by checking
  // that the callback isn't already wired to this container.
  const currentOnStateChange = session.onStateChange;
  if (!currentOnStateChange || !currentOnStateChange._isNetworkBoardSubscription) {
    const boardSubscription = () => {
      // Don't re-render if we've navigated away or the session was replaced
      if (state.networkSession !== session) return;
      if (state.activeContainer !== container) return;
      // If the session transitioned to TERMINAL, apply server achievements
      if (session.status === NetworkSessionState.TERMINAL) {
        // v0.28: Remove beforeunload protection — match is no longer active
        removeBeforeUnloadProtection();
        if (session.achievementUnlocks && session.achievementUnlocks.length > 0 && !state._networkAchievementsApplied) {
          state._networkAchievementsApplied = true;
          try {
            const achRuntime = getAchievementRuntime();
            const presenter = getAchievementPresenter();
            const newUnlocks = achRuntime.applyServerUnlocks(session.achievementUnlocks, session.achievementProgressUpdates || {});
            if (newUnlocks.length > 0) {
              presenter.queueUnlocks(newUnlocks);
            }
          } catch (err) { console.warn('[play-app] achievement merge failed:', err?.message ?? err); }
        }
      }
      // Re-render the board with the latest authoritative view
      renderActiveMatch(container);
    };
    boardSubscription._isNetworkBoardSubscription = true;
    session.onStateChange = boardSubscription;
  }

  await renderActiveMatch(container);
}

/**
 * Bind reconnect dialog events.
 */
function bindNetworkReconnectEvents(container) {
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      const session = state.networkSession;
      if (action === 'network-reconnect-now') {
        if (!session) return;
        container.innerHTML = '<div class="play-loading">Reconnecting…</div>';
        try {
          await session.connect();
          await session.reconnect();
          location.hash = '#/play/online/match';
        } catch (error) {
          container.innerHTML = renderNetworkReconnectDialog({
            matchId: session.matchId,
            canReconnect: true,
          });
          bindNetworkReconnectEvents(container);
        }
      } else if (action === 'network-forfeit') {
        if (session) {
          try { await session.leave(); } catch { /* ignore */ }
          state.networkSession = null;
          state.session = null;
        }
        location.hash = '#/play/online';
      }
    });
  });
}

/**
 * Reconnect to a saved match from localStorage.
 */
async function reconnectToSavedMatch(container) {
  const saved = NetworkPlaySession.getSavedMatch();
  if (!saved) {
    await renderNetworkLobbyHub(container);
    return;
  }
  container.innerHTML = '<div class="play-loading">Reconnecting to match…</div>';
  try {
    const session = new NetworkPlaySession(saved.url);
    // v2: wire the Supabase access token before connect() so the server's
    // auth gate accepts RESUME_MATCH when authMode='required'.
    session.accessToken = getAccessToken();
    // IRX-H27: Wire token refresh so live matches stay authenticated.
    onTokenRefresh((newToken) => { session.refreshAccessToken(newToken); });
    // Restore match identity from the saved record — reconnect() guards on
    // these being set and uses them to build the RESUME_MATCH payload.
    session.matchId = saved.matchId;
    session.participantToken = saved.participantToken;
    if (saved.playerId) session.playerId = saved.playerId;
    if (saved.inviteCode) session.inviteCode = saved.inviteCode;
    session.onStateChange = () => {
      const activeContainer = state.activeContainer;
      if (!activeContainer) return;
      if (session.status === NetworkSessionState.RUNNING) {
        state.networkSession = session;
        state.session = session;
        location.hash = '#/play/online/match';
        return;
      }
      if (session.status === NetworkSessionState.IN_LOBBY || session.status === NetworkSessionState.READY) {
        if (session.inviteCode) {
          renderNetworkCreateWaitingRoom(activeContainer);
        } else {
          renderNetworkJoinWaitingRoom(activeContainer);
        }
      }
    };
    session.onError = (err) => {
      const activeContainer = state.activeContainer;
      if (activeContainer) {
        activeContainer.innerHTML = renderNetworkError({
          title: 'Reconnect Failed',
          message: err.message ?? 'Unknown error',
        });
        bindNetworkErrorEvents(activeContainer);
      }
    };

    await session.connect();
    await session.reconnect();
    state.networkSession = session;
    state.activeContainer = container;

    if (session.status === NetworkSessionState.RUNNING) {
      state.session = session;
      location.hash = '#/play/online/match';
    } else if (session.status === NetworkSessionState.IN_LOBBY || session.status === NetworkSessionState.READY) {
      if (session.inviteCode) {
        await renderNetworkCreateWaitingRoom(container);
      } else {
        await renderNetworkJoinWaitingRoom(container);
      }
    } else if (session.status === NetworkSessionState.RECONNECTING) {
      // Still reconnecting — the onStateChange callback will handle the
      // transition when the server response arrives. Don't navigate to
      // the match page (which would show a stuck "Reconnecting…" screen).
      // Show the waiting room instead — it's the correct destination for
      // a READY_CHECK match, and the state change callback will re-render
      // if the match is already RUNNING.
      if (session.inviteCode) {
        await renderNetworkCreateWaitingRoom(container);
      } else {
        await renderNetworkJoinWaitingRoom(container);
      }
    } else if (session.status === NetworkSessionState.ERROR) {
      // Reconnect failed — show the error, don't navigate to match page
      container.innerHTML = renderNetworkError({
        title: 'Reconnect Failed',
        message: session.error ?? 'Could not reconnect to the match.',
      });
      bindNetworkErrorEvents(container);
    } else {
      location.hash = '#/play/online/match';
    }
  } catch (error) {
    try { localStorage.removeItem('intrilex:network-match'); } catch { /* ignore */ }
    container.innerHTML = renderNetworkError({
      title: 'Reconnect Failed',
      message: error.message ?? 'Could not reconnect to the match.',
    });
    bindNetworkErrorEvents(container);
  }
}

/**
 * Bind network error screen events.
 */
function bindNetworkErrorEvents(container) {
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      if (action === 'network-retry') {
        const hash = location.hash;
        if (hash.includes('/create')) {
          await renderNetworkCreateFlow(container);
        } else if (hash.includes('/join')) {
          await renderNetworkJoinFlow(container);
        } else {
          await renderNetworkLobbyHub(container);
        }
      }
    });
  });
}

/**
 * Start the autosave timer.
 */
let _autosaveInFlight = false;
function startAutosave() {
  stopAutosave();
  state.autosaveTimer = setInterval(async () => {
    if (_autosaveInFlight) return;  // Guard: skip if previous save still running
    if (state.session && state.session.status !== SessionState.TERMINAL) {
      _autosaveInFlight = true;
      try {
        const envelope = state.session.getSaveEnvelope();
        // Override saveId for autosave and recompute content hash
        envelope.saveId = `AUTOSAVE-${state.session.sessionId}`;
        // Recompute content hash after saveId changes
        envelope.contentHash = buildSaveIntegrityPayload(envelope);
        await putSave(envelope);
      } catch (error) {
        console.warn('Autosave failed:', error.message);
      } finally {
        _autosaveInFlight = false;
      }
    }
  }, 5000);
}

/**
 * Stop the autosave timer.
 */
function stopAutosave() {
  if (state.autosaveTimer) {
    clearInterval(state.autosaveTimer);
    state.autosaveTimer = null;
  }
}

/**
 * Clean up the play module.
 */
export function cleanupPlay() {
  stopAutosave();
  removeKeyboardShortcuts();
  removeVisibilityHandler();
  if (state.sound) { state.sound.destroy(); state.sound = null; }
  if (state.particles) { state.particles.destroy(); state.particles = null; }
  state.session = null;
  state.selectedActionId = null;
  state.selectedSourceCardId = null;
  state.selectedTargetIds = [];
  state.inspectorCardId = null;
  state.inspectorFaceView = 'board';
  state.chatMessages = [];
  state.lastEventCount = 0;
  state.soundInitialized = false;
  state.prevHandCount = 0;
  state.activeContainer = null;
  state.statsRecorded = false;
}

/**
 * v0.17.0: Bind keyboard shortcuts for the play board.
 * Shortcuts: P=pass, I=inspector, R=stack, ?=help, Escape=cancel
 */
function bindKeyboardShortcuts(container) {
  removeKeyboardShortcuts();
  state.keyboardHandler = (e) => {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();
    if (key === 'p') {
      e.preventDefault();
      handlePassShortcut(container);
    } else if (key === 'i') {
      e.preventDefault();
      handleInspectorShortcut(container);
    } else if (key === 'a') {
      e.preventDefault();
      handleAdvancedRulesShortcut(container);
    } else if (key === 'r') {
      e.preventDefault();
      handleStackShortcut(container);
    } else if (key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      handleHelpShortcut(container);
    } else if (key === 'escape') {
      e.preventDefault();
      handleEscapeShortcut(container);
    } else if (key === 'enter') {
      // v0.19.0: Enter-to-confirm — natural UX for card game players
      e.preventDefault();
      handleEnterShortcut(container);
    }
  };
  document.addEventListener('keydown', state.keyboardHandler);
}

/**
 * Remove keyboard shortcuts.
 */
function removeKeyboardShortcuts() {
  if (state.keyboardHandler) {
    document.removeEventListener('keydown', state.keyboardHandler);
    state.keyboardHandler = null;
  }
}

/**
 * Phase 6: Bind visibility change handler to suspend/resume sound.
 */
function bindVisibilityHandler() {
  removeVisibilityHandler();
  state.visibilityHandler = () => {
    if (document.hidden) {
      state.sound?.suspend();
    } else {
      state.sound?.resume();
    }
  };
  document.addEventListener('visibilitychange', state.visibilityHandler);
}

/**
 * Phase 6: Remove visibility change handler.
 */
function removeVisibilityHandler() {
  if (state.visibilityHandler) {
    document.removeEventListener('visibilitychange', state.visibilityHandler);
    state.visibilityHandler = null;
  }
}

/**
 * Open the Advanced Card Rules View (card codex / rules dossier).
 * Honors the hidden-info firewall: a face-down or non-inspectable card
 * is never opened. Builds the CURRENT MATCH section from the
 * authoritative legal-action contract. Informational only — never
 * mutates game state.
 *
 * @param {string} identity - Card identity (e.g. "7♥")
 * @param {string} [cardId] - Entity id for current-match legality
 * @returns {boolean} true if opened
 */
function openAdvancedCardRules(identity, cardId) {
  if (!identity) return false;
  const snapshot = state.session?.getSnapshot();
  // Hidden-info firewall: verify the card is inspectable before opening.
  if (cardId && snapshot && !isCardInspectable(snapshot, cardId)) return false;
  const currentMatch = cardId && snapshot ? buildCurrentMatchContext(snapshot, cardId, identity) : null;
  const opened = openAdvancedCardRulesController(identity, {
    currentMatch,
    onClose: () => { state.advancedRulesCardId = null; },
  });
  if (opened) state.advancedRulesCardId = cardId ?? null;
  return opened;
}

/**
 * Handle P key — pass priority (decline response or exhausted pass).
 */
function handlePassShortcut(container) {
  if (!state.session) return;
  // Network sessions use NetworkSessionState.RUNNING internally
  const isHumanTurn = state.networkSession
    ? state.networkSession.isAwaitingHumanAction()
    : state.session.status === SessionState.HUMAN_DECISION;
  if (!isHumanTurn) return;
  const snapshot = state.session.getSnapshot();
  const actions = snapshot?.decision?.legalActions ?? [];
  const passAction = actions.find(a => a.isDecline) ?? actions.find(a => a.isExhaustedPass);
  if (passAction) {
    state.selectedActionId = passAction.actionId;
    renderActiveMatch(container);
    // Auto-confirm pass actions
    const confirmBtn = container.querySelector('[data-testid="confirm-action"]');
    if (confirmBtn) confirmBtn.click();
  }
}

/**
 * Handle I key — open inspector for selected card.
 */
function handleInspectorShortcut(container) {
  if (state.selectedSourceCardId) {
    state.inspectorCardId = state.inspectorCardId === state.selectedSourceCardId ? null : state.selectedSourceCardId;
    renderActiveMatch(container);
  }
}

/**
 * Handle A key — open Advanced Card Rules View for the selected or
 * inspected card. Falls back to the selected source card. Honors the
 * hidden-info firewall (openAdvancedCardRules verifies inspectability).
 */
function handleAdvancedRulesShortcut(container) {
  const cardId = state.inspectorCardId ?? state.selectedSourceCardId;
  if (!cardId) return;
  const snapshot = state.session?.getSnapshot();
  if (!snapshot) return;
  const found = snapshot.playerView?.own?.hand?.find(c => (c.entityId ?? c.id) === cardId)
    ?? snapshot.playerView?.own?.pointRow?.find(c => (c.entityId ?? c.id) === cardId)
    ?? snapshot.playerView?.own?.enduringRow?.find(c => (c.entityId ?? c.id) === cardId);
  const identity = found?.identity;
  if (!identity) return;
  openAdvancedCardRules(identity, cardId);
}

/**
 * Handle R key — toggle stack details.
 */
function handleStackShortcut(container) {
  const stackDetails = container.querySelector('.stack-area details, details.stack-details');
  if (stackDetails) {
    stackDetails.open = !stackDetails.open;
  }
}

/**
 * Handle ? key — open contextual help.
 */
function handleHelpShortcut(container) {
  state.showKeyboardHelp = !state.showKeyboardHelp;
  renderActiveMatch(container);
}

/**
 * Handle Escape key — close Advanced View, cancel selection or close inspector.
 */
function handleEscapeShortcut(container) {
  if (getOpenIdentity()) {
    closeAdvancedCardRules();
    return;
  }
  if (state.showKeyboardHelp) {
    state.showKeyboardHelp = false;
    renderActiveMatch(container);
  } else if (state.showRulesHelp) {
    state.showRulesHelp = false;
    renderActiveMatch(container);
  } else if (state.showMatchStats) {
    state.showMatchStats = false;
    renderActiveMatch(container);
  } else if (state.inspectorCardId) {
    state.inspectorCardId = null;
    state.inspectorFaceView = 'board';
    renderActiveMatch(container);
  } else if (state.selectedActionId) {
    state.selectedActionId = null;
    state.selectedTargetIds = [];
    renderActiveMatch(container);
  } else if (state.selectedSourceCardId) {
    state.selectedSourceCardId = null;
    renderActiveMatch(container);
  }
}

/**
 * v0.19.0: Handle Enter key — confirm the selected action.
 */
function handleEnterShortcut(container) {
  if (!state.session) return;
  // Network sessions use NetworkSessionState.RUNNING internally
  const isHumanTurn = state.networkSession
    ? state.networkSession.isAwaitingHumanAction()
    : state.session.status === SessionState.HUMAN_DECISION;
  if (!isHumanTurn) return;
  if (!state.selectedActionId) return;
  const confirmBtn = container.querySelector('[data-testid="confirm-action"]');
  if (confirmBtn) confirmBtn.click();
}

/**
 * v0.19.0: Generate AI banter messages from new game events.
 * Triggers contextual personality-flavored messages on score, counter, super declaration.
 */
function generateBanterFromEvents(snapshot) {
  if (!state.session) return;
  // IRX-H22: Never generate AI banter for PvP (network) sessions.
  // In PvP, the opponent is a human — inventing AI personality/banter
  // is deceptive and corrupts the chat identity.
  if (state.networkSession) return;
  const events = snapshot.recentEvents ?? [];
  const currentEventCount = events.length;
  if (currentEventCount <= state.lastEventCount) return;

  const archetype = snapshot.opponent?.archetype ?? '';
  const policyId = snapshot.opponent?.policyId ?? '';
  const newEvents = events.slice(state.lastEventCount);
  state.lastEventCount = currentEventCount;

  for (const evt of newEvents) {
    const banter = getAiBanter(evt, archetype, policyId);
    if (banter) {
      state.chatMessages.push({
        author: 'opponent',
        text: banter,
        time: new Date().toLocaleTimeString(),
      });
    }
    // Phase 6: Sound + particle triggers from game events
    const eventType = (evt.type ?? '').toLowerCase();
    const isAiEvent = evt.controllerId && evt.controllerId !== snapshot.human?.playerId;
    if (eventType.includes('score') || eventType.includes('point')) {
      if (state.sound) state.sound.playCardPlay(null);
    } else if (eventType.includes('counter') || eventType.includes('disrupt') || eventType.includes('interrupt')) {
      if (state.sound) state.sound.playStackResolve();
      if (state.particles) {
        const boardEl = document.querySelector('[data-board]') || document.querySelector('.tcg-board');
        if (boardEl) {
          const rect = boardEl.getBoundingClientRect();
          state.particles.sparkle(rect.width / 2, rect.height / 2, 8);
        }
      }
    } else if (eventType.includes('super') || eventType.includes('ultra')) {
      if (state.sound) state.sound.playAiAction();
    } else if (isAiEvent && state.sound && eventType.includes('action')) {
      // Generic AI action catch-all — only fires when no specific branch above matched,
      // avoiding double-play of playAiAction() for events like "super-action".
      state.sound.playAiAction();
    }
  }

  // Phase 6: Card draw sound — detect new card in hand
  const currentHandCount = snapshot.playerView?.own?.hand?.length ?? 0;
  if (currentHandCount > state.prevHandCount && state.sound) {
    state.sound.playCardDraw();
  }
  state.prevHandCount = currentHandCount;
}

/**
 * v0.19.0: Update persistent player stats when a match reaches terminal state.
 */
async function updatePlayerStatsOnTerminal(snapshot) {
  if (!state.session) return;
  try {
    const humanStats = snapshot.humanStats ?? {};
    await updatePlayerStats({
      winner: snapshot.match?.winner ?? null,
      humanPlayerId: snapshot.human?.playerId,
      profileId: snapshot.profileId,
      aiPolicyId: snapshot.opponent?.policyId,
      aiDifficulty: snapshot.opponent?.difficulty ?? 'normal',
      supersDeclared: humanStats.supersDeclared ?? 0,
      totalDecisions: state.session.decisionJournal?.length ?? 0,
      securedPoints: humanStats.securedPoints ?? 0,
    });
  } catch (error) {
    console.warn('Failed to update player stats:', error.message);
  }
  // Phase 6: Terminal sound + particles
  const winner = snapshot.match?.winner;
  const isHumanWinner = winner === snapshot.human?.playerId;
  if (state.sound) {
    if (winner && isHumanWinner) state.sound.playVictory();
    else if (winner && !isHumanWinner) state.sound.playDefeat();
  }
  if (state.particles && isHumanWinner) {
    state.particles.confetti(3000);
  }
  // Achievement finalization (finishMatch + terminal summary) is handled
  // in renderActiveMatch when the terminal snapshot is rendered, so that
  // the summary HTML can be injected into the terminal screen.
}

/**
 * Show a custom confirm dialog (replaces native confirm()).
 * Returns a Promise that resolves to true (confirm) or false (cancel).
 * Includes focus management, Escape-to-cancel, and click-outside-to-cancel.
 * @param {string} title - Dialog heading
 * @param {string} message - Dialog body text
 * @returns {Promise<boolean>}
 */
function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    // Phase 4B: Save previously focused element for focus restoration
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `<div class="confirm-dialog">
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      <div class="confirm-dialog-actions">
        <button class="text-button" data-testid="confirm-cancel">Cancel</button>
        <button class="primary-button" data-testid="confirm-ok">Confirm</button>
      </div>
    </div>`;

    let resolved = false;
    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      // Phase 4B: Restore focus to the element that had it before the dialog opened
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    };
    const done = (result) => { if (resolved) return; resolved = true; cleanup(); resolve(result); };

    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); done(true); }
      // Phase 4B: Focus trap — Tab/Shift+Tab cycles within the dialog
      else if (e.key === 'Tab') {
        const focusable = overlay.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
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
    };
    document.addEventListener('keydown', keyHandler);

    overlay.querySelector('[data-testid="confirm-cancel"]').addEventListener('click', () => done(false));
    overlay.querySelector('[data-testid="confirm-ok"]').addEventListener('click', () => done(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });

    document.body.appendChild(overlay);
    overlay.querySelector('[data-testid="confirm-ok"]').focus();
  });
}

/**
 * Get the current session (for testing).
 */
export function getSession() {
  return state.session;
}
