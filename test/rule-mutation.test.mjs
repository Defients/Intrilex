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
import { runMutationSegments } from '../apps/lab-web/src/workspaces/mutation-runner.mjs';
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

function stub({ pairedRunId, seed = 7, seatOrder = ['P1', 'P2'], policyId = 'tempo-tactical', winner = 'P1', winningSeat = 1, turns = 10, ruleOverrides = null, terminationReason = 'NORMAL_VICTORY', errorCode = null }) {
  return {
    winner, winningSeat, terminationReason, errorCode,
    completedFullTurns: turns, scoreMargin: 3, commandCount: 40, eventCount: 60,
    actionCounts: { play: 5 }, decisionFamilyCounts: { super: 1, score: 4 },
    participants: [{ miniTurnActionCount: 6 }, { miniTurnActionCount: 5 }],
    advancedDecisionCount: 1, voltageDecisionCount: 0, ultraDecisionCount: 0,
    triggerCount: 0, responseDecisionCount: 2, privateChoiceDecisionCount: 0,
    policyIds: [policyId, policyId], pairedRunId, seed, seatOrder, ruleCompliance: { status: 'PASS' }, ruleOverrides,
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

// Build a summary whose identity fields (pairedRunId, seed, seatOrder,
// policyIds) match a plan spec exactly — required for the execution ledger.
function stubForSpec(spec, overrides = {}) {
  return stub({
    pairedRunId: spec.pairedRunId, seed: spec.seed,
    seatOrder: spec.seatOrder, policyId: spec.policyId,
    ruleOverrides: spec.ruleOverrides ?? null, ...overrides,
  });
}

function planAndSummaries({ experimentId = 'EXP-TEST', mutation, config, mutantTurns = 12 } = {}) {
  const plan = buildMutationExperimentPlan({ experimentId, mutation, config });
  const controlSummaries = plan.specs.filter((s) => s.arm === 'control').map((s) => stubForSpec(s));
  const mutantSummaries = plan.specs.filter((s) => s.arm === 'mutant').map((s) => stubForSpec(s, { turns: mutantTurns }));
  const record = createExperimentRecord({
    experimentId, createdAt: '2026-01-01T00:00:00.000Z',
    baseline: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '0.0.0', authorityHash: 'abc' },
    mutation, hypothesis: 'Test hypothesis', config,
  });
  return { plan, record, controlSummaries, mutantSummaries };
}

test('experiment artifact round-trips through serialization and validation', () => {
  const mutation = createRuleMutation({ targetId: 'miniTurns.hardCap', mutatedValue: 2 });
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical'], gamesPerArm: 4, seedBase: 7 });
  const { plan, record, controlSummaries, mutantSummaries } = planAndSummaries({ mutation, config });
  const final = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries, plan,
    completedSpecCount: plan.specs.length, plannedSpecCount: plan.specs.length,
  });
  assert.equal(final.status, 'complete');
  assert.equal(final.experimentType, 'rule-mutation');
  assert.equal(final.execution.matchedSeeds, true);
  assert.equal(final.execution.ledger.exact, true);
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

// ── Execution ledger: COMPLETE = exact planned execution ──────────────────────

test('COMPLETE requires the exact planned spec set — count alone is insufficient', () => {
  const mutation = createRuleMutation({ targetId: 'miniTurns.hardCap', mutatedValue: 2 });
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical'], gamesPerArm: 4, seedBase: 7 });
  const { plan, record, controlSummaries, mutantSummaries } = planAndSummaries({ mutation, config });

  // Missing one planned mutant spec — same arm cannot substitute.
  const missing = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries: mutantSummaries.slice(1), plan,
    completedSpecCount: 7, plannedSpecCount: 8,
  });
  assert.equal(missing.status, 'incomplete');
  assert.equal(missing.execution.ledger.exact, false);
  assert.equal(missing.execution.ledger.missing.length, 1);

  // Duplicate spec standing in for a missing one — row count still 8.
  const dupMutant = [...mutantSummaries.slice(1), mutantSummaries[1]];
  const dup = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries: dupMutant, plan,
    completedSpecCount: 8, plannedSpecCount: 8,
  });
  assert.notEqual(dup.status, 'complete', 'a duplicate must not stand in for a missing spec');
  assert.equal(dup.execution.ledger.duplicates.length, 1);
  assert.equal(dup.execution.ledger.missing.length, 1);

  // Unexpected extra spec — count 9 ≥ 8, still not complete.
  const extra = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries: [...mutantSummaries, stub({ pairedRunId: 'PAIR-UNKNOWN-9', seed: 1 })], plan,
    completedSpecCount: 9, plannedSpecCount: 8,
  });
  assert.notEqual(extra.status, 'complete');
  assert.equal(extra.execution.ledger.unexpected.length, 1);

  // Wrong arm — a mutant summary reported under control identity mismatches
  // on ruleOverrides (matched seeds make seed/seat/policies identical, so the
  // override map is the arm discriminator). The mutant spec goes missing too.
  const wrongArm = finalizeExperimentRecord(record, {
    controlSummaries: [...controlSummaries, stubForSpec(plan.specs.find((s) => s.arm === 'mutant'))],
    mutantSummaries: mutantSummaries.slice(1), plan,
    completedSpecCount: 8, plannedSpecCount: 8,
  });
  assert.notEqual(wrongArm.status, 'complete');
  assert.ok(wrongArm.execution.ledger.mismatched.some((m) => m.endsWith(':ruleOverrides')), 'wrong-arm result caught by the override discriminator');
  assert.equal(wrongArm.execution.ledger.missing.length, 1);

  // Worker fault — disclosed as a non-execution, never a silent success.
  const fault = stubForSpec(plan.specs.find((s) => s.arm === 'mutant'), { winner: 'ABORTED', winningSeat: null, terminationReason: 'WORKER_FAULT', errorCode: 'MUTATION_WORKER_FAULT' });
  const faulted = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries: [fault, ...mutantSummaries.slice(1)], plan,
    completedSpecCount: 8, plannedSpecCount: 8,
  });
  assert.notEqual(faulted.status, 'complete');
  assert.equal(faulted.execution.ledger.faults, 1);

  // No plan at all — completeness is unprovable, fail closed.
  const noPlan = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries, plan: null,
    completedSpecCount: 8, plannedSpecCount: 8,
  });
  assert.notEqual(noPlan.status, 'complete', 'without a plan the ledger cannot verify execution');
});

