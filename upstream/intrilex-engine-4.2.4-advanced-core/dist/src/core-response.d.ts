import type { CoreFoundationActionType, CorePrimaryAction, CoreStackPayload, EngineState, PlayerId, StackItem } from "./types.js";
export declare const CORE_RESPONSE_AUTHORITY_PROFILE: Readonly<{
    id: "core-response-authority";
    displayName: "Core Response Authority — Quick, Instant & Counter Stack";
    rulesVersion: "4.1";
    engineVersion: "4.2.2";
    playerCount: 2;
    enabledModules: readonly [];
    supportedRootActions: readonly ["draw", "face-up-swap", "play-for-points", "play-for-effect", "scuttle", "pass"];
    supportedResponses: readonly ["A-base-counter", "A-anchor-counter", "A-spade-exile-counter", "8-scuttle-counter", "8-spade-free-scuttle", "8-aegis-field-quick", "9-tap", "J-disrupt", "Q-aegis-quick", "K-anchor-counter"];
    excludedSystems: readonly ["private-choice-effects", "two-quick", "four-natural-quick", "six-swap-peek-quick", "nine-goal-shift", "rank10-interrupt", "supers", "ultras", "voltage", "royal-marriage", "optional-modules", "multiplayer"];
    rationale: "Engine-owned Core priority circulation and audited public Quick/Instant responses. Private-choice and advanced multi-card timing remains fail-closed.";
}>;
export declare function isCoreResponseProfile(state: Readonly<EngineState>): boolean;
export declare function primaryDescriptor(action: CorePrimaryAction): {
    actionType: CoreFoundationActionType;
    stackClass: Extract<CoreStackPayload, {
        kind: "primary";
    }>["stackClass"];
};
export declare function currentPriorityActor(state: Readonly<EngineState>): PlayerId | null;
export declare function currentCoreStackTarget(state: Readonly<EngineState>): StackItem | null;
