import { canonicalClone } from "./canonical-json.js";
import { parseIdentity } from "./ranks.js";
import { moveCard } from "./state.js";
export const FIRST_CONTACT_PROFILE = Object.freeze({
    id: "first-contact",
    goal: 15,
    playerCount: 2,
    miniTurnsPerCompletedFullTurn: 1,
    allowedActions: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"],
    disabledSystems: [
        "swap-bar", "comboing", "supers", "reserved-advanced-classes", "ultras", "sudden-death",
        "aegis", "royal-shield", "exile", "revealed-until-start", "draw-and-cast", "voltage",
        "suit-specific-effects", "optional-modules"
    ],
    allowedGenericRanks: ["3", "4", "5", "6", "7", "8", "9", "J", "Q", "K", "RJ", "BJ"]
});
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
function runtimeFrom(overrideId) {
    return {
        active: true,
        profileId: "first-contact",
        teachingOverrideId: overrideId?.trim() ? overrideId.trim() : null,
        allowedActions: [...FIRST_CONTACT_PROFILE.allowedActions],
        disabledSystems: [...FIRST_CONTACT_PROFILE.disabledSystems]
    };
}
export function isFirstContact(state) {
    return state.metadata.firstContact?.active === true;
}
export function validateFirstContactConfiguration(enabledModules, teachingOverrideId) {
    const unique = [...new Set(enabledModules)];
    if (unique.length === 0)
        return null;
    if (teachingOverrideId?.trim())
        return null;
    return `First Contact cannot be combined with optional modules: ${unique.join(", ")}`;
}
export function validateFirstContactDeclaration(declarationClass, rank, effectKey) {
    if (declarationClass !== "generic-effect")
        return `First Contact disables ${declarationClass}`;
    if (!rank || !FIRST_CONTACT_PROFILE.allowedGenericRanks.includes(rank))
        return `Rank ${rank ?? "<missing>"} has no enabled generic First Contact effect`;
    if (effectKey?.includes("spade") || effectKey?.includes("suit") || effectKey?.includes("ultra") || effectKey?.includes("super"))
        return "Suit-specific and advanced effect keys are disabled in First Contact";
    return null;
}
function normalizeSetup(state, playerIds, teachingOverrideId) {
    if (state.turnOrder.length !== 2 || new Set(state.turnOrder).size !== 2)
        return "First Contact requires exactly two players";
    if (!playerIds.every((id) => state.players[id] !== undefined) || new Set(playerIds).size !== 2)
        return "First Contact setup requires two distinct known players";
    if (state.zones.swapBar.length > 0)
        return "First Contact has no Swap Bar";
    if (state.zones.exile.length > 0)
        return "First Contact setup cannot begin with cards in Exile";
    state.turnOrder = [...playerIds];
    state.activePlayerId = playerIds[0];
    for (const playerId of playerIds) {
        const player = state.players[playerId];
        player.goal = FIRST_CONTACT_PROFILE.goal;
        player.limits.miniTurnsUsed = 0;
        player.limits.miniTurnsRemaining = 1;
        player.limits.swapBarUsedThisFT = false;
        player.limits.rank10PlayedThisFT = false;
        player.limits.ultraPlayedThisFT = false;
    }
    state.metadata.firstContact = runtimeFrom(teachingOverrideId);
    return null;
}
function autoUntap(state, playerId) {
    const player = state.players[playerId];
    if (!player)
        return [];
    const untapped = [];
    for (const cardId of [...player.pr, ...player.er]) {
        const card = state.cards[cardId];
        if (!card || card.controllerId !== playerId || card.state.tapped !== true)
            continue;
        card.state.tapped = false;
        delete card.state.tapState;
        untapped.push(cardId);
    }
    player.limits.miniTurnsUsed = 0;
    player.limits.miniTurnsRemaining = 1;
    player.limits.swapBarUsedThisFT = false;
    player.limits.rank10PlayedThisFT = false;
    player.limits.ultraPlayedThisFT = false;
    return untapped;
}
function routeDestination(state, cardId, requested, controllerId) {
    const card = state.cards[cardId];
    if (!card)
        throw new Error(`Unknown card ${cardId}`);
    const profileDestination = requested === "EXILE" ? "GY" : requested;
    if (profileDestination === "GY" && card.state.exileBound === true)
        delete card.state.exileBound;
    return moveCard(state, cardId, profileDestination, controllerId);
}
export function resolvePhase9Action(input, actorId, action) {
    if (!input.players[actorId])
        return fail("PHASE9_PLAYER", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    const events = [];
    switch (action.kind) {
        case "validate-profile-configuration": {
            const problem = validateFirstContactConfiguration(action.enabledModules, action.teachingOverrideId);
            if (problem)
                return fail("FIRST_CONTACT_CONFIGURATION", problem, { enabledModules: action.enabledModules });
            state.metadata.firstContact = runtimeFrom(action.teachingOverrideId);
            events.push({ type: "FIRST_CONTACT_CONFIGURATION_VALIDATED", payload: { enabledModules: action.enabledModules, teachingOverrideId: action.teachingOverrideId ?? null } });
            break;
        }
        case "validate-declaration": {
            const problem = validateFirstContactDeclaration(action.declarationClass, action.rank, action.effectKey);
            if (problem)
                return fail("FIRST_CONTACT_DECLARATION", problem, { declarationClass: action.declarationClass, rank: action.rank ?? null, effectKey: action.effectKey ?? null, sourceCardIds: action.sourceCardIds ?? [] });
            if (action.sourceCardIds) {
                for (const cardId of action.sourceCardIds) {
                    const card = state.cards[cardId];
                    if (!card || card.controllerId !== actorId || card.zone !== `${actorId}_HAND`)
                        return fail("FIRST_CONTACT_SOURCE", `${cardId} is not a controlled hand source`);
                    const parsed = parseIdentity(card.identity);
                    if (parsed?.rank !== action.rank)
                        return fail("FIRST_CONTACT_SOURCE", `${cardId} does not match declared rank ${action.rank}`);
                }
            }
            events.push({ type: "FIRST_CONTACT_DECLARATION_VALIDATED", payload: { declarationClass: action.declarationClass, rank: action.rank ?? null, effectKey: action.effectKey ?? null } });
            break;
        }
        case "apply-setup": {
            const problem = normalizeSetup(state, action.playerIds, action.teachingOverrideId);
            if (problem)
                return fail("FIRST_CONTACT_SETUP", problem);
            events.push({ type: "FIRST_CONTACT_SETUP_APPLIED", payload: { playerIds: action.playerIds, goal: 15, miniTurns: 1 } });
            break;
        }
        case "begin-start": {
            if (!state.players[action.playerId])
                return fail("FIRST_CONTACT_START", `Unknown player ${action.playerId}`);
            if (!isFirstContact(state))
                return fail("FIRST_CONTACT_INACTIVE", "First Contact profile is not active");
            state.phase = "Start";
            state.activePlayerId = action.playerId;
            state.startPhaseSequenceByPlayer[action.playerId] = (state.startPhaseSequenceByPlayer[action.playerId] ?? 0) + 1;
            const untappedCardIds = autoUntap(state, action.playerId);
            events.push({ type: "FIRST_CONTACT_START_COMPLETED", payload: { playerId: action.playerId, untappedCardIds, miniTurnsRemaining: 1 } });
            break;
        }
        case "route-destination": {
            if (!isFirstContact(state))
                return fail("FIRST_CONTACT_INACTIVE", "First Contact profile is not active");
            const from = state.cards[action.cardId]?.zone;
            if (!from)
                return fail("FIRST_CONTACT_CARD", `Unknown card ${action.cardId}`);
            const actualDestination = routeDestination(state, action.cardId, action.requestedDestination, action.controllerId);
            events.push({ type: "FIRST_CONTACT_DESTINATION_ROUTED", payload: { cardId: action.cardId, from, requestedDestination: action.requestedDestination, actualDestination } });
            break;
        }
        case "grant-mini-turns": {
            if (!isFirstContact(state))
                return fail("FIRST_CONTACT_INACTIVE", "First Contact profile is not active");
            const player = state.players[action.playerId];
            if (!player)
                return fail("FIRST_CONTACT_PLAYER", `Unknown player ${action.playerId}`);
            const before = player.limits.miniTurnsRemaining;
            player.limits.miniTurnsRemaining = Math.min(1, player.limits.miniTurnsRemaining);
            events.push({ type: "FIRST_CONTACT_MINI_TURN_GRANT_IGNORED", payload: { playerId: action.playerId, requestedAmount: action.amount, before, after: player.limits.miniTurnsRemaining } });
            break;
        }
        case "enter-hand": {
            if (!isFirstContact(state))
                return fail("FIRST_CONTACT_INACTIVE", "First Contact profile is not active");
            if (!state.players[action.playerId])
                return fail("FIRST_CONTACT_PLAYER", `Unknown player ${action.playerId}`);
            const card = state.cards[action.cardId];
            if (!card)
                return fail("FIRST_CONTACT_CARD", `Unknown card ${action.cardId}`);
            delete card.state.revealedUntil;
            routeDestination(state, action.cardId, `${action.playerId}_HAND`, action.playerId);
            events.push({ type: "FIRST_CONTACT_HAND_ENTRY", payload: { cardId: action.cardId, playerId: action.playerId, revealed: false } });
            break;
        }
    }
    return { ok: true, state, events };
}
//# sourceMappingURL=phase9.js.map