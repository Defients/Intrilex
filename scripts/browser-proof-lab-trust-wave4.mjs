import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
/* global Worker, indexedDB, IDBObjectStore, DOMException */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'apps/lab-web/dist');
const source=(await readFile(path.join(root,'apps/lab-web/src/experiments/experiment-controller.mjs'),'utf8')).replace(/import\s[^;]*?from\s*'[^']*';/gs,'').replace(/^export /gm,'');
const server=http.createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(name==='/proof.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Wave 4 capacity proof</title>');return;}
  const target=path.resolve(dist,'.'+decodeURIComponent(name));if(!target.startsWith(dist+path.sep))throw new Error('OUTSIDE_ROOT');
  const body=await readFile(target);res.writeHead(200,{'Content-Type':/\.(mjs|js)$/.test(name)?'text/javascript':'application/json'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const report={date:new Date().toISOString(),pageErrors:[],tiers:{normal:100,deep:10,restricted:[1000,10000]}};
try {
  browser=await chromium.launch({channel:process.env.INTRILEX_BROWSER_CHANNEL || 'chrome',headless:true});report.browser=browser.version();
  const page=await browser.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));report.consoleWarnings=[];page.on('console',message=>{if(['warning','error'].includes(message.type()))report.consoleWarnings.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/proof.html`);
  const measured=await page.evaluate(async source=>{
    const domain=await import('/evolution/experiment-domain.mjs'),portable=await import('/evolution/experiment-portability.mjs'),admission=await import('/evolution/evidence-admission.mjs');
    const {LAB_IDENTITY}=await import('/evolution/identity.mjs'),{ExperimentStore}=await import('/experiments/experiment-store.mjs'),{hashCanonical}=await import('/shared-browser.js');
    const {campaignExecution}=await import('/evolution/campaign-execution.mjs'),capacity=await import('/evolution/browser-capacity.mjs');
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const aggregateMetrics={pending:0,peak:0,maxPageBytes:0,pages:0};
    class SlowAggregateWorker extends Worker {
      postMessage(x){if(x.type==='run-autonomy-aggregate-chunk'){aggregateMetrics.pending++;aggregateMetrics.pages++;aggregateMetrics.peak=Math.max(aggregateMetrics.peak,aggregateMetrics.pending);aggregateMetrics.maxPageBytes=Math.max(aggregateMetrics.maxPageBytes,capacity.jsonBytes(x.summariesJson));}super.postMessage(x);}
      set onmessage(fn){super.onmessage=event=>{if(event.data.type==='autonomy-aggregate-ack')setTimeout(()=>{aggregateMetrics.pending--;fn(event);},30);else fn(event);};}
    }
    const makeApi=store=>{
      const state={bootState:null,observatory:{},aggregate:{},evidenceBasis:null};
      const deps={...domain,...portable,...admission,LAB_IDENTITY,ExperimentStore,hashCanonical,state,console,structuredClone,TextEncoder,setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis),Worker:SlowAggregateWorker,
        showToast(){},updateRailContext(){},rerender(){},RULES_VERSION:'4.3.1',ENGINE_VERSION:'4.2.6',LAB_VERSION:'1.0.0'};
      const api=new Function('deps','with(deps){'+source+';return {initExperiments,beginExperimentRun,commitExperimentBatch,finalizeExperimentRun,failExperimentRun,cancelExperimentRun,resumeExperimentRun,applySelection,getExperimentRuns,getEvidenceBasis,exportRunArtifactText,isolateRun,getEvidenceViewStatus,aggregateBoundedEvidence,inspectTransport:()=>_aggregateStream()};}')(deps);
      return {api,state,store};
    };
    const store=new ExperimentStore(),host=makeApi(store);await host.api.initExperiments({store});
    let transportError=null;try{const transport=host.api.inspectTransport();transport.abort(new Error('PROBE_CLOSE'));}catch(error){transportError=error.stack;}
    const nativePut=IDBObjectStore.prototype.put;
    const runTier=async(count,deep=false,quota=false)=>{
      const api=host.api,workers=deep?2:4;
      const segments=Array.from({length:workers},(_,index)=>({index,ordinalStart:Math.floor(count*index/workers),ordinalEnd:Math.floor(count*(index+1)/workers)}));
      const begun=await api.beginExperimentRun({config:{matchCount:count,workers,profileId:'core-advanced-authority',policyIds:['control','tempo'],strategicTrace:deep},segments,batchSize:deep?1:5});
      const cfg=begun.manifest.config,base=cfg.ordinalBase ?? cfg.ordinalStart ?? 0;
      let accepted=0,maxBatchBytes=0,totalSerializedBytes=0,commits=0,maxCommitMs=0,quotaInjected=false,peakRetainedBatchRows=0;
      const timerTicks=[];let last=performance.now();const pulse=setInterval(()=>{const now=performance.now();timerTicks.push(now-last);last=now;},10),started=performance.now();
      if(quota)IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='runBatches' && commits===1 && !quotaInjected){quotaInjected=true;throw new DOMException('injected capacity quota','QuotaExceededError');}return nativePut.call(this,value,...rest);};
      const driver=campaignExecution({execution:begun.execution,
        commit:async(msg,execution)=>{
          const t=performance.now();await sleep(30);
          const rows=JSON.parse(msg.summariesJson);peakRetainedBatchRows=Math.max(peakRetainedBatchRows,rows.length);
          const bytes=capacity.jsonBytes(msg.summariesJson);maxBatchBytes=Math.max(maxBatchBytes,bytes);totalSerializedBytes+=bytes;
          const receipt=await api.commitExperimentBatch(begun.runId,{execution,segmentIndex:msg.workerIndex,ordinalStart:msg.ordinalStart,ordinalEnd:msg.ordinalEnd,summaries:rows});
          accepted=receipt.committedMatches;commits++;maxCommitMs=Math.max(maxCommitMs,performance.now()-t);return receipt;
        },seal:execution=>api.finalizeExperimentRun(begun.runId,{execution,requireComplete:true}),
        fail:(error,execution)=>api.failExperimentRun(begun.runId,error.message,execution),cancel:execution=>api.cancelExperimentRun(begun.runId,execution)});
      try {
        for(const segment of begun.manifest.segments){const worker=new Worker('/worker.js',{type:'module'});driver.attach(worker,{index:segment.index,config:{...cfg,matchCount:count,ordinalStart:segment.ordinalStart-base,ordinalEnd:segment.ordinalEnd-base,ordinalBase:base,batchSize:deep?1:5}});}
        const result=await driver.done;
        if(result.state==='complete')try{await api.isolateRun(begun.runId);}catch(error){throw new Error(error.message+':'+JSON.stringify(api.getExperimentRuns().map(r=>({runId:r.runId,admission:r.lifecycle?.admission?.reasons,classification:r.lifecycle?.admission?.classification,integrity:r.lifecycle?.integrity}))));}
        const manifest=await store.getManifest(begun.runId),batches=[];
        for(const descriptor of manifest.committedBatches){const batch=await store.getRunBatch(begun.runId,descriptor.batchIndex);batches.push(batch.summaries.length);}
        return {state:result.state,error:result.detail?.message,runId:begun.runId,count,deep,accepted,commits,batches,quotaInjected,queue:{...driver.metrics},maxBatchBytes,totalSerializedBytes,peakRetainedBatchRows,maxCommitMs,durationMs:performance.now()-started,maxTimerGapMs:Math.max(0,...timerTicks),analysisRows:host.state.observatory.summaries?.length ?? 0,analysisStatus:api.getEvidenceViewStatus()};
      }finally{clearInterval(pulse);IDBObjectStore.prototype.put=nativePut;}
    };
    const normal=await runTier(100),deep=await runTier(10,true),quota=await runTier(8,false,true);
    // Reopen native storage, fence the previous owner, and resume only missing ordinals.
    store.close();const recoveredStore=new ExperimentStore(),recovered=makeApi(recoveredStore);await recovered.api.initExperiments({store:recoveredStore});
    const plan=await recovered.api.resumeExperimentRun(quota.runId);
    const before=await recoveredStore.getManifest(quota.runId);
    const driver=campaignExecution({execution:plan.execution,commit:(msg,execution)=>recovered.api.commitExperimentBatch(quota.runId,{execution,segmentIndex:plan.segments[msg.workerIndex].index,ordinalStart:msg.ordinalStart,ordinalEnd:msg.ordinalEnd,summaries:JSON.parse(msg.summariesJson)}),seal:execution=>recovered.api.finalizeExperimentRun(quota.runId,{execution,requireComplete:true}),fail:(error,execution)=>recovered.api.failExperimentRun(quota.runId,error.message,execution),cancel:execution=>recovered.api.cancelExperimentRun(quota.runId,execution)});
    for(const [index,segment] of plan.segments.entries()){driver.attach(new Worker('/worker.js',{type:'module'}),{index,config:{...plan.config,matchCount:plan.requestedMatches,ordinalStart:segment.ordinalStart,ordinalEnd:segment.ordinalEnd,batchSize:5}});}
    const resumed=await driver.done,after=await recoveredStore.getManifest(quota.runId);
    // Incremental Evolution checkpoint: genuine worker evidence, quota abort, then recovery.
    const evo=await import('/evolution/evolution-domain.mjs'),{EvolutionSession}=await import('/evolution/evolution-session.mjs'),{EvolutionStore}=await import('/evolution/evolution-store.mjs');
    const run=evo.createLabRun({botA:'control',botB:'tempo',gameCount:3,workerCount:1,seed:42},LAB_IDENTITY),owner=new EvolutionSession(run),epoch=owner.start(),ledger=new EvolutionStore(LAB_IDENTITY);
    const legacy=evo.createLabRun({botA:'control',botB:'tempo',gameCount:1,workerCount:1,seed:43},LAB_IDENTITY),legacyEnvelope=evo.artifactEnvelope(legacy);
    await new Promise((resolve,reject)=>{const open=indexedDB.open('intrilex-evolution-lab',5);open.onupgradeneeded=()=>{open.result.createObjectStore('runs',{keyPath:'payload.runId'});open.result.createObjectStore('history',{keyPath:'runId'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','history'],'readwrite');tx.objectStore('runs').put(legacyEnvelope);tx.objectStore('history').put({runId:legacy.runId,createdAt:legacy.createdAt,games:0});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
    await ledger.save(run);const retainedLegacy=await ledger.rawRead('runs',legacy.runId),legacyLoaded=await ledger.load(legacy.runId);let checkpointQuota=false;
    const evidence=ordinal=>new Promise((resolve,reject)=>{const worker=new Worker('/worker.js',{type:'module'});worker.onmessage=event=>{worker.terminate();if(event.data.type==='evolution-evidence')resolve(event.data.evidence);else reject(new Error(event.data.error));};worker.onerror=error=>{worker.terminate();reject(new Error(error.message));};worker.postMessage({type:'run-evolution-game',epoch,ordinal,workerIndex:0,retainReplay:true,run:{runId:run.runId,config:run.config,identity:run.identity,checkpoints:run.checkpoints}});});
    owner.claim(0);owner.accept(0,epoch,await evidence(0));await ledger.save(run);const durableBefore=await ledger.rawRead('runs',run.runId);
    owner.claim(0);owner.accept(0,epoch,await evidence(1));
    IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='runChunks' && !checkpointQuota){checkpointQuota=true;throw new DOMException('checkpoint quota','QuotaExceededError');}return nativePut.call(this,value,...rest);};
    let checkpointError;try{await ledger.save(run);}catch(error){checkpointError=error.message;}finally{IDBObjectStore.prototype.put=nativePut;}
    const durableAfter=await ledger.rawRead('runs',run.runId);await ledger.save(run);
    owner.claim(0);owner.accept(0,epoch,await evidence(2));await ledger.save(run);const metrics={...ledger.metrics};ledger.close();
    const reopened=new EvolutionStore(LAB_IDENTITY),loaded=await reopened.load(run.runId),head=await reopened.rawRead('runs',run.runId),chunks=await reopened.rawRead('runChunks');
    const full=JSON.stringify(evo.artifactEnvelope(run)),roundTrip=JSON.stringify(evo.artifactEnvelope(loaded));
    const restricted=[1000,10000].map(count=>{try{capacity.assertBrowserCapacity({matchCount:count});return {count,blocked:false};}catch(error){return {count,blocked:true,error:error.code};}});
    return {transportError,normal,deep,quota,recovery:{state:resumed.state,previousCount:before.committedMatches,retainedCount:after.committedMatches,holes:plan.segments},aggregation:aggregateMetrics,
      checkpoint:{legacyPreserved:hashCanonical(retainedLegacy)===hashCanonical(legacyEnvelope),legacyReadable:legacyLoaded.runId===legacy.runId,checkpointQuota,checkpointError,atomic:durableBefore.contentHash===durableAfter.contentHash,records:loaded.records.length,recordRefs:head.payload.recordRefs.length,chunks:chunks.length,headBytes:capacity.jsonBytes(head),exportEqual:hashCanonical(JSON.parse(full))===hashCanonical(JSON.parse(roundTrip)),originalHash:JSON.parse(full).contentHash,loadedHash:JSON.parse(roundTrip).contentHash,metrics},restricted,identity:{fingerprint:LAB_IDENTITY.fingerprint,analysisFingerprint:LAB_IDENTITY.analysisFingerprint}};
  },source);
  Object.assign(report,measured);
  for(const tier of [report.normal,report.deep]){assert.equal(tier.state,'complete');assert.equal(tier.accepted,tier.count);assert.equal(tier.analysisRows,tier.count);assert.equal(tier.analysisStatus.stale,false);assert.ok(tier.queue.peakBatches<=4);assert.ok(tier.queue.peakBytes<=32*1024*1024);assert.ok(tier.maxBatchBytes<=8*1024*1024);assert.ok(tier.peakRetainedBatchRows<=5);}
  assert.equal(report.aggregation.peak,1);assert.equal(report.aggregation.pending,0);
  assert.equal(report.quota.state,'failed');assert.equal(report.quota.quotaInjected,true);assert.ok(report.quota.accepted<report.quota.count);
  assert.equal(report.recovery.state,'complete');assert.equal(report.recovery.retainedCount,8);assert.equal(report.recovery.previousCount,report.quota.accepted);
  assert.equal(report.checkpoint.legacyPreserved,true);assert.equal(report.checkpoint.legacyReadable,true);assert.equal(report.checkpoint.atomic,true);assert.equal(report.checkpoint.checkpointQuota,true);assert.equal(report.checkpoint.records,3);assert.equal(report.checkpoint.recordRefs,3);assert.equal(report.checkpoint.exportEqual,true);assert.equal(report.checkpoint.metrics.recordWrites,3);
  assert.ok(report.restricted.every(x=>x.blocked));assert.deepEqual(report.pageErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify(report,null,2));
