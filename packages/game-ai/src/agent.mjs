/**
 * HYBRIX AI — Main Agent
 *
 * Ties all layers together: perception → memory → personality →
 * coordination → cognition → failsafe → debug.
 *
 * Implements the `choose(context)` contract from policy-sdk/contracts.mjs
 * making HYBRIX agents drop-in compatible with the existing simulation
 * runtime. Also works standalone for real-time games.
 */

import { createPerception } from './perception.mjs';
import { createPersonality, updateMorale, decayMorale, describePersonality } from './personality.mjs';
import { createMemory } from './memory.mjs';
import { createCognition } from './cognition.mjs';
import { createSharedBlackboard, evaluateCoordination } from './coordination.mjs';
import { createFailsafe, determineLodTier } from './failsafe.mjs';
import { createDebugSystem } from './debug.mjs';
import { getDifficultyConfig, getReactionMultiplier, getAdaptationRate, isCoordinationEnabled, auditDifficultyConfig } from './difficulty.mjs';
import { evaluateRankStrategy } from './rank-strategy.mjs';
import { DeterministicPolicyRng } from '@intrilex/policy-sdk';
import { scorePolicyAction } from '@intrilex/policies/scoring';

export const ARCHETYPE_TO_SCORING_POLICY = Object.freeze({
  rusher: 'score-rush',
  defender: 'control',
  trickster: 'tempo',
  sniper: 'value',
  support: 'value',
  tank: 'control',
  baseline: 'value'
});

/**
 * Create a HYBRIX AI agent.
 *
 * @param {object} options
 * @param {string} options.botId - Unique bot identifier
 * @param {string} options.archetype - Archetype ID (rusher, defender, trickster, sniper, support, tank)
 * @param {string} options.difficulty - Difficulty level (easy, normal, hard, nightmare)
 * @param {number} options.seed - Deterministic seed
 * @param {object} options.config - Full HYBRIX config (from config.mjs)
 * @param {object} options.blackboard - Shared blackboard instance (optional, created if not provided)
 * @returns {object} HYBRIX agent with perceive(), decide(), tick(), reset(), getDebug()
 */
