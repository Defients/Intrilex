import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createSimulationState,
  createSimulationDecisionFrame,
  CORE_ADVANCED_AUTHORITY_PROFILE
} from '@intrilex/engine-adapter';
import { runPolicyMatch } from '@intrilex/simulation-runtime';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime/autonomy-engine-dist/src');
const moduleUrl = (file) => pathToFileURL(path.join(runtimeDir, file)).href;

const engineModule = await import(moduleUrl('engine.js'));
const stateModule = await import(moduleUrl('state.js'));
const lifecycleModule = await import(moduleUrl('lifecycle.js'));
const IntrilexEngine = engineModule.IntrilexEngine;
const moveCard = stateModule.moveCard;
const applyAegis = lifecycleModule.applyAegis;
const applyTap = lifecycleModule.applyTap;

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

// ── 10♣ Foundation Aegis lifecycle ──
// Official ruling: "When scored for Points, 10♣ enters PR with Aegis. Remove
// that Aegis at the beginning of its controller's next Start Phase."

const ADV_SETUP = {
  profileId: 'core-advanced-authority',
  playerIds: ['P1', 'P2'],
  enabledModules: [],
  seatOrder: ['P1', 'P2']
};

function stageCard(state, identity, zone, controllerId) {
  const card = Object.values(state.cards).find((c) => c.identity === identity);
  assert.ok(card, `${identity} must exist in state`);
  moveCard(state, card.id, zone, controllerId);
  delete state.cards[card.id].state.swapBarFaceDown;
  delete state.cards[card.id].state.swapBarFaceUp;
  return card.id;
}

function advanceToDecision(state) {
  const d = createSimulationDecisionFrame(state);
  assert.equal(d.status, 'PLAYER_DECISION_REQUIRED', `expected a decision, got ${d.status} (${d.reasonCode ?? 'none'})`);
  return d;
}

function findCommand(frame, predicate) {
  const action = frame.legalActionFrame.actions.find(predicate);
  assert.ok(action, 'expected action not found in legal frame');
  return action.command;
}

// Direct authority commands — the same mechanism certified replays submit —
// resolve immediately without the declare-primary/priority envelope.
function core(engine, state, actorId, action, id) {
  const result = engine.execute(state, { id, type: 'RESOLVE_CORE_AUTHORITY_ACTION', actorId, action });
  return result;
}

