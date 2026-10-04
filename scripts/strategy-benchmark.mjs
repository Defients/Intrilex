import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { strategyGameEvidence, eventIndexRow } from '../packages/simulation-runtime/src/strategy-evidence.mjs';
import { createStrategyAggregate } from '../packages/simulation-runtime/src/strategy-analysis.mjs';

// A small reproducible real workload, not a projected million-game benchmark.
const identity=await evolutionIdentity(),config={botA:'value',botB:'tempo',gameCount:8,seed:1337,kind:'EVALUATION',mirrorSeats:true,workerCount:1},createdAt='2026-10-04T16:00:00.000Z';
await runLabSeries({...config,gameCount:2},{identity,createdAt});
const measurements=[];let deep;
for(let round=0;round<3;round++)for(const traced of round%2?[true,false]:[false,true]){
  const start=performance.now(),result=await runLabSeries({...config,strategicTrace:traced},{identity,createdAt});
  measurements.push({round,traced,durationMs:performance.now()-start,decisions:result.run.records.reduce((n,r)=>n+r.decisions,0)});
  if(traced)deep=result.run;
  else if(deep)for(const record of result.run.records){const r=deep.records.find(r=>r.ordinal===record.ordinal);assert.equal(record.finalStateHash,r.finalStateHash);assert.equal(record.actionSequenceHash,r.actionSequenceHash);}
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],normal=median(measurements.filter(r=>!r.traced).map(r=>r.durationMs)),traced=median(measurements.filter(r=>r.traced).map(r=>r.durationMs));
const envelopes=deep.records.map(r=>strategyGameEvidence(deep,r)),rows=envelopes.flatMap(e=>e.events.map(event=>eventIndexRow(event,e.artifactId,'LOCAL')));
const timings=[];for(let n=0;n<20;n++){const start=performance.now(),a=createStrategyAggregate({fingerprint:identity.fingerprint,rulesProfile:deep.config.profileId,eraId:identity.fingerprint,subject:'family:draw'});for(const row of rows)a.add(row);const result=a.finish();assert.equal(result.total.selected+result.total.skipped,result.total.opportunities);timings.push(performance.now()-start);}
const bytes=value=>Buffer.byteLength(JSON.stringify(value)),decisions=rows.length,bytesTotal=envelopes.reduce((n,e)=>n+bytes(e),0);
const report={date:'2026-10-04',timezone:'America/New_York',node:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,fingerprint:identity.fingerprint,workload:config,
  measurements,baselineMedianMs:normal,tracedMedianMs:traced,overheadPercent:(traced/normal-1)*100,decisions,evidenceBytes:bytesTotal,bytesPerDecision:bytesTotal/decisions,
  maxGameEnvelopeBytes:Math.max(...envelopes.map(bytes)),replayBytes:bytes(deep.replays),aggregateMedianMs:median(timings),limits:['Small eight-game local workload; no large-campaign extrapolation.','Node streaming aggregate timing excludes IndexedDB cursor cost.','Absolute timings depend on machine and concurrent load.','Portable envelopes and indexed event rows duplicate some storage; disk usage is greater than envelope bytes.']};
await mkdir('reports/local/strategy',{recursive:true});await writeFile('reports/local/strategy/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
