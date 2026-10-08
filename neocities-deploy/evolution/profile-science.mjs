import { hashCanonical } from '../shared-browser.js';
import { admitPairedEvidence } from './evidence-admission.mjs';
import { createTrainableCheckpoint, summarizeRecords, CLEAN_REASONS, labConfig } from './evolution-domain.mjs';
import { createBaselineSuite, behaviorFingerprint } from './evolution-research.mjs';
import { mutatePolicyState, selectCandidate } from './evolution-training.mjs';
import { WEIGHT_FEATURES } from './weighted-heuristic.mjs';
import {
  CONTRACTS, fail, deepFreeze, digest, makeArtifact, validateArtifact, headToken, requireContract, trainableParameters, validateSeriesDefaults,
  resolveEra, validatePolicyForObjective, canTrainOrResume, canExecuteCheckpoint, sameContent,
} from './profile-contracts.mjs';
import { buildJournal, identityMetric, parameterProvenance } from './profile-journal.mjs';
import { transitionIdFor } from './profile-store.mjs';

const uint32 = value => (Number.parseInt(digest(value).slice(0, 8), 16) >>> 0) || 1;

// ── Packs and exposure ─────────────────────────────────────────────────────
/** Fresh seeds from a named stream; any seed in `excluded` is skipped (and counted).
 * SHARED reuses one seed list for every opponent (V1 style); PER_OPPONENT gives
 * each opponent its own disjoint seeds so composite blocks are independent. */
export function createPack({ agentProfileId, purpose, rulesProfileId, pairCount, derivationKey, excluded = new Set(), layout = 'SHARED', opponentCount = 1 }) {
  if (!['TRAINING', 'HELD_OUT_EVALUATION', 'PROMOTION_CHALLENGE', 'DIAGNOSTIC'].includes(purpose)) fail('UNSUPPORTED_EVIDENCE_PURPOSE', purpose);
  if (!['SHARED', 'PER_OPPONENT'].includes(layout) || (layout === 'SHARED') !== (opponentCount === 1)) fail('INVALID_PACK_LAYOUT');
  const total = pairCount * opponentCount, seeds = [], seen = new Set();
  let skipped = 0;
  for (let index = 0; seeds.length < total; index++) {
    if (index > total * 50 + 1000) fail('PACK_SEED_SPACE_EXHAUSTED');
    const seed = uint32({ stream: 'PROFILE_PACK_V1', purpose, derivationKey, index });
    if (excluded.has(seed) || seen.has(seed)) { skipped++; continue; }
    seen.add(seed); seeds.push(seed);
  }
  for (let k = 0; k < opponentCount; k++) labConfig({ botA: 'control', botB: 'tempo', gameCount: pairCount * 2, seed: 1, profileId: rulesProfileId, kind: 'EVALUATION', seedCatalog: seeds.slice(k * pairCount, (k + 1) * pairCount) });
  return makeArtifact('EVIDENCE_PACK', { purpose, rulesProfileId, pairCount, layout, opponentCount, seeds, mirrorSeats: true, sampling: { method: 'PROFILE_PACK_V1', derivationKey, skippedForDisjointness: skipped } }, { scope: agentProfileId });
}
/** Seeds played against the k-th reference opponent. */
export const opponentSeeds = (pack, k) => pack.body.layout === 'PER_OPPONENT' ? pack.body.seeds.slice(k * pack.body.pairCount, (k + 1) * pack.body.pairCount) : pack.body.seeds;
const exposureRecord = (agentProfileId, pack, use) => makeArtifact('EXPOSURE_RECORD', { kind: 'PACK_USE', packId: pack.id, purpose: pack.body.purpose, use, seeds: pack.body.seeds }, { scope: agentProfileId });
/** Known exposures across the Profile and its local ancestry (forks, imports). */
export async function collectExposures(store, agentProfileId) {
  const scopes = [], seeds = new Set(), queue = [agentProfileId], records = [];
  while (queue.length) {
    const scope = queue.pop();
    if (scopes.includes(scope)) continue;
    scopes.push(scope);
    for (const a of await store.listArtifacts(scope)) {
      if (a.kind === 'EVIDENCE_PACK') for (const s of a.body.seeds) seeds.add(s);
      if (a.kind !== 'EXPOSURE_RECORD') continue;
      records.push(a.id);
      if (a.body.kind === 'ANCESTRY_LINK') queue.push(a.body.ancestorAgentProfileId);
      for (const s of a.body.seeds ?? []) seeds.add(s);
    }
  }
  return { scopes, seeds, records };
}

