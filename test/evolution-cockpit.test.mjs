import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {projectModel,lineageNodes,pairFor,residualRows,behaviorPair,draftWeights,filterRecords,finite} from '../apps/lab-web/src/evolution/evolution-view-model.mjs';

const features=['points','tempo'];

test('navigation survives malformed, null and non-object saved preferences', async () => {
  const source = (await readFile('apps/lab-web/src/evolution/evolution-cockpit.js', 'utf8')).replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
  const state = (saved, hash = '#/evolution') => runInNewContext(`${source}\ncreateCockpitState()`, {
    localStorage: { getItem: () => saved }, location: { hash }, URLSearchParams,
  });
  for (const saved of ['null', 'false', '42', '"arena"', '[]', '{broken', '{}', '{"surface":"unknown"}']) {
    assert.equal(state(saved).surface, 'overview', saved);
    assert.equal(state(saved, '#/evolution?view=ledger').surface, 'ledger', 'route preference takes precedence');
  }
  assert.equal(state('{"surface":"arena"}').surface, 'arena');
});
function fixture(){
  const checkpoint=(checkpointId,lineageId,generation,parentCheckpointId,points)=>({checkpointId,lineageId,agentId:lineageId,generation,parentCheckpointId,policyState:{weights:{points,tempo:0}}});
  const matchup=()=>({opponentPolicyId:'control',opponentCheckpointId:'frozen-control',behavior:{availableGames:2,decisions:8}});
  const evaluation=(evaluationId,candidateCheckpointId,purpose='EVALUATION',status='COMPLETE',packId='held')=>({evaluationId,candidateCheckpointId,purpose,status,packId,suiteId:'suite',matchups:[matchup()]});
  return {experiment:{scientific:{startingCheckpointIds:['A0','B0']}},suite:{suiteId:'suite'},packs:[{packId:'held',purpose:'EVALUATION'}],checkpoints:[checkpoint('A0','A',0,null,0),checkpoint('B0','B',0,null,0),checkpoint('A1','A',1,'A0',100),checkpoint('unselected','A',1,'A0',200)],generations:[{generationId:'G1',generation:1,lineageId:'A',selectedCheckpointId:'A1'}],evaluations:[evaluation('root','A0'),evaluation('selected','A1'),evaluation('training','A1','TRAINING'),evaluation('incomplete','A1','EVALUATION','STOPPED')],faults:[{checkpointId:'A1',message:'Observed failure'}],regressions:[{checkpointId:'A1',findingId:'finding'}]};
}
test('lineage heads use committed selections rather than latest candidate',()=>{const p=fixture(),model=projectModel(p);assert.deepEqual(model.heads.map(h=>h.checkpoint.checkpointId),['A1','B0']);assert.equal(model.heads[0].evaluation.evaluationId,'selected');assert.deepEqual(model.coverage,{total:3,complete:2});});
test('incomplete attempts, TRAINING and wrong suite do not replace held-out evidence',()=>{const p=fixture();p.evaluations.push({...p.evaluations[1],evaluationId:'other-suite',suiteId:'other'});assert.equal(projectModel(p).heads[0].evaluation.evaluationId,'selected');});
test('lineage filters link recorded findings and faults while keeping roots',()=>{const p=fixture();assert.deepEqual(lineageNodes(p).map(n=>n.checkpoint.checkpointId),['A0','A1','B0']);for(const filter of [{findingsOnly:true},{faultsOnly:true},{lineage:'A',from:1,to:1},{query:'a1'}])assert.deepEqual(lineageNodes(p,filter).map(n=>n.checkpoint.checkpointId),['A1']);});
test('pair shortcuts follow actual ancestry and independent lineage heads',()=>{const p=fixture();assert.deepEqual(pairFor(p,'root','A1'),['A0','A1']);assert.deepEqual(pairFor(p,'parent','A1'),['A0','A1']);assert.deepEqual(pairFor(p,'latest'),['A1','B0']);assert.equal(pairFor(p,'parent','A0').length,1);});
test('residual differences preserve zero while marking absent parent unavailable',()=>{const p=fixture();assert.equal(residualRows(p,p.checkpoints[2],features)[0].parentDelta,100);const root=residualRows(p,p.checkpoints[0],features)[0];assert.equal(root.rootDelta,0);assert.equal(root.parentDelta,null);});
test('behavior comparison requires matching complete held-out opponent telemetry',()=>{const p=fixture();assert.equal(behaviorPair(p,'A0','A1').available,true);p.evaluations[1].matchups[0].opponentCheckpointId='other-control';assert.equal(behaviorPair(p,'A0','A1').available,false);});
test('missing telemetry is unavailable rather than a zero divergence',()=>{const p=fixture();p.evaluations[1].matchups[0].behavior.decisions=0;const pair=behaviorPair(p,'A0','A1');assert.equal(pair.available,false);assert.match(pair.reason,/not captured/);});
test('non-committed drafts enforce integer bounds without mutating checkpoints',()=>{const p=fixture(),before=JSON.stringify(p);const draft=draftWeights(p.checkpoints[2],{points:-2000},features,2000);assert.equal(draft.valid,true);assert.equal(draft.committed,false);assert.equal(draft.values.points,-2000);for(const points of [2001,0.5,NaN,Infinity])assert.equal(draftWeights(p.checkpoints[2],{points},features,2000).valid,false);assert.equal(JSON.stringify(p),before);});
test('presentation exploration leaves all scientific objects byte-for-byte unchanged',()=>{const p=fixture(),before=JSON.stringify(p);for(let i=0;i<100;i++){projectModel(p);lineageNodes(p,{query:String(i)});pairFor(p,'latest');residualRows(p,p.checkpoints[2],features);behaviorPair(p,'A0','A1');filterRecords(p.checkpoints,'A',['checkpointId']);}assert.equal(JSON.stringify(p),before);});
test('empty data and absent observations have explicit presentation states',()=>{assert.deepEqual(projectModel(null).coverage,{total:0,complete:0});assert.deepEqual(pairFor(null,'latest'),[]);assert.equal(behaviorPair(null,'A','B').available,false);assert.equal(finite(0),true);for(const value of [null,undefined,NaN,Infinity,'0'])assert.equal(finite(value),false);});
test('search is case insensitive, field scoped and returns independent arrays',()=>{const p=fixture();assert.equal(filterRecords(p.checkpoints,'a1',['checkpointId']).length,1);const result=filterRecords(p.checkpoints);result.pop();assert.equal(p.checkpoints.length,4);});