test('COMPLETE artifact requires a verifiable ledger on load — count-based legacy claims are rejected', () => {
  const mutation = createRuleMutation({ targetId: 'miniTurns.hardCap', mutatedValue: 2 });
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical'], gamesPerArm: 4, seedBase: 7 });
  const { plan, record, controlSummaries, mutantSummaries } = planAndSummaries({ mutation, config });
  const final = finalizeExperimentRecord(record, {
    controlSummaries, mutantSummaries, plan,
    completedSpecCount: plan.specs.length, plannedSpecCount: plan.specs.length,
  });
  assert.equal(final.status, 'complete');
  // A legacy artifact claiming COMPLETE without an exact ledger is unverifiable.
  const legacy = JSON.parse(serializeExperiment(final));
  delete legacy.execution.ledger;
  assert.throws(() => validateExperimentRecord(legacy), (e) => e.code === 'EXPERIMENT_COMPLETENESS_UNPROVEN');
  // A forged ledger whose plan hash does not match the rebuilt plan is rejected.
  const forged = JSON.parse(serializeExperiment(final));
  forged.execution.ledger = { ...forged.execution.ledger, planHash: 'deadbeef' };
  assert.throws(() => validateExperimentRecord(forged), (e) => e.code === 'EXPERIMENT_PLAN_MISMATCH');
});

// ── Symmetric exact pairing ───────────────────────────────────────────────────

