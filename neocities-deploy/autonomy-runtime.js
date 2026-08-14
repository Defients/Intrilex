import {
  IntrilexEngine,
  createMatchState,
  advanceToDecision,
  authorizedLegalActionView,
  createCoreMatchState,
  advanceCoreToDecision,
  toAuthorizedCoreAction,
  deriveSecuredPoints,
  hashCanonical
} from './engine/browser-entry.js?v=73b458295383';
import { rankPolicyActions } from './policy-scoring.js?v=73b458295383';
import { HYBRIX_POLICY_IDS, chooseHybrixPolicy } from './hybrix/policy-adapter.js?v=73b458295383';
import { attributeAction,   isNoAttributionAction} from './browser-analytics.js?v=73b458295383';
import { LAB_VERSION as _LAB_VERSION, ENGINE_VERSION as _ENGINE_VERSION, RULES_VERSION as _RULES_VERSION } from './version.js?v=73b458295383';

const BASELINE_POLICY_IDS = ['random-legal','score-rush','control','tempo','value'];
export const POLICY_IDS = [...BASELINE_POLICY_IDS, ...HYBRIX_POLICY_IDS];
export const DEFAULT_PROFILE_ID = 'core-advanced-authority';
export const ENGINE_VERSION = _ENGINE_VERSION;
export const LAB_VERSION = _LAB_VERSION;
const COMPLETE_REASONS = new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);
const RESPONSE_FAMILIES = new Set(['counter','disrupt','interrupt','instant','quick','response-decline']);
const ADVANCED_FAMILIES = new Set(['royal-marriage','super','rank10','ultra','voltage']);
const lexical = (actions) => [...actions].sort((a,b) => a.actionId.localeCompare(b.actionId));
const increment=(record,key,amount=1)=>{record[key]=(record[key]??0)+amount;};
const isCore=(profileId)=>String(profileId).startsWith('core-');

export class PolicyRng {
  constructor(seed){this.seed=(Number(seed)>>>0)||1;this.cursor=0;}
  nextUint32(){let x=this.seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;this.cursor+=1;return this.seed;}
  nextIndex(length){if(!Number.isInteger(length)||length<=0)throw new RangeError('length');return this.nextUint32()%length;}
}
const uint32FromHash=(value)=>Number.parseInt(hashCanonical(value).slice(0,8),16)>>>0||1;
const pointValue=(card)=>{if(!card)return null;if(typeof card.state?.pointValue==='number')return card.state.pointValue;const rank=String(card.identity??'').replace(/[♣♦♥♠]/gu,'');if(/^\d+$/.test(rank))return Number(rank);return({A:4,J:3,Q:2,K:8,RJ:5,BJ:11})[rank]??0;};

export function createState(setup){return isCore(setup.profileId)?createCoreMatchState({profileId:setup.profileId,playerIds:setup.playerIds,seatOrder:setup.seatOrder,enabledModules:[],seed:setup.seed}):createMatchState({...setup,eventApprovedModules:[]});}
export function advance(state){return state.metadata?.coreAuthority?advanceCoreToDecision(state):advanceToDecision(state);}
export function actionView(action,profileId){return isCore(profileId)?toAuthorizedCoreAction(action):authorizedLegalActionView(action);}

