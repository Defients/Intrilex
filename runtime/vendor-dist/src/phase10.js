import { canonicalClone } from "./canonical-json.js";
import { hasAegis } from "./lifecycle.js";
import { moveCard } from "./state.js";
const TRAP_IDENTITIES = new Set(["4♠", "4♥", "4♦", "4♣", "5♠", "5♥", "5♦", "5♣"]);
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
export function trapRuntime(state) {
    const current = state.metadata.phase10;
    return {
        enabled: true,
        triggerUsedThisActiveFT: canonicalClone(current?.triggerUsedThisActiveFT ?? {}),
        module3CounterUsedFullTurnSequence: current?.module3CounterUsedFullTurnSequence ?? null,
        module3CounterPending: current?.module3CounterPending ?? false,
        completedFullTurnsByPlayer: canonicalClone(current?.completedFullTurnsByPlayer ?? {})
    };
}
function saveRuntime(state, runtime) {
    state.metadata.phase10 = runtime;
}
function boardLockActive(state) {
    const phase8 = state.metadata.phase8;
    return phase8?.boardLock !== null && phase8?.boardLock !== undefined;
}
function requireTrap(state, trapCardId) {
    const card = state.cards[trapCardId];
    if (!card)
        return { ok: false, reason: `Unknown Trap ${trapCardId}` };
    if (card.state.faceDownTrap !== true)
        return { ok: false, reason: `${trapCardId} is not a face-down Trap` };
    return { ok: true, card };
}
function disabledTrap(card) {
    const value = card.state.disabledTrap;
    if (typeof value !== "object" || value === null)
        return null;
    const candidate = value;
    return typeof candidate.counteringPlayerId === "string" && Number.isInteger(candidate.expiresAfterCompletedFullTurnSequence)
        ? candidate
        : null;
}
function controlledTrapCount(state, playerId) {
    const player = state.players[playerId];
    if (!player)
        return 0;
    return [...player.pr, ...player.er].filter((id) => state.cards[id]?.controllerId === playerId && state.cards[id]?.state.faceDownTrap === true).length;
}
function revealAndScrap(state, trapCardId) {
    const card = state.cards[trapCardId];
    card.state.faceDownTrap = false;
    delete card.state.disabledTrap;
    moveCard(state, trapCardId, "GY");
}
function clearOpponentPrForTotalPressure(state, opponentId) {
    const player = state.players[opponentId];
    if (!player)
        return [];
    const cleared = [];
    for (const id of [...player.pr]) {
        const card = state.cards[id];
        if (!card || hasAegis(card))
            continue;
        moveCard(state, id, "GY");
        cleared.push(id);
    }
    return cleared;
}
function expireDisabledTraps(state, playerId, completedCount) {
    const expired = [];
    for (const card of Object.values(state.cards)) {
        const disabled = disabledTrap(card);
        if (!disabled || disabled.counteringPlayerId !== playerId || disabled.expiresAfterCompletedFullTurnSequence > completedCount)
            continue;
        delete card.state.disabledTrap;
        expired.push(card.id);
    }
    return expired;
}
export function validateTrapPlacement(state, actorId, cardId, row) {
    if (boardLockActive(state))
        return "Board Lock prohibits Trap placement";
    const card = state.cards[cardId];
    if (!card || card.controllerId !== actorId || card.zone !== `${actorId}_HAND`)
        return "Trap source must be controlled in hand";
    if (controlledTrapCount(state, actorId) >= 2)
        return "A player may control at most two Traps OTT";
    if (row !== "pr" && row !== "er")
        return "Trap row must be PR or ER";
    return null;
}
export function resolvePhase10Action(input, actorId, action) {
    if (!input.players[actorId])
        return fail("PHASE10_PLAYER", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    const runtime = trapRuntime(state);
    const events = [];
    switch (action.kind) {
        case "place-trap": {
            const problem = validateTrapPlacement(state, actorId, action.cardId, action.row);
            if (problem)
                return fail("TRAP_PLACEMENT", problem);
            const destination = action.row === "pr" ? `${actorId}_PR` : `${actorId}_ER`;
            moveCard(state, action.cardId, destination, actorId);
            state.cards[action.cardId].state.faceDownTrap = true;
            events.push({ type: "TRAP_PLACED", payload: { playerId: actorId, row: action.row, trapCardId: action.cardId }, visibility: "authorized" });
            break;
        }
        case "check-trigger": {
            const found = requireTrap(state, action.trapCardId);
            if (!found.ok)
                return fail("TRAP_TRIGGER", found.reason);
            if (boardLockActive(state))
                return fail("TRAP_SUPPRESSED", "Board Lock suppresses Trap triggers");
            if (disabledTrap(found.card))
                return fail("TRAP_DISABLED", "Disabled Trap cannot trigger");
            if (action.duringAtomicResolution)
                return fail("TRAP_ATOMIC", "Trap cannot trigger during atomic resolution");
            if (!action.qualifyingEvent)
                return fail("TRAP_INELIGIBLE", "Trap condition is not satisfied");
            if (runtime.triggerUsedThisActiveFT[found.card.controllerId] === true)
                return fail("TRAP_TRIGGER_LIMIT", "Trap trigger limit already used this active FT");
            runtime.triggerUsedThisActiveFT[found.card.controllerId] = true;
            events.push({ type: "TRAP_TRIGGER_DETECTED", payload: { trapCardId: action.trapCardId, controllerId: found.card.controllerId, eventKey: action.eventKey } });
            break;
        }
        case "resolve-total-pressure": {
            const found = requireTrap(state, action.trapCardId);
            if (!found.ok || found.card.identity !== "4♠")
                return fail("TRAP_IDENTITY", "Total Pressure requires a face-down 4♠ Trap");
            if (boardLockActive(state))
                return fail("TRAP_SUPPRESSED", "Board Lock suppresses Trap triggers");
            const clearedCardIds = clearOpponentPrForTotalPressure(state, action.opponentId);
            revealAndScrap(state, action.trapCardId);
            events.push({ type: "TRAP_REVEALED", payload: { trapCardId: action.trapCardId, identity: "4♠", trapEffect: "total-pressure" } });
            events.push({ type: "TOTAL_PRESSURE_RESOLVED", payload: { opponentId: action.opponentId, clearedCardIds, erUnaffected: true } });
            break;
        }
        case "declare-combo": {
            if (!action.recipeDefined)
                return fail("COMBO_UNDEFINED", "Undefined Combo recipe is illegal before Trap detection", { sourceCardIds: action.sourceCardIds });
            if (!action.sourceCardIds.every((id) => state.cards[id]?.zone === `${actorId}_HAND` && state.cards[id]?.controllerId === actorId))
                return fail("COMBO_SOURCE", "Every Combo source must be controlled in hand");
            events.push({ type: "DEFINED_COMBO_DECLARED", payload: { actorId, sourceCardIds: action.sourceCardIds, initiatorCardId: action.initiatorCardId } });
            break;
        }
        case "reveal-trap-as-effect": {
            const found = requireTrap(state, action.trapCardId);
            if (!found.ok)
                return fail("TRAP_REVEAL", found.reason);
            const identity = found.card.identity;
            revealAndScrap(state, action.trapCardId);
            events.push({ type: "TRAP_REVEALED", payload: { trapCardId: action.trapCardId, identity, resolvesAsPlay: false } });
            events.push({ type: "TRAP_EFFECT_RESOLVED", payload: { trapCardId: action.trapCardId, createsOnPlayModifier: false } });
            break;
        }
        case "module3-counter": {
            const found = requireTrap(state, action.trapCardId);
            if (!found.ok)
                return fail("TRAP_COUNTER", found.reason);
            const counter = state.cards[action.counterCardId];
            if (!counter || counter.controllerId !== actorId || counter.zone !== `${actorId}_HAND` || !/^(3♣|3♦|3♥)$/.test(counter.identity))
                return fail("TRAP_COUNTER_SOURCE", "Module-3 counter requires a controlled non-Spade 3 in hand");
            if (runtime.module3CounterPending || runtime.module3CounterUsedFullTurnSequence === state.fullTurnSequence)
                return fail("TRAP_COUNTER_LIMIT", "Global module-3 Trap counter limit already pending or used this FT");
            runtime.module3CounterPending = true;
            moveCard(state, action.counterCardId, "GY");
            found.card.state.disabledTrap = {
                counteringPlayerId: actorId,
                expiresAfterCompletedFullTurnSequence: (runtime.completedFullTurnsByPlayer[actorId] ?? 0) + 1
            };
            runtime.module3CounterPending = false;
            runtime.module3CounterUsedFullTurnSequence = state.fullTurnSequence;
            events.push({ type: "TRAP_EFFECT_COUNTERED_BY_MODULE3", payload: { counterCardId: action.counterCardId, trapCardId: action.trapCardId } });
            events.push({ type: "TRAP_DISABLED", payload: { trapCardId: action.trapCardId, counteringPlayerId: actorId, expiresAfterCompletedFullTurnSequence: (runtime.completedFullTurnsByPlayer[actorId] ?? 0) + 1 } });
            break;
        }
        case "complete-full-turn": {
            const playerId = action.playerId;
            if (!state.players[playerId])
                return fail("TRAP_TURN", `Unknown player ${playerId}`);
            const count = (runtime.completedFullTurnsByPlayer[playerId] ?? 0) + 1;
            runtime.completedFullTurnsByPlayer[playerId] = count;
            const enabledTrapIds = expireDisabledTraps(state, playerId, count);
            runtime.triggerUsedThisActiveFT = {};
            events.push({ type: "FULL_TURN_COMPLETED_FOR_TRAPS", payload: { playerId, completedCount: count, enabledTrapIds } });
            break;
        }
        case "resolve-jacked-points": {
            const found = requireTrap(state, action.trapCardId);
            if (!found.ok || found.card.identity !== "5♣")
                return fail("TRAP_IDENTITY", "Jacked Points requires a face-down 5♣ Trap");
            const scoreCard = state.cards[action.pendingScoreCardId];
            if (!scoreCard || scoreCard.zone !== `${action.scoringPlayerId}_HAND`)
                return fail("TRAP_PENDING_SCORE", "Scoring card must still be held as a pending non-stack declaration");
            revealAndScrap(state, action.trapCardId);
            events.push({ type: "PENDING_SCORE_CANCELLED_AND_REWOUND", payload: { cardId: action.pendingScoreCardId, scoringPlayerId: action.scoringPlayerId } });
            events.push({ type: "JACKED_POINTS_RESOLVED", payload: { trapCardId: action.trapCardId, nextAction: action.hasAlternativeAction ? "choose-alternative" : "pass" } });
            break;
        }
    }
    saveRuntime(state, runtime);
    return { ok: true, state, events };
}
//# sourceMappingURL=phase10.js.map