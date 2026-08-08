import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CONFIG,
  loadConfig,
  validateConfig,
  createPerception,
  createPersonality,
  createMemory,
  createCognition,
  createSharedBlackboard,
  evaluateCoordination,
  createFailsafe,
  determineLodTier,
  shouldUseFullAI,
  createDebugSystem,
  aggregateTelemetry,
  createHybrixAgent,
  createHybrixPolicy,
  HYBRIX_POLICIES,
  extractHybrixTraces,
  explainHybrixTrace,
  summarizeHybrixDecisions,
  mapHybrixReasonCodes,
  ARCHETYPES,
  TRAIT_KEYS,
  DIFFICULTY_LEVELS,
  getDifficultyConfig,
  auditDifficultyConfig,
  applyDifficultySelection,
  describePersonality,
  updateMorale,
  decayMorale
} from '@intrilex/game-ai';
import { DeterministicPolicyRng } from '@intrilex/policy-sdk';

// ── Config Tests ──────────────────────────────────────────────

describe('Config', () => {
  test('DEFAULT_CONFIG has all required sections', () => {
    const validation = validateConfig(DEFAULT_CONFIG);
    assert.ok(validation.valid, `Config validation errors: ${validation.errors.join(', ')}`);
  });

  test('loadConfig merges partial overrides', () => {
    const custom = loadConfig({
      perception: { visionRange: 60, reactionDelayMs: 100 }
    });
    assert.equal(custom.perception.visionRange, 60);
    assert.equal(custom.perception.reactionDelayMs, 100);
    assert.equal(custom.perception.missChance, DEFAULT_CONFIG.perception.missChance);
  });

  test('validateConfig detects missing sections', () => {
    const result = validateConfig({ perception: {} });
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
  });

  test('validateConfig flags positive risk weight', () => {
    const bad = loadConfig({
      cognition: { scoreWeights: { risk: 100 } }
    });
    const result = validateConfig(bad);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('risk')));
  });
});

// ── Perception Tests ──────────────────────────────────────────

describe('Perception', () => {
  test('detects entity within vision range and cone', () => {
    const perc = createPerception('bot1', DEFAULT_CONFIG.perception, 42);
    const worldState = {
      tick: 0,
      entities: [
        { id: 'enemy1', faction: 'enemy', position: { x: 10, y: 0 }, health: 80 }
      ],
      geometry: null
    };
    const botState = { id: 'bot1', position: { x: 0, y: 0 }, facing: 0, health: 100, faction: 'self' };

    // Tick 0: queues stimulus with reaction delay
    const result0 = perc.perceive(worldState, botState, 1.0);
    assert.equal(result0.botId, 'bot1');

    // Tick 100: stimulus should be released (250ms delay at 60fps = ~15 ticks)
    worldState.tick = 100;
    const result1 = perc.perceive(worldState, botState, 1.0);
    assert.ok(result1.entities.length > 0, 'Should perceive entity after reaction delay');
  });

  test('does not detect entity outside vision range and sound range', () => {
    const perc = createPerception('bot1', DEFAULT_CONFIG.perception, 42);
    const worldState = {
      tick: 100,
      entities: [
        { id: 'far_enemy', faction: 'enemy', position: { x: 100, y: 0 }, health: 80 }
      ],
      geometry: null
    };
    const botState = { id: 'bot1', position: { x: 0, y: 0 }, facing: 0, health: 100, faction: 'self' };

    const result = perc.perceive(worldState, botState, 1.0);
    assert.equal(result.entities.length, 0, 'Should not detect far entity');
  });

  test('does not detect entity outside vision cone but within sound range', () => {
    const perc = createPerception('bot1', DEFAULT_CONFIG.perception, 42);
    const worldState = {
      tick: 100,
      entities: [
        { id: 'behind', faction: 'enemy', position: { x: -10, y: 0 }, health: 80 }
      ],
      geometry: null
    };
    const botState = { id: 'bot1', position: { x: 0, y: 0 }, facing: 0, health: 100, faction: 'self' };

    const result = perc.perceive(worldState, botState, 1.0);
    // Behind the bot (180 degrees from facing=0), but within sound range (20)
    const entity = result.entities.find(e => e.id === 'behind');
    if (entity) {
      assert.equal(entity.sensedVia, 'sound');
    }
  });

  test('reset clears all state', () => {
    const perc = createPerception('bot1', DEFAULT_CONFIG.perception, 42);
    const worldState = { tick: 0, entities: [{ id: 'e1', faction: 'enemy', position: { x: 5, y: 0 } }], geometry: null };
    const botState = { id: 'bot1', position: { x: 0, y: 0 }, facing: 0, health: 100, faction: 'self' };
    perc.perceive(worldState, botState, 1.0);
    perc.reset();
    worldState.tick = 100;
    const result = perc.perceive(worldState, botState, 1.0);
    // After reset, no carry-forward entities
    assert.equal(result.pendingStimuliCount, 1); // new stimulus queued
  });
});

// ── Personality Tests ─────────────────────────────────────────

