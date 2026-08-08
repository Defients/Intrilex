import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createSimulationState,
  advanceSimulationToDecision,
  createSimulationDecisionFrame,
  executeSimulationAction,
  CORE_ADVANCED_AUTHORITY_PROFILE,
  CORE_UNRESTRICTED_AUTHORITY_PROFILE,
} from '@intrilex/engine-adapter';
import { runPolicyMatch } from '@intrilex/simulation-runtime';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime/autonomy-engine-dist/src');
const moduleUrl = (file) => pathToFileURL(path.join(runtimeDir, file)).href;

const engineModule = await import(moduleUrl('engine.js'));
const stateModule = await import(moduleUrl('state.js'));
const IntrilexEngine = engineModule.IntrilexEngine;
const moveCard = stateModule.moveCard;

const setup = {
  profileId: 'core-unrestricted-authority',
  playerIds: ['P1', 'P2'],
  enabledModules: [],
  seed: 0x61AC01,
  seatOrder: ['P1', 'P2']
};

function cardBy(state, identity) {
  return Object.values(state.cards).find((c) => c.identity === identity)?.id;
}

/** Enter the Action phase from Start. */
function enterActionPhase(engine, state) {
  let d = advanceSimulationToDecision(state);
  const enter = d.legalActionFrame.actions.find((a) => a.mode === 'enter-action');
  if (enter) return engine.execute(d.state, enter.command).state;
  return d.state;
}

/** Wrap a CoreAuthorityAction in a RESOLVE_CORE_AUTHORITY_ACTION command. */
function coreCmd(state, actorId, action) {
  return { id: `TEST-${state.revision}-${actorId}-${action.kind}`, type: 'RESOLVE_CORE_AUTHORITY_ACTION', actorId, action };
}

/**
 * Declare an action, then let the orchestrator auto-drain the response
 * window and resolve the stack. Returns the advanced state after full resolution.
 */
function declareAndResolve(engine, state, command) {
  const result = engine.execute(state, command);
  if (!result.accepted) return result;
  const d = advanceSimulationToDecision(result.state);
  return { accepted: true, state: d.state, events: result.events };
}

test('board-lock is in supported families of both advanced and unrestricted profiles', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('board-lock'),
    'board-lock should be in advanced profile supportedFamilies');
  assert.ok(CORE_UNRESTRICTED_AUTHORITY_PROFILE.supportedFamilies.includes('board-lock'),
    'board-lock should be in unrestricted profile supportedFamilies');
});

test('Board Lock Quick enumerates when BJ is in hand during own Full Turn', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.ok(boardLock, 'Board Lock Quick should be enumerated when BJ is in hand');
  assert.ok(boardLock.sourceCardIds.includes(bj), 'BJ should be the source');
  assert.equal(boardLock.timingClass, 'QUICK', 'Board Lock should have QUICK timing class');
});

test('Board Lock Quick is NOT enumerated during opponent Full Turn', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  moveCard(state, bj, 'P2_HAND', 'P2');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.equal(boardLock, undefined, 'Board Lock should NOT be enumerated for non-active player');
});

test('Board Lock Quick is NOT enumerated in Foundation profile', () => {
  const engine = new IntrilexEngine();
  const foundationSetup = { ...setup, profileId: 'core-foundation-authority' };
  let state = enterActionPhase(engine, createSimulationState(foundationSetup));
  const bj = cardBy(state, 'BJ');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.equal(boardLock, undefined, 'Board Lock should NOT be enumerated in Foundation profile');
});

test('Board Lock Quick is NOT enumerated while Board Lock is already active', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: 'P1' };
  moveCard(state, bj, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.equal(boardLock, undefined, 'Board Lock should NOT be enumerated while already active');
});

test('Board Lock Quick does NOT consume a Mini-Turn', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.ok(boardLock, 'Board Lock should be enumerated');
  const miniTurnsBefore = d.state.players.P1.limits.miniTurnsRemaining;
  const result = declareAndResolve(engine, d.state, boardLock.command);
  assert.equal(result.accepted, true, 'Board Lock should be accepted');
  const miniTurnsAfter = result.state.players.P1.limits.miniTurnsRemaining;
  assert.equal(miniTurnsAfter, miniTurnsBefore, 'Board Lock should NOT consume a Mini-Turn');
});

