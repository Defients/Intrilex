import test from 'node:test';
import assert from 'node:assert/strict';
import { policyActionInventory } from '../scripts/lib/policy-action-inventory.mjs';
import { ACTION_FIXTURES,actionFixture } from '../packages/policies/test/action-fixtures.mjs';
import { evaluateAction,privateChoiceScore,recordActionCoverage,handValue } from '../packages/policies/src/action-evaluation.mjs';
import { CORE_POLICY_BY_ID,rankPolicyActions } from '../packages/policies/src/index.mjs';
import { TACTICAL_POLICY_IDS } from '../packages/policies/src/tactics.mjs';
import { HYBRIX_POLICIES } from '../packages/game-ai/src/policy-adapter.mjs';
import { evaluateRankStrategy } from '../packages/game-ai/src/rank-strategy.mjs';
import { actionSemantics } from '../packages/engine-adapter/src/action-semantics.mjs';
import { createSimulationDecisionFrame,strictPolicyView,executeSimulationAction } from '../packages/engine-adapter/src/adapter.mjs';
import { arenaAnalytics } from '../apps/lab-web/src/evolution/evolution-analytics-model.mjs';
import { runCampaign } from '../packages/simulation-runtime/src/campaign.mjs';

const c=(id,identity,pointValue,extra={})=>({id,identity,pointValue,controllerId:'P1',zone:'P1_HAND',...extra});
const ctx=(hand,extra={})=>({actorId:'P1',authorizedView:{own:{hand,securedPoints:0,goal:21,pr:[],er:[],limits:{miniTurnsRemaining:2}},opponents:[{playerId:'P2',securedPoints:0,goal:21,handCount:3,pr:[],er:[]}],knownCards:Object.fromEntries(hand.map(c=>[c.id,c])),dpCount:20,gyCount:0,stack:[],...extra}});
const a=(id,family,mode,sources=[],targets=[],fv={},semantics)=>({actionId:id,family,mode,sourceHandles:sources,targetHandles:targets,featureVector:fv,timingClass:'ACTION',...(semantics?{semantics}:{})});
const selected=(id,actions,context)=>rankPolicyActions(id,actions,context)[0].action;

test('authority AST inventory classifies every literal and templated Core action declaration',async()=>{
  const inventory=await policyActionInventory();assert.ok(inventory.length>95);
  assert.equal(new Set(inventory.map(r=>r.family)).size,31);
  assert.deepEqual(inventory.filter(r=>!r.classified||!r.purpose),[]);
  const unknown=evaluateAction(a('unknown','unknown','unknown'),ctx([]));assert.equal(unknown.supported,false);assert.equal(unknown.modeSupported,false);
});

test('optional Start swaps compete fairly and preserve winning cards and royal recipes',()=>{
  const hand=[c('low','3♣',3),c('king','K♣',8),c('queen','Q♣',2),c('ace','A♠',4)];
  const context=ctx(hand),advance=a('phase','phase','enter-action'),moves=[advance,...hand.map(card=>a(card.id,'swap-bar','face-down',[card.id]))];
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,moves,context).actionId,'low');
  context.authorizedView.own.securedPoints=18;
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,[advance,moves[1]],context).family,'phase');
  assert.ok(handValue(hand[2],context.authorizedView)>handValue(hand[0],context.authorizedView));
});

test('face-up draw values counter and recipe roles and can beat an unknown deck draw',()=>{
  const context=ctx([c('king','K♣',8)]);context.authorizedView.knownCards.q=c('q','Q♣',2,{zone:'SWAP_BAR',controllerId:null});
  const moves=[a('bar','swap-bar','face-up-draw',[],['q']),a('draw','draw','top',[],[],{cardsDrawn:1})];
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,moves,context).actionId,'bar');
});

