import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { campaignAggregate } from '@intrilex/simulation-runtime/campaign';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { publicAuthorityCertifiedReplayView } from '@intrilex/engine-adapter';
import { POLICY_CATALOG } from '@intrilex/simulation-runtime/policy-catalog';
import { hashCanonical, sanitizeCsvCell } from '@intrilex/shared';
import { loadReleaseIdentity } from '@intrilex/shared/release-identity';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'sample-data/autonomy'),reports=path.join(root,'reports'),segmentRoot=path.join(root,'runtime/campaign-segments-v070'),replayCacheRoot=path.join(root,'runtime/campaign-replays-v070');
const numberArg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>=0?Number(process.argv[i+1]):fallback;};
const matchCount=numberArg('--matches',100),segmentSize=numberArg('--segment-size',25);
const wi=process.argv.indexOf('--worker-counts');const workerCounts=wi>=0?process.argv[wi+1].split(',').map(Number):[1,2,4];
const rerunWorkerCount=workerCounts.at(-1),includeRerun=!process.argv.includes('--no-rerun'),resume=process.argv.includes('--resume-segments');
if(!Number.isInteger(matchCount)||matchCount<25||matchCount%25!==0)throw new Error('--matches must be >=25 and divisible by 25');
if(!Number.isInteger(segmentSize)||segmentSize<25||segmentSize%25!==0)throw new Error('--segment-size must be >=25 and divisible by 25');
const BASE_POLICY_IDS=POLICY_CATALOG.filter(policy=>!policy.policyId.startsWith('hybrix-')).map(policy=>policy.policyId);
const HYBRIX_NORMAL_IDS=POLICY_CATALOG.filter(policy=>policy.policyId.startsWith('hybrix-')&&!policy.policyId.endsWith('-easy')&&!policy.policyId.endsWith('-hard')&&!policy.policyId.endsWith('-nightmare')).map(policy=>policy.policyId);
const OBSERVATORY_POLICY_IDS=[...BASE_POLICY_IDS,...HYBRIX_NORMAL_IDS],policyPairs=OBSERVATORY_POLICY_IDS.flatMap(left=>OBSERVATORY_POLICY_IDS.map(right=>[left,right]));
const config={profileId:'core-advanced-authority',matchCount,policyPairs,decisionLimit:3600};

async function segmented(workerCount,executionId){
  const dir=path.join(segmentRoot,executionId);if(!resume)await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
  const configPath=path.join(dir,'config.json');await writeFile(configPath,JSON.stringify(config));const segments=[];
  for(let start=0;start<matchCount;start+=segmentSize){
    const end=Math.min(matchCount,start+segmentSize),file=path.join(dir,`${String(start).padStart(6,'0')}.json`);let segment=null;
    if(resume)segment=await readFile(file,'utf8').then(JSON.parse).catch(()=>null);
    if(!segment||segment.workerCount!==workerCount||segment.ordinalRange?.[0]!==start||segment.ordinalRange?.[1]!==end){
      const run=spawnSync(process.execPath,['scripts/run-campaign-segment.mjs','--config',configPath,'--start',String(start),'--end',String(end),'--workers',String(workerCount),'--output',file],{cwd:root,stdio:'inherit',timeout:180000});
      if(run.status!==0)throw new Error(`SEGMENT_FAILED:${executionId}:${start}-${end}:${run.signal??run.status}`);
      segment=JSON.parse(await readFile(file,'utf8'));
    } else console.log(`SEGMENT RESUME PASS: ${executionId} ${start}-${end}`);
    segments.push(segment);
  }
  const first=segments[0];if(!segments.every(item=>item.experimentHash===first.experimentHash))throw new Error(`EXPERIMENT_DRIFT:${executionId}`);
  const summaries=segments.flatMap(item=>item.summaries).sort((a,b)=>a.matchOrdinal-b.matchOrdinal);
  if(summaries.length!==matchCount||summaries.some((item,index)=>item.matchOrdinal!==index))throw new Error(`ORDINAL_COVERAGE:${executionId}`);
  const records=segments.flatMap(item=>item.records??[]).sort((a,b)=>a.ordinal-b.ordinal);
  const completedCount=records.filter(r=>r.result==='completed').length;
  const abortedCount=records.filter(r=>r.result==='aborted').length;
  const unsupportedCount=records.filter(r=>r.result==='unsupported').length;
  const errorCount=records.filter(r=>r.result==='error').length;
  const accountingInvariant=completedCount+abortedCount+unsupportedCount+errorCount===records.length;
  const campaignStatus=errorCount>0?'FAIL':(abortedCount>0||unsupportedCount>0?'PARTIAL':'PASS');
  return{schemaVersion:'4.1.0',semantic:first.semantic,experimentHash:first.experimentHash,workerCount,semanticMatchCount:matchCount,ordinalRange:[0,matchCount],matchCount,summaries,records,completedCount,abortedCount,unsupportedCount,errorCount,accountingInvariant,campaignStatus,canonicalResultHash:hashCanonical(summaries.map(item=>item.matchResultHash)),segmentCount:segments.length,segmentSize,segmentDurationsMs:segments.map(item=>item.durationMs)};
}

