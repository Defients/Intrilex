import { canonicalClone } from "./canonical-json.js";
import { IntrilexEngine } from "./engine.js";
import { hashCanonical } from "./hash.js";
import { cardPointValue, parseIdentity } from "./ranks.js";
import { nextIndex } from "./rng.js";
import { createEmptyState } from "./state.js";
import { assertValidState } from "./validation.js";
import { CORE_FOUNDATION_AUTHORITY_PROFILE } from "./core-authority.js";
import { CORE_EFFECT_DECLARATION_PROFILE, enumerateCoreEffectCandidates } from "./core-effects.js";
import { CORE_RESPONSE_AUTHORITY_PROFILE, currentCoreStackTarget, currentPriorityActor, primaryDescriptor } from "./core-response.js";
import { CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, activeCorePrivateChoice, generatedCoreEffectCandidates } from "./core-private-choice.js";
import { CORE_ADVANCED_AUTHORITY_PROFILE, CORE_UNRESTRICTED_AUTHORITY_PROFILE, enumerateAdvancedCoreCandidates } from "./core-advanced.js";
function readCoreRuntime(state) {
    const value = state.metadata.coreAuthority;
    return value && typeof value === "object" ? value : null;
}
function commandId(state, actorId, suffix) { return `CORE-${state.revision}-${state.fullTurnSequence}-${actorId}-${suffix}`; }
function command(state, actorId, suffix, action) {
    return { id: commandId(state, actorId, suffix), type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId, action };
}
function isPrimaryAction(value) {
    return ["core-draw", "core-face-up-swap-draw", "core-score", "core-scuttle", "core-resolve-effect", "core-resolve-advanced", "core-resolve-rank-action", "core-exhausted-pass"].includes(value.kind);
}
function action(state, actorId, family, mode, timingClass, sourceCardIds, targetCardIds, coreAction, featureVector = {}) {
    const runtime = readCoreRuntime(state);
    const directVoltage = coreAction.kind === "core-resolve-advanced" && coreAction.advanced.kind.startsWith("advanced-voltage-");
    const submittedAction = [CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(runtime?.profileId) && isPrimaryAction(coreAction) && !directVoltage
        ? { kind: "core-declare-primary", action: coreAction }
        : coreAction;
    const cmd = command(state, actorId, `${family}-${mode}-${sourceCardIds.join("-")}-${targetCardIds.join("-")}`, submittedAction);
    return { actionId: hashCanonical({ revision: state.revision, actorId, family, mode, sourceCardIds, targetCardIds, commandHash: hashCanonical(cmd) }), actorId, family, mode, timingClass, sourceCardIds, targetCardIds, publicSummaryCode: `CORE_${family.toUpperCase()}_${mode.toUpperCase()}`, featureVector, command: cmd, commandHash: hashCanonical(cmd) };
}
function combinations(values, min, max) {
    const output = [];
    const visit = (start, current) => {
        if (current.length >= min && current.length <= max)
            output.push([...current]);
        if (current.length === max)
            return;
        for (let index = start; index < values.length; index += 1) {
            current.push(values[index]);
            visit(index + 1, current);
            current.pop();
        }
    };
    visit(0, []);
    return output;
}
function isPhysicalSeven(state, cardId) {
    const c = state.cards[cardId];
    if (!c)
        return false;
    const parsed = parseIdentity(c.identity);
    return parsed !== null && parsed.rank === "7" && c.zone === `${c.controllerId}_HAND`;
}
export function canRecurseTopdeck(state, sourceCardId) {
    return isPhysicalSeven(state, sourceCardId);
}
function privateChoiceAction(state, choice, mode, selectedCardIds, submission, featureVector = {}) {
    return action(state, choice.chooserId, "private-choice", mode, "INSTANT", [], [...selectedCardIds], { kind: "core-submit-private-choice", token: choice.token, submission }, featureVector);
}
export function enumerateCorePrivateChoiceActions(state, actorId) {
    const engine = new IntrilexEngine();
    const choice = activeCorePrivateChoice(state);
    if (!choice || choice.chooserId !== actorId || ![CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(state.metadata.coreAuthority?.profileId))
        return { stateRevision: state.revision, actorId, actions: [], frameHash: hashCanonical([]) };
    const candidates = [];
    if (choice.kind === "core-rank3-present")
        for (const selected of combinations(choice.optionCardIds, choice.minSelections, choice.maxSelections))
            candidates.push(privateChoiceAction(state, choice, "rank3-present", selected, { kind: "core-rank3-present", selectedCardIds: selected }, { selectedCount: selected.length }));
    if (choice.kind === "core-rank3-take")
        for (const selected of combinations(choice.optionCardIds, choice.minSelections, choice.maxSelections))
            candidates.push(privateChoiceAction(state, choice, "rank3-take", selected, { kind: "core-rank3-take", selectedCardIds: selected }, { takeCount: selected.length }));
    if (choice.kind === "core-rank3-discard")
        for (const selected of combinations(choice.optionCardIds, choice.minSelections, choice.maxSelections))
            candidates.push(privateChoiceAction(state, choice, "rank3-discard", selected, { kind: "core-rank3-discard", selectedCardIds: selected }, { discardCount: selected.length }));
    if (choice.kind === "core-rank5-rummage")
        for (const id of choice.optionCardIds)
            candidates.push(privateChoiceAction(state, choice, "rank5-rummage", [id], { kind: "core-rank5-rummage", selectedCardIds: [id] }, { rummage: true }));
    if (choice.kind === "core-rank6-dig") {
        const drawn = [...(choice.context.drawnCardIds ?? [])];
        const discardOptions = [...(choice.context.discardOptionCardIds ?? [])];
        const keepCount = Math.min(2, drawn.length);
        for (const kept of combinations(drawn, keepCount, keepCount)) {
            candidates.push(privateChoiceAction(state, choice, "rank6-keep-return-top", kept, { kind: "core-rank6-dig", mode: "keep-return-top", selectedCardIds: kept }, { keepCount, returnTop: true }));
            candidates.push(privateChoiceAction(state, choice, "rank6-keep-return-bottom", kept, { kind: "core-rank6-dig", mode: "keep-return-bottom", selectedCardIds: kept }, { keepCount, returnBottom: true }));
        }
        for (const discardId of discardOptions)
            candidates.push(privateChoiceAction(state, choice, "rank6-keep-all-discard", [discardId], { kind: "core-rank6-dig", mode: "keep-all-discard", selectedCardIds: [discardId] }, { keepAll: true, discard: true }));
    }
    if (choice.kind === "core-rank7-assign") {
        if (choice.optionCardIds.length === 1) {
            const id = choice.optionCardIds[0];
            candidates.push(privateChoiceAction(state, choice, "rank7-hand-only", [id], { kind: "core-rank7-assign", mode: "hand-only", selectedCardIds: [id] }, { toHand: true }));
            candidates.push(privateChoiceAction(state, choice, "rank7-effect-only", [id], { kind: "core-rank7-assign", mode: "effect-only", selectedCardIds: [id] }, { toEffect: true }));
            candidates.push(privateChoiceAction(state, choice, "rank7-score-only", [id], { kind: "core-rank7-assign", mode: "score-only", selectedCardIds: [id] }, { toScore: true }));
        }
        else {
            for (const handId of choice.optionCardIds)
                for (const effectId of choice.optionCardIds)
                    if (handId !== effectId)
                        candidates.push(privateChoiceAction(state, choice, "rank7-hand-and-effect", [handId, effectId], { kind: "core-rank7-assign", mode: "hand-and-effect", selectedCardIds: [handId, effectId] }, { toHand: true, toEffect: true }));
            for (const handId of choice.optionCardIds)
                for (const scoreId of choice.optionCardIds)
                    if (handId !== scoreId)
                        candidates.push(privateChoiceAction(state, choice, "rank7-hand-and-score", [handId, scoreId], { kind: "core-rank7-assign", mode: "hand-and-score", selectedCardIds: [handId, scoreId] }, { toHand: true, toScore: true }));
        }
    }
    if (choice.kind === "core-rank7-generated-effect") {
        const generatedCardId = choice.optionCardIds[0];
        const effects = generatedCoreEffectCandidates(state, actorId, generatedCardId);
        candidates.push(privateChoiceAction(state, choice, "rank7-generated-score", [generatedCardId], { kind: "core-rank7-generated-effect", selectedCardIds: [generatedCardId], scoreInstead: true }, { toScore: true }));
        if (effects.length === 0)
            candidates.push(privateChoiceAction(state, choice, "rank7-generated-unavailable", [generatedCardId], { kind: "core-rank7-generated-effect", selectedCardIds: [generatedCardId] }, { fizzle: true }));
        for (const effect of effects)
            candidates.push(privateChoiceAction(state, choice, `rank7-generated-${effect.kind}`, [generatedCardId], { kind: "core-rank7-generated-effect", selectedCardIds: [generatedCardId], generatedEffect: canonicalClone(effect) }, { generated: true, effectKind: effect.kind }));
    }
    if (choice.kind === "core-nine-anchor-discard")
        for (const id of choice.optionCardIds)
            candidates.push(privateChoiceAction(state, choice, "nine-anchor-discard", [id], { kind: "core-nine-anchor-discard", selectedCardIds: [id] }, { discard: true }));
    const accepted = candidates.filter((entry) => engine.execute(state, entry.command).accepted).sort((a, b) => a.actionId.localeCompare(b.actionId));
    return { stateRevision: state.revision, actorId, actions: accepted, frameHash: hashCanonical(accepted.map((entry) => ({ actionId: entry.actionId, commandHash: entry.commandHash }))) };
}
function enumerateSoloWildCopyCandidates(state, actorId) {
    const player = state.players[actorId];
    if (!player)
        return [];
    const opponents = state.turnOrder.filter((id) => id !== actorId);
    const out = [];
    for (const sourceCardId of player.hand) {
        const parsed = parseIdentity(state.cards[sourceCardId].identity);
        if (!parsed || parsed.rank !== "2" || !parsed.suit)
            continue;
        const twoSuit = parsed.suit;
        // Rank 3: three-bounce (bounce one OTT card to top of DP)
        for (const p of Object.values(state.players))
            for (const t of [...p.pr, ...p.er]) {
                const copiedAction = { kind: "three-bounce", targetCardId: t };
                const rankAction = { kind: "solo-wild-copy", sourceCardId, targetRank: "3", copiedAction };
                out.push(action(state, actorId, "solo-wild", `three-bounce-${twoSuit}`, "ACTION", [sourceCardId], [t], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, targetRank: "3", copiedFamily: "bounce" }));
            }
        // Rank 4: four-row-clear (clear opponent PR or ER)
        for (const oid of opponents)
            for (const row of ["pr", "er"]) {
                const copiedAction = { kind: "four-row-clear", targetPlayerId: oid, row };
                const rankAction = { kind: "solo-wild-copy", sourceCardId, targetRank: "4", copiedAction };
                out.push(action(state, actorId, "solo-wild", `four-row-clear-${row}-${twoSuit}`, "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, targetRank: "4", copiedFamily: "row-clear", row }));
            }
        // Rank 4♠: total-clear (only for 2♠)
        if (twoSuit === "♠") {
            const copiedAction = { kind: "total-clear" };
            const rankAction = { kind: "solo-wild-copy", sourceCardId, targetRank: "4", copiedAction };
            out.push(action(state, actorId, "solo-wild", "total-clear-♠", "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, targetRank: "4", copiedFamily: "total-clear" }));
        }
        // Rank 5: recycle-five (mill 2, rummage 1 from GY, draw bottom of GY)
        {
            const copiedAction = { kind: "recycle-five" };
            const rankAction = { kind: "solo-wild-copy", sourceCardId, targetRank: "5", copiedAction };
            out.push(action(state, actorId, "solo-wild", `recycle-five-${twoSuit}`, "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, targetRank: "5", copiedFamily: "recycle" }));
        }
        // Rank 6♠: deep-draw-six-spade (only for 2♠, requires other hand cards to discard)
        if (twoSuit === "♠") {
            const otherHand = [...player.hand].filter((id) => id !== sourceCardId);
            for (const d1 of otherHand) {
                const copiedAction = { kind: "deep-draw-six-spade", discardCardIds: [d1], keepCardIds: [] };
                const rankAction = { kind: "solo-wild-copy", sourceCardId, targetRank: "6", copiedAction };
                out.push(action(state, actorId, "solo-wild", "deep-draw-♠", "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, targetRank: "6", copiedFamily: "deep-draw" }));
            }
        }
        // Rank 7: topdeck-seven (reveal top 2, assign to hand/effect)
        {
            const copiedAction = { kind: "topdeck-seven" };
            const rankAction = { kind: "solo-wild-copy", sourceCardId, targetRank: "7", copiedAction };
            out.push(action(state, actorId, "solo-wild", `topdeck-seven-${twoSuit}`, "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, targetRank: "7", copiedFamily: "topdeck" }));
        }
    }
    return out;
}
function enumerateWildSovereigntyCandidates(state, actorId) {
    const player = state.players[actorId];
    if (!player)
        return [];
    const opponents = state.turnOrder.filter((id) => id !== actorId);
    const out = [];
    for (const sourceCardId of player.hand) {
        const parsed = parseIdentity(state.cards[sourceCardId].identity);
        if (!parsed || parsed.rank !== "K" || parsed.suit !== "♠")
            continue;
        // Rank 3: three-bounce (bounce one OTT card to top of DP)
        for (const p of Object.values(state.players))
            for (const t of [...p.pr, ...p.er]) {
                const copiedAction = { kind: "three-bounce", targetCardId: t };
                const rankAction = { kind: "wild-sovereignty", sourceCardId, targetRank: "3", copiedAction };
                out.push(action(state, actorId, "wild-sovereignty", "three-bounce", "ACTION", [sourceCardId], [t], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, sovereign: true, targetRank: "3", copiedFamily: "bounce", exileBound: true }));
            }
        // Rank 4: four-row-clear (clear opponent PR or ER)
        for (const oid of opponents)
            for (const row of ["pr", "er"]) {
                const copiedAction = { kind: "four-row-clear", targetPlayerId: oid, row };
                const rankAction = { kind: "wild-sovereignty", sourceCardId, targetRank: "4", copiedAction };
                out.push(action(state, actorId, "wild-sovereignty", `four-row-clear-${row}`, "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, sovereign: true, targetRank: "4", copiedFamily: "row-clear", row, exileBound: true }));
            }
        // Rank 4♠: total-clear (requires one other hand card as discard cost)
        for (const costCardId of [...player.hand].filter((id) => id !== sourceCardId)) {
            const copiedAction = { kind: "total-clear" };
            const rankAction = { kind: "wild-sovereignty", sourceCardId, targetRank: "4", copiedAction, discardCostCardId: costCardId };
            out.push(action(state, actorId, "wild-sovereignty", "total-clear", "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, sovereign: true, targetRank: "4", copiedFamily: "total-clear", exileBound: true, discardCost: true }));
        }
        // Rank 5: recycle-five (mill 2, rummage 1 from GY, draw bottom of GY)
        {
            const copiedAction = { kind: "recycle-five" };
            const rankAction = { kind: "wild-sovereignty", sourceCardId, targetRank: "5", copiedAction };
            out.push(action(state, actorId, "wild-sovereignty", "recycle-five", "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, sovereign: true, targetRank: "5", copiedFamily: "recycle", exileBound: true }));
        }
        // Rank 6♠: deep-draw-six-spade (requires other hand cards to discard)
        {
            const otherHand = [...player.hand].filter((id) => id !== sourceCardId);
            for (const d1 of otherHand) {
                const copiedAction = { kind: "deep-draw-six-spade", discardCardIds: [d1], keepCardIds: [] };
                const rankAction = { kind: "wild-sovereignty", sourceCardId, targetRank: "6", copiedAction };
                out.push(action(state, actorId, "wild-sovereignty", "deep-draw", "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, sovereign: true, targetRank: "6", copiedFamily: "deep-draw", exileBound: true }));
            }
        }
        // Rank 7: topdeck-seven (reveal top 2, assign to hand/effect)
        {
            const copiedAction = { kind: "topdeck-seven" };
            const rankAction = { kind: "wild-sovereignty", sourceCardId, targetRank: "7", copiedAction };
            out.push(action(state, actorId, "wild-sovereignty", "topdeck-seven", "ACTION", [sourceCardId], [], { kind: "core-resolve-rank-action", action: rankAction }, { wild: true, sovereign: true, targetRank: "7", copiedFamily: "topdeck", exileBound: true }));
        }
    }
    return out;
}
export function enumerateCoreLegalActions(state, actorId) {
    const engine = new IntrilexEngine();
    const candidates = [];
    const core = readCoreRuntime(state);
    if (!core || ![CORE_FOUNDATION_AUTHORITY_PROFILE.id, CORE_EFFECT_DECLARATION_PROFILE.id, CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId) || state.activePlayerId !== actorId || state.winner !== null || activeCorePrivateChoice(state) !== null)
        return { stateRevision: state.revision, actorId, actions: [], frameHash: hashCanonical([]) };
    if (state.phase === "Start" && core.startPreparedFullTurnSequence === state.fullTurnSequence) {
        const player = state.players[actorId];
        if (!player.limits.swapBarUsedThisFT) {
            const facedown = state.zones.swapBar.filter((id) => state.cards[id]?.state.swapBarFaceDown === true);
            for (const handId of player.hand)
                for (const barId of facedown)
                    candidates.push(action(state, actorId, "swap-bar", "face-down", "SETUP", [handId], [barId], { kind: "core-face-down-swap", handCardId: handId, swapCardId: barId }));
        }
        candidates.push(action(state, actorId, "phase", "enter-action", "SETUP", [], [], { kind: "core-enter-action" }));
        if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId))
            for (const advanced of enumerateAdvancedCoreCandidates(state, actorId).filter((entry) => entry.family === "voltage"))
                candidates.push(action(state, actorId, advanced.family, advanced.mode, advanced.timingClass, [...advanced.sourceCardIds], [...advanced.targetCardIds], { kind: "core-resolve-advanced", advanced: advanced.advanced }, advanced.featureVector));
    }
    else if (state.phase === "Action" && state.players[actorId].limits.miniTurnsRemaining > 0) {
        if (state.zones.dp.length > 0)
            candidates.push(action(state, actorId, "draw", "top", "ACTION", [], [], { kind: "core-draw" }, { cardsDrawn: state.players[actorId].hand.length === 0 ? Math.min(2, state.zones.dp.length) : 1 }));
        if (!state.players[actorId].limits.swapBarUsedThisFT)
            for (const id of state.zones.swapBar.filter((cardId) => state.cards[cardId]?.state.swapBarFaceUp === true))
                candidates.push(action(state, actorId, "swap-bar", "face-up-draw", "ACTION", [], [id], { kind: "core-face-up-swap-draw", swapCardId: id }));
        for (const id of state.players[actorId].hand) {
            const c = state.cards[id];
            if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId) && (parseIdentity(c.identity)?.rank === "7" || c.identity === "10♣" || c.identity === "BJ"))
                continue;
            candidates.push(action(state, actorId, "score", "points", "ACTION", [id], [], { kind: "core-score", cardId: id }, { immediatePoints: cardPointValue(c) }));
        }
        const boardLockActive = (state.metadata.boardLock?.turnsRemaining ?? 0) > 0;
        if (!boardLockActive) {
            for (const sourceId of state.players[actorId].hand)
                for (const opponentId of state.turnOrder.filter((id) => id !== actorId))
                    for (const targetId of state.players[opponentId].pr)
                        candidates.push(action(state, actorId, "scuttle", "ordinary", "ACTION", [sourceId], [targetId], { kind: "core-scuttle", sourceCardId: sourceId, targetCardId: targetId }));
            for (const effect of enumerateCoreEffectCandidates(state, actorId))
                candidates.push(action(state, actorId, effect.family, effect.mode, "ACTION", [...effect.sourceCardIds], [...effect.targetCardIds], { kind: "core-resolve-effect", effect: effect.effect }, effect.featureVector));
            if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId))
                for (const advanced of enumerateAdvancedCoreCandidates(state, actorId).filter((entry) => entry.timingClass === "ACTION" || (entry.timingClass === "INTERRUPT" && !("targetStackItemId" in entry.advanced))))
                    candidates.push(action(state, actorId, advanced.family, advanced.mode, advanced.timingClass, [...advanced.sourceCardIds], [...advanced.targetCardIds], { kind: "core-resolve-advanced", advanced: advanced.advanced }, advanced.featureVector));
            // Solo Wild Copy: a single 2 can copy a same-suit rank 3-7 Base effect
            for (const candidate of enumerateSoloWildCopyCandidates(state, actorId))
                candidates.push(candidate);
            // K♠ Wild Sovereignty: K♠ copies one Spade Base effect of rank 3-7 and is Exiled after.
            if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId))
                for (const candidate of enumerateWildSovereigntyCandidates(state, actorId))
                    candidates.push(candidate);
        }
        if ([CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId)) {
            for (const sourceId of state.players[actorId].hand) {
                const rank = parseIdentity(state.cards[sourceId].identity)?.rank;
                if (rank === "8")
                    candidates.push(action(state, actorId, "quick", "eight-aegis-field", "QUICK", [sourceId], [], { kind: "core-declare-eight-aegis-field", sourceCardId: sourceId }, { quick: true, aegis: true }));
                if (rank === "Q")
                    for (const targetId of [...state.players[actorId].pr, ...state.players[actorId].er])
                        candidates.push(action(state, actorId, "quick", "queen-aegis", "QUICK", [sourceId], [targetId], { kind: "core-declare-queen-aegis-quick", sourceCardId: sourceId, targetCardId: targetId }, { quick: true, aegis: true }));
                // Black Joker Board Lock: Quick Effect, no Mini-Turn cost, open-state declaration only.
                if (rank === "BJ")
                    candidates.push(action(state, actorId, "quick", "board-lock", "QUICK", [sourceId], [], { kind: "core-declare-board-lock-quick", sourceCardId: sourceId }, { quick: true, boardLock: true, noMiniTurn: true }));
            }
        }
        // Ordinary Pass is canonically unavailable. Exhausted Pass is offered only when Exhausted is active, DP is empty, and no other accepted Mini-Turn Action exists.
    }
    let accepted = candidates.filter((candidate) => engine.execute(state, candidate.command).accepted).sort((a, b) => a.actionId.localeCompare(b.actionId));
    if (state.phase === "Action" && state.players[actorId].limits.miniTurnsRemaining > 0 && core.exhausted && state.zones.dp.length === 0 && accepted.length === 0) {
        const exhaustedPass = action(state, actorId, "exhausted-pass", "forced-mini-turn", "ACTION", [], [], { kind: "core-exhausted-pass" }, { progress: true, forced: true });
        if (engine.execute(state, exhaustedPass.command).accepted)
            accepted.push(exhaustedPass);
    }
    if ([CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId) && state.phase === "Action") {
        const disrupted = new Set(core.disruptedActionTypesByPlayer?.[actorId] ?? []);
        const rootType = (entry) => entry.command.action.kind === "core-declare-primary" ? primaryDescriptor(entry.command.action.action).actionType : null;
        const availableRootTypes = new Set(accepted.map(rootType).filter((value) => value !== null));
        accepted = accepted.filter((entry) => { const type = rootType(entry); if (!type || !disrupted.has(type))
            return true; return ![...availableRootTypes].some((other) => other !== type); });
    }
    return { stateRevision: state.revision, actorId, actions: accepted, frameHash: hashCanonical(accepted.map((item) => ({ actionId: item.actionId, commandHash: item.commandHash }))) };
}
export function enumerateCoreResponseActions(state, actorId) {
    const engine = new IntrilexEngine();
    const runtime = readCoreRuntime(state);
    const priorityActor = currentPriorityActor(state);
    if (![CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(runtime?.profileId) || priorityActor !== actorId)
        return { stateRevision: state.revision, actorId, actions: [], frameHash: hashCanonical([]) };
    const target = currentCoreStackTarget(state);
    // Self-response guard: after the opponent has auto-passed priority
    // (consecutivePasses >= 1), the original declarer must NOT be offered a
    // response window to their own stack item. Returning empty actions causes
    // advanceCoreToDecision to auto-pass for the declarer too, and the stack
    // resolves immediately.
    if (target && target.controllerId === actorId && (state.priority?.consecutivePasses ?? 0) >= 1) {
        return { stateRevision: state.revision, actorId, actions: [], frameHash: hashCanonical([]) };
    }
    const candidates = [];
    if (target) {
        for (const sourceId of [...state.players[actorId].hand].sort()) {
            const parsed = parseIdentity(state.cards[sourceId].identity);
            if (parsed?.rank === "A") {
                candidates.push(action(state, actorId, "counter", parsed.suit === "♠" ? "ace-spade" : "ace-base", "INSTANT", [sourceId], [], parsed.suit === "♠" ? { kind: "core-declare-spade-ace-counter", sourceCardId: sourceId, targetStackItemId: target.id } : { kind: "core-declare-base-ace-counter", sourceCardId: sourceId, targetStackItemId: target.id, sourceMode: "hand" }, { counter: true }));
            }
            if (parsed?.rank === "8") {
                candidates.push(action(state, actorId, "counter", "eight-scuttle", "INSTANT", [sourceId], [], { kind: "core-declare-eight-scuttle-counter", sourceCardId: sourceId, targetStackItemId: target.id }, { counter: true, scuttle: true }));
                if (parsed.suit === "♠")
                    for (const opponentId of state.turnOrder.filter((id) => id !== actorId))
                        for (const targetCardId of state.players[opponentId].pr)
                            candidates.push(action(state, actorId, "instant", "eight-spade-free-scuttle", "INSTANT", [sourceId], [targetCardId], { kind: "core-declare-eight-spade-free-scuttle", sourceCardId: sourceId, targetCardId }, { scuttle: true, free: true }));
                if (state.activePlayerId === actorId)
                    candidates.push(action(state, actorId, "quick", "eight-aegis-field", "QUICK", [sourceId], [], { kind: "core-declare-eight-aegis-field", sourceCardId: sourceId }, { quick: true, aegis: true }));
            }
            if (parsed?.rank === "9")
                for (const opponentId of state.turnOrder.filter((id) => id !== actorId))
                    for (const targetCardId of state.players[opponentId].pr)
                        candidates.push(action(state, actorId, "instant", "nine-tap", "INSTANT", [sourceId], [targetCardId], { kind: "core-declare-nine-tap", sourceCardId: sourceId, targetCardId }, { tap: true }));
            if (parsed?.rank === "J")
                candidates.push(action(state, actorId, "disrupt", "jack", "INSTANT", [sourceId], [], { kind: "core-declare-jack-disrupt", sourceCardId: sourceId, targetStackItemId: target.id }, { disrupt: true }));
            if (parsed?.rank === "K")
                candidates.push(action(state, actorId, "counter", "king-anchor", "INSTANT", [sourceId], [], { kind: "core-declare-king-counter", sourceCardId: sourceId, targetStackItemId: target.id }, { counter: true, specialized: true }));
            if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(runtime?.profileId) && parsed?.rank === "K" && parsed.suit === "♠")
                candidates.push(action(state, actorId, "counter", "king-spade", "INSTANT", [sourceId], [], { kind: "core-declare-king-spade-counter", sourceCardId: sourceId, targetStackItemId: target.id }, { counter: true, multiCard: true }));
            if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(runtime?.profileId)
                && parsed?.rank === "10"
                && parsed.suit === "♠"
                && target.coreAuthority?.kind === "primary"
                && target.sourceCardIds.length === 1
                && ["ordinary-effect", "anchor", "rank10"].includes(target.coreAuthority.stackClass))
                candidates.push(action(state, actorId, "interrupt", "rank10-stack-theft", "INTERRUPT", [sourceId], [], { kind: "core-declare-rank10-stack-theft", sourceCardId: sourceId, targetStackItemId: target.id }, { controlChange: true, printedFullTurnSkips: 2, genericInterruptTax: false }));
            if (parsed?.rank === "Q" && state.activePlayerId === actorId)
                for (const targetCardId of [...state.players[actorId].pr, ...state.players[actorId].er])
                    candidates.push(action(state, actorId, "quick", "queen-aegis", "QUICK", [sourceId], [targetCardId], { kind: "core-declare-queen-aegis-quick", sourceCardId: sourceId, targetCardId }, { quick: true, aegis: true }));
        }
        if ([CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(runtime?.profileId)) {
            const hand = [...state.players[actorId].hand].sort();
            const aces = hand.filter((id) => parseIdentity(state.cards[id].identity)?.rank === "A");
            for (let i = 0; i < aces.length; i++)
                for (let j = i + 1; j < aces.length; j++)
                    candidates.push(action(state, actorId, "counter", "super-ace", "INSTANT", [aces[i], aces[j]], [], { kind: "core-declare-super-ace-counter", sourceCardIds: [aces[i], aces[j]], targetStackItemId: target.id }, { counter: true, super: true }));
            const reds = hand.filter((id) => ["♦", "♥"].includes(parseIdentity(state.cards[id].identity)?.suit ?? ""));
            for (let i = 0; i < reds.length; i++)
                for (let j = i + 1; j < reds.length; j++)
                    for (let k = j + 1; k < reds.length; k++)
                        candidates.push(action(state, actorId, "ultra", "three-red-counter", "INSTANT", [reds[i], reds[j], reds[k]], [], { kind: "core-declare-ultra-three-red", sourceCardIds: [reds[i], reds[j], reds[k]], targetStackItemId: target.id }, { counter: true, ultra: true }));
        }
        for (const sourceId of [...state.players[actorId].er].sort())
            if (parseIdentity(state.cards[sourceId].identity)?.rank === "A")
                candidates.push(action(state, actorId, "counter", "ace-anchor", "INSTANT", [sourceId], [], { kind: "core-declare-base-ace-counter", sourceCardId: sourceId, targetStackItemId: target.id, sourceMode: "anchor" }, { counter: true, anchor: true }));
    }
    const accepted = candidates.filter((entry) => engine.execute(state, entry.command).accepted).sort((a, b) => a.actionId.localeCompare(b.actionId));
    if (accepted.length > 0)
        accepted.push(action(state, actorId, "response-decline", "decline", "INSTANT", [], target ? [target.id] : [], { kind: "core-pass-priority", semantic: "DECLINE_RESPONSE" }, { progress: false, hadLawfulResponse: true }));
    accepted.sort((a, b) => a.actionId.localeCompare(b.actionId));
    return { stateRevision: state.revision, actorId, actions: accepted, frameHash: hashCanonical(accepted.map((entry) => ({ actionId: entry.actionId, commandHash: entry.commandHash }))) };
}
export function toAuthorizedCoreAction(value) {
    return { actionId: value.actionId, actorId: value.actorId, family: value.family, mode: value.mode, timingClass: value.timingClass, sourceHandles: [...value.sourceCardIds], targetHandles: [...value.targetCardIds], publicSummaryCode: value.publicSummaryCode, featureVector: canonicalClone(value.featureVector), engineCommandHash: value.commandHash };
}
export function createCoreMatchState(setup) {
    if (![CORE_FOUNDATION_AUTHORITY_PROFILE.id, CORE_EFFECT_DECLARATION_PROFILE.id, CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(setup.profileId))
        throw new Error(`Unsupported Core profile ${setup.profileId}`);
    if (setup.enabledModules.length > 0)
        throw new Error("Core Foundation Authority does not permit optional modules");
    if (new Set(setup.playerIds).size !== 2 || new Set(setup.seatOrder).size !== 2 || setup.seatOrder.some((id) => !setup.playerIds.includes(id)))
        throw new Error("Core Foundation requires two distinct players and a complete seat order");
    if (!Number.isInteger(setup.seed) || (setup.seed >>> 0) === 0)
        throw new Error("seed must be a nonzero uint32");
    const state = createEmptyState([...setup.seatOrder]);
    state.rng = { algorithm: "xorshift32", seed: setup.seed >>> 0, cursor: 0 };
    const cmd = { id: `CORE-SETUP-${setup.seed >>> 0}`, type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: setup.seatOrder[0], action: { kind: "core-apply-setup", playerIds: [...setup.seatOrder], profileId: setup.profileId } };
    const result = new IntrilexEngine().execute(state, cmd);
    if (!result.accepted)
        throw new Error(`Core setup rejected: ${result.error?.code}:${result.error?.message}`);
    assertValidState(result.state);
    return result.state;
}
export function advanceCoreToDecision(input, maxCommands = 16) {
    const engine = new IntrilexEngine();
    let state = canonicalClone(input);
    const events = [];
    const executedCommands = [];
    for (let index = 0; index < maxCommands; index += 1) {
        const core = readCoreRuntime(state);
        if (!core || ![CORE_FOUNDATION_AUTHORITY_PROFILE.id, CORE_EFFECT_DECLARATION_PROFILE.id, CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId))
            return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "CORE_PROFILE_UNAVAILABLE" };
        if (state.winner !== null || core.terminalReason)
            return { status: "TERMINAL", state, events, executedCommands, reasonCode: core.terminalReason ?? "NORMAL_VICTORY" };
        const pendingChoice = activeCorePrivateChoice(state);
        if (pendingChoice) {
            const frame = enumerateCorePrivateChoiceActions(state, pendingChoice.chooserId);
            if (frame.actions.length === 0)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "CORE_NO_PRIVATE_CHOICE_ACTION" };
            return { status: "PLAYER_DECISION_REQUIRED", state, events, executedCommands, decisionActorId: pendingChoice.chooserId, legalActionFrame: frame };
        }
        if ([CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId) && state.priority?.open === true) {
            const responseActorId = currentPriorityActor(state);
            const frame = enumerateCoreResponseActions(state, responseActorId);
            if (frame.actions.length > 0)
                return { status: "PLAYER_DECISION_REQUIRED", state, events, executedCommands, decisionActorId: responseActorId, legalActionFrame: frame };
            const cmd = command(state, responseActorId, `ORCH-${index}-AUTO-PRIORITY`, { kind: "core-pass-priority", semantic: "AUTOMATIC_PRIORITY_ADVANCE" });
            const result = engine.execute(state, cmd);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `CORE_ORCHESTRATION_REJECTED:${result.error?.code}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(cmd);
            continue;
        }
        if ([CORE_RESPONSE_AUTHORITY_PROFILE.id, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, CORE_ADVANCED_AUTHORITY_PROFILE.id, CORE_UNRESTRICTED_AUTHORITY_PROFILE.id].includes(core.profileId) && state.stack.length > 0 && state.priority?.open !== true) {
            const cmd = command(state, state.activePlayerId, `ORCH-${index}-RESOLVE`, { kind: "core-resolve-response-top" });
            const result = engine.execute(state, cmd);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `CORE_ORCHESTRATION_REJECTED:${result.error?.code}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(cmd);
            continue;
        }
        if (state.stack.length > 0 || state.priority?.open === true)
            return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "CORE_STACK_STATE_UNEXPECTED" };
        if (state.phase === "Start" && core.startPreparedFullTurnSequence !== state.fullTurnSequence) {
            const cmd = command(state, state.activePlayerId, `ORCH-${index}-START`, { kind: "core-begin-start", playerId: state.activePlayerId });
            const result = engine.execute(state, cmd);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `CORE_ORCHESTRATION_REJECTED:${result.error?.code}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(cmd);
            continue;
        }
        if (state.phase === "Start" || state.phase === "Action") {
            const frame = enumerateCoreLegalActions(state, state.activePlayerId);
            if (frame.actions.length === 0)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "CORE_NO_LEGAL_ACTION" };
            return { status: "PLAYER_DECISION_REQUIRED", state, events, executedCommands, decisionActorId: state.activePlayerId, legalActionFrame: frame };
        }
        if (state.phase === "End") {
            const cmd = command(state, state.activePlayerId, `ORCH-${index}-END`, { kind: "core-complete-turn" });
            const result = engine.execute(state, cmd);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `CORE_ORCHESTRATION_REJECTED:${result.error?.code}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(cmd);
            continue;
        }
        return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `CORE_PHASE_UNSUPPORTED:${state.phase}` };
    }
    return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "CORE_ORCHESTRATION_COMMAND_LIMIT" };
}
export function runCoreRandomLegalMatch(setup, decisionLimit = 800) {
    let state = createCoreMatchState(setup);
    const commands = [];
    const events = [];
    const decisions = [];
    const policyRng = { algorithm: "xorshift32", seed: ((setup.seed ^ 0x42c0ffee) >>> 0) || 1, cursor: 0 };
    const engine = new IntrilexEngine();
    for (let index = 0; index < decisionLimit; index += 1) {
        const advanced = advanceCoreToDecision(state);
        state = advanced.state;
        commands.push(...advanced.executedCommands);
        events.push(...advanced.events);
        if (advanced.status === "TERMINAL")
            return { state, commands, events, decisions, terminationReason: advanced.reasonCode === "CANONICAL_DRAW" ? "CANONICAL_DRAW" : advanced.reasonCode === "EXHAUSTED_RESOLUTION" ? "EXHAUSTED_RESOLUTION" : "NORMAL_VICTORY" };
        if (advanced.status !== "PLAYER_DECISION_REQUIRED" || !advanced.legalActionFrame)
            return { state, commands, events, decisions, terminationReason: "UNSUPPORTED_CONFIGURATION" };
        const selected = advanced.legalActionFrame.actions[nextIndex(policyRng, advanced.legalActionFrame.actions.length)];
        decisions.push({ actorId: selected.actorId, actionId: selected.actionId, frameHash: advanced.legalActionFrame.frameHash });
        const result = engine.execute(state, selected.command);
        commands.push(selected.command);
        events.push(...result.events);
        if (!result.accepted)
            return { state, commands, events, decisions, terminationReason: "ENGINE_REJECTION" };
        state = result.state;
    }
    return { state, commands, events, decisions, terminationReason: "DECISION_LIMIT" };
}
export function coreAuthorityCapabilities() {
    return [
        { profileId: CORE_FOUNDATION_AUTHORITY_PROFILE.id, canonicalProfile: "CORE", playerCounts: [2], moduleSets: [[]], status: "SUPPORTED", completeActionFamilies: [...CORE_FOUNDATION_AUTHORITY_PROFILE.supportedActions], reasonCodes: ["STANDARD_CORE_SETUP", "ENGINE_OWNED_SWAP_BAR", "ENGINE_OWNED_ACTION_ECONOMY", "ENGINE_OWNED_SCORING_SCUTTLE", "ENGINE_OWNED_VICTORY_EXHAUSTED", "ADVANCED_CORE_EFFECTS_FAIL_CLOSED"] },
        { profileId: CORE_EFFECT_DECLARATION_PROFILE.id, canonicalProfile: "CORE", playerCounts: [2], moduleSets: [[]], status: "SUPPORTED", completeActionFamilies: [...CORE_FOUNDATION_AUTHORITY_PROFILE.supportedActions, ...CORE_EFFECT_DECLARATION_PROFILE.supportedEffects], reasonCodes: ["CORE_FOUNDATION_INHERITED", "ENGINE_OWNED_PUBLIC_EFFECT_DECLARATIONS", "ENGINE_SOUND_TARGET_ENUMERATION", "PRIVATE_CHOICE_EFFECTS_FAIL_CLOSED", "RESPONSE_TIMING_FAILS_CLOSED"] },
        { profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, canonicalProfile: "CORE", playerCounts: [2], moduleSets: [[]], status: "SUPPORTED", completeActionFamilies: [...CORE_FOUNDATION_AUTHORITY_PROFILE.supportedActions, ...CORE_EFFECT_DECLARATION_PROFILE.supportedEffects, ...CORE_RESPONSE_AUTHORITY_PROFILE.supportedResponses], reasonCodes: ["CORE_EFFECT_AUTHORITY_INHERITED", "ENGINE_OWNED_PRIORITY_CIRCULATION", "COUNTER_ON_COUNTER_CHAINS", "AUDITED_QUICK_AND_INSTANT_ACTIONS", "PRIVATE_CHOICE_AND_INTERRUPT_FAMILIES_FAIL_CLOSED"] },
        { profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, canonicalProfile: "CORE", playerCounts: [2], moduleSets: [[]], status: "SUPPORTED", completeActionFamilies: [...CORE_FOUNDATION_AUTHORITY_PROFILE.supportedActions, ...CORE_EFFECT_DECLARATION_PROFILE.supportedEffects, ...CORE_RESPONSE_AUTHORITY_PROFILE.supportedResponses, ...CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.supportedChoices], reasonCodes: ["CORE_RESPONSE_AUTHORITY_INHERITED", "SEALED_PRIVATE_CHOICE_TOKENS", "VIEWER_AUTHORIZED_PROJECTIONS", "ENGINE_OWNED_GENERATED_SEVEN_EFFECTS", "QUICK_PRIVATE_CHOICE_AND_ADVANCED_CORE_FAIL_CLOSED"] },
        { profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, canonicalProfile: "CORE", playerCounts: [2], moduleSets: [[]], status: "SUPPORTED", completeActionFamilies: [...CORE_FOUNDATION_AUTHORITY_PROFILE.supportedActions, ...CORE_EFFECT_DECLARATION_PROFILE.supportedEffects, ...CORE_RESPONSE_AUTHORITY_PROFILE.supportedResponses, ...CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.supportedChoices, ...CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies], reasonCodes: ["ENGINE_OWNED_ADVANCED_PUBLIC_SURFACE", "RANK10_PRINTED_PENALTIES_ONLY", "PUBLIC_SUPERS_ULTRAS_VOLTAGE_ROYAL_MARRIAGE", "MIMIC_AND_HIDDEN_SUPER_BRANCHES_FAIL_CLOSED"] },
        { profileId: CORE_UNRESTRICTED_AUTHORITY_PROFILE.id, canonicalProfile: "CORE", playerCounts: [2], moduleSets: [[]], status: "SUPPORTED", completeActionFamilies: [...CORE_FOUNDATION_AUTHORITY_PROFILE.supportedActions, ...CORE_EFFECT_DECLARATION_PROFILE.supportedEffects, ...CORE_RESPONSE_AUTHORITY_PROFILE.supportedResponses, ...CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.supportedChoices, ...CORE_UNRESTRICTED_AUTHORITY_PROFILE.supportedFamilies], reasonCodes: ["ENGINE_OWNED_UNRESTRICTED_CORE", "HIDDEN_SUPER_BRANCHES", "SUDDEN_DEATH_AUTONOMY", "GENERATED_EFFECT_COPY", "OPTIONAL_MODULES_AND_MULTIPLAYER_FAIL_CLOSED"] }
    ];
}
//# sourceMappingURL=core-autonomy.js.map