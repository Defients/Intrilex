// ═══════════════════════════════════════════════════════════════
// play-app.js — Play module UI controller
// Manages session lifecycle, DOM events, and rendering.
// Never owns authoritative state — delegates to PlaySession.
// ═══════════════════════════════════════════════════════════════

import { createSession, restoreSession, SessionState } from './play-controller.js';
import { renderBoard, renderPlayHub, renderNewMatchSetup } from './ranked-duel-renderer.mjs';
import { renderReplayLibrary, listReplaySummaries, downloadReplay } from './replay-library.js';
import { getSave, listSaves, putSave, isIndexedDBAvailable, getPreference, getPlayerStats, updatePlayerStats } from './persistence.js';
import { getTutorialSetup, TutorialRuntime } from './tutorial-runtime.js';
import { validateSnapshotPrivacy } from './play-privacy.js';
import { POLICY_IDS } from '../autonomy-runtime.js';
import { GuidanceMode } from './intelligence/action-explanation.js';
import './orchestration/declaration-flow.js';
import './state/play-lifecycle.js';
import { acquireLease, releaseLease, checkLease, forceTakeLease, generateTabId } from './state/session-lease.js';
import { getAiBanter } from './ai-personality.js';
import { SoundEngine } from './play-sound.js';
import { ParticleSystem } from './play-particles.js';
import { state } from './play-state.js';
import { bindBoardEvents as bindBoardEventsModule } from './board-events.js';
import { NetworkPlaySession, NetworkSessionState } from './network/network-session.mjs';
import {
  renderNetworkLobby, renderNetworkCreateWaiting, renderNetworkJoinForm,
  renderNetworkQueueWaiting, renderNetworkSpectateForm, renderNetworkSpectating,
  renderNetworkMatchHistory,
  renderNetworkJoinWaiting, renderNetworkReconnectDialog, renderNetworkError,
  renderNetworkStatusBanner,
} from './network/network-lobby-renderer.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  if (sub === '' || sub === '/') {
    await renderHub(container);
  } else if (sub === '/new') {
    await renderNewMatch(container);
  } else if (sub === '/tutorial') {
    await startTutorial(container);
  } else if (sub === '/match') {
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
  } else if (sub === '/online/history') {
    await renderNetworkHistoryFlow(container);
  } else if (sub === '/online/match') {
    await renderNetworkActiveMatch(container);
  } else {
    await renderHub(container);
  }
}

/**
 * Render the Play hub.
 */
async function renderHub(container) {
  const idbAvailable = isIndexedDBAvailable();
  let continueSave = null;
  let playerStats = null;
  if (idbAvailable) {
    const saves = await listSaves();
    continueSave = saves.find(s => s.stableBoundary?.decisionFrameHash) ?? saves[0] ?? null;
    playerStats = await getPlayerStats();
  }
  container.innerHTML = renderPlayHub(continueSave ? {
    saveId: continueSave.saveId,
    profileId: continueSave.profileId,
    mode: continueSave.mode,
  } : null, { idbAvailable, playerStats });
  bindHubEvents(container);
}

/**
 * Bind hub events.
 */
function bindHubEvents(container) {
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async (e) => {
      const action = el.dataset.action;
      if (action === 'start-tutorial') location.hash = '#/play/tutorial';
      else if (action === 'new-game') location.hash = '#/play/new';
      else if (action === 'replay-library') location.hash = '#/play/replays';
      else if (action === 'online-duel') location.hash = '#/play/online';
      else if (action === 'continue-match') {
        const saveId = el.dataset.saveId;
        await continueMatch(saveId, container);
      }
    });
  });
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
  container.innerHTML = renderNewMatchSetup(catalog);
  bindNewMatchForm(container);
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
 * Start the tutorial.
 */
async function startTutorial(container) {
  state.tutorial = new TutorialRuntime();
  const setup = getTutorialSetup();
  await startNewMatch(setup, container);
}

/**
 * Start a new match.
 */
async function startNewMatch(setup, container) {
  state.session = null;
  state.selectedActionId = null;
  state.selectedSourceCardId = null;
  state.selectedTargetIds = [];
  state.inspectorCardId = null;
  state.inspectorFaceView = 'board';
  state.leaseMode = 'UNCLAIMED';
  state.chatMessages = [];
  state.rightRailTab = 'chat';
  state.lastEventCount = 0;
  state.statsRecorded = false;
  container.innerHTML = '<div class="play-loading">Creating match...</div>';
  try {
    state.session = await createSession(setup);
    state.sessionId = state.session.sessionId;
    state.tabId = state.tabId || generateTabId();
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
    container.innerHTML = `<div class="play-error" role="alert"><h2>Failed to start match</h2><p>${esc(error.message)}</p><a href="#/play" class="secondary-button">Back to Play</a></div>`;
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
    if (save.tutorial) {
      state.tutorial = new TutorialRuntime();
      state.tutorial.restore(save.tutorial);
    }
    startAutosave();
    location.hash = '#/play/match';
    await renderActiveMatch(container);
  } catch (error) {
    container.innerHTML = `<div class="play-error" role="alert"><h2>Failed to resume match</h2><p>${esc(error.message)}</p><a href="#/play" class="secondary-button">Back to Play</a></div>`;
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
    location.hash = '#/play';
  };
}

