import { canonicalClone } from "./canonical-json.js";
import { applyAegis, applyTap, markExileBound, processStartPhaseLifecycles, releaseNineTapsForScoring, revealUntilStart } from "./lifecycle.js";
import { CORE_EFFECT_DECLARATION_PROFILE, resolveCoreEffect } from "./core-effects.js";
import { evaluateProtection, revalidateAttachments } from "./interactions.js";
import { CORE_RESPONSE_AUTHORITY_PROFILE, primaryDescriptor } from "./core-response.js";
import { CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, activeCorePrivateChoice, isCorePrivateChoiceEffect, resolveCorePrivateChoiceRoot, resolveCorePrivateChoiceSubmission } from "./core-private-choice.js";
import { compareScuttle, cardPointValue, hasOrdinaryScuttleImmunity, parseIdentity, resolveRankAction } from "./ranks.js";
import { nextIndex } from "./rng.js";
import { addCard, deriveSecuredPoints, moveCard } from "./state.js";
import { exhaustedWinner } from "./phase8.js";
import { CORE_ADVANCED_AUTHORITY_PROFILE, CORE_UNRESTRICTED_AUTHORITY_PROFILE, advancedSourceIds, advancedTargetIds, resolveAdvancedCoreAction } from "./core-advanced.js";
export const CORE_FOUNDATION_AUTHORITY_PROFILE = Object.freeze({
    id: "core-foundation-authority",
    displayName: "Core Foundation Authority — Setup, Swap Bar & Action Economy",
    rulesVersion: "4.1.2",
    engineVersion: "4.2.0",
    playerCount: 2,
    goal: 21,
    enabledModules: [],
    supportedActions: ["face-down-swap", "draw", "face-up-swap", "play-for-points", "scuttle", "exhausted-pass"],
    excludedSystems: ["effect-plays", "draw-and-cast", "quick-plays", "responses", "voltage", "rank10-effects", "supers", "ultras", "royal-marriage", "sudden-death", "optional-modules", "multiplayer"],
    rationale: "Canonical two-player Core setup and action-economy foundation. Every supported transition is engine-owned; advanced effect and response systems fail closed."
});
const SUITS = ["♣", "♦", "♥", "♠"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
function runtime(state) {
    const value = state.metadata.coreAuthority;
    return value && typeof value === "object" ? value : null;
}
function isSupportedCoreProfile(profileId) {
    return profileId === CORE_FOUNDATION_AUTHORITY_PROFILE.id || profileId === CORE_EFFECT_DECLARATION_PROFILE.id || profileId === CORE_RESPONSE_AUTHORITY_PROFILE.id || profileId === CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id || profileId === CORE_ADVANCED_AUTHORITY_PROFILE.id || profileId === CORE_UNRESTRICTED_AUTHORITY_PROFILE.id;
}
function requireRuntime(state) {
    const value = runtime(state);
    return value && isSupportedCoreProfile(value.profileId) && value.setupComplete ? value : "A supported Core Authority profile is not active";
}
function shuffledDeck(seed) {
    const identities = [...SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`)), "RJ", "BJ"];
    const rng = { algorithm: "xorshift32", seed: seed >>> 0, cursor: 0 };
    for (let index = identities.length - 1; index > 0; index -= 1) {
        const selected = nextIndex(rng, index + 1);
        [identities[index], identities[selected]] = [identities[selected], identities[index]];
    }
    return { identities, rng };
}
function setupCoreState(state, playerIds, seed, profileId) {
    if (Object.keys(state.cards).length > 0)
        throw new Error("Core setup requires an empty card registry");
    const { identities, rng } = shuffledDeck(seed);
    state.rng = rng;
    for (const [index, identity] of identities.entries()) {
        addCard(state, { id: `CORE-${String(index + 1).padStart(3, "0")}`, identity, originalOwnerId: playerIds[index % 2], zone: "DP" });
    }
    for (let count = 0; count < 5; count += 1)
        moveCard(state, state.zones.dp[0], `${playerIds[0]}_HAND`, playerIds[0]);
    for (let count = 0; count < 6; count += 1)
        moveCard(state, state.zones.dp[0], `${playerIds[1]}_HAND`, playerIds[1]);
    for (let count = 0; count < 3; count += 1) {
        const cardId = state.zones.dp[0];
        moveCard(state, cardId, "SWAP_BAR");
        state.cards[cardId].state.swapBarFaceDown = count < 2;
        state.cards[cardId].state.swapBarFaceUp = count === 2;
    }
    state.turnOrder = [...playerIds];
    state.activePlayerId = playerIds[0];
    state.phase = "Start";
    state.fullTurnSequence = 1;
    for (const id of playerIds) {
        state.players[id].goal = 21;
        state.players[id].limits.miniTurnsUsed = 0;
        state.players[id].limits.miniTurnsRemaining = 1;
        state.players[id].limits.swapBarUsedThisFT = false;
        state.players[id].limits.rank10PlayedThisFT = false;
        state.players[id].limits.ultraPlayedThisFT = false;
    }
    state.metadata.coreAuthority = {
        profileId,
        setupComplete: true,
        startPreparedFullTurnSequence: null,
        exhausted: null,
        disruptedActionTypesByPlayer: Object.fromEntries(playerIds.map((id) => [id, []])),
        qQuickResolvedFullTurnByPlayer: Object.fromEntries(playerIds.map((id) => [id, 0])),
        privateChoice: null
    };
}
function captureCoreVoltageSnapshot(state, playerId) {
    const values = { rank3: 0, rank4: 0, rank5: 0 };
    for (const id of state.players[playerId].pr) {
        const card = state.cards[id], r = card ? parseIdentity(card.identity)?.rank : null;
        if (!card || card.controllerId !== playerId || card.state.tapped === true)
            continue;
        const v = typeof card.state.pointValue === "number" ? card.state.pointValue : cardPointValue(card);
        if (r === "3")
            values.rank3 += v;
        if (r === "4")
            values.rank4 += v;
        if (r === "5")
            values.rank5 += v;
    }
    const snapshot = { ...values, capturedFullTurnSequence: state.fullTurnSequence };
    const phase8 = (state.metadata.phase8 && typeof state.metadata.phase8 === "object" ? state.metadata.phase8 : {});
    phase8.voltageSnapshots ??= {};
    phase8.voltageUsedThisFT ??= {};
    phase8.voltageSnapshots[playerId] = snapshot;
    phase8.voltageUsedThisFT[playerId] = { "3": false, "4": false, "5": false };
    state.metadata.phase8 = phase8;
    return snapshot;
}
function consumeMiniTurn(state, actorId) {
    const core = runtime(state);
    const ownerId = core?.resolvingMiniTurnOwnerId ?? actorId;
    const player = state.players[ownerId];
    player.limits.miniTurnsUsed += 1;
    player.limits.miniTurnsRemaining = Math.max(0, player.limits.miniTurnsRemaining - 1);
    if (player.limits.miniTurnsRemaining === 0)
        state.phase = "End";
}
function isResponseRuntime(state) { const id = runtime(state)?.profileId; return id === CORE_RESPONSE_AUTHORITY_PROFILE.id || id === CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id || id === CORE_ADVANCED_AUTHORITY_PROFILE.id || id === CORE_UNRESTRICTED_AUTHORITY_PROFILE.id; }
function openPriorityAfter(state, controllerId) {
    const start = (state.turnOrder.indexOf(controllerId) + 1) % state.turnOrder.length;
    state.priority = { order: [...state.turnOrder], index: start, consecutivePasses: 0, open: true };
}
function validatePriorityHolder(state, actorId) {
    if (!isResponseRuntime(state))
        return "Core Response Authority profile is not active";
    const priority = state.priority;
    if (!priority?.open)
        return "No Core response priority window is open";
    if (priority.order[priority.index] !== actorId)
        return `${actorId} does not hold Core response priority`;
    return null;
}
function topStackItem(state, id) {
    const top = state.stack.at(-1);
    return top?.id === id ? top : null;
}
function rankActionSourceIds(action) {
    switch (action.kind) {
        case "ace-counter": return [...action.sourceCardIds];
        case "commandeer": return [...action.sourceCardIds];
        case "solo-wild-copy": return [action.sourceCardId];
        case "total-clear": return [action.sourceCardId];
        case "row-exchange": return [...action.sourceCardIds];
        case "recycle-five": return [action.sourceCardId];
        case "deep-draw-six-spade": return [action.sourceCardId];
        case "topdeck-seven": return [action.sourceCardId];
        case "aegis-field-eight": return [action.sourceCardId];
        case "goal-shift-nine": return [action.sourceCardId];
        case "mimic-ten-diamond": return [action.sourceCardId];
        case "foundation-ten-club": return [action.sourceCardId];
        case "stack-theft-ten-spade": return [action.sourceCardId];
        case "attach-jack": return [action.sourceCardId];
        case "queen-anchor": return [action.sourceCardId];
        case "royal-marriage": return [action.kingCardId, action.queenCardId];
        case "red-joker-self-reset": return [action.sourceCardId];
        case "black-joker-board-lock": return [action.sourceCardId];
        case "ordinary-scuttle": return [action.sourceCardId];
        case "absolute-scuttle": return [...action.sourceCardIds];
    }
}
function rankActionTargetIds(action) {
    switch (action.kind) {
        case "commandeer": return [action.targetCardId];
        case "solo-wild-copy":
            if (action.copiedAction.kind === "three-bounce")
                return [action.copiedAction.targetCardId];
            return [];
        case "total-clear": return [];
        case "row-exchange": return [];
        case "recycle-five": return [];
        case "deep-draw-six-spade": return [];
        case "topdeck-seven": return [];
        case "aegis-field-eight": return [];
        case "goal-shift-nine": return [];
        case "mimic-ten-diamond": return [];
        case "foundation-ten-club": return [];
        case "stack-theft-ten-spade": return [];
        case "attach-jack": return [action.targetCardId];
        case "queen-anchor": return [];
        case "royal-marriage": return [];
        case "red-joker-self-reset": return [];
        case "black-joker-board-lock": return [];
        case "ordinary-scuttle": return [action.targetCardId];
        case "absolute-scuttle": return [action.targetCardId];
        default: return [];
    }
}
function primarySourceIds(action) {
    switch (action.kind) {
        case "core-score": return [action.cardId];
        case "core-scuttle": return [action.sourceCardId];
        case "core-resolve-effect":
        case "core-resolve-generated-effect": return [action.effect.sourceCardId];
        case "core-resolve-advanced": return advancedSourceIds(action.advanced);
        case "core-resolve-rank-action": return rankActionSourceIds(action.action);
        default: return [];
    }
}
function primaryTargetIds(action) {
    switch (action.kind) {
        case "core-scuttle": return [action.targetCardId];
        case "core-resolve-effect":
        case "core-resolve-generated-effect": return "targetCardId" in action.effect ? [action.effect.targetCardId] : [];
        case "core-resolve-advanced": return advancedTargetIds(action.advanced);
        case "core-resolve-rank-action": return rankActionTargetIds(action.action);
        default: return [];
    }
}
function declareCoreStackItem(state, actorId, tag, sourceCardIds, targetCardIds, payload) {
    for (const cardId of sourceCardIds)
        moveCard(state, cardId, "ON_STACK", actorId);
    const item = {
        id: `CORE-SI-${String(state.revision).padStart(6, "0")}-${actorId}-${tag}-${state.stack.length}`,
        controllerId: actorId,
        sourceCardIds: [...sourceCardIds], targetCardIds: [...targetCardIds], kind: `core-${payload.kind}`,
        revalidationClass: targetCardIds.length === 1 ? "single-required-target" : "none", instructions: [], sourceDestination: "GY", status: "pending", coreAuthority: payload
    };
    state.stack.push(item);
    openPriorityAfter(state, actorId);
    return item;
}
function sendCoreStackSources(state, item, destination = "GY") {
    const moved = [];
    for (const id of item.sourceCardIds)
        if (state.cards[id]?.zone === "ON_STACK") {
            moveCard(state, id, destination);
            moved.push(id);
        }
    return moved;
}
function reopenCorePriority(state, controllerId) {
    if (state.stack.length > 0)
        openPriorityAfter(state, controllerId);
    else
        state.priority = null;
}
function coreRank(state, cardId) { return parseIdentity(state.cards[cardId]?.identity ?? "")?.rank ?? null; }
function coreSuit(state, cardId) { return parseIdentity(state.cards[cardId]?.identity ?? "")?.suit ?? null; }
function responseSourceProblem(state, actorId, cardId, rank, allowAnchor = false) {
    const card = state.cards[cardId];
    if (!card || card.controllerId !== actorId)
        return `${cardId} is not controlled by ${actorId}`;
    if (coreRank(state, cardId) !== rank)
        return `${cardId} is not rank ${rank}`;
    const hand = card.zone === `${actorId}_HAND`;
    const anchor = allowAnchor && card.zone === `${actorId}_ER` && card.state.playedForEffect === true;
    return hand || anchor ? null : `${cardId} is not an eligible response source`;
}
function targetAcceptsBaseAce(target) {
    const payload = target.coreAuthority;
    if (!payload)
        return false;
    if (payload.kind === "primary")
        return ["ordinary-effect", "anchor"].includes(payload.stackClass);
    return !["spade-ace-counter", "eight-spade-free-scuttle", "ultra-three-red"].includes(payload.responseKind);
}
function targetAcceptsSpadeAce(target) {
    const payload = target.coreAuthority;
    if (!payload)
        return false;
    if (payload.kind === "primary")
        return ["ordinary-effect", "anchor"].includes(payload.stackClass);
    return !["spade-ace-counter", "eight-spade-free-scuttle", "ultra-three-red"].includes(payload.responseKind);
}
function restoreDeclaredPrimary(state, item) {
    for (const id of item.sourceCardIds)
        if (state.cards[id]?.zone === "ON_STACK")
            moveCard(state, id, `${item.controllerId}_HAND`, item.controllerId);
    const declaringPlayerId = item.coreAuthority?.kind === "primary" ? item.coreAuthority.declaringPlayerId : item.controllerId;
    const player = state.players[declaringPlayerId];
    player.limits.miniTurnsUsed = Math.max(0, player.limits.miniTurnsUsed - 1);
    player.limits.miniTurnsRemaining += 1;
    state.phase = "Action";
}
function finishCounteredCoreRoot(state) { state.priority = null; state.phase = "End"; }
function validateActionWindow(state, actorId) {
    const core = requireRuntime(state);
    if (typeof core === "string")
        return core;
    if (state.winner !== null || core.terminalReason)
        return "Core match is already terminal";
    const stolenController = runtime(state)?.resolvingStolenControllerId;
    if (state.activePlayerId !== actorId && stolenController !== actorId)
        return `${actorId} is not the active player`;
    if (state.phase !== "Action")
        return `Core action requires Action phase; found ${state.phase}`;
    if (state.stack.length > 0 || state.pendingDeclaration !== null || state.priority?.open === true || state.triggerQueue.length > 0 || activeCorePrivateChoice(state) !== null)
        return "Core Foundation action cannot begin while advanced game objects or private choices are pending";
    if (state.players[actorId].limits.miniTurnsRemaining <= 0)
        return "No Mini-Turn remains";
    return null;
}
export function resolveCoreAuthorityAction(input, actorId, action) {
    if (!input.players[actorId])
        return fail("CORE_PLAYER", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    const events = [];
    switch (action.kind) {
        case "core-apply-setup": {
            if (action.playerIds.length !== 2 || new Set(action.playerIds).size !== 2 || !action.playerIds.every((id) => state.players[id]))
                return fail("CORE_SETUP_PLAYERS", "Core setup requires two distinct known players");
            const profileId = action.profileId ?? CORE_FOUNDATION_AUTHORITY_PROFILE.id;
            if (!isSupportedCoreProfile(profileId))
                return fail("CORE_PROFILE", `Unsupported Core profile ${profileId}`);
            try {
                setupCoreState(state, action.playerIds, state.rng.seed, profileId);
            }
            catch (error) {
                return fail("CORE_SETUP", error instanceof Error ? error.message : String(error));
            }
            events.push({ type: "CORE_FOUNDATION_SETUP_APPLIED", payload: { profileId, playerIds: action.playerIds, goals: 21, handSizes: [5, 6], swapBar: { faceDown: 2, faceUp: 1 }, dpCount: state.zones.dp.length } });
            break;
        }
        case "core-begin-start": {
            const core = requireRuntime(state);
            if (typeof core === "string")
                return fail("CORE_PROFILE", core);
            if (state.phase !== "Start" || state.activePlayerId !== actorId || action.playerId !== actorId)
                return fail("CORE_START", "Start preparation requires the active player in Start phase");
            if (core.startPreparedFullTurnSequence === state.fullTurnSequence)
                return fail("CORE_START", "Start phase is already prepared for this Full Turn");
            const player = state.players[actorId];
            player.limits.miniTurnsUsed = 0;
            player.limits.miniTurnsRemaining = 1;
            player.limits.swapBarUsedThisFT = false;
            player.limits.rank10PlayedThisFT = false;
            player.limits.ultraPlayedThisFT = false;
            const clearedDisruptions = [...(core.disruptedActionTypesByPlayer?.[actorId] ?? [])];
            core.disruptedActionTypesByPlayer ??= {};
            core.disruptedActionTypesByPlayer[actorId] = [];
            if (core.profileId === CORE_ADVANCED_AUTHORITY_PROFILE.id || core.profileId === CORE_UNRESTRICTED_AUTHORITY_PROFILE.id) {
                const snapshot = captureCoreVoltageSnapshot(state, actorId);
                events.push({ type: "VOLTAGE_SNAPSHOT_CAPTURED", payload: { playerId: actorId, snapshot } });
            }
            const transitions = processStartPhaseLifecycles(state, actorId);
            if (state.zones.dp.length === 0 && core.exhausted === null) {
                core.exhausted = { remaining: 3, startedFullTurnSequence: state.fullTurnSequence };
                events.push({ type: "CORE_EXHAUSTED_BEGAN", payload: { ...core.exhausted } });
            }
            core.startPreparedFullTurnSequence = state.fullTurnSequence;
            events.push({ type: "CORE_START_PREPARED", payload: { playerId: actorId, fullTurnSequence: state.fullTurnSequence, automaticUntap: false } });
            if (clearedDisruptions.length > 0)
                events.push({ type: "CORE_JACK_DISRUPTIONS_CLEARED", payload: { playerId: actorId, disruptedActionTypes: clearedDisruptions } });
            events.push(...transitions.map((entry) => ({ type: entry.type, payload: entry.payload })));
            break;
        }
        case "core-face-down-swap": {
            const core = requireRuntime(state);
            if (typeof core === "string")
                return fail("CORE_PROFILE", core);
            const player = state.players[actorId];
            if (state.phase !== "Start" || state.activePlayerId !== actorId || core.startPreparedFullTurnSequence !== state.fullTurnSequence)
                return fail("CORE_SWAP_WINDOW", "Face-Down Swap requires the prepared active Start phase");
            if (player.limits.swapBarUsedThisFT)
                return fail("CORE_SWAP_LIMIT", "Swap Bar use is already spent this FT");
            const hand = state.cards[action.handCardId];
            const bar = state.cards[action.swapCardId];
            if (!hand || hand.zone !== `${actorId}_HAND` || hand.controllerId !== actorId)
                return fail("CORE_SWAP_HAND", "Face-Down Swap requires one controlled hand card");
            if (!bar || bar.zone !== "SWAP_BAR" || bar.state.swapBarFaceDown !== true)
                return fail("CORE_SWAP_BAR", "Selected Swap Bar card is not face-down");
            moveCard(state, action.handCardId, "SWAP_BAR");
            hand.state.swapBarFaceDown = false;
            hand.state.swapBarFaceUp = true;
            moveCard(state, action.swapCardId, `${actorId}_HAND`, actorId);
            delete bar.state.swapBarFaceDown;
            delete bar.state.swapBarFaceUp;
            player.limits.swapBarUsedThisFT = true;
            events.push({ type: "CORE_FACE_DOWN_SWAP_RESOLVED", payload: { playerId: actorId, offeredCardId: action.handCardId, takenCardId: action.swapCardId }, visibility: "authorized" });
            break;
        }
        case "core-enter-action": {
            const core = requireRuntime(state);
            if (typeof core === "string")
                return fail("CORE_PROFILE", core);
            if (state.phase !== "Start" || state.activePlayerId !== actorId || core.startPreparedFullTurnSequence !== state.fullTurnSequence)
                return fail("CORE_ACTION_ENTRY", "Action entry requires a prepared Start phase");
            state.phase = "Action";
            events.push({ type: "CORE_ACTION_PHASE_ENTERED", payload: { playerId: actorId, miniTurnsRemaining: state.players[actorId].limits.miniTurnsRemaining } });
            break;
        }
        case "core-draw": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            if (state.zones.dp.length === 0)
                return fail("CORE_DRAW_EMPTY", "Cannot draw from an empty DP");
            const count = state.players[actorId].hand.length === 0 ? Math.min(2, state.zones.dp.length) : 1;
            const drawnCardIds = [];
            for (let index = 0; index < count; index += 1) {
                const id = state.zones.dp[0];
                moveCard(state, id, `${actorId}_HAND`, actorId);
                drawnCardIds.push(id);
            }
            consumeMiniTurn(state, actorId);
            events.push({ type: "CORE_DRAW_RESOLVED", payload: { playerId: actorId, count, drawnCardIds }, visibility: "authorized" });
            break;
        }
        case "core-face-up-swap-draw": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            const player = state.players[actorId];
            if (player.limits.swapBarUsedThisFT)
                return fail("CORE_SWAP_LIMIT", "Face-Up Swap Bar Draw is unavailable after Face-Down Swap this FT");
            const card = state.cards[action.swapCardId];
            if (!card || card.zone !== "SWAP_BAR" || card.state.swapBarFaceUp !== true)
                return fail("CORE_SWAP_BAR", "Selected Swap Bar card is not face-up");
            moveCard(state, action.swapCardId, `${actorId}_HAND`, actorId);
            delete card.state.swapBarFaceUp;
            delete card.state.swapBarFaceDown;
            player.limits.swapBarUsedThisFT = true;
            consumeMiniTurn(state, actorId);
            events.push({ type: "CORE_FACE_UP_SWAP_DRAW_RESOLVED", payload: { playerId: actorId, cardId: action.swapCardId } });
            break;
        }
        case "core-score": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            const card = state.cards[action.cardId];
            if (!card || card.zone !== `${actorId}_HAND` || card.controllerId !== actorId)
                return fail("CORE_SCORE_SOURCE", "Play for Points requires a controlled hand card");
            if ((runtime(state)?.profileId === CORE_ADVANCED_AUTHORITY_PROFILE.id || runtime(state)?.profileId === CORE_UNRESTRICTED_AUTHORITY_PROFILE.id) && (coreRank(state, card.id) === "7" || card.identity === "10♣" || card.identity === "BJ"))
                return fail("CORE_SCORING_RIDER_UNSUPPORTED", `${card.identity} requires an uncertified scoring rider in the Advanced Core profile`);
            card.state.pointValue = cardPointValue(card);
            moveCard(state, action.cardId, `${actorId}_PR`, actorId);
            const released = releaseNineTapsForScoring(state, actorId);
            consumeMiniTurn(state, actorId);
            events.push({ type: "CORE_CARD_SCORED", payload: { playerId: actorId, cardId: action.cardId, pointValue: card.state.pointValue } });
            events.push(...released.map((entry) => ({ type: entry.type, payload: entry.payload })));
            break;
        }
        case "core-scuttle": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            if (state.metadata.boardLock?.turnsRemaining > 0)
                return fail("CORE_BOARD_LOCK", "Board Lock prohibits Scuttle");
            const source = state.cards[action.sourceCardId];
            const target = state.cards[action.targetCardId];
            if (!source || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("CORE_SCUTTLE_SOURCE", "Scuttle source must be controlled in hand");
            if (!target || !target.zone.endsWith("_PR") || target.controllerId === actorId)
                return fail("CORE_SCUTTLE_TARGET", "Scuttle target must be an enemy PR card");
            if (target.state.aegis)
                return fail("AEGIS_BLOCK", "Aegis blocks Scuttle");
            if (hasOrdinaryScuttleImmunity(target))
                return fail("SCUTTLE_IMMUNITY", `${target.identity} has ordinary Scuttle immunity`);
            if (compareScuttle(source, target) <= 0)
                return fail("CORE_SCUTTLE_RANK", "Scuttle source must outrank target by rank or suit");
            moveCard(state, source.id, "GY");
            moveCard(state, target.id, "GY");
            events.push(...revalidateAttachments(state).map((entry) => ({ type: entry.type, payload: entry.payload })));
            consumeMiniTurn(state, actorId);
            events.push({ type: "CORE_SCUTTLE_RESOLVED", payload: { playerId: actorId, sourceCardId: source.id, targetCardId: target.id } });
            break;
        }
        case "core-resolve-effect": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            if (state.metadata.boardLock?.turnsRemaining > 0)
                return fail("CORE_BOARD_LOCK", "Board Lock prohibits non-counter effect plays");
            const resolved = isCorePrivateChoiceEffect(action.effect)
                ? resolveCorePrivateChoiceRoot(state, actorId, action.effect)
                : resolveCoreEffect(state, actorId, action.effect);
            if (!resolved.ok)
                return resolved;
            consumeMiniTurn(resolved.state, actorId);
            return { ok: true, state: resolved.state, events: resolved.events };
        }
        case "core-resolve-generated-effect": {
            if (!isResponseRuntime(state))
                return fail("CORE_RESPONSE_PROFILE", "Generated Core effects require a response-capable profile");
            if (state.metadata.boardLock?.turnsRemaining > 0)
                return fail("CORE_BOARD_LOCK", "Board Lock prohibits generated non-counter effect plays");
            const source = state.cards[action.effect.sourceCardId];
            if (!source || source.controllerId !== actorId || source.zone !== `${actorId}_HAND`)
                return fail("CORE_GENERATED_SOURCE", "Generated Core effect source must be controlled in hand");
            const resolved = isCorePrivateChoiceEffect(action.effect)
                ? resolveCorePrivateChoiceRoot(state, actorId, action.effect)
                : resolveCoreEffect(state, actorId, action.effect);
            if (!resolved.ok)
                return resolved;
            return { ok: true, state: resolved.state, events: resolved.events };
        }
        case "core-resolve-advanced": {
            const isVoltage = action.advanced.kind.startsWith("advanced-voltage-");
            if (isVoltage) {
                const core = requireRuntime(state);
                if (typeof core === "string" || (core.profileId !== CORE_ADVANCED_AUTHORITY_PROFILE.id && core.profileId !== CORE_UNRESTRICTED_AUTHORITY_PROFILE.id))
                    return fail("CORE_ADVANCED_PROFILE", "Advanced Core Authority profile is not active");
                if (state.activePlayerId !== actorId || state.phase !== "Start" || core.startPreparedFullTurnSequence !== state.fullTurnSequence)
                    return fail("VOLTAGE_WINDOW", "Voltage requires the prepared active Start phase");
                const resolved = resolveAdvancedCoreAction(state, actorId, action.advanced);
                if (!resolved.ok)
                    return resolved;
                return resolved;
            }
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            if (state.metadata.boardLock?.turnsRemaining > 0)
                return fail("CORE_BOARD_LOCK", "Board Lock prohibits advanced non-counter plays");
            const resolved = resolveAdvancedCoreAction(state, actorId, action.advanced);
            if (!resolved.ok)
                return resolved;
            consumeMiniTurn(resolved.state, actorId);
            return resolved;
        }
        case "core-resolve-rank-action": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            if (state.metadata.boardLock?.turnsRemaining > 0)
                return fail("CORE_BOARD_LOCK", "Board Lock prohibits non-counter rank action plays");
            const resolved = resolveRankAction(state, actorId, action.action);
            if (!resolved.ok)
                return { ok: false, code: resolved.code, message: resolved.message, details: resolved.details };
            consumeMiniTurn(resolved.state, actorId);
            return { ok: true, state: resolved.state, events: resolved.events };
        }
        case "core-exhausted-pass": {
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            const core = requireRuntime(state);
            if (typeof core === "string")
                return fail("CORE_RUNTIME", core);
            if (!core.exhausted || state.zones.dp.length !== 0)
                return fail("CORE_EXHAUSTED_PASS", "Exhausted Pass requires active Exhausted with an empty Draw Pile");
            consumeMiniTurn(state, actorId);
            events.push({ type: "CORE_EXHAUSTED_PASS_RESOLVED", payload: { playerId: actorId, semanticClass: "mini-turn-action" } });
            break;
        }
        case "core-declare-primary": {
            if (!isResponseRuntime(state))
                return fail("CORE_RESPONSE_PROFILE", "Core Response Authority profile is not active");
            const problem = validateActionWindow(state, actorId);
            if (problem)
                return fail("CORE_ACTION", problem);
            const probe = resolveCoreAuthorityAction(state, actorId, action.action);
            if (!probe.ok)
                return probe;
            const descriptor = primaryDescriptor(action.action);
            const sources = primarySourceIds(action.action), targets = primaryTargetIds(action.action);
            consumeMiniTurn(state, actorId);
            const item = declareCoreStackItem(state, actorId, `ROOT-${descriptor.actionType}`, sources, targets, { kind: "primary", action: canonicalClone(action.action), declaringPlayerId: actorId, actionType: descriptor.actionType, stackClass: descriptor.stackClass });
            events.push({ type: "CORE_ACTION_DECLARED", payload: { stackItemId: item.id, playerId: actorId, actionType: descriptor.actionType, stackClass: descriptor.stackClass, sourceCardIds: sources, targetCardIds: targets } });
            break;
        }
        case "core-pass-priority": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const priority = state.priority;
            priority.consecutivePasses += 1;
            priority.index = (priority.index + 1) % priority.order.length;
            events.push({ type: action.semantic === "DECLINE_RESPONSE" ? "CORE_RESPONSE_DECLINED" : "CORE_AUTOMATIC_PRIORITY_ADVANCE", payload: { playerId: actorId, consecutiveDeclines: priority.consecutivePasses, semanticClass: action.semantic === "DECLINE_RESPONSE" ? "response-decline" : "engine-orchestration" } });
            if (priority.consecutivePasses >= priority.order.length) {
                priority.open = false;
                events.push({ type: "CORE_RESPONSE_WINDOW_CLOSED", payload: { stackDepth: state.stack.length, reason: "consecutive-declines-or-no-response", semanticClass: "engine-orchestration" } });
            }
            break;
        }
        case "core-declare-base-ace-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "A", action.sourceMode === "anchor");
            if (sourceProblem)
                return fail("CORE_COUNTER_SOURCE", sourceProblem);
            const source = state.cards[action.sourceCardId];
            if (action.sourceMode === "hand" && coreSuit(state, source.id) === "♠")
                return fail("CORE_COUNTER_SOURCE", "A♠ must use Exile Counter authority");
            if (action.sourceMode === "anchor" && source.zone !== `${actorId}_ER`)
                return fail("CORE_COUNTER_SOURCE", "Anchor Ace must be sacrificed from ER");
            const target = topStackItem(state, action.targetStackItemId);
            if (!target || !targetAcceptsBaseAce(target))
                return fail("CORE_COUNTER_TARGET", "Base/Anchor Ace requires the current eligible ordinary effect or counter");
            if (action.sourceMode === "anchor" && target.controllerId === actorId)
                return fail("CORE_COUNTER_TARGET", "Anchor Ace counters an opponent play");
            const item = declareCoreStackItem(state, actorId, action.sourceMode === "anchor" ? "ANCHOR-ACE" : "BASE-ACE", [source.id], [], { kind: "response", responseKind: action.sourceMode === "anchor" ? "anchor-ace-counter" : "base-ace-counter", targetStackItemId: target.id });
            events.push({ type: "CORE_ACE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: source.id, sourceMode: action.sourceMode } });
            break;
        }
        case "core-declare-spade-ace-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "A");
            if (sourceProblem || coreSuit(state, action.sourceCardId) !== "♠")
                return fail("CORE_COUNTER_SOURCE", sourceProblem ?? "Exile Counter requires A♠");
            const target = topStackItem(state, action.targetStackItemId);
            if (!target || !targetAcceptsSpadeAce(target))
                return fail("CORE_COUNTER_TARGET", "A♠ requires the current eligible ordinary play");
            const item = declareCoreStackItem(state, actorId, "SPADE-ACE", [action.sourceCardId], [], { kind: "response", responseKind: "spade-ace-counter", targetStackItemId: target.id, counterDestination: "EXILE" });
            events.push({ type: "CORE_SPADE_ACE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "core-declare-eight-scuttle-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "8");
            if (sourceProblem)
                return fail("CORE_COUNTER_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            const payload = target?.coreAuthority;
            const isScuttle = payload?.kind === "primary" ? payload.stackClass === "scuttle" : payload?.responseKind === "eight-spade-free-scuttle";
            if (!target || !isScuttle)
                return fail("CORE_COUNTER_TARGET", "Eight Scuttle Counter requires the current pending Scuttle");
            const item = declareCoreStackItem(state, actorId, "EIGHT-COUNTER", [action.sourceCardId], [], { kind: "response", responseKind: "eight-scuttle-counter", targetStackItemId: target.id });
            events.push({ type: "CORE_EIGHT_SCUTTLE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "core-declare-king-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "K");
            if (sourceProblem)
                return fail("CORE_COUNTER_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            const payload = target?.coreAuthority;
            if (!target || payload?.kind !== "primary" || payload.stackClass !== "anchor" || target.sourceCardIds.length !== 1)
                return fail("CORE_COUNTER_TARGET", "King requires the current single-card Anchor play");
            const item = declareCoreStackItem(state, actorId, "KING-COUNTER", [action.sourceCardId], [], { kind: "response", responseKind: "king-anchor-counter", targetStackItemId: target.id });
            events.push({ type: "CORE_KING_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "core-declare-jack-disrupt": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "J");
            if (sourceProblem)
                return fail("CORE_DISRUPT_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            const payload = target?.coreAuthority;
            if (!target || payload?.kind !== "primary" || target.controllerId === actorId)
                return fail("CORE_DISRUPT_TARGET", "Jack Disrupt requires the opponent's current Mini-Turn Action declaration");
            const item = declareCoreStackItem(state, actorId, "JACK-DISRUPT", [action.sourceCardId], [], { kind: "response", responseKind: "jack-disrupt", targetStackItemId: target.id, disruptedActionType: payload.actionType });
            events.push({ type: "CORE_JACK_DISRUPT_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId, disruptedActionType: payload.actionType } });
            break;
        }
        case "core-declare-nine-tap": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "9");
            if (sourceProblem)
                return fail("CORE_INSTANT_SOURCE", sourceProblem);
            const target = state.cards[action.targetCardId];
            if (!target || !target.zone.endsWith("_PR") || target.controllerId === actorId)
                return fail("CORE_INSTANT_TARGET", "Nine Tap requires an opponent PR target");
            const protection = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "tap", bypasses: [] });
            if (!protection.legal)
                return fail("PROTECTION_BLOCK", `Nine Tap blocked by ${protection.blockedBy.join(", ")}`, protection);
            const item = declareCoreStackItem(state, actorId, "NINE-TAP", [action.sourceCardId], [target.id], { kind: "response", responseKind: "nine-tap", targetCardId: target.id });
            events.push({ type: "CORE_NINE_TAP_DECLARED", payload: { stackItemId: item.id, sourceCardId: action.sourceCardId, targetCardId: target.id } });
            break;
        }
        case "core-declare-eight-spade-free-scuttle": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "8");
            if (sourceProblem || coreSuit(state, action.sourceCardId) !== "♠")
                return fail("CORE_INSTANT_SOURCE", sourceProblem ?? "Free Scuttle requires 8♠");
            const target = state.cards[action.targetCardId];
            if (!target || !target.zone.endsWith("_PR") || target.controllerId === actorId || target.state.aegis || hasOrdinaryScuttleImmunity(target))
                return fail("CORE_INSTANT_TARGET", "8♠ requires a legal enemy PR target");
            const item = declareCoreStackItem(state, actorId, "EIGHT-SPADE-SCUTTLE", [action.sourceCardId], [target.id], { kind: "response", responseKind: "eight-spade-free-scuttle", targetCardId: target.id });
            events.push({ type: "CORE_EIGHT_SPADE_SCUTTLE_DECLARED", payload: { stackItemId: item.id, sourceCardId: action.sourceCardId, targetCardId: target.id } });
            break;
        }
        case "core-declare-eight-aegis-field": {
            if (!isResponseRuntime(state) || state.activePlayerId !== actorId || !["Start", "Action", "End"].includes(state.phase))
                return fail("CORE_QUICK_WINDOW", "Eight Quick requires the controller's own Full Turn");
            if (state.priority?.open === true && state.priority.order[state.priority.index] !== actorId)
                return fail("CORE_PRIORITY", `${actorId} does not hold priority`);
            if (state.priority?.open !== true && state.stack.length > 0)
                return fail("CORE_QUICK_WINDOW", "A Quick cannot enter a closed stack window");
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "8");
            if (sourceProblem)
                return fail("CORE_QUICK_SOURCE", sourceProblem);
            const item = declareCoreStackItem(state, actorId, "EIGHT-AEGIS-QUICK", [action.sourceCardId], [], { kind: "response", responseKind: "eight-aegis-field" });
            events.push({ type: "CORE_EIGHT_AEGIS_FIELD_DECLARED", payload: { stackItemId: item.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "core-declare-queen-aegis-quick": {
            if (!isResponseRuntime(state) || state.activePlayerId !== actorId || !["Start", "Action", "End"].includes(state.phase))
                return fail("CORE_QUICK_WINDOW", "Queen Quick requires the controller's own Full Turn");
            if (state.priority?.open === true && state.priority.order[state.priority.index] !== actorId)
                return fail("CORE_PRIORITY", `${actorId} does not hold priority`);
            const core = requireRuntime(state);
            if (typeof core === "string")
                return fail("CORE_PROFILE", core);
            if (core.qQuickResolvedFullTurnByPlayer?.[actorId] === state.fullTurnSequence)
                return fail("CORE_QUICK_LIMIT", "Queen Quick already resolved this FT");
            if (state.stack.some((entry) => entry.coreAuthority?.kind === "response" && entry.coreAuthority.responseKind === "queen-aegis-quick" && entry.controllerId === actorId))
                return fail("CORE_QUICK_LIMIT", "A Queen Quick is already pending");
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "Q");
            if (sourceProblem)
                return fail("CORE_QUICK_SOURCE", sourceProblem);
            const target = state.cards[action.targetCardId];
            if (!target || target.controllerId !== actorId || (!target.zone.endsWith("_PR") && !target.zone.endsWith("_ER")) || coreRank(state, target.id) === "9")
                return fail("CORE_QUICK_TARGET", "Queen Quick requires a friendly non-Nine OTT target");
            const item = declareCoreStackItem(state, actorId, "QUEEN-AEGIS-QUICK", [action.sourceCardId], [target.id], { kind: "response", responseKind: "queen-aegis-quick", targetCardId: target.id });
            events.push({ type: "CORE_QUEEN_AEGIS_QUICK_DECLARED", payload: { stackItemId: item.id, sourceCardId: action.sourceCardId, targetCardId: target.id } });
            break;
        }
        case "core-declare-super-ace-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const [a, b] = action.sourceCardIds;
            if (a === b || ![a, b].every((id) => state.cards[id]?.controllerId === actorId && state.cards[id]?.zone === `${actorId}_HAND` && coreRank(state, id) === "A"))
                return fail("CORE_SUPER_ACE_SOURCE", "⭐A requires two distinct Aces in hand");
            const target = topStackItem(state, action.targetStackItemId);
            if (!target)
                return fail("CORE_SUPER_ACE_TARGET", "⭐A requires the current pending item");
            const defendingQueens = state.players[target.controllerId].er.filter((id) => coreRank(state, id) === "Q" && state.cards[id]?.state.tapped !== true).length;
            if (defendingQueens >= 2)
                return fail("CORE_SUPER_ACE_DEFENSE", "Two untapped Queens prohibit ⭐A declaration");
            const item = declareCoreStackItem(state, actorId, "SUPER-ACE", [a, b], [], { kind: "response", responseKind: "super-ace-counter", targetStackItemId: target.id });
            events.push({ type: "CORE_SUPER_ACE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardIds: [a, b] } });
            break;
        }
        case "core-declare-king-spade-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "K");
            if (sourceProblem || coreSuit(state, action.sourceCardId) !== "♠")
                return fail("CORE_KING_SPADE_SOURCE", sourceProblem ?? "K♠ counter requires K♠");
            const target = topStackItem(state, action.targetStackItemId);
            const tp = target?.coreAuthority;
            const eligible = !!target && target.sourceCardIds.length >= 2 && !(tp?.kind === "primary" && tp.stackClass === "ultra") && !(tp?.kind === "response" && tp.responseKind === "ultra-three-red");
            if (!eligible)
                return fail("CORE_KING_SPADE_TARGET", "K♠ requires the current eligible multi-card non-Ultra play");
            const item = declareCoreStackItem(state, actorId, "KING-SPADE", [action.sourceCardId], [], { kind: "response", responseKind: "king-spade-counter", targetStackItemId: target.id });
            events.push({ type: "CORE_KING_SPADE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "core-declare-rank10-stack-theft": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "10");
            if (sourceProblem || coreSuit(state, action.sourceCardId) !== "♠")
                return fail("CORE_STACK_THEFT_SOURCE", sourceProblem ?? "Stack Theft requires 10♠");
            if (state.players[actorId].limits.rank10PlayedThisFT)
                return fail("CORE_RANK10_LIMIT", "Rank-10 effect limit already used this FT");
            const target = topStackItem(state, action.targetStackItemId);
            const tp = target?.coreAuthority;
            if (!target || tp?.kind !== "primary" || target.sourceCardIds.length !== 1 || !["ordinary-effect", "anchor", "rank10"].includes(tp.stackClass))
                return fail("CORE_STACK_THEFT_TARGET", "Stack Theft requires a pending single effect play");
            state.players[actorId].limits.rank10PlayedThisFT = true;
            const item = declareCoreStackItem(state, actorId, "RANK10-STACK-THEFT", [action.sourceCardId], [], { kind: "response", responseKind: "rank10-stack-theft", targetStackItemId: target.id });
            events.push({ type: "CORE_RANK10_STACK_THEFT_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId, interruptTax: false } });
            break;
        }
        case "core-declare-ultra-three-red": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("CORE_PRIORITY", problem);
            const ids = action.sourceCardIds;
            if (new Set(ids).size !== 3 || !ids.every((id) => state.cards[id]?.controllerId === actorId && state.cards[id]?.zone === `${actorId}_HAND` && ["♦", "♥"].includes(coreSuit(state, id) ?? "")))
                return fail("CORE_ULTRA_SOURCE", "3 Red Ultra requires three distinct red hand cards");
            if (state.players[actorId].limits.ultraPlayedThisFT)
                return fail("CORE_ULTRA_LIMIT", "Ultra limit already used this FT");
            const target = topStackItem(state, action.targetStackItemId);
            if (!target)
                return fail("CORE_ULTRA_TARGET", "3 Red Ultra requires a pending play");
            const defendingQueens = state.players[target.controllerId].er.filter((id) => coreRank(state, id) === "Q" && state.cards[id]?.state.tapped !== true).length;
            if (defendingQueens >= 2)
                return fail("CORE_ULTRA_TARGET", "3 Red Ultra uses Super Ace authority and cannot target a play defended by two untapped Queens");
            state.players[actorId].limits.ultraPlayedThisFT = true;
            const item = declareCoreStackItem(state, actorId, "ULTRA-THREE-RED", [...ids], [], { kind: "response", responseKind: "ultra-three-red", targetStackItemId: target.id });
            events.push({ type: "CORE_ULTRA_THREE_RED_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardIds: ids } });
            break;
        }
        case "core-resolve-response-top": {
            if (!isResponseRuntime(state))
                return fail("CORE_RESPONSE_PROFILE", "Core Response Authority profile is not active");
            if (state.priority?.open === true)
                return fail("CORE_PRIORITY_OPEN", "Cannot resolve while Core priority is open");
            const item = state.stack.at(-1), payload = item?.coreAuthority;
            if (!item || !payload)
                return fail("CORE_STACK", "No Core Authority stack item is available");
            if (payload.kind === "primary") {
                state.stack.pop();
                state.priority = null;
                restoreDeclaredPrimary(state, item);
                const coreRuntime = runtime(state);
                if (coreRuntime && payload.declaringPlayerId !== item.controllerId) {
                    coreRuntime.resolvingStolenControllerId = item.controllerId;
                    coreRuntime.resolvingMiniTurnOwnerId = payload.declaringPlayerId;
                }
                const resolved = resolveCoreAuthorityAction(state, item.controllerId, payload.action);
                if (resolved.ok) {
                    const rr = runtime(resolved.state);
                    if (rr) {
                        rr.resolvingStolenControllerId = null;
                        rr.resolvingMiniTurnOwnerId = null;
                    }
                }
                if (!resolved.ok) {
                    for (const id of item.sourceCardIds)
                        if (state.cards[id]?.zone === `${item.controllerId}_HAND`)
                            moveCard(state, id, "GY");
                    const player = state.players[payload.declaringPlayerId];
                    player.limits.miniTurnsUsed += 1;
                    player.limits.miniTurnsRemaining = Math.max(0, player.limits.miniTurnsRemaining - 1);
                    state.phase = "End";
                    events.push({ type: "CORE_ROOT_FIZZLED", payload: { stackItemId: item.id, actionType: payload.actionType, reasonCode: resolved.code } });
                    break;
                }
                events.push({ type: "CORE_ROOT_RESOLUTION_BEGAN", payload: { stackItemId: item.id, actionType: payload.actionType, stackClass: payload.stackClass } });
                events.push(...resolved.events);
                Object.assign(state, resolved.state);
                events.push({ type: "CORE_ROOT_RESOLVED", payload: { stackItemId: item.id, actionType: payload.actionType } });
                break;
            }
            state.stack.pop();
            let responseSources = [];
            if (payload.responseKind === "rank10-stack-theft") {
                const target = state.stack.find((entry) => entry.id === payload.targetStackItemId);
                if (!target)
                    return fail("CORE_STACK_THEFT_TARGET", "Stack Theft target is no longer pending");
                const originalControllerId = target.controllerId;
                target.controllerId = item.controllerId;
                state.players[item.controllerId].limits.pendingFullTurnSkips += 1;
                state.players[originalControllerId].limits.pendingFullTurnSkips += 1;
                for (const id of item.sourceCardIds)
                    if (state.cards[id]?.zone === "ON_STACK") {
                        markExileBound(state.cards[id]);
                        moveCard(state, id, "EXILE");
                        responseSources.push(id);
                    }
                events.push({ type: "CORE_RANK10_STACK_THEFT_RESOLVED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardIds: responseSources, originalControllerId, controllerId: item.controllerId, controllerSkipAdded: 1, originalCasterSkipAdded: 1, interruptTax: false } });
                reopenCorePriority(state, item.controllerId);
                break;
            }
            responseSources = sendCoreStackSources(state, item);
            if (payload.responseKind === "jack-disrupt") {
                const target = state.stack.find((entry) => entry.id === payload.targetStackItemId), targetPayload = target?.coreAuthority;
                if (!target || targetPayload?.kind !== "primary" || !payload.disruptedActionType)
                    return fail("CORE_DISRUPT_TARGET", "Jack Disrupt target is no longer pending");
                const core = requireRuntime(state);
                if (typeof core === "string")
                    return fail("CORE_PROFILE", core);
                core.disruptedActionTypesByPlayer ??= {};
                const list = core.disruptedActionTypesByPlayer[target.controllerId] ?? [];
                if (!list.includes(payload.disruptedActionType))
                    list.push(payload.disruptedActionType);
                core.disruptedActionTypesByPlayer[target.controllerId] = list;
                const drawn = [];
                if (state.zones.dp.length > 0) {
                    const id = state.zones.dp[0];
                    moveCard(state, id, `${item.controllerId}_HAND`, item.controllerId);
                    drawn.push(id);
                }
                events.push({ type: "CORE_JACK_DISRUPT_RESOLVED", payload: { stackItemId: item.id, targetStackItemId: target.id, disruptedPlayerId: target.controllerId, disruptedActionType: payload.disruptedActionType, sourceCardIds: responseSources, drawnCardIds: drawn } });
                reopenCorePriority(state, item.controllerId);
                break;
            }
            if (payload.responseKind === "nine-tap") {
                const target = payload.targetCardId ? state.cards[payload.targetCardId] : undefined;
                if (target && target.zone.endsWith("_PR") && target.controllerId !== item.controllerId) {
                    const protection = evaluateProtection(state, item.controllerId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "tap", bypasses: [] });
                    if (protection.legal)
                        applyTap(target, { kind: "nine-score", sourceRef: item.id });
                }
                events.push({ type: "CORE_NINE_TAP_RESOLVED", payload: { stackItemId: item.id, targetCardId: payload.targetCardId ?? null, sourceCardIds: responseSources } });
                reopenCorePriority(state, item.controllerId);
                break;
            }
            if (payload.responseKind === "eight-spade-free-scuttle") {
                const target = payload.targetCardId ? state.cards[payload.targetCardId] : undefined;
                let removed = false;
                if (target && target.zone.endsWith("_PR") && target.controllerId !== item.controllerId && !target.state.aegis && !hasOrdinaryScuttleImmunity(target)) {
                    moveCard(state, target.id, "GY");
                    removed = true;
                    events.push(...revalidateAttachments(state).map((entry) => ({ type: entry.type, payload: entry.payload })));
                }
                events.push({ type: "CORE_EIGHT_SPADE_SCUTTLE_RESOLVED", payload: { stackItemId: item.id, targetCardId: payload.targetCardId ?? null, removed, sourceCardIds: responseSources } });
                reopenCorePriority(state, item.controllerId);
                break;
            }
            if (payload.responseKind === "eight-aegis-field") {
                const expiresAt = { playerId: item.controllerId, startSequence: (state.startPhaseSequenceByPlayer[item.controllerId] ?? 0) + 1 };
                const affected = [];
                for (const id of [...state.players[item.controllerId].pr, ...state.players[item.controllerId].er])
                    if (coreRank(state, id) !== "9") {
                        applyAegis(state.cards[id], `8-quick:${item.id}`, expiresAt);
                        affected.push(id);
                    }
                events.push({ type: "CORE_EIGHT_AEGIS_FIELD_RESOLVED", payload: { stackItemId: item.id, sourceCardIds: responseSources, affectedCardIds: affected, expiresAt } });
                reopenCorePriority(state, item.controllerId);
                break;
            }
            if (payload.responseKind === "queen-aegis-quick") {
                const target = payload.targetCardId ? state.cards[payload.targetCardId] : undefined;
                let applied = false;
                if (target && target.controllerId === item.controllerId && (target.zone.endsWith("_PR") || target.zone.endsWith("_ER")) && coreRank(state, target.id) !== "9") {
                    applyAegis(target, `Q-quick:${item.id}`, { playerId: item.controllerId, startSequence: (state.startPhaseSequenceByPlayer[item.controllerId] ?? 0) + 1 });
                    applied = true;
                }
                const core = requireRuntime(state);
                if (typeof core !== "string") {
                    core.qQuickResolvedFullTurnByPlayer ??= {};
                    core.qQuickResolvedFullTurnByPlayer[item.controllerId] = state.fullTurnSequence;
                }
                events.push({ type: "CORE_QUEEN_AEGIS_QUICK_RESOLVED", payload: { stackItemId: item.id, targetCardId: payload.targetCardId ?? null, applied, sourceCardIds: responseSources } });
                reopenCorePriority(state, item.controllerId);
                break;
            }
            const targetIndex = state.stack.findIndex((entry) => entry.id === payload.targetStackItemId);
            if (targetIndex < 0)
                return fail("CORE_COUNTER_TARGET", "Counter target is no longer pending");
            const [target] = state.stack.splice(targetIndex, 1);
            let destination = payload.counterDestination ?? "GY";
            const targetSources = sendCoreStackSources(state, target, destination);
            const counteredPayload = target.coreAuthority;
            if (counteredPayload?.kind === "response" && counteredPayload.responseKind === "rank10-stack-theft")
                state.players[target.controllerId].limits.pendingFullTurnSkips += 1;
            let ultraRiderCardId = null;
            if (counteredPayload?.kind === "response" && counteredPayload.responseKind === "ultra-three-red") {
                const bottom = state.zones.gy[0];
                if (bottom) {
                    moveCard(state, bottom, `${target.controllerId}_HAND`, target.controllerId);
                    ultraRiderCardId = bottom;
                }
            }
            if (payload.responseKind === "ultra-three-red") {
                const bottom = state.zones.gy[0];
                if (bottom) {
                    moveCard(state, bottom, `${item.controllerId}_HAND`, item.controllerId);
                    ultraRiderCardId = bottom;
                }
            }
            if (payload.responseKind === "anchor-ace-counter" && targetSources.length > 0) {
                const taken = targetSources[0];
                if (state.cards[taken]?.zone === destination) {
                    moveCard(state, taken, `${item.controllerId}_HAND`, item.controllerId);
                    revealUntilStart(state.cards[taken], { playerId: item.controllerId, startSequence: (state.startPhaseSequenceByPlayer[item.controllerId] ?? 0) + 1 });
                }
            }
            const targetWasRoot = target.coreAuthority?.kind === "primary";
            events.push({ type: "CORE_COUNTER_RESOLVED", payload: { stackItemId: item.id, counterKind: payload.responseKind, targetStackItemId: target.id, responseSourceCardIds: responseSources, counteredSourceCardIds: targetSources, targetWasRoot, destination, stackTheftPrintedSkipApplied: counteredPayload?.kind === "response" && counteredPayload.responseKind === "rank10-stack-theft", ultraCounterResistantDrawCardId: ultraRiderCardId } });
            if (targetWasRoot && state.stack.length === 0)
                finishCounteredCoreRoot(state);
            else
                reopenCorePriority(state, item.controllerId);
            break;
        }
        case "core-submit-private-choice": {
            const resolved = resolveCorePrivateChoiceSubmission(state, actorId, action.token, action.submission);
            if (!resolved.ok)
                return resolved;
            events.push(...resolved.events);
            Object.assign(state, resolved.state);
            if (resolved.generatedPrimary) {
                const descriptor = primaryDescriptor(resolved.generatedPrimary);
                const sources = primarySourceIds(resolved.generatedPrimary);
                const targets = primaryTargetIds(resolved.generatedPrimary);
                const item = declareCoreStackItem(state, actorId, `SEVEN-GENERATED-${descriptor.actionType}`, sources, targets, { kind: "primary", action: canonicalClone(resolved.generatedPrimary), declaringPlayerId: actorId, actionType: descriptor.actionType, stackClass: descriptor.stackClass });
                events.push({ type: "CORE_SEVEN_GENERATED_EFFECT_DECLARED", payload: { stackItemId: item.id, playerId: actorId, sourceCardIds: sources, actionKind: resolved.generatedPrimary.kind } });
            }
            break;
        }
        case "core-complete-turn": {
            const core = requireRuntime(state);
            if (typeof core === "string")
                return fail("CORE_PROFILE", core);
            if (state.phase !== "End" || state.activePlayerId !== actorId)
                return fail("CORE_END", "Turn completion requires the active player's End phase");
            const points = deriveSecuredPoints(state, actorId);
            if (points >= state.players[actorId].goal) {
                state.winner = actorId;
                core.terminalReason = "NORMAL_VICTORY";
                events.push({ type: "CORE_NORMAL_VICTORY", payload: { playerId: actorId, securedPoints: points, goal: state.players[actorId].goal } });
                break;
            }
            if (core.exhausted) {
                core.exhausted.remaining -= 1;
                events.push({ type: "CORE_EXHAUSTED_TICKED", payload: { remaining: core.exhausted.remaining, completedFullTurnSequence: state.fullTurnSequence } });
                if (core.exhausted.remaining <= 0) {
                    state.winner = exhaustedWinner(state);
                    core.terminalReason = state.winner === null ? "CANONICAL_DRAW" : "EXHAUSTED_RESOLUTION";
                    events.push({ type: "CORE_EXHAUSTED_RESOLVED", payload: { winner: state.winner, draw: state.winner === null } });
                    break;
                }
            }
            const boardLock = state.metadata.boardLock;
            if (boardLock && typeof boardLock.turnsRemaining === "number" && state.fullTurnSequence > (boardLock.activationFullTurnId ?? state.fullTurnSequence)) {
                boardLock.turnsRemaining -= 1;
                events.push({ type: "CORE_BOARD_LOCK_TICKED", payload: { turnsRemaining: boardLock.turnsRemaining, completedFullTurnSequence: state.fullTurnSequence, activatorId: boardLock.activatorId ?? null } });
                if (boardLock.turnsRemaining <= 0) {
                    delete state.metadata.boardLock;
                    events.push({ type: "CORE_BOARD_LOCK_ENDED", payload: { completedFullTurnSequence: state.fullTurnSequence } });
                }
            }
            const current = state.turnOrder.indexOf(actorId);
            let nextIndex = (current + 1) % state.turnOrder.length;
            const consumedSkips = [];
            let guard = 0;
            while (state.players[state.turnOrder[nextIndex]].limits.pendingFullTurnSkips > 0 && guard < 64) {
                const skipped = state.turnOrder[nextIndex];
                state.players[skipped].limits.pendingFullTurnSkips -= 1;
                consumedSkips.push(skipped);
                events.push({ type: "CORE_FULL_TURN_SKIP_CONSUMED", payload: { playerId: skipped, remaining: state.players[skipped].limits.pendingFullTurnSkips } });
                nextIndex = (nextIndex + 1) % state.turnOrder.length;
                guard += 1;
            }
            const nextPlayerId = state.turnOrder[nextIndex];
            state.fullTurnSequence += 1;
            state.activePlayerId = nextPlayerId;
            state.phase = "Start";
            core.startPreparedFullTurnSequence = null;
            events.push({ type: "CORE_FULL_TURN_COMPLETED", payload: { playerId: actorId, nextPlayerId, consumedSkipSlots: consumedSkips, completedFullTurnSequence: state.fullTurnSequence - 1 } });
            break;
        }
    }
    return { ok: true, state, events };
}
//# sourceMappingURL=core-authority.js.map