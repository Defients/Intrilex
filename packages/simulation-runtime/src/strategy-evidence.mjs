import { STRATEGY_CONTRACTS, sealStrategy, verifyStrategy, strategyDigest, validateDecisionEvent, CLEAN_ENDINGS, strategyFail } from './strategy-contracts.mjs';

import { validateInformationSet, validateInformationStudy } from './strategy-information.mjs';

export function classifyStrategySource(run) {
  const records=run.records ?? [];
  const full=records.filter(r=>Array.isArray(r.strategyDecisions)).length;
  const partial=records.filter(r=>!r.strategyDecisions && r.seatBehavior?.some(s=>s.actionCoverage)).length;
  return { fidelity:full===records.length && full>0 ? 'FULL_DECISION_EVIDENCE' : full>0 || partial>0 ? 'PARTIAL_OBSERVATIONAL_EVIDENCE' : 'SUMMARY_ONLY',
    fullGames:full,aggregateGames:partial,summaryGames:records.length-full-partial,
    historical:false,origin:run.evidenceOrigin ?? 'LOCAL',
    caveat: 'Historical aggregates never acquire decision context. Skipped opportunity is not proof of deliberate holding.' };
}
/** One immutable, game-sized ingestion unit. Never promote aggregate data. */
export function strategyGameEvidence(run, record) {
  const events=record.strategyDecisions ?? [];
  for(const e of events) {
    validateDecisionEvent(e);
    if(e.identity.fingerprint!==run.identity.fingerprint || e.identity.rulesProfile!==run.config.profileId || e.identity.runId!==run.runId || e.identity.gameOrdinal!==record.ordinal) strategyFail('STRATEGY_SOURCE_MISMATCH');
  }
  const replay=run.replays?.find(r=>r.ordinal===record.ordinal||r.replayId===record.replayId)?.replay ?? null;
  const replayHash=replay ? strategyDigest({initialState:replay.initialState,commands:replay.commands}) : null;
  if(replay && (strategyDigest(replay.initialState)!==record.initialStateHash || strategyDigest(replay.commands)!==record.actionSequenceHash)) strategyFail('STRATEGY_REPLAY_SOURCE_MISMATCH');
  return sealStrategy(STRATEGY_CONTRACTS.evidence, {
    source:{runId:run.runId,ordinal:record.ordinal,resultHash:record.resultHash,fingerprint:run.identity.fingerprint,rulesProfile:run.config.profileId,eraId:events[0]?.identity.eraId ?? run.identity.fingerprint,
      purpose:run.researchPurpose ?? run.kind,origin:run.evidenceOrigin ?? 'LOCAL',createdAt:run.createdAt},
    fidelity:events.length ? 'FULL_DECISION_EVIDENCE' : record.seatBehavior?.some(s=>s.actionCoverage) ? 'PARTIAL_OBSERVATIONAL_EVIDENCE' : 'SUMMARY_ONLY',
    clean:CLEAN_ENDINGS.includes(record.terminationReason) && ['P1','P2','DRAW'].includes(record.winner),
    events, aggregates:events.length ? [] : record.seatBehavior ?? [], replayHash,
    checkpoints:run.checkpoints, identity:run.identity,
    summary:{winner:record.winner,terminationReason:record.terminationReason,decisions:record.decisions,seed:record.seed,swapped:record.swapped} });
}
export function validateStrategyEvidence(evidence) {
  verifyStrategy(evidence,STRATEGY_CONTRACTS.evidence);
  const keys=['source','fidelity','clean','events','aggregates','replayHash','checkpoints','identity','summary','contract','artifactId'];
  if(Object.keys(evidence).sort().join('|')!==keys.sort().join('|'))strategyFail('STRATEGY_EVIDENCE_SCHEMA');
  const s=evidence.source,sourceKeys=['runId','ordinal','resultHash','fingerprint','rulesProfile','eraId','purpose','origin','createdAt'];
  if(!s||Object.keys(s).sort().join('|')!==sourceKeys.sort().join('|')||!Number.isSafeInteger(s.ordinal)||s.ordinal<0||sourceKeys.filter(k=>k!=='ordinal').some(k=>typeof s[k]!=='string')||['runId','resultHash','fingerprint','rulesProfile','eraId','purpose','origin'].some(k=>!s[k])||typeof evidence.clean!=='boolean'||!Array.isArray(evidence.aggregates)||!evidence.identity||!evidence.summary||evidence.replayHash!==null&&!/^[a-f0-9]{64}$/.test(evidence.replayHash))strategyFail('STRATEGY_EVIDENCE_SCHEMA');
  if(!Array.isArray(evidence.events)||!Array.isArray(evidence.checkpoints)||new Set(evidence.events.map(e=>e.artifactId)).size!==evidence.events.length)strategyFail('STRATEGY_EVIDENCE_SCHEMA');
  if(evidence.checkpoints.some(c=>!c||typeof c.checkpointId!=='string'||!c.checkpointId)||evidence.identity.fingerprint!==s.fingerprint)strategyFail('STRATEGY_EVIDENCE_SCHEMA');
  for(const event of evidence.events) {
    validateDecisionEvent(event);
    if(event.identity.runId!==evidence.source.runId || event.identity.gameOrdinal!==evidence.source.ordinal || event.identity.fingerprint!==evidence.source.fingerprint || event.identity.rulesProfile!==evidence.source.rulesProfile || event.identity.eraId!==evidence.source.eraId || event.outcomes.clean!==evidence.clean) strategyFail('STRATEGY_SOURCE_MISMATCH');
  }
  if(!['FULL_DECISION_EVIDENCE','PARTIAL_OBSERVATIONAL_EVIDENCE','SUMMARY_ONLY'].includes(evidence.fidelity)) strategyFail('STRATEGY_FIDELITY_INVALID');
  if(evidence.fidelity==='FULL_DECISION_EVIDENCE'&&!evidence.events.length||evidence.fidelity==='SUMMARY_ONLY'&&evidence.events.length)strategyFail('STRATEGY_FIDELITY_INVALID');
  return evidence;
}
const evidenceBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
/** Split an oversized game envelope into sealed chunk envelopes of the same
 * STRATEGY_EVIDENCE_V1 contract. Every chunk is independently valid, carries
 * only fields the parent carried, deduplicates by artifactId on re-ingest,
 * and shares the parent's replay/checkpoint provenance. Chunks are a storage
 * concern — no scientific fields are added or removed. */