export function createHybrixAgent({ botId, archetype, difficulty = 'normal', seed, config, blackboard }) {
  if (!botId) throw new Error('botId is required');
  if (!archetype) throw new Error('archetype is required');
  if (!config) throw new Error('config is required');

  const fullConfig = config;
  const diffConfig = getDifficultyConfig(fullConfig.difficulty, difficulty);
  const diffAudit = auditDifficultyConfig(diffConfig);

  // Eager: needed by both tick() (real-time) and choose() (Intrilex card-game) paths
  const personality = createPersonality(archetype, seed, fullConfig.personality);
  const memory = createMemory(botId, fullConfig.memory, seed);
  const debug = createDebugSystem(botId, fullConfig);

  // Lazy: spatial modules only needed for tick() (real-time games).
  // The Intrilex card-game path (choose()) uses assessIntrilexBoardState() instead.
  // Deferring creation avoids wasting memory, seed material, and RNG state
  // when the agent is used solely as a card-game policy via policy-adapter.mjs.
  let _perception = null;
  let _cognition = null;
  let _sharedBlackboard = blackboard ?? null;
  let _failsafe = null;

  function ensureSpatialModules() {
    if (!_perception) {
      _perception = createPerception(botId, fullConfig.perception, seed);
      _cognition = createCognition(fullConfig, seed);
      _sharedBlackboard = _sharedBlackboard ?? createSharedBlackboard(fullConfig);
      _failsafe = createFailsafe(fullConfig);
    }
  }

  // Backward-compatible accessors for tests and getDebug()
  const perception = { get perceive() { ensureSpatialModules(); return _perception.perceive; }, reset() { _perception?.reset(); } };
  const cognition = { get decide() { ensureSpatialModules(); return _cognition.decide; }, reset() { _cognition?.reset(); } };
  const failsafe = { get validate() { ensureSpatialModules(); return _failsafe.validate; }, reset() { _failsafe?.reset(); } };

  const rng = new DeterministicPolicyRng(seed);
  const originalSeed = seed;
  let currentTick = 0;
  let lastWorldState = null;
  let lastBotState = null;
  let lastDecision = null;
  const cardGameGoals = []; // persistent GOAP goals for the card-game path

  /**
   * Full tick: perceive → remember → coordinate → decide → failsafe → debug.
   *
   * For real-time games: call once per frame with world state.
   * For turn-based games: call once per turn.
   *
   * @param {object} worldState - { entities, geometry, tick }
   * @param {object} botState - { id, position, facing, health, faction }
   * @param {object} cameraPosition - { x, y } for LOD (optional)
   * @returns {object} { action, reasonTrace, debug }
   */
  function tick(worldState, botState, cameraPosition) {
    ensureSpatialModules();
    const tickStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    currentTick = worldState.tick ?? currentTick + 1;
    lastWorldState = worldState;
    lastBotState = botState;

    // 1. Perception (with difficulty-scaled reaction time)
    const reactionMultiplier = getReactionMultiplier(diffConfig);
    const perceived = _perception.perceive(worldState, botState, reactionMultiplier);

    // 2. Memory update
    for (const entity of perceived.entities) {
      if (entity.faction !== botState.faction) {
        memory.record({
          tick: currentTick,
          type: entity.sensedVia === 'vision' ? 'SPOTTED' : 'HEARD',
          actor: entity.id,
          position: entity.position
        });
      }
    }
    memory.decay();
    const memorySnapshot = memory.getSnapshot();
    const adaptationRate = getAdaptationRate(diffConfig);
    const nudges = memory.getAdaptiveNudges(adaptationRate);

    // 3. Personality update
    decayMorale(personality, fullConfig.personality);

    // 4. Coordination
    const coordinationEnabled = isCoordinationEnabled(diffConfig);
    const coordination = evaluateCoordination(
      _sharedBlackboard, botId, perceived, personality, fullConfig.coordination, coordinationEnabled
    );

    // 5. Cognition
    const memoryForCognition = { patterns: memorySnapshot.patterns, nudges };
    const decisionResult = _cognition.decide(
      perceived, memoryForCognition, personality, coordination, diffConfig, currentTick
    );

    // 6. Failsafe
    const lodTier = cameraPosition
      ? determineLodTier(botState.position, cameraPosition, fullConfig.performance)
      : 'full';
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tickStart;
    const failsafeResult = _failsafe.validate(decisionResult, elapsed, lodTier, currentTick);

    // 7. Build final trace
    const finalTrace = {
      ...decisionResult.reasonTrace,
      failsafeTriggered: failsafeResult.failsafeTriggered,
      failsafeReason: failsafeResult.reason,
      elapsedMs: failsafeResult.elapsedMs,
      lodTier,
      personalitySummary: describePersonality(personality)
    };

    // 8. Debug recording
    debug.recordTrace(finalTrace);

    // 9. Post intent to blackboard
    if (coordinationEnabled) {
      _sharedBlackboard.postIntent(botId, {
        action: failsafeResult.action.type,
        target: failsafeResult.action.target?.id,
        role: coordination.role,
        position: botState.position
      });
    }

    lastDecision = { action: failsafeResult.action, reasonTrace: finalTrace };

    return {
      action: failsafeResult.action,
      reasonTrace: finalTrace,
      debug: debug.getVisualizationData(perceived, personality, lastDecision)
    };
  }

  /**
   * Notify the agent of an outcome for morale/memory updates.
   * @param {string} outcome - 'win' | 'loss' | 'neutral'
   * @param {number} timeToKillMs - Optional TTK for telemetry
   */
  function notifyOutcome(outcome, timeToKillMs) {
    updateMorale(personality, outcome, fullConfig.personality);
    debug.recordOutcome(outcome, timeToKillMs);
    memory.record({
      tick: currentTick,
      type: outcome === 'win' ? 'WIN' : outcome === 'loss' ? 'LOSS' : 'NEUTRAL',
      outcome
    });
  }

  /**
   * Record an enemy action in memory for pattern recognition.
   * @param {object} event - { type, actor, target, position, outcome }
   */
  function recordEnemyAction(event) {
    memory.record(event);
  }

  /**
   * Get debug info for this agent.
   */
  function getDebug() {
    return {
      botId,
      archetype: personality.archetypeId,
      difficulty,
      personality: describePersonality(personality),
      metrics: debug.getMetrics(),
      lastExplanation: debug.explainLastDecision(),
      traceHistory: debug.getTraceHistory(),
      memorySnapshot: memory.getSnapshot(),
      diffAudit
    };
  }

  /**
   * Reset agent to initial state.
   */
  function reset() {
    // Spatial modules may not be initialized if only choose() was used
    _perception?.reset();
    memory.reset();
    _cognition?.reset();
    _failsafe?.reset();
    debug.reset();
    personality.morale = fullConfig.personality.moraleBaseline ?? 0.5;
    currentTick = 0;
    lastWorldState = null;
    lastBotState = null;
    lastDecision = null;
    cardGameGoals.length = 0; // clear GOAP goals on reset
  }

  /**
   * Policy-compatible choose function.
   * Allows HYBRIX agents to be used as policies in the existing simulation runtime.
   *
   * @param {object} context - { legalActions, authorizedView, rng, ... }
   * @returns {object} { actionId, metadata }
   */
  function choose(context) {
    // Intrilex-native cognition: evaluate game state directly
    const view = context.authorizedView ?? {};
    const own = view.own ?? {};
    const opponents = view.opponents ?? [];
    const stack = view.stack ?? [];

    const legalActions = context.legalActions ?? [];
    if (!legalActions.length) {
      throw Object.assign(new Error('NO_LEGAL_ACTION'), { code: 'NO_LEGAL_ACTION' });
    }

    // Domain-native cognition: assess board state for context-aware scoring
    const cognition = assessIntrilexBoardState(own, opponents, stack, context);

    // Card-game-native GOAP: plan and maintain strategic goals across decisions
    const decisionIndex = context.decisionIndex ?? currentTick;
    const goals = planCardGameGoals(cognition, archetype, cardGameGoals, decisionIndex);

    // Use domain-specific scoring as the base, then layer HYBRIX systems
    const scoringPolicyId = ARCHETYPE_TO_SCORING_POLICY[archetype] ?? 'value';
    const personalityIntensity = diffConfig.personalityIntensity ?? 0.5;
    const scored = legalActions.map(action => {
      const baseScore = scorePolicyAction(scoringPolicyId, action, context);
      const cognitionScore = applyCognitionToLegalAction(baseScore, action, cognition, personalityIntensity, context);
      const goalScore = applyGoalBonusToAction(cognitionScore, action, goals, personalityIntensity);
      const personalityScore = applyPersonalityToLegalAction(goalScore, action, personality, fullConfig.personality, personalityIntensity, cognition);
      // Rank-aware strategic valuation: distinguishes score vs effect vs
      // anchor vs combination vs counter reserve, and applies conservation
      // opportunity-cost penalties for strategically valuable cards.
      const rankStrategy = evaluateRankStrategy(action, context, cognition);
      const rankScore = personalityScore + rankStrategy.adjustment;
      const nudgeScore = applyNudgesToLegalAction(rankScore, action, memory.getAdaptiveNudges(getAdaptationRate(diffConfig)));
      return { action, score: nudgeScore, baseScore, rankReasonCodes: rankStrategy.reasonCodes };
    });

    scored.sort((a, b) => b.score - a.score);

    // Apply difficulty selection with a dedicated rng to decouple from tick()'s rng consumption
    const decisionSeed = (originalSeed * 7919 + (context.decisionIndex ?? currentTick) + 0xD1FF) >>> 0;
    const difficultyRng = new DeterministicPolicyRng(decisionSeed || 1);
    const selected = applyDifficultyToLegal(scored, diffConfig, difficultyRng);

    // Record in memory
    memory.record({
      tick: context.decisionIndex ?? currentTick,
      type: mapActionType(selected.action),
      actor: context.actorId ?? botId,
      outcome: 'pending'
    });

    // Build reason trace from Intrilex-native cognition
    const trace = {
      btNode: cognition.btNode,
      activeGoals: goals.map(g => ({ id: g.id, priority: Number(g.priority.toFixed(2)) })),
      selectedAction: selected.action.actionId,
      score: Number(selected.score.toFixed(2)),
      baseScore: Number((selected.baseScore ?? 0).toFixed(2)),
      scoringPolicyId,
      margin: scored.length > 1 ? Number((scored[0].score - (scored[1]?.score ?? 0)).toFixed(2)) : 0,
      alternatives: scored.slice(0, 5).map(s => ({ action: s.action.actionId, score: Number(s.score.toFixed(2)) })),
      rankReasonCodes: selected.rankReasonCodes ?? [],
      personalityModifiers: { ...personality.activeModifiers },
      memoryPatterns: memory.getSnapshot().patterns.map(p => ({ type: p.type, confidence: p.confidence ?? p.value })),
      adaptiveNudges: memory.getAdaptiveNudges(getAdaptationRate(diffConfig)),
      coordinationRole: 'LONE_WOLF',
      difficultyError: selected.difficultyError ?? false,
      tick: context.decisionIndex ?? currentTick,
      failsafeTriggered: false
    };

    debug.recordTrace(trace);

    return {
      actionId: selected.action.actionId,
      metadata: {
        reasonCode: deriveReasonCode(selected.action, trace),
        rankReasonCodes: selected.rankReasonCodes ?? [],
        evaluatedCount: scored.length,
        candidateScores: scored.slice(0, 8).map(s => ({ actionId: s.action.actionId, score: Number(s.score.toFixed(2)) })),
        hybrixTrace: trace
      }
    };
  }

  return {
    botId,
    archetype,
    difficulty,
    personality,
    tick,
    choose,
    notifyOutcome,
    recordEnemyAction,
    getDebug,
    reset,
    perception,
    memory,
    cognition,
    failsafe,
    debug
  };
}

