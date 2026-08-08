import type { CardId, CoreAuthorityAction, CoreAuthorityProfileId, EngineCommand, EngineEvent, EngineState, PlayerId, Visibility } from "./types.js";
export declare const CORE_FOUNDATION_AUTHORITY_PROFILE: Readonly<{
    id: "core-foundation-authority";
    displayName: "Core Foundation Authority — Setup, Swap Bar & Action Economy";
    rulesVersion: "4.1.2";
    engineVersion: "4.2.0";
    playerCount: 2;
    goal: 21;
    enabledModules: readonly [];
    supportedActions: readonly ["face-down-swap", "draw", "face-up-swap", "play-for-points", "scuttle", "exhausted-pass"];
    excludedSystems: readonly ["effect-plays", "draw-and-cast", "quick-plays", "responses", "voltage", "rank10-effects", "supers", "ultras", "royal-marriage", "sudden-death", "optional-modules", "multiplayer"];
    rationale: "Canonical two-player Core setup and action-economy foundation. Every supported transition is engine-owned; advanced effect and response systems fail closed.";
}>;
export interface CoreMatchSetup {
    profileId: CoreAuthorityProfileId;
    playerIds: readonly [PlayerId, PlayerId];
    seatOrder: readonly [PlayerId, PlayerId];
    enabledModules: readonly string[];
    seed: number;
}
export interface CoreLegalAction {
    actionId: string;
    actorId: PlayerId;
    family: string;
    mode: string;
    timingClass: "ACTION" | "SETUP" | "QUICK" | "INSTANT" | "INTERRUPT";
    sourceCardIds: readonly CardId[];
    targetCardIds: readonly CardId[];
    publicSummaryCode: string;
    featureVector: Readonly<Record<string, number | boolean | string | null>>;
    command: Extract<EngineCommand, {
        type: "RESOLVE_CORE_AUTHORITY_ACTION";
    }>;
    commandHash: string;
}
export interface AuthorizedCoreAction {
    actionId: string;
    actorId: PlayerId;
    family: string;
    mode: string;
    timingClass: CoreLegalAction["timingClass"];
    sourceHandles: readonly CardId[];
    targetHandles: readonly CardId[];
    publicSummaryCode: string;
    featureVector: CoreLegalAction["featureVector"];
    engineCommandHash: string;
}
export interface CoreDecisionFrame {
    stateRevision: number;
    actorId: PlayerId;
    actions: readonly CoreLegalAction[];
    frameHash: string;
}
export interface CoreOrchestrationResult {
    status: "PLAYER_DECISION_REQUIRED" | "TERMINAL" | "UNSUPPORTED_CONFIGURATION";
    state: EngineState;
    events: readonly EngineEvent[];
    executedCommands: readonly EngineCommand[];
    decisionActorId?: PlayerId;
    legalActionFrame?: CoreDecisionFrame;
    reasonCode?: string;
}
export interface CoreActionResolution {
    ok: true;
    state: EngineState;
    events: {
        type: string;
        payload: Record<string, unknown>;
        visibility?: Visibility;
    }[];
}
export interface CoreActionFailure {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
}
export declare function resolveCoreAuthorityAction(input: EngineState, actorId: PlayerId, action: CoreAuthorityAction): CoreActionResolution | CoreActionFailure;
