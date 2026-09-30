// ═══════════════════════════════════════════════════════════════
// guided-view.mjs — Guided Exhibition UI orchestration
//
// Manages the guided exhibition lifecycle: intro → match → debrief.
// The GuidedController drives the match; this module renders the
// game state with guided overlays (commentary, hints, glow).
//
// Interaction model:
//   - Cards in hand are clickable → opens a modal with actions for that card
//   - Draw pile is clickable → draw action
//   - Swap bar face-up card is clickable → face-up draw
//   - Only the glowing card is highlighted as the recommended pick
//   - phase/enter-action is auto-executed by the controller (never shown)
// ═══════════════════════════════════════════════════════════════

import { GuidedController } from './guided-controller.mjs';
import { GUIDED_EXHIBITION_01 } from './guided-fixture.mjs';
import {
  renderGuidedIntro,
  renderCommentaryRail,
  renderGuidedHud,
  renderGuidedDebrief,
  renderReplaySelector,
  escapeHtml,
} from './guided-renderer.mjs';
import { state } from '../play-state.js';
import { getCardDefinition } from '../../card-face-data.js';

// ── Rule text beautification ──────────────────────────────────
// Bold key game terms, format sentences, and style the official
// rulebook text for the modal hover explanations.

const RULE_TERMS = [
  // Zones
  { pattern: /\bPoint Row\b/g, cls: 'rt-zone' },
  { pattern: /\bEnduring Row\b/g, cls: 'rt-zone' },
  { pattern: /\bDraw Pile\b/g, cls: 'rt-zone' },
  { pattern: /\bSwap Bar\b/g, cls: 'rt-zone' },
  { pattern: /\bGraveyard\b/g, cls: 'rt-zone' },
  { pattern: /\bExile\b/g, cls: 'rt-zone' },
  // Abbreviations
  { pattern: /\bPR\b/g, cls: 'rt-abbr' },
  { pattern: /\bER\b/g, cls: 'rt-abbr' },
  { pattern: /\bDP\b/g, cls: 'rt-abbr' },
  { pattern: /\bGY\b/g, cls: 'rt-abbr' },
  { pattern: /\bFT\b/g, cls: 'rt-abbr' },
  { pattern: /\bOTT\b/g, cls: 'rt-abbr' },
  // Mechanics
  { pattern: /\bAegis\b/g, cls: 'rt-mechanic' },
  { pattern: /\bScuttle[ds]?\b/g, cls: 'rt-mechanic' },
  { pattern: /\bAnchor\b/g, cls: 'rt-mechanic' },
  { pattern: /\bAnchored\b/g, cls: 'rt-mechanic' },
  { pattern: /\bGuard\b/g, cls: 'rt-mechanic' },
  { pattern: /\bTap\b/g, cls: 'rt-mechanic' },
  { pattern: /\btapped\b/g, cls: 'rt-mechanic' },
  { pattern: /\bUntap\b/g, cls: 'rt-mechanic' },
  { pattern: /\bJacked\b/g, cls: 'rt-mechanic' },
  { pattern: /\bVulnerable\b/g, cls: 'rt-mechanic' },
  { pattern: /\bRoyal Shield\b/g, cls: 'rt-mechanic' },
  { pattern: /\bRoyal Marriage\b/g, cls: 'rt-mechanic' },
  { pattern: /\bBoard Lock\b/g, cls: 'rt-mechanic' },
  { pattern: /\bGoal Shift\b/g, cls: 'rt-mechanic' },
  { pattern: /\bHand Raid\b/g, cls: 'rt-mechanic' },
  { pattern: /\bRow Clear\b/g, cls: 'rt-mechanic' },
  { pattern: /\bTotal Clear\b/g, cls: 'rt-mechanic' },
  { pattern: /\bTopdeck Cast\b/g, cls: 'rt-mechanic' },
  { pattern: /\bDeep Draw\b/g, cls: 'rt-mechanic' },
  { pattern: /\bDig\b/g, cls: 'rt-mechanic' },
  { pattern: /\bDisrupt\b/g, cls: 'rt-mechanic' },
  { pattern: /\bPurge\b/g, cls: 'rt-mechanic' },
  { pattern: /\bBounce\b/g, cls: 'rt-mechanic' },
  { pattern: /\bMill\b/g, cls: 'rt-mechanic' },
  { pattern: /\bRummage\b/g, cls: 'rt-mechanic' },
  { pattern: /\bScrap\b/g, cls: 'rt-mechanic' },
  { pattern: /\bCounter\b/g, cls: 'rt-mechanic' },
  { pattern: /\bUltra\b/g, cls: 'rt-mechanic' },
  { pattern: /\bSudden Death\b/g, cls: 'rt-mechanic' },
  { pattern: /\bSolo Wild\b/g, cls: 'rt-mechanic' },
  { pattern: /\bWild Sovereignty\b/g, cls: 'rt-mechanic' },
  { pattern: /\bStack Theft\b/g, cls: 'rt-mechanic' },
  { pattern: /\bTempo Spike\b/g, cls: 'rt-mechanic' },
  { pattern: /\bExile-Bound\b/g, cls: 'rt-mechanic' },
  { pattern: /\bRevealed-Until-Start\b/g, cls: 'rt-mechanic' },
  // Card ranks when mentioned as mechanics
  { pattern: /\bMini-Turns?\b/g, cls: 'rt-mechanic' },
  { pattern: /\bFull Turn\b/g, cls: 'rt-mechanic' },
  { pattern: /\bStart Phase\b/g, cls: 'rt-mechanic' },
  { pattern: /\bAction phase\b/g, cls: 'rt-mechanic' },
  { pattern: /\bSetup phase\b/g, cls: 'rt-mechanic' },
  // Star abilities
  { pattern: /⭐\d/g, cls: 'rt-star' },
  { pattern: /⭐A\b/g, cls: 'rt-star' },
  // Card identities (e.g. A♠, 9♣, 10♦)
  { pattern: /\b([AKQJ]|10|[2-9])([♣♦♥♠])\b/g, cls: 'rt-card' },
];

/**
 * Beautify official rule text for display in the modal.
 * - Escapes HTML
 * - Bolds key game terms with semantic CSS classes
 * - Splits long text into paragraphs on sentence boundaries
 */
function beautifyRuleText(text) {
  if (!text) return '';
  // First escape HTML
  let html = escapeHtml(text);
  // Apply term highlighting
  for (const term of RULE_TERMS) {
    html = html.replace(term.pattern, (match) => {
      return `<span class="${term.cls}">${match}</span>`;
    });
  }
  // Split into paragraphs: if text has multiple sentences, break after
  // the first sentence (which is usually the summary) for readability
  // Only do this for longer texts
  if (text.length > 120) {
    // Find sentence boundaries (. ) and wrap subsequent sentences
    const sentences = html.split(/(?<=\.\s)/);
    if (sentences.length > 1) {
      const firstPara = sentences[0];
      const rest = sentences.slice(1).join(' ');
      html = `<span class="rt-lead">${firstPara}</span> <span class="rt-detail">${rest}</span>`;
    }
  }
  return html;
}

/**
 * Render the guided exhibition intro screen.
 * @param {HTMLElement} container
 * @param {object} opts - { onStart: function }
 */
export function renderGuidedIntroScreen(container, opts = {}) {
  container.innerHTML = renderGuidedIntro(GUIDED_EXHIBITION_01);
  const startBtn = container.querySelector('[data-action="guided-start"]');
  if (startBtn) {
    startBtn.addEventListener('click', () => opts.onStart?.());
  }
}