// ── Intrilex-Native Cognition ─────────────────────────────────

/**
 * Card-Game-Native GOAP Goals
 *
 * Replaces the spatial GOAP goals (CAPTURE_OBJECTIVE, ELIMINATE_PRIORITY_TARGET, etc.)
 * with card-game-specific strategic goals. These goals persist across decisions within
 * a match, creating multi-turn planning that makes each archetype feel distinct.
 *
 * Goals are evaluated by priority, weighted by archetype traits, and expire after
 * a bounded number of decisions to prevent stale planning.
 */
const CARD_GAME_GOAL_EXPIRY = 8; // decisions before a goal expires
const CARD_GAME_GOAL_THRESHOLD = 0.35; // minimum priority to activate a goal

const ARCHETYPE_GOAL_WEIGHTS = Object.freeze({
  rusher:    { PLAY_HIGH_VALUE: 1.4, DISRUPT_OPPONENT: 1.2, BUILD_DEFENSE: 0.4, CONSERVE_RESOURCES: 0.5 },
  defender:  { PLAY_HIGH_VALUE: 0.7, DISRUPT_OPPONENT: 0.8, BUILD_DEFENSE: 1.5, CONSERVE_RESOURCES: 1.0 },
  trickster: { PLAY_HIGH_VALUE: 0.9, DISRUPT_OPPONENT: 1.5, BUILD_DEFENSE: 0.5, CONSERVE_RESOURCES: 0.8 },
  sniper:    { PLAY_HIGH_VALUE: 1.3, DISRUPT_OPPONENT: 0.9, BUILD_DEFENSE: 0.6, CONSERVE_RESOURCES: 0.9 },
  support:   { PLAY_HIGH_VALUE: 0.6, DISRUPT_OPPONENT: 0.7, BUILD_DEFENSE: 1.3, CONSERVE_RESOURCES: 1.1 },
  tank:      { PLAY_HIGH_VALUE: 0.5, DISRUPT_OPPONENT: 0.6, BUILD_DEFENSE: 1.6, CONSERVE_RESOURCES: 1.0 },
  baseline:  { PLAY_HIGH_VALUE: 1.0, DISRUPT_OPPONENT: 1.0, BUILD_DEFENSE: 1.0, CONSERVE_RESOURCES: 1.0 }
});

