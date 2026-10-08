import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '@intrilex/shared';
import { createTrainableCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { createTrainingProject } from '../packages/simulation-runtime/src/evolution-training.mjs';
import { baselinePolicyState } from '../packages/policies/src/weighted-heuristic.mjs';
import { ProfileStore, MemoryBackend, validateSnapshot, transitionIdFor } from '../packages/simulation-runtime/src/profile-store.mjs';
import { TEMPLATE_CATALOG, resolveEra, resolveObjective, makeArtifact, headToken } from '../packages/simulation-runtime/src/profile-contracts.mjs';
import { promoteChallenger, startSeries, prepareChallenge, buildExperienceRecord } from '../packages/simulation-runtime/src/profile-science.mjs';
import { identity, memoryStore, createGraveMaw, fixtureSeries, fixtureChallenge, manuallyActivateFixtureDecision, FIXED_CLOCK } from './fixtures/agent-profile-fixtures.mjs';

const code = async fn => { try { await fn(); } catch (error) { return error.code ?? error.message; } return 'NO_ERROR'; };
const cloneData = data => new Map([...data].map(([k, v]) => [k, new Map([...v].map(([kk, vv]) => [kk, structuredClone(vv)]))]));
const dataDigest = data => hashCanonical([...data].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort(([a], [b]) => a.localeCompare(b))]));
const alternateIdentity = () => {
  // A labeled historical v1 fixture has no v2 dependency attestation.
  const { identityContract: _contract, dependencyManifest: _manifest, analysisHash: _analysis, analysisFingerprint: _analysisFingerprint, ...legacy } = identity;
  const runtimeHash = 'c'.repeat(64), { engineHash, policyImplementationHash, engineVersion, rulesVersion } = legacy;
  return { ...legacy, runtimeHash, fingerprint: hashCanonical({ engineHash, policyImplementationHash, runtimeHash, engineVersion, rulesVersion }) };
};

async function promotedProfile() {
  const data = new Map(), store = memoryStore({ data }), created = await createGraveMaw(store);
  const { nomination } = await fixtureSeries({ store, agentProfileId: created.agentProfileId, commandId: 'series-1' });
  const { decision } = await fixtureChallenge({ store, agentProfileId: created.agentProfileId, nominationId: nomination.id, commandId: 'challenge-1' });
  return { data, store, created, nomination, decision };
}

test('custom Profile creation needs no archetype and installs a truthful, unevaluated initial Champion', async () => {
  const store = memoryStore(), created = await createGraveMaw(store);
  const view = await store.profileView(created.agentProfileId);
  assert.equal(view.profile.displayName, 'GRAVE MAW');
  assert.doesNotMatch(JSON.stringify(view), /archetype/i, 'no archetype classification anywhere');
  const revision = view.artifacts.find(a => a.id === view.head.activeRevisionId), objective = view.artifacts.find(a => a.id === revision.body.objectiveInstanceId);
  assert.equal(objective.body.definitionId, 'GENERALIST_PAIRED_SCORE'); assert.equal(objective.body.definitionVersion, 1);
  assert.deepEqual(revision.body.intendedIdentity.traits, { scoringDrive: 30, guard: 20 });
  const champion = view.checkpoints.find(cp => cp.checkpointId === view.head.championCheckpointId);
  assert.equal(champion.mutation.kind, 'PROFILE_BASELINE_V1'); assert.equal(champion.mutation.compiler.id, 'TRAIT_COMPILER_LINEAR');
  assert.deepEqual(champion.policyState.weights, { points: 600, resource: 0, tempo: 0, defense: 400, synergy: 0, risk: 0 });
  assert.equal(view.events.length, 1); assert.equal(view.events[0].type, 'INITIALIZED'); assert.equal(view.events[0].evidenceStatus, 'UNEVALUATED');
  assert.equal(view.head.headVersion, 1);
  const journal = view.artifacts.find(a => a.id === view.events[0].journalId);
  assert.equal(journal.body.sections.performanceChange.status, 'NOT_MEASURED');
});

