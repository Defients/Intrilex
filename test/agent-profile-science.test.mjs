import test from 'node:test';
import assert from 'node:assert/strict';
import { runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { mutatePolicyState } from '../packages/simulation-runtime/src/evolution-training.mjs';
import { WEIGHT_FEATURES } from '../packages/policies/src/weighted-heuristic.mjs';
import { digest, makeArtifact, canCompareMeasurements } from '../packages/simulation-runtime/src/profile-contracts.mjs';
import {
  startSeries, runSeries, cancelSeries, proposeCandidates, selectGeneration, trainingManifest, nominate, prepareHeldOut, measurementManifest, decideChallenge,
  studentTQuantile, pairedBlockAnalysis, tailBalance, prepareChallenge, collectExposures, promoteChallenger,
} from '../packages/simulation-runtime/src/profile-science.mjs';
import { identity, memoryStore, createGraveMaw, fixtureSeries, fixtureChallenge, fixtureMeasurement, FIXED_CLOCK } from './fixtures/agent-profile-fixtures.mjs';

const code = async fn => { try { await fn(); } catch (error) { return error.code ?? error.message; } return 'NO_ERROR'; };
const tiny = { generations: 1, candidates: 2, trainingPairs: 1, evolutionSeed: 31091 };
const semantic = async (store, seriesId) => {
  const series = await store.getArtifact(seriesId);
  return { selections: (await store.listArtifacts(series.scope, 'GENERATION_SELECTION')).filter(s => s.body.seriesId === seriesId).map(s => s.id),
    measurements: (await store.listArtifacts(series.scope, 'MEASUREMENT_RESULT')).filter(m => m.body.purpose === 'TRAINING').map(m => m.id).sort(),
    outcome: (await store.listArtifacts(series.scope, 'SERIES_OUTCOME')).map(o => o.id) };
};

test('real Series: continues from the current Champion and reproduces exactly across 1 and 4 workers (real simulation)', async () => {
  const results = [];
  for (const workerCount of [1, 4]) {
    const store = memoryStore(), created = await createGraveMaw(store);
    const series = await startSeries({ store, agentProfileId: created.agentProfileId, commandId: 'series-real', overrides: tiny });
    assert.equal(series.body.sourceCheckpointId, created.head.championCheckpointId);
    assert.deepEqual(series.body.headToken, created.head);
    const run = await runSeries({ store, seriesId: series.id, executeSeries: runLabSeries, workerCount, createdAt: FIXED_CLOCK() });
    assert.ok(['COMPLETED', 'STOPPED_NO_ELIGIBLE_CANDIDATE'].includes(run.status));
    const selection = run.selections[0];
    assert.equal(selection.body.candidates.length, 3); assert.equal(selection.body.candidates[0].role, 'PARENT');
    assert.ok(['RETAINED_PARENT', 'SELECTED_CHILD', 'NO_ELIGIBLE_CANDIDATE'].includes(selection.body.outcome));
    if (selection.body.outcome === 'RETAINED_PARENT') assert.equal(run.nomination, null, 'retained parent nominates nothing');
    results.push(await semantic(store, series.id));
  }
  assert.deepEqual(results[0], results[1], 'worker count does not change proposals, measurements, selection or outcome');
});

test('interrupted Series resumes under the same manifest and commits the same selection; fencing rejects stale owners', async () => {
  const reference = memoryStore(), refCreated = await createGraveMaw(reference);
  const refSeries = await startSeries({ store: reference, agentProfileId: refCreated.agentProfileId, commandId: 'series-real', overrides: tiny });
  await runSeries({ store: reference, seriesId: refSeries.id, executeSeries: runLabSeries, workerCount: 4, createdAt: FIXED_CLOCK() });
  const store = memoryStore(), created = await createGraveMaw(store);
  const series = await startSeries({ store, agentProfileId: created.agentProfileId, commandId: 'series-real', overrides: tiny });
  assert.equal(series.id, refSeries.id);
  const controller = new AbortController();
  let measured = 0;
  const paused = await runSeries({ store, seriesId: series.id, executeSeries: runLabSeries, workerCount: 4, signal: controller.signal, createdAt: FIXED_CLOCK(),
    onProgress: p => { if (p.stage === 'TRAINING' && ++measured === 2) controller.abort(); } });
  assert.equal(paused.status, 'PAUSED');
  assert.equal((await store.listArtifacts(created.agentProfileId, 'GENERATION_SELECTION')).length, 0, 'no selection committed from partial evidence');
  const stale = await store.claimOperation({ operationId: series.id, scope: created.agentProfileId, kind: 'SERIES', manifestId: series.id });
  const resumed = await runSeries({ store, seriesId: series.id, executeSeries: runLabSeries, workerCount: 1, createdAt: FIXED_CLOCK() });
  assert.equal(await code(() => store.commitOperation(stale, { progress: { forged: true } })), 'STALE_OPERATION_OWNER', 'superseded runner cannot append');
  assert.deepEqual((await semantic(store, series.id)).selections, (await semantic(reference, refSeries.id)).selections);
  assert.equal(resumed.selections[0].id, (await semantic(reference, refSeries.id)).selections[0]);
  assert.equal(await code(() => store.commitOperation(stale, {})), 'STALE_OPERATION_OWNER');
});

test('double resume: the newest claim fences the older owner; cancellation retains evidence and nominates nothing', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const series = await startSeries({ store, agentProfileId: id, commandId: 's' });
  const a = await store.claimOperation({ operationId: series.id, scope: id, kind: 'SERIES', manifestId: series.id });
  const b = await store.claimOperation({ operationId: series.id, scope: id, kind: 'SERIES', manifestId: series.id });
  assert.equal(await code(() => store.commitOperation(a, { progress: { x: 1 } })), 'STALE_OPERATION_OWNER');
  await store.commitOperation(b, { progress: { x: 2 } });
  assert.equal(await code(() => store.claimOperation({ operationId: series.id, scope: id, kind: 'SERIES', manifestId: 'SER-other' })), 'OPERATION_MANIFEST_MISMATCH');
  assert.equal(await cancelSeries({ store, seriesId: series.id }), 'CANCELLED');
  assert.equal(await code(() => store.commitOperation(b, { progress: { late: true } })), 'STALE_OPERATION_OWNER', 'late result after cancellation');
  const outcome = (await store.listArtifacts(id, 'SERIES_OUTCOME'))[0];
  assert.equal(outcome.body.status, 'CANCELLED'); assert.equal(outcome.body.nominationId, null);
  assert.equal(await code(() => runSeries({ store, seriesId: series.id, executeSeries: runLabSeries })), 'OPERATION_FINISHED');
});

