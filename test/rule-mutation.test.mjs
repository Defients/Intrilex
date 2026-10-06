// Rule Mutation Chamber V1 — application, baseline integrity, leakage,
// serialization, matched seeds, aggregation, profile differential, invalid
// mutation rejection, and workspace smoke.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  EXPERIMENTAL_RULE_PARAMETERS,
  readRuleOverrides,
  resolveRuleNumber,
  resolveRuleFlag,
  validateRuleOverrides,
  createSimulationState,
} from '@intrilex/engine-adapter';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import {
  MUTATION_TARGETS,
  createRuleMutation,
  validateRuleMutation,
  mutationRuleOverrides,
  createExperimentConfig,
  matchSeed,
  buildMutationExperimentPlan,
  summarizeMutationArm,
  pairArmResults,
  compareArms,
  detectRegressions,
  classifyOutcome,
  createExperimentRecord,
  finalizeExperimentRecord,
  compactExperimentRecord,
  validateExperimentRecord,
  serializeExperiment,
} from '@intrilex/simulation-runtime/mutation-domain';

const PROFILE = 'core-advanced-authority';

function stateWith(overrides) {
  return createSimulationState({
    profileId: PROFILE,
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed: 1337,
    ...(overrides ? { ruleOverrides: overrides } : {}),
  });
}

// ── Catalog integrity ─────────────────────────────────────────────────────────

test('mutation catalog is in exact parity with the engine rule-parameter registry', () => {
  assert.equal(MUTATION_TARGETS.length, Object.keys(EXPERIMENTAL_RULE_PARAMETERS).length);
  for (const target of MUTATION_TARGETS) {
    const spec = EXPERIMENTAL_RULE_PARAMETERS[target.id];
    assert.ok(spec, `engine registry missing ${target.id}`);
    assert.equal(target.baseline, spec.baseline, `${target.id} baseline drift`);
    if (target.kind === 'numeric') {
      assert.equal(spec.kind, 'number', `${target.id} kind drift`);
      assert.equal(target.min, spec.min);
      assert.equal(target.max, spec.max);
    } else {
      assert.equal(spec.kind, 'flag', `${target.id} kind drift`);
    }
  }
});

// ── Mutation representation ───────────────────────────────────────────────────

test('rule mutation is explicit, deterministic and serializable', () => {
  const a = createRuleMutation({ targetId: 'rank10.heartTempo.miniTurns', mutatedValue: 1 });
  const b = createRuleMutation({ targetId: 'rank10.heartTempo.miniTurns', mutatedValue: 1 });
  assert.equal(a.id, b.id, 'mutation id must be content-derived and stable');
  assert.match(a.id, /^MUT-/);
  assert.equal(a.type, 'numeric');
  assert.equal(a.baselineValue, 2);
  assert.deepEqual(mutationRuleOverrides(a), { 'rank10.heartTempo.miniTurns': 1 });
  const restored = validateRuleMutation(JSON.parse(JSON.stringify(a)));
  assert.equal(restored.id, a.id);
});

test('boolean mutations validate type and serialize', () => {
  const m = createRuleMutation({ targetId: 'combo.ultras.enabled', mutatedValue: false });
  assert.equal(m.type, 'boolean');
  assert.equal(m.baselineValue, true);
  assert.deepEqual(mutationRuleOverrides(m), { 'combo.ultras.enabled': false });
  assert.throws(() => createRuleMutation({ targetId: 'combo.ultras.enabled', mutatedValue: 0 }), /boolean/);
});

test('invalid mutations are rejected fail-closed', () => {
  assert.throws(() => createRuleMutation({ targetId: 'rank.99.magic', mutatedValue: 1 }), /MUTATION_TARGET_UNKNOWN|Unknown mutation target/);
  assert.throws(() => createRuleMutation({ targetId: 'match.goal', mutatedValue: 21 }), /MUTATION_NO_CHANGE|no rule would change/);
  assert.throws(() => createRuleMutation({ targetId: 'match.goal', mutatedValue: 500 }), /MUTATION_OUT_OF_RANGE|outside permitted range/);
  assert.throws(() => createRuleMutation({ targetId: 'match.goal', mutatedValue: 5.5 }), /MUTATION_TYPE_MISMATCH|integer/);
  assert.throws(() => validateRuleOverrides({ 'not.a.parameter': 1 }), /RULE_OVERRIDE_UNKNOWN_PARAMETER|Unknown experimental rule parameter/);
});

// ── Engine application + baseline integrity ───────────────────────────────────