test('template initialization snapshots values and leaves no permanent identity requirement', async () => {
  const catalog = structuredClone(TEMPLATE_CATALOG), store = memoryStore();
  const created = await store.createProfile({ commandId: 'tpl', displayName: 'VELVET GUILLOTINE', template: { templateId: 'scoring-pressure', templateVersion: 1 } }, { templateCatalog: catalog });
  const before = await store.profileView(created.agentProfileId);
  catalog[1].traits.scoringDrive = 99; catalog[1].traits.riskAppetite = 50;
  const after = await store.profileView(created.agentProfileId);
  assert.equal(hashCanonical(before), hashCanonical(after));
  const revision = after.artifacts.find(a => a.kind === 'PROFILE_REVISION');
  assert.equal(revision.body.template.templateId, 'scoring-pressure'); assert.deepEqual(revision.body.intendedIdentity.traits, { scoringDrive: 40, initiative: 20 });
  assert.doesNotMatch(JSON.stringify(after.head) + JSON.stringify(after.profile), /template|archetype/i, 'head and profile identity carry no template class');
});

test('command retries are idempotent and a reused commandId with a different payload is rejected', async () => {
  const store = memoryStore(), a = await createGraveMaw(store), b = await createGraveMaw(store);
  assert.equal(b.replayed, true); assert.equal(b.transitionId, a.transitionId);
  assert.equal(await code(() => createGraveMaw(store, 'create-grave-maw', { displayName: 'GRAVE MAW II' })), 'COMMAND_ID_REUSED');
  assert.equal((await store.listEvents(a.agentProfileId)).length, 1);
});

test('drafts never move the head; authored activation previews replaced learned values and keeps history', async () => {
  const { store, created, decision } = await promotedProfile();
  const h1 = await store.getHead(created.agentProfileId);
  await manuallyActivateFixtureDecision({ store, agentProfileId: created.agentProfileId, decisionId: decision.id, commandId: 'promote-1' });
  const head = await store.getHead(created.agentProfileId), champion = await store.getCheckpoint(head.championCheckpointId);
  const learnedParameter = champion.mutation.operator.parameter, trait = { points: 'scoringDrive', resource: 'resourceAppetite', tempo: 'initiative', defense: 'guard', synergy: 'combinationPlay', risk: 'riskAppetite' }[learnedParameter];
  const draft = await store.saveDraftRevision({ agentProfileId: created.agentProfileId, baseRevisionId: head.activeRevisionId, traits: { [trait]: 10 }, sourceCheckpointId: head.championCheckpointId });
  assert.equal(hashCanonical(await store.getHead(created.agentProfileId)), hashCanonical(head), 'draft does not move the head');
  const row = draft.preview.find(r => r.parameter === learnedParameter);
  assert.equal(row.currentProvenance, 'LEARNED_BY_OPTIMIZER'); assert.equal(row.replacesLearnedValue, true);
  assert.equal(draft.preview.length, 6, 'full genome delta');
  assert.equal(draft.checkpoint.mutation.kind, 'PROFILE_AUTHORED_EDIT_V1'); assert.equal(draft.checkpoint.parentCheckpointId, champion.checkpointId);
  assert.equal(hashCanonical(await store.getCheckpoint(champion.checkpointId)), hashCanonical(champion), 'parent checkpoint unchanged');
  const activated = await store.activateAuthoredRevision({ commandId: 'activate-1', agentProfileId: created.agentProfileId, expectedHead: head, revisionId: draft.revision.id });
  assert.equal(activated.eventType, 'AUTHORED_REVISION_ACTIVATED'); assert.equal(activated.head.headVersion, 3);
  const journal = await store.getArtifact(activated.journalId);
  assert.equal(journal.body.sections.performanceChange.status, 'NOT_MEASURED');
  assert.ok(journal.body.sections.parameterChange.delta.some(d => d.parameter === learnedParameter && d.changed));
  assert.equal(await code(() => store.activateAuthoredRevision({ commandId: 'activate-stale', agentProfileId: created.agentProfileId, expectedHead: h1, revisionId: draft.revision.id })), 'STALE_HEAD');
});