test('selection admits TRAINING evidence only: forged labels, foreign manifests, wrong subjects and incomplete blocks are rejected', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { series, pack, era, selections } = await fixtureSeries({ store, agentProfileId: id, commandId: 's1', winnerIndex: 1 });
  const parent = await store.getCheckpoint(series.body.sourceCheckpointId), candidates = [parent, ...proposeCandidates({ series, parent, generationIndex: 1, identity, createdAt: FIXED_CLOCK() })];
  const training = candidates.map(cp => trainingManifest({ series, pack, era, subjectCheckpointId: cp.checkpointId }));
  const measurements = training.map((manifest, i) => fixtureMeasurement({ manifest, pack, era, score: () => i === 1 ? 1 : 0.5 }));
  assert.equal(selectGeneration({ series, pack, era, generationIndex: 1, candidates, measurements }).id, selections[0].id, 'deterministic recomputation');
  const heldOutManifest = await prepareHeldOut({ store, agentProfileId: id, checkpointId: parent.checkpointId, commandId: 'h1', pairs: 1 });
  const heldPack = await store.getArtifact(heldOutManifest.body.packId), held = fixtureMeasurement({ manifest: heldOutManifest, pack: heldPack, era, score: () => 1 });
  const relabeled = makeArtifact('MEASUREMENT_RESULT', { ...held.body, purpose: 'TRAINING' }, { scope: id });
  assert.equal(await code(() => selectGeneration({ series, pack, era, generationIndex: 1, candidates, measurements: [relabeled, ...measurements.slice(1)] })), 'FOREIGN_EVIDENCE');
  const forgedPurpose = makeArtifact('MEASUREMENT_RESULT', { ...measurements[0].body, purpose: 'HELD_OUT_EVALUATION' }, { scope: id });
  assert.equal(await code(() => selectGeneration({ series, pack, era, generationIndex: 1, candidates, measurements: [forgedPurpose, ...measurements.slice(1)] })), 'FORGED_OR_WRONG_PURPOSE');
  assert.equal(candidates.length, 2);
  assert.equal(await code(() => selectGeneration({ series, pack, era, generationIndex: 1, candidates, measurements: [measurements[1], measurements[0]] })), 'FOREIGN_EVIDENCE', 'evidence swapped between subjects');
  const short = makeArtifact('MEASUREMENT_RESULT', { ...measurements[1].body, matchups: measurements[1].body.matchups.map(m => ({ ...m, blocks: [] })) }, { scope: id });
  assert.equal(await code(() => selectGeneration({ series, pack, era, generationIndex: 1, candidates, measurements: [measurements[0], short] })), 'INCOMPLETE_BLOCKS');
});

