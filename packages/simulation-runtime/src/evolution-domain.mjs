import { hashCanonical } from '@intrilex/shared';
import { WEIGHTED_POLICY_ID, validatePolicyState, baselinePolicyState } from '../../policies/src/weighted-heuristic.mjs';
import { validateStrategicTelemetry } from './strategic-telemetry.mjs';
import { validateDecisionEvent } from './strategy-contracts.mjs';
import { validateAdaptiveConfig, validateAdaptiveTelemetry } from './adaptive-strategy.mjs';

/** @typedef {{schemaVersion:number, fingerprint:string, engineHash:string, policyImplementationHash:string, runtimeHash:string, engineVersion:string, rulesVersion:string}} RulesetFingerprint */
/** @typedef {{checkpointId:string, agentId:string, lineageId:string, generation:number, parentCheckpointId:string|null, policyId:string, policyVersion:string, policyState:object, identity:RulesetFingerprint, createdAt:string}} AgentCheckpoint */
/** @typedef {{ordinal:number, swapped:boolean, seed:number, checkpointIds:string[], winner:string, terminationReason:string, finalStateHash:string, actionSequenceHash:string}} MatchResult */
/** @typedef {{schemaVersion:number, runId:string, kind:string, config:object, identity:RulesetFingerprint, checkpoints:AgentCheckpoint[], records:MatchResult[], replays:object[], status:string}} SimulationRun */

export const LAB_SCHEMA = 1;
export const FROZEN_POLICIES = Object.freeze(['random-legal', 'score-rush', 'control', 'tempo', 'value']);
export const STATIC_POLICIES = Object.freeze([...FROZEN_POLICIES, 'score-rush-tactical', 'control-tactical', 'tempo-tactical', 'value-tactical', 'control-conversion-tactical']);
export const staticPolicyVersion = id => id === 'control-conversion-tactical' ? '5.0.0' : FROZEN_POLICIES.includes(id) ? '2.0.0' : STATIC_POLICIES.includes(id) ? '4.0.0' : null;
export const LAB_POLICIES = Object.freeze([...STATIC_POLICIES, WEIGHTED_POLICY_ID]);
export const LAB_PROFILES = Object.freeze(['core-advanced-authority', 'core-unrestricted-authority', 'first-contact-trigger-closure']);
// importBytes bounds *external* JSON an operator chooses to ingest — a
// fail-fast guard so a pathological file cannot stall the tab on JSON.parse,
// sized to admit telemetry-heavy artifacts (deep decision records run ~80 KiB
// per game). Artifacts beyond this bound are meant to travel as compact
// manifests or per-run artifacts instead. Locally generated runs are valid
// evidence and get their own persistence budget; browser quota errors remain
// a separate failure class.
export const LAB_LIMITS = Object.freeze({ games: 10000, workers: 4, decisions: 1800, replays: 12, commands: 12000, importBytes: 256 * 1024 * 1024, persistRunBytes: 128 * 1024 * 1024 });
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
  if (!LAB_POLICIES.includes(botA) || !LAB_POLICIES.includes(botB)) fail('POLICY_NOT_ADMITTED');
  if (!LAB_PROFILES.includes(profileId)) fail('PROFILE_NOT_ADMITTED');
  if (!Number.isInteger(gameCount) || gameCount < 1 || gameCount > LAB_LIMITS.games) fail('INVALID_GAME_COUNT');
  if (!uint(seed)) fail('INVALID_SEED');
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > LAB_LIMITS.workers) fail('INVALID_WORKER_COUNT');
  if (typeof mirrorSeats !== 'boolean' || !['SELF_PLAY', 'EVALUATION'].includes(kind)) fail('INVALID_RUN_KIND');
  if (kind === 'EVALUATION' && (!mirrorSeats || gameCount % 2)) fail('EVALUATION_REQUIRES_COMPLETE_PAIRS');
  if (input.seedCatalog !== undefined && (!Array.isArray(input.seedCatalog) || input.seedCatalog.length !== gameCount/2 || !mirrorSeats || gameCount%2 || input.seedCatalog.some(s=>!uint(s)||s===0) || new Set(input.seedCatalog).size !== input.seedCatalog.length)) fail('INVALID_SEED_CATALOG');
  if (input.strategicTrace !== undefined && typeof input.strategicTrace !== 'boolean') fail('INVALID_TRACE_OPTION');
  return { ...(input.strategicTrace === undefined ? {} : {strategicTrace:input.strategicTrace}), ...(input.seedCatalog === undefined ? {} : {seedCatalog:[...input.seedCatalog]}), botA, botB, profileId, gameCount, seed: seed || 1, workerCount, mirrorSeats, kind, decisionLimit: LAB_LIMITS.decisions, orchestrationCommandLimit: 256 };
}

