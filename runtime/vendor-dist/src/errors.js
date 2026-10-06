export class EngineError extends Error {
    data;
    constructor(code, message, details) {
        super(message);
        this.name = "EngineError";
        this.data = details === undefined ? { code, message } : { code, message, details };
    }
}
//# sourceMappingURL=errors.js.map