// Agent Profile test fixtures. Every synthetic measurement carries
// `fixture: 'LABELED_FIXTURE_NOT_SIMULATION'` inside its immutable body, so
// fixture evidence can never be mistaken for real game results.
import { evolutionIdentity } from '../../scripts/evolution-identity.mjs';
import { ProfileStore, MemoryBackend } from '../../packages/simulation-runtime/src/profile-store.mjs';
import { makeArtifact } from '../../packages/simulation-runtime/src/profile-contracts.mjs';
import { startSeries, proposeCandidates, trainingManifest, selectGeneration, nominate, prepareChallenge, decideChallenge, opponentSeeds } from '../../packages/simulation-runtime/src/profile-science.mjs';

export const identity = await evolutionIdentity();
export const FIXED_CLOCK = () => '2026-10-04T00:00:00.000Z';
export function memoryStore({ data = new Map(), onWrite = null } = {}) {
  return new ProfileStore(new MemoryBackend({ data, onWrite }), { identity, clock: FIXED_CLOCK });
}
export async function createGraveMaw(store, commandId = 'create-grave-maw', extra = {}) {
  return store.createProfile({ commandId, displayName: 'GRAVE MAW', traits: { scoringDrive: 30, guard: 20 }, statement: 'Patient predator that converts known targets.', seriesDefaults: { generations: 1, candidates: 1, mutationStep: 250, trainingPairs: 1 }, ...extra });
}

/** score(policyId, blockIndex, seat) → 1 | 0.5 | 0 | null (null = non-clean game with `nonCleanReason`). */
export function fixtureMeasurement({ manifest, pack, era, score, decisions = 400, actionCounts = { score: 80, draw: 120, phase: 200 }, nonCleanReason = 'DECISION_LIMIT' }) {
  const subject = manifest.body.subjectCheckpointId;
  const matchups = era.body.referenceOpponents.map((o, k) => {
    const blocks = opponentSeeds(pack, k).map((seed, b) => ({ seed, ab: score(o.policyId, b, 'ab'), ba: score(o.policyId, b, 'ba') }));
    const games = blocks.length * 2, values = blocks.flatMap(x => [x.ab, x.ba]), clean = values.filter(v => v !== null).length;
    const pairs = blocks.filter(x => x.ab !== null && x.ba !== null), pairedScore = pairs.length ? pairs.reduce((s, x) => s + (x.ab + x.ba) / 2, 0) / pairs.length : null;
    const nonClean = blocks.flatMap((x, b) => [[x.ab, 2 * b], [x.ba, 2 * b + 1]]).filter(([v]) => v === null).map(([, ordinal]) => ({ ordinal, reason: nonCleanReason }));
    const rates = Object.fromEntries(Object.entries(actionCounts).map(([k, n]) => [k, n / decisions]));
    return { opponentPolicyId: o.policyId, opponentCheckpointId: o.checkpointId, status: 'COMPLETE', plannedGames: games,
      metrics: { games, clean, aborted: games - clean, unresolved: 0, pairCount: pairs.length, pairedScore, pairedScoreInterval95: null, firstPlayerWinRate: null, abortReasons: nonClean.length ? { [nonCleanReason]: nonClean.length } : {}, meanScoreDifference: null },
      behavior: { schemaVersion: 1, checkpointId: subject, games: clean, availableGames: clean, decisions, actionRates: rates, mechanicRates: {}, definition: 'LABELED_FIXTURE' },
      behaviorCounts: { decisions, actionCounts, mechanicCounts: {} }, blocks, nonClean, evidenceDigest: 'LABELED_FIXTURE' };
  });
  const weights = era.body.objective.weights, complete = matchups.every(m => m.metrics.pairedScore !== null);
  return makeArtifact('MEASUREMENT_RESULT', { manifestId: manifest.id, purpose: manifest.body.purpose, subjectCheckpointId: subject, packId: pack.id, eraId: era.id, status: 'COMPLETE', matchups,
    aggregate: { objectiveScore: complete ? matchups.reduce((s, m) => s + weights[m.opponentPolicyId] * m.metrics.pairedScore, 0) : null, weights }, fixture: 'LABELED_FIXTURE_NOT_SIMULATION' }, { scope: manifest.scope });
}

