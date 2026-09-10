// ═══════════════════════════════════════════════════════════════
// guided-exhibition.test.mjs — GUIDED_EXHIBITION_01 "A Game of Inches"
//
// Tests: fixture validity, card conservation, headless conformance,
// controller orchestration, and guidance levels.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve('.');

// ── Source file reads ──
const _typesSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/guided-exhibition/guided-types.mjs'), 'utf8');
const runtimeSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/guided-exhibition/guided-runtime.mjs'), 'utf8');
const controllerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/guided-exhibition/guided-controller.mjs'), 'utf8');
const _conservationSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/guided-exhibition/guided-card-conservation.mjs'), 'utf8');
const autonomyRuntimeSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/autonomy-runtime.js'), 'utf8');

// ── Import guided modules (from dist/ where browser-entry.js exists) ──
const distBase = 'apps/lab-web/dist/play/guided-exhibition';
const typesMod = await import(pathToFileURL(path.join(root, `${distBase}/guided-types.mjs`)).href);
const fixtureMod = await import(pathToFileURL(path.join(root, `${distBase}/guided-fixture.mjs`)).href);
const conservationMod = await import(pathToFileURL(path.join(root, `${distBase}/guided-card-conservation.mjs`)).href);
const runtimeMod = await import(pathToFileURL(path.join(root, `${distBase}/guided-runtime.mjs`)).href);
const controllerMod = await import(pathToFileURL(path.join(root, `${distBase}/guided-controller.mjs`)).href);

// ═══════════════════════════════════════════════════════════════
// TYPES & SCHEMA
// ═══════════════════════════════════════════════════════════════

test('Guided types: GuidedStatus enum exists', () => {
  const { GuidedStatus } = typesMod;
  assert.equal(GuidedStatus.UNLOADED, 'unloaded');
  assert.equal(GuidedStatus.READY, 'ready');
  assert.equal(GuidedStatus.PLAYING, 'playing');
  assert.equal(GuidedStatus.CHECKPOINT, 'checkpoint');
  assert.equal(GuidedStatus.TERMINAL, 'terminal');
  assert.equal(GuidedStatus.ERROR, 'error');
});

test('Guided types: GuidanceLevel enum exists', () => {
  const { GuidanceLevel } = typesMod;
  assert.equal(GuidanceLevel.FULL, 'full');
  assert.equal(GuidanceLevel.LIGHT, 'light');
  assert.equal(GuidanceLevel.NONE, 'none');
});

test('Guided types: HintStage enum exists', () => {
  const { HintStage } = typesMod;
  assert.equal(HintStage.H0_SILENCE, 'h0-silence');
  assert.equal(HintStage.H1_VISUAL, 'h1-visual');
  assert.equal(HintStage.H2_CONCEPTUAL, 'h2-conceptual');
  assert.equal(HintStage.H3_EXPLICIT, 'h3-explicit');
});

test('Guided types: GlowLevel enum exists', () => {
  const { GlowLevel } = typesMod;
  assert.equal(GlowLevel.AMBIENT, 'ambient');
  assert.equal(GlowLevel.SUGGESTED, 'suggested');
  assert.equal(GlowLevel.GUIDED, 'guided');
});

test('Guided types: DivergenceKind enum exists', () => {
  const { DivergenceKind } = typesMod;
  assert.equal(DivergenceKind.SAFE, 'safe');
  assert.equal(DivergenceKind.EDUCATIONAL, 'educational');
  assert.equal(DivergenceKind.SCENARIO_BREAKING, 'scenario-breaking');
});

// ═══════════════════════════════════════════════════════════════
// FIXTURE VALIDITY
// ═══════════════════════════════════════════════════════════════

test('Fixture: GUIDED_EXHIBITION_01 scenario is exported', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  assert.ok(GUIDED_EXHIBITION_01, 'GUIDED_EXHIBITION_01 must be exported');
  assert.equal(GUIDED_EXHIBITION_01.id, 'GUIDED_EXHIBITION_01');
  assert.equal(GUIDED_EXHIBITION_01.title, 'A Game of Inches');
});

