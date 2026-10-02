import { hashCanonical } from '@intrilex/shared';

/** @typedef {{schemaVersion:number, fingerprint:string, engineHash:string, policyImplementationHash:string, runtimeHash:string, engineVersion:string, rulesVersion:string}} RulesetFingerprint */
/** @typedef {{checkpointId:string, agentId:string, lineageId:string, generation:number, parentCheckpointId:string|null, policyId:string, policyVersion:string, policyState:object, identity:RulesetFingerprint, createdAt:string}} AgentCheckpoint */
/** @typedef {{ordinal:number, swapped:boolean, seed:number, checkpointIds:string[], winner:string, terminationReason:string, finalStateHash:string, actionSequenceHash:string}} MatchResult */
/** @typedef {{schemaVersion:number, runId:string, kind:string, config:object, identity:RulesetFingerprint, checkpoints:AgentCheckpoint[], records:MatchResult[], replays:object[], status:string}} SimulationRun */

export const LAB_SCHEMA = 1;
export const FROZEN_POLICIES = Object.freeze(['random-legal', 'score-rush', 'control', 'tempo', 'value']);
export const LAB_PROFILES = Object.freeze(['core-advanced-authority', 'core-unrestricted-authority', 'first-contact-trigger-closure']);
export const LAB_LIMITS = Object.freeze({ games: 10000, workers: 4, decisions: 1800, replays: 12, commands: 12000, importBytes: 40 * 1024 * 1024 });
export const CLEAN_REASONS = Object.freeze(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

export function assertIdentity(identity, expected = identity) {
  if (!identity || identity.schemaVersion !== LAB_SCHEMA || !['fingerprint', 'engineHash', 'policyImplementationHash', 'runtimeHash'].every(k => digest(identity[k]))) fail('INVALID_IDENTITY');
  const { engineHash, policyImplementationHash, runtimeHash, engineVersion, rulesVersion } = identity;
  if (identity.fingerprint !== hashCanonical({ engineHash, policyImplementationHash, runtimeHash, engineVersion, rulesVersion })) fail('IDENTITY_HASH_MISMATCH');
  if (!expected || identity.fingerprint !== expected.fingerprint) fail('INCOMPATIBLE_IMPLEMENTATION');
  return identity;
}

export function labConfig(input) {
  if (!input || typeof input !== 'object') fail('INVALID_CONFIG');
  const { botA, botB, profileId = LAB_PROFILES[0], gameCount, seed = 1, workerCount = 1, mirrorSeats = true, kind = 'SELF_PLAY' } = input;
  if (!FROZEN_POLICIES.includes(botA) || !FROZEN_POLICIES.includes(botB)) fail('POLICY_NOT_ADMITTED');
  if (!LAB_PROFILES.includes(profileId)) fail('PROFILE_NOT_ADMITTED');
  if (!Number.isInteger(gameCount) || gameCount < 1 || gameCount > LAB_LIMITS.games) fail('INVALID_GAME_COUNT');
  if (!uint(seed)) fail('INVALID_SEED');
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > LAB_LIMITS.workers) fail('INVALID_WORKER_COUNT');
  if (typeof mirrorSeats !== 'boolean' || !['SELF_PLAY', 'EVALUATION'].includes(kind)) fail('INVALID_RUN_KIND');
  if (kind === 'EVALUATION' && (!mirrorSeats || gameCount % 2)) fail('EVALUATION_REQUIRES_COMPLETE_PAIRS');
  return { botA, botB, profileId, gameCount, seed: seed || 1, workerCount, mirrorSeats, kind, decisionLimit: LAB_LIMITS.decisions, orchestrationCommandLimit: 256 };
}

export function labGameSeed(baseSeed, ordinal, mirrored = true) {
  // Paired seat swaps reuse game randomness; game and policy streams remain separate.
  const pair = mirrored ? Math.floor(ordinal / 2) : ordinal;
  return (Number.parseInt(hashCanonical({ stream: 'EVOLUTION_LAB_V1', baseSeed: baseSeed || 1, pair }).slice(0, 8), 16) >>> 0) || 1;
}

