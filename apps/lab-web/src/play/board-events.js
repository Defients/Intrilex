// ═══════════════════════════════════════════════════════════════
// board-events.js — Board interaction event binding.
//
// Extracted from play-app.js (P2.1 modularization).
// Binds all DOM event listeners for the active match board:
// action buttons, hand cards, drag-to-play, target selection,
// inspector, chat, guidance toggle, sound, confirm/cancel,
// and terminal actions.
// ═══════════════════════════════════════════════════════════════
import { state } from './play-state.js';
import { esc } from '../state.js';
import { SessionState } from './play-controller.js';
import { GuidanceMode } from './intelligence/action-explanation.js';
import { getReasonCode } from './authority/reason-code-registry.js';
import { setPreference } from './persistence.js';
import { parseCardIdentity } from './play-card-component.js';
import { getSuitParticleColor } from './play-particles.js';
import { buildActionGroups, resolveAction } from './action-presentation.mjs';

// Lazy-loaded module reference for the group button handler
const _actionPresentationModule = { buildActionGroups, resolveAction };

/**
 * Reset all transient selection state to defaults.
 * Called after confirm, cancel, and stage-cancel flows.
 */
function clearSelection() {
  state.selectedActionId = null;
  state.selectedIntentKey = null;
  state.selectedSourceCardId = null;
  state.selectedTargetIds = [];
  state.viewMode = null;
}

/**
 * Submit an action to the session and handle the result.
 * Extracted from the confirm-button handler so it can be reused for
 * auto-submit flows (e.g. phase/enter-action skips confirm).
 *
 * @param {HTMLElement} container — the active match DOM container
 * @param {string} actionId — the action ID to submit
 * @param {function} renderActiveMatch — re-render the active match
 * @returns {Promise<boolean>} true if accepted, false otherwise
 */
async function submitAction(container, actionId, renderActiveMatch) {
  if (!state.session) return false;
  // Network sessions use NetworkSessionState.RUNNING internally, not
  // SessionState.HUMAN_DECISION. Use isAwaitingHumanAction() to check
  // if it's the local player's turn.
  const isHumanTurn = state.networkSession
    ? state.networkSession.isAwaitingHumanAction()
    : state.session.status === SessionState.HUMAN_DECISION;
  if (!isHumanTurn) return false;
  const snapshot = state.session.getSnapshot();
  const submission = {
    sessionId: snapshot.sessionId,
    stateRevision: snapshot.decision?.stateRevision,
    decisionFrameHash: snapshot.decision?.frameHash,
    actionId,
  };

  // Network sessions use server authority, not local lease.
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
    return false;
  }
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
      return false;
    }
    if (state.networkSession._pendingAction) return false;
  }
  try {
    const result = await state.session.submitHumanAction(submission);
    if (!result.accepted) {
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
    await renderActiveMatch(container);
    return result.accepted;
  } catch (err) {
    console.error('submitAction error:', err);
    return false;
  }
}

/**
 * Bind all board interaction events for the active match container.
 *
 * @param {HTMLElement} container — the active match DOM container
 * @param {object} callbacks — functions defined in play-app.js
 * @param {function} callbacks.renderActiveMatch — re-render the active match
 * @param {function} callbacks.openAdvancedCardRules — open the Advanced Card Rules View
 * @param {function} callbacks.startNewMatch — start a new match with setup
 * @param {function} callbacks.stopAutosave — stop the autosave timer
 */