export function strictView(state,actorId){
  const actor=state.players[actorId],knownCards={};
  const card=(id)=>{const c=state.cards[id];if(!c)return null;const view={id,identity:c.identity,controllerId:c.controllerId,zone:c.zone,pointValue:pointValue(c),tapped:c.state?.tapped===true,aegis:c.state?.aegis!==undefined||c.state?.aegisExpiresAt!==undefined,swapBarFaceDown:c.state?.swapBarFaceDown===true,swapBarFaceUp:c.state?.swapBarFaceUp===true,providesGuard:c.state?.providesGuard===true,exileBound:c.state?.exileBound===true};knownCards[id]=view;return view;};
  const runtime=state.metadata?.coreAuthority??state.metadata?.autonomy??{};const choice=runtime.privateChoice;
  return{schemaVersion:'4.0.0',engineVersion:ENGINE_VERSION,profileId:runtime.profileId??null,actorId,activePlayerId:state.activePlayerId,phase:state.phase,revision:state.revision,fullTurnSequence:state.fullTurnSequence,dpCount:state.zones.dp.length,gyCount:state.zones.gy.length,gyTopCard:state.zones.gy.length>0?card(state.zones.gy[state.zones.gy.length-1]):null,exileCount:state.zones.exile.length,swapBar:state.zones.swapBar.map(id=>state.cards[id]?.state?.swapBarFaceUp?card(id):{id,identity:'HIDDEN',faceDown:true}),boardLock:structuredClone(state.metadata?.boardLock??null),suddenDeath:structuredClone(state.metadata?.suddenDeath??null),exhausted:structuredClone(runtime.exhausted??null),voltage:structuredClone(state.metadata?.phase8??null),priority:structuredClone(state.priority),stack:(state.stack??[]).map(item=>({id:item.id,controllerId:item.controllerId,originalControllerId:item.originalControllerId??null,kind:item.kind,status:item.status,sourceCardIds:[...(item.sourceCardIds??[])],targetCardIds:[...(item.targetCardIds??[])],actionType:item.coreAuthority?.actionType??item.firstContactAuthority?.actionType??null,stackClass:item.coreAuthority?.stackClass??item.firstContactAuthority?.stackClass??null,advancedKind:item.coreAuthority?.advanced?.kind??null})),triggerQueue:(state.triggerQueue??[]).map(trigger=>({id:trigger.id,type:trigger.type,controllerId:trigger.controllerId??null,status:trigger.status??null})),pendingChoice:choice?.chooserId===actorId?{choiceId:choice.choiceId,kind:choice.kind,stage:choice.stage,minSelections:choice.minSelections,maxSelections:choice.maxSelections,optionCards:(choice.optionCardIds??[]).map(card).filter(Boolean),sourceCard:choice.sourceCardId?card(choice.sourceCardId):null,context:structuredClone(choice.context??{})}:null,knownCards,own:{goal:actor.goal,securedPoints:deriveSecuredPoints(state,actorId),hand:actor.hand.map(card).filter(Boolean),pr:actor.pr.map(card).filter(Boolean),er:actor.er.map(card).filter(Boolean),limits:structuredClone(actor.limits??{})},opponents:state.turnOrder.filter(id=>id!==actorId).map(id=>({playerId:id,goal:state.players[id].goal,securedPoints:deriveSecuredPoints(state,id),handCount:state.players[id].hand.length,pr:state.players[id].pr.map(card).filter(Boolean),er:state.players[id].er.map(card).filter(Boolean)}))};
}
export function choosePolicy(policyId,context){
  if(!policyId||policyId==='random-legal'){const actions=lexical(context.legalActions);return actions[context.rng.nextIndex(actions.length)];}
  if(policyId.startsWith('hybrix-')){
    const envelope=chooseHybrixPolicy(policyId,context);
    if(!envelope)return null;
    // BL-04 fix: HYBIX returns {actionId, metadata} envelope.
    // Resolve to canonical action from legalActions by actionId, then
    // attach HYBIX metadata separately so runtime can access family/mode/timingClass.
    const canonical=context.legalActions.find(a=>a.actionId===envelope.actionId);
    if(!canonical)return null;
    // Merge HYBIX metadata into the canonical action without losing original fields
    return{...canonical,_hybrixMetadata:envelope.metadata??null};
  }
  return rankPolicyActions(policyId,context.legalActions,context)[0]?.action??null;
}
function countFamilies(record,set){return [...set].reduce((sum,key)=>sum+Number(record[key]??0),0);}
const MINI_TURN_FAMILIES=new Set(['draw','score','play-for-points','scuttle','swap-bar','effect-three','effect-four','effect-five','effect-six','effect-seven','effect-nine','effect-red-joker','effect-board-lock','effect-row-clear','effect-tap','effect-goal-shift','effect-jack-control','effect-private-choice','anchor','anchor-guard','anchor-private-choice','attachment','royal-marriage','super','rank10','ultra','exhausted-pass']);
const RESPONSE_DECLINE_FAMILIES=new Set(['counter','disrupt','interrupt','instant','quick','response-decline']);
const semanticClassForAction=(action)=>{if(!action)return'invariant';if(action.family==='response-decline')return'response-decline';if(action.family==='private-choice')return'private-choice';if(action.family==='phase')return'phase-transition';if(RESPONSE_FAMILIES.has(action.family)||['INSTANT','QUICK','INTERRUPT'].includes(action.timingClass))return'free-response-play';return'mini-turn-action';};
const isMiniTurnAction=(action)=>semanticClassForAction(action)==='mini-turn-action'&&action.family!=='phase';
const isMeaningfulResponseFrame=(actions=[])=>{const hasDecline=actions.some(a=>a.family==='response-decline');const real=actions.filter(a=>a.family!=='response-decline');return hasDecline&&real.length>0;};
const NON_MECHANIC_FAMILIES=new Set(['phase','response-decline','private-choice']);
const NON_MECHANIC_MODES=new Set(['enter-action','decline','points','ordinary','top','forced-mini-turn','♣','♦','♥','♠']);
const TIMING_FAMILIES=new Set(['instant','quick','interrupt']);
const mechanicTags=(action)=>{const tags=new Set();if(!NON_MECHANIC_FAMILIES.has(action.family)&&!TIMING_FAMILIES.has(action.family))tags.add(action.family);if(action.mode&&!NON_MECHANIC_MODES.has(action.mode)&&action.mode!==action.family)tags.add(action.mode);return[...tags].sort();};
const primaryMechanicTag=(action)=>{if(NON_MECHANIC_FAMILIES.has(action.family))return null;if(action.mode&&!NON_MECHANIC_MODES.has(action.mode)&&action.mode!==action.family)return action.mode;if(TIMING_FAMILIES.has(action.family))return null;return action.family;};
const countUntappedQueens=(state,playerId)=>(state.players?.[playerId]?.er??[]).filter(id=>/^Q[♣♦♥♠]$/u.test(String(state.cards?.[id]?.identity??''))&&state.cards?.[id]?.state?.tapped!==true).length;
function buildRuleCompliance({decisions,events,state}){
  const interruptTargets=decisions.filter(item=>item.mode==='rank10-stack-theft'),threeRedTargets=decisions.filter(item=>item.mode==='three-red-counter');
  const authorizedFullTurnSkips=events.reduce((sum,event)=>event.type==='CORE_RANK10_STACK_THEFT_RESOLVED'?sum+2:event.type==='CORE_COUNTER_RESOLVED'&&event.payload?.stackTheftPrintedSkipApplied===true?sum+1:sum,0);
  const consumedFullTurnSkips=events.filter(event=>event.type==='CORE_FULL_TURN_SKIP_CONSUMED').length;
  const pendingFullTurnSkips=Object.values(state.players??{}).reduce((sum,player)=>sum+Number(player.limits?.pendingFullTurnSkips??0),0);
  const checks={ordinaryPassActionCount:decisions.filter(item=>item.family==='pass').length,nonExhaustedPassActionCount:decisions.filter(item=>item.family.includes('pass')&&item.family!=='exhausted-pass').length,responseDeclineMiniTurnViolationCount:decisions.filter(item=>item.family==='response-decline'&&item.consumedMiniTurn).length,freePlayMiniTurnViolationCount:decisions.filter(item=>['INSTANT','QUICK','INTERRUPT'].includes(item.timingClass)&&item.consumedMiniTurn).length,quickTimingViolationCount:decisions.filter(item=>item.timingClass==='QUICK'&&item.actorId!==item.activePlayerId).length,interruptWindowViolationCount:decisions.filter(item=>item.timingClass==='INTERRUPT'&&!item.hadLawfulResponse).length,stackTheftTargetViolationCount:interruptTargets.filter(item=>!['ordinary-effect','anchor','rank10'].includes(item.targetStackClass)||item.targetSourceCount!==1).length,threeRedQueenDefenseViolationCount:threeRedTargets.filter(item=>item.targetUntappedQueenDefenders>=2).length,unauthorizedFullTurnSkipCount:Math.max(0,consumedFullTurnSkips+pendingFullTurnSkips-authorizedFullTurnSkips),missingPrintedFullTurnSkipCount:Math.max(0,authorizedFullTurnSkips-consumedFullTurnSkips-pendingFullTurnSkips)};
  const violationCount=Object.values(checks).reduce((sum,value)=>sum+value,0);
  return{status:violationCount===0?'PASS':'FAIL',violationCount,...checks,authorizedFullTurnSkips,consumedFullTurnSkips,pendingFullTurnSkips};
}

