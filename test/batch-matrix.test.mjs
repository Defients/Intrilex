import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchMatrix, batchMatrixPlan, batchCellRun, runBatchMatrix, batchMatrixView, batchMatrixArtifact, validateBatchMatrixArtifact, batchMatrixManifest, validateBatchMatrixManifest, rehydrateBatchMatrix, validateMatrixEnvelope, batchMatrixConfig, BATCH_MATRIX_CONTRACT } from '../packages/simulation-runtime/src/batch-matrix.mjs';
import { runMatchupLab, matchupArtifact } from '../packages/simulation-runtime/src/matchup-lab.mjs';
import { runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { artifactEnvelope } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { identity, memoryStore, createGraveMaw, FIXED_CLOCK } from './fixtures/agent-profile-fixtures.mjs';

const twoStatics = { participants: [{ kind: 'STATIC_POLICY', policyId: 'control' }, { kind: 'STATIC_POLICY', policyId: 'tempo' }], gamesPerMatchup: 4, seed: 42, profileId: 'core-advanced-authority', workerCount: 1, strategicTrace: false };

test('config rejects bad participant sets, odd game counts and out-of-range values', async () => {
  const one = [{ kind: 'STATIC_POLICY', policyId: 'control' }];
  const nine = Array.from({ length: 9 }, (_, i) => ({ kind: 'STATIC_POLICY', policyId: `p${i}` }));
  assert.throws(() => batchMatrixConfig({ ...twoStatics, participants: one }), /INVALID_MATRIX_PARTICIPANTS/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, participants: nine }), /INVALID_MATRIX_PARTICIPANTS/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, participants: [twoStatics.participants[0], twoStatics.participants[0]] }), /MATRIX_DUPLICATE_PARTICIPANT/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, participants: [{ kind: 'STATIC_POLICY', policyId: 'bogus' }, { kind: 'STATIC_POLICY', policyId: 'control' }] }), /MATRIX_POLICY_NOT_ADMITTED/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, participants: [{ kind: 'AGENT_PROFILE' }, { kind: 'STATIC_POLICY', policyId: 'control' }] }), /MATRIX_PROFILE_ID_MISSING/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, participants: [{ kind: 'ELF' }, { kind: 'STATIC_POLICY', policyId: 'control' }] }), /MATRIX_PARTICIPANT_KIND/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, gamesPerMatchup: 3 }), /MATRIX_REQUIRES_COMPLETE_PAIRS/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, gamesPerMatchup: 0 }), /MATRIX_REQUIRES_COMPLETE_PAIRS/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, seed: 0 }), /INVALID_MATRIX_SEED/);
  assert.throws(() => batchMatrixConfig({ ...twoStatics, workerCount: 9 }), /INVALID_MATRIX_CONFIG/);
});

test('plan derives every unique pairing and the total game count from the validated config', () => {
  const six = ['control', 'tempo', 'value', 'score-rush', 'random-legal', 'control-tactical'].map(policyId => ({ kind: 'STATIC_POLICY', policyId }));
  const plan = batchMatrixPlan({ ...twoStatics, participants: six, gamesPerMatchup: 128 });
  assert.equal(plan.participants, 6);
  assert.equal(plan.matchups, 15);
  assert.equal(plan.totalGames, 1920);
  assert.equal(plan.gamesPerMatchup, 128);
});

test('worker count is operational only: it never alters matrix scientific identity', async () => {
  const a = await createBatchMatrix(twoStatics, identity, null, FIXED_CLOCK());
  const b = await createBatchMatrix({ ...twoStatics, workerCount: 4 }, identity, null, FIXED_CLOCK());
  const c = await createBatchMatrix({ ...twoStatics, seed: 43 }, identity, null, FIXED_CLOCK());
  assert.equal(a.matrixId, b.matrixId);
  assert.notEqual(a.matrixId, c.matrixId);
});

test('static participants execute end to end with balanced AB/BA seats and a truthful view', async () => {
  const input = { ...twoStatics, participants: [...twoStatics.participants, { kind: 'STATIC_POLICY', policyId: 'value' }] };
  const lab = await runBatchMatrix(input, runLabSeries, { identity, createdAt: FIXED_CLOCK() });
  assert.equal(lab.status, 'COMPLETE');
  assert.equal(lab.runs.length, 3);
  for (const run of lab.runs) {
    assert.equal(run.kind, 'EVALUATION');
    assert.equal(run.config.mirrorSeats, true);
    assert.equal(run.matrixCell.matrixId, lab.matrixId);
    assert.equal(run.records.length, 4);
    assert.equal(run.records.filter(r => r.swapped).length, 2);
  }
  const view = batchMatrixView(lab);
  assert.equal(view.cellsComplete, 3);
  assert.equal(view.acceptedGames, 12);
  assert.equal(view.requestedGames, 12);
  assert.equal(view.leaderboard.length, 3);
  for (const cell of view.cells) {
    assert.equal(cell.seats[0].seat, 'AB');
    assert.equal(cell.seats[1].seat, 'BA');
    assert.equal(cell.metrics.winsA + cell.metrics.winsB + cell.metrics.draws, cell.metrics.clean);
  }
  assert.equal(view.leaderboard[0].rank, 1);
});

