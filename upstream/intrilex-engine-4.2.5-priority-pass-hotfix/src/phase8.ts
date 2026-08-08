import { canonicalClone } from "./canonical-json.js";
import { markExileBound } from "./lifecycle.js";
import { cardPointValue, parseIdentity } from "./ranks.js";
import { deriveSecuredPoints, moveCard } from "./state.js";
import type { CardId, EngineState, Phase8Action, PlayerId, ZoneName } from "./types.js";

export interface TimerState { remaining: number; activationFullTurnSequence: number; }
export interface SuddenDeathState extends TimerState { activatorId: PlayerId; }
export interface ExhaustedState { remaining: number; startedFullTurnSequence: number; }
export interface VoltageSnapshot { rank3: number; rank4: number; rank5: number; capturedFullTurnSequence: number; }
export interface Phase8Runtime {
  boardLock: TimerState | null;
  suddenDeath: SuddenDeathState | null;
  exhausted: ExhaustedState | null;
  voltageSnapshots: Record<PlayerId, VoltageSnapshot>;
  voltageUsedThisFT: Record<PlayerId, Record<"3" | "4" | "5", boolean>>;
}
export interface Phase8EventSpec { type: string; payload: Record<string, unknown>; }
export type Phase8Resolution =
  | { ok: true; state: EngineState; events: Phase8EventSpec[] }
  | { ok: false; code: string; message: string; details?: unknown };

function fail(code: string, message: string, details?: unknown): Phase8Resolution {
  return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}

export function phase8Runtime(state: EngineState): Phase8Runtime {
  const existing = state.metadata.phase8 as Partial<Phase8Runtime> | undefined;
  return {
    boardLock: existing?.boardLock ?? null,
    suddenDeath: existing?.suddenDeath ?? null,
    exhausted: existing?.exhausted ?? null,
    voltageSnapshots: canonicalClone(existing?.voltageSnapshots ?? {}),
    voltageUsedThisFT: canonicalClone(existing?.voltageUsedThisFT ?? {})
  };
}

function saveRuntime(state: EngineState, runtime: Phase8Runtime): void {
  state.metadata.phase8 = runtime;
}

function inHand(state: EngineState, cardId: CardId, playerId: PlayerId): boolean {
  const card = state.cards[cardId];
  return card !== undefined && card.controllerId === playerId && card.zone === `${playerId}_HAND`;
}

function colorOf(identity: string): "black" | "red" | null {
  const parsed = parseIdentity(identity);
  if (!parsed?.suit) return null;
  return parsed.suit === "♣" || parsed.suit === "♠" ? "black" : "red";
}

function validateUltraRecipe(state: EngineState, actorId: PlayerId, sourceIds: CardId[], recipe: "3-black" | "3-red" | "2-black-2-red"): string | null {
  if (state.players[actorId]?.limits.ultraPlayedThisFT) return "Ultra limit already used this FT";
  if (!sourceIds.every((id) => inHand(state, id, actorId))) return "Every Ultra source must be controlled in hand";
  const colors = sourceIds.map((id) => colorOf(state.cards[id]!.identity));
  if (colors.some((color) => color === null)) return "Jokers cannot satisfy color recipes";
  if (recipe === "3-black" && (sourceIds.length !== 3 || colors.some((color) => color !== "black"))) return "3 Black requires exactly three black-suited cards";
  if (recipe === "3-red" && (sourceIds.length !== 3 || colors.some((color) => color !== "red"))) return "3 Red requires exactly three red-suited cards";
  if (recipe === "2-black-2-red" && (sourceIds.length !== 4 || colors.filter((c) => c === "black").length !== 2 || colors.filter((c) => c === "red").length !== 2)) return "2 Black + 2 Red requires exactly two of each color";
  return null;
}

function scoreCard(state: EngineState, cardId: CardId, playerId: PlayerId): void {
  const card = state.cards[cardId]!;
  if (typeof card.state.pointValue !== "number") card.state.pointValue = cardPointValue(card);
  moveCard(state, cardId, `${playerId}_PR`, playerId);
}

function effectDestination(state: EngineState, cardId: CardId): ZoneName {
  return state.cards[cardId]?.state.exileBound === true ? "EXILE" : "GY";
}

function captureVoltage(state: EngineState, playerId: PlayerId, runtime: Phase8Runtime): VoltageSnapshot {
  const values: Record<"3" | "4" | "5", number> = { "3": 0, "4": 0, "5": 0 };
  for (const id of state.players[playerId]!.pr) {
    const card = state.cards[id];
    const parsed = card ? parseIdentity(card.identity) : null;
    if (!card || card.controllerId !== playerId || card.state.tapped === true || !parsed || !(parsed.rank in values)) continue;
    values[parsed.rank as "3" | "4" | "5"] += typeof card.state.pointValue === "number" ? card.state.pointValue : cardPointValue(card);
  }
  const snapshot = { rank3: values["3"], rank4: values["4"], rank5: values["5"], capturedFullTurnSequence: state.fullTurnSequence };
  runtime.voltageSnapshots[playerId] = snapshot;
  runtime.voltageUsedThisFT[playerId] = { "3": false, "4": false, "5": false };
  return snapshot;
}

