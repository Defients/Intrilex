import { canonicalClone } from "./canonical-json.js";
import { nextIndex } from "./rng.js";
import { moveCard } from "./state.js";
import { nextPlayerAssignments } from "./phase11.js";
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
export const DEFAULT_DEFFY_ADDONS = Object.freeze({
    speedRun: false,
    thatsUrz: false,
    thirdPartied: false,
    mirrorMe: false
});
export function phase14Runtime(state) {
    const current = state.metadata.phase14;
    return {
        enabled: current?.enabled ?? false,
        subMode: current?.subMode ?? null,
        status: current?.status ?? "unconfigured",
        targetHandSizes: canonicalClone(current?.targetHandSizes ?? {}),
        draftOrder: canonicalClone(current?.draftOrder ?? []),
        nextDrafterIndex: current?.nextDrafterIndex ?? 0,
        assignmentByDrafter: canonicalClone(current?.assignmentByDrafter ?? {}),
        poolFaceUpByCard: canonicalClone(current?.poolFaceUpByCard ?? {}),
        draftedFor: canonicalClone(current?.draftedFor ?? {}),
        faceDownPicksByDrafter: canonicalClone(current?.faceDownPicksByDrafter ?? {}),
        faceUpPicksByDrafter: canonicalClone(current?.faceUpPicksByDrafter ?? {}),
        addOns: { ...DEFAULT_DEFFY_ADDONS, ...(current?.addOns ?? {}) },
        rngAudit: canonicalClone(current?.rngAudit ?? []),
        specsMayBeRevealed: current?.specsMayBeRevealed ?? false,
        trapPlacementDuringDraft: false,
        lastResolution: current?.lastResolution ? canonicalClone(current.lastResolution) : null
    };
}
function saveRuntime(state, runtime) {
    state.metadata.phase14 = runtime;
}
export function deffyPoolShape(subMode, playerCount) {
    switch (subMode) {
        case "classic": return { total: 21, faceUp: 16, faceDown: 5, privatePools: false };
        case "icu": return { total: 12, faceUp: 12, faceDown: 0, privatePools: false };
        case "soda": {
            if (playerCount !== 2)
                throw new Error("Soda is available only with exactly two players");
            return { total: 16, faceUp: 14, faceDown: 2, privatePools: true };
        }
        case "mystery-mix": return { total: 14, faceUp: 6, faceDown: 8, privatePools: false };
        case "deffy-moment": return { total: "all", faceUp: "all", faceDown: 0, privatePools: false };
    }
}
export function normalDeffyTargets(turnOrder) {
    if (turnOrder.length === 2)
        return { [turnOrder[0]]: 5, [turnOrder[1]]: 6 };
    if (turnOrder.length === 3)
        return { [turnOrder[0]]: 5, [turnOrder[1]]: 6, [turnOrder[2]]: 6 };
    if (turnOrder.length === 4)
        return Object.fromEntries(turnOrder.map((id) => [id, 5]));
    throw new Error("Deffy Mode supports two to four players");
}
export function validateAssignmentBijection(turnOrder, assignments) {
    if (turnOrder.length < 2 || new Set(turnOrder).size !== turnOrder.length)
        return "Draft order must contain unique players";
    const sources = Object.keys(assignments).sort();
    const expected = [...turnOrder].sort();
    if (JSON.stringify(sources) !== JSON.stringify(expected))
        return "Every drafter requires exactly one assignment";
    const targets = turnOrder.map((id) => assignments[id]);
    if (targets.some((id) => id === undefined || !turnOrder.includes(id)))
        return "Every assignment target must be a draft participant";
    if (new Set(targets).size !== turnOrder.length)
        return "That's Urz assignment must be bijective";
    if (turnOrder.some((id) => assignments[id] === id))
        return "That's Urz assignment must be self-free";
    return null;
}
export function deterministicShuffle(values, state) {
    const output = [...values];
    const cursorBefore = state.rng.cursor;
    for (let index = output.length - 1; index > 0; index -= 1) {
        const swapWith = nextIndex(state.rng, index + 1);
        [output[index], output[swapWith]] = [output[swapWith], output[index]];
    }
    const runtime = phase14Runtime(state);
    runtime.rngAudit.push({ operation: "shuffle", cursorBefore, cursorAfter: state.rng.cursor });
    saveRuntime(state, runtime);
    return output;
}
function isPoolCard(state, cardId) {
    return state.cards[cardId]?.zone === "STAGING" && state.zones.staging.includes(cardId);
}
function nextEligibleDrafter(runtime) {
    for (let offset = 0; offset < runtime.draftOrder.length; offset += 1) {
        const index = (runtime.nextDrafterIndex + offset) % runtime.draftOrder.length;
        const playerId = runtime.draftOrder[index];
        const recipient = runtime.assignmentByDrafter[playerId] ?? playerId;
        if ((runtime.draftedFor[recipient]?.length ?? 0) < (runtime.targetHandSizes[recipient] ?? 0)) {
            runtime.nextDrafterIndex = index;
            return playerId;
        }
    }
    return null;
}
function pickCard(state, runtime, drafterId, cardId, events) {
    if (runtime.status !== "drafting")
        return "Draft is not active";
    const expectedDrafter = nextEligibleDrafter(runtime);
    if (expectedDrafter !== drafterId)
        return `Expected drafter ${String(expectedDrafter)}`;
    if (!isPoolCard(state, cardId))
        return `${cardId} is not in the draft pool`;
    const recipientId = runtime.assignmentByDrafter[drafterId] ?? drafterId;
    const target = runtime.targetHandSizes[recipientId];
    if (target === undefined)
        return `Missing target size for ${recipientId}`;
    if ((runtime.draftedFor[recipientId]?.length ?? 0) >= target)
        return `${recipientId} already reached target size`;
    const faceUp = runtime.poolFaceUpByCard[cardId] !== false;
    const totalPicks = Object.values(runtime.draftedFor).reduce((sum, ids) => sum + ids.length, 0);
    if (totalPicks === 0 && drafterId === runtime.draftOrder[0] && !faceUp)
        return "The starting player's first pick cannot be face-down";
    const faceDownLimit = runtime.subMode === "mystery-mix" ? Number.POSITIVE_INFINITY : 2;
    if (!faceUp && (runtime.faceDownPicksByDrafter[drafterId] ?? 0) >= faceDownLimit)
        return `${drafterId} reached the face-down pick cap`;
    moveCard(state, cardId, `${recipientId}_HAND`, recipientId);
    delete state.cards[cardId].state.draftFaceUp;
    runtime.draftedFor[recipientId] = [...(runtime.draftedFor[recipientId] ?? []), cardId];
    if (faceUp)
        runtime.faceUpPicksByDrafter[drafterId] = (runtime.faceUpPicksByDrafter[drafterId] ?? 0) + 1;
    else
        runtime.faceDownPicksByDrafter[drafterId] = (runtime.faceDownPicksByDrafter[drafterId] ?? 0) + 1;
    delete runtime.poolFaceUpByCard[cardId];
    runtime.nextDrafterIndex = (runtime.nextDrafterIndex + 1) % runtime.draftOrder.length;
    events.push({
        type: faceUp ? "DEFFY_FACE_UP_PICK" : "DEFFY_FACE_DOWN_PICK",
        payload: faceUp ? { drafterId, recipientId, cardId } : { drafterId, recipientId, cardId },
        visibility: faceUp ? "public" : "authorized"
    });
    return null;
}
function validateTargetSizes(state, runtime) {
    for (const playerId of runtime.draftOrder) {
        const expected = runtime.targetHandSizes[playerId];
        if (!Number.isInteger(expected) || expected < 1)
            return `Invalid target size for ${playerId}`;
        if (state.players[playerId].hand.length !== expected)
            return `${playerId} has ${state.players[playerId].hand.length}; expected ${expected}`;
    }
    if (runtime.subMode === "mystery-mix") {
        for (const drafter of runtime.draftOrder)
            if ((runtime.faceUpPicksByDrafter[drafter] ?? 0) < 1)
                return `${drafter} must take at least one face-up card`;
    }
    return null;
}
function configureRuntime(state, action) {
    if (state.stack.length > 0 || state.pendingDeclaration !== null || state.priority?.open === true)
        return "Deffy setup cannot begin while gameplay objects are pending";
    if (action.turnOrder.length < 2 || action.turnOrder.length > 4 || new Set(action.turnOrder).size !== action.turnOrder.length || action.turnOrder.some((id) => !state.players[id]))
        return "Draft order must contain two to four unique existing players";
    try {
        deffyPoolShape(action.subMode, action.turnOrder.length);
    }
    catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    const targets = action.targetHandSizes ?? normalDeffyTargets(action.turnOrder);
    if (action.subMode === "soda") {
        for (const id of action.turnOrder)
            if (targets[id] !== 6)
                return "Soda gives each player exactly six cards";
    }
    const addOns = { ...DEFAULT_DEFFY_ADDONS, ...(action.addOns ?? {}) };
    const assignments = addOns.thatsUrz ? (action.assignments ?? nextPlayerAssignments(action.turnOrder)) : Object.fromEntries(action.turnOrder.map((id) => [id, id]));
    if (addOns.thatsUrz) {
        const problem = validateAssignmentBijection(action.turnOrder, assignments);
        if (problem)
            return problem;
    }
    return {
        enabled: true,
        subMode: action.subMode,
        status: "drafting",
        targetHandSizes: canonicalClone(targets),
        draftOrder: [...action.turnOrder],
        nextDrafterIndex: 0,
        assignmentByDrafter: canonicalClone(assignments),
        poolFaceUpByCard: {},
        draftedFor: Object.fromEntries(action.turnOrder.map((id) => [id, []])),
        faceDownPicksByDrafter: Object.fromEntries(action.turnOrder.map((id) => [id, 0])),
        faceUpPicksByDrafter: Object.fromEntries(action.turnOrder.map((id) => [id, 0])),
        addOns,
        rngAudit: [],
        specsMayBeRevealed: false,
        trapPlacementDuringDraft: false,
        lastResolution: null
    };
}
function initializePool(state, runtime, poolCardIds, faceDownCardIds) {
    const shape = deffyPoolShape(runtime.subMode, runtime.draftOrder.length);
    if (new Set(poolCardIds).size !== poolCardIds.length || new Set(faceDownCardIds).size !== faceDownCardIds.length || faceDownCardIds.some((id) => !poolCardIds.includes(id)))
        return "Pool and face-down IDs must be unique and consistent";
    if (shape.total !== "all" && poolCardIds.length !== shape.total)
        return `${runtime.subMode} requires ${shape.total} pool cards`;
    if (shape.total === "all" && poolCardIds.length !== state.zones.dp.length)
        return "Deffy Moment must display every legal DP card";
    if (faceDownCardIds.length !== shape.faceDown)
        return `${runtime.subMode} requires ${shape.faceDown} face-down cards`;
    if (poolCardIds.some((id) => state.cards[id]?.zone !== "DP"))
        return "Every pool card must begin in DP";
    for (const id of poolCardIds) {
        moveCard(state, id, "STAGING");
        const faceUp = !faceDownCardIds.includes(id);
        state.cards[id].state.draftFaceUp = faceUp;
        runtime.poolFaceUpByCard[id] = faceUp;
    }
    return null;
}
function mirrorIdentity(identity) {
    if (identity === "RJ")
        return "BJ";
    if (identity === "BJ")
        return "RJ";
    const rank = identity.match(/^(10|[A2-9JQK])/)?.[1];
    return rank ?? null;
}
export function resolvePhase14Action(input, actorId, action) {
    if (!input.players[actorId])
        return fail("PHASE14_PLAYER", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    let runtime = phase14Runtime(state);
    const events = [];
    switch (action.kind) {
        case "configure-deffy": {
            const configured = configureRuntime(state, action);
            if (typeof configured === "string")
                return fail("DEFFY_CONFIG", configured);
            runtime = configured;
            state.phase = "Setup";
            state.turnOrder = [...action.turnOrder];
            state.activePlayerId = action.turnOrder[0];
            saveRuntime(state, runtime);
            events.push({ type: "DEFFY_MODE_CONFIGURED", payload: { subMode: action.subMode, turnOrder: action.turnOrder, targetHandSizes: runtime.targetHandSizes, addOns: runtime.addOns, assignments: runtime.assignmentByDrafter } });
            return { ok: true, state, events };
        }
        case "initialize-draft-pool": {
            if (!runtime.enabled || runtime.status !== "drafting")
                return fail("DEFFY_NOT_CONFIGURED", "Configure Deffy Mode before creating a pool");
            if (state.zones.staging.length > 0)
                return fail("DEFFY_POOL_EXISTS", "Draft pool already exists");
            const problem = initializePool(state, runtime, action.poolCardIds, action.faceDownCardIds);
            if (problem)
                return fail("DEFFY_POOL", problem);
            runtime.lastResolution = { kind: action.kind, poolSize: action.poolCardIds.length, faceDownCount: action.faceDownCardIds.length };
            saveRuntime(state, runtime);
            events.push({ type: "DEFFY_POOL_CREATED", payload: { subMode: runtime.subMode, poolSize: action.poolCardIds.length, faceDownCount: action.faceDownCardIds.length } });
            return { ok: true, state, events };
        }
        case "draft-pick": {
            if (!runtime.enabled)
                return fail("DEFFY_NOT_CONFIGURED", "Deffy Mode is not configured");
            const problem = pickCard(state, runtime, action.drafterId, action.cardId, events);
            if (problem)
                return fail("DEFFY_PICK", problem);
            runtime.lastResolution = { kind: action.kind, drafterId: action.drafterId, cardId: action.cardId };
            saveRuntime(state, runtime);
            return { ok: true, state, events };
        }
        case "speed-run-timeout": {
            if (!runtime.enabled || !runtime.addOns.speedRun || runtime.status !== "drafting")
                return fail("DEFFY_SPEED_RUN", "Speed Run is not active");
            const legal = state.zones.staging.filter((id) => runtime.poolFaceUpByCard[id] !== false);
            if (legal.length === 0)
                return fail("DEFFY_SPEED_RUN", "No legal face-up pool card exists");
            const cursorBefore = state.rng.cursor;
            const chosen = legal[nextIndex(state.rng, legal.length)];
            runtime.rngAudit.push({ operation: "speed-run-timeout", cursorBefore, cursorAfter: state.rng.cursor });
            const problem = pickCard(state, runtime, action.drafterId, chosen, events);
            if (problem)
                return fail("DEFFY_SPEED_RUN", problem);
            runtime.lastResolution = { kind: action.kind, drafterId: action.drafterId, chosenCardId: chosen };
            saveRuntime(state, runtime);
            events.push({ type: "DEFFY_TIMEOUT_PICK_ASSIGNED", payload: { drafterId: action.drafterId, cardId: chosen }, visibility: "authorized" });
            return { ok: true, state, events };
        }
        case "refill-pool": {
            if (!runtime.enabled || runtime.status !== "drafting" || state.zones.staging.length !== 0)
                return fail("DEFFY_REFILL", "Pool refill is legal only when the active pool is empty");
            const count = Math.min(3, state.zones.dp.length);
            const cardIds = state.zones.dp.slice(0, count);
            for (const id of cardIds) {
                moveCard(state, id, "STAGING");
                state.cards[id].state.draftFaceUp = true;
                runtime.poolFaceUpByCard[id] = true;
            }
            runtime.lastResolution = { kind: action.kind, cardIds };
            saveRuntime(state, runtime);
            events.push({ type: "DEFFY_POOL_REFILLED", payload: { cardIds } });
            return { ok: true, state, events };
        }
        case "complete-draft": {
            if (!runtime.enabled || runtime.status !== "drafting")
                return fail("DEFFY_COMPLETE", "No active draft exists");
            const targetProblem = validateTargetSizes(state, runtime);
            if (targetProblem)
                return fail("DEFFY_TARGETS", targetProblem);
            const leftovers = [...state.zones.staging];
            const disposition = action.leftoverDisposition ?? "shuffle";
            if (disposition === "scrap" && action.unanimous !== true)
                return fail("DEFFY_LEFTOVERS", "Scrapping leftovers requires unanimous agreement");
            if (disposition === "scrap") {
                for (const id of leftovers)
                    moveCard(state, id, "GY");
            }
            else {
                for (const id of leftovers) {
                    delete state.cards[id].state.draftFaceUp;
                    moveCard(state, id, "VOID");
                }
                const shuffled = deterministicShuffle(leftovers, state);
                for (const id of shuffled)
                    moveCard(state, id, "DP");
            }
            runtime = phase14Runtime(state);
            runtime.status = "complete";
            runtime.specsMayBeRevealed = true;
            runtime.poolFaceUpByCard = {};
            runtime.lastResolution = { kind: action.kind, leftoverDisposition: disposition, leftoverCount: leftovers.length };
            saveRuntime(state, runtime);
            state.phase = "Setup";
            events.push({ type: "DEFFY_DRAFT_COMPLETED", payload: { targetHandSizes: runtime.targetHandSizes, leftoverDisposition: disposition, leftoverCount: leftovers.length, specsMayBeRevealed: true } });
            return { ok: true, state, events };
        }
        case "mirror-me-pick": {
            if (!runtime.enabled || !runtime.addOns.mirrorMe || runtime.status !== "drafting")
                return fail("DEFFY_MIRROR", "Mirror Me is not active");
            if (!isPoolCard(state, action.cardId) || runtime.poolFaceUpByCard[action.cardId] !== false)
                return fail("DEFFY_MIRROR", "Mirror Me requires a face-down pool card");
            const identity = state.cards[action.cardId].identity;
            const expectedMirror = mirrorIdentity(identity);
            const mirror = state.cards[action.mirrorCardId];
            if (!mirror || mirror.zone !== "DP" || (identity === "RJ" || identity === "BJ" ? mirror.identity !== expectedMirror : !mirror.identity.startsWith(expectedMirror ?? "\u0000")))
                return fail("DEFFY_MIRROR", "Chosen mirror is not a legal remaining DP mirror");
            runtime.poolFaceUpByCard[action.cardId] = true;
            state.cards[action.cardId].state.draftFaceUp = true;
            events.push({ type: "DEFFY_MIRROR_PICK_REVEALED", payload: { drafterId: action.drafterId, cardId: action.cardId, identity } });
            const problem = pickCard(state, runtime, action.drafterId, action.cardId, events);
            if (problem)
                return fail("DEFFY_MIRROR", problem);
            moveCard(state, action.mirrorCardId, "STAGING");
            mirror.state.draftFaceUp = true;
            runtime.poolFaceUpByCard[action.mirrorCardId] = true;
            saveRuntime(state, runtime);
            const remaining = [...state.zones.dp];
            for (const id of remaining)
                moveCard(state, id, "VOID");
            const shuffled = deterministicShuffle(remaining, state);
            for (const id of shuffled)
                moveCard(state, id, "DP");
            runtime = phase14Runtime(state);
            runtime.lastResolution = { kind: action.kind, draftedCardId: action.cardId, mirrorCardId: action.mirrorCardId, dpOrder: [...state.zones.dp] };
            saveRuntime(state, runtime);
            events.push({ type: "DEFFY_MIRROR_ADDED", payload: { mirrorCardId: action.mirrorCardId, identity: mirror.identity } });
            events.push({ type: "DP_SHUFFLED", payload: { reason: "Mirror Me", cardCount: remaining.length }, visibility: "authorized" });
            return { ok: true, state, events };
        }
        case "validate-assignment": {
            const problem = validateAssignmentBijection(action.turnOrder, action.assignments);
            if (problem)
                return fail("DEFFY_ASSIGNMENT", problem);
            runtime.assignmentByDrafter = canonicalClone(action.assignments);
            runtime.lastResolution = { kind: action.kind, assignments: action.assignments };
            saveRuntime(state, runtime);
            events.push({ type: "DEFFY_ASSIGNMENT_VALIDATED", payload: { assignments: action.assignments } });
            return { ok: true, state, events };
        }
    }
}
//# sourceMappingURL=phase14.js.map