export function labGameSeed(baseSeed, ordinal, mirrored = true) {
  // Paired seat swaps reuse game randomness; game and policy streams remain separate.
  const pair = mirrored ? Math.floor(ordinal / 2) : ordinal;
  return (Number.parseInt(hashCanonical({ stream: 'EVOLUTION_LAB_V1', baseSeed: baseSeed || 1, pair }).slice(0, 8), 16) >>> 0) || 1;
}

export function gamePlan(config, ordinal) {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= config.gameCount) fail('ORDINAL_OUT_OF_RANGE');
  const swapped = config.mirrorSeats && ordinal % 2 === 1;
  return { ordinal, swapped, seed: config.seedCatalog?.[Math.floor(ordinal/2)] ?? labGameSeed(config.seed, ordinal, config.mirrorSeats),
    policyIds: swapped ? [config.botB, config.botA] : [config.botA, config.botB] };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}

export function createCheckpoint({ policyId, identity, agentId, lineageId = agentId, parentCheckpointId = null, createdAt = new Date().toISOString() }) {
  assertIdentity(identity);
  if (!STATIC_POLICIES.includes(policyId) || typeof agentId !== 'string' || !agentId || typeof lineageId !== 'string' || !lineageId) fail('INVALID_CHECKPOINT_POLICY');
  const body = { schemaVersion: LAB_SCHEMA, policyId, policyVersion: staticPolicyVersion(policyId), policyImplementationHash: identity.policyImplementationHash,
    agentId, lineageId, parentCheckpointId, generation: 0, createdAt, policyState: {}, trainingConfiguration: null,
    identity: structuredClone(identity), tags: ['frozen', 'baseline'], protected: true };
  return deepFreeze({ ...body, checkpointId: `CP-${hashCanonical(body)}` });
}

export function validateCheckpoint(checkpoint, identity) {
  if (checkpoint?.schemaVersion === 2) return validateTrainableCheckpoint(checkpoint,identity);
  if (!checkpoint || checkpoint.schemaVersion !== LAB_SCHEMA) fail('INVALID_CHECKPOINT');
  assertIdentity(checkpoint.identity, identity);
  const { checkpointId, ...body } = checkpoint;
  if (checkpointId !== `CP-${hashCanonical(body)}`) fail('CHECKPOINT_HASH_MISMATCH');
  if (!STATIC_POLICIES.includes(body.policyId) || body.policyVersion !== staticPolicyVersion(body.policyId) || body.policyImplementationHash !== identity.policyImplementationHash || body.generation !== 0 || body.trainingConfiguration !== null || Object.keys(body.policyState ?? {}).length) fail('INCOMPATIBLE_CHECKPOINT');
  if (typeof body.agentId !== 'string' || !body.agentId || typeof body.lineageId !== 'string' || !Number.isFinite(Date.parse(body.createdAt))) fail('INVALID_CHECKPOINT_METADATA');
  return deepFreeze(structuredClone(checkpoint));
}

