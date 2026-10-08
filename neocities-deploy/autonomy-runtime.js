import { chooseWeightedAction, WEIGHTED_POLICY_ID, validatePolicyState } from './evolution/weighted-heuristic.mjs?v=a90b812f827b';
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
} from './engine/browser-entry.js?v=a90b812f827b';
import { actionComposition } from "./engine-adapter/action-composition.mjs";
import { actionSemantics } from './engine-adapter/action-semantics.mjs';
import { rankPolicyActions, recordActionCoverage, decomposePolicyScore } from './policy-scoring.js?v=a90b812f827b';
import { createStrategicTracker, decisionObservation, terminalEvidence, publicTerminalAnchorCounts } from './evolution/strategic-telemetry.mjs?v=a90b812f827b';
import { resolveAdaptiveControllers, buildAdaptiveTelemetry, compactAdaptiveFrame, effectiveAdaptiveMode } from './evolution/adaptive-strategy.mjs?v=a90b812f827b';
import { createComboTracker, comboClassOf } from './evolution/combo-telemetry.mjs?v=a90b812f827b';
import { createStrategyCapture } from './evolution/strategy-contracts.mjs?v=a90b812f827b';
import { HYBRIX_POLICY_IDS, chooseHybrixPolicy } from './hybrix/policy-adapter.js?v=a90b812f827b';
import { attributeAction, isNoAttributionAction, classifyVariantEntity } from './browser-analytics.js?v=a90b812f827b';
import { LAB_VERSION as _LAB_VERSION, ENGINE_VERSION as _ENGINE_VERSION, RULES_VERSION as _RULES_VERSION } from './version.js?v=a90b812f827b';

export { createAdaptiveController, resolveAdaptiveControllers, STRATEGIC_STATE_LABELS, ADAPTIVE_MODE_LABELS } from './evolution/adaptive-strategy.mjs?v=a90b812f827b';

const BASELINE_POLICY_IDS = ['random-legal','score-rush','control','tempo','value','score-rush-tactical','control-tactical','tempo-tactical','value-tactical','control-conversion-tactical'];
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

// predeterminedIdentities: scenario support shared by both engine paths.
// The core profile consumes the list natively; the First Contact path deals
// a fixed positional layout (C-001..C-005 P1 hand, C-006..C-011 P2 hand,
// C-012..C-054 DP top→bottom), so the runtime relabels each position's
// identity. Both paths keep all 54 physical card instances — only the
// dealt identity per position changes, which is what scenario fixtures mean
// by "arrangement".
const FC_CARD_ID=(position)=>`C-${String(position+1).padStart(3,'0')}`;
export const FC_DECK_SIZE=54;
export function applyPredeterminedIdentities(state,identities){
  if(!Array.isArray(identities)||identities.length!==FC_DECK_SIZE)throw new Error('PREDETERMINED_IDENTITIES_LENGTH');
  if(new Set(identities).size!==FC_DECK_SIZE)throw new Error('PREDETERMINED_IDENTITIES_DUPLICATE');
  for(let i=0;i<FC_DECK_SIZE;i+=1){
    const card=state.cards[FC_CARD_ID(i)];
    if(!card)throw new Error('PREDETERMINED_IDENTITIES_LAYOUT');
    card.identity=identities[i];
  }
  return state;
}
export function createState(setup){
  if(isCore(setup.profileId))return createCoreMatchState({profileId:setup.profileId,playerIds:setup.playerIds,seatOrder:setup.seatOrder,enabledModules:[],seed:setup.seed,...(setup.predeterminedIdentities?{predeterminedIdentities:setup.predeterminedIdentities}:{}),...(setup.ruleOverrides?{ruleOverrides:setup.ruleOverrides}:{})});
  const state=createMatchState({...setup,eventApprovedModules:[]});
  if(setup.predeterminedIdentities)applyPredeterminedIdentities(state,setup.predeterminedIdentities);
  return state;
}
export function advance(state,maxCommands=16){return state.metadata?.coreAuthority?advanceCoreToDecision(state,maxCommands):advanceToDecision(state);}
export function actionView(action,profileId){const view=isCore(profileId)?toAuthorizedCoreAction(action):authorizedLegalActionView(action);const composition=actionComposition(action);const semantics=actionSemantics(action);return{...view,...(composition?{composition}:{}),...(semantics?{semantics}:{})};}

