import { hashCanonical } from '@intrilex/shared';
import { createTrainableCheckpoint } from './evolution-domain.mjs';
import { createEvaluationPack, createBaselineSuite, createExperiment, validateResearchProject, reconstructLineage } from './evolution-research.mjs';
import { evaluateSuite, matchupRegressions } from './evolution-evaluation.mjs';
import { baselinePolicyState, validatePolicyState, WEIGHT_FEATURES, WEIGHT_BOUND, WEIGHTED_POLICY_ID } from '../../policies/src/weighted-heuristic.mjs';

export function trainingConfig(input={}) {
  const config={algorithm:'ONE_PLUS_LAMBDA_V1',generations:input.generations??2,candidates:input.candidates??2,mutationStep:input.mutationStep??250,evolutionSeed:input.evolutionSeed??31091,trainingPairs:input.trainingPairs??2,evaluationPairs:input.evaluationPairs??2,regressionThreshold:input.regressionThreshold??0.05,baselineState:baselinePolicyState()};
  if(!Number.isInteger(config.generations)||config.generations<1||config.generations>100 || !Number.isInteger(config.candidates)||config.candidates<1||config.candidates>4 || !Number.isInteger(config.mutationStep)||config.mutationStep<1||config.mutationStep>1000 || !Number.isInteger(config.evolutionSeed)||config.evolutionSeed<0||config.evolutionSeed>0xffffffff || [config.trainingPairs,config.evaluationPairs].some(n=>!Number.isInteger(n)||n<1||n>5000) || !Number.isFinite(config.regressionThreshold)||config.regressionThreshold<0||config.regressionThreshold>1)throw new Error('INVALID_TRAINING_CONFIG');
  return config;
}
export function createTrainingProject({identity,name='Independent Heuristic Evolution #001',seed=1337,workerCount=2,profileId='core-advanced-authority',training={}}) {
  const config=trainingConfig(training),suite=createBaselineSuite(identity);
  const packs=[createEvaluationPack({identity,baseSeed:seed,pairCount:config.trainingPairs,profileId,purpose:'TRAINING',name:'Selection seeds v1'}),createEvaluationPack({identity,baseSeed:(seed^0x5bd1e995)>>>0,pairCount:config.evaluationPairs,profileId,purpose:'EVALUATION',name:'Held-out frozen seeds v1'})];
  if(packs[0].seeds.some(seed=>packs[1].seeds.includes(seed)))throw new Error('TRAINING_EVALUATION_SEED_OVERLAP');
  const checkpoints=['A','B'].map(agentId=>createTrainableCheckpoint({identity,agentId,lineageId:`LINEAGE-${hashCanonical({seed,evolutionSeed:config.evolutionSeed,agentId,policyState:config.baselineState})}`,policyState:config.baselineState,trainingConfiguration:config,createdAt:'2026-10-02T00:00:00.000Z'}));
  const experiment=createExperiment({identity,name,type:'EVOLUTION_TRAINING',hypothesis:'Independent bounded heuristic lineages may develop measurable matchup and behavior differences.',config:{botA:WEIGHTED_POLICY_ID,botB:WEIGHTED_POLICY_ID,gameCount:config.trainingPairs*2,seed,workerCount,profileId},startingCheckpoints:checkpoints,seedPackId:packs[0].packId,evaluationSuiteId:suite.suiteId,training:config});
  return validateResearchProject({schemaVersion:1,experiment,suite,packs,checkpoints,generations:[],evaluations:[],faults:[]},identity);
}
export function mutationSeed(experiment,lineageId,generation,mutationIndex) {
  return Number.parseInt(hashCanonical({stream:'EVOLUTION_MUTATION_V1',scientificId:experiment.scientificId,evolutionSeed:experiment.scientific.training.evolutionSeed,lineageId,generation,mutationIndex}).slice(0,8),16)>>>0;
}
export function mutatePolicyState(parent,seed,step) {
  validatePolicyState(parent);
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(step)||step<1||step>1000)throw new Error('INVALID_MUTATION');
  const state=structuredClone(parent),parameter=WEIGHT_FEATURES[seed%WEIGHT_FEATURES.length],before=state.weights[parameter];
  const signed=((seed>>>8)&1)?step:-step,after=Math.max(-WEIGHT_BOUND,Math.min(WEIGHT_BOUND,before+signed));state.weights[parameter]=after;
  return {state,metadata:{kind:'BOUNDED_SINGLE_FEATURE_V1',parameter,before,after,delta:after-before,mutationSeed:seed,step}};
}
/** No evaluation data is accepted here. Any failed/unresolved game disqualifies
 * a candidate; ties prefer parent, then deterministic mutation index. */
