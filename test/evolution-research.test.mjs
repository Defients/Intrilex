import test from 'node:test';
import assert from 'node:assert/strict';
import { evolutionIdentity, runLabGame, runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { createLabRun, createCheckpoint, createTrainableCheckpoint, validateCheckpoint, gamePlan, artifactEnvelope, inspectHistoricalArtifact } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { createEvaluationPack, validateEvaluationPack, createBaselineSuite, createExperiment, cloneExperiment, validateExperiment, reconstructLineage, compareCheckpoints, behaviorFingerprint } from '../packages/simulation-runtime/src/evolution-research.mjs';
import { evaluateSuite } from '../packages/simulation-runtime/src/evolution-evaluation.mjs';
import { baselinePolicyState, chooseWeightedAction } from '../packages/policies/src/weighted-heuristic.mjs';
const identity=await evolutionIdentity(),date='2026-10-02T16:00:00.000Z';
const config={botA:'control',botB:'tempo',gameCount:4,seed:42};
const checkpoint=(over={})=>createTrainableCheckpoint({identity,agentId:'A',policyState:baselinePolicyState(),createdAt:date,...over});

test('scientific identity excludes worker count and clock',()=>{
  const a=createExperiment({identity,config,createdAt:date}),b=createExperiment({identity,config:{...config,workerCount:4}});
  assert.equal(a.scientificId,b.scientificId);assert.equal(a.experimentId,b.experimentId);
  assert.notEqual(a.scientificId,createExperiment({identity,config:{...config,seed:43}}).scientificId);
});
test('clone preserves scientific variables and records exact changes',()=>{
  const a=createExperiment({identity,config,name:'A'}),b=cloneExperiment(a);
  assert.deepEqual(a.scientific,b.scientific);assert.deepEqual(b.changes,[]);assert.equal(b.parentExperimentId,a.experimentId);
  const c=cloneExperiment(a,{config:{seed:44,workerCount:4}});
  assert.deepEqual(c.changes,[{path:'scientific.config.seed',before:42,after:44}]);
});
test('invalid experiment and tampered frozen pack are rejected',()=>{
  const a=createExperiment({identity,config});a.scientific.config.seed=44;assert.throws(()=>validateExperiment(a,identity));
  const pack=createEvaluationPack({identity,pairCount:2,baseSeed:42});assert.ok(Object.isFrozen(pack.seeds));
  const altered=structuredClone(pack);altered.seeds[0]++;assert.throws(()=>validateEvaluationPack(altered,identity));
});
test('frozen catalogs expose the same explicit seed twice, equally in each seat',()=>{
  const pack=createEvaluationPack({identity,pairCount:2});const r=createLabRun({...config,seedCatalog:pack.seeds},identity,date);
  for(let i=0;i<4;i+=2){assert.equal(gamePlan(r.config,i).seed,pack.seeds[i/2]);assert.equal(gamePlan(r.config,i).seed,gamePlan(r.config,i+1).seed);assert.equal(gamePlan(r.config,i+1).swapped,true);}
});
test('v1 baseline is readable and remains schema 1',()=>{
  const cp=createCheckpoint({identity,policyId:'control',agentId:'frozen',createdAt:date});assert.deepEqual(validateCheckpoint(cp,identity),cp);assert.equal(cp.schemaVersion,1);
  const r=createLabRun(config,identity,date);assert.equal(inspectHistoricalArtifact(artifactEnvelope(r)).archival,true);
});
test('v2 semantic identity is stable across clocks and changes with state',()=>{
  const a=checkpoint(),b=checkpoint({createdAt:'2026-10-02T17:00:00.000Z'});assert.equal(a.checkpointId,b.checkpointId);
  assert.deepEqual(validateCheckpoint(JSON.parse(JSON.stringify(a)),identity),a);
  const state=baselinePolicyState();state.weights.points=10;assert.notEqual(a.checkpointId,checkpoint({policyState:state}).checkpointId);
  assert.throws(()=>checkpoint({policyState:{...state,weights:{...state.weights,points:2001}}}));
});
test('ancestry is explicit and incomplete/foreign parents rejected',()=>{
  const a=checkpoint(),b=checkpoint({parent:a});assert.equal(b.generation,1);assert.deepEqual(reconstructLineage([b,a],b.checkpointId),[a,b]);
  assert.throws(()=>reconstructLineage([b],b.checkpointId));assert.throws(()=>checkpoint({parent:a,lineageId:'B'}));
  assert.throws(()=>validateCheckpoint({...a,identity:{...identity,runtimeHash:'0'.repeat(64)}},identity));
});
test('adaptive state always selects a legal action reproducibly',()=>{
  const ctx={actorId:'P1',authorizedView:{own:{hand:[],securedPoints:0,goal:21}},legalActions:[{actionId:'b',family:'draw',featureVector:{}},{actionId:'a',family:'score',featureVector:{immediatePoints:5}}]};
  const state=baselinePolicyState(),a=chooseWeightedAction(state,ctx);assert.ok(ctx.legalActions.includes(a));assert.deepEqual(a,chooseWeightedAction(JSON.parse(JSON.stringify(state)),ctx));
});
test('weighted Node/browser game trajectories and candidate seat telemetry agree',async()=>{
  const {runBrowserPolicyMatch}=await import('../apps/lab-web/dist/autonomy-runtime.js');
  const r=createLabRun({...config,botA:'weighted-heuristic-v1'},identity,date);r.checkpoints[0]=checkpoint();
  const node=runLabGame(r,0),plan=gamePlan(r.config,0);
  const browser=runBrowserPolicyMatch({...plan,profileId:r.config.profileId,policyStates:[r.checkpoints[0].policyState,null],recordReplay:true});
  assert.deepEqual(browser.replay.commands,node.replay.commands);assert.equal(browser.finalStateHash,node.record.finalStateHash);
  const behavior=behaviorFingerprint([node.record],r.checkpoints[0].checkpointId);assert.equal(behavior.availableGames,1);assert.ok(behavior.decisions>0);assert.ok(Object.keys(behavior.actionRates).length>0);
});
test('named suite preserves frozen candidate and measurable matchup vector',async()=>{
  const candidate=checkpoint(),pack=createEvaluationPack({identity,pairCount:1}),suite=createBaselineSuite(identity),before=JSON.stringify(candidate);
  const result=await evaluateSuite({candidate,pack,suite},runLabSeries);
  assert.equal(result.status,'COMPLETE');assert.equal(result.matchups.length,5);assert.equal(JSON.stringify(candidate),before);
  for(const m of result.matchups){assert.equal(m.metrics.games,2);assert.equal(m.metrics.pairCount,1);assert.equal(m.behavior.availableGames,2);}
  assert.equal(compareCheckpoints(candidate,candidate,[result]).matchups.length,5);
});
