import { canonicalClone } from "./canonical-json.js";
import { hasAegis } from "./lifecycle.js";
import { parseIdentity } from "./ranks.js";
import { deriveSecuredPoints, moveCard } from "./state.js";
import { relationBetween } from "./phase11.js";
import type { BattleRealmSpec, CardId, CardInstance, EngineState, Phase12Action, PlayerId } from "./types.js";


export interface BattleRealmSpecDefinition {
  id: BattleRealmSpec;
  signature: string;
  ultimate: string;
  signatureUses: number;
  absoluteCaps: readonly string[];
  modifierKeys: readonly string[];
}

export const BATTLE_REALM_REGISTRY: Readonly<Record<BattleRealmSpec, BattleRealmSpecDefinition>> = Object.freeze({
  Bravery: Object.freeze({ id: "Bravery", signature: "Courageous Assault", ultimate: "Iron Advance", signatureUses: 1, absoluteCaps: ["mini-turn<=3","ultra<=1/FT","rank10<=1/FT","goal>=5"], modifierKeys: ["ruthless-read","dangerous-leverage","hard-jack","black-joker-draw"] }),
  Balance: Object.freeze({ id: "Balance", signature: "Rejuvenation", ultimate: "Harmonized Mimic", signatureUses: 1, absoluteCaps: ["mini-turn<=3","ultra<=1/FT","rank10<=1/FT","goal>=5"], modifierKeys: ["five-bottom-draw","six-draw-to-six","clean-exchange"] }),
  Beauty: Object.freeze({ id: "Beauty", signature: "Extra Lucky", ultimate: "Chromatic Ten", signatureUses: 3, absoluteCaps: ["mini-turn<=3","ultra<=1/FT","rank10<=1/FT","goal>=5"], modifierKeys: ["two-quick","five-rummage","seven-fortune","red-joker-choice","beauty-marriage"] }),
  Brilliance: Object.freeze({ id: "Brilliance", signature: "Mastermind", ultimate: "none", signatureUses: 1, absoluteCaps: ["mini-turn<=3","ultra<=1/FT","rank10<=1/FT","goal>=5"], modifierKeys: ["overreach-punish","goal-shock","calculated-court","counter-distortion"] })
});

export interface Phase12Runtime {
  enabled: boolean;
  specsRevealed: boolean;
  selectedSpecByPlayer: Record<PlayerId, BattleRealmSpec>;
  signatureUsesRemaining: Record<PlayerId, number>;
  ultimateUsedByPlayer: Record<PlayerId, boolean>;
  beautyExtraLuckyUsedOnFullTurn: Record<PlayerId, number | null>;
  brillianceCounterDistortionUsed: Record<PlayerId, boolean>;
  beautyFirstTwoDiscardUsedOnFullTurn: Record<PlayerId, number | null>;
  continuousBonusByPlayer: Record<PlayerId, number>;
  reservedCombinesDisabled: true;
  modifierOrder: readonly ["specific-effect", "module-interplay", "persistent-spec", "core"];
  lastResolution: Record<string, unknown> | null;
}

export interface Phase12EventSpec { type: string; payload: Record<string, unknown>; visibility?: "public" | "private" | "authorized"; }
export type Phase12Resolution =
  | { ok: true; state: EngineState; events: Phase12EventSpec[] }
  | { ok: false; code: string; message: string; details?: unknown };

function fail(code: string, message: string, details?: unknown): Phase12Resolution {
  return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}

export function phase12Runtime(state: EngineState): Phase12Runtime {
  const current = state.metadata.phase12 as Partial<Phase12Runtime> | undefined;
  return {
    enabled: current?.enabled ?? false,
    specsRevealed: current?.specsRevealed ?? false,
    selectedSpecByPlayer: canonicalClone(current?.selectedSpecByPlayer ?? {}),
    signatureUsesRemaining: canonicalClone(current?.signatureUsesRemaining ?? {}),
    ultimateUsedByPlayer: canonicalClone(current?.ultimateUsedByPlayer ?? {}),
    beautyExtraLuckyUsedOnFullTurn: canonicalClone(current?.beautyExtraLuckyUsedOnFullTurn ?? {}),
    brillianceCounterDistortionUsed: canonicalClone(current?.brillianceCounterDistortionUsed ?? {}),
    beautyFirstTwoDiscardUsedOnFullTurn: canonicalClone(current?.beautyFirstTwoDiscardUsedOnFullTurn ?? {}),
    continuousBonusByPlayer: canonicalClone(current?.continuousBonusByPlayer ?? {}),
    reservedCombinesDisabled: true,
    modifierOrder: ["specific-effect", "module-interplay", "persistent-spec", "core"],
    lastResolution: current?.lastResolution ? canonicalClone(current.lastResolution) : null
  };
}

