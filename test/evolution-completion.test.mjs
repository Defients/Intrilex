import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '@intrilex/shared';
import { evolutionIdentity, runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { createLabRun } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { createTrainingProject, trainProject, selectCandidate, semanticTrainingResult } from '../packages/simulation-runtime/src/evolution-training.mjs';
import { compareCheckpoints, validateResearchProject, researchEnvelope, parseResearchImport, inspectResearchArtifact, behaviorDeltas } from '../packages/simulation-runtime/src/evolution-research.mjs';
import { evaluateSuite } from '../packages/simulation-runtime/src/evolution-evaluation.mjs';

const identity=await evolutionIdentity();
const makeProject=()=>createTrainingProject({identity,seed:1337,training:{generations:1,candidates:1,trainingPairs:1,evaluationPairs:1}});
const evaluationId=ev=>{const {evaluationId:_id,matchups,...core}=ev;return `EV-${hashCanonical({...core,matchups:matchups.map(({runId:_run,...m})=>m)})}`;};
// Controlled adapter fixtures test orchestration, not gameplay. A mutation wins
// selection games and loses held-out games; baseline has the opposite result.
function controlledSeries(project,{reverse=false}={}){
  return async(config,{startingCheckpoints,signal}={})=>{
    const run=createLabRun(config,identity);run.checkpoints=startingCheckpoints;
    const candidate=startingCheckpoints[0],training=hashCanonical(config.seedCatalog)===hashCanonical(project.packs[0].seeds);
    const normal=training ? candidate.generation>0 : candidate.generation===0,candidateWins=reverse?!normal:normal;
    if(signal?.aborted){run.status='STOPPED';return {run};}
    run.records=Array.from({length:config.gameCount},(_,ordinal)=>{
      const swapped=ordinal%2===1,winner=candidateWins ? (swapped?'P2':'P1') : (swapped?'P1':'P2');
      const body={ordinal,swapped,seed:config.seedCatalog[Math.floor(ordinal/2)],winner,scoreP1:winner==='P1'?21:0,scoreP2:winner==='P2'?21:0,terminationReason:'NORMAL_VICTORY',turns:5,miniTurns:10,decisions:2,durationMs:0,actionCounts:{draw:2},checkpointIds:(swapped?[...startingCheckpoints].reverse():startingCheckpoints).map(c=>c.checkpointId),seatBehavior:[0,1].map(i=>({playerId:`P${i+1}`,decisions:1,actionCounts:{draw:1},mechanicCounts:{}}))};
      return {...body,resultHash:hashCanonical(body)};
    });run.status='COMPLETE';return {run};
  };
}
async function complete(){const p=makeProject();await trainProject(p,controlledSeries(p));assert.equal(p.experiment.status,'COMPLETE');return p;}
function addAttempt(p,ev){p.evaluations.push(ev);p.experiment.evaluationIds.push(ev.evaluationId);for(const m of ev.matchups)if(!p.experiment.runIds.includes(m.runId))p.experiment.runIds.push(m.runId);}

test('recomputed hashes cannot admit malformed evaluation metrics/opponents/digests/references',async()=>{
  const p=await complete();
  for(const change of [e=>e.matchups[0].metrics.pairedScore=2,e=>e.matchups[0].opponentCheckpointId='CP-missing',e=>e.matchups[0].opponentPolicyId='invented',e=>e.matchups[0].semanticEvidenceHash='invalid',e=>e.matchups[0].runId='EL-unreferenced',e=>e.purpose='TRAINING',e=>e.matchups.push(structuredClone(e.matchups[0])),e=>e.matchups[0].metrics.clean++]){
    const bad=structuredClone(p),ev=bad.evaluations[0],oldId=ev.evaluationId;change(ev);ev.evaluationId=evaluationId(ev);bad.experiment.evaluationIds=bad.experiment.evaluationIds.map(id=>id===oldId?ev.evaluationId:id);
    assert.throws(()=>validateResearchProject(bad,identity));
    assert.throws(()=>parseResearchImport(JSON.stringify({format:'intrilex-evolution-research',schemaVersion:1,payload:bad,contentHash:hashCanonical(bad)}),identity));
  }
});
test('successful retry supersedes historical error without deleting the failed attempt',async()=>{
  const p=await complete();
  // Use a real empty stopped/failed suite result rather than inconsistent counts.
  const failure=await evaluateSuite({candidate:p.checkpoints[0],pack:p.packs[1],suite:p.suite},async config=>{const run=createLabRun(config,identity);run.status='ERROR';return {run};});
  addAttempt(p,failure);const failedId=failure.evaluationId;
  await trainProject(p,async()=>{throw new Error('Complete cache should avoid execution');});
  assert.equal(p.experiment.status,'COMPLETE');assert.ok(p.evaluations.some(e=>e.evaluationId===failedId&&e.status==='ERROR'));
});
test('resumed committed generations finalize identical regression evidence exactly once',async()=>{
  const uninterrupted=await complete(),resumed=structuredClone(uninterrupted),selected=resumed.generations.at(-1).selectedCheckpointId;
  const removed=new Set(resumed.evaluations.filter(e=>e.candidateCheckpointId===selected&&e.purpose==='EVALUATION').map(e=>e.evaluationId));
  resumed.evaluations=resumed.evaluations.filter(e=>!removed.has(e.evaluationId));resumed.experiment.evaluationIds=resumed.experiment.evaluationIds.filter(id=>!removed.has(id));resumed.regressions=resumed.regressions.filter(r=>r.checkpointId!==selected);resumed.experiment.status='STOPPED';
  const committed=resumed.generations.map(g=>g.generationId);await trainProject(resumed,controlledSeries(resumed));
  assert.equal(resumed.experiment.status,'COMPLETE');assert.deepEqual(resumed.generations.map(g=>g.generationId),committed);assert.deepEqual(resumed.regressions,uninterrupted.regressions);
  const semantic=semanticTrainingResult(resumed);await trainProject(resumed,controlledSeries(resumed));assert.deepEqual(semanticTrainingResult(resumed),semantic);assert.deepEqual(resumed.regressions,uninterrupted.regressions);
});
test('comparison selects one complete evaluation and excludes stopped attempts',async()=>{
  const p=await complete(),cp=p.checkpoints[0],ev=p.evaluations.find(e=>e.candidateCheckpointId===cp.checkpointId&&e.purpose==='EVALUATION');
  assert.equal(compareCheckpoints(cp,cp,[ev,ev]).matchups.length,5);
  const stopped=structuredClone(ev);stopped.status='STOPPED';stopped.matchups=stopped.matchups.slice(0,1);stopped.evaluationId=evaluationId(stopped);
  assert.equal(compareCheckpoints(cp,cp,[stopped]).matchups.length,0);assert.equal(compareCheckpoints(cp,cp,[ev,stopped]).matchups.length,5);
});
test('selection rejects nonfinite/out-of-range scores at its public boundary',()=>{
  for(const score of [NaN,Infinity,-1,2])assert.throws(()=>selectCandidate([{index:0,checkpointId:'parent',result:{purpose:'TRAINING',status:'COMPLETE',matchups:[{metrics:{pairedScore:score,aborted:0,unresolved:0}}]}}]));
});
test('valid project envelope preserves reference identity and provenance',async()=>{
  const p=await complete(),round=parseResearchImport(JSON.stringify(researchEnvelope(p)),identity);assert.equal(round.evidenceOrigin,'IMPORTED_UNVERIFIED');assert.deepEqual(round.generations,p.generations);
});

test('required failed stage remains ERROR, then a real retry completes and retains failure',async()=>{
  const p=makeProject(),failed=async config=>{const run=createLabRun(config,identity);run.status='ERROR';return {run};};
  await trainProject(p,failed);assert.equal(p.experiment.status,'ERROR');assert.equal(p.generations.length,0);const failure=p.evaluations[0].evaluationId;
  await trainProject(p,controlledSeries(p));assert.equal(p.experiment.status,'COMPLETE');assert.ok(p.evaluations.some(e=>e.evaluationId===failure&&e.status==='ERROR'));assert.ok(p.faults[0].checkpointId);assert.ok(p.faults[0].packId);
});
test('selection-commit cancellation and persistence failure recover without rewriting descendants',async()=>{
  const expected=await complete();
  for(const boundary of ['SELECTION_COMMIT','FINALIZATION_SAVE']){
    const p=makeProject(),controller=new AbortController();let injected=false;
    await trainProject(p,controlledSeries(p),{signal:controller.signal,onSave:()=>{
      if(injected||p.generations.length!==1)return;
      if(boundary==='SELECTION_COMMIT'){injected=true;controller.abort();}
      else if(p.regressions?.length){injected=true;throw new Error('CONTROLLED_PERSISTENCE_FAILURE');}
    }});
    assert.ok(injected);assert.equal(p.experiment.status,boundary==='SELECTION_COMMIT'?'STOPPED':'ERROR');const committed=p.generations[0].generationId;
    const round=parseResearchImport(JSON.stringify(researchEnvelope(p)),identity);await trainProject(round,controlledSeries(round));assert.equal(round.experiment.status,'COMPLETE');assert.equal(round.generations[0].generationId,committed);assert.deepEqual(semanticTrainingResult(round),semanticTrainingResult(expected));
  }
});
test('comparison identifies latest complete attempt and keeps missing/incompatible evidence unavailable',async()=>{
  const p=await complete(),cp=p.checkpoints[0],pack=p.packs[1],first=p.evaluations.find(e=>e.candidateCheckpointId===cp.checkpointId&&e.purpose==='EVALUATION'),second=await evaluateSuite({candidate:cp,pack,suite:p.suite},controlledSeries(p,{reverse:true}));
  const result=compareCheckpoints(cp,cp,[first,second],{packs:p.packs,suite:p.suite});assert.equal(result.matchups.length,5);assert.equal(result.selectedEvaluations[0].beforeEvaluationId,second.evaluationId);assert.ok(result.matchups.every(m=>m.before===0&&m.delta===0));
  assert.equal(compareCheckpoints(cp,p.checkpoints[1],[first],{packs:p.packs,suite:p.suite}).matchups.length,0);
  const partial=structuredClone(second);partial.status='STOPPED';partial.matchups=partial.matchups.slice(0,1);partial.evaluationId=evaluationId(partial);assert.equal(compareCheckpoints(cp,cp,[first,partial]).selectedEvaluations[0].beforeEvaluationId,first.evaluationId);
  const incompatible=structuredClone(cp);incompatible.identity.fingerprint='0'.repeat(64);assert.throws(()=>compareCheckpoints(cp,incompatible,[first]));
});
test('generation rankings and regression deltas cannot be rewritten with recomputed hashes',async()=>{
  const p=await complete(),bad=structuredClone(p),g=bad.generations[0];g.selection.ranking[0].fitness=2;const {generationId:_id,elapsedMs:_elapsed,...core}=g;g.generationId='EG-'+hashCanonical(core);assert.throws(()=>validateResearchProject(bad,identity),/GENERATION_SELECTION/);
  const altered=structuredClone(p),r=altered.regressions[0];r.delta=-.2;const {findingId:_finding,...body}=r;r.findingId='RG-'+hashCanonical(body);assert.throws(()=>validateResearchProject(altered,identity),/INVALID_REGRESSION/);
});
test('archive inspection preserves incompatible content without admitting execution',async()=>{
  const p=await complete(),envelope=researchEnvelope(p),original=JSON.stringify(envelope);const legacy=structuredClone(envelope);legacy.payload.experiment.runIds=[];legacy.contentHash=hashCanonical(legacy.payload);
  const archive=inspectResearchArtifact(legacy);assert.equal(archive.executionAdmitted,false);assert.equal(archive.contractDiagnostic,'INVALID_MATCHUP_REFERENCE');assert.deepEqual(archive.artifact,legacy);assert.throws(()=>parseResearchImport(JSON.stringify(legacy),identity));assert.equal(JSON.stringify(envelope),original);
});
test('behavior deltas use available candidate telemetry and preserve absent-category zero',()=>{
  const a={availableGames:2,decisions:10,actionRates:{draw:.8,score:.2},mechanicRates:{}},b={availableGames:2,decisions:10,actionRates:{draw:.5,quick:.5},mechanicRates:{}};
  const d=behaviorDeltas(a,b);assert.equal(d.available,true);assert.equal(d.metrics.find(m=>m.key==='score').after,0);assert.equal(behaviorDeltas({...a,availableGames:0},b).available,false);
});

test('profiling toggle leaves actual game evidence unchanged',async()=>{
  const p=makeProject(),config={botA:p.checkpoints[0].policyId,botB:p.suite.checkpoints[0].policyId,seed:1337,gameCount:2,workerCount:1,kind:'EVALUATION',mirrorSeats:true},options={identity,createdAt:'2026-10-02T00:00:00.000Z',startingCheckpoints:[p.checkpoints[0],p.suite.checkpoints[0]]};
  const a=await runLabSeries(config,{...options,profile:true}),b=await runLabSeries(config,{...options,profile:false});assert.deepEqual(a.run.records.map(r=>r.resultHash),b.run.records.map(r=>r.resultHash));assert.equal(a.performance.profilingEnabled,true);assert.equal(b.performance.profilingEnabled,false);assert.ok(a.performance.hostEvidenceHandlingMs>=0);
});
