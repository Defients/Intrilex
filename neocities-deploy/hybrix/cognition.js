/**
 * HYBRIX AI — Cognition Layer
 *
 * Hybrid architecture: Behavior Tree spine + Utility scoring at
 * decision nodes + Bounded GOAP for macro goals.
 *
 * BT spine provides priority-ordered decision contexts.
 * Utility scoring provides graded action selection within each context.
 * GOAP provides lightweight macro planning (≤3 goals, depth ≤2).
 */

import { DeterministicPolicyRng } from "./browser-policy-sdk.js?v=4f30833b427f";
import { applyPersonalityToScore } from "./personality.js?v=4f30833b427f";
import { applyDifficultySelection } from "./difficulty.js?v=4f30833b427f";

/**
 * Create the cognition engine for a bot.
 * @param {object} config - Full HYBRIX config
 * @param {number} seed - Deterministic seed
 */
export function createCognition(config, seed) {
  const rng = new DeterministicPolicyRng((seed ^ 0xC0DE1717) >>> 0 || 1);
  const cogConfig = config.cognition;
  const goapConfig = config.goap;
  const actionCooldowns = new Map();
  const activeGoals = [];

  /**
   * Main decision function.
   * @param {object} perceived - PerceivedWorld from perception layer
   * @param {object} memory - Memory snapshot
   * @param {object} personality - Personality state
   * @param {object} coordination - Coordination directive
   * @param {object} difficultyConfig - Difficulty level config
   * @param {number} tick - Current tick
   * @returns {object} DecisionResult { action, reasonTrace }
   */
  function decide(perceived, memory, personality, coordination, difficultyConfig, tick) {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nudges = memory.nudges ?? { accuracy: 0, aggression: 0, spacing: 0 };
    const goals = planMacroGoals(perceived, coordination, difficultyConfig, tick);

    for (const node of cogConfig.btSpine) {
      if (!evaluateCondition(node.condition, perceived, coordination, goals)) {
        continue;
      }

      const candidates = generateCandidates(node.id, perceived, memory, coordination, goals, tick);
      if (!candidates.length) continue;

      // Cap evaluated actions
      const capped = candidates.slice(0, cogConfig.maxEvaluatedActions);

      // Utility score each candidate
      const scored = capped.map(action => {
        const baseScore = scoreAction(action, perceived, memory, cogConfig.scoreWeights);
        const personalityScore = applyPersonalityToScore(baseScore, action, personality, config.personality, rng);
        const memoryScore = applyAdaptiveNudges(personalityScore, action, nudges);
        const coordScore = applyCoordinationDirective(memoryScore, action, coordination);
        return { action, score: coordScore, btNode: node.id, baseScore, personalityScore };
      });

      // Sort descending by score
      scored.sort((a, b) => b.score - a.score || String(a.action.id ?? '').localeCompare(String(b.action.id ?? '')));

      // Filter out cooldown-locked actions
      const available = scored.filter(s => !isOnCooldown(s.action, tick));
      if (!available.length) continue;

      // Selection via difficulty
      const selected = applyDifficultySelection(available, difficultyConfig, rng);
      if (!selected) continue;

      // Hesitation check
      const hesitationChance = cogConfig.hesitationChance ?? 0.05;
      if (rng.nextUint32() / 0xFFFFFFFF < hesitationChance) {
        return {
          action: { type: 'HESITATE', id: 'hesitate', family: 'idle' },
          reasonTrace: buildTrace(node, selected, scored, personality, memory, coordination, 'HESITATION', tick)
        };
      }

      // Record cooldown
      recordCooldown(selected.action, tick);

      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      return {
        action: selected.action,
        reasonTrace: buildTrace(node, selected, scored, personality, memory, coordination, null, tick, elapsed)
      };
    }

    // Ultimate fallback
    return {
      action: { type: 'IDLE', id: 'idle', family: 'idle' },
      reasonTrace: {
        btNode: 'FALLBACK',
        reason: 'No candidates from any BT node',
        tick,
        selectedAction: 'IDLE',
        score: 0,
        margin: 0,
        alternatives: [],
        personalityModifiers: {},
        memoryPatterns: [],
        coordinationRole: coordination?.role ?? 'NONE',
        failsafeTriggered: false
      }
    };
  }

  /**
   * Bounded GOAP — plan macro goals (≤3 active, depth ≤2).
   */
  function planMacroGoals(perceived, coordination, difficultyConfig, tick) {
    // Prune expired goals
    for (let i = activeGoals.length - 1; i >= 0; i--) {
      if (activeGoals[i].expiryTick && activeGoals[i].expiryTick <= tick) {
        activeGoals.splice(i, 1);
      }
    }

    if (activeGoals.length >= goapConfig.maxActiveGoals) {
      return activeGoals;
    }

    const candidates = [
      { id: 'CAPTURE_OBJECTIVE', priority: evaluateObjectiveValue(perceived) },
      { id: 'ELIMINATE_PRIORITY_TARGET', priority: evaluateTargetValue(perceived) },
      { id: 'REGROUP_WITH_ALLIES', priority: evaluateRegroupNeed(perceived, coordination) },
      { id: 'SECURE_RESOURCE', priority: evaluateResourceValue(perceived) },
      { id: 'DEFEND_POSITION', priority: evaluateDefenseNeed(perceived, coordination) }
    ];

    candidates.sort((a, b) => b.priority - a.priority);

    for (const candidate of candidates) {
      if (activeGoals.length >= goapConfig.maxActiveGoals) break;
      if (candidate.priority < 0.3) continue;
      if (activeGoals.some(g => g.id === candidate.id)) continue;

      const plan = planSteps(candidate, perceived, goapConfig.maxPlanDepth, goapConfig.maxPlanSteps);
      if (plan) {
        activeGoals.push({
          ...candidate,
          plan,
          createdTick: tick,
          expiryTick: tick + 300 // 5 seconds at 60fps
        });
      }
    }

    return activeGoals;
  }

  function planSteps(goal, perceived, maxDepth, maxSteps) {
    if (maxDepth <= 0 || maxSteps <= 0) return null;

    const steps = [];
    switch (goal.id) {
      case 'CAPTURE_OBJECTIVE':
        steps.push({ action: 'MOVE_TO_OBJECTIVE', target: 'nearest_objective' });
        if (maxDepth > 1) steps.push({ action: 'SECURE_OBJECTIVE', target: 'nearest_objective' });
        break;
      case 'ELIMINATE_PRIORITY_TARGET':
        steps.push({ action: 'APPROACH_TARGET', target: 'priority_target' });
        if (maxDepth > 1) steps.push({ action: 'ENGAGE_TARGET', target: 'priority_target' });
        break;
      case 'REGROUP_WITH_ALLIES':
        steps.push({ action: 'MOVE_TO_ALLY', target: 'nearest_ally' });
        break;
      case 'SECURE_RESOURCE':
        steps.push({ action: 'MOVE_TO_RESOURCE', target: 'nearest_resource' });
        if (maxDepth > 1) steps.push({ action: 'COLLECT_RESOURCE', target: 'nearest_resource' });
        break;
      case 'DEFEND_POSITION':
        steps.push({ action: 'MOVE_TO_DEFENSE_POINT', target: 'defense_point' });
        if (maxDepth > 1) steps.push({ action: 'HOLD_POSITION', target: 'defense_point' });
        break;
      default:
        return null;
    }

    return steps.slice(0, maxSteps);
  }

  function evaluateCondition(condition, perceived, coordination, goals) {
    switch (condition) {
      case 'criticalThreat':
        return perceived.threats.some(t => t.threatScore > 0.7);
      case 'activeDirective':
        return coordination?.sharedGoal != null || coordination?.flank != null;
      case 'activeGoal':
        return goals && goals.length > 0;
      case 'enemiesInEngagementRange':
        return perceived.entities.some(e => e.faction !== 'self' && e.distance < 15);
      case 'always':
        return true;
      default:
        return false;
    }
  }

  function generateCandidates(btNodeId, perceived, memory, coordination, goals, tick) {
    const candidates = [];

    switch (btNodeId) {
      case 'SURVIVAL':
        for (const threat of perceived.threats) {
          if (threat.threatScore > 0.7) {
            candidates.push({ id: `evade_${threat.id}`, type: 'RETREAT', family: 'evade', target: threat, urgency: threat.threatScore });
            candidates.push({ id: `shield_${threat.id}`, type: 'DEFEND', family: 'defend', target: threat, urgency: threat.threatScore * 0.8 });
          }
        }
        break;

      case 'COORDINATION':
        if (coordination?.flank) {
          candidates.push({ id: 'flank_execute', type: 'MOVE', family: 'flank', target: coordination.flank, coordinationAction: true });
        }
        if (coordination?.sharedGoal === 'FOCUS_TARGET' && coordination?.target) {
          candidates.push({ id: `focus_${coordination.target}`, type: 'ATTACK', family: 'attack', target: coordination.target, coordinationAction: true });
        }
        if (coordination?.role === 'FOLLOWER' && coordination?.target) {
          candidates.push({ id: `follow_${coordination.target}`, type: 'SUPPORT', family: 'support', target: coordination.target, coordinationAction: true });
        }
        break;

      case 'MACRO_GOAL':
        for (const goal of goals) {
          const step = goal.plan?.[0];
          if (step) {
            candidates.push({ id: `goal_${goal.id}`, type: step.action, family: 'macro', target: step.target, goalId: goal.id });
          }
        }
        break;

      case 'TACTICAL':
        for (const entity of perceived.entities) {
          if (entity.faction === 'self') continue;
          if (entity.threatScore > 0.3) {
            candidates.push({ id: `attack_${entity.id}`, type: 'ATTACK', family: 'attack', target: entity, urgency: entity.threatScore });
          }
          if (entity.opportunityScore > 0.4) {
            candidates.push({ id: `engage_${entity.id}`, type: 'ATTACK', family: 'engage', target: entity, urgency: entity.opportunityScore });
          }
        }
        candidates.push({ id: 'reposition', type: 'MOVE', family: 'reposition' });
        candidates.push({ id: 'defend_hold', type: 'DEFEND', family: 'defend' });
        break;

      case 'IDLE_ROAM':
        candidates.push({ id: 'patrol', type: 'EXPLORE', family: 'patrol' });
        candidates.push({ id: 'idle', type: 'IDLE', family: 'idle' });
        candidates.push({ id: 'regroup', type: 'MOVE', family: 'regroup' });
        break;
    }

    return candidates;
  }

  function scoreAction(action, perceived, weights) {
    let score = 0;
    const w = weights;

    // Terminal: survival-critical actions get huge boost
    if (action.type === 'RETREAT' && action.urgency > 0.7) {
      score += w.terminal * (action.urgency / 1.0);
    }

    // Threat-based scoring
    if (action.target?.threatScore != null) {
      score += w.threat * action.target.threatScore;
    }

    // Opportunity-based scoring
    if (action.target?.opportunityScore != null) {
      score += w.opportunity * action.target.opportunityScore;
    }

    // Defensive actions
    if (action.type === 'DEFEND' || action.family === 'defend') {
      score += w.defense;
    }

    // Resource actions
    if (action.type === 'EXPLORE' || action.family === 'patrol') {
      score += w.resource * 0.5;
    }

    // Tempo / movement
    if (action.type === 'MOVE' || action.family === 'flank') {
      score += w.tempo;
    }

    // Synergy with coordination
    if (action.coordinationAction) {
      score += w.synergy;
    }

    // Risk penalty for attacking high-threat targets
    if (action.type === 'ATTACK' && action.target?.threatScore > 0.6) {
      score += w.risk * action.target.threatScore;
    }

    // Base score so nothing is zero
    score += 10;

    return score;
  }

  function applyAdaptiveNudges(score, action, nudges) {
    let adjusted = score;
    if (action.type === 'ATTACK') {
      adjusted *= (1 + nudges.aggression);
    }
    if (action.type === 'DEFEND' || action.type === 'RETREAT') {
      adjusted *= (1 - nudges.aggression * 0.5);
    }
    // Accuracy nudge affects all actions slightly
    adjusted *= (1 + nudges.accuracy * 0.1);
    return adjusted;
  }

  function applyCoordinationDirective(score, action, coordination) {
    if (!coordination?.sharedGoal) return score;
    // Boost actions that align with coordination goal
    if (action.coordinationAction) {
      return score * 1.3;
    }
    return score;
  }

  function isOnCooldown(action, tick) {
    const key = action.id ?? action.type;
    const until = actionCooldowns.get(key);
    if (until == null) return false;
    const cooldownTicks = Math.ceil((cogConfig.cooldownMs ?? 500) / (1000 / 60));
    return tick < until;
  }

  function recordCooldown(action, tick) {
    const key = action.id ?? action.type;
    const cooldownTicks = Math.ceil((cogConfig.cooldownMs ?? 500) / (1000 / 60));
    actionCooldowns.set(key, tick + cooldownTicks);
  }

  function buildTrace(node, selected, allScored, personality, memory, coordination, specialReason, tick, elapsedMs) {
    const margin = allScored.length > 1
      ? Number((allScored[0].score - (allScored[1]?.score ?? 0)).toFixed(2))
      : 0;

    return {
      btNode: node.id,
      selectedAction: selected.action.id ?? selected.action.type,
      selectedType: selected.action.type,
      score: Number(selected.score.toFixed(2)),
      baseScore: Number(selected.baseScore.toFixed(2)),
      margin,
      alternatives: allScored.slice(0, 5).map(s => ({
        action: s.action.id ?? s.action.type,
        score: Number(s.score.toFixed(2))
      })),
      personalityModifiers: { ...personality.activeModifiers },
      memoryPatterns: (memory.patterns ?? []).map(p => ({ type: p.type, confidence: p.confidence ?? p.value })),
      adaptiveNudges: memory.nudges ?? {},
      coordinationRole: coordination?.role ?? 'NONE',
      coordinationGoal: coordination?.sharedGoal ?? null,
      difficultyError: selected.difficultyError ?? false,
      specialReason: specialReason ?? null,
      tick,
      elapsedMs: elapsedMs ?? 0,
      failsafeTriggered: false
    };
  }

  function reset() {
    actionCooldowns.clear();
    activeGoals.length = 0;
  }

  return { decide, reset, planMacroGoals };
}

// ── GOAP Evaluation Helpers ───────────────────────────────────

function evaluateObjectiveValue(perceived) {
  return perceived.opportunities.length > 0 ? 0.7 : 0.3;
}

function evaluateTargetValue(perceived) {
  const lowHealthEnemies = perceived.entities.filter(e => e.health != null && e.health < 30 && e.faction !== 'self');
  return lowHealthEnemies.length > 0 ? 0.8 : 0.4;
}

function evaluateRegroupNeed(perceived, coordination) {
  if (coordination?.role === 'FOLLOWER') return 0.6;
  return 0.2;
}

function evaluateResourceValue(perceived) {
  return 0.3;
}

function evaluateDefenseNeed(perceived, coordination) {
  if (perceived.threats.length > 2) return 0.7;
  return 0.2;
}