const identity=await loadReleaseIdentity();

await rm(output,{recursive:true,force:true});if(!resume)await rm(replayCacheRoot,{recursive:true,force:true});await mkdir(replayCacheRoot,{recursive:true});await mkdir(path.join(output,'replays/authorized'),{recursive:true});await mkdir(path.join(output,'replays/public'),{recursive:true});await mkdir(reports,{recursive:true});
const executions=[];let canonical=null;
async function execute(workerCount,id){const startedAt=new Date().toISOString(),started=performance.now();const campaign=await segmented(workerCount,id);const durationMs=campaign.segmentDurationsMs.reduce((a,b)=>a+b,0)||Math.round(performance.now()-started);canonical??=campaign;executions.push({schemaVersion:'4.1.0',executionId:id,experimentHash:campaign.experimentHash,workerCount,matchCount:campaign.matchCount,startedAt,durationMs,matchesPerSecond:Number((campaign.matchCount/(durationMs/1000)).toFixed(2)),canonicalResultHash:campaign.canonicalResultHash,node:process.version,platform:`${process.platform}-${process.arch}`,cpuCount:os.cpus().length,segmentCount:campaign.segmentCount,segmentSize:campaign.segmentSize});}
for(const workers of workerCounts)await execute(workers,`workers-${workers}`);if(includeRerun)await execute(rerunWorkerCount,`workers-${rerunWorkerCount}-clean-rerun`);
const experimentHash=canonical.experimentHash,resultHash=canonical.canonicalResultHash;
if(!executions.every(item=>item.experimentHash===experimentHash&&item.canonicalResultHash===resultHash&&item.matchCount===matchCount))throw new Error('CAMPAIGN_PARITY_FAILURE');
const aggregate=campaignAggregate(canonical);if(aggregate.abortCount!==0)throw new Error(`CAMPAIGN_ABORTS:${aggregate.abortCount}`);
const experimentCore={schemaVersion:'4.1.0',experimentId:`mechanics-observatory-twelve-policy-${matchCount}`,engine:{package:'@intrilex/headless-engine',version:identity.engineVersion,rulesVersion:identity.rulesVersion},rulesProfile:'core-advanced-authority',profileNature:'ENGINE_OWNED_BOUNDED_ADVANCED_CORE',enabledModules:[],playerCount:2,policyPairs,policyVersions:Object.fromEntries(POLICY_CATALOG.filter(policy=>OBSERVATORY_POLICY_IDS.includes(policy.policyId)).map(policy=>[policy.policyId,{version:policy.version,policyHash:policy.policyHash,traits:policy.traits}])),seedScheme:{kind:'HASH_DERIVED_UINT32_NONZERO',matchOrdinalStart:0},matchCount,safetyLimits:{maxPolicyDecisions:3600},telemetryLevel:'MECHANICS_OBSERVATORY_SEMANTIC_V4',diagnosticOmniscient:false};
const experiment={...experimentCore,experimentHash,manifestContentHash:hashCanonical(experimentCore)};