test('A → B → A rollback leaves old challenge authorization stale and repeat attempts ineligible', async () => {
  const { store, created, nomination, decision } = await promotedProfile();
  const id = created.agentProfileId;
  const p = await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'promote-B' });
  const rolled = await store.rollback({ commandId: 'rollback-A', agentProfileId: id, expectedHead: p.head, targetSequence: 1 });
  assert.equal(rolled.head.championCheckpointId, created.head.championCheckpointId, 'checkpoint A is active again');
  assert.equal(rolled.head.headVersion, 3, 'fresh head version, not the old one');
  assert.equal(await code(() => promoteChallenger({ store, agentProfileId: id, decisionId: decision.id, commandId: 'promote-again' })), 'STALE_HEAD');
  const again = await fixtureChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'challenge-2' });
  assert.equal(again.manifest.body.attempt.number, 2); assert.equal(again.manifest.body.attempt.automaticEligible, false);
  assert.equal(again.decision.body.decision, 'APPROVE', 'scientific decision is separate from authorization');
  assert.match(await code(() => promoteChallenger({ store, agentProfileId: id, decisionId: again.decision.id, commandId: 'promote-repeat' })), /PROMOTION_NOT_AUTHORIZED/);
  const events = await store.listEvents(id);
  assert.deepEqual(events.map(e => e.type), ['INITIALIZED', 'MANUALLY_ACTIVATED', 'ROLLED_BACK']);
});

test('two Series from one head: manual activation makes old automatic authorization stale; re-challenge is explicit', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const a = await fixtureSeries({ store, agentProfileId: id, commandId: 'series-A' }), b = await fixtureSeries({ store, agentProfileId: id, commandId: 'series-B' });
  assert.notEqual(a.nomination.body.checkpointId, b.nomination.body.checkpointId);
  const ca = await fixtureChallenge({ store, agentProfileId: id, nominationId: a.nomination.id, commandId: 'ch-A' }), cb = await fixtureChallenge({ store, agentProfileId: id, nominationId: b.nomination.id, commandId: 'ch-B' });
  await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: ca.decision.id, commandId: 'promote-A' });
  assert.equal(await code(() => promoteChallenger({ store, agentProfileId: id, decisionId: cb.decision.id, commandId: 'promote-B' })), 'STALE_HEAD');
  const rb = await fixtureChallenge({ store, agentProfileId: id, nominationId: b.nomination.id, commandId: 'rech-B' });
  assert.equal(rb.manifest.body.incumbentCheckpointId, a.nomination.body.checkpointId, 'new attempt targets the current head');
  assert.equal(rb.manifest.body.attempt.automaticEligible, true, 'genuinely changed incumbent is a new challenge');
  const decisions = (await store.listArtifacts(id, 'CHALLENGE_DECISION')).map(d => d.id);
  assert.ok(decisions.includes(cb.decision.id), 'original stale attempt retained');
  const promoted = await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: rb.decision.id, commandId: 'promote-B2' });
  assert.equal(promoted.head.headVersion, 3);
});

test('independent connections manually activating concurrently: at most one transition wins', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const a = await fixtureSeries({ store, agentProfileId: id, commandId: 'series-A' }), b = await fixtureSeries({ store, agentProfileId: id, commandId: 'series-B' });
  const ca = await fixtureChallenge({ store, agentProfileId: id, nominationId: a.nomination.id, commandId: 'ch-A' }), cb = await fixtureChallenge({ store, agentProfileId: id, nominationId: b.nomination.id, commandId: 'ch-B' });
  const tabA = new ProfileStore(new MemoryBackend({ data: store.backend.data }), { identity, clock: FIXED_CLOCK }), tabB = new ProfileStore(new MemoryBackend({ data: store.backend.data }), { identity, clock: FIXED_CLOCK });
  const results = await Promise.allSettled([manuallyActivateFixtureDecision({ store: tabA, agentProfileId: id, decisionId: ca.decision.id, commandId: 'tab-A' }), manuallyActivateFixtureDecision({ store: tabB, agentProfileId: id, decisionId: cb.decision.id, commandId: 'tab-B' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'STALE_HEAD');
  assert.equal((await store.listEvents(id)).filter(e => e.type === 'MANUALLY_ACTIVATED').length, 1);
});

test('duplicate manual activation after acknowledgement loss replays one transition; payload reuse is rejected', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId;
  const first = await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'promote-1' });
  const retry = await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'promote-1' });
  assert.equal(retry.replayed, true); assert.equal(retry.transitionId, first.transitionId);
  assert.equal((await store.listArtifacts(id, 'PROMOTION_RECORD')).length, 0, 'manual activation never mints a promotion record');
  assert.equal((await store.listEvents(id)).length, 2);
  assert.equal(await code(() => store.rollback({ commandId: 'promote-1', agentProfileId: id, expectedHead: first.head, targetSequence: 1 })), 'COMMAND_ID_REUSED');
});

