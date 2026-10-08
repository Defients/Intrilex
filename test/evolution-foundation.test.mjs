import * as browserCapacity from '../packages/simulation-runtime/src/browser-capacity.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '@intrilex/shared';
import { evolutionIdentity, runLabGame, verifyLabReplay, runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { createLabRun, createCheckpoint, validateCheckpoint, labConfig, gamePlan, artifactEnvelope, validateArtifact, summarizeRecords, gameFault, retainReplay, LAB_LIMITS } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { EvolutionSession } from '../packages/simulation-runtime/src/evolution-session.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setAppActions, invokeAppAction, clearRenderer } from '../apps/lab-web/src/rerender.js';

const identity=await evolutionIdentity();
const input={botA:'random-legal',botB:'score-rush',gameCount:12,seed:42,workerCount:1,mirrorSeats:true};
const create=over => createLabRun({...input,...over},identity,'2026-10-02T16:00:00.000Z');
const semanticRecord=({durationMs:_durationMs,...record}) => record;
const semanticMetrics=({meanGameDurationMs:_meanGameDurationMs,...metrics}) => metrics;

// Execute the browser adapters with their real domain dependencies; only host
// boundaries (IndexedDB and Workers) are controlled to reproduce lifecycle races.
async function browserAdapter(file, expression, globals = {}) {
  const source = (await readFile(file, 'utf8')).replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
  return runInNewContext(`${source}\n${expression}`, {
    ...browserCapacity, createLabRun, validateCheckpoint, summarizeRecords, LAB_LIMITS,
    EvolutionSession, performance, setTimeout, clearTimeout, TextEncoder, ...globals,
  });
}

async function storageHarness() {
  const requests = [];
  const Store = await browserAdapter('apps/lab-web/src/evolution/evolution-store.mjs', 'EvolutionStore');
  const store = new Store(identity, { open() { const request = {}; requests.push(request); return request; } });
  const connection = () => ({ closed: 0, close() { this.closed++; } });
  return { store, requests, connection };
}

test('storage shares a concurrent open and retries after a failed request', async () => {
  const { store, requests, connection } = await storageHarness();
  const first = store.open(), second = store.open();
  assert.equal(requests.length, 1, 'one physical connection request for concurrent callers');
  const db = connection(); requests[0].result = db; requests[0].onsuccess();
  assert.equal(await first, db); assert.equal(await second, db);
  db.onversionchange(); assert.equal(db.closed, 1); assert.equal(store.db, null);
  const failed = store.open(), rejection = assert.rejects(failed, /OPEN_FAILED/);
  requests[1].error = new Error('OPEN_FAILED'); requests[1].onerror(); await rejection;
  const retry = store.open(); assert.equal(requests.length, 3);
  requests[2].result = connection(); requests[2].onsuccess(); await retry; store.close();
});

test('storage closes a late blocked connection without replacing a successful retry', async () => {
  const { store, requests, connection } = await storageHarness();
  const blocked = store.open(), rejection = assert.rejects(blocked, /LAB_STORAGE_BLOCKED/);
  requests[0].onblocked(); await rejection;
  const retry = store.open(), current = connection(); requests[1].result = current; requests[1].onsuccess(); await retry;
  const late = connection(); requests[0].result = late; requests[0].onsuccess();
  assert.equal(late.closed, 1); assert.equal(store.db, current); store.close();
});

test('closing storage settles its pending open and rejects a late connection', async () => {
  const { store, requests, connection } = await storageHarness();
  const pending = store.open(), rejection = assert.rejects(pending, /LAB_STORAGE_CLOSED/);
  store.close();
  const late = connection(); requests[0].result = late; requests[0].onsuccess();
  await rejection; assert.equal(late.closed, 1); assert.equal(store.db, null);
});

test('worker decoding faults settle partial results promptly and release every worker', async () => {
  const workers = [];
  class ControlledWorker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  }
  const execute = await browserAdapter('apps/lab-web/src/evolution/evolution-browser-runner.mjs', 'executeBrowserSeries', { Worker: ControlledWorker });
  const controller = new AbortController();
  const pending = execute({ ...input, gameCount: 4, workerCount: 2 }, { identity, signal: controller.signal });
  assert.equal(typeof workers[1].onmessageerror, 'function', 'decode errors have an explicit handler');
  const evidence = runLabGame({ ...workers[0].message.run }, 0);
  workers[0].onmessage({ data: { type: 'evolution-evidence', epoch: workers[0].message.epoch, evidence } });
  workers[1].onmessageerror();
  const result = await pending;
  assert.equal(result.run.status, 'ERROR'); assert.match(result.run.error, /WORKER_MESSAGE_FAILED/);
  assert.equal(result.run.records.length, 1); assert.ok(workers.every(w => w.terminated));
  controller.abort();
  workers[0].onmessage({ data: { type: 'evolution-evidence', epoch: workers[0].message.epoch, evidence } });
  assert.equal(result.run.records.length, 1); assert.equal(result.run.status, 'ERROR');
});

