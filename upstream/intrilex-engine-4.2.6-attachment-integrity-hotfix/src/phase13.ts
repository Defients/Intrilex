import { canonicalClone } from "./canonical-json.js";
import { hasAegis, revealUntilStart } from "./lifecycle.js";
import { relationBetween } from "./phase11.js";
import { moveCard } from "./state.js";
import type { CardId, CardInstance, EngineState, Phase13Action, PlayerId } from "./types.js";

export type TimeBombSuit = "♣" | "♦" | "♥" | "♠";

export interface TimeBombMarker {
  suit: TimeBombSuit;
  stage: number;
  peak: number;
}

export interface ForcedDrawState {
  sourceBombId: CardId;
  createdOnFullTurnSequence: number;
}

export interface Phase13Runtime {
  enabled: boolean;
  forcedDrawByPlayer: Record<PlayerId, ForcedDrawState>;
  queuedFuseCardIds: CardId[];
  lastResolution: Record<string, unknown> | null;
}

export interface Phase13EventSpec {
  type: string;
  payload: Record<string, unknown>;
  visibility?: "public" | "private" | "authorized";
}

export type Phase13Resolution =
  | { ok: true; state: EngineState; events: Phase13EventSpec[] }
  | { ok: false; code: string; message: string; details?: unknown };

const TRACKS: Readonly<Record<TimeBombSuit, readonly number[]>> = Object.freeze({
  "♣": Object.freeze([0, 2, 4, 7]),
  "♦": Object.freeze([0, 2, 4, 7]),
  "♥": Object.freeze([0, -2, -4, -7]),
  "♠": Object.freeze([0, 3, 6, 9, 12, 15, 21])
});

function fail(code: string, message: string, details?: unknown): Phase13Resolution {
  return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}

export function phase13Runtime(state: EngineState): Phase13Runtime {
  const current = state.metadata.phase13 as Partial<Phase13Runtime> | undefined;
  return {
    enabled: current?.enabled ?? false,
    forcedDrawByPlayer: canonicalClone(current?.forcedDrawByPlayer ?? {}),
    queuedFuseCardIds: [...(current?.queuedFuseCardIds ?? [])],
    lastResolution: current?.lastResolution ? canonicalClone(current.lastResolution) : null
  };
}

function saveRuntime(state: EngineState, runtime: Phase13Runtime): void {
  state.metadata.phase13 = canonicalClone(runtime);
}

function suitOfQueen(card: CardInstance): TimeBombSuit | null {
  const match = /^Q([♣♦♥♠])$/.exec(card.identity);
  return match ? match[1] as TimeBombSuit : null;
}

export function bombMarker(card: CardInstance): TimeBombMarker | null {
  const value = card.state.timeBomb;
  if (typeof value !== "object" || value === null) return null;
  const marker = value as Partial<TimeBombMarker>;
  if (!(["♣", "♦", "♥", "♠"] as unknown[]).includes(marker.suit) || !Number.isInteger(marker.stage) || !Number.isInteger(marker.peak)) return null;
  return { suit: marker.suit as TimeBombSuit, stage: marker.stage as number, peak: marker.peak as number };
}

export function isTimeBomb(card: CardInstance): boolean {
  return card.zone.endsWith("_PR") && card.state.faceDownTrap !== true && bombMarker(card) !== null;
}

export function stageValue(suit: TimeBombSuit, stage: number): number {
  const track = TRACKS[suit];
  const bounded = Math.max(0, Math.min(stage, track.length - 1));
  return track[bounded] ?? 0;
}

export function createTimeBomb(card: CardInstance): TimeBombMarker {
  const suit = suitOfQueen(card);
  if (!suit) throw new Error(`${card.identity} is not a suited Queen`);
  const marker: TimeBombMarker = { suit, stage: 0, peak: TRACKS[suit].length - 1 };
  card.state.timeBomb = marker;
  card.state.timeBombStage = 0;
  card.state.pointValue = 0;
  return marker;
}

export function clearTimeBomb(card: CardInstance): void {
  delete card.state.timeBomb;
  delete card.state.timeBombStage;
  delete card.state.forcedDrawSource;
}

