import { canonicalClone } from "./canonical-json.js";
const DRAW_PILE_ZONES = new Set(["DP", "dp"]);
function isDrawPileZone(zone) {
    return zone !== undefined && DRAW_PILE_ZONES.has(zone);
}
function replaceProjectedCardIds(value, replacements) {
    if (typeof value === "string")
        return replacements.get(value) ?? value;
    if (Array.isArray(value))
        return value.map((entry) => replaceProjectedCardIds(entry, replacements));
    if (value && typeof value === "object") {
        const output = {};
        for (const [key, entry] of Object.entries(value))
            output[key] = replaceProjectedCardIds(entry, replacements);
        return output;
    }
    return value;
}
function applyOpaqueHiddenCardHandles(state, hiddenCardIds) {
    if (hiddenCardIds.length === 0)
        return state;
    const replacements = new Map(hiddenCardIds.slice().sort().map((id, index) => [id, `OPAQUE-HIDDEN-CARD-${String(index + 1).padStart(3, "0")}`]));
    const transformed = replaceProjectedCardIds(state, replacements);
    const remappedCards = {};
    for (const [originalId, card] of Object.entries(transformed.cards))
        remappedCards[replacements.get(originalId) ?? originalId] = card;
    transformed.cards = remappedCards;
    return transformed;
}
export function publicStateView(state) {
    let clone = canonicalClone(state);
    const hiddenCardIds = Object.values(clone.cards)
        .filter((card) => isDrawPileZone(card.zone) || card.zone.endsWith("_HAND") || card.state.faceDownTrap === true || card.state.swapBarFaceDown === true || (card.zone === "STAGING" && card.state.draftFaceUp === false) || (card.state.privateChoiceHeldBy !== undefined && card.state.privateChoicePublicReveal !== true))
        .map((card) => card.id);
    clone = applyOpaqueHiddenCardHandles(clone, hiddenCardIds);
    for (const card of Object.values(clone.cards)) {
        const privateChoiceHidden = card.state.privateChoiceHeldBy !== undefined && card.state.privateChoicePublicReveal !== true;
        if (isDrawPileZone(card.zone) || card.zone.endsWith("_HAND") || card.state.faceDownTrap === true || card.state.swapBarFaceDown === true || (card.zone === "STAGING" && card.state.draftFaceUp === false) || privateChoiceHidden)
            card.identity = "HIDDEN";
        delete card.state.privateChoiceHeldBy;
        delete card.state.privateChoicePublicReveal;
        delete card.state.privateChoiceSource;
    }
    delete clone.rng;
    const autonomy = clone.metadata.autonomy;
    if (autonomy?.privateChoice) {
        const choice = autonomy.privateChoice;
        autonomy.privateChoice = { choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, stage: choice.stage, optionCount: Array.isArray(choice.optionCardIds) ? choice.optionCardIds.length : 0, sealed: true };
    }
    const core = clone.metadata.coreAuthority;
    if (core?.privateChoice) {
        const choice = core.privateChoice;
        core.privateChoice = { choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, stage: choice.stage, optionCount: Array.isArray(choice.optionCardIds) ? choice.optionCardIds.length : 0, sealed: true };
    }
    return clone;
}
export function privateStateView(state, viewerId) {
    let clone = canonicalClone(state);
    const hiddenCardIds = Object.values(clone.cards)
        .filter((card) => isDrawPileZone(card.zone) || (((card.zone.endsWith("_HAND") || card.state.faceDownTrap === true || card.state.swapBarFaceDown === true) && card.controllerId !== viewerId) || (card.zone === "STAGING" && card.state.draftFaceUp === false) || (card.state.privateChoiceHeldBy !== undefined && card.state.privateChoiceHeldBy !== viewerId && card.state.privateChoicePublicReveal !== true)))
        .map((card) => card.id);
    clone = applyOpaqueHiddenCardHandles(clone, hiddenCardIds);
    for (const card of Object.values(clone.cards)) {
        const heldBy = card.state.privateChoiceHeldBy;
        const privateChoiceHidden = heldBy !== undefined && heldBy !== viewerId && card.state.privateChoicePublicReveal !== true;
        if (isDrawPileZone(card.zone) || ((card.zone.endsWith("_HAND") || card.state.faceDownTrap === true || card.state.swapBarFaceDown === true) && card.controllerId !== viewerId) || (card.zone === "STAGING" && card.state.draftFaceUp === false) || privateChoiceHidden)
            card.identity = "HIDDEN";
        delete card.state.privateChoiceHeldBy;
        delete card.state.privateChoicePublicReveal;
        delete card.state.privateChoiceSource;
    }
    delete clone.rng;
    const autonomy = clone.metadata.autonomy;
    if (autonomy?.privateChoice && autonomy.privateChoice.chooserId !== viewerId) {
        const choice = autonomy.privateChoice;
        autonomy.privateChoice = { choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, stage: choice.stage, optionCount: Array.isArray(choice.optionCardIds) ? choice.optionCardIds.length : 0, sealed: true };
    }
    const core = clone.metadata.coreAuthority;
    if (core?.privateChoice && core.privateChoice.chooserId !== viewerId) {
        const choice = core.privateChoice;
        core.privateChoice = { choiceId: choice.choiceId, kind: choice.kind, chooserId: choice.chooserId, controllerId: choice.controllerId, sourceCardId: choice.sourceCardId, stage: choice.stage, optionCount: Array.isArray(choice.optionCardIds) ? choice.optionCardIds.length : 0, sealed: true };
    }
    return clone;
}
export function publicEventView(events) {
    return events.map((event) => {
        if (event.visibility === "public")
            return canonicalClone(event);
        return {
            ...canonicalClone(event),
            payload: { redacted: true, visibility: event.visibility }
        };
    });
}
export function publicReplayView(replay) {
    return {
        ...replay,
        initialState: publicStateView(replay.initialState),
        commands: replay.commands.map((command) => {
            if (command.type === "HIDDEN_CHOICE")
                return { ...command, payload: { redacted: true } };
            if (command.type === "RESOLVE_PHASE9_ACTION" && command.action.kind === "autonomy-submit-private-choice") {
                return {
                    id: command.id,
                    type: command.type,
                    actorId: command.actorId,
                    action: {
                        kind: command.action.kind,
                        token: "REDACTED",
                        submission: { kind: command.action.submission.kind, redacted: true }
                    }
                };
            }
            if (command.type === "RESOLVE_CORE_AUTHORITY_ACTION" && command.action.kind === "core-submit-private-choice") {
                return {
                    id: command.id,
                    type: command.type,
                    actorId: command.actorId,
                    action: {
                        kind: command.action.kind,
                        token: "REDACTED",
                        submission: { kind: command.action.submission.kind, redacted: true }
                    }
                };
            }
            return command;
        }),
        events: publicEventView(replay.events)
    };
}
//# sourceMappingURL=views.js.map