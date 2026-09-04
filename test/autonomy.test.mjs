import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_SIMULATION_PROFILE,
  createSimulationState,
  createSimulationDecisionFrame,
  simulationCapabilities,
  strictPolicyView
} from '@intrilex/engine-adapter';
import { DeterministicPolicyRng } from '@intrilex/policy-sdk';
import { POLICY_CATALOG } from '@intrilex/simulation-runtime/policy-catalog';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { runCampaign } from '@intrilex/simulation-runtime/campaign';

const setup={profileId:'core-advanced-authority',playerIds:['P1','P2'],enabledModules:[],seed:0x51a7c0de,seatOrder:['P1','P2']};

test('engine exposes bounded Advanced Core and retains complete First Contact',()=>{
  const profiles=simulationCapabilities();
  const advanced=profiles.find(p=>p.profileId==='core-advanced-authority');
  const firstContact=profiles.find(p=>p.profileId==='first-contact-trigger-closure');
  assert.equal(DEFAULT_SIMULATION_PROFILE,'core-advanced-authority');
  assert.equal(advanced.status,'SUPPORTED');
  for(const family of ['royal-marriage','rank10-stack-theft','ultra-three-red','voltage-five-gy-bottom']) assert.ok(advanced.completeActionFamilies.includes(family),family);
  assert.equal(firstContact.status,'SUPPORTED');
  assert.throws(()=>createSimulationState({...setup,profileId:'CORE'}),/Unsupported Core authority profile|Unsupported autonomous profile/);
});

test('Core decision frame exposes semantic actions but not raw command vault',()=>{
  const initial=createSimulationState(setup);
  const frame=createSimulationDecisionFrame(initial);
  assert.equal(frame.status,'PLAYER_DECISION_REQUIRED');
  assert.ok(frame.policyActions.length>0);
  const serialized=JSON.stringify(frame.policyActions);
  assert.doesNotMatch(serialized,/RESOLVE_CORE|SUBMIT_CORE_PRIVATE_CHOICE|MOVE_CARD|SCORE_CARD/);
  assert.ok(frame.policyActions.every(action=>typeof action.engineCommandHash==='string'));
  assert.throws(()=>frame.resolve('not-a-real-action'),/Unknown or stale action/);
});

test('strict Core policy view preserves hidden information and exposes authorized Core systems',()=>{
  const state=createSimulationState(setup);
  const view=strictPolicyView(state,'P1');
  assert.equal(view.profileId,'core-advanced-authority');
  assert.equal(view.own.hand.length,5);
  assert.equal(view.opponents[0].handCount,6);
  assert.equal('hand' in view.opponents[0],false);
  assert.equal('rng' in view,false);
  assert.ok(Array.isArray(view.swapBar));
  assert.ok(Array.isArray(view.stack));
  const hidden=state.players.P2.hand.map(id=>state.cards[id].identity);
  const serialized=JSON.stringify(view);
  for(const identity of hidden) assert.equal(serialized.includes(`"${identity}"`),false,`leaked ${identity}`);
});

test('five policies remain deterministic and behaviorally distinct',()=>{
  const legalActions=[
    {actionId:'draw',family:'draw',mode:'top',timingClass:'ACTION',sourceHandles:[],targetHandles:[],featureVector:{}},
    {actionId:'score-2',family:'score',mode:'points',timingClass:'ACTION',sourceHandles:['C2'],targetHandles:[],featureVector:{immediateScore:2}},
    {actionId:'score-10',family:'score',mode:'points',timingClass:'ACTION',sourceHandles:['C10'],targetHandles:[],featureVector:{immediateScore:10}},
    {actionId:'scuttle',family:'scuttle',mode:'ordinary',timingClass:'ACTION',sourceHandles:['C2'],targetHandles:['T10'],featureVector:{targetPointValue:10,sourcePointValue:2}}
  ];
  const authorizedView={own:{hand:[1,2,3,4],securedPoints:4,goal:21},knownCards:{C2:{pointValue:2},C10:{pointValue:10},T10:{pointValue:10}},stack:[],opponents:[{securedPoints:10,goal:21}]};
  const selections={};
  for(const policy of POLICY_CATALOG){
    const choose=()=>policy.choose({matchId:'fixture',decisionIndex:0,actorId:'P1',authorizedView,legalActions,rng:new DeterministicPolicyRng(4),traits:policy.traits}).actionId;
    assert.equal(choose(),choose(),`${policy.policyId} nondeterministic`);
    selections[policy.policyId]=choose();
  }
  assert.equal(Object.keys(selections).length,POLICY_CATALOG.length);
  assert.ok(new Set(Object.values(selections)).size>=3,JSON.stringify(selections));
});

