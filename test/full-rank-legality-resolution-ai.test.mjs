// ═══════════════════════════════════════════════════════════════
// full-rank-legality-resolution-ai.test.mjs
//
// Dedicated Full Rank pass — rank-aware AI strategic valuation,
// conservation, combination awareness, counter conservation,
// mode differentiation, and hidden-information compliance.
//
// This suite tests the rank-strategy module directly and through
// the HYBIX agent's choose() pipeline.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRankStrategy } from '@intrilex/game-ai';
import { createHybrixAgent } from '@intrilex/game-ai';
import { DEFAULT_CONFIG } from '@intrilex/game-ai';

// ── Helpers ──────────────────────────────────────────────────────

function makeKnownCards(handles, identities) {
  const map = {};
  for (let i = 0; i < handles.length; i++) {
    const id = identities[i];
    const parsed = /^(A|2|3|4|5|6|7|8|9|10|J|Q|K|RJ|BJ)(♣|♦|♥|♠)?$/.exec(id);
    const rank = parsed?.[1];
    const prPoints = { A: 4, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 };
    map[handles[i]] = { identity: id, pointValue: prPoints[rank] ?? 0 };
  }
  return map;
}

function makeContext(overrides = {}) {
  return {
    authorizedView: {
      own: { securedPoints: 0, goal: 21, hand: [], pointRow: [], drawPileRemaining: 30, ...overrides.own },
      opponents: overrides.opponents ?? [{ securedPoints: 0, goal: 21, hand: [], pointRow: [] }],
      stack: overrides.stack ?? [],
      knownCards: overrides.knownCards ?? {},
      drawPileRemaining: overrides.drawPileRemaining ?? 30
    },
    legalActions: overrides.legalActions ?? [],
    actorId: 'P1',
    decisionIndex: overrides.decisionIndex ?? 0,
    matchId: overrides.matchId ?? 'test-match',
    ...overrides.extra
  };
}

function makeAction(actionId, family, mode, sourceHandles, featureVector = {}, extra = {}) {
  return {
    actionId,
    family,
    mode,
    sourceHandles,
    targetHandles: extra.targetHandles ?? [],
    featureVector,
    ...extra
  };
}

// ── 1. Rank-Strategy Module: Mode Differentiation ───────────────

test('RS-1: 10♣ Foundation is distinguished from 10♠ Stack Theft', () => {
  const knownCards = makeKnownCards(['h1', 'h2'], ['10♣', '10♠']);
  const ctx1 = makeContext({
    knownCards,
    legalActions: [makeAction('a1', 'rank10', 'club-foundation', ['h1'], { immediateScore: 10 })]
  });
  const ctx2 = makeContext({
    knownCards,
    legalActions: [makeAction('a2', 'rank10', 'spade-stack-theft', ['h2'], { immediateScore: 0 })]
  });
  const r1 = evaluateRankStrategy(ctx1.legalActions[0], ctx1, {});
  const r2 = evaluateRankStrategy(ctx2.legalActions[0], ctx2, {});
  assert.ok(r1.reasonCodes.includes('TEN_CLUB_FOUNDATION_VALUE'),
    '10♣ should produce TEN_CLUB_FOUNDATION_VALUE reason code');
  assert.ok(r2.reasonCodes.some(c => c.includes('STACK_THEFT')),
    '10♠ should produce a STACK_THEFT reason code');
  assert.notDeepEqual(r1.reasonCodes, r2.reasonCodes,
    '10♣ and 10♠ must produce different reason codes');
});