/**
 * Start the guided exhibition match.
 * @param {HTMLElement} container
 * @param {object} opts - { guidanceLevel: string }
 */
export async function startGuidedMatch(container, opts = {}) {
  const { guidanceLevel = 'full' } = opts;

  container.innerHTML = renderMatchLayout();

  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, {
    guidanceLevel,
    onState: (s) => {
      console.log('[guided] onState', {
        cp: ctrl.getCurrentCheckpoint()?.id,
        phase: s?.phase,
        turn: s?.fullTurnSequence,
        active: s?.activePlayerId,
        waiting: ctrl.isWaitingForPlayer(),
        status: ctrl.getStatus(),
      });
      updateGuidedView(container, ctrl);
    },
    onCommentary: (cue) => showCommentary(container, ctrl, cue),
    onHint: (stage, text) => showHint(container, ctrl, stage, text),
    onGlow: (ids, level) => applyGlow(container, ids, level),
    onCheckpoint: (cp) => {
      console.log('[guided] onCheckpoint', cp?.id);
      updateHud(container, ctrl);
    },
    onWaiting: (frame, scripted, matchingAction) => showWaitingState(container, ctrl, frame, scripted, matchingAction),
    onError: (err) => {
      console.error('[guided] onError', err);
      showError(container, err);
    },
    onTerminal: (terminalState) => {
      console.log('[guided] onTerminal', terminalState?.winner);
      showDebrief(container, terminalState);
    },
  });

  state.guidedController = ctrl;
  state.guidedPhase = 'match';
  await ctrl.start();

  // Tick loop for hint escalation
  state.guidedTickInterval = setInterval(() => {
    if (ctrl.getStatus() === 'playing' || ctrl.getStatus() === 'checkpoint') {
      ctrl.tick(100);
    }
  }, 100);
}

// ── Match layout ──────────────────────────────────────────────

function renderMatchLayout() {
  return `
    <div class="guided-match" data-testid="guided-match">
      <div class="guided-hud" data-testid="guided-hud">
        <div class="guided-hud-status">playing</div>
      </div>
      <div class="guided-main">
        <div class="guided-board" data-testid="guided-board">
          <div class="guided-loading">Preparing exhibition…</div>
        </div>
      </div>
      <div class="guided-commentary-area" data-testid="guided-commentary-area"></div>
      <div class="guided-modal-host" data-testid="guided-modal-host"></div>
    </div>
  `;
}

// ── Board rendering ──────────────────────────────────────────

function updateGuidedView(container, ctrl) {
  try {
    const gameState = ctrl.getState();
    if (!gameState) return;

    // Clear recommended highlight when not waiting for player
    if (!ctrl.isWaitingForPlayer()) {
      state.guidedRecommended = null;
    }

    const boardEl = container.querySelector('[data-testid="guided-board"]');
    if (boardEl) {
      boardEl.innerHTML = renderBoard(gameState, ctrl);
      wireBoardInteractions(container, ctrl);
    } else {
      console.warn('[guided] Board element not found — container may have been replaced');
    }

    updateHud(container, ctrl);
  } catch (err) {
    console.error('[guided] updateGuidedView failed:', err);
  }
}

function renderBoard(gameState, ctrl) {
  const p1 = gameState.players?.P1;
  const p2 = gameState.players?.P2;
  const p1Score = computeScore(gameState, 'P1');
  const p2Score = computeScore(gameState, 'P2');
  const p1Goal = p1?.goal ?? 21;
  const p2Goal = p2?.goal ?? 21;

  const activePlayer = gameState.activePlayerId ?? '?';
  const isPlayerTurn = activePlayer === 'P1';
  const phase = gameState.phase ?? '?';
  const turn = gameState.fullTurnSequence ?? '?';
  const waiting = ctrl.isWaitingForPlayer();
  const glowIds = ctrl.getGlow()?.identities ?? [];

  // Recommended action highlight — from showWaitingState
  const rec = state.guidedRecommended;

  // Card rendering — clickable if in player's hand and waiting
  const cardHtml = (id, opts = {}) => {
    const card = gameState.cards?.[id];
    if (!card) return '';
    const identity = card.identity ?? '??';
    const cls = ['guided-card'];
    if (opts.zone) cls.push(`guided-card-${opts.zone}`);
    const isHand = opts.zone === 'hand';
    const isSwap = opts.zone === 'swap';
    const canClick = (isHand || isSwap) && waiting;
    if (canClick) cls.push('guided-card-clickable');
    if (glowIds.includes(identity)) cls.push('guided-glow');
    // Mark as recommended if this card matches the scripted source/target
    if (canClick && rec) {
      const isRecSource = rec.sourceIdentity && identity === rec.sourceIdentity;
      const isRecTarget = rec.targetIdentity && identity === rec.targetIdentity;
      if (isRecSource || isRecTarget) cls.push('guided-card-recommended');
    }
    const clickAttr = canClick ? ` data-card-id="${id}"` : '';
    const glowAttr = glowIds.includes(identity) ? ` data-glow-level="${ctrl.getGlow()?.level ?? 'ambient'}"` : '';
    const badge = (canClick && rec && cls.includes('guided-card-recommended')) ? ' <span class="guided-card-badge">★</span>' : '';
    return `<div class="${cls.join(' ')}"${clickAttr} data-identity="${escapeHtml(identity)}"${glowAttr} role="${canClick ? 'button' : 'listitem'}" tabindex="${canClick ? '0' : '-1'}" aria-label="${escapeHtml(identity)}${canClick ? ' — click for actions' : ''}">${escapeHtml(identity)}${badge}</div>`;
  };

  const renderZone = (ids, label, opts = {}) => {
    const cards = (ids ?? []).map(id => cardHtml(id, opts)).join('');
    return `
      <div class="guided-zone guided-zone-${opts.zone ?? 'default'}" role="list" aria-label="${escapeHtml(label)}">
        <div class="guided-zone-label">${escapeHtml(label)}</div>
        <div class="guided-zone-cards">${cards || '<em class="guided-zone-empty">empty</em>'}</div>
      </div>
    `;
  };

  // Draw pile and swap bar — clickable when waiting
  const dpCount = gameState.zones?.dp?.length ?? 0;
  const swapBar = gameState.zones?.swapBar ?? [];
  const gyCount = gameState.zones?.gy?.length ?? 0;
  const canDraw = waiting && dpCount > 0;
  const canSwap = waiting && swapBar.length > 0;

  const drawRecommended = canDraw && rec?.family === 'draw';
  const drawPileHtml = `
    <div class="guided-zone guided-zone-dp ${canDraw ? 'guided-zone-clickable' : ''} ${drawRecommended ? 'guided-zone-recommended' : ''}" ${canDraw ? 'data-action="draw" role="button" tabindex="0"' : ''} aria-label="Draw pile, ${dpCount} cards">
      <div class="guided-zone-label">Draw Pile</div>
      <div class="guided-zone-cards guided-pile">${dpCount} cards${canDraw ? ' — click to draw' : ''}</div>
      ${drawRecommended ? '<span class="guided-zone-badge">recommended</span>' : ''}
    </div>
  `;

  const swapBarHtml = swapBar.length > 0 ? `
    <div class="guided-zone guided-zone-swap ${canSwap ? 'guided-zone-clickable' : ''}" aria-label="Swap bar">
      <div class="guided-zone-label">Swap Bar</div>
      <div class="guided-zone-cards">
        ${swapBar.map(id => cardHtml(id, { zone: 'swap' })).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="guided-board-header">
      <div class="guided-scores">
        <div class="guided-score guided-score-p1 ${isPlayerTurn ? 'guided-score-active' : ''}">
          <span class="guided-score-label">You</span>
          <span class="guided-score-value">${p1Score}<span class="guided-score-goal">/${p1Goal}</span></span>
        </div>
        <div class="guided-score guided-score-p2 ${!isPlayerTurn ? 'guided-score-active' : ''}">
          <span class="guided-score-label">Rival</span>
          <span class="guided-score-value">${p2Score}<span class="guided-score-goal">/${p2Goal}</span></span>
        </div>
      </div>
      <div class="guided-match-info">
        <span class="guided-turn">Turn ${turn}</span>
        <span class="guided-phase">${escapeHtml(phase)}</span>
        ${waiting ? '<span class="guided-your-turn">Your move</span>' : ''}
      </div>
    </div>

    <div class="guided-board-body">
      <div class="guided-rival-area">
        ${renderZone(p2?.pr, 'Rival Points', { zone: 'pr' })}
        ${renderZone(p2?.er, 'Rival Enduring Row', { zone: 'er' })}
      </div>

      <div class="guided-shared-area">
        ${drawPileHtml}
        ${swapBarHtml}
        <div class="guided-zone guided-zone-gy">
          <div class="guided-zone-label">Graveyard</div>
          <div class="guided-zone-cards guided-pile">${gyCount} cards</div>
        </div>
      </div>

      <div class="guided-player-area">
        ${renderZone(p1?.pr, 'Your Points', { zone: 'pr' })}
        ${renderZone(p1?.er, 'Your Enduring Row', { zone: 'er' })}
        ${renderZone(p1?.hand, 'Your Hand', { zone: 'hand' })}
      </div>
    </div>
  `;
}

