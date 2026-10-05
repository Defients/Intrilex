import { hashCanonical } from '@intrilex/shared';
import { STATIC_POLICIES, LAB_PROFILES, LAB_LIMITS, labGameSeed, createCheckpoint, validateCheckpoint, createLabRun, summarizeRecords, artifactEnvelope, validateArtifact } from './evolution-domain.mjs';
import { buildSnapshot, validateSnapshot } from './profile-store.mjs';
import { validateProfileArenaRun } from './profile-arena.mjs';
import { validateMatchupArtifact } from './matchup-lab.mjs';

// Batch Profile Matrix (schemaVersion 2 on the intrilex-matchup-lab format):
// a frozen participant manifest of 2-8 static policies and/or Custom Profile
// snapshots, every unique unordered pairing executed as one balanced AB/BA
// series. Evaluation only — no Profile head lookup, mutation, training or
// promotion authority is held after the manifest freezes.
export const BATCH_MATRIX_CONTRACT = 'intrilex-batch-matrix@1';
export const MIN_BATCH_PARTICIPANTS = 2;
export const MAX_BATCH_PARTICIPANTS = 8;
const ARENA_CONTRACT = 'intrilex-profile-arena@1';
const fail = (code, detail) => { throw Object.assign(new Error(detail !== undefined ? `${code}:${detail}` : code), { code }); };

export const participantId = selection => selection?.kind === 'STATIC_POLICY' ? `static:${selection.policyId}` : selection?.kind === 'AGENT_PROFILE' ? `profile:${selection.agentProfileId}` : null;

/** Normalize participant selections; rejects unsupported kinds, unknown static
 * policies, missing Profile ids and duplicate participants (self-play out). */
export function batchParticipantSelections(list) {
  if (!Array.isArray(list) || list.length < MIN_BATCH_PARTICIPANTS || list.length > MAX_BATCH_PARTICIPANTS) fail('INVALID_MATRIX_PARTICIPANTS');
  const seen = new Set();
  return list.map(selection => {
    const normalized = selection?.kind === 'STATIC_POLICY'
      ? (STATIC_POLICIES.includes(selection.policyId) ? { kind: 'STATIC_POLICY', policyId: selection.policyId } : fail('MATRIX_POLICY_NOT_ADMITTED'))
      : selection?.kind === 'AGENT_PROFILE'
        ? (typeof selection.agentProfileId === 'string' && selection.agentProfileId ? { kind: 'AGENT_PROFILE', agentProfileId: selection.agentProfileId } : fail('MATRIX_PROFILE_ID_MISSING'))
        : fail('MATRIX_PARTICIPANT_KIND');
    const id = participantId(normalized);
    if (seen.has(id)) fail('MATRIX_DUPLICATE_PARTICIPANT');
    seen.add(id);
    return normalized;
  });
}

export function batchMatrixConfig(input = {}) {
  const { participants, gamesPerMatchup = 64, seed = 1, profileId = LAB_PROFILES[0], workerCount = 2, strategicTrace = false } = input ?? {};
  const selections = batchParticipantSelections(participants);
  if (!Number.isInteger(gamesPerMatchup) || gamesPerMatchup < 2 || gamesPerMatchup > LAB_LIMITS.games || gamesPerMatchup % 2) fail('MATRIX_REQUIRES_COMPLETE_PAIRS');
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) fail('INVALID_MATRIX_SEED');
  if (!LAB_PROFILES.includes(profileId) || !Number.isInteger(workerCount) || workerCount < 1 || workerCount > LAB_LIMITS.workers || typeof strategicTrace !== 'boolean') fail('INVALID_MATRIX_CONFIG');
  const seedSet = new Set();
  for (let ordinal = 0; ordinal < gamesPerMatchup; ordinal += 2) {
    const gameSeed = labGameSeed(seed, ordinal);
    if (seedSet.has(gameSeed)) fail('MATRIX_SEED_COLLISION');
    seedSet.add(gameSeed);
  }
  return { participants: selections, gamesPerMatchup, seed, profileId, workerCount, strategicTrace };
}

/** Preflight plan for UI; derives everything from the validated config. The
 * byte estimate is advisory only — records are slim but retained replays vary. */
