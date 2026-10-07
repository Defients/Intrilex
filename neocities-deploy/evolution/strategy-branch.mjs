import { STRATEGY_CONTRACTS, verifyStrategy, validateDecisionEvent, strategyDigest, sealStrategy, strategyFail, decisionContext, normalizeStrategyAction, CLEAN_ENDINGS } from './strategy-contracts.mjs';

/** A plan is immutable and complete BEFORE any continuation outcome exists. */
export function planStrategyBranch(event,{seeds,replicationPack='EXPLORATORY_V1',decisionLimit=300,actionIds}={}) {
  validateDecisionEvent(event);
  const catalog=seeds??Array.from({length:16},(_,ordinal)=>(Number.parseInt(strategyDigest({stream:'STRATEGY_CONTINUATION_V1',eventId:event.artifactId,ordinal}).slice(0,8),16)>>>0)||1);
  if(!Array.isArray(catalog) || catalog.length<2 || catalog.length>128 || new Set(catalog).size!==catalog.length || catalog.some(s=>!Number.isInteger(s)||s<1||s>0xffffffff))strategyFail('STRATEGY_SEED_CATALOG_INVALID');
  if(!Number.isInteger(decisionLimit) || decisionLimit<1 || decisionLimit>1800)strategyFail('STRATEGY_BRANCH_BUDGET_INVALID');
  const selected=event.selectedActionId;
  // Deterministic selection of competitors by family first, then remaining IDs.
  const alternatives=event.candidates.filter(c=>c.actionId!==selected),families=new Set();
  const diversified=alternatives.filter(c=>{if(families.has(c.family))return false;families.add(c.family);return true;});
  const ids=actionIds??[selected,...[...diversified,...alternatives].map(c=>c.actionId)].filter((id,i,a)=>a.indexOf(id)===i).slice(0,6);
  if(ids.length<2 || ids.length>8 || !ids.includes(selected) || new Set(ids).size!==ids.length || ids.some(id=>!event.candidates.some(a=>a.actionId===id)))strategyFail('STRATEGY_ILLEGAL_BRANCH_SET');
  return sealStrategy('STRATEGY_BRANCH_PLAN_V1',{eventId:event.artifactId,fingerprint:event.identity.fingerprint,eraId:event.identity.eraId,rulesProfile:event.identity.rulesProfile,
    stateHash:event.replayAnchor.stateHash,actualActionId:selected,actionIds:ids,seeds:catalog,decisionLimit,replicationPack,
    continuationCheckpointIds:event.seat===1?[event.identity.checkpointId,event.identity.opponentCheckpointId]:[event.identity.opponentCheckpointId,event.identity.checkpointId],
    informationScope:'RESEARCH_ONLY',method:'EXACT_HIDDEN_STATE_COMMON_POLICY_RNG_V1',fixedBudget:true,stoppingRule:'ALL_BRANCHES_ALL_SEEDS; faults invalidate comparison',
    seatControl:'RECORDED_SEAT_FIXED; no artificial swapping of asymmetric decision states',
    randomControl:'Policy RNG is initialized from the same continuation seed in each branch. Engine RNG and hidden deck remain the exact recorded state.'});
}
export function reconstructStrategyDecision({event,replay,identity,authority}) {
  validateDecisionEvent(event);
  if(event.identity.fingerprint!==identity.fingerprint)strategyFail('STRATEGY_BRANCH_STALE_FINGERPRINT');
  if(strategyDigest(replay.initialState)!==event.replayAnchor.initialStateHash || strategyDigest(replay.commands)!==event.replayAnchor.actionSequenceHash)strategyFail('STRATEGY_BRANCH_TRANSCRIPT_MISMATCH');
  const seeded=authority.createState({profileId:event.identity.rulesProfile,playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed:event.identity.derivedSeed});
  if(strategyDigest(seeded)!==event.replayAnchor.initialStateHash)strategyFail('STRATEGY_BRANCH_SEED_MISMATCH');
  let state=structuredClone(replay.initialState),decisionState=null;
  for(const [index,command] of replay.commands.entries()) {
    if(index===event.replayAnchor.commandIndex)decisionState=structuredClone(state);
    const result=authority.execute(state,command);
    if(!result.accepted)strategyFail('STRATEGY_BRANCH_REPLAY_REJECTED');
    state=result.state;
  }
  if(!decisionState || strategyDigest(state)!==event.replayAnchor.finalStateHash || strategyDigest(decisionState)!==event.replayAnchor.stateHash)strategyFail('STRATEGY_BRANCH_STATE_MISMATCH');
  const frame=authority.frame(decisionState);
  if(frame.status!=='PLAYER_DECISION_REQUIRED' || frame.decisionActorId!==event.actorId || frame.executedCommands.length || strategyDigest(frame.state)!==event.replayAnchor.stateHash)strategyFail('STRATEGY_BRANCH_FRAME_MISMATCH');
  if(strategyDigest(frame.policyActions.map(a=>a.actionId).sort((a,b)=>a.localeCompare(b)))!==event.legalSetDigest || strategyDigest(frame.resolve(event.selectedActionId))!==strategyDigest(replay.commands[event.replayAnchor.commandIndex]))strategyFail('STRATEGY_BRANCH_LEGAL_MISMATCH');
  const view=authority.view(frame.state,event.actorId);
  if(strategyDigest(decisionContext(view))!==strategyDigest(event.context))strategyFail('STRATEGY_BRANCH_CONTEXT_MISMATCH');
  const core=candidates=>candidates.map(({policyScore:_score,decomposition:_decomposition,...candidate})=>candidate);
  const candidates=frame.policyActions.map(a=>normalizeStrategyAction(a,view)).sort((a,b)=>a.actionId.localeCompare(b.actionId));
  if(strategyDigest(core(candidates))!==strategyDigest(core(event.candidates)))strategyFail('STRATEGY_BRANCH_DESCRIPTOR_MISMATCH');
  return frame;
}
export async function executeStrategyBranch({event,replay,identity,checkpoints,plan,authority,continueMatch,signal,onProgress=()=>{}}) {
  verifyStrategy(plan,'STRATEGY_BRANCH_PLAN_V1');
  const expected=planStrategyBranch(event,{seeds:plan.seeds,decisionLimit:plan.decisionLimit,replicationPack:plan.replicationPack,actionIds:plan.actionIds});
  if(expected.artifactId!==plan.artifactId)strategyFail('STRATEGY_BRANCH_PLAN_MISMATCH');
  const frozen=plan.continuationCheckpointIds.map(id=>checkpoints.find(cp=>cp.checkpointId===id));
  if(frozen.some(cp=>!cp || cp.identity.fingerprint!==identity.fingerprint))strategyFail('STRATEGY_CONTINUATION_CHECKPOINT_MISSING');
  frozen.forEach(cp=>authority.validateCheckpoint(cp,identity));
  const checkpointDigest=strategyDigest(frozen),frame=reconstructStrategyDecision({event,replay,identity,authority}),rows=[];
  let status='COMPLETE';
  for(const seed of plan.seeds) {
    for(const actionId of plan.actionIds) {
      await new Promise(resolve=>setTimeout(resolve,0));
      if(signal?.aborted){status='CANCELLED';break;}
      const applied=authority.execute(structuredClone(frame.state),frame.resolve(actionId));
      if(!applied.accepted)strategyFail('STRATEGY_BRANCH_ACTION_REJECTED');
      const result=await continueMatch({initialState:applied.state,seed,policyIds:frozen.map(cp=>cp.policyId),policyStates:frozen.map(cp=>cp.schemaVersion===2?cp.policyState:null),adaptiveConfigs:frozen.map(cp=>cp.schemaVersion===2?(cp.adaptive??null):null),profileId:plan.rulesProfile,
        decisionLimit:plan.decisionLimit,orchestrationCommandLimit:256,telemetryEnabled:false});
      const summary=result.summary??result;
      const clean=CLEAN_ENDINGS.includes(summary.terminationReason) && ['P1','P2','DRAW'].includes(summary.winner);
      rows.push({seed,actionId,winner:summary.winner,score:clean?(summary.winner==='DRAW'?0.5:summary.winner===event.actorId?1:0):null,
        terminalOwnScore:summary.finalScores[event.actorId],terminationReason:summary.terminationReason,finalStateHash:summary.finalStateHash,clean});
      onProgress({completed:rows.length,total:plan.seeds.length*plan.actionIds.length});
    }
    if(status==='CANCELLED')break;
  }
  if(strategyDigest(frozen)!==checkpointDigest)strategyFail('STRATEGY_CONTINUATION_MUTATED_CHECKPOINT');
  const faults=rows.filter(r=>!r.clean).length;if(faults)status=status==='CANCELLED'?'CANCELLED':'NON_CLEAN';
  const comparisons=status==='COMPLETE'?plan.actionIds.filter(id=>id!==plan.actualActionId).map(actionId=>{
    const paired=plan.seeds.map(seed=>rows.find(r=>r.seed===seed&&r.actionId===actionId).score-rows.find(r=>r.seed===seed&&r.actionId===plan.actualActionId).score);
    const delta=paired.reduce((a,b)=>a+b,0)/paired.length;
    // Hoeffding on paired differences in [-1,1], Bonferroni over planned alternatives.
    const half=Math.sqrt(2*Math.log(2*(plan.actionIds.length-1)/0.05)/paired.length);
    const alternative=event.candidates.find(c=>c.actionId===actionId);
    return {actionId,alternativeLabel:`${alternative.family} · ${alternative.mode}`,delta,interval:[Math.max(-1,delta-half),Math.min(1,delta+half)],pairedCount:paired.length};
  }):[];
  return sealStrategy(STRATEGY_CONTRACTS.branch,{schemaVersion:1,plan,status,faults,rows,comparisons,context:event.context,subject:event.candidates.find(a=>a.actionId===event.selectedActionId).subjects,
    opportunitySubjects:[...new Set(event.candidates.flatMap(c=>c.subjects))].sort(),sourceIdentity:event.identity,seat:event.seat,maturity:event.maturity,sourceEventId:event.artifactId,checkpointDigest,informationScope:'RESEARCH_ONLY',caveats:['Exact hidden state, not an acting-player information set.','Deterministic continuation policies can make all seed outcomes identical. Seeds do not create independent hidden states.','One recorded state is not replication.','Bounds assume independent continuation policy seeds; a fixed catalog does not establish generalization.','Short budgets can produce censored/non-clean studies; these do not support comparisons.','No optional stopping or observed-outcome seed selection.']});
}
export function claimFromStrategyBranch(study,generatedAt=new Date().toISOString()) {
  verifyStrategy(study,STRATEGY_CONTRACTS.branch);
  if(study.status!=='COMPLETE')return [];
  return study.comparisons.map(c=>sealStrategy(STRATEGY_CONTRACTS.claim,{schemaVersion:1,subject:study.subject[0],scope:{fingerprint:study.plan.fingerprint,rulesProfile:study.plan.rulesProfile,eraId:study.plan.eraId,filters:{eventId:study.sourceEventId}},
    evidenceType:'COUNTERFACTUAL',recommendation:'UNKNOWN',estimatedMagnitude:c.delta,uncertainty:{interval:c.interval,method:'PAIRED_HOEFFDING_FAMILYWISE_95'},confidence:'EXPERIMENTAL',informationScope:'RESEARCH_ONLY',
    sampleSize:study.rows.length,opportunityCount:1,selectedCount:1,independentStateCount:1,seedBlocks:study.plan.seeds.length,pairedCount:c.pairedCount,policies:[],checkpoints:study.plan.continuationCheckpointIds,matchups:[],
    provenance:[study.artifactId,study.sourceEventId],generatedAt,caveats:study.caveats,stale:false,invalidated:false,origin:'LOCAL_REPRODUCTION',statementData:{alternative:c.alternativeLabel,actionId:c.actionId}}));
}