export function bindBoardEvents(container, callbacks) {
  const { renderActiveMatch, openAdvancedCardRules, startNewMatch, stopAutosave } = callbacks;

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

  // Group buttons — click to select an action group (v0.26.0 progressive disclosure)
  container.querySelectorAll('[data-group-id]').forEach(el => {
    if (el.disabled) return;
    el.addEventListener('click', async () => {
      const groupId = el.dataset.groupId;
      state.selectedIntentKey = state.selectedIntentKey === groupId ? null : groupId;
      state.selectedActionId = null; // Reset concrete action
      state.selectedTargetIds = [];
      // Try to auto-resolve to a concrete action
      if (state.selectedIntentKey) {
        const snapshot = state.session?.getSnapshot();
        const rawActions = snapshot?.decision?.legalActions ?? [];
        // Build action groups the same way the renderer does
        const { buildActionGroups, resolveAction } = _actionPresentationModule;
        const groups = buildActionGroups(rawActions, {
          selectedSourceCardId: state.selectedSourceCardId,
        });
        const group = groups.find(g => g.id === groupId);
        if (group) {
          // If a source card is selected, try to resolve with it
          if (state.selectedSourceCardId) {
            const concrete = resolveAction(group, state.selectedSourceCardId);
            if (concrete) {
              state.selectedActionId = concrete.actionId;
              state.selectedIntentKey = null;
            }
          } else if (group.selectionType === 'direct' || group.actions.length === 1) {
            // Direct or single-action group — auto-select
            state.selectedActionId = group.actions[0].actionId;
            state.selectedIntentKey = null;
          }
          // Auto-submit phase/enter-action — no confirm step needed
          if (group.family === 'phase' && state.selectedActionId) {
            const actionId = state.selectedActionId;
            clearSelection();
            await submitAction(container, actionId, renderActiveMatch);
            return;
          }
          // Otherwise, keep selectedIntentKey set to show variant selection
        }
      }
      renderActiveMatch(container);
    });
  });

  // Variant buttons — click to select a specific variant within a group
  container.querySelectorAll('[data-variant-action-id]').forEach(el => {
    el.addEventListener('click', () => {
      const actionId = el.dataset.variantActionId;
      state.selectedActionId = actionId;
      state.selectedIntentKey = null; // Exit variant selection
      state.selectedTargetIds = [];
      // Auto-set source card if the action has a single source
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
      state.selectedIntentKey = null; // Clear intent when source card changes
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
      // For swap-bar face-down: the engine pre-pairs (source, target) as
      // separate actions. When the player selects a target, find the action
      // matching the current source + selected target and update selectedActionId.
      const snapshot = state.session?.getSnapshot();
      const rawActions = snapshot?.decision?.legalActions ?? [];
      const currentAction = rawActions.find(a => a.actionId === state.selectedActionId);
      if (currentAction && currentAction.family === 'swap-bar' && currentAction.mode === 'face-down') {
        const sourceId = (currentAction.sourceHandles ?? currentAction.sourceEntityIds ?? [])[0];
        const matching = rawActions.find(a => {
          if (a.family !== 'swap-bar' || a.mode !== 'face-down') return false;
          const aSource = (a.sourceHandles ?? a.sourceEntityIds ?? [])[0];
          const aTarget = (a.targetHandles ?? a.targets?.legalTargetIds ?? [])[0];
          return aSource === sourceId && aTarget === targetId;
        });
        if (matching) {
          state.selectedActionId = matching.actionId;
        }
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

  // Swap bar "Take" button — selects the face-up-draw action and confirms
  container.querySelectorAll('[data-action="swap-take"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const actionId = el.dataset.actionId;
      state.selectedActionId = actionId;
      state.selectedIntentKey = null;
      state.selectedTargetIds = [];
      state.selectedSourceCardId = null;
      renderActiveMatch(container);
    });
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

  // Rules/help overlay close button
  const rulesHelpClose = container.querySelector('[data-testid="rules-help-close"]');
  if (rulesHelpClose) {
    rulesHelpClose.addEventListener('click', () => {
      state.showRulesHelp = false;
      renderActiveMatch(container);
    });
  }

  // Match stats overlay close button
  const matchStatsClose = container.querySelector('[data-testid="match-stats-close"]');
  if (matchStatsClose) {
    matchStatsClose.addEventListener('click', () => {
      state.showMatchStats = false;
      renderActiveMatch(container);
    });
  }

  // v0.28: Match chat form submit — unified handler for both network and local.
  // Removed the duplicate form-submit handler that pushed with `author: 'player'`
  // (which conflicted with the network session's chat messages).
  const chatForm = container.querySelector('[data-testid="match-chat-form"]');
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = chatForm.querySelector('[data-testid="match-chat-input"]');
      const text = input?.value?.trim();
      if (!text) return;
      input.value = '';
      if (state.networkSession && typeof state.networkSession.sendChatMessage === 'function') {
        await state.networkSession.sendChatMessage(text);
      } else {
        state.chatMessages.push({ isHuman: true, text, time: new Date().toLocaleTimeString() });
      }
      renderActiveMatch(container);
    });
  }

  // v0.25: Chat send button — routes to network session for online matches,
  // or local echo for Local vs AI matches.
  // NOTE: The send button is type="submit" inside the chat form, so the
  // form submit handler above already handles button clicks. This separate
  // click handler is NOT needed and would cause duplicate sends.
  // Removed the click handler to prevent double-send issues.

  // Chat input Enter key handler — sends message on Enter (prevents form submit)
  const chatInputEl = container.querySelector('[data-chat-input]');
  if (chatInputEl) {
    chatInputEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = chatInputEl.value?.trim();
        if (!text) return;
        chatInputEl.value = '';
        if (state.networkSession && typeof state.networkSession.sendChatMessage === 'function') {
          await state.networkSession.sendChatMessage(text);
        } else {
          state.chatMessages.push({ isHuman: true, text, time: new Date().toLocaleTimeString() });
        }
        renderActiveMatch(container);
      }
    });
  }

  // v0.28: Chat hide/show toggle — network matches only
  const chatToggleBtn = container.querySelector('[data-action="chat-hide"], [data-action="chat-show"]');
  if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
      const action = chatToggleBtn.dataset.action;
      const hidden = action === 'chat-hide';
      if (state.networkSession) {
        state.networkSession.sendChatVisibility(hidden);
      }
      state.chatHidden = hidden;
      renderActiveMatch(container);
    });
  }

  // v0.28: Draggable divider between Actions and Chat
  const divider = container.querySelector('[data-action="rail-drag"]');
  if (divider) {
    bindRailDividerDrag(divider, container);
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
      if (!state.session) return;
      // Network sessions use NetworkSessionState.RUNNING internally
      const isHumanTurn = state.networkSession
        ? state.networkSession.isAwaitingHumanAction()
        : state.session.status === SessionState.HUMAN_DECISION;
      if (!isHumanTurn) return;
      if (confirmBtn.dataset.submitting === 'true') return;
      confirmBtn.dataset.submitting = 'true';
      confirmBtn.disabled = true;
      const actionId = confirmBtn.dataset.actionId;
      clearSelection();
      try {
        await submitAction(container, actionId, renderActiveMatch);
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
      clearSelection();
      renderActiveMatch(container);
    });
  }

  // v0.25: Stage cancel-selection button — clears source card selection
  const stageCancelBtn = container.querySelector('[data-action="cancel-selection"]');
  if (stageCancelBtn) {
    stageCancelBtn.addEventListener('click', () => {
      clearSelection();
      renderActiveMatch(container);
    });
  }

  // v0.26.0: Back/Cancel buttons for progressive disclosure states
  container.querySelectorAll('[data-action="cancel-variant"], [data-action="cancel-target"], [data-action="cancel-confirm"]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Go back to overview: clear intent + action, keep source card selection
      state.selectedIntentKey = null;
      state.selectedActionId = null;
      state.selectedTargetIds = [];
      renderActiveMatch(container);
    });
  });

  // Back to Start Phase button — visual toggle to show the Start phase view
  container.querySelectorAll('[data-action="back-to-start"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = 'start';
      state.selectedIntentKey = null;
      state.selectedActionId = null;
      state.selectedTargetIds = [];
      state.selectedSourceCardId = null;
      renderActiveMatch(container);
    });
  });

  // Forward to Action Phase button — return from Start phase view to Action phase
  container.querySelectorAll('[data-action="forward-to-action"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = null;
      renderActiveMatch(container);
    });
  });

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

  // Terminal actions and header actions
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      if (action === 'watch-replay') {
        // IRX-H24: For network matches, fetch the certified replay from the
        // server and play it directly in the Watch workspace. For local matches,
        // save to IndexedDB and navigate to the replays list.
        if (state.networkSession && state.networkSession.status === 'TERMINAL' && state.networkSession.matchId) {
          // Network match — fetch replay from server and play directly
          try {
            container.innerHTML = '<div class="play-loading">Loading replay from server…</div>';
            const { ensureReplayFrames } = await import('../replay-frames.js');
            const { state: observatoryState } = await import('../state.js');
            const replay = await state.networkSession.getReplay();
            if (!replay) {
              container.innerHTML = '<div class="play-error" role="alert"><h2>Replay unavailable</h2><p>The server could not provide a certified replay for this match.</p><a href="#/play/online" class="secondary-button">Back to Online</a></div>';
              return;
            }
            const replayObj = { ...replay, frames: undefined };
            await ensureReplayFrames(replayObj);
            if (!replayObj.frames || replayObj.frames.length === 0) {
              throw new Error('Frame reconstruction produced no frames');
            }
            observatoryState.replay = replayObj;
            observatoryState.authorized = null;
            observatoryState.fixtureId = state.networkSession.matchId;
            observatoryState._replayLoadedFor = state.networkSession.matchId;
            observatoryState.frame = 0;
            observatoryState.playing = false;
            observatoryState.replayKind = 'corpus';
            observatoryState.visibility = 'public';
            location.hash = '#/watch';
          } catch (err) {
            container.innerHTML = `<div class="play-error" role="alert"><h2>Failed to load replay</h2><p>${esc(err.message)}</p><a href="#/play/online" class="secondary-button">Back to Online</a></div>`;
          }
        } else {
          // Local match — save replay and redirect
          const { createReplayRecord, saveReplay } = await import('./replay-library.js');
          const record = await createReplayRecord(state.session);
          await saveReplay(record);
          location.hash = '#/play/replays';
        }
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
      } else if (action === 'network-rematch') {
        // Request a rematch from the terminal screen of a completed network match.
        // The server creates a new match and sends a REMATCH_INVITE to the opponent.
        if (state.networkSession && state.networkSession.status === 'TERMINAL') {
          try {
            const result = await state.networkSession.requestRematch();
            if (result.ok) {
              // Session has transitioned to IN_LOBBY for the new match — re-render
              await renderActiveMatch(container);
            } else {
              // Show error briefly on the button
              const btn = el;
              const orig = btn.textContent;
              btn.textContent = result.error ?? 'Rematch failed';
              btn.disabled = true;
              setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
            }
          } catch (err) {
            console.warn('Rematch request failed:', err?.message ?? err);
          }
        }
      } else if (action === 'accept-rematch') {
        // Accept a rematch invite from the opponent. Sends JOIN_MATCH with the
        // invite code from the REMATCH_INVITE message.
        if (state.networkSession && state.networkSession.rematchInvite) {
          const inviteCode = el.getAttribute('data-invite-code') ?? state.networkSession.rematchInvite.inviteCode;
          try {
            const result = await state.networkSession.acceptRematchInvite(inviteCode);
            if (result.ok) {
              await renderActiveMatch(container);
            } else {
              console.warn('Failed to accept rematch:', result.error);
            }
          } catch (err) {
            console.warn('Accept rematch failed:', err?.message ?? err);
          }
        }
      } else if (action === 'decline-rematch') {
        // Decline a rematch invite — just clears the pending invite.
        if (state.networkSession) {
          state.networkSession.declineRematchInvite();
          await renderActiveMatch(container);
        }
      } else if (action === 'rematch-same-seed') {
        await startNewMatch({ ...state.session.setup }, container);
      } else if (action === 'new-seed') {
        const newSeed = (Math.random() * 4294967296) >>> 0 || 1;
        await startNewMatch({ ...state.session.setup, seed: newSeed }, container);
      } else if (action === 'return-to-hub' || action === 'exit-match') {
        // v0.28: For network matches, exit-match is only available in terminal state.
        // For active network matches, the X button triggers 'forfeit-match' instead.
        stopAutosave();
        state.session = null;
        state.inspectorCardId = null;
        state.inspectorFaceView = 'board';
        // Clean up beforeunload protection before navigating away
        if (typeof removeBeforeUnloadProtection === 'function') {
          removeBeforeUnloadProtection();
        }
        location.hash = '#/';
      } else if (action === 'forfeit-match') {
        // v0.28: Forfeit confirmation dialog for active network PvP matches.
        // Shows an explicit confirmation; canceling keeps the player in the match.
        showForfeitConfirmation(container, state);
      } else if (action === 'keyboard-help') {
        state.showKeyboardHelp = !state.showKeyboardHelp;
        renderActiveMatch(container);
      } else if (action === 'toggle-rules') {
        // Toggle rules/help overlay
        state.showRulesHelp = !state.showRulesHelp;
        renderActiveMatch(container);
      } else if (action === 'toggle-stats') {
        // Toggle match stats overlay
        state.showMatchStats = !state.showMatchStats;
        renderActiveMatch(container);
      } else if (action === 'toggle-inspector') {
        // Toggle card inspector — open for selected card or close
        if (state.inspectorCardId) {
          state.inspectorCardId = null;
          state.inspectorFaceView = 'board';
        } else if (state.selectedSourceCardId) {
          state.inspectorCardId = state.selectedSourceCardId;
          state.inspectorFaceView = 'board';
        }
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

// ═══════════════════════════════════════════════════════════════
// v0.28: PvP Match Experience — Forfeit confirmation, rail divider
// drag, and beforeunload protection helpers.
// ═══════════════════════════════════════════════════════════════

/**
 * Show a forfeit confirmation dialog for active network PvP matches.
 * Canceling keeps the player in the match. Confirming submits the
 * authoritative leave/forfeit operation to the server.
 * @param {HTMLElement} container
 * @param {object} state
 */
export function showForfeitConfirmation(container, state) {
  // Remove any existing dialog
  const existing = container.querySelector('.rd-forfeit-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.className = 'rd-forfeit-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'rd-forfeit-title');
  dialog.setAttribute('data-testid', 'forfeit-dialog');
  dialog.innerHTML = `
    <div class="rd-forfeit-dialog-content">
      <h2 id="rd-forfeit-title" class="rd-forfeit-dialog-title">Forfeit Match?</h2>
      <p class="rd-forfeit-dialog-msg">This will count as a loss. Your opponent will be declared the winner by the server.</p>
      <div class="rd-forfeit-dialog-actions">
        <button class="rd-forfeit-cancel" data-action="forfeit-cancel" data-testid="forfeit-cancel">Stay in Match</button>
        <button class="rd-forfeit-confirm" data-action="forfeit-confirm" data-testid="forfeit-confirm">Forfeit</button>
      </div>
    </div>
  `;
  container.appendChild(dialog);

  const cancelBtn = dialog.querySelector('[data-action="forfeit-cancel"]');
  const confirmBtn = dialog.querySelector('[data-action="forfeit-confirm"]');

  cancelBtn.addEventListener('click', () => {
    dialog.remove();
    // Player stays in the match — no state change
  });

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Forfeiting…';
    cancelBtn.disabled = true;
    try {
      // Submit the authoritative leave/forfeit to the server
      if (state.networkSession && typeof state.networkSession.forfeit === 'function') {
        await state.networkSession.forfeit();
      }
      // The server will broadcast the terminal state; the match will
      // transition to the Results/terminal state via the normal view update.
      // We remove the dialog but DON'T navigate away — the terminal state
      // will handle the transition.
      dialog.remove();
    } catch (err) {
      console.warn('Forfeit failed:', err.message);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Forfeit';
      cancelBtn.disabled = false;
    }
  });

  // Focus the cancel button by default (safer choice)
  cancelBtn.focus();
}

