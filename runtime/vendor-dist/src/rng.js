export function nextUint32(state) {
    let x = state.seed >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state.seed = x >>> 0;
    state.cursor += 1;
    return state.seed;
}
export function nextIndex(state, length) {
    if (!Number.isInteger(length) || length <= 0)
        throw new RangeError("length must be a positive integer");
    return nextUint32(state) % length;
}
//# sourceMappingURL=rng.js.map