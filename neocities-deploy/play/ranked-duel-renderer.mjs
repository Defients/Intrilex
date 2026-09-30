// ═══════════════════════════════════════════════════════════════
// ranked-duel-renderer.mjs — Ranked Duel shell renderer (terminal + error).
//
// Active match play is rendered by the Astra React board (client/mount.tsx).
// This module now provides only the rich terminal/results screen and the
// error screen, plus the legacy renderBoard entry point used by play-app.js
// for TERMINAL snapshots. The classic active-board renderer (renderMatch
// and its helpers) has been removed in favor of Astra.
// ═══════════════════════════════════════════════════════════════

import { buildRankedDuelViewModel } from './ranked-duel-viewmodel.mjs';
import { loadProfile } from './local-profile.mjs';
import { renderNewMatchSetup } from './ranked-duel-hub.mjs';
import { renderTerminal, renderError } from './ranked-duel-terminal.mjs';

// Re-export hub function for backward compatibility
// (tests and play-app.js import these from ranked-duel-renderer.mjs)
export { renderNewMatchSetup };

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
      // v2.5 §4J: Pass difficulty through for the "AI · EASY" meta line.
      difficulty: controllerSnapshot.opponent?.difficulty ?? '',
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
 * Render the ranked duel shell from a snapshot. Active match play is
 * rendered by the Astra React board; this entry point is now used only
 * for TERMINAL snapshots (the rich terminal results screen) and ERROR
 * snapshots. Non-terminal active snapshots return an empty string.
 * @param {object} snapshot — Authorized player snapshot from PlaySession
 * @param {object} options — Render options passed through to the terminal/error renderer
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
 * Render the ranked duel shell. TERMINAL snapshots render the rich terminal
 * results screen; ERROR snapshots render the error screen. Active (non-
 * terminal) snapshots return an empty string — active play is rendered by
 * the Astra React board (client/mount.tsx).
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

  // Active play is rendered by the Astra React board; the classic
  // active-board renderer (renderMatch and its helpers) has been removed.
  return '';
}
