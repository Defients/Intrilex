import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evolutionIdentity } from '../scripts/evolution-identity.mjs';
import { sampleIdentity } from '../packages/simulation-runtime/src/evidence-identity.mjs';
import { acknowledgedSave } from '../packages/simulation-runtime/src/persistence-state.mjs';
import { runInNewContext } from 'node:vm';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { baselinePolicyState, WEIGHTED_POLICY_ID } from '../packages/policies/src/weighted-heuristic.mjs';
import { challengeReservationAuthority } from '../packages/simulation-runtime/src/profile-store.mjs';
import { prepareChallenge } from '../packages/simulation-runtime/src/profile-science.mjs';
import { createRunRecord, MANIFEST_STATUS, manifestInputDigest } from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { controller, diagnosticStore, config, summaries } from './fixtures/lab-trust-harness.mjs';
import { memoryStore, createGraveMaw, fixtureSeries } from './fixtures/agent-profile-fixtures.mjs';

const identity = await evolutionIdentity();
const source = name => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('R01: imported execution dependencies and analysis dependencies invalidate separate identities', async () => {
  for (const name of ['packages/simulation-runtime/src/adaptive-strategy.mjs', 'packages/engine-adapter/src/action-semantics.mjs', 'packages/policies/src/control-conversion.mjs']) {
    assert.ok(identity.dependencyManifest.execution.some(([n]) => n === name));
    const changed = await evolutionIdentity({ readSource: async n => (await source(n)) + (n === name ? '\n// perturbation' : '') });
    assert.notEqual(changed.fingerprint, identity.fingerprint, name);
  }
  for (const name of ['packages/simulation-runtime/src/profile-science.mjs', 'packages/simulation-runtime/src/combo-telemetry.mjs']) {
    const changed = await evolutionIdentity({ readSource: async n => (await source(n)) + (n === name ? '\n// perturbation' : '') });
    assert.equal(changed.fingerprint, identity.fingerprint, name);
    assert.notEqual(changed.analysisFingerprint, identity.analysisFingerprint, name);
  }
});

test('R01: sample keys bind executable subjects, references, seeds, rules and limits; labels are descriptive', () => {
  const input = { profileId: config.profileId, seed: 42, policyIds: config.policyIds }, base = sampleIdentity(input, identity);
  for (const change of [{ policyStates: [{ weights: { value: 2 } }, null] }, { checkpointIds: ['CP-a', null] }, { revisionIds: ['PR-a', null] },
    { seed: 43 }, { decisionLimit: 3 }, { orchestrationCommandLimit: 2 }, { ruleOverrides: { handSize: 4 } }, { seedCatalogVersion: 'other' }]) {
    assert.notEqual(sampleIdentity({ ...input, ...change }, identity).deterministicSampleId, base.deterministicSampleId);
  }
  assert.deepEqual(sampleIdentity({ ...input, displayName: 'rename', ordinal: 123 }, identity), base);
  assert.deepEqual(sampleIdentity({ ...input, adaptiveConfigs: [{ mode: 'OFF' }, null] }, identity), base);
  assert.throws(() => sampleIdentity(input, { fingerprint: identity.fingerprint }), /EVIDENCE_IMPLEMENTATION_REQUIRED/);
});

test('R02: allocation accounts for sealed runs with no manifest and uses independent occurrences', async () => {
  const store = await diagnosticStore();
  await store.saveRun(createRunRecord({ experimentId: 'allocation', ordinal: 0, config }), null);
  const [a, b] = await Promise.all([1, 2].map(i => store.allocateRunManifest({ experimentId: 'allocation', config, owner: { ownerId: String(i), fencingToken: 1 } })));
  assert.deepEqual([a.ordinal, b.ordinal], [1, 2]);
  assert.notEqual(a.executionOccurrenceId, b.executionOccurrenceId);
});

test('R02: same-fence delayed write fails version CAS; terminal callbacks cannot revive cancellation', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  const stale = await store.getManifest(runId);
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) });
  await assert.rejects(() => store.putManifestFenced(stale), { code: 'RUN_MANIFEST_VERSION_CONFLICT' });
  await api.cancelExperimentRun(runId);
  const cancelled = await store.getManifest(runId);
  await assert.rejects(() => store.putManifestFenced({ ...cancelled, status: MANIFEST_STATUS.RUNNING }), { code: 'RUN_MANIFEST_TERMINAL' });
  await assert.rejects(() => store.renewManifestLease(runId, cancelled.owner), { code: 'RUN_MANIFEST_TERMINAL' });
  assert.equal((await store.getManifest(runId)).status, MANIFEST_STATUS.CANCELLED);
});