/**
 * Plan card-game-native GOAP goals based on board state.
 * Returns up to 3 active goals with priority scores and step plans.
 *
 * @param {object} cognition - Board state assessment from assessIntrilexBoardState
 * @param {string} archetype - Bot archetype for goal weighting
 * @param {Array} activeGoals - Currently active goals (mutated: expired pruned, new added)
 * @param {number} decisionIndex - Current decision index for expiry tracking
 * @returns {Array} Active goals sorted by priority
 */
function planCardGameGoals(cognition, archetype, activeGoals, decisionIndex) {
  // Prune expired goals
  for (let i = activeGoals.length - 1; i >= 0; i--) {
    if (activeGoals[i].expiryDecision !== undefined && activeGoals[i].expiryDecision <= decisionIndex) {
      activeGoals.splice(i, 1);
    }
  }

  if (activeGoals.length >= 3) {
    return [...activeGoals].sort((a, b) => b.priority - a.priority);
  }

  const weights = ARCHETYPE_GOAL_WEIGHTS[archetype] ?? ARCHETYPE_GOAL_WEIGHTS.baseline;
  const candidates = [
    {
      id: 'PLAY_HIGH_VALUE',
      priority: evaluatePlayHighValueGoal(cognition) * (weights.PLAY_HIGH_VALUE ?? 1),
      steps: [
        { action: 'SCORE_HIGH_VALUE_CARD', condition: 'has_scoring_card' },
        { action: 'PRESSURE_OPPONENT', condition: 'score_gap_positive' }
      ]
    },
    {
      id: 'DISRUPT_OPPONENT',
      priority: evaluateDisruptOpponentGoal(cognition) * (weights.DISRUPT_OPPONENT ?? 1),
      steps: [
        { action: 'COUNTER_OPPONENT_STACK', condition: 'opponent_stack_present' },
        { action: 'SCUTTLE_OPPONENT_PR', condition: 'opponent_pr_vulnerable' }
      ]
    },
    {
      id: 'BUILD_DEFENSE',
      priority: evaluateBuildDefenseGoal(cognition) * (weights.BUILD_DEFENSE ?? 1),
      steps: [
        { action: 'ANCHOR_KEY_CARD', condition: 'has_anchor_card' },
        { action: 'ESTABLISH_GUARD', condition: 'opponent_has_disruption' }
      ]
    },
    {
      id: 'CONSERVE_RESOURCES',
      priority: evaluateConserveResourcesGoal(cognition) * (weights.CONSERVE_RESOURCES ?? 1),
      steps: [
        { action: 'DRAW_OR_SWAP', condition: 'hand_below_threshold' },
        { action: 'HOLD_HIGH_VALUE', condition: 'opponent_not_threatening' }
      ]
    }
  ];

  candidates.sort((a, b) => b.priority - a.priority);

  for (const candidate of candidates) {
    if (activeGoals.length >= 3) break;
    if (candidate.priority < CARD_GAME_GOAL_THRESHOLD) continue;
    if (activeGoals.some(g => g.id === candidate.id)) continue;

    activeGoals.push({
      ...candidate,
      createdDecision: decisionIndex,
      expiryDecision: decisionIndex + CARD_GAME_GOAL_EXPIRY
    });
  }

  return [...activeGoals].sort((a, b) => b.priority - a.priority);
}

