import type { AuthorizedCoreAction, CoreDecisionFrame, CoreLegalAction, CoreMatchSetup, CoreOrchestrationResult } from "./core-authority.js";
import type { EngineCommand, EngineEvent, EngineState, PlayerId } from "./types.js";
export declare function enumerateCorePrivateChoiceActions(state: Readonly<EngineState>, actorId: PlayerId): CoreDecisionFrame;
export declare function enumerateCoreLegalActions(state: Readonly<EngineState>, actorId: PlayerId): CoreDecisionFrame;
export declare function enumerateCoreResponseActions(state: Readonly<EngineState>, actorId: PlayerId): CoreDecisionFrame;
export declare function toAuthorizedCoreAction(value: CoreLegalAction): AuthorizedCoreAction;
export declare function createCoreMatchState(setup: CoreMatchSetup): EngineState;
export declare function advanceCoreToDecision(input: Readonly<EngineState>, maxCommands?: number): CoreOrchestrationResult;
export interface CoreMatchResult {
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
export declare function runCoreRandomLegalMatch(setup: CoreMatchSetup, decisionLimit?: number): CoreMatchResult;
export declare function coreAuthorityCapabilities(): ({
    profileId: "core-foundation-authority";
    canonicalProfile: string;
    playerCounts: number[];
    moduleSets: never[][];
    status: string;
    completeActionFamilies: ("draw" | "play-for-points" | "scuttle" | "exhausted-pass" | "face-up-swap" | "face-down-swap")[];
    reasonCodes: string[];
} | {
    profileId: "core-effect-declaration-authority";
    canonicalProfile: string;
    playerCounts: number[];
    moduleSets: never[][];
    status: string;
    completeActionFamilies: ("draw" | "play-for-points" | "scuttle" | "exhausted-pass" | "face-up-swap" | "A-purge" | "A-anchor" | "3-bounce" | "4-row-clear" | "4-spade-total-clear" | "J-attachment" | "Q-anchor" | "K-anchor" | "RJ-four-modes" | "BJ-board-lock" | "face-down-swap")[];
    reasonCodes: string[];
} | {
    profileId: "core-response-authority";
    canonicalProfile: string;
    playerCounts: number[];
    moduleSets: never[][];
    status: string;
    completeActionFamilies: ("draw" | "play-for-points" | "scuttle" | "exhausted-pass" | "face-up-swap" | "A-purge" | "A-anchor" | "3-bounce" | "4-row-clear" | "4-spade-total-clear" | "J-attachment" | "Q-anchor" | "K-anchor" | "RJ-four-modes" | "BJ-board-lock" | "A-base-counter" | "A-anchor-counter" | "A-spade-exile-counter" | "8-scuttle-counter" | "8-spade-free-scuttle" | "8-aegis-field-quick" | "9-tap" | "J-disrupt" | "Q-aegis-quick" | "K-anchor-counter" | "face-down-swap")[];
    reasonCodes: string[];
} | {
    profileId: "core-private-choice-authority";
    canonicalProfile: string;
    playerCounts: number[];
    moduleSets: never[][];
    status: string;
    completeActionFamilies: ("draw" | "play-for-points" | "scuttle" | "exhausted-pass" | "face-up-swap" | "A-purge" | "A-anchor" | "3-bounce" | "4-row-clear" | "4-spade-total-clear" | "J-attachment" | "Q-anchor" | "K-anchor" | "RJ-four-modes" | "BJ-board-lock" | "3-present-take" | "3-force-discard" | "5-recycle-rummage" | "6-deep-dig" | "7-topdeck-casting" | "9-anchor-discard" | "A-base-counter" | "A-anchor-counter" | "A-spade-exile-counter" | "8-scuttle-counter" | "8-spade-free-scuttle" | "8-aegis-field-quick" | "9-tap" | "J-disrupt" | "Q-aegis-quick" | "K-anchor-counter" | "face-down-swap")[];
    reasonCodes: string[];
} | {
    profileId: "core-advanced-authority";
    canonicalProfile: string;
    playerCounts: number[];
    moduleSets: never[][];
    status: string;
    completeActionFamilies: ("draw" | "play-for-points" | "scuttle" | "exhausted-pass" | "face-up-swap" | "king-spade-counter" | "rank10-stack-theft" | "ultra-three-red" | "royal-marriage" | "super-ace" | "A-purge" | "A-anchor" | "3-bounce" | "4-row-clear" | "4-spade-total-clear" | "J-attachment" | "Q-anchor" | "K-anchor" | "RJ-four-modes" | "BJ-board-lock" | "3-present-take" | "3-force-discard" | "5-recycle-rummage" | "6-deep-dig" | "7-topdeck-casting" | "9-anchor-discard" | "super-two-score" | "super-two-hold" | "super-four-exchange" | "super-eight" | "super-jack" | "rank10-heart" | "rank10-spade-recovery" | "rank10-diamond-mimic" | "rank10-club-foundation" | "ultra-three-black-public" | "ultra-two-black-two-red" | "voltage-five-gy-bottom" | "voltage-three-choice" | "voltage-four-prediction" | "voltage-five-refine" | "special-scoring-riders" | "A-base-counter" | "A-anchor-counter" | "A-spade-exile-counter" | "8-scuttle-counter" | "8-spade-free-scuttle" | "8-aegis-field-quick" | "9-tap" | "J-disrupt" | "Q-aegis-quick" | "K-anchor-counter" | "face-down-swap")[];
    reasonCodes: string[];
} | {
    profileId: "core-unrestricted-authority";
    canonicalProfile: string;
    playerCounts: number[];
    moduleSets: never[][];
    status: string;
    completeActionFamilies: ("draw" | "play-for-points" | "scuttle" | "exhausted-pass" | "face-up-swap" | "king-spade-counter" | "rank10-stack-theft" | "ultra-three-red" | "royal-marriage" | "super-ace" | "A-purge" | "A-anchor" | "3-bounce" | "4-row-clear" | "4-spade-total-clear" | "J-attachment" | "Q-anchor" | "K-anchor" | "RJ-four-modes" | "BJ-board-lock" | "3-present-take" | "3-force-discard" | "5-recycle-rummage" | "6-deep-dig" | "7-topdeck-casting" | "9-anchor-discard" | "super-two-score" | "super-two-hold" | "super-four-exchange" | "super-eight" | "super-jack" | "rank10-heart" | "rank10-spade-recovery" | "rank10-diamond-mimic" | "rank10-club-foundation" | "ultra-three-black-public" | "ultra-two-black-two-red" | "voltage-five-gy-bottom" | "voltage-three-choice" | "voltage-four-prediction" | "voltage-five-refine" | "special-scoring-riders" | "rank10-generated-effect-copy" | "sudden-death-autonomy" | "super-three-raid" | "super-five-recycle" | "super-six-dig" | "super-seven-topdeck" | "A-base-counter" | "A-anchor-counter" | "A-spade-exile-counter" | "8-scuttle-counter" | "8-spade-free-scuttle" | "8-aegis-field-quick" | "9-tap" | "J-disrupt" | "Q-aegis-quick" | "K-anchor-counter" | "face-down-swap")[];
    reasonCodes: string[];
})[];
