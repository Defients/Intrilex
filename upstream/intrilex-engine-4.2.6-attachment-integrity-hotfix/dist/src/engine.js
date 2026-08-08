import { canonicalClone } from "./canonical-json.js";
import { EngineError } from "./errors.js";
import { hashCanonical } from "./hash.js";
import { applyAegis, applyTap, changeController, clearTap, hasAegis, isHandZone, isOttZone, markExileBound, markPlayedForEffect, processStartPhaseLifecycles, releaseNineTapsForScoring, revealUntilStart } from "./lifecycle.js";
import { moveCard } from "./state.js";
import { resolveRankAction } from "./ranks.js";
import { resolveInteractionAction } from "./interactions.js";
import { resolvePhase8Action } from "./phase8.js";
import { resolvePhase9Action } from "./phase9.js";
import { resolvePhase10Action } from "./phase10.js";
import { resolvePhase11Action } from "./phase11.js";
import { resolvePhase12Action } from "./phase12.js";
import { resolvePhase13Action } from "./phase13.js";
import { resolvePhase14Action } from "./phase14.js";
import { resolvePhase15Action } from "./phase15.js";
import { resolvePhase20Action } from "./phase20.js";
import { resolveCoreAuthorityAction } from "./core-authority.js";
import { assertValidState } from "./validation.js";
function nextEventId(state, index) {
    return `EV-${String(state.revision + index + 1).padStart(6, "0")}`;
}
function commitEvents(state, commandId, specs, previousStateHash) {
    const events = [];
    let previous = previousStateHash;
    specs.forEach((spec, index) => {
        state.revision += 1;
        const currentHash = hashCanonical(state);
        events.push({
            id: nextEventId({ ...state, revision: state.revision - 1 }, index),
            sequence: state.revision,
            commandId,
            type: spec.type,
            visibility: spec.visibility ?? "public",
            payload: spec.payload,
            previousStateHash: previous,
            stateHash: currentHash
        });
        previous = currentHash;
    });
    return events;
}
function fail(state, code, message, details) {
    return {
        accepted: false,
        state,
        events: [],
        error: details === undefined ? { code, message } : { code, message, details }
    };
}
function checkRequirement(state, requirement) {
    switch (requirement.kind) {
        case "other-hand-cards": {
            const player = state.players[requirement.playerId];
            if (!player)
                return `Unknown player ${requirement.playerId}`;
            const available = player.hand.filter((id) => !requirement.excludingSourceIds.includes(id)).length;
            return available >= requirement.minimum ? null : `Requires ${requirement.minimum} other hand card(s); found ${available}`;
        }
        case "card-in-zone": {
            const card = state.cards[requirement.cardId];
            return card?.zone === requirement.zone ? null : `${requirement.cardId} is not in ${requirement.zone}`;
        }
        case "target-unprotected": {
            const card = state.cards[requirement.cardId];
            if (!card)
                return `Unknown target ${requirement.cardId}`;
            return hasAegis(card) ? `${requirement.cardId} has Aegis` : null;
        }
        case "hand-cost-available": {
            const player = state.players[requirement.playerId];
            if (!player)
                return `Unknown player ${requirement.playerId}`;
            const missing = requirement.cardIds.filter((id) => !player.hand.includes(id));
            return missing.length === 0 ? null : `Missing hand cost cards: ${missing.join(", ")}`;
        }
        case "stack-item-exists":
            return state.stack.some((item) => item.id === requirement.stackItemId) ? null : `Missing stack item ${requirement.stackItemId}`;
    }
}
function stageDeclaration(state, command) {
    const staged = canonicalClone(state);
    const sourceIds = command.play.sourceCardIds;
    const costIds = command.stagedCostIds ?? [];
    const actor = staged.players[command.actorId];
    if (!actor)
        return { ok: false, reason: `Unknown actor ${command.actorId}` };
    for (const id of [...sourceIds, ...costIds]) {
        const card = staged.cards[id];
        if (!card)
            return { ok: false, reason: `Unknown card ${id}` };
        if (card.controllerId !== command.actorId)
            return { ok: false, reason: `${id} is not controlled by ${command.actorId}` };
        if (card.zone !== `${command.actorId}_HAND`)
            return { ok: false, reason: `${id} is not in ${command.actorId}'s hand` };
    }
    const beforeImageHash = hashCanonical(state);
    for (const id of [...sourceIds, ...costIds])
        moveCard(staged, id, "STAGING");
    staged.pendingDeclaration = {
        commandId: command.id,
        beforeImageHash,
        play: canonicalClone(command.play),
        stagedSourceIds: [...sourceIds],
        stagedCostIds: [...costIds]
    };
    for (const requirement of command.play.requirements) {
        const failure = checkRequirement(staged, requirement);
        if (failure)
            return { ok: false, reason: failure };
    }
    return { ok: true, state: staged };
}
function commitDeclaration(staged, command) {
    const state = canonicalClone(staged);
    const pending = state.pendingDeclaration;
    if (!pending)
        throw new EngineError("DECLARATION", "No staged declaration to commit");
    const itemId = `SI-${command.id}`;
    for (const id of pending.stagedSourceIds)
        moveCard(state, id, "ON_STACK");
    for (const id of pending.stagedCostIds)
        moveCard(state, id, "GY");
    const item = {
        id: itemId,
        controllerId: command.play.controllerId,
        sourceCardIds: [...command.play.sourceCardIds],
        targetCardIds: [...command.play.targetCardIds],
        kind: command.play.kind,
        revalidationClass: command.play.revalidationClass,
        instructions: canonicalClone(command.play.instructions),
        sourceDestination: command.play.sourceDestination ?? "GY",
        status: "pending"
    };
    state.stack.push(item);
    state.pendingDeclaration = null;
    state.zones.staging = [];
    const nextIndex = (state.turnOrder.indexOf(command.actorId) + 1) % state.turnOrder.length;
    state.priority = { order: [...state.turnOrder], index: nextIndex, consecutivePasses: 0, open: true };
    return state;
}
function targetLegal(state, cardId) {
    const card = state.cards[cardId];
    return card !== undefined && card.zone !== "VOID" && card.zone !== "GY" && card.zone !== "EXILE" && card.zone !== "DP" && card.zone !== "ON_STACK" && card.zone !== "STAGING" && !hasAegis(card);
}
function revalidate(state, item) {
    const legal = item.targetCardIds.filter((id) => targetLegal(state, id));
    switch (item.revalidationClass) {
        case "none": return { fizzle: false, legalTargetIds: item.targetCardIds };
        case "single-required-target": return { fizzle: item.targetCardIds.length !== 1 || legal.length !== 1, legalTargetIds: legal };
        case "independent-targets": return { fizzle: false, legalTargetIds: legal };
        case "all-or-nothing": return { fizzle: legal.length !== item.targetCardIds.length, legalTargetIds: legal };
        case "structural": return { fizzle: false, legalTargetIds: item.targetCardIds };
    }
}
function lockCards(state, item, ids) {
    for (const id of ids) {
        const card = state.cards[id];
        if (card && card.zone !== "ON_STACK")
            card.state.lockedBy = item.id;
    }
}
function unlockCards(state, itemId) {
    for (const card of Object.values(state.cards)) {
        if (card.state.lockedBy === itemId)
            delete card.state.lockedBy;
    }
}
function executeInstruction(state, item, instruction, legalTargetIds, specs) {
    switch (instruction.op) {
        case "discard": {
            const player = state.players[instruction.playerId];
            if (!player)
                throw new EngineError("INSTRUCTION", `Unknown player ${instruction.playerId}`);
            const available = instruction.cardIds.filter((id) => player.hand.includes(id));
            if (available.length < instruction.requiredMinimum)
                return false;
            for (const id of available)
                moveCard(state, id, "GY");
            specs.push({ type: "CARDS_DISCARDED", payload: { playerId: instruction.playerId, cardIds: available } });
            return true;
        }
        case "draw-keep-return": {
            const drawn = state.zones.dp.splice(0, Math.min(instruction.drawCount, state.zones.dp.length));
            for (const id of drawn)
                state.cards[id].zone = "VOID";
            const keepSet = new Set(instruction.keepIds);
            const returnSet = new Set(instruction.returnIds);
            for (const id of drawn) {
                if (keepSet.has(id))
                    moveCard(state, id, `${instruction.playerId}_HAND`);
                else if (returnSet.has(id))
                    moveCard(state, id, "DP");
                else
                    moveCard(state, id, "DP");
            }
            specs.push({ type: "CARDS_DRAWN_AND_SELECTED", payload: { playerId: instruction.playerId, drawn, kept: instruction.keepIds, returned: instruction.returnIds }, visibility: "authorized" });
            return true;
        }
        case "change-goal": {
            const player = state.players[instruction.playerId];
            if (!player)
                throw new EngineError("INSTRUCTION", `Unknown player ${instruction.playerId}`);
            player.goal += instruction.delta;
            specs.push({ type: "GOAL_CHANGED", payload: { playerId: instruction.playerId, delta: instruction.delta, goal: player.goal } });
            return true;
        }
        case "take-card": {
            if (!state.cards[instruction.cardId])
                return false;
            moveCard(state, instruction.cardId, `${instruction.playerId}_HAND`, instruction.playerId);
            if (instruction.revealUntilStart === true) {
                revealUntilStart(state.cards[instruction.cardId], {
                    playerId: instruction.playerId,
                    startSequence: (state.startPhaseSequenceByPlayer[instruction.playerId] ?? 0) + 1
                });
            }
            specs.push({ type: "CARD_TAKEN", payload: { cardId: instruction.cardId, playerId: instruction.playerId }, visibility: "authorized" });
            return true;
        }
        case "move-card": {
            if (!state.cards[instruction.cardId])
                return false;
            const actualDestination = moveCard(state, instruction.cardId, instruction.zone, instruction.controllerId);
            specs.push({ type: "CARD_MOVED", payload: actualDestination === instruction.zone ? instruction : { ...instruction, actualDestination } });
            return true;
        }
        case "remove-target": {
            if (!legalTargetIds.includes(instruction.cardId) && item.revalidationClass !== "structural")
                return true;
            if (!state.cards[instruction.cardId])
                return false;
            const actualDestination = moveCard(state, instruction.cardId, instruction.destination);
            specs.push({ type: "TARGET_REMOVED", payload: actualDestination === instruction.destination
                    ? { cardId: instruction.cardId, destination: instruction.destination }
                    : { cardId: instruction.cardId, requestedDestination: instruction.destination, actualDestination } });
            return true;
        }
        case "enqueue-trigger":
            state.triggerQueue.push(canonicalClone(instruction.trigger));
            specs.push({ type: "TRIGGER_QUEUED", payload: { triggerId: instruction.trigger.id } });
            return true;
        case "set-marker": {
            const card = state.cards[instruction.cardId];
            if (!card)
                return false;
            card.state[instruction.key] = instruction.value;
            specs.push({ type: "MARKER_SET", payload: instruction });
            return true;
        }
        case "rebind-stack-item": {
            const target = state.stack.find((candidate) => candidate.id === instruction.stackItemId);
            if (!target)
                return false;
            target.controllerId = instruction.controllerId;
            if (instruction.replacementInstructions !== undefined)
                target.instructions = canonicalClone(instruction.replacementInstructions);
            if (instruction.replacementTargetIds !== undefined)
                target.targetCardIds = [...instruction.replacementTargetIds];
            specs.push({ type: "STACK_ITEM_REBOUND", payload: { stackItemId: instruction.stackItemId, controllerId: instruction.controllerId } });
            return true;
        }
        case "record":
            state.metadata[instruction.label] = instruction.data ?? true;
            specs.push({ type: "FACT_RECORDED", payload: { label: instruction.label, data: instruction.data } });
            return true;
    }
}
function finishSources(state, item) {
    for (const id of item.sourceCardIds) {
        const card = state.cards[id];
        if (!card || card.zone !== "ON_STACK")
            continue;
        moveCard(state, id, item.sourceDestination);
    }
}
function triggerToStackItem(trigger) {
    return {
        id: `TRIGGER-${trigger.id}`,
        controllerId: trigger.controllerId,
        sourceCardIds: [],
        targetCardIds: [],
        kind: trigger.kind,
        revalidationClass: "none",
        instructions: canonicalClone(trigger.instructions),
        sourceDestination: "VOID",
        status: "pending"
    };
}
function resolveTop(state) {
    const next = canonicalClone(state);
    const item = next.stack.at(-1);
    if (!item)
        throw new EngineError("STACK_EMPTY", "Cannot resolve an empty stack");
    item.status = "resolving";
    const specs = [{ type: "RESOLUTION_BEGAN", payload: { stackItemId: item.id, kind: item.kind } }];
    if (item.counterTargetId) {
        const targetIndex = next.stack.findIndex((candidate) => candidate.id === item.counterTargetId);
        if (targetIndex >= 0) {
            const [target] = next.stack.splice(targetIndex, 1);
            if (target) {
                target.status = "countered";
                finishSources(next, target);
                specs.push({ type: "STACK_ITEM_COUNTERED", payload: { counterId: item.id, targetId: target.id } });
            }
        }
        finishSources(next, item);
        const ownIndex = next.stack.findIndex((candidate) => candidate.id === item.id);
        if (ownIndex >= 0)
            next.stack.splice(ownIndex, 1);
    }
    else {
        const validation = revalidate(next, item);
        if (validation.fizzle) {
            item.status = "fizzled";
            finishSources(next, item);
            next.stack.pop();
            specs.push({ type: "STACK_ITEM_FIZZLED", payload: { stackItemId: item.id, targetIds: item.targetCardIds } });
        }
        else {
            lockCards(next, item, validation.legalTargetIds);
            let ok = true;
            for (const instruction of item.instructions) {
                if (!executeInstruction(next, item, instruction, validation.legalTargetIds, specs)) {
                    ok = false;
                    break;
                }
            }
            unlockCards(next, item.id);
            item.status = ok ? "resolved" : "fizzled";
            finishSources(next, item);
            next.stack.pop();
            specs.push({ type: ok ? "STACK_ITEM_RESOLVED" : "STACK_ITEM_FIZZLED", payload: { stackItemId: item.id } });
        }
    }
    if (next.triggerQueue.length > 0) {
        const queued = [...next.triggerQueue];
        next.triggerQueue = [];
        for (const trigger of queued)
            next.stack.push(triggerToStackItem(trigger));
        specs.push({ type: "TRIGGERS_FLUSHED", payload: { triggerIds: queued.map((trigger) => trigger.id) } });
    }
    if (next.stack.length > 0) {
        const controllerId = next.stack.at(-1).controllerId;
        const nextIndex = (next.turnOrder.indexOf(controllerId) + 1) % next.turnOrder.length;
        next.priority = { order: [...next.turnOrder], index: nextIndex, consecutivePasses: 0, open: true };
    }
    else {
        next.priority = null;
    }
    return { state: next, specs };
}
function commitDirectCommand(original, command, next, specs, previousHash) {
    const events = commitEvents(next, command.id, specs, previousHash);
    assertValidState(next);
    return { accepted: true, state: next, events };
}
function requireCard(state, cardId) {
    const card = state.cards[cardId];
    if (!card)
        throw new EngineError("CARD_UNKNOWN", `Unknown card ${cardId}`);
    return card;
}
export class IntrilexEngine {
    execute(inputState, command) {
        assertValidState(inputState);
        const original = canonicalClone(inputState);
        const previousHash = hashCanonical(original);
        try {
            switch (command.type) {
                case "DECLARE_PLAY":
                case "RESPOND_WITH_PLAY": {
                    if (command.type === "RESPOND_WITH_PLAY") {
                        const priority = original.priority;
                        if (!priority?.open || priority.order[priority.index] !== command.actorId) {
                            return fail(original, "PRIORITY", `${command.actorId} does not hold priority`);
                        }
                    }
                    const staged = stageDeclaration(original, command);
                    if (!staged.ok) {
                        if (hashCanonical(original) !== previousHash)
                            throw new EngineError("ROLLBACK", "Illegal declaration changed the before-image");
                        return fail(original, "DECLARATION_ILLEGAL", staged.reason, { beforeImageHash: previousHash, afterRewindHash: hashCanonical(original) });
                    }
                    const next = commitDeclaration(staged.state, command);
                    const events = commitEvents(next, command.id, [{ type: "DECLARATION_COMMITTED", payload: { stackItemId: `SI-${command.id}`, kind: command.play.kind, sourceCardIds: command.play.sourceCardIds, targetCardIds: command.play.targetCardIds } }], previousHash);
                    assertValidState(next);
                    return { accepted: true, state: next, events };
                }
                case "PASS_PRIORITY": {
                    const next = canonicalClone(original);
                    const priority = next.priority;
                    if (!priority?.open)
                        return fail(original, "PRIORITY_CLOSED", "No priority window is open");
                    if (priority.order[priority.index] !== command.actorId)
                        return fail(original, "PRIORITY", `${command.actorId} does not hold priority`);
                    priority.consecutivePasses += 1;
                    priority.index = (priority.index + 1) % priority.order.length;
                    const specs = [{ type: "PRIORITY_PASSED", payload: { playerId: command.actorId, consecutivePasses: priority.consecutivePasses } }];
                    if (priority.consecutivePasses >= priority.order.length) {
                        priority.open = false;
                        specs.push({ type: "PRIORITY_CLOSED", payload: { reason: "all-players-passed" } });
                    }
                    const events = commitEvents(next, command.id, specs, previousHash);
                    assertValidState(next);
                    return { accepted: true, state: next, events };
                }
                case "RESOLVE_TOP": {
                    if (original.priority?.open)
                        return fail(original, "PRIORITY_OPEN", "Cannot resolve while priority is open");
                    const resolved = resolveTop(original);
                    const events = commitEvents(resolved.state, command.id, resolved.specs, previousHash);
                    assertValidState(resolved.state);
                    return { accepted: true, state: resolved.state, events };
                }
                case "COUNTER_TOP": {
                    const priority = original.priority;
                    if (!priority?.open || priority.order[priority.index] !== command.actorId)
                        return fail(original, "PRIORITY", `${command.actorId} does not hold priority`);
                    const target = original.stack.at(-1);
                    if (!target)
                        return fail(original, "STACK_EMPTY", "No stack item to counter");
                    const play = {
                        kind: "counter",
                        controllerId: command.actorId,
                        sourceCardIds: command.sourceCardIds,
                        targetCardIds: [],
                        requirements: [],
                        revalidationClass: "none",
                        instructions: [],
                        sourceDestination: "GY"
                    };
                    const stagedCommand = { id: command.id, type: "RESPOND_WITH_PLAY", actorId: command.actorId, play };
                    const staged = stageDeclaration(original, stagedCommand);
                    if (!staged.ok)
                        return fail(original, "DECLARATION_ILLEGAL", staged.reason);
                    const next = commitDeclaration(staged.state, stagedCommand);
                    next.stack.at(-1).counterTargetId = target.id;
                    const events = commitEvents(next, command.id, [{ type: "COUNTER_DECLARED", payload: { counterId: `SI-${command.id}`, targetId: target.id } }], previousHash);
                    assertValidState(next);
                    return { accepted: true, state: next, events };
                }
                case "APPLY_AEGIS": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    if (!isOttZone(card.zone))
                        return fail(original, "AEGIS_ZONE", "Aegis can be applied only to an OTT card");
                    if (!next.players[command.expiresAt.playerId] || command.expiresAt.startSequence <= (next.startPhaseSequenceByPlayer[command.expiresAt.playerId] ?? 0)) {
                        return fail(original, "AEGIS_EXPIRY", "Aegis requires an exact future Start event");
                    }
                    const granted = applyAegis(card, command.sourceRef, command.expiresAt);
                    return commitDirectCommand(original, command, next, [{
                            type: granted ? "AEGIS_APPLIED" : "AEGIS_GRANT_FAILED",
                            payload: { cardId: command.cardId, sourceRef: command.sourceRef, expiresAt: command.expiresAt, reason: granted ? undefined : "rank-nine-immunity" }
                        }], previousHash);
                }
                case "APPLY_TAP": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    if (!isOttZone(card.zone))
                        return fail(original, "TAP_ZONE", "Tap State can be applied only to an OTT card");
                    if (command.tapState.kind === "start-phase") {
                        const ref = command.tapState.expiresAt;
                        if (!next.players[ref.playerId] || ref.startSequence <= (next.startPhaseSequenceByPlayer[ref.playerId] ?? 0)) {
                            return fail(original, "TAP_EXPIRY", "Start-based Tap State requires an exact future Start event");
                        }
                    }
                    applyTap(card, command.tapState);
                    return commitDirectCommand(original, command, next, [{ type: "TAP_APPLIED", payload: { cardId: command.cardId, tapState: command.tapState } }], previousHash);
                }
                case "CLEAR_TAP": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    clearTap(card);
                    return commitDirectCommand(original, command, next, [{ type: "TAP_CLEARED", payload: { cardId: command.cardId, reason: command.reason } }], previousHash);
                }
                case "GRANT_REVEAL_UNTIL_START": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    if (!isHandZone(card.zone))
                        return fail(original, "REVEAL_ZONE", "Revealed-Until-Start can be applied only to a hand card");
                    if (!next.players[command.expiresAt.playerId] || command.expiresAt.startSequence <= (next.startPhaseSequenceByPlayer[command.expiresAt.playerId] ?? 0)) {
                        return fail(original, "REVEAL_EXPIRY", "Reveal marker requires an exact future Start event");
                    }
                    revealUntilStart(card, command.expiresAt);
                    return commitDirectCommand(original, command, next, [{ type: "REVEAL_APPLIED", payload: { cardId: command.cardId, expiresAt: command.expiresAt } }], previousHash);
                }
                case "SET_PLAYED_FOR_EFFECT": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    if (command.value && !isOttZone(card.zone))
                        return fail(original, "PLAYED_FOR_EFFECT_ZONE", "Played-for-Effect persists only while the card is OTT");
                    markPlayedForEffect(card, command.value);
                    return commitDirectCommand(original, command, next, [{ type: "PLAYED_FOR_EFFECT_CHANGED", payload: { cardId: command.cardId, value: command.value } }], previousHash);
                }
                case "SET_EXILE_BOUND": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    markExileBound(card);
                    return commitDirectCommand(original, command, next, [{ type: "EXILE_BOUND_APPLIED", payload: { cardId: command.cardId } }], previousHash);
                }
                case "CHANGE_CONTROLLER": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    if (!next.players[command.controllerId])
                        return fail(original, "PLAYER_UNKNOWN", `Unknown controller ${command.controllerId}`);
                    const previousControllerId = card.controllerId;
                    changeController(card, command.controllerId);
                    return commitDirectCommand(original, command, next, [{ type: "CONTROLLER_CHANGED", payload: { cardId: command.cardId, previousControllerId, controllerId: command.controllerId } }], previousHash);
                }
                case "MOVE_CARD": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    const from = card.zone;
                    const actualDestination = moveCard(next, command.cardId, command.destination, command.controllerId);
                    return commitDirectCommand(original, command, next, [{ type: "CARD_MOVED", payload: { cardId: command.cardId, from, requestedDestination: command.destination, actualDestination, controllerId: next.cards[command.cardId].controllerId } }], previousHash);
                }
                case "BEGIN_START_PHASE": {
                    const next = canonicalClone(original);
                    if (!next.players[command.playerId])
                        return fail(original, "PLAYER_UNKNOWN", `Unknown player ${command.playerId}`);
                    if (next.stack.length > 0 || next.pendingDeclaration !== null || next.priority?.open === true)
                        return fail(original, "START_BLOCKED", "Cannot begin a Start Phase while game objects are pending");
                    const transitions = processStartPhaseLifecycles(next, command.playerId);
                    return commitDirectCommand(original, command, next, transitions, previousHash);
                }
                case "SCORE_CARD": {
                    const next = canonicalClone(original);
                    const card = requireCard(next, command.cardId);
                    if (!next.players[command.playerId])
                        return fail(original, "PLAYER_UNKNOWN", `Unknown scoring player ${command.playerId}`);
                    if (card.controllerId !== command.playerId)
                        return fail(original, "SCORE_CONTROLLER", `${command.playerId} does not control ${command.cardId}`);
                    if (!isHandZone(card.zone))
                        return fail(original, "SCORE_ZONE", "This Phase 5 scoring primitive requires a hand card");
                    const from = card.zone;
                    moveCard(next, command.cardId, `${command.playerId}_PR`, command.playerId);
                    const transitions = [{ type: "CARD_SCORED", payload: { cardId: command.cardId, playerId: command.playerId, from } }, ...releaseNineTapsForScoring(next, command.playerId)];
                    return commitDirectCommand(original, command, next, transitions, previousHash);
                }
                case "RESOLVE_RANK_ACTION": {
                    const resolved = resolveRankAction(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_INTERACTION_ACTION": {
                    const resolved = resolveInteractionAction(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE8_ACTION": {
                    const resolved = resolvePhase8Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE9_ACTION": {
                    const resolved = resolvePhase9Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE10_ACTION": {
                    const resolved = resolvePhase10Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE11_ACTION": {
                    const resolved = resolvePhase11Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE12_ACTION": {
                    const resolved = resolvePhase12Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE13_ACTION": {
                    const resolved = resolvePhase13Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE14_ACTION": {
                    const resolved = resolvePhase14Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE15_ACTION": {
                    const resolved = resolvePhase15Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_PHASE20_ACTION": {
                    const resolved = resolvePhase20Action(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "RESOLVE_CORE_AUTHORITY_ACTION": {
                    const resolved = resolveCoreAuthorityAction(original, command.actorId, command.action);
                    if (!resolved.ok)
                        return fail(original, resolved.code, resolved.message, resolved.details);
                    return commitDirectCommand(original, command, resolved.state, resolved.events, previousHash);
                }
                case "HIDDEN_CHOICE": {
                    const next = canonicalClone(original);
                    const choices = next.metadata.hiddenChoices ?? {};
                    choices[command.choiceId] = command.payload;
                    next.metadata.hiddenChoices = choices;
                    const events = commitEvents(next, command.id, [{ type: "HIDDEN_CHOICE_RECORDED", payload: { choiceId: command.choiceId, value: command.payload }, visibility: command.visibility }], previousHash);
                    assertValidState(next);
                    return { accepted: true, state: next, events };
                }
                case "NOOP": {
                    const next = canonicalClone(original);
                    const events = commitEvents(next, command.id, [{ type: "NOOP_RECORDED", payload: { label: command.label } }], previousHash);
                    assertValidState(next);
                    return { accepted: true, state: next, events };
                }
            }
        }
        catch (error) {
            const data = error instanceof EngineError ? error.data : { code: "ENGINE_FAILURE", message: error instanceof Error ? error.message : String(error) };
            return { accepted: false, state: original, events: [], error: data };
        }
    }
}
//# sourceMappingURL=engine.js.map