test('held-out and challenge results cannot change committed selection or nomination', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { series, selections, nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's1', winnerIndex: 1 });
  for (const cp of [series.body.sourceCheckpointId, nomination.body.checkpointId]) {
    const manifest = await prepareHeldOut({ store, agentProfileId: id, checkpointId: cp, commandId: `h-${cp}`, pairs: 2 });
    const pack = await store.getArtifact(manifest.body.packId), era = await store.getArtifact(manifest.body.eraId);
    await store.storeArtifacts({ artifacts: [fixtureMeasurement({ manifest, pack, era, score: () => cp === series.body.sourceCheckpointId ? 1 : 0 })] });
  }
  await fixtureChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'c1', pattern: 'tie' });
  const stored = (await store.listArtifacts(id, 'GENERATION_SELECTION')).filter(s => s.body.seriesId === series.id);
  assert.deepEqual(stored.map(s => s.id), selections.map(s => s.id));
  assert.equal(nominate({ series, selections: stored }).id, nomination.id);
});

test('parent retention completes without fake learning, nomination or promotion', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { selections, nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's1', winnerIndex: 0 });
  assert.equal(selections[0].body.outcome, 'RETAINED_PARENT');
  assert.equal(selections[0].body.selectedCheckpointId, created.head.championCheckpointId, 'no new identical checkpoint');
  assert.equal(nomination, null);
  assert.equal((await store.getHead(id)).headVersion, 1);
});

test('constraint projection: unconstrained proposals equal the V1 operator; fixed/bounded coordinates are honored', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const series = await startSeries({ store, agentProfileId: id, commandId: 's', overrides: { candidates: 4 } }), parent = await store.getCheckpoint(created.head.championCheckpointId);
  const free = proposeCandidates({ series, parent, generationIndex: 1, identity, createdAt: FIXED_CLOCK() });
  free.forEach((cp, candidateIndex) => {
    const seed = Number.parseInt(digest({ stream: 'PROFILE_SERIES_MUTATION_V1', seriesId: series.id, evolutionSeed: series.body.optimizer.config.evolutionSeed, generationIndex: 1, candidateIndex, attempt: 0 }).slice(0, 8), 16) >>> 0;
    assert.deepEqual(cp.policyState, mutatePolicyState(parent.policyState, seed, 250).state);
    assert.equal(cp.mutation.kind, 'PROFILE_OPTIMIZER_MUTATION_V1'); assert.equal(cp.mutation.projection.attempts, 1);
  });
  const head = await store.getHead(id);
  const constraints = Object.fromEntries(WEIGHT_FEATURES.map(k => [k, k === 'risk' ? { mode: 'BOUNDED', min: -100, max: 100 } : { mode: 'FIXED' }]));
  const draft = await store.saveDraftRevision({ agentProfileId: id, baseRevisionId: head.activeRevisionId, mutationConstraints: constraints, sourceCheckpointId: head.championCheckpointId });
  const act = await store.activateAuthoredRevision({ commandId: 'a', agentProfileId: id, expectedHead: head, revisionId: draft.revision.id });
  const constrained = await startSeries({ store, agentProfileId: id, commandId: 's2', overrides: { candidates: 4 } });
  for (const cp of proposeCandidates({ series: constrained, parent, generationIndex: 1, identity, createdAt: FIXED_CLOCK() })) {
    assert.equal(cp.mutation.operator.parameter, 'risk');
    assert.ok(Math.abs(cp.policyState.weights.risk) <= 100); assert.equal(cp.mutation.projection.clamped, true);
    for (const k of WEIGHT_FEATURES.filter(k => k !== 'risk')) assert.equal(cp.policyState.weights[k], parent.policyState.weights[k]);
  }
  const allFixed = await store.saveDraftRevision({ agentProfileId: id, baseRevisionId: act.head.activeRevisionId, mutationConstraints: { ...constraints, risk: { mode: 'FIXED' } }, sourceCheckpointId: act.head.championCheckpointId });
  await store.activateAuthoredRevision({ commandId: 'b', agentProfileId: id, expectedHead: act.head, revisionId: allFixed.revision.id });
  assert.equal(await code(() => startSeries({ store, agentProfileId: id, commandId: 's3' })), 'NO_TRAINABLE_DIMENSIONS');
});

