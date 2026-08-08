import type { CardId, DeffySubMode, EngineState, Phase14Action, PlayerId } from "./types.js";
export interface DeffyAddOns {
    speedRun: boolean;
    thatsUrz: boolean;
    thirdPartied: boolean;
    mirrorMe: boolean;
}
export interface Phase14Runtime {
    enabled: boolean;
    subMode: DeffySubMode | null;
    status: "unconfigured" | "drafting" | "complete";
    targetHandSizes: Record<PlayerId, number>;
    draftOrder: PlayerId[];
    nextDrafterIndex: number;
    assignmentByDrafter: Record<PlayerId, PlayerId>;
    poolFaceUpByCard: Record<CardId, boolean>;
    draftedFor: Record<PlayerId, CardId[]>;
    faceDownPicksByDrafter: Record<PlayerId, number>;
    faceUpPicksByDrafter: Record<PlayerId, number>;
    addOns: DeffyAddOns;
    rngAudit: Array<{
        operation: string;
        cursorBefore: number;
        cursorAfter: number;
    }>;
    specsMayBeRevealed: boolean;
    trapPlacementDuringDraft: false;
    lastResolution: Record<string, unknown> | null;
}
export interface Phase14EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase14Resolution = {
    ok: true;
    state: EngineState;
    events: Phase14EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare const DEFAULT_DEFFY_ADDONS: DeffyAddOns;
export declare function phase14Runtime(state: EngineState): Phase14Runtime;
export declare function deffyPoolShape(subMode: DeffySubMode, playerCount: number): {
    total: number | "all";
    faceUp: number | "all";
    faceDown: number;
    privatePools: boolean;
};
export declare function normalDeffyTargets(turnOrder: PlayerId[]): Record<PlayerId, number>;
export declare function validateAssignmentBijection(turnOrder: PlayerId[], assignments: Record<PlayerId, PlayerId>): string | null;
export declare function deterministicShuffle<T>(values: readonly T[], state: EngineState): T[];
export declare function resolvePhase14Action(input: EngineState, actorId: PlayerId, action: Phase14Action): Phase14Resolution;