export function gamePlan(config, ordinal) {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= config.gameCount) fail('ORDINAL_OUT_OF_RANGE');
  const swapped = config.mirrorSeats && ordinal % 2 === 1;
  return { ordinal, swapped, seed: labGameSeed(config.seed, ordinal, config.mirrorSeats),
    policyIds: swapped ? [config.botB, config.botA] : [config.botA, config.botB] };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}

export function createCheckpoint({ policyId, identity, agentId, lineageId = agentId, parentCheckpointId = null, createdAt = new Date().toISOString() }) {
  assertIdentity(identity);
  if (!FROZEN_POLICIES.includes(policyId) || typeof agentId !== 'string' || !agentId || typeof lineageId !== 'string' || !lineageId) fail('INVALID_CHECKPOINT_POLICY');
  const body = { schemaVersion: LAB_SCHEMA, policyId, policyVersion: '2.0.0', policyImplementationHash: identity.policyImplementationHash,
    agentId, lineageId, parentCheckpointId, generation: 0, createdAt, policyState: {}, trainingConfiguration: null,
    identity: structuredClone(identity), tags: ['frozen', 'baseline'], protected: true };
  return deepFreeze({ ...body, checkpointId: `CP-${hashCanonical(body)}` });
}

export function validateCheckpoint(checkpoint, identity) {
  if (!checkpoint || checkpoint.schemaVersion !== LAB_SCHEMA) fail('INVALID_CHECKPOINT');
  assertIdentity(checkpoint.identity, identity);
  const { checkpointId, ...body } = checkpoint;
  if (checkpointId !== `CP-${hashCanonical(body)}`) fail('CHECKPOINT_HASH_MISMATCH');
  if (!FROZEN_POLICIES.includes(body.policyId) || body.policyVersion !== '2.0.0' || body.policyImplementationHash !== identity.policyImplementationHash || body.generation !== 0 || body.trainingConfiguration !== null || Object.keys(body.policyState ?? {}).length) fail('INCOMPATIBLE_CHECKPOINT');
  if (typeof body.agentId !== 'string' || !body.agentId || typeof body.lineageId !== 'string' || !Number.isFinite(Date.parse(body.createdAt))) fail('INVALID_CHECKPOINT_METADATA');
  return deepFreeze(structuredClone(checkpoint));
}

export function createLabRun(input, identity, createdAt = new Date().toISOString()) {
  assertIdentity(identity);
  const config = labConfig(input);
  const runId = `EL-${hashCanonical({ config, fingerprint: identity.fingerprint, createdAt }).slice(0, 24)}`;
  const checkpoints = ['A', 'B'].map((seat, i) => createCheckpoint({ policyId: i ? config.botB : config.botA, identity, agentId: `${runId}:${seat}`, createdAt }));
  return { schemaVersion: LAB_SCHEMA, runId, kind: config.kind, config, identity: structuredClone(identity), checkpoints,
    records: [], replays: [], bookmarks: [], notes: '', status: 'IDLE', createdAt, elapsedMs: 0 };
}

export function gameEvidence(summary, plan, run, replay, durationMs = 0) {
  if (!replay || !Array.isArray(replay.commands)) fail('REPLAY_REQUIRED');
  const initialStateHash = hashCanonical(replay.initialState);
  const actionSequenceHash = hashCanonical(replay.commands);
  const core = { schemaVersion: LAB_SCHEMA, ordinal: plan.ordinal, swapped: plan.swapped, seed: plan.seed,
    matchId: summary.matchId, replayId: `ER-${hashCanonical({ fingerprint: run.identity.fingerprint, initialStateHash, actionSequenceHash })}`,
    fingerprint: run.identity.fingerprint, checkpointIds: plan.swapped ? run.checkpoints.map(c => c.checkpointId).reverse() : run.checkpoints.map(c => c.checkpointId),
    policyIds: plan.policyIds, winner: summary.winner, winningSeat: summary.winningSeat ?? null, terminationReason: summary.terminationReason,
    errorCode: summary.errorCode ?? null, scoreP1: summary.finalScores.P1, scoreP2: summary.finalScores.P2,
    turns: summary.completedFullTurns, decisions: summary.policyDecisionCount, miniTurns: summary.miniTurnCount ?? 0,
    actionCount: summary.actionCount ?? 0, policyActionCount: summary.policyActionCount ?? 0,
    commandCount: replay.commands.length, initialStateHash, actionSequenceHash, finalStateHash: summary.finalStateHash,
    illegalActionAttempts: ['ENGINE_REJECTION', 'ACTION_ID_INVALID'].includes(summary.errorCode) || summary.terminationReason === 'ENGINE_REJECTION' ? 1 : 0,
    actionCounts: summary.decisionFamilyCounts ?? {}, eventCounts: summary.eventTypeCounts ?? {},
    mechanicCounts: summary.mechanicCounts ?? {}, ruleCompliance: summary.ruleCompliance?.status ?? 'UNAVAILABLE' };
  return { ...core, resultHash: hashCanonical(core), durationMs };
}

