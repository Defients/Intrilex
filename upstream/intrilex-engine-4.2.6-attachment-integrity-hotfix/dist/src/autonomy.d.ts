import type { CardId, EngineCommand, EngineEvent, EngineState, PlayerId } from "./types.js";
export declare const FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE: Readonly<{
    id: "first-contact-baseline";
    displayName: "First Contact Baseline — Score/Scuttle";
    rulesVersion: "4.1";
    teachingOverrideId: "AUTONOMY_BASELINE_V1";
    playerCount: 2;
    goal: 15;
    enabledGenericEffects: readonly [];
    allowedActions: readonly ["draw", "play-for-points", "scuttle", "exhausted-pass"];
    rationale: "Canonical First Contact teaching override with a smaller explicit generic-effect allowlist (empty).";
}>;
export declare const FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE: Readonly<{
    id: "first-contact-essentials";
    displayName: "First Contact Essentials — Effects & Guard";
    rulesVersion: "4.1";
    teachingOverrideId: "AUTONOMY_ESSENTIALS_V1";
    playerCount: 2;
    goal: 15;
    enabledGenericEffects: readonly ["4-row-clear", "9-tap", "9-goal-shift", "J-pr-attachment", "Q-anchor-guard", "K-anchor", "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"];
    excludedGenericEffects: readonly ["3-opponent-choice", "5-post-mill-choice", "6-private-draw-choice", "7-generated-effect-play", "8-scuttle-counter", "9-anchor-opponent-choice", "J-disrupt-response", "K-counter-response"];
    allowedActions: readonly ["draw", "play-for-points", "play-for-effect", "scuttle", "exhausted-pass"];
    rationale: "Canonical First Contact teaching override using a smaller explicit generic-effect allowlist. Every enabled consequence is engine-owned; response-window and mid-resolution choice effects remain excluded.";
}>;
export declare const FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE: Readonly<{
    id: "first-contact-response";
    displayName: "First Contact Response Authority — Effects, Guard & Counters";
    rulesVersion: "4.1";
    teachingOverrideId: "AUTONOMY_RESPONSE_AUTHORITY_V1";
    playerCount: 2;
    goal: 15;
    enabledGenericEffects: readonly ["4-row-clear", "9-tap", "9-goal-shift", "J-pr-attachment", "Q-anchor-guard", "K-anchor", "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"];
    enabledResponses: readonly ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"];
    excludedGenericEffects: readonly ["3-opponent-choice", "5-post-mill-choice", "6-private-draw-choice", "7-generated-effect-play", "9-anchor-opponent-choice"];
    allowedActions: readonly ["draw", "play-for-points", "play-for-effect", "scuttle", "exhausted-pass"];
    rationale: "Canonical First Contact teaching override with engine-owned priority circulation and generic response authority. Private-choice continuations remain excluded.";
}>;
export declare const FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE: Readonly<{
    id: "first-contact-private-choice";
    displayName: "First Contact Private Choice Authority — Choices, Effects & Responses";
    rulesVersion: "4.1";
    teachingOverrideId: "AUTONOMY_PRIVATE_CHOICE_AUTHORITY_V1";
    playerCount: 2;
    goal: 15;
    enabledGenericEffects: readonly ["3-hand-raid", "3-bounce", "4-row-clear", "5-recycle", "6-dig", "7-topdeck-cast", "9-tap", "9-goal-shift", "9-anchor", "J-pr-attachment", "Q-anchor-guard", "K-anchor", "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"];
    enabledResponses: readonly ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"];
    enabledPrivateChoices: readonly ["3-opponent-presentation", "3-opponent-discard", "3-caster-take", "5-rummage", "6-private-draw", "7-topdeck-assignment", "7-generated-effect", "9-anchor-opponent-discard"];
    excludedGenericEffects: readonly [];
    excludedTriggeredEffects: readonly ["7-scoring-trigger"];
    allowedActions: readonly ["draw", "play-for-points", "play-for-effect", "scuttle", "exhausted-pass"];
    rationale: "Canonical First Contact teaching override with engine-owned response and sealed private-choice continuations. Seven's scoring trigger, optional modules, suit-specific effects, Supers, Ultras, and Core-only systems remain excluded.";
}>;
export declare const FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE: Readonly<{
    id: "first-contact-trigger-closure";
    displayName: "First Contact Trigger Closure — Seven Scoring Authority";
    rulesVersion: "4.1";
    teachingOverrideId: "AUTONOMY_TRIGGER_CLOSURE_V1";
    playerCount: 2;
    goal: 15;
    enabledGenericEffects: readonly ["3-hand-raid", "3-bounce", "4-row-clear", "5-recycle", "6-dig", "7-topdeck-cast", "9-tap", "9-goal-shift", "9-anchor", "J-pr-attachment", "Q-anchor-guard", "K-anchor", "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"];
    enabledResponses: readonly ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"];
    enabledPrivateChoices: readonly ["3-opponent-presentation", "3-opponent-discard", "3-caster-take", "5-rummage", "6-private-draw", "7-topdeck-assignment", "7-generated-effect", "7-scoring-trigger-take-return", "9-anchor-opponent-discard"];
    enabledTriggeredEffects: readonly ["7-scoring-trigger"];
    excludedGenericEffects: readonly [];
    excludedTriggeredEffects: readonly [];
    allowedActions: readonly ["draw", "play-for-points", "play-for-effect", "scuttle", "exhausted-pass"];
    rationale: "Canonical First Contact teaching override with engine-owned response, sealed private-choice continuations, and Seven scoring trigger through the trigger queue and response stack.";
}>;
export interface MatchSetup {
    profileId: string;
    playerIds: readonly PlayerId[];
    enabledModules: readonly string[];
    eventApprovedModules: readonly string[];
    seed: number;
    seatOrder: readonly PlayerId[];
}
export interface LegalActionQuery {
    actorId: PlayerId;
    visibility: "PLAYER_AUTHORIZED" | "OMNISCIENT_DIAGNOSTIC";
    profileId: string;
    enabledModules: readonly string[];
}
export interface EngineLegalAction {
    actionId: string;
    actorId: PlayerId;
    family: string;
    mode: string;
    timingClass: "ACTION" | "QUICK" | "INSTANT" | "INTERRUPT" | "SETUP";
    sourceCardIds: readonly CardId[];
    targetCardIds: readonly CardId[];
    publicSummaryCode: string;
    featureVector: Readonly<Record<string, number | boolean | string | null>>;
    command: EngineCommand;
    commandHash: string;
}
export interface AuthorizedLegalAction {
    actionId: string;
    actorId: PlayerId;
    family: string;
    mode: string;
    timingClass: EngineLegalAction["timingClass"];
    sourceHandles: readonly CardId[];
    targetHandles: readonly CardId[];
    publicSummaryCode: string;
    featureVector: EngineLegalAction["featureVector"];
    engineCommandHash: string;
}
export interface LegalActionFrame {
    stateRevision: number;
    actorId: PlayerId;
    actions: readonly EngineLegalAction[];
    forcedActionId?: string;
    frameHash: string;
}
export interface OrchestrationLimits {
    maxCommands?: number;
}
export type OrchestrationStatus = "PLAYER_DECISION_REQUIRED" | "TERMINAL" | "UNSUPPORTED_CONFIGURATION";
export interface OrchestrationResult {
    status: OrchestrationStatus;
    state: EngineState;
    events: readonly EngineEvent[];
    executedCommands: readonly EngineCommand[];
    decisionActorId?: PlayerId;
    legalActionFrame?: LegalActionFrame;
    reasonCode?: string;
}
export interface AutonomousCapability {
    profileId: string;
    playerCounts: readonly number[];
    moduleSets: readonly (readonly string[])[];
    completeActionFamilies: readonly string[];
    status: "SUPPORTED" | "REPLAY_ONLY" | "BLOCKED";
    reasonCodes: readonly string[];
}
export declare function createMatchState(setup: MatchSetup): EngineState;
export declare function enumerateLegalActions(state: Readonly<EngineState>, query: LegalActionQuery): LegalActionFrame;
export declare function enumerateResponseActions(state: Readonly<EngineState>, query: LegalActionQuery): LegalActionFrame;
export declare function enumeratePrivateChoiceActions(state: Readonly<EngineState>, query: LegalActionQuery): LegalActionFrame;
export declare function authorizedLegalActionView(action: EngineLegalAction): AuthorizedLegalAction;
export declare function advanceToDecision(input: Readonly<EngineState>, limits?: OrchestrationLimits): OrchestrationResult;
export declare function autonomousCapabilities(): readonly AutonomousCapability[];
export interface AutonomousMatchResult {
    state: EngineState;
    commands: EngineCommand[];
    events: EngineEvent[];
    decisions: {
        actorId: PlayerId;
        actionId: string;
        frameHash: string;
    }[];
    terminationReason: "NORMAL_VICTORY" | "EXHAUSTED_RESOLUTION" | "CANONICAL_DRAW" | "DECISION_LIMIT" | "ENGINE_REJECTION" | "UNSUPPORTED_CONFIGURATION";
}
export declare function runRandomLegalMatch(setup: MatchSetup, decisionLimit?: number): AutonomousMatchResult;