test('private discards preserve good cards; takes and keeps acquire good cards',()=>{
  const context=ctx([c('low','3♣',3),c('high','10♥',10)]);
  for(const mode of ['nine-anchor-discard','rank3-present'])assert.ok(privateChoiceScore(a('l','private-choice',mode,[],['low']),context)>privateChoiceScore(a('h','private-choice',mode,[],['high']),context));
  context.authorizedView.pendingChoice={context:{targetPlayerId:'P1'}};
  assert.ok(privateChoiceScore(a('l','private-choice','rank3-discard',[],['low']),context)>privateChoiceScore(a('h','private-choice','rank3-discard',[],['high']),context));
  assert.ok(privateChoiceScore(a('h','private-choice','rank5-rummage',[],['high']),context)>privateChoiceScore(a('l','private-choice','rank5-rummage',[],['low']),context));
});

test('Six keep-all compares the complete kept set and the actual discard cost',()=>{
  const context=ctx([c('low','2♣',2),c('high','10♥',10),c('mid','8♦',8)]);
  context.authorizedView.pendingChoice={context:{drawnCardIds:['high','mid']}};
  const keep=a('keep','private-choice','rank6-keep-return-top',[],['high','mid'],{keepCount:2});
  const discard=a('discard','private-choice','rank6-keep-all-discard',[],['low'],{keepAll:true});
  assert.ok(privateChoiceScore(keep,context)>privateChoiceScore(discard,context));
  context.authorizedView.pendingChoice.context.drawnCardIds.push('low');
  assert.equal(privateChoiceScore(keep,context),privateChoiceScore(discard,context));
});

test('Seven ordered assignments recognize a winning score and distinguish hand/effect roles',()=>{
  const context=ctx([c('low','3♣',3),c('high','10♥',10)]);context.authorizedView.own.securedPoints=11;
  const raw={family:'private-choice',command:{kind:'core-submit-private-choice',submission:{kind:'core-rank7-assign',mode:'hand-and-score',selectedCardIds:['low','high']}}};
  const semantics=actionSemantics(raw);assert.deepEqual(semantics.scoreHandles,['high']);assert.deepEqual(semantics.acquireHandles,['low']);
  const winning=a('win','private-choice','rank7-hand-and-score',[],['low','high'],{toScore:true,toHand:true},semantics);
  const reversed=a('other','private-choice','rank7-hand-and-score',[],['high','low'],{toScore:true,toHand:true},{...semantics,scoreHandles:['low'],acquireHandles:['high']});
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,[reversed,winning],context).actionId,'win');
});

test('Foundation and three-black Ultra expose scored-card roles to evaluation',()=>{
  const context=ctx([c('ten','10♣',10),c('score','9♠',9),c('cast','3♣',3),c('exile','5♠',5)]);
  const foundation=a('foundation','rank10','club-foundation-bonus',['ten'],['score'],{foundation:true,bonus:true},actionSemantics({command:{kind:'core-resolve-advanced',advanced:{kind:'advanced-rank10-club-foundation',sourceCardId:'ten',bonusScoreCardId:'score'}}}));
  assert.equal(evaluateAction(foundation,context).gain,19);
  const ultra=a('ultra','ultra','three-black-bounce-top',['score','cast','exile'],[],{},actionSemantics({command:{kind:'core-resolve-advanced',advanced:{kind:'advanced-ultra-three-black',scoreCardId:'score',castCardId:'cast',exileCardId:'exile',castEffect:{kind:'three-bounce'}}}}));
  assert.equal(evaluateAction(ultra,context).gain,9);assert.deepEqual(ultra.semantics.exileHandles,['exile']);
});

test('copied clear includes the declared discard cost and rejects destructive own-board trades',()=>{
  const own=c('own','10♥',10,{zone:'P1_PR'}),enemy=c('enemy','3♦',3,{zone:'P2_PR',controllerId:'P2'});
  const context=ctx([c('wild','K♠',8),c('cost','A♠',4)]);context.authorizedView.own={...context.authorizedView.own,pr:[own],securedPoints:10};context.authorizedView.opponents[0].pr=[enemy];context.authorizedView.opponents[0].securedPoints=3;
  const move=a('wild','wild-sovereignty','total-clear',['wild'],[],{}, {effectKind:'total-clear',discardHandles:['cost']});
  const value=evaluateAction(move,context);assert.equal(value.spent,2);assert.equal(value.ownLoss,10);assert.equal(value.removed,3);
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,[move,a('draw','draw','top')],context).actionId,'draw');
});