test('selected Advanced Core policy matches terminate canonically and exercise advanced authority',()=>{
  const cases=[
    {ordinal:0,seed:1478578990,policyIds:['random-legal','random-legal']},
    {ordinal:1,seed:2644228939,policyIds:['random-legal','score-rush']},
    {ordinal:6,seed:3885025646,policyIds:['score-rush','score-rush']}
  ];
  let advanced=0,responses=0,choices=0;
  for(const item of cases){
    const result=runPolicyMatch({...item,profileId:'core-advanced-authority',seatOrder:['P1','P2'],includeReplay:true});
    assert.ok(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(result.summary.terminationReason));
    assert.equal(result.summary.profileId,'core-advanced-authority');
    assert.equal(result.summary.errorCode,null);
    assert.equal(result.summary.ruleCompliance.status,'PASS');
    assert.equal(result.summary.ruleCompliance.violationCount,0);
    assert.equal(result.summary.participants.reduce((sum,p)=>sum+p.responseOpportunityCount,0),result.summary.responseOpportunityCount);
    for(const noisy of ['ACTION','SETUP','INSTANT','QUICK','INTERRUPT','phase','enter-action','points','ordinary','top','♣','♦','♥','♠']){
      assert.equal(noisy in result.summary.mechanicCounts,false,`structural tag leaked: ${noisy}`);
      assert.equal(noisy in result.summary.primaryMechanicCounts,false,`structural primary tag leaked: ${noisy}`);
    }
    assert.match(result.summary.replayHash,/^[a-f0-9]{64}$/);
    advanced+=result.summary.advancedDecisionCount;responses+=result.summary.responseDecisionCount;choices+=result.summary.privateChoiceDecisionCount;
  }
  assert.ok(advanced>0,{advanced,responses,choices});
  assert.ok(responses>0,{advanced,responses,choices});
  assert.ok(choices>0,{advanced,responses,choices});
});

test('bounded campaign result hash is independent of worker count',async()=>{
  const policyPairs=[['random-legal','value'],['control','tempo'],['score-rush','score-rush']];
  // Six ordinals are the minimal complete parity matrix: all three policy
  // pairs once in the declared seat order and once with seats swapped.
  const two=await runCampaign({profileId:'core-advanced-authority',matchCount:6,policyPairs,workerCount:2,decisionLimit:1800});
  const four=await runCampaign({profileId:'core-advanced-authority',matchCount:6,policyPairs,workerCount:4,decisionLimit:1800});
  assert.equal(two.campaignStatus,'PASS');
  assert.equal(four.campaignStatus,'PASS');
  assert.equal(two.accountingInvariant,true);
  assert.equal(four.accountingInvariant,true);
  assert.equal(two.completedCount,6);
  assert.equal(four.completedCount,6);
  assert.equal(two.experimentHash,four.experimentHash);
  assert.equal(two.canonicalResultHash,four.canonicalResultHash);
});

test('capability report supports bounded Advanced Core without claiming complete Core',async()=>{
  const report=JSON.parse(await readFile('reports/capability-manifest.json','utf8'));
  assert.equal(report.labVersion,'0.28.1');
  assert.equal(report.engine.version,'4.2.6');
  assert.equal(report.engine.rulesVersion,'4.3.1');
  assert.equal(report.defaultSimulationProfile,'core-advanced-authority');
  assert.equal(report.profiles.find(p=>p.profileId==='CORE_ADVANCED_2P').autonomy,'SUPPORTED');
  assert.equal(report.profiles.find(p=>p.profileId==='CORE_UNRESTRICTED_2P').autonomy,'SUPPORTED');
  assert.equal(report.profiles.find(p=>p.profileId==='FIRST_CONTACT_GENERIC_2P').autonomy,'SUPPORTED');
  // Advanced Core must NOT claim complete core autonomously (replay-only or blocked)
  const advancedCoverage=report.profiles.find(p=>p.profileId==='CORE_ADVANCED_2P').actionCoverage;
  assert.ok(advancedCoverage.replayOnly.includes('complete-core')||advancedCoverage.blocked.includes('complete-core'),
    'CORE_ADVANCED_2P must not claim complete-core as covered');
  assert.ok(!advancedCoverage.covered.includes('complete-core'),
    'CORE_ADVANCED_2P must not list complete-core in covered');
  // Unrestricted Core DOES support complete core autonomously: the components
  // that were replay-only under Advanced Core are now covered, and nothing
  // complete-core-related remains replay-only or blocked.
  const unrestrictedCoverage=report.profiles.find(p=>p.profileId==='CORE_UNRESTRICTED_2P').actionCoverage;
  const completeCoreComponents=advancedCoverage.replayOnly.filter(c=>c!=='complete-core');
  for(const component of completeCoreComponents){
    assert.ok(unrestrictedCoverage.covered.includes(component),
      `CORE_UNRESTRICTED_2P must cover complete-core component '${component}'`);
  }
  assert.ok(!unrestrictedCoverage.replayOnly.includes('complete-core')&&!unrestrictedCoverage.blocked.includes('complete-core'),
    'CORE_UNRESTRICTED_2P must not list complete-core in replayOnly or blocked');
  assert.equal(report.unsupportedCombinations.find(x=>x.kind==='COMPLETE_CORE_AUTONOMY').status,'SUPPORTED');
  assert.equal(report.unsupportedCombinations.find(x=>x.kind==='OPTIONAL_MODULE_AUTONOMY').status,'BLOCKED');
  assert.equal(report.interruptRuling.keywordTax,false);
  assert.equal(report.priorityPassRuling.ordinaryPassGenerallyAvailable,false);
  assert.equal(report.priorityPassRuling.responseDeclineIsAction,false);
});

