import { hashCanonical } from '@intrilex/shared';

/**
 * Deterministic xorshift32 PRNG for policy decisions.
 * Guarantees reproducible random-number sequences given the same seed.
 * Used by all policies that need randomness to ensure match determinism.
 */
export class DeterministicPolicyRng {
  /**
   * @param {number | string} seed - Seed value (coerced to uint32)
   */
  constructor(seed) {
    const value = Number(seed) >>> 0;
    this.seed = value || 1;
    this.cursor = 0;
  }
  /**
   * Advance the PRNG and return the next uint32.
   * @returns {number} Pseudo-random uint32
   */
  nextUint32() {
    let x = this.seed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    this.cursor += 1;
    return this.seed;
  }
  /**
   * Return a pseudo-random index in [0, length).
   * @param {number} length - Array length (must be positive)
   * @returns {number} Index in [0, length)
   * @throws {RangeError} If length is not a positive integer
   */
  nextIndex(length) {
    if (!Number.isInteger(length) || length <= 0) throw new RangeError('length must be positive');
    return this.nextUint32() % length;
  }
}

/**
 * Assert that at least one profile in the capability manifest is autonomously supported.
 * @param {{ profiles: Array<{ autonomy: string }> }} capabilityManifest
 * @returns {{ autonomy: string }} The first supported profile
 * @throws {{ code: 'COMPLETE_LEGAL_ACTION_SURFACE_UNAVAILABLE' }} If no supported profile exists
 */
export function assertPolicySurfaceAvailable(capabilityManifest) {
  const profile = capabilityManifest.profiles.find((item) => item.autonomy === 'SUPPORTED');
  if (!profile) {
    const error = new Error('No autonomously supported Intrilex profile is available.');
    error.code = 'COMPLETE_LEGAL_ACTION_SURFACE_UNAVAILABLE';
    throw error;
  }
  return profile;
}

/**
 * Create an immutable policy definition with a content-hash fingerprint.
 * @param {{ policyId: string, version: string, traits: Record<string, unknown>, choose: Function, strengthTier?: string }} def
 * @returns {{ policyId: string, version: string, traits: Record<string, unknown>, policyHash: string, choose: Function, strengthTier: string }}
 */
export function createPolicyDefinition({ policyId, version, traits, choose, strengthTier = 'heuristic' }) {
  const policyHash = hashCanonical({ policyId, version, traits, implementation: choose.toString() });
  return Object.freeze({ policyId, version, traits: Object.freeze({ ...traits }), policyHash, choose, strengthTier });
}

/**
 * Valid policy-strength tiers for evidence admissibility classification.
 * - fixture: tests legality, not strategy
 * - baseline: creates reproducible behavior
 * - heuristic: makes locally informed choices
 * - lookahead: evaluates limited continuations
 * - tournament: passes defined competitive benchmarks
 * - human-meta-proxy: approximates human play patterns
 */
export const POLICY_STRENGTH_TIERS = Object.freeze(['fixture', 'baseline', 'heuristic', 'lookahead', 'tournament', 'human-meta-proxy']);

/**
 * Validate that a policy decision selects a legal action.
 * @param {{ actionId: string } | null | undefined} decision - Policy decision
 * @param {Array<{ actionId: string }>} legalActions - Available legal actions
 * @returns {{ actionId: string }} The validated decision
 * @throws {{ code: 'POLICY_DECISION_INVALID' }} If decision has no actionId
 * @throws {{ code: 'POLICY_ACTION_UNAVAILABLE' }} If actionId is not in legalActions
 */
export function validateDecision(decision, legalActions) {
  if (!decision || typeof decision.actionId !== 'string') throw Object.assign(new Error('Policy returned no actionId'), { code: 'POLICY_DECISION_INVALID' });
  if (!legalActions.some((action) => action.actionId === decision.actionId)) throw Object.assign(new Error(`Policy selected unavailable action: ${decision.actionId}`), { code: 'POLICY_ACTION_UNAVAILABLE' });
  return decision;
}