// ── Board interactions ────────────────────────────────────────

function wireBoardInteractions(container, ctrl) {
  // Click on a hand card → open action modal
  container.querySelectorAll('[data-testid="guided-board"] .guided-card-clickable[data-card-id]').forEach(card => {
    card.addEventListener('click', () => {
      const cardId = card.dataset.cardId;
      openCardModal(container, ctrl, cardId);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const cardId = card.dataset.cardId;
        openCardModal(container, ctrl, cardId);
      }
    });
  });

  // Click on draw pile → open draw modal
  const drawZone = container.querySelector('[data-action="draw"]');
  if (drawZone) {
    drawZone.addEventListener('click', () => openDrawModal(container, ctrl));
    drawZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawModal(container, ctrl); }
    });
  }
}

// ── Card action modal ─────────────────────────────────────────

function openCardModal(container, ctrl, cardId) {
  const frame = ctrl.getLegalActionFrame();
  if (!frame) return;
  const gameState = ctrl.getState();
  const card = gameState.cards?.[cardId];
  if (!card) return;
  const identity = card.identity ?? '??';

  // Find all legal actions that involve this card — as a source OR a target.
  // Source: the card is played from hand (score, effect, swap face-down, etc.)
  // Target: the card is being taken/affected (swap-bar face-up-draw, tap target, etc.)
  const cardActions = frame.actions.filter(a =>
    (a.sourceCardIds ?? []).includes(cardId) ||
    (a.targetCardIds ?? []).includes(cardId)
  );

  // Deduplicate by actionId
  const seenIds = new Set();
  const deduped = cardActions.filter(a => {
    if (seenIds.has(a.actionId)) return false;
    seenIds.add(a.actionId);
    return true;
  });

  // Group by family+mode to collapse variant spam (e.g. 20 Ultra combos,
  // every hand×swapbar pair for face-down swap, every target for nine-tap).
  // Solo-wild and voltage actions group by family only — they have per-rank
  // modes that would otherwise produce one button per possible copy/guess.
  // Show one representative per group — prefer the scripted match if present.
  const scripted = ctrl.getPendingScripted();
  const groups = new Map();
  for (const action of deduped) {
    const groupKey = (action.family === 'solo-wild' || action.family === 'voltage')
      ? action.family
      : `${action.family}/${action.mode ?? ''}`;
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, action);
    } else if (scripted) {
      // Prefer the one that matches the scripted intent
      const isMatch = matchActionToScripted([action], scripted, gameState);
      const existingMatch = matchActionToScripted([existing], scripted, gameState);
      if (isMatch && !existingMatch) {
        groups.set(groupKey, action);
      }
    }
  }
  const uniqueActions = [...groups.values()];

  if (uniqueActions.length === 0) {
    showModal(container, `
      <div class="guided-modal-card-header">${escapeHtml(identity)}</div>
      <div class="guided-modal-no-actions">No actions available for this card right now.</div>
      <button class="btn-secondary" data-modal-close>Close</button>
    `);
    return;
  }

  // Find which action matches the scripted intent
  const matchingAction = scripted ? matchActionToScripted(uniqueActions, scripted, gameState) : null;

  const actionButtons = uniqueActions.map((action, i) => {
    const desc = describeAction(action, gameState);
    const isMatch = matchingAction && action.actionId === matchingAction.actionId;
    const cls = isMatch ? 'guided-modal-action guided-modal-action-recommended' : 'guided-modal-action';
    return `<button class="${cls}" data-action-id="${escapeHtml(action.actionId)}" data-testid="modal-action-${i}">
      <span class="guided-modal-action-title">${escapeHtml(desc.title)}</span>
      <span class="guided-modal-action-explanation">${beautifyRuleText(desc.explanation)}</span>
      ${isMatch ? '<span class="guided-modal-action-badge">recommended</span>' : ''}
    </button>`;
  }).join('');

  showModal(container, `
    <div class="guided-modal-card-header">
      <span class="guided-modal-card-identity">${escapeHtml(identity)}</span>
    </div>
    <div class="guided-modal-actions">${actionButtons}</div>
    <button class="btn-secondary guided-modal-close" data-modal-close>Cancel</button>
  `);

  // Wire action buttons
  container.querySelectorAll('[data-action-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionId = btn.dataset.actionId;
      const action = uniqueActions.find(a => a.actionId === actionId);
      if (action) {
        closeModal(container);
        const result = ctrl.playerAction(action);
        if (!result.accepted) {
          flashMessage(container, result.reason === 'off-script'
            ? 'That action is off-script — try the recommended one.'
            : 'Action not accepted.');
        }
      }
    });
  });
}