test('research cancellation keeps accepted evidence and ignores a late progress exception', async () => {
  const workers = [];
  class ControlledWorker {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  }
  const execute = await browserAdapter('apps/lab-web/src/evolution/evolution-browser-runner.mjs', 'executeBrowserSeries', { Worker: ControlledWorker });
  const controller = new AbortController();
  const pending = execute({ ...input, gameCount: 4 }, { identity, signal: controller.signal,
    onProgress() { controller.abort(); throw new Error('departed progress view'); } });
  const message = workers[0].message, evidence = runLabGame(message.run, 0);
  workers[0].onmessage({ data: { type: 'evolution-evidence', epoch: message.epoch, evidence } });
  const result = await pending;
  assert.equal(result.run.status, 'STOPPED'); assert.equal(result.run.records.length, 1);
  assert.ok(workers[0].terminated); assert.equal(result.run.error, undefined);
  const before = workers.length, alreadyStopped = new AbortController(); alreadyStopped.abort();
  const cancelled = await execute(input, { identity, signal: alreadyStopped.signal });
  assert.equal(cancelled.run.status, 'STOPPED'); assert.equal(workers.length, before);
});

test('obsolete storage upgrades abort without altering a retry connection', async () => {
  const { store, requests, connection } = await storageHarness();
  const pending = store.open(), rejection = assert.rejects(pending, /LAB_STORAGE_CLOSED/);
  store.close(); await rejection;
  const retry = store.open(), current = connection(); requests[1].result = current; requests[1].onsuccess(); await retry;
  let aborted = 0;
  requests[0].transaction = { abort() { aborted++; } };
  requests[0].onupgradeneeded(); assert.equal(aborted, 1); assert.equal(store.db, current);
  const next = store.open(); assert.equal(await next, current); store.close();
});

test('storage retries a synchronous open failure without retaining a rejected request', async () => {
  const Store = await browserAdapter('apps/lab-web/src/evolution/evolution-store.mjs', 'EvolutionStore');
  let attempts = 0, request;
  const store = new Store(identity, { open() { if (++attempts === 1) throw new Error('OPEN_DENIED'); request = {}; return request; } });
  await assert.rejects(store.open(), /OPEN_DENIED/);
  const retry = store.open(), db = { close() {} }; request.result = db; request.onsuccess();
  assert.equal(await retry, db); assert.equal(attempts, 2); store.close();
});

