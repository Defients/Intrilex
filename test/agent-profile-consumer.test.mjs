import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '@intrilex/shared';
import { createSession, restoreSession, SessionState, buildSaveIntegrityPayload } from '../apps/lab-web/dist/play/play-controller.js';
import { LAB_IDENTITY } from '../apps/lab-web/dist/evolution/identity.mjs';
import { buildExperienceRecord } from '../packages/simulation-runtime/src/profile-science.mjs';
import { identity, memoryStore, createGraveMaw, fixtureSeries, fixtureChallenge, manuallyActivateFixtureDecision } from './fixtures/agent-profile-fixtures.mjs';

const code = async fn => { try { await fn(); } catch (error) { return error.reasonCode ?? error.code ?? error.message; } return 'NO_ERROR'; };
async function step(session, limit = 6000) {
  while (session.status !== SessionState.TERMINAL && session.status !== SessionState.ERROR && limit-- > 0) {
    if (session.status === SessionState.HUMAN_DECISION) {
      const s = session.getSnapshot();
      const r = await session.submitHumanAction({ sessionId: s.sessionId, stateRevision: s.decision.stateRevision, decisionFrameHash: s.decision.frameHash, actionId: s.decision.legalActions[0].actionId });
      assert.ok(r.accepted, r.message);
    } else if (session.status === SessionState.AI_DECISION) assert.ok((await session.stepAI()).stepped);
    if (limit % 40 === 0 && session.onCheckpoint) await session.onCheckpoint();
  }
}
async function profileWithPromotion() {
  const store = memoryStore(), created = await createGraveMaw(store), id = created.agentProfileId;
  const { nomination } = await fixtureSeries({ store, agentProfileId: id, commandId: 's' });
  const { decision } = await fixtureChallenge({ store, agentProfileId: id, nominationId: nomination.id, commandId: 'c' });
  return { store, id, decision };
}
const setupFor = snapshot => ({ profileId: snapshot.rulesProfileId, seed: 4242, humanPlayerId: 'P1', aiPolicyId: 'weighted-heuristic-v1', mode: 'ADVANCED_CORE', agentSnapshot: snapshot });

test('dist and Node agree on the implementation identity used to pin snapshots', () => {
  assert.equal(LAB_IDENTITY.fingerprint, identity.fingerprint, 'rebuild dist after changing fingerprint-covered files');
});

test('normal local play executes the pinned Profile snapshot to a legal terminal state', async () => {
  const { store, id } = await profileWithPromotion(), snapshot = await store.resolveProfileHead(id);
  const session = await createSession(setupFor(snapshot));
  await step(session);
  assert.equal(session.status, SessionState.TERMINAL, session.error?.message);
  const ai = session.decisionJournal.filter(e => e.source === 'ai');
  assert.ok(ai.length > 0); assert.ok(ai.every(e => e.policyId === 'weighted-heuristic-v1'));
  const view = session.getSnapshot();
  assert.equal(view.opponent.displayName, 'GRAVE MAW');
  assert.equal(view.opponent.agentProfile.checkpointId, snapshot.checkpointId);
  assert.ok(session._policyActions.every(a => !('command' in a)), 'the agent view carries no commands');
  assert.doesNotMatch(JSON.stringify(view.opponent), /policyState|weights/, 'genome is not exposed in the UI snapshot');
});

test('a running match stays pinned when the Profile head moves; save/restore uses the save\'s own snapshot', async () => {
  const { store, id, decision } = await profileWithPromotion(), pinned = await store.resolveProfileHead(id);
  const session = await createSession(setupFor(pinned));
  for (let i = 0; i < 30 && session.status !== SessionState.TERMINAL; i++) {
    if (session.status === SessionState.AI_DECISION) await session.stepAI();
    else { const s = session.getSnapshot(); await session.submitHumanAction({ sessionId: s.sessionId, stateRevision: s.decision.stateRevision, decisionFrameHash: s.decision.frameHash, actionId: s.decision.legalActions[0].actionId }); }
  }
  await manuallyActivateFixtureDecision({ store, agentProfileId: id, decisionId: decision.id, commandId: 'promote-mid-match' });
  const moved = await store.resolveProfileHead(id);
  assert.notEqual(moved.checkpointId, pinned.checkpointId, 'head moved');
  assert.equal(session._agent.checkpointId, pinned.checkpointId, 'running policy unchanged');
  const save = session.getSaveEnvelope();
  assert.equal(save.setup.agentSnapshot.snapshotDigest, pinned.snapshotDigest);
  assert.equal(save.setup.aiConfigHash, hashCanonical({ policyId: 'weighted-heuristic-v1', snapshotDigest: pinned.snapshotDigest }));
  const restored = await restoreSession(structuredClone(save));
  assert.equal(restored._agent.checkpointId, pinned.checkpointId, 'restore does not follow the moved head');
  await step(restored);
  assert.equal(restored.status, SessionState.TERMINAL, restored.error?.message);
});

