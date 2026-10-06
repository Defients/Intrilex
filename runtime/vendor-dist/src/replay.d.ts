import type { EngineCommand, EngineEvent, EngineState, ReplayEnvelope } from "./types.js";
export interface RunResult {
    state: EngineState;
    events: EngineEvent[];
    accepted: boolean[];
}
export declare function runCommands(initialState: EngineState, commands: EngineCommand[]): RunResult;
export declare function createReplay(fixtureId: string, initialState: EngineState, commands: EngineCommand[], result: RunResult): ReplayEnvelope;
export declare function replayAndVerify(replay: ReplayEnvelope): RunResult;
