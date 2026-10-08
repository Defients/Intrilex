import { evolutionIdentity } from '../scripts/evolution-identity.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ACTION_FIXTURES, actionFixture } from '../packages/policies/test/action-fixtures.mjs';
import { createSimulationDecisionFrame, strictPolicyView } from '../packages/engine-adapter/src/adapter.mjs';
import { chooseWeightedAction } from '../packages/policies/src/weighted-heuristic.mjs';
import { createCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import {
  strictCanonical, digest, makeArtifact, validateArtifact, TRAIT_CATALOG, compileTraits, ZERO_GENOME, resolveObjective, resolvePromotionPolicy, validatePolicyForObjective,
  resolveEra, canExecuteCheckpoint, canCompareMeasurements, requireContract, validateMutationConstraints, validateIdentityConstraints, resolveTemplate, TEMPLATE_CATALOG,
  VERSIONED_CONTRACT_FUNCTIONS, headToken, sameHead,
} from '../packages/simulation-runtime/src/profile-contracts.mjs';
import { VERSIONED_JOURNAL_FUNCTIONS } from '../packages/simulation-runtime/src/profile-journal.mjs';
import { VERSIONED_SCIENCE_FUNCTIONS } from '../packages/simulation-runtime/src/profile-science.mjs';
import { identity } from './fixtures/agent-profile-fixtures.mjs';

const code = fn => { try { fn(); } catch (error) { return error.code ?? error.message; } return 'NO_ERROR'; };

test('strict canonical form rejects undefined, non-finite and class values instead of normalizing them', () => {
  assert.equal(code(() => strictCanonical({ a: undefined })), 'UNDEFINED_FIELD');
  for (const bad of [NaN, Infinity, -Infinity]) assert.equal(code(() => strictCanonical({ a: [1, bad] })), 'NON_FINITE_NUMBER');
  assert.equal(code(() => strictCanonical({ a: new Date(0) })), 'UNSUPPORTED_VALUE');
  assert.equal(code(() => strictCanonical({ a: 1n })), 'UNSUPPORTED_VALUE');
  assert.equal(digest({ b: 1, a: -0 }), digest({ a: 0, b: 1 }), '-0 is canonicalized to 0 and key order is irrelevant');
});

test('artifact identity covers nested content: an altered nested value under the same ID is rejected', () => {
  const a = makeArtifact('EVIDENCE_PACK', { purpose: 'TRAINING', seeds: [1, 2, 3], nested: { deep: { value: 1 } } }, { scope: 'AP-x' });
  validateArtifact(a);
  const forged = structuredClone(a); forged.body.nested.deep.value = 2;
  assert.equal(code(() => validateArtifact(forged)), 'ARTIFACT_DIGEST_MISMATCH');
  const rescoped = { ...structuredClone(a), scope: 'AP-y' };
  assert.equal(code(() => validateArtifact(rescoped)), 'ARTIFACT_DIGEST_MISMATCH', 'scope is part of identity');
  assert.equal(a.id, makeArtifact('EVIDENCE_PACK', a.body, { scope: 'AP-x', meta: { recordedAt: 'other time' } }).id, 'descriptive meta is excluded');
});

test('every shipped semantic control changes the top-ranked legal action in real authority fixtures', () => {
  for (const trait of TRAIT_CATALOG) {
    const extremes = [trait.min, trait.max].filter(v => v !== 0);
    let changed = 0;
    for (const fixture of ACTION_FIXTURES) {
      const frame = createSimulationDecisionFrame(actionFixture(fixture));
      if (frame.status !== 'PLAYER_DECISION_REQUIRED') continue;
      const context = { actorId: frame.decisionActorId, authorizedView: strictPolicyView(frame.state, frame.decisionActorId), legalActions: frame.policyActions };
      const base = chooseWeightedAction(ZERO_GENOME(), context).actionId;
      for (const value of extremes) if (chooseWeightedAction(compileTraits({ traits: { [trait.traitId]: value }, baseGenome: ZERO_GENOME() }).policyState, context).actionId !== base) changed++;
    }
    assert.ok(changed > 0, `${trait.traitId} is a placebo control`);
  }
  assert.equal(new Set(TRAIT_CATALOG.map(t => t.parameter)).size, TRAIT_CATALOG.length, 'no duplicate aliases');
});

test('trait compiler is deterministic, declares writes and copies unrelated (learned) parameters unchanged', () => {
  const learned = ZERO_GENOME(); learned.weights.tempo = 750; learned.weights.risk = -250;
  const a = compileTraits({ traits: { scoringDrive: 25 }, baseGenome: learned }), b = compileTraits({ traits: { scoringDrive: 25 }, baseGenome: learned });
  assert.deepEqual(a, b);
  assert.deepEqual(a.parametersWritten, ['points']);
  assert.equal(a.policyState.weights.points, 500);
  assert.equal(a.policyState.weights.tempo, 750); assert.equal(a.policyState.weights.risk, -250);
  assert.equal(learned.weights.points, 0, 'base genome is not mutated');
  assert.equal(code(() => compileTraits({ traits: { guard: -10 }, baseGenome: ZERO_GENOME() })), 'TRAIT_OUT_OF_RANGE', 'placebo negative Guard is not offered');
  assert.equal(code(() => compileTraits({ traits: { aggression: 10 }, baseGenome: ZERO_GENOME() })), 'UNSUPPORTED_TRAIT');
});

test('templates are optional snapshots; editing a catalog cannot change an already resolved template', () => {
  const catalog = structuredClone(TEMPLATE_CATALOG), before = resolveTemplate('scoring-pressure', 1, catalog);
  catalog.find(t => t.templateId === 'scoring-pressure').traits.scoringDrive = 90;
  const after = resolveTemplate('scoring-pressure', 1, catalog);
  assert.equal(before.resolvedTraits.scoringDrive, 40);
  assert.notEqual(before.templateDigest, after.templateDigest, 'a changed template is a different template digest');
  assert.equal(code(() => resolveTemplate('scoring-pressure', 2)), 'UNSUPPORTED_TEMPLATE', 'unknown versions never map to latest');
});

test('objective instances are immutable, versioned and distinct per rules profile; policies cannot weaken them', () => {
  const a = resolveObjective({ rulesProfileId: 'core-advanced-authority' }), b = resolveObjective({ rulesProfileId: 'core-unrestricted-authority' });
  assert.notEqual(a.id, b.id); assert.equal(a.id, resolveObjective({ rulesProfileId: 'core-advanced-authority' }).id);
  assert.equal(a.body.definitionId, 'GENERALIST_PAIRED_SCORE'); assert.equal(a.body.definitionVersion, 1);
  const policy = resolvePromotionPolicy();
  validatePolicyForObjective(policy.body, a.body);
  assert.equal(code(() => validatePolicyForObjective({ ...policy.body, regressionFloor: 0.5 }, a.body)), 'POLICY_WEAKENS_OBJECTIVE');
  assert.equal(code(() => validatePolicyForObjective({ ...policy.body, policyVersion: 2 }, a.body)), 'UNSUPPORTED_CONTRACT_VERSION');
  assert.equal(code(() => requireContract('optimizer', 'ONE_PLUS_LAMBDA_V1', 2)), 'UNSUPPORTED_CONTRACT_VERSION');
  assert.equal(policy.body.budget.blocks, 48); assert.equal(policy.body.practicalThreshold, 0.02); assert.equal(policy.body.estimator.confidence, 0.95);
  assert.equal(policy.body.tailGuard.id, 'TAIL_BALANCE_V1');
  assert.equal(code(() => validatePolicyForObjective({ ...policy.body, tailGuard: null }, a.body)), 'INVALID_PROMOTION_POLICY', 'the tail guard cannot be dropped');
});

test('evaluation eras bind implementation, opponents and objective; candidate identity is excluded', async () => {
  const objective = resolveObjective(), era = resolveEra({ identity, objective });
  assert.equal(era.body.referenceOpponents.length, 5);
  assert.equal(era.id, resolveEra({ identity, objective }).id);
  assert.notEqual(era.id, resolveEra({ identity, objective: resolveObjective({ rulesProfileId: 'first-contact-trigger-closure' }) }).id);
  const other = await evolutionIdentity({ readSource: async name => (await readFile(new URL('../' + name, import.meta.url), 'utf8')) + (name === 'packages/simulation-runtime/src/runtime.mjs' ? '\n// execution perturbation' : '') });
  assert.notEqual(era.id, resolveEra({ identity: other, objective }).id, 'a different implementation is a different era');
  assert.doesNotMatch(JSON.stringify(era.body), /CP2-/, 'no candidate checkpoint identity');
});

test('compatibility separates inspection, execution and comparison with structured reasons', () => {
  const frozen = createCheckpoint({ policyId: 'control', identity, agentId: 'x', createdAt: '2026-10-02T00:00:00.000Z' });
  assert.deepEqual(canExecuteCheckpoint(frozen, identity).reasons, ['UNSUPPORTED_POLICY_FAMILY']);
  const historical = { ...identity, fingerprint: 'a'.repeat(64) };
  assert.ok(canExecuteCheckpoint(frozen, historical).reasons.includes('IMPLEMENTATION_FINGERPRINT_MISMATCH'));
  const m = (eraId, packId) => ({ kind: 'MEASUREMENT_RESULT', body: { eraId, packId, status: 'COMPLETE' } });
  assert.deepEqual(canCompareMeasurements(m('E1', 'P1'), m('E2', 'P1')).reasons, ['EVALUATION_ERA_MISMATCH']);
  assert.deepEqual(canCompareMeasurements(m('E1', 'P1'), m('E1', 'P2')).reasons, ['UNPAIRED_SAMPLES_UNSUPPORTED']);
  assert.equal(canCompareMeasurements(m('E1', 'P1'), m('E1', 'P1')).ok, true);
});

test('revision constraint validators reject unsupported fields and ranges', () => {
  assert.equal(code(() => validateMutationConstraints({ points: { mode: 'BOUNDED', min: 10, max: 5 } })), 'INVALID_MUTATION_CONSTRAINTS');
  assert.equal(code(() => validateMutationConstraints({ aggression: { mode: 'FIXED' } })), 'UNSUPPORTED_PARAMETER');
  assert.equal(code(() => validateIdentityConstraints([{ metricId: 'STYLE_SCORE', metricVersion: 1, key: 'x', minDenominator: 1, min: 0, max: 1 }])), 'UNSUPPORTED_IDENTITY_METRIC');
  assert.equal(code(() => validateIdentityConstraints([{ metricId: 'ACTION_FAMILY_RATE', metricVersion: 1, key: 'counter', minDenominator: 100, min: 0.5, max: 0.1 }])), 'INVALID_IDENTITY_CONSTRAINTS');
});

test('head tokens compare every field, so checkpoint equality alone is insufficient', () => {
  const h = { agentProfileId: 'AP-1', headVersion: 3, activeRevisionId: 'PR-a', championCheckpointId: 'CP2-a', requiredEvaluationEraId: 'ERA-a', promotionPolicyId: 'PP-a', lastTransitionId: 'HT-a' };
  assert.ok(sameHead(h, { ...h }));
  for (const k of Object.keys(h)) assert.equal(sameHead(h, { ...h, [k]: k === 'headVersion' ? 4 : 'other' }), false, k);
  assert.equal(code(() => headToken({ ...h, lastTransitionId: undefined })), 'INVALID_HEAD_TOKEN');
});

test('source lock: versioned implementations cannot change without a new contract version', async () => {
  const { lock } = JSON.parse(await readFile(new URL('./fixtures/agent-profile-contract-lock.json', import.meta.url), 'utf8'));
  const all = { ...VERSIONED_CONTRACT_FUNCTIONS, ...VERSIONED_JOURNAL_FUNCTIONS, ...VERSIONED_SCIENCE_FUNCTIONS };
  const actual = Object.fromEntries(Object.entries(all).sort().map(([k, f]) => [k, createHash('sha256').update(f.toString().replace(/\r\n/g, '\n')).digest('hex')]));
  assert.deepEqual(actual, lock);
});