test('two distinct Profiles on the same policy family stay separate participants and freeze exact checkpoints', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  const b = await createGraveMaw(store, 'second', { displayName: 'SECOND', traits: { scoringDrive: 90, guard: 5 } });
  const lab = await createBatchMatrix({ ...twoStatics, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'AGENT_PROFILE', agentProfileId: b.agentProfileId }] }, identity, store, FIXED_CLOCK());
  assert.equal(lab.participants[0].participantId, `profile:${a.agentProfileId}`);
  assert.notEqual(lab.participants[0].participantId, lab.participants[1].participantId);
  assert.equal(lab.participants[0].policyId, lab.participants[1].policyId, 'same policy family');
  assert.notEqual(lab.checkpoints[0].checkpointId, lab.checkpoints[1].checkpointId);
  const run = batchCellRun(lab, 0, 1, FIXED_CLOCK());
  assert.equal(run.config.botA, run.config.botB, 'engine sees the shared policy family');
  assert.deepEqual(run.arenaProfiles.snapshots.map(s => s.profile.agentProfileId), [a.agentProfileId, b.agentProfileId]);
});

test('missing Profiles and rules mismatches fail closed at freeze time', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  await assert.rejects(createBatchMatrix({ ...twoStatics, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: 'missing' }, { kind: 'STATIC_POLICY', policyId: 'control' }] }, identity, store), /PROFILE_NOT_FOUND/);
  await assert.rejects(createBatchMatrix({ ...twoStatics, profileId: 'core-unrestricted-authority', participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }] }, identity, store), /MATRIX_PROFILE_RULES_MISMATCH/);
  await assert.rejects(createBatchMatrix({ ...twoStatics, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }] }, identity, null), /MATRIX_STORE_REQUIRED/);
});

test('a running matrix keeps frozen heads after live Profile heads change, and performs no scientific writes', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  const b = await createGraveMaw(store, 'second', { displayName: 'SECOND', traits: { scoringDrive: 90, guard: 5 } });
  const input = { ...twoStatics, gamesPerMatchup: 2, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'AGENT_PROFILE', agentProfileId: b.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }] };
  const lab = await createBatchMatrix(input, identity, store, FIXED_CLOCK());
  const frozenA = lab.participants[0].checkpointId;
  const before = await store.profileView(a.agentProfileId);
  const head = await store.getHead(a.agentProfileId);
  const draft = await store.saveDraftRevision({ agentProfileId: a.agentProfileId, baseRevisionId: head.activeRevisionId, sourceCheckpointId: head.championCheckpointId, traits: { scoringDrive: 10 } });
  await store.activateAuthoredRevision({ agentProfileId: a.agentProfileId, expectedHead: head, revisionId: draft.revision.id, commandId: 'mutate-during-matrix' });
  const moved = await store.getHead(a.agentProfileId);
  assert.notEqual(moved.championCheckpointId, frozenA, 'live head moved after freeze');
  const done = await runBatchMatrix(lab, runLabSeries, { identity });
  assert.equal(done.status, 'COMPLETE');
  for (const run of done.runs) {
    const cpIds = run.checkpoints.map(c => c.checkpointId);
    if (run.matrixCell.seatA.includes(a.agentProfileId)) assert.equal(cpIds[0], frozenA);
    if (run.matrixCell.seatB.includes(a.agentProfileId)) assert.equal(cpIds[1], frozenA);
    const snapshotA = run.arenaProfiles.snapshots.find(s => s?.profile.agentProfileId === a.agentProfileId);
    if (snapshotA) assert.equal(snapshotA.profile.headVersion, 1);
  }
  const after = await store.profileView(a.agentProfileId);
  assert.equal(after.head.headVersion, before.head.headVersion + 1, 'only the explicit command moved the head');
  assert.equal((await store.getHead(b.agentProfileId)).headVersion, 1);
});

