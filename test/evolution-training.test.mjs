import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '@intrilex/shared';
import { evolutionIdentity,runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { trainingConfig,createTrainingProject,mutatePolicyState,mutationSeed,selectCandidate,trainProject,semanticTrainingResult } from '../packages/simulation-runtime/src/evolution-training.mjs';
import { createExperiment,researchEnvelope,parseResearchImport,validateResearchProject } from '../packages/simulation-runtime/src/evolution-research.mjs';
import { baselinePolicyState,WEIGHT_BOUND } from '../packages/policies/src/weighted-heuristic.mjs';
const identity=await evolutionIdentity();
function project(workerCount=1){
  const p=createTrainingProject({identity,seed:42,workerCount,training:{generations:2,candidates:1,mutationStep:500,trainingPairs:2,evaluationPairs:1}});
  const {suiteId:_suiteId,...suite}=p.suite;suite.checkpoints=suite.checkpoints.slice(0,1);suite.name='Focused frozen random reference';p.suite={...suite,suiteId:`ES-${hashCanonical(suite)}`};
  const e=p.experiment;p.experiment=createExperiment({identity,name:e.name,type:e.type,config:{...e.scientific.config,workerCount},startingCheckpoints:p.checkpoints,training:e.scientific.training,seedPackId:p.packs[0].packId,evaluationSuiteId:p.suite.suiteId});return p;
}
const selectionResult=(score,purpose='TRAINING',aborted=0)=>({purpose,status:'COMPLETE',matchups:[{metrics:{pairedScore:score,aborted,unresolved:0}}]});
test('training bounds and population restrictions reject unsafe configuration',()=>{
  for(const input of [{generations:101},{candidates:32},{mutationStep:0},{evolutionSeed:-1},{trainingPairs:0}])assert.throws(()=>trainingConfig(input));
});
test('A0 and B0 have identical state but independent immutable lineages',()=>{
  const p=project();assert.deepEqual(p.checkpoints[0].policyState,p.checkpoints[1].policyState);assert.notEqual(p.checkpoints[0].lineageId,p.checkpoints[1].lineageId);assert.ok(Object.isFrozen(p.checkpoints[0].policyState));
});
test('mutation stream is reproducible, bounded and independent of game/evaluation seeds',()=>{
  const p=project(),parent=baselinePolicyState();
  for(let seed=0;seed<128;seed++){const a=mutatePolicyState(parent,seed,1000),b=mutatePolicyState(parent,seed,1000);assert.deepEqual(a,b);assert.ok(Object.values(a.state.weights).every(v=>Math.abs(v)<=WEIGHT_BOUND));}
  const saturated=baselinePolicyState();saturated.weights.points=2000;assert.ok(mutatePolicyState(saturated,0,1000).state.weights.points<=2000);
  const before=JSON.stringify(p.packs);mutationSeed(p.experiment,p.checkpoints[0].lineageId,1,0);assert.equal(JSON.stringify(p.packs),before);
  assert.notEqual(mutationSeed(p.experiment,p.checkpoints[0].lineageId,1,0),mutationSeed(p.experiment,p.checkpoints[1].lineageId,1,0));
});
test('selection ignores held-out evidence and rejects failure-heavy candidates',()=>{
  const candidates=[{index:0,checkpointId:'parent',result:selectionResult(.6)},{index:1,checkpointId:'failed',result:selectionResult(1,'TRAINING',1)},{index:2,checkpointId:'leak',result:selectionResult(1,'EVALUATION')},{index:3,checkpointId:'child',result:selectionResult(.7)}];
  const selected=selectCandidate(candidates);assert.equal(selected.selected.checkpointId,'child');assert.equal(selected.disqualified.length,2);
  assert.equal(selectCandidate([candidates[0],{...candidates[3],result:selectionResult(.6)}]).selected.checkpointId,'parent');assert.throws(()=>selectCandidate(candidates.slice(1,3)));
});
test('research round trip preserves originals and rejects edited scientific state',()=>{
  const p=project(),round=parseResearchImport(JSON.stringify(researchEnvelope(p)),identity);assert.equal(round.evidenceOrigin,'IMPORTED_UNVERIFIED');assert.deepEqual(round.checkpoints,p.checkpoints);
  const bad=researchEnvelope(p);bad.payload.checkpoints[0].policyState.weights.points=1;assert.throws(()=>parseResearchImport(JSON.stringify(bad),identity));
});
test('valid manifest hashes cannot substitute missing project references',()=>{
  const p=project(),e=p.experiment;
  p.experiment=createExperiment({identity,name:e.name,type:e.type,config:e.scientific.config,startingCheckpoints:p.checkpoints,training:e.scientific.training,seedPackId:'EP-missing',evaluationSuiteId:p.suite.suiteId});
  assert.throws(()=>validateResearchProject(p,identity),/EXPERIMENT_REFERENCE_MISMATCH/);
});
test('real two-generation lineages reproduce with one and four workers',async()=>{
  const serial=project(1),parallel=project(4),roots=JSON.stringify(serial.checkpoints);
  await trainProject(serial,runLabSeries);await trainProject(parallel,runLabSeries);
  assert.equal(serial.experiment.status,'COMPLETE',JSON.stringify(serial.faults));assert.equal(parallel.experiment.status,'COMPLETE',JSON.stringify(parallel.faults));
  assert.equal(serial.generations.length,4);assert.deepEqual(semanticTrainingResult(serial),semanticTrainingResult(parallel));
  assert.equal(JSON.stringify(serial.checkpoints.slice(0,2)),roots);assert.equal(serial.generations[0].generation,1);assert.equal(serial.generations[2].generation,2);
  const hash=hashCanonical(semanticTrainingResult(serial));await trainProject(serial,runLabSeries);assert.equal(hashCanonical(semanticTrainingResult(serial)),hash);assert.equal(serial.generations.length,4);
  const envelope=researchEnvelope(serial);assert.equal(validateResearchProject(envelope.payload,identity).generations.length,4);
  const reordered=structuredClone(serial);reordered.generations.reverse();assert.throws(()=>validateResearchProject(reordered,identity),/GENERATION_HISTORY_MISMATCH/);
});
test('stop preserves generation boundary and resume reaches reproducible descendants',async()=>{
  const p=project(),controller=new AbortController();
  await trainProject(p,runLabSeries,{signal:controller.signal,onSave:()=>{if(p.generations.length===1)controller.abort();}});
  assert.equal(p.experiment.status,'STOPPED');assert.equal(p.generations.length,1);const id=p.generations[0].generationId;
  const restored=parseResearchImport(JSON.stringify(researchEnvelope(p)),identity);await trainProject(restored,runLabSeries);assert.equal(restored.experiment.status,'COMPLETE');assert.equal(restored.generations[0].generationId,id);assert.equal(restored.generations.length,4);
});