test('Board Lock Quick resolves and sets Board Lock Counter to 2', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.ok(boardLock, 'Board Lock should be enumerated');
  const result = declareAndResolve(engine, d.state, boardLock.command);
  assert.equal(result.accepted, true, 'Board Lock should resolve');
  const boardLockState = result.state.metadata.boardLock;
  assert.ok(boardLockState, 'Board Lock state should exist');
  assert.equal(boardLockState.turnsRemaining, 2, 'Board Lock Counter should be 2');
  assert.equal(boardLockState.activatorId, 'P1', 'Activator should be P1');
  assert.equal(result.state.cards[bj].zone, 'GY', 'BJ should go to GY after Board Lock resolves');
});

test('Board Lock Quick is NOT accepted when stack is non-empty', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  moveCard(state, bj, 'P1_HAND', 'P1');
  state.stack.push({
    id: 'FAKE-SI', controllerId: 'P1', sourceCardIds: [], targetCardIds: [],
    kind: 'core-primary', revalidationClass: 'none', instructions: [],
    sourceDestination: 'GY', status: 'pending', coreAuthority: { kind: 'primary', action: { kind: 'core-draw' }, declaringPlayerId: 'P1', actionType: 'draw', stackClass: 'draw' }
  });
  const result = engine.execute(state, coreCmd(state, 'P1', { kind: 'core-declare-board-lock-quick', sourceCardId: bj }));
  assert.equal(result.accepted, false, 'Board Lock should NOT be accepted with non-empty stack');
});

test('Board Lock Quick is NOT accepted via old Mini-Turn rank action path', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const result = engine.execute(state, coreCmd(state, 'P1', {
    kind: 'core-resolve-rank-action',
    action: { kind: 'black-joker-board-lock', sourceCardId: bj }
  }));
  assert.equal(result.accepted, false, 'Old Mini-Turn rank action path should be blocked');
  assert.ok(result.error?.code?.includes('BOARD_LOCK') || result.error?.message?.includes('Quick Effect'),
    `Error should mention Board Lock / Quick: ${result.error?.message}`);
});

test('Board Lock Quick is NOT accepted via old Mini-Turn effect path', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const result = engine.execute(state, coreCmd(state, 'P1', {
    kind: 'core-resolve-effect',
    effect: { kind: 'black-joker-board-lock', sourceCardId: bj }
  }));
  assert.equal(result.accepted, false, 'Old Mini-Turn effect path should be blocked');
});

test('Board Lock prohibits non-counter Effect plays while active', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const three = cardBy(state, '3♣');
  const target = cardBy(state, 'A♣');
  moveCard(state, three, 'P1_HAND', 'P1');
  moveCard(state, target, 'P2_PR', 'P2');
  state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: 'P1' };
  const result = engine.execute(state, coreCmd(state, 'P1', {
    kind: 'core-resolve-effect',
    effect: { kind: 'three-bounce', sourceCardId: three, targetCardId: target }
  }));
  assert.equal(result.accepted, false, 'Non-counter Effect should be blocked during Board Lock');
  assert.ok(result.error?.code?.includes('BOARD_LOCK'), 'Error code should mention BOARD_LOCK');
});

test('Board Lock prohibits Scuttle while active', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const source = cardBy(state, 'K♣');
  const target = cardBy(state, '2♦');
  moveCard(state, source, 'P1_HAND', 'P1');
  moveCard(state, target, 'P2_PR', 'P2');
  state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: 'P1' };
  const result = engine.execute(state, coreCmd(state, 'P1', {
    kind: 'core-scuttle',
    sourceCardId: source,
    targetCardId: target
  }));
  assert.equal(result.accepted, false, 'Scuttle should be blocked during Board Lock');
});

test('Board Lock allows Play for Points while active', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const two = cardBy(state, '2♣');
  moveCard(state, two, 'P1_HAND', 'P1');
  state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: 'P1' };
  const result = engine.execute(state, coreCmd(state, 'P1', { kind: 'core-score', cardId: two }));
  assert.equal(result.accepted, true, 'Play for Points should be legal during Board Lock');
});

