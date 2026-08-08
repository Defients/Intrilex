import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CORE_UNRESTRICTED_AUTHORITY_PROFILE,
  CORE_ADVANCED_AUTHORITY_PROFILE,
  createSimulationState,
  advanceSimulationToDecision,
  simulationCapabilities,
  hashCanonical
} from '@intrilex/engine-adapter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime/autonomy-engine-dist/src');
const moduleUrl = (file) => pathToFileURL(path.join(runtimeDir, file)).href;

const engineModule = await import(moduleUrl('engine.js'));
const stateModule = await import(moduleUrl('state.js'));
const coreAutonomyModule = await import(moduleUrl('core-autonomy.js'));
const IntrilexEngine = engineModule.IntrilexEngine;
const moveCard = stateModule.moveCard;
const runCoreRandomLegalMatch = coreAutonomyModule.runCoreRandomLegalMatch;

const setup = {
  profileId: 'core-unrestricted-authority',
  playerIds: ['P1', 'P2'],
  enabledModules: [],
  seed: 0x14dead01,
  seatOrder: ['P1', 'P2']
};

test('unrestricted profile is exported and has correct metadata', () => {
  assert.equal(CORE_UNRESTRICTED_AUTHORITY_PROFILE.id, 'core-unrestricted-authority');
  assert.equal(CORE_UNRESTRICTED_AUTHORITY_PROFILE.engineVersion, '4.2.6');
  assert.equal(CORE_UNRESTRICTED_AUTHORITY_PROFILE.rulesVersion, '4.1');
  assert.equal(CORE_UNRESTRICTED_AUTHORITY_PROFILE.playerCount, 2);
});

test('unrestricted profile supports all advanced families plus hidden branches', () => {
  const families = CORE_UNRESTRICTED_AUTHORITY_PROFILE.supportedFamilies;
  for (const family of [
    'royal-marriage', 'super-two-score', 'super-two-hold', 'super-four-exchange', 'super-eight', 'super-jack',
    'super-three-raid', 'super-five-recycle', 'super-six-dig', 'super-seven-topdeck',
    'rank10-heart', 'rank10-spade-recovery', 'rank10-stack-theft', 'rank10-diamond-mimic', 'rank10-club-foundation',
    'rank10-generated-effect-copy',
    'super-ace', 'king-spade-counter', 'wild-sovereignty', 'board-lock', 'ultra-three-black-public', 'ultra-three-red',
    'ultra-two-black-two-red', 'voltage-five-gy-bottom', 'voltage-three-choice', 'voltage-four-prediction',
    'voltage-five-refine', 'special-scoring-riders', 'sudden-death-autonomy'
  ]) assert.ok(families.includes(family), `missing family: ${family}`);
});

test('unrestricted profile has no excluded advanced systems', () => {
  const excluded = CORE_UNRESTRICTED_AUTHORITY_PROFILE.excludedSystems;
  for (const blocked of [
    'super-three-private', 'super-five-private', 'super-six-private', 'super-seven-sequential',
    'rank10-generated-effect-copy', 'sudden-death-autonomy'
  ]) assert.ok(!excluded.includes(blocked), `${blocked} should NOT be in excludedSystems for unrestricted profile`);
  for (const blocked of ['optional-modules', 'multiplayer']) {
    assert.ok(excluded.includes(blocked), `${blocked} should remain excluded`);
  }
});

test('unrestricted profile creates a valid simulation state', () => {
  const state = createSimulationState(setup);
  assert.ok(state);
  assert.equal(state.metadata.coreAuthority.profileId, 'core-unrestricted-authority');
  assert.equal(state.phase, 'Start');
  assert.equal(state.activePlayerId, 'P1');
});

test('unrestricted profile: Super 3 Raid enumerates with paired 3s', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  for (const id of ['3♣', '3♦']) moveCard(state, by[id], 'P1_HAND', 'P1');
  for (const id of ['A♣']) moveCard(state, by[id], 'P2_HAND', 'P2');
  d = advanceSimulationToDecision(state);
  const raid = d.legalActionFrame.actions.find((a) => a.mode === 'three-raid');
  assert.ok(raid, 'Super 3 Raid should be enumerated when paired 3s are in hand');
  const r = engine.execute(d.state, raid.command);
  assert.equal(r.accepted, true, 'Super 3 Raid should be engine-accepted');
});

test('unrestricted profile: Super 5 Recycle enumerates with paired 5s', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  for (const id of ['5♣', '5♦']) moveCard(state, by[id], 'P1_HAND', 'P1');
  d = advanceSimulationToDecision(state);
  const recycle = d.legalActionFrame.actions.find((a) => a.mode === 'five-recycle');
  assert.ok(recycle, 'Super 5 Recycle should be enumerated when paired 5s are in hand');
  const r = engine.execute(d.state, recycle.command);
  assert.equal(r.accepted, true, 'Super 5 Recycle should be engine-accepted');
});