test('a failure at every write boundary of manual activation leaves no partial head, journal or receipt', async () => {
  const { data, created, decision } = await promotedProfile(), id = created.agentProfileId;
  let writes = 0;
  const probe = new ProfileStore(new MemoryBackend({ data: cloneData(data), onWrite: () => { writes++; } }), { identity, clock: FIXED_CLOCK });
  await manuallyActivateFixtureDecision({ store: probe, agentProfileId: id, decisionId: decision.id, commandId: 'promote-1' });
  assert.ok(writes >= 4, `manual activation writes journal, event, head and receipt (saw ${writes})`);
  for (let k = 0; k < writes; k++) {
    const copy = cloneData(data), before = dataDigest(copy);
    const faulty = new ProfileStore(new MemoryBackend({ data: copy, onWrite: ({ index }) => { if (index === k) throw new Error(`INJECTED_FAULT_${k}`); } }), { identity, clock: FIXED_CLOCK });
    assert.equal(await code(() => manuallyActivateFixtureDecision({ store: faulty, agentProfileId: id, decisionId: decision.id, commandId: 'promote-1' })), `INJECTED_FAULT_${k}`);
    assert.equal(dataDigest(copy), before, `write ${k}: no partial transition`);
    const recovered = await manuallyActivateFixtureDecision({ store: new ProfileStore(new MemoryBackend({ data: copy }), { identity, clock: FIXED_CLOCK }), agentProfileId: id, decisionId: decision.id, commandId: 'promote-1' });
    assert.equal(recovered.head.headVersion, 2, `write ${k}: retry commits once`);
  }
});

test('journal preparation failure leaves the head unchanged', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId, before = await store.getHead(id);
  const broken = new ProfileStore(store.backend, { identity, clock: FIXED_CLOCK });
  broken.getArtifact = async aid => { const a = await store.getArtifact(aid); return a?.kind === 'CHALLENGER_NOMINATION' ? null : a; };
  assert.notEqual(await code(() => promoteChallenger({ store: broken, agentProfileId: id, decisionId: decision.id, commandId: 'p' })), 'NO_ERROR');
  assert.equal(hashCanonical(await store.getHead(id)), hashCanonical(before));
});

test('manual activation waives evidence adequacy only, preserving the automated recommendation', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const s = await fixtureSeries({ store, agentProfileId: id, commandId: 'series-1' });
  const { decision } = await fixtureChallenge({ store, agentProfileId: id, nominationId: s.nomination.id, commandId: 'ch-1', pattern: 'tie' });
  assert.equal(decision.body.decision, 'REJECT');
  assert.equal(await code(() => store.manualActivate({ commandId: 'm0', agentProfileId: id, expectedHead: created.head, checkpointId: s.nomination.body.checkpointId, reason: '' })), 'MANUAL_REASON_REQUIRED');
  assert.equal(await code(() => store.manualActivate({ commandId: 'm1', agentProfileId: id, expectedHead: created.head, checkpointId: s.nomination.body.checkpointId, reason: 'Exploration', waivedCriteria: ['FRESHNESS'] })), 'UNWAIVABLE_CRITERION');
  const historical = createTrainableCheckpoint({ identity: alternateIdentity(), agentId: 'x', lineageId: 'L', policyState: baselinePolicyState(), createdAt: FIXED_CLOCK() });
  await store.storeArtifacts({ checkpoints: [historical] });
  assert.equal(await code(() => store.manualActivate({ commandId: 'm2', agentProfileId: id, expectedHead: created.head, checkpointId: historical.checkpointId, reason: 'Try old mind' })), 'CHAMPION_NOT_EXECUTABLE');
  const ok = await store.manualActivate({ commandId: 'm3', agentProfileId: id, expectedHead: created.head, checkpointId: s.nomination.body.checkpointId, reason: 'Human judgment: prefer this style', recommendationDecisionId: decision.id });
  const event = (await store.listEvents(id)).at(-1), journal = await store.getArtifact(ok.journalId);
  assert.equal(event.type, 'MANUALLY_ACTIVATED'); assert.equal(event.evidenceStatus, 'AUTOMATED_RECOMMENDATION_REJECT');
  assert.equal(journal.body.sections.decision.automatedRecommendation.decision, 'REJECT');
  assert.equal(await code(() => store.manualActivate({ commandId: 'm4', agentProfileId: id, expectedHead: created.head, checkpointId: s.nomination.body.checkpointId, reason: 'stale target' })), 'STALE_HEAD');
});