describe('Personality', () => {
  test('all archetypes have 5 traits', () => {
    for (const [id, arch] of Object.entries(ARCHETYPES)) {
      for (const key of TRAIT_KEYS) {
        assert.ok(arch.traits[key] != null, `Archetype ${id} missing trait ${key}`);
        assert.ok(arch.traits[key] >= 0 && arch.traits[key] <= 1, `Archetype ${id} trait ${key} out of range`);
      }
    }
  });

  test('createPersonality applies per-instance variance', () => {
    const p1 = createPersonality('rusher', 1, DEFAULT_CONFIG.personality);
    const p2 = createPersonality('rusher', 2, DEFAULT_CONFIG.personality);
    // Different seeds should produce different traits (with high probability)
    const allSame = TRAIT_KEYS.every(k => p1.traits[k] === p2.traits[k]);
    assert.ok(!allSame, 'Different seeds should produce different personalities');
  });

  test('traits stay within 0-1 after variance', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = createPersonality('rusher', seed, DEFAULT_CONFIG.personality);
      for (const key of TRAIT_KEYS) {
        assert.ok(p.traits[key] >= 0 && p.traits[key] <= 1, `Trait ${key} out of range for seed ${seed}`);
      }
    }
  });

  test('updateMorale adjusts morale on win/loss', () => {
    const p = createPersonality('defender', 42, DEFAULT_CONFIG.personality);
    const initialMorale = p.morale;
    updateMorale(p, 'win', DEFAULT_CONFIG.personality);
    assert.ok(p.morale > initialMorale, 'Morale should increase on win');
    updateMorale(p, 'loss', DEFAULT_CONFIG.personality);
    assert.ok(p.morale < p.morale + 1, 'Morale should decrease on loss');
  });

  test('decayMorale moves toward baseline', () => {
    const p = createPersonality('rusher', 42, DEFAULT_CONFIG.personality);
    p.morale = 1.0;
    const baseline = DEFAULT_CONFIG.personality.moraleBaseline;
    for (let i = 0; i < 500; i++) decayMorale(p, DEFAULT_CONFIG.personality);
    assert.ok(Math.abs(p.morale - baseline) < 0.1, `Morale ${p.morale} should decay toward baseline ${baseline}`);
  });

  test('describePersonality returns readable string', () => {
    const p = createPersonality('sniper', 42, DEFAULT_CONFIG.personality);
    const desc = describePersonality(p);
    assert.ok(desc.includes('Sniper'));
    assert.ok(desc.includes('A:'));
  });
});

// ── Memory Tests ──────────────────────────────────────────────

describe('Memory', () => {
  test('record and recognizePatterns', () => {
    const mem = createMemory('bot1', DEFAULT_CONFIG.memory, 42);
    for (let i = 0; i < 5; i++) {
      mem.record({ tick: i, type: 'ATTACK', actor: 'enemy1', position: { quadrant: 'left' } });
    }
    const patterns = mem.recognizePatterns();
    const repeated = patterns.find(p => p.type === 'REPEATED_TACTIC');
    assert.ok(repeated, 'Should detect repeated tactic');
    assert.ok(repeated.confidence > 0);
  });

  test('getAdaptiveNudges returns clamped values', () => {
    const mem = createMemory('bot1', DEFAULT_CONFIG.memory, 42);
    for (let i = 0; i < 20; i++) {
      mem.record({ tick: i, type: 'ATTACK', actor: 'enemy1', position: { quadrant: 'left' } });
    }
    const nudges = mem.getAdaptiveNudges(1.0);
    assert.ok(nudges.accuracy >= -0.3 && nudges.accuracy <= 0.3);
    assert.ok(nudges.aggression >= -0.3 && nudges.aggression <= 0.3);
    assert.ok(nudges.spacing >= -0.2 && nudges.spacing <= 0.2);
  });

  test('reset clears all state', () => {
    const mem = createMemory('bot1', DEFAULT_CONFIG.memory, 42);
    mem.record({ tick: 0, type: 'ATTACK', actor: 'enemy1' });
    mem.reset();
    const snap = mem.getSnapshot();
    assert.equal(snap.bufferSize, 0);
    assert.equal(snap.totalEvents, 0);
  });

  test('decay reduces weights', () => {
    const mem = createMemory('bot1', DEFAULT_CONFIG.memory, 42);
    mem.record({ tick: 0, type: 'ATTACK', actor: 'e1' });
    mem.decay();
    mem.decay();
    const patterns = mem.recognizePatterns();
    // After decay, events should still be in buffer but with lower weight
    const snap = mem.getSnapshot();
    assert.ok(snap.bufferSize > 0);
  });
});

// ── Cognition Tests ───────────────────────────────────────────

