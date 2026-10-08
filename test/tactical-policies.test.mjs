import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CORE_POLICY_BY_ID, rankPolicyActions} from '../packages/policies/src/index.mjs';
import {createSimulationState, createSimulationDecisionFrame, executeSimulationAction, strictPolicyView} from '../packages/engine-adapter/src/adapter.mjs';
import {evolutionIdentity, runLabSeries} from '../packages/simulation-runtime/src/evolution-lab.mjs';
import {createLabRun, createCheckpoint, validateCheckpoint, FROZEN_POLICIES, artifactEnvelope, inspectHistoricalArtifact} from '../packages/simulation-runtime/src/evolution-domain.mjs';
import {hashCanonical} from '@intrilex/shared';
import {TACTICAL_POLICY_IDS, tacticalBase} from '../packages/policies/src/tactics.mjs';
import {buildOpponentModel, policyTraitsFromId, resolveOpponent} from '../apps/lab-web/src/play/opponent-catalog.mjs';
import {evaluateAction} from '../packages/policies/src/action-evaluation.mjs';
import {evaluateRankStrategy} from '../packages/game-ai/src/rank-strategy.mjs';
import {runPolicyMatch} from '../packages/simulation-runtime/src/runtime.mjs';

const ids=TACTICAL_POLICY_IDS;
const card=(id,pointValue,controllerId='P2',zone='P2_PR',extra={})=>({id,identity:`${pointValue}♥`,pointValue,controllerId,zone,...extra});
const action=(actionId,family,sourceHandles=[],targetHandles=[],featureVector={},mode='ordinary')=>({actionId,family,sourceHandles,targetHandles,featureVector,mode});
function context({points=0,enemyPoints=20,enemyHand=3,cards=[],stack=[],hand=[]}={}) {
  return {actorId:'P1',authorizedView:{own:{securedPoints:points,goal:21,hand,pr:[],er:[]},opponents:[{playerId:'P2',securedPoints:enemyPoints,goal:21,handCount:enemyHand,pr:cards.filter(c=>c.zone==='P2_PR'),er:[]}],knownCards:Object.fromEntries(cards.map(c=>[c.id,c])),stack}};
}
const choose=(id,legalActions,ctx)=>rankPolicyActions(id,legalActions,ctx)[0].action;

