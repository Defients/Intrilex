import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaAnalytics,inclusiveFullTurns,histogram,researchAnalytics,quantile} from '../apps/lab-web/src/evolution/evolution-analytics-model.mjs';
import {arenaAnalyticsHtml,matchupHeatmapHtml} from '../apps/lab-web/src/evolution/evolution-analytics-charts.mjs';
import {createLabRun,runLabGame,evolutionIdentity,verifyLabReplay} from '../packages/simulation-runtime/src/evolution-lab.mjs';
const game=(ordinal,extra={})=>({ordinal,seed:100+Math.floor(ordinal/2),swapped:ordinal%2===1,winner:'P1',terminationReason:'NORMAL_VICTORY',turns:2,miniTurns:5,decisions:7,scoreP1:21,scoreP2:10,eventCounts:{CORE_FULL_TURN_COMPLETED:2,CORE_NORMAL_VICTORY:1},seatBehavior:[{decisions:4,actionCounts:{score:3,phase:1}},{decisions:3,actionCounts:{score:2,phase:1}}],...extra});
const run=records=>({runId:'run',status:'COMPLETE',config:{profileId:'core-advanced-authority',gameCount:records.length,mirrorSeats:true},records});
test('real certified replay includes the winning End omitted by the stored counter',async()=>{
  const r=createLabRun({botA:'value',botB:'tempo',gameCount:2,seed:1337,workerCount:1,mirrorSeats:true,profileId:'core-advanced-authority'},await evolutionIdentity());
  const sample=runLabGame(r,0);r.records.push(sample.record);
  const verified=verifyLabReplay(r,{ordinal:0,replayId:sample.record.replayId,replay:sample.replay});
  assert.equal(sample.record.turns,2);assert.equal(verified.state.winner,'P1');assert.equal(verified.state.players.P1.goal,21);
  assert.equal(inclusiveFullTurns(sample.record,r.config.profileId),3);assert.equal(sample.record.miniTurns,7);
  assert.equal(sample.record.eventCounts.CORE_CARD_SCORED,5);
});
test('terminal telemetry qualifies the correction; unknown profiles and missing evidence stay unavailable',()=>{
  assert.equal(inclusiveFullTurns(game(0),'core-advanced-authority'),3);
  assert.equal(inclusiveFullTurns(game(0,{eventCounts:{CORE_EXHAUSTED_RESOLVED:1}}),'core-unrestricted-authority'),1);
  assert.equal(inclusiveFullTurns(game(0,{eventCounts:{}}),'core-advanced-authority'),null);
  assert.equal(inclusiveFullTurns(game(0),'first-contact-trigger-closure'),null);
  assert.equal(inclusiveFullTurns(game(0,{winner:'ABORTED',terminationReason:'DECISION_LIMIT'}),'core-advanced-authority'),null);
});
test('all-record distributions conserve counts and use linear-interpolated quantiles',()=>{
  const rows=Array.from({length:800},(_,i)=>game(i,{decisions:i%71}));
  const bins=histogram(rows,r=>r.decisions);
  assert.ok(bins.length<=24);assert.equal(bins.reduce((sum,b)=>sum+b.records.length,0),800);
  assert.equal(quantile([1,2,3,10],.5),2.5);assert.equal(quantile([], .9),null);
});
test('arrival order has no effect, paired bounds require exact clean AB/BA partners',()=>{
  const rows=[game(0),game(1),game(2),game(3,{seed:999}),game(4),game(5,{winner:'ABORTED',terminationReason:'WORKER_FAULT'})];
  const before=JSON.stringify(rows),a=arenaAnalytics(run(rows)),b=arenaAnalytics(run([...rows].reverse()));
  assert.deepEqual(a,b);assert.equal(a.pairs.n,1);assert.equal(a.pairs.score,.5);assert.equal(a.pairs.incompleteGames,3);
  assert.equal(a.summary.clean,5);assert.equal(a.summary.faults,1);assert.equal(JSON.stringify(rows),before);
  assert.equal(arenaAnalytics({...run(rows),config:{...run(rows).config,mirrorSeats:false}}).pairs.n,0);
});
test('range slices keep actual ordinals and expose broken pairs rather than inventing partners',()=>{
  const rows=[game(0),game(1),game(2),game(3)],model=arenaAnalytics(run(rows),{from:2,to:3,window:2});
  assert.deepEqual(model.records.map(r=>r.ordinal),[1,2]);assert.equal(model.pairs.n,0);
  assert.equal(model.curves[0].x,2);assert.equal(model.curves.at(-1).x,3);assert.equal(model.curves.at(-1).rolling,50);
});
test('two-seat behavior maps by bot identity under mirrored seats',()=>{
  const model=arenaAnalytics(run([game(0),game(1)])),score=model.families.find(r=>r.key==='score');
  assert.equal(model.telemetryGames,2);assert.equal(score.A,100*5/7);assert.equal(score.B,100*5/7);
  assert.equal(model.seats[0].A,1);assert.equal(model.seats[1].B,1);
});
test('10,000 games keep all statistical observations with bounded SVG samples',()=>{
  const rows=Array.from({length:10000},(_,i)=>game(i));const model=arenaAnalytics(run(rows));
  assert.equal(model.summary.clean,10000);assert.equal(model.pairs.n,5000);
  assert.ok(model.curves.length<=242);assert.ok(model.scatter.length<=300);assert.equal(model.curves.at(-1).x,10000);
  assert.equal(model.turnBins.reduce((n,b)=>n+b.records.length,0),10000);
});
test('chart projections label partial errors and never add a timed-out game to observed faults',()=>{
  const r={...run([game(0),game(1)]),status:'ERROR',error:'WORKER_TIMEOUT <seed>',config:{...run([]).config,gameCount:10}};
  const html=arenaAnalyticsHtml(r);assert.match(html,/8 without accepted records/);assert.match(html,/2 clean games \/ 0 recorded faults/);
  assert.match(html,/WORKER_TIMEOUT &lt;seed&gt;/);assert.match(html,/Original hashed counter mean: 2.00/);assert.doesNotMatch(html,/NaN|Infinity/);
  assert.equal((html.match(/data-evo-plot=/g)??[]).length,9);
});
test('held-out cells admit only matching complete suite/pack evidence and preserve missing values',()=>{
  const project={experiment:{scientific:{startingCheckpointIds:['root']}},checkpoints:[{checkpointId:'root',agentId:'A',generation:0,lineageId:'A',policyState:{weights:{points:0}}}],generations:[],packs:[{purpose:'EVALUATION',packId:'heldout'}],suite:{suiteId:'suite',checkpoints:[{policyId:'control'},{policyId:'tempo'}]},evaluations:[
    {evaluationId:'valid',candidateCheckpointId:'root',purpose:'EVALUATION',status:'COMPLETE',packId:'heldout',suiteId:'suite',matchups:[{opponentPolicyId:'control',metrics:{pairedScore:.5,clean:4,aborted:0,unresolved:0,pairedScoreInterval95:[0,1]}}]},
    {evaluationId:'training',candidateCheckpointId:'root',purpose:'TRAINING',status:'COMPLETE',packId:'heldout',suiteId:'suite',matchups:[]},
    {evaluationId:'foreign',candidateCheckpointId:'root',purpose:'EVALUATION',status:'COMPLETE',packId:'heldout',suiteId:'different',matchups:[]}
  ]};
  const model=researchAnalytics(project);assert.equal(model.rows[0].evaluation.evaluationId,'valid');assert.equal(model.rows[0].matchups[1].metrics,null);
  const html=matchupHeatmapHtml(project);assert.match(html,/evaluation:valid/);assert.match(html,/no complete matching held-out evidence/);assert.doesNotMatch(html,/evaluation:training|evaluation:foreign|NaN/);
});
