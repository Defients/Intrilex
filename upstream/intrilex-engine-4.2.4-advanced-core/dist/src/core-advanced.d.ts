import type { CardId, CoreAdvancedAction, EngineState, PlayerId, Visibility } from "./types.js";
export declare const CORE_ADVANCED_AUTHORITY_PROFILE: Readonly<{
    id: "core-advanced-authority";
    displayName: "Advanced Core Authority — Audited Public Supers, Rank 10, Ultras, Voltage & Royal Marriage";
    rulesVersion: "4.1";
    engineVersion: "4.2.4";
    playerCount: 2;
    enabledModules: readonly [];
    supportedFamilies: readonly ["royal-marriage", "super-two-score", "super-four-exchange", "super-eight", "super-jack", "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft", "super-ace", "king-spade-counter", "ultra-three-black-public", "ultra-three-red", "ultra-two-black-two-red", "voltage-five-gy-bottom"];
    excludedSystems: readonly ["ten-club-foundation-trigger", "ten-diamond-mimic", "super-two-hold-child", "super-three-private", "super-five-private", "super-six-private", "super-seven-sequential", "rank10-generated-effect-copy", "voltage-three-choice", "voltage-four-private-prediction", "voltage-five-refine-private", "special-scoring-riders-seven-ten-club-black-joker", "sudden-death-autonomy", "optional-modules", "multiplayer"];
    rationale: "Engine-owned advanced public Core slice. Every advertised mode is complete; copied effects, hidden continuations, Start-child control, and special scoring riders remain fail-closed.";
}>;
type Event = {
    type: string;
    payload: Record<string, unknown>;
    visibility?: Visibility;
};
export type AdvancedResolution = {
    ok: true;
    state: EngineState;
    events: Event[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function isAdvancedProfile(s: Readonly<EngineState>): boolean;
export declare function advancedSourceIds(a: CoreAdvancedAction): CardId[];
export declare function advancedTargetIds(a: CoreAdvancedAction): CardId[];
export declare function advancedStackClass(a: CoreAdvancedAction): "super" | "ultra" | "royal-marriage" | "rank10" | "voltage";
export declare function resolveAdvancedCoreAction(input: EngineState, actorId: PlayerId, a: CoreAdvancedAction): AdvancedResolution;
export interface AdvancedCoreCandidate {
    family: string;
    mode: string;
    timingClass: "ACTION" | "INSTANT" | "INTERRUPT";
    sourceCardIds: CardId[];
    targetCardIds: CardId[];
    advanced: CoreAdvancedAction;
    featureVector: Record<string, number | boolean | string | null>;
}
export declare function enumerateAdvancedCoreCandidates(state: Readonly<EngineState>, actorId: PlayerId): AdvancedCoreCandidate[];
export {};