function evaluatePlayHighValueGoal(cog) {
  let priority = 0.3; // baseline
  // Higher when close to winning
  if (cog.ownProgress > 0.7) priority += 0.5;
  if (cog.ownProgress > 0.85) priority += 0.3;
  // Higher when ahead (press the advantage)
  if (cog.scoreGap > 10) priority += 0.2;
  // Lower when under threat
  if (cog.btNode === 'SURVIVAL') priority -= 0.3;
  return Math.max(0, Math.min(1, priority));
}

function evaluateDisruptOpponentGoal(cog) {
  let priority = 0.2; // baseline
  // Higher when opponent is ahead
  if (cog.scoreGap < -10) priority += 0.4;
  if (cog.oppProgress > 0.7) priority += 0.3;
  // Higher when opponent has stack items
  if (cog.stackDepth > 0 && cog.opponentTop) priority += 0.3;
  if (cog.opponentRoot) priority += 0.15;
  // Higher in SURVIVAL (need to stop opponent)
  if (cog.btNode === 'SURVIVAL') priority += 0.2;
  return Math.max(0, Math.min(1, priority));
}

function evaluateBuildDefenseGoal(cog) {
  let priority = 0.15; // baseline
  // Higher when ahead (protect lead)
  if (cog.scoreGap > 15) priority += 0.4;
  // Higher when opponent has disruption potential
  if (cog.stackDepth > 0 && cog.opponentTop) priority += 0.2;
  // Higher in MACRO_GOAL (protect winning position)
  if (cog.btNode === 'MACRO_GOAL') priority += 0.3;
  // Lower when behind (need to catch up, not defend)
  if (cog.scoreGap < -15) priority -= 0.2;
  return Math.max(0, Math.min(1, priority));
}

function evaluateConserveResourcesGoal(cog) {
  let priority = 0.2; // baseline
  // Higher when hand is low
  if (cog.ownHandCount <= 2) priority += 0.5;
  if (cog.ownHandCount <= 1) priority += 0.2;
  // Higher when deck has cards to draw
  if (cog.ownDeckCount > 0) priority += 0.15;
  // Higher in IDLE_ROAM
  if (cog.btNode === 'IDLE_ROAM') priority += 0.3;
  // Lower when close to winning (don't waste time drawing)
  if (cog.ownProgress > 0.8) priority -= 0.3;
  // Lower when under threat (need action, not resources)
  if (cog.btNode === 'SURVIVAL') priority -= 0.2;
  return Math.max(0, Math.min(1, priority));
}

/**
 * Apply GOAP goal bonuses to action scores.
 * Each active goal boosts action families that align with its steps.
 */
function applyGoalBonusToAction(score, action, goals, intensity) {
  if (!goals.length) return score;
  let adjusted = score;
  const family = action.family ?? 'unknown';
  const mode = action.mode ?? '';

  for (const goal of goals) {
    const goalIntensity = goal.priority * intensity;
    switch (goal.id) {
      case 'PLAY_HIGH_VALUE':
        if (family === 'score') adjusted += 400 * goalIntensity;
        if (family === 'scuttle') adjusted += 200 * goalIntensity;
        if (family === 'royal-marriage' || family === 'super' || family === 'rank10') adjusted += 250 * goalIntensity;
        break;
      case 'DISRUPT_OPPONENT':
        if (family === 'counter') adjusted += 350 * goalIntensity;
        if (family === 'disrupt') adjusted += 300 * goalIntensity;
        if (family === 'scuttle') adjusted += 200 * goalIntensity;
        if (family === 'instant' || family === 'quick') adjusted += 150 * goalIntensity;
        break;
      case 'BUILD_DEFENSE':
        if (family === 'anchor' || family === 'anchor-guard') adjusted += 350 * goalIntensity;
        if (family === 'response-decline') adjusted += 100 * goalIntensity;
        if (family === 'effect-nine') adjusted += 200 * goalIntensity;
        break;
      case 'CONSERVE_RESOURCES':
        if (family === 'draw') adjusted += 300 * goalIntensity;
        if (family === 'swap-bar' && mode === 'face-down') adjusted += 150 * goalIntensity;
        if (family === 'exhausted-pass') adjusted += 50 * goalIntensity;
        break;
    }
  }

  return adjusted;
}

