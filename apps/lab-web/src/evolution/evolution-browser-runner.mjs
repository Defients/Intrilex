import { createLabRun, validateCheckpoint, summarizeRecords, validateArtifact, artifactEnvelope, LAB_LIMITS } from './evolution-domain.mjs';
import { EvolutionSession } from './evolution-session.mjs';

/** Browser adapter uses the same claim/epoch/evidence authority as the existing
 * arena. No planning, scoring or trainer logic is defined in this adapter.
 * onAcceptedGame(evidence, run) fires after EvolutionSession accepts a
 * finalized record — its awaited return applies persistence backpressure
 * before the next ordinal is dispatched. Callback failures are collected as
 * persistErrors; they never alter game execution.
 * options.run supplies a prepared run (Batch Matrix cells, resumed work):
 * it is revalidated, its accepted ordinals are skipped by the claim owner, and
 * elapsed execution time accumulates rather than resetting. */
export async function executeBrowserSeries(input,{identity,startingCheckpoints,arenaProfiles,signal,onProgress=()=>{},onAcceptedGame,run:prepared=null}={}) {
  const persistErrors=[];
  const run=prepared?validateArtifact(artifactEnvelope(prepared),identity):createLabRun(input,identity);
  if(!prepared&&startingCheckpoints){run.checkpoints=startingCheckpoints.map(cp=>validateCheckpoint(cp,identity));if(run.checkpoints.length!==2 || run.checkpoints[0].policyId!==run.config.botA || run.checkpoints[1].policyId!==run.config.botB)throw new Error('CHECKPOINT_CONFIG_MISMATCH');}
  if(!prepared&&arenaProfiles)run.arenaProfiles=structuredClone(arenaProfiles);
  if(run.status==='COMPLETE')return {run,metrics:summarizeRecords(run.records),persistErrors};
  const owner=new EvolutionSession(run),epoch=owner.start(),started=performance.now();
  if(owner.seen.size>=run.config.gameCount){run.status='COMPLETE';return {run,metrics:summarizeRecords(run.records),persistErrors};}
  const workers=[],timers=new Map();
  await new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;signal?.removeEventListener('abort',cancel);for(const timer of timers.values())clearTimeout(timer);for(const worker of workers)worker.terminate();run.elapsedMs=(run.elapsedMs??0)+(performance.now()-started);resolve();};
    const cancel=()=>{owner.stop();finish();};
    const fault=error=>{if(done)return;owner.error(String(error?.stack??error).slice(0,2000));run.error=String(error?.message??error);finish();};
    const dispatch=(worker,index)=>{const ordinal=owner.claim(index);if(ordinal===null)return;worker.postMessage({type:'run-evolution-game',workerIndex:index,epoch,ordinal,retainReplay:ordinal<LAB_LIMITS.replays,run:{runId:run.runId,config:run.config,identity,checkpoints:run.checkpoints,...(run.arenaProfiles?{arenaProfiles:run.arenaProfiles}:{})}});timers.set(worker,setTimeout(()=>fault(new Error(`WORKER_TIMEOUT:${ordinal}`)),30000));};
    if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
    try{for(let index=0;index<Math.min(run.config.workerCount,run.config.gameCount);index++){
      const worker=new Worker('worker.js',{type:'module'});workers.push(worker);
      worker.onmessage=async e=>{if(done || e.data.epoch!==epoch || owner.run.status!=='RUNNING')return;try{if(e.data.type==='evolution-fault')throw new Error(e.data.error);if(e.data.type!=='evolution-evidence' || !owner.accept(index,epoch,e.data.evidence))return;clearTimeout(timers.get(worker));if(onAcceptedGame)try{await onAcceptedGame(e.data.evidence,run);}catch(error){persistErrors.push(String(error?.message??error));}onProgress({completed:run.records.length,total:run.config.gameCount,record:e.data.evidence.record});if(run.status==='COMPLETE')finish();else dispatch(worker,index);}catch(error){fault(error);}};
      worker.onerror=e=>{if(!done)fault(new Error(e.message??'WORKER_FAILED'));};
      worker.onmessageerror=()=>{if(!done)fault(new Error('WORKER_MESSAGE_FAILED'));};dispatch(worker,index);
    }}catch(error){fault(error);}
  });
  return {run,metrics:summarizeRecords(run.records),persistErrors};
}
