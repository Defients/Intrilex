import test from 'node:test';
import { runLabGame } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { sampleIdentity } from '../packages/simulation-runtime/src/evidence-identity.mjs';
import assert from 'node:assert/strict';
import { createProfileArenaRun, validateProfileArenaRun, profileChoice, profileArenaRoster } from '../packages/simulation-runtime/src/profile-arena.mjs';
import { createLabRun, artifactEnvelope, validateArtifact, gamePlan } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { identity, memoryStore, createGraveMaw, FIXED_CLOCK } from './fixtures/agent-profile-fixtures.mjs';

const config = { botA: 'control', botB: 'tempo', profileId: 'core-advanced-authority', gameCount: 2, seed: 42, workerCount: 1, mirrorSeats: true, kind: 'SELF_PLAY' };

test('static Arena runs retain their exact existing artifact and configuration shape', async () => {
  const run = await createProfileArenaRun(config, identity, null, FIXED_CLOCK());
  assert.deepEqual(run, createLabRun(config, identity, FIXED_CLOCK()));
});

test('both Arena seats resolve distinct Profile checkpoints rather than weighted baselines; paired seats use those IDs', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store), b = await createGraveMaw(store, 'second', { displayName: 'SECOND', traits: { scoringDrive: 90, guard: 5 } });
  const before = await store.profileView(a.agentProfileId);
  const run = await createProfileArenaRun({ ...config, botA: profileChoice(a.agentProfileId), botB: profileChoice(b.agentProfileId) }, identity, store, FIXED_CLOCK());
  assert.equal(run.config.botA, 'weighted-heuristic-v1');
  assert.equal(run.config.botB, 'weighted-heuristic-v1');
  assert.notEqual(run.checkpoints[0].checkpointId, run.checkpoints[1].checkpointId);
  assert.equal(run.checkpoints[0].checkpointId, before.head.championCheckpointId);
  assert.equal(run.arenaProfiles.snapshots[1].displayName, 'SECOND');
  assert.deepEqual(gamePlan(run.config, 1).policyIds, ['weighted-heuristic-v1', 'weighted-heuristic-v1']);
  validateArtifact(artifactEnvelope(run), identity);
  validateProfileArenaRun(run, identity);
  assert.deepEqual(await store.profileView(a.agentProfileId), before, 'consumer performs no scientific writes');
});

test('one Profile in both Arena seats is resolved once even if its head changes between reads', async () => {
  const store = memoryStore(), a = await createGraveMaw(store);
  let resolves = 0;
  const proxy = { resolveProfileHead: async id => {
    resolves++;
    const snapshot = await store.resolveProfileHead(id), head = await store.getHead(id);
    const draft = await store.saveDraftRevision({ agentProfileId: id, baseRevisionId: head.activeRevisionId, sourceCheckpointId: head.championCheckpointId, traits: { scoringDrive: 10 } });
    await store.activateAuthoredRevision({ agentProfileId: id, expectedHead: head, revisionId: draft.revision.id, commandId: 'move-during-resolution' });
    return snapshot;
  }, getCheckpoint: id => store.getCheckpoint(id) };
  const run = await createProfileArenaRun({ ...config, botA: profileChoice(a.agentProfileId), botB: profileChoice(a.agentProfileId) }, identity, proxy, FIXED_CLOCK());
  assert.equal(resolves, 1);
  assert.deepEqual(run.arenaProfiles.snapshots[0], run.arenaProfiles.snapshots[1]);
  assert.equal(run.arenaProfiles.snapshots[0].profile.headVersion, 1);
  assert.notEqual(run.checkpoints[0].checkpointId, (await store.getHead(a.agentProfileId)).championCheckpointId);
});

test('saved Profile Arena runs validate with their own immutable authority and no live Profile store', async () => {
  const store = memoryStore(), a = await createGraveMaw(store);
  const run = await createProfileArenaRun({ ...config, botB: profileChoice(a.agentProfileId) }, identity, store, FIXED_CLOCK());
  await store.renameProfile(a.agentProfileId, 'RENAMED');
  const saved = validateArtifact(artifactEnvelope(run), identity);
  validateProfileArenaRun(saved, identity);
  assert.equal(saved.arenaProfiles.snapshots[1].displayName, 'GRAVE MAW');
  const tampered = structuredClone(saved);
  tampered.arenaProfiles.snapshots[1].policyState.weights.points += 1;
  assert.throws(() => validateProfileArenaRun(tampered, identity), /SNAPSHOT_DIGEST_MISMATCH/);
  const swapped = structuredClone(saved);
  swapped.checkpoints[1] = createLabRun({ ...config, botB: 'weighted-heuristic-v1' }, identity, FIXED_CLOCK()).checkpoints[1];
  assert.throws(() => validateProfileArenaRun(swapped, identity), /CHECKPOINT_MISMATCH/);
});

test('missing Profiles, mismatched rules and malformed selections fail without static fallback', async () => {
  const store = memoryStore(), a = await createGraveMaw(store);
  await assert.rejects(createProfileArenaRun({ ...config, botA: profileChoice('missing') }, identity, store), /PROFILE_NOT_FOUND/);
  await assert.rejects(createProfileArenaRun({ ...config, botA: profileChoice(a.agentProfileId), profileId: 'core-unrestricted-authority' }, identity, store), /RULES_MISMATCH/);
  await assert.rejects(createProfileArenaRun({ ...config, botA: 'weighted-heuristic-v1' }, identity, store), /CHOICE_NOT_ADMITTED/);
  assert.equal((await profileArenaRoster(store))[0].snapshot.profile.agentProfileId, a.agentProfileId);
});

test('Wave 1: executed Arena samples bind ordered checkpoints, revisions and frozen snapshots',async()=>{
  const store=memoryStore(),a=await createGraveMaw(store);
  const run=await createProfileArenaRun({...config,botA:profileChoice(a.agentProfileId)},identity,store,FIXED_CLOCK());
  for(const ordinal of [0,1]){
    const plan=gamePlan(run.config,ordinal),cp=plan.swapped?[...run.checkpoints].reverse():run.checkpoints;
    const snapshots=plan.swapped?[...run.arenaProfiles.snapshots].reverse():run.arenaProfiles.snapshots;
    const expected=sampleIdentity({...plan,profileId:run.config.profileId,checkpointIds:cp.map(c=>c.checkpointId),revisionIds:snapshots.map(s=>s?.profile?.activeRevisionId??null),subjectSnapshots:snapshots,policyStates:cp.map(c=>c.schemaVersion===2?c.policyState:null),adaptiveConfigs:cp.map(c=>c.schemaVersion===2?(c.adaptive??null):null),decisionLimit:run.config.decisionLimit,orchestrationCommandLimit:run.config.orchestrationCommandLimit},identity);
    const {record}=runLabGame(run,ordinal);
    assert.equal(record.evidenceIdentity.deterministicSampleId,expected.deterministicSampleId);
    assert.deepEqual(record.evidenceIdentity.subjectDigests,expected.subjectDigests);
  }
});
