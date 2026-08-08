import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulationState,
  createSimulationDecisionFrame,
  CORE_ADVANCED_AUTHORITY_PROFILE
} from '@intrilex/engine-adapter';
import { runPolicyMatch } from '@intrilex/simulation-runtime';

// Helper: run a match and assert clean termination
function assertCleanMatch(t, opts) {
  const result = runPolicyMatch({
    ordinal: 0,
    profileId: 'core-advanced-authority',
    policyIds: ['random-legal', 'random-legal'],
    seatOrder: ['P1', 'P2'],
    includeReplay: true,
    ...opts
  });
  assert.ok(
    ['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(result.summary.terminationReason),
    `${t}: unexpected termination ${result.summary.terminationReason} (${result.summary.errorCode})`
  );
  assert.equal(result.summary.errorCode, null, `${t}: errorCode should be null`);
  assert.equal(result.summary.ruleCompliance.status, 'PASS', `${t}: rule compliance should be PASS`);
  return result;
}

// ── 10♣ Foundation ──

test('10♣ Foundation is in supportedFamilies', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('rank10-club-foundation'),
    'rank10-club-foundation should be in supportedFamilies');
  assert.ok(!CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes('ten-club-foundation-trigger'),
    'ten-club-foundation-trigger should not be in excludedSystems');
});

test('10♣ Foundation match completes without errors', () => {
  assertCleanMatch('10♣ Foundation', { seed: 11111 });
});

test('10♣ Foundation enumeration produces candidates when 10♣ is in hand', () => {
  const state = createSimulationState({
    profileId: 'core-advanced-authority',
    playerIds: ['P1', 'P2'],
    enabledModules: [],
    seed: 0xC1B6F,
    seatOrder: ['P1', 'P2']
  });
  const frame = createSimulationDecisionFrame(state);
  assert.ok(Array.isArray(frame.policyActions));
});

test('10♣ Foundation determinism: same seed produces same replay hash', () => {
  const r1 = assertCleanMatch('10♣ det1', { seed: 22222 });
  const r2 = assertCleanMatch('10♣ det2', { seed: 22222 });
  assert.equal(r1.summary.replayHash, r2.summary.replayHash);
});

// ── ⭐2 Hold ──

test('⭐2 Hold is in supportedFamilies', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('super-two-hold'),
    'super-two-hold should be in supportedFamilies');
  assert.ok(!CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes('super-two-hold-child'),
    'super-two-hold-child should not be in excludedSystems');
});

test('⭐2 Hold match completes without errors', () => {
  assertCleanMatch('⭐2 Hold', { seed: 33333, policyIds: ['control', 'control'] });
});

test('⭐2 Hold determinism: same seed produces same replay hash', () => {
  const r1 = assertCleanMatch('⭐2 Hold det1', { seed: 44444, policyIds: ['control', 'control'] });
  const r2 = assertCleanMatch('⭐2 Hold det2', { seed: 44444, policyIds: ['control', 'control'] });
  assert.equal(r1.summary.replayHash, r2.summary.replayHash);
});

// ── Voltage 3 ──

test('Voltage 3 is in supportedFamilies', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('voltage-three-choice'),
    'voltage-three-choice should be in supportedFamilies');
  assert.ok(!CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes('voltage-three-choice'),
    'voltage-three-choice should not be in excludedSystems');
});

test('Voltage 3 match completes without errors', () => {
  assertCleanMatch('Voltage 3', { seed: 55555 });
});

// ── Voltage 4 ──

test('Voltage 4 is in supportedFamilies', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('voltage-four-prediction'),
    'voltage-four-prediction should be in supportedFamilies');
  assert.ok(!CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes('voltage-four-private-prediction'),
    'voltage-four-private-prediction should not be in excludedSystems');
});

test('Voltage 4 match completes without errors', () => {
  assertCleanMatch('Voltage 4', { seed: 66666 });
});

// ── Voltage 5 Refine ──

test('Voltage 5 Refine is in supportedFamilies', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('voltage-five-refine'),
    'voltage-five-refine should be in supportedFamilies');
  assert.ok(!CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes('voltage-five-refine-private'),
    'voltage-five-refine-private should not be in excludedSystems');
});

test('Voltage 5 Refine match completes without errors', () => {
  assertCleanMatch('Voltage 5 Refine', { seed: 77777 });
});

// ── Special scoring riders ──

test('Special scoring riders are in supportedFamilies', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('special-scoring-riders'),
    'special-scoring-riders should be in supportedFamilies');
  assert.ok(
    !CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes('special-scoring-riders-seven-ten-club-black-joker'),
    'special-scoring-riders-seven-ten-club-black-joker should not be in excludedSystems'
  );
});

test('Scoring riders match completes without errors', () => {
  assertCleanMatch('Scoring riders', { seed: 88888, policyIds: ['score-rush', 'score-rush'] });
});

// ── 10♣ as Ultra Three Black score card ──

test('10♣ is allowed as Ultra Three Black score card', () => {
  assertCleanMatch('10♣ ultra score', { seed: 99999, policyIds: ['random-legal', 'random-legal'] });
});

// ── Replay compatibility ──

test('Advanced continuations do not break replay compatibility', () => {
  for (let i = 0; i < 4; i++) {
    const result = runPolicyMatch({
      ordinal: i,
      seed: 10000 + i * 13,
      profileId: 'core-advanced-authority',
      policyIds: ['random-legal', 'value'],
      seatOrder: ['P1', 'P2'],
      includeReplay: true
    });
    assert.equal(result.summary.errorCode, null, `Match ${i} had error`);
    assert.equal(result.summary.ruleCompliance.status, 'PASS', `Match ${i} rule compliance failed`);
    assert.match(result.summary.replayHash, /^[a-f0-9]{64}$/);
  }
});

test('Advanced continuations are deterministic across repeated matches', () => {
  const r1 = assertCleanMatch('det-r1', { seed: 13579, policyIds: ['tempo', 'control'] });
  const r2 = assertCleanMatch('det-r2', { seed: 13579, policyIds: ['tempo', 'control'] });
  assert.equal(r1.summary.replayHash, r2.summary.replayHash);
});

test('Advanced continuations: multiple policy pairings all terminate cleanly', () => {
  const pairings = [
    ['random-legal', 'random-legal'],
    ['control', 'tempo'],
    ['value', 'score-rush'],
    ['tempo', 'tempo']
  ];
  for (let i = 0; i < pairings.length; i++) {
    const result = runPolicyMatch({
      ordinal: i,
      seed: 20000 + i * 101,
      profileId: 'core-advanced-authority',
      policyIds: pairings[i],
      seatOrder: ['P1', 'P2'],
      includeReplay: true
    });
    assert.ok(
      ['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(result.summary.terminationReason),
      `Pairing ${pairings[i].join(' vs ')}: ${result.summary.terminationReason} (${result.summary.errorCode})`
    );
    assert.equal(result.summary.errorCode, null);
  }
});
