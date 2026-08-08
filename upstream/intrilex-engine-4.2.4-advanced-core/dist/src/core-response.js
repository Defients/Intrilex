import { advancedStackClass } from "./core-advanced.js";
export const CORE_RESPONSE_AUTHORITY_PROFILE = Object.freeze({
    id: "core-response-authority",
    displayName: "Core Response Authority — Quick, Instant & Counter Stack",
    rulesVersion: "4.1",
    engineVersion: "4.2.2",
    playerCount: 2,
    enabledModules: [],
    supportedRootActions: ["draw", "face-up-swap", "play-for-points", "play-for-effect", "scuttle", "pass"],
    supportedResponses: [
        "A-base-counter", "A-anchor-counter", "A-spade-exile-counter", "8-scuttle-counter",
        "8-spade-free-scuttle", "8-aegis-field-quick", "9-tap", "J-disrupt",
        "Q-aegis-quick", "K-anchor-counter"
    ],
    excludedSystems: [
        "private-choice-effects", "two-quick", "four-natural-quick", "six-swap-peek-quick",
        "nine-goal-shift", "rank10-interrupt", "supers", "ultras", "voltage",
        "royal-marriage", "optional-modules", "multiplayer"
    ],
    rationale: "Engine-owned Core priority circulation and audited public Quick/Instant responses. Private-choice and advanced multi-card timing remains fail-closed."
});
export function isCoreResponseProfile(state) {
    const runtime = state.metadata.coreAuthority;
    return runtime?.profileId === CORE_RESPONSE_AUTHORITY_PROFILE.id || runtime?.profileId === "core-private-choice-authority" || runtime?.profileId === "core-advanced-authority";
}
export function primaryDescriptor(action) {
    switch (action.kind) {
        case "core-draw": return { actionType: "draw", stackClass: "draw" };
        case "core-face-up-swap-draw": return { actionType: "face-up-swap", stackClass: "swap" };
        case "core-score": return { actionType: "play-for-points", stackClass: "points" };
        case "core-scuttle": return { actionType: "scuttle", stackClass: "scuttle" };
        case "core-pass": return { actionType: "pass", stackClass: "pass" };
        case "core-resolve-advanced": return { actionType: "play-for-effect", stackClass: advancedStackClass(action.advanced) };
        case "core-resolve-effect":
        case "core-resolve-generated-effect": {
            const k = action.effect.kind;
            return { actionType: "play-for-effect", stackClass: k.endsWith("-anchor") ? "anchor" : "ordinary-effect" };
        }
    }
}
export function currentPriorityActor(state) {
    return state.priority?.open === true ? state.priority.order[state.priority.index] ?? null : null;
}
export function currentCoreStackTarget(state) {
    return state.stack.at(-1) ?? null;
}
//# sourceMappingURL=core-response.js.map