// ── Measurements ───────────────────────────────────────────────────────────
export function measurementManifest({ agentProfileId, purpose, producer, subjectCheckpointId, pack, era }) {
  if (pack.body.purpose !== purpose) fail('PACK_PURPOSE_MISMATCH', { pack: pack.body.purpose, purpose });
  return makeArtifact('MEASUREMENT_MANIFEST', { contract: { ...CONTRACTS.measurement }, purpose, producer, subjectCheckpointId, packId: pack.id, eraId: era.id,
    opponents: era.body.referenceOpponents.map(o => o.checkpointId), rulesProfileId: era.body.rulesProfileId, limits: era.body.limits }, { scope: agentProfileId });
}
const points = (record, swapped) => record.winner === 'DRAW' ? 0.5 : ((record.winner === 'P1') !== swapped ? 1 : 0);
function matchupEvidence(run, subjectCheckpointId, opponent, seeds) {
  const records = [...run.records].sort((a, b) => a.ordinal - b.ordinal), byOrdinal = new Map(records.map(r => [r.ordinal, r]));
  const { meanGameDurationMs: _d, ...metrics } = summarizeRecords(records);
  const blocks = seeds.map((seed, p) => {
    const ab = byOrdinal.get(2 * p), ba = byOrdinal.get(2 * p + 1);
    const score = (r, swapped) => !r || r.seed !== seed || r.swapped !== swapped || !CLEAN_REASONS.includes(r.terminationReason) ? null : points(r, swapped);
    return { seed, ab: score(ab, false), ba: score(ba, true) };
  });
  const counts = { decisions: 0, actionCounts: {}, mechanicCounts: {} };
  for (const r of records) {
    if (!CLEAN_REASONS.includes(r.terminationReason)) continue;
    const seat = r.checkpointIds.indexOf(subjectCheckpointId), b = r.seatBehavior?.[seat];
    if (!b) continue;
    counts.decisions += b.decisions;
    for (const [k, n] of Object.entries(b.actionCounts)) counts.actionCounts[k] = (counts.actionCounts[k] ?? 0) + n;
    for (const [k, n] of Object.entries(b.mechanicCounts)) counts.mechanicCounts[k] = (counts.mechanicCounts[k] ?? 0) + n;
  }
  return { opponentPolicyId: opponent.policyId, opponentCheckpointId: opponent.checkpointId, status: run.status, plannedGames: seeds.length * 2, metrics,
    behavior: behaviorFingerprint(records, subjectCheckpointId), behaviorCounts: counts, blocks,
    nonClean: records.filter(r => !CLEAN_REASONS.includes(r.terminationReason)).map(r => ({ ordinal: r.ordinal, reason: r.terminationReason })),
    evidenceDigest: hashCanonical(records.map(r => r.resultHash)) };
}
/** One reusable runner; the manifest (not the caller) owns purpose. */
export async function runMeasurement({ manifest, subject, pack, era, identity, executeSeries, workerCount = 1, signal, onProgress = () => {}, onRun = async () => {} }) {
  if (manifest.body.subjectCheckpointId !== subject.checkpointId || manifest.body.packId !== pack.id || manifest.body.eraId !== era.id) fail('MEASUREMENT_INPUT_MISMATCH');
  const exec = canExecuteCheckpoint(subject, identity);
  if (!exec.ok) fail('SUBJECT_NOT_EXECUTABLE', exec.reasons);
  const suite = createBaselineSuite(identity);
  if (digest(suite.checkpoints.map(cp => cp.checkpointId)) !== digest(era.body.referenceOpponents.map(o => o.checkpointId))) fail('ERA_SUITE_MISMATCH');
  if (pack.body.layout === 'PER_OPPONENT' && pack.body.opponentCount !== suite.checkpoints.length) fail('PACK_LAYOUT_MISMATCH');
  const matchups = [];
  for (const [k, opponent] of suite.checkpoints.entries()) {
    if (signal?.aborted) break;
    const seeds = opponentSeeds(pack, k);
    const result = await executeSeries({ botA: subject.policyId, botB: opponent.policyId, profileId: pack.body.rulesProfileId, gameCount: seeds.length * 2, seed: 1, seedCatalog: seeds, mirrorSeats: true, kind: 'EVALUATION', workerCount },
      { identity, startingCheckpoints: [subject, opponent], signal, onProgress: p => onProgress({ ...p, purpose: manifest.body.purpose, opponent: opponent.policyId, checkpointId: subject.checkpointId }) });
    await onRun(result.run);
    matchups.push(matchupEvidence(result.run, subject.checkpointId, opponent, seeds));
    if (result.run.status !== 'COMPLETE') break;
  }
  const complete = matchups.length === suite.checkpoints.length && matchups.every(m => m.status === 'COMPLETE' && m.metrics.games === m.plannedGames);
  const weights = era.body.objective.weights, scores = matchups.map(m => m.metrics.pairedScore);
  const objectiveScore = complete && scores.every(s => s !== null) ? matchups.reduce((s, m) => s + weights[m.opponentPolicyId] * m.metrics.pairedScore, 0) : null;
  return makeArtifact('MEASUREMENT_RESULT', { manifestId: manifest.id, purpose: manifest.body.purpose, subjectCheckpointId: subject.checkpointId, packId: pack.id, eraId: era.id,
    status: complete ? 'COMPLETE' : signal?.aborted ? 'STOPPED' : 'ERROR', matchups, aggregate: { objectiveScore, weights } }, { scope: manifest.scope });
}
/** Admission contract: purpose, producer, subject, pack, era and completeness bound to an exact manifest. */
export function admitMeasurement(measurement, manifest, { purpose, subjectCheckpointId }) {
  validateArtifact(measurement); validateArtifact(manifest);
  const b = measurement.body;
  if (measurement.kind !== 'MEASUREMENT_RESULT' || manifest.kind !== 'MEASUREMENT_MANIFEST' || b.manifestId !== manifest.id) fail('FOREIGN_EVIDENCE', measurement.id);
  if (b.purpose !== purpose || manifest.body.purpose !== purpose) fail('FORGED_OR_WRONG_PURPOSE', { measured: b.purpose, manifest: manifest.body.purpose, required: purpose });
  if (b.subjectCheckpointId !== subjectCheckpointId || manifest.body.subjectCheckpointId !== subjectCheckpointId) fail('WRONG_SUBJECT', measurement.id);
  if (b.packId !== manifest.body.packId || b.eraId !== manifest.body.eraId) fail('EVIDENCE_MANIFEST_MISMATCH', measurement.id);
  if (digest(b.matchups.map(m => m.opponentCheckpointId)) !== digest(manifest.body.opponents.slice(0, b.matchups.length))) fail('EVIDENCE_OPPONENT_MISMATCH', measurement.id);
  for (const m of b.matchups) {
    if (m.status === 'COMPLETE' && (m.metrics.games !== m.plannedGames || m.blocks.length * 2 !== m.plannedGames)) fail('INCOMPLETE_BLOCKS', measurement.id);
  }
  admitPairedEvidence(measurement,manifest);
  return measurement;
}

