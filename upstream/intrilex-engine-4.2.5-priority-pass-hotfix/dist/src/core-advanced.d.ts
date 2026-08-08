import type { CardId, CoreAdvancedAction, EngineState, PlayerId, Visibility } from "./types.js";
export declare const CORE_ADVANCED_AUTHORITY_PROFILE: Readonly<{
    id: "core-advanced-authority";
    displayName: "Advanced Core Authority — Audited Public Supers, Rank 10, Ultras, Voltage & Royal Marriage";
    rulesVersion: "4.1";
    engineVersion: "4.2.5";
    playerCount: 2;
    enabledModules: readonly [];
    supportedFamilies: readonly ["royal-marriage", "super-two-score", "super-two-hold", "super-four-exchange", "super-eight", "super-jack", "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft", "rank10-diamond-mimic", "rank10-club-foundation", "super-ace", "king-spade-counter", "ultra-three-black-public", "ultra-three-red", "ultra-two-black-two-red", "voltage-five-gy-bottom", "voltage-three-choice", "voltage-four-prediction", "voltage-five-refine", "special-scoring-riders"];
    excludedSystems: readonly ["super-three-private", "super-five-private", "super-six-private", "super-seven-sequential", "rank10-generated-effect-copy", "sudden-death-autonomy", "optional-modules", "multiplayer"];
    rationale: "Engine-owned advanced public Core slice. 10♣ Foundation, ⭐2 Hold, Voltage 3/4/5 Refine, and scoring riders are now supported. Hidden Super branches (⭐3/5/6/7), generated effect copy, and Sudden Death remain fail-closed.";
}>;
export declare const CORE_UNRESTRICTED_AUTHORITY_PROFILE: Readonly<{
    id: "core-unrestricted-authority";
    displayName: "Unrestricted Core Authority — Complete Core including Hidden Supers, Generated Effects, Sudden Death";
    rulesVersion: "4.1";
    engineVersion: "4.2.5";
    playerCount: 2;
    enabledModules: readonly [];
    supportedFamilies: readonly ["royal-marriage", "super-two-score", "super-two-hold", "super-four-exchange", "super-eight", "super-jack", "super-three-raid", "super-five-recycle", "super-six-dig", "super-seven-topdeck", "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft", "rank10-diamond-mimic", "rank10-club-foundation", "rank10-generated-effect-copy", "super-ace", "king-spade-counter", "ultra-three-black-public", "ultra-three-red", "ultra-two-black-two-red", "voltage-five-gy-bottom", "voltage-three-choice", "voltage-four-prediction", "voltage-five-refine", "special-scoring-riders", "sudden-death-autonomy"];
    excludedSystems: readonly ["optional-modules", "multiplayer"];
    rationale: "Complete unrestricted Core. All advanced systems including hidden Super branches, generated effect copy, and Sudden Death are supported. Only optional modules and multiplayer remain excluded.";
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