/**
 * Assess the Intrilex board state to determine strategic context.
 * Replaces the spatial perception/cognition pipeline with domain-native analysis.
 * Returns a cognition context that influences action scoring.
 */
function assessIntrilexBoardState(own, opponents, stack, context) {
  const ownScore = own.securedPoints ?? 0;
  const ownGoal = own.goal ?? 121;
  const ownHandCount = own.hand?.length ?? 0;
  const ownDeckCount = own.deckCount ?? 0;

  // Assess threat: opponent closest to winning
  let maxOpponentScore = 0;
  let maxOpponentId = null;
  for (const opp of opponents) {
    const oppScore = opp.securedPoints ?? 0;
    if (oppScore > maxOpponentScore) {
      maxOpponentScore = oppScore;
      maxOpponentId = opp.playerId;
    }
  }

  const scoreGap = ownScore - maxOpponentScore;
  const ownProgress = ownScore / ownGoal;
  const oppProgress = maxOpponentScore / (opponents[0]?.goal ?? 121);

  // Determine BT node equivalent from domain state
  let btNode = 'TACTICAL';
  let threatLevel = 0;
  let urgency = 0;

  // SURVIVAL: opponent is close to winning and we're behind
  if (oppProgress > 0.85 && scoreGap < -20) {
    btNode = 'SURVIVAL';
    threatLevel = 0.9;
    urgency = 0.8;
  }
  // MACRO_GOAL: we're close to winning
  else if (ownProgress > 0.85) {
    btNode = 'MACRO_GOAL';
    urgency = 0.7;
  }
  // COORDINATION: stack has opponent items we could counter
  else if (stack.length > 0 && stack.some(s => s.controllerId !== context.actorId)) {
    btNode = 'COORDINATION';
    threatLevel = 0.5;
    urgency = 0.4;
  }
  // IDLE_ROAM: low resource state, no urgency
  else if (ownHandCount <= 1 && ownDeckCount > 0) {
    btNode = 'IDLE_ROAM';
    urgency = 0.2;
  }

  // Stack analysis
  const stackDepth = stack.length;
  const ownTop = stackDepth > 0 && stack[stackDepth - 1]?.controllerId === context.actorId;
  const opponentTop = stackDepth > 0 && stack[stackDepth - 1]?.controllerId !== context.actorId;
  const opponentRoot = stackDepth > 0 && stack[0]?.controllerId !== context.actorId;

  return {
    btNode,
    threatLevel,
    urgency,
    scoreGap,
    ownProgress,
    oppProgress,
    ownHandCount,
    ownDeckCount,
    stackDepth,
    ownTop,
    opponentTop,
    opponentRoot,
    maxOpponentScore,
    maxOpponentId
  };
}

/**
 * Apply cognition context to adjust action scores based on board state.
 * This replaces the spatial cognition's role in action selection.
 */
