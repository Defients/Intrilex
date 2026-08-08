import type { EngineState, Phase8Action, PlayerId } from "./types.js";
export interface TimerState {
    remaining: number;
    activationFullTurnSequence: number;
}
export interface SuddenDeathState extends TimerState {
    activatorId: PlayerId;
}
export interface ExhaustedState {
    remaining: number;
    startedFullTurnSequence: number;
}
export interface VoltageSnapshot {
    rank3: number;
    rank4: number;
    rank5: number;
    capturedFullTurnSequence: number;
}
export interface Phase8Runtime {
    boardLock: TimerState | null;
    suddenDeath: SuddenDeathState | null;
    exhausted: ExhaustedState | null;
    voltageSnapshots: Record<PlayerId, VoltageSnapshot>;
    voltageUsedThisFT: Record<PlayerId, Record<"3" | "4" | "5", boolean>>;
}
export interface Phase8EventSpec {
    type: string;
    payload: Record<string, unknown>;
}
export type Phase8Resolution = {
    ok: true;
    state: EngineState;
    events: Phase8EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function phase8Runtime(state: EngineState): Phase8Runtime;
export declare function exhaustedWinner(state: EngineState): PlayerId | null;
export declare function resolvePhase8Action(input: EngineState, actorId: PlayerId, action: Phase8Action): Phase8Resolution;