function saveRuntime(state: EngineState, runtime: Phase12Runtime): void { state.metadata.phase12 = runtime; }

export function selectedBattleRealmSpec(state: EngineState, playerId: PlayerId): BattleRealmSpec | null {
  return phase12Runtime(state).selectedSpecByPlayer[playerId] ?? null;
}

export function qualifyingQueenIds(state: EngineState, playerId: PlayerId): CardId[] {
  const player = state.players[playerId];
  if (!player) return [];
  return [...player.pr, ...player.er].filter((id) => {
    const card = state.cards[id];
    return card !== undefined
      && card.controllerId === playerId
      && parseIdentity(card.identity)?.rank === "Q"
      && card.state.tapped !== true
      && card.state.faceDownTrap !== true;
  }).sort();
}

function unattached(cardState: Record<string, unknown>): boolean {
  return cardState.attachedByJackId === undefined && cardState.attachmentGraph === undefined;
}

export function beautyMarriageBonus(state: EngineState, playerId: PlayerId): number {
  if (selectedBattleRealmSpec(state, playerId) !== "Beauty") return 0;
  const player = state.players[playerId];
  if (!player) return 0;
  const cards = [...player.pr, ...player.er].map((id) => state.cards[id]).filter((card): card is CardInstance => card !== undefined && card.controllerId === playerId && card.state.tapped !== true && card.state.faceDownTrap !== true && unattached(card.state));
  const bonusBySuit: Record<string, number> = { "♣": 6, "♦": 7, "♥": 8, "♠": 9 };
  let total = 0;
  for (const suit of ["♣","♦","♥","♠"] as const) {
    const hasKing = cards.some((card) => { const p = parseIdentity(card.identity); return p?.rank === "K" && p.suit === suit; });
    const hasQueen = cards.some((card) => { const p = parseIdentity(card.identity); return p?.rank === "Q" && p.suit === suit; });
    if (hasKing && hasQueen) total += bonusBySuit[suit]!;
  }
  return total;
}

export function battleRealmContinuousBonus(state: EngineState, playerId: PlayerId): number {
  const spec = selectedBattleRealmSpec(state, playerId);
  if (spec === "Brilliance") {
    const count = qualifyingQueenIds(state, playerId).length;
    return count > 0 ? count + 1 : 0;
  }
  return beautyMarriageBonus(state, playerId);
}

export function deriveBattleRealmSecuredPoints(state: EngineState, playerId: PlayerId): number {
  return deriveSecuredPoints(state, playerId);
}

function useSignature(runtime: Phase12Runtime, playerId: PlayerId, expectedSpec: BattleRealmSpec, fullTurnSequence: number): string | null {
  if (runtime.selectedSpecByPlayer[playerId] !== expectedSpec) return `${playerId} does not have ${expectedSpec}`;
  const remaining = runtime.signatureUsesRemaining[playerId] ?? 0;
  if (remaining <= 0) return `${expectedSpec} Signature has no uses remaining`;
  if (expectedSpec === "Beauty" && runtime.beautyExtraLuckyUsedOnFullTurn[playerId] === fullTurnSequence) return "Beauty Extra Lucky may be used at most once per FT";
  runtime.signatureUsesRemaining[playerId] = remaining - 1;
  if (expectedSpec === "Beauty") runtime.beautyExtraLuckyUsedOnFullTurn[playerId] = fullTurnSequence;
  return null;
}

function useUltimate(runtime: Phase12Runtime, playerId: PlayerId, expectedSpec: BattleRealmSpec): string | null {
  if (runtime.selectedSpecByPlayer[playerId] !== expectedSpec) return `${playerId} does not have ${expectedSpec}`;
  if (runtime.ultimateUsedByPlayer[playerId] === true) return `${expectedSpec} Ultimate has already been used`;
  runtime.ultimateUsedByPlayer[playerId] = true;
  return null;
}

