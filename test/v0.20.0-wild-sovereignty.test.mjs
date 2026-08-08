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
  seed: 0x51BD01,
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

/**
 * Declare a primary action, then let the orchestrator auto-drain the response
 * window and resolve the stack. `advanceSimulationToDecision` auto-passes
 * priority when no response actions exist and auto-resolves the stack top.
 * Returns the advanced state after full resolution.
 */
function declareAndResolve(engine, state, command) {
  const result = engine.execute(state, command);
  if (!result.accepted) return result;
  // The orchestrator auto-drains empty response windows and auto-resolves the stack.
  const d = advanceSimulationToDecision(result.state);
  return { accepted: true, state: d.state, events: result.events };
}

test('Wild Sovereignty is in supported families of both advanced and unrestricted profiles', () => {
  assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes('wild-sovereignty'),
    'wild-sovereignty should be in advanced profile supportedFamilies');
  assert.ok(CORE_UNRESTRICTED_AUTHORITY_PROFILE.supportedFamilies.includes('wild-sovereignty'),
    'wild-sovereignty should be in unrestricted profile supportedFamilies');
});

test('K♠ Wild Sovereignty three-bounce enumerates when K♠ is in hand with an OTT target', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const target = cardBy(state, 'A♣');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, target, 'P2_PR', 'P2');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'three-bounce');
  assert.ok(wild, 'Wild Sovereignty three-bounce should be enumerated');
  assert.ok(wild.sourceCardIds.includes(ks), 'K♠ should be the source');
});

test('K♠ Wild Sovereignty four-row-clear enumerates', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  moveCard(state, ks, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'four-row-clear-pr');
  assert.ok(wild, 'Wild Sovereignty four-row-clear should be enumerated');
});

test('K♠ Wild Sovereignty total-clear enumerates only with another hand card for the cost', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const cost = cardBy(state, '3♣');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, cost, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'total-clear');
  assert.ok(wild, 'Wild Sovereignty total-clear should be enumerated with a cost card in hand');
  // Verify the cost card is not K♠
  const cmd = wild.command;
  assert.ok(cmd.action.action.action.discardCostCardId !== ks, 'discard cost must not be K♠');
});

test('K♠ Wild Sovereignty total-clear is NOT enumerated without another hand card', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  moveCard(state, ks, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'total-clear');
  assert.equal(wild, undefined, 'total-clear should NOT be enumerated without a discard cost card');
});

test('K♠ Wild Sovereignty deep-draw enumerates with another hand card', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const discard = cardBy(state, '3♣');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, discard, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'deep-draw');
  assert.ok(wild, 'Wild Sovereignty deep-draw should be enumerated');
});

test('K♠ Wild Sovereignty recycle-five and topdeck-seven enumerate', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  moveCard(state, ks, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const recycle = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'recycle-five');
  assert.ok(recycle, 'Wild Sovereignty recycle-five should be enumerated');
  const topdeck = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'topdeck-seven');
  assert.ok(topdeck, 'Wild Sovereignty topdeck-seven should be enumerated');
});

test('K♠ Wild Sovereignty is NOT enumerated for non-spade Kings', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const kc = cardBy(state, 'K♣');
  moveCard(state, kc, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty');
  assert.equal(wild, undefined, 'Wild Sovereignty should NOT be enumerated for K♣');
});

test('K♠ Wild Sovereignty is NOT enumerated in Foundation profile', () => {
  const engine = new IntrilexEngine();
  const foundationSetup = { ...setup, profileId: 'core-foundation-authority' };
  let state = enterActionPhase(engine, createSimulationState(foundationSetup));
  const ks = cardBy(state, 'K♠');
  moveCard(state, ks, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty');
  assert.equal(wild, undefined, 'Wild Sovereignty should NOT be enumerated in Foundation profile');
});

test('K♠ retains Royal Marriage alongside Wild Sovereignty', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const qs = cardBy(state, 'Q♠');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, qs, 'P1_HAND', 'P1');
  const d = advanceSimulationToDecision(state);
  const marriage = d.legalActionFrame.actions.find((a) => a.family === 'royal-marriage');
  assert.ok(marriage, 'Royal Marriage should still be enumerated for K♠');
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty');
  assert.ok(wild, 'Wild Sovereignty should be enumerated alongside Royal Marriage');
});