export function createLabRun(input, identity, createdAt = new Date().toISOString()) {
  assertIdentity(identity);
  const config = labConfig(input);
  const runId = `EL-${hashCanonical({ config, fingerprint: identity.fingerprint, createdAt }).slice(0, 24)}`;
  const checkpoints = ['A', 'B'].map((seat, i) => { const policyId=i ? config.botB : config.botA; const args={identity,agentId:`${runId}:${seat}`,createdAt}; return policyId===WEIGHTED_POLICY_ID ? createTrainableCheckpoint({...args,policyState:baselinePolicyState()}) : createCheckpoint({...args,policyId}); });
  return { schemaVersion: LAB_SCHEMA, runId, kind: config.kind, config, identity: structuredClone(identity), checkpoints,
    records: [], replays: [], bookmarks: [], notes: '', status: 'IDLE', createdAt, elapsedMs: 0 };
}

function checkpointSemanticBody(checkpoint) {
  const {checkpointId:_checkpointId,createdAt:_createdAt,tags:_tags,protected:_protectedFlag,favorite:_favorite,...semantic}=checkpoint;
  return semantic;
}
export function createTrainableCheckpoint({identity,agentId,lineageId=agentId,parent=null,policyState,trainingConfiguration=null,mutation=null,experimentId=null,adaptive,createdAt=new Date().toISOString()}) {
  assertIdentity(identity); validatePolicyState(policyState);
  if(parent) { validateCheckpoint(parent,identity); if(parent.schemaVersion!==2 || parent.lineageId!==lineageId) fail('INVALID_CHECKPOINT_PARENT'); }
  // Adaptive strategy is a checkpoint-level strategic layer, not part of the
  // genome digest. Descendants inherit it by default so training lineages keep
  // the parent's posture rules until an authored edit or a future optimizer
  // mutates them; an explicit null clears it.
  const adaptiveConfig = adaptive === undefined ? (parent?.adaptive ?? null) : adaptive;
  const body={schemaVersion:2,policyId:WEIGHTED_POLICY_ID,policyVersion:'1.0.0',policyImplementationHash:identity.policyImplementationHash,
    agentId,lineageId,parentCheckpointId:parent?.checkpointId ?? null,generation:parent ? parent.generation+1 : 0,
    policyState:structuredClone(policyState),trainingConfiguration:structuredClone(trainingConfiguration),mutation:structuredClone(mutation),
    ...(adaptiveConfig != null ? { adaptive: structuredClone(validateAdaptiveConfig(adaptiveConfig)) } : {}),
    experimentId,identity:structuredClone(identity),createdAt,tags:parent ? ['experimental'] : ['baseline'],protected:!parent,favorite:false};
  const checkpoint={...body,checkpointId:`CP2-${hashCanonical(checkpointSemanticBody(body))}`};
  return validateTrainableCheckpoint(checkpoint,identity);
}
function validateTrainableCheckpoint(checkpoint,identity) {
  assertIdentity(checkpoint.identity,identity); validatePolicyState(checkpoint.policyState);
  if(checkpoint.adaptive!=null)validateAdaptiveConfig(checkpoint.adaptive);
  if(checkpoint.policyId!==WEIGHTED_POLICY_ID || checkpoint.policyVersion!=='1.0.0' || checkpoint.policyImplementationHash!==identity.policyImplementationHash || checkpoint.checkpointId!==`CP2-${hashCanonical(checkpointSemanticBody(checkpoint))}`) fail('INCOMPATIBLE_CHECKPOINT');
  if(typeof checkpoint.agentId!=='string' || !checkpoint.agentId || typeof checkpoint.lineageId!=='string' || !checkpoint.lineageId || !Number.isInteger(checkpoint.generation) || checkpoint.generation<0 || !Number.isFinite(Date.parse(checkpoint.createdAt)) || (checkpoint.generation===0 ? checkpoint.parentCheckpointId!==null : !/^CP2-[a-f0-9]{64}$/.test(checkpoint.parentCheckpointId))) fail('INVALID_CHECKPOINT_METADATA');
  return deepFreeze(structuredClone(checkpoint));
}

/** Read-only old artifacts retain their original identities. Execution still
 * requires validateArtifact(envelope, currentIdentity), which fails closed. */
export function inspectHistoricalArtifact(envelope) {
  const run=validateArtifact(envelope,envelope?.payload?.identity);
  return {...run,archival:true,evidenceOrigin:'IMPORTED_UNVERIFIED'};
}