function nextEnemy(state: EngineState, controllerId: PlayerId): PlayerId | null {
  const start = state.turnOrder.indexOf(controllerId);
  if (start < 0) return null;
  for (let offset = 1; offset < state.turnOrder.length; offset += 1) {
    const candidate = state.turnOrder[(start + offset) % state.turnOrder.length];
    if (candidate && relationBetween(state, controllerId, candidate) === "enemy") return candidate;
  }
  return null;
}

function removeChosenEnemyCards(state: EngineState, controllerId: PlayerId, choices: Record<PlayerId, CardId> | undefined, events: Phase13EventSpec[]): Phase13Resolution | null {
  const enemies = state.turnOrder.filter((id) => relationBetween(state, controllerId, id) === "enemy");
  for (const enemyId of enemies) {
    const player = state.players[enemyId]!;
    if (player.hand.length === 0) continue;
    const chosen = choices?.[enemyId];
    if (!chosen || !player.hand.includes(chosen)) return fail("TIME_BOMB_CHOICE", `Q♥ Peak requires a legal discard choice for ${enemyId}`);
  }
  for (const enemyId of enemies) {
    const chosen = choices?.[enemyId];
    if (!chosen) continue;
    moveCard(state, chosen, "GY");
    events.push({ type: "TIME_BOMB_HEART_DISCARD", payload: { enemyId, cardId: chosen }, visibility: "authorized" });
  }
  return null;
}

function resolveClubPeak(state: EngineState, controllerId: PlayerId, events: Phase13EventSpec[]): void {
  const newest = state.zones.gy[0];
  const oldest = state.zones.gy[state.zones.gy.length - 1];
  const selected = [...new Set([newest, oldest].filter((id): id is CardId => id !== undefined))];
  for (const cardId of selected) {
    moveCard(state, cardId, `${controllerId}_HAND`, controllerId);
    revealUntilStart(state.cards[cardId]!, { playerId: controllerId, startSequence: (state.startPhaseSequenceByPlayer[controllerId] ?? 0) + 1 });
  }
  events.push({ type: "TIME_BOMB_CLUB_PEAK", payload: { controllerId, cardIds: selected }, visibility: "authorized" });
}

