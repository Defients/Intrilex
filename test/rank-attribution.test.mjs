import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeRankAction, classifyPlayForm, isNoAttributionAction, attributeAction, buildSourceCards } from '@intrilex/simulation-runtime/rank-attribution';
import { canonicalRankAuthority, allRankDefinitions, RANK_REGISTRY, CANONICAL_RANKS, parseIdentity } from '@intrilex/engine-adapter';

test('canonical rank authority has all 15 ranks', () => {
  const authority = canonicalRankAuthority();
  assert.equal(authority.schemaVersion, '1.0.0');
  assert.equal(authority.ranks.length, 15);
  assert.equal(authority.engineVersion, '4.2.6');
  assert.equal(authority.rulesVersion, '4.3.1');
  assert.ok(authority.authorityHash, 'must have authority hash');
  const rankIds = authority.ranks.map(r => r.rankId);
  assert.deepEqual(rankIds, CANONICAL_RANKS);
});

test('rank authority has correct PR points for key ranks', () => {
  const authority = canonicalRankAuthority();
  const byRank = Object.fromEntries(authority.ranks.map(r => [r.rankId, r]));
  assert.equal(byRank['A'].prPoints, 4);
  assert.equal(byRank['10'].prPoints, 10);
  assert.equal(byRank['K'].prPoints, 8);
  assert.equal(byRank['BJ'].prPoints, 11);
  assert.equal(byRank['Q'].prPoints, 2);
  assert.equal(byRank['J'].prPoints, 3);
});

test('rank authority has correct scuttle order', () => {
  const authority = canonicalRankAuthority();
  const orders = authority.ranks.map(r => r.scuttleOrder);
  assert.deepEqual(orders, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
});

test('rank authority has modes and notes', () => {
  const authority = canonicalRankAuthority();
  const king = authority.ranks.find(r => r.rankId === 'K');
  assert.ok(king.modes.includes('anchor'));
  assert.ok(king.modes.includes('royal-marriage'));
  assert.ok(king.notes.length > 0);
});

test('ordinary single-rank score gets exact attribution', () => {
  const result = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: '7♠', rank: '7', suit: '♠', zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'score',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'exact');
  assert.equal(result.primaryRank, '7');
  assert.equal(result.rankWeights['7'], 1.0);
  assert.equal(result.sourceRanks.length, 1);
});

test('same-rank Super gets exact attribution to that rank', () => {
  const result = attributeRankAction({
    sourceCards: [
      { entityId: 'C1', identity: 'A♣', rank: 'A', suit: '♣', zoneBefore: 'P1_HAND', role: 'source' },
      { entityId: 'C2', identity: 'A♦', rank: 'A', suit: '♦', zoneBefore: 'P1_HAND', role: 'source' }
    ],
    playForm: 'super',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'exact');
  assert.equal(result.primaryRank, 'A');
  assert.equal(result.rankWeights['A'], 1.0);
});

test('same-rank Ultra (Rank 2) gets exact attribution to Rank 2', () => {
  const result = attributeRankAction({
    sourceCards: [
      { entityId: 'C1', identity: '2♣', rank: '2', suit: '♣', zoneBefore: 'P1_HAND', role: 'source' },
      { entityId: 'C2', identity: '2♦', rank: '2', suit: '♦', zoneBefore: 'P1_HAND', role: 'source' },
      { entityId: 'C3', identity: '2♥', rank: '2', suit: '♥', zoneBefore: 'P1_HAND', role: 'source' },
      { entityId: 'C4', identity: '2♠', rank: '2', suit: '♠', zoneBefore: 'P1_HAND', role: 'source' }
    ],
    playForm: 'ultra',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'exact');
  assert.equal(result.primaryRank, '2');
  assert.equal(result.rankWeights['2'], 1.0);
});

test('Royal Marriage (K+Q) gets fractional attribution', () => {
  const result = attributeRankAction({
    sourceCards: [
      { entityId: 'C1', identity: 'K♥', rank: 'K', suit: '♥', zoneBefore: 'P1_HAND', role: 'source' },
      { entityId: 'C2', identity: 'Q♥', rank: 'Q', suit: '♥', zoneBefore: 'P1_HAND', role: 'source' }
    ],
    playForm: 'royal-marriage',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'fractional');
  assert.equal(result.sourceRanks.length, 2);
  assert.ok(result.sourceRanks.includes('K'));
  assert.ok(result.sourceRanks.includes('Q'));
  assert.equal(result.rankWeights['K'], 0.5);
  assert.equal(result.rankWeights['Q'], 0.5);
});

test('Rank 7 generated effect gets generated-origin attribution', () => {
  const result = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: '7♣', rank: '7', suit: '♣', zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'generated',
    originRank: '7',
    generatedRank: 'BJ',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'generated-origin');
  assert.equal(result.primaryRank, '7');
  assert.equal(result.originRank, '7');
  assert.equal(result.generatedRank, 'BJ');
  assert.equal(result.rankWeights['7'], 1.0);
});

test('Solo Wild Copy (2♥ copying 5♥ recycle) gets generated-origin attribution to Rank 2', () => {
  const result = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: '2♥', rank: '2', suit: '♥', zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'solo-wild-copy',
    originRank: '2',
    generatedRank: '5',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'generated-origin');
  assert.equal(result.primaryRank, '2');
  assert.equal(result.originRank, '2');
  assert.equal(result.generatedRank, '5');
  assert.equal(result.rankWeights['2'], 1.0);
});

test('generated Black Joker is distinct from natural Black Joker', () => {
  // Generated BJ via Rank 7
  const generated = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: '7♣', rank: '7', suit: '♣', zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'generated',
    originRank: '7',
    generatedRank: 'BJ',
    viewerMode: 'private'
  });
  assert.equal(generated.attributionStatus, 'generated-origin');
  assert.equal(generated.primaryRank, '7');

  // Natural BJ play
  const natural = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: 'BJ', rank: 'BJ', suit: null, zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'base',
    viewerMode: 'private'
  });
  assert.equal(natural.attributionStatus, 'exact');
  assert.equal(natural.primaryRank, 'BJ');
});

