// ═══════════════════════════════════════════════════════════════
// ranked-duel-renderer.mjs — v0.20.0 Ranked Duel shell renderer.
// Pure function: snapshot + options → HTML string.
// Uses ranked-duel-viewmodel.mjs for data, ranked-duel.css for style.
// Full replacement for play-renderer-v3.js — ports all v0.17.0 features.
// ═══════════════════════════════════════════════════════════════

import { buildRankedDuelViewModel, buildGroupedActions, buildIntentGroups, resolveConcreteAction } from './ranked-duel-viewmodel.mjs';
import { loadProfile } from './local-profile.mjs';
import { declarationSummary, decisionKindLabel, timingLabel, familyLabel } from './action-presenter.js';
import {
  buildActionGroups, categoryLabel, categoryIcon, activeCategories,
  groupsByCategory, isResponseWindow as isResponseWindowGroups,
  resolveAction, ACTION_CATEGORY, SELECTION_TYPE, variantLabel,
} from './action-presentation.mjs';
import { derivePriorityContext, priorityBannerText, priorityTimeline, windowTypeLabel } from './authority/priority-projection.js';
import { buildLegalActionContract, groupActionsByTiming, actionsForCard } from './authority/legal-action-adapter.js';
import { buildImmediateExplanation, buildWhyExplanation, buildUnavailableExplanation, GuidanceMode } from './intelligence/action-explanation.js';
import { buildEventLog } from './orchestration/resolution-flow.js';
import { renderTcgCard, renderTcgCardBack, renderTcgCardPreview } from './play-card-component.js';
import { getCardDefinition, getSuit } from '../card-face-data.js';
import { getCardArtBoardPath, getCardArtBoardPosition } from '../card-art-registry.js';
import { getArchetypePersonality } from './ai-personality.js';
import { renderNewMatchSetup } from './ranked-duel-hub.mjs';
import { renderTerminal, renderError, renderKeyboardHelp, renderRulesHelp, renderMatchStats, formatPhase, formatTerminationReason } from './ranked-duel-terminal.mjs';
import { renderChatPanel as renderChatPanelModule } from './chat-panel.js';
// T1: Chat panel rendering is delegated to chat-panel.js
const renderChatPanel = renderChatPanelModule;
import { ratingToTierDivision } from "../account-domain/rank-tier.mjs";
import { renderRankGlyph, rankLabel } from './rank/rank-glyph.js';

// Re-export hub and terminal functions for backward compatibility
// (tests and play-app.js import these from ranked-duel-renderer.mjs)
export { renderNewMatchSetup };

/**
 * Map a view-model card's statusMarkers into the runtimeState shape
 * expected by renderCardFace (card-face-renderer.js). The renderer reads
 * tapped / aegis / providesGuard / exileBound / anchorValue / jackHostId
 * to render the state strip.
 * @param {object} card — view-model card with statusMarkers: [{type,label}]
 * @returns {object} runtimeState for renderCardFace
 */
function cardRuntimeState(card) {
  if (!card) return {};
  const types = new Set((card.statusMarkers ?? []).map(m => m?.type));
  return {
    tapped: types.has('TAPPED'),
    aegis: types.has('AEGIS'),
    providesGuard: types.has('GUARD'),
    exileBound: types.has('EXILE_BOUND'),
    jackHostId: types.has('ATTACHMENT') ? true : undefined,
  };
}

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Adapt a PlaySession.getSnapshot() output into the shape expected by
 * buildRankedDuelViewModel. The controller produces an authorized
 * playerView (strictView) plus metadata; the viewmodel expects a flat
 * `state` object with players/seatOrder/zones. This adapter bridges the
 * two contracts without exposing raw private engine state.
 */
function adaptSnapshotForViewModel(controllerSnapshot) {
  if (!controllerSnapshot) return controllerSnapshot;
  // If already in viewmodel format (has `state`), pass through
  if (controllerSnapshot.state) return controllerSnapshot;

  const pv = controllerSnapshot.playerView;
  if (!pv) {
    // Modules not loaded or error — return minimal shape so viewmodel
    // produces its MISSING_SNAPSHOT error model.
    return { sessionId: controllerSnapshot.sessionId, status: controllerSnapshot.status };
  }

  const humanId = controllerSnapshot.human?.playerId ?? pv.actorId ?? 'P1';
  const opponents = pv.opponents ?? [];
  const seatOrder = [humanId, ...opponents.map(o => o.playerId)];

  const players = {};
  players[humanId] = {
    securedPoints: pv.own?.securedPoints ?? 0,
    goal: pv.own?.goal ?? 21,
    hand: pv.own?.hand ?? [],
    pointRow: pv.own?.pr ?? [],
    enduringRow: pv.own?.er ?? [],
    isActive: pv.activePlayerId === humanId,
    hasPriority: pv.priority?.ownerId === humanId,
  };
  for (const opp of opponents) {
    players[opp.playerId] = {
      securedPoints: opp.securedPoints ?? 0,
      goal: opp.goal ?? 21,
      hand: { count: opp.handCount ?? 0 },
      pointRow: opp.pr ?? [],
      enduringRow: opp.er ?? [],
      displayName: controllerSnapshot.opponent?.displayName ?? 'AI',
      aiRating: controllerSnapshot.opponent?.aiRating ?? null,
      // Network match participant data (v0.28)
      isHuman: controllerSnapshot.opponent?.isHuman ?? false,
      rating: controllerSnapshot.opponent?.rating ?? null,
      rank: controllerSnapshot.opponent?.rank ?? null,
      connectionState: controllerSnapshot.opponent?.connectionState ?? null,
    };
  }

  return {
    sessionId: controllerSnapshot.sessionId,
    humanPlayerId: humanId,
    status: controllerSnapshot.status,
    isNetworkMatch: controllerSnapshot.isNetworkMatch === true,
    decision: controllerSnapshot.decision ?? null,
    legalActions: controllerSnapshot.decision?.legalActions ?? [],
    chat: controllerSnapshot.chat ?? [],
    state: {
      seatOrder,
      fullTurnSequence: pv.fullTurnSequence ?? controllerSnapshot.match?.fullTurnSequence ?? 0,
      phase: pv.phase ?? controllerSnapshot.match?.phase ?? '',
      activePlayerId: pv.activePlayerId ?? controllerSnapshot.match?.activePlayerId ?? null,
      priorityOwnerId: pv.priority?.ownerId ?? null,
      windowLabel: pv.priority?.windowLabel ?? '',
      startingGoal: pv.own?.goal ?? 21,
      players,
      drawPile: { count: pv.dpCount ?? 0 },
      graveyard: { count: pv.gyCount ?? (pv.gyTopCard ? 1 : 0), topCard: pv.gyTopCard ?? null },
      exile: { count: pv.exileCount ?? 0, newestVisibleCard: null },
      swapBar: pv.swapBar ?? [],
      stack: pv.stack ?? [],
      swapAvailable: true,
      terminationReason: controllerSnapshot.match?.terminationReason ?? null,
      winner: controllerSnapshot.match?.winner ?? null,
    },
  };
}

/**
 * Render the full play board from a snapshot.
 * v0.20.0: Full replacement for play-renderer-v3.js renderBoard.
 * @param {object} snapshot — Authorized player snapshot from PlaySession
 * @param {object} options — { selectedActionId, selectedSourceCardId, selectedTargets, inspectorCardId, guidanceMode, showKeyboardHelp, chatMessages, soundMuted }
 * @returns {string} HTML
 */
export function renderBoard(snapshot, options = {}) {
  if (!snapshot) return '<div class="play-error">No active session.</div>';
  return renderRankedDuel(snapshot, options);
}

/**
 * Derive the match mode info from the snapshot and options.
 * For network matches, uses the server-authoritative matchMode/queueId
 * to produce the correct header label (not hardcoded "DIRECT DUEL").
 * @param {object} snapshot — Authorized player snapshot
 * @param {object} options — Render options
 * @returns {{ kind: string, label: string, networkRanked: boolean, isNetwork: boolean } | null}
 */
function deriveModeInfo(snapshot, options) {
  if (!options.isNetworkMatch && !snapshot?.isNetworkMatch) return null; // null = default LOCAL_AI

  const matchMode = snapshot?.matchMode ?? 'private';
  const queueId = snapshot?.queueId ?? null;

  // Derive the canonical label from the actual match classification
  let label;
  switch (matchMode) {
    case 'ranked':
      label = 'ONLINE \u00b7 RANKED DUEL';
      break;
    case 'casual':
      label = 'ONLINE \u00b7 CASUAL DUEL';
      break;
    case 'private':
    default:
      label = 'ONLINE \u00b7 DIRECT DUEL';
      break;
  }

  return {
    kind: 'NETWORK',
    label,
    networkRanked: matchMode === 'ranked',
    isNetwork: true,
    matchMode,
    queueId,
  };
}

/**
 * @param {object} snapshot — Authorized player snapshot from PlaySession
 * @param {object} options — { selectedActionId, selectedSourceCardId, selectedTargets, inspectorCardId, guidanceMode, showKeyboardHelp, chatMessages, soundMuted }
 * @returns {string} HTML
 */
export function renderRankedDuel(snapshot, options = {}) {
  let profile = loadProfile();
  const adapted = adaptSnapshotForViewModel(snapshot);
  // Derive mode info from the actual match type (not hardcoded).
  // For network matches, use the server-authoritative matchMode/queueId.
  const modeInfo = deriveModeInfo(snapshot, options);

  // For network matches, merge the authenticated account's display name
  // and rating into the local profile so the player plate shows real identity.
  if (modeInfo?.isNetwork && snapshot?.human) {
    profile = {
      ...profile,
      displayName: snapshot.human.displayName ?? profile.displayName,
      rating: snapshot.human.rating != null
        ? { ...profile.rating, value: snapshot.human.rating, scope: 'NETWORK', provisional: false }
        : profile.rating,
    };
  }

  const vm = buildRankedDuelViewModel(adapted, profile, modeInfo);

  if (vm.status === 'ERROR') {
    return renderError(vm, options);
  }

  if (vm.status === 'TERMINAL') {
    return renderTerminal(vm, options);
  }

  return renderMatch(vm, options, snapshot);
}

// ── Match shell ────────────────────────────────────────────────

function renderMatch(vm, opts, snapshot) {
  const isReadOnly = opts.leaseMode === 'READ_ONLY';
  const isHumanTurn = vm.status === 'HUMAN_DECISION';
  const isAiTurn = vm.status === 'AI_DECISION';
  const isOpponentTurn = vm.status === 'OPPONENT_DECISION';
  const isNetwork = vm.mode?.isNetwork === true;

  // v0.17.0: Derive priority context from authority for the priority banner
  const priorityContext = snapshot ? derivePriorityContext(snapshot, snapshot.decision) : null;
  const guidanceMode = opts.guidanceMode ?? GuidanceMode.GUIDED;
  const immediate = priorityContext ? buildImmediateExplanation(priorityContext, [], guidanceMode) : null;

  // Build card registry from vm for inspector lookups
  const cardRegistry = {};
  const handCards = vm?.battlefield?.humanHand ?? [];
  for (const c of handCards) { if (c.entityId) cardRegistry[c.entityId] = c; }
  const oppPR = vm?.battlefield?.topPR ?? [];
  const oppER = vm?.battlefield?.topER ?? [];
  const humPR = vm?.battlefield?.bottomPR ?? [];
  const humER = vm?.battlefield?.bottomER ?? [];
  [...oppPR, ...oppER, ...humPR, ...humER].forEach(c => { if (c?.entityId) cardRegistry[c.entityId] = c; });

  return `<div class="ranked-duel-shell" role="main" aria-label="Ranked Duel Match" data-testid="play-board">
    ${renderHeader(vm, opts, priorityContext, immediate)}
    <section class="rd-cell rd-enemy-enduring" data-grid="enemyE" aria-label="Opponent Enduring">
      ${renderEnduringRow(oppER, 'opponent')}
    </section>
    <section class="rd-cell rd-enemy-points" data-grid="enemyP" aria-label="Opponent Points">
      ${renderPointRow(oppPR, 'Points', vm.opponent.secured, vm.opponent.goalLabel, 'opponent')}
    </section>
    <section class="rd-cell rd-enemy-profile" data-grid="enemyProfile" aria-label="Opponent profile">
      ${renderProfileBlock(vm.opponent, 'opponent', vm)}
      ${renderOpponentHand(vm.battlefield.opponentHandCount)}
    </section>
    <section class="rd-cell rd-piles" data-grid="piles" aria-label="Shared piles">
      <div class="rd-piles-label">SHARED PILES</div>
      <div class="rd-piles-row">
        ${renderPileCard('Exile', vm.zones.exile.count, vm.zones.exile.newestCard, 'exile')}
        ${renderPileCard('Discard', vm.zones.discard.count, vm.zones.discard.topCard, 'discard')}
        ${renderPileCard('Draw', vm.zones.draw.count, null, 'draw')}
      </div>
    </section>
    <section class="rd-cell rd-swap" data-grid="swap" aria-label="Swap bar">
      ${renderSwapBar(vm, opts, isHumanTurn, isReadOnly)}
    </section>
    <section class="rd-cell rd-stage" data-grid="stage" data-board="1" aria-label="Active stage">
      ${renderActiveStage(vm, opts, snapshot, priorityContext, immediate)}
    </section>
    <section class="rd-cell rd-stack" data-grid="stack" data-stack-depth="${vm.stack?.length ?? 0}" aria-label="Resolution stack">
      ${renderResolutionStack(vm)}
    </section>
    <section class="rd-cell rd-player-enduring" data-grid="playerE" aria-label="Your Enduring">
      ${renderEnduringRow(humER, 'human')}
    </section>
    <section class="rd-cell rd-player-points" data-grid="playerP" aria-label="Your Points">
      ${renderPointRow(humPR, 'Points', vm.human.secured, vm.human.goalLabel, 'human')}
    </section>
    <section class="rd-cell rd-gamelog" data-grid="gamelog" data-log-empty="${(snapshot?.recentEvents?.length ?? 0) === 0}" aria-label="Game log">
      <div class="rd-rail-section-header">GAME LOG</div>
      ${renderGameLog(snapshot?.recentEvents ?? [], snapshot?.systemEvents ?? [], cardRegistry)}
    </section>
    <section class="rd-cell rd-score-rail" data-grid="scoreRail" aria-label="Score rail" data-testid="score-rail">
      ${renderScoreRail(vm)}
    </section>
    <section class="rd-cell rd-player-profile" data-grid="playerPro" aria-label="Your profile">
      ${renderProfileBlock(vm.human, 'human', vm)}
    </section>
    <section class="rd-cell rd-player-hand" data-grid="playerH" aria-label="Your hand">
      ${renderHumanHand(vm.battlefield.humanHand, opts)}
    </section>
    <section class="rd-cell rd-right-rail-bottom" data-grid="rightRailBottom" aria-label="Actions and chat">
      ${renderRightRailBottom(vm, opts, snapshot, isReadOnly, isHumanTurn, isAiTurn, isOpponentTurn, priorityContext, immediate, isNetwork)}
    </section>
    ${isNetwork ? renderDisconnectOverlay(vm, snapshot) : ''}
    ${isNetwork ? renderRematchInviteOverlay(vm, snapshot, opts) : ''}
    ${opts.inspectorCardId ? renderInspector(opts.inspectorCardId, cardRegistry, [], guidanceMode, opts.inspectorFaceView) : ''}
    ${opts.showKeyboardHelp ? renderKeyboardHelp() : ''}
    ${opts.showRulesHelp ? renderRulesHelp(snapshot) : ''}
    ${opts.showMatchStats ? renderMatchStats(snapshot) : ''}
  </div>`;
}