test('scoped overrides apply inside the mutant state only', () => {
  const control = stateWith(null);
  const mutant = stateWith({ 'match.goal': 5, 'miniTurns.perTurn': 3, 'voltage.enabled': false });
  assert.equal(readRuleOverrides(control), null, 'control state carries no override metadata');
  assert.equal(resolveRuleNumber(control, 'match.goal'), 21, 'control resolves canonical goal');
  assert.equal(resolveRuleNumber(mutant, 'match.goal'), 5, 'mutant resolves overridden goal');
  assert.equal(resolveRuleNumber(mutant, 'miniTurns.perTurn'), 3);
  assert.equal(resolveRuleFlag(mutant, 'voltage.enabled'), false);
  // Unmutated parameters inside the mutant resolve canonical baselines.
  assert.equal(resolveRuleNumber(mutant, 'rank.A.prPoints'), 4);
});

test('override metadata travels with cloned state and never mutates the registry', () => {
  const mutant = stateWith({ 'match.goal': 5 });
  const clone = structuredClone(mutant);
  assert.equal(resolveRuleNumber(clone, 'match.goal'), 5, 'clone retains scoped overrides');
  assert.equal(EXPERIMENTAL_RULE_PARAMETERS['match.goal'].baseline, 21, 'registry baseline is immutable');
});

test('control and mutant matches on the same seed diverge only through the mutation', () => {
  const base = { seed: 4242, policyIds: ['tempo-tactical', 'tempo-tactical'], profileId: PROFILE, decisionLimit: 300 };
  const control = runPolicyMatch(base).summary;
  const mutant = runPolicyMatch({ ...base, ruleOverrides: { 'match.goal': 5 } }).summary;
  const controlAgain = runPolicyMatch(base).summary;
  assert.notEqual(control.matchId, mutant.matchId, 'matchId must bind the rules context');
  assert.equal(control.matchId, controlAgain.matchId, 'control runs are reproducible');
  assert.equal(control.finalStateHash, controlAgain.finalStateHash, 'no mutation leaks into later control runs');
  assert.equal(control.matchResultHash, controlAgain.matchResultHash);
  assert.equal(control.ruleOverrides, null);
  assert.deepEqual(mutant.ruleOverrides, { 'match.goal': 5 });
});

// ── Matched A/B plan ──────────────────────────────────────────────────────────

test('matched-seed plan pairs every control spec with an identical-seed mutant spec', () => {
  const mutation = createRuleMutation({ targetId: 'rank10.heartTempo.miniTurns', mutatedValue: 1 });
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical', 'control-tactical'], gamesPerArm: 10, seedBase: 1337 });
  const plan = buildMutationExperimentPlan({ experimentId: 'EXP-T', mutation, config });
  assert.equal(plan.specs.length, 20);
  const control = plan.specs.filter((s) => s.arm === 'control');
  const mutant = plan.specs.filter((s) => s.arm === 'mutant');
  assert.equal(control.length, 10);
  assert.equal(mutant.length, 10);
  for (const c of control) {
    const m = mutant.find((s) => s.pairedRunId === c.pairedRunId);
    assert.ok(m, `no mutant spec for pair ${c.pairedRunId}`);
    assert.equal(m.seed, c.seed, 'matched seeds must be identical');
    assert.deepEqual(m.seatOrder, c.seatOrder, 'seat order must match');
    assert.deepEqual(m.policyIds, c.policyIds);
    assert.equal(c.ruleOverrides, null, 'control arm never carries overrides');
    assert.deepEqual(m.ruleOverrides, { 'rank10.heartTempo.miniTurns': 1 });
  }
  // AB/BA seat alternation is preserved within each arm.
  assert.ok(control.some((s) => s.seatSwapped) && control.some((s) => !s.seatSwapped));
});

test('unmatched-seed mode uses independent deterministic streams and says so', () => {
  const a = matchSeed({ seedBase: 1, policyId: 'control', profileId: PROFILE, ordinal: 0, arm: 'control', matchedSeeds: true });
  const b = matchSeed({ seedBase: 1, policyId: 'control', profileId: PROFILE, ordinal: 0, arm: 'mutant', matchedSeeds: true });
  const c = matchSeed({ seedBase: 1, policyId: 'control', profileId: PROFILE, ordinal: 0, arm: 'mutant', matchedSeeds: false });
  assert.equal(a, b, 'matched mode: arm name excluded from derivation');
  assert.notEqual(a, c, 'independent mode: arm enters the derivation');
});

// ── Aggregation / pairing / impact vector ─────────────────────────────────────