export function batchMatrixPlan(input) {
  const config = batchMatrixConfig(input);
  const count = config.participants.length, matchups = count * (count - 1) / 2;
  const recordBytes = config.strategicTrace ? 160 * 1024 : 80 * 1024; // decision-telemetry records measure ~80 KiB/game, roughly double under deep tracing
  return { participants: count, matchups, gamesPerMatchup: config.gamesPerMatchup, totalGames: matchups * config.gamesPerMatchup, seed: config.seed, profileId: config.profileId,
    estimatedBytes: matchups * (config.gamesPerMatchup * recordBytes + LAB_LIMITS.replays * 80000) };
}

function scientificManifest(config, participants, identity) {
  return { contract: BATCH_MATRIX_CONTRACT,
    participants: participants.map(p => ({ participantId: p.participantId, kind: p.kind, policyId: p.policyId, checkpointId: p.checkpointId, snapshotDigest: p.snapshot?.snapshotDigest ?? null })),
    gamesPerMatchup: config.gamesPerMatchup, seed: config.seed, profileId: config.profileId, strategicTrace: config.strategicTrace, identity };
}

/** Resolve every participant exactly once and freeze the manifest. Custom
 * Profiles resolve through the store's head snapshot + immutable checkpoint;
 * live heads are never consulted again for this matrix. */
export async function createBatchMatrix(input, identity, store, createdAt = new Date().toISOString()) {
  const config = batchMatrixConfig(input);
  const cache = new Map();
  const participants = [], checkpoints = [];
  for (const selection of config.participants) {
    if (selection.kind === 'STATIC_POLICY') {
      const checkpoint = createCheckpoint({ policyId: selection.policyId, identity, agentId: `matrix:${selection.policyId}`, createdAt });
      participants.push({ kind: 'STATIC_POLICY', participantId: `static:${selection.policyId}`, displayName: selection.policyId, policyId: selection.policyId, checkpointId: checkpoint.checkpointId, snapshot: null });
      checkpoints.push(checkpoint);
      continue;
    }
    if (!store) fail('MATRIX_STORE_REQUIRED');
    const id = selection.agentProfileId;
    if (!cache.has(id)) cache.set(id, (async () => {
      const snapshot = await store.resolveProfileHead(id);
      return { snapshot, checkpoint: await store.getCheckpoint(snapshot.checkpointId) };
    })());
    const { snapshot, checkpoint } = await cache.get(id);
    validateSnapshot(snapshot);
    if (snapshot.implementation?.fingerprint !== identity.fingerprint) fail('MATRIX_IMPLEMENTATION_MISMATCH');
    if (snapshot.rulesProfileId !== config.profileId) fail('MATRIX_PROFILE_RULES_MISMATCH', id);
    if (snapshot.profile?.agentProfileId !== id) fail('MATRIX_PROFILE_PROVENANCE');
    participants.push({ kind: 'AGENT_PROFILE', participantId: `profile:${id}`, displayName: snapshot.displayName ?? id, policyId: snapshot.policyId, checkpointId: checkpoint.checkpointId, snapshot: structuredClone(snapshot) });
    checkpoints.push(structuredClone(checkpoint));
  }
  const matrixId = `MX-${hashCanonical(scientificManifest(config, participants, identity))}`;
  return { schemaVersion: 2, contract: BATCH_MATRIX_CONTRACT, kind: 'FROZEN_ROUND_ROBIN', purpose: 'EVALUATION', matrixId, config, participants, checkpoints, identity: structuredClone(identity), runs: [], status: 'IDLE', createdAt };
}

/** Deterministic participant manifest checks shared by the view, the runner
 * and both persistence shapes. Returns the validated config. */