test('unrestricted profile: Super 6 Dig enumerates with paired 6s', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  for (const id of ['6♣', '6♦', 'A♣']) moveCard(state, by[id], 'P1_HAND', 'P1');
  d = advanceSimulationToDecision(state);
  const dig = d.legalActionFrame.actions.find((a) => a.mode === 'six-dig');
  assert.ok(dig, 'Super 6 Dig should be enumerated when paired 6s are in hand');
  const r = engine.execute(d.state, dig.command);
  assert.equal(r.accepted, true, 'Super 6 Dig should be engine-accepted');
});

test('unrestricted profile: Super 7 Topdeck enumerates with paired 7s', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  for (const id of ['7♣', '7♦']) moveCard(state, by[id], 'P1_HAND', 'P1');
  d = advanceSimulationToDecision(state);
  const topdeck = d.legalActionFrame.actions.find((a) => a.mode === 'seven-topdeck');
  assert.ok(topdeck, 'Super 7 Topdeck should be enumerated when paired 7s are in hand');
  const r = engine.execute(d.state, topdeck.command);
  assert.equal(r.accepted, true, 'Super 7 Topdeck should be engine-accepted');
});

test('unrestricted profile: Sudden Death enumerates as interrupt', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  d = advanceSimulationToDecision(state);
  const suddenDeath = d.legalActionFrame.actions.find((a) => a.family === 'sudden-death');
  assert.ok(suddenDeath, 'Sudden Death should be enumerated as an available action');
  const r = engine.execute(d.state, suddenDeath.command);
  assert.equal(r.accepted, true, 'Sudden Death declaration should be engine-accepted');
});

test('unrestricted profile: 10♦ Mimic generated effect copy (topdeck-seven) enumerates', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  moveCard(state, by['10♦'], 'P1_HAND', 'P1');
  d = advanceSimulationToDecision(state);
  const mimicTopdeck = d.legalActionFrame.actions.find((a) => a.mode === 'diamond-mimic-topdeck-seven');
  assert.ok(mimicTopdeck, '10♦ Mimic topdeck-seven should be enumerated');
  const r = engine.execute(d.state, mimicTopdeck.command);
  assert.equal(r.accepted, true, '10♦ Mimic topdeck-seven should be engine-accepted');
});

test('unrestricted profile: 10♦ Mimic generated effect copy (recycle-five) enumerates', () => {
  const engine = new IntrilexEngine();
  let state = createSimulationState(setup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  moveCard(state, by['10♦'], 'P1_HAND', 'P1');
  d = advanceSimulationToDecision(state);
  const mimicRecycle = d.legalActionFrame.actions.find((a) => a.mode === 'diamond-mimic-recycle-five');
  assert.ok(mimicRecycle, '10♦ Mimic recycle-five should be enumerated');
  const r = engine.execute(d.state, mimicRecycle.command);
  assert.equal(r.accepted, true, '10♦ Mimic recycle-five should be engine-accepted');
});

test('unrestricted profile: hidden Supers are NOT available in advanced-only profile', () => {
  const engine = new IntrilexEngine();
  const advSetup = { ...setup, profileId: 'core-advanced-authority', seed: 0x14dead02 };
  let state = createSimulationState(advSetup);
  let d = advanceSimulationToDecision(state);
  state = engine.execute(d.state, d.legalActionFrame.actions.find((a) => a.mode === 'enter-action').command).state;
  const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
  for (const id of ['3♣', '3♦']) moveCard(state, by[id], 'P1_HAND', 'P1');
  d = advanceSimulationToDecision(state);
  assert.equal(d.legalActionFrame.actions.some((a) => a.mode === 'three-raid'), false, 'Super 3 Raid should NOT be in advanced profile');
  assert.equal(d.legalActionFrame.actions.some((a) => a.family === 'sudden-death'), false, 'Sudden Death should NOT be in advanced profile');
});

test('unrestricted profile: Random Legal match is deterministic and terminal', () => {
  const a = runCoreRandomLegalMatch(setup, 8000);
  const b = runCoreRandomLegalMatch(setup, 8000);
  assert.ok(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(a.terminationReason), a.terminationReason);
  assert.equal(
    hashCanonical({ state: a.state, commands: a.commands, decisions: a.decisions }),
    hashCanonical({ state: b.state, commands: b.commands, decisions: b.decisions })
  );
});

test('unrestricted profile: simulation capabilities list includes unrestricted profile', () => {
  const caps = simulationCapabilities();
  const unrestricted = caps.find((c) => c.profileId === 'core-unrestricted-authority');
  assert.ok(unrestricted, 'core-unrestricted-authority should be in simulation capabilities');
  assert.equal(unrestricted.status, 'SUPPORTED');
});