function applyCognitionToLegalAction(baseScore, action, cognition, intensity, context) {
  let adjusted = baseScore;
  const family = action.family ?? 'unknown';

  // SURVIVAL: boost defensive and disruptive actions
  if (cognition.btNode === 'SURVIVAL') {
    if (family === 'counter' || family === 'disrupt' || family === 'scuttle') {
      adjusted += 300 * cognition.threatLevel * intensity;
    }
    if (family === 'anchor' || family === 'anchor-guard') {
      adjusted += 200 * cognition.threatLevel * intensity;
    }
    // Penalize slow actions when under threat
    if (family === 'draw' || family === 'exhausted-pass') {
      adjusted -= 100 * intensity;
    }
  }

  // MACRO_GOAL: boost scoring actions when close to winning
  if (cognition.btNode === 'MACRO_GOAL') {
    const immediate = Number(action.featureVector?.immediateScore ?? action.featureVector?.immediatePoints ?? 0);
    if (family === 'score' || family === 'scuttle') {
      adjusted += 500 * cognition.urgency * intensity;
    }
    // Boost actions that directly progress toward goal
    if (immediate > 0) {
      adjusted += immediate * 10 * cognition.urgency * intensity;
    }
  }

  // COORDINATION: boost counter actions against opponent stack items
  if (cognition.btNode === 'COORDINATION' && cognition.opponentTop) {
    if (family === 'counter') {
      adjusted += 250 * intensity;
    }
    if (family === 'disrupt' || family === 'scuttle') {
      adjusted += 150 * intensity;
    }
  }

  // IDLE_ROAM: boost resource acquisition (draw)
  if (cognition.btNode === 'IDLE_ROAM') {
    if (family === 'draw') {
      adjusted += 320 * intensity;
    }
  }

  // Stack-aware adjustments (always active)
  if (cognition.opponentTop && family === 'counter') {
    adjusted += 100 * intensity;
  }
  if (cognition.ownTop && (family === 'anchor' || family === 'anchor-guard')) {
    adjusted += 50 * intensity;
  }

  // Resource pressure: low hand count boosts draw actions
  if (cognition.ownHandCount <= 2 && family === 'draw') {
    adjusted += 100 * intensity;
  }

  // Swap Bar — the HYBIX AI actively cycles the bar. Face-down swaps are free
  // (Start phase, no mini-turn cost), so the AI dumps low-value non-royal hand
  // cards to gamble on a face-down bar card. Royals (K/Q) are protected: they
  // enable royal-marriage and anchor defense, so the AI keeps them. In urgent
  // states (SURVIVAL/MACRO_GOAL) the hand is preserved for defense/scoring.
  if (family === 'swap-bar') {
    const knownCards = context?.authorizedView?.knownCards ?? {};
    if (action.mode === 'face-down') {
      if (cognition.btNode === 'TACTICAL' || cognition.btNode === 'COORDINATION' || cognition.btNode === 'IDLE_ROAM') {
        const dumpsRoyal = (action.sourceHandles ?? []).some((h) => /^[KQ][♣♦♥♠]$/u.test(String(knownCards[h]?.identity ?? '')));
        const sourcePts = Math.max(Number(action.featureVector?.sourcePointValue ?? 0), (action.sourceHandles ?? []).reduce((s, h) => s + Number(knownCards[h]?.pointValue ?? 0), 0));
        if (!dumpsRoyal && sourcePts <= 5) {
          // Boost above the phase-transition score (5000) so the AI swaps before
          // entering the action phase. Scaled by source value so the lowest
          // cards are swapped most eagerly. Margin absorbs personality modifiers.
          adjusted += 5700 - sourcePts * 60;
        }
      }
    } else if (action.mode === 'face-up') {
      // Face-up swap draw costs a mini-turn; reward taking a known card,
      // scaling with its value so high-value bar cards are prioritized.
      const targetPts = Math.max(Number(action.featureVector?.targetPointValue ?? 0), (action.targetHandles ?? []).reduce((s, h) => s + Number(knownCards[h]?.pointValue ?? 0), 0));
      adjusted += 350 + targetPts * 20;
    }
    // Hand pressure: a small hand amplifies swap value (refill/cycle).
    if (cognition.ownHandCount <= 3) adjusted += 140 * intensity;
  }

  return adjusted;
}

// ── Legal Action Scoring Helpers ──────────────────────────────

function scoreLegalAction(action, view, context) {
  const family = action.family ?? 'unknown';
  let score = 100;

  // Win-pressure: if this action reaches the goal, huge boost
  const own = view.own ?? {};
  const immediate = Number(action.featureVector?.immediateScore ?? action.featureVector?.immediatePoints ?? 0);
  if (own.securedPoints != null && own.goal != null && own.securedPoints + immediate >= own.goal) {
    score += 5000;
  }

  // Points
  score += immediate * 30;

  // Control / disruption
  if (family === 'scuttle' || family === 'disrupt' || family === 'counter') {
    score += 200;
  }

  // Resource
  if (family === 'draw' || family === 'swap-bar') {
    const handCount = own.hand?.length ?? 0;
    if (handCount <= 2) score += 400;
    else score += 150;
  }

  // Defense
  if (family === 'anchor' || family === 'anchor-guard' || family === 'effect-nine') {
    score += 100;
  }

  // Response decline
  if (family === 'response-decline') {
    score += 50;
  }

  // Exhausted pass
  if (family === 'exhausted-pass') {
    score -= 100;
  }

  // Advanced mechanics
  if (['royal-marriage', 'super', 'rank10', 'ultra', 'voltage'].includes(family)) {
    score += 300;
  }

  return score;
}

