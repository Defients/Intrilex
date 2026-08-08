// ═══════════════════════════════════════════════════════════════
// ranked-duel-renderer.mjs — v0.20.0 Ranked Duel shell renderer.
// Pure function: snapshot + options → HTML string.
// Uses ranked-duel-viewmodel.mjs for data, ranked-duel.css for style.
// Full replacement for play-renderer-v3.js — ports all v0.17.0 features.
// ═══════════════════════════════════════════════════════════════

import { buildRankedDuelViewModel, buildGroupedActions, buildIntentGroups, resolveConcreteAction } from './ranked-duel-viewmodel.mjs';
import { loadProfile } from './local-profile.mjs';
import { declarationSummary, decisionKindLabel, timingLabel } from './action-presenter.js';
import { derivePriorityContext, priorityBannerText, priorityTimeline, windowTypeLabel } from './authority/priority-projection.js';
import { buildLegalActionContract, groupActionsByTiming, actionsForCard } from './authority/legal-action-adapter.js';
import { buildImmediateExplanation, buildWhyExplanation, buildUnavailableExplanation, GuidanceMode } from './intelligence/action-explanation.js';
import { buildEventLog } from './orchestration/resolution-flow.js';
import { renderTcgCard, renderTcgCardBack, renderTcgCardPreview } from './play-card-component.js';
import { renderCardFace } from '../card-face-renderer.js';
import { getArchetypePersonality, getTerminalBanter } from './ai-personality.js';

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
    };
  }

  return {
    sessionId: controllerSnapshot.sessionId,
    humanPlayerId: humanId,
    status: controllerSnapshot.status,
    isAiDecision: controllerSnapshot.status === 'AI_DECISION',
    legalActions: controllerSnapshot.decision?.legalActions ?? [],
    chat: [],
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
    },
  };
}

/**
 * Render the full play board from a snapshot.
 * v0.20.0: Full replacement for play-renderer-v3.js renderBoard.
 * @param {object} snapshot — Authorized player snapshot from PlaySession
 * @param {object} options — { selectedActionId, selectedSourceCardId, selectedTargets, inspectorCardId, guidanceMode, showKeyboardHelp, tutorial, chatMessages, soundMuted }
 * @returns {string} HTML
 */
export function renderBoard(snapshot, options = {}) {
  if (!snapshot) return '<div class="play-error">No active session.</div>';
  return renderRankedDuel(snapshot, options);
}

/**
 * @param {object} snapshot — Authorized player snapshot from PlaySession
 * @param {object} options — { selectedActionId, selectedSourceCardId, selectedTargets, inspectorCardId, guidanceMode, showKeyboardHelp, tutorial, chatMessages, soundMuted }
 * @returns {string} HTML
 */