// ── Training Series ────────────────────────────────────────────────────────
export function buildSeriesManifest({ view, identity, commandId, overrides = {}, exposures = new Set() }) {
  const head = view.head, revision = view.artifacts.find(a => a.id === head.activeRevisionId), objective = view.artifacts.find(a => a.id === revision.body.objectiveInstanceId);
  const source = view.checkpoints.find(cp => cp.checkpointId === head.championCheckpointId);
  const era = resolveEra({ identity, objective });
  if (era.id !== head.requiredEvaluationEraId) fail('REQUIRED_ERA_NOT_CURRENT', 'Change the required Evaluation Era before training under this implementation.');
  const check = canTrainOrResume({ checkpoint: source }, identity);
  if (!check.ok) fail('SOURCE_NOT_TRAINABLE', check.reasons);
  const trainable = trainableParameters(revision.body.mutationConstraints);
  if (!trainable.length) fail('NO_TRAINABLE_DIMENSIONS', 'Every parameter is fixed by the active revision.');
  if (new Set(Object.values(objective.body.aggregation.weights)).size !== 1) fail('UNSUPPORTED_OBJECTIVE_WEIGHTS', 'V1 selection uses equal weights.');
  const { evolutionSeed: seedOverride, ...budget } = overrides;
  const config = validateSeriesDefaults({ ...revision.body.defaults.series, ...budget });
  const evolutionSeed = seedOverride ?? uint32({ stream: 'PROFILE_EVOLUTION_SEED_V1', commandId, agentProfileId: head.agentProfileId });
  const pack = createPack({ agentProfileId: head.agentProfileId, purpose: 'TRAINING', rulesProfileId: objective.body.rulesProfileId, pairCount: config.trainingPairs, derivationKey: { commandId, kind: 'SERIES_TRAINING' }, excluded: exposures });
  const manifest = makeArtifact('SERIES_MANIFEST', { agentProfileId: head.agentProfileId, seriesNonce: commandId, headToken: headToken(head), sourceCheckpointId: source.checkpointId, revisionId: revision.id,
    objectiveInstanceId: objective.id, objectiveDefinition: { id: objective.body.definitionId, version: objective.body.definitionVersion }, eraId: era.id, implementation: { fingerprint: identity.fingerprint },
    policy: { policyId: source.policyId, policyVersion: source.policyVersion, genomeDefinition: { ...CONTRACTS.genome } },
    optimizer: { ...CONTRACTS.optimizer, config: { generations: config.generations, candidates: config.candidates, mutationStep: config.mutationStep, evolutionSeed }, constraintProjection: { ...CONTRACTS.constraintProjection }, mutationConstraints: revision.body.mutationConstraints, trainableParameters: trainable },
    trainingPackId: pack.id, opponents: era.body.referenceOpponents, rulesProfileId: objective.body.rulesProfileId, limits: era.body.limits,
    selectionRule: { ...CONTRACTS.selectionRule, tieBreak: 'PARENT_FIRST_THEN_LOWER_CANDIDATE_INDEX', disqualification: 'ANY_NONCLEAN_GAME_OR_IDENTITY_CONSTRAINT' },
    nominationRule: { ...CONTRACTS.nominationRule, note: 'Final committed TRAINING selection at the frozen generation budget; a retained source nominates nothing.' },
    identityConstraints: revision.body.identityConstraints }, { scope: head.agentProfileId });
  return { manifest, pack, era, exposure: exposureRecord(head.agentProfileId, pack, 'SELECTION') };
}
export const trainingManifest = ({ series, pack, era, subjectCheckpointId }) =>
  measurementManifest({ agentProfileId: series.scope, purpose: 'TRAINING', producer: { kind: 'SERIES_TRAINING', seriesId: series.id }, subjectCheckpointId, pack, era });

/** ONE_PLUS_LAMBDA_V1 proposal with FIXED_REJECTION_THEN_CLAMP_V1 projection.
 * Unconstrained revisions reproduce the V1 operator exactly. */
export function proposeCandidates({ series, parent, generationIndex, identity, createdAt }) {
  const { config, mutationConstraints } = series.body.optimizer, out = [];
  for (let candidateIndex = 0; candidateIndex < config.candidates; candidateIndex++) {
    let seed = null, attempts = 0;
    for (let attempt = 0; attempt < 64 && seed === null; attempt++) {
      attempts = attempt + 1;
      const s = Number.parseInt(digest({ stream: 'PROFILE_SERIES_MUTATION_V1', seriesId: series.id, evolutionSeed: config.evolutionSeed, generationIndex, candidateIndex, attempt }).slice(0, 8), 16) >>> 0;
      if (mutationConstraints[WEIGHT_FEATURES[s % WEIGHT_FEATURES.length]]?.mode !== 'FIXED') seed = s;
    }
    if (seed === null) fail('NO_TRAINABLE_DIMENSIONS');
    const mutation = mutatePolicyState(parent.policyState, seed, config.mutationStep), rule = mutationConstraints[mutation.metadata.parameter];
    const after = rule?.mode === 'BOUNDED' ? Math.max(rule.min, Math.min(rule.max, mutation.metadata.after)) : mutation.metadata.after;
    mutation.state.weights[mutation.metadata.parameter] = after;
    out.push(createTrainableCheckpoint({ identity, agentId: `AP:${series.scope}`, lineageId: parent.lineageId, parent, policyState: mutation.state, trainingConfiguration: { seriesId: series.id, optimizer: { id: series.body.optimizer.id, version: series.body.optimizer.version } },
      mutation: { kind: 'PROFILE_OPTIMIZER_MUTATION_V1', optimizer: { id: series.body.optimizer.id, version: series.body.optimizer.version }, operator: { ...mutation.metadata, unprojectedAfter: mutation.metadata.after, after, delta: after - mutation.metadata.before },
        projection: { ...CONTRACTS.constraintProjection, attempts, clamped: after !== mutation.metadata.after }, seriesId: series.id, generationIndex, candidateIndex }, experimentId: series.id, createdAt }));
  }
  return out;
}

/** Selection consumes TRAINING evidence only; there is no parameter through
 * which held-out or challenge measurements could enter (I2/I3). */
