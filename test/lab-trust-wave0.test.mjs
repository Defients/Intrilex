import test from 'node:test';
import assert from 'node:assert/strict';
import { ExperimentStore } from '../apps/lab-web/src/experiments/experiment-store.mjs';
import { controller, diagnosticStore, config, summaries } from './fixtures/lab-trust-harness.mjs';
import { createRunRecord, createRunManifest, payloadEvidenceHash, manifestRemainingSegments } from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { experimentRunArtifact, validateExperimentRunArtifact } from '../packages/simulation-runtime/src/experiment-portability.mjs';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import { baselinePolicyState, WEIGHTED_POLICY_ID } from '../packages/policies/src/weighted-heuristic.mjs';
import { canCompareMeasurements } from '../packages/simulation-runtime/src/profile-contracts.mjs';
import { prepareChallenge, promoteChallenger } from '../packages/simulation-runtime/src/profile-science.mjs';
import { promotionAuthority } from '../packages/simulation-runtime/src/profile-store.mjs';
import { memoryStore, createGraveMaw, fixtureSeries, fixtureChallenge } from './fixtures/agent-profile-fixtures.mjs';

// These are executable FUTURE acceptance assertions, not claims of repair.
// Strict mode removes TODO so the open defects produce a nonzero exit code.
const pending = ticket => ({ todo: process.env.INTRILEX_TRUST_STRICT === '1' ? false : `${ticket}: deferred beyond Wave 0; unresolved audit regression` });

test('Wave 0 blocks durable campaign start on memory fallback before a manifest is written', async () => {
  const store = new ExperimentStore(null), api = await controller(store);
  await assert.rejects(() => api.beginExperimentRun({ config }), { code: 'LAB_WAVE0_PERSISTENT_STORAGE_REQUIRED' });
  assert.equal((await store.listManifests()).length, 0);
});

test('Wave 0 blocks memory-only resume without changing the retained manifest or calling the executor', async () => {
  const store = new ExperimentStore(null), api = await controller(store);
  const manifest = createRunManifest({ runId: 'legacy-memory', experimentId: 'EXP-LAB', ordinal: 1, config, requestedMatches: 6 });
  await store.putManifest(manifest);
  let executed = false;
  api.registerRunExecutor(() => { executed = true; });
  const before = structuredClone(await store.getManifest(manifest.runId));
  await assert.rejects(() => api.resumeExperimentRun(manifest.runId), { code: 'LAB_WAVE0_PERSISTENT_STORAGE_REQUIRED' });
  assert.equal(executed, false);
  assert.deepEqual(await store.getManifest(manifest.runId), before);
});

test('Wave 0 rejects confirmatory comparisons even when era and pack labels match', () => {
  const m = { kind: 'MEASUREMENT_RESULT', body: { eraId: 'unknown-era', packId: 'unknown-pack', status: 'COMPLETE' } };
  const verdict = canCompareMeasurements(m, m, { purpose: 'CONFIRMATORY' });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes('LAB_WAVE0_CONFIRMATORY_COMPARISON_BLOCKED'));
  assert.equal(canCompareMeasurements(m, m).ok, true, 'descriptive compatibility remains available');
});

test('Wave 0 refuses automatic promotion at the store authority boundary without mutating evidence', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's' });
  const { decision, manifest } = await fixtureChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'c' });
  assert.equal(decision.body.decision, 'APPROVE', 'a statistical recommendation alone is not authority');
  const before = JSON.stringify(await store.profileView(id));
  const verdict = promotionAuthority({ decision, manifest, head: created.head });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes('LAB_WAVE0_AUTOMATIC_PROMOTION_BLOCKED'));
  await assert.rejects(() => promoteChallenger({ store, agentProfileId: id, decisionId: decision.id, commandId: 'p' }), { code: 'PROMOTION_NOT_AUTHORIZED' });
  await assert.rejects(() => store.promote({ commandId: 'direct-p', agentProfileId: id, decisionId: decision.id }), { code: 'PROMOTION_NOT_AUTHORIZED' });
  assert.equal(JSON.stringify(await store.profileView(id)), before);
});

test('R02: independent controllers allocate distinct run occurrences', async () => {
  const store = await diagnosticStore(), a = await controller(store), b = await controller(store);
  const [ra, rb] = await Promise.all([a.beginExperimentRun({ config }), b.beginExperimentRun({ config })]);
  assert.notEqual(ra.runId, rb.runId);
  assert.equal((await store.listManifests()).length, 2);
});

test('R02: opening a second controller does not interrupt a live owner', async () => {
  const store = await diagnosticStore(), a = await controller(store), run = await a.beginExperimentRun({ config });
  await controller(store);
  assert.equal((await store.getManifest(run.runId)).status, 'running');
});

test('R02: a superseded owner cannot mutate the run after takeover', async () => {
  const store = await diagnosticStore(), a = await controller(store), _b = await controller(store);
  const { runId } = await a.beginExperimentRun({ config, batchSize: 2 });
  // Simulate takeover: expire A's lease, B acquires ownership (fencing token bumps).
  const held = await store.getManifest(runId);
  await store.putManifest({ ...held, owner: { ...held.owner, leaseUntil: new Date(0).toISOString() } });
  await store.acquireManifestOwnership(runId, { ownerId: 'controller-b', leaseMs: 30000 });
  // A's in-memory manifest still carries the old fence — commits are rejected.
  await assert.rejects(() => a.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) }), { code: 'RUN_OWNERSHIP_STALE' });
  // A's manifest-local cache must not resurrect on retry either.
  const stored = await store.getManifest(runId);
  assert.equal(stored.owner.ownerId, 'controller-b');
  assert.equal(stored.committedMatches ?? 0, 0);
});

