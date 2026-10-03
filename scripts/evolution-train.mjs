import { researchRunEvidence } from '../packages/simulation-runtime/src/evolution-retention.mjs';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { evolutionIdentity,runLabSeries,verifyLabReplay } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { createTrainingProject,trainProject,semanticTrainingResult } from '../packages/simulation-runtime/src/evolution-training.mjs';
import { researchEnvelope,parseResearchImport } from '../packages/simulation-runtime/src/evolution-research.mjs';
import { hashCanonical } from '@intrilex/shared';
import { summarizeRecords, artifactEnvelope, validateArtifact, LAB_LIMITS } from '../packages/simulation-runtime/src/evolution-domain.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...values]=arg.replace(/^--/,'').split('=');return [key,values.join('=')];}));
const identity=await evolutionIdentity(),output=args.out??'reports/local/evolution-training.json';await mkdir(path.dirname(output),{recursive:true});
const project=args.resume ? parseResearchImport(await readFile(args.resume,'utf8'),identity) : createTrainingProject({identity,name:args.name??'Independent Heuristic Evolution #001',seed:Number(args.seed??1337),workerCount:Number(args.workers??4),training:{generations:Number(args.generations??2),candidates:Number(args.candidates??2),mutationStep:Number(args.step??250),evolutionSeed:Number(args['evolution-seed']??31091),trainingPairs:Number(args['training-pairs']??2),evaluationPairs:Number(args['evaluation-pairs']??2)}});
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
let games=0,actions=0,persistMs=0,replayVerificationMs=0,replaysVerified=0;let representativeRecords=[],currentPurpose='EVALUATION';const replayErrors=[];
const runDirectory=output.replace(/\.json$/,'')+'.runs';await mkdir(runDirectory,{recursive:true});
const missingPriorRunEvidence=[];
if(args.resume){
  const sourceDirectory=args.resume.replace(/\.json$/,'')+'.runs';
  for(const runId of project.experiment.runIds){
    let original;
    try{original=await readFile(path.join(sourceDirectory,runId+'.json'),'utf8');}
    catch(error){if(error.code==='ENOENT'){missingPriorRunEvidence.push(runId);continue;}throw error;}
    const saved=JSON.parse(original);validateArtifact(saved,identity);if(saved.payload.runId!==runId)throw new Error('RESUME_RUN_EVIDENCE_ID_MISMATCH');
    if(path.resolve(sourceDirectory)!==path.resolve(runDirectory))await writeFile(path.join(runDirectory,runId+'.json'),original);
  }
}
const started=performance.now();
await trainProject(project,runLabSeries,{signal:controller.signal,onProgress:p=>{currentPurpose=p.mode;if(p.completed===p.total)console.log(`${p.mode} ${p.opponent} ${p.checkpointId.slice(0,15)} ${p.completed}/${p.total}`);},
  onRun:async run=>{representativeRecords=run.records;games+=run.records.length;actions+=run.records.reduce((sum,r)=>sum+r.actionCount,0);const verifyStarted=performance.now();for(const evidence of run.replays){try{verifyLabReplay(run,evidence);replaysVerified++;}catch(error){replayErrors.push({runId:run.runId,replayId:evidence.replayId,error:error.message});}}replayVerificationMs+=performance.now()-verifyStarted;const saved=artifactEnvelope(researchRunEvidence(run,currentPurpose));validateArtifact(saved,identity);const text=JSON.stringify(saved);if(new TextEncoder().encode(text).byteLength>LAB_LIMITS.importBytes)throw new Error('RUN_EVIDENCE_STORAGE_BUDGET_EXCEEDED');const persistStarted=performance.now();await writeFile(path.join(runDirectory,run.runId+'.json'),text);persistMs+=performance.now()-persistStarted;},
  onSave:async p=>{const saveStarted=performance.now();await writeFile(output,JSON.stringify(researchEnvelope(p),null,2));persistMs+=performance.now()-saveStarted;}});
const elapsedMs=performance.now()-started,semantic=semanticTrainingResult(project);
const measure=(fn,n)=>{const begin=performance.now();for(let i=0;i<n;i++)fn();return performance.now()-begin;};
const profiling={checkpointSerialization1000Ms:measure(()=>JSON.stringify(project.checkpoints[0]),1000),checkpointHash1000Ms:measure(()=>hashCanonical(project.checkpoints[0]),1000),aggregate1000Ms:measure(()=>summarizeRecords(representativeRecords),1000),recordsPerAggregate:representativeRecords.length,note:'Microbenchmarks after training; wall throughput includes worker startup, transcript verification and persistence. These are not isolated worker-coordination or transcript-creation overhead estimates.'};
const report={status:project.experiment.status,identity,runDirectory,missingPriorRunEvidence,semantic,semanticHash:hashCanonical(semantic),benchmark:{games,actions,elapsedMs,gamesPerSecond:games/(elapsedMs/1000),actionsPerSecond:actions/(elapsedMs/1000),persistMs,replayVerificationMs,replaysVerified,replayErrors,profiling},artifact:researchEnvelope(project)};
await writeFile(output,JSON.stringify(report.artifact,null,2));
await writeFile(output.replace(/\.json$/,'')+'.report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,semanticHash:report.semanticHash,benchmark:report.benchmark,output},null,2));
if(report.status!=='COMPLETE'||replayErrors.length)process.exitCode=1;
