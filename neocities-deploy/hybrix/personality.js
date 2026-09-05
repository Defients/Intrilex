/**
 * HYBRIX AI — Personality & Variance System
 *
 * Defines 5-axis trait vectors, role archetypes, controlled randomness,
 * and morale/confidence shifts. Ensures no two bots feel identical.
 *
 * Trait axes (0–1):
 *   aggression — preference for attacking / closing distance
 *   patience   — willingness to wait, defend, hold position
 *   fear       — tendency to retreat / self-preserve under threat
 *   curiosity  — desire to explore / try non-obvious actions
 *   loyalty    — commitment to allies / team coordination
 */

import { DeterministicPolicyRng } from "./browser-policy-sdk.js?v=75c53031ef21";

export const ARCHETYPES = Object.freeze({
  rusher: {
    id: 'rusher',
    displayName: 'Rusher',
    traits: { aggression: 0.90, patience: 0.15, fear: 0.10, curiosity: 0.40, loyalty: 0.30 },
    description: 'Aggressive closer, high damage, low defense. Punishable.'
  },
  defender: {
    id: 'defender',
    displayName: 'Defender',
    traits: { aggression: 0.25, patience: 0.85, fear: 0.60, curiosity: 0.20, loyalty: 0.80 },
    description: 'Holds ground, punishes overextensions, covers allies.'
  },
  trickster: {
    id: 'trickster',
    displayName: 'Trickster',
    traits: { aggression: 0.55, patience: 0.65, fear: 0.40, curiosity: 0.85, loyalty: 0.45 },
    description: 'Feints, baits, unpredictable. High variance. Punishes predictability.'
  },
  sniper: {
    id: 'sniper',
    displayName: 'Sniper',
    traits: { aggression: 0.45, patience: 0.90, fear: 0.55, curiosity: 0.30, loyalty: 0.60 },
    description: 'Maintains distance, high-value targets, repositions when flanked.'
  },
  support: {
    id: 'support',
    displayName: 'Support',
    traits: { aggression: 0.20, patience: 0.70, fear: 0.50, curiosity: 0.50, loyalty: 0.95 },
    description: 'Heals, shields, buffs allies. Stays behind front line.'
  },
  tank: {
    id: 'tank',
    displayName: 'Tank',
    traits: { aggression: 0.35, patience: 0.75, fear: 0.15, curiosity: 0.25, loyalty: 0.70 },
    description: 'Soaks damage, holds choke points, protects allies.'
  },
  baseline: {
    id: 'baseline',
    displayName: 'Baseline',
    traits: { aggression: 0.50, patience: 0.50, fear: 0.50, curiosity: 0.50, loyalty: 0.50 },
    description: 'Style-less hybrid. Neutral traits impose no personality bias; play is driven purely by expected-value optimization.'
  }
});

export const TRAIT_KEYS = Object.freeze(['aggression', 'patience', 'fear', 'curiosity', 'loyalty']);

/**
 * Create a personality state for a bot.
 * @param {string} archetypeId - One of ARCHETYPES keys
 * @param {number} seed - Deterministic seed for per-instance variance
 * @param {object} config - Personality config section
 */
export function createPersonality(archetypeId, seed, config) {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) throw new Error(`Unknown archetype: ${archetypeId}`);

  const rng = new DeterministicPolicyRng(seed);
  const variance = config.traitVariance ?? 0.1;

  // Apply per-instance variance so no two bots are identical
  const traits = {};
  for (const key of TRAIT_KEYS) {
    const base = archetype.traits[key];
    const noise = (rng.nextUint32() / 0xFFFFFFFF - 0.5) * 2 * variance;
    traits[key] = Math.max(0, Math.min(1, base + noise));
  }

  return {
    archetypeId,
    archetype,
    traits: Object.freeze(traits),
    morale: config.moraleBaseline ?? 0.5,
    varianceSeed: seed,
    activeModifiers: {},
    history: []
  };
}

/**
 * Apply personality modifiers to a base utility score.
 * @param {number} baseScore - Raw utility score
 * @param {object} action - Action being scored { type, urgency, ... }
 * @param {object} personality - Personality state from createPersonality
 * @param {object} config - Personality config section
 * @param {object} rng - DeterministicPolicyRng instance
 * @returns {number} Modified score
 */