/**
 * Render the active match.
 */
async function renderActiveMatch(container) {
  if (!state.session) {
    location.hash = '#/play';
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
      container.innerHTML = `<div class="play-error" role="alert"><h2>AI error</h2><p>${esc(error.message)}</p><a href="#/play" class="secondary-button">Back to Play</a></div>`;
      state.isAdvancing = false;
      return;
    }
    state.isAdvancing = false;
    // Check if another AI decision is needed
    if (state.session.status === SessionState.AI_DECISION) {
      // Use setTimeout to allow UI to update
      setTimeout(() => renderActiveMatch(container), 300);
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
  }


  const tutorialState = state.tutorial && !state.tutorial.isComplete ? {
    currentChapter: state.tutorial.currentChapter,
    completedChapters: state.tutorial.completedChapters,
    chapterCount: state.tutorial.chapterCount,
    isComplete: state.tutorial.isComplete,
    skipped: state.tutorial.skipped,
    recommendedFamily: state.tutorial.recommendedFamily,
    recommendedAltFamily: state.tutorial.recommendedAltFamily,
  } : null;

  container.innerHTML = renderBoard(snapshot, {
    selectedActionId: state.selectedActionId,
    selectedSourceCardId: state.selectedSourceCardId,
    selectedTargets: state.selectedTargetIds,
    inspectorCardId: state.inspectorCardId,
    inspectorFaceView: state.inspectorFaceView,
    guidanceMode: state.guidanceMode,
    showKeyboardHelp: state.showKeyboardHelp,
    tutorial: tutorialState,
    chatMessages: state.chatMessages.slice(-20),
    rightRailTab: state.rightRailTab || 'chat',
    soundMuted: state.soundMuted,
    isNetworkMatch: !!(state.networkSession && state.networkSession.constructor?.name === 'NetworkPlaySession'),
    isTutorial: !!(state.tutorial && !state.tutorial.isComplete),
  });

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
}

/**
 * Bind board events — delegates to board-events.js module.
 * Callbacks are passed so the extracted module can trigger re-renders
 * and access play-app.js internal functions without circular imports.
 */
function bindBoardEvents(container) {
  bindBoardEventsModule(container, {
    renderActiveMatch,
    showHoverPopover,
    hideHoverPopover,
    openCardFaceDialog,
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
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      const replayId = el.dataset.replayId;
      if (action === 'watch-replay') {
        // For now, redirect to the main replay viewer
        location.hash = `#/replays`;
      } else if (action === 'export-private') {
        const { getReplay } = await import('./persistence.js');
        const record = await getReplay(replayId);
        if (record) downloadReplay(record, 'private');
      } else if (action === 'export-public') {
        const { getReplay } = await import('./persistence.js');
        const record = await getReplay(replayId);
        if (record) downloadReplay(record, 'public');
      } else if (action === 'delete-replay') {
        const confirmed = await showConfirmDialog('Delete replay', `Delete replay ${replayId}? This cannot be undone.`);
        if (confirmed) {
          const { deleteReplay } = await import('./persistence.js');
          await deleteReplay(replayId);
          await renderReplays(container);
        }
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// v0.24.1: Network Direct Duel — lobby, create, join, match
// ═══════════════════════════════════════════════════════════════

/**
 * Default match authority server URL.
 * Can be overridden via localStorage 'intrilex:network-server-url'.
 */
function getNetworkServerUrl() {
  try {
    const saved = localStorage.getItem('intrilex:network-server-url');
    if (saved) return saved;
  } catch { /* ignore */ }
  // Default: same host as the page, port 3099, ws:// for localhost
  const loc = location;
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    return `ws://${loc.hostname}:3099`;
  }
  return `wss://${loc.hostname}:3099`;
}

/**
 * Render the network lobby hub — entry point for online Direct Duel.
 */
async function renderNetworkLobbyHub(container) {
  const serverUrl = getNetworkServerUrl();
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
      } else if (action === 'network-history') {
        location.hash = '#/play/online/history';
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
    const session = new NetworkPlaySession(serverUrl);
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
      const session = new NetworkPlaySession(serverUrl);
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
          setTimeout(() => { el.textContent = 'Copy code'; }, 2000);
        } catch { /* clipboard may be blocked */ }
      }
    });
  });
}

