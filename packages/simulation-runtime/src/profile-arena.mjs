import { hashCanonical } from '@intrilex/shared';
import { createLabRun, STATIC_POLICIES, validateCheckpoint } from './evolution-domain.mjs';
import { buildSnapshot, validateSnapshot } from './profile-store.mjs';

// UI references never become policy IDs. The engine receives existing policies
// and exact checkpoints; this consumer has no scientific write authority.
export const profileChoice = id => `agent-profile:${id}`;
export const profileChoiceId = value => value.startsWith('agent-profile:') ? value.slice(14) : null;
const CONTRACT = 'intrilex-profile-arena@1';
const reject = reason => { throw new Error(`ARENA_PROFILE_${reason}`); };

export async function createProfileArenaRun(input, identity, store, createdAt) {
  const cache = new Map();
  const participants = await Promise.all([input.botA, input.botB].map(async choice => {
    const id = profileChoiceId(choice);
    if (id === null) {
      if (!STATIC_POLICIES.includes(choice)) reject('CHOICE_NOT_ADMITTED');
      return null;
    }
    if (!id) reject('ID_MISSING');
    if (!cache.has(id)) cache.set(id, (async () => {
      const snapshot = await store.resolveProfileHead(id);
      const checkpoint = await store.getCheckpoint(snapshot.checkpointId);
      return { snapshot, checkpoint };
    })());
    return cache.get(id);
  }));
  const run = createLabRun({ ...input, botA: participants[0]?.snapshot.policyId ?? input.botA,
    botB: participants[1]?.snapshot.policyId ?? input.botB }, identity, createdAt);
  if (!participants.some(Boolean)) return run;
  run.arenaProfiles = { contract: CONTRACT, snapshots: participants.map(p => p?.snapshot ?? null) };
  participants.forEach((p, i) => { if (p) run.checkpoints[i] = structuredClone(p.checkpoint); });
  validateProfileArenaRun(run, identity);
  run.runId = `EL-${hashCanonical({ runId: run.runId, snapshots: run.arenaProfiles.snapshots }).slice(0, 24)}`;
  return run;
}

/** Validate saved authority without consulting today's Profile heads or store. */
export function validateProfileArenaRun(run, identity) {
  const metadata = run.arenaProfiles;
  if (!metadata) return run;
  if (metadata.contract !== CONTRACT || !Array.isArray(metadata.snapshots) || metadata.snapshots.length !== 2 || !metadata.snapshots.some(Boolean)) reject('CONTRACT');
  metadata.snapshots.forEach((snapshot, i) => {
    if (snapshot === null) return;
    validateSnapshot(snapshot);
    const profile = snapshot.profile;
    if (snapshot.kind !== 'PROFILE_HEAD' || !profile || typeof profile.agentProfileId !== 'string' || !profile.agentProfileId ||
        !Number.isSafeInteger(profile.headVersion) || profile.headVersion < 1 || typeof profile.activeRevisionId !== 'string' ||
        !profile.activeRevisionId || !/^[a-f0-9]{64}$/.test(profile.headTokenDigest)) reject('PROVENANCE');
    if (snapshot.rulesProfileId !== run.config.profileId) reject('RULES_MISMATCH');
    const checkpoint = run.checkpoints[i];
    validateCheckpoint(checkpoint, identity);
    const rebuilt = buildSnapshot({ checkpoint, identity, profile: { ...profile, displayName: snapshot.displayName }, rulesProfileId: run.config.profileId });
    if (rebuilt.snapshotDigest !== snapshot.snapshotDigest || checkpoint.policyId !== (i ? run.config.botB : run.config.botA)) reject('CHECKPOINT_MISMATCH');
  });
  return run;
}

export async function profileArenaRoster(store) {
  return Promise.all((await store.listProfiles()).map(async profile => {
    try {
      const snapshot = await store.resolveProfileHead(profile.agentProfileId);
      return { id: profile.agentProfileId, displayName: profile.displayName, snapshot, reason: null };
    } catch (error) {
      return { id: profile.agentProfileId, displayName: profile.displayName, snapshot: null, reason: error.message };
    }
  }));
}
