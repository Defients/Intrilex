import type { CardId, CoreEffectAction, EngineState, PlayerId } from "./types.js";
export declare const CORE_EFFECT_DECLARATION_PROFILE: Readonly<{
    id: "core-effect-declaration-authority";
    displayName: "Core Effect Declaration Authority — Public Single-Card Effects";
    rulesVersion: "4.1";
    engineVersion: "4.2.1";
    playerCount: 2;
    enabledModules: readonly [];
    supportedEffects: readonly ["A-purge", "A-anchor", "3-bounce", "4-row-clear", "4-spade-total-clear", "J-attachment", "Q-anchor", "K-anchor", "RJ-four-modes", "BJ-board-lock"];
    excludedSystems: readonly ["private-choice-effects", "quick-timing", "instant-timing", "response-windows", "supers", "rank10", "voltage", "ultras", "royal-marriage", "optional-modules", "multiplayer"];
    rationale: "Engine-owned public single-card declaration slice. Every target and mode is enumerated and resolved by the engine; hidden-choice and response families fail closed.";
}>;
export interface CoreEffectCandidate {
    family: string;
    mode: string;
    sourceCardIds: CardId[];
    targetCardIds: CardId[];
    effect: CoreEffectAction;
    featureVector: Record<string, number | boolean | string | null>;
}
export type CoreEffectResolution = {
    ok: true;
    state: EngineState;
    events: {
        type: string;
        payload: Record<string, unknown>;
    }[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function enumerateCoreEffectCandidates(state: Readonly<EngineState>, actorId: PlayerId): CoreEffectCandidate[];
export declare function resolveCoreEffect(input: EngineState, actorId: PlayerId, effect: CoreEffectAction): CoreEffectResolution;