// Retained telemetry must round-trip byte-identically through JSON artifacts —
// drop undefined-valued properties so in-memory records equal restored ones.
const jsonClean = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    seatBehavior: summary.perSeatStats?.map((p,i)=>({playerId:`P${i+1}`,decisions:p.policyDecisionCount,actionCounts:p.decisionFamilyCounts ?? {},mechanicCounts:p.mechanicCounts ?? {},...(p.actionCoverage?{actionCoverage:p.actionCoverage}:{})})) ?? [],
    // Full observatory-grade telemetry is retained when the engine summary
    // provides it, so saved/imported records can feed Mechanics, Synergies and
    // Ranks through the observatory bridge without re-execution.
    ...(summary.participants ? {participants:jsonClean(summary.participants)} : {}),
    ...(summary.rankDecisions ? {rankDecisions:jsonClean(summary.rankDecisions)} : {}),
    ...(summary.mechanicOpportunityCounts ? {mechanicOpportunityCounts:jsonClean(summary.mechanicOpportunityCounts)} : {}),
    ...(summary.primaryMechanicCounts ? {primaryMechanicCounts:jsonClean(summary.primaryMechanicCounts)} : {}),
    ...(summary.primaryMechanicOpportunityCounts ? {primaryMechanicOpportunityCounts:jsonClean(summary.primaryMechanicOpportunityCounts)} : {}),
    ...(summary.decisionFamilyCounts ? {decisionFamilyCounts:jsonClean(summary.decisionFamilyCounts)} : {}),
    ...(summary.eventTypeCounts ? {eventTypeCounts:jsonClean(summary.eventTypeCounts)} : {}),
    ...(summary.responseOpportunityCount!=null?{responseOpportunityCount:summary.responseOpportunityCount}:{}) ,
    ...(summary.responsePlayedCount!=null?{responsePlayedCount:summary.responsePlayedCount}:{}) ,
    ...(summary.responseDeclinedWithOptionsCount!=null?{responseDeclinedWithOptionsCount:summary.responseDeclinedWithOptionsCount}:{}) ,
    ...(summary.meaningfulResponseDecisionCount!=null?{meaningfulResponseDecisionCount:summary.meaningfulResponseDecisionCount}:{}) ,
    ...(summary.miniTurnActionCount!=null?{miniTurnActionCount:summary.miniTurnActionCount}:{}) ,
    ...(summary.exhaustedPassActionCount!=null?{exhaustedPassActionCount:summary.exhaustedPassActionCount}:{}) ,
    ...(summary.triggerCount!=null?{triggerCount:summary.triggerCount}:{}) ,
    ...(summary.strategicTelemetry ? {strategicTelemetry:summary.strategicTelemetry} : {}),
    ...(summary.adaptiveTelemetry ? {adaptiveTelemetry:jsonClean(summary.adaptiveTelemetry)} : {}),
    ...(summary.comboTelemetry ? {comboTelemetry:jsonClean(summary.comboTelemetry)} : {}),
    ...(summary.strategyDecisions ? {strategyDecisions:summary.strategyDecisions} : {}),
    ...(summary.terminalEvidence ? {terminalEvidence:summary.terminalEvidence} : {}),
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
  if(record.strategicTelemetry!==undefined)validateStrategicTelemetry(record.strategicTelemetry,record.decisions);
  if(record.adaptiveTelemetry!==undefined)validateAdaptiveTelemetry(record.adaptiveTelemetry);
  if(record.strategyDecisions!==undefined) {
    if(!Array.isArray(record.strategyDecisions) || record.strategyDecisions.length!==record.decisions) fail('STRATEGY_DECISION_COUNT_MISMATCH');
    for(const [i,event] of record.strategyDecisions.entries()) {
      validateDecisionEvent(event);
      const s=event.seat-1;
      if(event.decisionOrdinal!==i || event.identity.runId!==run.runId || event.identity.gameOrdinal!==record.ordinal || event.identity.derivedSeed!==record.seed || event.identity.fingerprint!==run.identity.fingerprint || event.identity.rulesProfile!==run.config.profileId || event.identity.policyId!==record.policyIds[s] || event.identity.checkpointId!==record.checkpointIds[s] || event.replayAnchor.initialStateHash!==record.initialStateHash || event.replayAnchor.actionSequenceHash!==record.actionSequenceHash || event.replayAnchor.finalStateHash!==record.finalStateHash || event.outcomes.terminalWinner!==record.winner || event.outcomes.terminationReason!==record.terminationReason) fail('STRATEGY_RECORD_MISMATCH');
    }
  }
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