test('stop preserves completed cells and resume finishes from frozen authority without re-running them', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  const input = { ...twoStatics, gamesPerMatchup: 2, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }, { kind: 'STATIC_POLICY', policyId: 'tempo' }] };
  const lab = await createBatchMatrix(input, identity, store, FIXED_CLOCK());
  const controller = new AbortController();
  let cells = 0;
  await runBatchMatrix(lab, runLabSeries, { identity, signal: controller.signal, onMatrix: l => { cells = l.runs.filter(r => r.status === 'COMPLETE').length; if (cells >= 1) controller.abort(); } });
  assert.equal(lab.status, 'STOPPED');
  assert.equal(lab.runs.filter(r => r.status === 'COMPLETE').length, 1);
  const completedRunId = lab.runs[0].runId, completedRecords = lab.runs[0].records.length;
  await store.renameProfile(a.agentProfileId, 'RENAMED AFTER FREEZE');
  const head = await store.getHead(a.agentProfileId);
  const draft = await store.saveDraftRevision({ agentProfileId: a.agentProfileId, baseRevisionId: head.activeRevisionId, sourceCheckpointId: head.championCheckpointId, traits: { scoringDrive: 5 } });
  await store.activateAuthoredRevision({ agentProfileId: a.agentProfileId, expectedHead: head, revisionId: draft.revision.id, commandId: 'mutate-before-resume' });
  let executions = 0;
  const counting = async (config, options) => { executions += 1; return runLabSeries(config, options); };
  const done = await runBatchMatrix(lab, counting, { identity });
  assert.equal(done.status, 'COMPLETE');
  assert.equal(executions, 2, 'only incomplete cells re-executed');
  const first = done.runs.find(r => r.runId === completedRunId);
  assert.equal(first.records.length, completedRecords, 'completed cell evidence preserved verbatim');
  const view = batchMatrixView(done);
  assert.equal(view.cellsComplete, 3);
  assert.equal(view.acceptedGames, 6);
});

test('interrupted partial cells resume at game granularity without duplicating ordinals', async () => {
  const input = { ...twoStatics, gamesPerMatchup: 6 };
  const lab = await createBatchMatrix(input, identity, null, FIXED_CLOCK());
  const run = batchCellRun(lab, 0, 1, FIXED_CLOCK());
  const partial = await runLabSeries(run.config, { identity, run: { ...run, status: 'PAUSED' } });
  // Simulate a stopped cell: keep only the first accepted games, mark STOPPED.
  const stopped = structuredClone(partial.run);
  stopped.records = stopped.records.slice(0, 2);
  stopped.replays = [];
  stopped.status = 'STOPPED';
  lab.runs.push(stopped);
  const controller = new AbortController();
  controller.abort();
  await runBatchMatrix(lab, runLabSeries, { identity, signal: controller.signal });
  assert.equal(lab.status, 'STOPPED');
  const done = await runBatchMatrix(lab, runLabSeries, { identity, signal: new AbortController().signal });
  const resumed = done.runs.find(r => r.matrixCell.seatA === run.matrixCell.seatA && r.matrixCell.seatB === run.matrixCell.seatB);
  assert.equal(resumed.records.length, 6);
  assert.equal(new Set(resumed.records.map(r => r.ordinal)).size, 6, 'no ordinal replayed or duplicated');
});

test('artifact round trip validates and tampering fails closed', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  const input = { ...twoStatics, gamesPerMatchup: 2, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }] };
  const lab = await runBatchMatrix(input, runLabSeries, { identity, store, createdAt: FIXED_CLOCK() });
  assert.equal(lab.status, 'COMPLETE');
  const envelope = batchMatrixArtifact(lab);
  assert.equal(envelope.format, 'intrilex-matchup-lab');
  assert.equal(envelope.schemaVersion, 2);
  const restored = validateBatchMatrixArtifact(envelope);
  assert.equal(restored.matrixId, lab.matrixId);
  const badHash = structuredClone(envelope);
  badHash.payload.status = 'STOPPED';
  assert.throws(() => validateBatchMatrixArtifact(badHash), /MATRIX_ARTIFACT_HASH_MISMATCH/);
  const snapshotTamper = validateBatchMatrixArtifact(envelope);
  snapshotTamper.participants[0].snapshot.policyState.weights.points += 1;
  assert.throws(() => batchMatrixView(snapshotTamper), /SNAPSHOT_DIGEST_MISMATCH|MATRIX_CHECKPOINT_MISMATCH/);
  const checkpointSub = validateBatchMatrixArtifact(envelope);
  checkpointSub.checkpoints[1] = structuredClone(checkpointSub.checkpoints[0]);
  assert.throws(() => batchMatrixView(checkpointSub), /MATRIX_CHECKPOINT_SUBSTITUTION|INVALID_MATRIX_ARTIFACT/);
  const seatSub = validateBatchMatrixArtifact(envelope);
  seatSub.participants[1].participantId = 'profile:attacker';
  assert.throws(() => batchMatrixView(seatSub), /MATRIX_PARTICIPANT_MISMATCH|MATRIX_SCIENTIFIC_ID_MISMATCH/);
  const dup = validateBatchMatrixArtifact(envelope);
  dup.runs.push(structuredClone(dup.runs[0]));
  assert.throws(() => batchMatrixView(dup), /DUPLICATE_MATRIX_SERIES/);
  const fake = validateBatchMatrixArtifact(envelope);
  fake.runs = [];
  fake.status = 'COMPLETE';
  assert.throws(() => batchMatrixView(fake), /INCOMPLETE_MATRIX_CLAIM|MATRIX_ARTIFACT_HASH_MISMATCH/);
});