export function gameFault(error, plan, run, durationMs = 0) {
  const body = { schemaVersion: LAB_SCHEMA, ordinal: plan.ordinal, swapped: plan.swapped, seed: plan.seed,
    fingerprint: run.identity.fingerprint, checkpointIds: plan.swapped ? run.checkpoints.map(c => c.checkpointId).reverse() : run.checkpoints.map(c => c.checkpointId),
    policyIds: plan.policyIds, winner: 'ABORTED', winningSeat: null, terminationReason: 'WORKER_FAULT', errorCode: String(error?.code ?? error?.message ?? 'GAME_FAULT').slice(0, 300),
    scoreP1: 0, scoreP2: 0, turns: 0, decisions: 0, miniTurns: 0, actionCount: 0, policyActionCount: 0, commandCount: 0,
    diagnostic: { seed: plan.seed, runId: run.runId, ordinal: plan.ordinal, message: String(error?.stack ?? error).slice(0, 2000) } };
  return { ...body, resultHash: hashCanonical(body), durationMs };
}

export function validateRecord(record, run) {
  const { resultHash, durationMs, ...body } = record;
  if (!Number.isFinite(durationMs) || durationMs < 0) fail('INVALID_GAME_DURATION');
  if (record.schemaVersion !== LAB_SCHEMA || resultHash !== hashCanonical(body)) fail('RESULT_HASH_MISMATCH');
  const plan = gamePlan(run.config, record.ordinal);
  if (record.seed !== plan.seed || record.swapped !== plan.swapped || record.fingerprint !== run.identity.fingerprint || hashCanonical(record.policyIds) !== hashCanonical(plan.policyIds)) fail('RESULT_PLAN_MISMATCH');
  const ids = plan.swapped ? run.checkpoints.map(c => c.checkpointId).reverse() : run.checkpoints.map(c => c.checkpointId);
  if (hashCanonical(record.checkpointIds) !== hashCanonical(ids)) fail('RESULT_CHECKPOINT_MISMATCH');
  if (!['P1', 'P2', 'DRAW', 'ABORTED'].includes(record.winner) || !['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW', 'DECISION_LIMIT', 'POLICY_ERROR', 'ENGINE_REJECTION', 'UNSUPPORTED_CONFIGURATION', 'WORKER_FAULT'].includes(record.terminationReason)) fail('INVALID_RESULT');
  for (const k of ['scoreP1', 'scoreP2', 'turns', 'decisions', 'miniTurns', 'actionCount', 'policyActionCount', 'commandCount']) if (!Number.isFinite(record[k]) || record[k] < 0) fail('INVALID_RESULT_METRIC');
  if (record.decisions > LAB_LIMITS.decisions || record.commandCount > LAB_LIMITS.commands) fail('RESULT_BUDGET_EXCEEDED');
  if (record.terminationReason !== 'WORKER_FAULT' && !['initialStateHash', 'actionSequenceHash', 'finalStateHash'].every(k => digest(record[k]))) fail('INVALID_RESULT_EVIDENCE');
  return record;
}