function assertBatchManifest(lab) {
  if (lab?.schemaVersion !== 2 || lab.contract !== BATCH_MATRIX_CONTRACT || lab.kind !== 'FROZEN_ROUND_ROBIN' || lab.purpose !== 'EVALUATION'
    || !['IDLE', 'RUNNING', 'STOPPED', 'ERROR', 'COMPLETE'].includes(lab.status) || !Number.isFinite(Date.parse(lab.createdAt))
    || !Array.isArray(lab.participants) || !Array.isArray(lab.checkpoints) || !lab.identity) fail('INVALID_MATRIX_ARTIFACT');
  const config = batchMatrixConfig(lab.config);
  if (lab.participants.length !== config.participants.length || lab.checkpoints.length !== config.participants.length) fail('INVALID_MATRIX_PARTICIPANTS');
  const ids = new Set();
  lab.participants.forEach((p, i) => {
    const selection = config.participants[i];
    if (p?.kind !== selection.kind || p.participantId !== participantId(selection) || typeof p.displayName !== 'string' || !p.displayName || ids.has(p.participantId)) fail('MATRIX_PARTICIPANT_MISMATCH');
    ids.add(p.participantId);
    const checkpoint = lab.checkpoints[i];
    if (checkpoint?.checkpointId !== p.checkpointId) fail('MATRIX_CHECKPOINT_SUBSTITUTION');
    validateCheckpoint(checkpoint, lab.identity);
    if (p.kind === 'STATIC_POLICY') {
      const expected = createCheckpoint({ policyId: selection.policyId, identity: lab.identity, agentId: `matrix:${selection.policyId}`, createdAt: lab.createdAt });
      if (p.policyId !== selection.policyId || p.snapshot !== null || checkpoint.checkpointId !== expected.checkpointId) fail('MATRIX_PARTICIPANT_MISMATCH');
      return;
    }
    const snapshot = p.snapshot;
    validateSnapshot(snapshot);
    const profile = snapshot.profile;
    if (snapshot.kind !== 'PROFILE_HEAD' || !profile || profile.agentProfileId !== selection.agentProfileId
      || !Number.isSafeInteger(profile.headVersion) || profile.headVersion < 1 || typeof profile.activeRevisionId !== 'string' || !profile.activeRevisionId
      || !/^[a-f0-9]{64}$/.test(profile.headTokenDigest ?? '')) fail('MATRIX_PROFILE_PROVENANCE');
    if (snapshot.rulesProfileId !== config.profileId) fail('MATRIX_PROFILE_RULES_MISMATCH');
    if (snapshot.implementation?.fingerprint !== lab.identity.fingerprint) fail('MATRIX_IMPLEMENTATION_MISMATCH');
    const rebuilt = buildSnapshot({ checkpoint, identity: lab.identity, profile: { ...profile, displayName: snapshot.displayName }, rulesProfileId: config.profileId });
    if (rebuilt.snapshotDigest !== snapshot.snapshotDigest || checkpoint.policyId !== snapshot.policyId || p.policyId !== snapshot.policyId) fail('MATRIX_CHECKPOINT_MISMATCH');
  });
  if (lab.matrixId !== `MX-${hashCanonical(scientificManifest(config, lab.participants, lab.identity))}`) fail('MATRIX_SCIENTIFIC_ID_MISMATCH');
  return config;
}

const cellKey = (seatA, seatB) => `${seatA}|${seatB}`;
const seatIndex = (lab, id) => lab.participants.findIndex(p => p.participantId === id);

/** Build the deterministic series run for one pairing. The run binds to the
 * cell by matrixCell metadata and embeds the exact frozen checkpoints plus the
 * existing Profile Arena provenance contract when a Profile participates. */
export function batchCellRun(lab, i, j, createdAt = new Date().toISOString()) {
  const a = lab.participants[i], b = lab.participants[j];
  if (!a || !b || i === j) fail('MATRIX_CELL_INVALID');
  const run = createLabRun({ botA: a.policyId, botB: b.policyId, profileId: lab.config.profileId, gameCount: lab.config.gamesPerMatchup, seed: lab.config.seed,
    workerCount: lab.config.workerCount, mirrorSeats: true, kind: 'EVALUATION', strategicTrace: lab.config.strategicTrace }, lab.identity, createdAt);
  run.checkpoints = structuredClone([lab.checkpoints[i], lab.checkpoints[j]]);
  if (a.snapshot || b.snapshot) run.arenaProfiles = { contract: ARENA_CONTRACT, snapshots: [structuredClone(a.snapshot), structuredClone(b.snapshot)] };
  run.matrixCell = { matrixId: lab.matrixId, seatA: a.participantId, seatB: b.participantId };
  run.runId = `EL-${hashCanonical({ runId: run.runId, cell: run.matrixCell, checkpointIds: run.checkpoints.map(c => c.checkpointId) }).slice(0, 24)}`;
  validateProfileArenaRun(run, lab.identity);
  return run;
}

