/**
 * HYBRIX AI — Central Configuration
 *
 * All tunable parameters live here. Designers can override any field
 * via a JSON file loaded with loadConfig(). Every value has a sensible
 * default so the system runs out-of-the-box.
 */

export const HYBRIX_CONFIG_VERSION = '1.0.0';

export const DEFAULT_CONFIG = Object.freeze({
  configVersion: HYBRIX_CONFIG_VERSION,

  // ── Perception ──────────────────────────────────────────────
  perception: {
    visionRange: 40,
    visionConeAngleDeg: 120,
    soundRange: 20,
    soundNoise: 0.3,          // positional error fraction for sound-based detection
    reactionDelayMs: 250,     // base reaction delay (difficulty-scaled)
    reactionDelayJitter: 0.3, // ±30% jitter on reaction delay
    missChance: 0.03,         // chance to not detect a visible entity
    falsePositiveChance: 0.01,// chance to hallucinate a non-existent threat
    baseUncertainty: 0.1,     // base uncertainty applied to all perceived data
    threatThreshold: 0.4,     // minimum score to tag as threat
    opportunityThreshold: 0.3,// minimum score to tag as opportunity
    fogOfWar: true,           // respect fog-of-war / hidden information
    maxPerceivedEntities: 30  // hard cap to prevent perception flooding
  },

  // ── Cognition ───────────────────────────────────────────────
  cognition: {
    btSpine: [
      { id: 'SURVIVAL',      priority: 100, condition: 'criticalThreat' },
      { id: 'COORDINATION',  priority: 80,  condition: 'activeDirective' },
      { id: 'MACRO_GOAL',    priority: 60,  condition: 'activeGoal' },
      { id: 'TACTICAL',      priority: 40,  condition: 'enemiesInEngagementRange' },
      { id: 'IDLE_ROAM',     priority: 20,  condition: 'always' }
    ],
    commitThreshold: 15,      // score margin above which we commit directly
    topK: 3,                  // number of top candidates for weighted random
    maxEvaluatedActions: 20,  // hard cap on evaluated actions per tick
    cooldownMs: 500,          // global cooldown between same-action repeats
    hesitationChance: 0.05,   // chance to hesitate (skip tick) at normal difficulty
    // Utility scoring component weights
    scoreWeights: {
      terminal: 1000,
      points: 30,
      resource: 50,
      tempo: 20,
      defense: 40,
      synergy: 100,
      risk: -200,
      threat: 25,
      opportunity: 35
    }
  },

  // ── Bounded GOAP ────────────────────────────────────────────
  goap: {
    maxActiveGoals: 3,
    maxPlanDepth: 2,
    maxPlanSteps: 4,
    budgetMs: 0.1             // GOAP planning budget per tick
  },

  // ── Memory & Adaptation ─────────────────────────────────────
  memory: {
    windowSeconds: 15,        // short-term memory window
    tickRate: 60,             // ticks per second (for buffer sizing)
    decayFactor: 0.95,        // per-tick weight decay
    patternRepeatThreshold: 3,// occurrences to flag a pattern
    patternConfidenceCap: 1.0,
    // Adaptive nudge clamps — prevent runaway adaptation
    nudgeClamps: {
      accuracy: [-0.3, 0.3],
      aggression: [-0.3, 0.3],
      spacing: [-0.2, 0.2]
    },
    maxPatterns: 10           // cap stored patterns
  },

  // ── Personality & Variance ──────────────────────────────────
  personality: {
    traitVariance: 0.1,       // ±0.1 per trait per instance
    humanErrorRate: 0.05,     // 5% score noise for "human error"
    moraleGainOnWin: 0.05,
    moraleLossOnLoss: 0.05,
    moraleDecayRate: 0.01,    // decays toward 0.5
    moraleMin: 0.0,
    moraleMax: 1.0,
    moraleBaseline: 0.5
  },

  // ── Difficulty Scaling ──────────────────────────────────────
  difficulty: {
    levels: {
      easy: {
        reactionTimeMultiplier: 1.6,   // 400ms base
        decisionDepth: 'top1',         // pick highest-scored only
        errorInjectionRate: 0.15,      // 15% chance to pick suboptimal
        coordinationEnabled: false,
        memoryAdaptationRate: 0.3,     // 30% of full adaptation
        tacticalCreativity: 0.2,       // low variety
        personalityIntensity: 1.0      // full personality expression
      },
      normal: {
        reactionTimeMultiplier: 1.0,   // 250ms base
        decisionDepth: 'top1',         // pick best action (personality adds variety)
        errorInjectionRate: 0.05,
        coordinationEnabled: true,
        memoryAdaptationRate: 0.6,
        tacticalCreativity: 0.5,
        personalityIntensity: 0.5      // moderate personality effect
      },
      hard: {
        reactionTimeMultiplier: 0.6,   // 150ms base
        decisionDepth: 'full',         // full utility evaluation
        errorInjectionRate: 0.01,
        coordinationEnabled: true,
        memoryAdaptationRate: 1.0,
        tacticalCreativity: 0.8,
        personalityIntensity: 0.3      // subtle personality nuances
      },
      nightmare: {
        reactionTimeMultiplier: 0.4,   // 100ms base
        decisionDepth: 'full',
        errorInjectionRate: 0.0,
        coordinationEnabled: true,
        memoryAdaptationRate: 1.0,
        tacticalCreativity: 1.0,
        personalityIntensity: 0.1      // near-optimal, minimal personality noise
      }
    },
    defaultLevel: 'normal'
  },

  // ── Coordination ────────────────────────────────────────────
  coordination: {
    blackboardTtlMs: 5000,    // intent entries expire after 5s
    maxAlliesTracked: 8,
    flankingEnabled: true,
    leaderFollowerEnabled: true,
    calloutCooldownMs: 2000   // min time between callouts from same bot
  },

  // ── Performance & Safety ────────────────────────────────────
  performance: {
    decisionBudgetMs: 0.5,    // per-bot per-tick budget
    lodTiers: {
      full:     { distance: 0,  actionComplexity: 'full'     },
      simplified: { distance: 30, actionComplexity: 'simplified' },
      distant:  { distance: 60, actionComplexity: 'minimal'  }
    },
    maxBotsFullAI: 12,        // bots beyond this use simplified AI
    budgetExceededFallback: 'IDLE'
  },

  failsafe: {
    maxRepeatThreshold: 3,    // same action N times → force variation
    ditheringWindow: 4,       // check last 4 actions for alternation
    suicideThreshold: -100,   // utility below this + attack = override
    stuckLoopAction: 'REPOSITION',
    fallbackAction: 'IDLE'
  },

  // ── Debug & Telemetry ───────────────────────────────────────
  debug: {
    whyTracesEnabled: true,
    maxTraceHistory: 100,     // per-bot trace ring buffer
    metricsEnabled: true,
    visualizationOverlays: [
      'vision_cone',
      'threat_rings',
      'intent_arrow',
      'bt_node_label',
      'memory_echo',
      'coordination_lines'
    ]
  }
});

/**
 * Deep-merge a partial config override onto the default config.
 * Only overrides specified fields; unspecified fields keep defaults.
 */
export function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key]) &&
      typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])
    ) {
      result[key] = mergeConfig(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Load config from a JSON-compatible object, merging onto defaults.
 */
export function loadConfig(override) {
  return mergeConfig(DEFAULT_CONFIG, override);
}

/**
 * Validate that a config object has required top-level sections.
 */
export function validateConfig(config) {
  const errors = [];
  const required = ['perception', 'cognition', 'memory', 'personality', 'difficulty', 'performance', 'failsafe', 'debug'];
  for (const section of required) {
    if (!config[section] || typeof config[section] !== 'object') {
      errors.push(`Missing required section: ${section}`);
    }
  }
  if (config.cognition?.scoreWeights) {
    const w = config.cognition.scoreWeights;
    if (w.risk > 0) errors.push('scoreWeights.risk should be negative (it is a penalty)');
  }
  return { valid: errors.length === 0, errors };
}