/** Runs the real proposal/selection/nomination code on labeled fixture TRAINING evidence. */
export async function fixtureSeries({ store, agentProfileId, commandId, winnerIndex = 1, generations = 1 }) {
  const series = await startSeries({ store, agentProfileId, commandId, overrides: { generations, candidates: 1, trainingPairs: 1 } });
  const pack = await store.getArtifact(series.body.trainingPackId), era = await store.getArtifact(series.body.eraId);
  let parent = await store.getCheckpoint(series.body.sourceCheckpointId);
  const selections = [];
  for (let g = 1; g <= generations; g++) {
    const candidates = [parent, ...proposeCandidates({ series, parent, generationIndex: g, identity, createdAt: FIXED_CLOCK() })];
    const manifests = candidates.map(cp => trainingManifest({ series, pack, era, subjectCheckpointId: cp.checkpointId }));
    const measurements = manifests.map((manifest, i) => fixtureMeasurement({ manifest, pack, era, score: () => i === winnerIndex ? 1 : 0.5 }));
    const selection = selectGeneration({ series, pack, era, generationIndex: g, candidates, measurements });
    await store.storeArtifacts({ artifacts: [...manifests, ...measurements, selection], checkpoints: candidates });
    selections.push(selection);
    parent = await store.getCheckpoint(selection.body.selectedCheckpointId);
  }
  const nomination = nominate({ series, selections });
  if (nomination) await store.storeArtifacts({ artifacts: [nomination] });
  return { series, selections, nomination, pack, era };
}

export const PATTERNS = {
  // Challenger clearly better, with block-to-block variation.
  approve: { challenger: (_o, b, seat) => seat === 'ab' ? 1 : b % 3 === 0 ? 0.5 : 1, incumbent: (_o, b, seat) => seat === 'ab' ? (b % 2 ? 0.5 : 0) : 0 },
  // Identical outcomes: no improvement.
  tie: { challenger: (_o, b, seat) => (b + (seat === 'ab' ? 0 : 1)) % 2, incumbent: (_o, b, seat) => (b + (seat === 'ab' ? 0 : 1)) % 2 },
  // Small noisy edge: not enough evidence either way.
  noisy: { challenger: (_o, b, seat) => seat === 'ab' ? (b % 2) : (b % 4 === 0 ? 1 : b % 3 === 0 ? 0.5 : 0), incumbent: (_o, b, seat) => seat === 'ab' ? (b % 2 ? 0 : 1) : (b % 5 === 0 ? 1 : 0) },
  // Better overall but collapses against control.
  regression: { challenger: (o, _b, seat) => o === 'control' ? 0 : seat === 'ab' ? 1 : 1, incumbent: (o, b) => o === 'control' ? 1 : b % 2 ? 0.5 : 0 },
  // Challenger has a non-clean (policy-attributable) game.
  unreliable: { challenger: (_o, b, seat) => b === 3 && seat === 'ba' ? null : 1, incumbent: () => 0 },
  // Worker fault: infrastructure, not a game outcome.
  fault: { challenger: (_o, b, seat) => b === 5 && seat === 'ab' ? null : 1, incumbent: () => 0, reason: 'WORKER_FAULT' },
};
export async function fixtureChallenge({ store, agentProfileId, nominationId, commandId, pattern = 'approve', challengerActions, challengerDecisions }) {
  const manifest = await prepareChallenge({ store, agentProfileId, nominationId, commandId });
  const pack = await store.getArtifact(manifest.body.packId), era = await store.getArtifact(manifest.body.eraId), policy = await store.getArtifact(manifest.body.promotionPolicyId);
  const cm = await store.getArtifact(manifest.body.measurementManifestIds.challenger), im = await store.getArtifact(manifest.body.measurementManifestIds.incumbent);
  const p = PATTERNS[pattern];
  const challengerMeasurement = fixtureMeasurement({ manifest: cm, pack, era, score: p.challenger, nonCleanReason: p.reason ?? 'DECISION_LIMIT', ...(challengerActions ? { actionCounts: challengerActions } : {}), ...(challengerDecisions ? { decisions: challengerDecisions } : {}) });
  const incumbentMeasurement = fixtureMeasurement({ manifest: im, pack, era, score: p.incumbent });
  const decision = decideChallenge({ manifest, policy, challengerMeasurement, incumbentMeasurement, challengerManifest: cm, incumbentManifest: im });
  await store.storeArtifacts({ artifacts: [challengerMeasurement, incumbentMeasurement, decision] });
  return { manifest, decision, challengerMeasurement, incumbentMeasurement, cm, im, pack, era, policy };
}
/** Explicit manual activation for transaction/snapshot tests during Wave 0.
 * This never impersonates automatic promotion or bypasses store authority. */
export async function manuallyActivateFixtureDecision({ store, agentProfileId, decisionId, commandId }) {
  const decision = await store.getArtifact(decisionId);
  const manifest = await store.getArtifact(decision.body.challengeId);
  return store.manualActivate({ commandId, agentProfileId, expectedHead: manifest.body.expectedHead,
    checkpointId: manifest.body.challengerCheckpointId, reason: 'Explicit fixture manual activation; no automatic approval claimed.', recommendationDecisionId: decisionId });
}
