import type { RngState } from "./types.js";

export function nextUint32(state: RngState): number {
  let x = state.seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.seed = x >>> 0;
  state.cursor += 1;
  return state.seed;
}

export function nextIndex(state: RngState, length: number): number {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError("length must be a positive integer");
  return nextUint32(state) % length;
}
