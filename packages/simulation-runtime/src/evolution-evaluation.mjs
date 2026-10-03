import { hashCanonical } from '@intrilex/shared';
import { validateCheckpoint, summarizeRecords } from './evolution-domain.mjs';
import { validateEvaluationPack, validateSuite, behaviorFingerprint } from './evolution-research.mjs';

/** Shared orchestration. executeSeries supplies Node or browser execution;
 * only training orchestration can select a descendant. No update hook here. */
export async function evaluateSuite({candidate,suite,pack,workerCount=1},executeSeries,{signal,onProgress=()=>{},onRun=()=>{}}={}) {
  const identity=candidate.identity;
  validateCheckpoint(candidate,identity);validateSuite(suite,identity);validateEvaluationPack(pack,identity);
  const before=hashCanonical(candidate),matchups=[];
  for(const opponent of suite.checkpoints){
    if(signal?.aborted)break;
    const result=await executeSeries({botA:candidate.policyId,botB:opponent.policyId,profileId:pack.profileId,gameCount:pack.sampleSize,seed:pack.provenance.baseSeed,seedCatalog:pack.seeds,mirrorSeats:true,kind:'EVALUATION',workerCount},
      {identity,startingCheckpoints:[candidate,opponent],signal,onProgress:p=>onProgress({...p,mode:pack.purpose,opponent:opponent.policyId,checkpointId:candidate.checkpointId,packId:pack.packId})});
    await onRun(result.run);
    const metrics=summarizeRecords(result.run.records);delete metrics.meanGameDurationMs;
    matchups.push({opponentCheckpointId:opponent.checkpointId,opponentPolicyId:opponent.policyId,status:result.run.status,metrics,
      behavior:behaviorFingerprint(result.run.records,candidate.checkpointId),semanticEvidenceHash:hashCanonical([...result.run.records].sort((a,b)=>a.ordinal-b.ordinal).map(r=>r.resultHash)),runId:result.run.runId});
    if(result.run.status!=='COMPLETE')break;
  }
  if(hashCanonical(candidate)!==before)throw new Error('EVALUATION_MUTATED_CHECKPOINT');
  const status=matchups.length===suite.checkpoints.length && matchups.every(m=>m.status==='COMPLETE') ? 'COMPLETE' : signal?.aborted ? 'STOPPED' : 'ERROR';
  const core={schemaVersion:1,candidateCheckpointId:candidate.checkpointId,suiteId:suite.suiteId,packId:pack.packId,purpose:pack.purpose,status,
    matchups:matchups.map(({runId:_runId,...m})=>m)};
  return {...core,matchups,evaluationId:`EV-${hashCanonical(core)}`};
}

export function matchupRegressions(before,after,threshold=0.05) {
  if(before.packId!==after.packId || before.suiteId!==after.suiteId)throw new Error('REGRESSION_REFERENCE_MISMATCH');
  return after.matchups.flatMap(m=>{
    const prior=before.matchups.find(p=>p.opponentCheckpointId===m.opponentCheckpointId);
    if(prior?.metrics.pairedScore===null || m.metrics.pairedScore===null || !prior)return [];
    const delta=m.metrics.pairedScore-prior.metrics.pairedScore;
    return delta < -threshold ? [{kind:'MATCHUP_REGRESSION',opponent:m.opponentPolicyId,delta,threshold,uncertainty:m.metrics.uncertainty}] : [];
  });
}