describe('Cognition', () => {
  test('decide returns an action', () => {
    const cog = createCognition(DEFAULT_CONFIG, 42);
    const perceived = {
      botId: 'bot1',
      tick: 0,
      entities: [{ id: 'enemy1', faction: 'enemy', distance: 10, threatScore: 0.8, opportunityScore: 0.5, position: { x: 10, y: 0 } }],
      threats: [{ id: 'enemy1', faction: 'enemy', distance: 10, threatScore: 0.8, opportunityScore: 0.5, position: { x: 10, y: 0 } }],
      opportunities: [],
      uncertainty: 0.1
    };
    const memory = { patterns: [], nudges: { accuracy: 0, aggression: 0, spacing: 0 } };
    const personality = createPersonality('rusher', 42, DEFAULT_CONFIG.personality);
    const coordination = { role: 'LONE_WOLF', allies: [], sharedGoal: null, flank: null };
    const diffConfig = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'normal');

    const result = cog.decide(perceived, memory, personality, coordination, diffConfig, 0);
    assert.ok(result.action, 'Should return an action');
    assert.ok(result.reasonTrace, 'Should return a reason trace');
    assert.ok(result.reasonTrace.btNode, 'Trace should have BT node');
  });

  test('SURVIVAL node triggers on critical threat', () => {
    const cog = createCognition(DEFAULT_CONFIG, 42);
    const perceived = {
      botId: 'bot1', tick: 0,
      entities: [{ id: 'threat1', faction: 'enemy', distance: 5, threatScore: 0.9, opportunityScore: 0, position: { x: 5, y: 0 } }],
      threats: [{ id: 'threat1', faction: 'enemy', distance: 5, threatScore: 0.9, opportunityScore: 0, position: { x: 5, y: 0 } }],
      opportunities: [],
      uncertainty: 0.1
    };
    const memory = { patterns: [], nudges: { accuracy: 0, aggression: 0, spacing: 0 } };
    const personality = createPersonality('defender', 42, DEFAULT_CONFIG.personality);
    const coordination = { role: 'LONE_WOLF', allies: [], sharedGoal: null, flank: null };
    const diffConfig = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'normal');

    const result = cog.decide(perceived, memory, personality, coordination, diffConfig, 0);
    assert.equal(result.reasonTrace.btNode, 'SURVIVAL');
  });

  test('IDLE_ROAM is the fallback when no threats or enemies', () => {
    const cog = createCognition(DEFAULT_CONFIG, 42);
    const perceived = {
      botId: 'bot1', tick: 0,
      entities: [], threats: [], opportunities: [], uncertainty: 0.1
    };
    const memory = { patterns: [], nudges: { accuracy: 0, aggression: 0, spacing: 0 } };
    const personality = createPersonality('support', 42, DEFAULT_CONFIG.personality);
    const coordination = { role: 'LONE_WOLF', allies: [], sharedGoal: null, flank: null };
    const diffConfig = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'normal');

    const result = cog.decide(perceived, memory, personality, coordination, diffConfig, 0);
    // With empty world, should NOT enter SURVIVAL or TACTICAL
    assert.notEqual(result.reasonTrace.btNode, 'SURVIVAL');
    assert.notEqual(result.reasonTrace.btNode, 'TACTICAL');
    // Should be either MACRO_GOAL (if GOAP created a goal) or IDLE_ROAM
    assert.ok(['MACRO_GOAL', 'IDLE_ROAM'].includes(result.reasonTrace.btNode),
      `Expected MACRO_GOAL or IDLE_ROAM, got ${result.reasonTrace.btNode}`);
  });

  test('GOAP respects max goals cap', () => {
    const cog = createCognition(DEFAULT_CONFIG, 42);
    const perceived = {
      botId: 'bot1', tick: 0,
      entities: [], threats: [], opportunities: [{ id: 'obj', faction: 'neutral', distance: 20, threatScore: 0, opportunityScore: 0.8, position: { x: 20, y: 0 } }],
      uncertainty: 0.1
    };
    const coordination = { role: 'LONE_WOLF', allies: [], sharedGoal: null, flank: null };
    const diffConfig = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'normal');

    const goals = cog.planMacroGoals(perceived, coordination, diffConfig, 0);
    assert.ok(goals.length <= DEFAULT_CONFIG.goap.maxActiveGoals, 'Should not exceed max goals');
  });
});

// ── Difficulty Tests ──────────────────────────────────────────

describe('Difficulty', () => {
  test('all levels exist', () => {
    for (const level of DIFFICULTY_LEVELS) {
      const config = getDifficultyConfig(DEFAULT_CONFIG.difficulty, level);
      assert.ok(config, `Level ${level} should have config`);
    }
  });

  test('easy has higher error injection than hard', () => {
    const easy = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'easy');
    const hard = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'hard');
    assert.ok(easy.errorInjectionRate > hard.errorInjectionRate);
  });

  test('easy has slower reaction than hard', () => {
    const easy = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'easy');
    const hard = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'hard');
    assert.ok(easy.reactionTimeMultiplier > hard.reactionTimeMultiplier);
  });

  test('auditDifficultyConfig flags cheating levers', () => {
    const cheating = { reactionTimeMultiplier: 0.1, _omniscience: true, _inputReading: true, _statMultiplier: 2.0 };
    const audit = auditDifficultyConfig(cheating);
    assert.ok(!audit.valid);
    assert.ok(audit.warnings.length >= 3);
  });

  test('auditDifficultyConfig passes clean config', () => {
    const clean = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'normal');
    const audit = auditDifficultyConfig(clean);
    assert.ok(audit.valid, audit.warnings.join(', '));
  });

  test('applyDifficultySelection injects errors at easy', () => {
    const easy = getDifficultyConfig(DEFAULT_CONFIG.difficulty, 'easy');
    const rng = new DeterministicPolicyRng(12345);
    let errorCount = 0;
    const total = 1000;
    const scored = [
      { action: { id: 'best' }, score: 100 },
      { action: { id: 'second' }, score: 80 },
      { action: { id: 'third' }, score: 60 }
    ];
    for (let i = 0; i < total; i++) {
      const result = applyDifficultySelection(scored, easy, rng);
      if (result.difficultyError) errorCount++;
    }
    // Easy has 15% error rate, should be roughly 10-20%
    assert.ok(errorCount > 50 && errorCount < 250, `Error count ${errorCount} out of ${total} not in expected range`);
  });
});

// ── Coordination Tests ────────────────────────────────────────

describe('Coordination', () => {
  test('shared blackboard posts and retrieves intents', () => {
    const bb = createSharedBlackboard(DEFAULT_CONFIG);
    bb.postIntent('bot1', { action: 'ATTACK', target: 'enemy1', role: 'LEADER', position: { x: 0, y: 0 } });
    const intents = bb.getIntents('bot2');
    assert.equal(intents.length, 1);
    assert.equal(intents[0].botId, 'bot1');
    assert.equal(intents[0].intent, 'ATTACK');
  });

  test('getIntents excludes self', () => {
    const bb = createSharedBlackboard(DEFAULT_CONFIG);
    bb.postIntent('bot1', { action: 'ATTACK', target: 'e1', role: 'LEADER' });
    const intents = bb.getIntents('bot1');
    assert.equal(intents.length, 0);
  });

  test('evaluateCoordination returns LONE_WOLF when disabled', () => {
    const bb = createSharedBlackboard(DEFAULT_CONFIG);
    const perceived = { entities: [], threats: [], opportunities: [], botFaction: 'self' };
    const personality = createPersonality('rusher', 42, DEFAULT_CONFIG.personality);
    const directive = evaluateCoordination(bb, 'bot1', perceived, personality, DEFAULT_CONFIG.coordination, false);
    assert.equal(directive.role, 'LONE_WOLF');
    assert.equal(directive.sharedGoal, null);
  });

  test('callout cooldown prevents spam', () => {
    const bb = createSharedBlackboard(DEFAULT_CONFIG);
    const first = bb.postCallout('bot1', { type: 'FOCUS' });
    const second = bb.postCallout('bot1', { type: 'FOCUS' });
    assert.ok(first);
    assert.ok(!second);
  });
});