/** Execute every missing pairing of a frozen matrix. `source` is either a
 * creation input (which freezes a fresh manifest) or an existing
 * schemaVersion-2 lab manifest (which resumes under its frozen authority).
 * Interrupted cells resume at game granularity: the same run object continues
 * and claimed ordinals are never replayed or duplicated. */
export async function runBatchMatrix(source, executeSeries, { identity, store, signal, onProgress = () => {}, onRun = () => {}, onMatrix = () => {}, onAcceptedGame, createdAt } = {}) {
  const lab = source?.schemaVersion === 2 && source?.matrixId ? source : await createBatchMatrix(source, identity, store, createdAt);
  assertBatchManifest(lab);
  const before = hashCanonical({ participants: lab.participants, checkpoints: lab.checkpoints });
  lab.status = 'RUNNING';
  const n = lab.participants.length, cellsTotal = n * (n - 1) / 2;
  const gamesSoFar = () => lab.runs.reduce((sum, run) => sum + run.records.length, 0);
  const cellsDone = () => lab.runs.filter(run => run.status === 'COMPLETE').length;
  const totalGames = cellsTotal * lab.config.gamesPerMatchup;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
    const a = lab.participants[i], b = lab.participants[j];
    let index = lab.runs.findIndex(r => r.matrixCell?.seatA === a.participantId && r.matrixCell?.seatB === b.participantId);
    let run = index >= 0 ? lab.runs[index] : null;
    if (run?.status === 'COMPLETE') continue;
    if (signal?.aborted) { lab.status = 'STOPPED'; await onMatrix(lab); return lab; }
    if (run) { validateArtifact(artifactEnvelope(run), lab.identity); run.status = 'PAUSED'; }
    else { run = batchCellRun(lab, i, j, createdAt); lab.runs.push(run); index = lab.runs.length - 1; }
    const prior = run.records.length;
    const result = await executeSeries(run.config, { identity: lab.identity, signal, run, onAcceptedGame,
      onProgress: p => onProgress({ ...p, seatA: a.participantId, seatB: b.participantId, displayA: a.displayName, displayB: b.displayName,
        gamesCompleted: gamesSoFar() - prior + p.completed, gamesTotal: totalGames, cellsCompleted: cellsDone(), cellsTotal }) });
    if (hashCanonical({ participants: lab.participants, checkpoints: lab.checkpoints }) !== before) throw new Error('MATRIX_MUTATED_MANIFEST');
    lab.runs[index] = result.run;
    await onRun(result.run);
    await onMatrix(lab);
    if (result.run.status !== 'COMPLETE') { lab.status = result.run.status === 'STOPPED' ? 'STOPPED' : 'ERROR'; await onMatrix(lab); return lab; }
  }
  lab.status = 'COMPLETE';
  await onMatrix(lab);
  return lab;
}

function checkMatrixRun(run, lab, config, seen) {
  const cell = run.matrixCell;
  if (!cell || cell.matrixId !== lab.matrixId || typeof cell.seatA !== 'string' || typeof cell.seatB !== 'string') fail('INCOMPATIBLE_MATRIX_SERIES');
  const i = seatIndex(lab, cell.seatA), j = seatIndex(lab, cell.seatB);
  if (i < 0 || j < 0 || i >= j) fail('INCOMPATIBLE_MATRIX_SERIES');
  const key = cellKey(cell.seatA, cell.seatB);
  if (seen.has(key)) fail('DUPLICATE_MATRIX_SERIES');
  seen.add(key);
  const a = lab.participants[i], b = lab.participants[j];
  if (run.config.botA !== a.policyId || run.config.botB !== b.policyId || run.config.seed !== config.seed || run.config.gameCount !== config.gamesPerMatchup
    || run.config.profileId !== config.profileId || run.config.mirrorSeats !== true || run.kind !== 'EVALUATION'
    || (run.config.strategicTrace ?? false) !== config.strategicTrace) fail('INCOMPATIBLE_MATRIX_SERIES');
  if (run.checkpoints[0].checkpointId !== lab.checkpoints[i].checkpointId || run.checkpoints[1].checkpointId !== lab.checkpoints[j].checkpointId) fail('MATRIX_CHECKPOINT_SUBSTITUTION');
  const expectedSnapshots = [a.snapshot ?? null, b.snapshot ?? null];
  const snapshots = run.arenaProfiles?.snapshots;
  if (expectedSnapshots.some(Boolean)) {
    if (!Array.isArray(snapshots) || snapshots.length !== 2 || hashCanonical(snapshots[0] ?? null) !== hashCanonical(expectedSnapshots[0]) || hashCanonical(snapshots[1] ?? null) !== hashCanonical(expectedSnapshots[1])) fail('MATRIX_SNAPSHOT_MISMATCH');
    validateProfileArenaRun(run, lab.identity);
  } else if (run.arenaProfiles) fail('MATRIX_SNAPSHOT_MISMATCH');
  return { i, j, a, b };
}

