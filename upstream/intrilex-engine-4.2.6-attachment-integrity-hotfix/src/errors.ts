import type { EngineErrorData } from "./types.js";

export class EngineError extends Error {
  readonly data: EngineErrorData;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "EngineError";
    this.data = details === undefined ? { code, message } : { code, message, details };
  }
}
