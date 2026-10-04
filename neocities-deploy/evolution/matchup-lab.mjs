import { hashCanonical } from '../shared-browser.js';
import { STATIC_POLICIES, LAB_PROFILES, LAB_LIMITS, labGameSeed, createCheckpoint, validateCheckpoint, summarizeRecords, artifactEnvelope, validateArtifact } from './evolution-domain.mjs';

export const DEFAULT_MATCHUP_POLICIES = Object.freeze(['control-tactical','control-conversion-tactical','tempo-tactical','value-tactical','score-rush-tactical']);

export function matchupConfig({policyIds=DEFAULT_MATCHUP_POLICIES,masterSeeds=[20261003,104729,8675309],gamesPerPairing=100,profileId=LAB_PROFILES[0],workerCount=2,strategicTrace=false}={}) {
  if(!Array.isArray(policyIds)||policyIds.length<2||policyIds.length>8||new Set(policyIds).size!==policyIds.length||policyIds.some(id=>!STATIC_POLICIES.includes(id)))throw new Error('INVALID_MATRIX_POLICIES');
  if(!Array.isArray(masterSeeds)||!masterSeeds.length||masterSeeds.length>16||new Set(masterSeeds).size!==masterSeeds.length||masterSeeds.some(n=>!Number.isInteger(n)||n<1||n>0xffffffff))throw new Error('INVALID_MATRIX_MASTER_SEEDS');
  if(!Number.isInteger(gamesPerPairing)||gamesPerPairing<2||gamesPerPairing>LAB_LIMITS.games||gamesPerPairing%2)throw new Error('MATRIX_REQUIRES_COMPLETE_PAIRS');
  if(!LAB_PROFILES.includes(profileId)||!Number.isInteger(workerCount)||workerCount<1||workerCount>LAB_LIMITS.workers||typeof strategicTrace!=='boolean')throw new Error('INVALID_MATRIX_CONFIG');
  const seedSet=new Set();for(const master of masterSeeds)for(let ordinal=0;ordinal<gamesPerPairing;ordinal+=2){const seed=labGameSeed(master,ordinal);if(seedSet.has(seed))throw new Error('MATRIX_SEED_COLLISION');seedSet.add(seed);}
  return {policyIds:[...policyIds],masterSeeds:[...masterSeeds],gamesPerPairing,profileId,workerCount,strategicTrace};
}

export function createMatchupLab(input,identity,createdAt=new Date().toISOString()) {
  const config=matchupConfig(input),checkpoints=config.policyIds.map(policyId=>createCheckpoint({policyId,identity,agentId:`matrix:${policyId}`,createdAt}));
  const scientific={policyIds:config.policyIds,masterSeeds:config.masterSeeds,gamesPerPairing:config.gamesPerPairing,profileId:config.profileId,strategicTrace:config.strategicTrace,checkpointIds:checkpoints.map(c=>c.checkpointId),identity};
  return {schemaVersion:1,kind:'FROZEN_ROUND_ROBIN',purpose:'EVALUATION',matrixId:`MX-${hashCanonical(scientific)}`,config,identity:structuredClone(identity),checkpoints,runs:[],status:'IDLE',createdAt};
}

/** Node and browser share this plan. No training/update hook or view filter. */
export async function runMatchupLab(input,executeSeries,{identity,signal,onProgress=()=>{},onRun=()=>{},createdAt}={}) {
  const lab=createMatchupLab(input,identity,createdAt),before=hashCanonical(lab.checkpoints);lab.status='RUNNING';
  const c=lab.config,total=c.policyIds.length*(c.policyIds.length-1)/2*c.masterSeeds.length;
  for(let i=0;i<c.policyIds.length;i++)for(let j=i+1;j<c.policyIds.length;j++)for(const seed of c.masterSeeds){
    if(signal?.aborted){lab.status='STOPPED';return lab;}
    const botA=c.policyIds[i],botB=c.policyIds[j];
    const result=await executeSeries({botA,botB,seed,profileId:c.profileId,gameCount:c.gamesPerPairing,workerCount:c.workerCount,mirrorSeats:true,kind:'EVALUATION',strategicTrace:c.strategicTrace},
      {identity,signal,startingCheckpoints:[lab.checkpoints[i],lab.checkpoints[j]],onProgress:p=>onProgress({...p,botA,botB,masterSeed:seed,seriesCompleted:lab.runs.length,seriesTotal:total})});
    if(hashCanonical(lab.checkpoints)!==before)throw new Error('MATRIX_MUTATED_CHECKPOINT');
    validateArtifact(artifactEnvelope(result.run),identity);lab.runs.push(result.run);await onRun(result.run);
    if(result.run.status!=='COMPLETE'){lab.status=result.run.status==='STOPPED'?'STOPPED':'ERROR';return lab;}
  }
  lab.status='COMPLETE';return lab;
}

