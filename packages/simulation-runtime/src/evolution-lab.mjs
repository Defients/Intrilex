import { runPolicyMatch } from './runtime.mjs';
import { createSimulationState, createAuthorityCertifiedReplay, verifyAuthorityCertifiedReplay, authorityHashCanonical } from '@intrilex/engine-adapter';
import { evolutionIdentity } from '../../../scripts/evolution-identity.mjs';
import { Worker } from 'node:worker_threads';
import { setImmediate } from 'node:timers';
import { createLabRun, gamePlan, gameEvidence, gameFault, validateRecord, validateReplay, validateCheckpoint, retainReplay, summarizeRecords, validateArtifact, artifactEnvelope } from './evolution-domain.mjs';

export { evolutionIdentity, createLabRun, gamePlan, summarizeRecords, validateArtifact, artifactEnvelope };

export function runLabGame(run, ordinal) {
  const plan = gamePlan(run.config, ordinal);
  const started = performance.now();
  try {
    const result = runPolicyMatch({ ...plan, profileId: run.config.profileId, includeReplay: true,
      decisionLimit: run.config.decisionLimit, orchestrationCommandLimit: run.config.orchestrationCommandLimit, telemetryEnabled: false, replayMode: 'commands' });
    const record = gameEvidence(result.summary, plan, run, result.replay, performance.now()-started);
    validateRecord(record, run);
    return { record, replay: result.replay };
  } catch (error) { return { record: gameFault(error, plan, run, performance.now()-started), replay: null }; }
}

export function verifyLabReplay(run, evidence) {
  const record = run.records.find(r => r.ordinal === evidence.ordinal);
  if (!record) throw new Error('REPLAY_RECORD_MISSING');
  const replay = validateReplay(evidence, record, run);
  const state = createSimulationState({ profileId: run.config.profileId, playerIds: ['P1', 'P2'], seatOrder: ['P1', 'P2'], enabledModules: [], seed: record.seed });
  if (authorityHashCanonical(state) !== record.initialStateHash) throw new Error('SEED_INITIAL_STATE_MISMATCH');
  const certified = replay.format === 'intrilex-replay' ? replay : createAuthorityCertifiedReplay(record.replayId, replay.initialState, replay.commands, run.identity.engineVersion);
  const verified = verifyAuthorityCertifiedReplay(certified);
  if (authorityHashCanonical(verified.state) !== record.finalStateHash) throw new Error('REPLAY_FINAL_STATE_MISMATCH');
  return verified;
}

export async function runLabSeries(input, { onProgress = () => {}, identity, signal, startingCheckpoints, createdAt } = {}) {
  const run = createLabRun(input, identity ?? await evolutionIdentity(), createdAt);
  if (startingCheckpoints) {
    if (startingCheckpoints.length !== 2) throw new Error('CHECKPOINT_PAIR_REQUIRED');
    run.checkpoints = startingCheckpoints.map(cp => validateCheckpoint(cp, run.identity));
    if (run.checkpoints[0].policyId !== run.config.botA || run.checkpoints[1].policyId !== run.config.botB) throw new Error('CHECKPOINT_CONFIG_MISMATCH');
  }
  run.status = 'RUNNING';
  const start = performance.now();
  const record = evidence => {
    validateRecord(evidence.record, run);
    run.records.push(evidence.record); retainReplay(run, evidence);
    onProgress({ completed: run.records.length, total: run.config.gameCount, record: evidence.record });
  };
  if (run.config.workerCount === 1) {
    for (let ordinal = 0; ordinal < run.config.gameCount; ordinal += 1) {
      if (signal?.aborted) { run.status = 'STOPPED'; break; }
      record(runLabGame(run, ordinal));
      if (ordinal % 10 === 9) await new Promise(resolve => setImmediate(resolve));
    }
  } else {
    await new Promise((resolve, reject) => {
      let next = 0, done = false;
      const workers = [], timers = new Map();
      const finish = error => {
        if (done) return; done = true;
        signal?.removeEventListener('abort', cancel);
        for (const timer of timers.values()) clearTimeout(timer);
        Promise.allSettled(workers.map(w => w.terminate())).then(() => error ? reject(error) : resolve());
      };
      const cancel = () => { run.status = 'STOPPED'; finish(); };
      const dispatch = worker => {
        if (next < run.config.gameCount) {
          const ordinal = next++; worker.postMessage(ordinal);
          timers.set(worker, setTimeout(() => finish(new Error(`WORKER_TIMEOUT:${ordinal}`)), 30000));
        }
      };
      if (signal?.aborted) { cancel(); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      for (let index = 0; index < Math.min(run.config.workerCount,run.config.gameCount); index += 1) {
        const worker = new Worker(new URL('./evolution-node-worker.mjs', import.meta.url), { workerData: { run }, execArgv: [] });
        workers.push(worker);
        worker.on('message', evidence => {
          if (done) return;
          clearTimeout(timers.get(worker)); timers.delete(worker);
          try { record(evidence); if (run.records.length === run.config.gameCount) finish(); else dispatch(worker); }
          catch (error) { finish(error); }
        });
        worker.on('error', finish);
        worker.on('exit', code => { if (!done && code !== 0) finish(new Error(`WORKER_EXIT:${code}`)); });
        dispatch(worker);
      }
    }).catch(error => { run.status = 'ERROR'; run.error = String(error.stack ?? error).slice(0, 2000); });
  }
  run.elapsedMs = performance.now()-start;
  if (run.status === 'RUNNING') run.status = 'COMPLETE';
  return { run, metrics: summarizeRecords(run.records), gamesPerSecond: run.records.length/(run.elapsedMs/1000) };
}

/** Evaluation never calls update/train hooks; admitted checkpoints describe frozen policies. */
export async function runFrozenEvaluation({ candidate, benchmarks, gameCount = 100, seed = 1, profileId = 'core-advanced-authority', workerCount = 1 }, options = {}) {
  const identity = options.identity ?? await evolutionIdentity();
  validateCheckpoint(candidate, identity);
  if (!Array.isArray(benchmarks) || !benchmarks.length || benchmarks.length > 8) throw new Error('INVALID_BENCHMARK_SUITE');
  const results = [];
  for (const benchmark of benchmarks) {
    validateCheckpoint(benchmark, identity);
    results.push(await runLabSeries({ botA:candidate.policyId, botB:benchmark.policyId, gameCount, seed, profileId, workerCount, kind:'EVALUATION', mirrorSeats:true }, { ...options, identity, startingCheckpoints:[candidate,benchmark] }));
    if (options.signal?.aborted) break;
  }
  return { schemaVersion:1, kind:'FROZEN_EVALUATION_SUITE', candidateCheckpointId:candidate.checkpointId, benchmarkCheckpointIds:benchmarks.map(c => c.checkpointId), results };
}