test('tactical policies remove a visible near-win and still prefer their own winning score',()=>{
  const c=context({cards:[card('ten',10),card('nine',9,'P1','P1_HAND')]});
  const moves=[action('score','score',['nine'],[],{immediatePoints:9}),action('remove','scuttle',['nine'],['ten'])];
  for(const id of ids){assert.equal(choose(id,moves,c).actionId,'remove');assert.equal(choose(id,moves,{...c,authorizedView:{...c.authorizedView,own:{...c.authorizedView.own,securedPoints:12}}}).actionId,'score');}
});
test('authoritative legal frames reproduce the missed row clear and preserve immediate wins',()=>{
  let state=createSimulationState({profileId:'core-advanced-authority',playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],seed:1337});
  const first=createSimulationDecisionFrame(state);state=first.state;
  const enter=first.policyActions.find(a=>a.family==='phase');state=executeSimulationAction(state,first.resolve(enter.actionId)).state;
  function move(identity,player,row){
    const id=Object.keys(state.cards).find(id=>state.cards[id].identity===identity),c=state.cards[id];
    for(const ids of Object.values(state.zones))if(Array.isArray(ids)){const index=ids.indexOf(id);if(index>=0)ids.splice(index,1);}
    for(const p of Object.values(state.players))for(const field of ['hand','pr','er']){const index=p[field].indexOf(id);if(index>=0)p[field].splice(index,1);}
    delete c.state.swapBarFaceDown;delete c.state.swapBarFaceUp;c.zone=`${player}_${row==='hand'?'HAND':row.toUpperCase()}`;c.controllerId=player;state.players[player][row].push(id);
    if(row==='pr')c.state.pointValue=Number(identity.replace(/[♣♦♥♠]/gu,''));
  }
  // Restrict our alternatives; keep the enemy hand hidden and untouched.
  for(const id of [...state.players.P1.hand]){state.players.P1.hand.splice(state.players.P1.hand.indexOf(id),1);state.cards[id].zone='DP';state.zones.dp.push(id);}
  move('4♣','P1','hand');move('6♣','P1','hand');move('10♥','P2','pr');move('9♦','P2','pr');
  let frame=createSimulationDecisionFrame(state);state=frame.state;
  let ctx={actorId:'P1',authorizedView:strictPolicyView(state,'P1'),legalActions:frame.policyActions};
  assert.equal(ctx.authorizedView.opponents[0].securedPoints,19);
  assert.equal(CORE_POLICY_BY_ID.tempo.choose(ctx).actionId,frame.policyActions.find(a=>a.family==='score'&&a.featureVector.immediatePoints===6).actionId);
  for(const id of ids){const selected=choose(id,frame.policyActions,ctx);assert.equal(selected.family,'effect-four');assert.equal(selected.mode,'clear-pr');assert.ok(executeSimulationAction(state,frame.resolve(selected.actionId)).accepted);}
  move('10♦','P1','pr');move('8♥','P1','pr');frame=createSimulationDecisionFrame(state);state=frame.state;
  ctx={actorId:'P1',authorizedView:strictPolicyView(state,'P1'),legalActions:frame.policyActions};
  assert.equal(ctx.authorizedView.own.securedPoints,18);
  for(const id of ids){const selected=choose(id,frame.policyActions,ctx);assert.equal(selected.family,'score');assert.ok(executeSimulationAction(state,frame.resolve(selected.actionId)).accepted);}
});
test('tactical steals convert public material into a winning line',()=>{
  const c=context({points:11,cards:[card('ten',10),card('jack',3,'P1','P1_HAND')]});
  for(const id of ids)assert.equal(choose(id,[action('steal','attachment',['jack'],['ten'],{controlChange:true},'jack-pr'),action('score','score',['jack'],[],{immediatePoints:3})],c).actionId,'steal');
});
test('row clear estimates respect Aegis and total clear includes our own loss',()=>{
  const c=context({points:20,cards:[card('ten',10,'P2','P2_PR',{aegis:true}),card('nine',9,'P1','P1_HAND')]});
  const moves=[action('score','score',['nine'],[],{immediatePoints:9}),action('clear','effect-four',[],[],{disruption:true},'clear-pr'),action('total','effect-four',[],[],{structural:true},'total-clear')];
  for(const id of ids)assert.equal(choose(id,moves,c).actionId,'score');
  const unsafe={...c,authorizedView:{...c.authorizedView,own:{...c.authorizedView.own,securedPoints:0}}};
  for(const id of ids)assert.ok(rankPolicyActions(id,moves,unsafe).find(r=>r.action.actionId==='clear').score<rankPolicyActions(id,moves,unsafe).find(r=>r.action.actionId==='score').score);
});
test('counters conserve multi-card premiums, decline harmless draws, and protect hostile counter chains',()=>{
  const cards=[card('ace',4,'P1','P1_HAND'),card('ace2',4,'P1','P1_HAND')];
  const response=[action('base','counter',['ace'],[],{counter:true},'ace-base'),action('super','counter',['ace','ace2'],[],{counter:true},'super-ace'),action('pass','response-decline')];
  const c=context({cards,stack:[{controllerId:'P2',actionType:'play-for-effect',stackClass:'ordinary-effect'}]});
  for(const id of ids){assert.equal(choose(id,response,c).actionId,'base');assert.equal(choose(id,response,{...c,authorizedView:{...c.authorizedView,stack:[{controllerId:'P2',actionType:'draw'}]}}).actionId,'pass');}
  c.authorizedView.stack=[{controllerId:'P1',actionType:'play-for-points'},{controllerId:'P2',kind:'counter'}];
  for(const id of ids)assert.equal(choose(id,response,c).actionId,'base');
  c.authorizedView.stack.push({controllerId:'P1',kind:'counter'});
  for(const id of ids)assert.equal(choose(id,response,c).actionId,'pass');
});
test('tactical policies never read full state or RNG and preserve lexical ties',()=>{
  const c=context({cards:[card('nine',9,'P1','P1_HAND')]});
  const restricted=new Proxy(c,{get(target,key){if(!['actorId','authorizedView'].includes(key))throw new Error(`Forbidden policy input: ${String(key)}`);return target[key];}});
  const moves=[action('z','score',['nine'],[],{immediatePoints:9}),action('a','score',['nine'],[],{immediatePoints:9})];
  for(const id of ids)assert.equal(choose(id,moves,restricted).actionId,'a');
});
test('versioned checkpoints retain the original five-opponent research suite and reject version substitution',async()=>{
  const identity=await evolutionIdentity();assert.deepEqual(FROZEN_POLICIES,['random-legal','score-rush','control','tempo','value']);
  for(const id of ids){assert.equal(CORE_POLICY_BY_ID[id].version,'4.0.0');const cp=createCheckpoint({policyId:id,agentId:'A',identity});assert.equal(cp.policyVersion,'4.0.0');const {checkpointId:_,...body}=cp;body.policyVersion='2.0.0';assert.throws(()=>validateCheckpoint({...body,checkpointId:`CP-${hashCanonical(body)}`},identity),/INCOMPATIBLE/);}
  assert.equal(CORE_POLICY_BY_ID.tempo.version,'2.0.0');assert.equal(CORE_POLICY_BY_ID.value.version,'2.0.0');
});
test('real legal-action frames agree in Node and browser, and opponent hidden-card swaps cannot change choices',async()=>{
  const browser=await import('../apps/lab-web/dist/autonomy-runtime.js');
  let state=createSimulationState({profileId:'core-advanced-authority',playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],seed:1337});
  let decisions=0;
  for(let step=0;step<45;step++){
    const frame=createSimulationDecisionFrame(state);state=frame.state;if(frame.status==='TERMINAL')break;
    assert.equal(frame.status,'PLAYER_DECISION_REQUIRED');
    const actorId=frame.decisionActorId;
    const ctx={actorId,authorizedView:strictPolicyView(state,actorId),legalActions:frame.policyActions};
    for(const id of ids){assert.equal(browser.choosePolicy(id,ctx).actionId,CORE_POLICY_BY_ID[id].choose(ctx).actionId);}
    const other=state.turnOrder.find(p=>p!==actorId), changed=structuredClone(state);
    const hidden=changed.players[other].hand;if(hidden.length>1){const identities=hidden.map(id=>changed.cards[id].identity).reverse();hidden.forEach((id,i)=>changed.cards[id].identity=identities[i]);assert.deepEqual(strictPolicyView(changed,actorId),ctx.authorizedView);}
    const move=CORE_POLICY_BY_ID[ids[decisions++%2]].choose(ctx);const result=executeSimulationAction(state,frame.resolve(move.actionId));assert.ok(result.accepted);state=result.state;
  }
  assert.ok(decisions>=10);
});
test('paired tactical runs reproduce across worker counts and reject incompatible evidence',async()=>{
  const input={botA:ids[0],botB:ids[1],gameCount:4,seed:1337,mirrorSeats:true,profileId:'core-advanced-authority'};
  const first=(await runLabSeries({...input,workerCount:1})).run,second=(await runLabSeries({...input,workerCount:2})).run;
  for(const r of first.records){const other=second.records.find(x=>x.ordinal===r.ordinal);for(const key of ['initialStateHash','actionSequenceHash','finalStateHash','winner'])assert.equal(r[key],other[key]);assert.ok(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(r.terminationReason));}
  // This fixture is committed-independent: form an older implementation identity
  // with valid hashes, rather than relying on an ignored local report existing.
  const old=structuredClone(first);old.identity.fingerprint='a'.repeat(64);
  assert.throws(()=>inspectHistoricalArtifact(artifactEnvelope(old)),/INCOMPATIBLE|CHECKPOINT|HASH/);
  const current=inspectHistoricalArtifact(artifactEnvelope(first));assert.ok(current.archival);assert.deepEqual(current.records,first.records);
  const build=await readFile('apps/lab-web/dist/tactics.mjs','utf8');assert.match(build,/tacticalScore/);
});
test('all four named personalities resolve to their current tactical policies without duplicate cards',()=>{
  const catalog=Object.values(CORE_POLICY_BY_ID).map(p=>({...p,traits:policyTraitsFromId(p.policyId)}));
  const model=buildOpponentModel(catalog);
  for(const id of ids){const base=tacticalBase(id);assert.equal(resolveOpponent(model,'normal',base).policyId,id);assert.equal(model.archetypes.filter(a=>a.id===base).length,1);assert.ok(!model.archetypes.some(a=>a.id===id));}
  assert.equal(tacticalBase('__proto__'),null);assert.equal(tacticalBase('toString'),null);
});
test('Core Nine responses tap the larger untapped scoring threat instead of following action-ID order',()=>{
  const c=context({enemyPoints:15,cards:[card('five',5),card('ten',10),card('nine',9,'P1','P1_HAND')],stack:[{controllerId:'P2',actionType:'draw'}]});
  const moves=[action('a-five','instant',['nine'],['five'],{tap:true},'nine-tap'),action('z-ten','instant',['nine'],['ten'],{tap:true},'nine-tap')];
  assert.equal(choose('tempo',moves,c).actionId,'a-five');
  for(const id of ids)assert.equal(choose(id,moves,c).actionId,'z-ten');
  c.authorizedView.knownCards.ten.tapped=true;
  for(const id of ids)assert.equal(choose(id,moves,c).actionId,'a-five');
});
test('Red Joker shuffle-reset is valued only when the draw pile cannot supply the draws',()=>{
  const rj={id:'rj1',identity:'RJ',pointValue:5,controllerId:'P1',zone:'P1_HAND'};
  const ctx=dp=>({actorId:'P1',authorizedView:{own:{securedPoints:0,goal:21,hand:[rj],pr:[],er:[]},opponents:[{playerId:'P2',securedPoints:0,goal:21,handCount:3,pr:[],er:[]}],knownCards:{rj1:rj},stack:[],dpCount:dp,gyCount:14}});
  const shuf=action('shuf','effect-red-joker',['rj1'],[],{},'shuffle-reset');
  // Healthy DP: reshuffling the shared deck for the same 2 draws earns ~nothing.
  assert.ok(evaluateAction(shuf,ctx(30)).utility<60,`healthy-DP utility ${evaluateAction(shuf,ctx(30)).utility}`);
  // Exhausted DP + populated GY: the recycle now carries real draw value.
  assert.ok(evaluateAction(shuf,ctx(0)).utility>150,`empty-DP utility ${evaluateAction(shuf,ctx(0)).utility}`);
});
test('Red Joker opponent-attack discounts large uninspectable hands instead of scaling with them',()=>{
  const rj={id:'rj1',identity:'RJ',pointValue:5,controllerId:'P1',zone:'P1_HAND'};
  const ctx=handCount=>({actorId:'P1',authorizedView:{own:{securedPoints:0,goal:21,hand:[rj],pr:[],er:[]},opponents:[{playerId:'P2',securedPoints:0,goal:21,handCount,pr:[],er:[]}],knownCards:{rj1:rj},stack:[],dpCount:30,gyCount:4}});
  const atk=action('atk','effect-red-joker',['rj1'],[],{},'opponent-attack');
  const small=evaluateAction(atk,ctx(2)).utility,big=evaluateAction(atk,ctx(7)).utility;
  assert.ok(small>0&&big>0,'attack utility stays positive');
  // A forced full-hand mulligan can repair a weak large hand: value must not grow with N.
  assert.ok(big<small,`expected discount for large hands, got small=${small} big=${big}`);
});
test('Red Joker hand-swap and self-reset compare hand quality, not just card count',()=>{
  const rj={id:'rj1',identity:'RJ',pointValue:5,controllerId:'P1',zone:'P1_HAND'};
  const junk={id:'j1',identity:'3♣',pointValue:3,controllerId:'P1',zone:'P1_HAND'};
  const ace={id:'a1',identity:'A♠',pointValue:4,controllerId:'P1',zone:'P1_HAND'};
  const king={id:'k1',identity:'K♥',pointValue:8,controllerId:'P1',zone:'P1_HAND'};
  const ctx=(hand,opp)=>({actorId:'P1',authorizedView:{own:{securedPoints:0,goal:21,hand,pr:[],er:[]},opponents:[{playerId:'P2',securedPoints:0,goal:21,handCount:opp,pr:[],er:[]}],knownCards:Object.fromEntries([rj,junk,ace,king].map(c=>[c.id,c])),stack:[],dpCount:30,gyCount:4}});
  const swap=action('swap','effect-red-joker',['rj1'],[],{},'hand-swap');
  const reset=action('reset','effect-red-joker',['rj1'],[],{},'self-reset');
  // Same opponent count: surrendering a premium hand must score worse than surrendering junk.
  assert.ok(evaluateAction(swap,ctx([rj,junk],3)).utility>evaluateAction(swap,ctx([rj,ace,king],3)).utility);
  assert.ok(evaluateAction(reset,ctx([rj,junk],3)).utility>evaluateAction(reset,ctx([rj,ace,king],3)).utility);
});
test('rank-strategy hand advantage weighs strategic quality so junk-heavy hands are not misread as ahead',()=>{
  const rj={id:'rj1',identity:'RJ',pointValue:5};
  const junk=['3♣','3♦','3♥','4♣'].map((identity,i)=>({id:`j${i}`,identity,pointValue:Number(identity[0])}));
  const knownCards=Object.fromEntries([rj,...junk].map(c=>[c.id,c]));
  // 5 low-quality cards vs a hidden 2-card hand: count advantage +0.6, but
  // strategic quality is roughly even — the attack must not read as favorable.
  // 5 low-quality cards vs a hidden 3-card hand: raw count reads +0.4 ahead,
  // but strategic quality is dead even — the attack must not read favorable.
  const ctx={actorId:'P1',authorizedView:{own:{hand:[rj,...junk],securedPoints:0},opponents:[{playerId:'P2',handCount:3,securedPoints:0}],knownCards}};
  const atk={family:'effect-red-joker',mode:'opponent-attack',sourceHandles:['rj1']};
  const res=evaluateRankStrategy(atk,ctx,{});
  assert.ok(res.reasonCodes.includes('RED_JOKER_OPPONENT_ATTACK_NEUTRAL'),JSON.stringify(res));
  assert.ok(res.adjustment<0);
  // A genuinely superior hand still qualifies: premium cards vs a thin enemy.
  const premium={actorId:'P1',authorizedView:{own:{hand:[rj,{id:'a1',identity:'A♠',pointValue:4},{id:'k1',identity:'K♥',pointValue:8}],securedPoints:0},opponents:[{playerId:'P2',handCount:1,securedPoints:0}],knownCards}};
  const strong=evaluateRankStrategy(atk,premium,{});
  assert.ok(strong.reasonCodes.includes('RED_JOKER_OPPONENT_ATTACK_FAVORABLE'),JSON.stringify(strong));
});
test('diagnostic policy modifiers filter legal actions without changing match structure',()=>{
  const seed='diag-mod-smoke';
  const base=runPolicyMatch({profileId:'core-advanced-authority',seed,seatOrder:['P1','P2'],policyIds:['value-tactical','tempo-tactical'],decisionLimit:200,telemetryEnabled:true});
  const filtered=runPolicyMatch({profileId:'core-advanced-authority',seed,seatOrder:['P1','P2'],policyIds:['value-tactical|drop:score','tempo-tactical'],decisionLimit:200,telemetryEnabled:true});
  const p1Scores=filtered.decisions.filter(d=>d.actorId==='P1'&&d.family==='score').length;
  assert.equal(p1Scores,0,'drop:score removed every scoring decision for the filtered seat');
  assert.ok(filtered.decisions.some(d=>d.actorId==='P2'&&d.family==='score'),'unfiltered seat still scores');
  assert.ok(base.decisions.some(d=>d.actorId==='P1'&&d.family==='score'),'baseline scored normally');
  // Unknown modifiers degrade to the base policy rather than erroring.
  const same=runPolicyMatch({profileId:'core-advanced-authority',seed,seatOrder:['P1','P2'],policyIds:['value-tactical','tempo-tactical'],decisionLimit:200,telemetryEnabled:false});
  assert.equal(same.summary.matchResultHash,base.summary.matchResultHash);
});
test('local history admits older frozen implementations for inspection only and preserves their envelope',async()=>{
  const identity=await evolutionIdentity(),oldIdentity={...identity,policyImplementationHash:'b'.repeat(64),runtimeHash:'c'.repeat(64)};
  // Historical v1 fixture has no v2 dependency attestation.
  for(const key of ['identityContract','dependencyManifest','analysisHash','analysisFingerprint'])delete oldIdentity[key];
  const {engineHash,policyImplementationHash,runtimeHash,engineVersion,rulesVersion}=oldIdentity;
  oldIdentity.fingerprint=hashCanonical({engineHash,policyImplementationHash,runtimeHash,engineVersion,rulesVersion});
  const old=createLabRun({botA:'tempo',botB:'value',gameCount:2,seed:1337},oldIdentity);old.status='STOPPED';
  const envelope=artifactEnvelope(old),before=structuredClone(envelope);
  const {EvolutionStore}=await import('../apps/lab-web/dist/evolution/evolution-store.mjs');
  const store=new EvolutionStore(identity);store.read=async()=>envelope;
  await assert.rejects(()=>store.load(old.runId),/INCOMPATIBLE/);
  const loaded=await store.loadForInspection(old.runId);assert.ok(loaded.historical);assert.ok(loaded.run.archival);assert.deepEqual(loaded.envelope,before);assert.deepEqual(loaded.run.checkpoints,old.checkpoints);
  envelope.contentHash='d'.repeat(64);await assert.rejects(()=>store.loadForInspection(old.runId),/HASH/);
});
