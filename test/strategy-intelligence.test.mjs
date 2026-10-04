import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { gamePlan, validateRecord, validateCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { createSimulationDecisionFrame, createSimulationState, executeSimulationAction, strictPolicyView, authorityHashCanonical } from '@intrilex/engine-adapter';
import { STRATEGY_CONTRACTS, strategyDigest, strategyCanonical, sealStrategy, verifyStrategy, validateDecisionEvent, decisionIdentity, decisionContext, gameMaturity, normalizeStrategyAction } from '../packages/simulation-runtime/src/strategy-contracts.mjs';
import { strategyGameEvidence, classifyStrategySource, validateStrategyEvidence, strategyBundle, validateStrategyBundle, eventIndexRow } from '../packages/simulation-runtime/src/strategy-evidence.mjs';
import { createStrategyAggregate, strategyEventMatches, confidenceFor, claimsFromAggregate, validateStrategyClaim, synthesizeStrategyClaim, strategyGuide, mineStrategyMotifs, mineStrategyMistakes } from '../packages/simulation-runtime/src/strategy-analysis.mjs';
import { planStrategyBranch, reconstructStrategyDecision, executeStrategyBranch, claimFromStrategyBranch } from '../packages/simulation-runtime/src/strategy-branch.mjs';

const identity=await evolutionIdentity();
const config={botA:'value',botB:'tempo',gameCount:4,seed:1337,workerCount:1,strategicTrace:true,kind:'EVALUATION',mirrorSeats:true};
const series=await runLabSeries(config,{identity,createdAt:'2026-10-04T16:00:00.000Z'});
const run=series.run,record=run.records[0],events=record.strategyDecisions;
assert.equal(record.terminationReason,'NORMAL_VICTORY',record.errorCode);
const event=events.find(e=>e.candidates.length>1),source=strategyGameEvidence(run,record),replay=run.replays.find(r=>r.ordinal===record.ordinal).replay;
const authority={createState:createSimulationState,execute:executeSimulationAction,frame:state=>createSimulationDecisionFrame(state,256),view:strictPolicyView,validateCheckpoint};
const scope={fingerprint:identity.fingerprint,rulesProfile:run.config.profileId,eraId:identity.fingerprint,subject:'family:draw'};
function reseal(artifact,change){const {artifactId:_id,contract,...body}=structuredClone(artifact);change(body);return sealStrategy(contract,body);}
function aggregate(rows,options={}){const a=createStrategyAggregate({...scope,...options});rows.forEach(row=>a.add(row));return a.finish();}
const fullRows=run.records.flatMap(r=>r.strategyDecisions.map(e=>eventIndexRow(e,r.resultHash,'LOCAL')));

test('canonical form sorts keys, normalizes negative zero and rejects unsupported data',()=>{
  assert.equal(strategyDigest({z:-0,a:[1]}),strategyDigest({a:[1],z:0}));
  for(const value of [undefined,NaN,Infinity,new Date(),new Map(),{nested:undefined}])assert.throws(()=>strategyCanonical(value),/NON_CANONICAL/);
});
test('all real policy decisions preserve a canonical legal set and recorded selection',()=>{
  assert.equal(events.length,record.decisions);
  for(const [i,e] of events.entries()){validateDecisionEvent(e);assert.equal(e.decisionOrdinal,i);assert.ok(e.candidates.some(c=>c.actionId===e.selectedActionId));assert.equal(e.identity.fingerprint,identity.fingerprint);assert.equal(e.identity.rulesProfile,run.config.profileId);assert.equal(e.replayAnchor.actionSequenceHash,record.actionSequenceHash);}
});
test('identities and event digests reproduce under the exact seed/checkpoint/run plan',async()=>{
  const again=await runLabSeries(config,{identity,createdAt:run.createdAt});
  assert.deepEqual(again.run.records.map(r=>r.strategyDecisions),run.records.map(r=>r.strategyDecisions));
});
test('capture is opt-in and does not change engine action or final-state hashes',()=>{
  const plan=gamePlan(run.config,0),base=runPolicyMatch({...plan,profileId:run.config.profileId,includeReplay:true,replayMode:'commands',telemetryEnabled:false,orchestrationCommandLimit:256});
  assert.equal(base.summary.finalStateHash,record.finalStateHash);assert.equal(strategyDigest(base.replay.commands),record.actionSequenceHash);assert.equal(base.summary.strategyDecisions,undefined);
});
test('mirrored seats associate the correct policy, opponent, frozen checkpoint and Profile head',()=>{
  const plan=gamePlan(run.config,1),s=decisionIdentity({...run,arenaProfiles:{snapshots:[{profile:{agentProfileId:'AP-a',headVersion:3}},null]}},plan,2);
  assert.equal(s.policyId,'value');assert.equal(s.opponentPolicyId,'tempo');assert.equal(s.checkpointId,run.checkpoints[0].checkpointId);assert.equal(s.agentProfileId,'AP-a');assert.equal(s.profileHead,3);
  for(const r of run.records)for(const e of r.strategyDecisions)assert.equal(e.identity.policyId,r.policyIds[e.seat-1]);
});
test('slim worker run metadata preserves purpose from validated configuration',()=>{
  const slim={runId:run.runId,identity:run.identity,config:run.config,checkpoints:run.checkpoints};
  assert.equal(decisionIdentity(slim,gamePlan(run.config,0),1).purpose,'EVALUATION');
});
test('absent public signals stay null and do not imply a tied known position',()=>{
  const c=decisionContext({own:{},opponents:[{}]});
  for(const key of ['boardOccupancy','stackDepth','responseOpen','boardLocked','exhausted'])assert.equal(c[key],null);
  const unknown={...event,context:c};
  assert.equal(strategyEventMatches(unknown,{position:'tied'}),false);
  assert.equal(strategyEventMatches(unknown,{minDeficit:0}),false);
});
test('actor and seat mismatch is rejected even with a valid checksum',()=>{
  assert.throws(()=>validateDecisionEvent(reseal(event,b=>{b.actorId=b.seat===1?'P2':'P1';})),/ACTOR_SEAT/);
});
test('mirrored games can share one retained transcript by verified replay ID',()=>{
  const shared=run.records.find(r=>!run.replays.some(x=>x.ordinal===r.ordinal)&&run.replays.some(x=>x.replayId===r.replayId));
  assert.ok(shared,'real paired deterministic fixture has a deduplicated replay');
  const evidence=strategyGameEvidence(run,shared),retained=run.replays.find(r=>r.replayId===shared.replayId).replay;
  assert.equal(evidence.replayHash,strategyDigest({initialState:retained.initialState,commands:retained.commands}));
});
test('confidence rejects reversed uncertainty and negative effect thresholds',()=>{
  const e={opportunities:100,level:'COUNTERFACTUAL',informationScope:'ACTOR_AUTHORIZED',fixedBudget:true,independentStates:5,interval:[.1,.3],effectMagnitude:.2,minimumMeaningfulEffect:.05};
  assert.equal(confidenceFor({...e,interval:[.3,.1]}),'EXPERIMENTAL');
  assert.equal(confidenceFor({...e,minimumMeaningfulEffect:-1}),'EXPERIMENTAL');
});
test('unknown fields, nested private data, malformed scores and future information fail validation even after rehash',()=>{
  for(const change of [b=>{b.opponentHand=['Q♠'];},b=>{b.context.futureDeckOrder=['A♠'];},b=>{b.candidates[0].hiddenRng=42;},b=>{b.candidates[0].decomposition={opponentHand:'Q♠'};},b=>{b.outcomes.terminalOwnScore='21';}])assert.throws(()=>validateDecisionEvent(reseal(event,change)),/SCHEMA_FIELDS|CANDIDATE_INVALID|OUTCOME_INVALID/);
});
test('checksum damage, stale version, illegal selection and duplicate opportunities are rejected',()=>{
  assert.throws(()=>validateDecisionEvent({...event,selectedActionId:'fake'}),/DIGEST/);
  assert.throws(()=>validateDecisionEvent({...event,contract:'DECISION_EVENT_V2'}),/VERSION/);
  assert.throws(()=>validateDecisionEvent(reseal(event,b=>{b.selectedActionId='fake';})),/SELECTION/);
  assert.throws(()=>validateDecisionEvent(reseal(event,b=>{b.candidates.push(b.candidates[0]);})),/OPPORTUNITY/);
});
test('normalized candidates drop commands, arbitrary feature keys and hidden card identities',()=>{
  const card={id:'OWN',identity:'3♣',controllerId:'P1'},view={actorId:'P1',knownCards:{OWN:card,SECRET:{identity:'HIDDEN'}},own:{hand:[card]}};
  const a=normalizeStrategyAction({actionId:'a',family:'score',mode:'points',timingClass:'ACTION',sourceHandles:['OWN','SECRET'],command:{seed:123,opponentHand:['Q♠']},featureVector:{immediatePoints:3,futureWinner:'P1'}},view);
  assert.deepEqual(a.sourceCards,[{identity:'3♣',rank:'3',suit:'♣'}]);assert.ok(a.subjects.includes('rank:3'));assert.ok(a.subjects.includes('card:3♣'));assert.ok(a.subjects.includes('suit:♣'));assert.equal(JSON.stringify(a).includes('opponentHand'),false);assert.equal(a.features.futureWinner,undefined);
});
test('public context uses authorized hand count, never opponent identities or future outcome',()=>{
  const view={own:{securedPoints:3,goal:21,hand:[1,2],pr:[],er:[]},opponents:[{securedPoints:1,goal:21,handCount:7,hand:['HIDDEN_SECRET'],pr:[],er:[]}],phase:'Action',fullTurnSequence:2,dpCount:40,gyCount:0,exileCount:0};
  const context=decisionContext(view);assert.equal(context.opponentHandCount,7);assert.equal(context.ownHandSize,2);assert.equal(context.scoreDifferential,2);assert.equal(JSON.stringify(context).includes('HIDDEN_SECRET'),false);
});
test('maturity recognizes opening, midgame and early-turn endgame without terminal length',()=>{
  const opening={ownScore:0,opponentScore:0,ownGoal:21,opponentGoal:21,ownHandSize:7,opponentHandCount:7,deckSize:40,graveyardSize:0,exileSize:0,boardOccupancy:0,turn:1,exhausted:false};
  const mid={...opening,ownScore:10,opponentScore:8,ownHandSize:4,opponentHandCount:4,deckSize:20,graveyardSize:20,boardOccupancy:6,turn:8};
  const end={...mid,ownScore:20};
  assert.equal(gameMaturity(opening).bucket,'OPENING');assert.equal(gameMaturity(mid).bucket,'MIDGAME');assert.equal(gameMaturity(end).bucket,'ENDGAME');
  assert.deepEqual(gameMaturity({...mid,futureWinner:'P1',terminalTurns:100}),gameMaturity(mid));assert.ok(gameMaturity(end).score>gameMaturity(mid).score);
});
test('maturity is deterministic and monotone under increasing public score/depletion',()=>{
  const c=event.context;
  assert.deepEqual(gameMaturity(c),gameMaturity(c));
  assert.ok(gameMaturity({...c,ownScore:c.ownScore+10}).score>=gameMaturity(c).score);
  assert.ok(gameMaturity({...c,deckSize:0,exhausted:true}).score>=0.85);
});
test('a forged maturity bucket is rejected rather than trusted on import',()=>{assert.throws(()=>validateDecisionEvent(reseal(event,b=>{b.maturity.bucket='ENDGAME';b.maturity.score=1;})),/MATURITY_MISMATCH/);});
test('record validation binds decision evidence to run, policy, seed and transcript',()=>{
  validateRecord(record,run);
  const bad={...record,strategyDecisions:record.strategyDecisions.map((e,i)=>i?e:reseal(e,b=>{b.identity.checkpointId='forged';}))};
  const {resultHash:_hash,durationMs:_ms,...body}=bad;bad.resultHash=strategyDigest(body);
  assert.throws(()=>validateRecord(bad,run),/STRATEGY_RECORD_MISMATCH/);
});
test('opportunities count frames rather than target permutations and play/skip sums are exact',()=>{
  const a=aggregate(fullRows);
  const manual=fullRows.filter(r=>r.event.candidates.some(c=>c.subjects.includes(scope.subject)));
  assert.equal(a.total.opportunities,manual.length);assert.equal(a.total.selected+a.total.skipped,a.total.opportunities);assert.equal(a.total.selectionRate,a.total.selected/a.total.opportunities);
  assert.equal(a.timing.reduce((n,c)=>n+c.opportunities,0),a.total.opportunities);
  assert.ok(a.distinctStates<=a.total.opportunities);assert.equal(a.independentStates,null);assert.ok(a.seedBlocks<=run.records.length/2);
});
test('context filters preserve exact policy/matchup/seat/maturity and hand/score boundaries',()=>{
  const c=event.context,f={policyId:event.identity.policyId,opponentPolicyId:event.identity.opponentPolicyId,seat:event.seat,maturity:event.maturity.bucket,minOwnHand:c.ownHandSize,maxOwnGoalDistance:c.ownGoalDistance};
  assert.equal(strategyEventMatches(event,f),true);assert.equal(strategyEventMatches(event,{...f,policyId:'fake'}),false);assert.equal(strategyEventMatches(event,{...f,minOwnHand:c.ownHandSize+1}),false);
  assert.equal(strategyEventMatches(event,{minDeficit:8}),c.scoreDifferential<=-8);assert.equal(strategyEventMatches(event,{position:'ahead'}),c.scoreDifferential>0);
});
test('non-clean events are excluded and their exclusion remains visible',()=>{
  const a=aggregate([{event:reseal(event,b=>{b.outcomes.clean=false;b.outcomes.terminationReason='DECISION_LIMIT';b.outcomes.terminalWinner='ABORTED';})}],{subject:event.candidates[0].subjects[0]});
  assert.equal(a.total.opportunities,0);assert.equal(a.nonClean,1);
});
test('cross fingerprint, rules profile and Evaluation Era aggregation fails closed',()=>{
  for(const field of ['fingerprint','rulesProfile','eraId'])assert.throws(()=>aggregate([{event:reseal(event,b=>{b.identity[field]='different';})}]),/CROSS_ERA/);
});
test('historical aggregate data retains partial/summary fidelity with no fabricated decision events',()=>{
  const old=structuredClone(run);old.records.forEach(r=>delete r.strategyDecisions);
  assert.equal(classifyStrategySource(old).fidelity,'PARTIAL_OBSERVATIONAL_EVIDENCE');const e=strategyGameEvidence(old,old.records[0]);assert.deepEqual(e.events,[]);assert.equal(e.fidelity,'PARTIAL_OBSERVATIONAL_EVIDENCE');
  old.records.forEach(r=>delete r.seatBehavior);assert.equal(classifyStrategySource(old).fidelity,'SUMMARY_ONLY');
});
test('source checksums and preserved provenance round-trip; replay tampering fails',()=>{
  validateStrategyEvidence(source);assert.ok(source.events.length>0);assert.equal(source.source.resultHash,record.resultHash);
  const r=structuredClone(run);r.replays[0].replay.commands[0].id='tampered';assert.throws(()=>strategyGameEvidence(r,r.records[0]),/REPLAY_SOURCE/);
});
test('portable bundles validate every decision, replay association and nested checksum',()=>{
  const bundle=strategyBundle({evidence:[source],replays:[{replayHash:source.replayHash,replay}],studies:[],claims:[]});validateStrategyBundle(bundle);
  assert.throws(()=>validateStrategyBundle({...bundle,studies:[{}]}),/DIGEST/);
  assert.throws(()=>validateStrategyBundle(reseal(bundle,b=>{b.replays[0].replayHash='fake';})),/REPLAY_DIGEST/);
});
test('descriptive and associational confidence never rises above experimental regardless of sample count',()=>{
  for(const level of ['DESCRIPTIVE','ASSOCIATIONAL'])assert.equal(confidenceFor({opportunities:1e9,level,independentStates:1e9,replicated:true,fixedBudget:true,interval:[.2,.8],packs:100,matchups:10,policies:10}), 'EXPERIMENTAL');
  assert.equal(confidenceFor({opportunities:100,level:'COUNTERFACTUAL',informationScope:'RESEARCH_ONLY'}),'EXPERIMENTAL');
});
test('confidence considers replication, uncertainty, scope, faults and held-out sensitivity',()=>{
  const e={opportunities:100,level:'COUNTERFACTUAL',informationScope:'ACTOR_AUTHORIZED',fixedBudget:true,independentStates:5,interval:[.1,.3],effectMagnitude:.2,minimumMeaningfulEffect:.05,consistency:true,reversals:false};
  assert.equal(confidenceFor(e),'SUGGESTIVE');assert.equal(confidenceFor({...e,interval:[-.1,.3]}),'EXPERIMENTAL');assert.equal(confidenceFor({...e,nonClean:1}),'INSUFFICIENT');
  assert.equal(confidenceFor({...e,replicated:true,packs:2,matchups:2,policies:2}),'STRONG');assert.equal(confidenceFor({...e,replicated:true,packs:2,matchups:2,policies:2,heldOutReplicated:true}),'ESTABLISHED');
});
test('claim prose, counts and provenance come from the same aggregation',()=>{
  const a=aggregate(fullRows),claims=claimsFromAggregate(a,'2026-10-04T16:00:00.000Z');
  for(const claim of claims){validateStrategyClaim(claim);assert.equal(claim.opportunityCount,a.total.opportunities);assert.deepEqual(claim.provenance,a.provenance);assert.equal(claim.recommendation,'UNKNOWN');assert.ok(synthesizeStrategyClaim(claim).length>0);}
  assert.match(synthesizeStrategyClaim(claims[0]),/legal opportunities/);assert.equal(claims[0].estimatedMagnitude,a.total.selectionRate);
});
test('unsupported, stale and imported claims stay visibly insufficient',()=>{
  const empty=claimsFromAggregate(aggregate([]))[0];assert.equal(empty.confidence,'INSUFFICIENT');assert.match(synthesizeStrategyClaim(empty),/enough evidence/);
  assert.equal(claimsFromAggregate(aggregate(fullRows,{historical:true}))[0].confidence,'INSUFFICIENT');
  assert.equal(claimsFromAggregate(aggregate(fullRows.map(r=>({...r,origin:'IMPORTED_UNVERIFIED'}))))[0].confidence,'INSUFFICIENT');
});
test('observational recommendations and research-only strong labels are rejected',()=>{
  const c=claimsFromAggregate(aggregate(fullRows))[0];
  assert.throws(()=>validateStrategyClaim(reseal(c,b=>{b.recommendation='PLAY';})),/OVERCLAIM/);
  assert.throws(()=>validateStrategyClaim(reseal(c,b=>{b.evidenceType='COUNTERFACTUAL';b.informationScope='RESEARCH_ONLY';b.confidence='STRONG';})),/RESEARCH_ADVICE/);
});
test('reconstruct exact pre-command state and enumerate the same authoritative legal actions',()=>{
  const frame=reconstructStrategyDecision({event,replay,identity,authority});assert.equal(authorityHashCanonical(frame.state),event.replayAnchor.stateHash);assert.ok(frame.policyActions.some(c=>c.actionId===event.selectedActionId));
});
test('branch reconstruction rejects stale identity, changed replay and forged context',()=>{
  assert.throws(()=>reconstructStrategyDecision({event,replay,identity:{...identity,fingerprint:'f'.repeat(64)},authority}),/STALE/);
  const altered=structuredClone(replay);altered.commands.pop();assert.throws(()=>reconstructStrategyDecision({event,replay:altered,identity,authority}),/TRANSCRIPT/);
  assert.throws(()=>reconstructStrategyDecision({event:reseal(event,b=>{b.context.ownHandSize++;b.maturity=gameMaturity(b.context);}),replay,identity,authority}),/CONTEXT/);
});
test('branch plan commits actual action, legal alternatives and fixed unique seed budget before outcomes',()=>{
  const p=planStrategyBranch(event,{seeds:[11,22],decisionLimit:300});assert.ok(p.actionIds.includes(event.selectedActionId));assert.equal(p.fixedBudget,true);assert.equal(p.informationScope,'RESEARCH_ONLY');assert.equal(p.continuationCheckpointIds.length,2);
  for(const bad of [{seeds:[1,1]},{seeds:[0,1]},{decisionLimit:0},{actionIds:['fake',event.selectedActionId]},{actionIds:[event.selectedActionId]}])assert.throws(()=>planStrategyBranch(event,bad),/INVALID|ILLEGAL/);
});
let completedStudy;
test('controlled continuations use identical state and common seeds, execute complete budgets and reproduce artifacts',async()=>{
  const plan=planStrategyBranch(event,{seeds:[11,22],decisionLimit:1800,actionIds:event.candidates.slice(0,2).map(c=>c.actionId).includes(event.selectedActionId)?event.candidates.slice(0,2).map(c=>c.actionId):[event.selectedActionId,event.candidates.find(c=>c.actionId!==event.selectedActionId).actionId]});
  const input={event,replay,identity,authority,checkpoints:run.checkpoints,plan,continueMatch:runPolicyMatch};
  const a=await executeStrategyBranch(input),b=await executeStrategyBranch(input);assert.deepEqual(a,b);assert.equal(a.rows.length,4);assert.equal(a.status,'COMPLETE');
  assert.equal(a.comparisons.length,1);assert.equal(a.comparisons[0].pairedCount,2);assert.equal(a.plan.stateHash,event.replayAnchor.stateHash);completedStudy=a;
});
test('cancellation and non-clean fixed budgets cannot produce a successful comparison',async()=>{
  const plan=planStrategyBranch(event,{seeds:[11,22],decisionLimit:1});
  const base={event,replay,identity,authority,checkpoints:run.checkpoints,plan};
  const cancelled=await executeStrategyBranch({...base,continueMatch:runPolicyMatch,signal:AbortSignal.abort()});assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.rows.length,0);assert.deepEqual(cancelled.comparisons,[]);
  let count=0;const fault=await executeStrategyBranch({...base,continueMatch:()=>{count++;return {winner:'ABORTED',terminationReason:'DECISION_LIMIT',finalScores:{P1:0,P2:0},finalStateHash:'a'.repeat(64)};}});
  assert.equal(count,plan.seeds.length*plan.actionIds.length);assert.equal(fault.status,'NON_CLEAN');assert.deepEqual(fault.comparisons,[]);assert.deepEqual(claimFromStrategyBranch(fault),[]);
});
test('counterfactual claims and mistake leads remain research-only, with exact study provenance',()=>{
  const claims=claimFromStrategyBranch(completedStudy,'2026-10-04T16:00:00.000Z');
  for(const c of claims){validateStrategyClaim(c);assert.equal(c.informationScope,'RESEARCH_ONLY');assert.equal(c.confidence,'EXPERIMENTAL');assert.equal(c.independentStateCount,1);assert.ok(c.provenance.includes(completedStudy.artifactId));assert.match(synthesizeStrategyClaim(c),/Research-only/);}
  assert.deepEqual(mineStrategyMistakes([]),[]);
});
test('different branch action IDs remain different claims even with identical family/mode and outcomes',()=>{
  const fixture=reseal(completedStudy,b=>{b.comparisons.push({...b.comparisons[0],actionId:'FIXTURE_DISTINCT_LEGAL_LINE'});});
  const claims=claimFromStrategyBranch(fixture,'2026-10-04T16:00:00.000Z');
  assert.equal(new Set(claims.map(c=>c.artifactId)).size,claims.length);
  assert.notEqual(claims[0].statementData.actionId,claims[1].statementData.actionId);
});
test('bounded two/three action motifs never combine games or imply causation',()=>{
  const motifs=mineStrategyMotifs(events,{maxMotifs:3});assert.ok(motifs.length<=3);for(const m of motifs){assert.ok([2,3].includes(m.sequence.length));assert.equal(m.evidenceType,'ASSOCIATIONAL');assert.match(m.caveat,/not causal/);}
  const mixed=[events[0],reseal(events[1],b=>{b.identity.runId='OTHER';})];assert.deepEqual(mineStrategyMotifs(mixed),[]);
});
test('expert guide exports provenance-bound claims with no filler or cross-era synthesis',()=>{
  const claims=claimsFromAggregate(aggregate(fullRows),'2026-10-04T16:00:00.000Z'),guide=strategyGuide(claims,{...scope,generatedAt:'2026-10-04T16:00:00.000Z'});
  verifyStrategy(guide.manifest,STRATEGY_CONTRACTS.guide);assert.equal(guide.manifest.entries.length,claims.length);for(const c of claims)assert.ok(guide.markdown.includes(c.artifactId));assert.match(guide.markdown,/No strong conclusion/);
  assert.throws(()=>strategyGuide(claims,{...scope,eraId:'other'}),/CROSS_ERA/);
});
test('Strategy route, portable build modules and CI registration are integrated',async()=>{
  const [router,build,pkg,ci]=await Promise.all(['apps/lab-web/src/router.js','scripts/build.mjs','package.json','scripts/ci.mjs'].map(p=>readFile(p,'utf8')));
  assert.match(router,/STRATEGY_NAMES.route/);for(const module of ['strategy-contracts.mjs','strategy-analysis.mjs','strategy-evidence.mjs','strategy-branch.mjs'])assert.ok(build.includes(module));assert.ok(JSON.parse(pkg).scripts.test.includes('test/strategy-intelligence.test.mjs'));assert.ok(ci.includes('test/strategy-intelligence.test.mjs'));
});