// ── Right Rail Bottom (Actions + Chat with draggable divider) ──
// v0.28: Swapped layout — Actions on top (larger region), Chat on bottom.
// The divider between them is draggable. Chat can be completely hidden.

function renderRightRailBottom(vm, opts, snapshot, isReadOnly, isHumanTurn, isAiTurn, isOpponentTurn, priorityContext, immediate, isNetwork) {
  const chatHidden = opts.chatHidden === true;
  const chatSplit = opts.chatSplit ?? 40; // percentage for chat (0-100 of the container)

  const actionsHtml = renderActionBar(vm, opts, isHumanTurn, isAiTurn, isOpponentTurn, isReadOnly, priorityContext, immediate);
  const chatHtml = renderChatPanel(vm, opts, isReadOnly, (opts.chatMessages || []).slice(-30));

  // Draggable divider between Actions (top) and Chat (bottom)
  const dividerHtml = isNetwork && !chatHidden
    ? `<div class="rd-rail-divider" data-action="rail-drag" role="separator" aria-orientation="horizontal" aria-label="Drag to resize Actions and Chat" tabindex="0" data-testid="rail-divider"><div class="rd-rail-divider-handle"></div></div>`
    : '';

  return `<div class="rd-right-rail-bottom-inner" data-chat-hidden="${chatHidden}" data-chat-split="${chatSplit}">
    <div class="rd-rail-actions-section" style="flex: ${chatHidden ? '1 1 100%' : `${100 - chatSplit} 1 0`}">
      ${actionsHtml}
    </div>
    ${dividerHtml}
    ${!chatHidden ? `<div class="rd-rail-chat-section" style="flex: ${chatSplit} 1 0">${chatHtml}</div>` : ''}
  </div>`;
}

// ── Disconnect Overlay (network matches only) ──────────────────