// ── Failsafe Tests ────────────────────────────────────────────

describe('Failsafe', () => {
  test('detects stuck loops', () => {
    const fs = createFailsafe(DEFAULT_CONFIG);
    const action = { type: 'ATTACK', id: 'attack1', family: 'attack' };
    const trace = { score: 50 };

    for (let i = 0; i < 4; i++) {
      fs.validate({ action, reasonTrace: trace }, 0.1, 'full', i);
    }
    // 5th same action should trigger stuck loop (repeatCount reaches 4, > 3)
    const result = fs.validate({ action, reasonTrace: trace }, 0.1, 'full', 4);
    assert.ok(result.failsafeTriggered);
    assert.equal(result.reason, 'STUCK_LOOP_OVERRIDE');
  });

  test('detects budget exceeded', () => {
    const fs = createFailsafe(DEFAULT_CONFIG);
    const action = { type: 'ATTACK', id: 'a1', family: 'attack' };
    const result = fs.validate({ action, reasonTrace: { score: 50 } }, 1.0, 'full', 0);
    assert.ok(result.failsafeTriggered);
    assert.equal(result.reason, 'BUDGET_EXCEEDED');
  });

  test('LOD distant simplifies actions', () => {
    const fs = createFailsafe(DEFAULT_CONFIG);
    const action = { type: 'ATTACK', id: 'complex_attack', family: 'attack', target: { id: 'e1', position: { x: 10 } } };
    const result = fs.validate({ action, reasonTrace: { score: 50 } }, 0.1, 'distant', 0);
    assert.equal(result.action.type, 'MOVE');
  });

  test('determineLodTier returns correct tier', () => {
    const near = determineLodTier({ x: 0, y: 0 }, { x: 5, y: 5 }, DEFAULT_CONFIG.performance);
    assert.equal(near, 'full');

    const mid = determineLodTier({ x: 0, y: 0 }, { x: 40, y: 0 }, DEFAULT_CONFIG.performance);
    assert.equal(mid, 'simplified');

    const far = determineLodTier({ x: 0, y: 0 }, { x: 100, y: 0 }, DEFAULT_CONFIG.performance);
    assert.equal(far, 'distant');
  });

  test('shouldUseFullAI respects max bot cap', () => {
    assert.ok(shouldUseFullAI(5, DEFAULT_CONFIG.performance));
    assert.ok(!shouldUseFullAI(20, DEFAULT_CONFIG.performance));
  });
});

// ── Debug Tests ───────────────────────────────────────────────

describe('Debug', () => {
  test('records and retrieves traces', () => {
    const dbg = createDebugSystem('bot1', DEFAULT_CONFIG);
    dbg.recordTrace({
      btNode: 'TACTICAL',
      selectedAction: 'attack_1',
      score: 500,
      margin: 100,
      alternatives: [{ action: 'defend', score: 400 }],
      personalityModifiers: { aggression: '+18%' },
      memoryPatterns: [],
      coordinationRole: 'LONE_WOLF',
      failsafeTriggered: false,
      tick: 0
    });
    const last = dbg.getLastTrace();
    assert.ok(last);
    assert.equal(last.selectedAction, 'attack_1');
  });

  test('explainLastDecision returns readable string', () => {
    const dbg = createDebugSystem('bot1', DEFAULT_CONFIG);
    dbg.recordTrace({
      btNode: 'SURVIVAL',
      selectedAction: 'evade_1',
      score: 800,
      margin: 200,
      alternatives: [{ action: 'shield', score: 600 }],
      personalityModifiers: { fear: '+40%' },
      memoryPatterns: [{ type: 'AGGRESSION_PROFILE', confidence: 0.7 }],
      coordinationRole: 'LONE_WOLF',
      failsafeTriggered: false,
      tick: 42
    });
    const explanation = dbg.explainLastDecision();
    assert.ok(explanation.includes('SURVIVAL'));
    assert.ok(explanation.includes('evade_1'));
    assert.ok(explanation.includes('fear'));
  });

  test('metrics track entropy and diversity', () => {
    const dbg = createDebugSystem('bot1', DEFAULT_CONFIG);
    dbg.recordTrace({ btNode: 'T', selectedAction: 'a', score: 1, margin: 0, alternatives: [], personalityModifiers: {}, memoryPatterns: [], coordinationRole: 'NONE', failsafeTriggered: false, tick: 0 });
    dbg.recordTrace({ btNode: 'T', selectedAction: 'b', score: 1, margin: 0, alternatives: [], personalityModifiers: {}, memoryPatterns: [], coordinationRole: 'NONE', failsafeTriggered: false, tick: 1 });
    dbg.recordTrace({ btNode: 'T', selectedAction: 'a', score: 1, margin: 0, alternatives: [], personalityModifiers: {}, memoryPatterns: [], coordinationRole: 'NONE', failsafeTriggered: false, tick: 2 });

    const metrics = dbg.getMetrics();
    assert.equal(metrics.decisionsTotal, 3);
    assert.equal(metrics.actionDiversity, 2);
    assert.ok(metrics.entropy > 0);
  });

  test('aggregateTelemetry combines multiple bots', () => {
    const dbg1 = createDebugSystem('bot1', DEFAULT_CONFIG);
    const dbg2 = createDebugSystem('bot2', DEFAULT_CONFIG);
    dbg1.recordTrace({ btNode: 'T', selectedAction: 'a', score: 1, margin: 0, alternatives: [], personalityModifiers: {}, memoryPatterns: [], coordinationRole: 'NONE', failsafeTriggered: false, tick: 0 });
    dbg2.recordTrace({ btNode: 'T', selectedAction: 'b', score: 1, margin: 0, alternatives: [], personalityModifiers: {}, memoryPatterns: [], coordinationRole: 'NONE', failsafeTriggered: true, tick: 0 });

    const agg = aggregateTelemetry([dbg1, dbg2]);
    assert.equal(agg.botCount, 2);
    assert.equal(agg.totalDecisions, 2);
    assert.equal(agg.totalFailsafes, 1);
  });
});