const completed=canonical.summaries;const retention=new Map();
const add=(summary,reason)=>{if(!summary)return;const item=retention.get(summary.matchId)??{summary,reasons:[]};if(!item.reasons.includes(reason))item.reasons.push(reason);retention.set(summary.matchId,item);};
const sorted=(selector,desc=false)=>[...completed].sort((a,b)=>(desc?selector(b)-selector(a):selector(a)-selector(b))||a.matchOrdinal-b.matchOrdinal||a.matchId.localeCompare(b.matchId));
add(sorted(x=>x.completedFullTurns)[0],'SHORTEST_GAME');add(sorted(x=>x.completedFullTurns,true)[0],'LONGEST_GAME');add(sorted(x=>x.scoreMargin,true)[0],'LARGEST_SCORE_MARGIN');add(sorted(x=>x.responsePlayedCount,true)[0],'MOST_RESPONSES_PLAYED');add(sorted(x=>x.responseDeclinedWithOptionsCount,true)[0],'MOST_LEGAL_RESPONSES_DECLINED');add(sorted(x=>x.automaticPriorityAdvanceCount,true)[0],'MOST_AUTOMATIC_PRIORITY_ADVANCES');add(sorted(x=>x.privateChoiceDecisionCount,true)[0],'MOST_PRIVATE_CHOICES');add(sorted(x=>x.advancedDecisionCount,true)[0],'MOST_ADVANCED_DECLARATIONS');add(sorted(x=>x.ultraDecisionCount,true)[0],'MOST_ULTRAS');add(sorted(x=>x.voltageDecisionCount,true)[0],'MOST_VOLTAGE');
for(const pair of policyPairs)add(completed.find(summary=>summary.policyIds[0]===pair[0]&&summary.policyIds[1]===pair[1]),`MATCHUP:${pair[0]}__vs__${pair[1]}`);
for(const term of ['EXHAUSTED_RESOLUTION','CANONICAL_DRAW'])add(completed.find(summary=>summary.terminationReason===term),term);
const retained=[...retention.values()].sort((a,b)=>a.summary.matchOrdinal-b.summary.matchOrdinal),retentionRecords=[];
for(const item of retained){
  const summary=item.summary,cachePath=path.join(replayCacheRoot,`${summary.matchId}.json`);let cached=resume?await readFile(cachePath,'utf8').then(JSON.parse).catch(()=>null):null;
  if(!cached||cached.summary?.matchResultHash!==summary.matchResultHash){
    const replayResult=runPolicyMatch({ordinal:summary.matchOrdinal,seed:summary.seed,profileId:summary.profileId,seatOrder:summary.seatOrder,policyIds:summary.policyIds,decisionLimit:3600,includeReplay:true,decisionTracesEnabled:true,seatSwapped:summary.seatSwapped,pairedRunId:summary.pairedRunId});
    if(replayResult.summary.matchResultHash!==summary.matchResultHash)throw new Error(`RETAINED_REPLAY_MISMATCH:${summary.matchId}`);
    cached={summary:replayResult.summary,replay:replayResult.replay,publicReplay:publicAuthorityCertifiedReplayView(replayResult.replay),decisionTraces:replayResult.decisionTraces??[]};await writeFile(cachePath,JSON.stringify(cached)+'\n');console.log(`REPLAY CACHE PASS: ${summary.matchId}`);
  } else console.log(`REPLAY CACHE RESUME: ${summary.matchId}`);
  const authorizedRel=`replays/authorized/${summary.matchId}.authorized.replay.json`,publicRel=`replays/public/${summary.matchId}.public.replay.json`;
  await writeFile(path.join(output,authorizedRel),JSON.stringify(cached.replay)+'\n');await writeFile(path.join(output,publicRel),JSON.stringify(cached.publicReplay)+'\n');
  const traces=cached.decisionTraces??[];
  if(traces.length){const traceDir=path.join(output,'decision-traces');await mkdir(traceDir,{recursive:true});await writeFile(path.join(traceDir,`${summary.matchId}.json`),JSON.stringify({schemaVersion:'2.0.0',matchId:summary.matchId,matchOrdinal:summary.matchOrdinal,traceCount:traces.length,traces})+'\n');}
  retentionRecords.push({matchId:summary.matchId,matchOrdinal:summary.matchOrdinal,reasons:item.reasons.sort(),authorizedReplay:authorizedRel,publicReplay:publicRel,authorizedReplayHash:cached.replay.contentHash,publicReplayHash:cached.publicReplay.publicContentHash,hasDecisionTraces:traces.length>0,traceCount:traces.length,summary:cached.summary});
}
const retentionCore={schemaVersion:'4.1.0',experimentHash,records:retentionRecords};const retentionIndex={...retentionCore,retentionHash:hashCanonical(retentionCore)};
await writeFile(path.join(output,'experiment.json'),JSON.stringify(experiment,null,2)+'\n');await writeFile(path.join(output,'execution-manifests.json'),JSON.stringify(executions,null,2)+'\n');await writeFile(path.join(output,'aggregate.json'),JSON.stringify(aggregate,null,2)+'\n');await writeFile(path.join(output,'retention-index.json'),JSON.stringify(retentionIndex,null,2)+'\n');
const campaignAccounting={schemaVersion:'1.0.0',experimentHash,matchCount,completedCount:canonical.completedCount,abortedCount:canonical.abortedCount,unsupportedCount:canonical.unsupportedCount,errorCount:canonical.errorCount,accountingInvariant:canonical.accountingInvariant,campaignStatus:canonical.campaignStatus,records:canonical.records};
await writeFile(path.join(output,'campaign-accounting.json'),JSON.stringify(campaignAccounting,null,2)+'\n');
await writeFile(path.join(output,'match-summaries.ndjson'),canonical.summaries.map(item=>JSON.stringify(item)).join('\n')+'\n');
const columns=['matchOrdinal','matchId','seed','profileId','policy1','policy2','winner','winningSeat','terminationReason','completedFullTurns','policyDecisionCount','policyActionCount','miniTurnActionCount','exhaustedPassActionCount','responseOpportunityCount','responsePlayedCount','responseDeclinedWithOptionsCount','automaticPriorityAdvanceCount','responseWindowClosedCount','privateChoiceDecisionCount','advancedDecisionCount','ultraDecisionCount','voltageDecisionCount','triggerCount','commandCount','eventCount','scoreMargin','matchResultHash'];
const rows=canonical.summaries.map(item=>[item.matchOrdinal,item.matchId,item.seed,item.profileId,item.policyIds[0],item.policyIds[1],item.winner,item.winningSeat,item.terminationReason,item.completedFullTurns,item.policyDecisionCount,item.policyActionCount,item.miniTurnActionCount,item.exhaustedPassActionCount,item.responseOpportunityCount,item.responsePlayedCount,item.responseDeclinedWithOptionsCount,item.automaticPriorityAdvanceCount,item.responseWindowClosedCount,item.privateChoiceDecisionCount,item.advancedDecisionCount,item.ultraDecisionCount,item.voltageDecisionCount,item.triggerCount,item.commandCount,item.eventCount,item.scoreMargin,item.matchResultHash]);
await writeFile(path.join(output,'match-summaries.csv'),[columns,...rows].map(row=>row.map(sanitizeCsvCell).join(',')).join('\n')+'\n');
const determinism={schemaVersion:'4.1.0',status:'PASS',experimentHash,canonicalResultHash:resultHash,workerCounts,cleanRerunWorkerCount:rerunWorkerCount,executions};await writeFile(path.join(reports,'autonomy-determinism.json'),JSON.stringify(determinism,null,2)+'\n');
const certification={schemaVersion:'4.1.0',status:'PASS',scope:'MECHANICS_OBSERVATORY_HOTFIX_CAMPAIGN',engineVersion:identity.engineVersion,rulesVersion:identity.rulesVersion,profileId:'core-advanced-authority',matchCount,completedMatchCount:aggregate.completedMatchCount,abortCount:aggregate.abortCount,experimentHash,canonicalResultHash:resultHash,aggregateHash:aggregate.aggregateHash,retainedReplayCount:retentionRecords.length,semanticTotals:aggregate.semanticTotals,actionCounts:aggregate.actionCounts,decisionFamilyCounts:aggregate.decisionFamilyCounts,limitations:['COMPLETE_CORE_REMAINS_REPLAY_ONLY','OPTIONAL_MODULE_AUTONOMY_BLOCKED','MULTIPLAYER_AUTONOMY_BLOCKED']};await writeFile(path.join(reports,'advanced-core-integration-certification.json'),JSON.stringify(certification,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',matchCount,completed:aggregate.completedMatchCount,aborts:aggregate.abortCount,experimentHash,canonicalResultHash:resultHash,aggregateHash:aggregate.aggregateHash,retainedReplayCount:retentionRecords.length},null,2));