export function matchupMatrix(lab) {
  if(lab?.schemaVersion!==1||lab.kind!=='FROZEN_ROUND_ROBIN'||lab.purpose!=='EVALUATION'||!['IDLE','RUNNING','STOPPED','ERROR','COMPLETE'].includes(lab.status)||!Number.isFinite(Date.parse(lab.createdAt))||!Array.isArray(lab.runs)||!Array.isArray(lab.checkpoints))throw new Error('INVALID_MATRIX_ARTIFACT');
  const c=matchupConfig(lab.config),cells=[],aggregate=Object.fromEntries(c.policyIds.map(id=>[id,{games:0,clean:0,wins:0,losses:0,draws:0,faults:0,matchups:0}]));
  if(lab.checkpoints.length!==c.policyIds.length||lab.checkpoints.some((cp,i)=>cp.policyId!==c.policyIds[i]||cp.generation!==0))throw new Error('INVALID_MATRIX_CHECKPOINTS');
  const scientific={policyIds:c.policyIds,masterSeeds:c.masterSeeds,gamesPerPairing:c.gamesPerPairing,profileId:c.profileId,strategicTrace:c.strategicTrace,checkpointIds:lab.checkpoints.map(cp=>cp.checkpointId),identity:lab.identity};
  if(lab.matrixId!==`MX-${hashCanonical(scientific)}`)throw new Error('MATRIX_SCIENTIFIC_ID_MISMATCH');
  const seen=new Set();
  for(const cp of lab.checkpoints)validateCheckpoint(cp,lab.identity);
  for(const r of lab.runs){validateArtifact(artifactEnvelope(r),lab.identity);const key=JSON.stringify([r.config.botA,r.config.botB,r.config.seed]);if(seen.has(key))throw new Error('DUPLICATE_MATRIX_SERIES');seen.add(key);
    if(r.config.profileId!==c.profileId||!r.config.mirrorSeats||r.kind!=='EVALUATION'||r.config.gameCount!==c.gamesPerPairing||!c.masterSeeds.includes(r.config.seed)||!c.policyIds.includes(r.config.botA)||!c.policyIds.includes(r.config.botB)||r.config.botA===r.config.botB)throw new Error('INCOMPATIBLE_MATRIX_SERIES');
    if(r.checkpoints.some(cp=>!lab.checkpoints.some(p=>p.checkpointId===cp.checkpointId)))throw new Error('MATRIX_CHECKPOINT_SUBSTITUTION');
  }
  for(let i=0;i<c.policyIds.length;i++)for(let j=i+1;j<c.policyIds.length;j++){
    const botA=c.policyIds[i],botB=c.policyIds[j],runs=lab.runs.filter(r=>r.config.botA===botA&&r.config.botB===botB);
    // Ephemeral ordinal offsets permit complete-pair aggregation across masters;
    // original evidence rows and hashes are never edited or exported as new rows.
    const records=runs.flatMap((r,k)=>r.records.map(row=>({...row,ordinal:row.ordinal+k*c.gamesPerPairing}))),metrics=summarizeRecords(records);
    const terminations=records.reduce((o,r)=>{o[r.terminationReason]=(o[r.terminationReason]??0)+1;return o;},{});
    const seats=[false,true].map(swapped=>{const m=summarizeRecords(records.filter(r=>r.swapped===swapped));return {seat:swapped?'BA':'AB',games:m.clean,winsA:m.winsA,winsB:m.winsB,draws:m.draws};});
    cells.push({botA,botB,metrics,seats,terminations,masters:runs.map(r=>({seed:r.config.seed,runId:r.runId,status:r.status,metrics:summarizeRecords(r.records)})),complete:runs.length===c.masterSeeds.length&&runs.every(r=>r.status==='COMPLETE')});
    for(const [id,wins,losses]of [[botA,metrics.winsA,metrics.winsB],[botB,metrics.winsB,metrics.winsA]]){const a=aggregate[id];a.games+=metrics.games;a.clean+=metrics.clean;a.wins+=wins;a.losses+=losses;a.draws+=metrics.draws;a.faults+=metrics.aborted;if(runs.length)a.matchups++;}
  }
  for(const a of Object.values(aggregate))a.scoreRate=a.clean?(a.wins+a.draws/2)/a.clean:null;
  if(lab.status==='COMPLETE'&&cells.some(c=>!c.complete))throw new Error('INCOMPLETE_MATRIX_CLAIM');
  const fingerprints=Object.fromEntries(c.policyIds.map(id=>[id,{games:0,decisions:0,actionCounts:{},opportunities:{},selected:{},strategicGames:0,scoreOpportunities:0,scoreTaken:0,scoreDeclined:0,deferredConversions:0,conversionDelaySum:0,controlActions:0}]));
  for(const run of lab.runs)for(const r of run.records){if(!['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(r.terminationReason))continue;
    for(const [i,s]of (r.seatBehavior??[]).entries()){const f=fingerprints[r.policyIds[i]];if(!f)continue;f.games++;f.decisions+=s.decisions;for(const [key,n]of Object.entries(s.actionCounts??{}))f.actionCounts[key]=(f.actionCounts[key]??0)+n;
      if(s.actionCoverage?.schemaVersion===1)for(const name of ['opportunities','selected'])for(const [key,n]of Object.entries(s.actionCoverage[name]??{}))f[name][key]=(f[name][key]??0)+n;
      const strategy=r.strategicTelemetry?.seats?.[i];if(strategy?.schemaVersion===1){f.strategicGames++;for(const key of ['scoreOpportunities','scoreTaken','scoreDeclined','deferredConversions','conversionDelaySum','controlActions'])f[key]+=strategy[key];}
    }
  }
  for(const f of Object.values(fingerprints)){f.actionRates=f.decisions?Object.fromEntries(Object.entries(f.actionCounts).map(([k,n])=>[k,n/f.decisions])):null;f.meanConversionDelay=f.deferredConversions?f.conversionDelaySum/f.deferredConversions:null;f.scoreAcceptance=f.strategicGames&&f.scoreOpportunities?f.scoreTaken/f.scoreOpportunities:null;}
  const similarities=[];for(let i=0;i<c.policyIds.length;i++)for(let j=i+1;j<c.policyIds.length;j++){const A=c.policyIds[i],B=c.policyIds[j],a=fingerprints[A].actionRates,b=fingerprints[B].actionRates;similarities.push({A,B,totalVariation:a&&b?[...new Set([...Object.keys(a),...Object.keys(b)])].reduce((sum,k)=>sum+Math.abs((a[k]??0)-(b[k]??0)),0)/2:null});}
  return {matrixId:lab.matrixId,profileId:c.profileId,policyIds:c.policyIds,cells,aggregate,acceptedGames:lab.runs.reduce((n,r)=>n+r.records.length,0),requestedGames:c.policyIds.length*(c.policyIds.length-1)/2*c.masterSeeds.length*c.gamesPerPairing,
    fingerprints,similarities,
    uncertainty:'95% Hoeffding bounds use complete independent seed pairs within each matchup; no independence is assumed across opponents or aggregate archetype records.'};
}

export function matchupArtifact(lab){const payload=structuredClone(lab);return {format:'intrilex-matchup-lab',schemaVersion:1,payload,contentHash:hashCanonical(payload)};}
export function validateMatchupArtifact(envelope){if(envelope?.format!=='intrilex-matchup-lab'||envelope.schemaVersion!==1||envelope.contentHash!==hashCanonical(envelope.payload))throw new Error('MATRIX_ARTIFACT_HASH_MISMATCH');const lab=structuredClone(envelope.payload);matchupMatrix(lab);return lab;}
