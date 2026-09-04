import { canonicalClone } from "./canonical-json.js";
import { enumerateCoreEffectCandidates } from "./core-effects.js";
import { hashCanonical } from "./hash.js";
import { revealUntilStart } from "./lifecycle.js";
import { cardPointValue, parseIdentity } from "./ranks.js";
import { moveCard } from "./state.js";
export const CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE = Object.freeze({
    id: "core-private-choice-authority",
    displayName: "Core Private Choice Authority — Sealed Hidden Decisions",
    rulesVersion: "4.1",
    engineVersion: "4.2.3",
    playerCount: 2,
    enabledModules: [],
    supportedChoices: [
        "3-present-take",
        "3-force-discard",
        "5-recycle-rummage",
        "6-deep-dig",
        "7-topdeck-casting",
        "9-anchor-discard"
    ],
    excludedSystems: [
        "two-quick",
        "four-natural-quick",
        "six-swap-peek-quick",
        "three-spade-enhancement",
        "five-suit-exile-access",
        "six-spade-deep-draw",
        "seven-spade-enhancement",
        "supers",
        "rank10",
        "voltage",
        "ultras",
        "royal-marriage",
        "optional-modules",
        "multiplayer"
    ],
    rationale: "Engine-owned sealed continuation layer for ordinary Core hidden-choice effects. Quick/private suit enhancements and advanced Core families fail closed."
});
const fail = (code, message, details) => details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
function runtime(state) {
    const value = state.metadata.coreAuthority;
    return value && typeof value === "object" ? value : null;
}
export function isCorePrivateChoiceProfile(state) {
    const profileId = state.metadata.coreAuthority?.profileId;
    return profileId === CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id || profileId === "core-advanced-authority" || profileId === "core-unrestricted-authority";
}
export function activeCorePrivateChoice(state) {
    const value = state.metadata.coreAuthority?.privateChoice;
    return value && typeof value === "object" ? value : null;
}
function tokenCore(choice) {
    return {
        schemaVersion: choice.schemaVersion,
        choiceId: choice.choiceId,
        kind: choice.kind,
        chooserId: choice.chooserId,
        controllerId: choice.controllerId,
        sourceCardId: choice.sourceCardId,
        createdRevision: choice.createdRevision,
        optionCardIds: [...choice.optionCardIds].sort(),
        optionsHash: choice.optionsHash,
        minSelections: choice.minSelections,
        maxSelections: choice.maxSelections,
        stage: choice.stage,
        context: choice.context
    };
}
function createChoice(state, input) {
    const optionCardIds = [...input.optionCardIds].sort();
    const base = {
        schemaVersion: 1,
        choiceId: `CORE-CHOICE-${String(state.revision).padStart(6, "0")}-${input.kind}-${input.chooserId}-${input.stage}`,
        kind: input.kind,
        chooserId: input.chooserId,
        controllerId: input.controllerId,
        sourceCardId: input.sourceCardId,
        createdRevision: state.revision,
        optionCardIds,
        optionsHash: hashCanonical(optionCardIds),
        minSelections: input.minSelections,
        maxSelections: input.maxSelections,
        stage: input.stage,
        context: canonicalClone(input.context)
    };
    return { ...base, token: hashCanonical(tokenCore({ ...base, token: "" })) };
}
function setChoice(state, choice) {
    const core = runtime(state);
    if (!core)
        throw new Error("Core runtime missing");
    core.privateChoice = choice;
}
function clearChoice(state) {
    const core = runtime(state);
    if (core)
        core.privateChoice = null;
}
export function beginChoice(state, input, events) {
    const choice = createChoice(state, input);
    setChoice(state, choice);
    events.push({
        type: "CORE_PRIVATE_CHOICE_OPENED",
        payload: {
            choiceId: choice.choiceId,
            kind: choice.kind,
            chooserId: choice.chooserId,
            controllerId: choice.controllerId,
            sourceCardId: choice.sourceCardId,
            stage: choice.stage,
            optionCount: choice.optionCardIds.length,
            minSelections: choice.minSelections,
            maxSelections: choice.maxSelections
        },
        visibility: "authorized"
    });
    return choice;
}
function stageSource(state, sourceCardId, actorId) {
    moveCard(state, sourceCardId, "VOID", actorId);
    state.cards[sourceCardId].state.privateChoiceSource = true;
    state.cards[sourceCardId].state.draftFaceUp = true;
}
function completeSource(state, sourceCardId) {
    const card = state.cards[sourceCardId];
    if (!card)
        return;
    delete card.state.privateChoiceSource;
    delete card.state.draftFaceUp;
    if (card.zone === "STAGING" || card.zone === "VOID")
        moveCard(state, sourceCardId, "GY");
    clearChoice(state);
}
function holdPrivate(state, cardId, chooserId, publicReveal = false) {
    moveCard(state, cardId, "VOID");
    state.cards[cardId].state.privateChoiceHeldBy = chooserId;
    if (publicReveal)
        state.cards[cardId].state.privateChoicePublicReveal = true;
}
function releaseHeld(state, cardId) {
    const card = state.cards[cardId];
    if (!card)
        return;
    delete card.state.privateChoiceHeldBy;
    delete card.state.privateChoicePublicReveal;
}
function validateSubmission(state, actorId, token, submission) {
    if (!isCorePrivateChoiceProfile(state))
        return "Core Private Choice Authority profile is not active";
    const choice = activeCorePrivateChoice(state);
    if (!choice)
        return "No Core private choice is pending";
    if (choice.chooserId !== actorId)
        return `${actorId} is not authorized for ${choice.choiceId}`;
    if (choice.token !== token)
        return "Core private choice token is stale or invalid";
    const expected = hashCanonical(tokenCore({ ...choice, token: "" }));
    if (expected !== choice.token || hashCanonical([...choice.optionCardIds].sort()) !== choice.optionsHash)
        return "Core private choice seal verification failed";
    if (choice.kind !== submission.kind)
        return `Core choice kind mismatch: expected ${choice.kind}`;
    const selected = submission.selectedCardIds;
    if (new Set(selected).size !== selected.length)
        return "Core private choice selections must be unique";
    if (selected.length < choice.minSelections || selected.length > choice.maxSelections)
        return `Core private choice requires ${choice.minSelections}-${choice.maxSelections} selections`;
    if (selected.some((id) => !choice.optionCardIds.includes(id)))
        return "Core private choice selected an unavailable card";
    return choice;
}
function rank(state, cardId) {
    return parseIdentity(state.cards[cardId]?.identity ?? "")?.rank ?? null;
}
function requireSource(state, actorId, sourceCardId, expectedRank) {
    const card = state.cards[sourceCardId];
    if (!card || card.controllerId !== actorId || card.zone !== `${actorId}_HAND`)
        return "Effect source must be controlled in hand";
    if (rank(state, sourceCardId) !== expectedRank)
        return `Effect source must be rank ${expectedRank}`;
    return null;
}
export function isCorePrivateChoiceEffect(effect) {
    return ["three-hand-raid", "five-recycle", "six-dig", "seven-topdeck", "nine-anchor"].includes(effect.kind);
}
export function resolveCorePrivateChoiceRoot(input, actorId, effect) {
    if (!isCorePrivateChoiceProfile(input))
        return fail("CORE_PRIVATE_CHOICE_PROFILE", "Core Private Choice Authority profile is not active");
    if (activeCorePrivateChoice(input))
        return fail("CORE_PRIVATE_CHOICE_PENDING", "A Core private choice is already pending");
    const state = canonicalClone(input);
    const events = [];
    if (effect.kind === "three-hand-raid") {
        const problem = requireSource(state, actorId, effect.sourceCardId, "3");
        if (problem)
            return fail("CORE_PRIVATE_CHOICE_SOURCE", problem);
        const target = state.players[effect.targetPlayerId];
        if (!target || effect.targetPlayerId === actorId)
            return fail("CORE_PRIVATE_CHOICE_TARGET", "Three Hand Raid requires an opponent");
        stageSource(state, effect.sourceCardId, actorId);
        const options = [...target.hand].sort();
        if (options.length === 0) {
            events.push({ type: "CORE_THREE_HAND_RAID_EMPTY", payload: { playerId: actorId, sourceCardId: effect.sourceCardId, targetPlayerId: effect.targetPlayerId, mode: effect.mode } });
            completeSource(state, effect.sourceCardId);
            return { ok: true, state, events };
        }
        beginChoice(state, {
            kind: effect.mode === "present-take" ? "core-rank3-present" : "core-rank3-discard",
            chooserId: effect.targetPlayerId,
            controllerId: actorId,
            sourceCardId: effect.sourceCardId,
            optionCardIds: options,
            minSelections: effect.mode === "present-take" ? 0 : Math.max(0, options.length - 2),
            maxSelections: effect.mode === "present-take" ? Math.min(3, options.length) : Math.max(0, options.length - 2),
            stage: 1,
            context: { targetPlayerId: effect.targetPlayerId, mode: effect.mode, startingHandSize: options.length }
        }, events);
        return { ok: true, state, events };
    }
    if (effect.kind === "five-recycle") {
        const problem = requireSource(state, actorId, effect.sourceCardId, "5");
        if (problem)
            return fail("CORE_PRIVATE_CHOICE_SOURCE", problem);
        stageSource(state, effect.sourceCardId, actorId);
        const milledCardIds = [];
        for (let index = 0; index < 2 && state.zones.dp.length > 0; index += 1) {
            const cardId = state.zones.dp[0];
            moveCard(state, cardId, "GY");
            milledCardIds.push(cardId);
        }
        const options = [...state.zones.gy].sort();
        events.push({ type: "CORE_FIVE_MILLED", payload: { playerId: actorId, sourceCardId: effect.sourceCardId, milledCardIds } });
        if (options.length === 0) {
            completeSource(state, effect.sourceCardId);
            return { ok: true, state, events };
        }
        beginChoice(state, {
            kind: "core-rank5-rummage",
            chooserId: actorId,
            controllerId: actorId,
            sourceCardId: effect.sourceCardId,
            optionCardIds: options,
            minSelections: 1,
            maxSelections: 1,
            stage: 1,
            context: { milledCardIds }
        }, events);
        return { ok: true, state, events };
    }
    if (effect.kind === "six-dig") {
        const problem = requireSource(state, actorId, effect.sourceCardId, "6");
        if (problem)
            return fail("CORE_PRIVATE_CHOICE_SOURCE", problem);
        stageSource(state, effect.sourceCardId, actorId);
        const drawnCardIds = [];
        for (let index = 0; index < 3 && state.zones.dp.length > 0; index += 1) {
            const cardId = state.zones.dp[0];
            holdPrivate(state, cardId, actorId, false);
            drawnCardIds.push(cardId);
        }
        if (drawnCardIds.length === 0) {
            events.push({ type: "CORE_SIX_DIG_EMPTY", payload: { playerId: actorId, sourceCardId: effect.sourceCardId } });
            completeSource(state, effect.sourceCardId);
            return { ok: true, state, events };
        }
        const discardOptionCardIds = [...state.players[actorId].hand, ...drawnCardIds].filter((id) => id !== effect.sourceCardId);
        beginChoice(state, {
            kind: "core-rank6-dig",
            chooserId: actorId,
            controllerId: actorId,
            sourceCardId: effect.sourceCardId,
            optionCardIds: [...new Set([...drawnCardIds, ...discardOptionCardIds])],
            minSelections: 0,
            maxSelections: Math.max(1, drawnCardIds.length),
            stage: 1,
            context: { drawnCardIds, discardOptionCardIds }
        }, events);
        return { ok: true, state, events };
    }
    if (effect.kind === "seven-topdeck") {
        const problem = requireSource(state, actorId, effect.sourceCardId, "7");
        if (problem)
            return fail("CORE_PRIVATE_CHOICE_SOURCE", problem);
        stageSource(state, effect.sourceCardId, actorId);
        const revealedCardIds = [];
        for (let index = 0; index < 2 && state.zones.dp.length > 0; index += 1) {
            const cardId = state.zones.dp[0];
            holdPrivate(state, cardId, actorId, true);
            revealedCardIds.push(cardId);
        }
        events.push({ type: "CORE_SEVEN_TOPDECK_REVEALED", payload: { playerId: actorId, sourceCardId: effect.sourceCardId, revealedCardIds } });
        if (revealedCardIds.length === 0) {
            completeSource(state, effect.sourceCardId);
            return { ok: true, state, events };
        }
        beginChoice(state, {
            kind: "core-rank7-assign",
            chooserId: actorId,
            controllerId: actorId,
            sourceCardId: effect.sourceCardId,
            optionCardIds: revealedCardIds,
            minSelections: 1,
            maxSelections: revealedCardIds.length,
            stage: 1,
            context: { revealedCardIds }
        }, events);
        return { ok: true, state, events };
    }
    if (effect.kind === "nine-anchor") {
        const problem = requireSource(state, actorId, effect.sourceCardId, "9");
        if (problem)
            return fail("CORE_PRIVATE_CHOICE_SOURCE", problem);
        const target = state.players[effect.targetPlayerId];
        if (!target || effect.targetPlayerId === actorId)
            return fail("CORE_PRIVATE_CHOICE_TARGET", "Nine Anchor requires an opponent");
        for (const existingId of [...state.players[actorId].er]) {
            if (existingId !== effect.sourceCardId && rank(state, existingId) === "9" && state.cards[existingId]?.state.playedForEffect === true)
                moveCard(state, existingId, "GY");
        }
        moveCard(state, effect.sourceCardId, `${actorId}_ER`, actorId);
        state.cards[effect.sourceCardId].state.playedForEffect = true;
        state.cards[effect.sourceCardId].state.anchorValue = 0;
        const options = [...target.hand].sort();
        events.push({ type: "CORE_NINE_ANCHOR_ENTERED", payload: { playerId: actorId, sourceCardId: effect.sourceCardId, targetPlayerId: effect.targetPlayerId, anchorValue: 0 } });
        if (options.length === 0)
            return { ok: true, state, events };
        beginChoice(state, {
            kind: "core-nine-anchor-discard",
            chooserId: effect.targetPlayerId,
            controllerId: actorId,
            sourceCardId: effect.sourceCardId,
            optionCardIds: options,
            minSelections: 1,
            maxSelections: 1,
            stage: 1,
            context: { targetPlayerId: effect.targetPlayerId }
        }, events);
        return { ok: true, state, events };
    }
    return fail("CORE_PRIVATE_CHOICE_EFFECT", "Unsupported Core private-choice effect");
}
export function generatedCoreEffectCandidates(state, actorId, cardId) {
    const card = state.cards[cardId];
    if (!card || card.state.privateChoiceHeldBy !== actorId)
        return [];
    const probe = canonicalClone(state);
    releaseHeld(probe, cardId);
    moveCard(probe, cardId, `${actorId}_HAND`, actorId);
    return enumerateCoreEffectCandidates(probe, actorId)
        .filter((entry) => entry.sourceCardIds.length === 1 && entry.sourceCardIds[0] === cardId)
        .map((entry) => canonicalClone(entry.effect));
}
export function resolveCorePrivateChoiceSubmission(input, actorId, token, submission) {
    const validation = validateSubmission(input, actorId, token, submission);
    if (typeof validation === "string")
        return fail("CORE_PRIVATE_CHOICE_INVALID", validation);
    const choice = validation;
    const state = canonicalClone(input);
    const events = [];
    const selected = [...submission.selectedCardIds];
    const context = choice.context;
    if (submission.kind === "core-rank3-present") {
        const targetPlayerId = String(context.targetPlayerId);
        if (selected.some((id) => state.cards[id]?.zone !== `${targetPlayerId}_HAND`))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Presented cards must remain in the opponent hand");
        if (selected.length === 0) {
            events.push({ type: "CORE_THREE_PRESENTED_NONE", payload: { choiceId: choice.choiceId, targetPlayerId } });
            completeSource(state, choice.sourceCardId);
            return { ok: true, state, events };
        }
        beginChoice(state, {
            kind: "core-rank3-take",
            chooserId: choice.controllerId,
            controllerId: choice.controllerId,
            sourceCardId: choice.sourceCardId,
            optionCardIds: selected,
            minSelections: 0,
            maxSelections: Math.min(2, selected.length),
            stage: 2,
            context: { targetPlayerId, presentedCardIds: selected }
        }, events);
        events.push({ type: "CORE_THREE_CARDS_PRESENTED", payload: { choiceId: choice.choiceId, targetPlayerId, count: selected.length }, visibility: "authorized" });
        return { ok: true, state, events };
    }
    if (submission.kind === "core-rank3-take") {
        const targetPlayerId = String(context.targetPlayerId);
        if (selected.some((cardId) => state.cards[cardId]?.zone !== `${targetPlayerId}_HAND`))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Taken cards must remain in the presenting opponent hand");
        for (const cardId of selected) {
            moveCard(state, cardId, `${choice.controllerId}_HAND`, choice.controllerId);
            revealUntilStart(state.cards[cardId], { playerId: choice.controllerId, startSequence: (state.startPhaseSequenceByPlayer[choice.controllerId] ?? 0) + 1 });
        }
        events.push({ type: "CORE_THREE_CARDS_TAKEN", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, targetPlayerId, cardIds: selected }, visibility: "authorized" });
        completeSource(state, choice.sourceCardId);
        return { ok: true, state, events };
    }
    if (submission.kind === "core-rank3-discard") {
        const targetPlayerId = String(context.targetPlayerId);
        if (selected.some((id) => state.cards[id]?.zone !== `${targetPlayerId}_HAND`))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Discarded cards must remain in the opponent hand");
        for (const id of selected)
            moveCard(state, id, "GY");
        events.push({ type: "CORE_THREE_OPPONENT_DISCARDED", payload: { choiceId: choice.choiceId, targetPlayerId, cardIds: selected }, visibility: "authorized" });
        completeSource(state, choice.sourceCardId);
        return { ok: true, state, events };
    }
    if (submission.kind === "core-rank5-rummage") {
        const cardId = selected[0];
        if (state.cards[cardId]?.zone !== "GY")
            return fail("CORE_PRIVATE_CHOICE_STALE", "Rummage choice must remain in GY");
        moveCard(state, cardId, `${choice.controllerId}_HAND`, choice.controllerId);
        revealUntilStart(state.cards[cardId], { playerId: choice.controllerId, startSequence: (state.startPhaseSequenceByPlayer[choice.controllerId] ?? 0) + 1 });
        let bottomDrawCardId = null;
        if (state.zones.gy.length > 0) {
            bottomDrawCardId = state.zones.gy[0];
            moveCard(state, bottomDrawCardId, `${choice.controllerId}_HAND`, choice.controllerId);
        }
        events.push({ type: "CORE_FIVE_RECYCLE_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, sourceCardId: choice.sourceCardId, rummagedCardId: cardId, bottomDrawCardId }, visibility: "authorized" });
        completeSource(state, choice.sourceCardId);
        return { ok: true, state, events };
    }
    if (submission.kind === "core-rank6-dig") {
        const drawn = [...(context.drawnCardIds ?? [])];
        const discardOptions = [...(context.discardOptionCardIds ?? [])];
        if (drawn.some((id) => state.cards[id]?.state.privateChoiceHeldBy !== choice.controllerId))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Drawn Six cards are no longer sealed");
        if (submission.mode === "keep-all-discard") {
            if (selected.length !== 1 || !discardOptions.includes(selected[0]))
                return fail("CORE_PRIVATE_CHOICE_SELECTION", "Keep-all requires one legal discard");
            for (const id of drawn) {
                releaseHeld(state, id);
                moveCard(state, id, `${choice.controllerId}_HAND`, choice.controllerId);
            }
            const discardId = selected[0];
            if (state.cards[discardId]?.zone !== `${choice.controllerId}_HAND`)
                return fail("CORE_PRIVATE_CHOICE_STALE", "Six discard is no longer in hand");
            moveCard(state, discardId, "GY");
            events.push({ type: "CORE_SIX_DIG_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, mode: submission.mode, drawnCardIds: drawn, keptCardIds: drawn.filter((id) => id !== discardId), discardedCardId: discardId }, visibility: "authorized" });
        }
        else {
            const keepCount = Math.min(2, drawn.length);
            if (selected.length !== keepCount || selected.some((id) => !drawn.includes(id)))
                return fail("CORE_PRIVATE_CHOICE_SELECTION", `Six keep-return requires exactly ${keepCount} drawn cards`);
            const keep = new Set(selected);
            const returned = drawn.filter((id) => !keep.has(id));
            for (const id of selected) {
                releaseHeld(state, id);
                moveCard(state, id, `${choice.controllerId}_HAND`, choice.controllerId);
            }
            for (const id of returned) {
                releaseHeld(state, id);
                moveCard(state, id, "DP");
                const index = state.zones.dp.indexOf(id);
                state.zones.dp.splice(index, 1);
                if (submission.mode === "keep-return-top")
                    state.zones.dp.unshift(id);
                else
                    state.zones.dp.push(id);
            }
            events.push({ type: "CORE_SIX_DIG_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, mode: submission.mode, drawnCardIds: drawn, keptCardIds: selected, returnedCardIds: returned }, visibility: "authorized" });
        }
        completeSource(state, choice.sourceCardId);
        return { ok: true, state, events };
    }
    if (submission.kind === "core-rank7-assign") {
        const revealed = [...(context.revealedCardIds ?? [])];
        if (revealed.some((id) => state.cards[id]?.state.privateChoiceHeldBy !== choice.controllerId || state.cards[id]?.state.privateChoicePublicReveal !== true))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Revealed Seven cards are no longer sealed");
        let handCardId = null;
        let effectCardId = null;
        let scoreCardId = null;
        if (revealed.length === 1) {
            if (selected.length !== 1 || selected[0] !== revealed[0])
                return fail("CORE_PRIVATE_CHOICE_SELECTION", "Single-card Seven must select the revealed card");
            if (submission.mode === "hand-only")
                handCardId = selected[0];
            else if (submission.mode === "effect-only")
                effectCardId = selected[0];
            else if (submission.mode === "score-only")
                scoreCardId = selected[0];
            else
                return fail("CORE_PRIVATE_CHOICE_SELECTION", "Single-card Seven cannot use hand-and-effect or hand-and-score");
        }
        else {
            if (submission.mode === "hand-and-effect") {
                if (selected.length !== 2 || new Set(selected).size !== 2 || selected.some((id) => !revealed.includes(id)))
                    return fail("CORE_PRIVATE_CHOICE_SELECTION", "Two-card Seven requires ordered [hand,effect] assignment");
                handCardId = selected[0];
                effectCardId = selected[1];
            }
            else if (submission.mode === "hand-and-score") {
                if (selected.length !== 2 || new Set(selected).size !== 2 || selected.some((id) => !revealed.includes(id)))
                    return fail("CORE_PRIVATE_CHOICE_SELECTION", "Two-card Seven requires ordered [hand,score] assignment");
                handCardId = selected[0];
                scoreCardId = selected[1];
            }
            else {
                return fail("CORE_PRIVATE_CHOICE_SELECTION", "Two-card Seven requires hand-and-effect or hand-and-score");
            }
        }
        if (handCardId) {
            releaseHeld(state, handCardId);
            moveCard(state, handCardId, `${choice.controllerId}_HAND`, choice.controllerId);
            revealUntilStart(state.cards[handCardId], { playerId: choice.controllerId, startSequence: (state.startPhaseSequenceByPlayer[choice.controllerId] ?? 0) + 1 });
        }
        if (scoreCardId) {
            releaseHeld(state, scoreCardId);
            moveCard(state, scoreCardId, `${choice.controllerId}_PR`, choice.controllerId);
            state.cards[scoreCardId].state.pointValue = cardPointValue(state.cards[scoreCardId]);
            for (const id of revealed.filter((entry) => entry !== handCardId && entry !== scoreCardId)) {
                releaseHeld(state, id);
                moveCard(state, id, "DP");
            }
            events.push({ type: "CORE_SEVEN_ASSIGNMENT_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, handCardId, effectCardId: null, scoreCardId }, visibility: "authorized" });
            completeSource(state, choice.sourceCardId);
            return { ok: true, state, events };
        }
        if (!effectCardId) {
            for (const id of revealed.filter((entry) => entry !== handCardId)) {
                releaseHeld(state, id);
                moveCard(state, id, "DP");
            }
            events.push({ type: "CORE_SEVEN_ASSIGNMENT_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, handCardId, effectCardId: null }, visibility: "authorized" });
            completeSource(state, choice.sourceCardId);
            return { ok: true, state, events };
        }
        beginChoice(state, {
            kind: "core-rank7-generated-effect",
            chooserId: choice.controllerId,
            controllerId: choice.controllerId,
            sourceCardId: choice.sourceCardId,
            optionCardIds: [effectCardId],
            minSelections: 1,
            maxSelections: 1,
            stage: 2,
            context: { generatedCardId: effectCardId, handCardId }
        }, events);
        events.push({ type: "CORE_SEVEN_ASSIGNMENT_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, handCardId, effectCardId } });
        return { ok: true, state, events };
    }
    if (submission.kind === "core-rank7-generated-effect") {
        const generatedCardId = String(context.generatedCardId);
        if (selected.length !== 1 || selected[0] !== generatedCardId || state.cards[generatedCardId]?.state.privateChoiceHeldBy !== choice.controllerId)
            return fail("CORE_PRIVATE_CHOICE_STALE", "Generated Seven effect card is unavailable");
        if (submission.scoreInstead) {
            releaseHeld(state, generatedCardId);
            moveCard(state, generatedCardId, `${choice.controllerId}_PR`, choice.controllerId);
            state.cards[generatedCardId].state.pointValue = cardPointValue(state.cards[generatedCardId]);
            completeSource(state, choice.sourceCardId);
            events.push({ type: "CORE_SEVEN_GENERATED_SCORE_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId } });
            return { ok: true, state, events };
        }
        const legalEffects = generatedCoreEffectCandidates(state, choice.controllerId, generatedCardId);
        const generatedEffect = submission.generatedEffect;
        if (!generatedEffect) {
            if (legalEffects.length > 0)
                return fail("CORE_PRIVATE_CHOICE_GENERATED", "A legal generated effect or score must be selected");
            releaseHeld(state, generatedCardId);
            moveCard(state, generatedCardId, "GY");
            events.push({ type: "CORE_SEVEN_GENERATED_EFFECT_UNAVAILABLE", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId } });
            completeSource(state, choice.sourceCardId);
            return { ok: true, state, events };
        }
        const effectHash = hashCanonical(generatedEffect);
        if (!legalEffects.some((candidate) => hashCanonical(candidate) === effectHash))
            return fail("CORE_PRIVATE_CHOICE_GENERATED", "Generated Seven effect is not legal from the sealed frame");
        releaseHeld(state, generatedCardId);
        moveCard(state, generatedCardId, `${choice.controllerId}_HAND`, choice.controllerId);
        completeSource(state, choice.sourceCardId);
        events.push({ type: "CORE_SEVEN_GENERATED_EFFECT_SELECTED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId, effectKind: generatedEffect.kind } });
        return { ok: true, state, events, generatedPrimary: { kind: "core-resolve-effect", effect: canonicalClone(generatedEffect) } };
    }
    if (submission.kind === "core-nine-anchor-discard") {
        const targetPlayerId = String(context.targetPlayerId);
        const cardId = selected[0];
        if (state.cards[cardId]?.zone !== `${targetPlayerId}_HAND`)
            return fail("CORE_PRIVATE_CHOICE_STALE", "Nine Anchor discard must remain in the opponent hand");
        moveCard(state, cardId, "GY");
        clearChoice(state);
        events.push({ type: "CORE_NINE_ANCHOR_DISCARD_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, targetPlayerId, sourceCardId: choice.sourceCardId, discardedCardId: cardId }, visibility: "authorized" });
        return { ok: true, state, events };
    }
    return fail("CORE_PRIVATE_CHOICE_UNSUPPORTED", "Unsupported Core private-choice submission");
}
//# sourceMappingURL=core-private-choice.js.map