/** Verified projection: cells, per-participant aggregate and deterministic
 * leaderboard over the frozen manifest. Throws on any binding violation. */
export function batchMatrixView(lab) {
  const config = assertBatchManifest(lab);
  if (!Array.isArray(lab.runs)) fail('INVALID_MATRIX_ARTIFACT');
  const n = lab.participants.length, seen = new Set();
  const aggregate = Object.fromEntries(lab.participants.map(p => [p.participantId, { games: 0, clean: 0, wins: 0, losses: 0, draws: 0, faults: 0, matchups: 0 }]));
  const cells = [];
  const runs = lab.runs.map(run => {
    const validated = validateArtifact(artifactEnvelope(run), lab.identity);
    checkMatrixRun(validated, lab, config, seen);
    return validated;
  });
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
    const a = lab.participants[i], b = lab.participants[j];
    const run = runs.find(r => r.matrixCell?.seatA === a.participantId && r.matrixCell?.seatB === b.participantId);
    const metrics = summarizeRecords(run?.records ?? []);
    const terminations = (run?.records ?? []).reduce((o, r) => { o[r.terminationReason] = (o[r.terminationReason] ?? 0) + 1; return o; }, {});
    const seats = [false, true].map(swapped => { const m = summarizeRecords((run?.records ?? []).filter(r => r.swapped === swapped)); return { seat: swapped ? 'BA' : 'AB', games: m.clean, winsA: m.winsA, winsB: m.winsB, draws: m.draws }; });
    cells.push({ seatA: a.participantId, seatB: b.participantId, displayA: a.displayName, displayB: b.displayName, runId: run?.runId ?? null, status: run?.status ?? 'PENDING',
      records: run?.records.length ?? 0, metrics, seats, terminations, complete: run?.status === 'COMPLETE' });
    for (const [id, wins, losses] of [[a.participantId, metrics.winsA, metrics.winsB], [b.participantId, metrics.winsB, metrics.winsA]]) {
      const agg = aggregate[id];
      agg.games += metrics.games; agg.clean += metrics.clean; agg.wins += wins; agg.losses += losses; agg.draws += metrics.draws; agg.faults += metrics.aborted;
      if (run) agg.matchups += 1;
    }
  }
  for (const agg of Object.values(aggregate)) agg.scoreRate = agg.clean ? (agg.wins + agg.draws / 2) / agg.clean : null;
  if (lab.status === 'COMPLETE' && cells.some(c => !c.complete)) fail('INCOMPLETE_MATRIX_CLAIM');
  const leaderboard = lab.participants.map(p => ({ participantId: p.participantId, displayName: p.displayName, kind: p.kind,
    headVersion: p.snapshot?.profile?.headVersion ?? null, matchupsComplete: cells.filter(c => c.complete && (c.seatA === p.participantId || c.seatB === p.participantId)).length,
    ...aggregate[p.participantId] }))
    .sort((x, y) => (y.scoreRate ?? -1) - (x.scoreRate ?? -1) || y.wins - x.wins || x.participantId.localeCompare(y.participantId))
    .map((row, rank) => ({ rank: rank + 1, ...row }));
  return { matrixId: lab.matrixId, schemaVersion: 2, contract: BATCH_MATRIX_CONTRACT, profileId: config.profileId, status: lab.status,
    participants: lab.participants.map(p => ({ participantId: p.participantId, displayName: p.displayName, kind: p.kind, policyId: p.policyId, headVersion: p.snapshot?.profile?.headVersion ?? null })),
    cells, aggregate, leaderboard, acceptedGames: lab.runs.reduce((sum, r) => sum + r.records.length, 0),
    requestedGames: n * (n - 1) / 2 * config.gamesPerMatchup, cellsTotal: n * (n - 1) / 2, cellsComplete: cells.filter(c => c.complete).length,
    uncertainty: '95% Hoeffding bounds use complete independent AB/BA seat pairs within each matchup; aggregate scores are descriptive matrix performance, not a transitive rating.' };
}