export function selectCandidate(results) {
  const admitted=results.filter(r=>r.result.purpose==='TRAINING' && r.result.status==='COMPLETE' && r.result.matchups.length && r.result.matchups.every(m=>m.metrics.aborted===0 && m.metrics.unresolved===0 && m.metrics.pairedScore!==null));
  if(!admitted.length)throw new Error('NO_TRUSTWORTHY_SELECTION_CANDIDATE');
  const ranked=admitted.map(r=>({...r,fitness:r.result.matchups.reduce((s,m)=>s+m.metrics.pairedScore,0)/r.result.matchups.length})).sort((a,b)=>b.fitness-a.fitness || a.index-b.index);
  return {selected:ranked[0],ranking:ranked.map(r=>({index:r.index,checkpointId:r.checkpointId,fitness:r.fitness})),disqualified:results.filter(r=>!admitted.includes(r)).map(r=>({checkpointId:r.checkpointId,reason:'INCOMPLETE_OR_FAILED_SELECTION_EVIDENCE'})),criterion:'Mean paired score across TRAINING opponents only; ties retain parent then lower mutation index. Zero failed/unresolved games required.'};
}
const add=(array,item,key)=>{if(!array.some(x=>x[key]===item[key]))array.push(item);};

export async function trainProject(project,executeSeries,{signal,onProgress=()=>{},onSave=()=>{},onRun=()=>{}}={}) {
  const identity=project.experiment.identity;validateResearchProject(project,identity);
  if(project.experiment.type!=='EVOLUTION_TRAINING')throw new Error('NOT_TRAINING_EXPERIMENT');
  const settings=trainingConfig(project.experiment.scientific.training);
  if(hashCanonical(settings)!==hashCanonical(project.experiment.scientific.training))throw new Error('INVALID_TRAINING_CONFIG');
  const trainingPack=project.packs.find(p=>p.purpose==='TRAINING'),evaluationPack=project.packs.find(p=>p.purpose==='EVALUATION');
  if(!trainingPack||!evaluationPack||trainingPack.seeds.some(seed=>evaluationPack.seeds.includes(seed)))throw new Error('TRAINING_EVALUATION_SEED_OVERLAP');
  const roots=project.experiment.scientific.startingCheckpointIds.map(id=>project.checkpoints.find(cp=>cp.checkpointId===id));
  if(roots.length!==2 || roots.some(cp=>cp?.schemaVersion!==2 || cp.generation!==0) || roots[0].lineageId===roots[1].lineageId || hashCanonical(roots[0].policyState)!==hashCanonical(roots[1].policyState))throw new Error('INVALID_TRAINING_ROOTS');
  const snapshot=hashCanonical(roots),workerCount=project.experiment.operational.workerCount;
  project.experiment.status='RUNNING';
  const evaluate=async(candidate,pack)=>{
    const cached=project.evaluations.find(e=>e.candidateCheckpointId===candidate.checkpointId && e.packId===pack.packId && e.suiteId===project.suite.suiteId && e.status==='COMPLETE');
    if(cached)return cached;
    const result=await evaluateSuite({candidate,suite:project.suite,pack,workerCount},executeSeries,{signal,onProgress,onRun:async run=>{if(!project.experiment.runIds.includes(run.runId))project.experiment.runIds.push(run.runId);await onRun(run);}});
    // Store execution references separately from checkpoint state. Even stopped
    // results preserve failure evidence; later retries can complete the suite.
    add(project.evaluations,result,'evaluationId');if(!project.experiment.evaluationIds.includes(result.evaluationId))project.experiment.evaluationIds.push(result.evaluationId);
    return result;
  };
  try {
    for(const root of roots){if(signal?.aborted)break;await evaluate(root,evaluationPack);await onSave(project);}
    for(let generation=1;generation<=settings.generations&&!signal?.aborted;generation++)for(const root of roots){
      if(signal?.aborted)break;
      const previous=project.generations.find(g=>g.lineageId===root.lineageId && g.generation===generation);
      if(previous){const selected=project.checkpoints.find(cp=>cp.checkpointId===previous.selectedCheckpointId);await evaluate(selected,evaluationPack);continue;}
      const prior=project.generations.find(g=>g.lineageId===root.lineageId && g.generation===generation-1);
      const parent=prior ? project.checkpoints.find(cp=>cp.checkpointId===prior.selectedCheckpointId) : root;
      if(parent.generation!==generation-1)throw new Error('MISSING_GENERATION_PARENT');
      const started=performance.now(),candidates=[parent],mutations=[];
      for(let index=0;index<settings.candidates;index++){
        const mutation=mutatePolicyState(parent.policyState,mutationSeed(project.experiment,root.lineageId,generation,index),settings.mutationStep);
        const cp=createTrainableCheckpoint({identity,agentId:root.agentId,lineageId:root.lineageId,parent,policyState:mutation.state,trainingConfiguration:settings,mutation:mutation.metadata,experimentId:project.experiment.experimentId,createdAt:project.experiment.createdAt});
        candidates.push(cp);mutations.push(mutation.metadata);add(project.checkpoints,cp,'checkpointId');
      }
      const results=[];
      for(let index=0;index<candidates.length&&!signal?.aborted;index++){
        const candidate=candidates[index],result=await evaluate(candidate,trainingPack);results.push({index,checkpointId:candidate.checkpointId,result});await onSave(project);
      }
      if(signal?.aborted)break;
      const decision=selectCandidate(results),source=candidates[decision.selected.index];
      const selected=source===parent ? createTrainableCheckpoint({identity,agentId:root.agentId,lineageId:root.lineageId,parent,policyState:parent.policyState,trainingConfiguration:settings,mutation:{kind:'RETAIN_PARENT',sourceCheckpointId:parent.checkpointId},experimentId:project.experiment.experimentId,createdAt:project.experiment.createdAt}) : source;
      add(project.checkpoints,selected,'checkpointId');
      const record={schemaVersion:1,lineageId:root.lineageId,generation,parentCheckpointId:parent.checkpointId,candidateCheckpointIds:candidates.map(cp=>cp.checkpointId),mutations,trainingPackId:trainingPack.packId,evaluationPackId:evaluationPack.packId,selection:{ranking:decision.ranking,disqualified:decision.disqualified,criterion:decision.criterion},selectedCheckpointId:selected.checkpointId,candidateEvaluationIds:results.map(r=>r.result.evaluationId)};
      // Commit selection before held-out evaluation. A stop/resume can finish
      // evaluation but cannot choose a different child from held-out feedback.
      project.generations.push({...record,generationId:`EG-${hashCanonical(record)}`,elapsedMs:performance.now()-started});await onSave(project);
      const evaluation=await evaluate(selected,evaluationPack);
      const baseline=project.evaluations.find(e=>e.candidateCheckpointId===root.checkpointId&&e.packId===evaluationPack.packId&&e.status==='COMPLETE');
      if(evaluation.status==='COMPLETE'&&baseline){
        project.regressions??=[];
        const strongPrior=project.generations.filter(g=>g.lineageId===root.lineageId && g.generation<generation).sort((a,b)=>b.selection.ranking[0].fitness-a.selection.ranking[0].fitness)[0];
        const referenceIds=new Set([root.checkpointId,parent.checkpointId,strongPrior?.selectedCheckpointId].filter(Boolean));
        for(const referenceId of referenceIds){const reference=project.evaluations.find(e=>e.candidateCheckpointId===referenceId && e.packId===evaluationPack.packId && e.status==='COMPLETE');if(!reference)continue;for(const finding of matchupRegressions(reference,evaluation,settings.regressionThreshold))project.regressions.push({...finding,checkpointId:selected.checkpointId,referenceCheckpointId:referenceId});}
      }
      await onSave(project);
    }
    if(hashCanonical(roots)!==snapshot)throw new Error('TRAINING_MUTATED_BASELINE');
    project.experiment.status=signal?.aborted?'STOPPED':project.evaluations.some(e=>e.purpose==='EVALUATION' && e.status==='ERROR')?'ERROR':'COMPLETE';
  } catch(error){project.experiment.status='ERROR';project.faults.push({experimentId:project.experiment.experimentId,message:String(error.stack??error).slice(0,4000),lastGenerationIds:project.generations.slice(-2).map(g=>g.generationId)});}
  validateResearchProject(project,identity);await onSave(project);return project;
}

export function semanticTrainingResult(project) {
  return {scientificId:project.experiment.scientificId,checkpointIds:project.checkpoints.map(cp=>cp.checkpointId).sort(),generationIds:project.generations.map(g=>g.generationId),evaluationIds:project.evaluations.filter(e=>e.status==='COMPLETE').map(e=>e.evaluationId).sort(),lineages:project.experiment.scientific.startingCheckpointIds.map(id=>{
    const root=project.checkpoints.find(cp=>cp.checkpointId===id),history=project.generations.filter(g=>g.lineageId===root.lineageId);return reconstructLineage(project.checkpoints,history.at(-1)?.selectedCheckpointId??id).map(cp=>cp.checkpointId);
  })};
}
