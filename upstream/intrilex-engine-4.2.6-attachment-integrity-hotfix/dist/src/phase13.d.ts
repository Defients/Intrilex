import type { CardId, CardInstance, EngineState, Phase13Action, PlayerId } from "./types.js";
export type TimeBombSuit = "♣" | "♦" | "♥" | "♠";
export interface TimeBombMarker {
    suit: TimeBombSuit;
    stage: number;
    peak: number;
}
export interface ForcedDrawState {
    sourceBombId: CardId;
    createdOnFullTurnSequence: number;
}
export interface Phase13Runtime {
    enabled: boolean;
    forcedDrawByPlayer: Record<PlayerId, ForcedDrawState>;
    queuedFuseCardIds: CardId[];
    lastResolution: Record<string, unknown> | null;
}
export interface Phase13EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase13Resolution = {
    ok: true;
    state: EngineState;
    events: Phase13EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function phase13Runtime(state: EngineState): Phase13Runtime;
export declare function bombMarker(card: CardInstance): TimeBombMarker | null;
export declare function isTimeBomb(card: CardInstance): boolean;
export declare function stageValue(suit: TimeBombSuit, stage: number): number;
export declare function createTimeBomb(card: CardInstance): TimeBombMarker;
export declare function clearTimeBomb(card: CardInstance): void;
export declare function resolvePhase13Action(input: EngineState, actorId: PlayerId, action: Phase13Action): Phase13Resolution;