function openDrawModal(container, ctrl) {
  const frame = ctrl.getLegalActionFrame();
  if (!frame) return;
  const gameState = ctrl.getState();

  // Find draw actions, group by mode to collapse variants
  const drawActions = frame.actions.filter(a => a.family === 'draw');
  if (drawActions.length === 0) {
    showModal(container, `
      <div class="guided-modal-card-header">Draw Pile</div>
      <div class="guided-modal-no-actions">Cannot draw right now.</div>
      <button class="btn-secondary" data-modal-close>Close</button>
    `);
    return;
  }

  // Group by family+mode — one representative per type
  const scripted = ctrl.getPendingScripted();
  const drawGroups = new Map();
  for (const action of drawActions) {
    const key = `${action.family}/${action.mode ?? ''}`;
    if (!drawGroups.has(key)) drawGroups.set(key, action);
  }
  const uniqueDrawActions = [...drawGroups.values()];

  const matchingAction = scripted ? matchActionToScripted(uniqueDrawActions, scripted, gameState) : null;

  const actionButtons = uniqueDrawActions.map((action, i) => {
    const desc = describeAction(action, gameState);
    const isMatch = matchingAction && action.actionId === matchingAction.actionId;
    const cls = isMatch ? 'guided-modal-action guided-modal-action-recommended' : 'guided-modal-action';
    return `<button class="${cls}" data-action-id="${escapeHtml(action.actionId)}" data-testid="modal-action-${i}">
      <span class="guided-modal-action-title">${escapeHtml(desc.title)}</span>
      <span class="guided-modal-action-explanation">${beautifyRuleText(desc.explanation)}</span>
      ${isMatch ? '<span class="guided-modal-action-badge">recommended</span>' : ''}
    </button>`;
  }).join('');

  showModal(container, `
    <div class="guided-modal-card-header">Draw Pile</div>
    <div class="guided-modal-actions">${actionButtons}</div>
    <button class="btn-secondary guided-modal-close" data-modal-close>Cancel</button>
  `);

  container.querySelectorAll('[data-action-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionId = btn.dataset.actionId;
      const action = uniqueDrawActions.find(a => a.actionId === actionId);
      if (action) {
        closeModal(container);
        const result = ctrl.playerAction(action);
        if (!result.accepted) {
          flashMessage(container, 'Action not accepted.');
        }
      }
    });
  });
}

function showModal(container, innerHtml) {
  const host = container.querySelector('[data-testid="guided-modal-host"]');
  if (!host) return;
  host.innerHTML = `
    <div class="guided-modal-overlay" data-testid="guided-modal" role="dialog" aria-modal="true">
      <div class="guided-modal-content">${innerHtml}</div>
    </div>
  `;
  // Wire close buttons
  host.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(container));
  });
  // Close on overlay click
  const overlay = host.querySelector('.guided-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(container);
    });
  }
  // Focus first action button
  const firstAction = host.querySelector('[data-action-id]');
  if (firstAction) firstAction.focus();
}

function closeModal(container) {
  const host = container.querySelector('[data-testid="guided-modal-host"]');
  if (host) host.innerHTML = '';
}

function flashMessage(container, msg) {
  const board = container.querySelector('[data-testid="guided-board"]');
  if (!board) return;
  const flash = document.createElement('div');
  flash.className = 'guided-flash';
  flash.textContent = msg;
  board.appendChild(flash);
  setTimeout(() => flash.remove(), 2000);
}

// ── Action matching ───────────────────────────────────────────

/**
 * Match an action from a subset to the scripted intent.
 * Uses the same logic as the runtime's matchIntent but works on
 * the subset of actions passed to the modal.
 */
function matchActionToScripted(actions, scripted, gameState) {
  const intent = scripted.intent;
  return actions.find(a => {
    if (intent.family && a.family !== intent.family) return false;
    if (intent.mode && a.mode !== intent.mode) return false;
    if (intent.timingClass && a.timingClass !== intent.timingClass) return false;
    if (intent.sourceIdentity) {
      const srcIds = a.sourceCardIds ?? [];
      if (!srcIds.some(id => gameState.cards?.[id]?.identity === intent.sourceIdentity)) return false;
    }
    if (intent.targetIdentity) {
      const tgtIds = a.targetCardIds ?? [];
      if (!tgtIds.some(id => gameState.cards?.[id]?.identity === intent.targetIdentity)) return false;
    }
    return true;
  }) ?? null;
}

/**
 * Convert a legal action to a human-readable title and full official rule text.
 * Returns { title, explanation }.
 * The title is shown on the button; the explanation appears on hover and
 * uses the official rulebook text from card-face-data.js where available.
 */
function describeAction(action, gameState) {
  const cardName = (id) => gameState.cards?.[id]?.identity ?? id;
  const src = (action.sourceCardIds ?? []).map(cardName).join(' + ');
  const tgt = (action.targetCardIds ?? []).map(cardName).join(' + ');
  const mode = action.mode ?? '';

  // ── Score ──
  if (action.family === 'score' && mode === 'points') {
    const def = getCardDefinition(src);
    const pv = def?.prValue ?? identityPointValue(src);
    // Pull card-specific scoring rules from the card's notes
    const scoringNotes = (def?.notes ?? []).filter(n =>
      /scor|points|scuttle|immune|jack|aegis/i.test(n)
    );
    const protection = scoringNotes.length > 0
      ? ` ${scoringNotes.join(' ')}`
      : ' No special protection while scored.';
    return {
      title: `Score ${src} for Points (${pv})`,
      explanation: `Place ${src} into your Point Row. It contributes ${pv} Points toward your Goal.${protection}`,
    };
  }

  // ── Swap Bar ──
  if (action.family === 'swap-bar') {
    if (mode === 'face-up-draw') {
      return {
        title: `Take ${tgt} from the Swap Bar`,
        explanation: `Pick up ${tgt} from the Swap Bar and add it to your hand. This is a Swap Bar Use — your once-per-Full-Turn exchange. No replenishment occurs until after the exchange resolves.`,
      };
    }
    if (mode === 'face-down') {
      return {
        title: `Swap ${src} face-down onto the Swap Bar`,
        explanation: `Place ${src} face-down onto the Swap Bar, then draw a replacement card from the top of the Draw Pile. Your opponent won't see what you put down — they'll only learn it if they take the face-down card later. This is a Swap Bar Use — your once-per-Full-Turn exchange.`,
      };
    }
  }

  // ── Draw ──
  if (action.family === 'draw') {
    return {
      title: `Draw from the Draw Pile`,
      explanation: `Take the top card of the Draw Pile and add it to your hand. This is your main Action for the turn — you won't be able to play another Action after this.`,
    };
  }

  // ── Anchor ──
  if (action.family === 'anchor') {
    return describeAnchor(action, src, tgt, mode);
  }

  // ── Effects ──
  if (action.family === 'effect') {
    return describeEffect(action, src, tgt, mode);
  }

  // ── Solo Wild ──
  if (action.family === 'solo-wild') {
    return describeSoloWild(action, src, mode);
  }

  // ── Phase ──
  if (action.family === 'phase') {
    if (mode === 'enter-action') {
      return {
        title: `Enter Action Phase`,
        explanation: `Transition from Setup to your Action phase. You can now play a card from your hand for Points or for effect.`,
      };
    }
    if (mode === 'end') {
      return {
        title: `End Your Turn`,
        explanation: `Pass your turn to your opponent.`,
      };
    }
  }

  // ── Response / Counter ──
  if (action.family === 'response-decline') {
    return {
      title: `Decline to Respond`,
      explanation: `Choose not to counter your opponent's action. The action resolves as declared.`,
    };
  }
  if (action.family === 'counter') {
    return describeCounter(action, src, mode);
  }
  if (action.family === 'ultra') {
    return describeUltra(action, src, mode);
  }

  // ── Voltage (private choice — guess a card) ──
  if (action.family === 'voltage') {
    const match = mode.match(/four-guess-(.+)/);
    const guessed = match ? match[1] : mode;
    return {
      title: `Voltage Guess: ${guessed}`,
      explanation: `Name ${guessed} as your guess for the Voltage private choice. If correct, the effect resolves in your favor.`,
    };
  }

  // ── Private choice / Anchor private choice ──
  if (action.family === 'private-choice' || action.family === 'anchor-private-choice') {
    if (mode === 'rank5-rummage') {
      return {
        title: `Rummage: Take ${tgt} from the Graveyard`,
        explanation: `Rummage ${tgt} from the Graveyard into your hand as Revealed-Until-Start. This is part of the Five's Recycle Line effect: mill up to 2 cards from the top of the Draw Pile to the Graveyard, then rummage 1 legal card from the Graveyard into your hand, then draw the bottom card of the Graveyard if one remains.`,
      };
    }
    // Anchor private choice — the card being anchored is in sourceCardIds
    if (action.family === 'anchor-private-choice') {
      const anchorCard = src || tgt;
      const cardDef = getCardDefinition(anchorCard);
      const anchorTitle = cardDef?.title ?? mode;
      const anchorAbility = lookupAbility(anchorCard, 'anchor')
        ?? lookupAbility(anchorCard, 'guard-anchor')
        ?? lookupAbility(anchorCard, 'anchor-counter')
        ?? lookupAbility(anchorCard, 'jack-pr');
      return {
        title: `Anchor ${anchorCard} — ${anchorTitle}`,
        explanation: anchorAbility?.full ?? `Place ${anchorCard} into your Enduring Row as an Anchor. Anchors provide ongoing value and remain in play until removed.`,
      };
    }
    return {
      title: `Choose ${tgt}`,
      explanation: `Select ${tgt} for this private choice.`,
    };
  }

  // ── Exhausted pass ──
  if (action.family === 'exhausted-pass') {
    return {
      title: `Exhausted Pass`,
      explanation: `You have no cards in hand and the Draw Pile is empty. Pass your turn to your opponent.`,
    };
  }

  // ── Fallback — beautify raw names, never show technical identifiers ──
  {
    // Try to look up an ability from the source card's definition
    const srcId = action.sourceCardIds?.[0];
    const srcIdentity = srcId ? cardName(srcId) : null;
    if (srcIdentity) {
      const ability = lookupAbility(srcIdentity, mode);
      if (ability) {
        return {
          title: `${ability.title} with ${srcIdentity}`,
          explanation: ability.full,
        };
      }
      const def = getCardDefinition(srcIdentity);
      if (def) {
        return {
          title: `${def.title} — ${beautifyMode(mode)}`,
          explanation: def.subtitle ? `${def.subtitle}: ${def.motto ?? ''}` : `Play ${srcIdentity} for its ${beautifyMode(mode)} effect.`,
        };
      }
    }
    return {
      title: beautifyMode(mode || action.family),
      explanation: `A ${beautifyFamily(action.family)} action${src ? ` using ${src}` : ''}${tgt ? ` targeting ${tgt}` : ''}.`,
    };
  }
}