test('context changes bump headVersion, reject no-ops and misaligned eras', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId;
  assert.equal(await code(() => store.changeContext({ commandId: 'c0', agentProfileId: id, expectedHead: created.head, requiredEvaluationEraId: created.head.requiredEvaluationEraId })), 'CONTEXT_UNCHANGED');
  const otherEra = resolveEra({ identity, objective: resolveObjective({ rulesProfileId: 'core-unrestricted-authority' }) });
  assert.equal(await code(() => store.changeContext({ commandId: 'c1', agentProfileId: id, expectedHead: created.head, requiredEvaluationEraId: otherEra.id, eraArtifact: otherEra })), 'ERA_OBJECTIVE_MISALIGNED');
  const policy = makeArtifact('PROMOTION_POLICY', { ...(await store.getArtifact(created.head.promotionPolicyId)).body, practicalThreshold: 0.03 });
  const changed = await store.changeContext({ commandId: 'c2', agentProfileId: id, expectedHead: created.head, promotionPolicyId: policy.id, policyArtifact: policy });
  assert.equal(changed.head.headVersion, 2); assert.equal(changed.eventType, 'CONTEXT_CHANGED');
  assert.equal(await code(() => promoteChallenger({ store, agentProfileId: id, decisionId: decision.id, commandId: 'p' })), 'STALE_HEAD');
});

test('forking shares the exact checkpoint, edits independently and never rewrites the source', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const sourceBefore = await store.profileView(id);
  const fork = await store.fork({ commandId: 'fork-1', sourceAgentProfileId: id, displayName: 'VELVET GUILLOTINE' });
  assert.equal(fork.head.championCheckpointId, created.head.championCheckpointId);
  const forkHead = await store.getHead(fork.agentProfileId);
  const draft = await store.saveDraftRevision({ agentProfileId: fork.agentProfileId, baseRevisionId: forkHead.activeRevisionId, traits: { riskAppetite: -50 }, sourceCheckpointId: forkHead.championCheckpointId });
  const act = await store.activateAuthoredRevision({ commandId: 'fork-act', agentProfileId: fork.agentProfileId, expectedHead: forkHead, revisionId: draft.revision.id });
  assert.equal(hashCanonical(await store.profileView(id)), hashCanonical(sourceBefore), 'source Profile, history and checkpoint unchanged');
  const series = await startSeries({ store, agentProfileId: fork.agentProfileId, commandId: 'fork-series' });
  assert.equal(series.body.sourceCheckpointId, act.head.championCheckpointId, 'fork continues from its authored active checkpoint');
  const forkView = await store.profileView(fork.agentProfileId);
  assert.ok(forkView.artifacts.some(a => a.kind === 'EXPOSURE_RECORD' && a.body.kind === 'ANCESTRY_LINK' && a.body.ancestorAgentProfileId === id));
});