export function runBrowserPolicyMatch({seed,policyIds=['random-legal','random-legal'],decisionLimit=1800,ordinal=0,profileId=DEFAULT_PROFILE_ID,initialState=null,seatOrder=null,seatSwapped=false,pairedRunId=null,recordReplay=false}){
  if(policyIds.length!==2||policyIds.some(id=>!POLICY_IDS.includes(id)))throw new Error('INVALID_POLICY_PAIR');
  const seats=seatOrder??['P1','P2'];const setup={profileId,playerIds:seats,enabledModules:[],eventApprovedModules:[],seed:(seed>>>0)||1,seatOrder:seats};
  let state=initialState?structuredClone(initialState):createState(setup);const engine=new IntrilexEngine();
  const replayCommands=recordReplay?[]:null;const replayInitialState=recordReplay?structuredClone(state):null;
  const rngByPlayer=Object.fromEntries(seats.map((playerId,index)=>[playerId,new PolicyRng(uint32FromHash({seed:setup.seed,playerId,policyId:policyIds[index],stream:'POLICY_V4'}))]));
  const actionCounts={},actionModeCounts={},decisionFamilyCounts={},decisionModeCounts={},responseActionCounts={},timingClassCounts={},eventTypeCounts={},mechanicCounts={},primaryMechanicCounts={},mechanicOpportunityCounts={},primaryMechanicOpportunityCounts={};const semantic={miniTurnActionCount:0,exhaustedPassActionCount:0,responseOpportunityCount:0,responsePlayedCount:0,responseDeclinedWithOptionsCount:0,automaticPriorityAdvanceCount:0,responseWindowClosedCount:0,counterDeclarationCount:0,quickDeclarationCount:0,instantDeclarationCount:0,interruptDeclarationCount:0,policyDecisionCount:0,policyActionCount:0,actionCount:0,passActionCount:0,miniTurnCount:0,meaningfulResponseDecisionCount:0,automaticOrchestrationCommandCount:0};
  const perSeat=[{miniTurnActionCount:0,exhaustedPassActionCount:0,responsePlayedCount:0,responseDeclinedWithOptionsCount:0,counterDeclarationCount:0,quickDeclarationCount:0,instantDeclarationCount:0,interruptDeclarationCount:0,policyDecisionCount:0,policyActionCount:0,actionCount:0,passActionCount:0,miniTurnCount:0,meaningfulResponseDecisionCount:0,responseOpportunityCount:0,advancedDecisionCount:0,voltageDecisionCount:0,ultraDecisionCount:0,privateChoiceDecisionCount:0,mechanicCounts:{},primaryMechanicCounts:{},mechanicOpportunityCounts:{},primaryMechanicOpportunityCounts:{},decisionFamilyCounts:{}},{miniTurnActionCount:0,exhaustedPassActionCount:0,responsePlayedCount:0,responseDeclinedWithOptionsCount:0,counterDeclarationCount:0,quickDeclarationCount:0,instantDeclarationCount:0,interruptDeclarationCount:0,policyDecisionCount:0,policyActionCount:0,actionCount:0,passActionCount:0,miniTurnCount:0,meaningfulResponseDecisionCount:0,responseOpportunityCount:0,advancedDecisionCount:0,voltageDecisionCount:0,ultraDecisionCount:0,privateChoiceDecisionCount:0,mechanicCounts:{},primaryMechanicCounts:{},mechanicOpportunityCounts:{},primaryMechanicOpportunityCounts:{},decisionFamilyCounts:{}}];
  const auditDecisions=[],capturedEvents=[],rankDecisions=[];
  let decisions=0,responseDecisions=0,commands=0,events=0,terminationReason='DECISION_LIMIT',errorCode=null;
  // BL-05 fix: compute matchId before the loop so it's available in policy context
  const matchId=`M-${hashCanonical({profileId,seed:setup.seed,seatOrder:seats,policyIds}).slice(0,20)}`;
  // BL-05 fix: mint a fresh opaque executionInstanceToken per top-level run.
  // This is process-local cache/lifecycle ownership only — never serialized or hashed.
  const executionInstanceToken=`${matchId}:${Date.now()}:${Math.random().toString(36).slice(2,10)}`;
  const capture=(items)=>{events+=items.length;capturedEvents.push(...items);for(const event of items){increment(eventTypeCounts,event.type);const type=String(event.type??'');if(/AUTOMATIC_PRIORITY_ADVANCE/.test(type)){semantic.automaticPriorityAdvanceCount+=1;semantic.automaticOrchestrationCommandCount+=1;}if(/RESPONSE_WINDOW_CLOSED/.test(type))semantic.responseWindowClosedCount+=1;}};
  for(let decisionIndex=0;decisionIndex<decisionLimit;decisionIndex+=1){
    const advanced=advance(state);state=advanced.state;commands+=advanced.executedCommands.length;capture(advanced.events);
    if(replayCommands)replayCommands.push(...advanced.executedCommands);
    if(advanced.status==='TERMINAL'){terminationReason=advanced.reasonCode==='CANONICAL_DRAW'?'CANONICAL_DRAW':advanced.reasonCode==='EXHAUSTED_RESOLUTION'?'EXHAUSTED_RESOLUTION':'NORMAL_VICTORY';break;}
    if(advanced.status!=='PLAYER_DECISION_REQUIRED'||!advanced.legalActionFrame){terminationReason='UNSUPPORTED_CONFIGURATION';errorCode=advanced.reasonCode??'UNKNOWN';break;}
    const actorId=advanced.decisionActorId,seat=seats.indexOf(actorId),engineActions=advanced.legalActionFrame.actions,policyActions=engineActions.map(a=>actionView(a,profileId)),vault=new Map(engineActions.map(action=>[action.actionId,action.command]));
    // Legal opportunity counting at the legality boundary
    {const frameTags=new Set(),framePrimaryTags=new Set();for(const la of engineActions){for(const tag of mechanicTags(la))frameTags.add(tag);const pt=primaryMechanicTag(la);if(pt)framePrimaryTags.add(pt);}for(const tag of frameTags){increment(perSeat[seat].mechanicOpportunityCounts,tag);increment(mechanicOpportunityCounts,tag);}for(const tag of framePrimaryTags){increment(perSeat[seat].primaryMechanicOpportunityCounts,tag);increment(primaryMechanicOpportunityCounts,tag);}}
    // BL-05 fix: pass complete deterministic context including matchId, runInstanceId, decisionIndex
    const authorizedView=strictView(state,actorId),selected=choosePolicy(policyIds[seat],{actorId,authorizedView,legalActions:policyActions,rng:rngByPlayer[actorId],matchId,runInstanceId:executionInstanceToken,decisionIndex,profileId,engineVersion:ENGINE_VERSION,rulesVersion:_RULES_VERSION});
    if(!selected){terminationReason='POLICY_ERROR';errorCode='NO_LEGAL_ACTION';break;}
    const command=vault.get(selected.actionId);if(!command){terminationReason='POLICY_ERROR';errorCode='ACTION_ID_INVALID';break;}
    const targetStackItem=state.stack?.at(-1)??null,targetControllerId=targetStackItem?.controllerId??null,targetStackClass=targetStackItem?.coreAuthority?.stackClass??null,targetSourceCount=targetStackItem?.sourceCardIds?.length??0,targetUntappedQueenDefenders=targetControllerId?countUntappedQueens(state,targetControllerId):0;
    const result=engine.execute(state,command);if(replayCommands)replayCommands.push(command);commands+=1;capture(result.events);if(!result.accepted){terminationReason='ENGINE_REJECTION';errorCode=result.error?.code??'UNKNOWN';break;}
    // Capture rank attribution for this decision (use pre-execution state for card access)
    const rankAttribution=attributeAction(state,selected,'private');
    const rankOppMap={};
    for(const pa of policyActions){if(isNoAttributionAction(pa))continue;const paAttrib=attributeAction(state,pa,'private');if(paAttrib.primaryRank){if(!rankOppMap[paAttrib.primaryRank])rankOppMap[paAttrib.primaryRank]={rank:paAttrib.primaryRank,opportunityFrames:1,legalOptions:1};else rankOppMap[paAttrib.primaryRank].legalOptions+=1;}}
    const rankOpportunities=Object.values(rankOppMap);
    rankDecisions.push({participantId:actorId,decisionIndex,rankAttribution,rankOpportunities,action:{family:selected.family,mode:selected.mode,kind:selected.kind,authority:selected.authority,timingClass:selected.timingClass},legalActions:policyActions.map(pa=>({actionId:pa.actionId,family:pa.family,mode:pa.mode,kind:pa.kind}))});
    state=result.state;decisions+=1;semantic.policyDecisionCount+=1;perSeat[seat].policyDecisionCount+=1;if(isMeaningfulResponseFrame(policyActions)){semantic.responseOpportunityCount+=1;perSeat[seat].responseOpportunityCount+=1;}const semanticClass=semanticClassForAction(selected);if(semanticClass==='response-decline'){semantic.responseDeclinedWithOptionsCount+=1;semantic.meaningfulResponseDecisionCount+=1;perSeat[seat].responseDeclinedWithOptionsCount+=1;perSeat[seat].meaningfulResponseDecisionCount+=1;}else{semantic.policyActionCount+=1;perSeat[seat].policyActionCount+=1;if(semanticClass==='free-response-play'){semantic.responsePlayedCount+=1;semantic.meaningfulResponseDecisionCount+=1;perSeat[seat].responsePlayedCount+=1;perSeat[seat].meaningfulResponseDecisionCount+=1;}if(isMiniTurnAction(selected)){semantic.miniTurnActionCount+=1;semantic.actionCount+=1;semantic.miniTurnCount+=1;perSeat[seat].miniTurnActionCount+=1;perSeat[seat].actionCount+=1;perSeat[seat].miniTurnCount+=1;if(selected.family==='exhausted-pass'){semantic.exhaustedPassActionCount+=1;semantic.passActionCount+=1;perSeat[seat].exhaustedPassActionCount+=1;perSeat[seat].passActionCount+=1;}}}if(selected.family==='counter'){semantic.counterDeclarationCount+=1;perSeat[seat].counterDeclarationCount+=1;}if(selected.timingClass==='QUICK'){semantic.quickDeclarationCount+=1;perSeat[seat].quickDeclarationCount+=1;}if(selected.timingClass==='INSTANT'){semantic.instantDeclarationCount+=1;perSeat[seat].instantDeclarationCount+=1;}if(selected.timingClass==='INTERRUPT'){semantic.interruptDeclarationCount+=1;perSeat[seat].interruptDeclarationCount+=1;}if(selected.family==='response-decline'||(!['private-choice','phase'].includes(selected.family)&&(RESPONSE_FAMILIES.has(selected.family)||['INSTANT','QUICK','INTERRUPT'].includes(selected.timingClass))))responseDecisions+=1;increment(decisionFamilyCounts,selected.family);increment(perSeat[seat].decisionFamilyCounts,selected.family);increment(decisionModeCounts,`${selected.family}:${selected.mode}`);if(isMiniTurnAction(selected)){increment(actionCounts,selected.family);increment(actionModeCounts,`${selected.family}:${selected.mode}`);}if(RESPONSE_DECLINE_FAMILIES.has(selected.family))increment(responseActionCounts,`${selected.family}:${selected.mode}`);increment(timingClassCounts,selected.timingClass);const tags=mechanicTags(selected),primaryTag=primaryMechanicTag(selected);for(const tag of tags){increment(mechanicCounts,tag);increment(perSeat[seat].mechanicCounts,tag);}if(primaryTag){increment(primaryMechanicCounts,primaryTag);increment(perSeat[seat].primaryMechanicCounts,primaryTag);}auditDecisions.push({actorId,activePlayerId:authorizedView.activePlayerId,family:selected.family,mode:selected.mode,timingClass:selected.timingClass,consumedMiniTurn:isMiniTurnAction(selected),hadLawfulResponse:isMeaningfulResponseFrame(policyActions),targetStackClass,targetSourceCount,targetUntappedQueenDefenders});
  }
  const finalScores=Object.fromEntries(seats.map(id=>[id,deriveSecuredPoints(state,id)]));
  const participants=seats.map((playerId,seatIndex)=>{
    const ps=perSeat[seatIndex];
    const isWinner=state.winner===playerId;
    const isDraw=terminationReason==='CANONICAL_DRAW';
    const isAborted=!COMPLETE_REASONS.has(terminationReason);
    return{participantId:`${matchId}:seat-${seatIndex+1}`,matchId,seat:seatIndex+1,playerId,policyId:policyIds[seatIndex],profileId,result:isAborted?'abort':isDraw?'draw':isWinner?'win':'loss',scoreFor:finalScores[playerId],scoreAgainst:finalScores[seats[1-seatIndex]],decisionCount:ps.policyDecisionCount,responseOpportunityCount:ps.responseOpportunityCount,responsePlayCount:ps.responsePlayedCount,responseDeclineCount:ps.responseDeclinedWithOptionsCount,miniTurnActionCount:ps.miniTurnActionCount,exhaustedPassActionCount:ps.exhaustedPassActionCount,counterDeclarationCount:ps.counterDeclarationCount,quickDeclarationCount:ps.quickDeclarationCount,instantDeclarationCount:ps.instantDeclarationCount,interruptDeclarationCount:ps.interruptDeclarationCount,meaningfulResponseDecisionCount:ps.meaningfulResponseDecisionCount,advancedDecisionCount:countFamilies(ps.decisionFamilyCounts,ADVANCED_FAMILIES),voltageDecisionCount:ps.decisionFamilyCounts.voltage??0,ultraDecisionCount:ps.decisionFamilyCounts.ultra??0,privateChoiceDecisionCount:ps.decisionFamilyCounts['private-choice']??0,mechanicCounts:Object.fromEntries(Object.entries(ps.mechanicCounts).sort()),primaryMechanicCounts:Object.fromEntries(Object.entries(ps.primaryMechanicCounts).sort()),mechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.mechanicOpportunityCounts??{}).sort()),primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.primaryMechanicOpportunityCounts??{}).sort())};
  });
  const ruleCompliance=buildRuleCompliance({decisions:auditDecisions,events:capturedEvents,state});
  const core={schemaVersion:'4.0.0',analyticsSchemaVersion:'4.0.0',matchId,matchOrdinal:ordinal,seed:setup.seed,engineVersion:ENGINE_VERSION,profileId,seatOrder:seats,policyIds,pairedRunId,seatSwapped,winner:state.winner??(terminationReason==='CANONICAL_DRAW'?'DRAW':'ABORTED'),winningSeat:state.winner?seats.indexOf(state.winner)+1:null,terminationReason,completedFullTurns:Math.max(0,state.fullTurnSequence-1),...semantic,responseDecisionCount:semantic.meaningfulResponseDecisionCount,privateChoiceDecisionCount:decisionFamilyCounts['private-choice']??0,advancedDecisionCount:countFamilies(decisionFamilyCounts,ADVANCED_FAMILIES),voltageDecisionCount:decisionFamilyCounts.voltage??0,ultraDecisionCount:decisionFamilyCounts.ultra??0,triggerCount:Object.entries(eventTypeCounts).filter(([type])=>type.includes('TRIGGER')||type.includes('VOLTAGE')).reduce((sum,[,count])=>sum+count,0),commandCount:commands,eventCount:events,finalScores,scoreMargin:Math.abs(finalScores.P1-finalScores.P2),finalStateHash:hashCanonical(state),participants,perSeatStats:perSeat.map((ps,i)=>({seat:i+1,...ps,mechanicCounts:Object.fromEntries(Object.entries(ps.mechanicCounts).sort()),primaryMechanicCounts:Object.fromEntries(Object.entries(ps.primaryMechanicCounts).sort()),mechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.mechanicOpportunityCounts??{}).sort()),primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.primaryMechanicOpportunityCounts??{}).sort()),decisionFamilyCounts:Object.fromEntries(Object.entries(ps.decisionFamilyCounts).sort())})),actionCounts:Object.fromEntries(Object.entries(actionCounts).sort()),decisionFamilyCounts:Object.fromEntries(Object.entries(decisionFamilyCounts).sort()),actionModeCounts:Object.fromEntries(Object.entries(actionModeCounts).sort()),decisionModeCounts:Object.fromEntries(Object.entries(decisionModeCounts).sort()),responseActionCounts:Object.fromEntries(Object.entries(responseActionCounts).sort()),timingClassCounts:Object.fromEntries(Object.entries(timingClassCounts).sort()),eventTypeCounts:Object.fromEntries(Object.entries(eventTypeCounts).sort()),mechanicCounts:Object.fromEntries(Object.entries(mechanicCounts).sort()),primaryMechanicCounts:Object.fromEntries(Object.entries(primaryMechanicCounts).sort()),mechanicOpportunityCounts:Object.fromEntries(Object.entries(mechanicOpportunityCounts??{}).sort()),primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(primaryMechanicOpportunityCounts??{}).sort()),ruleCompliance,errorCode};
  const{mechanicOpportunityCounts:_bMechOpp,primaryMechanicOpportunityCounts:_bPrimaryMechOpp,...hashCore}=core;
  const browserHashInput={...hashCore,participants:hashCore.participants.map(p=>{const{mechanicOpportunityCounts:_m,primaryMechanicOpportunityCounts:_pm,...rest}=p;return rest;})};
  const _matchResult={...core,matchResultHash:hashCanonical(browserHashInput),rankDecisions};
  if(recordReplay)_matchResult.replay={initialState:replayInitialState,commands:replayCommands};
  return _matchResult;
}