/**
 * Convert a technical mode string to a readable title.
 * E.g. "nine-tap" → "Nine Tap", "anchor-private-choice" → "Anchor Private Choice"
 */
function beautifyMode(mode) {
  if (!mode) return 'Action';
  return mode
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Convert a technical family string to a readable name.
 * E.g. "anchor-private-choice" → "Anchor Choice", "swap-bar" → "Swap Bar"
 */
function beautifyFamily(family) {
  if (!family) return 'action';
  const known = {
    'swap-bar': 'Swap Bar',
    'anchor-private-choice': 'Anchor Choice',
    'private-choice': 'Private Choice',
    'response-decline': 'Response Decline',
    'solo-wild': 'Solo Wild',
    'exhausted-pass': 'Exhausted Pass',
  };
  if (known[family]) return known[family];
  return family.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Look up an ability from card-face-data.js by matching the action mode
 * against the card's abilities array.
 */
function lookupAbility(identity, modeMatch) {
  const def = getCardDefinition(identity);
  if (!def?.abilities) return null;
  // Try exact id match first, then partial match
  return def.abilities.find(a => a.id === modeMatch)
    ?? def.abilities.find(a => a.id.includes(modeMatch) || modeMatch.includes(a.id))
    ?? null;
}

/**
 * Describe an anchor action using official rule text.
 */
function describeAnchor(_action, src, _tgt, mode) {
  if (mode === 'queen' || mode === 'guard-anchor') {
    const ability = lookupAbility(src, 'guard-anchor') ?? lookupAbility(src, 'anchor');
    return {
      title: `Anchor ${src} as a Queen (Guard)`,
      explanation: ability?.full ?? `A Queen in ER is an Anchor worth 0 Points and provides Guard while untapped. A Queen enters ER with Aegis until its controller's recorded next Start Phase.`,
    };
  }
  if (mode === 'king' || mode === 'anchor') {
    const ability = lookupAbility(src, 'anchor');
    const def = getCardDefinition(src);
    const erValue = def?.erValue ?? 7;
    return {
      title: `Anchor ${src} as a King (${erValue})`,
      explanation: ability?.full ?? `Place this King in ER as an Anchor. It remains in ER, provides its printed Anchor value of ${erValue}, and can be protected and interacted with normally.`,
    };
  }
  if (mode === 'nine-anchor' || mode === 'anchor-nine') {
    const ability = lookupAbility(src, 'anchor');
    return {
      title: `Anchor ${src} as a Nine Anchor`,
      explanation: ability?.full ?? `Place Nine in ER. Reveal one opponent's hand; that opponent discards 1 card of their choice. You may control only one active Nine Anchor at a time.`,
    };
  }
  if (mode === 'ace-anchor' || mode === 'anchor-counter') {
    const ability = lookupAbility(src, 'anchor-counter');
    return {
      title: `Anchor ${src} as an Ace Anchor`,
      explanation: ability?.full ?? `Place Ace in ER as an Anchor. During a later response window, you may sacrifice it to counter one eligible opponent play using Base Ace authority.`,
    };
  }
  return {
    title: `Anchor ${src}`,
    explanation: `Place ${src} into your Enduring Row as an Anchor.`,
  };
}

/**
 * Describe an effect action using official rule text from card-face-data.js.
 */
function describeEffect(_action, src, tgt, mode) {
  // Nine Tap
  if (mode === 'nine-tap' || mode === 'tap') {
    const ability = lookupAbility(src, 'tap');
    return {
      title: `Nine Tap: Tap ${tgt}`,
      explanation: ability?.full ?? `Tap one opponent PR card. Replace that card's current Tap State with: Untap when its current controller next scores a card for Points.`,
    };
  }
  // Nine Goal Shift
  if (mode === 'goal-shift' || mode === 'nine-goal-shift') {
    const ability = lookupAbility(src, 'goal-shift');
    return {
      title: `Nine Goal Shift on ${tgt || 'opponent'}`,
      explanation: ability?.full ?? `Choose one: increase one opponent's Goal by 3; or increase one opponent's Goal by 5, then you discard 1 card.`,
    };
  }
  // Eight Scuttle
  if (mode === 'eight-scuttle' || mode === 'scuttle') {
    return {
      title: `Scuttle ${tgt} with ${src}`,
      explanation: `Use ${src} (8) to Scuttle ${tgt}. An ordinary Scuttle sends the target card to the Graveyard. After you successfully resolve an ordinary Scuttle using an 8 as the Scuttle source, draw 1 from the top or bottom of the Graveyard (Scuttle Bonus).`,
    };
  }
  // 8♠ Free Scuttle
  if (mode === 'eight-spade-free-scuttle' || mode === 'free-scuttle') {
    const ability = lookupAbility(src, 'free-scuttle');
    return {
      title: `8♠ Free Scuttle ${tgt}`,
      explanation: ability?.full ?? `Declare a Scuttle without spending a Mini-Turn and ignore rank and suit requirements. It still respects: Aegis; ordinary Scuttle immunity; ownership and PR-target requirements.`,
    };
  }
  // Eight Aegis Field
  if (mode === 'eight-aegis-field' || mode === 'aegis-field') {
    const ability = lookupAbility(src, 'aegis-field');
    return {
      title: `Aegis Field with ${src}`,
      explanation: ability?.full ?? `Grant Aegis to all your OTT cards until your recorded next Start Phase. New Aegis replaces old Aegis. Nines do not gain Aegis.`,
    };
  }
  // Queen Quick Aegis
  if (mode === 'queen-aegis' || mode === 'quick-aegis') {
    const ability = lookupAbility(src, 'quick-aegis');
    return {
      title: `Quick Aegis on ${tgt} with ${src}`,
      explanation: ability?.full ?? `Grant Aegis to one friendly OTT card until your controller's recorded next Start Phase. Limit: 1 resolved Q Quick per FT. Nines cannot receive Aegis.`,
    };
  }
  // Six Dig
  if (mode === 'six-dig' || mode === 'dig') {
    const ability = lookupAbility(src, 'dig');
    return {
      title: `Dig with ${src}`,
      explanation: ability?.full ?? `Draw 3 privately. Choose one: keep 2 and return 1 to the top or bottom of DP; or keep all 3 and discard 1 card from your hand to GY.`,
    };
  }
  // 6♠ Deep Draw
  if (mode === 'six-spade-deep-draw' || mode === 'deep-draw') {
    const ability = lookupAbility(src, 'deep-draw');
    return {
      title: `6♠ Deep Draw with ${src}`,
      explanation: ability?.full ?? `You must have at least 1 other card in hand to declare this effect. Discard 1 or 2 cards, then draw up to 6 privately.`,
    };
  }
  // Six Swap Bar Peek
  if (mode === 'swap-bar-peek') {
    const ability = lookupAbility(src, 'swap-bar-peek');
    return {
      title: `Swap Bar Peek with ${src}`,
      explanation: ability?.full ?? `Privately look at up to two face-down Swap Bar cards. Choose one: take it into hand as Revealed-Until-Start; or play it immediately for effect only.`,
    };
  }
  // Jack Disrupt
  if (mode === 'jack' || mode === 'disrupt') {
    const ability = lookupAbility(src, 'disrupt');
    return {
      title: `Jack Disrupt with ${src}`,
      explanation: ability?.full ?? `Respond to an opponent's Mini-Turn Action declaration. If J resolves: record the triggering Action type as disrupted for that acting player for the rest of the current FT; draw 1.`,
    };
  }
  // Jack PR Attachment
  if (mode === 'jack-pr' || mode === 'jack-attachment') {
    const ability = lookupAbility(src, 'jack-pr');
    return {
      title: `Jack ${tgt} with ${src}`,
      explanation: ability?.full ?? `Attach to one Vulnerable opponent PR card. While attached: you control the host card; it remains in PR and counts toward your Secured PR Points; it gains +1 Point; it is Jacked.`,
    };
  }
  // J♠ Jack ER Attachment
  if (mode === 'jack-er') {
    const ability = lookupAbility(src, 'jack-er');
    return {
      title: `J♠ Jack ER: ${tgt}`,
      explanation: ability?.full ?? `Attach to one Vulnerable enemy Anchor in ER. While attached: you control that Anchor; it remains in ER; its active text, Anchor value, Guard, and Start triggers benefit you.`,
    };
  }
  // Two Quick Score + Discard
  if (mode === 'two-quick-score' || mode === 'quick-score-discard') {
    const ability = lookupAbility(src, 'quick-score-discard');
    return {
      title: `Quick Score ${src} (+ Discard)`,
      explanation: ability?.full ?? `Score this 2 into PR for 2 Points. Then the chosen opponent discards 1 card of their choice.`,
    };
  }
  // Three Hand Raid
  if (mode === 'hand-raid' || mode === 'three-hand-raid') {
    const ability = lookupAbility(src, 'hand-raid');
    return {
      title: `Hand Raid with ${src}`,
      explanation: ability?.full ?? `Choose one: An opponent presents up to 3 cards from their hand, you take 1; or that opponent discards up to 2 cards; or bounce 1 Vulnerable OTT card to the top of DP.`,
    };
  }
  // Three Instant Bounce
  if (mode === 'instant-bounce' || mode === 'three-instant-bounce') {
    const ability = lookupAbility(src, 'instant-bounce');
    return {
      title: `Instant Bounce ${tgt} with ${src}`,
      explanation: ability?.full ?? `Bounce 1 Vulnerable OTT card to the top or bottom of DP, chosen by the caster.`,
    };
  }
  // Four Row Clear
  if (mode === 'row-clear' || mode === 'four-row-clear') {
    const ability = lookupAbility(src, 'row-clear');
    return {
      title: `Row Clear with ${src}`,
      explanation: ability?.full ?? `Choose one: clear every opponent PR card that this effect can legally affect; or clear every opponent Anchor in ER that this effect can legally affect.`,
    };
  }
  // 4♠ Total Clear
  if (mode === 'total-clear' || mode === 'four-spade-total-clear') {
    const ability = lookupAbility(src, 'total-clear');
    return {
      title: `4♠ Total Clear with ${src}`,
      explanation: ability?.full ?? `Clear every OTT card from every player's PR and ER to GY. 4♠ is a structural Hard Bypass: bypasses Guard, Aegis, Q♠ special protection, and ordinary rank targeting and clear immunity.`,
    };
  }
  // Four Natural
  if (mode === 'natural' || mode === 'four-natural') {
    const ability = lookupAbility(src, 'natural');
    return {
      title: `Natural with ${src}`,
      explanation: ability?.full ?? `Look at the top 4 cards of DP, reorder them, then optionally draw 1 of them from the top.`,
    };
  }
  // Five Recycle
  if (mode === 'recycle' || mode === 'five-recycle') {
    const ability = lookupAbility(src, 'recycle');
    return {
      title: `Recycle Line with ${src}`,
      explanation: ability?.full ?? `Mill up to 2 cards from the top of DP to GY. Then: rummage 1 legal card from GY into your hand as Revealed-Until-Start; draw the bottom card of GY, if one remains.`,
    };
  }
  // Seven Topdeck Cast
  if (mode === 'topdeck-cast' || mode === 'seven-topdeck-cast') {
    const ability = lookupAbility(src, 'topdeck-cast');
    return {
      title: `Topdeck Cast with ${src}`,
      explanation: ability?.full ?? `Reveal up to the top 2 cards of DP. With two cards, add 1 to your hand as Revealed-Until-Start and play the other immediately for effect. With one card, choose to add it to hand or play it for effect.`,
    };
  }
  // 7♠ Topdeck
  if (mode === 'spade-topdeck' || mode === 'seven-spade-topdeck') {
    const ability = lookupAbility(src, 'spade-topdeck');
    return {
      title: `7♠ Topdeck with ${src}`,
      explanation: ability?.full ?? `Reveal up to the top 3 cards of DP. Assign: up to 1 to hand as Revealed-Until-Start; up to 1 to play for effect; return every remaining revealed card to the top.`,
    };
  }
  // Ace Purge
  if (mode === 'purge' || mode === 'ace-purge') {
    const ability = lookupAbility(src, 'purge');
    return {
      title: `Purge with ${src}`,
      explanation: ability?.full ?? `Choose one: Scrap one card that currently has Aegis; or if no card has Aegis, bounce one Vulnerable enemy Anchor from ER to its owner's hand.`,
    };
  }
  // Red Joker modes
  if (mode === 'hand-swap') {
    const ability = lookupAbility(src, 'hand-swap');
    return {
      title: `Hand Swap with ${src}`,
      explanation: ability?.full ?? `Exchange complete hands with one opponent.`,
    };
  }
  if (mode === 'self-reset') {
    const ability = lookupAbility(src, 'self-reset');
    return {
      title: `Self Reset with ${src}`,
      explanation: ability?.full ?? `Discard your hand, then draw a new hand containing 3 more cards than you discarded.`,
    };
  }
  if (mode === 'opponent-attack') {
    const ability = lookupAbility(src, 'opponent-attack');
    return {
      title: `Opponent Attack with ${src}`,
      explanation: ability?.full ?? `Chosen opponent discards their hand, then redraws 2 fewer cards than they discarded, minimum 0.`,
    };
  }
  if (mode === 'shuffle-reset') {
    const ability = lookupAbility(src, 'shuffle-reset');
    return {
      title: `Shuffle Reset with ${src}`,
      explanation: ability?.full ?? `Shuffle DP and GY together into a new DP, then draw 2. Only ⭐A may counter this mode.`,
    };
  }
  // Black Joker Board Lock
  if (mode === 'board-lock') {
    const ability = lookupAbility(src, 'board-lock');
    return {
      title: `Board Lock with ${src}`,
      explanation: ability?.summary ?? `Quick during your own FT; costs no Mini-Turn. Set Board Lock Counter to 2. Only ⭐A may directly counter.`,
    };
  }
  // 10♦ Mimic
  if (mode === 'mimic' || mode === 'ten-diamond-mimic') {
    const ability = lookupAbility(src, 'mimic');
    return {
      title: `Mimic with ${src}`,
      explanation: ability?.full ?? `Played alone, mimic one ⭐ effect from ranks 3–7. The play always remains a Rank-10 play for limits, Royal Shield, identity, and Exile-Bound.`,
    };
  }
  // 10♥ Tempo Spike
  if (mode === 'tempo-spike') {
    const ability = lookupAbility(src, 'tempo-spike');
    return {
      title: `Tempo Spike with ${src}`,
      explanation: ability?.full ?? `Gain +2 Mini-Turns this Full Turn, still respecting the 3-Mini-Turn hard cap. Then draw 1.`,
    };
  }
  // 10♠ Stack Theft
  if (mode === 'stack-theft') {
    const ability = lookupAbility(src, 'stack-theft');
    return {
      title: `Stack Theft with ${src}`,
      explanation: ability?.full ?? `Target one pending single effect play. If Stack Theft resolves, change that stack item's controller to you; you may keep or replace targets; then resolve it under your control.`,
    };
  }
  // 10♠ Exile Recovery
  if (mode === 'exile-recovery') {
    const ability = lookupAbility(src, 'exile-recovery');
    return {
      title: `Exile Recovery with ${src}`,
      explanation: ability?.full ?? `Recover one card from Exile into your hand as Revealed-Until-Start.`,
    };
  }
  // K♠ Wild Sovereignty
  if (mode === 'wild-sovereignty') {
    const ability = lookupAbility(src, 'wild-sovereignty');
    return {
      title: `Wild Sovereignty with ${src}`,
      explanation: ability?.full ?? `Whenever K♠ may legally be played for Effect, its controller may declare Wild Sovereignty and choose exactly one Spade 🛠 Base effect from ranks 3, 4, 5, 6, or 7.`,
    };
  }
  // Royal Marriage
  if (mode === 'royal-marriage') {
    const ability = lookupAbility(src, 'royal-marriage');
    return {
      title: `Royal Marriage: ${src}`,
      explanation: ability?.full ?? `Declare this King plus the Queen of the same suit as one multi-card Anchor Play. Both enter ER. The Queen enters with Aegis until its controller's recorded next Start Phase.`,
    };
  }

  // Generic effect fallback — try to look up from card definition
  const def = getCardDefinition(src);
  const ability = def?.abilities?.find(a => a.id === mode);
  if (ability) {
    return {
      title: `${ability.title} with ${src}`,
      explanation: ability.full,
    };
  }

  const effectName = mode.replace(/-/g, ' ');
  return {
    title: `Play ${src} — ${effectName}`,
    explanation: `Use ${src} to activate its effect: ${effectName}.${tgt ? ` Target: ${tgt}.` : ''}`,
  };
}

/**
 * Describe a solo wild action using official rule text.
 */
function describeSoloWild(_action, src, mode) {
  const ability = lookupAbility(src, 'solo-wild');
  if (ability) {
    return {
      title: `Solo Wild Copy with ${src}`,
      explanation: ability.full,
    };
  }
  const wildName = mode.replace(/-/g, ' ');
  return {
    title: `Solo Wild: ${wildName}`,
    explanation: `Use ${src} as a Solo Wild card to copy another card's effect.`,
  };
}

/**
 * Describe a counter action using official rule text.
 */
function describeCounter(_action, src, mode) {
  if (mode === 'ace-base' || mode === 'base-counter') {
    const ability = lookupAbility(src, 'base-counter');
    return {
      title: `Base Counter with ${src}`,
      explanation: ability?.full ?? `Counter one pending ordinary effect play or counter. Base Ace cannot counter A♠, Ultras, Sudden Death activations, a play protected from Base Ace by Royal Shield, or anything whose text explicitly excludes Base Ace.`,
    };
  }
  if (mode === 'ace-spade' || mode === 'exile-counter') {
    const ability = lookupAbility(src, 'exile-counter');
    return {
      title: `Exile Counter with ${src} (A♠)`,
      explanation: ability?.full ?? `Counter one eligible pending ordinary play. A♠ cannot counter an Ultra or Sudden Death activation. Cards countered by A♠ go to Exile instead of GY.`,
    };
  }
  if (mode === 'eight-scuttle' || mode === 'scuttle-counter') {
    const ability = lookupAbility(src, 'scuttle-counter');
    return {
      title: `Scuttle Counter with ${src}`,
      explanation: ability?.full ?? `Counter one pending Scuttle attempt. The countered Scuttle source card goes to GY. The target remains where it is.`,
    };
  }
  if (mode === 'king-anchor' || mode === 'counter-single') {
    const ability = lookupAbility(src, 'counter-single');
    return {
      title: `Counter Single with ${src} (King)`,
      explanation: ability?.full ?? `Counter one pending single-card Anchor Play or Goal-Mod Play. A regular King cannot counter Royal Marriage, another multi-card Anchor or Goal-Mod play, or a triggered ability that is not a card play.`,
    };
  }
  if (mode === 'king-spade-counter-multi' || mode === 'counter-multi') {
    const ability = lookupAbility(src, 'counter-multi');
    return {
      title: `Counter Multi-Play with ${src} (K♠)`,
      explanation: ability?.full ?? `Counter one eligible multi-card play, including Supers, Combos, Royal Marriage, paired 10♦, or another defined multi-card stack item. K♠ bypasses protection on the play it is countering as specified.`,
    };
  }
  if (mode === 'ace-anchor' || mode === 'anchor-counter') {
    const ability = lookupAbility(src, 'anchor-counter');
    return {
      title: `Anchor Counter with ${src}`,
      explanation: ability?.full ?? `Place Ace in ER as an Anchor. During a later response window, you may sacrifice it to counter one eligible opponent play using Base Ace authority.`,
    };
  }

  return {
    title: `Counter with ${src}`,
    explanation: `Use ${src} to counter your opponent's action.`,
  };
}

/**
 * Describe an ultra action using official rule text.
 */
function describeUltra(_action, src, _mode) {
  return {
    title: `Ultra: 3-Red Counter (${src})`,
    explanation: `Sacrifice three red cards (${src}) to resolve as ⭐A authority. This is the most powerful counter in the game — it can counter almost any effect, including Board Lock. Only the normal ⭐A Two-Queen Defense applies.`,
  };
}

// ── Score computation ─────────────────────────────────────────

function computeScore(state, playerId) {
  const pr = state.players?.[playerId]?.pr ?? [];
  let total = 0;
  for (const cardId of pr) {
    const card = state.cards?.[cardId];
    if (!card) continue;
    const pv = typeof card.state?.pointValue === 'number' ? card.state.pointValue : null;
    if (pv !== null) {
      total += pv;
    } else {
      total += identityPointValue(card.identity);
    }
  }
  return total;
}

function identityPointValue(identity) {
  if (identity === 'RJ' || identity === 'BJ') return 5;
  const rank = identity.replace(/[♣♦♥♠]/, '');
  const map = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 5, Q: 4, K: 0 };
  return map[rank] ?? 0;
}

// ── Waiting state ─────────────────────────────────────────────

function showWaitingState(container, ctrl, frame, scripted, matchingAction) {
  // Store the recommended action so renderBoard can highlight it
  state.guidedRecommended = null;
  if (matchingAction && scripted) {
    state.guidedRecommended = {
      family: scripted.intent.family,
      mode: scripted.intent.mode,
      sourceIdentity: scripted.intent.sourceIdentity,
      targetIdentity: scripted.intent.targetIdentity,
      actionId: matchingAction.actionId,
    };
  }
  console.log('[guided] showWaitingState', {
    cp: ctrl.getCurrentCheckpoint()?.id,
    scripted: scripted?.intent ? `${scripted.intent.family}/${scripted.intent.mode}` : null,
    matching: matchingAction ? `${matchingAction.family}/${matchingAction.mode}` : 'NONE',
    actions: frame?.actions?.length ?? 0,
  });
  updateGuidedView(container, ctrl);
  updateHud(container, ctrl);
}

// ── HUD ───────────────────────────────────────────────────────

function updateHud(container, ctrl) {
  const hudEl = container.querySelector('[data-testid="guided-hud"]');
  if (!hudEl) return;
  const hint = ctrl.getHintStage();
  const cp = ctrl.getCurrentCheckpoint();
  const hintObj = hint && hint !== 'H0_SILENCE' ? { stage: hint, text: getHintText(ctrl) } : null;
  hudEl.outerHTML = renderGuidedHud({
    status: ctrl.getStatus(),
    checkpoint: cp,
    hint: hintObj,
    glowLevel: ctrl.getGlow()?.level ?? 'ambient',
    waitingForPlayer: ctrl.isWaitingForPlayer(),
  });
  wireSkipHints(container, ctrl);
}

function getHintText(ctrl) {
  const cp = ctrl.getCurrentCheckpoint();
  if (!cp?.hint) return '';
  const stage = ctrl.getHintStage();
  if (stage === 'H3_EXPLICIT') return cp.hint.h3Text ?? '';
  if (stage === 'H2_CONCEPTUAL') return cp.hint.h2Text ?? '';
  return '';
}

function wireSkipHints(container, ctrl) {
  const btn = container.querySelector('[data-action="guided-skip-hints"]');
  if (btn) {
    btn.addEventListener('click', () => ctrl.skipHints());
  }
}

// ── Commentary ────────────────────────────────────────────────

function showCommentary(container, ctrl, cue) {
  const railArea = container.querySelector('[data-testid="guided-commentary-area"]');
  if (!railArea) return;
  // The cue has a `lines` array — pass it directly to the renderer
  railArea.innerHTML = renderCommentaryRail(cue);
  // Wire skip button
  const skipBtn = railArea.querySelector('[data-action="guided-skip-commentary"]');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      ctrl.skipCommentary();
    });
  }
}