test('paired Student-t estimator: reference quantiles and zero spread', () => {
  for (const [df, expected] of [[1, 6.3138], [10, 1.8125], [23, 1.7139], [47, 1.6779], [100, 1.6602]]) assert.ok(Math.abs(studentTQuantile(0.95, df) - expected) < 5e-4, `df ${df}`);
  assert.equal(pairedBlockAnalysis([0.1]).available, false, 'one block is insufficient');
  const flat = pairedBlockAnalysis(Array(48).fill(0));
  assert.equal(flat.lower, 0); assert.equal(flat.upper, 0);
});

test('frozen design null behavior: 48 composite blocks with tail guard keep false approval near nominal under skew', () => {
  // Mean-zero nulls on per-(opponent, seed) paired differences; the frozen design
  // averages 5 independent units per block. Distributions are documented in docs/AGENT_PROFILES.md.
  let state = 4242;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const draw = d => { let u = rand(); for (const [v, p] of d) { if ((u -= p) < 0) return v; } return d.at(-1)[0]; };
  const approve = units => { const a = pairedBlockAnalysis(units.map(u => u.reduce((x, y) => x + y, 0) / 5)); return a.lower > 0 && a.mean >= 0.02 && tailBalance(units.flat(), 0.75).pass; };
  const nulls = { symmetric: [[-0.5, 0.2], [-0.25, 0.2], [0, 0.2], [0.25, 0.2], [0.5, 0.2]], leftSkew: [[-0.75, 0.1], [0.25, 0.3], [0, 0.6]], heavyLeft: [[-1, 0.05], [1 / 19, 0.95]], rareCatastrophe: [[-1, 0.02], [1 / 49, 0.98]] };
  const limits = { symmetric: 0.07, leftSkew: 0.02, heavyLeft: 0.02, rareCatastrophe: 0.02 };
  for (const [name, d] of Object.entries(nulls)) {
    let k = 0;
    for (let s = 0; s < 2000; s++) if (approve(Array.from({ length: 48 }, () => Array.from({ length: 5 }, () => draw(d))))) k++;
    assert.ok(k / 2000 <= limits[name], `${name} null approval ${k / 2000}`);
  }
  let power = 0;
  for (let s = 0; s < 1000; s++) if (approve(Array.from({ length: 48 }, () => Array.from({ length: 5 }, () => draw([[-0.42, 0.2], [-0.17, 0.2], [0.08, 0.2], [0.33, 0.2], [0.58, 0.2]]))))) power++;
  assert.ok(power / 1000 >= 0.9, `power at +0.08 is ${power / 1000}`);
});

test('frozen decision rule: APPROVE, REJECT, INCONCLUSIVE and INVALID with documented precedence (labeled fixtures)', async () => {
  const outcomes = {};
  for (const pattern of ['approve', 'tie', 'noisy', 'regression', 'unreliable', 'fault']) {
    const store = memoryStore(), created = await createGraveMaw(store);
    const { nomination } = await fixtureSeries({ store, agentProfileId: created.agentProfileId, commandId: 's' });
    const { decision } = await fixtureChallenge({ store, agentProfileId: created.agentProfileId, nominationId: nomination.id, commandId: `c-${pattern}`, pattern });
    outcomes[pattern] = { decision: decision.body.decision, reasons: decision.body.reasons };
  }
  assert.deepEqual(outcomes.approve, { decision: 'APPROVE', reasons: ['IMPROVEMENT_AND_ALL_CONSTRAINTS_PASS'] });
  assert.deepEqual(outcomes.tie, { decision: 'REJECT', reasons: ['NO_PRACTICAL_IMPROVEMENT'] });
  assert.equal(outcomes.noisy.decision, 'INCONCLUSIVE'); assert.deepEqual(outcomes.noisy.reasons, ['INSUFFICIENT_EVIDENCE']);
  assert.equal(outcomes.regression.decision, 'REJECT'); assert.ok(outcomes.regression.reasons.includes('REGRESSION_FLOOR:control'));
  assert.deepEqual(outcomes.unreliable, { decision: 'REJECT', reasons: ['RELIABILITY_GATE_FAILED'] });
  assert.deepEqual(outcomes.fault, { decision: 'INVALID', reasons: ['CHALLENGER_INFRASTRUCTURE_FAULT'] });
});