test('extra unmatched rows on EITHER arm break exact pairing', () => {
  const pairs = ['P-0', 'P-1'];
  const control = pairs.map((id) => stub({ pairedRunId: id }));
  const mutant = pairs.map((id) => stub({ pairedRunId: id }));

  const extraMutant = pairArmResults(control, [...mutant, stub({ pairedRunId: 'P-9', seed: 999 })]);
  assert.equal(extraMutant.coverage, 1, 'descriptive control coverage can still be 1');
  assert.equal(extraMutant.exact, false, 'extra unmatched mutant breaks exactness');
  assert.equal(extraMutant.unpairedMutant.length, 1);

  const extraControl = pairArmResults([...control, stub({ pairedRunId: 'P-8', seed: 998 })], mutant);
  assert.equal(extraControl.exact, false, 'extra unmatched control breaks exactness');
  assert.equal(extraControl.unpairedControl.length, 1);
  assert.equal(extraControl.mutantCoverage, 1);

  const comparison = compareArms(summarizeMutationArm(control), summarizeMutationArm([...mutant, stub({ pairedRunId: 'P-9', seed: 999 })]), extraMutant);
  assert.equal(comparison.matched, false, 'matched is the symmetric exact claim');
  assert.equal(comparison.pairedCoverage, 1, 'coverage remains descriptive');
  assert.ok(comparison.pairedMutantCoverage < 1, 'mutant-side coverage discloses the extra row');
});

// ── Per-policy sufficient statistics ─────────────────────────────────────────

test('per-policy seat1Wins survive aggregation and drive a nonzero differential', () => {
  // Control: seat 1 wins 3/4; mutant: seat 1 wins 1/4 — the delta must be
  // computed from raw counts, not reconstructed from rounded rates.
  const control = [
    stub({ pairedRunId: 'A-0' }), stub({ pairedRunId: 'A-1' }), stub({ pairedRunId: 'A-2' }),
    stub({ pairedRunId: 'A-3', winner: 'P2', winningSeat: 2 }),
  ];
  const mutant = [
    stub({ pairedRunId: 'A-0' }),
    stub({ pairedRunId: 'A-1', winner: 'P2', winningSeat: 2 }),
    stub({ pairedRunId: 'A-2', winner: 'P2', winningSeat: 2 }),
    stub({ pairedRunId: 'A-3', winner: 'P2', winningSeat: 2 }),
  ];
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  assert.equal(c.policyBreakdown['tempo-tactical'].seat1Wins, 3, 'control sufficient statistic preserved');
  assert.equal(m.policyBreakdown['tempo-tactical'].seat1Wins, 1, 'mutant sufficient statistic preserved');
  const deltas = compareArms(c, m, pairArmResults(control, mutant)).policyDeltas;
  const tempo = deltas.find((d) => d.policyId === 'tempo-tactical');
  assert.equal(tempo.n.decisiveControl, 4);
  assert.equal(tempo.n.decisiveMutant, 4);
  assert.equal(tempo.control.seat1WinRate, 0.75);
  assert.equal(tempo.mutant.seat1WinRate, 0.25);
  assert.ok(tempo.seat1Delta !== null && tempo.seat1Delta < 0, 'delta is nonzero — old omission collapsed it to 0');
});

// ── Direction-aware verdicts ──────────────────────────────────────────────────

function directionalComparison({ mutantTurns = 16, n = 40 } = {}) {
  // Mutant games run LONGER than control: supported increase on meanTurns.
  const control = Array.from({ length: n }, (_, i) => stub({ pairedRunId: `P-${i}`, turns: 10 }));
  const mutant = Array.from({ length: n }, (_, i) => stub({ pairedRunId: `P-${i}`, turns: mutantTurns + (i % 5) }));
  const c = summarizeMutationArm(control), m = summarizeMutationArm(mutant);
  const pairing = pairArmResults(control, mutant);
  return { comparison: compareArms(c, m, pairing), c, m };
}

