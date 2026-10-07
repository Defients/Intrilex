import { hashCanonical } from '../shared-browser.js';
import { assertIdentity, labConfig, labGameSeed, validateCheckpoint, createCheckpoint, FROZEN_POLICIES, LAB_PROFILES, CLEAN_REASONS } from './evolution-domain.mjs';

const fail=code=>{throw new Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const equal=(a,b)=>hashCanonical(a)===hashCanonical(b);
const TYPES=['SELF_PLAY','POLICY_COMPARISON','CHECKPOINT_EVALUATION','EVOLUTION_TRAINING'];
const hashId=(prefix,body)=>`${prefix}-${hashCanonical(body)}`;
const date=value=>Number.isFinite(Date.parse(value));

export function createEvaluationPack({identity,baseSeed=1,pairCount=50,profileId=LAB_PROFILES[0],purpose='EVALUATION',name='Frozen paired pack',createdAt=new Date().toISOString()}) {
  assertIdentity(identity);
  labConfig({botA:'control',botB:'tempo',gameCount:pairCount*2,seed:baseSeed,profileId,kind:'EVALUATION'});
  const body={schemaVersion:1,name,version:1,identity:structuredClone(identity),profileId,purpose,
    seeds:Array.from({length:pairCount},(_,i)=>labGameSeed(baseSeed,i*2)),mirrorSeats:true,sampleSize:pairCount*2,
    provenance:{generator:'EVOLUTION_LAB_V1',baseSeed}};
  const pack={...body,packId:hashId('EP',body),createdAt};return validateEvaluationPack(pack,identity);
}
export function validateEvaluationPack(pack,identity) {
  if(!pack) fail('INVALID_PACK');
  assertIdentity(pack.identity,identity);
  const {packId,createdAt,...body}=pack;
  if(body.schemaVersion!==1 || body.version!==1 || !['TRAINING','EVALUATION'].includes(body.purpose) || packId!==hashId('EP',body) || !date(createdAt) || !body.mirrorSeats) fail('INVALID_PACK');
  labConfig({botA:'control',botB:'tempo',gameCount:body.sampleSize,seed:body.provenance?.baseSeed,profileId:body.profileId,kind:'EVALUATION',seedCatalog:body.seeds});
  return freeze(structuredClone(pack));
}
export function createBaselineSuite(identity,createdAt='2026-10-02T00:00:00.000Z') {
  const checkpoints=FROZEN_POLICIES.map(policyId=>createCheckpoint({policyId,identity,agentId:`CORE-BASELINE-V1:${policyId}`,createdAt}));
  const body={schemaVersion:1,name:'Core Baseline Suite v1',version:1,identity:structuredClone(identity),checkpoints};
  return validateSuite({...body,suiteId:hashId('ES',body)},identity);
}
export function validateSuite(suite,identity) {
  if(!suite) fail('INVALID_SUITE');assertIdentity(suite.identity,identity);
  const {suiteId,...body}=suite;
  if(body.schemaVersion!==1 || typeof body.name!=='string' || !Array.isArray(body.checkpoints) || body.checkpoints.length<1 || body.checkpoints.length>8 || suiteId!==hashId('ES',body)) fail('INVALID_SUITE');
  body.checkpoints.forEach(cp=>validateCheckpoint(cp,identity));
  if(new Set(body.checkpoints.map(cp=>cp.checkpointId)).size!==body.checkpoints.length) fail('DUPLICATE_SUITE_OPPONENT');
  return freeze(structuredClone(suite));
}

export function scientificConfig({config,startingCheckpoints=[],seedPackId=null,evaluationSuiteId=null,training=null}) {
  const {workerCount:_workerCount,...canonical}=labConfig(config);
  return {config:canonical,startingCheckpointIds:startingCheckpoints.map(cp=>cp.checkpointId),policyIdentities:startingCheckpoints.map(cp=>({policyId:cp.policyId,policyImplementationHash:cp.policyImplementationHash})),seedPackId,evaluationSuiteId,training:structuredClone(training)};
}
export function createExperiment({identity,name='Untitled experiment',hypothesis='',description='',type='POLICY_COMPARISON',config,startingCheckpoints=[],seedPackId=null,evaluationSuiteId=null,training=null,createdAt=new Date().toISOString(),parentExperimentId=null,changes=[]}) {
  assertIdentity(identity);startingCheckpoints.forEach(cp=>validateCheckpoint(cp,identity));
  const scientific=scientificConfig({config,startingCheckpoints,seedPackId,evaluationSuiteId,training});
  const scientificId=hashId('SCI',{type,identity,scientific});
  const experiment={schemaVersion:1,experimentId:hashId('EX',{scientificId,name,parentExperimentId}),scientificId,name,hypothesis,description,type,identity:structuredClone(identity),scientific,
    operational:{workerCount:labConfig(config).workerCount},createdAt,parentExperimentId,changes:structuredClone(changes),status:'IDLE',runIds:[],evaluationIds:[],bookmarks:[],conclusions:''};
  return validateExperiment(experiment,identity);
}
export function validateExperiment(experiment,identity) {
  if(!experiment) fail('INVALID_EXPERIMENT');assertIdentity(experiment.identity,identity);
  const {scientific,type,scientificId,experimentId,name,parentExperimentId}=experiment;
  if(experiment.schemaVersion!==1 || !TYPES.includes(type) || typeof name!=='string' || !name.trim() || name.length>160 || !date(experiment.createdAt) || !scientific || scientificId!==hashId('SCI',{type,identity:experiment.identity,scientific}) || experimentId!==hashId('EX',{scientificId,name,parentExperimentId})) fail('INVALID_EXPERIMENT');
  const normalized=labConfig({...scientific.config,workerCount:experiment.operational?.workerCount});
  const {workerCount:_workerCount,...canonical}=normalized;
  if(!equal(canonical,scientific.config) || !Array.isArray(scientific.startingCheckpointIds) || !Array.isArray(scientific.policyIdentities) || scientific.startingCheckpointIds.length!==scientific.policyIdentities.length || (scientific.policyIdentities.length && (scientific.policyIdentities.length!==2 || scientific.policyIdentities[0].policyId!==canonical.botA || scientific.policyIdentities[1].policyId!==canonical.botB)) || !['IDLE','RUNNING','PAUSED','STOPPED','COMPLETE','ERROR'].includes(experiment.status) || !['runIds','evaluationIds','bookmarks','changes'].every(k=>Array.isArray(experiment[k])) || !['hypothesis','description','conclusions'].every(k=>typeof experiment[k]==='string'&&experiment[k].length<=10000)) fail('INVALID_EXPERIMENT_METADATA');
  return structuredClone(experiment);
}
export function structuredChanges(before,after,path='scientific') {
  if(equal(before,after)) return [];
  if(before && after && typeof before==='object' && typeof after==='object' && !Array.isArray(before)&&!Array.isArray(after)) return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(key=>structuredChanges(before[key]??null,after[key]??null,`${path}.${key}`));
  return [{path,before:structuredClone(before??null),after:structuredClone(after??null)}];
}
export function cloneExperiment(parent,{name=`${parent.name} — clone`,config={},hypothesis=parent.hypothesis,createdAt=new Date().toISOString()}={}) {
  validateExperiment(parent,parent.identity);
  const normalized=labConfig({...parent.scientific.config,workerCount:parent.operational.workerCount,...config});
  const {workerCount,...canonical}=normalized;
  const scientific={...structuredClone(parent.scientific),config:canonical};
  const scientificId=hashId('SCI',{type:parent.type,identity:parent.identity,scientific});
  return validateExperiment({...structuredClone(parent),experimentId:hashId('EX',{scientificId,name,parentExperimentId:parent.experimentId}),scientificId,name,hypothesis,createdAt,parentExperimentId:parent.experimentId,
    scientific,operational:{workerCount},changes:structuredChanges(parent.scientific,scientific),runIds:[],evaluationIds:[],bookmarks:[],conclusions:'',status:'IDLE'},parent.identity);
}

/** Candidate-seat only. Rates count selected legal action families per candidate
 * decision; mechanics count selected actions carrying each canonical tag.
 * Game-level lengths are shared arena context, not attributed causally. */
export function behaviorFingerprint(records,checkpointId) {
  const clean=records.filter(r=>CLEAN_REASONS.includes(r.terminationReason));
  const actions={},mechanics={};let decisions=0,available=0;
  for(const r of clean){const seat=r.checkpointIds.indexOf(checkpointId),b=r.seatBehavior?.[seat];if(!b)continue;available++;decisions+=b.decisions;
    for(const [k,n] of Object.entries(b.actionCounts)) actions[k]=(actions[k]??0)+n;
    for(const [k,n] of Object.entries(b.mechanicCounts)) mechanics[k]=(mechanics[k]??0)+n;}
  const rate=obj=>Object.fromEntries(Object.keys(obj).sort().map(k=>[k,decisions ? obj[k]/decisions : null]));
  return {schemaVersion:1,checkpointId,games:clean.length,availableGames:available,decisions,actionRates:rate(actions),mechanicRates:rate(mechanics),
    meanTurns:clean.length ? clean.reduce((s,r)=>s+r.turns,0)/clean.length : null,meanMiniTurns:clean.length ? clean.reduce((s,r)=>s+r.miniTurns,0)/clean.length : null,
    definition:'Candidate selected family/tag count per candidate decision; mean arena turns/mini-turns. Missing telemetry is unavailable.'};
}
/** Last complete appended attempt per frozen pack/suite; partial attempts stay
 * inspectable in history and never replace a usable comparison result. */
export function completeEvaluation(evaluations,checkpointId,packId,suiteId) {
  return evaluations.findLast(e=>e.candidateCheckpointId===checkpointId && e.packId===packId && e.suiteId===suiteId && e.purpose==='EVALUATION' && e.status==='COMPLETE');
}
export function compareCheckpoints(a,b,evaluations=[],{packs,suite}={}) {
  validateCheckpoint(a,a.identity);validateCheckpoint(b,a.identity);
  const vector=cp=>{
    const out=new Map();
    for(const ev of evaluations.filter(e=>e.candidateCheckpointId===cp.checkpointId)){
      validateEvaluationResult(ev,{candidate:cp,pack:packs?.find(p=>p.packId===ev.packId),suite});
      if(ev.purpose==='EVALUATION'&&ev.status==='COMPLETE')out.set(`${ev.packId}:${ev.suiteId}`,ev);
    }return out;
  };
  const left=vector(a),right=vector(b),matchups=[],selectedEvaluations=[];
  for(const [key,x] of left){const y=right.get(key);if(!y)continue;
    selectedEvaluations.push({packId:x.packId,suiteId:x.suiteId,beforeEvaluationId:x.evaluationId,afterEvaluationId:y.evaluationId,beforeRunIds:x.matchups.map(m=>m.runId),afterRunIds:y.matchups.map(m=>m.runId)});
    for(const m of x.matchups){const n=y.matchups.find(n=>n.opponentCheckpointId===m.opponentCheckpointId);if(!n)continue;
      matchups.push({opponent:m.opponentPolicyId,opponentCheckpointId:m.opponentCheckpointId,packId:x.packId,beforeEvaluationId:x.evaluationId,afterEvaluationId:y.evaluationId,before:m.metrics.pairedScore,after:n.metrics.pairedScore,delta:m.metrics.pairedScore===null||n.metrics.pairedScore===null?null:n.metrics.pairedScore-m.metrics.pairedScore,beforeInterval:m.metrics.pairedScoreInterval95,afterInterval:n.metrics.pairedScoreInterval95,beforeFailures:m.metrics.aborted,afterFailures:n.metrics.aborted,scoreMarginDelta:n.metrics.meanScoreDifference===null||m.metrics.meanScoreDifference===null?null:n.metrics.meanScoreDifference-m.metrics.meanScoreDifference,behaviorChanges:structuredChanges(m.behavior,n.behavior,'behavior').filter(c=>c.path!=='behavior.checkpointId')});
    }
  }
  return {a:a.checkpointId,b:b.checkpointId,identityChanges:structuredChanges(a,b,'checkpoint'),matchups,selectedEvaluations,selectionPolicy:'Latest complete appended EVALUATION attempt per matching pack/suite. No pooling; partial-only evidence is unavailable.',interpretation:matchups.length?'Measured deltas on matching frozen packs/opponents; no universal strength or causal claim.':'No matching complete held-out evaluations; comparison unavailable.'};
}
export function reconstructLineage(checkpoints,checkpointId) {
  const map=new Map(checkpoints.map(cp=>[cp.checkpointId,cp])),out=[],seen=new Set();let cp=map.get(checkpointId);
  if(!cp)fail('CHECKPOINT_NOT_FOUND');
  while(cp){validateCheckpoint(cp,cp.identity);if(seen.has(cp.checkpointId))fail('LINEAGE_CYCLE');seen.add(cp.checkpointId);out.unshift(cp);if(!cp.parentCheckpointId)break;const parent=map.get(cp.parentCheckpointId);if(!parent || parent.lineageId!==cp.lineageId || parent.generation!==cp.generation-1)fail('BROKEN_LINEAGE');cp=parent;}
  return out;
}

export function researchEnvelope(project) {
  validateResearchProject(project,project.experiment.identity);
  return {format:'intrilex-evolution-research',schemaVersion:1,payload:structuredClone(project),contentHash:hashCanonical(project)};
}
export function validateResearchProject(project,identity) {
  if(!project || project.schemaVersion!==1)fail('INVALID_RESEARCH_PROJECT');
  validateExperiment(project.experiment,identity);validateSuite(project.suite,identity);
  if(!['checkpoints','packs','generations','evaluations','faults'].every(k=>Array.isArray(project[k])) || project.checkpoints.length>2000 || project.generations.length>200 || project.evaluations.length>10000 || project.faults.length>1000)fail('RESEARCH_BUDGET_EXCEEDED');
  project.packs.forEach(p=>validateEvaluationPack(p,identity));project.checkpoints.forEach(cp=>validateCheckpoint(cp,identity));
  if(new Set(project.checkpoints.map(cp=>cp.checkpointId)).size!==project.checkpoints.length)fail('DUPLICATE_CHECKPOINT');
  const ids=new Set(project.checkpoints.map(cp=>cp.checkpointId));
  for(const cp of project.checkpoints)if(cp.parentCheckpointId)reconstructLineage(project.checkpoints,cp.checkpointId);
  const packIds=new Set(project.packs.map(p=>p.packId));
  if(packIds.size!==project.packs.length||project.packs.length>8)fail('INVALID_PACK_REFERENCES');
  const science=project.experiment.scientific;
  if(science.seedPackId!==null && !packIds.has(science.seedPackId) || science.evaluationSuiteId!==null && science.evaluationSuiteId!==project.suite.suiteId || science.startingCheckpointIds.some(id=>!ids.has(id)) || project.packs.some(p=>p.profileId!==science.config.profileId))fail('EXPERIMENT_REFERENCE_MISMATCH');
  if(project.experiment.type==='EVOLUTION_TRAINING'){
    const training=project.packs.filter(p=>p.purpose==='TRAINING'),held=project.packs.filter(p=>p.purpose==='EVALUATION');
    if(training.length!==1||held.length!==1||training[0].packId!==science.seedPackId||training[0].sampleSize!==science.training?.trainingPairs*2||held[0].sampleSize!==science.training?.evaluationPairs*2||training[0].seeds.some(seed=>held[0].seeds.includes(seed)))fail('INVALID_TRAINING_PACKS');
  }
  for(let i=0;i<science.startingCheckpointIds.length;i++){
    const cp=project.checkpoints.find(cp=>cp.checkpointId===science.startingCheckpointIds[i]);
    if(cp.policyId!==science.policyIdentities[i].policyId || cp.policyImplementationHash!==science.policyIdentities[i].policyImplementationHash)fail('EXPERIMENT_CHECKPOINT_MISMATCH');
  }
  const runIds=new Set(project.experiment.runIds),evaluationIds=new Set(project.experiment.evaluationIds);
  if(runIds.size!==project.experiment.runIds.length || evaluationIds.size!==project.experiment.evaluationIds.length || [...runIds].some(id=>!/^EL-[a-f0-9]{24}$/.test(id)))fail('INVALID_EXECUTION_REFERENCES');
  for(const ev of project.evaluations){
    validateEvaluationResult(ev,{candidate:project.checkpoints.find(cp=>cp.checkpointId===ev.candidateCheckpointId),pack:project.packs.find(p=>p.packId===ev.packId),suite:project.suite,runIds});
    if(!ids.has(ev.candidateCheckpointId)||!packIds.has(ev.packId)||!evaluationIds.has(ev.evaluationId))fail('INVALID_EVALUATION_REFERENCE');
  }
  if([...evaluationIds].some(id=>!project.evaluations.some(e=>e.evaluationId===id)))fail('INVALID_EVALUATION_REFERENCE');
  const generations=new Set(),lastByLineage=new Map();
  for(const generation of project.generations){
    const {generationId,elapsedMs:_elapsedMs,...semantic}=generation;
    if(generationId!==hashId('EG',semantic) || !ids.has(generation.parentCheckpointId) || !ids.has(generation.selectedCheckpointId) || generation.candidateCheckpointIds.some(id=>!ids.has(id)) || generations.has(`${generation.lineageId}:${generation.generation}`))fail('INVALID_GENERATION');
    const child=project.checkpoints.find(cp=>cp.checkpointId===generation.selectedCheckpointId);
    if(child.parentCheckpointId!==generation.parentCheckpointId || child.lineageId!==generation.lineageId || child.generation!==generation.generation)fail('GENERATION_ANCESTRY_MISMATCH');
    const previous=lastByLineage.get(generation.lineageId);
    if(generation.generation!==(previous?.generation??0)+1 || previous && generation.parentCheckpointId!==previous.selectedCheckpointId || !generation.candidateCheckpointIds.includes(generation.parentCheckpointId) || !packIds.has(generation.trainingPackId) || !packIds.has(generation.evaluationPackId) || generation.candidateEvaluationIds.length!==generation.candidateCheckpointIds.length || generation.candidateEvaluationIds.some((id,index)=>!project.evaluations.some(e=>e.evaluationId===id && e.purpose==='TRAINING' && e.packId===generation.trainingPackId && e.candidateCheckpointId===generation.candidateCheckpointIds[index])) || project.packs.find(p=>p.packId===generation.trainingPackId)?.purpose!=='TRAINING' || project.packs.find(p=>p.packId===generation.evaluationPackId)?.purpose!=='EVALUATION')fail('GENERATION_HISTORY_MISMATCH');
    const scored=generation.candidateEvaluationIds.map((id,index)=>({index,checkpointId:generation.candidateCheckpointIds[index],result:project.evaluations.find(e=>e.evaluationId===id)}));
    const admitted=scored.filter(r=>r.result.status==='COMPLETE'&&r.result.matchups.every(m=>m.metrics.aborted===0&&m.metrics.unresolved===0&&m.metrics.pairedScore!==null));
    const ranking=admitted.map(r=>({index:r.index,checkpointId:r.checkpointId,fitness:r.result.matchups.reduce((a,m)=>a+m.metrics.pairedScore,0)/r.result.matchups.length})).sort((a,b)=>b.fitness-a.fitness||a.index-b.index);
    const disqualified=scored.filter(r=>!admitted.includes(r)).map(r=>({checkpointId:r.checkpointId,reason:'INCOMPLETE_OR_FAILED_SELECTION_EVIDENCE'}));
    if(!ranking.length||!equal(ranking,generation.selection?.ranking)||!equal(disqualified,generation.selection?.disqualified)||child.experimentId!==project.experiment.experimentId||!equal(child.trainingConfiguration,science.training))fail('GENERATION_SELECTION_MISMATCH');
    const chosen=project.checkpoints.find(cp=>cp.checkpointId===ranking[0].checkpointId);
    if(child.checkpointId!==chosen.checkpointId && (chosen.checkpointId!==generation.parentCheckpointId||child.mutation?.kind!=='RETAIN_PARENT'||child.mutation.sourceCheckpointId!==chosen.checkpointId||!equal(child.policyState,chosen.policyState)))fail('GENERATION_SELECTION_MISMATCH');
    generations.add(`${generation.lineageId}:${generation.generation}`);lastByLineage.set(generation.lineageId,generation);
  }
  if(project.regressions!==undefined&&!Array.isArray(project.regressions))fail('INVALID_REGRESSION');
  const findingIds=new Set();
  for(const r of project.regressions??[]){
    const {findingId,...body}=r,after=project.evaluations.find(e=>e.evaluationId===r.evaluationId),before=project.evaluations.find(e=>e.evaluationId===r.referenceEvaluationId);
    const m=after?.matchups.find(m=>m.opponentCheckpointId===r.opponentCheckpointId),n=before?.matchups.find(m=>m.opponentCheckpointId===r.opponentCheckpointId);
    if(findingId!==hashId('RG',body)||findingIds.has(findingId)||r.kind!=='MATCHUP_REGRESSION'||!after||!before||after.purpose!=='EVALUATION'||before.purpose!=='EVALUATION'||after.status!=='COMPLETE'||before.status!=='COMPLETE'||after.candidateCheckpointId!==r.checkpointId||before.candidateCheckpointId!==r.referenceCheckpointId||after.packId!==r.packId||before.packId!==r.packId||!m||!n||m.metrics.pairedScore===null||n.metrics.pairedScore===null||!near(r.delta,m.metrics.pairedScore-n.metrics.pairedScore)||!rate(r.threshold)||!(r.delta < -r.threshold)||r.opponent!==m.opponentPolicyId||r.uncertainty!==m.metrics.uncertainty)fail('INVALID_REGRESSION');
    findingIds.add(findingId);
  }
  const restored=structuredClone(project);restored.checkpoints=restored.checkpoints.map(cp=>validateCheckpoint(cp,identity));return restored;
}
export function parseResearchImport(text,identity) {
  if(new TextEncoder().encode(text).byteLength>40*1024*1024)fail('IMPORT_TOO_LARGE');
  const envelope=JSON.parse(text);
  if(envelope.format!=='intrilex-evolution-research' || envelope.schemaVersion!==1 || envelope.contentHash!==hashCanonical(envelope.payload))fail('RESEARCH_HASH_MISMATCH');
  const project=validateResearchProject(envelope.payload,identity);project.evidenceOrigin='IMPORTED_UNVERIFIED';
  if(project.experiment.status==='RUNNING')project.experiment.status='PAUSED';
  return project;
}

const integer=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const rate=n=>finite(n)&&n>=0&&n<=1;
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<1e-9;
const countMap=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(integer);
export function evaluationSemanticId(ev){
  const {evaluationId:_id,matchups,...rest}=ev;
  return hashId('EV',{...rest,matchups:matchups.map(({runId:_runId,...m})=>m)});
}
export function validateMatchupMetrics(m,sampleSize){
  const counts=['games','clean','winsA','winsB','draws','aborted','unresolved','pairCount'];
  if(!m || !counts.every(k=>integer(m[k])) || m.games>sampleSize || m.clean+m.aborted!==m.games || m.winsA+m.winsB+m.draws+m.unresolved!==m.clean || m.pairCount>Math.floor(m.clean/2) || !countMap(m.actionCounts)||!countMap(m.abortReasons)||Object.values(m.abortReasons).reduce((a,b)=>a+b,0)!==m.aborted)fail('INVALID_EVALUATION_METRICS');
  for(const [key,numerator] of [['winRateA',m.winsA],['winRateB',m.winsB],['scoreRateA',m.winsA+m.draws/2]])if(m.clean?!near(m[key],numerator/m.clean):m[key]!==null)fail('INVALID_EVALUATION_RATE');
  if(m.clean?!rate(m.firstPlayerWinRate):m.firstPlayerWinRate!==null)fail('INVALID_EVALUATION_RATE');
  for(const key of ['meanScoreDifference','medianScoreDifference','meanTurns','meanMiniTurns','meanDecisions'])if(m.clean?(!finite(m[key]) || (!key.includes('ScoreDifference')&&m[key]<0)):m[key]!==null)fail('INVALID_EVALUATION_METRICS');
  if(m.clean>1?(!finite(m.scoreVariance)||m.scoreVariance<0):m.scoreVariance!==null)fail('INVALID_EVALUATION_METRICS');
  if(m.pairCount){const ci=m.pairedScoreInterval95,radius=Math.sqrt(Math.log(40)/(2*m.pairCount));if(!rate(m.pairedScore)||!Array.isArray(ci)||ci.length!==2||!ci.every(rate)||!near(ci[0],Math.max(0,m.pairedScore-radius))||!near(ci[1],Math.min(1,m.pairedScore+radius)))fail('INVALID_EVALUATION_UNCERTAINTY');}
  else if(m.pairedScore!==null||m.pairedScoreInterval95!==null)fail('INVALID_EVALUATION_UNCERTAINTY');
  if(m.uncertainty!==(m.pairCount<100?'SMALL_SAMPLE':'BOUNDED_ESTIMATE') || (m.clean===m.games&&m.games%2===0&&m.pairCount!==m.games/2))fail('INVALID_EVALUATION_METRICS');
  return m;
}
export function validateEvaluationResult(ev,{candidate,pack,suite,runIds}={}){
  if(!ev || ev.schemaVersion!==1 || !['TRAINING','EVALUATION'].includes(ev.purpose)||!['COMPLETE','STOPPED','ERROR'].includes(ev.status)||!Array.isArray(ev.matchups)||ev.matchups.length>8||ev.evaluationId!==evaluationSemanticId(ev))fail('INVALID_EVALUATION');
  if(candidate&&ev.candidateCheckpointId!==candidate.checkpointId || pack&&(ev.packId!==pack.packId||ev.purpose!==pack.purpose) || suite&&ev.suiteId!==suite.suiteId)fail('INVALID_EVALUATION_REFERENCE');
  const seen=new Set(),executions=new Set();
  for(const [index,m] of ev.matchups.entries()){
    const opponent=suite?.checkpoints[index];
    if(seen.has(m.opponentCheckpointId)||executions.has(m.runId)||!/^CP(?:2)?-[a-f0-9]{64}$/.test(m.opponentCheckpointId)||typeof m.opponentPolicyId!=='string'||suite&&!opponent||opponent&&(m.opponentCheckpointId!==opponent.checkpointId||m.opponentPolicyId!==opponent.policyId)||!['COMPLETE','STOPPED','ERROR'].includes(m.status)||!/^EL-[a-f0-9]{24}$/.test(m.runId)||runIds&&!runIds.has(m.runId)||! /^[a-f0-9]{64}$/.test(m.semanticEvidenceHash))fail('INVALID_MATCHUP_REFERENCE');
    seen.add(m.opponentCheckpointId);executions.add(m.runId);validateMatchupMetrics(m.metrics,pack?.sampleSize??10000);
    if(m.status==='COMPLETE' && (pack&&m.metrics.games!==pack.sampleSize || m.metrics.games%2!==0))fail('INCOMPLETE_MATCHUP');
    const b=m.behavior;
    if(!b||b.schemaVersion!==1||b.checkpointId!==ev.candidateCheckpointId||b.games!==m.metrics.clean||!integer(b.availableGames)||b.availableGames>b.games||!integer(b.decisions)||typeof b.definition!=='string')fail('INVALID_BEHAVIOR');
    for(const key of ['actionRates','mechanicRates'])if(!b[key]||typeof b[key]!=='object'||Array.isArray(b[key])||!Object.values(b[key]).every(v=>b.decisions?rate(v):v===null))fail('INVALID_BEHAVIOR');
    if(b.decisions&&Object.values(b.actionRates).length&&!near(Object.values(b.actionRates).reduce((a,c)=>a+c,0),1))fail('INVALID_BEHAVIOR');
    if(b.meanTurns!==m.metrics.meanTurns||b.meanMiniTurns!==m.metrics.meanMiniTurns)fail('INVALID_BEHAVIOR');
  }
  if(ev.status==='COMPLETE' && (!ev.matchups.length||ev.matchups.some(m=>m.status!=='COMPLETE')||suite&&ev.matchups.length!==suite.checkpoints.length))fail('INCOMPLETE_EVALUATION');
  return ev;
}
/** Archive inspection never admits execution or rewrites an older artifact. */
export function inspectResearchArtifact(input){
  const text=typeof input==='string'?input:JSON.stringify(input);
  if(new TextEncoder().encode(text).byteLength>40*1024*1024)fail('IMPORT_TOO_LARGE');
  const envelope=JSON.parse(text),p=envelope.payload;
  if(envelope.format!=='intrilex-evolution-research'||envelope.schemaVersion!==1||envelope.contentHash!==hashCanonical(p))fail('RESEARCH_HASH_MISMATCH');
  validateExperiment(p.experiment,p.experiment.identity);validateSuite(p.suite,p.experiment.identity);
  if(!Array.isArray(p.checkpoints)||p.checkpoints.length>2000)fail('INVALID_RESEARCH_PROJECT');
  p.checkpoints.forEach(cp=>validateCheckpoint(cp,p.experiment.identity));
  let contractDiagnostic=null;try{validateResearchProject(p,p.experiment.identity);}catch(error){contractDiagnostic=error.message;}
  return freeze({artifact:envelope,identity:p.experiment.identity,checkpointIds:p.checkpoints.map(cp=>cp.checkpointId),executionAdmitted:false,evidenceOrigin:'IMPORTED_UNVERIFIED',contractDiagnostic});
}

/** Semantic result IDs exclude execution IDs; distinct attempts remain history. */
export function recordEvaluation(project,result){
  validateEvaluationResult(result,{candidate:project.checkpoints.find(cp=>cp.checkpointId===result.candidateCheckpointId),pack:project.packs.find(p=>p.packId===result.packId),suite:project.suite,runIds:new Set(project.experiment.runIds)});
  if(!project.evaluations.some(e=>equal(e,result)))project.evaluations.push(result);
  if(!project.experiment.evaluationIds.includes(result.evaluationId))project.experiment.evaluationIds.push(result.evaluationId);
}

export function behaviorDeltas(before,after){
  if(!before?.availableGames||!after?.availableGames||!before.decisions||!after.decisions)return {available:false,reason:'Candidate telemetry unavailable',metrics:[]};
  const metrics=[];
  for(const category of ['actionRates','mechanicRates'])for(const key of new Set([...Object.keys(before[category]),...Object.keys(after[category])])){
    const a=before[category][key]??0,b=after[category][key]??0;metrics.push({category,key,before:a,after:b,delta:b-a});
  }
  metrics.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.category.localeCompare(b.category)||a.key.localeCompare(b.key));
  return {available:true,beforeGames:before.availableGames,afterGames:after.availableGames,beforeDecisions:before.decisions,afterDecisions:after.decisions,metrics,definition:'Selected family/tag frequency per candidate decision; absent observed categories are zero. Matching frozen opponent/pack only.'};
}