test('historical Series stay pinned to their objective instance when a later revision resolves another', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const s1 = await startSeries({ store, agentProfileId: id, commandId: 's1' });
  const head = await store.getHead(id);
  const draft = await store.saveDraftRevision({ agentProfileId: id, baseRevisionId: head.activeRevisionId, rulesProfileId: 'core-unrestricted-authority', sourceCheckpointId: head.championCheckpointId });
  assert.equal(draft.revision.body.executableChange, null, 'configuration-only edit records no executable change');
  await store.activateAuthoredRevision({ commandId: 'a', agentProfileId: id, expectedHead: head, revisionId: draft.revision.id });
  const s2 = await startSeries({ store, agentProfileId: id, commandId: 's2' });
  assert.notEqual(s1.body.objectiveInstanceId, s2.body.objectiveInstanceId);
  assert.equal((await store.getArtifact(s1.id)).body.objectiveInstanceId, s1.body.objectiveInstanceId);
  assert.equal((await store.getArtifact(s1.body.objectiveInstanceId)).body.rulesProfileId, 'core-advanced-authority');
  assert.equal((await store.getArtifact(s2.body.objectiveInstanceId)).body.rulesProfileId, 'core-unrestricted-authority');
});

test('ordinary-play experience writes observations only: no training, revision, genome or head change', async () => {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const snapshot = await store.resolveProfileHead(id), before = await store.profileView(id);
  const record = buildExperienceRecord({ encounterId: 'S-1', snapshot, agentSeat: 'P2', rulesProfileId: 'core-advanced-authority', outcome: { winner: 'P1', terminationReason: 'NORMAL_VICTORY' }, observations: { agentDecisions: 40 } });
  assert.equal((await store.recordExperience(record)).duplicate, false);
  assert.equal((await store.recordExperience(record)).duplicate, true, 'duplicate delivery is one encounter');
  const after = await store.profileView(id);
  assert.equal(hashCanonical(after.head), hashCanonical(before.head)); assert.equal(hashCanonical(after.events), hashCanonical(before.events));
  assert.equal(hashCanonical(after.checkpoints), hashCanonical(before.checkpoints));
  assert.deepEqual(after.artifacts.filter(a => !before.artifacts.some(b => b.id === a.id)).map(a => a.kind), ['EXPERIENCE_RECORD']);
});

test('snapshots are exact, digest-checked, frozen and never fall back when execution is unsupported', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId;
  const pinned = await store.resolveProfileHead(id);
  validateSnapshot(pinned);
  assert.throws(() => { pinned.policyState.weights.points = 1; });
  await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'p' });
  const moved = await store.resolveProfileHead(id);
  assert.notEqual(moved.checkpointId, pinned.checkpointId); assert.equal(pinned.profile.headVersion, 1);
  const forged = { ...pinned, policyState: { ...pinned.policyState, weights: { ...pinned.policyState.weights, points: 2000 } } };
  assert.throws(() => validateSnapshot(forged), /SNAPSHOT_DIGEST_MISMATCH/);
  const v1 = createTrainableCheckpoint({ identity: alternateIdentity(), agentId: 'old', lineageId: 'L', policyState: baselinePolicyState(), createdAt: FIXED_CLOCK() });
  const linked = await store.linkV1Checkpoint({ commandId: 'link-old', displayName: 'Old mind', checkpoint: v1 });
  assert.equal(await code(() => store.resolveProfileHead(linked.agentProfileId)), 'SNAPSHOT_NOT_EXECUTABLE');
});

test('immutable writes: identical repeats are idempotent; corrupted stored content is detected', async () => {
  const store = memoryStore(), a = makeArtifact('EVIDENCE_PACK', { purpose: 'DIAGNOSTIC', seeds: [5], nested: { x: [1, { y: 2 }] } }, { scope: 'AP-z' });
  await store.storeArtifacts({ artifacts: [a] }); await store.storeArtifacts({ artifacts: [a] });
  const forged = structuredClone(a); forged.body.nested.x[1].y = 3;
  assert.equal(await code(() => store.storeArtifacts({ artifacts: [forged] })), 'ARTIFACT_DIGEST_MISMATCH');
  const stored = store.backend.data.get('artifacts').get(JSON.stringify(a.id)); stored.body.nested.x[1].y = 9;
  assert.equal(await code(() => store.storeArtifacts({ artifacts: [a] })), 'IMMUTABLE_CONFLICT', 'nested corruption under an unchanged ID');
});