test('supported movement AGAINST the declared direction is ADVERSE, never PROMISING', () => {
  const { comparison, c, m } = directionalComparison();
  const regressions = detectRegressions({ control: c, mutant: m, comparison });
  const turnsRow = comparison.rows.find((r) => r.key === 'meanTurns');
  assert.ok(turnsRow.delta > 0 && turnsRow.grade !== 'INSUFFICIENT', `fixture must show supported movement, got grade ${turnsRow.grade}`);
  const mutation = createRuleMutation({ targetId: 'match.goal', mutatedValue: 30 });
  const outcome = classifyOutcome({ comparison, regressions, mutation, objective: { metric: 'meanTurns', direction: 'decrease', minimumMeaningfulEffect: 0 } });
  assert.equal(outcome.verdict, 'ADVERSE');
});

test('supported movement IN the declared direction on the target metric is PROMISING', () => {
  const { comparison, c, m } = directionalComparison();
  const regressions = detectRegressions({ control: c, mutant: m, comparison });
  const mutation = createRuleMutation({ targetId: 'match.goal', mutatedValue: 30 });
  const outcome = classifyOutcome({ comparison, regressions, mutation, objective: { metric: 'meanTurns', direction: 'increase', minimumMeaningfulEffect: 0 } });
  assert.equal(outcome.verdict, 'PROMISING');
});

test('exploratory objective never reports movement as beneficial', () => {
  const { comparison, c, m } = directionalComparison();
  const regressions = detectRegressions({ control: c, mutant: m, comparison });
  const mutation = createRuleMutation({ targetId: 'match.goal', mutatedValue: 30 });
  const outcome = classifyOutcome({ comparison, regressions, mutation, objective: { metric: null, direction: 'exploratory' } });
  assert.notEqual(outcome.verdict, 'PROMISING');
  assert.equal(outcome.verdict, 'EXPLORATORY');
});

test('supported movement off the declared target metric is UNEXPECTED', () => {
  const { comparison, c, m } = directionalComparison();
  const regressions = detectRegressions({ control: c, mutant: m, comparison });
  const mutation = createRuleMutation({ targetId: 'match.goal', mutatedValue: 30 });
  const outcome = classifyOutcome({ comparison, regressions, mutation, objective: { metric: 'meanMargin', direction: 'increase', minimumMeaningfulEffect: 0 } });
  assert.equal(outcome.verdict, 'UNEXPECTED');
});

test('experiment objective is validated, frozen into config and serialized', () => {
  const objective = { metric: 'meanTurns', direction: 'decrease', minimumMeaningfulEffect: 1 };
  const config = createExperimentConfig({ profileId: PROFILE, population: ['tempo-tactical'], gamesPerArm: 4, seedBase: 7, objective });
  assert.deepEqual(config.objective, objective);
  assert.throws(() => createExperimentConfig({ profileId: PROFILE, population: ['x'], gamesPerArm: 4, objective: { metric: 'bogus', direction: 'increase' } }), (e) => e.code === 'OBJECTIVE_METRIC_INVALID');
  assert.throws(() => createExperimentConfig({ profileId: PROFILE, population: ['x'], gamesPerArm: 4, objective: { metric: 'meanTurns', direction: 'sideways' } }), (e) => e.code === 'OBJECTIVE_DIRECTION_INVALID');
});

// ── Worker-segment lifecycle: cancellation can never hang ─────────────────────

function fakeWorkerFactory({ autoResult = false, capture = [] } = {}) {
  return (index) => {
    const worker = {
      index, terminated: false, posted: null,
      postMessage(msg) { worker.posted = msg; },
      terminate() { worker.terminated = true; },
      emit(data) { worker.onmessage?.({ data }); },
      fail() { worker.onerror?.(new Error('boom')); },
    };
    capture.push(worker);
    if (autoResult) {
      setTimeout(() => worker.emit({
        type: 'mutation-segment-result', ok: true,
        resultsJson: JSON.stringify(worker.posted.specs.map((s) => ({ arm: s.arm, pairedRunId: s.pairedRunId, ok: true, summary: stubForSpec(s) }))),
      }));
    }
    return worker;
  };
}