function stub({ pairedRunId, seed = 7, seatOrder = ['P1', 'P2'], policyId = 'tempo-tactical', winner = 'P1', winningSeat = 1, turns = 10 }) {
  return {
    winner, winningSeat, terminationReason: 'NORMAL_VICTORY', errorCode: null,
    completedFullTurns: turns, scoreMargin: 3, commandCount: 40, eventCount: 60,
    actionCounts: { play: 5 }, decisionFamilyCounts: { super: 1, score: 4 },
    participants: [{ miniTurnActionCount: 6 }, { miniTurnActionCount: 5 }],
    advancedDecisionCount: 1, voltageDecisionCount: 0, ultraDecisionCount: 0,
    triggerCount: 0, responseDecisionCount: 2, privateChoiceDecisionCount: 0,
    policyIds: [policyId, policyId], pairedRunId, seed, seatOrder, ruleCompliance: { status: 'PASS' },
  };
}

test('arms aggregate separately and pair on seed + seat order + policies', () => {
  const control = [stub({ pairedRunId: 'P-0' }), stub({ pairedRunId: 'P-1', winningSeat: 2, winner: 'P2' })];
  const mutant = [stub({ pairedRunId: 'P-0', turns: 14 }), stub({ pairedRunId: 'P-1', turns: 12 })];
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  assert.equal(c.games, 2);
  assert.equal(m.games, 2);
  assert.equal(c.decisive, 2);
  assert.equal(m.turns.mean, 13);
  const pairing = pairArmResults(control, mutant);
  assert.equal(pairing.pairs.length, 2);
  assert.equal(pairing.coverage, 1);
  const comparison = compareArms(c, m, pairing);
  assert.equal(comparison.matched, true);
  const turnsRow = comparison.rows.find((r) => r.key === 'meanTurns');
  assert.equal(turnsRow.delta, 3, 'mean-turn delta is mutant − control over paired games');
  assert.equal(turnsRow.paired, true);
  const seatRow = comparison.rows.find((r) => r.key === 'seat1WinRate');
  assert.equal(seatRow.control, 0.5);
  assert.equal(seatRow.mutant, 1);
});

test('unpaired results are reported honestly, never silently merged', () => {
  const control = [stub({ pairedRunId: 'P-0' })];
  const mutant = [stub({ pairedRunId: 'P-9', seed: 999 })];
  const pairing = pairArmResults(control, mutant);
  assert.equal(pairing.pairs.length, 0);
  assert.equal(pairing.unpairedControl.length, 1);
  assert.equal(pairing.unpairedMutant.length, 1);
  const comparison = compareArms(summarizeMutationArm(control), summarizeMutationArm(mutant), pairing);
  assert.equal(comparison.matched, false);
  assert.equal(comparison.pairedCoverage, 0);
});

test('profile differential keeps per-profile samples and marks thin samples', () => {
  const control = [
    stub({ pairedRunId: 'A-0', policyId: 'tempo-tactical' }),
    stub({ pairedRunId: 'B-0', policyId: 'control-tactical' }),
  ];
  const mutant = [
    stub({ pairedRunId: 'A-0', policyId: 'tempo-tactical', turns: 16 }),
    stub({ pairedRunId: 'B-0', policyId: 'control-tactical', turns: 9 }),
  ];
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  const deltas = compareArms(c, m, pairArmResults(control, mutant)).policyDeltas;
  const tempo = deltas.find((d) => d.policyId === 'tempo-tactical');
  const ctrl = deltas.find((d) => d.policyId === 'control-tactical');
  assert.equal(tempo.n.control, 1);
  assert.equal(tempo.turnsDelta, 6);
  assert.equal(ctrl.turnsDelta, -1);
  assert.equal(tempo.warning, 'SMALL_SAMPLE', 'thin samples are marked, not overstated');
});

// ── Regression detection + classification ─────────────────────────────────────

test('regression detector fires on measured increases in aborts and long games', () => {
  const control = Array.from({ length: 40 }, (_, i) => stub({ pairedRunId: `P-${i}` }));
  const mutant = Array.from({ length: 40 }, (_, i) => i < 10
    ? stub({ pairedRunId: `P-${i}`, turns: 140 })
    : stub({ pairedRunId: `P-${i}` }));
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  const comparison = compareArms(c, m, pairArmResults(control, mutant));
  const reg = detectRegressions({ control: c, mutant: m, comparison });
  assert.ok(reg.checked.includes('long-games'));
  assert.ok(reg.unmeasured.includes('strategy-diversity'), 'unmeasured checks disclosed');
  assert.ok(reg.findings.some((f) => f.code === 'LONG_GAME_FREQUENCY'));
});

test('clear run reports what was checked, not a blanket no-regressions claim', () => {
  const control = [stub({ pairedRunId: 'P-0' }), stub({ pairedRunId: 'P-1' })];
  const mutant = [stub({ pairedRunId: 'P-0' }), stub({ pairedRunId: 'P-1' })];
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  const reg = detectRegressions({ control: c, mutant: m, comparison: compareArms(c, m, pairArmResults(control, mutant)) });
  assert.equal(reg.status, 'CLEAR');
  assert.ok(reg.checked.length >= 5);
});