export function createSeriesAggregator() {
  return {
    completed: 0,        // all games that produced a record (incl. aborted)
    completedClean: 0,   // canonically completed games
    winsA: 0,
    winsB: 0,
    draws: 0,
    unresolved: 0,       // completed without a winner or draw (defensive)
    aborted: 0,
    seat1Wins: 0,
    seat2Wins: 0,
    scoreSumA: 0,
    scoreSumB: 0,
    turnsSum: 0,
    decisionsSum: 0,
    abortReasons: {},
  };
}

/** Fold one slim game record into the accumulator. Returns the accumulator. */
export function ingestGameRecord(agg, g) {
  agg.completed += 1;
  if (!CLEAN_REASONS.includes(g.terminationReason)) {
    agg.aborted += 1;
    const reason = String(g.terminationReason ?? 'UNKNOWN');
    agg.abortReasons[reason] = (agg.abortReasons[reason] ?? 0) + 1;
    return agg;
  }
  agg.completedClean += 1;
  const winnerSeat = g.winner === 'P1' ? 1 : g.winner === 'P2' ? 2 : null;
  if (winnerSeat === 1) agg.seat1Wins += 1;
  else if (winnerSeat === 2) agg.seat2Wins += 1;
  if (winnerSeat === null) {
    if (g.terminationReason === 'CANONICAL_DRAW' || g.winner === 'DRAW') agg.draws += 1;
    else agg.unresolved += 1;
  } else {
    const botAWon = (!g.swapped && winnerSeat === 1) || (g.swapped && winnerSeat === 2);
    if (botAWon) agg.winsA += 1; else agg.winsB += 1;
  }
  agg.scoreSumA += g.swapped ? g.scoreP2 : g.scoreP1;
  agg.scoreSumB += g.swapped ? g.scoreP1 : g.scoreP2;
  agg.turnsSum += g.turns;
  agg.decisionsSum += g.decisions;
  return agg;
}

/**
 * Derived metrics. elapsedMs is wall-clock time of the series so far
 * (live) or total (finished). All rates are null-safe for empty series.
 */
export function seriesMetrics(agg, elapsedMs) {
  const clean = agg.completedClean || 0;
  const ratio = (n, d) => (d > 0 ? n / d : null);
  const seconds = Number(elapsedMs) / 1000;
  return {
    gamesCompleted: agg.completed,
    gamesClean: clean,
    winsA: agg.winsA,
    winsB: agg.winsB,
    draws: agg.draws,
    unresolved: agg.unresolved,
    aborted: agg.aborted,
    abortReasons: { ...agg.abortReasons },
    winPctA: ratio(agg.winsA, clean),
    winPctB: ratio(agg.winsB, clean),
    drawPct: ratio(agg.draws, clean),
    seat1Wins: agg.seat1Wins,
    seat2Wins: agg.seat2Wins,
    seat1WinPct: ratio(agg.seat1Wins, clean),
    seat2WinPct: ratio(agg.seat2Wins, clean),
    avgScoreA: ratio(agg.scoreSumA, clean),
    avgScoreB: ratio(agg.scoreSumB, clean),
    avgScoreDiff: clean > 0 ? (agg.scoreSumA - agg.scoreSumB) / clean : null,
    avgTurns: ratio(agg.turnsSum, clean),
    avgDecisions: ratio(agg.decisionsSum, clean),
    gamesPerSec: seconds > 0 && agg.completed > 0 ? agg.completed / seconds : null,
  };
}