export function applyPersonalityToScore(baseScore, action, personality, config, rng) {
  const t = personality.traits;
  let score = baseScore;
  const modifiers = {};

  // Aggression: boost attack actions
  if (action.type === 'ATTACK' || action.family === 'score' || action.family === 'scuttle') {
    const mod = 0.7 + t.aggression * 0.6;
    score *= mod;
    modifiers.aggression = `${mod > 1 ? '+' : ''}${((mod - 1) * 100).toFixed(0)}% (trait=${t.aggression.toFixed(2)})`;
  }

  // Patience: boost wait/defend/anchor actions
  if (action.type === 'WAIT' || action.type === 'DEFEND' || action.family === 'anchor' || action.family === 'anchor-guard' || action.family === 'response-decline') {
    const mod = 0.7 + t.patience * 0.6;
    score *= mod;
    modifiers.patience = `${mod > 1 ? '+' : ''}${((mod - 1) * 100).toFixed(0)}% (trait=${t.patience.toFixed(2)})`;
  }

  // Fear: boost retreat / draw when urgency is high
  if (action.type === 'RETREAT' || (action.family === 'draw' && (action.urgency ?? 0) > 0.5)) {
    const mod = 0.6 + t.fear * 0.8;
    score *= mod;
    modifiers.fear = `${mod > 1 ? '+' : ''}${((mod - 1) * 100).toFixed(0)}% (trait=${t.fear.toFixed(2)})`;
  }

  // Curiosity: boost explore / non-obvious actions
  if (action.type === 'EXPLORE' || action.family === 'effect-three' || action.family === 'effect-four') {
    const mod = 0.5 + t.curiosity * 1.0;
    score *= mod;
    modifiers.curiosity = `${mod > 1 ? '+' : ''}${((mod - 1) * 100).toFixed(0)}% (trait=${t.curiosity.toFixed(2)})`;
  }

  // Loyalty: boost support / protect actions
  if (action.type === 'SUPPORT' || action.type === 'PROTECT' || action.family === 'effect-nine') {
    const mod = 0.5 + t.loyalty * 1.0;
    score *= mod;
    modifiers.loyalty = `${mod > 1 ? '+' : ''}${((mod - 1) * 100).toFixed(0)}% (trait=${t.loyalty.toFixed(2)})`;
  }

  // Controlled randomness — "human error"
  const errorRate = config.humanErrorRate ?? 0.05;
  const errorNoise = (rng.nextUint32() / 0xFFFFFFFF - 0.5) * 2 * errorRate;
  score *= (1 + errorNoise);
  if (Math.abs(errorNoise) > 0.01) {
    modifiers.humanError = `${(errorNoise * 100).toFixed(1)}% noise`;
  }

  // Morale shift — recent outcomes affect confidence
  const moraleMod = 0.8 + personality.morale * 0.4;
  score *= moraleMod;
  modifiers.morale = `${((moraleMod - 1) * 100).toFixed(0)}% (morale=${personality.morale.toFixed(2)})`;

  personality.activeModifiers = modifiers;
  return score;
}

/**
 * Update morale based on recent outcome.
 * @param {object} personality - Personality state (mutated)
 * @param {string} outcome - 'win' | 'loss' | 'neutral'
 * @param {object} config - Personality config section
 */
export function updateMorale(personality, outcome, config) {
  if (outcome === 'win') {
    personality.morale = Math.min(
      config.moraleMax ?? 1.0,
      personality.morale + (config.moraleGainOnWin ?? 0.05)
    );
  } else if (outcome === 'loss') {
    personality.morale = Math.max(
      config.moraleMin ?? 0.0,
      personality.morale - (config.moraleLossOnLoss ?? 0.05)
    );
  }
  personality.history.push({ outcome, morale: personality.morale, timestamp: Date.now() });
  if (personality.history.length > 20) personality.history.shift();
}

/**
 * Apply morale decay toward baseline (call once per tick or turn).
 */
export function decayMorale(personality, config) {
  const baseline = config.moraleBaseline ?? 0.5;
  const rate = config.moraleDecayRate ?? 0.01;
  personality.morale += (baseline - personality.morale) * rate;
}

/**
 * Get a human-readable personality summary for debugging.
 */
export function describePersonality(personality) {
  const t = personality.traits;
  return `${personality.archetype.displayName} [A:${t.aggression.toFixed(2)} P:${t.patience.toFixed(2)} F:${t.fear.toFixed(2)} C:${t.curiosity.toFixed(2)} L:${t.loyalty.toFixed(2)} M:${personality.morale.toFixed(2)}]`;
}