export function renderRankedDuel(snapshot, options = {}) {
  const profile = loadProfile();
  const adapted = adaptSnapshotForViewModel(snapshot);
  // Derive mode info from options (network match flag, tutorial, etc.)
  const modeInfo = options.isNetworkMatch
    ? { kind: 'NETWORK', label: 'ONLINE \u00b7 DIRECT DUEL', networkRanked: true }
    : options.isTutorial
      ? { kind: 'TUTORIAL', label: 'TUTORIAL \u00b7 FIRST CONTACT', networkRanked: false }
      : null; // null = default LOCAL_AI
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
      ${renderSwapBar(vm)}
    </section>
    <section class="rd-cell rd-stage" data-grid="stage" data-board="1" aria-label="Active stage">
      ${renderActiveStage(vm, opts, snapshot, priorityContext, immediate)}
    </section>
    <section class="rd-cell rd-stack" data-grid="stack" data-stack-depth="${vm.stack?.length ?? 0}" aria-label="Resolution stack">
      ${renderResolutionStack(vm)}
    </section>
    <section class="rd-cell rd-chat" data-grid="chat" aria-label="Match chat">
      ${renderChatPanel(vm, opts, isReadOnly, (opts.chatMessages || []).slice(-30))}
    </section>
    <section class="rd-cell rd-player-enduring" data-grid="playerE" aria-label="Your Enduring">
      ${renderEnduringRow(humER, 'human')}
    </section>
    <section class="rd-cell rd-player-points" data-grid="playerP" aria-label="Your Points">
      ${renderPointRow(humPR, 'Points', vm.human.secured, vm.human.goalLabel, 'human')}
    </section>
    <section class="rd-cell rd-gamelog" data-grid="gamelog" data-log-empty="${(snapshot?.recentEvents?.length ?? 0) === 0}" aria-label="Game log">
      <div class="rd-rail-section-header">GAME LOG</div>
      ${renderGameLog(snapshot?.recentEvents ?? [])}
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
    <section class="rd-cell rd-actions" data-grid="actions" aria-label="Contextual actions">
      ${renderActionBar(vm, opts, isHumanTurn, isAiTurn, isReadOnly, priorityContext, immediate)}
    </section>
    ${opts.inspectorCardId ? renderInspector(opts.inspectorCardId, cardRegistry, [], guidanceMode, opts.inspectorFaceView) : ''}
    ${opts.showKeyboardHelp ? renderKeyboardHelp() : ''}
    ${renderTutorialCoach(opts.tutorial)}
    <div id="card-hover-popover" class="card-hover-popover" data-testid="card-hover-popover" role="tooltip" aria-hidden="true"></div>
  </div>`;
}

// ── Header ─────────────────────────────────────────────────────

function renderHeader(vm, opts, priorityContext, immediate) {
  const turn = vm.match.fullTurnSequence;
  const phaseLabel = formatPhase(vm.match.phase);
  const isHumanTurn = vm.status === 'HUMAN_DECISION';
  const isAiTurn = vm.status === 'AI_DECISION';

  // Compact match-state center: turn · phase · priority owner
  const priorityOwner = vm.match.priorityOwnerId;
  const isHumanPriority = priorityOwner === vm.human.playerId;
  const ownerLabel = isHumanTurn
    ? 'Your action'
    : isAiTurn
      ? 'AI is choosing\u2026'
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

  return `<header class="rd-header" role="banner">
    <div class="rd-header-left">
      <a class="rd-header-back" href="#/play" aria-label="Back to Play hub" title="Back to Play hub">\u2190</a>
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
        <button class="rd-toolbar-btn" data-action="exit-match" title="Return to hub" aria-label="Exit match">\u2715</button>
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
      ${renderSwapBar(vm)}
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
  return `<div class="${cls}" data-pile="${dataPile}" aria-label="${label} pile, ${count} cards" role="button" tabindex="0">
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

  // AI thinking state
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
        const status = item.isResolving ? 'Resolving' : 'Pending';
        return `<div class="${cls}" style="--stack-idx:${i}">
          <div class="rd-stack-entry-num">${i + 1}</div>
          <div class="rd-stack-entry-body">
            <div class="rd-stack-entry-desc">${esc(item.description)}</div>
            <div class="rd-stack-entry-meta">${esc(actor)} \u00b7 ${status}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${priorityOwner ? `<div class="rd-stack-priority">PRIORITY: ${esc(priorityOwner)}</div>` : ''}
  </div>`;
}

// ── Contextual Actions (rendered in right rail, bottom section) ──

function renderActionBar(vm, opts, isHumanTurn, isAiTurn, isReadOnly, priorityContext, immediate) {
  const passAction = vm.actions.find(a => a.isPass);
  const passHtml = (passAction && !isReadOnly) ? `<button class="rd-action-pass" data-action-id="${esc(passAction.actionId)}" data-key="P">Pass</button>` : '';

  if (isAiTurn) {
    return `<div class="rd-contextual-actions ai-thinking" aria-label="Actions" role="region">
      <div class="rd-actions-header">ACTIONS</div>
      <div class="rd-action-status">${esc(vm.opponent.displayName)} is deciding\u2026</div>
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

  // Human turn with legal actions but no card selected yet — show a meaningful prompt
  if (isHumanTurn && !opts.selectedSourceCardId && !opts.selectedActionId && !opts.selectedIntentKey) {
    const legalCount = actions.filter(a => !a.isPass).length;
    const passBtn = passAction && !isReadOnly
      ? `<button class="rd-action-pass" data-action-id="${esc(passAction.actionId)}" data-key="P">End Action</button>`
      : '<button class="rd-action-pass disabled" disabled aria-disabled="true">End Action</button>';
    return `<div class="rd-contextual-actions awaiting-selection" aria-label="Actions" role="region" data-testid="action-rail">
      <div class="rd-actions-header">YOUR ACTION</div>
      <div class="rd-action-prompt">${legalCount > 0
        ? `${legalCount} legal action${legalCount > 1 ? 's' : ''} available.`
        : 'No legal actions.'}</div>
      <div class="rd-action-hint">Select a card from your hand.</div>
      <div class="rd-action-footer">${passBtn}</div>
    </div>`;
  }

  // Build intent groups
  const intents = buildIntentGroups(actions);
  const selectedSourceCardId = opts.selectedSourceCardId;
  const selectedActionId = opts.selectedActionId;
  const selectedIntentKey = opts.selectedIntentKey ?? null;
  const selectedIntent = selectedIntentKey
    ? intents.find(i => i.intentKey === selectedIntentKey)
    : intents.find(i => i.actions.some(a => a.actionId === selectedActionId));

  const { groups, groupOrder } = buildGroupedActions(actions);
  const timingByIntent = new Map();
  for (const [timingKey, groupActions] of Object.entries(groups)) {
    for (const a of groupActions) {
      const key = `${a.family}|${a.mode ?? ''}`;
      timingByIntent.set(key, timingKey);
    }
  }

  // Filter out system group — these are setup/phase controls, not player actions
  const playerGroupOrder = groupOrder.filter(g => g !== 'system');

  const groupLabels = {
    primary: 'Primary', quick: 'Quick', interrupt: 'Interrupt',
    response: 'Response', score: 'Score', pass: 'Pass', system: 'System',
  };
  const groupIcons = {
    primary: '\u25C6', quick: '\u26A1', interrupt: '\u2726', response: '\u21A9',
    score: '\u2605', pass: '\u2298', system: '\u2699',
  };

  const groupsHtml = playerGroupOrder.map(key => {
    const groupIntents = intents.filter(i => timingByIntent.get(i.intentKey) === key);
    if (groupIntents.length === 0) return '';

    const buttons = groupIntents.map(intent => {
      const cls = ['rd-intent-btn'];
      if (intent.isPass) cls.push('pass');
      const isSelected = selectedIntent && selectedIntent.intentKey === intent.intentKey;
      if (isSelected) cls.push('selected');
      const hasSources = intent.sourceCardIds.length > 0;
      const sourceMatches = hasSources && selectedSourceCardId && intent.sourceCardIds.includes(selectedSourceCardId);
      if (sourceMatches || !hasSources || !selectedSourceCardId) cls.push('available');
      else cls.push('dimmed');
      const disabledAttr = (sourceMatches || !hasSources || !selectedSourceCardId) ? '' : 'disabled';

      const timingBadge = intent.timingClass && intent.timingClass !== 'ACTION' && intent.timingClass !== 'ORDINARY'
        ? `<span class="rd-timing-badge">${esc(timingLabel(intent.timingClass))}</span>` : '';
      const superBadge = intent.isSuper ? '<span class="rd-super-badge">SUPER</span>' : '';
      const spadesBadge = intent.isSpadesVariant ? '<span class="rd-spades-badge">\u2660</span>' : '';
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

  // Source/target/confirm sections
  let sourceSection = '';
  let targetSection = '';
  let confirmSection = '';

  if (selectedIntent && !selectedActionId) {
    sourceSection = renderSourceSelection(selectedIntent, opts, vm);
  } else if (selectedActionId) {
    const selectedAction = actions.find(a => a.actionId === selectedActionId);
    if (selectedAction) {
      if (selectedAction.targets?.required && !(opts.selectedTargets?.length > 0)) {
        targetSection = renderTargetSelection(selectedAction, opts);
      } else {
        confirmSection = renderConfirmation(selectedAction, opts);
      }
    }
  }

  // Response window indicator
  const isResponseWindow = priorityContext?.windowType === 'response' || priorityContext?.windowType === 'interrupt';
  const responseIndicator = isResponseWindow && immediate?.passInfo
    ? `<div class="rd-response-hint" data-testid="pass-info">${esc(immediate.passInfo)}</div>`
    : '';

  // Priority indicator
  const priorityOwner = vm.match.priorityOwnerId === vm.human.playerId ? 'You' :
    (vm.match.priorityOwnerId === vm.opponent.playerId ? vm.opponent.displayName : '');
  const priorityIndicator = priorityOwner ? `<div class="rd-action-priority">\u25CF Priority: ${esc(priorityOwner)}</div>` : '';

  return `<div class="rd-contextual-actions" aria-label="Actions" role="region" data-testid="action-rail">
    <div class="rd-actions-header">ACTIONS</div>
    ${responseIndicator}
    <div class="rd-action-groups">
      ${groupsHtml}
    </div>
    ${sourceSection}
    ${targetSection}
    ${confirmSection}
    <div class="rd-action-footer">
      ${passHtml}
    </div>
    ${priorityIndicator}
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

function renderChatPanel(vm, opts, isReadOnly, chatMessages) {
  const modeLabel = vm.mode?.label ?? 'LOCAL VS AI';
  const messages = chatMessages.map(m => {
    const cls = m.isHuman ? 'rd-chat-msg human' : (m.isSystem ? 'rd-chat-msg system' : 'rd-chat-msg ai');
    const author = m.isHuman ? vm.human.displayName : (m.isSystem ? 'System' : vm.opponent.displayName);
    return `<div class="${cls}">
      <div class="rd-chat-author">${esc(author)}</div>
      <div class="rd-chat-text">${esc(m.text)}</div>
    </div>`;
  }).join('');

  const inputHtml = isReadOnly ? '' : `<form class="rd-chat-input" data-testid="match-chat-form">
    <input type="text" placeholder="Message..." data-chat-input maxlength="200" aria-label="Chat message" data-testid="match-chat-input">
    <button type="button" class="rd-chat-emote-btn" data-action="chat-emote" aria-label="Emotes" data-testid="chat-emote-btn" title="Emotes">\u263A</button>
    <button type="submit" data-action="chat-send" aria-label="Send">\u27A4</button>
  </form>`;

  const hasMessages = chatMessages.length > 0;
  return `<div class="rd-chat-panel" data-chat-empty="${!hasMessages}">
    <div class="rd-chat-header">
      <span class="rd-chat-title">MATCH CHAT</span>
      <span class="rd-chat-mode">${esc(modeLabel)} \u00b7 LIVE</span>
    </div>
    <div class="rd-chat-messages" data-testid="match-chat-messages">
      ${messages || '<div class="rd-chat-empty">No messages yet</div>'}
    </div>
    ${inputHtml}
  </div>`;
}

// ── Game Log (player-readable, no engine diagnostics) ──────────

function renderGameLog(events) {
  if (!events || events.length === 0) {
    return `<div class="rd-game-log" data-testid="event-log" role="log">
      <div class="rd-game-log-empty">No events yet</div>
    </div>`;
  }
  const log = buildEventLog(events, null);
  // Filter out developer diagnostics — only show player-readable gameplay events
  const playerReadable = log.filter(e => {
    const desc = e.description ?? e.text ?? '';
    const type = e.type ?? '';
    // Hide phase transitions, core/snapshot/voltage diagnostics, and unknown fallbacks
    if (type.includes('PHASE') && desc.includes('unknown')) return false;
    if (type.includes('CORE') || type.includes('SNAPSHOT') || type.includes('VOLTAGE')) return false;
    if (type.includes('INIT') || type.includes('PREPARE') || type.includes('PREPARED')) return false;
    if (desc.includes('core start') || desc.includes('snapshot captured') || desc.includes('voltage snapshot')) return false;
    if (desc.includes('core initialized') || desc.includes('core prepared')) return false;
    // Hide generic fallbacks that are just lowercased type names
    if (desc === `${type.replace(/_/g, ' ').toLowerCase()}.`) return false;
    return true;
  });
  const recent = [...playerReadable].reverse().slice(0, 40);
  if (recent.length === 0) {
    return `<div class="rd-game-log" data-testid="event-log" role="log">
      <div class="rd-game-log-empty">No events yet</div>
    </div>`;
  }
  return `<div class="rd-game-log" data-testid="event-log" role="log">
    ${recent.map(e => `<div class="rd-log-entry">
      <span class="event-description">${esc(e.description ?? e.text ?? '')}</span>
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
  return `<div class="rd-pile" data-pile="${dataPile}" title="${label} (${count})">
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
    ${renderSwapBar(vm)}
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
  return `<div class="rd-player-plate ${side}">
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
  const ratingHtml = plate.rating
    ? `<span class="rd-plate-rating">${plate.rating.value}${plate.rating.provisional ? '?' : ''}</span>`
    : (plate.aiRating ? `<span class="rd-plate-rating">AI ${plate.aiRating}</span>` : '');
  const isActive = vm.match.activePlayerId === plate.playerId;
  const sideLabel = side === 'opponent' ? (plate.isHuman ? 'Human' : 'AI Opponent') : 'You';

  // v0.25: Prestige banner is identity-only (name, rating, badges, cosmetics).
  // Score has been moved to the dedicated Score Rail between Game Log and Active Stage.
  // Banner background placeholder can later hold custom prestige images.
  const bannerHtml = `<div class="rd-prestige-banner rd-prestige-banner-${side}" data-testid="profile-banner-${side}" aria-label="${side === 'opponent' ? 'Opponent' : 'Player'} prestige banner">
    <div class="rd-prestige-banner-bg" aria-hidden="true"></div>
    <div class="rd-prestige-banner-scrim" aria-hidden="true"></div>
    <div class="rd-prestige-banner-content">
      <span class="rd-prestige-banner-name">${esc(plate.displayName)}</span>
      <span class="rd-prestige-banner-meta">${esc(sideLabel)} ${ratingHtml} ${badgeHtml}</span>
    </div>
  </div>`;

  // Compact identity row (avatar + active indicator) — sits outside the banner
  const identityHtml = `<div class="rd-profile-identity">
    <div class="rd-profile-avatar ${side} ${isActive ? 'active' : ''}">${esc(plate.monogram)}</div>
  </div>`;

  // Opponent: banner on top, avatar at bottom; Player: avatar on top, banner at bottom
  const inner = side === 'opponent'
    ? `${bannerHtml}${identityHtml}`
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
  if (card.legalSource || (handOpts.selectedSourceCardId && card.entityId === handOpts.selectedSourceCardId)) classes.push('selected');
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
  // (the Board appearance); on hover for 0.25s a Lite popover appears.
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

function renderSwapBar(vm) {
  const { swap } = vm.zones;
  const rawSlots = swap && swap.length ? swap : [null, null, null];
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
      return `<div class="rd-swap-slot has-card" data-swap-index="${i}" aria-label="Swap slot ${i+1}: ${esc(s.card.identity ?? 'card')}">
        ${cardHtml}
      </div>`;
    }
    if (s && s.faceDown) {
      // Face-down card in swap — show card back, not empty
      return `<div class="rd-swap-slot face-down" data-swap-index="${i}" aria-label="Swap slot ${i+1}: face down" aria-hidden="true">
        ${renderTcgCardBack()}
      </div>`;
    }
    return `<div class="rd-swap-slot empty" data-swap-index="${i}" aria-hidden="true"></div>`;
  }).join('');
  return `<div class="rd-swap-bar" aria-label="Swap bar">
    <span class="rd-swap-label">SWAP</span>
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

// ── Terminal ───────────────────────────────────────────────────

function renderTerminal(vm, opts) {
  const outcome = vm.match.terminationReason?.includes('VICTORY')
    ? (vm.human.secured >= vm.human.goal ? 'win' : 'loss')
    : 'draw';
  const outcomeLabel = outcome === 'win' ? 'VICTORY' : outcome === 'loss' ? 'DEFEAT' : 'DRAW';
  const resultIcon = outcome === 'win' ? '🏆' : outcome === 'loss' ? '💀' : '🤝';

  // v0.19.0: AI banter on terminal
  const archetype = vm.opponent?.archetype ?? '';
  const banter = getTerminalBanter(archetype, outcome === 'loss');

  return `<div class="play-terminal ${outcome}" data-testid="play-terminal">
    <div class="terminal-result-banner ${outcome}">
      <span class="terminal-result-icon" aria-hidden="true">${resultIcon}</span>
      <h2>Match Complete</h2>
      <p class="terminal-result" data-testid="terminal-result">${outcomeLabel === 'VICTORY' ? 'You won!' : outcomeLabel === 'DEFEAT' ? 'You lost.' : 'Draw.'}</p>
      <p class="terminal-banter" data-testid="terminal-banter">${esc(banter)}</p>
    </div>
    <dl class="terminal-details">
      <dt>Winner</dt><dd data-testid="terminal-winner">${esc(outcome === 'win' ? 'You' : outcome === 'loss' ? 'AI' : 'Draw')}</dd>
      <dt>Termination</dt><dd>${esc(formatTerminationReason(vm.match.terminationReason || 'UNKNOWN'))}</dd>
      <dt>Full Turns</dt><dd>${vm.match.fullTurnSequence ?? 0}</dd>
    </dl>
    <div class="terminal-actions">
      <button class="primary-button" data-testid="watch-replay" data-action="watch-replay">Watch replay</button>
      ${opts.isNetworkMatch ? '<button class="secondary-button" data-testid="download-replay" data-action="download-replay">Download certified replay</button>' : ''}
      ${opts.isNetworkMatch ? '' : '<button class="secondary-button" data-testid="rematch-same-seed" data-action="rematch">Rematch same seed</button>'}
      ${opts.isNetworkMatch ? '' : '<button class="secondary-button" data-testid="new-seed" data-action="new-seed">New seed</button>'}
      <a class="secondary-button" data-testid="open-rank-anatomy" href="#/ranks">Open Rank Anatomy</a>
      <a class="secondary-button" data-testid="open-history" href="#/history">Open History</a>
      <button class="secondary-button" data-testid="return-to-hub" data-action="return-to-hub">Return to Play hub</button>
    </div>
  </div>`;
}

// ── Error ──────────────────────────────────────────────────────

function renderError(vm, opts) {
  return `<div class="play-error" data-testid="play-error" role="alert">
    <h2>Session Error</h2>
    <p>${esc(vm.error?.reason || vm.error || 'Unknown error')}</p>
    <button class="secondary-button" data-action="return-to-hub">Return to Play hub</button>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// v0.17.0 Feature Ports — priority banner, action dock, inspector,
// event log, keyboard help, tutorial coach, confirmation V17
// ═══════════════════════════════════════════════════════════════

/**
 * Render keyboard help overlay (v0.17.0 port).
 */
function renderKeyboardHelp() {
  return `<div class="keyboard-help-overlay" data-testid="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
    <h3>Keyboard Shortcuts</h3>
    <dl class="keyboard-help-list">
      <dt><kbd>P</kbd></dt><dd>Pass priority / Decline response</dd>
      <dt><kbd>I</kbd></dt><dd>Open card inspector for selected card</dd>
      <dt><kbd>R</kbd></dt><dd>Toggle stack details</dd>
      <dt><kbd>?</kbd></dt><dd>Toggle this help</dd>
      <dt><kbd>Esc</kbd></dt><dd>Cancel selection or close inspector</dd>
      <dt><kbd>Enter</kbd></dt><dd>Confirm selected action</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="keyboard-help-close" aria-label="Close keyboard help">Close</button>
  </div>`;
}

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
 *   - zoom: opened on demand via the "View full dossier" button, which
 *           surfaces the existing #card-face-dialog with the zoom view.
 * The board and lite faces are toggled in-drawer; zoom is a modal dialog
 * because its dossier layout needs the full viewport width.
 */
function renderInspector(cardId, cardRegistry, contracts, guidanceMode, faceView = 'board') {
  const card = cardRegistry?.[cardId];
  if (!card) return '';
  const identity = card.identity ?? null;
  const cardActions = actionsForCard(contracts, cardId);
  const hasLegalActions = cardActions.length > 0;
  // Normalize the face view; 'full' is the zoom alias used by the dialog.
  const view = faceView === 'lite' ? 'lite' : 'board';

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

  // Render the authoritative Card Face (board or lite). The renderer is
  // defensive: if the identity is unknown it falls back to a generic card
  // definition, so we only skip when there is no identity at all.
  const faceHtml = identity
    ? renderCardFace(identity, { view, runtimeState: cardRuntimeState(card) })
    : `<div class="inspector-card-face"><span class="inspector-card-identity">${esc(card.identity ?? 'unknown')}</span><span class="inspector-card-points">${card.pointValue ?? 0} points</span></div>`;

  return `<aside class="card-inspector" data-testid="card-inspector" role="region" aria-label="Card inspector: ${esc(identity ?? 'unknown')}">
    <div class="inspector-face-toolbar" role="tablist" aria-label="Card face view">
      <button class="inspector-face-tab ${view === 'board' ? 'active' : ''}" data-inspector-face="board" role="tab" aria-selected="${view === 'board'}">Board</button>
      <button class="inspector-face-tab ${view === 'lite' ? 'active' : ''}" data-inspector-face="lite" role="tab" aria-selected="${view === 'lite'}">Lite</button>
      <button class="inspector-face-tab dossier" data-inspector-dossier="${esc(identity ?? '')}" role="button" aria-label="Open full dossier" ${identity ? '' : 'disabled'}>Full dossier</button>
    </div>
    <div class="inspector-face-stage" data-inspector-face-view="${view}">${faceHtml}</div>
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
 * Render the tutorial coach overlay (v0.17.0 port).
 */
function renderTutorialCoach(tutorial) {
  if (!tutorial || tutorial.isComplete || tutorial.skipped) return '';
  const chapter = tutorial.currentChapter;
  if (!chapter) return '';
  return `<div class="tutorial-coach" data-testid="tutorial-coach" role="region" aria-label="Tutorial: ${esc(chapter.title)}">
    <div class="tutorial-coach-header">
      <span class="tutorial-chapter-title">${esc(chapter.title)}</span>
      <span class="tutorial-progress">${tutorial.completedChapters.size}/${tutorial.chapterCount}</span>
    </div>
    <p class="tutorial-text">${esc(chapter.text)}</p>
    <div class="tutorial-controls">
      ${chapter.completion?.type === 'acknowledge' ? `<button class="tutorial-acknowledge" data-testid="tutorial-acknowledge">Got it</button>` : ''}
      <button class="tutorial-skip" data-testid="tutorial-skip">Skip tutorial</button>
    </div>
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

// ── Format helpers ─────────────────────────────────────────────

function formatPhase(phase) {
  if (!phase) return '';
  return String(phase).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatTerminationReason(reason) {
  if (!reason) return 'Unknown';
  return String(reason).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════
// Play Hub and New Match Setup (v3 port — full replacement)
// ═══════════════════════════════════════════════════════════════

/**
 * Render the Play hub (entry point for #/play).
 */
export function renderPlayHub(continueSave, options = {}) {
  const idbAvailable = options.idbAvailable !== false;
  const stats = options.playerStats ?? null;
  const hasStats = stats && stats.totalMatches > 0;

  // Stats dashboard
  const statsDashboard = hasStats ? `<div class="play-hub-stats" data-testid="play-hub-stats">
    <h2>Your Record</h2>
    <div class="stats-summary-row">
      <span class="stat-item"><span class="stat-value">${stats.wins ?? 0}</span><span class="stat-label">Wins</span></span>
      <span class="stat-item"><span class="stat-value">${stats.losses ?? 0}</span><span class="stat-label">Losses</span></span>
      <span class="stat-item"><span class="stat-value">${stats.draws ?? 0}</span><span class="stat-label">Draws</span></span>
      <span class="stat-item"><span class="stat-value">${stats.totalMatches ?? 0}</span><span class="stat-label">Total</span></span>
    </div>
    ${stats.difficultyBreakdown && Object.keys(stats.difficultyBreakdown).length > 0 ? `<div class="stats-difficulty-breakdown" data-testid="stats-difficulty-breakdown">
      <h3>By Difficulty</h3>
      ${Object.entries(stats.difficultyBreakdown).map(([diff, d]) => `<div class="difficulty-stat-row">
        <span class="difficulty-stat-label">${esc(diff.charAt(0).toUpperCase() + diff.slice(1))}</span>
        <span class="difficulty-stat-record">${d.wins ?? 0}W / ${d.losses ?? 0}L / ${d.draws ?? 0}D</span>
      </div>`).join('')}
    </div>` : ''}
    ${stats.recentResults && stats.recentResults.length > 0 ? `<div class="stats-recent" data-testid="stats-recent">
      <h3>Recent Matches</h3>
      ${stats.recentResults.map(r => `<div class="recent-match-row">
        <span class="recent-result ${r.isHumanWinner ? 'win' : r.winner ? 'loss' : 'draw'}">${r.isHumanWinner ? 'Won' : r.winner ? 'Lost' : 'Draw'}</span>
        <span class="recent-opponent">${esc(r.aiPolicyId ?? 'AI')}</span>
        <span class="recent-profile">${esc(r.profileId ?? '')}</span>
      </div>`).join('')}
    </div>` : ''}
  </div>` : '';

  return `<div class="play-hub" data-testid="play-hub">
    <a class="play-hub-back" href="#/" aria-label="Back to landing">← Back</a>
    <h1 class="play-hub-title">Play</h1>
    <p class="play-hub-subtitle">Local single-player matches against the deterministic AI.</p>
    ${continueSave ? `<div class="continue-card" data-testid="continue-card">
      <h2>Continue</h2>
      <p>Profile: ${esc(continueSave.profileId)} · Mode: ${esc(continueSave.mode ?? 'ADVANCED_CORE')}</p>
      <button class="primary-button" data-testid="continue-match" data-action="continue-match" data-save-id="${esc(continueSave.saveId)}">Continue match</button>
    </div>` : ''}
    ${statsDashboard}
    <div class="play-hub-grid">
      <button class="play-hub-card" data-testid="start-tutorial" data-action="start-tutorial">
        <span class="play-hub-icon" aria-hidden="true">📖</span>
        <strong>First Contact Tutorial</strong>
        <p>Learn the basics with an interactive guide.</p>
      </button>
      <button class="play-hub-card" data-testid="new-game" data-action="new-game">
        <span class="play-hub-icon" aria-hidden="true">⚔</span>
        <strong>New Game vs AI</strong>
        <p>Start a match against a HYBRIX AI opponent.</p>
      </button>
      <button class="play-hub-card" data-testid="online-duel" data-action="online-duel">
        <span class="play-hub-icon" aria-hidden="true">🌐</span>
        <strong>Direct Duel</strong>
        <p>Play online against a remote human opponent.</p>
      </button>
      <button class="play-hub-card" data-testid="replay-library" data-action="replay-library">
        <span class="play-hub-icon" aria-hidden="true">▶</span>
        <strong>Replay Library</strong>
        <p>Watch your completed matches with verified replays.</p>
      </button>
    </div>
    <p class="play-hub-notice">All saves and replays are stored locally in this browser.</p>
    <p class="play-hub-compat">Engine 4.2.6 · Rules 4.3.1</p>
    ${!idbAvailable ? '<p class="play-hub-warning" role="alert">IndexedDB is unavailable. Progress will not survive refresh.</p>' : ''}
  </div>`;
}

/**
 * Render the new match setup screen.
 */
export function renderNewMatchSetup(policyCatalog) {
  const profiles = [
    { id: 'first-contact-trigger-closure', label: 'First Contact', desc: 'Simplified rules for learning', icon: '📖' },
    { id: 'core-advanced-authority', label: 'Advanced Core', desc: 'Full rules with all mechanics', icon: '⚔' },
    { id: 'core-unrestricted-authority', label: 'Unrestricted Core', desc: 'Hidden supers, generated effects, sudden death', icon: '🔥' },
  ];
  const seats = [
    { id: 'P1', label: 'Seat 1 (goes first)', icon: '①' },
    { id: 'P2', label: 'Seat 2 (goes second)', icon: '②' },
    { id: 'random', label: 'Random seat', icon: '🎲' },
  ];
  // Group policies by difficulty
  const byDifficulty = new Map();
  for (const p of policyCatalog) {
    const diff = p.traits?.difficulty ?? 'normal';
    if (!byDifficulty.has(diff)) byDifficulty.set(diff, []);
    byDifficulty.get(diff).push(p);
  }
  const difficultyOrder = ['easy', 'normal', 'hard', 'nightmare'];
  const difficultyColors = { easy: 'var(--tcg-success)', normal: 'var(--tcg-accent)', hard: 'var(--tcg-warning)', nightmare: 'var(--tcg-danger)' };
  const difficultyIcons = { easy: '🟢', normal: '🔵', hard: '🟠', nightmare: '🔴' };

  return `<div class="play-setup" data-testid="play-setup">
    <a class="play-hub-back" href="#/play" aria-label="Back to Play hub">← Back</a>
    <h1>New Match</h1>
    <form id="new-match-form" data-testid="new-match-form">
      <fieldset>
        <legend>Mode</legend>
        <div class="setup-card-grid">
          ${profiles.map(p => `<label class="setup-card">
            <input type="radio" name="profile" value="${esc(p.id)}" ${p.id === 'core-advanced-authority' ? 'checked' : ''}>
            <span class="setup-card-icon" aria-hidden="true">${p.icon}</span>
            <span class="setup-card-body">
              <strong>${esc(p.label)}</strong>
              <small>${esc(p.desc)}</small>
            </span>
          </label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>Your seat</legend>
        <div class="setup-seat-row">
          ${seats.map(s => `<label class="setup-seat-option">
            <input type="radio" name="seat" value="${esc(s.id)}" ${s.id === 'P1' ? 'checked' : ''}>
            <span class="setup-seat-icon" aria-hidden="true">${s.icon}</span>
            <span>${esc(s.label)}</span>
          </label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>AI opponent</legend>
        ${difficultyOrder.map(diff => {
          const policies = byDifficulty.get(diff) ?? [];
          if (policies.length === 0) return '';
          const color = difficultyColors[diff] ?? 'var(--tcg-text-dim)';
          const icon = difficultyIcons[diff] ?? '⚪';
          return `<div class="difficulty-group" style="--diff-color:${color}">
            <span class="difficulty-label">${icon} ${esc(diff.charAt(0).toUpperCase() + diff.slice(1))}</span>
            <div class="ai-personality-grid">
              ${policies.map(p => {
                const archetype = p.traits?.archetype ?? '';
                const personality = getArchetypePersonality(archetype);
                return `<label class="ai-personality-card">
                  <input type="radio" name="ai-policy" value="${esc(p.policyId)}">
                  <span class="ai-personality-name">${esc(archetype || p.policyId)}</span>
                  <span class="ai-personality-style">${esc(personality.playStyle)}</span>
                  <span class="ai-personality-desc">${esc(personality.description)}</span>
                </label>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </fieldset>
      <fieldset>
        <legend>Seed (optional)</legend>
        <label class="seed-input-label">Manual seed: <input type="number" name="seed" min="1" max="4294967295" placeholder="Random"></label>
      </fieldset>
      <div class="setup-actions">
        <button type="submit" class="primary-button" data-testid="start-match">Start match</button>
        <a class="secondary-button" href="#/play">Back</a>
      </div>
    </form>
  </div>`;
}