export function selectGeneration({ series, pack, era, generationIndex, candidates, measurements }) {
  if (candidates.length !== measurements.length || candidates[0]?.checkpointId === undefined) fail('SELECTION_INPUT_MISMATCH');
  const rows = [], identityDisqualified = [];
  candidates.forEach((cp, index) => {
    const manifest = trainingManifest({ series, pack, era, subjectCheckpointId: cp.checkpointId });
    const m = admitMeasurement(measurements[index], manifest, { purpose: 'TRAINING', subjectCheckpointId: cp.checkpointId });
    const failed = series.body.identityConstraints.map(c => ({ c, r: identityMetric(m, c) })).find(({ r }) => !r.available || !r.withinBounds);
    if (failed) { identityDisqualified.push({ checkpointId: cp.checkpointId, reason: failed.r.available ? 'IDENTITY_CONSTRAINT_VIOLATED' : 'IDENTITY_METRIC_UNAVAILABLE', constraint: failed.c, observed: failed.r }); return; }
    rows.push({ index, checkpointId: cp.checkpointId, result: { purpose: 'TRAINING', status: m.body.status, matchups: m.body.matchups.map(x => ({ metrics: x.metrics })) } });
  });
  let decision = null;
  try { decision = selectCandidate(rows); } catch (error) { if (error.message !== 'NO_TRUSTWORTHY_SELECTION_CANDIDATE') throw error; }
  const selectedIndex = decision?.selected.index ?? null;
  return makeArtifact('GENERATION_SELECTION', { seriesId: series.id, generationIndex, parentCheckpointId: candidates[0].checkpointId,
    candidates: candidates.map((cp, index) => ({ index, checkpointId: cp.checkpointId, role: index === 0 ? 'PARENT' : 'MUTANT', mutation: index === 0 ? null : cp.mutation.operator, measurementId: measurements[index].id })),
    ranking: decision?.ranking ?? [], disqualified: [...(decision ? decision.disqualified : rows.map(r => ({ checkpointId: r.checkpointId, reason: 'INCOMPLETE_OR_FAILED_SELECTION_EVIDENCE' }))), ...identityDisqualified],
    outcome: selectedIndex === null ? 'NO_ELIGIBLE_CANDIDATE' : selectedIndex === 0 ? 'RETAINED_PARENT' : 'SELECTED_CHILD',
    selectedCheckpointId: selectedIndex === null ? null : candidates[selectedIndex].checkpointId, rule: series.body.selectionRule }, { scope: series.scope });
}
/** Nomination reads only committed selections; held-out results cannot reach it. */
export function nominate({ series, selections }) {
  const ordered = [...selections].sort((a, b) => a.body.generationIndex - b.body.generationIndex);
  const budget = series.body.optimizer.config.generations;
  if (ordered.length !== budget || ordered.some((s, i) => s.body.generationIndex !== i + 1) || ordered.some(s => s.body.outcome === 'NO_ELIGIBLE_CANDIDATE')) return null;
  const final = ordered.at(-1);
  if (final.body.selectedCheckpointId === series.body.sourceCheckpointId) return null;
  return makeArtifact('CHALLENGER_NOMINATION', { seriesId: series.id, checkpointId: final.body.selectedCheckpointId, rule: series.body.nominationRule, sourceSelectionId: final.id, sourceHeadToken: series.body.headToken,
    selectionPath: ordered.map(s => ({ generationIndex: s.body.generationIndex, outcome: s.body.outcome, selectedCheckpointId: s.body.selectedCheckpointId })) }, { scope: series.scope });
}

async function cachedMeasurement(store, scope, manifestId) {
  return (await store.listArtifacts(scope, 'MEASUREMENT_RESULT')).filter(m => m.body.manifestId === manifestId && m.body.status === 'COMPLETE').at(-1) ?? null;
}
async function measureFenced({ store, lease, manifest, subject, pack, era, identity, executeSeries, workerCount, signal, onProgress, retainTraces }) {
  const cached = await cachedMeasurement(store, manifest.scope, manifest.id);
  if (cached) return cached;
  const result = await runMeasurement({ manifest, subject, pack, era, identity, executeSeries, workerCount, signal, onProgress,
    onRun: async run => { if (retainTraces) await store.putTrace({ traceId: run.runId, scope: manifest.scope, payload: { measurementManifestId: manifest.id, run } }); } });
  // Partial measurements are retained as history; only the fenced owner may append.
  await store.commitOperation(lease, { artifacts: [manifest, result], checkpoints: [subject] });
  return result;
}