export function strictView(state,actorId){
  const actor=state.players[actorId],knownCards={};
  const card=(id)=>{const c=state.cards[id];if(!c)return null;const view={id,identity:c.identity,controllerId:c.controllerId,zone:c.zone,pointValue:pointValue(c),tapped:c.state?.tapped===true,aegis:c.state?.aegis!==undefined||c.state?.aegisExpiresAt!==undefined,swapBarFaceDown:c.state?.swapBarFaceDown===true,swapBarFaceUp:c.state?.swapBarFaceUp===true,providesGuard:c.state?.providesGuard===true,exileBound:c.state?.exileBound===true};knownCards[id]=view;return view;};
  const runtime=state.metadata?.coreAuthority??state.metadata?.autonomy??{};const choice=runtime.privateChoice;
  const result={schemaVersion:'4.0.0',engineVersion:ENGINE_VERSION,profileId:runtime.profileId??null,actorId,activePlayerId:state.activePlayerId,phase:state.phase,revision:state.revision,fullTurnSequence:state.fullTurnSequence,dpCount:state.zones.dp.length,gyCount:state.zones.gy.length,gyTopCard:state.zones.gy.length>0?card(state.zones.gy[state.zones.gy.length-1]):null,exileCount:state.zones.exile.length,swapBar:state.zones.swapBar.map(id=>state.cards[id]?.state?.swapBarFaceUp?card(id):{id,identity:'HIDDEN',faceDown:true}),boardLock:structuredClone(state.metadata?.boardLock??null),suddenDeath:structuredClone(state.metadata?.suddenDeath??null),exhausted:structuredClone(runtime.exhausted??null),voltage:structuredClone(state.metadata?.phase8??null),priority:structuredClone(state.priority),stack:(state.stack??[]).map(item=>({id:item.id,controllerId:item.controllerId,originalControllerId:item.originalControllerId??null,kind:item.kind,status:item.status,sourceCardIds:[...(item.sourceCardIds??[])],targetCardIds:[...(item.targetCardIds??[])],actionType:item.coreAuthority?.actionType??item.firstContactAuthority?.actionType??null,stackClass:item.coreAuthority?.stackClass??item.firstContactAuthority?.stackClass??null,advancedKind:item.coreAuthority?.advanced?.kind??null})),triggerQueue:(state.triggerQueue??[]).map(trigger=>({id:trigger.id,type:trigger.type,controllerId:trigger.controllerId??null,status:trigger.status??null})),pendingChoice:choice?.chooserId===actorId?{choiceId:choice.choiceId,kind:choice.kind,stage:choice.stage,minSelections:choice.minSelections,maxSelections:choice.maxSelections,optionCards:(choice.optionCardIds??[]).map(card).filter(Boolean),sourceCard:choice.sourceCardId?card(choice.sourceCardId):null,context:structuredClone(choice.context??{})}:null,knownCards,own:{goal:actor.goal,securedPoints:deriveSecuredPoints(state,actorId),hand:actor.hand.map(card).filter(Boolean),pr:actor.pr.map(card).filter(Boolean),er:actor.er.map(card).filter(Boolean),limits:structuredClone(actor.limits??{})},opponents:state.turnOrder.filter(id=>id!==actorId).map(id=>({playerId:id,goal:state.players[id].goal,securedPoints:deriveSecuredPoints(state,id),handCount:state.players[id].hand.length,pr:state.players[id].pr.map(card).filter(Boolean),er:state.players[id].er.map(card).filter(Boolean)}))};
  result.legacyKnownCards={...knownCards};
  result.graveyard=state.zones.gy.map(card).filter(Boolean);result.exile=state.zones.exile.map(card).filter(Boolean);
  for(const item of result.stack)for(const id of item.sourceCardIds)card(id);
  return result;
}
export function choosePolicy(policyId,context){
  if(policyId===WEIGHTED_POLICY_ID){const frame=context.adaptiveController?context.adaptiveController.decide(context):null;context.adaptiveFrame=frame;return chooseWeightedAction(frame?.policyState??context.policyState,context);}
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
const _MINI_TURN_FAMILIES=new Set(['draw','score','play-for-points','scuttle','swap-bar','effect-three','effect-four','effect-five','effect-six','effect-seven','effect-nine','effect-red-joker','effect-board-lock','effect-row-clear','effect-tap','effect-goal-shift','effect-jack-control','effect-private-choice','anchor','anchor-guard','anchor-private-choice','attachment','royal-marriage','super','rank10','ultra','exhausted-pass']);
const RESPONSE_DECLINE_FAMILIES=new Set(['counter','disrupt','interrupt','instant','quick','response-decline']);
const semanticClassForAction=(action)=>{if(!action)return'invariant';if(action.family==='response-decline')return'response-decline';if(action.family==='private-choice')return'private-choice';if(action.family==='phase')return'phase-transition';if(RESPONSE_FAMILIES.has(action.family)||['INSTANT','QUICK','INTERRUPT'].includes(action.timingClass))return'free-response-play';return'mini-turn-action';};
const isMiniTurnAction=(action)=>semanticClassForAction(action)==='mini-turn-action'&&action.family!=='phase';
const isMeaningfulResponseFrame=(actions=[])=>{const hasDecline=actions.some(a=>a.family==='response-decline');const real=actions.filter(a=>a.family!=='response-decline');return hasDecline&&real.length>0;};
const NON_MECHANIC_FAMILIES=new Set(['phase','response-decline','private-choice']);
const NON_MECHANIC_MODES=new Set(['enter-action','decline','points','ordinary','top','forced-mini-turn','♣','♦','♥','♠']);
const TIMING_FAMILIES=new Set(['instant','quick','interrupt']);
const mechanicTags=(action)=>{const tags=new Set();if(!NON_MECHANIC_FAMILIES.has(action.family)&&!TIMING_FAMILIES.has(action.family))tags.add(action.family);if(action.mode&&!NON_MECHANIC_MODES.has(action.mode)&&action.mode!==action.family)tags.add(action.mode);if(comboClassOf(action))tags.add('combo');return[...tags].sort();};
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

export function runBrowserPolicyMatch({seed,policyIds=['random-legal','random-legal'],decisionLimit=1800,ordinal=0,profileId=DEFAULT_PROFILE_ID,initialState=null,seatOrder=null,seatSwapped=false,pairedRunId=null,pairedLeg=null,recordReplay=false,orchestrationCommandLimit=16,policyStates=[],adaptiveConfigs=[],strategicTelemetryEnabled=false,strategicTrace=false,strategyIdentities=null,ruleOverrides=null}){
  if(policyIds.length!==2||policyIds.some((id,i)=>!POLICY_IDS.includes(id) && !(id===WEIGHTED_POLICY_ID && validatePolicyState(policyStates[i]))))throw new Error('INVALID_POLICY_PAIR');
  const seats=seatOrder??['P1','P2'];const setup={profileId,playerIds:seats,enabledModules:[],eventApprovedModules:[],seed:(seed>>>0)||1,seatOrder:seats,...(ruleOverrides?{ruleOverrides}:{})};
  let state=initialState?structuredClone(initialState):createState(setup);const engine=new IntrilexEngine();
  const replayCommands=recordReplay?[]:null;const replayInitialState=recordReplay?structuredClone(state):null;
  const rngByPlayer=Object.fromEntries(seats.map((playerId,index)=>[playerId,new PolicyRng(uint32FromHash({seed:setup.seed,playerId,policyId:policyIds[index],stream:'POLICY_V4'}))]));
  // Adaptive Strategy layer: per-seat deterministic controllers over the
  // baseline genome. Absent/OFF config builds no controller; LEARNED executes
  // as OFF and is reported unavailable.
  const {configs:adaptiveCfgs,controllers:adaptiveControllers}=resolveAdaptiveControllers({adaptiveConfigs,policyIds,policyStates,seatCount:seats.length});
  const actionCounts={},actionModeCounts={},decisionFamilyCounts={},decisionModeCounts={},responseActionCounts={},timingClassCounts={},eventTypeCounts={},mechanicCounts={},primaryMechanicCounts={},mechanicOpportunityCounts={},primaryMechanicOpportunityCounts={};const semantic={miniTurnActionCount:0,exhaustedPassActionCount:0,responseOpportunityCount:0,responsePlayedCount:0,responseDeclinedWithOptionsCount:0,automaticPriorityAdvanceCount:0,responseWindowClosedCount:0,counterDeclarationCount:0,quickDeclarationCount:0,instantDeclarationCount:0,interruptDeclarationCount:0,policyDecisionCount:0,policyActionCount:0,actionCount:0,passActionCount:0,miniTurnCount:0,meaningfulResponseDecisionCount:0,automaticOrchestrationCommandCount:0};
  const perSeat=[{miniTurnActionCount:0,exhaustedPassActionCount:0,responsePlayedCount:0,responseDeclinedWithOptionsCount:0,counterDeclarationCount:0,quickDeclarationCount:0,instantDeclarationCount:0,interruptDeclarationCount:0,policyDecisionCount:0,policyActionCount:0,actionCount:0,passActionCount:0,miniTurnCount:0,meaningfulResponseDecisionCount:0,responseOpportunityCount:0,advancedDecisionCount:0,voltageDecisionCount:0,ultraDecisionCount:0,privateChoiceDecisionCount:0,mechanicCounts:{},primaryMechanicCounts:{},mechanicOpportunityCounts:{},primaryMechanicOpportunityCounts:{},decisionFamilyCounts:{}},{miniTurnActionCount:0,exhaustedPassActionCount:0,responsePlayedCount:0,responseDeclinedWithOptionsCount:0,counterDeclarationCount:0,quickDeclarationCount:0,instantDeclarationCount:0,interruptDeclarationCount:0,policyDecisionCount:0,policyActionCount:0,actionCount:0,passActionCount:0,miniTurnCount:0,meaningfulResponseDecisionCount:0,responseOpportunityCount:0,advancedDecisionCount:0,voltageDecisionCount:0,ultraDecisionCount:0,privateChoiceDecisionCount:0,mechanicCounts:{},primaryMechanicCounts:{},mechanicOpportunityCounts:{},primaryMechanicOpportunityCounts:{},decisionFamilyCounts:{}}];
  const auditDecisions=[],capturedEvents=[],rankDecisions=[],matchDecisions=[];
  const strategy=strategicTelemetryEnabled?createStrategicTracker({deep:strategicTrace}):null;
  const fieldManual=strategyIdentities?createStrategyCapture(strategyIdentities):null;
  let decisions=0,_responseDecisions=0,commands=0,events=0,terminationReason='DECISION_LIMIT',errorCode=null;
  // BL-05 fix: compute matchId before the loop so it's available in policy context
  // R01: when a compiled executable subject (policyStates/adaptiveConfigs) is
  // supplied, the deterministic sample identity binds the executable hash —
  // two distinct genomes can never collapse into one sample identity. The
  // legacy label-only M- digest is preserved for corpora without subject state.
  const executableParts=(()=>{const normalizedAdaptive=(adaptiveConfigs??[]).map(c=>effectiveAdaptiveMode(c)==='OFF'?null:c);const hasCompiled=(policyStates??[]).some(s=>s!=null)||normalizedAdaptive.some(c=>c!=null);if(!hasCompiled)return null;return{schema:'executable-identity/1.0.0',profileId,engineVersion:ENGINE_VERSION,rulesVersion:_RULES_VERSION,policyIds,policyStates,adaptiveConfigs:normalizedAdaptive.some(c=>c!=null)?normalizedAdaptive:null,decisionLimit,orchestrationCommandLimit,ruleOverrides:ruleOverrides??null};})();
  const matchId=!executableParts?`M-${hashCanonical({profileId,seed:setup.seed,seatOrder:seats,policyIds,...(ruleOverrides?{ruleOverrides}:{})}).slice(0,20)}`
    :`M2-${hashCanonical({profileId,seed:setup.seed,seatOrder:seats,policyIds,...(ruleOverrides?{ruleOverrides}:{}),executableHash:hashCanonical(executableParts),initialStateHash:initialState?hashCanonical(initialState):null}).slice(0,24)}`;
  // BL-05 fix: mint a fresh opaque executionInstanceToken per top-level run.
  // This is process-local cache/lifecycle ownership only — never serialized or hashed.
  const executionInstanceToken=`${matchId}:${Date.now()}:${Math.random().toString(36).slice(2,10)}`;
  // Canonical Combo telemetry (rulebook §8) — same tracker as the canonical
  // runtime (mirrored module); opportunities per recipe, declarations, and
  // authority-event lifecycle.
  const comboTracker=createComboTracker({matchId,seatOrder:seats,policyIds,scoreOf:deriveSecuredPoints});
  const capture=(items)=>{events+=items.length;capturedEvents.push(...items);for(const event of items){increment(eventTypeCounts,event.type);const type=String(event.type??'');if(/AUTOMATIC_PRIORITY_ADVANCE/.test(type)){semantic.automaticPriorityAdvanceCount+=1;semantic.automaticOrchestrationCommandCount+=1;}if(/RESPONSE_WINDOW_CLOSED/.test(type))semantic.responseWindowClosedCount+=1;}};
  for(let decisionIndex=0;decisionIndex<decisionLimit;decisionIndex+=1){
    const advanced=advance(state,orchestrationCommandLimit);state=advanced.state;commands+=advanced.executedCommands.length;capture(advanced.events);comboTracker.observe(advanced.events,state);
    strategy?.observe(seats.map(id=>deriveSecuredPoints(state,id)),decisionIndex);
    if(replayCommands)replayCommands.push(...advanced.executedCommands);
    if(advanced.status==='TERMINAL'){terminationReason=advanced.reasonCode==='CANONICAL_DRAW'?'CANONICAL_DRAW':advanced.reasonCode==='EXHAUSTED_RESOLUTION'?'EXHAUSTED_RESOLUTION':'NORMAL_VICTORY';break;}
    if(advanced.status!=='PLAYER_DECISION_REQUIRED'||!advanced.legalActionFrame){terminationReason='UNSUPPORTED_CONFIGURATION';errorCode=advanced.reasonCode??'UNKNOWN';break;}
    const actorId=advanced.decisionActorId,seat=seats.indexOf(actorId),engineActions=advanced.legalActionFrame.actions,policyActions=engineActions.map(a=>actionView(a,profileId)),vault=new Map(engineActions.map(action=>[action.actionId,action.command]));
    // Legal opportunity counting at the legality boundary
    {const frameTags=new Set(),framePrimaryTags=new Set();for(const la of engineActions){for(const tag of mechanicTags(la))frameTags.add(tag);const pt=primaryMechanicTag(la);if(pt)framePrimaryTags.add(pt);}for(const tag of frameTags){increment(perSeat[seat].mechanicOpportunityCounts,tag);increment(mechanicOpportunityCounts,tag);}for(const tag of framePrimaryTags){increment(perSeat[seat].primaryMechanicOpportunityCounts,tag);increment(primaryMechanicOpportunityCounts,tag);}}
    comboTracker.frame({legalActions:engineActions,actorId,state});
    // BL-05 fix: pass complete deterministic context including matchId, runInstanceId, decisionIndex
    const authorizedView=strictView(state,actorId),selected=choosePolicy(policyIds[seat],{policyState:policyStates[seat],adaptiveController:adaptiveControllers[seat],actorId,authorizedView,legalActions:policyActions,rng:rngByPlayer[actorId],matchId,runInstanceId:executionInstanceToken,decisionIndex,profileId,engineVersion:ENGINE_VERSION,rulesVersion:_RULES_VERSION});
    const adaptiveFrame=adaptiveControllers[seat]?.lastFrame??null;
    if(!selected){terminationReason='POLICY_ERROR';errorCode='NO_LEGAL_ACTION';break;}
    const observation=strategy?decisionObservation({actorId,seat:seat+1,decisionIndex,authorizedView,legalActions:policyActions,selected,...(strategicTrace?{policyScores:policyIds[seat]==='random-legal'||policyIds[seat].startsWith('hybrix-')||policyIds[seat]===WEIGHTED_POLICY_ID?undefined:rankPolicyActions(policyIds[seat],policyActions,{actorId,authorizedView,legalActions:policyActions}).slice(0,8).map(r=>({actionId:r.action.actionId,score:r.score}))}: {})}):null;
    const command=vault.get(selected.actionId);if(!command){terminationReason='POLICY_ERROR';errorCode='ACTION_ID_INVALID';break;}
    const targetStackItem=state.stack?.at(-1)??null,targetControllerId=targetStackItem?.controllerId??null,targetStackClass=targetStackItem?.coreAuthority?.stackClass??null,targetSourceCount=targetStackItem?.sourceCardIds?.length??0,targetUntappedQueenDefenders=targetControllerId?countUntappedQueens(state,targetControllerId):0;
    const strategyDraft=fieldManual?.before({actorId,seat:seat+1,decisionOrdinal:decisionIndex,authorizedView,legalActions:policyActions,selectedActionId:selected.actionId,policyScores:(observation?.policyScores??[]).map(s=>({...s,decomposition:decomposePolicyScore(policyIds[seat],policyActions.find(a=>a.actionId===s.actionId),{actorId,authorizedView})})),replayAnchor:{commandIndex:replayCommands?.length??commands,stateHash:hashCanonical(state)}});
    const beforeStateHash=hashCanonical(state);
    const comboPreScores=comboClassOf(selected)?Object.fromEntries(seats.map(id=>[id,deriveSecuredPoints(state,id)])):null;const comboPreTurn=state.fullTurnSequence,comboPrePhase=state.phase;
    const result=engine.execute(state,command);if(replayCommands)replayCommands.push(command);commands+=1;capture(result.events);if(!result.accepted){terminationReason='ENGINE_REJECTION';errorCode=result.error?.code??'UNKNOWN';break;}
    // Canonical Caster decision transcript — recorded at the legality
    // boundary where actor, policy, selected action, and the replay
    // command anchor are known exactly. The replay also contains engine
    // orchestration commands, so downstream consumers (Caster beats)
    // must anchor to this transcript rather than derive decisions from
    // frame indices. Mirrors the simulation-runtime decisions record.
    matchDecisions.push({
      schemaVersion:'1.0.0',matchId,decisionIndex:matchDecisions.length,
      commandIndex:replayCommands?replayCommands.length-1:null,
      checkpointId:`decision-${matchDecisions.length}`,
      actorId,seat:seat+1,policyId:policyIds[seat],policyVersion:null,
      activePlayerId:state.activePlayerId,
      turn:state.fullTurnSequence??null,phase:state.phase??null,
      actionId:selected.actionId??null,kind:selected.kind??null,
      family:selected.family??null,mode:selected.mode??null,timingClass:selected.timingClass??null,
      semanticClass:semanticClassForAction(selected),
      engineCommandId:command.id??null,engineCommandHash:hashCanonical(command),
      frameHash:advanced.legalActionFrame?.frameHash??null,
      beforeStateHash,afterStateHash:hashCanonical(result.state),
      legalActionCount:policyActions.length,
      reasonCode:selected._hybrixMetadata?.reasonCode??null,
      candidateScores:observation?.policyScores??null,
      ...(adaptiveFrame?{adaptive:compactAdaptiveFrame(adaptiveFrame,{deep:strategicTrace})}:{}),
      visibility:'authorized'
    });
    if(strategy)strategy.capture(observation,seats.map(id=>deriveSecuredPoints(result.state,id)));
    if(fieldManual)fieldManual.after(strategyDraft,strictView(result.state,actorId));
    // Capture rank attribution for this decision (use pre-execution state for card access)
    const rankAttribution=attributeAction(state,selected,'private');
    // Opportunity telemetry mirrors packages/simulation-runtime buildRankOpportunityMaps:
    // rank opportunities credit every source rank, and variant opportunities
    // (per-suit Tens, spade variants, supers) are recorded per legal action.
    // Without variantOpportunities, browser/Lab data recorded 10♠ (and every
    // spade/super variant) selections with zero opportunities. Telemetry only:
    // rankDecisions is excluded from matchResultHash.
    const rankOppMap={},variantOppMap={};
    const bumpOpp=(map,key,field)=>{if(!map[key])map[key]={[field]:key,opportunityFrames:1,legalOptions:1};else map[key].legalOptions+=1;};
    for(const pa of policyActions){if(isNoAttributionAction(pa))continue;const paAttrib=attributeAction(state,pa,'private');if(paAttrib.primaryRank){for(const rank of new Set(paAttrib.sourceRanks?.length?paAttrib.sourceRanks:[paAttrib.primaryRank]))bumpOpp(rankOppMap,rank,'rank');}const v=classifyVariantEntity(paAttrib,pa);if(v.variantKey){bumpOpp(variantOppMap,v.variantKey,'variantKey');for(const ck of v.creditKeys)if(ck!==v.variantKey)bumpOpp(variantOppMap,ck,'variantKey');}else if(paAttrib.primaryRank){bumpOpp(variantOppMap,paAttrib.primaryRank,'variantKey');bumpOpp(variantOppMap,`${paAttrib.primaryRank}:normal`,'variantKey');}}
    const rankOpportunities=Object.values(rankOppMap),variantOpportunities=Object.values(variantOppMap);
    rankDecisions.push({participantId:actorId,decisionIndex,rankAttribution,rankOpportunities,variantOpportunities,action:{family:selected.family,mode:selected.mode,kind:selected.kind,authority:selected.authority,timingClass:selected.timingClass},legalActions:policyActions.map(pa=>({actionId:pa.actionId,family:pa.family,mode:pa.mode,kind:pa.kind}))});
    state=result.state;comboTracker.observe(result.events,state);comboTracker.declared({action:selected,actorId,seat,decisionIndex,fullTurn:comboPreTurn,phase:comboPrePhase,commandIndex:commands-1,checkpointId:`decision-${matchDecisions.length-1}`,events:result.events,state,scoreBefore:comboPreScores?.[actorId]??null,scoreDiffBefore:comboPreScores?(comboPreScores[actorId]-comboPreScores[seats[1-seat]]):null});decisions+=1;semantic.policyDecisionCount+=1;perSeat[seat].policyDecisionCount+=1;recordActionCoverage(perSeat[seat],policyActions,selected);if(isMeaningfulResponseFrame(policyActions)){semantic.responseOpportunityCount+=1;perSeat[seat].responseOpportunityCount+=1;}const semanticClass=semanticClassForAction(selected);if(semanticClass==='response-decline'){semantic.responseDeclinedWithOptionsCount+=1;semantic.meaningfulResponseDecisionCount+=1;perSeat[seat].responseDeclinedWithOptionsCount+=1;perSeat[seat].meaningfulResponseDecisionCount+=1;}else{semantic.policyActionCount+=1;perSeat[seat].policyActionCount+=1;if(semanticClass==='free-response-play'){semantic.responsePlayedCount+=1;semantic.meaningfulResponseDecisionCount+=1;perSeat[seat].responsePlayedCount+=1;perSeat[seat].meaningfulResponseDecisionCount+=1;}if(isMiniTurnAction(selected)){semantic.miniTurnActionCount+=1;semantic.actionCount+=1;semantic.miniTurnCount+=1;perSeat[seat].miniTurnActionCount+=1;perSeat[seat].actionCount+=1;perSeat[seat].miniTurnCount+=1;if(selected.family==='exhausted-pass'){semantic.exhaustedPassActionCount+=1;semantic.passActionCount+=1;perSeat[seat].exhaustedPassActionCount+=1;perSeat[seat].passActionCount+=1;}}}if(selected.family==='counter'){semantic.counterDeclarationCount+=1;perSeat[seat].counterDeclarationCount+=1;}if(selected.timingClass==='QUICK'){semantic.quickDeclarationCount+=1;perSeat[seat].quickDeclarationCount+=1;}if(selected.timingClass==='INSTANT'){semantic.instantDeclarationCount+=1;perSeat[seat].instantDeclarationCount+=1;}if(selected.timingClass==='INTERRUPT'){semantic.interruptDeclarationCount+=1;perSeat[seat].interruptDeclarationCount+=1;}if(selected.family==='response-decline'||(!['private-choice','phase'].includes(selected.family)&&(RESPONSE_FAMILIES.has(selected.family)||['INSTANT','QUICK','INTERRUPT'].includes(selected.timingClass))))_responseDecisions+=1;increment(decisionFamilyCounts,selected.family);increment(perSeat[seat].decisionFamilyCounts,selected.family);increment(decisionModeCounts,`${selected.family}:${selected.mode}`);if(isMiniTurnAction(selected)){increment(actionCounts,selected.family);increment(actionModeCounts,`${selected.family}:${selected.mode}`);}if(RESPONSE_DECLINE_FAMILIES.has(selected.family))increment(responseActionCounts,`${selected.family}:${selected.mode}`);increment(timingClassCounts,selected.timingClass);const tags=mechanicTags(selected),primaryTag=primaryMechanicTag(selected);for(const tag of tags){increment(mechanicCounts,tag);increment(perSeat[seat].mechanicCounts,tag);}if(primaryTag){increment(primaryMechanicCounts,primaryTag);increment(perSeat[seat].primaryMechanicCounts,primaryTag);}auditDecisions.push({actorId,activePlayerId:authorizedView.activePlayerId,family:selected.family,mode:selected.mode,timingClass:selected.timingClass,consumedMiniTurn:isMiniTurnAction(selected),hadLawfulResponse:isMeaningfulResponseFrame(policyActions),targetStackClass,targetSourceCount,targetUntappedQueenDefenders});
  }
  const finalScores=Object.fromEntries(seats.map(id=>[id,deriveSecuredPoints(state,id)]));
  const comboTelemetry=comboTracker.finish({winner:state.winner??null,terminationReason});
  const participants=seats.map((playerId,seatIndex)=>{
    const ps=perSeat[seatIndex];
    const isWinner=state.winner===playerId;
    const isDraw=terminationReason==='CANONICAL_DRAW';
    const isAborted=!COMPLETE_REASONS.has(terminationReason);
    return{participantId:`${matchId}:seat-${seatIndex+1}`,matchId,seat:seatIndex+1,playerId,policyId:policyIds[seatIndex],profileId,result:isAborted?'abort':isDraw?'draw':isWinner?'win':'loss',scoreFor:finalScores[playerId],scoreAgainst:finalScores[seats[1-seatIndex]],decisionCount:ps.policyDecisionCount,responseOpportunityCount:ps.responseOpportunityCount,responsePlayCount:ps.responsePlayedCount,responseDeclineCount:ps.responseDeclinedWithOptionsCount,miniTurnActionCount:ps.miniTurnActionCount,exhaustedPassActionCount:ps.exhaustedPassActionCount,counterDeclarationCount:ps.counterDeclarationCount,quickDeclarationCount:ps.quickDeclarationCount,instantDeclarationCount:ps.instantDeclarationCount,interruptDeclarationCount:ps.interruptDeclarationCount,meaningfulResponseDecisionCount:ps.meaningfulResponseDecisionCount,advancedDecisionCount:countFamilies(ps.decisionFamilyCounts,ADVANCED_FAMILIES),voltageDecisionCount:ps.decisionFamilyCounts.voltage??0,ultraDecisionCount:ps.decisionFamilyCounts.ultra??0,privateChoiceDecisionCount:ps.decisionFamilyCounts['private-choice']??0,mechanicCounts:Object.fromEntries(Object.entries(ps.mechanicCounts).sort()),primaryMechanicCounts:Object.fromEntries(Object.entries(ps.primaryMechanicCounts).sort()),mechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.mechanicOpportunityCounts??{}).sort()),primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.primaryMechanicOpportunityCounts??{}).sort()),comboOpportunityCount:comboTelemetry.seats[seatIndex]?.opportunityFrames??0,comboDeclarationCount:comboTelemetry.seats[seatIndex]?.declarations??0};
  });
  const ruleCompliance=buildRuleCompliance({decisions:auditDecisions,events:capturedEvents,state});
  const core={schemaVersion:'4.0.0',analyticsSchemaVersion:'4.0.0',matchId,matchOrdinal:ordinal,seed:setup.seed,engineVersion:ENGINE_VERSION,profileId,seatOrder:seats,policyIds,pairedRunId,seatSwapped,...(pairedLeg?{pairedLeg}:{}),ruleOverrides:ruleOverrides??null,winner:state.winner??(terminationReason==='CANONICAL_DRAW'?'DRAW':'ABORTED'),winningSeat:state.winner?seats.indexOf(state.winner)+1:null,terminationReason,completedFullTurns:Math.max(0,state.fullTurnSequence-1),...semantic,responseDecisionCount:semantic.meaningfulResponseDecisionCount,privateChoiceDecisionCount:decisionFamilyCounts['private-choice']??0,advancedDecisionCount:countFamilies(decisionFamilyCounts,ADVANCED_FAMILIES),voltageDecisionCount:decisionFamilyCounts.voltage??0,ultraDecisionCount:decisionFamilyCounts.ultra??0,triggerCount:Object.entries(eventTypeCounts).filter(([type])=>type.includes('TRIGGER')||type.includes('VOLTAGE')).reduce((sum,[,count])=>sum+count,0),commandCount:commands,eventCount:events,finalScores,scoreMargin:Math.abs(finalScores.P1-finalScores.P2),finalStateHash:hashCanonical(state),participants,perSeatStats:perSeat.map((ps,i)=>({seat:i+1,...ps,mechanicCounts:Object.fromEntries(Object.entries(ps.mechanicCounts).sort()),primaryMechanicCounts:Object.fromEntries(Object.entries(ps.primaryMechanicCounts).sort()),mechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.mechanicOpportunityCounts??{}).sort()),primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(ps.primaryMechanicOpportunityCounts??{}).sort()),decisionFamilyCounts:Object.fromEntries(Object.entries(ps.decisionFamilyCounts).sort())})),actionCounts:Object.fromEntries(Object.entries(actionCounts).sort()),decisionFamilyCounts:Object.fromEntries(Object.entries(decisionFamilyCounts).sort()),actionModeCounts:Object.fromEntries(Object.entries(actionModeCounts).sort()),decisionModeCounts:Object.fromEntries(Object.entries(decisionModeCounts).sort()),responseActionCounts:Object.fromEntries(Object.entries(responseActionCounts).sort()),timingClassCounts:Object.fromEntries(Object.entries(timingClassCounts).sort()),eventTypeCounts:Object.fromEntries(Object.entries(eventTypeCounts).sort()),mechanicCounts:Object.fromEntries(Object.entries(mechanicCounts).sort()),primaryMechanicCounts:Object.fromEntries(Object.entries(primaryMechanicCounts).sort()),mechanicOpportunityCounts:Object.fromEntries(Object.entries(mechanicOpportunityCounts??{}).sort()),primaryMechanicOpportunityCounts:Object.fromEntries(Object.entries(primaryMechanicOpportunityCounts??{}).sort()),ruleCompliance,errorCode};
  const{mechanicOpportunityCounts:_bMechOpp,primaryMechanicOpportunityCounts:_bPrimaryMechOpp,ruleOverrides:_bRuleOverrides,...hashCore}=core;
  // Strip the canonical 'combo' parent tag from the hash input — it
  // summarizes the same super/ultra declarations already counted under
  // those tags (diagnostic taxonomy, not new match events).
  const _stripComboTag=(counts)=>{if(!counts||counts.combo==null)return counts;const{combo:_c,...rest}=counts;return rest;};
  const browserHashInput={...hashCore,mechanicCounts:_stripComboTag(hashCore.mechanicCounts),primaryMechanicCounts:_stripComboTag(hashCore.primaryMechanicCounts),participants:hashCore.participants.map(p=>{const{mechanicOpportunityCounts:_m,primaryMechanicOpportunityCounts:_pm,comboOpportunityCount:_co,comboDeclarationCount:_cd,...rest}=p;return{...rest,mechanicCounts:_stripComboTag(rest.mechanicCounts),primaryMechanicCounts:_stripComboTag(rest.primaryMechanicCounts)};})};
  const strategyData=strategy?.finish(seats.map(id=>finalScores[id]),decisions);
  const terminal=terminalEvidence(capturedEvents,seats.map(id=>state.players[id].goal),publicTerminalAnchorCounts(state,seats));
  const adaptiveTelemetry=buildAdaptiveTelemetry(adaptiveCfgs,adaptiveControllers);
  const _matchResult={...core,...(strategyData?{strategicTelemetry:strategyData}:{}),...(terminal?{terminalEvidence:terminal}:{}),...(adaptiveTelemetry?{adaptiveTelemetry}:{}),comboTelemetry,matchResultHash:hashCanonical(browserHashInput),rankDecisions,decisions:matchDecisions};
  // R01 identity record — post-hash provenance metadata: executable subject
  // hash and deterministic sample id are enumerable/canonical; the execution
  // occurrence is a lifecycle token — non-enumerable so it is readable for
  // this session but never serialized into evidence or hashed surfaces.
  const identity={schemaVersion:'1.0.0',matchIdVersion:executableParts?2:1,deterministicSampleId:matchId,executableHash:executableParts?hashCanonical(executableParts):null,displayOrdinal:ordinal};
  Object.defineProperty(identity,'executionOccurrenceId',{value:executionInstanceToken,enumerable:false});
  _matchResult.identity=identity;
  if(recordReplay)_matchResult.replay={initialState:replayInitialState,commands:replayCommands};
  if(fieldManual) {
    if(!recordReplay)throw new Error('STRATEGY_CAPTURE_REQUIRES_TRANSCRIPT');
    _matchResult.strategyDecisions=fieldManual.finish({initialState:replayInitialState,commands:replayCommands,finalStateHash:_matchResult.finalStateHash,winner:_matchResult.winner,terminationReason,finalScores,gameLength:_matchResult.completedFullTurns});
  }
  return _matchResult;
}

