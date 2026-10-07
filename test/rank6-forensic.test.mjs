import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRankStrategy } from '../packages/game-ai/src/rank-strategy.mjs';
import { privateChoiceScore, actionModeSupported } from '../packages/policies/src/action-evaluation.mjs';
import {
  emptyParticipantVariantCounters,
  applyStateDeltaToVariantCounters,
  computeVariantMetrics
} from '../packages/telemetry/src/rank-telemetry.mjs';
import { createDecisionTrace } from '../packages/decision-intelligence/src/decision-trace.mjs';
import { actionFixture } from '../packages/policies/test/action-fixtures.mjs';
import {
  createSimulationDecisionFrame,
  executeSimulationAction,
  strictPolicyView
} from '../packages/engine-adapter/src/adapter.mjs';
import { rankPolicyActions } from '../packages/policies/src/index.mjs';

// ── Shared fixtures ──────────────────────────────────────────
const card = (id, identity, zone = 'P1_HAND') => ({
  id, identity, pointValue: Number.isNaN(Number(identity.replace(/[♣♦♥♠]/gu, '')))
    ? { A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[identity] ?? 0
    : Number(identity.replace(/[♣♦♥♠]/gu, '')),
  controllerId: 'P1', zone
});

const strategyContext = ({ hand = [], securedPoints = 0, goal = 21, opponents = 0 } = {}) => ({
  actorId: 'P1',
  authorizedView: {
    own: { hand, securedPoints, goal, pr: [], er: [] },
    opponents: [{ playerId: 'P2', securedPoints: opponents, goal: 21, handCount: 3, pr: [], er: [] }],
    knownCards: Object.fromEntries(hand.map(c => [c.id, c])),
    dpCount: 20
  }
});

const six = card('six', '6♣');
const digAction = {
  actionId: 'dig', family: 'effect-private-choice', mode: 'six-dig',
  sourceHandles: ['six'], targetHandles: [], featureVector: { privateChoice: true, drawCount: 3 }
};
const scoreSix = {
  actionId: 'score6', family: 'score', mode: 'points',
  sourceHandles: ['six'], targetHandles: [], featureVector: { immediatePoints: 6 }
};

// ── Rank 6 valuation parity ──────────────────────────────────
test('Six Dig receives dedicated resource/filter valuation', () => {
  const ctx = strategyContext({ hand: [six, card('two', '2♦'), card('three', '3♣')] });
  const { adjustment, reasonCodes } = evaluateRankStrategy(digAction, ctx, {});
  assert.ok(adjustment > 0, `expected positive adjustment, got ${adjustment}`);
  assert.ok(reasonCodes.includes('SIX_DIG_FILTERED_RESOURCE_VALUE'));
});

test('Six Dig valuation scales with advertised draw depth', () => {
  const ctx = strategyContext({ hand: [six, card('two', '2♦')] });
  const shallow = evaluateRankStrategy({ ...digAction, featureVector: { privateChoice: true, drawCount: 1 } }, ctx, {}).adjustment;
  const deep = evaluateRankStrategy({ ...digAction, featureVector: { privateChoice: true, drawCount: 3 } }, ctx, {}).adjustment;
  assert.ok(deep > shallow, `expected deeper dig to score higher (${deep} !> ${shallow})`);
});

test('Scoring a 6 carries a filter-option conservation penalty', () => {
  const ctx = strategyContext({ hand: [six, card('two', '2♦'), card('three', '3♣')] });
  const { adjustment, reasonCodes } = evaluateRankStrategy(scoreSix, ctx, {});
  assert.ok(adjustment < 0);
  assert.ok(reasonCodes.includes('PRESERVE_SIX_FILTER_OPTION'));
});

// ── Private-choice quality ───────────────────────────────────
const digView = ({ hand, drawn, miniTurns = 1 }) => ({
  actorId: 'P1',
  authorizedView: {
    own: { hand: hand.map(c => c.id), securedPoints: 0, goal: 21, pr: [], er: [], limits: { miniTurnsRemaining: miniTurns } },
    opponents: [{ playerId: 'P2', securedPoints: 0, goal: 21, handCount: 3 }],
    knownCards: Object.fromEntries([...hand, ...drawn].map(c => [c.id, c])),
    pendingChoice: { kind: 'core-rank6-dig', context: { drawnCardIds: drawn.map(c => c.id) } }
  }
});
const keepReturn = (mode, keptIds) => ({ family: 'private-choice', mode, targetHandles: keptIds, featureVector: { keepCount: 2 } });
const keepAllDiscard = (discardId) => ({ family: 'private-choice', mode: 'rank6-keep-all-discard', targetHandles: [discardId], featureVector: { keepAll: true, discard: true } });

test('Six private choice prefers stronger retained card sets', () => {
  const drawn = [card('d1', '7♥', 'VOID'), card('d2', '3♦', 'VOID'), card('d3', '4♠', 'VOID')];
  const ctx = digView({ hand: [card('h1', '2♣')], drawn, miniTurns: 0 });
  const strong = privateChoiceScore(keepReturn('rank6-keep-return-bottom', ['d1', 'd3']), ctx);
  const weak = privateChoiceScore(keepReturn('rank6-keep-return-bottom', ['d2', 'd3']), ctx);
  assert.ok(strong > weak, `expected keep 7♥+4♠ > keep 3♦+4♠ (${strong} !> ${weak})`);
});

test('Six does not discard a premium card when an inferior discard exists', () => {
  const drawn = [card('d1', '7♥', 'VOID'), card('d2', '3♦', 'VOID'), card('d3', '4♠', 'VOID')];
  const hand = [card('h1', '2♦'), card('h2', 'A♠'), card('h3', '3♣')];
  const ctx = digView({ hand, drawn });
  const cheap = privateChoiceScore(keepAllDiscard('h3'), ctx);
  const premium = privateChoiceScore(keepAllDiscard('h2'), ctx);
  assert.ok(cheap > premium, `expected discard 3♣ > discard A♠ (${cheap} !> ${premium})`);
});

test('Six return placement prefers top when a draw remains, bottom when not', () => {
  const drawn = [card('d1', '7♥', 'VOID'), card('d2', '3♦', 'VOID'), card('d3', '4♠', 'VOID')];
  const kept = ['d2', 'd3']; // returns the valuable 7♥
  const canDraw = digView({ hand: [card('h1', '2♣')], drawn, miniTurns: 1 });
  const cannotDraw = digView({ hand: [card('h1', '2♣')], drawn, miniTurns: 0 });
  assert.ok(
    privateChoiceScore(keepReturn('rank6-keep-return-top', kept), canDraw)
    > privateChoiceScore(keepReturn('rank6-keep-return-bottom', kept), canDraw),
    'valuable returned card belongs on top when we draw first'
  );
  assert.ok(
    privateChoiceScore(keepReturn('rank6-keep-return-bottom', kept), cannotDraw)
    > privateChoiceScore(keepReturn('rank6-keep-return-top', kept), cannotDraw),
    'valuable returned card belongs on bottom when the opponent draws first'
  );
});

// ── Engine legality invariance ───────────────────────────────
test('every engine-emitted Six private choice resolves legally', () => {
  const state = actionFixture({
    hand: ['6♣', '2♦', 'A♠', '3♣'], enemyHand: [],
    after: { family: 'effect-private-choice', mode: 'six-dig' }
  });
  const frame = createSimulationDecisionFrame(state);
  const choices = frame.policyActions.filter(a => a.family === 'private-choice');
  assert.ok(choices.length >= 6, `expected >=6 Six choices, got ${choices.length}`);
  for (const choice of choices) {
    const result = executeSimulationAction(frame.state, frame.resolve(choice.actionId));
    assert.ok(result.accepted, `engine rejected ${choice.mode} ${JSON.stringify(choice.targetHandles)}`);
  }
});

// ── Trace reconstruction ─────────────────────────────────────
test('decision-trace reconstruction assigns Six Dig a resource component', () => {
  const state = actionFixture({ hand: ['6♣', '2♦', 'A♠', '3♣'], enemyHand: [] });
  const frame = createSimulationDecisionFrame(state);
  const dig = frame.policyActions.find(a => a.family === 'effect-private-choice' && a.mode === 'six-dig');
  assert.ok(dig, 'six-dig action must be emitted');
  const trace = createDecisionTrace({
    matchId: 'M-TEST', decisionIndex: 0, checkpointHash: 'h', seat: 0,
    policyId: 'control', policyVersion: 'test', policyHash: 'ph',
    action: dig, legalActions: frame.policyActions,
    context: { own: { securedPoints: 0, goal: 21, hand: [] }, opponents: [], response: {}, stack: [] }
  });
  const option = trace.legalOptions.find(o => o.actionId === dig.actionId);
  assert.ok(option.scoreComponents.resource > 0,
    `expected resource component > 0, got ${JSON.stringify(option.scoreComponents)}`);
});

// ── Telemetry channels ───────────────────────────────────────
test('variant counters consume hand/mini-turn deltas and mark unobserved impact honestly', () => {
  const counters = emptyParticipantVariantCounters(['P1'], ['6:normal']);
  const entity = { variantKey: '6:normal', creditKeys: ['6:normal'] };
  applyStateDeltaToVariantCounters(counters, 'P1', entity, {
    securedPointDeltaByPlayer: { P1: 2 },
    boardPresenceDeltaByPlayer: { P1: 1 },
    miniTurnDeltaByPlayer: { P1: 1 },
    handDeltaByPlayer: { P1: 1 },
    goalDeltaByPlayer: { P1: 0 }
  });
  const metrics = computeVariantMetrics(counters.P1, ['6:normal'])['6:normal'];
  assert.equal(metrics.variantTempoImpact, 1);
  assert.equal(metrics.variantResourceContribution, 1);
  assert.equal(metrics.variantImpactObservationCount, 0);
  assert.equal(metrics.variantImpactStatus, 'not-observable');
});

test('variant impact status flips to observed only when impact fields were emitted', () => {
  const counters = emptyParticipantVariantCounters(['P1'], ['6:normal']);
  const entity = { variantKey: '6:normal', creditKeys: ['6:normal'] };
  applyStateDeltaToVariantCounters(counters, 'P1', entity, {
    securedPointDeltaByPlayer: { P1: 0 },
    immediateImpactByPlayer: { P1: 0 },
    delayedValueByPlayer: { P1: 0 }
  });
  const metrics = computeVariantMetrics(counters.P1, ['6:normal'])['6:normal'];
  assert.equal(metrics.variantImpactObservationCount, 1);
  assert.equal(metrics.variantImpactStatus, 'observed');
});

// ── Red Joker mode classification ────────────────────────────
test('all four Red Joker modes classify consistently', () => {
  for (const mode of ['hand-swap', 'self-reset', 'opponent-attack', 'shuffle-reset']) {
    assert.ok(actionModeSupported({ family: 'effect-red-joker', mode }),
      `mode ${mode} must be supported`);
  }
});

// ── Integration: policy-level Six Dig parity ─────────────────
test('tactical policies treat Six Dig as a competitive resource action', () => {
  const state = actionFixture({ hand: ['6♣', '2♦'], enemyHand: [] });
  const frame = createSimulationDecisionFrame(state);
  const view = strictPolicyView(frame.state, 'P1');
  const ctx = { actorId: 'P1', authorizedView: view, legalActions: frame.policyActions };
  const dig = frame.policyActions.find(a => a.family === 'effect-private-choice' && a.mode === 'six-dig');
  assert.ok(dig, 'six-dig action must be emitted');
  for (const policyId of ['control-tactical', 'value-tactical', 'tempo-tactical']) {
    const ranked = rankPolicyActions(policyId, frame.policyActions, ctx);
    const digRank = ranked.findIndex(r => r.action.actionId === dig.actionId);
    assert.ok(digRank >= 0 && digRank <= 3,
      `${policyId}: six-dig ranked ${digRank + 1}/${ranked.length} — expected top-4`);
  }
});
