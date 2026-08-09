// ═══════════════════════════════════════════════════════════════
// board-events.js — Board interaction event binding.
//
// Extracted from play-app.js (P2.1 modularization).
// Binds all DOM event listeners for the active match board:
// action buttons, hand cards, drag-to-play, target selection,
// inspector, chat, guidance toggle, sound, confirm/cancel,
// tutorial controls, and terminal actions.
// ═══════════════════════════════════════════════════════════════
import { state } from './play-state.js';
import { SessionState } from './play-controller.js';
import { GuidanceMode } from './intelligence/action-explanation.js';
import { getReasonCode } from './authority/reason-code-registry.js';
import { setPreference } from './persistence.js';
import { parseCardIdentity } from './play-card-component.js';
import { getSuitParticleColor } from './play-particles.js';

/**
 * Bind all board interaction events for the active match container.
 *
 * @param {HTMLElement} container — the active match DOM container
 * @param {object} callbacks — functions defined in play-app.js
 * @param {function} callbacks.renderActiveMatch — re-render the active match
 * @param {function} callbacks.showHoverPopover — show card hover popover
 * @param {function} callbacks.hideHoverPopover — hide card hover popover
 * @param {function} callbacks.openAdvancedCardRules — open the Advanced Card Rules View
 * @param {function} callbacks.startNewMatch — start a new match with setup
 * @param {function} callbacks.stopAutosave — stop the autosave timer
 */