const MAX_BROWSER_MATCH_COUNT=10000;
export function validateMatchCount(requested){
  const n=Number(requested);
  if(!Number.isInteger(n)||n<1)throw new Error(`INVALID_MATCH_COUNT: "${requested}" is not a positive integer. Permitted range: 1–${MAX_BROWSER_MATCH_COUNT}.`);
  if(n>MAX_BROWSER_MATCH_COUNT)throw new Error(`MATCH_COUNT_EXCEEDS_MAXIMUM: requested ${n}, maximum ${MAX_BROWSER_MATCH_COUNT}. Reduce the match count or use the batch CLI for larger campaigns.`);
  return n;
}
// Builds the campaign-level result core from a fully-collected, ordinal-ordered
// summaries array. Exported so the main thread can assemble the campaign result
// from per-worker segment summaries (multi-worker parallel campaigns) without
// re-running the engine.
export function buildCampaignCore(summaries,{profileId=DEFAULT_PROFILE_ID,policyIds=['random-legal','random-legal'],matchCount=summaries.length,engineVersion=ENGINE_VERSION}={}){
  const count=Number(matchCount)||summaries.length;
  const completed=summaries.filter(item=>COMPLETE_REASONS.has(item.terminationReason));
  const seat1Wins=completed.filter(item=>item.winningSeat===1).length;
  const drawCount=completed.filter(item=>item.terminationReason==='CANONICAL_DRAW').length;
  const totals=(key)=>summaries.reduce((sum,item)=>sum+Number(item[key]??0),0);
  const core={schemaVersion:'4.0.0',engineVersion,profileId,policyIds,requestedMatchCount:count,effectiveMatchCount:count,matchCount:count,completedMatchCount:completed.length,abortCount:summaries.length-completed.length,drawCount,seat1Wins,seat2Wins:completed.length-seat1Wins-drawCount,meanFullTurns:completed.length?totals('completedFullTurns')/completed.length:null,responseDecisionCount:totals('responseDecisionCount'),privateChoiceDecisionCount:totals('privateChoiceDecisionCount'),advancedDecisionCount:totals('advancedDecisionCount'),voltageDecisionCount:totals('voltageDecisionCount'),ultraDecisionCount:totals('ultraDecisionCount'),triggerCount:totals('triggerCount'),canonicalResultHash:hashCanonical(summaries.map(item=>item.matchResultHash))};
  return{...core,status:core.abortCount===0?'PASS':'FAIL',aggregateHash:hashCanonical(core),summaries};
}