test('generic score family derives source rank from exact card identity', () => {
  const result = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: '5♦', rank: '5', suit: '♦', zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'score',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'exact');
  assert.equal(result.primaryRank, '5');
});

test('swap action derives source rank from exact card identity', () => {
  const result = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: '6♠', rank: '6', suit: '♠', zoneBefore: 'P1_HAND', role: 'source' }],
    playForm: 'swap',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'exact');
  assert.equal(result.primaryRank, '6');
});

test('response-decline receives no rank attribution', () => {
  assert.equal(isNoAttributionAction({ kind: 'response-decline' }), true);
  assert.equal(isNoAttributionAction({ kind: 'exhausted-pass' }), true);
  assert.equal(isNoAttributionAction({ kind: 'automatic-advance' }), true);
  assert.equal(isNoAttributionAction({ kind: 'phase-transition' }), true);
});

test('response-decline via attributeAction returns not-observable', () => {
  const result = attributeAction({}, { kind: 'response-decline' });
  assert.equal(result.attributionStatus, 'not-observable');
  assert.equal(result.primaryRank, null);
  assert.equal(result.sourceRanks.length, 0);
});

test('hidden identity becomes not-observable in public mode', () => {
  const result = attributeRankAction({
    sourceCards: [{ entityId: 'C1', identity: null, rank: null, suit: null, zoneBefore: 'P2_HAND', role: 'source' }],
    playForm: 'score',
    viewerMode: 'public'
  });
  assert.equal(result.attributionStatus, 'not-observable');
  assert.equal(result.primaryRank, null);
});

test('no source cards returns not-observable', () => {
  const result = attributeRankAction({
    sourceCards: [],
    playForm: 'other',
    viewerMode: 'private'
  });
  assert.equal(result.attributionStatus, 'not-observable');
  assert.equal(result.primaryRank, null);
});

test('classifyPlayForm correctly identifies play forms', () => {
  assert.equal(classifyPlayForm({ authority: 'super' }), 'super');
  assert.equal(classifyPlayForm({ authority: 'ultra' }), 'ultra');
  assert.equal(classifyPlayForm({ authority: 'spade' }), 'suit');
  assert.equal(classifyPlayForm({ kind: 'royal-marriage' }), 'royal-marriage');
  assert.equal(classifyPlayForm({ kind: 'score' }), 'score');
  assert.equal(classifyPlayForm({ kind: 'swap' }), 'swap');
  assert.equal(classifyPlayForm({ authority: 'base' }), 'base');
});

test('parseIdentity correctly parses rank and suit', () => {
  assert.deepEqual(parseIdentity('7♠'), { rank: '7', suit: '♠' });
  assert.deepEqual(parseIdentity('A♣'), { rank: 'A', suit: '♣' });
  assert.deepEqual(parseIdentity('BJ'), { rank: 'BJ', suit: null });
  assert.deepEqual(parseIdentity('RJ'), { rank: 'RJ', suit: null });
  assert.equal(parseIdentity('invalid'), null);
});

test('allRankDefinitions returns 15 definitions in canonical order', () => {
  const defs = allRankDefinitions();
  assert.equal(defs.length, 15);
  assert.deepEqual(defs.map(d => d.rank), CANONICAL_RANKS);
});

test('RANK_REGISTRY is frozen/immutable', () => {
  assert.ok(Object.isFrozen(RANK_REGISTRY));
});

test('buildSourceCards hides opponent hand in public mode', () => {
  const state = {
    cards: {
      'C1': { identity: 'K♥', controllerId: 'P1', zone: 'P1_HAND' },
      'C2': { identity: 'Q♠', controllerId: 'P2', zone: 'P2_HAND' }
    },
    viewerId: 'P1'
  };
  const cards = buildSourceCards(state, { sourceCardIds: ['C1', 'C2'] }, 'public');
  assert.equal(cards[0].identity, 'K♥');  // own card visible
  assert.equal(cards[1].identity, null);  // opponent card hidden
});

test('buildSourceCards shows all in private mode', () => {
  const state = {
    cards: {
      'C1': { identity: 'K♥', controllerId: 'P1', zone: 'P1_HAND' },
      'C2': { identity: 'Q♠', controllerId: 'P2', zone: 'P2_HAND' }
    },
    viewerId: 'P1'
  };
  const cards = buildSourceCards(state, { sourceCardIds: ['C1', 'C2'] }, 'private');
  assert.equal(cards[0].identity, 'K♥');
  assert.equal(cards[1].identity, 'Q♠');
});