export async function startSeries({ store, agentProfileId, commandId, overrides = {} }) {
  const view = await store.profileView(agentProfileId), exposures = await collectExposures(store, agentProfileId);
  const { manifest, pack, exposure } = buildSeriesManifest({ view, identity: store.identity, commandId, overrides, exposures: exposures.seeds });
  await store.storeArtifacts({ artifacts: [pack, manifest, exposure] });
  return manifest;
}
/** Fenced, resumable execution of an exact Series manifest. */
export async function runSeries({ store, seriesId, executeSeries, workerCount = 1, signal, onProgress = () => {}, retainTraces = false, createdAt = new Date().toISOString() }) {
  const identity = store.identity, series = await store.getArtifact(seriesId);
  if (series?.kind !== 'SERIES_MANIFEST') fail('ARTIFACT_NOT_FOUND', seriesId);
  const scope = series.scope, pack = await store.getArtifact(series.body.trainingPackId), source = await store.getCheckpoint(series.body.sourceCheckpointId);
  const objective = await store.getArtifact(series.body.objectiveInstanceId), era = resolveEra({ identity, objective });
  const resume = canTrainOrResume({ checkpoint: source, manifest: { implementation: series.body.implementation, optimizer: series.body.optimizer } }, identity);
  if (!resume.ok || era.id !== series.body.eraId) fail('SERIES_NOT_RESUMABLE', resume.reasons.length ? resume.reasons : ['ERA_CHANGED']);
  const lease = await store.claimOperation({ operationId: seriesId, scope, kind: 'SERIES', manifestId: seriesId });
  const selections = (await store.listArtifacts(scope, 'GENERATION_SELECTION')).filter(s => s.body.seriesId === seriesId).sort((a, b) => a.body.generationIndex - b.body.generationIndex);
  let parent = selections.length ? await store.getCheckpoint(selections.at(-1).body.selectedCheckpointId) : source;
  if (selections.at(-1)?.body.outcome === 'NO_ELIGIBLE_CANDIDATE') parent = null;
  const budget = series.body.optimizer.config.generations;
  for (let g = selections.length + 1; parent && g <= budget && !signal?.aborted; g++) {
    const candidates = [parent, ...proposeCandidates({ series, parent, generationIndex: g, identity, createdAt })], measurements = [];
    for (const [index, cp] of candidates.entries()) {
      onProgress({ stage: 'TRAINING', generationIndex: g, candidateIndex: index, checkpointId: cp.checkpointId });
      const m = await measureFenced({ store, lease, manifest: trainingManifest({ series, pack, era, subjectCheckpointId: cp.checkpointId }), subject: cp, pack, era, identity, executeSeries, workerCount, signal, onProgress, retainTraces });
      if (m.body.status !== 'COMPLETE') { if (signal?.aborted) break; }
      measurements.push(m);
    }
    if (signal?.aborted || measurements.length !== candidates.length) break;
    const selection = selectGeneration({ series, pack, era, generationIndex: g, candidates, measurements });
    await store.commitOperation(lease, { artifacts: [selection], progress: { committedGenerations: g } });
    selections.push(selection);
    onProgress({ stage: 'SELECTION_COMMITTED', generationIndex: g, outcome: selection.body.outcome, selectedCheckpointId: selection.body.selectedCheckpointId });
    parent = selection.body.selectedCheckpointId ? await store.getCheckpoint(selection.body.selectedCheckpointId) : null;
  }
  if (signal?.aborted) { await store.commitOperation(lease, { progress: { pausedAt: selections.length } }); return { status: 'PAUSED', seriesId, selections }; }
  const finished = selections.length === budget || selections.at(-1)?.body.outcome === 'NO_ELIGIBLE_CANDIDATE';
  if (!finished) { await store.commitOperation(lease, { status: 'FAILED' }); return { status: 'FAILED', seriesId, selections }; }
  const nomination = nominate({ series, selections });
  const outcome = makeArtifact('SERIES_OUTCOME', { seriesId, status: selections.at(-1).body.outcome === 'NO_ELIGIBLE_CANDIDATE' ? 'STOPPED_NO_ELIGIBLE_CANDIDATE' : 'COMPLETED', generationsCommitted: selections.length,
    finalSelectedCheckpointId: selections.at(-1).body.selectedCheckpointId, nominationId: nomination?.id ?? null,
    noChangeReason: nomination ? null : selections.at(-1).body.outcome === 'NO_ELIGIBLE_CANDIDATE' ? 'NO_ELIGIBLE_CANDIDATE' : 'SOURCE_RETAINED_AT_BUDGET' }, { scope });
  await store.commitOperation(lease, { artifacts: [...(nomination ? [nomination] : []), outcome], status: 'COMPLETED' });
  return { status: outcome.body.status, seriesId, selections, nomination, outcome };
}
/** Cancellation keeps accepted evidence and committed selections; it never nominates. */
export async function cancelSeries({ store, seriesId }) {
  const series = await store.getArtifact(seriesId);
  const status = await store.cancelOperation(seriesId);
  const selections = (await store.listArtifacts(series.scope, 'GENERATION_SELECTION')).filter(s => s.body.seriesId === seriesId);
  const outcome = makeArtifact('SERIES_OUTCOME', { seriesId, status: 'CANCELLED', generationsCommitted: selections.length, finalSelectedCheckpointId: null, nominationId: null, noChangeReason: 'CANCELLED_BEFORE_BUDGET' }, { scope: series.scope });
  if (status === 'CANCELLED') await store.storeArtifacts({ artifacts: [outcome] });
  return status;
}

// ── Held-out evaluation ────────────────────────────────────────────────────
/** Measurement only. Nothing here can write a selection, nomination or head. */
export async function prepareHeldOut({ store, agentProfileId, checkpointId, commandId, pairs = null }) {
  const view = await store.profileView(agentProfileId), revision = view.artifacts.find(a => a.id === view.head.activeRevisionId);
  const objective = view.artifacts.find(a => a.id === revision.body.objectiveInstanceId), era = resolveEra({ identity: store.identity, objective });
  const exposures = await collectExposures(store, agentProfileId);
  const pack = createPack({ agentProfileId, purpose: 'HELD_OUT_EVALUATION', rulesProfileId: objective.body.rulesProfileId, pairCount: pairs ?? revision.body.defaults.heldOutPairs, derivationKey: { commandId, kind: 'HELD_OUT' }, excluded: exposures.seeds });
  const manifest = measurementManifest({ agentProfileId, purpose: 'HELD_OUT_EVALUATION', producer: { kind: 'HELD_OUT', requestId: commandId }, subjectCheckpointId: checkpointId, pack, era });
  await store.storeArtifacts({ artifacts: [era, pack, manifest, exposureRecord(agentProfileId, pack, 'MEASUREMENT_RELEASED')] });
  return manifest;
}
export async function runPlannedMeasurement({ store, manifestId, executeSeries, workerCount = 1, signal, onProgress, retainTraces = false }) {
  const manifest = await store.getArtifact(manifestId), pack = await store.getArtifact(manifest.body.packId), era = await store.getArtifact(manifest.body.eraId);
  const subject = await store.getCheckpoint(manifest.body.subjectCheckpointId);
  const lease = await store.claimOperation({ operationId: manifestId, scope: manifest.scope, kind: manifest.body.purpose, manifestId });
  const result = await measureFenced({ store, lease, manifest, subject, pack, era, identity: store.identity, executeSeries, workerCount, signal, onProgress, retainTraces });
  if (result.body.status === 'COMPLETE') await store.commitOperation(lease, { status: 'COMPLETED' });
  return result;
}