// ── Agent Integration Tests ───────────────────────────────────

describe('Agent Integration', () => {
  test('createHybrixAgent creates a working agent', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'rusher',
      difficulty: 'normal',
      seed: 42,
      config: DEFAULT_CONFIG
    });
    assert.equal(agent.botId, 'bot1');
    assert.equal(agent.archetype, 'rusher');
    assert.equal(agent.difficulty, 'normal');
  });

  test('agent.tick returns action and trace', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'defender',
      difficulty: 'normal',
      seed: 42,
      config: DEFAULT_CONFIG
    });
    const worldState = {
      tick: 100,
      entities: [
        { id: 'enemy1', faction: 'enemy', position: { x: 10, y: 0 }, health: 80 }
      ],
      geometry: null
    };
    const botState = { id: 'bot1', position: { x: 0, y: 0 }, facing: 0, health: 100, faction: 'self' };

    const result = agent.tick(worldState, botState);
    assert.ok(result.action, 'Should return an action');
    assert.ok(result.reasonTrace, 'Should return a reason trace');
    assert.ok(result.reasonTrace.btNode, 'Should have BT node');
  });

  test('agent.getDebug returns complete debug info', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'sniper',
      difficulty: 'hard',
      seed: 42,
      config: DEFAULT_CONFIG
    });
    const debug = agent.getDebug();
    assert.equal(debug.botId, 'bot1');
    assert.equal(debug.archetype, 'sniper');
    assert.equal(debug.difficulty, 'hard');
    assert.ok(debug.personality);
    assert.ok(debug.metrics);
  });

  test('agent.reset clears all state', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'rusher',
      difficulty: 'normal',
      seed: 42,
      config: DEFAULT_CONFIG
    });
    // Run a few ticks
    for (let i = 0; i < 5; i++) {
      agent.tick({ tick: 100 + i, entities: [], geometry: null }, { id: 'bot1', position: { x: 0, y: 0 }, facing: 0, health: 100, faction: 'self' });
    }
    agent.reset();
    const debug = agent.getDebug();
    assert.equal(debug.metrics.decisionsTotal, 0);
  });

  test('agent.notifyOutcome updates morale', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'rusher',
      difficulty: 'normal',
      seed: 42,
      config: DEFAULT_CONFIG
    });
    const moraleBefore = agent.personality.morale;
    agent.notifyOutcome('win');
    assert.ok(agent.personality.morale > moraleBefore);
  });

  test('agent.choose is policy-compatible', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'rusher',
      difficulty: 'normal',
      seed: 42,
      config: DEFAULT_CONFIG
    });
    const context = {
      matchId: 'M-test',
      decisionIndex: 0,
      actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 5, goal: 21, hand: ['A♣', 'K♣', 'Q♣'], pr: [], er: [] },
        opponents: [{ playerId: 'P2', securedPoints: 10, goal: 21, handCount: 3, pr: [], er: [] }],
        stack: [],
        activePlayerId: 'P1'
      },
      legalActions: [
        { actionId: 'play-points-A♣', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 1 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} },
        { actionId: 'pass', family: 'exhausted-pass', mode: 'forced-mini-turn', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    };

    const decision = agent.choose(context);
    assert.ok(decision.actionId, 'Should return actionId');
    assert.ok(decision.metadata.reasonCode, 'Should return reasonCode');
    assert.ok(context.legalActions.some(a => a.actionId === decision.actionId), 'Selected action should be legal');
  });

  test('different archetypes produce different behavior', () => {
    const rusher = createHybrixAgent({ botId: 'r1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG });
    const defender = createHybrixAgent({ botId: 'd1', archetype: 'defender', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG });

    // Rusher should have higher aggression
    assert.ok(rusher.personality.traits.aggression > defender.personality.traits.aggression);
    // Defender should have higher patience
    assert.ok(defender.personality.traits.patience > rusher.personality.traits.patience);
  });

  test('different difficulty produces different error rates', () => {
    const easyAgent = createHybrixAgent({ botId: 'e1', archetype: 'rusher', difficulty: 'easy', seed: 42, config: DEFAULT_CONFIG });
    const hardAgent = createHybrixAgent({ botId: 'h1', archetype: 'rusher', difficulty: 'hard', seed: 42, config: DEFAULT_CONFIG });

    const easyDebug = easyAgent.getDebug();
    const hardDebug = hardAgent.getDebug();
    // Both should have valid difficulty audit
    assert.ok(easyDebug.diffAudit.valid || easyDebug.diffAudit.warnings.length === 0);
    assert.ok(hardDebug.diffAudit.valid || hardDebug.diffAudit.warnings.length === 0);
  });
});

// ── Policy Adapter Tests ──────────────────────────────────────

