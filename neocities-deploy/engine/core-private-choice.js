import { canonicalClone } from "./canonical-json.js?v=d6a5c3182938";
import { enumerateCoreEffectCandidates } from "./core-effects.js?v=d6a5c3182938";
import { enumerateAdvancedCoreCandidates } from "./core-advanced.js?v=d6a5c3182938";
import { hashCanonical } from "./hash.js?v=d6a5c3182938";
import { revealUntilStart } from "./lifecycle.js?v=d6a5c3182938";
import { cardPointValue, parseIdentity } from "./ranks.js?v=d6a5c3182938";
import { moveCard } from "./state.js?v=d6a5c3182938";
export const CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE = Object.freeze({
    id: "core-private-choice-authority",
    displayName: "Core Private Choice Authority — Sealed Hidden Decisions",
    rulesVersion: "4.1",
    engineVersion: "4.2.3",
    playerCount: 2,
    enabledModules: [],
    supportedChoices: [
        "2-quick-discard",
        "3-present-take",
        "3-force-discard",
        "5-recycle-rummage",
        "6-deep-dig",
        "7-topdeck-casting",
        "9-anchor-discard"
    ],
    excludedSystems: [
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
    rationale: "Engine-owned sealed continuation layer for ordinary Core hidden-choice effects plus the 2 Quick opponent-discard rider. Quick/private suit enhancements and advanced Core families fail closed."
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
    // Submissions that use selectedCardIds for validation
    const usesSelectedCardIds = "selectedCardIds" in submission;
    const selected = (usesSelectedCardIds ? submission.selectedCardIds : []);
    if (usesSelectedCardIds) {
        if (new Set(selected).size !== selected.length)
            return "Core private choice selections must be unique";
        if (selected.length < choice.minSelections || selected.length > choice.maxSelections)
            return `Core private choice requires ${choice.minSelections}-${choice.maxSelections} selections`;
        if (selected.some((id) => !choice.optionCardIds.includes(id)))
            return "Core private choice selected an unavailable card";
    }
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
    return ["three-hand-raid", "five-recycle", "six-dig", "seven-topdeck", "nine-anchor", "natural-four"].includes(effect.kind);
}
export function resolveCorePrivateChoiceRoot(input, actorId, effect, sourceRankOverride) {
    if (!isCorePrivateChoiceProfile(input))
        return fail("CORE_PRIVATE_CHOICE_PROFILE", "Core Private Choice Authority profile is not active");
    if (activeCorePrivateChoice(input))
        return fail("CORE_PRIVATE_CHOICE_PENDING", "A Core private choice is already pending");
    const state = canonicalClone(input);
    const events = [];
    if (effect.kind === "three-hand-raid") {
        const problem = requireSource(state, actorId, effect.sourceCardId, sourceRankOverride ?? "3");
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
        const problem = requireSource(state, actorId, effect.sourceCardId, sourceRankOverride ?? "5");
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
        const problem = requireSource(state, actorId, effect.sourceCardId, sourceRankOverride ?? "6");
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
        const problem = requireSource(state, actorId, effect.sourceCardId, sourceRankOverride ?? "7");
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
    if (effect.kind === "natural-four") {
        // Rulebook §4 Natural: look at top 4 DP cards, reorder them, then optionally draw 1 from the top.
        const problem = requireSource(state, actorId, effect.sourceCardId, sourceRankOverride ?? "4");
        if (problem)
            return fail("CORE_PRIVATE_CHOICE_SOURCE", problem);
        stageSource(state, effect.sourceCardId, actorId);
        const topCount = Math.min(4, state.zones.dp.length);
        const topIds = [];
        for (let index = 0; index < topCount; index += 1) {
            const cardId = state.zones.dp[index];
            holdPrivate(state, cardId, actorId, true);
            topIds.push(cardId);
        }
        events.push({ type: "CORE_NATURAL_FOUR_REVEALED", payload: { playerId: actorId, sourceCardId: effect.sourceCardId, revealedCardIds: topIds }, visibility: "authorized" });
        if (topIds.length === 0) {
            completeSource(state, effect.sourceCardId);
            return { ok: true, state, events };
        }
        beginChoice(state, {
            kind: "core-natural-four-reorder",
            chooserId: actorId,
            controllerId: actorId,
            sourceCardId: effect.sourceCardId,
            optionCardIds: topIds,
            minSelections: 0,
            maxSelections: topIds.length,
            stage: 1,
            context: { topCount }
        }, events);
        return { ok: true, state, events };
    }
    if (effect.kind === "nine-anchor") {
        const problem = requireSource(state, actorId, effect.sourceCardId, sourceRankOverride ?? "9");
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
    // Enumerate standalone effects (generated card alone)
    const standalone = enumerateCoreEffectCandidates(probe, actorId)
        .filter((entry) => entry.sourceCardIds.length === 1 && entry.sourceCardIds[0] === cardId)
        .map((entry) => canonicalClone(entry.effect));
    // Also enumerate Super/Combo declarations that include the generated card plus hand components.
    // Per rulebook §7: the generated revealed card may combine with cards already in hand.
    const multiCard = enumerateCoreEffectCandidates(probe, actorId)
        .filter((entry) => entry.sourceCardIds.includes(cardId) && entry.sourceCardIds.length > 1)
        .map((entry) => canonicalClone(entry.effect));
    return [...standalone, ...multiCard];
}
export function generatedAdvancedLegalCandidates(state, actorId, cardId) {
    const card = state.cards[cardId];
    if (!card || card.state.privateChoiceHeldBy !== actorId)
        return [];
    const probe = canonicalClone(state);
    releaseHeld(probe, cardId);
    moveCard(probe, cardId, `${actorId}_HAND`, actorId);
    // Enumerate advanced actions (Supers, Ultras, etc.) that include the generated card.
    // Per rulebook §7: the generated revealed card may be used as a component of its Rank's Super.
    return enumerateAdvancedCoreCandidates(probe, actorId)
        .filter((entry) => entry.sourceCardIds.includes(cardId));
}
export function generatedAdvancedCandidates(state, actorId, cardId) {
    return generatedAdvancedLegalCandidates(state, actorId, cardId).map((entry) => canonicalClone(entry.advanced));
}
export function resolveCorePrivateChoiceSubmission(input, actorId, token, submission) {
    const validation = validateSubmission(input, actorId, token, submission);
    if (typeof validation === "string")
        return fail("CORE_PRIVATE_CHOICE_INVALID", validation);
    const choice = validation;
    const state = canonicalClone(input);
    const events = [];
    const selected = [...("selectedCardIds" in submission ? submission.selectedCardIds : [])];
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
        const legalAdvanced = generatedAdvancedCandidates(state, choice.controllerId, generatedCardId);
        const generatedEffect = submission.generatedEffect;
        const generatedAdvanced = submission.generatedAdvanced;
        if (!generatedEffect && !generatedAdvanced) {
            if (legalEffects.length > 0 || legalAdvanced.length > 0)
                return fail("CORE_PRIVATE_CHOICE_GENERATED", "A legal generated effect, advanced action, or score must be selected");
            // Rulebook §7: scrap the card only if no legal generated declaration remains.
            releaseHeld(state, generatedCardId);
            moveCard(state, generatedCardId, "GY");
            events.push({ type: "CORE_SEVEN_GENERATED_EFFECT_UNAVAILABLE", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId } });
            completeSource(state, choice.sourceCardId);
            return { ok: true, state, events };
        }
        if (generatedEffect) {
            const effectHash = hashCanonical(generatedEffect);
            if (!legalEffects.some((candidate) => hashCanonical(candidate) === effectHash))
                return fail("CORE_PRIVATE_CHOICE_GENERATED", "Generated Seven effect is not legal from the sealed frame");
            releaseHeld(state, generatedCardId);
            moveCard(state, generatedCardId, `${choice.controllerId}_HAND`, choice.controllerId);
            completeSource(state, choice.sourceCardId);
            events.push({ type: "CORE_SEVEN_GENERATED_EFFECT_SELECTED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId, effectKind: generatedEffect.kind } });
            return { ok: true, state, events, generatedPrimary: { kind: "core-resolve-effect", effect: canonicalClone(generatedEffect) } };
        }
        // generatedAdvanced is set
        const adv = generatedAdvanced;
        const advHash = hashCanonical(adv);
        if (!legalAdvanced.some((candidate) => hashCanonical(candidate) === advHash))
            return fail("CORE_PRIVATE_CHOICE_GENERATED", "Generated Seven advanced action is not legal from the sealed frame");
        releaseHeld(state, generatedCardId);
        moveCard(state, generatedCardId, `${choice.controllerId}_HAND`, choice.controllerId);
        completeSource(state, choice.sourceCardId);
        events.push({ type: "CORE_SEVEN_GENERATED_ADVANCED_SELECTED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, generatedCardId, advancedKind: adv.kind } });
        return { ok: true, state, events, generatedPrimary: { kind: "core-resolve-advanced", advanced: canonicalClone(adv) } };
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
    if (submission.kind === "core-two-quick-discard") {
        // 2 Quick rider (rulebook §2): the chosen opponent discards 1 card of their
        // choice. The scored 2 already sits in the controller's PR — only the
        // discard remains. If the opponent had no card, resolution skipped the
        // choice entirely, so this branch always has a legal selection.
        const targetPlayerId = String(context.targetPlayerId);
        const cardId = selected[0];
        if (state.cards[cardId]?.zone !== `${targetPlayerId}_HAND`)
            return fail("CORE_PRIVATE_CHOICE_STALE", "2 Quick discard must remain in the opponent hand");
        moveCard(state, cardId, "GY");
        clearChoice(state);
        // If the 2 Quick was declared over a pending root, the response window
        // must reopen for the remaining stack items (mirrors reopenCorePriority).
        if (state.stack.length > 0) {
            const start = (state.turnOrder.indexOf(choice.controllerId) + 1) % state.turnOrder.length;
            state.priority = { order: [...state.turnOrder], index: start, consecutivePasses: 0, open: true };
        }
        else {
            state.priority = null;
        }
        events.push({ type: "CORE_TWO_QUICK_DISCARD_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, targetPlayerId, sourceCardId: choice.sourceCardId, discardedCardId: cardId }, visibility: "authorized" });
        return { ok: true, state, events };
    }
    if (submission.kind === "core-natural-four-reorder") {
        // Rulebook §4 Natural: reorder top 4 DP cards, then optionally draw 1 from the top.
        // The top cards were held in VOID during the private choice — use optionCardIds, not DP.
        const topIds = choice.optionCardIds;
        if (submission.reorderCardIds.length !== topIds.length || !submission.reorderCardIds.every((id) => topIds.includes(id)))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Natural 4 reorder must list exactly the top cards of DP");
        // Release held cards and apply reordering: the top N cards were held in VOID.
        // Release them and place them back on top of DP in the specified order.
        // Cards in VOID are not in any GlobalZones array, so we just set zone and unshift.
        for (const id of topIds)
            releaseHeld(state, id);
        // Use reverse iteration so unshift produces the correct final order.
        for (let i = submission.reorderCardIds.length - 1; i >= 0; i -= 1) {
            const id = submission.reorderCardIds[i];
            state.cards[id].zone = "DP";
            state.zones.dp.unshift(id);
        }
        let drawnCardId = null;
        if (submission.drawTop && state.zones.dp.length > 0) {
            drawnCardId = state.zones.dp[0];
            moveCard(state, drawnCardId, `${choice.controllerId}_HAND`, choice.controllerId);
        }
        moveCard(state, choice.sourceCardId, "GY");
        clearChoice(state);
        events.push({ type: "NATURAL_FOUR_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, sourceCardId: choice.sourceCardId, reorderedCount: topIds.length, drawnCardId }, visibility: "authorized" });
        return { ok: true, state, events };
    }
    if (submission.kind === "core-bj-exile-recycle") {
        // Rulebook §BJ: when BJ is scored, controller may move up to 2 cards from Exile to DP (top or bottom).
        const exileCards = state.zones.exile;
        if (submission.selectedCardIds.length > 2)
            return fail("CORE_PRIVATE_CHOICE_INVALID", "Exile Recycle allows at most 2 cards");
        if (!submission.selectedCardIds.every((id) => exileCards.includes(id)))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Exile Recycle cards must be in Exile");
        if (submission.selectedCardIds.length !== submission.placements.length)
            return fail("CORE_PRIVATE_CHOICE_INVALID", "Each selected card needs a placement");
        for (let i = 0; i < submission.selectedCardIds.length; i += 1) {
            const cardId = submission.selectedCardIds[i];
            const placement = submission.placements[i];
            moveCard(state, cardId, "DP", choice.controllerId);
            if (placement === "top") {
                // Card was placed at bottom by moveCard; move it to top
                const idx = state.zones.dp.indexOf(cardId);
                if (idx !== -1) {
                    state.zones.dp.splice(idx, 1);
                    state.zones.dp.unshift(cardId);
                }
            }
            // "bottom" → leave at bottom (already there from moveCard)
        }
        clearChoice(state);
        events.push({ type: "CORE_BJ_EXILE_RECYCLE_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, recycledCardIds: submission.selectedCardIds, placements: submission.placements }, visibility: "authorized" });
        return { ok: true, state, events };
    }
    if (submission.kind === "core-seven-scoring-trigger") {
        // Rulebook §7 Scoring Trigger: take 1 revealed card to hand, return others to top of DP in any order.
        const revealedIds = context.revealedIds ?? [];
        if (!state.zones.dp.includes(submission.takeCardId) && !revealedIds.includes(submission.takeCardId))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Seven scoring trigger take card must be a revealed card");
        // The revealed cards were set aside in context. Remove them from DP top (they were revealed from there).
        // In practice, the revealed cards are still on top of DP. We need to remove them, take one to hand, and return the rest in chosen order.
        const topN = revealedIds.length;
        const currentTop = state.zones.dp.slice(0, topN);
        if (!revealedIds.every((id) => currentTop.includes(id)))
            return fail("CORE_PRIVATE_CHOICE_STALE", "Seven scoring trigger revealed cards must remain on top of DP");
        // Remove the revealed cards from DP
        state.zones.dp.splice(0, topN);
        // Take the chosen card to hand
        moveCard(state, submission.takeCardId, `${choice.controllerId}_HAND`, choice.controllerId);
        revealUntilStart(state.cards[submission.takeCardId], { playerId: choice.controllerId, startSequence: (state.startPhaseSequenceByPlayer[choice.controllerId] ?? 0) + 1 });
        // Return the rest in the specified order
        const returnIds = submission.returnOrderCardIds.filter((id) => id !== submission.takeCardId);
        if (returnIds.length !== revealedIds.length - 1)
            return fail("CORE_PRIVATE_CHOICE_INVALID", "Seven scoring trigger return order must list all non-taken revealed cards");
        for (const id of returnIds)
            state.zones.dp.unshift(id);
        clearChoice(state);
        events.push({ type: "CORE_SEVEN_SCORING_TRIGGER_RESOLVED", payload: { choiceId: choice.choiceId, playerId: choice.controllerId, takeCardId: submission.takeCardId, returnOrderCardIds: returnIds }, visibility: "authorized" });
        return { ok: true, state, events };
    }
    return fail("CORE_PRIVATE_CHOICE_UNSUPPORTED", "Unsupported Core private-choice submission");
}
//# sourceMappingURL=core-private-choice.js.map