test('K♠ Wild Sovereignty three-bounce resolves with K♠ sent to Exile', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const target = cardBy(state, 'A♣');
  // Ensure only K♠ is in P1 hand; clear P2 hand to prevent counters.
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, target, 'P2_PR', 'P2');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'three-bounce');
  assert.ok(wild, 'Wild Sovereignty three-bounce should be enumerated');
  const result = declareAndResolve(engine, d.state, wild.command);
  assert.equal(result.accepted, true, 'Wild Sovereignty three-bounce should be accepted');
  assert.equal(result.state.cards[ks].zone, 'EXILE', 'K♠ should be in Exile after Wild Sovereignty resolves');
  assert.equal(result.state.zones.dp[0], target, 'Bounced card should be on top of DP');
});

test('K♠ Wild Sovereignty total-clear resolves with K♠ in Exile and cost card in GY', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const cost = cardBy(state, '3♣');
  const enemy = cardBy(state, '2♦');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, cost, 'P1_HAND', 'P1');
  moveCard(state, enemy, 'P2_PR', 'P2');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'total-clear');
  assert.ok(wild, 'Wild Sovereignty total-clear should be enumerated');
  const result = declareAndResolve(engine, d.state, wild.command);
  assert.equal(result.accepted, true, 'Wild Sovereignty total-clear should be accepted');
  assert.equal(result.state.cards[ks].zone, 'EXILE', 'K♠ should be in Exile');
  assert.equal(result.state.cards[cost].zone, 'GY', 'discard cost card should be in GY');
  assert.equal(result.state.cards[enemy].zone, 'GY', 'enemy PR card should be cleared to GY');
});

test('K♠ Wild Sovereignty four-row-clear resolves with K♠ sent to Exile', () => {
  const engine = new IntrilexEngine();
  let state = enterActionPhase(engine, createSimulationState(setup));
  const ks = cardBy(state, 'K♠');
  const enemy = cardBy(state, '2♣');
  for (const id of [...state.players.P1.hand]) moveCard(state, id, 'GY');
  for (const id of [...state.players.P2.hand]) moveCard(state, id, 'GY');
  moveCard(state, ks, 'P1_HAND', 'P1');
  moveCard(state, enemy, 'P2_PR', 'P2');
  const d = advanceSimulationToDecision(state);
  const wild = d.legalActionFrame.actions.find((a) => a.family === 'wild-sovereignty' && a.mode === 'four-row-clear-pr');
  assert.ok(wild, 'Wild Sovereignty four-row-clear should be enumerated');
  const result = declareAndResolve(engine, d.state, wild.command);
  assert.equal(result.accepted, true, 'Wild Sovereignty four-row-clear should be accepted');
  assert.equal(result.state.cards[ks].zone, 'EXILE', 'K♠ should be in Exile');
  assert.equal(result.state.cards[enemy].zone, 'GY', 'enemy PR card should be cleared to GY');
});

test('Wild Sovereignty matches complete without errors under random-legal policies (advanced)', () => {
  const result = runPolicyMatch({
    ordinal: 1,
    seed: 0x51BE,
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

test('Wild Sovereignty is deterministic across repeated matches with same seed', () => {
  const seed = 0x51BF;
  const r1 = runPolicyMatch({ ordinal: 0, seed, profileId: 'core-advanced-authority', policyIds: ['random-legal', 'random-legal'], seatOrder: ['P1', 'P2'], includeReplay: true });
  const r2 = runPolicyMatch({ ordinal: 0, seed, profileId: 'core-advanced-authority', policyIds: ['random-legal', 'random-legal'], seatOrder: ['P1', 'P2'], includeReplay: true });
  assert.equal(r1.summary.replayHash, r2.summary.replayHash, 'same seed should produce same replay hash');
});