function applyPersonalityToLegalAction(score, action, personality, config, intensity, cognition = null) {
  const t = personality.traits;
  let adjusted = score;

  // Cognition override: when urgency is high, dampen personality penalties
  // so that a low-aggression Defender still scores when close to winning
  const urgencyDampen = cognition && cognition.urgency > 0.6 ? 0.3 : 1.0;

  if (action.family === 'score' || action.family === 'scuttle') {
    adjusted *= 1.0 + (t.aggression - 0.5) * 0.6 * intensity * urgencyDampen;
  }

  if (action.family === 'anchor' || action.family === 'anchor-guard' || action.family === 'response-decline') {
    adjusted *= 1.0 + (t.patience - 0.5) * 0.6 * intensity;
  }

  if (action.family === 'draw') {
    adjusted *= 1.0 + (t.fear - 0.5) * 0.4 * intensity;
  }

  if (action.family === 'effect-three' || action.family === 'effect-four') {
    adjusted *= 1.0 + (t.curiosity - 0.5) * 1.0 * intensity;
  }

  // Swap Bar: curious archetypes favor cycling the bar (exploring unknown
  // face-down cards / taking known face-up cards); conservative archetypes avoid it.
  if (action.family === 'swap-bar') {
    adjusted *= 1.0 + (t.curiosity - 0.5) * 0.8 * intensity;
  }

  if (action.family === 'effect-nine') {
    adjusted *= 1.0 + (t.loyalty - 0.5) * 1.0 * intensity;
  }

  // Morale — centered at 1.0 for baseline (0.5), scaled by intensity
  adjusted *= 1.0 + (personality.morale - 0.5) * 0.4 * intensity;

  return adjusted;
}

function applyNudgesToLegalAction(score, action, nudges) {
  let adjusted = score;
  if (action.family === 'score' || action.family === 'scuttle') {
    adjusted *= (1 + (nudges.aggression ?? 0));
  }
  if (action.family === 'anchor' || action.family === 'response-decline') {
    adjusted *= (1 - (nudges.aggression ?? 0) * 0.5);
  }
  adjusted *= (1 + (nudges.accuracy ?? 0) * 0.1);
  return adjusted;
}

function applyDifficultyToLegal(scored, diffConfig, rng) {
  if (!scored.length) return null;

  const errorRate = diffConfig.errorInjectionRate ?? 0.05;
  const roll = rng.nextUint32() / 0xFFFFFFFF;

  if (roll < errorRate && scored.length > 1) {
    const idx = 1 + Math.floor(rng.nextUint32() / 0xFFFFFFFF * (scored.length - 1));
    return { ...scored[idx], difficultyError: true };
  }

  const depth = diffConfig.decisionDepth ?? 'topK';
  if (depth === 'top1') return scored[0];

  if (depth === 'topK') {
    const k = Math.min(3, scored.length);
    const topK = scored.slice(0, k);
    const total = topK.reduce((sum, s) => sum + Math.max(s.score, 0), 0);
    if (total <= 0) return topK[rng.nextIndex(topK.length)];
    let r = rng.nextUint32() / 0xFFFFFFFF * total;
    for (const item of topK) {
      r -= Math.max(item.score, 0);
      if (r <= 0) return item;
    }
    return topK[0];
  }

  return scored[0];
}

function mapActionType(action) {
  const family = action.family ?? 'unknown';
  if (family === 'score') return 'ATTACK';
  if (family === 'scuttle') return 'ATTACK';
  if (family === 'draw') return 'DRAW';
  if (family === 'counter') return 'COUNTER';
  if (family === 'response-decline') return 'RESPONSE_DECLINE';
  if (family === 'anchor') return 'DEFEND';
  return family.toUpperCase();
}

function deriveReasonCode(action, trace) {
  if (trace.difficultyError) return 'LOW_MARGIN_ALTERNATIVE';
  if (trace.margin > 100) return 'MAX_EXPECTED_VALUE';
  // Goal-driven reason codes take priority over BT-node codes
  const topGoal = trace.activeGoals?.[0];
  if (topGoal) {
    if (topGoal.id === 'PLAY_HIGH_VALUE' && (action.family === 'score' || action.family === 'scuttle')) return 'GOAL_PLAY_HIGH_VALUE';
    if (topGoal.id === 'DISRUPT_OPPONENT' && (action.family === 'counter' || action.family === 'disrupt' || action.family === 'scuttle')) return 'GOAL_DISRUPT_OPPONENT';
    if (topGoal.id === 'BUILD_DEFENSE' && (action.family === 'anchor' || action.family === 'anchor-guard' || action.family === 'response-decline')) return 'GOAL_BUILD_DEFENSE';
    if (topGoal.id === 'CONSERVE_RESOURCES' && (action.family === 'draw' || action.family === 'swap-bar')) return 'GOAL_CONSERVE_RESOURCES';
  }
  if (trace.btNode === 'SURVIVAL') return 'RISK_AVERSE';
  if (action.family === 'score') return 'MAX_SCORE_PRESSURE';
  if (action.family === 'scuttle') return 'BOARD_CONTROL_GAIN';
  if (action.family === 'draw') return 'HAND_REFILL';
  if (action.family === 'swap-bar') return 'SWAP_BAR_RESOURCE_CYCLE';
  if (action.family === 'counter') return 'COUNTER_OPPONENT_ROOT';
  if (action.family === 'response-decline') return 'DECLINE_WITH_OPTIONS';
  if (action.family === 'anchor') return 'ANCHOR_SETUP';
  return 'EFFECT_UTILITY';
}