test('R03: failed middle batch remains pending after later batches commit', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config, batchSize: 2 });
  const commit = store.commitRunBatch.bind(store); let calls = 0;
  store.commitRunBatch = arg => { if (++calls === 2) throw Error('INJECTED_QUOTA_FAILURE'); return commit(arg); };
  const write = o => api.commitExperimentBatch(runId, { ordinalStart: o, ordinalEnd: o + 2, summaries: summaries(o, 2) });
  await write(0); await assert.rejects(() => write(2), /INJECTED_QUOTA_FAILURE/); await write(4);
  assert.deepEqual((await store.listRunBatches(runId)).flatMap(b => Array.from(b.summaries, s => s.matchOrdinal)), [0, 1, 4, 5]);
  const remaining = manifestRemainingSegments(await store.getManifest(runId));
  assert.ok(remaining.some(s => s.ordinalStart <= 2 && s.ordinalEnd >= 4), 'ordinals 2 and 3 must remain scheduled');
});

test('R03: identical batch retry cannot increase committed sample count', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  const batch = { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) };
  await api.commitExperimentBatch(runId, batch); await api.commitExperimentBatch(runId, batch);
  assert.equal((await store.getManifest(runId)).committedMatches, 2);
});

test('R03: conflicting evidence for a retained sample identity fails durably', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) });
  // Same ordinal, different result digest — an integrity failure, not a retry.
  const tampered = [{ ...summaries(0, 1)[0], matchResultHash: 'conflicting-digest' }, summaries(1, 1)[0]];
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: tampered }), { code: 'RUN_BATCH_SAMPLE_CONFLICT' });
  const manifest = await store.getManifest(runId);
  assert.equal(manifest.committedMatches, 2, 'the conflict must not rewrite retained coverage');
  assert.equal((manifest.integrityFailures ?? []).at(-1)?.code, 'RUN_BATCH_SAMPLE_CONFLICT');
});

test('R01: distinct executable genomes must have distinct sample identity', () => {
  const a = baselinePolicyState(), b = structuredClone(a); b.weights.points = -2000; b.weights.defense = 2000;
  const cfg = { seed: 42, profileId: 'core-advanced-authority', policyIds: [WEIGHTED_POLICY_ID, 'control'], decisionLimit: 1800, telemetryEnabled: false, includeReplay: false };
  const x = runPolicyMatch({ ...cfg, policyStates: [a, null] }).summary, y = runPolicyMatch({ ...cfg, policyStates: [b, null] }).summary;
  assert.notEqual(x.matchResultHash, y.matchResultHash, 'fixture must exercise distinct actual outcomes');
  assert.notEqual(x.matchId, y.matchId, 'the current consumer identity must not collapse distinct genomes');
});

test('R01: identity record distinguishes sample, executable subject, and occurrence', () => {
  const a = baselinePolicyState();
  const cfg = { seed: 42, profileId: 'core-advanced-authority', policyIds: [WEIGHTED_POLICY_ID, 'control'], decisionLimit: 1800, telemetryEnabled: false, includeReplay: false };
  const x = runPolicyMatch({ ...cfg, policyStates: [a, null] });
  const y = runPolicyMatch({ ...cfg, policyStates: [a, null] });
  assert.equal(x.summary.identity?.deterministicSampleId, x.summary.matchId);
  assert.equal(x.summary.identity?.executableHash != null, true, 'compiled subject hash recorded');
  assert.equal(x.summary.matchId, y.summary.matchId, 'same deterministic inputs — same sample identity');
  assert.notEqual(x.identity?.executionOccurrenceId, y.identity?.executionOccurrenceId,
    'each execution occurrence is unique — repeats are not independent samples');
  assert.equal(x.summary.matchResultHash, y.summary.matchResultHash, 'same sample — same canonical result');
  assert.equal(hashCanonical(x.summary), hashCanonical(y.summary),
    'occurrence identity must stay off the canonically hashable summary');
});

test('R05: concurrent challenge preparations cannot both claim automatic attempt 1', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's' });
  const args = { store, agentProfileId: id, nominationId: nomination.id };
  const results = await Promise.all([prepareChallenge({ ...args, commandId: 'a' }), prepareChallenge({ ...args, commandId: 'b' })]);
  assert.notEqual(results[0].id, results[1].id);
  assert.ok(results.filter(m => m.body.attempt.automaticEligible).length <= 1);
});

test('R06: hash-valid legacy artifact cannot admit duplicate rows and contradictory counts', pending('R06'), () => {
  const sample = { matchOrdinal: 3, seed: 42, matchId: 'duplicate', terminationReason: 'NORMAL_VICTORY', winningSeat: 1 };
  const payload = { summaries: [sample, sample], aggregate: null };
  const run = createRunRecord({ experimentId: 'PROBE', ordinal: 1, config: { matchCount: 999 }, metrics: { matchCount: 999, completedMatchCount: 999 }, payloadHash: payloadEvidenceHash(payload) });
  const artifact = experimentRunArtifact({ run, evidence: { kind: 'summaries', ...payload } });
  assert.throws(() => validateExperimentRunArtifact(artifact));
});