test('retention protects the decision closure and records explicit trace tombstones', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId;
  await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'p' });
  const closure = await store.protectedClosure();
  for (const ref of [decision.id, decision.body.challengerMeasurementId, decision.body.incumbentMeasurementId, decision.body.challengeId]) assert.ok(closure.has(ref), ref);
  assert.equal(await code(() => store.deleteResearchArtifacts([decision.body.challengerMeasurementId])), 'PROTECTED_EVIDENCE');
  const diagnostic = makeArtifact('MEASUREMENT_MANIFEST', { purpose: 'DIAGNOSTIC', note: 'unreferenced' }, { scope: id });
  await store.storeArtifacts({ artifacts: [diagnostic] });
  assert.equal(await store.deleteResearchArtifacts([diagnostic.id]), 1);
  await store.putTrace({ traceId: 'EL-trace', scope: id, payload: { replay: 'large' } });
  const tombstone = await store.pruneTraces(id, ['EL-trace'], 'quota');
  assert.equal(await store.getTrace('EL-trace'), undefined);
  assert.equal((await store.getArtifact(tombstone)).body.summaryRetained, true);
});

test('export/import: isolated store, idempotent repeat, conflicting head rejected, fork import allowed, no partial publish', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId;
  await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'p' });
  const bundle = await store.exportProfile(id), text = JSON.stringify(bundle);
  const empty = memoryStore(), result = await empty.importBundle(text);
  assert.equal(result.idempotent, false);
  const imported = await empty.profileView(id), original = await store.profileView(id);
  assert.equal(hashCanonical(imported.head), hashCanonical(original.head));
  assert.deepEqual(imported.events.map(e => e.transitionId), original.events.map(e => e.transitionId));
  for (const kind of ['PROFILE_REVISION', 'CAPABILITY_OBJECTIVE', 'SERIES_MANIFEST', 'LEARNING_JOURNAL', 'CHALLENGE_DECISION']) assert.ok(imported.artifacts.some(a => a.kind === kind), kind);
  for (const cp of original.checkpoints) assert.equal(hashCanonical(await empty.getCheckpoint(cp.checkpointId)), hashCanonical(cp));
  assert.equal(imported.profile.origin, 'IMPORTED_UNVERIFIED');
  assert.ok(imported.artifacts.filter(a => a.scope === id).every(a => a.meta.origin === 'IMPORTED_UNVERIFIED'));
  assert.equal(empty.backend.data.get('receipts').size, 0, 'receipts are never imported as authority');
  assert.equal((await empty.importBundle(text)).idempotent, true);
  const local = memoryStore(); await createGraveMaw(local);
  const localBefore = dataDigest(local.backend.data);
  assert.equal(await code(() => local.importBundle(text)), 'PROFILE_HEAD_CONFLICT', 'an older local head is never overwritten by an import');
  assert.equal(dataDigest(local.backend.data), localBefore);
  await store.rollback({ commandId: 'rb', agentProfileId: id, expectedHead: await store.getHead(id), targetSequence: 1 });
  const divergedText = JSON.stringify(await store.exportProfile(id));
  assert.equal(await code(() => empty.importBundle(divergedText)), 'PROFILE_HEAD_CONFLICT');
  const asFork = await empty.importBundle(JSON.stringify(await store.exportProfile(id)), { asFork: true, commandId: 'import-fork' });
  assert.notEqual(asFork.agentProfileId, id);
  assert.equal((await empty.listEvents(asFork.agentProfileId))[0].type, 'IMPORTED_AS_FORK');
  const tampered = structuredClone(bundle); tampered.payload.head.headVersion = 99;
  assert.equal(await code(() => memoryStore().importBundle(JSON.stringify(tampered))), 'BUNDLE_DIGEST_MISMATCH');
  const collide = memoryStore(), clash = structuredClone(bundle.payload.artifacts.find(a => a.kind === 'EVIDENCE_PACK'));
  collide.backend.data.get('artifacts').set(JSON.stringify(clash.id), { ...clash, digest: 'f'.repeat(64) });
  const before = dataDigest(collide.backend.data);
  assert.equal(await code(() => collide.importBundle(text)), 'IMMUTABLE_CONFLICT');
  assert.equal(dataDigest(collide.backend.data), before, 'no partial publish');
  assert.equal(await code(() => memoryStore().importBundle(JSON.stringify({ ...bundle, version: 2 }))), 'UNSUPPORTED_BUNDLE_VERSION');
});