function renderDisconnectOverlay(vm, snapshot) {
  if (!snapshot) return '';
  const oppConn = snapshot.opponent?.connectionState ?? vm.opponent?.connectionState;
  const isTerminal = vm.status === 'TERMINAL';

  // Only show overlay for opponent disconnect during active match
  if (oppConn !== 'DISCONNECTED' || isTerminal) return '';

  // IRX-H10: Reconnect-grace countdown. The server gives the opponent a
  // RECONNECT_GRACE (60s) window before forfeiting. Surface it so the waiting
  // player sees a concrete deadline instead of an indefinite spinner.
  const graceMs = snapshot.opponent?.graceMs ?? vm.opponent?.graceMs ?? null;
  const disconnectedAt = snapshot.opponent?.disconnectedAt ?? vm.opponent?.disconnectedAt ?? null;
  let countdownHtml = '';
  if (typeof graceMs === 'number' && typeof disconnectedAt === 'number') {
    const deadlineMs = disconnectedAt + graceMs;
    const remainingMs = Math.max(0, deadlineMs - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    countdownHtml = `<p class="rd-disconnect-grace" data-testid="reconnect-grace-countdown" data-grace-deadline-ms="${deadlineMs}">Reconnect grace: <strong>${remainingSec}s</strong> remaining</p>`;
  }

  return `<div class="rd-disconnect-overlay" role="dialog" aria-modal="true" aria-labelledby="rd-disconnect-title" data-testid="disconnect-overlay">
    <div class="rd-disconnect-content">
      <h2 id="rd-disconnect-title" class="rd-disconnect-title">Opponent Disconnected</h2>
      <p class="rd-disconnect-msg">Waiting for the match server to determine the outcome\u2026</p>
      ${countdownHtml}
      <div class="rd-disconnect-spinner" aria-hidden="true"></div>
    </div>
  </div>`;
}

// ── Rematch Invite Overlay (network matches only) ───────────────

function renderRematchInviteOverlay(vm, snapshot, opts) {
  if (!snapshot) return '';
  // The rematch invite is stored on the network session and passed via opts
  const invite = opts.rematchInvite ?? snapshot.rematchInvite ?? vm.rematchInvite;
  if (!invite) return '';

  const fromName = invite.fromDisplayName ?? 'Opponent';
  return `<div class="rd-rematch-invite-overlay" role="dialog" aria-modal="true" aria-labelledby="rd-rematch-title" data-testid="rematch-invite-overlay">
    <div class="rd-rematch-invite-content">
      <h2 id="rd-rematch-title" class="rd-rematch-title">Rematch Request</h2>
      <p class="rd-rematch-msg"><strong>${esc(fromName)}</strong> wants to play again.</p>
      <div class="rd-rematch-actions">
        <button class="primary-button" data-testid="accept-rematch" data-action="accept-rematch" data-invite-code="${esc(invite.inviteCode ?? '')}">Accept</button>
        <button class="secondary-button" data-testid="decline-rematch" data-action="decline-rematch">Decline</button>
      </div>
    </div>
  </div>`;
}

function renderHeader(vm, opts, priorityContext, immediate) {
  const turn = vm.match.fullTurnSequence;
  const phaseLabel = formatPhase(vm.match.phase);
  const isHumanTurn = vm.status === 'HUMAN_DECISION';
  const isAiTurn = vm.status === 'AI_DECISION';
  const isOpponentTurn = vm.status === 'OPPONENT_DECISION';
  const isNetwork = vm.mode?.isNetwork === true;

  // Compact match-state center: turn · phase · priority owner
  const priorityOwner = vm.match.priorityOwnerId;
  const isHumanPriority = priorityOwner === vm.human.playerId;
  // For network human-vs-human, use human-neutral status text, not "AI is choosing…"
  const ownerLabel = isHumanTurn
    ? 'Your action'
    : isOpponentTurn
      ? `${esc(vm.opponent.displayName)} is choosing\u2026`
      : isAiTurn
        ? 'AI is choosing\u2026'
        : (isNetwork && !isHumanPriority && priorityOwner)
          ? `${esc(vm.opponent.displayName)} is choosing\u2026`
          : isHumanPriority
            ? 'Your priority'
            : priorityOwner
              ? `${esc(vm.opponent.displayName)} has priority`
              : phaseLabel || vm.match.phase;

  const windowLabel = priorityContext ? windowTypeLabel(priorityContext.windowType) : '';
  const stackDepth = vm.stack?.length ?? 0;
  const globalStates = vm.match.globalStates ?? [];
  const statesHtml = globalStates.length > 0
    ? `<span class="rd-header-states">${globalStates.map(s => `<span class="rd-state-badge rd-state-${esc(s.key)}" title="${esc(s.label)}">${esc(s.icon)} ${esc(s.label)}</span>`).join('')}</span>`
    : '';

  // During active network PvP, remove the Back button — leaving must go
  // through the forfeit flow (X button → confirmation dialog).
  const isTerminal = vm.status === 'TERMINAL';
  const showBack = !isNetwork || isTerminal;
  const backHref = opts.academyLessonId ? '#/play/academy' : '#/';
  const backLabel = opts.academyLessonId ? 'Back to Academy' : 'Back to home';
  const backHtml = showBack
    ? `<a class="rd-header-back" href="${backHref}" aria-label="${esc(backLabel)}" title="${esc(backLabel)}">\u2190</a>`
    : '';

  // X/exit button: for network PvP, triggers forfeit confirmation;
  // for local/AI, exits to hub.
  const exitTitle = isNetwork && !isTerminal ? 'Forfeit match' : 'Return to hub';
  const exitAction = isNetwork && !isTerminal ? 'forfeit-match' : 'exit-match';

  return `<header class="rd-header" role="banner">
    <div class="rd-header-left">
      ${backHtml}
      <span class="rd-header-logo">INTRILEX</span>
      <span class="rd-header-mode">${esc(vm.mode.label)}</span>
    </div>
    <div class="rd-header-center" role="status" aria-live="polite">
      <span class="rd-header-turn">Turn ${turn}</span>
      <span class="rd-header-sep">\u00b7</span>
      <span class="rd-header-phase">${esc(phaseLabel)}</span>
      ${windowLabel ? `<span class="rd-header-sep">\u00b7</span><span class="rd-header-window ${isHumanPriority ? 'human' : 'opponent'}">${esc(windowLabel)}</span>` : ''}
      ${stackDepth > 0 ? `<span class="rd-header-sep">\u00b7</span><span class="rd-header-stack">Stack ${stackDepth}</span>` : ''}
      <span class="rd-header-owner ${isHumanTurn ? 'human' : isAiTurn ? 'ai' : ''}">${esc(ownerLabel)}</span>
      ${statesHtml}
    </div>
    <div class="rd-header-right">
      <div class="rd-toolbar" role="toolbar" aria-label="Utility controls">
        <button class="rd-toolbar-btn" data-action="sound-toggle" data-testid="sound-toggle" title="${opts.soundMuted ? 'Unmute' : 'Mute'} audio" aria-label="${opts.soundMuted ? 'Unmute audio' : 'Mute audio'}">${opts.soundMuted ? '\u{1F507}' : '\u{1F50A}'}</button>
        <button class="rd-toolbar-btn" data-action="keyboard-help" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
        <button class="rd-toolbar-btn" data-action="toggle-rules" title="Rules / Help" aria-label="Rules and help">\u2139</button>
        <button class="rd-toolbar-btn" data-action="toggle-stats" title="Match stats" aria-label="Match statistics">\u25C8</button>
        <button class="rd-toolbar-btn" data-action="toggle-inspector" title="Inspector" aria-label="Card inspector">\u25A4</button>
        <button class="rd-toolbar-btn" data-action="${exitAction}" data-testid="exit-match-btn" title="${exitTitle}" aria-label="${exitTitle}">\u2715</button>
      </div>
    </div>
  </header>`;
}

// ── Priority strip ─────────────────────────────────────────────
// v0.21.0: The priority strip is no longer rendered as a separate
// full-width bar. The compact match-state center in the header now
// carries turn/phase/priority/stack info. This function is retained
// for source-level compatibility with v0.17.0 tests but is not called
// in the main layout. The pass button lives in the action bar.

function renderPriorityStrip(vm, opts) {
  const { match } = vm;
  const actor = match.activePlayerId === vm.human.playerId ? 'human' : 'ai';
  const actorName = actor === 'human' ? 'You' : 'AI';
  return `<div class="rd-priority">
    <span class="rd-priority-actor ${actor}">${esc(actorName)}</span>
    <span class="rd-priority-phase">${esc(match.phase)}</span>
    <span class="rd-priority-window">${esc(match.windowLabel)}</span>
    <span class="rd-priority-stack">Stack ${vm.stack.length}</span>
    ${renderPassButton(vm, opts)}
  </div>`;
}

// ── Enemy board (3-column: Enduring | Points | Profile+Hand) ───

function renderEnemyBoard(vm) {
  const plate = vm.opponent;
  const battlefield = vm.battlefield;
  const badgeHtml = renderBadges(plate.badges);
  const ratingHtml = plate.rating
    ? `<span class="rd-plate-rating">${plate.rating.value}${plate.rating.provisional ? '?' : ''}</span>`
    : (plate.aiRating ? `<span class="rd-plate-rating">AI ${plate.aiRating}</span>` : '');
  const isActive = vm.match.activePlayerId === plate.playerId;
  const oppPR = battlefield.topPR;
  const oppER = battlefield.topER;

  return `<section class="rd-enemy-board ${isActive ? 'active' : ''}" aria-label="Opponent board">
    <div class="rd-enemy-enduring">${renderEnduringRow(oppER, 'opponent')}</div>
    <div class="rd-enemy-points">${renderPointRow(oppPR, 'Points', plate.secured, plate.goalLabel, 'opponent')}</div>
    <div class="rd-enemy-profile">
      <div class="rd-profile-avatar opponent">${esc(plate.monogram)}</div>
      <div class="rd-profile-name">${esc(plate.displayName)}</div>
      <div class="rd-profile-meta">${plate.isHuman ? 'Human' : 'AI Opponent'} ${ratingHtml} ${badgeHtml}</div>
      ${renderOpponentHand(battlefield.opponentHandCount)}
    </div>
  </section>`;
}

// ── Player board (Enduring | Points on top, Profile | Hand below) ──

function renderPlayerBoard(vm, opts) {
  const plate = vm.human;
  const battlefield = vm.battlefield;
  const badgeHtml = renderBadges(plate.badges);
  const ratingHtml = plate.rating
    ? `<span class="rd-plate-rating">${plate.rating.value}${plate.rating.provisional ? '?' : ''}</span>`
    : '';
  const isActive = vm.match.activePlayerId === plate.playerId;
  const humPR = battlefield.bottomPR;
  const humER = battlefield.bottomER;

  return `<section class="rd-player-board ${isActive ? 'active' : ''}" aria-label="Your board">
    <div class="rd-player-rows">
      <div class="rd-player-enduring">${renderEnduringRow(humER, 'human')}</div>
      <div class="rd-player-points">${renderPointRow(humPR, 'Points', plate.secured, plate.goalLabel, 'human')}</div>
    </div>
    <div class="rd-player-bottom">
      <div class="rd-player-profile">
        <div class="rd-profile-avatar human">${esc(plate.monogram)}</div>
        <div class="rd-profile-name">${esc(plate.displayName)}</div>
        <div class="rd-profile-meta">You ${ratingHtml} ${badgeHtml}</div>
      </div>
      <div class="rd-player-hand-area">
        ${renderHumanHand(vm.battlefield.humanHand, opts)}
      </div>
    </div>
  </section>`;
}

// ── Point Row (compact, card-sized objects) ────────────────────
// Empty state: single compact strip. Populated: cards expand.

function renderPointRow(cards, label, secured, goalLabel, side) {
  const count = cards.length;
  const isEmpty = count === 0;
  const cls = isEmpty ? 'rd-point-row empty' : 'rd-point-row';

  if (isEmpty) {
    return `<div class="${cls}" data-side="${side}" aria-label="${label} row">
      <span class="rd-row-label">${label}</span>
      <span class="rd-row-empty-text">No secured cards</span>
    </div>`;
  }

  return `<div class="${cls}" data-side="${side}" aria-label="${label} row">
    <span class="rd-row-label">${label}</span>
    <div class="rd-row-cards">
      ${cards.map(c => renderCard(c)).join('')}
    </div>
  </div>`;
}

// ── Enduring Row (compact when empty, expands when populated) ──

function renderEnduringRow(cards, side) {
  const count = cards.length;
  const isEmpty = count === 0;
  const cls = isEmpty ? 'rd-enduring-row empty' : 'rd-enduring-row';

  if (isEmpty) {
    return `<div class="${cls}" data-side="${side}" aria-label="Enduring effects">
      <span class="rd-row-label">Enduring</span>
      <span class="rd-row-empty-text">None</span>
    </div>`;
  }

  return `<div class="${cls}" data-side="${side}" aria-label="Enduring effects">
    <span class="rd-row-label">Enduring</span>
    <div class="rd-row-cards">
      ${cards.map(c => renderCard(c)).join('')}
    </div>
  </div>`;
}

// ── Shared battlefield (3-column: Piles+Swap | Active Stage | Stack) ──

function renderSharedBattlefield(vm, opts, snapshot, priorityContext, immediate) {
  const { zones } = vm;
  const hasStack = (vm.stack?.length ?? 0) > 0;
  const gyTopCard = zones.discard.topCard;

  return `<section class="rd-shared" aria-label="Shared battlefield">
    <div class="rd-piles-swap" aria-label="Shared piles and swap">
      <div class="rd-piles-column">
        ${renderPileCard('Exile', zones.exile.count, zones.exile.newestCard, 'exile')}
        ${renderPileCard('Discard', zones.discard.count, gyTopCard, 'discard')}
        ${renderPileCard('Draw', zones.draw.count, null, 'draw')}
      </div>
      ${renderSwapBar(vm, opts, false, true)}
    </div>
    <div class="rd-active-stage-area">
      ${renderActiveStage(vm, opts, snapshot, priorityContext, immediate)}
    </div>
    <div class="rd-stack-area">
      ${hasStack ? renderResolutionStack(vm) : ''}
    </div>
  </section>`;
}

// ── Pile as a card-like object (not a dashboard stat) ──────────

function renderPileCard(label, count, topCard, dataPile) {
  const isEmpty = count === 0;
  const cls = isEmpty ? 'rd-pile-card empty' : 'rd-pile-card';
  const topHtml = topCard
    ? `<div class="rd-pile-top" aria-label="Top card">${esc(topCard.identity)}</div>`
    : '';
  // Draw pile uses the mini cardback image as background with label overlaid
  const drawBg = dataPile === 'draw' && !isEmpty
    ? '<div class="rd-pile-cardback mini" aria-hidden="true"></div>'
    : '';
  return `<div class="${cls}" data-pile="${dataPile}" aria-label="${label} pile, ${count} cards" role="button" tabindex="0">
    ${drawBg}
    <div class="rd-pile-face">
      <div class="rd-pile-label">${label}</div>
      <div class="rd-pile-count">${count}</div>
      ${topHtml}
    </div>
  </div>`;
}

// ── Score Rail (v0.25): Authoritative score display ────────────
// Two stacked cells: OPP (top) / YOU (bottom), spanning the Game Log height.
// Future prestige/banner imagery can skin the background via .rd-score-cell-bg.

function renderScoreRail(vm) {
  const oppScore = vm.opponent.secured ?? 0;
  const oppGoal = vm.opponent.goal ?? 21;
  const youScore = vm.human.secured ?? 0;
  const youGoal = vm.human.goal ?? 21;
  return `<div class="rd-score-rail" data-testid="score-rail-inner">
    <div class="rd-score-cell opp" data-score="${oppScore}" data-goal="${oppGoal}" aria-label="Opponent score ${oppScore} of ${oppGoal}">
      <div class="rd-score-cell-bg" aria-hidden="true"></div>
      <div class="rd-score-cell-content">
        <span class="rd-score-cell-label">OPP</span>
        <span class="rd-score-cell-value">
          <span class="rd-score-cell-current">${oppScore}</span>
          <span class="rd-score-cell-divider">/</span>
          <span class="rd-score-cell-goal">${oppGoal}</span>
        </span>
      </div>
    </div>
    <div class="rd-score-cell you" data-score="${youScore}" data-goal="${youGoal}" aria-label="Your score ${youScore} of ${youGoal}">
      <div class="rd-score-cell-bg" aria-hidden="true"></div>
      <div class="rd-score-cell-content">
        <span class="rd-score-cell-label">YOU</span>
        <span class="rd-score-cell-value">
          <span class="rd-score-cell-current">${youScore}</span>
          <span class="rd-score-cell-divider">/</span>
          <span class="rd-score-cell-goal">${youGoal}</span>
        </span>
      </div>
    </div>
  </div>`;
}

// ── Active Stage (center of the table — the visual heart) ──────
// Shows the currently active/declared card enlarged, or a subdued board state.

function renderActiveStage(vm, opts, snapshot, priorityContext, immediate) {
  const stack = vm.stack ?? [];
  const isResolving = stack.some(s => s.isResolving);
  const topStack = stack[0];
  const isHumanTurn = vm.status === 'HUMAN_DECISION';
  const isAiTurn = vm.status === 'AI_DECISION';
  const isOpponentTurn = vm.status === 'OPPONENT_DECISION';
  const isResponseWindow = priorityContext?.windowType === 'response' || priorityContext?.windowType === 'interrupt';

  // If there's a resolving/declared card on the stack, show it enlarged
  if (topStack) {
    const actorLabel = topStack.isHuman ? 'PLAYED BY YOU' : `PLAYED BY ${esc(vm.opponent.displayName).toUpperCase()}`;
    const statusLabel = topStack.isResolving ? 'RESOLVING' : (isResponseWindow ? 'DECLARED' : 'ACTIVE');
    return `<div class="rd-active-stage has-card" aria-label="Active card" role="region">
      <div class="rd-stage-glow"></div>
      <div class="rd-stage-card">
        <div class="rd-stage-card-inner">${esc(topStack.description)}</div>
      </div>
      <div class="rd-stage-actor">${esc(actorLabel)}</div>
      <div class="rd-stage-status ${topStack.isResolving ? 'resolving' : 'pending'}">${statusLabel}</div>
      ${isResponseWindow ? `<div class="rd-stage-prompt">Response window open</div>` : ''}
    </div>`;
  }

  // AI thinking state (local AI matches only)
  if (isAiTurn) {
    return `<div class="rd-active-stage ai-thinking" aria-label="AI is deciding" role="region">
      <div class="rd-stage-glow ai"></div>
      <div class="rd-stage-actor">${esc(vm.opponent.displayName)}</div>
      <div class="rd-stage-thinking">
        <span class="rd-ai-dots"><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span></span>
        <span>is deciding\u2026</span>
      </div>
    </div>`;
  }

  // Network opponent thinking state — shows the opponent is choosing, but
  // does NOT hide the board. The stack/card is already rendered above if
  // present. This only fires when there's no stack item to show.
  if (isOpponentTurn) {
    return `<div class="rd-active-stage opponent-thinking" aria-label="Opponent is deciding" role="region">
      <div class="rd-stage-glow opponent"></div>
      <div class="rd-stage-actor">${esc(vm.opponent.displayName)}</div>
      <div class="rd-stage-thinking">
        <span class="rd-ai-dots"><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span><span class="rd-ai-dot"></span></span>
        <span>is choosing\u2026</span>
      </div>
    </div>`;
  }

  // Human turn, awaiting selection
  if (isHumanTurn) {
    const actionCount = vm.actions?.length ?? 0;
    const phaseLabel = formatPhase(vm.match.phase);
    const selectedCardId = opts.selectedSourceCardId;
    const selectedCard = selectedCardId
      ? (vm.battlefield?.humanHand ?? []).find(c => c.entityId === selectedCardId || c.cardId === selectedCardId)
      : null;
    // Use identity (e.g. "6♥") for display — card views have identity, not name/label
    const cardIdentity = selectedCard?.identity ?? null;
    const cardPreview = selectedCard
      ? `<div class="rd-stage-card"><div class="rd-stage-card-inner">${esc(cardIdentity || 'Selected')}</div></div>`
      : '';
    // When a card is selected, show meaningful preview + prompt.
    // When no card is selected, show board-state context (NOT duplicating Actions panel).
    const promptText = selectedCard
      ? `${esc(cardIdentity || 'Card')} selected — choose an action below`
      : '';
    const turnNum = vm.match.fullTurnSequence;
    const handCount = (vm.battlefield?.humanHand ?? []).length;
    const boardContext = selectedCard ? '' : `<div class="rd-stage-board-context">
      <div class="rd-stage-actor">TURN ${turnNum} · ${esc(phaseLabel)}</div>
      <div class="rd-stage-handcount">${handCount} card${handCount !== 1 ? 's' : ''} in hand</div>
    </div>`;
    return `<div class="rd-active-stage awaiting ${selectedCard ? 'has-selection' : ''}" aria-label="Awaiting your action" role="region">
      <div class="rd-stage-board-art" aria-hidden="true"></div>
      <div class="rd-stage-glow human"></div>
      <div class="rd-stage-idle-content">
        <div class="rd-stage-action-cluster">
          ${selectedCard ? '<div class="rd-stage-actor">SELECTED</div>' : ''}
          ${boardContext}
          ${cardPreview}
          ${promptText ? `<div class="rd-stage-prompt">${promptText}</div>` : ''}
          ${selectedCard ? `<div class="rd-stage-cancel"><button class="rd-stage-cancel-btn" data-action="cancel-selection" aria-label="Cancel card selection">✕ Cancel</button></div>` : ''}
        </div>
        <div class="rd-stage-bubble-fx" aria-hidden="true">
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
          <span class="rd-bubble"></span><span class="rd-bubble"></span><span class="rd-bubble"></span>
        </div>
      </div>
    </div>`;
  }

  // Idle / between turns — still show a deliberate composition, never an empty void
  const turn = vm.match.fullTurnSequence;
  const idlePhase = formatPhase(vm.match.phase);
  return `<div class="rd-active-stage idle" aria-label="Battlefield" role="region">
    <div class="rd-stage-board-art" aria-hidden="true"></div>
    <div class="rd-stage-idle-content">
      <div class="rd-stage-rune" aria-hidden="true"></div>
      <div class="rd-stage-actor">TURN ${turn}</div>
      <div class="rd-stage-phase">${esc(idlePhase)}</div>
      <div class="rd-stage-prompt">Awaiting next action</div>
    </div>
  </div>`;
}

// ── Resolution Stack (always rendered, empty state when no stack) ──

function renderResolutionStack(vm) {
  const items = vm.stack ?? [];
  const priorityOwner = vm.match.priorityOwnerId === vm.human.playerId ? 'YOU' :
    (vm.match.priorityOwnerId === vm.opponent.playerId ? vm.opponent.displayName.toUpperCase() : '');

  if (items.length === 0) {
    return `<div class="rd-resolution-stack empty" aria-label="Resolution stack" role="region" data-testid="resolution-stack">
      <div class="rd-stack-header">RESOLUTION STACK <span class="rd-stack-count">0</span></div>
      <div class="rd-stack-empty">Stack is empty</div>
      ${priorityOwner ? `<div class="rd-stack-priority">PRIORITY: ${esc(priorityOwner)}</div>` : ''}
    </div>`;
  }

  return `<div class="rd-resolution-stack" aria-label="Resolution stack" role="region" data-testid="resolution-stack">
    <div class="rd-stack-header">RESOLUTION STACK <span class="rd-stack-count">${items.length}</span></div>
    <div class="rd-stack-list">
      ${items.map((item, i) => {
        const cls = item.isResolving ? 'rd-stack-entry resolving' : 'rd-stack-entry';
        const actor = item.actorName || (item.isHuman ? 'You' : vm.opponent.displayName);
        const status = item.isResolving ? 'Resolving' : (item.status ?? 'Pending');
        return `<div class="${cls}" style="--stack-idx:${i}">
          <div class="rd-stack-entry-num">${i + 1}</div>
          <div class="rd-stack-entry-body">
            <div class="rd-stack-entry-desc">${esc(item.description)}</div>
            <div class="rd-stack-entry-meta">${esc(actor)} \u00b7 ${esc(status)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${priorityOwner ? `<div class="rd-stack-priority">PRIORITY: ${esc(priorityOwner)}</div>` : ''}
  </div>`;
}

// ── Contextual Actions (rendered in right rail, bottom section) ──
// v0.26.0: Re-architected with progressive disclosure:
//   Intent → Variant → Target → Confirmation
// Uses action-presentation.mjs for semantic grouping.

function renderActionBar(vm, opts, isHumanTurn, isAiTurn, isOpponentTurn, isReadOnly, priorityContext, immediate) {
  const passAction = vm.actions.find(a => a.isPass);
  const passHtml = (passAction && !isReadOnly) ? `<button class="rd-action-pass" data-action-id="${esc(passAction.actionId)}" data-key="P">Pass</button>` : '';

  if (isAiTurn) {
    return `<div class="rd-contextual-actions ai-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${esc(vm.opponent.displayName)} is deciding\u2026</div>
    </div>`;
  }

  // Network opponent's turn — show waiting state, no actions available
  if (isOpponentTurn) {
    return `<div class="rd-contextual-actions opponent-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${esc(vm.opponent.displayName)} is choosing\u2026</div>
    </div>`;
  }

  if (isReadOnly) {
    return `<div class="rd-contextual-actions read-only" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">Read-only mode</span>
    </div>`;
  }

  const actions = vm.actions || [];
  if (actions.length === 0 && !passAction) {
    return `<div class="rd-contextual-actions empty" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">No actions available</span>
    </div>`;
  }

  // Build card registry from vm for identity lookups
  const cardRegistry = {};
  const handCards = vm?.battlefield?.humanHand ?? [];
  for (const c of handCards) { if (c.entityId) cardRegistry[c.entityId] = c; }
  const oppPR = vm?.battlefield?.topPR ?? [];
  const oppER = vm?.battlefield?.topER ?? [];
  const humPR = vm?.battlefield?.bottomPR ?? [];
  const humER = vm?.battlefield?.bottomER ?? [];
  [...oppPR, ...oppER, ...humPR, ...humER].forEach(c => { if (c?.entityId) cardRegistry[c.entityId] = c; });
  // Include swap bar cards — face-down cards need slot labels for target display.
  // Apply the SAME visual reordering as renderSwapBar (face-up → center first)
  // so labels match what the player sees on the board.
  const swapSlots = vm?.zones?.swap ?? [];
  const slotLabels = ['Left', 'Center', 'Right'];
  const visualOrder = [null, null, null];
  const faceUpSlots = swapSlots.filter(s => s && s.card);
  const faceDownOrEmpty = swapSlots.filter(s => !s || !s.card);
  if (faceUpSlots.length > 0) visualOrder[1] = faceUpSlots[0];
  if (faceUpSlots.length > 1) visualOrder[0] = faceUpSlots[1];
  if (faceUpSlots.length > 2) visualOrder[2] = faceUpSlots[2];
  let fdIdx = 0;
  for (let i = 0; i < 3; i++) {
    if (!visualOrder[i]) visualOrder[i] = faceDownOrEmpty[fdIdx++] || null;
  }
  visualOrder.forEach((s, i) => {
    if (s?.card?.entityId) {
      cardRegistry[s.card.entityId] = s.card;
    }
    if (s?.entityId) {
      cardRegistry[s.entityId] = {
        entityId: s.entityId,
        identity: s.faceDown ? (slotLabels[i] ?? `Slot ${i + 1}`) : (s.card?.identity ?? `Slot ${i + 1}`),
        faceDown: s.faceDown === true,
        slotIndex: i,
      };
    }
  });

  // Build semantic action groups
  const groups = buildActionGroups(actions, {
    cardRegistry,
    selectedSourceCardId: opts.selectedSourceCardId ?? null,
  });

  if (groups.length === 0 && !passAction) {
    return `<div class="rd-contextual-actions empty" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <span class="rd-action-status">No actions available</span>
    </div>`;
  }

  // Determine panel state: overview, variant-selection, target-selection, confirm
  const selectedGroupId = opts.selectedIntentKey ?? null;
  const selectedActionId = opts.selectedActionId ?? null;
  const selectedSourceCardId = opts.selectedSourceCardId ?? null;

  // Find the selected group
  const selectedGroup = selectedGroupId
    ? groups.find(g => g.id === selectedGroupId)
    : null;

  // If a concrete action is selected, show confirmation or target selection
  if (selectedActionId) {
    const selectedAction = actions.find(a => a.actionId === selectedActionId);
    if (selectedAction) {
      if (selectedAction.targets?.required && !(opts.selectedTargets?.length > 0)) {
        return renderActionBarWithTargetSelection(vm, opts, selectedAction, groups, passHtml, priorityContext, immediate, cardRegistry);
      }
      return renderActionBarWithConfirm(vm, opts, selectedAction, groups, passHtml, priorityContext, immediate, cardRegistry);
    }
  }

  // If a group is selected and it has variants, show variant selection
  if (selectedGroup && selectedGroup.selectionType !== SELECTION_TYPE.DIRECT && selectedGroup.variants?.length > 1) {
    return renderActionBarWithVariants(vm, opts, selectedGroup, passHtml, priorityContext, immediate, cardRegistry);
  }

  // If a group is selected and it's direct or single-variant, try to auto-resolve
  // (the event handler handles this, but if we get here, just show the overview)

  // Default: show the overview with all groups
  return renderActionBarOverview(vm, opts, groups, passHtml, priorityContext, immediate, selectedSourceCardId, cardRegistry);
}

/**
 * Render the overview state — all action groups organized by category.
 * This is the normal resting state of the ACTIONS panel.
 */
function renderActionBarOverview(vm, opts, groups, passHtml, priorityContext, immediate, selectedSourceCardId, cardRegistry) {
  const cats = activeCategories(groups);
  const isResponse = isResponseWindowGroups(groups);
  const isStartPhase = vm.match.phase === 'Start' || vm.match.phase === 'SETUP';

  // Response window indicator
  const responseIndicator = isResponse && immediate?.passInfo
    ? `<div class="rd-response-hint" data-testid="pass-info">${esc(immediate.passInfo)}</div>` : '';

  // Priority indicator
  const priorityOwner = vm.match.priorityOwnerId === vm.human.playerId ? 'You' :
    (vm.match.priorityOwnerId === vm.opponent.playerId ? vm.opponent.displayName : '');
  const priorityIndicator = priorityOwner ? `<div class="rd-action-priority">\u25CF Priority: ${esc(priorityOwner)}</div>` : '';

  // Selected card header
  let selectedHeader = '';
  if (selectedSourceCardId) {
    const card = cardRegistry[selectedSourceCardId];
    const identity = card?.identity ?? '?';
    const matchingGroups = groups.filter(g => g.selectedCardMatch);
    const intentLabels = matchingGroups.map(g => g.label).join(' \u00b7 ');
    selectedHeader = `<div class="rd-selected-card-header" data-testid="selected-card-header">
      <span class="rd-selected-card-label">SELECTED</span>
      <span class="rd-selected-card-id">${esc(identity)}</span>
      ${intentLabels ? `<span class="rd-selected-card-intents">${esc(intentLabels)}</span>` : ''}
    </div>`;
  }

  // Build category sections
  const sectionsHtml = cats.map(cat => {
    const catGroups = groupsByCategory(groups, cat);
    if (catGroups.length === 0) return '';

    const catLabel = categoryLabel(cat);
    const catIcon = categoryIcon(cat);
    const isResponseCat = cat === ACTION_CATEGORY.RESPOND;

    const groupButtons = catGroups.map(group => {
      return renderGroupButton(group, selectedSourceCardId, cardRegistry, isResponseCat);
    }).join('');

    return `<div class="rd-action-category" data-testid="action-category-${esc(cat)}">
      <div class="rd-action-category-header">
        <span class="rd-action-category-icon" aria-hidden="true">${catIcon}</span>
        <span class="rd-action-category-label">${esc(catLabel)}</span>
      </div>
      <div class="rd-action-category-body">${groupButtons}</div>
    </div>`;
  }).join('');

  // In the Start phase, show preview buttons for Action-phase intents that
  // will become available after entering the Action Phase.
  let previewHtml = '';
  if (isStartPhase && !selectedSourceCardId) {
    const previews = [];
    // Draw from DP
    const dpCount = vm.zones?.draw?.count ?? 0;
    if (dpCount > 0) {
      const handCount = vm.battlefield?.humanHand?.length ?? 0;
      const drawLabel = handCount === 0 ? '2x Draw (empty hand)' : 'Draw from Pile';
      previews.push({ label: drawLabel, desc: 'Draw card(s) from the top of the Draw Pile.', icon: '\u2193' });
    }
    // Face-up Draw from swap bar
    const swapSlots = vm.zones?.swap ?? [];
    const hasFaceUp = swapSlots.some(s => s && s.card && !s.faceDown);
    if (hasFaceUp) {
      previews.push({ label: 'Face-up Draw', desc: 'Take a face-up card from the Swap Bar.', icon: '\u2191' });
    }
    if (previews.length > 0) {
      const previewBtns = previews.map(p => {
        return `<button class="rd-group-btn preview" disabled aria-label="${esc(p.label)} (available in Action Phase)" title="Available after entering Action Phase">
    <span class="rd-group-main">
      <span class="rd-group-label">${esc(p.label)}</span>
    </span>
    <span class="rd-group-desc">${esc(p.desc)}</span>
    <span class="rd-group-meta"><span class="rd-timing-badge preview-badge">Action Phase</span></span>
  </button>`;
      }).join('');
      previewHtml = `<div class="rd-action-category rd-preview-category" data-testid="action-category-preview">
      <div class="rd-action-category-header">
        <span class="rd-action-category-icon" aria-hidden="true">\u29C9</span>
        <span class="rd-action-category-label">Upcoming</span>
      </div>
      <div class="rd-action-category-body">${previewBtns}</div>
    </div>`;
    }
  }

  // Prompt text
  const legalCount = groups.filter(g => !g.isPass).length;
  const promptText = '';

  return `<div class="rd-contextual-actions" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">${isResponse ? 'RESPONSE' : 'ACTIONS'}</div>
    ${responseIndicator}
    ${selectedHeader}
    ${promptText}
    <div class="rd-action-categories">${sectionsHtml}${previewHtml}</div>
    <div class="rd-action-footer">${passHtml}</div>
    ${priorityIndicator}
  </div>`;
}

/**
 * Render a single action group as a button/card.
 * Shows the group label, description, variant count, and timing metadata.
 */
function renderGroupButton(group, selectedSourceCardId, cardRegistry, isResponseCat) {
  const cls = ['rd-group-btn'];
  if (group.isPass) cls.push('pass');
  if (group.selectedCardMatch) cls.push('card-match');
  if (isResponseCat) cls.push('response');

  // Determine if this group is available given the selected card
  const hasSources = group.sourceCardIds.length > 0;
  const sourceMatches = hasSources && selectedSourceCardId && group.sourceCardIds.includes(selectedSourceCardId);
  if (hasSources && selectedSourceCardId && !sourceMatches) {
    cls.push('dimmed');
  } else {
    cls.push('available');
  }
  const disabledAttr = (hasSources && selectedSourceCardId && !sourceMatches) ? 'disabled aria-disabled="true"' : '';

  // Variant count badge ("N options" or "N cards")
  let countBadge = '';
  if (group.variantCount > 1) {
    const countLabel = group.selectionType === SELECTION_TYPE.SOURCE
      ? `${group.variantCount} cards`
      : group.selectionType === SELECTION_TYPE.COMBINATION
        ? `${group.variantCount} configs`
        : group.selectionType === SELECTION_TYPE.TARGET
          ? `${group.variantCount} targets`
          : `${group.variantCount} options`;
    countBadge = `<span class="rd-group-count">${esc(countLabel)}</span>`;
  }

  // Score value badge
  const scoreBadge = group.scoreValue != null
    ? `<span class="rd-group-score">+${esc(group.scoreValue)}</span>` : '';

  // Timing badge (only for non-standard timing)
  const timingBadge = group.timingClass && group.timingClass !== 'ACTION' && group.timingClass !== 'ORDINARY'
    ? `<span class="rd-timing-badge">${esc(group.timingLabel)}</span>` : '';

  // Full Turn indicator
  const turnBadge = group.isFullTurn
    ? '<span class="rd-turn-badge">Full Turn</span>' : '';

  // Description
  const descHtml = group.description
    ? `<span class="rd-group-desc">${esc(group.description)}</span>` : '';

  return `<button class="${cls.join(' ')}" data-group-id="${esc(group.id)}" data-action-family="${esc(group.family)}" aria-label="${esc(group.label)}${group.variantCount > 1 ? ` — ${group.variantCount} options` : ''}" ${disabledAttr}>
    <span class="rd-group-main">
      <span class="rd-group-label">${esc(group.label)}</span>
      ${countBadge}${scoreBadge}
    </span>
    ${descHtml}
    <span class="rd-group-meta">${timingBadge}${turnBadge}</span>
  </button>`;
}

/**
 * Render the variant selection state — player has chosen a group and
 * now needs to pick which specific variant (source card, effect, configuration).
 */
function renderActionBarWithVariants(vm, opts, group, passHtml, priorityContext, immediate, cardRegistry) {
  const variants = group.variants ?? [];
  const isResponse = group.category === ACTION_CATEGORY.RESPOND;

  // Build variant buttons
  const variantButtons = variants.map(v => {
    const cls = ['rd-variant-btn'];
    // Check if this variant matches the selected source card
    if (opts.selectedSourceCardId && v.sourceHandles.includes(opts.selectedSourceCardId)) {
      cls.push('card-match');
    }
    // Show source card identities for source-type variants, but only when
    // the detail differs from the label (avoids "10♠ 10♠" duplication for
    // swap-bar face-down where the label IS the source card identity)
    let detail = '';
    if (v.sourceHandles.length > 0) {
      const srcs = v.sourceHandles.map(id => cardRegistry[id]?.identity ?? '?').join(' + ');
      if (srcs !== v.label) {
        detail = `<span class="rd-variant-detail">${esc(srcs)}</span>`;
      }
    }
    return `<button class="${cls.join(' ')}" data-variant-action-id="${esc(v.actionId)}" aria-label="${esc(v.label)}">
      <span class="rd-variant-label">${esc(v.label)}</span>
      ${detail}
    </button>`;
  }).join('');

  return `<div class="rd-contextual-actions variant-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-variant" aria-label="Back to actions">\u2190</button>
      <span class="rd-actions-title">${esc(group.label)}</span>
    </div>
    <div class="rd-variant-prompt">Choose ${esc(variantPromptLabel(group))}:</div>
    <div class="rd-variant-list" role="group" aria-label="${esc(group.label)} variants">${variantButtons}</div>
    <div class="rd-action-footer">
      <button class="rd-cancel-btn" data-action="cancel-variant" aria-label="Cancel variant selection">Cancel</button>
    </div>
  </div>`;
}

/**
 * Generate the prompt label for variant selection based on selection type.
 */
function variantPromptLabel(group) {
  switch (group.selectionType) {
    case SELECTION_TYPE.SOURCE: return 'a card';
    case SELECTION_TYPE.COMBINATION: return 'a configuration';
    case SELECTION_TYPE.TARGET: return 'a target';
    case SELECTION_TYPE.VARIANT: return 'an effect';
    default: return 'an option';
  }
}

/**
 * Render the target selection state — player has chosen a concrete action
 * and now needs to pick a target.
 */
function renderActionBarWithTargetSelection(vm, opts, action, groups, passHtml, priorityContext, immediate, cardRegistry) {
  let targets = action.targets?.legalTargetIds ?? [];
  const isSwapFaceDown = action.family === 'swap-bar' && action.mode === 'face-down';

  // For swap-bar face-down: the engine pre-pairs each (source, target) as a
  // separate action. When the player picked a source card (variant), only
  // that action's single target was shown. Collect ALL face-down targets
  // from ALL actions in the group that share the same source handle, so
  // the player can choose which slot to place on.
  if (isSwapFaceDown) {
    const sourceId = (action.sourceEntityIds ?? action.sourceHandles ?? [])[0];
    if (sourceId && groups) {
      const swapGroup = groups.find(g => g.family === 'swap-bar' && g.mode === 'face-down');
      if (swapGroup) {
        const allTargets = new Set();
        for (const a of swapGroup.actions) {
          const aSource = (a.sourceHandles ?? a.sourceEntityIds ?? [])[0];
          if (aSource === sourceId) {
            for (const tid of (a.targetHandles ?? a.targets?.legalTargetIds ?? [])) {
              allTargets.add(tid);
            }
          }
        }
        if (allTargets.size > 1) targets = [...allTargets];
      }
    }
  }

  const targetButtons = targets.map(tid => {
    const card = cardRegistry[tid];
    let label = card?.identity ?? tid;
    // For face-down swap bar targets, show slot position labels
    if (isSwapFaceDown && card?.faceDown) {
      label = card?.identity ?? 'Face-down';
    }
    const isSelected = opts.selectedTargets?.includes(tid);
    return `<button class="rd-target-btn ${isSelected ? 'selected' : ''}" data-testid="target-button" data-target-id="${esc(tid)}" aria-label="Select target ${esc(label)}">
      ${esc(label)}
    </button>`;
  }).join('');

  const actionLabel = action.displayLabel ?? action.shortLabel ?? 'Action';

  return `<div class="rd-contextual-actions target-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-target" aria-label="Back">\u2190</button>
      <span class="rd-actions-title">${esc(actionLabel)}</span>
    </div>
    <div class="rd-target-prompt">Select a target <span class="rd-target-count">(${targets.length} available)</span></div>
    <div class="rd-target-list" role="group" aria-label="Select a target">${targetButtons}</div>
    <div class="rd-action-footer">
      <button class="rd-cancel-btn" data-action="cancel-target" aria-label="Cancel target selection">Cancel</button>
    </div>
  </div>`;
}

/**
 * Render the confirmation state — player has chosen everything and
 * needs to confirm the action.
 */
function renderActionBarWithConfirm(vm, opts, action, groups, passHtml, priorityContext, immediate, cardRegistry) {
  const summary = action.displayLabel ?? action.shortLabel ?? 'Action';
  const sourceIds = action.sourceEntityIds ?? [];
  const targetIds = action.targets?.legalTargetIds ?? [];
  const sourceLabels = sourceIds.map(id => cardRegistry[id]?.identity ?? id).join(', ');
  const targetLabels = targetIds.map(id => cardRegistry[id]?.identity ?? id).join(', ');
  const costsText = action.costs?.length > 0
    ? action.costs.map(c => c.label ?? c.type ?? '').join(', ') : '';
  const isFullTurn = action.timingClass === 'ACTION' && !action.isResponse;
  const timingLbl = timingLabel(action.timingClass ?? 'ACTION');

  return `<div class="rd-contextual-actions confirm-mode" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">
      <button class="rd-back-btn" data-action="cancel-confirm" aria-label="Back">\u2190</button>
      <span class="rd-actions-title">Confirm</span>
    </div>
    <div class="rd-confirm-box" data-testid="action-confirm">
      <div class="rd-confirm-action">${esc(summary)}</div>
      ${sourceLabels ? `<div class="rd-confirm-sources">Source: ${esc(sourceLabels)}</div>` : ''}
      ${targetLabels ? `<div class="rd-confirm-targets">Target: ${esc(targetLabels)}</div>` : ''}
      ${isFullTurn ? '<div class="rd-confirm-turn">Full Turn commitment</div>' : ''}
      ${timingLbl && timingLbl !== 'Action' ? `<div class="rd-confirm-timing">${esc(timingLbl)}</div>` : ''}
      ${costsText ? `<div class="rd-confirm-costs">Costs: ${esc(costsText)}</div>` : ''}
    </div>
    <div class="rd-action-footer">
      <button class="rd-confirm-btn" data-testid="confirm-action" data-action-id="${esc(action.actionId)}" aria-label="Confirm: ${esc(summary)}">Confirm</button>
      <button class="rd-cancel-btn" data-action="cancel-confirm" aria-label="Cancel">Cancel</button>
    </div>
  </div>`;
}

// ── Right rail (Chat + Game Log + Contextual Actions, all visible) ──

function renderRightRail(vm, opts, isReadOnly, snapshot, priorityContext, immediate, guidanceMode, isHumanTurn, isAiTurn) {
  const chatMessages = (opts.chatMessages || []).slice(-30);

  // Game log: player-readable events (no engine diagnostics)
  const events = snapshot?.recentEvents ?? [];
  const gameLogHtml = renderGameLog(events);

  // Chat panel
  const chatHtml = renderChatPanel(vm, opts, isReadOnly, chatMessages);

  // Contextual actions (bottom of rail)
  const actionsHtml = renderActionBar(vm, opts, isHumanTurn, isAiTurn, isReadOnly, priorityContext, immediate);

  // Dev panel (collapsible, at very bottom)
  const devHtml = renderDevPanel(snapshot, priorityContext, immediate, guidanceMode);
  const showDev = opts.rightRailTab === 'debug';

  return `<aside class="rd-right-rail" aria-label="Match panel">
    <div class="rd-rail-chat">${chatHtml}</div>
    <div class="rd-rail-gamelog">
      <div class="rd-rail-section-header">GAME LOG</div>
      ${gameLogHtml}
    </div>
    <div class="rd-rail-actions">
      ${actionsHtml}
    </div>
    ${showDev ? `<div class="rd-rail-dev">${devHtml}</div>` : ''}
  </aside>`;
}

// ── Chat panel (persistent, always present) ────────────────────
// T1: renderChatPanel is imported from chat-panel.js (see top of file)

// ── Game Log (player-readable, no engine diagnostics) ──────────

function renderGameLog(events, systemEvents) {
  const cardRegistry = arguments[2] ?? null;
  // Build player-readable gameplay events
  let logEntries = [];
  if (events && events.length > 0) {
    const log = buildEventLog(events, cardRegistry);
    const playerReadable = log.filter(e => {
      const desc = e.description ?? e.text ?? '';
      const type = e.type ?? '';
      if (type.includes('PHASE') && desc.includes('unknown')) return false;
      if (type.includes('CORE') || type.includes('SNAPSHOT') || type.includes('VOLTAGE')) return false;
      if (type.includes('INIT') || type.includes('PREPARE') || type.includes('PREPARED')) return false;
      if (desc.includes('core start') || desc.includes('snapshot captured') || desc.includes('voltage snapshot')) return false;
      if (desc.includes('core initialized') || desc.includes('core prepared')) return false;
      if (desc === `${type.replace(/_/g, ' ').toLowerCase()}.`) return false;
      return true;
    });
    logEntries = playerReadable.map(e => ({
      description: e.description ?? e.text ?? '',
      isSystem: false,
    }));
  }

  // Add system events (chat visibility changes, etc.)
  if (systemEvents && systemEvents.length > 0) {
    for (const evt of systemEvents) {
      if (evt.type === 'CHAT_VISIBILITY') {
        const name = evt.displayName ?? 'Opponent';
        const action = evt.hidden ? 'has hidden Match Chat.' : 'has restored Match Chat.';
        logEntries.push({
          description: `${name} ${action}`,
          isSystem: true,
        });
      }
    }
  }

  const recent = [...logEntries].reverse().slice(0, 40);
  if (recent.length === 0) {
    return `<div class="rd-game-log" data-testid="event-log" role="log">
      <div class="rd-game-log-empty">No events yet</div>
    </div>`;
  }
  return `<div class="rd-game-log" data-testid="event-log" role="log">
    ${recent.map(e => `<div class="rd-log-entry${e.isSystem ? ' rd-log-system' : ''}">
      <span class="event-description">${esc(e.description)}</span>
    </div>`).join('')}
  </div>`;
}

// ── Dev panel (debug info behind tab) ──────────────────────────

function renderDevPanel(snapshot, priorityContext, immediate, guidanceMode) {
  if (!snapshot) return '<div class="rd-dev-empty">No debug info</div>';
  const decision = snapshot.decision;
  if (!decision) return '<div class="rd-dev-empty">No active decision</div>';

  const whyHtml = renderWhyCanIAct(decision, snapshot, priorityContext);
  const timeline = priorityContext ? priorityTimeline(priorityContext) : [];
  const timelineHtml = timeline.length > 0 ? `<details class="priority-timeline">
    <summary>Priority timeline</summary>
    <ol class="timeline-steps">${timeline.map(s => `<li class="timeline-step ${s.active ? 'active' : ''} ${s.done ? 'done' : ''}">${esc(s.label)}</li>`).join('')}</ol>
  </details>` : '';

  const bannerText = priorityContext ? priorityBannerText(priorityContext, snapshot.opponent?.displayName ?? 'Opponent') : '';
  const kindLabel = decisionKindLabel(decision?.kind ?? 'UNKNOWN');

  return `<div class="rd-dev-content">
    <div class="rd-dev-section">
      <span class="rd-dev-label">Decision kind</span>
      <span class="rd-dev-value">${esc(kindLabel)}</span>
    </div>
    ${bannerText ? `<div class="rd-dev-section"><span class="rd-dev-label">Context</span><span class="rd-dev-value">${esc(bannerText)}</span></div>` : ''}
    ${immediate?.passInfo ? `<div class="rd-dev-section"><span class="rd-dev-label">Pass info</span><span class="rd-dev-value" data-testid="pass-info">${esc(immediate.passInfo)}</span></div>` : ''}
    ${whyHtml}
    ${timelineHtml}
  </div>`;
}

function renderPassButton(vm, opts) {
  const passAction = vm.actions.find(a => a.isPass);
  if (!passAction || opts.leaseMode === 'READ_ONLY') return '';
  return `<button class="rd-priority-pass" data-action-id="${esc(passAction.actionId)}" data-key="P">Pass</button>`;
}

// ── Left utility rail ──────────────────────────────────────────

function renderLeftRail(vm) {
  const { zones } = vm;
  const gyTopCard = zones.discard.topCard;
  return `<aside class="rd-rail-left" aria-label="Pile rail">
    ${renderPile('Draw', zones.draw.count, null, 'draw')}
    ${renderPile('Discard', zones.discard.count, gyTopCard, 'discard')}
    ${renderPile('Exile', zones.exile.count, zones.exile.newestCard, 'exile')}
    ${gyTopCard ? `<div class="graveyard-top" data-testid="graveyard-top" aria-label="Graveyard top card">${esc(gyTopCard.identity)}</div>` : ''}
  </aside>`;
}

function renderPile(label, count, topCard, dataPile) {
  const topHtml = topCard
    ? `<div class="rd-pile-topcard">${esc(topCard.identity)}</div>`
    : (count > 0 ? '' : '<div class="rd-pile-empty">Empty</div>');
  const drawBg = dataPile === 'draw' && count > 0
    ? '<div class="rd-pile-cardback mini" aria-hidden="true"></div>'
    : '';
  return `<div class="rd-pile" data-pile="${dataPile}" title="${label} (${count})">
    ${drawBg}
    <div class="rd-pile-label">${label}</div>
    <div class="rd-pile-count">${count}</div>
    ${topHtml}
  </div>`;
}

// ── Battlefield ────────────────────────────────────────────────

function renderBattlefield(vm, opts) {
  const { battlefield, human, opponent } = vm;
  const isHumanTop = battlefield.humanSeatIndex === 0;

  const topPlate = isHumanTop ? human : opponent;
  const bottomPlate = isHumanTop ? opponent : human;
  const topPR = isHumanTop ? battlefield.topPR : battlefield.topPR;
  const topER = isHumanTop ? battlefield.topER : battlefield.topER;
  const bottomPR = isHumanTop ? battlefield.bottomPR : battlefield.bottomPR;
  const bottomER = isHumanTop ? battlefield.bottomER : battlefield.bottomER;

  // Determine actual top/bottom based on seat
  const oppPlate = vm.opponent;
  const humPlate = vm.human;
  const oppPR = battlefield.topPR;  // opponent is always top in the view model
  const oppER = battlefield.topER;
  const humPR = battlefield.bottomPR;
  const humER = battlefield.bottomER;

  return `<div class="rd-battlefield" aria-label="Battlefield">
    <section class="rd-opponent-zone" aria-label="Opponent">
      ${renderPlayerPlate(oppPlate, 'opponent')}
      ${renderOpponentHand(battlefield.opponentHandCount)}
      ${renderBoardRow(oppER, 'ER')}
      ${renderBoardRow(oppPR, 'PR')}
    </section>
    ${renderSwapBar(vm, opts, false, true)}
    <section class="rd-human-zone" aria-label="Your board">
      ${renderBoardRow(humPR, 'PR')}
      ${renderBoardRow(humER, 'ER')}
      ${renderHumanHand(battlefield.humanHand, opts)}
      ${renderPlayerPlate(humPlate, 'human')}
    </section>
  </div>`;
}

function renderPlayerPlate(plate, side) {
  const badgeHtml = renderBadges(plate.badges);
  const ratingHtml = plate.rating
    ? `<span class="rd-plate-rating">${plate.rating.value}${plate.rating.provisional ? '?' : ''}</span>`
    : (plate.aiRating ? `<span class="rd-plate-rating">AI ${plate.aiRating}</span>` : '');
  // Compact rank glyph for human players (32px — enhances identity without
  // consuming battlefield space). AI opponents show no rank glyph.
  const rankGlyph = plate.isHuman && plate.rating
    ? (() => {
        const a = ratingToTierDivision(plate.rating.value, { ratedMatches: plate.rating.ratedMatches });
        return renderRankGlyph({ tier: a.tier, division: a.division, size: 32, showDivision: true, decorative: true, className: 'rd-plate-glyph' });
      })()
    : '';
  return `<div class="rd-player-plate ${side}">
    ${rankGlyph}
    <div class="rd-plate-avatar ${side}">${esc(plate.monogram)}</div>
    <div class="rd-plate-info">
      <div class="rd-plate-name" title="${esc(plate.displayName)}">${esc(plate.displayName)}</div>
      <div class="rd-plate-meta">${plate.isHuman ? 'Human' : 'AI'} ${ratingHtml}</div>
      ${badgeHtml}
    </div>
  </div>`;
}

function renderBadges(badges) {
  if (!badges || !badges.length) return '';
  const visible = badges.slice(0, 4);
  const overflow = badges.length > 4 ? badges.length - 4 : 0;
  return `<div class="rd-plate-badges">
    ${visible.map(b => `<span class="rd-badge" title="${esc(b.name)}">${esc(b.icon || b.id.slice(0, 1).toUpperCase())}</span>`).join('')}
    ${overflow > 0 ? `<span class="rd-badge-overflow">+${overflow}</span>` : ''}
  </div>`;
}

// ── Profile block (shared between enemy and player) ────────────
// ── Score Spine (dedicated score column) ───────────────────────

function renderScoreSpine(vm) {
  const opp = vm.opponent;
  const hum = vm.human;
  return `<div class="rd-score-block opponent">
    <span class="rd-score-block-label">OPP</span>
    <span class="rd-score-block-value">${opp.secured}<span class="rd-score-block-goal">/${esc(opp.goal)}</span></span>
  </div>
  <div class="rd-score-block-sep"></div>
  <div class="rd-score-block human">
    <span class="rd-score-block-label">YOU</span>
    <span class="rd-score-block-value">${hum.secured}<span class="rd-score-block-goal">/${esc(hum.goal)}</span></span>
  </div>`;
}

function renderProfileBlock(plate, side, vm) {
  const badgeHtml = renderBadges(plate.badges);
  const isNetwork = vm.mode?.isNetwork === true;
  const isLocal = side === 'human' || plate.isLocalPlayer === true;

  // Rating display: for human players show their rating value;
  // for AI opponents show "AI {rating}"; for network human opponents show their rating.
  const ratingHtml = plate.rating
    ? `<span class="rd-plate-rating">${plate.rating.value}${plate.rating.provisional ? '?' : ''}</span>`
    : (plate.aiRating != null ? `<span class="rd-plate-rating">AI ${plate.aiRating}</span>` : '');

  const isActive = vm.match.activePlayerId === plate.playerId;

  // Side label: for local player in network matches, show their name with a
  // subtle "You" indicator; for network human opponents, show "Human";
  // for AI opponents, show "AI Opponent".
  let sideLabel;
  if (isLocal) {
    sideLabel = isNetwork ? 'You' : 'You';
  } else {
    sideLabel = plate.isHuman ? 'Human' : 'AI Opponent';
  }

  // Rank label for human players (e.g. "Vanguard II"). AI shows no rank label.
  const rankLabelHtml = plate.isHuman && plate.rating
    ? (() => {
        const a = ratingToTierDivision(plate.rating.value, { ratedMatches: plate.rating.ratedMatches });
        return a.isPlacement ? '' : `<span class="rd-prestige-rank" data-testid="profile-rank-label-${side}">${esc(rankLabel(a.tier, a.division))}</span>`;
      })()
    : (plate.isHuman && plate.rank ? `<span class="rd-prestige-rank" data-testid="profile-rank-label-${side}">${esc(plate.rank)}</span>` : '');

  // v0.25: Prestige banner is identity-only (name, rating, badges, cosmetics).
  // Score has been moved to the dedicated Score Rail between Game Log and Active Stage.
  // Banner background placeholder can later hold custom prestige images.
  const bannerHtml = `<div class="rd-prestige-banner rd-prestige-banner-${side}" data-testid="profile-banner-${side}" aria-label="${side === 'opponent' ? 'Opponent' : 'Player'} prestige banner">
    <div class="rd-prestige-banner-bg" aria-hidden="true"></div>
    <div class="rd-prestige-banner-scrim" aria-hidden="true"></div>
    <div class="rd-prestige-banner-content">
      <span class="rd-prestige-banner-name">${esc(plate.displayName)}</span>
      <span class="rd-prestige-banner-meta">${esc(sideLabel)} ${ratingHtml} ${rankLabelHtml} ${badgeHtml}</span>
    </div>
  </div>`;

  // Compact identity row (avatar + active indicator) — sits outside the banner
  const identityHtml = side === 'opponent'
    ? ''
    : `<div class="rd-profile-identity">
      <div class="rd-profile-avatar ${side} ${isActive ? 'active' : ''}">${esc(plate.monogram)}</div>
    </div>`;

  // Opponent: banner only; Player: avatar on top, banner at bottom
  const inner = side === 'opponent'
    ? `${bannerHtml}`
    : `${identityHtml}${bannerHtml}`;

  return `<div class="rd-profile-block ${side} ${isActive ? 'active' : ''}" data-testid="profile-${side}">
    ${inner}
  </div>`;
}

function renderOpponentHand(count) {
  const backs = Array.from({ length: Math.min(count, 7) }, () => '<div class="rd-card-back" aria-hidden="true"></div>').join('');
  return `<div class="rd-opponent-hand" aria-label="Opponent hand, ${count} cards">
    ${backs}
    ${count > 7 ? `<span class="rd-opponent-hand-count">+${count - 7}</span>` : ''}
  </div>`;
}

function renderBoardRow(cards, label, rowType) {
  const count = cards.length;
  const countClass = count === 0 ? '' : count <= 4 ? `count-${count}` : count <= 6 ? 'count-5' : 'count-7-plus';
  const typeClass = rowType === 'pr' ? 'rd-row-pr' : 'rd-row-er';
  return `<div class="rd-board-row ${typeClass}" aria-label="${label} row">
    <span class="rd-board-row-label">${label}</span>
    <div class="rd-board-row-cards ${countClass}">
      ${count === 0
        ? `<span class="rd-board-row-empty">No ${label.toLowerCase()} cards</span>`
        : cards.map(c => renderCard(c)).join('')}
    </div>
  </div>`;
}

function renderHumanHand(cards, opts) {
  if (!cards || !cards.length) return `<div class="rd-hand hand-empty" aria-label="Your hand is empty"><span class="hand-empty">Your hand is empty.</span></div>`;
  return `<div class="rd-hand" aria-label="Your hand, ${cards.length} cards">
    ${cards.map(c => renderCard(c, { isHand: true, selectedSourceCardId: opts.selectedSourceCardId, selectedActionId: opts.selectedActionId })).join('')}
  </div>`;
}

// ── Card ───────────────────────────────────────────────────────

/**
 * Map a view-model card (from buildRankedDuelViewModel) into the shape
 * expected by renderTcgCard (play-card-component.js). The view-model
 * stores status as a statusMarkers array; renderTcgCard reads individual
 * boolean fields.
 */
function vmCardToTcgCard(card) {
  const markers = new Set((card.statusMarkers ?? []).map(m => m?.type));
  return {
    id: card.entityId ?? card.id,
    identity: card.identity,
    pointValue: card.pointValue,
    tapped: markers.has('TAPPED'),
    aegis: markers.has('AEGIS'),
    providesGuard: markers.has('GUARD'),
    exileBound: markers.has('EXILE_BOUND'),
    jackHostId: markers.has('ATTACHMENT') ? true : undefined,
    faceDown: false,
  };
}

function renderCard(card, handOpts = {}) {
  if (!card) return '';
  const classes = ['rd-card'];
  if (handOpts.isHand) classes.push('hand-card');
  if (card.statusMarkers?.some(m => m.type === 'TAPPED')) classes.push('tapped');
  if (handOpts.selectedSourceCardId && card.entityId === handOpts.selectedSourceCardId) classes.push('selected');
  if (card.legalSource) classes.push('legal-source', 'has-legal-actions');
  if (!card.legalSource && handOpts.isHand) classes.push('no-legal-actions');
  if (card.isSuper) classes.push('super-eligible');
  if (card.statusMarkers?.some(m => m.type === 'LEGAL_TARGET')) classes.push('legal-target');

  // v0.17.0: Legal action indicator for hand cards
  const legalIndicator = handOpts.isHand && card.legalSource
    ? `<span class="legal-action-indicator" aria-label="Has legal actions">●</span>` : '';
  const superEligibleBadge = handOpts.isHand && card.isSuper
    ? `<span class="super-eligible-badge" aria-label="Super eligible">★</span>` : '';

  const handAriaLabel = handOpts.isHand
    ? `aria-label="Hand card ${esc(card.identity || '?')}${card.legalSource ? ' — has legal actions' : ''}"`
    : '';

  // v0.20.0: Use renderTcgCard for the board card face (the "board" Card
  // Face type). This shows rank, suit, art, points, and state markers
  // using the authoritative card-face-data registry. The .rd-card wrapper
  // carries interaction classes/data attributes; the .tcg-card inside is
  // the visual card face. Hand cards get mechanic icons in the center
  // (the Board appearance).
  const tcgCardHtml = renderTcgCard(vmCardToTcgCard(card), {
    showMechanicIcons: handOpts.isHand === true,
  });

  return `<div class="${classes.join(' ')}" data-card-id="${esc(card.entityId)}" data-card-identity="${esc(card.identity ?? '')}" data-testid="board-card" ${handAriaLabel} title="${esc(card.identity || 'Card')}">
    ${tcgCardHtml}
    ${legalIndicator}${superEligibleBadge}
    ${card.isGeneratedCopy ? '<div class="rd-card-copy-badge">Copy</div>' : ''}
  </div>`;
}

// ── Swap bar ───────────────────────────────────────────────────

function renderSwapBar(vm, opts, isHumanTurn, isReadOnly) {
  const { swap } = vm.zones;
  const rawSlots = swap && swap.length ? swap : [null, null, null];

  // Find face-up-draw actions so we can show "Take" buttons on eligible cards
  const faceUpDrawActions = isHumanTurn && !isReadOnly
    ? (vm.actions || []).filter(a => a.family === 'swap-bar' && a.mode === 'face-up-draw')
    : [];
  const faceUpDrawByTarget = new Map();
  for (const a of faceUpDrawActions) {
    const tid = (a.targetHandles ?? a.targets?.legalTargetIds ?? [])[0];
    if (tid) faceUpDrawByTarget.set(tid, a);
  }

  // Ensure exactly 3 slots; reorder so any face-up card is in the MIDDLE slot
  const slots = [null, null, null];
  const cards = rawSlots.filter(s => s && s.card);
  const empties = rawSlots.filter(s => !s || !s.card);
  // Place first card in middle (index 1), remaining cards in left/right
  if (cards.length > 0) slots[1] = cards[0];
  if (cards.length > 1) slots[0] = cards[1];
  if (cards.length > 2) slots[2] = cards[2];
  // Fill remaining empties
  let emptyIdx = 0;
  for (let i = 0; i < 3; i++) {
    if (!slots[i]) slots[i] = empties[emptyIdx++] || null;
  }
  const slotHtml = Array.from({ length: 3 }, (_, i) => {
    const s = slots[i];
    if (s && s.card) {
      // Use renderTcgCard for full card face rendering (rank, suit, art, points)
      const tcgCard = vmCardToTcgCard(s.card);
      const cardHtml = renderTcgCard(tcgCard, { zoneClass: 'swap' });
      // "Take" button for face-up swap cards when the player can draw them
      const cardId = s.card.entityId ?? s.entityId;
      const drawAction = faceUpDrawByTarget.get(cardId);
      const takeBtn = drawAction
        ? `<button class="rd-swap-take-btn" data-action="swap-take" data-action-id="${esc(drawAction.actionId)}" data-testid="swap-take-btn" aria-label="Take ${esc(s.card.identity ?? 'card')} from swap bar">Take</button>`
        : '';
      return `<div class="rd-swap-slot has-card" data-swap-index="${i}" aria-label="Swap slot ${i+1}: ${esc(s.card.identity ?? 'card')}">
        ${cardHtml}
        ${takeBtn}
      </div>`;
    }
    if (s && s.faceDown) {
      // Face-down card in swap — show mini card back, not empty
      return `<div class="rd-swap-slot face-down" data-swap-index="${i}" aria-label="Swap slot ${i+1}: face down" aria-hidden="true">
        ${renderTcgCardBack('mini')}
      </div>`;
    }
    return `<div class="rd-swap-slot empty" data-swap-index="${i}" aria-hidden="true"></div>`;
  }).join('');
  return `<div class="rd-swap-bar" aria-label="Swap bar">
    <span class="rd-swap-label">SWAP BAR</span>
    <div class="rd-swap-slots">
      ${slotHtml}
    </div>
  </div>`;
}

// ── Right interaction rail ─────────────────────────────────────

function renderRightRailLegacy(vm, opts, isHumanTurn, isAiTurn, isReadOnly) {
  // Conditional panels: Stack collapses when empty, Chat collapses when no messages
  const stackItems = vm.stack || [];
  const chatMessages = (opts.chatMessages || []).slice(-8);
  const hasStack = stackItems.length > 0;
  const hasChat = chatMessages.length > 0;

  return `<aside class="rd-rail-right" aria-label="Interaction rail" data-stack-active="${hasStack}" data-chat-active="${hasChat}">
    ${hasChat ? renderChat(vm, opts, isReadOnly) : ''}
    ${hasStack ? renderStack(vm) : ''}
    ${renderActions(vm, opts, isHumanTurn, isAiTurn, isReadOnly)}
  </aside>`;
}

function renderChat(vm, opts, isReadOnly) {
  const messages = (opts.chatMessages || []).slice(-8);
  return `<div class="rd-chat" aria-label="Match chat">
    <div class="rd-chat-header">MATCH CHAT \u00b7 LOCAL</div>
    <div class="rd-chat-messages">
      ${messages.length === 0 ? '<div class="rd-stack-empty">No messages yet</div>' : ''}
      ${messages.map(m => {
        const cls = m.isHuman ? 'human' : m.isAi ? 'ai' : 'system';
        return `<div class="rd-chat-msg ${cls}">${esc(m.text || m.message || '')}</div>`;
      }).join('')}
    </div>
    ${!isReadOnly ? `<div class="rd-chat-input">
      <input type="text" placeholder="Type a message..." data-chat-input maxlength="200" aria-label="Chat message">
      <button data-action="chat-send">Send</button>
    </div>` : ''}
  </div>`;
}

function renderStack(vm) {
  const items = vm.stack;
  return `<div class="rd-stack" aria-label="Resolution stack">
    <div class="rd-stack-header">STACK</div>
    <div class="rd-stack-items">
      ${items.length === 0 ? '<div class="rd-stack-empty">Stack empty</div>' : ''}
      ${items.map(item => {
        const cls = item.isResolving ? 'rd-stack-item resolving' : 'rd-stack-item';
        return `<div class="${cls}">${esc(item.description)}</div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderActions(vm, opts, isHumanTurn, isAiTurn, isReadOnly) {
  if (isAiTurn) {
    return `<div class="rd-actions" aria-label="Actions">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-actions-thinking">AI is deciding...</div>
    </div>`;
  }

  if (isReadOnly) {
    return `<div class="rd-actions" aria-label="Actions">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-actions-thinking">Read-only mode</div>
    </div>`;
  }

  const actions = vm.actions || [];
  if (actions.length === 0) {
    return `<div class="rd-actions" aria-label="Actions">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-actions-list">
        <div class="rd-stack-empty">No legal actions</div>
      </div>
    </div>`;
  }

  // Build intent groups: one entry per (family, mode) pair, deduplicating concrete actions
  const intents = buildIntentGroups(actions);
  const selectedSourceCardId = opts.selectedSourceCardId;
  const selectedActionId = opts.selectedActionId;

  // Determine the currently selected intent (from explicit intent selection or concrete action)
  const selectedIntentKey = opts.selectedIntentKey ?? null;
  const selectedIntent = selectedIntentKey
    ? intents.find(i => i.intentKey === selectedIntentKey)
    : intents.find(i => i.actions.some(a => a.actionId === selectedActionId));

  // Group intents by timing class
  const { groups, groupOrder } = buildGroupedActions(actions);
  const timingByIntent = new Map();
  for (const [timingKey, groupActions] of Object.entries(groups)) {
    for (const a of groupActions) {
      const key = `${a.family}|${a.mode ?? ''}`;
      timingByIntent.set(key, timingKey);
    }
  }

  const groupLabels = {
    primary: 'Primary', quick: 'Quick', interrupt: 'Interrupt',
    response: 'Response', score: 'Score', pass: 'Pass', system: 'System',
  };
  const groupIcons = {
    primary: '\u25C6', quick: '\u26A1', interrupt: '\u2726', response: '\u21A9',
    score: '\u2605', pass: '\u2298', system: '\u2699',
  };

  // Render intent buttons grouped by timing class
  const groupsHtml = groupOrder.map(key => {
    const groupIntents = intents.filter(i => timingByIntent.get(i.intentKey) === key);
    if (groupIntents.length === 0) return '';

    const buttons = groupIntents.map(intent => {
      const cls = ['rd-intent-btn'];
      if (intent.isPass) cls.push('pass');
      const isSelected = selectedIntent && selectedIntent.intentKey === intent.intentKey;
      if (isSelected) cls.push('selected');

      // Source eligibility: if a source card is selected, check if this intent has actions for it
      const hasSources = intent.sourceCardIds.length > 0;
      const sourceMatches = hasSources && selectedSourceCardId && intent.sourceCardIds.includes(selectedSourceCardId);
      if (sourceMatches || !hasSources || !selectedSourceCardId) cls.push('eligible');
      const disabledAttr = (hasSources && selectedSourceCardId && !sourceMatches) ? 'disabled aria-disabled="true"' : '';

      // Badges
      const timingBadge = intent.timingClass && intent.timingClass !== 'ACTION' && intent.timingClass !== 'ORDINARY'
        ? `<span class="rd-action-timing">${esc(intent.timingLabel)}</span>` : '';
      const superBadge = intent.isSuper ? '<span class="rd-action-super">SUPER</span>' : '';
      const spadesBadge = intent.isSpadesVariant ? '<span class="rd-action-spades">\u2660</span>' : '';
      const costHint = intent.costs && intent.costs.length > 0
        ? `<span class="rd-action-cost">${intent.costs.map(c => esc(c.label ?? c.type ?? '')).join(', ')}</span>` : '';
      const sourceCount = intent.sourceCardIds.length > 1
        ? `<span class="rd-intent-count">${intent.sourceCardIds.length}</span>` : '';

      return `<button class="${cls.join(' ')}" data-intent-key="${esc(intent.intentKey)}" data-action-family="${esc(intent.family)}" aria-label="${esc(intent.displayLabel)}" ${disabledAttr}>
        <span class="rd-action-label">${esc(intent.shortLabel || intent.displayLabel)}</span>
        ${timingBadge}${superBadge}${spadesBadge}${costHint}${sourceCount}
      </button>`;
    }).join('');

    return `<div class="rd-action-group" data-testid="action-group-${esc(key)}">
      <span class="rd-action-group-label"><span class="rd-action-group-icon" aria-hidden="true">${groupIcons[key]}</span> ${esc(groupLabels[key])}</span>
      ${buttons}
    </div>`;
  }).join('');

  // Source card selection section (shown when an intent is selected but no source is chosen)
  let sourceSection = '';
  let targetSection = '';
  let confirmSection = '';

  if (selectedIntent && !selectedActionId) {
    // Intent selected but no concrete action chosen yet — show source selection
    sourceSection = renderSourceSelection(selectedIntent, opts, vm);
  } else if (selectedActionId) {
    // Concrete action selected — show targets and confirmation
    const selectedAction = actions.find(a => a.actionId === selectedActionId);
    if (selectedAction) {
      if (selectedAction.targets?.required && !(opts.selectedTargets?.length > 0)) {
        targetSection = renderTargetSelection(selectedAction, opts);
      } else {
        confirmSection = renderConfirmation(selectedAction, opts);
      }
    }
  }

  return `<div class="rd-actions" aria-label="Actions" data-testid="action-rail">
    <div class="rd-actions-header">ACTIONS <span class="rd-actions-count">${intents.length}</span></div>
    <div class="rd-actions-list">
      ${groupsHtml}
    </div>
    ${sourceSection}
    ${targetSection}
    ${confirmSection}
  </div>`;
}

/**
 * Render source card selection for a chosen intent.
 * Shows which hand cards can perform this action.
 */
function renderSourceSelection(intent, opts, vm) {
  const sources = intent.sourceCardIds;
  if (sources.length === 0) return '';
  if (sources.length === 1) {
    // Single source — auto-select it (handled by click handler)
    return '';
  }

  // Build a card registry from the human hand for identity lookup
  const handCards = vm?.battlefield?.humanHand ?? [];
  const cardRegistry = {};
  for (const c of handCards) {
    if (c.entityId) cardRegistry[c.entityId] = c.identity ?? c.entityId;
  }

  const sourceButtons = sources.map(sid => {
    const isSelected = opts.selectedSourceCardId === sid;
    const label = cardRegistry[sid] ?? sid;
    return `<button class="rd-source-btn ${isSelected ? 'selected' : ''}" data-card-id="${esc(sid)}" aria-label="Select source ${esc(label)}">
      ${esc(label)}
    </button>`;
  }).join('');

  return `<div class="rd-source-selection" data-testid="source-selection" role="group" aria-label="Select a card">
    <span class="rd-source-prompt">${esc(intent.displayLabel)} — which card?</span>
    <div class="rd-source-buttons">${sourceButtons}</div>
    <button class="rd-cancel-btn" data-testid="cancel-intent" aria-label="Cancel intent selection">Cancel</button>
  </div>`;
}

/**
 * Render target selection buttons for actions that require targets.
 */
function renderTargetSelection(action, opts) {
  const targets = action.targets?.legalTargetIds ?? [];
  if (targets.length === 0) {
    return `<div class="rd-target-selection" data-testid="target-selection">
      <span class="rd-target-prompt">No legal targets available.</span>
    </div>`;
  }
  const targetButtons = targets.map(tid => {
    const isSelected = opts.selectedTargets?.includes(tid);
    return `<button class="rd-target-btn ${isSelected ? 'selected' : ''}" data-testid="target-button" data-target-id="${esc(tid)}" aria-label="Select target ${esc(tid)}">
      ${esc(tid)}
    </button>`;
  }).join('');
  return `<div class="rd-target-selection" data-testid="target-selection" role="group" aria-label="Select a target">
    <span class="rd-target-prompt">Select a target <span class="rd-target-count">(${targets.length} available)</span></span>
    <div class="rd-target-buttons">${targetButtons}</div>
  </div>`;
}

/**
 * Render the confirmation section with action preview and confirm/cancel buttons.
 */
function renderConfirmation(action, opts) {
  const previewText = action.preview?.summary ?? action.preview?.text ?? '';
  const costsText = action.costs?.length > 0
    ? action.costs.map(c => c.label ?? c.type ?? '').join(', ') : '';
  const summary = action.displayLabel;

  return `<div class="rd-confirm" data-testid="action-confirm">
    <div class="rd-confirm-summary" data-testid="confirm-summary">${esc(summary)}</div>
    ${previewText ? `<div class="rd-confirm-preview" data-testid="confirm-preview">${esc(previewText)}</div>` : ''}
    ${costsText ? `<div class="rd-confirm-costs" data-testid="confirm-costs">Costs: ${esc(costsText)}</div>` : ''}
    <div class="rd-confirm-buttons">
      <button class="rd-confirm-btn" data-testid="confirm-action" data-action-id="${esc(action.actionId)}" aria-label="Confirm: ${esc(action.displayLabel)}">Confirm</button>
      <button class="rd-cancel-btn" data-testid="cancel-action" aria-label="Cancel selection">Cancel</button>
    </div>
  </div>`;
}

// ── Terminal/Error/KeyboardHelp extracted to ranked-duel-terminal.mjs ──

/**
 * Render the v0.17.0 priority banner — answers:
 * Who may act? What window? What is waiting? What if pass?
 * Uses priorityBannerText and windowTypeLabel from authority/priority-projection.
 */
function renderPriorityBanner(snapshot, priorityContext, immediate, _options) {
  if (!snapshot || !snapshot.decision) return '';
  const decision = snapshot.decision;
  const isHuman = decision?.isHuman ?? false;
  const match = snapshot.match ?? {};
  const phaseLabel = match.phase ? formatPhase(match.phase) : '';
  const turnLabel = match.fullTurnSequence != null ? `Turn ${match.fullTurnSequence + 1}` : '';
  const activeLabel = match.activePlayerId ? (match.activePlayerId === snapshot.human?.playerId ? 'Your turn' : 'Opponent\'s turn') : '';
  const kindLabel = decisionKindLabel(decision?.kind ?? 'UNKNOWN');

  // v0.17.0: Priority banner text from authority
  const bannerText = priorityBannerText(priorityContext, snapshot.opponent?.displayName ?? 'Opponent');
  const windowLabel = priorityContext ? windowTypeLabel(priorityContext.windowType) : '';
  const stackDepth = priorityContext?.stackDepth ?? 0;

  // v0.17.0: Priority timeline (optional, collapsible)
  const timeline = priorityContext ? priorityTimeline(priorityContext) : [];
  const timelineHtml = timeline.length > 0 ? `<details class="priority-timeline">
    <summary>Priority timeline</summary>
    <ol class="timeline-steps">${timeline.map(s => `<li class="timeline-step ${s.active ? 'active' : ''} ${s.done ? 'done' : ''}">${esc(s.label)}</li>`).join('')}</ol>
  </details>` : '';

  return `<div class="tcg-priority-banner decision-banner ${isHuman ? 'human' : 'ai'}" data-testid="decision-banner" role="status" aria-live="polite">
    <div class="decision-banner-main">
      <span class="decision-kind" data-testid="decision-kind">${esc(kindLabel)}</span>
      <span class="decision-window" data-testid="decision-window">${esc(windowLabel)}</span>
      <span class="decision-phase">${esc(phaseLabel)} · ${esc(turnLabel)} · ${esc(activeLabel)}</span>
      ${stackDepth > 0 ? `<span class="decision-stack-depth" data-testid="stack-depth">Stack depth: ${stackDepth}</span>` : ''}
    </div>
    <div class="decision-explainer" data-testid="decision-explainer">${esc(bannerText)}</div>
    ${immediate?.passInfo ? `<div class="decision-pass-info" data-testid="pass-info">${esc(immediate.passInfo)}</div>` : ''}
    ${renderWhyCanIAct(decision, snapshot, priorityContext)}
    ${timelineHtml}
  </div>`;
}

/**
 * Render the "Why can I act?" explainer (v0.17.0 port).
 */
function renderWhyCanIAct(decision, snapshot, priorityContext) {
  if (!decision) return '';
  const pv = snapshot.playerView;
  const stackTop = pv?.stack?.[pv.stack.length - 1] ?? null;
  const parts = [];
  parts.push(`<dt>Actor</dt><dd>${esc(decision.actorId === snapshot.human?.playerId ? 'You' : 'Opponent')}</dd>`);
  parts.push(`<dt>Phase</dt><dd>${esc(formatPhase(pv?.phase ?? ''))}</dd>`);
  parts.push(`<dt>Kind</dt><dd>${esc(decision.kind)}</dd>`);
  if (priorityContext) {
    parts.push(`<dt>Window</dt><dd>${esc(windowTypeLabel(priorityContext.windowType))}</dd>`);
    parts.push(`<dt>Can pass</dt><dd>${priorityContext.canPass ? 'Yes' : 'No'}</dd>`);
  }
  if (stackTop) {
    parts.push(`<dt>Stack top</dt><dd>${esc(stackTop.kind ?? 'unknown')} (${esc(stackTop.status ?? 'pending')})</dd>`);
  }
  const responseFamilies = (decision.legalActions ?? []).filter(a => a.isResponse).map(a => a.family);
  if (responseFamilies.length > 0) {
    parts.push(`<dt>Response options</dt><dd>${[...new Set(responseFamilies)].map(esc).join(', ')}</dd>`);
  }

  return `<details class="why-can-i-act">
    <summary>Why can I act?</summary>
    <dl>${parts.join('')}</dl>
  </details>`;
}

/**
 * Render the v3 Inspector Drawer — slide-in overlay from right edge.
 * Uses actionsForCard from authority/legal-action-adapter.
 *
 * v0.20.0: The inspector now renders the authoritative Card Face for the
 * inspected card using all three Card Face Renderer views as appropriate:
 *   - board (default): compact face with ability tiles + state strip
 *   - lite: full reference view with ability summaries
 *   - advanced: opened on demand via the "Advanced Rules" button, which
 *               surfaces the #advanced-card-rules-dialog codex view.
 * The board and lite faces are toggled in-drawer; the Advanced Card Rules
 * View is a modal dialog because its dossier layout needs the full viewport.
 */
/**
 * Render the inline "Essentials" card summary for the inspector sidebar.
 * Replaces the old Board/Lite card-face-renderer gfx with a clean,
 * compact, inline summary: identity, values, badges, runtime state,
 * and all ability summaries with timing + restrictions.
 *
 * @param {object} card — view-model card from the card registry
 * @param {object} runtimeState — derived from statusMarkers
 * @returns {string}
 */
/**
 * Map an ability timing label to a CSS class for color-coding.
 */
function timingClass(timing) {
  const t = String(timing ?? '').toLowerCase();
  if (t.includes('super')) return 'super';
  if (t.includes('instant') || t.includes('interrupt')) return 'instant';
  if (t.includes('quick')) return 'quick';
  if (t.includes('scoring')) return 'scoring';
  if (t.includes('anchor') || t.includes('attachment')) return 'anchor';
  if (t.includes('passive')) return 'passive';
  if (t.includes('action')) return 'action';
  return 'effect';
}

function renderInspectorEssentials(card, runtimeState) {
  const identity = card.identity;
  if (!identity) {
    return `<div class="inspector-essentials-fallback">
      <span class="inspector-essentials-identity">${esc(card.identity ?? 'unknown')}</span>
      <span class="inspector-essentials-points">${card.pointValue ?? 0} points</span>
    </div>`;
  }
  const def = getCardDefinition(identity);
  if (!def) return '';
  const suit = getSuit(def.suit);

  // Resolve card art for the header banner
  let artPath = def.art;
  let artPos = 'center 20%';
  try {
    artPath = getCardArtBoardPath(identity);
    artPos = getCardArtBoardPosition(identity);
  } catch { /* keep def.art */ }

  // Runtime state chips
  const stateChips = [];
  if (runtimeState.tapped) stateChips.push({ icon: '↻', label: 'Tapped', cls: 'tapped' });
  if (runtimeState.aegis) stateChips.push({ icon: '⬡', label: 'Aegis', cls: 'aegis' });
  if (runtimeState.providesGuard) stateChips.push({ icon: '◒', label: 'Guard', cls: 'guard' });
  if (runtimeState.exileBound) stateChips.push({ icon: '⊘', label: 'Exile-Bound', cls: 'exile-bound' });
  if (runtimeState.jackHostId) stateChips.push({ icon: '⛓', label: 'Attached', cls: 'attached' });

  // Ability tiles — with timing-based accent colors
  const abilityTiles = (def.abilities ?? []).map(a => {
    const tcls = timingClass(a.timing);
    const restrictions = (a.restrictions?.length)
      ? `<div class="inspector-essentials-restrictions" aria-label="${a.restrictions.length} restrictions">${a.restrictions.map(() => '<i></i>').join('')}</div>`
      : '';
    return `<article class="inspector-essentials-ability inspector-essentials-timing-${tcls}" data-ability-id="${esc(a.id)}">
      <div class="inspector-essentials-ability-glow"></div>
      <span class="inspector-essentials-ability-icon" aria-hidden="true">${esc(a.icon ?? '◆')}</span>
      <div class="inspector-essentials-ability-body">
        <div class="inspector-essentials-ability-head">
          <h5>${esc(a.title)}</h5>
          ${a.timing ? `<span class="inspector-essentials-ability-timing">${esc(a.timing)}</span>` : ''}
        </div>
        <p>${esc(a.summary ?? '')}</p>
      </div>
      ${restrictions}
    </article>`;
  }).join('');

  // Value display
  const values = [
    { label: 'Points', value: def.prValue ?? 0, cls: 'pr' },
  ];
  if (def.erValue !== null && def.erValue !== undefined) {
    values.push({ label: 'ER', value: def.erValue, cls: 'er' });
  }

  return `<div class="inspector-essentials tcg-suit-${suit.id}" data-testid="inspector-essentials" style="--card-accent:${suit.accent};--card-accent-2:${suit.accent2}">
    <div class="inspector-essentials-banner" role="img" aria-label="${esc(identity)} card art" style="background-image:url('${esc(artPath ?? '')}');background-position:${esc(artPos)}">
      <div class="inspector-essentials-banner-overlay"></div>
      <div class="inspector-essentials-banner-content">
        <span class="inspector-essentials-rank">${esc(def.rank)}${def.suit ? `<span class="inspector-essentials-suit" aria-hidden="true">${esc(def.suit)}</span>` : ''}</span>
      </div>
    </div>
    <div class="inspector-essentials-values-row">
      ${values.map(v => `<span class="inspector-essentials-value inspector-essentials-value-${v.cls}"><small>${v.label}</small><b>${esc(v.value)}</b></span>`).join('')}
    </div>
    ${(def.badges?.length) ? `<div class="inspector-essentials-badges">${def.badges.map(b => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
    ${stateChips.length ? `<div class="inspector-essentials-state" aria-label="Current card state">${stateChips.map(c => `<span class="inspector-essentials-state-chip inspector-essentials-state-${c.cls}"><b aria-hidden="true">${esc(c.icon)}</b>${esc(c.label)}</span>`).join('')}</div>` : ''}
    <section class="inspector-essentials-abilities" aria-label="Card abilities">
      ${abilityTiles || '<p class="inspector-essentials-no-abilities">Detailed rules pending.</p>'}
    </section>
    <p class="inspector-essentials-motto">${esc(def.motto ?? '')}</p>
  </div>`;
}

function renderInspector(cardId, cardRegistry, contracts, guidanceMode, _faceView = 'board') {
  const card = cardRegistry?.[cardId];
  if (!card) return '';
  const identity = card.identity ?? null;
  const cardActions = actionsForCard(contracts, cardId);
  const hasLegalActions = cardActions.length > 0;

  const actionList = cardActions.map(a => {
    const why = buildWhyExplanation(a, cardRegistry, guidanceMode);
    return `<li class="inspector-action" data-action-id="${esc(a.optionId)}">
      <span class="inspector-action-label">${esc(a.displayLabel)}</span>
      ${why?.timing ? `<span class="inspector-action-timing">${esc(why.timing)}</span>` : ''}
    </li>`;
  }).join('');

  const unavailableExplanation = !hasLegalActions
    ? buildUnavailableExplanation('SOURCE_NOT_AVAILABLE', guidanceMode)
    : null;

  // Render the inline Essentials summary (replaces old Board/Lite card-face gfx).
  const essentialsHtml = renderInspectorEssentials(card, cardRuntimeState(card));

  return `<aside class="card-inspector" data-testid="card-inspector" role="region" aria-label="Card inspector: ${esc(identity ?? 'unknown')}">
    <div class="inspector-face-toolbar" role="tablist" aria-label="Card inspector view">
      <span class="inspector-face-tab active" role="tab" aria-selected="true">Essentials</span>
      <button class="inspector-face-tab advanced-rules" data-inspector-advanced-rules="${esc(identity ?? '')}" data-card-id="${esc(cardId)}" role="button" aria-label="Open advanced card rules" ${identity ? '' : 'disabled'}>Advanced Rules</button>
    </div>
    <div class="inspector-face-stage" data-inspector-face-view="essentials">${essentialsHtml}</div>
    <div class="inspector-actions">
      <h4>Legal actions for this card</h4>
      ${hasLegalActions ? `<ul class="inspector-action-list">${actionList}</ul>` : '<p class="inspector-no-actions">No legal actions for this card right now.</p>'}
      ${unavailableExplanation ? `<p class="inspector-unavailable-reason">${esc(unavailableExplanation.shortText)}</p>` : ''}
    </div>
    <button class="inspector-close" data-testid="inspector-close" aria-label="Close inspector">Close</button>
  </aside>`;
}

/**
 * Render the v0.17.0 confirmation section with action preview.
 * Uses buildWhyExplanation from intelligence/action-explanation.
 */
function renderConfirmationV17(contract, options, guidanceMode) {
  const why = buildWhyExplanation(contract, null, guidanceMode);
  const previewText = why?.preview ?? '';
  const costsText = why?.costs?.join('; ') ?? '';
  const targetsText = why?.targets ?? '';

  return `<div class="action-confirm" data-testid="action-confirm">
    <div class="confirm-summary" data-testid="confirm-summary">${esc(contract.displayLabel)}</div>
    ${previewText ? `<div class="confirm-preview" data-testid="confirm-preview">${esc(previewText)}</div>` : ''}
    ${costsText ? `<div class="confirm-costs" data-testid="confirm-costs">Costs: ${esc(costsText)}</div>` : ''}
    ${targetsText ? `<div class="confirm-targets" data-testid="confirm-targets">${esc(targetsText)}</div>` : ''}
    <div class="confirm-buttons">
      <button class="confirm-button" data-testid="confirm-action" data-action-id="${esc(contract.optionId)}" aria-label="Confirm: ${esc(contract.displayLabel)}">Confirm</button>
      <button class="cancel-button" data-testid="cancel-action" aria-label="Cancel selection">Cancel</button>
    </div>
  </div>`;
}

/**
 * Render the event log (compact, recent events only).
 * Uses buildEventLog from orchestration/resolution-flow.
 */
function renderEventLog(events) {
  if (!events || events.length === 0) {
    return `<div class="event-log-empty" data-testid="event-log">No recent events.</div>`;
  }
  // v0.17.0: Use structured event log from resolution-flow
  const log = buildEventLog(events, null);
  const recent = [...log].reverse().slice(0, 8);
  return `<div class="event-log-content" data-testid="event-log" role="log" aria-label="Recent events">
    ${recent.map(e => `<div class="event-entry" data-event-type="${esc(e.type)}">
      <span class="event-index">${e.index}.</span>
      <span class="event-description">${esc(e.description)}</span>
    </div>`).join('')}
  </div>`;
}

/**
 * Render the action dock grouped by timing (v0.17.0 port).
 * Uses groupActionsByTiming from authority/legal-action-adapter.
 * Includes super-badge and spades-badge patterns.
 */
function renderActionDock(snapshot, options, contracts, priorityContext, guidanceMode) {
  const decision = snapshot?.decision;
  const isHuman = decision?.isHuman ?? false;
  if (!isHuman) {
    return `<div class="tcg-action-dock action-dock" aria-label="Actions" data-testid="action-dock">
      <div class="action-dock-waiting">
        <div class="ai-thinking-indicator"><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span></div>
        <span class="waiting-text">AI is thinking...</span>
      </div>
    </div>`;
  }
  const legalActions = decision?.legalActions ?? [];
  if (legalActions.length === 0) {
    return `<div class="tcg-action-dock action-dock" aria-label="Actions" data-testid="action-dock">
      <div class="action-dock-empty">No legal actions available.</div>
    </div>`;
  }
  const groups = groupActionsByTiming(contracts);
  const groupOrder = ['primary', 'quick', 'interrupt', 'response', 'score', 'pass', 'system'];
  const groupLabels = { primary: 'Primary', quick: 'Quick', interrupt: 'Interrupt', response: 'Response', score: 'Score', pass: 'Pass', system: 'System' };
  const groupIcons = { primary: '◆', quick: '⚡', interrupt: '✦', response: '↩', score: '★', pass: '⊘', system: '⚙' };

  const groupsHtml = groupOrder.map(key => {
    const groupActions = groups[key] ?? [];
    if (groupActions.length === 0) return '';
    return `<div class="action-group" data-testid="action-group-${esc(key)}">
      <span class="action-group-label"><span class="action-group-icon" aria-hidden="true">${groupIcons[key]}</span> ${esc(groupLabels[key])}</span>
      ${groupActions.map(a => {
        const cls = ['action-button'];
        if (a.optionId === options.selectedActionId) cls.push('selected');
        if (a.recommended) cls.push('recommended');
        if (a.eligible) cls.push('eligible');
        const timingBadge = a.timingClass && a.timingClass !== 'ACTION' && a.timingClass !== 'ORDINARY'
          ? `<span class="timing-badge">${esc(timingLabel(a.timingClass))}</span>` : '';
        const superBadge = a.isSuper ? '<span class="super-badge">SUPER</span>' : '';
        const spadesBadge = a.isSpadesVariant ? '<span class="spades-badge">♠</span>' : '';
        const costHint = a.costs?.length > 0
          ? `<span class="action-cost-hint">${a.costs.map(c => esc(c.label ?? c.type ?? '')).join(', ')}</span>` : '';
        return `<button class="${cls.join(' ')}" data-action-id="${esc(a.optionId)}" aria-label="${esc(a.displayLabel)}">
          <span class="action-button-label">${esc(a.displayLabel)}</span>
          ${timingBadge}${superBadge}${spadesBadge}${costHint}
        </button>`;
      }).join('')}
    </div>`;
  }).join('');

  return `<div class="tcg-action-dock action-dock" aria-label="Actions" data-testid="action-dock">
    <div class="action-dock-header">
      <span class="action-dock-title">Actions</span>
      <span class="action-dock-count">${legalActions.length}</span>
    </div>
    ${groupsHtml}
  </div>`;
}
// ── Format helpers, Play Hub, and New Match Setup extracted to ranked-duel-terminal.mjs and ranked-duel-hub.mjs ──
