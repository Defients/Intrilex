import { hashCanonical } from './browser-shared.js?v=3dca2dc8fde5';
export class DeterministicPolicyRng {
  constructor(seed) { const value = Number(seed) >>> 0; this.seed = value || 1; this.cursor = 0; }
  nextUint32() { let x = this.seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; this.cursor += 1; return this.seed; }
  nextIndex(length) { if (!Number.isInteger(length) || length <= 0) throw new RangeError('length'); return this.nextUint32() % length; }
}
export function createPolicyDefinition({ policyId, version, traits, choose }) {
  return { policyId, version: version ?? '1.0.0', traits: traits ?? {}, choose, policyHash: hashCanonical({ policyId, version: version ?? '1.0.0', traits: traits ?? {} }) };
}
