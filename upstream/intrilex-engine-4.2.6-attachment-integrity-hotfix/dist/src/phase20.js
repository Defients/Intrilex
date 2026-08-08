import { canonicalClone } from "./canonical-json.js";
import { moveCard } from "./state.js";
import { parseIdentity, rankDefinition } from "./ranks.js";
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
function inHand(state, playerId, cardId) {
    return state.cards[cardId]?.zone === `${playerId}_HAND` && state.cards[cardId]?.controllerId === playerId;
}
function rank(state, cardId) {
    return parseIdentity(state.cards[cardId]?.identity ?? "")?.rank ?? null;
}
function resolveSuperSevenSingle(input, actorId, action) {
    const state = canonicalClone(input);
    if (action.sourceCardIds.length !== 2 || new Set(action.sourceCardIds).size !== 2 || action.sourceCardIds.some((id) => !inHand(state, actorId, id) || rank(state, id) !== "7")) {
        return fail("PHASE20_SEVEN_SOURCE", "⭐7 requires two distinct Sevens controlled in hand");
    }
    if (state.zones.dp[0] !== action.childCardId || state.cards[action.childCardId] === undefined) {
        return fail("PHASE20_SEVEN_CHILD", "The certified one-card ⭐7 projection requires the sole top DP card");
    }
    if (state.zones.dp.length !== 1)
        return fail("PHASE20_SEVEN_COUNT", "This canonical closure case requires exactly one available DP card");
    const child = state.cards[action.childCardId];
    for (const sourceId of action.sourceCardIds)
        moveCard(state, sourceId, "GY");
    moveCard(state, child.id, "GY", actorId);
    state.metadata.phase20 = {
        ...state.metadata.phase20,
        lastSequentialSeven: {
            sourceCardIds: [...action.sourceCardIds],
            revealedCardIds: [child.id],
            suspended: true,
            childResolved: true,
            parentResumed: true,
            absentSecondChildCreated: false
        }
    };
    return {
        ok: true,
        state,
        events: [
            { type: "SUPER_SEVEN_SUSPENDED", payload: { sourceCardIds: action.sourceCardIds, childCardId: child.id } },
            { type: "SUPER_SEVEN_CHILD_RESOLVED", payload: { childCardId: child.id, destination: "GY" } },
            { type: "SUPER_SEVEN_RESUMED", payload: { remainingChildCount: 0 } }
        ]
    };
}
function resolveSuperFive(input, actorId, action) {
    const state = canonicalClone(input);
    if (action.sourceCardIds.length !== 2 || new Set(action.sourceCardIds).size !== 2 || action.sourceCardIds.some((id) => !inHand(state, actorId, id) || rank(state, id) !== "5")) {
        return fail("PHASE20_FIVE_SOURCE", "⭐5 requires two distinct Fives controlled in hand");
    }
    const revealed = state.zones.dp.slice(0, Math.min(3, state.zones.dp.length));
    if (!revealed.includes(action.chosenCardId))
        return fail("PHASE20_FIVE_CHOICE", "⭐5 may play only a card milled by this effect");
    for (const id of revealed)
        moveCard(state, id, "GY");
    const chosen = state.cards[action.chosenCardId];
    if (action.disposition === "points") {
        const parsed = parseIdentity(chosen.identity);
        if (!parsed)
            return fail("PHASE20_FIVE_IDENTITY", "Chosen card identity is not canonical");
        chosen.state.pointValue = rankDefinition(chosen).prPoints;
        moveCard(state, chosen.id, `${actorId}_PR`, actorId);
    }
    else {
        moveCard(state, chosen.id, "GY", actorId);
        chosen.state.phase20GeneratedEffect = true;
    }
    for (const sourceId of action.sourceCardIds)
        moveCard(state, sourceId, "GY");
    state.metadata.phase20 = {
        ...state.metadata.phase20,
        lastSuperFive: { sourceCardIds: [...action.sourceCardIds], milledCardIds: revealed, chosenCardId: chosen.id, disposition: action.disposition, exileConsulted: false }
    };
    return {
        ok: true,
        state,
        events: [
            { type: "SUPER_FIVE_MILLED", payload: { cardIds: revealed } },
            { type: "SUPER_FIVE_CARD_PLAYED", payload: { cardId: chosen.id, disposition: action.disposition } }
        ]
    };
}
function consumeSkippedTurnSlot(input, actorId) {
    const state = canonicalClone(input);
    const player = state.players[actorId];
    if (!player)
        return fail("PHASE20_PLAYER", `Unknown player ${actorId}`);
    if (state.activePlayerId !== actorId)
        return fail("PHASE20_TURN", "Only the scheduled active player's slot may be skipped");
    if (player.limits.pendingFullTurnSkips < 1)
        return fail("PHASE20_SKIP", "No pending Full-Turn skip exists");
    const before = {
        fullTurnSequence: state.fullTurnSequence,
        startPhaseSequenceByPlayer: canonicalClone(state.startPhaseSequenceByPlayer),
        phase: state.phase,
        limits: canonicalClone(player.limits),
        timers: canonicalClone(state.metadata.phase8 ?? null)
    };
    player.limits.pendingFullTurnSkips -= 1;
    const index = state.turnOrder.indexOf(actorId);
    state.activePlayerId = state.turnOrder[(index + 1) % state.turnOrder.length] ?? actorId;
    state.phase = "BetweenTurns";
    state.metadata.phase20 = {
        ...state.metadata.phase20,
        lastSkippedTurnSlot: {
            playerId: actorId,
            nextPlayerId: state.activePlayerId,
            fullTurnSequenceUnchanged: state.fullTurnSequence === before.fullTurnSequence,
            startSequencesUnchanged: JSON.stringify(state.startPhaseSequenceByPlayer) === JSON.stringify(before.startPhaseSequenceByPlayer),
            timersUnchanged: JSON.stringify(state.metadata.phase8 ?? null) === JSON.stringify(before.timers),
            perFtStateReset: false
        }
    };
    return { ok: true, state, events: [{ type: "TURN_SLOT_SKIPPED", payload: { playerId: actorId, nextPlayerId: state.activePlayerId, fullTurnOccurred: false } }] };
}
export function resolvePhase20Action(input, actorId, action) {
    switch (action.kind) {
        case "resolve-super-seven-single": return resolveSuperSevenSingle(input, actorId, action);
        case "resolve-super-five": return resolveSuperFive(input, actorId, action);
        case "consume-skipped-turn-slot": return consumeSkippedTurnSlot(input, actorId);
    }
}
//# sourceMappingURL=phase20.js.map