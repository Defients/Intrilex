import { trustedSummary } from './fixtures/admission-fixtures.mjs';
import { admitSummaries } from '../packages/simulation-runtime/src/evidence-admission.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { BROWSER_CAPACITY, assertBrowserCapacity, browserSizeEstimate, evidenceBudget, runAcknowledgedCampaign } from '../packages/simulation-runtime/src/browser-capacity.mjs';
import { campaignExecution } from '../packages/simulation-runtime/src/campaign-execution.mjs';
import { createLabRun, artifactEnvelope, validateArtifact, summarizeRecords, LAB_LIMITS } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { EvolutionSession } from '../packages/simulation-runtime/src/evolution-session.mjs';
import * as capacity from '../packages/simulation-runtime/src/browser-capacity.mjs';
import { evolutionIdentity, runLabGame } from '../packages/simulation-runtime/src/evolution-lab.mjs';
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function fixture(commit) {
  const messages=[],worker={postMessage:x=>messages.push(x),terminate(){this.terminated=true;}};
  const driver=campaignExecution({execution:{runId:'run',ownerId:'owner',fencingToken:1},commit,seal:async()=>({}),fail:async()=>{},cancel:async()=>{}});
  driver.attach(worker,{index:0,config:{matchCount:100}});
  const emit=x=>worker.onmessage?.({data:{workerIndex:0,execution:driver.token,...x}});
  return {driver,worker,messages,emit};
}
test('R09: no producer credit or completion before the durable commit receipt',async()=>{
  const gate=deferred(),f=fixture(()=>gate.promise);
  f.emit({type:'autonomy-campaign-batch',batchSequence:0,summariesJson:'[{}]'});await tick();
  assert.equal(f.messages.length,1);assert.equal(f.driver.metrics.pendingBatches,1);
  gate.resolve({receipt:{receiptHash:'durable'}});await tick();
  assert.equal(f.messages[1].type,'autonomy-campaign-ack');assert.equal(f.messages[1].receipt.receiptHash,'durable');
  f.emit({type:'autonomy-segment-result',ok:true});assert.equal((await f.driver.done).state,'complete');
  assert.equal(f.driver.metrics.peakBatches,1);assert.equal(f.driver.metrics.pendingBytes,0);
});
test('R09: storage rejection grants no credit and retains one failure owner',async()=>{
  const f=fixture(async()=>{throw new Error('QUOTA');});f.emit({type:'autonomy-campaign-batch',batchSequence:0,summariesJson:'[{}]'});
  assert.equal((await f.driver.done).state,'failed');assert.equal(f.messages.length,1);assert.ok(f.worker.terminated);
});
test('R09: a second unacknowledged batch fails before it can enter the commit queue',async()=>{
  const gate=deferred(),f=fixture(()=>gate.promise);f.emit({type:'autonomy-campaign-batch',batchSequence:0,summariesJson:'[{}]'});await tick();
  f.emit({type:'autonomy-campaign-batch',batchSequence:1,summariesJson:'[{}]'});gate.resolve();
  const result=await f.driver.done;assert.equal(result.detail.code,'CAMPAIGN_BACKPRESSURE_VIOLATION');assert.equal(f.driver.metrics.peakBatches,1);
});
test('R09: oversized batches fail without attempting storage',async()=>{
  let commits=0;const f=fixture(async()=>{commits++;});f.emit({type:'autonomy-campaign-batch',batchSequence:0,summariesJson:'x'.repeat(BROWSER_CAPACITY.batchBytes+1)});
  assert.equal((await f.driver.done).state,'failed');assert.equal(commits,0);
});
test('R09: supported 100 and deep 10; 1,000/10,000 and deep 11 are explicitly restricted',()=>{
  assertBrowserCapacity({matchCount:100});assertBrowserCapacity({matchCount:10,strategicTrace:true});
  for(const count of [101,1000,10000])assert.throws(()=>assertBrowserCapacity({matchCount:count}),/TIER_RESTRICTED/);
  assert.throws(()=>assertBrowserCapacity({matchCount:11,strategicTrace:true}),/MAX_10/);
});
test('R09: analysis row and byte ceilings reject independently and do not consume capacity',()=>{
  const rows=evidenceBudget();rows.add(Array(1000).fill({}));assert.throws(()=>rows.add([{}]),/CAPACITY/);assert.equal(rows.metrics.rows,1000);
  const bytes=evidenceBudget();assert.throws(()=>bytes.add([{text:'x'.repeat(BROWSER_CAPACITY.analysisBytes)}]),/CAPACITY/);assert.deepEqual(bytes.metrics,{rows:0,bytes:0});
});
test('R09: slow acknowledgement prevents the next game batch, with exact ordinal/seat inputs preserved',async()=>{
  const gate=deferred(),seen=[],sent=[],core=[];
  const pending=runAcknowledgedCampaign({matchCount:12,ordinalBase:40,ordinalStart:2,ordinalEnd:12,batchSize:5,policyIds:['A','B']},{
    runCampaign:cfg=>{seen.push([cfg.ordinalBase,cfg.ordinalStart,cfg.ordinalEnd]);return {summaries:Array.from({length:cfg.ordinalEnd-cfg.ordinalStart},(_,i)=>({matchOrdinal:cfg.ordinalBase+cfg.ordinalStart+i}))};},
    collector:{add:x=>core.push(x),finish:()=>({count:core.length})},send:async x=>{sent.push(x);if(sent.length===1)await gate.promise;}});
  await tick();assert.equal(seen.length,1);assert.equal(sent.length,1);gate.resolve();assert.deepEqual(await pending,{count:10});
  assert.deepEqual(seen,[[40,2,7],[40,7,12]]);assert.deepEqual(sent.map(x=>[x.batchSequence,x.ordinalStart,x.ordinalEnd]),[[0,42,47],[1,47,52]]);
});
test('R09: producer rejects unsupported tiers before invoking the game engine',async()=>{
  let invoked=false;await assert.rejects(runAcknowledgedCampaign({matchCount:1000},{runCampaign:()=>{invoked=true;}}),/TIER_RESTRICTED/);assert.equal(invoked,false);
});
test('R09: Evolution callback failure stops dispatch and keeps its accepted game available for export',async()=>{
  const identity=await evolutionIdentity(),workers=[];
  class Worker {constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}}
  const source=(await readFile('apps/lab-web/src/evolution/evolution-browser-runner.mjs','utf8')).replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'');
  const execute=runInNewContext(source+';executeBrowserSeries',{...capacity,createLabRun,artifactEnvelope,validateArtifact,summarizeRecords,LAB_LIMITS,EvolutionSession,performance,setTimeout,clearTimeout,Worker});
  const gate=deferred(),result=execute({botA:'control',botB:'tempo',gameCount:2,workerCount:1,seed:42},{identity,onAcceptedGame:()=>gate.promise});
  const first=workers[0].message;const handling=workers[0].onmessage({data:{type:'evolution-evidence',epoch:first.epoch,evidence:runLabGame(first.run,0)}});
  await tick();assert.equal(workers[0].message.ordinal,0);gate.reject(new Error('QUOTA'));await handling;
  const stopped=await result;assert.equal(stopped.run.status,'ERROR');assert.equal(stopped.run.records.length,1);assert.deepEqual([...stopped.persistErrors],['QUOTA']);assert.equal(workers[0].message.ordinal,0);
});

