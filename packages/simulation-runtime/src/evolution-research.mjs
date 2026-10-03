import { hashCanonical } from '@intrilex/shared';
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
export function compareCheckpoints(a,b,evaluations=[]) {
  validateCheckpoint(a,a.identity);validateCheckpoint(b,b.identity);
  const vector=cp=>evaluations.filter(e=>e.candidateCheckpointId===cp.checkpointId);
  const left=vector(a),right=vector(b),matchups=[];
  for(const x of left) for(const y of right) if(x.packId===y.packId && x.suiteId===y.suiteId) for(const m of x.matchups){const n=y.matchups.find(n=>n.opponentCheckpointId===m.opponentCheckpointId);if(n)matchups.push({opponent:m.opponentPolicyId,packId:x.packId,before:m.metrics.pairedScore,after:n.metrics.pairedScore,delta:m.metrics.pairedScore===null||n.metrics.pairedScore===null ? null : n.metrics.pairedScore-m.metrics.pairedScore,beforeInterval:m.metrics.pairedScoreInterval95,afterInterval:n.metrics.pairedScoreInterval95,scoreMarginDelta:n.metrics.meanScoreDifference===null||m.metrics.meanScoreDifference===null ? null : n.metrics.meanScoreDifference-m.metrics.meanScoreDifference,behaviorChanges:structuredChanges(m.behavior,n.behavior,'behavior').filter(c=>c.path!=='behavior.checkpointId')});}
  return {a:a.checkpointId,b:b.checkpointId,identityChanges:structuredChanges(a,b,'checkpoint'),matchups,interpretation:'Measured deltas on matching frozen packs/opponents; no universal strength or causal claim.'};
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
  const science=project.experiment.scientific;
  if(science.seedPackId!==null && !packIds.has(science.seedPackId) || science.evaluationSuiteId!==null && science.evaluationSuiteId!==project.suite.suiteId || science.startingCheckpointIds.some(id=>!ids.has(id)) || project.packs.some(p=>p.profileId!==science.config.profileId))fail('EXPERIMENT_REFERENCE_MISMATCH');
  for(let i=0;i<science.startingCheckpointIds.length;i++){
    const cp=project.checkpoints.find(cp=>cp.checkpointId===science.startingCheckpointIds[i]);
    if(cp.policyId!==science.policyIdentities[i].policyId || cp.policyImplementationHash!==science.policyIdentities[i].policyImplementationHash)fail('EXPERIMENT_CHECKPOINT_MISMATCH');
  }
  for(const ev of project.evaluations){
    const {evaluationId,matchups,...rest}=ev;
    const core={...rest,matchups:matchups.map(({runId:_runId,...m})=>m)};
    if(!ids.has(ev.candidateCheckpointId) || !packIds.has(ev.packId) || ev.suiteId!==project.suite.suiteId || evaluationId!==hashId('EV',core))fail('INVALID_EVALUATION_REFERENCE');
  }
  const generations=new Set(),lastByLineage=new Map();
  for(const generation of project.generations){
    const {generationId,elapsedMs:_elapsedMs,...semantic}=generation;
    if(generationId!==hashId('EG',semantic) || !ids.has(generation.parentCheckpointId) || !ids.has(generation.selectedCheckpointId) || generation.candidateCheckpointIds.some(id=>!ids.has(id)) || generations.has(`${generation.lineageId}:${generation.generation}`))fail('INVALID_GENERATION');
    const child=project.checkpoints.find(cp=>cp.checkpointId===generation.selectedCheckpointId);
    if(child.parentCheckpointId!==generation.parentCheckpointId || child.lineageId!==generation.lineageId || child.generation!==generation.generation)fail('GENERATION_ANCESTRY_MISMATCH');
    const previous=lastByLineage.get(generation.lineageId);
    if(generation.generation!==(previous?.generation??0)+1 || previous && generation.parentCheckpointId!==previous.selectedCheckpointId || !generation.candidateCheckpointIds.includes(generation.parentCheckpointId) || !packIds.has(generation.trainingPackId) || !packIds.has(generation.evaluationPackId) || generation.candidateEvaluationIds.some(id=>!project.evaluations.some(e=>e.evaluationId===id && e.purpose==='TRAINING')))fail('GENERATION_HISTORY_MISMATCH');
    generations.add(`${generation.lineageId}:${generation.generation}`);lastByLineage.set(generation.lineageId,generation);
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
