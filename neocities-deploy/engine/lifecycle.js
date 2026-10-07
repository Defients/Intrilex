import { canonicalClone } from "./canonical-json.js?v=5c298831b65d";
import { resolveRuleNumber } from "./rule-parameters.js?v=5c298831b65d";
export function isHandZone(zone) {
    return zone.endsWith("_HAND");
}
export function isOttZone(zone) {
    return zone.endsWith("_PR") || zone.endsWith("_ER");
}
export function hasAegis(card) {
    return card.state.aegis === true || (typeof card.state.aegis === "object" && card.state.aegis !== null);
}
export function startRefEqual(a, b) {
    return a.playerId === b.playerId && a.startSequence === b.startSequence;
}
export function resolveDestination(card, requested) {
    return requested === "GY" && card.state.exileBound === true ? "EXILE" : requested;
}
export function cleanupForZoneTransition(card, from, to) {
    if (isHandZone(from) && from !== to)
        delete card.state.revealedUntil;
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
export function canReceiveAegis(card) {
    return !/^9(?:♣|♦|♥|♠)$/.test(card.identity);
}
export function applyAegis(card, sourceRef, expiresAt) {
    if (!canReceiveAegis(card))
        return false;
    const aegis = { sourceRef, expiresAt: canonicalClone(expiresAt) };
    card.state.aegis = aegis;
    return true;
}
export function applyTap(card, tapState) {
    card.state.tapped = true;
    card.state.tapState = canonicalClone(tapState);
}
export function clearTap(card) {
    delete card.state.tapped;
    delete card.state.tapState;
}
export function revealUntilStart(card, expiresAt) {
    card.state.revealedUntil = canonicalClone(expiresAt);
}
export function markPlayedForEffect(card, value) {
    if (value)
        card.state.playedForEffect = true;
    else
        delete card.state.playedForEffect;
}
export function markExileBound(card) {
    card.state.exileBound = true;
}
export function changeController(card, controllerId) {
    card.controllerId = controllerId;
}
export function processStartPhaseLifecycles(state, playerId) {
    const nextSequence = (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1;
    state.startPhaseSequenceByPlayer[playerId] = nextSequence;
    state.activePlayerId = playerId;
    state.phase = "Start";
    const eventRef = { playerId, startSequence: nextSequence };
    const transitions = [{ type: "START_PHASE_BEGAN", payload: { playerId, startSequence: nextSequence } }];
    for (const cardId of Object.keys(state.cards).sort()) {
        const card = state.cards[cardId];
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
export function releaseNineTapsForScoring(state, scoringPlayerId) {
    const transitions = [];
    for (const cardId of Object.keys(state.cards).sort()) {
        const card = state.cards[cardId];
        if (card.controllerId !== scoringPlayerId || card.state.tapped !== true || card.state.tapState?.kind !== "nine-score")
            continue;
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
export function armFoundationActionRestriction(state, playerId) {
    const player = state.players[playerId];
    if (!player)
        return;
    player.limits.foundationRestrictionPending = {
        playerId,
        startSequence: (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1
    };
}
export function processFoundationActionRestriction(state, playerId) {
    const player = state.players[playerId];
    if (player === undefined)
        return false;
    const stale = player.limits.foundationActionRestriction;
    if (stale !== undefined && stale !== state.fullTurnSequence)
        delete player.limits.foundationActionRestriction;
    const pending = player.limits.foundationRestrictionPending;
    if (pending === undefined)
        return false;
    const eventRef = { playerId, startSequence: state.startPhaseSequenceByPlayer[playerId] ?? 0 };
    if (!startRefEqual(pending, eventRef))
        return false;
    delete player.limits.foundationRestrictionPending;
    player.limits.foundationActionRestriction = state.fullTurnSequence;
    return true;
}
export function foundationActionRestricted(state, playerId) {
    return state.players[playerId]?.limits.foundationActionRestriction === state.fullTurnSequence;
}
export function miniTurnHardCap(state, playerId) {
    // Foundation restriction hard-caps Mini-Turns at 1 regardless of overrides —
    // the restriction penalty is part of the 10♣ rule, not the cap parameter.
    return foundationActionRestricted(state, playerId) ? 1 : resolveRuleNumber(state, "miniTurns.hardCap");
}
//# sourceMappingURL=lifecycle.js.map