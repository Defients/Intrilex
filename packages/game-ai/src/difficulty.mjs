/**
 * HYBRIX AI — Difficulty Scaling (Without Cheating)
 *
 * Difficulty is tuned through legitimate levers only:
 * - Reaction time
 * - Decision depth
 * - Tactical creativity
 * - Coordination quality
 * - Error frequency
 *
 * NO input reading, NO omniscience, NO raw stat inflation.
 */

export const DIFFICULTY_LEVELS = Object.freeze(['easy', 'normal', 'hard', 'nightmare']);

export function getDifficultyConfig(config, level) {
  const levels = config?.levels ?? {};
  const resolved = levels[level] ?? levels[config?.defaultLevel ?? 'normal'] ?? levels.normal;
  if (!resolved) throw new Error(`No difficulty config for level: ${level}`);
  return resolved;
}

/**
 * Apply difficulty-scaled error injection to scored actions.
 * At easy: 15% chance to pick a suboptimal action.
 * At nightmare: 0% error injection.
 *
 * @param {Array} scored - [{ action, score, ... }] sorted descending
 * @param {object} diffConfig - Difficulty level config
 * @param {object} rng - DeterministicPolicyRng
 * @returns {object} selected action entry
 */
export function applyDifficultySelection(scored, diffConfig, rng) {
  if (!scored.length) return null;

  const errorRate = diffConfig.errorInjectionRate ?? 0.05;
  const roll = rng.nextUint32() / 0xFFFFFFFF;

  if (roll < errorRate && scored.length > 1) {
    // Pick a suboptimal action (not the best)
    const suboptimalIndex = 1 + Math.floor(rng.nextUint32() / 0xFFFFFFFF * (scored.length - 1));
    return { ...scored[suboptimalIndex], difficultyError: true };
  }

  // Decision depth controls how we pick the best
  const depth = diffConfig.decisionDepth ?? 'topK';

  if (depth === 'top1') {
    return scored[0];
  }

  if (depth === 'topK') {
    const k = Math.min(3, scored.length);
    const topK = scored.slice(0, k);
    return weightedRandomSelect(topK, rng);
  }

  // 'full' — full utility evaluation, pick best
  return scored[0];
}

/**
 * Get difficulty-scaled reaction time multiplier.
 * Easy: 1.6x slower, Nightmare: 0.4x faster.
 */
export function getReactionMultiplier(diffConfig) {
  return diffConfig.reactionTimeMultiplier ?? 1.0;
}

/**
 * Get difficulty-scaled memory adaptation rate.
 * Easy: 30% of full, Nightmare: 100%.
 */
export function getAdaptationRate(diffConfig) {
  return diffConfig.memoryAdaptationRate ?? 0.6;
}

/**
 * Get difficulty-scaled coordination flag.
 */
export function isCoordinationEnabled(diffConfig) {
  return diffConfig.coordinationEnabled ?? true;
}

/**
 * Get difficulty-scaled tactical creativity (affects action variety).
 */
export function getTacticalCreativity(diffConfig) {
  return diffConfig.tacticalCreativity ?? 0.5;
}

/**
 * Validate that a difficulty config does not use cheating levers.
 * Returns warnings for any suspicious settings.
 */
export function auditDifficultyConfig(diffConfig) {
  const warnings = [];

  if (diffConfig.reactionTimeMultiplier < 0.3) {
    warnings.push('Reaction time multiplier < 0.3 may feel like input reading to players.');
  }
  if (diffConfig.errorInjectionRate < 0 && diffConfig.errorInjectionRate !== 0) {
    warnings.push('Negative error injection rate is invalid.');
  }
  if (diffConfig._statMultiplier && diffConfig._statMultiplier !== 1.0) {
    warnings.push('Stat multiplier detected — this is stat inflation, not skill-based difficulty.');
  }
  if (diffConfig._omniscience === true) {
    warnings.push('Omniscience flag detected — bots should not have full world knowledge.');
  }
  if (diffConfig._inputReading === true) {
    warnings.push('Input reading flag detected — this is unfair difficulty.');
  }

  return { valid: warnings.length === 0, warnings };
}

function weightedRandomSelect(items, rng) {
  if (items.length === 1) return items[0];
  const total = items.reduce((sum, item) => sum + Math.max(item.score, 0), 0);
  if (total <= 0) return items[rng.nextIndex(items.length)];
  let r = rng.nextUint32() / 0xFFFFFFFF * total;
  for (const item of items) {
    r -= Math.max(item.score, 0);
    if (r <= 0) return item;
  }
  return items[0];
}