export function validateReplay(evidence, record, run) {
  const replay = evidence?.replay;
  if (!replay || !Array.isArray(replay.commands) || replay.commands.length > LAB_LIMITS.commands) fail('INVALID_REPLAY');
  if (evidence.replayId !== record.replayId || hashCanonical(replay.initialState) !== record.initialStateHash || hashCanonical(replay.commands) !== record.actionSequenceHash) fail('REPLAY_HASH_MISMATCH');
  const state = replay.initialState;
  // The engine has already consumed RNG during shuffle/deal in this state.
  // Seed-to-initial-state verification belongs to the engine adapter.
  if ((state.metadata?.coreAuthority?.profileId ?? state.metadata?.autonomy?.profileId) !== run.config.profileId) fail('REPLAY_SETUP_MISMATCH');
  return replay;
}

export function retainReplay(run, evidence) {
  if (!evidence?.replay || !evidence?.record?.replayId || run.replays.some(r => r.replayId === evidence.record.replayId)) return;
  const item = { replayId: evidence.record.replayId, ordinal: evidence.record.ordinal, replay: evidence.replay };
  run.replays.push(item);
  // Priority is deterministic across arrival orders. Bookmarks are explicit
  // developer intent; otherwise preserve aborted samples then early ordinals.
  const priority = r => run.bookmarks.includes(r.replayId) ? 0 : CLEAN_REASONS.includes(run.records.find(g => g.ordinal === r.ordinal)?.terminationReason) ? 2 : 1;
  run.replays.sort((a,b) => priority(a)-priority(b) || a.ordinal-b.ordinal);
  run.replays.length = Math.min(run.replays.length, LAB_LIMITS.replays);
  run.replays.sort((a, b) => a.ordinal - b.ordinal);
}

export function artifactEnvelope(run) {
  const payload = structuredClone(run);
  payload.records.sort((a, b) => a.ordinal - b.ordinal);
  return { format: 'intrilex-evolution-lab', schemaVersion: LAB_SCHEMA, payload, contentHash: hashCanonical(payload) };
}

export function validateArtifact(envelope, identity) {
  if (!envelope || envelope.format !== 'intrilex-evolution-lab' || envelope.schemaVersion !== LAB_SCHEMA || envelope.contentHash !== hashCanonical(envelope.payload)) fail('ARTIFACT_HASH_MISMATCH');
  const run = structuredClone(envelope.payload);
  assertIdentity(run.identity, identity);
  const cfg = labConfig(run.config);
  if (hashCanonical(cfg) !== hashCanonical(run.config) || run.schemaVersion !== LAB_SCHEMA || run.kind !== cfg.kind || typeof run.runId !== 'string' || !/^EL-[a-f0-9]{24}$/.test(run.runId) || !['IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETE', 'ERROR'].includes(run.status)) fail('INVALID_RUN');
  if (!Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(run.elapsedMs) || run.elapsedMs < 0 || typeof run.notes !== 'string' || run.notes.length > 10000) fail('INVALID_RUN_METADATA');
  if (!Array.isArray(run.checkpoints) || run.checkpoints.length !== 2 || !Array.isArray(run.records) || run.records.length > cfg.gameCount || !Array.isArray(run.replays) || run.replays.length > LAB_LIMITS.replays || !Array.isArray(run.bookmarks) || run.bookmarks.length > LAB_LIMITS.replays) fail('ARTIFACT_BUDGET_EXCEEDED');
  run.checkpoints = run.checkpoints.map(c => validateCheckpoint(c, identity));
  if (run.checkpoints[0].policyId !== cfg.botA || run.checkpoints[1].policyId !== cfg.botB) fail('CHECKPOINT_CONFIG_MISMATCH');
  const ordinals = new Set();
  for (const record of run.records) { validateRecord(record, run); if (ordinals.has(record.ordinal)) fail('DUPLICATE_ORDINAL'); ordinals.add(record.ordinal); }
  const replays = new Set();
  for (const evidence of run.replays) {
    const record = run.records.find(r => r.ordinal === evidence.ordinal);
    if (!record || replays.has(evidence.replayId)) fail('REPLAY_RECORD_MISSING');
    validateReplay(evidence, record, run); replays.add(evidence.replayId);
  }
  if (run.bookmarks.some(id => !replays.has(id))) fail('BOOKMARK_REPLAY_MISSING');
  if (run.status === 'COMPLETE' && run.records.length !== cfg.gameCount) fail('INCOMPLETE_RUN');
  if (run.status === 'RUNNING') run.status = 'PAUSED';
  return run;
}