test('an imported decision cannot authorize a local automatic promotion', async () => {
  const { store, created, decision } = await promotedProfile(), id = created.agentProfileId;
  const other = memoryStore();
  await other.importBundle(JSON.stringify(await store.exportProfile(id)));
  assert.match(await code(() => promoteChallenger({ store: other, agentProfileId: id, decisionId: decision.id, commandId: 'p-imported' })), /PROMOTION_NOT_AUTHORIZED/);
  assert.equal((await other.getHead(id)).headVersion, 1);
});

test('V1 linkage preserves the original checkpoint ID/hash and recovers from interrupted or quota-failed writes', async () => {
  const project = createTrainingProject({ identity, training: { generations: 1, candidates: 1, trainingPairs: 1, evaluationPairs: 1 } });
  const v1 = project.checkpoints[0], v1Hash = hashCanonical(v1), v1Packs = project.packs.map(p => ({ packId: p.packId, purpose: p.purpose, seeds: p.seeds }));
  const data = new Map(), input = { commandId: 'link-1', displayName: 'Linked V1 mind', checkpoint: v1, v1Context: { experimentId: project.experiment.experimentId, scientificId: project.experiment.scientificId, packs: v1Packs } };
  new MemoryBackend({ data });
  for (const fault of [2, 'quota']) {
    const before = dataDigest(data);
    const failing = new ProfileStore(new MemoryBackend({ data, onWrite: ({ index }) => { if (fault === 'quota' && index === 4) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); if (index === fault) throw new Error('INTERRUPTED'); } }), { identity, clock: FIXED_CLOCK });
    assert.equal(await code(() => failing.linkV1Checkpoint(input)), fault === 'quota' ? 'PROFILE_STORAGE_QUOTA_EXCEEDED' : 'INTERRUPTED');
    assert.equal(dataDigest(data), before, 'failed migration leaves no partial profile');
  }
  const store = new ProfileStore(new MemoryBackend({ data }), { identity, clock: FIXED_CLOCK }), linked = await store.linkV1Checkpoint(input);
  assert.equal(linked.head.championCheckpointId, v1.checkpointId);
  assert.equal(hashCanonical(await store.getCheckpoint(v1.checkpointId)), v1Hash, 'original bytes and ID unchanged');
  assert.equal(hashCanonical(project.checkpoints[0]), v1Hash, 'source V1 object untouched');
  assert.equal((await store.linkV1Checkpoint(input)).replayed, true, 'idempotent');
  const events = await store.listEvents(linked.agentProfileId);
  assert.equal(events[0].type, 'LINKED_FROM_V1'); assert.equal(events[0].evidenceStatus, 'V1_HISTORICAL_NOT_PROMOTION_EVIDENCE');
  const exposures = await store.listArtifacts(linked.agentProfileId, 'EXPOSURE_RECORD');
  assert.deepEqual(exposures.map(e => e.body.legacyPurpose).sort(), ['EVALUATION', 'TRAINING'], 'legacy purposes retained, not rewritten to PROMOTION_CHALLENGE');
  const challenge = await code(() => prepareChallenge({ store, agentProfileId: linked.agentProfileId, nominationId: 'NOM-missing', commandId: 'x' }));
  assert.equal(challenge, 'ARTIFACT_NOT_FOUND');
});

test('transition IDs are predictable from the expected head so journals can be prepared before commit', () => {
  assert.equal(transitionIdFor('AP-1', 3, 'cmd'), transitionIdFor('AP-1', 3, 'cmd'));
  assert.notEqual(transitionIdFor('AP-1', 3, 'cmd'), transitionIdFor('AP-1', 4, 'cmd'));
  assert.ok(headToken({ agentProfileId: 'a', headVersion: 1, activeRevisionId: 'r', championCheckpointId: 'c', requiredEvaluationEraId: 'e', promotionPolicyId: 'p', lastTransitionId: 't' }));
});