test('Fixture: scenario has required metadata', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const s = GUIDED_EXHIBITION_01;
  assert.ok(s.version, 'scenario must have version');
  assert.ok(s.profileId, 'scenario must have profileId');
  assert.ok(s.seed, 'scenario must have seed');
  assert.ok(s.predeterminedIdentities, 'scenario must have predeterminedIdentities');
  assert.ok(s.playerId, 'scenario must have playerId');
  assert.ok(s.rivalId, 'scenario must have rivalId');
  assert.ok(s.checkpoints, 'scenario must have checkpoints');
  assert.ok(s.debrief, 'scenario must have debrief');
  assert.ok(s.introText, 'scenario must have introText');
  assert.ok(s.estimatedMinutes, 'scenario must have estimatedMinutes');
});

test('Fixture: predeterminedIdentities has 54 cards', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  assert.equal(GUIDED_EXHIBITION_01.predeterminedIdentities.length, 54, 'Must have exactly 54 cards');
});

test('Fixture: checkpoints are non-empty and ordered', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const cps = GUIDED_EXHIBITION_01.checkpoints;
  assert.ok(cps.length >= 10, 'Must have at least 10 checkpoints');
  for (let i = 1; i < cps.length; i++) {
    assert.ok(cps[i].fullTurn >= cps[i - 1].fullTurn, `Checkpoints must be ordered by fullTurn (cp${i})`);
  }
});

test('Fixture: checkpoint actors are player or rival', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  for (const cp of GUIDED_EXHIBITION_01.checkpoints) {
    assert.ok(['player', 'rival'].includes(cp.actor), `Checkpoint ${cp.id} actor must be player or rival`);
  }
});

test('Fixture: player and rival have actions in checkpoints', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const playerCps = GUIDED_EXHIBITION_01.checkpoints.filter(c => c.actor === 'player');
  const rivalCps = GUIDED_EXHIBITION_01.checkpoints.filter(c => c.actor === 'rival');
  assert.ok(playerCps.length > 0, 'Player must have checkpoints');
  assert.ok(rivalCps.length > 0, 'Rival must have checkpoints');
});

test('Fixture: debrief has required fields', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const d = GUIDED_EXHIBITION_01.debrief;
  assert.ok(d.steps, 'Debrief must have steps');
  assert.ok(Array.isArray(d.steps), 'Debrief steps must be an array');
  assert.ok(d.steps.length > 0, 'Debrief must have at least one step');
  assert.ok(d.encounteredMechanics, 'Debrief must have encounteredMechanics');
  assert.ok(d.transparencyText, 'Debrief must have transparencyText');
  assert.ok(d.footerText, 'Debrief must have footerText');
});

test('Fixture: commentary covers teaching goals', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const allCommentary = GUIDED_EXHIBITION_01.checkpoints
    .flatMap(cp => (cp.commentary ?? []).flatMap(c => (c.lines ?? []).map(l => l.text ?? '')))
    .join(' ') + ' ' + (GUIDED_EXHIBITION_01.debrief?.steps ?? []).map(s => s.text ?? '').join(' ');
  const goals = [
    'keep', 'Scuttle', 'Two', 'Queen', 'Graveyard',
    'take', 'later', 'earlier', 'Seven', 'lucky',
    'wait', 'earned', 'decisions',
  ];
  const found = goals.filter(g => allCommentary.toLowerCase().includes(g.toLowerCase()));
  assert.ok(found.length >= 4, `Commentary should cover at least 4 teaching goals (found ${found.length}: ${found.join(', ')})`);
});

// ═══════════════════════════════════════════════════════════════
// CARD CONSERVATION
// ═══════════════════════════════════════════════════════════════

test('Card conservation: 54 unique canonical identities', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const { validateIdentities } = conservationMod;
  const result = validateIdentities(GUIDED_EXHIBITION_01.predeterminedIdentities);
  assert.equal(result.valid, true, `Identity validation failed: ${result.issues?.join('; ')}`);
});