test('R09: checkpoint requests coalesce to one latest header instead of queuing growing snapshots',async()=>{
  const source=(await readFile('apps/lab-web/src/evolution/evolution-store.mjs','utf8')).replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'');
  const Store=runInNewContext(source+';EvolutionStore',{...capacity});
  const store=new Store({}),gate=deferred(),writes=[];
  store.saveIncrement=async run=>{writes.push(run.revision);if(writes.length===1)await gate.promise;return run.revision;};
  const run={runId:'coalesced',revision:0},pending=store.save(run);
  for(let revision=1;revision<=200;revision++){run.revision=revision;assert.equal(store.save(run),pending);}
  assert.equal(store.saves.size,1);gate.resolve();assert.equal(await pending,200);assert.deepEqual(writes,[0,200]);assert.equal(store.saves.size,0);
});
test('R09: slow aggregation retains one pending page and rejects worker failure without fallback',async()=>{
  const source=await readFile('apps/lab-web/src/experiments/experiment-controller.mjs','utf8');
  const code=source.slice(source.indexOf('function _aggregateStream()'),source.indexOf('/**',source.indexOf('function _aggregateStream()')+5)).replace(/^export /gm,'');
  const messages=[],workers=[];
  class Worker{constructor(){workers.push(this);}postMessage(x){messages.push(x);}terminate(){this.terminated=true;}}
  const aggregate=runInNewContext(code+';aggregateBoundedEvidence',{...capacity,TextEncoder,setTimeout,clearTimeout,Worker});
  const pending=aggregate(Array(20).fill({}));await tick();assert.equal(messages.length,2);assert.equal(JSON.parse(messages[1].summariesJson).length,5);
  for(let sequence=0;sequence<4;sequence++){workers[0].onmessage({data:{type:'autonomy-aggregate-ack',sequence}});await tick();assert.equal(messages.length,sequence+3);}
  assert.equal(messages.at(-1).type,'run-autonomy-aggregate-finish');workers[0].onerror({message:'SLOW_AGGREGATION_FAILED'});
  await assert.rejects(pending,/SLOW_AGGREGATION_FAILED/);assert.ok(workers[0].terminated);
});

test('R09: preflight estimates name their observed workload and never confer larger-tier authority',()=>{
  assert.equal(browserSizeEstimate({matchCount:100}).bytes,11700000);assert.equal(browserSizeEstimate({matchCount:10,strategicTrace:true}).bytes,4400000);
  assert.equal(browserSizeEstimate({matchCount:1000}).guaranteed,false);assert.match(browserSizeEstimate({matchCount:100}).source,/October 7, 2026/);
  assert.throws(()=>assertBrowserCapacity({matchCount:1000}),/TIER_RESTRICTED/);
});

test('R09/R06: the shipped browser 4.0 summary schema is admitted only with complete current identity',()=>{
  const row=trustedSummary({schemaVersion:'4.0.0',matchOrdinal:0,policyIds:['control','tempo'],terminationReason:'NORMAL_VICTORY',winningSeat:1});
  assert.equal(admitSummaries([row]).eligible,true);
  assert.equal(admitSummaries([{...row,identity:null}]).eligible,false);
  assert.equal(admitSummaries([{...row,schemaVersion:'4.9.0'}]).eligible,false);
});
