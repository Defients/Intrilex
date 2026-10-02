import { canonicalClone } from "./canonical-json.js";
import type {
  AegisState,
  CardId,
  CardInstance,
  EngineState,
  PlayerId,
  StartEventRef,
  TapState,
  ZoneName
} from "./types.js";

export interface LifecycleTransition {
  type: string;
  payload: Record<string, unknown>;
}

export function isHandZone(zone: ZoneName): boolean {
  return zone.endsWith("_HAND");
}

export function isOttZone(zone: ZoneName): boolean {
  return zone.endsWith("_PR") || zone.endsWith("_ER");
}

export function hasAegis(card: CardInstance): boolean {
  return card.state.aegis === true || (typeof card.state.aegis === "object" && card.state.aegis !== null);
}

export function startRefEqual(a: StartEventRef, b: StartEventRef): boolean {
  return a.playerId === b.playerId && a.startSequence === b.startSequence;
}

export function resolveDestination(card: CardInstance, requested: ZoneName): ZoneName {
  return requested === "GY" && card.state.exileBound === true ? "EXILE" : requested;
}

export function cleanupForZoneTransition(card: CardInstance, from: ZoneName, to: ZoneName): void {
  if (isHandZone(from) && from !== to) delete card.state.revealedUntil;
  if (from.endsWith("_PR") && !to.endsWith("_PR")) {
    delete card.state.timeBomb;
    delete card.state.timeBombStage;
    delete card.state.forcedDrawSource;
  }
  if (isOttZone(from) && !isOttZone(to)) {
    delete card.state.aegis;
    delete card.state.tapped;
    delete card.state.tapState;
    delete card.state.playedForEffect;
  }
}

export function canReceiveAegis(card: CardInstance): boolean {
  return !/^9(?:♣|♦|♥|♠)$/.test(card.identity);
}

export function applyAegis(card: CardInstance, sourceRef: string, expiresAt: StartEventRef): boolean {
  if (!canReceiveAegis(card)) return false;
  const aegis: AegisState = { sourceRef, expiresAt: canonicalClone(expiresAt) };
  card.state.aegis = aegis;
  return true;
}

export function applyTap(card: CardInstance, tapState: TapState): void {
  card.state.tapped = true;
  card.state.tapState = canonicalClone(tapState);
}

export function clearTap(card: CardInstance): void {
  delete card.state.tapped;
  delete card.state.tapState;
}

export function revealUntilStart(card: CardInstance, expiresAt: StartEventRef): void {
  card.state.revealedUntil = canonicalClone(expiresAt);
}

export function markPlayedForEffect(card: CardInstance, value: boolean): void {
  if (value) card.state.playedForEffect = true;
  else delete card.state.playedForEffect;
}

export function markExileBound(card: CardInstance): void {
  card.state.exileBound = true;
}

export function changeController(card: CardInstance, controllerId: PlayerId): void {
  card.controllerId = controllerId;
}

export function processStartPhaseLifecycles(state: EngineState, playerId: PlayerId): LifecycleTransition[] {
  const nextSequence = (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1;
  state.startPhaseSequenceByPlayer[playerId] = nextSequence;
  state.activePlayerId = playerId;
  state.phase = "Start";
  const eventRef: StartEventRef = { playerId, startSequence: nextSequence };
  const transitions: LifecycleTransition[] = [{ type: "START_PHASE_BEGAN", payload: { playerId, startSequence: nextSequence } }];

  for (const cardId of Object.keys(state.cards).sort()) {
    const card = state.cards[cardId]!;
    const aegis = card.state.aegis;
    if (typeof aegis === "object" && aegis !== null && startRefEqual(aegis.expiresAt, eventRef)) {
      const sourceRef = aegis.sourceRef;
      delete card.state.aegis;
      transitions.push({ type: "AEGIS_EXPIRED", payload: { cardId, sourceRef, expiry: eventRef } });
    }
    const tap = card.state.tapState;
    if (tap?.kind === "start-phase" && startRefEqual(tap.expiresAt, eventRef)) {
      clearTap(card);
      transitions.push({ type: "TAP_EXPIRED", payload: { cardId, sourceRef: tap.sourceRef, expiry: eventRef } });
    }
    const reveal = card.state.revealedUntil;
    if (reveal !== undefined && startRefEqual(reveal, eventRef)) {
      delete card.state.revealedUntil;
      transitions.push({ type: "REVEAL_EXPIRED", payload: { cardId, expiry: eventRef } });
    }
  }
  return transitions;
}

export function releaseNineTapsForScoring(state: EngineState, scoringPlayerId: PlayerId): LifecycleTransition[] {
  const transitions: LifecycleTransition[] = [];
  for (const cardId of Object.keys(state.cards).sort()) {
    const card = state.cards[cardId]!;
    if (card.controllerId !== scoringPlayerId || card.state.tapped !== true || card.state.tapState?.kind !== "nine-score") continue;
    const sourceRef = card.state.tapState.sourceRef;
    clearTap(card);
    transitions.push({ type: "NINE_TAP_RELEASED", payload: { cardId, scoringPlayerId, sourceRef } });
  }
  return transitions;
}

// 10♣ Foundation bonus rider: when the optional bonus score is used, the scorer's
// next Action Phase runs under a Mini-Turn hard cap of 1 and cannot initiate a
// Combo or a Super. The pending record is keyed to the controller's recorded next
// Start Phase (same anchor as the Aegis expiry); the active restriction is bound
// to that Full Turn so a countered-and-restored declaration still resumes inside
// the same restricted Action Phase, while a skipped Action Phase does not consume
// the restriction (phase13 re-arms the pending record instead).

export function armFoundationActionRestriction(state: EngineState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) return;
  player.limits.foundationRestrictionPending = {
    playerId,
    startSequence: (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1
  };
}

export function processFoundationActionRestriction(state: EngineState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (player === undefined) return false;
  const stale = player.limits.foundationActionRestriction;
  if (stale !== undefined && stale !== state.fullTurnSequence) delete player.limits.foundationActionRestriction;
  const pending = player.limits.foundationRestrictionPending;
  if (pending === undefined) return false;
  const eventRef: StartEventRef = { playerId, startSequence: state.startPhaseSequenceByPlayer[playerId] ?? 0 };
  if (!startRefEqual(pending, eventRef)) return false;
  delete player.limits.foundationRestrictionPending;
  player.limits.foundationActionRestriction = state.fullTurnSequence;
  return true;
}

export function foundationActionRestricted(state: Readonly<EngineState>, playerId: PlayerId): boolean {
  return state.players[playerId]?.limits.foundationActionRestriction === state.fullTurnSequence;
}

export function miniTurnHardCap(state: Readonly<EngineState>, playerId: PlayerId): number {
  return foundationActionRestricted(state, playerId) ? 1 : 3;
}