test('R01/R02: resume refuses unknown or changed pinned execution; sealing retains the original identity', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId, manifest } = await api.beginExperimentRun({ config });
  const changed = { ...manifest, config: { ...manifest.config, implementation: { ...manifest.config.implementation, fingerprint: 'old' } } };
  await assert.rejects(() => store.putManifestFenced(changed), { code: 'RUN_INPUTS_CHANGED' });
  // Seed a retained historical implementation as an explicit storage fixture.
  await store._transact(['manifests'], ops => ops.put('manifests', { ...changed, inputDigest: manifestInputDigest(changed) }));
  await api.cancelExperimentRun(runId); // stale revision cannot replace the changed stored inputs
  const reopened = await controller(store);
  await assert.rejects(() => reopened.resumeExperimentRun(runId), { code: 'RUN_EXECUTION_IDENTITY_MISMATCH' });
  assert.equal((await store.getManifest(runId)).config.implementation.fingerprint, 'old');
});

test('R01: a new pinned manifest cannot stamp legacy or incompatible samples as current execution', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  const legacy = summaries(0, 2).map(({ identity: _identity, ...summary }) => summary);
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: legacy }), { code: 'RUN_SAMPLE_IDENTITY_MISMATCH' });
  assert.equal((await store.getManifest(runId)).committedMatches, 0);
  assert.equal((await store.listRunBatches(runId)).length, 0);
});

test('R05: reservations survive retries, crashes, exposures and Head changes; repeats cannot gain automatic authority', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), agentProfileId = created.agentProfileId;
  const { nomination } = await fixtureSeries({ store, agentProfileId, commandId: 'series-wave1' });
  const args = { store, agentProfileId, nominationId: nomination.id };
  const [a, b] = await Promise.all(['reserve-a', 'reserve-b'].map(commandId => prepareChallenge({ ...args, commandId })));
  assert.deepEqual([a.body.attempt.number, b.body.attempt.number], [1, 2]);
  const firstSeeds = (await store.getArtifact(a.body.packId)).body.seeds;
  assert.ok((await store.getArtifact(b.body.packId)).body.seeds.every(seed => !firstSeeds.includes(seed)));
  const history = await store.listArtifacts(agentProfileId, 'CHALLENGE_MANIFEST');
  const receipt = await store.read(['receipts'], function* () { return yield { op: 'get', store: 'receipts', key: 'reserve-a' }; });
  assert.equal(challengeReservationAuthority(a, receipt, history).ok, true);
  assert.equal(challengeReservationAuthority(b, receipt, history).ok, false);
  assert.equal(challengeReservationAuthority(a, null, history).ok, false);
  await store.manualActivate({ commandId: 'head-change', agentProfileId, expectedHead: a.body.expectedHead, checkpointId: a.body.challengerCheckpointId, reason: 'fixture authorized manual activation' });
  assert.equal((await prepareChallenge({ ...args, commandId: 'reserve-a' })).id, a.id);
  assert.equal((await store.listArtifacts(agentProfileId, 'CHALLENGE_MANIFEST')).length, 2);
  await assert.rejects(() => prepareChallenge({ ...args, nominationId: 'other', commandId: 'reserve-a' }), /COMMAND_ID_REUSED/);
});