// ── Hint ──────────────────────────────────────────────────────

function showHint(container, ctrl, _stage, _text) {
  updateHud(container, ctrl);
}

// ── Glow ──────────────────────────────────────────────────────

function applyGlow(container, identities, level) {
  const cards = container.querySelectorAll('[data-identity]');
  for (const card of cards) {
    const identity = card.dataset.identity ?? '';
    if (identities?.includes(identity)) {
      card.classList.add('guided-glow');
      card.dataset.glowLevel = level ?? 'ambient';
    } else {
      card.classList.remove('guided-glow');
      delete card.dataset.glowLevel;
    }
  }
}

// ── Error / Debrief / Replay ──────────────────────────────────

function showError(container, error) {
  if (state.guidedTickInterval) {
    clearInterval(state.guidedTickInterval);
    state.guidedTickInterval = null;
  }
  container.innerHTML = `
    <div class="guided-error" data-testid="guided-error" role="alert">
      <h2>Guided Exhibition Error</h2>
      <p>${escapeHtml(error?.message ?? String(error))}</p>
      <button class="btn-primary" data-action="guided-exit">Exit</button>
    </div>
  `;
  const exitBtn = container.querySelector('[data-action="guided-exit"]');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => { location.hash = '#/play/new'; });
  }
}