test('tampered or non-executable snapshots fail closed; there is no fallback policy', async () => {
  const { store, id } = await profileWithPromotion(), snapshot = await store.resolveProfileHead(id);
  const forged = structuredClone(snapshot); forged.policyState.weights.points = 2000;
  assert.equal(await code(() => createSession(setupFor(forged))), 'SNAPSHOT_DIGEST_MISMATCH');
  assert.equal(await code(() => createSession({ ...setupFor(snapshot), aiPolicyId: 'control' })), 'AGENT_POLICY_MISMATCH');
  assert.equal(await code(() => createSession({ ...setupFor(snapshot), profileId: 'core-unrestricted-authority' })), 'AGENT_RULES_PROFILE_MISMATCH');
  const session = await createSession(setupFor(snapshot)), save = session.getSaveEnvelope();
  const tampered = structuredClone(save); tampered.setup.agentSnapshot.policyState.weights.risk = -2000; tampered.contentHash = buildSaveIntegrityPayload(tampered);
  assert.equal(await code(() => restoreSession(tampered)), 'SNAPSHOT_DIGEST_MISMATCH', 'a re-hashed save still cannot swap the pinned genome');
});

test('catalog-policy matches keep their existing save shape and semantics', async () => {
  const session = await createSession({ profileId: 'core-advanced-authority', seed: 7, humanPlayerId: 'P1', aiPolicyId: 'control', mode: 'ADVANCED_CORE' });
  const save = session.getSaveEnvelope();
  assert.equal('agentSnapshot' in save.setup, false);
  assert.equal(save.setup.aiConfigHash, hashCanonical({ policyId: 'control' }));
  assert.equal('agentProfile' in session.getSnapshot().opponent, false);
});

test('ordinary play records observational Experience only; duplicate delivery is one encounter', async () => {
  const { store, id } = await profileWithPromotion(), snapshot = await store.resolveProfileHead(id), before = await store.profileView(id);
  const session = await createSession(setupFor(snapshot));
  await step(session);
  const view = session.getSnapshot();
  const record = buildExperienceRecord({ encounterId: session.sessionId, snapshot: session.setup.agentSnapshot, agentSeat: 'P2', rulesProfileId: session.setup.profileId,
    outcome: { winner: view.match.winner, terminationReason: view.match.terminationReason, fullTurns: view.match.fullTurnSequence }, observations: { agentDecisions: session.decisionJournal.filter(e => e.source === 'ai').length } });
  assert.equal(record.body.purpose, 'EXPERIENCE'); assert.equal(record.body.agent.checkpointId, snapshot.checkpointId); assert.equal(record.body.opponent.identity, 'NOT_RECORDED');
  await store.recordExperience(record); assert.equal((await store.recordExperience(record)).duplicate, true);
  const after = await store.profileView(id);
  assert.equal(hashCanonical(after.head), hashCanonical(before.head));
  assert.equal(after.events.length, before.events.length);
  assert.equal(after.artifacts.filter(a => a.kind === 'EXPERIENCE_RECORD').length, 1);
  assert.equal(after.artifacts.filter(a => ['PROFILE_REVISION', 'GENERATION_SELECTION', 'SERIES_MANIFEST'].includes(a.kind)).length, before.artifacts.filter(a => ['PROFILE_REVISION', 'GENERATION_SELECTION', 'SERIES_MANIFEST'].includes(a.kind)).length);
});