/** Portable self-contained artifact: the frozen manifest plus every accepted run. */
export function batchMatrixArtifact(lab) {
  const payload = structuredClone(lab);
  return { format: 'intrilex-matchup-lab', schemaVersion: 2, payload, contentHash: hashCanonical(payload) };
}
export function validateBatchMatrixArtifact(envelope) {
  if (envelope?.format !== 'intrilex-matchup-lab' || envelope.schemaVersion !== 2 || envelope.kind === 'MANIFEST' || envelope.contentHash !== hashCanonical(envelope.payload)) fail('MATRIX_ARTIFACT_HASH_MISMATCH');
  const lab = structuredClone(envelope.payload);
  batchMatrixView(lab);
  return lab;
}

/** Compact persisted manifest: the frozen plan plus run references. Cell run
 * evidence lives in the run store; the manifest never duplicates records. */
export function batchMatrixManifest(lab) {
  const { runs, ...rest } = structuredClone(lab);
  const payload = { ...rest, runRefs: (runs ?? []).map(r => ({ seatA: r.matrixCell?.seatA, seatB: r.matrixCell?.seatB, runId: r.runId, status: r.status, records: r.records?.length ?? 0 })) };
  return { format: 'intrilex-matchup-lab', schemaVersion: 2, kind: 'MANIFEST', payload, contentHash: hashCanonical(payload) };
}
export function validateBatchMatrixManifest(envelope) {
  if (envelope?.format !== 'intrilex-matchup-lab' || envelope.schemaVersion !== 2 || envelope.kind !== 'MANIFEST' || envelope.contentHash !== hashCanonical(envelope.payload)) fail('MATRIX_ARTIFACT_HASH_MISMATCH');
  const manifest = structuredClone(envelope.payload);
  const config = assertBatchManifest({ ...manifest, runs: [] });
  if (!Array.isArray(manifest.runRefs)) fail('INVALID_MATRIX_ARTIFACT');
  const seen = new Set();
  for (const ref of manifest.runRefs) {
    const i = seatIndex(manifest, ref.seatA), j = seatIndex(manifest, ref.seatB);
    const key = cellKey(ref.seatA, ref.seatB);
    if (i < 0 || j < 0 || i >= j || seen.has(key) || typeof ref.runId !== 'string' || !/^EL-[a-f0-9]{24}$/.test(ref.runId)
      || !['IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'ERROR', 'COMPLETE'].includes(ref.status) || !Number.isInteger(ref.records) || ref.records < 0 || ref.records > config.gamesPerMatchup) fail('INVALID_MATRIX_RUNREF');
    seen.add(key);
  }
  return manifest;
}
/** Rebuild a resumable lab from a stored manifest plus a run loader. Missing
 * runs leave their cells pending; mismatched stored runs fail closed through
 * the view. Live Profile heads are never consulted. */
export async function rehydrateBatchMatrix(manifest, loadRun) {
  const { runRefs = [], ...rest } = manifest;
  const lab = { ...rest, runs: Array.isArray(rest.runs) ? rest.runs : [] };
  for (const ref of runRefs) {
    const run = await loadRun(ref.runId);
    if (run) lab.runs.push(run);
  }
  batchMatrixView(lab);
  return lab;
}
/** Accept v1 static artifacts, v2 full artifacts and v2 compact manifests. */
export function validateMatrixEnvelope(envelope) {
  if (envelope?.format !== 'intrilex-matchup-lab') fail('MATRIX_ARTIFACT_HASH_MISMATCH');
  if (envelope.schemaVersion === 1) return validateMatchupArtifact(envelope);
  if (envelope.schemaVersion === 2) return envelope.kind === 'MANIFEST' ? validateBatchMatrixManifest(envelope) : validateBatchMatrixArtifact(envelope);
  fail('MATRIX_ARTIFACT_UNSUPPORTED');
}