function showDebrief(container, _terminal) {
  if (state.guidedTickInterval) {
    clearInterval(state.guidedTickInterval);
    state.guidedTickInterval = null;
  }
  state.guidedPhase = 'debrief';
  const debrief = GUIDED_EXHIBITION_01.debrief;
  container.innerHTML = renderGuidedDebrief(debrief);

  const replayBtn = container.querySelector('[data-action="guided-replay"]');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => showReplaySelector(container));
  }
  const exitBtn = container.querySelector('[data-action="guided-exit"]');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => { location.hash = '#/play/new'; });
  }
}

function showReplaySelector(container) {
  const ctrl = state.guidedController;
  const currentLevel = ctrl?.getGuidanceLevel?.() ?? 'full';
  container.innerHTML = `
    <div class="guided-replay-screen" data-testid="guided-replay-screen">
      <h2>Replay Exhibition</h2>
      ${renderReplaySelector(currentLevel)}
      <div class="guided-replay-actions">
        <button class="btn-secondary" data-action="guided-replay-back">Back</button>
        <button class="btn-primary" data-action="guided-replay-start">Start Replay</button>
      </div>
    </div>
  `;
  container.querySelectorAll('[data-action="guided-replay-mode"]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.guided-replay-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (ctrl) ctrl.setGuidanceLevel(btn.dataset.level);
    });
  });
  const startBtn = container.querySelector('[data-action="guided-replay-start"]');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const level = container.querySelector('.guided-replay-option.active')?.dataset.level ?? 'full';
      await startGuidedMatch(container, { guidanceLevel: level });
    });
  }
  const backBtn = container.querySelector('[data-action="guided-replay-back"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => showDebrief(container, {}));
  }
}