function fakeSegments(count = 6) {
  // Minimal spec-shaped rows — the runner only needs identity fields.
  return Array.from({ length: count }, (_, i) => [{
    arm: i % 2 === 0 ? 'control' : 'mutant', pairIndex: i,
    pairedRunId: `P-${i}`, ordinal: i, seed: i + 1,
    policyId: 'tempo-tactical', policyIds: ['tempo-tactical', 'tempo-tactical'],
    seatOrder: ['P1', 'P2'], ruleOverrides: null,
  }]);
}

test('cancel settles every segment promise — runExperiment-style await can never hang', async () => {
  const workers = [];
  const segments = fakeSegments(6);
  const runner = runMutationSegments(segments, { createWorker: fakeWorkerFactory({ capture: workers }) });
  assert.equal(workers.length, segments.length);
  runner.cancel();
  runner.cancel(); // idempotent — repeated cancel is harmless
  const results = await runner.promise; // must resolve — not hang
  assert.equal(runner.pending, 0);
  assert.ok(workers.every((w) => w.terminated), 'every worker terminated');
  assert.equal(results.flat().filter((r) => r.error === 'CANCELLED').length, segments.length);
});

test('late worker messages cannot mutate a settled (cancelled) segment', async () => {
  const workers = [];
  const runner = runMutationSegments(fakeSegments(2), { createWorker: fakeWorkerFactory({ capture: workers }) });
  runner.cancel();
  // A dying worker emitting after cancel must be ignored.
  workers[0].emit({ type: 'mutation-segment-result', ok: true, resultsJson: JSON.stringify([{ arm: 'control', ok: true }]) });
  const results = await runner.promise;
  assert.equal(results[0][0].error, 'CANCELLED', 'late success cannot overwrite the cancelled row');
});

test('worker error and spawn failure settle as disclosed fault rows', async () => {
  const workers = [];
  const runner = runMutationSegments(fakeSegments(2), { createWorker: fakeWorkerFactory({ capture: workers }) });
  workers[0].fail();
  workers[1].emit({ type: 'mutation-segment-result', ok: false, error: 'INNER_FAULT' });
  const results = await runner.promise;
  assert.equal(results.flat().every((r) => r.ok === false), true);
  assert.ok(workers.every((w) => w.terminated));

  const spawnRunner = runMutationSegments(fakeSegments(1), { createWorker: () => { throw new Error('no workers'); } });
  const spawned = await spawnRunner.promise;
  assert.match(spawned[0][0].error, /WORKER_SPAWN_FAILED/);
});

test('a new run can start immediately after cancel', async () => {
  const first = runMutationSegments(fakeSegments(1), { createWorker: fakeWorkerFactory() });
  first.cancel();
  await first.promise;
  const workers = [];
  const second = runMutationSegments(fakeSegments(1), { createWorker: fakeWorkerFactory({ capture: workers, autoResult: true }) });
  const results = await second.promise;
  assert.equal(results[0][0].ok, true, 'fresh run completes normally after a cancelled run');
});

// ── UI smoke (static) ─────────────────────────────────────────────────────────

