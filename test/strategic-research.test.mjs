import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CORE_POLICY_BY_ID,rankPolicyActions} from '../packages/policies/src/index.mjs';
import {representativeSample,arenaAnalytics,filterArenaRecords,strategicAnalytics,fingerprintDistance} from '../apps/lab-web/src/evolution/evolution-analytics-model.mjs';
import {arenaAnalyticsHtml,chartExportMetadata,matchupMatrixHtml} from '../apps/lab-web/src/evolution/evolution-analytics-charts.mjs';
import {createStrategicTracker,decisionObservation,winnerScoreDiagnostic,validateStrategicTelemetry,publicTerminalAnchorCounts} from '../packages/simulation-runtime/src/strategic-telemetry.mjs';
import {matchupConfig,runMatchupLab,matchupMatrix,matchupArtifact,validateMatchupArtifact} from '../packages/simulation-runtime/src/matchup-lab.mjs';
import {createLabRun,createCheckpoint,validateCheckpoint,artifactEnvelope,inspectHistoricalArtifact,validateArtifact} from '../packages/simulation-runtime/src/evolution-domain.mjs';
import {runLabSeries,runLabGame,evolutionIdentity} from '../packages/simulation-runtime/src/evolution-lab.mjs';
import {hashCanonical} from '@intrilex/shared';

const game=(ordinal,extra={})=>({ordinal,seed:100+Math.floor(ordinal/2),swapped:ordinal%2===1,winner:'P1',terminationReason:'NORMAL_VICTORY',turns:2,miniTurns:4,decisions:6,scoreP1:21,scoreP2:10,eventCounts:{CORE_NORMAL_VICTORY:1,CORE_FULL_TURN_COMPLETED:2},...extra});
const run=records=>({runId:'test-run',status:'COMPLETE',config:{botA:'control-tactical',botB:'score-rush-tactical',profileId:'core-advanced-authority',mirrorSeats:true,gameCount:records.length},records});
const action=(family,points=0)=>({actionId:family,family,mode:family==='score'?'points':family==='scuttle'?'ordinary':'black-joker',sourceHandles:[],targetHandles:[],featureVector:{immediatePoints:points}});
const context={actorId:'P1',authorizedView:{fullTurnSequence:1,phase:'ACTION',own:{goal:21,securedPoints:0,hand:[],pr:[],er:[],limits:{miniTurnsRemaining:1}},opponents:[{playerId:'P2',goal:21,securedPoints:0,handCount:3,pr:[],er:[]}],knownCards:{},stack:[],dpCount:20}};
const observation=(ordinal=0,selected=action('scuttle'),extra={})=>decisionObservation({...context,seat:1,decisionIndex:ordinal,legalActions:[action('score',9),selected],selected,...extra});