test('RS-2: 10♥ Tempo is penalized when hand is small (wasted mini-turns)', () => {
  const knownCards = makeKnownCards(['h1'], ['10♥']);
  const ctxSmall = makeContext({
    knownCards,
    own: { hand: ['h1'], securedPoints: 0, goal: 21 },
    legalActions: [makeAction('a1', 'rank10', 'heart-tempo', ['h1'])]
  });
  const ctxLarge = makeContext({
    knownCards,
    own: { hand: ['h1', 'h2', 'h3', 'h4'], securedPoints: 0, goal: 21 },
    legalActions: [makeAction('a1', 'rank10', 'heart-tempo', ['h1'])]
  });
  const rSmall = evaluateRankStrategy(ctxSmall.legalActions[0], ctxSmall, {});
  const rLarge = evaluateRankStrategy(ctxLarge.legalActions[0], ctxLarge, {});
  assert.ok(rSmall.reasonCodes.includes('TEN_HEART_TEMPO_WASTED'),
    '10♥ with small hand should be penalized');
  assert.ok(rLarge.reasonCodes.includes('TEN_HEART_TEMPO_VALUE'),
    '10♥ with large hand should be valued');
  assert.ok(rSmall.adjustment < rLarge.adjustment,
    '10♥ should score higher with more cards in hand');
});

test('RS-3: 10♠ Stack Theft is penalized when stack value is low', () => {
  const knownCards = makeKnownCards(['h1'], ['10♠']);
  const ctxLowValue = makeContext({
    knownCards,
    stack: [],
    legalActions: [makeAction('a1', 'rank10', 'spade-stack-theft', ['h1'])]
  });
  const ctxHighValue = makeContext({
    knownCards,
    stack: [{ featureVector: { immediateScore: 8 }, targetHandles: ['t1', 't2'], controllerId: 'P2' }],
    legalActions: [makeAction('a1', 'rank10', 'spade-stack-theft', ['h1'])]
  });
  const rLow = evaluateRankStrategy(ctxLowValue.legalActions[0], ctxLowValue, {});
  const rHigh = evaluateRankStrategy(ctxHighValue.legalActions[0], ctxHighValue, {});
  assert.ok(rLow.reasonCodes.includes('STACK_THEFT_SKIP_COST_EXCEEDS_SWING'),
    '10♠ should be penalized when stack value is low');
  assert.ok(rHigh.reasonCodes.includes('TEN_SPADE_THEFT_HIGH_VALUE'),
    '10♠ should be valued when stack value is high');
});

// ── 2. Counter Conservation ──────────────────────────────────────

test('RS-4: ⭐A Super Counter is penalized vs Base Ace (preserve premium)', () => {
  const knownCards = makeKnownCards(['h1', 'h2'], ['A♣', 'A♠']);
  const ctx = makeContext({ knownCards });
  const baseAce = makeAction('a1', 'counter', 'base-counter', ['h1']);
  const superAce = makeAction('a2', 'counter', 'super-counter', ['h2']);
  const rBase = evaluateRankStrategy(baseAce, ctx, {});
  const rSuper = evaluateRankStrategy(superAce, ctx, {});
  assert.ok(rSuper.reasonCodes.includes('BASE_ACE_SUFFICIENT_PRESERVE_SUPER_ACE'),
    '⭐A should trigger preservation reason code');
  assert.ok(rSuper.adjustment < rBase.adjustment,
    '⭐A should score lower than Base Ace when both are legal');
});

test('RS-5: K♠ Multi-Play Counter is penalized for single-card threats', () => {
  const knownCards = makeKnownCards(['h1'], ['K♠']);
  const ctxSingle = makeContext({
    knownCards,
    stack: [{ sourceHandles: ['s1'], family: 'effect', controllerId: 'P2' }],
    legalActions: [makeAction('a1', 'counter', 'spade-multi-counter', ['h1'])]
  });
  const ctxMulti = makeContext({
    knownCards,
    stack: [{ sourceHandles: ['s1', 's2'], family: 'queens-court', controllerId: 'P2' }],
    legalActions: [makeAction('a1', 'counter', 'spade-multi-counter', ['h1'])]
  });
  const rSingle = evaluateRankStrategy(ctxSingle.legalActions[0], ctxSingle, {});
  const rMulti = evaluateRankStrategy(ctxMulti.legalActions[0], ctxMulti, {});
  assert.ok(rSingle.reasonCodes.includes('PRESERVE_KSPADE_FOR_MULTI_PLAY_COUNTER'),
    'K♠ against single-card threat should trigger preservation');
  assert.ok(rMulti.reasonCodes.includes('KSPADE_MULTI_COUNTER_HIGH_VALUE_TARGET'),
    'K♠ against multi-card threat should be valued');
  assert.ok(rSingle.adjustment < rMulti.adjustment,
    'K♠ should score higher against multi-card threats');
});

