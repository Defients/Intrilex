function normalize(value) {
    if (value === null || typeof value !== "object") {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new TypeError("Canonical JSON cannot encode non-finite numbers");
        }
        return value;
    }
    if (Array.isArray(value))
        return value.map(normalize);
    const input = value;
    const output = {};
    for (const key of Object.keys(input).sort()) {
        const current = input[key];
        if (current !== undefined)
            output[key] = normalize(current);
    }
    return output;
}
export function canonicalize(value) {
    return JSON.stringify(normalize(value));
}
export function canonicalClone(value) {
    return JSON.parse(canonicalize(value));
}
//# sourceMappingURL=canonical-json.js.map