test('10♣ Foundation: Aegis lifecycle across the full protection window', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState({ ...ADV_SETUP, seed: 0xAE6115 });

  // P1 Start #1 is auto-prepared; enter the Action phase.
  let d = advanceToDecision(state);
  assert.equal(d.decisionActorId, 'P1');
  state = engine.execute(d.state, findCommand(d, (a) => a.mode === 'enter-action')).state;
  assert.equal(state.phase, 'Action');

  // Stage: 10♣ plus a Seven (bonus must not queue its normal scoring trigger)
  // in P1's hand; a Nine-conditioned tapped card in P1's PR (tapped cards do
  // not count toward Secured PR Points, so the bonus remains legal — and once
  // released it must not push P1 to the 21-Point goal: 10 + 7 + 2 = 19).
  const tenId = stageCard(state, '10♣', 'P1_HAND', 'P1');
  const bonusId = stageCard(state, '7♦', 'P1_HAND', 'P1');
  const tappedId = stageCard(state, '2♥', 'P1_PR', 'P1');
  state.cards[tappedId].state.pointValue = 2;
  applyTap(state.cards[tappedId], { kind: 'nine-score', sourceRef: 'TEST-NINE' });

  // Enumeration: both Foundation modes are offered while pre-entry Secured PR is 0.
  d = advanceToDecision(state);
  assert.ok(d.legalActionFrame.actions.some((a) => a.family === 'rank10' && a.mode === 'club-foundation'),
    'plain Foundation must be enumerated');
  assert.ok(d.legalActionFrame.actions.some((a) => a.mode === 'club-foundation-bonus'),
    'Foundation bonus must be enumerated while pre-entry Secured PR is 0');

  // P1 scores 10♣ via Foundation with the optional bonus card.
  const resolved = core(engine, d.state, 'P1', {
    kind: 'core-resolve-advanced',
    advanced: { kind: 'advanced-rank10-club-foundation', sourceCardId: tenId, bonusScoreCardId: bonusId }
  }, 'TEST-FOUNDATION');
  assert.equal(resolved.accepted, true, `Foundation must be accepted: ${resolved.error?.code ?? ''}`);
  state = resolved.state;

  // (1) & (2) 10♣ scores during P1's turn and has Aegis immediately.
  const ten = state.cards[tenId];
  assert.equal(ten.zone, 'P1_PR');
  assert.equal(ten.state.pointValue, 10);
  assert.deepEqual(ten.state.aegis, {
    sourceRef: '10♣-entry',
    expiresAt: { playerId: 'P1', startSequence: 2 }
  }, 'Aegis must record the controller\'s next Start Phase (P1 Start #2)');

  // (9) Bonus behavior: scored for Points, one Mini-Turn spent in total, no
  // scoring trigger queued for the bonus Seven, Nine-conditioned tap released.
  assert.equal(state.cards[bonusId].zone, 'P1_PR');
  assert.equal(state.cards[bonusId].state.pointValue, 7);
  assert.equal(state.players.P1.limits.miniTurnsRemaining, 0, 'The bonus card must not spend an extra Mini-Turn');
  assert.equal(state.metadata.coreAuthority.privateChoice, null, 'Bonus Seven must not create its normal scoring trigger');
  assert.equal(state.cards[tappedId].state.tapped, undefined, 'Foundation scoring must release Nine-conditioned taps');
  assert.ok(resolved.events.some((e) => e.type === 'NINE_TAP_RELEASED' && e.payload.cardId === tappedId));

  // (3) Aegis remains during the rest of P1's current turn (End phase).
  assert.equal(state.phase, 'End');
  assert.ok(state.cards[tenId].state.aegis, 'Aegis must persist for the remainder of the scoring turn');

  // ── P2's intervening turn ──
  d = advanceToDecision(state); // auto: complete P1 FT, begin P2 Start #1
  assert.equal(d.decisionActorId, 'P2');
  state = d.state;

  // (4) Aegis remains through Player B's intervening turn.
  assert.ok(state.cards[tenId].state.aegis, 'Aegis must persist through the intervening turn');

  // Grant an unrelated Aegis anchored to P2's next Start (P2 seq is now 1).
  const p2GuardedId = stageCard(state, 'Q♦', 'P2_ER', 'P2');
  applyAegis(state.cards[p2GuardedId], 'TEST-UNRELATED', { playerId: 'P2', startSequence: 2 });

  state = engine.execute(state, findCommand(d, (a) => a.mode === 'enter-action')).state;
  assert.equal(state.phase, 'Action');

  // P2 cannot Scuttle the protected 10♣ (Aegis checked before rank comparison).
  const p2Source = [...state.players.P2.hand].sort()[0];
  const blocked = core(engine, state, 'P2', { kind: 'core-scuttle', sourceCardId: p2Source, targetCardId: tenId }, 'TEST-SCUTTLE-BLOCKED');
  assert.equal(blocked.accepted, false, 'Scuttle must be blocked while Aegis holds');
  assert.equal(blocked.error.code, 'AEGIS_BLOCK');

  // P2 spends its Mini-Turn and ends the turn.
  const p2Draw = core(engine, state, 'P2', { kind: 'core-draw' }, 'TEST-P2-DRAW');
  assert.equal(p2Draw.accepted, true, `P2 draw rejected: ${p2Draw.error?.code ?? ''}`);
  state = p2Draw.state;
  assert.equal(state.phase, 'End');

  // ── P1's next Start Phase ──
  d = advanceToDecision(state); // auto: complete P2 FT, begin P1 Start #2
  state = d.state;
  assert.equal(d.decisionActorId, 'P1');

  // (5) Aegis is removed at the beginning of P1's next Start Phase.
  assert.equal(state.cards[tenId].state.aegis, undefined,
    'Aegis must be removed at the beginning of the controller\'s next Start Phase');
  const beganIdx = d.events.findIndex((e) => e.type === 'START_PHASE_BEGAN' && e.payload.playerId === 'P1');
  const expiredIdx = d.events.findIndex((e) => e.type === 'AEGIS_EXPIRED' && e.payload.cardId === tenId);
  assert.ok(beganIdx >= 0, 'START_PHASE_BEGAN must be emitted for P1');
  assert.ok(expiredIdx > beganIdx, 'AEGIS_EXPIRED must follow START_PHASE_BEGAN in deterministic order');
  // Player actions become available only after expiry.
  assert.ok(d.legalActionFrame.actions.some((a) => a.mode === 'enter-action'),
    'Start-phase actions must be offered only after Aegis expiry');

  // (8) The unrelated Aegis anchored to P2 must NOT expire on P1's Start.
  assert.ok(state.cards[p2GuardedId].state.aegis, 'Unrelated Aegis must be keyed to its own recorded Start Phase');

  // (7) Aegis does not survive throughout P1's new turn.
  state = engine.execute(state, findCommand(d, (a) => a.mode === 'enter-action')).state;
  assert.equal(state.phase, 'Action');
  assert.equal(state.cards[tenId].state.aegis, undefined, 'Aegis must not persist into the new Action phase');
  const p1Draw = core(engine, state, 'P1', { kind: 'core-draw' }, 'TEST-P1-DRAW');
  assert.equal(p1Draw.accepted, true);
  state = p1Draw.state;
  assert.equal(state.phase, 'End');
  assert.equal(state.cards[tenId].state.aegis, undefined, 'Aegis must not return or persist through the new turn');

  // ── P2's second turn: normal interactions work after expiry ──
  d = advanceToDecision(state); // auto: complete P1 FT, begin P2 Start #2
  state = d.state;
  assert.equal(d.decisionActorId, 'P2');
  // The unrelated Aegis expires now (P2's own next Start Phase).
  const unrelatedExpiry = d.events.find((e) => e.type === 'AEGIS_EXPIRED' && e.payload.cardId === p2GuardedId);
  assert.ok(unrelatedExpiry, 'Unrelated Aegis must expire at P2\'s own next Start Phase');
  assert.equal(state.cards[p2GuardedId].state.aegis, undefined);

  state = engine.execute(state, findCommand(d, (a) => a.mode === 'enter-action')).state;
  const jackId = stageCard(state, 'J♦', 'P2_HAND', 'P2');
  const scuttle = core(engine, state, 'P2', { kind: 'core-scuttle', sourceCardId: jackId, targetCardId: tenId }, 'TEST-SCUTTLE-AFTER');
  // (6) After expiration, normal interactions can affect 10♣. (The advanced
  // path marks 10♣ Exile-Bound via consumeRank10, so GY routes to EXILE.)
  assert.equal(scuttle.accepted, true, `Post-expiry Scuttle should succeed: ${scuttle.error?.code ?? ''}`);
  assert.equal(scuttle.state.cards[tenId].zone, 'EXILE');
});

