import { canonicalClone } from "./canonical-json.js";
export function publicStateView(state) {
    const clone = canonicalClone(state);
    for (const card of Object.values(clone.cards)) {
        if (card.zone.endsWith("_HAND") || card.state.faceDownTrap === true || (card.zone === "STAGING" && card.state.draftFaceUp === false))
            card.identity = "HIDDEN";
    }
    return clone;
}
export function privateStateView(state, viewerId) {
    const clone = canonicalClone(state);
    for (const card of Object.values(clone.cards)) {
        if (((card.zone.endsWith("_HAND") || card.state.faceDownTrap === true) && card.controllerId !== viewerId) || (card.zone === "STAGING" && card.state.draftFaceUp === false))
            card.identity = "HIDDEN";
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
        commands: replay.commands.map((command) => command.type === "HIDDEN_CHOICE" ? { ...command, payload: { redacted: true } } : command),
        events: publicEventView(replay.events)
    };
}
//# sourceMappingURL=views.js.map