test('2,222 alternating paired games cannot alias scatter onto AB',()=>{
  const rows=Array.from({length:2222},(_,i)=>game(i)),before=JSON.stringify(rows),m=arenaAnalytics(run(rows));
  assert.equal(m.scatter.length,300);assert.equal(m.scatter.filter(p=>p.record.swapped).length,150);
  assert.equal(m.pairs.n,1111);assert.equal(m.pairs.score,.5);assert.equal(m.summary.accepted,2222);assert.equal(JSON.stringify(rows),before);
});
test('stratified sampling preserves rare terminal/outcome categories and seat orientation',()=>{
  const rows=Array.from({length:2000},(_,i)=>game(i));rows[10]=game(10,{terminationReason:'EXHAUSTED_RESOLUTION',winner:'P2'});rows[11]=game(11,{terminationReason:'CANONICAL_DRAW',winner:'DRAW'});
  const sampled=representativeSample(rows);assert.ok(sampled.includes(rows[10]));assert.ok(sampled.includes(rows[11]));assert.equal(sampled.length,300);
});
test('sampling is deterministic across arrival order and variable budgets',()=>{
  const rows=Array.from({length:2222},(_,i)=>game(i));for(const budget of [0,2,50,299,300]){assert.deepEqual(representativeSample(rows,budget),representativeSample([...rows].reverse(),budget));assert.equal(representativeSample(rows,budget).length,budget);}
  assert.throws(()=>representativeSample(rows,-1));assert.equal(new Set(representativeSample(rows).map(r=>r.ordinal)).size,300);
});
test('opportunity raw counts and selected declarations reconcile per decision denominator',()=>{
  const c={schemaVersion:1,opportunities:{'family:score':10},selected:{'family:score':3}},rows=[game(0,{seatBehavior:[{decisions:10,actionCounts:{score:3,scuttle:7},actionCoverage:c},{decisions:5,actionCounts:{score:5},actionCoverage:{schemaVersion:1,opportunities:{'family:score':5},selected:{'family:score':5}}}]})];
  const m=arenaAnalytics(run(rows)),score=m.opportunityRows[0];assert.equal(score.AAvailable,10);assert.equal(score.ASelected,3);assert.equal(score.A,30);
  const html=arenaAnalyticsHtml(run(rows));assert.match(html,/observed 10; taken 3; filtered telemetry games 1/);
});
test('SVG identities carry metric, denominator, versions, rules, filtered range and count',()=>{
  const r={...run([game(0),game(1)]),checkpoints:[{policyId:'control-tactical',policyVersion:'4.0.0',checkpointId:'cpa'},{policyId:'score-rush-tactical',policyVersion:'4.0.0',checkpointId:'cpb'}]};
  const html=arenaAnalyticsHtml(r,{from:2,to:2});assert.match(html,/data-evo-chart-metadata/);assert.match(html,/control-tactical/);assert.match(html,/4.0.0/);assert.match(html,/acceptedRecordCount&quot;:1/);assert.match(html,/filteredRange/);
  assert.notEqual(chartExportMetadata('action-mix','Decision mix','x').semanticId,chartExportMetadata('action-opportunities','Selection when legal','x').semanticId);
  assert.match(html,/<title>Outcome convergence/);assert.match(chartExportMetadata('action-opportunities','Opportunity','x').denominator,/per policy decision frame/);
});
test('historical score relations never equate lower points with an invalid victory',()=>{
  const d=winnerScoreDiagnostic(game(0,{scoreP1:10,scoreP2:20}));assert.equal(d.winnerScoreRelation,'LOWER_SCORE');assert.equal(d.status,'UNVERIFIED');
  assert.equal(winnerScoreDiagnostic(game(1,{winner:'P2',scoreP1:10,scoreP2:10})).winnerScoreRelation,'EQUAL_SCORE');
  assert.equal(winnerScoreDiagnostic(game(0,{winner:'DRAW'})).winnerScoreRelation,'NOT_APPLICABLE');
});
test('own-goal, Sudden Death, Exhausted and unexpected terminal events are distinct',()=>{
  const lower=game(0,{scoreP1:10,scoreP2:20,terminalEvidence:{eventType:'CORE_NORMAL_VICTORY',goals:[10,30],payload:{playerId:'P1'}}});assert.equal(winnerScoreDiagnostic(lower).status,'EXPLAINED');
  assert.equal(winnerScoreDiagnostic({...lower,terminalEvidence:{eventType:'CORE_NORMAL_VICTORY',goals:[21,30],payload:{playerId:'P1'}}}).status,'UNEXPECTED');
  const exhausted=winnerScoreDiagnostic({...lower,terminationReason:'EXHAUSTED_RESOLUTION',terminalEvidence:{eventType:'CORE_EXHAUSTED_RESOLVED',payload:{winner:'P1'}}});assert.equal(exhausted.semantics,'ANCHORS_THEN_POINTS');assert.equal(exhausted.status,'EXPLAINED');
  assert.equal(winnerScoreDiagnostic({...lower,terminalEvidence:{eventType:'CORE_SUDDEN_DEATH_RESOLVED',payload:{winner:'P1'}}}).semantics,'SUDDEN_DEATH_ACTIVATOR');
});
test('all previous tactical rankings are unchanged from original HEAD golden fixtures',async()=>{
  const fixture=JSON.parse(await readFile('test/fixtures/strategic-frozen-rankings.json','utf8'));
  for(const c of fixture.cases)for(const [id,expected]of Object.entries(c.rankings))assert.deepEqual(rankPolicyActions(id,fixture.moves,c.context).map(r=>({id:r.action.actionId,score:r.score})),expected);
  assert.equal(createHash('sha256').update((await readFile('packages/policies/src/tactics.mjs','utf8')).replaceAll('\r\n','\n')).digest('hex'),'8d9746fe156962bd5c03bda5f923894dd06810316487f6a744fab1e60fb7bffe');
  for(const id of ['control-tactical','score-rush-tactical','tempo-tactical','value-tactical'])assert.equal(CORE_POLICY_BY_ID[id].version,'4.0.0');
});
test('successor is independently versioned, frozen and retains Control identity',async()=>{
  const identity=await evolutionIdentity(),policy=CORE_POLICY_BY_ID['control-conversion-tactical'],cp=createCheckpoint({policyId:policy.policyId,agentId:'A',identity});
  assert.equal(policy.version,'5.0.0');assert.equal(policy.traits.archetype,'control');assert.ok(Object.isFrozen(cp));assert.equal(cp.policyVersion,'5.0.0');
  const {checkpointId:_,...body}=cp;body.policyVersion='4.0.0';assert.throws(()=>validateCheckpoint({...body,checkpointId:`CP-${hashCanonical(body)}`},identity));
});
test('successor converts a constrained board and still values material denial',()=>{
  const policy=CORE_POLICY_BY_ID['control-conversion-tactical'],moves=[action('score',9),{...action('anchor'),mode:'queen'}];
  assert.equal(policy.choose({...context,legalActions:moves}).actionId,'score');assert.equal(CORE_POLICY_BY_ID['control-tactical'].choose({...context,legalActions:moves}).actionId,'anchor');
  const c={...context,authorizedView:{...context.authorizedView,opponents:[{...context.authorizedView.opponents[0],securedPoints:20,pr:[{id:'ten',identity:'10♥',pointValue:10,zone:'P2_PR',controllerId:'P2'}]}],knownCards:{ten:{id:'ten',identity:'10♥',pointValue:10,zone:'P2_PR',controllerId:'P2'}}}};
  assert.equal(policy.choose({...c,legalActions:[action('score',3),{...action('scuttle'),targetHandles:['ten']}]}).actionId,'scuttle');
});
test('successor deterministic rankings need only legal actions and authorized input',()=>{
  const moves=[action('score',9),action('scuttle')],policy=CORE_POLICY_BY_ID['control-conversion-tactical'];
  const c=new Proxy({...context,legalActions:moves},{get(t,k){if(!['actorId','authorizedView','legalActions'].includes(k))throw new Error('FORBIDDEN');return t[k];}});
  assert.deepEqual(policy.choose(c),policy.choose(c));
});
test('Control successor takes a material-denial exchange that Score Rush declines',()=>{
  const nine={id:'enemy-nine',identity:'9♥',pointValue:9,controllerId:'P2',zone:'P2_PR'};
  const jack={id:'own-jack',identity:'J♥',pointValue:3,controllerId:'P1',zone:'P1_HAND'},eight={id:'own-eight',identity:'8♥',pointValue:8,controllerId:'P1',zone:'P1_HAND'};
  const c={...context,authorizedView:{...context.authorizedView,own:{...context.authorizedView.own,hand:[jack,eight]},opponents:[{...context.authorizedView.opponents[0],securedPoints:9,pr:[nine]}],knownCards:{'enemy-nine':nine,'own-jack':jack,'own-eight':eight}}};
  const moves=[{...action('score',8),sourceHandles:['own-eight']},{...action('scuttle'),sourceHandles:['own-jack'],targetHandles:['enemy-nine']}],input={...c,legalActions:moves};
  assert.equal(CORE_POLICY_BY_ID['control-conversion-tactical'].choose(input).actionId,'scuttle');
  assert.equal(CORE_POLICY_BY_ID['score-rush-tactical'].choose(input).actionId,'score');
});
test('decision capture contains no hidden card identities, final outcomes or future metrics',()=>{
  const c=observation();assert.equal(c.availableScoreValue,9);assert.equal(c.legalActionCount,2);assert.equal(c.scoreDeclined,true);
  assert.equal(c.opponentHandCount,3);assert.equal(c.opponentGoalGap,21);assert.ok(!Object.hasOwn(c,'winner'));assert.ok(!Object.hasOwn(c,'deferredConversions'));assert.ok(!JSON.stringify(c).includes('knownCards'));assert.ok(!Object.hasOwn(c,'policyScores'));
});
test('conversion capture remains frozen while follow-up counters observe later public changes',()=>{
  const tracker=createStrategicTracker({deep:true}),d=observation();const before=JSON.stringify(d);tracker.observe([0,0],0);tracker.capture(d,[0,0]);tracker.observe([0,4],1);tracker.observe([9,4],3);
  const finished=tracker.finish([9,4],4),s=finished.seats[0];assert.equal(JSON.stringify(d),before);assert.equal(s.deferredConversions,1);assert.equal(s.conversionDelaySum,3);assert.equal(s.horizonObserved,1);assert.equal(s.horizonSwingSum,5);assert.equal(finished.traces[0].ownScore,0);
});
test('terminal-short windows are censored rather than inventing 3-decision outcomes',()=>{
  const t=createStrategicTracker();t.observe([0,0],0);t.capture(observation(),[0,0]);const result=t.finish([0,3],1);assert.equal(result.seats[0].horizonCensored,1);assert.equal(result.seats[0].horizonObserved,0);assert.equal(result.seats[0].unconvertedAtTerminal,1);assert.ok(!Object.hasOwn(result,'traces'));
});
test('unknown score values and historical strategic telemetry remain unavailable',()=>{
  const d=observation(0,action('scuttle'),{legalActions:[{...action('score'),featureVector:{}},action('scuttle')]});assert.equal(d.availableScoreValue,null);
  const model=arenaAnalytics(run([game(0)]));assert.equal(model.strategy.A.immediateConversion,null);assert.equal(model.strategy.A.meanDelay,null);
});
test('online opportunity accounting reconciles with selected and declined counts under mirrored seats',()=>{
  const t=createStrategicTracker();t.observe([0,0],0);t.capture(observation(),[0,0]);t.capture(observation(1,action('score',9)),[9,0]);
  const data=t.finish([9,0],2),s=data.seats[0];assert.equal(s.scoreOpportunities,s.scoreTaken+s.scoreDeclined);
  const bots=strategicAnalytics([game(1,{winner:'P1',strategicTelemetry:data})]);assert.equal(bots.B.counts.scoreOpportunities,2);assert.equal(bots.B.counts.scoreTaken,1);assert.equal(bots.A.counts.scoreOpportunities,0);
});
test('observational cross filters preserve raw records, config, hashes and requested execution count',()=>{
  const r=run([game(0),game(1),game(2,{winner:'P2',scoreP1:30,scoreP2:10,decisions:20})]),before=JSON.stringify(r);
  assert.deepEqual(filterArenaRecords(r,{seat:'AB',winner:'B',relation:'LOWER_SCORE',decisionMin:15,marginMin:10}).map(r=>r.ordinal),[2]);
  assert.equal(arenaAnalytics(r,{from:2,to:2}).summary.requested,3);assert.equal(JSON.stringify(r),before);
});
test('fingerprint total variation is transparent and missing coverage is not identical behavior',()=>{
  assert.equal(fingerprintDistance({score:1},{scuttle:1}),1);assert.equal(fingerprintDistance({score:.5,scuttle:.5},{score:.5,scuttle:.5}),0);assert.equal(fingerprintDistance(null,{score:1}),null);
});
test('matrix validates independent master seeds and complete paired series',()=>{
  assert.throws(()=>matchupConfig({masterSeeds:[1,1]}));assert.throws(()=>matchupConfig({gamesPerPairing:3}));assert.throws(()=>matchupConfig({policyIds:['control','control']}));
  assert.equal(matchupConfig().policyIds.length,5);
});
test('real paired matrix shares frozen versions across multiple masters and conserves accepted evidence',async()=>{
  const identity=await evolutionIdentity(),lab=await runMatchupLab({policyIds:['control-conversion-tactical','score-rush-tactical','tempo-tactical'],masterSeeds:[811,812],gamesPerPairing:2,workerCount:1},runLabSeries,{identity});
  const matrix=matchupMatrix(lab);assert.equal(lab.status,'COMPLETE');assert.equal(matrix.cells.length,3);assert.equal(matrix.acceptedGames,12);assert.equal(matrix.requestedGames,12);
  assert.equal(matrix.cells.reduce((n,c)=>n+c.metrics.games,0),12);assert.equal(Object.values(matrix.aggregate).reduce((n,a)=>n+a.games,0),24);
  for(const cell of matrix.cells){assert.equal(cell.metrics.pairCount,2);assert.equal(cell.metrics.winsA+cell.metrics.winsB+cell.metrics.draws,cell.metrics.clean);assert.equal(cell.seats[0].games,2);assert.equal(cell.seats[1].games,2);}
  assert.deepEqual(validateMatchupArtifact(matchupArtifact(lab)),lab);assert.match(matchupMatrixHtml(matrix),/round-robin-matrix/);
  const bad=structuredClone(lab);bad.runs.push(bad.runs[0]);assert.throws(()=>matchupMatrix(bad),/DUPLICATE/);
});
test('deep Node and browser traces agree and instrumentation does not change decisions',async()=>{
  const identity=await evolutionIdentity(),input={botA:'control-conversion-tactical',botB:'control-tactical',gameCount:2,seed:944,mirrorSeats:true,workerCount:1,strategicTrace:true};
  const r=createLabRun(input,identity),sample=runLabGame(r,0),browser=await import('../apps/lab-web/dist/autonomy-runtime.js');
  assert.ok(sample.record.strategicTelemetry?.traces.length);const b=browser.runBrowserPolicyMatch({seed:sample.record.seed,policyIds:[input.botA,input.botB],decisionLimit:r.config.decisionLimit,orchestrationCommandLimit:r.config.orchestrationCommandLimit,recordReplay:true,strategicTelemetryEnabled:true,strategicTrace:true});
  assert.equal(hashCanonical(b.replay.commands),sample.record.actionSequenceHash);assert.deepEqual(b.strategicTelemetry,sample.record.strategicTelemetry);
  const plain=runLabGame(createLabRun({...input,strategicTrace:false},identity),0);assert.equal(plain.record.actionSequenceHash,sample.record.actionSequenceHash);assert.equal(plain.record.finalStateHash,sample.record.finalStateHash);
});
test('frozen historical envelopes retain original bytes and cannot execute under a new identity',async()=>{
  const identity=await evolutionIdentity(),r=createLabRun({botA:'control-tactical',botB:'score-rush-tactical',gameCount:2,seed:45,workerCount:1},identity),before=JSON.stringify(r.checkpoints);
  r.records.push(runLabGame(r,0).record);assert.equal(JSON.stringify(r.checkpoints),before);const envelope=artifactEnvelope(r),bytes=JSON.stringify(envelope);
  inspectHistoricalArtifact(envelope);assert.equal(JSON.stringify(envelope),bytes);
  const changed={...identity,runtimeHash:'b'.repeat(64)};changed.fingerprint=hashCanonical({engineHash:changed.engineHash,policyImplementationHash:changed.policyImplementationHash,runtimeHash:changed.runtimeHash,engineVersion:changed.engineVersion,rulesVersion:changed.rulesVersion});assert.throws(()=>validateArtifact(envelope,changed),/INCOMPATIBLE/);
});