const MAX_BROWSER_MATCH_COUNT=10000;
export function validateMatchCount(requested){
  const n=Number(requested);
  if(!Number.isInteger(n)||n<1)throw new Error(`INVALID_MATCH_COUNT: "${requested}" is not a positive integer. Permitted range: 1–${MAX_BROWSER_MATCH_COUNT}.`);
  if(n>MAX_BROWSER_MATCH_COUNT)throw new Error(`MATCH_COUNT_EXCEEDS_MAXIMUM: requested ${n}, maximum ${MAX_BROWSER_MATCH_COUNT}. Reduce the match count or use the batch CLI for larger campaigns.`);
  return n;
}
// Streaming campaign-core collector — produces the exact fields
// buildCampaignCore computes, but folds one summary at a time so a batched
// campaign never needs the full summaries array resident to produce its
// core. matchResultHash order is canonicalized by matchOrdinal at finish,
// so out-of-order folds across worker segments still produce the same
// canonicalResultHash as a single in-order campaign.
export function createCampaignCoreCollector(){
  const hashes=[];let completed=0,draws=0,seat1Wins=0;
  const totals={completedFullTurns:0,responseDecisionCount:0,privateChoiceDecisionCount:0,advancedDecisionCount:0,voltageDecisionCount:0,ultraDecisionCount:0,triggerCount:0};
  let seen=0;
  return{
    add(item){
      seen+=1;
      hashes.push({o:item.matchOrdinal??seen,h:item.matchResultHash});
      if(!COMPLETE_REASONS.has(item.terminationReason))return;
      completed+=1;
      if(item.terminationReason==='CANONICAL_DRAW')draws+=1;
      if(item.winningSeat===1)seat1Wins+=1;
      for(const key of Object.keys(totals))totals[key]+=Number(item[key]??0);
    },
    finish({profileId=DEFAULT_PROFILE_ID,policyIds=['random-legal','random-legal'],matchCount=seen,engineVersion=ENGINE_VERSION}={}){
      const count=Number(matchCount)||seen;
      const core={schemaVersion:'4.0.0',engineVersion,profileId,policyIds,requestedMatchCount:count,effectiveMatchCount:count,matchCount:count,completedMatchCount:completed,abortCount:seen-completed,drawCount:draws,seat1Wins,seat2Wins:completed-seat1Wins-draws,meanFullTurns:completed?totals.completedFullTurns/completed:null,responseDecisionCount:totals.responseDecisionCount,privateChoiceDecisionCount:totals.privateChoiceDecisionCount,advancedDecisionCount:totals.advancedDecisionCount,voltageDecisionCount:totals.voltageDecisionCount,ultraDecisionCount:totals.ultraDecisionCount,triggerCount:totals.triggerCount,
        // Design-of-record: true paired AB/BA — the BA leg reverses the
        // policy↔seat assignment (post seat-swap repair; parity with the
        // Node campaign semantic).
        experimentDesign:{type:'paired-ab-ba',designVersion:'2.0.0',pairSize:2,seedPolicy:'independent-derived-per-ordinal'},
        canonicalResultHash:hashCanonical(hashes.slice().sort((a,b)=>a.o-b.o).map(x=>x.h))};
      return{...core,status:core.abortCount===0?'PASS':'FAIL',aggregateHash:hashCanonical(core)};
    },
  };
}