test('R08: pending, acknowledged local, session-only and failed saves remain distinct', async () => {
  let resolve, reject; const states = [];
  const saving = acknowledgedSave(() => new Promise(r => { resolve = r; }), state => states.push(state));
  assert.deepEqual(states, ['PENDING']); resolve('committed'); await saving;
  assert.deepEqual(states, ['PENDING', 'LOCALLY_COMMITTED']);
  states.length = 0;
  await acknowledgedSave(async () => {}, state => states.push(state), { sessionOnly: true });
  assert.deepEqual(states, ['PENDING', 'SESSION_ONLY']);
  states.length = 0;
  const failing = acknowledgedSave(() => new Promise((_r, j) => { reject = j; }), state => states.push(state));
  reject(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
  await assert.rejects(() => failing, /quota/);
  assert.deepEqual(states, ['PENDING', 'FAILED']);
});

test('R01: both audited weighted genomes preserve their pre-Wave-1 outcomes and replay identifiers', () => {
  const a = baselinePolicyState(), b = structuredClone(a); b.weights.points = -2000; b.weights.defense = 2000;
  const expected = ['dc8f8b31c11bf7af23da807949cbd38fd58c002ffc5c08c5a42e43a4a8f660ef', 'af13bf621ccfd981c1c10c63d7eac168fdbe2a17382e8328f48db6849f31d530'];
  const results = [a, b].map((state, i) => {
    const summary = runPolicyMatch({ seed: 42, profileId: config.profileId, policyIds: [WEIGHTED_POLICY_ID, 'control'], policyStates: [state, null], telemetryEnabled: false, includeReplay: false }).summary;
    assert.equal(summary.matchResultHash, expected[i]);
    assert.match(summary.identity.outcomeDigest, /^[a-f0-9]{64}$/);
    assert.equal(summary.identity.outcomeContract, 'intrilex-outcome@1');
    assert.equal(summary.identity.legacyMatchId, summary.matchId);
    return summary.identity;
  });
  assert.notEqual(results[0].subjectDigests[0], results[1].subjectDigests[0]);
  assert.notEqual(results[0].deterministicSampleId, results[1].deterministicSampleId);
});

test('R02: import and generic deletion cannot overwrite an owned occurrence; aborted transactions retain nothing', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId, manifest } = await api.beginExperimentRun({ config });
  const run = createRunRecord({ experimentId: manifest.experimentId, ordinal: manifest.ordinal, config });
  await assert.rejects(() => store.saveRunArtifact({ run, manifest: { ...manifest, status: MANIFEST_STATUS.COMPLETED } }), { code: 'RUN_IMPORT_ACTIVE_OCCURRENCE' });
  await assert.rejects(() => store.deleteRun(runId), { code: 'RUN_OWNERSHIP_REQUIRED' });
  await assert.rejects(() => store._transact(['manifests', 'runBatches'], async ops => {
    await ops.put('runBatches', { batchId: runId + '#abort', runId });
    await ops.put('manifests', { ...manifest, committedMatches: 999 });
    throw new Error('INJECTED_ABORT');
  }), /INJECTED_ABORT/);
  assert.equal((await store.getManifest(runId)).committedMatches, 0);
  assert.equal((await store.listRunBatches(runId)).length, 0);
});

test('R05: reservation abort rolls back manifest, exposure and receipt before any attempt is consumed', async () => {
  let armed = false;
  const store = memoryStore({ onWrite: ({ store: name }) => { if (armed && name === 'receipts') throw new Error('INJECTED_RESERVATION_ABORT'); } });
  const { agentProfileId } = await createGraveMaw(store), { nomination } = await fixtureSeries({ store, agentProfileId, commandId: 'abort-series' });
  const before = await store.listArtifacts(agentProfileId);
  armed = true;
  await assert.rejects(() => prepareChallenge({ store, agentProfileId, nominationId: nomination.id, commandId: 'abort-attempt' }), /INJECTED_RESERVATION_ABORT/);
  assert.deepEqual(await store.listArtifacts(agentProfileId), before);
  armed = false;
  const committed = await prepareChallenge({ store, agentProfileId, nominationId: nomination.id, commandId: 'abort-attempt' });
  assert.equal(committed.body.attempt.number, 1);
});

test('R08: actual Evolution save queue keeps completion pending until acknowledgement and reports quota failure', async () => {
  const dashboard = await readFile(new URL('../apps/lab-web/src/workspaces/evolution-dashboard.js', import.meta.url), 'utf8');
  const body = dashboard.slice(dashboard.indexOf('function persist()'), dashboard.indexOf('function readConfig()'));
  let resolve, reject;
  const current = { runId: 'save-proof', status: 'COMPLETE' }, view = { saveChain: Promise.resolve(), saveRevision: 0, mounted: false, storageError: '' };
  const persist = runInNewContext(body + ';persist', { view, run: () => current, elapsed: () => 0, structuredClone, acknowledgedSave,
    store: { save: () => new Promise((r, j) => { resolve = r; reject = j; }) }, refreshHistory: async () => {}, strategyEvidenceNote: () => '', storageStatus() {} });
  const pending = persist(); await Promise.resolve();
  assert.equal(current.status, 'COMPLETE'); assert.equal(view.persistenceState, 'PENDING');
  resolve(); await pending; assert.equal(view.persistenceState, 'LOCALLY_COMMITTED');
  const failing = persist(); await Promise.resolve(); reject(new Error('quota')); await failing;
  assert.equal(view.persistenceState, 'FAILED'); assert.match(view.storageError, /Save failed: quota/);
});
