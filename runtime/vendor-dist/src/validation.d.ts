import type { ConformanceFixture, EngineState } from "./types.js";
export interface ValidationIssue {
    path: string;
    code: string;
    message: string;
}
export declare function validateState(state: EngineState): ValidationIssue[];
export declare function assertValidState(state: EngineState): void;
export declare function parseState(value: unknown): EngineState;
export declare function roundTripState(state: EngineState): EngineState;
export declare function parseFixtures(value: unknown): ConformanceFixture[];