export function bindBoardEvents(container, callbacks) {
  const { renderActiveMatch, showHoverPopover, hideHoverPopover, openAdvancedCardRules, startNewMatch, stopAutosave } = callbacks;

  // Initialize sound on first user interaction (browser autoplay policy)
  if (state.sound && !state.soundInitialized) {
    state.soundInitialized = true;
    state.sound.init();
  }

  // Action buttons
  container.querySelectorAll('[data-action-id]').forEach(el => {
    if (el.dataset.testid === 'confirm-action') return;
    if (el.disabled) return; // Skip disabled actions
    el.addEventListener('click', () => {
      const actionId = el.dataset.actionId;
      state.selectedActionId = actionId;
      state.selectedTargetIds = []; // Reset targets on new action selection
      // Find the action to get source card IDs
      const snapshot = state.session?.getSnapshot();
      const action = snapshot?.decision?.legalActions?.find(a => a.actionId === actionId);
      if (action?.sourceHandles?.length === 1) {
        state.selectedSourceCardId = action.sourceHandles[0];
      }
      renderActiveMatch(container);
    });
  });

  // Hand cards — click to select source, double-click to inspect
  container.querySelectorAll('.hand-card').forEach(el => {
    el.addEventListener('click', () => {
      const cardId = el.dataset.cardId;
      state.selectedSourceCardId = state.selectedSourceCardId === cardId ? null : cardId;
      renderActiveMatch(container);
    });
    // v0.17.0: Inspector — right-click or Shift+click
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.inspectorCardId = state.inspectorCardId === el.dataset.cardId ? null : el.dataset.cardId;
      renderActiveMatch(container);
    });
    // Phase 2: Drag-to-play — dragstart sets the source card
    el.addEventListener('dragstart', (e) => {
      const cardId = el.dataset.cardId;
      state.selectedSourceCardId = cardId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/card-id', cardId);
      el.classList.add('dragging');
      // Re-render to update eligible action highlights
      renderActiveMatch(container);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      // Clear drag-over highlights from all drop zones
      container.querySelectorAll('[data-drop-zone].drag-over').forEach(z => z.classList.remove('drag-over'));
    });
    // v0.20.0: Ctrl+hover → Lite Card Face popover; Shift+hover → Full Zoom dialog.
    // Plain hover shows mechanic icon tooltips (native title attr on each icon).
    el.addEventListener('mousemove', (e) => {
      const identity = el.dataset.cardIdentity;
      if (!identity) return;
      if (e.ctrlKey && state.hoverPopoverIdentity !== identity) {
        clearTimeout(state.hoverTimer);
        showHoverPopover(container, el, identity, 'lite');
      } else if (e.shiftKey && state.hoverPopoverIdentity !== identity) {
        clearTimeout(state.hoverTimer);
        showHoverPopover(container, el, identity, 'zoom');
      } else if (!e.ctrlKey && !e.shiftKey && state.hoverPopoverIdentity) {
        hideHoverPopover(container);
      }
    });
    el.addEventListener('mouseleave', () => {
      clearTimeout(state.hoverTimer);
      hideHoverPopover(container);
    });
  });

  // v0.20.0: Inspector — right-click on any board card (PR/ER) to inspect.
  // Hand cards already have contextmenu bound above; this covers board cards.
  container.querySelectorAll('.rd-card:not(.hand-card)').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const cardId = el.dataset.cardId;
      if (!cardId) return;
      state.inspectorCardId = state.inspectorCardId === cardId ? null : cardId;
      state.inspectorFaceView = 'board';
      renderActiveMatch(container);
    });
  });

  // Phase 2: Drag-to-play — drop zone handlers
  container.querySelectorAll('[data-drop-zone]').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const cardId = e.dataTransfer.getData('text/card-id') || state.selectedSourceCardId;
      if (!cardId) return;
      state.selectedSourceCardId = cardId;
      // Drop selects the source card and shows eligible actions in the dock.
      // The actual action choice still requires clicking an action button
      // (engine authority boundary: UI never auto-commits).
      renderActiveMatch(container);
    });
  });

  // v0.17.0: Target selection buttons
  container.querySelectorAll('[data-testid="target-button"]').forEach(el => {
    el.addEventListener('click', () => {
      const targetId = el.dataset.targetId;
      const idx = state.selectedTargetIds.indexOf(targetId);
      if (idx >= 0) {
        state.selectedTargetIds = state.selectedTargetIds.filter(id => id !== targetId);
      } else {
        state.selectedTargetIds = [...state.selectedTargetIds, targetId];
      }
      renderActiveMatch(container);
    });
  });

  // Phase 4: Board card click-to-target — cards with data-target-id are clickable targets
  container.querySelectorAll('.board-card-wrapper[data-target-id]').forEach(el => {
    el.addEventListener('click', () => {
      const targetId = el.dataset.targetId;
      const idx = state.selectedTargetIds.indexOf(targetId);
      if (idx >= 0) {
        state.selectedTargetIds = state.selectedTargetIds.filter(id => id !== targetId);
      } else {
        state.selectedTargetIds = [...state.selectedTargetIds, targetId];
      }
      renderActiveMatch(container);
    });
    el.style.cursor = 'pointer';
  });

  // v0.17.0: Inspector close button
  const inspectorClose = container.querySelector('[data-testid="inspector-close"]');
  if (inspectorClose) {
    inspectorClose.addEventListener('click', () => {
      state.inspectorCardId = null;
      state.inspectorFaceView = 'board';
      renderActiveMatch(container);
    });
  }

  // Inspector: Essentials is the single inline view (no Board/Lite toggle).
  // Advanced Card Rules View — opens the codex dossier (directive §1).
  // Informational only: never selects, submits, or mutates game state.
  container.querySelectorAll('[data-inspector-advanced-rules]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const identity = btn.dataset.inspectorAdvancedRules;
      const cardId = btn.dataset.cardId;
      if (!identity || !openAdvancedCardRules) return;
      openAdvancedCardRules(identity, cardId);
    });
  });

  // Advanced Details via Shift+right-click on any board card (directive §1).
  // Plain right-click remains the lightweight inspector; Shift+right-click
  // jumps straight to the Advanced Card Rules View.
  container.querySelectorAll('.rd-card').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      if (!e.shiftKey || !openAdvancedCardRules) return;
      const identity = el.dataset.cardIdentity;
      const cardId = el.dataset.cardId;
      if (!identity) return;
      e.preventDefault();
      openAdvancedCardRules(identity, cardId);
    });
  });
  // Hand cards already bind contextmenu above; add a Shift+right-click
  // Advanced path that runs before the inspector toggle.
  container.querySelectorAll('.hand-card').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      if (!e.shiftKey || !openAdvancedCardRules) return;
      const identity = el.dataset.cardIdentity;
      const cardId = el.dataset.cardId;
      if (!identity) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openAdvancedCardRules(identity, cardId);
    }, true);
  });

  // v0.17.0: Keyboard help close button
  const keyboardHelpClose = container.querySelector('[data-testid="keyboard-help-close"]');
  if (keyboardHelpClose) {
    keyboardHelpClose.addEventListener('click', () => {
      state.showKeyboardHelp = false;
      renderActiveMatch(container);
    });
  }

  // v0.19.0: Match chat form submit
  const chatForm = container.querySelector('[data-testid="match-chat-form"]');
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = chatForm.querySelector('[data-testid="match-chat-input"]');
      const text = input?.value?.trim();
      if (!text) return;
      state.chatMessages.push({ author: 'player', text, time: new Date().toLocaleTimeString() });
      input.value = '';
      renderActiveMatch(container);
    });
  }

  // v0.21.0: Side dock chat send (data-action="chat-send")
  const chatSendBtn = container.querySelector('[data-action="chat-send"]');
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', () => {
      const input = container.querySelector('[data-chat-input]');
      const text = input?.value?.trim();
      if (!text) return;
      state.chatMessages.push({ isHuman: true, text, time: new Date().toLocaleTimeString() });
      input.value = '';
      renderActiveMatch(container);
    });
  }
  const chatInputEl = container.querySelector('[data-chat-input]');
  if (chatInputEl) {
    chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = chatInputEl.value?.trim();
        if (!text) return;
        state.chatMessages.push({ isHuman: true, text, time: new Date().toLocaleTimeString() });
        chatInputEl.value = '';
        renderActiveMatch(container);
      }
    });
  }

  // v0.22.0: Right rail tab switching
  container.querySelectorAll('[data-rail-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      state.rightRailTab = tab.dataset.railTab;
      renderActiveMatch(container);
    });
  });

  // v0.19.0: Guidance mode toggle
  const guidanceToggle = container.querySelector('[data-testid="guidance-mode-toggle"]');
  if (guidanceToggle) {
    guidanceToggle.addEventListener('click', () => {
      const modes = [GuidanceMode.OFF, GuidanceMode.ESSENTIAL, GuidanceMode.GUIDED, GuidanceMode.DETAILED];
      const currentIdx = modes.indexOf(state.guidanceMode);
      state.guidanceMode = modes[(currentIdx + 1) % modes.length];
      setPreference('guidanceMode', state.guidanceMode);
      renderActiveMatch(container);
    });
  }

  // Phase 6: Sound mute toggle
  const soundToggle = container.querySelector('[data-testid="sound-toggle"]');
  if (soundToggle) {
    soundToggle.addEventListener('click', async () => {
      state.soundMuted = !state.soundMuted;
      if (state.sound) await state.sound.setMuted(state.soundMuted);
      renderActiveMatch(container);
    });
  }

  // Confirm button
  const confirmBtn = container.querySelector('[data-testid="confirm-action"]');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!state.session || state.session.status !== SessionState.HUMAN_DECISION) return;
      if (confirmBtn.dataset.submitting === 'true') return;  // Guard: already submitting
      confirmBtn.dataset.submitting = 'true';
      confirmBtn.disabled = true;
      const actionId = confirmBtn.dataset.actionId;
      const snapshot = state.session.getSnapshot();
      const submission = {
        sessionId: snapshot.sessionId,
        stateRevision: snapshot.decision?.stateRevision,
        decisionFrameHash: snapshot.decision?.frameHash,
        actionId,
      };
      state.selectedActionId = null;
      state.selectedSourceCardId = null;
      state.selectedTargetIds = [];

      // Network sessions use server authority, not local lease.
      // Local sessions require the local lease to be CONTROLLED.
      const isNetworkSession = !!state.networkSession;
      if (!isNetworkSession && state.leaseMode !== 'CONTROLLED') {
        const banner = container.querySelector('.rd-contextual-actions') || container.querySelector('.rd-action-bar') || container.querySelector('.decision-banner');
        if (banner) {
          const errEl = document.createElement('div');
          errEl.className = 'submission-error';
          errEl.setAttribute('role', 'alert');
          errEl.textContent = state.leaseMode === 'READ_ONLY' ? 'This match is view-only. Another tab controls it.' : 'Session ownership required to act.';
          banner.appendChild(errEl);
          setTimeout(() => errEl.remove(), 4000);
        }
        confirmBtn.dataset.submitting = 'false';
        confirmBtn.disabled = false;
        return;
      }
      // Network sessions: reject if not running or if pending
      if (isNetworkSession && state.networkSession) {
        if (state.networkSession.status !== 'RUNNING') {
          const banner = container.querySelector('.rd-contextual-actions') || container.querySelector('.rd-action-bar') || container.querySelector('.decision-banner');
          if (banner) {
            const errEl = document.createElement('div');
            errEl.className = 'submission-error';
            errEl.setAttribute('role', 'alert');
            errEl.textContent = 'Match is not running.';
            banner.appendChild(errEl);
            setTimeout(() => errEl.remove(), 3000);
          }
          confirmBtn.dataset.submitting = 'false';
          confirmBtn.disabled = false;
          return;
        }
        if (state.networkSession._pendingAction) {
          confirmBtn.dataset.submitting = 'false';
          confirmBtn.disabled = false;
          return; // Already pending
        }
      }
      try {
        const result = await state.session.submitHumanAction(submission);
        if (!result.accepted) {
          // v0.17.0: Show structured reason code instead of generic message
          const reasonDef = getReasonCode(result.error);
          const banner = container.querySelector('.rd-contextual-actions') || container.querySelector('.rd-action-bar') || container.querySelector('.decision-banner');
          if (banner) {
            const errEl = document.createElement('div');
            errEl.className = 'submission-error';
            errEl.setAttribute('role', 'alert');
            errEl.textContent = reasonDef.shortText;
            banner.appendChild(errEl);
            setTimeout(() => errEl.remove(), 3000);
          }
        } else {
          // Phase 6: Play card-play sound + particle burst
          if (state.sound) {
            const postSubmitSnapshot = state.session.getSnapshot();
            const action = postSubmitSnapshot.decision?.legalActions?.find(a => a.actionId === actionId);
            const sourceCard = action?.sourceHandles?.[0];
            const cardRegistry = postSubmitSnapshot.playerView?.own?.hand?.reduce((m, c) => { m[c.id] = c; return m; }, {}) ?? {};
            const card = sourceCard ? cardRegistry[sourceCard] : null;
            const suit = card ? parseCardIdentity(card.identity).suit : null;
            state.sound.playCardPlay(suit);
            if (state.particles && card) {
              const boardEl = container.querySelector('.tcg-board');
              if (boardEl) {
                const rect = boardEl.getBoundingClientRect();
                state.particles.burst(rect.width / 2, rect.height / 2, { color: getSuitParticleColor(suit), count: 10 });
              }
            }
          }
        }
        // Check tutorial completion
        if (state.tutorial && result.accepted) {
          const lastAction = snapshot.decision.legalActions.find(a => a.actionId === actionId);
          if (state.tutorial.checkCompletion(lastAction)) {
            state.tutorial.advance();
          }
        }
        await renderActiveMatch(container);
      } finally {
        confirmBtn.dataset.submitting = 'false';
        confirmBtn.disabled = false;
      }
    });
  }

  // Cancel button
  const cancelBtn = container.querySelector('[data-testid="cancel-action"]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.selectedActionId = null;
      state.selectedTargetIds = [];
      renderActiveMatch(container);
    });
  }

  // v0.25: Stage cancel-selection button — clears source card selection
  const stageCancelBtn = container.querySelector('[data-action="cancel-selection"]');
  if (stageCancelBtn) {
    stageCancelBtn.addEventListener('click', () => {
      state.selectedSourceCardId = null;
      state.selectedActionId = null;
      state.selectedTargetIds = [];
      renderActiveMatch(container);
    });
  }

  // v0.25: Mechanic icon tooltips — promote to fixed-position overlay to escape
  // overflow:hidden clipping from card/row/hand containers.
  let activeTooltip = null;
  let activeTooltipIcon = null;

  function showMechanicTooltip(iconEl) {
    const tooltipEl = iconEl.querySelector('.tcg-mechanic-tooltip');
    if (!tooltipEl) return;
    hideMechanicTooltip();
    const rect = iconEl.getBoundingClientRect();
    const clone = tooltipEl.cloneNode(true);
    clone.classList.add('tcg-mechanic-tooltip-floating');
    // Position above the icon, centered
    const tipWidth = 260;
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    // Clamp to viewport
    const margin = 8;
    if (left < margin) left = margin;
    if (left + tipWidth > window.innerWidth - margin) left = window.innerWidth - margin - tipWidth;
    // If not enough space above, show below
    const tipHeight = 120; // estimate
    let showBelow = rect.top < tipHeight + 20;
    let top;
    if (showBelow) {
      top = rect.bottom + 8;
    } else {
      top = rect.top - tipHeight - 8;
    }
    clone.style.left = `${left}px`;
    clone.style.top = `${top}px`;
    clone.style.width = `${tipWidth}px`;
    clone.style.position = 'fixed';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    activeTooltip = clone;
    activeTooltipIcon = iconEl;
  }

  function hideMechanicTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
      activeTooltipIcon = null;
    }
  }

  container.querySelectorAll('.tcg-mechanic-icon').forEach(iconEl => {
    iconEl.addEventListener('mouseenter', () => showMechanicTooltip(iconEl));
    iconEl.addEventListener('mouseleave', hideMechanicTooltip);
    iconEl.addEventListener('focus', () => showMechanicTooltip(iconEl));
    iconEl.addEventListener('blur', hideMechanicTooltip);
  });

  // Tutorial controls
  const tutorialAck = container.querySelector('[data-testid="tutorial-acknowledge"]');
  if (tutorialAck) {
    tutorialAck.addEventListener('click', () => {
      state.tutorial.advance();
      renderActiveMatch(container);
    });
  }
  const tutorialSkip = container.querySelector('[data-testid="tutorial-skip"]');
  if (tutorialSkip) {
    tutorialSkip.addEventListener('click', () => {
      state.tutorial.skip();
      renderActiveMatch(container);
    });
  }

  // Terminal actions and header actions
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      if (action === 'watch-replay') {
        // Save replay and redirect
        const { createReplayRecord, saveReplay } = await import('./replay-library.js');
        const record = await createReplayRecord(state.session);
        await saveReplay(record);
        location.hash = '#/play/replays';
      } else if (action === 'download-replay') {
        // Download certified replay from the network server via authenticated WebSocket
        // (HTTP replay download was removed in v0.24.2 — GET_REPLAY is the canonical path)
        if (state.networkSession && state.networkSession.status === 'TERMINAL' && state.networkSession.matchId) {
          try {
            const { createNetworkReplayRecord, saveReplay } = await import('./replay-library.js');
            const record = await createNetworkReplayRecord(state.networkSession);
            if (record) {
              // Save to local IndexedDB replay library
              await saveReplay(record);
              // Also trigger a file download
              const blob = new Blob([JSON.stringify(record.certifiedReplay, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${state.networkSession.matchId}.replay.json`;
              a.click();
              URL.revokeObjectURL(url);
            }
          } catch (err) {
            console.warn('Failed to download replay:', err.message);
          }
        }
      } else if (action === 'rematch-same-seed') {
        await startNewMatch({ ...state.session.setup }, container);
      } else if (action === 'new-seed') {
        const newSeed = (Math.random() * 4294967296) >>> 0 || 1;
        await startNewMatch({ ...state.session.setup, seed: newSeed }, container);
      } else if (action === 'return-to-hub' || action === 'exit-match') {
        stopAutosave();
        state.session = null;
        state.tutorial = null;
        state.inspectorCardId = null;
        state.inspectorFaceView = 'board';
        location.hash = '#/play';
      } else if (action === 'keyboard-help') {
        state.showKeyboardHelp = !state.showKeyboardHelp;
        renderActiveMatch(container);
      } else if (action === 'toggle-chat') {
        state.rightRailTab = 'chat';
        renderActiveMatch(container);
      } else if (action === 'toggle-dev') {
        state.rightRailTab = 'debug';
        renderActiveMatch(container);
      }
    });
  });
}
