/**
 * HYBRIX AI — Policy Adapter
 *
 * Wraps HYBRIX agents as policy-sdk compatible definitions so they
 * can be used as drop-in replacements in the simulation runtime.
 *
 * Agents are cached per (runInstanceId, matchId, actorId) so that memory,
 * personality morale, and adaptive nudges persist across decisions within
 * a match, but do NOT leak across different campaign runs. The runInstanceId
 * isolates separate campaign executions even when they share matchIds.
 */

import { createPolicyDefinition } from '@intrilex/policy-sdk';
import { createHybrixAgent} from './agent.mjs';
import { DEFAULT_CONFIG } from './config.mjs';

/**
 * Create a HYBRIX-backed policy definition.
 *
 * @param {string} policyId - Unique policy ID for this HYBRIX variant
 * @param {string} archetype - Bot archetype (rusher, defender, trickster, sniper, support, tank)
 * @param {string} difficulty - Difficulty level (easy, normal, hard, nightmare)
 * @param {object} configOverride - Optional config overrides
 * @returns {object} Policy definition compatible with POLICY_BY_ID
 */
export function createHybrixPolicy({ policyId, archetype, difficulty = 'normal', configOverride, strengthTier }) {
  const config = configOverride
    ? { ...DEFAULT_CONFIG, ...configOverride }
    : DEFAULT_CONFIG;

  // Determine strength tier from difficulty if not explicitly provided.
  // easy → baseline (reproducible but shallow)
  // normal → heuristic (locally informed choices)
  // hard → heuristic (stronger heuristic)
  // nightmare → heuristic (strongest heuristic, not yet lookahead)
  const resolvedTier = strengthTier ?? (difficulty === 'easy' ? 'baseline' : 'heuristic');

  // Agent cache: key = `${runInstanceId}:${matchId}:${actorId}` → agent instance
  // Persists memory, personality morale, and adaptive nudges across
  // all decisions within a single match. Cleared when a new match or new
  // run instance starts. runInstanceId isolates separate campaign runs.
  const agentCache = new Map();
  let lastCacheKey = null;

  return createPolicyDefinition({
    policyId,
    version: '1.0.0',
    strengthTier: resolvedTier,
    traits: {
      archetype,
      difficulty,
      hybrix: true,
      ...config.personality
    },
    choose(context) {
      const matchId = context.matchId ?? 'default';
      const actorId = context.actorId ?? `hybrix-${archetype}`;
      // runInstanceId isolates campaign runs. Falls back to matchId for
      // backward compatibility (single-match contexts).
      const runInstanceId = context.runInstanceId ?? context.campaignRunId ?? matchId;
      const cacheKey = `${runInstanceId}:${matchId}:${actorId}`;

      // New match or new run instance → clear cache to reset all agent state
      if (cacheKey.split(':').slice(0, 2).join(':') !== lastCacheKey?.split(':').slice(0, 2).join(':')) {
        agentCache.clear();
        lastCacheKey = cacheKey;
      }

      // Get or create cached agent for this run+match+actor
      let agent = agentCache.get(cacheKey);
      if (!agent) {
        const seed = context.matchId
          ? hashStringToInt(context.matchId + context.actorId)
          : 42;

        agent = createHybrixAgent({
          botId: actorId,
          archetype,
          difficulty,
          seed,
          config
        });
        agentCache.set(cacheKey, agent);
      }

      // Reset agent state at the start of each match so that repeated
      // identical runs produce identical results (memory/personality do
      // not leak across separate runPolicyMatch calls with the same key).
      if ((context.decisionIndex ?? 0) === 0) {
        agent.reset();
      }

      return agent.choose(context);
    }
  });
}

/**
 * Pre-built HYBRIX policy variants for the catalog.
 */
export const HYBRIX_RUSHER_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-rusher',
  archetype: 'rusher',
  difficulty: 'normal'
});

export const HYBRIX_DEFENDER_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-defender',
  archetype: 'defender',
  difficulty: 'normal'
});

export const HYBRIX_TRICKSTER_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-trickster',
  archetype: 'trickster',
  difficulty: 'normal'
});

export const HYBRIX_SNIPER_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-sniper',
  archetype: 'sniper',
  difficulty: 'normal'
});

export const HYBRIX_RUSHER_HARD = createHybrixPolicy({
  policyId: 'hybrix-rusher-hard',
  archetype: 'rusher',
  difficulty: 'hard'
});

export const HYBRIX_DEFENDER_HARD = createHybrixPolicy({
  policyId: 'hybrix-defender-hard',
  archetype: 'defender',
  difficulty: 'hard'
});

export const HYBRIX_TRICKSTER_HARD = createHybrixPolicy({
  policyId: 'hybrix-trickster-hard',
  archetype: 'trickster',
  difficulty: 'hard'
});

export const HYBRIX_SNIPER_HARD = createHybrixPolicy({
  policyId: 'hybrix-sniper-hard',
  archetype: 'sniper',
  difficulty: 'hard'
});

export const HYBRIX_RUSHER_EASY = createHybrixPolicy({
  policyId: 'hybrix-rusher-easy',
  archetype: 'rusher',
  difficulty: 'easy'
});

export const HYBRIX_DEFENDER_EASY = createHybrixPolicy({
  policyId: 'hybrix-defender-easy',
  archetype: 'defender',
  difficulty: 'easy'
});

export const HYBRIX_RUSHER_NIGHTMARE = createHybrixPolicy({
  policyId: 'hybrix-rusher-nightmare',
  archetype: 'rusher',
  difficulty: 'nightmare'
});

export const HYBRIX_DEFENDER_NIGHTMARE = createHybrixPolicy({
  policyId: 'hybrix-defender-nightmare',
  archetype: 'defender',
  difficulty: 'nightmare'
});

export const HYBRIX_SUPPORT_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-support',
  archetype: 'support',
  difficulty: 'normal'
});

export const HYBRIX_TANK_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-tank',
  archetype: 'tank',
  difficulty: 'normal'
});

export const HYBRIX_BASELINE_NORMAL = createHybrixPolicy({
  policyId: 'hybrix-baseline',
  archetype: 'baseline',
  difficulty: 'normal',
  strengthTier: 'baseline'
});

export const HYBRIX_POLICIES = Object.freeze([
  HYBRIX_RUSHER_NORMAL,
  HYBRIX_DEFENDER_NORMAL,
  HYBRIX_TRICKSTER_NORMAL,
  HYBRIX_SNIPER_NORMAL,
  HYBRIX_RUSHER_HARD,
  HYBRIX_DEFENDER_HARD,
  HYBRIX_TRICKSTER_HARD,
  HYBRIX_SNIPER_HARD,
  HYBRIX_RUSHER_EASY,
  HYBRIX_DEFENDER_EASY,
  HYBRIX_RUSHER_NIGHTMARE,
  HYBRIX_DEFENDER_NIGHTMARE,
  HYBRIX_SUPPORT_NORMAL,
  HYBRIX_TANK_NORMAL,
  HYBRIX_BASELINE_NORMAL
]);

export const HYBRIX_POLICY_IDS = Object.freeze(HYBRIX_POLICIES.map(p => p.policyId));

const HYBRIX_POLICY_BY_ID = Object.freeze(Object.fromEntries(HYBRIX_POLICIES.map(p => [p.policyId, p])));

export function chooseHybrixPolicy(policyId, context) {
  const policy = HYBRIX_POLICY_BY_ID[policyId];
  if (!policy) throw new Error(`UNKNOWN_HYBRIX_POLICY:${policyId}`);
  return policy.choose(context);
}

function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
