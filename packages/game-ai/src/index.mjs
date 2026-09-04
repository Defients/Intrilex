/**
 * HYBRIX AI — Public API
 *
 * Shippable game AI architecture: perception, cognition, personality,
 * memory, coordination, difficulty scaling, failsafes, and debug.
 */

export { DEFAULT_CONFIG, HYBRIX_CONFIG_VERSION, loadConfig, mergeConfig, validateConfig } from './config.mjs';
export { createPerception } from './perception.mjs';
export { ARCHETYPES, TRAIT_KEYS, createPersonality, applyPersonalityToScore, updateMorale, decayMorale, describePersonality } from './personality.mjs';
export { createMemory } from './memory.mjs';
export { createCognition } from './cognition.mjs';
export { createSharedBlackboard, evaluateCoordination } from './coordination.mjs';
export { createFailsafe, determineLodTier, shouldUseFullAI } from './failsafe.mjs';
export { createDebugSystem, aggregateTelemetry } from './debug.mjs';
export { DIFFICULTY_LEVELS, getDifficultyConfig, applyDifficultySelection, getReactionMultiplier, getAdaptationRate, isCoordinationEnabled, getTacticalCreativity, auditDifficultyConfig } from './difficulty.mjs';
export { createHybrixAgent, ARCHETYPE_TO_SCORING_POLICY } from './agent.mjs';
export { evaluateRankStrategy } from './rank-strategy.mjs';
export { createHybrixPolicy, HYBRIX_POLICIES, HYBRIX_RUSHER_NORMAL, HYBRIX_DEFENDER_NORMAL, HYBRIX_TRICKSTER_NORMAL, HYBRIX_SNIPER_NORMAL, HYBRIX_RUSHER_HARD, HYBRIX_DEFENDER_HARD, HYBRIX_TRICKSTER_HARD, HYBRIX_SNIPER_HARD, HYBRIX_RUSHER_EASY, HYBRIX_DEFENDER_EASY, HYBRIX_RUSHER_NIGHTMARE, HYBRIX_DEFENDER_NIGHTMARE, HYBRIX_SUPPORT_NORMAL, HYBRIX_TANK_NORMAL } from './policy-adapter.mjs';
export { extractHybrixTraces, explainHybrixTrace, summarizeHybrixDecisions, mapHybrixReasonCodes } from './trace-adapter.mjs';
export {
  LOOKAHEAD_STRENGTH_TIER, DEFAULT_LOOKAHEAD_CONFIG, defaultEvaluation,
  createBoundedLookahead, runLookaheadBenchmark, createLookaheadPolicy,
  LOOKAHEAD_STANDARD, LOOKAHEAD_DEEP, LOOKAHEAD_SHALLOW,
  LOOKAHEAD_POLICIES, LOOKAHEAD_POLICY_IDS
} from './bounded-lookahead.mjs';