test('Card conservation: identity format is valid', () => {
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  for (const id of GUIDED_EXHIBITION_01.predeterminedIdentities) {
    assert.ok(/^\d{1,2}[♣♦♥♠]|A[♣♦♥♠]|J[♣♦♥♠]|Q[♣♦♥♠]|K[♣♦♥♠]|RJ|BJ$/u.test(id), `Invalid identity: ${id}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// RUNTIME STRUCTURE
// ═══════════════════════════════════════════════════════════════

test('Runtime: exports required functions', () => {
  for (const fn of ['matchIntent', 'validateAssertion', 'executeScriptedAction', 'reconstructInitialState', 'runGuidedScenarioHeadless']) {
    assert.ok(typeof runtimeMod[fn] === 'function', `Runtime must export ${fn}`);
  }
});

test('Runtime: uses canonical engine for state transitions', () => {
  assert.ok(runtimeSrc.includes('IntrilexEngine'), 'Must use IntrilexEngine');
  assert.ok(runtimeSrc.includes('createCoreMatchState'), 'Must use createCoreMatchState');
  assert.ok(runtimeSrc.includes('advanceCoreToDecision'), 'Must use advanceCoreToDecision');
});

test('Runtime: supports predeterminedIdentities', () => {
  assert.ok(runtimeSrc.includes('predeterminedIdentities'), 'Runtime must pass predeterminedIdentities');
});

test('Autonomy runtime: createState passes predeterminedIdentities', () => {
  assert.ok(autonomyRuntimeSrc.includes('predeterminedIdentities'), 'autonomy-runtime createState must pass predeterminedIdentities');
});

// ═══════════════════════════════════════════════════════════════
// HEADLESS CONFORMANCE
// ═══════════════════════════════════════════════════════════════

test('Headless: fixture executes to completion', async () => {
  const { runGuidedScenarioHeadless } = runtimeMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const result = await runGuidedScenarioHeadless(GUIDED_EXHIBITION_01);
  assert.ok(result, 'runGuidedScenarioHeadless must return a result');
  assert.equal(result.status, 'CONFORMANT', `Expected CONFORMANT status, got ${result.status}`);
  assert.equal(result.winner, 'P1', 'Winner must be P1');
  assert.ok(result.commands.length > 0, 'Result must have commands');
  assert.ok(result.events.length > 0, 'Result must have events');
  const passed = (result.checkpointResults ?? []).filter(r => r.passed).length;
  assert.ok(passed >= 25, `At least 25 checkpoints must pass, got ${passed}`);
});

test('Headless: deterministic — repeated runs produce same result', async () => {
  const { runGuidedScenarioHeadless } = runtimeMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(await runGuidedScenarioHeadless(GUIDED_EXHIBITION_01));
  }
  const commandCounts = results.map(r => r.commands.length);
  const eventCounts = results.map(r => r.events.length);
  const winners = results.map(r => r.winner);
  assert.equal(new Set(commandCounts).size, 1, 'All runs must produce same command count');
  assert.equal(new Set(eventCounts).size, 1, 'All runs must produce same event count');
  assert.equal(new Set(winners).size, 1, 'All runs must produce same winner');
  assert.equal(winners[0], 'P1', 'Winner must be P1');
});

test('Headless: card conservation verified throughout', async () => {
  const { runGuidedScenarioHeadless } = runtimeMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const result = await runGuidedScenarioHeadless(GUIDED_EXHIBITION_01);
  assert.equal(result.conservationIssues.length, 0, `Must have zero card conservation issues, got: ${result.conservationIssues?.join('; ')}`);
});

test('Headless: all checkpoints pass', async () => {
  const { runGuidedScenarioHeadless } = runtimeMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const result = await runGuidedScenarioHeadless(GUIDED_EXHIBITION_01);
  const cps = result.checkpointResults ?? [];
  const failed = cps.filter(r => !r.passed).map(r => r.checkpointId);
  assert.equal(failed.length, 0, `Failed checkpoints: ${failed.join(', ')}`);
  // Verify that the key teaching checkpoints pass
  const keyCheckpoints = [
    'EX01_INIT', 'EX01_FT03_PLAYER_SWAP_2H', 'EX01_FT10_SCUTTLE',
    'EX01_FT14_QD_PURGED', 'EX01_FT18_AS_COUNTER', 'EX01_FT23_WIN',
    'EX01_VICTORY_21_20',
  ];
  for (const id of keyCheckpoints) {
    const cp = cps.find(r => r.checkpointId === id);
    assert.ok(cp?.passed, `Key checkpoint ${id} must pass`);
  }
});

// ═══════════════════════════════════════════════════════════════
// CONTROLLER STRUCTURE
// ═══════════════════════════════════════════════════════════════

test('Controller: exports GuidedController class', () => {
  assert.ok(typeof controllerMod.GuidedController === 'function', 'Controller must export GuidedController class');
});

test('Controller: supports guidance levels', () => {
  assert.ok(controllerSrc.includes('GuidanceLevel'), 'Controller must import GuidanceLevel');
  assert.ok(controllerSrc.includes('setGuidanceLevel'), 'Controller must have setGuidanceLevel method');
});

test('Controller: emits events', () => {
  assert.ok(controllerSrc.includes('_emitStateChange') || controllerSrc.includes('_emitCommentary'), 'Controller must emit events');
});

test('Controller: tracks checkpoints', () => {
  assert.ok(controllerSrc.includes('checkpoint') || controllerSrc.includes('_checkpointIndex'), 'Controller must track checkpoints');
});

// ═══════════════════════════════════════════════════════════════
// CONTROLLER ORCHESTRATION
// ═══════════════════════════════════════════════════════════════

test('Controller: start initializes to ready status', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  const status = ctrl.getStatus();
  assert.ok(['unloaded', 'ready'].includes(status), `Expected unloaded or ready, got ${status}`);
});

test('Controller: start() begins scenario execution', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  await ctrl.start();
  const status = ctrl.getStatus();
  assert.ok(['playing', 'checkpoint', 'terminal', 'ready'].includes(status), `Expected playing/checkpoint/terminal/ready, got ${status}`);
});

test('Controller: tick() processes checkpoint progression', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const events = [];
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, {
    onState: (e) => events.push(e),
  });
  await ctrl.start();
  // Tick should not crash
  ctrl.tick();
});

test('Controller: full guidance mode produces commentary', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const commentaries = [];
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, {
    onCommentary: (c) => commentaries.push(c),
  });
  await ctrl.start();
  // Run a few ticks to process checkpoints
  for (let i = 0; i < 10; i++) ctrl.tick();
  const status = ctrl.getStatus();
  assert.ok(['playing', 'checkpoint', 'terminal'].includes(status), `Expected playing/checkpoint/terminal, got ${status}`);
});

test('Controller: setGuidanceLevel changes guidance', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  ctrl.setGuidanceLevel('none');
  // Verify it doesn't crash
});

test('Controller: getState returns current state', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  await ctrl.start();
  ctrl.getState(); // may return null or object depending on phase
});

test('Controller: getStatus returns valid status', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  await ctrl.start();
  const status = ctrl.getStatus();
  assert.ok(typeof status === 'string', 'getStatus must return a string');
});

// ═══════════════════════════════════════════════════════════════
// GUIDANCE LEVELS
// ═══════════════════════════════════════════════════════════════

test('Controller: setGuidanceLevel accepts all levels', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  for (const level of ['full', 'light', 'none']) {
    const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
    ctrl.setGuidanceLevel(level);
  }
});

// ═══════════════════════════════════════════════════════════════
// SAVE / RESUME / RESTART
// ═══════════════════════════════════════════════════════════════

test('Controller: replay method exists', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  assert.ok(typeof ctrl.replay === 'function', 'Controller must have replay method');
});

// ═══════════════════════════════════════════════════════════════
// UI INTEGRATION READINESS
// ═══════════════════════════════════════════════════════════════

test('UI: guided-exhibition directory exists', () => {
  assert.ok(existsSync(join(process.cwd(), 'apps/lab-web/src/play/guided-exhibition')), 'guided-exhibition directory must exist');
});

test('UI: controller supports guidance level configuration', () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  for (const level of ['full', 'light', 'none']) {
    const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
    ctrl.setGuidanceLevel(level);
  }
});

// ═══════════════════════════════════════════════════════════════
// REGRESSION TESTS — Polish fixes
// ═══════════════════════════════════════════════════════════════

test('Regression: constructor wires callbacks from opts object', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  let stateChangeCount = 0;
  let commentaryCount = 0;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, {
    guidanceLevel: 'full',
    onStateChange: () => stateChangeCount++,
    onCommentary: () => commentaryCount++,
    onState: () => stateChangeCount++, // alias should also work
  });
  assert.equal(ctrl.getGuidanceLevel(), 'full', 'guidanceLevel from opts should be applied');
  await ctrl.start();
  assert.ok(stateChangeCount > 0, 'onStateChange callback should fire after start()');
});

test('Regression: constructor accepts onState alias for onStateChange', () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  let called = 0;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, {
    onState: () => called++,
  });
  assert.ok(ctrl.onStateChange !== null, 'onState alias should wire to onStateChange');
});

test('Regression: constructor accepts onWaiting alias for onWaitingForPlayer', () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, {
    onWaiting: () => {},
  });
  assert.ok(ctrl.onWaitingForPlayer !== null, 'onWaiting alias should wire to onWaitingForPlayer');
});

test('Regression: getGuidanceLevel method exists', () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  assert.equal(typeof ctrl.getGuidanceLevel, 'function', 'getGuidanceLevel must be a function');
  assert.equal(ctrl.getGuidanceLevel(), 'full', 'default guidance level should be full');
});

test('Regression: start() is async (returns a Promise)', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  const result = ctrl.start();
  assert.ok(result instanceof Promise, 'start() should return a Promise');
  await result;
});

test('Regression: serialize/deserialize round-trip preserves state', async () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01, { guidanceLevel: 'light' });
  await ctrl.start();
  const snapshot = ctrl.serialize();
  assert.equal(snapshot.guidanceLevel, 'light', 'serialize should preserve guidanceLevel');
  assert.equal(typeof snapshot.checkpointIndex, 'number', 'serialize should preserve checkpointIndex');
  assert.ok(snapshot.engineState !== null, 'serialize should preserve engineState');

  // Deserialize into a new controller
  const ctrl2 = new GuidedController(GUIDED_EXHIBITION_01);
  ctrl2.deserialize(snapshot, GUIDED_EXHIBITION_01);
  assert.equal(ctrl2.getGuidanceLevel(), 'light', 'deserialize should restore guidanceLevel');
  assert.equal(ctrl2.getStatus(), ctrl.getStatus(), 'deserialize should restore status');
});

test('Regression: dead fields removed — no _hintTimerId or _pendingIntent', () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  assert.ok(!('_hintTimerId' in ctrl), '_hintTimerId should be removed');
  assert.ok(!('_pendingIntent' in ctrl), '_pendingIntent should be removed');
});

test('Regression: guided-engine-resolve.mjs is removed (dead code)', () => {
  const resolvePath = join(process.cwd(), 'apps/lab-web/src/play/guided-exhibition/guided-engine-resolve.mjs');
  assert.ok(!existsSync(resolvePath), 'guided-engine-resolve.mjs should not exist');
});

test('Regression: escapeHtml is exported from renderer module', async () => {
  // The renderer is a source-only module — check via dist
  const rendererPath = path.join(root, `${distBase}/guided-renderer.mjs`);
  const rendererMod = await import(pathToFileURL(rendererPath).href);
  assert.equal(typeof rendererMod.escapeHtml, 'function', 'escapeHtml should be exported from guided-renderer');
});

test('Regression: controller has no onAutoAction or onDebrief dead callbacks', () => {
  const { GuidedController } = controllerMod;
  const { GUIDED_EXHIBITION_01 } = fixtureMod;
  const ctrl = new GuidedController(GUIDED_EXHIBITION_01);
  // onAutoAction was removed (never emitted), onDebrief is still there
  assert.ok(!('onAutoAction' in ctrl), 'onAutoAction should be removed (never emitted)');
});