test('mutation chamber workspace renders scientific control surface and is routed', async () => {
  const src = await readFile('apps/lab-web/src/workspaces/mutation.js', 'utf8');
  assert.match(src, /export function renderMutationChamber/);
  assert.match(src, /data-testid="mutation-chamber"/);
  assert.match(src, /data-testid="mut-impact"/);
  assert.match(src, /data-testid="mut-profiles"/);
  assert.match(src, /data-testid="mut-regressions"/);
  assert.match(src, /runMutationSegments/);
  const runner = await readFile('apps/lab-web/src/workspaces/mutation-runner.mjs', 'utf8');
  assert.match(runner, /run-mutation-segment/);
  assert.match(runner, /cancel\(error = 'CANCELLED'\)/);
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

// ── Workspace lifecycle: cancellation is owned by a per-run execution
// token — rendering can never change whether an experiment was cancelled,
// and a settled-after-unmount run never resurrects the workspace. ────────

async function mutationWorkspace() {
  const { runInNewContext } = await import('node:vm');
  const md = await import('@intrilex/simulation-runtime/mutation-domain');
  const src = (await readFile('apps/lab-web/src/workspaces/mutation.js', 'utf8'))
    .replace(/import\s[\s\S]*?from\s*'[^']*';/g, '')
    .replace(/\bexport /g, '');
  const workers = [];
  class FakeWorker {
    constructor() { this.posted = null; this.terminated = false; workers.push(this); }
    postMessage(m) { this.posted = m; }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage?.({ data }); }
    fail(e) { this.onerror?.(e); }
  }
  const savedMutations = [];
  const appEl = { innerHTML: '' };
  const sandbox = {
    app: appEl,
    esc: (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    fmt: (n) => String(n),
    LAB_IDENTITY: { fingerprint: 'f'.repeat(64), engineVersion: 't-engine', rulesVersion: 't-rules', engineHash: 'e'.repeat(64), runtimeHash: 'r'.repeat(64) },
    LAB_VERSION: '0.0.0-test',
    MUTATION_TARGETS: md.MUTATION_TARGETS,
    MUTATION_TARGET_BY_ID: md.MUTATION_TARGET_BY_ID,
    MUTATION_LIMITS: md.MUTATION_LIMITS,
    MUTATION_OBJECTIVE_METRICS: md.MUTATION_OBJECTIVE_METRICS,
    MUTATION_OBJECTIVE_DIRECTIONS: md.MUTATION_OBJECTIVE_DIRECTIONS,
    createRuleMutation: md.createRuleMutation,
    createExperimentConfig: md.createExperimentConfig,
    buildMutationExperimentPlan: md.buildMutationExperimentPlan,
    createExperimentRecord: md.createExperimentRecord,
    finalizeExperimentRecord: md.finalizeExperimentRecord,
    compactExperimentRecord: md.compactExperimentRecord,
    serializeExperiment: md.serializeExperiment,
    mutationDisplay: md.mutationDisplay,
    EvolutionStore: class {
      async listMutations() { return []; }
      async saveMutation(r) { savedMutations.push(r); }
      async loadMutation() { throw new Error('not-found'); }
    },
    parseMutationImport: () => { throw new Error('n/a'); },
    runMutationSegments,
    Worker: FakeWorker,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ click() {}, setAttribute() {} }),
    },
    Blob: class {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    location: { hash: '#/mutation' },
    history: { replaceState() {} },
    console,
  };
  const ctx = runInNewContext(`${src}\n({ renderMutationChamber, cleanupMutationChamber, runExperiment, cancelExperiment, view })`, sandbox);
  return { ctx, workers, savedMutations, appEl };
}

/** Result message a real worker sends for a fully-executed segment. */
function segmentResult(worker, summaryForSpec) {
  return {
    type: 'mutation-segment-result', ok: true,
    resultsJson: JSON.stringify(worker.posted.specs.map((s) => ({ arm: s.arm, pairedRunId: s.pairedRunId, ok: true, summary: summaryForSpec(s) }))),
  };
}

