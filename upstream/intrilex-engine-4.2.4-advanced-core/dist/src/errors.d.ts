import type { EngineErrorData } from "./types.js";
export declare class EngineError extends Error {
    readonly data: EngineErrorData;
    constructor(code: string, message: string, details?: unknown);
}