test('identity constraints gate training eligibility and promotion; unavailable is never an automatic pass', async () => {
  // Training fixtures observe score-family rate 80/400 = 0.2 over 2,000 decisions.
  const constraint = { metricId: 'ACTION_FAMILY_RATE', metricVersion: 1, key: 'score', minDenominator: 1500, min: 0, max: 0.5 };
  for (const [overrides, expected, reason] of [
    [{ challengerDecisions: 200, challengerActions: { score: 40, draw: 60, phase: 100 } }, 'INCONCLUSIVE', 'IDENTITY_METRIC_UNAVAILABLE:ACTION_FAMILY_RATE:score'],
    [{ challengerActions: { score: 300, draw: 50, phase: 50 } }, 'REJECT', 'IDENTITY_CONSTRAINT_VIOLATED:ACTION_FAMILY_RATE:score'],
    [{}, 'APPROVE', 'IMPROVEMENT_AND_ALL_CONSTRAINTS_PASS'],
  ]) {
    const store = memoryStore(), created = await createGraveMaw(store, 'c', { identityConstraints: [constraint] });
    const { nomination } = await fixtureSeries({ store, agentProfileId: created.agentProfileId, commandId: 's' });
    const { decision } = await fixtureChallenge({ store, agentProfileId: created.agentProfileId, nominationId: nomination.id, commandId: 'ch', ...overrides });
    assert.equal(decision.body.decision, expected); assert.deepEqual(decision.body.reasons, [reason]);
  }
  const strict = memoryStore(), created = await createGraveMaw(strict, 'c', { identityConstraints: [{ ...constraint, max: 0.1 }] });
  const { selections, nomination } = await fixtureSeries({ store: strict, agentProfileId: created.agentProfileId, commandId: 's' });
  assert.equal(selections[0].body.outcome, 'NO_ELIGIBLE_CANDIDATE', 'training eligibility uses TRAINING measurements');
  assert.ok(selections[0].body.disqualified.every(d => d.reason === 'IDENTITY_CONSTRAINT_VIOLATED'));
  assert.equal(nomination, null);
});

test('incomplete or mismatched challenge evidence is INVALID; nothing is dropped from denominators', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's' });
  const { manifest, cm, im, pack, era, policy, incumbentMeasurement, challengerMeasurement } = await fixtureChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'c' });
  const truncated = makeArtifact('MEASUREMENT_RESULT', { ...challengerMeasurement.body, matchups: challengerMeasurement.body.matchups.slice(0, 3) }, { scope: id });
  assert.equal(decideChallenge({ manifest, policy, challengerMeasurement: truncated, incumbentMeasurement, challengerManifest: cm, incumbentManifest: im }).body.decision, 'INVALID');
  assert.equal(decideChallenge({ manifest, policy, challengerMeasurement: incumbentMeasurement, incumbentMeasurement, challengerManifest: cm, incumbentManifest: im }).body.decision, 'INVALID', 'swapped subjects');
  const heldManifest = measurementManifest({ agentProfileId: id, purpose: 'PROMOTION_CHALLENGE', producer: { kind: 'CHALLENGE', challengeNonce: 'other', role: 'challenger' }, subjectCheckpointId: manifest.body.challengerCheckpointId, pack, era });
  const foreign = fixtureMeasurement({ manifest: heldManifest, pack, era, score: () => 1 });
  const d = decideChallenge({ manifest, policy, challengerMeasurement: foreign, incumbentMeasurement, challengerManifest: heldManifest, incumbentManifest: im });
  assert.equal(d.body.decision, 'INVALID'); assert.ok(d.body.reasons.includes('CHALLENGER_FOREIGN_EVIDENCE'));
});