/**
 * Bind drag behavior to the rail divider between Actions and Chat.
 * Allows the user to resize the two sections by dragging.
 * @param {HTMLElement} divider
 * @param {HTMLElement} container
 */
export function bindRailDividerDrag(divider, container) {
  const inner = container.querySelector('.rd-right-rail-bottom-inner');
  if (!inner) return;

  let dragging = false;
  let startY = 0;
  let startChatSplit = 40;

  const onPointerDown = (e) => {
    dragging = true;
    divider.classList.add('dragging');
    inner.classList.add('dragging');
    startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const currentSplit = parseFloat(inner.dataset.chatSplit ?? '40');
    startChatSplit = isNaN(currentSplit) ? 40 : currentSplit;
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const delta = clientY - startY;
    const containerRect = inner.getBoundingClientRect();
    if (containerRect.height === 0) return;
    // Convert pixel delta to percentage.
    // Dragging the divider DOWN (positive delta) moves the divider down,
    // giving Actions (top) MORE space and Chat (bottom) LESS space.
    // So chat percentage DECREASES when dragging down.
    const deltaPct = (delta / containerRect.height) * 100;
    let newSplit = startChatSplit - deltaPct;
    // Clamp to reasonable bounds
    newSplit = Math.max(10, Math.min(80, newSplit));
    inner.dataset.chatSplit = newSplit.toFixed(1);
    // Update flex values: chat gets newSplit%, actions gets the rest
    const actionsSection = inner.querySelector('.rd-rail-actions-section');
    const chatSection = inner.querySelector('.rd-rail-chat-section');
    if (actionsSection) actionsSection.style.flex = `${100 - newSplit} 1 0`;
    if (chatSection) chatSection.style.flex = `${newSplit} 1 0`;
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    inner.classList.remove('dragging');
  };

  divider.addEventListener('mousedown', onPointerDown);
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);

  // Touch support
  divider.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp);

  // Keyboard support: arrow keys to resize
  divider.addEventListener('keydown', (e) => {
    const currentSplit = parseFloat(inner.dataset.chatSplit ?? '40');
    let newSplit = isNaN(currentSplit) ? 40 : currentSplit;
    // ArrowUp = move divider up = Actions shrinks, Chat grows → split increases
    // ArrowDown = move divider down = Actions grows, Chat shrinks → split decreases
    if (e.key === 'ArrowUp') {
      newSplit = Math.min(80, newSplit + 5);
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      newSplit = Math.max(10, newSplit - 5);
      e.preventDefault();
    } else {
      return;
    }
    inner.dataset.chatSplit = newSplit.toFixed(1);
    const actionsSection = inner.querySelector('.rd-rail-actions-section');
    const chatSection = inner.querySelector('.rd-rail-chat-section');
    if (actionsSection) actionsSection.style.flex = `${100 - newSplit} 1 0`;
    if (chatSection) chatSection.style.flex = `${newSplit} 1 0`;
  });
}

// ── beforeunload protection for active network matches ──────────

let _beforeUnloadHandler = null;

/**
 * Add a beforeunload event listener that warns the user when they
 * try to close/refresh the tab during an active network PvP match.
 * The handler is removed when the match ends or the session is
 * no longer active.
 */
export function addBeforeUnloadProtection() {
  if (_beforeUnloadHandler) return; // Already protected
  _beforeUnloadHandler = (e) => {
    // Modern browsers ignore custom messages, but returning any
    // non-empty string triggers the confirmation dialog.
    e.preventDefault();
    e.returnValue = 'You have an active online match. Leaving now may result in a forfeit.';
    return e.returnValue;
  };
  window.addEventListener('beforeunload', _beforeUnloadHandler);
}

/**
 * Remove the beforeunload protection listener. Must be called when
 * the match ends, the session is no longer active, or the user
 * explicitly confirms they want to leave.
 */
export function removeBeforeUnloadProtection() {
  if (_beforeUnloadHandler) {
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
    _beforeUnloadHandler = null;
  }
}