// ── 3. Combination / Recipe Awareness ────────────────────────────

test("RS-6: Queen is penalized for scoring when 2 Queens enable Queen's Court", () => {
  const knownCards = makeKnownCards(['h1', 'h2', 'h3'], ['Q♣', 'Q♦', '5♥']);
  const ctx = makeContext({
    knownCards,
    own: { hand: ['h1', 'h2', 'h3'], securedPoints: 0, goal: 21 },
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 2 })]
  });
  const result = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  assert.ok(result.reasonCodes.includes('PRESERVE_QUEEN_FOR_QUEENS_COURT'),
    "Scoring a Queen when 2 are in hand should trigger Queen's Court preservation");
  assert.ok(result.adjustment < 0, 'Conservation penalty should be negative');
});

test('RS-7: Same-suit Q+K triggers Royal Marriage preservation', () => {
  const knownCards = makeKnownCards(['h1', 'h2', 'h3'], ['Q♥', 'K♥', '5♣']);
  const ctx = makeContext({
    knownCards,
    own: { hand: ['h1', 'h2', 'h3'], securedPoints: 0, goal: 21 },
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 2 })]
  });
  const result = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  assert.ok(result.reasonCodes.includes('PRESERVE_QUEEN_FOR_ROYAL_MARRIAGE'),
    'Scoring Q♥ when K♥ is in hand should trigger Royal Marriage preservation');
});

test('RS-8: 2 is penalized for scoring when same-suit 3-7 enables a Super', () => {
  const knownCards = makeKnownCards(['h1', 'h2'], ['2♠', '7♠']);
  const ctx = makeContext({
    knownCards,
    own: { hand: ['h1', 'h2'], securedPoints: 0, goal: 21 },
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 2 })]
  });
  const result = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  assert.ok(result.reasonCodes.includes('PRESERVE_TWO_FOR_SAME_SUIT_SUPER'),
    'Scoring 2♠ when 7♠ is in hand should trigger Super recipe preservation');
});

// ── 4. Terminal Win Override ─────────────────────────────────────