function rankOf(identity: string): string { return parseIdentity(identity)?.rank ?? identity; }
function suitOf(identity: string): string | null { return parseIdentity(identity)?.suit ?? null; }

function anchorCount(state: EngineState, playerId: PlayerId): number {
  return state.players[playerId]!.er.filter((id) => {
    const card = state.cards[id];
    if (!card || card.controllerId !== playerId || card.state.tapped === true || card.state.faceDownTrap === true) return false;
    const rank = parseIdentity(card.identity)?.rank;
    return rank === "A" || rank === "9" || rank === "Q" || rank === "K" || card.state.anchor === true;
  }).length;
}

export function exhaustedWinner(state: EngineState): PlayerId | null {
  const ordered = state.turnOrder.map((id) => ({ id, anchors: anchorCount(state, id), points: deriveSecuredPoints(state, id) }));
  const maxAnchors = Math.max(...ordered.map((x) => x.anchors));
  const anchorLeaders = ordered.filter((x) => x.anchors === maxAnchors);
  const maxPoints = Math.max(...anchorLeaders.map((x) => x.points));
  const leaders = anchorLeaders.filter((x) => x.points === maxPoints);
  return leaders.length === 1 ? leaders[0]!.id : null;
}

export function resolvePhase8Action(input: EngineState, actorId: PlayerId, action: Phase8Action): Phase8Resolution {
  if (!input.players[actorId]) return fail("PHASE8_PLAYER", `Unknown actor ${actorId}`);
  const state = canonicalClone(input);
  const runtime = phase8Runtime(state);
  const events: Phase8EventSpec[] = [];

  switch (action.kind) {
    case "resolve-ultra": {
      const problem = validateUltraRecipe(state, actorId, action.sourceCardIds, action.recipe);
      if (problem) return fail("ULTRA_ILLEGAL", problem);
      state.players[actorId]!.limits.ultraPlayedThisFT = true;
      events.push({ type: "ULTRA_RESOLUTION_BEGAN", payload: { actorId, recipe: action.recipe, sourceCardIds: action.sourceCardIds, atomic: true } });
      if (action.recipe === "3-black") {
        if (!action.scoreCardId || !action.castCardId || !action.exileCardId || new Set([action.scoreCardId, action.castCardId, action.exileCardId]).size !== 3 || ![action.scoreCardId, action.castCardId, action.exileCardId].every((id) => action.sourceCardIds.includes(id))) return fail("ULTRA_ROLES", "3 Black requires three distinct declared role assignments");
        scoreCard(state, action.scoreCardId, actorId);
        const cast = state.cards[action.castCardId]!;
        if (parseIdentity(cast.identity)?.rank === "10") markExileBound(cast);
        moveCard(state, action.castCardId, effectDestination(state, action.castCardId));
        moveCard(state, action.exileCardId, "EXILE");
        events.push({ type: "ULTRA_3_BLACK_RESOLVED", payload: { scoreCardId: action.scoreCardId, castCardId: action.castCardId, castInternal: true, priorityWindowsInside: 0, exileCardId: action.exileCardId } });
      } else if (action.recipe === "3-red") {
        if (!action.targetStackItemId) return fail("ULTRA_TARGET", "3 Red requires a pending counter target");
        const index = state.stack.findIndex((item) => item.id === action.targetStackItemId);
        if (index < 0) return fail("ULTRA_TARGET", "3 Red target stack item does not exist");
        const target = state.stack[index]!;
        state.stack.splice(index, 1);
        for (const sourceId of target.sourceCardIds) if (state.cards[sourceId]?.zone === "ON_STACK") moveCard(state, sourceId, target.sourceDestination);
        for (const sourceId of action.sourceCardIds) moveCard(state, sourceId, "GY");
        const bottom = state.zones.gy.at(0);
        if (bottom) moveCard(state, bottom, `${actorId}_HAND`, actorId);
        events.push({ type: "ULTRA_3_RED_RESOLVED", payload: { targetStackItemId: action.targetStackItemId, counterAuthority: "super-ace", bottomGyDrawCardId: bottom ?? null, priorityWindowsInside: 0 } });
      } else {
        for (const sourceId of action.sourceCardIds) moveCard(state, sourceId, "GY");
        const player = state.players[actorId]!;
        player.limits.miniTurnsRemaining = Math.min(3, player.limits.miniTurnsRemaining + 2);
        if (action.branch === "draw-two") {
          const drawn = state.zones.dp.slice(0, 2);
          for (const id of drawn) moveCard(state, id, `${actorId}_HAND`, actorId);
          events.push({ type: "ULTRA_2B2R_RESOLVED", payload: { branch: action.branch, drawnCardIds: drawn, miniTurnsRemaining: player.limits.miniTurnsRemaining } });
        } else {
          if (action.rummageCardId && state.cards[action.rummageCardId]?.zone === "EXILE") moveCard(state, action.rummageCardId, `${actorId}_HAND`, actorId);
          events.push({ type: "ULTRA_2B2R_RESOLVED", payload: { branch: action.branch, rummageCardId: action.rummageCardId ?? null, miniTurnsRemaining: player.limits.miniTurnsRemaining } });
        }
      }
      break;
    }
    case "begin-rank10-resolution": {
      const card = state.cards[action.cardId];
      if (!card || card.controllerId !== actorId || parseIdentity(card.identity)?.rank !== "10") return fail("RANK10_SOURCE", "Rank-10 wrapper requires a controlled Ten");
      if (state.players[actorId]!.limits.rank10PlayedThisFT) return fail("RANK10_LIMIT", "Rank-10 effect limit already used this FT");
      state.players[actorId]!.limits.rank10PlayedThisFT = true;
      markExileBound(card);
      events.push({ type: "RANK10_RESOLUTION_BEGAN", payload: { cardId: action.cardId, exileBound: true, royalShieldApplicable: false } });
      if (action.destinationAfterResolution) moveCard(state, action.cardId, action.destinationAfterResolution);
      break;
    }
    case "capture-voltage": {
      const playerId = action.playerId;
      if (!state.players[playerId]) return fail("VOLTAGE_PLAYER", `Unknown player ${playerId}`);
      const snapshot = captureVoltage(state, playerId, runtime);
      events.push({ type: "VOLTAGE_SNAPSHOT_CAPTURED", payload: { playerId, snapshot } });
      break;
    }
    case "resolve-voltage": {
      const playerId = action.playerId;
      const snapshot = runtime.voltageSnapshots[playerId];
      if (!snapshot) return fail("VOLTAGE_SNAPSHOT", "Voltage requires a captured Start snapshot");
      const used = runtime.voltageUsedThisFT[playerId] ?? { "3": false, "4": false, "5": false };
      if (used[action.rank]) return fail("VOLTAGE_LIMIT", `Rank ${action.rank} Voltage already resolved this FT`);
      const threshold = Number(action.rank);
      const value = action.rank === "3" ? snapshot.rank3 : action.rank === "4" ? snapshot.rank4 : snapshot.rank5;
      if (value < threshold) return fail("VOLTAGE_THRESHOLD", `Snapshot ${value} does not meet threshold ${threshold}`);
      used[action.rank] = true;
      runtime.voltageUsedThisFT[playerId] = used;
      if (action.rank === "3") {
        const revealed = state.zones.dp.slice(0, 2);
        const chosen = action.chosenCardId && revealed.includes(action.chosenCardId) ? action.chosenCardId : revealed[0];
        if (chosen) {
          if (action.disposition === "points") scoreCard(state, chosen, playerId);
          else if (action.disposition === "hand") moveCard(state, chosen, `${playerId}_HAND`, playerId);
          else moveCard(state, chosen, effectDestination(state, chosen));
          for (const id of revealed.filter((x) => x !== chosen)) moveCard(state, id, "DP");
        }
        events.push({ type: "VOLTAGE_3_RESOLVED", payload: { playerId, revealedCardIds: revealed, chosenCardId: chosen ?? null, disposition: action.disposition } });
      } else if (action.rank === "4") {
        const top = state.zones.dp[0];
        if (!top) { events.push({ type: "VOLTAGE_4_RESOLVED", payload: { playerId, topCardId: null, result: "no-card" } }); break; }
        const identity = state.cards[top]!.identity;
        const rankCorrect = rankOf(identity) === action.guessRank;
        const suitCorrect = suitOf(identity) === action.guessSuit;
        let result = "returned-top";
        if (rankCorrect) {
          if (action.rankMatchDisposition === "points") scoreCard(state, top, playerId); else moveCard(state, top, effectDestination(state, top));
          result = `rank-${action.rankMatchDisposition}`;
        } else if (suitCorrect) { moveCard(state, top, `${playerId}_HAND`, playerId); result = "suit-draw"; }
        events.push({ type: "VOLTAGE_4_RESOLVED", payload: { playerId, topCardId: top, rankCorrect, suitCorrect, result } });
      } else {
        if (action.branch === "gy-bottom") {
          const bottom = state.zones.gy[0];
          if (bottom) moveCard(state, bottom, `${playerId}_HAND`, playerId);
          events.push({ type: "VOLTAGE_5_RESOLVED", payload: { playerId, branch: action.branch, cardId: bottom ?? null } });
        } else {
          const first = state.zones.dp[0];
          if (first) moveCard(state, first, `${playerId}_HAND`, playerId);
          if (action.discardCardId && state.cards[action.discardCardId]?.zone === `${playerId}_HAND`) moveCard(state, action.discardCardId, "GY");
          const second = state.zones.dp[0];
          if (second) moveCard(state, second, `${playerId}_HAND`, playerId);
          events.push({ type: "VOLTAGE_5_RESOLVED", payload: { playerId, branch: action.branch, firstDrawCardId: first ?? null, discardCardId: action.discardCardId ?? null, secondDrawCardId: second ?? null } });
        }
      }
      break;
    }
    case "activate-board-lock":
      runtime.boardLock = { remaining: 2, activationFullTurnSequence: state.fullTurnSequence };
      events.push({ type: "BOARD_LOCK_ACTIVATED", payload: { ...runtime.boardLock } });
      break;
    case "activate-sudden-death":
      runtime.suddenDeath = { remaining: 2, activationFullTurnSequence: state.fullTurnSequence, activatorId: actorId };
      events.push({ type: "SUDDEN_DEATH_ACTIVATED", payload: { ...runtime.suddenDeath } });
      break;
    case "begin-start-checkpoint": {
      const playerId = action.playerId;
      if (!state.players[playerId]) return fail("START_PLAYER", `Unknown player ${playerId}`);
      state.phase = "Start";
      state.activePlayerId = playerId;
      state.startPhaseSequenceByPlayer[playerId] = (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1;
      if (state.zones.dp.length === 0 && runtime.exhausted === null) {
        runtime.exhausted = { remaining: 3, startedFullTurnSequence: state.fullTurnSequence };
        events.push({ type: "EXHAUSTED_BEGAN", payload: { ...runtime.exhausted } });
      }
      const snapshot = captureVoltage(state, playerId, runtime);
      events.push({ type: "START_CHECKPOINT_COMPLETED", payload: { playerId, snapshot, exhausted: runtime.exhausted } });
      break;
    }
    case "recover-exhausted": {
      const moved: CardId[] = [];
      for (const cardId of action.cardIds) {
        const card = state.cards[cardId];
        if (!card || (card.zone !== "EXILE" && card.zone !== "GY")) return fail("EXHAUSTED_RECOVERY_SOURCE", `${cardId} is not recoverable from Exile or GY`);
        moveCard(state, cardId, "DP"); moved.push(cardId);
      }
      if (moved.length > 0 && runtime.exhausted !== null) runtime.exhausted = null;
      events.push({ type: "EXHAUSTED_RECOVERED", payload: { cardIds: moved, restrictionsLiftedImmediately: moved.length > 0 } });
      break;
    }
    case "process-end-phase": {
      state.phase = "End";
      const active = state.activePlayerId;
      if (deriveSecuredPoints(state, active) >= state.players[active]!.goal) {
        state.winner = active;
        events.push({ type: "WINNER_DECLARED", payload: { playerId: active, reason: "normal-victory", step: 1 } });
        break;
      }
      if (runtime.boardLock && runtime.boardLock.activationFullTurnSequence !== state.fullTurnSequence) {
        runtime.boardLock.remaining -= 1;
        events.push({ type: "BOARD_LOCK_TICKED", payload: { remaining: runtime.boardLock.remaining, step: 2 } });
        if (runtime.boardLock.remaining <= 0) { runtime.boardLock = null; events.push({ type: "BOARD_LOCK_ENDED", payload: { step: 2 } }); }
      }
      if (runtime.suddenDeath && runtime.suddenDeath.activationFullTurnSequence !== state.fullTurnSequence) {
        runtime.suddenDeath.remaining -= 1;
        events.push({ type: "SUDDEN_DEATH_TICKED", payload: { remaining: runtime.suddenDeath.remaining, step: 3 } });
        if (runtime.suddenDeath.remaining <= 0) {
          state.winner = runtime.suddenDeath.activatorId;
          events.push({ type: "WINNER_DECLARED", payload: { playerId: state.winner, reason: "sudden-death", step: 3, shortCircuited: true } });
          break;
        }
      }
      if (runtime.exhausted) {
        runtime.exhausted.remaining -= 1;
        events.push({ type: "EXHAUSTED_TICKED", payload: { remaining: runtime.exhausted.remaining, step: 4 } });
        if (runtime.exhausted.remaining <= 0) {
          state.winner = exhaustedWinner(state);
          events.push({ type: "EXHAUSTED_TIEBREAKER_RESOLVED", payload: { winner: state.winner, draw: state.winner === null, step: 4 } });
        }
      }
      break;
    }
  }
  saveRuntime(state, runtime);
  return { ok: true, state, events };
}