test('premium response is selected when it is the sole legal defense, and declines our own top',()=>{
  const context=ctx([c('a','A♣',4),c('b','A♦',4)]);context.authorizedView.opponents[0].securedPoints=20;
  context.authorizedView.stack=[{controllerId:'P2',actionType:'play-for-points'}];
  const moves=[a('super','counter','super-ace',['a','b'],[],{counter:true}),a('pass','response-decline','decline')];
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,moves,context).actionId,'super');
  context.authorizedView.stack[0].controllerId='P1';
  for(const id of TACTICAL_POLICY_IDS)assert.equal(selected(id,moves,context).actionId,'pass');
});

test('goal shift values the actual goal gap and reaches a reduced own goal',()=>{
  const context=ctx([c('nine','9♠',9)]);context.authorizedView.own.securedPoints=19;
  const shift=a('shift','instant','nine-spade-goal-shift-5',['nine'],[],{goalShift:true,delta:5,ownGoalDelta:-2});
  const value=evaluateAction(shift,context);assert.equal(value.gain,2);assert.equal(value.removed,5);
  for(const id of TACTICAL_POLICY_IDS)assert.ok(rankPolicyActions(id,[shift],context)[0].score>=10000);
});

test('tempo values useful remaining cards and hard-cap headroom',()=>{
  const context=ctx([c('j1','J♣',3),c('j2','J♦',3)]),move=a('tempo','super','jack-tempo',['j1','j2'],[],{miniTurns:2});
  const empty=evaluateAction(move,context).utility;
  context.authorizedView.own.hand.push(c('ten','10♥',10),c('nine','9♥',9));
  assert.ok(evaluateAction(move,context).utility>empty);
});

test('forced discard leaves two cards; Sudden Death estimates the lead after Scrap',()=>{
  const context=ctx([]),raid=a('raid','effect-private-choice','three-force-discard');
  context.authorizedView.opponents[0].handCount=2;assert.ok(evaluateAction(raid,context).utility<0);
  context.authorizedView.opponents[0].handCount=5;assert.equal(evaluateAction(raid,context).utility,540);
  const target=c('target','10♥',10,{zone:'P2_PR',controllerId:'P2'});context.authorizedView.knownCards.target=target;
  context.authorizedView.own.securedPoints=17;context.authorizedView.opponents[0].securedPoints=20;
  const value=evaluateAction(a('death','sudden-death','declare',[],['target']),context);assert.equal(value.removed,10);assert.ok(value.utility>0);
});

test('Seven exposes engine-authorized generated Super plays and executes every offered generated candidate',()=>{
  const fixture=ACTION_FIXTURES.find(f=>f.name==='seven-generated-super'),frame=createSimulationDecisionFrame(actionFixture(fixture));
  const supers=frame.policyActions.filter(a=>a.featureVector.generatedFamily==='super');assert.ok(supers.length>0);
  const context={actorId:frame.decisionActorId,authorizedView:strictPolicyView(frame.state,frame.decisionActorId)};
  for(const action of frame.policyActions){assert.ok(executeSimulationAction(frame.state,frame.resolve(action.actionId)).accepted);assert.ok(Number.isFinite(privateChoiceScore(action,context)));}
  assert.equal(supers[0].featureVector.generatedMode,'two-score');assert.equal(supers[0].sourceHandles.length,2);
});

test('HybriX rank strategy uses current mode names, card objects, public rows and stack sources',()=>{
  const context=ctx([c('queen','Q♣',2),c('king','K♣',8)]);
  assert.ok(evaluateRankStrategy(a('q','anchor','queen',['queen']),context,{}).reasonCodes.includes('PRESERVE_QUEEN_FOR_ROYAL_MARRIAGE'));
  context.authorizedView.stack=[{controllerId:'P2',sourceCardIds:['queen','king'],stackClass:'super'}];
  assert.ok(evaluateRankStrategy(a('a','counter','super-ace',['king'],[],{counter:true}),context,{}).reasonCodes.length);
  context.authorizedView.own.securedPoints=21;
  assert.ok(!evaluateRankStrategy(a('p','phase','enter-action'),context,{}).reasonCodes.includes('TERMINAL_SCORE_AVAILABLE'));
});

