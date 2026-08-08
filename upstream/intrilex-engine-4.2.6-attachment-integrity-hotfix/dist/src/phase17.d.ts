import type { CommandResult, EngineCommand, EngineEvent, EngineState, JudgeMarkerEntry, JudgeOutcomeClass, JudgePacket, PlayerId } from "./types.js";
export declare function deriveJudgeMarkerChecklist(state: EngineState): JudgeMarkerEntry[];
export declare function buildJudgePacket(state: EngineState, includePrivateFor?: PlayerId[]): JudgePacket;
export declare function classifyJudgeOutcome(command: EngineCommand, result: CommandResult): JudgeOutcomeClass;
export declare function explainIllegalVsFizzle(command: EngineCommand, result: CommandResult): {
    classification: JudgeOutcomeClass;
    explanation: string;
    rollbackRequired: boolean;
    sourceDisposition: string;
};
export declare function renderPrintableStateAid(state: EngineState): string;
export declare function judgeEventDigest(events: EngineEvent[]): string;