/**
 * Render the matchmaking queue flow — joins the queue and waits for pairing.
 */
async function renderNetworkQueueFlow(container) {
  const { queueJoin, queueLeave } = await import('./network/network-protocol-client.mjs');
  const serverUrl = getNetworkServerUrl();
  const ws = new WebSocket(serverUrl);

  container.innerHTML = renderNetworkQueueWaiting({ position: 1, estimatedWaitMs: 5000 });

  let matched = false;

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify(queueJoin('core-unrestricted-authority', 'req-queue-1')));
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'QUEUE_JOINED') {
        container.innerHTML = renderNetworkQueueWaiting({
          position: msg.payload.position,
          estimatedWaitMs: msg.payload.estimatedWaitMs,
        });
        bindQueueLeaveAction(container, ws);
      } else if (msg.type === 'QUEUE_MATCHED') {
        matched = true;
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
        container.innerHTML = renderNetworkQueueWaiting({
          error: msg.payload.message ?? 'Queue error',
        });
        bindQueueLeaveAction(container, ws);
      }
    } catch { /* ignore parse errors */ }
  });

  ws.addEventListener('close', () => {
    if (!matched) {
      // If closed without being matched, return to lobby
      // (only if we're still on the queue page)
      if (location.hash === '#/play/online/queue') {
        location.hash = '#/play/online';
      }
    }
  });

  ws.addEventListener('error', () => {
    container.innerHTML = renderNetworkQueueWaiting({
      error: 'Connection to server failed. Please try again.',
    });
  });

  // Bind the leave/cancel action
  bindQueueLeaveAction(container, ws, queueLeave);
}

function bindQueueLeaveAction(container, ws, queueLeave) {
  const leaveBtn = container.querySelector('[data-action="network-queue-leave"]');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      try { ws.send(JSON.stringify(queueLeave('req-queue-leave-1'))); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
      location.hash = '#/play/online';
    });
  }
}

/**
 * Render the spectate flow — enter a Match ID and spectate.
 */
async function renderNetworkSpectateFlow(container) {
  const { spectateMatch, spectateLeave } = await import('./network/network-protocol-client.mjs');
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
 * Render the match history flow — fetches recent matches and displays them.
 */
async function renderNetworkHistoryFlow(container) {
  const { matchHistory } = await import('./network/network-protocol-client.mjs');
  container.innerHTML = renderNetworkMatchHistory({ loading: true });

  const serverUrl = getNetworkServerUrl();
  const ws = new WebSocket(serverUrl);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify(matchHistory(20, null)));
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'MATCH_HISTORY_RESULT') {
        container.innerHTML = renderNetworkMatchHistory({ matches: msg.payload.matches });
        bindHistoryActions(container, ws, matchHistory);
      } else if (msg.type === 'ERROR') {
        container.innerHTML = renderNetworkMatchHistory({
          error: msg.payload.message ?? 'Failed to load match history.',
        });
        bindHistoryActions(container, ws, matchHistory);
      }
    } catch { /* ignore parse errors */ }
  });

  ws.addEventListener('error', () => {
    container.innerHTML = renderNetworkMatchHistory({
      error: 'Connection to server failed. Please try again.',
    });
  });

  // Bind refresh action
  const refreshBtn = container.querySelector('[data-action="network-history-refresh"]');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (ws.readyState === WebSocket.OPEN) {
        container.innerHTML = renderNetworkMatchHistory({ loading: true });
        ws.send(JSON.stringify(matchHistory(20, null)));
      }
    });
  }
}

function bindHistoryActions(container, ws, matchHistory) {
  // Bind refresh
  const refreshBtn = container.querySelector('[data-action="network-history-refresh"]');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (ws.readyState === WebSocket.OPEN) {
        container.innerHTML = renderNetworkMatchHistory({ loading: true });
        ws.send(JSON.stringify(matchHistory(20, null)));
      }
    });
  }
  // Bind spectate buttons
  container.querySelectorAll('[data-testid="network-history-spectate"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const matchId = btn.dataset.matchId;
      try { ws.close(); } catch { /* ignore */ }
      // Navigate to spectate flow with the match ID pre-filled
      location.hash = `#/play/online/spectate`;
      // We'll pass the match ID via a global state
      window.__spectateMatchId = matchId;
    });
  });
}

/**
 * Render the active network match — uses the existing board renderer.
 * Installs a durable subscription so opponent actions update live.
 */