test('opportunity accounting counts windows, combines Super Ace, and distinguishes timing',()=>{
  const stats={},moves=[a('a','counter','super-ace'),a('b','counter','super-ace'),a('c','super','jack-tempo')];
  moves[0].timingClass='INSTANT';recordActionCoverage(stats,moves,moves[0]);
  assert.equal(stats.actionCoverage.opportunities['play:super'],1);assert.equal(stats.actionCoverage.selected['play:super'],1);
  assert.equal(stats.actionCoverage.opportunities['family:counter'],1);assert.equal(stats.actionCoverage.selected['timing:INSTANT'],1);
  const run={config:{gameCount:2,mirrorSeats:true},records:[0,1].map(ordinal=>({ordinal,swapped:Boolean(ordinal),seed:1,winner:'P1',terminationReason:'NORMAL_VICTORY',turns:1,decisions:1,seatBehavior:[{decisions:1,actionCoverage:stats.actionCoverage},{decisions:0}]}))};
  const model=arenaAnalytics(run);assert.equal(model.opportunityRows.find(r=>r.key==='play:super').A,100);assert.equal(model.coverage.A.games,1);assert.equal(model.coverage.B.games,1);
  assert.equal(arenaAnalytics({config:{},records:[]}).opportunityRows.length,0);
});

test('cache implementation identity cannot alter the established campaign seed sequence',async()=>{
  const config={profileId:'core-advanced-authority',matchCount:1,policyPairs:[['score-rush','tempo']],decisionLimit:5,workerCount:1};
  const before=await runCampaign(config),after=await runCampaign({...config,implementationFingerprint:'f'.repeat(64)});
  assert.equal(after.experimentHash,before.experimentHash);assert.equal(after.summaries[0].seed,before.summaries[0].seed);
  assert.equal(after.canonicalResultHash,before.canonicalResultHash);
});

for(const fixture of ACTION_FIXTURES)test(`real authority frame: ${fixture.name} has classified, finite, executable policy choices and browser parity`,async()=>{
  const browser=await import('../apps/lab-web/dist/autonomy-runtime.js');
  const frame=createSimulationDecisionFrame(actionFixture(fixture));assert.equal(frame.status,'PLAYER_DECISION_REQUIRED');
  const context={actorId:frame.decisionActorId,authorizedView:strictPolicyView(frame.state,frame.decisionActorId),legalActions:frame.policyActions,matchId:`coverage-${fixture.name}`,runInstanceId:'coverage',decisionIndex:0};
  for(const action of frame.policyActions){const value=evaluateAction(action,context);assert.ok(value.supported,action.family);assert.ok(value.modeSupported,`${action.family}:${action.mode}`);for(const key of ['gain','removed','ownLoss','utility','cost'])assert.ok(Number.isFinite(value[key]),key);}
  for(const id of TACTICAL_POLICY_IDS){const move=CORE_POLICY_BY_ID[id].choose(context);assert.ok(executeSimulationAction(frame.state,frame.resolve(move.actionId)).accepted);assert.equal(browser.choosePolicy(id,{...context,authorizedView:browser.strictView(frame.state,context.actorId)}).actionId,move.actionId);}
  for(const policy of HYBRIX_POLICIES){const move=policy.choose(context);assert.ok(executeSimulationAction(frame.state,frame.resolve(move.actionId)).accepted);assert.equal(browser.choosePolicy(policy.policyId,{...context,authorizedView:browser.strictView(frame.state,context.actorId)}).actionId,move.actionId);}
  const changed=structuredClone(frame.state),other=changed.turnOrder.find(p=>p!==context.actorId),hidden=[...changed.players[other].hand,...changed.zones.dp,...changed.zones.swapBar.filter(id=>changed.cards[id].state.swapBarFaceDown)].filter(id=>!context.authorizedView.knownCards[id]||context.authorizedView.knownCards[id].identity==='HIDDEN');
  const identities=hidden.map(id=>changed.cards[id].identity).reverse();hidden.forEach((id,i)=>changed.cards[id].identity=identities[i]);
  assert.deepEqual(strictPolicyView(changed,context.actorId),context.authorizedView);
});
