import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSimulationState, createSimulationDecisionFrame, executeSimulationAction, strictPolicyView } from '@intrilex/engine-adapter';
import { evolutionIdentity, runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { validateCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { strategyDigest, sealStrategy } from '../packages/simulation-runtime/src/strategy-contracts.mjs';
import { strategyBundle, validateStrategyBundle } from '../packages/simulation-runtime/src/strategy-evidence.mjs';
import { validateStrategyClaim, synthesizeStrategyClaim } from '../packages/simulation-runtime/src/strategy-analysis.mjs';
import { claimFromStrategyBranch } from '../packages/simulation-runtime/src/strategy-branch.mjs';
import { createInformationSet, validateInformationSet, informationEquivalent, sampleInformationWorlds, validateInformationWorld, reconstructInformationWorld, prepareInformationStudy, executeInformationStudy, inferWorldEffects, inferWorldEffectsV2, informationStudyAssessment, informationResolution, approximateWorldsForEffect, claimsFromInformationStudy, validateInformationStudy, INFORMATION_INFERENCE, INFORMATION_INFERENCE_V2 } from '../packages/simulation-runtime/src/strategy-information.mjs';

const authority={createState:createSimulationState,frame:s=>createSimulationDecisionFrame(s,256),execute:executeSimulationAction,view:strictPolicyView,validateCheckpoint};
const identity=await evolutionIdentity();
const {run}=await runLabSeries({botA:'value',botB:'tempo',gameCount:2,seed:1337,workerCount:1,strategicTrace:true,kind:'EVALUATION',mirrorSeats:true},{identity,createdAt:'2026-10-04T18:00:00.000Z'});
const event=run.records[0].strategyDecisions[0],replay=run.replays[0].replay;
const source=authority.frame(authority.createState({profileId:event.identity.rulesProfile,playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],seed:event.identity.derivedSeed})).state;
const options={identity,authority},info=createInformationSet({state:source,...options});
const input={event,replay,identity,authority,checkpoints:run.checkpoints,worldCount:4,seeds:[101,102]};
const prepared=prepareInformationStudy(input),start=performance.now(),study=await executeInformationStudy({...input,...prepared,continueMatch:runPolicyMatch}),elapsedMs=performance.now()-start;
const claims=claimsFromInformationStudy(study,{identity,generatedAt:'2026-10-04T18:00:00.000Z'});
function reseal(a,change){const {contract,artifactId:_id,...body}=structuredClone(a);change(body);return sealStrategy(contract,body);}
const hiddenB=structuredClone(source);[hiddenB.cards['CORE-006'].identity,hiddenB.cards['CORE-015'].identity]=[hiddenB.cards['CORE-015'].identity,hiddenB.cards['CORE-006'].identity];[hiddenB.cards['CORE-012'].identity,hiddenB.cards['CORE-016'].identity]=[hiddenB.cards['CORE-016'].identity,hiddenB.cards['CORE-012'].identity];hiddenB.rng.seed=123456;hiddenB.rng.cursor=777;
const infoB=createInformationSet({state:hiddenB,...options});

test('different hidden hands, draw order, Swap Bar and RNG produce one information set',()=>{assert.notEqual(strategyDigest(source),strategyDigest(hiddenB));assert.equal(info.artifactId,infoB.artifactId);assert.ok(informationEquivalent(source,hiddenB,options));});
test('visible identity changes produce another information set',()=>{const b=structuredClone(source);[b.cards['CORE-001'].identity,b.cards['CORE-006'].identity]=[b.cards['CORE-006'].identity,b.cards['CORE-001'].identity];assert.notEqual(info.artifactId,createInformationSet({state:b,...options}).artifactId);});
test('sealed information contains six known identities, no hidden engine state or source hashes',()=>{assert.equal(Object.keys(info.projection.knownCards).length,6);assert.equal(info.projection.opponents[0].handCount,6);for(const key of ['rng','seed','derivedSeed','stateHash','sourceState','initialState','cards'])assert.equal(Object.hasOwn(info,key),false);assert.equal(info.knowledge.rememberedCards.length,0);});
test('information checksum tampering fails',()=>assert.throws(()=>validateInformationSet({...info,seat:2}),/DIGEST/));
test('resealed hidden fields fail schema',()=>{assert.throws(()=>validateInformationSet(reseal(info,b=>{b.projection.rng=42;})),/PROJECTION_SCHEMA/);assert.throws(()=>validateInformationSet(reseal(info,b=>{b.projection.own.hand[0].secret=true;})),/CARD_SCHEMA/);});
test('anti-leakage: identical inputs yield byte-identical ensemble from different privileged truth',()=>{const a=sampleInformationWorlds(info,{authority,seed:88,count:6}),b=sampleInformationWorlds(infoB,{authority,seed:88,count:6});assert.deepEqual(a.manifest,b.manifest);assert.deepEqual(a.worlds.map(w=>w.frame.state),b.worlds.map(w=>w.frame.state));});
test('sampler changes with predeclared seed and produces distinct complete worlds',()=>{const a=sampleInformationWorlds(info,{authority,count:4,seed:5}),b=sampleInformationWorlds(info,{authority,count:4,seed:6});assert.notEqual(a.manifest.artifactId,b.manifest.artifactId);assert.equal(new Set(a.worlds.map(w=>w.stateHash)).size,4);assert.equal(a.manifest.rejected,0);});
test('worlds conserve all 54 identities, visible cards and exact action IDs',()=>{const original=Object.values(source.cards).map(c=>c.identity).sort();for(const w of sampleInformationWorlds(info,{authority,count:4}).worlds){assert.deepEqual(Object.values(w.frame.state.cards).map(c=>c.identity).sort(),original);assert.equal(new Set(Object.values(w.frame.state.cards).map(c=>c.identity)).size,54);for(const [id,c] of Object.entries(info.projection.knownCards))assert.equal(w.frame.state.cards[id].identity,c.identity);assert.deepEqual(w.frame.policyActions.map(a=>a.actionId).sort(),info.legalActions.map(a=>a.actionId).sort());}});
test('invalid source allocation fails instead of healing hidden duplicates',()=>{const b=structuredClone(source);b.cards['CORE-006'].identity=b.cards['CORE-007'].identity;assert.throws(()=>createInformationSet({state:b,...options}),/SOURCE_CARD_CONSERVATION/);});
test('midgame and hidden marker extensions fail closed',()=>{for(const change of [s=>{s.fullTurnSequence=2;},s=>{s.cards['CORE-006'].state.revealedUntil={playerId:'P2',startSequence:2};},s=>{s.metadata.secretQueue=['CORE-015'];},s=>{s.cards['CORE-012'].state.faceDownTrap=true;}]){const s=structuredClone(source);change(s);assert.throws(()=>createInformationSet({state:s,...options}),/SAMPLING_UNAVAILABLE/);}});
test('unsupported actor and modules fail closed',()=>{assert.throws(()=>createInformationSet({state:source,...options,actorId:'P2'}),/SAMPLING_UNAVAILABLE/);const s=structuredClone(source);s.metadata.coreAuthority.profileId='first-contact-trigger-closure';assert.throws(()=>createInformationSet({state:s,...options}),/SAMPLING_UNAVAILABLE/);});
test('world validation rejects changed known cards and illegal vault',()=>{const w=reconstructInformationWorld(info,{authority,seed:5,ordinal:0}),universe=Object.values(source.cards).map(c=>c.identity).sort();const bad=structuredClone(w.frame.state);[bad.cards['CORE-001'].identity,bad.cards['CORE-006'].identity]=[bad.cards['CORE-006'].identity,bad.cards['CORE-001'].identity];assert.throws(()=>validateInformationWorld(info,authority.frame(bad),authority,universe),/PROJECTION_MISMATCH/);assert.throws(()=>validateInformationWorld(info,{...w.frame,policyActions:w.frame.policyActions.slice(1)},authority,universe),/LEGAL_MISMATCH/);});
test('rejection manifests preserve every failed ordinal without replacement',()=>{const bad=reseal(info,b=>{b.knowledge.structuralCertificate='bad';}),sample=sampleInformationWorlds(bad,{authority,count:3});assert.equal(sample.manifest.accepted,0);assert.equal(sample.manifest.rejected,3);assert.deepEqual(sample.manifest.rejections.map(r=>r.ordinal),[0,1,2]);});
test('invalid sampler counts and seeds rejected',()=>{for(const count of [0,513,1.5])assert.throws(()=>sampleInformationWorlds(info,{authority,count}),/BUDGET/);assert.throws(()=>reconstructInformationWorld(info,{authority,seed:0,ordinal:0}),/CATALOG/);});
test('frozen plan precedes outcomes and binds entire accepted manifest',()=>{assert.equal(prepared.plan.contract,'INFORMATION_SET_STUDY_PLAN_V1');assert.equal(prepared.plan.schemaVersion,2);assert.equal(Object.hasOwn(prepared.plan,'rows'),false);assert.equal(prepared.plan.worldManifest.accepted,4);assert.equal(prepared.plan.informationSetId,prepared.informationSet.artifactId);assert.equal(prepared.plan.fixedBudget,true);});
test('requested subject binds the study question, not the recorded action',()=>{
  // The recorded action is a phase action; rank:2 is a legal opportunity
  // belonging to different candidates. A study launched from the rank:2 page
  // must keep rank:2 as its question subject.
  const sel=event.candidates.find(c=>c.actionId===event.selectedActionId),foreign=event.candidates.flatMap(c=>c.subjects).find(s=>s.startsWith('rank:')&&!sel.subjects.includes(s));
  assert.ok(foreign,'fixture requires a legal rank subject not on the recorded action');
  const p=prepareInformationStudy({...input,requestedSubject:foreign});
  assert.equal(p.plan.requestedSubject,foreign);assert.equal(p.plan.question.subject,foreign);
  assert.equal(p.plan.referenceActionId,event.selectedActionId);assert.equal(p.plan.actualActionId,event.selectedActionId);
  assert.notEqual(p.plan.question.subject,sel.subjects[0]);
});
test('requested subject must be a legal opportunity in this information set',()=>{
  for(const bad of ['rank:3','family:draw','card:9♣','rank:2 '])assert.throws(()=>prepareInformationStudy({...input,requestedSubject:bad}),/INFORMATION_REQUESTED_SUBJECT_NOT_LEGAL/);
});
test('requested subject cannot be rebound after plan seal',async()=>{
  const p=prepareInformationStudy({...input,requestedSubject:'rank:2'});
  await assert.rejects(executeInformationStudy({...input,...p,plan:reseal(p.plan,plan=>{plan.requestedSubject='family:phase';}),continueMatch:runPolicyMatch}),/INFORMATION_REQUESTED_SUBJECT_INVALID|FROZEN_FIELDS/);
  await assert.rejects(executeInformationStudy({...input,...p,plan:reseal(p.plan,plan=>{plan.referenceActionId=plan.actionIds[1];}),continueMatch:runPolicyMatch}),/INFORMATION_REQUESTED_SUBJECT_INVALID|FROZEN_FIELDS/);
});
test('subject disposition classifies against the requested subject from real before/after state',async()=>{
  const p=prepareInformationStudy({...input,requestedSubject:'rank:2'}),s=await executeInformationStudy({...input,...p,continueMatch:runPolicyMatch});
  const swap2=p.plan.actionIds.find(id=>id!==p.plan.actualActionId&&event.candidates.find(c=>c.actionId===id).sourceCards.some(c=>c.identity.startsWith('2')));
  assert.ok(s.rows.filter(r=>r.actionId===p.plan.actualActionId).every(r=>r.disposition==='PRESERVES_SUBJECT'),'phase action leaves every 2 in hand');
  if(swap2)assert.ok(s.rows.filter(r=>r.actionId===swap2).every(r=>r.disposition==='USES_SUBJECT'),'swapping a 2 uses the requested rank');
});
test('real matched execution covers every world/action/common-seed cell once',()=>{assert.equal(study.status,'COMPLETE');assert.equal(study.rows.length,4*2*prepared.plan.actionIds.length);for(const world of study.plan.worldManifest.worlds){const rows=study.rows.filter(r=>r.worldOrdinal===world.ordinal);assert.deepEqual([...new Set(rows.map(r=>r.worldHash))],[world.stateHash]);for(const id of study.plan.actionIds)assert.deepEqual(rows.filter(r=>r.actionId===id).map(r=>r.seed),study.plan.seeds);}validateInformationStudy(study);});
test('independent N is worlds, not continuation games',()=>{for(const c of study.comparisons){assert.equal(c.n,4);assert.equal(c.worldEffects.length,4);}for(const c of claims){assert.equal(c.independentStateCount,4);assert.equal(c.sampleSize,4);assert.equal(c.statementData.continuationsPerWorld,2);}});
test('same frozen plan deterministically reproduces real continuations',async()=>{const again=await executeInformationStudy({...input,...prepared,continueMatch:runPolicyMatch});assert.deepEqual(again,study);});
test('resume revalidates retained executions under same immutable plan',async()=>{const again=await executeInformationStudy({...input,...prepared,continueMatch:runPolicyMatch,resumeRows:study.rows.slice(0,2)});assert.deepEqual(again,study);});
test('resume altered retained outcomes rejected',async()=>{await assert.rejects(executeInformationStudy({...input,...prepared,continueMatch:runPolicyMatch,resumeRows:[{...study.rows[0],score:99}]}),/RESUME_REPRODUCTION/);});
test('plan identity and method tampering rejected even after resealing',async()=>{for(const change of [p=>{p.inferenceMethod='T_UNPLANNED';},p=>{p.eraId='old';},p=>{p.worldManifest.worlds[0].stateHash='fake';},p=>{p.actionIds=['hold',p.actualActionId];}])await assert.rejects(executeInformationStudy({...input,...prepared,plan:reseal(prepared.plan,change),continueMatch:runPolicyMatch}),/METHOD_MISMATCH|IDENTITY_MISMATCH|MANIFEST_MISMATCH|ILLEGAL_BRANCH/);});
test('cancellation produces no successful inference or claims',async()=>{const controller=new AbortController();controller.abort();const s=await executeInformationStudy({...input,...prepared,signal:controller.signal,continueMatch:runPolicyMatch});assert.equal(s.status,'CANCELLED');assert.equal(s.rows.length,0);assert.deepEqual(s.comparisons,[]);assert.deepEqual(claimsFromInformationStudy(s,{identity}),[]);});
test('continuation faults remain rows and invalidate all comparisons',async()=>{const s=await executeInformationStudy({...input,...prepared,continueMatch:()=>{throw new Error('TEST_FAULT');}});assert.equal(s.status,'NON_CLEAN');assert.equal(s.faults,s.counts.plannedExecutions);assert.ok(s.rows.every(r=>r.error==='TEST_FAULT'));assert.deepEqual(s.comparisons,[]);validateInformationStudy(s);});
test('censored terminal budget remains explicit and non-clean',async()=>{const s=await executeInformationStudy({...input,...prepared,continueMatch:()=>({winner:null,terminationReason:'DECISION_LIMIT',finalStateHash:'test'})});assert.equal(s.status,'NON_CLEAN');assert.ok(s.rows.every(r=>r.score===null));});
test('positive fixture earns bounded positive effect',()=>{const r=inferWorldEffects(Array(128).fill(1));assert.ok(r.interval[0]>.05);assert.equal(r.qualifies,true);assert.equal(r.heterogeneity,'ROBUST');});
test('null fixture remains unknown despite zero empirical variance',()=>{const r=inferWorldEffects(Array(128).fill(0));assert.equal(r.delta,0);assert.ok(r.interval[0]<0&&r.interval[1]>0);assert.equal(r.qualifies,false);});
test('negative fixture reports negative effect without alternative advice',()=>{const r=inferWorldEffects(Array(128).fill(-1));assert.ok(r.interval[1]<0);assert.equal(r.qualifies,false);});
test('reversal fixture is volatile with downside and dispersion',()=>{const r=inferWorldEffects([...Array(64).fill(1),...Array(64).fill(-1)]);assert.equal(r.heterogeneity,'VOLATILE');assert.equal(r.signReversals,true);assert.equal(r.worstQuartile,-1);assert.equal(r.dispersion,1);assert.equal(r.positiveFraction,.5);});
test('multiplicity broadens familywise uncertainty',()=>{const a=inferWorldEffects(Array(64).fill(.5),{alternatives:1}),b=inferWorldEffects(Array(64).fill(.5),{alternatives:4});assert.ok(b.interval[0]<a.interval[0]);assert.ok(b.interval[1]>a.interval[1]);});
test('one world has no inferential interval',()=>{assert.equal(inferWorldEffects([1]).interval,null);assert.equal(inferWorldEffects([1]).qualifies,false);assert.equal(inferWorldEffects([]).n,0);});
test('heterogeneity threshold boundaries mechanically enforced',()=>{assert.equal(inferWorldEffects([...Array(75).fill(1),...Array(25).fill(0)]).heterogeneity,'ROBUST');assert.equal(inferWorldEffects([...Array(74).fill(1),...Array(26).fill(0)]).heterogeneity,'UNRESOLVED');assert.equal(inferWorldEffects([...Array(20).fill(1),...Array(20).fill(-1),...Array(60).fill(0)]).heterogeneity,'VOLATILE');});
test('invalid effects and family sizes rejected',()=>{assert.throws(()=>inferWorldEffects([NaN]),/EFFECTS_INVALID/);assert.throws(()=>inferWorldEffects([2]),/EFFECTS_INVALID/);assert.throws(()=>inferWorldEffects([1],{alternatives:0}),/EFFECTS_INVALID/);});
test('real opening claims stay actor-authorized and do not manufacture recommendation',()=>{assert.ok(claims.length);for(const c of claims){validateStrategyClaim(c);assert.equal(c.informationScope,'ACTOR_AUTHORIZED');assert.equal(c.confidence,'EXPERIMENTAL');assert.equal(c.recommendation,'UNKNOWN');assert.match(synthesizeStrategyClaim(c),/compatible hidden worlds/);}});
test('historical imported and cross-era results fail actionable confidence',()=>{for(const args of [{identity,origin:'IMPORTED_UNVERIFIED'},{identity:{fingerprint:'old'}},{identity,eraId:'another-era'}])for(const c of claimsFromInformationStudy(study,args)){assert.equal(c.confidence,'INSUFFICIENT');assert.equal(c.recommendation,'UNKNOWN');}});
test('rehashed result score or uncertainty forgery rejected',()=>{assert.throws(()=>validateInformationStudy(reseal(study,s=>{s.rows[0].score=99;})),/SCORE_INVALID/);assert.throws(()=>validateInformationStudy(reseal(study,s=>{s.comparisons[0].interval=[.1,.9];})),/INFERENCE_MISMATCH/);});
test('existing exact-state claims remain permanently research-only',()=>{const s=sealStrategy('STRATEGY_BRANCH_V1',{status:'COMPLETE',comparisons:[{actionId:'a',alternativeLabel:'test',delta:1,interval:[.5,1],pairedCount:128}],subject:['family:phase'],plan:{fingerprint:identity.fingerprint,rulesProfile:event.identity.rulesProfile,eraId:identity.fingerprint,seeds:[1,2],continuationCheckpointIds:[]},rows:[],sourceEventId:event.artifactId,caveats:[]});const c=claimFromStrategyBranch(s)[0];assert.equal(c.recommendation,'UNKNOWN');assert.equal(c.informationScope,'RESEARCH_ONLY');validateStrategyClaim(c);});
test('V2 bundles seal information artifacts and retain V1 compatibility',()=>{const b=strategyBundle({evidence:[],informationSets:[prepared.informationSet],informationPlans:[prepared.plan],informationStudies:[study],claims});assert.equal(b.contract,'STRATEGY_BUNDLE_V2');assert.deepEqual(validateStrategyBundle(b),b);assert.equal(validateStrategyBundle(strategyBundle({evidence:[]})).contract,'STRATEGY_BUNDLE_V1');});

// Synthetic terminal scores exercise the gate and UI; they are never evidence of
// an Intrilex discovery. Worlds remain real sampled authority states.
const syntheticWorlds=sampleInformationWorlds(prepared.informationSet,{authority,count:128,seed:1337});
const syntheticPlan=reseal(prepared.plan,p=>{p.worldManifest=syntheticWorlds.manifest;p.provenance=[event.artifactId,prepared.informationSet.artifactId,syntheticWorlds.manifest.artifactId];});
const syntheticRows=syntheticWorlds.worlds.flatMap(w=>syntheticPlan.seeds.flatMap(seed=>syntheticPlan.actionIds.map(actionId=>({worldOrdinal:w.ordinal,worldHash:w.stateHash,seed,actionId,clean:true,score:actionId===syntheticPlan.actualActionId?0:1,disposition:'DOES_NOT_INVOLVE_SUBJECT',winner:actionId===syntheticPlan.actualActionId?'P2':'P1',terminationReason:'NORMAL_VICTORY',finalStateHash:'SYNTHETIC_TEST_FIXTURE',error:null}))));
const synthetic=reseal(study,s=>{s.plan=syntheticPlan;s.schemaVersion=2;s.rows=syntheticRows;s.counts={hiddenWorlds:128,continuationsPerWorld:2,actionBranches:syntheticPlan.actionIds.length,plannedExecutions:syntheticRows.length,executions:syntheticRows.length,cleanExecutions:syntheticRows.length,faults:0};s.comparisons=syntheticPlan.actionIds.filter(id=>id!==syntheticPlan.actualActionId).map(actionId=>({actionId,alternativeLabel:'SYNTHETIC ACCEPTANCE FIXTURE',worldEffects:syntheticWorlds.worlds.map(w=>({ordinal:w.ordinal,effect:1})),...inferWorldEffectsV2(Array(128).fill(1),{alternatives:syntheticPlan.actionIds.length-1})}));s.assessment=informationStudyAssessment(s.comparisons);s.caveats=['SYNTHETIC ACCEPTANCE FIXTURE: engineered scores, not real strategy evidence.'];});
test('synthetic positive controlled fixture earns Suggestive without Strong or fake hold',()=>{const result=claimsFromInformationStudy(synthetic,{identity});assert.equal(result.length,2);for(const c of result){assert.equal(c.confidence,'SUGGESTIVE');assert.equal(c.recommendation,'PREFER_ALTERNATIVE');validateStrategyClaim(c);assert.match(synthesizeStrategyClaim(c),/^Prefer .+ over/);}});
test('imported positive fixture cannot issue advice',()=>{for(const c of claimsFromInformationStudy(synthetic,{identity,origin:'IMPORTED_UNVERIFIED'})){assert.equal(c.confidence,'INSUFFICIENT');assert.equal(c.recommendation,'UNKNOWN');}});
test('frozen reference and question cannot change after plan seal',async()=>{for(const change of [p=>{p.actualActionId=p.actionIds[1];},p=>{p.question.subject='rank:3';},p=>{p.optionalStopping=true;}])await assert.rejects(executeInformationStudy({...input,...prepared,plan:reseal(prepared.plan,change),continueMatch:runPolicyMatch}),/FROZEN_FIELDS/);});
test('changed controlled claim origin cannot retain recommendation',()=>{const c=claimsFromInformationStudy(synthetic,{identity})[0];assert.throws(()=>validateStrategyClaim(reseal(c,b=>{b.origin='IMPORTED_UNVERIFIED';})),/INFORMATION_ADVICE_REJECTED/);});
test('real opening card swap distinguishes unavailable source from legal preservation',async()=>{
  const {run:cardRun}=await runLabSeries({botA:'random-legal',botB:'value',gameCount:2,seed:1,workerCount:1,strategicTrace:true,kind:'EVALUATION',mirrorSeats:true},{identity,createdAt:'2026-10-04T18:00:00.000Z'}),cardEvent=cardRun.records[0].strategyDecisions[0],candidate=cardEvent.candidates.find(c=>c.actionId===cardEvent.selectedActionId),preserve=cardEvent.candidates.find(c=>c.family==='phase');
  assert.equal(candidate.sourceCards.length,1);
  const args={event:cardEvent,replay:cardRun.replays[0].replay,checkpoints:cardRun.checkpoints,identity,authority,worldCount:2,actionIds:[cardEvent.selectedActionId,preserve.actionId]},p=prepareInformationStudy(args),s=await executeInformationStudy({...args,...p,continueMatch:runPolicyMatch});
  assert.ok(s.rows.filter(r=>r.actionId===cardEvent.selectedActionId).every(r=>r.disposition==='USES_SUBJECT'));
  assert.ok(s.rows.filter(r=>r.actionId===preserve.actionId).every(r=>r.disposition==='PRESERVES_SUBJECT'));
});
test('preserve prose names the tracked card rather than calling the alternative a card',()=>{const claim=claimsFromInformationStudy(synthetic,{identity})[0],held=reseal(claim,c=>{c.recommendation='HOLD';c.subject='card:K♥';c.statementData.dispositions=['PRESERVED_IN_HAND'];});assert.match(synthesizeStrategyClaim(held),/Usually preserve K♥/);});

// V1.1 symmetric-inference fixtures. Engineered scores remain synthetic: they
// exercise the symmetric gate and claim direction, never real strategy evidence.
const localMean=v=>v.reduce((a,b)=>a+b,0)/v.length;
function syntheticV2(scoresByAction,{worlds=64,refDisposition='DOES_NOT_INVOLVE_SUBJECT',altDispositions={},requestedSubject}={}){
  const base=requestedSubject?prepareInformationStudy({...input,requestedSubject}):prepared,sample=sampleInformationWorlds(base.informationSet,{authority,count:worlds,seed:1337});
  const plan=reseal(base.plan,p=>{p.worldManifest=sample.manifest;p.provenance=[event.artifactId,base.informationSet.artifactId,sample.manifest.artifactId];});
  const rows=sample.worlds.flatMap(w=>plan.seeds.flatMap(seed=>plan.actionIds.map(actionId=>{const score=scoresByAction(actionId,{seed,worldOrdinal:w.ordinal,referenceId:plan.actualActionId});return {worldOrdinal:w.ordinal,worldHash:w.stateHash,seed,actionId,clean:true,score,disposition:actionId===plan.actualActionId?refDisposition:(altDispositions[actionId]??'DOES_NOT_INVOLVE_SUBJECT'),winner:score===1?'P1':score===0?'P2':'DRAW',terminationReason:'NORMAL_VICTORY',finalStateHash:'SYNTHETIC_TEST_FIXTURE',error:null};})));
  const comparisons=plan.actionIds.filter(id=>id!==plan.actualActionId).map(actionId=>{const worldEffects=sample.worlds.map(w=>({ordinal:w.ordinal,effect:localMean(plan.seeds.map(seed=>scoresByAction(actionId,{seed,worldOrdinal:w.ordinal,referenceId:plan.actualActionId})-scoresByAction(plan.actualActionId,{seed,worldOrdinal:w.ordinal,referenceId:plan.actualActionId})))}));return {actionId,alternativeLabel:'SYNTHETIC ACCEPTANCE FIXTURE',worldEffects,...inferWorldEffectsV2(worldEffects.map(e=>e.effect),{alternatives:plan.actionIds.length-1,minimumMeaningfulEffect:plan.minimumMeaningfulEffect})};});
  return reseal(study,s=>{s.plan=plan;s.schemaVersion=2;s.rows=rows;s.comparisons=comparisons;s.assessment=informationStudyAssessment(comparisons);s.counts={hiddenWorlds:worlds,continuationsPerWorld:plan.seeds.length,actionBranches:plan.actionIds.length,plannedExecutions:rows.length,executions:rows.length,cleanExecutions:rows.length,faults:0};s.caveats=['SYNTHETIC ACCEPTANCE FIXTURE: engineered scores, not real strategy evidence.'];});
}
test('symmetric: every alternative winning earns alternative advice, not reference praise',()=>{
  const s=syntheticV2(id=>id===prepared.plan.actualActionId?0:1);validateInformationStudy(s);assert.equal(s.assessment,'ALTERNATIVE_DOMINATES');
  const result=claimsFromInformationStudy(s,{identity});assert.equal(result.length,s.comparisons.length);
  for(const c of result){assert.equal(c.confidence,'SUGGESTIVE');assert.equal(c.recommendation,'PREFER_ALTERNATIVE');assert.equal(c.statementData.direction,'ALTERNATIVE');assert.equal(c.statementData.requestedSubject,s.plan.requestedSubject);assert.equal(c.statementData.referenceActionId,s.plan.actualActionId);validateStrategyClaim(c);}
});
test('symmetric: reference dominating every tested alternative earns reference advice',()=>{
  const s=syntheticV2(id=>id===prepared.plan.actualActionId?1:0);validateInformationStudy(s);assert.equal(s.assessment,'REFERENCE_DOMINATES_ALL');
  const result=claimsFromInformationStudy(s,{identity});assert.equal(result.length,s.comparisons.length+1);
  const ref=result.find(c=>c.statementData.direction==='REFERENCE');assert.ok(ref);assert.equal(ref.confidence,'SUGGESTIVE');assert.equal(ref.recommendation,'REFERENCE_PREFERRED');assert.ok(ref.estimatedMagnitude>.05);validateStrategyClaim(ref);
  for(const c of result.filter(c=>c!==ref))assert.equal(c.recommendation,'UNKNOWN');
});
test('symmetric: reference winning one comparison but losing another earns no reference advice',()=>{
  const ref=prepared.plan.actualActionId,alts=prepared.plan.actionIds.filter(id=>id!==ref);
  const s=syntheticV2(id=>id===ref?.5:id===alts[0]?0:1);assert.equal(s.assessment,'MIXED_DIRECTIONS');
  const result=claimsFromInformationStudy(s,{identity});assert.equal(result.length,s.comparisons.length);assert.ok(!result.some(c=>c.statementData.direction==='REFERENCE'));
  assert.equal(result.find(c=>c.statementData.alternativeActionId===alts[1]).recommendation,'PREFER_ALTERNATIVE');
});
test('symmetric: one alternative winning and one tied stays alternative advice only',()=>{
  const ref=prepared.plan.actualActionId,alts=prepared.plan.actionIds.filter(id=>id!==ref);
  const s=syntheticV2(id=>id===ref?.5:id===alts[0]?1:.5);assert.equal(s.assessment,'ALTERNATIVE_DOMINATES');
  const result=claimsFromInformationStudy(s,{identity});assert.ok(!result.some(c=>c.statementData.direction==='REFERENCE'));
  assert.equal(result.filter(c=>c.confidence==='SUGGESTIVE').length,1);
});
test('symmetric: sign-reversing hidden worlds cannot support either direction',()=>{
  const ref=prepared.plan.actualActionId;
  const s=syntheticV2((id,{worldOrdinal})=>id===ref?.5:(worldOrdinal%2?0:1));assert.equal(s.assessment,'UNRESOLVED');
  for(const c of claimsFromInformationStudy(s,{identity})){assert.equal(c.recommendation,'UNKNOWN');assert.equal(c.confidence,'EXPERIMENTAL');assert.equal(c.statementData.heterogeneity,'VOLATILE');}
});
test('recorded action using the requested card can earn PLAY when it dominates',()=>{
  const s=syntheticV2((id,{referenceId})=>id===referenceId?1:0,{requestedSubject:'rank:2',refDisposition:'USES_SUBJECT'});
  const ref=claimsFromInformationStudy(s,{identity}).find(c=>c.statementData.direction==='REFERENCE');
  assert.equal(s.assessment,'REFERENCE_DOMINATES_ALL');assert.equal(ref.recommendation,'PLAY');validateStrategyClaim(ref);assert.match(synthesizeStrategyClaim(ref),/Usually play 2 here/);
});
test('recorded action preserving the requested card can earn PRESERVE when it dominates',()=>{
  const s=syntheticV2((id,{referenceId})=>id===referenceId?1:0,{requestedSubject:'rank:2',refDisposition:'PRESERVES_SUBJECT'});
  const ref=claimsFromInformationStudy(s,{identity}).find(c=>c.statementData.direction==='REFERENCE');
  assert.equal(ref.recommendation,'PRESERVE');assert.match(synthesizeStrategyClaim(ref),/Usually preserve 2 here/);
});
test('winning alternative unrelated to the requested subject names the reference use, not a fake card',()=>{
  const s=syntheticV2((id,{referenceId})=>id===referenceId?0:1,{requestedSubject:'rank:2',refDisposition:'USES_SUBJECT'});
  const c=claimsFromInformationStudy(s,{identity})[0];assert.equal(c.recommendation,'PREFER_ALTERNATIVE');assert.match(synthesizeStrategyClaim(c),/over using 2 in this opening/);
});
test('imported symmetric reference claim cannot retain advice',()=>{
  const s=syntheticV2((id,{referenceId})=>id===referenceId?1:0),ref=claimsFromInformationStudy(s,{identity,origin:'IMPORTED_UNVERIFIED'}).find(c=>c.statementData.direction==='REFERENCE');
  assert.equal(ref.confidence,'INSUFFICIENT');assert.equal(ref.recommendation,'UNKNOWN');validateStrategyClaim(ref);
});
test('historical V1 plans keep Hoeffding semantics and V1 dispositions',async()=>{
  const v1=reseal(prepared.plan,p=>{delete p.schemaVersion;delete p.requestedSubject;delete p.referenceActionId;p.inferenceMethod=INFORMATION_INFERENCE;});
  const s=await executeInformationStudy({...input,plan:v1,informationSet:prepared.informationSet,continueMatch:runPolicyMatch});
  assert.equal(s.plan.inferenceMethod,INFORMATION_INFERENCE);assert.ok(!Object.hasOwn(s.plan,'requestedSubject'));
  assert.ok(s.rows.every(r=>['PLAYED_OR_COMMITTED','PRESERVED_IN_HAND','CONSUMED_OTHER_WAY','UNAVAILABLE_OTHER_WAY'].includes(r.disposition)));
  assert.ok(s.comparisons.every(c=>c.method===INFORMATION_INFERENCE));validateInformationStudy(s);
  assert.ok(!s.comparisons.some(c=>Object.hasOwn(c,'referenceDominates')));
});
test('V2 empirical Bernstein keeps a documented floor at zero variance',()=>{
  for(const n of [32,64,128,256,512]){const r=inferWorldEffectsV2(Array(n).fill(.1),{alternatives:2});const log=Math.log(3*2/.05);assert.ok(r.interval[1]-r.interval[0]>=6*log/n-1e-9,`n=${n}`);assert.ok(r.interval[0]<r.interval[1]);}
});
test('V2 zero-variance positive effects characterize, not certify, at small N',()=>{
  assert.equal(inferWorldEffectsV2(Array(64).fill(.1),{alternatives:2}).qualifies,false);
  assert.equal(inferWorldEffectsV2(Array(512).fill(.1),{alternatives:2}).qualifies,true);
  assert.equal(inferWorldEffectsV2(Array(512).fill(0),{alternatives:2}).qualifies,false);
});
test('V2 interval tightens with variance below worst case and never exceeds Hoeffding behavior',()=>{
  const a=inferWorldEffectsV2([...Array(96).fill(.2),...Array(32).fill(-.1)],{alternatives:2}),h=inferWorldEffects([...Array(96).fill(.2),...Array(32).fill(-.1)],{alternatives:2});
  assert.ok(a.interval[1]-a.interval[0]<=h.interval[1]-h.interval[0]+1e-9,'variance-sensitive interval no wider than worst-case Hoeffding at matched coverage intent');
  const hi=inferWorldEffectsV2([...Array(64).fill(1),...Array(64).fill(-1)],{alternatives:2});
  assert.equal(hi.heterogeneity,'VOLATILE');assert.equal(hi.qualifies,false);assert.equal(hi.referenceDominates,false);
});
test('V2 multiplicity broadens uncertainty and enforces the meaningful floor',()=>{
  const a=inferWorldEffectsV2(Array(128).fill(.15),{alternatives:1}),b=inferWorldEffectsV2(Array(128).fill(.15),{alternatives:4});
  assert.ok(b.interval[0]<a.interval[0]&&b.interval[1]>a.interval[1]);
  assert.equal(inferWorldEffectsV2(Array(512).fill(.09),{alternatives:2,minimumMeaningfulEffect:.05}).qualifies,true);
  assert.throws(()=>inferWorldEffectsV2([NaN]),/EFFECTS_INVALID/);assert.throws(()=>inferWorldEffectsV2([1],{alternatives:0}),/EFFECTS_INVALID/);
});
test('one world has no inferential interval under V2',()=>{assert.equal(inferWorldEffectsV2([1]).interval,null);assert.equal(inferWorldEffectsV2([1]).qualifies,false);assert.equal(inferWorldEffectsV2([1]).referenceDominates,false);assert.equal(inferWorldEffectsV2([]).n,0);});
test('resolution helper reports approximate minimum resolvable effect under declared dispersion',()=>{
  const r=informationResolution({worlds:256,alternatives:2});assert.equal(r.method,INFORMATION_INFERENCE_V2);assert.equal(r.label,'APPROXIMATE_RESOLUTION');
  assert.ok(r.minimumResolvableEffect>.05);assert.ok(r.halfWidth>0);
  for(const n of [64,128,256,512])assert.ok(informationResolution({worlds:n,alternatives:2}).minimumResolvableEffect<informationResolution({worlds:n/2,alternatives:2}).minimumResolvableEffect);
  assert.equal(approximateWorldsForEffect({effect:.15,alternatives:2})>0,true);
  assert.equal(approximateWorldsForEffect({effect:.06,alternatives:2,maxWorlds:512}),null);
  assert.throws(()=>informationResolution({worlds:1}),/RESOLUTION_INVALID/);assert.throws(()=>approximateWorldsForEffect({effect:0}),/RESOLUTION_INVALID/);
});
test('prepared plan and nested manifest are physically immutable',()=>{assert.ok(Object.isFrozen(prepared.plan));assert.ok(Object.isFrozen(prepared.plan.actionIds));assert.ok(Object.isFrozen(prepared.plan.worldManifest.worlds[0]));assert.throws(()=>prepared.plan.actionIds.push('hold'),TypeError);});
test('mutating a transported caller plan cannot change the active frozen experiment',async()=>{const transported=structuredClone(prepared);let changed=false;const result=await executeInformationStudy({...input,...transported,continueMatch:runPolicyMatch,onProgress:()=>{if(!changed){changed=true;transported.plan.actionIds.length=1;transported.plan.seeds.length=1;}}});assert.equal(transported.plan.actionIds.length,1);assert.deepEqual(result,study);});

await mkdir('reports/local/strategy/information',{recursive:true});
await writeFile('reports/local/strategy/information/real-study.json',JSON.stringify(study,null,2));
await writeFile('reports/local/strategy/information/real-claims.json',JSON.stringify(claims,null,2));
await writeFile('reports/local/strategy/information/synthetic-ui-fixture.json',JSON.stringify(synthetic));
await writeFile('reports/local/strategy/information/measurement.json',JSON.stringify({node:process.version,fingerprint:identity.fingerprint,elapsedMs,studyBytes:Buffer.byteLength(JSON.stringify(study)),planBytes:Buffer.byteLength(JSON.stringify(prepared.plan)),informationSetBytes:Buffer.byteLength(JSON.stringify(prepared.informationSet)),antiLeak:{stateA:strategyDigest(source),stateB:strategyDigest(hiddenB),informationSetA:info.artifactId,informationSetB:infoB.artifactId},counts:study.counts},null,2));