export function summarizeRecords(records) {
  const sorted = [...records].sort((a, b) => a.ordinal - b.ordinal);
  const clean = sorted.filter(r => CLEAN_REASONS.includes(r.terminationReason));
  const winsA = clean.filter(r => (r.winner === 'P1' && !r.swapped) || (r.winner === 'P2' && r.swapped)).length;
  const winsB = clean.filter(r => (r.winner === 'P2' && !r.swapped) || (r.winner === 'P1' && r.swapped)).length;
  const draws = clean.filter(r => r.winner === 'DRAW').length;
  const differences = clean.map(r => r.swapped ? r.scoreP2 - r.scoreP1 : r.scoreP1 - r.scoreP2).sort((a,b) => a-b);
  const n = clean.length, average = n ? differences.reduce((a,b) => a+b, 0) / n : null;
  const actionCounts = {}, abortReasons = {};
  for (const r of sorted) {
    if (!CLEAN_REASONS.includes(r.terminationReason)) abortReasons[r.terminationReason] = (abortReasons[r.terminationReason] ?? 0) + 1;
    else for (const [key, value] of Object.entries(r.actionCounts ?? {})) actionCounts[key] = (actionCounts[key] ?? 0) + value;
  }
  // Paired seeds are correlated: report uncertainty over independent complete pairs,
  // not a binomial interval that incorrectly treats all seat swaps as independent.
  const pairScores = [];
  const byOrdinal = new Map(clean.map(r => [r.ordinal, r]));
  const points = r => r.winner === 'DRAW' ? .5 : ((r.winner === 'P1') !== r.swapped ? 1 : 0);
  for (const r of clean) {
    const partner = byOrdinal.get(r.ordinal + 1);
    if (r.ordinal % 2 === 0 && partner && partner.seed === r.seed && r.swapped === false && partner.swapped === true) pairScores.push((points(r) + points(partner)) / 2);
  }
  const pairCount = pairScores.length;
  const pairedScore = pairCount ? pairScores.reduce((a,b) => a+b, 0) / pairCount : null;
  // Hoeffding bound for bounded independent seed-pair scores; conservative by design.
  const radius = pairCount ? Math.sqrt(Math.log(40) / (2 * pairCount)) : null;
  return { games: sorted.length, clean: n, winsA, winsB, draws, aborted: sorted.length-n, unresolved: n-winsA-winsB-draws,
    winRateA: n ? winsA/n : null, winRateB: n ? winsB/n : null, scoreRateA: n ? (winsA + draws/2)/n : null,
    firstPlayerWinRate: n ? clean.filter(r => r.winner === 'P1').length/n : null,
    meanScoreDifference: average, medianScoreDifference: n ? (differences[Math.floor((n-1)/2)] + differences[Math.floor(n/2)])/2 : null,
    scoreVariance: n > 1 ? differences.reduce((sum,v) => sum+(v-average)**2,0)/(n-1) : null,
    meanTurns: n ? clean.reduce((s,r) => s+r.turns,0)/n : null,
    meanMiniTurns: n ? clean.reduce((s,r) => s+r.miniTurns,0)/n : null,
    meanDecisions: n ? clean.reduce((s,r) => s+r.decisions,0)/n : null,
    meanGameDurationMs: n ? clean.reduce((s,r) => s+r.durationMs,0)/n : null,
    pairCount, pairedScore, pairedScoreInterval95: pairCount ? [Math.max(0, pairedScore-radius), Math.min(1, pairedScore+radius)] : null,
    uncertainty: pairCount < 100 ? 'SMALL_SAMPLE' : 'BOUNDED_ESTIMATE', actionCounts, abortReasons };
}