test('lab admission rejects unsupported policy/profile and incomplete evaluation pairs', () => {
  for (const over of [{botA:'hybrix-rusher'},{botA:'bogus'},{profileId:'core-bogus'},{gameCount:0},{seed:NaN},{workerCount:5},{kind:'EVALUATION',gameCount:3},{kind:'EVALUATION',mirrorSeats:false}]) assert.throws(() => labConfig({...input,...over}));
  assert.equal(labConfig({...input,seed:0}).seed,1);
});
test('global controls use the registered app graph and preserve callback arguments', async () => {
  let calls=[];
  setAppActions({showExtract:format => calls.push(format)});
  invokeAppAction('showExtract','json'); assert.deepEqual(calls,['json']);
  const source=await readFile('apps/lab-web/src/experiment-controls.js','utf8');
  assert.doesNotMatch(source,/import\(['"]\.\/app\.js['"]\)/);
  clearRenderer(); assert.throws(() => invokeAppAction('showExtract','json'),/APP_ACTION_UNAVAILABLE/);
});
test('lab paired evaluation reuses seed and swaps agent identities equally', () => {
  const run=create({kind:'EVALUATION'});
  for (let ordinal=0;ordinal<12;ordinal+=2) {
    const a=gamePlan(run.config,ordinal),b=gamePlan(run.config,ordinal+1);
    assert.equal(a.seed,b.seed); assert.deepEqual(a.policyIds,[...b.policyIds].reverse());
  }
});
test('checkpoint frozen state round trip rejects tampering and incompatible implementation', () => {
  const cp=createCheckpoint({policyId:'control',agentId:'A',identity,createdAt:'2026-10-02T16:00:00.000Z'});
  assert.ok(Object.isFrozen(cp)); assert.ok(Object.isFrozen(cp.policyState));
  assert.deepEqual(validateCheckpoint(JSON.parse(JSON.stringify(cp)),identity),cp);
  assert.throws(() => validateCheckpoint({...cp,policyId:'tempo'},identity),/CHECKPOINT_HASH/);
  assert.throws(() => validateCheckpoint(cp,{...identity,fingerprint:'a'.repeat(64)}),/INCOMPATIBLE/);
  const clones=create({botA:'control',botB:'control'}).checkpoints;
  assert.deepEqual(clones[0].policyState,clones[1].policyState);
  assert.equal(clones[0].policyImplementationHash,clones[1].policyImplementationHash);
  assert.notEqual(clones[0].lineageId,clones[1].lineageId);
});
test('32 seeds reproduce exact initial shuffle, commands, terminal state and semantic evidence', () => {
  for (let seed=1;seed<=32;seed+=1) {
    const run=create({seed,gameCount:2}), first=runLabGame(run,0),second=runLabGame(run,0);
    assert.equal(first.record.terminationReason,'NORMAL_VICTORY');
    assert.deepEqual(semanticRecord(first.record),semanticRecord(second.record),`seed ${seed}`);
    assert.ok(first.record.durationMs > 0);
    assert.deepEqual(first.replay.initialState,second.replay.initialState);
    assert.deepEqual(first.replay.commands,second.replay.commands);
    run.records.push(first.record); retainReplay(run,first);
    const verified=verifyLabReplay(run,run.replays[0]);
    assert.equal(hashCanonical(verified.state),first.record.finalStateHash);
  }
});
test('replay rejects command tampering and configuration incompatible with initial state', () => {
  const run=create(), evidence=runLabGame(run,0); run.records.push(evidence.record); retainReplay(run,evidence);
  const bad=structuredClone(run.replays[0]); bad.replay.commands[0].id='changed';
  assert.throws(() => verifyLabReplay(run,bad),/REPLAY_HASH/);
  const badRun=structuredClone(run); badRun.config.profileId='first-contact-trigger-closure';
  assert.throws(() => verifyLabReplay(badRun,badRun.replays[0]),/REPLAY_SETUP/);
});
test('pause/resume invalidates stale workers and records each claimed ordinal once', () => {
  const session=new EvolutionSession(create({gameCount:4})),epoch=session.start();
  const ordinal=session.claim(0), evidence=runLabGame(session.run,ordinal);
  session.pause(); assert.equal(session.accept(0,epoch,evidence),false);
  const resumed=session.start(); assert.equal(session.claim(0),ordinal);
  assert.equal(session.accept(0,resumed,evidence),true); assert.equal(session.accept(0,resumed,evidence),false);
  const next=session.claim(0); assert.notEqual(next,ordinal);
  session.stop(); assert.equal(session.accept(0,resumed,runLabGame(session.run,next)),false);
  assert.equal(session.run.records.length,1);
});
test('different worker partitions produce identical ordinal evidence and aggregates', () => {
  const run=create({gameCount:8}), records=Array.from({length:8},(_,o) => runLabGame(run,o));
  const serial=new EvolutionSession(create({gameCount:8})); const s=serial.start();
  for (const evidence of records) { assert.equal(serial.claim(0),evidence.record.ordinal); serial.accept(0,s,evidence); }
  const parallel=new EvolutionSession(create({gameCount:8})),p=parallel.start();
  for (let first=0;first<8;first+=4) {
    for (let w=0;w<4;w+=1) assert.equal(parallel.claim(w),first+w);
    for (let w=3;w>=0;w-=1) parallel.accept(w,p,records[first+w]);
  }
  assert.equal(parallel.run.status,'COMPLETE');
  assert.deepEqual(summarizeRecords(parallel.run.records),summarizeRecords(serial.run.records));
  assert.deepEqual(artifactEnvelope(parallel.run).payload.records,artifactEnvelope(serial.run).payload.records);
});
test('artifact round trips preserve evidence, resume state and reject duplicate/budget/tampered data', () => {
  const run=create(), result=runLabGame(run,0); run.records.push(result.record); retainReplay(run,result); run.status='RUNNING';
  run.bookmarks.push(result.record.replayId);
  const restored=validateArtifact(JSON.parse(JSON.stringify(artifactEnvelope(run))),identity);
  assert.equal(restored.status,'PAUSED'); assert.deepEqual(restored.records,run.records); assert.deepEqual(restored.bookmarks,run.bookmarks);
  const duplicate=structuredClone(run); duplicate.records.push(result.record);
  assert.throws(() => validateArtifact(artifactEnvelope(duplicate),identity),/DUPLICATE/);
  const incompatible=artifactEnvelope(run); incompatible.payload.notes='tampered';
  assert.throws(() => validateArtifact(incompatible,identity),/ARTIFACT_HASH/);
});
test('metrics exclude failures and uncertainty counts independent complete pairs', () => {
  const run=create({gameCount:4}), records=[runLabGame(run,0).record,runLabGame(run,1).record];
  records.push(gameFault(new Error('diagnostic'),gamePlan(run.config,2),run));
  const m=summarizeRecords(records);
  assert.equal(m.games,3); assert.equal(m.clean,2); assert.equal(m.aborted,1); assert.equal(m.pairCount,1);
  assert.equal(m.winsA+m.winsB+m.draws+m.unresolved,2); assert.equal(m.uncertainty,'SMALL_SAMPLE');
  assert.deepEqual(m.pairedScoreInterval95,[0,1]);
});
test('replay retention ignores untransferred transcripts and orders samples by ordinal', () => {
  const run=create(), evidence=runLabGame(run,0); run.records.push(evidence.record);
  retainReplay(run,{record:evidence.record,replay:null}); assert.equal(run.replays.length,0);
  retainReplay(run,evidence); assert.equal(run.replays.length,1);
  const next=runLabGame(run,1); run.records.push(next.record); retainReplay(run,next);
  assert.deepEqual(run.replays.map(r => r.ordinal),[0,1]);
});
test('frozen evaluation preserves checkpoints and records independent evaluation kind', async () => {
  const result=await runLabSeries({...input,gameCount:4,kind:'EVALUATION'});
  assert.equal(result.run.status,'COMPLETE'); assert.equal(result.run.kind,'EVALUATION');
  assert.equal(result.metrics.pairCount,2);
  for (const cp of result.run.checkpoints) { assert.equal(cp.generation,0); assert.deepEqual(cp.policyState,{}); validateCheckpoint(cp,identity); }
});
test('real Node worker pool reproduces serial records with the same starting checkpoints', async () => {
  const options={identity,createdAt:'2026-10-02T16:00:00.000Z',startingCheckpoints:create({gameCount:8}).checkpoints};
  const serial=await runLabSeries({...input,gameCount:8,workerCount:1},options);
  const concurrent=await runLabSeries({...input,gameCount:8,workerCount:4},options);
  assert.deepEqual(artifactEnvelope(concurrent.run).payload.records.map(semanticRecord),artifactEnvelope(serial.run).payload.records.map(semanticRecord));
  assert.deepEqual(semanticMetrics(concurrent.metrics),semanticMetrics(serial.metrics));
});
test('browser and Node adapters use identical authoritative trajectories across admitted profiles', {skip: !existsSync('apps/lab-web/dist/autonomy-runtime.js') && 'requires browser build'}, async () => {
  const {runBrowserPolicyMatch}=await import('../apps/lab-web/dist/autonomy-runtime.js');
  for (const profileId of ['core-advanced-authority','core-unrestricted-authority','first-contact-trigger-closure']) {
    for (const seed of [1,42,31415,4294967295]) {
      const run=create({profileId,seed,gameCount:2});
      const node=runLabGame(run,0),plan=gamePlan(run.config,0);
      const browser=runBrowserPolicyMatch({...plan,profileId,orchestrationCommandLimit:run.config.orchestrationCommandLimit,recordReplay:true});
      assert.deepEqual(browser.replay.initialState,node.replay.initialState);
      assert.deepEqual(browser.replay.commands,node.replay.commands,`${profileId} seed ${seed}`);
      assert.equal(browser.finalStateHash,node.record.finalStateHash);
    }
  }
});
test('normal and lab orchestration resume the same long automatic chain', async () => {
  const run=create({botA:'score-rush',botB:'control',seed:42,gameCount:100});
  const evidence=runLabGame(run,16);
  assert.equal(evidence.record.terminationReason,'NORMAL_VICTORY');
  run.records.push(evidence.record); retainReplay(run,evidence); verifyLabReplay(run,run.replays[0]);
  const {runPolicyMatch}=await import('../packages/simulation-runtime/src/runtime.mjs');
  const normal=runPolicyMatch({seed:gamePlan(run.config,16).seed,policyIds:['score-rush','control'],telemetryEnabled:false,includeReplay:true,replayMode:'commands'});
  assert.equal(normal.summary.terminationReason,evidence.record.terminationReason);
  assert.equal(normal.summary.finalStateHash,evidence.record.finalStateHash);
  assert.deepEqual(normal.replay.commands,evidence.replay.commands);
  assert.deepEqual(normal.summary.ruleCompliance.status,evidence.record.ruleCompliance);
});