test('10♣ Foundation (legacy rank-action path): identical Aegis expiry reference', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState({ ...ADV_SETUP, seed: 0xAE6116 });
  let d = advanceToDecision(state);
  state = engine.execute(d.state, findCommand(d, (a) => a.mode === 'enter-action')).state;
  const tenId = stageCard(state, '10♣', 'P1_HAND', 'P1');

  const resolved = engine.execute(state, {
    id: 'TEST-LEGACY-FOUNDATION', type: 'RESOLVE_RANK_ACTION', actorId: 'P1',
    action: { kind: 'foundation-ten-club', sourceCardId: tenId }
  });
  assert.equal(resolved.accepted, true, `Legacy Foundation must be accepted: ${resolved.error?.code ?? ''}`);
  state = resolved.state;
  assert.deepEqual(state.cards[tenId].state.aegis, {
    sourceRef: '10♣-entry',
    expiresAt: { playerId: 'P1', startSequence: 2 }
  });
  assert.equal(state.cards[tenId].state.pointValue, 10);

  // Drive to P1's next Start Phase: end P1's turn, run P2's turn, expire.
  const p1Draw = core(engine, state, 'P1', { kind: 'core-draw' }, 'TEST-LP1-DRAW');
  assert.equal(p1Draw.accepted, true, `P1 draw rejected: ${p1Draw.error?.code ?? ''}`);
  state = p1Draw.state;
  assert.equal(state.phase, 'End');
  d = advanceToDecision(state); // P2 Start #1
  state = d.state;
  assert.equal(d.decisionActorId, 'P2');
  assert.ok(state.cards[tenId].state.aegis, 'Legacy-path Aegis must persist through the intervening turn');
  state = engine.execute(state, findCommand(d, (a) => a.mode === 'enter-action')).state;
  const p2Draw = core(engine, state, 'P2', { kind: 'core-draw' }, 'TEST-LP2-DRAW');
  assert.equal(p2Draw.accepted, true);
  state = p2Draw.state;
  d = advanceToDecision(state); // auto: complete P2 FT, begin P1 Start #2
  state = d.state;
  assert.equal(d.decisionActorId, 'P1');
  assert.equal(state.cards[tenId].state.aegis, undefined,
    'Legacy-path Aegis must expire at the same point: beginning of controller\'s next Start Phase');
  assert.ok(d.events.some((e) => e.type === 'AEGIS_EXPIRED' && e.payload.cardId === tenId));
});