test('compact manifest persists the frozen plan by reference and rehydrates resumable labs', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  const input = { ...twoStatics, gamesPerMatchup: 2, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }, { kind: 'STATIC_POLICY', policyId: 'tempo' }] };
  const lab = await runBatchMatrix(input, runLabSeries, { identity, store, createdAt: FIXED_CLOCK() });
  const manifest = batchMatrixManifest(lab);
  assert.equal(manifest.kind, 'MANIFEST');
  assert.equal(manifest.payload.runRefs.length, 3);
  assert.ok(!manifest.payload.runs, 'manifest never embeds records');
  const parsed = validateBatchMatrixManifest(manifest);
  const saved = new Map(lab.runs.map(r => [r.runId, r]));
  const rehydrated = await rehydrateBatchMatrix(parsed, id => saved.get(id) ?? null);
  assert.equal(rehydrated.matrixId, lab.matrixId);
  assert.equal(batchMatrixView(rehydrated).cellsComplete, 3);
  await assert.rejects(rehydrateBatchMatrix(parsed, () => null), /INCOMPLETE_MATRIX_CLAIM/, 'a COMPLETE claim without evidence fails closed');
  const idle = await createBatchMatrix(input, identity, store, FIXED_CLOCK());
  const partial = await rehydrateBatchMatrix(validateBatchMatrixManifest(batchMatrixManifest(idle)), () => null);
  assert.equal(batchMatrixView(partial).cellsComplete, 0, 'missing runs leave cells pending');
  const swapped = structuredClone(manifest);
  swapped.payload.runRefs[0].runId = `EL-${'0'.repeat(24)}`;
  assert.throws(() => validateBatchMatrixManifest(swapped), /MATRIX_ARTIFACT_HASH_MISMATCH|INVALID_MATRIX_RUNREF/);
});

test('envelope dispatch accepts v1 static artifacts, v2 artifacts and v2 manifests', async () => {
  const v1 = await runMatchupLab({ policyIds: ['control', 'tempo'], masterSeeds: [7], gamesPerPairing: 2, workerCount: 1 }, runLabSeries, { identity, createdAt: FIXED_CLOCK() });
  const legacy = matchupArtifact(v1);
  assert.equal(validateMatrixEnvelope(legacy).schemaVersion, 1);
  const lab = await runBatchMatrix(twoStatics, runLabSeries, { identity, createdAt: FIXED_CLOCK() });
  assert.equal(validateMatrixEnvelope(batchMatrixArtifact(lab)).schemaVersion, 2);
  assert.equal(validateMatrixEnvelope(batchMatrixManifest(lab)).matrixId, lab.matrixId);
  assert.throws(() => validateMatrixEnvelope({ format: 'intrilex-matchup-lab', schemaVersion: 3 }), /MATRIX_ARTIFACT_UNSUPPORTED|MATRIX_ARTIFACT_HASH_MISMATCH/);
});

test('evaluation-only boundary: matrix artifacts and runs carry no training or promotion authority', async () => {
  const store = memoryStore();
  const a = await createGraveMaw(store);
  const lab = await runBatchMatrix({ ...twoStatics, gamesPerMatchup: 2, participants: [{ kind: 'AGENT_PROFILE', agentProfileId: a.agentProfileId }, { kind: 'STATIC_POLICY', policyId: 'control' }] }, runLabSeries, { identity, store, createdAt: FIXED_CLOCK() });
  assert.equal(lab.purpose, 'EVALUATION');
  assert.equal(lab.contract, BATCH_MATRIX_CONTRACT);
  for (const run of lab.runs) {
    assert.equal(run.kind, 'EVALUATION');
    assert.equal(run.researchPurpose ?? 'EVALUATION', 'EVALUATION');
    const envelope = artifactEnvelope(run);
    assert.ok(!JSON.stringify(envelope).includes('promotion'), 'no promotion semantics in evidence');
  }
  const view = batchMatrixView(lab);
  assert.match(view.uncertainty, /descriptive matrix performance/);
});