// ── Promotion challenge ────────────────────────────────────────────────────
export const attemptKey = ({ challengerCheckpointId, incumbentCheckpointId, objectiveInstanceId, eraId, policyDigest = null }) => digest({ challengerCheckpointId, incumbentCheckpointId, objectiveInstanceId, eraId, policyDigest });
export async function prepareChallenge({ store, agentProfileId, nominationId, commandId }) {
  return store.reserveChallenge({ commandId, agentProfileId, nominationId, build: view => {
  const head = view.head;
  const nomination = view.artifacts.find(a => a.id === nominationId && a.scope === agentProfileId && a.kind === 'CHALLENGER_NOMINATION');
  if (!nomination) fail('ARTIFACT_NOT_FOUND', nominationId);
  if (nomination.body.checkpointId === head.championCheckpointId) fail('CHALLENGER_IS_INCUMBENT');
  const revision = view.artifacts.find(a => a.id === head.activeRevisionId), objective = view.artifacts.find(a => a.id === revision.body.objectiveInstanceId);
  const policy = view.artifacts.find(a => a.id === head.promotionPolicyId), era = resolveEra({ identity: store.identity, objective });
  validatePolicyForObjective(policy.body, objective.body);
  if (era.id !== head.requiredEvaluationEraId) fail('REQUIRED_ERA_NOT_CURRENT');
  const challenger = view.checkpoints.find(cp => cp.checkpointId === nomination.body.checkpointId);
  for (const cp of [challenger, view.checkpoints.find(c => c.checkpointId === head.championCheckpointId)]) { const v = canExecuteCheckpoint(cp, store.identity); if (!v.ok) fail('SUBJECT_NOT_EXECUTABLE', v.reasons); }
  const key = attemptKey({ challengerCheckpointId: challenger.checkpointId, incumbentCheckpointId: head.championCheckpointId, objectiveInstanceId: objective.id, eraId: era.id, policyDigest: policy.digest });
  const prior = view.artifacts.filter(a => a.scope === agentProfileId && a.kind === 'CHALLENGE_MANIFEST' && a.body.attempt.key === key).map(a => a.id).sort();
  const scopes = [], seeds = new Set(), queue = [agentProfileId];
  while (queue.length) {
    const scope = queue.pop(); if (scopes.includes(scope)) continue; scopes.push(scope);
    for (const a of view.artifacts.filter(a => a.scope === scope)) {
      if (a.kind === 'EVIDENCE_PACK' || a.kind === 'EXPOSURE_RECORD') for (const seed of a.body.seeds ?? []) seeds.add(seed);
      if (a.kind === 'EXPOSURE_RECORD' && a.body.kind === 'ANCESTRY_LINK') queue.push(a.body.ancestorAgentProfileId);
    }
  }
  const exposures = { scopes, seeds };
  const pack = createPack({ agentProfileId, purpose: 'PROMOTION_CHALLENGE', rulesProfileId: objective.body.rulesProfileId, pairCount: policy.body.budget.blocks, derivationKey: { commandId, key, kind: 'CHALLENGE' }, excluded: exposures.seeds,
    layout: 'PER_OPPONENT', opponentCount: era.body.referenceOpponents.length });
  const imported = view.profile.origin !== 'LOCAL' || exposures.scopes.length > 1;
  const manifests = Object.fromEntries(['challenger', 'incumbent'].map(role => [role, measurementManifest({ agentProfileId, purpose: 'PROMOTION_CHALLENGE', producer: { kind: 'CHALLENGE', challengeNonce: commandId, role },
    subjectCheckpointId: role === 'challenger' ? challenger.checkpointId : head.championCheckpointId, pack, era })]));
  const manifest = makeArtifact('CHALLENGE_MANIFEST', { agentProfileId, nominationId, seriesId: nomination.body.seriesId, challengerCheckpointId: challenger.checkpointId, incumbentCheckpointId: head.championCheckpointId,
    expectedHead: headToken(head), revisionId: head.activeRevisionId, objectiveInstanceId: objective.id, objectiveDefinition: { id: objective.body.definitionId, version: objective.body.definitionVersion },
    promotionPolicyId: policy.id, policyDigest: policy.digest, eraId: era.id, packId: pack.id, opponents: era.body.referenceOpponents, plannedBlocks: policy.body.budget.blocks,
    plannedGames: policy.body.budget.blocks * era.body.referenceOpponents.length * 2 * 2, measurementManifestIds: { challenger: manifests.challenger.id, incumbent: manifests.incumbent.id },
    outcomeCoding: era.body.outcome, aggregationWeights: objective.body.aggregation.weights, practicalThreshold: policy.body.practicalThreshold, regressionFloor: policy.body.regressionFloor, tailGuard: policy.body.tailGuard,
    identityConstraints: revision.body.identityConstraints, estimator: policy.body.estimator, rules: { reliability: policy.body.reliability, retries: policy.body.retries, stopping: policy.body.stopping, precedence: policy.body.precedence, tie: 'NO_APPROVAL_ON_TIE' },
    reservation: { contract: 'intrilex-challenge-reservation@1', commandId, consumedOn: 'RESERVATION_COMMIT' },
    attempt: { key, number: prior.length + 1, automaticEligible: prior.length === 0, priorAttemptIds: prior },
    exposureCheck: { disjointFromKnown: true, knownSeedCount: exposures.seeds.size, skippedForDisjointness: pack.body.sampling.skippedForDisjointness, ancestryScopes: exposures.scopes, unknownExternalExposure: imported ? 'NOT_RULED_OUT' : 'NONE_KNOWN' } }, { scope: agentProfileId });
  return { manifest, artifacts: [era, pack, manifests.challenger, manifests.incumbent, manifest, exposureRecord(agentProfileId, pack, 'PROMOTION_DECISION')] };
  } });
}
export async function runChallenge({ store, challengeId, executeSeries, workerCount = 1, signal, onProgress = () => {}, retainTraces = false }) {
  const manifest = await store.getArtifact(challengeId);
  if (manifest?.kind !== 'CHALLENGE_MANIFEST') fail('ARTIFACT_NOT_FOUND', challengeId);
  const existing = (await store.listArtifacts(manifest.scope, 'CHALLENGE_DECISION')).find(d => d.body.challengeId === challengeId);
  if (existing) return existing;
  const pack = await store.getArtifact(manifest.body.packId), era = await store.getArtifact(manifest.body.eraId), policy = await store.getArtifact(manifest.body.promotionPolicyId);
  const lease = await store.claimOperation({ operationId: challengeId, scope: manifest.scope, kind: 'CHALLENGE', manifestId: challengeId });
  const results = {};
  for (const role of ['incumbent', 'challenger']) {
    const mm = await store.getArtifact(manifest.body.measurementManifestIds[role]), subject = await store.getCheckpoint(mm.body.subjectCheckpointId);
    results[role] = await measureFenced({ store, lease, manifest: mm, subject, pack, era, identity: store.identity, executeSeries, workerCount, signal, onProgress: p => onProgress({ ...p, role }), retainTraces });
    if (signal?.aborted) return { status: 'PAUSED', challengeId };
  }
  const decision = decideChallenge({ manifest, policy, challengerMeasurement: results.challenger, incumbentMeasurement: results.incumbent, challengerManifest: await store.getArtifact(manifest.body.measurementManifestIds.challenger), incumbentManifest: await store.getArtifact(manifest.body.measurementManifestIds.incumbent) });
  await store.commitOperation(lease, { artifacts: [decision], status: 'COMPLETED' });
  return decision;
}