test('strategic evidence rejects fabricated counters and future-information fields',()=>{
 const t=createStrategicTracker({deep:true});t.observe([0,0],0);t.capture(observation(),[0,0]);const data=t.finish([0,0],1);validateStrategicTelemetry(data,1);
 const bad=structuredClone(data);bad.seats[0].scoreTaken++;assert.throws(()=>validateStrategicTelemetry(bad,1),/ACCOUNTING/);
 const future=structuredClone(data);future.traces[0].finalWinner='P1';assert.throws(()=>validateStrategicTelemetry(future,1),/AUTHORIZED/);
});
test('terminal anchor diagnostic excludes tapped and face-down cards and verifies the tiebreak order',()=>{
 const state={players:{P1:{er:['a','trap','tapped']},P2:{er:[]}},cards:{a:{identity:'A♥',controllerId:'P1',state:{}},trap:{identity:'K♠',controllerId:'P1',state:{faceDownTrap:true}},tapped:{identity:'Q♥',controllerId:'P1',state:{tapped:true}}}};
 assert.deepEqual(publicTerminalAnchorCounts(state,['P1','P2']),[1,0]);
 const record=game(0,{scoreP1:10,scoreP2:20,terminationReason:'EXHAUSTED_RESOLUTION',terminalEvidence:{eventType:'CORE_EXHAUSTED_RESOLVED',payload:{winner:'P1'},activeAnchorCounts:[1,0]}});assert.equal(winnerScoreDiagnostic(record).status,'EXPLAINED');
 assert.equal(winnerScoreDiagnostic({...record,terminalEvidence:{...record.terminalEvidence,activeAnchorCounts:[0,0]}}).status,'UNEXPECTED');
});