test('Board Lock allows Draw while active', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: 'P1' };
  const result = engine.execute(state, coreCmd(state, 'P1', { kind: 'core-draw' }));
  assert.equal(result.accepted, true, 'Draw should be legal during Board Lock');
});

test('Board Lock duration does not tick on activation Full Turn', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  const result = declareAndResolve(engine, d.state, boardLock.command);
  assert.equal(result.accepted, true, 'Board Lock should resolve');
  // Now complete P1's turn — the tick should NOT happen on the activation FT
  let endState = result.state;
  endState.phase = 'End';
  const completeResult = engine.execute(endState, coreCmd(endState, 'P1', { kind: 'core-complete-turn' }));
  assert.equal(completeResult.accepted, true, 'Turn should complete');
  const boardLockAfter = completeResult.state.metadata.boardLock;
  assert.ok(boardLockAfter, 'Board Lock should still be active');
  assert.equal(boardLockAfter.turnsRemaining, 2, 'Board Lock Counter should still be 2 after activation FT');
});

test('Board Lock duration ticks on following completed Full Turn', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence - 1, activatorId: 'P1' };
  state.phase = 'End';
  const completeResult = engine.execute(state, coreCmd(state, 'P1', { kind: 'core-complete-turn' }));
  assert.equal(completeResult.accepted, true, 'Turn should complete');
  const boardLockAfter = completeResult.state.metadata.boardLock;
  assert.ok(boardLockAfter, 'Board Lock should still be active');
  assert.equal(boardLockAfter.turnsRemaining, 1, 'Board Lock Counter should be 1 after first following FT');
});

test('Board Lock ends when counter reaches 0', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  state.metadata.boardLock = { turnsRemaining: 1, activationFullTurnId: state.fullTurnSequence - 1, activatorId: 'P1' };
  state.phase = 'End';
  const completeResult = engine.execute(state, coreCmd(state, 'P1', { kind: 'core-complete-turn' }));
  assert.equal(completeResult.accepted, true, 'Turn should complete');
  assert.equal(completeResult.state.metadata.boardLock, undefined, 'Board Lock should be removed when counter reaches 0');
});

test('Board Lock Quick can be countered by ⭐A (super-ace)', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  const a1 = cardBy(state, 'A♣');
  const a2 = cardBy(state, 'A♦');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  moveCard(state, a1, 'P2_HAND', 'P2');
  moveCard(state, a2, 'P2_HAND', 'P2');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  assert.ok(boardLock, 'Board Lock should be enumerated');
  const declareResult = engine.execute(d.state, boardLock.command);
  assert.equal(declareResult.accepted, true, 'Board Lock declaration should be accepted');
  const d2 = advanceSimulationToDecision(declareResult.state);
  const superAce = d2.legalActionFrame.actions.find((a) => a.mode === 'super-ace');
  assert.ok(superAce, '⭐A counter should be available against Board Lock');
});

test('Board Lock Quick cannot be countered by Base Ace', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  const ace = cardBy(state, 'A♣');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  moveCard(state, ace, 'P2_HAND', 'P2');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  const declareResult = engine.execute(d.state, boardLock.command);
  assert.equal(declareResult.accepted, true, 'Board Lock declaration should be accepted');
  const d2 = advanceSimulationToDecision(declareResult.state);
  const baseAce = d2.legalActionFrame.actions.find((a) => a.family === 'ace-base');
  assert.equal(baseAce, undefined, 'Base Ace should NOT be available against Board Lock');
});

test('Board Lock Quick cannot be countered by A♠', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  const aspade = cardBy(state, 'A♠');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  moveCard(state, aspade, 'P2_HAND', 'P2');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  const declareResult = engine.execute(d.state, boardLock.command);
  assert.equal(declareResult.accepted, true, 'Board Lock declaration should be accepted');
  const d2 = advanceSimulationToDecision(declareResult.state);
  const spadeAce = d2.legalActionFrame.actions.find((a) => a.family === 'ace-spade');
  assert.equal(spadeAce, undefined, 'A♠ should NOT be available against Board Lock');
});