// ── Paired estimator (PAIRED_BLOCK_STUDENT_T v1) ───────────────────────────
function logGamma(x) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1; let a = 0.99999999999980993; const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betaContinuedFraction(a, b, x) {
  let c = 1, d = 1 - (a + b) * x / (a + 1); d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d); let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2)); d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d); c = 1 + aa / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1)); d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d); c = 1 + aa / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c;
    const delta = d * c; h *= delta; if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}
function regularizedBeta(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? front * betaContinuedFraction(a, b, x) / a : 1 - front * betaContinuedFraction(b, a, 1 - x) / b;
}
export function studentTCdf(t, df) { const p = 0.5 * regularizedBeta(df / 2, 0.5, df / (df + t * t)); return t >= 0 ? 1 - p : p; }
export function studentTQuantile(p, df) {
  if (!(p > 0.5 && p < 1) || !(df >= 1)) fail('INVALID_QUANTILE_REQUEST');
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (studentTCdf(mid, df) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** One-sided bounds on the mean block difference. Zero spread: bound = mean. */
export function pairedBlockAnalysis(differences, confidence = 0.95) {
  const n = differences.length;
  if (n < 2 || differences.some(d => !Number.isFinite(d))) return { blocks: n, mean: null, sd: null, se: null, df: null, tCritical: null, lower: null, upper: null, available: false };
  const mean = differences.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(differences.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1)), se = sd / Math.sqrt(n);
  const tCritical = studentTQuantile(confidence, n - 1), radius = se === 0 ? 0 : tCritical * se;
  return { blocks: n, mean, sd, se, df: n - 1, tCritical, lower: mean - radius, upper: mean + radius, available: true };
}

/** TAIL_BALANCE_V1 guard rail: decisive-loss units must not outnumber decisive-win units.
 * Added after simulation showed one-sided t coverage degrades under left-skewed nulls. */
export function tailBalance(units, swing) {
  const losses = units.filter(d => d <= -swing).length, wins = units.filter(d => d >= swing).length;
  return { swing, decisiveLossUnits: losses, decisiveWinUnits: wins, units: units.length, pass: losses <= wins };
}
/** FIXED_BUDGET_PAIRED_GENERALIST v1 decision rule. Precedence INVALID > REJECT > INCONCLUSIVE > APPROVE. */
export function decideChallenge({ manifest, policy, challengerMeasurement, incumbentMeasurement, challengerManifest, incumbentManifest }) {
  requireContract('promotionPolicy', policy.body.policyId, policy.body.policyVersion);
  if (policy.id !== manifest.body.promotionPolicyId) fail('POLICY_MANIFEST_MISMATCH');
  const m = manifest.body, invalid = [], reject = [], inconclusive = [], constraintResults = [];
  const admit = (measurement, mm, role) => {
    try {
      if (mm.id !== m.measurementManifestIds[role]) fail('FOREIGN_EVIDENCE');
      return admitMeasurement(measurement, mm, { purpose: 'PROMOTION_CHALLENGE', subjectCheckpointId: role === 'challenger' ? m.challengerCheckpointId : m.incumbentCheckpointId });
    } catch (error) { invalid.push(`${role.toUpperCase()}_${error.code ?? 'EVIDENCE_INVALID'}`); return null; }
  };
  const c = admit(challengerMeasurement, challengerManifest, 'challenger'), i = admit(incumbentMeasurement, incumbentManifest, 'incumbent');
  const opponents = m.opponents.map(o => o.checkpointId);
  for (const [role, x] of [['CHALLENGER', c], ['INCUMBENT', i]]) {
    if (!x) continue;
    if (x.body.status !== 'COMPLETE' || x.body.matchups.length !== opponents.length || x.body.matchups.some((mu, k) => mu.opponentCheckpointId !== opponents[k] || mu.plannedGames !== mu.metrics.games || mu.blocks.length !== m.plannedBlocks)) invalid.push(`${role}_INCOMPLETE_EVIDENCE`);
    const reasons = x.body.matchups.flatMap(mu => mu.nonClean.map(n => n.reason));
    if (reasons.includes('WORKER_FAULT')) invalid.push(`${role}_INFRASTRUCTURE_FAULT`);
    else if (reasons.length && role === 'INCUMBENT') invalid.push('INCUMBENT_UNRELIABLE');
    else if (reasons.length) reject.push('RELIABILITY_GATE_FAILED');
  }
  let perOpponent = [], statistics = { ...pairedBlockAnalysis([]), games: 0 };
  if (c && i && !invalid.length) {
    perOpponent = c.body.matchups.map((mu, k) => { const inc = i.body.matchups[k]; return { opponent: mu.opponentPolicyId, challenger: mu.metrics.pairedScore, incumbent: inc.metrics.pairedScore, delta: mu.metrics.pairedScore === null || inc.metrics.pairedScore === null ? null : mu.metrics.pairedScore - inc.metrics.pairedScore }; });
    for (const o of perOpponent) { const ok = o.delta !== null && o.delta >= -m.regressionFloor; constraintResults.push({ constraint: 'REGRESSION_FLOOR', opponent: o.opponent, floor: m.regressionFloor, delta: o.delta, pass: ok }); if (!ok) reject.push(`REGRESSION_FLOOR:${o.opponent}`); }
    for (const constraint of m.identityConstraints) {
      const r = identityMetric(c, constraint);
      constraintResults.push({ constraint: 'IDENTITY', metric: constraint, observed: r, pass: r.available && r.withinBounds });
      if (!r.available) inconclusive.push(`IDENTITY_METRIC_UNAVAILABLE:${constraint.metricId}:${constraint.key}`); else if (!r.withinBounds) reject.push(`IDENTITY_CONSTRAINT_VIOLATED:${constraint.metricId}:${constraint.key}`);
    }
    if (!reject.includes('RELIABILITY_GATE_FAILED')) {
      // Unit = (opponent, fresh seed). Composite block b = weighted sum over opponents of unit b.
      const units = c.body.matchups.map((mu, k) => mu.blocks.map((own, b) => {
        const inc = i.body.matchups[k].blocks[b];
        if (own.seed !== inc.seed) fail('BLOCK_SEED_MISMATCH');
        return (own.ab + own.ba) / 2 - (inc.ab + inc.ba) / 2;
      }));
      const differences = Array.from({ length: m.plannedBlocks }, (_, b) => c.body.matchups.reduce((sum, mu, k) => sum + m.aggregationWeights[mu.opponentPolicyId] * units[k][b], 0));
      statistics = { ...pairedBlockAnalysis(differences, m.estimator.confidence), games: c.body.matchups.concat(i.body.matchups).reduce((s, mu) => s + mu.metrics.games, 0), differences };
      const tail = tailBalance(units.flat(), m.tailGuard.swing);
      constraintResults.push({ constraint: 'TAIL_BALANCE', ...tail, pass: tail.pass });
      if (!tail.pass) reject.push('TAIL_BALANCE_FAILED');
      if (!statistics.available) inconclusive.push('INSUFFICIENT_BLOCKS');
      else if (statistics.upper < m.practicalThreshold) reject.push('NO_PRACTICAL_IMPROVEMENT');
      else if (!(statistics.lower > 0 && statistics.mean >= m.practicalThreshold)) inconclusive.push('INSUFFICIENT_EVIDENCE');
    }
  }
  const decision = invalid.length ? 'INVALID' : reject.length ? 'REJECT' : inconclusive.length ? 'INCONCLUSIVE' : 'APPROVE';
  return makeArtifact('CHALLENGE_DECISION', { challengeId: manifest.id, decision, reasons: decision === 'APPROVE' ? ['IMPROVEMENT_AND_ALL_CONSTRAINTS_PASS'] : [...invalid, ...reject, ...inconclusive],
    challengerMeasurementId: challengerMeasurement?.id ?? null, incumbentMeasurementId: incumbentMeasurement?.id ?? null, statistics, perOpponent, constraintResults,
    estimator: m.estimator, policy: { policyId: policy.id, threshold: m.practicalThreshold, regressionFloor: m.regressionFloor }, automaticEligible: m.attempt.automaticEligible,
    claim: 'Per-challenge decision against this exact incumbent under the frozen policy. Not a general strength claim.' }, { scope: manifest.scope });
}

/** Prepare frozen journal + record outside the transaction, then commit atomically. */
export async function promoteChallenger({ store, agentProfileId, decisionId, commandId }) {
  const decision = await store.getArtifact(decisionId), manifest = await store.getArtifact(decision.body.challengeId);
  const [challengerMeasurement, incumbentMeasurement, nomination] = await Promise.all([decision.body.challengerMeasurementId, decision.body.incumbentMeasurementId, manifest.body.nominationId].map(id => store.getArtifact(id)));
  const [incumbent, challenger] = await Promise.all([manifest.body.incumbentCheckpointId, manifest.body.challengerCheckpointId].map(id => store.getCheckpoint(id)));
  const view = await store.profileView(agentProfileId), byId = new Map(view.checkpoints.map(cp => [cp.checkpointId, cp]));
  const transitionId = transitionIdFor(agentProfileId, manifest.body.expectedHead.headVersion, commandId);
  const journal = buildJournal({ kind: 'PROMOTION', agentProfileId, transitionId, from: { checkpoint: incumbent, revisionId: manifest.body.revisionId }, to: { checkpoint: challenger, revisionId: manifest.body.revisionId },
    inputs: { decision, manifest, challengerMeasurement, incumbentMeasurement, nomination, priorAttempts: manifest.body.attempt.priorAttemptIds, provenance: parameterProvenance(challenger, byId) } });
  const promotionRecord = makeArtifact('PROMOTION_RECORD', { agentProfileId, transitionId, decisionId, challengeId: manifest.id, nominationId: nomination.id, fromCheckpointId: incumbent.checkpointId, toCheckpointId: challenger.checkpointId,
    policyId: manifest.body.promotionPolicyId, eraId: manifest.body.eraId, journalId: journal.id, fromHeadVersion: manifest.body.expectedHead.headVersion, toHeadVersion: manifest.body.expectedHead.headVersion + 1 }, { scope: agentProfileId });
  return store.promote({ commandId, agentProfileId, decisionId, journal, promotionRecord });
}

// ── Experience (observational only) ────────────────────────────────────────
export function buildExperienceRecord({ encounterId, source = 'LOCAL_AI_PLAY', snapshot, agentSeat, rulesProfileId, outcome, observations }) {
  if (!snapshot?.profile) fail('EXPERIENCE_REQUIRES_PROFILE_SNAPSHOT');
  if (typeof encounterId !== 'string' || !encounterId) fail('INVALID_ENCOUNTER_ID');
  return makeArtifact('EXPERIENCE_RECORD', { contract: { ...CONTRACTS.experience }, purpose: 'EXPERIENCE', encounterId, source,
    agent: { agentProfileId: snapshot.profile.agentProfileId, headVersion: snapshot.profile.headVersion, revisionId: snapshot.profile.activeRevisionId, checkpointId: snapshot.checkpointId, genomeDigest: snapshot.genomeDigest, snapshotDigest: snapshot.snapshotDigest, implementation: snapshot.implementation },
    agentSeat, opponent: { kind: 'LOCAL_HUMAN', identity: 'NOT_RECORDED' }, rulesProfileId, outcome, observations,
    note: 'Observational encounter. Not scientific selection data; never trains, revises or promotes.' }, { scope: snapshot.profile.agentProfileId });
}

export const VERSIONED_SCIENCE_FUNCTIONS = { 'PROFILE_PACK_V1': createPack, 'ONE_PLUS_LAMBDA_V1+FIXED_REJECTION_THEN_CLAMP_V1': proposeCandidates, 'MEAN_PAIRED_TRAINING_SCORE_PARENT_FIRST@1': selectGeneration,
  'FINAL_COMMITTED_SELECTION_AT_BUDGET@1': nominate, 'PAIRED_BLOCK_STUDENT_T@1': pairedBlockAnalysis, 'TAIL_BALANCE_V1': tailBalance, 'FIXED_BUDGET_PAIRED_GENERALIST_DECISION@1': decideChallenge, 'PROFILE_MEASUREMENT@1': runMeasurement, 'MEASUREMENT_ADMISSION@1': admitMeasurement };
export { sameContent, deepFreeze };
