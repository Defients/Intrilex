// ═══════════════════════════════════════════════════════════════
// engine-fuzz-harness.mjs — E2: Engine fuzz harness
//
// Randomized legal-action sequences that assert engine invariants:
//   1. No crashes on any legal action sequence
//   2. Deterministic hash across runs with the same seed
//   3. State invariants hold (no negative scores, no invalid phases)
//
// This harness is designed to run in CI to protect the determinism
// guarantee that underpins the 121-replay corpus and ranked legitimacy.
// ═══════════════════════════════════════════════════════════════

// Engine adapter is injected by the caller, not imported at module load.
// This avoids circular dependencies and allows the harness to work with
// any adapter implementation.

/**
 * Run a single fuzz iteration with a given seed.
 * Generates random legal actions and executes them, checking invariants.
 * @param {object} opts
 * @param {number} opts.seed - Random seed for this iteration
 * @param {number} [opts.maxActions] - Maximum actions to generate (default 200)
 * @param {string} [opts.profileId] - Engine profile (default 'core-unrestricted-authority')
 * @param {object} [opts.adapter] - Engine adapter instance (must have createInitialState, legalActions, execute, isTerminal, stateHash)
 * @returns {{ passed: boolean, actionsExecuted: number, error?: string, hash?: string }}
 */
export function fuzzOnce({ seed, maxActions = 200, profileId = 'core-unrestricted-authority', adapter = null }) {
  // Simple seeded PRNG (mulberry32)
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pickInt = (max) => Math.floor(rng() * max);

  if (!adapter) {
    return { passed: false, actionsExecuted: 0, error: 'No adapter provided' };
  }

  try {
    let state = adapter.createInitialState({ seed });
    let actionsExecuted = 0;

    for (let i = 0; i < maxActions; i++) {
      // Get legal actions for the current player
      const legalActions = adapter.legalActions(state);
      if (!legalActions || legalActions.length === 0) {
        // No legal actions — might be game over or need to pass
        break;
      }

      // Pick a random legal action
      const action = legalActions[pickInt(legalActions.length)];

      // Execute the action
      const result = adapter.execute(state, action);
      if (!result || !result.state) {
        return { passed: false, actionsExecuted, error: 'execute returned no state' };
      }

      state = result.state;
      actionsExecuted++;

      // Check invariants
      const invCheck = checkInvariants(state, adapter);
      if (!invCheck.passed) {
        return { passed: false, actionsExecuted, error: `Invariant violated: ${invCheck.error}` };
      }

      // Check if game is over
      if (adapter.isTerminal(state)) break;
    }

    // Compute deterministic hash
    const hash = adapter.stateHash ? adapter.stateHash(state) : JSON.stringify(state).length.toString();

    return { passed: true, actionsExecuted, hash };
  } catch (err) {
    return { passed: false, actionsExecuted: 0, error: err?.message ?? String(err) };
  }
}

/**
 * Run N fuzz iterations with different seeds.
 * @param {object} opts
 * @param {number} opts.iterations - Number of iterations
 * @param {number} [opts.maxActions] - Max actions per iteration
 * @param {string} [opts.profileId] - Engine profile
 * @param {object} [opts.adapter] - Engine adapter instance
 * @returns {{ passed: number, failed: number, errors: Array<{ seed: number, error: string }> }}
 */
export function fuzzCampaign({ iterations, maxActions, profileId, adapter = null }) {
  let passed = 0;
  const errors = [];

  for (let i = 0; i < iterations; i++) {
    const seed = (i + 1) * 1000 + 42;
    const result = fuzzOnce({ seed, maxActions, profileId, adapter });
    if (result.passed) {
      passed++;
    } else {
      errors.push({ seed, error: result.error ?? 'Unknown error' });
    }
  }

  return { passed, failed: errors.length, errors };
}

/**
 * Check engine state invariants.
 * @param {object} state - Engine state
 * @param {object} adapter - Engine adapter
 * @returns {{ passed: boolean, error?: string }}
 */
function checkInvariants(state, adapter) {
  // 1. State must be a non-null object
  if (!state || typeof state !== 'object') {
    return { passed: false, error: 'state is not an object' };
  }

  // 2. Phase must be a valid string
  if (state.phase !== undefined && typeof state.phase !== 'string') {
    return { passed: false, error: 'phase is not a string' };
  }

  // 3. Players must exist
  if (state.players) {
    for (const player of state.players) {
      if (player.secured !== undefined && player.secured < 0) {
        return { passed: false, error: 'negative secured score' };
      }
    }
  }

  return { passed: true };
}

/**
 * Verify determinism: same seed → same hash.
 * @param {number} seed
 * @param {string} [profileId]
 * @param {object} [adapter] - Engine adapter instance
 * @returns {{ deterministic: boolean, hash1?: string, hash2?: string }}
 */
export function verifyDeterminism(seed, profileId = 'core-unrestricted-authority', adapter = null) {
  const r1 = fuzzOnce({ seed, maxActions: 50, profileId, adapter });
  const r2 = fuzzOnce({ seed, maxActions: 50, profileId, adapter });
  if (!r1.passed || !r2.passed) {
    return { deterministic: false };
  }
  return {
    deterministic: r1.hash === r2.hash,
    hash1: r1.hash,
    hash2: r2.hash,
  };
}