test('fresh challenge and held-out packs are disjoint from all known training and exposed seeds, including fork ancestry', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { series, nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's1' });
  const held = await prepareHeldOut({ store, agentProfileId: id, checkpointId: series.body.sourceCheckpointId, commandId: 'h', pairs: 8 });
  const challenge = await prepareChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'c' });
  const seeds = async packId => (await store.getArtifact(packId)).body.seeds;
  const training = await seeds(series.body.trainingPackId), heldSeeds = await seeds(held.body.packId), challengeSeeds = await seeds(challenge.body.packId);
  assert.equal(challengeSeeds.length, 48 * 5, 'one fresh seed per block per reference opponent');
  assert.equal(new Set(challengeSeeds).size, challengeSeeds.length);
  for (const s of challengeSeeds) assert.ok(!training.includes(s) && !heldSeeds.includes(s));
  assert.equal(challenge.body.exposureCheck.disjointFromKnown, true); assert.equal(challenge.body.attempt.automaticEligible, true);
  const fork = await store.fork({ commandId: 'f', sourceAgentProfileId: id, displayName: 'VELVET GUILLOTINE' });
  const exposures = await collectExposures(store, fork.agentProfileId);
  for (const s of [...training, ...heldSeeds, ...challengeSeeds]) assert.ok(exposures.seeds.has(s), 'fork inherits ancestor exposures');
});

test('cross-era deltas are blocked; a common-era re-evaluation produces new comparable measurements', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { series, nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's1' });
  const manifestA = await prepareHeldOut({ store, agentProfileId: id, checkpointId: series.body.sourceCheckpointId, commandId: 'bridge', pairs: 2 });
  const pack = await store.getArtifact(manifestA.body.packId), era = await store.getArtifact(manifestA.body.eraId);
  const manifestB = measurementManifest({ agentProfileId: id, purpose: 'HELD_OUT_EVALUATION', producer: { kind: 'HELD_OUT', requestId: 'bridge' }, subjectCheckpointId: nomination.body.checkpointId, pack, era });
  const a = fixtureMeasurement({ manifest: manifestA, pack, era, score: () => 0.5 }), b = fixtureMeasurement({ manifest: manifestB, pack, era, score: () => 1 });
  const historical = makeArtifact('MEASUREMENT_RESULT', { ...a.body, eraId: 'ERA-' + 'd'.repeat(64) }, { scope: id });
  assert.deepEqual(canCompareMeasurements(historical, b).reasons, ['EVALUATION_ERA_MISMATCH']);
  assert.equal(canCompareMeasurements(a, b).ok, true);
  assert.notEqual(a.id, historical.id, 're-evaluation is new evidence, not a rewrite');
});

test('promotion journal preparation remains complete and bounded without granting Wave 0 authority (labeled fixture)', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's' });
  const { decision } = await fixtureChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'c' });
  // Inspect preparation only. The real store rejection is covered by the
  // Wave 0 suite; this capture does not execute or simulate a Head transition.
  const before = JSON.stringify(await store.profileView(id));
  let prepared;
  store.promote = async input => { prepared = input; };
  await promoteChallenger({ store, agentProfileId: id, decisionId: decision.id, commandId: 'p' });
  const { journal, promotionRecord: record } = prepared, s = journal.body.sections;
  for (const key of ['parameterChange', 'behaviorChange', 'performanceChange', 'tradeoffs', 'decision', 'interpretation', 'evidenceQuality', 'references']) assert.ok(s[key], key);
  assert.equal(s.performanceChange.purpose, 'PROMOTION_CHALLENGE'); assert.equal(s.performanceChange.blocks, 48); assert.equal(s.performanceChange.games, 960);
  assert.match(s.interpretation, /not an unbiased estimate of general strength/); assert.match(s.interpretation, /does not show that any parameter change caused/);
  assert.match(s.behaviorChange.note, /Not evidence that a parameter caused a behavior/);
  assert.equal(s.references.decisionId, decision.id); assert.equal(s.references.nominationId, nomination.id);
  assert.equal(s.evidenceQuality.repeatedTesting.attemptNumber, 1);
  assert.equal(record.body.journalId, journal.id);
  assert.equal(JSON.stringify(await store.profileView(id)), before, 'preparation writes no evidence or Head');
});
