import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createSimulationState, createSimulationDecisionFrame, executeSimulationAction, strictPolicyView } from '@intrilex/engine-adapter';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { validateCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { prepareInformationStudy, executeInformationStudy } from '../packages/simulation-runtime/src/strategy-information.mjs';

// Real matched-world studies at increasing world budgets. This measures actual
// continuation cost; it is not a projected benchmark.
const counts = (process.argv[2] ?? '64').split(',').map(Number);
const authority = { createState: createSimulationState, frame: s => createSimulationDecisionFrame(s, 256), execute: executeSimulationAction, view: strictPolicyView, validateCheckpoint };
const identity = await evolutionIdentity();
const { run } = await runLabSeries({ botA: 'value', botB: 'tempo', gameCount: 2, seed: 1337, workerCount: 1, strategicTrace: true, kind: 'EVALUATION', mirrorSeats: true }, { identity, createdAt: '2026-10-04T18:00:00.000Z' });
const event = run.records[0].strategyDecisions[0], replay = run.replays[0].replay;
const results = [];
for (const worldCount of counts) {
  const input = { event, replay, identity, authority, checkpoints: run.checkpoints, worldCount, seeds: [101, 102], decisionLimit: 300 };
  const started = performance.now();
  const prepared = prepareInformationStudy(input);
  const study = await executeInformationStudy({ ...input, ...prepared, continueMatch: runPolicyMatch });
  const ms = performance.now() - started;
  results.push({
    worldsRequested: worldCount, worldsAccepted: study.counts.hiddenWorlds, worldsRejected: study.plan.worldManifest.rejected,
    actionBranches: study.counts.actionBranches, continuationsPerWorld: study.counts.continuationsPerWorld,
    executions: study.counts.executions, faults: study.faults, status: study.status,
    elapsedMs: Math.round(ms * 10) / 10, executionsPerSecond: Math.round(study.counts.executions / (ms / 1000) * 100) / 100,
    worldsPerSecond: Math.round(study.counts.hiddenWorlds / (ms / 1000) * 100) / 100,
    studyBytes: Buffer.byteLength(JSON.stringify(study)),
    inferenceMethod: study.plan.inferenceMethod,
    effects: study.comparisons.map(c => ({ actionId: c.actionId, delta: c.delta, interval: c.interval, heterogeneity: c.heterogeneity })),
  });
  console.log(`worlds=${worldCount} exec=${study.counts.executions} ms=${Math.round(ms)} exec/s=${results.at(-1).executionsPerSecond} bytes=${results.at(-1).studyBytes} status=${study.status}`);
}
await mkdir('reports/local/strategy/information', { recursive: true });
const report = { date: '2026-10-04', timezone: 'America/New_York', node: process.version, platform: os.platform(), cpu: os.cpus()[0]?.model, fingerprint: identity.fingerprint, sourceEventId: event.artifactId, results };
await writeFile(`reports/local/strategy/information/benchmark-${counts.join('-')}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