test('RS-9: Terminal score overrides all conservation penalties', () => {
  const knownCards = makeKnownCards(['h1'], ['K♠']);
  const ctx = makeContext({
    knownCards,
    own: { securedPoints: 13, goal: 21, hand: ['h1'] },
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  const result = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  assert.ok(result.reasonCodes.includes('TERMINAL_SCORE_AVAILABLE'),
    'Terminal score should be detected');
  assert.ok(result.adjustment >= 8000,
    'Terminal score should produce massive positive adjustment');
  // Should NOT contain conservation penalties
  assert.ok(!result.reasonCodes.some(c => c.startsWith('PRESERVE_')),
    'Terminal win should not trigger conservation penalties');
});

// ── 5. Black Joker: Board Lock vs Score ──────────────────────────

test('RS-10: Black Joker Board Lock is preferred under opponent pressure', () => {
  const knownCards = makeKnownCards(['h1'], ['BJ']);
  const ctxPressure = makeContext({
    knownCards,
    opponents: [{ securedPoints: 18, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'board-lock', 'board-lock-quick', ['h1'])]
  });
  const ctxCalm = makeContext({
    knownCards,
    opponents: [{ securedPoints: 3, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'board-lock', 'board-lock-quick', ['h1'])]
  });
  const rPressure = evaluateRankStrategy(ctxPressure.legalActions[0], ctxPressure, {});
  const rCalm = evaluateRankStrategy(ctxCalm.legalActions[0], ctxCalm, {});
  assert.ok(rPressure.reasonCodes.includes('BLACK_JOKER_BOARD_LOCK_PREVENTS_TERMINAL_PUSH'),
    'Board Lock under pressure should be valued');
  assert.ok(rCalm.reasonCodes.includes('BLACK_JOKER_SCORE_PREFERRED_OVER_LOCK'),
    'Board Lock without pressure should be penalized');
  assert.ok(rPressure.adjustment > rCalm.adjustment,
    'Board Lock should score higher under opponent pressure');
});

// ── 6. Five Exile Range Awareness ────────────────────────────────

test('RS-11: Five Recycle is penalized when Exile is empty', () => {
  const knownCards = makeKnownCards(['h1'], ['5♣']);
  const ctxEmpty = makeContext({
    knownCards,
    own: { hand: ['h1'], securedPoints: 0, goal: 21 },
    legalActions: [makeAction('a1', 'effect', 'recycle', ['h1'])]
  });
  const result = evaluateRankStrategy(ctxEmpty.legalActions[0], ctxEmpty, {});
  assert.ok(result.reasonCodes.includes('FIVE_EXILE_RANGE_EMPTY'),
    'Five with empty Exile should be penalized');
  assert.ok(result.adjustment < 0, 'Empty Exile should produce negative adjustment');
});

// ── 7. Four Total Clear Friendly Loss ────────────────────────────

test('RS-12: 4♠ Total Clear is penalized when friendly PR loss is high', () => {
  const knownCards = makeKnownCards(['h1'], ['4♠']);
  const ctxHighLoss = makeContext({
    knownCards,
    own: { hand: ['h1'], securedPoints: 15, goal: 21, pointRow: [{ pointValue: 10 }, { pointValue: 5 }] },
    legalActions: [makeAction('a1', 'effect', 'total-clear', ['h1'])]
  });
  const ctxLowLoss = makeContext({
    knownCards,
    own: { hand: ['h1'], securedPoints: 0, goal: 21, pointRow: [] },
    legalActions: [makeAction('a1', 'effect', 'total-clear', ['h1'])]
  });
  const rHigh = evaluateRankStrategy(ctxHighLoss.legalActions[0], ctxHighLoss, {});
  const rLow = evaluateRankStrategy(ctxLowLoss.legalActions[0], ctxLowLoss, {});
  assert.ok(rHigh.reasonCodes.includes('FOUR_TOTAL_CLEAR_FRIENDLY_LOSS_TOO_HIGH'),
    '4♠ Total Clear with high friendly loss should be penalized');
  assert.ok(rHigh.adjustment < rLow.adjustment,
    '4♠ should score lower when friendly loss is high');
});

// ── 8. Conservation Weakens Under Opponent Threat ────────────────

test('RS-13: Conservation penalty weakens when opponent is close to winning', () => {
  const knownCards = makeKnownCards(['h1'], ['K♠']);
  const ctxThreat = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'] },
    opponents: [{ securedPoints: 19, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  const ctxCalm = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'] },
    opponents: [{ securedPoints: 3, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  const rThreat = evaluateRankStrategy(ctxThreat.legalActions[0], ctxThreat, {});
  const rCalm = evaluateRankStrategy(ctxCalm.legalActions[0], ctxCalm, {});
  // Under threat, conservation is dampened (less negative)
  assert.ok(rThreat.adjustment > rCalm.adjustment,
    'Conservation penalty should be weaker under opponent threat');
});

// ── 9. Late-Game Conservation Weakening ──────────────────────────

test('RS-14: Conservation weakens when Draw Pile is nearly exhausted', () => {
  const knownCards = makeKnownCards(['h1'], ['K♠']);
  const ctxLate = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'], drawPileRemaining: 3 },
    opponents: [{ securedPoints: 3, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  const ctxEarly = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'], drawPileRemaining: 40 },
    opponents: [{ securedPoints: 3, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  const rLate = evaluateRankStrategy(ctxLate.legalActions[0], ctxLate, {});
  const rEarly = evaluateRankStrategy(ctxEarly.legalActions[0], ctxEarly, {});
  // Late game: conservation is halved, so penalty is smaller (less negative)
  assert.ok(rLate.adjustment > rEarly.adjustment,
    'Conservation should be weaker in late game (draw pile nearly empty)');
});

// ── 10. Red Joker Mode Differentiation ───────────────────────────

test('RS-15: Red Joker Hand Swap is favored when behind in hand size', () => {
  const knownCards = makeKnownCards(['h1'], ['RJ']);
  const ctxBehind = makeContext({
    knownCards,
    own: { hand: ['h1'], securedPoints: 0, goal: 21 },
    opponents: [{ securedPoints: 0, goal: 21, hand: ['e1', 'e2', 'e3', 'e4', 'e5'] }],
    legalActions: [makeAction('a1', 'effect', 'hand-swap', ['h1'])]
  });
  const ctxAhead = makeContext({
    knownCards,
    own: { hand: ['h1', 'h2', 'h3', 'h4', 'h5'], securedPoints: 0, goal: 21 },
    opponents: [{ securedPoints: 0, goal: 21, hand: ['e1'] }],
    legalActions: [makeAction('a1', 'effect', 'hand-swap', ['h1'])]
  });
  const rBehind = evaluateRankStrategy(ctxBehind.legalActions[0], ctxBehind, {});
  const rAhead = evaluateRankStrategy(ctxAhead.legalActions[0], ctxAhead, {});
  assert.ok(rBehind.reasonCodes.includes('RED_JOKER_HAND_SWAP_FAVORABLE'),
    'Hand Swap should be favored when behind in hand size');
  assert.ok(rAhead.reasonCodes.includes('RED_JOKER_HAND_SWAP_UNFAVORABLE'),
    'Hand Swap should be penalized when ahead in hand size');
  assert.ok(rBehind.adjustment > rAhead.adjustment,
    'Hand Swap should score higher when behind');
});

// ── 11. Hidden-Information Compliance ────────────────────────────

test('RS-16: Action choice is identical when unauthorized hidden identities change', () => {
  // The rank-strategy module only uses authorizedView.knownCards, which
  // contains only legally-revealed card identities. Changing hidden opponent
  // hand identities must NOT change the evaluation of the AI's own actions.
  const knownCards = makeKnownCards(['h1'], ['K♠']);
  const ctxA = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'] },
    opponents: [{ securedPoints: 10, goal: 21, hand: ['e1', 'e2'] }],
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  // Same authorized view but different hidden opponent hand identities
  // (not in knownCards, so the AI cannot see them)
  const ctxB = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'] },
    opponents: [{ securedPoints: 10, goal: 21, hand: ['e1', 'e2'] }],
    legalActions: [makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 8 })]
  });
  const rA = evaluateRankStrategy(ctxA.legalActions[0], ctxA, {});
  const rB = evaluateRankStrategy(ctxB.legalActions[0], ctxB, {});
  assert.deepEqual(rA, rB,
    'Evaluation must be identical when only unauthorized hidden info differs');
});

// ── 12. Determinism: Same input produces same output ─────────────

test('RS-17: evaluateRankStrategy is deterministic (same input → same output)', () => {
  const knownCards = makeKnownCards(['h1', 'h2'], ['A♠', 'K♠']);
  const ctx = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1', 'h2'] },
    opponents: [{ securedPoints: 10, goal: 21, hand: ['e1'] }],
    legalActions: [
      makeAction('a1', 'score', 'ordinary', ['h1'], { immediateScore: 4 }),
      makeAction('a2', 'score', 'ordinary', ['h2'], { immediateScore: 8 })
    ]
  });
  const r1a = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  const r1b = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  const r2a = evaluateRankStrategy(ctx.legalActions[1], ctx, {});
  const r2b = evaluateRankStrategy(ctx.legalActions[1], ctx, {});
  assert.deepEqual(r1a, r1b, 'Same action must produce identical evaluation');
  assert.deepEqual(r2a, r2b, 'Same action must produce identical evaluation');
});

// ── 13. Agent Integration: rankReasonCodes appear in metadata ────

test('RS-18: HYBIX agent metadata includes rankReasonCodes', () => {
  const knownCards = makeKnownCards(['h1', 'h2', 'h3'], ['Q♣', 'Q♦', '5♥']);
  const ctx = makeContext({
    knownCards,
    own: { securedPoints: 0, goal: 21, hand: ['h1', 'h2', 'h3'] },
    opponents: [{ securedPoints: 0, goal: 21, hand: ['e1'] }],
    legalActions: [
      makeAction('score-q1', 'score', 'ordinary', ['h1'], { immediateScore: 2 }),
      makeAction('score-five', 'score', 'ordinary', ['h3'], { immediateScore: 5 }),
      makeAction('draw', 'draw', 'draw', [], {})
    ],
    matchId: 'rs-test-match',
    decisionIndex: 0
  });
  const agent = createHybrixAgent({
    botId: 'P1',
    archetype: 'defender',
    difficulty: 'hard',
    seed: 42,
    config: DEFAULT_CONFIG
  });
  const result = agent.choose(ctx);
  assert.ok(Array.isArray(result.metadata.rankReasonCodes),
    'Agent metadata must include rankReasonCodes array');
  assert.ok(result.metadata.hybrixTrace.rankReasonCodes !== undefined,
    'Trace must include rankReasonCodes');
});

// ── 14. Nine Goal Shift Denial ───────────────────────────────────

test('RS-19: Nine Goal Shift is valued when it denies opponent progress', () => {
  const knownCards = makeKnownCards(['h1'], ['9♣']);
  const ctx = makeContext({
    knownCards,
    own: { securedPoints: 5, goal: 21, hand: ['h1'] },
    opponents: [{ securedPoints: 15, goal: 21, hand: [] }],
    legalActions: [makeAction('a1', 'effect', 'goal-shift', ['h1'], { goalDeltaOpponent: 3 })]
  });
  const result = evaluateRankStrategy(ctx.legalActions[0], ctx, {});
  assert.ok(result.reasonCodes.includes('NINE_GOAL_SHIFT_DENIAL'),
    'Nine Goal Shift should be valued for opponent denial');
  assert.ok(result.adjustment > 0, 'Goal Shift with positive delta should be valued');
});

// ── 15. A♠ Exile Counter Recovery Prevention ─────────────────────

test('RS-20: A♠ Exile Counter is boosted when opponent has recovery options', () => {
  const knownCards = makeKnownCards(['h1'], ['A♠']);
  // Opponent has a 5 in hand (visible via knownCards) → source is recoverable
  const ctxRecoverable = makeContext({
    knownCards: { ...knownCards, e1: { identity: '5♣', pointValue: 5 } },
    own: { securedPoints: 5, goal: 21, hand: ['h1'] },
    opponents: [{ securedPoints: 10, goal: 21, hand: ['e1'] }],
    stack: [{ family: 'effect', controllerId: 'P2', sourceHandles: ['s1'] }],
    legalActions: [makeAction('a1', 'counter', 'spade-exile-counter', ['h1'])]
  });
  const result = evaluateRankStrategy(ctxRecoverable.legalActions[0], ctxRecoverable, {});
  assert.ok(result.reasonCodes.includes('SPADE_ACE_EXILE_PREVENTS_RECOVERY'),
    'A♠ should be boosted when opponent has recovery options');
});