export function chunkStrategyEvidence(evidence,maxBytes=8*1024*1024) {
  validateStrategyEvidence(evidence);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024)strategyFail('STRATEGY_CHUNK_BUDGET_INVALID');
  if(evidenceBytes(evidence)<=maxBytes)return [evidence];
  if(!evidence.events.length)strategyFail('STRATEGY_EVIDENCE_CHUNK_BUDGET');
  const {artifactId:_id,...body}=evidence,overhead=evidenceBytes({...body,events:[]});
  const groups=[];let batch=[],size=overhead;
  for(const event of evidence.events) {
    // +1 accounts for the array separator so the emitted chunk never exceeds
    // the declared chunk budget.
    const n=evidenceBytes(event)+1;
    if(overhead+n>maxBytes)strategyFail('STRATEGY_EVENT_STORAGE_BUDGET');
    if(size+n>maxBytes&&batch.length){groups.push(batch);batch=[];size=overhead;}
    batch.push(event);size+=n;
  }
  if(batch.length)groups.push(batch);
  return groups.map(events=>sealStrategy(STRATEGY_CONTRACTS.evidence,{...body,events}));
}
export const strategyScopeKey=(fingerprint,rulesProfile,eraId,subject)=>JSON.stringify([fingerprint,rulesProfile,eraId,subject]);
export function eventIndexRow(event,evidenceId,origin) {
  const subjects=[...new Set(event.candidates.flatMap(c=>c.subjects))];
  const {fingerprint,rulesProfile,eraId,policyId,opponentPolicyId}=event.identity;
  return {eventId:event.artifactId,evidenceId,origin,event,scopeKeys:subjects.map(s=>strategyScopeKey(fingerprint,rulesProfile,eraId,s)),
    policyKey:[fingerprint,rulesProfile,eraId,policyId],matchupKey:[fingerprint,rulesProfile,eraId,opponentPolicyId],maturityKey:[fingerprint,rulesProfile,eraId,event.maturity.bucket]};
}
export function strategyBundle({evidence,replays=[],studies=[],claims=[],importedResearch=[],informationSets=[],informationPlans=[],informationStudies=[],sourceOrigins=evidence.map(e=>({artifactId:e.artifactId,origin:e.source.origin}))}) {
  evidence.forEach(validateStrategyEvidence);
  for(const s of studies)verifyStrategy(s,STRATEGY_CONTRACTS.branch);
  for(const c of claims)verifyStrategy(c,STRATEGY_CONTRACTS.claim);
  for(const archived of importedResearch){if(!['BRANCH','CLAIM','INFORMATION_SET','INFORMATION_PLAN','INFORMATION_STUDY'].includes(archived.kind))strategyFail('STRATEGY_IMPORTED_ARCHIVE_INVALID');verifyStrategy(archived.payload,({BRANCH:STRATEGY_CONTRACTS.branch,CLAIM:STRATEGY_CONTRACTS.claim,INFORMATION_SET:'INFORMATION_SET_V1',INFORMATION_PLAN:'INFORMATION_SET_STUDY_PLAN_V1',INFORMATION_STUDY:'INFORMATION_SET_STUDY_V1'})[archived.kind]);if(archived.origin!=='IMPORTED_UNVERIFIED'||archived.archiveId!==archived.payload.artifactId)strategyFail('STRATEGY_IMPORTED_ARCHIVE_INVALID');}
  if(sourceOrigins.some(row=>!evidence.some(e=>e.artifactId===row.artifactId)||typeof row.origin!=='string')||new Set(sourceOrigins.map(row=>row.artifactId)).size!==sourceOrigins.length)strategyFail('STRATEGY_ORIGIN_MANIFEST_INVALID');
  informationSets.forEach(validateInformationSet);informationPlans.forEach(p=>verifyStrategy(p,'INFORMATION_SET_STUDY_PLAN_V1'));informationStudies.forEach(validateInformationStudy);
  const extended=informationSets.length||informationPlans.length||informationStudies.length||importedResearch.some(a=>a.kind.startsWith('INFORMATION_'));
  return sealStrategy(extended?'STRATEGY_BUNDLE_V2':'STRATEGY_BUNDLE_V1',{evidence,replays,studies,claims,importedResearch,sourceOrigins,...(extended?{informationSets,informationPlans,informationStudies}:{})});
}
export function validateStrategyBundle(bundle) {
  if(!['STRATEGY_BUNDLE_V1','STRATEGY_BUNDLE_V2'].includes(bundle.contract))strategyFail('STRATEGY_BUNDLE_VERSION');verifyStrategy(bundle,bundle.contract);
  if(bundle.contract==='STRATEGY_BUNDLE_V2'&&['informationSets','informationPlans','informationStudies'].some(k=>!Array.isArray(bundle[k])||bundle[k].length>1000))strategyFail('STRATEGY_BUNDLE_SCHEMA');
  if(['evidence','replays','studies','claims','importedResearch','sourceOrigins'].some(key=>!Array.isArray(bundle[key])))strategyFail('STRATEGY_BUNDLE_SCHEMA');
  if(bundle.evidence.length>10000 || bundle.studies.length>1000)strategyFail('STRATEGY_IMPORT_BUDGET');
  const rebuilt=strategyBundle(bundle);
  if(rebuilt.artifactId!==bundle.artifactId)strategyFail('STRATEGY_BUNDLE_FIELDS');
  for(const row of bundle.replays) if(row.replayHash!==strategyDigest({initialState:row.replay.initialState,commands:row.replay.commands}) || !bundle.evidence.some(e=>e.replayHash===row.replayHash))strategyFail('STRATEGY_REPLAY_DIGEST');
  return bundle;
}