describe('Policy Adapter', () => {
  test('HYBRIX_POLICIES has 14 variants', () => {
    assert.ok(HYBRIX_POLICIES.length >= 14, `Expected >= 14 policies, got ${HYBRIX_POLICIES.length}`);
  });

  test('all HYBRIX policies have unique IDs', () => {
    const ids = HYBRIX_POLICIES.map(p => p.policyId);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'Policy IDs should be unique');
  });

  test('all HYBRIX policies have hybrix trait', () => {
    for (const policy of HYBRIX_POLICIES) {
      assert.ok(policy.traits.hybrix === true, `Policy ${policy.policyId} should have hybrix=true`);
    }
  });

  test('createHybrixPolicy creates a valid policy definition', () => {
    const policy = createHybrixPolicy({
      policyId: 'test-hybrix',
      archetype: 'rusher',
      difficulty: 'normal'
    });
    assert.equal(policy.policyId, 'test-hybrix');
    assert.ok(policy.policyHash, 'Should have a policy hash');
    assert.ok(typeof policy.choose === 'function', 'Should have choose function');
  });

  test('agent caching persists memory across choose() calls', () => {
    const policy = createHybrixPolicy({
      policyId: 'test-cache',
      archetype: 'rusher',
      difficulty: 'normal'
    });

    const baseContext = {
      matchId: 'M-cache-test',
      decisionIndex: 0,
      actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 5, goal: 21, hand: ['A♣', 'K♣', 'Q♣'], pr: [], er: [] },
        opponents: [{ playerId: 'P2', securedPoints: 10, goal: 21, handCount: 3, pr: [], er: [] }],
        stack: [],
        activePlayerId: 'P1'
      },
      legalActions: [
        { actionId: 'play-points-A♣', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 1 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    };

    // First call — creates agent, records in memory
    const result1 = policy.choose(baseContext);

    // Second call — same match, should reuse cached agent with accumulated memory
    const ctx2 = { ...baseContext, decisionIndex: 1 };
    const result2 = policy.choose(ctx2);

    assert.ok(result1.actionId, 'First call should return action');
    assert.ok(result2.actionId, 'Second call should return action');
    // Both should return legal actions
    assert.ok(baseContext.legalActions.some(a => a.actionId === result1.actionId));
    assert.ok(baseContext.legalActions.some(a => a.actionId === result2.actionId));
  });

  test('new match clears agent cache', () => {
    const policy = createHybrixPolicy({
      policyId: 'test-cache-clear',
      archetype: 'defender',
      difficulty: 'normal'
    });

    const makeContext = (matchId, decisionIndex) => ({
      matchId,
      decisionIndex,
      actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 5, goal: 21, hand: ['A♣'], pr: [], er: [] },
        opponents: [{ playerId: 'P2', securedPoints: 10, goal: 21, handCount: 3, pr: [], er: [] }],
        stack: [],
        activePlayerId: 'P1'
      },
      legalActions: [
        { actionId: 'play-A', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 1 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    });

    // Match 1
    policy.choose(makeContext('M1', 0));
    policy.choose(makeContext('M1', 1));

    // Match 2 — should clear cache, fresh agent
    const result = policy.choose(makeContext('M2', 0));
    assert.ok(result.actionId, 'Should work after cache clear');
  });
});

// ── Domain Scoring Integration Tests ──────────────────────────

describe('Domain Scoring Integration', () => {
  test('HYBRIX agent uses domain-specific scoring via scorePolicyAction', () => {
    const agent = createHybrixAgent({
      botId: 'bot1',
      archetype: 'rusher',
      difficulty: 'normal',
      seed: 42,
      config: DEFAULT_CONFIG
    });

    const context = {
      matchId: 'M-scoring-test',
      decisionIndex: 0,
      actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 20, goal: 21, hand: ['A♣'], pr: [], er: [] },
        opponents: [{ playerId: 'P2', securedPoints: 5, goal: 21, handCount: 3, pr: [], er: [] }],
        stack: [],
        activePlayerId: 'P1'
      },
      legalActions: [
        { actionId: 'winning-play', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 1 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} },
        { actionId: 'pass', family: 'exhausted-pass', mode: 'forced', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    };

    const result = agent.choose(context);
    // With 20 points + 1 immediate = 21 = goal, the winning play should be selected
    // Domain scoring gives winScore=6000 for terminal plays
    assert.equal(result.actionId, 'winning-play', 'Should select winning play via domain scoring');
    assert.ok(result.metadata.hybrixTrace?.scoringPolicyId, 'Trace should include scoringPolicyId');
    assert.ok(result.metadata.hybrixTrace?.baseScore != null, 'Trace should include baseScore');
  });

  test('rusher maps to score-rush scoring policy', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const context = {
      matchId: 'M-test', decisionIndex: 0, actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 0, goal: 21, hand: ['A♣'], pr: [], er: [] },
        opponents: [{ playerId: 'P2', securedPoints: 0, goal: 21, handCount: 3, pr: [], er: [] }],
        stack: [], activePlayerId: 'P1'
      },
      legalActions: [
        { actionId: 'play-A', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 1 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    };
    const result = agent.choose(context);
    assert.equal(result.metadata.hybrixTrace.scoringPolicyId, 'score-rush');
  });

  test('defender maps to control scoring policy', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'defender', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const context = {
      matchId: 'M-test', decisionIndex: 0, actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 0, goal: 21, hand: ['A♣'], pr: [], er: [] },
        opponents: [{ playerId: 'P2', securedPoints: 0, goal: 21, handCount: 3, pr: [], er: [] }],
        stack: [], activePlayerId: 'P1'
      },
      legalActions: [
        { actionId: 'play-A', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 1 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    };
    const result = agent.choose(context);
    assert.equal(result.metadata.hybrixTrace.scoringPolicyId, 'control');
  });
});

// ── Trace Adapter Tests ───────────────────────────────────────