function okSummary(spec) {
  return {
    winner: 'P1', winningSeat: 1, terminationReason: 'NORMAL_VICTORY', errorCode: null,
    completedFullTurns: 10, scoreMargin: 3, commandCount: 40, eventCount: 60,
    actionCounts: {}, decisionFamilyCounts: {}, participants: [{}, {}],
    policyIds: spec.policyIds, pairedRunId: spec.pairedRunId, seed: spec.seed,
    seatOrder: spec.seatOrder, ruleCompliance: { status: 'PASS' }, ruleOverrides: spec.ruleOverrides ?? null,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('workspace: start → cancel → render → settlement stays cancelled, never a normal worker-fault run', async () => {
  const { ctx, workers, savedMutations } = await mutationWorkspace();
  ctx.renderMutationChamber();
  const p = ctx.runExperiment();
  await settle();
  assert.ok(workers.length > 0, 'workers must be live before cancel');
  ctx.cancelExperiment();
  // THE regression: rendering must not erase the cancellation.
  ctx.renderMutationChamber();
  await p;
  assert.equal(ctx.view.record.status, 'incomplete', 'cancelled run closes incomplete — never a finished verdict');
  assert.equal(ctx.view.record.execution.cancelled, true);
  assert.equal(ctx.view.record.execution.completedSpecCount, 0);
  assert.ok(!ctx.view.record.execution.ledger, 'cancelled run never reaches ledger finalization');
  assert.equal(savedMutations.length, 0, 'a cancelled experiment is not autosaved as if it completed');
  assert.equal(ctx.view.running, false);
});

test('workspace: cancel twice is harmless; cancel with no run is a no-op', async () => {
  const { ctx } = await mutationWorkspace();
  ctx.renderMutationChamber();
  ctx.cancelExperiment();          // no run — must not throw
  const p = ctx.runExperiment();
  await settle();
  ctx.cancelExperiment();
  ctx.cancelExperiment();          // second cancel — idempotent
  await p;
  assert.equal(ctx.view.record.status, 'incomplete');
  assert.equal(ctx.view.record.execution.cancelled, true);
});

test('workspace: navigating away while running cancels and never resurrects the chamber', async () => {
  const { ctx, appEl, savedMutations } = await mutationWorkspace();
  ctx.renderMutationChamber();
  const p = ctx.runExperiment();
  await settle();
  ctx.cleanupMutationChamber();    // route change — cancel + unmount
  const htmlAtCleanup = appEl.innerHTML;
  await p;                          // async settlement lands after unmount
  assert.equal(ctx.view.mounted, false);
  assert.equal(appEl.innerHTML, htmlAtCleanup, 'no post-unmount render may resurrect the workspace');
  assert.equal(ctx.view.record.status, 'incomplete');
  assert.equal(ctx.view.record.execution.cancelled, true);
  assert.equal(savedMutations.length, 0);
});

test('workspace: late worker messages after cancel are ignored', async () => {
  const { ctx, workers } = await mutationWorkspace();
  ctx.renderMutationChamber();
  const p = ctx.runExperiment();
  await settle();
  const victim = workers[0];
  ctx.cancelExperiment();
  // A dying worker emitting a success after cancel cannot un-cancel the run.
  victim.emit({ type: 'mutation-segment-result', ok: true, resultsJson: JSON.stringify(victim.posted.specs.map((s) => ({ arm: s.arm, ok: true }))) });
  await p;
  assert.equal(ctx.view.record.status, 'incomplete');
  assert.equal(ctx.view.record.execution.cancelled, true);
  assert.equal(ctx.view.record.execution.completedSpecCount, 0, 'late results never count as completed specs');
});

test('workspace: a fresh run after cancel starts clean and completes normally', async () => {
  const { ctx, workers, savedMutations } = await mutationWorkspace();
  ctx.renderMutationChamber();
  const first = ctx.runExperiment();
  await settle();
  ctx.cancelExperiment();
  await first;
  assert.equal(ctx.view.record.status, 'incomplete');
  // Fresh run — workers that actually deliver results.
  const p2 = ctx.runExperiment();
  await settle();
  for (const w of workers.slice(-Math.ceil(workers.length / 2))) {
    // only the newest run's workers emit — but all captured workers belong
    // to run 2 except run 1's already-terminated set.
    if (!w.terminated && w.posted?.specs) w.emit(segmentResult(w, okSummary));
  }
  await p2;
  assert.equal(ctx.view.record.status, 'complete', 'the fresh run finalizes against its own token');
  assert.equal(ctx.view.record.execution.cancelled ?? null, null, 'a completed run never inherits the cancelled flag');
  assert.equal(savedMutations.length, 1, 'exactly the completed experiment is autosaved');
});
