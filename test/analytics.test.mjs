import test from 'node:test';import assert from 'node:assert/strict';
import { analyzeSynergies, buildMechanicsAtlas, buildObservatoryAnalytics, metricRegistryWithHashes } from '@intrilex/analytics';
import { benjaminiHochberg, deterministicClusterBootstrap, wilsonInterval, logisticInteractionEstimate, stratifiedInteractionEstimate, cohortBalanceRatio, evidenceGrade } from '@intrilex/statistics';
const row=(i,a,b,win,policy='control')=>({matchId:`M${i}`,matchResultHash:`${String(i).padStart(64,'0')}`,profileId:'core-advanced-authority',policyIds:[policy,'value'],seatOrder:['P1','P2'],winner:win?'P1':'P2',winningSeat:win?1:2,terminationReason:'NORMAL_VICTORY',completedFullTurns:10,scoreMargin:2,mechanicCounts:{A:a?1:0,B:b?1:0},miniTurnActionCount:8,responsePlayedCount:1,responseDeclinedWithOptionsCount:1,automaticPriorityAdvanceCount:3,privateChoiceDecisionCount:0,advancedDecisionCount:0,ultraDecisionCount:0,voltageDecisionCount:0});
test('statistical utilities are deterministic and bounded',()=>{assert.deepEqual(wilsonInterval(50,100),wilsonInterval(50,100));const sample=[1,2,3,4].map((x,i)=>({matchId:`M${i}`,x}));assert.deepEqual(deterministicClusterBootstrap(sample,x=>x.reduce((s,r)=>s+r.x,0)/x.length,{iterations:100,seed:'x'}),deterministicClusterBootstrap(sample,x=>x.reduce((s,r)=>s+r.x,0)/x.length,{iterations:100,seed:'x'}));assert.deepEqual(benjaminiHochberg([{id:'a',pValue:.01},{id:'b',pValue:.02},{id:'c',pValue:.5}]).map(x=>x.qValue),[.03,.03,.5]);});
test('logistic interaction estimator computes odds-ratio interaction from four cohorts',()=>{const r=logisticInteractionEstimate({neither:{wins:40,losses:60},aOnly:{wins:30,losses:70},bOnly:{wins:35,losses:65},both:{wins:55,losses:45}});assert.ok(r.estimate>1,'Positive interaction should give OR > 1');assert.ok(Array.isArray(r.interval));assert.ok(r.pValue<0.1);assert.equal(r.separation,false);assert.equal(r.cohortN.neither,100);});
test('logistic interaction estimator detects separation and applies correction',()=>{const r=logisticInteractionEstimate({neither:{wins:0,losses:50},aOnly:{wins:25,losses:25},bOnly:{wins:25,losses:25},both:{wins:50,losses:0}});assert.equal(r.separation,true);assert.ok(Number.isFinite(r.estimate));});
test('stratified interaction estimate pools across strata with inverse variance',()=>{const strata=[{neither:{wins:20,losses:30},aOnly:{wins:15,losses:35},bOnly:{wins:18,losses:32},both:{wins:28,losses:22}},{neither:{wins:20,losses:30},aOnly:{wins:15,losses:35},bOnly:{wins:17,losses:33},both:{wins:27,losses:23}}];const r=stratifiedInteractionEstimate(strata);assert.ok(r.estimate>1);assert.ok(r.effectiveN>0);assert.equal(r.strataCount,2);});
test('cohort balance ratio is 1 for equal cohorts and <1 for imbalanced',()=>{assert.equal(cohortBalanceRatio({neither:100,aOnly:100,bOnly:100,both:100}),1);assert.ok(cohortBalanceRatio({neither:100,aOnly:50,bOnly:200,both:100})<1);});
test('evidence grade uses multi-criteria rubric',()=>{assert.equal(evidenceGrade({sampleSize:10,interval:[0.1,0.3]}),'INSUFFICIENT');assert.equal(evidenceGrade({sampleSize:500,interval:[0.05,0.15],qValue:0.01,effectSize:0.1,cohortBalance:0.8}),'ROBUST');assert.equal(evidenceGrade({sampleSize:100,interval:[0.05,0.25],qValue:0.05,effectSize:0.1}),'SUPPORTED');});
test('known positive interaction is detected with evidence fields',()=>{const wins={0:60,1:80,2:80,3:160};const rows=[];for(let i=0;i<800;i++){const group=i%4;const a=group===1||group===3;const b=group===2||group===3;const idx=Math.floor(i/4);const win=idx<wins[group];rows.push(row(i,a,b,win));}const result=analyzeSynergies(rows,{minimumBoth:50,minimumCohort:50,minimumEffectiveN:200,maxMechanics:4}).find(x=>x.id==='A::B');assert.ok(result);assert.ok(result.effect>1);assert.ok(Array.isArray(result.confidenceInterval));assert.match(result.formulaHash,/^[a-f0-9]{64}$/);assert.ok(result.replayRefs.length);});
test('Observatory aggregate is formula-versioned and hash-bound',()=>{const rows=Array.from({length:40},(_,i)=>row(i,i%2===0,i%3===0,i%5<2));const result=buildObservatoryAnalytics({summaries:rows,detailedMatches:[]});assert.equal(result.schemaVersion,'4.2.0');assert.match(result.observatoryHash,/^[a-f0-9]{64}$/);assert.ok(Object.keys(metricRegistryWithHashes()).length>=5);});
test('mechanic outcomes are attributed to the participant who used them',()=>{
  const summaries=[0,1].map(i=>({
    matchId:`PX${i}`,matchResultHash:`p${i}`,profileId:'core-advanced-authority',policyIds:['control','tempo'],seatOrder:['P1','P2'],
    winner:i===0?'P1':'P2',winningSeat:i===0?1:2,terminationReason:'NORMAL_VICTORY',
    participants:[
      {policyId:'control',seat:1,result:i===0?'win':'loss',mechanicCounts:i===0?{counter:1}:{}},
      {policyId:'tempo',seat:2,result:i===0?'loss':'win',mechanicCounts:i===0?{}:{counter:1}}
    ]
  }));
  const counter=buildMechanicsAtlas(summaries).find(item=>item.mechanic==='counter');
  assert.equal(counter.usageUnit,'participant');
  assert.equal(counter.analysisUnitOpportunityCount,4);
  assert.equal(counter.sampleSize,2);
  assert.equal(counter.outcomeAssociation,1);
});

