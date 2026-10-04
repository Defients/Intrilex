import { strategyDigest, sealStrategy, verifyStrategy, strategyFail, normalizeStrategyAction, validateDecisionEvent, decisionContext, CLEAN_ENDINGS } from './strategy-contracts.mjs';
import { reconstructStrategyDecision, planStrategyBranch } from './strategy-branch.mjs';

export const INFORMATION_METHOD = 'UNIFORM_OPENING_UNSEEN_ASSIGNMENT_FRESH_RNG_V1';
export const INFORMATION_BOUNDARY = 'CORE_FIRST_PREPARED_P1_START_V1';
export const INFORMATION_INFERENCE = 'WORLD_PAIRED_HOEFFDING_BONFERRONI_95_V1';
export const INFORMATION_INFERENCE_V2 = 'WORLD_PAIRED_EMPIRICAL_BERNSTEIN_BONFERRONI_95_V1';
export const INFORMATION_INFERENCE_V3 = 'WORLD_PAIRED_EMPIRICAL_BERNSTEIN_BONFERRONI_95_V2';
// World-level paired effects are bounded in [-1, +1], so their support range is
// R = 2. The empirical-Bernstein additive term must carry that range factor;
// omitting it under-covers the bound. Sealed V1/V2 method identities never
// change semantics; the corrected bound is a new method version.
export const INFORMATION_EFFECT_RANGE = 2;
const profiles = ['core-foundation-authority','core-effect-declaration-authority','core-response-authority','core-private-choice-authority','core-advanced-authority','core-unrestricted-authority'];
const unavailable = reason => strategyFail(`INFORMATION_SET_SAMPLING_UNAVAILABLE: ${reason}`);
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
const exactKeys = (value,keys) => Object.keys(value).sort().join('|')===keys.sort().join('|');
function freezeArtifact(value) {
  if(value&&typeof value==='object'){Object.values(value).forEach(freezeArtifact);Object.freeze(value);}
  return value;
}
const setup = (profileId,seed,predeterminedIdentities) => ({profileId,seed,playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],eventApprovedModules:[],...(predeterminedIdentities?{predeterminedIdentities}:{})});
function opening(authority,profile,seed=1,identities) {
  if(!profiles.includes(profile))unavailable('Unsupported rules profile or optional modules.');
  const frame=authority.frame(authority.createState(setup(profile,seed,identities)));
  if(frame.status!=='PLAYER_DECISION_REQUIRED'||frame.decisionActorId!=='P1')unavailable('Authority does not expose the opening P1 decision.');
  return frame;
}
// Full structural equality excludes hidden markers, private history and extension
// fields. Only identities and RNG may differ from a canonical opening template.
function structure(state) {
  const copy=structuredClone(state);delete copy.rng;
  for(const card of Object.values(copy.cards))delete card.identity;
  return copy;
}
// Common fields of the two existing authorized projections. Optional differences
// are representational; the opening certificate supplies every omitted structure.
export function informationProjection(view) {
  const card=c=>c?.identity==='HIDDEN'?{id:c.id,identity:'HIDDEN',faceDown:true}:c?{
    id:c.id,identity:c.identity,controllerId:c.controllerId,zone:c.zone,pointValue:c.pointValue,
    tapped:c.tapped,aegis:c.aegis,swapBarFaceDown:c.swapBarFaceDown,swapBarFaceUp:c.swapBarFaceUp,
    providesGuard:c.providesGuard,exileBound:c.exileBound}:null;
  const own={...view.own,hand:view.own.hand.map(card),pr:view.own.pr.map(card),er:view.own.er.map(card)};
  const opponents=view.opponents.map(o=>({playerId:o.playerId,goal:o.goal,securedPoints:o.securedPoints,handCount:o.handCount,pr:o.pr.map(card),er:o.er.map(card)}));
  const knownCards=Object.fromEntries(Object.entries(view.knownCards).sort(([a],[b])=>a.localeCompare(b)).map(([id,c])=>[id,card(c)]));
  return {actorId:view.actorId,activePlayerId:view.activePlayerId,profileId:view.profileId,phase:view.phase,revision:view.revision,fullTurnSequence:view.fullTurnSequence,
    dpCount:view.dpCount,gyCount:view.gyCount,exileCount:view.exileCount,gyTopCard:card(view.gyTopCard),graveyard:view.graveyard.map(card),exile:view.exile.map(card),swapBar:view.swapBar.map(card),
    boardLock:view.boardLock,suddenDeath:view.suddenDeath,exhausted:view.exhausted,voltage:view.voltage,priority:view.priority,stack:view.stack,triggerQueue:view.triggerQueue,pendingChoice:view.pendingChoice,own,opponents,knownCards};
}
function surface(frame,view) {
  return frame.policyActions.map(a=>normalizeStrategyAction(a,view)).map(({policyScore:_p,decomposition:_d,...a})=>a).sort((a,b)=>a.actionId.localeCompare(b.actionId));
}
export function createInformationSet({state,identity,eraId=identity.fingerprint,authority,actorId='P1'}) {
  const profile=state.metadata?.coreAuthority?.profileId;
  if(actorId!=='P1')unavailable('V1 only certifies the first P1 decision.');
  const template=opening(authority,profile);
  const universe=Object.values(template.state.cards).map(c=>c.identity).sort();
  if(strategyDigest(Object.values(state.cards).map(c=>c.identity).sort())!==strategyDigest(universe))strategyFail('INFORMATION_SOURCE_CARD_CONSERVATION');
  if(strategyDigest(structure(state))!==strategyDigest(structure(template.state)))unavailable('Non-opening structure, remembered information or unsupported hidden dimension.');
  const frame=authority.frame(state);
  if(frame.executedCommands.length||frame.status!=='PLAYER_DECISION_REQUIRED'||frame.decisionActorId!==actorId)unavailable('Source is not a prepared decision boundary.');
  const view=authority.view(frame.state,actorId),projection=informationProjection(view);
  const info=sealStrategy('INFORMATION_SET_V1',{schemaVersion:1,boundary:INFORMATION_BOUNDARY,fingerprint:identity.fingerprint,rulesProfile:profile,eraId,actorId,seat:1,
    projection,legalActions:surface(frame,view),knowledge:{history:'NO_PLAYER_ACTIONS_BEFORE_THIS_OPENING',rememberedCards:[],revealedCards:[],structuralCertificate:strategyDigest(structure(template.state))}});
  validateInformationSet(info);
  // Reproduction from known identities alone rejects invalid identity allocation.
  reconstructInformationWorld(info,{authority,seed:1,ordinal:0});
  return info;
}
export function validateInformationSet(info) {
  verifyStrategy(info,'INFORMATION_SET_V1');
  if(!exactKeys(info,['contract','artifactId','schemaVersion','boundary','fingerprint','rulesProfile','eraId','actorId','seat','projection','legalActions','knowledge'])||info.schemaVersion!==1||info.boundary!==INFORMATION_BOUNDARY||!profiles.includes(info.rulesProfile)||info.actorId!=='P1'||info.seat!==1||!info.fingerprint||!info.eraId||!Array.isArray(info.legalActions)||!info.legalActions.length)strategyFail('INFORMATION_SET_SCHEMA');
  if(info.projection.actorId!==info.actorId||info.projection.profileId!==info.rulesProfile||info.projection.phase!=='Start'||info.projection.fullTurnSequence!==1||info.projection.own.hand.length!==5||info.projection.opponents.length!==1||info.projection.opponents[0].handCount!==6||Object.keys(info.projection.knownCards).length!==6)unavailable('Projection is not a supported opening.');
  if(strategyDigest(info.knowledge)!==strategyDigest({history:'NO_PLAYER_ACTIONS_BEFORE_THIS_OPENING',rememberedCards:[],revealedCards:[],structuralCertificate:info.knowledge.structuralCertificate}))strategyFail('INFORMATION_SET_KNOWLEDGE_SCHEMA');
  if(new Set(info.legalActions.map(a=>a.actionId)).size!==info.legalActions.length)strategyFail('INFORMATION_SET_LEGAL_SCHEMA');
  const p=info.projection;
  if(!exactKeys(p,['actorId','activePlayerId','profileId','phase','revision','fullTurnSequence','dpCount','gyCount','exileCount','gyTopCard','graveyard','exile','swapBar','boardLock','suddenDeath','exhausted','voltage','priority','stack','triggerQueue','pendingChoice','own','opponents','knownCards'])||!exactKeys(p.own,['goal','securedPoints','hand','pr','er','limits'])||p.opponents.some(o=>!exactKeys(o,['playerId','goal','securedPoints','handCount','pr','er'])))strategyFail('INFORMATION_SET_PROJECTION_SCHEMA');
  for(const c of [...Object.values(p.knownCards),...p.own.hand,...p.swapBar])if(!exactKeys(c,c.identity==='HIDDEN'?['id','identity','faceDown']:['id','identity','controllerId','zone','pointValue','tapped','aegis','swapBarFaceDown','swapBarFaceUp','providesGuard','exileBound']))strategyFail('INFORMATION_SET_CARD_SCHEMA');
  for(const a of info.legalActions)if(!exactKeys(a,['actionId','family','mode','timing','sourceCards','sourceRole','targetRole','subjects','features']))strategyFail('INFORMATION_SET_LEGAL_SCHEMA');
  return info;
}
export function informationEquivalent(a,b,options) {
  return createInformationSet({state:a,...options}).artifactId===createInformationSet({state:b,...options}).artifactId;
}
// Counter-based hash stream with rejection sampling avoids modulo bias. This is
// a reproducible finite pseudorandom design, not physical independent entropy.
function randomStream(info,seed,ordinal,stream) {
  let counter=0;
  return size=>{const ceiling=Math.floor(0x100000000/size)*size;let value;do{value=Number.parseInt(strategyDigest({info:info.artifactId,method:INFORMATION_METHOD,seed,ordinal,stream,counter:counter++}).slice(0,8),16);}while(value>=ceiling);return value%size;};
}
export function reconstructInformationWorld(info,{authority,seed,ordinal}) {
  validateInformationSet(info);
  if(!Number.isInteger(seed)||seed<1||seed>0xffffffff||!Number.isInteger(ordinal)||ordinal<0||ordinal>511)strategyFail('INFORMATION_SAMPLER_CATALOG_INVALID');
  const template=opening(authority,info.rulesProfile),cards=Object.values(template.state.cards).sort((a,b)=>a.id.localeCompare(b.id));
  const universe=cards.map(c=>c.identity).sort(),known=info.projection.knownCards;
  if(universe.length!==54||new Set(universe).size!==54)unavailable('Authority card universe is not one canonical deck.');
  if(info.knowledge.structuralCertificate!==strategyDigest(structure(template.state)))unavailable('Structural certificate differs from current authority.');
  const knownIds=Object.keys(known),knownIdentities=Object.values(known).map(c=>c.identity);
  if(knownIds.some(id=>!cards.some(c=>c.id===id))||new Set(knownIdentities).size!==knownIdentities.length||knownIdentities.some(id=>!universe.includes(id)))strategyFail('INFORMATION_KNOWN_ALLOCATION_INVALID');
  const unseen=universe.filter(id=>!knownIdentities.includes(id)),next=randomStream(info,seed,ordinal,'UNSEEN');
  for(let i=unseen.length-1;i>0;i--){const j=next(i+1);[unseen[i],unseen[j]]=[unseen[j],unseen[i]];}
  let index=0;const identities=cards.map(c=>known[c.id]?.identity??unseen[index++]);
  const rngSeed=randomStream(info,seed,ordinal,'FRESH_ENGINE_RNG')(0xffffffff)+1;
  const frame=opening(authority,info.rulesProfile,rngSeed,identities);
  validateInformationWorld(info,frame,authority,universe);
  return {ordinal,stateHash:strategyDigest(frame.state),frame,engineSeed:rngSeed,assignmentHash:strategyDigest(identities)};
}
export function validateInformationWorld(info,frame,authority,universe) {
  if(strategyDigest(structure(frame.state))!==info.knowledge.structuralCertificate)strategyFail('INFORMATION_WORLD_STRUCTURE_INVALID');
  const actual=Object.values(frame.state.cards).map(c=>c.identity).sort();
  if(strategyDigest(actual)!==strategyDigest(universe)||new Set(actual).size!==actual.length)strategyFail('INFORMATION_WORLD_CARD_CONSERVATION');
  const view=authority.view(frame.state,info.actorId);
  if(strategyDigest(informationProjection(view))!==strategyDigest(info.projection))strategyFail('INFORMATION_WORLD_PROJECTION_MISMATCH');
  if(strategyDigest(surface(frame,view))!==strategyDigest(info.legalActions))strategyFail('INFORMATION_WORLD_LEGAL_MISMATCH');
  // Constructors and preparation assert validity; also execute each real legal
  // command on an isolated clone to test the resolved vault against this world.
  for(const a of info.legalActions)if(!authority.execute(structuredClone(frame.state),frame.resolve(a.actionId)).accepted)strategyFail('INFORMATION_WORLD_COMMAND_REJECTED');
  return true;
}
export function sampleInformationWorlds(info,{authority,seed=1337,count=12}) {
  validateInformationSet(info);
  if(!Number.isInteger(count)||count<1||count>512)strategyFail('INFORMATION_WORLD_BUDGET_INVALID');
  const worlds=[],rejections=[],seen=new Set();
  for(let ordinal=0;ordinal<count;ordinal++){
    try{const world=reconstructInformationWorld(info,{authority,seed,ordinal});if(seen.has(world.stateHash))throw new Error('DUPLICATE_WORLD');seen.add(world.stateHash);worlds.push(world);}
    catch(error){rejections.push({ordinal,reason:error.message});}
  }
  const manifest=sealStrategy('INFORMATION_WORLD_MANIFEST_V1',{informationSetId:info.artifactId,method:INFORMATION_METHOD,seed,requested:count,accepted:worlds.length,rejected:rejections.length,rejections,
    worlds:worlds.map(({ordinal,stateHash,assignmentHash,engineSeed})=>({ordinal,stateHash,assignmentHash,engineSeed}))});
  return {manifest,worlds};
}
// V1.2 candidate precommitment. Every legal action's subject disposition is
// classified once on the authoritative reconstructed decision frame — never on
// continuation results, model preference or UI state — and the classification
// is frozen into the sealed plan as auditable metadata, not evidence.
export const INFORMATION_ACTION_SELECTION = 'SUBJECT_DISPOSITION_CONTRAST_V1';
export function classifyInformationActions(informationSet,frame,subject,authority) {
  validateInformationSet(informationSet);
  const handles=subjectHandles(informationSet,subject),dispositions={};
  for(const candidate of informationSet.legalActions) {
    const action=frame.policyActions.find(a=>a.actionId===candidate.actionId);
    if(!action)strategyFail('INFORMATION_ACTION_SURFACE_MISMATCH');
    const applied=authority.execute(structuredClone(frame.state),frame.resolve(candidate.actionId));
    dispositions[candidate.actionId]=applied.accepted?subjectDispositionV2(applied.state,informationSet.actorId,handles,action,subject):'REJECTED';
  }
  return dispositions;
}
export function selectInformationActions({informationSet,frame,subject,referenceActionId,authority,explicitIds=null,maxAlternatives=3}) {
  const dispositions=classifyInformationActions(informationSet,frame,subject,authority);
  const legal=informationSet.legalActions.map(a=>a.actionId);
  const uses=legal.filter(id=>id!==referenceActionId&&dispositions[id]==='USES_SUBJECT');
  const preserves=legal.filter(id=>id!==referenceActionId&&dispositions[id]==='PRESERVES_SUBJECT');
  const others=legal.filter(id=>id!==referenceActionId&&!['USES_SUBJECT','PRESERVES_SUBJECT'].includes(dispositions[id]));
  // A meaningful subject study needs at least one action that uses the subject
  // and at least one that does not. Anything else cannot answer a use-vs-
  // preserve question and fails explicitly rather than running an irrelevant
  // study under the subject label.
  const anyUse=legal.some(id=>dispositions[id]==='USES_SUBJECT'),anyNonUse=legal.some(id=>dispositions[id]!=='USES_SUBJECT');
  if(!explicitIds&&!(anyUse&&anyNonUse))strategyFail('NO_SUBJECT_ACTION_CONTRAST_AVAILABLE');
  const rationale={[referenceActionId]:'REFERENCE_RECORDED_ACTION'};
  if(explicitIds){
    for(const id of explicitIds)if(id!==referenceActionId)rationale[id]='EXPLICIT_PRECOMMITTED_ALTERNATIVE';
    return {ids:[...explicitIds],selection:{method:INFORMATION_ACTION_SELECTION,requestedSubject:subject,dispositions,rationale}};
  }
  const chosen=[];
  const take=(id,why)=>{if(!chosen.includes(id)){chosen.push(id);rationale[id]=why;}};
  if(dispositions[referenceActionId]!=='USES_SUBJECT'&&uses.length)take(uses[0],'USES_SUBJECT_PRIMARY');
  if(dispositions[referenceActionId]!=='PRESERVES_SUBJECT'&&preserves.length)take(preserves[0],'PRESERVES_SUBJECT_PRIMARY');
  const familyOf=id=>informationSet.legalActions.find(a=>a.actionId===id).family;
  for(const id of [...uses,...preserves,...others]){if(chosen.length>=maxAlternatives)break;if(!chosen.includes(id)&&!chosen.some(c=>familyOf(c)===familyOf(id)))take(id,'DIVERSE_COMPARATOR');}
  for(const id of [...uses,...preserves,...others]){if(chosen.length>=maxAlternatives)break;take(id,'ADDITIONAL_PRECOMMITTED_ALTERNATIVE');}
  if(!chosen.length)strategyFail('NO_SUBJECT_ACTION_CONTRAST_AVAILABLE');
  return {ids:[referenceActionId,...chosen],selection:{method:INFORMATION_ACTION_SELECTION,requestedSubject:subject,dispositions,rationale}};
}
export function prepareInformationStudy({event,replay,identity,checkpoints,authority,worldCount=12,samplerSeed=1337,seeds=[101],decisionLimit=300,actionIds,minimumMeaningfulEffect=.05,requestedSubject}) {
  validateDecisionEvent(event);
  if(event.identity.eraId!==identity.fingerprint)strategyFail('INFORMATION_STUDY_CURRENT_ERA_REQUIRED');
  const source=reconstructStrategyDecision({event,replay,identity,authority});
  const informationSet=createInformationSet({state:source.state,identity,eraId:event.identity.eraId,authority,actorId:event.actorId});
  // The requested subject is what the player/researcher is investigating. It
  // defaults to the recorded action's primary subject only when no explicit
  // subject was requested. It must be a real legal opportunity in this
  // information set; a recorded action belonging to another subject cannot
  // silently redirect the study question.
  const subject=requestedSubject??event.candidates.find(c=>c.actionId===event.selectedActionId).subjects[0];
  if(typeof subject!=='string'||!subject||!informationSet.legalActions.some(a=>a.subjects.includes(subject)))strategyFail('INFORMATION_REQUESTED_SUBJECT_NOT_LEGAL');
  const {ids,selection}=selectInformationActions({informationSet,frame:source,subject,referenceActionId:event.selectedActionId,authority,explicitIds:actionIds??null});
  const branch=planStrategyBranch(event,{seeds:seeds.length===1?[seeds[0],seeds[0]===0xffffffff?1:seeds[0]+1]:seeds,decisionLimit,actionIds:ids});
  const frozen=branch.continuationCheckpointIds.map(id=>checkpoints.find(c=>c.checkpointId===id));
  frozen.forEach(cp=>{if(!cp)strategyFail('INFORMATION_CHECKPOINT_MISSING');authority.validateCheckpoint(cp,identity);});
  if(!Array.isArray(seeds)||seeds.length<1||seeds.length>8||new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isInteger(s)||s<1||s>0xffffffff)||!Number.isFinite(minimumMeaningfulEffect)||minimumMeaningfulEffect<0||minimumMeaningfulEffect>1)strategyFail('INFORMATION_PLAN_BUDGET_INVALID');
  const {manifest}=sampleInformationWorlds(informationSet,{authority,seed:samplerSeed,count:worldCount});
  const plan=sealStrategy('INFORMATION_SET_STUDY_PLAN_V1',{schemaVersion:3,informationSetId:informationSet.artifactId,sourceEventId:event.artifactId,fingerprint:identity.fingerprint,rulesProfile:event.identity.rulesProfile,eraId:event.identity.eraId,
    requestedSubject:subject,referenceActionId:event.selectedActionId,actionSelection:selection,
    question:{subject,estimand:'Alternative minus recorded action terminal game score, under this opening assignment model and frozen policies.'},
    actualActionId:event.selectedActionId,actionIds:ids,samplerMethod:INFORMATION_METHOD,worldManifest:manifest,seeds:[...seeds],decisionLimit,minimumMeaningfulEffect,
    primaryMetric:'WIN_1_DRAW_HALF_LOSS_0',inferenceMethod:INFORMATION_INFERENCE_V3,alpha:.05,multiplicity:'BONFERRONI_PLANNED_ALTERNATIVES',
    heterogeneityThresholds:{robustFavored:.75,robustAgainst:.1,robustDownside:0,volatileBoth:.2},
    fixedBudget:true,stoppingRule:'ALL_ACCEPTED_WORLDS_ALL_ACTIONS_ALL_SEEDS',faultPolicy:'ANY_REJECTION_FAULT_CENSOR_OR_CANCEL_INVALIDATES_INFERENCE',
    continuationCheckpointIds:branch.continuationCheckpointIds,checkpointDigest:strategyDigest(frozen),informationScope:'ACTOR_AUTHORIZED',provenance:[event.artifactId,informationSet.artifactId,manifest.artifactId]});
  return {informationSet:freezeArtifact(informationSet),plan:freezeArtifact(plan)};
}
export function validateInformationPlan(plan,info,event,checkpoints,identity,authority) {
  verifyStrategy(plan,'INFORMATION_SET_STUDY_PLAN_V1');validateInformationSet(info);validateDecisionEvent(event);
  if(plan.fingerprint!==identity.fingerprint||plan.eraId!==identity.fingerprint||plan.rulesProfile!==event.identity.rulesProfile||plan.sourceEventId!==event.artifactId||plan.informationSetId!==info.artifactId||plan.informationScope!=='ACTOR_AUTHORIZED'||info.fingerprint!==plan.fingerprint||info.eraId!==plan.eraId||info.rulesProfile!==plan.rulesProfile)strategyFail('INFORMATION_PLAN_IDENTITY_MISMATCH');
  const v2=plan.schemaVersion===2,v3=plan.schemaVersion===3,subjected=v2||v3;
  const keys=['contract','artifactId','informationSetId','sourceEventId','fingerprint','rulesProfile','eraId','question','actualActionId','actionIds','samplerMethod','worldManifest','seeds','decisionLimit','minimumMeaningfulEffect','primaryMetric','inferenceMethod','alpha','multiplicity','heterogeneityThresholds','fixedBudget','stoppingRule','faultPolicy','continuationCheckpointIds','checkpointDigest','informationScope','provenance'];
  if(subjected)keys.push('schemaVersion','requestedSubject','referenceActionId');
  if(v3)keys.push('actionSelection');
  const question={subject:subjected?plan.requestedSubject:event.candidates.find(c=>c.actionId===event.selectedActionId).subjects[0],estimand:'Alternative minus recorded action terminal game score, under this opening assignment model and frozen policies.'};
  if(!exactKeys(plan,keys)||plan.actualActionId!==event.selectedActionId||strategyDigest(plan.question)!==strategyDigest(question)||strategyDigest(plan.provenance)!==strategyDigest([event.artifactId,info.artifactId,plan.worldManifest.artifactId]))strategyFail('INFORMATION_PLAN_FROZEN_FIELDS_MISMATCH');
  // V1.1+: the requested subject is a separately frozen field and must be a
  // legal opportunity in this information set. The recorded action remains the
  // reference; neither may be silently rebound by the other's subjects.
  if(subjected&&(typeof plan.requestedSubject!=='string'||plan.requestedSubject!==plan.question.subject||plan.referenceActionId!==plan.actualActionId||!info.legalActions.some(a=>a.subjects.includes(plan.requestedSubject))))strategyFail('INFORMATION_REQUESTED_SUBJECT_INVALID');
  const candidates=event.candidates.map(({policyScore:_p,decomposition:_d,...a})=>a);
  if(strategyDigest(info.legalActions)!==strategyDigest(candidates)||strategyDigest(decisionContext(info.projection))!==strategyDigest(event.context)||event.actorId!==info.actorId)strategyFail('INFORMATION_PLAN_EVENT_MISMATCH');
  const branch=planStrategyBranch(event,{seeds:plan.seeds.length===1?[plan.seeds[0],plan.seeds[0]===0xffffffff?1:plan.seeds[0]+1]:plan.seeds,decisionLimit:plan.decisionLimit,actionIds:plan.actionIds});
  const frozen=branch.continuationCheckpointIds.map(id=>checkpoints.find(c=>c.checkpointId===id));
  if(frozen.some(cp=>!cp))strategyFail('INFORMATION_CHECKPOINT_MISSING');frozen.forEach(cp=>authority.validateCheckpoint(cp,identity));
  if(plan.checkpointDigest!==strategyDigest(frozen)||strategyDigest(plan.continuationCheckpointIds)!==strategyDigest(branch.continuationCheckpointIds))strategyFail('INFORMATION_CHECKPOINT_MISMATCH');
  const {manifest,worlds}=sampleInformationWorlds(info,{authority,seed:plan.worldManifest.seed,count:plan.worldManifest.requested});
  if(strategyDigest(manifest)!==strategyDigest(plan.worldManifest))strategyFail('INFORMATION_WORLD_MANIFEST_MISMATCH');
  // V1.2: the frozen action selection is auditable metadata. Dispositions are
  // re-derived on a validated world and must match the sealed record exactly;
  // rationale labels are checked against the allowed vocabulary. Inference is
  // impossible when every world was rejected, so re-derivation only applies
  // when a world exists.
  if(v3){
    const sel=plan.actionSelection,allowed=['REFERENCE_RECORDED_ACTION','USES_SUBJECT_PRIMARY','PRESERVES_SUBJECT_PRIMARY','DIVERSE_COMPARATOR','ADDITIONAL_PRECOMMITTED_ALTERNATIVE','EXPLICIT_PRECOMMITTED_ALTERNATIVE'];
    if(!sel||!exactKeys(sel,['method','requestedSubject','dispositions','rationale'])||sel.method!==INFORMATION_ACTION_SELECTION||sel.requestedSubject!==plan.requestedSubject
      ||strategyDigest(Object.keys(sel.dispositions).sort())!==strategyDigest(info.legalActions.map(a=>a.actionId).sort())
      ||strategyDigest(Object.keys(sel.rationale).sort())!==strategyDigest([...plan.actionIds].sort())
      ||sel.rationale[plan.actualActionId]!=='REFERENCE_RECORDED_ACTION'
      ||Object.values(sel.rationale).some(r=>!allowed.includes(r)))strategyFail('INFORMATION_ACTION_SELECTION_INVALID');
    if(worlds.length&&strategyDigest(classifyInformationActions(info,worlds[0].frame,plan.requestedSubject,authority))!==strategyDigest(sel.dispositions))strategyFail('INFORMATION_ACTION_SELECTION_DISPOSITION_MISMATCH');
  }
  const invariant={...plan,alpha:.05,inferenceMethod:inferenceMethodFor(plan.schemaVersion??1),multiplicity:'BONFERRONI_PLANNED_ALTERNATIVES',samplerMethod:INFORMATION_METHOD,primaryMetric:'WIN_1_DRAW_HALF_LOSS_0',fixedBudget:true,stoppingRule:'ALL_ACCEPTED_WORLDS_ALL_ACTIONS_ALL_SEEDS',faultPolicy:'ANY_REJECTION_FAULT_CENSOR_OR_CANCEL_INVALIDATES_INFERENCE',heterogeneityThresholds:{robustFavored:.75,robustAgainst:.1,robustDownside:0,volatileBoth:.2}};
  if(strategyDigest(invariant)!==strategyDigest(plan)||!Number.isFinite(plan.minimumMeaningfulEffect)||plan.minimumMeaningfulEffect<0||plan.minimumMeaningfulEffect>1||!Array.isArray(plan.seeds)||plan.seeds.length<1||plan.seeds.length>8||new Set(plan.seeds).size!==plan.seeds.length)strategyFail('INFORMATION_PLAN_METHOD_MISMATCH');
  return {frozen,worlds};
}
export function inferWorldEffects(effects,{alternatives=1,minimumMeaningfulEffect=.05}={}) {
  if(!Array.isArray(effects)||effects.some(d=>!Number.isFinite(d)||d< -1||d>1)||!Number.isInteger(alternatives)||alternatives<1||!Number.isFinite(minimumMeaningfulEffect)||minimumMeaningfulEffect<0)strategyFail('INFORMATION_EFFECTS_INVALID');
  const n=effects.length;if(!n)return {n:0,delta:null,interval:null,heterogeneity:'UNRESOLVED'};
  const delta=mean(effects),half=Math.sqrt(2*Math.log(2*alternatives/.05)/n),positive=effects.filter(d=>d>0).length/n,negative=effects.filter(d=>d<0).length/n;
  const sorted=[...effects].sort((a,b)=>a-b),worstQuartile=mean(sorted.slice(0,Math.max(1,Math.ceil(n/4)))),dispersion=Math.sqrt(mean(effects.map(d=>(d-delta)**2)));
  const interval=n<2?null:[Math.max(-1,delta-half),Math.min(1,delta+half)];
  const heterogeneity=positive>=.2&&negative>=.2?'VOLATILE':n>=2&&positive>=.75&&negative<=.1&&worstQuartile>=0?'ROBUST':'UNRESOLVED';
  return {n,delta,interval,positiveFraction:positive,negativeFraction:negative,tiedFraction:effects.filter(d=>d===0).length/n,signReversals:positive>0&&negative>0,worstQuartile,dispersion,heterogeneity,method:INFORMATION_INFERENCE,
    qualifies:n>=2&&interval!==null&&interval[0]>minimumMeaningfulEffect&&heterogeneity==='ROBUST'};
}
// V1.1 method: Audibert–Munos–Szepesvári empirical Bernstein over world-level
// paired effects bounded in [-1,1], two-sided with familywise Bonferroni
// delta = 0.05/m and the conservative ln(3/delta) constant.
//   half = sqrt(2 * V * ln(3m/0.05) / n) + 3 * ln(3m/0.05) / n
// V is the biased empirical variance the inequality requires. The additive
// 3*ln term is a documented floor: identical world effects cannot collapse the
// interval to zero width, so deterministic continuation artifacts cannot
// masquerade as infinite certainty. Valid for any bounded distribution without
// a normality assumption; strictly no wider than Hoeffding at equal coverage.
export function inferWorldEffectsV2(effects,{alternatives=1,minimumMeaningfulEffect=.05}={}) {
  if(!Array.isArray(effects)||effects.some(d=>!Number.isFinite(d)||d< -1||d>1)||!Number.isInteger(alternatives)||alternatives<1||!Number.isFinite(minimumMeaningfulEffect)||minimumMeaningfulEffect<0)strategyFail('INFORMATION_EFFECTS_INVALID');
  const n=effects.length;if(!n)return {n:0,delta:null,interval:null,heterogeneity:'UNRESOLVED'};
  const delta=mean(effects),variance=mean(effects.map(d=>(d-delta)**2)),log=Math.log(3*alternatives/.05);
  const half=Math.sqrt(2*variance*log/n)+3*log/n,positive=effects.filter(d=>d>0).length/n,negative=effects.filter(d=>d<0).length/n;
  const sorted=[...effects].sort((a,b)=>a-b),quartile=Math.max(1,Math.ceil(n/4)),worstQuartile=mean(sorted.slice(0,quartile)),bestQuartile=mean(sorted.slice(-quartile)),dispersion=Math.sqrt(variance);
  const interval=n<2?null:[Math.max(-1,delta-half),Math.min(1,delta+half)];
  const robustAlternative=n>=2&&positive>=.75&&negative<=.1&&worstQuartile>=0,robustReference=n>=2&&negative>=.75&&positive<=.1&&bestQuartile<=0;
  const heterogeneity=positive>=.2&&negative>=.2?'VOLATILE':robustAlternative?'ROBUST':'UNRESOLVED';
  const favoredDirection=heterogeneity==='VOLATILE'?'MIXED':robustAlternative?'ALTERNATIVE':robustReference?'REFERENCE':'UNRESOLVED';
  return {n,delta,interval,positiveFraction:positive,negativeFraction:negative,tiedFraction:effects.filter(d=>d===0).length/n,signReversals:positive>0&&negative>0,worstQuartile,bestQuartile,dispersion,heterogeneity,favoredDirection,method:INFORMATION_INFERENCE_V2,
    qualifies:n>=2&&interval!==null&&interval[0]>minimumMeaningfulEffect&&heterogeneity==='ROBUST',
    referenceDominates:n>=2&&interval!==null&&interval[1]<-minimumMeaningfulEffect&&favoredDirection==='REFERENCE'};
}
// V1.2 method: same Audibert–Munos–Szepesvári empirical Bernstein two-sided
// bound, but with the required support-range factor on the additive term.
// For variables bounded in an interval of width R (here R = 2 for paired
// effects in [-1,+1]), the inequality is
//   half = sqrt(2 * V * ln(3m/0.05) / n) + 3 * R * ln(3m/0.05) / n
// V remains the biased empirical variance the theorem requires (the variance
// term does NOT take the range factor — scaling X in [a,a+R] to [0,1] divides
// variance by R^2 and rescales the whole bound by exactly R, which cancels).
// Reference: Audibert, Munos & Szepesvári, "Exploration-exploitation tradeoff
// using variance estimates in multi-armed bandits" (Theorem 1), applied to
// [0,R]-valued variables with familywise Bonferroni delta = 0.05/m. The 3R*ln
// additive term is also a documented floor: identical world effects cannot
// collapse the interval to zero width.
export function inferWorldEffectsV3(effects,{alternatives=1,minimumMeaningfulEffect=.05}={}) {
  if(!Array.isArray(effects)||effects.some(d=>!Number.isFinite(d)||d< -1||d>1)||!Number.isInteger(alternatives)||alternatives<1||!Number.isFinite(minimumMeaningfulEffect)||minimumMeaningfulEffect<0)strategyFail('INFORMATION_EFFECTS_INVALID');
  const n=effects.length;if(!n)return {n:0,delta:null,interval:null,heterogeneity:'UNRESOLVED'};
  const delta=mean(effects),variance=mean(effects.map(d=>(d-delta)**2)),log=Math.log(3*alternatives/.05);
  const half=Math.sqrt(2*variance*log/n)+3*INFORMATION_EFFECT_RANGE*log/n,positive=effects.filter(d=>d>0).length/n,negative=effects.filter(d=>d<0).length/n;
  const sorted=[...effects].sort((a,b)=>a-b),quartile=Math.max(1,Math.ceil(n/4)),worstQuartile=mean(sorted.slice(0,quartile)),bestQuartile=mean(sorted.slice(-quartile)),dispersion=Math.sqrt(variance);
  const interval=n<2?null:[Math.max(-1,delta-half),Math.min(1,delta+half)];
  const robustAlternative=n>=2&&positive>=.75&&negative<=.1&&worstQuartile>=0,robustReference=n>=2&&negative>=.75&&positive<=.1&&bestQuartile<=0;
  const heterogeneity=positive>=.2&&negative>=.2?'VOLATILE':robustAlternative?'ROBUST':'UNRESOLVED';
  const favoredDirection=heterogeneity==='VOLATILE'?'MIXED':robustAlternative?'ALTERNATIVE':robustReference?'REFERENCE':'UNRESOLVED';
  return {n,delta,interval,positiveFraction:positive,negativeFraction:negative,tiedFraction:effects.filter(d=>d===0).length/n,signReversals:positive>0&&negative>0,worstQuartile,bestQuartile,dispersion,heterogeneity,favoredDirection,method:INFORMATION_INFERENCE_V3,
    qualifies:n>=2&&interval!==null&&interval[0]>minimumMeaningfulEffect&&heterogeneity==='ROBUST',
    referenceDominates:n>=2&&interval!==null&&interval[1]<-minimumMeaningfulEffect&&favoredDirection==='REFERENCE'};
}
// The frozen plan's declared inferenceMethod selects the recomputation.
// Historical plans keep their sealed method semantics forever.
export const INFORMATION_INFERENCE_METHODS = Object.freeze({
  [INFORMATION_INFERENCE]:inferWorldEffects,
  [INFORMATION_INFERENCE_V2]:inferWorldEffectsV2,
  [INFORMATION_INFERENCE_V3]:inferWorldEffectsV3});