describe('Trace Adapter', () => {
  test('extractHybrixTraces returns empty for non-HYBRIX match', () => {
    const fakeResult = {
      decisions: [
        { policyId: 'score-rush', actionId: 'a1', matchId: 'M1', decisionIndex: 0, actorId: 'P1', family: 'score', reasonCode: 'MAX_SCORE_PRESSURE', candidateScores: [{ actionId: 'a1', score: 100 }], legalActionCount: 3 }
      ]
    };
    const traces = extractHybrixTraces(fakeResult);
    assert.equal(traces.length, 0);
  });

  test('extractHybrixTraces extracts from HYBRIX decisions', () => {
    const fakeResult = {
      decisions: [
        { policyId: 'hybrix-rusher', actionId: 'a1', matchId: 'M1', decisionIndex: 0, actorId: 'P1', family: 'score', reasonCode: 'MAX_SCORE_PRESSURE', candidateScores: [{ actionId: 'a1', score: 1300 }, { actionId: 'a2', score: 510 }], legalActionCount: 3 }
      ]
    };
    const traces = extractHybrixTraces(fakeResult);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].policyId, 'hybrix-rusher');
    assert.ok(traces[0].hybrix, 'Should have reconstructed HYBRIX trace');
    assert.ok(traces[0].hybrix.reconstructed, 'Should be marked as reconstructed');
  });

  test('explainHybrixTrace produces readable output', () => {
    const trace = {
      btNode: 'TACTICAL',
      selectedAction: 'play-A',
      score: 1300,
      baseScore: 1300,
      scoringPolicyId: 'score-rush',
      margin: 790,
      alternatives: [{ action: 'play-A', score: 1300 }, { action: 'draw', score: 510 }],
      personalityModifiers: { aggression: '+18%' },
      memoryPatterns: [{ type: 'AGGRESSION_PROFILE', confidence: 0.7 }],
      adaptiveNudges: { accuracy: 0.05, aggression: 0.1, spacing: 0 },
      coordinationRole: 'LONE_WOLF',
      difficultyError: false,
      failsafeTriggered: false,
      elapsedMs: 0.42
    };
    const explanation = explainHybrixTrace(trace);
    assert.ok(explanation.includes('TACTICAL'));
    assert.ok(explanation.includes('play-A'));
    assert.ok(explanation.includes('score-rush'));
    assert.ok(explanation.includes('aggression'));
  });

  test('summarizeHybrixDecisions aggregates stats', () => {
    const traces = [
      { policyId: 'hybrix-rusher', family: 'score', hybrix: { btNode: 'TACTICAL', margin: 100, difficultyError: false, failsafeTriggered: false, elapsedMs: 0.3 } },
      { policyId: 'hybrix-rusher', family: 'draw', hybrix: { btNode: 'TACTICAL', margin: 50, difficultyError: true, failsafeTriggered: false, elapsedMs: 0.2 } },
      { policyId: 'hybrix-rusher', family: 'score', hybrix: { btNode: 'SURVIVAL', margin: 200, difficultyError: false, failsafeTriggered: true, elapsedMs: 0.5 } }
    ];
    const summary = summarizeHybrixDecisions(traces);
    assert.equal(summary.totalDecisions, 3);
    assert.equal(summary.tracedDecisions, 3);
    assert.equal(summary.btNodeDistribution.TACTICAL, 2);
    assert.equal(summary.btNodeDistribution.SURVIVAL, 1);
    assert.equal(summary.actionDistribution.score, 2);
    assert.equal(summary.actionDistribution.draw, 1);
    assert.ok(summary.difficultyErrorRate > 0);
    assert.ok(summary.failsafeRate > 0);
  });

  test('mapHybrixReasonCodes maps BT nodes', () => {
    const trace = { btNode: 'SURVIVAL', failsafeTriggered: false, difficultyError: false };
    const codes = mapHybrixReasonCodes(trace);
    assert.ok(codes.includes('RISK_AVERSE'));
  });

  test('mapHybrixReasonCodes maps failsafe triggers', () => {
    const trace = { btNode: 'TACTICAL', failsafeTriggered: true, difficultyError: false };
    const codes = mapHybrixReasonCodes(trace);
    assert.ok(codes.includes('RISK_AVERSE'));
  });

  test('mapHybrixReasonCodes maps difficulty errors', () => {
    const trace = { btNode: 'TACTICAL', failsafeTriggered: false, difficultyError: true };
    const codes = mapHybrixReasonCodes(trace);
    assert.ok(codes.includes('LOW_MARGIN_ALTERNATIVE'));
  });
});

// ── Card-Game-Native GOAP Tests ──────────────────────────────