// Builds the campaign-level result core from a fully-collected, ordinal-ordered
// summaries array. Exported so the main thread can assemble the campaign result
// from per-worker segment summaries (multi-worker parallel campaigns) without
// re-running the engine.
export function buildCampaignCore(summaries,{profileId=DEFAULT_PROFILE_ID,policyIds=['random-legal','random-legal'],matchCount=summaries.length,engineVersion=ENGINE_VERSION}={}){
  const collector=createCampaignCoreCollector();
  for(const item of summaries)collector.add(item);
  return{...collector.finish({profileId,policyIds,matchCount,engineVersion}),summaries};
}

export function runBrowserCampaign({matchCount=100,policyIds=['random-legal','random-legal'],seedCatalogId='browser-v5',profileId=DEFAULT_PROFILE_ID,seedStrategy='ordinal-hash',fixedSeed=12345,ordinalStart=0,ordinalEnd=null,ordinalBase=0,strategicTrace=false,batchSize=0,onBatch=null},onProgress=()=>{}){
  const requestedMatchCount=validateMatchCount(matchCount);
  const count=requestedMatchCount;
  // ordinalBase shifts the absolute ordinal space so consecutive experiment
  // runs observe fresh seeds (and continue the AB/BA pairing sequence)
  // instead of re-observing identical games. ordinalStart/End stay relative
  // to this invocation's `count`, matching the existing segment contract.
  const base=Math.max(0,Math.floor(Number(ordinalBase)||0));
  const start=base+Math.max(0,Math.min(count,Number(ordinalStart)||0));
  const end=base+Math.min(count,ordinalEnd!==null?(Number(ordinalEnd)||count):count);
  const segmentSize=Math.max(0,end-start),summaries=[];
  // Batched mode: `summaries` is only the in-flight batch — it is handed to
  // onBatch at every batchSize boundary and released. The collector keeps
  // the campaign core without retaining any summary. When onBatch is used
  // the returned core has NO summaries array — nothing accumulates.
  const chunkSize=Math.max(0,Math.floor(Number(batchSize)||0));
  const collector=chunkSize?createCampaignCoreCollector():null;
  let batchStart=start;
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
    // True AB/BA: policyIds[i] binds to physical seat i+1, so the BA leg must
    // reverse the policy array — reversing seatOrder alone only relabels the
    // player ids and leaves each policy in the same seat/first-mover slot.
    const legPolicyIds=seatSwapped?[policyIds[1],policyIds[0]]:[policyIds[0],policyIds[1]];
    const seed=seedStrategy==='fixed'?(Number(fixedSeed)>>>0)||1:uint32FromHash({seedCatalogId,ordinal,policyIds,profileId,engineVersion:ENGINE_VERSION});
    const pairedRunId=`PR-browser-${policyIds[0]}-${policyIds[1]}-block-${Math.floor(ordinal/2)}`;
    const summary=runBrowserPolicyMatch({seed,policyIds:legPolicyIds,ordinal,profileId,seatOrder,seatSwapped,pairedRunId,pairedLeg:seatSwapped?'BA':'AB',strategicTelemetryEnabled:strategicTrace===true,strategicTrace:strategicTrace===true});
    if(collector)collector.add(summary);
    summaries.push(summary);
    if(chunkSize&&summaries.length>=chunkSize){
      onBatch?.({ordinalStart:batchStart,ordinalEnd:ordinal+1,summaries:[...summaries]});
      summaries.length=0;
      batchStart=ordinal+1;
    }
    const done=ordinal-start+1;
    if(done%reportInterval===0||ordinal===end-1||maybeReport(false))onProgress({completed:done,total:segmentSize});
  }
  if(chunkSize&&summaries.length)onBatch?.({ordinalStart:batchStart,ordinalEnd:end,summaries:[...summaries]});
  // Always emit a final progress tick (covers segmentSize===0 and last-match races)
  onProgress({completed:segmentSize,total:segmentSize});
  if(collector)return collector.finish({profileId,policyIds,matchCount:count,engineVersion:ENGINE_VERSION});
  return buildCampaignCore(summaries,{profileId,policyIds,matchCount:count,engineVersion:ENGINE_VERSION});
}