export const inferenceMethodFor = schemaVersion => schemaVersion>=3?INFORMATION_INFERENCE_V3:schemaVersion===2?INFORMATION_INFERENCE_V2:INFORMATION_INFERENCE;
export const inferenceFor = plan => {
  const expected=inferenceMethodFor(plan.schemaVersion===undefined?1:plan.schemaVersion);
  if(plan.inferenceMethod!==expected||!Object.hasOwn(INFORMATION_INFERENCE_METHODS,plan.inferenceMethod))strategyFail('INFORMATION_PLAN_METHOD_MISMATCH');
  return INFORMATION_INFERENCE_METHODS[plan.inferenceMethod];
};
export function informationStudyAssessment(comparisons) {
  if(!comparisons?.length)return 'NOT_EVALUATED';
  const favored=comparisons.filter(c=>c.qualifies).length,against=comparisons.filter(c=>c.referenceDominates).length;
  if(favored&&against)return 'MIXED_DIRECTIONS';
  if(favored)return 'ALTERNATIVE_DOMINATES';
  if(against===comparisons.length)return 'REFERENCE_DOMINATES_ALL';
  if(against)return 'PARTIAL_REFERENCE_ADVANTAGE';
  return 'UNRESOLVED';
}
// Pre-study planning diagnostics under the corrected V1.2 method. These are
// labeled approximations with an explicit dispersion assumption — expected
// interval resolution, never a power guarantee.
export function informationResolution({worlds,alternatives=1,minimumMeaningfulEffect=.05,variance=.25}={}) {
  if(!Number.isInteger(worlds)||worlds<2||!Number.isInteger(alternatives)||alternatives<1||!Number.isFinite(variance)||variance<0||variance>1||!Number.isFinite(minimumMeaningfulEffect)||minimumMeaningfulEffect<0||minimumMeaningfulEffect>=1)strategyFail('INFORMATION_RESOLUTION_INVALID');
  const log=Math.log(3*alternatives/.05),half=Math.sqrt(2*variance*log/worlds)+3*INFORMATION_EFFECT_RANGE*log/worlds;
  return {method:INFORMATION_INFERENCE_V3,worlds,alternatives,assumedVariance:variance,expectedIntervalRadius:half,minimumResolvableEffect:minimumMeaningfulEffect+half,label:'APPROXIMATE_RESOLUTION'};
}
export function approximateWorldsForEffect({effect,alternatives=1,minimumMeaningfulEffect=.05,variance=.25,maxWorlds=100000}={}) {
  if(!Number.isFinite(effect)||Math.abs(effect)<=minimumMeaningfulEffect||!Number.isInteger(alternatives)||alternatives<1||!Number.isFinite(variance)||variance<0||variance>1||!Number.isFinite(minimumMeaningfulEffect)||minimumMeaningfulEffect<0||minimumMeaningfulEffect>=1)strategyFail('INFORMATION_RESOLUTION_INVALID');
  const needed=Math.abs(effect)-minimumMeaningfulEffect,at=n=>{const log=Math.log(3*alternatives/.05);return Math.sqrt(2*variance*log/n)+3*INFORMATION_EFFECT_RANGE*log/n;};
  if(at(maxWorlds)>=needed)return null;
  let lo=2,hi=maxWorlds;
  while(lo<hi){const mid=(lo+hi)>>1;at(mid)<needed?hi=mid:lo=mid+1;}
  return lo;
}
// Deterministic recalibrated planning table for the corrected bound. Rows are
// interval-resolution estimates under declared dispersion assumptions; they
// estimate what an interval can resolve, not the probability of detecting a
// true effect.
export function informationResolutionTable({worldCounts=[32,64,128,256,512],alternativeCounts=[1,2,3],variances={ZERO:0,MODERATE:.25,HIGH:1},effects=[.05,.1,.15,.2,.25],minimumMeaningfulEffect=.05,maxWorlds=512}={}) {
  const resolution=[];
  for(const worlds of worldCounts)for(const alternatives of alternativeCounts)for(const [dispersion,variance] of Object.entries(variances)) {
    const r=informationResolution({worlds,alternatives,minimumMeaningfulEffect,variance});
    resolution.push({worlds,alternatives,dispersion,assumedVariance:variance,expectedIntervalRadius:r.expectedIntervalRadius,approximateDetectableEffect:r.minimumResolvableEffect});
  }
  const worldsNeeded=[];
  for(const effect of effects)for(const alternatives of alternativeCounts)for(const [dispersion,variance] of Object.entries(variances))
    worldsNeeded.push({effect,alternatives,dispersion,assumedVariance:variance,worldsNeeded:Math.abs(effect)>minimumMeaningfulEffect?approximateWorldsForEffect({effect,alternatives,minimumMeaningfulEffect,variance,maxWorlds}):null});
  return {method:INFORMATION_INFERENCE_V3,label:'APPROXIMATE_RESOLUTION',minimumMeaningfulEffect,maxWorlds,resolution,worldsNeeded};
}
function disposition(before,after,subjectIds,action) {
  const committed=subjectIds.some(id=>(action.sourceHandles??[]).includes(id)&&['ON_STACK','P1_PR','P1_ER'].includes(after.cards[id]?.zone));
  if(committed)return 'PLAYED_OR_COMMITTED';
  if(subjectIds.length&&subjectIds.every(id=>after.players.P1.hand.includes(id)))return 'PRESERVED_IN_HAND';
  if(subjectIds.some(id=>['GY','EXILE'].includes(after.cards[id]?.zone)))return 'CONSUMED_OTHER_WAY';
  return 'UNAVAILABLE_OTHER_WAY';
}
// V1.1 requested-subject semantics. Card/rank/suit subjects bind to every
// matching copy in the visible hand; classification is decided by the real
// command's source handles and the authoritative after-state, never by the
// recorded action's own cards. With multiple copies, USES_SUBJECT means the
// action declared at least one copy as a source; CONSUMES_SUBJECT_OTHER_WAY
// means a copy left the hand for graveyard/exile without being a declared
// source; SUBJECT_UNAVAILABLE_AFTER_ACTION means a copy is otherwise gone
// (swap, board, deck, opponent zones); PRESERVES_SUBJECT requires every tracked
// copy still in hand. Non-card subjects have no physical handles and classify
// only by action family/mode/timing involvement.
const rankSuit=identity=>{const m=/^([A-Z][A-Z0-9]*|[1-9]\d*)([♣♦♥♠])$/u.exec(identity);return m?{rank:m[1],suit:m[2]}:{rank:identity,suit:null};};
function subjectHandles(info,subject) {
  const hand=info.projection.own.hand;
  if(subject.startsWith('card:'))return hand.filter(c=>c.identity===subject.slice(5)).map(c=>c.id);
  if(subject.startsWith('rank:'))return hand.filter(c=>rankSuit(c.identity).rank===subject.slice(5)).map(c=>c.id);
  if(subject.startsWith('suit:'))return hand.filter(c=>rankSuit(c.identity).suit===subject.slice(5)).map(c=>c.id);
  return [];
}
function subjectDispositionV2(after,actorId,handles,action,subject) {
  if(handles.length) {
    if(handles.some(id=>(action.sourceHandles??[]).includes(id)))return 'USES_SUBJECT';
    if(handles.every(id=>after.players[actorId].hand.includes(id)))return 'PRESERVES_SUBJECT';
    if(handles.some(id=>['GY','EXILE'].includes(after.cards[id]?.zone)))return 'CONSUMES_SUBJECT_OTHER_WAY';
    return 'SUBJECT_UNAVAILABLE_AFTER_ACTION';
  }
  const [kind,...rest]=subject.split(':');
  const involved=(kind==='family'&&action.family===rest[0])
    ||(['mode','mechanic'].includes(kind)&&action.family===rest[0]&&action.mode===rest[1])
    ||(kind==='combination'&&action.family===rest[0])
    ||(kind==='timing'&&action.timingClass===rest[0]);
  return involved?'USES_SUBJECT':'DOES_NOT_INVOLVE_SUBJECT';
}
export async function executeInformationStudy({informationSet,plan,event,checkpoints,identity,authority,continueMatch,signal,onProgress=()=>{},resumeRows=[]}) {
  // Structured messages/IndexedDB reads lose Object.freeze. Snapshot and freeze
  // again so a caller or progress callback cannot alter an active experiment.
  informationSet=freezeArtifact(structuredClone(informationSet));plan=freezeArtifact(structuredClone(plan));
  event=freezeArtifact(structuredClone(event));checkpoints=freezeArtifact(structuredClone(checkpoints));identity=freezeArtifact(structuredClone(identity));
  const {frozen,worlds}=validateInformationPlan(plan,informationSet,event,checkpoints,identity,authority);
  const v2=(plan.schemaVersion??1)>=2,handles=v2?subjectHandles(informationSet,plan.requestedSubject):null;
  // Resume accepts only reproducible rows: replay each retained execution and
  // compare bytes. No untrusted supplied outcome is allowed to skip work.
  const rows=[],subjectIds=v2?null:informationSet.projection.own.hand.filter(c=>event.candidates.find(a=>a.actionId===event.selectedActionId).sourceCards.some(r=>r.identity===c.identity)).map(c=>c.id);
  let status=plan.worldManifest.rejected?'NON_CLEAN':'COMPLETE';
  const total=worlds.length*plan.seeds.length*plan.actionIds.length;
  outer:for(const world of worlds)for(const seed of plan.seeds)for(const actionId of plan.actionIds){
    await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted){status='CANCELLED';break outer;}
    const action=world.frame.policyActions.find(a=>a.actionId===actionId);
    let row={worldOrdinal:world.ordinal,worldHash:world.stateHash,seed,actionId,clean:false,score:null,disposition:null,winner:null,terminationReason:'EXECUTION_FAULT',finalStateHash:null,error:null};
    try{
      const applied=authority.execute(structuredClone(world.frame.state),world.frame.resolve(actionId));if(!applied.accepted)throw new Error('INFORMATION_ACTION_REJECTED');
      row.disposition=v2?subjectDispositionV2(applied.state,informationSet.actorId,handles,action,plan.requestedSubject):disposition(world.frame.state,applied.state,subjectIds,action);
      const result=await continueMatch({initialState:applied.state,seed,policyIds:frozen.map(c=>c.policyId),policyStates:frozen.map(c=>c.schemaVersion===2?c.policyState:null),profileId:plan.rulesProfile,decisionLimit:plan.decisionLimit,orchestrationCommandLimit:256,telemetryEnabled:false});
      const s=result.summary??result;row={...row,winner:s.winner,terminationReason:s.terminationReason,finalStateHash:s.finalStateHash,clean:CLEAN_ENDINGS.includes(s.terminationReason)&&['P1','P2','DRAW'].includes(s.winner)};
      row.score=row.clean?(s.winner==='DRAW'?.5:s.winner===event.actorId?1:0):null;
    }catch(error){row.error=error.message;}
    const prior=resumeRows.find(r=>r.worldOrdinal===row.worldOrdinal&&r.seed===seed&&r.actionId===actionId);
    if(prior&&strategyDigest(prior)!==strategyDigest(row))strategyFail('INFORMATION_RESUME_REPRODUCTION_MISMATCH');
    rows.push(row);onProgress({completed:rows.length,total});
  }
  if(strategyDigest(frozen)!==plan.checkpointDigest)strategyFail('INFORMATION_CHECKPOINT_MUTATED');
  if(signal?.aborted)status='CANCELLED';const faults=rows.filter(r=>!r.clean).length;if(faults&&status!=='CANCELLED')status='NON_CLEAN';
  if(resumeRows.some(p=>!rows.some(r=>strategyDigest(r)===strategyDigest(p))))strategyFail('INFORMATION_RESUME_UNKNOWN_ROWS');
  const infer=inferenceFor(plan);
  const comparisons=status==='COMPLETE'&&rows.length===total?plan.actionIds.filter(id=>id!==plan.actualActionId).map(actionId=>{
    const worldEffects=worlds.map(w=>({ordinal:w.ordinal,effect:mean(plan.seeds.map(seed=>rows.find(r=>r.worldOrdinal===w.ordinal&&r.actionId===actionId&&r.seed===seed).score-rows.find(r=>r.worldOrdinal===w.ordinal&&r.actionId===plan.actualActionId&&r.seed===seed).score))}));
    return {actionId,alternativeLabel:`${event.candidates.find(a=>a.actionId===actionId).family} · ${event.candidates.find(a=>a.actionId===actionId).mode}`,worldEffects,...infer(worldEffects.map(w=>w.effect),{alternatives:plan.actionIds.length-1,minimumMeaningfulEffect:plan.minimumMeaningfulEffect})};
  }):[];
  // Symmetric interpretation of the precommitted alternative-minus-reference
  // contrasts: an alternative may earn advice, or the reference may earn advice
  // over every tested alternative. The sign convention is never flipped.
  const assessment=informationStudyAssessment(comparisons);
  return sealStrategy('INFORMATION_SET_STUDY_V1',{schemaVersion:plan.schemaVersion??1,informationSet,plan,status,rows,comparisons,assessment,faults,counts:{hiddenWorlds:worlds.length,continuationsPerWorld:plan.seeds.length,actionBranches:plan.actionIds.length,plannedExecutions:total,executions:rows.length,cleanExecutions:rows.length-faults,faults},
    context:event.context,maturity:event.maturity,seat:event.seat,sourceIdentity:event.identity,sourceEventId:event.artifactId,opportunitySubjects:[...new Set(event.candidates.flatMap(c=>c.subjects))].sort(),informationScope:'ACTOR_AUTHORIZED',
    caveats:['Opening decision only; no midgame knowledge history is reconstructed.','Conditional on uniform unseen identity assignment and an independent fresh synthetic engine RNG stream; not the posterior of the original deal seed.','Frozen continuation policies, not optimal or human play.','Continuation seeds are nested repetitions; independent N is hidden worlds.','Pseudorandom worlds approximate independent sampling; bounds depend on the declared sampling model.','No optional stopping; any fault or rejected world prevents inference.']});
}
export function validateInformationStudy(study) {
  verifyStrategy(study,'INFORMATION_SET_STUDY_V1');validateInformationSet(study.informationSet);verifyStrategy(study.plan,'INFORMATION_SET_STUDY_PLAN_V1');verifyStrategy(study.plan.worldManifest,'INFORMATION_WORLD_MANIFEST_V1');
  if(study.plan.informationSetId!==study.informationSet.artifactId||study.plan.sourceEventId!==study.sourceEventId||study.informationScope!=='ACTOR_AUTHORIZED'||!['COMPLETE','NON_CLEAN','CANCELLED'].includes(study.status)||study.plan.fingerprint!==study.informationSet.fingerprint||study.plan.eraId!==study.informationSet.eraId||study.plan.rulesProfile!==study.informationSet.rulesProfile)strategyFail('INFORMATION_STUDY_SCHEMA');
  const p=study.plan,expected=p.worldManifest.accepted*p.actionIds.length*p.seeds.length;
  if(study.counts.hiddenWorlds!==p.worldManifest.accepted||study.counts.plannedExecutions!==expected||study.counts.executions!==study.rows.length||study.faults!==study.rows.filter(r=>!r.clean).length||study.counts.continuationsPerWorld!==p.seeds.length||study.counts.actionBranches!==p.actionIds.length||study.counts.cleanExecutions!==study.rows.length-study.faults||study.counts.faults!==study.faults)strategyFail('INFORMATION_STUDY_COUNTS');
  const keys=new Set();for(const r of study.rows){const k=JSON.stringify([r.worldOrdinal,r.seed,r.actionId]);if(keys.has(k)||!p.worldManifest.worlds.some(w=>w.ordinal===r.worldOrdinal&&w.stateHash===r.worldHash)||!p.seeds.includes(r.seed)||!p.actionIds.includes(r.actionId))strategyFail('INFORMATION_STUDY_ROWS');keys.add(k);}
  for(const r of study.rows){const clean=CLEAN_ENDINGS.includes(r.terminationReason)&&['P1','P2','DRAW'].includes(r.winner);if(r.clean!==clean||r.score!==(clean?(r.winner==='DRAW'?.5:r.winner===study.informationSet.actorId?1:0):null))strategyFail('INFORMATION_STUDY_SCORE_INVALID');}
  if(study.status!=='COMPLETE'){if(study.comparisons.length)strategyFail('INFORMATION_NON_CLEAN_INFERENCE');return study;}
  if(study.rows.length!==expected||study.faults||p.worldManifest.rejected)strategyFail('INFORMATION_INCOMPLETE_STUDY');
  const comparisons=p.actionIds.filter(id=>id!==p.actualActionId);
  if(study.comparisons.length!==comparisons.length)strategyFail('INFORMATION_STUDY_COMPARISONS');
  // The sealed plan's declared schema selects the recomputation. Historical
  // V1 plans keep Hoeffding, sealed V2 plans keep the V1 empirical-Bernstein
  // constant, and V3 plans use the range-corrected bound — forever.
  const infer=inferenceFor(p);
  for(const c of study.comparisons){if(!comparisons.includes(c.actionId))strategyFail('INFORMATION_STUDY_COMPARISONS');const effects=p.worldManifest.worlds.map(w=>({ordinal:w.ordinal,effect:mean(p.seeds.map(seed=>study.rows.find(r=>r.worldOrdinal===w.ordinal&&r.actionId===c.actionId&&r.seed===seed).score-study.rows.find(r=>r.worldOrdinal===w.ordinal&&r.actionId===p.actualActionId&&r.seed===seed).score))}));
    const {actionId:_a,alternativeLabel:_l,worldEffects,...inference}=c;if(strategyDigest(effects)!==strategyDigest(worldEffects)||strategyDigest(inference)!==strategyDigest(infer(effects.map(e=>e.effect),{alternatives:comparisons.length,minimumMeaningfulEffect:p.minimumMeaningfulEffect})))strategyFail('INFORMATION_INFERENCE_MISMATCH');}
  if(Object.hasOwn(study,'assessment')&&study.assessment!==informationStudyAssessment(study.comparisons))strategyFail('INFORMATION_ASSESSMENT_MISMATCH');
  return study;
}
export function claimsFromInformationStudy(study,{identity,eraId=identity.fingerprint,origin='LOCAL_REPRODUCTION',generatedAt=new Date().toISOString()}={}) {
  validateInformationStudy(study);
  if(study.status!=='COMPLETE')return [];
  const current=study.plan.fingerprint===identity.fingerprint&&study.plan.eraId===eraId&&eraId===identity.fingerprint&&origin==='LOCAL_REPRODUCTION';
  const v2=(study.plan.schemaVersion??1)>=2,subject=study.plan.question.subject,cardSubject=/^(card|rank|suit):/.test(subject);
  const reference=study.informationSet.legalActions.find(a=>a.actionId===study.plan.actualActionId);
  const referenceLabel=`${reference.family} · ${reference.mode}`,alternatives=study.plan.actionIds.filter(id=>id!==study.plan.actualActionId);
  const refKinds=v2?[...new Set(study.rows.filter(r=>r.actionId===study.plan.actualActionId).map(r=>r.disposition))]:null;
  const claims=study.comparisons.map(c=>{
    const qualifies=current&&c.qualifies;
    const kinds=[...new Set(study.rows.filter(r=>r.actionId===c.actionId).map(r=>r.disposition))];
    const recommendation=v2
      ?(qualifies?(cardSubject&&kinds.length===1&&kinds[0]==='USES_SUBJECT'?'PLAY':kinds.length===1&&kinds[0]==='PRESERVES_SUBJECT'?'PRESERVE':'PREFER_ALTERNATIVE'):'UNKNOWN')
      :(qualifies?(kinds.length===1&&kinds[0]==='PLAYED_OR_COMMITTED'?'PLAY':kinds.length===1&&kinds[0]==='PRESERVED_IN_HAND'?'HOLD':'PREFER_ALTERNATIVE'):'UNKNOWN');
    return sealStrategy('STRATEGY_CLAIM_V1',{schemaVersion:1,subject,scope:{fingerprint:study.plan.fingerprint,rulesProfile:study.plan.rulesProfile,eraId:study.plan.eraId,filters:{informationSetId:study.informationSet.artifactId}},evidenceType:'COUNTERFACTUAL',recommendation,estimatedMagnitude:c.delta,uncertainty:{interval:c.interval,method:study.plan.inferenceMethod},confidence:qualifies?'SUGGESTIVE':current?'EXPERIMENTAL':'INSUFFICIENT',informationScope:'ACTOR_AUTHORIZED',
      sampleSize:study.counts.hiddenWorlds,independentStateCount:study.counts.hiddenWorlds,opportunityCount:1,selectedCount:1,seedBlocks:study.plan.seeds.length,pairedCount:c.n,policies:[],checkpoints:study.plan.continuationCheckpointIds,matchups:[],provenance:[study.artifactId,...study.plan.provenance],generatedAt,caveats:study.caveats,stale:!current,invalidated:false,origin,
      statementData:{informationSetId:study.informationSet.artifactId,actionId:c.actionId,alternative:c.alternativeLabel,dispositions:kinds,heterogeneity:c.heterogeneity,hiddenWorlds:c.n,continuationsPerWorld:study.plan.seeds.length,minimumMeaningfulEffect:study.plan.minimumMeaningfulEffect,publicContext:study.informationSet.projection,
        ...(v2?{direction:'ALTERNATIVE',favoredDirection:c.favoredDirection,requestedSubject:subject,referenceActionId:study.plan.actualActionId,referenceLabel,referenceDispositions:refKinds,alternativeActionId:c.actionId,testedAlternatives:alternatives}:{})}});
  });
  // V1.1 symmetric reading: the frozen reference may also earn advice, but only
  // when it robustly dominates EVERY precommitted tested alternative. Advice is
  // stated against the tested set, never as global optimality.
  if(v2&&study.assessment==='REFERENCE_DOMINATES_ALL'){
    const lower=Math.min(...study.comparisons.map(c=>-c.interval[1])),upper=Math.max(...study.comparisons.map(c=>-c.interval[0]));
    const recommendation=current?(cardSubject&&refKinds.length===1&&refKinds[0]==='USES_SUBJECT'?'PLAY':refKinds.length===1&&refKinds[0]==='PRESERVES_SUBJECT'?'PRESERVE':'REFERENCE_PREFERRED'):'UNKNOWN';
    claims.push(sealStrategy('STRATEGY_CLAIM_V1',{schemaVersion:1,subject,scope:{fingerprint:study.plan.fingerprint,rulesProfile:study.plan.rulesProfile,eraId:study.plan.eraId,filters:{informationSetId:study.informationSet.artifactId}},evidenceType:'COUNTERFACTUAL',recommendation,estimatedMagnitude:lower,uncertainty:{interval:[lower,upper],method:study.plan.inferenceMethod},confidence:current?'SUGGESTIVE':'INSUFFICIENT',informationScope:'ACTOR_AUTHORIZED',
      sampleSize:study.counts.hiddenWorlds,independentStateCount:study.counts.hiddenWorlds,opportunityCount:1,selectedCount:1,seedBlocks:study.plan.seeds.length,pairedCount:study.comparisons[0].n,policies:[],checkpoints:study.plan.continuationCheckpointIds,matchups:[],provenance:[study.artifactId,...study.plan.provenance],generatedAt,caveats:study.caveats,stale:!current,invalidated:false,origin,
      statementData:{informationSetId:study.informationSet.artifactId,actionId:study.plan.actualActionId,alternative:`recorded play · ${referenceLabel}`,direction:'REFERENCE',requestedSubject:subject,referenceActionId:study.plan.actualActionId,referenceLabel,referenceDispositions:refKinds,dispositions:refKinds,testedAlternatives:alternatives,heterogeneity:'ROBUST',hiddenWorlds:study.comparisons[0].n,continuationsPerWorld:study.plan.seeds.length,minimumMeaningfulEffect:study.plan.minimumMeaningfulEffect,publicContext:study.informationSet.projection}}));
  }
  return claims;
}
