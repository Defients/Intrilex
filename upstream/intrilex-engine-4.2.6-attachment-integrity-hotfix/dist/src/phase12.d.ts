import type { BattleRealmSpec, CardId, EngineState, Phase12Action, PlayerId } from "./types.js";
export interface BattleRealmSpecDefinition {
    id: BattleRealmSpec;
    signature: string;
    ultimate: string;
    signatureUses: number;
    absoluteCaps: readonly string[];
    modifierKeys: readonly string[];
}
export declare const BATTLE_REALM_REGISTRY: Readonly<Record<BattleRealmSpec, BattleRealmSpecDefinition>>;
export interface Phase12Runtime {
    enabled: boolean;
    specsRevealed: boolean;
    selectedSpecByPlayer: Record<PlayerId, BattleRealmSpec>;
    signatureUsesRemaining: Record<PlayerId, number>;
    ultimateUsedByPlayer: Record<PlayerId, boolean>;
    beautyExtraLuckyUsedOnFullTurn: Record<PlayerId, number | null>;
    brillianceCounterDistortionUsed: Record<PlayerId, boolean>;
    beautyFirstTwoDiscardUsedOnFullTurn: Record<PlayerId, number | null>;
    continuousBonusByPlayer: Record<PlayerId, number>;
    reservedCombinesDisabled: true;
    modifierOrder: readonly ["specific-effect", "module-interplay", "persistent-spec", "core"];
    lastResolution: Record<string, unknown> | null;
}
export interface Phase12EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase12Resolution = {
    ok: true;
    state: EngineState;
    events: Phase12EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function phase12Runtime(state: EngineState): Phase12Runtime;
export declare function selectedBattleRealmSpec(state: EngineState, playerId: PlayerId): BattleRealmSpec | null;
export declare function qualifyingQueenIds(state: EngineState, playerId: PlayerId): CardId[];
export declare function beautyMarriageBonus(state: EngineState, playerId: PlayerId): number;
export declare function battleRealmContinuousBonus(state: EngineState, playerId: PlayerId): number;
export declare function deriveBattleRealmSecuredPoints(state: EngineState, playerId: PlayerId): number;
export declare function resolvePhase12Action(input: EngineState, actorId: PlayerId, action: Phase12Action): Phase12Resolution;