function ensureEnemy(state: EngineState, source: PlayerId, target: PlayerId): string | null {
  if (!state.players[source] || !state.players[target]) return "Both players must exist";
  return relationBetween(state, source, target) === "enemy" ? null : "Spec opponent text may target Enemies only";
}

export function resolvePhase12Action(input: EngineState, actorId: PlayerId, action: Phase12Action): Phase12Resolution {
  if (!input.players[actorId]) return fail("BATTLEREALM_PLAYER", `Unknown actor ${actorId}`);
  const state = canonicalClone(input);
  const runtime = phase12Runtime(state);
  const events: Phase12EventSpec[] = [];

  switch (action.kind) {
    case "configure-battle-realm": {
      const playerIds = Object.keys(state.players).sort();
      if (runtime.enabled || Object.keys(runtime.selectedSpecByPlayer).length > 0) return fail("BATTLEREALM_LOCKED", "Specs cannot change after BattleRealm configuration");
      if (playerIds.some((id) => action.specs[id] === undefined)) return fail("BATTLEREALM_SPEC", "Every player must select exactly one Spec");
      for (const [id, spec] of Object.entries(action.specs)) {
        if (!state.players[id]) return fail("BATTLEREALM_SPEC", `Unknown player ${id}`);
        if (!(spec in BATTLE_REALM_REGISTRY)) return fail("BATTLEREALM_SPEC", `Unknown Spec ${spec}`);
        runtime.selectedSpecByPlayer[id] = spec;
        runtime.signatureUsesRemaining[id] = BATTLE_REALM_REGISTRY[spec].signatureUses;
        runtime.ultimateUsedByPlayer[id] = false;
        runtime.beautyExtraLuckyUsedOnFullTurn[id] = null;
        runtime.brillianceCounterDistortionUsed[id] = false;
        runtime.beautyFirstTwoDiscardUsedOnFullTurn[id] = null;
      }
      runtime.enabled = true;
      runtime.specsRevealed = true;
      events.push({ type: "BATTLEREALM_SPECS_REVEALED", payload: { selectedSpecByPlayer: runtime.selectedSpecByPlayer } });
      break;
    }
    case "recalculate-continuous-bonuses": {
      if (!runtime.enabled) return fail("BATTLEREALM_DISABLED", "BattleRealm is not enabled");
      for (const id of Object.keys(state.players).sort()) runtime.continuousBonusByPlayer[id] = battleRealmContinuousBonus(state, id);
      runtime.lastResolution = { kind: action.kind, continuousBonusByPlayer: canonicalClone(runtime.continuousBonusByPlayer) };
      events.push({ type: "BATTLEREALM_CONTINUOUS_BONUSES_RECALCULATED", payload: { continuousBonusByPlayer: runtime.continuousBonusByPlayer } });
      break;
    }
    case "validate-reserved-combine":
      return fail("BATTLEREALM_RESERVED_COMBINE", `${action.combine} is reserved and has no executable effect definition`, { combine: action.combine, sourceCardIds: action.sourceCardIds });
    case "apply-goal-delta": {
      const player = state.players[action.playerId];
      if (!player) return fail("BATTLEREALM_PLAYER", `Unknown player ${action.playerId}`);
      const previousGoal = player.goal;
      player.goal = Math.max(5, player.goal + action.delta);
      runtime.lastResolution = { kind: action.kind, playerId: action.playerId, previousGoal, goal: player.goal };
      events.push({ type: "BATTLEREALM_GOAL_CHANGED", payload: { playerId: action.playerId, previousGoal, requestedDelta: action.delta, goal: player.goal, floor: 5 } });
      break;
    }
    case "grant-mini-turns": {
      const player = state.players[action.playerId];
      if (!player) return fail("BATTLEREALM_PLAYER", `Unknown player ${action.playerId}`);
      const previous = player.limits.miniTurnsRemaining;
      player.limits.miniTurnsRemaining = Math.min(3, previous + action.amount);
      events.push({ type: "BATTLEREALM_MINI_TURNS_GRANTED", payload: { playerId: action.playerId, requested: action.amount, previous, remaining: player.limits.miniTurnsRemaining, cap: 3 } });
      break;
    }
    case "register-limited-play": {
      const player = state.players[action.playerId];
      if (!player) return fail("BATTLEREALM_PLAYER", `Unknown player ${action.playerId}`);
      if (action.playClass === "ultra") {
        if (player.limits.ultraPlayedThisFT) return fail("BATTLEREALM_ULTRA_CAP", "BattleRealm cannot permit more than one Ultra per player per FT");
        player.limits.ultraPlayedThisFT = true;
      } else {
        if (player.limits.rank10PlayedThisFT) return fail("BATTLEREALM_RANK10_CAP", "BattleRealm cannot permit more than one Rank-10 effect per player per FT");
        player.limits.rank10PlayedThisFT = true;
      }
      events.push({ type: "BATTLEREALM_LIMITED_PLAY_REGISTERED", payload: { playerId: action.playerId, playClass: action.playClass } });
      break;
    }
    case "courageous-assault": {
      const reason = useSignature(runtime, actorId, "Bravery", state.fullTurnSequence);
      if (reason) return fail("BATTLEREALM_SIGNATURE", reason);
      const target = state.cards[action.targetCardId];
      if (!target || (!target.zone.endsWith("_PR") && !target.zone.endsWith("_ER"))) return fail("BATTLEREALM_TARGET", "Courageous Assault requires an enemy OTT target");
      const relationError = ensureEnemy(state, actorId, target.controllerId);
      if (relationError) return fail("BATTLEREALM_TARGET", relationError);
      if (hasAegis(target)) return fail("AEGIS_BLOCK", "Courageous Assault never bypasses Aegis");
      const from = target.zone;
      moveCard(state, target.id, "GY");
      runtime.lastResolution = { kind: action.kind, targetCardId: target.id, from, destination: "GY" };
      events.push({ type: "COURAGEOUS_ASSAULT_RESOLVED", payload: { playerId: actorId, targetCardId: target.id, from, destination: "GY", bypassed: ["rank","suit","guard","scuttle-immunity"], uncounterable: true, interruptCreatesSkip: false } });
      break;
    }
    case "extra-lucky": {
      const reason = useSignature(runtime, actorId, "Beauty", state.fullTurnSequence);
      if (reason) return fail("BATTLEREALM_SIGNATURE", reason);
      const drawn = state.cards[action.drawnCardId];
      if (!drawn || drawn.controllerId !== actorId || drawn.zone !== `${actorId}_HAND`) return fail("BATTLEREALM_DRAW", "Extra Lucky requires the just-drawn card in your hand");
      moveCard(state, drawn.id, "GY");
      let replacementCardId: CardId | null = null;
      if (action.sourcePosition === "dp-top" && state.zones.dp.length > 0) replacementCardId = state.zones.dp[0]!;
      if (action.sourcePosition === "dp-bottom" && state.zones.dp.length > 0) replacementCardId = state.zones.dp.at(-1)!;
      if (replacementCardId) moveCard(state, replacementCardId, `${actorId}_HAND`, actorId);
      runtime.lastResolution = { kind: action.kind, scrappedCardId: drawn.id, replacementCardId };
      events.push({ type: "EXTRA_LUCKY_RESOLVED", payload: { playerId: actorId, scrappedCardId: drawn.id, sourcePosition: action.sourcePosition, replacementCardId } });
      break;
    }
    case "mastermind": {
      const reason = useSignature(runtime, actorId, "Brilliance", state.fullTurnSequence);
      if (reason) return fail("BATTLEREALM_SIGNATURE", reason);
      const available = state.zones.dp.slice(0, Math.min(5, state.zones.dp.length));
      if (canonicalClone(available).sort().join("|") !== canonicalClone(action.inspectedCardIds).sort().join("|")) return fail("BATTLEREALM_MASTERMIND", "Inspected cards must be exactly the current top group");
      if (action.drawCardIds.length !== Math.min(2, available.length) || action.drawCardIds.some((id) => !available.includes(id))) return fail("BATTLEREALM_MASTERMIND", "Draw exactly two available inspected cards when possible");
      const remaining = available.filter((id) => !action.drawCardIds.includes(id));
      if (canonicalClone(remaining).sort().join("|") !== canonicalClone(action.returnOrder).sort().join("|")) return fail("BATTLEREALM_MASTERMIND", "Return order must contain every undrawn inspected card exactly once");
      if (action.viewerId !== undefined && ensureEnemy(state, actorId, action.viewerId)) return fail("BATTLEREALM_MASTERMIND", "The selected viewer must be an Enemy");
      for (const id of available) { const index = state.zones.dp.indexOf(id); if (index >= 0) state.zones.dp.splice(index, 1); state.cards[id]!.zone = "VOID"; }
      for (const id of action.drawCardIds) moveCard(state, id, `${actorId}_HAND`, actorId);
      for (const id of [...action.returnOrder].reverse()) { state.cards[id]!.zone = "DP"; state.zones.dp.unshift(id); }
      runtime.lastResolution = { kind: action.kind, drawCardIds: action.drawCardIds, viewerId: action.viewerId ?? null };
      events.push({ type: "MASTERMIND_RESOLVED", payload: { playerId: actorId, inspectedCount: available.length, drawnCount: action.drawCardIds.length, viewerId: action.viewerId ?? null } });
      events.push({ type: "MASTERMIND_PRIVATE_ORDER_RECORDED", payload: { inspectedCardIds: action.inspectedCardIds, drawCardIds: action.drawCardIds, returnOrder: action.returnOrder }, visibility: "authorized" });
      break;
    }
    case "counter-distortion": {
      if (runtime.selectedSpecByPlayer[action.defendingPlayerId] !== "Brilliance") return fail("BATTLEREALM_SPEC", "Counter Distortion requires Brilliance");
      if (runtime.brillianceCounterDistortionUsed[action.defendingPlayerId]) return fail("BATTLEREALM_PASSIVE", "Counter Distortion has already been used");
      if (ensureEnemy(state, action.defendingPlayerId, action.jackControllerId)) return fail("BATTLEREALM_TARGET", "Counter Distortion requires an enemy J Disrupt");
      let discardedJackId: CardId | null = null;
      if (action.discardJackId !== undefined) {
        const candidate = state.cards[action.discardJackId];
        if (!candidate || candidate.controllerId !== action.defendingPlayerId || candidate.zone !== `${action.defendingPlayerId}_HAND` || parseIdentity(candidate.identity)?.rank !== "J") return fail("BATTLEREALM_PASSIVE", "Discard selection must be a Jack in the defending player's hand");
        moveCard(state, candidate.id, "GY");
        discardedJackId = candidate.id;
      }
      let drawCardId: CardId | null = null;
      if (state.zones.dp.length > 0) { drawCardId = state.zones.dp[0]!; moveCard(state, drawCardId, `${action.jackControllerId}_HAND`, action.jackControllerId); }
      runtime.brillianceCounterDistortionUsed[action.defendingPlayerId] = true;
      runtime.lastResolution = { kind: action.kind, defendingPlayerId: action.defendingPlayerId, discardedJackId, drawCardId };
      events.push({ type: "COUNTER_DISTORTION_REPLACED_DISRUPT", payload: { defendingPlayerId: action.defendingPlayerId, jackControllerId: action.jackControllerId, discardedJackId, drawCardId, actionRestrictionApplied: false } });
      break;
    }
    case "goal-shock": {
      if (runtime.selectedSpecByPlayer[actorId] !== "Brilliance") return fail("BATTLEREALM_SPEC", "Goal Shock requires Brilliance");
      const changed: Record<PlayerId, number> = {};
      for (const id of action.enemyPlayerIds) {
        const reason = ensureEnemy(state, actorId, id);
        if (reason) return fail("BATTLEREALM_TARGET", reason);
        state.players[id]!.goal += 7;
        changed[id] = state.players[id]!.goal;
      }
      runtime.lastResolution = { kind: action.kind, changed };
      events.push({ type: "GOAL_SHOCK_RESOLVED", payload: { playerId: actorId, changedGoals: changed, interruptCreatesSkip: false } });
      break;
    }
    case "hard-jack": {
      if (runtime.selectedSpecByPlayer[actorId] !== "Bravery") return fail("BATTLEREALM_SPEC", "Hard Jack requires Bravery");
      const jack = state.cards[action.jackCardId];
      const host = state.cards[action.hostCardId];
      if (!jack || !host || jack.controllerId !== actorId || host.controllerId !== actorId || host.state.attachedByJackId !== jack.id) return fail("BATTLEREALM_ATTACHMENT", "Hard Jack requires your valid PR Jack Attachment");
      host.state.jackPointBonus = 2;
      host.state.hardJackLock = { controllerId: actorId, jackCardId: jack.id };
      runtime.lastResolution = { kind: action.kind, jackCardId: jack.id, hostCardId: host.id };
      events.push({ type: "HARD_JACK_APPLIED", payload: { playerId: actorId, jackCardId: jack.id, hostCardId: host.id, pointBonus: 2, rejackBlocked: true } });
      break;
    }
    case "harmonized-mimic": {
      const reason = useUltimate(runtime, actorId, "Balance");
      if (reason) return fail("BATTLEREALM_ULTIMATE", reason);
      if (action.keepCardIds.length > 5 || action.drawnCardIds.some((id) => !state.cards[id]) || action.keepCardIds.some((id) => !action.drawnCardIds.includes(id))) return fail("BATTLEREALM_ULTIMATE", "Harmonized Mimic may keep up to five cards drawn by the mimicked ⭐6");
      runtime.lastResolution = { kind: action.kind, drawnCardIds: action.drawnCardIds, keepCardIds: action.keepCardIds };
      events.push({ type: "HARMONIZED_MIMIC_APPLIED", payload: { playerId: actorId, drawnCount: action.drawnCardIds.length, keepCount: action.keepCardIds.length, maximum: 5 } });
      break;
    }
    case "chromatic-ten": {
      const reason = useUltimate(runtime, actorId, "Beauty");
      if (reason) return fail("BATTLEREALM_ULTIMATE", reason);
      const card = state.cards[action.cardId];
      if (!card || card.controllerId !== actorId || card.zone !== `${actorId}_HAND` || card.identity !== "10♥") return fail("BATTLEREALM_ULTIMATE", "Chromatic Ten requires your physical 10♥ in hand");
      if (state.players[actorId]!.limits.rank10PlayedThisFT) return fail("BATTLEREALM_RANK10_CAP", "Chromatic Ten remains subject to the Rank-10 limit");
      state.players[actorId]!.limits.rank10PlayedThisFT = true;
      card.state.chromaticTenAs = action.asSuit;
      runtime.lastResolution = { kind: action.kind, cardId: card.id, asSuit: action.asSuit };
      events.push({ type: "CHROMATIC_TEN_DECLARED", payload: { playerId: actorId, cardId: card.id, physicalIdentity: "10♥", treatedAs: `10${action.asSuit}`, rank10LimitConsumed: true } });
      break;
    }
    case "preserve-intercepted-play": {
      const item = state.stack.find((candidate) => candidate.id === action.stackItemId);
      if (!item) return fail("BATTLEREALM_STACK", "Intercepted generated play must remain pending");
      if (ensureEnemy(state, action.interceptorId, action.originalControllerId) !== null && action.interceptorId !== action.originalControllerId) return fail("BATTLEREALM_STACK", "Interceptor relation is invalid");
      item.controllerId = action.interceptorId;
      item.targetCardIds = [...action.replacementTargetIds];
      const preserved = canonicalClone(action.preservedModifierKeys);
      state.metadata.interceptedPlayProperties = { stackItemId: item.id, originalControllerId: action.originalControllerId, controllerId: action.interceptorId, preservedModifierKeys: preserved, controllerRelativeTermsUse: action.interceptorId };
      runtime.lastResolution = { kind: action.kind, stackItemId: item.id, preservedModifierKeys: preserved };
      events.push({ type: "INTERCEPTED_PLAY_PROPERTIES_PRESERVED", payload: { stackItemId: item.id, originalControllerId: action.originalControllerId, controllerId: action.interceptorId, replacementTargetIds: action.replacementTargetIds, preservedModifierKeys: preserved } });
      break;
    }
    case "complete-full-turn": {
      runtime.beautyExtraLuckyUsedOnFullTurn[action.playerId] = null;
      runtime.beautyFirstTwoDiscardUsedOnFullTurn[action.playerId] = null;
      events.push({ type: "BATTLEREALM_FULL_TURN_RESET", payload: { playerId: action.playerId, fullTurnSequence: state.fullTurnSequence } });
      break;
    }
  }

  for (const id of Object.keys(state.players).sort()) runtime.continuousBonusByPlayer[id] = battleRealmContinuousBonus(state, id);
  saveRuntime(state, runtime);
  return { ok: true, state, events };
}