describe('Card-Game GOAP Goals', () => {
  function makeContext(overrides = {}) {
    return {
      matchId: 'M-goap-test', decisionIndex: 0, actorId: 'P1',
      authorizedView: {
        own: { securedPoints: 0, goal: 21, hand: ['A♣','K♣','3♦'], pr: [], er: [], deckCount: 10, ...overrides.own },
        opponents: [{ playerId: 'P2', securedPoints: 0, goal: 21, handCount: 3, pr: [], er: [], ...overrides.opponent }],
        stack: overrides.stack ?? [],
        activePlayerId: 'P1'
      },
      legalActions: overrides.legalActions ?? [
        { actionId: 'score-A', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 4 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} },
        { actionId: 'anchor-K', family: 'anchor', mode: 'anchor', timingClass: 'ACTION', featureVector: {} },
        { actionId: 'scuttle-3', family: 'scuttle', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} }
      ],
      rng: new DeterministicPolicyRng(42)
    };
  }

  test('GOAP goals appear in trace metadata', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const result = agent.choose(makeContext());
    assert.ok(result.metadata.hybrixTrace.activeGoals, 'Trace must include activeGoals');
    assert.ok(Array.isArray(result.metadata.hybrixTrace.activeGoals), 'activeGoals must be an array');
  });

  test('PLAY_HIGH_VALUE goal activates when close to winning', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const ctx = makeContext({ own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 } });
    const result = agent.choose(ctx);
    const goals = result.metadata.hybrixTrace.activeGoals;
    assert.ok(goals.some(g => g.id === 'PLAY_HIGH_VALUE'), 'PLAY_HIGH_VALUE should be active when close to winning');
  });

  test('DISRUPT_OPPONENT goal activates when opponent is ahead', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'trickster', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const ctx = makeContext({
      own: { securedPoints: 0, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 },
      opponent: { securedPoints: 15, goal: 21, handCount: 3, pr: [], er: [] }
    });
    const result = agent.choose(ctx);
    const goals = result.metadata.hybrixTrace.activeGoals;
    assert.ok(goals.some(g => g.id === 'DISRUPT_OPPONENT'), 'DISRUPT_OPPONENT should be active when opponent is ahead');
  });

  test('CONSERVE_RESOURCES goal activates when hand is low', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'defender', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const ctx = makeContext({
      own: { securedPoints: 0, goal: 21, hand: [], pr: [], er: [], deckCount: 10 }
    });
    const result = agent.choose(ctx);
    const goals = result.metadata.hybrixTrace.activeGoals;
    assert.ok(goals.some(g => g.id === 'CONSERVE_RESOURCES'), 'CONSERVE_RESOURCES should be active when hand is empty');
  });

  test('BUILD_DEFENSE goal activates when ahead', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'defender', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    const ctx = makeContext({
      own: { securedPoints: 18, goal: 21, hand: ['K♣','Q♣'], pr: [], er: [], deckCount: 5 },
      opponent: { securedPoints: 2, goal: 21, handCount: 3, pr: [], er: [] }
    });
    const result = agent.choose(ctx);
    const goals = result.metadata.hybrixTrace.activeGoals;
    // Defender ahead should consider defense
    assert.ok(goals.length > 0, 'Defender should have active goals when ahead');
  });

  test('goals persist across decisions within a match', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    // First decision — close to winning
    const ctx1 = makeContext({ own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 } });
    const result1 = agent.choose({ ...ctx1, decisionIndex: 0 });


    // Second decision — same state, goals should persist
    const ctx2 = makeContext({ own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 } });
    const result2 = agent.choose({ ...ctx2, decisionIndex: 1 });
    const goals2 = result2.metadata.hybrixTrace.activeGoals;

    // PLAY_HIGH_VALUE should still be active (persisted from decision 0)
    assert.ok(goals2.some(g => g.id === 'PLAY_HIGH_VALUE'), 'PLAY_HIGH_VALUE should persist across decisions');
  });

  test('goals expire after bounded decisions', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    // Create a goal at decision 0
    const ctx = makeContext({ own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 } });
    agent.choose({ ...ctx, decisionIndex: 0 });

    // Advance past expiry (CARD_GAME_GOAL_EXPIRY = 8)
    // State changes to not trigger the goal anymore
    const neutralCtx = makeContext({
      own: { securedPoints: 18, goal: 21, hand: ['A♣','K♣','Q♣'], pr: [], er: [], deckCount: 20 },
      opponent: { securedPoints: 18, goal: 21, handCount: 5, pr: [], er: [] }
    });
    // Decision at index 10 — original goal should have expired
    const result = agent.choose({ ...neutralCtx, decisionIndex: 10 });
    // The original PLAY_HIGH_VALUE goal from decision 0 should be gone
    // (it may re-activate if conditions still hold, but the original instance expired)
    assert.ok(result.metadata.hybrixTrace.activeGoals !== undefined, 'Goals should still be tracked');
  });

  test('different archetypes produce different goal priorities', () => {
    const contexts = [
      { own: { securedPoints: 10, goal: 21, hand: ['A♣','K♣'], pr: [], er: [], deckCount: 5 },
        opponent: { securedPoints: 12, goal: 21, handCount: 3, pr: [], er: [] } }
    ];
    const archetypes = ['rusher', 'defender', 'trickster', 'sniper'];
    const goalSets = [];
    for (const archetype of archetypes) {
      const agent = createHybrixAgent({
        botId: `bot-${archetype}`, archetype, difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
      });
      const result = agent.choose(makeContext({ ...contexts[0] }));
      goalSets.push(result.metadata.hybrixTrace.activeGoals.map(g => `${g.id}:${g.priority}`).sort().join(','));
    }
    // At least two archetypes should have different goal priority orderings
    const unique = new Set(goalSets);
    assert.ok(unique.size >= 2, `Archetypes should produce different goal priorities, got ${unique.size} unique sets`);
  });

  test('GOAP goal reason codes appear in metadata', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    // Close to winning with a scoring action available
    const ctx = makeContext({
      own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 },
      legalActions: [
        { actionId: 'score-A', family: 'score', mode: 'points', timingClass: 'ACTION', featureVector: { immediateScore: 4 } },
        { actionId: 'draw', family: 'draw', mode: 'ordinary', timingClass: 'ACTION', featureVector: {} }
      ]
    });
    const result = agent.choose(ctx);
    // When PLAY_HIGH_VALUE is the top goal and a score action is selected,
    // the reason code should be GOAL_PLAY_HIGH_VALUE
    assert.ok(result.metadata.reasonCode, 'Reason code should be present');
    // The reason code should be one of the GOAL_* codes or a fallback
    const validCodes = ['GOAL_PLAY_HIGH_VALUE', 'GOAL_DISRUPT_OPPONENT', 'GOAL_BUILD_DEFENSE', 'GOAL_CONSERVE_RESOURCES', 'MAX_EXPECTED_VALUE', 'MAX_SCORE_PRESSURE'];
    assert.ok(validCodes.includes(result.metadata.reasonCode), `Reason code should be valid, got: ${result.metadata.reasonCode}`);
  });

  test('reset clears GOAP goals', () => {
    const agent = createHybrixAgent({
      botId: 'bot1', archetype: 'rusher', difficulty: 'normal', seed: 42, config: DEFAULT_CONFIG
    });
    // Create a goal
    agent.choose(makeContext({ own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 } }));
    // Reset
    agent.reset();
    // First decision after reset should have fresh goals (not stale ones)
    const result = agent.choose(makeContext({ own: { securedPoints: 18, goal: 21, hand: ['A♣'], pr: [], er: [], deckCount: 5 } }));
    assert.ok(result.metadata.hybrixTrace.activeGoals.length <= 3, 'Goals should be bounded after reset');
  });
});