export function runBrowserCampaign({matchCount=100,policyIds=['random-legal','random-legal'],seedCatalogId='browser-v5',profileId=DEFAULT_PROFILE_ID,seedStrategy='ordinal-hash',fixedSeed=12345,ordinalStart=0,ordinalEnd=null},onProgress=()=>{}){
  const requestedMatchCount=validateMatchCount(matchCount);
  const count=requestedMatchCount;
  const start=Math.max(0,Math.min(count,Number(ordinalStart)||0));
  const end=Math.min(count,ordinalEnd!==null?(Number(ordinalEnd)||count):count);
  const segmentSize=Math.max(0,end-start),summaries=[];
  // AB/BA seat-swap design: even ordinals use ['P1','P2'], odd ordinals use ['P2','P1'].
  // This mirrors the Node campaign's seat-swap logic and enables paired AB/BA analysis.
  // The pairedRunId links AB and BA runs: ordinals 2k and 2k+1 form a matched pair.
  // Progress reporting: report frequently so the UI never looks frozen.
  // - At least every `reportInterval` matches (caps total messages to ~200)
  // - At least every 500ms (wall-clock) so slow matches still show life
  // - Always on the final match
  const reportInterval=Math.max(1,Math.min(100,Math.floor(segmentSize/200)));
  const reportPeriodMs=500;
  let lastReportTime=typeof performance!=='undefined'?performance.now():Date.now();
  const maybeReport=(force)=>{const now=typeof performance!=='undefined'?performance.now():Date.now();if(force||now-lastReportTime>=reportPeriodMs){lastReportTime=now;return true;}return false;};
  for(let ordinal=start;ordinal<end;ordinal+=1){
    const seatSwapped=ordinal%2===1;
    const seatOrder=seatSwapped?['P2','P1']:['P1','P2'];
    const seed=seedStrategy==='fixed'?(Number(fixedSeed)>>>0)||1:uint32FromHash({seedCatalogId,ordinal,policyIds,profileId,engineVersion:ENGINE_VERSION});
    const pairedRunId=`PR-browser-${policyIds[0]}-${policyIds[1]}-block-${Math.floor(ordinal/2)}`;
    summaries.push(runBrowserPolicyMatch({seed,policyIds,ordinal,profileId,seatOrder,seatSwapped,pairedRunId}));
    const done=ordinal-start+1;
    if(done%reportInterval===0||ordinal===end-1||maybeReport(false))onProgress({completed:done,total:segmentSize});
  }
  // Always emit a final progress tick (covers segmentSize===0 and last-match races)
  onProgress({completed:segmentSize,total:segmentSize});
  return buildCampaignCore(summaries,{profileId,policyIds,matchCount:count,engineVersion:ENGINE_VERSION});
}
