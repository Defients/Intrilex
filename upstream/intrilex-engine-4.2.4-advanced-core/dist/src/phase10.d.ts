import type { CardId, EngineState, Phase10Action, PlayerId } from "./types.js";
export interface DisabledTrapState {
    counteringPlayerId: PlayerId;
    expiresAfterCompletedFullTurnSequence: number;
}
export interface TrapRuntime {
    enabled: true;
    triggerUsedThisActiveFT: Record<PlayerId, boolean>;
    module3CounterUsedFullTurnSequence: number | null;
    module3CounterPending: boolean;
    completedFullTurnsByPlayer: Record<PlayerId, number>;
}
export interface Phase10EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase10Resolution = {
    ok: true;
    state: EngineState;
    events: Phase10EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function trapRuntime(state: EngineState): TrapRuntime;
export declare function validateTrapPlacement(state: EngineState, actorId: PlayerId, cardId: CardId, row: "pr" | "er"): string | null;
export declare function resolvePhase10Action(input: EngineState, actorId: PlayerId, action: Phase10Action): Phase10Resolution;