export function resolvePhase13Action(input: EngineState, actorId: PlayerId, action: Phase13Action): Phase13Resolution {
  const state = canonicalClone(input);
  const runtime = phase13Runtime(state);
  const events: Phase13EventSpec[] = [];

  switch (action.kind) {
    case "configure-time-bomb": {
      runtime.enabled = true;
      runtime.lastResolution = { kind: action.kind };
      saveRuntime(state, runtime);
      events.push({ type: "TIME_BOMB_CONFIGURED", payload: { enabled: true } });
      return { ok: true, state, events };
    }
    case "score-queen-as-bomb": {
      if (!runtime.enabled) return fail("TIME_BOMB_DISABLED", "Time Bomb Mode is not enabled");
      const card = state.cards[action.cardId];
      if (!card || card.controllerId !== action.playerId || card.zone !== `${action.playerId}_HAND`) return fail("TIME_BOMB_SCORE", "The Queen must be controlled in the scoring player's hand");
      if (!suitOfQueen(card)) return fail("TIME_BOMB_SCORE", "Only a suited Queen can become a Time Bomb");
      moveCard(state, action.cardId, `${action.playerId}_PR`, action.playerId);
      const marker = createTimeBomb(card);
      runtime.lastResolution = { kind: action.kind, cardId: action.cardId, marker };
      saveRuntime(state, runtime);
      events.push({ type: "TIME_BOMB_CREATED", payload: { cardId: action.cardId, controllerId: action.playerId, marker } });
      return { ok: true, state, events };
    }
    case "queue-fuse-triggers": {
      if (!runtime.enabled) return fail("TIME_BOMB_DISABLED", "Time Bomb Mode is not enabled");
      const ids = Object.values(state.cards).filter((card) => card.controllerId === action.playerId && isTimeBomb(card)).map((card) => card.id).sort();
      runtime.queuedFuseCardIds = ids;
      runtime.lastResolution = { kind: action.kind, playerId: action.playerId, cardIds: ids };
      saveRuntime(state, runtime);
      for (const cardId of ids) events.push({ type: "TIME_BOMB_FUSE_QUEUED", payload: { cardId, controllerId: action.playerId } });
      return { ok: true, state, events };
    }
    case "resolve-fuse": {
      if (!runtime.enabled) return fail("TIME_BOMB_DISABLED", "Time Bomb Mode is not enabled");
      const card = state.cards[action.cardId];
      if (!card || !isTimeBomb(card)) return fail("TIME_BOMB_TARGET", "Fuse target is not a legal Time Bomb");
      const marker = bombMarker(card)!;
      const previousStage = marker.stage;
      const nextStage = Math.min(marker.peak, marker.stage + 1);
      marker.stage = nextStage;
      card.state.timeBomb = marker;
      card.state.timeBombStage = nextStage;
      card.state.pointValue = stageValue(marker.suit, nextStage);
      runtime.queuedFuseCardIds = runtime.queuedFuseCardIds.filter((id) => id !== card.id);
      events.push({ type: "TIME_BOMB_FUSE_ADVANCED", payload: { cardId: card.id, controllerId: card.controllerId, previousStage, stage: nextStage, peak: marker.peak, value: card.state.pointValue, repeatedPeak: previousStage === marker.peak } });
      if (nextStage === marker.peak) {
        if (marker.suit === "♣") resolveClubPeak(state, card.controllerId, events);
        else if (marker.suit === "♦") {
          const target = nextEnemy(state, card.controllerId);
          if (target) {
            runtime.forcedDrawByPlayer[target] = { sourceBombId: card.id, createdOnFullTurnSequence: state.fullTurnSequence };
            events.push({ type: "TIME_BOMB_DIAMOND_FORCED_DRAW_SET", payload: { sourceBombId: card.id, targetPlayerId: target } });
          }
        } else if (marker.suit === "♥") {
          const failure = removeChosenEnemyCards(state, card.controllerId, action.enemyDiscardChoices, events);
          if (failure) return failure;
        }
      }
      runtime.lastResolution = { kind: action.kind, cardId: card.id, stage: nextStage, value: card.state.pointValue };
      saveRuntime(state, runtime);
      return { ok: true, state, events };
    }
    case "declare-defuse": {
      if (!runtime.enabled) return fail("TIME_BOMB_DISABLED", "Time Bomb Mode is not enabled");
      if (!action.responseWindow) return fail("DEFUSE_TIMING", "Defuse requires a legal response window");
      const target = state.cards[action.targetCardId];
      if (!target || !isTimeBomb(target)) return fail("DEFUSE_TARGET", "Defuse requires a legal Time Bomb target");
      if (hasAegis(target)) return fail("DEFUSE_AEGIS", "Aegis blocks Defuse");
      const actor = state.players[actorId];
      if (!actor) return fail("PLAYER_UNKNOWN", `Unknown player ${actorId}`);
      const marker = bombMarker(target)!;
      const required = marker.stage === marker.peak ? 1 : 2;
      if (action.costCardIds.length !== required || action.costCardIds.some((id) => !actor.hand.includes(id))) return fail("DEFUSE_COST", `Defuse requires exactly ${required} legal hand card(s)`);
      for (const cardId of action.costCardIds) moveCard(state, cardId, "GY");
      actor.limits.pendingActionPhaseSkips += 1;
      events.push({ type: "DEFUSE_DECLARED", payload: { actorId, targetCardId: target.id, costCardIds: action.costCardIds, required } });
      events.push({ type: "ACTION_PHASE_SKIP_ADDED", payload: { playerId: actorId, pending: actor.limits.pendingActionPhaseSkips } });
      if (action.countered === true) {
        events.push({ type: "DEFUSE_COUNTERED", payload: { actorId, targetCardId: target.id } });
      } else if (action.targetLegalAtResolution === false || !isTimeBomb(target)) {
        events.push({ type: "DEFUSE_FIZZLED", payload: { actorId, targetCardId: target.id } });
      } else {
        const from = target.zone;
        clearTimeBomb(target);
        moveCard(state, target.id, "GY");
        events.push({ type: "TIME_BOMB_DEFUSED", payload: { actorId, targetCardId: target.id, from, destination: "GY" } });
      }
      runtime.lastResolution = { kind: action.kind, actorId, targetCardId: target.id, countered: action.countered === true };
      saveRuntime(state, runtime);
      return { ok: true, state, events };
    }
    case "consume-action-phase-skip": {
      const player = state.players[action.playerId];
      if (!player) return fail("PLAYER_UNKNOWN", `Unknown player ${action.playerId}`);
      if (player.limits.pendingActionPhaseSkips < 1) return fail("ACTION_PHASE_SKIP", "No pending Action-Phase skip exists");
      player.limits.pendingActionPhaseSkips -= 1;
      player.limits.miniTurnsRemaining = 0;
      state.activePlayerId = action.playerId;
      state.phase = "End";
      runtime.lastResolution = { kind: action.kind, playerId: action.playerId };
      saveRuntime(state, runtime);
      events.push({ type: "ACTION_PHASE_SKIPPED", payload: { playerId: action.playerId, pending: player.limits.pendingActionPhaseSkips, miniTurnGrantsIgnored: true } });
      return { ok: true, state, events };
    }
    case "enforce-forced-draw": {
      const pending = runtime.forcedDrawByPlayer[action.playerId];
      if (!pending) return fail("FORCED_DRAW", "No pending Q♦ forced-Draw requirement exists");
      if (action.actionPhaseSkipped) return fail("FORCED_DRAW_WAITING", "A skipped Action Phase does not consume the requirement");
      if (action.drawLegal) {
        if (action.declaredAction !== "draw") return fail("FORCED_DRAW_REQUIRED", "Draw must be the first Action");
      } else if (action.declaredAction !== "pass") return fail("FORCED_PASS_REQUIRED", "When Draw is illegal, Pass is required");
      delete runtime.forcedDrawByPlayer[action.playerId];
      runtime.lastResolution = { kind: action.kind, playerId: action.playerId, declaredAction: action.declaredAction, drawLegal: action.drawLegal };
      saveRuntime(state, runtime);
      events.push({ type: action.drawLegal ? "FORCED_DRAW_CONSUMED" : "FORCED_DRAW_BECAME_PASS", payload: { playerId: action.playerId, sourceBombId: pending.sourceBombId } });
      return { ok: true, state, events };
    }
    case "change-bomb-controller": {
      const card = state.cards[action.cardId];
      if (!card || !isTimeBomb(card) || !state.players[action.controllerId]) return fail("TIME_BOMB_CONTROL", "Invalid Time Bomb control change");
      const previousControllerId = card.controllerId;
      const oldList = state.players[previousControllerId]?.pr;
      if (oldList) {
        const index = oldList.indexOf(card.id);
        if (index >= 0) oldList.splice(index, 1);
      }
      card.controllerId = action.controllerId;
      card.zone = `${action.controllerId}_PR`;
      state.players[action.controllerId]!.pr.push(card.id);
      runtime.lastResolution = { kind: action.kind, cardId: card.id, previousControllerId, controllerId: action.controllerId, stage: bombMarker(card)?.stage };
      saveRuntime(state, runtime);
      events.push({ type: "TIME_BOMB_CONTROLLER_CHANGED", payload: runtime.lastResolution as Record<string, unknown> });
      return { ok: true, state, events };
    }
    case "move-time-bomb": {
      const card = state.cards[action.cardId];
      if (!card) return fail("CARD_UNKNOWN", `Unknown card ${action.cardId}`);
      const wasBomb = isTimeBomb(card);
      const from = card.zone;
      if (wasBomb && !action.destination.endsWith("_PR")) clearTimeBomb(card);
      moveCard(state, card.id, action.destination, action.controllerId);
      runtime.lastResolution = { kind: action.kind, cardId: card.id, from, destination: card.zone, bombStateRemoved: wasBomb && !card.zone.endsWith("_PR") };
      saveRuntime(state, runtime);
      events.push({ type: "TIME_BOMB_MOVED", payload: runtime.lastResolution as Record<string, unknown> });
      return { ok: true, state, events };
    }
  }
}
