import { canonicalClone } from "./canonical-json.js";
import { applyTap, hasAegis } from "./lifecycle.js";
import { evaluateProtection, revalidateAttachments } from "./interactions.js";
import { hashCanonical } from "./hash.js";
import { exhaustedWinner } from "./phase8.js";
import { cardPointValue, compareScuttle, hasOrdinaryScuttleImmunity, parseIdentity, rankDefinition } from "./ranks.js";
import { nextIndex } from "./rng.js";
import { deriveSecuredPoints, moveCard } from "./state.js";
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
function autonomyRuntime(state) {
    const runtime = state.metadata.autonomy;
    return typeof runtime === "object" && runtime !== null ? runtime : null;
}
function choiceTokenCore(choice) {
    return {
        schemaVersion: choice.schemaVersion, choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId,
        controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, createdRevision: choice.createdRevision,
        optionCardIds: [...choice.optionCardIds].sort(), optionsHash: choice.optionsHash, minSelections: choice.minSelections,
        maxSelections: choice.maxSelections, stage: choice.stage, context: choice.context
    };
}
function createPrivateChoice(state, input) {
    const optionCardIds = [...input.optionCardIds].sort();
    const core = {
        schemaVersion: 1,
        choiceId: `FC-CHOICE-${String(state.revision).padStart(6, "0")}-${input.kind}-${input.chooserId}-${input.stage}`,
        kind: input.kind, chooserId: input.chooserId, controllerId: input.controllerId, sourceCardId: input.sourceCardId,
        createdRevision: state.revision, optionCardIds, optionsHash: hashCanonical(optionCardIds), minSelections: input.minSelections,
        maxSelections: input.maxSelections, stage: input.stage, context: canonicalClone(input.context)
    };
    return { ...core, token: hashCanonical(choiceTokenCore({ ...core, token: "" })) };
}
function activePrivateChoice(state) {
    const choice = autonomyRuntime(state)?.privateChoice;
    return choice && typeof choice === "object" ? choice : null;
}
function setPrivateChoice(state, choice) {
    autonomyRuntime(state).privateChoice = choice;
}
function clearPrivateChoice(state) {
    autonomyRuntime(state).privateChoice = null;
}
function validatePrivateChoiceSubmission(state, actorId, token, submission) {
    if (!isPrivateChoiceProfile(state))
        return "First Contact Private Choice Authority profile is not active";
    const choice = activePrivateChoice(state);
    if (!choice)
        return "No private choice is pending";
    if (choice.chooserId !== actorId)
        return `${actorId} is not authorized for ${choice.choiceId}`;
    if (choice.token !== token)
        return "Private choice token is stale or invalid";
    const expected = hashCanonical(choiceTokenCore({ ...choice, token: "" }));
    if (expected !== choice.token || hashCanonical([...choice.optionCardIds].sort()) !== choice.optionsHash)
        return "Private choice seal verification failed";
    if (choice.kind !== submission.kind)
        return `Choice kind mismatch: expected ${choice.kind}`;
    const selected = submission.selectedCardIds;
    if (new Set(selected).size !== selected.length)
        return "Private choice selections must be unique";
    if (selected.length < choice.minSelections || selected.length > choice.maxSelections)
        return `Private choice requires ${choice.minSelections}-${choice.maxSelections} selections`;
    if (selected.some((id) => !choice.optionCardIds.includes(id)))
        return "Private choice selected an unavailable card";
    return choice;
}
const SUPPORTED_AUTONOMY_PROFILES = new Set(["first-contact-baseline", "first-contact-essentials", "first-contact-response", "first-contact-private-choice", "first-contact-trigger-closure"]);
function autonomyProfileId(state) {
    const id = autonomyRuntime(state)?.profileId;
    return typeof id === "string" ? id : null;
}
function isEssentialsProfile(state) { return ["first-contact-essentials", "first-contact-response", "first-contact-private-choice", "first-contact-trigger-closure"].includes(autonomyProfileId(state) ?? ""); }
function isResponseProfile(state) { return ["first-contact-response", "first-contact-private-choice", "first-contact-trigger-closure"].includes(autonomyProfileId(state) ?? ""); }
function isPrivateChoiceProfile(state) { return ["first-contact-private-choice", "first-contact-trigger-closure"].includes(autonomyProfileId(state) ?? ""); }
function isTriggerClosureProfile(state) { return autonomyProfileId(state) === "first-contact-trigger-closure"; }
function validateAutonomyAction(state, actorId) {
    const profileId = autonomyProfileId(state);
    if (!profileId || !SUPPORTED_AUTONOMY_PROFILES.has(profileId))
        return "A supported First Contact autonomy profile is not active";
    if (state.activePlayerId !== actorId)
        return `${actorId} is not the active player`;
    if (state.phase !== "Action")
        return `Player action requires Action phase; found ${state.phase}`;
    if (state.winner !== null)
        return "Match is already terminal";
    if (state.stack.length > 0 || state.pendingDeclaration !== null || state.priority?.open === true || activePrivateChoice(state) !== null)
        return "Autonomy action cannot begin with pending game objects or choices";
    return null;
}
function validateEssentialsEffect(state, actorId) {
    const problem = validateAutonomyAction(state, actorId);
    if (problem)
        return problem;
    if (!isEssentialsProfile(state))
        return "First Contact Essentials profile is not active";
    const lock = state.metadata.boardLock;
    if ((lock?.turnsRemaining ?? 0) > 0)
        return "Board Lock forbids non-counter effect and Anchor plays";
    return null;
}
function finishAutonomyAction(state, actorId) {
    state.players[actorId].limits.miniTurnsUsed = 1;
    state.players[actorId].limits.miniTurnsRemaining = 0;
    state.phase = "End";
}
function futureStart(state, playerId) {
    return { playerId, startSequence: (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1 };
}
function clearReveal(cardId, state) { delete state.cards[cardId].state.revealedUntil; }
function drawFromTop(state, playerId, count) {
    const drawn = [];
    for (let index = 0; index < count && state.zones.dp.length > 0; index += 1) {
        const cardId = state.zones.dp[0];
        clearReveal(cardId, state);
        routeDestination(state, cardId, `${playerId}_HAND`, playerId);
        drawn.push(cardId);
    }
    return drawn;
}
function shuffleIntoDp(state, cardIds) {
    for (const cardId of cardIds)
        if (state.cards[cardId]?.zone !== "VOID")
            moveCard(state, cardId, "VOID");
    for (let index = cardIds.length - 1; index > 0; index -= 1) {
        const selected = nextIndex(state.rng, index + 1);
        [cardIds[index], cardIds[selected]] = [cardIds[selected], cardIds[index]];
    }
    for (const cardId of cardIds)
        moveCard(state, cardId, "DP");
}
function rankOf(state, cardId) {
    const card = state.cards[cardId];
    return card ? parseIdentity(card.identity)?.rank ?? null : null;
}
function stagePrivateChoiceSource(state, cardId, actorId) {
    moveCard(state, cardId, "VOID", actorId);
    state.cards[cardId].state.privateChoiceSource = true;
    state.cards[cardId].state.draftFaceUp = true;
}
function completePrivateChoiceSource(state, cardId, actorId) {
    if (state.cards[cardId]) {
        delete state.cards[cardId].state.privateChoiceSource;
        delete state.cards[cardId].state.draftFaceUp;
        routeDestination(state, cardId, "GY", actorId);
    }
    clearPrivateChoice(state);
    finishAutonomyAction(state, actorId);
}
function beginChoice(state, input, events) {
    const choice = createPrivateChoice(state, input);
    setPrivateChoice(state, choice);
    events.push({ type: "AUTONOMY_PRIVATE_CHOICE_OPENED", payload: { choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, optionCount: choice.optionCardIds.length, minSelections: choice.minSelections, maxSelections: choice.maxSelections, stage: choice.stage } });
    events.push({ type: "AUTONOMY_PRIVATE_CHOICE_OPTIONS", payload: { choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId, optionCardIds: choice.optionCardIds, optionsHash: choice.optionsHash }, visibility: "authorized" });
    return choice;
}
const FIRST_CONTACT_SEVEN_SCORING_TRIGGER_KIND = "first-contact-seven-scoring";
function queueSevenScoringTrigger(state, controllerId, sourceCardId, events) {
    const trigger = {
        id: `FC-TRIGGER-${String(state.revision).padStart(6, "0")}-${controllerId}-${sourceCardId}-${state.triggerQueue.length}`,
        controllerId,
        sourceCardId,
        kind: FIRST_CONTACT_SEVEN_SCORING_TRIGGER_KIND,
        instructions: []
    };
    state.triggerQueue.push(trigger);
    events.push({ type: "AUTONOMY_SEVEN_SCORING_TRIGGER_QUEUED", payload: { triggerId: trigger.id, controllerId, sourceCardId, queueDepth: state.triggerQueue.length } });
    return trigger;
}
function flushFirstContactTriggerQueue(state, actorId, events) {
    if (!isTriggerClosureProfile(state))
        return "First Contact Trigger Closure profile is not active";
    if (state.activePlayerId !== actorId)
        return `${actorId} is not the active player`;
    if (state.priority?.open === true || state.stack.length > 0 || activePrivateChoice(state) !== null)
        return "Trigger queue cannot flush while another authority object is pending";
    const trigger = state.triggerQueue[0];
    if (!trigger)
        return "No trigger is queued";
    if (trigger.controllerId !== actorId)
        return `${actorId} does not control the queued trigger`;
    if (trigger.kind !== FIRST_CONTACT_SEVEN_SCORING_TRIGGER_KIND || !trigger.sourceCardId)
        return `Unsupported trigger kind ${trigger.kind}`;
    state.triggerQueue.shift();
    const item = {
        id: `FC-${String(state.revision).padStart(6, "0")}-${actorId}-SEVEN-TRIGGER-${state.stack.length}`,
        controllerId: actorId,
        sourceCardIds: [],
        targetCardIds: [],
        kind: "first-contact-trigger",
        revalidationClass: "none",
        instructions: [],
        sourceDestination: `${actorId}_PR`,
        status: "pending",
        firstContactAuthority: { kind: "seven-scoring-trigger", sourceCardId: trigger.sourceCardId }
    };
    state.stack.push(item);
    openPriorityAfter(state, actorId);
    events.push({ type: "AUTONOMY_TRIGGER_QUEUE_FLUSHED", payload: { triggerId: trigger.id, stackItemId: item.id, controllerId: actorId, sourceCardId: trigger.sourceCardId, remainingQueueDepth: state.triggerQueue.length } });
    return null;
}
function primaryDescriptor(action) {
    switch (action.kind) {
        case "autonomy-draw": return { actionType: "draw", stackClass: "draw", sourceCardIds: [], costCardIds: [], targetCardIds: [] };
        case "autonomy-score": return { actionType: "play-for-points", stackClass: "points", sourceCardIds: [action.cardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-scuttle": return { actionType: "scuttle", stackClass: "scuttle", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [action.targetCardId] };
        case "autonomy-nine-goal-shift": return { actionType: "play-for-effect", stackClass: "goal-mod", sourceCardIds: [action.sourceCardId], costCardIds: action.discardCardId ? [action.discardCardId] : [], targetCardIds: [] };
        case "autonomy-queen-anchor":
        case "autonomy-king-anchor": return { actionType: "play-for-effect", stackClass: "anchor", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-exhausted-pass": return { actionType: "exhausted-pass", stackClass: "pass", sourceCardIds: [], costCardIds: [], targetCardIds: [] };
        case "autonomy-four-clear": return { actionType: "play-for-effect", stackClass: "ordinary-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-nine-tap": return { actionType: "play-for-effect", stackClass: "ordinary-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [action.targetCardId] };
        case "autonomy-jack-pr-attachment": return { actionType: "play-for-effect", stackClass: "ordinary-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [action.targetCardId] };
        case "autonomy-red-joker": return { actionType: "play-for-effect", stackClass: "ordinary-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-black-joker-board-lock": return { actionType: "play-for-effect", stackClass: "ordinary-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-three-hand-raid": return { actionType: "play-for-effect", stackClass: "private-choice-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-three-bounce": return { actionType: "play-for-effect", stackClass: "ordinary-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [action.targetCardId] };
        case "autonomy-five-recycle": return { actionType: "play-for-effect", stackClass: "private-choice-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-six-dig": return { actionType: "play-for-effect", stackClass: "private-choice-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-seven-topdeck": return { actionType: "play-for-effect", stackClass: "private-choice-effect", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
        case "autonomy-nine-anchor": return { actionType: "play-for-effect", stackClass: "anchor", sourceCardIds: [action.sourceCardId], costCardIds: [], targetCardIds: [] };
    }
}
function openPriorityAfter(state, actorId) {
    const actorIndex = state.turnOrder.indexOf(actorId);
    state.priority = { order: [...state.turnOrder], index: (actorIndex + 1) % state.turnOrder.length, consecutivePasses: 0, open: true };
}
function finishCounteredRoot(state) {
    const active = state.players[state.activePlayerId];
    if (active) {
        active.limits.miniTurnsUsed = 1;
        active.limits.miniTurnsRemaining = 0;
    }
    state.phase = "End";
    state.priority = null;
}
function sendStackSourcesToGy(state, item) {
    const moved = [];
    for (const cardId of item.sourceCardIds) {
        if (state.cards[cardId]?.zone === "ON_STACK") {
            routeDestination(state, cardId, "GY");
            moved.push(cardId);
        }
    }
    return moved;
}
function topStackItem(state, id) {
    const top = state.stack.at(-1);
    return top?.id === id ? top : null;
}
function eligibleForBaseAce(target) {
    const payload = target.firstContactAuthority;
    if (!payload)
        return false;
    if (payload.kind === "seven-scoring-trigger")
        return false;
    if (payload.kind !== "primary")
        return true;
    if (payload.action.kind === "autonomy-red-joker" && payload.action.mode === "shuffle-reset")
        return false;
    return ["ordinary-effect", "anchor", "goal-mod", "counter", "disrupt"].includes(payload.stackClass);
}
function responseSourceProblem(state, actorId, cardId, rank) {
    const card = state.cards[cardId];
    if (!card || card.controllerId !== actorId || card.zone !== `${actorId}_HAND`)
        return `${cardId} is not a controlled hand source`;
    if (rankOf(state, cardId) !== rank)
        return `${cardId} is not rank ${rank}`;
    return null;
}
function declareAuthorityItem(state, actorId, commandTag, sourceCardIds, targetCardIds, payload, stackClass) {
    for (const cardId of sourceCardIds)
        moveCard(state, cardId, "ON_STACK");
    const item = {
        id: `FC-${String(state.revision).padStart(6, "0")}-${actorId}-${commandTag}-${state.stack.length}`,
        controllerId: actorId,
        sourceCardIds: [...sourceCardIds],
        targetCardIds: [...targetCardIds],
        kind: `first-contact-${stackClass}`,
        revalidationClass: targetCardIds.length === 1 ? "single-required-target" : "none",
        instructions: [],
        sourceDestination: "GY",
        status: "pending",
        firstContactAuthority: payload
    };
    state.stack.push(item);
    openPriorityAfter(state, actorId);
    return item;
}
function validatePriorityHolder(state, actorId) {
    if (!isResponseProfile(state))
        return "First Contact Response Authority profile is not active";
    const priority = state.priority;
    if (!priority?.open)
        return "No response priority window is open";
    if (priority.order[priority.index] !== actorId)
        return `${actorId} does not hold response priority`;
    return null;
}
function reopenAfterResolution(state, actorId) {
    if (state.stack.length > 0)
        openPriorityAfter(state, actorId);
    else
        state.priority = null;
}
function clearDisruptionsAtTurnEnd(state, playerId, events) {
    const runtime = autonomyRuntime(state);
    const disrupted = runtime?.disruptedActionTypesByPlayer?.[playerId] ?? [];
    if (disrupted.length > 0) {
        runtime.disruptedActionTypesByPlayer[playerId] = [];
        events.push({ type: "AUTONOMY_JACK_DISRUPTIONS_CLEARED", payload: { playerId, disruptedActionTypes: disrupted, completedFullTurnSequence: state.fullTurnSequence } });
    }
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
        case "autonomy-declare-response-action": {
            if (!isResponseProfile(state))
                return fail("AUTONOMY_RESPONSE_PROFILE", "First Contact Response Authority profile is not active");
            const problem = validateAutonomyAction(state, actorId);
            if (problem)
                return fail("AUTONOMY_ACTION", problem);
            const probe = resolvePhase9Action(state, actorId, action.action);
            if (!probe.ok)
                return probe;
            const descriptor = primaryDescriptor(action.action);
            for (const cardId of descriptor.costCardIds)
                moveCard(state, cardId, "GY");
            const item = declareAuthorityItem(state, actorId, `ROOT-${descriptor.actionType}`, descriptor.sourceCardIds, descriptor.targetCardIds, { kind: "primary", action: canonicalClone(action.action), actionType: descriptor.actionType, stackClass: descriptor.stackClass }, descriptor.stackClass);
            events.push({ type: "AUTONOMY_ACTION_DECLARED", payload: { stackItemId: item.id, playerId: actorId, actionType: descriptor.actionType, stackClass: descriptor.stackClass, sourceCardIds: descriptor.sourceCardIds, targetCardIds: descriptor.targetCardIds, costCardIds: descriptor.costCardIds } });
            break;
        }
        case "autonomy-declare-ace-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("AUTONOMY_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "A");
            if (sourceProblem)
                return fail("AUTONOMY_COUNTER_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            if (!target || !eligibleForBaseAce(target))
                return fail("AUTONOMY_COUNTER_TARGET", "Base Ace requires the current top eligible ordinary effect or counter");
            const item = declareAuthorityItem(state, actorId, "ACE", [action.sourceCardId], [], { kind: "ace-counter", targetStackItemId: target.id }, "counter");
            item.counterTargetId = target.id;
            events.push({ type: "AUTONOMY_ACE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "autonomy-declare-eight-scuttle-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("AUTONOMY_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "8");
            if (sourceProblem)
                return fail("AUTONOMY_COUNTER_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            if (!target || target.firstContactAuthority?.kind !== "primary" || target.firstContactAuthority.stackClass !== "scuttle")
                return fail("AUTONOMY_COUNTER_TARGET", "Eight Scuttle Counter requires the current pending Scuttle");
            const item = declareAuthorityItem(state, actorId, "EIGHT", [action.sourceCardId], [], { kind: "eight-scuttle-counter", targetStackItemId: target.id }, "counter");
            item.counterTargetId = target.id;
            events.push({ type: "AUTONOMY_EIGHT_SCUTTLE_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "autonomy-declare-king-counter": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("AUTONOMY_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "K");
            if (sourceProblem)
                return fail("AUTONOMY_COUNTER_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            if (!target || target.firstContactAuthority?.kind !== "primary" || !["anchor", "goal-mod"].includes(target.firstContactAuthority.stackClass) || target.sourceCardIds.length !== 1)
                return fail("AUTONOMY_COUNTER_TARGET", "King requires the current pending single-card Anchor or Goal-Mod play");
            const item = declareAuthorityItem(state, actorId, "KING", [action.sourceCardId], [], { kind: "king-counter", targetStackItemId: target.id }, "counter");
            item.counterTargetId = target.id;
            events.push({ type: "AUTONOMY_KING_COUNTER_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId } });
            break;
        }
        case "autonomy-declare-jack-disrupt": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("AUTONOMY_PRIORITY", problem);
            const sourceProblem = responseSourceProblem(state, actorId, action.sourceCardId, "J");
            if (sourceProblem)
                return fail("AUTONOMY_DISRUPT_SOURCE", sourceProblem);
            const target = topStackItem(state, action.targetStackItemId);
            const payload = target?.firstContactAuthority;
            if (!target || payload?.kind !== "primary" || target.controllerId === actorId)
                return fail("AUTONOMY_DISRUPT_TARGET", "Jack Disrupt requires the opponent's current Mini-Turn Action declaration");
            const item = declareAuthorityItem(state, actorId, "JACK", [action.sourceCardId], [], { kind: "jack-disrupt", targetStackItemId: target.id, disruptedActionType: payload.actionType }, "disrupt");
            events.push({ type: "AUTONOMY_JACK_DISRUPT_DECLARED", payload: { stackItemId: item.id, targetStackItemId: target.id, sourceCardId: action.sourceCardId, disruptedActionType: payload.actionType } });
            break;
        }
        case "autonomy-pass-priority": {
            const problem = validatePriorityHolder(state, actorId);
            if (problem)
                return fail("AUTONOMY_PRIORITY", problem);
            const priority = state.priority;
            priority.consecutivePasses += 1;
            priority.index = (priority.index + 1) % priority.order.length;
            events.push({ type: action.semantic === "DECLINE_RESPONSE" ? "AUTONOMY_RESPONSE_DECLINED" : "AUTONOMY_AUTOMATIC_PRIORITY_ADVANCE", payload: { playerId: actorId, consecutiveDeclines: priority.consecutivePasses, semanticClass: action.semantic === "DECLINE_RESPONSE" ? "response-decline" : "engine-orchestration" } });
            if (priority.consecutivePasses >= priority.order.length) {
                priority.open = false;
                events.push({ type: "AUTONOMY_RESPONSE_WINDOW_CLOSED", payload: { reason: "consecutive-declines-or-no-response", stackDepth: state.stack.length, semanticClass: "engine-orchestration" } });
            }
            break;
        }
        case "autonomy-flush-trigger-queue": {
            const problem = flushFirstContactTriggerQueue(state, actorId, events);
            if (problem)
                return fail("AUTONOMY_TRIGGER_QUEUE", problem);
            break;
        }
        case "autonomy-resolve-response-top": {
            if (!isResponseProfile(state))
                return fail("AUTONOMY_RESPONSE_PROFILE", "First Contact Response Authority profile is not active");
            if (state.priority?.open === true)
                return fail("AUTONOMY_PRIORITY_OPEN", "Cannot resolve while response priority is open");
            const item = state.stack.at(-1);
            const payload = item?.firstContactAuthority;
            if (!item || !payload)
                return fail("AUTONOMY_STACK", "No First Contact response stack item is available");
            if (payload.kind === "seven-scoring-trigger") {
                if (!isTriggerClosureProfile(state))
                    return fail("AUTONOMY_TRIGGER_PROFILE", "Seven scoring trigger requires Trigger Closure Authority");
                state.stack.pop();
                state.priority = null;
                const revealedCardIds = [];
                for (let index = 0; index < 2 && state.zones.dp.length > 0; index += 1) {
                    const cardId = state.zones.dp[0];
                    moveCard(state, cardId, "VOID");
                    state.cards[cardId].state.privateChoiceHeldBy = item.controllerId;
                    state.cards[cardId].state.privateChoicePublicReveal = true;
                    state.cards[cardId].state.privateChoiceSource = true;
                    revealedCardIds.push(cardId);
                }
                events.push({ type: "AUTONOMY_SEVEN_SCORING_TRIGGER_BEGAN", payload: { stackItemId: item.id, controllerId: item.controllerId, sourceCardId: payload.sourceCardId, revealedCardIds } });
                if (revealedCardIds.length === 0) {
                    events.push({ type: "AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED", payload: { stackItemId: item.id, controllerId: item.controllerId, sourceCardId: payload.sourceCardId, takenCardId: null, returnedCardIds: [] } });
                    reopenAfterResolution(state, item.controllerId);
                    break;
                }
                beginChoice(state, { kind: "rank7-scoring-trigger", chooserId: item.controllerId, controllerId: item.controllerId, sourceCardId: payload.sourceCardId, optionCardIds: revealedCardIds, minSelections: 1, maxSelections: 1, stage: 1, context: { stackItemId: item.id, revealedCardIds } }, events);
                break;
            }
            if (payload.kind === "primary") {
                state.stack.pop();
                state.priority = null;
                for (const cardId of item.sourceCardIds)
                    if (state.cards[cardId]?.zone === "ON_STACK")
                        moveCard(state, cardId, `${item.controllerId}_HAND`, item.controllerId);
                const descriptor = primaryDescriptor(payload.action);
                for (const cardId of descriptor.costCardIds)
                    if (state.cards[cardId]?.zone === "GY")
                        moveCard(state, cardId, `${item.controllerId}_HAND`, item.controllerId);
                const resolved = resolvePhase9Action(state, item.controllerId, payload.action);
                if (!resolved.ok) {
                    if (resolved.code === "AUTONOMY_DRAW_EMPTY" && payload.action.kind === "autonomy-draw") {
                        for (const cardId of item.sourceCardIds)
                            if (state.cards[cardId]?.zone === `${item.controllerId}_HAND`)
                                routeDestination(state, cardId, "GY");
                        for (const cardId of descriptor.costCardIds)
                            if (state.cards[cardId]?.zone === `${item.controllerId}_HAND`)
                                routeDestination(state, cardId, "GY");
                        finishAutonomyAction(state, item.controllerId);
                        events.push({ type: "AUTONOMY_ROOT_FIZZLED", payload: { stackItemId: item.id, actionType: payload.actionType, reasonCode: resolved.code } });
                        break;
                    }
                    return fail("AUTONOMY_ROOT_RESOLUTION", resolved.message, { code: resolved.code, stackItemId: item.id });
                }
                events.push({ type: "AUTONOMY_ROOT_RESOLUTION_BEGAN", payload: { stackItemId: item.id, actionType: payload.actionType, stackClass: payload.stackClass } });
                events.push(...resolved.events);
                Object.assign(state, resolved.state);
                events.push({ type: "AUTONOMY_ROOT_RESOLVED", payload: { stackItemId: item.id, actionType: payload.actionType } });
                break;
            }
            state.stack.pop();
            const responseSources = sendStackSourcesToGy(state, item);
            if (payload.kind === "jack-disrupt") {
                const target = state.stack.find((entry) => entry.id === payload.targetStackItemId);
                const targetPayload = target?.firstContactAuthority;
                if (!target || targetPayload?.kind !== "primary")
                    return fail("AUTONOMY_DISRUPT_TARGET", "Jack Disrupt target is no longer pending");
                const runtime = autonomyRuntime(state);
                runtime.disruptedActionTypesByPlayer ??= {};
                const list = runtime.disruptedActionTypesByPlayer[target.controllerId] ?? [];
                if (!list.includes(payload.disruptedActionType))
                    list.push(payload.disruptedActionType);
                runtime.disruptedActionTypesByPlayer[target.controllerId] = list;
                const drawnCardIds = drawFromTop(state, item.controllerId, state.zones.dp.length > 0 ? 1 : 0);
                events.push({ type: "AUTONOMY_JACK_DISRUPT_RESOLVED", payload: { stackItemId: item.id, targetStackItemId: target.id, disruptedPlayerId: target.controllerId, disruptedActionType: payload.disruptedActionType, sourceCardIds: responseSources, drawnCardIds } });
                reopenAfterResolution(state, item.controllerId);
                break;
            }
            const targetIndex = state.stack.findIndex((entry) => entry.id === payload.targetStackItemId);
            if (targetIndex < 0)
                return fail("AUTONOMY_COUNTER_TARGET", "Counter target is no longer pending");
            const [target] = state.stack.splice(targetIndex, 1);
            const targetSources = sendStackSourcesToGy(state, target);
            const targetWasRoot = target.firstContactAuthority?.kind === "primary";
            events.push({ type: "AUTONOMY_COUNTER_RESOLVED", payload: { stackItemId: item.id, counterKind: payload.kind, targetStackItemId: target.id, responseSourceCardIds: responseSources, counteredSourceCardIds: targetSources, targetWasRoot } });
            if (targetWasRoot && state.stack.length === 0)
                finishCounteredRoot(state);
            else
                reopenAfterResolution(state, item.controllerId);
            break;
        }
        case "autonomy-enter-action": {
            const profileId = autonomyProfileId(state);
            if (!profileId || !SUPPORTED_AUTONOMY_PROFILES.has(profileId))
                return fail("AUTONOMY_PROFILE", "A supported First Contact autonomy profile is not active");
            if (state.activePlayerId !== actorId || state.phase !== "Start")
                return fail("AUTONOMY_PHASE", "Action phase entry requires the active player's completed Start phase");
            const runtime = autonomyRuntime(state);
            if (state.zones.dp.length === 0 && runtime.exhausted == null && runtime.terminalReason == null) {
                runtime.exhausted = { remaining: 3, startedFullTurnSequence: state.fullTurnSequence };
                events.push({ type: "AUTONOMY_EXHAUSTED_BEGAN", payload: { ...runtime.exhausted } });
            }
            state.phase = "Action";
            events.push({ type: "AUTONOMY_ACTION_PHASE_ENTERED", payload: { playerId: actorId, profileId } });
            break;
        }
        case "autonomy-draw": {
            const problem = validateAutonomyAction(state, actorId);
            if (problem)
                return fail("AUTONOMY_ACTION", problem);
            if (state.zones.dp.length === 0)
                return fail("AUTONOMY_DRAW_EMPTY", "Cannot draw from an empty DP");
            const player = state.players[actorId];
            const count = player.hand.length === 0 ? Math.min(2, state.zones.dp.length) : 1;
            const drawnCardIds = [];
            for (let index = 0; index < count; index += 1) {
                const cardId = state.zones.dp[0];
                delete state.cards[cardId].state.revealedUntil;
                routeDestination(state, cardId, `${actorId}_HAND`, actorId);
                drawnCardIds.push(cardId);
            }
            player.limits.miniTurnsUsed = 1;
            player.limits.miniTurnsRemaining = 0;
            state.phase = "End";
            events.push({ type: "AUTONOMY_DRAW_COMPLETED", payload: { playerId: actorId, count, drawnCardIds } });
            break;
        }
        case "autonomy-score": {
            const problem = validateAutonomyAction(state, actorId);
            if (problem)
                return fail("AUTONOMY_ACTION", problem);
            const card = state.cards[action.cardId];
            if (!card || card.controllerId !== actorId || card.zone !== `${actorId}_HAND`)
                return fail("AUTONOMY_SCORE_SOURCE", "Play for Points requires a controlled hand card");
            const pointValue = cardPointValue(card);
            card.state.pointValue = pointValue;
            routeDestination(state, action.cardId, `${actorId}_PR`, actorId);
            state.players[actorId].limits.miniTurnsUsed = 1;
            state.players[actorId].limits.miniTurnsRemaining = 0;
            state.phase = "End";
            events.push({ type: "AUTONOMY_CARD_SCORED", payload: { playerId: actorId, cardId: action.cardId, pointValue } });
            if (isTriggerClosureProfile(state) && rankOf(state, action.cardId) === "7")
                queueSevenScoringTrigger(state, actorId, action.cardId, events);
            break;
        }
        case "autonomy-scuttle": {
            const problem = validateAutonomyAction(state, actorId);
            if (problem)
                return fail("AUTONOMY_ACTION", problem);
            const source = state.cards[action.sourceCardId];
            const target = state.cards[action.targetCardId];
            if (!source || source.controllerId !== actorId || source.zone !== `${actorId}_HAND`)
                return fail("AUTONOMY_SCUTTLE_SOURCE", "Scuttle source must be controlled in hand");
            if (!target || target.controllerId === actorId || !target.zone.endsWith("_PR"))
                return fail("AUTONOMY_SCUTTLE_TARGET", "Scuttle target must be an opponent PR card");
            if (hasAegis(target))
                return fail("AEGIS_BLOCK", "Aegis blocks Scuttle");
            if (hasOrdinaryScuttleImmunity(target))
                return fail("SCUTTLE_IMMUNITY", `${target.identity} has ordinary Scuttle immunity`);
            if (compareScuttle(source, target) <= 0)
                return fail("SCUTTLE_RANK", "Scuttle source must have higher rank or equal rank with higher suit");
            routeDestination(state, target.id, "GY");
            routeDestination(state, source.id, "GY");
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set([target.id]) }));
            state.players[actorId].limits.miniTurnsUsed = 1;
            state.players[actorId].limits.miniTurnsRemaining = 0;
            state.phase = "End";
            events.push({ type: "AUTONOMY_SCUTTLE_RESOLVED", payload: { playerId: actorId, sourceCardId: source.id, targetCardId: target.id } });
            break;
        }
        case "autonomy-three-hand-raid": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            const source = state.cards[action.sourceCardId];
            const target = state.players[action.targetPlayerId];
            if (!isPrivateChoiceProfile(state))
                return fail("AUTONOMY_PRIVATE_CHOICE_PROFILE", "Three Hand Raid requires Private Choice Authority");
            if (!source || rankOf(state, source.id) !== "3" || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Three Hand Raid requires a controlled Three in hand");
            if (!target || action.targetPlayerId === actorId)
                return fail("AUTONOMY_EFFECT_TARGET", "Three Hand Raid requires an opponent");
            stagePrivateChoiceSource(state, source.id, actorId);
            const options = [...target.hand].sort();
            const kind = action.mode === "present-take" ? "rank3-present" : "rank3-discard";
            if (options.length === 0) {
                events.push({ type: "AUTONOMY_THREE_HAND_RAID_EMPTY", payload: { playerId: actorId, sourceCardId: source.id, targetPlayerId: action.targetPlayerId, mode: action.mode } });
                completePrivateChoiceSource(state, source.id, actorId);
                break;
            }
            beginChoice(state, { kind, chooserId: action.targetPlayerId, controllerId: actorId, sourceCardId: source.id, optionCardIds: options, minSelections: 0, maxSelections: Math.min(action.mode === "present-take" ? 3 : 2, options.length), stage: 1, context: { targetPlayerId: action.targetPlayerId, mode: action.mode } }, events);
            break;
        }
        case "autonomy-three-bounce": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (!isPrivateChoiceProfile(state))
                return fail("AUTONOMY_PRIVATE_CHOICE_PROFILE", "Three Bounce requires Private Choice Authority");
            const source = state.cards[action.sourceCardId];
            const target = state.cards[action.targetCardId];
            if (!source || rankOf(state, source.id) !== "3" || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Three Bounce requires a controlled Three in hand");
            if (!target || target.controllerId === actorId || (!target.zone.endsWith("_PR") && !target.zone.endsWith("_ER")))
                return fail("AUTONOMY_EFFECT_TARGET", "Three Bounce requires an opponent OTT card");
            const protection = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "bounce", bypasses: [] });
            if (!protection.legal)
                return fail("PROTECTION_BLOCK", `Three Bounce blocked by ${protection.blockedBy.join(", ")}`, protection);
            moveCard(state, source.id, "GY");
            moveCard(state, target.id, "DP");
            const index = state.zones.dp.indexOf(target.id);
            state.zones.dp.splice(index, 1);
            if (action.destination === "top")
                state.zones.dp.unshift(target.id);
            else
                state.zones.dp.push(target.id);
            events.push(...revalidateAttachments(state));
            events.push({ type: "AUTONOMY_THREE_BOUNCE_RESOLVED", payload: { playerId: actorId, sourceCardId: source.id, targetCardId: target.id, destination: action.destination } });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-five-recycle": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (!isPrivateChoiceProfile(state))
                return fail("AUTONOMY_PRIVATE_CHOICE_PROFILE", "Five Recycle requires Private Choice Authority");
            const source = state.cards[action.sourceCardId];
            if (!source || rankOf(state, source.id) !== "5" || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Five Recycle requires a controlled Five in hand");
            stagePrivateChoiceSource(state, source.id, actorId);
            const milled = [];
            for (let index = 0; index < 2 && state.zones.dp.length > 0; index += 1) {
                const cardId = state.zones.dp[0];
                moveCard(state, cardId, "GY");
                milled.push(cardId);
            }
            const options = [...state.zones.gy].sort();
            events.push({ type: "AUTONOMY_FIVE_MILLED", payload: { playerId: actorId, sourceCardId: source.id, milledCardIds: milled } });
            if (options.length === 0) {
                completePrivateChoiceSource(state, source.id, actorId);
                break;
            }
            beginChoice(state, { kind: "rank5-rummage", chooserId: actorId, controllerId: actorId, sourceCardId: source.id, optionCardIds: options, minSelections: 1, maxSelections: 1, stage: 1, context: { milledCardIds: milled } }, events);
            break;
        }
        case "autonomy-six-dig": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (!isPrivateChoiceProfile(state))
                return fail("AUTONOMY_PRIVATE_CHOICE_PROFILE", "Six Dig requires Private Choice Authority");
            const source = state.cards[action.sourceCardId];
            if (!source || rankOf(state, source.id) !== "6" || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Six Dig requires a controlled Six in hand");
            stagePrivateChoiceSource(state, source.id, actorId);
            const drawn = [];
            for (let index = 0; index < 3 && state.zones.dp.length > 0; index += 1) {
                const cardId = state.zones.dp[0];
                moveCard(state, cardId, "VOID");
                state.cards[cardId].state.privateChoiceHeldBy = actorId;
                drawn.push(cardId);
            }
            if (drawn.length === 0) {
                events.push({ type: "AUTONOMY_SIX_DIG_EMPTY", payload: { playerId: actorId, sourceCardId: source.id } });
                completePrivateChoiceSource(state, source.id, actorId);
                break;
            }
            const discardOptions = [...state.players[actorId].hand, ...drawn].filter((id) => id !== source.id);
            beginChoice(state, { kind: "rank6-dig", chooserId: actorId, controllerId: actorId, sourceCardId: source.id, optionCardIds: [...new Set([...drawn, ...discardOptions])], minSelections: 0, maxSelections: Math.max(1, drawn.length), stage: 1, context: { drawnCardIds: drawn, discardOptionCardIds: discardOptions } }, events);
            break;
        }
        case "autonomy-seven-topdeck": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (!isPrivateChoiceProfile(state))
                return fail("AUTONOMY_PRIVATE_CHOICE_PROFILE", "Seven Topdeck requires Private Choice Authority");
            const source = state.cards[action.sourceCardId];
            if (!source || rankOf(state, source.id) !== "7" || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Seven Topdeck requires a controlled Seven in hand");
            stagePrivateChoiceSource(state, source.id, actorId);
            const revealed = [];
            for (let index = 0; index < 2 && state.zones.dp.length > 0; index += 1) {
                const cardId = state.zones.dp[0];
                moveCard(state, cardId, "VOID");
                state.cards[cardId].state.privateChoiceHeldBy = actorId;
                state.cards[cardId].state.privateChoicePublicReveal = true;
                revealed.push(cardId);
            }
            events.push({ type: "AUTONOMY_SEVEN_TOPDECK_REVEALED", payload: { playerId: actorId, sourceCardId: source.id, revealedCardIds: revealed } });
            if (revealed.length === 0) {
                completePrivateChoiceSource(state, source.id, actorId);
                break;
            }
            beginChoice(state, { kind: "rank7-assign", chooserId: actorId, controllerId: actorId, sourceCardId: source.id, optionCardIds: revealed, minSelections: 1, maxSelections: revealed.length, stage: 1, context: { revealedCardIds: revealed } }, events);
            break;
        }
        case "autonomy-nine-anchor": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (!isPrivateChoiceProfile(state))
                return fail("AUTONOMY_PRIVATE_CHOICE_PROFILE", "Nine Anchor requires Private Choice Authority");
            const source = state.cards[action.sourceCardId];
            const target = state.players[action.targetPlayerId];
            if (!source || rankOf(state, source.id) !== "9" || source.zone !== `${actorId}_HAND` || source.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Nine Anchor requires a controlled Nine in hand");
            if (!target || action.targetPlayerId === actorId)
                return fail("AUTONOMY_EFFECT_TARGET", "Nine Anchor requires an opponent");
            const previous = state.players[actorId].er.filter((id) => state.cards[id]?.state.firstContactNineAnchor === true);
            for (const id of previous)
                routeDestination(state, id, "GY");
            moveCard(state, source.id, `${actorId}_ER`, actorId);
            source.state.firstContactAnchor = true;
            source.state.firstContactNineAnchor = true;
            source.state.anchorValue = 0;
            const options = [...target.hand].sort();
            events.push({ type: "AUTONOMY_NINE_ANCHOR_ENTERED", payload: { playerId: actorId, sourceCardId: source.id, targetPlayerId: action.targetPlayerId, scrappedPreviousAnchorIds: previous } });
            if (options.length === 0) {
                finishAutonomyAction(state, actorId);
                break;
            }
            beginChoice(state, { kind: "nine-anchor-discard", chooserId: action.targetPlayerId, controllerId: actorId, sourceCardId: source.id, optionCardIds: options, minSelections: 1, maxSelections: 1, stage: 1, context: { targetPlayerId: action.targetPlayerId, sourceDisposition: "anchor" } }, events);
            break;
        }
        case "autonomy-four-clear": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (rankOf(state, action.sourceCardId) !== "4" || state.cards[action.sourceCardId]?.zone !== `${actorId}_HAND`)
                return fail("AUTONOMY_EFFECT_SOURCE", "Row Clear requires a controlled Four in hand");
            const targetPlayer = state.players[action.targetPlayerId];
            if (!targetPlayer || action.targetPlayerId === actorId)
                return fail("AUTONOMY_EFFECT_TARGET", "Row Clear requires an opponent");
            const candidates = action.row === "pr" ? [...targetPlayer.pr] : targetPlayer.er.filter((id) => state.cards[id]?.state.firstContactAnchor === true);
            const affected = action.row === "pr" ? candidates.filter((id) => rankDefinition(state.cards[id]).prEffectTargetImmune !== true) : candidates;
            moveCard(state, action.sourceCardId, "GY");
            for (const cardId of affected)
                routeDestination(state, cardId, "GY");
            events.push({ type: "AUTONOMY_FOUR_ROW_CLEAR_RESOLVED", payload: { playerId: actorId, sourceCardId: action.sourceCardId, targetPlayerId: action.targetPlayerId, row: action.row, affectedCardIds: affected, skippedCardIds: candidates.filter((id) => !affected.includes(id)) } });
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set(affected) }));
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-nine-tap": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (rankOf(state, action.sourceCardId) !== "9" || state.cards[action.sourceCardId]?.zone !== `${actorId}_HAND`)
                return fail("AUTONOMY_EFFECT_SOURCE", "Tap requires a controlled Nine in hand");
            const target = state.cards[action.targetCardId];
            if (!target || target.controllerId === actorId || !target.zone.endsWith("_PR"))
                return fail("AUTONOMY_EFFECT_TARGET", "Nine Tap requires an opponent PR card");
            const protection = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "tap", bypasses: [] });
            if (!protection.legal)
                return fail("PROTECTION_BLOCK", `Nine Tap blocked by ${protection.blockedBy.join(", ")}`, protection);
            applyTap(target, { kind: "start-phase", sourceRef: action.sourceCardId, expiresAt: futureStart(state, target.controllerId) });
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "AUTONOMY_NINE_TAP_RESOLVED", payload: { playerId: actorId, sourceCardId: action.sourceCardId, targetCardId: target.id, untapsAt: futureStart(state, target.controllerId) } });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-nine-goal-shift": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            if (rankOf(state, action.sourceCardId) !== "9" || state.cards[action.sourceCardId]?.zone !== `${actorId}_HAND`)
                return fail("AUTONOMY_EFFECT_SOURCE", "Goal Shift requires a controlled Nine in hand");
            const target = state.players[action.targetPlayerId];
            if (!target || action.targetPlayerId === actorId)
                return fail("AUTONOMY_EFFECT_TARGET", "Goal Shift requires an opponent");
            if (action.delta === 5) {
                if (!action.discardCardId || action.discardCardId === action.sourceCardId || state.cards[action.discardCardId]?.zone !== `${actorId}_HAND` || state.cards[action.discardCardId]?.controllerId !== actorId)
                    return fail("AUTONOMY_EFFECT_COST", "+5 Goal Shift requires one other controlled hand card");
                moveCard(state, action.discardCardId, "GY");
            }
            target.goal += action.delta;
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "AUTONOMY_NINE_GOAL_SHIFT_RESOLVED", payload: { playerId: actorId, sourceCardId: action.sourceCardId, targetPlayerId: action.targetPlayerId, delta: action.delta, discardCardId: action.discardCardId ?? null } });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-jack-pr-attachment": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            const jack = state.cards[action.sourceCardId];
            const target = state.cards[action.targetCardId];
            if (!jack || rankOf(state, jack.id) !== "J" || jack.zone !== `${actorId}_HAND` || jack.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Jack PR Attachment requires a controlled Jack in hand");
            if (!target || target.controllerId === actorId || !target.zone.endsWith("_PR") || rankOf(state, target.id) === "RJ" || target.state.attachedByJackId !== undefined || target.state.attachmentGraph !== undefined)
                return fail("AUTONOMY_EFFECT_TARGET", "Jack requires an unattached Vulnerable opponent PR host");
            const protection = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "attachment", bypasses: [] });
            if (!protection.legal)
                return fail("PROTECTION_BLOCK", `Jack Attachment blocked by ${protection.blockedBy.join(", ")}`, protection);
            const originalHostZone = target.zone;
            const originalHostControllerId = target.controllerId;
            moveCard(state, jack.id, `${actorId}_ER`, actorId);
            moveCard(state, target.id, `${actorId}_PR`, actorId);
            jack.state.attachmentGraph = { kind: "jack-pr", hostCardId: target.id, originalHostZone, originalHostControllerId, pointBonus: 1 };
            target.state.attachedByJackId = jack.id;
            target.state.jackPointBonus = 1;
            events.push({ type: "AUTONOMY_JACK_PR_ATTACHMENT_RESOLVED", payload: { playerId: actorId, jackCardId: jack.id, hostCardId: target.id, originalHostZone, originalHostControllerId, pointBonus: 1 } });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-queen-anchor": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            const queen = state.cards[action.sourceCardId];
            if (!queen || rankOf(state, queen.id) !== "Q" || queen.zone !== `${actorId}_HAND` || queen.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Queen Anchor requires a controlled Queen in hand");
            moveCard(state, queen.id, `${actorId}_ER`, actorId);
            queen.state.firstContactAnchor = true;
            queen.state.anchorValue = 0;
            queen.state.providesGuard = true;
            delete queen.state.aegis;
            events.push({ type: "AUTONOMY_QUEEN_ANCHOR_ENTERED", payload: { playerId: actorId, sourceCardId: queen.id, anchorValue: 0, providesGuard: true, aegisDisabled: true } });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-king-anchor": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            const king = state.cards[action.sourceCardId];
            if (!king || rankOf(state, king.id) !== "K" || king.zone !== `${actorId}_HAND` || king.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "King Anchor requires a controlled King in hand");
            moveCard(state, king.id, `${actorId}_ER`, actorId);
            king.state.firstContactAnchor = true;
            king.state.anchorValue = 7;
            events.push({ type: "AUTONOMY_KING_ANCHOR_ENTERED", payload: { playerId: actorId, sourceCardId: king.id, anchorValue: 7, suitSpecificBonusDisabled: true } });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-red-joker": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            const joker = state.cards[action.sourceCardId];
            if (!joker || rankOf(state, joker.id) !== "RJ" || joker.zone !== `${actorId}_HAND` || joker.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Red Joker mode requires a controlled Red Joker in hand");
            moveCard(state, joker.id, "VOID");
            let payload = { playerId: actorId, sourceCardId: joker.id, mode: action.mode };
            if (action.mode === "hand-swap") {
                const target = action.targetPlayerId ? state.players[action.targetPlayerId] : undefined;
                if (!target || action.targetPlayerId === actorId)
                    return fail("AUTONOMY_EFFECT_TARGET", "Hand Swap requires an opponent");
                const own = [...state.players[actorId].hand];
                const theirs = [...target.hand];
                for (const id of [...own, ...theirs])
                    moveCard(state, id, "VOID");
                for (const id of own) {
                    clearReveal(id, state);
                    moveCard(state, id, `${action.targetPlayerId}_HAND`, action.targetPlayerId);
                }
                for (const id of theirs) {
                    clearReveal(id, state);
                    moveCard(state, id, `${actorId}_HAND`, actorId);
                }
                payload = { ...payload, targetPlayerId: action.targetPlayerId, actorSent: own, actorReceived: theirs };
            }
            else if (action.mode === "self-reset") {
                const discarded = [...state.players[actorId].hand];
                for (const id of discarded)
                    moveCard(state, id, "GY");
                const drawn = drawFromTop(state, actorId, discarded.length + 3);
                payload = { ...payload, discarded, requestedDrawCount: discarded.length + 3, drawn };
            }
            else if (action.mode === "opponent-attack") {
                const target = action.targetPlayerId ? state.players[action.targetPlayerId] : undefined;
                if (!target || action.targetPlayerId === actorId)
                    return fail("AUTONOMY_EFFECT_TARGET", "Opponent Attack requires an opponent");
                const discarded = [...target.hand];
                for (const id of discarded)
                    moveCard(state, id, "GY");
                const drawn = drawFromTop(state, action.targetPlayerId, Math.max(0, discarded.length - 2));
                payload = { ...payload, targetPlayerId: action.targetPlayerId, discarded, requestedDrawCount: Math.max(0, discarded.length - 2), drawn };
            }
            else {
                const pool = [...state.zones.dp, ...state.zones.gy];
                shuffleIntoDp(state, pool);
                const drawn = drawFromTop(state, actorId, 2);
                payload = { ...payload, shuffledCount: pool.length, drawn };
            }
            moveCard(state, joker.id, "GY");
            events.push({ type: "AUTONOMY_RED_JOKER_RESOLVED", payload });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-black-joker-board-lock": {
            const problem = validateEssentialsEffect(state, actorId);
            if (problem)
                return fail("AUTONOMY_EFFECT", problem);
            const joker = state.cards[action.sourceCardId];
            if (!joker || rankOf(state, joker.id) !== "BJ" || joker.zone !== `${actorId}_HAND` || joker.controllerId !== actorId)
                return fail("AUTONOMY_EFFECT_SOURCE", "Board Lock requires a controlled Black Joker in hand");
            moveCard(state, joker.id, "GY");
            state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: actorId };
            events.push({ type: "AUTONOMY_BLACK_JOKER_BOARD_LOCK_RESOLVED", payload: state.metadata.boardLock });
            finishAutonomyAction(state, actorId);
            break;
        }
        case "autonomy-exhausted-pass": {
            const problem = validateAutonomyAction(state, actorId);
            if (problem)
                return fail("AUTONOMY_ACTION", problem);
            const runtime = autonomyRuntime(state);
            if (!runtime.exhausted || state.zones.dp.length !== 0)
                return fail("AUTONOMY_EXHAUSTED_PASS", "Exhausted Pass requires active Exhausted with an empty Draw Pile");
            state.players[actorId].limits.miniTurnsUsed = 1;
            state.players[actorId].limits.miniTurnsRemaining = 0;
            state.phase = "End";
            events.push({ type: "AUTONOMY_EXHAUSTED_PASS_COMPLETED", payload: { playerId: actorId, semanticClass: "mini-turn-action" } });
            break;
        }
        case "autonomy-submit-private-choice": {
            const validated = validatePrivateChoiceSubmission(state, actorId, action.token, action.submission);
            if (typeof validated === "string")
                return fail("AUTONOMY_PRIVATE_CHOICE", validated);
            const choice = validated;
            const selected = [...action.submission.selectedCardIds];
            const context = choice.context;
            if (action.submission.kind === "rank3-present") {
                const targetPlayerId = String(context.targetPlayerId);
                if (selected.some((id) => state.cards[id]?.zone !== `${targetPlayerId}_HAND`))
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Presented cards must remain in the opponent hand");
                if (selected.length === 0) {
                    events.push({ type: "AUTONOMY_THREE_PRESENTED_NONE", payload: { choiceId: choice.choiceId, targetPlayerId } });
                    completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                    break;
                }
                beginChoice(state, { kind: "rank3-take", chooserId: choice.controllerId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, optionCardIds: selected, minSelections: 1, maxSelections: 1, stage: 2, context: { targetPlayerId, presentedCardIds: selected } }, events);
                events.push({ type: "AUTONOMY_THREE_CARDS_PRESENTED", payload: { choiceId: choice.choiceId, targetPlayerId, count: selected.length }, visibility: "public" });
                break;
            }
            if (action.submission.kind === "rank3-take") {
                const targetPlayerId = String(context.targetPlayerId);
                const cardId = selected[0];
                if (state.cards[cardId]?.zone !== `${targetPlayerId}_HAND`)
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Chosen presented card is no longer in the opponent hand");
                moveCard(state, cardId, `${choice.controllerId}_HAND`, choice.controllerId);
                events.push({ type: "AUTONOMY_THREE_CARD_TAKEN", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, targetPlayerId, cardId }, visibility: "authorized" });
                completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                break;
            }
            if (action.submission.kind === "rank3-discard") {
                const targetPlayerId = String(context.targetPlayerId);
                if (selected.some((id) => state.cards[id]?.zone !== `${targetPlayerId}_HAND`))
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Discard choices must remain in the opponent hand");
                for (const id of selected)
                    moveCard(state, id, "GY");
                events.push({ type: "AUTONOMY_THREE_OPPONENT_DISCARDED", payload: { choiceId: choice.choiceId, targetPlayerId, cardIds: selected }, visibility: "authorized" });
                completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                break;
            }
            if (action.submission.kind === "rank5-rummage") {
                const cardId = selected[0];
                if (state.cards[cardId]?.zone !== "GY")
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Rummage choice must remain in GY");
                moveCard(state, cardId, `${choice.controllerId}_HAND`, choice.controllerId);
                let bottomDraw = null;
                if (state.zones.gy.length > 0) {
                    bottomDraw = state.zones.gy[0];
                    moveCard(state, bottomDraw, `${choice.controllerId}_HAND`, choice.controllerId);
                }
                events.push({ type: "AUTONOMY_FIVE_RECYCLE_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, sourceCardId: choice.sourceCardId, rummagedCardId: cardId, bottomDrawCardId: bottomDraw }, visibility: "authorized" });
                completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                break;
            }
            if (action.submission.kind === "rank6-dig") {
                const drawn = [...(context.drawnCardIds ?? [])];
                const discardOptions = [...(context.discardOptionCardIds ?? [])];
                if (drawn.some((id) => state.cards[id]?.state.privateChoiceHeldBy !== choice.controllerId))
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Drawn Six cards are no longer sealed for this choice");
                if (action.submission.mode === "keep-all-discard") {
                    if (selected.length !== 1 || !discardOptions.includes(selected[0]))
                        return fail("AUTONOMY_PRIVATE_CHOICE_SELECTION", "Keep-all requires one legal discard");
                    for (const id of drawn) {
                        delete state.cards[id].state.privateChoiceHeldBy;
                        moveCard(state, id, `${choice.controllerId}_HAND`, choice.controllerId);
                    }
                    if (state.cards[selected[0]].zone !== `${choice.controllerId}_HAND`)
                        return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Six discard is no longer in hand");
                    moveCard(state, selected[0], "GY");
                    events.push({ type: "AUTONOMY_SIX_DIG_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, mode: action.submission.mode, drawnCardIds: drawn, keptCardIds: drawn.filter((id) => id !== selected[0]), discardedCardId: selected[0] }, visibility: "authorized" });
                }
                else {
                    const keepCount = Math.min(2, drawn.length);
                    if (selected.length !== keepCount || selected.some((id) => !drawn.includes(id)))
                        return fail("AUTONOMY_PRIVATE_CHOICE_SELECTION", `Six keep-return requires exactly ${keepCount} drawn cards to keep`);
                    const keep = new Set(selected);
                    const returned = drawn.filter((id) => !keep.has(id));
                    for (const id of selected) {
                        delete state.cards[id].state.privateChoiceHeldBy;
                        moveCard(state, id, `${choice.controllerId}_HAND`, choice.controllerId);
                    }
                    for (const id of returned) {
                        delete state.cards[id].state.privateChoiceHeldBy;
                        moveCard(state, id, "DP");
                        const dpIndex = state.zones.dp.indexOf(id);
                        state.zones.dp.splice(dpIndex, 1);
                        if (action.submission.mode === "keep-return-top")
                            state.zones.dp.unshift(id);
                        else
                            state.zones.dp.push(id);
                    }
                    events.push({ type: "AUTONOMY_SIX_DIG_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, mode: action.submission.mode, drawnCardIds: drawn, keptCardIds: selected, returnedCardIds: returned }, visibility: "authorized" });
                }
                completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                break;
            }
            if (action.submission.kind === "rank7-assign") {
                const revealed = [...(context.revealedCardIds ?? [])];
                if (revealed.some((id) => state.cards[id]?.state.privateChoiceHeldBy !== choice.controllerId))
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Revealed Seven cards are no longer sealed for this choice");
                let handCardId = null;
                let effectCardId = null;
                if (revealed.length === 1) {
                    if (selected.length !== 1 || selected[0] !== revealed[0])
                        return fail("AUTONOMY_PRIVATE_CHOICE_SELECTION", "Single-card Seven choice must select the revealed card");
                    if (action.submission.mode === "hand-only")
                        handCardId = selected[0];
                    else if (action.submission.mode === "effect-only")
                        effectCardId = selected[0];
                    else
                        return fail("AUTONOMY_PRIVATE_CHOICE_SELECTION", "Single-card Seven cannot use hand-and-effect");
                }
                else {
                    if (action.submission.mode !== "hand-and-effect" || selected.length !== 2 || new Set(selected).size !== 2 || selected.some((id) => !revealed.includes(id)))
                        return fail("AUTONOMY_PRIVATE_CHOICE_SELECTION", "Two-card Seven requires ordered [hand, effect] assignment");
                    handCardId = selected[0];
                    effectCardId = selected[1];
                }
                if (handCardId) {
                    delete state.cards[handCardId].state.privateChoiceHeldBy;
                    delete state.cards[handCardId].state.privateChoicePublicReveal;
                    moveCard(state, handCardId, `${choice.controllerId}_HAND`, choice.controllerId);
                }
                if (!effectCardId) {
                    for (const id of revealed.filter((entry) => entry !== handCardId)) {
                        delete state.cards[id].state.privateChoiceHeldBy;
                        delete state.cards[id].state.privateChoicePublicReveal;
                        moveCard(state, id, "DP");
                    }
                    events.push({ type: "AUTONOMY_SEVEN_ASSIGNMENT_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, handCardId, effectCardId: null }, visibility: "authorized" });
                    completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                    break;
                }
                beginChoice(state, { kind: "rank7-generated-effect", chooserId: choice.controllerId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, optionCardIds: [effectCardId], minSelections: 1, maxSelections: 1, stage: 2, context: { generatedCardId: effectCardId, handCardId } }, events);
                events.push({ type: "AUTONOMY_SEVEN_ASSIGNMENT_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, handCardId, effectCardId } });
                break;
            }
            if (action.submission.kind === "rank7-generated-effect") {
                const generatedCardId = String(context.generatedCardId);
                if (selected.length !== 1 || selected[0] !== generatedCardId || state.cards[generatedCardId]?.state.privateChoiceHeldBy !== choice.controllerId)
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Generated Seven effect card is unavailable");
                const generatedAction = action.submission.generatedAction;
                delete state.cards[generatedCardId].state.privateChoiceHeldBy;
                delete state.cards[generatedCardId].state.privateChoicePublicReveal;
                if (!generatedAction) {
                    moveCard(state, generatedCardId, "GY");
                    events.push({ type: "AUTONOMY_SEVEN_GENERATED_EFFECT_UNAVAILABLE", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId } });
                    completePrivateChoiceSource(state, choice.sourceCardId, choice.controllerId);
                    break;
                }
                const descriptor = primaryDescriptor(generatedAction);
                if (descriptor.sourceCardIds.length !== 1 || descriptor.sourceCardIds[0] !== generatedCardId || parseIdentity(state.cards[generatedCardId].identity)?.rank !== parseIdentity(state.cards[descriptor.sourceCardIds[0]].identity)?.rank)
                    return fail("AUTONOMY_PRIVATE_CHOICE_GENERATED", "Generated action must use exactly the sealed Seven card");
                moveCard(state, generatedCardId, `${choice.controllerId}_HAND`, choice.controllerId);
                clearPrivateChoice(state);
                const probe = resolvePhase9Action(state, choice.controllerId, generatedAction);
                if (!probe.ok)
                    return fail("AUTONOMY_PRIVATE_CHOICE_GENERATED", probe.message, { code: probe.code });
                if (state.cards[choice.sourceCardId]?.zone === "VOID" && state.cards[choice.sourceCardId]?.state.privateChoiceSource === true) {
                    delete state.cards[choice.sourceCardId].state.privateChoiceSource;
                    delete state.cards[choice.sourceCardId].state.draftFaceUp;
                    moveCard(state, choice.sourceCardId, "GY");
                }
                const item = declareAuthorityItem(state, choice.controllerId, `SEVEN-GENERATED-${descriptor.actionType}`, descriptor.sourceCardIds, descriptor.targetCardIds, { kind: "primary", action: canonicalClone(generatedAction), actionType: descriptor.actionType, stackClass: descriptor.stackClass }, descriptor.stackClass);
                events.push({ type: "AUTONOMY_SEVEN_GENERATED_EFFECT_DECLARED", payload: { choiceId: choice.choiceId, stackItemId: item.id, playerId: choice.controllerId, generatedCardId, actionKind: generatedAction.kind } });
                break;
            }
            if (action.submission.kind === "rank7-scoring-trigger") {
                const revealed = [...(context.revealedCardIds ?? [])];
                if (selected.length !== 1 || !revealed.includes(selected[0]))
                    return fail("AUTONOMY_PRIVATE_CHOICE_SELECTION", "Seven scoring trigger requires one revealed card");
                if (revealed.some((id) => state.cards[id]?.state.privateChoiceHeldBy !== choice.controllerId || state.cards[id]?.state.privateChoicePublicReveal !== true))
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Seven scoring trigger cards are no longer sealed and public");
                const takenCardId = selected[0];
                const returnedCardIds = revealed.filter((id) => id !== takenCardId);
                for (const id of revealed) {
                    delete state.cards[id].state.privateChoiceHeldBy;
                    delete state.cards[id].state.privateChoicePublicReveal;
                    delete state.cards[id].state.privateChoiceSource;
                }
                moveCard(state, takenCardId, `${choice.controllerId}_HAND`, choice.controllerId);
                for (const id of returnedCardIds) {
                    moveCard(state, id, "DP");
                    const index = state.zones.dp.indexOf(id);
                    state.zones.dp.splice(index, 1);
                    state.zones.dp.unshift(id);
                }
                clearPrivateChoice(state);
                events.push({ type: "AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED", payload: { choiceId: choice.choiceId, stackItemId: context.stackItemId ?? null, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, takenCardId, returnedCardIds } });
                reopenAfterResolution(state, choice.controllerId);
                break;
            }
            if (action.submission.kind === "nine-anchor-discard") {
                const targetPlayerId = String(context.targetPlayerId);
                const cardId = selected[0];
                if (state.cards[cardId]?.zone !== `${targetPlayerId}_HAND`)
                    return fail("AUTONOMY_PRIVATE_CHOICE_STALE", "Nine Anchor discard must remain in the opponent hand");
                moveCard(state, cardId, "GY");
                clearPrivateChoice(state);
                finishAutonomyAction(state, choice.controllerId);
                events.push({ type: "AUTONOMY_NINE_ANCHOR_DISCARD_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, targetPlayerId, sourceCardId: choice.sourceCardId, discardedCardId: cardId }, visibility: "authorized" });
                break;
            }
            return fail("AUTONOMY_PRIVATE_CHOICE", "Unsupported private choice submission");
        }
        case "autonomy-complete-turn": {
            const profileId = autonomyProfileId(state);
            if (!profileId || !SUPPORTED_AUTONOMY_PROFILES.has(profileId))
                return fail("AUTONOMY_PROFILE", "A supported First Contact autonomy profile is not active");
            if (state.activePlayerId !== actorId || state.phase !== "End")
                return fail("AUTONOMY_PHASE", "Full Turn completion requires the active player's End phase");
            const securedPoints = deriveSecuredPoints(state, actorId);
            if (securedPoints >= state.players[actorId].goal) {
                state.winner = actorId;
                autonomyRuntime(state).terminalReason = "NORMAL_VICTORY";
                events.push({ type: "AUTONOMY_NORMAL_VICTORY", payload: { playerId: actorId, securedPoints, goal: state.players[actorId].goal } });
                break;
            }
            const boardLock = state.metadata.boardLock;
            if ((boardLock?.turnsRemaining ?? 0) > 0 && boardLock.activationFullTurnId !== state.fullTurnSequence) {
                boardLock.turnsRemaining = Math.max(0, boardLock.turnsRemaining - 1);
                events.push({ type: "AUTONOMY_BOARD_LOCK_TICKED", payload: { turnsRemaining: boardLock.turnsRemaining, completedFullTurnId: state.fullTurnSequence, activatorId: boardLock.activatorId ?? null } });
                if (boardLock.turnsRemaining === 0) {
                    delete state.metadata.boardLock;
                    events.push({ type: "AUTONOMY_BOARD_LOCK_ENDED", payload: { completedFullTurnId: state.fullTurnSequence } });
                }
            }
            const runtime = autonomyRuntime(state);
            if (runtime.exhausted) {
                runtime.exhausted.remaining -= 1;
                events.push({ type: "AUTONOMY_EXHAUSTED_TICKED", payload: { remaining: runtime.exhausted.remaining, completedFullTurnSequence: state.fullTurnSequence } });
                if (runtime.exhausted.remaining <= 0) {
                    state.winner = exhaustedWinner(state);
                    runtime.terminalReason = state.winner === null ? "CANONICAL_DRAW" : "EXHAUSTED_RESOLUTION";
                    events.push({ type: "AUTONOMY_EXHAUSTED_RESOLVED", payload: { winner: state.winner, draw: state.winner === null, completedFullTurnSequence: state.fullTurnSequence } });
                    break;
                }
            }
            clearDisruptionsAtTurnEnd(state, actorId, events);
            const currentIndex = state.turnOrder.indexOf(actorId);
            const nextPlayerId = state.turnOrder[(currentIndex + 1) % state.turnOrder.length];
            state.fullTurnSequence += 1;
            state.activePlayerId = nextPlayerId;
            state.phase = "Start";
            events.push({ type: "AUTONOMY_FULL_TURN_COMPLETED", payload: { playerId: actorId, nextPlayerId, completedFullTurnSequence: state.fullTurnSequence - 1, profileId } });
            break;
        }
    }
    return { ok: true, state, events };
}
//# sourceMappingURL=phase9.js.map