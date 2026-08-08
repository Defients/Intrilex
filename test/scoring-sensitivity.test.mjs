import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORING_WEIGHTS, createScoringWeights, scoringWeightsHash, scorePolicyAction, rankPolicyActions } from '@intrilex/policies';

// ── Synthetic action/context fixtures for sensitivity testing ──
const makeContext = (overrides = {}) => ({
  actorId: 'P1',
  authorizedView: {
    own: { hand: ['A','2','3','4','5'], securedPoints: 0, goal: 100, ...overrides.own },
    stack: overrides.stack ?? [],
    knownCards: overrides.knownCards ?? {}
  }
});

const makeAction = (overrides = {}) => ({
  actionId: overrides.actionId ?? 'test-action',
  family: overrides.family ?? 'scuttle',
  mode: overrides.mode ?? [],
  targetHandles: overrides.targetHandles ?? [],
  sourceHandles: overrides.sourceHandles ?? [],
  featureVector: overrides.featureVector ?? {},
  timingClass: overrides.timingClass ?? 'NORMAL',
  ...overrides.extra
});

// ── Weight parameterization tests ──
test('createScoringWeights returns defaults when no overrides given', () => {
  const w = createScoringWeights();
  assert.deepEqual(w, SCORING_WEIGHTS);
});

test('createScoringWeights applies top-level overrides', () => {
  const w = createScoringWeights({ phase: 9999 });
  assert.equal(w.phase, 9999);
  assert.equal(w.choice.base.value, SCORING_WEIGHTS.choice.base.value, 'non-overridden keys preserved');
});

test('createScoringWeights deep-merges nested objects', () => {
  const w = createScoringWeights({ choice: { base: { value: 999 } } });
  assert.equal(w.choice.base.value, 999, 'overridden nested value applied');
  assert.equal(w.choice.base.tempo, SCORING_WEIGHTS.choice.base.tempo, 'sibling nested value preserved');
  assert.equal(w.choice.valueMultiplier, SCORING_WEIGHTS.choice.valueMultiplier, 'parent-level sibling preserved');
});

test('scoringWeightsHash is deterministic', () => {
  const h1 = scoringWeightsHash(SCORING_WEIGHTS);
  const h2 = scoringWeightsHash(SCORING_WEIGHTS);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test('scoringWeightsHash differs for different weights', () => {
  const h1 = scoringWeightsHash(SCORING_WEIGHTS);
  const h2 = scoringWeightsHash(createScoringWeights({ phase: 9999 }));
  assert.notEqual(h1, h2, 'different weights must produce different hashes');
});

// ── Sensitivity analysis: perturbing weights changes action rankings ──
test('sensitivity: perturbing scuttle targetMultiplier changes scuttle scores', () => {
  const ctx = makeContext({ knownCards: { 'target-1': { pointValue: 5 } } });
  const action = makeAction({
    family: 'scuttle',
    targetHandles: ['target-1'],
    featureVector: { targetPointValue: 5, sourcePointValue: 2 }
  });

  const defaultScore = scorePolicyAction('control', action, ctx);
  const perturbedWeights = createScoringWeights({ scuttle: { targetMultiplier: 100 } });
  const perturbedScore = scorePolicyAction('control', action, ctx, perturbedWeights);

  assert.ok(perturbedScore > defaultScore,
    `perturbed targetMultiplier=100 should increase scuttle score (default=${defaultScore}, perturbed=${perturbedScore})`);
});

test('sensitivity: perturbing phase weight changes phase action score', () => {
  const action = makeAction({ family: 'phase' });
  const ctx = makeContext();

  const defaultScore = scorePolicyAction('control', action, ctx);
  const perturbedWeights = createScoringWeights({ phase: 10000 });
  const perturbedScore = scorePolicyAction('control', action, ctx, perturbedWeights);

  assert.equal(defaultScore, 5000, 'default phase weight is 5000');
  assert.equal(perturbedScore, 10000, 'perturbed phase weight is 10000');
});

test('sensitivity: perturbing exhaustedPass weight changes exhausted-pass score', () => {
  const action = makeAction({ family: 'exhausted-pass' });
  const ctx = makeContext();

  const defaultScore = scorePolicyAction('control', action, ctx);
  const perturbedWeights = createScoringWeights({ exhaustedPass: -500 });
  const perturbedScore = scorePolicyAction('control', action, ctx, perturbedWeights);

  assert.equal(defaultScore, -100, 'default exhaustedPass is -100');
  assert.equal(perturbedScore, -500, 'perturbed exhaustedPass is -500');
});

test('sensitivity: rank order changes when weights shift', () => {
  // Create two actions: one scuttle, one draw
  const ctx = makeContext({
    own: { hand: ['A','2','3','4','5'], securedPoints: 0, goal: 100 },
    knownCards: { 'target-1': { pointValue: 10 } }
  });
  const scuttleAction = makeAction({
    actionId: 'scuttle-1',
    family: 'scuttle',
    targetHandles: ['target-1'],
    featureVector: { targetPointValue: 10, sourcePointValue: 3 }
  });
  const drawAction = makeAction({
    actionId: 'draw-1',
    family: 'draw'
  });

  // With default weights, scuttle should score higher than draw for 'control'
  const defaultRanking = rankPolicyActions('control', [scuttleAction, drawAction], ctx);
  const defaultTop = defaultRanking[0].action.actionId;

  // With heavily boosted draw weights, draw should score higher
  const boostedDrawWeights = createScoringWeights({ draw: { lowHandScore: 5000, defaultScore: 5000, tempoScore: 5000 } });
  const perturbedRanking = rankPolicyActions('control', [scuttleAction, drawAction], ctx, boostedDrawWeights);
  const perturbedTop = perturbedRanking[0].action.actionId;

  assert.ok(defaultTop !== perturbedTop,
    `ranking should change when weights shift (default top=${defaultTop}, perturbed top=${perturbedTop})`);
});

test('sensitivity: ±10% perturbation of all multipliers keeps ranking stable (robustness)', () => {
  // A well-calibrated scoring system should be robust to small perturbations.
  // If a ±10% shift in all multipliers flips the ranking, the weights are
  // on a knife-edge and need recalibration.
  const ctx = makeContext({
    knownCards: { 'target-1': { pointValue: 7 } }
  });
  const actions = [
    makeAction({ actionId: 'scuttle-A', family: 'scuttle', targetHandles: ['target-1'], featureVector: { targetPointValue: 7, sourcePointValue: 2 } }),
    makeAction({ actionId: 'scuttle-B', family: 'scuttle', targetHandles: ['target-1'], featureVector: { targetPointValue: 5, sourcePointValue: 1 } })
  ];

  const defaultRanking = rankPolicyActions('control', actions, ctx).map(r => r.action.actionId);

  // Perturb all multipliers by +10%
  const plus10 = createScoringWeights({
    scuttle: { targetMultiplier: SCORING_WEIGHTS.scuttle.targetMultiplier * 1.1 }
  });
  const plus10Ranking = rankPolicyActions('control', actions, ctx, plus10).map(r => r.action.actionId);

  // Perturb all multipliers by -10%
  const minus10 = createScoringWeights({
    scuttle: { targetMultiplier: SCORING_WEIGHTS.scuttle.targetMultiplier * 0.9 }
  });
  const minus10Ranking = rankPolicyActions('control', actions, ctx, minus10).map(r => r.action.actionId);

  assert.deepEqual(defaultRanking, plus10Ranking, '+10% perturbation should not change ranking');
  assert.deepEqual(defaultRanking, minus10Ranking, '-10% perturbation should not change ranking');
});
