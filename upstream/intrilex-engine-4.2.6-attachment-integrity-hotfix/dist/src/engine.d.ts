import type { CommandResult, EngineCommand, EngineState } from "./types.js";
export declare class IntrilexEngine {
    execute(inputState: EngineState, command: EngineCommand): CommandResult;
}