async function renderNetworkActiveMatch(container) {
  const session = state.networkSession;
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
      // If the session transitioned to TERMINAL, clear reconnect info
      if (session.status === NetworkSessionState.TERMINAL) {
        // Terminal rendering will be handled by renderActiveMatch
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
    session.onStateChange = () => {
      const activeContainer = state.activeContainer;
      if (!activeContainer) return;
      if (session.status === NetworkSessionState.RUNNING) {
        state.networkSession = session;
        state.session = session;
        location.hash = '#/play/online/match';
        return;
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
        envelope.saveId = `AUTOSAVE-${state.session.sessionId}`;
        if (state.tutorial) {
          envelope.tutorial = state.tutorial.getSaveState();
        }
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
  clearTimeout(state.hoverTimer);
  state.hoverPopoverIdentity = null;
  if (state.sound) { state.sound.destroy(); state.sound = null; }
  if (state.particles) { state.particles.destroy(); state.particles = null; }
  state.session = null;
  state.tutorial = null;
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

// ═══════════════════════════════════════════════════════════════
// v0.20.0: HOVER POPOVER — Ctrl+hover → Lite, Shift+hover → Full Zoom
// ═══════════════════════════════════════════════════════════════

/**
 * Show the hover popover with the given Card Face view for the identity.
 * @param {Element} container - play-root container
 * @param {Element} cardEl - the hovered card wrapper element
 * @param {string} identity - card identity (e.g. "A♣")
 * @param {string} view - 'lite' or 'zoom'
 * Positioned above the hovered card element. For 'lite' view, includes a
 * "Full Zoom →" button that opens the global #card-face-dialog with the
 * zoom dossier. For 'zoom' view, renders the full dossier inline in the
 * popover.
 */
function showHoverPopover(container, cardEl, identity, view = 'lite') {
  const popover = container.querySelector('#card-hover-popover');
  if (!popover) return;
  state.hoverPopoverIdentity = identity;

  // Position the popover above the card
  const cardRect = cardEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const popoverLeft = cardRect.left - containerRect.left + cardRect.width / 2;
  const popoverBottom = containerRect.bottom - cardRect.top + 8;
  popover.style.left = `${popoverLeft}px`;
  popover.style.bottom = `${popoverBottom}px`;

  // Render the Card Face for the requested view
  import('../card-face-renderer.js').then(({ renderCardFace }) => {
    if (state.hoverPopoverIdentity !== identity) return; // stale
    const faceView = view === 'zoom' ? 'zoom' : 'lite';
    const zoomBtn = view === 'lite'
      ? `<button class="card-hover-popover-zoom" data-hover-zoom="${esc(identity)}" aria-label="Open full dossier">Full Zoom →</button>`
      : '';
    popover.innerHTML = `<div class="card-hover-popover-inner">
      ${renderCardFace(identity, { view: faceView })}
      ${zoomBtn}
    </div>`;
    popover.classList.add('visible');
    popover.setAttribute('aria-hidden', 'false');

    // Wire the Full Zoom button (lite view only)
    const zoomBtnEl = popover.querySelector('[data-hover-zoom]');
    if (zoomBtnEl) {
      zoomBtnEl.addEventListener('click', () => {
        openCardFaceDialog(identity);
      });
    }

    // Keep popover open when hovering over it
    popover.addEventListener('mouseenter', () => {
      clearTimeout(state.hoverTimer);
    });
    popover.addEventListener('mouseleave', () => {
      hideHoverPopover(container);
    });
  });
}

/**
 * Hide the hover popover.
 */
function hideHoverPopover(container) {
  const popover = container.querySelector('#card-hover-popover');
  if (!popover) return;
  state.hoverPopoverIdentity = null;
  popover.classList.remove('visible');
  popover.setAttribute('aria-hidden', 'true');
  popover.innerHTML = '';
}

/**
 * Open the global #card-face-dialog with the zoom (full) dossier.
 */
function openCardFaceDialog(identity) {
  const dialog = document.querySelector('#card-face-dialog');
  if (!dialog) return;
  const titleEl = document.querySelector('#card-face-dialog-title');
  const contentEl = document.querySelector('#card-face-dialog-content');
  if (titleEl) titleEl.textContent = identity;
  import('../card-face-renderer.js').then(({ renderCardFace }) => {
    if (contentEl) contentEl.innerHTML = renderCardFace(identity, { view: 'zoom' });
    if (typeof dialog.showModal === 'function') dialog.showModal();
  });
}

/**
 * Handle P key — pass priority (decline response or exhausted pass).
 */
function handlePassShortcut(container) {
  if (!state.session || state.session.status !== SessionState.HUMAN_DECISION) return;
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
 * Handle Escape key — cancel selection or close inspector.
 */
function handleEscapeShortcut(container) {
  if (state.inspectorCardId) {
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
  if (!state.session || state.session.status !== SessionState.HUMAN_DECISION) return;
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
    const cleanup = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); };
    const done = (result) => { if (resolved) return; resolved = true; cleanup(); resolve(result); };

    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); done(true); }
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

/**
 * Get the current tutorial (for testing).
 */
export function getTutorial() {
  return state.tutorial;
}