test('Board Lock Quick cannot be countered by K♠', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  const ks = cardBy(state, 'K♠');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  moveCard(state, ks, 'P2_HAND', 'P2');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  const declareResult = engine.execute(d.state, boardLock.command);
  assert.equal(declareResult.accepted, true, 'Board Lock declaration should be accepted');
  const d2 = advanceSimulationToDecision(declareResult.state);
  const kingSpade = d2.legalActionFrame.actions.find((a) => a.family === 'king-spade');
  assert.equal(kingSpade, undefined, 'K♠ should NOT be available against Board Lock');
});

test('Board Lock Quick can be countered by 3 Red Ultra (resolves as ⭐A)', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  const r1 = cardBy(state, '2♦');
  const r2 = cardBy(state, '3♦');
  const r3 = cardBy(state, '4♦');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  moveCard(state, r1, 'P2_HAND', 'P2');
  moveCard(state, r2, 'P2_HAND', 'P2');
  moveCard(state, r3, 'P2_HAND', 'P2');
  const d = advanceSimulationToDecision(state);
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  const declareResult = engine.execute(d.state, boardLock.command);
  assert.equal(declareResult.accepted, true, 'Board Lock declaration should be accepted');
  const d2 = advanceSimulationToDecision(declareResult.state);
  const ultra = d2.legalActionFrame.actions.find((a) => a.mode === 'three-red-counter');
  assert.ok(ultra, '3 Red Ultra should be available against Board Lock');
});

test('Board Lock Quick controller can continue Full Turn after resolution', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const bj = cardBy(state, 'BJ');
  const two = cardBy(state, '2♣');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, bj, 'P1_HAND', 'P1');
  moveCard(state, two, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const miniTurnsBefore = d.state.players.P1.limits.miniTurnsRemaining;
  const boardLock = d.legalActionFrame.actions.find((a) => a.mode === 'board-lock');
  const result = declareAndResolve(engine, d.state, boardLock.command);
  assert.equal(result.accepted, true, 'Board Lock should resolve');
  assert.equal(result.state.players.P1.limits.miniTurnsRemaining, miniTurnsBefore,
    'P1 should have the same Mini-Turns remaining after Board Lock');
  assert.equal(result.state.activePlayerId, 'P1', 'P1 should still be the active player');
  // P1 should be able to score the 2♣
  const scoreResult = engine.execute(result.state, coreCmd(result.state, 'P1', { kind: 'core-score', cardId: two }));
  assert.equal(scoreResult.accepted, true, 'P1 should be able to play for points after Board Lock resolves');
});

test('Board Lock matches complete without errors under random-legal policies (unrestricted)', () => {
  const result = runPolicyMatch({
    ordinal: 1,
    seed: 0x61AE,
    profileId: 'core-unrestricted-authority',
    policyIds: ['random-legal', 'random-legal'],
    seatOrder: ['P1', 'P2'],
    includeReplay: true
  });
  assert.ok(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(result.summary.terminationReason),
    `unexpected termination: ${result.summary.terminationReason}`);
  assert.equal(result.summary.errorCode, null, `match should have no error: ${result.summary.errorCode}`);
  assert.equal(result.summary.ruleCompliance.status, 'PASS');
});

test('Board Lock matches complete without errors under random-legal policies (advanced)', () => {
  const result = runPolicyMatch({
    ordinal: 1,
    seed: 0x61AF,
    profileId: 'core-advanced-authority',
    policyIds: ['random-legal', 'random-legal'],
    seatOrder: ['P1', 'P2'],
    includeReplay: true
  });
  assert.ok(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(result.summary.terminationReason),
    `unexpected termination: ${result.summary.terminationReason}`);
  assert.equal(result.summary.errorCode, null, `match should have no error: ${result.summary.errorCode}`);
  assert.equal(result.summary.ruleCompliance.status, 'PASS');
});

test('Board Lock is deterministic across repeated matches with same seed', () => {
  const seed = 0x61B0;
  const r1 = runPolicyMatch({ ordinal: 0, seed, profileId: 'core-unrestricted-authority', policyIds: ['random-legal', 'random-legal'], seatOrder: ['P1', 'P2'], includeReplay: true });
  const r2 = runPolicyMatch({ ordinal: 0, seed, profileId: 'core-unrestricted-authority', policyIds: ['random-legal', 'random-legal'], seatOrder: ['P1', 'P2'], includeReplay: true });
  assert.equal(r1.summary.replayHash, r2.summary.replayHash, 'same seed should produce same replay hash');
});