test('outcome classification is deterministic and marks thin samples provisional', () => {
  const control = [stub({ pairedRunId: 'P-0' }), stub({ pairedRunId: 'P-1' })];
  const mutant = [stub({ pairedRunId: 'P-0' }), stub({ pairedRunId: 'P-1' })];
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  const comparison = compareArms(c, m, pairArmResults(control, mutant));
  const regressions = detectRegressions({ control: c, mutant: m, comparison });
  const mutation = createRuleMutation({ targetId: 'match.goal', mutatedValue: 30 });
  const outcome = classifyOutcome({ comparison, regressions, mutation });
  assert.equal(outcome.verdict, 'INCONCLUSIVE');
  assert.equal(outcome.provisional, true, 'small samples mark the verdict provisional');
});

// ── Artifact: serialization / persistence envelope ────────────────────────────

test('experiment artifact round-trips through serialization and validation', () => {
  const mutation = createRuleMutation({ targetId: 'miniTurns.hardCap', mutatedValue: 2 });
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical'], gamesPerArm: 4, seedBase: 7 });
  const record = createExperimentRecord({
    experimentId: 'EXP-TEST', createdAt: '2026-01-01T00:00:00.000Z',
    baseline: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '0.0.0', authorityHash: 'abc' },
    mutation, hypothesis: 'Test hypothesis', config,
  });
  const control = Array.from({ length: 4 }, (_, i) => stub({ pairedRunId: `PAIR-EXP-TEST-tempo-tactical-${i}` }));
  const mutant = Array.from({ length: 4 }, (_, i) => stub({ pairedRunId: `PAIR-EXP-TEST-tempo-tactical-${i}`, turns: 12 }));
  const final = finalizeExperimentRecord(record, { controlSummaries: control, mutantSummaries: mutant, completedSpecCount: 8, plannedSpecCount: 8 });
  assert.equal(final.status, 'complete');
  assert.equal(final.experimentType, 'rule-mutation');
  assert.equal(final.execution.matchedSeeds, true);
  const text = serializeExperiment(final);
  const parsed = validateExperimentRecord(JSON.parse(text));
  assert.equal(parsed.experimentId, 'EXP-TEST');
  assert.equal(parsed.contentHash, final.contentHash, 'content hash stable across round-trip');
  const compact = compactExperimentRecord(final, { retainSummaries: 2 });
  assert.equal(compact.arms.control.summaries.length, 2);
  assert.equal(compact.arms.control.summariesDropped, 2);
});

test('artifact validation rejects non-experiment, wrong schema and tampered mutation', () => {
  assert.throws(() => validateExperimentRecord({}), /experiment artifact|Expected experimentType/);
  const mutation = createRuleMutation({ targetId: 'match.goal', mutatedValue: 10 });
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical'], gamesPerArm: 2, seedBase: 7 });
  const record = createExperimentRecord({ experimentId: 'EXP-X', createdAt: 'x', baseline: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '0' }, mutation, hypothesis: '', config });
  assert.throws(() => validateExperimentRecord({ ...record, schemaVersion: 99 }), /schema version/);
  const tampered = { ...record, mutation: { ...record.mutation, mutatedValue: 12 } };
  assert.throws(() => validateExperimentRecord(tampered), /does not match its content hash/);
});

// ── UI smoke (static) ─────────────────────────────────────────────────────────

test('mutation chamber workspace renders scientific control surface and is routed', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/mutation.js', 'utf8');
  assert.match(src, /export function renderMutationChamber/);
  assert.match(src, /data-testid="mutation-chamber"/);
  assert.match(src, /data-testid="mut-impact"/);
  assert.match(src, /data-testid="mut-profiles"/);
  assert.match(src, /data-testid="mut-regressions"/);
  assert.match(src, /run-mutation-segment/);
  const router = await readFile('apps/lab-web/src/router.js', 'utf8');
  assert.match(router, /'\/mutation','⚖','Mutation Chamber'/);
  const app = await readFile('apps/lab-web/src/app.js', 'utf8');
  assert.match(app, /import \{ renderMutationChamber, cleanupMutationChamber \}/);
  assert.match(app, /'\/mutation': renderMutationChamber/);
  const worker = await readFile('apps/lab-web/src/worker.js', 'utf8');
  assert.match(worker, /run-mutation-segment/);
  const store = await readFile('apps/lab-web/src/evolution/evolution-store.mjs', 'utf8');
  assert.match(store, /createObjectStore\('mutations'/);
});
